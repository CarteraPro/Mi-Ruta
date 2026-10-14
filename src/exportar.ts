import * as XLSX from 'xlsx'
import { db, type Cuenta } from './db'
import { coincideNota, terminosDe } from './util'

// Números puros se guardan como número (como en el Excel de la empresa); con ceros a la izquierda o muy largos, como texto.
const comoCelda = (v: string): string | number => (/^(0|[1-9]\d{0,14})$/.test(v) ? Number(v) : v)

// El operador es el número que trae el nombre de la ruta ("RUTA 25" → 25); si no hay número, el nombre completo.
export const operadorDe = (nombreRuta: string) => {
  const n = nombreRuta.match(/\d+/)
  return n ? Number(n[0]) : nombreRuta
}

const cuentasDe = (rutaId: number) => db.cuentas.where('[rutaId+orden]').between([rutaId, 0], [rutaId, Infinity]).toArray()

// Arma el .xlsx y lo descarga. X = longitud y Y = latitud (convención de coordenadas); vacías si no hay ubicación.
function descargarExcel(nombreRuta: string, cuentas: Cuenta[], conNotas: boolean, sufijo: string) {
  const operador = operadorDe(nombreRuta)
  const filas = [
    ['Operador', 'NIU', 'MEDIDOR', 'NOMBRE', 'DIRECCION_FACTURACION', 'X', 'Y', ...(conNotas ? ['NOTAS'] : [])],
    ...cuentas.map((c) => [
      operador,
      comoCelda(c.niu),
      comoCelda(c.medidor),
      c.nombre,
      c.direccion,
      c.lng ?? '',
      c.lat ?? '',
      ...(conNotas ? [c.nota.trim()] : []),
    ]),
  ]
  const hoja = XLSX.utils.aoa_to_sheet(filas)
  hoja['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 40 }, { wch: 36 }, { wch: 14 }, { wch: 14 }, ...(conNotas ? [{ wch: 60 }] : [])]
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Hoja1')

  const bytes = XLSX.write(libro, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const fecha = new Date().toISOString().slice(0, 10)
  const nombreArchivo = `${nombreRuta}${sufijo} ${fecha}.xlsx`.replace(/[\\/:*?"<>|]/g, '-')

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return { archivo: nombreArchivo, total: cuentas.length }
}

// Excel con todos los usuarios de la ruta, en el orden actual.
export async function exportarRuta(rutaId: number) {
  const ruta = await db.rutas.get(rutaId)
  if (!ruta) throw new Error('No se encontró la ruta')
  return descargarExcel(ruta.nombre, await cuentasDe(rutaId), false, '')
}

// Excel solo con los usuarios que tienen notas; si se da una palabra clave, solo las notas que la contienen
// (varias palabras separadas por coma = cualquiera de ellas). Agrega la columna NOTAS.
export async function exportarNotas(rutaId: number, palabra: string) {
  const ruta = await db.rutas.get(rutaId)
  if (!ruta) throw new Error('No se encontró la ruta')
  const terminos = terminosDe(palabra)
  const cuentas = (await cuentasDe(rutaId)).filter((c) => coincideNota(c.nota, terminos))
  if (!cuentas.length) throw new Error(terminos.length ? 'Ningún usuario tiene notas con esa palabra' : 'Ningún usuario tiene notas')
  const etiqueta = palabra.trim() ? ` notas - ${palabra.trim().slice(0, 30)}` : ' notas'
  return descargarExcel(ruta.nombre, cuentas, true, etiqueta)
}
