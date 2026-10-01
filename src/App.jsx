import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORY_FLY_MS, CATEGORY_CLOSE_MS } from './fx/timing';
import { lazyWithRetry } from './fx/lazyWithRetry';
import { translateWorld } from './i18n/worldLabels';
import { translateCategoryLabel } from './i18n/categoryLabels';
import { setAppLanguage } from './i18n';
import TopBar from './components/TopBar';
import DisabledWorldPopover from './components/DisabledWorldPopover';
import WorldSelectorColumn from './components/WorldSelectorColumn';
import { WORLDS, DEFAULT_WORLD_INDEX } from './data/worlds';
import { fetchVideoRoom, setPendingRoomFocus, roomCategoryTarget } from './data/videoRooms';
import { fetchLfg } from './data/gaming';
import { getListing } from './data/annunci';
import { clearDeepLinkHash, parseDeepLink, profileIdByNickname } from './data/deepLinks';
import { usersForWorld } from './data/mockUsers';
import { fetchGlobeUsers } from './data/globeUsers';
import { useSwipeWorld } from './hooks/useSwipeWorld';
import { useBackLayer, useBackNavigationRoot } from './hooks/useBackLayer';
import { findCityMatch } from './data/geo';
import { getVistaPreferenze, locationFiltersFrom, EMPTY_LOCATION_FILTERS, VISTA_SAVED_EVENT } from './data/vista';
import {
  ARTE_CATEGORIES,
  FEATURED_SEARCHES as ARTE_FEATURED,
  CATEGORY_RESULTS as ARTE_RESULTS,
  resolveCategoryQuery as resolveArteCategoryQuery,
} from './data/arteCategories';
import {
  NERD_CATEGORIES,
  FEATURED_SEARCHES as NERD_FEATURED,
  CATEGORY_RESULTS as NERD_RESULTS,
  resolveCategoryQuery as resolveNerdCategoryQuery,
} from './data/nerdCategories';
import { BAMBINI_CATEGORIES, resolveCategoryQuery as resolveBambiniCategoryQuery } from './games/registry';
import { INCONTRI_CATEGORIES, resolveCategoryQuery as resolveIncontriCategoryQuery } from './data/incontriCategories';
import { SOCIAL_CATEGORIES, resolveCategoryQuery as resolveSocialCategoryQuery } from './data/socialCategories';
import { getLavoroCategories, canSearchCandidates, resolveCategoryQuery as resolveLavoroCategoryQuery } from './data/lavoroCategories';
import { VETRINA_CATEGORIES, resolveCategoryQuery as resolveVetrinaCategoryQuery } from './data/vetrinaCategories';
import { getFaqCategories, resolveCategoryQuery as resolveFaqCategoryQuery } from './data/faqCategories';
import { ANNUNCI_CATEGORIES, resolveCategoryQuery as resolveAnnunciCategoryQuery } from './data/annunciCategories';
import { ANIMALI_CATEGORIES, resolveCategoryQuery as resolveAnimaliCategoryQuery } from './data/animaliCategories';
import AccessGate from './components/AccessGate';
import CookieConsentBanner from './components/CookieConsentBanner';
import UpdateToast from './components/UpdateToast';
import { hasLavoroConsent } from './data/lavoro';
import { isAdult } from './data/age';
import { needsProfileOnboarding, clearProfileOnboarding } from './data/profileOnboarding';
import { getMyDatingProfile, segnaAvvisoIncontri } from './data/incontri';
import { incontriNoticeText } from './data/datingLabels';
import { isEventExpired, fetchEvents, createEvent as createEventApi, toggleEventLike as toggleEventLikeApi, subscribeToNewEvents } from './data/events';
import { isStaff } from './data/roles';
import { listMyFavoriteCategories, addFavoriteCategory, removeFavoriteCategory } from './data/favoriteCategories';
import { getCurrentAccount, subscribeAuthChanges, logoutAccount, getCachedProfile, clearCachedProfile, accountPause, reactivateOwnAccount, isAccountBlocked } from './data/accounts';
import {
  getFriends,
  getSentRequests,
  getReceivedRequests,
  sendFriendRequest as sendFriendRequestApi,
  removeFriend as removeFriendApi,
} from './data/friends';
import { getReceivedFamilyRequests } from './data/family';
import { getUnreadCounts, subscribeToOwnMessages, markChatsDelivered } from './data/directChat';
import { touchLastSeen } from './data/incontri';
import { getMyNotifications, subscribeToOwnNotifications, describeNotification } from './data/notifications';
import { fetchProfilesMap } from './data/posts';
import { supabase } from './data/supabaseClient';
import PageLoading from './components/PageLoading';
import { useGlobeCover } from './fx/globeCover';
import './App.css';
import { CallProvider } from './calls/CallProvider';
import AvatarImg from './components/shared/AvatarImg';

// Componenti pesanti o aperti solo su richiesta, caricati al bisogno invece
// che nel bundle iniziale (React.lazy + Suspense, vedi fallback PageLoading
// qui sotto e nei singoli punti d'uso). WorldGlobe da solo si porta dietro
// Three.js + react-globe.gl, il pezzo più grosso di tutti: è nel proprio
// chunk a parte anche solo per questo.
const WorldGlobe = lazyWithRetry(() => import('./components/WorldGlobe'));
const ArteExplorer = lazyWithRetry(() => import('./components/ArteExplorer'));
const BambiniGameExplorer = lazyWithRetry(() => import('./components/BambiniGameExplorer'));
const SocialWorldExplorer = lazyWithRetry(() => import('./components/social/SocialWorldExplorer'));
const IncontriLiveExplorer = lazyWithRetry(() => import('./components/incontri/IncontriLiveExplorer'));
const LavoroWorldExplorer = lazyWithRetry(() => import('./components/lavoro/LavoroWorldExplorer'));
const LavoroConsentGate = lazyWithRetry(() => import('./components/lavoro/LavoroConsentGate'));
const CandidatoModal = lazyWithRetry(() => import('./components/lavoro/CandidatoModal'));
const FaqWorldExplorer = lazyWithRetry(() => import('./components/faq/FaqWorldExplorer'));
const AnnunciWorldExplorer = lazyWithRetry(() => import('./components/annunci/AnnunciWorldExplorer'));
const AnimaliWorldExplorer = lazyWithRetry(() => import('./components/animali/AnimaliWorldExplorer'));
const WipWorldExplorer = lazyWithRetry(() => import('./components/wip/WipWorldExplorer'));
const SettingsPanel = lazyWithRetry(() => import('./components/SettingsPanel'));
const ProfileModal = lazyWithRetry(() => import('./components/ProfileModal'));
const AuthModal = lazyWithRetry(() => import('./components/AuthModal'));
const EventLikersModal = lazyWithRetry(() => import('./components/EventLikersModal'));
const ReactorsModal = lazyWithRetry(() => import('./components/cultural/ReactorsModal'));
const FriendChatModal = lazyWithRetry(() => import('./components/FriendChatModal'));
const IncomingCallToast = lazyWithRetry(() => import('./components/IncomingCallToast'));
const MentionProfileViewer = lazyWithRetry(() => import('./components/shared/MentionProfileViewer'));
const DatingCardModal = lazyWithRetry(() => import('./components/incontri/DatingCardModal'));
const DMHub = lazyWithRetry(() => import('./components/DMHub'));
const AdminPanel = lazyWithRetry(() => import('./components/AdminPanel'));
const ProfileSettingsPanel = lazyWithRetry(() => import('./components/ProfileSettingsPanel'));
const PasswordRecoveryModal = lazyWithRetry(() => import('./components/PasswordRecoveryModal'));
const NotificationsPanel = lazyWithRetry(() => import('./components/NotificationsPanel'));
const FavoritesPanel = lazyWithRetry(() => import('./components/FavoritesPanel'));

const DEFAULT_ARTE_FILTER = { category: '', subfamily: '' };
const DEFAULT_VISIBILITY = { nearbyVisible: false, shareLiveLocation: false };

// Quante categorie mostra al massimo la lista sotto al mondo (rb-world-tagline-list):
// oltre questo numero compare la freccetta per scorrere le altre.
const CATEGORY_LIST_PAGE_SIZE = 5;

// Mondi che hanno un proprio set di categorie esplorabili sul globo (triangoli
// cliccabili + colonne di ricerca/persone vicine, via ArteExplorer/CategoryColumn).
// Aggiungere un mondo qui basta a fargli usare lo stesso meccanismo, senza copie.
const CATEGORY_WORLDS = {
  arte: { categories: ARTE_CATEGORIES, featured: ARTE_FEATURED, results: ARTE_RESULTS, resolveQuery: resolveArteCategoryQuery },
  nerd: { categories: NERD_CATEGORIES, featured: NERD_FEATURED, results: NERD_RESULTS, resolveQuery: resolveNerdCategoryQuery },
  // Bambini non ha colonne di contenuti (featured/results): i "triangoli"
  // sono i minigiochi stessi, aperti tramite BambiniGameExplorer.
  bambini: { categories: BAMBINI_CATEGORIES, resolveQuery: resolveBambiniCategoryQuery },
  // Incontri: solo "Match" per ora, apre lo swipe invece di colonne di contenuti.
  incontri: { categories: INCONTRI_CATEGORIES, resolveQuery: resolveIncontriCategoryQuery },
  // Social: solo "World", apre il feed esistente invece di CategoryColumn.
  social: { categories: SOCIAL_CATEGORIES, resolveQuery: resolveSocialCategoryQuery },
  // Lavoro: "Stanza conferenze" per tutti; "Cerca candidati" solo per le
  // aziende verificate, aggiunta sotto con getLavoroCategories(...) come la
  // Stanza MOD del mondo FAQ.
  lavoro: { categories: getLavoroCategories(false), resolveQuery: resolveLavoroCategoryQuery },
  // Vetrina: solo "Novità" per ora, nessun contenuto editoriale ancora —
  // CategoryColumn mostra da sé lo stato vuoto con featured/results vuoti.
  vetrina: { categories: VETRINA_CATEGORIES, featured: {}, results: {}, resolveQuery: resolveVetrinaCategoryQuery },
  // FAQ: categorie variabili col ruolo (Stanza MOD solo staff), sostituite
  // sotto con getFaqCategories(isStaff(...)) — questa voce resta solo come
  // fallback per il conteggio "più di CATEGORY_LIST_PAGE_SIZE" iniziale.
  faq: { categories: getFaqCategories(false), resolveQuery: resolveFaqCategoryQuery },
  annunci: { categories: ANNUNCI_CATEGORIES, resolveQuery: resolveAnnunciCategoryQuery },
  // Animali: solo "Cani" per ora, apre la mappa DogWorldMap invece di CategoryColumn.
  animali: { categories: ANIMALI_CATEGORIES, resolveQuery: resolveAnimaliCategoryQuery },
};

