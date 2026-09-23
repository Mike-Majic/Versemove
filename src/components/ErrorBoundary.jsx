import { Component } from 'react';
import { isChunkLoadError, reloadOnceForChunkError } from '../fx/lazyWithRetry';
import './ErrorBoundary.css';

// Rete di sicurezza: senza di questa, un errore in un singolo pannello o un
// chunk non più esistente dopo un deploy facevano sparire tutta l'interfaccia
// (schermo nero). Qui l'errore viene mostrato con un modo per uscirne, e i
// soli errori di caricamento chunk fanno ricaricare la pagina una volta.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Versemove] errore non gestito:', error, info?.componentStack);
    if (isChunkLoadError(error)) reloadOnceForChunkError();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkLoadError(error);
    const retry = () => {
      this.setState({ error: null });
      this.props.onReset?.();
    };

    return (
      <div className="rb-error-boundary" role="alert">
        <div className="rb-error-card">
          <h2>{chunk ? 'Aggiornamento in corso' : 'Qualcosa non ha funzionato'}</h2>
          <p>
            {chunk
              ? 'Il sito è stato aggiornato mentre lo stavi usando. Ricarica per continuare.'
              : 'Questa parte di Versemove ha avuto un problema. Puoi riprovare o ricaricare la pagina.'}
          </p>
          <div className="rb-error-actions">
            {!chunk && (
              <button type="button" onClick={retry}>
                Riprova
              </button>
            )}
            <button type="button" className="primary" onClick={() => window.location.reload()}>
              Ricarica
            </button>
          </div>
          {/* Anche in produzione: serve a chi ci segnala il problema per
              mandarci lo screenshot con il motivo esatto. */}
          <details className="rb-error-details">
            <summary>Dettagli tecnici</summary>
            <pre>{String(error?.stack ?? error?.message ?? error).slice(0, 800)}</pre>
          </details>
        </div>
      </div>
    );
  }
}
