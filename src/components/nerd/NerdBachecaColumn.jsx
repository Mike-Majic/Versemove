import GamingFeed from './gaming/GamingFeed';
import './videoRooms.css';
import './gaming/gaming.css';

// Bacheca del mondo Nerd (categoria "bacheca"): tutti i post con
// mondo = 'nerd' — quelli delle categorie gaming compaiono col chip
// "Gaming PC · Build" (PostCard) — più i post liberi scritti da qui.
// Stesso pannello e stesso feed delle schede gaming, senza categoria né
// tag.
export default function NerdBachecaColumn({ user, onOpenAuth }) {
  return (
    <div className="rb-vroom-panel rb-gaming-panel" aria-label="Bacheca del mondo Nerd">
      <GamingFeed category={null} platform={null} tag={null} user={user} onOpenAuth={onOpenAuth} />
    </div>
  );
}
