// Rotazione automatica del globo quando nessuno interagisce (il mouse è
// uscito dal canvas su desktop, o appena montato prima del primo tocco):
// un posto a parte, fuori da components/WorldGlobe.jsx, solo per poterla
// ritoccare senza andare a cercarla in mezzo al resto della logica del
// globo (stessa idea di fx/timing.js).

// OrbitControls.autoRotateSpeed è in "gradi/frame a 60fps": un giro
// completo (360°) dura 60/IDLE_ROTATE_SPEED secondi.
// Era 60/7 (un giro ogni 7s, troppo veloce secondo l'utente), poi 60/14
// (un giro ogni 14s). Valore attuale: un giro ogni 14s, invariato — qui
// cambia solo COME si arriva a questa velocità (rampa morbida invece che
// di scatto), non la velocità di crociera in sé.
export const IDLE_ROTATE_SPEED = 60 / 14;

// Quanto ci mette la rotazione a passare da ferma a IDLE_ROTATE_SPEED (e
// viceversa, quando il mouse rientra): mai uno scatto istantaneo.
export const IDLE_ROTATE_EASE_MS = 1500;
