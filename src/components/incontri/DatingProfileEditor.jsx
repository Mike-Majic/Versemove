import { useEffect, useMemo, useRef, useState } from 'react';
import CityAutocomplete from '../shared/CityAutocomplete';
import ModalOverlay from '../ModalOverlay';
import CustomSelect from '../shared/CustomSelect';
import ChiVedoFields, { ETA_MIN } from '../shared/ChiVedoFields';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { setMyProfileCity } from '../../data/citta';
import { hasFace } from '../../data/faceCheck';
import {
  getMyDatingProfile,
  saveDatingProfile,
  completeDatingOnboarding,
  saveDatingDettagli,
  saveDatingPreferenze,
  getDatingDettagliSchema,
  addDatingPhoto,
  removeDatingPhoto,
  reorderDatingPhotos,
  updateOwnDatingProfile,
  DATING_PHOTOS_MIN,
  DATING_PHOTOS_MAX,
} from '../../data/incontri';
import {
  GENERI,
  CERCA_GENERI,
  COSA_CERCA,
  COSA_CERCA_MAX,
  DETTAGLI,
  INTERESSI,
  INTERESSI_MAX,
  datingStatusText,
  dettaglioText,
  interesseLabel,
  zodiacoLabel,
} from '../../data/datingLabels';
import './DatingProfileEditor.css';

// Profilo Incontri completo: essenziali (come ti definisci, chi vuoi
// incontrare, cosa cerchi, città, bio, foto), dettagli facoltativi e
// preferenze "Chi vedo". Lo stesso editore in "Il mio profilo" e nel passo
// facoltativo dopo la registrazione (variant="onboarding", con Salta/Salva).
// Le foto si salvano subito (aggiunta, rimozione, ordine), il resto con Salva.

const BIO_MAX = 500;
const MIN_FOTO_OPTIONS = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }));
const FACE_MISSING = 'Nella prima foto non si vede un viso: scegline una in cui si veda bene il tuo volto.';

