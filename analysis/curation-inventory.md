# Curation Inventory

**State-reset assertion (§2):** **PASS** — base → perturbed → base; the two base candidate sets are byte-identical. Perturbation changes the candidate set: true.

**Model access:** Netlify function **bypassed** — `callModel` injected at the seam, POSTing directly to `api.anthropic.com/v1/messages` with the key from `.env.local`. This skips the **Origin allowlist** and the **per-IP rate limiter**. Prompt from `buildCurationPrompt` (no parallel prompt). Request body matches production: `model=claude-sonnet-4-6`, `max_tokens=600`, **temperature unset → API default 1.0**, no system prompt, no stop sequences.

**Run counts:** total 40 · live 40 · fallback 0 · excluded-from-selection-stats 0. Anthropic rate-limit (429/529) responses: 0.

## 2. Selection frequency per form (live runs)

| form | domain | eligible | selected | rate |
|---|---|--:|--:|--:|
| efficiency_combo | efficiency | 10 | 10 | 100% |
| magic_line | efficiency | 10 | 10 | 100% |
| metric_matrix | efficiency | 10 | 10 | 100% |
| segment_table | concentration | 30 | 30 | 100% |
| pareto_arr | concentration | 30 | 30 | 100% |
| treemap_arr | concentration | 30 | 30 | 100% |
| quadrant_eff | efficiency | 10 | 10 | 100% |
| efficiency_bullets | efficiency | 10 | 9 | 90% |
| scatter_eff_growth | efficiency | 10 | 4 | 40% |
| segment_stack | growth | 40 | 7 | 18% |
| lorenz_arr | concentration | 30 | 4 | 13% |
| masking_card | retention | 0 | 0 | n/a |
| bridge_smb | retention | 0 | 0 | n/a |
| bridge_enterprise | retention | 0 | 0 | n/a |
| bridge_blended | retention | 0 | 0 | n/a |
| hbar_nrr | retention | 0 | 0 | n/a |
| accel_line | growth | 40 | 0 | 0% |
| heatmap_metrics | efficiency | 10 | 0 | 0% |
| indexed_arr | growth | 40 | 0 | 0% |
| grouped_growth | growth | 40 | 0 | 0% |
| small_mult_arr | growth | 40 | 0 | 0% |
| dumbbell_ret | retention | 0 | 0 | n/a |
| heatmap_retention | retention | 0 | 0 | n/a |

## 3. Two-bucket classification

**SELECTED** (chosen ≥ 1×): efficiency_combo, magic_line, metric_matrix, efficiency_bullets, segment_stack, segment_table, pareto_arr, treemap_arr, lorenz_arr, scatter_eff_growth, quadrant_eff

**PASSED OVER** (eligible ≥ 1×, never chosen): accel_line, heatmap_metrics, indexed_arr, grouped_growth, small_mult_arr

  ↳ of which **structurally inadmissible** (offered by the prompt but always dropped by the validator — see Measurement notes): accel_line, indexed_arr, grouped_growth, small_mult_arr

  ↳ of which **genuinely unpicked** (admissible, model chose not to): heatmap_metrics

**NEVER ELIGIBLE** on these 2 states: masking_card, bridge_smb, bridge_enterprise, bridge_blended, hbar_nrr, dumbbell_ret, heatmap_retention

## 4. Head-to-head substitution (per anchored finding, live)

**CAC Payback vs benchmark [efficiency]** — 10 live runs · eligible forms: efficiency_combo, magic_line, accel_line, segment_stack, metric_matrix, efficiency_bullets, scatter_eff_growth, heatmap_metrics, indexed_arr, grouped_growth, quadrant_eff, small_mult_arr

  chosen: efficiency_combo×10, magic_line×10, quadrant_eff×10, metric_matrix×10, efficiency_bullets×9, segment_stack×7, scatter_eff_growth×4

  eligible but never chosen for this finding: accel_line, heatmap_metrics, indexed_arr, grouped_growth, small_mult_arr

**ARR spread across segments [concentration]** — 30 live runs · eligible forms: accel_line, segment_stack, segment_table, pareto_arr, indexed_arr, treemap_arr, grouped_growth, small_mult_arr, lorenz_arr

  chosen: treemap_arr×30, pareto_arr×30, segment_table×30, lorenz_arr×4

  eligible but never chosen for this finding: accel_line, segment_stack, indexed_arr, grouped_growth, small_mult_arr

## 5. Partition frequency (live)

| partition | count |
|---|--:|
| band_trio_trio | 26 |
| band_hero_row | 10 |
| band_pair_trio | 4 |

**Never produced:** band_hero, band_lead_matrix, band_trio_pair, grid_six, split_table, band_solo, band_pair, band_trio, band_duo_table, pair

## 6. Form × region-aspect matrix (live placements)

| form | aspects (region ratios it landed in) |
|---|---|
| accel_line | third×30 |
| efficiency_bullets | third×9 |
| efficiency_combo | third×10 |
| indexed_arr | third×26 |
| lorenz_arr | third×30 |
| magic_line | twothird×10 |
| metric_matrix | third×10 |
| pareto_arr | third×26, half×4 |
| quadrant_eff | third×10 |
| salient_band | band×40 |
| scatter_eff_growth | third×4 |
| segment_stack | third×37 |
| treemap_arr | third×26, half×4 |

## 7. Role divergence (CFO vs CRO)

