import Dexie, { type Table } from 'dexie'

export type Estado = 'normal' | 'casa_desocupada' | 'local_desocupado'

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

  constructor() {
    super('mi-ruta')
    this.version(1).stores({
      rutas: '++id',
      cuentas: '++id, rutaId, [rutaId+orden]',
      fotos: '++id, cuentaId, rutaId',
    })
  }
}

export const db = new MiRutaDB()

export async function borrarRuta(rutaId: number) {
  await db.transaction('rw', db.rutas, db.cuentas, db.fotos, async () => {
    await db.fotos.where('rutaId').equals(rutaId).delete()
    await db.cuentas.where('rutaId').equals(rutaId).delete()
    await db.rutas.delete(rutaId)
  })
}
