import { useEffect, useState } from 'react'

// Pantalla completa: un toque alterna entre ajustada y ampliada (se desplaza con el dedo).
export default function Visor({ blob, onCerrar, onEliminar }: { blob: Blob; onCerrar: () => void; onEliminar: () => void }) {
  const [url, setUrl] = useState('')
  const [zoom, setZoom] = useState(false)

  useEffect(() => {
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])

  return (
    <div className="visor">
      <div className="visor-barra">
        <button className="icono" onClick={onCerrar} aria-label="Cerrar">
          ✕
        </button>
        <button className="icono peligro" onClick={onEliminar} aria-label="Eliminar foto">
          🗑
        </button>
      </div>
      <div className={'visor-lienzo' + (zoom ? ' ampliada' : '')}>
        {url && <img src={url} alt="Foto ampliada" onClick={() => setZoom((z) => !z)} />}
      </div>
      <p className="visor-ayuda">Toca la foto para {zoom ? 'reducir' : 'ampliar'}</p>
    </div>
  )
}
