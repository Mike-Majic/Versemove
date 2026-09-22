import { useEffect, useState } from 'react';
import { listPosts } from '../../data/tattoo';
import { STILI_TATUAGGIO, PARTI_CORPO } from '../../data/tattooMeta';
import TattooPostCard from './TattooPostCard';
import TattooSubmitModal from './TattooSubmitModal';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';
import CustomSelect from '../shared/CustomSelect';
import './tattoo.css';

const STILE_OPTIONS = [{ value: '', label: 'Tutti gli stili' }, ...STILI_TATUAGGIO.map((s) => ({ value: s, label: s }))];
const PARTE_OPTIONS = [{ value: '', label: 'Tutto il corpo' }, ...PARTI_CORPO.map((p) => ({ value: p, label: p }))];
const COLORE_OPTIONS = [
  { value: '', label: 'Colore e b/n' },
  { value: 'colore', label: 'Solo colore' },
  { value: 'bn', label: 'Solo bianco e nero' },
];
const VOTO_OPTIONS = [
  { value: '', label: 'Qualsiasi voto' },
  { value: '3', label: '★3 e più' },
  { value: '4', label: '★4 e più' },
];
const ORDER_OPTIONS = [
  { value: 'recenti', label: 'Più recenti' },
  { value: 'votati', label: 'Più votati' },
];

// Colonna sinistra della categoria Tattoo: filtro (stesso pattern di
// CustomSelect di Cinema) + feed + pulsante di pubblicazione.
export default function TattooFeed({ user, onOpenAuth }) {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState('');
  const [stile, setStile] = useState('');
  const [parteCorpo, setParteCorpo] = useState('');
  const [coloreFiltro, setColoreFiltro] = useState('');
  const [votoMin, setVotoMin] = useState('');
  const [ordinamento, setOrdinamento] = useState('recenti');
  const [submitOpen, setSubmitOpen] = useState(false);

  const colore = coloreFiltro === 'colore' ? true : coloreFiltro === 'bn' ? false : undefined;

  const reload = () => {
    setPosts(null);
    setError('');
    listPosts({ stile: stile || undefined, parteCorpo: parteCorpo || undefined, colore, votoMin: votoMin ? Number(votoMin) : undefined, ordinamento })
      .then(setPosts)
      .catch(() => {
        setError('Impossibile caricare il feed ora.');
        setPosts([]);
      });
  };

  useEffect(reload, [stile, parteCorpo, colore, votoMin, ordinamento]);

  return (
    <div className="rb-tattoo-feed" style={{ '--accent': '#1d9bf0' }}>
      <div className="rb-tattoo-header">
        <div>
          <h3>🖋️ Tattoo</h3>
          <p>Foto di tatuaggi condivise dalla community, con studio e voto — segnala mai foto con volti altrui senza consenso.</p>
        </div>
        <button type="button" className="rb-btn-primary" onClick={() => (user ? setSubmitOpen(true) : onOpenAuth?.())}>
          + Pubblica
        </button>
      </div>

      <div className="rb-tattoo-filters">
        <CustomSelect value={stile} options={STILE_OPTIONS} onChange={setStile} ariaLabel="Stile" />
        <CustomSelect value={parteCorpo} options={PARTE_OPTIONS} onChange={setParteCorpo} ariaLabel="Parte del corpo" />
        <CustomSelect value={coloreFiltro} options={COLORE_OPTIONS} onChange={setColoreFiltro} ariaLabel="Colore" />
        <CustomSelect value={votoMin} options={VOTO_OPTIONS} onChange={setVotoMin} ariaLabel="Voto minimo" />
        <CustomSelect value={ordinamento} options={ORDER_OPTIONS} onChange={setOrdinamento} ariaLabel="Ordina per" />
      </div>

      {error && <p className="rb-tattoo-status rb-tattoo-error">{error}</p>}

      {posts === null ? (
        <ul className="rb-tattoo-list">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="rb-tattoo-card rb-tattoo-card-skeleton">
              <Skeleton height="220px" />
              <Skeleton lines={3} />
            </li>
          ))}
        </ul>
      ) : posts.length === 0 ? (
        <EmptyState
          icon="🖋️"
          title="Ancora nessun tatuaggio qui"
          subtitle="Sii il primo a pubblicarne uno, oppure allarga i filtri."
          actions={user ? [{ label: 'Pubblica un tatuaggio', onClick: () => setSubmitOpen(true), primary: true }] : []}
        />
      ) : (
        <ul className="rb-tattoo-list">
          {posts.map((post) => (
            <TattooPostCard key={post.id} post={post} user={user} onOpenAuth={onOpenAuth} />
          ))}
        </ul>
      )}

      {submitOpen && (
        <TattooSubmitModal
          onClose={() => setSubmitOpen(false)}
          onPublished={() => {
            setSubmitOpen(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
