// Nome/tagline di un mondo nella lingua attuale, con ripiego sul valore
// italiano già presente in worlds.js se manca una chiave di traduzione
// (es. un mondo nuovissimo non ancora tradotto) — mai un testo vuoto o
// una chiave grezza a schermo. Copre solo i punti DOM/JSX "piatti" (liste
// a checkbox, etichette nella topbar...): le etichette disegnate SUL
// globo 3D (satelliti, triangoli categoria — vedi globe/categoryShell.js,
// globe/satelliteGlobes.js) restano in italiano per ora, sono texture
// generate una sola volta al montaggio, non reattive al cambio lingua —
// un lavoro a parte.
export function translateWorld(t, world) {
  return {
    label: t(`worlds.${world.id}.label`, world.label),
    tagline: t(`worlds.${world.id}.tagline`, world.tagline),
  };
}
