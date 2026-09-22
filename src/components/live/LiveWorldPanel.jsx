import { useEffect, useRef, useState } from 'react';
import {
  listActiveLiveSessions,
  startLiveSession,
  endLiveSession,
  subscribeToLiveSessions,
  fetchLiveMessages,
  sendLiveMessage,
  subscribeToLiveMessages,
  parseLiveLink,
  buildEmbedUrl,
  platformLabel,
} from '../../data/liveStreams';
import { formatRelativeDate } from '../social/resolveAuthor';
import { getLavoroProfiles } from '../../data/lavoro';
import { supabase } from '../../data/supabaseClient';
import TwoColumnSwitcher from '../layout/TwoColumnSwitcher';
import './LiveWorldPanel.css';

function GoLiveForm({ onSubmit, onCancel }) {
  const [link, setLink] = useState('');
  const [titolo, setTitolo] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const parsed = parseLiveLink(link);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    setSubmitting(true);
    setError('');
    const result = await onSubmit({ piattaforma: parsed.piattaforma, canale: parsed.canale, titolo });
    setSubmitting(false);
    if (result?.error) setError(result.error);
  };

  return (
    <form className="rb-golive-form" onSubmit={submit}>
      <p className="rb-golive-hint">Avvia la diretta sulla piattaforma, poi incolla qui il link.</p>
      <input
        type="text"
        placeholder="Link della diretta (Twitch, YouTube o Kick)..."
        value={link}
        onChange={(e) => setLink(e.target.value)}
      />
      <input
        type="text"
        placeholder="Titolo della diretta (facoltativo)"
        value={titolo}
        onChange={(e) => setTitolo(e.target.value)}
        maxLength={100}
      />
      {error && <p className="rb-golive-error">⚠️ {error}</p>}
      <div className="rb-golive-actions">
        <button type="button" className="rb-golive-cancel" onClick={onCancel}>Annulla</button>
        <button type="submit" className="rb-golive-submit" disabled={submitting || !link.trim()}>
          {submitting ? 'Avvio...' : '🔴 Vai in live'}
        </button>
      </div>
    </form>
  );
}

