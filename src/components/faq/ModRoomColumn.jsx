import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getReports, updateReportStatus } from '../../data/reports';
import { getMailboxMessages, markMessageRead } from '../../data/modMailbox';
import { EVENT_TYPES, fetchPendingEvents, formatEventDates, setEventStato } from '../../data/cosplay';
import {
  listModRoomMessages,
  sendModRoomMessage,
  subscribeToModRoomMessages,
  resolveModRoomRow,
  modRoomFilePath,
} from '../../data/faq';
import { displayName } from '../../data/posts';
import { supabase } from '../../data/supabaseClient';
import { formatRelativeDate } from '../social/resolveAuthor';
import Skeleton from '../Skeleton';
import ModRoomGroupCall from './ModRoomGroupCall';
import MentionText from '../shared/MentionText';
import MessageList from '../shared/chat/MessageList';
import ChatBubble from '../shared/chat/ChatBubble';
import ChatComposer from '../shared/chat/ChatComposer';
import AttachmentView from '../shared/chat/AttachmentView';
import Lightbox from '../shared/chat/Lightbox';
import { newId, timeLabel, uploadWithProgress } from '../shared/chat/chatMedia';
import '../shared/chat/chat.css';

// Stanza MOD (solo owner/moderatori: il montaggio è già condizionato allo
// staff in FaqWorldExplorer e la RLS lo impone lato server, anche per i
// file). Un unico pannello opaco, come docs/mockup/stanza_mod_nuova.png:
// - testata con "Cerca nella chat" (filtro sui messaggi caricati) e
//   "Videochiamata di gruppo" (ModRoomGroupCall in un riquadro sopra la chat);
// - a sinistra "Da gestire": segnalazioni aperte e posta non letta come
//   schede con le azioni, più "In lavorazione";
// - a destra la chat: bolle con OWNER/MOD, separatori di giorno, invio
//   ottimistico deduplicato con Realtime, allegati, vocali e menzioni.
// Sotto i 900 px le due colonne diventano due schede (dentro lo stesso
// pannello: TwoColumnSwitcher le staccherebbe in due pannelli separati
// sopra al globo, proprio quello che il mockup toglie).
const NARROW_QUERY = '(max-width: 900px)';

const TARGET_LABEL = {
  post: 'Post',
  commento: 'Commento',
  profilo: 'Profilo',
  gruppo: 'Gruppo',
  live: 'Live',
  evento: 'Evento',
  annuncio: 'Annuncio',
  suggerimento: 'Suggerimento',
  app: 'App',
  vetrina_offerta: 'Offerta',
  vetrina_commento: 'Commento in Vetrina',
};
const targetLabel = (t) => TARGET_LABEL[t] ?? (t?.startsWith('dog_') ? 'Contenuto Animali' : 'Contenuto');

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

const roleBadge = (ruolo) => (ruolo === 'owner' ? 'OWNER' : ruolo === 'moderatore' ? 'MOD' : null);

