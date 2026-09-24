// Worker dei continenti dettagliati (vedi globe/landLod.js): scarica il
// file, costruisce le geometrie (ConicPolygonGeometry è lenta, sul thread
// principale farebbe scattare il globo) e rimanda solo array trasferibili.
import './workerWindowShim.js';
import { tileArrays } from './landGeometry.js';

const TILE_DEG = 10;

const buffersOf = (arrays) => {
  const list = [];
  for (const part of Object.values(arrays)) {
    if (part) for (const a of Object.values(part)) list.push(a.buffer);
  }
  return list;
};

const tileOf = (key, data) => {
  const [lat, lng] = key.split('_').map(Number);
  return tileArrays(data, lat, lng, TILE_DEG);
};

self.onmessage = async (event) => {
  const { id, kind, url, key } = event.data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`richiesta fallita (${res.status})`);
    const data = await res.json();
    if (kind === 'index') {
      self.postMessage({ id, data });
    } else if (kind === 'land50') {
      // Un messaggio per riquadro: il thread principale li tiene separati
      // per poter escludere quelli coperti dal 10m.
      const keys = Object.keys(data.tiles);
      for (const k of keys) {
        const arrays = tileOf(k, data.tiles[k]);
        self.postMessage({ id, key: k, arrays, partial: true }, buffersOf(arrays));
      }
      self.postMessage({ id, done: true, count: keys.length });
    } else if (kind === 'tile') {
      const arrays = tileOf(key, data);
      self.postMessage({ id, key, arrays, done: true }, buffersOf(arrays));
    }
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
