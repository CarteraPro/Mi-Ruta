// Consulta de pagos en el portal Oracle de la empresa, a través del servidor consulta-eep.
// Las credenciales se escriben una sola vez: se guardan cifradas (AES-GCM) en este celular con una llave
// no exportable guardada en IndexedDB, así que sirven para todos los usuarios de la ruta sin volver a pedirlas.
// Viajan por HTTPS al consultar y el servidor no las guarda.
export const BACKEND_URL: string = import.meta.env.VITE_BACKEND_URL ?? 'https://consulta-eep-backend.onrender.com'

const LS_CRED = 'mi-ruta:credenciales-oracle'
const BD_LLAVE = 'mi-ruta-llave'

export interface Credenciales {
  usuario: string
  clave: string
}
export interface ResultadoPago {
  adeudado: number | null // solo si no está al día: suma de las facturas pendientes
  periodosPendientes: string[]
  consumoKwh: number | null // consumo del mes según la última factura
  valorPagado: string | null // valor del último pago, tal cual lo da el portal
  ultimoPago: string // texto tal cual lo da el portal, o 'Sin pagos registrados'
  alDia: boolean
  consultadoEn: number
}

const aB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

// ---- llave AES no exportable, guardada en IndexedDB ----
function abrirBD() {
  return new Promise<IDBDatabase>((ok, fallo) => {
    const p = indexedDB.open(BD_LLAVE, 1)
    p.onupgradeneeded = () => p.result.createObjectStore('llaves')
    p.onsuccess = () => ok(p.result)
    p.onerror = () => fallo(p.error)
  })
}
async function leerLlave(): Promise<CryptoKey | null> {
  const bd = await abrirBD()
  return new Promise((ok, fallo) => {
    const r = bd.transaction('llaves').objectStore('llaves').get('aes')
    r.onsuccess = () => ok((r.result as CryptoKey) ?? null)
    r.onerror = () => fallo(r.error)
  })
}
async function guardarLlave(llave: CryptoKey) {
  const bd = await abrirBD()
  return new Promise<void>((ok, fallo) => {
    const t = bd.transaction('llaves', 'readwrite')
    t.objectStore('llaves').put(llave, 'aes')
    t.oncomplete = () => ok()
    t.onerror = () => fallo(t.error)
  })
}

export const hayCredenciales = () => localStorage.getItem(LS_CRED) !== null

export async function guardarCredenciales(cred: Credenciales) {
  const llave = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await guardarLlave(llave)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const datos = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, llave, new TextEncoder().encode(JSON.stringify(cred)))
  localStorage.setItem(LS_CRED, JSON.stringify({ iv: aB64(iv), datos: aB64(datos) }))
}

export async function leerCredenciales(): Promise<Credenciales> {
  const guardado = localStorage.getItem(LS_CRED)
  const llave = await leerLlave()
  if (!guardado || !llave) throw new Error('Faltan las credenciales — configúralas con el botón 🔑')
  const b = JSON.parse(guardado)
  const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(b.iv) as BufferSource }, llave, deB64(b.datos) as BufferSource)
  return JSON.parse(new TextDecoder().decode(plano))
}

// Pide al servidor el último pago de un NIU.
export async function consultarPago(niu: string): Promise<ResultadoPago> {
  const credenciales = await leerCredenciales()
  const res = await fetch(`${BACKEND_URL}/api/consulta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ niu, credenciales }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.message || 'No se pudo consultar')
  // El servidor nuevo siempre responde `adeudado` (número o null); si falta, sigue con la versión anterior.
  if (!('adeudado' in data)) throw new Error(`Servidor sin valores. Campos: ${Object.keys(data).join(', ')}`)
  return aResultado(data)
}

// Convierte lo que responde el servidor (consulta puntual o resultado de un escaneo) en el resultado que guarda la ficha.
export function aResultado(data: any): ResultadoPago {
  return {
    ultimoPago: data.ultimoPago,
    valorPagado: data.valorPagado ?? null,
    adeudado: data.adeudado ?? null,
    periodosPendientes: (data.facturasPendientes ?? []).map((f: { periodo: string }) => f.periodo),
    consumoKwh: typeof data.consumoKwh === 'number' ? data.consumoKwh : null,
    alDia: !!(data.alDia ?? data.pagado),
    consultadoEn: Date.now(),
  }
}
