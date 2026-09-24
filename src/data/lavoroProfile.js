import { supabase } from './supabaseClient';

// Esperienze lavorative, istruzione e contatti del Profilo di Lavoro: righe
// private (solo il proprietario le legge, vedi RLS in migrazione
// lavoro_profile_esperienze_istruzione_contatti), niente edit — si toglie
// e si aggiunge di nuovo, come Album/Documenti già nell'app.

function mapEsperienza(row) {
  return {
    id: row.id,
    azienda: row.azienda,
    posizione: row.posizione,
    citta: row.citta ?? '',
    descrizione: row.descrizione ?? '',
    annoDa: row.anno_da,
    annoA: row.anno_a,
    attuale: row.attuale,
  };
}

function mapIstruzione(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    istituto: row.istituto,
    corsoDiStudi: row.corso_di_studi ?? '',
    citta: row.citta ?? '',
    annoDa: row.anno_da,
    annoA: row.anno_a,
  };
}

export async function listEsperienze() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return [];
  const { data, error } = await supabase
    .from('lavoro_esperienze')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('attuale', { ascending: false })
    .order('anno_da', { ascending: false });
  if (error || !data) return [];
  return data.map(mapEsperienza);
}

export async function addEsperienza({ azienda, posizione, citta, descrizione, annoDa, annoA, attuale }) {
  const { data, error } = await supabase.rpc('add_lavoro_esperienza', {
    p_azienda: azienda,
    p_posizione: posizione,
    p_citta: citta,
    p_descrizione: descrizione,
    p_anno_da: annoDa || null,
    p_anno_a: attuale ? null : annoA || null,
    p_attuale: attuale,
  });
  if (error) return { error: error.message };
  return { id: data };
}

export async function removeEsperienza(id) {
  const { error } = await supabase.rpc('remove_lavoro_esperienza', { p_id: id });
  if (error) return { error: error.message };
  return {};
}

export async function listIstruzione() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return [];
  const { data, error } = await supabase
    .from('lavoro_istruzione')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('anno_da', { ascending: false });
  if (error || !data) return [];
  return data.map(mapIstruzione);
}

export async function addIstruzione({ tipo, istituto, corsoDiStudi, citta, annoDa, annoA }) {
  const { data, error } = await supabase.rpc('add_lavoro_istruzione', {
    p_tipo: tipo,
    p_istituto: istituto,
    p_corso_di_studi: corsoDiStudi,
    p_citta: citta,
    p_anno_da: annoDa || null,
    p_anno_a: annoA || null,
  });
  if (error) return { error: error.message };
  return { id: data };
}

export async function removeIstruzione(id) {
  const { error } = await supabase.rpc('remove_lavoro_istruzione', { p_id: id });
  if (error) return { error: error.message };
  return {};
}

export async function updateLavoroContatti(socialMedia, telefono) {
  const { error } = await supabase.rpc('update_own_lavoro_contatti', {
    p_social_media: socialMedia,
    p_telefono: telefono,
  });
  if (error) return { error: error.message };
  return {};
}
