import { useState } from 'react';
import { voteDeal, listComments, addComment } from '../../data/vetrinaDeals';
import ReportModal from '../shared/ReportModal';

const REPORT_MOTIVI = ['Offerta scaduta', 'Prezzo sbagliato', 'Spam o pubblicità', 'Altro'];

// Quanto manca alla scadenza, in una frase breve (mai negativa: un'offerta
// scaduta sparisce dal feed prima che questo componente la mostri, vedi
// VetrinaOfferteColumn che filtra su scadeIl).
function formatCountdown(scadeIl) {
  if (!scadeIl) return null;
  const diffMs = new Date(scadeIl).getTime() - Date.now();
  if (diffMs <= 0) return 'Scade a breve';
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days >= 1) return `Scade tra ${days} giorno${days === 1 ? '' : 'i'}`;
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours >= 1) return `Scade tra ${hours} ora${hours === 1 ? '' : 'e'}`;
  return 'Scade a breve';
}

function formatPrice(value, valuta) {
  if (value == null) return null;
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: valuta || 'EUR' }).format(value);
}

export default function DealCard({ deal, user, onOpenAuth }) {
  const [voto, setVoto] = useState(deal.mioVoto);
  const [caldo, setCaldo] = useState(deal.caldo);
  const [freddo, setFreddo] = useState(deal.freddo);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [reportOpen, setReportOpen] = useState(false);

  const handleVote = async (valore) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    const prevVoto = voto;
    // Ottimista: si aggiorna subito, si corregge solo se il server rifiuta.
    if (prevVoto === valore) {
      setVoto(null);
      if (valore === 1) setCaldo((c) => c - 1);
      else setFreddo((f) => f - 1);
    } else {
      setVoto(valore);
      if (valore === 1) {
        setCaldo((c) => c + 1);
        if (prevVoto === -1) setFreddo((f) => f - 1);
      } else {
        setFreddo((f) => f + 1);
        if (prevVoto === 1) setCaldo((c) => c - 1);
      }
    }
    const { error } = await voteDeal(deal.id, valore);
    if (error) {
      setVoto(prevVoto);
      setCaldo(deal.caldo);
      setFreddo(deal.freddo);
    }
  };

  const toggleComments = async () => {
    const opening = !commentsOpen;
    setCommentsOpen(opening);
    if (opening && comments === null) {
      setComments(await listComments(deal.id));
    }
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth?.();
      return;
    }
    if (!commentDraft.trim()) return;
    const { error } = await addComment(deal.id, commentDraft);
    if (error) return;
    setCommentDraft('');
    setComments(await listComments(deal.id));
  };

  const countdown = formatCountdown(deal.scadeIl);
  const prezzoFmt = formatPrice(deal.prezzo, deal.valuta);
  const prezzoOriginaleFmt = formatPrice(deal.prezzoOriginale, deal.valuta);

  return (
    <li className="rb-deal-card">
      <div className="rb-deal-media">
        {deal.immagine ? <img src={deal.immagine} alt="" /> : <div className="rb-deal-media-empty">🏷️</div>}
        {deal.scontoPct != null && <span className="rb-deal-badge-sconto">-{deal.scontoPct}%</span>}
        <span className={`rb-deal-badge-fonte ${deal.fonte === 'utente' ? 'utente' : 'automatica'}`}>
          {deal.fonte === 'utente' ? 'Da un utente' : 'Automatica'}
        </span>
      </div>

      <div className="rb-deal-info">
        {deal.negozio && <span className="rb-deal-negozio">{deal.negozio}</span>}
        <strong className="rb-deal-titolo">{deal.titolo}</strong>
        {deal.descrizione && <p className="rb-deal-descrizione">{deal.descrizione}</p>}

        <div className="rb-deal-prezzi">
          {prezzoFmt && <span className="rb-deal-prezzo">{prezzoFmt}</span>}
          {prezzoOriginaleFmt && <span className="rb-deal-prezzo-originale">{prezzoOriginaleFmt}</span>}
        </div>

        <div className="rb-deal-meta">
          <span>{deal.online ? 'Online' : deal.citta ? `In negozio · ${deal.citta}` : 'In negozio'}</span>
          {countdown && <span className="rb-deal-countdown">{countdown}</span>}
        </div>

        <a className="rb-deal-link" href={deal.url} target="_blank" rel="noopener nofollow">
          Vai all'offerta
        </a>

        <div className="rb-deal-actions">
          <button type="button" className={`rb-deal-vote ${voto === 1 ? 'active' : ''}`} onClick={() => handleVote(1)}>
            🔥 {caldo}
          </button>
          <button type="button" className={`rb-deal-vote ${voto === -1 ? 'active' : ''}`} onClick={() => handleVote(-1)}>
            ❄️ {freddo}
          </button>
          <button type="button" className="rb-deal-comments-btn" onClick={toggleComments}>
            💬 {commentsOpen ? comments?.length ?? deal.nCommenti : deal.nCommenti}
          </button>
          <button type="button" className="rb-deal-report-btn" onClick={() => setReportOpen(true)}>
            Segnala
          </button>
        </div>

        {commentsOpen && (
          <div className="rb-deal-comments">
            {comments === null ? (
              <p className="rb-deal-comments-loading">Caricamento commenti…</p>
            ) : comments.length === 0 ? (
              <p className="rb-deal-comments-empty">Ancora nessun commento.</p>
            ) : (
              <ul>
                {comments.map((c) => (
                  <li key={c.id}>
                    <strong>{c.authorName}</strong> {c.testo}
                  </li>
                ))}
              </ul>
            )}
            <form className="rb-deal-comment-form" onSubmit={submitComment}>
              <input
                type="text"
                placeholder={user ? 'Confermi, preso ieri?' : 'Accedi per commentare'}
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                disabled={!user}
              />
              <button type="submit" disabled={!user || !commentDraft.trim()}>
                Invia
              </button>
            </form>
          </div>
        )}
      </div>

      {reportOpen && (
        <ReportModal
          targetType="vetrina_offerta"
          targetId={deal.id}
          targetLabel={`l'offerta "${deal.titolo}"`}
          motivi={REPORT_MOTIVI}
          onClose={() => setReportOpen(false)}
        />
      )}
    </li>
  );
}
