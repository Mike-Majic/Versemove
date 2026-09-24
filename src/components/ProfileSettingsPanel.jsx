import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateWorld } from '../i18n/worldLabels';
import Icon from './shared/Icon';
import {
  updateNickname,
  updateName,
  nicknameCooldownRemaining,
  nameCooldownRemaining,
  updateAccountDetails,
  uploadAvatar,
  uploadAttachment,
  getCurrentAccount,
  getMyLinkedAccount,
  linkSecondAccount,
  unlinkMyAccount,
  loginAccount,
} from '../data/accounts';
import { switchToDeviceSession } from '../data/accountSwitcher';
import { sendMailboxMessage } from '../data/modMailbox';
import { listMyAlbums, createAlbum, deleteAlbum, addPhotoToAlbum, removePhotoFromAlbum } from '../data/albums';
import { updateOwnDatingProfile } from '../data/incontri';
import { supabase } from '../data/supabaseClient';
import { WORLDS } from '../data/worlds';
import ModalOverlay from './ModalOverlay';
import InfoBadge from './InfoBadge';
import './ProfileSettingsPanel.css';

const CITTA_MAX = 80;
const BIO_MAX = 300;

const NICKNAME_RULE_TEXT =
  'Il nickname si può cambiare al massimo una volta al mese, e non può essere uguale a quello di un altro utente.';
const NAME_RULE_TEXT =
  'Nome e cognome si possono cambiare al massimo una volta ogni 3 mesi.';
const PARTITA_IVA_PATTERN = /^\d{11}$/;
const PRONOMI_PRESETS = [
  { value: 'lui', label: 'Lui (he/him)' },
  { value: 'lei', label: 'Lei (she/her)' },
  { value: 'loro', label: 'Loro (they/them)' },
  { value: 'altro', label: 'Altro (scrivi tu)' },
];

