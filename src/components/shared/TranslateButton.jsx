import { useState } from 'react';
import { translateText } from '../../data/translate.js';
import './TranslateButton.css';

// Bottone "Traduci" generico da affiancare a un testo inserito da un utente
// (post, messaggio, commento...): traduzione letterale in italiano via la
// Edge Function "translate" (richiede login, stessa logica di LinkPreview).
// Comportamento a toggle: un secondo click torna al testo originale senza
// richiamare di nuovo la funzione, la traduzione resta in cache nello stato.
export default function TranslateButton({ text }) {
  const [translated, setTranslated] = useState(null);
  const [showingTranslation, setShowingTranslation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;

  const handleClick = async () => {
    if (showingTranslation) {
      setShowingTranslation(false);
      return;
    }

    if (translated) {
      setShowingTranslation(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await translateText(trimmed);
      setTranslated(result);
      setShowingTranslation(true);
    } catch (err) {
      setError(err.message || 'Traduzione non disponibile al momento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rb-translate-block">
      <button
        type="button"
        className="rb-btn-ghost rb-translate-btn"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? 'Traduzione in corso…' : showingTranslation ? 'Mostra originale' : 'Traduci in italiano'}
      </button>
      {error && <p className="rb-translate-error">{error}</p>}
      {showingTranslation && translated && (
        <p className="rb-translate-text">{translated}</p>
      )}
    </div>
  );
}
