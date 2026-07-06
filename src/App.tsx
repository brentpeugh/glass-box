import React, { useState, useMemo, useEffect, useRef } from "react";

import { createEngine } from "./engine-core";
import { WIDGET_DOMAIN, RELATED_DOMAINS, guardFraming, validateCurationCore, HEADLINE_KEYS } from "./curation";

// The engine is created once from the dataset fetched at runtime (see App bootstrap).
// One engine, two consumers: this same engine-core is what scripts/validate.ts proves
// against the oracle. The browser never hand-edits it.
let E;
function initEngine(ds) {
  E = createEngine({ customers: ds.facts.customers, opex: ds.facts.opex, quarters: ds.meta.quarters, segments: ds.meta.segments, benchmarks: ds.benchmarks, opportunities: ds.facts.opportunities });
}
// All model calls go through one seam. In production this hits the Netlify function
// holding the key server-side; running plain `vite` (no function) it throws and the
// callers fall back to captured compositions / graceful declines.
async function callModel(task, messages, max_tokens, model) {
  const res = await fetch("/.netlify/functions/curate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, messages, max_tokens, model }) });
  if (!res.ok) throw new Error("model " + res.status);
  return res.json();
}
// The one high-judgment call — thesis formation + coherent curation — routes to the strongest
// model. Everything else stays on the cheap path. (The Netlify function maps this to Opus.)
const CURATION_MODEL = "claude-opus-4-8";

const fmtM = (v) => `$${(v / 1e6).toFixed(2)}M`;
const fmtK = (v) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${(v / 1e3).toFixed(1)}K`);
const fmtPct = (v) => `${v.toFixed(1)}%`;
function fmtMV(mv) { switch (mv.unit) { case "usd": return fmtM(mv.value); case "percent": return fmtPct(mv.value); case "ratio": return `${mv.value.toFixed(2)}x`; case "months": return `${mv.value.toFixed(0)} mo`; case "number": return `${mv.value.toFixed(0)}`; case "pp": return `${mv.value.toFixed(0)} pp`; default: return `${mv.value}`; } }

// ================= trace =================
function RowsLeaf({ leaf, parentVal }) {
  const r = useMemo(() => E.resolveLeaf(leaf.selector), [leaf]);
  let body, stat, note, recon;
  if (r.kind === "retention") {
    const movers = [...r.churned.map((x) => ({ ...x, k: "ch" })), ...r.contracted.map((x) => ({ ...x, k: "co" })), ...r.expanded.map((x) => ({ ...x, k: "ex" }))].sort((a, b) => (b[r.sc] - b[r.ec]) - (a[r.sc] - a[r.ec]));
    const begin = r.churned.concat(r.contracted, r.expanded).reduce((s, x) => s + x[r.sc], 0);
    stat = (<><span><b>{r.n}</b> cohort rows</span><span className="dot ember" /><b>{r.churned.length}</b> churned<span className="dot ember2" /><b>{r.contracted.length}</b> contracted<span className="dot verdant" /><b>{r.expanded.length}</b> expanded</>);
    body = (<table className="rows-tbl"><thead><tr><th>account</th><th>{r.sc.slice(4)}</th><th>{r.ec.slice(4)}</th><th>Δ</th></tr></thead><tbody>{movers.map((x) => (<tr key={x.customer_id}><td className="mono">{x.customer_id}</td><td className="mono">{fmtK(x[r.sc])}</td><td className="mono">{x[r.ec] === 0 ? "—" : fmtK(x[r.ec])}</td><td className={`mono ${x[r.ec] >= x[r.sc] ? "pos" : "neg"}`}>{x[r.ec] >= x[r.sc] ? "+" : "−"}{fmtK(Math.abs(x[r.sc] - x[r.ec])).slice(1)}</td></tr>))}</tbody></table>);
    note = `resolved live against all ${r.n} cohort rows — read from the data, not produced by a model`;
    recon = <>{movers.length} accounts moved · the cohort's start and end ARR drive the ratio above</>;
  } else if (r.kind === "col_sum") {
    const sum = r.rows.reduce((s, x) => s + x.v, 0);
    stat = (<span><b>{r.n}</b> rows contribute · full audit trail</span>);
    body = (<table className="rows-tbl"><thead><tr><th>account</th><th>{r.col.slice(4)} ARR</th></tr></thead><tbody>{r.rows.map((x) => (<tr key={x.id}><td className="mono">{x.id}</td><td className="mono">{fmtK(x.v)}</td></tr>))}</tbody></table>);
    note = `summed live over all ${r.n} rows`;
    recon = <>Σ {r.n} rows = <b className="mono">{fmtK(sum)}</b> — reconciles to {parentVal ? fmtMV(parentVal) : "the value above"}</>;
  } else if (r.kind === "delta") {
    const sum = r.rows.reduce((s, x) => s + (x.b - x.a), 0);
    stat = (<span><b>{r.n}</b> accounts with positive ARR change · full audit trail</span>);
    body = (<table className="rows-tbl"><thead><tr><th>account</th><th>{r.from}</th><th>{r.to}</th><th>Δ</th></tr></thead><tbody>{r.rows.map((x) => (<tr key={x.id}><td className="mono">{x.id}</td><td className="mono">{x.a === 0 ? "new" : fmtK(x.a)}</td><td className="mono">{fmtK(x.b)}</td><td className="mono pos">+{fmtK(x.b - x.a).slice(1)}</td></tr>))}</tbody></table>);
    note = `new logos + expansion, summed live`;
    recon = <>Σ {r.n} positive deltas = <b className="mono">{fmtK(sum)}</b> — reconciles to {parentVal ? fmtMV(parentVal) : "the value above"}</>;
  } else if (r.kind === "opps") {
    stat = (<span><b>{r.won}</b> won / <b>{r.n}</b> closed deals · full audit trail</span>);
    body = (<table className="rows-tbl"><thead><tr><th>deal</th><th>segment</th><th>stage</th></tr></thead><tbody>{r.rows.map((o, i) => (<tr key={i}><td className="mono">{o.opp_id}</td><td className="mono">{o.segment}</td><td className={`mono ${o.stage === "won" ? "pos" : "neg"}`}>{o.stage}</td></tr>))}</tbody></table>);
    note = `closed opportunities, resolved live from the pipeline`;
    recon = <>{r.won} won ÷ {r.n} closed = <b className="mono">{r.n ? (r.won / r.n * 100).toFixed(1) : "—"}%</b> — reconciles to the value above</>;
  } else {
    const sum = r.rows.reduce((s, o) => s + (o[r.field] || 0), 0);
    stat = (<span><b>{r.rows.length}</b> opex rows · {r.field} · full audit trail</span>);
    body = (<table className="rows-tbl"><thead><tr><th>segment</th><th>quarter</th><th>{r.field}</th></tr></thead><tbody>{r.rows.map((o, i) => (<tr key={i}><td className="mono">{o.segment}</td><td className="mono">{o.quarter}</td><td className="mono">{fmtK(o[r.field])}</td></tr>))}</tbody></table>);
    note = `operating expense at segment×quarter grain — its natural grain`;
    recon = <>Σ {r.rows.length} rows = <b className="mono">{fmtK(sum)}</b> — reconciles to {parentVal ? fmtMV(parentVal) : "the value above"}</>;
  }
  return (<div className="rows"><div className="rows-stat">{stat}</div><div className="rows-scroll">{body}</div>{recon && <div className="rows-recon">✓ {recon}</div>}<div className="anno">{note}</div></div>);
}
function TraceNode({ node, depth, isFinding }) {
  const kids = node.provenance?.inputs?.length;
  const [open, setOpen] = useState(depth < 2);
  const val = isFinding ? `${node.value.toFixed(0)} pp` : fmtMV(node);
  const ptype = node.epistemic === "proxy" ? "MODELED" : (node.provenance?.inputs || []).some((i) => i.kind === "metric") ? "CALCULATED" : "EXTRACTED";
  return (
    <div className="node" style={{ marginLeft: depth ? 12 : 0 }}>
      <div className="node-head" onClick={() => kids && setOpen(!open)} role={kids ? "button" : undefined} tabIndex={kids ? 0 : undefined} onKeyDown={(e) => e.key === "Enter" && setOpen(!open)}>
        <span className="node-glyph">{kids ? (open ? "▾" : "▸") : "◆"}</span>
        <span className={`ptype ${ptype.toLowerCase()}`}>{ptype}</span>
        <span className="node-label">{node.label}</span>
        <span className="node-op">{node.provenance.op}</span>
        <span className="node-val mono">{val}</span>
      </div>
      {open && <div className="node-desc">{node.provenance.description}{node.note ? ` — ${node.note}` : ""}</div>}
      {open && kids ? <div className="node-kids">{node.provenance.inputs.map((inp, i) => inp.kind === "metric" ? <TraceNode key={i} node={E.store.get(inp.id)} depth={depth + 1} /> : <RowsLeaf key={i} leaf={inp} parentVal={node} />)}</div> : null}
    </div>
  );
}
// ===== Analyst Read: the investigation layer. A thesis (model-authored prose, numeral-free),
// an evidence chain (engine values, each traceable), and falsification tests (from the engine's
// bounded menu). The user runs a test; the engine computes a verdict; the thesis holds or weakens.
// Model proposes the investigation — engine proves, weakens, or redirects it. =====
function AnalystRead({ role, catalog, curation: shared, onPick, onClose }) {
  const [read, setRead] = useState(shared || null);
  const [loading, setLoading] = useState(!shared);
  const [verdicts, setVerdicts] = useState({});
  useEffect(() => {
    if (shared) { setRead(shared); setLoading(false); setVerdicts({}); return; }
    let live = true; setLoading(true); setVerdicts({});
    curate({ role }, catalog).then((r) => { if (live) { setRead(r); setLoading(false); } });
    return () => { live = false; };
  }, [role, catalog, shared]);
  if (loading) return <div className="brief"><div className="brief-load">Forming the read for the {role} — the model is selecting evidence and tests from the engine's menu…</div></div>;
  if (!read) return <div className="brief"><div className="brief-empty">No masking finding in the current data — nothing to investigate.</div></div>;
  const evidence = read.evidenceIds.map((id) => E.store.get(id)).filter(Boolean);
  const tests = read.testIds.map((id) => E.TEST_MENU.find((t) => t.id === id)).filter(Boolean);
  const run = (t) => { const r = E.runTest({ kind: t.kind, metric: t.metric, dim: t.dims && t.dims[0] }); setVerdicts((v) => ({ ...v, [t.id]: r })); };
  const ran = Object.values(verdicts);
  const status = ran.length === 0 ? "untested" : ran.some((r) => r.verdict === "uniform") ? "weakened" : "holds";
  const statusLabel = { untested: "UNTESTED", holds: "HOLDS", weakened: "WEAKENED" }[status];
  return (
    <div className="brief">
      <div className="brief-head">
        <span className="brief-tag">ANALYST READ</span>
        <span className={`brief-src ${read.source}`}>{read.source === "live" ? "◈ model-authored" : "○ deterministic read"}</span>
        <span className={`brief-status ${status}`}>{statusLabel}</span>
        <button className="brief-x" onClick={onClose}>✕</button>
      </div>
      <div className="brief-thesis">{read.thesis}</div>
      <div className="brief-why"><span className="brief-lbl">Why it matters for the {role}</span>{read.whyRole}</div>
      <div className="brief-sec">
        <div className="brief-lbl">Evidence — model-selected, engine-computed, every value traceable</div>
        <div className="brief-ev">
          {evidence.map((mv, i) => (
            <button key={i} className="ev-card" onClick={() => onPick({ node: mv })}>
              <div className="ev-top"><span className="ev-val mono">{fmtMV(mv)}</span><span className="ev-lbl">{mv.label}</span></div>
              <div className="ev-trace">trace ▸</div>
            </button>
          ))}
        </div>
      </div>
      <div className="brief-sec">
        <div className="brief-lbl">What would change this read — model-proposed, engine-run</div>
        <div className="brief-tests">
          {tests.map((t) => {
            const r = verdicts[t.id];
            return (
              <div key={t.id} className={`test-row ${r ? "ran" : ""}`}>
                <div className="test-q">{t.label}</div>
                {r ? <div className={`test-verdict ${r.verdict === "uniform" ? "weakens" : "confirms"}`}>{r.summary}</div>
                  : <button className="test-run" onClick={() => run(t)}>run test ▸</button>}
              </div>
            );
          })}
        </div>
      </div>
      {ran.length > 0 && <div className={`brief-foot ${status}`}>
        {status === "holds" ? "The tests run so far confirm the read — the weakness is real and localized, not a uniform artifact." : "A test came back uniform — the localized-risk read weakens. The engine redirected the thesis."}
      </div>}
      {read.violations && read.violations.length > 0 && <div className="brief-viol">Contract: {read.violations.join(" · ")}</div>}
    </div>
  );
}
function TraceDrawer({ picked, onClose }) {
  if (!picked) return null;
  const node = picked.node;
  const ptype = picked.isFinding ? "FINDING" : node.epistemic === "proxy" ? "MODELED" : (node.provenance?.inputs || []).some((i) => i.kind === "metric") ? "CALCULATED" : "EXTRACTED";
  return (
    <aside className="drawer">
      <div className="drawer-bar"><span className={`ptype ${ptype.toLowerCase()}`}>{ptype}</span><span className="drawer-t">{node.label}</span><button className="drawer-x" onClick={onClose}>✕</button></div>
      <div className="drawer-body"><div className="anno anno-top">Every value decomposes into extracted or calculated values, all the way to the source rows. The model arranged this board — it did not produce these numbers.</div><TraceNode node={picked.node} depth={0} isFinding={picked.isFinding} /></div>
    </aside>
  );
}

// ================= chart primitives (renderer; owns all scales) =================
function Waterfall({ c, w = 440, h = 260 }) {
  const steps = [{ k: "Beginning", t: "anchor", v: c.beginning }, { k: "Expansion", t: "up", v: c.expansionGain }, { k: "Contraction", t: "down", v: c.contractionLoss }, { k: "Churn", t: "down", v: c.churnLoss }, { k: "Ending", t: "anchor", v: c.ending }];
  const W = w, H = h, padL = 40, padR = 14, padB = 42, padT = 16; const plotW = W - padL - padR, plotH = H - padT - padB;
  const domainMax = (c.beginning + c.expansionGain) * 1.08; const y = (v) => padT + plotH - (v / domainMax) * plotH; const bw = (plotW / steps.length) * 0.44, gap = plotW / steps.length;
  let run = 0; const bars = []; steps.forEach((s, i) => { const x = padL + gap * i + (gap - bw) / 2; let top, bot; if (s.t === "anchor") { top = s.v; bot = 0; run = s.v; } else if (s.t === "up") { bot = run; top = run + s.v; run = top; } else { top = run; bot = run - s.v; run = bot; } bars.push({ ...s, x, yTop: y(Math.max(top, bot)), h: Math.abs(y(top) - y(bot)), cy: y(run) }); });
  return (<svg viewBox={`0 0 ${W} ${H}`} className="wf"><line x1={padL} y1={padT} x2={padL} y2={H - padB} className="ax" /><line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="ax" />{Array.from({ length: 5 }, (_, i) => (domainMax / 4) * i).map((tv, i) => (<g key={i}><line x1={padL} x2={W - padR} y1={y(tv)} y2={y(tv)} className="wf-grid" /><text x={padL - 8} y={y(tv) + 3} className="wf-axis" textAnchor="end">{fmtM(tv)}</text></g>))}{bars.map((b, i) => (<g key={i}>{i > 0 && <line x1={bars[i - 1].x + bw} x2={b.x} y1={bars[i - 1].cy} y2={bars[i - 1].cy} className="wf-conn" />}<rect x={b.x} y={b.yTop} width={bw} height={Math.max(b.h, 1)} className={`wf-bar wf-${b.t}`} /><text x={b.x + bw / 2} y={H - padB + 15} className="wf-xlab" textAnchor="middle">{b.k}</text><text x={b.x + bw / 2} y={H - padB + 28} className="wf-xval" textAnchor="middle">{b.t === "anchor" ? fmtM(b.v) : (b.t === "up" ? "+" : "−") + fmtM(b.v).slice(1)}</text></g>))}</svg>);
}
function Combo({ bars, line, benchmark, good, onPick, fmtL, fmtR, w = 620, h = 260 }) {
  const W = w, H = h, padL = 44, padR = 50, padB = 36, padT = 18; const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxBar = Math.max(...bars.map((b) => b.value)) * 1.12;
  const maxLine = Math.max(...line.map((p) => p.value), benchmark) * 1.18;
  const yL = (v) => padT + plotH - (v / maxBar) * plotH, yR = (v) => padT + plotH - (v / maxLine) * plotH;
  const n = bars.length, slot = plotW / n, bw = slot * 0.42, x = (i) => padL + slot * i + slot / 2;
  const ticks = Array.from({ length: 4 }, (_, i) => (maxBar / 3) * i), rticks = Array.from({ length: 4 }, (_, i) => (maxLine / 3) * i);
  const path = line.map((p, i) => `${i ? "L" : "M"}${x(i)},${yR(p.value)}`).join(" ");
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln">
    {ticks.map((tv, i) => (<g key={i}><line x1={padL} x2={W - padR} y1={yL(tv)} y2={yL(tv)} className="wf-grid" /><text x={padL - 8} y={yL(tv) + 3} className="wf-axis" textAnchor="end">{fmtL(tv)}</text></g>))}
    {rticks.map((tv, i) => (<text key={i} x={W - padR + 8} y={yR(tv) + 3} className="wf-axis r" textAnchor="start">{fmtR(tv)}</text>))}
    <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} className="ax" /><line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} className="ax" />{bars.map((b, i) => (<rect key={i} x={x(i) - bw / 2} y={yL(b.value)} width={bw} height={padT + plotH - yL(b.value)} className="co-bar" onClick={() => onPick(b.mv)} />))}
    <line x1={padL} x2={W - padR} y1={yR(benchmark)} y2={yR(benchmark)} className="ln-bench" /><text x={padL + 4} y={yR(benchmark) + 13} className="ln-bench-lab" textAnchor="start">benchmark {fmtR(benchmark)}</text>
    <path d={path} className="ln-path" />
    {line.map((p, i) => { const br = good === "above" ? p.value < benchmark : p.value > benchmark; return (<g key={i} className="ln-pt" onClick={() => onPick(p.mv)}><circle cx={x(i)} cy={yR(p.value)} r="3.5" className={br ? "ln-dot bad" : "ln-dot good"} /></g>); })}
    {bars.map((b, i) => (<text key={i} x={x(i)} y={H - padB + 15} className="wf-xlab" textAnchor="middle">{b.q}</text>))}
    <text x={padL - 8} y={padT - 5} className="wf-axis" textAnchor="end">S&M $</text><text x={W - padR + 8} y={padT - 5} className="wf-axis r" textAnchor="start">magic</text><text x={x(line.length - 1)} y={yR(line[line.length - 1].value) - 9} className="dlab" textAnchor="middle">{fmtR(line[line.length - 1].value)}</text>
  </svg>);
}
function StackedArea({ quarters, series, onPick, w = 620, h = 270 }) {
  const W = w, H = h, padL = 42, padR = 14, padB = 34, padT = 12; const plotW = W - padL - padR, plotH = H - padT - padB;
  const totals = quarters.map((_, i) => series.reduce((s, se) => s + se.points[i].value, 0));
  const maxY = Math.max(...totals) * 1.06; const x = (i) => padL + (plotW * i) / (quarters.length - 1), y = (v) => padT + plotH - (v / maxY) * plotH;
  const ticks = Array.from({ length: 4 }, (_, i) => (maxY / 3) * i);
  let cum = quarters.map(() => 0); const bands = [];
  for (const se of series) { const lower = cum.slice(), upper = cum.map((c, i) => c + se.points[i].value); const up = upper.map((v, i) => `${x(i)},${y(v)}`).join(" "); const lo = lower.map((v, i) => `${x(i)},${y(v)}`).reverse().join(" "); bands.push({ seg: se.seg, color: se.color, poly: `${up} ${lo}` }); cum = upper; }
  return (<div><div className="legend">{series.slice().reverse().map((se) => (<button key={se.seg} className="chip" onClick={() => onPick(se.points[se.points.length - 1].mv)}><span className="sw" style={{ background: se.color }} />{se.seg}</button>))}</div>
    <svg viewBox={`0 0 ${W} ${H}`} className="ln"><line x1={padL} y1={padT} x2={padL} y2={padT + plotH} className="ax" /><line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} className="ax" />{ticks.map((tv, i) => (<g key={i}><line x1={padL} x2={W - padR} y1={y(tv)} y2={y(tv)} className="wf-grid" /><text x={padL - 8} y={y(tv) + 3} className="wf-axis" textAnchor="end">{fmtM(tv)}</text></g>))}{bands.map((b, i) => (<polygon key={i} points={b.poly} fill={b.color} className="area" />))}{quarters.map((q, i) => (<text key={i} x={x(i)} y={H - padB + 15} className="wf-xlab" textAnchor="middle">{q}</text>))}</svg></div>);
}
function LineChart({ series, benchmark, good, onPick, fmt, w = 620, h = 230 }) {
  const W = w, H = h, padL = 40, padR = 16, padB = 34, padT = 14; const plotW = W - padL - padR, plotH = H - padT - padB;
  const vals = series.map((p) => p.value).concat(benchmark != null ? [benchmark] : []); const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.18 || 0.1; const dMin = Math.min(lo - pad, benchmark != null ? benchmark - pad : Infinity), dMax = Math.max(hi + pad, benchmark != null ? benchmark + pad : -Infinity);
  const x = (i) => padL + (plotW * i) / (series.length - 1); const y = (v) => padT + plotH - ((v - dMin) / (dMax - dMin)) * plotH;
  const path = series.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const ticks = Array.from({ length: 4 }, (_, i) => dMin + ((dMax - dMin) / 3) * i);
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln">
    {ticks.map((tv, i) => (<g key={i}><line x1={padL} x2={W - padR} y1={y(tv)} y2={y(tv)} className="wf-grid" /><text x={padL - 8} y={y(tv) + 3} className="wf-axis" textAnchor="end">{fmt(tv)}</text></g>))}
    {benchmark != null && <><line x1={padL} x2={W - padR} y1={y(benchmark)} y2={y(benchmark)} className="ln-bench" /><text x={W - padR} y={y(benchmark) - 5} className="ln-bench-lab" textAnchor="end">benchmark {fmt(benchmark)}</text></>}
    <path d={path} className="ln-path" />
    <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} className="ax" /><line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} className="ax" />{series.map((p, i) => { const br = benchmark != null && (good === "above" ? p.value < benchmark : p.value > benchmark); return (<g key={i} className="ln-pt" onClick={() => onPick(p.mv)}><circle cx={x(i)} cy={y(p.value)} r="3.5" className={benchmark == null ? "ln-dot neutral" : br ? "ln-dot bad" : "ln-dot good"} />{i === series.length - 1 && <text x={x(i)} y={y(p.value) - 9} className="dlab" textAnchor="middle">{fmt(p.value)}</text>}<text x={x(i)} y={H - padB + 15} className="wf-xlab" textAnchor="middle">{p.q}</text></g>); })}
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
function MiniTrend({ a, b, benchmark, labels = [], w = 680, h = 66 }) {
  const W = w, H = h, padT = 8, padB = 13, padL = 4, padR = 36;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const all = [...a, ...b, benchmark]; const lo = Math.min(...all) - 3, hi = Math.max(...all) + 3;
  const x = (i) => padL + (a.length > 1 ? (plotW * i) / (a.length - 1) : plotW / 2);
  const y = (v) => padT + plotH * (1 - (v - lo) / (hi - lo));
  const line = (s) => s.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const area = (s) => `${line(s)} L${x(s.length - 1)},${y(lo)} L${x(0)},${y(lo)} Z`;
  const dots = (s, tone) => s.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === s.length - 1 ? 3 : 2} className={`mt-dot ${tone}`}><title>{labels[i] || ""} · {v.toFixed(1)}%</title></circle>);
  return (<svg viewBox={`0 0 ${W} ${H}`} className="mtrend">
    <defs>
      <linearGradient id="mt-good" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--verdant)" stopOpacity="0.22" /><stop offset="100%" stopColor="var(--verdant)" stopOpacity="0" /></linearGradient>
      <linearGradient id="mt-bad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--ember)" stopOpacity="0.22" /><stop offset="100%" stopColor="var(--ember)" stopOpacity="0" /></linearGradient>
    </defs>
    <path d={area(a)} fill="url(#mt-good)" /><path d={area(b)} fill="url(#mt-bad)" />
    <line x1={padL} x2={W - padR} y1={y(benchmark)} y2={y(benchmark)} className="mt-bench" />
    <text x={W - padR + 4} y={y(benchmark) + 3} className="mt-bench-lab">{benchmark}%</text>
    <path d={line(a)} className="mt-ln good" /><path d={line(b)} className="mt-ln bad" />
    {dots(a, "good")}{dots(b, "bad")}
    <text x={x(a.length - 1) + 5} y={y(a[a.length - 1]) + 3} className="mt-end good">{a[a.length - 1].toFixed(0)}</text>
    <text x={x(b.length - 1) + 5} y={y(b[b.length - 1]) + 3} className="mt-end bad">{b[b.length - 1].toFixed(0)}</text>
    {labels.length > 1 && <><text x={x(0)} y={H - 3} className="mt-qlab" textAnchor="start">{labels[0]}</text><text x={x(labels.length - 1)} y={H - 3} className="mt-qlab" textAnchor="end">{labels[labels.length - 1]}</text></>}
  </svg>);
}
const METRIC_SERIES = {
  cac: (q, i) => { try { return E.cacPayback(q).value; } catch { return null; } },
  magic: (q, i) => { try { return E.magicNumber(q).value; } catch { return null; } },
  grossMargin: (q, i) => { try { return E.grossMargin(q).value; } catch { return null; } },
  qoq: (q, i) => { try { return E.qoqGrowth(q).value; } catch { return null; } },
  r40: (q, i) => { try { return i >= 4 ? E.ruleOf40(q).value : null; } catch { return null; } },
};
function SoloSpark({ vals, labels, benchmark, tone }) {
  const W = 320, H = 62, padT = 9, padB = 14, padL = 4, padR = 34;
  const pw = W - padL - padR, ph = H - padT - padB;
  const all = [...vals, ...(benchmark != null ? [benchmark] : [])]; const lo = Math.min(...all), hi = Math.max(...all), sp = hi - lo || 1;
  const x = (i) => padL + (vals.length > 1 ? pw * i / (vals.length - 1) : pw / 2);
  const y = (v) => padT + ph * (1 - (v - lo) / sp);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const area = `${line} L${x(vals.length - 1)},${y(lo)} L${x(0)},${y(lo)} Z`;
  return (<svg viewBox={`0 0 ${W} ${H}`} className="mtrend">
    <defs><linearGradient id="sf-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--ember)" stopOpacity="0.20" /><stop offset="100%" stopColor="var(--ember)" stopOpacity="0" /></linearGradient></defs>
    <path d={area} fill="url(#sf-g)" />
    {benchmark != null && <line x1={padL} x2={W - padR} y1={y(benchmark)} y2={y(benchmark)} className="mt-bench" />}
    {benchmark != null && <text x={W - padR + 4} y={y(benchmark) + 3} className="mt-bench-lab">{benchmark}</text>}
    <path d={line} className={`mt-ln ${tone}`} />
    {vals.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === vals.length - 1 ? 3 : 2} className={`mt-dot ${tone}`} />)}
    <text x={x(0)} y={H - 3} className="mt-qlab" textAnchor="start">{labels[0]}</text><text x={x(vals.length - 1)} y={H - 3} className="mt-qlab" textAnchor="end">{labels[labels.length - 1]}</text>
  </svg>);
}
// Generic finding band — presents ANY top salient fact the way FindingCard presents masking.
// Adding a finding type needs no new band: the fact's structure (value, benchmark, trend) drives it.
function SalientBand({ finding, onPick }) {
  if (!finding || !finding.mvs || !finding.mvs.length) return null;
  const primary = finding.mvs[0];
  const basis = primary.basis;
  const sf = METRIC_SERIES[finding.metric];
  let spark = null;
  if (sf) { const vals = E.QUARTERS.map((q, i) => sf(q, i)).filter((v) => v != null); if (vals.length > 2) spark = { vals, labels: E.QUARTERS.slice(E.QUARTERS.length - vals.length) }; }
  return (<div className="fband">
    <div className="fband-vals">
      <div className="sf-primary">
        <span className="sf-val mono">{fmtMV(primary)}</span>
        <span className="sf-lbl">{primary.label}</span>
        {basis != null && <span className="sf-badge">vs {basis.thr}{primary.unit === "percent" ? "%" : ""} benchmark</span>}
      </div>
      <span className="fband-verb">MOST ANOMALOUS</span>
      <div className="sf-ctx">the largest standardized deviation the engine surfaced across the book</div>
    </div>
    {spark && <div className="fband-trend"><SoloSpark vals={spark.vals} labels={spark.labels} benchmark={basis != null ? basis.thr : null} tone="bad" /></div>}
    <button className="fband-inspect" onClick={() => onPick({ node: primary })}>inspect provenance ›</button>
  </div>);
}
function FindingCard({ finding, onPick }) {
  const schema = FINDING_PRESENTATION[finding.type];
  if (!schema) return null;
  const sides = schema.sides(finding);
  const pick = () => onPick({ node: finding, isFinding: true });
  const thr = sides[0].mv.basis ? sides[0].mv.basis.thr : 100;
  let trend = null;
  if (finding.type === "masking" && finding.worstSeg) {
    const qs = E.QUARTERS, safe = (fn) => { try { const r = fn(); return r && !isNaN(r.value) ? r.value : null; } catch { return null; } };
    const idx = qs.map((_, i) => i).filter((i) => i >= 4);
    const a = idx.map((i) => safe(() => E.nrr(null, qs[i - 4], qs[i]))).filter((v) => v != null);
    const b = idx.map((i) => safe(() => E.nrr(finding.worstSeg, qs[i - 4], qs[i]))).filter((v) => v != null);
    const labels = idx.map((i) => qs[i]); if (a.length > 1 && b.length > 1) trend = { a, b, labels };
  }
  return (<div className="fband">
    <div className="fband-vals">
      <FindingSide side={sides[0]} onPick={pick} />
      <span className="fband-verb">{schema.verb}</span>
      <FindingSide side={sides[1]} onPick={pick} />
    </div>
    {trend && <div className="fband-trend"><MiniTrend a={trend.a} b={trend.b} benchmark={thr} labels={trend.labels} /></div>}
    <button className="fband-inspect" onClick={pick}>inspect provenance ›</button>
  </div>);
}

// ================= widget catalog (engine offering; pre-verified) =================
function buildCatalog() {
  const Q1 = E.QUARTERS.slice(1);
  const masking = E.detectMasking("24Q4", "25Q4");
  const segSeries = [
    { seg: "SMB", color: "#B07C51", points: E.QUARTERS.map((q) => ({ q, value: E.segArr("SMB", q).value, mv: E.segArr("SMB", q) })) },
    { seg: "Mid-Market", color: "#9AA1A8", points: E.QUARTERS.map((q) => ({ q, value: E.segArr("Mid-Market", q).value, mv: E.segArr("Mid-Market", q) })) },
    { seg: "Enterprise", color: "#39424B", points: E.QUARTERS.map((q) => ({ q, value: E.segArr("Enterprise", q).value, mv: E.segArr("Enterprise", q) })) },
  ];
  const smBars = Q1.map((q) => ({ q, value: E.smTotal(q).value, mv: E.smTotal(q) }));
  const magicLine = Q1.map((q) => ({ q, value: E.magicNumber(q).value, mv: E.magicNumber(q) }));
  const accelLine = Q1.map((q) => ({ q, value: E.qoqGrowth(q).value * 100, mv: E.qoqGrowth(q) }));
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
  };
}

// ===== row grammar: widgets declare eligible templates; a deterministic packer fills
// rows so every row is complete (no dead space). The model chooses widgets; layout is
// by rule. Variation is generative — different widget mixes pack into different rows —
// while every result is organized. =====
const SLOT_ELIG = {
  finding_card: ["hero"],
  combo: ["full", "pair", "major"],
  stacked_area: ["full", "pair", "major"],
  line: ["full", "major"],
  waterfall: ["pair", "full"],
  callout: ["strip", "minor"],
};
const elig = (k, t) => (SLOT_ELIG[k] || []).includes(t);
// viewBox dimensions per slot — wide/short when a chart spans, squarer when paired
const DIM = { full: { w: 1360, h: 264 }, pair: { w: 676, h: 236 }, major: { w: 1000, h: 264 } };

function ChartHeader({ title, tag, tagTone, onTrace }) {
  return (<div className="chart-h">
    <button className="chart-title" onClick={onTrace || undefined}>{title}{onTrace && <span className="chart-trace"> ▸ trace</span>}</button>
    {tag && <span className={`chart-tag ${tagTone || ""}`}>{tag}</span>}
  </div>);
}
// Charts fill their panel: measure the container, render the SVG to its exact box (both
// dimensions). The chart is a tenant of a fixed-size panel, not the other way around —
// this is what makes heights align across a row and is the basis for the template system.
function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver((es) => { const r = es[0].contentRect; setSize({ w: Math.round(r.width), h: Math.round(r.height) }); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, size];
}
function Fill({ render }) {
  const [ref, { w, h }] = useSize();
  return <div ref={ref} className="cfill">{w > 1 && h > 1 ? render(w, h) : null}</div>;
}

function HBar({ items, benchmark, fmt, onPick, w = 420, h = 200 }) {
  const W = w, H = h, padL = 100, padR = 46, padT = 10, padB = 8;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = Math.max(...items.map((i) => i.value), benchmark || 0) * 1.14;
  const gap = plotH / items.length, bh = Math.min(gap * 0.5, 26);
  const x = (v) => padL + (v / max) * plotW;
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln">
    {benchmark != null && <><line x1={x(benchmark)} y1={padT} x2={x(benchmark)} y2={padT + plotH} className="ln-bench" /><text x={x(benchmark)} y={H - 1} className="ln-bench-lab" textAnchor="middle">{fmt(benchmark)}</text></>}
    {items.map((it, i) => { const cy = padT + gap * i + gap / 2; return (<g key={i} className="ln-pt" onClick={() => onPick(it.mv)}>
      <text x={padL - 8} y={cy + 4} className="wf-xlab" textAnchor="end">{it.label}</text>
      <rect x={padL} y={cy - bh / 2} width={Math.max(x(it.value) - padL, 1)} height={bh} className={`hbar ${it.tone || ""}`} />
      <text x={x(it.value) + 6} y={cy + 4} className="dlab" textAnchor="start">{fmt(it.value)}</text>
    </g>); })}
  </svg>);
}
function BulletPanel({ items, onPick, w = 420, h = 200 }) {
  const W = w, H = h, padL = 108, padR = 52, padT = 8, padB = 8;
  const rowH = (H - padT - padB) / items.length;
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln">
    {items.map((it, i) => {
      const cy = padT + rowH * i + rowH / 2, trackX = padL, trackW = W - padL - padR;
      const x = (v) => trackX + (Math.min(v, it.max) / it.max) * trackW;
      const clears = it.good === "above" ? it.value >= it.target : it.value <= it.target;
      return (<g key={i} className="ln-pt" onClick={() => onPick(it.mv)}>
        <text x={padL - 8} y={cy + 3} className="wf-xlab" textAnchor="end">{it.label}</text>
        <rect x={trackX} y={cy - 7} width={trackW} height={14} className="bullet-track" />
        <rect x={trackX} y={cy - 4} width={Math.max(x(it.value) - trackX, 1)} height={8} className={`bullet-bar ${clears ? "good" : "bad"}`} />
        <line x1={x(it.target)} y1={cy - 9} x2={x(it.target)} y2={cy + 9} className="bullet-target" />
        <text x={W - padR + 6} y={cy + 3} className="dlab" textAnchor="start">{it.fmt(it.value)}</text>
      </g>);
    })}
  </svg>);
}
function MetricMatrix({ onPick }) {
  const qs = E.QUARTERS;
  const safe = (fn) => { try { const r = fn(); return r && !isNaN(r.value) ? r : null; } catch { return null; } };
  const metrics = [
    { label: "Blended NRR", fmt: (v) => `${v.toFixed(0)}%`, get: (q, i) => i >= 4 ? safe(() => E.nrr(null, qs[i - 4], q)) : null },
    { label: "Blended GRR", fmt: (v) => `${v.toFixed(0)}%`, get: (q, i) => i >= 4 ? safe(() => E.grr(null, qs[i - 4], q)) : null },
    { label: "Gross Margin", fmt: (v) => `${v.toFixed(0)}%`, get: (q) => safe(() => E.grossMargin(q)) },
    { label: "Magic #", fmt: (v) => v.toFixed(2), get: (q) => safe(() => E.magicNumber(q)) },
    { label: "CAC (mo)", fmt: (v) => v.toFixed(0), get: (q) => safe(() => E.cacPayback(q)) },
    { label: "Rule of 40", fmt: (v) => v.toFixed(0), get: (q) => safe(() => E.ruleOf40(q)) },
    { label: "Net New ARR", fmt: (v) => `$${(v / 1e6).toFixed(1)}M`, get: (q) => safe(() => E.netNewArr(q)) },
    { label: "QoQ Growth", fmt: (v) => `${(v * 100).toFixed(1)}%`, get: (q) => safe(() => E.qoqGrowth(q)) },
  ];
  const tone = (mv) => mv && mv.basis ? ((mv.basis.good === "above" ? mv.value >= mv.basis.thr : mv.value <= mv.basis.thr) ? "good" : "bad") : "";
  return (<div className="matrix">
    <div className="mx-row mx-head"><span className="mx-lab" />{qs.map((q) => <span key={q} className="mx-cell">{q}</span>)}</div>
    {metrics.map((m, i) => (<div key={i} className="mx-row">
      <span className="mx-lab">{m.label}</span>
      {qs.map((q, i) => { const mv = m.get(q, i); return mv ? <button key={q} className={`mx-cell v ${tone(mv)}`} onClick={() => onPick({ node: mv })}>{m.fmt(mv.value)}</button> : <span key={q} className="mx-cell dim">—</span>; })}
    </div>))}
  </div>);
}
function SegmentTable({ onPick }) {
  const P = "24Q4", L = "25Q4";
  const rows = E.SEGMENTS.map((seg) => ({ seg, arr: E.segArr(seg, L), nrr: E.nrr(seg, P, L), grr: E.grr(seg, P, L) }));
  const total = rows.reduce((a, r) => a + r.arr.value, 0);
  const bNrr = E.nrr(null, P, L), bGrr = E.grr(null, P, L);
  const tone = (mv) => mv.basis ? ((mv.basis.good === "above" ? mv.value >= mv.basis.thr : mv.value <= mv.basis.thr) ? "good" : "bad") : "";
  const num = (mv) => <button className={`dt-num ${tone(mv)}`} onClick={() => onPick({ node: mv })}>{fmtMV(mv)}</button>;
  return (<div className="dtable">
    <div className="dt-row dt-head"><span>Segment</span><span>ARR</span><span>% ARR</span><span>NRR</span><span>GRR</span></div>
    {rows.map((r) => (<div key={r.seg} className="dt-row">
      <span className="dt-seg">{r.seg}</span>{num(r.arr)}<span className="dt-num dim">{((r.arr.value / total) * 100).toFixed(0)}%</span>{num(r.nrr)}{num(r.grr)}
    </div>))}
    <div className="dt-row dt-total"><span className="dt-seg">Total</span><span className="dt-num">{fmtM(total)}</span><span className="dt-num dim">100%</span>{num(bNrr)}{num(bGrr)}</div>
  </div>);
}
function Widget({ id, catalog, onPick, dim }) {
  const w = catalog[id]; if (!w) return null; const d = w.data;
  const last = (arr) => arr[arr.length - 1].mv;
  if (w.kind === "finding_card") return <FindingCard finding={d.finding} onPick={onPick} />;
  if (w.kind === "callout") return <Callout mv={d.mv} onPick={(mv) => onPick({ node: mv })} />;
  if (w.kind === "combo") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={() => onPick({ node: last(d.line) })} /><Fill render={(cw, ch) => <Combo bars={d.bars} line={d.line} benchmark={d.benchmark} good={d.good} fmtL={(v) => fmtM(v)} fmtR={(v) => `${v.toFixed(2)}x`} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "line") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={() => onPick({ node: last(d.series) })} /><Fill render={(cw, ch) => <LineChart series={d.series} benchmark={d.benchmark} good={d.good} fmt={d.fmt} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "stacked_area") return (<div className="cpanel"><ChartHeader title={d.title} /><Fill render={(cw, ch) => <StackedArea quarters={E.QUARTERS} series={d.series} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "matrix") return (<div className="tpanel"><ChartHeader title="Metrics by quarter" /><MetricMatrix onPick={onPick} /></div>);
  if (w.kind === "hbar") return (<div className="cpanel"><ChartHeader title={d.title} /><Fill render={(cw, ch) => <HBar items={d.items} benchmark={d.benchmark} fmt={d.fmt} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "bullet") return (<div className="cpanel"><ChartHeader title={d.title} /><Fill render={(cw, ch) => <BulletPanel items={d.items} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "table") return (<div className="tpanel"><ChartHeader title="Segment breakdown" /><SegmentTable onPick={onPick} /></div>);
  if (w.kind === "waterfall") return (<div className="cpanel"><ChartHeader title={d.title} tag={`NRR ${d.bridge.nrr.toFixed(0)}%`} tagTone={d.bridge.nrr >= 100 ? "good" : "bad"} onTrace={() => onPick({ node: d.mv })} /><Fill render={(cw, ch) => <Waterfall c={d.bridge} w={cw} h={ch} />} /></div>);
  return null;
}

// ================= the model: curation (bounded) =================
const ROLES = {
  CFO: { label: "Chief Financial Officer", focus: "durability, efficiency, retention quality, and concentration risk" },
  CRO: { label: "Head of Revenue (CRO)", focus: "growth, bookings momentum, expansion, and segment performance" },
};
// The model authors framing PROSE only — never numbers. Every number on the board comes from
// the engine (via widgets/values). Any numeral in model-authored text is an attempt to author a
// value, which the thesis forbids — so we strip it deterministically after generation. The prompt
// asks; this enforces. (Same discipline as the WA validator: reject, don't trust.)
const AUTHORED_NUM = /\$?\d[\d,.]*\s*(%|x|pp|mo|bps|[MK]\b)?/gi;
function stripAuthoredNumbers(text) {
  return String(text || "").replace(AUTHORED_NUM, "").replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").replace(/\s+([.,;:—-])/g, "$1").replace(/\s+$/, "").trim();
}

// ===== the unified curation contract validator. A model curation is admissible only if it is
// COHERENT: everything it cites is inside the anchoring finding's neighborhood, it picks at least
// one genuine falsifier, its widgets are on-domain, and its prose is numeral-free. Violations are
// dropped; if what remains isn't viable, we fall back to the deterministic (always-coherent) read.
// This makes "the thesis is gospel" a structural guarantee, not a request.
// deterministic fallback vital-signs per finding domain (used only when the model curation
// is unavailable) — finding-weighted, so even the fallback strip orients to what surfaced
const FALLBACK_SCORECARD = {
  efficiency: ["cac_payback", "magic_number", "rule_of_40", "gross_margin", "net_new_arr", "nrr"],
  retention: ["nrr", "grr", "gross_margin", "net_new_arr", "magic_number", "cac_payback"],
  growth: ["qoq_growth", "net_new_arr", "ent_share", "nrr", "magic_number", "cac_payback"],
  concentration: ["ent_share", "nrr", "net_new_arr", "qoq_growth", "gross_margin", "cac_payback"],
};
function fallbackCuration(fact) {
  const nb = E.findingNeighborhood(fact);
  const widgetIds = Object.keys(WIDGET_DOMAIN).filter((id) => (nb.lenses || RELATED_DOMAINS[nb.domain] || [nb.domain]).includes(WIDGET_DOMAIN[id]));
  const evidenceIds = [...new Set([...(fact.mvs || []).map((m) => m.id), ...nb.metricIds])].slice(0, 6);
  return {
    thesis: `The most statistically anomalous signal in the book is ${fact.label.toLowerCase()} — it stands out sharply against the rest of the metrics, which is where decision risk concentrates.`,
    whyRole: "It is the largest deviation the engine surfaced from the data, so it is the signal that most warrants scrutiny before decisions rest on the headline numbers.",
    evidenceIds, testIds: nb.testIds, widgetIds, partitionPref: null,
    scorecardKeys: FALLBACK_SCORECARD[nb.domain] || FALLBACK_SCORECARD.efficiency,
    rationaleTags: ["top salient anomaly", nb.domain], source: "fallback",
  };
}
function validateCuration(cur, finding, catalog) {
  return validateCurationCore(cur, E.findingNeighborhood(finding), catalog, WIDGET_DOMAIN);
}
function buildCurationPrompt(focus, finding, nb, catalog) {
  const metricMenu = nb.metricIds.map((id) => ({ id, label: E.store.get(id).label }));
  const testMenu = nb.testIds.map((id) => { const t = E.TEST_MENU.find((x) => x.id === id); return { id, question: t.label, falsifier: nb.falsifierIds.includes(id) }; });
  const widgetMenu = Object.keys(catalog).filter((id) => (RELATED_DOMAINS[nb.domain] || []).includes(WIDGET_DOMAIN[id])).map((id) => ({ id, label: catalog[id].title || id }));
  const headlineMenu = HEADLINE_KEYS;
  return `You are the analytical-judgment layer of a governed analytics system, briefing the ${focus.role}.
An engine has DETECTED this finding (you did not compute it; you may foreground and FRAME it): "${finding.label}".
Form the decision-relevant READ for the ${focus.role}. The engine surfaced this top statistical fact from a neutral scan; its finding neighborhood (the menus below) defines what is legible. Do NOT assume the issue is retention, growth, efficiency, or concentration — let the neighborhood and the evidence decide. Choose the framing and widgets most decision-relevant FOR THE ${focus.role}: a CFO (durability, forecast, capital allocation) and a CRO (conversion, motion, segment mix) should NOT surface the same board. Select ONLY from the menus below — you may not invent metrics, tests, or widgets, and you may not write any digit in your prose (the engine owns all numbers).

EVIDENCE (metric ids you may cite): ${JSON.stringify(metricMenu)}
TESTS (you MUST include at least one marked falsifier:true, so your read can fail): ${JSON.stringify(testMenu)}
WIDGETS (charts you may select, prioritized): ${JSON.stringify(widgetMenu)}
HEADLINE (metric keys for the vital-signs strip — pick 6 that matter to the ${focus.role} for THIS finding): ${JSON.stringify(headlineMenu)}

Return ONLY this JSON, nothing around it:
{"thesis":"1-2 sentences, NO numbers — the story that matters for the ${focus.role}","whyRole":"1 sentence, NO numbers — why it matters to the ${focus.role}","evidenceIds":["ids from EVIDENCE"],"testIds":["ids from TESTS, including >=1 falsifier"],"widgetIds":["ids from WIDGETS, most important first"],"partitionPref":"one of: analytical (dense data-grid lead) | hero (one dominant panel + rail) | balanced","scorecardKeys":["6 role-aware headline metric keys from HEADLINE, foregrounding the ones the finding implicates"],"rationaleTags":["short non-numeric tags"]}`;
}
async function curate(focus, catalog, targetFinding) {
  const finding = targetFinding || E.topFinding();   // re-orient around a chosen discovered finding, or the top salient one
  if (!finding) return null;
  const nb = E.findingNeighborhood(finding);
  const prompt = buildCurationPrompt(focus, finding, nb, catalog);
  try {
    const data = await callModel("curate", [{ role: "user", content: prompt }], 600, CURATION_MODEL);
    const raw = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    const { viable, curation, violations } = validateCuration(parsed, finding, catalog);
    if (viable) return { ...curation, finding, violations, _debug: { prompt, raw, model: data.model } };
    return { ...fallbackCuration(finding), finding, violations: [...violations, "incoherent — fell back to deterministic read"], _debug: { prompt, raw, model: data.model } };
  } catch (e) {
    return { ...fallbackCuration(finding), finding, violations: ["model unavailable — deterministic read"], _debug: { prompt, raw: String(e).slice(0, 200), model: null } };
  }
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
      { widget: "efficiency_combo", emphasis: "standard", headline: "Spending more to grow less", soWhat: "Sales spend is climbing while each dollar buys less growth." },
      { widget: "metric_matrix", emphasis: "standard", headline: "The full trajectory", soWhat: "Every efficiency metric, every quarter — the deterioration is systemic." },
      { widget: "efficiency_bullets", emphasis: "standard", headline: "Efficiency vs targets", soWhat: "Every efficiency metric sits below its benchmark." }] },
    { heading: "Concentration", blocks: [
      { widget: "segment_stack", emphasis: "standard", headline: "Enterprise concentration is rising", soWhat: "The base is tilting toward a few large accounts." },
      { widget: "segment_table", emphasis: "standard", headline: "The segment breakdown", soWhat: "Retention and share, segment by segment." },
      { widget: "hbar_nrr", emphasis: "standard", headline: "Retention spread", soWhat: "SMB sits far below the benchmark the others clear." }] },
  ] },
  CRO: { sections: [
    { heading: "Growth", blocks: [
      { widget: "segment_stack", emphasis: "hero", headline: "Enterprise carrying the number", soWhat: "Topline is growing and the Enterprise motion is doing the heavy lifting." },
      { widget: "accel_line", emphasis: "standard", headline: "Momentum is building", soWhat: "Quarter-over-quarter growth is speeding up, not flattening." }] },
    { heading: "Expansion", blocks: [
      { widget: "bridge_enterprise", emphasis: "standard", headline: "The expansion engine", soWhat: "Existing Enterprise accounts keep growing well past what they started at." },
      { widget: "callout_grr", emphasis: "compact", headline: "", soWhat: "" },
      { widget: "segment_table", emphasis: "standard", headline: "The segment breakdown", soWhat: "Retention and share, segment by segment." }] },
  ] },
};

// ================= composition rendering =================
function Block({ block, catalog, onPick, dim }) {
  const hasFrame = block.headline || block.soWhat;
  return (<div className={`block emph-${block.emphasis}`}>
    {hasFrame && <div className="frame"><span className="frame-tick">curated</span>{block.headline && <span className="frame-h">{block.headline}</span>}{block.soWhat && <span className="frame-sw">{block.soWhat}</span>}</div>}
    <Widget id={block.widget} catalog={catalog} onPick={onPick} dim={dim} />
  </div>);
}
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
};
// information density a panel justifies (heavy grids earn a dominant region; trends are light)
const PANEL_WEIGHT = { matrix: 3, table: 3, combo: 2, waterfall: 2, hbar: 2, bullet: 2, line: 1, stacked_area: 1 };
const CHART_ASPECTS = new Set(["twothird", "half", "third"]);
// regions carry a weight `w` (space they want); a big region can `split` into lighter sub-regions
const PARTITIONS = {
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
const ROLE_INTENT = {
  CFO: { analytical: 6, hero: 2, dense: 2, grid: 1 },
  CRO: { hero: 6, dense: 2, balanced: 2, grid: 1 },
};
function selectPartition(F, C, T, role, partitionPref) {
  const intent = partitionPref ? { [partitionPref]: 6 } : (ROLE_INTENT[role] || {});   // model choice primary, role prior is the fallback
  let best = "pair", bs = -Infinity;
  for (const [k, p] of Object.entries(PARTITIONS)) {
    const cp = partCapacity(p);
    let s = fitScore(p, F, C, T);
    if (p.asym) s += 14;
    // intent only steers among partitions that actually fit the content (no empty chart regions),
    // so it diverges full boards by role without ever selecting an oversized layout on thin content
    const chartEmpty = Math.max(0, cp.chart - Math.min(C, cp.chart));
    if (chartEmpty <= 1) for (const ch of (PARTITION_CHARACTER[k] || [])) s += (intent[ch] || 0) * 10;
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
function fillPartition(p, findings, charts, tables, role) {
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
const CHART_KINDS = new Set(["waterfall", "combo", "line", "stacked_area", "hbar", "bullet", "matrix"]);
// the full analytical menu the engine can render (salience-ordered). The model frames the
// lead finding; the board is filled from this ranked menu, so there is always surplus to
// fill a dense partition — a well-built board every time, regardless of how much the model curated.
const CHART_MENU = ["metric_matrix", "efficiency_combo", "bridge_smb", "bridge_enterprise", "accel_line", "segment_stack", "hbar_nrr", "magic_line", "efficiency_bullets"];
function TemplateBoard({ spec, role, catalog, onPick, partitionPref, finding }) {
  const kind = (id) => catalog[id]?.kind;
  const all = spec.sections.flatMap((s) => s.blocks).filter((b) => catalog[b.widget]).map((b) => ({ ...b, _kind: kind(b.widget) }));
  const findings = all.filter((b) => b._kind === "finding_card");
  // model-curated charts lead; the ranked menu tops up so the partition is always fully filled
  const modelCharts = all.filter((b) => CHART_KINDS.has(b._kind));
  const chosen = new Set(modelCharts.map((b) => b.widget));
  const menuCharts = CHART_MENU.filter((id) => catalog[id] && CHART_KINDS.has(catalog[id].kind) && !chosen.has(id)).map((id) => ({ widget: id, _kind: catalog[id].kind }));
  const charts = [...modelCharts, ...menuCharts];
  const modelTables = all.filter((b) => b._kind === "table");
  const tables = modelTables.length ? modelTables : (catalog["segment_table"] ? [{ widget: "segment_table", _kind: "table" }] : []);
  const p = PARTITIONS[selectPartition(findings.length, charts.length, tables.length, role, partitionPref)];
  const placed = fillPartition(p, findings, charts, tables, role);
  return (<div className="partition" style={{ gridTemplateRows: p.rowsT }}>
    {placed.map((pl, i) => (
      <div key={i} className={`tb-panel asp-${pl.region.a}`} style={{ gridColumn: `${pl.region.c[0]} / ${pl.region.c[1]}`, gridRow: `${pl.region.r[0]} / ${pl.region.r[1]}` }}>
        {pl.block.widget === "salient_band"
          ? <div className="block emph-hero"><SalientBand finding={finding} onPick={onPick} /></div>
          : pl.block._kind === "finding_card"
          ? <Block block={pl.block} catalog={catalog} onPick={onPick} dim={null} />
          : <Widget id={pl.block.widget} catalog={catalog} onPick={onPick} dim={null} />}
      </div>))}
  </div>);
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
// Domain-first classification: the model's ONLY job is to name the analytical domain the interest
// is about (or flag unsupported) — a robust, phrasing-independent judgment. The ENGINE then
// deterministically lists the ranked findings in that domain, decides salient vs present by rank,
// and lets the user pick any of them. Model does the topic (fuzzy); engine does which findings (rigid).
const DOMAINS = ["efficiency", "retention", "growth", "concentration"];
function buildDomainClassifyPrompt(text) {
  return `A user is exploring a governed analytics dashboard. Classify their analytical interest into ONE analytical DOMAIN, or flag it as unsupported. Do not pick a specific metric — just the domain.

DOMAINS:
- efficiency: unit economics — CAC payback, magic number, Rule of 40, gross margin, S&M efficiency
- retention: NRR, GRR, churn, contraction, expansion, segment retention
- growth: ARR growth, net new ARR, bookings, quarter-over-quarter momentum
- concentration: segment mix, ARR concentration, dependence on a segment

NOT in the data contract (→ unsupported): geography/region, product line, individual reps, marketing channel, headcount, anything not above.

THE USER'S ANALYTICAL INTEREST: "${text}"

Return ONLY JSON, no fences: {"status":"matched|unsupported","domain":"efficiency|retention|growth|concentration or null","echo":"<restate the interest in one short clause — reflect whether they emphasize current status, a worsening trend, or a specific concern>","confidence":"high|medium|low","reason":"<short, only if unsupported>"}
Confidence: high if the domain is unambiguous; medium if you inferred it; low if the interest is vague.`;
}
async function classifyToFinding(text) {
  const ranked = E.computeSalience();
  const data = await callModel("intent", [{ role: "user", content: buildDomainClassifyPrompt(text) }], 220);
  const raw = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let c = null; try { const m = raw.replace(/```json|```/g, "").trim(); const a = m.indexOf("{"), z = m.lastIndexOf("}"); c = JSON.parse(a >= 0 && z > a ? m.slice(a, z + 1) : m); } catch (e) {}
  if (!c) return null;
  const echo = String(c.echo || text).slice(0, 120), confidence = ["high", "medium", "low"].includes(c.confidence) ? c.confidence : "low";
  if (c.status === "unsupported" || !DOMAINS.includes(c.domain)) {
    return { status: "unsupported", echo, confidence, reason: c.reason ? String(c.reason).slice(0, 140) : "" };
  }
  // engine lists the ranked findings in the chosen domain (deterministic)
  const inDomain = ranked.map((f, i) => ({ finding: f, rank: i + 1, domain: E.findingNeighborhood(f).domain })).filter((x) => x.domain === c.domain);
  if (!inDomain.length) return { status: "present", domain: c.domain, echo, confidence, findings: [] };
  const salient = inDomain[0].rank <= 3;   // top-3 overall = the salient anomalies
  return { status: salient ? "salient" : "present", domain: c.domain, echo, confidence, findings: inDomain.slice(0, 5) };
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
    return { headline: guardFraming(String(p.headline || "").slice(0, 80)).text, soWhat: guardFraming(String(p.soWhat || "").slice(0, 220)).text };
  } catch (e) { return null; }
}

function QueryBar({ onAsk, busy }) {
  const [v, setV] = useState("");
  const go = () => { if (v.trim() && !busy) { onAsk(v.trim()); setV(""); } };
  return (<div className="qbar"><input className="qin" value={v} placeholder="Name an analytical interest — e.g. “why is efficiency slipping?”, “what about retention?”, “show me by geography”" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} /><button className="qbtn" disabled={busy || !v.trim()} onClick={go}>{busy ? "…" : "Map"}</button></div>);
}
function QueryWidget({ desc, onPick }) {
  if (desc.kind === "callout") return (<div className="strip"><div className="block"><Callout mv={desc.data.mv} onPick={(mv) => onPick({ node: mv })} /></div></div>);
  if (desc.kind === "line") return (<div className="cpanel"><ChartHeader title={desc.data.title || "trend"} /><Fill render={(cw, ch) => <LineChart series={desc.data.series} benchmark={desc.data.benchmark} good={desc.data.good} fmt={desc.data.fmt} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (desc.kind === "waterfall") return (<div className="cpanel"><ChartHeader title={desc.data.title} tag={`NRR ${desc.data.bridge.nrr.toFixed(0)}%`} tagTone={desc.data.bridge.nrr >= 100 ? "good" : "bad"} onTrace={() => onPick({ node: desc.data.mv })} /><Fill render={(cw, ch) => <Waterfall c={desc.data.bridge} w={cw} h={ch} />} /></div>);
  return null;
}
function AnswerCard({ item, onPick, onRecurate }) {
  if (item.status === "loading") return (<div className="ans"><div className="ans-q">“{item.q}”</div><div className="anno"><span className="live-dot" /> interpreting intent → computing → narrating…</div></div>);
  if (item.status === "failed") return (<div className="ans declined"><div className="ans-q">“{item.q}”</div><div className="ans-decline">{item.reason || "Couldn't read that — try rephrasing."}</div></div>);
  if (item.status === "declined") return (<div className="ans declined"><div className="ans-q">“{item.q}”</div><div className="ans-decline">{item.echo ? <><b>{item.echo}</b> — </> : ""}not in the data contract{item.reason ? `: ${item.reason}` : ""}. Available breakdowns: segment, quarter, cohort.</div></div>);
  if (item.status === "classified") {
    const c = item.classify;
    return (<div className="ans"><div className="ans-q">“{item.q}”</div>
      <div className="ans-intent">read this as <b>{c.echo}</b> · confidence {c.confidence} · {c.status === "salient" ? <><b>{c.domain}</b> is a top anomaly</> : <><b>{c.domain}</b> — present, below the top anomalies</>} — the engine governs what exists</div>
      {c.findings && c.findings.length > 0
        ? <div className="recur-list">
            <div className="recur-lbl">{c.findings.length} {c.domain} finding{c.findings.length > 1 ? "s" : ""} the engine surfaced, ranked by salience:</div>
            {c.findings.map((x, i) => (
              <div key={i} className={`recur-row ${i === 0 ? "top" : ""}`}>
                <span className="recur-rank">#{x.rank}</span>
                <span className="recur-flabel">{x.finding.label}{i === 0 ? " · default" : ""}</span>
                <button className="test-run" onClick={() => onRecurate(x.finding)}>focus ›</button>
              </div>
            ))}
          </div>
        : <div className="recur-act"><span className="frame-tick warn">nothing surfaced</span><span>No {c.domain} finding rose above the noise in this data.</span></div>}
    </div>);
  }
  const d = item.result;
  return (<div className="ans"><div className="ans-q">“{item.q}”</div>
    <div className="ans-intent">L1 read this as <b>{item.intent.metric.replace(/_/g, " ")}</b>{item.intent.segment ? ` · ${item.intent.segment}` : " · company"} · {item.intent.basis}{item.intent.confidence != null ? ` · confidence ${(item.intent.confidence * 100).toFixed(0)}%` : ""} — then the engine computed it</div>
    {item.framing && <div className="frame"><span className="frame-tick">answered</span><span className="frame-h">{item.framing.headline}</span>{item.framing.soWhat && <span className="frame-sw">{item.framing.soWhat}</span>}</div>}
    <QueryWidget desc={d} onPick={onPick} />
  </div>);
}

function DebugPanel({ d }) {
  const [showPrompt, setShowPrompt] = useState(false);
  if (!d || !d.curation) return (<div className="dbg"><div className="dbg-h">CURATION LOG <span className="dbg-meta">no curation yet · press ` to hide</span></div></div>);
  const c = d.curation, v = d.violations || [];
  const isLive = c.source === "live";
  return (<div className="dbg">
    <div className="dbg-h">CURATION LOG · {d.role} <span className="dbg-meta">source: {c.source}{d.model ? ` · ${d.model}` : ""} · {v.length} validator action(s) · press ` to hide</span></div>
    {v.length > 0 && <div className="dbg-rej">validator: {v.join(" · ")}</div>}
    <div className="dbg-cols">
      <div className="dbg-col"><div className="dbg-cap">① model proposed (judgment)</div><pre className="dbg-pre">{JSON.stringify({ thesis: c.thesis, evidence: c.evidenceIds, tests: c.testIds, widgets: c.widgetIds, partition: c.partitionPref }, null, 1)}</pre></div>
      <div className="dbg-col"><div className="dbg-cap">② engine enforced (truth)</div><pre className="dbg-pre">{`evidence:  ${c.evidenceIds.length} values, every one traceable
tests:     ${c.testIds.length} (${c.testIds.length ? "incl. falsifier" : "none"})
widgets:   ${c.widgetIds.length} on-domain, engine-computed
partition: ${c.partitionPref || "(role default)"}
prose:     numeral-free (guard ${v.some((x) => x.includes("numeral")) ? "fired" : "clean"})
verdict:   ${isLive ? "COHERENT → rendered live" : "fell back to deterministic"}`}</pre></div>
    </div>
    <button className="dbg-tog" onClick={() => setShowPrompt((s) => !s)}>{showPrompt ? "▾" : "▸"} raw model response</button>
    {showPrompt && <pre className="dbg-pre full">{d.raw || "(fallback — no usable model output)"}</pre>}
  </div>);
}

// ===== vital-signs scorecard. The live strip is MODEL-CURATED: the model selects role-aware,
// finding-weighted headline metrics as part of the curation contract (validated against the
// headline menu, cached per finding+role so it's stable — bounded, not re-rolled). KPI_SET below
// is only the DETERMINISTIC FALLBACK persona set, used when curation is unavailable. Every cell is
// engine-resolved and traceable either way; two-mode cells show ▲/▼ vs benchmark or a trend. =====
const KPI_SET = {
  CFO: ["nrr", "grr", "gross_margin", "magic_number", "cac_payback", "rule_of_40"],
  CRO: ["qoq_growth", "net_new_arr", "ent_share", "nrr", "magic_number", "cac_payback"],
};
function kpiDir(vals) { const a = vals[0], z = vals[vals.length - 1], rel = (z - a) / (Math.abs(a) || 1); return rel > 0.02 ? "rising" : rel < -0.02 ? "falling" : "flat"; }
function resolveKpi(m) {
  const L = "25Q4", S = ["24Q4", "25Q4"];
  switch (m) {
    case "nrr": return { mv: E.nrr(null, S[0], S[1]) };
    case "grr": return { mv: E.grr(null, S[0], S[1]) };
    case "gross_margin": return { mv: E.grossMargin(L) };
    case "magic_number": return { mv: E.magicNumber(L) };
    case "cac_payback": return { mv: E.cacPayback(L) };
    case "rule_of_40": return { mv: E.ruleOf40(L) };
    case "qoq_growth": { const s = E.QUARTERS.slice(1).map((q) => E.qoqGrowth(q)); return { mv: s[s.length - 1], disp: `${(s[s.length - 1].value * 100).toFixed(1)}%`, trend: kpiDir(s.map((x) => x.value)) }; }
    case "net_new_arr": { const s = E.QUARTERS.slice(1).map((q) => E.netNewArr(q)).filter(Boolean); return { mv: s[s.length - 1], trend: kpiDir(s.map((x) => x.value)) }; }
    case "ent_share": { const s = E.QUARTERS.map((q) => E.entShare(q)); return { mv: s[s.length - 1], trend: kpiDir(s.map((x) => x.value)) }; }
    default: return null;
  }
}
function kpiThr(b, unit) { return unit === "ratio" ? `${b.thr}x` : unit === "months" ? `${b.thr}mo` : unit === "percent" ? `${b.thr}%` : `${b.thr}`; }
function KpiCell({ res, onPick }) {
  const mv = res.mv, b = mv.basis;
  const disp = res.disp || fmtMV(mv);
  const tone = b ? ((b.good === "above" ? mv.value >= b.thr : mv.value <= b.thr) ? "good" : "bad") : "";
  return (<button className="kcell" onClick={() => onPick({ node: mv })}>
    <span className="kcell-v">{disp}</span>
    <span className="kcell-l">{mv.label}{mv.epistemic === "proxy" && <span className="proxy">proxy</span>}</span>
    {b ? <span className={`kcell-b ${tone}`}>{mv.value < b.thr ? "▼" : "▲"} vs {kpiThr(b, mv.unit)}</span>
      : res.trend ? <span className="kcell-b trend">{res.trend === "rising" ? "▲" : res.trend === "falling" ? "▼" : "—"} {res.trend}</span> : null}
  </button>);
}
function Scorecard({ role, scorecardKeys, onPick }) {
  // Model-curated vital signs: the model selects role-aware headline metrics (cached in the
  // curation, so stable per finding+role — bounded, not re-rolled per render). Falls back to the
  // deterministic persona set only if curation is unavailable. Every cell engine-resolved + traceable.
  const set = (scorecardKeys && scorecardKeys.length ? scorecardKeys : (KPI_SET[role] || KPI_SET.CFO));
  return (<div className="scorecard">{set.map((m, i) => { const res = resolveKpi(m); return res ? <KpiCell key={i} res={res} onPick={onPick} /> : null; })}</div>);
}

function QueryModal({ queries, onAsk, onClose, onPick, onRecurate, busy }) {
  return (<div className="qmodal-bg" onClick={onClose}>
    <div className="qmodal" onClick={(e) => e.stopPropagation()}>
      <div className="qmodal-h"><span className="qmodal-t">Interrogate the engine</span><button className="qmodal-x" onClick={onClose}>✕</button></div>
      <QueryBar onAsk={onAsk} busy={busy} />
      <div className="qmodal-note">Type an analytical interest. The model maps it to a discovered finding and echoes back its reading (with a confidence and salience rank) before re-orienting — or refuses if the data contract doesn't support it. You navigate; the engine governs what's real.</div>
      <div className="qmodal-results">{queries.map((it) => <AnswerCard key={it.id} item={it} onPick={onPick} onRecurate={onRecurate} />)}</div>
    </div>
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
  const [showQuery, setShowQuery] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  useEffect(() => { const h = (e) => { if (e.key === "`" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); setShowDebug((v) => !v); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);

  async function handleQuery(text) {
    const id = Date.now();
    setQueries((qs) => [{ id, q: text, status: "loading" }, ...qs]);
    const upd = (patch) => setQueries((qs) => qs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      const c = await classifyToFinding(text);                    // map intent → ranked finding (or flag)
      if (!c) { upd({ status: "failed", reason: "couldn't read that — try rephrasing the interest" }); return; }
      if (c.status === "unsupported") { upd({ status: "declined", echo: c.echo, reason: c.reason || "" }); return; }
      upd({ status: "classified", classify: c });                 // echo + confidence → user confirms → recurate
    } catch (e) { upd({ status: "declined", reason: "intent service unavailable" }); }
  }

  // Re-orientation core. Builds the fully curated surface (read + board + strip) around a target
  // finding — topFinding() by default, or any discovered finding chosen via the query. Perturbation
  // and query-recurate are both thin front-ends on this: change what we curate around, rebuild.
  async function buildCuratedState(roleKey, targetFinding) {
    try {
      const curation = await curate({ role: roleKey }, catalog, targetFinding);
      if (!curation) throw new Error("no finding to curate");
      const isRetention = curation.finding && E.findingNeighborhood(curation.finding).domain === "retention";
      const lead = isRetention ? ["masking_card"] : ["salient_band"];
      const ids = [...lead, ...(curation.widgetIds || []).filter((id) => !lead.includes(id))];
      const spec = { sections: [{ heading: "", blocks: ids.map((id, i) => (id === "masking_card" || i === 0) ? { widget: id, emphasis: "hero", headline: "", soWhat: i === 0 ? curation.thesis : "" } : { widget: id, emphasis: "standard", headline: "", soWhat: "" }) }] };
      return { loading: false, curation, spec, partitionPref: curation.partitionPref, source: curation.source, rejected: 0, framingRejected: (curation.violations || []).some((v) => v.includes("numeral")) ? 1 : 0, err: null, debug: { curation, violations: curation.violations, raw: curation._debug && curation._debug.raw, prompt: curation._debug && curation._debug.prompt, model: curation._debug && curation._debug.model, role: roleKey } };
    } catch (e) {
      return { loading: false, curation: null, spec: FALLBACK[roleKey], partitionPref: null, source: "fallback", rejected: 0, framingRejected: 0, err: String(e).slice(0, 120), debug: null };
    }
  }
  async function enter(roleKey) {
    setRole(roleKey); setPicked(null);
    if (cache.current[roleKey]) { setState(cache.current[roleKey]); return; }
    setState({ loading: true, curation: null, spec: null, source: null, rejected: 0, framingRejected: 0, err: null, debug: null });
    const next = await buildCuratedState(roleKey, null);
    cache.current[roleKey] = next; setState(next);
  }
  // Query-driven re-orientation to a chosen discovered finding — transient (not cached; role tabs
  // remain the "home" top-finding view). The user drives; the finding is always a real ranked one.
  async function recurate(targetFinding) {
    setPicked(null); setShowQuery(false);
    setState((s) => ({ ...s, loading: true }));
    const next = await buildCuratedState(role, targetFinding);
    setState(next);
  }

  if (!role) return (<div className="caliper"><EntryScreen onEnter={enter} /></div>);

  return (
    <div className="caliper">
      
      <header className="hdr">
        <div className="hdr-l"><span className="hdr-mark">⟡ CALIPER</span><span className="hdr-sub">Caliper Systems · synthetic</span></div>
        <div className={`hdr-status ${state.source}`}>
          {state.loading ? <span><span className="live-dot" /> curating the {role} dashboard — the model is arranging the engine's findings…</span>
            : state.source === "live" ? <span><span className="live-dot" /> Curated live by the model for the {role} — every number computed by the engine, click any value to verify.{state.rejected > 0 && <em> · {state.rejected} widget{state.rejected > 1 ? "s" : ""} rejected</em>}{state.framingRejected > 0 && <em> · {state.framingRejected} numeric claim{state.framingRejected > 1 ? "s" : ""} stripped from framing</em>}</span>
            : <span>Model unavailable — captured {role} arrangement. Numbers still live from the engine.{state.err && <em> · {state.err}</em>}</span>}
        </div>
        <div className="hdr-r">
          {Object.keys(ROLES).map((k) => <button key={k} className={`lensbtn ${k === role ? "on" : ""}`} onClick={() => enter(k)}>{k}</button>)}
          <button className="recur brief-btn" onClick={() => setShowBrief(true)} title="analyst read — the investigation">◈ read</button>
          <button className="recur" onClick={() => setShowQuery(true)} title="interrogate the engine">⌕</button>
          <button className="recur" onClick={() => { delete cache.current[role]; enter(role); }} title="re-curate">↻</button>
          <button className="recur" onClick={() => setShowDebug((v) => !v)} title="boundary inspector (or press `)">dbg</button>
        </div>
      </header>

      {showDebug && <DebugPanel d={state.debug} />}

      <div className={`workarea ${picked ? "drawer-open" : ""}`}>
        <main className="stage">
          {state.loading ? <div className="loading">…</div> : <><Scorecard role={role} scorecardKeys={state.curation && state.curation.scorecardKeys} onPick={setPicked} /><TemplateBoard spec={state.spec} role={role} catalog={catalog} onPick={setPicked} partitionPref={state.partitionPref} finding={state.curation && state.curation.finding} /></>}
        </main>
        <TraceDrawer picked={picked} onClose={() => setPicked(null)} />
      </div>

      {showBrief && <div className="brief-overlay"><AnalystRead role={role} catalog={catalog} curation={state.curation} onPick={(p) => { setPicked(p); setShowBrief(false); }} onClose={() => setShowBrief(false)} /></div>}

      {showQuery && <QueryModal queries={queries} onAsk={handleQuery} onClose={() => setShowQuery(false)} onPick={(p) => { setPicked(p); setShowQuery(false); }} onRecurate={recurate} busy={queries.some((q) => q.status === "loading")} />}
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) return (
      <div className="caliper"><div className="err-screen">
        <div className="err-h">Something threw while rendering.</div>
        <pre className="err-msg">{String(this.state.err && this.state.err.message || this.state.err)}</pre>
        <button className="err-btn" onClick={() => this.setState({ err: null })}>dismiss</button>
      </div></div>
    );
    return this.props.children;
  }
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
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}
