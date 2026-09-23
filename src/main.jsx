import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/shared.css'
import './styles/icons.css'
import './i18n'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary'
import { isChunkLoadError, reloadOnceForChunkError, clearChunkReloadFlag } from './fx/lazyWithRetry'

// Se la pagina è arrivata fin qui, il caricamento è andato a buon fine:
// azzera il flag anti-ciclo delle ricariche per i chunk (vedi lazyWithRetry).
clearChunkReloadFlag()

// Un chunk che non c'è più dopo un deploy può fallire anche fuori da React
// (import dinamici, precaricamenti): in quel caso si ricarica una volta sola.
window.addEventListener('error', (e) => {
  if (isChunkLoadError(e?.error ?? e?.message)) reloadOnceForChunkError()
})
window.addEventListener('unhandledrejection', (e) => {
  if (isChunkLoadError(e?.reason)) reloadOnceForChunkError()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
