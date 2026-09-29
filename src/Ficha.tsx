import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Cuenta, type Estado } from './db'
import { comprimirFoto } from './imagen'
import Visor from './Visor'

const ESTADOS: { valor: Estado; texto: string }[] = [
  { valor: 'normal', texto: 'Normal' },
  { valor: 'casa_desocupada', texto: '🏚 Casa desoc.' },
  { valor: 'local_desocupado', texto: '🏪 Local desoc.' },
]

export default function Ficha({ cuenta }: { cuenta: Cuenta }) {
  const id = cuenta.id!
  const guardar = (cambios: Partial<Cuenta>) => db.cuentas.update(id, cambios)

  return (
    <article className="ficha">
      <section className="datos">
        <div className="niu">NIU {cuenta.niu}</div>
        <h2>{cuenta.nombre || '(sin nombre)'}</h2>
        <dl>
          <div>
            <dt>Medidor</dt>
            <dd>{cuenta.medidor || '—'}</dd>
          </div>
          <div>
            <dt>Dirección</dt>
            <dd>{cuenta.direccion || '—'}</dd>
          </div>
        </dl>
      </section>

      <div className="chips">
        {ESTADOS.map((e) => (
          <button
            key={e.valor}
            className={'chip' + (cuenta.estado === e.valor ? ' activo' : '')}
            onClick={() => guardar({ estado: e.valor })}
          >
            {e.texto}
          </button>
        ))}
      </div>

      <div className="fila2">
        <label className="bloque">
          Promedio consumo
          <TextoGuardado valor={cuenta.promedio} inputMode="decimal" placeholder="kWh" onGuardar={(v) => guardar({ promedio: v })} />
        </label>
        <Ubicacion cuenta={cuenta} onGuardar={guardar} />
      </div>

      <Fotos cuenta={cuenta} />

      <label className="bloque notas">
        Notas
        <TextoGuardado multilinea valor={cuenta.nota} placeholder="Ej: perros en la entrada…" onGuardar={(v) => guardar({ nota: v })} />
      </label>
    </article>
  )
}

// Campo con estado local que guarda solo cuando se deja de escribir.
function TextoGuardado({
  valor,
  onGuardar,
  multilinea,
  ...rest
}: {
  valor: string
  onGuardar: (v: string) => void
  multilinea?: boolean
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [v, setV] = useState(valor)
  const ultimo = useRef(valor)
  const pendiente = useRef<number | undefined>(undefined)
  const vRef = useRef(v)
  vRef.current = v

  const volcar = () => {
    window.clearTimeout(pendiente.current)
    if (vRef.current !== ultimo.current) {
      ultimo.current = vRef.current
      onGuardar(vRef.current)
    }
  }
  const cambiar = (nuevo: string) => {
    setV(nuevo)
    vRef.current = nuevo
    window.clearTimeout(pendiente.current)
    pendiente.current = window.setTimeout(volcar, 600)
  }
  useEffect(() => volcar, []) // guarda al cambiar de cuenta

  return multilinea ? (
    <textarea value={v} placeholder={rest.placeholder} onChange={(e) => cambiar(e.target.value)} onBlur={volcar} />
  ) : (
    <input {...rest} value={v} onChange={(e) => cambiar(e.target.value)} onBlur={volcar} />
  )
}

function Ubicacion({ cuenta, onGuardar }: { cuenta: Cuenta; onGuardar: (c: Partial<Cuenta>) => void }) {
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState('')

  const capturar = () => {
    setError('')
    if (!navigator.geolocation) return setError('Este dispositivo no permite ubicación')
    setBuscando(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onGuardar({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy, ubicadoEn: Date.now() })
        setBuscando(false)
      },
      (e) => {
        setError(e.code === 1 ? 'Permiso de ubicación denegado' : 'No se pudo obtener la ubicación')
        setBuscando(false)
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    )
  }

  const tiene = cuenta.lat !== undefined && cuenta.lng !== undefined
  return (
    <div className="bloque ubic">
      <button className="pequeno" disabled={buscando} onClick={capturar}>
        {buscando ? 'Buscando GPS…' : tiene ? '📍 Actualizar' : '📍 Ubicación'}
      </button>
      {tiene && (
        <a className="coords" href={`https://www.google.com/maps?q=${cuenta.lat},${cuenta.lng}`} target="_blank" rel="noreferrer">
          {cuenta.lat!.toFixed(5)}, {cuenta.lng!.toFixed(5)}
          {cuenta.precision !== undefined && ` ±${Math.round(cuenta.precision)}m`}
        </a>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  )
}

function Fotos({ cuenta }: { cuenta: Cuenta }) {
  const fotos = useLiveQuery(() => db.fotos.where('cuentaId').equals(cuenta.id!).toArray(), [cuenta.id])
  const inputRef = useRef<HTMLInputElement>(null)
  const [visor, setVisor] = useState<number | null>(null)
  const [error, setError] = useState('')

  const agregar = async (files: FileList | null) => {
    if (!files?.length) return
    setError('')
    try {
      for (const f of Array.from(files)) {
        // si el navegador no puede decodificarla (p. ej. HEIC), se guarda tal cual
        const blob = await comprimirFoto(f).catch(() => f)
        await db.fotos.add({ cuentaId: cuenta.id!, rutaId: cuenta.rutaId, blob, fecha: Date.now() })
      }
    } catch {
      setError('No se pudo guardar la foto')
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  const quitar = async (fotoId: number) => {
    if (confirm('¿Eliminar esta foto?')) {
      await db.fotos.delete(fotoId)
      setVisor(null)
    }
  }

  return (
    <section className="bloque fotos">
      <button className="pequeno" onClick={() => inputRef.current?.click()}>
        📷 Foto{fotos?.length ? ` (${fotos.length})` : ''}
      </button>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => agregar(e.target.files)} />
      <div className="miniaturas">
        {fotos?.map((f, i) => (
          <Miniatura key={f.id} blob={f.blob} onClick={() => setVisor(i)} />
        ))}
        {error && <span className="error">{error}</span>}
      </div>
      {visor !== null && fotos?.[visor] && (
        <Visor blob={fotos[visor].blob} onCerrar={() => setVisor(null)} onEliminar={() => quitar(fotos[visor].id!)} />
      )}
    </section>
  )
}

function Miniatura({ blob, onClick }: { blob: Blob; onClick: () => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return (
    <button className="miniatura" onClick={onClick} aria-label="Ampliar foto">
      {url && <img src={url} alt="Foto de la cuenta" />}
    </button>
  )
}
