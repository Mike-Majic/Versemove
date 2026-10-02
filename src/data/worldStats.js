import { supabase } from './supabaseClient';

// Iscritti e online di un mondo (world_stats, leggibile anche senza
// accesso): { iscritti, online } oppure null.
export async function getWorldStats(mondo) {
  try {
    const { data, error } = await supabase.rpc('world_stats', { p_mondo: mondo });
    if (error || !data) return null;
    return { iscritti: Number(data.iscritti) || 0, online: Number(data.online) || 0 };
  } catch {
    return null;
  }
}

// Formato compatto italiano: 1.006 · 12,4 mila · 1,2 mln. Nelle altre
// lingue il formato compatto del browser (12K, 1.2M, 1,2 Mio. ...).
const fmt1 = (n) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 });
export function compactCount(n, lang = 'it') {
  const v = Math.max(0, Math.round(n));
  if (!String(lang).startsWith('it')) {
    if (v < 10_000) return v.toLocaleString(lang);
    try {
      return new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(v);
    } catch {
      return v.toLocaleString();
    }
  }
  if (v >= 1_000_000) return `${fmt1(v / 1_000_000)} mln`;
  if (v >= 10_000) return `${fmt1(v / 1000)} mila`;
  return v.toLocaleString('it-IT');
}
