import { supabase } from './supabaseClient';

// Coda di moderazione (tabella public.reports): chi segnala vede solo le
// proprie segnalazioni, owner/moderatori le vedono e gestiscono tutte — lo
// decide la RLS, qui non serve nessun controllo di ruolo lato client.
function mapReport(row) {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    reporterNickname: row.reporter?.nickname ?? null,
    targetType: row.target_type,
    targetId: row.target_id,
    motivo: row.motivo,
    dettagli: row.dettagli,
    stato: row.stato,
    gestitoDa: row.gestito_da,
    gestitoDaNickname: row.gestito_da_profile?.nickname ?? null,
    data: row.created_at,
    risoltoAt: row.risolto_at,
  };
}

const SELECT_WITH_NICKNAMES =
  '*, reporter:reports_reporter_id_fkey(nickname), gestito_da_profile:reports_gestito_da_fkey(nickname)';

export async function getReports() {
  const { data, error } = await supabase
    .from('reports')
    .select(SELECT_WITH_NICKNAMES)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data.map(mapReport);
}

// Crea una segnalazione: qualunque utente autenticato può segnalare un
// contenuto o un profilo (post, commento, profilo, gruppo, live, evento).
// targetId resta testo: i contenuti mostrati nell'app hanno spesso ancora
// id generati lato client (non veri UUID Supabase), esattamente come già
// successo per blocked_contacts.contact_id.
export async function createReport({ targetType, targetId, motivo, dettagli }) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato per segnalare.' };
  const { error } = await supabase.from('reports').insert({
    reporter_id: auth.user.id,
    target_type: targetType,
    target_id: String(targetId),
    motivo,
    dettagli: dettagli ?? null,
  });
  if (error) return { error: error.message };
  return {};
}

// Cambia lo stato di una segnalazione (presa in carico o chiusura). Solo
// owner/moderatori possono farlo con successo: lo garantisce la RLS
// "reports_update_staff", qui si registra anche chi se ne è occupato.
export async function updateReportStatus(reportId, stato) {
  const patch = { stato, gestito_da: (await supabase.auth.getUser()).data.user?.id ?? null };
  if (stato === 'chiuso') patch.risolto_at = new Date().toISOString();
  const { error } = await supabase.from('reports').update(patch).eq('id', reportId);
  if (error) return { error: error.message };
  return {};
}

// Etichette per il Backend (Moderazione e finestra di dettaglio).
export const REPORT_TARGET_LABELS = {
  post: 'Post',
  commento: 'Commento',
  profilo: 'Profilo',
  gruppo: 'Gruppo',
  live: 'Live',
  evento: 'Evento',
  annuncio: 'Annuncio',
  vetrina_offerta: 'Offerta (Vetrina)',
  tattoo_post: 'Post tatuaggio',
  dog_luogo: 'Luogo (Animali)',
  dog_recensione: 'Recensione (Animali)',
  app: 'App (segnalazione generale)',
};

export const REPORT_STATO_LABELS = { aperto: 'Aperto', in_lavorazione: 'In lavorazione', chiuso: 'Chiuso' };
