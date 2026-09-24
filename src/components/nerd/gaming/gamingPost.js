// Costanti e formattazioni dei post di categoria del mondo Nerd (usate
// da GamingPostExtra, GamingComposers e GamingFeed).
export const TROPHY = {
  bronzo: { label: 'Bronzo', color: '#cd7f32' },
  argento: { label: 'Argento', color: '#c0c0c0' },
  oro: { label: 'Oro', color: '#ffc21f' },
  platino: { label: 'Platino', color: '#8fd3f4' },
};

export const GAMEPASS_ACTIONS = {
  entra: { label: 'In arrivo', icon: '🟢' },
  esce: { label: 'In uscita', icon: '🔴' },
  consiglio: { label: 'Consiglio', icon: '💡' },
};

export const formatPrice = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return `${v.toLocaleString('it-IT', { maximumFractionDigits: 0 })} €`;
};

export const formatDay = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
};

export const BUILD_INPUTS = [
  ['cpu', 'CPU', 'es. Ryzen 7 7800X3D'],
  ['gpu', 'GPU', 'es. RTX 4070 Super'],
  ['ram', 'RAM', 'es. 32 GB DDR5 6000'],
  ['storage', 'Storage', 'es. 2 TB NVMe'],
  ['scheda_madre', 'Scheda madre', 'es. B650'],
  ['alimentatore', 'Alimentatore', 'es. 750 W Gold'],
  ['case', 'Case', 'es. Lancool 216'],
];

// extra pronto per il server: numeri veri, righe fps vuote tolte.
export function buildExtraFromFields(v) {
  const out = {};
  for (const [k] of BUILD_INPUTS) if (v?.[k]?.trim()) out[k] = v[k].trim();
  if (v?.prezzo !== '' && v?.prezzo != null && Number.isFinite(Number(v.prezzo))) out.prezzo = Number(v.prezzo);
  out.fps = (v?.fps ?? [])
    .filter((f) => f.gioco?.trim() || f.fps)
    .map((f) => ({ gioco: f.gioco?.trim() ?? '', preset: f.preset?.trim() ?? '', fps: Number(f.fps) || 0 }));
  out.consiglio = Boolean(v?.consiglio);
  return out;
}

export const buildHasContent = (v) => BUILD_INPUTS.some(([k]) => v?.[k]?.trim()) || Boolean(v?.prezzo);

// Stato iniziale dei campi per tag, così il feed li resetta dopo l'invio.
export function emptyFields(tag) {
  if (tag === 'build') return { fps: [], consiglio: false };
  if (tag === 'trofeo') return { trofeo: '', rarita: 'oro', aiuto: false, title: null };
  if (tag === 'gamepass') return { azione: 'consiglio', data: '', title: null };
  if (tag === 'clip') return { title: null };
  return null;
}

// Da campi a { ok, why } oppure { ok, extra, titleId }.
export function fieldsToPost(tag, v) {
  if (tag === 'build') {
    if (!buildHasContent(v)) return { ok: false, why: 'Scrivi almeno un componente della build.' };
    return { ok: true, extra: buildExtraFromFields(v), titleId: null };
  }
  if (tag === 'trofeo') {
    if (!v?.trofeo?.trim()) return { ok: false, why: 'Scrivi il nome del trofeo.' };
    return { ok: true, extra: { trofeo: v.trofeo.trim(), rarita: v.rarita, aiuto: Boolean(v.aiuto) }, titleId: v.title?.id ?? null };
  }
  if (tag === 'gamepass') {
    if (!v?.title) return { ok: false, why: 'Scegli il gioco.' };
    if (v.azione !== 'consiglio' && !v.data) return { ok: false, why: 'Metti la data.' };
    return { ok: true, extra: { azione: v.azione, data: v.azione === 'consiglio' ? null : v.data }, titleId: v.title.id };
  }
  if (tag === 'clip') return { ok: true, extra: null, titleId: v?.title?.id ?? null };
  return { ok: true, extra: null, titleId: null };
}
