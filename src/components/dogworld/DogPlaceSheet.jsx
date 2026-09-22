import { useEffect, useState } from 'react';
import { getPlace, getPlaceStats, listReviews, createReview, uploadDogPhoto } from '../../data/dogWorld';
import { placeTypeMeta, CONDIZIONE_META, TAGLIA_LABEL } from './dogPlaceMeta';
import Skeleton from '../Skeleton';
import EmptyState from '../EmptyState';
import ReportModal from '../shared/ReportModal';
import './DogPlaceSheet.css';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Stars({ value }) {
  return (
    <span className="rb-dogsheet-stars" aria-label={`${value} su 5`}>
      {'★'.repeat(value)}
      {'☆'.repeat(5 - value)}
    </span>
  );
}

// Form per lasciare una recensione: voto (1-5 stelle), condizione trovata,
// eventuale foto, testo libero. Sempre con autore+data una volta
// pubblicata (vedi listReviews/mapReview in data/dogWorld.js) — sono
// opinioni personali, mai anonime.
function ReviewForm({ placeId, onDone }) {
  const [voto, setVoto] = useState(0);
  const [condizione, setCondizione] = useState('ok');
  const [testo, setTesto] = useState('');
  const [fotoFiles, setFotoFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onPickFiles = (e) => {
    const files = Array.from(e.target.files ?? []).slice(0, 10 - fotoFiles.length);
    setFotoFiles((prev) => [...prev, ...files]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!voto) {
      setError('Scegli almeno una stella.');
      return;
    }
    setBusy(true);
    setError('');
    const fotoPaths = [];
    for (const file of fotoFiles) {
      const { path, error: uploadErr } = await uploadDogPhoto(file);
      if (uploadErr) {
        setError(uploadErr);
        setBusy(false);
        return;
      }
      fotoPaths.push(path);
    }
    const { error: reviewErr } = await createReview({ placeId, voto, condizione, testo, foto: fotoPaths });
    setBusy(false);
    if (reviewErr) {
      setError(reviewErr);
      return;
    }
    onDone();
  };

  return (
    <form className="rb-dogsheet-review-form" onSubmit={handleSubmit}>
      <div className="rb-dogsheet-star-picker">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`rb-dogsheet-star-btn ${n <= voto ? 'active' : ''}`}
            onClick={() => setVoto(n)}
            aria-label={`${n} stelle`}
          >
            ★
          </button>
        ))}
      </div>

      <div className="rb-dogsheet-condizione-picker">
        {Object.entries(CONDIZIONE_META).map(([key, meta]) => (
          <button
            key={key}
            type="button"
            className={`rb-dogsheet-condizione-chip ${condizione === key ? 'active' : ''}`}
            style={condizione === key ? { background: meta.color, borderColor: meta.color } : undefined}
            onClick={() => setCondizione(key)}
          >
            {meta.label}
          </button>
        ))}
      </div>

      <textarea
        className="rb-dogsheet-textarea"
        placeholder="Com'era? (facoltativo)"
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        rows={3}
        maxLength={2000}
      />

      <label className="rb-dogsheet-photo-add">
        📷 Aggiungi foto ({fotoFiles.length}/10)
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onPickFiles} />
      </label>

      {error && <p className="rb-privacy-error">{error}</p>}

      <button type="submit" className="rb-btn-primary" disabled={busy}>
        {busy ? 'Pubblico…' : 'Pubblica recensione'}
      </button>
    </form>
  );
}

