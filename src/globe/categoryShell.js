import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

// Stessa formula di conversione lat/lng -> vettore usata da three-globe (vedi networkOverlay.js).
function polarToVector(lat, lng, radius = 1) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lng) * Math.PI) / 180;
  const sinPhi = Math.sin(phi);
  return new THREE.Vector3(radius * sinPhi * Math.cos(theta), radius * Math.cos(phi), radius * sinPhi * Math.sin(theta));
}

// Inversa di polarToVector: dato un vettore unitario, la lat/lng corrispondente.
// Serve a far volare la camera esattamente sul centro del triangolo assegnato a
// una categoria, che in genere non coincide con la sua "anchor" originale (la
// categoria viene agganciata al triangolo più vicino, non esattamente a quel punto).
function vectorToPolar(v) {
  const n = v.clone().normalize();
  const phi = Math.acos(Math.max(-1, Math.min(1, n.y)));
  const theta = Math.atan2(n.z, n.x);
  return { lat: 90 - (phi * 180) / Math.PI, lng: 90 - (theta * 180) / Math.PI };
}

// Più categorie ci sono, più i triangoli devono essere piccoli per farcele stare
// tutte in modo leggibile: si passa a un icosaedro più suddiviso (più facce, più
// piccole) man mano che il numero di categorie cresce. Il minimo è 80 facce
// (non 20) anche per i mondi con pochissime categorie (es. Incontri): un
// mondo con 1-2 categorie non deve avere triangoli enormi rispetto a un
// mondo con 9-10, devono restare della stessa dimensione ovunque.
function pickDetailLevel(categoryCount) {
  if (categoryCount <= 20) return 1; // 80 facce
  return 2; // 320 facce
}

// Rimpicciolisce ogni vertice verso il centro (raw, non normalizzato) del suo
// triangolo e lo riproietta sulla sfera: la dimensione del triangolo dipende
// solo da questo fattore, e non va confusa con la distanza dalle categorie
// vicine (quella è gestita a parte, scegliendo facce non adiacenti).
const TRIANGLE_SHRINK = 0.8;
function shrinkVertex(v, rawCentroid, radius) {
  return v.clone().sub(rawCentroid).multiplyScalar(TRIANGLE_SHRINK).add(rawCentroid).normalize().multiplyScalar(radius);
}

// Sagoma di un UFO (disco + cupola), presa "solo la forma" da un'immagine di
// riferimento — nessun dettaglio (finestrini, luci) né colore, quella resta
// sempre quella della categoria (vedi material sotto). Disegnata in un
// piano locale 2D, x in [-1, 1]: la si scala e orienta poi per farla stare
// esattamente dove stava il triangolo che sostituisce (vedi placeShape).
function buildUfoShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-1, -0.05);
  // Pancia del disco (curva verso il basso) da punta sinistra a punta destra.
  shape.bezierCurveTo(-0.5, -0.3, 0.5, -0.3, 1, -0.05);
  // Bordo superiore del disco, punta destra -> base destra della cupola.
  shape.quadraticCurveTo(0.97, 0.02, 0.85, 0.05);
  shape.quadraticCurveTo(0.62, 0.08, 0.42, 0.09);
  // Cupola.
  shape.bezierCurveTo(0.38, 0.45, -0.38, 0.45, -0.42, 0.09);
  // Base sinistra della cupola -> punta sinistra.
  shape.quadraticCurveTo(-0.62, 0.08, -0.85, 0.05);
  shape.quadraticCurveTo(-0.97, 0.02, -1, -0.05);
  shape.closePath();
  return shape;
}

// Sagoma di una nuvoletta (mondo FAQ): contorno "a gobbe" chiuso da curve di
// Bézier, stesso principio delle altre sagome ("solo la forma", nessun
// dettaglio interno — colore/opacità restano quelli della categoria).
function buildCloudShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.9, -0.15);
  shape.bezierCurveTo(-1.05, -0.15, -1.05, 0.15, -0.85, 0.2);
  shape.bezierCurveTo(-0.9, 0.55, -0.5, 0.65, -0.3, 0.45);
  shape.bezierCurveTo(-0.15, 0.75, 0.35, 0.75, 0.45, 0.45);
  shape.bezierCurveTo(0.75, 0.55, 0.95, 0.3, 0.8, 0.05);
  shape.bezierCurveTo(1.05, -0.05, 1.0, -0.35, 0.7, -0.35);
  shape.bezierCurveTo(0.6, -0.5, -0.6, -0.5, -0.7, -0.35);
  shape.bezierCurveTo(-0.85, -0.4, -0.95, -0.3, -0.9, -0.15);
  shape.closePath();
  return shape;
}

// Sagoma di un cuore (mondo Incontri): curva parametrica classica
// (x=16sin³t, y=13cos t − 5cos2t − 2cos3t − cos4t), campionata e poi
// normalizzata a un riquadro [-1,1] come le altre sagome, così tutte
// condividono la stessa logica di scala in placeShapeOnSphere.
function buildHeartShape() {
  const points = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    points.push([x, y]);
  }
  const maxX = Math.max(...points.map((p) => Math.abs(p[0])));
  const maxY = Math.max(...points.map((p) => Math.abs(p[1])));
  const scale = 1 / Math.max(maxX, maxY);
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => {
    const px = x * scale;
    const py = y * scale;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  });
  shape.closePath();
  return shape;
}

