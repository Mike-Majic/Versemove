import { useEffect, useMemo, useRef, useState } from 'react';
import TwoColumnSwitcher from '../layout/TwoColumnSwitcher';
import ModalOverlay from '../ModalOverlay';
import EmptyState from '../EmptyState';
import { isAdult } from '../../data/age';
import { fetchProfilesMap } from '../../data/posts';
import { supabase } from '../../data/supabaseClient';
import {
  getMatchCandidates,
  recordSwipe,
  getLikesReceived,
  getMyMatches,
  getMyFavorites,
  unmatch as unmatchApi,
  addFavorite,
  removeFavorite,
  subscribeToOwnMatches,
} from '../../data/incontri';
import './MatchColumn.css';

const RIGHT_TABS = [
  { id: 'likesYou', label: 'A chi piaci' },
  { id: 'matches', label: 'I tuoi match' },
  { id: 'messages', label: 'Messaggi' },
  { id: 'favorites', label: 'Preferiti' },
];

// Attività di un profilo (da profiles.last_seen_at via le RPC di Incontri):
// un pallino verde per "online" davvero adesso, altrimenti solo testo — o
// niente se non si sa/è passato troppo tempo.
function ActivityBadge({ attivita }) {
  if (!attivita) return null;
  if (attivita === 'online') {
    return (
      <span className="rb-match-activity online">
        <span className="rb-match-activity-dot" /> Online
      </span>
    );
  }
  const label = attivita === 'oggi' ? 'Attivo oggi' : 'Attivo questa settimana';
  return <span className="rb-match-activity">{label}</span>;
}

