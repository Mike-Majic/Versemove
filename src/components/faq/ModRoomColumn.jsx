import { useEffect, useState } from 'react';
import { getReports, updateReportStatus } from '../../data/reports';
import { getMailboxMessages, markMessageRead } from '../../data/modMailbox';
import {
  listModRoomMessages,
  sendModRoomMessage,
  subscribeToModRoomMessages,
} from '../../data/faq';
import { fetchProfilesMap, displayName } from '../../data/posts';
import { supabase } from '../../data/supabaseClient';
import Skeleton from '../Skeleton';

// Stanza MOD: solo owner/moderatori (il montaggio stesso è già condizionato
// a staff in FaqWorldExplorer, la RLS lo garantisce comunque lato server).
// In cima il riquadro "Da gestire" (segnalazioni aperte + casella postale
// non letta), sotto la chat interna dello staff.
export default function ModRoomColumn({ user }) {
  const [openReports, setOpenReports] = useState(null);
  const [unreadMail, setUnreadMail] = useState(null);
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const refreshDaGestire = () => {
    getReports().then((all) => setOpenReports(all.filter((r) => r.stato === 'aperto')));
    getMailboxMessages().then((all) => setUnreadMail(all.filter((m) => !m.letto)));
  };

  useEffect(() => {
    refreshDaGestire();
    listModRoomMessages().then(setMessages);
    const channel = subscribeToModRoomMessages(async (row) => {
      const profilesMap = await fetchProfilesMap([row.author_id]);
      const author = profilesMap.get(row.author_id);
      setMessages((prev) => [
        ...(prev ?? []),
        {
          id: row.id,
          authorId: row.author_id,
          authorName: displayName(author, 'Utente'),
          authorAvatar: author?.avatar ?? '',
          testo: row.testo,
          riferimentoTipo: row.riferimento_tipo,
          riferimentoId: row.riferimento_id,
          data: row.created_at,
        },
      ]);
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const discutiSegnalazione = async (report) => {
    await sendModRoomMessage({
      testo: `Da discutere: segnalazione "${report.motivo}" su ${report.targetType} (${report.reporterNickname ?? 'utente'})`,
      riferimentoTipo: 'report',
      riferimentoId: report.id,
    });
    await updateReportStatus(report.id, 'in_lavorazione');
    refreshDaGestire();
  };

  const send = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setError('');
    const { error: err } = await sendModRoomMessage({ testo: text });
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    setDraft('');
  };

  return (
    <div className="rb-faq-column rb-modroom-column">
      <div className="rb-faq-pending-box">
        <h3>Da gestire</h3>
        {openReports === null || unreadMail === null ? (
          <Skeleton lines={3} />
        ) : (
          <>
            {openReports.length === 0 && unreadMail.length === 0 && (
              <p className="rb-faq-hint">Niente in sospeso, tutto gestito 👍</p>
            )}
            {openReports.map((r) => (
              <div key={r.id} className="rb-faq-pending-item">
                <span>
                  🚩 <strong>{r.motivo}</strong> su {r.targetType} — {r.reporterNickname ?? 'utente'}
                </span>
                <button type="button" className="rb-reset-filters-btn" onClick={() => discutiSegnalazione(r)}>
                  Discuti in Stanza MOD
                </button>
              </div>
            ))}
            {unreadMail.map((m) => (
              <div key={m.id} className="rb-faq-pending-item">
                <span>
                  ✉️ <strong>{m.subject}</strong> — {m.fromNickname}
                </span>
                <button type="button" className="rb-reset-filters-btn" onClick={() => markMessageRead(m.id).then(refreshDaGestire)}>
                  Segna come letto
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="rb-faq-modroom-chat">
        {messages === null ? (
          <Skeleton lines={5} />
        ) : (
          <ul className="rb-faq-modroom-messages">
            {messages.length === 0 && <p className="rb-faq-hint">Nessun messaggio ancora nella Stanza MOD.</p>}
            {messages.map((m) => (
              <li key={m.id} className={`rb-faq-modroom-msg ${m.authorId === user?.id ? 'me' : ''}`}>
                <strong>{m.authorId === user?.id ? 'Tu' : m.authorName}</strong>
                {m.riferimentoTipo && <span className="rb-faq-modroom-ref">rif. {m.riferimentoTipo} #{m.riferimentoId}</span>}
                <p>{m.testo}</p>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="rb-privacy-error">{error}</p>}
        <form className="rb-faq-modroom-form" onSubmit={send}>
          <input
            type="text"
            placeholder="Scrivi allo staff..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" disabled={sending || !draft.trim()}>Invia</button>
        </form>
      </div>
    </div>
  );
}
