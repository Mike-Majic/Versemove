import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';

// Contenuto a cui si riferisce una segnalazione (reports.target_type +
// target_id), per la finestra di dettaglio del Backend (Moderazione).
// target_id è testo: se non è un id valido, o il contenuto non esiste più
// (o la RLS non lo fa leggere), si restituisce null e la finestra mostra
// "Contenuto non più disponibile".
//
// Forma comune per tutti i tipi, così la finestra ha un solo modo di
// mostrarli:
// { title, author: { id, name, avatar } | null, date, mondo, text,
//   media: [{ url, kind: 'image' | 'video' }], rows: [[etichetta, valore]],
//   parent: { title, text, author, date } | null,
//   profile: { id, nickname, avatar, bio } | null, deletedAt }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_RE.test(String(value ?? ''));
}

async function one(table, id, columns = '*') {
  const { data, error } = await supabase.from(table).select(columns).eq('id', id).maybeSingle();
  if (error || !data) return null;
  return data;
}

async function authorOf(id) {
  if (!id) return null;
  const map = await fetchProfilesMap([id]);
  const p = map.get(id);
  return p ? { id, name: p.name, avatar: p.avatar } : { id, name: 'Account eliminato', avatar: '' };
}

// Foto/video di un post o commento (colonna media, vedi posts.js).
function mediaOfPost(media) {
  const arr = Array.isArray(media) ? media : [];
  const out = [];
  for (const m of arr) {
    if (m.kind === 'content' && m.url) out.push({ url: m.url, kind: m.media_type === 'video' ? 'video' : 'image' });
    else if (m.kind === 'gif' && m.url) out.push({ url: m.url, kind: 'image' });
  }
  return out;
}

const photos = (list) => (Array.isArray(list) ? list : []).filter((u) => typeof u === 'string' && u).map((url) => ({ url, kind: 'image' }));

const base = { author: null, date: null, mondo: null, text: '', media: [], rows: [], parent: null, profile: null, deletedAt: null };

