import { useLayoutEffect, useRef, useState } from 'react';
import './LabelMorphTitle.css';

// "L'etichetta diventa il titolo" (Fase 2c): quando il pannello si apre a
// volo di camera finito (vedi flyToCategoryThenOpen in App.jsx), la camera
// è appena arrivata centrata sulla categoria — la sua etichetta 3D sul
// globo era quindi, un attimo prima, vicina al centro dello schermo. Un
// FLIP manuale (non la View Transition API: qui si parte da un punto dentro
// al canvas WebGL, non da un altro elemento DOM, quindi non c'è un secondo
// elemento con cui la API possa accoppiarsi) porta un "fantasma" di testo
// da lì fino al titolo vero, che nel frattempo resta invisibile.
// morphFromCenter=false (aperture senza volo, es. da una ricerca) salta il
// FLIP: il titolo compare con un fade-in leggero, senza fantasma.
export default function LabelMorphTitle({ text, morphFromCenter = false, as: Tag = 'h3', className = '' }) {
  const titleRef = useRef(null);
  const ghostRef = useRef(null);
  const [morphing, setMorphing] = useState(morphFromCenter);

  useLayoutEffect(() => {
    if (!morphFromCenter || !titleRef.current || !ghostRef.current) return undefined;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setMorphing(false);
      return undefined;
    }

    const titleRect = titleRef.current.getBoundingClientRect();
    const ghost = ghostRef.current;
    const originX = window.innerWidth / 2;
    const originY = window.innerHeight / 2;
    const startScale = 0.5;
    const dx = originX - (titleRect.left + titleRect.width / 2);
    const dy = originY - (titleRect.top + titleRect.height / 2);

    ghost.style.transition = 'none';
    ghost.style.left = `${titleRect.left + titleRect.width / 2}px`;
    ghost.style.top = `${titleRect.top + titleRect.height / 2}px`;
    ghost.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${startScale})`;

    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        ghost.style.transition = 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)';
        ghost.style.transform = 'translate(-50%, -50%) translate(0px, 0px) scale(1)';
      });
    });

    const timer = window.setTimeout(() => setMorphing(false), 440);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Tag ref={titleRef} className={className} style={morphing ? { opacity: 0 } : undefined}>
        {text}
      </Tag>
      {morphFromCenter && morphing && (
        <span ref={ghostRef} className="rb-label-morph-ghost" aria-hidden="true">
          {text}
        </span>
      )}
    </>
  );
}
