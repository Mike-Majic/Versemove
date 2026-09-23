import { useEffect, useState } from 'react';
import { getAccounts, updateAccountRole, setAccountVerified, resetAccountPassword, banAccount, unbanAccount } from '../data/accounts';
import { getMailboxMessages, markMessageRead } from '../data/modMailbox';
import { getReports, updateReportStatus } from '../data/reports';
import { getAuditLog, logAdminAction, AUDIT_LABELS } from '../data/adminAuditLog';
import { listAllSponsorships, createSponsorship, updateSponsorship } from '../data/sponsorships';
import { supabase } from '../data/supabaseClient';
import { computeAge } from '../data/age';
import { ROLES } from '../data/roles';
import ModalOverlay from './ModalOverlay';
import './AdminPanel.css';

const ROLE_LABELS = { [ROLES.OWNER]: 'Owner', [ROLES.MODERATOR]: 'Moderatore', [ROLES.USER]: 'Utente' };

const REPORT_TARGET_LABELS = {
  post: 'Post',
  commento: 'Commento',
  profilo: 'Profilo',
  gruppo: 'Gruppo',
  live: 'Live',
  evento: 'Evento',
};

const REPORT_STATO_LABELS = { aperto: 'Aperto', in_lavorazione: 'In lavorazione', chiuso: 'Chiuso' };

const ADMIN_TABS = [
  { id: 'utenti', label: 'Utenti' },
  { id: 'posta', label: 'Posta' },
  { id: 'moderazione', label: 'Moderazione' },
  { id: 'sponsorizzazioni', label: 'Sponsorizzazioni' },
  { id: 'log', label: 'Log azioni' },
];

const SPONSOR_MONDI = ['social', 'vetrina', 'annunci', 'arte', 'nerd', 'lavoro', 'incontri'];
const SPONSOR_FORMATI = ['card_feed', 'banner_pannello', 'riga_lista'];
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
  const [peso, setPeso] = useState(initial?.peso ?? 1);
  const [inizio, setInizio] = useState(toDatetimeLocal(initial?.inizio) || toDatetimeLocal(new Date().toISOString()));
  const [fine, setFine] = useState(toDatetimeLocal(initial?.fine));
  const [stato, setStato] = useState(initial?.stato ?? 'attiva');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
      solo_maggiorenni: soloMaggiorenni,
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
          <input type="checkbox" checked={soloMaggiorenni} onChange={(e) => setSoloMaggiorenni(e.target.checked)} />
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

// Cella "Ban" della tabella Utenti: badge di stato se già bannato (con
// pulsante per togliere il ban), altrimenti un piccolo form inline
// (motivo facoltativo, scadenza facoltativa = permanente) per bannarlo —
// stesso schema "apri form inline nella riga" del resto del pannello
// (SponsorshipsPane). canBan arriva già calcolato dal chiamante: protegge
// la riga dell'owner (mai bannabile) e quella di un moderatore (solo
// l'owner può bannare un altro moderatore), rispecchiando lato client la
// stessa gerarchia che la funzione set_account_banned impone lato server.
function BanCell({ account, canBan, onBan, onUnban }) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [finoAl, setFinoAl] = useState('');
  const [saving, setSaving] = useState(false);

  if (account.bannato) {
    return (
      <div className="rb-admin-ban-cell">
        <span className="rb-admin-role-badge rb-admin-banned-badge">
          Bannato{account.banFinoAl ? ` fino al ${new Date(account.banFinoAl).toLocaleDateString('it-IT')}` : ''}
        </span>
        {canBan && (
          <button type="button" className="rb-admin-reset-btn" onClick={() => onUnban(account)}>
            Rimuovi ban
          </button>
        )}
      </div>
    );
  }

  if (!canBan) return <span className="rb-admin-empty">—</span>;

  if (!open) {
    return (
      <button type="button" className="rb-admin-reset-btn" onClick={() => setOpen(true)}>
        Banna
      </button>
    );
  }

  const submit = async () => {
    setSaving(true);
    await onBan(account, motivo, finoAl ? fromDatetimeLocal(finoAl) : null);
    setSaving(false);
    setOpen(false);
    setMotivo('');
    setFinoAl('');
  };

  return (
    <div className="rb-admin-ban-form">
      <textarea placeholder="Motivo (facoltativo)" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
      <label>
        Fino al (vuoto = permanente)
        <input type="datetime-local" value={finoAl} onChange={(e) => setFinoAl(e.target.value)} />
      </label>
      <div className="rb-admin-ban-form-actions">
        <button type="button" className="rb-reset-filters-btn" onClick={() => setOpen(false)} disabled={saving}>Annulla</button>
        <button type="button" className="rb-btn-primary" onClick={submit} disabled={saving}>{saving ? 'Salvo…' : 'Conferma'}</button>
      </div>
    </div>
  );
}

