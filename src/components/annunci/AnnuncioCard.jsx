import { fieldsForCategory } from '../../data/annunciSchema';
import { toggleFavorite } from '../../data/annunci';

function formatPrice(listing) {
  if (listing.prezzo == null) return 'Prezzo su richiesta';
  const fmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: listing.valuta, maximumFractionDigits: 0 }).format(
    listing.prezzo
  );
  if (listing.tipo === 'affitto') {
    const perLabel = { giorno: 'giorno', settimana: 'settimana', mese: 'mese', anno: 'anno' }[listing.periodoAffitto] ?? 'mese';
    return `${fmt} / ${perLabel}`;
  }
  return fmt;
}

// Le "icone di dati chiave" mostrate in card: i primi 3-4 campi non
// booleani della categoria che l'annuncio ha valorizzati (stesso schema
// del form/filtri, vedi data/annunciSchema.js) — auto: anno/km/
// alimentazione/cambio, case: m²/locali/bagni/piano, esattamente come
// richiesto, senza doverli elencare una seconda volta qui a mano.
function keyFacts(listing) {
  const fields = fieldsForCategory(listing.categoria, listing.tipo).filter((f) => f.type !== 'boolean');
  return fields
    .filter((f) => listing.dettagli[f.key] != null && listing.dettagli[f.key] !== '')
    .slice(0, 4)
    .map((f) => {
      const raw = listing.dettagli[f.key];
      const opt = f.options?.find((o) => o.value === raw);
      return { key: f.key, text: `${opt?.label ?? raw}${f.unit && !opt ? ` ${f.unit}` : ''}` };
    });
}

export default function AnnuncioCard({ listing, user, onOpenAuth, onOpen, onFavoriteChanged, view = 'list' }) {
  const toggleFav = async (e) => {
    e.stopPropagation();
    if (!user) {
      onOpenAuth?.();
      return;
    }
    const { error } = await toggleFavorite(listing.id, listing.isFavorite);
    if (!error) onFavoriteChanged?.(listing.id, !listing.isFavorite);
  };

  return (
    <button type="button" className={`rb-annuncio-card ${view}`} onClick={() => onOpen(listing)}>
      <div className="rb-annuncio-card-media">
        {listing.foto[0] ? <img src={listing.foto[0]} alt="" /> : <div className="rb-annuncio-card-media-empty">📷</div>}
        <span className="rb-annuncio-card-tipo">{listing.tipo === 'affitto' ? 'Affitto' : 'Vendita'}</span>
        <button type="button" className={`rb-annuncio-fav-btn ${listing.isFavorite ? 'active' : ''}`} onClick={toggleFav}>
          {listing.isFavorite ? '❤️' : '🤍'}
        </button>
      </div>
      <div className="rb-annuncio-card-info">
        <strong className="rb-annuncio-card-price">{formatPrice(listing)}</strong>
        <span className="rb-annuncio-card-title">{listing.titolo}</span>
        <div className="rb-annuncio-card-facts">
          {keyFacts(listing).map((f) => (
            <span key={f.key}>{f.text}</span>
          ))}
        </div>
        <div className="rb-annuncio-card-meta">
          <span>{listing.citta || '—'}</span>
          {listing.trattabile && <span className="rb-annuncio-card-trattabile">Trattabile</span>}
        </div>
      </div>
    </button>
  );
}