// Sagoma di una valigetta ventiquattrore (mondo Lavoro): corpo rettangolare
// con angoli smussati e una maniglia ad arco sopra, col "buco" della presa
// come foro interno (shape.holes) — senza il foro si leggerebbe come due
// bozzi invece che come una maniglia.
function buildBriefcaseShape() {
  const shape = new THREE.Shape();
  const left = -1;
  const right = 1;
  const top = 0.25;
  const bottom = -0.65;
  const r = 0.1;
  const handleLeft = -0.32;
  const handleRight = 0.32;
  const handleTop = 0.58;

  shape.moveTo(left + r, bottom);
  shape.lineTo(right - r, bottom);
  shape.quadraticCurveTo(right, bottom, right, bottom + r);
  shape.lineTo(right, top - r);
  shape.quadraticCurveTo(right, top, right - r, top);
  shape.lineTo(handleRight, top);
  shape.lineTo(handleRight, handleTop - 0.06);
  shape.quadraticCurveTo(handleRight, handleTop, handleRight - 0.07, handleTop);
  shape.lineTo(handleLeft + 0.07, handleTop);
  shape.quadraticCurveTo(handleLeft, handleTop, handleLeft, handleTop - 0.06);
  shape.lineTo(handleLeft, top);
  shape.lineTo(left + r, top);
  shape.quadraticCurveTo(left, top, left, top - r);
  shape.lineTo(left, bottom + r);
  shape.quadraticCurveTo(left, bottom, left + r, bottom);
  shape.closePath();

  const hole = new THREE.Path();
  const holeLeft = handleLeft + 0.11;
  const holeRight = handleRight - 0.11;
  const holeBottom = top + 0.05;
  const holeTop = handleTop - 0.1;
  hole.moveTo(holeLeft, holeBottom);
  hole.lineTo(holeRight, holeBottom);
  hole.lineTo(holeRight, holeTop);
  hole.lineTo(holeLeft, holeTop);
  hole.closePath();
  shape.holes.push(hole);

  return shape;
}

// Sagome per il mondo Annunci (arancione): una forma diversa PER CATEGORIA
// (non una sola per tutto il mondo come altrove, e non a rotazione
// sull'indice come Bambini — qui la forma segue proprio il NOME della
// categoria, richiesta esplicita: "se la categoria si chiama auto, la
// forma dell'auto"). Vedi buildCategoryFaceShape più sotto per lo switch
// per categoryId. Un contorno per volta, "solo la forma" come le altre:
// nessun dettaglio a colore diverso, quello resta il colore del mondo.

// Auto: corpo (cofano+abitacolo+baule) con due ruote "ritagliate" (buchi
// che sporgono sotto il bordo inferiore, quindi tagliano solo una mezzaluna
// visibile — lo stesso trucco delle ruote in un'icona flat).
function buildCarShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.9, -0.32);
  shape.lineTo(-0.9, -0.05);
  shape.quadraticCurveTo(-0.75, -0.05, -0.62, 0.08);
  shape.lineTo(-0.42, 0.3);
  shape.quadraticCurveTo(-0.32, 0.4, -0.15, 0.4);
  shape.lineTo(0.25, 0.4);
  shape.quadraticCurveTo(0.4, 0.4, 0.48, 0.28);
  shape.lineTo(0.62, 0.08);
  shape.quadraticCurveTo(0.72, -0.05, 0.9, -0.05);
  shape.lineTo(0.9, -0.32);
  shape.quadraticCurveTo(0.9, -0.4, 0.82, -0.4);
  shape.lineTo(-0.82, -0.4);
  shape.quadraticCurveTo(-0.9, -0.4, -0.9, -0.32);
  shape.closePath();

  const wheelL = new THREE.Path();
  wheelL.absarc(-0.5, -0.4, 0.19, 0, Math.PI * 2, false);
  shape.holes.push(wheelL);
  const wheelR = new THREE.Path();
  wheelR.absarc(0.5, -0.4, 0.19, 0, Math.PI * 2, false);
  shape.holes.push(wheelR);

  return shape;
}

// Moto: corpo basso (sella+serbatoio) con un manubrio stilizzato che sporge
// a destra, due ruote ritagliate come nell'auto ma più separate e in basso.
function buildMotoShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.85, -0.22);
  shape.quadraticCurveTo(-0.85, -0.05, -0.6, 0.0);
  shape.lineTo(-0.1, 0.08);
  shape.quadraticCurveTo(0.15, 0.12, 0.25, 0.3);
  shape.quadraticCurveTo(0.32, 0.42, 0.42, 0.32);
  shape.quadraticCurveTo(0.48, 0.25, 0.4, 0.15);
  shape.lineTo(0.3, 0.02);
  shape.quadraticCurveTo(0.55, -0.02, 0.75, -0.15);
  shape.quadraticCurveTo(0.85, -0.2, 0.85, -0.3);
  shape.lineTo(0.5, -0.3);
  shape.quadraticCurveTo(0.3, -0.24, 0.0, -0.26);
  shape.lineTo(-0.5, -0.3);
  shape.lineTo(-0.85, -0.3);
  shape.closePath();

  const wheelL = new THREE.Path();
  wheelL.absarc(-0.62, -0.32, 0.24, 0, Math.PI * 2, false);
  shape.holes.push(wheelL);
  const wheelR = new THREE.Path();
  wheelR.absarc(0.62, -0.32, 0.24, 0, Math.PI * 2, false);
  shape.holes.push(wheelR);

  return shape;
}

