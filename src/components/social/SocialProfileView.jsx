import { familyRelationLabel } from '../../data/family';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { birthdayLabel } from '../../data/zodiac';
import GamertagChips from '../shared/GamertagChips';
import AvatarImg from '../shared/AvatarImg';
import './SocialProfileModal.css';

const GENDER_LABELS = { uomo: 'Uomo', donna: 'Donna', non_binario: 'Non binario', preferisco_non_dire: 'Preferisco non dire' };
const STATO_LABELS = {
  single: 'Single',
  fidanzato_a: 'Fidanzato/a',
  sposato_a: 'Sposato/a',
  unione_civile: 'Unione civile',
  convivente: 'Convivente',
  complicato: "È complicato",
};

// Profilo Social come lo vedono gli altri: testata (avatar, nome, città),
// bio, gamertag, informazioni e familiari. Usato dal profilo pubblico
// (SocialProfileModal, con Segui e condividi in `actions`) e dall'anteprima
// di Il mio profilo (senza azioni). I campi vuoti non compaiono.
export default function SocialProfileView({ profile, gamertags, family = [], actions = null }) {
  return (
    <>
      <div className="rb-social-profile-head">
        <AvatarImg src={profile.avatar} name={profile?.name || profile?.nickname} seed={profile?.id} alt={profile.name} />
        <div>
          <strong>{profile.name}</strong>
          {profile.citta && <span className="rb-social-profile-city">{profile.citta}</span>}
        </div>
        {actions}
      </div>

      {profile.bio && <p className="rb-social-profile-bio">{profile.bio}</p>}
      <GamertagChips gamertags={gamertags} />

      {(profile.cittaOrigine || profile.statoRelazionale || profile.genere || profile.pronomi || profile.zodiaco || profile.lingueParlate?.length > 0) && (
        <ul className="rb-social-profile-info-list">
          {profile.cittaOrigine && <li>🏠 Di {profile.cittaOrigine}</li>}
          {(profile.zodiaco || (profile.giornoNascita && profile.meseNascita)) && (
            <li>
              {profile.giornoNascita && profile.meseNascita && `🎂 ${birthdayLabel(profile.giornoNascita, profile.meseNascita)}`}
              {profile.giornoNascita && profile.meseNascita && profile.zodiaco && ' '}
              {profile.zodiaco && `${profile.zodiaco.emoji} ${profile.zodiaco.name}`}
            </li>
          )}
          {profile.statoRelazionale && <li>💞 {STATO_LABELS[profile.statoRelazionale] ?? profile.statoRelazionale}</li>}
          {(profile.genere || profile.pronomi) && (
            <li>
              ⚧ {GENDER_LABELS[profile.genere] ?? profile.genere}{profile.pronomi ? ` · ${profile.pronomi}` : ''}
            </li>
          )}
          {profile.lingueParlate?.length > 0 && (
            <li>
              🗣️ {profile.lingueParlate.map((code) => SUPPORTED_LANGUAGES.find((l) => l.code === code)?.nativeLabel ?? code).join(', ')}
            </li>
          )}
        </ul>
      )}

      {family.length > 0 && (
        <div className="rb-social-profile-family">
          <span className="rb-social-profile-family-title">Familiari</span>
          <ul className="rb-social-profile-family-list">
            {family.map((f) => (
              <li key={f.linkId}>
                <AvatarImg src={f.other.avatar} name={f.other?.name || f.other?.nickname} seed={f.other?.id} alt="" />
                <span>{f.other.name}</span>
                <span className="rb-social-profile-family-relation">{familyRelationLabel(f.relazione)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
