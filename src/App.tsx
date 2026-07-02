import React, { useState, useMemo, useEffect } from "react";

import { createEngine } from "./engine-core";

// The engine is created once from the dataset fetched at runtime (see App bootstrap).
// One engine, two consumers: this same engine-core is what scripts/validate.ts proves
// against the oracle. The browser never hand-edits it.
let E;
function initEngine(ds) {
  E = createEngine({ customers: ds.facts.customers, opex: ds.facts.opex, quarters: ds.meta.quarters, segments: ds.meta.segments, benchmarks: ds.benchmarks });
}
// All model calls go through one seam. In production this hits the Netlify function
// holding the key server-side; running plain `vite` (no function) it throws and the
// callers fall back to captured compositions / graceful declines.
async function callModel(task, messages, max_tokens) {
  const res = await fetch("/.netlify/functions/curate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, messages, max_tokens }) });
  if (!res.ok) throw new Error("model " + res.status);
  return res.json();
}

const fmtM = (v) => `$${(v / 1e6).toFixed(2)}M`;
const fmtK = (v) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${(v / 1e3).toFixed(1)}K`);
const fmtPct = (v) => `${v.toFixed(1)}%`;
function fmtMV(mv) { switch (mv.unit) { case "usd": return fmtM(mv.value); case "percent": return fmtPct(mv.value); case "ratio": return `${mv.value.toFixed(2)}x`; case "months": return `${mv.value.toFixed(0)} mo`; case "number": return `${mv.value.toFixed(0)}`; case "pp": return `${mv.value.toFixed(0)} pp`; default: return `${mv.value}`; } }

// ================= trace =================
function RowsLeaf({ leaf }) {
  const r = useMemo(() => E.resolveLeaf(leaf.selector), [leaf]);
  let body, stat, note;
  if (r.kind === "retention") {
    const sample = [...r.churned.map((x) => ({ ...x, k: "ch" })), ...r.contracted.map((x) => ({ ...x, k: "co" }))].sort((a, b) => (b[r.sc] - b[r.ec]) - (a[r.sc] - a[r.ec])).slice(0, 6);
    stat = (<><span><b>{r.n}</b> cohort rows</span><span className="dot ember" /><b>{r.churned.length}</b> churned<span className="dot ember2" /><b>{r.contracted.length}</b> contracted<span className="dot verdant" /><b>{r.expanded.length}</b> expanded</>);
    body = (<table className="rows-tbl"><thead><tr><th>account</th><th>{r.sc.slice(4)}</th><th>{r.ec.slice(4)}</th><th>Δ</th></tr></thead><tbody>{sample.map((x) => (<tr key={x.customer_id}><td className="mono">{x.customer_id}</td><td className="mono">{fmtK(x[r.sc])}</td><td className="mono">{x[r.ec] === 0 ? "—" : fmtK(x[r.ec])}</td><td className="mono neg">−{fmtK(x[r.sc] - x[r.ec]).slice(1)}</td></tr>))}</tbody></table>);
    note = `resolved live against the ${r.n} cohort rows — read from the data, not produced by a model`;
  } else if (r.kind === "col_sum") {
    stat = (<span><b>{r.n}</b> rows contribute · top 6</span>);
    body = (<table className="rows-tbl"><thead><tr><th>account</th><th>{r.col.slice(4)} ARR</th></tr></thead><tbody>{r.rows.slice(0, 6).map((x) => (<tr key={x.id}><td className="mono">{x.id}</td><td className="mono">{fmtK(x.v)}</td></tr>))}</tbody></table>);
    note = `summed live over ${r.n} rows`;
  } else if (r.kind === "delta") {
    stat = (<span><b>{r.n}</b> accounts with positive ARR change · top 6</span>);
    body = (<table className="rows-tbl"><thead><tr><th>account</th><th>{r.from}</th><th>{r.to}</th><th>Δ</th></tr></thead><tbody>{r.rows.slice(0, 6).map((x) => (<tr key={x.id}><td className="mono">{x.id}</td><td className="mono">{x.a === 0 ? "new" : fmtK(x.a)}</td><td className="mono">{fmtK(x.b)}</td><td className="mono pos">+{fmtK(x.b - x.a).slice(1)}</td></tr>))}</tbody></table>);
    note = `new logos + expansion, summed live`;
  } else {
    stat = (<span><b>{r.rows.length}</b> opex rows · {r.field}</span>);
    body = (<table className="rows-tbl"><thead><tr><th>segment</th><th>quarter</th><th>{r.field}</th></tr></thead><tbody>{r.rows.map((o, i) => (<tr key={i}><td className="mono">{o.segment}</td><td className="mono">{o.quarter}</td><td className="mono">{fmtK(o[r.field])}</td></tr>))}</tbody></table>);
    note = `operating expense at segment×quarter grain — its natural grain`;
  }
  return (<div className="rows"><div className="rows-stat">{stat}</div>{body}<div className="anno">{note}</div></div>);
}
function TraceNode({ node, depth, isFinding }) {
  const kids = node.provenance?.inputs?.length;
  const [open, setOpen] = useState(depth < 2);
  const val = isFinding ? `${node.value.toFixed(0)} pp` : fmtMV(node);
  return (
    <div className="node" style={{ marginLeft: depth ? 18 : 0 }}>
      <div className="node-head" onClick={() => kids && setOpen(!open)} role={kids ? "button" : undefined} tabIndex={kids ? 0 : undefined} onKeyDown={(e) => e.key === "Enter" && setOpen(!open)}>
        <span className="node-glyph">{kids ? (open ? "▾" : "▸") : "◆"}</span>
        <span className="node-label">{node.label}{node.epistemic === "proxy" && <span className="proxy">proxy</span>}</span>
        <span className="node-op">{node.provenance.op}</span>
        <span className="node-val mono">{val}</span>
      </div>
      {open && <div className="node-desc">{node.provenance.description}{node.note ? ` — ${node.note}` : ""}</div>}
      {open && kids ? <div className="node-kids">{node.provenance.inputs.map((inp, i) => inp.kind === "metric" ? <TraceNode key={i} node={E.store.get(inp.id)} depth={depth + 1} /> : <RowsLeaf key={i} leaf={inp} />)}</div> : null}
    </div>
  );
}
function TraceDrawer({ picked, onClose }) {
  if (!picked) return null;
  return (
    <div className="drawer">
      <div className="drawer-bar"><span className="drawer-t">PROVENANCE · trace to the rows</span><button className="drawer-x" onClick={onClose}>close ✕</button></div>
      <div className="drawer-body"><div className="anno anno-top">Every value below is computed from the raw account rows. The arrangement was chosen by the model; these numbers were not.</div><TraceNode node={picked.node} depth={0} isFinding={picked.isFinding} /></div>
    </div>
  );
}

// ================= chart primitives (renderer; owns all scales) =================
function Waterfall({ c }) {
  const steps = [{ k: "Beginning", t: "anchor", v: c.beginning }, { k: "Expansion", t: "up", v: c.expansionGain }, { k: "Contraction", t: "down", v: c.contractionLoss }, { k: "Churn", t: "down", v: c.churnLoss }, { k: "Ending", t: "anchor", v: c.ending }];
  const W = 440, H = 260, padL = 50, padR = 14, padB = 42, padT = 16; const plotW = W - padL - padR, plotH = H - padT - padB;
  const domainMax = (c.beginning + c.expansionGain) * 1.08; const y = (v) => padT + plotH - (v / domainMax) * plotH; const bw = (plotW / steps.length) * 0.6, gap = plotW / steps.length;
  let run = 0; const bars = []; steps.forEach((s, i) => { const x = padL + gap * i + (gap - bw) / 2; let top, bot; if (s.t === "anchor") { top = s.v; bot = 0; run = s.v; } else if (s.t === "up") { bot = run; top = run + s.v; run = top; } else { top = run; bot = run - s.v; run = bot; } bars.push({ ...s, x, yTop: y(Math.max(top, bot)), h: Math.abs(y(top) - y(bot)), cy: y(run) }); });
  return (<svg viewBox={`0 0 ${W} ${H}`} className="wf">{Array.from({ length: 5 }, (_, i) => (domainMax / 4) * i).map((tv, i) => (<g key={i}><line x1={padL} x2={W - padR} y1={y(tv)} y2={y(tv)} className="wf-grid" /><text x={padL - 8} y={y(tv) + 3} className="wf-axis" textAnchor="end">{fmtM(tv)}</text></g>))}{bars.map((b, i) => (<g key={i}>{i > 0 && <line x1={bars[i - 1].x + bw} x2={b.x} y1={bars[i - 1].cy} y2={bars[i - 1].cy} className="wf-conn" />}<rect x={b.x} y={b.yTop} width={bw} height={Math.max(b.h, 1)} className={`wf-bar wf-${b.t}`} /><text x={b.x + bw / 2} y={H - padB + 15} className="wf-xlab" textAnchor="middle">{b.k}</text><text x={b.x + bw / 2} y={H - padB + 28} className="wf-xval" textAnchor="middle">{b.t === "anchor" ? fmtM(b.v) : (b.t === "up" ? "+" : "−") + fmtM(b.v).slice(1)}</text></g>))}</svg>);
}
function Combo({ bars, line, benchmark, good, onPick, fmtL, fmtR }) {
  const W = 620, H = 260, padL = 54, padR = 50, padB = 36, padT = 18; const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxBar = Math.max(...bars.map((b) => b.value)) * 1.12;
  const maxLine = Math.max(...line.map((p) => p.value), benchmark) * 1.18;
  const yL = (v) => padT + plotH - (v / maxBar) * plotH, yR = (v) => padT + plotH - (v / maxLine) * plotH;
  const n = bars.length, slot = plotW / n, bw = slot * 0.46, x = (i) => padL + slot * i + slot / 2;
  const ticks = Array.from({ length: 4 }, (_, i) => (maxBar / 3) * i), rticks = Array.from({ length: 4 }, (_, i) => (maxLine / 3) * i);
  const path = line.map((p, i) => `${i ? "L" : "M"}${x(i)},${yR(p.value)}`).join(" ");
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln">
    {ticks.map((tv, i) => (<g key={i}><line x1={padL} x2={W - padR} y1={yL(tv)} y2={yL(tv)} className="wf-grid" /><text x={padL - 8} y={yL(tv) + 3} className="wf-axis" textAnchor="end">{fmtL(tv)}</text></g>))}
    {rticks.map((tv, i) => (<text key={i} x={W - padR + 8} y={yR(tv) + 3} className="wf-axis r" textAnchor="start">{fmtR(tv)}</text>))}
    {bars.map((b, i) => (<rect key={i} x={x(i) - bw / 2} y={yL(b.value)} width={bw} height={padT + plotH - yL(b.value)} className="co-bar" onClick={() => onPick(b.mv)} />))}
    <line x1={padL} x2={W - padR} y1={yR(benchmark)} y2={yR(benchmark)} className="ln-bench" /><text x={padL + 2} y={yR(benchmark) - 5} className="ln-bench-lab" textAnchor="start">magic benchmark {fmtR(benchmark)}</text>
    <path d={path} className="ln-path" />
    {line.map((p, i) => { const br = good === "above" ? p.value < benchmark : p.value > benchmark; return (<g key={i} className="ln-pt" onClick={() => onPick(p.mv)}><circle cx={x(i)} cy={yR(p.value)} r="5" className={br ? "ln-dot bad" : "ln-dot good"} /></g>); })}
    {bars.map((b, i) => (<text key={i} x={x(i)} y={H - padB + 15} className="wf-xlab" textAnchor="middle">{b.q}</text>))}
    <text x={padL - 8} y={padT - 5} className="wf-axis" textAnchor="end">S&M $</text><text x={W - padR + 8} y={padT - 5} className="wf-axis r" textAnchor="start">magic</text>
  </svg>);
}
function StackedArea({ quarters, series, onPick }) {
  const W = 620, H = 270, padL = 52, padR = 14, padB = 34, padT = 12; const plotW = W - padL - padR, plotH = H - padT - padB;
  const totals = quarters.map((_, i) => series.reduce((s, se) => s + se.points[i].value, 0));
  const maxY = Math.max(...totals) * 1.06; const x = (i) => padL + (plotW * i) / (quarters.length - 1), y = (v) => padT + plotH - (v / maxY) * plotH;
  const ticks = Array.from({ length: 4 }, (_, i) => (maxY / 3) * i);
  let cum = quarters.map(() => 0); const bands = [];
  for (const se of series) { const lower = cum.slice(), upper = cum.map((c, i) => c + se.points[i].value); const up = upper.map((v, i) => `${x(i)},${y(v)}`).join(" "); const lo = lower.map((v, i) => `${x(i)},${y(v)}`).reverse().join(" "); bands.push({ seg: se.seg, color: se.color, poly: `${up} ${lo}` }); cum = upper; }
  return (<div><div className="legend">{series.slice().reverse().map((se) => (<button key={se.seg} className="chip" onClick={() => onPick(se.points[se.points.length - 1].mv)}><span className="sw" style={{ background: se.color }} />{se.seg}</button>))}</div>
    <svg viewBox={`0 0 ${W} ${H}`} className="ln">{ticks.map((tv, i) => (<g key={i}><line x1={padL} x2={W - padR} y1={y(tv)} y2={y(tv)} className="wf-grid" /><text x={padL - 8} y={y(tv) + 3} className="wf-axis" textAnchor="end">{fmtM(tv)}</text></g>))}{bands.map((b, i) => (<polygon key={i} points={b.poly} fill={b.color} className="area" />))}{quarters.map((q, i) => (<text key={i} x={x(i)} y={H - padB + 15} className="wf-xlab" textAnchor="middle">{q}</text>))}</svg></div>);
}
function LineChart({ series, benchmark, good, onPick, fmt }) {
  const W = 620, H = 230, padL = 46, padR = 16, padB = 34, padT = 14; const plotW = W - padL - padR, plotH = H - padT - padB;
  const vals = series.map((p) => p.value).concat(benchmark != null ? [benchmark] : []); const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.18 || 0.1; const dMin = Math.min(lo - pad, benchmark != null ? benchmark - pad : Infinity), dMax = Math.max(hi + pad, benchmark != null ? benchmark + pad : -Infinity);
  const x = (i) => padL + (plotW * i) / (series.length - 1); const y = (v) => padT + plotH - ((v - dMin) / (dMax - dMin)) * plotH;
  const path = series.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const ticks = Array.from({ length: 4 }, (_, i) => dMin + ((dMax - dMin) / 3) * i);
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln">
    {ticks.map((tv, i) => (<g key={i}><line x1={padL} x2={W - padR} y1={y(tv)} y2={y(tv)} className="wf-grid" /><text x={padL - 8} y={y(tv) + 3} className="wf-axis" textAnchor="end">{fmt(tv)}</text></g>))}
    {benchmark != null && <><line x1={padL} x2={W - padR} y1={y(benchmark)} y2={y(benchmark)} className="ln-bench" /><text x={W - padR} y={y(benchmark) - 5} className="ln-bench-lab" textAnchor="end">benchmark {fmt(benchmark)}</text></>}
    <path d={path} className="ln-path" />
    {series.map((p, i) => { const br = benchmark != null && (good === "above" ? p.value < benchmark : p.value > benchmark); return (<g key={i} className="ln-pt" onClick={() => onPick(p.mv)}><circle cx={x(i)} cy={y(p.value)} r="5" className={benchmark == null ? "ln-dot neutral" : br ? "ln-dot bad" : "ln-dot good"} /><text x={x(i)} y={H - padB + 15} className="wf-xlab" textAnchor="middle">{p.q}</text></g>); })}
  </svg>);
}
function Callout({ mv, onPick }) {
  const b = mv.basis; const breached = b.good === "above" ? mv.value < b.thr : mv.value > b.thr;
  const arrow = mv.value < b.thr ? "▼" : "▲"; const thrFmt = mv.unit === "ratio" ? `${b.thr}x` : mv.unit === "months" ? `${b.thr}mo` : mv.unit === "percent" ? `${b.thr}%` : `${b.thr}`;
  return (<button className={`callout ${breached ? "bad" : "good"}`} onClick={() => onPick(mv)}><span className="co-v">{fmtMV(mv)}</span><span className="co-l">{mv.label}{mv.epistemic === "proxy" && <span className="proxy">proxy</span>}</span><span className="co-basis">{arrow} vs {thrFmt}</span></button>);
}
// Presentation registry: each finding TYPE declares how it renders as a card. A generic
// FindingCard draws any of them — adding a finding type is a registry entry here, not a
// new component. This is the production shape (typed findings → declared presentation →
// one renderer) at demo scale. The relationship verb belongs to the finding type because
// the detector's job *is* to detect that relationship (masking = concealment).
const FINDING_PRESENTATION = {
  masking: {
    verb: "conceals",
    sides: (f) => [
      { mv: E.store.get(f.blendedId), badge: "clears benchmark" },
      { mv: E.store.get(f.worstId), badge: `underwater · ${f.wShare.toFixed(0)}% of ARR` },
    ],
  },
  // future: divergence:{ verb:"diverges from", sides:… }, concentration:{ … } — no new component
};
function toneOf(mv) {
  if (!mv.basis) return "neutral";
  const clears = mv.basis.good === "above" ? mv.value >= mv.basis.thr : mv.value <= mv.basis.thr;
  return clears ? "good" : "bad";
}
function FindingSide({ side, onPick }) {
  const tone = toneOf(side.mv);
  return (<button className={`fside ${tone}`} onClick={onPick}>
    <span className="fside-v">{fmtMV(side.mv)}</span>
    <span className="fside-l">{side.mv.label}</span>
    <span className={`fside-badge ${tone}`}>{side.badge}</span>
  </button>);
}
function FindingCard({ finding, onPick }) {
  const schema = FINDING_PRESENTATION[finding.type];
  if (!schema) return null;                 // no bespoke fallback — unknown type simply doesn't render
  const sides = schema.sides(finding);
  const pick = () => onPick({ node: finding, isFinding: true });
  return (<div className="fcard">
    <div className="fcard-relation">
      <FindingSide side={sides[0]} onPick={pick} />
      <span className="fcard-verb">{schema.verb}</span>
      <FindingSide side={sides[1]} onPick={pick} />
    </div>
    <button className="inspect" onClick={pick}>▸ inspect provenance</button>
  </div>);
}

// ================= widget catalog (engine offering; pre-verified) =================
function buildCatalog() {
  const Q1 = E.QUARTERS.slice(1);
  const masking = E.detectMasking("24Q4", "25Q4");
  const segSeries = [
    { seg: "SMB", color: "#B23A2E", points: E.QUARTERS.map((q) => ({ q, value: E.segArr("SMB", q).value, mv: E.segArr("SMB", q) })) },
    { seg: "Mid-Market", color: "#9A7B4F", points: E.QUARTERS.map((q) => ({ q, value: E.segArr("Mid-Market", q).value, mv: E.segArr("Mid-Market", q) })) },
    { seg: "Enterprise", color: "#1A1D21", points: E.QUARTERS.map((q) => ({ q, value: E.segArr("Enterprise", q).value, mv: E.segArr("Enterprise", q) })) },
  ];
  const smBars = Q1.map((q) => ({ q, value: E.smTotal(q).value, mv: E.smTotal(q) }));
  const magicLine = Q1.map((q) => ({ q, value: E.magicNumber(q).value, mv: E.magicNumber(q) }));
  const accelLine = Q1.map((q) => ({ q, value: E.qoqGrowth(q).value * 100, mv: E.qoqGrowth(q) }));
  return {
    masking_card: { kind: "finding_card", polarity: "bad", desc: "Blended NRR looks healthy but conceals an underwater segment (SMB).", data: { finding: masking } },
    bridge_smb: { kind: "waterfall", polarity: "bad", desc: "SMB retention bridge — churn and contraction outweigh expansion.", data: { bridge: E.cohortBridge("SMB", "24Q4", "25Q4"), title: "SMB retention bridge", mv: E.nrr("SMB", "24Q4", "25Q4") } },
    bridge_enterprise: { kind: "waterfall", polarity: "good", desc: "Enterprise retention bridge — the expansion engine; net retention well above 100%.", data: { bridge: E.cohortBridge("Enterprise", "24Q4", "25Q4"), title: "Enterprise retention bridge", mv: E.nrr("Enterprise", "24Q4", "25Q4") } },
    bridge_blended: { kind: "waterfall", polarity: "neutral", desc: "Company-wide retention bridge across all segments.", data: { bridge: E.cohortBridge(null, "24Q4", "25Q4"), title: "Blended retention bridge", mv: E.nrr(null, "24Q4", "25Q4") } },
    efficiency_combo: { kind: "combo", polarity: "bad", desc: "Sales & marketing spend climbing while sales efficiency (magic number) falls through its benchmark.", data: { bars: smBars, line: magicLine, benchmark: E.BENCH.magic_number.threshold, good: E.BENCH.magic_number.good } },
    magic_line: { kind: "line", polarity: "bad", desc: "Magic number trend crossing its 0.75 benchmark.", data: { series: magicLine, benchmark: E.BENCH.magic_number.threshold, good: "above", fmt: (v) => `${v.toFixed(2)}x` } },
    accel_line: { kind: "line", polarity: "good", desc: "Quarter-over-quarter ARR growth accelerating.", data: { series: accelLine, benchmark: null, good: "above", fmt: (v) => `${v.toFixed(1)}%` } },
    callout_magic: { kind: "callout", polarity: "bad", desc: "SaaS magic number vs benchmark.", data: { mv: E.magicNumber("25Q4") } },
    callout_cac: { kind: "callout", polarity: "bad", desc: "CAC payback (months) vs benchmark.", data: { mv: E.cacPayback("25Q4") } },
    callout_r40: { kind: "callout", polarity: "bad", desc: "Rule of 40 vs benchmark.", data: { mv: E.ruleOf40("25Q4") } },
    callout_grr: { kind: "callout", polarity: "bad", desc: "Gross revenue retention vs benchmark.", data: { mv: E.grr(null, "24Q4", "25Q4") } },
    segment_stack: { kind: "stacked_area", polarity: "neutral", desc: "ARR by segment over time — topline growth and rising Enterprise concentration.", data: { series: segSeries } },
  };
}

function Widget({ id, catalog, onPick }) {
  const w = catalog[id]; if (!w) return null; const d = w.data;
  if (w.kind === "finding_card") return <FindingCard finding={d.finding} onPick={onPick} />;
  if (w.kind === "callout") return <Callout mv={d.mv} onPick={(mv) => onPick({ node: mv })} />;
  if (w.kind === "combo") return <Combo bars={d.bars} line={d.line} benchmark={d.benchmark} good={d.good} fmtL={(v) => fmtM(v)} fmtR={(v) => `${v.toFixed(2)}x`} onPick={(mv) => onPick({ node: mv })} />;
  if (w.kind === "line") return <LineChart series={d.series} benchmark={d.benchmark} good={d.good} fmt={d.fmt} onPick={(mv) => onPick({ node: mv })} />;
  if (w.kind === "stacked_area") return <StackedArea quarters={E.QUARTERS} series={d.series} onPick={(mv) => onPick({ node: mv })} />;
  if (w.kind === "waterfall") return (<div><div className="bridge-h"><button className="bridge-trace" onClick={() => onPick({ node: d.mv })}>{d.title} ▸ trace</button><span className={d.bridge.nrr >= 100 ? "good" : "bad"}>NRR {d.bridge.nrr.toFixed(0)}%</span></div><Waterfall c={d.bridge} /></div>);
  return null;
}

// ================= the model: curation (bounded) =================
const ROLES = {
  CFO: { label: "Chief Financial Officer", focus: "durability, efficiency, retention quality, and concentration risk" },
  CRO: { label: "Head of Revenue (CRO)", focus: "growth, bookings momentum, expansion, and segment performance" },
};
function buildPrompt(role, catalog) {
  const cat = Object.entries(catalog).map(([id, w]) => `- ${id} [${w.kind}] (${w.polarity}): ${w.desc}`).join("\n");
  return [
    "You are the curation layer of Caliper, a deterministic analytics system. The engine has already computed every number and detected every finding. You cannot compute, alter, or invent numbers or findings — you only arrange pre-built, pre-verified widgets.",
    "",
    `ROLE: ${role.label} — cares about ${role.focus}.`,
    "",
    "CATALOG (the only widgets available; each is already rendered and traceable):",
    cat,
    "",
    "Compose a dashboard for this role: select widgets and arrange them into 2–3 titled sections, ordered by what matters most to the role. For each widget set an emphasis ('hero' | 'standard' | 'compact') and write brief QUALITATIVE framing — a headline (≤6 words) and a one-sentence 'soWhat' for this role.",
    "",
    "Rules:",
    "- Use ONLY widget ids from the catalog. Never invent an id.",
    "- State NO numbers in your framing — not values, not thresholds, not benchmark figures (do not write '100%', '0.75', etc.). Refer to a benchmark by name ('clears the retention benchmark'), never by its number. The widgets render every figure.",
    "- The same underlying data can support opposite emphases for different roles — choose the framing true to THIS role (e.g. rising Enterprise concentration is 'strength' to a CRO, 'fragility' to a CFO).",
    "- Be editorial: select 4–7 widgets TOTAL across all sections and OMIT widgets this role would not open with — do not include the whole catalog. Lead with what this role is accountable for. Mark callouts 'compact'.",
    "",
    'Return ONLY a JSON object, no prose, no markdown fences: {"sections":[{"heading":"...","blocks":[{"widget":"<id>","emphasis":"hero|standard|compact","headline":"...","soWhat":"..."}]}]}',
  ].join("\n");
}
async function curate(roleKey, catalog) {
  const prompt = buildPrompt(ROLES[roleKey], catalog);
  const t0 = Date.now();
  const data = await callModel("curate", [{ role: "user", content: prompt }], 1000);
  const raw = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let parsed = null; try { parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()); } catch (e) { /* parsed stays null -> fallback */ }
  return { prompt, raw, parsed, ms: Date.now() - t0 };
}
function validateComposition(spec, catalog) {
  if (!spec || !Array.isArray(spec.sections)) return { spec: null, rejectedIds: [] };
  const rejectedIds = [];
  const sections = spec.sections.map((s) => ({
    heading: String(s.heading || ""),
    blocks: (s.blocks || []).filter((b) => { const ok = !!catalog[b.widget]; if (!ok) rejectedIds.push(b.widget); return ok; })
      .map((b) => ({ widget: b.widget, emphasis: ["hero", "standard", "compact"].includes(b.emphasis) ? b.emphasis : "standard", headline: String(b.headline || "").slice(0, 80), soWhat: String(b.soWhat || "").slice(0, 220) })),
  })).filter((s) => s.blocks.length);
  return { spec: sections.length ? { sections } : null, rejectedIds };
}

// captured fallback per role (labeled), used only when the model is unavailable
const FALLBACK = {
  CFO: { sections: [
    { heading: "Retention quality", blocks: [
      { widget: "masking_card", emphasis: "hero", headline: "The headline hides the rot", soWhat: "Net retention only looks healthy because expansion masks an underwater segment." },
      { widget: "bridge_smb", emphasis: "standard", headline: "Where revenue leaks", soWhat: "In the worst segment, churn and contraction overwhelm expansion." }] },
    { heading: "Efficiency & durability", blocks: [
      { widget: "callout_magic", emphasis: "compact", headline: "", soWhat: "" },
      { widget: "callout_cac", emphasis: "compact", headline: "", soWhat: "" },
      { widget: "callout_r40", emphasis: "compact", headline: "", soWhat: "" },
      { widget: "efficiency_combo", emphasis: "standard", headline: "Spending more to grow less", soWhat: "Sales spend is climbing while each dollar buys less growth." }] },
  ] },
  CRO: { sections: [
    { heading: "Growth", blocks: [
      { widget: "segment_stack", emphasis: "hero", headline: "Enterprise carrying the number", soWhat: "Topline is growing and the Enterprise motion is doing the heavy lifting." },
      { widget: "accel_line", emphasis: "standard", headline: "Momentum is building", soWhat: "Quarter-over-quarter growth is speeding up, not flattening." }] },
    { heading: "Expansion", blocks: [
      { widget: "bridge_enterprise", emphasis: "standard", headline: "The expansion engine", soWhat: "Existing Enterprise accounts keep growing well past what they started at." },
      { widget: "callout_grr", emphasis: "compact", headline: "", soWhat: "" }] },
  ] },
};

// ================= composition rendering =================
function Block({ block, catalog, onPick }) {
  const hasFrame = block.headline || block.soWhat;
  return (<div className={`block emph-${block.emphasis}`}>
    {hasFrame && <div className="frame"><span className="frame-tick">curated</span>{block.headline && <span className="frame-h">{block.headline}</span>}{block.soWhat && <span className="frame-sw">{block.soWhat}</span>}</div>}
    <Widget id={block.widget} catalog={catalog} onPick={onPick} />
  </div>);
}
function Section({ section, catalog, onPick }) {
  // Build explicit rows: hero + strips span full; consecutive standard charts pair
  // two-up; a lone trailing standard fills its row (never orphans a half-empty row).
  const rows = []; let std = [], strip = [];
  const flushStrip = () => { if (strip.length) { rows.push({ t: "strip", blocks: strip }); strip = []; } };
  const flushStd = () => { while (std.length) rows.push(std.length >= 2 ? { t: "pair", blocks: [std.shift(), std.shift()] } : { t: "full", block: std.shift() }); };
  for (const b of section.blocks) {
    if (b.emphasis === "compact") { flushStd(); strip.push(b); }
    else if (b.emphasis === "hero") { flushStrip(); flushStd(); rows.push({ t: "full", block: b }); }
    else { flushStrip(); std.push(b); }
  }
  flushStrip(); flushStd();
  const render = (b, j) => <Block key={j} block={b} catalog={catalog} onPick={onPick} />;
  return (<section className="sec">
    <div className="sec-head"><span className="sec-t">{section.heading}</span></div>
    {rows.map((r, i) => r.t === "pair" ? <div key={i} className="row pair">{r.blocks.map(render)}</div>
      : r.t === "strip" ? <div key={i} className="row strip">{r.blocks.map(render)}</div>
      : <div key={i} className="row full">{render(r.block, 0)}</div>)}
  </section>);
}

function EntryScreen({ onEnter }) {
  return (<div className="entry">
    <div className="entry-mark">⟡ CALIPER</div>
    <div className="entry-sub">Caliper Systems · synthetic · ~$40M ARR vertical SaaS. The engine has computed the quarter. Enter as a role — the dashboard is curated live for what you're accountable for, from the same findings.</div>
    <div className="entry-roles">
      {Object.entries(ROLES).map(([k, r]) => (<button key={k} className="role" onClick={() => onEnter(k)}><span className="role-k">{k}</span><span className="role-l">{r.label}</span><span className="role-f">{r.focus}</span></button>))}
    </div>
  </div>);
}

// ================= query path: L1 intent → L2 engine → L3 narrate =================
const SUPPORTED = ["nrr", "grr", "magic_number", "cac_payback", "rule_of_40", "gross_margin", "arr", "qoq_growth", "ent_share", "retention_bridge"];
const SEGS = ["SMB", "Mid-Market", "Enterprise"];
function buildIntentPrompt(q) {
  return [
    "You are the intent layer of Caliper. Map the user's question to a query the deterministic engine can compute. You do NOT compute or state any number.",
    "SUPPORTED metrics: " + SUPPORTED.join(", ") + ".",
    "SEGMENTS: SMB, Mid-Market, Enterprise — or null for company-wide.",
    "BASIS: 'latest' (current value) or 'trend' (over the available quarters). For retention_bridge, basis is ignored.",
    "If the question maps to a supported metric+scope, return answerable=true with the mapping and a confidence 0–1 reflecting how sure you are of the interpretation. If it asks for something this engine cannot answer (forecasts, a metric not in the list, anything unrelated), return answerable=false with a one-line reason.",
    'Return ONLY JSON, no fences: {"answerable":true|false,"metric":"<one of the supported list or null>","segment":"SMB|Mid-Market|Enterprise|null","basis":"latest|trend","confidence":0-1,"reason":"<short, only if not answerable>"}',
    "Question: " + JSON.stringify(q),
  ].join("\n");
}
async function parseIntent(q) {
  const data = await callModel("intent", [{ role: "user", content: buildIntentPrompt(q) }], 300);
  const raw = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let intent = null; try { intent = JSON.parse(raw.replace(/```json|```/g, "").trim()); } catch (e) {}
  return { raw, intent };
}
function validateIntent(it) {
  if (!it || it.answerable !== true || !SUPPORTED.includes(it.metric)) return null;
  return { metric: it.metric, segment: SEGS.includes(it.segment) ? it.segment : null, basis: it.basis === "trend" ? "trend" : "latest", confidence: typeof it.confidence === "number" ? it.confidence : null };
}
// L2: dispatch the validated intent to the engine; returns a render descriptor or null.
function resolveQuery(it) {
  const seg = it.segment, S = ["24Q4", "25Q4"], last = "25Q4";
  const benchKey = { magic_number: "magic_number", cac_payback: "cac_payback_mo", rule_of_40: "rule_of_40", gross_margin: "gross_margin", nrr: "nrr", grr: "grr" };
  const fmt = { magic_number: (v) => `${v.toFixed(2)}x`, cac_payback: (v) => `${v.toFixed(0)} mo`, rule_of_40: (v) => `${v.toFixed(0)}`, gross_margin: (v) => `${v.toFixed(1)}%`, nrr: (v) => `${v.toFixed(1)}%`, grr: (v) => `${v.toFixed(1)}%`, arr: (v) => `$${(v / 1e6).toFixed(1)}M`, qoq_growth: (v) => `${v.toFixed(1)}%`, ent_share: (v) => `${v.toFixed(0)}%` };
  if (it.metric === "retention_bridge") { const b = E.cohortBridge(seg, S[0], S[1]), mv = E.nrr(seg, S[0], S[1]); return { kind: "waterfall", data: { bridge: b, title: `${seg || "Company"} retention bridge`, mv }, grounding: { label: `${seg || "Company"} retention`, hasBenchmark: true, status: b.nrr >= 100 ? "clears" : "breaches", direction: null, proxy: false } }; }
  const benchLatest = { magic_number: () => E.magicNumber(last), cac_payback: () => E.cacPayback(last), rule_of_40: () => E.ruleOf40(last), gross_margin: () => E.grossMargin(last), nrr: () => E.nrr(seg, S[0], S[1]), grr: () => E.grr(seg, S[0], S[1]) };
  if (it.basis === "latest" && benchLatest[it.metric]) { const mv = benchLatest[it.metric](); const ok = mv.basis.good === "above" ? mv.value >= mv.basis.thr : mv.value <= mv.basis.thr; return { kind: "callout", data: { mv }, grounding: { label: mv.label, hasBenchmark: true, status: ok ? "clears" : "breaches", direction: null, proxy: mv.epistemic === "proxy" } }; }
  const trend = {
    magic_number: () => E.QUARTERS.slice(1).map((q) => ({ q, value: E.magicNumber(q).value, mv: E.magicNumber(q) })),
    cac_payback: () => E.QUARTERS.slice(1).map((q) => ({ q, value: E.cacPayback(q).value, mv: E.cacPayback(q) })),
    rule_of_40: () => E.QUARTERS.slice(4).map((q) => ({ q, value: E.ruleOf40(q).value, mv: E.ruleOf40(q) })),
    gross_margin: () => E.QUARTERS.map((q) => ({ q, value: E.grossMargin(q).value, mv: E.grossMargin(q) })),
    arr: () => E.QUARTERS.map((q) => ({ q, value: (seg ? E.segArr(seg, q) : E.companyArr(q)).value, mv: seg ? E.segArr(seg, q) : E.companyArr(q) })),
    qoq_growth: () => E.QUARTERS.slice(1).map((q) => ({ q, value: E.qoqGrowth(q).value * 100, mv: E.qoqGrowth(q) })),
    ent_share: () => E.QUARTERS.map((q) => ({ q, value: E.entShare(q).value, mv: E.entShare(q) })),
  };
  if (trend[it.metric]) {
    const series = trend[it.metric](); const bk = benchKey[it.metric]; const benchmark = bk ? E.BENCH[bk].threshold : null; const good = bk ? E.BENCH[bk].good : "above";
    const a = series[0].value, z = series[series.length - 1].value, rel = (z - a) / (Math.abs(a) || 1);
    const direction = rel > 0.02 ? "rising" : rel < -0.02 ? "falling" : "flat";
    const status = benchmark != null ? ((good === "above" ? z >= benchmark : z <= benchmark) ? "clears" : "breaches") : null;
    return { kind: "line", data: { series, benchmark, good, fmt: fmt[it.metric] || ((v) => v.toFixed(1)) }, grounding: { label: `${seg ? seg + " " : ""}${it.metric.replace(/_/g, " ")}`, hasBenchmark: benchmark != null, status, direction, proxy: it.metric === "rule_of_40" } };
  }
  return null;
}
function buildNarratePrompt(q, desc) {
  const g = desc.grounding; const facts = [`Metric: ${g.label}.`];
  if (g.hasBenchmark) facts.push(`It has a benchmark and currently ${g.status} it — you may refer to "the benchmark" by name, never by a number.`);
  else facts.push(`It has NO benchmark — do NOT mention any benchmark, target, or threshold at all.`);
  if (g.direction) facts.push(`Over the window it is ${g.direction}.`);
  if (g.proxy) facts.push(`This is a proxy metric (an approximation); you may note that.`);
  return [
    "You are the narration layer of Caliper. The engine computed an answer to the user's question. Write a one-line headline (≤8 words) and a one-sentence 'soWhat'.",
    "QUALITATIVE only: state NO numbers or figures. Describe ONLY the facts listed below — do NOT invent benchmarks, targets, forecasts, or comparisons that are not listed, and do NOT write filler like 'review the chart above'.",
    "Question: " + JSON.stringify(q),
    "Facts computed by the engine (the only things you may assert):",
    ...facts.map((f) => "- " + f),
    'Return ONLY JSON, no fences: {"headline":"...","soWhat":"..."}',
  ].join("\n");
}
async function narrate(q, desc) {
  try {
    const data = await callModel("narrate", [{ role: "user", content: buildNarratePrompt(q, desc) }], 200);
    const raw = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const p = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return { headline: String(p.headline || "").slice(0, 80), soWhat: String(p.soWhat || "").slice(0, 220) };
  } catch (e) { return null; }
}

function QueryBar({ onAsk, busy }) {
  const [v, setV] = useState("");
  const go = () => { if (v.trim() && !busy) { onAsk(v.trim()); setV(""); } };
  return (<div className="qbar"><input className="qin" value={v} placeholder="Ask about a metric or segment — e.g. “how is SMB retention?” or “show the magic number trend”" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} /><button className="qbtn" disabled={busy || !v.trim()} onClick={go}>{busy ? "…" : "Ask"}</button></div>);
}
function QueryWidget({ desc, onPick }) {
  if (desc.kind === "callout") return (<div className="strip"><div className="block"><Callout mv={desc.data.mv} onPick={(mv) => onPick({ node: mv })} /></div></div>);
  if (desc.kind === "line") return (<div className="block"><LineChart series={desc.data.series} benchmark={desc.data.benchmark} good={desc.data.good} fmt={desc.data.fmt} onPick={(mv) => onPick({ node: mv })} /></div>);
  if (desc.kind === "waterfall") return (<div className="block"><div className="bridge-h"><button className="bridge-trace" onClick={() => onPick({ node: desc.data.mv })}>{desc.data.title} ▸ trace</button><span className={desc.data.bridge.nrr >= 100 ? "good" : "bad"}>NRR {desc.data.bridge.nrr.toFixed(0)}%</span></div><Waterfall c={desc.data.bridge} /></div>);
  return null;
}
function AnswerCard({ item, onPick }) {
  if (item.status === "loading") return (<div className="ans"><div className="ans-q">“{item.q}”</div><div className="anno"><span className="live-dot" /> interpreting intent → computing → narrating…</div></div>);
  if (item.status === "declined") return (<div className="ans declined"><div className="ans-q">“{item.q}”</div><div className="ans-decline">Can't answer that from this data{item.reason ? ` — ${item.reason}` : ""}.</div></div>);
  const d = item.result;
  return (<div className="ans"><div className="ans-q">“{item.q}”</div>
    <div className="ans-intent">L1 read this as <b>{item.intent.metric.replace(/_/g, " ")}</b>{item.intent.segment ? ` · ${item.intent.segment}` : " · company"} · {item.intent.basis}{item.intent.confidence != null ? ` · confidence ${(item.intent.confidence * 100).toFixed(0)}%` : ""} — then the engine computed it</div>
    {item.framing && <div className="frame"><span className="frame-tick">answered</span><span className="frame-h">{item.framing.headline}</span>{item.framing.soWhat && <span className="frame-sw">{item.framing.soWhat}</span>}</div>}
    <QueryWidget desc={d} onPick={onPick} />
  </div>);
}

function DebugPanel({ d }) {
  const [showPrompt, setShowPrompt] = useState(false);
  if (!d) return (<div className="dbg"><div className="dbg-h">DEBUG · no live spec — model unavailable, captured fallback rendered. <span className="dbg-meta">press ` to hide</span></div></div>);
  const rej = d.rejectedIds || [];
  return (<div className="dbg">
    <div className="dbg-h">DEBUG · boundary inspector <span className="dbg-meta">{d.ms}ms · {rej.length} rejected · press ` to hide</span></div>
    {rej.length > 0 && <div className="dbg-rej">refused — ids the model referenced that the engine never produced: {rej.join(", ")}</div>}
    <div className="dbg-cols">
      <div className="dbg-col"><div className="dbg-cap">① raw model response (verbatim)</div><pre className="dbg-pre">{d.raw || "(empty)"}</pre></div>
      <div className="dbg-col"><div className="dbg-cap">② what survived validation → rendered</div><pre className="dbg-pre">{d.validated ? JSON.stringify(d.validated, null, 1) : "(nothing survived — fallback used)"}</pre></div>
    </div>
    <button className="dbg-tog" onClick={() => setShowPrompt((s) => !s)}>{showPrompt ? "▾" : "▸"} prompt sent to the model</button>
    {showPrompt && <pre className="dbg-pre full">{d.prompt}</pre>}
  </div>);
}

function AppInner() {
  const catalog = useMemo(() => buildCatalog(), []);
  const [role, setRole] = useState(null);
  const [state, setState] = useState({ loading: false, spec: null, source: null, rejected: 0, err: null, debug: null });
  const [picked, setPicked] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [queries, setQueries] = useState([]);
  const cache = React.useRef({});
  useEffect(() => { const h = (e) => { if (e.key === "`" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); setShowDebug((v) => !v); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);

  async function handleQuery(text) {
    const id = Date.now();
    setQueries((qs) => [{ id, q: text, status: "loading" }, ...qs]);
    const upd = (patch) => setQueries((qs) => qs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      const { intent } = await parseIntent(text);                 // L1: model interprets intent
      const vi = validateIntent(intent);                          // bounded to engine-supported metrics
      if (!vi) { upd({ status: "declined", reason: intent && intent.reason ? intent.reason : "not a supported metric" }); return; }
      const desc = resolveQuery(vi);                              // L2: engine computes (deterministic)
      if (!desc) { upd({ status: "declined", reason: "that combination isn't computable here" }); return; }
      const framing = await narrate(text, desc);                 // L3: model narrates (bounded, no numbers)
      upd({ status: "answered", intent: vi, result: desc, framing });
    } catch (e) { upd({ status: "declined", reason: "intent service unavailable" }); }
  }

  async function enter(roleKey) {
    setRole(roleKey); setPicked(null);
    if (cache.current[roleKey]) { setState(cache.current[roleKey]); return; }
    setState({ loading: true, spec: null, source: null, rejected: 0, err: null });
    let next;
    try {
      const { prompt, raw, parsed, ms } = await curate(roleKey, catalog);
      const { spec, rejectedIds } = validateComposition(parsed, catalog);
      const debug = { prompt, raw, parsed, validated: spec, rejectedIds, ms };
      next = spec ? { loading: false, spec, source: "live", rejected: rejectedIds.length, err: null, debug }
                  : { loading: false, spec: FALLBACK[roleKey], source: "fallback", rejected: rejectedIds.length, err: "nothing survived validation", debug };
    } catch (e) {
      next = { loading: false, spec: FALLBACK[roleKey], source: "fallback", rejected: 0, err: String(e).slice(0, 120), debug: null };
    }
    cache.current[roleKey] = next; setState(next);
  }

  if (!role) return (<div className="caliper"><EntryScreen onEnter={enter} /></div>);

  return (
    <div className="caliper">
      
      <header className="hdr">
        <div className="hdr-l"><span className="hdr-mark">⟡ CALIPER</span><span className="hdr-sub">Caliper Systems · synthetic</span></div>
        <div className="hdr-r">
          {Object.keys(ROLES).map((k) => <button key={k} className={`lensbtn ${k === role ? "on" : ""}`} onClick={() => enter(k)}>{k}</button>)}
          <button className="recur" onClick={() => { delete cache.current[role]; enter(role); }} title="re-curate">↻</button>
          <button className="recur" onClick={() => setShowDebug((v) => !v)} title="boundary inspector (or press `)">dbg</button>
        </div>
      </header>

      <div className={`honesty ${state.source}`}>
        {state.loading ? <span><span className="live-dot" /> curating the {role} dashboard — the engine found the patterns; the model is arranging them…</span>
          : state.source === "live" ? <span><span className="live-dot" /> Arrangement curated live by the model for the {role}. Every number was computed by the engine — click any value to verify.{state.rejected > 0 && <em> · {state.rejected} proposed block{state.rejected > 1 ? "s" : ""} rejected (not in the engine's findings)</em>}</span>
          : <span>Model unavailable — showing a captured {role} arrangement. The numbers are still live from the engine.{state.err && <em> · {state.err}</em>}</span>}
      </div>

      {showDebug && <DebugPanel d={state.debug} />}

      <main className="stage">
        <QueryBar onAsk={handleQuery} busy={queries.some((q) => q.status === "loading")} />
        {queries.length > 0 && <div className="asked"><div className="asked-h">Asked — answers computed by the engine, placed here by rule</div>{queries.map((it) => <AnswerCard key={it.id} item={it} onPick={setPicked} />)}</div>}
        {state.loading ? <div className="loading">…</div> : state.spec.sections.map((s, i) => <Section key={i} section={s} catalog={catalog} onPick={setPicked} />)}
      </main>

      <TraceDrawer picked={picked} onClose={() => setPicked(null)} />
    </div>
  );
}

export default function App() {
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    fetch(import.meta.env.BASE_URL + "caliper_dataset.json")
      .then((r) => r.json())
      .then((ds) => { initEngine(ds); setReady(true); })
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <div className="caliper"><div className="loading">could not load dataset</div></div>;
  if (!ready) return <div className="caliper"><div className="loading">…</div></div>;
  return <AppInner />;
}
