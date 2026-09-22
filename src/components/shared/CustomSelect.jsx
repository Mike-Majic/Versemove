import { useEffect, useRef, useState } from 'react';
import './CustomSelect.css';

// Tendina custom coerente col tema scuro dell'app (bordo/testo colorati
// con --accent), al posto del <select> nativo del browser che su alcuni
// dispositivi appare bianco e stona. Stesso pattern nato per "Ordina per"
// nella Libreria (FreeBooksCatalog.jsx) — qui estratto per riusarlo dove
// serve senza duplicare il componente una terza volta.
export default function CustomSelect({ value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div className="rb-select" ref={ref}>
      <button
        type="button"
        className="rb-select-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span>{current?.label}</span>
        <svg className={`rb-select-arrow${open ? ' open' : ''}`} width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="rb-select-menu">
          {options.map((o) => (
            <li key={o.value}>
              <button type="button" className={o.value === value ? 'active' : ''} onClick={() => { onChange(o.value); setOpen(false); }}>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
