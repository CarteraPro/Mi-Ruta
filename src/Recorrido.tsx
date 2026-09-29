import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import Ficha from './Ficha'

const VECINOS = 2

export default function Recorrido({ rutaId, onCambiarRuta }: { rutaId: number; onCambiarRuta: () => void }) {
  const ruta = useLiveQuery(() => db.rutas.get(rutaId), [rutaId])
  const cuentas = useLiveQuery(() => db.cuentas.where('[rutaId+orden]').between([rutaId, 0], [rutaId, Infinity]).toArray(), [rutaId])
  const claveIdx = `mi-ruta:pos:${rutaId}`
  const [pos, setPos] = useState(() => Number(localStorage.getItem(claveIdx)) || 0)
  const [buscando, setBuscando] = useState(false)

  const total = cuentas?.length ?? 0
  const actual = Math.min(pos, Math.max(total - 1, 0))

  useEffect(() => {
    localStorage.setItem(claveIdx, String(actual))
  }, [actual, claveIdx])

  if (!cuentas || !ruta) return <main className="pantalla centrada">Cargando…</main>

  const ir = (i: number) => setPos(Math.max(0, Math.min(total - 1, i)))
  const cuenta = cuentas[actual]
  const antes = cuentas.slice(Math.max(0, actual - VECINOS), actual)
  const despues = cuentas.slice(actual + 1, actual + 1 + VECINOS)

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
        <button className="icono" aria-label="Buscar" onClick={() => setBuscando(true)}>
          🔍
        </button>
      </header>

      <nav className="vecinos arriba" aria-label="Anteriores">
        {antes.map((c, i) => (
          <button key={c.id} onClick={() => ir(actual - antes.length + i)}>
            ↑ {c.nombre || c.niu}
          </button>
        ))}
        {!antes.length && <span className="fin">Inicio de la ruta</span>}
      </nav>

      <div className="centro">
        <Ficha key={cuenta.id} cuenta={cuenta} />
      </div>

      <nav className="vecinos abajo" aria-label="Siguientes">
        {despues.map((c, i) => (
          <button key={c.id} onClick={() => ir(actual + 1 + i)}>
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

      {buscando && (
        <Buscador
          cuentas={cuentas}
          onCerrar={() => setBuscando(false)}
          onElegir={(i) => {
            ir(i)
            setBuscando(false)
          }}
        />
      )}
    </div>
  )
}

function Buscador({
  cuentas,
  onCerrar,
  onElegir,
}: {
  cuentas: { id?: number; nombre: string; niu: string; medidor: string; direccion: string }[]
  onCerrar: () => void
  onElegir: (indice: number) => void
}) {
  const [q, setQ] = useState('')
  const resultados = useMemo(() => {
    const t = q.trim().toLowerCase()
    const lista = cuentas.map((c, i) => ({ c, i }))
    if (!t) return lista.slice(0, 60)
    return lista
      .filter(({ c }) => `${c.nombre} ${c.niu} ${c.medidor} ${c.direccion}`.toLowerCase().includes(t))
      .slice(0, 60)
  }, [q, cuentas])

  return (
    <div className="modal">
      <div className="modal-caja">
        <div className="modal-cab">
          <input autoFocus placeholder="Buscar nombre, NIU, medidor o dirección" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="icono" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <ul className="resultados">
          {resultados.map(({ c, i }) => (
            <li key={c.id}>
              <button onClick={() => onElegir(i)}>
                <strong>{c.nombre || '(sin nombre)'}</strong>
                <span>
                  #{i + 1} · NIU {c.niu} · {c.direccion}
                </span>
              </button>
            </li>
          ))}
          {!resultados.length && <li className="fin">Sin resultados</li>}
        </ul>
      </div>
    </div>
  )
}
