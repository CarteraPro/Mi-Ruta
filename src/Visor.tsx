import { useEffect, useRef, useState } from 'react'
import { useAtras } from './atras'

// Pantalla completa. Desliza a los lados para pasar de foto en foto; un toque alterna entre ajustada y ampliada
// (ampliada se desplaza con el dedo). El botón atrás del celular cierra el visor.
export default function Visor({
  fotos,
  indice,
  onCambiar,
  onCerrar,
  onEliminar,
}: {
  fotos: Blob[]
  indice: number
  onCambiar: (i: number) => void
  onCerrar: () => void
  onEliminar: (i: number) => void
}) {
  const [url, setUrl] = useState('')
  const [zoom, setZoom] = useState(false)
  const gesto = useRef<{ x: number; y: number } | null>(null)
  const huboGesto = useRef(false)
  useAtras(() => (zoom ? void setZoom(false) : onCerrar())) // atrás primero reduce el zoom

  const blob = fotos[indice]
  useEffect(() => {
    if (!blob) return
    const u = URL.createObjectURL(blob)
    setUrl(u)
    setZoom(false)
    return () => URL.revokeObjectURL(u)
  }, [blob])

  const ir = (paso: number) => {
    const nuevo = indice + paso
    if (nuevo >= 0 && nuevo < fotos.length) onCambiar(nuevo)
  }

  const alSoltar = (e: React.PointerEvent) => {
    const g = gesto.current
    gesto.current = null
    if (!g || zoom) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (Math.hypot(dx, dy) > 12) huboGesto.current = true // fue un deslizamiento, no un toque
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) ir(dx < 0 ? 1 : -1)
  }

  return (
    <div className="visor">
      <div className="visor-barra">
        <button className="icono" onClick={onCerrar} aria-label="Cerrar">
          ✕
        </button>
        <span className="visor-contador">
          {indice + 1} / {fotos.length}
        </span>
        <button className="icono peligro" onClick={() => onEliminar(indice)} aria-label="Eliminar foto">
          🗑
        </button>
      </div>
      <div
        className={'visor-lienzo' + (zoom ? ' ampliada' : '')}
        onPointerDown={(e) => {
          gesto.current = { x: e.clientX, y: e.clientY }
          huboGesto.current = false
        }}
        onPointerUp={alSoltar}
        onPointerCancel={() => (gesto.current = null)}
      >
        {url && (
          <img
            src={url}
            alt={`Foto ${indice + 1} de ${fotos.length}`}
            onClick={() => {
              if (huboGesto.current) huboGesto.current = false
              else setZoom((z) => !z)
            }}
          />
        )}
        {fotos.length > 1 && !zoom && (
          <>
            {indice > 0 && (
              <button className="visor-flecha izq" onClick={() => ir(-1)} aria-label="Foto anterior">
                ‹
              </button>
            )}
            {indice < fotos.length - 1 && (
              <button className="visor-flecha der" onClick={() => ir(1)} aria-label="Foto siguiente">
                ›
              </button>
            )}
          </>
        )}
      </div>
      <p className="visor-ayuda">
        {fotos.length > 1 ? 'Desliza para ver las otras fotos · ' : ''}Toca la foto para {zoom ? 'reducir' : 'ampliar'}
      </p>
    </div>
  )
}
