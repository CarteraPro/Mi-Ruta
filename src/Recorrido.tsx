import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Cuenta } from './db'
import Ficha from './Ficha'
import Lista from './Lista'
import { colorEfectivo, distinta, veredasDerivadas } from './util'
import { useAtras } from './atras'

// En pantallas bajas solo cabe el vecino inmediato.
function useVecinos() {
  const calc = () => (window.innerHeight <= 760 ? 1 : 2)
  const [n, setN] = useState(calc)
  useEffect(() => {
    const f = () => setN(calc())
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  return n
}

type Item = { banda: 'inicio' | 'fin'; texto: string } | { cuenta: Cuenta; idx: number }

export default function Recorrido({ rutaId, onCambiarRuta }: { rutaId: number; onCambiarRuta: () => void }) {
  const ruta = useLiveQuery(() => db.rutas.get(rutaId), [rutaId])
  const cuentas = useLiveQuery(() => db.cuentas.where('[rutaId+orden]').between([rutaId, 0], [rutaId, Infinity]).toArray(), [rutaId])
  const claveCuenta = `mi-ruta:cuenta:${rutaId}`
  // Se recuerda la cuenta (no la posición) para que reordenar no cambie lo que estás viendo.
  const [actualId, setActualId] = useState<number | null>(() => Number(localStorage.getItem(claveCuenta)) || null)
  const [lista, setLista] = useState(false)
  const ultimoIdx = useRef(0)
  useAtras(onCambiarRuta) // atrás desde el recorrido vuelve a la lista de rutas

  const VECINOS = useVecinos()
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
  const inicio = (c: Cuenta): Item => ({ banda: 'inicio', texto: `▶ Inicio de vereda: ${c.inicioVereda}` })
  const fin: Item = { banda: 'fin', texto: '■ Fin de vereda' }

  // Franja de arriba: vecinos anteriores; si el actual abre una vereda, se avisa justo encima de él.
  const arriba: Item[] = []
  for (let i = Math.max(0, actual - VECINOS); i <= actual; i++) {
    const c = cuentas[i]
    if (c.inicioVereda) arriba.push(inicio(c))
    if (i < actual) {
      arriba.push({ cuenta: c, idx: i })
      if (c.finVereda) arriba.push(fin)
    }
  }
  // Franja de abajo: si el actual cierra una vereda, se avisa justo debajo de él.
  const abajo: Item[] = []
  if (cuenta.finVereda) abajo.push(fin)
  for (let i = actual + 1; i <= Math.min(total - 1, actual + VECINOS); i++) {
    const c = cuentas[i]
    if (c.inicioVereda) abajo.push(inicio(c))
    abajo.push({ cuenta: c, idx: i })
    if (c.finVereda && i < actual + VECINOS) abajo.push(fin)
  }
  const render = (items: Item[], flecha: string) =>
    items.map((it, k) =>
      'banda' in it ? (
        <div key={`b${k}`} className={`banda-v ${it.banda}`}>
          {it.texto}
        </div>
      ) : (
        <button key={it.cuenta.id} className={colorEfectivo(it.cuenta) ? `c-${colorEfectivo(it.cuenta)}` : ''} onClick={() => ir(it.idx)}>
          {flecha} {it.cuenta.nombre || it.cuenta.niu}
        </button>
      ),
    )
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
        {render(arriba, '↑')}
        {!arriba.length && <span className="fin">Inicio de la ruta</span>}
      </nav>

      <div className="centro">
        <Ficha key={cuenta.id} cuenta={cuenta} vereda={distinta(vereda, cuenta.direccion) ? vereda : null} />
      </div>

      <nav className="vecinos abajo" aria-label="Siguientes">
        {render(abajo, '↓')}
        {!abajo.length && <span className="fin">Fin de la ruta</span>}
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
