// Board composition (Tuning 2, Stage A). The model composes THREE panels; the board is a lede row
// over three equal slots. There is no derived partition and no menu top-up: a fixed panel count
// leaves nothing to derive from (the aspect-partition engine that used to live here — PARTITIONS,
// deriveShape, selectPartition, fillPartition — is retired; see analysis/retired-layout.md), and the
// board renders only what the model chose (rendered panel count === model selection).

// The catalog kinds that occupy a chart slot. Single source of truth (App.tsx and the validators
// import it from here). Kept in sync with the render-side registry by validate-curation.ts #8.
export const CHART_KINDS = new Set(["waterfall", "combo", "line", "stacked_area", "hbar", "bullet", "matrix", "scatter", "pareto", "heatmap", "indexed", "dumbbell", "treemap", "grouped", "quadrant", "small_multiples", "lorenz"]);
// A panel slot holds a chart or a table; the finding-card is the lede, not a slot.
export const PANEL_KINDS = new Set([...CHART_KINDS, "table"]);
export const BOARD_SLOTS = 3;

// Compose the board from a curation spec. The lede is the finding-card (rendered in the lede row);
// the panels are the model's chart/table blocks in model order, capped at BOARD_SLOTS. Nothing is
// injected — no domain top-up, no default table — so the rendered panel count equals the model's
// selection and the rail's "model chose N panels" stays true.
export function composeBoard(spec, catalog) {
  const all = spec.sections.flatMap((s) => s.blocks).filter((b) => catalog[b.widget]).map((b) => ({ ...b, _kind: catalog[b.widget].kind }));
  const lede = all.find((b) => b._kind === "finding_card") || null;
  const panels = all.filter((b) => b._kind !== "finding_card" && PANEL_KINDS.has(b._kind)).slice(0, BOARD_SLOTS);
  return { lede, panels };
}
