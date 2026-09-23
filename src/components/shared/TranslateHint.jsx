import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateText } from '../../data/translate.js';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import InfoBadge from '../InfoBadge';
import './TranslateHint.css';

const LANG_NAME_BY_CODE = Object.fromEntries(SUPPORTED_LANGUAGES.map((l) => [l.code, l.nativeLabel]));

// Link piccolo "Traduci messaggio" sotto un testo scritto in un'altra lingua
// (post o messaggio diretto): compare SOLO se la lingua salvata col
// messaggio (chi scrive, non chi guarda) è diversa dalla lingua attiva
// dell'app in questo momento — niente traduzione automatica, per non
// consumare inutilmente le chiamate a Gemini su testi già nella lingua
// giusta (richiesta esplicita di Mike). Un click chiama la Edge Function
// "translate" una sola volta, poi il risultato resta in cache nello stato;
// un secondo click torna al testo originale senza richiamarla di nuovo.
export default function TranslateHint({ text, sourceLang }) {
  const { i18n } = useTranslation();
  const [translated, setTranslated] = useState(null);
  const [showingTranslation, setShowingTranslation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const trimmed = String(text ?? '').trim();
  if (!trimmed || !sourceLang || sourceLang === i18n.language) return null;

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
      const result = await translateText(trimmed, i18n.language);
      setTranslated(result);
      setShowingTranslation(true);
    } catch (err) {
      setError(err.message || 'Traduzione non disponibile al momento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rb-translate-hint">
      <button type="button" className="rb-translate-hint-link" onClick={handleClick} disabled={loading}>
        {loading ? 'Traduzione in corso…' : showingTranslation ? 'Mostra originale' : 'Traduci messaggio'}
      </button>
      {error && <p className="rb-translate-hint-error">{error}</p>}
      {showingTranslation && translated && (
        <p className="rb-translate-hint-text">
          {translated}
          <InfoBadge text={`Tradotto automaticamente da ${LANG_NAME_BY_CODE[sourceLang] ?? sourceLang}.`} />
        </p>
      )}
    </div>
  );
}