export default function ModRoomColumn({ user, onOpenCategory }) {
  const narrow = useNarrow();
  const [tab, setTab] = useState('chat');
  const [reports, setReports] = useState(null);
  const [mail, setMail] = useState(null);
  // Eventi proposti dagli utenti (events.stato = 'in_attesa').
  const [pendingEvents, setPendingEvents] = useState(null);
  const [messages, setMessages] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [callOpen, setCallOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const chatRef = useRef(null);
  const retryPayloadsRef = useRef(new Map());

  const refreshDaGestire = useCallback(() => {
    getReports().then(setReports);
    getMailboxMessages().then(setMail);
    fetchPendingEvents().then(setPendingEvents);
  }, []);

  // Messaggi: prima pagina, poi Realtime (deduplicato per id).
  useEffect(() => {
    refreshDaGestire();
    listModRoomMessages().then(({ messages: page, hasMore: more, error }) => {
      if (error) setLoadError('Non riesco a caricare i messaggi.');
      setMessages(page);
      setHasMore(more);
    });
    const channel = subscribeToModRoomMessages(async (row) => {
      const msg = await resolveModRoomRow(row);
      setMessages((prev) => {
        const list = prev ?? [];
        if (list.some((m) => m.id === msg.id)) return list;
        return [...list, msg];
      });
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshDaGestire]);

  const loadOlder = async () => {
    const oldest = messages?.find((m) => !m.pending && !m.failed);
    if (!oldest) return false;
    const { messages: page, hasMore: more } = await listModRoomMessages({ before: oldest.data });
    setMessages((prev) => {
      const ids = new Set((prev ?? []).map((m) => m.id));
      return [...page.filter((m) => !ids.has(m.id)), ...(prev ?? [])];
    });
    setHasMore(more);
    return more;
  };

  // Invio ottimistico: il messaggio compare subito (grigio), poi prende
  // l'id vero; se Realtime è arrivato prima, la copia provvisoria sparisce.
  const sendPayload = async (payload, tempId = newId()) => {
    const me = { id: user.id, name: displayName(user, 'Tu'), avatar: user.avatar || '', ruolo: user.ruolo };
    retryPayloadsRef.current.set(tempId, payload);
    setMessages((prev) => {
      const list = (prev ?? []).filter((m) => m.id !== tempId);
      return [
        ...list,
        {
          id: tempId,
          authorId: user.id,
          author: me,
          testo: payload.testo ?? '',
          allegati: payload.allegati ?? [],
          menzioni: [],
          riferimentoTipo: payload.riferimentoTipo ?? null,
          riferimentoId: payload.riferimentoId ?? null,
          data: new Date().toISOString(),
          pending: true,
        },
      ];
    });
    const { message, error } = await sendModRoomMessage(payload);
    setMessages((prev) => {
      const list = prev ?? [];
      if (error) return list.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m));
      retryPayloadsRef.current.delete(tempId);
      if (list.some((m) => m.id === message.id)) return list.filter((m) => m.id !== tempId);
      return list.map((m) => (m.id === tempId ? message : m));
    });
    return !error;
  };

  const retry = (tempId) => {
    const payload = retryPayloadsRef.current.get(tempId);
    if (payload) sendPayload(payload, tempId);
  };

  const upload = (file, onProgress) => uploadWithProgress(modRoomFilePath(user.id, file.name, newId()), file, onProgress);

  const discuti = async (report) => {
    if (narrow) setTab('chat');
    await sendPayload({
      testo: `Da discutere: ${targetLabel(report.targetType).toLowerCase()} segnalato da ${report.reporterNickname ?? 'un utente'}.${report.dettagli ? ` "${report.dettagli}"` : ''}`,
      riferimentoTipo: 'report',
      riferimentoId: report.id,
    });
    await updateReportStatus(report.id, 'in_lavorazione');
    refreshDaGestire();
  };

  const archivia = async (report) => {
    await updateReportStatus(report.id, 'chiuso');
    refreshDaGestire();
  };

  const rispondi = (m) => {
    markMessageRead(m.id).then(refreshDaGestire);
    if (m.fromAccountId) window.dispatchEvent(new CustomEvent('vm:open-chat', { detail: { userId: m.fromAccountId } }));
  };

  const reportsById = useMemo(() => new Map((reports ?? []).map((r) => [String(r.id), r])), [reports]);
  const openReports = (reports ?? []).filter((r) => r.stato === 'aperto');
  const workingReports = (reports ?? []).filter((r) => r.stato === 'in_lavorazione');
  const unreadMail = (mail ?? []).filter((m) => !m.letto);
  const pendingCount = openReports.length + unreadMail.length + (pendingEvents?.length ?? 0);

  const query = search.trim().toLowerCase();
  const shown = useMemo(() => {
    const list = (messages ?? []).map((m) => ({ ...m, mine: m.authorId === user.id }));
    if (!query) return list;
    return list.filter(
      (m) => m.testo.toLowerCase().includes(query) || m.allegati.some((a) => (a.nome || '').toLowerCase().includes(query))
    );
  }, [messages, query, user.id]);

  const renderMessage = (m) => {
    const report = m.riferimentoTipo === 'report' ? reportsById.get(String(m.riferimentoId)) : null;
    return (
      <ChatBubble
        key={m.id}
        mine={m.mine}
        author={m.author}
        badge={roleBadge(m.author?.ruolo)}
        time={timeLabel(m.data)}
        pending={m.pending}
        failed={m.failed}
        onRetry={() => retry(m.id)}
      >
        {m.riferimentoTipo === 'report' && (
          <span className="rb-chat-ref">🚩 Segnalazione · {report?.motivo ?? 'segnalazione'}</span>
        )}
        {m.testo && <MentionText as="p" className="rb-chat-text" testo={m.testo} menzioni={m.menzioni} />}
        {m.allegati.length > 0 && (
          <div className="rb-chat-atts">
            {m.allegati.map((a, i) => (
              <AttachmentView key={`${a.path}-${i}`} allegato={a} onOpenImage={(src, nome) => setLightbox({ src, nome })} />
            ))}
          </div>
        )}
      </ChatBubble>
    );
  };

  const pendingPanel = (
    <aside className="rb-modroom-side" aria-label="Da gestire">
      <div className="rb-modroom-side-head">
        <span>Da gestire</span>
        {pendingCount > 0 && <span className="rb-modroom-count">{pendingCount}</span>}
      </div>
      {reports === null || mail === null ? (
        <Skeleton lines={3} />
      ) : (
        <>
          {pendingCount === 0 && <p className="rb-modroom-empty">Niente in sospeso, tutto gestito 👍</p>}
          {openReports.map((r) => (
            <article key={r.id} className="rb-modroom-card">
              <h4>🚩 {r.motivo}</h4>
              <p>
                {targetLabel(r.targetType)} · segnalato da {r.reporterNickname ?? 'utente'} · {formatRelativeDate(r.data)}
              </p>
              <div className="rb-modroom-card-actions">
                <button type="button" className="primary" onClick={() => discuti(r)}>Discuti</button>
                <button type="button" onClick={() => onOpenCategory?.('segnalazioni')}>Apri</button>
                <button type="button" onClick={() => archivia(r)}>Archivia</button>
              </div>
            </article>
          ))}
          {unreadMail.map((m) => (
            <article key={m.id} className="rb-modroom-card">
              <h4>✉️ {m.subject}</h4>
              <p>Da {m.fromNickname} · {formatRelativeDate(m.data)}</p>
              {m.body && <p className="rb-modroom-card-body">{m.body}</p>}
              <div className="rb-modroom-card-actions">
                {m.fromAccountId && <button type="button" className="primary" onClick={() => rispondi(m)}>Rispondi</button>}
                <button type="button" onClick={() => markMessageRead(m.id).then(refreshDaGestire)}>Segna letto</button>
              </div>
            </article>
          ))}
          {(pendingEvents?.length ?? 0) > 0 && (
            <>
              <div className="rb-modroom-side-head sub">Eventi da approvare</div>
              {pendingEvents.map((ev) => (
                <article key={ev.id} className="rb-modroom-card" data-event-id={ev.id}>
                  <h4>{EVENT_TYPES[ev.tipo]?.icon ?? '📌'} {ev.titolo}</h4>
                  <p>
                    {EVENT_TYPES[ev.tipo]?.label ?? 'Evento'} · {formatEventDates(ev.dataEvento, ev.dataFine)} · {ev.citta} · proposto da {displayName(ev.author, 'utente')}
                  </p>
                  {ev.descrizione && <p className="rb-modroom-card-body">{ev.descrizione}</p>}
                  {ev.urlUfficiale && (
                    <p><a href={ev.urlUfficiale} target="_blank" rel="noopener noreferrer">{ev.urlUfficiale}</a></p>
                  )}
                  <div className="rb-modroom-card-actions">
                    <button type="button" className="primary" onClick={() => setEventStato(ev.id, 'approvato').then(refreshDaGestire)}>Approva</button>
                    <button type="button" onClick={() => setEventStato(ev.id, 'rifiutato').then(refreshDaGestire)}>Rifiuta</button>
                  </div>
                </article>
              ))}
            </>
          )}
          {workingReports.length > 0 && (
            <>
              <div className="rb-modroom-side-head sub">In lavorazione</div>
              {workingReports.map((r) => (
                <article key={r.id} className="rb-modroom-card small">
                  <h4>🟡 {r.motivo}</h4>
                  <p>{r.gestitoDaNickname ? `Assegnato a ${r.gestitoDaNickname}` : 'In lavorazione'} · {targetLabel(r.targetType)}</p>
                  <div className="rb-modroom-card-actions">
                    <button type="button" onClick={() => archivia(r)}>Chiudi</button>
                  </div>
                </article>
              ))}
            </>
          )}
        </>
      )}
    </aside>
  );

  const chatPanel = (
    <section className="rb-modroom-chat" ref={chatRef} aria-label="Chat dello staff">
      {callOpen && (
        <div className="rb-modroom-callbox">
          <button type="button" className="rb-modroom-callbox-x" onClick={() => setCallOpen(false)} aria-label="Chiudi la videochiamata">✕</button>
          <ModRoomGroupCall user={user} />
        </div>
      )}
      {searchOpen && query && (
        <p className="rb-modroom-search-note">
          {shown.length} {shown.length === 1 ? 'messaggio trovato' : 'messaggi trovati'} per “{search.trim()}”
        </p>
      )}
      {messages === null ? (
        <div className="rb-modroom-loading"><Skeleton lines={5} /></div>
      ) : (
        <MessageList
          items={shown}
          renderItem={renderMessage}
          onLoadOlder={query ? null : loadOlder}
          hasMore={hasMore}
          empty={<li className="rb-chat-older">{loadError || (query ? 'Nessun messaggio trovato.' : 'Nessun messaggio ancora nella Stanza MOD.')}</li>}
        />
      )}
      <ChatComposer
        contesto="stanza_mod"
        mentionTitle="Menziona qualcuno dello staff"
        placeholder="Scrivi allo staff…"
        dropTargetRef={chatRef}
        upload={upload}
        onSend={(payload) => sendPayload(payload)}
      />
    </section>
  );

  return (
    <div className="rb-modroom-panel rb-chat-scope">
      <header className="rb-modroom-head">
        <div className="rb-modroom-head-title">
          <h2>🛡️ Stanza MOD</h2>
          <p>Area riservata a owner e moderatori</p>
        </div>
        <div className="rb-modroom-head-actions">
          {searchOpen && (
            <input
              type="search"
              className="rb-modroom-search"
              placeholder="Cerca nella chat…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearch('');
                  setSearchOpen(false);
                }
              }}
              autoFocus
            />
          )}
          <button
            type="button"
            className={`rb-modroom-btn ${searchOpen ? 'on' : ''}`}
            aria-label={searchOpen ? 'Chiudi ricerca' : 'Cerca nella chat'}
            onClick={() => {
              setSearchOpen((v) => !v);
              setSearch('');
            }}
          >
            <span aria-hidden="true">{searchOpen ? '✕' : '🔍'}</span>
            <span className="rb-modroom-btn-label">{searchOpen ? ' Chiudi ricerca' : ' Cerca nella chat'}</span>
          </button>
          <button
            type="button"
            className={`rb-modroom-btn primary ${callOpen ? 'on' : ''}`}
            onClick={() => setCallOpen((v) => !v)}
            aria-label="Videochiamata di gruppo"
          >
            <span aria-hidden="true">🎥</span>
            <span className="rb-modroom-btn-label"> Videochiamata di gruppo</span>
          </button>
        </div>
      </header>

      {narrow ? (
        <>
          <div className="rb-modroom-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>
              Chat
            </button>
            <button type="button" role="tab" aria-selected={tab === 'gestire'} className={tab === 'gestire' ? 'on' : ''} onClick={() => setTab('gestire')}>
              Da gestire {pendingCount > 0 && <span className="rb-modroom-count">{pendingCount}</span>}
            </button>
          </div>
          <div className="rb-modroom-body single">{tab === 'chat' ? chatPanel : pendingPanel}</div>
        </>
      ) : (
        <div className="rb-modroom-body">
          {pendingPanel}
          {chatPanel}
        </div>
      )}

      {lightbox && <Lightbox src={lightbox.src} nome={lightbox.nome} onClose={() => setLightbox(null)} />}
    </div>
  );
}
