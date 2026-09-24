import { useEffect, useState } from 'react';
import SocialProfileModal from '../social/SocialProfileModal';
import { followUser, unfollowUser, getFollowing } from '../../data/follows';

// Profilo aperto cliccando una "@menzione" in qualunque punto dell'app
// (chat, Stanza MOD...): lo stesso SocialProfileModal del feed, con il
// proprio elenco di "seguiti" per il pulsante Segui.
export default function MentionProfileViewer({ userId, user, onOpenAuth, onClose }) {
  const [following, setFollowing] = useState([]);

  useEffect(() => {
    if (!user) return;
    getFollowing().then((list) => setFollowing(Array.isArray(list) ? list : []));
  }, [user]);

  const toggleFollow = async (id) => {
    if (!user) return onOpenAuth?.();
    const isFollowing = following.includes(id);
    const { error } = isFollowing ? await unfollowUser(id) : await followUser(id);
    if (error) return;
    setFollowing((prev) => (isFollowing ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <SocialProfileModal
      userId={userId}
      user={user}
      following={following}
      onToggleFollow={toggleFollow}
      onOpenAuth={onOpenAuth}
      onClose={onClose}
    />
  );
}
