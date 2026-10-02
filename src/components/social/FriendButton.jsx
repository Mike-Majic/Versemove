import { useEffect, useState } from 'react';
import { getFriendStatus, sendFriendRequest, respondToRequest } from '../../data/friends';

const LABELS = {
  none: '+ Aggiungi agli amici',
  sent: 'Richiesta inviata · annulla',
  received: 'Accetta richiesta',
  friends: '✓ Amici',
};

// "Aggiungi agli amici" nel profilo Social (accanto a Segui), con gli stati
// Aggiungi / Richiesta inviata (annulla) / Accetta richiesta / Amici
// (data/friends.js). La separazione adulti/minorenni la fa il server: se la
// richiesta non è permessa arriva l'errore, mostrato con onError.
export default function FriendButton({ userId, user, onOpenAuth, onError }) {
  const [state, setState] = useState({ status: null, requestId: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) return undefined;
    getFriendStatus(userId).then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, user]);

  if (user && user.id === userId) return null;

  const run = async () => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    if (state.status === 'friends' || state.status === null) return;
    setBusy(true);
    let res = {};
    if (state.status === 'none') res = await sendFriendRequest(userId);
    else if (state.status === 'sent') res = await respondToRequest(state.requestId, false);
    else if (state.status === 'received') res = await respondToRequest(state.requestId, true);
    if (res?.error) onError?.(res.error);
    setState(await getFriendStatus(userId));
    setBusy(false);
  };

  const status = user ? state.status : 'none';
  return (
    <button
      type="button"
      className={`rb-social-profile-follow-btn rb-social-profile-friend-btn ${status === 'friends' || status === 'sent' ? 'active' : ''}`}
      onClick={run}
      disabled={busy || (user && status === null)}
      aria-pressed={status === 'friends'}
    >
      {status === null ? '…' : LABELS[status]}
    </button>
  );
}
