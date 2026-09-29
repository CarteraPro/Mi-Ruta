import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, borrarRuta } from './db'
import { importarExcel } from './importar'

export default function SelectorRuta({ onElegir }: { onElegir: (id: number) => void }) {
  const rutas = useLiveQuery(async () => {
    const todas = await db.rutas.toArray()
    return Promise.all(
      todas.map(async (r) => ({ ...r, total: await db.cuentas.where('rutaId').equals(r.id!).count() })),
    )
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

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
          <div key={r.id} className="ruta-item">
            <button className="ruta-abrir" onClick={() => onElegir(r.id!)}>
              <strong>{r.nombre}</strong>
              <span>{r.total} cuentas</span>
            </button>
            <button className="icono peligro" aria-label="Eliminar ruta" onClick={() => eliminar(r.id!, r.nombre)}>
              🗑
            </button>
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
      <button className="grande primario" disabled={cargando} onClick={() => inputRef.current?.click()}>
        {cargando ? 'Cargando…' : rutas?.length ? '＋ Cargar otra ruta (Excel)' : '📂 Cargar Excel'}
      </button>
      <p className="ayuda">Solo se leen las columnas NIU, NOMBRE, MEDIDOR y DIRECCION_FACTURACION.</p>
      {error && <p className="error">{error}</p>}
      {aviso && <p className="aviso">{aviso}</p>}
    </main>
  )
}
