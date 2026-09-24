import { supabase } from './supabaseClient';

// Notifiche reali (tabella notifications, popolata da trigger lato DB su
// nuovo match/super like): qui solo lettura, marcatura come lette e canale
// realtime — la RLS limita già tutto alle proprie notifiche.
function mapNotification(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    letta: row.letta,
    createdAt: row.created_at,
    actorId: row.actor_id,
    actor: { id: row.actor_id, name: row.actor_nickname || 'Utente', avatar: row.actor_avatar_url || '' },
    riferimentoTipo: row.riferimento_tipo ?? null,
    riferimentoId: row.riferimento_id ?? null,
    riferimentoPadre: row.riferimento_padre ?? null,
    anteprima: row.anteprima ?? null,
  };
}

// get_my_notifications non restituisce riferimento e anteprima (servono
// per le menzioni): si leggono dalla tabella, che la RLS apre solo sulle
// proprie righe, e si uniscono per id.
async function withReferences(list) {
  const ids = list.map((n) => n.id);
  if (!ids.length) return list;
  const { data } = await supabase
    .from('notifications')
    .select('id, riferimento_tipo, riferimento_id, riferimento_padre, anteprima')
    .in('id', ids);
  const byId = new Map((data ?? []).map((r) => [r.id, r]));
  return list.map((n) => {
    const r = byId.get(n.id);
    return r
      ? { ...n, riferimentoTipo: r.riferimento_tipo, riferimentoId: r.riferimento_id, riferimentoPadre: r.riferimento_padre, anteprima: r.anteprima }
      : n;
  });
}

const MENTION_WHERE = {
  post: 'in un post',
  commento: 'in un commento',
  chat: 'in una chat',
  stanza_mod: 'nella Stanza MOD',
};

// Testo di una notifica (pannello e toast), senza il nome di chi l'ha
// causata: { who, text } così il nome si può mettere in grassetto.
export function describeNotification(n, relationLabel) {
  const who = n.actor?.name ?? 'Utente';
  switch (n.tipo) {
    case 'menzione':
      return { who, text: `ti ha menzionato ${MENTION_WHERE[n.riferimentoTipo] ?? ''}`.trim() };
    case 'friend_request':
      return { who, text: 'ti ha mandato una richiesta di amicizia' };
    case 'family_request':
      return { who, text: `vuole essere tuo/a ${relationLabel ?? 'familiare'}` };
    case 'new_post':
      return { who, text: 'ha pubblicato qualcosa di nuovo' };
    case 'super_like':
      return { who, text: 'ti ha mandato un Super Like ⭐' };
    default:
      return { who: '', text: `È un match con ${who}! 🎉` };
  }
}

export async function getMyNotifications(limit = 30) {
  try {
    const { data, error } = await supabase.rpc('get_my_notifications', { p_limit: limit });
    if (error) return { error: error.message };
    return { notifications: await withReferences((data ?? []).map(mapNotification)) };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function markNotificationsRead() {
  try {
    const { error } = await supabase.rpc('mark_notifications_read');
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Canale realtime per le proprie notifiche (match/super like): filtrato sul
// proprio id, così l'app lo sa nel momento stesso in cui arrivano, senza
// dover riaprire il pannello per scoprirle.
export function subscribeToOwnNotifications(userId, onInsert) {
  return supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => onInsert(payload.new)
    )
    .subscribe();
}
