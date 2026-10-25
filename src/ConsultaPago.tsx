import { useState } from 'react'
import { db, type Cuenta } from './db'
import { useAtras } from './atras'
import { consultarPago, guardarCredenciales, hayCredenciales } from './pagoOracle'

const formatoPesos = (n: number) => '$' + n.toLocaleString('es-CO', { maximumFractionDigits: 0 })

// Muestra solo dos datos del portal Oracle: cuándo fue el último pago y si el usuario está al día.
export default function ConsultaPago({ cuenta }: { cuenta: Cuenta }) {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [hoja, setHoja] = useState(false)
  const r = cuenta.pagoConsulta

  const consultar = async () => {
    setError('')
    if (!hayCredenciales()) {
      setHoja(true)
      return
    }
    setCargando(true)
    try {
      const pagoConsulta = await consultarPago(cuenta.niu)
      // El consumo del mes de la última factura queda como promedio de consumo (solo si el portal lo dio).
      const cambios: Partial<Cuenta> = { pagoConsulta }
      if (pagoConsulta.consumoKwh !== null) cambios.promedio = String(pagoConsulta.consumoKwh)
      await db.cuentas.update(cuenta.id!, cambios)
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
      <button className="enlace" onClick={() => setHoja(true)} aria-label="Credenciales del portal">
        🔑
      </button>
      {hoja && (
        <HojaCredenciales
          onCerrar={() => setHoja(false)}
          onListo={() => {
            setHoja(false)
            consultar()
          }}
        />
      )}
    </section>
  )
}

function HojaCredenciales({ onCerrar, onListo }: { onCerrar: () => void; onListo: () => void }) {
  useAtras(onCerrar)
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const guardar = async () => {
    setMsg('')
    setOcupado(true)
    try {
      await guardarCredenciales({ usuario: usuario.trim(), clave })
      onListo()
    } catch {
      setMsg('No se pudieron guardar')
    }
    setOcupado(false)
  }

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
          {hayCredenciales()
            ? 'Ya hay credenciales guardadas para toda la ruta. Escribe unas nuevas solo si cambiaron.'
            : 'Se escriben una sola vez, sirven para todos los usuarios y quedan cifradas solo en este celular.'}
        </p>
        <label>
          Usuario
          <input autoFocus autoCapitalize="off" autoComplete="off" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        </label>
        <label>
          Contraseña del portal
          <input type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />
        </label>
        {msg && <p className="error">{msg}</p>}
        <button className="grande primario" disabled={usuario.trim() === '' || clave === '' || ocupado} onClick={guardar}>
          Guardar
        </button>
      </div>
    </div>
  )
}