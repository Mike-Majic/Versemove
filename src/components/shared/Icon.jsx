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
