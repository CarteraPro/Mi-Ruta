import { useEffect, useState } from 'react'
import { useAtras } from './atras'

interface Pedido {
  mensaje: string
  si: string
  no: string
  peligro: boolean
  resolver: (ok: boolean) => void
}

let mostrar: ((p: Pedido | null) => void) | null = null
let abierto: Pedido | null = null

// Cuadro de confirmación de la app (reemplaza al confirm() nativo). Devuelve true si el usuario acepta.
export function confirmar(mensaje: string, opciones: { si?: string; no?: string; peligro?: boolean } = {}) {
  return new Promise<boolean>((resolver) => {
    if (!mostrar) return resolver(window.confirm(mensaje))
    abierto?.resolver(false) // si ya había uno abierto, se cancela
    abierto = { mensaje, si: opciones.si ?? 'Aceptar', no: opciones.no ?? 'Cancelar', peligro: !!opciones.peligro, resolver }
    mostrar(abierto)
  })
}

export function ConfirmarHost() {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  useEffect(() => {
    mostrar = setPedido
    return () => {
      mostrar = null
    }
  }, [])
  return pedido ? <Dialogo pedido={pedido} onResuelto={() => { abierto = null; setPedido(null) }} /> : null
}

function Dialogo({ pedido, onResuelto }: { pedido: Pedido; onResuelto: () => void }) {
  const cerrar = (ok: boolean) => {
    pedido.resolver(ok)
    onResuelto()
  }
  useAtras(() => cerrar(false)) // el botón atrás equivale a cancelar
  return (
    <div className="hoja-fondo dialogo-fondo" onClick={() => cerrar(false)}>
      <div className="dialogo" role="alertdialog" onClick={(e) => e.stopPropagation()}>
        <p>{pedido.mensaje}</p>
        <div className="dialogo-botones">
          <button className="grande" onClick={() => cerrar(false)}>
            {pedido.no}
          </button>
          <button className={'grande ' + (pedido.peligro ? 'peligro-solido' : 'primario')} onClick={() => cerrar(true)}>
            {pedido.si}
          </button>
        </div>
      </div>
    </div>
  )
}
