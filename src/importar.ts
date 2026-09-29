import * as XLSX from 'xlsx'
import { db, type Cuenta } from './db'

// Solo se leen estas 4 columnas del Excel; el resto se ignora.
const COLUMNAS = {
  niu: ['niu'],
  nombre: ['nombre'],
  medidor: ['medidor'],
  direccion: ['direccion_facturacion', 'direccion', 'dirección'],
} as const

const norm = (s: unknown) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const texto = (v: unknown) => String(v ?? '').trim()

export interface FilaExcel {
  niu: string
  nombre: string
  medidor: string
  direccion: string
}

// Lee solo las 4 columnas que importan, en el orden del archivo. Las filas sin NIU se omiten.
export async function leerFilas(file: File): Promise<{ filas: FilaExcel[]; omitidas: number }> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const hoja = wb.Sheets[wb.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, blankrows: false, defval: '' })

  const encabezado = (filas[0] ?? []).map(norm)
  const idx = (nombres: readonly string[]) => encabezado.findIndex((h) => nombres.includes(h))
  const iNiu = idx(COLUMNAS.niu)
  const iNombre = idx(COLUMNAS.nombre)
  const iMedidor = idx(COLUMNAS.medidor)
  const iDireccion = idx(COLUMNAS.direccion)
  const faltan = [
    iNiu < 0 && 'NIU',
    iNombre < 0 && 'NOMBRE',
    iMedidor < 0 && 'MEDIDOR',
    iDireccion < 0 && 'DIRECCION_FACTURACION',
  ].filter(Boolean)
  if (faltan.length) throw new Error(`Al archivo le faltan las columnas: ${faltan.join(', ')}`)

  const salida: FilaExcel[] = []
  let omitidas = 0
  for (const fila of filas.slice(1)) {
    const niu = texto(fila[iNiu])
    if (!niu) {
      // fila sin NIU (vacía o incompleta): no se puede asociar fotos ni datos
      if (fila.some((c) => texto(c))) omitidas++
      continue
    }
    salida.push({ niu, nombre: texto(fila[iNombre]), medidor: texto(fila[iMedidor]), direccion: texto(fila[iDireccion]) })
  }
  if (!salida.length) throw new Error('No se encontró ninguna cuenta con NIU en el archivo')
  return { filas: salida, omitidas }
}

export interface ResultadoImportacion {
  rutaId: number
  importadas: number
  omitidas: number
}

export async function importarExcel(file: File, nombreRuta: string): Promise<ResultadoImportacion> {
  const { filas, omitidas } = await leerFilas(file)
  const rutaId = await db.transaction('rw', db.rutas, db.cuentas, async () => {
    const id = await db.rutas.add({ nombre: nombreRuta, creada: Date.now() })
    await db.cuentas.bulkAdd(
      filas.map((f, i): Cuenta => ({ ...f, rutaId: id, orden: i, estado: 'normal', nota: '', promedio: '' })),
    )
    return id
  })
  return { rutaId, importadas: filas.length, omitidas }
}
