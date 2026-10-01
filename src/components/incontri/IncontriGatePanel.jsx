import { useTranslation } from 'react-i18next';
import './MatchColumn.css';

// Pannello "cosa manca" del mondo rosso: finché il Profilo Incontri non è
// completo (get_my_dating_profile.visibile false) gli altri non ti vedono e
// tu non vedi loro. Prende il posto di OGNI vista con altre persone: globo,
// Match (mazzo, Mi piace ricevuti, Preferiti), Videochiamata e scheda
// aperta da un link (DatingCardModal). Il proprietario non lo vede mai
// (vedi incontriGate in App.jsx).

// Stesso elenco di missingItems (data/datingLabels.js), tradotto.
function missingItemsT(t, mancano = [], fotoCount = null) {
  const list = mancano
    .filter((m) => m !== 'conferma' || mancano.length === 1)
    .map((m) => {
      if (m === 'foto') {
        if (fotoCount == null) return t('incontriGate.missFoto');
        return fotoCount === 0 ? t('incontriGate.missFoto0') : t('incontriGate.missFotoN', { count: fotoCount });
      }
      if (m === 'domande') return t('incontriGate.missDomande');
      if (m === 'citta') return t('incontriGate.missCitta');
      if (m === 'conferma') return t('incontriGate.missConferma');
      return m;
    });
  // Profilo non visibile senza voci mancanti: manca solo il salvataggio.
  return list.length ? list : [t('incontriGate.missConferma')];
}

export default function IncontriGatePanel({ profile, onComplete, className = '' }) {
  const { t } = useTranslation();
  const items = missingItemsT(t, profile?.mancano, profile?.foto?.length ?? null);
  return (
    <div className={`rb-match-gate ${className}`} role="alert">
      <h3>{t('incontriGate.title')}</h3>
      <p>{t('incontriGate.body')}</p>
      <ul>
        {items.map((it) => (
          <li key={it}>
            <span aria-hidden="true">✗</span> {it}
          </li>
        ))}
      </ul>
      <button type="button" className="rb-match-gate-btn" onClick={() => onComplete?.()}>
        {t('incontriGate.button')}
      </button>
      <p className="rb-match-gate-hint">{t('incontriGate.hint')}</p>
    </div>
  );
}
