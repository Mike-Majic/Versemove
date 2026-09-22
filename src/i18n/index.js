import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import it from './locales/it';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import de from './locales/de';

// Lingue supportate: id ISO 639-1 usato ovunque nell'app (select di
// registrazione/Impostazioni, colonna profiles.lingua quando Cowork la
// crea — vedi commento in AuthModal.jsx) più un'etichetta leggibile nella
// SUA STESSA lingua (mai tradotta: chi non legge ancora l'italiano deve
// comunque riconoscere la propria voce nel menu).
export const SUPPORTED_LANGUAGES = [
  { code: 'it', nativeLabel: 'Italiano', flag: '🇮🇹' },
  { code: 'en', nativeLabel: 'English', flag: '🇬🇧' },
  { code: 'es', nativeLabel: 'Español', flag: '🇪🇸' },
  { code: 'fr', nativeLabel: 'Français', flag: '🇫🇷' },
  { code: 'de', nativeLabel: 'Deutsch', flag: '🇩🇪' },
];

// Chiave localStorage per la preferenza scelta esplicitamente (non quella
// rilevata dal browser, che i18next-browser-languagedetector gestisce da
// sé con la sua propria chiave): serve per sapere se applicare la lingua
// salvata sul PROFILO (una volta che Cowork avrà creato la colonna) sopra
// a quella del dispositivo, o viceversa — vedi setAppLanguage sotto.
const STORAGE_KEY = 'rb-language';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      it: { translation: it },
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      de: { translation: de },
    },
    // Dove manca una chiave in una lingua, l'inglese (non l'italiano: una
    // persona che ha scelto spagnolo o francese leggerebbe comunque
    // italiano a caso, l'inglese è la scelta meno spiazzante quando la
    // traduzione non è ancora arrivata — richiesta esplicita).
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    nonExplicitSupportedLngs: true,
    detection: {
      // Prima la scelta esplicita salvata su QUESTO dispositivo, poi la
      // lingua del browser, mai <html lang> (non lo tocca nessuno qui) né
      // un cookie: coerente con come il resto dell'app salva le
      // preferenze (localStorage, vedi filters/visibility in App.jsx).
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  });

// <html lang> segue sempre la lingua attiva: serve a lettori di schermo,
// traduttori automatici e SEO, e prima non veniva mai toccato (restava
// sempre "it" anche cambiando lingua dalle Impostazioni).
function syncHtmlLang(lng) {
  if (lng) document.documentElement.lang = lng;
}
syncHtmlLang(i18n.language);
i18n.on('languageChanged', syncHtmlLang);

// Cambia lingua e la ricorda su questo dispositivo. Chiamata sia dal
// selettore in registrazione sia da quello nelle Impostazioni — la
// preferenza viene salvata anche su profiles.lingua (setOwnLingua, vedi
// data/accounts.js) così segue l'account e non resta legata al singolo
// dispositivo/browser.
export function setAppLanguage(code) {
  i18n.changeLanguage(code);
}

export default i18n;
