import { useEffect, useState } from 'react';
import ModalOverlay from '../ModalOverlay';
import AvatarImg from '../shared/AvatarImg';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { getCandidato, candidatoCvUrl, titoloStudioLabel, formatDataIt } from '../../data/lavoro';
import './candidati.css';

// Scheda completa di un candidato per le aziende (mondo Lavoro, "Cerca
// candidati"). get_candidato_lavoro si chiama solo qui, quando la scheda si
// apre: il server registra ogni apertura.

function telHref(n) {
  return `tel:${String(n).replace(/[^\d+]/g, '')}`;
}

function periodo(e) {
  const da = e.annoDa ?? '';
  const a = e.attuale ? 'oggi' : e.annoA ?? '';
  return da || a ? `${da}${da && a ? ' – ' : ''}${a}` : '';
}

export default function CandidatoModal({ candidato: preview, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [cvBusy, setCvBusy] = useState(false);
  const [cvError, setCvError] = useState('');

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

  const c = data ?? preview;
  const nome = `${c.nome} ${c.cognome}`.trim() || 'Candidato';
  const nascita = formatDataIt(c.dataNascita);

  const openCv = async () => {
    if (!data?.cv) return;
    setCvBusy(true);
    setCvError('');
    // La scheda si apre subito (entro il clic) e riceve l'indirizzo dopo:
    // aperta dopo l'attesa, il browser del telefono la bloccherebbe.
    const win = window.open('', '_blank');
    const res = await candidatoCvUrl(data.cv.path);
    setCvBusy(false);
    if (res.error) {
      win?.close();
      setCvError(res.error);
      return;
    }
    if (win) {
      win.opener = null;
      win.location.href = res.url;
    } else {
      window.location.href = res.url;
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-cand-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">
          ✕
        </button>

        <div className="rb-cand-modal-head">
          <AvatarImg className="rb-cand-modal-avatar" src={c.avatar} name={nome} seed={c.id} alt="" />
          <div>
            <h2>{nome}</h2>
            {(nascita || c.eta != null) && (
              <p className="rb-cand-muted">
                🎂 {nascita}
                {nascita && c.eta != null ? ' · ' : ''}
                {c.eta != null ? `${c.eta} anni` : ''}
              </p>
            )}
            {(c.citta || c.paese) && <p className="rb-cand-muted">📍 {[c.citta, c.paese].filter(Boolean).join(', ')}</p>}
          </div>
        </div>

        {error && <p className="rb-cand-error" role="alert">{error}</p>}
        {!data && !error && <p className="rb-cand-muted">Carico la scheda…</p>}

        {data && (
          <>
            <div className="rb-cand-contacts">
              {data.telefono && (
                <a className="rb-vroom-btn rb-vroom-btn--primary" href={telHref(data.telefono)}>
                  📞 Chiama
                </a>
              )}
              {data.telefonoSecondario && (
                <a className="rb-vroom-btn" href={telHref(data.telefonoSecondario)}>
                  📱 Numero secondario
                </a>
              )}
              {data.email && (
                <a className="rb-vroom-btn" href={`mailto:${data.email}`}>
                  ✉️ E-mail
                </a>
              )}
              {data.cv && (
                <button type="button" className="rb-vroom-btn" onClick={openCv} disabled={cvBusy}>
                  📄 {cvBusy ? 'Apro…' : 'Apri curriculum'}
                </button>
              )}
            </div>
            {cvError && <p className="rb-cand-error" role="alert">{cvError}</p>}

            {data.bio && <p className="rb-cand-bio">{data.bio}</p>}

            <dl className="rb-cand-facts">
              {data.titoloStudio && (
                <>
                  <dt>Titolo di studio</dt>
                  <dd>{titoloStudioLabel(data.titoloStudio)}</dd>
                </>
              )}
              {data.lingueParlate.length > 0 && (
                <>
                  <dt>Lingue</dt>
                  <dd>{data.lingueParlate.map((code) => SUPPORTED_LANGUAGES.find((l) => l.code === code)?.nativeLabel ?? code).join(', ')}</dd>
                </>
              )}
              {data.telefono && (
                <>
                  <dt>Telefono</dt>
                  <dd>{data.telefono}</dd>
                </>
              )}
              {data.telefonoSecondario && (
                <>
                  <dt>Numero secondario</dt>
                  <dd>{data.telefonoSecondario}</dd>
                </>
              )}
              {data.email && (
                <>
                  <dt>E-mail</dt>
                  <dd>{data.email}</dd>
                </>
              )}
            </dl>

            <h3 className="rb-cand-subtitle">Esperienze</h3>
            {data.esperienze.length === 0 ? (
              <p className="rb-cand-muted">Nessuna esperienza inserita.</p>
            ) : (
              <ul className="rb-cand-exp">
                {data.esperienze.map((e, i) => (
                  <li key={i}>
                    <strong>{e.posizione}</strong>
                    {e.azienda && <span> · {e.azienda}</span>}
                    <span className="rb-cand-muted">{[periodo(e), e.citta].filter(Boolean).join(' · ')}</span>
                    {e.descrizione && <p>{e.descrizione}</p>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </ModalOverlay>
  );
}