// Un anello (cerchio cavo): base per le ruote della bicicletta, uno spesso
// "bastoncino" fra due punti: base per il telaio. Robusti e semplici (niente
// giunti da calcolare come in offsetPolyline), a differenza della M o del
// nastro sotto, qui il contorno può restare aperto in più pezzi separati —
// vedi buildBikeShape, che infatti restituisce un ARRAY di sagome invece di
// una sola (THREE.ShapeGeometry accetta anche un array, le unisce in una
// sola geometria).
function buildRingShape(cx, cy, r, thickness) {
  const shape = new THREE.Shape();
  shape.absarc(cx, cy, r, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(cx, cy, r - thickness, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}
function buildBarShape(x1, y1, x2, y2, width) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * (width / 2);
  const ny = (dx / len) * (width / 2);
  const shape = new THREE.Shape();
  shape.moveTo(x1 + nx, y1 + ny);
  shape.lineTo(x2 + nx, y2 + ny);
  shape.lineTo(x2 - nx, y2 - ny);
  shape.lineTo(x1 - nx, y1 - ny);
  shape.closePath();
  return shape;
}

// Bicicletta: due ruote (anelli) + telaio a rombo fatto di quattro
// "bastoncini" (sella-manubrio, manubrio-ruota davanti, ruota dietro-pedale,
// pedale-ruota davanti) — un array di 6 sagome invece di una sola.
function buildBikeShape() {
  const wheelL = buildRingShape(-0.55, -0.12, 0.32, 0.09);
  const wheelR = buildRingShape(0.55, -0.12, 0.32, 0.09);
  const seatTube = buildBarShape(-0.55, -0.12, 0.05, 0.42, 0.09);
  const topTube = buildBarShape(0.05, 0.42, 0.55, -0.12, 0.09);
  const downTube = buildBarShape(-0.55, -0.12, 0.3, -0.05, 0.09);
  const chainStay = buildBarShape(0.3, -0.05, 0.55, -0.12, 0.09);
  return [wheelL, wheelR, seatTube, topTube, downTube, chainStay];
}

// Barca: scafo a mezzaluna + albero (un bastoncino sottile) + vela
// triangolare — tre sagome separate, come la bicicletta.
function buildBoatShape() {
  const hull = new THREE.Shape();
  hull.moveTo(-0.95, -0.15);
  hull.quadraticCurveTo(-0.55, -0.4, 0.1, -0.38);
  hull.quadraticCurveTo(0.65, -0.36, 0.95, -0.12);
  hull.quadraticCurveTo(0.6, -0.05, 0.0, -0.03);
  hull.quadraticCurveTo(-0.5, -0.02, -0.95, -0.15);
  hull.closePath();

  const mast = buildBarShape(-0.05, -0.05, -0.05, 0.55, 0.045);

  const sail = new THREE.Shape();
  sail.moveTo(-0.03, 0.55);
  sail.lineTo(0.45, 0.0);
  sail.lineTo(-0.03, -0.02);
  sail.closePath();

  return [hull, mast, sail];
}

// Casa: sagoma a "pentagono" (corpo + tetto a punta) classica, con un buco
// rettangolare per la porta.
function buildHouseShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.75, -0.55);
  shape.lineTo(-0.75, 0.05);
  shape.lineTo(-1.0, 0.05);
  shape.lineTo(0, 0.7);
  shape.lineTo(1.0, 0.05);
  shape.lineTo(0.75, 0.05);
  shape.lineTo(0.75, -0.55);
  shape.closePath();

  const door = new THREE.Path();
  door.moveTo(-0.18, -0.55);
  door.lineTo(-0.18, -0.05);
  door.lineTo(0.18, -0.05);
  door.lineTo(0.18, -0.55);
  door.closePath();
  shape.holes.push(door);

  return shape;
}

// Maglietta (categoria Abbigliamento/Accessori): scollo, due maniche corte,
// tacche sotto le ascelle, orlo dritto in basso.
function buildShirtShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.3, 0.55);
  shape.lineTo(-0.65, 0.35);
  shape.lineTo(-0.95, 0.05);
  shape.lineTo(-0.68, -0.2);
  shape.lineTo(-0.5, -0.05);
  shape.lineTo(-0.5, -0.65);
  shape.lineTo(0.5, -0.65);
  shape.lineTo(0.5, -0.05);
  shape.lineTo(0.68, -0.2);
  shape.lineTo(0.95, 0.05);
  shape.lineTo(0.65, 0.35);
  shape.lineTo(0.3, 0.55);
  shape.quadraticCurveTo(0.15, 0.4, 0, 0.4);
  shape.quadraticCurveTo(-0.15, 0.4, -0.3, 0.55);
  shape.closePath();
  return shape;
}

// Scatola con fiocco (categoria Oggetti vari, un generico "pacco/regalo"
// per tutto ciò che non rientra nelle altre categorie): corpo rettangolare
// con un doppio anello stilizzato sopra, come un fiocco.
function buildBoxShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.8, -0.6);
  shape.lineTo(0.8, -0.6);
  shape.lineTo(0.8, 0.1);
  shape.lineTo(0.35, 0.1);
  shape.lineTo(0.35, 0.35);
  shape.quadraticCurveTo(0.35, 0.55, 0.15, 0.55);
  shape.quadraticCurveTo(0, 0.55, 0, 0.35);
  shape.quadraticCurveTo(0, 0.55, -0.15, 0.55);
  shape.quadraticCurveTo(-0.35, 0.55, -0.35, 0.35);
  shape.lineTo(-0.35, 0.1);
  shape.lineTo(-0.8, 0.1);
  shape.closePath();
  return shape;
}

// Ispessisce una spezzata aperta (array di THREE.Vector2) di "width" unità,
// un lato alla volta (side = 1 o -1): normale perpendicolare al segmento a
// ogni estremo, media delle due normali (giunto a becco d'anatra) nei punti
// interni — la lunghezza del becco viene limitata (clamp) perché due
// segmenti quasi opposti (angolo molto acuto) non lo mandino all'infinito.
// Le due estremità aperte restano tagliate dritte (perpendicolari
// all'ultimo segmento), non arrotondate: va benissimo per i tratti di una
// lettera, che terminano dritti sulla riga di base.
function offsetPolyline(points, width, side, miterClamp = 0.6) {
  const n = points.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    let normal;
    if (i === 0) {
      const dir = points[1].clone().sub(points[0]).normalize();
      normal = new THREE.Vector2(-dir.y, dir.x);
    } else if (i === n - 1) {
      const dir = points[n - 1].clone().sub(points[n - 2]).normalize();
      normal = new THREE.Vector2(-dir.y, dir.x);
    } else {
      const dir1 = points[i].clone().sub(points[i - 1]).normalize();
      const dir2 = points[i + 1].clone().sub(points[i]).normalize();
      const n1 = new THREE.Vector2(-dir1.y, dir1.x);
      const n2 = new THREE.Vector2(-dir2.y, dir2.x);
      normal = n1.clone().add(n2).normalize();
      normal.multiplyScalar(1 / Math.max(normal.dot(n1), miterClamp));
    }
    out.push(points[i].clone().addScaledVector(normal, (width / 2) * side));
  }
  return out;
}

