import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Cuenta } from './db'
import Estados from './Estados'
import { comprimirFoto } from './imagen'
import Visor from './Visor'
import { esNuevo } from './util'

// La ubicación se guarda sola cuando el GPS tiene una precisión mejor (menor) a este valor, en metros.
const PRECISION_MAX = 6

export default function Ficha({ cuenta, vereda }: { cuenta: Cuenta; vereda?: string | null }) {
  const id = cuenta.id!
  const guardar = (cambios: Partial<Cuenta>) => db.cuentas.update(id, cambios)

  return (
    <article className="ficha">
      <section className={'datos' + (cuenta.color ? ` c-${cuenta.color}` : '')}>
        <div className="niu">
          <span>NIU {cuenta.niu}</span>
          {esNuevo(cuenta) && <span className="insignia nuevo">NUEVO</span>}
          {cuenta.anulada && <span className="insignia anulada">ANULADA</span>}
          {cuenta.anulada && (
            <button
              className="corregir"
              onClick={() => confirm('¿Esta matrícula sí sigue activa? Se le quitará la marca ANULADA.') && guardar({ anulada: undefined })}
            >
              ↩ Corregir
            </button>
          )}
          {vereda && <span className="vereda-tag">📍 Vereda {vereda}</span>}
        </div>
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

      <Estados cuenta={cuenta} onElegir={(estado) => guardar({ estado })} />

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
  const [lectura, setLectura] = useState<GeolocationCoordinates | null>(null) // mejor lectura mientras busca
  const [segundos, setSegundos] = useState(0)
  const [error, setError] = useState('')
  const watchId = useRef<number | null>(null)

  const detener = () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    setBuscando(false)
  }
  useEffect(() => detener, []) // al cambiar de cuenta se corta la búsqueda

  // Si ya hay una lectura de GPS guardada, la nueva debe ser igual o mejor (menor o igual) para reemplazarla.
  const previa = cuenta.ubicManual ? undefined : cuenta.precision
  const mejoraPrevia = (a: number) => previa === undefined || a <= previa

  const guardar = (c: GeolocationCoordinates) => {
    onGuardar({ lat: c.latitude, lng: c.longitude, precision: c.accuracy, ubicManual: undefined, ubicadoEn: Date.now() })
    detener()
    setLectura(null)
  }

  // Sigue el GPS y guarda sola la ubicación cuando la precisión baja de PRECISION_MAX metros (y no empeora la anterior).
  const capturar = () => {
    setError('')
    if (!navigator.geolocation) return setError('Este dispositivo no permite ubicación')
    setLectura(null)
    setSegundos(0)
    setBuscando(true)
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setLectura(p.coords)
        if (p.coords.accuracy < PRECISION_MAX && mejoraPrevia(p.coords.accuracy)) guardar(p.coords)
      },
      (e) => {
        if (e.code === 1) {
          setError('Permiso de ubicación denegado')
          detener()
        }
        // otros errores (sin señal momentánea): sigue esperando
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    )
  }

  useEffect(() => {
    if (!buscando) return
    const t = window.setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [buscando])

  // Manteniendo presionado el botón de captura 2 segundos se abre el ingreso manual de coordenadas.
  const [manual, setManual] = useState(false)
  const temporizador = useRef<number | undefined>(undefined)
  const fueLargo = useRef(false)
  const cancelarPulsacion = () => window.clearTimeout(temporizador.current)
  useEffect(() => cancelarPulsacion, [])
  const pulsacion = {
    onPointerDown: () => {
      fueLargo.current = false
      temporizador.current = window.setTimeout(() => {
        fueLargo.current = true
        setManual(true)
      }, 2000)
    },
    onPointerUp: cancelarPulsacion,
    onPointerLeave: cancelarPulsacion,
    onPointerCancel: cancelarPulsacion,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => {
      if (fueLargo.current) fueLargo.current = false
      else capturar()
    },
    title: 'Mantén presionado 2 segundos para escribir las coordenadas',
  }

  const tiene = cuenta.lat !== undefined && cuenta.lng !== undefined
  const mapa = tiene ? `https://www.google.com/maps/search/?api=1&query=${cuenta.lat},${cuenta.lng}` : ''
  const meta = previa !== undefined && previa < PRECISION_MAX ? `${previa.toFixed(1)} m o menos, igual o mejor que la anterior` : `menos de ${PRECISION_MAX} m`
  const puedeGuardarAsi = lectura !== null && segundos >= 20 && mejoraPrevia(lectura.accuracy)

  return (
    <div className="bloque ubic">
      {buscando ? (
        <>
          <span className="buscando">
            Buscando GPS… {lectura ? `±${lectura.accuracy.toFixed(1)} m` : `${segundos}s`}
            <small> (meta: {meta})</small>
          </span>
          <div className="ubic-fila">
            <button className="pequeno" onClick={detener}>
              Cancelar
            </button>
            {puedeGuardarAsi && (
              <button className="pequeno" onClick={() => guardar(lectura!)}>
                Guardar así
              </button>
            )}
          </div>
        </>
      ) : tiene ? (
        <>
          <a className="pequeno enlace-mapa" href={mapa} target="_blank" rel="noreferrer">
            📍 Ver en Maps
            {cuenta.ubicManual ? <small> manual</small> : cuenta.precision !== undefined && <small> ±{cuenta.precision.toFixed(1)} m</small>}
          </a>
          <button className="enlace" {...pulsacion}>
            ↻ Volver a capturar
          </button>
        </>
      ) : (
        <button className="pequeno" {...pulsacion}>
          📍 Capturar ubicación
        </button>
      )}
      {error && <span className="error">{error}</span>}
      {manual && (
        <CoordenadasManuales
          inicial={tiene ? { lat: cuenta.lat!, lng: cuenta.lng! } : undefined}
          onCerrar={() => setManual(false)}
          onGuardar={(lat, lng) => {
            onGuardar({ lat, lng, precision: undefined, ubicManual: true, ubicadoEn: Date.now() })
            setManual(false)
          }}
        />
      )}
    </div>
  )
}

