import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';

// Menzioni "@Nickname" (posts, comments, chat_messages, mod_room_messages
// hanno tutti la colonna menzioni uuid[]). Il client manda gli id scelti
// dal suggerimento; il server tiene solo quelli validi (nickname presente
// davvero nel testo, persona che può vedere il contenuto, niente blocchi,
// stessa fascia d'età, partecipante della chat o staff) e crea lui la
// notifica 'menzione'.

// contesto: 'generale' | 'chat' (contestoId = conversation_id) | 'stanza_mod'.
export async function searchMentionable(query, contesto = 'generale', contestoId = null) {
  const { data, error } = await supabase.rpc('search_mentionable', {
    p_query: query ?? '',
    p_contesto: contesto,
    p_contesto_id: contestoId,
  });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, nickname: r.nickname, avatar: r.avatar_url || '' }));
}

// Profili delle persone menzionate, con una piccola cache: lo stesso nome
// compare in molti messaggi e non serve richiederlo ogni volta.
const profileCache = new Map();
export async function fetchMentionProfiles(ids) {
  const missing = (ids ?? []).filter((id) => id && !profileCache.has(id));
  if (missing.length) {
    const map = await fetchProfilesMap(missing);
    missing.forEach((id) => profileCache.set(id, map.get(id) ?? null));
  }
  const out = new Map();
  (ids ?? []).forEach((id) => {
    const p = profileCache.get(id);
    if (p) out.set(id, p);
  });
  return out;
}

// Id da mandare al server: solo le menzioni ancora presenti nel testo.
export function mentionIdsInText(text, mentions) {
  return Array.from(new Set((mentions ?? []).filter((m) => text.includes(`@${m.nickname}`)).map((m) => m.id)));
}

// Apre il profilo di una persona da qualunque punto dell'app (lo ascolta
// App.jsx).
export function openProfileFromMention(id) {
  window.dispatchEvent(new CustomEvent('vm:open-profile', { detail: { id } }));
}
