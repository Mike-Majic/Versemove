import { useEffect, useRef, useState } from 'react';
import { useBackLayer } from '../../hooks/useBackLayer';
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
  externalLiveUrl,
  livePreviewUrls,
  liveLinkPlaceholder,
  LIVE_PLATFORMS_BY_WORLD,
} from '../../data/liveStreams';
import Icon from '../shared/Icon';
import { formatRelativeDate } from '../social/resolveAuthor';
import { getLavoroProfiles } from '../../data/lavoro';
import { supabase } from '../../data/supabaseClient';
import TwoColumnSwitcher from '../layout/TwoColumnSwitcher';
import './LiveWorldPanel.css';

// Anteprima di una diretta: miniatura della piattaforma se esiste (YouTube,
// Twitch), altrimenti — o se non si carica — la foto profilo di chi l'ha
// condivisa.
function LivePreview({ session }) {
  const urls = livePreviewUrls(session.piattaforma, session.canale);
  const [idx, setIdx] = useState(0);
  const src = urls[idx];
  if (src) {
    return <img className="rb-live-card-thumb-img" src={src} alt="" loading="lazy" onError={() => setIdx((i) => i + 1)} />;
  }
  return session.host.avatar ? (
    <span className="rb-live-card-thumb-avatar">
      <img src={session.host.avatar} alt="" loading="lazy" />
    </span>
  ) : (
    <span className="rb-live-card-thumb-avatar rb-live-card-thumb-letter">{(session.host.name || '?').charAt(0).toUpperCase()}</span>
  );
}

