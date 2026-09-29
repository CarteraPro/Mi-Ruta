import { Unzip, UnzipInflate, UnzipPassThrough, Zip, ZipDeflate, ZipPassThrough, strFromU8, strToU8 } from 'fflate'
import { borrarRuta, db, type Cuenta } from './db'

const VERSION = 1
const BLOQUE = 1024 * 1024

type CuentaRespaldo = Omit<Cuenta, 'id' | 'rutaId'> & { idOrigen: number }

export interface Manifiesto {
  app: 'mi-ruta'
  version: number
  exportada: number
  ruta: { nombre: string }
  conFotos: boolean
  cuentas: CuentaRespaldo[]
  fotos: { cuenta: number; archivo: string; fecha: number }[]
  estadosExtra: string[]
}

const norm = (s: string) => s.trim().toLowerCase()
const carpeta = (niu: string) => niu.replace(/[^\w.-]/g, '_') || 'sin_niu'
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' }
const TIPO: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' }
const pausa = () => new Promise<void>((r) => setTimeout(r))

export async function infoFotos(rutaId: number) {
  let n = 0
  let bytes = 0
  await db.fotos.where('rutaId').equals(rutaId).each((f) => {
    n++
    bytes += f.blob.size
  })
  return { n, bytes }
}

// Crea el .zip de una ruta: datos.json (primero) + fotos/<NIU>/… si se pide con fotos.
export async function crearRespaldo(rutaId: number, conFotos: boolean, onProgreso: (hecho: number, total: number) => void) {
  const ruta = await db.rutas.get(rutaId)
  if (!ruta) throw new Error('No se encontró la ruta')
  const cuentas = await db.cuentas.where('[rutaId+orden]').between([rutaId, 0], [rutaId, Infinity]).toArray()
  const porId = new Map(cuentas.map((c) => [c.id!, c]))

  const contador = new Map<number, number>()
  const fotos = conFotos
    ? (await db.fotos.where('rutaId').equals(rutaId).toArray())
        .filter((f) => porId.has(f.cuentaId))
        .map((f) => {
          const c = porId.get(f.cuentaId)!
          const n = (contador.get(c.id!) ?? 0) + 1
          contador.set(c.id!, n)
          const ext = EXT[f.blob.type] ?? 'jpg'
          return { foto: f, cuenta: c.id!, archivo: `fotos/${carpeta(c.niu)}/${c.id}-${n}.${ext}`, fecha: f.fecha }
        })
    : []

  const manifiesto: Manifiesto = {
    app: 'mi-ruta',
    version: VERSION,
    exportada: Date.now(),
    ruta: { nombre: ruta.nombre },
    conFotos,
    cuentas: cuentas.map(({ id, rutaId: _r, ...resto }) => ({ ...resto, idOrigen: id! })),
    fotos: fotos.map(({ cuenta, archivo, fecha }) => ({ cuenta, archivo, fecha })),
    estadosExtra: (await db.estadosExtra.toArray()).map((e) => e.texto),
  }

  const partes: Uint8Array[] = []
  let fallo: Error | null = null
  const zip = new Zip((err, chunk) => {
    if (err) fallo = err
    else partes.push(chunk)
  })
  const datos = new ZipDeflate('datos.json', { level: 6 })
  zip.add(datos)
  datos.push(strToU8(JSON.stringify(manifiesto)), true)

  onProgreso(0, fotos.length)
  for (let i = 0; i < fotos.length; i++) {
    // las fotos ya están comprimidas (JPEG): se guardan tal cual, sin recomprimir
    const entrada = new ZipPassThrough(fotos[i].archivo)
    zip.add(entrada)
    entrada.push(new Uint8Array(await fotos[i].foto.blob.arrayBuffer()), true)
    if (fallo) throw fallo
    onProgreso(i + 1, fotos.length)
    if (i % 5 === 0) await pausa()
  }
  zip.end()
  if (fallo) throw fallo

  const fecha = new Date().toISOString().slice(0, 10)
  const nombre = `Respaldo ${ruta.nombre} ${fecha} (${conFotos ? 'con fotos' : 'sin fotos'}).zip`.replace(/[\\/:*?"<>|]/g, '-')
  const archivo = new File(partes as unknown as BlobPart[], nombre, { type: 'application/zip' })
  return { archivo, nombre, fotos: fotos.length }
}

const unir = (partes: Uint8Array[]) => {
  const total = partes.reduce((s, p) => s + p.length, 0)
  const salida = new Uint8Array(total)
  let o = 0
  for (const p of partes) {
    salida.set(p, o)
    o += p.length
  }
  return salida
}

// Alimenta el descompresor por bloques de 1 MB (no carga todo el archivo en memoria).
async function empujar(file: File, uz: Unzip, parar?: () => boolean, onBloque?: (leido: number) => void) {
  for (let o = 0; o < file.size; o += BLOQUE) {
    uz.push(new Uint8Array(await file.slice(o, o + BLOQUE).arrayBuffer()), o + BLOQUE >= file.size)
    onBloque?.(Math.min(o + BLOQUE, file.size))
    if (parar?.()) return
    await pausa()
  }
}

const nuevoDescompresor = () => {
  const uz = new Unzip()
  uz.register(UnzipInflate)
  uz.register(UnzipPassThrough)
  return uz
}

// Lee solo datos.json (viene primero) para poder mostrar qué trae el respaldo antes de importarlo.
export async function leerManifiesto(file: File): Promise<Manifiesto> {
  const invalido = () => new Error('Este archivo no es un respaldo de Mi ruta')
  let manifiesto: Manifiesto | undefined
  let error: Error | undefined
  const uz = nuevoDescompresor()
  uz.onfile = (f) => {
    if (f.name !== 'datos.json') return
    const partes: Uint8Array[] = []
    f.ondata = (err, d, fin) => {
      if (err) return void (error = invalido())
      partes.push(d)
      if (!fin) return
      try {
        const m = JSON.parse(strFromU8(unir(partes))) as Manifiesto
        if (m.app !== 'mi-ruta' || !Array.isArray(m.cuentas) || !m.ruta?.nombre) throw invalido()
        if (m.version > VERSION) throw new Error('Este respaldo es de una versión más nueva de la app. Actualiza la app e inténtalo de nuevo')
        manifiesto = m
      } catch (e) {
        error = e instanceof Error ? e : invalido()
      }
    }
    f.start()
  }
  try {
    await empujar(file, uz, () => !!manifiesto || !!error)
  } catch {
    // un zip cortado puede fallar al final aunque datos.json ya se haya leído bien
    if (!manifiesto) throw invalido()
  }
  if (error) throw error
  if (!manifiesto) throw invalido()
  return manifiesto
}

// Importa el respaldo. Si ya existe una ruta con el mismo nombre se REEMPLAZA por completo (no se fusiona).
export async function importarRespaldo(file: File, m: Manifiesto, onProgreso: (texto: string) => void) {
  const anteriores = (await db.rutas.toArray()).filter((r) => norm(r.nombre) === norm(m.ruta.nombre))
  const nuevoId = { valor: 0 }
  try {
    const mapa = new Map<number, number>() // id de la cuenta en el respaldo → id nuevo
    nuevoId.valor = await db.transaction('rw', db.rutas, db.cuentas, async () => {
      const id = await db.rutas.add({ nombre: m.ruta.nombre, creada: Date.now() })
      const filas = m.cuentas.map(({ idOrigen: _o, ...resto }) => ({ ...resto, rutaId: id }) as Cuenta)
      const claves = await db.cuentas.bulkAdd(filas, { allKeys: true })
      m.cuentas.forEach((c, i) => mapa.set(c.idOrigen, claves[i]))
      return id
    })

    const porArchivo = new Map(m.fotos.map((f) => [f.archivo, f]))
    let cola: Promise<unknown> = Promise.resolve()
    let importadas = 0
    let fallo: Error | undefined
    const uz = nuevoDescompresor()
    uz.onfile = (f) => {
      const foto = porArchivo.get(f.name)
      if (!foto) return // datos.json u otros archivos: se omiten
      const cuentaId = mapa.get(foto.cuenta)
      if (cuentaId === undefined) return
      const partes: Uint8Array[] = []
      f.ondata = (err, d, fin) => {
        if (err) return void (fallo = err)
        partes.push(d)
        if (!fin) return
        const ext = f.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        const blob = new Blob(partes as unknown as BlobPart[], { type: TIPO[ext] ?? 'image/jpeg' })
        cola = cola.then(() => db.fotos.add({ cuentaId, rutaId: nuevoId.valor, blob, fecha: foto.fecha })).then(() => {
          importadas++
          onProgreso(`Importando fotos… ${importadas} de ${m.fotos.length}`)
        })
      }
      f.start()
    }
    if (m.fotos.length) {
      onProgreso(`Importando fotos… 0 de ${m.fotos.length}`)
      try {
        await empujar(file, uz, () => !!fallo)
      } catch {
        throw new Error('El archivo está incompleto o dañado. No se hizo ningún cambio')
      }
    }
    await cola
    if (fallo) throw fallo
    if (importadas !== m.fotos.length) throw new Error('El archivo está incompleto: faltan fotos. No se hizo ningún cambio')

    for (const texto of m.estadosExtra ?? []) {
      const existe = (await db.estadosExtra.toArray()).some((e) => norm(e.texto) === norm(texto))
      if (!existe) await db.estadosExtra.add({ texto })
    }
    // solo cuando todo salió bien se elimina la ruta anterior del mismo nombre
    for (const a of anteriores) await borrarRuta(a.id!)
    return { rutaId: nuevoId.valor, cuentas: m.cuentas.length, fotos: importadas, reemplazada: anteriores.length > 0 }
  } catch (e) {
    if (nuevoId.valor) await borrarRuta(nuevoId.valor) // no deja una ruta a medias
    throw e
  }
}
