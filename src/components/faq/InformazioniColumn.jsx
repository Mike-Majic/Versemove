import { useEffect, useMemo, useState } from 'react';
import { listFaqArticles, createFaqArticle, updateFaqArticle, setFaqArticleVisibility } from '../../data/faq';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';

function ArticleEditForm({ initial, onCancel, onSave }) {
  const [sezione, setSezione] = useState(initial?.sezione ?? '');
  const [titolo, setTitolo] = useState(initial?.titolo ?? '');
  const [corpo, setCorpo] = useState(initial?.corpo ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({ sezione: sezione.trim(), titolo: titolo.trim(), corpo: corpo.trim() });
    setSaving(false);
  };

  return (
    <form className="rb-faq-form rb-faq-article-form" onSubmit={submit}>
      <label className="rb-field">
        <span>Sezione</span>
        <input type="text" value={sezione} onChange={(e) => setSezione(e.target.value)} required />
      </label>
      <label className="rb-field">
        <span>Titolo</span>
        <input type="text" value={titolo} onChange={(e) => setTitolo(e.target.value)} required />
      </label>
      <label className="rb-field">
        <span>Testo</span>
        <textarea rows={5} value={corpo} onChange={(e) => setCorpo(e.target.value)} required />
      </label>
      <div className="rb-faq-article-form-actions">
        <button type="button" className="rb-reset-filters-btn" onClick={onCancel}>Annulla</button>
        <button type="submit" className="rb-btn-primary" disabled={saving}>{saving ? 'Salvo…' : 'Salva'}</button>
      </div>
    </form>
  );
}

// Guida dell'app: fisarmonica per sezione, ricerca testuale in alto, CRUD
// (Nuovo/Modifica/Nascondi) visibile solo allo staff — la RLS impone
// comunque che solo owner/moderatori possano scrivere.
export default function InformazioniColumn({ staff }) {
  const [articles, setArticles] = useState(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const refresh = () => listFaqArticles({ includeUnpublished: staff }).then(setArticles);
  useEffect(refresh, [staff]);

  const bySezione = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (articles ?? []).filter(
      (a) => !q || a.titolo.toLowerCase().includes(q) || a.corpo.toLowerCase().includes(q) || a.sezione.toLowerCase().includes(q)
    );
    const map = new Map();
    filtered.forEach((a) => {
      if (!map.has(a.sezione)) map.set(a.sezione, []);
      map.get(a.sezione).push(a);
    });
    return map;
  }, [articles, search]);

  return (
    <div className="rb-faq-column">
      <div className="rb-faq-info-header">
        <input
          type="text"
          className="rb-faq-info-search"
          placeholder="Cerca nella guida..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {staff && !creating && (
          <button type="button" className="rb-btn-primary" onClick={() => setCreating(true)}>
            + Nuovo
          </button>
        )}
      </div>

      {creating && (
        <ArticleEditForm
          onCancel={() => setCreating(false)}
          onSave={async (fields) => {
            await createFaqArticle(fields);
            setCreating(false);
            refresh();
          }}
        />
      )}

      {articles === null ? (
        <Skeleton lines={5} />
      ) : bySezione.size === 0 ? (
        <EmptyState icon="ℹ️" title="Nessun articolo trovato" />
      ) : (
        [...bySezione.entries()].map(([sezione, list]) => (
          <details key={sezione} className="rb-faq-info-section" open>
            <summary>{sezione}</summary>
            {list.map((a) =>
              editingId === a.id ? (
                <ArticleEditForm
                  key={a.id}
                  initial={a}
                  onCancel={() => setEditingId(null)}
                  onSave={async (fields) => {
                    await updateFaqArticle(a.id, fields);
                    setEditingId(null);
                    refresh();
                  }}
                />
              ) : (
                <div key={a.id} className={`rb-faq-info-article ${!a.pubblicato ? 'hidden' : ''}`}>
                  <strong>{a.titolo}</strong>
                  {!a.pubblicato && <span className="rb-faq-info-hidden-badge">Nascosto</span>}
                  <p>{a.corpo}</p>
                  {staff && (
                    <div className="rb-faq-info-article-actions">
                      <button type="button" className="rb-reset-filters-btn" onClick={() => setEditingId(a.id)}>Modifica</button>
                      <button
                        type="button"
                        className="rb-reset-filters-btn"
                        onClick={() => setFaqArticleVisibility(a.id, !a.pubblicato).then(refresh)}
                      >
                        {a.pubblicato ? 'Nascondi' : 'Pubblica'}
                      </button>
                    </div>
                  )}
                </div>
              )
            )}
          </details>
        ))
      )}
    </div>
  );
}
