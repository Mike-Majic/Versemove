import * as THREE from 'three';

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
const KIDS_PALETTE = ['#ff5252', '#ffab40', '#ffd740', '#40c4ff', '#e040fb', '#69f0ae'];

// Sceglie geometria (e per il mondo Bambini, colore) in base a shapeType e
// all'indice della categoria dentro il proprio mondo — un unico punto da
// cui WorldGlobe.jsx decide "che forma ha questo mondo", vedi sotto.
function buildCategoryFaceShape(shapeType, index) {
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
    case 'kids':
      return {
        shape: KIDS_SHAPES[index % KIDS_SHAPES.length](),
        color: KIDS_PALETTE[index % KIDS_PALETTE.length],
      };
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
export function makeLabelSprite(text, spriteScale) {
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
  const radius = 10;

  ctx.beginPath();
  ctx.moveTo(boxX + radius, boxY);
  ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, radius);
  ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, radius);
  ctx.arcTo(boxX, boxY + boxH, boxX, boxY, radius);
  ctx.arcTo(boxX, boxY, boxX + boxW, boxY, radius);
  ctx.closePath();
  ctx.fillStyle = 'rgba(6, 4, 12, 0.78)';
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
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
export function buildCategoryShell(categories, { radius = 122, color = '#8b5cf6', shapeType = 'triangle' } = {}) {
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
    adjacency[bestFace].forEach((n) => blockedFaces.add(n));

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

    const face = buildCategoryFaceShape(shapeType, index);
    let faceGeo;
    if (face) {
      const shapeCenter = normal.clone().multiplyScalar(radius);
      const scale = (sa.distanceTo(shapeCenter) + sb.distanceTo(shapeCenter) + sc.distanceTo(shapeCenter)) / 3;
      faceGeo = new THREE.ShapeGeometry(face.shape, 24);
      placeShapeOnSphere(faceGeo, normal, shapeCenter, scale);
    } else {
      faceGeo = new THREE.BufferGeometry();
      faceGeo.setAttribute('position', new THREE.Float32BufferAttribute([sa.x, sa.y, sa.z, sb.x, sb.y, sb.z, sc.x, sc.y, sc.z], 3));
      faceGeo.computeVertexNormals();
    }

    const material = new THREE.MeshBasicMaterial({
      color: face?.color ?? color,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(faceGeo, material);
    mesh.userData.categoryId = cat.id;
    group.add(mesh);
    faceMeshes.push(mesh);
    disposables.push(faceGeo, material);

    const { sprite, material: labelMat, texture } = makeLabelSprite(cat.label, labelScale);
    sprite.position.copy(normal).multiplyScalar(radius + 3);
    sprite.userData.categoryId = cat.id;
    group.add(sprite);
    labelSprites.push(sprite);
    disposables.push(labelMat, texture);
  });

  function setActive(activeId) {
    faceMeshes.forEach((mesh) => {
      mesh.material.opacity = mesh.userData.categoryId === activeId ? 0.45 : 0.2;
    });
  }

  function dispose() {
    disposables.forEach((d) => d.dispose && d.dispose());
  }

  return { group, faceMeshes, triangles, positions, labelSprites, setActive, dispose };
}
