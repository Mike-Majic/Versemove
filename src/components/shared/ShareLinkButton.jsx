import { useEffect, useRef, useState } from 'react';
import { shareLink } from '../../data/deepLinks';

// Pulsante "Condividi link" (vedi data/deepLinks.js): sul telefono apre il
// foglio di condivisione del sistema, altrove copia il link e lo dice per
// due secondi. url può essere una funzione, calcolata solo al clic.
export default function ShareLinkButton({ url, title = 'Versemove', text, className = '', label = '🔗 Condividi', copiedLabel = '✓ Link copiato', ariaLabel }) {
  const [state, setState] = useState('');
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const onClick = async (e) => {
    e.stopPropagation();
    const href = typeof url === 'function' ? url() : url;
    const res = await shareLink({ title, text, url: href });
    if (res !== 'copied' && res !== 'failed') return;
    setState(res);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState(''), res === 'failed' ? 6000 : 2000);
  };

  return (
    <>
      <button type="button" className={className} onClick={onClick} aria-live="polite" aria-label={ariaLabel} title={ariaLabel}>
        {state === 'copied' ? copiedLabel : label}
      </button>
      {state === 'failed' && (
        <input className="rb-share-link-fallback" readOnly value={typeof url === 'function' ? url() : url} onFocus={(e) => e.target.select()} aria-label="Link da copiare" />
      )}
    </>
  );
}
