import { useEffect, useRef, useState } from 'react';
import { getSponsorships, trackSponsorship } from '../../data/sponsorships';
import './SponsorCard.css';

// Spazio sponsorizzato in uno dei 3 formati richiesti (vedi App.jsx/i punti
// d'inserzione): un post del feed (card_feed), una striscia in fondo a un
// pannello (banner_pannello), una riga dentro una lista di annunci/offerte
// (riga_lista). Nessuna rete esterna: la campagna arriva da get_sponsorships
// (RPC, vedi data/sponsorships.js), già filtrata lato server per mondo/età/
// mondi esclusi — qui non c'è altro da nascondere o mostrare in base a chi
// guarda.
//
// mondo/categoria sono i filtri per get_sponsorships; citta è facoltativa
// (solo dove ha senso, es. Annunci). Se non arriva nessuna campagna il
// componente non renderizza nulla (niente spazio vuoto lasciato apposta).
export default function SponsorCard({ mondo, categoria = null, formato, citta = null, as: Tag = 'div', className = '' }) {
  const [sponsor, setSponsor] = useState(undefined); // undefined = ancora in caricamento, null = nessuna campagna
  const trackedViewRef = useRef(false);
  const elRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setSponsor(undefined);
    getSponsorships({ mondo, categoria, formato, citta, limit: 1 }).then((list) => {
      if (!cancelled) setSponsor(list[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [mondo, categoria, formato, citta]);

  // Conta una visualizzazione solo quando la card è DAVVERO visibile (almeno
  // metà, per almeno un secondo) — non al semplice rendering, che
  // conterebbe anche una card mai scrollata in vista.
  useEffect(() => {
    if (!sponsor || trackedViewRef.current) return undefined;
    const el = elRef.current;
    if (!el) return undefined;
    let timer = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = setTimeout(() => {
            if (!trackedViewRef.current) {
              trackedViewRef.current = true;
              trackSponsorship(sponsor.id, 'view');
            }
          }, 1000);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [sponsor]);

  if (!sponsor) return null;

  const handleClick = () => trackSponsorship(sponsor.id, 'click');

  return (
    <Tag ref={elRef} className={`rb-sponsor-card rb-sponsor-${formato} ${className}`}>
      <a
        className="rb-sponsor-link"
        href={sponsor.url}
        target="_blank"
        rel="noopener nofollow sponsored"
        onClick={handleClick}
      >
        <div className="rb-sponsor-label">
          <span className="rb-sponsor-badge">Sponsorizzato</span>
          <span className="rb-sponsor-advertiser">{sponsor.inserzionista}</span>
        </div>
        {sponsor.immagine && (
          <div className="rb-sponsor-media">
            <img src={sponsor.immagine} alt="" />
          </div>
        )}
        <div className="rb-sponsor-body">
          <strong className="rb-sponsor-title">{sponsor.titolo}</strong>
          {sponsor.testo && <p className="rb-sponsor-text">{sponsor.testo}</p>}
        </div>
      </a>
    </Tag>
  );
}
