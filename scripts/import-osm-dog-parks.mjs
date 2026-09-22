#!/usr/bin/env node
// Importa le aree cani (OpenStreetMap, tag leisure=dog_park) in Italia
// dentro public.dog_places, source='osm'. Va lanciato da un ambiente CON
// accesso a internet (Overpass API) — il sandbox di sviluppo di questa
// sessione lo blocca, per questo lo script esiste ma non è mai stato
// eseguito qui: chi lo lancia deve avere sia rete verso overpass-api.de
// sia la SERVICE ROLE KEY di Supabase (mai quella pubblica: la RLS di
// dog_places blocca esplicitamente source='osm' dal client normale, la
// service role la scavalca di proposito — solo per questo tipo di
// importazione, mai per scrivere per conto di un utente).
//
// Uso:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-osm-dog-parks.mjs
//
// Solo "area_cani" (leisure=dog_park): è l'UNICO dei sei tipi di
// dog_places con un tag OSM affidabile 1:1. Autogrill/hotel/spiaggia/
// sentiero/rifugio "pet-friendly" non hanno un tag OSM equivalente
// affidabile — importarli da qui darebbe falsi positivi/negativi, meglio
// lasciarli agli inserimenti degli utenti o a una fonte dati dedicata.
//
// Idempotente: prima di ogni inserimento controlla se esiste già una riga
// con lo stesso osm_id, per poter rilanciare lo script (es. per prendere
// aree cani aggiunte a OSM dopo il primo giro) senza creare doppioni.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bxcwwtydlaodntvilhik.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('Manca SUPABASE_SERVICE_ROLE_KEY nell\'ambiente. Prendila da Supabase -> Project Settings -> API -> service_role.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Riquadro dell'Italia (compresi isole e confini, con un margine): stesso
// principio di dog_places_in_bbox lato database, solo molto più grande.
// out:json + center per i "way" (l'area disegnata sulla mappa, non un
// punto solo) dà comunque un punto singolo utilizzabile subito.
const OVERPASS_QUERY = `
[out:json][timeout:120];
(
  node["leisure"="dog_park"](35.0,6.0,47.5,19.0);
  way["leisure"="dog_park"](35.0,6.0,47.5,19.0);
);
out center tags;
`;

async function fetchDogParks() {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Le linee guida di Overpass chiedono uno User-Agent identificabile.
      'User-Agent': 'Versemove-DogWorld-Import/1.0 (contatto: vedi repo GitHub Mike-Majic/Versemove)',
    },
    body: 'data=' + encodeURIComponent(OVERPASS_QUERY),
  });
  if (!res.ok) throw new Error(`Overpass ha risposto ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.elements ?? [];
}

// node -> lat/lon diretti; way -> "center" (centroide calcolato da Overpass
// con "out center", non un punto a caso: il migliore approssimante a
// disposizione senza scaricare tutta la geometria del poligono).
function elementLatLng(el) {
  if (el.type === 'node') return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

function elementName(el, index) {
  const t = el.tags ?? {};
  return t.name || t['name:it'] || `Area cani ${index + 1}`;
}

// OSM non tagga in modo affidabile acqua/ombra/illuminazione per le aree
// cani: solo "fenced" (recintata) compare abbastanza spesso da valere la
// pena leggerlo. Gli altri campi restano null, li completeranno le
// recensioni degli utenti (dog_place_reviews).
function elementRecintata(el) {
  const fenced = el.tags?.fenced;
  if (fenced === 'yes') return true;
  if (fenced === 'no') return false;
  return null;
}

async function main() {
  console.log('Interrogo Overpass API per le aree cani in Italia...');
  const elements = await fetchDogParks();
  console.log(`Trovati ${elements.length} elementi OSM con leisure=dog_park.`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const [index, el] of elements.entries()) {
    const osmId = `${el.type}/${el.id}`;
    const pos = elementLatLng(el);
    if (!pos) {
      console.warn(`  [skip] ${osmId}: nessuna posizione utilizzabile.`);
      skipped++;
      continue;
    }

    const { data: existing, error: selectErr } = await supabase
      .from('dog_places')
      .select('id')
      .eq('osm_id', osmId)
      .maybeSingle();
    if (selectErr) {
      console.error(`  [errore] ${osmId}: ${selectErr.message}`);
      errors++;
      continue;
    }
    if (existing) {
      skipped++;
      continue;
    }

    const { error: insertErr } = await supabase.from('dog_places').insert({
      tipo: 'area_cani',
      nome: elementName(el, index),
      descrizione: el.tags?.description ?? null,
      location: `SRID=4326;POINT(${pos.lng} ${pos.lat})`,
      taglia: 'tutte',
      recintata: elementRecintata(el),
      source: 'osm',
      osm_id: osmId,
    });
    if (insertErr) {
      console.error(`  [errore] ${osmId}: ${insertErr.message}`);
      errors++;
      continue;
    }
    inserted++;
    if (inserted % 25 === 0) console.log(`  ...${inserted} inserite finora`);
  }

  console.log(`\nFatto. Inserite: ${inserted} · Già presenti (saltate): ${skipped} · Errori: ${errors}`);
}

main().catch((err) => {
  console.error('Import fallito:', err);
  process.exit(1);
});