// Un "nastro" (contorno cavo, non pieno) lungo una spezzata: il bordo
// esterno andata + il bordo interno ritorno, chiuso — esattamente il
// linguaggio del logo di riferimento (tratti doppi, si vede "attraverso"
// la lettera), non un blocco pieno come i primi due tentativi.
function ribbonShape(points, width) {
  const outer = offsetPolyline(points, width, 1);
  const inner = offsetPolyline(points, width, -1);
  const s = new THREE.Shape();
  s.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i++) s.lineTo(outer[i].x, outer[i].y);
  for (let i = inner.length - 1; i >= 0; i--) s.lineTo(inner[i].x, inner[i].y);
  s.closePath();
  return s;
}

// Sagoma di una "M" (mondo Social), terza versione — le prime due (blocco
// con tacca, poi pilastri+V pieni) erano venute male entrambe: il problema
// non era la forma ma il RIEMPIMENTO. Il logo di riferimento mandato
// dall'utente è un contorno CAVO (un nastro), non un blocco pieno — da qui
// il nastro sopra, seguito da un'unica spezzata a zig-zag (basso-sinistra,
// punta sinistra, valle, punta destra, basso-destra): i giunti interni
// (le due punte in alto e la valle) diventano da soli degli angoli netti
// col metodo del "becco d'anatra" sopra, senza doverli disegnare a mano
// pezzo per pezzo. Più piccola e più spessa della versione precedente,
// richiesta esplicita ("ridimensionalo un po, fallo più spesso").
function buildLetterMShape() {
  const points = [
    new THREE.Vector2(-0.62, -0.7), // base sinistra
    new THREE.Vector2(-0.67, 0.62), // punta sinistra
    new THREE.Vector2(0, -0.13), // valle centrale
    new THREE.Vector2(0.67, 0.62), // punta destra
    new THREE.Vector2(0.62, -0.7), // base destra
  ];
  return ribbonShape(points, 0.44);
}

