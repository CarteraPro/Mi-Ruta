import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Cuenta, type EstadoExtra } from './db'
import { useAtras } from './atras'
import { confirmar } from './confirmar'
import { useConfigEstados } from './estadosConfig'
import { COLORES_ESTADO, ESTADOS_BASE, NINGUNO, PREFIJO_EXTRA, colorPorDefecto, hexDeColor, sinAcentos } from './util'

// Botones de estado: 3 fijos + los que agregue el usuario. Todos tienen nombre y color editables.
export default function Estados({ cuenta, onElegir }: { cuenta: Cuenta; onElegir: (estado: string) => void }) {
  const cfg = useConfigEstados()
  const extras = useLiveQuery(() => db.estadosExtra.toArray(), [])
  const [gestion, setGestion] = useState(false)

  const valoresExtra = (extras ?? []).map((e) => PREFIJO_EXTRA + e.texto)
  // si la cuenta tiene un estado cuyo botón se borró, se sigue mostrando para no perderlo de vista
  if (cuenta.estado.startsWith(PREFIJO_EXTRA) && !valoresExtra.includes(cuenta.estado)) valoresExtra.push(cuenta.estado)

  // sin estado ('') hasta que se elija uno; volver a tocar el botón activo lo quita
  const alternar = (valor: string) => onElegir(cuenta.estado === valor ? '' : valor)

  const chip = (valor: string) => {
    const hex = hexDeColor(cfg.color(valor))
    return (
      <button key={valor} className={'chip' + (cuenta.estado === valor ? ' activo' : '')} onClick={() => alternar(valor)}>
        {hex && <i className="punto" style={{ background: hex }} />}
        {cfg.texto(valor)}
      </button>
    )
  }

  return (
    <>
      <div className="chips">
        {ESTADOS_BASE.map((e) => chip(e.valor))}
        <button className="chip mas" aria-label="Agregar o editar estados" onClick={() => setGestion(true)}>
          ＋
        </button>
      </div>
      {valoresExtra.length > 0 && <div className="chips-extra">{valoresExtra.map(chip)}</div>}
      {gestion && <GestionEstados extras={extras ?? []} onElegir={onElegir} onCerrar={() => setGestion(false)} />}
    </>
  )
}

function Paleta({ valor, onElegir }: { valor: string | undefined; onElegir: (c: string | undefined) => void }) {
  return (
    <div className="paleta">
      <button className={'muestra sin' + (!valor ? ' sel' : '')} onClick={() => onElegir(undefined)} aria-label="Sin color" title="Sin color">
        ∅
      </button>
      {COLORES_ESTADO.map((c) => (
        <button
          key={c.clave}
          className={'muestra' + (valor === c.clave ? ' sel' : '')}
          style={{ background: c.hex }}
          onClick={() => onElegir(c.clave)}
          aria-label={c.nombre}
          title={c.nombre}
        />
      ))}
    </div>
  )
}

