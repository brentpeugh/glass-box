# Caliper POC — Original Scope & Goal (Audit Brief)

> **AUDIT RECORD NOTE — this is the ORIGINAL brief, published as written before the audit.**
> Round 1 was conducted against this document. Several claims here were found to describe an
> architecture the build had already superseded — documentation drift was itself a finding.
> For the brief rewritten to match the shipped system, see `05-scope-brief-current.md`.

*Hand this to a fresh chat along with the codebase. It states what the POC was **intended** to be and do, so the audit can measure the build against its original intent rather than guessing at it. The audit's job is to verify the build honors this scope — especially the honesty invariants, which are the whole point — and to surface any place the implementation drifts from, weakens, or fakes what's claimed here.*

---

## 1. What this is (and is not)

**This is:** a portfolio artifact — a working, deployed, interactive demonstration of a trust architecture for AI-mediated analytics. Its job is to *prove a thesis*, legibly and verifiably, to a sophisticated technical evaluator (founders/hiring decision-makers at AI-native analytics/BI companies).

**This is NOT:** a commercial product, a general platform, or a production system. It is an *opinionated instance* that illustrates concepts and demonstrates that every function is *scalable in principle* — not a fully commercialized flow. Where it diverges from how a real product would work, that's intentional; the job is demonstration, not productization.

**Domain:** synthetic B2B SaaS financials (fictional tenant "Caliper Systems," ~$40M ARR Series C). Chosen to be relevant to the target audience (FP&A/BI) and non-automotive.

**What it must communicate, all at once:** (a) the trust thesis solved, (b) product sense / understanding of the space, (c) design judgment. The medium is meant to embody the message — trust demonstrated at every layer, including the design.

---

## 2. The core thesis (what the whole thing exists to prove)

**One principle, applied at two moments:** the deterministic core owns all substance and provenance; the AI is bounded to interpretation (understanding intent and composing framing) and can *never* author a number, a comparison, a benchmark, or a layout that misrepresents. Same shape whether the system is *presenting* (entry) or *answering* (query).

The trust claim is not "the numbers happen to be right." It is **structural**: the architecture makes it *mechanically impossible* for the AI to fabricate or misrepresent — not the values, not the framing, not the chart scales, not the layout — because every degree of freedom the model has is bounded to pre-verified, engine-produced material.

---

## 3. Thesis 1 — the self-arranging entrance (how you get IN)

**Intent:** when a user enters as a role (CFO or CRO), the dashboard *composes itself* around that role — materially different dashboards from the *same underlying findings*, not a template filled with different data.

**How it's supposed to work:**
- A deterministic engine runs a battery of detectors over the raw rows and surfaces *sourced findings* (each with a salience score and a provenance trace back to the rows). This is role-agnostic — it finds what's *notable*, period.
- A live model then *curates*: given the role + the catalog of engine-produced findings/widgets, it selects which to show, arranges them into sections, sets emphasis, and writes qualitative framing. It **selects and arranges from pre-verified material; it never computes or invents.**
- The output is a composition spec (sections → blocks) that a fixed renderer realizes. The model emits references to engine-produced IDs only; a validator rejects any ID the engine didn't produce.

**The centerpiece demonstration:** same findings, opposite valence, both honest. The CFO reads "blended NRR conceals SMB drag / efficiency degrading / concentration = fragility"; the CRO reads "growth accelerating / expansion engine / concentration = strength." Same rows, same numbers, two genuinely different, role-appropriate, fully-traceable dashboards — *composed live, not templated.*

