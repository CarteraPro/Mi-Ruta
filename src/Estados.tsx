import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Cuenta } from './db'
import { useAtras } from './atras'
import { confirmar } from './confirmar'

const BASE = [
  { valor: 'normal', texto: 'Lectura real' },
  { valor: 'casa_desocupada', texto: '🏚 Casa desocupada' },
  { valor: 'local_desocupado', texto: 'Sin acometida ni medidor' },
]

const PREFIJO = 'extra:'
export const textoEstado = (estado: string) => (estado ? (BASE.find((b) => b.valor === estado)?.texto ?? estado.replace(PREFIJO, '')) : 'Sin estado')

// Botones de estado: 3 fijos + los que agregue el usuario (disponibles para todas las cuentas).
export default function Estados({ cuenta, onElegir }: { cuenta: Cuenta; onElegir: (estado: string) => void }) {
  const extras = useLiveQuery(() => db.estadosExtra.toArray(), [])
  const [agregando, setAgregando] = useState(false)

  const valoresExtra = (extras ?? []).map((e) => PREFIJO + e.texto)
  // si la cuenta tiene un estado cuyo botón se borró, se sigue mostrando para no perderlo de vista
  if (cuenta.estado.startsWith(PREFIJO) && !valoresExtra.includes(cuenta.estado)) valoresExtra.push(cuenta.estado)

  // sin estado ('') hasta que se elija uno; volver a tocar el botón activo lo quita
  const alternar = (valor: string) => onElegir(cuenta.estado === valor ? '' : valor)

  return (
    <>
      <div className="chips">
        {BASE.map((e) => (
          <button key={e.valor} className={'chip' + (cuenta.estado === e.valor ? ' activo' : '')} onClick={() => alternar(e.valor)}>
            {e.texto}
          </button>
        ))}
        <button className="chip mas" aria-label="Agregar otro estado" onClick={() => setAgregando(true)}>
          ＋
        </button>
      </div>
      {valoresExtra.length > 0 && (
        <div className="chips-extra">
          {valoresExtra.map((v) => (
            <button key={v} className={'chip' + (cuenta.estado === v ? ' activo' : '')} onClick={() => alternar(v)}>
              {textoEstado(v)}
            </button>
          ))}
        </div>
      )}
      {agregando && (
        <NuevoEstado
          existentes={[...BASE.map((b) => b.texto), ...(extras ?? []).map((e) => e.texto)]}
          extras={extras ?? []}
          onCerrar={() => setAgregando(false)}
          onCrear={async (texto) => {
            await db.estadosExtra.add({ texto })
            onElegir(PREFIJO + texto) // el usuario que estaba viendo queda con el estado nuevo
            setAgregando(false)
          }}
        />
      )}
    </>
  )
}

function NuevoEstado({
  existentes,
  extras,
  onCerrar,
  onCrear,
}: {
  existentes: string[]
  extras: { id?: number; texto: string }[]
  onCerrar: () => void
  onCrear: (texto: string) => void
}) {
  useAtras(onCerrar)
  const [texto, setTexto] = useState('')
  const t = texto.trim()
  const repetido = existentes.some((e) => e.toLowerCase() === t.toLowerCase())

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cab">
          <strong>Agregar botón de estado</strong>
          <button className="icono" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="ayuda">El botón quedará disponible en todos los usuarios y se le asigna al que estás viendo.</p>
        <input
          autoFocus
          maxLength={30}
          placeholder="Ej: Medidor dañado"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && t && !repetido && onCrear(t)}
        />
        {repetido && t && <p className="error">Ya existe un botón con ese nombre</p>}
        <button className="grande primario" disabled={!t || repetido} onClick={() => onCrear(t)}>
          Agregar
        </button>

        {extras.length > 0 && (
          <>
            <div className="hoja-tit">Botones agregados</div>
            {extras.map((e) => (
              <div key={e.id} className="extra-fila">
                <span>{e.texto}</span>
                <button
                  className="icono peligro"
                  aria-label={`Quitar el botón ${e.texto}`}
                  onClick={async () => {
                    if (await confirmar(`¿Está seguro de quitar el botón "${e.texto}"?\nLos usuarios que ya lo tienen conservan ese estado.`, { si: 'Sí, quitar', no: 'No', peligro: true })) {
                      await db.estadosExtra.delete(e.id!)
                    }
                  }}
                >
                  🗑
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
