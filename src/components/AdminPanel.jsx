import { useEffect, useState } from 'react';
import { useFormDirty } from '../hooks/useUnsavedChanges';
import { getMailboxMessages, markMessageRead } from '../data/modMailbox';
import { getReports, updateReportStatus, REPORT_TARGET_LABELS, REPORT_STATO_LABELS } from '../data/reports';
import { getAuditLog, logAdminAction, AUDIT_LABELS } from '../data/adminAuditLog';
import { listAllSponsorships, createSponsorship, updateSponsorship } from '../data/sponsorships';
import ModalOverlay from './ModalOverlay';
import './AdminPanel.css';
import AdminUsersPane from './admin/AdminUsersPane';
import InfoBanStaffView from './infoban/InfoBanStaffView';
import { ReportDetailDialog, AuditDetailDialog } from './admin/AdminDetailDialogs';

// Riga cliccabile anche da tastiera (Invio/Spazio).
const clickableRow = (onOpen) => ({
  className: 'rb-admin-clickable',
  role: 'button',
  tabIndex: 0,
  onClick: onOpen,
  onKeyDown: (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  },
});

const ADMIN_TABS = [
  { id: 'utenti', label: 'Utenti' },
  { id: 'posta', label: 'Posta' },
  { id: 'moderazione', label: 'Moderazione' },
  { id: 'infoban', label: 'Info ban' },
  { id: 'sponsorizzazioni', label: 'Sponsorizzazioni' },
  { id: 'log', label: 'Log azioni' },
];

const SPONSOR_MONDI = ['social', 'vetrina', 'annunci', 'arte', 'nerd', 'lavoro', 'incontri', 'bambini'];
const SPONSOR_FORMATI = ['card_feed', 'banner_pannello', 'riga_lista', 'video'];
const SPONSOR_STATI = ['bozza', 'attiva', 'sospesa', 'conclusa'];
const SPONSOR_STATO_LABELS = { bozza: 'Bozza', attiva: 'Attiva', sospesa: 'Sospesa', conclusa: 'Conclusa' };

