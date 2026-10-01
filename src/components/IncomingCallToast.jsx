import { useEffect, useState } from 'react';
import { RING_TIMEOUT_MS, playRingtone, sendCallSignal, setRingState, subscribeIncomingRings } from '../data/calls';
import { fetchProfilesMap } from '../data/posts';
import { supabase } from '../data/supabaseClient';
import './IncomingCallToast.css';

// Chiamata in arrivo in qualunque punto dell'app (squilli call_rings, vedi
// data/calls.js). Se la chat con chi chiama è già aperta non compare:
// lì squilla CallModal. "Rispondi" apre la chat e accetta da sola
// (onAnswer), "Rifiuta" segna lo squillo e avvisa chi chiama sul canale
// della chiamata. Sparisce se chi chiama annulla o dopo 30 secondi.
export default function IncomingCallToast({ user, openChatWith, onAnswer }) {
  const [ring, setRing] = useState(null); // { id, conversationId, callerId, name, avatar }

  useEffect(() => {
    if (!user?.id) return undefined;
    const channel = subscribeIncomingRings(user.id, async (row) => {
      if (row.stato !== 'squilla') {
        setRing((prev) => (prev?.id === row.id ? null : prev));
        return;
      }
      if (Date.now() - new Date(row.created_at).getTime() > RING_TIMEOUT_MS) return;
      const profiles = await fetchProfilesMap([row.caller_id]);
      const p = profiles.get(row.caller_id);
      setRing({ id: row.id, conversationId: row.conversation_id, callerId: row.caller_id, name: p?.name ?? 'Qualcuno', avatar: p?.avatar ?? '' });
    });
    return () => supabase.removeChannel(channel);
  }, [user?.id]);

  // Con la chat di chi chiama aperta squilla CallModal; lo squillo chiuso
  // (accettato/rifiutato lì) toglie anche questo avviso.
  const hidden = !ring || openChatWith === ring.callerId;

  // Suoneria e scadenza mentre l'avviso è visibile.
  useEffect(() => {
    if (hidden) return undefined;
    playRingtone();
    const beat = setInterval(playRingtone, 2500);
    const expire = setTimeout(() => setRing(null), RING_TIMEOUT_MS);
    return () => {
      clearInterval(beat);
      clearTimeout(expire);
    };
  }, [hidden, ring?.id]);

  if (hidden) return null;

  const answer = () => {
    setRing(null);
    onAnswer(ring.callerId);
  };

  const decline = () => {
    setRing(null);
    setRingState(ring.id, 'rifiutata');
    sendCallSignal(ring.conversationId, 'decline');
  };

  return (
    <div className="rb-incall-toast" role="alertdialog" aria-label={`${ring.name} ti sta chiamando`}>
      {ring.avatar ? <img src={ring.avatar} alt="" /> : <span className="rb-incall-avatar">📞</span>}
      <div className="rb-incall-text">
        <strong>{ring.name}</strong>
        <span>ti sta videochiamando</span>
      </div>
      <button type="button" className="rb-incall-btn rb-incall-decline" onClick={decline} aria-label="Rifiuta">✕</button>
      <button type="button" className="rb-incall-btn rb-incall-accept" onClick={answer} aria-label="Rispondi">📹</button>
    </div>
  );
}
