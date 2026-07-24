# Caliper / Glass Box — Scope & Goal (Audit Brief, v2)

> **AUDIT RECORD NOTE — this is the CURRENT brief, rewritten after the audit to describe the
> shipped architecture.** For the original document round 1 was audited against, see
> `00-scope-brief-original.md`. The difference between the two is itself part of the record.

*Hand this to a fresh chat along with the codebase (and, ideally, the live URL). It states what the artifact is intended to be and do, so an audit can measure the build against intent rather than guessing at it. The audit's job is to verify the build honors this scope — especially the honesty invariants, which are the whole point — and to surface any place the implementation drifts from, weakens, or fakes what's claimed here. This brief describes the shipped architecture; if the build and the brief disagree, that disagreement is itself a finding.*

---

## 1. What this is (and is not)

**This is:** a portfolio artifact — a working, deployed, interactive demonstration of a trust architecture for AI-mediated analytics. Its job is to *prove a thesis*, legibly and verifiably, to a sophisticated technical evaluator (founders/hiring decision-makers at AI-native analytics/BI companies). It is deployed at glass-box-provenance.netlify.app; the deployed bundle should be byte-identical to what the repo builds — parity between repo and production is part of the claim.

**This is NOT:** a commercial product, a general platform, or a production system. It is an *opinionated instance* that illustrates concepts and demonstrates that every function is *scalable in principle* — not a fully commercialized flow. Where it diverges from how a real product would work, that's intentional; the job is demonstration, not productization.

**Domain:** synthetic B2B SaaS financials (fictional tenant "Caliper Systems," ~$40M ARR Series C). Chosen to be relevant to the target audience (FP&A/BI) and non-automotive.

**What it must communicate, all at once:** (a) the trust thesis solved, (b) product sense / understanding of the space, (c) design judgment. The medium is meant to embody the message — trust demonstrated at every layer, including the design *and the documentation*. Overclaiming in this brief, the README, or the contract file is itself a thesis violation; the claims are drawn exactly where the code draws them.

---

## 2. The core thesis (what the whole thing exists to prove)

**One principle:** the deterministic core owns all substance, salience, and provenance; the model is bounded to interpretation — deciding what to foreground, for whom, and how to phrase it — and every degree of freedom it has is validated against engine-produced material before anything renders.

The trust claim is stated in two precise tiers, and the audit should hold the build to the distinction:

**Structural (no channel exists for the model to violate these):**
- **S1.** Every rendered number is a MetricValue computed engine-side from raw rows at runtime. The model emits JSON of ids + prose only; no field on any model-produced object carries a value to the screen.
- **S2.** Every number references its inputs by id down to raw-row leaves; provenance is emitted at compute time, and the trace *re-resolves* leaves live (a structured RowSelector re-filters the rows and recomputes) — never reconstructs or decorates. The reconcile mark in the trace UI is *computed* from the recomputation, not asserted.
- **S3.** All chart scales, axes, and baselines are computed by the renderer from engine data. The model selects widget ids from a pre-built catalog; there is no ChartSpec channel, so it cannot touch an axis, an encoding, or a baseline.
- **S4.** Layout is a deterministic rule-based packer over a shape derived from the composition's weight distribution. The model's one hint (partitionPref, three validated values) only reinforces the derived shape; no coordinate crosses the boundary.
- **S5.** Comparisons and verdicts (clears/breaches, deltas vs benchmark) live in MetricValue.basis, computed engine-side. The model narrates verdicts already rendered; it never authors one.

