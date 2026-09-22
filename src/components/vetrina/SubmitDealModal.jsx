import { useState } from 'react';
import { submitDeal, findRecentDuplicate, fetchLinkPreview } from '../../data/vetrinaDeals';
import { VETRINA_CATEGORIES } from '../../data/vetrinaCategories';
import ModalOverlay from '../ModalOverlay';
import CustomSelect from '../shared/CustomSelect';
import './vetrinaOfferte.css';

const OFFERTE_OPTIONS = VETRINA_CATEGORIES.filter((c) => c.id.startsWith('offerte-')).map((c) => ({
  value: c.id,
  label: `${c.icon} ${c.label}`,
}));

// Form "+ Segnala un'offerta": si incolla il link, si tenta una
// precompilazione (titolo/immagine dai meta tag Open Graph, vedi
// fetchLinkPreview — passa da una funzione server-side, non sempre
// disponibile: se non risponde il form resta compilabile a mano, non è mai
// bloccante), poi prezzo/prezzo originale/scadenza/categoria a mano.
// Prima di salvare controlla se lo stesso link è già stato pubblicato negli
// ultimi 7 giorni e chiede conferma ("È questa?") invece di duplicare.
export default function SubmitDealModal({ categoria: categoriaIniziale, onClose, onPublished }) {
  const [url, setUrl] = useState('');
  const [categoria, setCategoria] = useState(categoriaIniziale);
  const [titolo, setTitolo] = useState('');
  const [immagine, setImmagine] = useState('');
  const [negozio, setNegozio] = useState('');
  const [prezzo, setPrezzo] = useState('');
  const [prezzoOriginale, setPrezzoOriginale] = useState('');
  const [online, setOnline] = useState(true);
  const [citta, setCitta] = useState('');
  const [scadeIl, setScadeIl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [duplicate, setDuplicate] = useState(null); // offerta trovata, in attesa di conferma
  const [stato, setStato] = useState('form'); // form | invio | pubblicata
  const [errore, setErrore] = useState('');

  const handleUrlBlur = async () => {
    if (!url.trim() || titolo) return;
    setPreviewLoading(true);
    const preview = await fetchLinkPreview(url.trim());
    setPreviewLoading(false);
    if (preview?.titolo) setTitolo(preview.titolo);
    if (preview?.immagine) setImmagine(preview.immagine);
  };

  const doSubmit = async () => {
    setStato('invio');
    setErrore('');
    const { error } = await submitDeal({
      categoria,
      negozio,
      titolo,
      url: url.trim(),
      immagine: immagine || null,
      prezzo: prezzo ? Number(prezzo) : null,
      prezzoOriginale: prezzoOriginale ? Number(prezzoOriginale) : null,
      online,
      citta,
      scadeIl: scadeIl || null,
    });
    if (error) {
      setErrore(error);
      setStato('form');
      return;
    }
    setStato('pubblicata');
    onPublished?.();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim() || !titolo.trim()) {
      setErrore('Servono almeno il link e il titolo.');
      return;
    }
    setErrore('');
    const found = await findRecentDuplicate(url.trim());
    if (found) {
      setDuplicate(found);
      return;
    }
    await doSubmit();
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-deal-submit-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>

        {stato === 'pubblicata' ? (
          <>
            <h3>Offerta pubblicata</h3>
            <p className="rb-deal-submit-hint">Grazie! Ora è visibile nel feed, con il badge "Da un utente".</p>
            <button type="button" className="rb-btn-primary" onClick={onClose}>Chiudi</button>
          </>
        ) : duplicate ? (
          <>
            <h3>È questa?</h3>
            <p className="rb-deal-submit-hint">Lo stesso link è già stato pubblicato negli ultimi 7 giorni.</p>
            <div className="rb-deal-duplicate-preview">
              {duplicate.immagine && <img src={duplicate.immagine} alt="" />}
              <div>
                <strong>{duplicate.titolo}</strong>
                {duplicate.negozio && <span>{duplicate.negozio}</span>}
              </div>
            </div>
            <div className="rb-deal-duplicate-actions">
              <button type="button" className="rb-reset-filters-btn" onClick={() => setDuplicate(null)}>
                Annulla
              </button>
              <button type="button" className="rb-btn-primary" onClick={doSubmit} disabled={stato === 'invio'}>
                Pubblica comunque
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3>Segnala un'offerta</h3>

            <label className="rb-deal-field">
              <span>Link</span>
              <input type="url" required placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={handleUrlBlur} />
            </label>
            {previewLoading && <p className="rb-deal-submit-hint">Cerco titolo e immagine dal link…</p>}

            <label className="rb-deal-field">
              <span>Titolo</span>
              <input type="text" required value={titolo} onChange={(e) => setTitolo(e.target.value)} />
            </label>

            <label className="rb-deal-field">
              <span>Negozio</span>
              <input type="text" value={negozio} onChange={(e) => setNegozio(e.target.value)} />
            </label>

            <label className="rb-deal-field">
              <span>Categoria</span>
              <CustomSelect value={categoria} options={OFFERTE_OPTIONS} onChange={setCategoria} ariaLabel="Categoria" />
            </label>

            <div className="rb-deal-field-row">
              <label className="rb-deal-field">
                <span>Prezzo scontato</span>
                <input type="number" min="0" step="0.01" value={prezzo} onChange={(e) => setPrezzo(e.target.value)} />
              </label>
              <label className="rb-deal-field">
                <span>Prezzo originale</span>
                <input type="number" min="0" step="0.01" value={prezzoOriginale} onChange={(e) => setPrezzoOriginale(e.target.value)} />
              </label>
            </div>

            <label className="rb-deal-field">
              <span>Scade il</span>
              <input type="date" value={scadeIl} onChange={(e) => setScadeIl(e.target.value)} />
            </label>

            <div className="rb-deal-online-toggle">
              <label>
                <input type="radio" checked={online} onChange={() => setOnline(true)} /> Online
              </label>
              <label>
                <input type="radio" checked={!online} onChange={() => setOnline(false)} /> In negozio
              </label>
            </div>
            {!online && (
              <label className="rb-deal-field">
                <span>Città (o "tutti i punti vendita")</span>
                <input type="text" value={citta} onChange={(e) => setCitta(e.target.value)} />
              </label>
            )}

            {errore && <p className="rb-privacy-error">{errore}</p>}

            <button type="submit" className="rb-btn-primary" disabled={stato === 'invio'}>
              {stato === 'invio' ? 'Pubblico…' : 'Pubblica offerta'}
            </button>
          </form>
        )}
      </div>
    </ModalOverlay>
  );
}
