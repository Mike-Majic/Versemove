import { supabase } from './supabaseClient';
import { MAX_DISTANCE_KM } from './geo';

// "Chi vedo" del Profilo Social e del Profilo di Lavoro (tabella
// vista_preferenze): zona, distanza e (solo Social) età. globe_users li
// applica già sul server; qui si leggono, si salvano e si trasformano nel
// vecchio oggetto locationFilters che eventi, annunci e simili si aspettano.

// Avviso a chi mostra dati filtrati (App.jsx ricarica preferenze e utenti
// del globo).
export const VISTA_SAVED_EVENT = 'vm:vista-saved';

export async function getVistaPreferenze() {
  try {
    const { data, error } = await supabase.rpc('get_vista_preferenze');
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

// ambito: 'social' | 'lavoro'. Il server riscrive TUTTI i campi: vanno
// passati sempre tutti (distanza_km null = ovunque, geo null = la mia città).
export async function saveVistaPreferenze(ambito, prefs) {
  try {
    const { error } = await supabase.rpc('save_vista_preferenze', { p_ambito: ambito, p: prefs });
    if (error) return { error: error.message };
    window.dispatchEvent(new CustomEvent(VISTA_SAVED_EVENT, { detail: { ambito } }));
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Stessa forma dei vecchi filtri "Luogo" delle Impostazioni, costruita dal
// centro delle preferenze (zona scelta o la propria città).
export const EMPTY_LOCATION_FILTERS = { continent: '', region: '', city: '', distance: MAX_DISTANCE_KM };

export function locationFiltersFrom(pref) {
  const centro = pref?.centro;
  if (!centro) return { ...EMPTY_LOCATION_FILTERS, distance: pref?.distanza_km ?? MAX_DISTANCE_KM };
  return {
    continent: '',
    region: '',
    city: centro.nome ?? '',
    geonameId: centro.geoname_id ?? null,
    lat: centro.lat ?? null,
    lng: centro.lng ?? null,
    distance: pref.distanza_km ?? MAX_DISTANCE_KM,
  };
}