// datetime-local vuole 'YYYY-MM-DDTHH:mm' in ora locale, il database dà/vuole
// ISO in UTC: le due conversioni sotto tengono i campi data del form
// coerenti senza reinventare un date-picker.
function toDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function SponsorshipForm({ initial, onCancel, onSave }) {
  const [mondo, setMondo] = useState(initial?.mondo ?? SPONSOR_MONDI[0]);
  const [categoria, setCategoria] = useState(initial?.categoria ?? '');
  const [formato, setFormato] = useState(initial?.formato ?? SPONSOR_FORMATI[0]);
  const [titolo, setTitolo] = useState(initial?.titolo ?? '');
  const [testo, setTesto] = useState(initial?.testo ?? '');
  const [immagine, setImmagine] = useState(initial?.immagine ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [inserzionista, setInserzionista] = useState(initial?.inserzionista ?? '');
  const [citta, setCitta] = useState(initial?.citta ?? '');
  const [raggioKm, setRaggioKm] = useState(initial?.raggioKm ?? '');
  const [soloMaggiorenni, setSoloMaggiorenni] = useState(initial?.soloMaggiorenni ?? false);
  const [video, setVideo] = useState(initial?.video ?? '');
  const [adattoBambini, setAdattoBambini] = useState(initial?.adattoBambini ?? false);
  const [peso, setPeso] = useState(initial?.peso ?? 1);
  const [inizio, setInizio] = useState(toDatetimeLocal(initial?.inizio) || toDatetimeLocal(new Date().toISOString()));
  const [fine, setFine] = useState(toDatetimeLocal(initial?.fine));
  const [stato, setStato] = useState(initial?.stato ?? 'attiva');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useFormDirty({ mondo, categoria, formato, titolo, testo, immagine, url, inserzionista, citta, raggioKm, soloMaggiorenni, peso, inizio, fine, stato, video, adattoBambini });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const err = await onSave({
      mondo,
      categoria: categoria.trim(),
      formato,
      titolo: titolo.trim(),
      testo: testo.trim(),
      immagine: immagine.trim(),
      url: url.trim(),
      inserzionista: inserzionista.trim(),
      citta: citta.trim(),
      raggio_km: raggioKm,
      solo_maggiorenni: mondo === 'bambini' ? false : soloMaggiorenni,
      video: video.trim(),
      adatto_bambini: mondo === 'bambini' ? true : adattoBambini,
      peso,
      inizio: fromDatetimeLocal(inizio),
      fine: fromDatetimeLocal(fine),
      stato,
    });
    setSaving(false);
    if (err) setError(err);
  };

  return (
    <form className="rb-admin-sponsor-form" onSubmit={submit}>
      {error && <p className="rb-admin-sponsor-error">{error}</p>}
      <div className="rb-admin-sponsor-form-grid">
        <label className="rb-field">
          <span>Mondo</span>
          <select value={mondo} onChange={(e) => setMondo(e.target.value)}>
            {SPONSOR_MONDI.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="rb-field">
          <span>Categoria (vuoto = tutto il mondo)</span>
          <input type="text" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
        </label>
        <label className="rb-field">
          <span>Formato</span>
          <select value={formato} onChange={(e) => setFormato(e.target.value)}>
            {SPONSOR_FORMATI.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="rb-field">
          <span>Stato</span>
          <select value={stato} onChange={(e) => setStato(e.target.value)}>
            {SPONSOR_STATI.map((s) => (
              <option key={s} value={s}>{SPONSOR_STATO_LABELS[s]}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="rb-field">
        <span>Titolo</span>
        <input type="text" value={titolo} onChange={(e) => setTitolo(e.target.value)} minLength={3} maxLength={80} required />
      </label>
      <label className="rb-field">
        <span>Testo (max 200 caratteri, facoltativo)</span>
        <textarea rows={2} maxLength={200} value={testo} onChange={(e) => setTesto(e.target.value)} />
      </label>
      <label className="rb-field">
        <span>Immagine (URL, facoltativa)</span>
        <input type="text" value={immagine} onChange={(e) => setImmagine(e.target.value)} placeholder="https://..." />
      </label>
      {formato === 'video' && (
        <label className="rb-field">
          <span>Video (URL https di un file .mp4, mostrato fra una partita e l'altra dei giochi)</span>
          <input type="text" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://.../spot.mp4" required />
        </label>
      )}
      <label className="rb-field">
        <span>Link di destinazione</span>
        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." required />
      </label>
      <label className="rb-field">
        <span>Inserzionista</span>
        <input type="text" value={inserzionista} onChange={(e) => setInserzionista(e.target.value)} minLength={2} maxLength={80} required />
      </label>

      <div className="rb-admin-sponsor-form-grid">
        <label className="rb-field">
          <span>Città (facoltativa)</span>
          <input type="text" value={citta} onChange={(e) => setCitta(e.target.value)} />
        </label>
        <label className="rb-field">
          <span>Raggio km (facoltativo)</span>
          <input type="number" min={1} max={500} value={raggioKm} onChange={(e) => setRaggioKm(e.target.value)} />
        </label>
        <label className="rb-field">
          <span>Peso (1-10, più alto = più mostrata)</span>
          <input type="number" min={1} max={10} value={peso} onChange={(e) => setPeso(e.target.value)} />
        </label>
        <label className="rb-field rb-admin-sponsor-checkbox">
          <span>Solo maggiorenni</span>
          <input type="checkbox" checked={soloMaggiorenni} disabled={mondo === 'bambini'} onChange={(e) => setSoloMaggiorenni(e.target.checked)} />
        </label>
        <label className="rb-field rb-admin-sponsor-checkbox" title="Solo queste campagne possono comparire nel mondo Bambini">
          <span>Adatta ai bambini</span>
          <input type="checkbox" checked={mondo === 'bambini' || adattoBambini} disabled={mondo === 'bambini'} onChange={(e) => setAdattoBambini(e.target.checked)} />
        </label>
      </div>

      <div className="rb-admin-sponsor-form-grid">
        <label className="rb-field">
          <span>Inizio</span>
          <input type="datetime-local" value={inizio} onChange={(e) => setInizio(e.target.value)} required />
        </label>
        <label className="rb-field">
          <span>Fine (vuoto = senza scadenza)</span>
          <input type="datetime-local" value={fine} onChange={(e) => setFine(e.target.value)} />
        </label>
      </div>

      <div className="rb-admin-sponsor-form-actions">
        <button type="button" className="rb-reset-filters-btn" onClick={onCancel}>Annulla</button>
        <button type="submit" className="rb-btn-primary" disabled={saving}>{saving ? 'Salvo…' : 'Salva'}</button>
      </div>
    </form>
  );
}

// Elenco campagne (con CTR calcolato al volo) + form di creazione/modifica:
// niente rete pubblicitaria esterna, sono le campagne interne servite da
// get_sponsorships/SponsorCard. Chiunque arrivi qui è già owner/moderatore
// (lo impone comunque la RLS sponsorships_staff_write).
function SponsorshipsPane({ sponsorships, onCreate, onUpdate }) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);

  return (
    <div>
      <p className="rb-admin-hint">
        Spazi sponsorizzati interni (nessuna rete esterna): card nel feed Social, righe negli annunci/vetrina, banner
        nei pannelli di Arte/Nerd/Lavoro/Incontri. Mai in Bambini, FAQ o nelle chat.
      </p>

      {!creating && (
        <button type="button" className="rb-btn-primary" onClick={() => setCreating(true)}>
          + Nuova campagna
        </button>
      )}

      {creating && (
        <SponsorshipForm
          onCancel={() => setCreating(false)}
          onSave={async (fields) => {
            const { error } = await onCreate(fields);
            if (error) return error;
            setCreating(false);
          }}
        />
      )}

      <div className="rb-admin-table-wrap">
        <table className="rb-admin-table">
          <thead>
            <tr>
              <th>Mondo</th>
              <th>Categoria</th>
              <th>Formato</th>
              <th>Titolo</th>
              <th>Inserzionista</th>
              <th>Periodo</th>
              <th>Stato</th>
              <th>Visual.</th>
              <th>Clic</th>
              <th>CTR</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sponsorships.map((s) => {
              const ctr = s.visualizzazioni > 0 ? ((s.clic / s.visualizzazioni) * 100).toFixed(1) : '—';
              return editingId === s.id ? (
                <tr key={s.id}>
                  <td colSpan={11}>
                    <SponsorshipForm
                      initial={s}
                      onCancel={() => setEditingId(null)}
                      onSave={async (fields) => {
                        const { error } = await onUpdate(s.id, fields);
                        if (error) return error;
                        setEditingId(null);
                      }}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={s.id}>
                  <td>{s.mondo}</td>
                  <td>{s.categoria || '—'}</td>
                  <td>{s.formato}</td>
                  <td>{s.titolo}</td>
                  <td>{s.inserzionista}</td>
                  <td>
                    {new Date(s.inizio).toLocaleDateString('it-IT')}
                    {s.fine ? ` → ${new Date(s.fine).toLocaleDateString('it-IT')}` : ' → —'}
                  </td>
                  <td>
                    <span className={`rb-admin-role-badge rb-admin-sponsor-stato-${s.stato}`}>
                      {SPONSOR_STATO_LABELS[s.stato] ?? s.stato}
                    </span>
                  </td>
                  <td>{s.visualizzazioni}</td>
                  <td>{s.clic}</td>
                  <td>{ctr === '—' ? ctr : `${ctr}%`}</td>
                  <td>
                    <button type="button" className="rb-admin-reset-btn" onClick={() => setEditingId(s.id)}>
                      Modifica
                    </button>
                  </td>
                </tr>
              );
            })}
            {sponsorships.length === 0 && (
              <tr>
                <td colSpan={11} className="rb-admin-empty">Nessuna campagna ancora.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MailboxPane({ messages, onMarkRead }) {
  return (
    <div className="rb-admin-mailbox">
      <p className="rb-admin-hint">
        Richieste urgenti degli utenti (es. cambio nickname o nome fuori dal tempo consentito), condivise tra
        owner e moderatori.
      </p>
      {messages.length === 0 && <p className="rb-admin-empty">Nessun messaggio.</p>}
      <ul className="rb-admin-mail-list">
        {messages.map((m) => (
          <li key={m.id} className={`rb-admin-mail-item ${m.letto ? '' : 'unread'}`}>
            <div className="rb-admin-mail-head">
              <strong>{m.subject}</strong>
              <span>{new Date(m.data).toLocaleString('it-IT')}</span>
            </div>
            <p className="rb-admin-mail-from">Da: {m.fromNickname}</p>
            <p className="rb-admin-mail-body">{m.body}</p>
            {!m.letto && (
              <button type="button" onClick={() => onMarkRead(m.id)}>
                Segna come letto
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Coda di moderazione: segnalazioni su post/commenti/profili/gruppi/live/
// eventi. "Prendi in carico" e "Chiudi" sono le uniche azioni possibili qui
// (la rimozione del contenuto segnalato si fa dal mondo dove vive, non da
// qui) — servono soprattutto a tracciare chi si sta occupando di cosa,
// specialmente nel mondo Bambini dove la moderazione è prioritaria.
function ReportsPane({ reports, onChangeStatus, onOpenReport }) {
  const [filtro, setFiltro] = useState('aperto');
  const visibili = filtro === 'tutti' ? reports : reports.filter((r) => r.stato === filtro);

  return (
    <div>
      <p className="rb-admin-hint">
        Segnalazioni degli utenti su contenuti o profili. Prioritarie quelle sul mondo Bambini.
      </p>
      <div className="rb-admin-tabs rb-admin-subtabs">
        {['aperto', 'in_lavorazione', 'chiuso', 'tutti'].map((f) => (
          <button key={f} type="button" className={filtro === f ? 'active' : ''} onClick={() => setFiltro(f)}>
            {f === 'tutti' ? 'Tutte' : REPORT_STATO_LABELS[f]}
          </button>
        ))}
      </div>
      {visibili.length === 0 && <p className="rb-admin-empty">Nessuna segnalazione.</p>}
      <ul className="rb-admin-mail-list">
        {visibili.map((r) => (
          <li key={r.id} {...clickableRow(() => onOpenReport(r.id))} className="rb-admin-mail-item rb-admin-clickable" aria-label={`Apri la segnalazione: ${REPORT_TARGET_LABELS[r.targetType] ?? r.targetType}, ${r.motivo}`}>
            <div className="rb-admin-mail-head">
              <strong>{REPORT_TARGET_LABELS[r.targetType] ?? r.targetType}</strong>
              <span>{new Date(r.data).toLocaleString('it-IT')}</span>
            </div>
            <p className="rb-admin-mail-from">
              Da: {r.reporterNickname ?? 'Account eliminato'} · Stato:{' '}
              <span className={`rb-admin-role-badge rb-report-stato-${r.stato}`}>
                {REPORT_STATO_LABELS[r.stato] ?? r.stato}
              </span>
              {r.stato !== 'aperto' && <> · Gestita da: {r.gestitoDaNickname ?? 'Account eliminato'}</>}
            </p>
            <p className="rb-admin-mail-body">{r.motivo}</p>
            {r.dettagli && <p className="rb-admin-mail-body">{r.dettagli}</p>}
            <div className="rb-admin-report-actions" onClick={(e) => e.stopPropagation()}>
              {r.stato === 'aperto' && (
                <button type="button" onClick={() => onChangeStatus(r.id, 'in_lavorazione')}>
                  Prendi in carico
                </button>
              )}
              {r.stato !== 'chiuso' && (
                <button type="button" onClick={() => onChangeStatus(r.id, 'chiuso')}>
                  Chiudi
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Log di sola lettura delle azioni di owner/moderatori (cambio ruolo,
// verifica documento, reset password, gestione segnalazione): serve per
// accountability, non è modificabile da qui.
function AuditLogPane({ entries, onOpenEntry }) {
  return (
    <div>
      <p className="rb-admin-hint">Ogni azione di owner e moderatori, per tenerne traccia.</p>
      {entries.length === 0 && <p className="rb-admin-empty">Nessuna azione registrata finora.</p>}
      <div className="rb-admin-table-wrap">
        <table className="rb-admin-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Chi</th>
              <th>Azione</th>
              <th>Su</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} {...clickableRow(() => onOpenEntry(e.id))}>
                <td>{new Date(e.data).toLocaleString('it-IT')}</td>
                <td>{e.staffNickname ?? 'Account eliminato'}</td>
                <td>{AUDIT_LABELS[e.azione] ?? e.azione}</td>
                <td>{e.azione === 'gestione_segnalazione' ? '—' : (e.targetNickname ?? 'Account eliminato')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Sezione backend: "Utenti" (elenco di chi si è registrato, con ruolo,
// verifica e reset password) e "Posta" (casella condivisa owner/
// moderatori). Solo l'owner può cambiare i ruoli; verifica e reset
// password sono aperti anche ai moderatori, tranne che sulla riga
// dell'owner — quella resta intoccabile da chiunque non sia l'owner
// stesso (le regole vere le applica Supabase lato server, qui è solo UI).
export default function AdminPanel({ user, onClose }) {
  const [tab, setTab] = useState('utenti');
  const [messages, setMessages] = useState([]);
  const [reports, setReports] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [sponsorships, setSponsorships] = useState([]);
  // Chat INFO BAN in attesa di una risposta (badge della scheda).
  const [banWaiting, setBanWaiting] = useState(0);
  // Finestre di dettaglio aperte (id della segnalazione / della riga del log).
  const [openReportId, setOpenReportId] = useState(null);
  const [openAuditId, setOpenAuditId] = useState(null);
  const openReport = reports.find((r) => r.id === openReportId) ?? null;
  const openAudit = auditLog.find((e) => e.id === openAuditId) ?? null;
  const unreadCount = messages.filter((m) => !m.letto).length;
  const openReportsCount = reports.filter((r) => r.stato === 'aperto').length;

  const refreshMessages = () => getMailboxMessages().then(setMessages);
  const refreshReports = () => getReports().then(setReports);
  const refreshAuditLog = () => getAuditLog().then(setAuditLog);
  const refreshSponsorships = () => listAllSponsorships().then(setSponsorships);

  useEffect(() => {
    refreshMessages();
    refreshReports();
    refreshAuditLog();
    refreshSponsorships();
  }, []);

  const markRead = async (messageId) => {
    await markMessageRead(messageId);
    refreshMessages();
  };

  const changeReportStatus = async (reportId, stato) => {
    const { error } = await updateReportStatus(reportId, stato);
    if (!error) {
      refreshReports();
      await logAdminAction('gestione_segnalazione', null, { reportId, nuovoStato: stato });
      refreshAuditLog();
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-admin-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        <h2>Backend</h2>

        <div className="rb-admin-tabs">
          {ADMIN_TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'posta' && unreadCount > 0 && <span className="rb-admin-tab-badge">{unreadCount}</span>}
              {t.id === 'moderazione' && openReportsCount > 0 && (
                <span className="rb-admin-tab-badge">{openReportsCount}</span>
              )}
              {t.id === 'infoban' && banWaiting > 0 && <span className="rb-admin-tab-badge">{banWaiting}</span>}
            </button>
          ))}
        </div>

        {tab === 'utenti' && <AdminUsersPane user={user} onAuditChanged={refreshAuditLog} />}

        {tab === 'posta' && <MailboxPane messages={messages} onMarkRead={markRead} />}
        {tab === 'moderazione' && <ReportsPane reports={reports} onChangeStatus={changeReportStatus} onOpenReport={setOpenReportId} />}
        {/* Montata sempre (nascosta fuori dalla sua scheda): il badge "in
            attesa" resta aggiornato anche guardando le altre schede. */}
        <div hidden={tab !== 'infoban'}>
          <p className="rb-admin-hint">
            Chat con gli account bloccati. Chi aspetta una risposta è in cima; tocca il profilo dell'utente per sbloccarlo o eliminarlo.
          </p>
          <InfoBanStaffView compact onWaitingChange={setBanWaiting} />
        </div>
        {tab === 'sponsorizzazioni' && (
          <SponsorshipsPane
            sponsorships={sponsorships}
            onCreate={async (fields) => {
              const { error } = await createSponsorship(fields);
              if (error) return { error };
              refreshSponsorships();
              return {};
            }}
            onUpdate={async (id, fields) => {
              const { error } = await updateSponsorship(id, fields);
              if (error) return { error };
              refreshSponsorships();
              return {};
            }}
          />
        )}
        {tab === 'log' && <AuditLogPane entries={auditLog} onOpenEntry={setOpenAuditId} />}
      </div>

      {openReport && <ReportDetailDialog key={openReport.id} report={openReport} onClose={() => setOpenReportId(null)} onChangeStatus={changeReportStatus} />}
      {openAudit && (
        <AuditDetailDialog
          entry={openAudit}
          onClose={() => setOpenAuditId(null)}
          onOpenReport={(reportId) => {
            setOpenAuditId(null);
            setTab('moderazione');
            setOpenReportId(reportId);
          }}
        />
      )}

    </ModalOverlay>
  );
}
