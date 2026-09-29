// Categorie del mondo Social (Blu). "World" apre il feed
// esistente (colonne, composer, eventi...) — stesso meccanismo a triangoli
// sul globo degli altri mondi, invece del feed sempre aperto di prima.
// Anchor in mezzo all'oceano (non su una città), stesso motivo delle
// categorie di Incontri: un triangolo grande e semi-trasparente su
// terraferma finirebbe sopra ai marker degli utenti di quella zona.
// Le due lettere sono agli antipodi: la V di Verse vicino al centro della
// vista di default del globo (lat 0, lng 0), la prima visibile entrando nel
// mondo Social; la M di World dal lato opposto (scambiate su richiesta).
export const SOCIAL_CATEGORIES = [
  {
    id: 'world',
    label: 'World',
    icon: '🌐',
    anchor: { lat: -2, lng: 172 }, // Oceano Pacifico, lato opposto a Verse
    aliases: ['world', 'mondo', 'feed', 'bacheca', 'social'],
    subfamilies: [],
  },
  // Verse: davanti, agli antipodi della M di World.
  // Logo: V gotica 3D con brillantini (vedi GOTHIC_LETTERS in
  // categoryShell.js); il contenuto arriverà più avanti.
  {
    id: 'verse',
    label: 'Verse',
    icon: '✨',
    anchor: { lat: 2, lng: -8 }, // Oceano Atlantico, al largo dell'Africa occidentale
    aliases: ['verse', 'versemove'],
    subfamilies: [],
  },
];

export function resolveCategoryQuery(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    SOCIAL_CATEGORIES.find(
      (c) => c.label.toLowerCase() === q || c.aliases.some((a) => a.toLowerCase() === q)
    ) ??
    SOCIAL_CATEGORIES.find(
      (c) => c.label.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q))
    ) ??
    null
  );
}
