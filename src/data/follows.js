import { supabase } from './supabaseClient';
import { translateInteractionError } from './errors';
import { displayName } from './posts';

// Segui/smetti di seguire un utente reale (tabella follows) — sostituisce
// il vecchio array locale "following" di SocialFeed.jsx.
export async function followUser(followeeId) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { error } = await supabase.from('follows').insert({ follower_id: auth.user.id, followee_id: followeeId });
    if (error) return { error: translateInteractionError(error) };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function unfollowUser(followeeId) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { error } = await supabase.from('follows').delete().eq('follower_id', auth.user.id).eq('followee_id', followeeId);
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Id di chi l'utente loggato segue già.
export async function getFollowing() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return [];
    const { data, error } = await supabase.from('follows').select('followee_id').eq('follower_id', auth.user.id);
    if (error || !data) return [];
    return data.map((r) => r.followee_id);
  } catch {
    return [];
  }
}

// Profili completi (nickname/avatar) di chi l'utente loggato segue già —
// serve al pannello "Chi segui" (es. nel profilo musicale della Musica).
export async function listFollowingProfiles() {
  try {
    const ids = await getFollowing();
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from('public_profiles').select('id, nickname, username, avatar_url').in('id', ids);
    if (error || !data) return [];
    return data.map((p) => ({ id: p.id, name: displayName(p), avatar: p.avatar_url || '' }));
  } catch {
    return [];
  }
}

// Qualche profilo reale non ancora seguito, per il widget "Persone da
// seguire" — legge dalla vista public_profiles (nome pubblico/avatar,
// mai i campi personali di profiles).
export async function listSuggestedProfiles(excludeIds = [], limit = 4) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const myId = auth?.user?.id ?? null;
    const exclude = new Set([...(excludeIds ?? []), myId].filter(Boolean));

    const { data, error } = await supabase.from('public_profiles').select('id, nickname, username, avatar_url').limit(50);
    if (error || !data) return [];

    return data
      .filter((p) => !exclude.has(p.id))
      .slice(0, limit)
      .map((p) => ({ id: p.id, name: displayName(p), avatar: p.avatar_url || '' }));
  } catch {
    return [];
  }
}

// Quanti segue e quanti lo seguono (follows è leggibile da tutti, RLS
// follows_select_all). -> { following, followers } (null se non si sa).
export async function getFollowCounts(userId) {
  try {
    const [a, b] = await Promise.all([
      supabase.from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', userId),
      supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', userId),
    ]);
    return { following: a.error ? null : a.count ?? 0, followers: b.error ? null : b.count ?? 0 };
  } catch {
    return { following: null, followers: null };
  }
}

// Elenco di chi segue (kind 'following') o di chi lo segue ('followers')
// un utente qualsiasi, con nickname/avatar pubblici.
export async function listFollowProfiles(userId, kind = 'following') {
  try {
    const [mine, other] = kind === 'followers' ? ['followee_id', 'follower_id'] : ['follower_id', 'followee_id'];
    const { data, error } = await supabase.from('follows').select(other).eq(mine, userId).limit(500);
    if (error || !data?.length) return [];
    const ids = data.map((r) => r[other]);
    const { data: profiles, error: pErr } = await supabase.from('public_profiles').select('id, nickname, username, avatar_url').in('id', ids);
    if (pErr || !profiles) return [];
    return profiles.map((p) => ({ id: p.id, name: displayName(p), avatar: p.avatar_url || '' }));
  } catch {
    return [];
  }
}
