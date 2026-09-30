import { useEffect, useRef, useState } from 'react'
import { db } from './db'
import { aplicarKml, crearKml, leerKml, planificarKml, resumenUbicaciones, type PlanKml } from './kml'
import ResumenKml from './ResumenKml'

const tamano = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

// Hoja de Google Earth para UNA ruta: exportar KML (sin fotos) / KMZ (con fotos) e importar un KML con coordenadas corregidas.
export default function EarthRuta({ ruta, onCerrar }: { ruta: { id: number; nombre: string }; onCerrar: () => void }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof resumenUbicaciones>> | null>(null)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [listo, setListo] = useState<{ archivo: File; puntos: number; sinUbicacion: number; fotos: number } | null>(null)
  const [plan, setPlan] = useState<PlanKml | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const entrada = useRef<HTMLInputElement>(null)

  const cargarInfo = () => resumenUbicaciones(ruta.id).then(setInfo)
  useEffect(() => {
    cargarInfo()
  }, [ruta.id])

  const exportar = async (conFotos: boolean) => {
    setError('')
    setAviso('')
    setTrabajando('Preparando el archivo…')
    try {
      const r = await crearKml(ruta.id, conFotos, (h, t) => setTrabajando(`Preparando el archivo… fotos ${h} de ${t}`))
      setListo(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el archivo')
    } finally {
      setTrabajando(null)
    }
  }

  const puedeCompartir = !!listo && typeof navigator.canShare === 'function' && navigator.canShare({ files: [listo.archivo] })
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

  const revisar = async (file: File | undefined) => {
    if (entrada.current) entrada.current.value = ''
    if (!file) return
    setError('')
    setAviso('')
    setTrabajando('Leyendo el KML…')
    try {
      if (!/\.kml$/i.test(file.name)) throw new Error('Solo se importan archivos .kml (en Google Earth: Guardar lugar como… → KML)')
      const lectura = await leerKml(file)
      const cuentas = await db.cuentas.where('[rutaId+orden]').between([ruta.id, 0], [ruta.id, Infinity]).toArray()
      setPlan(planificarKml(ruta.id, cuentas, lectura))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el KML')
    } finally {
      setTrabajando(null)
    }
  }

  const aplicar = async () => {
    if (!plan) return
    setTrabajando('Aplicando…')
    try {
      await aplicarKml(plan)
      setAviso(`Coordenadas actualizadas: ${plan.movimientos.length} usuarios. Puedes deshacerlo desde la pantalla de rutas.`)
      setPlan(null)
      cargarInfo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aplicar')
    } finally {
      setTrabajando(null)
    }
  }

  return (
    <div className="hoja-fondo" onClick={trabajando ? undefined : onCerrar}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cab">
          <strong>Google Earth · "{ruta.nombre}"</strong>
          {!trabajando && (
            <button className="icono" onClick={onCerrar} aria-label="Cerrar">
              ✕
            </button>
          )}
        </div>

        {trabajando ? (
          <p className="aviso">{trabajando}</p>
        ) : listo ? (
          <>
            <p className="aviso">
              Archivo listo: {listo.puntos} puntos{listo.fotos ? ` y ${listo.fotos} fotos` : ''} · {tamano(listo.archivo.size)}
            </p>
            <p className="ayuda">
              {listo.archivo.name}
              {listo.sinUbicacion ? ` · ${listo.sinUbicacion} usuarios sin ubicación no se incluyeron.` : ''}
            </p>
            {puedeCompartir && (
              <button className="grande primario" onClick={compartir}>
                📤 Compartir
              </button>
            )}
            <button className={'grande' + (puedeCompartir ? '' : ' primario')} onClick={guardar}>
              ⬇ Guardar en el celular
            </button>
            <button className="enlace" onClick={() => setListo(null)}>
              ← Volver
            </button>
          </>
        ) : (
          <>
            <div className="hoja-tit">Exportar a Google Earth</div>
            <p className="ayuda">
              Un punto por usuario con el NIU como nombre; en el detalle van el nombre, el medidor, la dirección y las notas.
              {info ? ` ${info.conUbicacion} de ${info.total} usuarios tienen ubicación.` : ''}
            </p>
            <button className="grande" disabled={!info || !info.conUbicacion} onClick={() => exportar(false)}>
              📄 KML (sin fotos)
            </button>
            <button className="grande primario" disabled={!info || !info.conUbicacion || !info.fotos.n} onClick={() => exportar(true)}>
              🖼 KMZ con fotos{info ? (info.fotos.n ? ` (${info.fotos.n} · ${tamano(info.fotos.bytes)})` : ' (no hay fotos)') : ''}
            </button>

            <div className="hoja-tit">Importar coordenadas corregidas</div>
            <p className="ayuda">
              Solo se lee el KML: el NIU (nombre del punto) y su posición. No cambia nombres, medidores, notas ni fotos, y antes de aplicar te muestro un resumen.
            </p>
            <input ref={entrada} type="file" accept=".kml,application/vnd.google-earth.kml+xml" hidden onChange={(e) => revisar(e.target.files?.[0])} />
            <button className="grande" onClick={() => entrada.current?.click()}>
              📥 Importar KML
            </button>
          </>
        )}
        {error && <p className="error">{error}</p>}
        {aviso && <p className="aviso">{aviso}</p>}
      </div>

      {plan && <ResumenKml plan={plan} ocupado={!!trabajando} onCancelar={() => setPlan(null)} onAplicar={aplicar} />}
    </div>
  )
}
