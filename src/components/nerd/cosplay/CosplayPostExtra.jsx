import { COSPLAY_POST_TAGS, FONTE_SERIE } from '../../../data/cosplay';
import { formatEuro } from './cosplayPost';
import './cosplay.css';

// Parte strutturata di un post Cosplay (posts.extra), sotto il testo,
// ovunque il post compaia:
// - galleria: personaggio · serie (fonte), fotografo, evento;
// - wip: personaggio · serie, materiali come chip, costo/ore e la barra
//   di avanzamento.
export default function CosplayPostExtra({ post }) {
  const extra = post.extra ?? {};
  if (post.tag === 'galleria') {
    const f = FONTE_SERIE[extra.fonte_serie];
    return (
      <div className="rb-gpost rb-cpost rb-cpost--galleria">
        <span className="rb-gpost-tag">{COSPLAY_POST_TAGS.galleria.icon} {[extra.personaggio, extra.serie].filter(Boolean).join(' · ') || 'Cosplay'}</span>
        {f && <span className="rb-cpost-chip">{f.icon} {f.label}</span>}
        {extra.fotografo && <span className="rb-cpost-chip">📷 {extra.fotografo}</span>}
        {post.evento && <span className="rb-cpost-chip">🎪 {post.evento.titolo}</span>}
      </div>
    );
  }
  if (post.tag === 'wip') {
    const pct = Math.max(0, Math.min(100, Number(extra.avanzamento ?? 0)));
    return (
      <div className="rb-gpost rb-cpost rb-cpost--wip">
        <div className="rb-gpost-head">
          <span className="rb-gpost-tag">{COSPLAY_POST_TAGS.wip.icon} {[extra.personaggio, extra.serie].filter(Boolean).join(' · ') || 'Work in progress'}</span>
          {extra.costo_eur != null && <strong className="rb-gpost-price">{formatEuro(extra.costo_eur)}</strong>}
          {extra.ore != null && <span className="rb-cpost-chip">⏱ {extra.ore} h</span>}
        </div>
        {Array.isArray(extra.materiali) && extra.materiali.length > 0 && (
          <ul className="rb-cpost-materials" aria-label="Materiali">
            {extra.materiali.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
        <div className="rb-cpost-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avanzamento">
          <span style={{ width: `${pct}%` }} />
          <em>{pct}%</em>
        </div>
      </div>
    );
  }
  return null;
}
