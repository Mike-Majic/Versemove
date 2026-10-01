import { useCallback, useEffect, useRef, useState } from 'react';
import { useReportUnsaved } from '../../hooks/useUnsavedChanges';
import { updateAccountRole, setAccountVerified, resetAccountPassword, banAccount, unbanAccount } from '../../data/accounts';
import {
  ADMIN_USERS_PAGE,
  USER_COLUMNS,
  searchAdminUsers,
  countOnlineNow,
  isOnlineNow,
  lastSeenLabel,
  notifyBan,
  deleteUserForever,
  mailLabel,
} from '../../data/adminUsers';
import { logAdminAction } from '../../data/adminAuditLog';
import { supabase } from '../../data/supabaseClient';
import { computeAge } from '../../data/age';
import { ROLES } from '../../data/roles';
import { aziendaVerificaTesto } from '../../data/lavoro';
import ModalOverlay from '../ModalOverlay';
import './AdminUsersPane.css';

const ROLE_LABELS = { [ROLES.OWNER]: 'Owner', [ROLES.MODERATOR]: 'Moderatore', [ROLES.USER]: 'Utente' };
const SEARCH_DELAY_MS = 300;
const ONLINE_REFRESH_MS = 60 * 1000;

// Allegato privato (bucket "attachments"): URL firmato valido 60 secondi.
async function openAttachment(att) {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(att.path, 60);
  if (error || !data?.signedUrl) return;
  window.open(data.signedUrl, '_blank', 'noopener');
}

// Chi può bloccare, sbloccare o eliminare una riga: mai l'owner, mai se
// stessi, un moderatore solo se lo fa l'owner (la stessa gerarchia la
// impongono set_account_banned e staff-actions lato server).
function canModerate(viewer, account) {
  if (!viewer || !account) return false;
  if (account.id === viewer.id) return false;
  if (account.ruolo === ROLES.OWNER) return false;
  if (account.ruolo === ROLES.MODERATOR) return viewer.ruolo === ROLES.OWNER;
  return true;
}

