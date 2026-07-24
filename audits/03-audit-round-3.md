# Glass Box — Round 3 Audit (v3)

*Basis: full diff v3-vs-v2 (changes confined to the function, curation.ts, App.tsx, validate-discovery.ts, lockfile), fresh validator runs (oracle 113/113 + 14/14; discovery **10/10**), eight adversarial edge probes on the new guard, build + deployed-bundle parity check, and three live probe series against the production function. Deployed bundle `index-CySFnRhm.js` is byte-identical to the local v3 build.*

---

## Round-2 punch list

**Label whitelist — FIXED, verified, well-designed.** `guardFraming` now strips exact engine-supplied label strings (regex-escaped, case-insensitive, replaced with a space so no digit-merging) *before* the numeral test, and returns the original text untouched. The whitelist is threaded correctly: curation gets the evidence-menu labels, narration gets the grounding label, and a no-label call behaves exactly as v2 (regression confirmed). Assertion 10 pins it in the validator, and it survived all eight of my edge probes, including the traps: "Rule of 400% growth" still trips (the strip doesn't eat the longer number), a bare digit or word-figure *beside* a whitelisted label still trips, "Top-40" (not a real label) trips, and lowercase "rule of 40" passes. The philosophical framing in the comment — naming is referencing, not authoring — is the right resolution and now consistent with the fallback path.

**Orphaned comment — FIXED**, and the replacement is accurate (reject-not-strip, lives in curation.ts, notes the label whitelist).

**Rate limiter — code fixed, production still dead.** The migration to the Functions 2.0 signature is correct and complete (Request/Response API throughout, headers via `req.headers.get`, and — the part that mattered most — the fail-open is now *loud*: store errors hit `console.error` with a named tag). The origin gates verify live: requests without a recognized Origin, and those from unlisted origins, are both rejected. But the limiter itself still does not limit. I ran the acceptance test two ways against the configured limit, presenting a recognized Origin: a rapid burst well past the limit — **every request succeeded**; then, to discriminate root causes, the same volume spaced out over time (which would let the store's default *eventual* consistency propagate between reads) — **again, never tripped**. The spaced result rules out both the counter logic and read-staleness: the store call itself is failing on every invocation, and the fail-open is doing exactly what it says. The difference from round 2 is that the failure is now **observable** — your Netlify function log should contain a rate-limit store error line per request from the test run, with the actual exception. Read it; it names the culprit.

Likely candidates, in order:
1. **`node_bundler = "esbuild"` in netlify.toml** (unchanged since v1). Forcing the legacy esbuild bundler can keep the function off the modern runtime pipeline that auto-injects the Blobs connection context — which would make the 2.0 signature migration necessary but not sufficient. Try deleting that line (the modern runtime handles a default-export TS function natively) and re-deploying.
2. Blobs context genuinely absent for the site/runtime combination — the log line will say so explicitly.
3. If Blobs keeps fighting you, the honest demo-scale alternative is a **module-level in-memory Map** per function instance: no dependency, no config, cannot fail silently, and warm-instance reuse means it genuinely blunts sustained farming (disclose it as per-instance best-effort). For a portfolio demo whose real backstop is the console spend cap, "simple and verifiably working" beats "distributed and dead."

Whichever route: the acceptance test is the documented one — a burst past the configured limit must return 429 at the first request over it. Nothing else counts as done; this round re-proved that.

**Consequence that must not slip:** the README still states the function "applies per-IP rate limiting via Netlify Blobs." Three rounds running, the entire claims-vs-reality delta of this project has collapsed into this single sentence — currently still false in production. Either make it true (and verify), or soften it to what is true today ("origin-gated; per-IP rate limiting fail-open — see function logs; hard spend cap is the backstop") until it is. Given who this repo is for, the second option costs you nothing and the unverified first option is the only thing left that could embarrass you.

## New findings

None. The v3 diff surface is small and I reviewed all of it; validators pass at 10/10, the dataset and engine are untouched, the round-1 adversarial battery still holds (fabrication drops, falsifier requirement, fallback-thesis self-consistency, perturbation re-derivation, salience determinism), the build passes, and deployment parity is exact.

## Verdict

**Architecture: clean.** Every honesty claim I can test mechanically now holds in code *and* in the deployed artifact, and the guard system survived targeted evasion. The single open item is infrastructure, not thesis: one rate limiter that has now been correctly written twice and has never once worked in production — a fact only the live loop could reveal, both times. Close it (or re-scope the README sentence to reality), run the acceptance loop, and you're clean.
