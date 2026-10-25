import { db, type Cuenta } from './db'
import { aResultado, BACKEND_URL, leerCredenciales, type ResultadoPago } from './pagoOracle'

const MESES_PROMEDIO = 3

export const claveMes = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Se considera consultada si la última consulta de esa cuenta fue en el mes actual.
export const consultadaEsteMes = (c: Cuenta) => !!c.pagoConsulta && claveMes(c.pagoConsulta.consultadoEn) === claveMes(Date.now())

// Cambios que deja una consulta en la cuenta: el resultado, el consumo de este mes en el historial
// (se conservan los 3 meses más recientes) y el promedio de consumo = promedio de esos meses.
export function cambiosDeConsulta(cuenta: Cuenta, pago: ResultadoPago): Partial<Cuenta> {
  const cambios: Partial<Cuenta> = { pagoConsulta: pago }
  if (pago.consumoKwh !== null) {
    const mes = claveMes(pago.consultadoEn)
    const consumos = [...(cuenta.consumos ?? []).filter((x) => x.mes !== mes), { mes, kwh: pago.consumoKwh }]
      .sort((a, b) => b.mes.localeCompare(a.mes))
      .slice(0, MESES_PROMEDIO)
    const prom = consumos.reduce((s, x) => s + x.kwh, 0) / consumos.length
    cambios.consumos = consumos
    cambios.promedio = String(Math.round(prom * 10) / 10)
  }
  return cambios
}

// ---- Consultar toda la ruta (continúa donde quedó: solo consulta a quienes faltan este mes) ----

export interface EstadoConsultaRuta {
  rutaId: number
  texto: string
  errores: number
  cancelando: boolean
}

let estado: EstadoConsultaRuta | null = null
let cancelar: (() => void) | null = null
const oyentes = new Set<() => void>()
const emitir = () => oyentes.forEach((f) => f())

export const estadoConsultaRuta = () => estado
export const suscribirConsultaRuta = (f: () => void) => {
  oyentes.add(f)
  return () => {
    oyentes.delete(f)
  }
}
export const pausarConsultaRuta = () => {
  if (estado) estado = { ...estado, cancelando: true, texto: 'Pausando…' }
  emitir()
  cancelar?.()
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function consultarRuta(rutaId: number, nombre: string) {
  if (estado) return
  const credenciales = await leerCredenciales()
  const pendientes = (await db.cuentas.where('rutaId').equals(rutaId).toArray()).filter((c) => !c.anulada && c.niu && !consultadaEsteMes(c))
  const nius = [...new Set(pendientes.map((c) => c.niu))]
  if (nius.length === 0) return

  let pausar = false
  cancelar = () => {
    pausar = true
  }
  estado = { rutaId, texto: 'Iniciando…', errores: 0, cancelando: false }
  emitir()

  let jobId = ''
  let procesados = 0
  let errores = 0
  const actualizar = (texto: string) => {
    estado = { rutaId, texto, errores, cancelando: pausar }
    emitir()
  }

  // Aplica los resultados nuevos que lleva el servidor (los que ya aplicó antes no se repiten).
  const traerResultados = async () => {
    const r = await (await fetch(`${BACKEND_URL}/api/scan/results/${jobId}`)).json()
    const lista: any[] = r.results ?? []
    for (; procesados < lista.length; procesados++) {
      const item = lista[procesados]
      if (String(item.ultimoPago ?? '').startsWith('ERROR:')) {
        errores++
        continue
      }
      const pago = aResultado(item)
      for (const c of pendientes.filter((x) => x.niu === item.niu)) {
        const actual = await db.cuentas.get(c.id!)
        if (actual) await db.cuentas.update(c.id!, cambiosDeConsulta(actual, pago))
      }
    }
  }

  try {
    const inicio = await (
      await fetch(`${BACKEND_URL}/api/scan/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nius: nius.map((niu) => ({ niu })), ruta: nombre, credenciales, incluirConsumo: true }),
      })
    ).json()
    if (!inicio.ok || !inicio.jobId) throw new Error(inicio.message || 'No se pudo iniciar la consulta')
    jobId = inicio.jobId

    for (;;) {
      if (pausar) {
        await fetch(`${BACKEND_URL}/api/scan/cancel/${jobId}`, { method: 'POST' }).catch(() => {})
        await traerResultados().catch(() => {})
        break
      }
      const s = await (await fetch(`${BACKEND_URL}/api/scan/status/${jobId}`)).json()
      if (!s.status) throw new Error('El servidor perdió esta consulta. Pulsa Continuar para retomarla.')
      if (s.error && s.status === 'error') throw new Error(s.error)
      await traerResultados()
      if (s.status === 'queued') actualizar('En cola, esperando al servidor…')
      else actualizar(`Consultando ${Math.min(procesados, nius.length)} de ${nius.length}…`)
      if (s.status === 'done') {
        await traerResultados()
        break
      }
      await esperar(3000)
    }
    return { total: nius.length, hechas: procesados - errores, errores, pausada: pausar }
  } finally {
    estado = null
    cancelar = null
    emitir()
  }
}
