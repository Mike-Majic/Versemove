import { POST_TAGS } from '../../../data/gaming';
import { GAMEPASS_ACTIONS, TROPHY, formatDay, formatPrice } from './gamingPost';
import './gaming.css';

// Parte strutturata di un post di categoria del mondo Nerd (posts.extra),
// sotto il testo, ovunque il post venga mostrato:
// - build (PC): tabella compatta con il prezzo in evidenza e gli fps;
// - trofeo (PS): icona colorata per rarità e "Ti aiuto io" se chiede aiuto;
// - gamepass (Xbox): "In arrivo il…", "In uscita il…" o "Consiglio";
// - clip / discussione: solo il gioco collegato, se c'è.
const BUILD_FIELDS = [
  ['cpu', 'CPU'],
  ['gpu', 'GPU'],
  ['ram', 'RAM'],
  ['storage', 'Storage'],
  ['scheda_madre', 'Scheda madre'],
  ['alimentatore', 'Alimentatore'],
  ['case', 'Case'],
];

function GameChip({ title }) {
  if (!title) return null;
  return <span className="rb-gpost-game">🎮 {title.nome}{title.anno ? ` (${title.anno})` : ''}</span>;
}

export default function GamingPostExtra({ post, user }) {
  const extra = post.extra ?? {};
  const tag = post.tag;
  const isOwn = Boolean(user) && post.autoreId === user.id;

  if (tag === 'build') {
    const rows = BUILD_FIELDS.filter(([k]) => extra[k]);
    const fps = Array.isArray(extra.fps) ? extra.fps.filter((f) => f?.gioco || f?.fps) : [];
    return (
      <div className="rb-gpost rb-gpost--build">
        <div className="rb-gpost-head">
          <span className="rb-gpost-tag">{POST_TAGS.build.icon} Build</span>
          {extra.prezzo != null && extra.prezzo !== '' && <strong className="rb-gpost-price">{formatPrice(extra.prezzo)}</strong>}
          {extra.consiglio && <span className="rb-gpost-flag">🙋 Chiedo consiglio</span>}
        </div>
        {rows.length > 0 && (
          <table className="rb-gpost-table">
            <tbody>
              {rows.map(([k, label]) => (
                <tr key={k}>
                  <th scope="row">{label}</th>
                  <td>{extra[k]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {fps.length > 0 && (
          <ul className="rb-gpost-fps" aria-label="FPS">
            {fps.map((f, i) => (
              <li key={i}>
                <strong>{f.fps}</strong> fps · {f.gioco}{f.preset ? ` (${f.preset})` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (tag === 'trofeo') {
    const r = TROPHY[extra.rarita] ?? null;
    return (
      <div className="rb-gpost rb-gpost--trofeo">
        <span className="rb-gpost-trophy" style={{ color: r?.color ?? '#fff' }} aria-hidden="true">🏆</span>
        <div className="rb-gpost-trophy-info">
          {extra.trofeo && <strong>{extra.trofeo}</strong>}
          <span>{r ? r.label : 'Trofeo'}{post.title ? ` · ${post.title.nome}` : ''}</span>
        </div>
        {extra.aiuto && !isOwn && (
          <button
            type="button"
            className="rb-vroom-btn rb-vroom-btn--primary"
            onClick={() => window.dispatchEvent(new CustomEvent('vm:open-chat', { detail: { userId: post.autoreId } }))}
          >
            🤝 Ti aiuto io
          </button>
        )}
        {extra.aiuto && isOwn && <span className="rb-gpost-flag">🙋 Chiedo aiuto</span>}
      </div>
    );
  }

  if (tag === 'gamepass') {
    const a = GAMEPASS_ACTIONS[extra.azione] ?? GAMEPASS_ACTIONS.consiglio;
    return (
      <div className="rb-gpost rb-gpost--gamepass">
        <span className={`rb-gpost-tag rb-gpost-tag--${extra.azione ?? 'consiglio'}`}>
          {a.icon} {a.label}{extra.azione !== 'consiglio' && extra.data ? ` il ${formatDay(extra.data)}` : ''}
        </span>
        <GameChip title={post.title} />
      </div>
    );
  }

  return post.title ? (
    <div className="rb-gpost">
      <GameChip title={post.title} />
    </div>
  ) : null;
}
