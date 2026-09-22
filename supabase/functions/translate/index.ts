// translate: dato un testo, restituisce { translatedText } tradotto in italiano.
// Stesse regole del relay di traduzione di Jarvis (bot Discord): traduzione
// letterale, non alterare username/menzioni/link, nessun commento aggiunto.
// Protezioni: solo utenti loggati (JWT con role=authenticated), testo max
// 5000 caratteri, timeout 15s sulla chiamata a Gemini.

const ALLOWED_ORIGINS = ["https://mike-majic.github.io", "http://localhost:5173", "http://127.0.0.1:5173"];
const MAX_TEXT_LENGTH = 5000;
const GEMINI_MODEL = "gemini-2.5-flash";

function cors(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

function jwtRole(authHeader: string): string | null {
  try {
    const part = authHeader.replace(/^Bearer\s+/i, "").split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    return JSON.parse(atob(padded)).role ?? null;
  } catch { return null; }
}

function stripJsonFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function buildTranslationPrompt(text: string): string {
  return `Traduci in italiano, in modo letterale, il testo seguente.
Regole obbligatorie:
- Non tradurre e non alterare username, menzioni (es. @nome) o nomi propri: lasciali identici.
- Non tradurre e non alterare eventuali link/URL presenti nel testo: lasciali identici.
- Non aggiungere commenti, opinioni, spiegazioni o note personali: traduci solo il testo fornito, letteralmente.
- Se il testo è già in italiano, restituiscilo invariato.
Rispondi SOLO con JSON valido, senza markdown, in questo formato esatto:
{"translatedText":"..."}

TESTO:
${text}`;
}

async function translateWithGemini(text: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildTranslationPrompt(text) }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Gemini ha risposto ${response.status}: ${detail.slice(0, 200)}`);
    }

    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error("Risposta Gemini senza testo");

    const parsed = JSON.parse(stripJsonFence(raw));
    const translatedText = String(parsed.translatedText ?? "").trim();
    if (!translatedText) throw new Error("Traduzione vuota");

    return translatedText;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Usa POST" }, 405, origin);
  if (jwtRole(req.headers.get("authorization") || "") !== "authenticated") {
    return json({ error: "Accedi per usare la traduzione" }, 401, origin);
  }

  let text = "";
  try {
    text = String((await req.json())?.text || "").trim();
  } catch {
    return json({ error: "Body JSON non valido" }, 400, origin);
  }

  if (!text) return json({ error: "Testo mancante" }, 400, origin);
  if (text.length > MAX_TEXT_LENGTH) {
    return json({ error: `Testo troppo lungo (max ${MAX_TEXT_LENGTH} caratteri)` }, 400, origin);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "Traduzione non configurata: manca GEMINI_API_KEY" }, 500, origin);

  try {
    const translatedText = await translateWithGemini(text, apiKey);
    return json({ translatedText }, 200, origin);
  } catch (e) {
    return json({ error: (e as Error).message || "Traduzione non riuscita" }, 502, origin);
  }
});
