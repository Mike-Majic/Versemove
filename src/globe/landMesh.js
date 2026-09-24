// Continenti del globo grande come UN SOLO oggetto: tutte le calotte in una
// Mesh e tutti i contorni in una LineSegments (mergeGeometries), invece del
// layer polygonsData di react-globe.gl, che crea per ogni poligono una Mesh
// con due materiali (lato + calotta: due draw call, anche col lato
// trasparente al 100%) più una LineSegments. Con land-110m sono 125
// poligoni: ~375 draw call solo per i continenti, ora 2.
//
// Geometrie e parametri sono gli stessi di three-globe (PolygonsLayer):
// ConicPolygonGeometry dal centro al raggio del globo con la sola calotta,
// GeoJsonGeometry per il contorno, risoluzione 5°, scala 1 + altitudine
// (il contorno 1e-4 più su, per non litigare col riempimento).
import * as THREE from 'three';
import ConicPolygonGeometry from 'three-conic-polygon-geometry';
import GeoJsonGeometry from 'three-geojson-geometry';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const GLOBE_RADIUS = 100;
const CURVATURE_RESOLUTION_DEG = 5;

function polygonsOf(features) {
  const polygons = [];
  features.forEach((feature) => {
    const geometry = feature.geometry;
    if (geometry?.type === 'Polygon') polygons.push(geometry.coordinates);
    else if (geometry?.type === 'MultiPolygon') polygons.push(...geometry.coordinates);
  });
  return polygons;
}

function mergeAndDispose(geometries) {
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((g) => g.dispose());
  return merged;
}

export function buildLandMesh(features, { altitude = 0.006 } = {}) {
  const polygons = polygonsOf(features);
  const capGeometry = mergeAndDispose(
    polygons.map((coords) => new ConicPolygonGeometry(coords, 0, GLOBE_RADIUS, false, true, false, CURVATURE_RESOLUTION_DEG))
  );
  const strokeGeometry = mergeAndDispose(
    polygons.map((coords) => new GeoJsonGeometry({ type: 'Polygon', coordinates: coords }, GLOBE_RADIUS, CURVATURE_RESOLUTION_DEG))
  );

  const capMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, depthWrite: true });
  const strokeMaterial = new THREE.LineBasicMaterial();
  const cap = new THREE.Mesh(capGeometry, capMaterial);
  const stroke = new THREE.LineSegments(strokeGeometry, strokeMaterial);
  cap.scale.setScalar(1 + altitude);
  stroke.scale.setScalar(1 + altitude + 1e-4);

  const group = new THREE.Group();
  group.name = 'rb-land';
  group.add(cap, stroke);

  // Stessi colori di prima col layer di react-globe.gl: il riempimento
  // arrivava come stringa rgba() costruita dai componenti di THREE.Color (già
  // convertiti nello spazio lineare) e three-globe la rileggeva come sRGB.
  // Il risultato è un po' più scuro del colore del mondo: è l'aspetto a cui
  // tutti i mondi sono stati tarati, quindi resta identico.
  const setColors = ({ fillColor, fillOpacity = 0.1, strokeColor }) => {
    const c = new THREE.Color(fillColor);
    capMaterial.color.setRGB(Math.round(c.r * 255) / 255, Math.round(c.g * 255) / 255, Math.round(c.b * 255) / 255, THREE.SRGBColorSpace);
    capMaterial.opacity = fillOpacity;
    capMaterial.transparent = fillOpacity < 1;
    strokeMaterial.color.set(strokeColor);
  };

  const dispose = () => {
    capGeometry.dispose();
    strokeGeometry.dispose();
    capMaterial.dispose();
    strokeMaterial.dispose();
  };

  return { group, setColors, dispose };
}
