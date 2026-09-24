import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';

// Familiari: collegamento fra due account con conferma reciproca, stesso
// schema delle amicizie (data/friends.js) ma con un'etichetta di relazione
// per lato. Chi manda la richiesta sceglie come descrive il destinatario
// ("lo aggiungo come mio/a ___"): l'inversa (come il destinatario dovrebbe
// descrivere chi ha mandato la richiesta) la calcola il server con una
// mappa fissa — mai fidata dal client, per questo qui non si scrive mai
// direttamente sulla tabella family_links, solo tramite RPC (vedi
// migrazione profile_social_extra_and_family).
//
// I valori qui DEVONO restare allineati alla mappa server-side in
// send_family_request: cambiarli da un lato senza l'altro rompe il calcolo
// dell'inversa.
export const FAMILY_RELATIONS = [
  { value: 'genitore', selectLabel: 'Genitore', displayLabel: 'Genitore' },
  { value: 'figlio_a', selectLabel: 'Figlio/a', displayLabel: 'Figlio/a' },
  { value: 'fratello_sorella', selectLabel: 'Fratello/Sorella', displayLabel: 'Fratello/Sorella' },
  { value: 'nonno_a', selectLabel: 'Nonno/a', displayLabel: 'Nonno/a' },
  { value: 'nipote_nonno', selectLabel: 'Nipote (di nonno/a)', displayLabel: 'Nipote' },
  { value: 'zio_a', selectLabel: 'Zio/a', displayLabel: 'Zio/a' },
  { value: 'nipote_zio', selectLabel: 'Nipote (di zio/a)', displayLabel: 'Nipote' },
  { value: 'cugino_a', selectLabel: 'Cugino/a', displayLabel: 'Cugino/a' },
  { value: 'partner_coniuge', selectLabel: 'Partner/Coniuge', displayLabel: 'Partner/Coniuge' },
];

export function familyRelationLabel(value) {
  return FAMILY_RELATIONS.find((r) => r.value === value)?.displayLabel ?? value;
}

export async function sendFamilyRequest(toId, relazione) {
  try {
    const { data, error } = await supabase.rpc('send_family_request', { p_to_id: toId, p_relazione: relazione });
    if (error) return { error: error.message };
    return { id: data };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function respondToFamilyRequest(linkId, accept) {
  try {
    const { error } = await supabase.rpc('respond_family_request', { p_link_id: linkId, p_accetta: accept });
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function removeFamilyLink(linkId) {
  try {
    const { error } = await supabase.rpc('remove_family_link', { p_link_id: linkId });
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

async function mapLinksWithProfiles(rows, otherIdKey, relationKey) {
  const profilesMap = await fetchProfilesMap(rows.map((r) => r[otherIdKey]));
  return rows.map((r) => ({
    id: r.id,
    relazione: r[relationKey],
    createdAt: r.created_at,
    other: profilesMap.get(r[otherIdKey]) ?? { id: r[otherIdKey], name: 'Utente', avatar: '' },
  }));
}

// Richieste familiari ricevute ancora in sospeso — relazione_to è già,
// lato server, come IO dovrei descrivere chi ha mandato la richiesta.
export async function getReceivedFamilyRequests() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return [];
    const { data, error } = await supabase
      .from('family_links')
      .select('*')
      .eq('to_id', auth.user.id)
      .eq('stato', 'in_attesa')
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return mapLinksWithProfiles(data, 'from_id', 'relazione_to');
  } catch {
    return [];
  }
}

export async function getSentFamilyRequests() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return [];
    const { data, error } = await supabase
      .from('family_links')
      .select('*')
      .eq('from_id', auth.user.id)
      .eq('stato', 'in_attesa')
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return mapLinksWithProfiles(data, 'to_id', 'relazione_from');
  } catch {
    return [];
  }
}

// Familiari confermati di un utente qualunque (proprio profilo o quello di
// un altro, visto da fuori nel Profilo Social): la relazione mostrata è
// sempre dal punto di vista di userId, non di chi guarda.
export async function getFamily(userId) {
  try {
    const { data, error } = await supabase
      .from('family_links')
      .select('*')
      .eq('stato', 'accettata')
      .or(`from_id.eq.${userId},to_id.eq.${userId}`);
    if (error || !data) return [];
    const others = data.map((r) => (r.from_id === userId ? r.to_id : r.from_id));
    const profilesMap = await fetchProfilesMap(others);
    return data.map((r) => {
      const otherId = r.from_id === userId ? r.to_id : r.from_id;
      const relazione = r.from_id === userId ? r.relazione_from : r.relazione_to;
      return {
        linkId: r.id,
        relazione,
        other: profilesMap.get(otherId) ?? { id: otherId, name: 'Utente', avatar: '' },
      };
    });
  } catch {
    return [];
  }
}
