import { useMemo } from 'react';
import './ParticleBurst.css';

const PARTICLE_COUNT = 36;

// Genera una volta sola le proprietà casuali di ogni particella (posizione
// di partenza dentro al pannello, direzione/distanza di volo, ritardo) —
// mai ricalcolate ad ogni render, altrimenti l'esplosione "salterebbe"
// mentre l'animazione CSS è in corso.
function makeParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 140;
    return {
      key: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      dx: `${Math.cos(angle) * distance}px`,
      dy: `${Math.sin(angle) * distance}px`,
      delay: `${Math.random() * 90}ms`,
      size: 3 + Math.random() * 4,
    };
  });
}

// Chiusura "in particelle" di un pannello (Fase 2d): al posto di sparire di
// scatto, un pugno di frammenti colorati (--accent del mondo/pannello
// ospitante) vola via dal pannello mentre lui stesso si dissolve (vedi
// .closing in TwoColumnSwitcher.css). `active` false = niente nel DOM,
// nessun costo quando il pannello è aperto normalmente.
export default function ParticleBurst({ active }) {
  const particles = useMemo(() => (active ? makeParticles() : []), [active]);
  if (!active) return null;
  return (
    <div className="rb-particle-burst active" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.key}
          className="rb-particle"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            '--dx': p.dx,
            '--dy': p.dy,
            '--delay': p.delay,
          }}
        />
      ))}
    </div>
  );
}
