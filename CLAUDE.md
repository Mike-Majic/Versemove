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
- **Mondo Lavoro sempre visibile alle aziende:** chi dà il consenso ed entra
  nel mondo Lavoro è sempre visibile alle aziende verificate ("Cerca
  candidati"). Niente interruttore "Visibile alle aziende": chi non vuole
  comparire disattiva il mondo Lavoro dalle Impostazioni.
  `lavoro_visibile_aziende` la calcola il server, il frontend non la scrive.
- **Mondo Incontri "vedi solo se sei visibile":** chi non ha completato il
  Profilo Incontri non è visibile e non vede nessuno. Al posto di globo,
  Match, Mi piace ricevuti, Preferiti, Videochiamata e schede aperte da un
  link c'è il pannello "cosa manca" (`IncontriGatePanel`). Il proprietario
  (`ruolo === 'owner'`) vede sempre tutto.
- **Nessun utente sul globo in Vetrina, Animali, Annunci e Intrattenimento:** in questi mondi
  (`noGlobeUsers: true` in `src/data/worlds.js`) niente avatar, grumi né
  pallini utenti, a qualsiasi zoom, e nessuna chiamata a `fetchGlobeUsers`.
  Restano marker di eventi/annunci/luoghi, categorie e contatore in alto.
- **Icona del mondo "Work in progress" nel selettore:** blu elettrico
  `selectorColor: '#0a84ff'`; il `color` del mondo resta `#ffffff` (puntini
  bianchi del satellite).
- **Valigetta mondo Lavoro: 3D cromo con contorno nero (A2), ferma:** in
  `src/globe/briefcase3d.js`, montata da `categoryShell.js` al posto della
  sagoma piatta 'briefcase'. Si muove solo col globo (hover/attiva: +8% al
  massimo). Env map solo sui suoi materiali, mai `scene.environment`.
- **Categorie mondo Annunci: modelli 3D cromo con contorno arancione
  #ff8a1f, fermi:** auto, moto, bici, barca a vela, casa, maglietta, pacco
  (`src/globe/annunciModels3d.js`, misure del riferimento approvato). Stesso
  sistema della valigetta: kit condiviso `src/globe/categoryModels3d.js`
  (env map unica, materiali, helper), mai `scene.environment`.
- **Categorie mondo Vetrina: modelli 3D cromo con contorno rosa #ec4899,
  fermi:** i 14 modelli del riferimento approvato
  (`src/globe/vetrinaModels3d.js`; maglietta e auto sono quelle di Annunci),
  sopra al triangolo di sempre (invisibile ma cliccabile), mai più grandi
  del triangolo. Stesso kit `categoryModels3d.js`; il portatile resta
  inclinato verso chi guarda (rotation.x = 0.75).
- **Stelle Intrattenimento:** fillColor #a78bfa, fillOpacity 0.42,
  activeOpacity 0.7 (`CATEGORY_LOOK_BY_WORLD.arte` in `src/components/WorldGlobe.jsx`).
- **Categorie mondo Nerd: modelli 3D cromo con contorno lime #d4f634, fermi,
  senza marchi sui modelli console:** i 9 modelli del riferimento approvato
  (`src/globe/nerdModels3d.js`) sopra agli UFO piatti (invisibili ma
  cliccabili). Stesso kit `categoryModels3d.js`; joystick arcade inclinato
  (rotation.x = 0.65) e dado ruotato su tre facce restano così.
- **Cuori mondo Incontri:** sizeFactor 0.62, fillOpacity 0.5,
  activeOpacity 0.8, rosso puro del mondo (#ff0000, niente fillColor)
  (`CATEGORY_LOOK_BY_WORLD.incontri` in `src/components/WorldGlobe.jsx`).
- **Posizioni categorie FAQ** (`src/data/faqCategories.js`, `exactAnchor: true`):
  Stanza MOD al polo nord (lat 90, lng 0, rossa, solo staff), Suggerimenti
  al centro della vista frontale (lat 0, lng -20), Community sul lato
  opposto (lat 0, lng 160). INFO BAN, Segnalazioni e Informazioni restano
  dove sono.
- **Mondo FAQ:** nuvole fillOpacity 0.9 / activeOpacity 1 con bordo
  arcobaleno fermo; icona FAQ del selettore con anello multicolore.
- **Modelli 3D più piccoli in Annunci, Vetrina e Nerd:** fattore 0.65 sulla
  scala del modello (`MODEL_SIZE_FACTOR_BY_SHAPE` in
  `src/globe/categoryShell.js`); la valigetta di Lavoro resta a 1.
  Etichetta subito sotto il modello.
- **Modelli 3D sempre rivolti alla camera:** il perno di ogni modello prende
  l'orientamento della camera × `MODEL_TILT` (Y -0.45 rad, poi X 0.22 rad,
  vista di tre quarti), ricalcolato quando camera o globo si muovono; vale
  anche con "riduci animazioni". La posizione sul globo non cambia.
- **Stanza MOD a stella:** nel mondo FAQ la categoria 'mod-room' è una
  stella a 5 punte (raggi 1 / 0.47, punta in alto) rossa #ff3b30 con bordo
  arcobaleno, al polo nord, con la punta verso il lato opposto alla vista
  frontale. Le altre categorie FAQ restano nuvole.
- **Sagome curve sopra la rete in FAQ, Intrattenimento e Incontri:**
  opzione `curved: true` in `CATEGORY_LOOK_BY_WORLD`; le sagome seguono la
  sfera a raggio 131 (rete 128 + 3), bordo arcobaleno a 131.5, etichetta a
  134. Bambini e mondi con modelli 3D non la usano.
- **Annunci, Case e Oggetti vari:** fattore 0.7 in più sulla scala del
  modello (`MODEL_EXTRA_FACTOR_BY_SHAPE`), oltre allo 0.65 del mondo.
- **Categoria mondo Animali:** cane 3D cromo con contorno sabbia #c2a878,
  larghezza circa 1/4 del raggio del globo (`MODEL_FIXED_WIDTH_BY_SHAPE.dog`
  in `src/globe/categoryShell.js`, modello in `src/globe/animaliModels3d.js`),
  sopra alla sagoma piatta (invisibile ma cliccabile), rivolto alla camera
  come gli altri modelli.