**Layered defense (defense-in-depth, engine's verdict wins on detection — deliberately NOT claimed as structural):**
- **L1.** Prose *valence* honesty: the narration model receives only qualitative grounding (label, clears/breaches, rising/falling, proxy flag) — it is never shown a figure, so it cannot leak what it never had. A directional guard rejects framing that contradicts the engine's verdict and replaces it with an engine-authored headline. A flat contradiction is caught; a merely euphemistic gloss can pass — but the engine's verdict always renders beside the prose, so words can never invert what the number says.
- **L2.** Numeral leakage: a guard rejects (not strips) any model string containing a digit, a unicode fraction, or a word-form figure ("twenty-one months," "sixty percent"), while allowing ordinary determiners ("one segment," "three quarters"). Engine-*named* labels that contain digits ("Rule of 40") are whitelisted by exact string — naming an engine object is referencing, not authoring — and a bare digit beside a whitelisted label still trips.

---

## 3. Thesis 1 — discovery, not narration of a script (how the finding exists)

**Intent:** the headline finding is *derived from the data by a neutral statistical surface*, not planted, not story-tuned, and demonstrably so.

**How it works:**
- The engine computes every metric's anomaly along five principled, uniform dimensions — benchmark deviation, cross-segment dispersion, aggregate-component divergence, adverse trend, concentration — standardizes within each dimension (z-score), and ranks globally. `topFinding()` is exactly the top of that ranking; no re-selection.
- From the top fact's metric cluster the engine derives a **finding neighborhood**: the definitionally related evidence metrics, the tests that could probe the read, and — critically — the **falsifiers**, tests that could *weaken* it. Adjacency is definitional (provable from the formulas), not fit from co-movement (which at 8 quarters is trend-confounded and n-starved — verified and disclosed).
- The **perturbation** is the proof of non-scriptedness: a transparent, single-axis change to the *input* data (cut recent S&M ~40%) — never a re-authored dataset — after which salience recomputes from scratch and a different finding surfaces on its own (concentration replaces efficiency), the whole app re-orienting with no code change. Discipline: change the input condition, never the output finding.
- The one *planted* narrative in the synthetic data (blended NRR masking SMB) is explicitly **not** the selected top finding — the validation suite asserts this, proving the analysis is bottom-up even though the data's provenance is top-down.

---

## 4. Thesis 2 — bounded curation and role scoping (how a board composes)

**Intent:** roles get materially different, live-composed dashboards from the *same neutral ranking* — with zero role-tilted framing of any fact.

**How it works:**
- Every role sees the **same salience ranking**. A **decision-rights scope** (who owns the lever that moves the metric — defined over domains, with zero reference to any finding, so it's outcome-blind and portable) decides which finding *leads* per role: CFO owns capital efficiency and portfolio risk; CRO owns growth motion and retention; concentration is shared. The objective #1 is **always disclosed** and led-with only when in-remit. Boards *diverge* when the roles' leading findings differ and *converge* when shared — perturb the data and watch them converge on their own.
- A live model call (Sonnet, server-pinned) then curates *around that lead*: a numeral-free thesis, evidence ids, test ids (must include ≥1 falsifier — a read that cannot fail is inadmissible, so advocacy is structurally rejected), widget ids, and headline-strip metrics — all selected **only from engine menus**.
- A **coherence validator** (pure function, shared verbatim between the app and the validation script) drops any id outside the finding's neighborhood, rejects off-domain widgets, rejects framing with authored numerals or a direction contradicting the engine's verdict, and rejects any curation without a falsifier. Non-viable → a deterministic, always-coherent fallback renders; the board composes fully either way. Every drop/rejection is recorded and displayed (curation log, audit log, trust panel) — governance is a shown feature, not a hidden filter.

---

## 5. Thesis 3 — the query boundary (how open input stays honest)

**Intent:** natural-language input is routed, echoed back, grounded, and — when it exceeds the deterministic substrate — *declined*, never improvised past.

**How it works:**
- A **router** (Haiku, server-pinned) classifies input into four modes: **answer** (pointed metric question → the engine computes; the model narrates from qualitative grounding only), **reorient** (topic interest → the board re-curates around a *discovered, ranked* finding the user focuses), **both** (genuinely ambiguous → the engine-computed value shows immediately, the model's framing waits for the user's confirmation — *facts are free, interpretations are confirmed*), and **unsupported** (outside the data contract → declined with the reason and what *is* answerable). The router's echo and confidence are displayed; intent confidence is the only probabilistic number in the system, and it is about the question, never the answer.
- Chart form for answers (callout / trend line / bridge) is chosen **deterministically** by the engine's resolver from the metric and basis — the model has no output-form authority on the answer path.
- Query results render as answer cards; a focused finding re-orients the whole board (re-orientation, not block-absorption, is the demonstrated behavior — the earlier `relatesTo` block-placement design was superseded and is intentionally absent).
- Honest refusal is a first-class demonstrated feature; the trust panel enumerates what the data contract answers and what it refuses (geography, product line, reps, channel, headcount).

---

## 6. Verification & deployment posture (what to check structurally)

- **One engine, two consumers:** `src/engine-core.ts` is the single hand-written engine, imported by both the Node validators and the browser app — no generated copy, so drift is impossible by construction.
- **Two proof suites, both wired into `npm run validate`:** the **oracle** (113 panel checks + 14 findings from an independent Python-generated reference — note the 14 findings target the *legacy* detector battery, retained as oracle target and diagnostics only) and the **discovery-path proof** (10 thesis-critical assertions covering the live path: data-derived top finding, neighborhood derivation, planted-story rejection, validator drops, falsifier requirement, numeral/direction guards, label whitelist).
- **Contract file (`src/contract.ts`)** documents the shipped types and states the structural/layered taxonomy explicitly. It is accurate documentation; its curation types are not compiler-enforced (App.tsx is untyped) — a known, acceptable demo-scale choice.
- **Model access:** one Netlify Functions 2.0 endpoint; task→model mapping is server-authoritative (client's model field ignored); shape/size validation; **Origin required and allowlisted** (a missing Origin is rejected — non-browser callers can't farm the proxy); **per-IP rate limiting in two layers** — an in-memory per-instance counter that cannot fail or misconfigure, plus Netlify Blobs (strong consistency) for cross-instance state, fail-open-but-loud. The limiter is verified *empirically* (`scripts/probe-limit.sh` — a burst past the configured limit must be rejected at the first request over it); a fail-open limiter looks identical alive or dead from the code, which prior revisions proved the hard way. The hard spend cap in the Anthropic console is the ultimate backstop.
- **Graceful degradation:** without the function (plain `vite`), model calls fail and the UI falls back to captured compositions and deterministic reads — engine, charts, and provenance fully live. Fallback, not facade: the default deployed path is genuinely live.

---

## 7. Known scaffolding / intentional non-production choices (don't flag these as bugs)

- The dataset is **fetched at runtime** (`public/caliper_dataset.json`) and contains raw rows + config only — no computed metrics, findings, or verdicts (the audit should verify this).
- **Role "login"** is a role-select screen, not real auth — auth is pure scope with zero thesis value.
- The dataset is **synthetic and authored top-down** (story written first, rows fitted) so there's known ground truth to prove the engine recovers; residual noise is lower than organic data (disclosed; salience scored on effect size partly for this reason). The engine has no privileged access to the authored story — the discovery proof's planted-story assertion is the check.
- The **neighborhood clusters, test menu, and widget-domain map are hand-authored** for this closed world. That is the demo-scale stand-in for a declared semantic layer (dbt/Cube/Malloy in spirit); production derives these from a registry. The boundary is what makes it trustworthy; the semantic layer is what makes it scale — the generalization argument lives in the write-up, not the build.
- The in-memory rate-limit layer is **per-instance best-effort** (disclosed); the Blobs layer's read-modify-write is racy at high concurrency and keys don't expire — fine at demo scale, noted for later.
- The metric vocabulary is a closed enum and the query resolver is hand-wired dispatch — a faithful miniature of the registry-driven production shape, deliberately not the thing itself.

---

## 8. What a good audit produces

1. **Structural-claim verdict:** for each of S1–S5 — does it hold *mechanically* (no channel), or is there a path that breaks or fakes it? This is the most important output.
2. **Layered-claim verdict:** for L1–L2 — do the guards behave as described, and do the *claims* anywhere (brief, README, contract, UI copy) overstate them as structural?
3. **Discovery verdict:** is the finding genuinely data-derived (run the perturbation; confirm re-derivation and ranking determinism across repeated runs)? Is the planted story rejected?
4. **Oracle + discovery suites:** run `npm run validate` fresh; both must pass in full.
5. **Adversarial check:** try to (a) leak a figure (digit, word-form, fraction, and label-adjacent forms) into model prose, (b) render a fabricated finding/test/widget id, (c) obtain improvisation instead of refusal on out-of-contract input, (d) mislead via chart form or layout, (e) reach the deployed model endpoint without a recognized Origin, and exceed its configured rate limit. Report what happens.
6. **Parity & drift check:** confirm the deployed bundle is byte-identical to the repo build; flag anywhere code, docs, or deployed behavior disagree with each other or with this brief — including claims that are true in code but false in production. Documentation drift is a first-class finding here, not a nit.
7. **Scope discipline:** anywhere it drifted from "opinionated demonstration" toward "half-built product," OR faked something that should be real (the worse failure).
8. **A skeptic's read:** if a sharp technical founder opened this cold and tried to catch it lying, where — if anywhere — would they succeed?

The single most important question the audit answers: **does the artifact's central claim — that the model structurally cannot author or misrepresent substance, verifiably, live, and in production — actually hold under inspection, or does it break/fake somewhere?**
