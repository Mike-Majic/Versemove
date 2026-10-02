import { useEffect, useState } from 'react';
import ModalOverlay from '../ModalOverlay';
import AvatarImg from '../shared/AvatarImg';
import { getFollowCounts, listFollowProfiles } from '../../data/follows';
import { openProfileFromMention } from '../../data/mentions';

const TITLES = { following: 'Seguiti', followers: 'Follower' };

// Contatori "N seguiti · N follower" del profilo Social: un tocco apre
// l'elenco, e da lì il profilo di ognuno. refreshKey: cambia quando cambia
// il "Segui" (il numero di follower si aggiorna).
export default function FollowStats({ userId, refreshKey }) {
  const [counts, setCounts] = useState({ following: null, followers: null });
  const [open, setOpen] = useState(null); // 'following' | 'followers' | null
  const [list, setList] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getFollowCounts(userId).then((c) => {
      if (!cancelled) setCounts(c);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  const show = async (kind) => {
    setOpen(kind);
    setList(null);
    setList(await listFollowProfiles(userId, kind));
  };

  const n = (v) => (v === null ? '–' : v.toLocaleString('it-IT'));
  return (
    <>
      <div className="rb-social-profile-stats">
        <button type="button" onClick={() => show('following')}>
          <strong>{n(counts.following)}</strong> seguiti
        </button>
        <button type="button" onClick={() => show('followers')}>
          <strong>{n(counts.followers)}</strong> follower
        </button>
      </div>
      {open && (
        <ModalOverlay onClose={() => setOpen(null)}>
          <div className="rb-social-follow-list-card" role="dialog" aria-label={TITLES[open]} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="rb-close-btn" onClick={() => setOpen(null)} aria-label="Chiudi">
              ✕
            </button>
            <h3>{TITLES[open]}</h3>
            {list === null ? (
              <p className="rb-social-follow-list-empty">Carico…</p>
            ) : list.length === 0 ? (
              <p className="rb-social-follow-list-empty">{open === 'following' ? 'Non segue ancora nessuno.' : 'Nessun follower ancora.'}</p>
            ) : (
              <ul className="rb-social-follow-list">
                {list.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(null);
                        openProfileFromMention(p.id);
                      }}
                    >
                      <AvatarImg src={p.avatar} name={p.name} seed={p.id} alt="" />
                      <span>{p.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ModalOverlay>
      )}
    </>
  );
}
