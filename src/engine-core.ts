/**
 * engine-core — the ONE canonical engine. Isomorphic: no fs, no globals, data
 * injected. The Node validator imports it and runs it against the oracle; the
 * browser artifact imports it (inlined by the build step) and runs it over the
 * fetched/inlined dataset. There is exactly one hand-edited engine — this file.
 *
 * createEngine(bundle) -> Engine. Every method returns MetricValue / Finding
 * objects carrying provenance emitted at compute time. Row-leaf provenance
 * carries a structured RowSelector so the trace resolves leaves to rows.
 */
import type { MetricValue, Finding, Provenance, ProvRef, Scope, RowSelector } from "./contract";

export interface Bundle {
  customers: any[];
  opex: { segment: string; quarter: string; sm_spend: number; cogs: number }[];
  opportunities?: { opp_id: string; segment: string; close_quarter: string; stage: string; acv: number }[];
  quarters: string[];
  segments: string[];
  benchmarks: Record<string, { threshold: number; good: "above" | "below"; label: string }>;
}

export interface ResolvedRows {
  kind: "retention" | "col_sum" | "delta" | "opex" | "opps";
  [k: string]: any;
}

class MetricStore {
  byId = new Map<string, MetricValue>();
  put(mv: MetricValue) { const e = this.byId.get(mv.id); if (e && Math.abs(e.value - mv.value) > 1e-9) throw new Error("I2 " + mv.id); this.byId.set(mv.id, mv); return mv; }
  get(id: string) { const m = this.byId.get(id); if (!m) throw new Error("no " + id); return m; }
  has(id: string) { return this.byId.has(id); }
  get size() { return this.byId.size; }
}

