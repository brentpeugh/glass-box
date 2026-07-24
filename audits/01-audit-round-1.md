# Glass Box — Audit Against the Caliper POC Brief

*Audit basis: full read of every source file (2,566 LOC), independent execution of both validators, adversarial probes against the live engine and validator, dataset forensics, and probes against the deployed site and edge function. The deployed bundle (`index-TFroW2rk.js`) is byte-identical to what this repo builds — the live site runs exactly the audited code.*

---

## The bottom-line answer first

**The central claim holds.** The model structurally cannot author a number, a comparison, a benchmark verdict, a chart scale, or a layout coordinate; every rendered figure is computed live from raw rows and traces to those rows, and I verified the trace recomputes rather than decorates. The validator genuinely rejects fabricated IDs, missing falsifiers, and authored numerals, and the app renders safely from the deterministic fallback when it does. The finding is genuinely data-derived: perturbing the input (cutting recent S&M 40%) flips the top finding from CAC payback to ARR concentration with no code change — I verified this independently, and it is the single most persuasive proof in the artifact.

**Where it's vulnerable is not the mechanism — it's the documentation.** The brief, the README, and `contract.ts` all describe a superseded architecture in places, and for an artifact whose thesis is "the medium embodies the message," doc drift *is* a thesis violation. A sharp founder reading the repo cold would not catch the numbers lying; they would catch the *documents* overclaiming, which lands adjacent to the same place. Details below.

---

## 1. Honesty-invariant verdicts

**I1 — The AI never authors substance: HOLDS (mechanically, for digits), with one precision caveat.**
Model output is JSON of IDs plus prose; prose passes `guardFraming`, which rejects any digit (reject-and-fallback, not trust). All rendered numbers come from MetricValue objects built engine-side in `buildCatalog`/`resolveKpi`/`resolveQuery`. There is no field on any model-produced object into which a value flows to the screen. Verified adversarially: `"CAC payback at 21mo"` → rejected; `"...twenty‑one months (2x the benchmark)"` → rejected (the `2x` trips it).
*Caveat:* fully spelled-out number-words and unicode fraction glyphs pass the guard. The prompt forbids them and the model has never been given the figures to spell out (see I8), so the leak requires the model to *invent* a number in words — but "mechanically impossible" is slightly stronger than what the regex enforces. Claim it precisely: digits and figures are structurally blocked; word-form numerals are prompt-forbidden with no data path to be *correct* even if attempted.

**I2 — Live computation, not pre-baking: HOLDS, verified.**
The dataset contains exactly: meta, benchmarks, metric *definitions* (prose config), and three fact tables (2,240 customers, 2,256 opps, 24 opex rows). Zero occurrences of `finding`, `salience`, `verdict`; the metric-name hits are all in the disclosed config blocks. No computed values ship. The engine computes at runtime; my independent leaf recompute of company ARR matched the MetricValue to 1e-7.

**I3 — One engine, oracle-verified: HOLDS, and is stronger than the brief claims.**
The brief describes an artifact copy *generated* from a canonical engine. The build superseded that: there is no copy at all — `src/engine-core.ts` is imported by both the Node validator and the browser app. No drift is possible because there is nothing to drift. Oracle: **113/113 panel checks, 14/14 findings reproduced** (run fresh in this audit). Deployed-bundle hash parity confirms the live site runs this exact engine.
*Caveat:* the 14-finding oracle targets the *legacy* detector battery (`runDetectors`), which the live path no longer uses for its headline finding. The live discovery path is covered instead by `validate-discovery.ts` (8/8, run fresh) — but that script is not wired into `package.json` or the README quickstart. The thesis-critical proof exists and passes; it's just not one command away. Add `validate:discovery` and mention it.

**I4 — The validator is real: HOLDS, verified adversarially.**
Fabricated evidence ID → dropped. Fabricated test ID → dropped. Fabricated widget ID → dropped, with the remaining legitimate picks still rendering. All-fabricated evidence → `viable: false` → deterministic fallback curation, board renders fully. No falsifier selected → rejected ("a read must be able to fail"). The falsifier requirement is a genuinely distinctive touch — it makes advocacy structurally inadmissible, which is beyond what the brief asked for.

