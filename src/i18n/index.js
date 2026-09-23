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
//
// Solo le prime 5 (it/en/es/fr/de) hanno anche l'interfaccia del sito
// tradotta (file in ./locales): sono le "lingue di interfaccia". Le altre
// ~75 servono SOLO a due cose — scegliere in quale lingua tradurre i
// post/DM al volo (TranslateHint) ed etichettare correttamente la lingua
// in cui un utente scrive (posts.lingua/chat_messages.lingua) — non hanno
// un file di traduzione dedicato: se selezionate, l'interfaccia del sito
// resta in inglese (fallbackLng qui sotto), come da richiesta esplicita di
// Mike (niente traduzione manuale dell'interfaccia in 80 lingue, solo
// traduzione dei messaggi).
export const SUPPORTED_LANGUAGES = [
  { code: 'it', nativeLabel: 'Italiano', flag: '🇮🇹' },
  { code: 'en', nativeLabel: 'English', flag: '🇬🇧' },
  { code: 'es', nativeLabel: 'Español', flag: '🇪🇸' },
  { code: 'fr', nativeLabel: 'Français', flag: '🇫🇷' },
  { code: 'de', nativeLabel: 'Deutsch', flag: '🇩🇪' },
  // --- solo traduzione messaggi, interfaccia in inglese di fallback ---
  { code: 'zh', nativeLabel: '中文', flag: '🇨🇳' },
  { code: 'ja', nativeLabel: '日本語', flag: '🇯🇵' },
  { code: 'ko', nativeLabel: '한국어', flag: '🇰🇷' },
  { code: 'pt', nativeLabel: 'Português', flag: '🇵🇹' },
  { code: 'ru', nativeLabel: 'Русский', flag: '🇷🇺' },
  { code: 'ar', nativeLabel: 'العربية', flag: '🇸🇦' },
  { code: 'hi', nativeLabel: 'हिन्दी', flag: '🇮🇳' },
  { code: 'nl', nativeLabel: 'Nederlands', flag: '🇳🇱' },
  { code: 'sv', nativeLabel: 'Svenska', flag: '🇸🇪' },
  { code: 'no', nativeLabel: 'Norsk', flag: '🇳🇴' },
  { code: 'da', nativeLabel: 'Dansk', flag: '🇩🇰' },
  { code: 'fi', nativeLabel: 'Suomi', flag: '🇫🇮' },
  { code: 'pl', nativeLabel: 'Polski', flag: '🇵🇱' },
  { code: 'tr', nativeLabel: 'Türkçe', flag: '🇹🇷' },
  { code: 'el', nativeLabel: 'Ελληνικά', flag: '🇬🇷' },
  { code: 'cs', nativeLabel: 'Čeština', flag: '🇨🇿' },
  { code: 'sk', nativeLabel: 'Slovenčina', flag: '🇸🇰' },
  { code: 'hu', nativeLabel: 'Magyar', flag: '🇭🇺' },
  { code: 'ro', nativeLabel: 'Română', flag: '🇷🇴' },
  { code: 'bg', nativeLabel: 'Български', flag: '🇧🇬' },
  { code: 'uk', nativeLabel: 'Українська', flag: '🇺🇦' },
  { code: 'hr', nativeLabel: 'Hrvatski', flag: '🇭🇷' },
  { code: 'sr', nativeLabel: 'Српски', flag: '🇷🇸' },
  { code: 'sl', nativeLabel: 'Slovenščina', flag: '🇸🇮' },
  { code: 'et', nativeLabel: 'Eesti', flag: '🇪🇪' },
  { code: 'lv', nativeLabel: 'Latviešu', flag: '🇱🇻' },
  { code: 'lt', nativeLabel: 'Lietuvių', flag: '🇱🇹' },
  { code: 'he', nativeLabel: 'עברית', flag: '🇮🇱' },
  { code: 'th', nativeLabel: 'ไทย', flag: '🇹🇭' },
  { code: 'vi', nativeLabel: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'id', nativeLabel: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'ms', nativeLabel: 'Bahasa Melayu', flag: '🇲🇾' },
  { code: 'tl', nativeLabel: 'Filipino', flag: '🇵🇭' },
  { code: 'bn', nativeLabel: 'বাংলা', flag: '🇧🇩' },
  { code: 'ur', nativeLabel: 'اردو', flag: '🇵🇰' },
  { code: 'fa', nativeLabel: 'فارسی', flag: '🇮🇷' },
  { code: 'sw', nativeLabel: 'Kiswahili', flag: '🇰🇪' },
  { code: 'am', nativeLabel: 'አማርኛ', flag: '🇪🇹' },
  { code: 'ha', nativeLabel: 'Hausa', flag: '🇳🇬' },
  { code: 'yo', nativeLabel: 'Yorùbá', flag: '🇳🇬' },
  { code: 'zu', nativeLabel: 'isiZulu', flag: '🇿🇦' },
  { code: 'af', nativeLabel: 'Afrikaans', flag: '🇿🇦' },
  { code: 'ta', nativeLabel: 'தமிழ்', flag: '🇮🇳' },
  { code: 'te', nativeLabel: 'తెలుగు', flag: '🇮🇳' },
  { code: 'mr', nativeLabel: 'मराठी', flag: '🇮🇳' },
  { code: 'gu', nativeLabel: 'ગુજરાતી', flag: '🇮🇳' },
  { code: 'kn', nativeLabel: 'ಕನ್ನಡ', flag: '🇮🇳' },
  { code: 'ml', nativeLabel: 'മലയാളം', flag: '🇮🇳' },
  { code: 'pa', nativeLabel: 'ਪੰਜਾਬੀ', flag: '🇮🇳' },
  { code: 'si', nativeLabel: 'සිංහල', flag: '🇱🇰' },
  { code: 'ne', nativeLabel: 'नेपाली', flag: '🇳🇵' },
  { code: 'my', nativeLabel: 'မြန်မာဘာသာ', flag: '🇲🇲' },
  { code: 'km', nativeLabel: 'ខ្មែរ', flag: '🇰🇭' },
  { code: 'lo', nativeLabel: 'ລາວ', flag: '🇱🇦' },
  { code: 'ka', nativeLabel: 'ქართული', flag: '🇬🇪' },
  { code: 'hy', nativeLabel: 'Հայերեն', flag: '🇦🇲' },
  { code: 'az', nativeLabel: 'Azərbaycanca', flag: '🇦🇿' },
  { code: 'kk', nativeLabel: 'Қазақша', flag: '🇰🇿' },
  { code: 'uz', nativeLabel: "O'zbekcha", flag: '🇺🇿' },
  { code: 'mn', nativeLabel: 'Монгол', flag: '🇲🇳' },
  { code: 'is', nativeLabel: 'Íslenska', flag: '🇮🇸' },
  { code: 'ga', nativeLabel: 'Gaeilge', flag: '🇮🇪' },
  { code: 'cy', nativeLabel: 'Cymraeg', flag: '🇬🇧' },
  { code: 'mt', nativeLabel: 'Malti', flag: '🇲🇹' },
  { code: 'sq', nativeLabel: 'Shqip', flag: '🇦🇱' },
  { code: 'mk', nativeLabel: 'Македонски', flag: '🇲🇰' },
  { code: 'bs', nativeLabel: 'Bosanski', flag: '🇧🇦' },
  { code: 'be', nativeLabel: 'Беларуская', flag: '🇧🇾' },
  { code: 'ky', nativeLabel: 'Кыргызча', flag: '🇰🇬' },
  { code: 'tg', nativeLabel: 'Тоҷикӣ', flag: '🇹🇯' },
  { code: 'tk', nativeLabel: 'Türkmençe', flag: '🇹🇲' },
  { code: 'ps', nativeLabel: 'پښتو', flag: '🇦🇫' },
  { code: 'so', nativeLabel: 'Soomaali', flag: '🇸🇴' },
  { code: 'ca', nativeLabel: 'Català', flag: '🇪🇸' },
  { code: 'eu', nativeLabel: 'Euskara', flag: '🇪🇸' },
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
