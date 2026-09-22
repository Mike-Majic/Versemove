import { useEffect, useRef, useState } from 'react';
import { openModRoomCallChannel, ICE_SERVERS } from '../../data/calls';
import { supabase } from '../../data/supabaseClient';
import { displayName } from '../../data/posts';

// Videochiamata di gruppo per la Stanza MOD: mesh WebRTC (una RTCPeerConnection
// per ogni coppia di partecipanti), niente server media proprio. Il canale
// Realtime privato "call:modroom" (autorizzato ai soli owner/moderatori da
// can_join_call lato server, vedi migrazione) porta solo la segnalazione
// (offer/answer/ice) più la presence per sapere chi è dentro; il video passa
// diretto peer-to-peer una volta stabilita ogni connessione.
//
// Per evitare la "glare" (due lati che si offrono la connessione a vicenda
// nello stesso istante) la regola è semplice e deterministica: fra due
// partecipanti, chi ha lo user id più "grande" (confronto stringa) è sempre
// quello che manda l'offerta; l'altro aspetta. Si applica sia quando arrivo
// e trovo altri già dentro (presence "sync"), sia quando arriva qualcuno
// dopo di me (presence "join") — in entrambi i casi ogni coppia ha un solo
// iniziatore possibile, quindi non serve un vero protocollo anti-glare.
export default function ModRoomGroupCall({ user }) {
  const [members, setMembers] = useState([]); // [{userId, name, avatar}] presenti nella call (me incluso se dentro)
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [remoteTiles, setRemoteTiles] = useState([]); // [{userId, name, avatar, stream}]
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [error, setError] = useState('');

  const channelRef = useRef(null);
  const joinedRef = useRef(false);
  const peersRef = useRef(new Map()); // userId -> { pc, name, avatar, pendingIce: [] }
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const myMetaRef = useRef({ name: '', avatar: '' });

  useEffect(() => {
    joinedRef.current = joined;
  }, [joined]);

  const refreshTiles = () => {
    setRemoteTiles(
      Array.from(peersRef.current.entries())
        .filter(([, entry]) => entry.stream)
        .map(([userId, entry]) => ({ userId, name: entry.name, avatar: entry.avatar, stream: entry.stream }))
    );
  };

  const send = (event, payload) => {
    channelRef.current?.send({ type: 'broadcast', event, payload });
  };

  const flushPendingIce = async (entry) => {
    for (const candidate of entry.pendingIce) {
      try {
        await entry.pc.addIceCandidate(candidate);
      } catch {
        // candidato non più valido: non blocca il resto della chiamata.
      }
    }
    entry.pendingIce = [];
  };

  const closePeer = (userId) => {
    const entry = peersRef.current.get(userId);
    if (!entry) return;
    entry.pc.close();
    peersRef.current.delete(userId);
    refreshTiles();
  };

  const ensurePeer = (userId, meta) => {
    let entry = peersRef.current.get(userId);
    if (entry) {
      if (meta?.name) entry.name = meta.name;
      if (meta?.avatar !== undefined) entry.avatar = meta.avatar;
      return entry;
    }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    entry = { pc, name: meta?.name || 'Utente', avatar: meta?.avatar || '', stream: null, pendingIce: [] };
    pc.onicecandidate = (e) => {
      if (e.candidate) send('ice', { to: userId, from: user.id, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      entry.stream = e.streams[0];
      refreshTiles();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        closePeer(userId);
      }
    };
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
    }
    peersRef.current.set(userId, entry);
    return entry;
  };

  const makeOfferTo = async (userId, meta) => {
    const entry = ensurePeer(userId, meta);
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    send('offer', { to: userId, from: user.id, sdp: offer });
  };

  // Ogni volta che la lista dei presenti cambia (sync o join), per ogni
  // membro non ancora collegato decide chi dei due offre in base al
  // confronto degli id: vedi commento in cima al file.
  const reconcilePeers = (others) => {
    others.forEach((m) => {
      if (m.userId === user.id || peersRef.current.has(m.userId)) return;
      if (user.id > m.userId) {
        makeOfferTo(m.userId, m);
      } else {
        ensurePeer(m.userId, m);
      }
    });
  };

  const startLocalMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  };

  const join = async () => {
    if (joined || joining) return;
    setJoining(true);
    setError('');
    try {
      await startLocalMedia();
      myMetaRef.current = { name: displayName(user, 'Tu'), avatar: user.avatar || '' };
      await channelRef.current.track({ user_id: user.id, name: myMetaRef.current.name, avatar: myMetaRef.current.avatar });
      setJoined(true);
      const others = members.filter((m) => m.userId !== user.id);
      reconcilePeers(others);
    } catch {
      setError('Non riesco ad accedere a fotocamera/microfono.');
    }
    setJoining(false);
  };

  const leave = () => {
    channelRef.current?.untrack();
    peersRef.current.forEach((entry) => entry.pc.close());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setRemoteTiles([]);
    setJoined(false);
    setMuted(false);
    setCameraOff(false);
  };

  useEffect(() => {
    const channel = openModRoomCallChannel();
    channelRef.current = channel;

    const syncMembers = () => {
      const state = channel.presenceState();
      const list = Object.values(state)
        .flat()
        .map((p) => ({ userId: p.user_id, name: p.name, avatar: p.avatar }));
      setMembers(list);
      if (joinedRef.current) reconcilePeers(list.filter((m) => m.userId !== user.id));
    };

    channel.on('presence', { event: 'sync' }, syncMembers);
    channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      leftPresences.forEach((p) => closePeer(p.user_id));
    });

    channel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
      if (payload.to !== user.id || !joinedRef.current) return;
      const entry = ensurePeer(payload.from, null);
      await entry.pc.setRemoteDescription(payload.sdp);
      await flushPendingIce(entry);
      const answer = await entry.pc.createAnswer();
      await entry.pc.setLocalDescription(answer);
      send('answer', { to: payload.from, from: user.id, sdp: answer });
    });

    channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
      if (payload.to !== user.id) return;
      const entry = peersRef.current.get(payload.from);
      if (!entry || entry.pc.signalingState !== 'have-local-offer') return;
      await entry.pc.setRemoteDescription(payload.sdp);
      await flushPendingIce(entry);
    });

    channel.on('broadcast', { event: 'ice' }, async ({ payload }) => {
      if (payload.to !== user.id) return;
      const entry = peersRef.current.get(payload.from);
      if (!entry) return;
      if (entry.pc.remoteDescription) {
        try {
          await entry.pc.addIceCandidate(payload.candidate);
        } catch {
          // ignorato: un candidato ICE arrivato in ritardo non è fatale.
        }
      } else {
        entry.pendingIce.push(payload.candidate);
      }
    });

    channel.subscribe();

    return () => {
      peersRef.current.forEach((entry) => entry.pc.close());
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => {
    if (joined && localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [joined]);

  const toggleMuted = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !cameraOff;
    stream.getVideoTracks().forEach((t) => { t.enabled = !next; });
    setCameraOff(next);
  };

  const othersCount = members.filter((m) => m.userId !== user.id).length;

  return (
    <div className="rb-modroom-call">
      {!joined ? (
        <button type="button" className="rb-modroom-call-join" onClick={join} disabled={joining}>
          🎥 {joining ? 'Accesso in corso…' : 'Videochiamata di gruppo'}
          {othersCount > 0 && <span className="rb-modroom-call-badge">{othersCount} in chiamata</span>}
        </button>
      ) : (
        <div className="rb-modroom-call-active">
          <div className="rb-modroom-call-grid">
            <div className="rb-modroom-call-tile">
              <video ref={localVideoRef} autoPlay playsInline muted />
              <span className="rb-modroom-call-tile-name">Tu</span>
            </div>
            {remoteTiles.map((t) => (
              <div key={t.userId} className="rb-modroom-call-tile">
                <video
                  autoPlay
                  playsInline
                  ref={(el) => {
                    if (el) el.srcObject = t.stream;
                  }}
                />
                <span className="rb-modroom-call-tile-name">{t.name}</span>
              </div>
            ))}
          </div>
          <div className="rb-modroom-call-controls">
            <button type="button" className={`rb-modroom-call-ctrl ${muted ? 'active' : ''}`} onClick={toggleMuted} aria-label="Muto">
              {muted ? '🔇' : '🎙️'}
            </button>
            <button type="button" className="rb-modroom-call-ctrl rb-modroom-call-leave" onClick={leave} aria-label="Esci dalla chiamata">📞</button>
            <button type="button" className={`rb-modroom-call-ctrl ${cameraOff ? 'active' : ''}`} onClick={toggleCamera} aria-label="Camera">
              {cameraOff ? '🚫' : '📷'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="rb-privacy-error">{error}</p>}
    </div>
  );
}
