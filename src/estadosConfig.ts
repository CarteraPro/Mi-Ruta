import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { crearConfig, type ConfigEstados } from './util'

// Nombre y color vigentes de los estados; se actualiza solo cuando se editan.
export function useConfigEstados(): ConfigEstados {
  const ajustes = useLiveQuery(() => db.ajustesEstado.toArray(), [])
  const extras = useLiveQuery(() => db.estadosExtra.toArray(), [])
  return useMemo(() => crearConfig(ajustes ?? [], extras ?? []), [ajustes, extras])
}

export async function cargarConfig(): Promise<ConfigEstados> {
  return crearConfig(await db.ajustesEstado.toArray(), await db.estadosExtra.toArray())
}
