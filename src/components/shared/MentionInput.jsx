import { useEffect, useRef, useState } from 'react';
import { searchMentionable } from '../../data/mentions';
import './mentions.css';

// Campo di testo (textarea con multiline, altrimenti input) con i
// suggerimenti "@": digitando @ seguito da lettere (anche nessuna) si apre
// sopra il campo la tendina di search_mentionable (debounce 150 ms);
// frecce, Invio o Tab scelgono, Esc chiude. La scelta scrive "@Nickname "
// (anche con spazi) e aggiunge { id, nickname } a mentions; se l'utente
// cancella il testo di una menzione, la menzione sparisce da sola.
// Tutte le altre props (placeholder, rows, onFocus, onKeyDown, className,
// disabled, aria-*) passano al campo; inputRef dà accesso al campo vero.
const SEARCH_DEBOUNCE_MS = 150;
const TRIGGER = /(^|\s)@([^\s@]{0,30})$/;

export default function MentionInput({
  value,
  onChange,
  mentions = [],
  onMentionsChange,
  contesto = 'generale',
  contestoId = null,
  multiline = false,
  inputRef,
  onKeyDown,
  dropdownTitle,
  className = '',
  ...rest
}) {
  const ownRef = useRef(null);
  const fieldRef = inputRef ?? ownRef;
  const [query, setQuery] = useState(null); // testo dopo "@", null = chiuso
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const triggerStartRef = useRef(0);

  // Menzioni il cui testo è stato cancellato: via.
  useEffect(() => {
    if (!onMentionsChange || !mentions.length) return;
    const kept = mentions.filter((m) => value.includes(`@${m.nickname}`));
    if (kept.length !== mentions.length) onMentionsChange(kept);
  }, [value, mentions, onMentionsChange]);

  useEffect(() => {
    if (query === null) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const list = await searchMentionable(query, contesto, contestoId);
      if (cancelled) return;
      setResults(list);
      setActive(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, contesto, contestoId]);

  const detect = (text, caret) => {
    const m = text.slice(0, caret).match(TRIGGER);
    if (m) {
      triggerStartRef.current = caret - m[2].length - 1;
      setQuery(m[2]);
    } else {
      setQuery(null);
    }
  };

  const handleChange = (e) => {
    onChange(e.target.value);
    detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
  };

  const choose = (person) => {
    const el = fieldRef.current;
    const caret = el?.selectionStart ?? value.length;
    const start = triggerStartRef.current;
    const insert = `@${person.nickname} `;
    const next = value.slice(0, start) + insert + value.slice(caret);
    onChange(next);
    if (onMentionsChange && !mentions.some((m) => m.id === person.id)) {
      onMentionsChange([...mentions, { id: person.id, nickname: person.nickname }]);
    }
    setQuery(null);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + insert.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const open = query !== null && results.length > 0;

  const handleKeyDown = (e) => {
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => (i + 1) % results.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i - 1 + results.length) % results.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        choose(results[active]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setQuery(null);
        return;
      }
    }
    onKeyDown?.(e);
  };

  const Field = multiline ? 'textarea' : 'input';
  return (
    <div className={`rb-mention-wrap ${className}`}>
      <Field
        {...rest}
        ref={fieldRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(e) => detect(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
        onBlur={(e) => {
          rest.onBlur?.(e);
          setTimeout(() => setQuery(null), 150);
        }}
        {...(multiline ? {} : { type: 'text' })}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && (
        <div className="rb-mention-menu" role="listbox">
          <div className="rb-mention-menu-title">{dropdownTitle ?? 'Menziona qualcuno'}</div>
          {results.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`rb-mention-option ${i === active ? 'active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(p)}
            >
              {p.avatar ? (
                <img src={p.avatar} alt="" />
              ) : (
                <span className="rb-mention-letter">{p.nickname.charAt(0).toUpperCase()}</span>
              )}
              <span>{p.nickname}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
