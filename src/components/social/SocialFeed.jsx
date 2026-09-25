import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import TwoColumnSwitcher from '../layout/TwoColumnSwitcher';
import PostComposer from './PostComposer';
import PostCard from './PostCard';
import SponsorCard from '../ads/SponsorCard';
import GroupsDirectory from './GroupsDirectory';
import CategoryHub from './CategoryHub';
import LiveWorldPanel from '../live/LiveWorldPanel';
import EventComposer from './EventComposer';
import EventCard from './EventCard';
import SuggestedUsers from './SuggestedUsers';
import SocialProfileModal from './SocialProfileModal';
import TrendingGroups from './TrendingGroups';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';
import { computeRelevance } from '../../data/socialPosts';
import {
  fetchFeed,
  fetchComments,
  fetchProfilesMap,
  createPost as createPostApi,
  updatePostText as updatePostTextApi,
  softDeletePost as softDeletePostApi,
  togglePostLike as togglePostLikeApi,
  toggleSavedPost as toggleSavedPostApi,
  addComment as addCommentApi,
  deleteComment as deleteCommentApi,
  displayName,
  applyCommentReaction,
  toggleCommentReaction,
} from '../../data/posts';
import { listGroups, getMyGroupIds, createGroup as createGroupApi, joinGroup, leaveGroup } from '../../data/groups';
import { isStaff } from '../../data/roles';
import { logAdminAction } from '../../data/adminAuditLog';
import { followUser, unfollowUser, getFollowing, listSuggestedProfiles } from '../../data/follows';
import {
  listContentsForPlacement,
  toggleContentLike as toggleContentLikeApi,
  deleteContent,
  updateContentCaption,
} from '../../data/contents';
import { getCityInfo } from '../../data/geo';
import './SocialFeed.css';

// Ogni tot post "di zona" (tab Per te, con un filtro Dove attivo), si
// intercala il prossimo post in classifica per numero di mi piace (1°, poi
// 2°, ...) tra TUTTI i post esistenti — così chi filtra per regione vede
// comunque cosa va per la maggiore nel resto del mondo Social.
const TRENDING_EVERY = 3;

// Una card sponsorizzata ogni 8 post del feed, mai la prima — richiesta esplicita.
const SPONSOR_FEED_EVERY = 8;

// Un post è "della zona" se il suo autore ha una città nel Profilo Social
// (public_profiles.citta_social, in author.citta) che rispetta i filtri
// Dove di Impostazioni: la città per testo (senza accenti né maiuscole),
// regione e continente dall'anagrafica di data/geo.js quando la città è
// nota. Autore senza città = non è della zona.
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function matchesLocation(post, locationFilters) {
  const city = post.author?.citta || post.author?.city;
  if (!city) return false;
  if (locationFilters.city && !fold(city).includes(fold(locationFilters.city))) return false;
  if (locationFilters.region || locationFilters.continent) {
    const info = getCityInfo(city);
    if (locationFilters.region && info?.region !== locationFilters.region) return false;
    if (locationFilters.continent && info?.continent !== locationFilters.continent) return false;
  }
  return true;
}

// Intercala, ogni TRENDING_EVERY post "di zona", il prossimo post più
// popolare in classifica (per numero di mi piace) tra tutti i post
// esistenti — saltando quelli già presenti nella lista di zona, per non
// mostrare lo stesso post due volte di fila.
function interleaveTrending(regionalPosts, allPosts) {
  const alreadyShown = new Set(regionalPosts.map((p) => p.id));
  const ranking = [...allPosts]
    .filter((p) => !alreadyShown.has(p.id))
    .sort((a, b) => b.mi_piace.length - a.mi_piace.length);

  const items = [];
  let rankIdx = 0;
  regionalPosts.forEach((post, i) => {
    items.push({ post, trendingRank: null });
    if ((i + 1) % TRENDING_EVERY === 0 && rankIdx < ranking.length) {
      items.push({ post: ranking[rankIdx], trendingRank: rankIdx + 1 });
      rankIdx += 1;
    }
  });
  return items;
}

const FEED_TABS = [
  { id: 'foryou', label: 'Per te' },
  { id: 'following', label: 'Seguiti' },
  { id: 'groups', label: 'Gruppi' },
  { id: 'saved', label: 'Salvati' },
  { id: 'eventi', label: '📅 Eventi' },
  { id: 'live', label: '🔴 Live' },
  { id: 'mondi', label: '🌍 Mondi' },
];

