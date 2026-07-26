// Extracted from App.tsx (docs/briefs/extraction.md). Behaviour-preserving move — no logic change.
// Pure functions: aspect-based partition layout — the highest-value coverage gain.
import { WIDGET_DOMAIN } from "./curation";

// ===== aspect-based partition layout =====
// Each panel declares the aspect SHAPES it reads well as (roster-proof: a new chart just
// declares its aspects, no layout change). Partitions are region maps of a fixed canvas,
// each region tagged with an aspect. Selection scores partitions for best fit; fill matches
// panels to regions by aspect. A panel budget keeps every screen legible.
const PANEL_ASPECTS = {
  finding_card: ["band"],
  salient_band: ["band"],
  table: ["tall", "twothird", "half"],
  matrix: ["twothird", "half"],
  combo: ["half", "third"],
  line: ["half", "twothird", "third"],
  stacked_area: ["half", "third"],
  waterfall: ["third", "half"],
  hbar: ["third", "half"],
  bullet: ["third", "half"],
  scatter: ["half", "third"],
  lorenz: ["half", "third"],
  pareto: ["half", "third"],
  heatmap: ["twothird", "half"],
  indexed: ["half", "third"],
  dumbbell: ["third", "half"],
  treemap: ["half", "third"],
  grouped: ["half", "third"],
  quadrant: ["half", "third"],
  small_multiples: ["twothird", "half"],
};
// information density a panel justifies (heavy grids earn a dominant region; trends are light)
const PANEL_WEIGHT = { matrix: 3, table: 3, combo: 2, waterfall: 2, hbar: 2, bullet: 2, pareto: 2, heatmap: 2, dumbbell: 2, treemap: 2, grouped: 2, small_multiples: 2, scatter: 1, indexed: 1, quadrant: 1, line: 1, stacked_area: 1, lorenz: 1 };
const CHART_ASPECTS = new Set(["twothird", "half", "third"]);
// regions carry a weight `w` (space they want); a big region can `split` into lighter sub-regions
export const PARTITIONS = {
  band_hero: { asym: true, rowsT: "auto minmax(0, 300px) minmax(0, 300px)", regions: [{ a: "band", c: [1, 13], r: [1, 2] }, { a: "twothird", c: [1, 9], r: [2, 4], w: 3 }, { a: "third", c: [9, 13], r: [2, 3], w: 2 }, { a: "third", c: [9, 13], r: [3, 4], w: 1 }] },
  band_hero_row: { asym: true, rowsT: "auto minmax(0, 230px) minmax(0, 230px) minmax(0, 230px)", regions: [{ a: "band", c: [1, 13], r: [1, 2] }, { a: "twothird", c: [1, 9], r: [2, 4], w: 3 }, { a: "third", c: [9, 13], r: [2, 3], w: 2 }, { a: "third", c: [9, 13], r: [3, 4], w: 1 }, { a: "third", c: [1, 5], r: [4, 5], w: 1 }, { a: "third", c: [5, 9], r: [4, 5], w: 1 }, { a: "third", c: [9, 13], r: [4, 5], w: 1 }] },
  band_pair_trio: { rowsT: "auto minmax(0, 300px) minmax(0, 300px)", regions: [{ a: "band", c: [1, 13], r: [1, 2] }, { a: "half", c: [1, 7], r: [2, 3], w: 2 }, { a: "half", c: [7, 13], r: [2, 3], w: 2 }, { a: "third", c: [1, 5], r: [3, 4], w: 1 }, { a: "third", c: [5, 9], r: [3, 4], w: 1 }, { a: "third", c: [9, 13], r: [3, 4], w: 1 }] },
  band_lead_matrix: { asym: true, rowsT: "auto minmax(0, 300px) minmax(0, 300px)", regions: [{ a: "band", c: [1, 13], r: [1, 2] }, { a: "twothird", c: [1, 9], r: [2, 3], w: 3 }, { a: "third", c: [9, 13], r: [2, 3], w: 2 }, { a: "third", c: [1, 5], r: [3, 4], w: 1 }, { a: "third", c: [5, 9], r: [3, 4], w: 1 }, { a: "third", c: [9, 13], r: [3, 4], w: 1 }] },
  band_trio_trio: { rowsT: "auto minmax(0, 300px) minmax(0, 300px)", regions: [{ a: "band", c: [1, 13], r: [1, 2] }, { a: "third", c: [1, 5], r: [2, 3], w: 2 }, { a: "third", c: [5, 9], r: [2, 3], w: 1 }, { a: "third", c: [9, 13], r: [2, 3], w: 1 }, { a: "third", c: [1, 5], r: [3, 4], w: 1 }, { a: "third", c: [5, 9], r: [3, 4], w: 1 }, { a: "third", c: [9, 13], r: [3, 4], w: 1 }] },
  band_trio_pair: { rowsT: "auto minmax(0, 300px) minmax(0, 300px)", regions: [{ a: "band", c: [1, 13], r: [1, 2] }, { a: "third", c: [1, 5], r: [2, 3], w: 2 }, { a: "third", c: [5, 9], r: [2, 3], w: 1 }, { a: "third", c: [9, 13], r: [2, 3], w: 1 }, { a: "half", c: [1, 7], r: [3, 4], w: 2 }, { a: "half", c: [7, 13], r: [3, 4], w: 1 }] },
  grid_six: { rowsT: "minmax(0, 300px) minmax(0, 300px)", regions: [{ a: "third", c: [1, 5], r: [1, 2], w: 2 }, { a: "third", c: [5, 9], r: [1, 2], w: 1 }, { a: "third", c: [9, 13], r: [1, 2], w: 1 }, { a: "third", c: [1, 5], r: [2, 3], w: 1 }, { a: "third", c: [5, 9], r: [2, 3], w: 1 }, { a: "third", c: [9, 13], r: [2, 3], w: 1 }] },
  split_table: { rowsT: "minmax(0, 300px)", regions: [{ a: "half", c: [1, 8], r: [1, 2], w: 2 }, { a: "tall", c: [8, 13], r: [1, 2] }] },
  band_solo: { rowsT: "auto minmax(0, 300px)", regions: [{ a: "band", c: [1, 13], r: [1, 2] }, { a: "half", c: [1, 13], r: [2, 3], w: 2 }] },
  band_pair: { rowsT: "auto minmax(0, 300px)", regions: [{ a: "band", c: [1, 13], r: [1, 2] }, { a: "half", c: [1, 7], r: [2, 3], w: 2 }, { a: "half", c: [7, 13], r: [2, 3], w: 2 }] },
  band_trio: { rowsT: "auto minmax(0, 300px)", regions: [{ a: "band", c: [1, 13], r: [1, 2] }, { a: "third", c: [1, 5], r: [2, 3], w: 2 }, { a: "third", c: [5, 9], r: [2, 3], w: 1 }, { a: "third", c: [9, 13], r: [2, 3], w: 1 }] },
  band_duo_table: { rowsT: "auto minmax(0, 300px)", regions: [{ a: "band", c: [1, 13], r: [1, 2] }, { a: "half", c: [1, 7], r: [2, 3], w: 2 }, { a: "tall", c: [7, 13], r: [2, 3] }] },
  pair: { rowsT: "minmax(0, 300px)", regions: [{ a: "half", c: [1, 7], r: [1, 2], w: 2 }, { a: "half", c: [7, 13], r: [1, 2], w: 2 }] },
};
// each widget belongs to an analytical domain; each role prioritizes domains differently,
// so the same content arranges differently per role (CRO leads growth, CFO leads durability)
const ROLE_DOMAIN_PRIORITY = {
  CFO: ["efficiency", "retention", "concentration", "growth"],
  CRO: ["growth", "retention", "concentration", "efficiency"],
};
const PANEL_BUDGET = 6;
function partCapacity(p) {
  const band = p.regions.filter((r) => r.a === "band").length;
  const tall = p.regions.filter((r) => r.a === "tall").length;
  const chart = p.regions.filter((r) => CHART_ASPECTS.has(r.a)).length;
  return { band, tall, chart, total: p.regions.length };
}
function fitScore(p, F, C, T) {
  const cap = partCapacity(p);
  const seatFinding = F > 0 && cap.band > 0 ? 1 : 0;
  const chartsSeated = Math.min(C, cap.chart);
  const bandLeft = cap.band - seatFinding;
  const tableSeated = T > 0 && (cap.tall > 0 || bandLeft > 0) ? 1 : 0;
  const used = seatFinding + chartsSeated + tableSeated;
  const empty = cap.total - used;
  const dropped = Math.max(0, C - chartsSeated) + Math.max(0, F - seatFinding) + Math.max(0, T - tableSeated);
  return used * 10 - empty * 7 - dropped * 2;
}
// Roles declare an INTENT (weighted preference over layout characters); partitions declare
// their CHARACTER. The selector matches intent to character generically — adding a role is a
// line of intent, adding a partition is a line of character, no per-role lists to maintain.
const PARTITION_CHARACTER = {
  band_lead_matrix: ["analytical"], band_hero: ["hero"], band_hero_row: ["hero", "dense"],
  band_pair_trio: ["balanced", "dense"], band_trio_trio: ["grid", "dense"], band_trio_pair: ["grid"],
  band_pair: ["compact"], band_trio: ["compact"], band_duo_table: ["analytical", "compact"], band_solo: ["compact"], grid_six: ["grid"], split_table: ["analytical"], pair: ["compact"],
};
// (ROLE_INTENT removed — layout is now derived from composition shape, not a role→layout prior)
// Derive the board's SHAPE from the weight distribution of the model's actual selection — role
// absent. A composition with one dominant heavy panel wants a hero layout; several heavy panels
// want a dense analytical grid; comparable-weight panels want a balanced/grid. The layout is a
// CONSEQUENCE of what was composed, so two roles diverge in layout exactly when their compositions
// differ in shape — never because a role→layout table said so.
export function deriveShape(charts) {
  const weights = charts.map((c) => PANEL_WEIGHT[c._kind] || 2);
  const n = weights.length;
  if (n <= 2) return "compact";
  const heavy = weights.filter((w) => w >= 3).length;
  const maxW = Math.max(...weights);
  if (heavy >= 2) return "analytical";            // multiple heavy panels → dense data-grid
  if (maxW >= 3 && heavy === 1) return "hero";    // one dominant heavy panel + support → hero
  return n >= 5 ? "grid" : "balanced";            // comparable-weight panels
}
export function selectPartition(F, modelCharts, allCharts, T, partitionPref) {
  const C = allCharts.length;
  // shape from the model's own composition (its compositional intent); fall back to the full board
  // only if the model picked too few to have a discernible shape.
  const shape = deriveShape(modelCharts.length >= 3 ? modelCharts : allCharts);
  const prefChar = partitionPref && ["hero", "analytical", "balanced"].includes(partitionPref) ? partitionPref : null;
  let best = "pair", bs = -Infinity;
  for (const [k, p] of Object.entries(PARTITIONS)) {
    const cp = partCapacity(p);
    let s = fitScore(p, F, C, T);
    if (p.asym) s += 8;
    const chartEmpty = Math.max(0, cp.chart - Math.min(C, cp.chart));
    if (chartEmpty <= 1) {
      const chars = PARTITION_CHARACTER[k] || [];
      if (chars.includes(shape)) s += 30;                         // derived shape is primary
      if (prefChar && chars.includes(prefChar)) s += 10;          // model's stated pref reinforces
    }
    if (s > bs) { bs = s; best = k; }
  }
  return best;
}
// pick the chart that best fits the region's weight; the LEAD region prefers the role's
// top-priority domain (so the boards diverge in what leads), rest tie-break by domain.
function pickChart(pool, want, aspect, drank, leadByDomain) {
  if (!pool.length) return null;
  let cands = pool.filter((c) => c.asp.includes(aspect));
  if (!cands.length) cands = pool.slice();
  if (leadByDomain) cands.sort((a, b) => a.mo - b.mo || b.w - a.w || drank(a) - drank(b));
  else cands.sort((a, b) => Math.abs(a.w - want) - Math.abs(b.w - want) || a.mo - b.mo || drank(a) - drank(b));
  const chosen = cands[0]; pool.splice(pool.indexOf(chosen), 1); return chosen;
}
// Layout placement. The MODEL'S widget ORDER dominates (charts arrive model-first, then menu
// top-up); role domain priority is a TIE-BREAKER for presentation validity only, never a re-ranking
// of the model's analytical choices. `mo` = model order; `drank` (role prior) only breaks ties.
export function fillPartition(p, findings, charts, tables, role) {
  const prio = ROLE_DOMAIN_PRIORITY[role] || ROLE_DOMAIN_PRIORITY.CFO;
  const drank = (c) => { const d = WIDGET_DOMAIN[c.b.widget]; const i = prio.indexOf(d); return i < 0 ? 99 : i; };
  const pool = charts.slice(0, PANEL_BUDGET).map((b, i) => ({ b, w: PANEL_WEIGHT[b._kind] || 2, asp: PANEL_ASPECTS[b._kind] || [], mo: i }));
  const fQ = [...findings], tQ = [...tables];
  const placed = []; let leadDone = false;
  for (const region of p.regions) {
    if (region.a === "band") { if (fQ.length) placed.push({ region, block: fQ.shift() }); continue; }
    if (region.a === "tall") { const b = tQ.shift(); if (b) placed.push({ region, block: b }); continue; }
    if (!pool.length) continue;
    const want = region.w || 2;
    const heaviest = Math.max(...pool.map((c) => c.w));
    if (want >= 3 && heaviest < 3 && region.split) {
      for (const sub of region.split) { const pick = pickChart(pool, sub.w || 1, sub.a, drank, false); if (pick) placed.push({ region: sub, block: pick.b }); }
      continue;
    }
    const isLead = !leadDone; leadDone = true;
    const pick = pickChart(pool, want, region.a, drank, isLead);
    if (pick) placed.push({ region, block: pick.b });
  }
  return placed;
}
