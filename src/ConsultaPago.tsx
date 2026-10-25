import { useState } from 'react'
import { db, type Cuenta } from './db'
import { useAtras } from './atras'
import { consultarPago, desbloqueadas, desbloquear, guardarCredenciales, hayCredenciales } from './pagoOracle'

const formatoPesos = (n: number) => '$' + n.toLocaleString('es-CO', { maximumFractionDigits: 0 })

// Muestra solo dos datos del portal Oracle: cuándo fue el último pago y si el usuario está al día.
export default function ConsultaPago({ cuenta }: { cuenta: Cuenta }) {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [hoja, setHoja] = useState<'desbloquear' | 'editar' | null>(null)
  const r = cuenta.pagoConsulta

  const consultar = async () => {
    setError('')
    if (!desbloqueadas()) {
      setHoja(hayCredenciales() ? 'desbloquear' : 'editar')
      return
    }
    setCargando(true)
    try {
      const pagoConsulta = await consultarPago(cuenta.niu)
      await db.cuentas.update(cuenta.id!, { pagoConsulta })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar')
    }
    setCargando(false)
  }

  return (
    <section className="bloque consulta-pago">
      <button className="pequeno" disabled={cargando} onClick={consultar}>
        {cargando ? 'Consultando…' : '💳 Consultar pago'}
      </button>
      <div className="consulta-info">
        {r && !cargando && !error && (
          <span className={'resultado-pago ' + (r.alDia ? 'al-dia' : 'debe')} title={`Consultado ${new Date(r.consultadoEn).toLocaleString('es-CO')}`}>
            <strong>{r.alDia ? '✅ Al día' : '❌ No al día'}</strong>
            <small>Último pago: {r.ultimoPago}{r.valorPagado ? ` · ${r.valorPagado}` : ''}</small>
            {!r.alDia && r.adeudado !== null && r.adeudado !== undefined && (
              <small className="adeudado">
                {r.adeudado > 0
                  ? `Debe: ${formatoPesos(r.adeudado)}${r.periodosPendientes?.length ? ` (${r.periodosPendientes.join(', ')})` : ''}`
                  : 'Sin facturas pendientes'}
              </small>
            )}
          </span>
        )}
        {error && <span className="error">{error.length > 70 ? error.slice(0, 70) + '…' : error}</span>}
      </div>
      <button className="enlace" onClick={() => setHoja(hayCredenciales() ? 'desbloquear' : 'editar')} aria-label="Credenciales del portal">
        🔑
      </button>
      {hoja && (
        <HojaCredenciales
          modo={hoja}
          onCambiar={setHoja}
          onCerrar={() => setHoja(null)}
          onListo={() => {
            setHoja(null)
            consultar()
          }}
        />
      )}
    </section>
  )
}

function HojaCredenciales({
  modo,
  onCambiar,
  onCerrar,
  onListo,
}: {
  modo: 'desbloquear' | 'editar'
  onCambiar: (m: 'desbloquear' | 'editar') => void
  onCerrar: () => void
  onListo: () => void
}) {
  useAtras(onCerrar)
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const editar = modo === 'editar'

  const aceptar = async () => {
    setMsg('')
    setOcupado(true)
    try {
      if (editar) {
        await guardarCredenciales({ usuario: usuario.trim(), clave }, pin)
      } else {
        await desbloquear(pin)
      }
      onListo()
    } catch {
      setMsg(editar ? 'No se pudieron guardar' : 'Clave de desbloqueo incorrecta')
    }
    setOcupado(false)
  }
  const valido = editar ? usuario.trim() !== '' && clave !== '' && pin.length >= 4 : pin !== ''

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cab">
          <strong>Credenciales del portal Oracle</strong>
          <button className="icono" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="ayuda">
          {editar
            ? 'Se guardan cifradas solo en este celular. La clave de desbloqueo no se puede recuperar: si la olvidas, vuelve a escribir las credenciales.'
            : 'Escribe tu clave de desbloqueo para usar las credenciales guardadas.'}
        </p>
        {editar && (
          <>
            <label>
              Usuario
              <input autoFocus autoCapitalize="off" autoComplete="off" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
            </label>
            <label>
              Contraseña del portal
              <input type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />
            </label>
          </>
        )}
        <label>
          {editar ? 'Crea una clave de desbloqueo (mínimo 4)' : 'Clave de desbloqueo'}
          <input type="password" autoFocus={!editar} autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} />
        </label>
        {msg && <p className="error">{msg}</p>}
        <div className="hoja-fila">
          {!editar && (
            <button className="grande" onClick={() => onCambiar('editar')}>
              Cambiar
            </button>
          )}
          <button className="grande primario" disabled={!valido || ocupado} onClick={aceptar}>
            {editar ? 'Guardar' : 'Desbloquear'}
          </button>
        </div>
      </div>
    </div>
  )
}
