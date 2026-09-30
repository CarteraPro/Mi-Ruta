import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'
import { instalarAtras } from './atras'

registerSW({ immediate: true })
// Pide que el sistema no borre los datos locales por falta de espacio.
navigator.storage?.persist?.().catch(() => {})

// Se quitan los menús nativos de mantener presionado (copiar, descargar vínculo, guardar imagen…) y la
// selección de texto. Solo se conservan en los campos donde se escribe.
const enCampo = (t: EventTarget | null) => {
  const el = t instanceof Node ? (t instanceof Element ? t : t.parentElement) : null
  return !!el?.closest('input, textarea')
}
document.addEventListener('contextmenu', (e) => {
  if (!enCampo(e.target)) e.preventDefault()
})
document.addEventListener('selectstart', (e) => {
  if (!enCampo(e.target)) e.preventDefault()
})
document.addEventListener('dragstart', (e) => e.preventDefault())
instalarAtras()

createRoot(document.getElementById('root')!).render(<App />)
