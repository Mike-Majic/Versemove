import EmptyState from '../../EmptyState';
import { COSPLAY_POST_TAGS } from '../../../data/cosplay';

// Galleria / WIP / Community: in costruzione (vedi parte 4).
export default function CosplayFeed({ tag }) {
  const info = COSPLAY_POST_TAGS[tag];
  return <EmptyState icon={info?.icon ?? '🎭'} title={`${info?.label ?? 'Scheda'} in arrivo`} subtitle="Presto qui." />;
}
