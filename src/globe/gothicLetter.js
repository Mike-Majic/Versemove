import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

// Lettera gotica 3D (per ora solo la "M" della categoria World, mondo
// Social): stesso aspetto e stesse animazioni di
// docs/anteprima-lettere-gotiche.html, ma dentro la scena del globo (niente
// seconda scena né secondo canvas, niente requestAnimationFrame a parte:
// update() lo chiama il giro di disegno esistente, vedi categoryShell.js).
//
// Il glifo del font si disegna su un canvas 640×640, si binarizza, se ne
// ricavano i contorni (marching squares), si semplificano (Douglas-Peucker)
// e si estrudono. Tutte le misure sono in "unità lettera" (lato maggiore
// del glifo = 5.6): chi la usa scala il gruppo come gli serve.
//
// createGothicLetter({ char, font, size, depth, ... }) =>
//   { group, mesh, halfWidth, halfHeight, halfDepth, update(time, dt, opts), startIntro(), setEmphasis(v), dispose() }

const CANVAS_SIZE = 640;
const LETTER_SIZE = 5.6;
const INTRO_S = 1.6;
const INTRO_FADE_S = 0.6;
const EDGE_HUE_SPEED = 0.12;
const PULSE_SPEED = 0.09; // giri del contorno al secondo
const EDGE_WIDTH_PX = 1.6;
const SIDE_EDGE_ANGLE = 60;
const EDGE_GLOW_WIDTH_PX = 4;

// Tinta arcobaleno in un punto della lettera, che scorre nel tempo.
export function gothicHueAt(x, y, time) {
  return ((Math.atan2(y, x) / (Math.PI * 2)) + time * EDGE_HUE_SPEED + (x + y) * 0.03 + 10) % 1;
}