function GoLiveForm({ platforms, onSubmit, onCancel }) {
  const [link, setLink] = useState('');
  const [titolo, setTitolo] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const parsed = parseLiveLink(link, platforms);
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
        placeholder={liveLinkPlaceholder(platforms)}
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
      {error && (
        <p className="rb-golive-error">
          <Icon name="info" size={15} className="rb-icon--inline" /> {error}
        </p>
      )}
      <div className="rb-golive-actions">
        <button type="button" className="rb-golive-cancel" onClick={onCancel}>Annulla</button>
        <button type="submit" className="rb-golive-submit" disabled={submitting || !link.trim()}>
          {submitting ? (
            'Avvio...'
          ) : (
            <>
              <Icon name="broadcast" size={16} className="rb-icon--inline" /> Vai in live
            </>
          )}
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

// Dirette dei mondi Social, Lavoro, Nerd e Intrattenimento: dirette reali
// che rimandano alla piattaforma vera (incorporata via iframe quando la
// piattaforma lo permette) — niente streaming nostro, solo l'elenco di chi
// è in diretta ora con l'anteprima, un modo per segnalare la propria e una
// chat a fianco (sotto su mobile). Le piattaforme ammesse dipendono dal
// mondo (LIVE_PLATFORMS_BY_WORLD: Intrattenimento = YouTube e TikTok).
// standalone: categoria a sé (Nerd, Intrattenimento) — l'elenco sta in un
// pannello centrato; nel Social è dentro la colonna del feed.
export default function LiveWorldPanel({ mondo, user, onOpenAuth, standalone = false, title = '' }) {
  const platforms = LIVE_PLATFORMS_BY_WORLD[mondo] ?? LIVE_PLATFORMS_BY_WORLD.social;
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showGoLive, setShowGoLive] = useState(false);
  // Diretta aperta = sottopagina: Indietro torna all'elenco, come "← Elenco dirette".
  useBackLayer(selectedId !== null, () => setSelectedId(null), 'subpage:live');
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
    const externalUrl = externalLiveUrl(selected.piattaforma, selected.canale);
    const topbar = (
      <div className="rb-live-panel-topbar">
        <button type="button" className="rb-live-back-btn" onClick={() => setSelectedId(null)}>← Elenco dirette</button>
        <span className="rb-live-panel-title">{selected.titolo || `${hostDisplayName(selected.host)} è in diretta`}</span>
        {externalUrl && (
          <a className="rb-live-open-btn" href={externalUrl} target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={14} className="rb-icon--inline" /> Apri su {platformLabel(selected.piattaforma)}
          </a>
        )}
        {selected.hostId === user?.id && (
          <button type="button" className="rb-live-end-btn" onClick={handleEndLive}>⏹ Termina</button>
        )}
      </div>
    );
    const player = (
      embedUrl ? (
        <iframe
          className="rb-live-player-iframe"
          src={embedUrl}
          title={selected.titolo || 'Diretta'}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        // Dirette TikTok: TikTok non permette di guardarle dentro altri
        // siti — anteprima (foto profilo) e pulsante per aprirla.
        <div className="rb-live-noembed">
          <div className="rb-live-noembed-thumb">
            <LivePreview session={selected} />
            <span className="rb-live-badge">LIVE</span>
          </div>
          <p>
            {platformLabel(selected.piattaforma)} non permette di guardare le dirette dentro altri siti: si apre nell’app o nel sito di{' '}
            {platformLabel(selected.piattaforma)}.
          </p>
          {externalUrl && (
            <a className="rb-live-golive-btn" href={externalUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={15} className="rb-icon--inline" /> Guarda su {platformLabel(selected.piattaforma)}
            </a>
          )}
        </div>
      )
    );
    // Categoria a sé (Nerd, Intrattenimento): la barra va sopra il player,
    // dentro la colonna; nel Social resta sopra, nella colonna del feed.
    return (
      <div className="rb-live-panel">
        {!standalone && topbar}
        {goLiveError && <p className="rb-social-error">⚠️ {goLiveError}</p>}
        <TwoColumnSwitcher
          primary={
            standalone ? (
              <div className="rb-live-standalone-player">
                {topbar}
                {player}
              </div>
            ) : (
              player
            )
          }
          secondary={<LiveChat sessionId={selected.id} user={user} onOpenAuth={onOpenAuth} />}
          primaryLabel="Diretta"
          secondaryLabel="Chat"
        />
      </div>
    );
  }

  const list = (
    <div className="rb-live-panel">
      {goLiveError && <p className="rb-social-error">⚠️ {goLiveError}</p>}

      {showGoLive ? (
        <GoLiveForm platforms={platforms} onSubmit={handleGoLive} onCancel={() => setShowGoLive(false)} />
      ) : mySession ? (
        <button type="button" className="rb-live-end-btn" onClick={handleEndLive}>⏹ Termina live</button>
      ) : (
        <button type="button" className="rb-live-golive-btn" onClick={() => (user ? setShowGoLive(true) : onOpenAuth())}>
          <Icon name="broadcast" size={16} className="rb-icon--inline" /> Vai in live
        </button>
      )}

      {sessions.length === 0 && <p className="rb-live-panel-empty">Nessuna diretta in corso al momento.</p>}
      <ul className="rb-live-directory">
        {sessions.map((s) => (
          <li key={s.id}>
            <button type="button" className="rb-live-card" onClick={() => setSelectedId(s.id)}>
              <span className="rb-live-card-thumb">
                <LivePreview session={s} />
                <span className="rb-live-badge">LIVE</span>
                <span className="rb-live-card-platform">{platformLabel(s.piattaforma)}</span>
              </span>
              <span className="rb-live-card-meta">
                {s.host.avatar ? (
                  <img className="rb-live-card-avatar" src={s.host.avatar} alt="" />
                ) : (
                  <span className="rb-live-card-avatar rb-live-card-thumb-letter">{(s.host.name || '?').charAt(0).toUpperCase()}</span>
                )}
                <span className="rb-live-directory-info">
                  <strong>{s.titolo || `${hostDisplayName(s.host)} è in diretta`}</strong>
                  <span className="rb-live-directory-sub">
                    {hostDisplayName(s.host)}
                    {hostShowsNickname(s.host) && <span className="rb-live-directory-nickname"> ({s.host.name})</span>}
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  if (!standalone) return list;
  return (
    <div className="rb-live-standalone">
      {title && (
        <header className="rb-live-standalone-head">
          <Icon name="broadcast" size={20} />
          <h3>{title}</h3>
        </header>
      )}
      {list}
    </div>
  );
}