// Apre un allegato in una nuova scheda: il bucket "attachments" è privato,
// quindi serve un URL firmato temporaneo (valido 60 secondi) invece di un
// link diretto — è così che owner/moderatori guardano il documento caricato
// in registrazione prima di segnare un account come verificato, nessun
// servizio di controllo automatico dietro, solo revisione umana.
async function openAttachment(att) {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(att.path, 60);
  if (error || !data?.signedUrl) return;
  window.open(data.signedUrl, '_blank', 'noopener');
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
function ReportsPane({ reports, onChangeStatus }) {
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
          <li key={r.id} className="rb-admin-mail-item">
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
            <div className="rb-admin-report-actions">
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
function AuditLogPane({ entries }) {
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
              <tr key={e.id}>
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
  const [accounts, setAccounts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reports, setReports] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [sponsorships, setSponsorships] = useState([]);
  const [resetSentTo, setResetSentTo] = useState(null);
  const isOwner = user?.ruolo === ROLES.OWNER;
  const unreadCount = messages.filter((m) => !m.letto).length;
  const openReportsCount = reports.filter((r) => r.stato === 'aperto').length;

  const refreshAccounts = () => getAccounts().then(setAccounts);
  const refreshMessages = () => getMailboxMessages().then(setMessages);
  const refreshReports = () => getReports().then(setReports);
  const refreshAuditLog = () => getAuditLog().then(setAuditLog);
  const refreshSponsorships = () => listAllSponsorships().then(setSponsorships);

  useEffect(() => {
    refreshAccounts();
    refreshMessages();
    refreshReports();
    refreshAuditLog();
    refreshSponsorships();
  }, []);

  const changeRole = async (accountId, newRole) => {
    const { error } = await updateAccountRole(accountId, newRole);
    if (!error) {
      refreshAccounts();
      await logAdminAction('cambio_ruolo', accountId, { nuovoRuolo: newRole });
      refreshAuditLog();
    }
  };

  const toggleVerified = async (account) => {
    const nuovoStato = !account.verificato;
    const { error } = await setAccountVerified(account.id, nuovoStato);
    if (!error) {
      refreshAccounts();
      await logAdminAction('verifica_documento', account.id, { verificato: nuovoStato });
      refreshAuditLog();
    }
  };

  const doResetPassword = async (account) => {
    const { error } = await resetAccountPassword(account.email);
    if (!error) {
      setResetSentTo(account);
      await logAdminAction('reset_password', account.id, {});
      refreshAuditLog();
    }
  };

  const banUser = async (account, motivo, finoAl) => {
    const { error } = await banAccount(account.id, motivo, finoAl);
    if (!error) {
      refreshAccounts();
      await logAdminAction('ban_account', account.id, { motivo: motivo || null, finoAl });
      refreshAuditLog();
    }
  };

  const unbanUser = async (account) => {
    const { error } = await unbanAccount(account.id);
    if (!error) {
      refreshAccounts();
      await logAdminAction('unban_account', account.id, {});
      refreshAuditLog();
    }
  };

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
            </button>
          ))}
        </div>

        {tab === 'utenti' && (
          <>
            <p className="rb-admin-hint">
              {isOwner
                ? 'Elenco di chi si è registrato. Puoi cambiare ruolo, verificare un documento o inviare una mail di reset password.'
                : "Elenco di chi si è registrato. Puoi verificare un documento o inviare una mail di reset password; solo l'owner cambia i ruoli."}
            </p>

            <div className="rb-admin-table-wrap">
              <table className="rb-admin-table">
                <thead>
                  <tr>
                    <th>Nome utente</th>
                    <th>Nickname</th>
                    <th>Nome e cognome</th>
                    <th>Mail</th>
                    <th>Cellulare</th>
                    <th>Mail di backup</th>
                    <th>Età</th>
                    <th>Allegati</th>
                    <th>Verifica</th>
                    <th>Ruolo</th>
                    <th>Password</th>
                    <th>Ban</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => {
                    const isOwnerRow = a.ruolo === ROLES.OWNER;
                    const canManageRow = isOwner || !isOwnerRow;
                    const age = computeAge(a.dataNascita);
                    return (
                      <tr key={a.id}>
                        <td>{a.username}</td>
                        <td>{a.nickname}</td>
                        <td>{[a.nome, a.cognome].filter(Boolean).join(' ') || '—'}</td>
                        <td>{a.email}</td>
                        <td>{a.phone || '—'}</td>
                        <td>{a.backupEmail || '—'}</td>
                        <td>{age ?? '—'}</td>
                        <td>
                          {a.attachments?.length > 0 ? (
                            <div className="rb-admin-attachments">
                              {a.attachments.map((att, i) => (
                                <button key={i} type="button" onClick={() => openAttachment(att)} title={att.name}>
                                  📎{i + 1}
                                </button>
                              ))}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`rb-admin-verified-btn ${a.verificato ? 'active' : ''}`}
                            onClick={() => toggleVerified(a)}
                            disabled={!canManageRow}
                          >
                            {a.verificato ? '✓ Verificato' : 'Non verificato'}
                          </button>
                        </td>
                        <td>
                          {isOwner && !isOwnerRow ? (
                            <select value={a.ruolo} onChange={(e) => changeRole(a.id, e.target.value)}>
                              <option value={ROLES.USER}>{ROLE_LABELS[ROLES.USER]}</option>
                              <option value={ROLES.MODERATOR}>{ROLE_LABELS[ROLES.MODERATOR]}</option>
                            </select>
                          ) : (
                            <span className={`rb-admin-role-badge ${a.ruolo}`}>{ROLE_LABELS[a.ruolo] ?? a.ruolo}</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="rb-admin-reset-btn"
                            onClick={() => doResetPassword(a)}
                            disabled={!canManageRow}
                          >
                            Reset
                          </button>
                        </td>
                        <td>
                          <BanCell
                            account={a}
                            canBan={!isOwnerRow && (a.ruolo !== ROLES.MODERATOR || isOwner)}
                            onBan={banUser}
                            onUnban={unbanUser}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {accounts.length === 0 && (
                    <tr>
                      <td colSpan={12} className="rb-admin-empty">Nessuno si è ancora registrato.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'posta' && <MailboxPane messages={messages} onMarkRead={markRead} />}
        {tab === 'moderazione' && <ReportsPane reports={reports} onChangeStatus={changeReportStatus} />}
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
        {tab === 'log' && <AuditLogPane entries={auditLog} />}
      </div>

      {resetSentTo && (
        <ModalOverlay onClose={() => setResetSentTo(null)} className="rb-admin-reset-overlay">
          <div className="rb-admin-reset-card" onClick={(e) => e.stopPropagation()}>
            <h3>Mail di reset inviata</h3>
            <p>
              A {resetSentTo.nickname} ({resetSentTo.email}) è arrivata una mail con il link per scegliere una
              nuova password — nessuna password passa da qui, in chiaro o no.
            </p>
            <button type="button" onClick={() => setResetSentTo(null)}>Ho preso nota, chiudi</button>
          </div>
        </ModalOverlay>
      )}
    </ModalOverlay>
  );
}
