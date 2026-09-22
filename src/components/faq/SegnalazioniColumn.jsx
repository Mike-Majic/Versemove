import { useEffect, useState } from 'react';
import { createReport, getReports } from '../../data/reports';
import { supabase } from '../../data/supabaseClient';
import CustomSelect from '../shared/CustomSelect';
import Skeleton from '../Skeleton';
import EmptyState from '../EmptyState';

const CATEGORIE = [
  { value: 'Bug', label: 'Bug' },
  { value: 'Contenuto offensivo', label: 'Contenuto offensivo' },
  { value: 'Account', label: 'Account' },
  { value: 'Altro', label: 'Altro' },
];

const STATO_LABEL = { aperto: 'Aperto', in_lavorazione: 'In lavorazione', chiuso: 'Chiuso' };

// Segnala un problema generico dell'app (target_type='app', target_id='app'
// — la stessa tabella reports usata per segnalare contenuti/profili, vedi
// data/reports.js e ReportModal.jsx) più lo storico delle proprie
// segnalazioni, con lo stato che lo staff gli assegna dalla Stanza MOD/
// dal pannello Backend.
export default function SegnalazioniColumn({ user, onOpenAuth }) {
  const [categoria, setCategoria] = useState('Bug');
  const [descrizione, setDescrizione] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [mine, setMine] = useState(null);

  const refreshMine = () => {
    if (!user) {
      setMine([]);
      return;
    }
    getReports().then((all) => setMine(all.filter((r) => r.reporterId === user.id)));
  };

  useEffect(refreshMine, [user]);

  const submit = async (e) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth?.();
      return;
    }
    if (!descrizione.trim()) {
      setError('Descrivi il problema.');
      return;
    }
    setSending(true);
    setError('');
    let dettagli = descrizione.trim();
    if (screenshot) {
      const path = `${user.id}/report-${Date.now()}-${screenshot.name}`;
      const { error: uploadError } = await supabase.storage.from('content-media').upload(path, screenshot);
      if (!uploadError) {
        const { data } = supabase.storage.from('content-media').getPublicUrl(path);
        dettagli += `\n\nScreenshot: ${data.publicUrl}`;
      }
    }
    const { error: err } = await createReport({ targetType: 'app', targetId: 'app', motivo: categoria, dettagli });
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    setSent(true);
    setDescrizione('');
    setScreenshot(null);
    refreshMine();
  };

  return (
    <div className="rb-faq-column">
      <form className="rb-faq-form" onSubmit={submit}>
        <h3>Segnala un problema</h3>
        {!user ? (
          <button type="button" className="rb-btn-primary" onClick={onOpenAuth}>Accedi per segnalare</button>
        ) : (
          <>
            <label className="rb-field">
              <span>Categoria</span>
              <CustomSelect value={categoria} options={CATEGORIE} onChange={setCategoria} ariaLabel="Categoria del problema" />
            </label>
            <label className="rb-field">
              <span>Descrizione</span>
              <textarea rows={4} value={descrizione} onChange={(e) => setDescrizione(e.target.value)} />
            </label>
            <label className="rb-field">
              <span>Screenshot (facoltativo)</span>
              <input type="file" accept="image/*" onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)} />
            </label>
            {error && <p className="rb-privacy-error">{error}</p>}
            {sent && <p className="rb-faq-hint">Segnalazione inviata, grazie.</p>}
            <button type="submit" className="rb-btn-primary" disabled={sending}>
              {sending ? 'Invio…' : 'Invia segnalazione'}
            </button>
          </>
        )}
      </form>

      <div className="rb-faq-mine">
        <h3>Le mie segnalazioni</h3>
        {mine === null ? (
          <Skeleton lines={3} />
        ) : mine.length === 0 ? (
          <EmptyState icon="🚩" title="Nessuna segnalazione ancora" />
        ) : (
          <ul className="rb-faq-mine-list">
            {mine.map((r) => (
              <li key={r.id} className="rb-faq-mine-item">
                <span>
                  <strong>{r.motivo}</strong> · {r.targetType}
                </span>
                <span className={`rb-faq-stato-badge rb-faq-stato-${r.stato}`}>{STATO_LABEL[r.stato] ?? r.stato}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
