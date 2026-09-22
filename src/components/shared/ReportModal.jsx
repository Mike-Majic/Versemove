import { useState } from 'react';
import { createReport } from '../../data/reports';
import ModalOverlay from '../ModalOverlay';
import './ReportModal.css';

// Motivi comuni, uguali per qualunque tipo di contenuto segnalato — la
// scelta fine (post/commento/profilo/gruppo/live/evento) la fa già chi
// apre questo modale passando targetType. "Altro" richiede un dettaglio
// scritto, gli altri no. Un chiamante con motivi propri (es. un'offerta
// scaduta) può passare un elenco diverso via la prop `motivi` — "Altro"
// resta sempre in fondo, qualunque sia la lista.
const DEFAULT_MOTIVI = [
  'Contenuto inappropriato',
  'Spam o pubblicità',
  'Molestie o bullismo',
  "Falso profilo o furto d'identità",
  'Rischio per la sicurezza di un minore',
  'Altro',
];

// Modale generico di segnalazione: lo stesso componente serve per post,
// commenti, profili, offerte e (in futuro) gruppi/live/eventi — chi lo apre
// passa solo targetType/targetId/targetLabel (e, se servono motivi diversi
// da quelli di default, `motivi`). targetId resta una stringa anche quando
// il contenuto vive ancora solo in localStorage (non un vero UUID
// Supabase): la tabella reports è pensata apposta per questo, come già
// blocked_contacts.
export default function ReportModal({ targetType, targetId, targetLabel, motivi = DEFAULT_MOTIVI, onClose }) {
  const [motivo, setMotivo] = useState('');
  const [dettagli, setDettagli] = useState('');
  const [stato, setStato] = useState('form'); // form | invio | inviata
  const [errore, setErrore] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!motivo) return;
    if (motivo === 'Altro' && !dettagli.trim()) {
      setErrore('Aggiungi qualche dettaglio per la segnalazione "Altro".');
      return;
    }
    setErrore('');
    setStato('invio');
    const { error } = await createReport({
      targetType,
      targetId: String(targetId),
      motivo,
      dettagli: dettagli.trim() || null,
    });
    if (error) {
      setErrore(error);
      setStato('form');
      return;
    }
    setStato('inviata');
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-report-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>

        {stato === 'inviata' ? (
          <>
            <h3>Segnalazione inviata</h3>
            <p className="rb-report-hint">
              Grazie, è arrivata a owner e moderatori. Non è detto tu riceva una risposta diretta, ma verrà valutata.
            </p>
            <button type="button" className="rb-btn-primary" onClick={onClose}>Chiudi</button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3>Segnala{targetLabel ? ` ${targetLabel}` : ''}</h3>
            <p className="rb-report-hint">Cosa non va? La segnalazione arriva a owner e moderatori.</p>

            <div className="rb-report-motivi">
              {motivi.map((m) => (
                <label key={m} className={`rb-report-motivo ${motivo === m ? 'active' : ''}`}>
                  <input type="radio" name="rb-report-motivo" value={m} checked={motivo === m} onChange={() => setMotivo(m)} />
                  {m}
                </label>
              ))}
            </div>

            <textarea
              className="rb-report-dettagli"
              placeholder="Dettagli (facoltativi, obbligatori per &quot;Altro&quot;)"
              value={dettagli}
              onChange={(e) => setDettagli(e.target.value)}
              rows={3}
            />

            {errore && <p className="rb-privacy-error">{errore}</p>}

            <button type="submit" className="rb-btn-primary" disabled={!motivo || stato === 'invio'}>
              {stato === 'invio' ? 'Invio...' : 'Invia segnalazione'}
            </button>
          </form>
        )}
      </div>
    </ModalOverlay>
  );
}
