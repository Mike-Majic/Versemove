import { useEffect, useState } from 'react';
import { searchProfiles } from '../../data/friends';
import { useReportUnsaved } from '../../hooks/useUnsavedChanges';
import {
  FAMILY_RELATIONS,
  familyRelationLabel,
  sendFamilyRequest,
  respondToFamilyRequest,
  removeFamilyLink,
  getFamily,
  getReceivedFamilyRequests,
  getSentFamilyRequests,
} from '../../data/family';
import './FamilySection.css';

// Familiari del Profilo Social: collegamento fra account con conferma
// reciproca, stesso schema delle richieste di amicizia (data/friends.js)
// ma con un'etichetta di relazione per lato, calcolata lato server (vedi
// data/family.js). Usata solo nel proprio pannello Profilo: la lista di
// familiari già confermati di un ALTRO utente si vede invece in
// SocialProfileModal (sola lettura, niente gestione richieste lì).
export default function FamilySection({ userId }) {
  const [family, setFamily] = useState(null);
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const reload = async () => {
    const [f, r, s] = await Promise.all([getFamily(userId), getReceivedFamilyRequests(), getSentFamilyRequests()]);
    setFamily(f);
    setReceived(r);
    setSent(s);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleRespond = async (id, accept) => {
    setBusy(true);
    setError('');
    const { error: err } = await respondToFamilyRequest(id, accept);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    reload();
  };

  const handleRemove = async (linkId) => {
    setBusy(true);
    setError('');
    const { error: err } = await removeFamilyLink(linkId);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    reload();
  };

  return (
    <div className="rb-family-section">
      <p className="rb-profile-link-hint">
        Collega altri account come familiari: la conferma è reciproca, come le richieste di amicizia. I familiari
        confermati compaiono nel tuo Profilo Social.
      </p>

      {error && <p className="rb-profile-field-error">{error}</p>}

      {received.length > 0 && (
        <div className="rb-family-group">
          <span className="rb-family-group-title">Richieste ricevute</span>
          <ul className="rb-family-list">
            {received.map((r) => (
              <li key={r.id} className="rb-family-row">
                <img src={r.other.avatar || undefined} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                <div className="rb-family-row-info">
                  <strong>{r.other.name}</strong>
                  <span>vuole essere tuo/a {familyRelationLabel(r.relazione)}</span>
                </div>
                <div className="rb-family-row-actions">
                  <button type="button" className="rb-family-secondary-btn" onClick={() => handleRespond(r.id, false)} disabled={busy}>
                    Rifiuta
                  </button>
                  <button type="button" className="rb-profile-save-btn" onClick={() => handleRespond(r.id, true)} disabled={busy}>
                    Accetta
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sent.length > 0 && (
        <div className="rb-family-group">
          <span className="rb-family-group-title">Richieste inviate</span>
          <ul className="rb-family-list">
            {sent.map((r) => (
              <li key={r.id} className="rb-family-row">
                <img src={r.other.avatar || undefined} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                <div className="rb-family-row-info">
                  <strong>{r.other.name}</strong>
                  <span>in attesa — lo/a hai aggiunto come {familyRelationLabel(r.relazione)}</span>
                </div>
                <button type="button" className="rb-family-secondary-btn" onClick={() => handleRespond(r.id, false)} disabled={busy}>
                  Annulla
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rb-family-group">
        <span className="rb-family-group-title">Familiari</span>
        {family === null ? (
          <p className="rb-profile-link-hint">Caricamento...</p>
        ) : family.length === 0 ? (
          <p className="rb-profile-link-hint">Nessun familiare collegato ancora.</p>
        ) : (
          <ul className="rb-family-list">
            {family.map((f) => (
              <li key={f.linkId} className="rb-family-row">
                <img src={f.other.avatar || undefined} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                <div className="rb-family-row-info">
                  <strong>{f.other.name}</strong>
                  <span>{familyRelationLabel(f.relazione)}</span>
                </div>
                <button type="button" className="rb-family-remove-btn" onClick={() => handleRemove(f.linkId)} disabled={busy} aria-label="Rimuovi familiare">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {adding ? (
        <AddFamilyForm
          onDone={() => {
            setAdding(false);
            reload();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="rb-profile-save-btn" onClick={() => setAdding(true)}>
          + Aggiungi familiare
        </button>
      )}
    </div>
  );
}

function AddFamilyForm({ onDone, onCancel }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [target, setTarget] = useState(null);
  const [relazione, setRelazione] = useState(FAMILY_RELATIONS[0].value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useReportUnsaved(query.trim() !== '' || target !== null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      searchProfiles(query).then((r) => {
        if (!cancelled) setResults(r);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    setError('');
    const { error: err } = await sendFamilyRequest(target.id, relazione);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    onDone();
  };

  return (
    <div className="rb-family-add-form">
      {!target ? (
        <>
          <input type="text" placeholder="Cerca per nickname..." value={query} onChange={(e) => setQuery(e.target.value)} />
          {results.length > 0 && (
            <ul className="rb-family-search-results">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setTarget(r)}>
                    <img src={r.avatar || undefined} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="rb-profile-link-hint">
            Aggiungi <strong>{target.name}</strong> come:
          </p>
          <select value={relazione} onChange={(e) => setRelazione(e.target.value)} className="rb-family-relation-select">
            {FAMILY_RELATIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.selectLabel}</option>
            ))}
          </select>
        </>
      )}
      {error && <p className="rb-profile-field-error">{error}</p>}
      <div className="rb-family-add-actions">
        <button type="button" className="rb-family-secondary-btn" onClick={onCancel}>Annulla</button>
        {target && (
          <button type="button" className="rb-profile-save-btn" onClick={submit} disabled={busy}>
            {busy ? 'Un attimo…' : 'Invia richiesta'}
          </button>
        )}
      </div>
    </div>
  );
}
