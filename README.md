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

- **Entry curation.** Pick a role (CFO / CRO). The engine ranks every fact by neutral
  salience (role-agnostic effect size) and derives the finding's *neighborhood* — the
  evidence, falsification tests, and widgets that are legible for it. Each role **leads with
  the highest-salience finding in a domain where it holds decision rights**: the CFO owns
  capital efficiency, the CRO owns revenue motion; shared concerns (retention, concentration)
  surface for both. Objective #1 is always disclosed and led-with only when it's in the role's
  remit. A model call then curates the board *around that lead* — selecting, ordering, and
  framing widgets from the neighborhood — and a validator drops any id the engine didn't
  produce, rejects a read with no falsifier, and rejects framing that contradicts the engine's
  verdict. The two roles **diverge** when their leading finding differs and **converge** when
  it's shared — there is no role-tilted framing of the same fact, only role-scoped leads with
  full disclosure. (Perturb the data and watch it: improving efficiency drops it from the top,
  concentration becomes the shared lead, and the two boards converge on their own.)

- **Query.** Ask a question. **L1** (model) maps it onto a fixed metric vocabulary — it
  cannot invent a metric; unanswerable questions (forecasts, unlisted metrics, off-topic)
  are declined with a reason. **L2** (engine) computes the answer deterministically. **L3**
  (model) narrates the result, bound to engine-derived facts and forbidden to state a
  number. The only probabilistic value in the whole system is L1's *intent confidence* —
  which is about interpreting the question, never about the answer.

A query can also **re-orient** the whole board: focus a discovered finding and the dashboard
re-curates around it (same engine, new lead). Answers appear as cards; the ambiguous case
shows the engine-computed value immediately and waits for you to confirm before the model
frames it — *facts are free, interpretations are confirmed.*

Click any value, in either path, and the provenance drawer walks it to the rows.

### What's structural, and what's layered

Precision matters here, because overclaiming would itself violate the thesis. **Numbers,
comparisons, chart scales, and layout coordinates are *structural*:** the model has no channel
that can emit them, so it cannot invent or distort them — full stop. **Prose *valence* (the
tone of a headline) is *layered defense*,** not a wall: the model is given only qualitative
direction (clears/breaches, rising/falling), a validator rejects framing whose direction
contradicts the engine's verdict, and on rejection the engine's own verdict replaces the
headline. A flatly contradictory headline ("exceeds" on a breach) is caught; a merely
euphemistic one can slip — but the engine's verdict is always shown beside it, so prose can
never *invert* what the number says. The line sits exactly where the code draws it.

## One engine, two consumers

`src/engine-core.ts` is the single hand-written engine (isomorphic, no I/O, data injected).
Two things consume it, so it can't drift:

- `scripts/validate.ts` imports it and proves it against a Python-generated oracle.
- `src/App.tsx` imports the same file and runs it in the browser over the fetched dataset.

```
npm install
npm run validate     # oracle (113/113 panel, 14/14 findings) + discovery proof (9/9 thesis assertions)
npm run dev          # app (curation/query fall back locally without the function)
npm run dev:live     # netlify dev — runs the function locally with your key
npm run build        # production build → dist/
```

## Layout

```
src/
  engine-core.ts     the verified engine: metric panel + salience ranking + neighborhood + resolveLeaf
  contract.ts        the honesty contract (substance types, curation contract, structural/layered invariants)
  App.tsx            React UI: entry curation, query path, provenance drawer
  index.css
scripts/
  validate.ts             oracle proof (metric panel + legacy detectors)
  validate-discovery.ts   the live discovery path: 9 thesis-critical assertions
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

The client's model field is advisory only — the function is server-authoritative and pins
each task to its model regardless of what the client sends. It validates the request shape and
rejects unknown tasks or oversized payloads. Running
plain `vite` without the function, the model calls fail and the UI degrades to captured
compositions and graceful declines — the engine, charts, and provenance still work.

## Key hygiene

The key lives only in Netlify's environment config, never in the repo. The function requires
a **recognized Origin** (a missing or unlisted Origin is rejected — closing the empty-Origin
proxy path) and applies **per-IP rate limiting** via Netlify Blobs (fail-open, so a store
hiccup degrades to allow rather than break the demo). The **hard spend cap** in the Anthropic
console is the ultimate backstop.

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
