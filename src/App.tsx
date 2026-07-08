import React, { useState, useMemo, useEffect, useRef } from "react";

import { createEngine } from "./engine-core";
import { WIDGET_DOMAIN, RELATED_DOMAINS, guardFraming, guardDirection, engineHeadline, validateCurationCore, HEADLINE_KEYS } from "./curation";

// The engine is created once from the dataset fetched at runtime (see App bootstrap).
// One engine, two consumers: this same engine-core is what scripts/validate.ts proves
// against the oracle. The browser never hand-edits it.
let E;
let BASE_DS = null;   // retained so perturbations transform a copy and reset restores the original
function initEngine(ds) {
  E = createEngine({ customers: ds.facts.customers, opex: ds.facts.opex, quarters: ds.meta.quarters, segments: ds.meta.segments, benchmarks: ds.benchmarks, opportunities: ds.facts.opportunities });
}
// ===== PERTURBATION: prove discovery is real, not scripted. Apply a transparent, SINGLE-AXIS change
// to the real data — not a re-authored dataset — then recompute salience from scratch. The finding
// re-orders on its own and the whole app re-orients, with no code change. Verified blind: cutting
// recent S&M removes the CAC/efficiency anomaly and the engine surfaces ARR concentration as the new
// top risk — unprompted. (Discipline: change the input condition, never the output finding.) =====
const PERTURBATIONS = {
  improve_cac: {
    label: "Improve go-to-market efficiency",
    note: "Cut S&M spend ~40% in the last three quarters — a more efficient acquisition motion.",
    apply: (d) => { for (const o of d.facts.opex) if (["25Q2", "25Q3", "25Q4"].includes(o.quarter)) o.sm_spend *= 0.6; },
  },
};
function perturbedDataset(name) {
  const d = JSON.parse(JSON.stringify(BASE_DS));
  PERTURBATIONS[name].apply(d);
  return d;
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
// model. Everything else stays on the cheap path. NOTE: the model field is advisory only — the
// Netlify function is server-authoritative and pins curate → Sonnet (it ignores this value).
const CURATION_MODEL = "claude-sonnet-4-6";

const fmtM = (v) => `$${(v / 1e6).toFixed(2)}M`;
const fmtK = (v) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${(v / 1e3).toFixed(1)}K`);
const fmtPct = (v) => `${v.toFixed(1)}%`;
function fmtMV(mv) { switch (mv.unit) { case "usd": return fmtM(mv.value); case "percent": return fmtPct(mv.value); case "ratio": return `${mv.value.toFixed(2)}x`; case "months": return `${mv.value.toFixed(0)} mo`; case "number": return `${mv.value.toFixed(0)}`; case "pp": return `${mv.value.toFixed(0)} pp`; default: return `${mv.value}`; } }

// ================= trace =================
function RowsLeaf({ leaf, parentVal }) {
  const r = useMemo(() => E.resolveLeaf(leaf.selector), [leaf]);
  let body, stat, note, recon, reconciles = null; const RTOL = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 1e-6);
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
    reconciles = parentVal ? RTOL(sum, parentVal.value) : null;
  } else if (r.kind === "delta") {
    const sum = r.rows.reduce((s, x) => s + (x.b - x.a), 0);
    stat = (<span><b>{r.n}</b> accounts with positive ARR change · full audit trail</span>);
    body = (<table className="rows-tbl"><thead><tr><th>account</th><th>{r.from}</th><th>{r.to}</th><th>Δ</th></tr></thead><tbody>{r.rows.map((x) => (<tr key={x.id}><td className="mono">{x.id}</td><td className="mono">{x.a === 0 ? "new" : fmtK(x.a)}</td><td className="mono">{fmtK(x.b)}</td><td className="mono pos">+{fmtK(x.b - x.a).slice(1)}</td></tr>))}</tbody></table>);
    note = `new logos + expansion, summed live`;
    recon = <>Σ {r.n} positive deltas = <b className="mono">{fmtK(sum)}</b> — reconciles to {parentVal ? fmtMV(parentVal) : "the value above"}</>;
    reconciles = parentVal ? RTOL(sum, parentVal.value) : null;
  } else if (r.kind === "opps") {
    stat = (<span><b>{r.won}</b> won / <b>{r.n}</b> closed deals · full audit trail</span>);
    body = (<table className="rows-tbl"><thead><tr><th>deal</th><th>segment</th><th>stage</th></tr></thead><tbody>{r.rows.map((o, i) => (<tr key={i}><td className="mono">{o.opp_id}</td><td className="mono">{o.segment}</td><td className={`mono ${o.stage === "won" ? "pos" : "neg"}`}>{o.stage}</td></tr>))}</tbody></table>);
    note = `closed opportunities, resolved live from the pipeline`;
    recon = <>{r.won} won ÷ {r.n} closed = <b className="mono">{r.n ? (r.won / r.n * 100).toFixed(1) : "—"}%</b> — reconciles to the value above</>;
    reconciles = parentVal && r.n ? RTOL(r.won / r.n * 100, parentVal.value) : null;
  } else {
    const sum = r.rows.reduce((s, o) => s + (o[r.field] || 0), 0);
    stat = (<span><b>{r.rows.length}</b> opex rows · {r.field} · full audit trail</span>);
    body = (<table className="rows-tbl"><thead><tr><th>segment</th><th>quarter</th><th>{r.field}</th></tr></thead><tbody>{r.rows.map((o, i) => (<tr key={i}><td className="mono">{o.segment}</td><td className="mono">{o.quarter}</td><td className="mono">{fmtK(o[r.field])}</td></tr>))}</tbody></table>);
    note = `operating expense at segment×quarter grain — its natural grain`;
    recon = <>Σ {r.rows.length} rows = <b className="mono">{fmtK(sum)}</b> — reconciles to {parentVal ? fmtMV(parentVal) : "the value above"}</>;
    reconciles = parentVal ? RTOL(sum, parentVal.value) : null;
  }
  return (<div className="rows"><div className="rows-stat">{stat}</div><div className="rows-scroll">{body}</div>{recon && <div className={`rows-recon ${reconciles === false ? "bad" : ""}`}><span className="recon-mark">{reconciles === true ? "\u2713" : reconciles === false ? "\u2717" : "\u00b7"}</span> {recon}</div>}<div className="anno">{note}</div></div>);
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
function TrustPanel({ audit, onClose }) {
  return (<div className="brief">
    <div className="brief-head"><span className="brief-tag">TRUST CONTRACT</span><span className="brief-src fallback">the boundary, made explicit</span><button className="brief-x" onClick={onClose}>✕</button></div>
    <div className="brief-sec">
      <div className="brief-lbl">The boundary — what each layer may do</div>
      <div className="tc-grid">
        <div className="tc-col"><div className="tc-h ok">The model MAY</div><ul><li>frame the finding in prose</li><li>select evidence, tests, and widgets from the engine's menus</li><li>choose the role's lens and the vital-signs metrics</li></ul></div>
        <div className="tc-col"><div className="tc-h no">The model MAY NOT</div><ul><li>author any number — framing is numeral-guarded</li><li>cite evidence outside the finding's neighborhood</li><li>invent a finding, metric, test, or widget</li></ul></div>
        <div className="tc-col"><div className="tc-h eng">The engine GUARANTEES</div><ul><li>every value computed deterministically, traceable to source rows</li><li>coherence enforced — off-neighborhood selections rejected</li><li>the finding is data-derived by generic salience, never planted</li></ul></div>
      </div>
    </div>
    <div className="brief-sec">
      <div className="brief-lbl">The data contract — what this system can and cannot answer</div>
      <div className="tc-contract">
        <div className="tc-line"><span className="tc-yes">ANSWERABLE</span><span>retention (NRR/GRR/churn) · unit economics (CAC/magic/Rule of 40/margin) · growth (ARR/net-new) · concentration (segment mix) — broken down by segment, quarter, cohort</span></div>
        <div className="tc-line"><span className="tc-no">REFUSED</span><span>geography/region · product line · individual reps · marketing channel · headcount — not in the data contract, so the system declines rather than fabricates</span></div>
      </div>
    </div>
    <div className="brief-sec">
      <div className="brief-lbl">Role scoping — why boards differ by role</div>
      <div className="tc-contract">
        <div className="tc-line"><span className="tc-yes">HOW</span><span>Every role sees the <b>same neutral salience ranking</b>. A role <b>leads</b> with the highest-ranked finding in a domain where it holds <b>primary decision rights</b> — who owns the lever that moves the metric. The objective #1 is always disclosed, and led-with only if it's in the role's remit.</span></div>
        <div className="tc-line"><span className="tc-no">NOT</span><span>This is <b>not</b> a preference weight or a per-role dataset. No tilt, no tuning, no manipulated data — the ranking is identical for everyone; only what <b>leads</b> is scoped. CFO holds capital efficiency, portfolio risk; CRO holds growth, retention, segment strategy; concentration is shared.</span></div>
      </div>
    </div>
    <div className="brief-sec">
      <div className="brief-lbl">AI audit log — every model decision this session, and how the engine governed it</div>
      <div className="tc-audit">
        {audit.length === 0 ? <div className="tc-empty">No model actions yet this session.</div>
          : audit.map((e, i) => (<div key={i} className={`tc-row ${e.kind}`}><span className="tc-kind">{e.kind}</span><span className="tc-detail">{e.kind === "curation" && e.finding ? <><b>{e.finding}</b> — </> : ""}{e.detail}</span></div>))}
      </div>
    </div>
  </div>);
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
  const W = w, H = h, padL = 46, padR = 50, padB = 36, padT = 20; const plotW = W - padL - padR, plotH = H - padT - padB;
  const scL = niceScale(0, Math.max(...bars.map((b) => b.value)), 4);
  const scR = niceScale(Math.min(...line.map((p) => p.value), benchmark), Math.max(...line.map((p) => p.value), benchmark), 4);
  const yL = (v) => padT + plotH - (v / scL.max) * plotH, yR = (v) => padT + plotH - ((v - scR.min) / (scR.max - scR.min)) * plotH;
  const n = bars.length, slot = plotW / n, bw = slot * 0.5, x = (i) => padL + slot * i + slot / 2;
  const path = line.map((p, i) => `${i ? "L" : "M"}${x(i)},${yR(p.value)}`).join(" ");
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln">
    {scL.ticks.map((tv, i) => tv <= scL.max && (<g key={i}><line x1={padL} x2={W - padR} y1={yL(tv)} y2={yL(tv)} className="cx-grid" /><text x={padL - 8} y={yL(tv) + 3.5} className="cx-ytick" textAnchor="end">{fmtL(tv)}</text></g>))}
    {scR.ticks.map((tv, i) => tv >= scR.min && tv <= scR.max && (<text key={i} x={W - padR + 8} y={yR(tv) + 3.5} className="cx-ytick" textAnchor="start">{fmtR(tv)}</text>))}
    {bars.map((b, i) => (<rect key={i} x={x(i) - bw / 2} y={yL(b.value)} width={bw} height={padT + plotH - yL(b.value)} className="co-bar" onClick={() => onPick(b.mv)} />))}
    <line x1={padL} x2={W - padR} y1={yR(benchmark)} y2={yR(benchmark)} className="cx-bench" /><text x={padL + 2} y={yR(benchmark) - 6} className="cx-bench-lab" textAnchor="start">TARGET {fmtR(benchmark)}</text>
    <path d={path} className="cx-line" />
    <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} className="cx-axis" />
    {line.map((p, i) => { const br = good === "above" ? p.value < benchmark : p.value > benchmark; const last = i === line.length - 1; return (<g key={i} className="ln-pt" onClick={() => onPick(p.mv)}><circle cx={x(i)} cy={yR(p.value)} r={last ? 4 : 2.5} className={`cx-dot ${br ? "bad" : "good"} ${last ? "last" : ""}`} /></g>); })}
    {bars.map((b, i) => (<text key={i} x={x(i)} y={H - padB + 16} className="cx-xtick" textAnchor="middle">{b.q}</text>))}
    <text x={padL - 8} y={padT - 6} className="cx-axlab" textAnchor="end">S&M $</text><text x={W - padR + 8} y={padT - 6} className="cx-axlab" textAnchor="start">MAGIC</text>
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
// ===== shared chart construction layer — the machinery institutional charts have and hand-drawn
// SVG lacks: a nice-number scale so axes land on rounded values (0.4, 0.6, 0.8 — not 0.34, 0.52),
// proper ticks, and consistent plot geometry. Every chart routes through this instead of raw
// min/max scaling, which is what makes them read as constructed rather than sketched.
function niceNum(range, round) {
  const exp = Math.floor(Math.log10(range || 1));
  const frac = (range || 1) / Math.pow(10, exp);
  const nf = round ? (frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10) : (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10);
  return nf * Math.pow(10, exp);
}
function niceScale(min, max, maxTicks = 5) {
  if (min === max) { min -= Math.abs(min) * 0.1 || 0.5; max += Math.abs(max) * 0.1 || 0.5; }
  const range = niceNum(max - min, false);
  const step = niceNum(range / Math.max(1, maxTicks - 1), true);
  const niceMin = Math.floor(min / step) * step, niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) ticks.push(Math.round(v / step) * step);
  return { min: niceMin, max: niceMax, step, ticks };
}

function LineChart({ series, benchmark, good, onPick, fmt, w = 620, h = 230 }) {
  const W = w, H = h, padL = 52, padR = 20, padB = 30, padT = 16; const plotW = W - padL - padR, plotH = H - padT - padB;
  const vals = series.map((p) => p.value).concat(benchmark != null ? [benchmark] : []);
  const sc = niceScale(Math.min(...vals), Math.max(...vals), 5);
  const x = (i) => padL + (plotW * i) / (series.length - 1); const y = (v) => padT + plotH - ((v - sc.min) / (sc.max - sc.min)) * plotH;
  const path = series.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const areaId = `lg-${Math.abs(series.reduce((a, p, i) => a + p.value * (i + 1), 0) * 1000 | 0)}`;
  const area = `M${x(0)},${padT + plotH} ` + series.map((p, i) => `L${x(i)},${y(p.value)}`).join(" ") + ` L${x(series.length - 1)},${padT + plotH} Z`;
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--data)" stopOpacity="0.12" /><stop offset="100%" stopColor="var(--data)" stopOpacity="0" /></linearGradient></defs>
    {benchmark != null && <rect x={padL} y={good === "above" ? y(benchmark) : padT} width={W - padR - padL} height={good === "above" ? (padT + plotH - y(benchmark)) : (y(benchmark) - padT)} className="cx-danger" />}
    {sc.ticks.map((tv, i) => (tv >= sc.min && tv <= sc.max && <g key={i}><line x1={padL} x2={W - padR} y1={y(tv)} y2={y(tv)} className="cx-grid" /><text x={padL - 10} y={y(tv) + 3.5} className="cx-ytick" textAnchor="end">{fmt(tv)}</text></g>))}
    {benchmark != null && <><line x1={padL} x2={W - padR} y1={y(benchmark)} y2={y(benchmark)} className="cx-bench" /><text x={W - padR} y={y(benchmark) - 6} className="cx-bench-lab" textAnchor="end">TARGET {fmt(benchmark)}</text></>}
    <path d={area} fill={`url(#${areaId})`} />
    <path d={path} className="cx-line" />
    <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} className="cx-axis" />
    {/* invisible hit-targets keep every point traceable without drawing redundant nodes */}
    {series.map((p, i) => (<g key={i} className="ln-pt" onClick={() => onPick(p.mv)}>
      <rect x={x(i) - (plotW / series.length) / 2} y={padT} width={plotW / series.length} height={plotH} fill="transparent" />
      <text x={x(i)} y={H - padB + 16} className="cx-xtick" textAnchor="middle">{p.q}</text>
    </g>))}
    {/* single load-bearing mark: the current value */}
    {(() => { const p = series[series.length - 1], br = benchmark != null && (good === "above" ? p.value < benchmark : p.value > benchmark); return (<g className="ln-pt" onClick={() => onPick(p.mv)}>
      <circle cx={x(series.length - 1)} cy={y(p.value)} r={4.5} className={`cx-dot ${benchmark == null ? "neutral" : br ? "bad" : "good"} last`} />
      <text x={x(series.length - 1)} y={y(p.value) - 12} className={`cx-dlab ${br ? "bad" : ""}`} textAnchor="end">{fmt(p.value)}</text>
    </g>); })()}
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
  // segment-scoped: read the segment from the primary mv's id (e.g. "arr.SMB.25Q4") so the spark
  // tracks the exact value the hero displays. Covers concentration (arr) and retention (nrr) leads.
  arr: (q, i, primary) => { try { const p = String(primary && primary.id || "").split("."); const seg = p.length === 3 ? p[1] : null; return seg ? E.segArr(seg, q).value : E.companyArr(q).value; } catch { return null; } },
  nrr: (q, i, primary) => { try { const p = String(primary && primary.id || "").split("."); const seg = p.length >= 3 && E.SEGMENTS.includes(p[1]) ? p[1] : null; const qi = E.QUARTERS.indexOf(q); if (qi < 4) return null; return E.nrr(seg, E.QUARTERS[qi - 4], q).value; } catch { return null; } },
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
    <defs><linearGradient id="sf-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--data)" stopOpacity="0.14" /><stop offset="100%" stopColor="var(--data)" stopOpacity="0" /></linearGradient></defs>
    <path d={area} fill="url(#sf-g)" />
    {benchmark != null && <line x1={padL} x2={W - padR} y1={y(benchmark)} y2={y(benchmark)} className="mt-bench" />}
    {benchmark != null && <text x={W - padR + 4} y={y(benchmark) + 3} className="mt-bench-lab">{benchmark}</text>}
    <path d={line} className="mt-ln" />
    <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r={3.5} className={`mt-dot ${tone} last`} />
    <text x={x(0)} y={H - 3} className="mt-qlab" textAnchor="start">{labels[0]}</text><text x={x(vals.length - 1)} y={H - 3} className="mt-qlab" textAnchor="end">{labels[labels.length - 1]}</text>
  </svg>);
}
// Generic finding band — presents ANY top salient fact the way FindingCard presents masking.
// Adding a finding type needs no new band: the fact's structure (value, benchmark, trend) drives it.
function SalientBand({ finding, role, onPick }) {
  if (!finding || !finding.mvs || !finding.mvs.length) return null;
  const domain = (() => { try { return E.findingNeighborhood(finding).domain; } catch { return null; } })();
  // For a concentration finding, the headline is the concentration itself (top-segment share), rising —
  // not an arbitrary segment's ARR. This makes the value AND its sparkline tell the concentration story.
  let primary = finding.mvs[0], sf = METRIC_SERIES[finding.metric];
  if (domain === "concentration") {
    try { const es = E.entShare(E.QUARTERS[E.QUARTERS.length - 1]); if (es) { primary = es; sf = (q) => { try { return E.entShare(q).value; } catch { return null; } }; } } catch {}
  }
  const basis = primary.basis;
  let spark = null;
  if (sf) { const vals = E.QUARTERS.map((q, i) => sf(q, i, primary)).filter((v) => v != null); if (vals.length > 2) spark = { vals, labels: E.QUARTERS.slice(E.QUARTERS.length - vals.length) }; }
  return (<div className="fband">
    <div className="fband-vals">
      <div className="sf-primary">
        <span className="sf-val mono">{fmtMV(primary)}</span>
        <span className="sf-lbl">{primary.label}</span>
        {basis != null && <span className="sf-badge">vs {basis.thr}{primary.unit === "percent" ? "%" : ""} benchmark</span>}
      </div>
      <div className="sf-ctx">Most significant finding for {ROLE_FUNCTION[role] || "Finance"}</div>
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
    { seg: "SMB", color: "#8ba6c4", points: E.QUARTERS.map((q) => ({ q, value: E.segArr("SMB", q).value, mv: E.segArr("SMB", q) })) },
    { seg: "Mid-Market", color: "#4a7ba8", points: E.QUARTERS.map((q) => ({ q, value: E.segArr("Mid-Market", q).value, mv: E.segArr("Mid-Market", q) })) },
    { seg: "Enterprise", color: "#1f3a5f", points: E.QUARTERS.map((q) => ({ q, value: E.segArr("Enterprise", q).value, mv: E.segArr("Enterprise", q) })) },
  ];
  const smBars = Q1.map((q) => ({ q, value: E.smTotal(q).value, mv: E.smTotal(q) }));
  const magicLine = Q1.map((q) => ({ q, value: E.magicNumber(q).value, mv: E.magicNumber(q) }));
  const accelLine = Q1.map((q) => ({ q, value: E.qoqGrowth(q).value * 100, mv: E.qoqGrowth(q) }));
  // ---- batch-1 general charts (relationship / cumulative / heatmap / indexed / start-vs-end) ----
  const scatterEG = Q1.map((q) => ({ x: E.magicNumber(q).value, y: E.qoqGrowth(q).value * 100, label: q, mv: E.magicNumber(q) }));
  const paretoArr = E.SEGMENTS.map((sg) => ({ label: sg, value: E.segArr(sg, "25Q4").value, mv: E.segArr(sg, "25Q4") }));
  const hmRows = [
    { label: "Magic #", f: (q) => E.magicNumber(q), thr: E.BENCH.magic_number.threshold, good: "above" },
    { label: "CAC (mo)", f: (q) => E.cacPayback(q), thr: E.BENCH.cac_payback_mo.threshold, good: "below" },
    { label: "Rule of 40", f: (q) => E.ruleOf40(q), thr: E.BENCH.rule_of_40.threshold, good: "above" },
    { label: "Gross Mgn", f: (q) => E.grossMargin(q), thr: E.BENCH.gross_margin.threshold, good: "above" },
  ];
  const heatmapMetrics = { cols: Q1, rows: hmRows.map((m) => ({ label: m.label, cells: Q1.map((q) => { const mv = m.f(q); if (!mv) return { tone: "none", mv: null, text: "" }; const ok = m.good === "above" ? mv.value >= m.thr : mv.value <= m.thr; return { tone: ok ? "good" : "bad", mv, text: "" }; }) })) };
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
    heatmap_metrics: { kind: "heatmap", polarity: "bad", desc: "Every efficiency metric across every quarter, tone-coded against benchmark — the fastest scan of where and when the book breaches.", data: { title: "Efficiency heatmap", ...heatmapMetrics } },
    indexed_arr: { kind: "indexed", polarity: "neutral", desc: "Segment ARR rebased to 100 at the first quarter — compares growth rates across segments regardless of size.", data: { title: "Indexed ARR growth by segment", ...indexedArr } },
    dumbbell_ret: { kind: "dumbbell", polarity: "bad", desc: "Gross vs net retention per segment — the gap is the expansion contribution; where the dot moves left, contraction outweighs expansion.", data: { title: "GRR → NRR by segment", items: dumbbellRet, fmt: (v) => `${v.toFixed(0)}%` } },
    treemap_arr: { kind: "treemap", polarity: "bad", desc: "ARR share by segment as proportional area — the concentration of the book at a glance.", data: { title: "ARR share by segment", items: treemapArr, fmt: (v) => `$${(v / 1e6).toFixed(1)}M` } },
    grouped_growth: { kind: "grouped", polarity: "neutral", desc: "Segment ARR at the first vs latest quarter side by side — which segments actually drove the growth.", data: { title: "Segment ARR — first vs latest", groups: groupedGrowth, keys: ["24Q1", "25Q4"], colors: ["var(--slate-l)", "var(--slate-d)"], fmt: (v) => `$${(v / 1e6).toFixed(1)}M` } },
    quadrant_eff: { kind: "quadrant", polarity: "bad", desc: "Each quarter positioned by sales efficiency and growth against their benchmarks — the four zones separate efficient growth from bought growth.", data: { title: "Efficiency × growth positioning", points: quadEff, xlab: "Magic #", ylab: "QoQ growth %", xbench: E.BENCH.magic_number.threshold, ybench: 5, quad: { tr: "Efficient growth", tl: "Bought growth", br: "Efficient · slowing", bl: "Inefficient" } } },
    small_mult_arr: { kind: "small_multiples", polarity: "neutral", desc: "One ARR trend per segment on a shared scale — compare the growth shapes side by side.", data: { title: "ARR trend by segment", series: smArr } },
    lorenz_arr: { kind: "lorenz", polarity: "bad", desc: "Cumulative ARR share by account (accounts ranked largest first) — the distribution shape; the steeper the early rise, the more the book concentrates in a few accounts.", data: { title: "ARR distribution (Lorenz)", curve: lorenzCurve.curve, mv: lorenzCurve } },
    heatmap_retention: { kind: "heatmap", polarity: "bad", desc: "NRR and GRR per segment, tone-coded against benchmark — where retention holds and where it breaches.", data: { title: "Retention by segment", ...heatmapRet } },
  };
}

