// Icone a linea dell'interfaccia ("stile D"): tratto sottile, nessun
// riempimento, colore ereditato dal testo (currentColor) — così seguono da
// sole il colore del mondo attivo. Sostituiscono le emoji usate come icone
// nei pulsanti, che cambiavano aspetto da dispositivo a dispositivo (su
// Windows piatte, su iPhone tonde...) e facevano sembrare l'app datata.
//
// Le emoji restano dove sono contenuto vero: reazioni, testo dei messaggi,
// pannello di scelta emoji.
//
// Uso: <Icon name="bell" /> oppure <Icon name="camera" size={20} />

const PATHS = {
  smile: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.4c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8" />
      <path d="M9 9.6h.01M15 9.6h.01" />
    </>
  ),
  camera: (
    <>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7l1.2-1.8h6.2L15.8 6h2.7A2.5 2.5 0 0 1 21 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z" />
      <circle cx="12" cy="12.4" r="3.4" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="8.5" cy="10" r="1.6" />
      <path d="M4 17l4.5-4.2 3 2.6 3.2-3.4L20 17" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 1 0-12 0c0 4.2-1.5 5.6-2 6.2-.3.3 0 .8.4.8h15.2c.4 0 .7-.5.4-.8-.5-.6-2-2-2-6.2" />
      <path d="M10 19.2a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  chat: <path d="M20.5 11.8c0 3.8-3.8 6.9-8.5 6.9-1 0-2-.1-2.9-.4L4 20l1.3-3.3C4.2 15.4 3.5 13.7 3.5 11.8c0-3.8 3.8-6.9 8.5-6.9s8.5 3.1 8.5 6.9" />,
  tools: (
    <>
      <path d="M14.8 6.3a3.8 3.8 0 0 1 5 5l-9.3 9.3a2 2 0 0 1-2.8-2.8z" />
      <path d="M13.4 7.7l2.9 2.9" />
      <path d="M6.6 3.5l1 2.1 2.1 1-2.1 1-1 2.1-1-2.1-2.1-1 2.1-1z" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14.2a1.5 1.5 0 0 0 .3 1.6l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-2.5 1v.3a1.8 1.8 0 1 1-3.6 0v-.2a1.5 1.5 0 0 0-2.6-1l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0-1-2.5h-.3a1.8 1.8 0 1 1 0-3.6h.2a1.5 1.5 0 0 0 1-2.6l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 2.5-1v-.3a1.8 1.8 0 1 1 3.6 0v.2a1.5 1.5 0 0 0 2.6 1l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0 1 2.5h.3a1.8 1.8 0 1 1 0 3.6h-.2a1.5 1.5 0 0 0-1.4.9" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6.5" width="12.5" height="11" rx="2.5" />
      <path d="M15.5 10.8 21 8v8l-5.5-2.8z" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  send: (
    <>
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3 14.5 21l-4-7.5L3 9.5z" />
    </>
  ),
  paperclip: <path d="M20 11.5 12.3 19a4.6 4.6 0 0 1-6.5-6.5l7.9-7.9a3.1 3.1 0 0 1 4.4 4.4l-7.9 7.9a1.6 1.6 0 0 1-2.2-2.2l7.1-7.1" />,
  pin: (
    <>
      <path d="M12 21s6.5-5.6 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.4 12 21 12 21" />
      <circle cx="12" cy="10.6" r="2.4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  heart: <path d="M12 20s-7.5-4.4-7.5-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.5 2.6c0 5-7.5 9.4-7.5 9.4" />,
  star: <path d="m12 4 2.5 5 5.5.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9L9.5 9z" />,
  flag: (
    <>
      <path d="M6 20V5" />
      <path d="M6 5.5h10.5l-1.8 3.2 1.8 3.3H6" />
    </>
  ),
  bulb: (
    <>
      <path d="M9.4 16.5a5.5 5.5 0 1 1 5.2 0" />
      <path d="M9.6 19h4.8M10.4 21.2h3.2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.2M12 7.9h.01" />
    </>
  ),
  shield: <path d="M12 3.2 5 6v5.5c0 4.2 3 7.4 7 9.3 4-1.9 7-5.1 7-9.3V6z" />,
  download: (
    <>
      <path d="M12 4v10.5" />
      <path d="m7.8 10.6 4.2 4.2 4.2-4.2" />
      <path d="M5 19h14" />
    </>
  ),
  back: <path d="M15 5.5 8 12l7 6.5" />,
  link: (
    <>
      <path d="M10.2 13.8a3.6 3.6 0 0 0 5.1 0l3.2-3.2a3.6 3.6 0 0 0-5.1-5.1l-1.1 1.1" />
      <path d="M13.8 10.2a3.6 3.6 0 0 0-5.1 0l-3.2 3.2a3.6 3.6 0 0 0 5.1 5.1l1.1-1.1" />
    </>
  ),
  bookmark: <path d="M6.5 4.5h11v15.5L12 16.2 6.5 20z" />,
  pencil: (
    <>
      <path d="M15.6 5.2a2.1 2.1 0 0 1 3 3L8.4 18.4 4.5 19.5l1.1-3.9z" />
      <path d="m14 6.8 3 3" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V4.8h5V7" />
      <path d="M6.5 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7" />
      <path d="M10.2 10.8v6M13.8 10.8v6" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </>
  ),
  eye: (
    <>
      <path d="M2.8 12s3.4-6.2 9.2-6.2 9.2 6.2 9.2 6.2-3.4 6.2-9.2 6.2S2.8 12 2.8 12" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M9.9 6.1A9.7 9.7 0 0 1 12 5.8c5.8 0 9.2 6.2 9.2 6.2a16 16 0 0 1-2.6 3.3M6.6 7.7C4.1 9.4 2.8 12 2.8 12s3.4 6.2 9.2 6.2a9 9 0 0 0 4.4-1.1" />
      <path d="M9.9 10a2.8 2.8 0 0 0 4 4M3.5 3.5l17 17" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.8" />
    </>
  ),
  micOff: (
    <>
      <path d="M15 10.2V6.5a3 3 0 0 0-5.7-1.3M9 9v2.5a3 3 0 0 0 4.9 2.3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 10.6 5M18.4 12.8c.1-.4.1-.9.1-1.3M12 18v2.8M3.5 3.5l17 17" />
    </>
  ),
  maximize: <path d="M14.5 4.5h5v5M9.5 19.5h-5v-5M19.5 4.5l-6 6M4.5 19.5l6-6" />,
  minimize: <path d="M19.5 9.5h-5v-5M4.5 14.5h5v5M14.5 9.5l6-6M9.5 14.5l-6 6" />,
  screen: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8.5 20h7M12 16.5V20M12 13.2V8M9.6 10.2 12 7.8l2.4 2.4" />
    </>
  ),
  phoneOff: <path d="M3.4 14.6c-.5-.6-.5-1.5.1-2.1 4.7-4.6 12.3-4.6 17 0 .6.6.6 1.5.1 2.1l-1.6 1.9c-.4.5-1.2.6-1.8.3l-2.4-1.3a1.3 1.3 0 0 1-.7-1.3l.1-1.5a10.3 10.3 0 0 0-5.4 0l.1 1.5c.1.5-.2 1-.7 1.3l-2.4 1.3c-.6.3-1.3.2-1.8-.3z" />,
  map: (
    <>
      <path d="M9 4.5 3.5 6.8v12.7L9 17.2l6 2.3 5.5-2.3V4.5L15 6.8z" />
      <path d="M9 4.5v12.7M15 6.8v12.7" />
    </>
  ),
  broadcast: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6" />
      <path d="M5.4 18.6a9.3 9.3 0 0 1 0-13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19c.6-3.1 2.8-4.9 5.5-4.9s4.9 1.8 5.5 4.9" />
      <path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.4 14.4c1.7.6 2.8 2.2 3.1 4.6" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-8.5 8.5" />
      <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  thumbUp: (
    <>
      <path d="M7.5 10.5v9H4.5v-9z" />
      <path d="M7.5 10.5 11 4.2c1.3 0 2.2 1 2 2.3l-.5 3h5.1a2 2 0 0 1 2 2.4l-1.2 6a2 2 0 0 1-2 1.6H7.5" />
    </>
  ),
  thumbDown: (
    <>
      <path d="M7.5 13.5v-9H4.5v9z" />
      <path d="M7.5 13.5 11 19.8c1.3 0 2.2-1 2-2.3l-.5-3h5.1a2 2 0 0 0 2-2.4l-1.2-6a2 2 0 0 0-2-1.6H7.5" />
    </>
  ),
  userPlus: (
    <>
      <circle cx="10" cy="8.5" r="3.4" />
      <path d="M4 19.5c.7-3.3 3-5.2 6-5.2 1.3 0 2.5.3 3.4 1" />
      <path d="M18 13.5v6M15 16.5h6" />
    </>
  ),
  userCheck: (
    <>
      <circle cx="10" cy="8.5" r="3.4" />
      <path d="M4 19.5c.7-3.3 3-5.2 6-5.2 1.3 0 2.5.3 3.4 1" />
      <path d="M15 16.8l2 2 4-4.2" />
    </>
  ),
  film: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M7.5 4.5v15M16.5 4.5v15M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4" />
    </>
  ),
  music: (
    <>
      <path d="M9 17.5V6l10-2v11.5" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="16.5" cy="15.5" r="2.5" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.5c-1.8-1.4-4.3-2-7.5-2v13c3.2 0 5.7.6 7.5 2 1.8-1.4 4.3-2 7.5-2v-13c-3.2 0-5.7.6-7.5 2z" />
      <path d="M12 6.5v13" />
    </>
  ),
  mask: (
    <>
      <path d="M4 5.5c2.7 1 5.3 1 8 0v6.2c0 3.2-1.8 5.8-4 5.8s-4-2.6-4-5.8z" />
      <path d="M6.3 9.5h.01M9.7 9.5h.01M6.5 13c.9.8 2.1.8 3 0" />
      <path d="M13.5 8.6c2.2.7 4.3.6 6.5-.3v5.5c0 3-1.7 5.4-3.8 5.4-1.3 0-2.4-.9-3.1-2.3" />
      <path d="M15.2 15.3c.8-.7 1.9-.7 2.7 0" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-1 .8-1.7 1.8-1.7h2.2a3.7 3.7 0 0 0 3.7-3.7c0-4.2-3.8-7.3-8.5-7.3z" />
      <path d="M7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01" />
    </>
  ),
  headphones: (
    <>
      <path d="M4 15.5V13a8 8 0 0 1 16 0v2.5" />
      <rect x="3.5" y="14" width="4" height="6" rx="1.5" />
      <rect x="16.5" y="14" width="4" height="6" rx="1.5" />
    </>
  ),
  pen: (
    <>
      <path d="M14.5 4.5l5 5L9 20H4v-5z" />
      <path d="M12.5 6.5l5 5" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5s1.1-6.1 3.4-8.5z" />
    </>
  ),
  ticket: (
    <>
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z" />
      <path d="M14 6.5v11" strokeDasharray="1.5 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  sparkle: <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9zM18.5 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />,
  volume: (
    <>
      <path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9" />
      <path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" />
    </>
  ),
  chevronDown: <path d="M6.5 9.5 12 15l5.5-5.5" />,
  chevronUp: <path d="M6.5 14.5 12 9l5.5 5.5" />,
};

export default function Icon({ name, size = 19, strokeWidth = 1.8, className = '', ...rest }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      className={`rb-icon ${className}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {path}
    </svg>
  );
}
