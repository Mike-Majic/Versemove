import { useEffect, useState } from 'react';
import { listEventi, setMioStatoEvento, formatIntervalloEvento, EVENTO_TIPO_LABELS } from '../../data/eventiCatalogo';
import ExternalLinkButton from '../ExternalLinkButton';
import EmptyState from '../EmptyState';
import './cultural.css';

const PERIODI = [
  { id: 'prossimi', label: 'In programma' },
  { id: 'in_corso', label: 'In corso' },
  { id: 'passati', label: 'Passati' },
];

const FONTE_LABEL = { bot: 'Aggiornato dal bot', curato: 'Selezionato dallo staff', utente: 'Aggiunto da un utente' };

// Eventi di una categoria (tabella events via eventi_vicini): fiere e
// raduni cosplay, fiere del videogioco, festival teatrali, mostre,
// concerti. Li tiene aggiornati il bot (Edge Function events-bot, ogni
// notte) insieme a quelli inseriti dallo staff; per ognuno si può dire
// "Partecipo" o "Mi interessa" e vedere quanti altri l'hanno fatto.
// compact: senza titolo e senza scheda "Passati", per stare in cima alla
// colonna degli eventi della community (CommunityEventsColumn).
export default function EventiColumn({ mondo, categoria, label, user, onOpenAuth, compact = false, emptyHint }) {
  const [periodo, setPeriodo] = useState('prossimi');
  const [tipo, setTipo] = useState(null);
  // { key, list }: la lista vale solo se caricata per gli stessi filtri di
  // adesso, altrimenti si mostra "Carico..." senza azzerare lo stato dentro
  // l'effetto.
  const filtriKey = `${mondo}|${categoria}|${periodo}|${tipo ?? ''}|${user?.id ?? ''}`;
  const [caricato, setCaricato] = useState({ key: '', list: [] });
  const [busyId, setBusyId] = useState(null);
  const eventi = caricato.key === filtriKey ? caricato.list : null;

  useEffect(() => {
    let cancelled = false;
    listEventi({ mondo, categoria, periodo, tipo }).then((list) => {
      if (!cancelled) setCaricato({ key: filtriKey, list });
    });
    return () => {
      cancelled = true;
    };
  }, [mondo, categoria, periodo, tipo, filtriKey]);

  const setEventi = (updater) => setCaricato((prev) => ({ ...prev, list: updater(prev.list) }));

  const tipiPresenti = Array.from(new Set((eventi ?? []).map((e) => e.tipo).filter(Boolean)));

  const toggleStato = async (ev, stato) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    const next = ev.mioStato === stato ? null : stato;
    setBusyId(ev.id);
    const { error } = await setMioStatoEvento(ev.id, next);
    setBusyId(null);
    if (error) return;
    setEventi((prev) =>
      (prev ?? []).map((e) => {
        if (e.id !== ev.id) return e;
        const delta = (s) => (e.mioStato === s ? -1 : 0) + (next === s ? 1 : 0);
        return { ...e, mioStato: next, nPartecipa: e.nPartecipa + delta('partecipa'), nInteressati: e.nInteressati + delta('interessato') };
      }),
    );
  };

  const periodi = compact ? PERIODI.filter((p) => p.id !== 'passati') : PERIODI;

  return (
    <div className={`rb-eventi ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="rb-cultural-header">
          <div>
            <h3>{label}</h3>
            <p>Fiere, raduni e appuntamenti in programma: il bot li aggiorna ogni notte. Dì se ci vai, così ti trovano.</p>
          </div>
        </div>
      )}
      {compact && <h4 className="rb-eventi-compact-title">In programma</h4>}

      <div className="rb-eventi-toolbar">
        <div className="rb-eventi-periodi" role="tablist">
          {periodi.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={periodo === p.id} className={periodo === p.id ? 'active' : ''} onClick={() => setPeriodo(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        {tipiPresenti.length > 1 && (
          <div className="rb-eventi-tipi">
            <button type="button" className={tipo === null ? 'active' : ''} onClick={() => setTipo(null)}>
              Tutti
            </button>
            {tipiPresenti.map((t) => (
              <button key={t} type="button" className={tipo === t ? 'active' : ''} onClick={() => setTipo(t)}>
                {EVENTO_TIPO_LABELS[t] ?? t}
              </button>
            ))}
          </div>
        )}
      </div>

      {eventi === null ? (
        <p className="rb-cultural-status">Carico...</p>
      ) : eventi.length === 0 ? (
        compact ? (
          <p className="rb-cultural-status">{emptyHint ?? 'Nessun evento in programma per ora.'}</p>
        ) : (
          <EmptyState icon="📅" title="Nessun evento qui, per ora" subtitle={emptyHint ?? 'Il bot cerca ogni notte: torna a dare un occhio.'} />
        )
      ) : (
        <ul className="rb-cultural-list rb-eventi-list">
          {eventi.map((ev) => (
            <li key={ev.id} className={`rb-cultural-card rb-eventi-card ${ev.inCorso ? 'in-corso' : ''}`}>
              <div className="rb-eventi-card-top">
                <span className="rb-eventi-when">
                  {ev.inCorso && <span className="rb-eventi-live-dot" aria-label="In corso" />}
                  {formatIntervalloEvento(ev.dataEvento, ev.dataFine)}
                </span>
                {ev.tipo && <span className="rb-eventi-tipo">{EVENTO_TIPO_LABELS[ev.tipo] ?? ev.tipo}</span>}
              </div>
              <div className="rb-cultural-card-info">
                <strong>{ev.titolo}</strong>
                <p className="rb-cultural-card-meta">
                  {[ev.citta, ev.indirizzo, ev.paese && ev.paese !== 'IT' ? ev.paese : null].filter(Boolean).join(' · ')}
                  {ev.distanzaKm != null ? ` · ${ev.distanzaKm} km` : ''}
                </p>
                {ev.descrizione && <p className="rb-cultural-card-desc">{ev.descrizione}</p>}
              </div>
              <div className="rb-eventi-actions">
                <button
                  type="button"
                  className={`rb-cultural-reaction-btn ${ev.mioStato === 'partecipa' ? 'active' : ''}`}
                  disabled={busyId === ev.id}
                  onClick={() => toggleStato(ev, 'partecipa')}
                >
                  ✅ Partecipo{ev.nPartecipa > 0 ? ` · ${ev.nPartecipa}` : ''}
                </button>
                <button
                  type="button"
                  className={`rb-cultural-reaction-btn ${ev.mioStato === 'interessato' ? 'active' : ''}`}
                  disabled={busyId === ev.id}
                  onClick={() => toggleStato(ev, 'interessato')}
                >
                  ⭐ Mi interessa{ev.nInteressati > 0 ? ` · ${ev.nInteressati}` : ''}
                </button>
                {ev.url && (
                  <ExternalLinkButton url={ev.url} className="rb-cultural-reaction-btn rb-eventi-link">
                    🔗 Sito ufficiale
                  </ExternalLinkButton>
                )}
              </div>
              <span className="rb-eventi-fonte">{FONTE_LABEL[ev.fonte] ?? ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
