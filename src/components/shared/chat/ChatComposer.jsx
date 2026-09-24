import { useEffect, useRef, useState } from 'react';
import MentionInput from '../MentionInput';
import EmojiPicker from '../../social/EmojiPicker';
import { mentionIdsInText } from '../../../data/mentions';
import useVoiceRecorder from './useVoiceRecorder';
import { MAX_FILES, MAX_VOICE_SECONDS, formatDuration, kindOfMime, mimeOf, newId, validateFile } from './chatMedia';

// Barra di scrittura condivisa (Stanza MOD e chat dirette):
// - 📎 con "Foto/Video", "Documento" e le voci extra (es. "Posizione");
//   file anche trascinati sul pannello (dropTargetRef) o incollati con
//   Ctrl+V; anteprime con la X prima dell'invio, massimo 10, tipo e
//   dimensione controllati prima dell'upload, barra di avanzamento;
// - testo con le menzioni "@" (MentionInput), Invio = invia, Maiusc+Invio
//   = a capo;
// - 🎤 vocale: clic per registrare (timer e onda), poi Invia o 🗑️
//   Annulla; tenendo premuto e rilasciando si invia subito.
// upload(file, onProgress) -> { path } | { error }: il percorso lo decide
// chi usa il componente. onSend({ testo, menzioni, allegati }) riceve gli
// allegati già caricati: [{ tipo, path, nome, mime, dimensione, durata? }].
const HOLD_TO_SEND_MS = 600;

