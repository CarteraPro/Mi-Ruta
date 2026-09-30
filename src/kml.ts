import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate'
import { db, type Cuenta } from './db'
import { textoEstado } from './Estados'

export const UMBRAL_LEJOS_M = 100 // un punto que se mueve más que esto se resalta para revisarlo

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const carpeta = (niu: string) => niu.replace(/[^\w.-]/g, '_') || 'sin_niu'
const pausa = () => new Promise<void>((r) => setTimeout(r))
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const tieneUbic = (c: Cuenta) => typeof c.lat === 'number' && typeof c.lng === 'number'

// Color del usuario → color de KML (aaBBGGRR)
const COLOR_KML: Record<string, string> = {
  rojo: 'ff4444ef',
  naranja: 'ff1674f9',
  amarillo: 'ff08d8fa',
  verde: 'ff5ec722',
  azul: 'fff6823b',
}

// Nombre del punto = NIU. Si el mismo NIU está en varios usuarios, el segundo sale como "NIU (2)", etc.
const nombresPunto = (cuentas: Cuenta[]) => {
  const vistos = new Map<string, number>()
  return cuentas.map((c) => {
    const n = (vistos.get(c.niu) ?? 0) + 1
    vistos.set(c.niu, n)
    return n === 1 ? c.niu : `${c.niu} (${n})`
  })
}

export async function resumenUbicaciones(rutaId: number) {
  const cuentas = await db.cuentas.where('rutaId').equals(rutaId).toArray()
  const fotos = { n: 0, bytes: 0 }
  await db.fotos.where('rutaId').equals(rutaId).each((f) => {
    fotos.n++
    fotos.bytes += f.blob.size
  })
  return { total: cuentas.length, conUbicacion: cuentas.filter(tieneUbic).length, fotos }
}

