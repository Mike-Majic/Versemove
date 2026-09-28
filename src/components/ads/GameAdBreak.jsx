import { useEffect, useRef, useState } from 'react';
import { getHouseDeal, getSponsorships, trackSponsorship } from '../../data/sponsorships';
import './GameAdBreak.css';

// Pausa pubblicitaria fra una partita e l'altra dei giochi (vedi
// MiniGameShell e adBreakAfterGame): video di una campagna "video" del mondo,
// saltabile dopo skipAfter secondi. Se nessun inserzionista ha un video:
// - negli altri mondi, un'offerta della Vetrina trovata dal bot;
// - nel mondo Bambini solo campagne marcate "adatto ai bambini" (filtro
//   lato server), altrimenti un consiglio su un altro gioco dell'app,
//   niente di commerciale.
// Se non c'è proprio niente da mostrare, si va avanti subito.
export default function GameAdBreak({ mondo, skipAfter, onDone, kidsFallback = null }) {
  const [ad, setAd] = useState(undefined);
  const [left, setLeft] = useState(skipAfter);
  const viewTracked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [video] = await getSponsorships({ mondo, formato: 'video', limit: 1 });
      if (video?.video) return video;
      if (mondo === 'bambini') return kidsFallback;
      return getHouseDeal();
    })().then((found) => {
      if (cancelled) return;
      if (!found) onDone();
      else setAd(found);
    });
    return () => {
      cancelled = true;
    };
    // una sola volta per pausa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ad || left <= 0) return undefined;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [ad, left]);

  useEffect(() => {
    if (!ad || viewTracked.current || ad.offerta || ad.promo) return;
    viewTracked.current = true;
    trackSponsorship(ad.id, 'view');
  }, [ad]);

  if (!ad) return <div className="rb-adbreak" aria-busy="true" />;

  const open = () => {
    if (!ad.url) return;
    if (!ad.offerta && !ad.promo) trackSponsorship(ad.id, 'click');
    window.open(ad.url, '_blank', 'noopener');
  };

  return (
    <div className="rb-adbreak" role="dialog" aria-label="Pubblicità">
      <div className="rb-adbreak-top">
        <span className="rb-adbreak-badge">{ad.promo ? 'Da Versemove' : ad.offerta ? 'Offerta' : 'Pubblicità'}</span>
        {ad.inserzionista && <span className="rb-adbreak-who">{ad.inserzionista}</span>}
        <button type="button" className="rb-adbreak-skip" disabled={left > 0} onClick={onDone}>
          {left > 0 ? `Salta tra ${left}s` : 'Salta ▶'}
        </button>
      </div>
      <div className="rb-adbreak-stage">
        {ad.video ? (
          <video src={ad.video} autoPlay muted playsInline onEnded={() => left <= 0 && onDone()} onClick={open} />
        ) : ad.promo ? (
          <button type="button" className="rb-adbreak-promo" onClick={ad.onClick}>
            <span className="rb-adbreak-promo-icon" aria-hidden="true">{ad.icona}</span>
            <strong>{ad.titolo}</strong>
            <span>{ad.testo}</span>
          </button>
        ) : (
          <button type="button" className="rb-adbreak-deal" onClick={open}>
            {ad.immagine && <img src={ad.immagine} alt="" />}
            <strong>{ad.titolo}</strong>
            {ad.testo && <span>{ad.testo}</span>}
            <em>Scopri l'offerta ›</em>
          </button>
        )}
      </div>
      <div className="rb-adbreak-bar" style={{ '--p': `${Math.min(100, ((skipAfter - Math.max(0, left)) / skipAfter) * 100)}%` }} />
    </div>
  );
}