**Scope guardrails (intended):** one tenant, two roles (CFO/CRO), hand-verified. NOT a general self-arranging engine for any tenant/role — the generalization lives in the write-up, not the build. Bounded primitives / layout templates, open composition within them (composition is role-specific; the model can't emit free layout that misleads).

---

## 4. Thesis 2 — the safe interaction pipeline (how you work with the data once IN)

**Intent:** the user can query in natural language OR request a visual, and the answer *composes into the living dashboard* (not a chat box) — through the *same* architecture as the entrance.

**The three layers:**
- **L1 — AI as ears.** Classify intent + extract entities from the natural-language input. Echo back "here's what I understood" for inspection. Benign failure mode (misclassify → wrong category of *correct* data, never invented numbers). This is the only place a probabilistic *confidence* number legitimately lives (interpretation confidence).
- **L2 — deterministic core.** The intent triggers a specific lookup/compute function. **All numbers come from here, pure code, computed live from raw rows at runtime.** Emits MetricValue objects.
- **L3 — AI as mouth.** Composes prose OR a chart spec *around* the verified MetricValue objects. Constrained: "use ONLY the provided data; do not infer, estimate, or add numbers." Narrates a verdict already rendered.

**The MetricValue breakthrough (the central innovation):** every number is emitted as a self-interpreting object carrying value + unit + label + status + delta + benchmark-basis + provenance. The model narrates an *already-rendered verdict*, so it cannot produce a wrong comparison (e.g. it literally cannot say "20 is below 40%" because the comparison is pre-computed and carried in the object).

**Two initiations, one architecture:** a query (→ prose) and a workflow/chart request (→ visual) run through the *same* L1→L2→L3 and the *same* MetricValue objects. The chart is "L3 renders a chart instead of prose," NOT a separate charting subsystem. This proves the architecture is output-agnostic — a general safety pattern, not a query trick.

**Query-feeds-the-dashboard:** a query result composes into the dashboard as a new block, placed by a deterministic `relatesTo` rule (the model says what the answer is *about*; the dashboard decides *where* it lands — the model never gets layout-placement authority). Reorganize-around-query is the demonstrated behavior; a lighter "add/replace chart" affordance signals productization without being a full product flow.

**Honest refusal:** on open input, when the engine can't compute something (e.g. "forecast next year's churn"), the system *declines* ("that's not something I compute") rather than improvising a number. The refusal is a demonstrated feature, not a hidden error state — it's the trust proof under open-ended input.

---

## 5. The honesty invariants (THE thing to audit hardest)

These are the load-bearing claims. The audit should try to *break* each one:

1. **The AI never authors substance.** No number, percentage, comparison, benchmark verdict, delta, or status is ever produced by the model — all are computed deterministically by the engine and only *referenced* by the model. (Check: is there any path where a model output string contains a figure the engine didn't compute?)
2. **Live computation, not pre-baking.** Metrics and MetricValues are computed at runtime from raw rows, not stored pre-computed in the dataset. The shipped dataset contains raw values only, no computed metrics/findings/verdicts. (Check: does the dataset smuggle any answers? Is the computation genuinely live?)
3. **One engine, oracle-verified.** There is a single canonical engine (`core/engine-core.ts`); the artifact's copy is *generated* from it, not hand-maintained (no drift). The engine reproduces an independent reference oracle: 113 panel checks + 14 findings. (Check: is the artifact actually running the canonical engine? Does it still reproduce the oracle?)
4. **The validator is real.** Any composition spec referencing an ID the engine didn't produce is rejected before render. (Check: fed a fabricated finding/ID, does it actually get refused, and does the dashboard still render safely?)
5. **The trace is real to the leaf.** Clicking any value walks its provenance down to the actual source rows and reconstructs the number from them — not a rendering of pre-baked nodes. (Check: does the trace genuinely resolve to rows and recompute, or is it decorative?)
6. **The renderer owns scales, not the model.** For charts (especially the dual-axis combo), the renderer computes axis scales deterministically from the data; the model may choose *which metrics / that it's a combo*, never a scale. (Check: can the model influence an axis in a way that could mislead?)
7. **Role divergence is composed, not templated, and stable.** CFO vs CRO produce structurally different dashboards from the same findings, reliably across repeated live runs (verified across multiple draws). (Check: run it several times — does divergence hold, do numbers stay correct, do any number-leaks appear in curated prose?)
8. **No number leaks in model-authored strings.** Curated framing/headlines refer to benchmarks *by name*, never by figure; no model-written line contains an engine-authored number. (Check: scan all "curated"/model-authored strings across several draws.)

**Presentation honesty (the extended invariant discovered during build):** the trust boundary covers not just numbers but *presentation* — chart-type selection and layout must be bounded so the model can't compose a *misleading* arrangement from honest parts. Charts/layout carry their own definitions/constraints; the model selects from validated-honest primitives/templates, it doesn't freely generate. (Check: is presentation genuinely bounded, or can the model produce a misleading-but-technically-accurate composition?)

---

## 6. Architecture / contract (what to verify structurally)

- **Contract types:** Provenance, MetricValue, Finding, and the composition layer (Block / Section / Composition), plus Intent and QueryResult (with an explicit `ok:false` refusal branch). Substance flows *by reference* — higher objects point at lower ones (Finding references MetricValue IDs, Block references Finding/MetricValue IDs), never copying values. One source of truth per number. (Check: is the reference-not-copy invariant actually held? Is there anywhere a value is copied and could drift?)
- **Two provenance layers:** MetricValue.provenance answers "how was this number computed"; Finding.provenance answers "why was this flagged notable." (Check: are both real and traceable?)
- **Composition:** two-level nesting (Composition → Section → Block; blocks are leaves). Query absorption via `relatesTo` (deterministic placement). (Check: does the model ever get layout-placement authority it shouldn't?)
- **Deployment seam:** the live-AI calls (L1 classify, entry curation, L3 compose) go through one function; in the sandbox it's the in-artifact API, in production it'd be a rate-limited edge function. Same shapes. There's a captured fallback if the model is unavailable (fallback, not facade — the default path is genuinely live). (Check: is the default cold path genuinely live, with fallback only on failure?)

---

## 7. Known scaffolding / intentional non-production choices (don't flag these as bugs)

- Data is **inlined** in the artifact (sandbox can't fetch a local file); production would `fetch` the bundle. The seam is marked.
- **Role "login"** is a role-select screen, not real auth — deliberate; auth is pure scope with zero thesis value.
- The dataset is **synthetic and authored top-down** (story written first, rows fitted to it) so there's known ground truth to prove the engine recovers. This makes residual noise lower than fully organic data (disclosed; salience scored on effect size, not t-stat, partly because of this). The engine had **no** privileged access to the authored story — it computes from raw rows only. (This is the one honest "tell" to be aware of, not a defect: data provenance is top-down, but the *analysis* is genuinely bottom-up.)
- Remaining primitives (treemap / grouped_bar / comparison_table) are additive-if-wanted, not required for the core story.
- The query "add/replace chart" is a *light* affordance illustrating productization, not a full product flow — intentional.

---

## 8. What a good audit produces

1. **Honesty-invariant verdict:** for each of the 8 (+presentation) invariants in §5 — does it hold *mechanically*, or is there a path that breaks/fakes it? This is the most important output.
2. **Drift check:** anywhere the implementation weakens, contradicts, or quietly fakes what this brief claims.
3. **Oracle check:** does the engine still reproduce the 113 panel checks + 14 findings from raw rows?
4. **Adversarial check:** try to make it (a) leak a number into curated prose, (b) render a fabricated finding, (c) improvise instead of refuse, (d) mislead via chart/layout — report what happens.
5. **Scope discipline:** anywhere it drifted from "opinionated demonstration" toward "half-built product" (scope creep) OR faked something that should be real (the worse failure).
6. **A skeptic's read:** if a sharp technical founder opened this cold and tried to catch it lying, where — if anywhere — would they succeed?

The single most important question the audit answers: **does the artifact's central claim — that the AI structurally cannot fabricate or misrepresent, verifiably and live — actually hold under inspection, or does it break/fake somewhere?**