**base** — mean Jaccard(CFO,CRO) over 10 repeat-pairs: **0.00**

  CFO anchored on: CAC Payback vs benchmark · CRO anchored on: ARR spread across segments

  forms unique to CFO: efficiency_combo, magic_line, quadrant_eff, scatter_eff_growth, metric_matrix, efficiency_bullets, segment_stack · unique to CRO: treemap_arr, pareto_arr, segment_table

**improve_cac** — mean Jaccard(CFO,CRO) over 10 repeat-pairs: **0.90**

  CFO anchored on: ARR spread across segments · CRO anchored on: ARR spread across segments

  forms unique to CFO: lorenz_arr · unique to CRO: —

Divergence measurable: **yes**.

## 8. Nondeterminism (within-cell, 10 repeats)

| cell | n | distinct selections | modal-selection share | distinct partitions | modal-partition share | distinct panel counts |
|---|--:|--:|--:|--:|--:|--:|
| base/CFO | 10 | 5 | 50% | 1 | 100% | 1 |
| base/CRO | 10 | 1 | 100% | 1 | 100% | 1 |
| improve_cac/CFO | 10 | 2 | 60% | 2 | 60% | 2 |
| improve_cac/CRO | 10 | 1 | 100% | 1 | 100% | 1 |

## 9. Panel count distribution

| cell | counts (panelCount×freq) |
|---|---|
| base/CFO | 6×10 |
| base/CRO | 3×10 |
| improve_cac/CFO | 3×6, 4×4 |
| improve_cac/CRO | 3×10 |

Salience concentration per state (top-1 z / Σz over positive z): base and perturbed anchors listed in §7; panel count vs salience is discussed inline.

## 10. Rejection rate per cell

| cell | runs | runs w/ ≥1 rejection | guards fired |
|---|--:|--:|---|
| base/CFO | 10 | 0 | — |
| base/CRO | 10 | 10 | off-domain widget(s) — dropped ×10 |
| improve_cac/CFO | 10 | 10 | off-domain widget(s) — dropped ×10 |
| improve_cac/CRO | 10 | 10 | off-domain widget(s) — dropped ×10 |

Guard totals: off-domain widget(s) — dropped ×30.

## §6 Registry drift — CHART_MENU (selection) vs CHART_KINDS (render)

CHART_MENU ids and their kinds: metric_matrix→matrix, efficiency_combo→combo, bridge_smb→waterfall, bridge_enterprise→waterfall, accel_line→line, segment_stack→stacked_area, hbar_nrr→hbar, magic_line→line, efficiency_bullets→bullet.

- CHART_MENU ids missing from catalog: none
- CHART_MENU ids whose kind ∉ CHART_KINDS: none
- Catalog forms with a chart kind (∈ CHART_KINDS) but absent from CHART_MENU top-up: bridge_blended, scatter_eff_growth, pareto_arr, heatmap_metrics, indexed_arr, dumbbell_ret, treemap_arr, grouped_growth, quadrant_eff, small_mult_arr, lorenz_arr, heatmap_retention

**Recommended assertion for validate-curation.ts** (do not fix here): every id in `CHART_MENU` exists in `buildCatalog()` and has a kind in `CHART_KINDS`; conversely flag any chart-kind catalog form absent from `CHART_MENU` so the two registries cannot silently drift.

## Measurement notes / caveats (report, not fix)

**Offered ⊋ admissible.** The widget menu the model is OFFERED comes from `buildCurationPrompt` = `RELATED_DOMAINS[domain]`, but the validator ADMITS per `nb.lenses` — and the two disagree for the concentration finding. This is why the "off-domain widget(s) — dropped" guard fires in every concentration cell: the model reasonably picks a form it was shown, and it is dropped every time.

| state/role | anchor domain | offered domains | admissible (lenses) | offered-but-inadmissible forms |
|---|---|---|---|---|
| base/CFO | efficiency | efficiency, growth | efficiency, growth | — |
| base/CRO | concentration | concentration, growth | concentration, retention | accel_line, segment_stack, indexed_arr, grouped_growth, small_mult_arr |
| improve_cac/CFO | concentration | concentration, growth | concentration, retention | accel_line, segment_stack, indexed_arr, grouped_growth, small_mult_arr |
| improve_cac/CRO | concentration | concentration, growth | concentration, retention | accel_line, segment_stack, indexed_arr, grouped_growth, small_mult_arr |

**Consequence for trimming:** the PASSED OVER bucket is not homogeneous. `accel_line, indexed_arr, grouped_growth, small_mult_arr` are passed over because they are **structurally inadmissible** under a concentration anchor (offered, never admissible) — a prompt/validator inconsistency, not evidence the form is redundant. `heatmap_metrics` are **genuinely unpicked** by the model despite being admissible — the real trim candidates. Do not conflate the two.

**Denominator note.** "eligible" in §2/§3 counts times a form was OFFERED (in the model's widget menu = `RELATED_DOMAINS[domain]`), the honest denominator for "how often the model had the chance to pick it." Because offered ⊋ admissible, a form can have eligible > 0 yet be un-keepable.

**Limits / not measured.** (1) Only **1** perturbation exists (`improve_cac`) → the data-state axis is 2, and both perturbed cells collapse onto the same concentration anchor, so cross-state variety is minimal. (2) 10 repeats bound within-cell variance resolution to ~±10%. (3) Temperature is the API default (1.0, unset) to match production exactly. (4) Function layer bypassed → Origin check and rate limiter not exercised (0 rate-limit events at this volume — not proof the production limiter works).

