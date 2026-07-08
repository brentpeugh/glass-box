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

// ===== per-IP rate limiting — TWO LAYERS, so the limit cannot silently not-exist =====
// The prior two revisions each shipped a limiter that never worked in production (first invisibly,
// then visibly). The lesson: a single fail-open dependency means "working" and "dead" look
// identical from outside. So the limit is now layered:
//
//   L1 — in-memory, per warm function instance. Zero dependencies, zero configuration, cannot
//        fail. Sequential farming reuses the warm instance, so this layer alone passes the
//        acceptance test (scripts/probe-limit.sh). Best-effort across concurrent instances.
//   L2 — Netlify Blobs, cross-instance, STRONG consistency (the default "eventual" can serve
//        stale counts under rapid fire, which would never accumulate). Fails OPEN but LOUD:
//        a store error logs and the request proceeds — L1 still holds the line, and the hard
//        spend cap in the Anthropic console remains the ultimate backstop.
//
// Scale notes (fine at demo scale): L2's read-modify-write is racy under high concurrency, and
// Blobs keys don't expire — add a TTL/sweep if this ever runs hot. L1 self-prunes.
const WINDOW_MS = 60_000, LIMIT = 40;

const mem = new Map<string, { count: number; reset: number }>();
function memLimited(ip: string): boolean {
  const now = Date.now();
  if (mem.size > 1000) for (const [k, v] of mem) if (now >= v.reset) mem.delete(k);
  const rec = mem.get(ip);
  if (rec && now < rec.reset) { rec.count++; return rec.count > LIMIT; }
  mem.set(ip, { count: 1, reset: now + WINDOW_MS });
  return false;
}

async function blobLimited(ip: string): Promise<boolean> {
  try {
    const store = getStore({ name: "ratelimit", consistency: "strong" });
    const now = Date.now();
    const rec = (await store.get(`rl:${ip}`, { type: "json" })) as { count: number; reset: number } | null;
    let count = 1, reset = now + WINDOW_MS;
    if (rec && now < rec.reset) { count = rec.count + 1; reset = rec.reset; }
    await store.setJSON(`rl:${ip}`, { count, reset });
    return count > LIMIT;
  } catch (e) {
    console.error("[curate] Blobs rate-limit layer unavailable — failing OPEN (in-memory layer still active):", e);
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
  if (memLimited(ip) || (await blobLimited(ip))) return new Response("rate limited", { status: 429 });

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