// Stella a 5 punte (mondo Intrattenimento): poligono standard, raggio
// esterno/interno alternati.
function buildStarShape(spikes = 5, outerRadius = 1, innerRadius = 0.42) {
  const shape = new THREE.Shape();
  const step = Math.PI / spikes;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = i * step - Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

// Cerchio e poligono regolare (quadrato/triangolo/pentagono/esagono):
// primitive di base per il mondo Bambini, che usa una forma diversa (e un
// colore diverso, vedi KIDS_PALETTE) per ogni categoria invece di una sola
// sagoma fissa per tutto il mondo.
function buildCircleShape(radius = 1) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
  return shape;
}
function buildRegularPolygonShape(sides, radius = 1) {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / sides;
  for (let i = 0; i < sides; i++) {
    const angle = i * step - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

// Rotazione di forme e colori per il mondo Bambini: ogni categoria prende
// la forma e il colore al suo indice (a ciclo, se le categorie sono più
// delle forme), così restano ben distinte l'una dall'altra — richiesta
// esplicita ("è un mondo per bambini").
const KIDS_SHAPES = [
  () => buildCircleShape(),
  () => buildRegularPolygonShape(4),
  () => buildRegularPolygonShape(3),
  () => buildStarShape(),
  () => buildRegularPolygonShape(5),
  () => buildRegularPolygonShape(6),
];
// Colori pieni e saturi (fragola, arancio, limone, menta, azzurro, viola,
// rosa): sul fondo nero del globo i vecchi toni semitrasparenti risultavano
// spenti, questi si vedono bene anche sul lato in ombra (vedi il materiale
// "vivace" in buildCategoryShell).
const KIDS_PALETTE = ['#FF4D6D', '#FF9F1C', '#FFD60A', '#2EE59D', '#3A86FF', '#9D4EDD', '#FF5DCF'];

// Alone morbido dietro ogni forma del mondo Bambini: una sola texture
// radiale condivisa da tutti gli sprite (il colore lo dà il materiale).
let glowTextureCache;
function getGlowTexture() {
  if (glowTextureCache) return glowTextureCache;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(0.65, 'rgba(255,255,255,0.12)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  glowTextureCache = new THREE.CanvasTexture(canvas);
  glowTextureCache.minFilter = THREE.LinearFilter;
  return glowTextureCache;
}

// Parametri di "vita" delle forme del mondo Bambini: pulsazione di scala
// 1 -> 1.06 -> 1 ogni ~2.5 s (sfasata per forma), leggero galleggiamento
// lungo la normale, e all'hover/selezione scala 1.15 con alone più forte.
const VIVID_PULSE_AMOUNT = 0.06;
const VIVID_PULSE_PERIOD_S = 2.5;
const VIVID_FLOAT_AMOUNT = 0.9;
const VIVID_FLOAT_PERIOD_S = 3.4;
const VIVID_HOVER_SCALE = 1.15;
const VIVID_OPACITY = 0.95;
const VIVID_GLOW_OPACITY = 0.55;
const VIVID_GLOW_OPACITY_HOVER = 0.95;
const VIVID_GLOW_SIZE = 3.2;
const VIVID_EDGE_WIDTH_PX = 2.5;
// Le forme vivaci stanno sopra al guscio a rete del globo (raggio 128, vedi
// networkOverlay.js buildNetworkShell), non sotto come i triangoli storici
// (122.6): le linee della rete, disegnate prima e con il depth test, si
// stampavano come righe scure sopra alle forme piene. Con il galleggiamento
// (±VIVID_FLOAT_AMOUNT) il minimo resta comunque sopra i 128.
const VIVID_SURFACE_LIFT = 8;
const VIVID_RENDER_ORDER = 1;

// Sceglie geometria (e per il mondo Bambini, colore) in base a shapeType e
// all'indice della categoria dentro il proprio mondo — un unico punto da
// cui WorldGlobe.jsx decide "che forma ha questo mondo", vedi sotto.
function buildCategoryFaceShape(shapeType, index, categoryId) {
  switch (shapeType) {
    case 'ufo':
      return { shape: buildUfoShape(), color: null };
    case 'heart':
      return { shape: buildHeartShape(), color: null };
    case 'briefcase':
      return { shape: buildBriefcaseShape(), color: null };
    case 'letterM':
      return { shape: buildLetterMShape(), color: null };
    case 'star':
      return { shape: buildStarShape(), color: null };
    case 'cloud':
      // La Stanza MOD (solo staff, vedi faqCategories.js) resta una nuvola
      // ROSSA distinta dalle altre nuvole grigie/bianche del mondo FAQ —
      // unica eccezione colore in questo mondo, richiesta esplicita.
      return { shape: buildCloudShape(), color: categoryId === 'mod-room' ? '#ff3b30' : null };
    case 'kids':
      return {
        shape: KIDS_SHAPES[index % KIDS_SHAPES.length](),
        color: KIDS_PALETTE[index % KIDS_PALETTE.length],
      };
    case 'annunci':
      // Qui la forma segue il NOME della categoria (categoryId), non
      // l'indice: ogni categoria del mondo Annunci ha la propria sagoma
      // dedicata, non una condivisa da tutto il mondo.
      switch (categoryId) {
        case 'auto':
          return { shape: buildCarShape(), color: null };
        case 'moto':
          return { shape: buildMotoShape(), color: null };
        case 'biciclette':
          return { shape: buildBikeShape(), color: null };
        case 'barche':
          return { shape: buildBoatShape(), color: null };
        case 'case':
          return { shape: buildHouseShape(), color: null };
        case 'abbigliamento':
          return { shape: buildShirtShape(), color: null };
        case 'oggetti-vari':
          return { shape: buildBoxShape(), color: null };
        default:
          return null;
      }
    default:
      return null; // triangolo, gestito a parte (non è una THREE.Shape 2D)
  }
}

// Trasforma la geometria piatta di una sagoma 2D (x/y locali, z=0) perché
// stia tangente alla sfera nello stesso punto/della stessa dimensione
// occupata dal triangolo che sostituisce: centro in shapeCenter (sulla
// sfera, come il triangolo), assi locali (right/up) tangenti alla sfera in
// quel punto, scala = ingombro medio del triangolo originale dal suo
// centro (così la sagoma non risulta né minuscola né sproporzionata), più
// un piccolo distacco lungo la normale per non litigare (z-fighting) con
// guscio/nucleo sotto.
const SHAPE_SURFACE_OFFSET = 0.6;
function placeShapeOnSphere(geometry, normal, shapeCenter, scale) {
  const worldUp = Math.abs(normal.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(worldUp, normal).normalize();
  const up = new THREE.Vector3().crossVectors(normal, right).normalize();
  const basis = new THREE.Matrix4().makeBasis(right, up, normal);
  geometry.scale(scale, scale, 1);
  geometry.applyMatrix4(basis);
  geometry.translate(
    shapeCenter.x + normal.x * SHAPE_SURFACE_OFFSET,
    shapeCenter.y + normal.y * SHAPE_SURFACE_OFFSET,
    shapeCenter.z + normal.z * SHAPE_SURFACE_OFFSET
  );
  geometry.computeVertexNormals();
  return geometry;
}

// Tra tutti i punti in cui si può spezzare il testo in due (a uno spazio),
// sceglie quello che bilancia meglio le due righe (minimizza la più larga
// delle due), invece di riempire la prima riga fino al massimo consentito.
function bestTwoLineSplit(ctx, words) {
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const line1 = words.slice(0, i).join(' ');
    const line2 = words.slice(i).join(' ');
    const worst = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width);
    if (!best || worst < best.worst) best = { line1, line2, worst };
  }
  return best;
}

// Un'etichetta troppo larga per stare comoda su una riga va a capo (mai più
// di due righe): si spezza solo se necessario, per non spezzare inutilmente
// le etichette corte.
function wrapLabelLines(ctx, text, singleLineMax) {
  if (ctx.measureText(text).width <= singleLineMax) return [text];
  const words = text.split(' ');
  if (words.length === 1) return [text];
  const { line1, line2 } = bestTwoLineSplit(ctx, words);
  return [line1, line2];
}

// Etichetta come sprite: tenendo il testo su un piano che guarda sempre la camera,
// resta dritto e leggibile a prescindere da come ruota il mondo. Uno sfondo scuro
// dietro al testo garantisce contrasto anche sopra ai puntini dei continenti. Il
// canvas si allarga quanto serve al testo (mai più stretto di prima, per le
// etichette corte): niente viene mai tagliato ai bordi.
// textColor: colore del testo (default bianco); il satellite di un mondo
// disattivato usa un grigio spento (vedi satelliteGlobes.js).
// options.pill: sfondo a pillola chiaro (bianco) con testo scuro e un
// sottile bordo del colore della forma, al posto del riquadro grigio scuro
// — usato dal mondo Bambini per restare leggibile accanto a forme accese.
export function makeLabelSprite(text, spriteScale, textColor = '#ffffff', options = {}) {
  const pill = Boolean(options.pill);
  const pillColor = options.pillColor ?? '#ffffff';
  const pillBorder = options.pillBorder ?? null;
  const resolvedTextColor = pill ? (options.pillTextColor ?? '#1b1233') : textColor;
  const canvasScale = 4;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const baseFont = '800 32px system-ui, -apple-system, sans-serif';
  const lineHeight = 36;
  const padX = 14;
  const padY = 8;
  const singleLineMax = 260;
  const minCanvasW = 240;

  // Font misurabile subito: measureText non dipende dalle dimensioni del canvas.
  ctx.font = baseFont;
  const lines = wrapLabelLines(ctx, text, singleLineMax);
  const contentWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));

  const canvasW = Math.max(minCanvasW, Math.ceil(contentWidth + padX * 2 + 20));
  const canvasH = lines.length > 1 ? 100 : 64;
  canvas.width = canvasW * canvasScale;
  canvas.height = canvasH * canvasScale;
  // Ridimensionare il canvas ne resetta bitmap e stato: vanno riapplicati.
  ctx.scale(canvasScale, canvasScale);
  ctx.font = baseFont;

  const centerX = canvasW / 2;
  const boxW = contentWidth + padX * 2;
  const boxH = lines.length * lineHeight + padY * 2;
  const boxX = centerX - boxW / 2;
  const boxY = canvasH / 2 - boxH / 2;
  const radius = pill ? boxH / 2 : 10;

  ctx.beginPath();
  ctx.moveTo(boxX + radius, boxY);
  ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, radius);
  ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, radius);
  ctx.arcTo(boxX, boxY + boxH, boxX, boxY, radius);
  ctx.arcTo(boxX, boxY, boxX + boxW, boxY, radius);
  ctx.closePath();
  ctx.fillStyle = pill ? pillColor : 'rgba(6, 4, 12, 0.78)';
  ctx.fill();
  if (pill && pillBorder) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = pillBorder;
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = resolvedTextColor;
  const startY = canvasH / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, centerX, startY + i * lineHeight));

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  const aspect = canvas.width / canvas.height;
  // Il testo deve restare della stessa dimensione (in mondo) qualunque sia la
  // larghezza/altezza del canvas: si scala l'altezza dello sprite in proporzione
  // a quanto è cresciuto il canvas, invece di tenerla fissa a spriteScale
  // (l'aspect ratio propaga automaticamente la stessa scala alla larghezza).
  const effectiveScale = spriteScale * (canvasH / 64);
  sprite.scale.set(effectiveScale * aspect, effectiveScale, 1);
  return { sprite, material, texture };
}

