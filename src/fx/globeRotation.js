// Rotazione automatica del globo quando nessuno interagisce (il mouse è
// uscito dal canvas su desktop, o appena montato prima del primo tocco):
// un posto a parte, fuori da components/WorldGlobe.jsx, solo per poterla
// ritoccare senza andare a cercarla in mezzo al resto della logica del
// globo (stessa idea di fx/timing.js).

// OrbitControls.autoRotateSpeed è in "gradi/frame a 60fps": un giro
// completo (360°) dura 60/IDLE_ROTATE_SPEED secondi.
// Storico: 60/7 (un giro ogni 7s, troppo veloce) -> 60/14 (un giro ogni
// 14s) -> 60/30 (un giro ogni 30s) -> 60/40 (un giro ogni 40s, "un
// pochino" più lenta ancora, richiesta esplicita dell'utente).
export const IDLE_ROTATE_SPEED = 60 / 40;

// Quanto ci mette la rotazione a passare da ferma a IDLE_ROTATE_SPEED (e
// viceversa, quando il mouse rientra): mai uno scatto istantaneo.
export const IDLE_ROTATE_EASE_MS = 1500;

// Quanto dura al massimo la rotazione automatica (da quando il mouse esce
// dal canvas) prima di fermarsi da sola, se nel frattempo il mouse non è
// rientrato — se rientra prima, si ferma subito (vedi onEnter in
// WorldGlobe.jsx). Era 10s, ora 30s: richiesta esplicita dell'utente,
// "gira per 30 secondi, poi se torno con il mouse si ferma".
export const IDLE_ROTATE_DURATION_MS = 30000;

// Rotazione propria dei satelliti (Fase 2a, un mondo = una sfera "a rete"
// che orbita attorno al globo grande, vedi globe/satelliteGlobes.js): un
// giro completo su se stessi ogni SATELLITE_SPIN_PERIOD_S secondi, uguale
// per tutti (prima era un valore casuale per satellite, 0.06-0.11 rad/s,
// cioè un giro ogni ~57-105s — qui diventa un unico valore pulito).
export const SATELLITE_SPIN_PERIOD_S = 60;
