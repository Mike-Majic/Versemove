import { useEffect, useState } from 'react';
import {
  searchProfiles,
  sendFriendRequest,
  getReceivedRequests,
  getSentRequests,
  respondToRequest,
  getFriends,
  removeFriend,
} from '../data/friends';
import './FriendsModal.css';

const TABS = [
  { id: 'amici', label: 'Amici' },
  { id: 'cerca', label: 'Cerca' },
];

// Scheda "Contatti" dell'hub DM (vedi DMHub.jsx): cercare persone reali,
// mandare/ricevere/rispondere a richieste, vedere la propria lista amici e
// aprire una chat con uno di loro. Stesso contenuto della vecchia
// FriendsModal, solo senza il guscio di modale/titolo (li fornisce DMHub).
export default function ContactsPanel({ onOpenChat, onFriendsChanged }) {
  const [tab, setTab] = useState('amici');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sentTo, setSentTo] = useState([]);
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    const [receivedList, sentList, friendsData] = await Promise.all([
      getReceivedRequests(),
      getSentRequests(),
      getFriends(),
    ]);
    setReceived(receivedList);
    setSent(sentList);
    setSentTo(sentList.map((r) => r.toId));
    setFriendsList(friendsData);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      return undefined;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchProfiles(q, { excludeIds: friendsList.map((f) => f.id) }).then((results) => {
        setSearchResults(results);
        setSearching(false);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, friendsList]);

  const handleSendRequest = async (id) => {
    setBusyId(id);
    const { error: err } = await sendFriendRequest(id);
    setBusyId(null);
    if (err) {
      setError(err);
      return;
    }
    setSentTo((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const handleRespond = async (requestId, accept) => {
    setBusyId(requestId);
    const { error: err } = await respondToRequest(requestId, accept);
    setBusyId(null);
    if (err) {
      setError(err);
      return;
    }
    await loadAll();
    onFriendsChanged?.();
  };

  const handleCancel = async (requestId) => {
    await handleRespond(requestId, false);
  };

  const handleRemoveFriend = async (id) => {
    setBusyId(id);
    const { error: err } = await removeFriend(id);
    setBusyId(null);
    if (err) {
      setError(err);
      return;
    }
    setFriendsList((prev) => prev.filter((f) => f.id !== id));
    onFriendsChanged?.();
  };

  return (
    <div className="rb-contacts-panel">
      <div className="rb-friends-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rb-friends-tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'amici' && received.length > 0 && <span className="rb-friends-tab-badge">{received.length}</span>}
          </button>
        ))}
      </div>

      {error && <p className="rb-privacy-error">⚠️ {error}</p>}
      {loading ? (
        <p className="rb-friends-empty">Caricamento...</p>
      ) : (
        <div className="rb-friends-tab-body">
          {tab === 'cerca' && (
            <>
              <input
                type="text"
                className="rb-friends-search-input"
                placeholder="Cerca per nickname o nome utente..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {searching && <p className="rb-friends-empty">Ricerca...</p>}
              {!searching && query.trim() && searchResults.length === 0 && (
                <p className="rb-friends-empty">Nessun risultato.</p>
              )}
              <ul className="rb-friends-list">
                {searchResults.map((p) => {
                  const isFriend = friendsList.some((f) => f.id === p.id);
                  const requested = sentTo.includes(p.id);
                  return (
                    <li key={p.id} className="rb-friends-row">
                      <img src={p.avatar} alt="" />
                      <strong>{p.name}</strong>
                      {isFriend ? (
                        <span className="rb-friends-already">Già amico</span>
                      ) : requested ? (
                        <button type="button" disabled>Richiesta inviata</button>
                      ) : (
                        <button type="button" disabled={busyId === p.id} onClick={() => handleSendRequest(p.id)}>
                          + Amico
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {tab === 'amici' && (
            <>
              {received.length > 0 && (
                <>
                  <p className="rb-friends-section-title">Richieste ricevute</p>
                  <ul className="rb-friends-list">
                    {received.map((r) => (
                      <li key={r.id} className="rb-friends-row">
                        <img src={r.other.avatar} alt="" />
                        <strong>{r.other.name}</strong>
                        <div className="rb-friends-row-actions">
                          <button type="button" disabled={busyId === r.id} onClick={() => handleRespond(r.id, true)}>
                            Accetta
                          </button>
                          <button type="button" className="rb-friends-decline" disabled={busyId === r.id} onClick={() => handleRespond(r.id, false)}>
                            Rifiuta
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {sent.length > 0 && (
                <>
                  <p className="rb-friends-section-title">Richieste inviate</p>
                  <ul className="rb-friends-list">
                    {sent.map((r) => (
                      <li key={r.id} className="rb-friends-row">
                        <img src={r.other.avatar} alt="" />
                        <strong>{r.other.name}</strong>
                        <button type="button" disabled={busyId === r.id} onClick={() => handleCancel(r.id)}>
                          Annulla
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {(received.length > 0 || sent.length > 0) && friendsList.length > 0 && (
                <p className="rb-friends-section-title">Amici</p>
              )}
              <ul className="rb-friends-list">
                {friendsList.length === 0 && received.length === 0 && sent.length === 0 && (
                  <p className="rb-friends-empty">Non hai ancora amici. Cercali nella scheda "Cerca".</p>
                )}
                {friendsList.map((f) => (
                  <li key={f.id} className="rb-friends-row">
                    <img src={f.avatar} alt="" />
                    <strong>{f.name}</strong>
                    <div className="rb-friends-row-actions">
                      <button type="button" onClick={() => onOpenChat(f.id)}>Messaggio</button>
                      <button type="button" className="rb-friends-decline" disabled={busyId === f.id} onClick={() => handleRemoveFriend(f.id)}>
                        Rimuovi
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
