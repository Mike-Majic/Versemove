import { useEffect, useRef } from 'react';
import { useMeshCall } from '../../hooks/useMeshCall';
import { displayName } from '../../data/posts';

// Videochiamata di gruppo per la Stanza MOD: la logica mesh WebRTC
// (segnalazione sul canale privato "call:modroom", autorizzato ai soli
// owner/moderatori da can_join_call lato server, regola anti-glare, ICE)
// sta in hooks/useMeshCall.js, condivisa con le stanze video del mondo
// Nerd. Qui solo l'interfaccia.
export default function ModRoomGroupCall({ user }) {
  const call = useMeshCall({ topic: 'call:modroom', user });
  const { members, joined, joining, remoteTiles, localStream, error } = call;
  const muted = !call.micOn;
  const cameraOff = !call.cameraOn;
  const localVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream, joined]);

  const join = () => call.join({ name: displayName(user, 'Tu'), avatar: user.avatar || '' });
  const leave = call.leave;
  const toggleMuted = call.toggleMic;
  const toggleCamera = call.toggleCamera;

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
