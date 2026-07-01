# Glass Box

Every number on this dashboard can be clicked and walked back to the exact rows it was
computed from — and the AI never touched the math. That is the whole idea. Most AI
analytics tools let a model generate the query or the number, and you take it on faith.
Glass Box inverts that: a **deterministic engine owns every figure and its provenance**,
and the model is confined to **interpretation** — deciding what to show, for whom, and how
to say it — bounded so it can never invent a finding, a number, or a benchmark.

The demo tenant, **Caliper Systems**, is a synthetic ~$40M ARR vertical-SaaS company. All
data is generated; the point is the architecture, not the company.

## The boundary

Two moments, one rule — the model interprets, the engine computes:

- **Entry curation.** Pick a role (CFO / CRO). The engine runs its detector battery and
  exposes a catalog of pre-verified widgets. A model call *curates* them into a
  role-specific dashboard — selecting, ordering, framing. The same findings produce
  opposite dashboards for the two roles (rising Enterprise concentration reads as
  *fragility* to the CFO and *strength* to the CRO). A validator rejects any widget id the
  engine didn't produce, so a hallucinated finding cannot reach the screen.

- **Query.** Ask a question. **L1** (model) maps it onto a fixed metric vocabulary — it
  cannot invent a metric; unanswerable questions (forecasts, unlisted metrics, off-topic)
  are declined with a reason. **L2** (engine) computes the answer deterministically. **L3**
  (model) narrates the result, bound to engine-derived facts and forbidden to state a
  number. The only probabilistic value in the whole system is L1's *intent confidence* —
  which is about interpreting the question, never about the answer.

Click any value, in either path, and the provenance drawer walks it to the rows.

## One engine, two consumers

`src/engine-core.ts` is the single hand-written engine (isomorphic, no I/O, data injected).
Two things consume it, so it can't drift:

- `scripts/validate.ts` imports it and proves it against a Python-generated oracle.
- `src/App.tsx` imports the same file and runs it in the browser over the fetched dataset.

```
npm install
npm run validate     # 113/113 panel checks, 14/14 findings vs the oracle
npm run dev          # app (curation/query fall back locally without the function)
npm run dev:live     # netlify dev — runs the function locally with your key
npm run build        # production build → dist/
```

## Layout

```
src/
  engine-core.ts     the verified engine: metric panel + 6-detector battery + resolveLeaf
  contract.ts        the honesty contract (provenance types, invariants)
  App.tsx            React UI: entry curation, query path, provenance drawer
  index.css
scripts/
  validate.ts        oracle proof  →  npm run validate
  findings_validation.json
netlify/functions/
  curate.ts          the only server-side code: holds the key, forwards to Anthropic
public/
  caliper_dataset.json   raw rows + config (the only input; fetched at runtime)
```

## Model access

All three model calls route through one Netlify function (`/.netlify/functions/curate`)
so the API key stays server-side. The function is **not a general proxy** — it accepts
only three tasks and maps each to a fixed model:

| task    | model                    | why |
|---------|--------------------------|-----|
| curate  | Claude Sonnet            | compositional judgment — where quality shows |
| intent  | Claude Haiku             | bounded classification into a fixed vocabulary |
| narrate | Claude Haiku             | one grounded sentence, no numbers |

It validates the request shape and rejects unknown tasks or oversized payloads. Running
plain `vite` without the function, the model calls fail and the UI degrades to captured
compositions and graceful declines — the engine, charts, and provenance still work.

## Key hygiene

The key lives only in Netlify's environment config, never in the repo. Set a hard spend
cap in the Anthropic console as the real backstop. The origin/shape checks in the function
are a first line; add stateful rate-limiting (Netlify Blobs) before exposing the URL
widely.

## What generalizes, and what's demo-scale

The **principle** is production-grade and domain-independent: substance and provenance live
in the deterministic layer; the model interprets, bounded and validated; refuse outside the
supported space. What's **demo-scale** is the mechanics — the metric vocabulary is a closed
enum and the query resolver is hand-wired dispatch. In a real system that closed enum
becomes a declared semantic layer (dbt / Cube / Malloy in spirit): L1 maps intent onto the
declared space, L2 executes against it, L3 describes from its metadata. This repo is a
faithful miniature of that architecture — it hand-codes what production would derive from a
registry. The boundary is what makes it trustworthy; the semantic layer is what makes it
scale.

## Deploy to Netlify

1. Push this repo to GitHub (private is fine).
2. In the **Anthropic console**, create an API key and set a **monthly spend limit** —
   this is the real backstop for a live demo link.
3. In **Netlify**: *Add new site → Import from Git → pick the repo.* `netlify.toml`
   supplies the build command (`npm run build`), publish dir (`dist`), and functions dir,
   so no manual config is needed.
4. **Site settings → Environment variables → add** `ANTHROPIC_API_KEY` (the key from step 2).
5. Deploy. Verify live: open the site, pick a role, confirm the honesty bar reads
   *"curated live by the model"* (not the fallback), then run a query and confirm it
   answers, declines out-of-scope questions, and traces to rows.

Local live testing before deploy: `npm run dev:live` (netlify dev) runs the function on
your machine against your key.
