// Extracted from App.tsx (docs/briefs/extraction.md). Behaviour-preserving move — no logic change.
// Data + one pure function: the engine's widget catalog, built from the (possibly perturbed) engine.
import { E } from "./engine";

// ================= widget catalog (engine offering; pre-verified) =================
export function buildCatalog() {
  const Q1 = E.QUARTERS.slice(1);
  const masking = E.detectMasking("24Q4", "25Q4");
  const segSeries = [
    { seg: "SMB", color: "var(--scribe-strong)", points: E.QUARTERS.map((q) => ({ q, value: E.segArr("SMB", q).value, mv: E.segArr("SMB", q) })) },
    { seg: "Mid-Market", color: "var(--ink-2)", points: E.QUARTERS.map((q) => ({ q, value: E.segArr("Mid-Market", q).value, mv: E.segArr("Mid-Market", q) })) },
    { seg: "Enterprise", color: "var(--ink)", points: E.QUARTERS.map((q) => ({ q, value: E.segArr("Enterprise", q).value, mv: E.segArr("Enterprise", q) })) },
  ];
  const smBars = Q1.map((q) => ({ q, value: E.smTotal(q).value, mv: E.smTotal(q) }));
  const magicLine = Q1.map((q) => ({ q, value: E.magicNumber(q).value, mv: E.magicNumber(q) }));
  const accelLine = Q1.map((q) => ({ q, value: E.qoqGrowth(q).value * 100, mv: E.qoqGrowth(q) }));
  // ---- batch-1 general charts (relationship / cumulative / indexed / start-vs-end) ----
  const scatterEG = Q1.map((q) => ({ x: E.magicNumber(q).value, y: E.qoqGrowth(q).value * 100, label: q, mv: E.magicNumber(q) }));
  const paretoArr = E.SEGMENTS.map((sg) => ({ label: sg, value: E.segArr(sg, "25Q4").value, mv: E.segArr(sg, "25Q4") }));
  const indexedArr = { series: segSeries.map((s) => ({ seg: s.seg, color: s.color, points: s.points })), quarters: E.QUARTERS };
  const dumbbellRet = E.SEGMENTS.map((sg) => { const g = E.grr(sg, "24Q4", "25Q4"), n = E.nrr(sg, "24Q4", "25Q4"); return { label: sg, a: g.value, b: n.value, mv: n }; });
  // ---- batch-2 general charts (share-of-total / comparison / positioning / small-multiples) ----
  const treemapArr = E.SEGMENTS.map((sg) => ({ label: sg, value: E.segArr(sg, "25Q4").value, mv: E.segArr(sg, "25Q4") }));
  const groupedGrowth = E.SEGMENTS.map((sg) => ({ label: sg, bars: [{ value: E.segArr(sg, "24Q1").value, mv: E.segArr(sg, "24Q1") }, { value: E.segArr(sg, "25Q4").value, mv: E.segArr(sg, "25Q4") }] }));
  const quadEff = Q1.map((q) => ({ x: E.magicNumber(q).value, y: E.qoqGrowth(q).value * 100, label: q, mv: E.magicNumber(q) }));
  const smArr = segSeries.map((s) => ({ seg: s.seg, color: s.color, points: s.points }));
  // concentration analytics — the Lorenz distribution curve, a genuinely distinct form from the
  // composition (treemap), ranking (pareto), and breakdown (table) views already on the board.
  const lorenzCurve = E.lorenz("25Q4");
  const heatmapRet = { cols: ["NRR", "GRR"], rows: E.SEGMENTS.map((sg) => { const n = E.nrr(sg, "24Q4", "25Q4"), g = E.grr(sg, "24Q4", "25Q4"); return { label: sg, cells: [{ tone: n.value >= 100 ? "good" : "bad", mv: n, text: `${n.value.toFixed(0)}` }, { tone: g.value >= 90 ? "good" : "bad", mv: g, text: `${g.value.toFixed(0)}` }] }; }) };
  return {
    masking_card: { kind: "finding_card", polarity: "bad", desc: "Blended NRR looks healthy but conceals an underwater segment (SMB).", data: { finding: masking } },
    salient_band: { kind: "finding_card", polarity: "bad", title: "Top salient anomaly", desc: "The most statistically anomalous signal the engine surfaced.", data: {} },
    bridge_smb: { kind: "waterfall", polarity: "bad", desc: "SMB retention bridge — churn and contraction outweigh expansion.", data: { bridge: E.cohortBridge("SMB", "24Q4", "25Q4"), title: "SMB retention bridge", mv: E.nrr("SMB", "24Q4", "25Q4") } },
    bridge_enterprise: { kind: "waterfall", polarity: "good", desc: "Enterprise retention bridge — the expansion engine; net retention well above 100%.", data: { bridge: E.cohortBridge("Enterprise", "24Q4", "25Q4"), title: "Enterprise retention bridge", mv: E.nrr("Enterprise", "24Q4", "25Q4") } },
    bridge_blended: { kind: "waterfall", polarity: "neutral", desc: "Company-wide retention bridge across all segments.", data: { bridge: E.cohortBridge(null, "24Q4", "25Q4"), title: "Blended retention bridge", mv: E.nrr(null, "24Q4", "25Q4") } },
    efficiency_combo: { kind: "combo", polarity: "bad", desc: "Sales & marketing spend climbing while sales efficiency (magic number) falls through its benchmark.", data: { title: "S&M spend vs magic number", bars: smBars, line: magicLine, benchmark: E.BENCH.magic_number.threshold, good: E.BENCH.magic_number.good } },
    magic_line: { kind: "line", polarity: "bad", desc: "Magic number trend crossing its 0.75 benchmark.", data: { title: "SaaS magic number", series: magicLine, benchmark: E.BENCH.magic_number.threshold, good: "above", fmt: (v) => `${v.toFixed(2)}x` } },
    accel_line: { kind: "line", polarity: "good", desc: "Quarter-over-quarter ARR growth accelerating.", data: { title: "Quarter-over-quarter ARR growth", series: accelLine, benchmark: null, good: "above", fmt: (v) => `${v.toFixed(1)}%` } },
    callout_magic: { kind: "callout", polarity: "bad", desc: "SaaS magic number vs benchmark.", data: { mv: E.magicNumber("25Q4") } },
    callout_cac: { kind: "callout", polarity: "bad", desc: "CAC payback (months) vs benchmark.", data: { mv: E.cacPayback("25Q4") } },
    callout_r40: { kind: "callout", polarity: "bad", desc: "Rule of 40 vs benchmark.", data: { mv: E.ruleOf40("25Q4") } },
    callout_grr: { kind: "callout", polarity: "bad", desc: "Gross revenue retention vs benchmark.", data: { mv: E.grr(null, "24Q4", "25Q4") } },
    segment_stack: { kind: "stacked_area", polarity: "neutral", desc: "ARR by segment over time — topline growth and rising Enterprise concentration.", data: { title: "ARR by segment", series: segSeries } },
    segment_table: { kind: "table", polarity: "neutral", desc: "Per-segment ARR, share of ARR, NRR and GRR — the concentration and durability breakdown in one grid.", data: {} },
    hbar_nrr: { kind: "hbar", polarity: "bad", desc: "Net revenue retention ranked by segment against the 100% benchmark — shows the retention spread at a glance.", data: { title: "NRR by segment", benchmark: 100, fmt: (v) => `${v.toFixed(0)}%`, items: E.SEGMENTS.map((sg) => { const mv = E.nrr(sg, "24Q4", "25Q4"); return { label: sg, value: mv.value, mv, tone: mv.value >= 100 ? "good" : "bad" }; }) } },
    metric_matrix: { kind: "matrix", polarity: "bad", desc: "Every efficiency and durability metric by quarter — the full time-series grid, tone-coded against benchmark. The densest single view of the trajectory.", data: {} },
    efficiency_bullets: { kind: "bullet", polarity: "bad", desc: "Capital-efficiency metrics (magic number, CAC payback, Rule of 40) against their benchmarks as bullet gauges.", data: { title: "Efficiency vs targets", items: (() => { const mag = E.magicNumber("25Q4"), cac = E.cacPayback("25Q4"), r40 = E.ruleOf40("25Q4"); return [{ label: "Magic #", mv: mag, value: mag.value, target: mag.basis.thr, good: mag.basis.good, max: 1.0, fmt: (v) => `${v.toFixed(2)}x` }, { label: "CAC (mo)", mv: cac, value: cac.value, target: cac.basis.thr, good: cac.basis.good, max: 30, fmt: (v) => `${v.toFixed(0)}mo` }, { label: "Rule of 40", mv: r40, value: r40.value, target: r40.basis.thr, good: r40.basis.good, max: 60, fmt: (v) => `${v.toFixed(0)}` }]; })() } },
    scatter_eff_growth: { kind: "scatter", polarity: "bad", desc: "Sales efficiency (magic number) plotted against ARR growth, quarter by quarter — shows whether growth is being bought with declining efficiency.", data: { title: "Efficiency vs growth", points: scatterEG, xlab: "Magic #", ylab: "QoQ growth %" } },
    pareto_arr: { kind: "pareto", polarity: "bad", desc: "ARR by segment, ranked, with the cumulative share curve — how concentrated revenue is in the top segment.", data: { title: "ARR concentration (Pareto)", items: paretoArr, fmt: (v) => `$${(v / 1e6).toFixed(1)}M` } },
    indexed_arr: { kind: "indexed", polarity: "neutral", desc: "Segment ARR rebased to 100 at the first quarter — compares growth rates across segments regardless of size.", data: { title: "Indexed ARR growth by segment", ...indexedArr } },
    dumbbell_ret: { kind: "dumbbell", polarity: "bad", desc: "Gross vs net retention per segment — the gap is the expansion contribution; where the dot moves left, contraction outweighs expansion.", data: { title: "GRR → NRR by segment", items: dumbbellRet, fmt: (v) => `${v.toFixed(0)}%` } },
    treemap_arr: { kind: "treemap", polarity: "bad", desc: "ARR share by segment as proportional area — the concentration of the book at a glance.", data: { title: "ARR share by segment", items: treemapArr, fmt: (v) => `$${(v / 1e6).toFixed(1)}M` } },
    grouped_growth: { kind: "grouped", polarity: "neutral", desc: "Segment ARR at the first vs latest quarter side by side — which segments actually drove the growth.", data: { title: "Segment ARR — first vs latest", groups: groupedGrowth, keys: ["24Q1", "25Q4"], colors: ["var(--scribe-strong)", "var(--ink)"], fmt: (v) => `$${(v / 1e6).toFixed(1)}M` } },
    quadrant_eff: { kind: "quadrant", polarity: "bad", desc: "Each quarter positioned by sales efficiency and growth against their benchmarks — the four zones separate efficient growth from bought growth.", data: { title: "Efficiency × growth positioning", points: quadEff, xlab: "Magic #", ylab: "QoQ growth %", xbench: E.BENCH.magic_number.threshold, ybench: 5, quad: { tr: "Efficient growth", tl: "Bought growth", br: "Efficient · slowing", bl: "Inefficient" } } },
    small_mult_arr: { kind: "small_multiples", polarity: "neutral", desc: "One ARR trend per segment on a shared scale — compare the growth shapes side by side.", data: { title: "ARR trend by segment", series: smArr } },
    lorenz_arr: { kind: "lorenz", polarity: "bad", desc: "Cumulative ARR share by account (accounts ranked largest first) — the distribution shape; the steeper the early rise, the more the book concentrates in a few accounts.", data: { title: "ARR distribution (Lorenz)", curve: lorenzCurve.curve, mv: lorenzCurve } },
    heatmap_retention: { kind: "heatmap", polarity: "bad", desc: "NRR and GRR per segment, tone-coded against benchmark — where retention holds and where it breaches.", data: { title: "Retention by segment", ...heatmapRet } },
  };
}

// the full analytical menu the engine can render (salience-ordered). The model frames the
// lead finding; the board is filled from this ranked menu, so there is always surplus to
// fill a dense partition — a well-built board every time, regardless of how much the model curated.
export const CHART_MENU = ["metric_matrix", "efficiency_combo", "bridge_smb", "bridge_enterprise", "accel_line", "segment_stack", "hbar_nrr", "magic_line", "efficiency_bullets"];