// Foglio in basso (bottom sheet, pensato per il pollice: si apre sempre
// dal fondo dello schermo, mai un modale centrato) con il dettaglio di un
// luogo e le sue recensioni. `place` arriva già con lat/lng/tipo/nome dal
// marker cliccato sulla mappa (vedi DogWorldMap) — qui si carica solo il
// resto (descrizione, badge, foto, statistiche, recensioni).
export default function DogPlaceSheet({ place, user, onOpenAuth, onClose }) {
  const [detail, setDetail] = useState(null);
  const [stats, setStats] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);

  const loadAll = async () => {
    const [d, s, r] = await Promise.all([getPlace(place.id), getPlaceStats(place.id), listReviews(place.id)]);
    setDetail(d);
    setStats(s);
    setReviews(r);
  };

  useEffect(() => {
    setDetail(null);
    setStats(null);
    setReviews(null);
    setShowReviewForm(false);
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id]);

  const meta = placeTypeMeta(place.tipo);
  const loading = !detail || !stats || !reviews;

  return (
    <div className="rb-dogsheet-overlay" onClick={onClose}>
      <div className="rb-dogsheet" onClick={(e) => e.stopPropagation()}>
        <div className="rb-dogsheet-handle" />
        <button type="button" className="rb-close-btn rb-dogsheet-close" onClick={onClose} aria-label="Chiudi">
          ✕
        </button>

        <div className="rb-dogsheet-scroll">
          <div className="rb-dogsheet-header">
            <span className="rb-dogsheet-type-badge" style={{ background: meta.color }}>
              {meta.emoji} {meta.label}
            </span>
            <h3>{place.nome}</h3>
            {stats && stats.nRecensioni > 0 && (
              <div className="rb-dogsheet-rating">
                <Stars value={Math.round(stats.votoMedio)} />
                <span>
                  {stats.votoMedio.toFixed(1)} · {stats.nRecensioni} recension{stats.nRecensioni === 1 ? 'e' : 'i'}
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <Skeleton lines={4} />
          ) : (
            <>
              {detail.descrizione && <p className="rb-dogsheet-desc">{detail.descrizione}</p>}

              <div className="rb-dogsheet-badges">
                {detail.taglia && <span className="rb-dogsheet-badge">{TAGLIA_LABEL[detail.taglia] ?? detail.taglia}</span>}
                {detail.recintata && <span className="rb-dogsheet-badge">🔒 Recintata</span>}
                {detail.acqua && <span className="rb-dogsheet-badge">💧 Acqua</span>}
                {detail.ombra && <span className="rb-dogsheet-badge">🌳 Ombra</span>}
                {detail.illuminata && <span className="rb-dogsheet-badge">💡 Illuminata</span>}
              </div>

              {(detail.comune || detail.provincia) && (
                <p className="rb-dogsheet-location">
                  📍 {[detail.comune, detail.provincia, detail.regione].filter(Boolean).join(', ')}
                </p>
              )}

              {detail.foto.length > 0 && (
                <div className="rb-dogsheet-photos">
                  {detail.foto.map((url) => (
                    <img key={url} src={url} alt={detail.nome} loading="lazy" />
                  ))}
                </div>
              )}

              <div className="rb-dogsheet-actions-row">
                {user ? (
                  <button type="button" className="rb-reset-filters-btn" onClick={() => setShowReviewForm((v) => !v)}>
                    {showReviewForm ? 'Annulla' : '✍️ Scrivi una recensione'}
                  </button>
                ) : (
                  <button type="button" className="rb-reset-filters-btn" onClick={onOpenAuth}>
                    Accedi per recensire
                  </button>
                )}
                <button
                  type="button"
                  className="rb-dogsheet-report-link"
                  onClick={() => setReportTarget({ type: 'dog_luogo', id: place.id, label: `"${place.nome}"` })}
                >
                  Segnala
                </button>
              </div>

              {showReviewForm && (
                <ReviewForm
                  placeId={place.id}
                  onDone={() => {
                    setShowReviewForm(false);
                    loadAll();
                  }}
                />
              )}

              <h4 className="rb-dogsheet-reviews-title">Recensioni</h4>
              {reviews.length === 0 ? (
                <EmptyState icon="🐾" title="Nessuna recensione ancora" subtitle="Sii il primo a raccontare com'è." />
              ) : (
                <div className="rb-dogsheet-reviews">
                  {reviews.map((r) => (
                    <div key={r.id} className="rb-dogsheet-review">
                      <div className="rb-dogsheet-review-head">
                        {r.authorAvatar ? (
                          <img className="rb-dogsheet-review-avatar" src={r.authorAvatar} alt={r.authorName} />
                        ) : (
                          <span className="rb-dogsheet-review-avatar rb-dogsheet-review-avatar-placeholder">🐾</span>
                        )}
                        <div>
                          <strong>{r.authorName}</strong>
                          <div className="rb-dogsheet-review-meta">
                            <Stars value={r.voto} /> · {formatDate(r.createdAt)}
                          </div>
                        </div>
                      </div>
                      <span
                        className="rb-dogsheet-condizione-tag"
                        style={{ color: CONDIZIONE_META[r.condizione]?.color }}
                      >
                        {CONDIZIONE_META[r.condizione]?.label ?? r.condizione}
                      </span>
                      {r.testo && <p>{r.testo}</p>}
                      {r.foto.length > 0 && (
                        <div className="rb-dogsheet-photos rb-dogsheet-photos-sm">
                          {r.foto.map((url) => (
                            <img key={url} src={url} alt="" loading="lazy" />
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        className="rb-dogsheet-report-link"
                        onClick={() => setReportTarget({ type: 'dog_recensione', id: r.id, label: 'questa recensione' })}
                      >
                        Segnala
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {reportTarget && (
        <ReportModal
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          targetLabel={reportTarget.label}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );
}