function Chips({ options, value, onToggle, max }) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  return (
    <div className="rb-dpe-chips">
      {options.map((o) => {
        const on = selected.includes(o.id);
        const full = max && !on && selected.length >= max;
        return (
          <button key={o.id} type="button" className={`rb-dpe-chip ${on ? 'on' : ''}`} onClick={() => onToggle(o.id)} disabled={full} aria-pressed={on}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const toggleIn = (list, id, max) => (list.includes(id) ? list.filter((x) => x !== id) : max && list.length >= max ? list : [...list, id]);

// Scelta di un dettaglio in una finestrella: una sola voce (tocco di nuovo
// = nessuna) o più voci fino a max.
function DettaglioPicker({ title, options, value, max, onClose, onDone }) {
  const [draft, setDraft] = useState(value ?? (max ? [] : ''));
  const toggle = (id) => setDraft((d) => (max ? toggleIn(d, id, max) : d === id ? '' : id));
  return (
    <ModalOverlay onClose={onClose} className="rb-modal-overlay rb-dpe-picker-overlay">
      <div className="rb-dpe-picker" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {max ? <p className="rb-dpe-hint">Fino a {max} scelte.</p> : null}
        <Chips options={options} value={draft} onToggle={toggle} max={max} />
        <div className="rb-dpe-picker-actions">
          <button type="button" className="rb-dpe-btn ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="button" className="rb-dpe-btn" onClick={() => onDone(draft)}>
            Fatto
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function Section({ title, children, hint }) {
  return (
    <section className="rb-dpe-section">
      <h3>{title}</h3>
      {hint && <p className="rb-dpe-hint">{hint}</p>}
      {children}
    </section>
  );
}

export default function DatingProfileEditor({ user, onUpdateUser, variant = 'settings', onSkip, onDone }) {
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [interessiList, setInteressiList] = useState(Object.keys(INTERESSI));

  // Essenziali
  const [genere, setGenere] = useState('');
  const [cercaGeneri, setCercaGeneri] = useState([]);
  const [cosaCerca, setCosaCerca] = useState([]);
  const [consenso, setConsenso] = useState(false);
  const [city, setCity] = useState({ text: '', geo: null });
  const [bio, setBio] = useState('');
  // Dettagli
  const [dettagli, setDettagli] = useState({});
  const [lingue, setLingue] = useState([]);
  const [lingueOpen, setLingueOpen] = useState(false);
  const [picker, setPicker] = useState(null); // def di DETTAGLI o { key: 'interessi' }
  // Chi vedo
  const [zona, setZona] = useState({ text: '', geo: null });
  const [distanza, setDistanza] = useState(50);
  const [ovunque, setOvunque] = useState(false);
  const [espandiDistanza, setEspandiDistanza] = useState(true);
  const [etaMin, setEtaMin] = useState(ETA_MIN);
  const [etaMax, setEtaMax] = useState(45);
  const [espandiEta, setEspandiEta] = useState(false);
  const [minFoto, setMinFoto] = useState(1);
  const [soloConBio, setSoloConBio] = useState(false);

  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef(null);
  const initialCity = useRef({ text: '', geo: null });

  const apply = (p) => {
    setProfile(p);
    setGenere(p.genere);
    setCercaGeneri(p.cercaGeneri);
    setCosaCerca(p.cosaCerca);
    setCity({ text: p.citta, geo: p.cittaGeo });
    initialCity.current = { text: p.citta, geo: p.cittaGeo };
    setBio(p.bio);
    setDettagli(p.dettagli ?? {});
    setLingue(p.lingue ?? []);
    const pr = p.preferenze;
    if (pr) {
      setZona({ text: pr.geo_nome ?? '', geo: pr.geo ?? null });
      setOvunque(pr.distanza_km == null);
      setDistanza(pr.distanza_km ?? 50);
      setEspandiDistanza(pr.espandi_distanza ?? true);
      setEtaMin(pr.eta_min ?? ETA_MIN);
      setEtaMax(pr.eta_max ?? 45);
      setEspandiEta(Boolean(pr.espandi_eta));
      setMinFoto(pr.min_foto ?? 1);
      setSoloConBio(Boolean(pr.solo_con_bio));
    }
  };

  const reload = async () => {
    const res = await getMyDatingProfile();
    if (res.error) {
      setLoadError(res.error);
      return null;
    }
    return res.profile;
  };

  useEffect(() => {
    let cancelled = false;
    reload().then((p) => !cancelled && p && apply(p));
    getDatingDettagliSchema().then((schema) => {
      const list = schema?.multipli?.interessi?.valori;
      if (!cancelled && Array.isArray(list) && list.length) setInteressiList(list);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dopo foto/salvataggi: se manca solo la conferma, la si dà da qui.
  const refreshStatus = async () => {
    let p = await reload();
    if (p && !p.visibile && p.mancano.length === 1 && p.mancano[0] === 'conferma') {
      const res = await completeDatingOnboarding();
      if (!res.error) p = await reload();
    }
    if (p) setProfile(p);
    return p;
  };

  const interessiOptions = useMemo(() => interessiList.map((id) => ({ id, label: interesseLabel(id) })), [interessiList]);
  const hasRow = Boolean(profile?.consensoAt) || Boolean(profile?.genere);

  // --- Foto --------------------------------------------------------------
  const fotos = profile?.foto ?? [];

  const onAddPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    setPhotoBusy(true);
    if (fotos.length === 0) {
      const face = await hasFace(file);
      if (face === false) {
        setPhotoBusy(false);
        setPhotoError(FACE_MISSING);
        return;
      }
    }
    const res = await addDatingPhoto(file);
    if (res.error) setPhotoError(res.error);
    await refreshStatus();
    setPhotoBusy(false);
  };

  const onRemovePhoto = async (photo) => {
    setPhotoError('');
    setPhotoBusy(true);
    const res = await removeDatingPhoto(photo.id);
    if (res.error) setPhotoError(res.error);
    await refreshStatus();
    setPhotoBusy(false);
  };

  const onMovePhoto = async (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= fotos.length) return;
    setPhotoError('');
    if (j === 0 && fotos[i].src) {
      setPhotoBusy(true);
      const face = await hasFace(fotos[i].src);
      if (face === false) {
        setPhotoBusy(false);
        setPhotoError(FACE_MISSING);
        return;
      }
    }
    const next = [...fotos];
    [next[i], next[j]] = [next[j], next[i]];
    setProfile((p) => ({ ...p, foto: next }));
    setPhotoBusy(true);
    const res = await reorderDatingPhotos(next.map((f) => f.id));
    if (res.error) setPhotoError(res.error);
    await refreshStatus();
    setPhotoBusy(false);
  };

  // --- Salva ---------------------------------------------------------------
  const save = async () => {
    setError('');
    setSuccess('');
    const essentialsTouched = genere || cercaGeneri.length || cosaCerca.length;
    if (essentialsTouched && (!genere || !cercaGeneri.length)) {
      setError('Indica sia come ti definisci sia chi vuoi incontrare.');
      return;
    }
    if (genere && !hasRow && !consenso) {
      setError('Per salvare chi vuoi incontrare serve il tuo consenso (casella qui sopra).');
      return;
    }
    const cityChanged = city.text.trim() !== (initialCity.current.text ?? '').trim() || city.geo !== initialCity.current.geo;
    if (cityChanged && city.text.trim() && !city.geo) {
      setError("Scegli la città dall'elenco che compare mentre scrivi.");
      return;
    }
    if (zona.text.trim() && !zona.geo) {
      setError("Per la zona di ricerca scegli la città dall'elenco (o lascia vuoto per usare la tua).");
      return;
    }
    setBusy(true);
    const fail = (msg) => {
      setBusy(false);
      setError(msg);
      return null;
    };
    let rowNow = hasRow;
    if (genere && cercaGeneri.length) {
      const r = await saveDatingProfile({ genere, cercaGeneri, cosaCerca, consenso: hasRow || consenso });
      if (r.error) return fail(r.error);
      rowNow = true;
    }
    let cittaNome = profile?.citta ?? '';
    let cittaGeo = profile?.cittaGeo ?? null;
    if (cityChanged) {
      const r = await setMyProfileCity('incontri', city.text.trim() ? city.geo : null);
      if (r.error) return fail(r.error);
      cittaNome = r.nome ?? '';
      cittaGeo = cittaNome ? city.geo : null;
    }
    if (cityChanged || bio.trim() !== (profile?.bio ?? '')) {
      const r = await updateOwnDatingProfile(cittaNome, bio.trim());
      if (r.error) return fail(r.error);
    }
    if (rowNow) {
      const r1 = await saveDatingDettagli(dettagli, lingue);
      if (r1.error) return fail(r1.error);
      const r2 = await saveDatingPreferenze({
        geo: zona.text.trim() ? zona.geo : null,
        distanza_km: ovunque ? null : distanza,
        espandi_distanza: espandiDistanza,
        eta_min: etaMin,
        eta_max: etaMax,
        espandi_eta: espandiEta,
        min_foto: minFoto,
        solo_con_bio: soloConBio,
        // Gli interessi restano solo nel proprio profilo (Dettagli): i filtri
        // per interesse salvati in passato si azzerano.
        interessi: [],
      });
      if (r2.error) return fail(r2.error);
    }
    const p = await refreshStatus();
    setBusy(false);
    if (p) apply(p);
    onUpdateUser?.({ ...user, citta: cittaNome, cittaIncontriGeo: cittaGeo, bio: bio.trim(), lingueParlate: lingue });
    setSuccess(
      rowNow
        ? 'Profilo Incontri salvato.'
        : 'Città e bio salvate. Dettagli e "Chi vedo" si salvano dopo aver indicato come ti definisci e chi vuoi incontrare.'
    );
    return p;
  };

  const saveAndClose = async () => {
    const p = await save();
    if (p) onDone?.(p);
  };

  if (loadError) return <p className="rb-dpe-error">{loadError}</p>;
  if (!profile) return <p className="rb-dpe-hint">Caricamento…</p>;
  if (!profile.idoneo) {
    return <p className="rb-dpe-hint">Il mondo Incontri non è attivo per il tuo account: riattivalo dalle Impostazioni (Mondi). È riservato ai maggiorenni.</p>;
  }

  const dettaglioRows = [
    ...DETTAGLI.map((def) => ({ def, text: dettaglioText(def, dettagli[def.key]) })),
    {
      def: { key: 'interessi', label: 'Interessi', icon: '✨', multi: INTERESSI_MAX },
      text: (dettagli.interessi ?? []).map(interesseLabel).join(', '),
    },
  ];

  return (
    <div className={`rb-dpe ${variant}`}>
      <p className={`rb-dpe-status ${profile.visibile ? 'ok' : ''}`}>
        {profile.visibile ? '● ' : '○ '}
        {datingStatusText(profile)}
      </p>

      <Section title="Essenziali">
        <div className="rb-dpe-field">
          <span>Come ti definisci</span>
          <Chips options={GENERI} value={genere} onToggle={(id) => setGenere((g) => (g === id ? '' : id))} />
        </div>
        <div className="rb-dpe-field">
          <span>Chi vuoi incontrare</span>
          <Chips options={CERCA_GENERI} value={cercaGeneri} onToggle={(id) => setCercaGeneri((l) => toggleIn(l, id))} />
          {!hasRow && (
            <label className="rb-dpe-check">
              <input type="checkbox" checked={consenso} onChange={(e) => setConsenso(e.target.checked)} />
              <span>
                Acconsento al trattamento di questo dato (orientamento) per mostrarmi e propormi profili nel mondo Incontri. Puoi
                cambiarlo o cancellarlo quando vuoi.
              </span>
            </label>
          )}
        </div>
        <div className="rb-dpe-field">
          <span>Cosa cerchi (fino a {COSA_CERCA_MAX})</span>
          <Chips options={COSA_CERCA} value={cosaCerca} onToggle={(id) => setCosaCerca((l) => toggleIn(l, id, COSA_CERCA_MAX))} max={COSA_CERCA_MAX} />
        </div>
        <div className="rb-dpe-field">
          <span>Città</span>
          <CityAutocomplete
            value={city.text}
            pickedValue={city.geo ? city.text : ''}
            placeholder="Scrivi e scegli la città dall'elenco"
            onChange={(t) => setCity({ text: t, geo: null })}
            onPick={(c) => setCity({ text: c.nomeMostrato, geo: c.geonameId })}
          />
        </div>
        <label className="rb-dpe-field">
          <span>Bio</span>
          <textarea rows={3} maxLength={BIO_MAX} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Due righe su di te…" />
          <small className="rb-dpe-hint">
            {bio.length}/{BIO_MAX}
          </small>
        </label>

        <div className="rb-dpe-field">
          <span>
            Foto ({fotos.length}/{DATING_PHOTOS_MAX}, minimo {DATING_PHOTOS_MIN}) · nella prima deve vedersi il tuo viso
          </span>
          <div className="rb-dpe-photos">
            {fotos.map((f, i) => (
              <div key={f.id} className="rb-dpe-photo">
                {f.src ? <img src={f.src} alt={`Foto ${i + 1}`} /> : <div className="rb-dpe-photo-missing" />}
                {i === 0 && <span className="rb-dpe-photo-main">Principale</span>}
                <div className="rb-dpe-photo-tools">
                  <button type="button" onClick={() => onMovePhoto(i, -1)} disabled={photoBusy || i === 0} aria-label="Sposta prima">
                    ‹
                  </button>
                  <button type="button" onClick={() => onRemovePhoto(f)} disabled={photoBusy} aria-label="Togli la foto">
                    ✕
                  </button>
                  <button type="button" onClick={() => onMovePhoto(i, 1)} disabled={photoBusy || i === fotos.length - 1} aria-label="Sposta dopo">
                    ›
                  </button>
                </div>
              </div>
            ))}
            {fotos.length < DATING_PHOTOS_MAX && (
              <button type="button" className="rb-dpe-photo add" onClick={() => fileRef.current?.click()} disabled={photoBusy}>
                {photoBusy ? '…' : '+'}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={onAddPhoto} />
          {photoError && <p className="rb-dpe-error">{photoError}</p>}
        </div>
      </Section>

      <Section title="Dettagli" hint="Tutti facoltativi: compaiono nella tua scheda solo quelli che scegli.">
        <ul className="rb-dpe-rows">
          {dettaglioRows.map(({ def, text }) => (
            <li key={def.key}>
              <button type="button" onClick={() => setPicker(def)}>
                <span className="rb-dpe-row-icon" aria-hidden="true">
                  {def.icon}
                </span>
                <span className="rb-dpe-row-label">{def.label}</span>
                <span className={`rb-dpe-row-value ${text ? '' : 'empty'}`}>{text || 'Seleziona'}</span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="rb-dpe-field">
          <span>Lingue che parli</span>
          <button type="button" className={`rb-dpe-select ${lingueOpen ? 'open' : ''}`} aria-expanded={lingueOpen} onClick={() => setLingueOpen((o) => !o)}>
            <span>
              {lingue.length
                ? SUPPORTED_LANGUAGES.filter((l) => lingue.includes(l.code))
                    .map((l) => l.nativeLabel)
                    .join(', ')
                : 'Nessuna lingua scelta'}
            </span>
            <span aria-hidden="true">{lingueOpen ? '▲' : '▼'}</span>
          </button>
          {lingueOpen && (
            <div className="rb-dpe-chips rb-dpe-lingue">
              {SUPPORTED_LANGUAGES.map((l) => (
                <button
                  type="button"
                  key={l.code}
                  className={`rb-dpe-chip ${lingue.includes(l.code) ? 'on' : ''}`}
                  onClick={() => setLingue((x) => toggleIn(x, l.code))}
                >
                  {l.flag} {l.nativeLabel}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="rb-dpe-check">
          <input type="checkbox" checked={Boolean(dettagli.mostra_zodiaco)} onChange={(e) => setDettagli((d) => ({ ...d, mostra_zodiaco: e.target.checked }))} />
          <span>Mostra il mio segno zodiacale{profile.zodiaco ? ` (${zodiacoLabel(profile.zodiaco)})` : ''}</span>
        </label>
      </Section>

      <Section title="Chi vedo" hint="Le persone che ti proponiamo nel mazzo.">
        <ChiVedoFields
          classes={{ field: 'rb-dpe-field', check: 'rb-dpe-check', range2: 'rb-dpe-range2' }}
          zonaPlaceholder={profile.citta ? `Vuoto = ${profile.citta}` : 'Vuoto = la mia città'}
          value={{ zona, ovunque, distanza, etaMin, etaMax, espandiEta }}
          onChange={(patch) => {
            if ('zona' in patch) setZona(patch.zona);
            if ('ovunque' in patch) setOvunque(patch.ovunque);
            if ('distanza' in patch) setDistanza(patch.distanza);
            if ('etaMin' in patch) setEtaMin(patch.etaMin);
            if ('etaMax' in patch) setEtaMax(patch.etaMax);
            if ('espandiEta' in patch) setEspandiEta(patch.espandiEta);
          }}
          distanceExtra={
            <label className="rb-dpe-check">
              <input type="checkbox" checked={espandiDistanza} onChange={(e) => setEspandiDistanza(e.target.checked)} />
              <span>Se finiscono i profili vicini mostra persone più lontane</span>
            </label>
          }
        />
        <div className="rb-dpe-field">
          <span>Numero minimo di foto</span>
          <CustomSelect ariaLabel="Numero minimo di foto" value={String(minFoto)} onChange={(v) => setMinFoto(Number(v))} options={MIN_FOTO_OPTIONS} />
        </div>
        <label className="rb-dpe-check">
          <input type="checkbox" checked={soloConBio} onChange={(e) => setSoloConBio(e.target.checked)} />
          <span>Solo chi ha una bio</span>
        </label>
      </Section>

      {error && <p className="rb-dpe-error">{error}</p>}
      {success && <p className="rb-dpe-success">{success}</p>}

      <div className="rb-dpe-footer">
        {variant === 'onboarding' && (
          <button type="button" className="rb-dpe-btn ghost" onClick={() => onSkip?.(profile)} disabled={busy}>
            Salta
          </button>
        )}
        <button type="button" className="rb-dpe-btn" onClick={variant === 'onboarding' ? saveAndClose : save} disabled={busy}>
          {busy ? 'Salvo…' : 'Salva'}
        </button>
      </div>

      {picker && (
        <DettaglioPicker
          title={picker.label}
          options={
            picker.key === 'interessi'
              ? interessiOptions
              : Object.entries(picker.values).map(([id, label]) => ({ id, label }))
          }
          value={dettagli[picker.key]}
          max={picker.multi}
          onClose={() => setPicker(null)}
          onDone={(v) => {
            setDettagli((d) => {
              const next = { ...d };
              if ((Array.isArray(v) && v.length) || (!Array.isArray(v) && v)) next[picker.key] = v;
              else delete next[picker.key];
              return next;
            });
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}