// ===== row grammar: widgets declare eligible templates; a deterministic packer fills
// rows so every row is complete (no dead space). The model chooses widgets; layout is
// by rule. Variation is generative — different widget mixes pack into different rows —
// while every result is organized. =====

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
// Lorenz curve — cumulative ARR share vs cumulative account share (accounts ranked largest first).
// The gold diagonal is perfect equality; the more the data-blue curve bows above it, the more
// concentrated the book. A genuine distribution-shape view distinct from segment/customer charts.
function LorenzCurve({ curve, onPick, w = 420, h = 200 }) {
  const W = w, H = h, padL = 42, padR = 18, padT = 16, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const x = (v) => padL + (v / 100) * plotW, y = (v) => padT + plotH - (v / 100) * plotH;
  const ticks = [0, 25, 50, 75, 100];
  const path = curve.map((p, i) => `${i ? "L" : "M"}${x(p.acc)},${y(p.arr)}`).join(" ");
  const area = `${path} L${x(100)},${y(0)} Z`;
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln" onClick={onPick}>
    <defs><linearGradient id="lz-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--data)" stopOpacity="0.12" /><stop offset="100%" stopColor="var(--data)" stopOpacity="0" /></linearGradient></defs>
    {ticks.map((t, i) => (<g key={i}><line x1={padL} x2={padL + plotW} y1={y(t)} y2={y(t)} className="cx-grid" /><text x={padL - 8} y={y(t) + 3.5} className="cx-ytick" textAnchor="end">{t}</text><text x={x(t)} y={padT + plotH + 14} className="cx-xtick" textAnchor="middle">{t}</text></g>))}
    <line x1={x(0)} y1={y(0)} x2={x(100)} y2={y(100)} className="cx-bench" /><text x={x(100)} y={y(100) + 12} className="cx-bench-lab" textAnchor="end">EQUALITY</text>
    <path d={area} fill="url(#lz-g)" />
    <path d={path} className="cx-line" />
    <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} className="cx-axis" />
    <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} className="cx-axis" />
    <text x={padL + plotW / 2} y={H - 3} className="cx-axlab" textAnchor="middle">CUMULATIVE ACCOUNTS %</text>
    <text x={10} y={padT + plotH / 2} className="cx-axlab" textAnchor="middle" transform={`rotate(-90 10 ${padT + plotH / 2})`}>CUMULATIVE ARR %</text>
  </svg>);
}
// Scatter — two metrics plotted against each other (relationship view). Institutional: points, no path.
function Scatter({ points, xlab, ylab, onPick, w = 420, h = 200 }) {
  const W = w, H = h, padL = 44, padR = 20, padT = 16, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const xsc = niceScale(Math.min(...xs), Math.max(...xs), 4), ysc = niceScale(Math.min(...ys), Math.max(...ys), 4);
  const px = (v) => padL + ((v - xsc.min) / (xsc.max - xsc.min)) * plotW;
  const py = (v) => padT + plotH - ((v - ysc.min) / (ysc.max - ysc.min)) * plotH;
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln">
    {ysc.ticks.map((tv, i) => tv >= ysc.min && tv <= ysc.max && (<g key={i}><line x1={padL} x2={padL + plotW} y1={py(tv)} y2={py(tv)} className="cx-grid" /><text x={padL - 8} y={py(tv) + 3.5} className="cx-ytick" textAnchor="end">{tv % 1 === 0 ? tv : tv.toFixed(1)}</text></g>))}
    {xsc.ticks.map((tv, i) => tv >= xsc.min && tv <= xsc.max && (<text key={i} x={px(tv)} y={padT + plotH + 14} className="cx-xtick" textAnchor="middle">{tv % 1 === 0 ? tv : tv.toFixed(2)}</text>))}
    <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} className="cx-axis" />
    <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} className="cx-axis" />
    {points.map((p, i) => (<g key={i} className="ln-pt" onClick={() => p.mv && onPick(p.mv)}>
      <circle cx={px(p.x)} cy={py(p.y)} r={i === points.length - 1 ? 5 : 3.5} className={`scat-dot ${i === points.length - 1 ? "last" : ""}`} />
      {p.label && <text x={px(p.x)} y={py(p.y) - 8} className="scat-lab" textAnchor="middle">{p.label}</text>}
    </g>))}
    <text x={padL + plotW / 2} y={H - 3} className="cx-axlab" textAnchor="middle">{xlab}</text>
    <text x={10} y={padT + plotH / 2} className="cx-axlab" textAnchor="middle" transform={`rotate(-90 10 ${padT + plotH / 2})`}>{ylab}</text>
  </svg>);
}
// Pareto — sorted bars + cumulative share curve (concentration / share-of-total). General.
function Pareto({ items, fmt, onPick, w = 420, h = 200 }) {
  const W = w, H = h, padL = 40, padR = 44, padT = 18, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const sorted = items.slice().sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, x) => s + x.value, 0) || 1;
  const max = Math.max(...sorted.map((i) => i.value)) * 1.1;
  const bw = plotW / sorted.length, bar = bw * 0.6;
  let cum = 0; const cumPts = sorted.map((it, i) => { cum += it.value; return { x: padL + bw * i + bw / 2, y: padT + plotH - (cum / total) * plotH, pct: cum / total }; });
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln">
    {sorted.map((it, i) => { const bh = (it.value / max) * plotH; return (<g key={i} className="ln-pt" onClick={() => it.mv && onPick(it.mv)}>
      <rect x={padL + bw * i + (bw - bar) / 2} y={padT + plotH - bh} width={bar} height={bh} className="par-bar" />
      <text x={padL + bw * i + bw / 2} y={H - 2} className="wf-xlab" textAnchor="middle">{it.label}</text>
    </g>); })}
    <polyline points={cumPts.map((p) => `${p.x},${p.y}`).join(" ")} className="par-cum" />
    {cumPts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2.5} className="par-cum-dot" />)}
    <text x={W - padR + 4} y={cumPts[cumPts.length - 1].y + 3} className="dlab" textAnchor="start">100%</text>
  </svg>);
}
// Heatmap — metric × quarter grid, tone-coded vs benchmark (dense multi-metric scan). General.
function Heatmap({ rows, cols, onPick, w = 420, h = 200 }) {
  const W = w, H = h, padL = 96, padT = 18, padR = 8, padB = 6;
  const gw = (W - padL - padR) / cols.length, gh = (H - padT - padB) / rows.length;
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln">
    {cols.map((c, j) => <text key={j} x={padL + gw * j + gw / 2} y={padT - 6} className="wf-xlab" textAnchor="middle">{c}</text>)}
    {rows.map((r, i) => (<g key={i}>
      <text x={padL - 6} y={padT + gh * i + gh / 2 + 3} className="wf-xlab" textAnchor="end">{r.label}</text>
      {r.cells.map((cell, j) => (<g key={j} className="ln-pt" onClick={() => cell.mv && onPick(cell.mv)}>
        <rect x={padL + gw * j + 1} y={padT + gh * i + 1} width={gw - 2} height={gh - 2} className={`hm-cell ${cell.tone}`} style={{ opacity: cell.intensity != null ? 0.25 + 0.7 * cell.intensity : 1 }} />
        {cell.text && <text x={padL + gw * j + gw / 2} y={padT + gh * i + gh / 2 + 3} className="hm-txt" textAnchor="middle">{cell.text}</text>}
      </g>))}
    </g>))}
  </svg>);
}
// Indexed line — series rebased to 100 at t0 (compare growth rates regardless of level). General.
function IndexedLine({ series, quarters, onPick, w = 420, h = 200 }) {
  const W = w, H = h, padL = 34, padR = 72, padT = 14, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const idx = series.map((s) => ({ ...s, pts: s.points.map((p) => ({ ...p, iv: (p.value / (s.points[0].value || 1)) * 100 })) }));
  const allv = idx.flatMap((s) => s.pts.map((p) => p.iv));
  const min = Math.min(...allv, 100), max = Math.max(...allv, 100), r = (max - min) || 1;
  const x = (i) => padL + (i / (quarters.length - 1)) * plotW, y = (v) => padT + plotH - ((v - min) / r) * plotH;
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln">
    <line x1={padL} y1={y(100)} x2={padL + plotW} y2={y(100)} className="ln-bench" /><text x={padL - 4} y={y(100) + 3} className="ln-bench-lab" textAnchor="end">100</text>
    {idx.map((s, si) => (<g key={si}>
      <polyline points={s.pts.map((p, i) => `${x(i)},${y(p.iv)}`).join(" ")} className="idx-line" style={{ stroke: s.color }} />
      <text x={padL + plotW + 3} y={y(s.pts[s.pts.length - 1].iv) + 3} className="idx-lab" style={{ fill: s.color }} textAnchor="start">{s.seg}</text>
      {s.pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.iv)} r={2} style={{ fill: s.color }} className="ln-pt" onClick={() => p.mv && onPick(p.mv)} />)}
    </g>))}
  </svg>);
}
// Dumbbell — start vs end per category (change over the window, at a glance). General.
function Dumbbell({ items, fmt, onPick, w = 420, h = 200 }) {
  const W = w, H = h, padL = 100, padR = 50, padT = 14, padB = 10;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const all = items.flatMap((i) => [i.a, i.b]);
  const min = Math.min(...all), max = Math.max(...all), r = (max - min) || 1;
  const x = (v) => padL + ((v - min) / r) * plotW, gap = plotH / items.length;
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln">
    {items.map((it, i) => { const cy = padT + gap * i + gap / 2; const up = it.b >= it.a; return (<g key={i} className="ln-pt" onClick={() => it.mv && onPick(it.mv)}>
      <text x={padL - 8} y={cy + 4} className="wf-xlab" textAnchor="end">{it.label}</text>
      <line x1={x(it.a)} y1={cy} x2={x(it.b)} y2={cy} className={`dmb-link ${up ? "up" : "down"}`} />
      <circle cx={x(it.a)} cy={cy} r={3.5} className="dmb-a" />
      <circle cx={x(it.b)} cy={cy} r={4.5} className={`dmb-b ${up ? "up" : "down"}`} />
      <text x={x(it.b) + (x(it.b) >= x(it.a) ? 8 : -8)} y={cy + 4} className="dlab" textAnchor={x(it.b) >= x(it.a) ? "start" : "end"}>{fmt(it.b)}</text>
    </g>); })}
  </svg>);
}
// Treemap — segments sized by share of total (composition at a glance). Concentration.
function Treemap({ items, fmt, onPick, w = 420, h = 200 }) {
  const W = w, H = h, pad = 3;
  const total = items.reduce((s, x) => s + x.value, 0) || 1;
  const sorted = items.slice().sort((a, b) => b.value - a.value);
  let x0 = 0; const shades = ["#1f3a5f", "#4a7ba8", "#8ba6c4", "#b8c8da"];
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln">
    {sorted.map((it, i) => { const ww = (it.value / total) * W; const rect = (<g key={i} className="ln-pt" onClick={() => it.mv && onPick(it.mv)}>
      <rect x={x0 + pad} y={pad} width={Math.max(ww - pad * 2, 1)} height={H - pad * 2} fill={shades[i % shades.length]} />
      <text x={x0 + ww / 2} y={H / 2 - 4} className="tm-lab" textAnchor="middle">{it.label}</text>
      <text x={x0 + ww / 2} y={H / 2 + 12} className="tm-val" textAnchor="middle">{((it.value / total) * 100).toFixed(0)}%</text>
    </g>); x0 += ww; return rect; })}
  </svg>);
}
// Grouped bar — two measures per category side by side (direct comparison). General.
function GroupedBar({ groups, keys, fmt, colors, onPick, w = 420, h = 200 }) {
  const W = w, H = h, padL = 40, padR = 12, padT = 14, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = Math.max(...groups.flatMap((g) => g.bars.map((b) => b.value))) * 1.1;
  const gw = plotW / groups.length, bw = (gw * 0.7) / keys.length;
  const y = (v) => padT + plotH - (v / max) * plotH;
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln">
    <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} className="ln-axis" />
    {groups.map((g, gi) => (<g key={gi}>
      {g.bars.map((b, bi) => { const bx = padL + gw * gi + gw * 0.15 + bw * bi; return (<rect key={bi} x={bx} y={y(b.value)} width={bw - 2} height={padT + plotH - y(b.value)} fill={colors[bi]} className="ln-pt" onClick={() => b.mv && onPick(b.mv)} />); })}
      <text x={padL + gw * gi + gw / 2} y={H - 2} className="wf-xlab" textAnchor="middle">{g.label}</text>
    </g>))}
    {keys.map((k, i) => (<g key={i}><rect x={padL + i * 70} y={2} width={8} height={8} fill={colors[i]} /><text x={padL + i * 70 + 12} y={9} className="ax-lab" textAnchor="start">{k}</text></g>))}
  </svg>);
}
// Quadrant — two metrics with benchmark crosshairs dividing four labeled positioning zones.
function Quadrant({ points, xlab, ylab, xbench, ybench, quad, onPick, w = 420, h = 200 }) {
  const W = w, H = h, padL = 44, padR = 20, padT = 16, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const xsc = niceScale(Math.min(...xs, xbench), Math.max(...xs, xbench), 4), ysc = niceScale(Math.min(...ys, ybench), Math.max(...ys, ybench), 4);
  const px = (v) => padL + ((v - xsc.min) / (xsc.max - xsc.min)) * plotW;
  const py = (v) => padT + plotH - ((v - ysc.min) / (ysc.max - ysc.min)) * plotH;
  const bx = px(xbench), by = py(ybench), zones = quad || {};
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln">
    {ysc.ticks.map((tv, i) => tv >= ysc.min && tv <= ysc.max && (<g key={i}><line x1={padL} x2={padL + plotW} y1={py(tv)} y2={py(tv)} className="cx-grid" /><text x={padL - 8} y={py(tv) + 3.5} className="cx-ytick" textAnchor="end">{tv % 1 === 0 ? tv : tv.toFixed(1)}</text></g>))}
    {xsc.ticks.map((tv, i) => tv >= xsc.min && tv <= xsc.max && (<text key={i} x={px(tv)} y={padT + plotH + 14} className="cx-xtick" textAnchor="middle">{tv % 1 === 0 ? tv : tv.toFixed(2)}</text>))}
    <line x1={bx} y1={padT} x2={bx} y2={padT + plotH} className="cx-bench" />
    <line x1={padL} y1={by} x2={padL + plotW} y2={by} className="cx-bench" />
    {zones.tr && <text x={padL + plotW - 3} y={padT + 9} className="quad-zone" textAnchor="end">{zones.tr}</text>}
    {zones.tl && <text x={padL + 3} y={padT + 9} className="quad-zone" textAnchor="start">{zones.tl}</text>}
    {zones.br && <text x={padL + plotW - 3} y={padT + plotH - 4} className="quad-zone" textAnchor="end">{zones.br}</text>}
    {zones.bl && <text x={padL + 3} y={padT + plotH - 4} className="quad-zone" textAnchor="start">{zones.bl}</text>}
    {points.map((p, i) => (<g key={i} className="ln-pt" onClick={() => p.mv && onPick(p.mv)}>
      <circle cx={px(p.x)} cy={py(p.y)} r={i === points.length - 1 ? 5 : 3.5} className={`scat-dot ${i === points.length - 1 ? "last" : ""}`} />
      <text x={px(p.x)} y={py(p.y) - 8} className="scat-lab" textAnchor="middle">{p.label}</text>
    </g>))}
    <text x={padL + plotW / 2} y={H - 3} className="cx-axlab" textAnchor="middle">{xlab}</text>
    <text x={10} y={padT + plotH / 2} className="cx-axlab" textAnchor="middle" transform={`rotate(-90 10 ${padT + plotH / 2})`}>{ylab}</text>
  </svg>);
}
// Small multiples — one mini trend per category on a shared scale (compare shapes). General.
function SmallMultiples({ series, onPick, w = 420, h = 200 }) {
  const W = w, H = h, cols = series.length, cw = W / cols, padT = 18, padB = 14, padX = 8;
  const allv = series.flatMap((s) => s.points.map((p) => p.value));
  const min = Math.min(...allv), max = Math.max(...allv), r = (max - min) || 1;
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln">
    {series.map((s, si) => { const x0 = cw * si; const x = (i) => x0 + padX + (i / (s.points.length - 1)) * (cw - padX * 2); const y = (v) => padT + (H - padT - padB) - ((v - min) / r) * (H - padT - padB);
      return (<g key={si}>
        <text x={x0 + cw / 2} y={12} className="wf-xlab" textAnchor="middle">{s.seg}</text>
        <polyline points={s.points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} className="idx-line" style={{ stroke: s.color }} />
        <circle cx={x(s.points.length - 1)} cy={y(s.points[s.points.length - 1].value)} r={2.5} style={{ fill: s.color }} className="ln-pt" onClick={() => onPick(s.points[s.points.length - 1].mv)} />
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
        <text x={padL - 8} y={cy + 3} className="bl-rowlab" textAnchor="end">{it.label}</text>
        <rect x={trackX} y={cy - 7} width={trackW} height={14} className="bullet-track" />
        <rect x={trackX} y={cy - 4} width={Math.max(x(it.value) - trackX, 1)} height={8} className={`bullet-bar ${clears ? "good" : "bad"}`} />
        <line x1={x(it.target)} y1={cy - 9} x2={x(it.target)} y2={cy + 9} className="bullet-target" />
        <text x={x(it.target)} y={cy - 12} className="bl-tlab" textAnchor="middle">{it.fmt(it.target)}</text>
        <text x={W - padR + 6} y={cy + 3} className={`bl-val ${clears ? "good" : "bad"}`} textAnchor="start">{it.fmt(it.value)}</text>
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
  if (w.kind === "scatter") return (<div className="cpanel"><ChartHeader title={d.title} /><Fill render={(cw, ch) => <Scatter points={d.points} xlab={d.xlab} ylab={d.ylab} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "pareto") return (<div className="cpanel"><ChartHeader title={d.title} /><Fill render={(cw, ch) => <Pareto items={d.items} fmt={d.fmt} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "heatmap") return (<div className="cpanel"><ChartHeader title={d.title} /><Fill render={(cw, ch) => <Heatmap rows={d.rows} cols={d.cols} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "indexed") return (<div className="cpanel"><ChartHeader title={d.title} /><Fill render={(cw, ch) => <IndexedLine series={d.series} quarters={d.quarters} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "dumbbell") return (<div className="cpanel"><ChartHeader title={d.title} /><Fill render={(cw, ch) => <Dumbbell items={d.items} fmt={d.fmt} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "treemap") return (<div className="cpanel"><ChartHeader title={d.title} /><Fill render={(cw, ch) => <Treemap items={d.items} fmt={d.fmt} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "lorenz") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={() => onPick({ node: d.mv })} /><Fill render={(cw, ch) => <LorenzCurve curve={d.curve} onPick={() => onPick({ node: d.mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "grouped") return (<div className="cpanel"><ChartHeader title={d.title} /><Fill render={(cw, ch) => <GroupedBar groups={d.groups} keys={d.keys} colors={d.colors} fmt={d.fmt} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "quadrant") return (<div className="cpanel"><ChartHeader title={d.title} /><Fill render={(cw, ch) => <Quadrant points={d.points} xlab={d.xlab} ylab={d.ylab} xbench={d.xbench} ybench={d.ybench} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "small_multiples") return (<div className="cpanel"><ChartHeader title={d.title} /><Fill render={(cw, ch) => <SmallMultiples series={d.series} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  return null;
}

// ================= the model: curation (bounded) =================
const ROLES = {
  CFO: { label: "Chief Financial Officer", focus: "durability, efficiency, retention quality, and concentration risk" },
  CRO: { label: "Head of Revenue (CRO)", focus: "growth, bookings momentum, expansion, and segment performance" },
};
// ===== ROLE DECISION-RIGHTS SCOPE — the one authored semantic layer. A role LEADS with the
// highest-salience finding in a domain where it holds PRIMARY DECISION RIGHTS (who owns the lever
// that moves the metric, not who "cares"). Defined over domains with zero reference to any finding —
// portable and outcome-blind (verified across four dominant-domain surfaces: it diverges when the
// top finding is single-remit, converges when it's shared). The objective #1 is always DISCLOSED,
// led-with only if in-remit. Same neutral salience for every role; the scope only decides what leads.
const ROLE_SCOPE = {
  CFO: ["efficiency", "concentration", "retention"],   // spend/payback/allocation · portfolio risk · durability input
  CRO: ["growth", "retention", "concentration"],       // pipeline/motion · renewals/expansion · segment go-to-market
};
const DOMAIN_LABEL = { efficiency: "capital efficiency", concentration: "revenue concentration", retention: "retention", growth: "growth" };
const ROLE_FUNCTION = { CFO: "Finance", CRO: "Revenue" };
const DOMAIN_OWNER = { efficiency: { org: "Finance", role: "CFO" }, growth: { org: "Revenue", role: "CRO" }, retention: { org: "Revenue", role: "CRO" }, concentration: { org: "Finance & Revenue", role: "CFO" } };
// highest-salience finding within the role's decision-rights scope
function roleScopedTopFinding(roleKey) {
  const scope = ROLE_SCOPE[roleKey] || ROLE_SCOPE.CFO;
  const inScope = E.computeSalience().find((f) => scope.includes(E.findingNeighborhood(f).domain));
  return inScope ? { ...inScope, scope: { window: [E.QUARTERS[E.QUARTERS.length - 5], E.QUARTERS[E.QUARTERS.length - 1]] } } : E.topFinding();
}
// The model authors framing PROSE only — never numbers. Every number on the board comes from
// the engine (via widgets/values). Any numeral in model-authored text is an attempt to author a
// value, which the thesis forbids — so guardFraming (in curation.ts) REJECTS such framing and the
// deterministic fallback renders instead (reject, don't strip; don't trust). Engine-named metric
// labels that contain digits ("Rule of 40") are whitelisted — naming them is referencing, not
// authoring. The prompt asks; the guard enforces.

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
  const nb = E.findingNeighborhood(finding);
  // the model may NAME any metric it was shown as evidence — those engine labels (some contain
  // digits, e.g. "Rule of 40") are references, not authored values, so they're whitelisted.
  const evidenceLabels = (nb.metricIds || []).map((id: string) => { try { return E.store.get(id)?.label; } catch { return null; } }).filter(Boolean);
  return validateCurationCore(cur, nb, catalog, WIDGET_DOMAIN, evidenceLabels);
}
function buildCurationPrompt(focus, finding, nb, catalog) {
  const metricMenu = nb.metricIds.map((id) => ({ id, label: E.store.get(id).label }));
  const testMenu = nb.testIds.map((id) => { const t = E.TEST_MENU.find((x) => x.id === id); return { id, question: t.label, falsifier: nb.falsifierIds.includes(id) }; });
  const widgetMenu = Object.keys(catalog).filter((id) => (RELATED_DOMAINS[nb.domain] || []).includes(WIDGET_DOMAIN[id])).map((id) => ({ id, label: catalog[id].title || id }));
  const headlineMenu = HEADLINE_KEYS;
  // Domain-conditional composition guidance. Some findings (concentration especially) are served
  // by segment-based widgets the model may not recognize as "the board" — naming the complementary
  // views a complete board of that kind contains helps it compose fully without forcing a count.
  const DOMAIN_HINT = {
    concentration: "For a concentration finding, a complete board typically shows: the segment composition (treemap or stacked share), the ranking/Pareto of segments, the share trend over time (indexed or stacked-over-time), and the segment breakdown table. These segment-based views ARE the concentration story — select the complementary ones that build the full picture.",
    efficiency: "For an efficiency finding, a complete board typically shows: the metric trend vs benchmark, the spend-vs-output relationship, the positioning against peers/quadrant, and the supporting metric matrix.",
    retention: "For a retention finding, a complete board typically shows: the cohort/NRR bridge, the segment retention comparison, and the trend against benchmark.",
    growth: "For a growth finding, a complete board typically shows: the growth trend, the segment contribution, and the acceleration/composition over time.",
  };
  const domainHint = DOMAIN_HINT[nb.domain] ? "\n" + DOMAIN_HINT[nb.domain] : "";
  return `You are the analytical-judgment layer of a governed analytics system, briefing the ${focus.role}.
An engine has DETECTED this finding (you did not compute it; you may foreground and FRAME it): "${finding.label}".
Form the decision-relevant READ for the ${focus.role}. The engine surfaced this top statistical fact from a neutral scan; its finding neighborhood (the menus below) defines what is legible. Do NOT assume the issue is retention, growth, efficiency, or concentration — let the neighborhood and the evidence decide. Choose the framing and widgets most decision-relevant FOR THE ${focus.role}: a CFO (durability, forecast, capital allocation) and a CRO (conversion, motion, segment mix) should NOT surface the same board. Compose a COMPLETE board: select the set of widgets that give a full analytical view of this finding from complementary angles (e.g. the trend over time, the segment/component breakdown, the composition or share, a comparison against benchmark) — typically 5-6 panels, ordered most important first. Prefer a fuller board that examines the finding from several angles over a sparse one; only select fewer if the finding genuinely cannot support more.${domainHint} Select ONLY from the menus below — you may not invent metrics, tests, or widgets, and you may not write any digit in your prose (the engine owns all numbers).

EVIDENCE (metric ids you may cite): ${JSON.stringify(metricMenu)}
TESTS (you MUST include at least one marked falsifier:true, so your read can fail): ${JSON.stringify(testMenu)}
WIDGETS (charts you may select, prioritized): ${JSON.stringify(widgetMenu)}
HEADLINE (metric keys for the vital-signs strip — pick 6 that matter to the ${focus.role} for THIS finding): ${JSON.stringify(headlineMenu)}

Return ONLY this JSON, nothing around it:
{"thesis":"1-2 sentences, NO numbers — the story that matters for the ${focus.role}","whyRole":"1 sentence, NO numbers — why it matters to the ${focus.role}","evidenceIds":["ids from EVIDENCE"],"testIds":["ids from TESTS, including >=1 falsifier"],"widgetIds":["5-6 ids from WIDGETS composing a complete board — complementary views, most important first"],"partitionPref":"one of: analytical (dense data-grid lead) | hero (one dominant panel + rail) | balanced","scorecardKeys":["6 role-aware headline metric keys from HEADLINE, foregrounding the ones the finding implicates"],"rationaleTags":["short non-numeric tags"]}`;
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
// (ROLE_INTENT removed — layout is now derived from composition shape, not a role→layout prior)
// Derive the board's SHAPE from the weight distribution of the model's actual selection — role
// absent. A composition with one dominant heavy panel wants a hero layout; several heavy panels
// want a dense analytical grid; comparable-weight panels want a balanced/grid. The layout is a
// CONSEQUENCE of what was composed, so two roles diverge in layout exactly when their compositions
// differ in shape — never because a role→layout table said so.
function deriveShape(charts) {
  const weights = charts.map((c) => PANEL_WEIGHT[c._kind] || 2);
  const n = weights.length;
  if (n <= 2) return "compact";
  const heavy = weights.filter((w) => w >= 3).length;
  const maxW = Math.max(...weights);
  if (heavy >= 2) return "analytical";            // multiple heavy panels → dense data-grid
  if (maxW >= 3 && heavy === 1) return "hero";    // one dominant heavy panel + support → hero
  return n >= 5 ? "grid" : "balanced";            // comparable-weight panels
}
function selectPartition(F, modelCharts, allCharts, T, partitionPref) {
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
const CHART_KINDS = new Set(["waterfall", "combo", "line", "stacked_area", "hbar", "bullet", "matrix", "scatter", "pareto", "heatmap", "indexed", "dumbbell", "treemap", "grouped", "quadrant", "small_multiples", "lorenz"]);
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
  // Domain-scoped top-up: fill empty slots from the SAME domain the finding lives in — so a
  // concentration board tops up with concentration/growth charts, not retention bridges. The
  // finding's own domain leads the top-up order, then related domains. Falls back to the fixed
  // menu only if the finding's domain can't be resolved.
  const findingDomain = finding ? (() => { try { return E.findingNeighborhood(finding).domain; } catch { return null; } })() : null;
  const related = findingDomain ? (RELATED_DOMAINS[findingDomain] || [findingDomain]) : null;
  const scopedIds = related
    ? Object.keys(catalog).filter((id) => catalog[id] && CHART_KINDS.has(catalog[id].kind) && related.includes(WIDGET_DOMAIN[id]) && !chosen.has(id))
        .sort((a, b) => (WIDGET_DOMAIN[a] === findingDomain ? 0 : 1) - (WIDGET_DOMAIN[b] === findingDomain ? 0 : 1))
    : CHART_MENU.filter((id) => catalog[id] && CHART_KINDS.has(catalog[id].kind) && !chosen.has(id));
  const menuCharts = scopedIds.map((id) => ({ widget: id, _kind: catalog[id].kind }));
  const charts = [...modelCharts, ...menuCharts];
  const modelTables = all.filter((b) => b._kind === "table");
  const tables = modelTables.length ? modelTables : (catalog["segment_table"] ? [{ widget: "segment_table", _kind: "table" }] : []);
  const p = PARTITIONS[selectPartition(findings.length, modelCharts, charts, tables.length, partitionPref)];
  const placed = fillPartition(p, findings, charts, tables, role);
  return (<div className="partition" style={{ gridTemplateRows: p.rowsT }}>
    {placed.map((pl, i) => (
      <div key={i} className={`tb-panel asp-${pl.region.a}`} style={{ gridColumn: `${pl.region.c[0]} / ${pl.region.c[1]}`, gridRow: `${pl.region.r[0]} / ${pl.region.r[1]}` }}>
        {pl.block.widget === "salient_band"
          ? <div className="block emph-hero"><SalientBand finding={finding} role={role} onPick={onPick} /></div>
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
// Mode router: one call decides what the user wants and routes it. RE-ORIENT the board to a domain
// (topic interest), ANSWER a specific metric (pointed question), BOTH when genuinely ambiguous, or
// UNSUPPORTED. For "both", the engine shows the computed VALUE (truth, immediate) while the model's
// framing-as-answer waits for the user's click — facts are free, interpretations are confirmed.
const DOMAINS = ["efficiency", "retention", "growth", "concentration"];
function buildRouterPrompt(text) {
  return `A user typed an interest in a governed analytics dashboard. Decide what they want and route it.

THE SYSTEM CAN DO TWO THINGS:
1. RE-ORIENT the board to an analytical DOMAIN — for topic-level, exploratory interests ("how is efficiency", "what about retention", "show me concentration"). Domains: efficiency (CAC/magic/Rule of 40/margin), retention (NRR/GRR/churn), growth (ARR growth/net-new), concentration (segment mix).
2. ANSWER a specific metric value — for pointed questions about a number ("what's SMB's magic number", "how is CAC payback trending"). Supported metrics: ${SUPPORTED.join(", ")}. Segments: SMB, Mid-Market, Enterprise (or null = company). Basis: latest or trend.

NOT in the data contract (→ unsupported): geography/region, product line, individual reps, marketing channel, headcount.

Decide the MODE:
- "recurate": clearly a topic/re-orient interest → give the domain (metric null).
- "answer": clearly a specific-value question → give the metric intent (domain null).
- "both": genuinely ambiguous — a topic that is ALSO a plausible specific-value question (e.g. "how is efficiency") → give BOTH a domain AND a best-guess metric intent.
- "unsupported": needs data not in the contract.

Return ONLY JSON, no fences: {"mode":"recurate|answer|both|unsupported","domain":"efficiency|retention|growth|concentration or null","metric":"<supported metric or null>","segment":"SMB|Mid-Market|Enterprise or null","basis":"latest|trend","echo":"<restate their interest in one short clause>","confidence":"high|medium|low","reason":"<short, only if unsupported>"}

THE USER'S INTEREST: "${text}"`;
}
async function classifyQuery(text) {
  const data = await callModel("intent", [{ role: "user", content: buildRouterPrompt(text) }], 260);
  const raw = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let c = null; try { const m = raw.replace(/```json|```/g, "").trim(); const a = m.indexOf("{"), z = m.lastIndexOf("}"); c = JSON.parse(a >= 0 && z > a ? m.slice(a, z + 1) : m); } catch (e) {}
  if (!c) return null;
  const mode = ["recurate", "answer", "both", "unsupported"].includes(c.mode) ? c.mode : "recurate";
  const echo = String(c.echo || text).slice(0, 120), confidence = ["high", "medium", "low"].includes(c.confidence) ? c.confidence : "low";
  if (mode === "unsupported") return { mode, echo, confidence, reason: c.reason ? String(c.reason).slice(0, 140) : "" };
  // domain findings (recurate / both)
  let domain = null, findings = [], salient = false;
  if (DOMAINS.includes(c.domain)) {
    const ranked = E.computeSalience();
    const inD = ranked.map((f, i) => ({ finding: f, rank: i + 1, domain: E.findingNeighborhood(f).domain })).filter((x) => x.domain === c.domain);
    domain = c.domain; findings = inD.slice(0, 5); salient = inD.length ? inD[0].rank <= 3 : false;
  }
  // metric intent (answer / both) — validated to the supported engine metrics
  const intent = validateIntent({ answerable: true, metric: c.metric, segment: c.segment, basis: c.basis, confidence: 1 });
  return { mode, echo, confidence, domain, findings, salient, intent };
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
  if (g.hasBenchmark) facts.push(`It has a benchmark and currently ${g.status} it — you may refer to "the benchmark" by name, never by a number. ${g.status === "breaches" ? "This is UNDERPERFORMANCE: your headline MUST convey falling short — do NOT write 'exceeds', 'above', 'strong', 'outperforms', or any success language." : "This is favorable: do NOT write 'below', 'misses', 'weak', or any shortfall language."}`);
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
    const gl = desc.grounding?.label ? [desc.grounding.label] : [];
    let headline = guardFraming(String(p.headline || "").slice(0, 80), gl).text;
    let soWhat = guardFraming(String(p.soWhat || "").slice(0, 220), gl).text;
    // directional admissibility: if the model's framing contradicts the engine's verdict, the
    // engine's verdict wins — the headline is replaced, the contradicting soWhat is dropped.
    const g = desc.grounding;
    const hViol = guardDirection(headline, g).violated, sViol = guardDirection(soWhat, g).violated;
    if (hViol) headline = engineHeadline(g);
    if (sViol) soWhat = "";
    return { headline, soWhat, corrected: hViol || sViol };
  } catch (e) { return null; }
}

function QueryBar({ onAsk, busy }) {
  const [v, setV] = useState("");
  const go = () => { if (v.trim() && !busy) { onAsk(v.trim()); setV(""); } };
  return (<div className="qbar"><input className="qin" value={v} placeholder="Ask or explore — “how is efficiency?” (re-orient), “what\u2019s SMB\u2019s magic number?” (answer), or an ambiguous one gets both" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} /><button className="qbtn" disabled={busy || !v.trim()} onClick={go}>{busy ? "…" : "Map"}</button></div>);
}
function QueryWidget({ desc, onPick }) {
  if (desc.kind === "callout") return (<div className="strip"><div className="block"><Callout mv={desc.data.mv} onPick={(mv) => onPick({ node: mv })} /></div></div>);
  if (desc.kind === "line") return (<div className="cpanel"><ChartHeader title={desc.data.title || "trend"} /><Fill render={(cw, ch) => <LineChart series={desc.data.series} benchmark={desc.data.benchmark} good={desc.data.good} fmt={desc.data.fmt} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (desc.kind === "waterfall") return (<div className="cpanel"><ChartHeader title={desc.data.title} tag={`NRR ${desc.data.bridge.nrr.toFixed(0)}%`} tagTone={desc.data.bridge.nrr >= 100 ? "good" : "bad"} onTrace={() => onPick({ node: desc.data.mv })} /><Fill render={(cw, ch) => <Waterfall c={desc.data.bridge} w={cw} h={ch} />} /></div>);
  return null;
}
function AnswerCard({ item, onPick, onRecurate, onAnswerFully }) {
  if (item.status === "loading") return (<div className="ans"><div className="ans-q">“{item.q}”</div><div className="anno"><span className="live-dot" /> interpreting intent → computing → narrating…</div></div>);
  if (item.status === "failed") return (<div className="ans declined"><div className="ans-q">“{item.q}”</div><div className="ans-decline">{item.reason || "Couldn't read that — try rephrasing."}</div></div>);
  if (item.status === "declined") return (<div className="ans declined"><div className="ans-q">“{item.q}”</div><div className="ans-decline">{item.echo ? <><b>{item.echo}</b> — </> : ""}not in the data contract{item.reason ? `: ${item.reason}` : ""}. Available breakdowns: segment, quarter, cohort.</div></div>);
  const FindingList = ({ c, label }) => (c.findings && c.findings.length > 0
    ? <div className="recur-list"><div className="recur-lbl">{label || `${c.findings.length} ${c.domain} finding${c.findings.length > 1 ? "s" : ""} the engine surfaced, ranked by salience:`}</div>
        {c.findings.map((x, i) => (<div key={i} className={`recur-row ${i === 0 ? "top" : ""}`}><span className="recur-rank">#{x.rank}</span><span className="recur-flabel">{x.finding.label}{i === 0 ? " · default" : ""}</span><button className="test-run" onClick={() => onRecurate(x.finding)}>focus ›</button></div>))}
      </div>
    : <div className="recur-act"><span className="frame-tick warn">nothing surfaced</span><span>No {c.domain} finding rose above the noise in this data.</span></div>);
  if (item.status === "classified") {
    const c = item.classify;
    return (<div className="ans"><div className="ans-q">“{item.q}”</div>
      <div className="ans-intent">read this as <b>{c.echo}</b> · confidence {c.confidence} · {c.status === "salient" ? <><b>{DOMAIN_LABEL[c.domain] || c.domain}</b> is a top anomaly</> : <><b>{DOMAIN_LABEL[c.domain] || c.domain}</b> — present, below the top anomalies</>} — the engine governs what exists</div>
      <FindingList c={c} />
    </div>);
  }
  if (item.status === "answered") {
    return (<div className="ans"><div className="ans-q">“{item.q}”</div>
      <div className="ans-intent">read this as <b>{item.echo}</b> — the engine computed it, every value traceable</div>
      {item.framing && <div className="frame"><span className="frame-tick">answered</span><span className="frame-h">{item.framing.headline}</span>{item.framing.soWhat && <span className="frame-sw">{item.framing.soWhat}</span>}</div>}
      <QueryWidget desc={item.desc} onPick={onPick} />
    </div>);
  }
  if (item.status === "both") {
    const c = item.classify;
    return (<div className="ans"><div className="ans-q">“{item.q}”</div>
      <div className="ans-intent">read this as <b>{c.echo}</b> · confidence {c.confidence} — this could be a specific value or a board view. The engine computed the value below; pick what you meant.</div>
      <div className="both-value"><div className="both-hd"><span className="both-lbl">the value · engine-computed · traceable</span><button className="test-run" onClick={() => onAnswerFully(item)}>answer this fully ›</button></div><QueryWidget desc={item.desc} onPick={onPick} /></div>
      <FindingList c={c} label={`or re-orient the board — ${c.domain} finding${c.findings.length > 1 ? "s" : ""}:`} />
    </div>);
  }
  return null;
}

function DebugPanel({ d, onClose }) {
  const [showPrompt, setShowPrompt] = useState(false);
  if (!d || !d.curation) return (<div className="dbg"><div className="dbg-h">CURATION LOG <span className="dbg-meta">no curation yet</span>{onClose && <button className="dbg-close" onClick={onClose}>✕</button>}</div></div>);
  const c = d.curation, v = d.violations || [];
  const isLive = c.source === "live";
  return (<div className="dbg">
    <div className="dbg-h">CURATION LOG · {d.role} <span className="dbg-meta">source: {c.source}{d.model ? ` · ${d.model}` : ""} · {v.length} validator action(s)</span>{onClose && <button className="dbg-close" onClick={onClose}>✕</button>}</div>
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
    <span className="kcell-l">{mv.label}{mv.epistemic === "proxy" && <span className="proxy">proxy</span>}</span>
    <span className="kcell-v">{disp}</span>
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

function QueryModal({ queries, onAsk, onClose, onPick, onRecurate, onAnswerFully, busy }) {
  return (<div className="qmodal-bg" onClick={onClose}>
    <div className="qmodal" onClick={(e) => e.stopPropagation()}>
      <div className="qmodal-h"><span className="qmodal-t">Interrogate the engine</span><button className="qmodal-x" onClick={onClose}>✕</button></div>
      <QueryBar onAsk={onAsk} busy={busy} />
      <div className="qmodal-note">Type an analytical interest. The model maps it to a discovered finding and echoes back its reading (with a confidence and salience rank) before re-orienting — or refuses if the data contract doesn't support it. You navigate; the engine governs what's real.</div>
      <div className="qmodal-results">{queries.map((it) => <AnswerCard key={it.id} item={it} onPick={onPick} onRecurate={onRecurate} onAnswerFully={onAnswerFully} />)}</div>
    </div>
  </div>);
}

function AppInner() {
  const [perturbation, setPerturbation] = useState(null);
  const catalog = useMemo(() => buildCatalog(), [perturbation]);   // rebuilds from the (possibly perturbed) engine
  const [role, setRole] = useState(null);
  const [state, setState] = useState({ loading: false, spec: null, source: null, rejected: 0, err: null, debug: null });
  const [picked, setPicked] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [queries, setQueries] = useState([]);
  const cache = React.useRef({});
  const [showQuery, setShowQuery] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showTrust, setShowTrust] = useState(false);
  const audit = React.useRef([]);
  const [auditN, setAuditN] = useState(0);
  const pushAudit = (entry) => { audit.current = [{ ...entry, ts: Date.now() }, ...audit.current].slice(0, 60); setAuditN((n) => n + 1); };
  useEffect(() => { const h = (e) => { if (e.key === "`" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); setShowDebug((v) => !v); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);

  async function handleQuery(text) {
    const id = Date.now();
    setQueries((qs) => [{ id, q: text, status: "loading" }, ...qs]);
    const upd = (patch) => setQueries((qs) => qs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      const c = await classifyQuery(text);
      if (!c) { upd({ status: "failed", reason: "couldn't read that — try rephrasing the interest" }); return; }
      pushAudit({ kind: "query", role, detail: `"${text}" → ${c.mode}${c.echo ? ` (${c.echo})` : ""}` });
      if (c.mode === "unsupported") { upd({ status: "declined", echo: c.echo, reason: c.reason || "" }); return; }
      if (c.mode === "answer") {
        if (!c.intent) { upd({ status: "failed", reason: "couldn't map that to a supported metric" }); return; }
        const desc = resolveQuery(c.intent); if (!desc) { upd({ status: "failed", reason: "that combination isn't computable here" }); return; }
        const framing = await narrate(text, desc);                 // direct answer request → model commits the framing now
        upd({ status: "answered", desc, framing, echo: c.echo }); return;
      }
      const classify = { domain: c.domain, findings: c.findings, status: c.salient ? "salient" : "present", echo: c.echo, confidence: c.confidence };
      if (c.mode === "both" && c.intent) {
        const desc = resolveQuery(c.intent);                        // engine computes the VALUE (truth), shown inline — NOT narrated until the user confirms
        upd({ status: "both", classify, desc, intent: c.intent }); return;
      }
      upd({ status: "classified", classify }); return;              // recurate (or ambiguous with no valid metric → re-orient)
    } catch (e) { upd({ status: "failed", reason: "intent service unavailable" }); }
  }
  // From a "both" fork: the user confirms they want the ANSWER — the model commits the framing now.
  async function answerFully(item) {
    const upd = (patch) => setQueries((qs) => qs.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
    upd({ status: "loading" });
    const framing = await narrate(item.q, item.desc);
    upd({ status: "answered", desc: item.desc, framing, echo: item.classify.echo });
  }

  // Re-orientation core. Builds the fully curated surface (read + board + strip) around a target
  // finding — topFinding() by default, or any discovered finding chosen via the query. Perturbation
  // and query-recurate are both thin front-ends on this: change what we curate around, rebuild.
  async function buildCuratedState(roleKey, targetFinding) {
    try {
      const anchor = targetFinding || roleScopedTopFinding(roleKey);   // default board leads with the top finding in the role's decision-rights scope
      const curation = await curate({ role: roleKey }, catalog, anchor);
      if (!curation) throw new Error("no finding to curate");
      // disclosure: is the OBJECTIVE #1 outside this role's remit? (always shown, never hidden)
      const objTop = E.topFinding();
      const objDomain = objTop ? E.findingNeighborhood(objTop).domain : null;
      const scope = ROLE_SCOPE[roleKey] || ROLE_SCOPE.CFO;
      const disclosure = objTop && objDomain && !scope.includes(objDomain) ? { label: DOMAIN_LABEL[objDomain] || objDomain, owner: DOMAIN_OWNER[objDomain] || { org: "Finance", role: "CFO" } } : null;
      const isRetention = curation.finding && E.findingNeighborhood(curation.finding).domain === "retention";
      const lead = isRetention ? ["masking_card"] : ["salient_band"];
      const ids = [...lead, ...(curation.widgetIds || []).filter((id) => !lead.includes(id))];
      const spec = { sections: [{ heading: "", blocks: ids.map((id, i) => (id === "masking_card" || i === 0) ? { widget: id, emphasis: "hero", headline: "", soWhat: i === 0 ? curation.thesis : "" } : { widget: id, emphasis: "standard", headline: "", soWhat: "" }) }] };
      const nb = curation.finding ? E.findingNeighborhood(curation.finding) : { lenses: [] };
      const candidates = Object.keys(WIDGET_DOMAIN).filter((id) => (nb.lenses || []).includes(WIDGET_DOMAIN[id])).length;
      const rows = BASE_DS ? BASE_DS.facts.customers.length + BASE_DS.facts.opex.length + BASE_DS.facts.opportunities.length : 0;
      const stats = { selected: (curation.widgetIds || []).length, candidates, evidence: (curation.evidenceIds || []).length, tests: (curation.testIds || []).length, rejected: (curation.violations || []).filter((v) => /drop|reject/.test(v)).length, rows };
      pushAudit({ kind: "curation", role: roleKey, finding: curation.finding ? curation.finding.label : "—", source: curation.source, detail: `chose ${stats.selected} panels, ${stats.evidence} evidence, ${stats.tests} tests · ${stats.rejected} rejected · ${(curation.violations || []).length} validator actions` });
      return { loading: false, curation, spec, stats, disclosure, partitionPref: curation.partitionPref, source: curation.source, rejected: 0, framingRejected: (curation.violations || []).some((v) => v.includes("numeral")) ? 1 : 0, err: null, debug: { curation, violations: curation.violations, raw: curation._debug && curation._debug.raw, prompt: curation._debug && curation._debug.prompt, model: curation._debug && curation._debug.model, role: roleKey } };
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
  // Perturbation: swap the engine to run on transformed data, then let salience + curation
  // recompute from scratch. The effect re-curates whenever the perturbation changes.
  const firstPerturb = React.useRef(true);
  useEffect(() => {
    if (firstPerturb.current) { firstPerturb.current = false; return; }
    if (role) { cache.current = {}; setPicked(null); enter(role); }
  }, [perturbation]);
  function applyPerturbation(name) { initEngine(perturbedDataset(name)); pushAudit({ kind: "perturbation", role, detail: `applied "${PERTURBATIONS[name].label}" — data changed, salience recomputes` }); setPerturbation(name); }
  function resetPerturbation() { initEngine(BASE_DS); pushAudit({ kind: "perturbation", role, detail: "reset to original data" }); setPerturbation(null); }

  if (!role) return (<div className="caliper"><EntryScreen onEnter={enter} /></div>);

  return (
    <div className="caliper">
      
      <header className="hdr">
        <div className="hdr-l"><span className="hdr-mark">⟡ CALIPER</span><span className="hdr-sub">Caliper Systems · synthetic</span></div>
        <div className={`hdr-status ${state.source}`}>
          {state.loading ? <span><span className="live-dot" /> curating the {role} dashboard — the model is arranging the engine's findings…</span>
            : state.source === "live" ? <span><span className="live-dot" /> Curated live for the {role}{state.disclosure && <em className="disclose"> · overall #1: {state.disclosure.label} → {state.disclosure.owner.role} view</em>}{state.stats && <> · model chose <b>{state.stats.selected} of {state.stats.candidates}</b> panels · <b>{state.stats.evidence}</b> evidence · <b>{state.stats.rejected}</b> rejected · <b>{state.stats.rows.toLocaleString()}</b> rows traceable</>}</span>
            : <span>Model unavailable — captured {role} arrangement. Numbers still live from the engine.{state.err && <em> · {state.err}</em>}</span>}
        </div>
        <div className="hdr-r">
          {Object.keys(ROLES).map((k) => <button key={k} className={`lensbtn ${k === role ? "on" : ""}`} onClick={() => enter(k)}>{k}</button>)}
          <button className="recur brief-btn" onClick={() => setShowBrief(true)} title="analyst read — the investigation">◈ read</button>
          <button className="recur" onClick={() => setShowQuery(true)} title="interrogate the engine">⌕</button>
          <button className={`recur ${perturbation ? "on" : ""}`} onClick={() => perturbation ? resetPerturbation() : applyPerturbation("improve_cac")} title="perturb the data — watch the finding re-derive">⟲ perturb</button>
          <div className="hdr-menu-wrap">
            <button className="recur" onClick={() => setShowMenu((v) => !v)} title="tools">⋯</button>
            {showMenu && <div className="hdr-menu" onMouseLeave={() => setShowMenu(false)}>
              <button onClick={() => { delete cache.current[role]; enter(role); setShowMenu(false); }}>↻ re-curate</button>
              <button onClick={() => { setShowDebug(true); setShowMenu(false); }}>◱ curation log</button>
              <button onClick={() => { setShowTrust(true); setShowMenu(false); }}>⛨ trust contract</button>
            </div>}
          </div>
        </div>
      </header>

      {perturbation && <div className="perturb-banner"><span className="pb-tag">DATA PERTURBED</span><span className="pb-lbl">{PERTURBATIONS[perturbation].label}</span><span className="pb-note">{PERTURBATIONS[perturbation].note} The engine recomputed salience from the changed data — the finding you see below re-derived on its own, no code change.</span><button className="pb-reset" onClick={resetPerturbation}>reset data ›</button></div>}

      {showDebug && <div className="brief-overlay"><DebugPanel d={state.debug} onClose={() => setShowDebug(false)} /></div>}

      <div className={`workarea ${picked ? "drawer-open" : ""}`}>
        <main className="stage">
          {state.loading ? <div className="loading">…</div> : <><Scorecard role={role} scorecardKeys={state.curation && state.curation.scorecardKeys} onPick={setPicked} /><TemplateBoard spec={state.spec} role={role} catalog={catalog} onPick={setPicked} partitionPref={state.partitionPref} finding={state.curation && state.curation.finding} /></>}
        </main>
        <TraceDrawer picked={picked} onClose={() => setPicked(null)} />
      </div>

      {showBrief && <div className="brief-overlay"><AnalystRead role={role} catalog={catalog} curation={state.curation} onPick={(p) => { setPicked(p); setShowBrief(false); }} onClose={() => setShowBrief(false)} /></div>}
      {showTrust && <div className="brief-overlay"><TrustPanel audit={audit.current} onClose={() => setShowTrust(false)} /></div>}

      {showQuery && <QueryModal queries={queries} onAsk={handleQuery} onClose={() => setShowQuery(false)} onPick={(p) => { setPicked(p); setShowQuery(false); }} onRecurate={recurate} onAnswerFully={answerFully} busy={queries.some((q) => q.status === "loading")} />}
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
      .then((ds) => { BASE_DS = ds; initEngine(ds); setReady(true); })
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <div className="caliper"><div className="loading">could not load dataset</div></div>;
  if (!ready) return <div className="caliper"><div className="loading">…</div></div>;
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}
