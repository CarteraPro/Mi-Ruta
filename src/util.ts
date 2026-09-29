import type { Color, Cuenta } from './db'

export const COLORES: { valor: Color; nombre: string; hex: string }[] = [
  { valor: 'rojo', nombre: 'Rojo', hex: '#fecaca' },
  { valor: 'naranja', nombre: 'Naranja', hex: '#fed7aa' },
  { valor: 'amarillo', nombre: 'Amarillo', hex: '#fef08a' },
  { valor: 'verde', nombre: 'Verde', hex: '#bbf7d0' },
  { valor: 'azul', nombre: 'Azul', hex: '#bfdbfe' },
]

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