// Aspetta che l'utente finisca di digitare prima di far "volare" il globo sulla città cercata.
function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function loadStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const { t, i18n } = useTranslation();
  // Mentre un minigioco del mondo Bambini è aperto, lo swipe/le frecce non
  // devono cambiare mondo: alcuni giochi (es. Snake) usano le stesse frecce
  // per i propri controlli.
  const [gameplayActive, setGameplayActive] = useState(false);
  // Account bloccato (vedi accountBlocked più giù): niente swipe/frecce per
  // cambiare mondo, resta nel mondo FAQ.
  const [worldNavLocked, setWorldNavLocked] = useState(false);
  const { index, setIndex, containerRef } = useSwipeWorld(WORLDS.length, DEFAULT_WORLD_INDEX, gameplayActive || worldNavLocked);
  const world = WORLDS[index];
  const baseCategorySet = CATEGORY_WORLDS[world.id] ?? null;
  // Incontri e Lavoro sono riservati ai maggiorenni: l'età è quella vera
  // dell'account (data di nascita in registrazione), non più una
  // dichiarazione con un pulsante.
  const isAgeGatedWorld = world.id === 'incontri' || world.id === 'lavoro';

  // L'account loggato vive su Supabase Auth, non più in localStorage: alla
  // partenza si controlla se il browser ha già una sessione valida
  // (persistita da supabase-js per conto suo) e ci si iscrive ai cambi di
  // sessione (login/logout/refresh token), così lo stato resta sempre
  // coerente anche se scade o cambia altrove.
  const [user, setUser] = useState(null);
  // Account bloccato: resta dentro, ma può aprire solo il mondo FAQ e la
  // categoria INFO BAN; tutto il resto è disattivato, con la fascia
  // "Account bloccato" in alto. Blocco scaduto o tolto: al caricamento
  // successivo del profilo torna tutto normale (data/banStatus.js).
  const accountBlocked = isAccountBlocked(user);
  useEffect(() => {
    setWorldNavLocked(accountBlocked);
  }, [accountBlocked]);

  // Consenso al mondo Lavoro (nome/cognome reali visibili solo lì, vedi
  // LavoroConsentGate): null finché non si è ancora controllato (evita di
  // mostrare per un attimo il gate a chi ha già consentito), poi true/false
  // dalla RPC has_lavoro_consent. Si ricontrolla ad ogni cambio di account e
  // ogni volta che si rientra nel mondo Lavoro (potrebbe essere stato
  // revocato dalle Impostazioni mentre si era altrove).
  const [lavoroConsent, setLavoroConsentState] = useState(null);
  useEffect(() => {
    if (world.id !== 'lavoro' || !user || !isAdult(user?.dataNascita)) return undefined;
    let cancelled = false;
    setLavoroConsentState(null);
    hasLavoroConsent().then((consented) => {
      if (!cancelled) setLavoroConsentState(consented);
    });
    return () => {
      cancelled = true;
    };
  }, [world.id, user?.id]);

  // La Stanza MOD (mondo FAQ) esiste solo per owner/moderatori: qui si
  // ricalcola la lista categorie in base al ruolo, così il triangolo/nuvola
  // sul globo e la lista sotto al mondo non la mostrano mai a chi non deve
  // vederla (vedi anche FaqWorldExplorer, che rifà lo stesso filtro per sé).
  // Stesso filtro per "Cerca candidati" del mondo Lavoro (solo aziende
  // verificate e owner, vedi canSearchCandidates).
  const canRecruit = canSearchCandidates(user);
  const categorySet = useMemo(() => {
    if (!baseCategorySet) return baseCategorySet;
    if (world.id === 'faq') return { ...baseCategorySet, categories: getFaqCategories(isStaff(user?.ruolo), user) };
    if (world.id === 'lavoro') return { ...baseCategorySet, categories: getLavoroCategories(canRecruit, user) };
    return baseCategorySet;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCategorySet, world.id, user?.ruolo, canRecruit, accountBlocked]);
  // Lista categorie sotto al mondo (vedi rb-world-tagline-list più sotto):
  // ne mostra al massimo 5 alla volta, a PAGINE intere (non una alla volta:
  // la freccetta salta alla pagina successiva, es. 6-10, non scorre di un
  // solo elemento), tornando alla prima pagina dopo l'ultima (paginazione
  // infinita). Si azzera ad ogni cambio di mondo, altrimenti si potrebbe
  // entrare in un mondo già a metà lista.
  const [categoryPage, setCategoryPage] = useState(0);
  useEffect(() => {
    setCategoryPage(0);
  }, [categorySet]);
  // La lingua scelta in registrazione (o nelle Impostazioni) segue
  // l'account da un dispositivo all'altro: appena arriva un profilo con una
  // lingua diversa da quella già attiva su questo dispositivo, si applica
  // quella dell'account (vedi anche setOwnLingua in data/accounts.js).
  useEffect(() => {
    if (user?.lingua && user.lingua !== i18n.language) {
      setAppLanguage(user.lingua);
    }
  }, [user?.lingua, i18n]);
  // false all'avvio finché non sappiamo davvero se c'è una sessione valida:
  // AccessGate/AuthModal restano nascosti fino ad allora, altrimenti
  // "Accedi per continuare" comparirebbe (e poi sparirebbe da solo) ogni
  // volta che la rete è lenta a rispondere pur con una sessione valida.
  const [authReady, setAuthReady] = useState(false);
  const [justConfirmedEmail, setJustConfirmedEmail] = useState(false);
  // Avviso non bloccante dopo la registrazione (es. un allegato respinto
  // dallo storage): il modale di login/registrazione si chiude comunque,
  // altrimenti non ci sarebbe più dove mostrarlo.
  const [signupNotice, setSignupNotice] = useState('');
  // Conferma dopo l'eliminazione definitiva dell'account (Impostazioni ->
  // Elimina account): a quel punto user è già null e tutti i pannelli si
  // sono chiusi, serve solo un avviso temporaneo.
  const [accountDeletedNotice, setAccountDeletedNotice] = useState('');
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pauseError, setPauseError] = useState('');
  // Modale "Scegli una nuova password", apre solo sull'evento
  // PASSWORD_RECOVERY di Supabase Auth (link "Password dimenticata?"
  // cliccato dalla mail) — mai su richiesta diretta dell'utente.
  const [passwordRecoveryOpen, setPasswordRecoveryOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Sezione da aprire subito nelle Impostazioni (evento vm:open-settings).
  const [settingsInitialSection, setSettingsInitialSection] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  // Mondo Lavoro, azienda verificata (o owner) che clicca un utente sul
  // globo: si apre la scheda candidato (CandidatoModal, la stessa di "Cerca
  // candidati"), non il profilo Social. Anteprima con i dati del globo,
  // il resto arriva da get_candidato_lavoro.
  const [candidatoPreview, setCandidatoPreview] = useState(null);

  // Mondi disattivati dall'utente (Impostazioni -> Mondi): sul mappamondo il
  // loro satellite diventa un buco nero (vedi globe/blackHole.js). Il globo
  // riceve l'elenco solo a Impostazioni chiuse, così la disattivazione si
  // vede davvero (su telefono il pannello copre tutto) invece di finire
  // dietro. animate: il cambio l'ha fatto adesso lo stesso utente (dalle
  // Impostazioni o da "Riattiva mondo"); un login o un cambio account
  // mostrano invece subito lo stato salvato, senza animazione. FAQ non si
  // può disattivare (vedi worldDisabledByUser più giù).
  const disabledWorldsKey = user
    ? WORLDS.filter((w) => w.id !== 'faq' && !(user.mondiAbilitati ?? []).includes(w.id))
        .map((w) => w.id)
        .join(',')
    : '';
  const globeUserId = user?.id ?? null;
  const [globeDisabledWorlds, setGlobeDisabledWorlds] = useState({ key: disabledWorldsKey, userId: globeUserId, animate: false });
  if (!settingsOpen && (globeDisabledWorlds.key !== disabledWorldsKey || globeDisabledWorlds.userId !== globeUserId)) {
    setGlobeDisabledWorlds({
      key: disabledWorldsKey,
      userId: globeUserId,
      animate: globeDisabledWorlds.userId !== null && globeDisabledWorlds.userId === globeUserId,
    });
  }
  // Riquadro "Riattiva mondo" aperto cliccando un buco nero: { worldId, x, y }.
  const [disabledWorldPopover, setDisabledWorldPopover] = useState(null);
  const closeDisabledWorldPopover = useCallback(() => setDisabledWorldPopover(null), []);

  // "Chi vedo" del Profilo Social e del Profilo di Lavoro (data/vista.js),
  // salvato sul server: sostituisce i vecchi filtri Luogo/Mostrami delle
  // Impostazioni. globe_users applica già zona, distanza ed età; qui serve
  // solo il "centro" per eventi, annunci e simili (locationFilters).
  const [vista, setVista] = useState(null);
  const [globeUsersVersion, setGlobeUsersVersion] = useState(0);
  const [activeArteCategory, setActiveArteCategory] = useState(null);
  // Vero solo quando il pannello categoria appena aperto arriva da un volo
  // di camera completo (vedi flyToCategoryThenOpen): governa il morph
  // etichetta->titolo della Fase 2c, che parte dal centro schermo solo in
  // quel caso — senza volo non c'è un'etichetta "appena vista lì" da cui farlo partire.
  const [categoryOpenedViaFly, setCategoryOpenedViaFly] = useState(false);
  // Id della categoria il cui pannello sta dissolvendosi in particelle
  // (Fase 2d): resta uguale ad activeArteCategory per tutta la durata della
  // chiusura, così il pannello resta montato (stessa key) finché
  // l'animazione non è finita — vedi toggleArteCategory più sotto.
  const [closingCategoryId, setClosingCategoryId] = useState(null);
  const closingTimerRef = useRef(null);
  const [arteCategoryPositions, setArteCategoryPositions] = useState({});
  const [arteFilter, setArteFilter] = useState(() => loadStored('rb-arte-filter', DEFAULT_ARTE_FILTER));
  const [arteInitialSubfamily, setArteInitialSubfamily] = useState('');
  const [visibility, setVisibility] = useState(() => loadStored('rb-visibility', DEFAULT_VISIBILITY));
  // Posizione reale del dispositivo, aggiornata in continuo solo mentre
  // "Condividi la mia posizione in tempo reale" è attivo nelle Impostazioni
  // (vedi effect più sotto). Senza consenso attivo non si chiede mai il
  // permesso al browser, e il proprio marker semplicemente non appare sul
  // globo — nessuna posizione "finta" o salvata altrove.
  const [ownPosition, setOwnPosition] = useState(null);
  const geoWatchIdRef = useRef(null);
  const [flyTo, setFlyTo] = useState(null);
  // Richiesta di warp verso un mondo (Fase 2b): sia un satellite cliccato sul
  // globo sia il selettore a icone qui sotto passano da qui, così la stessa
  // animazione parte da entrambi i punti invece di duplicarla. `ts` cambia
  // sempre, anche cliccando due volte lo stesso mondo, per far ripartire
  // l'effect in WorldGlobe.jsx anche in quel caso.
  const [warpRequest, setWarpRequest] = useState(null);
  // Eventi del mondo Social e sistema di amicizie: sollevati qui (non dentro
  // SocialFeed) perché servono anche a WorldGlobe (marker quadrato sul
  // globo) e ai due sono montati insieme quando si è nel mondo Social.
  // Backend reale (tabelle events/event_attendees): caricati ad ogni
  // login/logout (la RLS decide cosa si vede) e aggiornati in tempo reale
  // quando qualcun altro ne crea uno nuovo (vedi effect più sotto).
  const [events, setEvents] = useState([]);
  const [eventActionError, setEventActionError] = useState('');
  // Amicizie e richieste: id soltanto (nomi/avatar li risolve chi li mostra
  // davvero, vedi ContactsPanel) — servono qui solo per i controlli rapidi
  // "è già amico?"/"gli ho già scritto?" sparsi nell'app (EventLikersModal,
  // Impostazioni Privacy).
  const [friends, setFriends] = useState([]);
  const [friendRequestsSent, setFriendRequestsSent] = useState([]);
  const [receivedRequestsCount, setReceivedRequestsCount] = useState(0);
  const [receivedFamilyRequestsCount, setReceivedFamilyRequestsCount] = useState(0);
  // Non letti per conversazione diretta (id conversazione -> numero), per il
  // totale sull'icona 💬 (vedi DMHub, che carica da solo la lista completa).
  const [unreadByConversation, setUnreadByConversation] = useState(new Map());
  const [friendsModalOpen, setFriendsModalOpen] = useState(false);
  const [dmHubInitialTab, setDmHubInitialTab] = useState('messaggi');
  const [eventLikersId, setEventLikersId] = useState(null);
  // Chi ha reagito "Lo voglio vedere"/"Mi è piaciuto" a un film/evento delle
  // categorie culturali (Cinema/Teatro/Arte/Live): { title, subtitle,
  // reactors } quando aperto, null quando chiuso (vedi ReactorsModal).
  const [culturalReactorsView, setCulturalReactorsView] = useState(null);
  const [activeFriendChatId, setActiveFriendChatId] = useState(null);
  // Conversazione già aperta da chi apre la chat (es. lo staff con
  // start_staff_conversation dalla Chat FAQ): FriendChatModal la usa
  // invece di crearne/cercarne una con start_direct_conversation.
  const [activeFriendChatConvId, setActiveFriendChatConvId] = useState(null);
  // Chat aperta da "Rispondi" su una chiamata in arrivo: la chiamata si
  // accetta da sola (vedi IncomingCallToast / CallModal autoAnswer).
  const [answerCallFrom, setAnswerCallFrom] = useState(null);
  useEffect(() => {
    if (!answerCallFrom) return undefined;
    const t = setTimeout(() => setAnswerCallFrom(null), 35000);
    return () => clearTimeout(t);
  }, [answerCallFrom]);
  // Notifiche (match/super like): il numero non letto sulla campanella, il
  // pannello, il toast quando ne arriva una nuova in tempo reale, e su
  // quale scheda di Incontri deve aprirsi cliccandola.
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // Pannello delle categorie preferite (stellina nella barra in alto).
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [notifToast, setNotifToast] = useState(null);
  // Post da mostrare nel feed Social (clic su una notifica di menzione).
  const [focusPost, setFocusPost] = useState(null);
  // Evento cliccato sul globo: si apre il feed Social sulla scheda Eventi,
  // con l'evento in vista (vedi SocialFeed focusEvent).
  const [focusEvent, setFocusEvent] = useState(null);
  // Profilo aperto cliccando una "@menzione" fuori dal feed Social.
  const [mentionProfileId, setMentionProfileId] = useState(null);
  // Mondo Incontri: cliccando un contatto si apre SOLO la scheda del
  // Profilo Incontri (DatingCardModal), mai il profilo Social.
  const [datingCardId, setDatingCardId] = useState(null);
  const worldIdRef = useRef(world.id);
  useEffect(() => {
    worldIdRef.current = world.id;
  }, [world.id]);
  const openProfileInWorld = (id) => {
    if (!id) return;
    if (worldIdRef.current === 'incontri') setDatingCardId(id);
    else setMentionProfileId(id);
  };
  // Annuncio "Cerco compagni" da evidenziare (notifiche lfg_*): { lfgId, seq }.
  const [gamingFocus, setGamingFocus] = useState(null);
  // Annuncio "Cerco gruppo" Cosplay da evidenziare (notifiche lfg_* con
  // riferimento cosplay_lfg): { lfgId, seq }, oppure evento Cosplay da un
  // link condiviso: { eventId, seq }.
  const [cosplayFocus, setCosplayFocus] = useState(null);
  // Annuncio aperto da un link condiviso: { listing, seq }.
  const [annunciFocus, setAnnunciFocus] = useState(null);
  // Link condiviso (#/social/post/<id>, #/u/<nickname>, #/annunci/<id>,
  // #/nerd/cosplay/evento/<id>, vedi data/deepLinks.js) in attesa di
  // sessione: si apre appena l'accesso è pronto.
  const [pendingLink, setPendingLink] = useState(() => parseDeepLink());
  // Avviso breve quando il contenuto di un link non c'è più.
  const [linkNotice, setLinkNotice] = useState('');
  useEffect(() => {
    if (!linkNotice) return undefined;
    const t = setTimeout(() => setLinkNotice(''), 4000);
    return () => clearTimeout(t);
  }, [linkNotice]);
  const [incontriInitialTab, setIncontriInitialTab] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  // 'incontri' = Il mio profilo aperto sul Profilo Incontri (avviso del mondo rosso).
  const [profileSettingsSection, setProfileSettingsSection] = useState(null);
  // "Completa il tuo profilo" dopo la registrazione (vedi profileOnboarding.js).
  const [profileOnboardingOpen, setProfileOnboardingOpen] = useState(false);
  // Mondo rosso: avviso finché il Profilo Incontri non è visibile.
  // Avviso "completa il Profilo Incontri": lo decide il server
  // (get_my_dating_profile.avviso, già spento per 14 giorni dopo che è stato
  // mostrato). { avviso, mancano } finché non si chiude.
  const [incontriNotice, setIncontriNotice] = useState(null);
  const [incontriCheck, setIncontriCheck] = useState(0);
  // Dopo "Completa il tuo profilo": l'avviso vale anche fuori dal mondo rosso.
  const [incontriNoticeAfterOnboarding, setIncontriNoticeAfterOnboarding] = useState(false);
  useEffect(() => {
    if (user && needsProfileOnboarding(user)) setProfileOnboardingOpen(true);
  }, [user?.id]);
  const incontriEnabled = Boolean(user) && (user.mondiAbilitati ?? []).includes('incontri') && isAdult(user.dataNascita);
  useEffect(() => {
    const wanted = (world.id === 'incontri' || incontriNoticeAfterOnboarding) && incontriEnabled && !profileOnboardingOpen && !profileSettingsOpen;
    if (!wanted || incontriNotice) return undefined;
    let cancelled = false;
    getMyDatingProfile().then((r) => {
      if (!cancelled && r.profile?.avviso) setIncontriNotice({ avviso: r.profile.avviso, mancano: r.profile.mancano, foto: r.profile.foto.length });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.id, incontriEnabled, user?.id, incontriCheck, profileOnboardingOpen, profileSettingsOpen, incontriNoticeAfterOnboarding]);
  // Categorie preferite (stellina accanto alla X di ogni pannello categoria,
  // vedi FavoriteStarButton): caricate una volta per sessione, aggiornate
  // subito quando l'utente ne aggiunge/togliene una.
  const [favoriteCategories, setFavoriteCategories] = useState([]);
  // Timer del pannello che deve ancora aprirsi a volo finito (vedi
  // flyToCategoryThenOpen): tenerlo in un ref per poterlo annullare se nel
  // frattempo si sceglie un'altra categoria o si cambia mondo.
  const pendingOpenRef = useRef(null);
  // Apertura categoria in sospeso quando la navigazione richiede PRIMA un
  // cambio di mondo (vedi navigateToCategory): si esegue in un effect
  // separato, dopo quello qui sotto che azzera activeArteCategory al cambio
  // mondo, altrimenti quell'effect cancellerebbe il timer appena creato
  // (stesso giro di render: world.id cambia, l'effect di reset gira e
  // troverebbe già pendingOpenRef.current impostato dalla nuova apertura).
  const pendingCategoryNavRef = useRef(null);

  // Le live del mondo Incontri sono state tolte (spostate in Social/Lavoro):
  // le vecchie chiavi locali di chi aveva già "avviato una diretta" finta
  // non servono più, tolte una volta per tutte dal browser di chi le aveva.
  useEffect(() => {
    localStorage.removeItem('rb-my-live-active');
    localStorage.removeItem('rb-my-live-views');
  }, []);

  // Cambiando mondo si azzera la categoria attiva (è sempre relativa al mondo
  // da cui si esce), altrimenti tornando in un mondo con categorie ci si
  // ritroverebbe un triangolo evidenziato senza pannelli aperti.
  useEffect(() => {
    if (pendingOpenRef.current) {
      clearTimeout(pendingOpenRef.current);
      pendingOpenRef.current = null;
    }
    setActiveArteCategory(null);
    return () => {
      if (pendingOpenRef.current) {
        clearTimeout(pendingOpenRef.current);
        pendingOpenRef.current = null;
      }
    };
  }, [world.id]);

  // Esegue l'apertura categoria rimasta in sospeso da navigateToCategory,
  // ora che il mondo è davvero cambiato e l'effect sopra ha già ripulito lo
  // stato del mondo precedente.
  useEffect(() => {
    if (!pendingCategoryNavRef.current) return;
    const openCategory = pendingCategoryNavRef.current;
    pendingCategoryNavRef.current = null;
    openCategory();
  }, [world.id]);

  useEffect(() => {
    document.documentElement.style.setProperty('--rb-accent', world.color);
  }, [world]);

  // Se chi ha aperto il backend si disconnette (o non è più owner/moderatore,
  // es. l'owner lo declassa da un altro account), il pannello si chiude da solo.
  useEffect(() => {
    if (adminOpen && !isStaff(user?.ruolo)) setAdminOpen(false);
  }, [user, adminOpen]);

  // Ripristina la sessione già salvata dal browser (se c'è) e resta in
  // ascolto di login/logout/refresh — vedi il commento sopra alla
  // dichiarazione di `user`. Se si arriva qui dal link di conferma mail,
  // Supabase mette i token di sessione nell'hash dell'URL: supabase-js li
  // legge da solo e logga subito, qui si nota solo che è successo (per il
  // banner) e si ripulisce l'hash dalla barra degli indirizzi.
  useEffect(() => {
    if (window.location.hash.includes('type=signup') || window.location.hash.includes('type=recovery')) {
      if (window.location.hash.includes('type=signup')) setJustConfirmedEmail(true);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    let cancelled = false;
    let ready = false;
    const markReady = () => {
      if (!ready) {
        ready = true;
        setAuthReady(true);
      }
    };

    // Percorso rapido: se c'è già una sessione salvata dal browser E una
    // cache dello stesso utente, si mostra subito quella (authReady=true
    // all'istante) invece di aspettare la vera riga da profiles — che
    // arriva comunque poco dopo dal fetch sotto e sostituisce la cache.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session?.user) {
        clearCachedProfile();
        return;
      }
      const cached = getCachedProfile();
      if (cached?.id === session.user.id) {
        setUser(cached);
        markReady();
      }
    });

    // Timeout di sicurezza solo per authReady, non per la richiesta vera e
    // propria sotto: se la rete non risponde in tempo ma c'era una cache,
    // markReady() qui sopra è già scattato e questo non fa nulla; altrimenti
    // si sblocca comunque il gate con user=null (aggiornato più tardi se e
    // quando la richiesta vera arriva).
    const timeoutId = window.setTimeout(markReady, 8000);

    getCurrentAccount().then((account) => {
      if (cancelled) return;
      setUser(account);
      markReady();
    });

    // Il link "Password dimenticata?" della mail (type=recovery nell'hash,
    // ripulito sopra) fa arrivare qui con una sessione temporanea di
    // recupero: Supabase Auth lo segnala con l'evento PASSWORD_RECOVERY,
    // mai altrove, quindi è l'unico punto in cui apriamo quella modale.
    const unsubscribe = subscribeAuthChanges((account, event) => {
      if (cancelled) return;
      // Chi viene bloccato mentre naviga resta dentro: al prossimo evento di
      // auth (es. il refresh del token) il profilo nuovo ha bannato=true e
      // l'app passa da sola a FAQ › INFO BAN (vedi accountBlocked).
      setUser(account);
      markReady();
      if (event === 'PASSWORD_RECOVERY') setPasswordRecoveryOpen(true);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!justConfirmedEmail) return undefined;
    const timer = setTimeout(() => setJustConfirmedEmail(false), 6000);
    return () => clearTimeout(timer);
  }, [justConfirmedEmail]);

  useEffect(() => {
    if (!signupNotice) return undefined;
    const timer = setTimeout(() => setSignupNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [signupNotice]);

  useEffect(() => {
    if (!accountDeletedNotice) return undefined;
    const timer = setTimeout(() => setAccountDeletedNotice(false), 6000);
    return () => clearTimeout(timer);
  }, [accountDeletedNotice]);

  // Vecchi filtri locali (Luogo/Mostrami), sostituiti da "Chi vedo".
  useEffect(() => {
    try {
      localStorage.removeItem('rb-filters');
      localStorage.removeItem('rb-location-filters');
    } catch {
      // storage non disponibile: niente da togliere
    }
  }, []);
  useEffect(() => {
    if (!user) {
      setVista(null);
      return undefined;
    }
    let cancelled = false;
    const load = () =>
      getVistaPreferenze().then((v) => {
        if (!cancelled) setVista(v);
      });
    load();
    const onSaved = () => {
      load();
      setGlobeUsersVersion((n) => n + 1);
    };
    window.addEventListener(VISTA_SAVED_EVENT, onSaved);
    return () => {
      cancelled = true;
      window.removeEventListener(VISTA_SAVED_EVENT, onSaved);
    };
  }, [user?.id]);
  // Mondo Lavoro -> preferenze lavoro; tutti gli altri -> social (Incontri
  // ha le sue, vedi Profilo Incontri). Stessa forma dei vecchi filtri.
  const locationFilters = useMemo(
    () => (vista ? locationFiltersFrom(world.id === 'lavoro' ? vista.lavoro : vista.social) : EMPTY_LOCATION_FILTERS),
    [vista, world.id]
  );
  useEffect(() => localStorage.setItem('rb-arte-filter', JSON.stringify(arteFilter)), [arteFilter]);
  useEffect(() => localStorage.setItem('rb-visibility', JSON.stringify(visibility)), [visibility]);
  useEffect(() => {
    if (!eventActionError) return undefined;
    const timer = setTimeout(() => setEventActionError(''), 4000);
    return () => clearTimeout(timer);
  }, [eventActionError]);

  // Eventi del mondo Social: ricaricati ad ogni login/logout (la RLS decide
  // cosa si vede, in base a fascia d'età/blocchi), poi tenuti aggiornati in
  // tempo reale così un evento creato da un altro utente compare da solo.
  useEffect(() => {
    fetchEvents({ mondo: 'social' }).then(({ events: list }) => {
      if (list) setEvents(list);
    });
  }, [user?.id]);

  useEffect(() => {
    const channel = subscribeToNewEvents('social', () => {
      fetchEvents({ mondo: 'social' }).then(({ events: list }) => {
        if (list) setEvents(list);
      });
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Amicizie/richieste reali (Supabase): ricaricate ad ogni cambio utente
  // (login/logout), e su richiesta esplicita dopo un'azione da ContactsPanel
  // (inviata/accettata/rifiutata/rimossa un'amicizia).
  const refreshFriendsState = () => {
    if (!user) {
      setFriends([]);
      setFriendRequestsSent([]);
      setReceivedRequestsCount(0);
      setReceivedFamilyRequestsCount(0);
      return;
    }
    getFriends().then((list) => setFriends(list.map((f) => f.id)));
    getSentRequests().then((list) => setFriendRequestsSent(list.map((r) => r.toId)));
    getReceivedRequests().then((list) => setReceivedRequestsCount(list.length));
    getReceivedFamilyRequests().then((list) => setReceivedFamilyRequestsCount(list.length));
  };
  useEffect(refreshFriendsState, [user?.id]);

  // "Attività" di Incontri (online/attivo oggi/questa settimana): aggiorna
  // profiles.last_seen_at al login, ogni 2 minuti mentre la pagina è
  // visibile, e appena torna visibile (es. si cambia scheda e si torna).
  useEffect(() => {
    if (!user) return undefined;
    touchLastSeen();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') touchLastSeen();
    }, 120000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') touchLastSeen();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user?.id]);

  // Notifiche: conteggio iniziale ad ogni login/logout (il pannello se
  // aperto le segna lette da solo, vedi onRead), poi aggiornate in tempo
  // reale — un match/super like nuovo arriva come riga in "notifications"
  // (la crea un trigger lato DB), qui si fa solo un piccolo toast e si
  // risolve il nome/avatar di chi l'ha causata (la riga realtime non li ha).
  useEffect(() => {
    if (!user) {
      setUnreadNotifCount(0);
      return undefined;
    }
    getMyNotifications(30).then(({ notifications: list }) => {
      if (list) setUnreadNotifCount(list.filter((n) => !n.letta).length);
    });
    const channel = subscribeToOwnNotifications(user.id, (row) => {
      setUnreadNotifCount((c) => c + 1);
      fetchProfilesMap([row.actor_id]).then((map) => {
        const actor = map.get(row.actor_id) ?? { id: row.actor_id, name: 'Utente', avatar: '' };
        setNotifToast({
          tipo: row.tipo,
          actor,
          actorId: row.actor_id,
          riferimentoTipo: row.riferimento_tipo ?? null,
          riferimentoId: row.riferimento_id ?? null,
          riferimentoPadre: row.riferimento_padre ?? null,
          anteprima: row.anteprima ?? null,
        });
        window.setTimeout(() => setNotifToast(null), 4500);
      });
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Badge "non letti": ricaricati ad ogni login/logout, poi aggiornati in
  // tempo reale da un canale globale (RLS limita già ai messaggi delle
  // proprie conversazioni) così il totale sull'icona 👥 e i badge per amico
  // si aggiornano anche a chat chiusa.
  const refreshUnread = () => {
    if (!user) {
      setUnreadByConversation(new Map());
      return;
    }
    getUnreadCounts().then(setUnreadByConversation);
  };
  useEffect(refreshUnread, [user?.id]);

  // Spunte delle chat private: "consegnato" (✓✓ grigie) per chi scrive
  // quando i suoi messaggi arrivano qui — all'accesso, quando la scheda
  // torna visibile e a ogni messaggio in arrivo da altri
  // (mark_chats_delivered, al massimo una volta ogni 2 secondi, vedi
  // markChatsDelivered in data/directChat.js).
  useEffect(() => {
    if (!user) return undefined;
    markChatsDelivered();
    const channel = subscribeToOwnMessages((row) => {
      refreshUnread();
      if (row?.sender_id && row.sender_id !== user.id) markChatsDelivered();
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') markChatsDelivered();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setFavoriteCategories([]);
      return;
    }
    listMyFavoriteCategories().then(setFavoriteCategories);
  }, [user?.id]);

  const toggleFavoriteCategory = async ({ worldId, categoryId, categoryLabel }, currentlyFavorite) => {
    if (currentlyFavorite) {
      setFavoriteCategories((prev) => prev.filter((f) => !(f.worldId === worldId && f.categoryId === categoryId)));
      const { error } = await removeFavoriteCategory({ worldId, categoryId });
      if (error) listMyFavoriteCategories().then(setFavoriteCategories);
      return;
    }
    setFavoriteCategories((prev) => [...prev, { worldId, categoryId, categoryLabel }]);
    const { error } = await addFavoriteCategory({ worldId, categoryId, categoryLabel });
    if (error) listMyFavoriteCategories().then(setFavoriteCategories);
  };

  const totalUnreadMessages = useMemo(() => {
    let total = 0;
    for (const n of unreadByConversation.values()) total += n;
    return total;
  }, [unreadByConversation]);

  // Traccia la posizione reale del dispositivo solo mentre l'utente ha
  // attivato "Condividi la mia posizione in tempo reale" nelle Impostazioni:
  // il permesso al browser si chiede solo a quel momento, mai prima. Se lo
  // disattiva, si smette subito di osservare (clearWatch) e il marker
  // sparisce dal globo. Se il permesso viene negato, il toggle si rimette
  // da solo su spento.
  useEffect(() => {
    if (!user || !visibility.shareLiveLocation || !navigator.geolocation) {
      if (geoWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
      setOwnPosition(null);
      return undefined;
    }

    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setOwnPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        setOwnPosition(null);
        setVisibility((v) => ({ ...v, shareLiveLocation: false }));
      },
      { enableHighAccuracy: true, maximumAge: 10000 }
    );

    return () => {
      if (geoWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
    };
  }, [user, visibility.shareLiveLocation]);

  // Un evento sparisce (dal globo e dalla colonna) a fine giornata della sua
  // data, in automatico: ricalcolato ad ogni render invece che con un timer
  // che ticchetta, la granularità è "un giorno" quindi non serve altro.
  const visibleEvents = useMemo(() => events.filter((e) => !isEventExpired(e)), [events]);

  const createEvent = async ({ titolo, citta, lat, lng, data, ora, bio, fotoFile }) => {
    const { error } = await createEventApi({ titolo, citta, lat, lng, data, ora, bio, fotoFile, mondo: 'social' });
    if (error) return { error };
    const { events: list } = await fetchEvents({ mondo: 'social' });
    if (list) setEvents(list);
    return {};
  };

  const toggleEventLike = async (eventId, currentlyLiked) => {
    const { error } = await toggleEventLikeApi(eventId, currentlyLiked);
    if (error) {
      setEventActionError(error);
      return;
    }
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const myId = user.id;
        const mi_piace = currentlyLiked ? e.mi_piace.filter((id) => id !== myId) : [...e.mi_piace, myId];
        const likers = currentlyLiked
          ? e.likers.filter((l) => l.id !== myId)
          : [...e.likers, { id: myId, name: user.nickname ?? 'Tu', avatar: user.avatar ?? '' }];
        return { ...e, mi_piace, likers, likedByMe: !currentlyLiked };
      })
    );
  };

  const sendFriendRequest = async (userId) => {
    const { error } = await sendFriendRequestApi(userId);
    if (error) return { error };
    setFriendRequestsSent((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    return {};
  };

  // Utenti veri del mondo attivo sul globo (vedi data/globeUsers.js): si
  // ricaricano a ogni cambio di mondo o di account.
  const [dbWorldUsers, setDbWorldUsers] = useState({ worldId: null, users: [] });
  useEffect(() => {
    if (!user) {
      setDbWorldUsers({ worldId: null, users: [] });
      return undefined;
    }
    let cancelled = false;
    const worldId = world.id;
    fetchGlobeUsers(worldId).then((users) => {
      if (!cancelled) setDbWorldUsers({ worldId, users });
    });
    return () => {
      cancelled = true;
    };
  }, [world.id, user?.id, globeUsersVersion]);

  // Nessun filtro qui: zona, distanza ed età le applica già globe_users sul
  // server ("Chi vedo" del Profilo Social/Lavoro, Profilo Incontri).
  const worldUsers = useMemo(() => {
    const fromDb = dbWorldUsers.worldId === world.id ? dbWorldUsers.users : [];
    return [...usersForWorld(world.id), ...fromDb];
  }, [world.id, dbWorldUsers]);

  // Il proprio marker (quando si condivide la posizione in tempo reale) si
  // aggiunge SOPRA ai risultati già filtrati, non dentro: i propri filtri
  // (genere/età/posizione) servono a scoprire gli altri, non a nascondere
  // se stessi dal globo. Se però il mondo corrente non è tra quelli
  // abilitati dall'account (Impostazioni → Personalizza → Mondi), il
  // marker non deve comparire lì per nessuno: disattivare un mondo vuol
  // dire anche sparire da quel mondo agli occhi degli altri.
  const globeUsers = useMemo(() => {
    if (!user || !visibility.shareLiveLocation || !ownPosition) return worldUsers;
    if (!(user.mondiAbilitati ?? []).includes(world.id)) return worldUsers;
    // Con la posizione in tempo reale il proprio marker "di città" sparisce:
    // resta solo quello live.
    const others = worldUsers.filter((u) => u.id !== user.id);
    const ownMarker = {
      id: 'me-live',
      name: user.nickname ?? user.name ?? 'Io',
      avatar: user.avatar,
      city: 'La mia posizione',
      country: '',
      lat: ownPosition.lat,
      lng: ownPosition.lng,
      isLive: true,
    };
    return [...others, ownMarker];
  }, [worldUsers, user, visibility.shareLiveLocation, ownPosition]);

  // Quando la città cercata nei filtri (globali, validi per tutti i mondi) corrisponde
  // a una città nota, il globo ci "vola" sopra.
  // Solo quando l'utente CAMBIA la città: il valore salvato in localStorage
  // non deve far volare la camera all'avvio (la vista iniziale è sempre la
  // panoramica di tutti i mondi, vedi WorldGlobe startupPointOfView).
  const debouncedCityQuery = useDebouncedValue(locationFilters.city, 500);
  // (Confronto col valore iniziale, non un "primo giro": in sviluppo
  // StrictMode esegue gli effect due volte.)
  const startupCityRef = useRef(locationFilters.city);
  const cityChangedRef = useRef(false);
  useEffect(() => {
    if (debouncedCityQuery !== startupCityRef.current) cityChangedRef.current = true;
    if (!cityChangedRef.current) return;
    const match = findCityMatch(debouncedCityQuery);
    if (match) setFlyTo({ lat: match.lat, lng: match.lng, key: `city-${match.name}` });
  }, [debouncedCityQuery]);

  // Fa volare la camera sulla categoria e apre il pannello solo a volo
  // finito (stessa durata dell'animazione in WorldGlobe): prima si vede il
  // mondo girare e centrarsi, poi si aprono le colonne — un po' di
  // scenografia, invece del pannello che scatta subito mentre il globo si
  // muove ancora. Vale ovunque si scelga una categoria: pulsante in basso a
  // sinistra, triangolo sul globo, ricerca, scorciatoia da Impostazioni.
  // Se una chiusura in particelle (Fase 2d) era ancora in corso per la
  // categoria precedente, il suo timer va annullato prima di aprirne
  // un'altra: altrimenti scattando più tardi azzererebbe activeArteCategory
  // anche dopo che la nuova categoria l'ha già impostato.
  const cancelCategoryClosing = () => {
    if (closingTimerRef.current) {
      clearTimeout(closingTimerRef.current);
      closingTimerRef.current = null;
    }
    setClosingCategoryId(null);
  };

  const flyToCategoryThenOpen = (id, pos) => {
    if (pendingOpenRef.current) clearTimeout(pendingOpenRef.current);
    cancelCategoryClosing();
    setActiveArteCategory(null);
    // categoryId: WorldGlobe usa la posizione ATTUALE della stella (il globo
    // ruota), lat/lng restano solo come ripiego.
    setFlyTo({ lat: pos.lat, lng: pos.lng, categoryId: id, altitude: 1.3, key: `cat-${id}-${Date.now()}` });
    pendingOpenRef.current = setTimeout(() => {
      setActiveArteCategory(id);
      // Il volo finisce sempre con la camera centrata sulla categoria: la
      // sua etichetta 3D era quindi, un attimo prima, vicina al centro
      // dello schermo. Il titolo del pannello può "volare" da lì (Fase 2c,
      // vedi LabelMorphTitle) solo quando l'apertura arriva da un volo vero
      // e proprio, non dalle aperture istantanee qui sotto (pos assente).
      setCategoryOpenedViaFly(true);
      pendingOpenRef.current = null;
    }, CATEGORY_FLY_MS);
  };

  // Cercando una categoria nel mondo Arte & Musica, il globo vola sul suo triangolo.
  // Si usa la posizione reale del triangolo assegnato (non la "anchor" originale,
  // perché la categoria viene agganciata al triangolo più vicino, non a quel punto
  // esatto), così la camera centra davvero il triangolo e non finisce ai suoi bordi.
  const flyToArteCategory = (cat) => {
    setArteInitialSubfamily('');
    const pos = arteCategoryPositions[cat.id] ?? cat.anchor;
    if (pos) flyToCategoryThenOpen(cat.id, pos);
    else {
      cancelCategoryClosing();
      setActiveArteCategory(cat.id);
      setCategoryOpenedViaFly(false);
    }
  };

  // Naviga a una categoria di un mondo qualunque (usato dall'hub testuale
  // del mondo Social, e da applyArteFilter qui sotto): se serve cambia
  // mondo prima, poi vola sulla categoria e apre il pannello. Se il mondo
  // di destinazione non è quello attivo, l'apertura vera e propria si
  // rimanda a dopo il cambio mondo (vedi pendingCategoryNavRef sopra) — non
  // si può volare/aprire nello stesso giro perché arteCategoryPositions
  // appartiene ancora al mondo che si sta lasciando. Uscendo dal mondo
  // Social, SocialFeed si smonta da solo (è mostrato solo quando
  // world.id === 'social'): è così che "si chiudono le colonne".
  const navigateToCategory = (worldId, categoryId, initialSubfamily = '') => {
    if (accountBlocked && !(worldId === 'faq' && categoryId === 'info-ban')) return;
    const targetIndex = WORLDS.findIndex((w) => w.id === worldId);
    if (targetIndex === -1) return;
    // Stessi filtri per ruolo di categorySet: altrimenti una categoria
    // riservata (Stanza MOD, Cerca candidati) non si troverebbe qui anche
    // per chi la vede, e il proprietario vede sempre tutto.
    const worldCategories =
      worldId === 'lavoro'
        ? getLavoroCategories(canRecruit, user)
        : worldId === 'faq'
        ? getFaqCategories(isStaff(user?.ruolo), user)
        : CATEGORY_WORLDS[worldId]?.categories;
    const cat = worldCategories?.find((c) => c.id === categoryId);
    if (!cat) return;
    const sameWorld = targetIndex === index;

    const openCategory = () => {
      setArteInitialSubfamily(initialSubfamily);
      // Le posizioni reali dei triangoli (più precise dell'anchor) valgono
      // solo per il mondo già attivo: per un mondo appena raggiunto si usa
      // sempre l'anchor, che WorldGlobe affina non appena calcola i
      // triangoli del nuovo mondo.
      const pos = (sameWorld ? arteCategoryPositions[cat.id] : null) ?? cat.anchor;
      if (pos) flyToCategoryThenOpen(cat.id, pos);
      else {
        cancelCategoryClosing();
        setActiveArteCategory(cat.id);
        setCategoryOpenedViaFly(false);
      }
    };

    if (sameWorld) {
      openCategory();
    } else {
      pendingCategoryNavRef.current = openCategory;
      setIndex(targetIndex);
    }
  };

  // Click su una notifica (nel pannello o nel toast): apre Incontri sulla
  // scheda giusta — "A chi piaci" per un super like, "I tuoi match" per un
  // match nuovo.
  // Clic su una "@menzione" (MentionText): profilo della persona.
  useEffect(() => {
    const onOpenProfile = (e) => {
      openProfileInWorld(e.detail?.id);
    };
    // "Rispondi" a un messaggio della casella dello staff (Stanza MOD):
    // chat diretta con chi l'ha scritto.
    const onOpenChat = (e) => {
      if (!e.detail?.userId) return;
      setActiveFriendChatConvId(e.detail.conversationId ?? null);
      setActiveFriendChatId(e.detail.userId);
    };
    window.addEventListener('vm:open-profile', onOpenProfile);
    window.addEventListener('vm:open-chat', onOpenChat);
    const onOpenSettings = (e) => {
      // "Luogo" non è più nelle Impostazioni: zona e distanza stanno in
      // "Chi vedo" del Profilo Social (Il mio profilo).
      if (e.detail?.section === 'luogo') {
        setProfileSettingsSection('social');
        setProfileSettingsOpen(true);
        return;
      }
      setSettingsInitialSection(e.detail?.section ?? null);
      setSettingsOpen(true);
    };
    window.addEventListener('vm:open-settings', onOpenSettings);
    return () => {
      window.removeEventListener('vm:open-profile', onOpenProfile);
      window.removeEventListener('vm:open-chat', onOpenChat);
      window.removeEventListener('vm:open-settings', onOpenSettings);
    };
  }, []);

  // Link condiviso incollato con l'app già aperta: stesso percorso di quello
  // letto all'avvio.
  useEffect(() => {
    const onHash = () => {
      const link = parseDeepLink();
      if (link) setPendingLink(link);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Tutti i mondi tranne FAQ chiedono l'accesso: senza sessione il link
  // resta in attesa e si apre il modulo di accesso; dopo il login si apre.
  useEffect(() => {
    if (!pendingLink || !authReady) return;
    if (!user) {
      setAuthOpen(true);
      return;
    }
    // Account bloccato: i link condivisi non si aprono (solo INFO BAN).
    if (accountBlocked) {
      setPendingLink(null);
      clearDeepLinkHash();
      return;
    }
    const link = pendingLink;
    setPendingLink(null);
    clearDeepLinkHash();
    openDeepLink(link);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLink, authReady, user?.id]);

  const openDeepLink = async (link) => {
    const seq = Date.now();
    if (link.type === 'post') {
      setFocusPost({ postId: link.id, seq });
      navigateToCategory('social', 'world');
    } else if (link.type === 'profile') {
      const id = await profileIdByNickname(link.nickname);
      if (id) setMentionProfileId(id);
      else setLinkNotice(`Nessun profilo "${link.nickname}".`);
    } else if (link.type === 'listing') {
      const listing = await getListing(link.id);
      if (!listing) {
        setLinkNotice('Questo annuncio non esiste più o non è visibile.');
        return;
      }
      setAnnunciFocus({ listing, seq });
      navigateToCategory('annunci', listing.categoria);
    } else if (link.type === 'cosplayEvent') {
      setCosplayFocus({ eventId: link.id, seq });
      navigateToCategory('nerd', 'cosplay');
    }
  };

  // n: la notifica (oggetto), o solo il tipo per le chiamate vecchie.
  const openNotificationTarget = (n) => {
    if (accountBlocked) return;
    const notif = typeof n === 'string' ? { tipo: n } : n ?? {};
    const { tipo } = notif;
    setNotificationsOpen(false);
    setNotifToast(null);
    if (tipo === 'menzione') {
      // Post: il post stesso; commento: il suo post (riferimento_padre);
      // chat: la conversazione con chi ha scritto; stanza_mod: la Stanza MOD.
      if (notif.riferimentoTipo === 'post' || notif.riferimentoTipo === 'commento') {
        const postId = notif.riferimentoTipo === 'post' ? notif.riferimentoId : notif.riferimentoPadre;
        if (postId) setFocusPost({ postId, seq: Date.now() });
        navigateToCategory('social', 'world');
      } else if (notif.riferimentoTipo === 'chat') {
        const actorId = notif.actorId ?? notif.actor?.id;
        if (actorId) setActiveFriendChatId(actorId);
      } else if (notif.riferimentoTipo === 'stanza_mod') {
        navigateToCategory('faq', 'mod-room');
      }
      return;
    }
    if (tipo === 'lfg_join' || tipo === 'lfg_leave' || tipo === 'lfg_kick') {
      const lfgId = notif.riferimentoId ?? null;
      if (notif.riferimentoTipo === 'cosplay_lfg') {
        // Cerco gruppo (Cosplay): la scheda con l'annuncio evidenziato.
        setCosplayFocus(lfgId ? { lfgId, seq: Date.now() } : null);
        navigateToCategory('nerd', 'cosplay');
        return;
      }
      // Cerco compagni: la categoria giusta del mondo Nerd con l'annuncio
      // evidenziato. Se l'annuncio non è più leggibile (chiuso, espulso)
      // si apre comunque Gaming PC.
      fetchLfg(lfgId).then((lfg) => {
        setGamingFocus(lfgId ? { lfgId, seq: Date.now() } : null);
        navigateToCategory('nerd', lfg?.categoria ?? 'gaming-pc');
      });
      return;
    }
    if (tipo === 'posto_libero') {
      // Stanza video piena che si è liberata: la sua categoria, con la
      // stanza in evidenza nell'elenco (vedi VideoRoomsColumn).
      fetchVideoRoom(notif.riferimentoId).then((room) => {
        const target = room && !room.endedAt ? roomCategoryTarget(room.mondo, room.categoria) : null;
        if (!target) {
          setNotifToast(null);
          return;
        }
        setPendingRoomFocus(room.id);
        navigateToCategory(target.world, target.category);
      });
      return;
    }
    if (tipo === 'friend_request') {
      setDmHubInitialTab('contatti');
      setFriendsModalOpen(true);
      return;
    }
    if (tipo === 'family_request') {
      setProfileSettingsOpen(true);
      return;
    }
    if (tipo === 'new_post') {
      setIndex(DEFAULT_WORLD_INDEX);
      return;
    }
    setIncontriInitialTab(tipo === 'super_like' ? 'likesYou' : 'matches');
    navigateToCategory('incontri', 'match');
  };

  // Applica il filtro Categoria/Sottofamiglia scelto nelle Impostazioni: passa
  // al mondo Arte & Musica se serve, apre la categoria e pre-seleziona la
  // sottofamiglia scelta.
  const applyArteFilter = () => {
    if (!arteFilter.category) return;
    navigateToCategory('arte', arteFilter.category, arteFilter.subfamily);
  };

  // Selezionare una categoria (dal triangolo sul globo, o dal pulsante in
  // basso a sinistra) vola e zooma su di essa, aprendo il pannello a volo
  // finito; chiuderla (X, o ri-click sulla categoria già aperta) torna
  // subito alla vista larga.
  const toggleArteCategory = (id) => {
    if (accountBlocked && id && id !== 'info-ban') return;
    if (pendingOpenRef.current) {
      clearTimeout(pendingOpenRef.current);
      pendingOpenRef.current = null;
    }
    if (id === null || activeArteCategory === id) {
      if (!activeArteCategory) return;
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
      // Il pannello resta montato (stessa key) per tutta la dissolvenza:
      // solo alla fine si azzera davvero activeArteCategory, altrimenti
      // ArteExplorer lo smonterebbe di scatto a metà animazione.
      setClosingCategoryId(activeArteCategory);
      setCategoryOpenedViaFly(false);
      setFlyTo({ altitude: 2.4, key: `zoom-out-${Date.now()}` });
      closingTimerRef.current = setTimeout(() => {
        setActiveArteCategory(null);
        setClosingCategoryId(null);
        closingTimerRef.current = null;
      }, CATEGORY_CLOSE_MS);
      return;
    }
    setArteInitialSubfamily('');
    const cat = categorySet?.categories.find((c) => c.id === id);
    const pos = arteCategoryPositions[id] ?? cat?.anchor;
    if (pos) flyToCategoryThenOpen(id, pos);
    else {
      cancelCategoryClosing();
      setActiveArteCategory(id);
      setCategoryOpenedViaFly(false);
    }
  };

  // Tasto Indietro del telefono (vedi hooks/useBackLayer.js): pila di
  // livelli + avviso "Premi di nuovo Indietro per uscire". La categoria
  // aperta è il livello più esterno; sopra ci stanno le sottopagine delle
  // colonne, i pannelli a comparsa e i visori a schermo intero, ognuno
  // registrato dal proprio componente.
  const exitToastVisible = useBackNavigationRoot();

  // Mondo precedente, per uscire dal mondo "Work in progress" (niente
  // categorie da chiudere: la ✕ del suo pannello e il tasto Indietro
  // riportano dove si era prima, Social se non c'è un mondo precedente).
  const lastWorldIndexRef = useRef(index);
  const previousWorldIndexRef = useRef(DEFAULT_WORLD_INDEX);
  useEffect(() => {
    if (lastWorldIndexRef.current === index) return;
    previousWorldIndexRef.current = lastWorldIndexRef.current;
    lastWorldIndexRef.current = index;
  }, [index]);
  const leaveWipWorld = () => {
    const prev = previousWorldIndexRef.current;
    setIndex(WORLDS[prev] && WORLDS[prev].id !== 'wip' ? prev : DEFAULT_WORLD_INDEX);
  };
  useBackLayer(world.id === 'wip', leaveWipWorld, 'world:wip');
  useBackLayer(Boolean(activeArteCategory) && !closingCategoryId, () => toggleArteCategory(activeArteCategory), 'world:category');
  // Colonna/categoria aperta sopra al mappamondo: il globo scende a ~10 fps.
  useGlobeCover(activeArteCategory ? 'covered' : null);

  // Priorità dei gate sul mondo corrente: prima serve un account, poi (solo
  // su Incontri/Lavoro) serve essere maggiorenni, solo dopo conta se
  // l'utente ha scelto di disattivare questo mondo dalle Impostazioni.
  // Il mondo FAQ (Informazioni, Termini e Privacy, Segnalazioni) si apre
  // anche senza account: è il posto dove chi non è registrato capisce cos'è
  // Versemove e legge l'informativa (il banner dei cookie rimanda lì).
  const needsAuthForWorld = !user && world.id !== 'faq';
  const ageBlockedForWorld = isAgeGatedWorld && !needsAuthForWorld && !isAdult(user?.dataNascita);
  // FAQ resta sempre attivo (è il posto dove si chiede aiuto): non lo si
  // può disattivare dalle Impostazioni -> Mondi, mai bloccato qui. Work in
  // progress invece ora si attiva/disattiva come gli altri mondi.
  const worldDisabledByUser =
    world.id !== 'faq' &&
    !needsAuthForWorld &&
    !ageBlockedForWorld &&
    !(user.mondiAbilitati ?? []).includes(world.id);

  // L'avviso Incontri non compare mai sopra una scheda, un pannello o una
  // finestra aperti: aspetta che siano chiusi. Appena compare davvero si
  // avvisa il server (segna_avviso_incontri), che non lo ripropone per 14
  // giorni.
  const somethingOpen = Boolean(
    authOpen ||
      settingsOpen ||
      profileSettingsOpen ||
      profileOnboardingOpen ||
      passwordRecoveryOpen ||
      adminOpen ||
      notificationsOpen ||
      favoritesOpen ||
      friendsModalOpen ||
      datingCardId ||
      mentionProfileId ||
      selectedUser ||
      activeFriendChatId ||
      activeArteCategory ||
      document.querySelector('.rb-modal-overlay')
  );
  const incontriNoticeVisible = Boolean(incontriNotice) && !somethingOpen;
  const incontriNoticeMarkedRef = useRef(null);
  useEffect(() => {
    if (!incontriNoticeVisible || incontriNoticeMarkedRef.current === incontriNotice) return;
    incontriNoticeMarkedRef.current = incontriNotice;
    segnaAvvisoIncontri();
  }, [incontriNoticeVisible, incontriNotice]);

  // Account bloccato: sempre nel mondo FAQ, e INFO BAN si apre da sola una
  // volta (poi si può chiudere e riaprire dalla sua nuvola o dalla lista).
  const blockedAutoOpenRef = useRef(false);
  useEffect(() => {
    if (!accountBlocked) {
      blockedAutoOpenRef.current = false;
      return;
    }
    if (world.id !== 'faq') {
      if (activeArteCategory) setActiveArteCategory(null);
      setIndex(WORLDS.findIndex((w) => w.id === 'faq'));
      return;
    }
    if (!blockedAutoOpenRef.current && activeArteCategory !== 'info-ban') {
      blockedAutoOpenRef.current = true;
      navigateToCategory('faq', 'info-ban');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountBlocked, world.id]);

  // Account sospeso o in eliminazione: al posto dell'app una schermata per
  // riattivarlo (riattiva_account) o uscire. Stesso momento del controllo
  // del ban (account caricato all'avvio o all'accesso), ma senza
  // disconnettere.
  const pause = accountPause(user);
  if (pause) {
    const quando = new Date(pause.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    return (
      <div className="rb-adult-gate-overlay">
        <div className="rb-adult-gate-card">
          <h2>{pause.tipo === 'sospeso' ? 'Account sospeso' : 'Account in eliminazione'}</h2>
          <p>
            {pause.tipo === 'sospeso'
              ? `Il tuo account è sospeso fino al ${quando}. Finché è sospeso il tuo profilo non è visibile agli altri.`
              : `Il tuo account verrà eliminato il ${quando}. Fino ad allora puoi ancora ripensarci.`}
          </p>
          {pauseError && <p className="rb-privacy-error">{pauseError}</p>}
          <div className="rb-adult-gate-actions">
            <button
              type="button"
              className="rb-adult-gate-decline"
              onClick={async () => {
                await logoutAccount();
                setUser(null);
              }}
            >
              Esci
            </button>
            <button
              type="button"
              className="rb-adult-gate-confirm"
              disabled={pauseBusy}
              onClick={async () => {
                setPauseBusy(true);
                setPauseError('');
                const res = await reactivateOwnAccount();
                if (res.error) {
                  setPauseError(res.error);
                  setPauseBusy(false);
                  return;
                }
                const account = await getCurrentAccount();
                setPauseBusy(false);
                if (account) setUser(account);
              }}
            >
              {pauseBusy ? 'Un attimo…' : 'Riattiva il mio account'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    // Chiamate che restano attive cambiando mondo o pagina (stanze video,
    // Stanza MOD, 1:1 dalla chat): vedi calls/CallProvider.jsx.
    <CallProvider user={user}>
    <div className="rb-app" style={{ '--accent': world.color }}>
      <TopBar
        world={world}
        user={user}
        blocked={accountBlocked}
        onOpenAuth={() => setAuthOpen(true)}
        onLogout={() => {
          logoutAccount();
          setUser(null);
        }}
        onOpenSettings={() => {
          if (activeArteCategory) toggleArteCategory(activeArteCategory);
          setSettingsOpen(true);
        }}
        onOpenAdmin={() => setAdminOpen(true)}
        onOpenProfile={() => setProfileSettingsOpen(true)}
        onOpenFriends={() => {
          setDmHubInitialTab('messaggi');
          setFriendsModalOpen(true);
        }}
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenFavorites={() => setFavoritesOpen(true)}
        unreadMessagesCount={totalUnreadMessages}
        unreadNotifCount={unreadNotifCount + receivedRequestsCount + receivedFamilyRequestsCount}
      />

      {accountBlocked && (
        <div className="rb-blocked-banner" role="status">
          <strong>⛔ Account bloccato</strong>
          {user?.banMotivo && <span>Motivo: {user.banMotivo}</span>}
          <span>
            {user?.banFinoAl
              ? `Fino al ${new Date(user.banFinoAl).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' })}`
              : 'Senza una data di fine'}
          </span>
          <span className="rb-blocked-banner-hint">Puoi scrivere allo staff in FAQ › INFO BAN.</span>
        </div>
      )}

      {justConfirmedEmail && (
        <div className="rb-email-confirmed-banner">✅ Mail confermata, bentornato su Versemove!</div>
      )}

      {signupNotice && (
        <div className="rb-email-confirmed-banner rb-app-banner-warning">⚠️ {signupNotice}</div>
      )}

      {accountDeletedNotice && (
        <div className="rb-email-confirmed-banner">✅ {accountDeletedNotice}</div>
      )}

      {eventActionError && (
        <div className="rb-email-confirmed-banner rb-app-banner-warning">⚠️ {eventActionError}</div>
      )}

      {!authReady && (
        <div className="rb-auth-loading-indicator" aria-live="polite">
          <span className="rb-auth-loading-spinner" />
          Caricamento...
        </div>
      )}

      <Suspense fallback={<PageLoading />}>
        <WorldGlobe
          world={world}
          users={globeUsers}
          // Utenti veri: il profilo Social completo (post, Segui...), lo
          // stesso delle @menzioni; il vecchio ProfileModal resta per gli altri.
          onSelectUser={(u) => {
            if (accountBlocked) return;
            if (u?.fromDb && world.id === 'lavoro' && canRecruit && u.id !== user?.id) {
              setCandidatoPreview({ id: u.id, nome: u.name, cognome: '', avatar: u.avatar, citta: u.city });
              return;
            }
            if (u?.fromDb) openProfileInWorld(u.id);
            else setSelectedUser(u);
          }}
          containerRef={containerRef}
          flyTo={flyTo}
          categories={categorySet?.categories ?? null}
          activeCategory={activeArteCategory}
          onCategorySelect={toggleArteCategory}
          onCategoryPositionsReady={setArteCategoryPositions}
          events={world.id === 'social' ? visibleEvents : []}
          onSelectEvent={(eventId) => {
            setFocusEvent({ eventId, seq: Date.now() });
            navigateToCategory('social', 'world');
          }}
          warpRequest={warpRequest}
          disabledWorlds={globeDisabledWorlds}
          onDisabledWorldClick={user && !accountBlocked ? setDisabledWorldPopover : undefined}
          // Account bloccato: senza onWarpArrived i satelliti non portano in
          // un altro mondo (WorldGlobe non avvia il volo).
          onWarpArrived={
            accountBlocked
              ? undefined
              : (worldId) => {
                  const i = WORLDS.findIndex((w) => w.id === worldId);
                  if (i !== -1) setIndex(i);
                  setWarpRequest(null);
                }
          }
        />
      </Suspense>

      {categorySet && world.id !== 'bambini' && world.id !== 'incontri' && world.id !== 'social' && world.id !== 'lavoro' && world.id !== 'faq' && world.id !== 'annunci' && world.id !== 'animali' && (
        <Suspense fallback={<PageLoading />}>
          <ArteExplorer
            world={world}
            categorySet={categorySet}
            activeCategory={activeArteCategory}
            onToggleCategory={toggleArteCategory}
            onSearchCategory={flyToArteCategory}
            initialSubfamily={arteInitialSubfamily}
            locationFilters={locationFilters}
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            favorites={favoriteCategories}
            onToggleFavorite={toggleFavoriteCategory}
            onShowReactors={setCulturalReactorsView}
            morphTitleFromCenter={categoryOpenedViaFly}
            isClosing={closingCategoryId !== null}
            gamingFocus={gamingFocus}
            cosplayFocus={cosplayFocus}
          />
        </Suspense>
      )}

      {world.id === 'bambini' && (
        <Suspense fallback={<PageLoading />}>
          <BambiniGameExplorer
            world={world}
            activeCategory={activeArteCategory}
            onToggleCategory={toggleArteCategory}
            onSearchCategory={flyToArteCategory}
            onGameOpenChange={setGameplayActive}
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            favorites={favoriteCategories}
            onToggleFavorite={toggleFavoriteCategory}
          />
        </Suspense>
      )}

      {world.id === 'incontri' && isAdult(user?.dataNascita) && (
        <Suspense fallback={<PageLoading />}>
          <IncontriLiveExplorer
            world={world}
            activeCategory={activeArteCategory}
            onToggleCategory={toggleArteCategory}
            onSearchCategory={flyToArteCategory}
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            onOpenChat={(otherId) => setActiveFriendChatId(otherId)}
            onOpenProfile={(id) => setDatingCardId(id)}
            onOpenMyDatingProfile={() => {
              setProfileSettingsSection('incontri');
              setProfileSettingsOpen(true);
            }}
            myDatingProfileVersion={incontriCheck}
            initialMatchTab={incontriInitialTab}
            onConsumeInitialMatchTab={() => setIncontriInitialTab(null)}
            favorites={favoriteCategories}
            onToggleFavorite={toggleFavoriteCategory}
          />
        </Suspense>
      )}

      {world.id === 'lavoro' && isAdult(user?.dataNascita) && lavoroConsent === true && (
        <Suspense fallback={<PageLoading />}>
          <LavoroWorldExplorer
            world={world}
            activeCategory={activeArteCategory}
            onToggleCategory={toggleArteCategory}
            onSearchCategory={flyToArteCategory}
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            favorites={favoriteCategories}
            onToggleFavorite={toggleFavoriteCategory}
            onNoAccess={() => setLavoroConsentState(false)}
          />
        </Suspense>
      )}

      {world.id === 'lavoro' && !authOpen && isAdult(user?.dataNascita) && lavoroConsent === false && (
        <Suspense fallback={<PageLoading />}>
          <LavoroConsentGate
            world={world}
            onConsented={() => setLavoroConsentState(true)}
            onDecline={() => setIndex(DEFAULT_WORLD_INDEX)}
          />
        </Suspense>
      )}

      {world.id === 'faq' && (
        <Suspense fallback={<PageLoading />}>
          <FaqWorldExplorer
            world={world}
            isClosing={closingCategoryId !== null}
            activeCategory={activeArteCategory}
            onToggleCategory={toggleArteCategory}
            onSearchCategory={flyToArteCategory}
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            favorites={favoriteCategories}
            onToggleFavorite={toggleFavoriteCategory}
          />
        </Suspense>
      )}

      {world.id === 'annunci' && (
        <Suspense fallback={<PageLoading />}>
          <AnnunciWorldExplorer
            world={world}
            isClosing={closingCategoryId !== null}
            activeCategory={activeArteCategory}
            onToggleCategory={toggleArteCategory}
            onSearchCategory={flyToArteCategory}
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            onOpenChat={(otherId) => setActiveFriendChatId(otherId)}
            favorites={favoriteCategories}
            onToggleFavorite={toggleFavoriteCategory}
            focusListing={annunciFocus}
          />
        </Suspense>
      )}

      {world.id === 'animali' && (
        <Suspense fallback={<PageLoading />}>
          <AnimaliWorldExplorer
            world={world}
            activeCategory={activeArteCategory}
            onToggleCategory={toggleArteCategory}
            onSearchCategory={flyToArteCategory}
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            favorites={favoriteCategories}
            onToggleFavorite={toggleFavoriteCategory}
          />
        </Suspense>
      )}

      {world.id === 'wip' && (
        <Suspense fallback={<PageLoading />}>
          <WipWorldExplorer world={world} onClose={leaveWipWorld} />
        </Suspense>
      )}

      {world.id === 'social' && (
        <Suspense fallback={<PageLoading />}>
          <SocialWorldExplorer
            world={world}
            activeCategory={activeArteCategory}
            favorites={favoriteCategories}
            onToggleFavorite={toggleFavoriteCategory}
            onToggleCategory={toggleArteCategory}
            onSearchCategory={flyToArteCategory}
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            locationFilters={locationFilters}
            onNavigateToCategory={navigateToCategory}
            events={visibleEvents}
            onCreateEvent={createEvent}
            onToggleEventLike={toggleEventLike}
            onOpenEventLikers={(eventId) => setEventLikersId(eventId)}
            focusPost={focusPost}
            focusEvent={focusEvent}
          />
        </Suspense>
      )}

      {/* Ogni mondo richiede un account per essere esplorato: su Incontri e
          Lavoro si aggiunge anche il controllo dei 18 anni. Nascosto mentre
          AuthModal è aperto (authOpen) — prima restava sopra il modulo
          (z-index più alto) rendendolo inutilizzabile: sembrava che il
          modulo "non si aprisse", e l'unica cosa cliccabile rimaneva
          "Torna indietro", che riportava al mondo Blu. */}
      {authReady && !authOpen && !profileSettingsOpen && !passwordRecoveryOpen && (needsAuthForWorld || ageBlockedForWorld || worldDisabledByUser) && (
        <AccessGate
          world={world}
          user={user}
          requireAdult={isAgeGatedWorld}
          disabledByUser={worldDisabledByUser}
          onOpenAuth={() => setAuthOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onDecline={() => setIndex(DEFAULT_WORLD_INDEX)}
        />
      )}

      <div
        className={`rb-world-tagline ${categorySet ? 'rb-world-tagline-list' : ''} ${
          activeArteCategory ? 'rb-world-tagline-behind' : ''
        }`}
      >
        {categorySet ? (
          <>
            {categorySet.categories.length > CATEGORY_LIST_PAGE_SIZE && (
              <button
                type="button"
                className="rb-tagline-scroll-btn"
                aria-label={t('common.nextCategoriesPage')}
                onClick={() => {
                  const totalPages = Math.ceil(categorySet.categories.length / CATEGORY_LIST_PAGE_SIZE);
                  setCategoryPage((p) => (p + 1) % totalPages);
                }}
              >
                ‹
              </button>
            )}
            <div className="rb-tagline-cat-list">
              {categorySet.categories
                .slice(categoryPage * CATEGORY_LIST_PAGE_SIZE, categoryPage * CATEGORY_LIST_PAGE_SIZE + CATEGORY_LIST_PAGE_SIZE)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`rb-tagline-cat-btn ${activeArteCategory === c.id ? 'active' : ''}`}
                    onClick={() => toggleArteCategory(c.id)}
                  >
                    {translateCategoryLabel(t, world.id, c)}
                  </button>
                ))}
              {/* Azienda non ancora verificata: al posto di "Cerca candidati"
                  l'invito a verificarsi (Il mio profilo → Verifica azienda). */}
              {world.id === 'lavoro' && user?.tipoAccount === 'azienda' && !canRecruit && (
                <button type="button" className="rb-tagline-cat-btn rb-tagline-cat-btn--invite" onClick={() => setProfileSettingsOpen(true)}>
                  🔎 Verifica l'azienda per cercare candidati
                </button>
              )}
            </div>
          </>
        ) : (
          translateWorld(t, world).tagline
        )}
      </div>

      <WorldSelectorColumn
        worlds={WORLDS}
        activeWorldId={world.id}
        disabled={accountBlocked}
        onSelectWorld={(worldId) => {
          if (!accountBlocked) setWarpRequest({ worldId, ts: Date.now() });
        }}
      />

      {settingsOpen && (
        <Suspense fallback={<PageLoading />}>
          <SettingsPanel
            open={settingsOpen}
            initialSection={settingsInitialSection}
            onClose={() => {
              setSettingsOpen(false);
              setSettingsInitialSection(null);
            }}
            onApply={() => {
              applyArteFilter();
              setSettingsOpen(false);
            }}
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            onUpdateUser={(account) => setUser({ ...account, name: account.nickname })}
            visibility={visibility}
            setVisibility={setVisibility}
            onResetFilters={() => {
              setArteFilter(DEFAULT_ARTE_FILTER);
              setVisibility(DEFAULT_VISIBILITY);
            }}
            friends={friends}
            onUnfriend={(id) => {
              removeFriendApi(id);
              setFriends((prev) => prev.filter((f) => f !== id));
            }}
            onAccountDeleted={(message) => {
              setUser(null);
              setAuthOpen(false);
              setSettingsOpen(false);
              setAdminOpen(false);
              setProfileSettingsOpen(false);
              setFriendsModalOpen(false);
              setActiveFriendChatId(null);
              setEventLikersId(null);
              setSelectedUser(null);
              setAccountDeletedNotice(message || 'Account eliminato.');
            }}
            onLavoroConsentRevoked={() => {
              setLavoroConsentState(false);
              if (world.id === 'lavoro') setIndex(DEFAULT_WORLD_INDEX);
            }}
          />
        </Suspense>
      )}

      {friendsModalOpen && (
        <Suspense fallback={<PageLoading />}>
          <DMHub
            initialTab={dmHubInitialTab}
            onClose={() => setFriendsModalOpen(false)}
            onOpenChat={(friendId) => {
              setFriendsModalOpen(false);
              setActiveFriendChatId(friendId);
            }}
            onFriendsChanged={refreshFriendsState}
          />
        </Suspense>
      )}

      {favoritesOpen && user && (
        <Suspense fallback={<PageLoading />}>
          <FavoritesPanel
            favorites={favoriteCategories}
            user={user}
            onClose={() => setFavoritesOpen(false)}
            onOpenCategory={(f) => {
              setFavoritesOpen(false);
              navigateToCategory(f.worldId, f.categoryId);
            }}
            onRemove={(f) => toggleFavoriteCategory(f, true)}
          />
        </Suspense>
      )}

      {notificationsOpen && (
        <Suspense fallback={<PageLoading />}>
          <NotificationsPanel
            onClose={() => setNotificationsOpen(false)}
            onRead={() => setUnreadNotifCount(0)}
            onNavigate={openNotificationTarget}
          />
        </Suspense>
      )}

      {disabledWorldPopover && user && (
        <DisabledWorldPopover
          {...disabledWorldPopover}
          user={user}
          onClose={closeDisabledWorldPopover}
          onUpdateUser={(account) => setUser({ ...account, name: account.nickname })}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {exitToastVisible && (
        <div className="rb-back-exit-toast" role="status">
          Premi di nuovo Indietro per uscire
        </div>
      )}

      {linkNotice && (
        <div className="rb-notif-toast rb-link-notice" role="status" onClick={() => setLinkNotice('')}>
          {linkNotice}
        </div>
      )}

      {notifToast && (
        <button type="button" className="rb-notif-toast" onClick={() => openNotificationTarget(notifToast)}>
          <AvatarImg src={notifToast.actor.avatar} name={notifToast.actor?.name || notifToast.actor?.nickname} seed={notifToast.actor?.id} alt="" />
          {(() => {
            const { who, text } = describeNotification(notifToast);
            return who ? `${who} ${text}` : text;
          })()}
        </button>
      )}

      {candidatoPreview && (
        <Suspense fallback={<PageLoading />}>
          <CandidatoModal candidato={candidatoPreview} onClose={() => setCandidatoPreview(null)} />
        </Suspense>
      )}

      {selectedUser && (
        <Suspense fallback={<PageLoading />}>
          <ProfileModal
            user={selectedUser}
            world={world}
            onClose={() => setSelectedUser(null)}
            viewer={user}
            onOpenAuth={() => setAuthOpen(true)}
          />
        </Suspense>
      )}

      {eventLikersId && (
        <Suspense fallback={<PageLoading />}>
          <EventLikersModal
            event={visibleEvents.find((e) => e.id === eventLikersId) ?? null}
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            friends={friends}
            friendRequestsSent={friendRequestsSent}
            onSendRequest={sendFriendRequest}
            onOpenChat={(friendId) => {
              setEventLikersId(null);
              setActiveFriendChatId(friendId);
            }}
            onClose={() => setEventLikersId(null)}
          />
        </Suspense>
      )}

      {culturalReactorsView && (
        <Suspense fallback={<PageLoading />}>
          <ReactorsModal
            title={culturalReactorsView.title}
            subtitle={culturalReactorsView.subtitle}
            reactors={culturalReactorsView.reactors}
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            friends={friends}
            friendRequestsSent={friendRequestsSent}
            onSendRequest={sendFriendRequest}
            onOpenChat={(friendId) => {
              setCulturalReactorsView(null);
              setActiveFriendChatId(friendId);
            }}
            onClose={() => setCulturalReactorsView(null)}
          />
        </Suspense>
      )}

      {activeFriendChatId && (
        <Suspense fallback={<PageLoading />}>
          <FriendChatModal
            friendId={activeFriendChatId}
            initialConversationId={activeFriendChatConvId}
            user={user}
            world={world}
            onClose={() => {
              setActiveFriendChatId(null);
              setActiveFriendChatConvId(null);
              setAnswerCallFrom(null);
            }}
            onMessagesRead={refreshUnread}
            autoAnswerCall={answerCallFrom === activeFriendChatId}
          />
        </Suspense>
      )}

      {/* Dopo la chat: il profilo aperto dall'avatar di un contatto deve
          stare sopra la finestra della chat (stesso z-index, vince l'ordine). */}
      {datingCardId && (
        <Suspense fallback={<PageLoading />}>
          <DatingCardModal
            userId={datingCardId}
            viewer={user}
            onClose={() => setDatingCardId(null)}
            onOpenChat={(id) => {
              setDatingCardId(null);
              setActiveFriendChatId(id);
            }}
          />
        </Suspense>
      )}

      {mentionProfileId && (
        <Suspense fallback={<PageLoading />}>
          <MentionProfileViewer
            userId={mentionProfileId}
            user={user}
            onOpenAuth={() => setAuthOpen(true)}
            onClose={() => setMentionProfileId(null)}
          />
        </Suspense>
      )}

      <UpdateToast />

      {user && (
        <Suspense fallback={null}>
          <IncomingCallToast
            user={user}
            openChatWith={activeFriendChatId}
            onAnswer={(callerId) => {
              setAnswerCallFrom(callerId);
              setActiveFriendChatId(callerId);
            }}
          />
        </Suspense>
      )}

      {adminOpen && (
        <Suspense fallback={<PageLoading />}>
          <AdminPanel user={user} onClose={() => setAdminOpen(false)} />
        </Suspense>
      )}

      {profileSettingsOpen && (
        <Suspense fallback={<PageLoading />}>
          <ProfileSettingsPanel
            open={profileSettingsOpen}
            onClose={() => {
              setProfileSettingsOpen(false);
              setProfileSettingsSection(null);
              setIncontriCheck((n) => n + 1);
            }}
            initialSection={profileSettingsSection}
            user={user}
            onUpdateUser={(account) => setUser({ ...account, name: account.nickname })}
          />
        </Suspense>
      )}

      {profileOnboardingOpen && user && (
        <Suspense fallback={<PageLoading />}>
          <ProfileSettingsPanel
            open
            variant="onboarding"
            user={user}
            onUpdateUser={(account) => setUser({ ...account, name: account.nickname })}
            onClose={() => {
              clearProfileOnboarding();
              setProfileOnboardingOpen(false);
              setIncontriNoticeAfterOnboarding(true);
            }}
          />
        </Suspense>
      )}

      {incontriNoticeVisible && (
        <div className="rb-incontri-notice" role="status">
          <span>{incontriNoticeText(incontriNotice.avviso, incontriNotice.mancano, incontriNotice.foto)}</span>
          <div className="rb-incontri-notice-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setIncontriNotice(null);
                setIncontriNoticeAfterOnboarding(false);
              }}
            >
              Più tardi
            </button>
            <button
              type="button"
              onClick={() => {
                setIncontriNotice(null);
                setIncontriNoticeAfterOnboarding(false);
                setProfileSettingsSection('incontri');
                setProfileSettingsOpen(true);
              }}
            >
              Apri il Profilo Incontri
            </button>
          </div>
        </div>
      )}

      {authOpen && (
        <Suspense fallback={<PageLoading />}>
          <AuthModal
            open={authReady && authOpen}
            onClose={() => setAuthOpen(false)}
            onLogin={(u, notice) => {
              setUser(u);
              setAuthOpen(false);
              if (notice) setSignupNotice(notice);
            }}
          />
        </Suspense>
      )}

      {passwordRecoveryOpen && (
        <Suspense fallback={<PageLoading />}>
          <PasswordRecoveryModal open={passwordRecoveryOpen} onClose={() => setPasswordRecoveryOpen(false)} />
        </Suspense>
      )}

      <CookieConsentBanner user={user} onOpenPrivacyInfo={() => navigateToCategory('faq', 'informazioni')} />
    </div>
    </CallProvider>
  );
}
