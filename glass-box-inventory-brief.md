# Glass Box — Curation Inventory Brief

**For:** Claude Code, working in `glass-box/`
**Type:** measurement. Read-only analysis plus one new script. **No design work, no trimming.**

---

## 0. Purpose

The engine offers a large menu of partitions and chart/table forms, but the model appears to
select from a narrow, fairly consistent subset because the choices are tied to the statistical
analysis. Before anything is trimmed or redesigned, we need the actual distribution.

This turn measures. It does not change what the product does or how it looks.

---

## 1. Guardrails

**Do not modify:** `src/engine-core.ts`, `src/contract.ts`, `src/curation.ts`,
`src/App.tsx`, `src/index.css`, `netlify/functions/curate.ts`, or any existing script.

New work goes in `scripts/inventory.ts` and `analysis/`. Import from the existing modules;
never edit them. If a needed value isn't exported, **report it rather than adding an export** —
that's a finding about the module boundary, not a blocker to route around.

All four validators must be green at the end, unchanged.

---

## 2. Step one — the denominator

Static enumeration. Before running anything, produce the complete list of what is *available*:

- every partition in the `PARTITIONS` table, with its region count and each region's aspect
- every chart form and table form in `CHART_MENU` and anywhere else forms are registered
- for each form, the statistical condition that makes it eligible (read it from the code; if
  eligibility is implicit rather than declared, say so — that itself is worth knowing)

Write this to `analysis/menu.md` as three tables. This is the denominator for everything below.

---

## 3. Step two — the harness

`scripts/inventory.ts` drives real curation runs and logs the results.

- **20 perturbation states × 2 roles (CFO, CRO) = 40 runs.** Perturbation reseeds the data, so
  each state exercises a different statistical condition set. Use the same perturbation entry
  point the app uses.
- **Plus 3 repeat runs on one fixed state and role**, to measure model nondeterminism separately
  from data variation.
- Reuse the shipped prompt path from `curation.ts`. Do not write a parallel prompt — the point
  is to measure what ships.
- The deployed function has a Netlify Blobs rate limiter. Run against local, or pace the calls.
  If you hit the limiter, report it; do not disable it.
- **Log every model response verbatim.** The run log has to be auditable after the fact.
- **Any run that lands in fallback is excluded from selection statistics** and counted separately.
  A fallback run has no model selection in it, so including it would fabricate a data point.
  This is the same failure class 2a corrected.

---

## 4. Step three — what to log per run

Per run, record:

| field | notes |
|---|---|
| run id, role, perturbation state, timestamp | |
| `source` | live / fallback — fallback runs excluded from selection stats |
| **candidate set** | every finding the engine surfaced *before* curation: id, form, salience score |
| **selected set** | what the model chose: ids, in the model's order |
| panel count | selected ÷ available |
| partition id | which partition `deriveShape` produced |
| region assignments | region index → form → that region's aspect ratio |
| salience shape | top-1 share, top-3 share, and a concentration measure across the candidate set |
| rejections | count, which guard fired, the original claim |
| model response | verbatim |

The **candidate set is the important one** and it is easy to omit. See §6.

---

## 5. Step four — aggregation

Write `analysis/curation-inventory.md` with:

1. **Selection frequency per form** — times selected ÷ times it appeared as a candidate.
2. **Partition frequency** — which partitions `deriveShape` actually produces, with counts.
   List any partition never produced.
3. **Form × region-aspect matrix** — for every form, the aspect ratios of the regions it landed
   in. This is the highest-value output; it's what an aspect-to-form admissibility rule would be
   built from.
4. **Co-occurrence** — which forms appear together, and which never do.
5. **Role divergence** — for each perturbation state, the overlap between the CFO and CRO
   selections (Jaccard plus which findings were unique to each). Report whether divergence is
   measurable or whether the two roles largely converge.
6. **Panel count vs salience concentration** — does the model select fewer panels when salience
   is concentrated? Report the relationship, or its absence.
7. **Nondeterminism** — across the 3 repeat runs, how much the selection varied.

Raw per-run data to `analysis/curation-inventory.json`.

---

## 6. Step five — the classification that decides the trim

For every form on the menu, classify it into exactly one bucket:

- **SELECTED** — appeared as a candidate and was chosen at least once.
- **PASSED OVER** — appeared as a candidate one or more times and was never chosen.
  These are the deletion candidates.
- **NEVER TRIGGERED** — never appeared as a candidate at all, because the statistical condition
  it serves never occurred in the synthetic data.

**This distinction is the whole point of the exercise.** A form in the third bucket is not a bad
form — it is an untested one, and deleting it would remove capability that a different dataset
would exercise. Only the second bucket is safely deletable on this evidence.

Report the three lists explicitly. For anything in NEVER TRIGGERED, state what data condition
would be needed to trigger it.

---

## 7. Deliverables

- `scripts/inventory.ts`
- `analysis/menu.md` — the denominator
- `analysis/curation-inventory.json` — raw runs
- `analysis/curation-inventory.md` — the aggregation and the three-bucket classification

## 8. Report

- run counts: total, live, fallback, excluded
- the three-bucket classification, as lists
- partitions never produced
- whether role divergence is measurable, with the numbers
- anything you could not measure, and why
- any value you needed that the modules don't export
- all four validators green
