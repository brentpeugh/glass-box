# Retired: the aspect-partition layout engine (`src/layout.ts`)

**Retired in:** Tuning 2, Stage A (composition change to a fixed lede + three chart slots).
**Removed in commit:** `c3ef2d2` (`reskin(tuning 2a): the lede board — composition to three panels`). Git history is the archive.

This records what the retired code did and why it was removed, so the deletion is auditable
without reconstructing it from `git log -p`.

## What was removed

Four exports from `src/layout.ts` and their private supporting tables:

- **`PARTITIONS`** — a dictionary of 13 region maps over a fixed 12-column canvas. Each partition
  named an arrangement (`band_trio_trio`, `band_hero`, `grid_six`, `split_table`, …); each region
  carried a grid rectangle (`c`, `r`), an aspect tag (`band` / `tall` / `twothird` / `half` /
  `third`) and a desired weight `w`. Row templates (`rowsT`) sized the rows (`"auto 1.25fr 1fr"`).
- **`deriveShape(charts)`** — derived a board *character* (`compact` / `hero` / `analytical` /
  `grid` / `balanced`) from the weight distribution of the model's selection: one dominant heavy
  panel → `hero`, several heavy → `analytical`, comparable weights → `grid` / `balanced`.
- **`selectPartition(F, modelCharts, allCharts, T, pref)`** — scored every partition by fit (seats
  the finding, charts, table; penalised empty regions and dropped items), added an `asym` bonus and a
  +30 bias toward the partition whose `PARTITION_CHARACTER` matched `deriveShape(...)`, and returned
  the highest-scoring partition id.
- **`fillPartition(p, findings, charts, tables, role)`** — matched blocks to regions: findings →
  `band`, tables → `tall`, charts → chart regions by aspect and weight, with `ROLE_DOMAIN_PRIORITY`
  as a *tie-breaker only* (model order dominated). A heavy region could `split` into sub-regions.

Private tables removed with them: `PANEL_ASPECTS`, `PANEL_WEIGHT`, `CHART_ASPECTS`,
`ROLE_DOMAIN_PRIORITY`, `PANEL_BUDGET`, `PARTITION_CHARACTER`, `partCapacity`, `fitScore`,
`pickChart`.

Also removed: **`RELATED_DOMAINS`** (`src/curation.ts`) — the domain-adjacency table whose only
remaining consumer was the board top-up (`related = RELATED_DOMAINS[findingDomain]`), which this
stage eliminates (§ bounded top-up). Its offer-side role was already superseded by
`admissibleLenses(nb)` (see `scripts/inventory-2.ts` header).

## The inventory evidence that justified retirement

From `analysis/curation-inventory-2.md` (Run 2 — 40 live curations, base + `improve_cac`, both roles):

- **13 partitions defined; 3 ever produced.** `band_trio_trio` ×23, `band_hero_row` ×10,
  `band_pair_trio` ×7. **10 of 13 never produced:** `band_hero`, `band_lead_matrix`,
  `band_trio_pair`, `grid_six`, `split_table`, `band_solo`, `band_pair`, `band_trio`,
  `band_duo_table`, `pair`.
- **Variation was driven by panel *count*, not arrangement.** Per-cell nondeterminism showed 1–2
  distinct partitions and **exactly 1 distinct panel count** per cell — the partition moved only
  when the number of selected panels moved, never as an independent design choice.

## The diagnostic that confirmed it (amendment a)

With the board fixed at **three** panels and the menu top-up removed (so `allCharts === modelCharts
=== 3`), `selectPartition(F=1, …)` returns **`band_hero`** for every representative 3-chart
selection tested (CFO/CRO fallback trios, efficiency/retention trios, one-heavy+two-light), across
`T ∈ {0,1}`. `band_hero` is one of the **10 never-produced** partitions — and it is a *hero* layout
(one 2/3 chart + two stacked 1/3 charts), not the three equal slots the new composition wants.

## Why retired

A fixed panel count leaves the derivation nothing to derive from. The engine's only real input was
panel count; fixing it at three collapses the whole scoring machine to a constant — and, as the
diagnostic shows, a constant that lands on a hero arrangement never exercised in the live register
rather than the intended three-equal-slot lede board. A fixed layout (`composeBoard` → a lede row
over three equal slots) is simpler, is what actually renders, and removes 13 partitions + a scoring
function whose output space was, in practice, three points.

## Replacement

`src/layout.ts` now exports `CHART_KINDS`, `PANEL_KINDS`, `BOARD_SLOTS = 3`, and
`composeBoard(spec, catalog)` → `{ lede, panels }`: the finding-card is the lede; the panels are the
model's chart/table blocks in model order, capped at three, **with no menu top-up** — rendered
panel count equals the model's selection.

## Follow-ups (not retired here)

- `scripts/inventory.ts` and `scripts/inventory-2.ts` were the analysis harnesses that measured the
  retired machinery; they import the removed symbols and no longer run against the current tree.
  They are historical (uncommitted analysis) and are superseded by this document + the committed
  `analysis/curation-inventory*.md`. Left in place rather than deleted.