// Swipe (stile Tinder) su dati reali: mazzo da get_match_candidates,
// mi piace/passa via record_swipe (un match nasce solo se reciproco, mai
// subito come nella vecchia demo locale). "Messaggi" apre la chat diretta
// reale già usata per gli amici (FriendChatModal, via onOpenChat), non ha
// una sua chat: un match è comunque solo una conversazione come le altre.
export default function MatchColumn({ user, onOpenAuth, onOpenChat, initialTab, onConsumeInitialTab, matchFilters }) {
  const [deck, setDeck] = useState([]);
  const [deckLoading, setDeckLoading] = useState(true);
  const [swiping, setSwiping] = useState(null); // { direction: 'left'|'right' }

  const [likesYou, setLikesYou] = useState([]);
  const [likesYouLoading, setLikesYouLoading] = useState(true);

  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(true);

  const [favorites, setFavorites] = useState([]);
  const [favoritesLoading, setFavoritesLoading] = useState(true);

  const [matchToast, setMatchToast] = useState(null);
  const [pendingUnmatch, setPendingUnmatch] = useState(null);
  const [actionError, setActionError] = useState('');
  // Il giro ricomincia (get_match_candidates, vedi data/incontri.js): quando
  // arriva il primo profilo già visto (gia_visto=true, un "passo" di prima
  // ripresentato), si mostra un avviso una sola volta per apertura, non ad
  // ogni profilo del genere — "shown" resta true anche dopo la chiusura,
  // così non ricompare da solo; "visible" è solo se mostrarlo adesso.
  const [giaVistoBannerShown, setGiaVistoBannerShown] = useState(false);
  const [giaVistoBannerVisible, setGiaVistoBannerVisible] = useState(false);
  const [mobileView, setMobileView] = useState(initialTab ? 'secondary' : 'primary');
  const [rightTab, setRightTab] = useState(initialTab ?? 'matches');

  // La scheda iniziale (arrivando da una notifica) va usata solo per il
  // primo render di questo componente: appena consumata, si avvisa App.jsx
  // di azzerarla, altrimenti la prossima volta che si apre Match "a mano"
  // (dal globo) si ritroverebbe ancora la scheda della notifica di prima.
  useEffect(() => {
    if (initialTab) onConsumeInitialTab?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Evita il doppio toast quando il match che ho appena creato con il mio
  // swipe torna anche dal canale realtime (sono uno dei due partecipanti).
  const justMatchedIds = useRef(new Set());

  // Le vecchie chiavi locali (decisioni finte, match finti, chat finta,
  // preferiti finti) non servono più: rimosse una volta per tutte dal
  // browser di chi ha già usato la versione precedente.
  useEffect(() => {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('rb-match-'))
      .forEach((key) => localStorage.removeItem(key));
  }, []);

  // Le stesse regole di is_incontri_eligible lato server (mondo "incontri"
  // abilitato + 18 anni): il globo/AccessGate impedisce già di arrivare qui
  // se manca l'età, ma non se il mondo è stato disattivato dalle
  // Impostazioni mentre questa colonna resta montata sotto l'overlay.
  const eligible = Boolean(user) && (user.mondiAbilitati ?? []).includes('incontri') && isAdult(user.dataNascita);

  const triggerMatchToast = (profile) => {
    setMatchToast(profile);
    window.setTimeout(() => setMatchToast(null), 2200);
  };

  const refreshMatches = async () => {
    const { matches: list, error } = await getMyMatches();
    if (!error) setMatches(list ?? []);
  };

  useEffect(() => {
    if (!eligible) {
      setDeck([]);
      setDeckLoading(false);
      setLikesYou([]);
      setLikesYouLoading(false);
      setMatches([]);
      setMatchesLoading(false);
      setFavorites([]);
      setFavoritesLoading(false);
      return undefined;
    }
    let cancelled = false;
    setDeckLoading(true);
    setLikesYouLoading(true);
    setMatchesLoading(true);
    setFavoritesLoading(true);
    setGiaVistoBannerShown(false);
    setGiaVistoBannerVisible(false);
    Promise.all([getMatchCandidates(20, matchFilters), getLikesReceived(), getMyMatches(), getMyFavorites()]).then(
      ([deckRes, likesRes, matchesRes, favRes]) => {
        if (cancelled) return;
        setDeck(deckRes.candidates ?? []);
        setDeckLoading(false);
        setLikesYou(likesRes.likes ?? []);
        setLikesYouLoading(false);
        setMatches(matchesRes.matches ?? []);
        setMatchesLoading(false);
        setFavorites(favRes.favorites ?? []);
        setFavoritesLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, user?.id]);

  // Ricarica altri profili quando il mazzo scende sotto i 3: get_match_candidates
  // esclude già chi ha già una decisione, i match e chi blocca/è bloccato, qui
  // basta scartare eventuali id già presenti in mazzo (stesso giro random()).
  useEffect(() => {
    if (!eligible || deckLoading || deck.length >= 3) return;
    let cancelled = false;
    getMatchCandidates(20, matchFilters).then(({ candidates }) => {
      if (cancelled || !candidates) return;
      setDeck((prev) => {
        const known = new Set(prev.map((p) => p.id));
        return [...prev, ...candidates.filter((p) => !known.has(p.id))];
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, deckLoading, deck.length]);

  // Primo profilo "già visto" nel mazzo: il giro è ricominciato dai
  // "passo" di prima, si avvisa una volta sola.
  useEffect(() => {
    if (giaVistoBannerShown) return;
    if (deck.some((p) => p.giaVisto)) {
      setGiaVistoBannerShown(true);
      setGiaVistoBannerVisible(true);
    }
  }, [deck, giaVistoBannerShown]);

  // Canale realtime sui propri match (RLS limita già alle righe dove sono
  // user_a o user_b): copre il caso in cui è l'ALTRA persona a completare
  // il match reciproco mentre non sono sulla scheda "A chi piaci".
  useEffect(() => {
    if (!user) return undefined;
    const channel = subscribeToOwnMatches((row) => {
      const otherId = row.user_a === user.id ? row.user_b : row.user_a;
      refreshMatches();
      if (justMatchedIds.current.has(otherId)) {
        justMatchedIds.current.delete(otherId);
        return;
      }
      fetchProfilesMap([otherId]).then((map) => {
        triggerMatchToast(map.get(otherId) ?? { id: otherId, name: 'Utente', avatar: '' });
      });
    });
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const current = deck[0] ?? null;

  const decide = (outcome) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!current || swiping) return;
    setActionError('');
    setSwiping({ direction: outcome === 'passed' ? 'left' : 'right' });
    const decisione = outcome === 'passed' ? 'passo' : outcome === 'super' ? 'super_mi_piace' : 'mi_piace';
    window.setTimeout(async () => {
      const { matched, error } = await recordSwipe(current.id, decisione);
      setSwiping(null);
      if (error) {
        setActionError(error);
        return;
      }
      setDeck((prev) => prev.filter((p) => p.id !== current.id));
      if (matched) {
        justMatchedIds.current.add(current.id);
        triggerMatchToast(current);
        refreshMatches();
      }
    }, 320);
  };

  const decideLikesYou = async (profile, outcome) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    setActionError('');
    const decisione = outcome === 'liked' ? 'mi_piace' : 'passo';
    const { matched, error } = await recordSwipe(profile.id, decisione);
    if (error) {
      setActionError(error);
      return;
    }
    setLikesYou((prev) => prev.filter((p) => p.id !== profile.id));
    setDeck((prev) => prev.filter((p) => p.id !== profile.id));
    if (matched) {
      justMatchedIds.current.add(profile.id);
      triggerMatchToast(profile);
      refreshMatches();
    }
  };

  const isFavorite = (id) => favorites.some((f) => f.id === id);

  const toggleFavorite = async (profile) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    setActionError('');
    if (isFavorite(profile.id)) {
      const { error } = await removeFavorite(profile.id);
      if (error) {
        setActionError(error);
        return;
      }
      setFavorites((prev) => prev.filter((f) => f.id !== profile.id));
    } else {
      const { error } = await addFavorite(profile.id);
      if (error) {
        setActionError(error);
        return;
      }
      setFavorites((prev) => [...prev, profile]);
    }
  };

  const confirmUnmatch = async () => {
    if (!pendingUnmatch) return;
    const { error } = await unmatchApi(pendingUnmatch.id);
    setPendingUnmatch(null);
    if (error) {
      setActionError(error);
      return;
    }
    setMatches((prev) => prev.filter((m) => m.id !== pendingUnmatch.id));
  };

  const eligibilityMessage = useMemo(() => {
    if (!user) return null;
    if (!isAdult(user.dataNascita)) return 'Incontri è riservato ai maggiorenni.';
    if (!(user.mondiAbilitati ?? []).includes('incontri')) {
      return 'Hai disattivato il mondo Incontri dalle Impostazioni: riattivalo per vedere i profili.';
    }
    return null;
  }, [user]);

  const primary = (
    <div className="rb-match-deck">
      <p className="rb-match-hint">Profili reali del mondo Incontri: un &quot;mi piace&quot; diventa un match solo se è reciproco.</p>
      {actionError && <p className="rb-privacy-error">{actionError}</p>}
      {giaVistoBannerVisible && (
        <div className="rb-match-gia-visto-banner">
          <span>Hai visto tutti i profili nuovi nella tua zona: ecco di nuovo quelli che avevi saltato, magari hai cambiato idea 😉</span>
          <button type="button" onClick={() => setGiaVistoBannerVisible(false)} aria-label="Chiudi avviso">✕</button>
        </div>
      )}
      {!eligible ? (
        <p className="rb-match-empty">{eligibilityMessage ?? 'Accedi per scoprire nuovi profili.'}</p>
      ) : deckLoading ? (
        <p className="rb-match-empty">Caricamento...</p>
      ) : current ? (
        <div className={`rb-match-card ${swiping ? `leaving-${swiping.direction}` : ''}`}>
          <button
            type="button"
            className={`rb-match-fav-btn ${isFavorite(current.id) ? 'active' : ''}`}
            onClick={() => toggleFavorite(current)}
            aria-label="Aggiungi ai preferiti"
            title="Aggiungi ai preferiti"
          >
            {isFavorite(current.id) ? '⭐' : '☆'}
          </button>
          <img className="rb-match-card-photo" src={current.avatar} alt={current.name} />
          <div className="rb-match-card-info">
            <strong>{current.name}{current.age ? `, ${current.age}` : ''}</strong>
            <span>{current.city}</span>
            <ActivityBadge attivita={current.attivita} />
            {current.bio && <p>{current.bio}</p>}
          </div>
        </div>
      ) : (
        <EmptyState
          icon="💔"
          title="Nessun profilo in questa zona"
          subtitle="Prova ad allargare la ricerca dalle Impostazioni → Luogo e Mostrami."
        />
      )}
      {eligible && current && (
        <div className="rb-match-actions">
          <button type="button" className="rb-match-pass-btn" onClick={() => decide('passed')} disabled={!!swiping}>✕ Passa</button>
          <button type="button" className="rb-match-super-btn" onClick={() => decide('super')} disabled={!!swiping}>⭐ Super Like</button>
          <button type="button" className="rb-match-like-btn" onClick={() => decide('liked')} disabled={!!swiping}>❤️ Mi piace</button>
        </div>
      )}
    </div>
  );

  const likesYouPane = likesYouLoading ? (
    <p className="rb-match-pane-empty">Caricamento...</p>
  ) : (
    <ul className="rb-match-list">
      {likesYou.length === 0 && <p className="rb-match-pane-empty">Nessuno per ora, torna più tardi.</p>}
      {likesYou.map((u) => (
        <li key={u.id} className="rb-match-likes-item">
          <img src={u.avatar} alt="" />
          <span>
            <strong>{u.super ? '⭐ ' : ''}{u.name}{u.age ? `, ${u.age}` : ''}</strong>
            <span className="rb-match-list-city">{u.city}</span>
            <ActivityBadge attivita={u.attivita} />
          </span>
          <div className="rb-match-likes-actions">
            <button type="button" onClick={() => decideLikesYou(u, 'passed')} aria-label="Rifiuta">✕</button>
            <button type="button" onClick={() => decideLikesYou(u, 'liked')} aria-label="Accetta">❤️</button>
          </div>
        </li>
      ))}
    </ul>
  );

  const matchesPane = matchesLoading ? (
    <p className="rb-match-pane-empty">Caricamento...</p>
  ) : (
    <ul className="rb-match-list">
      {matches.length === 0 && <p className="rb-match-pane-empty">Metti &quot;Mi piace&quot; a un profilo per iniziare a fare match.</p>}
      {matches.map((m) => (
        <li key={m.id} className="rb-match-likes-item">
          <img src={m.avatar} alt="" />
          <span>
            <strong>{m.name}{m.age ? `, ${m.age}` : ''}</strong>
            <span className="rb-match-list-city">{m.city}</span>
            <ActivityBadge attivita={m.attivita} />
          </span>
          <button
            type="button"
            className="rb-reset-filters-btn rb-privacy-inline-btn"
            onClick={() => setPendingUnmatch(m)}
            title="Annulla match"
          >
            Annulla match
          </button>
        </li>
      ))}
    </ul>
  );

  const messagesPane = matchesLoading ? (
    <p className="rb-match-pane-empty">Caricamento...</p>
  ) : (
    <ul className="rb-match-list">
      {matches.length === 0 && <p className="rb-match-pane-empty">Nessun match ancora: fai un match per iniziare a chattare.</p>}
      {matches.map((m) => (
        <li key={m.id}>
          <button type="button" className="rb-match-list-item" onClick={() => onOpenChat(m.id)}>
            <img src={m.avatar} alt="" />
            <span>
              <strong>{m.name}</strong>
              <span className="rb-match-list-city">Scrivi un messaggio →</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  const favoritesPane = favoritesLoading ? (
    <p className="rb-match-pane-empty">Caricamento...</p>
  ) : (
    <ul className="rb-match-list">
      {favorites.length === 0 && <p className="rb-match-pane-empty">Tocca la stellina su un profilo per salvarlo qui.</p>}
      {favorites.map((f) => (
        <li key={f.id} className="rb-match-likes-item">
          <img src={f.avatar} alt="" />
          <span>
            <strong>{f.name}</strong>
            <span className="rb-match-list-city">{f.city}</span>
            <ActivityBadge attivita={f.attivita} />
          </span>
          <button
            type="button"
            className="rb-match-fav-remove"
            onClick={() => toggleFavorite(f)}
            aria-label="Togli dai preferiti"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );

  const secondary = (
    <div className="rb-match-secondary-col">
      <div className="rb-match-tabs">
        {RIGHT_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rb-match-tab-btn ${rightTab === t.id ? 'active' : ''}`}
            onClick={() => setRightTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {rightTab === 'likesYou' && likesYouPane}
      {rightTab === 'matches' && matchesPane}
      {rightTab === 'messages' && messagesPane}
      {rightTab === 'favorites' && favoritesPane}
    </div>
  );

  return (
    <div className="rb-match-column">
      <TwoColumnSwitcher
        primary={primary}
        secondary={secondary}
        primaryLabel="Scopri"
        secondaryLabel="Match"
        mobileView={mobileView}
        onMobileViewChange={setMobileView}
      />
      {matchToast && <div className="rb-match-toast">🎉 È un Match con {matchToast.name}!</div>}

      {pendingUnmatch && (
        <ModalOverlay className="rb-profile-confirm-overlay">
          <div className="rb-profile-confirm-card" onClick={(e) => e.stopPropagation()}>
            <p>Annullare il match con {pendingUnmatch.name}? Non potrete più scrivervi.</p>
            <p className="rb-profile-confirm-question">Confermi?</p>
            <div className="rb-profile-confirm-actions">
              <button type="button" onClick={() => setPendingUnmatch(null)}>Annulla</button>
              <button type="button" className="rb-profile-confirm-ok" onClick={confirmUnmatch}>Confermo</button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