function CoordenadasManuales({
  inicial,
  onCerrar,
  onGuardar,
}: {
  inicial?: { lat: number; lng: number }
  onCerrar: () => void
  onGuardar: (lat: number, lng: number) => void
}) {
  const [lat, setLat] = useState(inicial ? String(inicial.lat) : '')
  const [lng, setLng] = useState(inicial ? String(inicial.lng) : '')
  const num = (s: string) => Number(s.trim().replace(',', '.'))
  const la = num(lat)
  const ln = num(lng)
  const valido = lat.trim() !== '' && lng.trim() !== '' && Math.abs(la) <= 90 && Math.abs(ln) <= 180 && !isNaN(la) && !isNaN(ln)

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cab">
          <strong>Escribir coordenadas</strong>
          <button className="icono" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="ayuda">Ejemplo: latitud 1.15245 y longitud -76.65021. Se guardan como ubicación manual.</p>
        <label>
          Latitud
          <input autoFocus inputMode="decimal" placeholder="1.15245" value={lat} onChange={(e) => setLat(e.target.value)} />
        </label>
        <label>
          Longitud
          <input inputMode="decimal" placeholder="-76.65021" value={lng} onChange={(e) => setLng(e.target.value)} />
        </label>
        {(lat.trim() !== '' || lng.trim() !== '') && !valido && <p className="error">Revisa los números (latitud −90 a 90, longitud −180 a 180)</p>}
        <button className="grande primario" disabled={!valido} onClick={() => onGuardar(la, ln)}>
          Guardar coordenadas
        </button>
      </div>
    </div>
  )
}

function Fotos({ cuenta }: { cuenta: Cuenta }) {
  const fotos = useLiveQuery(() => db.fotos.where('cuentaId').equals(cuenta.id!).toArray(), [cuenta.id])
  const camaraRef = useRef<HTMLInputElement>(null)
  const galeriaRef = useRef<HTMLInputElement>(null)
  const [visor, setVisor] = useState<number | null>(null)
  const [error, setError] = useState('')

  const agregar = async (files: FileList | null, input: React.RefObject<HTMLInputElement | null>) => {
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
    if (input.current) input.current.value = ''
  }

  const quitar = async (fotoId: number) => {
    if (confirm('¿Eliminar esta foto?')) {
      await db.fotos.delete(fotoId)
      setVisor(null)
    }
  }

  return (
    <section className="bloque fotos">
      <button className="pequeno" onClick={() => camaraRef.current?.click()}>
        📷 Foto{fotos?.length ? ` (${fotos.length})` : ''}
      </button>
      <button className="pequeno" onClick={() => galeriaRef.current?.click()} aria-label="Elegir fotos de la galería">
        🖼 Galería
      </button>
      {/* con capture se abre directo la cámara; sin capture se elige de la galería */}
      <input ref={camaraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => agregar(e.target.files, camaraRef)} />
      <input ref={galeriaRef} type="file" accept="image/*" multiple hidden onChange={(e) => agregar(e.target.files, galeriaRef)} />
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
