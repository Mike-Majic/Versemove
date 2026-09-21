import { supabase } from './supabaseClient';
import { uploadClip, getClipUrl, deleteClipFile } from './clipStorage';

// Clip verticali brevi della scheda "Clip" in Musica: caricate dagli utenti
// (massimo 60s, ricompresse a 720p lato client, vedi data/videoCompress.js),
// con like/salva/commenti propri (music_clip_*, vedi la migrazione
// music_clips) — non condividono nulla con contents.js (foto/video di Arte).
export async function listClips(limit = 30) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const myId = auth?.user?.id ?? null;

    const { data, error } = await supabase
      .from('music_clips')
      .select('id, owner_id, storage_path, caption, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];

    const clipIds = data.map((c) => c.id);
    const likeCounts = new Map();
    const likedByMe = new Set();
    const savedByMe = new Set();
    const commentCounts = new Map();

    if (clipIds.length) {
      const { data: likes } = await supabase.from('music_clip_likes').select('clip_id, user_id').in('clip_id', clipIds);
      for (const l of likes ?? []) {
        likeCounts.set(l.clip_id, (likeCounts.get(l.clip_id) ?? 0) + 1);
        if (l.user_id === myId) likedByMe.add(l.clip_id);
      }
      const { data: comments } = await supabase.from('music_clip_comments').select('clip_id').in('clip_id', clipIds);
      for (const c of comments ?? []) {
        commentCounts.set(c.clip_id, (commentCounts.get(c.clip_id) ?? 0) + 1);
      }
      if (myId) {
        const { data: saves } = await supabase
          .from('music_clip_saves')
          .select('clip_id')
          .eq('user_id', myId)
          .in('clip_id', clipIds);
        for (const s of saves ?? []) savedByMe.add(s.clip_id);
      }
    }

    return data.map((c) => ({
      id: c.id,
      ownerId: c.owner_id,
      caption: c.caption,
      createdAt: c.created_at,
      url: getClipUrl(c.storage_path),
      storagePath: c.storage_path,
      likeCount: likeCounts.get(c.id) ?? 0,
      likedByMe: likedByMe.has(c.id),
      savedByMe: savedByMe.has(c.id),
      commentCount: commentCounts.get(c.id) ?? 0,
      isMine: myId != null && c.owner_id === myId,
    }));
  } catch {
    return [];
  }
}

export async function publishClip({ blob, caption }) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };

    const { path, error: uploadError } = await uploadClip(blob, auth.user.id);
    if (uploadError) return { error: uploadError };

    const { data: clip, error } = await supabase
      .from('music_clips')
      .insert({ owner_id: auth.user.id, storage_path: path, caption: caption ?? '' })
      .select()
      .single();
    if (error) return { error: error.message };

    return {
      clip: {
        id: clip.id,
        ownerId: clip.owner_id,
        caption: clip.caption,
        createdAt: clip.created_at,
        url: getClipUrl(path),
        storagePath: path,
        likeCount: 0,
        likedByMe: false,
        savedByMe: false,
        commentCount: 0,
        isMine: true,
      },
    };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete durante la pubblicazione.' };
  }
}

export async function deleteClip(clipId, storagePath) {
  try {
    const { error } = await supabase.from('music_clips').delete().eq('id', clipId);
    if (error) return { error: error.message };
    if (storagePath) await deleteClipFile(storagePath);
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function toggleClipLike(clipId, currentlyLiked) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    if (currentlyLiked) {
      const { error } = await supabase.from('music_clip_likes').delete().eq('clip_id', clipId).eq('user_id', auth.user.id);
      if (error) return { error: error.message };
      return { liked: false };
    }
    const { error } = await supabase.from('music_clip_likes').insert({ clip_id: clipId, user_id: auth.user.id });
    if (error) return { error: error.message };
    return { liked: true };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function toggleClipSave(clipId, currentlySaved) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    if (currentlySaved) {
      const { error } = await supabase.from('music_clip_saves').delete().eq('clip_id', clipId).eq('user_id', auth.user.id);
      if (error) return { error: error.message };
      return { saved: false };
    }
    const { error } = await supabase.from('music_clip_saves').insert({ clip_id: clipId, user_id: auth.user.id });
    if (error) return { error: error.message };
    return { saved: true };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function listClipComments(clipId) {
  try {
    const { data, error } = await supabase
      .from('music_clip_comments')
      .select('id, owner_id, text, created_at')
      .eq('clip_id', clipId)
      .order('created_at', { ascending: true });
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export async function addClipComment(clipId, text) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { data, error } = await supabase
      .from('music_clip_comments')
      .insert({ clip_id: clipId, owner_id: auth.user.id, text: text.trim() })
      .select()
      .single();
    if (error) return { error: error.message };
    return { comment: data };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// "Attività recente" (Raccolta): un solo brano registrato per utente (upsert
// su played_at), scritto davvero quando l'utente preme play — non precaricato.
export async function recordRecentPlay(track) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return;
    await supabase.from('music_recent_plays').upsert(
      {
        owner_id: auth.user.id,
        track_id: track.id,
        title: track.title,
        artist: track.artist ?? '',
        artwork_url: track.artworkUrl ?? null,
        played_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id,track_id' }
    );
  } catch {
    // Non bloccante: la cronologia recente è un'aggiunta, non deve mai
    // interrompere la riproduzione se la scrittura fallisce.
  }
}

export async function listRecentPlays(limit = 20) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return [];
    const { data, error } = await supabase
      .from('music_recent_plays')
      .select('track_id, title, artist, artwork_url, played_at')
      .eq('owner_id', auth.user.id)
      .order('played_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((r) => ({ id: r.track_id, title: r.title, artist: r.artist, artworkUrl: r.artwork_url, playedAt: r.played_at }));
  } catch {
    return [];
  }
}