export function createEngine(bundle: Bundle) {
  const ROWS = bundle.customers, OPEX = bundle.opex, OPPS = bundle.opportunities || [];
  const QUARTERS = bundle.quarters, SEGMENTS = bundle.segments, BENCH = bundle.benchmarks;
  const arrK = (q: string) => `arr_${q}`;
  const qIdx = (q: string) => QUARTERS.indexOf(q);
  const store = new MetricStore();
  const mref = (id: string): ProvRef => ({ kind: "metric", id });
  const rowsRef = (table: any, predicate: string, ids: string[], selector?: RowSelector): ProvRef =>
    ({ kind: "rows", table, predicate, count: ids.length, idsSample: ids.slice(0, 5), selector });
  function mk(id: string, metric: string, label: string, value: number, unit: any, prov: Provenance, extra: Partial<MetricValue> = {}): MetricValue {
    if (store.has(id)) return store.get(id);
    return store.put({ id, metric, label, scope: {} as Scope, value, unit, format: "", goodWhen: "neutral", epistemic: "deterministic", provenance: prov, ...extra } as MetricValue);
  }

  // ---- rollups ----
  function companyArr(q: string) {
    const c = arrK(q); const contrib = ROWS.filter((r) => r[c] > 0);
    return mk(`arr.company.${q}`, "arr", "Company ARR", ROWS.reduce((s, r) => s + r[c], 0), "usd",
      { op: "sum", description: `Sum of ${c} across ${contrib.length} active accounts`,
        inputs: [rowsRef("customers", `sum(${c})`, contrib.map((r) => r.customer_id), { kind: "col_sum", seg: null, col: c })] });
  }
  function segArr(seg: string, q: string) {
    const c = arrK(q); const rows = ROWS.filter((r) => r.segment === seg); const contrib = rows.filter((r) => r[c] > 0);
    return mk(`arr.${seg}.${q}`, "arr", `${seg} ARR`, rows.reduce((s, r) => s + r[c], 0), "usd",
      { op: "sum", description: `Sum of ${c} across ${contrib.length} active ${seg} accounts`,
        inputs: [rowsRef("customers", `segment=${seg} AND sum(${c})`, contrib.map((r) => r.customer_id), { kind: "col_sum", seg, col: c })] });
  }
  function cogsTotal(q: string) { const rows = OPEX.filter((o) => o.quarter === q); return mk(`cogs.${q}`, "cogs", "COGS", rows.reduce((s, o) => s + o.cogs, 0), "usd", { op: "sum", description: `Sum of COGS over ${rows.length} opex rows for ${q}`, inputs: [rowsRef("opex", `quarter=${q}`, rows.map((o) => o.segment), { kind: "opex", quarter: q, field: "cogs" })] }); }
  function smTotal(q: string) { const rows = OPEX.filter((o) => o.quarter === q); return mk(`sm.${q}`, "sm_spend", "S&M Spend", rows.reduce((s, o) => s + o.sm_spend, 0), "usd", { op: "sum", description: `Sum of S&M over ${rows.length} opex rows for ${q}`, inputs: [rowsRef("opex", `quarter=${q}`, rows.map((o) => o.segment), { kind: "opex", quarter: q, field: "sm_spend" })] }); }
  function revenueQ(q: string) { const a = companyArr(q); return mk(`rev.${q}`, "revenue", "Quarterly Revenue", a.value / 4, "usd", { op: "scale", description: `ARR(${q}) / 4`, inputs: [mref(a.id)] }); }
  function netNewArr(q: string) { const i = qIdx(q); if (i <= 0) return null; const cur = companyArr(q), prev = companyArr(QUARTERS[i - 1]); return mk(`nna.${q}`, "net_new_arr", "Net New ARR", cur.value - prev.value, "usd", { op: "subtract", description: `ARR(${q}) - ARR(${QUARTERS[i - 1]})`, inputs: [mref(cur.id), mref(prev.id)] }); }
  function grossNewBookings(q: string) { const i = qIdx(q); if (i <= 0) return null; const cur = arrK(q), prev = arrK(QUARTERS[i - 1]); let v = 0; const ids: string[] = []; for (const r of ROWS) { const d = r[cur] - r[prev]; if (d > 0) { v += d; ids.push(r.customer_id); } } return mk(`gnb.${q}`, "gross_new_bookings", "Gross New Bookings", v, "usd", { op: "sum_positive_delta", description: `Sum of positive ARR deltas (new logos + expansion), ${ids.length} accounts`, inputs: [rowsRef("customers", `max(0, ${cur}-${prev})`, ids, { kind: "delta", from: QUARTERS[i - 1], to: q })] }); }

  // ---- efficiency / durability ----
  function magicNumber(q: string) { const i = qIdx(q); if (i <= 0) return null; const nna = netNewArr(q)!, sm = smTotal(QUARTERS[i - 1]); const b = BENCH.magic_number; return mk(`magic.${q}`, "magic_number", "SaaS Magic Number", nna.value / sm.value, "ratio", { op: "ratio", description: `Net New ARR(${q}) / S&M(${QUARTERS[i - 1]})`, inputs: [mref(nna.id), mref(sm.id)], configRefs: ["benchmark.magic_number"] }, { basis: { kind: "benchmark", ref: "magic_number", thr: b.threshold, good: b.good, delta: nna.value / sm.value - b.threshold } }); }
  function grossMargin(q: string) { const c = cogsTotal(q), rev = revenueQ(q); const b = BENCH.gross_margin; const v = (1 - c.value / rev.value) * 100; return mk(`gm.${q}`, "gross_margin", "Gross Margin", v, "percent", { op: "margin", description: `(1 - COGS/Revenue) * 100 for ${q}`, inputs: [mref(c.id), mref(rev.id)], configRefs: ["benchmark.gross_margin"] }, { basis: { kind: "benchmark", ref: "gross_margin", thr: b.threshold, good: b.good, delta: v - b.threshold } }); }
  function cacPayback(q: string) { const i = qIdx(q); if (i <= 0) return null; const sm = smTotal(QUARTERS[i - 1]), gnb = grossNewBookings(q)!, gm = grossMargin(q); const b = BENCH.cac_payback_mo; const v = sm.value / (gnb.value * (gm.value / 100) / 12); return mk(`cac.${q}`, "cac_payback_mo", "CAC Payback", v, "months", { op: "cac_payback", description: `S&M(${QUARTERS[i - 1]}) / (Gross New Bookings(${q}) * GM / 12)`, inputs: [mref(sm.id), mref(gnb.id), mref(gm.id)], configRefs: ["benchmark.cac_payback_mo"] }, { basis: { kind: "benchmark", ref: "cac_payback_mo", thr: b.threshold, good: b.good, delta: v - b.threshold } }); }
  function ruleOf40(q: string) { const i = qIdx(q); if (i < 4) return null; const cur = companyArr(q), yoy = companyArr(QUARTERS[i - 4]), rev = revenueQ(q), c = cogsTotal(q), sm = smTotal(q); const growth = (cur.value / yoy.value - 1) * 100; const opm = ((rev.value - c.value - sm.value) / rev.value) * 100; const b = BENCH.rule_of_40; return mk(`r40.${q}`, "rule_of_40", "Rule of 40", growth + opm, "number", { op: "rule_of_40", description: `YoY growth% + operating-margin proxy% for ${q}`, inputs: [mref(cur.id), mref(yoy.id), mref(rev.id), mref(c.id), mref(sm.id)], configRefs: ["benchmark.rule_of_40"] }, { epistemic: "proxy", note: "Operating-margin proxy = (Revenue - COGS - S&M)/Revenue; no R&D/G&A in dataset.", basis: { kind: "benchmark", ref: "rule_of_40", thr: b.threshold, good: b.good, delta: growth + opm - b.threshold } }); }
  function qoqGrowth(q: string) { const i = qIdx(q); if (i <= 0) return null; const cur = companyArr(q), prev = companyArr(QUARTERS[i - 1]); return mk(`qoq.${q}`, "qoq_growth", "QoQ ARR Growth", cur.value / prev.value - 1, "ratio", { op: "growth", description: `ARR(${q})/ARR(${QUARTERS[i - 1]}) - 1`, inputs: [mref(cur.id), mref(prev.id)] }); }

  // ---- cohort retention ----
  function cohortMembers(seg: string | null, startQ: string) { const sc = arrK(startQ); const pool = seg ? ROWS.filter((r) => r.segment === seg) : ROWS; return pool.filter((r) => r[sc] > 0); }
  function nrr(seg: string | null, startQ: string, endQ: string) {
    const tag = seg ?? "company"; const sc = arrK(startQ), ec = arrK(endQ); const id = `nrr.${tag}.${startQ}_${endQ}`; if (store.has(id)) return store.get(id);
    const coh = cohortMembers(seg, startQ); const start = coh.reduce((s, r) => s + r[sc], 0), end = coh.reduce((s, r) => s + r[ec], 0); const ids = coh.map((r) => r.customer_id);
    const startMv = mk(`cstart.${tag}.${startQ}_${endQ}`, "cohort_start_arr", `${seg ?? "Company"} cohort start ARR`, start, "usd", { op: "sum", description: `Sum of ${sc} over ${coh.length} accounts active at ${startQ}${seg ? ` (${seg})` : ""}`, inputs: [rowsRef("customers", `${seg ? `segment=${seg} AND ` : ""}${sc}>0`, ids, { kind: "col_sum", seg, col: sc })] });
    const endMv = mk(`cend.${tag}.${startQ}_${endQ}`, "cohort_end_arr", `${seg ?? "Company"} cohort end ARR`, end, "usd", { op: "sum", description: `Sum of ${ec} over the same ${coh.length} start-cohort accounts - churned count as 0, new logos excluded`, inputs: [rowsRef("customers", `${seg ? `segment=${seg} AND ` : ""}${sc}>0 measured at ${ec}`, ids, { kind: "retention", seg, startQ, endQ })] });
    const b = BENCH.nrr;
    return mk(id, "nrr", `${seg ? seg : "Blended"} NRR`, (end / start) * 100, "percent", { op: "ratio_pct", description: "100 * cohort end ARR / cohort start ARR", inputs: [mref(endMv.id), mref(startMv.id)], configRefs: ["benchmark.nrr"] }, { basis: { kind: "benchmark", ref: "nrr", thr: b.threshold, good: "above", delta: (end / start) * 100 - b.threshold } });
  }
  function grr(seg: string | null, startQ: string, endQ: string) {
    const tag = seg ?? "company"; const sc = arrK(startQ), ec = arrK(endQ); const id = `grr.${tag}.${startQ}_${endQ}`; if (store.has(id)) return store.get(id);
    nrr(seg, startQ, endQ); const startMv = store.get(`cstart.${tag}.${startQ}_${endQ}`);
    const coh = cohortMembers(seg, startQ); let retained = 0; for (const r of coh) retained += Math.min(r[ec], r[sc]); const ids = coh.map((r) => r.customer_id);
    const retMv = mk(`cret.${tag}.${startQ}_${endQ}`, "cohort_retained_arr", `${seg ?? "Company"} retained ARR`, retained, "usd", { op: "sum_capped", description: `Sum min(${ec}, ${sc}) over ${coh.length} start-cohort accounts (expansion not credited)`, inputs: [rowsRef("customers", `${seg ? `segment=${seg} AND ` : ""}min(${ec},${sc})`, ids, { kind: "retention", seg, startQ, endQ })] });
    const b = BENCH.grr;
    return mk(id, "grr", `${seg ? seg : "Blended"} GRR`, (retained / startMv.value) * 100, "percent", { op: "ratio_pct", description: "100 * retained ARR / cohort start ARR", inputs: [mref(retMv.id), mref(startMv.id)], configRefs: ["benchmark.grr"] }, { basis: { kind: "benchmark", ref: "grr", thr: b.threshold, good: "above", delta: (retained / startMv.value) * 100 - b.threshold } });
  }
  function cohortBridge(seg: string | null, startQ: string, endQ: string) { const sc = arrK(startQ), ec = arrK(endQ); const coh = cohortMembers(seg, startQ); let b = 0, e = 0, ch = 0, co = 0, ex = 0; for (const r of coh) { b += r[sc]; e += r[ec]; if (r[ec] === 0) ch += r[sc]; else if (r[ec] < r[sc]) co += r[sc] - r[ec]; else if (r[ec] > r[sc]) ex += r[ec] - r[sc]; } return { label: seg || "Company", seg, n: coh.length, beginning: b, ending: e, churnLoss: ch, contractionLoss: co, expansionGain: ex, nrr: (e / b) * 100 }; }

  // ---- concentration & win rate ----
  function entShare(q: string) { const ent = segArr("Enterprise", q), tot = companyArr(q); return mk(`entshare.${q}`, "ent_share", "Enterprise ARR Share", ent.value / tot.value * 100, "percent", { op: "ratio_pct", description: `Enterprise ARR / total ARR for ${q}`, inputs: [mref(ent.id), mref(tot.id)] }); }
  function top10Share(q: string) { const col = arrK(q); const sorted = [...ROWS].sort((a, b) => b[col] - a[col]); const top = sorted.slice(0, 10); const tot = companyArr(q); return mk(`top10.${q}`, "top10_share", "Top-10 ARR Share", top.reduce((s, c) => s + c[col], 0) / tot.value * 100, "percent", { op: "topn_share", description: `Top-10 accounts' ARR / total ARR for ${q}`, inputs: [rowsRef("customers", `top 10 by ${col}`, top.map((c) => c.customer_id), { kind: "col_sum", seg: null, col }), mref(tot.id)] }); }
  function winRate(seg: string, q: string) { const rows = OPPS.filter((o) => o.segment === seg && o.close_quarter === q); const won = rows.filter((o) => o.stage === "won").length; return mk(`winrate.${seg}.${q}`, "win_rate", `${seg} Win Rate`, rows.length ? won / rows.length * 100 : NaN, "percent", { op: "ratio_pct", description: `${won} won / ${rows.length} closed deals (${seg}, ${q})`, inputs: [rowsRef("opportunities", `segment=${seg} AND close_quarter=${q}`, rows.map((o) => o.opp_id), { kind: "opps", seg, q })] }); }

  // ---- detector battery ----
  function fit1(ys: number[]) { const n = ys.length, xs = ys.map((_, i) => i); const xm = xs.reduce((a, b) => a + b, 0) / n, ym = ys.reduce((a, b) => a + b, 0) / n; const sxx = xs.reduce((s, x) => s + (x - xm) ** 2, 0); const slope = xs.reduce((s, x, i) => s + (x - xm) * (ys[i] - ym), 0) / sxx; const intercept = ym - slope * xm; const sse = ys.reduce((s, y, i) => s + (y - (slope * xs[i] + intercept)) ** 2, 0); const se = Math.sqrt(sse / (n - 2)) / Math.sqrt(sxx); const t = slope / se; const rel = ((slope * (n - 1) + intercept) - intercept) / Math.abs(intercept); return { slope, t, rel }; }

  // ===== falsification test menu: parameterized deterministic checks the model may PROPOSE
  // (by id + params) but never invent. The engine RUNS them and returns a verdict. Every slice
  // is engine-computed and traceable — the test menu is as bounded as the widget menu. =====
  function winRateBy(dim: string, q: string) {
    const key = (o: any) => dim === "segment" ? o.segment : dim === "region" ? o.region : o.deal_type;
    const closed = OPPS.filter((o: any) => o.close_quarter === q && (o.stage === "won" || o.stage === "lost"));
    const g: any = {};
    for (const o of closed) { const k = key(o); if (!k) continue; (g[k] || (g[k] = { won: 0, n: 0 })); g[k].n++; if (o.stage === "won") g[k].won++; }
    return Object.entries(g).map(([k, v]: any) => ({ key: k, value: v.n ? (v.won / v.n) * 100 : 0, n: v.n }));
  }
  function nrrBySeg(startQ: string, endQ: string) { return SEGMENTS.map((s) => { const mv = nrr(s, startQ, endQ); return { key: s, value: mv.value, n: mv.evidence?.n }; }); }
  function marginBySeg(q: string) {
    return SEGMENTS.map((s) => {
      const rows = OPEX.filter((o: any) => o.quarter === q && o.segment === s);
      const cogs = rows.reduce((a: number, o: any) => a + o.cogs, 0), rev = segArr(s, q).value / 4;
      return { key: s, value: rev ? (1 - cogs / rev) * 100 : 0, n: rows.length };
    });
  }
  const TEST_MENU = [
    { id: "localize_winrate", kind: "localize", metric: "win_rate", label: "Is the win-rate weakness concentrated, or uniform across the book?", dims: ["deal_type", "segment", "region"] },
    { id: "localize_nrr", kind: "localize", metric: "nrr", label: "Is the retention weakness concentrated in one segment, or broad?", dims: ["segment"] },
    { id: "localize_margin", kind: "localize", metric: "margin", label: "Is margin compression concentrated in a segment, or company-wide?", dims: ["segment"] },
    { id: "decompose_retention", kind: "decompose", label: "Is the retention loss driven by logo churn or by contraction?", dims: [] },
    { id: "persist_growth", kind: "persist", metric: "qoq_growth", label: "Has the growth trend reversed in the recent window?", dims: [] },
  ];
  function runTest(spec: any) {
    const q = spec.endQ || QUARTERS[QUARTERS.length - 1], sQ = spec.startQ || QUARTERS[QUARTERS.length - 5];
    if (spec.kind === "localize") {
      const dim = spec.dim || "segment";
      let slices: any[];
      if (spec.metric === "win_rate") slices = winRateBy(dim, q);
      else if (spec.metric === "nrr") slices = nrrBySeg(sQ, q);
      else if (spec.metric === "margin") slices = marginBySeg(q);
      else return null;
      const vals = slices.map((s) => s.value), spread = Math.max(...vals) - Math.min(...vals);
      const worst = slices.slice().sort((a, b) => a.value - b.value)[0];
      const concentrated = spread > 12;
      return { kind: "localize", metric: spec.metric, dim, slices, spread, worst, concentrated,
        verdict: concentrated ? "concentrated" : "uniform",
        summary: concentrated ? `Concentrated — ${worst.key} is the weak slice, a ${spread.toFixed(0)}-point spread` : `Roughly uniform across ${dim} — only a ${spread.toFixed(0)}-point spread` };
    }
    if (spec.kind === "decompose") {
      const b = cohortBridge(spec.seg || null, sQ, q), churn = Math.abs(b.churnLoss), contra = Math.abs(b.contractionLoss);
      const driver = churn >= contra ? "churn" : "contraction";
      return { kind: "decompose", churn, contra, expansion: b.expansionGain, driver,
        verdict: driver, summary: `Loss is driven by ${driver} — churn $${(churn / 1e6).toFixed(1)}M vs contraction $${(contra / 1e6).toFixed(1)}M` };
    }
    if (spec.kind === "persist") {
      const series = QUARTERS.slice(1).map((qq) => qoqGrowth(qq).value);
      const full = fit1(series).slope, recent = fit1(series.slice(-3)).slope;
      const reversing = Math.sign(recent) !== Math.sign(full) && Math.abs(recent) > 1e-9;
      return { kind: "persist", full, recent, reversing, verdict: reversing ? "reversing" : "persistent",
        summary: reversing ? `The trend reverses in the recent window` : `The trend persists in the recent window` };
    }
    return null;
  }

  function runDetectors(): Finding[] {
    const F: Finding[] = []; let id = 0;
    const emit = (f: Omit<Finding, "id">) => F.push({ id: `F${++id}`, ...f } as Finding);
    const L = QUARTERS[QUARTERS.length - 1], start = QUARTERS[QUARTERS.length - 5];
    // benchmark_breach
    const checks: [MetricValue, string][] = [[magicNumber(L)!, "magic_number"], [cacPayback(L)!, "cac_payback_mo"], [ruleOf40(L)!, "rule_of_40"], [nrr(null, start, L), "nrr"], [grr(null, start, L), "grr"], [grossMargin(L), "gross_margin"]];
    for (const [mv, key] of checks) { const bm = BENCH[key]; const breached = bm.good === "above" ? mv.value < bm.threshold : mv.value > bm.threshold; if (!breached) continue; emit({ type: "benchmark_breach", metric: key, scope: mv.scope, summary: `${bm.label} ${mv.value.toFixed(1)} breaches benchmark ${bm.threshold}`, values: [mv.id], salience: 0.5 + 0.5 * Math.min(1, Math.abs(mv.value - bm.threshold) / bm.threshold), polarity: "bad", evidence: { value: mv.value, threshold: bm.threshold }, provenance: { op: "benchmark_compare", description: `${bm.label} vs config threshold ${bm.threshold}`, inputs: [mref(mv.id)], configRefs: [`benchmark.${key}`] } } as any); }
    // cross_segment_divergence (segment NRR)
    const segN = SEGMENTS.map((s) => nrr(s, start, L)); const nv = segN.map((m) => m.value); const spread = Math.max(...nv) - Math.min(...nv);
    if (spread > 20) { const best = segN[nv.indexOf(Math.max(...nv))], worst = segN[nv.indexOf(Math.min(...nv))]; emit({ type: "cross_segment_divergence", metric: "nrr", scope: { grain: "segment", window: [start, L] }, summary: `NRR spread ${spread.toFixed(0)}pts: ${best.label.replace(" NRR", "")} ${best.value.toFixed(0)}% vs ${worst.label.replace(" NRR", "")} ${worst.value.toFixed(0)}%`, values: segN.map((m) => m.id), salience: Math.min(1, spread / 60), polarity: "neutral", evidence: { spread }, provenance: { op: "dispersion", description: `Spread across ${SEGMENTS.length} segment NRRs`, inputs: segN.map((m) => mref(m.id)) } } as any); }
    // trend
    const series = (fn: (q: string) => MetricValue | null, qs = QUARTERS) => qs.map(fn).filter((m): m is MetricValue => !!m && !isNaN(m.value));
    const tt: { metric: string; scope: Scope; s: MetricValue[] }[] = [
      { metric: "arr", scope: { grain: "segment", segment: "SMB" }, s: QUARTERS.map((q) => segArr("SMB", q)) },
      { metric: "magic_number", scope: { grain: "company" }, s: series(magicNumber) },
      { metric: "cac_payback_mo", scope: { grain: "company" }, s: series(cacPayback) },
      { metric: "rule_of_40", scope: { grain: "company" }, s: series(ruleOf40) },
      { metric: "win_rate", scope: { grain: "segment", segment: "Mid-Market" }, s: QUARTERS.map((q) => winRate("Mid-Market", q)) },
      { metric: "win_rate", scope: { grain: "segment", segment: "Enterprise" }, s: QUARTERS.map((q) => winRate("Enterprise", q)) },
      { metric: "arr", scope: { grain: "segment", segment: "Mid-Market" }, s: QUARTERS.map((q) => segArr("Mid-Market", q)) },
    ];
    for (const x of tt) { const ys = x.s.map((m) => m.value); if (ys.some((v) => isNaN(v))) continue; const { slope, t, rel } = fit1(ys); if (Math.abs(t) <= 2.5) continue; const m = x.metric; const polarity = slope > 0 && m === "arr" ? "good" : slope < 0 && ["arr", "win_rate", "magic_number", "rule_of_40"].includes(m) ? "bad" : slope > 0 && m === "cac_payback_mo" ? "bad" : "neutral"; const sc = (x.scope as any).segment ?? "company"; emit({ type: "trend", metric: m, scope: x.scope, summary: `${sc} ${m}: ${slope < 0 ? "declining" : "rising"} ${Math.abs(rel * 100).toFixed(0)}% over window (t=${t.toFixed(1)})`, values: x.s.map((z) => z.id), salience: Math.min(1, Math.abs(rel)), polarity, evidence: { slope, t, effect: rel }, provenance: { op: "linear_trend", description: `OLS slope over ${ys.length} quarters; salience = |effect size|, gate |t|>2.5`, inputs: x.s.map((z) => mref(z.id)) } } as any); }
    // concentration
    const entNow = entShare(L), entThen = entShare(QUARTERS[0]);
    if (entNow.value > 50 && entNow.value - entThen.value > 8) emit({ type: "concentration", metric: "ent_share", scope: { grain: "company", quarter: L }, summary: `Enterprise now ${entNow.value.toFixed(0)}% of ARR (up from ${entThen.value.toFixed(0)}%)`, values: [entNow.id, entThen.id], salience: Math.min(1, entNow.value / 100 + (entNow.value - entThen.value) / 100), polarity: "neutral", evidence: { now: entNow.value, then: entThen.value }, provenance: { op: "concentration", description: `Enterprise ARR share level + rise over window`, inputs: [mref(entNow.id), mref(entThen.id)] } } as any);
    // masking
    const m = detectMasking(start, L); if (m) emit(m as any);
    // acceleration
    const g = series(qoqGrowth); const gv = g.map((z) => z.value); const accel = fit1(gv).slope;
    if (accel > 0) emit({ type: "acceleration", metric: "qoq_growth", scope: { grain: "company", quarter: L }, summary: `Topline accelerating: QoQ growth rose to ${(gv[gv.length - 1] * 100).toFixed(1)}% (+${(accel * 100).toFixed(2)}pp/q)`, values: g.map((z) => z.id), salience: Math.min(1, accel * 120 + gv[gv.length - 1] * 4), polarity: "good", evidence: { accel }, provenance: { op: "acceleration", description: `Slope of QoQ growth series`, inputs: g.map((z) => mref(z.id)) } } as any);
    F.sort((a, b) => b.salience - a.salience);
    return F;
  }

  function detectMasking(startQ: string, endQ: string): any {
    const blended = nrr(null, startQ, endQ); const segN = SEGMENTS.map((s) => nrr(s, startQ, endQ));
    if (blended.value <= BENCH.nrr.threshold) return null;
    const worst = segN.reduce((a, b) => (b.value < a.value ? b : a)); if (worst.value >= BENCH.nrr.threshold - 5) return null;
    const seg = worst.label.replace(" NRR", "");
    const wEnd = ROWS.filter((r) => r.segment === seg).reduce((s, r) => s + r[arrK(endQ)], 0), total = ROWS.reduce((s, r) => s + r[arrK(endQ)], 0);
    const wShare = (wEnd / total) * 100, gap = blended.value - worst.value;
    return { id: "F_masking", type: "masking", metric: "nrr", scope: { grain: "company", window: [startQ, endQ] }, label: `Masking - blended NRR conceals ${seg}`, summary: `Blended NRR ${blended.value.toFixed(0)}% clears the 100% benchmark while ${seg} sits at ${worst.value.toFixed(0)}% (${wShare.toFixed(0)}% of ARR).`, value: gap, unit: "pp", salience: Math.min(1, gap / 60 + wShare / 200), polarity: "bad", blendedId: blended.id, worstId: worst.id, worstSeg: seg, wShare, evidence: { blended: blended.value, worst: worst.value, gap, worstShare: wShare }, provenance: { op: "composition_gap", description: "Aggregate clears the benchmark while the worst component fails; gap weighted by that component's ARR share.", inputs: [mref(blended.id), mref(worst.id)], configRefs: ["benchmark.nrr"] } };
  }

  // ---- trace: resolve a row leaf's selector to actual rows ----
  function resolveLeaf(sel: RowSelector): ResolvedRows {
    if (!sel || !sel.kind) return { kind: "col_sum", col: "", n: 0, rows: [] };   // never crash the trace
    if (sel.kind === "opps") { const rows = OPPS.filter((o: any) => o.segment === sel.seg && o.close_quarter === sel.q); const won = rows.filter((o: any) => o.stage === "won").length; return { kind: "opps", n: rows.length, won, rows }; }
    if (sel.kind === "opex") { const rows = OPEX.filter((o) => o.quarter === sel.quarter); return { kind: "opex", field: sel.field, rows }; }
    if (sel.kind === "delta") { const fc = arrK(sel.from!), tc = arrK(sel.to!); const rows = ROWS.filter((r) => r[tc] - r[fc] > 0).map((r) => ({ id: r.customer_id, a: r[fc], b: r[tc] })).sort((x, y) => (y.b - y.a) - (x.b - x.a)); return { kind: "delta", from: sel.from, to: sel.to, n: rows.length, rows }; }
    const pool = sel.seg ? ROWS.filter((r) => r.segment === sel.seg) : ROWS;
    if (sel.kind === "retention") { const sc = arrK(sel.startQ!), ec = arrK(sel.endQ!); const coh = pool.filter((r) => r[sc] > 0); const churned: any[] = [], contracted: any[] = [], expanded: any[] = []; for (const r of coh) { const s = r[sc], e = r[ec]; if (e === 0) churned.push(r); else if (e < s) contracted.push(r); else if (e > s) expanded.push(r); } return { kind: "retention", sc, ec, n: coh.length, churned, contracted, expanded }; }
    if (sel.kind === "col_sum") { const col = sel.col!; const rows = pool.filter((r) => r[col] > 0).map((r) => ({ id: r.customer_id, v: r[col] })).sort((a, b) => b.v - a.v); return { kind: "col_sum", col, n: rows.length, rows }; }
    return { kind: "col_sum", col: "", n: 0, rows: [] };   // unknown kind → safe empty, never throw
  }

  return { store, QUARTERS, SEGMENTS, BENCH, companyArr, segArr, cogsTotal, smTotal, revenueQ, netNewArr, grossNewBookings, magicNumber, grossMargin, cacPayback, ruleOf40, qoqGrowth, nrr, grr, cohortBridge, entShare, top10Share, winRate, runDetectors, detectMasking, resolveLeaf, TEST_MENU, runTest, winRateBy, nrrBySeg, marginBySeg };
}
