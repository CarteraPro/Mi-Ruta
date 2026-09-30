import { useEffect, useRef } from 'react'

// Botón "atrás" del celular: cada capa abierta (foto ampliada, lista, hoja, diálogo, ruta abierta…) registra una
// entrada en el historial del navegador. Atrás cierra la capa de arriba. En la pantalla inicial, el primer atrás
// avisa y solo el segundo (en menos de 2.5 s) deja salir de la app.

type Capa = { id: number; cerrar: () => boolean | void }

const pila: Capa[] = []
let contador = 0
let armado = false // el historial solo se toca después de la primera interacción real del usuario (regla de Chrome)
let esperando = 0 // popstate que esperamos por nuestros propios history.back()
let ocupado = false
const ops: ('push' | 'back')[] = []
let ultimoAtrasRaiz = 0
let toast: HTMLDivElement | null = null
let toastTimer = 0

function correr() {
  while (!ocupado && ops.length) {
    if (ops.shift() === 'push') {
      history.pushState({ miRuta: true }, '')
    } else {
      ocupado = true
      esperando++
      history.back()
    }
  }
}

function encolar(op: 'push' | 'back') {
  if (!armado) return
  ops.push(op)
  correr()
}

export function aviso(texto: string) {
  if (!toast) {
    toast = document.createElement('div')
    toast.className = 'toast'
    document.body.appendChild(toast)
  }
  toast.textContent = texto
  toast.classList.add('visible')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast?.classList.remove('visible'), 2400)
}

// Registra una capa; devuelve la función que la quita (cuando se cierra desde la propia pantalla).
export function alAtras(cerrar: () => boolean | void) {
  const id = ++contador
  pila.push({ id, cerrar })
  encolar('push')
  return () => {
    const i = pila.findIndex((c) => c.id === id)
    if (i === -1) return // ya la cerró el botón atrás
    pila.splice(i, 1)
    encolar('back') // quita su entrada del historial
  }
}

export function useAtras(cerrar: () => boolean | void, activo = true) {
  const ref = useRef(cerrar)
  ref.current = cerrar
  useEffect(() => {
    if (!activo) return
    return alAtras(() => ref.current())
  }, [activo])
}

function alPopstate() {
  if (esperando > 0) {
    esperando--
    ocupado = false
    correr()
    return
  }
  if (!armado) return
  const arriba = pila.pop()
  if (arriba) {
    // si la capa no se puede cerrar ahora (p. ej. está trabajando), se queda y se repone su entrada
    if (arriba.cerrar() === false) {
      pila.push(arriba)
      encolar('push')
    }
    return
  }
  // pantalla inicial: doble atrás para salir
  const ahora = Date.now()
  if (ahora - ultimoAtrasRaiz < 2500) {
    ultimoAtrasRaiz = 0
    history.back()
    return
  }
  ultimoAtrasRaiz = ahora
  aviso('Presiona atrás otra vez para salir')
  encolar('push')
}

function armar() {
  if (armado) return
  armado = true
  window.removeEventListener('pointerup', armar, true)
  window.removeEventListener('keydown', armar, true)
  // entrada base (para el doble atrás) + una por cada capa que ya estaba abierta
  ops.push('push')
  pila.forEach(() => ops.push('push'))
  correr()
}

export function instalarAtras() {
  window.addEventListener('popstate', alPopstate)
  window.addEventListener('pointerup', armar, true)
  window.addEventListener('keydown', armar, true)
}
