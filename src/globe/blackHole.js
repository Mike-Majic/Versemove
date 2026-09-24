import * as THREE from 'three';
import { getDotTexture } from './dotTexture';

// Buco nero al posto del satellite di un mondo disattivato dall'utente
// (Impostazioni -> Mondi). Traduzione in three.js del prototipo
// buco_nero_animazione.html: stessi tempi, stesse proporzioni, stessi
// colori. Il prototipo lavorava in pixel su un satellite di raggio 42 px;
// qui tutto è in unità del satellite (SATELLITE_RADIUS = 30), quindi un
// "pixel del prototipo" vale 30/42 unità e il buco scala insieme al
// satellite (stessa scala del gruppo, vedi update() in satelliteGlobes.js).
//
// Pezzi (tutti in un gruppo "cartellone" sempre rivolto alla camera e
// spostato un po' verso di lei, così il nucleo opaco del satellite non li
// copre mentre il mondo viene risucchiato):
// - alone (lente gravitazionale) nel colore del mondo;
// - metà posteriore del disco di accrescimento (particelle);
// - arco di luce deviata + anello di fotoni;
// - orizzonte degli eventi (disco nero);
// - puntini che cadono a spirale verso il centro, con scia;
// - metà anteriore del disco, davanti al nero;
// - lampo finale nel colore del mondo.
// L'ordine di disegno lo decide renderOrder (sono tutti trasparenti), non
// la profondità: è così che il nero copre la metà posteriore del disco.

export const PX = 30 / 42;
const TILT = 0.28; // schiacciamento del disco visto quasi di taglio
const DISK_COUNT = 360;
const INFALL_COUNT = 40;
const INFALL_TRAIL = 12;
const INFALL_TRAIL_CALM = 6;
const DOT_VISIBLE = 0.7; // frazione del quadrato della dotTexture che si vede davvero
const CREAM = new THREE.Color().setRGB(1, 0.96, 0.9, THREE.SRGBColorSpace);
const GLOW_GAIN = 0.5;
const FLASH_GAIN = 0.6;
// Solo l'anello più interno del disco resta crema, il resto prende il
// colore del mondo.
const CREAM_HEAT = 0.92;

// Colore del mondo più acceso per disco, alone e puntini che cadono:
// saturazione +25% e luminosità +10% (in HSL, sRGB), entro i limiti.
function accentOf(color) {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl, THREE.SRGBColorSpace);
  return new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.25), Math.min(1, hsl.l * 1.1), THREE.SRGBColorSpace);
}

// Durate (in secondi) della disattivazione e della riattivazione.
export const COLLAPSE_S = 7;
export const REVIVE_S = 1.6;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Fasi della disattivazione, t in secondi dall'inizio (Infinity = buco nero
// già stabile, per i mondi disattivati prima di aprire l'app):
// 0-1,5 nasce il buco, 1,5-4,5 il globo viene risucchiato, 4,5-5,4 lampo,
// da 4,8 buco nero stabile che poi si "calma" (meno puntini, un po' meno
// luce e metà velocità di rotazione, ma la stessa grandezza).
//
// Grandezza finale: l'anello di luce intorno al nero ha lo stesso raggio
// del satellite che c'era prima (richiesta esplicita: nel prototipo il
// buco finiva più piccolo dei satelliti). Il nero cresce durante la
// nascita e il risucchio fino a quella misura e poi resta lì.
const RING_RADIUS_FACTOR = 1.08; // anello di fotoni a 1,08 h (vedi ring più giù)
const FINAL_SIZE_PX = (0.95 * (30 / PX)) / RING_RADIUS_FACTOR;
export function collapsePhase(t) {
  const born = clamp01(t / 1.5);
  const suck = clamp01((t - 1.5) / 3);
  const flash = t >= 4.5 && t < 5.4 ? Math.sin(clamp01((t - 4.5) / 0.9) * Math.PI) : 0;
  const stable = clamp01((t - 4.8) / 1.2);
  const calm = clamp01((t - 5.7) / 1.3);
  const sizePx = 3 + (FINAL_SIZE_PX - 3) * (0.6 * ease(born) + 0.4 * ease(suck));
  const strength = clamp01(born * 0.8 + suck * 0.2 + stable * 0.2) * (1 - 0.15 * calm);
  const infall = strength * (0.4 + 0.6 * stable + 0.4 * suck) * (1 - 0.25 * calm);
  return { born, suck, flash, stable, calm, sizePx, strength, infall, oldLabel: 1 - clamp01(suck / 0.85), newLabel: stable };
}

