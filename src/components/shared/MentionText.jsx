import { Fragment, useEffect, useState } from 'react';
import { fetchMentionProfiles, openProfileFromMention } from '../../data/mentions';
import './mentions.css';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Testo con le menzioni evidenziate in azzurro: solo le "@Nickname" dei
// profili in menzioni (quelli che il server ha tenuto), cliccabili per
// aprire il profilo. Un "@qualcosa" scritto a mano che non è una menzione
// valida resta testo normale.
export default function MentionText({ testo, menzioni, onOpenProfile, className, as: Tag = 'span' }) {
  const [profiles, setProfiles] = useState(null);
  const key = (menzioni ?? []).join(',');

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    fetchMentionProfiles(key.split(',')).then((map) => {
      if (!cancelled) setProfiles(map);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const text = testo ?? '';
  if (!key || !profiles || profiles.size === 0) return <Tag className={className}>{text}</Tag>;

  const byName = new Map();
  profiles.forEach((p, id) => byName.set(`@${p.name}`, id));
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp(`(${names.join('|')})`, 'g');
  const parts = text.split(re);
  return (
    <Tag className={className}>
      {parts.map((part, i) => {
        const id = byName.get(part);
        if (!id) return <Fragment key={i}>{part}</Fragment>;
        return (
          <button
            key={i}
            type="button"
            className="rb-mention"
            onClick={(e) => {
              e.stopPropagation();
              (onOpenProfile ?? openProfileFromMention)(id);
            }}
          >
            {part}
          </button>
        );
      })}
    </Tag>
  );
}
