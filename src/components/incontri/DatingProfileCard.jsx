import { useRef, useState } from 'react';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import {
  DETTAGLI,
  cosaCercaLabel,
  dettaglioText,
  genereLabel,
  interesseLabel,
  zodiacoLabel,
} from '../../data/datingLabels';
import './DatingProfileCard.css';

// Scheda di un profilo del mondo Incontri: la stessa per il mazzo
// (MatchColumn, mode="deck") e per il profilo aperto dal globo o da un
// elenco (DatingCardModal, mode="single"): in entrambe X (passo), stella
// (super mi piace, il pulsante grande) e cuore. Foto a tutta scheda con le tacche in alto
// (tocco a destra/sinistra o trascinamento per cambiarla), dati essenziali
// in basso, freccia "su" per tutti i dettagli.
//
// card: forma di datingCardFrom (data/incontri.js).
// onDecision(decisione) -> Promise: 'passo' | 'super_mi_piace' | 'mi_piace'.
// Nel mazzo va montata con key={card.id}: ogni profilo riparte dalla prima
// foto, con i dettagli chiusi e l'animazione d'entrata.

const ATTIVITA = { online: 'Online', oggi: 'Attivo oggi', questa_settimana: 'Attivo questa settimana' };
// Sotto questa larghezza (px reali dell'immagine) una foto non si allarga a
// tutta scheda: sfondo sfumato e immagine al centro (avatar piccoli).
const SMALL_IMAGE_PX = 600;
const SWIPE_PX = 40;

const languageLabel = (code) => {
  const l = SUPPORTED_LANGUAGES.find((x) => x.code === code);
  return l ? `${l.flag} ${l.nativeLabel}` : code;
};

function Photo({ src, alt, eager }) {
  const [small, setSmall] = useState(false);
  return (
    <div className={`rb-dpc-photo ${small ? 'small' : ''}`}>
      {small && <div className="rb-dpc-photo-bg" style={{ backgroundImage: `url("${src}")` }} aria-hidden="true" />}
      <img
        src={src}
        alt={alt}
        draggable="false"
        loading={eager ? 'eager' : 'lazy'}
        onLoad={(e) => setSmall(e.currentTarget.naturalWidth > 0 && e.currentTarget.naturalWidth < SMALL_IMAGE_PX)}
      />
    </div>
  );
}

function Initial({ name }) {
  return (
    <div className="rb-dpc-photo small rb-dpc-initial" aria-hidden="true">
      <span>{String(name || '?').trim().charAt(0).toUpperCase() || '?'}</span>
    </div>
  );
}

