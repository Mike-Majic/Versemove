import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMeshCall } from '../hooks/useMeshCall';
import { displayName } from '../data/posts';
import { useCalls } from './CallProvider';
import CallSurface, { MinimizeCallButton, RemoteAudio, ScreenShareButton } from './CallSurface';
import '../components/faq/faq.css';

function TileVideo({ stream, mirrored = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== (stream ?? null)) ref.current.srcObject = stream ?? null;
  }, [stream]);
  // Muto: l'audio degli altri passa da RemoteAudio (resta col mini-monitor).
  return <video ref={ref} autoPlay playsInline muted style={mirrored ? undefined : { transform: 'none' }} />;
}

// Videochiamata di gruppo della Stanza MOD (canale privato "call:modroom",
// autorizzato ai soli owner/moderatori da can_join_call): montata da
// calls/CallProvider, così resta attiva chiudendo il pannello o cambiando
// mondo. Il pannello (ModRoomGroupCall) mostra il pulsante per entrare e
// quanti sono già dentro, leggendo quello che questa sessione pubblica.
export default function ModRoomCallSession({ user }) {
  const { setModroomApi, setModroomJoined } = useCalls();
  const call = useMeshCall({ topic: 'call:modroom', user });
  const { members, joined, joining, error, localStream, remoteTiles } = call;
  const callJoin = call.join;

  const join = useCallback(() => callJoin({ name: displayName(user, 'Tu'), avatar: user.avatar || '' }), [callJoin, user]);

  useEffect(() => {
    setModroomApi({ members, joined, joining, error, join });
  }, [members, joined, joining, error, join, setModroomApi]);

  useEffect(() => {
    setModroomJoined(joined);
  }, [joined, setModroomJoined]);

  const remoteStreams = useMemo(() => remoteTiles.map((t) => t.stream), [remoteTiles]);

  if (!joined) return null;

  const myVideo = call.screenStream ?? localStream;
  const first = remoteTiles.find((t) => t.stream && !t.failed);
  const muted = !call.micOn;
  const cameraOff = !call.cameraOn;

  const full = (
    <div className="rb-modroom-call-active">
      <div className="rb-modroom-call-top">
        <strong>Videochiamata staff</strong>
        <MinimizeCallButton kind="modroom" />
      </div>
      <div className="rb-modroom-call-grid">
        <div className="rb-modroom-call-tile">
          <TileVideo stream={myVideo} mirrored={!call.sharingScreen} />
          <span className="rb-modroom-call-tile-name">{call.sharingScreen ? 'Tu · schermo' : 'Tu'}</span>
        </div>
        {remoteTiles.map((t) => (
          <div key={t.userId} className="rb-modroom-call-tile">
            <TileVideo stream={t.stream} mirrored />
            <span className="rb-modroom-call-tile-name">{t.name}</span>
          </div>
        ))}
      </div>
      <div className="rb-modroom-call-controls">
        <button type="button" className={`rb-modroom-call-ctrl ${muted ? 'active' : ''}`} onClick={call.toggleMic} aria-label="Muto">
          {muted ? '🔇' : '🎙️'}
        </button>
        <button type="button" className="rb-modroom-call-ctrl rb-modroom-call-leave" onClick={call.leave} aria-label="Esci dalla chiamata">📞</button>
        <button type="button" className={`rb-modroom-call-ctrl ${cameraOff ? 'active' : ''}`} onClick={call.toggleCamera} aria-label="Camera">
          {cameraOff ? '🚫' : '📷'}
        </button>
        <ScreenShareButton className="rb-modroom-call-ctrl" sharing={call.sharingScreen} onStart={call.startScreenShare} onStop={call.stopScreenShare} size={22} />
      </div>
    </div>
  );

  const mini = {
    title: first ? `Staff · ${first.name}` : 'Videochiamata staff',
    stream: first?.stream ?? myVideo,
    placeholder: <span>In attesa degli altri…</span>,
    micOn: call.micOn,
    onToggleMic: call.toggleMic,
    onHangup: call.leave,
    sharing: call.sharingScreen,
    onStartShare: call.startScreenShare,
    onStopShare: call.stopScreenShare,
  };

  return (
    <>
      <RemoteAudio streams={remoteStreams} />
      <CallSurface kind="modroom" full={full} mini={mini} floatClassName="rb-callfloat-layer--top" />
    </>
  );
}
