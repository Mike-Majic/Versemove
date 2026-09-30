// Worker dei continenti dettagliati (vedi globe/landLod.js): scarica il
// file, costruisce le geometrie (ConicPolygonGeometry è lenta, sul thread
// principale farebbe scattare il globo) e rimanda solo array trasferibili.
import './workerWindowShim.js';
import { polygonsArrays, tileArrays, combineTiles } from './landGeometry.js';

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
  const { id, kind, url, key, polygons } = event.data;
  try {
    if (kind === 'land110') {
      // Livello lontano: i poligoni arrivano già nel messaggio.
      const arrays = polygonsArrays(polygons);
      self.postMessage({ id, arrays, done: true }, buffersOf(arrays));
      return;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`richiesta fallita (${res.status})`);
    const data = await res.json();
    if (kind === 'index') {
      self.postMessage({ id, data });
    } else if (kind === 'land50') {
      // Tutto il globo in un solo gruppo di array, con l'intervallo di
      // indici di ogni riquadro (vedi combineTiles): il thread principale lo
      // carica una volta e poi spegne/accende i riquadri coperti dal 10m
      // senza mai ricostruirlo.
      const entries = Object.keys(data.tiles).map((k) => [k, tileOf(k, data.tiles[k])]);
      const { ranges, ...arrays } = combineTiles(entries);
      const transfer = [];
      for (const part of Object.values(arrays)) {
        for (const a of Object.values(part)) if (ArrayBuffer.isView(a)) transfer.push(a.buffer);
      }
      self.postMessage({ id, arrays, ranges, done: true }, transfer);
    } else if (kind === 'tile') {
      const arrays = tileOf(key, data);
      self.postMessage({ id, key, arrays, done: true }, buffersOf(arrays));
    }
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
