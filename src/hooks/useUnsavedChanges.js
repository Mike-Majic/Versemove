import { createContext, useCallback, useContext, useEffect, useId, useState } from 'react';

// Modifiche non salvate dentro un pannello a comparsa (vedi
// ModalOverlay.jsx). Chi ha i valori del modulo nello stesso componente che
// disegna <ModalOverlay> passa direttamente la prop hasUnsavedChanges; i
// moduli annidati più in basso (le schede di "Il mio profilo", i form
// "Aggiungi esperienza"...) segnalano invece il loro stato con
// useFormDirty, che risale al ModalOverlay più vicino tramite questo
// contesto. Basta una sola scheda "sporca" perché tutto il pannello chieda
// conferma prima di chiudersi.
export const UnsavedChangesContext = createContext(null);

// Insieme delle schede che oggi hanno modifiche: lo usa ModalOverlay per
// fornire il contesto qui sopra.
export function useUnsavedChangesRegistry() {
  const [dirtyKeys, setDirtyKeys] = useState(() => new Set());
  const report = useCallback((key, dirty) => {
    setDirtyKeys((prev) => {
      if (prev.has(key) === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  return { anyDirty: dirtyKeys.size > 0, report };
}

// Segnala al ModalOverlay più vicino se questo pezzo di modulo ha
// modifiche. Quando il componente sparisce (scheda cambiata, form chiuso)
// la segnalazione viene ritirata.
export function useReportUnsaved(dirty) {
  const report = useContext(UnsavedChangesContext);
  const key = useId();
  useEffect(() => {
    if (!report) return undefined;
    report(key, dirty);
    return () => report(key, false);
  }, [report, key, dirty]);
}

// Confronta i valori attuali del modulo con quelli al primo render (o
// all'ultimo salvataggio riuscito: chiama markSaved() subito dopo). Serve
// quando il modulo non ha un "valore iniziale" comodo da riprendere dalle
// props (es. pronomi scelti da un preset). Non segnala niente a nessuno:
// è la versione da usare nel componente che disegna esso stesso il
// <ModalOverlay> (il contesto qui sopra appartiene all'overlay di un
// genitore, non al suo) e passa il risultato come hasUnsavedChanges.
export function useDirtySnapshot(values) {
  const current = JSON.stringify(values);
  const [baseline, setBaseline] = useState(current);
  const markSaved = useCallback(() => setBaseline(current), [current]);
  return [current !== baseline, markSaved];
}

// Come useDirtySnapshot, ma segnala anche lo stato al ModalOverlay che
// contiene questo componente: per le schede/form annidati in un pannello.
export function useFormDirty(values) {
  const [dirty, markSaved] = useDirtySnapshot(values);
  useReportUnsaved(dirty);
  return [dirty, markSaved];
}
