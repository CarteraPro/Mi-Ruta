import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, borrarRuta } from './db'
import { importarExcel, leerFilas } from './importar'
import { aplicarPlan, deshacerActualizacion, planificar, type Plan } from './actualizar'
import Resumen from './Resumen'
import { bloquear } from './Acceso'
import { exportarRuta } from './exportar'
import { importarRespaldo, infoFotos, leerManifiesto } from './respaldo'
import RespaldoRuta from './RespaldoRuta'
import EarthRuta from './EarthRuta'

const fechaCorta = (t: number) => new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

export default function SelectorRuta({ onElegir }: { onElegir: (id: number) => void }) {
  const rutas = useLiveQuery(async () => {
    const todas = await db.rutas.toArray()
    return Promise.all(
      todas.map(async (r) => ({
        ...r,
        total: await db.cuentas.where('rutaId').equals(r.id!).count(),
        copia: (await db.copias.get(r.id!))?.fecha,
      })),
    )
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const actualizarRef = useRef<HTMLInputElement>(null)
  const rutaAActualizar = useRef<number | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [plan, setPlan] = useState<{ plan: Plan; ruta: string } | null>(null)
  const [respaldo, setRespaldo] = useState<{ id: number; nombre: string } | null>(null)
  const respaldoRef = useRef<HTMLInputElement>(null)
  const [earth, setEarth] = useState<{ id: number; nombre: string } | null>(null)

  const subir = async (file: File | undefined) => {
    if (!file) return
    setError('')
    setAviso('')
    setCargando(true)
    try {
      const nombre = file.name.replace(/\.(xlsx|xls|csv)$/i, '')
      const r = await importarExcel(file, nombre)
      if (r.omitidas) setAviso(`${r.importadas} cuentas cargadas. Se omitieron ${r.omitidas} filas sin NIU.`)
      onElegir(r.rutaId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo')
    } finally {
      setCargando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  // Actualizar una ruta existente con un Excel nuevo: primero se muestra el resumen.
  const revisarActualizacion = async (file: File | undefined) => {
    const rutaId = rutaAActualizar.current
    if (!file || rutaId === null) return
    setError('')
    setAviso('')
    setCargando(true)
    try {
      const { filas, omitidas } = await leerFilas(file)
      const cuentas = await db.cuentas.where('[rutaId+orden]').between([rutaId, 0], [rutaId, Infinity]).toArray()
      const ruta = await db.rutas.get(rutaId)
      setPlan({ plan: planificar(rutaId, cuentas, filas, omitidas), ruta: ruta?.nombre ?? '' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo')
    } finally {
      setCargando(false)
      if (actualizarRef.current) actualizarRef.current.value = ''
    }
  }

  const aplicar = async () => {
    if (!plan) return
    setCargando(true)
    try {
      await aplicarPlan(plan.plan)
      const p = plan.plan
      setAviso(`Ruta actualizada: ${p.nuevas.length} nuevos, ${p.cambios.length} con cambios, ${p.anuladas.length} anulados.`)
      setPlan(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la ruta')
    } finally {
      setCargando(false)
    }
  }

  const deshacer = async (id: number, fecha: number) => {
    if (
      confirm(
        `¿Deshacer el último cambio masivo (actualización con Excel o importación de KML) del ${fechaCorta(fecha)}? La ruta vuelve a como estaba antes; se pierden los cambios hechos después (notas, fotos, orden…).`,
      )
    ) {
      await deshacerActualizacion(id)
      setAviso('Cambio deshecho.')
    }
  }

  const exportar = async (id: number) => {
    setError('')
    try {
      const r = await exportarRuta(id)
      setAviso(`Excel exportado: ${r.archivo} (${r.total} usuarios).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar')
    }
  }

  // Importar un respaldo: se muestra qué trae y, si ya existe una ruta con el mismo nombre, se avisa que se reemplaza.
  const revisarRespaldo = async (file: File | undefined) => {
    if (respaldoRef.current) respaldoRef.current.value = ''
    if (!file) return
    setError('')
    setAviso('')
    setCargando(true)
    try {
      const m = await leerManifiesto(file)
      const existente = (await db.rutas.toArray()).find((r) => r.nombre.trim().toLowerCase() === m.ruta.nombre.trim().toLowerCase())
      let texto = `Respaldo de "${m.ruta.nombre}" (${fechaCorta(m.exportada)}): ${m.cuentas.length} usuarios, ${m.fotos.length ? `${m.fotos.length} fotos` : 'sin fotos'}.\n\n`
      if (existente) {
        const actuales = await infoFotos(existente.id!)
        const total = await db.cuentas.where('rutaId').equals(existente.id!).count()
        texto += `Ya tienes una ruta "${existente.nombre}" (${total} usuarios, ${actuales.n} fotos). Se REEMPLAZARÁ por completo con este respaldo; no se fusionan.`
        if (!m.fotos.length && actuales.n) texto += `\n\n⚠ Este respaldo no trae fotos: se perderán las ${actuales.n} fotos de tu ruta actual.`
      } else {
        texto += 'Se agregará como una ruta nueva.'
      }
      if (!confirm(texto + '\n\n¿Continuar?')) return
      const r = await importarRespaldo(file, m, setAviso)
      setAviso(`Respaldo importado: ${r.cuentas} usuarios${r.fotos ? `, ${r.fotos} fotos` : ''}${r.reemplazada ? ' (reemplazó la ruta anterior)' : ''}.`)
    } catch (e) {
      setAviso('')
      setError(e instanceof Error ? e.message : 'No se pudo importar el respaldo')
    } finally {
      setCargando(false)
    }
  }

  const eliminar = async (id: number, nombre: string) => {
    if (confirm(`¿Eliminar la ruta "${nombre}" con todas sus fotos y datos? No se puede deshacer.`)) {
      await borrarRuta(id)
    }
  }

  return (
    <main className="pantalla centrada">
      <h1 className="logo">Mi ruta</h1>
      <p className="sub">
        {rutas?.length ? '¿Cuál es tu ruta?' : 'Para empezar, carga el archivo Excel de tu ruta.'}
      </p>

      <div className="lista-rutas">
        {rutas?.map((r) => (
          <div key={r.id}>
            <div className="ruta-item">
              <button className="ruta-abrir" onClick={() => onElegir(r.id!)}>
                <strong>{r.nombre}</strong>
                <span>{r.total} cuentas</span>
              </button>
            </div>
            <div className="ruta-acciones">
              <button className="accion" aria-label="Exportar a Excel" disabled={cargando} onClick={() => exportar(r.id!)}>
                ⬇ Excel
              </button>
              <button className="accion" aria-label="Respaldo para otro celular" disabled={cargando} onClick={() => setRespaldo({ id: r.id!, nombre: r.nombre })}>
                📦 Respaldo
              </button>
              <button className="accion" aria-label="Google Earth" disabled={cargando} onClick={() => setEarth({ id: r.id!, nombre: r.nombre })}>
                🌍 Earth
              </button>
              <button
                className="accion"
                aria-label="Actualizar con un Excel nuevo"
                disabled={cargando}
                onClick={() => {
                  rutaAActualizar.current = r.id!
                  actualizarRef.current?.click()
                }}
              >
                🔄 Actualizar
              </button>
              <button className="accion peligro" aria-label="Eliminar ruta" onClick={() => eliminar(r.id!, r.nombre)}>
                🗑
              </button>
            </div>
            {r.copia && (
              <button className="enlace" onClick={() => deshacer(r.id!, r.copia!)}>
                ↩ Deshacer el último cambio masivo del {fechaCorta(r.copia)}
              </button>
            )}
          </div>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(e) => subir(e.target.files?.[0])}
      />
      <input
        ref={actualizarRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(e) => revisarActualizacion(e.target.files?.[0])}
      />
      <input ref={respaldoRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" hidden onChange={(e) => revisarRespaldo(e.target.files?.[0])} />
      <button className="grande primario" disabled={cargando} onClick={() => inputRef.current?.click()}>
        {cargando ? 'Cargando…' : rutas?.length ? '＋ Cargar otra ruta (Excel)' : '📂 Cargar Excel'}
      </button>
      <button className="grande" disabled={cargando} onClick={() => respaldoRef.current?.click()}>
        📥 Importar respaldo de otro celular
      </button>
      <p className="ayuda">
        Solo se leen las columnas NIU, NOMBRE, MEDIDOR y DIRECCION_FACTURACION.
        {rutas?.length ? ' Con 🔄 actualizas una ruta con el Excel nuevo de la empresa sin perder tu orden.' : ''}
      </p>
      {error && <p className="error">{error}</p>}
      {aviso && <p className="aviso">{aviso}</p>}

      <button className="enlace" onClick={bloquear}>
        🔒 Bloquear la app
      </button>

      {respaldo && <RespaldoRuta ruta={respaldo} onCerrar={() => setRespaldo(null)} />}
      {earth && <EarthRuta ruta={earth} onCerrar={() => setEarth(null)} />}

      {plan && <Resumen plan={plan.plan} ruta={plan.ruta} ocupado={cargando} onCancelar={() => setPlan(null)} onAplicar={aplicar} />}
    </main>
  )
}