// Mondo Social (Blu): colonna sinistra = feed (Per te / Seguiti / Gruppi /
// Salvati), colonna destra = suggerimenti (persone da seguire, gruppi di
// tendenza) + i miei post. Tutto lo stato "reale" (post, commenti, like,
// salvati, follow, gruppi) vive su Supabase (data/posts.js, data/groups.js,
// data/follows.js) — questo componente tiene solo una copia in stato React
// per il rendering, aggiornata in modo ottimistico dopo ogni azione.
//
// Le foto/video caricate col sistema condiviso (data/contents.js) restano
// una fonte a parte: un contenuto pubblicato altrove (es. Fotografia nel
// mondo Arte) con un posizionamento "social" non passa mai da qui, quindi
// va comunque recuperato e unito al feed vero e proprio (stesso comporta-
// mento di prima, solo che ora "il resto del feed" è reale).
export default function SocialFeed({
  world,
  user,
  onOpenAuth,
  locationFilters = {},
  onNavigateToCategory,
  events = [],
  onCreateEvent,
  onToggleEventLike,
  onOpenEventLikers,
  // { postId, seq }: post da mostrare (clic su una notifica di menzione).
  focusPost = null,
}) {
  const [showEventComposer, setShowEventComposer] = useState(false);
  const [viewingProfileId, setViewingProfileId] = useState(null);
  const [posts, setPosts] = useState([]);
  const [comments, setComments] = useState([]);
  const [following, setFollowing] = useState([]);
  const [joinedGroups, setJoinedGroups] = useState([]);
  const [groupsList, setGroupsList] = useState([]);
  const [savedPosts, setSavedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState(null);
  // Errore transitorio di una singola azione (segui, mi piace...), separato
  // da feedError che è per il caricamento del feed intero (ha un suo
  // pulsante "Riprova" che non avrebbe senso qui).
  const [actionError, setActionError] = useState('');
  const showActionError = (message) => {
    setActionError(message);
    window.setTimeout(() => setActionError(''), 4000);
  };

  // Pagine del feed (fetchFeed a FEED_PAGE_SIZE): cursore = data
  // dell'ultimo post della pagina più vecchia già caricata (non del post
  // più vecchio in lista: uno aperto da un link salterebbe le pagine in mezzo).
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef(null);
  const sentinelRef = useRef(null);

  const [feedTab, setFeedTab] = useState('foryou');
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [mobileView, setMobileView] = useState('primary');

  const loadFeed = async () => {
    setLoading(true);
    setFeedError(null);

    const [feedRes, groupsRes, followingRes, myGroupsRes] = await Promise.all([
      fetchFeed({ mondo: 'social' }),
      listGroups(),
      getFollowing(),
      getMyGroupIds(),
    ]);

    if (feedRes.error) {
      setFeedError(feedRes.error);
      setLoading(false);
      return;
    }

    let feedPosts = feedRes.posts ?? [];
    setHasMore(Boolean(feedRes.hasMore));
    cursorRef.current = feedPosts.length ? feedPosts[feedPosts.length - 1].data : null;

    // Contenuti condivisi ripubblicati anche nel mondo Social da un altro
    // punto dell'app (senza una riga in posts): recuperati a parte e uniti.
    const sharedItems = await listContentsForPlacement({ world: 'social' });
    const knownContentIds = new Set(feedPosts.filter((p) => p.contentId).map((p) => p.contentId));
    const extraFromContents = sharedItems
      .filter((c) => !knownContentIds.has(c.id))
      .map((c) => ({
        id: `content-${c.id}`,
        fromPostsTable: false,
        autoreId: c.owner_id,
        author: null,
        testo: c.caption ?? '',
        data: c.created_at,
        mi_piace: [],
        commenti: [],
        gruppo_id: null,
        group: null,
        savedByMe: false,
        contentId: c.id,
        mediaUrl: c.url,
        mediaType: c.type,
        contentTags: c.tags ?? [],
        contentLiked: c.likedByMe,
        contentLikeCount: c.likeCount,
        gif: null,
        link_esterno: null,
      }));

    if (extraFromContents.length) {
      const authorsMap = await fetchProfilesMap(extraFromContents.map((p) => p.autoreId));
      extraFromContents.forEach((p) => {
        p.author = authorsMap.get(p.autoreId) ?? { id: p.autoreId, name: 'Utente', avatar: '' };
      });
    }

    feedPosts = [...feedPosts, ...extraFromContents].sort((a, b) => new Date(b.data) - new Date(a.data));

    setPosts(feedPosts);
    setGroupsList(groupsRes);
    setFollowing(followingRes);
    setJoinedGroups(myGroupsRes);
    setSavedPosts(feedPosts.filter((p) => p.savedByMe).map((p) => p.id));
    setLoading(false);

    const realPostIds = feedPosts.filter((p) => p.fromPostsTable).map((p) => p.id);
    if (realPostIds.length) {
      const { comments: fetchedComments, error } = await fetchComments(realPostIds);
      // Si tengono i commenti di un post aggiunto a parte (link condiviso)
      // arrivati prima di questi.
      const loaded = new Set(realPostIds);
      if (!error) setComments((prev) => [...fetchedComments, ...prev.filter((c) => !loaded.has(c.post_id))]);
    } else {
      setComments([]);
    }
  };

  useEffect(() => {
    loadFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Pagina successiva: post, salvati e commenti dei soli post nuovi.
  const loadMore = async () => {
    if (loadingMore || !hasMore || !cursorRef.current) return;
    setLoadingMore(true);
    const res = await fetchFeed({ mondo: 'social', before: cursorRef.current });
    setLoadingMore(false);
    if (res.error) {
      showActionError(res.error);
      return;
    }
    const fresh = res.posts ?? [];
    setHasMore(Boolean(res.hasMore));
    if (fresh.length) cursorRef.current = fresh[fresh.length - 1].data;
    setPosts((prev) => {
      const known = new Set(prev.map((p) => p.id));
      return [...prev, ...fresh.filter((p) => !known.has(p.id))];
    });
    setSavedPosts((prev) => [...new Set([...prev, ...fresh.filter((p) => p.savedByMe).map((p) => p.id)])]);
    if (fresh.length) {
      const { comments: more } = await fetchComments(fresh.map((p) => p.id));
      if (more?.length) {
        setComments((prev) => {
          const known = new Set(prev.map((c) => c.id));
          return [...prev, ...more.filter((c) => !known.has(c.id))];
        });
      }
    }
  };

  // Scorrimento infinito: la pagina dopo arriva quando si vede la fine.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  });

  const authorFromUser = () => ({ id: user.id, name: displayName(user, 'Tu'), avatar: user.avatar || '' });

  const createPost = async ({ testo, menzioni, gif, link_esterno, gruppo_id, contentId, mediaUrl, mediaType, tags }) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    const { id, createdAt, menzioni: savedMentions, error } = await createPostApi({
      testo,
      menzioni,
      gif,
      link_esterno,
      gruppoId: gruppo_id,
      contentId,
      mediaUrl,
      mediaType,
      tags,
    });
    if (error) {
      setFeedError(error);
      return;
    }
    const group = gruppo_id ? groupsList.find((g) => g.id === gruppo_id) ?? null : null;
    const newPost = {
      id,
      fromPostsTable: true,
      autoreId: user.id,
      author: authorFromUser(),
      testo,
      menzioni: savedMentions ?? [],
      data: createdAt,
      mi_piace: [],
      commenti: [],
      gif,
      link_esterno,
      gruppo_id: gruppo_id ?? null,
      group,
      contentId: contentId ?? null,
      mediaUrl: mediaUrl ?? null,
      mediaType: mediaType ?? null,
      contentTags: tags ?? [],
      contentLiked: false,
      contentLikeCount: 0,
      savedByMe: false,
    };
    setPosts((p) => [newPost, ...p]);
  };

  const toggleLike = async (postId) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    const target = posts.find((p) => p.id === postId);
    if (!target) return;
    const currentlyLiked = target.mi_piace.includes(user.id);
    const { liked, error } = await togglePostLikeApi(postId, currentlyLiked);
    if (error) {
      showActionError(error);
      return;
    }
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, mi_piace: liked ? [...p.mi_piace, user.id] : p.mi_piace.filter((id) => id !== user.id) }
          : p
      )
    );
  };

  // Like su un post con foto/video autotaggato: passa dalla stessa tabella
  // content_likes condivisa con le altre posizioni dello stesso contenuto
  // (Arte, Nerd, ecc.), non dai post_likes usati per i post di testo.
  const toggleContentLike = async (post) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    const { liked, error } = await toggleContentLikeApi(post.contentId, post.contentLiked);
    if (error) {
      showActionError(error);
      return;
    }
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, contentLiked: liked, contentLikeCount: p.contentLikeCount + (liked ? 1 : -1) } : p
      )
    );
  };

  // Modifica/cancellazione: solo sui propri post, verificato qui oltre che
  // nell'interfaccia. Un post con contenuto condiviso (foto/video) tocca
  // anche quel contenuto — vale ovunque sia stato ripubblicato, non solo
  // qui. Le voci unite dal sistema contenuti (fromPostsTable: false) non
  // hanno una vera riga in posts, quindi si tocca solo il contenuto.
  const editPost = async (postId, newTesto) => {
    const target = posts.find((p) => p.id === postId);
    if (!target || target.autoreId !== user?.id) return;
    if (target.fromPostsTable) {
      const { error } = await updatePostTextApi(postId, newTesto);
      if (error) {
        setFeedError(error);
        return;
      }
    }
    if (target.contentId) {
      const { error } = await updateContentCaption(target.contentId, newTesto);
      if (error) {
        setFeedError(error);
        return;
      }
    }
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, testo: newTesto } : p)));
  };

  // Autore o staff (owner/moderatore) possono cancellare: la RLS lato
  // server già lo permette a entrambi (vedi commento su softDeletePost in
  // data/posts.js), qui si registra anche nel log di moderazione quando è
  // lo staff a togliere il post di qualcun altro — mai per una propria
  // cancellazione, quella non è un'azione di moderazione da tracciare.
  const deletePost = async (postId) => {
    const target = posts.find((p) => p.id === postId);
    if (!target) return;
    const isOwn = target.autoreId === user?.id;
    const staffRemoval = !isOwn && isStaff(user?.ruolo);
    if (!isOwn && !staffRemoval) return;
    if (isOwn && target.contentId) {
      const { error } = await deleteContent(target.contentId, target.mediaUrl);
      if (error) {
        setFeedError(error);
        return;
      }
    }
    if (target.fromPostsTable) {
      const { error } = await softDeletePostApi(postId);
      if (error) {
        setFeedError(error);
        return;
      }
    }
    if (staffRemoval) await logAdminAction('rimozione_post', target.autoreId, { postId });
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setComments((prev) => prev.filter((c) => c.post_id !== postId));
  };

  const addComment = async (postId, { testo, gif, menzioni }) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    const { id, createdAt, menzioni: savedMentions, error } = await addCommentApi({ postId, testo, gif, menzioni });
    if (error) {
      setFeedError(error);
      return;
    }
    const newComment = {
      id,
      post_id: postId,
      autoreId: user.id,
      author: authorFromUser(),
      testo,
      menzioni: savedMentions ?? [],
      data: createdAt,
      gif: gif ?? null,
      reazioni: {},
    };
    setComments((c) => [...c, newComment]);
  };

  const removeComment = async (commentId) => {
    const target = comments.find((c) => c.id === commentId);
    if (!target) return;
    const isOwn = target.autoreId === user?.id;
    const staffRemoval = !isOwn && isStaff(user?.ruolo);
    if (!isOwn && !staffRemoval) return;
    const { error } = await deleteCommentApi(commentId);
    if (error) {
      setFeedError(error);
      return;
    }
    if (staffRemoval) await logAdminAction('rimozione_commento', target.autoreId, { commentId });
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  // Reazioni ai commenti: salvate in comment_reactions (una per emoji per
  // utente), aggiornamento ottimistico e ritorno indietro se il server dice no.
  const reactToComment = async (commentId, emoji) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    const had = (comments.find((c) => c.id === commentId)?.mieReazioni ?? []).includes(emoji);
    setComments((prev) => applyCommentReaction(prev, commentId, emoji));
    const { error: reactErr } = await toggleCommentReaction(commentId, emoji, had);
    if (reactErr) {
      setComments((prev) => applyCommentReaction(prev, commentId, emoji));
      setFeedError(reactErr);
    }
  };

  const toggleFollow = async (userId) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    const isFollowing = following.includes(userId);
    const { error } = isFollowing ? await unfollowUser(userId) : await followUser(userId);
    if (error) {
      showActionError(error);
      return;
    }
    setFollowing((prev) => (isFollowing ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const toggleJoinGroup = async (groupId) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    const isJoined = joinedGroups.includes(groupId);
    const { error } = isJoined ? await leaveGroup(groupId) : await joinGroup(groupId);
    if (error) {
      setFeedError(error);
      return;
    }
    setJoinedGroups((prev) => (isJoined ? prev.filter((id) => id !== groupId) : [...prev, groupId]));
    setGroupsList((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, memberCount: g.memberCount + (isJoined ? -1 : 1) } : g))
    );
  };

  const createGroupHandler = async ({ nome, descrizione, icona, colore }) => {
    if (!user) {
      onOpenAuth();
      return { error: 'Devi essere loggato.' };
    }
    const { group, error } = await createGroupApi({ nome, descrizione, icona, colore });
    if (error) return { error };
    setGroupsList((prev) => [...prev, group]);
    setJoinedGroups((prev) => [...prev, group.id]);
    return {};
  };

  const toggleSavePost = async (postId) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    const currentlySaved = savedPosts.includes(postId);
    const { saved, error } = await toggleSavedPostApi(postId, currentlySaved);
    if (error) return;
    setSavedPosts((prev) => (saved ? [...prev, postId] : prev.filter((id) => id !== postId)));
  };

  // Apre il feed di un gruppo da qualunque punto dell'app (badge su un post,
  // card nella directory, widget "di tendenza" nella colonna destra) e, su
  // mobile, riporta anche alla colonna principale se si veniva dalla destra.
  const openGroup = (groupId) => {
    setActiveGroupId(groupId);
    setMobileView('primary');
  };

  // Notifica di menzione o link condiviso: apre il gruppo del post se
  // serve (altrimenti il tab "Per te"), lo porta in vista e lo evidenzia
  // per qualche secondo. Se il post non è tra quelli caricati (più vecchio,
  // o di un link) lo si chiede da solo e lo si aggiunge al feed: l'effect
  // riparte appena arriva (focusFetchRef evita un secondo tentativo).
  const focusFetchRef = useRef(null);
  const [focusFetched, setFocusFetched] = useState(0);
  useEffect(() => {
    if (!focusPost || loading) return undefined;
    const target = posts.find((p) => p.id === focusPost.postId);
    if (!target) {
      if (focusFetchRef.current === focusPost.seq) {
        showActionError('Questo post non è più disponibile.');
        return undefined;
      }
      focusFetchRef.current = focusPost.seq;
      let cancelled = false;
      fetchFeed({ mondo: 'social', ids: [focusPost.postId] }).then(async (res) => {
        if (cancelled) return;
        const found = res.posts?.[0];
        if (found) {
          setPosts((prev) => (prev.some((p) => p.id === found.id) ? prev : [...prev, found].sort((a, b) => new Date(b.data) - new Date(a.data))));
          const { comments: extra } = await fetchComments([found.id]);
          if (extra?.length) setComments((prev) => [...prev.filter((c) => c.post_id !== found.id), ...extra]);
        }
        setFocusFetched((n) => n + 1);
      });
      return () => {
        cancelled = true;
      };
    }
    setMobileView('primary');
    if (target.gruppo_id) setActiveGroupId(target.gruppo_id);
    else {
      setActiveGroupId(null);
      setFeedTab('foryou');
    }
    let tries = 0;
    let timer;
    const reveal = () => {
      const el = document.querySelector(`[data-post-id="${focusPost.postId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('rb-post-card--focus');
        timer = window.setTimeout(() => el.classList.remove('rb-post-card--focus'), 2600);
      } else if (tries++ < 10) {
        timer = window.setTimeout(reveal, 150);
      } else {
        showActionError('Il post è nascosto dai filtri di posizione attivi.');
      }
    };
    timer = window.setTimeout(reveal, 100);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPost?.seq, loading, focusFetched]);

  const isGroupView = Boolean(activeGroupId);
  const activeGroup = isGroupView ? groupsList.find((g) => g.id === activeGroupId) ?? null : null;

  // Feed "Per te": i post restano ordinati per pertinenza tra loro.
  const forYouList = useMemo(() => {
    const byRelevance = (a, b) => computeRelevance(b, comments) - computeRelevance(a, comments);
    return [...posts].sort(byRelevance);
  }, [posts, comments]);

  const hasLocationFilter = Boolean(locationFilters.city || locationFilters.region || locationFilters.continent);

  const regionalForYou = useMemo(() => {
    if (!hasLocationFilter) return [];
    return forYouList.filter((p) => matchesLocation(p, locationFilters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forYouList, locationFilters.city, locationFilters.region, locationFilters.continent, hasLocationFilter]);

  // Con un filtro di zona attivo, il tab "Per te" mostra i post della zona
  // con i più popolari di tutto il mondo Social intercalati ogni 3; senza
  // filtro resta il feed per pertinenza di sempre.
  const forYouItems = useMemo(() => {
    if (!hasLocationFilter) return forYouList.map((post) => ({ post, trendingRank: null }));
    return interleaveTrending(regionalForYou, posts);
  }, [hasLocationFilter, forYouList, regionalForYou, posts]);

  const followingList = useMemo(
    () =>
      posts
        .filter((p) => following.includes(p.autoreId) || (p.gruppo_id && joinedGroups.includes(p.gruppo_id)))
        .sort((a, b) => new Date(b.data) - new Date(a.data)),
    [posts, following, joinedGroups]
  );

  const savedList = useMemo(
    () => posts.filter((p) => savedPosts.includes(p.id)).sort((a, b) => new Date(b.data) - new Date(a.data)),
    [posts, savedPosts]
  );

  const groupList = useMemo(
    () =>
      activeGroupId
        ? posts
            .filter((p) => p.gruppo_id === activeGroupId)
            .sort((a, b) => computeRelevance(b, comments) - computeRelevance(a, comments))
        : [],
    [posts, comments, activeGroupId]
  );

  // Calcolato dal feed già in stato (non dallo snapshot di listGroups):
  // così un post appena pubblicato in un gruppo aggiorna subito il
  // conteggio, senza dover ricaricare tutto.
  const groupPostCounts = useMemo(() => {
    const counts = {};
    posts.forEach((p) => {
      if (p.gruppo_id) counts[p.gruppo_id] = (counts[p.gruppo_id] ?? 0) + 1;
    });
    return counts;
  }, [posts]);

  const [suggestedUsers, setSuggestedUsers] = useState([]);
  useEffect(() => {
    listSuggestedProfiles(following, 4).then(setSuggestedUsers);
  }, [following]);

  const trendingGroups = useMemo(() => [...groupsList].sort((a, b) => b.memberCount - a.memberCount).slice(0, 4), [groupsList]);

  // Eventi in ordine di data/ora più vicina, quelli di oggi prima di domani.
  const eventsSorted = useMemo(
    () => [...events].sort((a, b) => new Date(a.dataEvento) - new Date(b.dataEvento)),
    [events]
  );

  // Solo il tab "Per te" (senza gruppo aperto) usa gli item con trendingRank;
  // gli altri tab restano liste semplici, qui uniformate alla stessa forma
  // {post, trendingRank} per riusare un solo blocco di rendering.
  const displayedItems = isGroupView
    ? groupList.map((post) => ({ post, trendingRank: null }))
    : feedTab === 'following'
    ? followingList.map((post) => ({ post, trendingRank: null }))
    : feedTab === 'saved'
    ? savedList.map((post) => ({ post, trendingRank: null }))
    : forYouItems;

  const emptyStateMessage = (() => {
    if (isGroupView || displayedItems.length > 0) return null;
    if (feedTab === 'following') return 'Non segui ancora nessuno. Segui qualcuno o iscriviti a un gruppo per vedere qui i loro post.';
    if (feedTab === 'saved') return 'Non hai ancora salvato nessun post. Tocca 🔖 su un post per ritrovarlo qui.';
    return null;
  })();

  // Solo i post pubblicati dall'utente loggato.
  const myPosts = useMemo(
    () => posts.filter((p) => p.autoreId === user?.id).sort((a, b) => new Date(b.data) - new Date(a.data)),
    [posts, user?.id]
  );

  const feedSubtitle =
    feedTab === 'foryou' && !isGroupView && hasLocationFilter
      ? `Post da ${locationFilters.city || locationFilters.region || locationFilters.continent}, con i più popolari di tutto il mondo Social intercalati`
      : 'Cosa succede nel mondo Social';

  const primary = (
    <>
      <div className="rb-social-panel-header">
        <h3>Feed</h3>
        <p>{feedSubtitle}</p>
      </div>

      {feedError && (
        <p className="rb-social-error">
          ⚠️ {feedError}{' '}
          <button type="button" className="rb-social-retry-btn" onClick={loadFeed}>
            Riprova
          </button>
        </p>
      )}

      {actionError && (
        <p className="rb-social-error">⚠️ {actionError}</p>
      )}

      <div className="rb-feed-tabs">
        {FEED_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rb-feed-tab-btn ${!isGroupView && feedTab === t.id ? 'active' : ''}`}
            onClick={() => {
              setActiveGroupId(null);
              setFeedTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isGroupView && activeGroup && (
        <div className="rb-group-feed-header" style={{ '--group-color': activeGroup.color }}>
          <button type="button" className="rb-group-back-btn" onClick={() => setActiveGroupId(null)}>
            ← Gruppi
          </button>
          <span className="rb-group-feed-icon">{activeGroup.icon}</span>
          <div className="rb-group-feed-info">
            <strong>{activeGroup.name}</strong>
            <span>{activeGroup.memberCount.toLocaleString('it-IT')} membri</span>
          </div>
          <button
            type="button"
            className={`rb-group-join-btn ${joinedGroups.includes(activeGroup.id) ? 'joined' : ''}`}
            onClick={() => (user ? toggleJoinGroup(activeGroup.id) : onOpenAuth())}
          >
            {joinedGroups.includes(activeGroup.id) ? 'Iscritto ✓' : 'Iscriviti'}
          </button>
        </div>
      )}

      {feedTab === 'groups' && !isGroupView ? (
        <GroupsDirectory
          groups={groupsList}
          joinedGroups={joinedGroups}
          postCounts={groupPostCounts}
          user={user}
          onOpenAuth={onOpenAuth}
          onToggleJoin={toggleJoinGroup}
          onOpenGroup={openGroup}
          onCreateGroup={createGroupHandler}
        />
      ) : feedTab === 'mondi' && !isGroupView ? (
        <CategoryHub onNavigateToCategory={onNavigateToCategory} />
      ) : feedTab === 'live' && !isGroupView ? (
        <LiveWorldPanel mondo="social" user={user} onOpenAuth={onOpenAuth} />
      ) : feedTab === 'eventi' && !isGroupView ? (
        <>
          {showEventComposer ? (
            <EventComposer
              user={user}
              onOpenAuth={onOpenAuth}
              onClose={() => setShowEventComposer(false)}
              onSubmit={async (data) => {
                const result = await onCreateEvent(data);
                if (!result?.error) setShowEventComposer(false);
                return result;
              }}
            />
          ) : (
            <button
              type="button"
              className="rb-event-new-btn"
              onClick={() => (user ? setShowEventComposer(true) : onOpenAuth())}
            >
              + Crea un evento
            </button>
          )}

          {eventsSorted.length === 0 && <EmptyState icon="📅" title="Nessun evento in programma" subtitle="Sii il primo a crearne uno per il mondo Social." />}
          <ul className="rb-event-list">
            {eventsSorted.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                user={user}
                onOpenAuth={onOpenAuth}
                onToggleLike={onToggleEventLike}
                onOpenLikers={onOpenEventLikers}
              />
            ))}
          </ul>
        </>
      ) : (
        <>
          {feedTab !== 'saved' && (
            isGroupView && activeGroup && !joinedGroups.includes(activeGroup.id) ? (
              <button
                type="button"
                className="rb-group-join-btn"
                onClick={() => (user ? toggleJoinGroup(activeGroup.id) : onOpenAuth())}
              >
                Unisciti per pubblicare
              </button>
            ) : (
              <PostComposer user={user} onOpenAuth={onOpenAuth} onSubmit={createPost} groups={groupsList} defaultGroupId={activeGroupId} />
            )
          )}

          {loading && posts.length === 0 && (
            <div className="rb-feed-skeleton-list" aria-hidden="true">
              <Skeleton lines={3} />
              <Skeleton lines={2} />
              <Skeleton lines={3} />
            </div>
          )}
          {hasLocationFilter && feedTab === 'foryou' && !isGroupView && regionalForYou.length === 0 && (
            <EmptyState icon="📍" title="Nessun post da questa zona" subtitle="Prova ad allargare il filtro Luogo nelle Impostazioni." />
          )}
          {emptyStateMessage && <EmptyState icon="💬" title={emptyStateMessage} />}

          <ul className="rb-post-list">
            {displayedItems.map(({ post, trendingRank }, i) => (
              <Fragment key={`${post.id}-${i}`}>
                <PostCard
                  post={post}
                  comments={comments}
                  user={user}
                  onOpenAuth={onOpenAuth}
                  onToggleLike={toggleLike}
                  onToggleContentLike={toggleContentLike}
                  onEditPost={editPost}
                  onDeletePost={deletePost}
                  onAddComment={addComment}
                  onReactToComment={reactToComment}
                  onDeleteComment={removeComment}
                  trendingRank={trendingRank}
                  following={following}
                  onToggleFollow={toggleFollow}
                  saved={savedPosts.includes(post.id)}
                  onToggleSave={toggleSavePost}
                  onOpenGroup={openGroup}
                />
                {/* Una card sponsorizzata ogni 8 post, mai la prima (richiesta
                    esplicita): SPONSOR_FEED_EVERY posti dopo l'inizio, poi si
                    ripete. */}
                {(i + 1) % SPONSOR_FEED_EVERY === 0 && (
                  <SponsorCard as="li" mondo="social" formato="card_feed" />
                )}
              </Fragment>
            ))}
          </ul>
          {hasMore && !loading && !isGroupView && (feedTab === 'foryou' || feedTab === 'following') && (
            <div ref={sentinelRef} className="rb-feed-more">
              <button type="button" className="rb-feed-more-btn" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Carico altri post…' : 'Carica altri post'}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );

  const secondary = (
    <>
      <SuggestedUsers
        candidates={suggestedUsers}
        user={user}
        onOpenAuth={onOpenAuth}
        onToggleFollow={toggleFollow}
        onOpenProfile={setViewingProfileId}
      />
      <TrendingGroups
        groups={trendingGroups}
        joinedGroups={joinedGroups}
        user={user}
        onOpenAuth={onOpenAuth}
        onToggleJoin={toggleJoinGroup}
        onOpenGroup={openGroup}
      />

      <div className="rb-social-panel-header">
        <h3>I miei post</h3>
        <p>{user ? `${myPosts.length} pubblicati` : 'Accedi per vedere i tuoi post'}</p>
      </div>

      {!user && (
        <EmptyState icon="🔒" title="Accedi per pubblicare" subtitle="Serve un account per pubblicare e monitorare i tuoi post." actions={[{ label: 'Accedi', primary: true, onClick: onOpenAuth }]} />
      )}
      {user && myPosts.length === 0 && (
        <EmptyState icon="📝" title="Non hai ancora pubblicato nulla" subtitle="Scrivi il tuo primo post nel feed!" />
      )}

      {user && myPosts.length > 0 && (
        <ul className="rb-post-list rb-mypost-list">
          {myPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              comments={comments}
              user={user}
              onOpenAuth={onOpenAuth}
              onToggleLike={toggleLike}
              onToggleContentLike={toggleContentLike}
              onEditPost={editPost}
              onDeletePost={deletePost}
              onAddComment={addComment}
              onReactToComment={reactToComment}
              onDeleteComment={removeComment}
              following={following}
              onToggleFollow={toggleFollow}
              saved={savedPosts.includes(post.id)}
              onToggleSave={toggleSavePost}
              onOpenGroup={openGroup}
            />
          ))}
        </ul>
      )}
    </>
  );

  return (
    <div className="rb-social-feed" style={{ '--accent': world.color }}>
      <TwoColumnSwitcher
        primary={primary}
        secondary={secondary}
        primaryLabel="Feed"
        secondaryLabel="I miei post"
        mobileView={mobileView}
        onMobileViewChange={setMobileView}
      />
      {viewingProfileId && (
        <SocialProfileModal
          userId={viewingProfileId}
          user={user}
          following={following}
          onToggleFollow={toggleFollow}
          onOpenAuth={onOpenAuth}
          onClose={() => setViewingProfileId(null)}
        />
      )}
    </div>
  );
}
