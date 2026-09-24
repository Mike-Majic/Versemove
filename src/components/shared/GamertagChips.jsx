import { useEffect, useState } from 'react';
import { GAMERTAG_FIELDS } from '../../data/gaming';
import './GamertagChips.css';

// Gamertag di un profilo come chip "PSN · nome" con il bottone Copia
// (profilo pubblico, anteprima contatto, liste del mondo Nerd). Vuoto se
// il profilo non ne ha o non sono leggibili.
export default function GamertagChips({ gamertags, compact = false, className = '' }) {
  const [copied, setCopied] = useState(null);
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const items = GAMERTAG_FIELDS.filter((f) => gamertags?.[f.key]);
  if (!items.length) return null;

  const copy = async (f) => {
    try {
      await navigator.clipboard.writeText(gamertags[f.key]);
      setCopied(f.key);
    } catch {
      // clipboard non disponibile (http, permessi): resta selezionabile a mano.
    }
  };

  return (
    <ul className={`rb-gamertags ${compact ? 'compact' : ''} ${className}`} aria-label="Gamertag">
      {items.map((f) => (
        <li key={f.key} className="rb-gamertag">
          <span className="rb-gamertag-net">{f.icon} {f.label}</span>
          <span className="rb-gamertag-value">{gamertags[f.key]}</span>
          <button type="button" className="rb-gamertag-copy" onClick={() => copy(f)} aria-label={`Copia il gamertag ${f.label}`}>
            {copied === f.key ? 'Copiato ✓' : 'Copia'}
          </button>
        </li>
      ))}
    </ul>
  );
}
