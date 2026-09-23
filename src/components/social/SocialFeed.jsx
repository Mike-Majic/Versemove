import { Fragment, useEffect, useMemo, useState } from 'react';
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
} from '../../data/posts';
import { listGroups, getMyGroupIds, createGroup as createGroupApi, joinGroup, leaveGroup } from '../../data/groups';
import { followUser, unfollowUser, getFollowing, listSuggestedProfiles } from '../../data/follows';
import {
  listContentsForPlacement,
  toggleContentLike as toggleContentLikeApi,
  deleteContent,
  updateContentCaption,
} from '../../data/contents';
import './SocialFeed.css';

// Ogni tot post "di zona" (tab Per te, con un filtro Dove attivo), si
// intercala il prossimo post in classifica per numero di mi piace (1°, poi
// 2°, ...) tra TUTTI i post esistenti — così chi filtra per regione vede
// comunque cosa va per la maggiore nel resto del mondo Social.
const TRENDING_EVERY = 3;

// Una card sponsorizzata ogni 8 post del feed, mai la prima — richiesta esplicita.
const SPONSOR_FEED_EVERY = 8;

// Un post è "della zona" se il suo autore ha una città nota che rispetta i
// filtri Dove di Impostazioni. I profili reali (vedi public_profiles) non
// hanno un campo città: per ora questo filtro non ha dati da confrontare e
// il tab "Per te" con zona attiva resta vuoto — limite noto, non introdotto
// da questa migrazione (era già così quando gli autori erano finti).
function matchesLocation(post, locationFilters) {
  const city = post.author?.city;
  if (!city) return false;
  if (locationFilters.city && !city.toLowerCase().includes(locationFilters.city.toLowerCase())) return false;
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
}) {
  const [showEventComposer, setShowEventComposer] = useState(false);
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
      if (!error) setComments(fetchedComments);
    } else {
      setComments([]);
    }
  };

  useEffect(() => {
    loadFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const authorFromUser = () => ({ id: user.id, name: displayName(user, 'Tu'), avatar: user.avatar || '' });

  const createPost = async ({ testo, gif, link_esterno, gruppo_id, contentId, mediaUrl, mediaType, tags }) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    const { id, createdAt, error } = await createPostApi({
      testo,
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

  const deletePost = async (postId) => {
    const target = posts.find((p) => p.id === postId);
    if (!target || target.autoreId !== user?.id) return;
    if (target.contentId) {
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
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setComments((prev) => prev.filter((c) => c.post_id !== postId));
  };

  const addComment = async (postId, { testo, gif }) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    const { id, createdAt, error } = await addCommentApi({ postId, testo, gif });
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
      data: createdAt,
      gif: gif ?? null,
      reazioni: {},
    };
    setComments((c) => [...c, newComment]);
  };

  const removeComment = async (commentId) => {
    const target = comments.find((c) => c.id === commentId);
    if (!target || target.autoreId !== user?.id) return;
    const { error } = await deleteCommentApi(commentId);
    if (error) {
      setFeedError(error);
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  // Le reazioni emoji ai commenti restano solo un contatore locale a questa
  // sessione (non c'è una tabella per salvarle condivise tra utenti/
  // dispositivi): si azzerano ricaricando la pagina, invariato rispetto a
  // prima per il resto dell'interazione.
  const reactToComment = (commentId, emoji) => {
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        const current = c.reazioni?.[emoji] ?? 0;
        return { ...c, reazioni: { ...c.reazioni, [emoji]: current + 1 } };
      })
    );
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
        </>
      )}
    </>
  );

  const secondary = (
    <>
      <SuggestedUsers candidates={suggestedUsers} user={user} onOpenAuth={onOpenAuth} onToggleFollow={toggleFollow} />
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
    </div>
  );
}
