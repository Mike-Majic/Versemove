import { useEffect } from 'react';
import { useCalls } from '../../calls/CallProvider';

// Videochiamata di gruppo per la Stanza MOD: la chiamata vera (mesh WebRTC
// sul canale privato "call:modroom", vedi hooks/useMeshCall.js) vive in
// calls/ModRoomCallSession, montata alla radice dell'app, così resta attiva
// chiudendo questo riquadro o cambiando mondo (mini-monitor). Qui solo il
// pulsante per entrare, con quanti sono già dentro.
export default function ModRoomGroupCall({ user }) {
  const { prepareModroom, modroomApi, setView } = useCalls();

  // Pannello aperto: la sessione apre il canale (serve a vedere chi c'è).
  useEffect(() => prepareModroom(), [prepareModroom]);

  const api = modroomApi;
  const othersCount = api ? api.members.filter((m) => m.userId !== user.id).length : 0;

  return (
    <div className="rb-modroom-call">
      {api?.joined ? (
        <button type="button" className="rb-modroom-call-join" onClick={() => setView('modroom', 'full')}>
          📞 Sei in videochiamata — mostra
        </button>
      ) : (
        <button type="button" className="rb-modroom-call-join" onClick={() => api?.join()} disabled={!api || api.joining}>
          🎥 {api?.joining ? 'Accesso in corso…' : 'Videochiamata di gruppo'}
          {othersCount > 0 && <span className="rb-modroom-call-badge">{othersCount} in chiamata</span>}
        </button>
      )}
      {api?.error && <p className="rb-privacy-error">{api.error}</p>}
    </div>
  );
}
