import { useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { confirmar } from './confirmar'
import { HojaCredenciales } from './ConsultaPago'
import { hayCredenciales } from './pagoOracle'
import { consultadaEsteMes, consultarRuta, estadoConsultaRuta, pausarConsultaRuta, suscribirConsultaRuta } from './consulta'

// Botón de la lista de rutas: consulta el pago de todos los usuarios de la ruta y, si se pausa o se corta,
// "Continuar" retoma solo con los que aún no se han consultado este mes.
export default function ConsultarRuta({ rutaId, nombre, onAviso }: { rutaId: number; nombre: string; onAviso: (t: string) => void }) {
  const estado = useSyncExternalStore(suscribirConsultaRuta, estadoConsultaRuta)
  const [credenciales, setCredenciales] = useState(false)
  const cuentas = useLiveQuery(() => db.cuentas.where('rutaId').equals(rutaId).toArray(), [rutaId])
  const activas = (cuentas ?? []).filter((c) => !c.anulada && c.niu)
  const hechas = activas.filter(consultadaEsteMes).length
  const faltan = activas.length - hechas
  const corriendoAqui = estado?.rutaId === rutaId
  const ocupadaOtra = !!estado && !corriendoAqui

  const iniciar = async () => {
    if (!hayCredenciales()) {
      setCredenciales(true)
      return
    }
    const texto = hechas > 0
      ? `Faltan ${faltan} de ${activas.length} usuarios por consultar este mes. ¿Continuar?`
      : `Se consultarán ${activas.length} usuarios en el portal. Puede tardar varios minutos; puedes pausar y continuar después. ¿Empezar?`
    if (!(await confirmar(texto, { si: hechas > 0 ? 'Continuar' : 'Empezar', no: 'No' }))) return
    try {
      const r = await consultarRuta(rutaId, nombre)
      if (r) onAviso(r.pausada ? `Consulta pausada: ${r.hechas} consultados${r.errores ? `, ${r.errores} con error` : ''}.` : `Consulta terminada: ${r.hechas} consultados${r.errores ? `, ${r.errores} con error (pulsa Continuar para reintentarlos)` : ''}.`)
    } catch (e) {
      onAviso(e instanceof Error ? e.message : 'No se pudo consultar la ruta')
    }
  }

  if (activas.length === 0) return null
  return (
    <div className="consulta-ruta">
      {corriendoAqui ? (
        <>
          <span className="consulta-ruta-texto">{estado.texto}</span>
          <button className="accion" disabled={estado.cancelando} onClick={pausarConsultaRuta}>
            ⏸ Pausar
          </button>
        </>
      ) : (
        <>
          <button className="accion" disabled={ocupadaOtra || faltan === 0} onClick={iniciar}>
            {faltan === 0 ? '✅ Ruta consultada este mes' : hechas > 0 ? `▶ Continuar (${hechas}/${activas.length})` : '💳 Consultar toda la ruta'}
          </button>
          {faltan === 0 && (
            <button className="enlace" onClick={() => iniciarDeNuevo()}>
              Consultar de nuevo
            </button>
          )}
        </>
      )}
      {credenciales && (
        <HojaCredenciales
          onCerrar={() => setCredenciales(false)}
          onListo={() => {
            setCredenciales(false)
            iniciar()
          }}
        />
      )}
    </div>
  )

  async function iniciarDeNuevo() {
    if (!(await confirmar(`Se volverán a consultar los ${activas.length} usuarios de la ruta. ¿Seguro?`, { si: 'Sí, de nuevo', no: 'No' }))) return
    // se borra la marca de "consultada" para que todos queden pendientes
    for (const c of activas) await db.cuentas.update(c.id!, { pagoConsulta: c.pagoConsulta ? { ...c.pagoConsulta, consultadoEn: 0 } : undefined })
    iniciar()
  }
}