**I5 — The trace is real to the leaf: HOLDS, with one cosmetic gap.**
`resolveLeaf` re-filters the raw rows live via structured `RowSelector`s; `RowsLeaf` recomputes the sum in the UI and displays the reconciliation. Verified: leaf recompute equals the parent MetricValue. Two nits: (a) the "✓ reconciles to the value above" glyph is rendered *unconditionally* rather than computed from an equality check — the two numbers are displayed so a mismatch would be visible, but the checkmark itself is decoration, and a skeptic reading the code will notice; make it a computed ✓/✗. (b) Retention leaves tabulate only movers (churned/contracted/expanded); flat accounts are in the cohort count but not the table — fine, but the recon line for retention is descriptive rather than arithmetic.

**I6 — The renderer owns scales: HOLDS trivially, by a stronger mechanism than briefed.**
The model never emits a ChartSpec at all in the current build — it selects widget IDs from a catalog whose data, benchmarks, and scales are entirely engine-produced, and every chart routes through `niceScale`. The dual-axis Combo computes both scales from data. The model cannot influence an axis because it has no channel that touches one. (Consequence: the `ChartSpec` type in contract.ts is dead — see drift.)

**I7 — Role divergence is composed, not templated, and stable: HOLDS, but by a *different mechanism* than the brief's centerpiece.**
The brief promises "same findings, opposite valence" — CFO reads concentration as fragility, CRO as strength. The live build does something different and, I'd argue, more defensible: a **decision-rights scope** decides which finding *leads* per role (same neutral salience ranking for everyone, disclosed objective #1 when it's out of remit), and the live model curates widgets/scorecard/framing per role within the validator's bounds. Layout is derived deterministically from the composition's weight shape. Determinism verified: salience ranking identical across repeated engine constructions. But the brief's opposite-valence demonstration survives only in the static `FALLBACK` compositions and in the README's description — it is not what a visitor sees on the live path. This is the largest single divergence between what the documents promise and what the build does. Either restore a valence-divergence demonstration or (better) rewrite the README/brief around the decision-rights mechanism, which is the stronger story — "no role-tilted framing of the same fact; role-scoped leads with full disclosure" is a *more* honest answer to the same problem.

