import { lazy } from 'react';

// Caricamento "a pezzi" (code splitting) resistente ai deploy: quando il sito
// viene ripubblicato, i file JS cambiano nome. Una scheda rimasta aperta, o una
// pagina servita dal service worker, può quindi chiedere un chunk che non
// esiste più: l'import fallisce, React smonta tutto e resta lo schermo nero.
//
// Qui l'import viene ritentato una volta (rete ballerina) e, se fallisce
// ancora, la pagina si ricarica UNA sola volta — al secondo giro prende
// l'index aggiornato con i nomi giusti. Il flag in sessionStorage evita il
// ciclo infinito di ricariche se il problema fosse un altro.
const RELOAD_FLAG = 'rb-chunk-reloaded';

export function isChunkLoadError(error) {
  const msg = String(error?.message ?? error ?? '');
  return (
    /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError|error loading dynamically/i.test(msg)
  );
}

export function reloadOnceForChunkError() {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return false;
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    // sessionStorage non disponibile (navigazione privata): si ricarica comunque.
  }
  window.location.reload();
  return true;
}

export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // niente da fare
  }
}

export function lazyWithRetry(importer) {
  return lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      if (!isChunkLoadError(error)) throw error;
      await new Promise((r) => setTimeout(r, 600));
      try {
        return await importer();
      } catch (retryError) {
        if (reloadOnceForChunkError()) {
          // La pagina si sta ricaricando: restituisce un componente vuoto per
          // non far esplodere React nel frattempo.
          return { default: () => null };
        }
        throw retryError;
      }
    }
  });
}
