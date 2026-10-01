import { useEffect, useState } from 'react';
import ChiVedoFields from './shared/ChiVedoFields';
import { getVistaPreferenze, saveVistaPreferenze } from '../data/vista';

// "Chi vedo" del Profilo Social (zona, distanza, età) e del Profilo di
// Lavoro (solo zona e distanza: nel mondo Lavoro nessun filtro per età o
// sesso, per nessun tipo di account). Salvato sul server
// (save_vista_preferenze): vale su tutti i dispositivi e globe_users lo
// applica già.
export default function VistaPreferenzeCard({ ambito }) {
  const [value, setValue] = useState(null);
  const [adulto, setAdulto] = useState(false);
  const [mia, setMia] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    getVistaPreferenze().then((v) => {
      if (cancelled) return;
      const p = v?.[ambito] ?? {};
      setAdulto(Boolean(v?.adulto));
      setMia(p.geo ? '' : p.centro?.nome ?? '');
      setValue({
        zona: { text: p.geo_nome ?? '', geo: p.geo ?? null },
        ovunque: p.distanza_km == null,
        distanza: p.distanza_km ?? 100,
        etaMin: p.eta_min ?? 18,
        etaMax: p.eta_max ?? 99,
        espandiEta: Boolean(p.espandi_eta),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [ambito]);

  if (!value) return <p className="rb-profile-link-hint">Caricamento…</p>;

  const showEta = ambito === 'social' && adulto;

  const save = async () => {
    setError('');
    setSuccess('');
    if (value.zona.text.trim() && !value.zona.geo) {
      setError("Per la zona di ricerca scegli la città dall'elenco (o lascia vuoto per usare la tua).");
      return;
    }
    setBusy(true);
    const prefs = {
      geo: value.zona.text.trim() ? value.zona.geo : null,
      distanza_km: value.ovunque ? null : value.distanza,
    };
    if (ambito === 'social') Object.assign(prefs, { eta_min: value.etaMin, eta_max: value.etaMax, espandi_eta: value.espandiEta });
    const { error: err } = await saveVistaPreferenze(ambito, prefs);
    setBusy(false);
    if (err) setError(err);
    else setSuccess('Preferenze salvate: il globo mostra solo chi rientra.');
  };

  return (
    <div className="rb-profile-field-group">
      <div className="rb-profile-field-title">
        <strong>Chi vedo</strong>
      </div>
      <ChiVedoFields
        value={value}
        onChange={(patch) => {
          setSuccess('');
          setValue((v) => ({ ...v, ...patch }));
        }}
        zonaPlaceholder={mia ? `Vuoto = ${mia}` : 'Vuoto = la mia città'}
        showEta={showEta}
      />
      {error && <p className="rb-profile-field-error">{error}</p>}
      {success && <p className="rb-profile-field-success">{success}</p>}
      <button type="button" className="rb-profile-save-btn" onClick={save} disabled={busy}>
        {busy ? 'Un attimo…' : 'Salva'}
      </button>
    </div>
  );
}
