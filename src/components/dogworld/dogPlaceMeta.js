// Emoji + etichetta + colore per ogni "tipo" di luogo (stesso set di valori
// del CHECK lato database, vedi dog_places_tipo_check): un unico posto da
// cui li leggono sia i marker sulla mappa (DogWorldMap) sia i form/badge
// (DogPlaceSheet, AddDogPlaceModal), per non doverli tenere allineati a mano
// in più file.
export const DOG_PLACE_TYPES = {
  area_cani: { emoji: '🐕', label: 'Area cani', color: '#22c55e' },
  autogrill: { emoji: '⛽', label: 'Autogrill', color: '#f59e0b' },
  hotel: { emoji: '🏨', label: 'Hotel pet-friendly', color: '#3b82f6' },
  spiaggia: { emoji: '🏖️', label: 'Spiaggia', color: '#06b6d4' },
  sentiero: { emoji: '🥾', label: 'Sentiero', color: '#84cc16' },
  rifugio: { emoji: '🛖', label: 'Rifugio', color: '#a855f7' },
};

export function placeTypeMeta(tipo) {
  return DOG_PLACE_TYPES[tipo] ?? { emoji: '📍', label: tipo, color: '#ec4899' };
}

export const CONDIZIONE_META = {
  consigliata: { label: 'Consigliata', color: '#22c55e' },
  ok: { label: 'Nella norma', color: '#f59e0b' },
  degrado: { label: 'In degrado', color: '#ef4444' },
};

export const TAGLIA_LABEL = {
  piccola: 'Taglia piccola',
  grande: 'Taglia grande',
  tutte: 'Tutte le taglie',
};
