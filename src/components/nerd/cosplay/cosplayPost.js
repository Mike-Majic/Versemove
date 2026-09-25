import { FONTE_SERIE } from '../../../data/cosplay';

// Campi strutturati dei post Cosplay (posts.extra), fuori dai componenti
// così il fast refresh non si lamenta.
// - galleria: { personaggio, serie, fonte_serie, fotografo, evento_id }
// - wip: { personaggio, serie, materiali: [], costo_eur, ore, avanzamento }

export function emptyFields(tag) {
  if (tag === 'galleria') return { personaggio: '', serie: '', fonte_serie: 'anime', fotografo: '', evento_id: '' };
  if (tag === 'wip') return { personaggio: '', serie: '', materiali: '', costo_eur: '', ore: '', avanzamento: 50 };
  return {};
}

export function parseMateriali(text) {
  return String(text ?? '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

export function fieldsToPost(tag, v) {
  if (tag === 'galleria') {
    const extra = {
      personaggio: v.personaggio?.trim() || null,
      serie: v.serie?.trim() || null,
      fonte_serie: FONTE_SERIE[v.fonte_serie] ? v.fonte_serie : 'altro',
      fotografo: v.fotografo?.trim() || null,
      evento_id: v.evento_id || null,
    };
    if (!extra.personaggio && !extra.serie) return { ok: false, why: 'Scrivi almeno il personaggio o la serie.' };
    return { ok: true, extra };
  }
  if (tag === 'wip') {
    const extra = {
      personaggio: v.personaggio?.trim() || null,
      serie: v.serie?.trim() || null,
      materiali: parseMateriali(v.materiali),
      costo_eur: num(v.costo_eur),
      ore: num(v.ore),
      avanzamento: Math.max(0, Math.min(100, Math.round(Number(v.avanzamento ?? 0)))),
    };
    if (!extra.personaggio && !extra.serie) return { ok: false, why: 'Scrivi almeno il personaggio o la serie del lavoro.' };
    return { ok: true, extra };
  }
  return { ok: true, extra: null };
}

export function formatEuro(n) {
  return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(n)} €`;
}
