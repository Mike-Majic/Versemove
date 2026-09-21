import { useEffect, useState } from 'react';
import { CONTINENTS, REGIONS, MAX_DISTANCE_KM } from '../data/geo';
import { WORLDS } from '../data/worlds';
import { listBlockedContacts, blockContact, unblockContact } from '../data/blockedContacts';
import { resetAccountPassword, setOwnWorlds, deleteOwnAccount } from '../data/accounts';
import { ROLES } from '../data/roles';
import { fetchProfilesMap } from '../data/posts';
import { isSoundEnabled, setSoundEnabled } from '../fx/sound';
import ModalOverlay from './ModalOverlay';
import InfoBadge from './InfoBadge';
import './SettingsPanel.css';

const DEFAULT_FILTERS = { gender: 'Tutti', ageMin: 18, ageMax: 60 };
const DEFAULT_LOCATION_FILTERS = { continent: '', region: '', city: '', distance: 150 };
const DEFAULT_VISIBILITY = { nearbyVisible: false, shareLiveLocation: false };

// Riga di titolo cliccabile che apre/chiude il contenuto sotto — stesso
// linguaggio visivo di rb-settings-nav-btn (che porta a un'altra vista),
// qui invece resta nella stessa schermata e mostra/nasconde i campi. Le
// spiegazioni non stanno più in un paragrafo sempre visibile: sono dentro
// la (i), per occupare meno spazio (richiesta esplicita). Titolo, (i) e
// freccetta sono tre elementi affiancati invece di un unico bottone: la
// (i) apre una sua vignetta, non deve anche aprire/chiudere la voce.
// "level" distingue la fisarmonica di primo livello (Luogo, Personalizza,
// Privacy) da quella annidata dentro (le sue "sotto impostazioni").
function CollapsibleSection({ title, infoText, open, onToggle, children, level = 'group' }) {
  const Wrapper = level === 'group' ? 'section' : 'div';
  const rowClass = level === 'group' ? 'rb-settings-accordion-row' : 'rb-settings-subaccordion-row';
  const titleClass = level === 'group' ? 'rb-settings-accordion-header' : 'rb-settings-subaccordion-header';
  return (
    <Wrapper className={level === 'group' ? 'rb-settings-section' : 'rb-settings-subaccordion'}>
      <div className={rowClass}>
        <button type="button" className={titleClass} onClick={onToggle} aria-expanded={open}>
          {title}
        </button>
        {infoText && <InfoBadge text={infoText} />}
        <button
          type="button"
          className="rb-settings-accordion-chevron-btn"
          onClick={onToggle}
          tabIndex={-1}
          aria-hidden="true"
        >
          {open ? '−' : '+'}
        </button>
      </div>
      {open && (
        <div className={level === 'group' ? 'rb-settings-accordion-body' : 'rb-settings-subaccordion-body'}>
          {children}
        </div>
      )}
    </Wrapper>
  );
}

// Sotto-voce "Mondi" di "Personalizza il tuo Versemove": quali mondi
// restano abilitati per l'account. Se un mondo viene disattivato, oltre a
// non poterlo più esplorare (vedi AccessGate in App.jsx), il proprio
// profilo/marker smette di comparire in quel mondo per gli altri utenti
// (vedi il filtro su globeUsers in App.jsx).
function WorldsSubsection({ user, onOpenAuth, onUpdateUser }) {
  const [selected, setSelected] = useState(user?.mondiAbilitati?.length ? user.mondiAbilitati : WORLDS.map((w) => w.id));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <button type="button" className="rb-settings-nav-btn" onClick={onOpenAuth}>
        <span><strong>Accedi per scegliere i tuoi mondi</strong></span>
        <span aria-hidden="true">→</span>
      </button>
    );
  }

  const toggle = (id) => {
    setError('');
    setSuccess('');
    setSelected((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]));
  };

  const save = async () => {
    setError('');
    setSuccess('');
    if (!selected.length) {
      setError('Devi lasciare abilitato almeno un mondo.');
      return;
    }
    const ordered = WORLDS.map((w) => w.id).filter((id) => selected.includes(id));
    setBusy(true);
    const { account, error: err } = await setOwnWorlds(ordered);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setSuccess('Mondi abilitati aggiornati.');
    onUpdateUser?.(account);
  };

  return (
    <>
      <div className="rb-settings-worlds-list">
        {WORLDS.map((w) => (
          <label key={w.id} className="rb-settings-world-row">
            <input type="checkbox" checked={selected.includes(w.id)} onChange={() => toggle(w.id)} />
            <span className="rb-settings-world-dot" style={{ background: w.color }} />
            <span>{w.label}</span>
          </label>
        ))}
      </div>
      {error && <p className="rb-privacy-error">{error}</p>}
      {success && <p className="rb-privacy-success">{success}</p>}
      <button type="button" className="rb-reset-filters-btn" onClick={save} disabled={busy}>
        {busy ? 'Un attimo…' : 'Salva'}
      </button>
    </>
  );
}