// Aspetta il font (Google Fonts, vedi index.html) senza mai bloccare: se non
// arriva entro timeoutMs o fallisce si va avanti col fallback serif.
export function loadGothicFont(fontSpec, timeoutMs = 4000) {
  if (typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve();
  return Promise.race([
    document.fonts.load(fontSpec).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

// --- Contorni del glifo -----------------------------------------------------

function traceGlyph(char, font) {
  const S = CANVAS_SIZE;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#000';
  cx.fillRect(0, 0, S, S);
  cx.fillStyle = '#fff';
  cx.font = font;
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.fillText(char, S / 2, S / 2 + 20);
  const img = cx.getImageData(0, 0, S, S).data;
  const bin = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) bin[i] = img[i * 4] > 127 ? 1 : 0;

  // Marching squares -> segmenti -> anelli chiusi.
  const val = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : bin[y * S + x]);
  const key = (x, y) => Math.round(x * 2) * 100000 + Math.round(y * 2);
  const adj = new Map();
  const ptOf = new Map();
  const addSeg = (p, q) => {
    const kp = key(p[0], p[1]);
    const kq = key(q[0], q[1]);
    ptOf.set(kp, p);
    ptOf.set(kq, q);
    if (!adj.has(kp)) adj.set(kp, []);
    if (!adj.has(kq)) adj.set(kq, []);
    adj.get(kp).push(kq);
    adj.get(kq).push(kp);
  };
  const table = {
    1: ['L', 'B'], 2: ['B', 'R'], 3: ['L', 'R'], 4: ['T', 'R'], 5: ['L', 'T', 'B', 'R'],
    6: ['T', 'B'], 7: ['L', 'T'], 8: ['T', 'L'], 9: ['T', 'B'], 10: ['T', 'R', 'L', 'B'],
    11: ['T', 'R'], 12: ['L', 'R'], 13: ['B', 'R'], 14: ['L', 'B'],
  };
  for (let y = -1; y < S; y++) {
    for (let x = -1; x < S; x++) {
      const idx = val(x, y) * 8 + val(x + 1, y) * 4 + val(x + 1, y + 1) * 2 + val(x, y + 1);
      const e = table[idx];
      if (!e) continue;
      const mid = { T: [x + 0.5, y], R: [x + 1, y + 0.5], B: [x + 0.5, y + 1], L: [x, y + 0.5] };
      for (let i = 0; i < e.length; i += 2) addSeg(mid[e[i]], mid[e[i + 1]]);
    }
  }
  const used = new Set();
  const loops = [];
  for (const [k0] of adj) {
    if (used.has(k0)) continue;
    const loop = [];
    let k = k0;
    let prev = null;
    while (k !== undefined && !used.has(k)) {
      used.add(k);
      loop.push(ptOf.get(k));
      const nb = adj.get(k).filter((n) => n !== prev && !used.has(n));
      prev = k;
      k = nb[0];
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

function douglasPeucker(pts, tol) {
  if (pts.length < 3) return pts;
  const a = pts[0];
  const b = pts[pts.length - 1];
  let maxD = 0;
  let idx = 0;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const d = Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > tol) return douglasPeucker(pts.slice(0, idx + 1), tol).slice(0, -1).concat(douglasPeucker(pts.slice(idx), tol));
  return [a, b];
}

// Un anello chiuso si spezza in due metà (dal primo punto al più lontano)
// prima di semplificarlo, altrimenti DP lo ridurrebbe a un segmento.
function simplifyLoop(l, tol) {
  let far = 0;
  let fd = 0;
  l.forEach((p, i) => {
    const d = Math.hypot(p[0] - l[0][0], p[1] - l[0][1]);
    if (d > fd) {
      fd = d;
      far = i;
    }
  });
  const a = douglasPeucker(l.slice(0, far + 1), tol);
  const b = douglasPeucker(l.slice(far).concat([l[0]]), tol);
  return a.slice(0, -1).concat(b.slice(0, -1));
}

function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
}

function pointInPoly(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

// scaleMode 'max': lato maggiore del glifo = 5.6 (la M). 'height': altezza
// del glifo = 4.5 (la V, come nel riferimento: così ha la stessa altezza
// della M anche se è più stretta).
function buildShapes(char, font, fixedScaleBase, scaleMode) {
  const loops = traceGlyph(char, font);
  if (loops.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  loops.forEach((l) =>
    l.forEach((p) => {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    })
  );
  let scale;
  if (fixedScaleBase) scale = LETTER_SIZE / fixedScaleBase;
  else if (scaleMode === 'height') scale = 4.5 / (maxY - minY);
  else scale = LETTER_SIZE / Math.max(maxY - minY, maxX - minX);
  const ox = (minX + maxX) / 2;
  const oy = (minY + maxY) / 2;
  const toWorld = (p) => [(p[0] - ox) * scale, -(p[1] - oy) * scale];

  const simp = loops.map((l) => simplifyLoop(l, 1.1)).filter((l) => Math.abs(polyArea(l)) > 40);
  if (simp.length === 0) return null;
  simp.sort((p, q) => Math.abs(polyArea(q)) - Math.abs(polyArea(p)));
  const outers = [];
  const holes = [];
  simp.forEach((l) => {
    const depthN = simp.filter((o) => o !== l && Math.abs(polyArea(o)) > Math.abs(polyArea(l)) && pointInPoly(l[0], o)).length;
    (depthN % 2 === 0 ? outers : holes).push(l);
  });
  const shapes = outers.map((o) => {
    const sh = new THREE.Shape(o.map((p) => new THREE.Vector2(...toWorld(p))));
    sh.holes = holes
      .filter((h) => pointInPoly(h[0], o))
      .map((h) => {
        const pa = new THREE.Path();
        h.forEach((p, i) => {
          const w = toWorld(p);
          if (i) pa.lineTo(w[0], w[1]);
          else pa.moveTo(w[0], w[1]);
        });
        pa.closePath();
        return pa;
      });
    return sh;
  });
  return { shapes, bigOuter: outers[0].map(toWorld) };
}

// --- Lettera ----------------------------------------------------------------

// size: grandezza finale (lato maggiore del glifo in unità scena; il gruppo
// viene scalato di size / 5.6). depth: spessore in unità lettera.
// fixedScaleBase: per lettere che devono avere la stessa altezza di
// un'altra invece di riempire 5.6 (la V del riferimento usa 330).
// particleCount/pulseCount: meno su schermi piccoli. introRadius: sfera di
// partenza delle particelle (unità lettera). sparkleCount: brillantini
// sul fianco destro esterno (la V di Verse; 0 = niente). holo: anelli/tacche/staffe HUD
// (spenti di default). spin: 'full' come il riferimento (giro continuo
// sull'asse Y), 'sway' (oscillazione lieve) oppure 'none': lettera ferma
// nella posa di riposo, niente rotazione, galleggiamento né "respiro"
// (il globo usa 'none': si muove solo insieme al globo).
export function createGothicLetter({
  char = 'M',
  font = '440px "UnifrakturMaguntia", "Old English Text MT", serif',
  size = LETTER_SIZE,
  depth = 0.9,
  fixedScaleBase = null,
  scaleMode = 'max',
  sparkleCount = 0,
  particleCount = 2600,
  pulseCount = 6,
  introRadius = [9, 15],
  holo = false,
  spin = 'full',
  swayAmount = 0.25,
  renderOrder = 0,
} = {}) {
  const built = buildShapes(char, font, fixedScaleBase, scaleMode);
  if (!built) return null;
  const { shapes, bigOuter } = built;
  const disposables = [];

  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 3,
    curveSegments: 2,
  });
  geo.computeBoundingBox();
  const preBB = geo.boundingBox.clone();
  geo.center();
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  disposables.push(geo);

  const group = new THREE.Group(); // posizione/scala decise da chi la usa
  group.scale.setScalar(size / LETTER_SIZE);
  const root = new THREE.Group(); // animazioni (oscillazione, rotazione)
  group.add(root);

  // Facce: vetro nero ossidiana; fianchi: metallo scuro laccato.
  // polygonOffset: la superficie viene spinta appena indietro nel depth
  // buffer, così le linee dei bordi (che stanno esattamente sopra di lei)
  // vincono sempre e non si spezzano a trattini (z-fighting).
  const surfaceOffset = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
  const faceMat = new THREE.MeshPhysicalMaterial({
    color: 0x070f1e, metalness: 0.35, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1,
    emissive: 0x061a33, emissiveIntensity: 0.6, side: THREE.DoubleSide, ...surfaceOffset,
  });
  const sideMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b1c36, metalness: 0.7, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12,
    emissive: 0x0a3d66, emissiveIntensity: 0.7, side: THREE.DoubleSide, ...surfaceOffset,
  });
  disposables.push(faceMat, sideMat);
  const mesh = new THREE.Mesh(geo, [faceMat, sideMat]);
  mesh.renderOrder = renderOrder;
  root.add(mesh);

  // Bordi arcobaleno: colori per segmento aggiornati a ogni fotogramma.
  // Una sola linea pulita per spigolo:
  // - contorno frontale e posteriore presi direttamente dal disegno della
  //   lettera (i contorni delle facce piane, esterni e fori). Dall'
  //   EdgesGeometry non arrivano: con lo smusso a 3 segmenti il primo
  //   gradino piega di ~20°, sotto la soglia di 25°, e il contorno usciva a
  //   pezzetti; i gradini successivi invece facevano 3-4 anelli paralleli a
  //   pochi centesimi l'uno dall'altro (linee doppie, moiré);
  // - dall'EdgesGeometry si tengono solo gli spigoli "verticali" dei
  //   fianchi (quasi paralleli a z e lunghi quanto lo spessore), con una
  //   soglia di 60°: il contorno del glifo è un poligono fitto e a 25°
  //   quasi ogni vertice diventava uno spigolo, visto di fronte un puntino.
  const zFront = bb.max.z;
  const zBack = bb.min.z;
  const offX = (preBB.min.x + preBB.max.x) / 2;
  const offY = (preBB.min.y + preBB.max.y) / 2;
  const kept = [];
  const pushLoop = (pts) => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (a.x === b.x && a.y === b.y) continue;
      for (const z of [zFront, zBack]) kept.push(a.x - offX, a.y - offY, z, b.x - offX, b.y - offY, z);
    }
  };
  shapes.forEach((sh) => {
    const { shape: outer, holes } = sh.extractPoints(2);
    pushLoop(outer);
    holes.forEach(pushLoop);
  });
  const rawEdges = new THREE.EdgesGeometry(geo, SIDE_EDGE_ANGLE);
  const rawPos = rawEdges.attributes.position.array;
  for (let i = 0; i < rawPos.length; i += 6) {
    const dz = Math.abs(rawPos[i + 5] - rawPos[i + 2]);
    const dxy = Math.hypot(rawPos[i + 3] - rawPos[i], rawPos[i + 4] - rawPos[i + 1]);
    if (dz >= depth * 0.9 && dxy < dz * 0.2) for (let k = 0; k < 6; k++) kept.push(rawPos[i + k]);
  }
  rawEdges.dispose();
  const ePosArr = new Float32Array(kept);
  const eCount = ePosArr.length / 3; // vertici (2 per segmento)
  const eCol = new Float32Array(eCount * 3);

  // Linee "grosse" (LineSegments2): in WebGL linewidth viene ignorato e le
  // LineSegments normali restano a 1 px. Spessore in pixel dello schermo;
  // la risoluzione la aggiorna update() (viewportSize). Il bagliore è la
  // stessa geometria più larga e additiva, sotto: stessa posizione, quindi
  // si legge come un alone della linea e non come una seconda linea.
  const edgeGeo = new LineSegmentsGeometry();
  edgeGeo.setPositions(ePosArr);
  edgeGeo.setColors(eCol);
  // setColors copia l'array: i colori si scrivono direttamente nel buffer
  // interno (stesso formato, r g b di inizio e fine di ogni segmento).
  const eColBuffer = edgeGeo.attributes.instanceColorStart.data;
  const eColArr = eColBuffer.array;
  const edgeMat = new LineMaterial({
    vertexColors: true, linewidth: EDGE_WIDTH_PX, transparent: true, opacity: 0.95,
  });
  const edges = new LineSegments2(edgeGeo, edgeMat);
  edges.renderOrder = renderOrder + 1;
  root.add(edges);
  const edgeGlowMat = new LineMaterial({
    vertexColors: true, linewidth: EDGE_GLOW_WIDTH_PX, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const edgesGlow = new LineSegments2(edgeGeo, edgeGlowMat);
  edgesGlow.renderOrder = renderOrder;
  root.add(edgesGlow);
  disposables.push(edgeGeo, edgeMat, edgeGlowMat);
  const lastResolution = new THREE.Vector2(-1, -1);
  function setResolution(viewportSize) {
    if (!viewportSize || lastResolution.equals(viewportSize)) return;
    lastResolution.copy(viewportSize);
    edgeMat.resolution.copy(viewportSize);
    edgeGlowMat.resolution.copy(viewportSize);
  }
  if (typeof window !== 'undefined') setResolution(new THREE.Vector2(window.innerWidth, window.innerHeight));

  const tmpC = new THREE.Color();
  function paintEdges(time) {
    for (let i = 0; i < eCount; i++) {
      tmpC.setHSL(gothicHueAt(ePosArr[i * 3], ePosArr[i * 3 + 1], time), 1, 0.6);
      eColArr[i * 3] = tmpC.r;
      eColArr[i * 3 + 1] = tmpC.g;
      eColArr[i * 3 + 2] = tmpC.b;
    }
    eColBuffer.needsUpdate = true;
  }
  paintEdges(0);

  // Alone dietro la lettera.
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x21d4ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
  });
  const halo = new THREE.Mesh(geo, haloMat);
  halo.scale.set(1.05, 1.05, 1.25);
  root.add(halo);
  disposables.push(haloMat);

  // Impulsi di luce lungo il contorno esterno più grande.
  const centerOff = new THREE.Vector3().addVectors(preBB.min, preBB.max).multiplyScalar(0.5);
  const outline = new THREE.CatmullRomCurve3(
    bigOuter.map((p) => new THREE.Vector3(p[0], p[1], depth + 0.06)),
    true,
    'catmullrom',
    0
  );
  const pulseGeo = new THREE.SphereGeometry(0.1, 12, 12);
  const pulseGlowGeo = new THREE.SphereGeometry(0.26, 12, 12);
  const pulseMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  disposables.push(pulseGeo, pulseGlowGeo, pulseMat);
  const pulses = [];
  for (let i = 0; i < pulseCount; i++) {
    const m = new THREE.Mesh(pulseGeo, pulseMat);
    const gMat = new THREE.MeshBasicMaterial({
      color: 0x21d4ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const g = new THREE.Mesh(pulseGlowGeo, gMat);
    m.add(g);
    root.add(m);
    disposables.push(gMat);
    pulses.push({ m, g, off: i / pulseCount });
  }
  const tmpV = new THREE.Vector3();
  function placePulses(time, speed) {
    pulses.forEach((p) => {
      const u = (((p.off + time * speed) % 1) + 1) % 1;
      outline.getPointAt(u, tmpV);
      p.m.position.set(tmpV.x - centerOff.x, tmpV.y - centerOff.y, tmpV.z - centerOff.z);
      p.g.material.color.setHSL(gothicHueAt(p.m.position.x, p.m.position.y, time), 1, 0.6);
    });
  }
  placePulses(0, 0);

  // Brillantini lungo il fianco destro esterno (stesso effetto del
  // riferimento): per ogni fascia di y da 0.08 il punto più a destra del
  // contorno esterno, dalla punta in alto a destra al vertice in basso.
  let sparkles = null;
  let sparkUniforms = null;
  if (sparkleCount > 0) {
    const buckets = new Map();
    bigOuter.forEach((p) => {
      if (p[0] <= 0) return;
      const b = Math.round(p[1] / 0.08);
      if (!buckets.has(b) || buckets.get(b)[0] < p[0]) buckets.set(b, p);
    });
    const edgePts = [...buckets.values()].map((p) => [p[0] - centerOff.x, p[1] - centerOff.y]);
    if (edgePts.length > 0) {
      const N = sparkleCount;
      const sPos = new Float32Array(N * 3);
      const sPhase = new Float32Array(N);
      const sSize = new Float32Array(N);
      const sCol = new Float32Array(N * 3);
      const tints = [[1, 1, 1], [1, 0.9, 0.55], [0.6, 0.95, 1], [1, 0.75, 0.95]];
      for (let i = 0; i < N; i++) {
        const e = edgePts[Math.floor(Math.random() * edgePts.length)];
        const spread = Math.random() * 0.3;
        sPos[i * 3] = e[0] - spread * 0.6 + (Math.random() - 0.5) * 0.08;
        sPos[i * 3 + 1] = e[1] + (Math.random() - 0.5) * 0.1;
        sPos[i * 3 + 2] = depth / 2 + 0.03 + Math.random() * 0.12;
        sPhase[i] = Math.random() * Math.PI * 2;
        sSize[i] = 0.08 + Math.random() * 0.16;
        const t = tints[Math.floor(Math.random() * tints.length)];
        sCol[i * 3] = t[0];
        sCol[i * 3 + 1] = t[1];
        sCol[i * 3 + 2] = t[2];
      }
      const sGeo = new THREE.BufferGeometry();
      sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
      sGeo.setAttribute('phase', new THREE.BufferAttribute(sPhase, 1));
      sGeo.setAttribute('psize', new THREE.BufferAttribute(sSize, 1));
      sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
      // uPx = pixelRatio × altezza del canvas; uScale = scala del gruppo (la
      // grandezza dei punti non la segue da sola).
      sparkUniforms = {
        uTime: { value: 0 },
        uPx: { value: (typeof window !== 'undefined' ? window.devicePixelRatio * window.innerHeight : 800) },
        uScale: { value: size / LETTER_SIZE },
      };
      const sMat = new THREE.ShaderMaterial({
        uniforms: sparkUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `attribute float phase; attribute float psize; attribute vec3 color; uniform float uTime; uniform float uPx; uniform float uScale; varying float vA; varying vec3 vC;
        void main(){ float tw = sin(uTime * (2.5 + fract(phase) * 3.0) + phase * 7.0); vA = pow(max(tw, 0.0), 6.0); vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * uScale * (0.4 + vA) * uPx * 0.9 / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying float vA; varying vec3 vC;
        void main(){ vec2 p = gl_PointCoord - 0.5; float r = length(p);
          float star = max(0.0, 1.0 - (abs(p.x) + abs(p.y)) * 2.6) * 0.9 + max(0.0, 1.0 - min(abs(p.x), abs(p.y)) * 18.0) * max(0.0, 1.0 - r * 2.2) * 0.8;
          float core = smoothstep(0.5, 0.0, r) * 0.6;
          float a = (star + core) * vA; if (a < 0.02) discard;
          gl_FragColor = vec4(vC * (0.6 + 0.4 * vA) + vec3(a * 0.5), a); }`,
      });
      sparkles = new THREE.Points(sGeo, sMat);
      sparkles.renderOrder = renderOrder + 1;
      sparkles.frustumCulled = false;
      root.add(sparkles);
      disposables.push(sGeo, sMat);
    }
  }

  // Extra olografici (spenti di default).
  let holoGroup = null;
  if (holo) {
    holoGroup = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x21d4ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const ring2Mat = ringMat.clone();
    ring2Mat.opacity = 0.3;
    const ring1Geo = new THREE.TorusGeometry(4.4, 0.018, 8, 160);
    const ring2Geo = new THREE.TorusGeometry(4.9, 0.012, 8, 160);
    const ring1 = new THREE.Mesh(ring1Geo, ringMat);
    ring1.rotation.x = Math.PI / 2.4;
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = Math.PI / 2;
    ring2.rotation.y = 0.6;
    holoGroup.add(ring1, ring2);
    disposables.push(ringMat, ring2Mat, ring1Geo, ring2Geo);
    const arcs = new THREE.Group();
    const arcLongGeo = new THREE.TorusGeometry(4.15, 0.035, 6, 12, 0.18);
    const arcShortGeo = new THREE.TorusGeometry(4.15, 0.035, 6, 12, 0.07);
    const arcLongMat = new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.85 });
    const arcShortMat = new THREE.MeshBasicMaterial({ color: 0x21d4ff, transparent: true, opacity: 0.85 });
    disposables.push(arcLongGeo, arcShortGeo, arcLongMat, arcShortMat);
    for (let i = 0; i < 24; i++) {
      const long = i % 3 === 0;
      const seg = new THREE.Mesh(long ? arcLongGeo : arcShortGeo, long ? arcLongMat : arcShortMat);
      seg.rotation.z = (i / 24) * Math.PI * 2;
      arcs.add(seg);
    }
    holoGroup.add(arcs);
    const brMat = new THREE.LineBasicMaterial({ color: 0x21d4ff, transparent: true, opacity: 0.7 });
    disposables.push(brMat);
    const W = 6.4;
    const H = 6.4;
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sy]) => {
      const L = 0.7;
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(sx * (W / 2 + 0.7) - sx * L, sy * (H / 2 + 0.7), 0.6),
        new THREE.Vector3(sx * (W / 2 + 0.7), sy * (H / 2 + 0.7), 0.6),
        new THREE.Vector3(sx * (W / 2 + 0.7), sy * (H / 2 + 0.7) - sy * L, 0.6),
      ]);
      disposables.push(g);
      holoGroup.add(new THREE.Line(g, brMat));
    });
    root.add(holoGroup);
  }

  // Intro a particelle: dalla sfera di partenza ai vertici della mesh.
  const mPos = geo.attributes.position;
  const pCount = Math.max(0, particleCount | 0);
  const pTarget = new Float32Array(pCount * 3);
  const pStart = new Float32Array(pCount * 3);
  const pCur = new Float32Array(pCount * 3);
  const [rMin, rMax] = introRadius;
  for (let i = 0; i < pCount; i++) {
    const vi = Math.floor(Math.random() * mPos.count);
    pTarget[i * 3] = mPos.getX(vi);
    pTarget[i * 3 + 1] = mPos.getY(vi);
    pTarget[i * 3 + 2] = mPos.getZ(vi);
    const r = rMin + Math.random() * (rMax - rMin);
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pStart[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pStart[i * 3 + 1] = r * Math.cos(ph);
    pStart[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const pGeo = new THREE.BufferGeometry();
  const pAttr = new THREE.BufferAttribute(pCur, 3);
  pAttr.setUsage(THREE.DynamicDrawUsage);
  pGeo.setAttribute('position', pAttr);
  // La grandezza dei punti non segue la scala del gruppo: si moltiplica a mano.
  const pMat = new THREE.PointsMaterial({
    color: 0x9be9ff, size: 0.06 * (size / LETTER_SIZE), transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const particles = new THREE.Points(pGeo, pMat);
  particles.renderOrder = renderOrder + 2;
  particles.frustumCulled = false;
  root.add(particles);
  disposables.push(pGeo, pMat);

  let introT = 0;
  let introActive = false;
  let emphasis = 0;
  let spinAngle = 0;
  const setVisible = (v) => {
    mesh.visible = v;
    if (sparkles) sparkles.visible = v;
    edges.visible = v;
    edgesGlow.visible = v;
    halo.visible = v;
    pulses.forEach((p) => {
      p.m.visible = v;
    });
    if (holoGroup) holoGroup.visible = v;
  };
  function finishIntro() {
    introActive = false;
    particles.visible = false;
    setVisible(true);
  }
  function startIntro({ instant = false } = {}) {
    if (instant || pCount === 0) {
      finishIntro();
      return;
    }
    introT = 0;
    introActive = true;
    setVisible(false);
    particles.visible = true;
    pMat.opacity = 1;
    pCur.set(pStart);
    pAttr.needsUpdate = true;
  }

  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  function update(time, dt, { reduceMotion = false, pixelHeight = 0, viewportSize = null } = {}) {
    setResolution(viewportSize);
    if (sparkUniforms) {
      // Con "riduci animazioni" i brillantini restano fermi ma visibili.
      sparkUniforms.uTime.value = reduceMotion ? 1.0 : time;
      if (pixelHeight > 0) sparkUniforms.uPx.value = pixelHeight;
    }
    if (introActive) {
      if (reduceMotion) {
        finishIntro();
      } else {
        introT += Math.min(dt, 0.05);
        const k = easeOut(Math.min(1, introT / INTRO_S));
        for (let i = 0; i < pCount * 3; i++) pCur[i] = pStart[i] + (pTarget[i] - pStart[i]) * k;
        pAttr.needsUpdate = true;
        if (introT > INTRO_S * 0.85 && !mesh.visible) setVisible(true);
        if (introT > INTRO_S) {
          pMat.opacity = Math.max(0, 1 - (introT - INTRO_S) / INTRO_FADE_S);
          if (pMat.opacity === 0) finishIntro();
        }
      }
    }
    if (reduceMotion) {
      root.position.y = 0;
      root.rotation.y = 0;
      root.scale.setScalar(1);
      haloMat.opacity = 0.07 + emphasis * 0.05;
      faceMat.emissiveIntensity = 0.6 + emphasis * 0.4;
      return;
    }
    if (spin !== 'none') {
      if (spin === 'sway') root.rotation.y = Math.sin(time * 0.35) * swayAmount;
      else {
        spinAngle += 0.0025 * Math.min(dt * 60, 3);
        root.rotation.y = spinAngle;
      }
      root.position.y = Math.sin(time * 0.8) * 0.12;
      root.scale.setScalar(1 + Math.sin(time * 1.6) * 0.012);
    }
    paintEdges(time);
    haloMat.opacity = 0.06 + Math.sin(time * 2.2) * 0.03 + emphasis * 0.05;
    faceMat.emissiveIntensity = 0.5 + Math.sin(time * 2.2) * 0.15 + emphasis * 0.4;
    if (holoGroup) {
      holoGroup.children[0].rotation.z = time * 0.35;
      holoGroup.children[1].rotation.z = -time * 0.2;
      holoGroup.children[2].rotation.z = -time * 0.15;
    }
    placePulses(time, PULSE_SPEED);
  }

  // 0 = riposo, 1 = categoria aperta: la lettera si accende un po' di più.
  function setEmphasis(v) {
    emphasis = Math.max(0, Math.min(1, v));
  }

  function dispose() {
    group.removeFromParent();
    disposables.forEach((d) => d.dispose && d.dispose());
    disposables.length = 0;
  }

  startIntro();

  return {
    group,
    mesh,
    halfWidth: (bb.max.x - bb.min.x) / 2,
    halfHeight: (bb.max.y - bb.min.y) / 2,
    halfDepth: (bb.max.z - bb.min.z) / 2,
    update,
    startIntro,
    setEmphasis,
    dispose,
  };
}
