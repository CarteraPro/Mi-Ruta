import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

registerSW({ immediate: true })
// Pide que el sistema no borre los datos locales por falta de espacio.
navigator.storage?.persist?.().catch(() => {})

createRoot(document.getElementById('root')!).render(<App />)
