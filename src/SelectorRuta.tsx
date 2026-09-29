import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, borrarRuta } from './db'
import { importarExcel, leerFilas } from './importar'
import { aplicarPlan, deshacerActualizacion, planificar, type Plan } from './actualizar'
import Resumen from './Resumen'

const fechaCorta = (t: number) => new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

export default function SelectorRuta({ onElegir }: { onElegir: (id: number) => void }) {
  const rutas = useLiveQuery(async () => {
    const todas = await db.rutas.toArray()
    return Promise.all(
      todas.map(async (r) => ({
        ...r,
        total: await db.cuentas.where('rutaId').equals(r.id!).count(),
        copia: (await db.copias.get(r.id!))?.fecha,
      })),
    )
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const actualizarRef = useRef<HTMLInputElement>(null)
  const rutaAActualizar = useRef<number | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [plan, setPlan] = useState<{ plan: Plan; ruta: string } | null>(null)

  const subir = async (file: File | undefined) => {
    if (!file) return
    setError('')
    setAviso('')
    setCargando(true)
    try {
      const nombre = file.name.replace(/\.(xlsx|xls|csv)$/i, '')
      const r = await importarExcel(file, nombre)
      if (r.omitidas) setAviso(`${r.importadas} cuentas cargadas. Se omitieron ${r.omitidas} filas sin NIU.`)
      onElegir(r.rutaId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo')
    } finally {
      setCargando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  // Actualizar una ruta existente con un Excel nuevo: primero se muestra el resumen.
  const revisarActualizacion = async (file: File | undefined) => {
    const rutaId = rutaAActualizar.current
    if (!file || rutaId === null) return
    setError('')
    setAviso('')
    setCargando(true)
    try {
      const { filas, omitidas } = await leerFilas(file)
      const cuentas = await db.cuentas.where('[rutaId+orden]').between([rutaId, 0], [rutaId, Infinity]).toArray()
      const ruta = await db.rutas.get(rutaId)
      setPlan({ plan: planificar(rutaId, cuentas, filas, omitidas), ruta: ruta?.nombre ?? '' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo')
    } finally {
      setCargando(false)
      if (actualizarRef.current) actualizarRef.current.value = ''
    }
  }

  const aplicar = async () => {
    if (!plan) return
    setCargando(true)
    try {
      await aplicarPlan(plan.plan)
      const p = plan.plan
      setAviso(`Ruta actualizada: ${p.nuevas.length} nuevos, ${p.cambios.length} con cambios, ${p.anuladas.length} anulados.`)
      setPlan(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la ruta')
    } finally {
      setCargando(false)
    }
  }

  const deshacer = async (id: number, fecha: number) => {
    if (
      confirm(
        `¿Deshacer la actualización del ${fechaCorta(fecha)}? La ruta vuelve a como estaba antes; se pierden los cambios hechos después (notas, fotos, orden…).`,
      )
    ) {
      await deshacerActualizacion(id)
      setAviso('Actualización deshecha.')
    }
  }

  const eliminar = async (id: number, nombre: string) => {
    if (confirm(`¿Eliminar la ruta "${nombre}" con todas sus fotos y datos? No se puede deshacer.`)) {
      await borrarRuta(id)
    }
  }

  return (
    <main className="pantalla centrada">
      <h1 className="logo">Mi ruta</h1>
      <p className="sub">
        {rutas?.length ? '¿Cuál es tu ruta?' : 'Para empezar, carga el archivo Excel de tu ruta.'}
      </p>

      <div className="lista-rutas">
        {rutas?.map((r) => (
          <div key={r.id}>
            <div className="ruta-item">
              <button className="ruta-abrir" onClick={() => onElegir(r.id!)}>
                <strong>{r.nombre}</strong>
                <span>{r.total} cuentas</span>
              </button>
              <button
                className="icono"
                aria-label="Actualizar con un Excel nuevo"
                disabled={cargando}
                onClick={() => {
                  rutaAActualizar.current = r.id!
                  actualizarRef.current?.click()
                }}
              >
                🔄
              </button>
              <button className="icono peligro" aria-label="Eliminar ruta" onClick={() => eliminar(r.id!, r.nombre)}>
                🗑
              </button>
            </div>
            {r.copia && (
              <button className="enlace" onClick={() => deshacer(r.id!, r.copia!)}>
                ↩ Deshacer la actualización del {fechaCorta(r.copia)}
              </button>
            )}
          </div>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(e) => subir(e.target.files?.[0])}
      />
      <input
        ref={actualizarRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(e) => revisarActualizacion(e.target.files?.[0])}
      />
      <button className="grande primario" disabled={cargando} onClick={() => inputRef.current?.click()}>
        {cargando ? 'Cargando…' : rutas?.length ? '＋ Cargar otra ruta (Excel)' : '📂 Cargar Excel'}
      </button>
      <p className="ayuda">
        Solo se leen las columnas NIU, NOMBRE, MEDIDOR y DIRECCION_FACTURACION.
        {rutas?.length ? ' Con 🔄 actualizas una ruta con el Excel nuevo de la empresa sin perder tu orden.' : ''}
      </p>
      {error && <p className="error">{error}</p>}
      {aviso && <p className="aviso">{aviso}</p>}

      {plan && <Resumen plan={plan.plan} ruta={plan.ruta} ocupado={cargando} onCancelar={() => setPlan(null)} onAplicar={aplicar} />}
    </main>
  )
}