// Incastona una categoria per ogni triangolo del guscio: lo riempie di colore
// semi-trasparente e ci mette sopra l'etichetta. Ogni categoria viene agganciata
// al triangolo più vicino alla sua posizione lat/lng "anchor" (fra quelli non
// ancora presi e non adiacenti a una categoria già assegnata: si lascia sempre
// almeno una faccia vuota di margine, così restano nettamente staccate, senza
// dover rimpicciolire ulteriormente i triangoli), così la stessa coordinata
// può essere riusata per centrare la camera (vedi App.jsx).
//
// marginRings: quante "corone" di facce vicine restano bloccate attorno a
// ogni categoria appena piazzata (1 = solo i vicini diretti, il default
// storico; 2 = anche i vicini dei vicini, il doppio dello spazio libero fra
// due categorie). Usato dal mondo Annunci, che con poche categorie (7 su
// almeno 80 facce) ha ampiamente spazio per stare più larghe — richiesta
// esplicita ("le categorie le vedo troppo vicine").
export function buildCategoryShell(
  categories,
  { radius = 122, color = '#8b5cf6', shapeType = 'triangle', marginRings = 1 } = {}
) {
  const detail = pickDetailLevel(categories.length);
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.getAttribute('position'); // non indicizzata: 3 vertici propri per faccia
  const faceCount = pos.count / 3;

  // La geometria non ha un index buffer condiviso, quindi per sapere quali
  // facce condividono un lato bisogna prima deduplicare i vertici per
  // posizione (due facce adiacenti hanno due vertici alla stessa coordinata,
  // anche se duplicati nel buffer). Le facce vicine servono a bloccare,
  // insieme alla faccia appena assegnata, anche il suo anello di vicine.
  const vertIdOf = new Map();
  const faceVertIds = [];
  const tmp = new THREE.Vector3();
  for (let f = 0; f < faceCount; f++) {
    const ids = [];
    for (let k = 0; k < 3; k++) {
      tmp.fromBufferAttribute(pos, f * 3 + k);
      const key = `${tmp.x.toFixed(3)}_${tmp.y.toFixed(3)}_${tmp.z.toFixed(3)}`;
      let id = vertIdOf.get(key);
      if (id === undefined) {
        id = vertIdOf.size;
        vertIdOf.set(key, id);
      }
      ids.push(id);
    }
    faceVertIds.push(ids);
  }
  const edgeToFaces = new Map();
  faceVertIds.forEach((v, f) => {
    [[v[0], v[1]], [v[1], v[2]], [v[2], v[0]]].forEach(([va, vb]) => {
      const key = va < vb ? `${va}_${vb}` : `${vb}_${va}`;
      if (!edgeToFaces.has(key)) edgeToFaces.set(key, []);
      edgeToFaces.get(key).push(f);
    });
  });
  const adjacency = Array.from({ length: faceCount }, () => []);
  edgeToFaces.forEach((faces) => {
    if (faces.length === 2) {
      adjacency[faces[0]].push(faces[1]);
      adjacency[faces[1]].push(faces[0]);
    }
  });

  // Le etichette si rimpiccioliscono quando i triangoli sono più piccoli (più categorie).
  const labelScale = detail === 0 ? 15 : detail === 1 ? 9 : 5.5;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const centroid = new THREE.Vector3();

  const group = new THREE.Group();
  const faceMeshes = [];
  const triangles = [];
  const positions = {};
  const labelSprites = [];
  const disposables = [geo];
  // Solo mondo Bambini ("vivace"): forme piene e luminose, bordo bianco,
  // alone e animazione. Gli altri mondi restano sul materiale storico.
  const vivid = shapeType === 'kids';
  const vividItems = [];
  // Un solo materiale per tutti i bordi bianchi (la larghezza in pixel
  // richiede la risoluzione del canvas: la aggiorna update(), vedi sotto).
  const edgeMaterial = vivid
    ? new LineMaterial({
        color: 0xffffff,
        linewidth: VIVID_EDGE_WIDTH_PX,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      })
    : null;
  if (edgeMaterial) disposables.push(edgeMaterial);
  const usedFaces = new Set();
  const blockedFaces = new Set();

  const nearestFace = (targetDir, exclude) => {
    let bestFace = -1;
    let bestDot = -Infinity;
    for (let f = 0; f < faceCount; f++) {
      if (exclude.has(f)) continue;
      a.fromBufferAttribute(pos, f * 3);
      b.fromBufferAttribute(pos, f * 3 + 1);
      c.fromBufferAttribute(pos, f * 3 + 2);
      centroid.copy(a).add(b).add(c).divideScalar(3).normalize();
      const dot = centroid.dot(targetDir);
      if (dot > bestDot) {
        bestDot = dot;
        bestFace = f;
      }
    }
    return bestFace;
  };

  categories.forEach((cat, index) => {
    const targetDir = polarToVector(cat.anchor.lat, cat.anchor.lng, 1);
    // Prima tentiamo con il margine (niente facce adiacenti a categorie già
    // messe); se lo spazio libero finisce, ripieghiamo su una faccia comunque
    // libera ma senza garanzia di margine, piuttosto che non piazzare la categoria.
    let bestFace = nearestFace(targetDir, blockedFaces);
    if (bestFace === -1) bestFace = nearestFace(targetDir, usedFaces);

    usedFaces.add(bestFace);
    blockedFaces.add(bestFace);
    const ring1 = adjacency[bestFace];
    ring1.forEach((n) => blockedFaces.add(n));
    if (marginRings >= 2) {
      ring1.forEach((n) => adjacency[n].forEach((n2) => blockedFaces.add(n2)));
    }

    a.fromBufferAttribute(pos, bestFace * 3);
    b.fromBufferAttribute(pos, bestFace * 3 + 1);
    c.fromBufferAttribute(pos, bestFace * 3 + 2);
    centroid.copy(a).add(b).add(c).divideScalar(3);
    const normal = centroid.clone().normalize();

    const sa = shrinkVertex(a, centroid, radius);
    const sb = shrinkVertex(b, centroid, radius);
    const sc = shrinkVertex(c, centroid, radius);

    triangles.push({
      id: cat.id,
      a: sa.clone().normalize(),
      b: sb.clone().normalize(),
      c: sc.clone().normalize(),
    });
    positions[cat.id] = vectorToPolar(normal);

    const face = buildCategoryFaceShape(shapeType, index, cat.id);
    let faceGeo;
    let shapeCenter = null;
    let shapeScale = 0;
    if (face) {
      shapeCenter = normal.clone().multiplyScalar(radius);
      shapeScale = (sa.distanceTo(shapeCenter) + sb.distanceTo(shapeCenter) + sc.distanceTo(shapeCenter)) / 3;
      faceGeo = new THREE.ShapeGeometry(face.shape, 24);
      if (vivid) {
        // Geometria lasciata LOCALE (piana, centrata nell'origine): la
        // posizione/orientamento sulla sfera li porta il perno (pivot)
        // sotto, così scala (pulsazione) e spostamento (galleggiamento)
        // si applicano attorno al centro della forma e non al centro del
        // globo. Stesso risultato di placeShapeOnSphere a riposo.
        faceGeo.scale(shapeScale, shapeScale, 1);
      } else {
        placeShapeOnSphere(faceGeo, normal, shapeCenter, shapeScale);
      }
    } else {
      faceGeo = new THREE.BufferGeometry();
      faceGeo.setAttribute('position', new THREE.Float32BufferAttribute([sa.x, sa.y, sa.z, sb.x, sb.y, sb.z, sc.x, sc.y, sc.z], 3));
      faceGeo.computeVertexNormals();
    }

    const faceColor = face?.color ?? color;
    const material = new THREE.MeshBasicMaterial({
      color: faceColor,
      transparent: true,
      // Vivace: colore pieno (niente "vetro scuro"); MeshBasicMaterial non
      // risente delle luci, quindi resta acceso anche sul lato in ombra.
      opacity: vivid ? VIVID_OPACITY : 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(faceGeo, material);
    mesh.userData.categoryId = cat.id;
    faceMeshes.push(mesh);
    disposables.push(faceGeo, material);

    if (vivid && shapeCenter) {
      const pivot = new THREE.Group();
      const worldUp = Math.abs(normal.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(worldUp, normal).normalize();
      const up = new THREE.Vector3().crossVectors(normal, right).normalize();
      pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
      const restPosition = shapeCenter.clone().addScaledVector(normal, SHAPE_SURFACE_OFFSET + VIVID_SURFACE_LIFT);
      pivot.position.copy(restPosition);
      // Ordine di disegno fisso, dopo le linee della rete (renderOrder 0):
      // il depth test resta attivo, quindi il globo continua a nasconderle
      // sul retro come sempre.
      mesh.renderOrder = VIVID_RENDER_ORDER;
      pivot.add(mesh);

      // Bordo bianco luminoso (2-3 px reali a schermo: LineBasicMaterial
      // in WebGL resta sempre a 1 px, per questo le "fat lines").
      const edges = new THREE.EdgesGeometry(faceGeo);
      const edgeGeo = new LineSegmentsGeometry().fromEdgesGeometry(edges);
      edges.dispose();
      const edgeLines = new LineSegments2(edgeGeo, edgeMaterial);
      edgeLines.position.z = 0.15;
      edgeLines.renderOrder = VIVID_RENDER_ORDER;
      edgeLines.computeLineDistances();
      pivot.add(edgeLines);
      disposables.push(edgeGeo);

      // Alone: sprite radiale additivo del colore della forma, dietro di lei.
      const glowMaterial = new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: faceColor,
        transparent: true,
        opacity: VIVID_GLOW_OPACITY,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Sprite(glowMaterial);
      glow.position.z = -0.3;
      glow.renderOrder = VIVID_RENDER_ORDER;
      glow.scale.setScalar(shapeScale * VIVID_GLOW_SIZE);
      pivot.add(glow);
      disposables.push(glowMaterial);

      group.add(pivot);
      vividItems.push({
        id: cat.id,
        pivot,
        glowMaterial,
        normal: normal.clone(),
        restPosition,
        phase: (index * Math.PI * 2 * 0.37) % (Math.PI * 2),
        emphasis: 0, // 0 = riposo, 1 = hover/attiva (interpolato in update)
        hovered: false,
        active: false,
      });
    } else {
      group.add(mesh);
    }

    const { sprite, material: labelMat, texture } = makeLabelSprite(
      cat.label,
      labelScale,
      '#ffffff',
      vivid ? { pill: true, pillBorder: faceColor } : {}
    );
    sprite.position.copy(normal).multiplyScalar(radius + 3 + (vivid ? VIVID_SURFACE_LIFT : 0));
    if (vivid) sprite.renderOrder = VIVID_RENDER_ORDER + 1;
    sprite.userData.categoryId = cat.id;
    group.add(sprite);
    labelSprites.push(sprite);
    disposables.push(labelMat, texture);
  });

  function setActive(activeId) {
    if (vivid) {
      vividItems.forEach((item) => {
        item.active = item.id === activeId;
      });
      return;
    }
    faceMeshes.forEach((mesh) => {
      mesh.material.opacity = mesh.userData.categoryId === activeId ? 0.45 : 0.2;
    });
  }

  // Hover del mouse su una forma (solo mondo vivace; altrove non fa nulla):
  // la forma cresce a 1.15 e l'alone si accende di più, vedi update().
  function setHovered(hoveredId) {
    if (!vivid) return;
    vividItems.forEach((item) => {
      item.hovered = item.id === hoveredId;
    });
  }

  // Un passo di animazione, chiamato dal giro di disegno del globo (mai un
  // requestAnimationFrame a parte). reduceMotion: niente pulsazione né
  // galleggiamento (colori, bordo e alone restano). A scheda nascosta non
  // si fa nulla. viewportSize (larghezza/altezza del canvas in px CSS)
  // serve alla larghezza in pixel del bordo bianco.
  const lastViewport = new THREE.Vector2(-1, -1);
  const worldPos = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  function update(elapsed, deltaSec, { reduceMotion = false, viewportSize = null, camera = null } = {}) {
    if (!vivid || document.hidden) return;
    if (viewportSize && !lastViewport.equals(viewportSize)) {
      lastViewport.copy(viewportSize);
      edgeMaterial.resolution.copy(viewportSize);
    }
    // Interpolazione morbida verso lo stato hover/attivo (~150 ms).
    const easeStep = Math.min(1, deltaSec * 8);
    for (let i = 0; i < vividItems.length; i++) {
      const item = vividItems[i];
      // Sul retro del globo rispetto alla camera la forma si spegne del
      // tutto (pivot.visible): stando sopra al guscio, vicino al bordo
      // spunterebbe altrimenti come una lamella bianca vista di taglio.
      if (camera) {
        item.pivot.getWorldPosition(worldPos);
        worldNormal.copy(worldPos).normalize();
        toCamera.copy(camera.position).sub(worldPos).normalize();
        const facing = worldNormal.dot(toCamera) > 0.03;
        if (item.pivot.visible !== facing) item.pivot.visible = facing;
        if (!facing) continue;
      }
      const target = item.hovered || item.active ? 1 : 0;
      item.emphasis += (target - item.emphasis) * easeStep;
      if (Math.abs(target - item.emphasis) < 0.002) item.emphasis = target;

      let pulse = 1;
      let lift = 0;
      if (!reduceMotion) {
        const pulseT = (elapsed / VIVID_PULSE_PERIOD_S) * Math.PI * 2 + item.phase;
        pulse = 1 + VIVID_PULSE_AMOUNT * (0.5 - 0.5 * Math.cos(pulseT));
        lift = VIVID_FLOAT_AMOUNT * Math.sin((elapsed / VIVID_FLOAT_PERIOD_S) * Math.PI * 2 + item.phase * 1.7);
      }
      const scale = pulse * (1 + (VIVID_HOVER_SCALE - 1) * item.emphasis);
      item.pivot.scale.setScalar(scale);
      item.pivot.position.copy(item.restPosition).addScaledVector(item.normal, lift);
      item.glowMaterial.opacity = VIVID_GLOW_OPACITY + (VIVID_GLOW_OPACITY_HOVER - VIVID_GLOW_OPACITY) * item.emphasis;
    }
  }

  function dispose() {
    disposables.forEach((d) => d.dispose && d.dispose());
  }

  return {
    group,
    faceMeshes,
    triangles,
    positions,
    labelSprites,
    setActive,
    setHovered,
    update,
    supportsHover: vivid,
    dispose,
  };
}