**I8 — No number leaks in model-authored strings: HOLDS, with the I1 word-form caveat.**
Stronger than the brief's design: L3 never *sees* numbers. The narrate prompt passes only qualitative grounding facts (label, clears/breaches, rising/falling, proxy flag). The model cannot leak what it was never given. The brief's "MetricValue breakthrough — model narrates around verified MetricValue objects" describes the older design; the shipped one is tighter (the pre-computed comparison lives in `basis` and drives the *rendered* verdict; the model narrates only the verdict's direction). Engine-authored strings (finding summaries, test verdicts) contain numbers by design and are labeled as the engine layer.

**Presentation honesty (extended invariant): HOLDS structurally, with a heuristic edge.**
Layout: model gets one validated hint (`partitionPref` ∈ three values) that only *reinforces* a deterministically derived shape; placement is a rule-based packer; no coordinates ever cross the boundary. Chart-type misleading: impossible — selection from pre-verified primitives only. Misleading-by-omission: structurally hard, because the domain-scoped top-up fills the board from the finding's own neighborhood regardless of what the model picked.
*The heuristic edge:* directional admissibility (`guardDirection`) is a word-list regex. Verified: a flat contradiction ("exceeds the benchmark" on a breach) is caught and replaced by the engine-authored headline; but euphemistic positive framing ("performing wonderfully," "resilient and comfortable," "best-in-class") passes. So prose *valence* honesty is three-layered (prompt constraint → regex admissibility → engine-verdict fallback on detection) rather than mechanically impossible. This is a reasonable engineering posture — just don't claim it as structural. The precise claim: *numbers, comparisons, scales, and layout are structural; prose valence is defense-in-depth with the engine's verdict always winning when contradiction is detected.*

---

## 2. Drift check — where the implementation diverges from the brief

Ranked by how much they matter:

**D1. `contract.ts` is a monument, not a contract.** Only `engine-core.ts` imports it, and only for the substance types (MetricValue, Finding, Provenance, RowSelector). `Composition`, `Section`, `Block`, `ChartSpec`, `Intent`, `QueryResult`, and `relatesTo` are entirely unused — App.tsx builds its own untyped spec shapes. The file's header says "LOCKED CONTRACT... if a change would violate an invariant below, the change is wrong," yet the app doesn't route through it. The *invariants in the header comments* are all honored in spirit (often by stronger mechanisms), but the *types* describe the superseded architecture. This is the first thing a repo-reading founder will find, and it reads as "the honesty document doesn't match the build." Fix: either rewrite contract.ts to the current architecture (substance types + the curation contract + the router modes), or cut the dead types and move the invariant prose to where it's true. For this artifact specifically, this is the highest-leverage fix in the repo.

**D2. Query-feeds-the-dashboard via `relatesTo`: not implemented.** Answers live in the QueryModal as answer cards — which is closer to the "chat box" the brief explicitly defines itself against. The strong path that *was* built — `recurate`, re-orienting the whole board around a discovered finding the user focuses — is arguably the better demonstration of "the dashboard reorganizes around your interest," and the "both" mode (engine shows the value immediately, model framing waits for confirmation — *facts are free, interpretations are confirmed*) is a genuinely good idea the brief didn't have. But the brief's specific claim ("a query result composes into the living dashboard as a new block, placed by rule") is not delivered. Cheapest honest fix: a "pin to board" affordance on an answered card that inserts the answer widget into the current partition — or update the brief/README to claim re-orientation, not absorption.

**D3. README tells the old role story.** "The same findings produce opposite dashboards... rising Enterprise concentration reads as fragility to the CFO and strength to the CRO" describes the fallback compositions, not the live decision-rights path. A founder who enters both roles looking for that specific demonstration will find something different (and better) — but the mismatch costs credibility precisely because everything else checks out.

**D4. Model-mapping comment is wrong.** App.tsx: `CURATION_MODEL = "claude-opus-4-8"` with a comment "the Netlify function maps this to Opus." The function ignores the client's model field entirely (correct, server-authoritative) and pins curate to **Sonnet**. The in-app curation log will display the Sonnet model string, contradicting the code comment two panels away. Fix the comment (or genuinely map curate→Opus if that's the intent — the README's table says Sonnet, so the comment is the outlier).

**D5. L3 chart composition.** The brief: "L3 composes prose OR a chart spec." The build: chart *kind* for query answers is chosen deterministically in `resolveQuery` (callout/line/waterfall by metric and basis). The model has *less* authority than the brief grants it — honest drift, but the brief's "output-agnostic L3" claim should be restated as "output-agnostic *engine*; the model narrates either way."

**D6. Dead code.** `stripAuthoredNumbers`/`AUTHORED_NUM` defined, never called (the live guard is reject-not-strip — the right choice; delete the strip path). `DIM`, `SLOT_ELIG`/`elig` appear orphaned by the partition system. `top10Share`/`hhi` are computed by the engine and oracle-checked but surface nowhere in the UI. Small stuff, but a close reader notices.

---

## 3. Oracle check

Pass, fresh: **113/113 panel, 14/14 findings with ranking.** Note the coverage split: the 113 panel checks validate the metric functions the live path *does* use; the 14 findings validate the legacy detectors the live path *doesn't*. The live discovery path has its own 8-assertion proof (passes), which should be promoted to a first-class script (`validate:discovery`, ideally a combined `validate:all`) and named in the README, which currently only advertises the oracle run.

---

## 4. Adversarial check (what the brief asked me to attempt)

**(a) Leak a number into curated prose.** Digit and figure forms (21mo, 2x, $, %) blocked and non-viable → fallback. Word-form numerals pass the regex but the model is never given figures to verbalize; the residual risk is an *invented* word-number, prompt-forbidden. Verdict: blocked for every form that could be *correct*; tighten the guard with a number-word list if you want the claim airtight.

**(b) Render a fabricated finding.** Fabricated widget/evidence/test IDs all dropped by the validator; all-fabricated curation falls to the deterministic read; board renders completely either way (verified in code path: fallback spec + domain top-up guarantees a full partition). No path from a hallucinated ID to a pixel.

**(c) Improvise instead of refuse.** The router's `unsupported` mode declines with the reason and names what *is* answerable; an unmappable metric fails with "couldn't map that to a supported metric" rather than a guess; engine-uncomputable combinations fail closed. The TrustPanel enumerates the refused domains — refusal is a displayed feature, as specified.

**(d) Mislead via chart/layout.** No channel exists: no model-authored scales, coordinates, encodings, or chart specs; layout is packed by rule; partitionPref is validated and advisory. The only remaining lever is euphemistic prose valence (see presentation honesty above) — caught when contradictory, not when merely rosy.

**(e) Not requested, but found: the edge function is an open (if narrow) proxy.** Verified live: an unauthenticated caller could reach the model endpoint and obtain a completion; unlisted origins were rejected, unknown tasks rejected, payload/token caps held. The comments disclose the allowlist as soft "before exposing this widely" — but this URL *is* the public demo link, i.e., it is exposed widely now. Anyone reading the client bundle can extract the endpoint and burn spend against the console cap. Before wide distribution: require a recognized Origin (browsers always send one; costs legitimate users nothing) and add stateful per-IP rate limiting. The console spend cap is the backstop, but "the demo proxy got farmed" is not a conversation you want with a security-minded founder.

---

## 5. Scope discipline

Nothing was **faked** — that's the important half, and it's clean. On **creep**: the build grew several systems beyond the brief — the aspect-partition layout engine, ~20 chart primitives, the falsification test menu, the coherence neighborhood, decision-rights scoping, the perturbation, the audit log. Most of these *strengthen the thesis* (perturbation, falsifiers, and the neighborhood validator are the three best things in the artifact and none were in the brief). The one that reads as productization past demonstration need is the layout system: five aspect classes, thirteen partitions, weight-derived shape selection, and a packer is a lot of machinery to prove "the model doesn't get layout authority" — a claim three partitions would prove equally well. It's good machinery; it just dilutes the "opinionated instance" framing slightly. Not a defect, a note.

The brief's disclosed scaffolding all checks out: data fetched at runtime (not inlined — the brief's note about inlining is stale; the build improved past it), role select not auth, synthetic top-down data with genuinely bottom-up analysis (assertion 4 of the discovery proof — masking, the *planted* story, is explicitly NOT the selected finding — is exactly the right proof of that, and it passes).

