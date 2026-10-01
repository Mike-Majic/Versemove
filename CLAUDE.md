# Versemove

## Valori approvati, non modificare senza richiesta esplicita

Questi valori sono stati scelti e approvati dall'utente. Non cambiarli,
nemmeno "per migliorare" o come effetto collaterale di un altro lavoro,
se non è chiesto in modo esplicito.

- **Pallini che corrono sul contorno delle lettere gotiche (M e V):**
  `PULSE_SPEED = 0.045` in `src/globe/gothicLetter.js` (un giro ogni ~22 s).
- **Brillantini della V:** `SPARKLE_TIME_SCALE = 0.5` in
  `src/globe/gothicLetter.js` (lo shader riceve `time * SPARKLE_TIME_SCALE`;
  con "riduci animazioni" resta il valore fisso).
- **Lettere gotiche ferme e con bordi nitidi:** le lettere non si muovono
  né ruotano; bordi netti (LineSegments2, pixel ratio, antialias,
  polygonOffset, spigoli singoli).
- **Vista iniziale web:** distanza camera 615 (`WEB_STARTUP_DIST`),
  elevazione 4° (`STARTUP_ELEVATION_DEG`) in `src/components/WorldGlobe.jsx`.
- **Un solo percorso di codice per la scena 3D su web e telefono:** niente
  rami separati per telefono/verticale nella scena, nella camera o nei
  satelliti. Sugli schermi stretti si allarga solo il FOV verticale.
