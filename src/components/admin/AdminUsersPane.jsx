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

// Blocco inline: motivo facoltativo, scadenza facoltativa (vuoto = senza
// fine). Stesso schema di prima, con le parole Blocca/Sblocca.
function BanControl({ account, enabled, onBan, onUnban }) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [finoAl, setFinoAl] = useState('');
  const [saving, setSaving] = useState(false);
  useReportUnsaved(open && (motivo.trim() !== '' || finoAl !== ''));

  if (account.bannato) {
    return (
      <button type="button" className="rb-admin-reset-btn" onClick={() => onUnban(account)} disabled={!enabled}>
        Sblocca
      </button>
    );
  }
  if (!open) {
    return (
      <button type="button" className="rb-admin-reset-btn" onClick={() => setOpen(true)} disabled={!enabled}>
        Blocca
      </button>
    );
  }
  const submit = async () => {
    setSaving(true);
    const ok = await onBan(account, motivo, finoAl ? fromDatetimeLocal(finoAl) : null);
    setSaving(false);
    if (ok) {
      setOpen(false);
      setMotivo('');
      setFinoAl('');
    }
  };
  return (
    <div className="rb-admin-ban-form">
      <textarea placeholder="Motivo (facoltativo)" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
      <label>
        Fino al (vuoto = senza fine)
        <input type="datetime-local" value={finoAl} onChange={(e) => setFinoAl(e.target.value)} min={toDatetimeLocal(new Date().toISOString())} />
      </label>
      <div className="rb-admin-ban-form-actions">
        <button type="button" className="rb-reset-filters-btn" onClick={() => setOpen(false)} disabled={saving}>
          Annulla
        </button>
        <button type="button" className="rb-btn-primary" onClick={submit} disabled={saving}>
          {saving ? 'Blocco…' : 'Blocca'}
        </button>
      </div>
    </div>
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
  const ban = async (account, motivo, finoAl) => {
    const { error } = await banAccount(account.id, motivo, finoAl);
    if (error) {
      setNotice({ tone: 'error', text: error });
      return false;
    }
    const name = account.nickname || account.username;
    const mail = await notifyBan(account.id, motivo?.trim() || '');
    setNotice(
      mail.error
        ? { tone: 'error', text: `${name} bloccato, ma l'avviso non è partito: ${mail.error}` }
        : { tone: 'ok', text: `${name} bloccato · ${mailLabel(mail.email)}` }
    );
    afterChange('ban_account', account.id, { motivo: motivo || null, finoAl });
    return true;
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
                      <select value={a.ruolo} onChange={(e) => changeRole(a, e.target.value)}>
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