---

## 6. A skeptic's read — where a sharp founder catches something

In descending order of sting:

1. **contract.ts** — "your honesty contract isn't what the app runs." Survivable but costly; the rebuttal ("the invariants hold via stronger mechanisms") requires *you* to be in the room. Fix the file and the objection evaporates.
2. **README role story vs. live behavior** — "you describe a demonstration that isn't the one I saw." Same shape of objection, same fix.
3. **"Mechanically impossible" vs. `guardDirection`** — "your valence guard is a regex; here's a euphemism that passes." Correct rebuttal exists (valence is layered defense, engine verdict wins on detection, and substance is structural) — but pre-empt it by claiming precisely in the README, and the objection becomes a compliment.
4. **The unconditional ✓ reconcile glyph** — trivial to fix, disproportionately embarrassing if spotted, because the checkmark is *the trust UI*.
5. **The open proxy** — a security-minded reader with devtools finds the endpoint in five minutes.

None of these break the artifact. All five are fixable in an afternoon, and four of them are documentation.

---

## 7. Is it strong enough to make a statement?

Yes — with the caveat that the statement it currently makes is slightly different from the one the documents claim. The mechanism is genuinely there: I tried to make it lie and could not reach the screen with anything the engine didn't compute. The discovery path (neutral salience → neighborhood → falsifier-required curation → coherence validation → perturbation re-derivation) is a *stronger* thesis than the brief's, because it answers the objection the brief's version invites ("you planted the story") with a live, verifiable "change the data and watch the finding re-derive."

The punch list, in order of leverage:

1. Rewrite `contract.ts` to the shipped architecture (or cut dead types and relocate the invariant prose). The honesty doc must be true for this artifact more than any other.
2. Update README's role-divergence section to the decision-rights mechanism, and restate "mechanically impossible" precisely (structural for substance/scales/layout; layered for prose valence, engine verdict wins).
3. Harden the function before the next founder send: reject empty Origin + rate limit.
4. Make the reconcile ✓ computed; extend the numeral guard to number-words.
5. Wire `validate:discovery` into scripts/README (and both validators into a pre-deploy step).
6. Fix the Opus comment; delete `stripAuthoredNumbers`.
7. Decide the query-absorption story: either add "pin to board" or update brief/README to claim re-orientation.

Items 1–2 convert the skeptic's two best attacks into evidence of discipline. After those, the artifact's weakest surface is stronger than most production systems' strongest claim.

---

*Probe script used for the adversarial checks is included as `audit_probe.ts` (runs with `npx tsx` from the repo root).*
