# Curation Inventory — Run 2 (post domain-relatedness fix)

Base: main @ 3e409c1. Re-run of docs/briefs/inventory.md. The offer/admit fix landed, so the offered menu changed for concentration anchors; run-1 form-level results are stale. Run 1 (baseline) preserved at analysis/curation-inventory.{json,md}.

**State-reset assertion (§2):** **PASS** — base → perturbed → base, base candidate sets byte-identical. Perturbation changes candidates: true.

**Model access:** Netlify function **bypassed** — `callModel` injected at the seam, direct to `api.anthropic.com/v1/messages`, key from `.env.local`. Skips **Origin allowlist** + **per-IP rate limiter**. Prompt from `buildCurationPrompt`. Matched params: `model=claude-sonnet-4-6`, `max_tokens=600`, **temperature unset → API default 1.0**, no system, no stop. Offer now sourced from `admissibleLenses(nb)` (post-fix).

**Run counts:** total 40 · live 40 · fallback 0 · excluded 0. Rate-limit (429/529): 0.

## Selection frequency per form (live)

| form | domain | eligible | selected | rate |
|---|---|--:|--:|--:|
| hbar_nrr | retention | 30 | 30 | 100% |
| efficiency_combo | efficiency | 10 | 10 | 100% |
| magic_line | efficiency | 10 | 10 | 100% |
| metric_matrix | efficiency | 10 | 10 | 100% |
| efficiency_bullets | efficiency | 10 | 10 | 100% |
| segment_stack | growth | 10 | 10 | 100% |
| segment_table | concentration | 30 | 30 | 100% |
| pareto_arr | concentration | 30 | 30 | 100% |
| treemap_arr | concentration | 30 | 30 | 100% |
| quadrant_eff | efficiency | 10 | 10 | 100% |
| heatmap_retention | retention | 30 | 26 | 87% |
| dumbbell_ret | retention | 30 | 18 | 60% |
| masking_card | retention | 30 | 7 | 23% |
| lorenz_arr | concentration | 30 | 7 | 23% |
| bridge_blended | retention | 30 | 2 | 7% |
| bridge_smb | retention | 30 | 0 | 0% |
| bridge_enterprise | retention | 30 | 0 | 0% |
| accel_line | growth | 10 | 0 | 0% |
| scatter_eff_growth | efficiency | 10 | 0 | 0% |
| heatmap_metrics | efficiency | 10 | 0 | 0% |
| indexed_arr | growth | 10 | 0 | 0% |
| grouped_growth | growth | 10 | 0 | 0% |
| small_mult_arr | growth | 10 | 0 | 0% |

**SELECTED:** masking_card, bridge_blended, hbar_nrr, efficiency_combo, magic_line, metric_matrix, efficiency_bullets, segment_stack, segment_table, pareto_arr, treemap_arr, lorenz_arr, quadrant_eff, dumbbell_ret, heatmap_retention

**PASSED OVER:** bridge_smb, bridge_enterprise, accel_line, scatter_eff_growth, heatmap_metrics, indexed_arr, grouped_growth, small_mult_arr

**NEVER ELIGIBLE:** —

## Partition frequency (live)

| partition | count |
|---|--:|
| band_trio_trio | 23 |
| band_hero_row | 10 |
| band_pair_trio | 7 |

**Never produced:** band_hero, band_lead_matrix, band_trio_pair, grid_six, split_table, band_solo, band_pair, band_trio, band_duo_table, pair

## Role divergence

- **base**: mean Jaccard(CFO,CRO) over 10 pairs = **0.00**
- **improve_cac**: mean Jaccard(CFO,CRO) over 10 pairs = **0.78**

## Nondeterminism (within-cell, 10 repeats)

| cell | distinct selections | modal-selection share | distinct partitions | distinct panel counts |
|---|--:|--:|--:|--:|
| base/CFO | 3 | 60% | 1 | 1 |
| base/CRO | 5 | 60% | 2 | 1 |
| improve_cac/CFO | 9 | 20% | 2 | 1 |
| improve_cac/CRO | 5 | 60% | 2 | 1 |

## Rejections per cell

| cell | total rejections | runs w/ ≥1 |
|---|--:|--:|
| base/CFO | 0 | 0 |
| base/CRO | 0 | 0 |
| improve_cac/CFO | 0 | 0 |
| improve_cac/CRO | 0 | 0 |

Guard totals: none.

## Δ Delta vs run 1 (baseline analysis/curation-inventory.json)

Report of movement only — no interpretation.

### 1. Rejection count

Run 1 total: **30** · Run 2 total: **0** · Δ **-30**.

Guards — run 1: off-domain widget(s) — dropped ×30 · run 2: none.

### 2. Retention forms (the 7 previously NEVER ELIGIBLE)

| form | run1 selected | run2 selected | run2 eligible | Δ selected |
|---|--:|--:|--:|--:|
| masking_card | 0 | 7 | 30 | +7 |
| bridge_smb | 0 | 0 | 30 | 0 |
| bridge_enterprise | 0 | 0 | 30 | 0 |
| bridge_blended | 0 | 2 | 30 | +2 |
| hbar_nrr | 0 | 30 | 30 | +30 |
| dumbbell_ret | 0 | 18 | 30 | +18 |
| heatmap_retention | 0 | 26 | 30 | +26 |

Retention selections gained (Σ): **+83**. Forms that lost selections run1→run2 (displaced): scatter_eff_growth (-4).

### 3. SELECTED / PASSED OVER changes

SELECTED added (run2 not run1): masking_card, bridge_blended, hbar_nrr, dumbbell_ret, heatmap_retention

SELECTED removed (run1 not run2): scatter_eff_growth

PASSED OVER added (run2 not run1): bridge_smb, bridge_enterprise, scatter_eff_growth

PASSED OVER removed (run1 not run2): none

NEVER ELIGIBLE — run1: masking_card, bridge_smb, bridge_enterprise, bridge_blended, hbar_nrr, dumbbell_ret, heatmap_retention · run2: —

### 4. Partition frequency

Never-produced count — run1: **10 of 13** · run2: **10 of 13** · Δ **0**.

Partitions newly PRODUCED in run2 (absent in run1): none

Partitions newly ABSENT in run2 (produced in run1): none

| partition | run1 | run2 |
|---|--:|--:|
| band_hero | 0 | 0 |
| band_hero_row | 10 | 10 |
| band_pair_trio | 4 | 7 |
| band_lead_matrix | 0 | 0 |
| band_trio_trio | 26 | 23 |
| band_trio_pair | 0 | 0 |
| grid_six | 0 | 0 |
| split_table | 0 | 0 |
| band_solo | 0 | 0 |
| band_pair | 0 | 0 |
| band_trio | 0 | 0 |
| band_duo_table | 0 | 0 |
| pair | 0 | 0 |

### 5. Role divergence (mean Jaccard CFO vs CRO)

| state | run1 | run2 | Δ |
|---|--:|--:|--:|
| base | 0.00 | 0.00 | 0 |
| improve_cac | 0.90 | 0.78 | -0.12 |

### 6. Nondeterminism (distinct selections · modal-selection share)

| cell | run1 distinct | run1 modal | run2 distinct | run2 modal | Δ distinct |
|---|--:|--:|--:|--:|--:|
| base/CFO | 5 | 50% | 3 | 60% | -2 |
| base/CRO | 1 | 100% | 5 | 60% | +4 |
| improve_cac/CFO | 2 | 60% | 9 | 20% | +7 |
| improve_cac/CRO | 1 | 100% | 5 | 60% | +4 |

