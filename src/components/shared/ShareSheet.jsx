import { useState } from 'react';
import ModalOverlay from '../ModalOverlay';
import { createPost } from '../../data/posts';
import './ShareSheet.css';

// Pannello "Condividi" riusabile (oggi: risultato dei minigiochi, vedi
// MiniGameShell). Prima scelta sempre la propria bacheca su Versemove
// (post nel mondo Social, come dal composer), poi i social esterni. Chi ha
// un link di condivisione pubblico (Facebook, Reddit, WhatsApp) lo apre
// già compilato; Instagram, TikTok e Discord non ne hanno uno dal web,
// quindi il testo viene copiato negli appunti e si apre il sito, dove
// basta incollarlo. "Altre app" usa la condivisione del sistema, se c'è.
const enc = encodeURIComponent;

const EXTERNAL = [
  { id: 'facebook', label: 'Facebook', glyph: 'f', color: '#1877f2', link: (t, u) => `https://www.facebook.com/sharer/sharer.php?u=${enc(u)}&quote=${enc(t)}` },
  { id: 'instagram', label: 'Instagram', glyph: '◎', color: '#d62976', copyThenOpen: 'https://www.instagram.com/' },
  { id: 'tiktok', label: 'TikTok', glyph: '♪', color: '#111111', copyThenOpen: 'https://www.tiktok.com/' },
  { id: 'reddit', label: 'Reddit', glyph: 'r', color: '#ff4500', link: (t, u) => `https://www.reddit.com/submit?url=${enc(u)}&title=${enc(t)}` },
  { id: 'discord', label: 'Discord', glyph: 'D', color: '#5865f2', copyThenOpen: 'https://discord.com/app' },
  { id: 'whatsapp', label: 'WhatsApp', glyph: '✆', color: '#25d366', link: (t, u) => `https://wa.me/?text=${enc(`${t} ${u}`)}` },
];

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function ShareSheet({ title = 'Condividi', text, url = window.location.origin + window.location.pathname, user, onOpenAuth, onClose }) {
  const [status, setStatus] = useState('');
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const fullText = `${text} ${url}`;

  const shareToFeed = async () => {
    if (!user) {
      onClose();
      onOpenAuth?.();
      return;
    }
    setPosting(true);
    setStatus('');
    const { error } = await createPost({ testo: text, mondo: 'social' });
    setPosting(false);
    if (error) {
      setStatus(error);
      return;
    }
    setPosted(true);
    setStatus('Pubblicato nella tua bacheca.');
  };

  const shareExternal = async (s) => {
    if (s.link) {
      window.open(s.link(text, url), '_blank', 'noopener');
      return;
    }
    const copied = await copyText(fullText);
    setStatus(copied ? `Testo copiato: incollalo su ${s.label}.` : fullText);
    window.open(s.copyThenOpen, '_blank', 'noopener');
  };

  const shareSystem = async () => {
    try {
      await navigator.share({ text, url });
    } catch {
      // annullato dall'utente: niente da mostrare
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-share-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        <h3>{title}</h3>
        <p className="rb-share-preview">{text}</p>

        <button type="button" className="rb-share-feed" onClick={shareToFeed} disabled={posting || posted}>
          <span className="rb-share-feed-icon">📝</span>
          <span>
            <strong>{posted ? 'Pubblicato nella tua bacheca' : 'La mia bacheca'}</strong>
            <small>{user ? 'Pubblica un post su Versemove' : 'Accedi per pubblicarlo su Versemove'}</small>
          </span>
        </button>

        <div className="rb-share-grid">
          {EXTERNAL.map((s) => (
            <button key={s.id} type="button" className="rb-share-option" onClick={() => shareExternal(s)}>
              <span className="rb-share-glyph" style={{ background: s.color }}>{s.glyph}</span>
              <span>{s.label}</span>
            </button>
          ))}
          {typeof navigator !== 'undefined' && navigator.share && (
            <button type="button" className="rb-share-option" onClick={shareSystem}>
              <span className="rb-share-glyph rb-share-glyph-more">⋯</span>
              <span>Altre app</span>
            </button>
          )}
        </div>

        {status && <p className="rb-share-status">{status}</p>}
      </div>
    </ModalOverlay>
  );
}
