import { useState } from 'react';
import Icon from '../shared/Icon';
import './EmojiPicker.css';

// Set curato ma ampio, diviso per categoria come nei picker di WhatsApp/
// Telegram: niente libreria esterna, solo un array più lungo organizzato a
// schede. Riusato dal composer dei post e da quello dei commenti.
const CATEGORIES = [
  {
    id: 'faccine',
    label: 'Faccine',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
      '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
      '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
      '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔',
      '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🥵', '🥶', '🥴',
      '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁',
      '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥',
      '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱',
      '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '😺', '😸', '😹',
    ],
  },
  {
    id: 'persone',
    label: 'Persone',
    icon: '👋',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞',
      '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍',
      '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🙏',
      '💪', '🦾', '👀', '👂', '👃', '🧠', '🫀', '🦷', '👶', '🧒',
      '👦', '👧', '🧑', '👨', '👩', '🧓', '👴', '👵', '💃', '🕺',
      '🧑‍🦱', '👫', '👭', '👬', '💏', '💑', '👪', '🫂',
    ],
  },
  {
    id: 'animali',
    label: 'Animali & Natura',
    icon: '🐶',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆',
      '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌',
      '🐞', '🐢', '🐍', '🦎', '🐙', '🦑', '🦀', '🐠', '🐬', '🐳',
      '🐋', '🦈', '🐊', '🐆', '🦓', '🦒', '🐘', '🦥', '🦦', '🐕',
      '🌵', '🌲', '🌳', '🌴', '🌸', '🌺', '🌻', '🌼', '🌷', '🍀',
      '🍁', '🍂', '🌈', '☀️', '⭐', '🌙', '☁️', '⛅', '🌧️', '⛈️',
      '❄️', '🔥', '💧', '🌊',
    ],
  },
  {
    id: 'cibo',
    label: 'Cibo & Bevande',
    icon: '🍕',
    emojis: [
      '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒',
      '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🥦', '🥬', '🥕',
      '🌽', '🌶️', '🫑', '🍞', '🥐', '🥖', '🧀', '🥚', '🍳', '🥞',
      '🧇', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🍝',
      '🍜', '🍲', '🍣', '🍱', '🍙', '🍘', '🍢', '🍡', '🍦', '🍩',
      '🍪', '🎂', '🍰', '🧁', '🍫', '🍬', '🍭', '☕', '🍵', '🧃',
      '🥤', '🍺', '🍷', '🥂', '🍾', '🍹',
    ],
  },
  {
    id: 'attivita',
    label: 'Attività',
    icon: '⚽',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸',
      '🥊', '🥋', '🎯', '⛳', '🎣', '🤿', '🎽', '🎿', '🛷', '🥌',
      '🎮', '🕹️', '🎲', '🧩', '🎨', '🎭', '🎬', '🎤', '🎧', '🎼',
      '🎹', '🥁', '🎸', '🎻', '🎺', '🏆', '🥇', '🥈', '🥉', '🎳',
    ],
  },
  {
    id: 'viaggi',
    label: 'Viaggi & Luoghi',
    icon: '✈️',
    emojis: [
      '🚗', '🚕', '🚙', '🚌', '🏍️', '🚲', '🛵', '🚓', '🚑', '🚒',
      '🚜', '🚀', '✈️', '🛫', '🛬', '🚁', '⛵', '🚤', '🛳️', '⚓',
      '🚂', '🚆', '🚇', '🚊', '🗽', '🗼', '🏰', '🏯', '🎡', '🎢',
      '🏖️', '🏝️', '🏔️', '⛰️', '🌋', '🏕️', '🏙️', '🌅', '🌆', '🌃',
      '🌉', '🗺️', '🧭', '⛺', '🏠', '🏢',
    ],
  },
  {
    id: 'oggetti',
    label: 'Oggetti',
    icon: '💡',
    emojis: [
      '⌚', '📱', '💻', '⌨️', '🖥️', '🖨️', '📷', '📸', '📹', '🎥',
      '📞', '☎️', '📺', '📻', '🎙️', '⏰', '⏳', '🔋', '🔌', '💡',
      '🔦', '🕯️', '📔', '📚', '✏️', '🖊️', '📝', '📌', '📎', '✂️',
      '🔒', '🔑', '🔨', '🧰', '⚙️', '🧲', '💊', '🩹', '🚽', '🛁',
      '🛒', '🎁', '🎈', '🎀', '💰', '💳', '💎', '⚖️',
    ],
  },
  {
    id: 'simboli',
    label: 'Simboli',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️',
      '✝️', '☪️', '🕉️', '☯️', '✡️', '🔯', '♻️', '⚛️', '🆗', '🆕',
      '🆓', '💯', '🔞', '📵', '🚫', '⚠️', '☢️', '☣️', '⬆️', '⬇️',
      '⬅️', '➡️', '🔄', '✅', '❌', '❗', '❓', '💤',
    ],
  },
  {
    id: 'bandiere',
    label: 'Bandiere',
    icon: '🏳️',
    emojis: [
      '🏳️', '🏴', '🏁', '🚩', '🏳️‍🌈', '🇮🇹', '🇫🇷', '🇩🇪', '🇪🇸', '🇵🇹',
      '🇬🇧', '🇮🇪', '🇺🇸', '🇨🇦', '🇧🇷', '🇦🇷', '🇯🇵', '🇰🇷', '🇨🇳', '🇮🇳',
      '🇦🇺', '🇳🇿', '🇿🇦', '🇪🇬', '🇬🇷', '🇹🇷', '🇳🇱', '🇧🇪', '🇨🇭', '🇸🇪',
    ],
  },
];

export default function EmojiPicker({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id);

  const category = CATEGORIES.find((c) => c.id === activeCategory) ?? CATEGORIES[0];

  return (
    <div className="rb-emoji-picker">
      <button
        type="button"
        className={`rb-iconbtn ${open ? 'active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Aggiungi un'emoji"
        title="Emoji"
      >
        <Icon name="smile" />
      </button>
      {open && (
        <div className="rb-emoji-popover">
          <div className="rb-emoji-tabs">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`rb-emoji-tab ${activeCategory === c.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(c.id)}
                title={c.label}
                aria-label={c.label}
              >
                {c.icon}
              </button>
            ))}
          </div>
          <div className="rb-emoji-grid">
            {category.emojis.map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                type="button"
                className="rb-emoji-option"
                onClick={() => {
                  onSelect(emoji);
                  setOpen(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
