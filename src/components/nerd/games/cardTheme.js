import { useEffect, useState } from 'react';

// Preferenze personali per i giochi con le carte francesi: mazzo (grafica
// delle carte), tavolo (colore di panno e cornice) e ordinamento della mano
// nel Burraco. Solo lato client, per dispositivo: localStorage, sempre in
// try/catch (privacy mode, storage pieno...). Un piccolo "negozio" comune
// così cambiare mazzo dal pannello 🎨 aggiorna subito tutte le carte già a
// schermo, non solo quelle del componente che l'ha cambiato.

// Larghezze delle carte francesi per taglia (altezza sempre 140/100).
export const CARD_WIDTHS = { xs: 34, sm: 48, md: 64, lg: 80 };

export const DECKS = [
  { id: 'classico', label: 'Classico' },
  { id: 'moderno', label: 'Moderno' },
  { id: 'neon', label: 'Neon' },
];

export const TABLES = [
  { id: 'verde', label: 'Feltro verde', felt: '#1f7a4a', frame: '#6b4423' },
  { id: 'blu', label: 'Blu notte', felt: '#1d3f7a', frame: '#c9a55a' },
  { id: 'bordeaux', label: 'Bordeaux Versemove', felt: '#6e1f2c', frame: '#d6e84a' },
];

const KEYS = { deck: 'vm-cards-deck', table: 'vm-cards-table', sort: 'vm-burraco-sort' };
const DEFAULTS = { deck: 'classico', table: 'verde', sort: 'seme' };
const VALID = {
  deck: DECKS.map((d) => d.id),
  table: TABLES.map((t) => t.id),
  sort: ['seme', 'numero'],
};

function read(name) {
  try {
    const v = localStorage.getItem(KEYS[name]);
    return VALID[name].includes(v) ? v : DEFAULTS[name];
  } catch {
    return DEFAULTS[name];
  }
}

const values = { deck: read('deck'), table: read('table'), sort: read('sort') };
const listeners = new Set();

function setValue(name, value) {
  if (!VALID[name].includes(value) || values[name] === value) return;
  values[name] = value;
  try {
    localStorage.setItem(KEYS[name], value);
  } catch {
    // niente storage: la scelta vale solo fino al ricaricamento
  }
  listeners.forEach((l) => l());
}

function usePreference(name) {
  const [value, setState] = useState(values[name]);
  useEffect(() => {
    const listener = () => setState(values[name]);
    listeners.add(listener);
    listener();
    return () => listeners.delete(listener);
  }, [name]);
  return [value, (v) => setValue(name, v)];
}

export const useCardDeck = () => usePreference('deck');
export const useCardTable = () => usePreference('table');
export const useHandSort = () => usePreference('sort');

// Ordinamento della mano, solo per la vista (il database non cambia).
// Codici carta come in data/burraco.js: "H7", "S10", "SA", "JK".
const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3 };
const isRed = (s) => s === 'H' || s === 'D';

function compareCards(a, b, mode) {
  const ja = a === 'JK';
  const jb = b === 'JK';
  if (ja || jb) return Number(ja) - Number(jb); // jolly sempre in fondo
  const sa = a[0];
  const sb = b[0];
  const ra = RANK_ORDER.indexOf(a.slice(1));
  const rb = RANK_ORDER.indexOf(b.slice(1));
  if (mode === 'numero') {
    return ra - rb || Number(isRed(sa)) - Number(isRed(sb)) || SUIT_ORDER[sa] - SUIT_ORDER[sb];
  }
  return SUIT_ORDER[sa] - SUIT_ORDER[sb] || ra - rb;
}

export function sortHand(cards, mode) {
  return [...cards].sort((a, b) => compareCards(a, b, mode));
}