function LiveChat({ sessionId, user, onOpenAuth }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    fetchLiveMessages(sessionId).then(({ messages: list }) => {
      if (list) setMessages(list);
    });
    const channel = subscribeToLiveMessages(sessionId, (row) => {
      setMessages((prev) => [
        ...prev,
        { id: row.id, autoreId: row.user_id, author: { id: row.user_id, name: 'Utente', avatar: '' }, testo: row.testo, data: row.created_at },
      ]);
      fetchLiveMessages(sessionId).then(({ messages: list }) => {
        if (list) setMessages(list);
      });
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setError('');
    const { error: sendError } = await sendLiveMessage(sessionId, text);
    if (sendError) setError(sendError);
  };

  return (
    <div className="rb-live-chat-panel">
      {error && <p className="rb-social-error">⚠️ {error}</p>}
      <div className="rb-live-chat-panel-messages" ref={listRef}>
        {messages.map((m) => (
          <div key={m.id} className={`rb-live-chat-panel-msg ${m.autoreId === user?.id ? 'me' : ''}`}>
            <img src={m.author.avatar} alt="" />
            <div>
              <div className="rb-live-chat-panel-head">
                <strong>{m.autoreId === user?.id ? 'Tu' : m.author.name}</strong>
                <span>{formatRelativeDate(m.data)}</span>
              </div>
              <p>{m.testo}</p>
            </div>
          </div>
        ))}
        {messages.length === 0 && <p className="rb-live-chat-panel-empty">Nessun messaggio ancora.</p>}
      </div>
      <form className="rb-live-chat-panel-form" onSubmit={send}>
        <input
          type="text"
          placeholder={user ? 'Scrivi un messaggio...' : 'Accedi per scrivere...'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit">Invia</button>
      </form>
    </div>
  );
}

// Categoria "Live" dei mondi Social e Lavoro: dirette reali che rimandano
// alla piattaforma vera (Twitch/YouTube/Kick, incorporata via iframe) —
// niente streaming nostro, solo l'elenco di chi è in diretta ora, un modo
// per segnalare la propria, e una chat a fianco (sotto su mobile).
export default function LiveWorldPanel({ mondo, user, onOpenAuth }) {
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showGoLive, setShowGoLive] = useState(false);
  const [goLiveError, setGoLiveError] = useState('');
  // Solo nel mondo Lavoro: nome e cognome reali (se chi guarda e l'host
  // hanno entrambi dato il consenso, vedi data/lavoro.js) al posto del solo
  // nickname — la RPC stessa filtra chi non ha consentito, qui si mostra
  // solo quello che torna.
  const [lavoroProfiles, setLavoroProfiles] = useState(new Map());

  const mySession = sessions.find((s) => s.hostId === user?.id) ?? null;
  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  const refresh = () => {
    listActiveLiveSessions(mondo).then(setSessions);
  };

  useEffect(() => {
    refresh();
    const channel = subscribeToLiveSessions(mondo, refresh);
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mondo]);

  useEffect(() => {
    if (mondo !== 'lavoro' || sessions.length === 0) {
      setLavoroProfiles(new Map());
      return undefined;
    }
    let cancelled = false;
    getLavoroProfiles(sessions.map((s) => s.hostId)).then((map) => {
      if (!cancelled) setLavoroProfiles(map);
    });
    return () => {
      cancelled = true;
    };
  }, [mondo, sessions]);

  // Nome mostrato per un host: "Nome Cognome" (nickname più piccolo sotto,
  // vedi CSS) se il consenso Lavoro c'è per entrambi, altrimenti il solo
  // nickname come in ogni altro mondo.
  const hostDisplayName = (host) => {
    const lp = lavoroProfiles.get(host.id);
    if (lp?.nome && lp?.cognome) return `${lp.nome} ${lp.cognome}`;
    return host.name;
  };
  const hostShowsNickname = (host) => {
    const lp = lavoroProfiles.get(host.id);
    return Boolean(lp?.nome && lp?.cognome);
  };

  const handleGoLive = async ({ piattaforma, canale, titolo }) => {
    if (!user) {
      onOpenAuth();
      return {};
    }
    const { id, error } = await startLiveSession({ mondo, piattaforma, canale, titolo });
    if (error) return { error };
    refresh();
    setSelectedId(id);
    setShowGoLive(false);
    return {};
  };

  const handleEndLive = async () => {
    if (!mySession) return;
    setGoLiveError('');
    const { error } = await endLiveSession(mySession.id);
    if (error) {
      setGoLiveError(error);
      return;
    }
    if (selectedId === mySession.id) setSelectedId(null);
    refresh();
  };

  if (selected) {
    const embedUrl = buildEmbedUrl(selected.piattaforma, selected.canale);
    return (
      <div className="rb-live-panel">
        <div className="rb-live-panel-topbar">
          <button type="button" className="rb-live-back-btn" onClick={() => setSelectedId(null)}>← Elenco dirette</button>
          <span className="rb-live-panel-title">{selected.titolo || `${hostDisplayName(selected.host)} è in diretta`}</span>
          {selected.hostId === user?.id && (
            <button type="button" className="rb-live-end-btn" onClick={handleEndLive}>⏹ Termina</button>
          )}
        </div>
        {goLiveError && <p className="rb-social-error">⚠️ {goLiveError}</p>}
        <TwoColumnSwitcher
          primary={
            embedUrl ? (
              <iframe
                className="rb-live-player-iframe"
                src={embedUrl}
                title={selected.titolo || 'Diretta'}
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            ) : (
              <p className="rb-live-panel-empty">Piattaforma non supportata.</p>
            )
          }
          secondary={<LiveChat sessionId={selected.id} user={user} onOpenAuth={onOpenAuth} />}
          primaryLabel="Diretta"
          secondaryLabel="Chat"
        />
      </div>
    );
  }

  return (
    <div className="rb-live-panel">
      {goLiveError && <p className="rb-social-error">⚠️ {goLiveError}</p>}

      {showGoLive ? (
        <GoLiveForm onSubmit={handleGoLive} onCancel={() => setShowGoLive(false)} />
      ) : mySession ? (
        <button type="button" className="rb-live-end-btn" onClick={handleEndLive}>⏹ Termina live</button>
      ) : (
        <button type="button" className="rb-live-golive-btn" onClick={() => (user ? setShowGoLive(true) : onOpenAuth())}>
          🔴 Vai in live
        </button>
      )}

      <ul className="rb-live-directory">
        {sessions.length === 0 && <p className="rb-live-panel-empty">Nessuna diretta in corso al momento.</p>}
        {sessions.map((s) => (
          <li key={s.id}>
            <button type="button" className="rb-live-directory-item" onClick={() => setSelectedId(s.id)}>
              <img src={s.host.avatar} alt="" />
              <span className="rb-live-directory-info">
                <strong>{s.titolo || `${hostDisplayName(s.host)} è in diretta`}</strong>
                <span className="rb-live-directory-sub">
                  {hostDisplayName(s.host)}
                  {hostShowsNickname(s.host) && <span className="rb-live-directory-nickname"> ({s.host.name})</span>}
                  {' · '}{platformLabel(s.piattaforma)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