// Crea el KML (sin fotos) o el KMZ (con fotos) de la ruta: un punto por usuario con ubicación.
export async function crearKml(rutaId: number, conFotos: boolean, onProgreso: (hecho: number, total: number) => void) {
  const ruta = await db.rutas.get(rutaId)
  if (!ruta) throw new Error('No se encontró la ruta')
  const cuentas = await db.cuentas.where('[rutaId+orden]').between([rutaId, 0], [rutaId, Infinity]).toArray()
  const nombres = nombresPunto(cuentas)
  const conPunto = cuentas.map((c, i) => ({ c, nombre: nombres[i] })).filter(({ c }) => tieneUbic(c))
  if (!conPunto.length) throw new Error('Ningún usuario de esta ruta tiene ubicación guardada')

  // fotos de los usuarios que van en el archivo
  const porCuenta = new Map<number, { archivo: string; blob: Blob }[]>()
  if (conFotos) {
    const ids = new Set(conPunto.map(({ c }) => c.id!))
    const cont = new Map<number, number>()
    for (const f of await db.fotos.where('rutaId').equals(rutaId).toArray()) {
      if (!ids.has(f.cuentaId)) continue
      const c = conPunto.find((p) => p.c.id === f.cuentaId)!.c
      const n = (cont.get(c.id!) ?? 0) + 1
      cont.set(c.id!, n)
      const lista = porCuenta.get(c.id!) ?? []
      lista.push({ archivo: `files/${carpeta(c.niu)}/${c.id}-${n}.${EXT[f.blob.type] ?? 'jpg'}`, blob: f.blob })
      porCuenta.set(c.id!, lista)
    }
  }

  const usados = [...new Set(conPunto.map(({ c }) => c.color).filter(Boolean))] as string[]
  const estilos = usados
    .map(
      (col) =>
        `<Style id="u-${col}"><IconStyle><color>${COLOR_KML[col]}</color><scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle></Style>`,
    )
    .join('')

  const puntos = conPunto
    .map(({ c, nombre }) => {
      const filas = [
        ['Nombre', c.nombre],
        ['Medidor', c.medidor],
        ['Dirección', c.direccion],
        ['Estado', textoEstado(c.estado)],
        c.promedio ? ['Promedio', c.promedio] : null,
        c.nota ? ['Notas', c.nota] : null,
        c.anulada ? ['Matrícula', 'ANULADA'] : null,
      ].filter(Boolean) as string[][]
      const fotos = (porCuenta.get(c.id!) ?? []).map((f) => `<br/><img src="${esc(f.archivo)}" width="320"/>`).join('')
      const html = `<b>${esc(c.nombre || '(sin nombre)')}</b><br/>` + filas.map(([k, v]) => `${k}: ${esc(v)}`).join('<br/>') + fotos
      return (
        `<Placemark><name>${esc(nombre)}</name>` +
        `<description><![CDATA[${html}]]></description>` +
        (c.color ? `<styleUrl>#u-${c.color}</styleUrl>` : '') +
        `<ExtendedData><Data name="NIU"><value>${esc(c.niu)}</value></Data><Data name="Medidor"><value>${esc(c.medidor)}</value></Data></ExtendedData>` +
        // KML usa el orden longitud, latitud
        `<Point><coordinates>${c.lng},${c.lat},0</coordinates></Point></Placemark>`
      )
    })
    .join('\n')

  const kml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>${esc(ruta.nombre)}</name>\n${estilos}\n${puntos}\n</Document>\n</kml>\n`

  const fecha = new Date().toISOString().slice(0, 10)
  const base = `${ruta.nombre} ${fecha}`.replace(/[\\/:*?"<>|]/g, '-')
  const totalFotos = [...porCuenta.values()].reduce((s, l) => s + l.length, 0)

  if (!conFotos) {
    const archivo = new File([kml], `${base}.kml`, { type: 'application/vnd.google-earth.kml+xml' })
    return { archivo, puntos: conPunto.length, sinUbicacion: cuentas.length - conPunto.length, fotos: 0 }
  }

  // KMZ = zip con doc.kml + las fotos tal cual (ya vienen comprimidas)
  const partes: Uint8Array[] = []
  let fallo: Error | null = null
  const zip = new Zip((err, chunk) => {
    if (err) fallo = err
    else partes.push(chunk)
  })
  const doc = new ZipDeflate('doc.kml', { level: 6 })
  zip.add(doc)
  doc.push(strToU8(kml), true)
  let hechas = 0
  onProgreso(0, totalFotos)
  for (const lista of porCuenta.values()) {
    for (const f of lista) {
      const entrada = new ZipPassThrough(f.archivo)
      zip.add(entrada)
      entrada.push(new Uint8Array(await f.blob.arrayBuffer()), true)
      if (fallo) throw fallo
      onProgreso(++hechas, totalFotos)
      if (hechas % 5 === 0) await pausa()
    }
  }
  zip.end()
  if (fallo) throw fallo
  const archivo = new File(partes as unknown as BlobPart[], `${base}.kmz`, { type: 'application/vnd.google-earth.kmz' })
  return { archivo, puntos: conPunto.length, sinUbicacion: cuentas.length - conPunto.length, fotos: totalFotos }
}

// ---------- Importar (solo NIU + coordenadas) ----------

export interface PuntoKml {
  nombre: string
  niu: string
  orden: number // 1 = primer usuario con ese NIU, 2 = el segundo…
  lat: number
  lng: number
}

export interface LecturaKml {
  puntos: PuntoKml[]
  invalidos: { nombre: string; motivo: string }[]
  ignorados: number // marcas que no son un punto (líneas, polígonos…)
}

// "205626" → {niu, orden 1}; "205626 (2)" → {niu, orden 2}
const separarNombre = (nombre: string) => {
  const m = nombre.trim().match(/^(.*?)(?:\s*\((\d+)\))?$/)
  return { niu: (m?.[1] ?? nombre).trim(), orden: m?.[2] ? Number(m[2]) : 1 }
}

const hijo = (el: Element, etiqueta: string) => [...el.children].find((h) => h.localName === etiqueta)

export async function leerKml(file: File): Promise<LecturaKml> {
  const doc = new DOMParser().parseFromString(await file.text(), 'text/xml')
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'kml') {
    throw new Error('Este archivo no es un KML válido. Guarda el lugar en Google Earth como "KML", no "KMZ"')
  }
  const puntos: PuntoKml[] = []
  const invalidos: LecturaKml['invalidos'] = []
  let ignorados = 0
  for (const p of [...doc.getElementsByTagName('Placemark')]) {
    const nombre = hijo(p, 'name')?.textContent?.trim() ?? ''
    const punto = [...p.getElementsByTagName('Point')][0]
    if (!punto) {
      ignorados++
      continue
    }
    const crudo = punto.getElementsByTagName('coordinates')[0]?.textContent?.trim() ?? ''
    const [lngTxt, latTxt] = crudo.split(',') // KML: longitud, latitud, altura
    const lng = Number(lngTxt)
    const lat = Number(latTxt)
    if (!nombre) {
      invalidos.push({ nombre: '(sin nombre)', motivo: 'El punto no tiene nombre (NIU)' })
    } else if (!isFinite(lat) || !isFinite(lng) || lngTxt === undefined || latTxt === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) {
      invalidos.push({ nombre, motivo: 'Coordenadas no válidas' })
    } else {
      puntos.push({ nombre, ...separarNombre(nombre), lat, lng })
    }
  }
  return { puntos, invalidos, ignorados }
}

const metros = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export interface Movimiento {
  cuenta: Cuenta
  nombrePunto: string
  antes?: { lat: number; lng: number }
  despues: { lat: number; lng: number }
  metros: number | null // null = no tenía ubicación
}

export interface PlanKml {
  rutaId: number
  movimientos: Movimiento[]
  sinCambio: number
  noEncontrados: { nombre: string; motivo: string }[] // punto cuyo NIU no está en la ruta (no se crean usuarios)
  repetidos: { nombre: string; motivo: string }[] // dos puntos para el mismo usuario: no se aplica ninguno
  invalidos: { nombre: string; motivo: string }[]
  ignorados: number
}

// Compara el KML con la ruta SIN escribir nada. Solo se considera NIU + coordenadas.
export function planificarKml(rutaId: number, cuentas: Cuenta[], lectura: LecturaKml): PlanKml {
  const porNiu = new Map<string, Cuenta[]>()
  for (const c of cuentas) porNiu.set(c.niu, [...(porNiu.get(c.niu) ?? []), c])

  const noEncontrados: PlanKml['noEncontrados'] = []
  const porCuenta = new Map<number, PuntoKml[]>()
  for (const p of lectura.puntos) {
    const candidatos = porNiu.get(p.niu)
    if (!candidatos) {
      noEncontrados.push({ nombre: p.nombre, motivo: 'Ese NIU no está en la ruta' })
      continue
    }
    const cuenta = candidatos[p.orden - 1]
    if (!cuenta) {
      noEncontrados.push({ nombre: p.nombre, motivo: `Ese NIU solo tiene ${candidatos.length} usuario(s) en la ruta` })
      continue
    }
    porCuenta.set(cuenta.id!, [...(porCuenta.get(cuenta.id!) ?? []), p])
  }

  const movimientos: Movimiento[] = []
  const repetidos: PlanKml['repetidos'] = []
  let sinCambio = 0
  for (const c of cuentas) {
    const puntos = porCuenta.get(c.id!)
    if (!puntos) continue
    if (puntos.length > 1) {
      repetidos.push({ nombre: puntos[0].nombre, motivo: `Hay ${puntos.length} puntos para este usuario; no se aplicó ninguno` })
      continue
    }
    const p = puntos[0]
    const antes = tieneUbic(c) ? { lat: c.lat!, lng: c.lng! } : undefined
    const dist = antes ? metros(antes, p) : null
    if (dist !== null && dist < 0.5) sinCambio++
    else movimientos.push({ cuenta: c, nombrePunto: p.nombre, antes, despues: { lat: p.lat, lng: p.lng }, metros: dist })
  }
  // los que más se mueven primero: son los que hay que revisar con más cuidado
  movimientos.sort((a, b) => (b.metros ?? Infinity) - (a.metros ?? Infinity))

  return { rutaId, movimientos, sinCambio, noEncontrados, repetidos, invalidos: lectura.invalidos, ignorados: lectura.ignorados }
}

// Solo escribe lat/lng (y marca la ubicación como manual). Guarda una copia para poder deshacer.
export async function aplicarKml(plan: PlanKml) {
  await db.transaction('rw', db.cuentas, db.copias, async () => {
    const previas = await db.cuentas.where('rutaId').equals(plan.rutaId).toArray()
    await db.copias.put({ rutaId: plan.rutaId, fecha: Date.now(), cuentas: previas })
    const ahora = Date.now()
    for (const m of plan.movimientos) {
      await db.cuentas.update(m.cuenta.id!, { lat: m.despues.lat, lng: m.despues.lng, precision: undefined, ubicManual: true, ubicadoEn: ahora })
    }
  })
}
