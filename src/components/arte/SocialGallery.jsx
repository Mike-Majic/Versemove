import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchGalleria, votaMedia, nextVote, GALLERY_PAGE } from '../../data/galleriaSocial';
import { followUser, unfollowUser } from '../../data/follows';
import { openProfileFromMention } from '../../data/mentions';
import { useBackLayer } from '../../hooks/useBackLayer';
import Icon from '../shared/Icon';
import EmptyState from '../EmptyState';
import './SocialGallery.css';

// Galleria del mondo Social dentro Intrattenimento (Galleria immagini /
// Galleria Video): solo il contenuto e il suo autore, senza il testo del
// post. Pollice su/giù (aggiornamento ottimistico, poi allineato con la
// risposta di vota_media; in caso di errore si torna com'era), "Segui"
// con la tabella follows del Social, clic su avatar/nickname = profilo.
// Scroll infinito a pagine di 30; clic sul contenuto = schermo intero.
// Video: anteprima muta al passaggio del mouse (o quando è visibile, su
// telefono), audio a schermo intero.

const EMPTY = {
  foto: 'Ancora nessuna foto: pubblica nel mondo Social e comparirà qui',
  video: 'Ancora nessun video: pubblica nel mondo Social e comparirà qui',
};

const canHover = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;

function AuthorChip({ item, size = 28 }) {
  return (
    <button type="button" className="rb-sg-author" onClick={(e) => { e.stopPropagation(); openProfileFromMention(item.autoreId); }} title={`Profilo di ${item.autoreNickname}`}>
      {item.autoreAvatar ? (
        <img src={item.autoreAvatar} alt="" width={size} height={size} />
      ) : (
        <span className="rb-sg-author-letter" style={{ width: size, height: size }}>{item.autoreNickname.charAt(0).toUpperCase()}</span>
      )}
      <span className="rb-sg-author-name">{item.autoreNickname}</span>
    </button>
  );
}

function Votes({ item, onVote }) {
  return (
    <div className="rb-sg-actions" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`rb-sg-vote ${item.mioVoto === 1 ? 'is-on' : ''}`}
        onClick={() => onVote(item, 1)}
        aria-pressed={item.mioVoto === 1}
        aria-label={`Pollice su (${item.su})`}
        title="Mi piace"
      >
        <Icon name="thumbUp" size={16} className={item.mioVoto === 1 ? 'rb-icon--filled' : ''} /> <span>{item.su}</span>
      </button>
      <button
        type="button"
        className={`rb-sg-vote rb-sg-vote--down ${item.mioVoto === -1 ? 'is-on' : ''}`}
        onClick={() => onVote(item, -1)}
        aria-pressed={item.mioVoto === -1}
        aria-label={`Pollice giù (${item.giu})`}
        title="Non mi piace"
      >
        <Icon name="thumbDown" size={16} className={item.mioVoto === -1 ? 'rb-icon--filled' : ''} /> <span>{item.giu}</span>
      </button>
    </div>
  );
}

