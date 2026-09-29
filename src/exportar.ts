import * as XLSX from 'xlsx'
import { db } from './db'

// Números puros se guardan como número (como en el Excel de la empresa); con ceros a la izquierda o muy largos, como texto.
const comoCelda = (v: string): string | number => (/^(0|[1-9]\d{0,14})$/.test(v) ? Number(v) : v)

// El operador es el número que trae el nombre de la ruta ("RUTA 25" → 25); si no hay número, el nombre completo.
export const operadorDe = (nombreRuta: string) => {
  const n = nombreRuta.match(/\d+/)
  return n ? Number(n[0]) : nombreRuta
}

// Genera y descarga el Excel con las columnas de la empresa, en el orden actual de la ruta.
export async function exportarRuta(rutaId: number) {
  const ruta = await db.rutas.get(rutaId)
  if (!ruta) throw new Error('No se encontró la ruta')
  const cuentas = await db.cuentas.where('[rutaId+orden]').between([rutaId, 0], [rutaId, Infinity]).toArray()

  const operador = operadorDe(ruta.nombre)
  const filas = [
    ['Operador', 'NIU', 'MEDIDOR', 'NOMBRE', 'DIRECCION_FACTURACION'],
    ...cuentas.map((c) => [operador, comoCelda(c.niu), comoCelda(c.medidor), c.nombre, c.direccion]),
  ]
  const hoja = XLSX.utils.aoa_to_sheet(filas)
  hoja['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 40 }, { wch: 36 }]
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Hoja1')

  const bytes = XLSX.write(libro, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const fecha = new Date().toISOString().slice(0, 10)
  const nombreArchivo = `${ruta.nombre} ${fecha}.xlsx`.replace(/[\\/:*?"<>|]/g, '-')

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
