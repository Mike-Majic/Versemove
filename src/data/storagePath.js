// Nome file sicuro per i percorsi dello storage: niente accenti, spazi,
// barre o caratteri strani (un nome come "../foto #1 (copia).JPG" non deve
// finire nel path o romperlo), estensione tenuta in minuscolo, lunghezza
// limitata. Il percorso resta unico grazie al timestamp messo da chi chiama.
export function safeFileName(name, fallback = 'file') {
  const raw = String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const dot = raw.lastIndexOf('.');
  const base = (dot > 0 ? raw.slice(0, dot) : raw)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const ext = dot > 0 ? raw.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : '';
  return `${base || fallback}${ext ? `.${ext}` : ''}`;
}