function daysLeft(ms) {
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function FieldGroup({
  title,
  ruleText,
  cooldownMs,
  onSave,
  onRequestUrgent,
  children,
  disabled,
  error,
  success,
}) {
  const [infoSeen, setInfoSeen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSaveClick = () => {
    if (infoSeen) {
      onSave();
    } else {
      setShowConfirm(true);
    }
  };

  return (
    <div className="rb-profile-field-group">
      <div className="rb-profile-field-title">
        <strong>{title}</strong>
        <InfoBadge text={ruleText} onSeen={() => setInfoSeen(true)} />
      </div>

      {children}

      {error && <p className="rb-profile-field-error">{error}</p>}
      {success && <p className="rb-profile-field-success">{success}</p>}

      {cooldownMs > 0 ? (
        <div className="rb-profile-cooldown">
          <p>Potrai cambiarlo tra {daysLeft(cooldownMs)} giorni.</p>
          <button type="button" className="rb-profile-urgent-btn" onClick={onRequestUrgent}>
            Ho urgenza: scrivi ai moderatori
          </button>
        </div>
      ) : (
        <button type="button" className="rb-profile-save-btn" onClick={handleSaveClick} disabled={disabled}>
          Salva
        </button>
      )}

      {showConfirm && (
        <ModalOverlay onClose={() => setShowConfirm(false)} className="rb-profile-confirm-overlay">
          <div className="rb-profile-confirm-card" onClick={(e) => e.stopPropagation()}>
            <p>{ruleText}</p>
            <p className="rb-profile-confirm-question">Confermi la modifica?</p>
            <div className="rb-profile-confirm-actions">
              <button type="button" onClick={() => setShowConfirm(false)}>Annulla</button>
              <button
                type="button"
                className="rb-profile-confirm-ok"
                onClick={() => {
                  setShowConfirm(false);
                  onSave();
                }}
              >
                Conferma
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// Foto profilo: due modi di scegliere il file (scatta / dalla galleria,
// stesso pattern usato nei composer di post ed eventi) sopra un pulsante
// "Salva" solo, perché qui basta un tocco sulla foto stessa per scegliere.
function AvatarUploader({ user, onUpdateUser }) {
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    const { account, error: err } = await uploadAvatar(file);
    setUploading(false);
    if (err) {
      setError(err);
      setPreview(null);
      return;
    }
    onUpdateUser(account);
  };

  return (
    <div className="rb-avatar-uploader">
      <img className="rb-avatar-uploader-preview" src={preview ?? user.avatar} alt={user.nickname} />
      <div className="rb-avatar-uploader-btns">
        <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploading}>
          <Icon name="camera" size={16} /> Scatta
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Icon name="image" size={16} /> Galleria
        </button>
      </div>
      {uploading && <p className="rb-avatar-uploader-status">Caricamento...</p>}
      {error && <p className="rb-profile-field-error">{error}</p>}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        onChange={handleFile}
      />
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={handleFile} />
    </div>
  );
}

// Foto dentro un album aperto: griglia con upload (scatta/galleria, stesso
// pattern del resto dell'app) e un modo per togliere una foto dall'album
// senza cancellarla (resta come contenuto singolo, come "rimuovi da questo
// album" su Facebook).
function AlbumDetail({ album, onAddPhoto, onRemovePhoto, onBack, onDelete }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploading(true);
    const { photo, error: err } = await addPhotoToAlbum({ file, albumId: album.id });
    setUploading(false);
    if (err) {
      setError(err);
      return;
    }
    onAddPhoto(photo);
  };

  return (
    <div className="rb-album-detail">
      <div className="rb-album-detail-header">
        <button type="button" className="rb-album-back-btn" onClick={onBack}>← Album</button>
        <div>
          <strong>{album.nome}</strong>
          {album.descrizione && <p className="rb-album-detail-desc">{album.descrizione}</p>}
        </div>
        <button type="button" className="rb-album-delete-btn" onClick={() => onDelete(album.id)}>Elimina album</button>
      </div>

      <div className="rb-album-upload-btns">
        <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploading}>📸 Scatta</button>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>🖼️ Galleria</button>
      </div>
      {uploading && <p className="rb-avatar-uploader-status">Caricamento...</p>}
      {error && <p className="rb-profile-field-error">{error}</p>}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        onChange={handleFile}
      />
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={handleFile} />

      <div className="rb-album-photo-grid">
        {album.photos.map((p) => (
          <div key={p.id} className="rb-album-photo">
            <img src={p.url} alt="" />
            <button type="button" className="rb-album-photo-remove" onClick={() => onRemovePhoto(p.id)} title="Rimuovi dall'album">✕</button>
          </div>
        ))}
        {album.photos.length === 0 && <p className="rb-album-empty">Nessuna foto in questo album ancora.</p>}
      </div>
    </div>
  );
}

// Scheda "Album": elenco degli album stile Facebook (photo_albums,
// raggruppa righe di contents tramite album_id — vedi data/albums.js),
// con creazione, upload foto, rimozione foto ed eliminazione album.
function AlbumsPanel() {
  const [albums, setAlbums] = useState(null);
  const [openAlbumId, setOpenAlbumId] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newNome, setNewNome] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listMyAlbums().then(setAlbums);
  }, []);

  const createNew = async () => {
    if (!newNome.trim() || creating) return;
    setCreating(true);
    setError('');
    const { album, error: err } = await createAlbum({ nome: newNome, descrizione: newDesc });
    setCreating(false);
    if (err) {
      setError(err);
      return;
    }
    setAlbums((prev) => [album, ...(prev ?? [])]);
    setShowNewForm(false);
    setNewNome('');
    setNewDesc('');
    setOpenAlbumId(album.id);
  };

  const removeAlbum = async (albumId) => {
    const { error: err } = await deleteAlbum(albumId);
    if (err) {
      setError(err);
      return;
    }
    setAlbums((prev) => prev.filter((a) => a.id !== albumId));
    setOpenAlbumId(null);
  };

  const addPhoto = (albumId, photo) => {
    setAlbums((prev) => prev.map((a) => (a.id === albumId ? { ...a, photos: [photo, ...a.photos] } : a)));
  };

  const removePhoto = async (albumId, contentId) => {
    const { error: err } = await removePhotoFromAlbum(contentId);
    if (err) {
      setError(err);
      return;
    }
    setAlbums((prev) => prev.map((a) => (a.id === albumId ? { ...a, photos: a.photos.filter((p) => p.id !== contentId) } : a)));
  };

  if (albums === null) return <p className="rb-album-loading">Caricamento album...</p>;

  const openAlbum = albums.find((a) => a.id === openAlbumId);
  if (openAlbum) {
    return (
      <AlbumDetail
        album={openAlbum}
        onBack={() => setOpenAlbumId(null)}
        onDelete={removeAlbum}
        onAddPhoto={(photo) => addPhoto(openAlbum.id, photo)}
        onRemovePhoto={(contentId) => removePhoto(openAlbum.id, contentId)}
      />
    );
  }

  return (
    <div className="rb-albums-panel">
      {!showNewForm ? (
        <button type="button" className="rb-album-new-btn" onClick={() => setShowNewForm(true)}>+ Nuovo album</button>
      ) : (
        <div className="rb-album-new-form">
          <input
            type="text"
            placeholder="Nome album (es. Vacanze 2026)"
            value={newNome}
            onChange={(e) => setNewNome(e.target.value)}
            maxLength={60}
          />
          <textarea
            placeholder="Descrizione (facoltativa)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            maxLength={300}
            rows={2}
          />
          <div className="rb-album-new-form-actions">
            <button type="button" onClick={() => setShowNewForm(false)}>Annulla</button>
            <button type="button" className="rb-profile-save-btn" onClick={createNew} disabled={!newNome.trim() || creating}>
              {creating ? 'Creazione...' : 'Crea'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="rb-profile-field-error">{error}</p>}

      <div className="rb-albums-grid">
        {albums.map((a) => (
          <button type="button" key={a.id} className="rb-album-card" onClick={() => setOpenAlbumId(a.id)}>
            <div className="rb-album-cover">
              {a.photos[0] ? <img src={a.photos[0].url} alt="" /> : <span className="rb-album-cover-empty">📷</span>}
            </div>
            <strong>{a.nome}</strong>
            <span>{a.photos.length} {a.photos.length === 1 ? 'foto' : 'foto'}</span>
          </button>
        ))}
        {albums.length === 0 && !showNewForm && <p className="rb-album-empty">Non hai ancora nessun album.</p>}
      </div>
    </div>
  );
}

// Scheda "Account": tipo account, dati di fatturazione (solo azienda),
// genere e pronomi. Niente cooldown qui (non è un dato "sensibile" allo
// stesso modo di nickname/nome) — salvataggio diretto tramite la RPC
// update_own_account_details.
function AccountTab({ user, onUpdateUser }) {
  const [tipoAccount, setTipoAccount] = useState(user.tipoAccount ?? 'persona');
  const [ragioneSociale, setRagioneSociale] = useState(user.ragioneSociale ?? '');
  const [partitaIva, setPartitaIva] = useState(user.partitaIva ?? '');
  const [codiceFiscale, setCodiceFiscale] = useState(user.codiceFiscale ?? '');
  const [pec, setPec] = useState(user.pec ?? '');
  const [codiceSdi, setCodiceSdi] = useState(user.codiceSdi ?? '');
  const [genere, setGenere] = useState(user.genere ?? '');
  const [pronomiPreset, setPronomiPreset] = useState(() => {
    const found = PRONOMI_PRESETS.find((p) => p.label === user.pronomi);
    return found ? found.value : user.pronomi ? 'altro' : 'lui';
  });
  const [pronomiCustom, setPronomiCustom] = useState(() => {
    const found = PRONOMI_PRESETS.find((p) => p.label === user.pronomi);
    return found ? '' : user.pronomi ?? '';
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError('');
    setSuccess('');
    if (!genere) {
      setError('Seleziona il genere.');
      return;
    }
    if (tipoAccount === 'azienda') {
      if (!ragioneSociale.trim()) {
        setError('Inserisci la ragione sociale.');
        return;
      }
      if (!PARTITA_IVA_PATTERN.test(partitaIva.trim())) {
        setError('La partita IVA deve essere di 11 cifre numeriche.');
        return;
      }
      if (!pec.trim() && !codiceSdi.trim()) {
        setError('Per la fatturazione elettronica serve almeno uno tra PEC e Codice SDI.');
        return;
      }
    }
    const pronomi = pronomiPreset === 'altro' ? pronomiCustom.trim() : PRONOMI_PRESETS.find((p) => p.value === pronomiPreset)?.label ?? '';

    setBusy(true);
    const { account, error: err } = await updateAccountDetails(user.id, {
      tipoAccount,
      ragioneSociale: tipoAccount === 'azienda' ? ragioneSociale : '',
      partitaIva: tipoAccount === 'azienda' ? partitaIva : '',
      codiceFiscale: tipoAccount === 'azienda' ? codiceFiscale : '',
      pec: tipoAccount === 'azienda' ? pec : '',
      codiceSdi: tipoAccount === 'azienda' ? codiceSdi : '',
      genere,
      pronomi,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setSuccess('Dati account aggiornati.');
    onUpdateUser(account);
  };

  return (
    <div className="rb-profile-field-group">
      <div className="rb-profile-field-title"><strong>Tipo di account</strong></div>
      <div className="rb-auth-segmented">
        <button type="button" className={tipoAccount === 'persona' ? 'active' : ''} onClick={() => setTipoAccount('persona')}>
          Persona
        </button>
        <button type="button" className={tipoAccount === 'azienda' ? 'active' : ''} onClick={() => setTipoAccount('azienda')}>
          Azienda / P.IVA
        </button>
      </div>

      {tipoAccount === 'azienda' && (
        <>
          <label className="rb-field">
            <span>Ragione sociale</span>
            <input type="text" value={ragioneSociale} onChange={(e) => setRagioneSociale(e.target.value)} />
          </label>
          <label className="rb-field">
            <span>Partita IVA</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={11}
              value={partitaIva}
              onChange={(e) => setPartitaIva(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <label className="rb-field">
            <span>Codice fiscale (facoltativo)</span>
            <input type="text" value={codiceFiscale} onChange={(e) => setCodiceFiscale(e.target.value.toUpperCase())} />
          </label>
          <label className="rb-field">
            <span>PEC</span>
            <input type="email" value={pec} onChange={(e) => setPec(e.target.value)} />
          </label>
          <label className="rb-field">
            <span>Codice SDI</span>
            <input type="text" maxLength={7} value={codiceSdi} onChange={(e) => setCodiceSdi(e.target.value.toUpperCase())} />
          </label>
        </>
      )}

      <label className="rb-field">
        <span>Genere</span>
        <select value={genere} onChange={(e) => setGenere(e.target.value)}>
          <option value="" disabled>Seleziona...</option>
          <option value="uomo">Uomo</option>
          <option value="donna">Donna</option>
        </select>
      </label>

      <label className="rb-field">
        <span>Pronomi</span>
        <select value={pronomiPreset} onChange={(e) => setPronomiPreset(e.target.value)}>
          {PRONOMI_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        {pronomiPreset === 'altro' && (
          <input type="text" placeholder="Scrivi i tuoi pronomi" value={pronomiCustom} onChange={(e) => setPronomiCustom(e.target.value)} />
        )}
      </label>

      {error && <p className="rb-profile-field-error">{error}</p>}
      {success && <p className="rb-profile-field-success">{success}</p>}

      <button type="button" className="rb-profile-save-btn" onClick={save} disabled={busy}>
        {busy ? 'Un attimo…' : 'Salva'}
      </button>
    </div>
  );
}

// Pannello "Il mio profilo": nickname/nome (con cooldown) e dati account
// (tipo/fatturazione/genere/pronomi), organizzati in schede per restare
// leggibile. Mondi abilitati e blocco contatti vivono nel pannello
// Impostazioni generale (SettingsPanel), insieme al resto della privacy.
// Lista delle categorie preferite (stellina, vedi FavoriteStarButton),
// raggruppate nell'ordine dei mondi (verde, blu, bianco, viola, giallo,
// rosso — lo stesso di data/worlds.js): ogni nome categoria è una pillola
// con lo sfondo del colore del suo mondo, testo sempre nel colore standard
// del resto dell'app.
function FavoriteCategoriesList({ favoriteCategories }) {
  const { t } = useTranslation();
  const byWorld = WORLDS.map((w) => ({
    world: w,
    items: favoriteCategories.filter((f) => f.worldId === w.id),
  })).filter((g) => g.items.length > 0);

  if (byWorld.length === 0) {
    return <p className="rb-profile-favorites-empty">Nessuna categoria preferita ancora — clicca la stellina ☆ accanto alla X quando apri una categoria.</p>;
  }

  return (
    <div className="rb-profile-favorites">
      {byWorld.map(({ world, items }) => (
        <div key={world.id} className="rb-profile-favorites-group">
          <h4>{translateWorld(t, world).label}</h4>
          <div className="rb-profile-favorites-chips">
            {items.map((f) => (
              <span key={f.categoryId} className="rb-profile-favorites-chip" style={{ backgroundColor: world.color }}>
                {f.categoryLabel}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Multi-profilo stile Facebook: un account Persona può collegarsi a un
// account Azienda della stessa persona reale (o viceversa), mai due dello
// stesso tipo — vedi la funzione link_second_account lato server, che
// verifica davvero le credenziali dell'altro account prima di collegarlo.
// Chi non ha ancora un secondo account deve prima uscire e registrarne uno
// nuovo del tipo opposto: qui si collega solo un account già esistente.
function AccountLinkPanel({ user, onClose }) {
  const [linked, setLinked] = useState(undefined); // undefined = in caricamento
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [otherEmail, setOtherEmail] = useState('');
  const [otherPassword, setOtherPassword] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linking, setLinking] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchPasswordNeeded, setSwitchPasswordNeeded] = useState(false);
  const [switchPassword, setSwitchPassword] = useState('');
  const [switchError, setSwitchError] = useState('');

  useEffect(() => {
    getMyLinkedAccount().then(setLinked);
  }, []);

  const doLink = async () => {
    if (!otherEmail.trim() || !otherPassword) return;
    setLinking(true);
    setLinkError('');
    const { error } = await linkSecondAccount(otherEmail, otherPassword);
    setLinking(false);
    if (error) {
      setLinkError(error);
      return;
    }
    setShowLinkForm(false);
    setOtherEmail('');
    setOtherPassword('');
    setLinked(await getMyLinkedAccount());
  };

  const doUnlink = async () => {
    const { error } = await unlinkMyAccount();
    if (error) return;
    setLinked(null);
  };

  const doSwitch = async () => {
    setSwitching(true);
    setSwitchError('');
    const { needsPassword } = await switchToDeviceSession(linked.id);
    setSwitching(false);
    if (needsPassword) {
      setSwitchPasswordNeeded(true);
      return;
    }
    onClose();
  };

  const confirmSwitchWithPassword = async () => {
    if (!switchPassword) return;
    setSwitching(true);
    setSwitchError('');
    const { error } = await loginAccount(linked.email, switchPassword);
    setSwitching(false);
    if (error) {
      setSwitchError(error);
      return;
    }
    onClose();
  };

  return (
    <div className="rb-profile-field-group">
      <div className="rb-profile-field-title"><strong>Profili collegati</strong></div>
      <p className="rb-profile-link-hint">
        {user.tipoAccount === 'azienda'
          ? 'Puoi collegare un tuo account Persona già esistente: comparirà qui uno switcher per passare dall\'uno all\'altro.'
          : 'Puoi collegare un tuo account Azienda già esistente: comparirà qui uno switcher per passare dall\'uno all\'altro.'}
      </p>

      {linked === undefined && <p className="rb-profile-status">Caricamento...</p>}

      {linked === null && !showLinkForm && (
        <button type="button" className="rb-profile-save-btn" onClick={() => setShowLinkForm(true)}>
          + Collega un profilo esistente
        </button>
      )}

      {linked === null && showLinkForm && (
        <div className="rb-profile-link-form">
          <p className="rb-profile-link-hint">
            Non hai ancora un secondo account? Esci e registrane uno nuovo del tipo opposto, poi torna qui per collegarlo.
          </p>
          <input
            type="email"
            placeholder="Mail dell'altro account"
            value={otherEmail}
            onChange={(e) => setOtherEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password dell'altro account"
            value={otherPassword}
            onChange={(e) => setOtherPassword(e.target.value)}
          />
          {linkError && <p className="rb-profile-field-error">{linkError}</p>}
          <div className="rb-profile-confirm-actions">
            <button type="button" onClick={() => { setShowLinkForm(false); setLinkError(''); }}>Annulla</button>
            <button type="button" className="rb-profile-confirm-ok" onClick={doLink} disabled={!otherEmail.trim() || !otherPassword || linking}>
              {linking ? 'Un attimo…' : 'Collega'}
            </button>
          </div>
        </div>
      )}

      {linked && (
        <div className="rb-profile-linked-card">
          <img src={linked.avatar} alt={linked.nickname} />
          <div className="rb-profile-linked-info">
            <strong>{linked.nickname}</strong>
            <span>{linked.tipoAccount === 'azienda' ? '🏢 Azienda' : '🙂 Persona'}</span>
          </div>
          <div className="rb-profile-linked-actions">
            <button type="button" className="rb-profile-save-btn" onClick={doSwitch} disabled={switching}>
              {switching ? 'Un attimo…' : 'Passa a questo profilo'}
            </button>
            <button type="button" className="rb-profile-unlink-btn" onClick={doUnlink}>Scollega</button>
          </div>
          {switchPasswordNeeded && (
            <div className="rb-profile-link-form">
              <p className="rb-profile-link-hint">Prima volta su questo dispositivo: inserisci la password di {linked.nickname}.</p>
              <input
                type="password"
                placeholder="Password"
                value={switchPassword}
                onChange={(e) => setSwitchPassword(e.target.value)}
                autoFocus
              />
              {switchError && <p className="rb-profile-field-error">{switchError}</p>}
              <div className="rb-profile-confirm-actions">
                <button type="button" onClick={() => { setSwitchPasswordNeeded(false); setSwitchPassword(''); setSwitchError(''); }}>Annulla</button>
                <button type="button" className="rb-profile-confirm-ok" onClick={confirmSwitchWithPassword} disabled={!switchPassword || switching}>
                  {switching ? 'Un attimo…' : 'Entra'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Città e bio mostrate nel mazzo del mondo Incontri (get_match_candidates):
// spostate qui da Impostazioni perché sono dati personali del profilo come
// gli altri in questa scheda, aggiornabili quando si vuole — non più un
// "filtro" con Applica. Salvataggio immediato, come nickname/nome.
function DatingProfileSection({ user, onUpdateUser }) {
  const [citta, setCitta] = useState(user?.citta ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError('');
    setSuccess('');
    setBusy(true);
    const { error: err } = await updateOwnDatingProfile(citta.trim(), bio.trim());
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setSuccess('Profilo Incontri aggiornato.');
    onUpdateUser?.({ ...user, citta: citta.trim(), bio: bio.trim() });
  };

  return (
    <div className="rb-profile-field-group">
      <div className="rb-profile-field-title"><strong>Profilo Incontri</strong></div>
      <p className="rb-profile-link-hint">Città e bio mostrate agli altri nel mazzo del mondo Incontri.</p>
      <label className="rb-field">
        <span className="rb-field-label-row">
          Città
          <span className="rb-profile-link-hint" style={{ margin: 0 }}>{citta.length}/{CITTA_MAX}</span>
        </span>
        <input type="text" value={citta} maxLength={CITTA_MAX} onChange={(e) => setCitta(e.target.value)} />
      </label>
      <label className="rb-field">
        <span className="rb-field-label-row">
          Bio
          <span className="rb-profile-link-hint" style={{ margin: 0 }}>{bio.length}/{BIO_MAX}</span>
        </span>
        <textarea rows={3} value={bio} maxLength={BIO_MAX} onChange={(e) => setBio(e.target.value)} />
      </label>
      {error && <p className="rb-profile-field-error">{error}</p>}
      {success && <p className="rb-profile-field-success">{success}</p>}
      <button type="button" className="rb-profile-save-btn" onClick={save} disabled={busy}>
        {busy ? 'Un attimo…' : 'Salva'}
      </button>
    </div>
  );
}

// Apre un documento in una nuova scheda: il bucket "attachments" è privato,
// serve un url firmato temporaneo (stesso meccanismo usato dal pannello
// admin per la verifica documenti, vedi AdminPanel.jsx).
async function openDocument(att) {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(att.path, 60);
  if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
}

// Documenti personali (es. curriculum, documento d'identità): stesso
// bucket privato usato per gli allegati in registrazione (data/accounts.js
// uploadAttachment), qui si possono aggiungere anche dopo. Chi potrà
// vederli e con quale consenso (es. le aziende per il CV) è da decidere:
// per ora solo caricamento e anteprima per il proprietario.
function DocumentsSection({ user, onUpdateUser }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    setError('');
    for (const file of files) {
      const { error: err } = await uploadAttachment(user.id, file);
      if (err) setError(err);
    }
    const fresh = await getCurrentAccount();
    if (fresh) onUpdateUser(fresh);
    setUploading(false);
  };

  return (
    <div className="rb-profile-field-group">
      <div className="rb-profile-field-title"><strong>Documenti</strong></div>
      <p className="rb-profile-link-hint">
        Carica documenti personali (es. curriculum, documento d'identità). Per ora solo tu puoi vederli qui;
        a chi e come renderli visibili (es. alle aziende per il CV) lo decideremo più avanti.
      </p>
      {(user.attachments ?? []).length > 0 && (
        <ul className="rb-profile-documents-list">
          {user.attachments.map((att, i) => (
            <li key={i}>
              <button type="button" onClick={() => openDocument(att)} title={att.name}>
                📄 {att.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="rb-profile-field-error">{error}</p>}
      <button type="button" className="rb-profile-save-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
        {uploading ? 'Caricamento...' : '+ Carica documento'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        multiple
        hidden
        onChange={handleFiles}
      />
    </div>
  );
}

// Anteprima di come il profilo appare agli altri: gli stessi dati
// pubblici mostrati in giro per l'app (avatar, nickname, spunta
// verificato, tipo account) — nome/cognome non compaiono perché non sono
// mai mostrati agli altri utenti, solo usati per la verifica documento.
// Città e bio restano fuori: servono solo al mazzo del mondo Incontri
// (Impostazioni → Profilo Incontri), non sono un dato di profilo generale.
function ProfilePreviewCard({ user }) {
  const pronomi = user.pronomi || (user.genere === 'donna' ? 'Lei (she/her)' : user.genere === 'uomo' ? 'Lui (he/him)' : '');
  return (
    <div className="rb-profile-preview">
      <p className="rb-profile-preview-label">Anteprima — così ti vedono gli altri utenti</p>
      <div className="rb-profile-preview-card">
        <img className="rb-profile-preview-avatar" src={user.avatar} alt={user.nickname} />
        <div className="rb-profile-preview-info">
          <div className="rb-profile-preview-name-row">
            <strong>{user.nickname}</strong>
            {user.verificato && <span className="rb-verified-badge" title="Account verificato">✓</span>}
          </div>
          {user.tipoAccount === 'azienda' ? (
            <span className="rb-profile-preview-tag">🏢 {user.ragioneSociale || 'Azienda'}</span>
          ) : (
            pronomi && <span className="rb-profile-preview-tag">{pronomi}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProfileSettingsPanel({ open, onClose, user, onUpdateUser, favoriteCategories = [] }) {
  const [tab, setTab] = useState('profilo');
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [nickErr, setNickErr] = useState('');
  const [nickOk, setNickOk] = useState('');
  const [nome, setNome] = useState(user?.nome ?? '');
  const [cognome, setCognome] = useState(user?.cognome ?? '');
  const [nameErr, setNameErr] = useState('');
  const [nameOk, setNameOk] = useState('');
  const [urgentField, setUrgentField] = useState(null); // 'nickname' | 'nome' | null
  const [urgentBody, setUrgentBody] = useState('');
  const [urgentSent, setUrgentSent] = useState(false);

  useEffect(() => {
    if (open) setTab('profilo');
  }, [open]);

  if (!open || !user) return null;

  const saveNickname = async () => {
    const { account, error } = await updateNickname(user.id, nickname);
    if (error) {
      setNickErr(error);
      setNickOk('');
      return;
    }
    setNickErr('');
    setNickOk('Nickname aggiornato.');
    onUpdateUser(account);
  };

  const saveName = async () => {
    const { account, error } = await updateName(user.id, nome, cognome);
    if (error) {
      setNameErr(error);
      setNameOk('');
      return;
    }
    setNameErr('');
    setNameOk('Nome e cognome aggiornati.');
    onUpdateUser(account);
  };

  const openUrgent = (field) => {
    setUrgentField(field);
    setUrgentBody('');
    setUrgentSent(false);
  };

  const sendUrgent = async () => {
    if (!urgentBody.trim()) return;
    const { error } = await sendMailboxMessage({
      fromAccountId: user.id,
      fromNickname: user.nickname,
      subject: urgentField === 'nickname' ? 'Richiesta urgente: cambio nickname' : 'Richiesta urgente: cambio nome/cognome',
      body: urgentBody.trim(),
    });
    if (!error) setUrgentSent(true);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-profile-settings-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        <h2>Il mio profilo</h2>

        <div className="rb-profile-tabs">
          <button type="button" className={tab === 'profilo' ? 'active' : ''} onClick={() => setTab('profilo')}>Profilo</button>
          <button type="button" className={tab === 'album' ? 'active' : ''} onClick={() => setTab('album')}>Album</button>
          <button type="button" className={tab === 'documenti' ? 'active' : ''} onClick={() => setTab('documenti')}>Documenti</button>
          <button type="button" className={tab === 'preferiti' ? 'active' : ''} onClick={() => setTab('preferiti')}>Preferiti</button>
          <button type="button" className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}>Account</button>
        </div>

        {tab === 'preferiti' && <FavoriteCategoriesList favoriteCategories={favoriteCategories} />}

        {tab === 'profilo' && (
          <>
            <AvatarUploader user={user} onUpdateUser={onUpdateUser} />
            <ProfilePreviewCard user={user} />
            <DatingProfileSection user={user} onUpdateUser={onUpdateUser} />
          </>
        )}

        {tab === 'album' && <AlbumsPanel />}

        {tab === 'documenti' && <DocumentsSection user={user} onUpdateUser={onUpdateUser} />}

        {tab === 'account' && (
          <>
            <FieldGroup
              title="Nickname"
              ruleText={NICKNAME_RULE_TEXT}
              cooldownMs={nicknameCooldownRemaining(user)}
              onSave={saveNickname}
              onRequestUrgent={() => openUrgent('nickname')}
              disabled={!nickname.trim() || nickname.trim() === user.nickname}
              error={nickErr}
              success={nickOk}
            >
              <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={30} />
            </FieldGroup>

            <FieldGroup
              title="Nome e cognome"
              ruleText={NAME_RULE_TEXT}
              cooldownMs={nameCooldownRemaining(user)}
              onSave={saveName}
              onRequestUrgent={() => openUrgent('nome')}
              disabled={!nome.trim() && !cognome.trim()}
              error={nameErr}
              success={nameOk}
            >
              <div className="rb-profile-name-row">
                <input type="text" placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} />
                <input type="text" placeholder="Cognome" value={cognome} onChange={(e) => setCognome(e.target.value)} maxLength={40} />
              </div>
            </FieldGroup>

            <AccountTab user={user} onUpdateUser={onUpdateUser} />
            <AccountLinkPanel user={user} onClose={onClose} />
          </>
        )}

        {urgentField && (
          <ModalOverlay onClose={() => setUrgentField(null)} className="rb-profile-confirm-overlay">
            <div className="rb-profile-confirm-card" onClick={(e) => e.stopPropagation()}>
              {urgentSent ? (
                <>
                  <p>Richiesta inviata ai moderatori. Ti risponderanno appena possibile.</p>
                  <div className="rb-profile-confirm-actions">
                    <button type="button" className="rb-profile-confirm-ok" onClick={() => setUrgentField(null)}>
                      Chiudi
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>Spiega ai moderatori perché ti serve la modifica prima del tempo previsto.</p>
                  <textarea
                    className="rb-profile-urgent-textarea"
                    rows={4}
                    value={urgentBody}
                    onChange={(e) => setUrgentBody(e.target.value)}
                    placeholder="Scrivi qui la tua richiesta..."
                  />
                  <div className="rb-profile-confirm-actions">
                    <button type="button" onClick={() => setUrgentField(null)}>Annulla</button>
                    <button type="button" className="rb-profile-confirm-ok" onClick={sendUrgent} disabled={!urgentBody.trim()}>
                      Invia
                    </button>
                  </div>
                </>
              )}
            </div>
          </ModalOverlay>
        )}
      </div>
    </ModalOverlay>
  );
}
