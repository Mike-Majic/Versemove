import { useEffect, useState } from 'react';
import ModalOverlay from '../ModalOverlay';
import { getCandidato } from '../../data/lavoro';
import CandidatoView from './CandidatoView';
import './candidati.css';

// Scheda completa di un candidato per le aziende (mondo Lavoro, "Cerca
// candidati"). get_candidato_lavoro si chiama solo qui, quando la scheda si
// apre: il server registra ogni apertura. La resa è in CandidatoView.

export default function CandidatoModal({ candidato: preview, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getCandidato(preview.id).then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else setData(res.candidato);
    });
    return () => {
      cancelled = true;
    };
  }, [preview.id]);

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-cand-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">
          ✕
        </button>

        <CandidatoView candidato={data ?? preview} data={data}>
          {error && <p className="rb-cand-error" role="alert">{error}</p>}
          {!data && !error && <p className="rb-cand-muted">Carico la scheda…</p>}
        </CandidatoView>
      </div>
    </ModalOverlay>
  );
}
