// Durate condivise delle transizioni scenografiche ("effetto wow"): un posto
// solo così le fasi successive (warp fra mondi, pannelli olografici) restano
// coordinate fra loro. Vive fuori da components/WorldGlobe.jsx apposta: chi
// ha solo bisogno del numero (es. App.jsx, per sapere quanto aspettare prima
// di aprire un pannello dopo il volo) non deve tirarsi dietro tutto Three.js.
export const CATEGORY_FLY_MS = 1800;

// Fase 2d: quanto dura la dissolvenza in particelle di un pannello categoria
// alla chiusura (X, o ri-click sulla categoria già aperta) — App.jsx tiene
// il pannello montato per questa durata prima di azzerare activeArteCategory
// davvero, così l'animazione (TwoColumnSwitcher.css + ParticleBurst.jsx) fa
// in tempo a finire invece di essere tagliata da uno smontaggio immediato.
export const CATEGORY_CLOSE_MS = 480;
