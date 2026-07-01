import type { Handler } from "@netlify/functions";

// Task → model policy is server-authoritative: the client cannot request an arbitrary
// model, only one of these three tasks. Sonnet does the compositional judgment (curate);
// Haiku handles the bounded, structured tasks (intent parsing, narration).
const MODEL: Record<string, string> = {
  curate: "claude-sonnet-4-6",
  intent: "claude-haiku-4-5-20251001",
  narrate: "claude-haiku-4-5-20251001",
};
const MAX: Record<string, number> = { curate: 1200, intent: 400, narrate: 300 };

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method not allowed" };

  // Soft origin allowlist. The real backstops are the task allowlist, shape check, and
  // the hard spend cap set in the Anthropic console. Tighten to stateful rate-limiting
  // (Netlify Blobs) before exposing this widely.
  const origin = event.headers.origin || "";
  const allowed = [process.env.URL, process.env.DEPLOY_PRIME_URL, "http://localhost:8888", "http://localhost:5173"].filter(Boolean) as string[];
  if (origin && allowed.length && !allowed.some((a) => origin.startsWith(a))) {
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
