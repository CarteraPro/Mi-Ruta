import { useEffect, useState } from 'react'
import { crearRespaldo, infoFotos } from './respaldo'

const tamano = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

// Hoja para generar el respaldo de UNA ruta (con o sin fotos) y compartirlo con otro celular.
export default function RespaldoRuta({ ruta, onCerrar }: { ruta: { id: number; nombre: string }; onCerrar: () => void }) {
  const [fotos, setFotos] = useState<{ n: number; bytes: number } | null>(null)
  const [trabajando, setTrabajando] = useState<{ hecho: number; total: number } | null>(null)
  const [listo, setListo] = useState<{ archivo: File; fotos: number } | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    infoFotos(ruta.id).then(setFotos)
  }, [ruta.id])

  const generar = async (conFotos: boolean) => {
    setError('')
    setAviso('')
    setTrabajando({ hecho: 0, total: conFotos ? (fotos?.n ?? 0) : 0 })
    try {
      const r = await crearRespaldo(ruta.id, conFotos, (hecho, total) => setTrabajando({ hecho, total }))
      setListo({ archivo: r.archivo, fotos: r.fotos })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el respaldo')
    } finally {
      setTrabajando(null)
    }
  }

  const puedeCompartir = !!listo && typeof navigator.canShare === 'function' && navigator.canShare({ files: [listo.archivo] })

  // Se hace con un toque nuevo del usuario (crear un archivo grande tarda y el permiso de compartir caduca).
  const compartir = async () => {
    if (!listo) return
    try {
      await navigator.share({ files: [listo.archivo], title: listo.archivo.name })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError('No se pudo abrir el menú de compartir; usa "Guardar en el celular"')
    }
  }

  const guardar = () => {
    if (!listo) return
    const url = URL.createObjectURL(listo.archivo)
    const a = document.createElement('a')
    a.href = url
    a.download = listo.archivo.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    setAviso('Archivo guardado en las descargas del celular.')
  }

  return (
    <div className="hoja-fondo" onClick={trabajando ? undefined : onCerrar}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cab">
          <strong>Respaldo de "{ruta.nombre}"</strong>
          {!trabajando && (
            <button className="icono" onClick={onCerrar} aria-label="Cerrar">
              ✕
            </button>
          )}
        </div>

        {trabajando ? (
          <p className="aviso">
            Preparando el respaldo…
            {trabajando.total > 0 && ` fotos ${trabajando.hecho} de ${trabajando.total}`}
          </p>
        ) : listo ? (
          <>
            <p className="aviso">
              Archivo listo: {listo.fotos ? `con ${listo.fotos} fotos` : 'sin fotos'} · {tamano(listo.archivo.size)}
            </p>
            <p className="ayuda">{listo.archivo.name}</p>
            {puedeCompartir && (
              <button className="grande primario" onClick={compartir}>
                📤 Compartir (WhatsApp, Bluetooth, Drive…)
              </button>
            )}
            <button className={'grande' + (puedeCompartir ? '' : ' primario')} onClick={guardar}>
              ⬇ Guardar en el celular
            </button>
            <p className="ayuda">En el otro celular usa "📥 Importar respaldo de otro celular". Si allá ya existe una ruta con este nombre, se reemplaza.</p>
          </>
        ) : (
          <>
            <p className="ayuda">Incluye el orden, colores, notas, estados, ubicaciones, marcas de vereda y todo lo que hayas hecho en esta ruta.</p>
            <button className="grande" disabled={!fotos} onClick={() => generar(false)}>
              📄 Sin fotos (liviano)
            </button>
            <button className="grande primario" disabled={!fotos || fotos.n === 0} onClick={() => generar(true)}>
              🖼 Con fotos{fotos ? (fotos.n ? ` (${fotos.n} · ${tamano(fotos.bytes)})` : ' (no hay fotos)') : ''}
            </button>
          </>
        )}
        {error && <p className="error">{error}</p>}
        {aviso && <p className="aviso">{aviso}</p>}
      </div>
    </div>
  )
}