const LOADERS = {
  async post(id) {
    const p = await one('posts', id);
    if (!p) return null;
    return {
      ...base,
      title: 'Post',
      author: await authorOf(p.author_id),
      date: p.created_at,
      mondo: p.mondo,
      text: p.testo ?? '',
      media: mediaOfPost(p.media),
      deletedAt: p.deleted_at,
    };
  },
  async commento(id) {
    const c = await one('comments', id);
    if (!c) return null;
    const post = c.post_id ? await one('posts', c.post_id) : null;
    return {
      ...base,
      title: 'Commento',
      author: await authorOf(c.author_id),
      date: c.created_at,
      text: c.testo ?? '',
      media: mediaOfPost(c.media),
      deletedAt: c.deleted_at,
      parent: post
        ? { title: 'Post a cui appartiene', text: post.testo ?? '', author: await authorOf(post.author_id), date: post.created_at, mondo: post.mondo }
        : { title: 'Post a cui appartiene', text: 'Post non più disponibile.', author: null, date: null },
    };
  },
  async profilo(id) {
    const p = await one('public_profiles', id, 'id, nickname, username, avatar_url, bio_social, citta_social');
    if (!p) return null;
    return {
      ...base,
      title: 'Profilo',
      profile: { id: p.id, nickname: p.nickname || p.username || 'Utente', avatar: p.avatar_url || '', bio: p.bio_social || '' },
      rows: p.citta_social ? [['Città', p.citta_social]] : [],
    };
  },
  async gruppo(id) {
    const g = await one('groups', id);
    if (!g) return null;
    return {
      ...base,
      title: `Gruppo ${g.icona || '👥'} ${g.nome}`,
      author: await authorOf(g.owner_id),
      date: g.created_at,
      mondo: g.mondo,
      text: g.descrizione ?? '',
      deletedAt: g.deleted_at,
    };
  },
  async live(id) {
    const l = await one('live_sessions', id);
    if (!l) return null;
    return {
      ...base,
      title: `Live${l.titolo ? `: ${l.titolo}` : ''}`,
      author: await authorOf(l.host_id),
      date: l.iniziata_at,
      mondo: l.mondo,
      rows: [
        ['Piattaforma', l.piattaforma],
        ['Canale', l.canale],
        ['Stato', l.attiva ? 'In corso' : 'Terminata'],
      ].filter(([, v]) => v),
    };
  },
  async evento(id) {
    const e = await one('events', id);
    if (e) {
      return {
        ...base,
        title: `Evento: ${e.titolo}`,
        author: e.fonte === 'bot' ? null : await authorOf(e.autore_id),
        date: e.created_at,
        mondo: e.mondo,
        text: e.descrizione ?? '',
        media: e.foto_url ? [{ url: e.foto_url, kind: 'image' }] : [],
        rows: [
          ['Quando', e.data_evento ? new Date(e.data_evento).toLocaleString('it-IT') : null],
          ['Dove', [e.indirizzo, e.citta].filter(Boolean).join(', ')],
        ].filter(([, v]) => v),
        deletedAt: e.deleted_at,
      };
    }
    const c = await one('community_events', id);
    if (!c) return null;
    return {
      ...base,
      title: `Evento: ${c.title}`,
      author: await authorOf(c.created_by),
      date: c.created_at,
      text: c.description ?? '',
      rows: [
        ['Quando', c.event_date ? new Date(c.event_date).toLocaleString('it-IT') : null],
        ['Dove', c.location],
      ].filter(([, v]) => v),
    };
  },
  async annuncio(id) {
    const a = await one('annunci_listings', id);
    if (!a) return null;
    return {
      ...base,
      title: `Annuncio: ${a.titolo}`,
      author: await authorOf(a.owner_id),
      date: a.created_at,
      mondo: 'annunci',
      text: a.descrizione ?? '',
      media: photos(a.foto),
      rows: [
        ['Prezzo', a.prezzo != null ? `${a.prezzo} ${a.valuta ?? '€'}` : null],
        ['Dove', [a.citta, a.provincia].filter(Boolean).join(', ')],
        ['Stato', a.stato],
      ].filter(([, v]) => v),
    };
  },
  async vetrina_offerta(id) {
    const d = await one('vetrina_deals', id);
    if (!d) return null;
    return {
      ...base,
      title: `Offerta: ${d.titolo}`,
      author: d.author_id ? await authorOf(d.author_id) : null,
      date: d.created_at,
      mondo: 'vetrina',
      text: d.descrizione ?? '',
      media: d.immagine ? [{ url: d.immagine, kind: 'image' }] : [],
      rows: [
        ['Negozio', d.negozio],
        ['Prezzo', d.prezzo != null ? `${d.prezzo} ${d.valuta ?? '€'}` : null],
        ['Link', d.url],
      ].filter(([, v]) => v),
    };
  },
  async dog_luogo(id) {
    const p = await one('dog_places', id);
    if (!p) return null;
    return {
      ...base,
      title: `Luogo: ${p.nome}`,
      author: p.created_by ? await authorOf(p.created_by) : null,
      date: p.created_at,
      mondo: 'animali',
      text: p.descrizione ?? '',
      media: photos(p.foto),
      rows: [['Dove', [p.comune, p.provincia].filter(Boolean).join(', ')]].filter(([, v]) => v),
      deletedAt: p.deleted_at,
    };
  },
  async dog_recensione(id) {
    const r = await one('dog_place_reviews', id);
    if (!r) return null;
    const place = r.place_id ? await one('dog_places', r.place_id, 'id, nome') : null;
    return {
      ...base,
      title: 'Recensione',
      author: await authorOf(r.author_id),
      date: r.created_at,
      mondo: 'animali',
      text: r.testo ?? '',
      media: photos(r.foto),
      rows: [
        ['Luogo', place?.nome],
        ['Voto', r.voto != null ? `${r.voto}/5` : null],
      ].filter(([, v]) => v),
      deletedAt: r.deleted_at,
    };
  },
  async tattoo_post(id) {
    const t = await one('tattoo_posts', id);
    if (!t) return null;
    return {
      ...base,
      title: 'Post tatuaggio',
      author: await authorOf(t.author_id),
      date: t.created_at,
      mondo: 'arte',
      text: t.descrizione ?? t.testo ?? '',
      media: photos(t.foto),
    };
  },
};

// -> contenuto (forma sopra) | null se non disponibile.
// 'app' (segnalazione generale dalla FAQ) non ha un contenuto: null con
// noTarget, la finestra lo dice in modo diverso.
export async function fetchReportTarget(targetType, targetId) {
  if (targetType === 'app') return { noTarget: true };
  const load = LOADERS[targetType];
  if (!load || !isUuid(targetId)) return null;
  try {
    return await load(targetId);
  } catch {
    return null;
  }
}
