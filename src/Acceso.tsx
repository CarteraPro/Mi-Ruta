import { useState, type ReactNode } from 'react'

// SHA-256 de la contraseña (no se guarda en texto plano). Para cambiarla, reemplazar este valor.
const HUELLA = 'bf122166f11c94bed6e73f639c2265077b20b8f2b11387490e1dabcc7636175e'
const CLAVE = 'mi-ruta:acceso'

async function sha256(texto: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const yaDesbloqueado = () => {
  try {
    return localStorage.getItem(CLAVE) === HUELLA
  } catch {
    return false
  }
}

export function bloquear() {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    /* sin almacenamiento: no hay nada que borrar */
  }
  location.reload()
}

// Pide la contraseña una vez; queda recordada en este celular hasta que se pulse "Bloquear".
export default function Acceso({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(yaDesbloqueado)
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')

  if (abierto) return <>{children}</>

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if ((await sha256(clave.trim())) === HUELLA) {
        try {
          localStorage.setItem(CLAVE, HUELLA)
        } catch {
          /* sin almacenamiento: pedirá la contraseña la próxima vez */
        }
        setAbierto(true)
      } else {
        setError('Contraseña incorrecta')
        setClave('')
      }
    } catch {
      setError('No se pudo verificar la contraseña en este navegador')
    }
  }

  return (
    <main className="pantalla centrada">
      <h1 className="logo">Mi ruta</h1>
      <form onSubmit={entrar} className="acceso">
        <label>
          Contraseña
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="Escribe la contraseña"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="grande primario" type="submit" disabled={!clave.trim()}>
          Entrar
        </button>
      </form>
    </main>
  )
}
