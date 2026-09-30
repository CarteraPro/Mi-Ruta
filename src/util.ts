import type { Color, Cuenta } from './db'

// Colores que se eligen a mano. El resto (verde claro, rojo claro, rojo y tomate) los pone el estado solo.
// Los colores antiguos que algún usuario ya tenga guardado (rojo, naranja, verde) se siguen mostrando.
export const COLORES: { valor: Color; nombre: string; hex: string }[] = [
  { valor: 'amarillo', nombre: 'Amarillo', hex: '#fef08a' },
  { valor: 'azul', nombre: 'Azul', hex: '#bfdbfe' },
]

const sinAcentos = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

// Color de fondo automático según el estado (la clave es la clase CSS `c-<clave>`).
export function colorDeEstado(estado: string): string | undefined {
  if (estado === 'normal') return 'lectura' // Lectura real → verde clarito
  if (estado === 'casa_desocupada') return 'casa' // → rojo claro
  if (estado === 'local_desocupado') return 'sin' // Sin acometida ni medidor → rojo
  const t = sinAcentos(estado.replace(/^extra:/, ''))
  if (t === 'medidor frenado' || t === 'promedio') return 'tomate'
  return undefined
}

// Lo elegido a mano manda; si no hay, el color sale del estado.
export const colorEfectivo = (c: Cuenta): string | undefined => c.color ?? colorDeEstado(c.estado)

// Vereda de cada cuenta según las marcas de inicio/fin (null = sin marcar).
export function veredasDerivadas(cuentas: Cuenta[]): (string | null)[] {
  let actual: string | null = null
  return cuentas.map((c) => {
    if (c.inicioVereda) actual = c.inicioVereda
    const v = actual
    if (c.finVereda) actual = null
    return v
  })
}

export const esNuevo = (c: Cuenta) => !!c.nuevoHasta && Date.now() < c.nuevoHasta

// La dirección suele traer prefijos ("Vr", "Br"), así que basta con que contenga el nombre.
export const distinta = (vereda: string | null, direccion: string) =>
  !!vereda && !direccion.toLowerCase().includes(vereda.trim().toLowerCase())
