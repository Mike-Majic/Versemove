// HUD moderno del kit: una riga di "pillole" giocatore (pallino/avatar
// colorato + nome) con quella del turno evidenziata, e sotto una riga di
// stato (chi deve muovere, chi ha vinto...). Stili in gameKit.css.
export function PlayerPill({ color, label, active = false, icon = null }) {
  return (
    <span className={`gk-pill ${active ? 'active' : ''}`} style={{ '--c': color }}>
      <span className="gk-pill-avatar gk-candy">{icon}</span>
      <span className="gk-pill-label">{label}</span>
    </span>
  );
}

export default function Hud({ players, status }) {
  return (
    <div className="gk-hud">
      <div className="gk-hud-row">
        {players.map((p) => (
          <PlayerPill key={p.id} color={p.color} label={p.label} active={p.active} icon={p.icon} />
        ))}
      </div>
      {status && <p className="gk-hud-status">{status}</p>}
    </div>
  );
}
