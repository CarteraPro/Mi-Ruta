import type { ReactNode } from 'react'
import { UMBRAL_LEJOS_M, type PlanKml } from './kml'

const LIMITE = 200
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)} km` : `${Math.round(n)} m`)

function Seccion({ titulo, total, abierta, children }: { titulo: string; total: number; abierta?: boolean; children: ReactNode }) {
  if (!total) return null
  return (
    <details className="sec" open={abierta}>
      <summary>
        {titulo} <b>{total}</b>
      </summary>
      <ul>{children}</ul>
      {total > LIMITE && <p className="ayuda">…y {total - LIMITE} más.</p>}
    </details>
  )
}

export default function ResumenKml({ plan, ocupado, onCancelar, onAplicar }: { plan: PlanKml; ocupado: boolean; onCancelar: () => void; onAplicar: () => void }) {
  const lejos = plan.movimientos.filter((m) => m.metros !== null && m.metros > UMBRAL_LEJOS_M)
  const hay = plan.movimientos.length > 0

  return (
    <div className="hoja-fondo hoja-encima" onClick={(e) => e.stopPropagation()}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cab">
          <strong>Revisar coordenadas del KML</strong>
        </div>
        <p className="ayuda">Solo cambia la ubicación (X, Y). El resto de los datos de cada usuario no se toca.</p>

        {!hay && <p className="aviso">El KML no trae ninguna coordenada distinta a las que ya tienes.</p>}
        {lejos.length > 0 && (
          <p className="error">
            ⚠ {lejos.length} punto(s) se mueven más de {UMBRAL_LEJOS_M} m. Revísalos antes de aplicar.
          </p>
        )}

        <Seccion titulo="📍 Coordenadas que se actualizan" total={plan.movimientos.length} abierta>
          {plan.movimientos.slice(0, LIMITE).map((m) => {
            const lejano = m.metros !== null && m.metros > UMBRAL_LEJOS_M
            return (
              <li key={m.cuenta.id} className={lejano ? 'lejos' : ''}>
                <strong>{m.cuenta.nombre || m.cuenta.niu}</strong> · NIU {m.nombrePunto}
                <div className="diff">
                  {m.metros === null ? 'Sin ubicación antes → nueva ubicación' : `Se mueve ${fmt(m.metros)}`}
                </div>
              </li>
            )
          })}
        </Seccion>

        <Seccion titulo="⚠ Puntos repetidos (no se aplican)" total={plan.repetidos.length}>
          {plan.repetidos.slice(0, LIMITE).map((r, i) => (
            <li key={i}>
              <strong>{r.nombre}</strong>
              <div className="diff">{r.motivo}</div>
            </li>
          ))}
        </Seccion>

        <Seccion titulo="❔ NIU que no están en la ruta (se ignoran)" total={plan.noEncontrados.length}>
          {plan.noEncontrados.slice(0, LIMITE).map((r, i) => (
            <li key={i}>
              <strong>{r.nombre}</strong>
              <div className="diff">{r.motivo}</div>
            </li>
          ))}
        </Seccion>

        <Seccion titulo="🚫 Puntos no válidos (se ignoran)" total={plan.invalidos.length}>
          {plan.invalidos.slice(0, LIMITE).map((r, i) => (
            <li key={i}>
              <strong>{r.nombre}</strong>
              <div className="diff">{r.motivo}</div>
            </li>
          ))}
        </Seccion>

        <p className="ayuda">
          {plan.sinCambio} sin cambios
          {plan.ignorados ? ` · ${plan.ignorados} marcas que no son puntos (líneas o áreas) ignoradas` : ''}. Podrás deshacer esta importación.
        </p>

        <div className="hoja-fila">
          <button className="grande" onClick={onCancelar} disabled={ocupado}>
            Cancelar
          </button>
          <button className="grande primario" onClick={onAplicar} disabled={ocupado || !hay}>
            {ocupado ? 'Aplicando…' : 'Aplicar'}
          </button>
        </div>
      </div>
    </div>
  )
}