// Riattivazione: il buco si spegne e si restringe mentre il globo si
// "srotola" fuori dalla spirale (lo stesso effetto del risucchio, al contrario).
export function revivePhase(t) {
  const end = collapsePhase(Infinity);
  const fade = clamp01(t / 0.9);
  return {
    born: 1,
    suck: 1 - ease(clamp01(t / 1.2)),
    flash: 0,
    stable: 1,
    calm: 1,
    sizePx: end.sizePx * (1 - 0.6 * fade),
    strength: end.strength * (1 - fade),
    infall: end.infall * (1 - fade),
    oldLabel: clamp01((t - 0.8) / 0.8),
    newLabel: 1 - clamp01(t / 0.5),
  };
}

// Stiramento a spirale del globo che viene risucchiato, fatto nel vertex
// shader dei materiali del satellite (nucleo, rete, nodi, continenti) con un
// solo uniform condiviso: nessuna geometria nuova, niente calcoli per
// vertice in JS. Stessa formula del prototipo, in spazio vista attorno al
// centro del satellite: ogni vertice cade con un suo ritardo (i nodi non
// spariscono tutti insieme), gira sempre più in fretta avvicinandosi al
// centro e viene stirato in orizzontale come il disco.
export function addSuckWarp(material, suckUniform) {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    shader.uniforms.uSuck = suckUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uSuck;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  if ( uSuck > 0.0 ) {
    vec4 rbCenter = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
    float rbScale = length( modelViewMatrix[ 0 ].xyz ) * ${PX.toFixed(6)};
    vec2 rbD = ( mvPosition.xy - rbCenter.xy ) / rbScale;
    float rbDist = length( rbD );
    float rbAng = atan( rbD.y, rbD.x );
    float rbDelay = fract( sin( dot( position, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ) * 0.35;
    float rbK = clamp( ( uSuck - rbDelay ) / ( 1.0 - rbDelay ), 0.0, 1.0 );
    float rbE = rbK * rbK * rbK;
    float rbNd = rbDist * ( 1.0 - rbE );
    float rbNa = rbAng - rbE * ( 5.0 + 900.0 / ( rbNd + 30.0 ) );
    float rbS = sin( rbK * PI );
    vec2 rbP = vec2( cos( rbNa ) * rbNd * ( 1.0 + 0.9 * rbS ), sin( rbNa ) * rbNd * ( 1.0 - 0.45 * rbS ) );
    mvPosition.xy = rbCenter.xy + rbP * rbScale;
    mvPosition.z = mix( mvPosition.z, rbCenter.z, rbE );
    gl_Position = projectionMatrix * mvPosition;
  }`
      );
  };
  material.customProgramCacheKey = () => `${prevKey}|rb-suck`;
  material.needsUpdate = true;
}

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// THREE.Color tiene i valori in spazio lineare: per disegnare su canvas
// servono di nuovo in sRGB.
const _rgb = { r: 0, g: 0, b: 0 };
function rgba(color, a) {
  color.getRGB(_rgb, THREE.SRGBColorSpace);
  return `rgba(${Math.round(_rgb.r * 255)},${Math.round(_rgb.g * 255)},${Math.round(_rgb.b * 255)},${a})`;
}

function makeSprite(texture, renderOrder, blending = THREE.NormalBlending) {
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, blending });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = renderOrder;
  return sprite;
}

// Particelle con colore (RGBA) e grandezza per punto: PointsMaterial di
// sempre (texture tonda, attenuazione con la distanza) più un attributo
// aSize che moltiplica la grandezza.
function makeParticles(capacity, renderOrder) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  // Il cartellone si muove con la camera: niente culling su una sfera
  // calcolata una volta sola da posizioni ancora vuote.
  const material = new THREE.PointsMaterial({
    size: 1,
    map: getDotTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSize;')
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
  };
  material.customProgramCacheKey = () => 'rb-black-hole-points';
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = renderOrder;
  return points;
}

function writeParticle(points, i, x, y, z, color, alpha, sizeUnits) {
  const { position, color: col, aSize } = points.geometry.attributes;
  position.array[i * 3] = x;
  position.array[i * 3 + 1] = y;
  position.array[i * 3 + 2] = z;
  col.array[i * 4] = color.r;
  col.array[i * 4 + 1] = color.g;
  col.array[i * 4 + 2] = color.b;
  col.array[i * 4 + 3] = alpha;
  aSize.array[i] = sizeUnits;
}

function flushParticles(points, count) {
  const { position, color, aSize } = points.geometry.attributes;
  position.needsUpdate = true;
  color.needsUpdate = true;
  aSize.needsUpdate = true;
  points.geometry.setDrawRange(0, count);
}

// Generatore deterministico (stesso buco nero a ogni apertura dell'app).
function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function buildBlackHole(world, seed = 7) {
  const color = new THREE.Color(world.color);
  const accent = accentOf(color);
  // Crema e colore del mondo a metà, per l'arco di luce: il bordo prende il
  // colore del mondo invece di restare solo crema.
  const arcMid = new THREE.Color(1, 236 / 255, 210 / 255).convertSRGBToLinear().lerp(accent, 0.5);
  const rnd = seededRandom(seed);
  const disk = Array.from({ length: DISK_COUNT }, () => ({
    a: rnd() * Math.PI * 2,
    // Disco più raccolto del prototipo (lì arrivava a 3,65 h): con il nero
    // grande quanto un satellite sarebbe diventato enorme.
    rr: 1.2 + Math.pow(rnd(), 1.6) * 1.3,
    sp: 0.6 + rnd() * 0.8,
    s: 0.6 + rnd() * 1.6,
  }));
  const infall = Array.from({ length: INFALL_COUNT }, () => ({
    a: rnd() * Math.PI * 2,
    r0: 140 + rnd() * 260,
    ph: rnd(),
    sp: 0.1 + rnd() * 0.12,
  }));

  const group = new THREE.Group();

  // Alone: gradiente radiale dal bordo del nero (0,9 h) fino a 4,2 h.
  const glow = makeSprite(
    canvasTexture(128, (ctx, size) => {
      const c = size / 2;
      const g = ctx.createRadialGradient(c, c, c * (0.9 / 4.2), c, c, c);
      g.addColorStop(0, rgba(accent, 0.32));
      g.addColorStop(0.4, rgba(accent, 0.12));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }),
    3
  );

  // Arco di luce deviata sopra il buco + anello di fotoni: il quadrato
  // copre ±1,6 h.
  const ring = makeSprite(
    canvasTexture(256, (ctx, size) => {
      const c = size / 2;
      const h = size / 3.2;
      ctx.lineWidth = h * 0.22;
      const arc = ctx.createLinearGradient(c - h * 1.6, 0, c + h * 1.6, 0);
      arc.addColorStop(0, rgba(accent, 0));
      arc.addColorStop(0.5, rgba(arcMid, 0.55));
      arc.addColorStop(1, rgba(accent, 0));
      ctx.strokeStyle = arc;
      ctx.beginPath();
      ctx.ellipse(c, c, h * 1.35, h * 1.35, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,220,0.85)';
      ctx.lineWidth = Math.max(2, h * 0.09);
      ctx.beginPath();
      ctx.arc(c, c, h * 1.08, 0, Math.PI * 2);
      ctx.stroke();
    }),
    5
  );

  // Orizzonte degli eventi: nero pieno con un bordo appena sfumato (±1,05 h).
  const core = makeSprite(
    canvasTexture(128, (ctx, size) => {
      const c = size / 2;
      const g = ctx.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, '#000');
      g.addColorStop(0.92, '#000');
      g.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, c * (1.03 / 1.05), 0, Math.PI * 2);
      ctx.fill();
    }),
    7
  );

  // Lampo finale: raggio 160 px del prototipo.
  const flash = makeSprite(
    canvasTexture(128, (ctx, size) => {
      const c = size / 2;
      const g = ctx.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, 'rgba(255,240,220,0.9)');
      g.addColorStop(0.3, rgba(color, 0.5));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }),
    9,
    THREE.AdditiveBlending
  );
  flash.scale.setScalar(2 * 160 * PX);

  const diskBack = makeParticles(DISK_COUNT, 4);
  const diskFront = makeParticles(DISK_COUNT, 8);
  const infallPoints = makeParticles(INFALL_COUNT * INFALL_TRAIL, 6);

  group.add(glow, diskBack, ring, infallPoints, core, diskFront, flash);

  const sprites = [glow, ring, core, flash];
  const allPoints = [diskBack, diskFront, infallPoints];

  // Tempo di rotazione accumulato: avanza come t, ma a buco nero "calmo"
  // a metà velocità (segue phase.calm da 0 a 1, quindi senza scatti).
  // Con t assoluto cambiare la velocità farebbe saltare i puntini.
  let spinT = 0;
  let lastT = null;

  // t: tempo delle particelle (s, fermo con "Riduci animazioni");
  // phase: collapsePhase/revivePhase; fade: foschia/comparsa del satellite;
  // pointScale: scala del satellite (la grandezza dei punti in pixel non
  // segue la scala del gruppo da sola).
  function update(t, phase, fade, pointScale) {
    const size = phase.sizePx * PX;
    const delta = lastT === null ? 0 : Math.max(0, t - lastT);
    lastT = t;
    spinT += delta * (1 - 0.5 * phase.calm);
    const visible = phase.sizePx > 0.5 && fade > 0.001 && (phase.strength > 0.001 || phase.flash > 0.001);
    group.visible = visible;
    if (!visible) return;

    // three.js fonde i trasparenti in spazio lineare: un velo al 20% sul nero
    // esce molto più chiaro che nel canvas 2D del prototipo. GLOW_GAIN e
    // FLASH_GAIN riportano alone e lampo alla luminosità del disegno.
    glow.scale.setScalar(size * 6);
    glow.material.opacity = phase.strength * GLOW_GAIN * fade;
    ring.scale.setScalar(size * 3.2);
    ring.material.opacity = phase.strength * fade;
    core.scale.setScalar(size * 2.1);
    core.material.opacity = Math.min(1, phase.strength * 3) * fade;
    flash.visible = phase.flash > 0.001;
    flash.material.opacity = phase.flash * FLASH_GAIN * fade;

    // Disco di accrescimento: metà anteriore (in basso, verso chi guarda)
    // e posteriore (in alto, dietro al nero) in due Points separati.
    let back = 0;
    let front = 0;
    for (const p of disk) {
      const a = p.a + spinT * p.sp * (2.6 / p.rr);
      const sa = Math.sin(a);
      const R = size * p.rr;
      const isFront = sa >= 0;
      const heat = clamp01(1.6 - p.rr * 0.45);
      const alpha = phase.strength * (0.35 + 0.55 * heat) * (isFront ? 1 : 0.75) * fade;
      const radiusPx = p.s * (0.6 + heat * 0.7);
      const sizeUnits = ((radiusPx * 2 * PX) / DOT_VISIBLE) * pointScale;
      const x = Math.cos(a) * R;
      const y = -sa * R * TILT;
      const z = sa * R * 0.3;
      const c = heat > CREAM_HEAT ? CREAM : accent;
      if (isFront) writeParticle(diskFront, front++, x, y, z, c, alpha, sizeUnits);
      else writeParticle(diskBack, back++, x, y, z, c, alpha, sizeUnits);
    }
    flushParticles(diskBack, back);
    flushParticles(diskFront, front);

    // Puntini risucchiati a spirale, con scia. A buco "calmo" arrivano da
    // molto più vicino e ne resta uno su tre, con la scia più corta.
    let n = 0;
    if (phase.infall > 0.001) {
      const calm = phase.calm;
      const reach = 1 - 0.7 * calm;
      const tail = calm > 0.5 ? INFALL_TRAIL_CALM : INFALL_TRAIL;
      infall.forEach((p, idx) => {
        if (calm > 0.5 && idx % 3 !== 0) return;
        const k = (spinT * p.sp + p.ph) % 1;
        const r0Px = phase.sizePx + (p.r0 - phase.sizePx) * reach;
        for (let s = 0; s < tail; s++) {
          const kk = Math.max(0, k - s * 0.01);
          const rs = (phase.sizePx * 1.1 + (r0Px - phase.sizePx) * Math.pow(1 - kk, 1.7)) * PX;
          const as = p.a + kk * 7;
          const alpha = phase.infall * (0.8 - s * 0.055) * Math.min(1, k * 3) * fade;
          const radiusPx = Math.max(0.3, 1.6 - s * 0.1);
          writeParticle(infallPoints, n++, Math.cos(as) * rs, -Math.sin(as) * rs * 0.8, 0, accent, Math.max(0, alpha), ((radiusPx * 2 * PX) / DOT_VISIBLE) * pointScale);
        }
      });
    }
    flushParticles(infallPoints, n);
  }

  function dispose() {
    sprites.forEach((s) => {
      s.material.map.dispose();
      s.material.dispose();
    });
    allPoints.forEach((p) => {
      p.geometry.dispose();
      p.material.dispose();
    });
  }

  return { group, update, dispose };
}

// Scritta "DISATTIVATO" sotto il nome del mondo, arancione come nel
// prototipo. Altezza in unità del satellite.
export function makeDisabledTagSprite(height) {
  const canvas = document.createElement('canvas');
  const scale = 4;
  const w = 180;
  const h = 28;
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.font = '700 17px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(6, 4, 12, 0.55)';
  const tw = ctx.measureText('DISATTIVATO').width + 16;
  ctx.beginPath();
  ctx.roundRect?.(w / 2 - tw / 2, 2, tw, h - 4, 6);
  ctx.fill();
  ctx.fillStyle = '#ff9a2e';
  ctx.fillText('DISATTIVATO', w / 2, h / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((height * w) / h, height, 1);
  sprite.renderOrder = 10;
  return sprite;
}
