// send-push: manda una notifica Web Push a tutti i dispositivi di un
// utente. La chiamano solo i trigger del DB (notify_push, via pg_net) con
// l'header x-push-secret = segreto nel Vault; niente JWT (verify_jwt off).
// Chiavi VAPID dal Vault (RPC get_api_secret, solo service role). Le
// iscrizioni scadute (404/410) vengono cancellate.
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUBJECT = "https://mike-majic.github.io/Versemove/";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

const secrets = new Map<string, string>();
async function secret(name: string): Promise<string> {
  if (secrets.has(name)) return secrets.get(name)!;
  const res = await rest("rpc/get_api_secret", { method: "POST", body: JSON.stringify({ p_name: name }) });
  const value = res.ok ? await res.json() : null;
  if (!value || typeof value !== "string") throw new Error(`segreto ${name} mancante`);
  secrets.set(name, value);
  return value;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Usa POST" }, 405);
  try {
    const expected = await secret("push_webhook_secret");
    if (!timingSafeEqual(req.headers.get("x-push-secret") ?? "", expected)) return json({ error: "non autorizzato" }, 401);
  } catch {
    return json({ error: "configurazione mancante" }, 500);
  }

  let p: { user_id?: string; title?: string; body?: string; tag?: string; url?: string; kind?: string };
  try {
    p = await req.json();
  } catch {
    return json({ error: "JSON non valido" }, 400);
  }
  if (!p.user_id || !UUID.test(p.user_id)) return json({ error: "user_id mancante" }, 400);

  webpush.setVapidDetails(SUBJECT, await secret("vapid_public_key"), await secret("vapid_private_key"));

  const res = await rest(`push_subscriptions?user_id=eq.${p.user_id}&select=id,endpoint,p256dh,auth`);
  const subs: { id: string; endpoint: string; p256dh: string; auth: string }[] = res.ok ? await res.json() : [];
  const payload = JSON.stringify({
    title: String(p.title ?? "Versemove").slice(0, 80),
    body: String(p.body ?? "").slice(0, 180),
    tag: p.tag ? String(p.tag).slice(0, 80) : undefined,
    url: p.url ? String(p.url).slice(0, 300) : undefined,
    kind: p.kind ? String(p.kind).slice(0, 20) : undefined,
  });
  const urgent = p.kind === "call" || p.kind === "chat";

  const results = await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: p.kind === "call" ? 45 : 86400,
          urgency: urgent ? "high" : "normal",
        });
        await rest(`push_subscriptions?id=eq.${s.id}`, { method: "PATCH", body: JSON.stringify({ last_used_at: new Date().toISOString() }) });
        return { id: s.id, ok: true };
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode ?? 0;
        if (status === 404 || status === 410) await rest(`push_subscriptions?id=eq.${s.id}`, { method: "DELETE" });
        return { id: s.id, ok: false, status };
      }
    }),
  );
  return json({ sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) });
});
