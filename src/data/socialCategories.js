// Categorie del mondo Social (Blu). "move" (id storico 'world', tenuto per
// preferiti e link già salvati; nome tutto minuscolo su richiesta) apre il feed
// esistente (colonne, composer, eventi...) — stesso meccanismo a triangoli
// sul globo degli altri mondi, invece del feed sempre aperto di prima.
// Anchor in mezzo all'oceano (non su una città), stesso motivo delle
// categorie di Incontri: un triangolo grande e semi-trasparente su
// terraferma finirebbe sopra ai marker degli utenti di quella zona.
// Le due lettere 3D sono agli antipodi e restano ferme: la V vicino al
// centro della vista di default del globo (lat 0, lng 0), la prima visibile
// entrando nel mondo Social, e la M dal lato opposto. Su richiesta la V è
// di "move" (il feed) e la M di "Verse" (vedi GOTHIC_LETTERS in
// categoryShell.js).
export const SOCIAL_CATEGORIES = [
  {
    id: 'world',
    label: 'move',
    icon: '🌐',
    anchor: { lat: 2, lng: -8 }, // Oceano Atlantico, al largo dell'Africa occidentale
    aliases: ['move', 'world', 'mondo', 'feed', 'bacheca', 'social'],
    subfamilies: [],
  },
  // Verse: dietro, agli antipodi di move, con la M gotica 3D; il contenuto
  // arriverà più avanti.
  {
    id: 'verse',
    label: 'Verse',
    icon: '✨',
    anchor: { lat: -2, lng: 172 }, // Oceano Pacifico, lato opposto a move
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
