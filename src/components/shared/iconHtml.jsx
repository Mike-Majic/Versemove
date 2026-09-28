import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Icon from './Icon';

// Stessa icona di shared/Icon.jsx come stringa HTML, per le mappe Leaflet
// (divIcon e popup vogliono HTML, non componenti React). Resa una volta e
// tenuta in cache.
const cache = new Map();

export function iconHtml(name, size = 16) {
  const key = `${name}:${size}`;
  if (cache.has(key)) return cache.get(key);
  if (typeof document === 'undefined') return '';
  const el = document.createElement('div');
  const root = createRoot(el);
  flushSync(() => root.render(<Icon name={name} size={size} />));
  const html = el.innerHTML;
  root.unmount();
  cache.set(key, html);
  return html;
}
