import Dexie, { type Table } from 'dexie'

// '' = sin estado (todavía no se ha elegido). Claves fijas: 'normal' (Lectura real), 'casa_desocupada', 'local_desocupado' (Sin acometida ni medidor).
// Los estados creados por el usuario se guardan como `extra:<texto>`.
export type Estado = string

// Botón de estado agregado por el usuario; queda disponible para todas las cuentas.
export interface EstadoExtra {
  id?: number
  texto: string
}
export type Color = 'rojo' | 'naranja' | 'amarillo' | 'verde' | 'azul'

export interface Ruta {
  id?: number
  nombre: string
  creada: number
}

export interface Cuenta {
  id?: number
  rutaId: number
  orden: number
  niu: string
  nombre: string
  medidor: string
  direccion: string
  estado: Estado
  nota: string
  promedio: string
  lat?: number
  lng?: number
  precision?: number
  ubicadoEn?: number
  ubicManual?: boolean // coordenadas escritas a mano (no vienen del GPS)
  color?: Color
  inicioVereda?: string // nombre de la vereda que empieza en esta cuenta
  finVereda?: boolean // esta cuenta es la última de la vereda
  anulada?: boolean // ya no viene en el Excel de la empresa (matrícula anulada)
  nuevoHasta?: number // marca "NUEVO" hasta esta fecha (15 días tras cargarla desde un Excel)
  manual?: boolean // agregada a mano: nunca se anula por no venir en el Excel
}

// Copia de la ruta antes de la última actualización con Excel (para deshacer).
export interface Copia {
  rutaId: number
  fecha: number
  cuentas: Cuenta[]
}

export interface Foto {
  id?: number
  cuentaId: number
  rutaId: number
  blob: Blob
  fecha: number
}

class MiRutaDB extends Dexie {
  rutas!: Table<Ruta, number>
  cuentas!: Table<Cuenta, number>
  fotos!: Table<Foto, number>
  copias!: Table<Copia, number>
  estadosExtra!: Table<EstadoExtra, number>

  constructor() {
    super('mi-ruta')
    this.version(1).stores({
      rutas: '++id',
      cuentas: '++id, rutaId, [rutaId+orden]',
      fotos: '++id, cuentaId, rutaId',
    })
    this.version(2).stores({
      rutas: '++id',
      cuentas: '++id, rutaId, [rutaId+orden]',
      fotos: '++id, cuentaId, rutaId',
      copias: 'rutaId',
    })
    this.version(3).stores({
      rutas: '++id',
      cuentas: '++id, rutaId, [rutaId+orden]',
      fotos: '++id, cuentaId, rutaId',
      copias: 'rutaId',
      estadosExtra: '++id',
    })
    // v4: el estado por defecto pasa a ser "sin estado" ('') hasta que el liniero elija uno. Los usuarios que
    // seguían con el 'normal' de fábrica (sin nota, promedio, ubicación ni fotos) quedan sin estado; los que ya
    // tienen algún trabajo encima conservan "Lectura real".
    this.version(4)
      .stores({
        rutas: '++id',
        cuentas: '++id, rutaId, [rutaId+orden]',
        fotos: '++id, cuentaId, rutaId',
        copias: 'rutaId',
        estadosExtra: '++id',
      })
      .upgrade(async (tx) => {
        const conFoto = new Set<number>()
        await tx.table('fotos').each((f) => conFoto.add(f.cuentaId))
        await tx
          .table('cuentas')
          .toCollection()
          .modify((c: Cuenta) => {
            const sinTrabajo = !c.nota && !c.promedio && c.lat === undefined && !conFoto.has(c.id!)
            if (c.estado === 'normal' && sinTrabajo) c.estado = ''
          })
      })
  }
}

export const db = new MiRutaDB()

export async function borrarRuta(rutaId: number) {
  await db.transaction('rw', db.rutas, db.cuentas, db.fotos, db.copias, async () => {
    await db.copias.delete(rutaId)
    await db.fotos.where('rutaId').equals(rutaId).delete()
    await db.cuentas.where('rutaId').equals(rutaId).delete()
    await db.rutas.delete(rutaId)
  })
}

// Deja `orden` = posición en el arreglo; solo escribe las cuentas que cambiaron.
export async function reescribirOrden(cuentas: Cuenta[]) {
  await Promise.all(cuentas.map((c, i) => (c.orden !== i ? db.cuentas.update(c.id!, { orden: i }) : null)))
}

export async function moverCuenta(cuentas: Cuenta[], desde: number, hasta: number) {
  if (desde === hasta) return
  const arr = [...cuentas]
  arr.splice(hasta, 0, arr.splice(desde, 1)[0])
  await db.transaction('rw', db.cuentas, () => reescribirOrden(arr))
}

export async function agregarCuenta(
  cuentas: Cuenta[],
  rutaId: number,
  despuesDe: number,
  datos: Pick<Cuenta, 'niu' | 'nombre' | 'medidor' | 'direccion'>,
) {
  return db.transaction('rw', db.cuentas, async () => {
    const nueva: Cuenta = { ...datos, rutaId, orden: despuesDe + 1, estado: '', nota: '', promedio: '', manual: true }
    nueva.id = await db.cuentas.add(nueva)
    const arr = [...cuentas]
    arr.splice(despuesDe + 1, 0, nueva)
    await reescribirOrden(arr)
    return nueva.id
  })
}

// Solo se pueden eliminar usuarios que agregó el propio liniero y que no aparecen en ningún listado cargado.
export const puedeEliminar = (c: Cuenta) => !!c.manual

export async function eliminarCuenta(cuentas: Cuenta[], id: number) {
  await db.transaction('rw', db.cuentas, db.fotos, async () => {
    const cuenta = await db.cuentas.get(id)
    if (!cuenta || !puedeEliminar(cuenta)) throw new Error('Este usuario viene del listado y no se puede eliminar')
    await db.fotos.where('cuentaId').equals(id).delete()
    await db.cuentas.delete(id)
    await reescribirOrden(cuentas.filter((c) => c.id !== id))
  })
}
