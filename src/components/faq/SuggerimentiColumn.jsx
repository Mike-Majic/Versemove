import { useEffect, useState } from 'react';
import {
  listFaqSuggestions,
  createFaqSuggestion,
  toggleFaqSuggestionVote,
  updateFaqSuggestionStatus,
} from '../../data/faq';
import { WORLDS } from '../../data/worlds';
import CustomSelect from '../shared/CustomSelect';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';

const ORDER_OPTIONS = [
  { value: 'votati', label: 'Più votati' },
  { value: 'recenti', label: 'Più recenti' },
];

const STATO_OPTIONS = [
  { value: 'aperto', label: 'Aperto' },
  { value: 'in_valutazione', label: 'In valutazione' },
  { value: 'pianificato', label: 'Pianificato' },
  { value: 'fatto', label: 'Fatto' },
  { value: 'scartato', label: 'Scartato' },
];
const STATO_LABEL = Object.fromEntries(STATO_OPTIONS.map((o) => [o.value, o.label]));

const WORLD_OPTIONS = [{ value: '', label: 'Nessuno in particolare' }, ...WORLDS.map((w) => ({ value: w.id, label: w.label }))];

function SuggestionCard({ s, user, onOpenAuth, staff, onChanged }) {
  const [voting, setVoting] = useState(false);
  const [stato, setStato] = useState(s.stato);
  const [risposta, setRisposta] = useState(s.rispostaStaff ?? '');
  const [saving, setSaving] = useState(false);

  const vote = async () => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    setVoting(true);
    await toggleFaqSuggestionVote(s.id, s.hoVotato);
    setVoting(false);
    onChanged();
  };

  const saveStaff = async () => {
    setSaving(true);
    await updateFaqSuggestionStatus(s.id, stato, risposta);
    setSaving(false);
    onChanged();
  };

  return (
    <li className="rb-faq-suggestion-card">
      <div className="rb-faq-suggestion-head">
        <button type="button" className={`rb-faq-vote-btn ${s.hoVotato ? 'active' : ''}`} onClick={vote} disabled={voting}>
          👍 {s.voti}
        </button>
        <div>
          <strong>{s.titolo}</strong>
          {s.mondo && <span className="rb-faq-suggestion-world"> · {s.mondo}</span>}
        </div>
        <span className={`rb-faq-stato-badge rb-faq-stato-${s.stato}`}>{STATO_LABEL[s.stato] ?? s.stato}</span>
      </div>
      {s.testo && <p className="rb-faq-suggestion-testo">{s.testo}</p>}
      {s.rispostaStaff && <p className="rb-faq-suggestion-risposta">Staff: {s.rispostaStaff}</p>}

      {staff && (
        <div className="rb-faq-suggestion-staff">
          <CustomSelect value={stato} options={STATO_OPTIONS} onChange={setStato} ariaLabel="Stato suggerimento" />
          <input
            type="text"
            placeholder="Risposta dello staff (facoltativa)"
            value={risposta}
            onChange={(e) => setRisposta(e.target.value)}
          />
          <button type="button" className="rb-reset-filters-btn" onClick={saveStaff} disabled={saving}>
            Salva
          </button>
        </div>
      )}
    </li>
  );
}

// Idee della community, votabili con un semplice 👍 (nessun voto negativo):
// lo staff (owner/moderatori) può cambiare stato e lasciare una risposta,
// lo impone la RLS lato server, qui il controllo `staff` è solo per
// mostrare o nascondere i controlli.
export default function SuggerimentiColumn({ user, onOpenAuth, staff }) {
  const [suggestions, setSuggestions] = useState(null);
  const [ordinamento, setOrdinamento] = useState('votati');
  const [formOpen, setFormOpen] = useState(false);
  const [titolo, setTitolo] = useState('');
  const [testo, setTesto] = useState('');
  const [mondo, setMondo] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const refresh = () => listFaqSuggestions({ ordinamento }).then(setSuggestions);

  useEffect(() => {
    setSuggestions(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordinamento]);

  const submit = async (e) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth?.();
      return;
    }
    if (!titolo.trim()) {
      setError('Manca il titolo.');
      return;
    }
    setSending(true);
    setError('');
    const { error: err } = await createFaqSuggestion({ titolo, testo, mondo });
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    setTitolo('');
    setTesto('');
    setMondo('');
    setFormOpen(false);
    refresh();
  };

  return (
    <div className="rb-faq-column">
      <div className="rb-faq-suggestions-header">
        <CustomSelect value={ordinamento} options={ORDER_OPTIONS} onChange={setOrdinamento} ariaLabel="Ordina per" />
        <button type="button" className="rb-btn-primary" onClick={() => (user ? setFormOpen((v) => !v) : onOpenAuth?.())}>
          + Nuovo suggerimento
        </button>
      </div>

      {formOpen && (
        <form className="rb-faq-form" onSubmit={submit}>
          <label className="rb-field">
            <span>Titolo</span>
            <input type="text" value={titolo} onChange={(e) => setTitolo(e.target.value)} />
          </label>
          <label className="rb-field">
            <span>Descrizione (facoltativa)</span>
            <textarea rows={3} value={testo} onChange={(e) => setTesto(e.target.value)} />
          </label>
          <label className="rb-field">
            <span>Mondo (facoltativo)</span>
            <CustomSelect value={mondo} options={WORLD_OPTIONS} onChange={setMondo} ariaLabel="Mondo" />
          </label>
          {error && <p className="rb-privacy-error">{error}</p>}
          <button type="submit" className="rb-btn-primary" disabled={sending}>
            {sending ? 'Invio…' : 'Pubblica suggerimento'}
          </button>
        </form>
      )}

      {suggestions === null ? (
        <Skeleton lines={4} />
      ) : suggestions.length === 0 ? (
        <EmptyState icon="💡" title="Nessun suggerimento ancora" subtitle="Proponi la prima idea." />
      ) : (
        <ul className="rb-faq-suggestions-list">
          {suggestions.map((s) => (
            <SuggestionCard key={s.id} s={s} user={user} onOpenAuth={onOpenAuth} staff={staff} onChanged={refresh} />
          ))}
        </ul>
      )}
    </div>
  );
}
