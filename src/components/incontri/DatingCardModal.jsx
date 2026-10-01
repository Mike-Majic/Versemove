import { useEffect, useState } from 'react';
import ModalOverlay from '../ModalOverlay';
import DatingProfileCard from './DatingProfileCard';
import IncontriGatePanel from './IncontriGatePanel';
import { getDatingCard, recordSwipe, INCONTRI_DECISION_EVENT } from '../../data/incontri';
import './MatchColumn.css';
import './DatingCardModal.css';

// Profilo Incontri aperto dal globo o da un elenco del mondo rosso: la
// scheda (DatingProfileCard) con X (passo, chiude), stella e cuore, mai il profilo
// Social. Se nasce un match: stessa schermata del mazzo con "Scrivi".
//
// datingGate: il proprio Profilo Incontri se non è ancora visibile (null se
// è completo o per il proprietario, undefined finché non si sa). Con il
// profilo incompleto la scheda di un'altra persona non si apre: al suo
// posto il pannello "cosa manca".

export default function DatingCardModal({ userId, viewer, onClose, onOpenChat, datingGate = null, onOpenMyDatingProfile }) {
  const [card, setCard] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [matchWith, setMatchWith] = useState(null);

  const isSelf = viewer?.id === userId;
  const gateUnknown = !isSelf && datingGate === undefined;
  const gated = !isSelf && Boolean(datingGate);

  useEffect(() => {
    if (gated || gateUnknown) return undefined;
    let cancelled = false;
    getDatingCard(userId).then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else setCard(res.card);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, gated, gateUnknown]);

  const decide = async (decisione) => {
    if (!card || busy) return;
    setBusy(true);
    setActionError('');
    const res = await recordSwipe(card.id, decisione);
    setBusy(false);
    if (res.error) {
      setActionError(res.error);
      return;
    }
    setCard((c) => ({ ...c, miaDecisione: decisione, match: c.match || res.matched }));
    window.dispatchEvent(new CustomEvent(INCONTRI_DECISION_EVENT, { detail: { id: card.id, decisione, matched: res.matched } }));
    // X: passo registrato, la scheda si chiude.
    if (decisione === 'passo') {
      onClose();
      return;
    }
    if (res.matched) {
      setMatchWith(card);
      window.setTimeout(() => setMatchWith(null), 2200);
    }
  };

  return (
    <ModalOverlay onClose={onClose} className="rb-modal-overlay rb-dating-overlay">
      <div className="rb-dating-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn rb-dating-close" onClick={onClose} aria-label="Chiudi">
          ✕
        </button>
        {gated ? (
          <IncontriGatePanel profile={datingGate} onComplete={onOpenMyDatingProfile} />
        ) : (
          <>
            {error && <p className="rb-dating-modal-msg">{error}</p>}
            {!card && !error && <p className="rb-dating-modal-msg">Caricamento…</p>}
          </>
        )}
        {card && <DatingProfileCard card={card} mode="single" isSelf={isSelf} onDecision={decide} busy={busy} />}
        {actionError && <p className="rb-dating-modal-error" role="alert">{actionError}</p>}
        {card?.match && !isSelf && (
          <button type="button" className="rb-dating-write" onClick={() => onOpenChat?.(card.id)}>
            🎉 È un match · Scrivi un messaggio →
          </button>
        )}
      </div>
      {matchWith && <div className="rb-match-toast">🎉 È un Match con {matchWith.nickname}!</div>}
    </ModalOverlay>
  );
}
