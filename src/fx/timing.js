// Durate condivise delle transizioni scenografiche ("effetto wow"): un posto
// solo così le fasi successive (warp fra mondi, pannelli olografici) restano
// coordinate fra loro. Vive fuori da components/WorldGlobe.jsx apposta: chi
// ha solo bisogno del numero (es. App.jsx, per sapere quanto aspettare prima
// di aprire un pannello dopo il volo) non deve tirarsi dietro tutto Three.js.
export const CATEGORY_FLY_MS = 1800;
