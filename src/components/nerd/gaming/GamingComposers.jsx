import GameCover from './GameCover';
import GameSearch from './GameSearch';
import { BUILD_INPUTS, GAMEPASS_ACTIONS, TROPHY } from './gamingPost';

// Campi strutturati dei compositori di categoria (dentro PostComposer,
// come children). Ognuno tiene il suo stato e lo passa su con onChange:
// { extra, titleId, valid }. Il gioco collegato (title_id) passa dalla
// ricerca del catalogo (GameSearch).

export function GamePicker({ platform, user, onOpenAuth, title, onChange, label = 'Gioco' }) {
  return (
    <div className="rb-gfields-game">
      <span className="rb-gfields-label">{label}</span>
      {title ? (
        <div className="rb-lfg-chosen">
          <GameCover title={title} size="sm" />
          <strong>{title.nome}</strong>
          <button type="button" className="rb-vroom-btn" onClick={() => onChange(null)}>Cambia</button>
        </div>
      ) : (
        <GameSearch platform={platform} user={user} onOpenAuth={onOpenAuth} onPick={onChange} placeholder="Cerca il gioco…" />
      )}
    </div>
  );
}

export function BuildFields({ value, onChange }) {
  const v = value ?? { fps: [], consiglio: false };
  const set = (patch) => onChange({ ...v, ...patch });
  const setFps = (i, patch) => set({ fps: v.fps.map((f, k) => (k === i ? { ...f, ...patch } : f)) });
  return (
    <div className="rb-gfields">
      <div className="rb-gfields-grid">
        {BUILD_INPUTS.map(([k, label, ph]) => (
          <label key={k}>
            {label}
            <input type="text" value={v[k] ?? ''} maxLength={80} placeholder={ph} onChange={(e) => set({ [k]: e.target.value })} />
          </label>
        ))}
        <label>
          Prezzo totale (€)
          <input type="number" min={0} step={1} value={v.prezzo ?? ''} placeholder="es. 1450" onChange={(e) => set({ prezzo: e.target.value })} />
        </label>
      </div>
      <div className="rb-gfields-fps">
        <span className="rb-gfields-label">FPS misurati</span>
        {v.fps.map((f, i) => (
          <div key={i} className="rb-gfields-fps-row">
            <input type="text" value={f.gioco ?? ''} maxLength={80} placeholder="Gioco" onChange={(e) => setFps(i, { gioco: e.target.value })} />
            <input type="text" value={f.preset ?? ''} maxLength={40} placeholder="Preset (es. 1440p Ultra)" onChange={(e) => setFps(i, { preset: e.target.value })} />
            <input type="number" min={0} value={f.fps ?? ''} placeholder="fps" onChange={(e) => setFps(i, { fps: e.target.value })} />
            <button type="button" className="rb-vroom-btn" onClick={() => set({ fps: v.fps.filter((_, k) => k !== i) })} aria-label="Togli riga">✕</button>
          </div>
        ))}
        <button type="button" className="rb-vroom-btn" onClick={() => set({ fps: [...v.fps, { gioco: '', preset: '', fps: '' }] })}>＋ Aggiungi gioco</button>
      </div>
      <label className="rb-lfg-form-check">
        <input type="checkbox" checked={Boolean(v.consiglio)} onChange={(e) => set({ consiglio: e.target.checked })} />
        🙋 Chiedo consiglio
      </label>
    </div>
  );
}

export function TrofeoFields({ value, onChange, platform, user, onOpenAuth }) {
  const v = value ?? { trofeo: '', rarita: 'oro', aiuto: false, title: null };
  const set = (patch) => onChange({ ...v, ...patch });
  return (
    <div className="rb-gfields">
      <GamePicker platform={platform} user={user} onOpenAuth={onOpenAuth} title={v.title} onChange={(t) => set({ title: t })} />
      <div className="rb-gfields-grid">
        <label>
          Trofeo
          <input type="text" value={v.trofeo} maxLength={80} placeholder="es. Platino, Boss senza danni…" onChange={(e) => set({ trofeo: e.target.value })} />
        </label>
        <label>
          Rarità
          <select value={v.rarita} onChange={(e) => set({ rarita: e.target.value })}>
            {Object.entries(TROPHY).map(([k, t]) => (
              <option key={k} value={k}>{t.label}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="rb-lfg-form-check">
        <input type="checkbox" checked={Boolean(v.aiuto)} onChange={(e) => set({ aiuto: e.target.checked })} />
        🙋 Chiedo aiuto per sbloccarlo
      </label>
    </div>
  );
}

export function GamePassFields({ value, onChange, platform, user, onOpenAuth }) {
  const v = value ?? { azione: 'consiglio', data: '', title: null };
  const set = (patch) => onChange({ ...v, ...patch });
  return (
    <div className="rb-gfields">
      <GamePicker platform={platform} user={user} onOpenAuth={onOpenAuth} title={v.title} onChange={(t) => set({ title: t })} />
      <div className="rb-gfields-grid">
        <label>
          Cosa succede
          <select value={v.azione} onChange={(e) => set({ azione: e.target.value })}>
            {Object.entries(GAMEPASS_ACTIONS).map(([k, a]) => (
              <option key={k} value={k}>{a.icon} {a.label}</option>
            ))}
          </select>
        </label>
        {v.azione !== 'consiglio' && (
          <label>
            Data
            <input type="date" value={v.data} onChange={(e) => set({ data: e.target.value })} />
          </label>
        )}
      </div>
    </div>
  );
}

// Clip: solo il gioco collegato, facoltativo.
export function ClipFields({ value, onChange, platform, user, onOpenAuth }) {
  const v = value ?? { title: null };
  return (
    <div className="rb-gfields">
      <GamePicker platform={platform} user={user} onOpenAuth={onOpenAuth} title={v.title} onChange={(t) => onChange({ ...v, title: t })} label="Gioco (facoltativo)" />
    </div>
  );
}
