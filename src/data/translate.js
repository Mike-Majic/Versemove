import { supabase } from './supabaseClient.js';

// Traduzione letterale in italiano di un testo, via la Edge Function
// "translate" (richiede un utente loggato, risponde 401 altrimenti — stessa
// logica di link-preview). Non altera username/menzioni/link, non aggiunge
// commenti: stesse regole del relay di traduzione usato da Jarvis su Discord.
// Lancia un errore con un messaggio in italiano pronto da mostrare in UI.
export async function translateText(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return trimmed;

  const { data, error } = await supabase.functions.invoke('translate', { body: { text: trimmed } });

  if (error) {
    const message = await extractFunctionErrorMessage(error);
    throw new Error(message ?? 'Traduzione non disponibile al momento.');
  }

  if (!data?.translatedText) {
    throw new Error('Traduzione non disponibile al momento.');
  }

  return data.translatedText;
}

// supabase-js espone i dettagli dell'errore (incluso il messaggio scritto
// dalla Edge Function, es. "Accedi per usare la traduzione") solo dentro la
// Response originale della chiamata fallita, non nel messaggio generico di
// FunctionsHttpError: va riletta esplicitamente.
async function extractFunctionErrorMessage(error) {
  try {
    const body = await error.context?.json();
    return typeof body?.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}