// "Segui" / "Segui già" (niente sulle proprie foto).
function Follow({ item, user, onFollow }) {
  if (user && item.autoreId === user.id) return null;
  return (
    <button
      type="button"
      className={`rb-sg-follow ${item.seguoAutore ? 'is-on' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onFollow(item);
      }}
      aria-pressed={item.seguoAutore}
      aria-label={`${item.seguoAutore ? 'Segui già' : 'Segui'} ${item.autoreNickname}`}
      title={item.seguoAutore ? 'Segui già' : 'Segui'}
    >
      <Icon name={item.seguoAutore ? 'userCheck' : 'userPlus'} size={16} />
      <span className="rb-sg-follow-text">{item.seguoAutore ? 'Segui già' : 'Segui'}</span>
    </button>
  );
}

// Anteprima video: muta, parte al passaggio del mouse (desktop) o quando è
// a schermo (telefono), si ferma quando esce.
function VideoPreview({ src }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || canHover()) return undefined;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio > 0.6) v.play().catch(() => {});
      else v.pause();
    }, { threshold: [0, 0.6, 1] });
    obs.observe(v);
    return () => obs.disconnect();
  }, []);
  return (
    <video
      ref={ref}
      src={src}
      muted
      playsInline
      loop
      preload="metadata"
      onMouseEnter={(e) => canHover() && e.currentTarget.play().catch(() => {})}
      onMouseLeave={(e) => {
        if (!canHover()) return;
        e.currentTarget.pause();
      }}
    />
  );
}

function Viewer({ item, user, onVote, onFollow, onClose, onPrev, onNext }) {
  useBackLayer(true, onClose, 'viewer:galleria-social');
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft') onPrev?.();
      else if (e.key === 'ArrowRight') onNext?.();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, onPrev, onNext]);
  return createPortal(
    <div className="rb-sg-viewer" role="dialog" aria-modal="true" aria-label={`Contenuto di ${item.autoreNickname}`} onClick={onClose}>
      <button type="button" className="rb-sg-viewer-close" onClick={onClose} aria-label="Chiudi">
        <Icon name="close" size={22} />
      </button>
      {onPrev && (
        <button type="button" className="rb-sg-viewer-nav rb-sg-viewer-nav--prev" onClick={(e) => { e.stopPropagation(); onPrev(); }} aria-label="Precedente">
          <Icon name="back" size={24} />
        </button>
      )}
      {onNext && (
        <button type="button" className="rb-sg-viewer-nav rb-sg-viewer-nav--next" onClick={(e) => { e.stopPropagation(); onNext(); }} aria-label="Successivo">
          <Icon name="back" size={24} style={{ transform: 'scaleX(-1)' }} />
        </button>
      )}
      <div className="rb-sg-viewer-media" onClick={(e) => e.stopPropagation()}>
        {item.tipo === 'video' ? (
          <video key={item.key} src={item.url} controls autoPlay playsInline />
        ) : (
          <img key={item.key} src={item.url} alt={`Foto di ${item.autoreNickname}`} />
        )}
      </div>
      <div className="rb-sg-viewer-bar" onClick={(e) => e.stopPropagation()}>
        <AuthorChip item={item} size={36} />
        <Follow item={item} user={user} onFollow={onFollow} />
        <Votes item={item} onVote={onVote} />
      </div>
    </div>,
    document.body
  );
}

export default function SocialGallery({ tipo, user, onOpenAuth }) {
  const [ordine, setOrdine] = useState('recenti');
  const [items, setItems] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openKey, setOpenKey] = useState(null);
  const reqRef = useRef(0);
  const sentinelRef = useRef(null);
  const itemsRef = useRef([]);
  itemsRef.current = items ?? [];

  const load = useCallback(async (reset) => {
    const req = reset ? ++reqRef.current : reqRef.current;
    const offset = reset ? 0 : itemsRef.current.length;
    if (!reset) setLoadingMore(true);
    const res = await fetchGalleria({ tipo, ordine, offset, limit: GALLERY_PAGE });
    if (req !== reqRef.current) return;
    setLoadingMore(false);
    if (res.error) {
      setError('Non riesco a caricare la galleria. Riprova tra poco.');
      if (reset) setItems([]);
      return;
    }
    setError('');
    setHasMore(res.items.length === GALLERY_PAGE);
    setItems((prev) => {
      if (reset) return res.items;
      const seen = new Set((prev ?? []).map((i) => i.key));
      return [...(prev ?? []), ...res.items.filter((i) => !seen.has(i.key))];
    });
  }, [tipo, ordine]);

  useEffect(() => {
    setItems(null);
    setHasMore(true);
    load(true);
  }, [load]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || items === null) return undefined;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !loadingMore) load(false);
    }, { rootMargin: '500px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, items, loadingMore, load]);

  const patch = (key, fn) => setItems((prev) => (prev ?? []).map((i) => (i.key === key ? { ...i, ...fn(i) } : i)));

  const vote = async (item, pressed) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    const before = { su: item.su, giu: item.giu, mioVoto: item.mioVoto };
    const { voto, su, giu } = nextVote(item, pressed);
    patch(item.key, () => ({ su, giu, mioVoto: voto }));
    const res = await votaMedia(item.postId, item.mediaIdx, voto);
    if (res.error) {
      patch(item.key, () => before);
      setNotice('Voto non registrato, riprova.');
      return;
    }
    patch(item.key, () => ({ su: res.su, giu: res.giu, mioVoto: res.mioVoto }));
  };

  const follow = async (item) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    const was = item.seguoAutore;
    const setAll = (v) => setItems((prev) => (prev ?? []).map((i) => (i.autoreId === item.autoreId ? { ...i, seguoAutore: v } : i)));
    setAll(!was);
    const res = was ? await unfollowUser(item.autoreId) : await followUser(item.autoreId);
    if (res.error) {
      setAll(was);
      setNotice(res.error);
    }
  };

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const list = items ?? [];
  const openIdx = openKey ? list.findIndex((i) => i.key === openKey) : -1;
  const openItem = openIdx >= 0 ? list[openIdx] : null;

  return (
    <div className="rb-sg">
      <div className="rb-sg-top">
        <p className="rb-sg-source">
          <Icon name="sparkle" size={15} /> Dal mondo Social
        </p>
        <div className="rb-sg-order" role="tablist" aria-label="Ordine">
          <button type="button" role="tab" aria-selected={ordine === 'recenti'} className={ordine === 'recenti' ? 'is-active' : ''} onClick={() => setOrdine('recenti')}>
            Recenti
          </button>
          <button type="button" role="tab" aria-selected={ordine === 'top'} className={ordine === 'top' ? 'is-active' : ''} onClick={() => setOrdine('top')}>
            Più votate
          </button>
        </div>
      </div>

      {notice && <p className="rb-sg-notice" role="status">{notice}</p>}
      {error && (
        <p className="rb-sg-error" role="alert">
          {error}{' '}
          <button type="button" onClick={() => load(true)}>
            <Icon name="refresh" size={15} /> Riprova
          </button>
        </p>
      )}

      {items === null ? (
        <div className={`rb-sg-grid rb-sg-grid--${tipo}`}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rb-sg-card rb-sg-card--skeleton" />
          ))}
        </div>
      ) : list.length === 0 && !error ? (
        <EmptyState icon={<Icon name={tipo === 'video' ? 'film' : 'image'} size={32} />} title={EMPTY[tipo]} />
      ) : (
        <div className={`rb-sg-grid rb-sg-grid--${tipo}`}>
          {list.map((item) => (
            <article key={item.key} className="rb-sg-card">
              <button type="button" className="rb-sg-media" onClick={() => setOpenKey(item.key)} aria-label={`Apri a schermo intero il contenuto di ${item.autoreNickname}`}>
                {item.tipo === 'video' ? (
                  <>
                    <VideoPreview src={item.url} />
                    <span className="rb-sg-play" aria-hidden="true"><Icon name="play" size={18} /></span>
                  </>
                ) : (
                  <img src={item.url} alt={`Foto di ${item.autoreNickname}`} loading="lazy" />
                )}
              </button>
              <div className="rb-sg-card-bar">
                <div className="rb-sg-card-row">
                  <AuthorChip item={item} />
                  <Follow item={item} user={user} onFollow={follow} />
                </div>
                <Votes item={item} onVote={vote} />
              </div>
            </article>
          ))}
        </div>
      )}
      {hasMore && items !== null && list.length > 0 && <div ref={sentinelRef} className="rb-sg-sentinel">{loadingMore && 'Carico…'}</div>}

      {openItem && (
        <Viewer
          item={openItem}
          user={user}
          onVote={vote}
          onFollow={follow}
          onClose={() => setOpenKey(null)}
          onPrev={openIdx > 0 ? () => setOpenKey(list[openIdx - 1].key) : null}
          onNext={openIdx < list.length - 1 ? () => setOpenKey(list[openIdx + 1].key) : null}
        />
      )}
    </div>
  );
}
