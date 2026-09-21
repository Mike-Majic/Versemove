// Segnaposto mostrato da <Suspense> mentre un componente caricato con
// React.lazy sta ancora scaricando il proprio chunk (vedi App.jsx). Deve
// restare leggerissimo: niente dipendenze pesanti, è lui stesso a comparire
// PRIMA che il resto del bundle sia arrivato.
export default function PageLoading() {
  return (
    <div className="rb-page-loading" aria-live="polite">
      <span className="rb-page-loading-spinner" />
    </div>
  );
}
