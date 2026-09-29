import { db, reescribirOrden, type Cuenta } from './db'
import type { FilaExcel } from './importar'

export const DIAS_NUEVO = 15

export interface Diferencia {
  campo: 'nombre' | 'medidor' | 'direccion'
  antes: string
  despues: string
}

export interface Plan {
  rutaId: number
  omitidas: number
  sinCambio: number
  cambios: { cuenta: Cuenta; diffs: Diferencia[] }[]
  nuevas: { cuenta: Cuenta; ubicacion: string }[]
  anuladas: Cuenta[]
  reactivadas: Cuenta[]
  absorbidas: Cuenta[] // agregadas a mano que ahora sí vienen en el listado (dejan de poder eliminarse)
  resultado: Cuenta[] // orden final de la ruta (las nuevas aún sin id)
}

const CAMPOS = ['nombre', 'medidor', 'direccion'] as const

// Compara el Excel nuevo con la ruta (por NIU) sin escribir nada. `cuentas` viene en el orden del usuario.
export function planificar(rutaId: number, cuentas: Cuenta[], filas: FilaExcel[], omitidas: number): Plan {
  // Si un NIU se repite, se emparejan en orden de aparición.
  const cola = new Map<string, Cuenta[]>()
  for (const c of cuentas) cola.set(c.niu, [...(cola.get(c.niu) ?? []), c])

  const porFila: (Cuenta | undefined)[] = []
  const idxNuevas: number[] = []
  const cambios: Plan['cambios'] = []
  const reactivadas: Cuenta[] = []
  const absorbidas: Cuenta[] = []
  let sinCambio = 0

  filas.forEach((f, i) => {
    const c = cola.get(f.niu)?.shift()
    if (!c) return idxNuevas.push(i)
    porFila[i] = c
    // un valor vacío en el Excel no borra lo que ya se tenía
    const diffs = CAMPOS.filter((k) => f[k] && f[k] !== c[k]).map((k) => ({ campo: k, antes: c[k], despues: f[k] }))
    if (c.anulada) reactivadas.push(c)
    if (c.manual) absorbidas.push(c)
    if (diffs.length) cambios.push({ cuenta: c, diffs })
    else if (!c.anulada && !c.manual) sinCambio++
  })

  const anuladas = [...cola.values()].flat().filter((c) => !c.manual && !c.anulada)

  // Los nuevos se insertan junto a su vecino del Excel; el orden del usuario no se toca.
  const resultado = [...cuentas]
  const nuevas: Plan['nuevas'] = []
  const hasta = Date.now() + DIAS_NUEVO * 86400000
  for (const i of idxNuevas) {
    const cuenta: Cuenta = { ...filas[i], rutaId, orden: -1, estado: 'normal', nota: '', promedio: '', nuevoHasta: hasta }
    let pos = resultado.length
    let ubicacion = 'al final de la ruta'
    let j = i - 1
    while (j >= 0 && !porFila[j]) j--
    if (j >= 0) {
      const ancla = porFila[j]!
      pos = resultado.indexOf(ancla) + 1
      ubicacion = `después de ${ancla.nombre || ancla.niu}`
    } else {
      j = i + 1
      while (j < filas.length && !(porFila[j] && resultado.includes(porFila[j]!))) j++
      if (j < filas.length) {
        const ancla = porFila[j]!
        pos = resultado.indexOf(ancla)
        ubicacion = `antes de ${ancla.nombre || ancla.niu}`
      }
    }
    resultado.splice(pos, 0, cuenta)
    porFila[i] = cuenta
    nuevas.push({ cuenta, ubicacion })
  }

  return { rutaId, omitidas, sinCambio, cambios, nuevas, anuladas, reactivadas, absorbidas, resultado }
}

export async function aplicarPlan(plan: Plan) {
  await db.transaction('rw', db.cuentas, db.copias, async () => {
    const previas = await db.cuentas.where('rutaId').equals(plan.rutaId).toArray()
    await db.copias.put({ rutaId: plan.rutaId, fecha: Date.now(), cuentas: previas })

    for (const { cuenta, diffs } of plan.cambios) {
      const datos: Partial<Cuenta> = {}
      for (const d of diffs) datos[d.campo] = d.despues
      await db.cuentas.update(cuenta.id!, datos)
    }
    for (const c of plan.anuladas) await db.cuentas.update(c.id!, { anulada: true })
    for (const c of plan.reactivadas) await db.cuentas.update(c.id!, { anulada: undefined })
    // ya vienen en el listado: dejan de ser "agregadas a mano" y no se podrán eliminar
    for (const c of plan.absorbidas) await db.cuentas.update(c.id!, { manual: undefined })
    for (const { cuenta } of plan.nuevas) cuenta.id = await db.cuentas.add(cuenta)
    await reescribirOrden(plan.resultado)
  })
}

// Vuelve la ruta al estado anterior a la última actualización (se pierde lo hecho después).
export async function deshacerActualizacion(rutaId: number) {
  await db.transaction('rw', db.cuentas, db.fotos, db.copias, async () => {
    const copia = await db.copias.get(rutaId)
    if (!copia) return
    const ids = new Set(copia.cuentas.map((c) => c.id))
    for (const c of await db.cuentas.where('rutaId').equals(rutaId).toArray()) {
      if (ids.has(c.id)) continue
      await db.fotos.where('cuentaId').equals(c.id!).delete()
      await db.cuentas.delete(c.id!)
    }
    await db.cuentas.bulkPut(copia.cuentas)
    await db.copias.delete(rutaId)
  })
}
