import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import Ficha from './Ficha'
import Lista from './Lista'
import { distinta, veredasDerivadas } from './util'

const VECINOS = 2

export default function Recorrido({ rutaId, onCambiarRuta }: { rutaId: number; onCambiarRuta: () => void }) {
  const ruta = useLiveQuery(() => db.rutas.get(rutaId), [rutaId])
  const cuentas = useLiveQuery(() => db.cuentas.where('[rutaId+orden]').between([rutaId, 0], [rutaId, Infinity]).toArray(), [rutaId])
  const claveCuenta = `mi-ruta:cuenta:${rutaId}`
  // Se recuerda la cuenta (no la posición) para que reordenar no cambie lo que estás viendo.
  const [actualId, setActualId] = useState<number | null>(() => Number(localStorage.getItem(claveCuenta)) || null)
  const [lista, setLista] = useState(false)
  const ultimoIdx = useRef(0)

  const veredas = useMemo(() => (cuentas ? veredasDerivadas(cuentas) : []), [cuentas])

  const total = cuentas?.length ?? 0
  const encontrado = cuentas ? cuentas.findIndex((c) => c.id === actualId) : -1
  const actual = encontrado >= 0 ? encontrado : Math.min(ultimoIdx.current, Math.max(total - 1, 0))
  ultimoIdx.current = actual
  const cuenta = cuentas?.[actual]

  useEffect(() => {
    if (cuenta?.id) localStorage.setItem(claveCuenta, String(cuenta.id))
  }, [cuenta?.id, claveCuenta])

  if (!cuentas || !ruta) return <main className="pantalla centrada">Cargando…</main>
  if (!cuenta) {
    return (
      <main className="pantalla centrada">
        <p>Esta ruta no tiene usuarios.</p>
        <button className="grande primario" onClick={onCambiarRuta}>
          Cambiar de ruta
        </button>
      </main>
    )
  }

  const ir = (i: number) => setActualId(cuentas[Math.max(0, Math.min(total - 1, i))].id!)
  const antes = cuentas.slice(Math.max(0, actual - VECINOS), actual)
  const despues = cuentas.slice(actual + 1, actual + 1 + VECINOS)
  const vereda = veredas[actual]

  return (
    <div className="recorrido">
      <header className="barra">
        <button className="icono" aria-label="Cambiar de ruta" onClick={onCambiarRuta}>
          ☰
        </button>
        <div className="barra-titulo">
          <strong>{ruta.nombre}</strong>
          <span>
            {actual + 1} de {total}
          </span>
        </div>
        <button className="icono" aria-label="Lista de usuarios" onClick={() => setLista(true)}>
          📋
        </button>
      </header>

      <nav className="vecinos arriba" aria-label="Anteriores">
        {antes.map((c, i) => (
          <button key={c.id} className={c.color ? `c-${c.color}` : ''} onClick={() => ir(actual - antes.length + i)}>
            ↑ {c.nombre || c.niu}
          </button>
        ))}
        {!antes.length && <span className="fin">Inicio de la ruta</span>}
      </nav>

      <div className="centro">
        <Ficha key={cuenta.id} cuenta={cuenta} vereda={distinta(vereda, cuenta.direccion) ? vereda : null} />
      </div>

      <nav className="vecinos abajo" aria-label="Siguientes">
        {despues.map((c, i) => (
          <button key={c.id} className={c.color ? `c-${c.color}` : ''} onClick={() => ir(actual + 1 + i)}>
            ↓ {c.nombre || c.niu}
          </button>
        ))}
        {!despues.length && <span className="fin">Fin de la ruta</span>}
      </nav>

      <footer className="acciones">
        <button className="grande" disabled={actual === 0} onClick={() => ir(actual - 1)}>
          ← Anterior
        </button>
        <button className="grande primario" disabled={actual >= total - 1} onClick={() => ir(actual + 1)}>
          Siguiente →
        </button>
      </footer>

      {lista && (
        <Lista
          rutaId={rutaId}
          cuentas={cuentas}
          actualId={cuenta.id!}
          onCerrar={() => setLista(false)}
          onIr={(id) => {
            setActualId(id)
            setLista(false)
          }}
        />
      )}
    </div>
  )
}
