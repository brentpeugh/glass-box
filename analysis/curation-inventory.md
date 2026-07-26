# Curation Inventory — aggregation & classification

Denominator: [`menu.md`](./menu.md). Raw data: [`curation-inventory.json`](./curation-inventory.json).

## Headline

**The specified harness could not run. 0 of 43 runs executed.** Three boundaries stop it, each a
finding rather than something to route around (brief §1):

- **B1 — module boundary.** §3 says "reuse the shipped prompt path from `curation.ts`." It is not
  there. The entire curation orchestration — `curate`, `buildCurationPrompt`, `callModel`,
  `PERTURBATIONS`, `perturbedDataset`, `buildCatalog`, `PARTITIONS`, `deriveShape`/`selectPartition`,
  `fallbackCuration`, `FALLBACK`, `CHART_MENU` — lives in `src/App.tsx` and is module-internal
  (`App.tsx` exports only `default App`). The guardrails forbid editing App.tsx to export it and
  forbid a parallel prompt. **The curation logic is trapped in the view module; it cannot be
  driven, or measured, from anywhere else.**
- **B2 — no model key.** `ANTHROPIC_API_KEY` is not in the repo (Netlify env only). Every call
  would throw → every run falls to fallback → 0 usable selections (fallback is excluded, §3/§2a).
- **B3 — one perturbation, not twenty.** `PERTURBATIONS = { improve_cac }`. The 20 states the
  harness is sized for do not exist.

Even if the key existed (B2), B1 alone blocks it, and B3 caps the design space at 2 data states.

## Run counts

| | count |
|---|---|
| total attempted | 0 |
| live | 0 |
| fallback | 0 |
| excluded (fallback) | 0 |

## What *was* measurable — engine-side candidate denominator (base state)

Reachable from the exported surface (`createEngine`, `WIDGET_DOMAIN`, `RELATED_DOMAINS`). This is
the candidate set §4 calls "the important one" — the findings the engine surfaces *before* curation.

- **23 candidate findings** on the base (unperturbed) dataset.
- Domain distribution: **retention 13 · efficiency 7 · concentration 2 · growth 1.**
- **Salience is diffuse, not concentrated:** top-1 share **0.118**, top-3 share **0.411**,
  HHI **0.133** (≈ 1/23 would be 0.043 for a flat set; 0.133 is mildly peaked but far from
  dominated). The engine surfaces a broad field, not one runaway anomaly.
- Per-finding form candidacy (domain rule): the top finding *CAC Payback vs benchmark* (efficiency)
  admits **12** forms (efficiency + growth); *ARR spread across segments* (concentration) admits 11.

The full per-finding candidate list — id, fact kind, salience score, domain, eligible forms — is in
the JSON.

## §5 aggregations — status

| # | aggregation | status |
|---|---|---|
| 1 | selection frequency per form | **unmeasured** — needs model selections (B1/B2) |
| 2 | partition frequency / never-produced | **unmeasured** — `selectPartition` is unexported (B1); see note below |
| 3 | form × region-aspect matrix | **unmeasured** — needs placed runs (B1); the *possible* aspects per form are in `menu.md` Table 2 |
| 4 | co-occurrence | **unmeasured** — needs selections |
| 5 | role divergence | **unmeasured** — needs 2 live runs/state; mechanism note below |
| 6 | panel count vs salience concentration | **unmeasured** for selection; the salience side is measured (HHI 0.133, base) |
| 7 | nondeterminism (3 repeats) | **unmeasured** — needs live model |

## §6 three-bucket classification

The buckets **SELECTED / PASSED OVER / NEVER TRIGGERED** all require the model-selection signal,
which is unavailable (B1/B2). **On this evidence, every form is unclassified.** Reported honestly
rather than fabricated. What can be stated statically:

- **Candidacy (not selection) on the base state:** the 23 findings span all four domains, and
  `RELATED_DOMAINS` closes over the set (efficiency→{efficiency,growth}, retention→{retention,
  concentration}, growth→{growth,concentration}, concentration→{concentration,growth}), so the union
  of eligible domains across findings is all four. **No domain-gated form is un-candidate on the base
  state.** But candidacy per *run* is the anchor finding's neighborhood (~11–12 forms), not all 22.
- The two finding-cards and four `callout_*` forms sit outside `WIDGET_DOMAIN` and can't be placed
  in this scheme (their eligibility is implicit — `menu.md` Table 3).
- **NEVER TRIGGERED cannot be established** with 1 data state (B3). A form is only safely "never a
  candidate" if no dataset in the sweep surfaces a finding whose domain admits it; with one base
  state + one perturbation, the sweep is too small to earn that claim for any form.

## Partitions never produced — static note

`selectPartition` (unexported, B1) scores all 13 partitions by `fitScore` for `(F, C, T, shape)`,
`+8` for `asym`, biased to the partition whose `PARTITION_CHARACTER` matches `deriveShape(...)`.
With panel budget 6 and a typical run (1 finding-band + ~5 charts + 0–1 table), the `band`-leading,
chart-heavy partitions (`band_hero`, `band_hero_row`, `band_lead_matrix`, `band_pair_trio`,
`band_trio_trio`) are the plausible winners; the small `compact` partitions (`band_solo`, `pair`,
`split_table`) win only on sparse selections. **Which are actually never produced is empirically
undecidable here** — it depends on `deriveShape` over real model selections, which we can't run.

## Role divergence — mechanism note (unmeasured)

Divergence is not a per-role dataset. Both roles see the same salience ranking; `ROLE_DOMAIN_PRIORITY`
(CFO: efficiency→retention→concentration→growth; CRO: growth→retention→concentration→efficiency)
only changes which finding a role *leads* with, and `deriveShape` derives layout from the resulting
composition. So divergence is expected to be measurable but modest — it turns on whether the CFO's
and CRO's top-scoped findings fall in different domains. With base salience diffuse (HHI 0.133),
the lead can plausibly differ by role, but **the Jaccard/overlap the brief asks for needs the two
live runs (B1/B2).**
