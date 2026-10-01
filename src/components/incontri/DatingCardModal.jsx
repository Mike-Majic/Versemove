import { useEffect, useRef, useState } from 'react';
import ModalOverlay from '../ModalOverlay';
import AvatarImg from '../shared/AvatarImg';
import { getDatingCard, recordSwipe, DATING_GENDER_LABELS, COSA_CERCA_LABELS, INCONTRI_DECISION_EVENT } from '../../data/incontri';
import './MatchColumn.css';
import './DatingCardModal.css';

// Scheda del Profilo Incontri: l'unica che si apre cliccando un contatto nel
// mondo rosso (globo, match, "A chi piaci", preferiti), mai il profilo
// Social. Solo foto, nickname, età, città, bio, genere, cosa cerca e
// attività; al posto di "Segui" il cuore (record_swipe 'mi_piace').

const ATTIVITA_LABELS = { online: 'Online', oggi: 'Attivo oggi', questa_settimana: 'Attivo questa settimana' };

export default function DatingCardModal({ userId, viewer, onClose, onOpenChat }) {
  const [card, setCard] = useState(null);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState(0);
  const [liking, setLiking] = useState(false);
  const [likeError, setLikeError] = useState('');
  const [matched, setMatched] = useState(false);
  const [showMatch, setShowMatch] = useState(false);
  const stripRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getDatingCard(userId).then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else {
        setCard(res.card);
        setMatched(res.card.match);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const isSelf = viewer?.id === userId;
  const liked = card?.miaDecisione === 'mi_piace' || card?.miaDecisione === 'super_mi_piace';

  const like = async () => {
    if (!card || liked || liking) return;
    setLiking(true);
    setLikeError('');
    const res = await recordSwipe(card.id, 'mi_piace');
    setLiking(false);
    if (res.error) {
      setLikeError(res.error);
      return;
    }
    setCard((c) => ({ ...c, miaDecisione: 'mi_piace' }));
    window.dispatchEvent(new CustomEvent(INCONTRI_DECISION_EVENT, { detail: { id: card.id, decisione: 'mi_piace', matched: res.matched } }));
    if (res.matched) {
      setMatched(true);
      setShowMatch(true);
      window.setTimeout(() => setShowMatch(false), 2200);
    }
  };

  const goTo = (i) => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.scrollTo({ left: i * strip.clientWidth, behavior: 'smooth' });
  };

  const onScroll = () => {
    const strip = stripRef.current;
    if (strip && strip.clientWidth) setPhoto(Math.round(strip.scrollLeft / strip.clientWidth));
  };

  const fotos = card?.foto ?? [];

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-dating-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">
          ✕
        </button>

        {error && <p className="rb-dating-card-empty">{error}</p>}
        {!card && !error && <p className="rb-dating-card-empty">Caricamento…</p>}

        {card && (
          <>
            <div className="rb-dating-card-photos">
              {fotos.length ? (
                <div className="rb-dating-card-strip" ref={stripRef} onScroll={onScroll}>
                  {fotos.map((src, i) => (
                    <img key={src} src={src} alt={i === 0 ? card.nickname : ''} loading={i === 0 ? 'eager' : 'lazy'} draggable="false" />
                  ))}
                </div>
              ) : (
                <AvatarImg className="rb-dating-card-fallback" src="" name={card.nickname} seed={card.id} alt="" />
              )}
              {fotos.length > 1 && (
                <>
                  <div className="rb-dating-card-dots">
                    {fotos.map((src, i) => (
                      <button key={src} type="button" className={i === photo ? 'active' : ''} onClick={() => goTo(i)} aria-label={`Foto ${i + 1}`} />
                    ))}
                  </div>
                  {photo > 0 && (
                    <button type="button" className="rb-dating-card-arrow prev" onClick={() => goTo(photo - 1)} aria-label="Foto precedente">
                      ‹
                    </button>
                  )}
                  {photo < fotos.length - 1 && (
                    <button type="button" className="rb-dating-card-arrow next" onClick={() => goTo(photo + 1)} aria-label="Foto successiva">
                      ›
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="rb-dating-card-body">
              <div className="rb-dating-card-head">
                <div>
                  <h2>
                    {card.nickname}
                    {card.eta ? `, ${card.eta}` : ''}
                  </h2>
                  {card.citta && <p className="rb-dating-card-city">📍 {card.citta}</p>}
                  {card.attivita && (
                    <span className={`rb-match-activity ${card.attivita === 'online' ? 'online' : ''}`}>
                      {card.attivita === 'online' && <span className="rb-match-activity-dot" />} {ATTIVITA_LABELS[card.attivita] ?? ''}
                    </span>
                  )}
                </div>
                {!isSelf && (
                  <button
                    type="button"
                    className={`rb-dating-card-heart ${liked ? 'liked' : ''}`}
                    onClick={like}
                    disabled={liked || liking}
                    aria-pressed={liked}
                    aria-label={liked ? 'Ti piace già' : 'Mi piace'}
                    title={liked ? 'Ti piace già' : 'Mi piace'}
                  >
                    {liked ? '❤️' : '🤍'}
                  </button>
                )}
              </div>

              {likeError && <p className="rb-privacy-error">{likeError}</p>}

              {matched && !isSelf && (
                <div className="rb-dating-card-match">
                  <span>🎉 È un match</span>
                  <button type="button" className="rb-match-list-item rb-dating-card-write" onClick={() => onOpenChat?.(card.id)}>
                    Scrivi un messaggio →
                  </button>
                </div>
              )}

              {card.bio && <p className="rb-dating-card-bio">{card.bio}</p>}

              <dl className="rb-dating-card-facts">
                {card.genere && (
                  <>
                    <dt>Genere</dt>
                    <dd>{DATING_GENDER_LABELS[card.genere] ?? card.genere}</dd>
                  </>
                )}
                {card.cosaCerca.length > 0 && (
                  <>
                    <dt>Cerca</dt>
                    <dd className="rb-dating-card-chips">
                      {card.cosaCerca.map((c) => (
                        <span key={c}>{COSA_CERCA_LABELS[c] ?? c}</span>
                      ))}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          </>
        )}
      </div>
      {showMatch && card && <div className="rb-match-toast">🎉 È un Match con {card.nickname}!</div>}
    </ModalOverlay>
  );
}
