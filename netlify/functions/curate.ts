import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Task → model policy is server-authoritative: the client cannot request an arbitrary
// model, only one of these three tasks. Sonnet does the compositional judgment (curate);
// Haiku handles the bounded, structured tasks (intent parsing, narration).
const MODEL: Record<string, string> = {
  curate: "claude-sonnet-4-6",
  intent: "claude-haiku-4-5-20251001",
  narrate: "claude-haiku-4-5-20251001",
};
const MAX: Record<string, number> = { curate: 1200, intent: 400, narrate: 300 };

// Stateful per-IP rate limit (Netlify Blobs). Fails OPEN: if the store is unavailable the
// request proceeds, because the hard spend cap in the Anthropic console is the real backstop
// and breaking a founder's demo is worse than an occasional farmed call. Casual proxy abuse is
// stopped by the Origin requirement below; this catches sustained farming even with a forged Origin.
async function rateLimited(ip: string): Promise<boolean> {
  try {
    const store = getStore("ratelimit");
    const now = Date.now(), windowMs = 60_000, limit = 40;
    const rec = (await store.get(`rl:${ip}`, { type: "json" })) as { count: number; reset: number } | null;
    let count = 1, reset = now + windowMs;
    if (rec && now < rec.reset) { count = rec.count + 1; reset = rec.reset; }
    await store.setJSON(`rl:${ip}`, { count, reset });
    return count > limit;
  } catch { return false; }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method not allowed" };

  // Origin allowlist. Browsers always send an Origin header on these cross-boundary POSTs, so a
  // MISSING or unlisted Origin is a non-browser caller (curl farming the proxy) → reject. This is
  // the fix for the open-proxy hole: an empty Origin no longer bypasses the check.
  const origin = event.headers.origin || "";
  const allowed = [process.env.URL, process.env.DEPLOY_PRIME_URL, "http://localhost:8888", "http://localhost:5173"].filter(Boolean) as string[];
  if (allowed.length && (!origin || !allowed.some((a) => origin.startsWith(a)))) {
    return { statusCode: 403, body: "forbidden origin" };
  }

  let body: any;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const { task, messages, max_tokens } = body;

  if (!MODEL[task]) return { statusCode: 400, body: "unknown task" };
  if (!Array.isArray(messages) || messages.some((m: any) => typeof m?.content !== "string" || !["user", "assistant"].includes(m?.role))) {
    return { statusCode: 400, body: "bad messages" };
  }
  if (JSON.stringify(messages).length > 12000) return { statusCode: 413, body: "payload too large" };

  const ip = (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (await rateLimited(ip)) return { statusCode: 429, body: "rate limited" };

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { statusCode: 500, body: "server not configured" };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL[task], max_tokens: Math.min(Number(max_tokens) || MAX[task], MAX[task]), messages }),
  });
  const data = await res.text();
  return { statusCode: res.status, headers: { "content-type": "application/json" }, body: data };
};
