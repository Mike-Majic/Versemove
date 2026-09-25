import { FONTE_SERIE, formatEventDates } from '../../../data/cosplay';

// Campi strutturati dei compositori Cosplay (dentro PostComposer, come
// children): Galleria (personaggio, serie, fonte, fotografo, evento) e
// WIP (personaggio, serie, materiali, costo, ore, avanzamento).

export function GalleriaFields({ value, onChange, events }) {
  const v = value ?? {};
  const set = (patch) => onChange({ ...v, ...patch });
  return (
    <div className="rb-gfields">
      <div className="rb-gfields-grid">
        <label>
          Personaggio
          <input type="text" value={v.personaggio ?? ''} maxLength={80} placeholder="es. Nezuko" onChange={(e) => set({ personaggio: e.target.value })} />
        </label>
        <label>
          Serie
          <input type="text" value={v.serie ?? ''} maxLength={120} placeholder="es. Demon Slayer" onChange={(e) => set({ serie: e.target.value })} />
        </label>
        <label>
          Da
          <select value={v.fonte_serie ?? 'anime'} onChange={(e) => set({ fonte_serie: e.target.value })}>
            {Object.entries(FONTE_SERIE).map(([k, f]) => (
              <option key={k} value={k}>{f.icon} {f.label}</option>
            ))}
          </select>
        </label>
        <label>
          Fotografo
          <input type="text" value={v.fotografo ?? ''} maxLength={80} placeholder="Nome o @nick" onChange={(e) => set({ fotografo: e.target.value })} />
        </label>
        <label>
          Evento (facoltativo)
          <select value={v.evento_id ?? ''} onChange={(e) => set({ evento_id: e.target.value })}>
            <option value="">Nessun evento</option>
            {(events ?? []).map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.titolo} · {formatEventDates(ev.dataEvento, ev.dataFine)}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export function WipFields({ value, onChange }) {
  const v = value ?? { avanzamento: 50 };
  const set = (patch) => onChange({ ...v, ...patch });
  return (
    <div className="rb-gfields">
      <div className="rb-gfields-grid">
        <label>
          Personaggio
          <input type="text" value={v.personaggio ?? ''} maxLength={80} placeholder="es. Master Chief" onChange={(e) => set({ personaggio: e.target.value })} />
        </label>
        <label>
          Serie
          <input type="text" value={v.serie ?? ''} maxLength={120} placeholder="es. Halo" onChange={(e) => set({ serie: e.target.value })} />
        </label>
        <label>
          Materiali (separati da virgola)
          <input type="text" value={v.materiali ?? ''} maxLength={300} placeholder="EVA foam, worbla, resina…" onChange={(e) => set({ materiali: e.target.value })} />
        </label>
        <label>
          Costo (€)
          <input type="number" min={0} step={1} value={v.costo_eur ?? ''} placeholder="es. 180" onChange={(e) => set({ costo_eur: e.target.value })} />
        </label>
        <label>
          Ore di lavoro
          <input type="number" min={0} step={1} value={v.ore ?? ''} placeholder="es. 40" onChange={(e) => set({ ore: e.target.value })} />
        </label>
        <label>
          Avanzamento: {v.avanzamento ?? 0}%
          <input type="range" min={0} max={100} step={5} value={v.avanzamento ?? 0} onChange={(e) => set({ avanzamento: Number(e.target.value) })} />
        </label>
      </div>
    </div>
  );
}
