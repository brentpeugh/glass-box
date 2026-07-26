# Curation Menu — the denominator

Static enumeration of what the engine + composition layer make *available*, read from source
(`src/App.tsx`, `src/curation.ts`). No runs. This is the denominator for the inventory.

Source of truth: `App.tsx` `PARTITIONS` (L1043), `PANEL_ASPECTS` (L1017), `PANEL_WEIGHT` (L1040),
`CHART_ASPECTS`/`CHART_KINDS` (L1041/L1162), `buildCatalog()` (L477), `CHART_MENU` (L1166);
`curation.ts` `WIDGET_DOMAIN` (L13), `RELATED_DOMAINS` (L24).

---

## Table 1 — Partitions (13)

Each partition is a region map of a fixed 12-column canvas. `band` = the finding band; `tall` =
a full-height table column; `twothird`/`half`/`third` are the chart aspects (`CHART_ASPECTS`).
Character drives selection (`PARTITION_CHARACTER`, matched to the derived composition shape).

| partition | regions | region aspects (count) | character | asym |
|---|---|---|---|---|
| `band_hero` | 4 | band·1, twothird·1, third·2 | hero | ✓ |
| `band_hero_row` | 7 | band·1, twothird·1, third·5 | hero, dense | ✓ |
| `band_pair_trio` | 6 | band·1, half·2, third·3 | balanced, dense | |
| `band_lead_matrix` | 6 | band·1, twothird·1, third·4 | analytical | ✓ |
| `band_trio_trio` | 7 | band·1, third·6 | grid, dense | |
| `band_trio_pair` | 6 | band·1, third·3, half·2 | grid | |
| `grid_six` | 6 | third·6 | grid | |
| `split_table` | 2 | half·1, tall·1 | analytical | |
| `band_solo` | 2 | band·1, half·1 | compact | |
| `band_pair` | 3 | band·1, half·2 | compact | |
| `band_trio` | 4 | band·1, third·3 | compact | |
| `band_duo_table` | 3 | band·1, half·1, tall·1 | analytical, compact | |
| `pair` | 2 | half·2 | compact | |

Aspect supply across all partitions: `band` ×11, `twothird` ×3, `half` ×13, `third` ×30, `tall` ×2.

Selection: `selectPartition(F, modelCharts, allCharts, T, pref)` scores every partition with
`fitScore` (seats finding + charts + table, penalises empty regions and dropped panels), gives
`asym` a +8 bonus, and biases toward the partition whose character matches `deriveShape(...)`
(`compact | analytical | hero | grid | balanced`). Panel budget = 6.

---

## Table 2 — Forms (28) registered in `buildCatalog()`

`domain` from `WIDGET_DOMAIN`; `aspects` from `PANEL_ASPECTS`; `weight` from `PANEL_WEIGHT`
(3 = heavy grid → earns a dominant region; 1 = light trend). Forms not in `CHART_KINDS` are not
placed as chart regions (callouts pack a compact strip; finding cards seat the `band`).

| form id | kind | domain | aspects | weight | in CHART_MENU |
|---|---|---|---|---|---|
| `masking_card` | finding_card | retention | band | — | |
| `salient_band` | finding_card | — | band | — | |
| `bridge_smb` | waterfall | retention | third, half | 2 | ✓ |
| `bridge_enterprise` | waterfall | retention | third, half | 2 | ✓ |
| `bridge_blended` | waterfall | retention | third, half | 2 | |
| `efficiency_combo` | combo | efficiency | half, third | 2 | ✓ |
| `magic_line` | line | efficiency | half, twothird, third | 1 | ✓ |
| `accel_line` | line | growth | half, twothird, third | 1 | ✓ |
| `callout_magic` | callout | — | — (strip) | — | |
| `callout_cac` | callout | — | — (strip) | — | |
| `callout_r40` | callout | — | — (strip) | — | |
| `callout_grr` | callout | — | — (strip) | — | |
| `segment_stack` | stacked_area | growth | half, third | 1 | ✓ |
| `segment_table` | table | concentration | tall, twothird, half | 3 | |
| `hbar_nrr` | hbar | retention | third, half | 2 | ✓ |
| `metric_matrix` | matrix | efficiency | twothird, half | 3 | ✓ |
| `efficiency_bullets` | bullet | efficiency | third, half | 2 | ✓ |
| `scatter_eff_growth` | scatter | efficiency | half, third | 1 | |
| `pareto_arr` | pareto | concentration | half, third | 2 | |
| `heatmap_metrics` | heatmap | efficiency | twothird, half | 2 | |
| `indexed_arr` | indexed | growth | half, third | 1 | |
| `dumbbell_ret` | dumbbell | retention | third, half | 2 | |
| `treemap_arr` | treemap | concentration | half, third | 2 | |
| `grouped_growth` | grouped | growth | half, third | 2 | |
| `quadrant_eff` | quadrant | efficiency | half, third | 1 | |
| `small_mult_arr` | small_multiples | growth | twothird, half | 2 | |
| `lorenz_arr` | lorenz | concentration | half, third | 1 | |
| `heatmap_retention` | heatmap | retention | twothird, half | 2 | |

`CHART_MENU` (the ranked top-up pool when the model under-fills) = `metric_matrix,
efficiency_combo, bridge_smb, bridge_enterprise, accel_line, segment_stack, hbar_nrr, magic_line,
efficiency_bullets` — 9 of the 28 forms. The other 19 are reachable only via the model's own
selection, never via the deterministic top-up.

---

## Table 3 — Eligibility condition per form

The brief asks for "the statistical condition that makes each form eligible." **Finding: eligibility
is not a per-form statistical predicate. It is a domain-membership rule, declared once.**

A form is a **candidate** for a finding iff:

```
WIDGET_DOMAIN[form]  ∈  ( finding.neighborhood.lenses  ??  RELATED_DOMAINS[finding.domain] )
```

i.e. the form's domain must be in the finding's neighborhood domains. There is no per-form
statistical test (e.g. "eligible when magic number < benchmark"); the statistics live entirely in
which *finding* the engine surfaces (`computeSalience`) and what domains that finding's neighborhood
declares. The form menu is then filtered by domain, not by a form-specific condition.

| finding domain | eligible form domains (`RELATED_DOMAINS`) |
|---|---|
| retention | retention, concentration |
| efficiency | efficiency, growth |
| growth | growth, concentration |
| concentration | concentration, growth |

Consequences worth noting for the trim question:

- **`efficiency` findings can never surface a pure-`retention` form** (retention ∉ {efficiency, growth}),
  and vice-versa. So a form's reachability is bounded by which finding-domains occur in the data.
- The four **`callout_*`** forms and the two **finding-card** forms (`masking_card`, `salient_band`)
  are outside `WIDGET_DOMAIN`/`CHART_KINDS` — their eligibility is *implicit* (callouts fill a
  compact strip; a finding card seats the band). Flagged per the brief: implicit, not declared.
- `masking_card` is the only finding-card in `WIDGET_DOMAIN` (retention); `salient_band` is the
  generic anomaly band and carries no domain.
