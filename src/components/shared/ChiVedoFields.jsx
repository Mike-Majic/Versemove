import CityAutocomplete from './CityAutocomplete';
import { CITY_DATA_CREDIT } from '../../data/citta';
import './ChiVedoFields.css';

// Controlli "Chi vedo", uguali in Profilo Social, Profilo di Lavoro e
// Profilo Incontri: zona di ricerca (vuoto = la propria città), distanza
// massima (5-300 km oppure ovunque) ed età a doppio cursore con "fuori
// fascia". value = { zona: { text, geo }, ovunque, distanza, etaMin, etaMax,
// espandiEta }; onChange(patch) riceve solo i campi cambiati.
// showEta: false nel mondo Lavoro (nessun filtro per età) e per i minorenni.
// distanceExtra / children: controlli in più del Profilo Incontri.
// classes: classi dei campi, per lo stile del profilo che lo ospita.

export const DIST_MIN = 5;
export const DIST_MAX = 300;
export const ETA_MIN = 18;
export const ETA_MAX = 99;

const DEFAULT_CLASSES = { field: 'rb-cv-field', check: 'rb-cv-check', range2: 'rb-cv-range2' };

export default function ChiVedoFields({ value, onChange, zonaPlaceholder = 'Vuoto = la mia città', showEta = true, distanceExtra = null, children = null, classes = DEFAULT_CLASSES }) {
  const { zona, ovunque, distanza, etaMin, etaMax, espandiEta } = value;
  return (
    <>
      <div className={classes.field}>
        <span>Zona di ricerca</span>
        <CityAutocomplete
          value={zona.text}
          pickedValue={zona.geo ? zona.text : ''}
          placeholder={zonaPlaceholder}
          onChange={(t) => onChange({ zona: { text: t, geo: null } })}
          onPick={(c) => onChange({ zona: { text: c.nomeMostrato, geo: c.geonameId } })}
        />
        <small className="rb-cv-credit">{CITY_DATA_CREDIT}</small>
      </div>
      <div className={classes.field}>
        <span>Distanza massima: {ovunque ? 'ovunque' : `${distanza} km`}</span>
        <input
          type="range"
          min={DIST_MIN}
          max={DIST_MAX}
          step={5}
          value={distanza}
          disabled={ovunque}
          aria-label="Distanza massima"
          onChange={(e) => onChange({ distanza: Number(e.target.value) })}
        />
        <label className={classes.check}>
          <input type="checkbox" checked={ovunque} onChange={(e) => onChange({ ovunque: e.target.checked })} />
          <span>Ovunque</span>
        </label>
        {distanceExtra}
      </div>
      {showEta && (
        <div className={classes.field}>
          <span>
            Età: {etaMin}–{etaMax}
          </span>
          <div className={classes.range2}>
            <input
              type="range"
              min={ETA_MIN}
              max={ETA_MAX}
              value={etaMin}
              aria-label="Età minima"
              onChange={(e) => onChange({ etaMin: Math.min(Number(e.target.value), etaMax) })}
            />
            <input
              type="range"
              min={ETA_MIN}
              max={ETA_MAX}
              value={etaMax}
              aria-label="Età massima"
              onChange={(e) => onChange({ etaMax: Math.max(Number(e.target.value), etaMin) })}
            />
          </div>
          <label className={classes.check}>
            <input type="checkbox" checked={espandiEta} onChange={(e) => onChange({ espandiEta: e.target.checked })} />
            <span>Mostra persone leggermente fuori fascia</span>
          </label>
        </div>
      )}
      {children}
    </>
  );
}
