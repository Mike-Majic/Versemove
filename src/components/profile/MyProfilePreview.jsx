import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchProfilesMap } from '../../data/posts';
import { getFamily } from '../../data/family';
import { getMyCandidatoPreview } from '../../data/lavoro';
import { getDatingCard, getMyDatingProfile } from '../../data/incontri';
import { datingStatusText, missingItems } from '../../data/datingLabels';
import { cleanGamertags } from '../../data/gaming';
import SocialProfileView from '../social/SocialProfileView';
import CandidatoView from '../lavoro/CandidatoView';
import DatingProfileCard from '../incontri/DatingProfileCard';
import Skeleton from '../Skeleton';
import { PROFILE_TITLES } from '../../data/myProfile';
import '../incontri/DatingProfileEditor.css';
import './MyProfilePreview.css';

// Anteprima di uno dei tre profili in Il mio profilo: come ti vedono gli
// altri, in sola lettura. I dati si leggono dal server con le stesse viste
// usate per gli altri utenti (public_profiles per il Social, get_dating_card
// per Incontri; per Lavoro i propri dati, perché get_candidato_lavoro è
// riservata alle aziende). In fondo "Completa il profilo" se manca qualcosa.

function useLoad(loader, deps) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let cancelled = false;
    loader().then((res) => {
      if (!cancelled) setState({ loading: false, ...res });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function CompleteRow({ missing, onEdit }) {
  if (!missing.length) return null;
  return (
    <button type="button" className="rb-myprof-complete" onClick={onEdit}>
      <span>
        <strong>Completa il profilo</strong>
        <span className="rb-myprof-complete-list">Manca: {missing.join(', ')}</span>
      </span>
      <span aria-hidden="true">›</span>
    </button>
  );
}

function SocialPreview({ user, onEdit }) {
  const { loading, profile, family } = useLoad(async () => {
    const [map, fam] = await Promise.all([fetchProfilesMap([user.id]), getFamily(user.id)]);
    return { profile: map.get(user.id) ?? null, family: fam ?? [] };
  }, [user.id]);
  if (loading) return <Skeleton lines={4} />;
  if (!profile) return <p className="rb-myprof-msg">Anteprima non disponibile. Riprova tra poco.</p>;
  const gamertags = cleanGamertags(user.gamertags ?? {});
  const missing = [
    !profile.citta && 'città',
    !profile.bio && 'bio',
    !profile.cittaOrigine && "città d'origine",
    !profile.lingueParlate?.length && 'lingue',
    !Object.keys(gamertags).length && 'gamertag',
  ].filter(Boolean);
  return (
    <>
      <div className="rb-myprof-social">
        <SocialProfileView profile={profile} gamertags={gamertags} family={family} />
      </div>
      <CompleteRow missing={missing} onEdit={onEdit} />
    </>
  );
}

function LavoroPreview({ user, onEdit }) {
  const { t } = useTranslation();
  const { loading, error, candidato } = useLoad(getMyCandidatoPreview, [user.id]);
  if (loading) return <Skeleton lines={4} />;
  if (error) return <p className="rb-myprof-msg">{error}</p>;
  const c = candidato;
  const missing = [
    !c.citta && 'città',
    !c.bio && 'bio',
    !c.titoloStudio && 'titolo di studio',
    !c.lingueParlate.length && 'lingue',
    !c.esperienze.length && 'esperienze',
    !c.telefono && 'telefono',
    !c.cv && 'curriculum',
  ].filter(Boolean);
  return (
    <>
      {user.tipoAccount !== 'azienda' && (
        // Sempre visibile alle aziende verificate (niente più interruttore):
        // per non comparire si disattiva il mondo Lavoro.
        <p className="rb-myprof-status ok">● {t('lavoroVisibility.previewVisible')}</p>
      )}
      <div className="rb-myprof-lavoro">
        <CandidatoView candidato={c} data={c} hideEmpty />
      </div>
      <CompleteRow missing={missing} onEdit={onEdit} />
    </>
  );
}

function IncontriPreview({ user, onEdit }) {
  const { loading, error, profile, card } = useLoad(async () => {
    const [mine, dc] = await Promise.all([getMyDatingProfile(), getDatingCard(user.id)]);
    if (mine.error) return { error: mine.error };
    return { profile: mine.profile, card: dc.card ?? null };
  }, [user.id]);
  if (loading) return <Skeleton lines={4} />;
  if (error) return <p className="rb-myprof-msg">{error}</p>;
  if (!profile.idoneo) {
    return <p className="rb-myprof-msg">Il mondo Incontri non è attivo per il tuo account: riattivalo dalle Impostazioni (Mondi). È riservato ai maggiorenni.</p>;
  }
  const missing = missingItems(profile.mancano, profile.foto.length);
  return (
    <>
      <p className={`rb-dpe-status ${profile.visibile ? 'ok' : ''}`}>
        {profile.visibile ? '● ' : '○ '}
        {datingStatusText(profile)}
      </p>
      {card ? (
        <div className="rb-myprof-dating">
          <DatingProfileCard card={card} isSelf />
        </div>
      ) : (
        <p className="rb-myprof-msg">Anteprima della scheda non disponibile.</p>
      )}
      <CompleteRow missing={missing} onEdit={onEdit} />
    </>
  );
}

export default function MyProfilePreview({ profilo, user, onEdit, onClose }) {
  return (
    <div className="rb-myprof-preview">
      <div className="rb-myprof-head">
        <button type="button" className="rb-myprof-icon-btn" onClick={onEdit} aria-label={`Modifica ${PROFILE_TITLES[profilo]}`} title="Modifica">
          ✎
        </button>
        <div className="rb-myprof-title">
          <h2>Anteprima profilo</h2>
          <span>{PROFILE_TITLES[profilo]}</span>
        </div>
        <button type="button" className="rb-myprof-icon-btn" onClick={onClose} aria-label="Torna all'elenco dei profili" title="Chiudi">
          ✕
        </button>
      </div>
      <div className="rb-myprof-body">
        {profilo === 'social' && <SocialPreview user={user} onEdit={onEdit} />}
        {profilo === 'lavoro' && <LavoroPreview user={user} onEdit={onEdit} />}
        {profilo === 'incontri' && <IncontriPreview user={user} onEdit={onEdit} />}
      </div>
    </div>
  );
}