export default function ChatComposer({
  contesto,
  contestoId = null,
  mentionTitle,
  placeholder = 'Scrivi un messaggio…',
  disabled = false,
  dropTargetRef,
  upload,
  onSend,
  extraMenuItems = [],
}) {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState([]);
  const [pending, setPending] = useState([]); // { id, file, url, kind, progress }
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const photoRef = useRef(null);
  const docRef = useRef(null);
  const textRef = useRef(null);
  const holdRef = useRef(0);
  const rec = useVoiceRecorder();

  // Conteggio aggiornato anche fra due aggiunte ravvicinate (trascina +
  // incolla), senza aspettare il render.
  const pendingCountRef = useRef(0);
  pendingCountRef.current = pending.length;

  const addFiles = (fileList) => {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const problems = [];
    const added = [];
    for (const file of files) {
      if (pendingCountRef.current + added.length >= MAX_FILES) {
        problems.push(`Massimo ${MAX_FILES} file per messaggio.`);
        break;
      }
      const why = validateFile(file);
      if (why) {
        problems.push(why);
        continue;
      }
      const kind = kindOfMime(mimeOf(file));
      added.push({ id: newId(), file, kind, url: kind === 'immagine' || kind === 'video' ? URL.createObjectURL(file) : null, progress: 0 });
    }
    pendingCountRef.current += added.length;
    if (added.length) setPending((prev) => [...prev, ...added]);
    setError(problems[0] ?? '');
  };

  const removePending = (id) =>
    setPending((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item?.url) URL.revokeObjectURL(item.url);
      return prev.filter((p) => p.id !== id);
    });

  // Trascina e rilascia sul pannello, incolla un'immagine.
  useEffect(() => {
    const el = dropTargetRef?.current;
    if (!el || disabled) return undefined;
    let depth = 0;
    const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const onEnter = (e) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setDragging(true);
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const onOver = (e) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      addFiles(e.dataTransfer.files);
    };
    const onPaste = (e) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    };
    el.addEventListener('dragenter', onEnter);
    el.addEventListener('dragleave', onLeave);
    el.addEventListener('dragover', onOver);
    el.addEventListener('drop', onDrop);
    el.addEventListener('paste', onPaste);
    return () => {
      el.removeEventListener('dragenter', onEnter);
      el.removeEventListener('dragleave', onLeave);
      el.removeEventListener('dragover', onOver);
      el.removeEventListener('drop', onDrop);
      el.removeEventListener('paste', onPaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropTargetRef, disabled]);

  useEffect(() => {
    if (dropTargetRef?.current) dropTargetRef.current.classList.toggle('rb-chat-dragging', dragging);
  }, [dragging, dropTargetRef]);

  const send = async () => {
    if (busy || disabled) return;
    const testo = text.trim();
    if (!testo && pending.length === 0) return;
    setError('');
    let allegati = [];
    if (pending.length) {
      setBusy(true);
      for (const item of pending) {
        const res = await upload(item.file, (p) =>
          setPending((prev) => prev.map((x) => (x.id === item.id ? { ...x, progress: p } : x)))
        );
        if (res.error) {
          setBusy(false);
          setError(`${item.file.name}: ${res.error}`);
          return;
        }
        allegati.push({ tipo: item.kind, path: res.path, nome: item.file.name, mime: mimeOf(item.file), dimensione: item.file.size });
      }
      setBusy(false);
      pending.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    }
    const menzioni = mentionIdsInText(testo, mentions);
    setText('');
    setMentions([]);
    setPending([]);
    await onSend({ testo, menzioni, allegati });
    textRef.current?.focus();
  };

  const sendVoice = async () => {
    const result = await rec.finish();
    if (!result?.blob?.size) return;
    const ext = result.mime.includes('mp4') ? 'm4a' : result.mime.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([result.blob], `vocale-${Date.now()}.${ext}`, { type: result.mime });
    const why = validateFile(file);
    if (why) {
      setError(why);
      return;
    }
    setVoiceProgress(0);
    const res = await upload(file, setVoiceProgress);
    setVoiceProgress(null);
    if (res.error) {
      setError(`Vocale non inviato: ${res.error}`);
      return;
    }
    await onSend({
      testo: '',
      menzioni: [],
      allegati: [{ tipo: 'audio', path: res.path, nome: file.name, mime: result.mime, dimensione: file.size, durata: Math.round(result.durata) }],
    });
  };

  const onMicDown = async () => {
    if (disabled || busy || rec.state === 'recording') return;
    holdRef.current = Date.now();
    await rec.start();
  };
  const onMicUp = () => {
    if (rec.state === 'recording' && holdRef.current && Date.now() - holdRef.current > HOLD_TO_SEND_MS) sendVoice();
    holdRef.current = 0;
  };

  const recording = rec.state === 'recording' || rec.state === 'stopped';
  const canSend = !disabled && !busy && (text.trim() || pending.length);

  return (
    <div className="rb-composer">
      {(error || rec.error) && (
        <p className="rb-composer-error" role="alert">
          {error || rec.error}
          <button type="button" onClick={() => setError('')} aria-label="Chiudi avviso">✕</button>
        </p>
      )}
      {pending.length > 0 && (
        <ul className="rb-composer-previews">
          {pending.map((p) => (
            <li key={p.id} className={`rb-composer-preview ${p.kind}`}>
              {p.kind === 'immagine' ? (
                <img src={p.url} alt={p.file.name} />
              ) : p.kind === 'video' ? (
                <video src={p.url} muted />
              ) : (
                <span className="rb-composer-preview-doc">{p.kind === 'audio' ? '🎵' : '📄'}</span>
              )}
              <span className="rb-composer-preview-name">{p.file.name}</span>
              {busy && (
                <span className="rb-composer-progress" aria-label={`Caricamento ${Math.round(p.progress * 100)}%`}>
                  <span style={{ width: `${Math.round(p.progress * 100)}%` }} />
                </span>
              )}
              {!busy && (
                <button type="button" className="rb-composer-preview-x" onClick={() => removePending(p.id)} aria-label={`Togli ${p.file.name}`}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {voiceProgress !== null && (
        <div className="rb-composer-voice-upload">
          Invio del vocale… {Math.round(voiceProgress * 100)}%
          <span className="rb-composer-progress"><span style={{ width: `${Math.round(voiceProgress * 100)}%` }} /></span>
        </div>
      )}

      {recording ? (
        <div className="rb-composer-bar recording">
          <button type="button" className="rb-composer-icon" onClick={rec.cancel} aria-label="Annulla il vocale" title="Annulla">🗑️</button>
          <span className="rb-rec-dot" aria-hidden="true" />
          <span className="rb-rec-time">
            {formatDuration(rec.elapsed)} <small>/ {formatDuration(MAX_VOICE_SECONDS)}</small>
          </span>
          <span className="rb-rec-wave" aria-hidden="true">
            {Array.from({ length: 40 }, (_, i) => rec.levels[rec.levels.length - 40 + i] ?? 0).map((l, i) => (
              <span key={i} style={{ height: `${Math.max(8, Math.round(l * 100))}%` }} />
            ))}
          </span>
          {rec.state === 'stopped' && <small className="rb-rec-note">Massimo 2 minuti</small>}
          <button type="button" className="rb-composer-send" onClick={sendVoice}>Invia</button>
        </div>
      ) : (
        <div className="rb-composer-bar">
          <div className="rb-composer-attach">
            <button
              type="button"
              className="rb-composer-icon"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Allega"
              aria-expanded={menuOpen}
              disabled={disabled || busy}
            >
              📎
            </button>
            {menuOpen && (
              <div className="rb-composer-menu" onMouseLeave={() => setMenuOpen(false)}>
                <button type="button" onClick={() => { setMenuOpen(false); photoRef.current?.click(); }}>🖼️ Foto/Video</button>
                <button type="button" onClick={() => { setMenuOpen(false); docRef.current?.click(); }}>📄 Documento</button>
                {extraMenuItems.map((it) => (
                  <button key={it.label} type="button" onClick={() => { setMenuOpen(false); it.onClick(); }}>
                    {it.icon} {it.label}
                  </button>
                ))}
              </div>
            )}
            <input
              ref={photoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,video/mp4,video/quicktime"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              ref={docRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,audio/*"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          <span className="rb-composer-emoji">
            <EmojiPicker onSelect={(emoji) => setText((t) => t + emoji)} />
          </span>
          <MentionInput
            multiline
            rows={1}
            className="rb-composer-text"
            inputRef={textRef}
            value={text}
            onChange={setText}
            mentions={mentions}
            onMentionsChange={setMentions}
            contesto={contesto}
            contestoId={contestoId}
            dropdownTitle={mentionTitle}
            placeholder={placeholder}
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            type="button"
            className="rb-composer-icon rb-composer-mic"
            onPointerDown={onMicDown}
            onPointerUp={onMicUp}
            aria-label="Registra un vocale"
            title="Clic per registrare, oppure tieni premuto"
            disabled={disabled || busy}
          >
            🎤
          </button>
          <button type="button" className="rb-composer-send" onClick={send} disabled={!canSend}>
            {busy ? 'Carico…' : 'Invia'}
          </button>
        </div>
      )}
      {dragging && <div className="rb-composer-drop-hint">Rilascia qui foto e documenti · max 20 MB</div>}
    </div>
  );
}
