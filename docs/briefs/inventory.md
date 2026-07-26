# Glass Box — Curation Inventory Brief (revised)

**For:** Claude Code, working in `glass-box/`
**Supersedes:** the original inventory brief, which was sized for 20 perturbation states that
don't exist and used a three-bucket classification that the denominator has since ruled out.
**Type:** measurement. **No design work, no trimming, no fixes.**

---

## 0. What changed since the first attempt

The curation orchestration is now importable:

| module | holds |
|---|---|
| `src/engine.ts` | the `E` singleton, `BASE_DS`, `initEngine`, `setBaseDS` |
| `src/catalog.ts` | `buildCatalog`, `CHART_MENU` |
| `src/layout.ts` | `PARTITIONS`, `deriveShape`, `selectPartition`, `fillPartition` |
| `src/curate.ts` | `curate`, `buildCurationPrompt`, `callModel`, `fallbackCuration`, `FALLBACK` |
| `src/perturbations.ts` | `PERTURBATIONS`, `perturbedDataset` |

`curate()` accepts an injected `callModel`. Use the seam; do not write a parallel prompt.

Two findings from the denominator already constrain the design:

- **Eligibility is domain-membership, not a statistical predicate.** `WIDGET_DOMAIN[form]` ∈ the
  finding's related domains, and `RELATED_DOMAINS` closes over the domains present. On the base
  dataset nearly every form is eligible. So the NEVER TRIGGERED bucket is near-empty and the
  classification collapses to two.
- **There is one perturbation** (`improve_cac`), so the design space is 2 data states.

---

## 1. Guardrails

Read-only against `src/`. New work goes in `scripts/inventory.ts` (replace the existing stub)
and `analysis/`.

Do not fix anything you find. Do not trim `CHART_MENU` or `PARTITIONS`. Do not change the
prompt. Report instead.

All three validators green at the end, unchanged: `validate.ts`, `validate-discovery.ts`,
`validate-curation.ts`.

---

## 2. HARD REQUIREMENT — reset engine state between runs

`E` and `BASE_DS` are a shared mutable module singleton, mutated by `initEngine` / `setBaseDS`.
`buildCatalog`, `fallbackCuration`, and `perturbedDataset` all read it.

**Every run must reset engine state before it begins.** A prior run's dataset leaking into the
next silently contaminates every downstream statistic and nothing will flag it.

Prove it: run the base state, then the perturbed state, then the base state again, and assert
the two base candidate sets are byte-identical. Report that assertion result at the top of your
findings. If it fails, stop — the rest of the data is worthless.

---

## 3. The harness

**2 data states × 2 roles × 10 repeats = 40 live runs.**

Model nondeterminism is now the primary variance being measured, not a footnote. Ten repeats per
cell is what makes within-cell variance measurable.

Model access: prefer `netlify dev`, which runs the real shipped function with the project's env
vars. A direct API call injected through the `callModel` seam is acceptable if you state that
you used it. Either way the prompt must come from `buildCurationPrompt`.

**Any run landing in fallback is excluded from selection statistics and counted separately.**
A fallback run has no model selection; including it fabricates a data point.

If you hit the rate limiter, report it. Do not disable it.

---

## 4. Log per run

run id · data state · role · repeat index · `source` (live/fallback) ·
**candidate set** (every finding pre-curation: id, form-domain, salience) ·
**selected set** (ids in the model's order) · panel count ·
partition id · region assignments (region index → form → aspect) ·
rejections (count, guard, original claim) · verbatim model response

Raw to `analysis/curation-inventory.json`.

---

## 5. Aggregation → `analysis/curation-inventory.md`

1. **State-reset assertion** (§2) — pass/fail, first line.
2. **Selection frequency per form** — times selected ÷ times eligible.
3. **Two-bucket classification.** SELECTED: chosen at least once. PASSED OVER: eligible one or
   more times, never chosen. List both explicitly. Note anything that was never eligible.
4. **Head-to-head substitution.** For each finding that recurred across runs, which form was
   chosen and what the eligible alternatives were. A form that consistently loses to a specific
   other form is a redundancy, not just an unpopular option — this is the highest-value trim
   input.
5. **Partition frequency.** Which partitions `deriveShape` actually produces. List any never
   produced.
6. **Form × region-aspect matrix.** For every form, the aspect ratios of regions it landed in.
   This is what an aspect-to-form admissibility rule gets built from.
7. **Role divergence.** Jaccard between CFO and CRO selections, per data state, averaged across
   repeats, plus which findings were unique to each. State whether divergence is measurable.
8. **Nondeterminism.** Within-cell variance across the 10 repeats: how often the same state and
   role produce the same selection, the same partition, the same panel count.
9. **Panel count distribution**, and whether it tracks salience concentration.
10. **Rejection rate** per cell, and which guards fired.

---

## 6. Registry drift check

`CHART_MENU` (in `catalog.ts`, selection-side) and `CHART_KINDS` (still in `App.tsx`,
render-side) are two registries of forms with nothing enforcing agreement.

Report any form present in one and absent from the other. Do not fix it. Recommend an assertion
for `validate-curation.ts` — a later trim will need it.

---

## 7. Report

- state-reset assertion result
- run counts: total, live, fallback, excluded
- SELECTED and PASSED OVER lists
- head-to-head substitution table
- partitions never produced
- role divergence, with numbers
- nondeterminism, with numbers
- registry drift
- anything you could not measure, and why
- all three validators green
