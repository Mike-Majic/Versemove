import { useEffect, useState } from 'react';
import ModalOverlay from '../ModalOverlay';
import AvatarImg from '../shared/AvatarImg';
import ZoomableMedia from '../shared/ZoomableMedia';
import { fetchReportTarget } from '../../data/reportTarget';
import { REPORT_TARGET_LABELS, REPORT_STATO_LABELS } from '../../data/reports';
import { openProfileFromMention } from '../../data/mentions';
import { AUDIT_LABELS } from '../../data/adminAuditLog';
import { WORLDS } from '../../data/worlds';
import './AdminDetailDialogs.css';

// Finestre di dettaglio del Backend, sopra al pannello (stesso schema
// ModalOverlay del dialogo di ban, più larghe):
// - ReportDetailDialog: una segnalazione con il contenuto segnalato;
// - AuditDetailDialog: una riga del Log azioni con il campo `dettagli`.

const ROLE_LABELS = { owner: 'Owner', moderatore: 'Moderatore', utente: 'Utente' };

const when = (iso) => (iso ? new Date(iso).toLocaleString('it-IT') : '—');
const worldLabel = (id) => WORLDS.find((w) => w.id === id)?.label ?? id;

function Row({ label, children }) {
  return (
    <div className="rb-admin-detail-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function AuthorLine({ author, date, mondo, onOpenProfile }) {
  return (
    <p className="rb-admin-detail-author">
      {author ? (
        <button type="button" className="rb-admin-detail-link" onClick={() => onOpenProfile(author.id)}>
          <AvatarImg src={author.avatar} name={author.name} seed={author.id} alt="" />
          {author.name}
        </button>
      ) : (
        <span>Autore non disponibile</span>
      )}
      {date && <span> · {when(date)}</span>}
      {mondo && <span> · Mondo {worldLabel(mondo)}</span>}
    </p>
  );
}

function TargetContent({ target, onOpenProfile }) {
  if (target === undefined) return <p className="rb-admin-detail-muted">Carico il contenuto…</p>;
  if (target?.noTarget) return <p className="rb-admin-detail-muted">Segnalazione generale sull'app: nessun contenuto collegato.</p>;
  if (!target) return <p className="rb-admin-detail-muted">Contenuto non più disponibile.</p>;
  return (
    <div className="rb-admin-detail-target">
      <h4>{target.title}</h4>
      {target.profile ? (
        <div className="rb-admin-detail-profile">
          <AvatarImg src={target.profile.avatar} name={target.profile.nickname} seed={target.profile.id} alt="" />
          <div>
            <strong>{target.profile.nickname}</strong>
            {target.profile.bio ? <p>{target.profile.bio}</p> : <p className="rb-admin-detail-muted">Nessuna bio.</p>}
          </div>
          <button type="button" className="rb-reset-filters-btn" onClick={() => onOpenProfile(target.profile.id)}>
            Apri profilo
          </button>
        </div>
      ) : (
        <AuthorLine author={target.author} date={target.date} mondo={target.mondo} onOpenProfile={onOpenProfile} />
      )}
      {target.deletedAt && <p className="rb-admin-detail-warn">Eliminato il {when(target.deletedAt)}.</p>}
      {target.text && <p className="rb-admin-detail-text">{target.text}</p>}
      {target.media.length > 0 && (
        <div className="rb-admin-detail-media">
          {target.media.map((m) => (
            <ZoomableMedia key={m.url} src={m.url} kind={m.kind} alt={target.title} caption={target.title} />
          ))}
        </div>
      )}
      {target.rows.length > 0 && (
        <dl className="rb-admin-detail-list">
          {target.rows.map(([label, value]) => (
            <Row key={label} label={label}>
              {label === 'Link' ? (
                <a href={value} target="_blank" rel="noopener noreferrer">
                  {value}
                </a>
              ) : (
                value
              )}
            </Row>
          ))}
        </dl>
      )}
      {target.parent && (
        <div className="rb-admin-detail-parent">
          <h5>{target.parent.title}</h5>
          {target.parent.author && (
            <AuthorLine author={target.parent.author} date={target.parent.date} mondo={target.parent.mondo} onOpenProfile={onOpenProfile} />
          )}
          <p className="rb-admin-detail-text">{target.parent.text}</p>
        </div>
      )}
    </div>
  );
}

export function ReportDetailDialog({ report, onClose, onChangeStatus }) {
  // undefined = in caricamento, null = non disponibile.
  const [target, setTarget] = useState(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchReportTarget(report.targetType, report.targetId).then((t) => {
      if (!cancelled) setTarget(t);
    });
    return () => {
      cancelled = true;
    };
  }, [report.targetType, report.targetId]);

  // Il profilo si apre sopra al Backend: questa finestra (più in alto di
  // tutti i pannelli) si chiude prima, altrimenti lo coprirebbe.
  const openProfile = (userId) => {
    onClose();
    openProfileFromMention(userId);
  };

  const change = async (stato) => {
    setBusy(true);
    await onChangeStatus(report.id, stato);
    setBusy(false);
  };

  return (
    <ModalOverlay onClose={onClose} className="rb-admin-reset-overlay">
      <div
        className="rb-admin-reset-card rb-admin-delete-card rb-admin-detail-card"
        role="dialog"
        aria-label="Dettaglio segnalazione"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">
          ✕
        </button>
        <h3>Segnalazione: {REPORT_TARGET_LABELS[report.targetType] ?? report.targetType}</h3>
        <dl className="rb-admin-detail-list">
          <Row label="Motivo">{report.motivo || '—'}</Row>
          {report.dettagli && <Row label="Dettagli">{report.dettagli}</Row>}
          <Row label="Segnalato da">{report.reporterNickname ?? 'Account eliminato'}</Row>
          <Row label="Stato">
            <span className={`rb-admin-role-badge rb-report-stato-${report.stato}`}>{REPORT_STATO_LABELS[report.stato] ?? report.stato}</span>
          </Row>
          {report.stato !== 'aperto' && <Row label="Gestita da">{report.gestitoDaNickname ?? 'Account eliminato'}</Row>}
          <Row label="Data">{when(report.data)}</Row>
          {report.risoltoAt && <Row label="Chiusa il">{when(report.risoltoAt)}</Row>}
        </dl>

        <h4 className="rb-admin-detail-section">Contenuto segnalato</h4>
        <TargetContent target={target} onOpenProfile={openProfile} />

        <div className="rb-admin-delete-actions">
          {report.stato === 'aperto' && (
            <button type="button" className="rb-reset-filters-btn" onClick={() => change('in_lavorazione')} disabled={busy}>
              Prendi in carico
            </button>
          )}
          {report.stato !== 'chiuso' && (
            <button type="button" className="rb-reset-filters-btn" onClick={() => change('chiuso')} disabled={busy}>
              Chiudi segnalazione
            </button>
          )}
          <button type="button" className="rb-reset-filters-btn" onClick={onClose}>
            Fine
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// Campo `dettagli` del log in forma leggibile.
function detailRows(dettagli) {
  if (!dettagli || typeof dettagli !== 'object') return [];
  const rows = [];
  for (const [key, value] of Object.entries(dettagli)) {
    if (key === 'reportId') continue; // c'è il pulsante "Apri segnalazione"
    switch (key) {
      case 'motivo':
        rows.push(['Motivo', value || '—']);
        break;
      case 'finoAl':
        rows.push(['Fino al', value ? when(value) : 'Senza scadenza']);
        break;
      case 'nuovoRuolo':
        rows.push(['Nuovo ruolo', ROLE_LABELS[value] ?? value]);
        break;
      case 'verificato':
        rows.push(['Verificato', value ? 'Sì' : 'No']);
        break;
      case 'nuovoStato':
        rows.push(['Nuovo stato', REPORT_STATO_LABELS[value] ?? value]);
        break;
      case 'postId':
        rows.push(['Post', value]);
        break;
      case 'commentId':
        rows.push(['Commento', value]);
        break;
      case 'da':
        rows.push(['Da', value === 'info_ban' ? 'Chat Info ban' : value]);
        break;
      default:
        rows.push([key, typeof value === 'object' ? JSON.stringify(value) : String(value)]);
    }
  }
  return rows;
}

export function AuditDetailDialog({ entry, onClose, onOpenReport }) {
  const rows = detailRows(entry.dettagli);
  const reportId = entry.dettagli?.reportId ?? null;
  return (
    <ModalOverlay onClose={onClose} className="rb-admin-reset-overlay">
      <div
        className="rb-admin-reset-card rb-admin-delete-card rb-admin-detail-card"
        role="dialog"
        aria-label="Dettaglio azione"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">
          ✕
        </button>
        <h3>{AUDIT_LABELS[entry.azione] ?? entry.azione}</h3>
        <dl className="rb-admin-detail-list">
          <Row label="Quando">{when(entry.data)}</Row>
          <Row label="Chi">{entry.staffNickname ?? 'Account eliminato'}</Row>
          <Row label="Azione">{AUDIT_LABELS[entry.azione] ?? entry.azione}</Row>
          <Row label="Su">{entry.targetUserId ? (entry.targetNickname ?? 'Account eliminato') : '—'}</Row>
          {rows.map(([label, value]) => (
            <Row key={label} label={label}>
              {value}
            </Row>
          ))}
        </dl>
        {rows.length === 0 && <p className="rb-admin-detail-muted">Nessun dettaglio in più per questa azione.</p>}
        <div className="rb-admin-delete-actions">
          {reportId && (
            <button type="button" className="rb-reset-filters-btn" onClick={() => onOpenReport(reportId)}>
              Apri segnalazione
            </button>
          )}
          <button type="button" className="rb-reset-filters-btn" onClick={onClose}>
            Fine
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