// Intestazione di colonna: clic sul titolo -> campo di ricerca per quella
// colonna (o la scelta, per le colonne a valori fissi) e la freccia per
// ordinare crescente/decrescente.
function HeaderCell({ col, open, onToggle, value, onChange, sort, onSort, className = '' }) {
  const active = sort?.key === col.key;
  const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕';
  const filtered = value !== undefined && value !== null && String(value).trim() !== '';
  return (
    <th className={`${className} ${filtered ? 'filtered' : ''}`} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <div className="rb-admin-th">
        <button type="button" className="rb-admin-th-title" onClick={onToggle} aria-expanded={open}>
          {col.label}
          {filtered && <span className="rb-admin-th-dot" aria-label="filtrato" />}
        </button>
        <button
          type="button"
          className={`rb-admin-th-sort ${active ? 'on' : ''}`}
          onClick={onSort}
          aria-label={`Ordina per ${col.label}`}
          title={active ? (sort.dir === 'asc' ? 'Crescente (clic: decrescente)' : 'Decrescente (clic: crescente)') : 'Ordina'}
        >
          {arrow}
        </button>
      </div>
      {open &&
        (col.kind === 'select' ? (
          <select className="rb-admin-th-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} autoFocus>
            {col.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="rb-admin-th-input"
            type="search"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={col.kind === 'age' ? 'es. 30 o 18-25' : col.kind === 'name' ? 'Nome o cognome' : 'Cerca…'}
            autoFocus
          />
        ))}
    </th>
  );
}

// Durate del blocco nel menu a tendina "Blocca…". 'custom' apre nella
// finestra la scelta di ore o giorni a mano; 'forever' = senza scadenza
// (come "Fino al: vuoto" di prima).
const BAN_DURATIONS = [
  { value: '1d', label: '1 giorno', hours: 24 },
  { value: '3d', label: '3 giorni', hours: 72 },
  { value: '7d', label: '7 giorni', hours: 168 },
  { value: 'custom', label: 'Ore o giorni a scelta…' },
  { value: 'forever', label: 'Senza scadenza' },
];

// Motivazioni pronte: sceglierne una scrive il testo nel campo, che resta
// modificabile; "Scrivi tu" lascia il campo libero.
const BAN_REASONS = [
  'Linguaggio offensivo o insulti verso altri utenti.',
  'Spam o pubblicità non richiesta.',
  'Molestie o comportamento aggressivo.',
  'Contenuti inappropriati o non adatti alla community.',
  'Profilo falso o uso dell’identità di un’altra persona.',
  'Truffa o tentativo di frode.',
  'Violazioni ripetute delle regole della community.',
];

const MAX_CUSTOM = { ore: 24 * 365, giorni: 365 };

function durationLabel(hours) {
  if (hours % 24 === 0) {
    const d = hours / 24;
    return d === 1 ? '1 giorno' : `${d} giorni`;
  }
  return hours === 1 ? '1 ora' : `${hours} ore`;
}

// Finestra del blocco: la durata scelta (o ore/giorni a mano), poi la
// motivazione — da un elenco di risposte pronte o scritta a mano. La
// motivazione arriva all'utente (fascia "Account bloccato" e mail).
function BanDialog({ account, duration, onClose, onConfirm }) {
  const [customAmount, setCustomAmount] = useState('');
  const [customUnit, setCustomUnit] = useState('giorni');
  const [preset, setPreset] = useState('');
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useReportUnsaved(motivo.trim() !== '' || customAmount !== '');
  const name = account.nickname || account.username || 'questo utente';
  const choice = BAN_DURATIONS.find((d) => d.value === duration);

  const amount = Number(customAmount);
  const customValid = Number.isInteger(amount) && amount >= 1 && amount <= MAX_CUSTOM[customUnit];
  const hours =
    duration === 'forever' ? null : duration === 'custom' ? (customValid ? amount * (customUnit === 'ore' ? 1 : 24) : null) : choice?.hours ?? null;
  // Anteprima della scadenza dal momento in cui si è aperta la finestra
  // (quella vera si ricalcola alla conferma, vedi run).
  const [openedAt] = useState(() => Date.now());
  const until = hours ? new Date(openedAt + hours * 3600 * 1000) : null;
  const durationOk = duration === 'forever' || Boolean(hours);
  const canConfirm = durationOk && motivo.trim().length > 0 && !busy;

  const pickPreset = (value) => {
    setPreset(value);
    if (value !== '') setMotivo(BAN_REASONS[Number(value)]);
  };

  const run = async () => {
    if (!canConfirm) return;
    setBusy(true);
    setError('');
    // La scadenza si ricalcola adesso, non quando si è aperta la finestra.
    const finoAl = hours ? new Date(Date.now() + hours * 3600 * 1000).toISOString() : null;
    const res = await onConfirm(account, motivo.trim(), finoAl);
    setBusy(false);
    if (res?.error) setError(res.error);
  };

  return (
    <ModalOverlay onClose={busy ? () => {} : onClose} className="rb-admin-reset-overlay">
      <div className="rb-admin-reset-card rb-admin-delete-card rb-admin-ban-card" onClick={(e) => e.stopPropagation()}>
        <h3>Blocca {name}</h3>

        {duration === 'custom' ? (
          <div className="rb-admin-delete-field">
            Durata
            <div className="rb-admin-ban-custom">
              <input
                type="number"
                min={1}
                max={MAX_CUSTOM[customUnit]}
                step={1}
                inputMode="numeric"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="es. 12"
                aria-label="Quante ore o giorni"
                autoFocus
              />
              <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} aria-label="Ore o giorni">
                <option value="ore">ore</option>
                <option value="giorni">giorni</option>
              </select>
            </div>
            {customAmount !== '' && !customValid && (
              <small className="rb-admin-error">
                Scrivi un numero intero da 1 a {MAX_CUSTOM[customUnit]} {customUnit}.
              </small>
            )}
          </div>
        ) : null}

        <p className="rb-admin-ban-summary">
          {duration === 'forever'
            ? 'Blocco senza scadenza: resta finché qualcuno dello staff non lo toglie.'
            : until
            ? `Blocco di ${durationLabel(hours)}, fino al ${until.toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' })}.`
            : 'Scegli quante ore o quanti giorni.'}
        </p>

        <label className="rb-admin-delete-field">
          Motivazione
          <select value={preset} onChange={(e) => pickPreset(e.target.value)}>
            <option value="">Scrivi tu la motivazione…</option>
            {BAN_REASONS.map((r, i) => (
              <option key={r} value={String(i)}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="rb-admin-delete-field">
          Messaggio per l'utente
          <textarea
            rows={4}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Perché viene bloccato: lo vedrà nella fascia in alto e nella mail."
            autoFocus={duration !== 'custom'}
          />
        </label>

        {error && <p className="rb-admin-error">⚠️ {error}</p>}
        <div className="rb-admin-delete-actions">
          <button type="button" className="rb-reset-filters-btn" onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button type="button" className="rb-admin-danger-btn" onClick={run} disabled={!canConfirm}>
            {busy ? 'Blocco…' : 'Blocca'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// Cella del blocco: già bloccato -> "Sblocca"; altrimenti il menu a
// tendina "Blocca…" con le durate, che apre la finestra della motivazione.
function BanControl({ account, enabled, onBan, onUnban }) {
  const [duration, setDuration] = useState(null);

  if (account.bannato) {
    return (
      <button type="button" className="rb-admin-reset-btn" onClick={() => onUnban(account)} disabled={!enabled}>
        Sblocca
      </button>
    );
  }
  return (
    <>
      <select
        className="rb-admin-ban-select"
        value=""
        onChange={(e) => {
          if (e.target.value) setDuration(e.target.value);
        }}
        disabled={!enabled}
        aria-label={`Blocca ${account.nickname || account.username || 'utente'}`}
      >
        <option value="">Blocca…</option>
        {BAN_DURATIONS.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
      {duration && (
        <BanDialog
          account={account}
          duration={duration}
          onClose={() => setDuration(null)}
          onConfirm={async (acc, motivo, finoAl) => {
            const res = await onBan(acc, motivo, finoAl);
            if (!res?.error) setDuration(null);
            return res;
          }}
        />
      )}
    </>
  );
}

// Finestra "Elimina utente": motivo + la parola ELIMINA da scrivere. Usata
// anche dalla vista Info ban (Elimina definitivamente).
export function DeleteUserDialog({ account, onClose, onDeleted }) {
  const [motivo, setMotivo] = useState('');
  const [conferma, setConferma] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useReportUnsaved(motivo.trim() !== '' || conferma !== '');
  const name = account.nickname || account.username || 'questo utente';

  const run = async () => {
    setBusy(true);
    setError('');
    const res = await deleteUserForever(account.id, motivo.trim());
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onDeleted?.(account, res.email);
  };

  return (
    <ModalOverlay onClose={busy ? () => {} : onClose} className="rb-admin-reset-overlay">
      <div className="rb-admin-reset-card rb-admin-delete-card" onClick={(e) => e.stopPropagation()}>
        <h3>Elimina definitivamente {name}</h3>
        <p>
          Account, profilo, contenuti e file vengono cancellati e non si possono recuperare. L'utente riceve una mail con il
          motivo, se la posta è configurata.
        </p>
        <label className="rb-admin-delete-field">
          Motivo
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Perché viene eliminato" />
        </label>
        <label className="rb-admin-delete-field">
          Per confermare scrivi <strong>ELIMINA</strong>
          <input type="text" value={conferma} onChange={(e) => setConferma(e.target.value)} autoComplete="off" />
        </label>
        {error && <p className="rb-admin-error">⚠️ {error}</p>}
        <div className="rb-admin-delete-actions">
          <button type="button" className="rb-reset-filters-btn" onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button type="button" className="rb-admin-danger-btn" onClick={run} disabled={busy || conferma !== 'ELIMINA'}>
            {busy ? 'Elimino…' : 'Elimina utente'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// Tabella Utenti del Backend: ricerca e ordinamento per colonna fatti dal
// server, 50 righe per pagina; riquadro alto al massimo ~65vh che scorre
// nei due sensi (barra orizzontale sempre in fondo al riquadro, Maiusc +
// rotella = orizzontale), intestazioni fisse in alto, "Nome utente" fisso a
// sinistra e "Azioni" fisso a destra.
export default function AdminUsersPane({ user, onAuditChanged }) {
  const isOwner = user?.ruolo === ROLES.OWNER;
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({});
  const [debounced, setDebounced] = useState({});
  const [sort, setSort] = useState(null);
  const [openCol, setOpenCol] = useState(null);
  const [onlineNow, setOnlineNow] = useState(null);
  const [notice, setNotice] = useState(null); // { tone: 'ok' | 'error', text }
  const [resetSentTo, setResetSentTo] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const wrapRef = useRef(null);
  const requestRef = useRef(0);

  // Ricerca ritardata di 300 ms: si interroga il server solo quando si
  // smette di scrivere.
  // Filtri nuovi: si riparte dalla prima pagina (nello stesso aggiornamento,
  // così non parte una richiesta inutile con la pagina vecchia).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(filters);
      setPage(0);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [filters]);

  const load = useCallback(async () => {
    const id = ++requestRef.current;
    const res = await searchAdminUsers({ filters: debounced, sort, page });
    if (id !== requestRef.current) return; // risposta superata da una più recente
    setLoadError(res.error ?? '');
    setRows(res.rows);
    setTotal(res.total);
  }, [debounced, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const tick = () =>
      countOnlineNow().then((n) => {
        if (!cancelled) setOnlineNow(n);
      });
    tick();
    const id = setInterval(tick, ONLINE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Maiusc + rotella = scorrimento orizzontale (serve un ascoltatore non
  // passivo per poter fermare lo scorrimento verticale).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.shiftKey) return;
      const delta = e.deltaX || e.deltaY;
      if (!delta) return;
      el.scrollLeft += delta;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const toggleSort = (key) => {
    setPage(0);
    setSort((prev) => (prev?.key !== key ? { key, dir: 'asc' } : prev.dir === 'asc' ? { key, dir: 'desc' } : null));
  };
  const clearFilters = () => {
    setFilters({});
    setOpenCol(null);
  };
  const hasFilters = Object.values(filters).some((v) => v !== undefined && v !== null && String(v).trim() !== '');

  const afterChange = async (action, accountId, details) => {
    await logAdminAction(action, accountId, details);
    onAuditChanged?.();
    load();
  };

  const changeRole = async (account, newRole) => {
    const { error } = await updateAccountRole(account.id, newRole);
    if (error) setNotice({ tone: 'error', text: error });
    else afterChange('cambio_ruolo', account.id, { nuovoRuolo: newRole });
  };

  const toggleVerified = async (account) => {
    const nuovoStato = !account.verificato;
    const { error } = await setAccountVerified(account.id, nuovoStato);
    if (error) setNotice({ tone: 'error', text: error });
    else afterChange('verifica_documento', account.id, { verificato: nuovoStato });
  };

  const doResetPassword = async (account) => {
    const { error } = await resetAccountPassword(account.email);
    if (error) {
      setNotice({ tone: 'error', text: error });
      return;
    }
    setResetSentTo(account);
    await logAdminAction('reset_password', account.id, {});
    onAuditChanged?.();
  };

  // Blocco riuscito -> la mail di avviso (staff-actions notifica_ban), con
  // l'esito della mail accanto al messaggio.
  // -> { error } se il blocco non riesce (mostrato nella finestra del
  // blocco), {} se riesce.
  const ban = async (account, motivo, finoAl) => {
    const { error } = await banAccount(account.id, motivo, finoAl);
    if (error) return { error };
    const name = account.nickname || account.username;
    const mail = await notifyBan(account.id, motivo?.trim() || '');
    setNotice(
      mail.error
        ? { tone: 'error', text: `${name} bloccato, ma l'avviso non è partito: ${mail.error}` }
        : { tone: 'ok', text: `${name} bloccato · ${mailLabel(mail.email)}` }
    );
    afterChange('ban_account', account.id, { motivo: motivo || null, finoAl });
    return {};
  };

  const unban = async (account) => {
    const { error } = await unbanAccount(account.id);
    if (error) {
      setNotice({ tone: 'error', text: error });
      return;
    }
    setNotice({ tone: 'ok', text: `${account.nickname || account.username} sbloccato` });
    afterChange('unban_account', account.id, {});
  };

  const pages = Math.max(1, Math.ceil(total / ADMIN_USERS_PAGE));
  const from = total === 0 ? 0 : page * ADMIN_USERS_PAGE + 1;
  const to = Math.min(total, (page + 1) * ADMIN_USERS_PAGE);
  const col = (key) => USER_COLUMNS.find((c) => c.key === key);
  const header = (key, className = '') => (
    <HeaderCell
      key={key}
      col={col(key)}
      className={className}
      open={openCol === key}
      onToggle={() => setOpenCol((v) => (v === key ? null : key))}
      value={filters[key]}
      onChange={(v) => setFilter(key, v)}
      sort={sort}
      onSort={() => toggleSort(key)}
    />
  );

  return (
    <>
      <p className="rb-admin-hint">
        {isOwner
          ? 'Tocca il titolo di una colonna per cercare in quella colonna; la freccia ordina. Puoi cambiare ruolo, verificare, resettare la password, bloccare o eliminare.'
          : "Tocca il titolo di una colonna per cercare; la freccia ordina. Puoi verificare, resettare la password, bloccare o eliminare; solo l'owner cambia i ruoli."}
      </p>

      <div className="rb-admin-users-bar">
        <span className="rb-admin-online-now">
          <span className="rb-admin-online-dot" aria-hidden="true" />
          {onlineNow === null ? '…' : onlineNow} online ora
        </span>
        <span className="rb-admin-users-count">
          {rows === null ? 'Carico…' : total === 0 ? 'Nessun risultato' : `${from}–${to} di ${total}`}
        </span>
        {hasFilters && (
          <button type="button" className="rb-reset-filters-btn" onClick={clearFilters}>
            Azzera ricerca
          </button>
        )}
      </div>

      {notice && (
        <p className={`rb-admin-notice ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.tone === 'error' ? '⚠️ ' : '✓ '}
          {notice.text}
          <button type="button" onClick={() => setNotice(null)} aria-label="Chiudi avviso">
            ✕
          </button>
        </p>
      )}
      {loadError && <p className="rb-admin-notice error">⚠️ {loadError}</p>}

      <div className="rb-admin-table-wrap rb-admin-users-wrap" ref={wrapRef}>
        <table className="rb-admin-table rb-admin-users-table">
          <thead>
            <tr>
              {header('username', 'rb-sticky-left')}
              {header('nickname')}
              {header('nome')}
              {header('email')}
              {header('phone')}
              {header('backup_email')}
              {header('eta')}
              {header('online')}
              <th>
                <div className="rb-admin-th plain">Allegati</div>
              </th>
              {header('verificato')}
              {header('ruolo')}
              {header('bannato')}
              <th className="rb-sticky-right">
                <div className="rb-admin-th plain">Azioni</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((a) => {
              const isOwnerRow = a.ruolo === ROLES.OWNER;
              const canManageRow = isOwner || !isOwnerRow;
              const moderate = canModerate(user, a);
              const age = computeAge(a.dataNascita);
              const online = isOnlineNow(a.lastSeenAt);
              return (
                <tr key={a.id}>
                  <td className="rb-sticky-left">{a.username || '—'}</td>
                  <td>{a.nickname || '—'}</td>
                  <td>{[a.nome, a.cognome].filter(Boolean).join(' ') || '—'}</td>
                  <td>{a.email || '—'}</td>
                  <td>{a.phone || '—'}</td>
                  <td>{a.backupEmail || '—'}</td>
                  <td>{age ?? '—'}</td>
                  <td>
                    {online ? (
                      <span className="rb-admin-online">
                        <span className="rb-admin-online-dot" aria-hidden="true" /> online
                      </span>
                    ) : (
                      <span className="rb-admin-lastseen" title={a.lastSeenAt ? new Date(a.lastSeenAt).toLocaleString('it-IT') : ''}>
                        {lastSeenLabel(a.lastSeenAt)}
                      </span>
                    )}
                  </td>
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
                    {a.tipoAccount === 'azienda' && a.aziendaVerifica?.stato && (
                      <div className="rb-admin-piva-stato" title={aziendaVerificaTesto(a.aziendaVerifica.stato, a.aziendaVerifica.nome_registro)}>
                        P.IVA: {a.aziendaVerifica.stato}
                        {a.aziendaVerifica.nome_registro ? ` · ${a.aziendaVerifica.nome_registro}` : ''}
                      </div>
                    )}
                  </td>
                  <td>
                    {isOwner && !isOwnerRow ? (
                      <select className={`rb-admin-role-select ${a.ruolo}`} value={a.ruolo} onChange={(e) => changeRole(a, e.target.value)}>
                        <option value={ROLES.USER}>{ROLE_LABELS[ROLES.USER]}</option>
                        <option value={ROLES.MODERATOR}>{ROLE_LABELS[ROLES.MODERATOR]}</option>
                      </select>
                    ) : (
                      <span className={`rb-admin-role-badge ${a.ruolo}`}>{ROLE_LABELS[a.ruolo] ?? a.ruolo}</span>
                    )}
                  </td>
                  <td>
                    {a.bannato ? (
                      <span className="rb-admin-role-badge rb-admin-banned-badge">
                        Bloccato{a.banFinoAl ? ` fino al ${new Date(a.banFinoAl).toLocaleDateString('it-IT')}` : ''}
                      </span>
                    ) : (
                      <span className="rb-admin-empty">—</span>
                    )}
                  </td>
                  <td className="rb-sticky-right">
                    <div className="rb-admin-row-actions">
                      <button type="button" className="rb-admin-reset-btn" onClick={() => doResetPassword(a)} disabled={!canManageRow}>
                        Reset password
                      </button>
                      <BanControl account={a} enabled={moderate} onBan={ban} onUnban={unban} />
                      <button type="button" className="rb-admin-reset-btn danger" onClick={() => setDeleting(a)} disabled={!moderate}>
                        Elimina utente
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows !== null && rows.length === 0 && (
              <tr>
                <td colSpan={13} className="rb-admin-empty">
                  {hasFilters ? 'Nessun utente corrisponde alla ricerca.' : 'Nessuno si è ancora registrato.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rb-admin-pager">
        <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
          ‹ Precedenti
        </button>
        <span>
          Pagina {page + 1} di {pages}
        </span>
        <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>
          Successivi ›
        </button>
      </div>

      {resetSentTo && (
        <ModalOverlay onClose={() => setResetSentTo(null)} className="rb-admin-reset-overlay">
          <div className="rb-admin-reset-card" onClick={(e) => e.stopPropagation()}>
            <h3>Mail di reset inviata</h3>
            <p>
              A {resetSentTo.nickname} ({resetSentTo.email}) è arrivata una mail con il link per scegliere una nuova password —
              nessuna password passa da qui, in chiaro o no.
            </p>
            <button type="button" onClick={() => setResetSentTo(null)}>
              Ho preso nota, chiudi
            </button>
          </div>
        </ModalOverlay>
      )}

      {deleting && (
        <DeleteUserDialog
          account={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(account, email) => {
            setDeleting(null);
            setNotice({ tone: 'ok', text: `${account.nickname || account.username} eliminato · ${mailLabel(email)}` });
            onAuditChanged?.();
            load();
          }}
        />
      )}
    </>
  );
}
