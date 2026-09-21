import { supabase } from './supabaseClient';

// Categorie preferite (stellina accanto alla X di ogni pannello categoria):
// private per utente (favorite_categories, RLS owner-only), non condivise
// con nessun altro.
export async function listMyFavoriteCategories() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return [];
    const { data, error } = await supabase
      .from('favorite_categories')
      .select('world_id, category_id, category_label, created_at')
      .eq('owner_id', auth.user.id)
      .order('created_at', { ascending: true });
    if (error || !data) return [];
    return data.map((r) => ({ worldId: r.world_id, categoryId: r.category_id, categoryLabel: r.category_label }));
  } catch {
    return [];
  }
}

export async function addFavoriteCategory({ worldId, categoryId, categoryLabel }) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { error } = await supabase
      .from('favorite_categories')
      .insert({ owner_id: auth.user.id, world_id: worldId, category_id: categoryId, category_label: categoryLabel });
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function removeFavoriteCategory({ worldId, categoryId }) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { error } = await supabase
      .from('favorite_categories')
      .delete()
      .eq('owner_id', auth.user.id)
      .eq('world_id', worldId)
      .eq('category_id', categoryId);
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}
