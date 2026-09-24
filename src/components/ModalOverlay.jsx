import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UnsavedChangesContext, useUnsavedChangesRegistry } from '../hooks/useUnsavedChanges';
import { nextLayerOrder, useBackLayer } from '../hooks/useBackLayer';
import { useGlobeCover } from '../fx/globeCover';

// Sfondo condiviso da tutti i pannelli a comparsa.
//
// Chiusura: un clic sullo sfondo (fuori dalla card) o il tasto Esc
// chiamano onClose, come la ✕. Il clic conta solo se il pointerdown e il
// pointerup sono avvenuti ENTRAMBI sullo sfondo stesso: una selezione di
// testo iniziata dentro la card e finita fuori non chiude niente. La card
// può continuare a fermare la propagazione del click
// (onClick={(e) => e.stopPropagation()}): qui si guardano i pointer event
// e si confronta e.target con e.currentTarget, quindi non cambia nulla.
// Senza onClose lo sfondo resta inerte.
//
// Protezione dei moduli (la ragione per cui prima lo sfondo non chiudeva
// mai nulla): se il pannello ha modifiche non salvate — prop
// hasUnsavedChanges, oppure una scheda interna che le segnala con
// useFormDirty/useReportUnsaved (vedi hooks/useUnsavedChanges.js) — il
// clic fuori e l'Esc non chiudono subito: compare una piccola conferma "Hai
// modifiche non salvate. Chiudere lo stesso?" con [Chiudi] e [Resta]. La ✕
// e i pulsanti espliciti del pannello restano come sono.
//
// Esc agisce solo sul pannello aperto più di recente (quello in cima): un
// modale di conferma aperto sopra "Il mio profilo" si chiude da solo senza
// portarsi dietro il pannello sotto.
//
// Tasto Indietro del telefono: ogni pannello è un livello della pila di
// hooks/useBackLayer.js. Indietro fa come il clic fuori (stessa conferma se
// ci sono modifiche); se la conferma è già a schermo, Indietro vale "Resta".
//
// Portato con createPortal dentro .rb-app (mai document.body: lì sopra
// perderebbe --accent, impostato proprio su .rb-app — vedi App.jsx) invece
// di renderizzare nel punto esatto dell'albero React in cui viene
// chiamato: un pannello categoria (Musica, Cinema, Cani...) si centra con
// `left: 50%; transform: translateX(-50%)`, e un transform su un
// antenato crea un nuovo containing block per i discendenti
// "position: fixed" — questo overlay (fixed, inset:0) finiva quindi
// confinato dentro i bordi di quel pannello invece di coprire tutto lo
// schermo (bug osservato: il modulo "Aggiungi luogo" di Cani appariva
// schiacciato e tagliato). Il portal scavalca il problema alla radice,
// qualunque antenato lo richiami.

// Pannelli aperti, per sapere quale è in cima quando si preme Esc. Il
// numero viene assegnato al primo render: un genitore renderizza sempre
// prima dei figli, quindi un modale annidato ha un numero più alto (è lo
// stesso numero d'ordine usato dalla pila del tasto Indietro).
const openOverlays = new Set();
const topOverlay = () => Math.max(...openOverlays);

export default function ModalOverlay({ className = 'rb-modal-overlay', children, onClose, hasUnsavedChanges = false }) {
  const [seq] = useState(nextLayerOrder);
  const { anyDirty, report } = useUnsavedChangesRegistry();
  const dirty = hasUnsavedChanges || anyDirty;
  const [confirming, setConfirming] = useState(false);
  const downOnBackdrop = useRef(false);

  const latest = useRef({ onClose, dirty, confirming });
  useEffect(() => {
    latest.current = { onClose, dirty, confirming };
  });

  // true se il pannello si è chiuso davvero (serve al tasto Indietro).
  const requestClose = useCallback(() => {
    const { onClose: close, dirty: isDirty } = latest.current;
    if (!close) return false;
    if (isDirty) {
      setConfirming(true);
      return false;
    }
    close();
    return true;
  }, []);

  useBackLayer(true, onClose, 'modal', {
    order: seq,
    onBack: () => {
      if (latest.current.confirming) {
        setConfirming(false);
        return false;
      }
      return requestClose();
    },
  });

  // Il pannello copre il mappamondo: dietro basta ~10 fps.
  useGlobeCover('covered');

  useEffect(() => {
    openOverlays.add(seq);
    return () => {
      openOverlays.delete(seq);
    };
  }, [seq]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || topOverlay() !== seq) return;
      e.preventDefault();
      if (confirming) setConfirming(false);
      else requestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [seq, confirming, requestClose]);

  const target = document.querySelector('.rb-app') ?? document.body;
  return createPortal(
    <div
      className={className}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onPointerUp={(e) => {
        const wasDown = downOnBackdrop.current;
        downOnBackdrop.current = false;
        if (wasDown && e.target === e.currentTarget) requestClose();
      }}
    >
      <UnsavedChangesContext.Provider value={report}>{children}</UnsavedChangesContext.Provider>
      {confirming && (
        <div className="rb-modal-unsaved-backdrop" onClick={() => setConfirming(false)}>
          <div className="rb-modal-unsaved-confirm" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p>Hai modifiche non salvate. Chiudere lo stesso?</p>
            <div className="rb-modal-unsaved-actions">
              <button
                type="button"
                className="rb-modal-unsaved-close"
                onClick={() => {
                  setConfirming(false);
                  latest.current.onClose?.();
                }}
              >
                Chiudi
              </button>
              <button type="button" onClick={() => setConfirming(false)} autoFocus>
                Resta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    target,
  );
}
