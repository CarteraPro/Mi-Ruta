import type { ReactNode } from 'react'
import { DIAS_NUEVO, type Plan } from './actualizar'

const LIMITE = 200
const ETIQUETA = { nombre: 'Nombre', medidor: 'Medidor', direccion: 'Dirección' } as const

function Seccion({ titulo, total, children }: { titulo: string; total: number; children: ReactNode }) {
  if (!total) return null
  return (
    <details className="sec">
      <summary>
        {titulo} <b>{total}</b>
      </summary>
      <ul>{children}</ul>
      {total > LIMITE && <p className="ayuda">…y {total - LIMITE} más.</p>}
    </details>
  )
}

export default function Resumen({
  plan,
  ruta,
  ocupado,
  onCancelar,
  onAplicar,
}: {
  plan: Plan
  ruta: string
  ocupado: boolean
  onCancelar: () => void
  onAplicar: () => void
}) {
  const hayCambios = plan.nuevas.length + plan.cambios.length + plan.anuladas.length + plan.reactivadas.length > 0

  return (
    <div className="hoja-fondo">
      <div className="hoja">
        <div className="hoja-cab">
          <strong>Actualizar "{ruta}"</strong>
        </div>
        <p className="ayuda">Tu orden, colores, notas, fotos y marcas de vereda no se tocan. Revisa antes de aplicar:</p>

        {plan.anuladas.length > 10 && plan.anuladas.length > plan.resultado.length * 0.3 && (
          <p className="error">
            ⚠ {plan.anuladas.length} de {plan.resultado.length} usuarios quedarían ANULADOS. ¿Seguro que es el Excel de
            esta ruta?
          </p>
        )}
        {!hayCambios &&<p className="aviso">El Excel no trae diferencias con tu ruta.</p>}

        <Seccion titulo="🆕 Usuarios nuevos" total={plan.nuevas.length}>
          {plan.nuevas.slice(0, LIMITE).map(({ cuenta, ubicacion }) => (
            <li key={cuenta.niu + cuenta.medidor}>
              <strong>{cuenta.nombre || '(sin nombre)'}</strong> · NIU {cuenta.niu}
              <br />
              <span>{ubicacion}</span>
            </li>
          ))}
        </Seccion>

        <Seccion titulo="✏️ Datos que cambian" total={plan.cambios.length}>
          {plan.cambios.slice(0, LIMITE).map(({ cuenta, diffs }) => (
            <li key={cuenta.id}>
              <strong>{cuenta.nombre || cuenta.niu}</strong> · NIU {cuenta.niu}
              {diffs.map((d) => (
                <div key={d.campo} className="diff">
                  {ETIQUETA[d.campo]}: <s>{d.antes || '—'}</s> → {d.despues}
                </div>
              ))}
            </li>
          ))}
        </Seccion>

        <Seccion titulo="🚫 Matrículas que se marcan ANULADAS (ya no vienen)" total={plan.anuladas.length}>
          {plan.anuladas.slice(0, LIMITE).map((c) => (
            <li key={c.id}>
              <strong>{c.nombre || '(sin nombre)'}</strong> · NIU {c.niu}
            </li>
          ))}
        </Seccion>

        <Seccion titulo="↩ Anuladas que reaparecen (se reactivan)" total={plan.reactivadas.length}>
          {plan.reactivadas.slice(0, LIMITE).map((c) => (
            <li key={c.id}>
              <strong>{c.nombre || '(sin nombre)'}</strong> · NIU {c.niu}
            </li>
          ))}
        </Seccion>

        <p className="ayuda">
          {plan.sinCambio} sin cambios
          {plan.omitidas ? ` · ${plan.omitidas} filas del Excel sin NIU omitidas` : ''}. Los nuevos quedan marcados
          NUEVO por {DIAS_NUEVO} días. Podrás deshacer esta actualización.
        </p>

        <div className="hoja-fila">
          <button className="grande" onClick={onCancelar} disabled={ocupado}>
            Cancelar
          </button>
          <button className="grande primario" onClick={onAplicar} disabled={ocupado || !hayCambios}>
            {ocupado ? 'Aplicando…' : 'Aplicar'}
          </button>
        </div>
      </div>
    </div>
  )
}
