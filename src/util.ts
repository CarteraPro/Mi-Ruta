import type { AjusteEstado, Color, Cuenta, EstadoExtra } from './db'

// Colores que se eligen a mano para un usuario (Automático = el del estado).
// Los colores antiguos que algún usuario ya tenga guardado (rojo, naranja, verde) se siguen mostrando.
export const COLORES: { valor: Color; nombre: string; hex: string }[] = [
  { valor: 'amarillo', nombre: 'Amarillo', hex: '#fef08a' },
  { valor: 'azul', nombre: 'Azul', hex: '#bfdbfe' },
]

export const NINGUNO = 'ninguno' // "sin color" elegido a propósito para un estado

// Colores disponibles para los estados (la clave es la clase CSS `c-<clave>`).
export const COLORES_ESTADO: { clave: string; nombre: string; hex: string }[] = [
  { clave: 'lectura', nombre: 'Verde clarito', hex: '#dcfce7' },
  { clave: 'amarillo', nombre: 'Amarillo', hex: '#fef08a' },
  { clave: 'naranja', nombre: 'Naranja', hex: '#fed7aa' },
  { clave: 'tomate', nombre: 'Tomate', hex: '#ff8a65' },
  { clave: 'casa', nombre: 'Rojo claro', hex: '#fee2e2' },
  { clave: 'sin', nombre: 'Rojo', hex: '#f87171' },
  { clave: 'azul', nombre: 'Azul', hex: '#bfdbfe' },
  { clave: 'morado', nombre: 'Morado', hex: '#e9d5ff' },
  { clave: 'gris', nombre: 'Gris', hex: '#e2e8f0' },
]
const HEX_ANTIGUOS: Record<string, string> = { rojo: '#fecaca', verde: '#bbf7d0' }
export const hexDeColor = (clave?: string) =>
  clave ? (COLORES_ESTADO.find((c) => c.clave === clave)?.hex ?? HEX_ANTIGUOS[clave]) : undefined

// Los 3 estados fijos.
export const ESTADOS_BASE = [
  { valor: 'normal', texto: 'Lectura real' },
  { valor: 'casa_desocupada', texto: '🏚 Casa desocupada' },
  { valor: 'local_desocupado', texto: 'Sin acometida ni medidor' },
]
export const PREFIJO_EXTRA = 'extra:'

export const sinAcentos = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

// Color de fábrica de cada estado (por nombre, para los botones que creó el usuario).
export function colorPorDefecto(estado: string): string | undefined {
  if (estado === 'normal') return 'lectura' // Lectura real → verde clarito
  if (estado === 'casa_desocupada') return 'casa' // → rojo claro
  if (estado === 'local_desocupado') return 'sin' // Sin acometida ni medidor → rojo
  const t = sinAcentos(estado.replace(PREFIJO_EXTRA, ''))
  if (t === 'medidor frenado' || t === 'promedio') return 'tomate'
  return undefined
}

// Nombre y color vigentes de cada estado, con lo que el usuario haya editado.
export interface ConfigEstados {
  color: (estado: string) => string | undefined
  texto: (estado: string) => string
}

export function crearConfig(ajustes: AjusteEstado[], extras: EstadoExtra[]): ConfigEstados {
  const aj = new Map(ajustes.map((a) => [a.clave, a]))
  const ex = new Map(extras.map((e) => [sinAcentos(e.texto), e]))
  const resolver = (elegido: string | undefined, estado: string) =>
    elegido === undefined ? colorPorDefecto(estado) : elegido === NINGUNO ? undefined : elegido
  return {
    color(estado) {
      if (!estado) return undefined
      if (ESTADOS_BASE.some((b) => b.valor === estado)) return resolver(aj.get(estado)?.color, estado)
      return resolver(ex.get(sinAcentos(estado.replace(PREFIJO_EXTRA, '')))?.color, estado)
    },
    texto(estado) {
      if (!estado) return 'Sin estado'
      const base = ESTADOS_BASE.find((b) => b.valor === estado)
      if (base) return aj.get(estado)?.texto || base.texto
      return estado.replace(PREFIJO_EXTRA, '')
    },
  }
}

// Lo elegido a mano para el usuario manda; si no hay, el color sale de su estado.
export const colorEfectivo = (c: Cuenta, cfg: ConfigEstados): string | undefined => c.color ?? cfg.color(c.estado)

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