function GestionEstados({ extras, onElegir, onCerrar }: { extras: EstadoExtra[]; onElegir: (estado: string) => void; onCerrar: () => void }) {
  useAtras(onCerrar)
  const cfg = useConfigEstados()
  const ajustes = useLiveQuery(() => db.ajustesEstado.toArray(), []) ?? []

  // --- agregar ---
  const [nTexto, setNTexto] = useState('')
  const [nColor, setNColor] = useState<string | undefined>(undefined)
  const [nTocado, setNTocado] = useState(false)
  const nt = nTexto.trim()
  // mientras no se toque la paleta, se muestra el color que ese nombre ya trae por defecto (p. ej. "Promedio")
  const nSeleccion = nTocado ? nColor : colorPorDefecto(PREFIJO_EXTRA + nt)

  // --- editar ---
  const [editando, setEditando] = useState<string | null>(null)
  const [eTexto, setETexto] = useState('')
  const [eColor, setEColor] = useState<string | undefined>(undefined)
  const [eTocado, setETocado] = useState(false)
  const et = eTexto.trim()

  const textos = (excepto?: string) => [...ESTADOS_BASE.map((b) => cfg.texto(b.valor)), ...extras.map((e) => e.texto)].filter((t) => t !== excepto)
  const repetido = (t: string, excepto?: string) => !!t && textos(excepto).some((x) => sinAcentos(x) === sinAcentos(t))

  const empezarEdicion = (valor: string) => {
    setEditando(valor)
    setETexto(cfg.texto(valor))
    setEColor(cfg.color(valor))
    setETocado(false)
  }

  const crear = async () => {
    if (!nt || repetido(nt)) return
    const color = nTocado ? (nColor ?? NINGUNO) : undefined
    await db.estadosExtra.add({ texto: nt, ...(color !== undefined ? { color } : {}) })
    onElegir(PREFIJO_EXTRA + nt) // el usuario que estaba viendo queda con el estado nuevo
    onCerrar()
  }

  const guardarEdicion = async (valor: string) => {
    const base = ESTADOS_BASE.find((b) => b.valor === valor)
    if (base) {
      if (!et || repetido(et, cfg.texto(valor))) return
      const previo = ajustes.find((a) => a.clave === valor)
      await db.ajustesEstado.put({
        clave: valor,
        texto: et === base.texto ? undefined : et,
        color: eTocado ? (eColor ?? NINGUNO) : previo?.color,
      })
    } else {
      const ex = extras.find((e) => PREFIJO_EXTRA + e.texto === valor)
      if (!ex || !et || repetido(et, ex.texto)) return
      const renombra = et !== ex.texto
      // al renombrar se congela el color que tenía, para que no cambie por el nuevo nombre
      const color = eTocado ? (eColor ?? NINGUNO) : (ex.color ?? (renombra ? (cfg.color(valor) ?? NINGUNO) : undefined))
      await db.transaction('rw', db.estadosExtra, db.cuentas, async () => {
        await db.estadosExtra.update(ex.id!, { texto: et, color })
        // los usuarios (de todas las rutas) que tenían el nombre viejo pasan al nuevo
        if (renombra) {
          await db.cuentas.toCollection().modify((c: Cuenta) => {
            if (c.estado === valor) c.estado = PREFIJO_EXTRA + et
          })
        }
      })
    }
    setEditando(null)
  }

  const restablecerColor = async (valor: string) => {
    if (ESTADOS_BASE.some((b) => b.valor === valor)) {
      const previo = ajustes.find((a) => a.clave === valor)
      if (previo) await db.ajustesEstado.put({ ...previo, color: undefined })
    } else {
      const ex = extras.find((e) => PREFIJO_EXTRA + e.texto === valor)
      if (ex) await db.estadosExtra.update(ex.id!, { color: undefined })
    }
    setEditando(null)
  }

  const quitar = async (ex: EstadoExtra) => {
    if (await confirmar(`¿Está seguro de quitar el botón "${ex.texto}"?\nLos usuarios que ya lo tienen conservan ese estado.`, { si: 'Sí, quitar', no: 'No', peligro: true })) {
      await db.estadosExtra.delete(ex.id!)
      setEditando(null)
    }
  }

  const fila = (valor: string, extra?: EstadoExtra) => {
    const hex = hexDeColor(cfg.color(valor))
    const personalizado = extra ? extra.color !== undefined : ajustes.some((a) => a.clave === valor && a.color !== undefined)
    return (
      <div key={valor} className="estado-fila">
        <div className="estado-cab">
          <span className="punto grande" style={{ background: hex ?? 'transparent' }} />
          <span className="estado-nombre">{cfg.texto(valor)}</span>
          {editando === valor ? (
            <button className="pequeno" onClick={() => setEditando(null)}>
              Cerrar
            </button>
          ) : (
            <button className="pequeno" aria-label={`Editar ${cfg.texto(valor)}`} onClick={() => empezarEdicion(valor)}>
              ✏️ Editar
            </button>
          )}
        </div>
        {editando === valor && (
          <div className="estado-edicion">
            <input maxLength={30} value={eTexto} onChange={(e) => setETexto(e.target.value)} aria-label="Nombre del estado" />
            {repetido(et, cfg.texto(valor)) && <p className="error">Ya existe un botón con ese nombre</p>}
            <Paleta
              valor={eColor}
              onElegir={(c) => {
                setEColor(c)
                setETocado(true)
              }}
            />
            <div className="hoja-fila">
              <button className="grande primario" disabled={!et || repetido(et, cfg.texto(valor))} onClick={() => guardarEdicion(valor)}>
                Guardar
              </button>
              {personalizado && (
                <button className="pequeno" onClick={() => restablecerColor(valor)}>
                  ↺ Color original
                </button>
              )}
            </div>
            {extra && (
              <button className="pequeno peligro-b" onClick={() => quitar(extra)}>
                🗑 Quitar este botón
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cab">
          <strong>Estados</strong>
          <button className="icono" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="hoja-tit">Agregar un estado nuevo</div>
        <input
          maxLength={30}
          placeholder="Ej: Medidor dañado"
          value={nTexto}
          aria-label="Nombre del estado nuevo"
          onChange={(e) => setNTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && crear()}
        />
        {repetido(nt) && <p className="error">Ya existe un botón con ese nombre</p>}
        <p className="ayuda">Color de fondo de este estado:</p>
        <Paleta
          valor={nSeleccion}
          onElegir={(c) => {
            setNColor(c)
            setNTocado(true)
          }}
        />
        <button className="grande primario" disabled={!nt || repetido(nt)} onClick={crear}>
          Agregar
        </button>
        <p className="ayuda">Queda disponible en todos los usuarios y se le asigna al que estás viendo.</p>

        <div className="hoja-tit">Editar los estados que ya tienes</div>
        {ESTADOS_BASE.map((b) => fila(b.valor))}
        {extras.map((e) => fila(PREFIJO_EXTRA + e.texto, e))}
      </div>
    </div>
  )
}
