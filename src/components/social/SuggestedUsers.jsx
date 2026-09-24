import './SuggestedUsers.css';

// Widget "Persone da seguire": qualche utente del mondo Social non ancora
// seguito, per dare subito un motivo per usare il follow appena arrivati.
export default function SuggestedUsers({ candidates, user, onOpenAuth, onToggleFollow, onOpenProfile }) {
  if (candidates.length === 0) return null;

  return (
    <div className="rb-suggested-users">
      <h4>Persone da seguire</h4>
      <ul>
        {candidates.map((u) => (
          <li key={u.id} className="rb-suggested-user">
            <button type="button" className="rb-suggested-user-identity" onClick={() => onOpenProfile(u.id)}>
              <img src={u.avatar} alt={u.name} />
              <div className="rb-suggested-user-info">
                <strong>{u.name}</strong>
                <span>{u.city}</span>
              </div>
            </button>
            <button type="button" className="rb-suggested-user-follow-btn" onClick={() => (user ? onToggleFollow(u.id) : onOpenAuth())}>
              Segui
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
