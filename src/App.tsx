import { useState } from 'react'
import Acceso from './Acceso'
import SelectorRuta from './SelectorRuta'
import Recorrido from './Recorrido'
import { ConfirmarHost } from './confirmar'

const CLAVE = 'mi-ruta:rutaActual'

export default function App() {
  const [rutaId, setRutaId] = useState<number | null>(() => {
    const v = localStorage.getItem(CLAVE)
    return v ? Number(v) : null
  })

  const elegir = (id: number | null) => {
    if (id === null) localStorage.removeItem(CLAVE)
    else localStorage.setItem(CLAVE, String(id))
    setRutaId(id)
  }

  return (
    <Acceso>
      {rutaId === null ? (
        <SelectorRuta onElegir={elegir} />
      ) : (
        <Recorrido key={rutaId} rutaId={rutaId} onCambiarRuta={() => elegir(null)} />
      )}
      <ConfirmarHost />
    </Acceso>
  )
}
