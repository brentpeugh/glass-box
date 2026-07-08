import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Task → model policy is server-authoritative: the client cannot request an arbitrary model,
// only one of these three tasks. Sonnet does the compositional judgment (curate); Haiku handles
// the bounded, structured tasks (intent parsing, narration). The client's model field is ignored.
const MODEL: Record<string, string> = {
  curate: "claude-sonnet-4-6",
  intent: "claude-haiku-4-5-20251001",
  narrate: "claude-haiku-4-5-20251001",
};
const MAX: Record<string, number> = { curate: 1200, intent: 400, narrate: 300 };

// Stateful per-IP rate limit (Netlify Blobs). This is a Functions 2.0 handler specifically so the
// Blobs context auto-configures (the legacy Handler signature does NOT reliably provide it, which
// silently broke this limiter in the prior revision). Fails OPEN but LOUD: on any store error the
// request proceeds AND the error is logged, so a broken limiter is visible in function logs rather
// than an invisible no-op. The hard spend cap in the Anthropic console is the ultimate backstop.
// (Notes for later scale: the read-modify-write is racy under high concurrency — fine at demo
// scale — and keys don't expire; add a TTL/sweep if this ever runs hot.)
async function rateLimited(ip: string): Promise<boolean> {
  try {
    const store = getStore("ratelimit");
    const now = Date.now(), windowMs = 60_000, limit = 40;
    const rec = (await store.get(`rl:${ip}`, { type: "json" })) as { count: number; reset: number } | null;
    let count = 1, reset = now + windowMs;
    if (rec && now < rec.reset) { count = rec.count + 1; reset = rec.reset; }
    await store.setJSON(`rl:${ip}`, { count, reset });
    return count > limit;
  } catch (e) {
    console.error("[curate] rate-limit store error — failing OPEN:", e);
    return false;
  }
}

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // Origin allowlist. Browsers always send an Origin on these cross-boundary POSTs, so a MISSING
  // or unlisted Origin is a non-browser caller (curl farming the proxy) → reject. An empty Origin
  // no longer bypasses the check.
  const origin = req.headers.get("origin") || "";
  const allowed = [process.env.URL, process.env.DEPLOY_PRIME_URL, "http://localhost:8888", "http://localhost:5173"].filter(Boolean) as string[];
  if (allowed.length && (!origin || !allowed.some((a) => origin.startsWith(a)))) {
    return new Response("forbidden origin", { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
  const { task, messages, max_tokens } = body;

  if (!MODEL[task]) return new Response("unknown task", { status: 400 });
  if (!Array.isArray(messages) || messages.some((m: any) => typeof m?.content !== "string" || !["user", "assistant"].includes(m?.role))) {
    return new Response("bad messages", { status: 400 });
  }
  if (JSON.stringify(messages).length > 12000) return new Response("payload too large", { status: 413 });

  const ip = (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (await rateLimited(ip)) return new Response("rate limited", { status: 429 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return new Response("server not configured", { status: 500 });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL[task], max_tokens: Math.min(Number(max_tokens) || MAX[task], MAX[task]), messages }),
  });
  const data = await res.text();
  return new Response(data, { status: res.status, headers: { "content-type": "application/json" } });
};