// Sezione "Privacy": tre sotto-voci (Utenti, Posizione, Sicurezza e
// accesso). Inline nel flusso principale delle Impostazioni (non più una
// pagina a parte raggiunta con un pulsante+indietro): "Posizione" agisce
// sul draft (visibility/setVisibility qui sono in realtà il draft passato
// dal genitore), confermato solo cliccando "Applica" come gli altri filtri.
// Utenti (blocco contatti) e Sicurezza restano azioni immediate: non sono
// filtri di visualizzazione, toccano subito il server.
function PrivacySectionContent({ user, onOpenAuth, friends, onUnfriend, visibility, setVisibility }) {
  const [sub, setSub] = useState('');
  const [blocked, setBlocked] = useState([]);
  const [profilesMap, setProfilesMap] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwSent, setPwSent] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    listBlockedContacts().then((ids) => {
      if (!cancelled) {
        setBlocked(ids);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Nomi da public_profiles (non più da MOCK_USERS): unione di chi ho
  // bloccato e degli amici ancora bloccabili, così i nomi non "saltano"
  // quando un id passa dall'una all'altra lista.
  useEffect(() => {
    const ids = [...new Set([...blocked, ...(friends ?? [])])];
    if (ids.length === 0) {
      setProfilesMap(new Map());
      return undefined;
    }
    let cancelled = false;
    fetchProfilesMap(ids).then((map) => {
      if (!cancelled) setProfilesMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [blocked, friends]);

  const contactName = (id) => profilesMap.get(id)?.name ?? `Utente #${id}`;

  const doBlock = async (id) => {
    setError('');
    const { error: err } = await blockContact(id);
    if (err) {
      setError(err);
      return;
    }
    setBlocked((prev) => [...prev, String(id)]);
    onUnfriend?.(id);
  };

  const doUnblock = async (id) => {
    setError('');
    const { error: err } = await unblockContact(id);
    if (err) {
      setError(err);
      return;
    }
    setBlocked((prev) => prev.filter((b) => b !== String(id)));
  };

  const changePassword = async () => {
    if (!user?.email) return;
    setPwBusy(true);
    const { error: err } = await resetAccountPassword(user.email);
    setPwBusy(false);
    if (!err) setPwSent(true);
  };

  const blockableFriends = (friends ?? []).filter((id) => !blocked.includes(String(id)));
  const toggleSub = (name) => setSub((s) => (s === name ? '' : name));

  return (
    <>
      <CollapsibleSection
        level="sub"
        title="Utenti"
        infoText="Un contatto bloccato non può più scriverti né vederti tra i tuoi amici. Puoi sbloccarlo quando vuoi."
        open={sub === 'utenti'}
        onToggle={() => toggleSub('utenti')}
      >
        {!user ? (
          <button type="button" className="rb-settings-nav-btn" onClick={onOpenAuth}>
            <span><strong>Accedi per gestire i contatti bloccati</strong></span>
            <span aria-hidden="true">→</span>
          </button>
        ) : loading ? (
          <p className="rb-settings-hint">Caricamento...</p>
        ) : (
          <>
            {error && <p className="rb-privacy-error">{error}</p>}
            {blocked.length > 0 && (
              <ul className="rb-privacy-contact-list">
                {blocked.map((id) => (
                  <li key={id} className="rb-privacy-contact-row">
                    <span>{contactName(id)}</span>
                    <button type="button" className="rb-reset-filters-btn rb-privacy-inline-btn" onClick={() => doUnblock(id)}>
                      Sblocca
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {blockableFriends.length > 0 && (
              <ul className="rb-privacy-contact-list">
                {blockableFriends.map((id) => (
                  <li key={id} className="rb-privacy-contact-row">
                    <span>{contactName(id)}</span>
                    <button type="button" className="rb-reset-filters-btn rb-privacy-inline-btn" onClick={() => doBlock(id)}>
                      Blocca
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {blocked.length === 0 && blockableFriends.length === 0 && (
              <p className="rb-settings-hint">Nessun contatto da mostrare.</p>
            )}
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        level="sub"
        title="Posizione"
        infoText="Chi vede la tua presenza e la tua posizione nei mondi."
        open={sub === 'posizione'}
        onToggle={() => toggleSub('posizione')}
      >
        <label className="rb-toggle-row">
          <span className="rb-toggle-text-row">
            <strong>Visibile agli altri utenti vicino a te</strong>
            <InfoBadge text='Se attivo, chi ti è vicino può vedere nella colonna "Persone vicine" che hai messo mi piace o parteciperò a un contenuto. Mai la posizione esatta, solo la città. Di default è spento.' />
          </span>
          <span className="rb-toggle">
            <input
              type="checkbox"
              checked={visibility.nearbyVisible}
              onChange={(e) => setVisibility((v) => ({ ...v, nearbyVisible: e.target.checked }))}
            />
            <span className="rb-toggle-slider" />
          </span>
        </label>

        <label className="rb-toggle-row">
          <span className="rb-toggle-text-row">
            <strong>Condividi la mia posizione in tempo reale</strong>
            <InfoBadge text={
              user
                ? 'Se attivo, il pallino sul tuo marker nel mondo diventa verde e segue la tua posizione reale, aggiornata in tempo reale. Se spento, il pallino resta quello standard e nessuna posizione viene condivisa o richiesta al browser.'
                : 'Accedi per poter condividere la tua posizione in tempo reale.'
            } />
          </span>
          <span className="rb-toggle">
            <input
              type="checkbox"
              checked={visibility.shareLiveLocation}
              disabled={!user}
              onChange={(e) => {
                if (!user) {
                  onOpenAuth?.();
                  return;
                }
                setVisibility((v) => ({ ...v, shareLiveLocation: e.target.checked }));
              }}
            />
            <span className="rb-toggle-slider" />
          </span>
        </label>
      </CollapsibleSection>

      <CollapsibleSection
        level="sub"
        title="Sicurezza e accesso"
        infoText="Ti mandiamo una mail con un link per scegliere una nuova password."
        open={sub === 'sicurezza'}
        onToggle={() => toggleSub('sicurezza')}
      >
        {!user ? (
          <button type="button" className="rb-settings-nav-btn" onClick={onOpenAuth}>
            <span><strong>Accedi per gestire la sicurezza dell'account</strong></span>
            <span aria-hidden="true">→</span>
          </button>
        ) : pwSent ? (
          <p className="rb-settings-hint">Mail inviata: controlla la posta (anche spam).</p>
        ) : (
          <button type="button" className="rb-reset-filters-btn" onClick={changePassword} disabled={pwBusy}>
            {pwBusy ? 'Un attimo…' : 'Cambia password'}
          </button>
        )}
      </CollapsibleSection>

      <p className="rb-settings-footnote">Altre impostazioni privacy arriveranno qui.</p>
    </>
  );
}

// Zona pericolosa, in fondo alle Impostazioni: cancellazione definitiva
// dell'account (Edge Function "delete-account", vedi data/accounts.js).
// Nascosta per l'owner: la funzione lo blocca comunque, ma non ha senso
// proporgli un pulsante che fallirà sempre.
function DeleteAccountSection({ user, onAccountDeleted }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user || user.ruolo === ROLES.OWNER) return null;

  const cancel = () => {
    setOpen(false);
    setPassword('');
    setConfirmText('');
    setError('');
  };

  const submit = async () => {
    if (confirmText !== 'ELIMINA' || !password || busy) return;
    setBusy(true);
    setError('');
    const { error: err } = await deleteOwnAccount(password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    onAccountDeleted?.();
  };

  return (
    <section className="rb-settings-section rb-danger-zone">
      <h3>Elimina account</h3>
      {!open ? (
        <>
          <p className="rb-settings-hint">
            Cancella per sempre il tuo profilo, i post, i contenuti caricati, le chat, le amicizie e i file collegati
            al tuo account.
          </p>
          <button type="button" className="rb-danger-btn" onClick={() => setOpen(true)}>
            Elimina il mio account
          </button>
        </>
      ) : (
        <>
          <p className="rb-danger-warning">
            Questa azione è <strong>definitiva</strong> e non si può annullare: profilo, post, contenuti caricati,
            chat, amicizie e file collegati al tuo account verranno cancellati per sempre.
          </p>
          <label className="rb-field">
            <span>Password attuale</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="rb-field">
            <span>Scrivi ELIMINA per confermare</span>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={busy}
            />
          </label>
          {error && <p className="rb-privacy-error">{error}</p>}
          <div className="rb-danger-actions">
            <button type="button" className="rb-reset-filters-btn" onClick={cancel} disabled={busy}>
              Annulla
            </button>
            <button
              type="button"
              className="rb-danger-btn"
              onClick={submit}
              disabled={confirmText !== 'ELIMINA' || !password || busy}
            >
              {busy ? 'Eliminazione in corso…' : 'Elimina definitivamente'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

// Tutti i filtri di visualizzazione (Suono, Luogo, Mostrami/età, Posizione)
// vivono qui come una "bozza": partono allineati a quanto è già attivo
// (filters/locationFilters/visibility, gli stessi che filtrano davvero il
// globo in App.jsx) ogni volta che il pannello si apre, e toccano lo stato
// vero solo quando si clicca "Applica" — prima, muovere uno slider o
// spuntare una casella cambia solo l'anteprima qui dentro. "Mondi" (dentro
// Personalizza) e le azioni di Privacy → Utenti/Sicurezza restano invece
// immediate: sono mutazioni vere sull'account (RPC), non filtri client, e
// hanno già un loro pulsante "Salva"/azione dedicato.
export default function SettingsPanel({
  open,
  onClose,
  onApply,
  user,
  onOpenAuth,
  onUpdateUser,
  filters,
  setFilters,
  locationFilters,
  setLocationFilters,
  visibility,
  setVisibility,
  friends,
  onUnfriend,
  onAccountDeleted,
}) {
  const [luogoOpen, setLuogoOpen] = useState(false);
  const [personalizzaOpen, setPersonalizzaOpen] = useState(false);
  const [personalizzaSub, setPersonalizzaSub] = useState('');
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const [draftFilters, setDraftFilters] = useState(filters);
  const [draftLocationFilters, setDraftLocationFilters] = useState(locationFilters);
  const [draftVisibility, setDraftVisibility] = useState(visibility);
  const [draftSound, setDraftSound] = useState(true);

  useEffect(() => {
    if (!open) return;
    setDraftFilters(filters);
    setDraftLocationFilters(locationFilters);
    setDraftVisibility(visibility);
    setDraftSound(isSoundEnabled());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const updateFilter = (key, value) => setDraftFilters((f) => ({ ...f, [key]: value }));
  const updateLocation = (key, value) => setDraftLocationFilters((f) => ({ ...f, [key]: value }));
  const togglePersonalizzaSub = (name) => setPersonalizzaSub((s) => (s === name ? '' : name));
  const distanzaUnlimited = draftLocationFilters.distance >= MAX_DISTANCE_KM;

  const handleReset = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setDraftLocationFilters(DEFAULT_LOCATION_FILTERS);
    setDraftVisibility(DEFAULT_VISIBILITY);
  };

  const handleApply = () => {
    setFilters(draftFilters);
    setLocationFilters(draftLocationFilters);
    setVisibility(draftVisibility);
    setSoundEnabled(draftSound);
    (onApply ?? onClose)();
  };

  return (
    <ModalOverlay onClose={onClose} className="rb-settings-overlay">
      <aside className="rb-settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="rb-settings-header">
          <h2>Impostazioni</h2>
          <button className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        </div>

        <div className="rb-filter-actions">
          <button type="button" className="rb-reset-filters-btn" onClick={handleReset}>
            Azzera tutti i filtri
          </button>
          <button type="button" className="rb-apply-filters-btn" onClick={handleApply}>
            Applica
          </button>
        </div>
        <p className="rb-settings-hint">Le modifiche qui sotto valgono solo dopo aver premuto "Applica".</p>

        <section className="rb-settings-section rb-settings-section-first">
          <label className="rb-toggle-row">
            <span className="rb-toggle-text-row">
              <strong>Suono</strong>
              <InfoBadge text="Attiva o disattiva gli effetti sonori dell'app (es. i suoni del globo)." />
            </span>
            <span className="rb-toggle">
              <input
                type="checkbox"
                checked={draftSound}
                onChange={(e) => setDraftSound(e.target.checked)}
              />
              <span className="rb-toggle-slider" />
            </span>
          </label>
        </section>

        <CollapsibleSection
          title="Privacy"
          infoText="Utenti, posizione, sicurezza e accesso."
          open={privacyOpen}
          onToggle={() => setPrivacyOpen((v) => !v)}
        >
          <PrivacySectionContent
            user={user}
            onOpenAuth={onOpenAuth}
            friends={friends}
            onUnfriend={onUnfriend}
            visibility={draftVisibility}
            setVisibility={setDraftVisibility}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Luogo"
          infoText="Continente, regione e città: valido per tutti i mondi."
          open={luogoOpen}
          onToggle={() => setLuogoOpen((v) => !v)}
        >
          <label className="rb-field">
            <span>Continente</span>
            <select value={draftLocationFilters.continent} onChange={(e) => updateLocation('continent', e.target.value)}>
              <option value="">Tutti i continenti</option>
              {CONTINENTS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="rb-field">
            <span>Regione</span>
            <select value={draftLocationFilters.region} onChange={(e) => updateLocation('region', e.target.value)}>
              <option value="">Tutte le regioni</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>

          <label className="rb-field">
            <span>Città</span>
            <input
              type="text"
              placeholder="Es. Roma"
              value={draftLocationFilters.city}
              onChange={(e) => updateLocation('city', e.target.value)}
            />
          </label>

          <label className="rb-field">
            <span className="rb-field-label-row">
              Distanza: {distanzaUnlimited ? 'tutto il mondo' : `${draftLocationFilters.distance} km`}
              <InfoBadge text="Trascina la barra tutta a destra per non avere nessun limite di distanza: verranno considerate le persone di tutto il mondo, non solo quelle entro un certo raggio dalla città impostata sopra." />
            </span>
            <input type="range" min={1} max={MAX_DISTANCE_KM} value={draftLocationFilters.distance}
              onChange={(e) => updateLocation('distance', Number(e.target.value))} />
          </label>
        </CollapsibleSection>

        <CollapsibleSection
          title="Personalizza il tuo Versemove"
          infoText="Chi vuoi vedere e quali mondi usare, valido per tutti i mondi."
          open={personalizzaOpen}
          onToggle={() => setPersonalizzaOpen((v) => !v)}
        >
          <CollapsibleSection
            level="sub"
            title="Mostrami ed età"
            infoText="Genere ed età di chi vuoi vedere."
            open={personalizzaSub === 'mostrami'}
            onToggle={() => togglePersonalizzaSub('mostrami')}
          >
            <label className="rb-field">
              <span>Mostrami</span>
              <div className="rb-chip-group">
                {['Tutti', 'Uomo', 'Donna'].map((opt) => (
                  <button
                    key={opt}
                    className={`rb-chip ${draftFilters.gender === opt ? 'active' : ''}`}
                    onClick={() => updateFilter('gender', opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </label>

            <label className="rb-field">
              <span>Età: {draftFilters.ageMin}–{draftFilters.ageMax}</span>
              <div className="rb-range-row">
                <input type="range" min={18} max={80} value={draftFilters.ageMin}
                  onChange={(e) => updateFilter('ageMin', Math.min(Number(e.target.value), draftFilters.ageMax))} />
                <input type="range" min={18} max={80} value={draftFilters.ageMax}
                  onChange={(e) => updateFilter('ageMax', Math.max(Number(e.target.value), draftFilters.ageMin))} />
              </div>
            </label>
          </CollapsibleSection>

          <CollapsibleSection
            level="sub"
            title="Mondi"
            infoText="Dove togli la spunta, il mondo sparisce per te e il tuo profilo non comparirà più agli altri in quel mondo. Puoi cambiare idea quando vuoi, fino a 4 volte a settimana."
            open={personalizzaSub === 'mondi'}
            onToggle={() => togglePersonalizzaSub('mondi')}
          >
            <WorldsSubsection user={user} onOpenAuth={onOpenAuth} onUpdateUser={onUpdateUser} />
          </CollapsibleSection>
        </CollapsibleSection>

        <p className="rb-settings-footnote">I filtri sono salvati solo su questo dispositivo, per ora. In arrivo: account veri e ricerca in tempo reale.</p>

        <DeleteAccountSection user={user} onAccountDeleted={onAccountDeleted} />
      </aside>
    </ModalOverlay>
  );
}
