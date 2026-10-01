import { isAccountBlocked } from './banStatus';

// Categorie del mondo FAQ (nero): Stanza MOD (solo staff, filtrata via
// getFaqCategories — mai nell'array passato a chi non è owner/moderatore),
// Community (stanza unica utenti + staff, per tutti), Segnalazioni,
// Suggerimenti, Informazioni. Stessa struttura delle altre
// liste categoria (LAVORO_CATEGORIES ecc.), stesso meccanismo di forme sul
// globo (nuvole, vedi App.jsx CATEGORY_SHAPE_BY_WORLD e globe/categoryShell.js).
//
// Anchor distribuiti su tutto il globo, sull'oceano (un riquadro grande su
// terraferma finirebbe sopra ai pallini degli utenti di quella zona): sei
// vertici di un cubo, a latitudine ±35.3° e longitudini a passi di 90°.
// Le quattro categorie che vede ogni utente (Community, Segnalazioni,
// Suggerimenti, Informazioni) stanno su un tetraedro, la disposizione più
// larga possibile per quattro punti (109° l'una dall'altra); Stanza MOD e
// INFO BAN, solo per lo staff, su due vertici liberi del cubo (almeno 70°
// da tutte le altre).
export const FAQ_CATEGORIES = [
  {
    id: 'mod-room',
    label: 'Stanza MOD',
    icon: '🛡️',
    anchor: { lat: -35.3, lng: -20 }, // Atlantico del sud
    aliases: ['stanza mod', 'mod room', 'staff'],
    subfamilies: [],
    staffOnly: true,
  },
  {
    // Stanza unica stile gruppo fra utenti e staff (FaqChatColumn):
    // visibile a chiunque abbia accesso al mondo FAQ.
    id: 'chat',
    label: 'Community',
    icon: '💬',
    anchor: { lat: 35.3, lng: 160 }, // Pacifico del nord
    aliases: ['community', 'comunità', 'chat', 'chat pubblica', 'chat staff', 'parla con lo staff', 'assistenza', 'supporto'],
    subfamilies: [],
  },
  {
    // Chat degli account bloccati con lo staff (InfoBanColumn). La vedono
    // solo gli utenti bloccati (per loro è l'unica categoria) e lo staff;
    // il proprietario vede sempre tutto. Stessa nuvola, scritta rossa.
    id: 'info-ban',
    label: 'INFO BAN',
    icon: '⛔',
    anchor: { lat: -35.3, lng: 160 }, // Mar di Tasman
    aliases: ['info ban', 'ban', 'bloccato', 'account bloccato', 'sblocco'],
    subfamilies: [],
    blockedOrStaffOnly: true,
    labelColor: '#ff3b3b',
  },
  {
    id: 'segnalazioni',
    label: 'Segnalazioni',
    icon: '🚩',
    anchor: { lat: -35.3, lng: 70 }, // Oceano Indiano
    aliases: ['segnalazioni', 'segnala', 'problema', 'bug'],
    subfamilies: [],
  },
  {
    id: 'suggerimenti',
    label: 'Suggerimenti',
    icon: '💡',
    anchor: { lat: 35.3, lng: -20 }, // Atlantico del nord
    aliases: ['suggerimenti', 'idee', 'proposte'],
    subfamilies: [],
  },
  {
    id: 'informazioni',
    label: 'Informazioni',
    icon: 'ℹ️',
    anchor: { lat: -35.3, lng: -110 }, // Pacifico del sud
    aliases: ['informazioni', 'guida', 'aiuto', 'come funziona'],
    subfamilies: [],
  },
];

// Solo le categorie visibili per QUESTO utente (Stanza MOD esclusa per chi
// non è owner/moderatore) — usato ovunque al posto dell'array completo,
// così una categoria nascosta non compare né sul globo né nella lista né
// nella ricerca testuale. Il proprietario (user.ruolo === 'owner') vede
// sempre tutto, qualunque sia il primo argomento.
//
// Account bloccato (non owner): solo INFO BAN. Staff: tutto. Gli altri:
// tutto tranne Stanza MOD e INFO BAN.
export function getFaqCategories(isStaffUser, user = null) {
  if (user?.ruolo === 'owner') return FAQ_CATEGORIES;
  if (isAccountBlocked(user)) return FAQ_CATEGORIES.filter((c) => c.id === 'info-ban');
  if (isStaffUser) return FAQ_CATEGORIES;
  return FAQ_CATEGORIES.filter((c) => !c.staffOnly && !c.blockedOrStaffOnly);
}

export function resolveCategoryQuery(query, categories = FAQ_CATEGORIES) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    categories.find((c) => c.label.toLowerCase() === q || c.aliases.some((a) => a.toLowerCase() === q)) ??
    categories.find((c) => c.label.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q))) ??
    null
  );
}
