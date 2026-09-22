// Nome di una categoria (lista sotto al mondo, vedi App.jsx) nella lingua
// attuale, con ripiego sul valore italiano già in <world>Categories.js se
// manca una chiave di traduzione — stesso pattern di translateWorld
// (worldLabels.js). Per ora tradotte solo le categorie del mondo Vetrina
// (richiesta esplicita); le altre restano in italiano finché non arrivano
// le rispettive chiavi in categories.<worldId>.<categoryId>. Le etichette
// disegnate SUL globo 3D (triangoli/forme categoria) restano comunque in
// italiano: sono texture generate una sola volta al montaggio, non
// reattive al cambio lingua — un lavoro a parte, stesso limite di
// translateWorld.
export function translateCategoryLabel(t, worldId, category) {
  return t(`categories.${worldId}.${category.id}`, category.label);
}
