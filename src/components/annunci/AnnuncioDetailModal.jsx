import { useEffect, useState } from 'react';
import { fieldsForCategory } from '../../data/annunciSchema';
import { getSellerInfo, toggleFavorite } from '../../data/annunci';
import { linkToListing, shareLink } from '../../data/deepLinks';
import ModalOverlay from '../ModalOverlay';
import ReportModal from '../shared/ReportModal';

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

// Scheda completa di un annuncio: galleria, tabella caratteristiche
// (generata dallo stesso schema di filtri/form), descrizione, posizione
// APPROSSIMATA (mai l'indirizzo esatto — solo un link alla mappa generale,
// niente marker preciso qui dentro), venditore (solo nickname, mai nome
// reale né contatti diretti), Contatta (apre i DM interni)/Salva/
// Condividi/Segnala.
export default function AnnuncioDetailModal({ listing, user, onOpenAuth, onOpenChat, onClose, onFavoriteChanged }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [seller, setSeller] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    getSellerInfo(listing.ownerId).then(setSeller);
  }, [listing.ownerId]);

  const fields = fieldsForCategory(listing.categoria, listing.tipo);

  const toggleFav = async () => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    const { error } = await toggleFavorite(listing.id, listing.isFavorite);
    if (!error) onFavoriteChanged?.(listing.id, !listing.isFavorite);
  };

  const share = async () => {
    // Link #/annunci/<id> (data/deepLinks.js): foglio di condivisione sul
    // telefono, altrimenti copiato negli appunti.
    const res = await shareLink({ title: listing.titolo, text: `${listing.titolo} · ${formatPrice(listing)}`, url: linkToListing(listing.id) });
    if (res === 'copied') {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  const contact = () => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    onOpenChat?.(listing.ownerId);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-annuncio-detail-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>

        <div className="rb-annuncio-detail-gallery">
          {listing.foto.length > 0 ? (
            <>
              <img src={listing.foto[photoIndex]} alt="" />
              {listing.foto.length > 1 && (
                <div className="rb-annuncio-detail-gallery-dots">
                  {listing.foto.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      className={i === photoIndex ? 'active' : ''}
                      onClick={() => setPhotoIndex(i)}
                      aria-label={`Foto ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="rb-annuncio-detail-gallery-empty">📷</div>
          )}
        </div>

        <div className="rb-annuncio-detail-body">
          <strong className="rb-annuncio-detail-price">{formatPrice(listing)}</strong>
          <h3>{listing.titolo}</h3>
          <div className="rb-annuncio-detail-meta">
            <span>{listing.citta}</span>
            {listing.trattabile && <span className="rb-annuncio-card-trattabile">Trattabile</span>}
            <span>Pubblicato il {new Date(listing.createdAt).toLocaleDateString('it-IT')}</span>
          </div>

          {fields.length > 0 && (
            <table className="rb-annuncio-detail-table">
              <tbody>
                {fields
                  .filter((f) => listing.dettagli[f.key] != null && listing.dettagli[f.key] !== '')
                  .map((f) => {
                    const raw = listing.dettagli[f.key];
                    const opt = f.options?.find((o) => o.value === raw);
                    const display = typeof raw === 'boolean' ? (raw ? 'Sì' : 'No') : (opt?.label ?? raw);
                    return (
                      <tr key={f.key}>
                        <td>{f.label}</td>
                        <td>
                          {display}
                          {f.unit && !opt && typeof raw !== 'boolean' ? ` ${f.unit}` : ''}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}

          {listing.descrizione && <p className="rb-annuncio-detail-desc">{listing.descrizione}</p>}

          <div className="rb-annuncio-detail-seller">
            {seller?.avatar && <img src={seller.avatar} alt="" />}
            <div>
              <strong>{seller?.nickname ?? '…'}</strong>
              <span>{seller ? `${seller.nAnnunci} annunci pubblicati` : ''}</span>
            </div>
          </div>

          <div className="rb-annuncio-detail-actions">
            <button type="button" className="rb-btn-primary" onClick={contact}>Contatta</button>
            <button type="button" className={`rb-reset-filters-btn ${listing.isFavorite ? 'active' : ''}`} onClick={toggleFav}>
              {listing.isFavorite ? '❤️ Salvato' : '🤍 Salva'}
            </button>
            <button type="button" className="rb-reset-filters-btn" onClick={share}>
              {shareCopied ? 'Link copiato!' : 'Condividi'}
            </button>
            <button type="button" className="rb-reset-filters-btn" onClick={() => setReportOpen(true)}>
              Segnala
            </button>
          </div>
        </div>
      </div>

      {reportOpen && (
        <ReportModal
          targetType="annuncio"
          targetId={listing.id}
          targetLabel={`l'annuncio "${listing.titolo}"`}
          onClose={() => setReportOpen(false)}
        />
      )}
    </ModalOverlay>
  );
}
