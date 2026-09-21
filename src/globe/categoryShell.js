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
function makeLabelSprite(text, spriteScale) {
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
export function buildCategoryShell(categories, { radius = 122, color = '#8b5cf6' } = {}) {
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

  categories.forEach((cat) => {
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

    const triGeo = new THREE.BufferGeometry();
    triGeo.setAttribute('position', new THREE.Float32BufferAttribute([sa.x, sa.y, sa.z, sb.x, sb.y, sb.z, sc.x, sc.y, sc.z], 3));
    triGeo.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(triGeo, material);
    mesh.userData.categoryId = cat.id;
    group.add(mesh);
    faceMeshes.push(mesh);
    disposables.push(triGeo, material);

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
