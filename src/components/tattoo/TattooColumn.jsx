import TwoColumnSwitcher from '../layout/TwoColumnSwitcher';
import TattooFeed from './TattooFeed';
import TattooRightPanel from './TattooRightPanel';
import './tattoo.css';

// Categoria "Tattoo" del mondo Social: stesso guscio a due colonne delle
// altre categorie (TwoColumnSwitcher — desktop affiancate, mobile due
// schede), sinistra = feed, destra = Mappa/Raccolta (vedi
// TattooRightPanel per il cambio di scheda interno a destra).
export default function TattooColumn({ user, onOpenAuth, isClosing = false }) {
  return (
    <TwoColumnSwitcher
      primary={<TattooFeed user={user} onOpenAuth={onOpenAuth} />}
      secondary={<TattooRightPanel user={user} onOpenAuth={onOpenAuth} />}
      primaryLabel="Feed"
      secondaryLabel="Mappa e Raccolta"
      closing={isClosing}
    />
  );
}