export default function DatingProfileCard({ card, mode = 'single', isSelf = false, onDecision, busy = false, leaving = null, topRight = null }) {
  const fotos = card.foto?.length ? card.foto : card.avatar ? [card.avatar] : [];
  const [index, setIndex] = useState(0);
  const [details, setDetails] = useState(false);
  const [burst, setBurst] = useState(null); // 'mi_piace' | 'super_mi_piace'
  const pointer = useRef(null);

  const liked = card.miaDecisione === 'mi_piace' || card.miaDecisione === 'super_mi_piace';
  const go = (delta) => setIndex((i) => Math.min(fotos.length - 1, Math.max(0, i + delta)));

  const onPointerDown = (e) => {
    pointer.current = { x: e.clientX, y: e.clientY, w: e.currentTarget.getBoundingClientRect() };
  };
  const onPointerUp = (e) => {
    const p = pointer.current;
    pointer.current = null;
    if (!p || fotos.length < 2) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) go(e.clientX - p.w.left > p.w.width / 2 ? 1 : -1);
  };

  const decide = async (decisione) => {
    if (busy || !onDecision) return;
    if (decisione !== 'passo') {
      setBurst(decisione);
      window.setTimeout(() => setBurst(null), 700);
    }
    await onDecision(decisione);
  };

  const luogo = [card.citta, card.distanzaKm != null ? `${card.distanzaKm} km` : ''].filter(Boolean).join(' · ');
  const rows = [
    card.cosaCerca?.length ? { icon: '🔎', label: 'Cerca', text: card.cosaCerca.map(cosaCercaLabel).join(', ') } : null,
    card.genere ? { icon: '⚧', label: 'Genere', text: genereLabel(card.genere) } : null,
    card.lingue?.length ? { icon: '🗣️', label: 'Lingue', text: card.lingue.map(languageLabel).join(', ') } : null,
    card.zodiaco ? { icon: '✨', label: 'Segno', text: zodiacoLabel(card.zodiaco) } : null,
    ...DETTAGLI.map((def) => {
      const text = dettaglioText(def, card.dettagli?.[def.key]);
      return text ? { icon: def.icon, label: def.label, text } : null;
    }),
  ].filter(Boolean);
  const interessi = card.dettagli?.interessi ?? [];

  return (
    <div className={`rb-dpc ${leaving ? `leaving-${leaving}` : ''}`}>
      <div className="rb-dpc-photos" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (pointer.current = null)}>
        {fotos.length ? (
          <div className="rb-dpc-track" style={{ transform: `translateX(-${index * 100}%)` }}>
            {fotos.map((src, i) => (
              <Photo key={`${src}-${i}`} src={src} alt={i === 0 ? card.nickname : ''} eager={i === 0} />
            ))}
          </div>
        ) : (
          <Initial name={card.nickname} />
        )}
      </div>

      {fotos.length > 1 && (
        <div className="rb-dpc-ticks" aria-hidden="true">
          {fotos.map((src, i) => (
            <span key={`${src}-${i}`} className={i === index ? 'active' : ''} />
          ))}
        </div>
      )}
      {topRight && <div className="rb-dpc-top-right">{topRight}</div>}

      <div className="rb-dpc-info">
        {card.attivita && (
          <span className={`rb-dpc-activity ${card.attivita === 'online' ? 'online' : ''}`}>
            {card.attivita === 'online' && <span className="rb-dpc-activity-dot" />}
            {ATTIVITA[card.attivita] ?? ''}
          </span>
        )}
        <h2 className="rb-dpc-name">
          <span className="rb-dpc-nick">{card.nickname}</span>
          {card.eta ? <span className="rb-dpc-age">{card.eta}</span> : null}
        </h2>
        {card.fuoriPreferenze && (
          <p className="rb-dpc-outzone">
            Fuori dalla tua zona{card.distanzaKm != null ? ` · ${card.distanzaKm} km` : ''}
          </p>
        )}
        {luogo && <p className="rb-dpc-place">📍 {luogo}</p>}
        {card.bio && <p className="rb-dpc-bio">{card.bio}</p>}
        {card.cosaCerca?.length > 0 && (
          <div className="rb-dpc-tags">
            {card.cosaCerca.slice(0, 2).map((c) => (
              <span key={c}>{cosaCercaLabel(c)}</span>
            ))}
          </div>
        )}
        {(rows.length > 0 || interessi.length > 0) && (
          <button type="button" className="rb-dpc-more" onClick={() => setDetails(true)} aria-label="Mostra tutti i dettagli" title="Tutti i dettagli">
            ↑
          </button>
        )}

        {!isSelf && onDecision && (
          <div className={`rb-dpc-actions ${mode}`}>
            <button type="button" className="rb-dpc-btn pass" onClick={() => decide('passo')} disabled={busy} aria-label="Passo" title="Passo">
              ✕
            </button>
            <button
              type="button"
              className="rb-dpc-btn super"
              onClick={() => decide('super_mi_piace')}
              disabled={busy || liked}
              aria-label="Super mi piace"
              title="Super mi piace"
            >
              ★
            </button>
            <button
              type="button"
              className={`rb-dpc-btn like ${liked ? 'liked' : ''}`}
              onClick={() => decide('mi_piace')}
              disabled={busy || liked}
              aria-pressed={liked}
              aria-label={liked ? 'Ti piace già' : 'Mi piace'}
              title={liked ? 'Ti piace già' : 'Mi piace'}
            >
              ♥
            </button>
          </div>
        )}
      </div>

      {burst && (
        <div className={`rb-dpc-burst ${burst === 'super_mi_piace' ? 'super' : ''}`} aria-hidden="true">
          {burst === 'super_mi_piace' ? '★' : '♥'}
        </div>
      )}

      <div className={`rb-dpc-details ${details ? 'open' : ''}`} aria-hidden={!details}>
        <div className="rb-dpc-details-head">
          <strong>
            {card.nickname}
            {card.eta ? `, ${card.eta}` : ''}
          </strong>
          <button type="button" onClick={() => setDetails(false)} aria-label="Chiudi i dettagli" tabIndex={details ? 0 : -1}>
            ↓
          </button>
        </div>
        <div className="rb-dpc-details-body">
          {card.bio && <p className="rb-dpc-details-bio">{card.bio}</p>}
          <ul>
            {rows.map((r) => (
              <li key={r.label}>
                <span className="rb-dpc-row-icon" aria-hidden="true">
                  {r.icon}
                </span>
                <span className="rb-dpc-row-label">{r.label}</span>
                <span className="rb-dpc-row-text">{r.text}</span>
              </li>
            ))}
          </ul>
          {interessi.length > 0 && (
            <>
              <h3>Interessi</h3>
              <div className="rb-dpc-tags">
                {interessi.map((x) => (
                  <span key={x}>{interesseLabel(x)}</span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
