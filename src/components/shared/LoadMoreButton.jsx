import { useEffect, useRef } from 'react';

// "Carica altri" in fondo a un elenco a pagine: si attiva da solo quando
// entra in vista (scorrimento infinito) e resta cliccabile come riserva.
export default function LoadMoreButton({ onLoad, loading = false, label = 'Carica altri', loadingLabel = 'Carico…' }) {
  const ref = useRef(null);
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  useEffect(() => {
    const el = ref.current;
    if (!el || loading) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onLoadRef.current?.();
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loading]);

  return (
    <div ref={ref} className="rb-feed-more">
      <button type="button" className="rb-feed-more-btn" onClick={() => onLoad?.()} disabled={loading}>
        {loading ? loadingLabel : label}
      </button>
    </div>
  );
}
