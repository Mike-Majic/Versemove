// Movimento "salvaschermo spaziale" quando il mouse è fuori dal canvas del
// globo: niente più orbita della CAMERA attorno alla scena (era la causa
// del disorientamento segnalato — la camera che girava in fretta faceva
// "sfrecciare" i satelliti sullo schermo, alcuni passando enormi vicino
// all'obiettivo). Ora la camera resta sempre ferma: al suo posto il globo
// centrale ruota lentamente su se stesso e i satelliti continuano la loro
// orbita indipendente attorno a lui (esiste già, vedi
// globe/satelliteGlobes.js — qui si fissa solo la velocità). Tutto basato
// sul tempo reale trascorso (deltaSeconds), mai sui fotogrammi: identico a
// 60, 144 o 240Hz.

// Gradi al secondo di rotazione su se stesso del globo centrale, quando il
// mouse è fuori. Richiesta esplicita dell'utente/Cowork dopo aver misurato
// dal vivo il vecchio comportamento (camera in orbita a 15-25°/s).
export const IDLE_GLOBE_SPIN_DEG_S = 3;

// Gradi al secondo dell'orbita dei satelliti attorno al globo centrale,
// quando il mouse è fuori. L'orbita esiste già sempre (vedi
// globe/satelliteGlobes.js, ud.orbitAngle) — prima aveva una velocità
// casuale per satellite (0.02-0.05 rad/s, ~1.1-2.9°/s): qui diventa un
// valore fisso e pulito, il segno (orario/antiorario) resta casuale per
// varietà.
export const IDLE_SATELLITE_ORBIT_DEG_S = 1.5;

// Quanto ci mette il movimento (rotazione del globo + orbita dei
// satelliti) a raggiungere la velocità piena quando il mouse esce dal
// canvas (ease-in) e a tornare a 0 quando rientra (ease-out) — di
// proposito NON simmetrico: la partenza è più lenta e morbida di quanto
// sia rapido l'arresto, richiesta esplicita.
export const IDLE_EASE_IN_S = 2;
export const IDLE_EASE_OUT_S = 1;

// Rotazione propria dei satelliti (Fase 2a, un mondo = una sfera "a rete"
// che orbita attorno al globo grande, vedi globe/satelliteGlobes.js): un
// giro completo su se stessi ogni SATELLITE_SPIN_PERIOD_S secondi, uguale
// per tutti (prima era un valore casuale per satellite, 0.06-0.11 rad/s,
// cioè un giro ogni ~57-105s — qui diventa un unico valore pulito).
// Indipendente dal movimento idle sopra: continua sempre (a meno di
// "riduci animazioni", vedi satelliteGlobes.js).
export const SATELLITE_SPIN_PERIOD_S = 60;
