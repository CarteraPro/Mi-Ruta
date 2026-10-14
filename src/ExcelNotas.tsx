import { useMemo, useState } from 'react'
import type { Cuenta } from './db'
import { useAtras } from './atras'
import { exportarNotas } from './exportar'
import { coincideNota, sinAcentos, terminosDe } from './util'

// Palabras que más se repiten en las notas (para filtrar con un toque).
function palabrasFrecuentes(cuentas: Cuenta[]) {
  const cuenta = new Map<string, number>()
  for (const c of cuentas) {
    const unicas = new Set(sinAcentos(c.nota).split(/[^a-z0-9ñ]+/).filter((p) => p.length >= 4))
    unicas.forEach((p) => cuenta.set(p, (cuenta.get(p) ?? 0) + 1))
  }
  return [...cuenta.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
}

// Exporta a Excel solo los usuarios con notas, filtrando por palabra clave (por ejemplo "corregir").
export default function ExcelNotas({ rutaId, cuentas, onCerrar }: { rutaId: number; cuentas: Cuenta[]; onCerrar: () => void }) {
  useAtras(onCerrar)
  const [palabra, setPalabra] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const conNotas = useMemo(() => cuentas.filter((c) => c.nota.trim()), [cuentas])
  const frecuentes = useMemo(() => palabrasFrecuentes(conNotas), [conNotas])
  const terminos = terminosDe(palabra)
  const coinciden = conNotas.filter((c) => coincideNota(c.nota, terminos)).length

  const exportar = async () => {
    setError('')
    setAviso('')
    try {
      const r = await exportarNotas(rutaId, palabra)
      setAviso(`Excel exportado: ${r.archivo} (${r.total} usuarios).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar')
    }
  }

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cab">
          <strong>Excel de usuarios con notas</strong>
          <button className="icono" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="ayuda">
          {conNotas.length ? `${conNotas.length} usuarios tienen notas.` : 'Ningún usuario tiene notas todavía.'} Escribe una palabra clave para exportar solo
          las notas que la contengan (por ejemplo "corregir"); varias palabras separadas por coma. Déjalo vacío para exportar todas.
        </p>
        <input
          placeholder="Palabra clave (opcional)"
          value={palabra}
          aria-label="Palabra clave de las notas"
          onChange={(e) => setPalabra(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && coinciden > 0 && exportar()}
        />
        {frecuentes.length > 0 && (
          <div className="frecuentes">
            {frecuentes.map(([p, n]) => (
              <button key={p} className={'chip' + (sinAcentos(palabra) === p ? ' activo' : '')} onClick={() => setPalabra(sinAcentos(palabra) === p ? '' : p)}>
                {p} <small>({n})</small>
              </button>
            ))}
          </div>
        )}
        <p className="aviso">{coinciden} usuario(s) coinciden{palabra.trim() ? ` con "${palabra.trim()}"` : ''}.</p>
        <button className="grande primario" disabled={coinciden === 0} onClick={exportar}>
          ⬇ Exportar Excel ({coinciden})
        </button>
        <p className="ayuda">Mismas columnas del Excel de la ruta (con X y Y) más NOTAS, en el orden actual de la ruta.</p>
        {error && <p className="error">{error}</p>}
        {aviso && <p className="aviso">{aviso}</p>}
      </div>
    </div>
  )
}
