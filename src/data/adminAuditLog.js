import { supabase } from './supabaseClient';

// Log delle azioni di owner/moderatori (tabella public.admin_audit_log):
// solo lo staff può leggerlo (RLS "admin_audit_log_select_staff"), e
// l'unico modo per scriverci è la funzione log_admin_action lato server —
// niente insert diretto dal client, così il log resta affidabile.
function mapEntry(row) {
  return {
    id: row.id,
    staffId: row.staff_id,
    staffNickname: row.staff?.nickname ?? null,
    azione: row.azione,
    targetUserId: row.target_user_id,
    targetNickname: row.target?.nickname ?? null,
    dettagli: row.dettagli,
    data: row.created_at,
  };
}

const SELECT_WITH_NICKNAMES =
  '*, staff:admin_audit_log_staff_id_fkey(nickname), target:admin_audit_log_target_user_id_fkey(nickname)';

export async function getAuditLog(limit = 200) {
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select(SELECT_WITH_NICKNAMES)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data.map(mapEntry);
}

// Registra un'azione di staff. Non blocca mai l'azione principale (cambio
// ruolo, verifica, reset password, gestione segnalazione): se il log
// fallisce per qualche motivo, l'azione vera è comunque già andata a buon
// fine, si perde solo la riga di log.
export async function logAdminAction(azione, targetUserId = null, dettagli = {}) {
  await supabase.rpc('log_admin_action', {
    p_azione: azione,
    p_target_user_id: targetUserId,
    p_dettagli: dettagli,
  });
}

export const AUDIT_LABELS = {
  cambio_ruolo: 'Cambio ruolo',
  verifica_documento: 'Verifica documento',
  reset_password: 'Reset password',
  gestione_segnalazione: 'Gestione segnalazione',
  ban_account: 'Ban account',
  unban_account: 'Rimozione ban',
  rimozione_post: 'Rimozione post (moderazione)',
  rimozione_commento: 'Rimozione commento (moderazione)',
};
