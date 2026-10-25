// Consulta de pagos en el portal Oracle de la empresa, a través del servidor consulta-eep.
// Las credenciales se guardan cifradas (AES-GCM, clave derivada con PBKDF2 de una "clave de desbloqueo")
// solo en este celular; viajan por HTTPS al consultar y el servidor no las guarda.
export const BACKEND_URL: string = import.meta.env.VITE_BACKEND_URL ?? 'https://consulta-eep-backend.onrender.com'

const LS_CRED = 'mi-ruta:credenciales-oracle'

export interface Credenciales {
  usuario: string
  clave: string
}
interface Boveda {
  salt: string
  iv: string
  datos: string
}
export interface ResultadoPago {
  ultimoPago: string // texto tal cual lo da el portal, o 'Sin pagos registrados'
  alDia: boolean
  consultadoEn: number
}

let enMemoria: Credenciales | null = null // mientras la app esté abierta y desbloqueada

const aB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derivarLlave(pin: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 250000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function leerBoveda(): Boveda | null {
  try {
    return JSON.parse(localStorage.getItem(LS_CRED) || 'null')
  } catch {
    return null
  }
}

export const hayCredenciales = () => leerBoveda() !== null
export const desbloqueadas = () => enMemoria !== null

export async function guardarCredenciales(cred: Credenciales, pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const llave = await derivarLlave(pin, salt)
  const datos = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, llave, new TextEncoder().encode(JSON.stringify(cred)))
  localStorage.setItem(LS_CRED, JSON.stringify({ salt: aB64(salt), iv: aB64(iv), datos: aB64(datos) }))
  enMemoria = cred
}

// Lanza si la clave de desbloqueo es incorrecta.
export async function desbloquear(pin: string) {
  const b = leerBoveda()
  if (!b) throw new Error('No hay credenciales guardadas')
  const llave = await derivarLlave(pin, deB64(b.salt))
  const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(b.iv) as BufferSource }, llave, deB64(b.datos) as BufferSource)
  enMemoria = JSON.parse(new TextDecoder().decode(plano))
}

// Pide al servidor el último pago de un NIU. Requiere haber desbloqueado las credenciales.
export async function consultarPago(niu: string): Promise<ResultadoPago> {
  if (!enMemoria) throw new Error('Credenciales bloqueadas')
  const res = await fetch(`${BACKEND_URL}/api/consulta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ niu, credenciales: enMemoria }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.message || 'No se pudo consultar')
  return { ultimoPago: data.ultimoPago, alDia: !!data.alDia, consultadoEn: Date.now() }
}
