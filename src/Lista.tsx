import { useEffect, useMemo, useRef, useState } from 'react'
import { db, moverCuenta, agregarCuenta, eliminarCuenta, type Color, type Cuenta } from './db'
import { COLORES, distinta, esNuevo, veredasDerivadas } from './util'

interface Props {
  rutaId: number
  cuentas: Cuenta[]
  actualId: number
  onIr: (id: number) => void
  onCerrar: () => void
}

export default function Lista({ rutaId, cuentas, actualId, onIr, onCerrar }: Props) {
  const [q, setQ] = useState('')
  const [menuId, setMenuId] = useState<number | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [arrastrando, setArrastrando] = useState<number | null>(null)
  const [destino, setDestino] = useState<number | null>(null)
  const [moviendoId, setMoviendoId] = useState<number | null>(null) // usuario en "modo mover"
  const [tick, setTick] = useState(0)
  const contRef = useRef<HTMLUListElement>(null)
  const yRef = useRef(0)
  const xRef = useRef(0)
  const destinoRef = useRef<number | null>(null)
  const cuentasRef = useRef(cuentas)
  cuentasRef.current = cuentas

  const veredas = useMemo(() => veredasDerivadas(cuentas), [cuentas])
  const t = q.trim().toLowerCase()
  const visibles = useMemo(
    () =>
      cuentas
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => !t || `${c.nombre} ${c.niu} ${c.medidor} ${c.direccion}`.toLowerCase().includes(t)),
    [cuentas, t],
  )

  // Al abrir, deja a la vista la cuenta actual.
  useEffect(() => {
    contRef.current?.querySelector('.actual')?.scrollIntoView({ block: 'center' })
  }, [])

  // En modo mover, tras cada cambio de posición se centra al usuario movido.
  useEffect(() => {
    if (moviendoId !== null) contRef.current?.querySelector('.moviendo')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [moviendoId, tick])

  // --- deslizar al usuario resaltado (modo mover) para reordenar ---
  useEffect(() => {
    if (arrastrando === null) return
    let raf = 0
    const paso = () => {
      const cont = contRef.current
      if (cont) {
        const r = cont.getBoundingClientRect()
        const borde = 70
        if (yRef.current < r.top + borde) cont.scrollTop -= Math.ceil((r.top + borde - yRef.current) / 4)
        else if (yRef.current > r.bottom - borde) cont.scrollTop += Math.ceil((yRef.current - (r.bottom - borde)) / 4)
        const fila = document.elementFromPoint(xRef.current, yRef.current)?.closest('[data-idx]')
        if (fila) {
          const idx = Number(fila.getAttribute('data-idx'))
          destinoRef.current = idx
          setDestino(idx)
        }
      }
      raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [arrastrando])

  const empezar = (e: React.PointerEvent, idx: number) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    xRef.current = e.clientX
    yRef.current = e.clientY
    destinoRef.current = idx
    setDestino(idx)
    setArrastrando(idx)
  }
  const mover = (e: React.PointerEvent) => {
    xRef.current = e.clientX
    yRef.current = e.clientY
  }
  const soltar = async () => {
    const desde = arrastrando
    const hasta = destinoRef.current
    setArrastrando(null)
    setDestino(null)
    if (desde !== null && hasta !== null) await moverCuenta(cuentasRef.current, desde, hasta)
    setTick((n) => n + 1)
  }

  const menuCuenta = menuId !== null ? cuentas.find((c) => c.id === menuId) : undefined
  const menuIdx = menuCuenta ? cuentas.indexOf(menuCuenta) : -1
  const idxMoviendo = moviendoId !== null ? cuentas.findIndex((c) => c.id === moviendoId) : -1

  return (
    <div className="modal">
      <div className="modal-caja">
        <div className="modal-cab">
          <input placeholder="Buscar nombre, NIU, medidor o dirección" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="icono" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="lista-barra">
          <button className="pequeno" onClick={() => setNuevo(true)}>
            ＋ Nuevo usuario
          </button>
          <span>
            {moviendoId !== null
              ? 'Desliza el usuario resaltado o escribe su posición'
              : t
                ? `${visibles.length} resultados`
                : `${cuentas.length} usuarios · ⋮ → Mover para reordenar`}
          </span>
        </div>

        <ul className="resultados" ref={contRef}>
          {visibles.map(({ c, i }) => {
            const v = veredas[i]
            return (
              <li key={c.id}>
                {c.inicioVereda && <div className="banda inicio">▶ Inicio de vereda: {c.inicioVereda}</div>}
                <div
                  data-idx={i}
                  className={
                    'fila' +
                    (c.color ? ` c-${c.color}` : '') +
                    (c.id === actualId ? ' actual' : '') +
                    (c.id === moviendoId ? ' moviendo' : '') +
                    (arrastrando === i ? ' arrastrada' : '') +
                    (arrastrando !== null && destino === i && arrastrando !== i ? (arrastrando < i ? ' sobre-abajo' : ' sobre-arriba') : '')
                  }
                  {...(c.id === moviendoId && {
                    onPointerDown: (e: React.PointerEvent) => empezar(e, i),
                    onPointerMove: mover,
                    onPointerUp: soltar,
                    onPointerCancel: soltar,
                  })}
                >
                  <button className="fila-datos" onClick={() => onIr(c.id!)}>
                    <strong>
                      <span className="pos">{i + 1}</span> {c.nombre || '(sin nombre)'}
                      {esNuevo(c) && <span className="insignia nuevo">NUEVO</span>}
                      {c.anulada && <span className="insignia anulada">ANULADA</span>}
                    </strong>
                    <span>
                      NIU {c.niu} · {c.direccion || 'sin dirección'}
                    </span>
                    {distinta(v, c.direccion) && <em>Vereda: {v}</em>}
                  </button>
                  {c.id === moviendoId ? (
                    <span className="mover-icono" aria-hidden>
                      ⇅
                    </span>
                  ) : (
                    <button className="icono" aria-label="Opciones" onClick={() => setMenuId(c.id!)}>
                      ⋮
                    </button>
                  )}
                </div>
                {c.finVereda && <div className="banda fin-v">■ Fin de vereda</div>}
              </li>
            )
          })}
          {!visibles.length && <li className="fin">Sin resultados</li>}
        </ul>

        {idxMoviendo >= 0 && (
          <PanelMover
            key={idxMoviendo}
            posicion={idxMoviendo}
            total={cuentas.length}
            onIr={async (pos) => {
              await moverCuenta(cuentas, idxMoviendo, pos)
              setTick((n) => n + 1)
            }}
            onListo={() => setMoviendoId(null)}
          />
        )}
      </div>

      {menuCuenta && (
        <Opciones
          cuenta={menuCuenta}
          posicion={menuIdx}
          total={cuentas.length}
          onCerrar={() => setMenuId(null)}
          onMover={() => {
            setQ('') // el modo mover necesita la lista completa
            setMoviendoId(menuCuenta.id!)
            setMenuId(null)
          }}
          onEliminar={async () => {
            await eliminarCuenta(cuentas, menuCuenta.id!)
            setMenuId(null)
          }}
        />
      )}

      {nuevo && (
        <NuevoUsuario
          cuentas={cuentas}
          onCerrar={() => setNuevo(false)}
          onCrear={async (datos) => {
            const despuesDe = Math.max(0, cuentas.findIndex((c) => c.id === actualId))
            const id = await agregarCuenta(cuentas, rutaId, cuentas.length ? despuesDe : -1, datos)
            setNuevo(false)
            onIr(id)
          }}
        />
      )}
    </div>
  )
}

// Barra inferior del modo mover: ir a una posición por número (para distancias largas) o terminar.
function PanelMover({
  posicion,
  total,
  onIr,
  onListo,
}: {
  posicion: number
  total: number
  onIr: (pos: number) => void
  onListo: () => void
}) {
  const [pos, setPos] = useState(String(posicion + 1))
  const ir = () => onIr(Math.max(0, Math.min(total - 1, (parseInt(pos, 10) || 1) - 1)))

  return (
    <div className="panel-mover">
      <label>
        Ir a la posición (1–{total})
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={total}
          value={pos}
          onChange={(e) => setPos(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ir()}
        />
      </label>
      <button className="pequeno" onClick={ir}>
        Mover
      </button>
      <button className="grande primario" onClick={onListo}>
        Listo
      </button>
    </div>
  )
}

function Opciones({
  cuenta,
  posicion,
  total,
  onCerrar,
  onMover,
  onEliminar,
}: {
  cuenta: Cuenta
  posicion: number
  total: number
  onCerrar: () => void
  onMover: () => void
  onEliminar: () => void
}) {
  const [vereda, setVereda] = useState(cuenta.inicioVereda ?? cuenta.direccion)
  const guardar = (c: Partial<Cuenta>) => db.cuentas.update(cuenta.id!, c)
  const pintar = (color: Color | undefined) => guardar({ color })

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cab">
          <strong>{cuenta.nombre || cuenta.niu}</strong>
          <button className="icono" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {cuenta.anulada && (
          <button className="pequeno" onClick={() => guardar({ anulada: undefined })}>
            ↩ Corregir: esta matrícula NO está anulada
          </button>
        )}

        <div className="hoja-tit">Color de fondo</div>
        <div className="colores">
          <button className={'color sin' + (!cuenta.color ? ' sel' : '')} onClick={() => pintar(undefined)} aria-label="Sin color">
            ∅
          </button>
          {COLORES.map((c) => (
            <button
              key={c.valor}
              className={'color' + (cuenta.color === c.valor ? ' sel' : '')}
              style={{ background: c.hex }}
              onClick={() => pintar(c.valor)}
              aria-label={c.nombre}
            />
          ))}
        </div>

        <div className="hoja-tit">Vereda</div>
        <input value={vereda} onChange={(e) => setVereda(e.target.value)} placeholder="Nombre de la vereda" />
        <div className="hoja-fila">
          <button
            className="pequeno"
            disabled={!vereda.trim()}
            onClick={() => guardar({ inicioVereda: vereda.trim() })}
          >
            ▶ {cuenta.inicioVereda ? 'Actualizar inicio' : 'Marcar inicio'}
          </button>
          {cuenta.inicioVereda && (
            <button className="pequeno" onClick={() => guardar({ inicioVereda: undefined })}>
              Quitar inicio
            </button>
          )}
        </div>
        <div className="hoja-fila">
          <button className="pequeno" onClick={() => guardar({ finVereda: cuenta.finVereda ? undefined : true })}>
            {cuenta.finVereda ? 'Quitar fin' : '■ Marcar fin de vereda'}
          </button>
        </div>

        <div className="hoja-tit">Posición {posicion + 1} de {total}</div>
        <button className="pequeno" onClick={onMover}>
          ↕ Mover
        </button>

        <button
          className="pequeno peligro-b"
          onClick={() => {
            if (confirm(`¿Eliminar a "${cuenta.nombre || cuenta.niu}" con sus fotos? No se puede deshacer.`)) onEliminar()
          }}
        >
          🗑 Eliminar usuario
        </button>
      </div>
    </div>
  )
}

function NuevoUsuario({
  cuentas,
  onCerrar,
  onCrear,
}: {
  cuentas: Cuenta[]
  onCerrar: () => void
  onCrear: (d: { niu: string; nombre: string; medidor: string; direccion: string }) => void
}) {
  const [niu, setNiu] = useState('')
  const [nombre, setNombre] = useState('')
  const [medidor, setMedidor] = useState('')
  const [direccion, setDireccion] = useState('')

  const crear = () => {
    const n = niu.trim()
    if (!n) return
    if (cuentas.some((c) => c.niu === n) && !confirm(`Ya existe un usuario con NIU ${n}. ¿Agregarlo de todos modos?`)) return
    onCrear({ niu: n, nombre: nombre.trim(), medidor: medidor.trim(), direccion: direccion.trim() })
  }

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cab">
          <strong>Nuevo usuario</strong>
          <button className="icono" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="ayuda">Se agrega justo después del usuario que estabas viendo.</p>
        <input autoFocus inputMode="numeric" placeholder="NIU (obligatorio)" value={niu} onChange={(e) => setNiu(e.target.value)} />
        <input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input inputMode="numeric" placeholder="Medidor" value={medidor} onChange={(e) => setMedidor(e.target.value)} />
        <input placeholder="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        <button className="grande primario" disabled={!niu.trim()} onClick={crear}>
          Agregar
        </button>
      </div>
    </div>
  )
}
