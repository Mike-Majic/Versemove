import { supabase } from './supabaseClient';

// Link condivisibili: un indirizzo che apre direttamente un contenuto
// dell'app. Sono tutti nel frammento "#/…" (la PWA è una sola pagina su
// GitHub Pages, quindi niente percorsi veri lato server):
//   #/social/post/<id>          post del mondo Social
//   #/u/<nickname>              profilo pubblico
//   #/annunci/<id>              annuncio
//   #/nerd/cosplay/evento/<id>  evento Cosplay
// Il vecchio "#annuncio-<id>" (copiato prima di questi link) resta valido.
// I frammenti di Supabase Auth (#access_token=…, type=recovery…) non
// iniziano con "#/" e non vengono toccati.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const baseUrl = () => `${window.location.origin}${window.location.pathname}`;

export const linkToPost = (id) => `${baseUrl()}#/social/post/${id}`;
export const linkToProfile = (nickname) => `${baseUrl()}#/u/${encodeURIComponent(nickname)}`;
export const linkToListing = (id) => `${baseUrl()}#/annunci/${id}`;
export const linkToCosplayEvent = (id) => `${baseUrl()}#/nerd/cosplay/evento/${id}`;

function decodePart(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

// -> { type: 'post' | 'profile' | 'listing' | 'cosplayEvent', id?, nickname? } | null
export function parseDeepLink(hash = window.location.hash) {
  if (!hash) return null;
  const legacy = hash.match(/^#annuncio-(.+)$/);
  if (legacy) return UUID_RE.test(legacy[1]) ? { type: 'listing', id: legacy[1] } : null;
  if (!hash.startsWith('#/')) return null;
  const parts = hash.slice(2).split('?')[0].split('/').filter(Boolean).map(decodePart);
  const [a, b, c, d] = parts;
  if (a === 'social' && b === 'post' && UUID_RE.test(c ?? '')) return { type: 'post', id: c };
  if (a === 'u' && b && b.length <= 30) return { type: 'profile', nickname: b };
  if (a === 'annunci' && UUID_RE.test(b ?? '')) return { type: 'listing', id: b };
  if (a === 'nerd' && b === 'cosplay' && c === 'evento' && UUID_RE.test(d ?? '')) return { type: 'cosplayEvent', id: d };
  return null;
}

export const isDeepLinkHash = (hash = window.location.hash) => parseDeepLink(hash) !== null;

// Toglie il frammento dalla barra degli indirizzi senza aggiungere voci in
// cronologia (lo stato di useBackLayer resta quello della voce attuale).
export function clearDeepLinkHash() {
  try {
    window.history.replaceState(window.history.state, '', `${baseUrl()}${window.location.search}`);
  } catch {
    // replaceState non disponibile: il frammento resta, nessun danno.
  }
}

// Condivide un link: foglio di condivisione del sistema se c'è (telefono),
// altrimenti copia negli appunti. -> 'shared' | 'copied' | 'cancelled' | 'failed'
export async function shareLink({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // Condivisione non permessa qui (es. iframe): si prova con gli appunti.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// Id del profilo con questo nickname (senza distinzione tra maiuscole e
// minuscole, come il vincolo di unicità). -> id | null
export async function profileIdByNickname(nickname) {
  const clean = (nickname ?? '').trim();
  if (!clean) return null;
  const pattern = clean.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const { data, error } = await supabase.from('public_profiles').select('id').ilike('nickname', pattern).limit(1).maybeSingle();
  if (error || !data) return null;
  return data.id;
}
