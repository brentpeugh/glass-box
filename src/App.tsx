import React, { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";

import { WIDGET_DOMAIN, guardFraming, guardDirection, engineHeadline } from "./curation";
import { E, initEngine, setBaseDS, BASE_DS } from "./engine";
import { buildCatalog } from "./catalog";
import { composeBoard } from "./layout";
import { curate, callModel, FALLBACK, ledeFacts, ledeTokens, findingAnchorId, offeredWidgets } from "./curate";
import { PERTURBATIONS, perturbedDataset } from "./perturbations";


const fmtM = (v) => `$${(v / 1e6).toFixed(2)}M`;
const fmtK = (v) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${(v / 1e3).toFixed(1)}K`);
const fmtPct = (v) => `${v.toFixed(1)}%`;
function fmtMV(mv) { switch (mv.unit) { case "usd": return fmtM(mv.value); case "percent": return fmtPct(mv.value); case "ratio": return `${mv.value.toFixed(2)}x`; case "months": return `${mv.value.toFixed(0)} mo`; case "number": return `${mv.value.toFixed(0)}`; case "pp": return `${mv.value.toFixed(0)} pp`; default: return `${mv.value}`; } }
// §4 variance convention: a benchmark delta is parenthesised when UNFAVOURABLE, bare when favourable —
// favourability read from basis.good (not the sign of the delta): good "above" wants delta ≥ 0,
// good "below" wants delta ≤ 0. So CAC 21 vs 12mo → (9); Rule-of-40 27 vs 40 → (13); NRR 105.7 vs
// 100 → 5.7. Replaces the ▲/▼ glyph. The pos/neg colour reinforces the SAME favourability — the one
// place the guide sanctions two signals for one meaning. Magnitude only; precision follows the unit.
function fmtVar(b, unit) { const mag = Math.abs(b.delta); const p = unit === "ratio" ? mag.toFixed(2) : unit === "percent" ? mag.toFixed(1) : mag.toFixed(0); const favourable = b.good === "above" ? b.delta >= 0 : b.delta <= 0; return favourable ? p : `(${p})`; }

// ================= trace =================
function RowsLeaf({ leaf, parentVal, depth }) {
  const r = useMemo(() => E.resolveLeaf(leaf.selector), [leaf]);
  // Source rows sit behind one click (default collapsed) — the count rides the affordance. The table
  // renders CAPPED: the claim is that the sum reconciles over ALL rows, not that you can scroll every
  // one. `total` is the full row count (reconciliation spans it); only the render is truncated.
  const [rowsOpen, setRowsOpen] = useState(false);
  const CAP = 50;
  let body, stat, note, recon, reconciles = null, total = 0; const RTOL = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 1e-6);
  if (r.kind === "retention") {
    const movers = [...r.churned.map((x) => ({ ...x, k: "ch" })), ...r.contracted.map((x) => ({ ...x, k: "co" })), ...r.expanded.map((x) => ({ ...x, k: "ex" }))].sort((a, b) => (b[r.sc] - b[r.ec]) - (a[r.sc] - a[r.ec]));
    const begin = r.churned.concat(r.contracted, r.expanded).reduce((s, x) => s + x[r.sc], 0);
    total = movers.length;
    stat = (<><span><b>{r.n}</b> cohort rows</span><span className="dot ember" /><b>{r.churned.length}</b> churned<span className="dot ember2" /><b>{r.contracted.length}</b> contracted<span className="dot verdant" /><b>{r.expanded.length}</b> expanded</>);
    body = (<table className="rows-tbl"><thead><tr><th>account</th><th>{r.sc.slice(4)}</th><th>{r.ec.slice(4)}</th><th>Δ</th></tr></thead><tbody>{movers.slice(0, CAP).map((x) => (<tr key={x.customer_id}><td className="mono">{x.customer_id}</td><td className="mono">{fmtK(x[r.sc])}</td><td className="mono">{x[r.ec] === 0 ? "—" : fmtK(x[r.ec])}</td><td className={`mono ${x[r.ec] >= x[r.sc] ? "pos" : "neg"}`}>{x[r.ec] >= x[r.sc] ? "+" : "−"}{fmtK(Math.abs(x[r.sc] - x[r.ec])).slice(1)}</td></tr>))}</tbody></table>);
    note = `resolved live against all ${r.n} cohort rows — read from the data, not produced by a model`;
    recon = <>{movers.length} accounts moved · the cohort's start and end ARR drive the ratio above</>;
  } else if (r.kind === "col_sum") {
    const sum = r.rows.reduce((s, x) => s + x.v, 0);
    total = r.rows.length;
    stat = (<span><b>{r.n}</b> rows contribute · full audit trail</span>);
    body = (<table className="rows-tbl"><thead><tr><th>account</th><th>{r.col.slice(4)} ARR</th></tr></thead><tbody>{r.rows.slice(0, CAP).map((x) => (<tr key={x.id}><td className="mono">{x.id}</td><td className="mono">{fmtK(x.v)}</td></tr>))}</tbody></table>);
    note = `summed live over all ${r.n} rows`;
    recon = <>Σ {r.n} rows = <b className="mono">{fmtK(sum)}</b> — reconciles to {parentVal ? fmtMV(parentVal) : "the value above"}</>;
    reconciles = parentVal ? RTOL(sum, parentVal.value) : null;
  } else if (r.kind === "delta") {
    const sum = r.rows.reduce((s, x) => s + (x.b - x.a), 0);
    total = r.rows.length;
    stat = (<span><b>{r.n}</b> accounts with positive ARR change · full audit trail</span>);
    body = (<table className="rows-tbl"><thead><tr><th>account</th><th>{r.from}</th><th>{r.to}</th><th>Δ</th></tr></thead><tbody>{r.rows.slice(0, CAP).map((x) => (<tr key={x.id}><td className="mono">{x.id}</td><td className="mono">{x.a === 0 ? "new" : fmtK(x.a)}</td><td className="mono">{fmtK(x.b)}</td><td className="mono pos">+{fmtK(x.b - x.a).slice(1)}</td></tr>))}</tbody></table>);
    note = `new logos + expansion, summed live`;
    recon = <>Σ {r.n} positive deltas = <b className="mono">{fmtK(sum)}</b> — reconciles to {parentVal ? fmtMV(parentVal) : "the value above"}</>;
    reconciles = parentVal ? RTOL(sum, parentVal.value) : null;
  } else if (r.kind === "opps") {
    total = r.rows.length;
    stat = (<span><b>{r.won}</b> won / <b>{r.n}</b> closed deals · full audit trail</span>);
    body = (<table className="rows-tbl"><thead><tr><th>deal</th><th>segment</th><th>stage</th></tr></thead><tbody>{r.rows.slice(0, CAP).map((o, i) => (<tr key={i}><td className="mono">{o.opp_id}</td><td className="mono">{o.segment}</td><td className="mono">{o.stage}</td></tr>))}</tbody></table>);{/* §4: won/lost is a categorical status — the stage word carries it, not a pos/neg cell */}
    note = `closed opportunities, resolved live from the pipeline`;
    recon = <>{r.won} won ÷ {r.n} closed = <b className="mono">{r.n ? (r.won / r.n * 100).toFixed(1) : "—"}%</b> — reconciles to the value above</>;
    reconciles = parentVal && r.n ? RTOL(r.won / r.n * 100, parentVal.value) : null;
  } else {
    const sum = r.rows.reduce((s, o) => s + (o[r.field] || 0), 0);
    total = r.rows.length;
    stat = (<span><b>{r.rows.length}</b> opex rows · {r.field} · full audit trail</span>);
    body = (<table className="rows-tbl"><thead><tr><th>segment</th><th>quarter</th><th>{r.field}</th></tr></thead><tbody>{r.rows.slice(0, CAP).map((o, i) => (<tr key={i}><td className="mono">{o.segment}</td><td className="mono">{o.quarter}</td><td className="mono">{fmtK(o[r.field])}</td></tr>))}</tbody></table>);
    note = `operating expense at segment×quarter grain — its natural grain`;
    recon = <>Σ {r.rows.length} rows = <b className="mono">{fmtK(sum)}</b> — reconciles to {parentVal ? fmtMV(parentVal) : "the value above"}</>;
    reconciles = parentVal ? RTOL(sum, parentVal.value) : null;
  }
  return (<div className="rows" style={{ marginLeft: (depth || 0) * 14 }}><button className="rows-stat" onClick={() => setRowsOpen((o) => !o)} aria-expanded={rowsOpen}><span className="node-glyph">{rowsOpen ? "\u25be" : "\u25b8"}</span>{stat}</button>{rowsOpen && <><div className="rows-scroll">{body}</div>{total > CAP && <div className="rows-cap">showing the first {CAP} of {total.toLocaleString()} rows \u2014 the reconciliation below is computed over all {total.toLocaleString()}</div>}</>}{recon && <div className={`rows-recon ${reconciles === false ? "bad" : ""}`}><span className="recon-mark">{reconciles === true ? "\u2713" : reconciles === false ? "\u2717" : "\u00b7"}</span> {recon}</div>}<div className="anno">{note}</div></div>);
}
// A provenance row is a FOUR-COLUMN grid: [badge · fixed left] [name · flex, indent INSIDE] [operator ·
// fixed left] [value · fixed right]. The indent lives inside the name column only (so badge/op/value
// columns line up at every depth), and the disclosure triangle sits at the indent, inside the name.
function TraceNode({ node, depth, isFinding }) {
  const kids = node.provenance?.inputs?.length;
  // Default: derivation nodes EXPANDED — the decomposition is the drawer's whole argument, so it is
  // visible on open. (3e promoted the root into the header and re-based children depth 1→0; the old
  // `depth < 2` default then left an extra level open — see RowsLeaf for the row-table disclosure.)
  const [open, setOpen] = useState(true);
  const val = isFinding ? `${node.value.toFixed(0)} pp` : fmtMV(node);
  const ptype = node.epistemic === "proxy" ? "MODELED" : (node.provenance?.inputs || []).some((i) => i.kind === "metric") ? "CALCULATED" : "EXTRACTED";
  const ind = { paddingLeft: depth * 14 };
  return (
    <div className="node">
      <div className="node-head" onClick={() => kids && setOpen(!open)} role={kids ? "button" : undefined} tabIndex={kids ? 0 : undefined} onKeyDown={(e) => e.key === "Enter" && setOpen(!open)}>
        <span className={`ptype ${ptype.toLowerCase()}`}>{ptype}</span>
        <span className="node-name" style={ind}><span className="node-glyph">{kids ? (open ? "▾" : "▸") : "◆"}</span><span className="node-label">{node.label}</span></span>
        <span className="node-op">{node.provenance?.op}</span>
        <span className="node-val">{val}</span>
      </div>
      {open && <div className="node-desc" style={ind}>{node.provenance?.description}{node.note ? ` — ${node.note}` : ""}</div>}
      {open && kids ? <div className="node-kids">{node.provenance.inputs.map((inp, i) => inp.kind === "metric" ? <TraceNode key={i} node={E.store.get(inp.id)} depth={depth + 1} /> : <RowsLeaf key={i} leaf={inp} parentVal={node} depth={depth + 1} />)}</div> : null}
    </div>
  );
}
// One traced value, ONE presentation. The evidence-card form (value / label / ▸ trace) is shared by
// every surface that shows a traceable value as a card — the read modal, the lede column, and the
// ask-data answer — so a value is never presented two ways. Clicking opens the trace drawer on it. The
// base .ev-card form is the read modal's; the lede's lattice overrides live in `.lede-figures .ev-card`.
function EvidenceCard({ mv, onPick, anchor }) {
  return (
    <button className={`ev-card${anchor ? " anchor" : ""}`} onClick={() => onPick({ node: mv })}>
      <div className="ev-top"><span className="ev-val">{fmtMV(mv)}</span><span className="ev-lbl">{mv.label}</span></div>
      <div className="ev-trace">▸ trace</div>
    </button>
  );
}
function TrustPanel({ audit, debug, proxy, onClose }) {
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
        {proxy && <div className="tc-line"><span className="tc-proxy">PROXY</span><span><b>{proxy.label}</b> — {proxy.formula}; {proxy.caveat}, so operating margin is approximated, not measured</span></div>}
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
      <div className="brief-lbl">AI audit log — every model/engine action this session, and how the engine governed it</div>
      <div className="tc-audit">
        {audit.length === 0 ? <div className="tc-empty">No actions yet this session.</div>
          : audit.map((e, i) => (<div key={i} className={`tc-row ${e.kind}`}><span className="tc-kind">{e.kind}</span><span className="tc-detail">{e.kind === "curation" && e.finding ? <><b>{e.finding}</b> — </> : ""}{e.detail}{e.kind === "curation" && e.source && e.source !== "live" ? <em> · deterministic fallback, no model</em> : ""}</span></div>))}
      </div>
    </div>
    {/* the curation log folds in here: the current arrangement's model-proposal / engine-enforcement,
        the detailed companion to the audit log above (was the separate MORE ▸ curation log item). */}
    <div className="brief-sec">
      <div className="brief-lbl">Curation log — the model's proposal and the engine's enforcement, this arrangement</div>
      <DebugPanel d={debug} />
    </div>
  </div>);
}
function TraceDrawer({ picked, source, onClose, floating }) {
  if (!picked) return null;
  const node = picked.node;
  const ptype = picked.isFinding ? "FINDING" : node.epistemic === "proxy" ? "MODELED" : (node.provenance?.inputs || []).some((i) => i.kind === "metric") ? "CALCULATED" : "EXTRACTED";
  // §1 honesty: the second sentence is conditional on authorship — in fallback NO model ran (the board
  // says "Model unavailable — captured arrangement"), so the drawer must not claim one did. Say the
  // DIFFERENT thing in each state (not a form vacuously true in both), mirroring the read modal.
  const arranged = source === "live"
    ? "The model arranged this board — not its numbers."
    : "No model ran — the engine produced these numbers.";
  // The header IS the root node: eyebrow (badge) on its own line, heading title beneath with the root
  // value right-aligned on the title line. The tree then begins at the root's derivation line and its
  // inputs — no duplicate root row.
  const rootVal = picked.isFinding ? `${node.value.toFixed(0)} pp` : fmtMV(node);
  const inputs = node.provenance?.inputs || [];
  return (
    <aside className={`drawer ${floating ? "floating" : ""}`}>
      <div className="drawer-head">
        <div className="drawer-eyebrow"><span className={`ptype ${ptype.toLowerCase()}`}>{ptype}</span><button className="drawer-x" onClick={onClose}>✕</button></div>
        <div className="drawer-title-row"><span className="drawer-t">{node.label}</span><span className="drawer-rootval">{rootVal}</span></div>
      </div>
      <div className="drawer-body">
        <div className="anno anno-top">{arranged}</div>
        <div className="ptree">
          {node.provenance?.description && <div className="node-desc node-desc-root">{node.provenance.description}{node.note ? ` — ${node.note}` : ""}</div>}
          {inputs.map((inp, i) => inp.kind === "metric" ? <TraceNode key={i} node={E.store.get(inp.id)} depth={0} /> : <RowsLeaf key={i} leaf={inp} parentVal={node} depth={0} />)}
        </div>
      </div>
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
    {line.map((p, i) => { const last = i === line.length - 1; return (<g key={i} className="ln-pt" onClick={() => onPick(p.mv)}>{last ? <rect x={x(i) - 3} y={yR(p.value) - 3} width={6} height={6} className="cx-dot last" /> : <circle cx={x(i)} cy={yR(p.value)} r={6} fill="transparent" />}</g>); })}
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
  for (const se of series) { const lower = cum.slice(), upper = cum.map((c, i) => c + se.points[i].value); const up = upper.map((v, i) => `${x(i)},${y(v)}`).join(" "); const lo = lower.map((v, i) => `${x(i)},${y(v)}`).reverse().join(" "); const li = lower.length - 1; bands.push({ seg: se.seg, color: se.color, poly: `${up} ${lo}`, midY: y((lower[li] + upper[li]) / 2), mv: se.points[se.points.length - 1].mv }); cum = upper; }
  // §3: no legend — direct end-labels on the bands
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln"><line x1={padL} y1={padT} x2={padL} y2={padT + plotH} className="ax" /><line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} className="ax" />{ticks.map((tv, i) => (<g key={i}><line x1={padL} x2={W - padR} y1={y(tv)} y2={y(tv)} className="wf-grid" /><text x={padL - 8} y={y(tv) + 3} className="wf-axis" textAnchor="end">{fmtM(tv)}</text></g>))}{bands.map((b, i) => (<polygon key={i} points={b.poly} style={{ fill: b.color }} className="area" onClick={() => onPick(b.mv)} />))}{bands.map((b, i) => (<text key={"l" + i} x={W - padR - 4} y={b.midY + 3} className="area-lab" textAnchor="end">{b.seg}</text>))}{quarters.map((q, i) => (<text key={i} x={x(i)} y={H - padB + 15} className="wf-xlab" textAnchor="middle">{q}</text>))}</svg>);
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
  return (<svg viewBox={`0 0 ${W} ${H}`} className="ln" preserveAspectRatio="xMidYMid meet">
    {sc.ticks.map((tv, i) => (tv >= sc.min && tv <= sc.max && <g key={i}><line x1={padL} x2={W - padR} y1={y(tv)} y2={y(tv)} className="cx-grid" /><text x={padL - 10} y={y(tv) + 3.5} className="cx-ytick" textAnchor="end">{fmt(tv)}</text></g>))}
    {benchmark != null && <><line x1={padL} x2={W - padR} y1={y(benchmark)} y2={y(benchmark)} className="cx-bench" /><text x={W - padR} y={y(benchmark) - 6} className="cx-bench-lab" textAnchor="end">TARGET {fmt(benchmark)}</text></>}
    <path d={path} className="cx-line" />
    <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} className="cx-axis" />
    {/* invisible hit-targets keep every point traceable without drawing redundant nodes */}
    {series.map((p, i) => (<g key={i} className="ln-pt" onClick={() => onPick(p.mv)}>
      <rect x={x(i) - (plotW / series.length) / 2} y={padT} width={plotW / series.length} height={plotH} fill="transparent" />
      <text x={x(i)} y={H - padB + 16} className="cx-xtick" textAnchor="middle">{p.q}</text>
    </g>))}
    {/* single load-bearing mark: the current value */}
    {(() => { const p = series[series.length - 1], br = benchmark != null && (good === "above" ? p.value < benchmark : p.value > benchmark); return (<g className="ln-pt" onClick={() => onPick(p.mv)}>
      <rect x={x(series.length - 1) - 3} y={y(p.value) - 3} width={6} height={6} className="cx-dot last" />
      <text x={x(series.length - 1)} y={y(p.value) - 12} className="cx-dlab" textAnchor="end">{fmt(p.value)}</text>
    </g>); })()}
  </svg>);
}
function Callout({ mv, onPick }) {
  const b = mv.basis; const breached = b.good === "above" ? mv.value < b.thr : mv.value > b.thr;
  const thrFmt = mv.unit === "ratio" ? `${b.thr}x` : mv.unit === "months" ? `${b.thr}mo` : mv.unit === "percent" ? `${b.thr}%` : `${b.thr}`;
  return (<button className={`callout ${breached ? "bad" : "good"}`} onClick={() => onPick(mv)}><span className="co-v">{fmtMV(mv)}</span><span className="co-l">{mv.label}{mv.epistemic === "proxy" && <sup className="proxy">a</sup>}</span><span className="co-basis">{fmtVar(b, mv.unit)} vs {thrFmt}</span>{mv.epistemic === "proxy" && mv.note && <span className="co-note"><sup className="proxy">a</sup> {mv.note}</span>}</button>);
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
// Chart measurement is SUSPENDABLE. The drawer's board-compress animates flex-basis, which reflows the
// board every frame; unsuspended, each chart's ResizeObserver would fire every frame and re-render its SVG
// (layout thrash — the drawer-open jank). While suspended, RO callbacks are ignored; on resume, every chart
// re-measures ONCE. A flag + one re-measure, not a timer inside the hook.
const measureBus = { suspended: false, remeasure: new Set() };
function suspendMeasure() { measureBus.suspended = true; }
function resumeMeasure() { measureBus.suspended = false; measureBus.remeasure.forEach((fn) => fn()); }
function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    // Synchronous first measure (before paint) so the chart renders at its real size on the first
    // frame — no first-paint flash, and no dependence on the ResizeObserver's first async delivery.
    // The ResizeObserver only tracks subsequent resizes. A guard, not a timer.
    const measure = () => { const r = el.getBoundingClientRect(); setSize({ w: Math.round(r.width), h: Math.round(r.height) }); };
    measure();
    const ro = new ResizeObserver(() => { if (!measureBus.suspended) measure(); });   // ignored while a board-compress is animating
    ro.observe(el);
    measureBus.remeasure.add(measure);   // re-measured once when measurement resumes
    return () => { ro.disconnect(); measureBus.remeasure.delete(measure); };
  }, []);
  return [ref, size];
}
function Fill({ render }) {
  const [ref, { w, h }] = useSize();
  // Guard (not a timer): render nothing until measured (both dims > 0). Below that the plot geometry
  // (width − padding) goes negative and the SVG emits negative-<rect> errors. Present since 720bb72.
  return <div ref={ref} className="cfill">{w > 0 && h > 0 ? render(w, h) : null}</div>;
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
    {ticks.map((t, i) => (<g key={i}><line x1={padL} x2={padL + plotW} y1={y(t)} y2={y(t)} className="cx-grid" /><text x={padL - 8} y={y(t) + 3.5} className="cx-ytick" textAnchor="end">{t}</text><text x={x(t)} y={padT + plotH + 14} className="cx-xtick" textAnchor="middle">{t}</text></g>))}
    <line x1={x(0)} y1={y(0)} x2={x(100)} y2={y(100)} className="cx-bench" /><text x={x(100)} y={y(100) + 12} className="cx-bench-lab" textAnchor="end">EQUALITY</text>
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
      {i === points.length - 1 ? <rect x={px(p.x) - 3} y={py(p.y) - 3} width={6} height={6} className="scat-dot last" /> : <circle cx={px(p.x)} cy={py(p.y)} r={3.5} className="scat-dot" />}
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
      {s.pts.map((p, i) => { const last = i === s.pts.length - 1; return last ? <rect key={i} x={x(i) - 3} y={y(p.iv) - 3} width={6} height={6} style={{ fill: s.color }} className="ln-pt" onClick={() => p.mv && onPick(p.mv)} /> : <circle key={i} cx={x(i)} cy={y(p.iv)} r={6} fill="transparent" className="ln-pt" onClick={() => p.mv && onPick(p.mv)} />; })}
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
  let x0 = 0; const shades = ["var(--ink)", "var(--ink-2)", "var(--scribe-strong)", "var(--scribe)"];
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
      {i === points.length - 1 ? <rect x={px(p.x) - 3} y={py(p.y) - 3} width={6} height={6} className="scat-dot last" /> : <circle cx={px(p.x)} cy={py(p.y)} r={3.5} className="scat-dot" />}
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
        <rect x={x(s.points.length - 1) - 3} y={y(s.points[s.points.length - 1].value) - 3} width={6} height={6} style={{ fill: s.color }} className="ln-pt" onClick={() => onPick(s.points[s.points.length - 1].mv)} />
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
      {qs.map((q, i) => { const mv = m.get(q, i); return mv ? <button key={q} className={`mx-cell v ${i === qs.length - 1 ? "cur" : ""}`} onClick={() => onPick({ node: mv })}>{m.fmt(mv.value)}</button> : <span key={q} className="mx-cell dim">—</span>; })}
    </div>))}
  </div>);
}
function SegmentTable({ onPick }) {
  const P = "24Q4", L = "25Q4";
  const rows = E.SEGMENTS.map((seg) => ({ seg, arr: E.segArr(seg, L), nrr: E.nrr(seg, P, L), grr: E.grr(seg, P, L) }));
  const total = rows.reduce((a, r) => a + r.arr.value, 0);
  const bNrr = E.nrr(null, P, L), bGrr = E.grr(null, P, L);
  // §4: segment-table cells are LEVELS, not variances — ink, no pos/neg valence (three-job rule).
  const num = (mv) => <button className="dt-num" onClick={() => onPick({ node: mv })}>{fmtMV(mv)}</button>;
  return (<div className="dtable">
    <div className="dt-row dt-head"><span>Segment</span><span>ARR</span><span>% ARR</span><span>NRR</span><span>GRR</span></div>
    {rows.map((r) => (<div key={r.seg} className="dt-row">
      <span className="dt-seg">{r.seg}</span>{num(r.arr)}<span className="dt-num dim">{((r.arr.value / total) * 100).toFixed(0)}%</span>{num(r.nrr)}{num(r.grr)}
    </div>))}
    <div className="dt-row dt-total"><span className="dt-seg">Total</span><span className="dt-num">{fmtM(total)}</span><span className="dt-num dim">100%</span>{num(bNrr)}{num(bGrr)}</div>
  </div>);
}
// §1d: every panel is traceable — the conditional trace taught the reader that some values weren't.
// It was conditional because only single-canonical-value charts (line/combo/waterfall/lorenz) had an
// obvious "the value" (the last point); multi-value panels (bars, matrix, scatter…) had no single node
// so trace was omitted. Now every panel traces: single-value panels their value; multi-value panels a
// representative value that stands for the panel (the drawer opens its full provenance tree). The two
// component panels (matrix, table) build their own data — they fall back to the blended-NRR headline.
function panelTrace(w) {
  const d = w.data || {};
  const lastMv = (a) => (a && a.length && a[a.length - 1] ? a[a.length - 1].mv : null);
  if (d.mv) return d.mv;
  if (d.line) return lastMv(d.line);
  if (d.series && d.series.length) {
    const s = d.series;
    if (s[0] && s[0].mv) return lastMv(s);            // flat points array (line): its own last value
    if (s[0] && s[0].points) return lastMv(s[0].points);  // series-of-series (stacked_area, indexed…)
  }
  if (d.items) { const it = d.items.find((x) => x && x.mv); if (it) return it.mv; }
  if (d.points) { const p = d.points.find((x) => x && x.mv); if (p) return p.mv; }
  try { const Q = E.QUARTERS; return E.nrr(null, Q[Q.length - 5], Q[Q.length - 1]); } catch { return null; }
}
function Widget({ id, catalog, onPick, dim }) {
  const w = catalog[id]; if (!w) return null; const d = w.data;
  if (w.kind === "callout") return <Callout mv={d.mv} onPick={(mv) => onPick({ node: mv })} />;
  const tn = panelTrace(w);
  const onTrace = tn ? () => onPick({ node: tn }) : undefined;
  if (w.kind === "combo") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={onTrace} /><Fill render={(cw, ch) => <Combo bars={d.bars} line={d.line} benchmark={d.benchmark} good={d.good} fmtL={(v) => fmtM(v)} fmtR={(v) => `${v.toFixed(2)}x`} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "line") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={onTrace} /><Fill render={(cw, ch) => <LineChart series={d.series} benchmark={d.benchmark} good={d.good} fmt={d.fmt} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "stacked_area") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={onTrace} /><Fill render={(cw, ch) => <StackedArea quarters={E.QUARTERS} series={d.series} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "matrix") return (<div className="tpanel"><ChartHeader title="Metrics by quarter" onTrace={onTrace} /><MetricMatrix onPick={onPick} /></div>);
  if (w.kind === "hbar") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={onTrace} /><Fill render={(cw, ch) => <HBar items={d.items} benchmark={d.benchmark} fmt={d.fmt} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "bullet") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={onTrace} /><Fill render={(cw, ch) => <BulletPanel items={d.items} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "table") return (<div className="tpanel"><ChartHeader title="Segment breakdown" onTrace={onTrace} /><SegmentTable onPick={onPick} /></div>);
  if (w.kind === "waterfall") return (<div className="cpanel"><ChartHeader title={d.title} tag={`NRR ${d.bridge.nrr.toFixed(0)}%`} tagTone={d.bridge.nrr >= 100 ? "good" : "bad"} onTrace={onTrace} /><Fill render={(cw, ch) => <Waterfall c={d.bridge} w={cw} h={ch} />} /></div>);
  if (w.kind === "scatter") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={onTrace} /><Fill render={(cw, ch) => <Scatter points={d.points} xlab={d.xlab} ylab={d.ylab} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "pareto") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={onTrace} /><Fill render={(cw, ch) => <Pareto items={d.items} fmt={d.fmt} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "heatmap") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={onTrace} /><Fill render={(cw, ch) => <Heatmap rows={d.rows} cols={d.cols} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "indexed") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={onTrace} /><Fill render={(cw, ch) => <IndexedLine series={d.series} quarters={d.quarters} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "dumbbell") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={onTrace} /><Fill render={(cw, ch) => <Dumbbell items={d.items} fmt={d.fmt} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "treemap") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={onTrace} /><Fill render={(cw, ch) => <Treemap items={d.items} fmt={d.fmt} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "lorenz") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={onTrace} /><Fill render={(cw, ch) => <LorenzCurve curve={d.curve} onPick={() => onPick({ node: d.mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "grouped") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={onTrace} /><Fill render={(cw, ch) => <GroupedBar groups={d.groups} keys={d.keys} colors={d.colors} fmt={d.fmt} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "quadrant") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={onTrace} /><Fill render={(cw, ch) => <Quadrant points={d.points} xlab={d.xlab} ylab={d.ylab} xbench={d.xbench} ybench={d.ybench} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
  if (w.kind === "small_multiples") return (<div className="cpanel"><ChartHeader title={d.title} onTrace={onTrace} /><Fill render={(cw, ch) => <SmallMultiples series={d.series} onPick={(mv) => onPick({ node: mv })} w={cw} h={ch} />} /></div>);
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




// ================= composition rendering =================
function Block({ block, catalog, onPick, dim, source }) {
  const hasFrame = block.headline || block.soWhat;
  return (<div className={`block emph-${block.emphasis}`}>
    {hasFrame && <div className="frame"><span className="frame-tick">{source === "live" ? "curated" : "deterministic"}</span>{block.headline && <span className="frame-h">{block.headline}</span>}{block.soWhat && <span className="frame-sw">{block.soWhat}</span>}</div>}
    <Widget id={block.widget} catalog={catalog} onPick={onPick} dim={dim} />
  </div>);
}
// ===== Stage D, §6 — the audit selector. Each slot exposes the forms the model was OFFERED for this
// board's finding and did NOT take: offeredWidgets minus what's rendered — the SINGLE SOURCE the
// offer/admit fix established. It is NOT re-filtered by domain: the model chose across the whole offer,
// so re-scoping by the chosen form's domain would understate its actual choice (and diverge from the
// one menu the model saw). The finding's salience (z · rank) is shown ONCE in the header — it's the
// finding's score, identical for every form, so it can't discriminate the rows. Each row carries only
// what DIFFERS: the reason it wasn't chosen, ENGINE-DERIVED (never model-authored — a post-hoc
// rationale is confabulation, exactly what the guards catch). The reason NAMES the specific overlap:
// which metrics an alternative re-renders and which already-chosen panel shows them.
// The metrics each form actually renders (used to (a) rank the finding via its primary metric, and
// (b) compute the specific metric overlap that discriminates the reasons).
const WIDGET_METRICS = {
  masking_card: ["nrr"], salient_band: ["nrr"],
  bridge_smb: ["nrr"], bridge_enterprise: ["nrr"], bridge_blended: ["nrr"], hbar_nrr: ["nrr"],
  dumbbell_ret: ["nrr", "grr"], heatmap_retention: ["nrr", "grr"],
  efficiency_combo: ["magic"], magic_line: ["magic"], efficiency_bullets: ["magic", "cac", "r40"],
  scatter_eff_growth: ["magic", "qoq"], heatmap_metrics: ["magic", "cac", "r40", "grossMargin"], quadrant_eff: ["magic", "qoq"],
  metric_matrix: ["nrr", "grr", "grossMargin", "magic", "cac", "r40", "qoq"],
  accel_line: ["qoq"],
  segment_stack: ["arr"], indexed_arr: ["arr"], grouped_growth: ["arr"], small_mult_arr: ["arr"],
  segment_table: ["arr", "nrr", "grr"], pareto_arr: ["arr"], treemap_arr: ["arr"], lorenz_arr: ["arr"],
};
const METRIC_LABEL = { nrr: "NRR", grr: "GRR", grossMargin: "gross margin", magic: "magic number", cac: "CAC payback", r40: "Rule of 40", qoq: "QoQ growth", arr: "ARR", winRate: "win rate" };
// the matrix/table forms render their title from a fixed ChartHeader string, not catalog.data.title —
// mirror it so the reasons name the panel the way it reads on the board.
const WIDGET_TITLE = { metric_matrix: "Metrics by quarter", segment_table: "Segment breakdown" };
const widgetLabel = (catalog, id) => (catalog[id] && catalog[id].data && catalog[id].data.title) || WIDGET_TITLE[id] || (catalog[id] && catalog[id].title) || id;
const joinList = (a) => (a.length <= 1 ? (a[0] || "") : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(", ")}, and ${a[a.length - 1]}`);
function buildAudit(finding, catalog, panels) {
  let ranked = [];
  try { ranked = E.computeSalience(); } catch { ranked = []; }
  const primaryMetric = (id) => (WIDGET_METRICS[id] || [])[0] || null;
  const salOf = (id) => { const m = primaryMetric(id); if (!m) return null; const idx = ranked.findIndex((f) => f.metric === m); return idx >= 0 ? { rank: idx + 1, z: ranked[idx].z } : null; };
  let offered = [];
  try { offered = offeredWidgets(E.findingNeighborhood(finding), catalog); } catch { offered = []; }
  const selected = panels.map((p) => p.widget), selectedSet = new Set(selected);
  return panels.map((p) => {
    const chosen = p.widget, dom = WIDGET_DOMAIN[chosen], cSal = salOf(chosen);
    const others = selected.filter((sid) => sid !== chosen);   // the OTHER panels already on the board
    const alts = offered
      .filter((id) => !selectedSet.has(id) && catalog[id] && catalog[id].kind !== "finding_card")
      .map((id) => {
        const aMetrics = WIDGET_METRICS[id] || [], aSal = salOf(id), lbl = (a) => joinList(a.map((m) => METRIC_LABEL[m] || m));
        // the board panel (incl. this slot's own chosen form) that already shows the MOST of this
        // form's metrics, and the metrics NO board panel shows. Naming both — the redundant overlap AND
        // the unique addition — is what discriminates forms that share a redundancy but differ in
        // content (naming only the overlap collapses same-domain forms to the shared metric).
        let best = null; const shown = new Set();
        for (const sid of selected) { const overlap = aMetrics.filter((m) => (WIDGET_METRICS[sid] || []).includes(m)); overlap.forEach((m) => shown.add(m)); if (overlap.length && (!best || overlap.length > best.overlap.length)) best = { panel: sid, overlap }; }
        const unshown = aMetrics.filter((m) => !shown.has(m));
        let reason;
        if (best && unshown.length === 0) reason = best.panel === chosen
          ? `narrower than the selected form — '${widgetLabel(catalog, chosen)}' renders ${lbl(best.overlap)}`
          : `re-renders ${lbl(best.overlap)}, already shown by '${widgetLabel(catalog, best.panel)}'`;
        else if (best) reason = `re-renders ${lbl(best.overlap)} (on '${widgetLabel(catalog, best.panel)}'); adds ${lbl(unshown)}, not otherwise on the board`;
        else if (aSal && cSal && aSal.rank > cSal.rank) reason = `lower salience rank (#${aSal.rank}) than the selected form (#${cSal.rank})`;
        else { const ad = WIDGET_DOMAIN[id]; const sd = others.find((sid) => WIDGET_DOMAIN[sid] === ad); reason = sd ? `same domain (${ad}) as '${widgetLabel(catalog, sd)}', already chosen` : "no structural reason — the model preferred this form"; }
        return { id, label: widgetLabel(catalog, id), reason };
      });
    return { chosen, chosenLabel: widgetLabel(catalog, chosen), chosenSal: cSal, domain: dom, alts };
  });
}
const fmtSal = (s) => (s ? `z ${s.z.toFixed(2)} · rank #${s.rank}` : "unranked");
// One board slot: the chosen form (or the user's transient swap), its source line (§4), and the
// register-built audit affordance (NOT a native <select>). The affordance carries --dye in the trace
// form (▸ ALTERNATIVES) — a deliberate broadening: dye routes to provenance, whether of a VALUE (trace)
// or of a PANEL'S PRESENCE (the alternatives it was chosen over). The alternatives panel fully covers
// the slot (permitted); its own header carries the close. A swap only re-renders THIS slot; it never
// touches the curation stats, so the rail's "the model chose N" stays true regardless of exploration.
function TbPanel({ slot, swappedId, onSwap, onRevert, catalog, onPick, sourceRows }) {
  const [open, setOpen] = useState(false);
  const activeId = (swappedId && swappedId !== slot.chosen) ? swappedId : slot.chosen;
  const swapped = activeId !== slot.chosen;
  return (<div className="tb-panel">
    <div className="tb-panel-body"><Widget id={activeId} catalog={catalog} onPick={onPick} dim={null} /></div>
    {open && <div className="audit-panel">
      <div className="audit-head">
        <div className="audit-head-top">
          <span className="audit-head-l">this slot's finding · {fmtSal(slot.chosenSal)}</span>
          <button className="audit-close" onClick={() => setOpen(false)}>▾ close</button>
        </div>
        <span className="audit-sub">model chose {slot.chosenLabel} · {slot.alts.length} form{slot.alts.length > 1 ? "s" : ""} offered and not taken · engine-derived reasons only</span>
      </div>
      {slot.alts.map((a) => (
        <button key={a.id} className={`audit-alt ${activeId === a.id ? "on" : ""}`} onClick={() => { onSwap(a.id); setOpen(false); }}>
          <span className="audit-alt-label">{a.label}</span>
          <span className="audit-alt-reason">{a.reason}</span>
        </button>
      ))}
    </div>}
    {swapped && <div className="audit-swapped"><span className="audit-swapped-lbl">viewing alternative</span><button className="audit-revert" onClick={onRevert}>model chose {slot.chosenLabel} · revert ›</button></div>}
    <div className="panel-foot">
      <span className="src-note">{slot.domain} · {sourceRows.toLocaleString()} source rows</span>
      {slot.alts.length > 0 && <button className="audit-toggle" onClick={() => setOpen(true)}>▸ alternatives · {slot.alts.length}</button>}
    </div>
  </div>);
}
// Tuning 2, Stage A: fixed composition. The board is a lede row over three equal chart slots.
// composeBoard (src/layout.ts) returns the lede finding-card + the model's chart/table panels in
// model order, capped at three, with NO menu top-up — the rendered panel count equals the model's
// selection. The §1e lattice is preserved: the lede band is a section (a single --scribe-strong rule
// below it), the three slots are a gap-as-rule grid (--scribe ground shows through the 1px gaps).
// Swap state is transient exploration, reset by a keyed remount on role toggle / perturb (AppInner).
function TemplateBoard({ spec, role, catalog, onPick, finding, source, curation }) {
  const { panels } = composeBoard(spec, catalog);   // finding_card excluded from panels; the lede row renders it
  const [swaps, setSwaps] = useState({});           // slotIndex -> alternative widget id (per-slot, transient)
  const audit = useMemo(() => (finding ? buildAudit(finding, catalog, panels) : []), [finding, spec, catalog]);   // eslint-disable-line
  const sourceRows = BASE_DS ? (BASE_DS.facts.customers.length + BASE_DS.facts.opex.length + BASE_DS.facts.opportunities.length) : 0;
  return (<div className="board">
    {finding && <div className="board-band"><Lede finding={finding} source={source} curation={curation} role={role} onPick={onPick} /></div>}
    <div className="partition">
      {panels.map((block, i) => (
        <TbPanel key={i}
          slot={audit[i] || { chosen: block.widget, chosenLabel: widgetLabel(catalog, block.widget), chosenSal: null, domain: WIDGET_DOMAIN[block.widget] || "", alts: [] }}
          swappedId={swaps[i]} onSwap={(id) => setSwaps((s) => ({ ...s, [i]: id }))} onRevert={() => setSwaps((s) => { const n = { ...s }; delete n[i]; return n; })}
          catalog={catalog} onPick={onPick} sourceRows={sourceRows} />
      ))}
    </div>
  </div>);
}
// Stage C — the lede. Prose left, evidence figures right. Authorship is carried by the LABEL ALONE
// (MODEL-AUTHORED / DETERMINISTIC) — the ground is always --field; the --plane channel was removed so
// there is no second signal that could disagree with the label. The deterministic lede STATES the
// finding (value/benchmark/direction/duration, with each figure dye-scribed to its source); the model
// lede INTERPRETS (numeral-free — its figures live in the evidence column). They differ in kind.
// ONE substitution layer for both paths. The thesis/why are TOKEN TEMPLATES — plain words with {tokens}
// the engine owns. Each {token} is substituted with its value+unit and dye-scribed to its trace (a
// route-to-source, not emphasis); the model authors the words, the engine authors every figure. The
// deterministic ledeFacts template and the model's thesis both render through here — same rendering,
// only authorship differs. An unknown token (should never survive validation) renders as literal text.
function Substitute({ template, tokens, onPick }) {
  if (!template) return null;
  const parts = String(template).split(/(\{[a-z0-9_]+\})/gi);
  return (<>{parts.map((part, i) => {
    const m = part.match(/^\{([a-z0-9_]+)\}$/i);
    if (m && tokens && tokens[m[1]]) {
      const tok = tokens[m[1]];
      const node = (() => { try { return E.store.get(tok.nodeId); } catch { return null; } })();
      return <button key={i} className="dye-scribe" onClick={() => node && onPick({ node })}>{tok.value}</button>;
    }
    return part ? <React.Fragment key={i}>{part}</React.Fragment> : null;
  })}</>);
}
// INVARIANT: identical skeleton in both states. Every block below renders in live AND fallback — only
// the authorship LABEL and the block CONTENTS differ; the ground is --field either way. No block is
// gated on source; the deterministic path fills the same pair (thesis + why) the model path fills.
function Lede({ finding, source, curation, role, onPick }) {
  // falsifiers promoted from the retired read modal: run in place at the foot of the prose column, the
  // aggregate riding the authorship label. Verdicts are transient — Lede remounts (keyed TemplateBoard)
  // on role/perturb/finding, resetting them. Hooks run unconditionally; the no-finding guard is below.
  const [verdicts, setVerdicts] = useState({});
  if (!finding) return null;
  const isModel = source === "live" && curation && curation.thesis;
  const facts = ledeFacts(finding);
  const tokens = ledeTokens(finding);
  // both paths carry a token template in curation.thesis (model prose, or the deterministic ledeFacts
  // template via fallbackCuration); the same Substitute layer renders + dye-scribes either.
  const thesisTemplate = (curation && curation.thesis) || (facts && facts.template) || finding.label;
  const why = (curation && curation.whyRole) || (facts && facts.enumeration) || "";
  // anchor first (the frame marks it), so its evidence card carries the hero figure; then the read's
  // other values. The anchor is the finding's SEMANTIC subject (findingAnchorId), not the positional
  // finding.mvs[0] — for a concentration finding that is the share metric, not the first segment.
  const anchorId = findingAnchorId(finding);
  const rawIds = curation && curation.evidenceIds && curation.evidenceIds.length ? curation.evidenceIds : (finding.mvs || []).map((m) => m.id);
  const evIds = [anchorId, ...rawIds.filter((id) => id !== anchorId)].filter(Boolean);
  const evidence = evIds.map((id) => { try { return E.store.get(id); } catch { return null; } }).filter(Boolean).slice(0, 4);
  // the read's falsifiers (same set the modal showed) — a run replaces the question with its verdict.
  const tests = ((curation && curation.testIds) || []).map((id) => E.TEST_MENU.find((t) => t.id === id)).filter(Boolean);
  const runFalsifier = (t) => setVerdicts((v) => ({ ...v, [t.id]: E.runTest({ kind: t.kind, metric: t.metric, dim: t.dims && t.dims[0] }) }));
  // aggregate = WORST CASE over the tests run: any weakener → WEAKENED; else if any ran → HOLDS; else UNTESTED.
  const ran = tests.map((t) => verdicts[t.id]).filter(Boolean);
  const aggregate = ran.length === 0 ? "untested" : ran.some((r) => r.verdict === "uniform") ? "weakened" : "holds";
  return (<div className="lede">
    <div className="lede-prose">
      <span className="lede-ground">{isModel ? "model-authored" : "deterministic"} · {aggregate}</span>
      <p className="lede-sentence"><Substitute template={thesisTemplate} tokens={tokens} onPick={onPick} /></p>
      <span className="lede-why-lbl">Why it matters for the {role}</span>
      <p className="lede-why"><Substitute template={why} tokens={tokens} onPick={onPick} /></p>
      {tests.length > 0 && <span className="lede-tests-lbl">What would change this read — model-proposed, engine-run</span>}
      {tests.length > 0 && <div className="lede-tests">
        {tests.map((t) => {
          const r = verdicts[t.id];
          // BEFORE: proposition (action) + a right-aligned run affordance; the whole row is the target
          // (a <button>), the affordance is the discoverability signal. AFTER: statement (prose) + the
          // verdict (value 20/700) in the affordance's slot. The verdict does NOT route — runTest returns
          // a computed adjudication, not a traceable node — so it carries no --dye; weight + position mark
          // it engine-run against the model-proposed question (the lede's authorship split).
          return r
            ? <div key={t.id} className="lede-test ran"><span className="lede-answer">{r.summary}</span><span className="lede-verdict">{r.verdict.charAt(0).toUpperCase() + r.verdict.slice(1)}</span></div>
            : <button key={t.id} className="lede-test" onClick={() => runFalsifier(t)}><span className="test-q">{t.label}</span><span className="test-run">run test ▸</span></button>;
        })}
      </div>}
    </div>
    <div className="lede-figures">
      {evidence.map((mv, i) => <EvidenceCard key={i} mv={mv} onPick={onPick} anchor={i === 0} />)}
    </div>
  </div>);
}

// ================= Tuning 5/5a/6 — the curation window =================
// Between picking a role and seeing a board, the engine has ALREADY finished: the findings, the salience
// ranking and the row count all exist before the model call goes out. What is pending is only the model
// CHOOSING which of them this role should see — so this window makes THAT the message, through three
// terminal states (waiting · failure · success). The RULE (5a): a pending state fills the region whose
// content it is waiting for — never a shell with reserved gaps. It renders in the SAME composition in both
// placements (Tuning 6 + revision): the entry composition (wordmark · statement · role rows · window),
// so the entry (FIRST curation) and the board region (RE-curation) differ only by the rail's presence and
// the footer's contents. §6 motion: on click a hairline --ink segment sweeps the rule beneath the chosen
// row (the window's top edge) — fast first pass (~400ms), then a slow ~2s loop until resolve; the window
// arrives in the sweep's wake (keyed to the first pass completing); the unchosen row recedes then collapses
// (entry) / the stale board fades (board). The chosen row STAYS and confirms the choice (§6.1 supersedes
// the old role-name line — the window carries only label + prose). Every figure is engine-known; NOTHING
// here reads the model's curation (assertion #22 proves it).
const SWEEP_FIRST_MS = 400;   // the connective first pass — its completion delivers the window
function engineWindowFacts() {
  let findings = 0, domains = 0, rows = 0;
  try { const fs = E.computeSalience() || []; findings = fs.length; domains = new Set(fs.map((f) => { try { return E.findingNeighborhood(f).domain; } catch { return null; } }).filter(Boolean)).size; } catch {}
  try { rows = BASE_DS ? (BASE_DS.facts.customers.length + BASE_DS.facts.opex.length + BASE_DS.facts.opportunities.length) : 0; } catch {}
  return { findings, domains, rows };
}
// The window BLOCK: its top edge is the rule beneath the chosen row, which carries the sweep (the ink
// draws over ~400ms, then loops). The label + prose are ALWAYS in the DOM (never conditionally rendered —
// that cannot animate) inside .lede-window-body, which crossfades UP (height 0→full + opacity) as the row
// exits. `drawn` only flips the sweep first-pass → loop; it does not gate the content. No role name.
function CurationWindow({ mode }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), SWEEP_FIRST_MS); return () => clearTimeout(t); }, []);
  const failed = mode === "failed";
  const { findings, domains, rows } = engineWindowFacts();
  const label = failed ? "engine complete · model unavailable" : "engine complete · model composing";
  const prose = failed
    ? "The numbers are unaffected — the engine computed them. This is a captured deterministic arrangement, and every value still traces to its source rows."
    : `${findings} findings across ${domains} domains, computed from ${rows.toLocaleString()} rows. The model is choosing which of them this role should see.`;
  return (<div className="lede-window">
    <span className="sweep" aria-hidden="true"><span className={`sweep-seg ${drawn ? "" : "first"}`} /></span>
    <div className="lede-window-body">
      <span className="lede-ground">{label}</span>
      <p className="lede-window-prose">{prose}</p>
    </div>
  </div>);
}
// The shared composition (wordmark · statement · role rows). Idle: two role buttons. During a curation
// (windowMode set): the chosen row stays; the window crossfades in beneath its rule; and — in the entry
// placement — the unchosen row EXITS (height→0 + opacity→0) and UNMOUNTS only after its animation ends
// (nothing unmounts mid-transition). In the board placement there is no unchosen row (the stale board fades
// instead). Iterating roles in order places the window directly after the chosen row, so the chosen row's
// rule is the window's top edge in both cases (CFO: unchosen exits below; CRO: above, lifting the rule up).
function RoleComposition({ role, windowMode, onEnter, placement }) {
  const [rowGone, setRowGone] = useState(false);
  return (<div className="entry">
    <div className="entry-mark">⟡ CALIPER</div>
    <div className="entry-sub">
      <p className="entry-line">Caliper Systems — a synthetic ~$40M ARR vertical SaaS; the engine has computed the quarter.</p>
      <p className="entry-line">Enter as a role; the board leads with what you're accountable for, from one set of findings.</p>
    </div>
    <div className="entry-roles">
      {!windowMode
        ? Object.entries(ROLES).map(([k, r]) => (<button key={k} className="role" onClick={() => onEnter(k)}><span className="role-k">{k}</span><span className="role-f">{r.focus}</span></button>))
        : Object.keys(ROLES).map((k) => k === role
            ? <React.Fragment key={k}>
                <div className="role role-chosen"><span className="role-k">{k}</span><span className="role-f">{ROLES[k].focus}</span></div>
                <CurationWindow mode={windowMode} />
              </React.Fragment>
            : (placement === "entry" && !rowGone
                ? <div key={k} className="role role-exiting" aria-hidden="true" onAnimationEnd={() => setRowGone(true)}>
                    <div className="role-inner"><span className="role-k">{k}</span><span className="role-f">{ROLES[k].focus}</span></div>
                  </div>
                : null))}
    </div>
  </div>);
}
// The entry screen — a fixed composition; the FIRST curation renders the window in the role-row slot via
// RoleComposition, and the wordmark/statement/footer persist (the page does not jump).
function EntryScreen({ onEnter, windowMode, role }) {
  let quarters = 0, rows = 0;
  try { quarters = E.QUARTERS.length; } catch {}
  try { rows = BASE_DS ? BASE_DS.facts.customers.length + BASE_DS.facts.opex.length + BASE_DS.facts.opportunities.length : 0; } catch {}
  return (<div className="entry-shell">
    <RoleComposition role={role} windowMode={windowMode} onEnter={onEnter} placement="entry" />
    <footer className="rail-foot">
      <div className="foot-status"><span className="foot-src">⟡</span> {quarters} quarters · <b>{rows.toLocaleString()}</b> source rows · deterministic engine core</div>
    </footer>
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
  return (<div className="qbar"><input className="qin" value={v} placeholder="Ask or explore — “how is efficiency?” or “what’s SMB’s magic number?”" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} /><button className="qbtn" disabled={busy || !v.trim()} onClick={go}>{busy ? "…" : "Map"}</button></div>);
}
function QueryWidget({ desc, onPick }) {
  if (desc.kind === "callout") return (<div className="brief-ev"><EvidenceCard mv={desc.data.mv} onPick={onPick} /></div>);   // the answer's value card is the read modal's evidence card, exactly — one form for a traced value
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
  if (!d || !d.curation) return (<div className="dbg"><div className="dbg-h"><span className="dbg-title">CURATION LOG <span className="dbg-meta">no curation yet</span></span>{onClose && <button className="dbg-close" onClick={onClose}>✕</button>}</div></div>);
  const c = d.curation, v = d.violations || [];
  const isLive = c.source === "live";
  return (<div className="dbg">
    <div className="dbg-h"><span className="dbg-title">CURATION LOG · {d.role} <span className="dbg-meta">source: {c.source}{d.model ? ` · ${d.model}` : ""} · {v.length} validator action(s)</span></span>{onClose && <button className="dbg-close" onClick={onClose}>✕</button>}</div>
    {v.length > 0 && <div className="dbg-rej">validator: {v.join(" · ")}</div>}
    <div className="dbg-cols">
      <div className="dbg-col"><div className="dbg-cap">① {isLive ? "model proposed (judgment)" : "deterministic fallback — no model"}</div><pre className="dbg-pre">{JSON.stringify({ thesis: c.thesis, evidence: c.evidenceIds, tests: c.testIds, widgets: c.widgetIds }, null, 1)}</pre></div>
      <div className="dbg-col"><div className="dbg-cap">② engine enforced (truth)</div><pre className="dbg-pre">{`evidence:  ${c.evidenceIds.length} values, every one traceable
tests:     ${c.testIds.length} (${c.testIds.length ? "incl. falsifier" : "none"})
widgets:   ${c.widgetIds.length} on-domain, engine-computed
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
// engine-resolved and traceable either way; two-mode cells show a parenthesised variance vs benchmark or a trend. =====
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
    <span className="kcell-l">{mv.label}{mv.epistemic === "proxy" && <sup className="proxy">a</sup>}</span>
    <span className="kcell-v">{disp}</span>
    {b ? <span className={`kcell-b ${tone}`}>{fmtVar(b, mv.unit)} vs {kpiThr(b, mv.unit)}</span>
      : res.trend ? <span className="kcell-b trend">{res.trend}</span> : null}
  </button>);
}
function Scorecard({ role, scorecardKeys, onPick }) {
  // Model-curated vital signs: the model selects role-aware headline metrics (cached in the
  // curation, so stable per finding+role — bounded, not re-rolled per render). Falls back to the
  // deterministic persona set only if curation is unavailable. Every cell engine-resolved + traceable.
  const set = (scorecardKeys && scorecardKeys.length ? scorecardKeys : (KPI_SET[role] || KPI_SET.CFO));
  const resolved = set.map((m) => resolveKpi(m)).filter(Boolean);
  // proxy footnote key (sup "a") stays on the cell label; the note itself renders in the footer band.
  return (<div className="scorecard">
    {resolved.map((res, i) => <KpiCell key={i} res={res} onPick={onPick} />)}
  </div>);
}

function QueryModal({ queries, onAsk, onClose, onPick, onRecurate, onAnswerFully, busy, aside }) {
  return (<div className={`qmodal-bg ${aside ? "aside" : ""}`} onClick={onClose}>
    <div className="qmodal" onClick={(e) => e.stopPropagation()}>
      <div className="qmodal-h"><span className="qmodal-t">Ask your data</span><button className="qmodal-x" onClick={onClose}>✕</button></div>
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
      // selected === the panels that actually render (bounded, no top-up), so the rail status is true
      const selected = composeBoard(spec, catalog).panels.length;
      const stats = { selected, candidates, evidence: (curation.evidenceIds || []).length, tests: (curation.testIds || []).length, rejected: (curation.violations || []).filter((v) => /drop|reject/.test(v)).length, rows };
      pushAudit({ kind: "curation", role: roleKey, finding: curation.finding ? curation.finding.label : "—", source: curation.source, detail: `chose ${stats.selected} panels, ${stats.evidence} evidence, ${stats.tests} tests · ${stats.rejected} rejected · ${(curation.violations || []).length} validator actions` });
      return { loading: false, curation, spec, stats, disclosure, source: curation.source, rejected: 0, framingRejected: (curation.violations || []).some((v) => v.includes("numeral")) ? 1 : 0, err: null, debug: { curation, violations: curation.violations, raw: curation._debug && curation._debug.raw, prompt: curation._debug && curation._debug.prompt, model: curation._debug && curation._debug.model, role: roleKey } };
    } catch (e) {
      return { loading: false, curation: null, spec: FALLBACK[roleKey], source: "fallback", rejected: 0, framingRejected: 0, err: String(e).slice(0, 120), debug: null };
    }
  }
  // Tuning 5 — the curation window's terminal transitions. A LIVE curation shows at once (success). A
  // FALLBACK shows the FAILURE state first — the strongest claim the artifact makes, delivered unprompted
  // at the moment of failure — then resolves to the fallback board on a ~3s timer. Self-guided beats a
  // click on an error path; ~3s is long enough to read and short enough not to feel like a wait, and a
  // repeat visitor (perturb) is not burdened by it, so the same duration/copy holds on repeat. We do NOT
  // render the deterministic board and swap it: the reflow would make the deterministic arrangement read
  // as a failure that got corrected, rather than as the legitimate one it is.
  const CURTAIN_MS = 3000;
  const BOARD_FADE_MS = 180;   // §6 re-curation: the stale board fades (invalidation) as the window arrives
  const curtainTimer = React.useRef(null);
  const fadeTimer = React.useRef(null);
  const clearCurtain = () => { if (curtainTimer.current) { clearTimeout(curtainTimer.current); curtainTimer.current = null; } };
  useEffect(() => () => { clearCurtain(); if (fadeTimer.current) clearTimeout(fadeTimer.current); }, []);
  // 5a — has a board ever been on screen this session? Decides the window's PLACEMENT: false → the FIRST
  // curation (entry composition); true → RE-curation (the board region). Set the moment any resolved board
  // commits; never reset (once a board has been shown, no later window can go back to the entry screen).
  const hadBoard = React.useRef(false);
  const lastResolved = React.useRef(null);   // the board still on screen when a re-curation begins — fades out
  const roleRef = React.useRef(role); roleRef.current = role;   // latest committed role, for the fading-board snapshot
  const [boardFading, setBoardFading] = useState(false);
  const showBoard = (next) => { hadBoard.current = true; lastResolved.current = { ...next, _role: roleRef.current }; setState(next); };
  // §6: on re-curation, the stale board fades (~180ms) as the window arrives in the sweep's wake. Only when
  // a board is actually on screen (hadBoard) — the first curation has no board to fade.
  const startBoardFade = () => { if (!hadBoard.current) return; setBoardFading(true); if (fadeTimer.current) clearTimeout(fadeTimer.current); fadeTimer.current = setTimeout(() => { fadeTimer.current = null; setBoardFading(false); }, BOARD_FADE_MS); };
  function resolveInto(next, cacheKey) {
    clearCurtain();
    if (cacheKey) cache.current[cacheKey] = next;
    if (next.source === "live") { showBoard(next); return; }
    setState({ loading: false, failing: true, curation: null, spec: null, stats: null, source: next.source, rejected: 0, framingRejected: 0, err: next.err, debug: next.debug });
    curtainTimer.current = setTimeout(() => { curtainTimer.current = null; showBoard(next); }, CURTAIN_MS);
  }
  async function enter(roleKey) {
    setRole(roleKey); setPicked(null); clearCurtain();
    if (cache.current[roleKey]) { showBoard(cache.current[roleKey]); return; }
    startBoardFade();   // re-curation from an existing board → fade it (no-op on the first curation)
    setState({ loading: true, failing: false, curation: null, spec: null, source: null, rejected: 0, framingRejected: 0, err: null, debug: null });
    const next = await buildCuratedState(roleKey, null);
    resolveInto(next, roleKey);
  }
  // Query-driven re-orientation to a chosen discovered finding — transient (not cached; role tabs
  // remain the "home" top-finding view). The user drives; the finding is always a real ranked one.
  // Same window/state machine as enter (a failed re-orient shows the failure state, then the fallback).
  async function recurate(targetFinding) {
    setPicked(null); setShowQuery(false); clearCurtain(); startBoardFade();
    setState((s) => ({ ...s, loading: true, failing: false }));
    const next = await buildCuratedState(role, targetFinding);
    resolveInto(next, null);
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

  // §1d: lock body scroll while any modal is open (read/query/trust/debug/trace); each modal scrolls
  // in its own body. Restores on close.
  const modalOpen = showQuery || showTrust || showDebug || !!picked;
  useEffect(() => {
    document.body.classList.toggle("modal-open", modalOpen);
    return () => document.body.classList.remove("modal-open");
  }, [modalOpen]);

  // §4 inspection rule: a modal is a deliberate change of WORKSPACE, and an open modal and a drawer
  // cannot coexist without the drawer's origin being obscured (modal-opens case) or destroyed
  // (modal-closes case). So the drawer closes on EITHER modal transition while it is open:
  //   • modal OPENS over a board-origin drawer → the origin would go under the scrim → close.
  //   • modal CLOSES under a drawer opened FROM it → the origin (a modal element) is destroyed → close.
  // The rule fires on the transition, not on every render, so a drawer opened FROM a modal survives its
  // own appearance (the modal is already open — no transition — when that drawer's `picked` is set), and
  // only closes when the modal itself later goes away. Given the opens-case, any drawer alive alongside a
  // modal necessarily has its origin inside that modal, so the closes-case has nothing else to catch.
  const anyModal = showQuery || showTrust || showDebug;
  const prevAnyModal = React.useRef(false);
  useEffect(() => {
    if (anyModal !== prevAnyModal.current && picked) setPicked(null);
    prevAnyModal.current = anyModal;
  }, [anyModal, picked]);

  // Suspend chart measurement while the drawer's board-compress runs — the flex reflow would fire every
  // chart's ResizeObserver each frame (per-frame SVG re-render = the drawer-open jank). Resume + re-measure
  // once when the compression ENDS — keyed to the board-compress `animationend` (bubbles to .workarea),
  // not a timer. Only on the closed→open transition (a re-trace while open causes no compression). Under
  // reduced motion there is no animation (and no storm), so we skip. The cleanup resumes on close/interrupt
  // (the board expands in a single reflow — one re-measure, not a per-frame storm; see the §close report).
  // …and dim the chart panels (.compressing) for the same window, so the one true-size re-render pops UNDER
  // a fade: dim as the compression starts, resume + un-dim (opacity returns over --dur-fast) on animationend.
  const measureWasOpen = useRef(false);
  const [compressing, setCompressing] = useState(false);
  useEffect(() => {
    const wasOpen = measureWasOpen.current;
    measureWasOpen.current = !!picked;
    if (!picked || wasOpen) return;
    if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    suspendMeasure(); setCompressing(true);
    const wa = document.querySelector(".workarea");
    const onEnd = (e) => { if (e.animationName === "board-compress") { resumeMeasure(); setCompressing(false); } };
    if (wa) wa.addEventListener("animationend", onEnd);
    return () => { if (wa) wa.removeEventListener("animationend", onEnd); resumeMeasure(); setCompressing(false); };
  }, [picked]);

  // §4 — the drawer (the sole INSPECTION surface) marks its ORIGIN by INTENSIFYING that element's own
  // traceable affordance — it never draws a boundary the element does not already have. The mark is
  // CSS-POSITIONED via an `.is-origin` class on the origin element itself (no fixed overlay, no rAF, no
  // getBoundingClientRect) — so it moves WITH the element as the board compresses, and it survives
  // re-renders and works inside a modal. Per type: a LATTICE cell (evidence/KPI/table/callout) and the
  // fallback PANEL intensify their enclosing rule with a 2px --dye box (CSS box-shadow); a dye-scribed
  // figure thickens its underline; a ▸ TRACE label goes 600; an in-chart mark takes --dye. ONE marker at a
  // time: if the origin IS the lede anchor, its 2px --ink border is suppressed (.origin-anchor root class)
  // so only the --dye box shows. FALLBACK: a chart mark that cannot carry a legible --dye recolor (a per-
  // series inline style={{fill}} beats the CSS — indexed/small_multiples/treemap/grouped/stacked_area — or
  // a non-terminal invisible hit-target) marks its smallest enclosing ruled region: the chart panel's box.
  const originRef = useRef(null);
  const [originIsAnchor, setOriginIsAnchor] = useState(false);
  const LATTICE_ORIGIN = ["ev-card", "kcell", "mx-cell", "dt-num", "callout"];
  const RECOLORABLE_MARK = ["cx-dot", "scat-dot", "par-cum-dot", "cx-dlab", "dlab"];   // marks the .ln-pt.is-origin --dye recolor reaches
  const recordOrigin = (e) => { const t = e.target && e.target.closest ? (e.target.closest("button, .ln-pt") || e.target) : null; if (t && t.getBoundingClientRect) originRef.current = t; };
  useLayoutEffect(() => {
    if (!picked) { setOriginIsAnchor(false); return; }
    const el = originRef.current;
    if (!el || !el.classList) { setOriginIsAnchor(false); return; }
    // decide which element carries the mark: a lattice cell marks itself; a chart mark that can't take a
    // legible dye recolor marks its enclosing panel; everything else marks itself.
    let target = el, anchor = false;
    if (LATTICE_ORIGIN.some((c) => el.classList.contains(c))) { anchor = el.classList.contains("anchor"); }
    else {
      const isAffordance = el.classList.contains("dye-scribe") || el.classList.contains("chart-title");
      const recolorable = RECOLORABLE_MARK.some((c) => el.classList.contains(c) || (el.querySelector && el.querySelector("." + c)));
      // the smallest enclosing RULED region is the board lattice cell (.tb-panel); fall back to the chart
      // container (.cpanel/.tpanel) only when there is no lattice cell (a chart inside a modal).
      if (!isAffordance && !recolorable) target = (el.closest && (el.closest(".tb-panel") || el.closest(".cpanel, .tpanel"))) || null;
    }
    setOriginIsAnchor(anchor);
    if (!target || !target.classList) return;
    target.classList.add("is-origin");
    return () => target.classList.remove("is-origin");
  }, [picked, showQuery]);

  // 5a — the window's placement. The FIRST curation (no board shown yet) takes over the entry
  // composition, in the role-row slot; every later window (re-curation) fills the board region instead.
  const windowActive = state.loading || state.failing;
  const windowMode = state.failing ? "failed" : "waiting";
  const firstCuration = windowActive && !hadBoard.current;
  if (!role || firstCuration) return (<div className="caliper"><EntryScreen onEnter={enter} windowMode={firstCuration ? windowMode : null} role={role} /></div>);

  // Proxy footnote lifted to the footer band (was a line inside the scorecard). Resolve the same
  // scorecard set the Scorecard renders, and pull the one proxy metric's disclosure note.
  const scSet = (state.curation && state.curation.scorecardKeys && state.curation.scorecardKeys.length) ? state.curation.scorecardKeys : (KPI_SET[role] || KPI_SET.CFO);
  // the proxy note references a KPI cell — pending while the strip is (window + failure curtain).
  const footNote = windowActive ? null : scSet.map((m) => resolveKpi(m)).filter(Boolean).find((r) => r.mv.epistemic === "proxy" && r.mv.note);
  // Tuning 5 — the footer's three groups, treated separately: (1) engine-known facts (row count ·
  // quarters · segments) present from the shell's first frame; (2) the static route to the governing
  // contract; (3) the model-dependent counts, which render ONLY once curation resolves — a count not yet
  // known is unknown, not zero, so nothing model-derived shows during the window.
  const quarters = (() => { try { return E.QUARTERS.length; } catch { return 0; } })();
  const segments = (() => { try { return E.SEGMENTS.length; } catch { return 0; } })();
  const rows = (() => { try { return BASE_DS ? BASE_DS.facts.customers.length + BASE_DS.facts.opex.length + BASE_DS.facts.opportunities.length : 0; } catch { return 0; } })();
  const resolved = !state.loading && !state.failing;
  // The proxy note splits: the CAVEAT (why it's a proxy) stays in the footer; the FORMULA moves into the
  // Trust panel's data-contract section, where a proxy's construction belongs. mv.note is "<formula>;
  // <caveat>" — split on the ";" (engine string is not touched; this is a presentation split).
  const proxy = footNote ? (() => { const [formula, caveat] = footNote.mv.note.split(";").map((s) => s.trim().replace(/\.$/, "")); return { label: footNote.mv.label, formula, caveat }; })() : null;

  return (
    <div className={`caliper has-rail ${originIsAnchor ? "origin-anchor" : ""}`} onClickCapture={recordOrigin}>
      {/* one scrim at the app root — only while a MODAL is open (a board-origin drawer keeps the board lit) */}
      {(showQuery || showTrust || showDebug) && <div className="scrim" />}

      {/* full-height left rail — Strata grammar: primary at the top, secondary at the bottom, empty between */}
      <nav className="rail">
        <div className="rail-mark" title="Caliper">⟡</div>
        {/* Top = the view parameter (which role's board). Bottom = ACTIONS on the current board, in an
            escalating order — read the model's conclusion, interrogate it, then change the data underneath
            and watch it re-derive; each is a larger claim than the one before. (Re-curate was removed: at
            5 runs/role it showed no panel variation, and the alternatives selector now carries that
            demonstration. The curation log folded into the Trust panel; the contract is reached from the
            footer claim.) */}
        <div className="rail-grp rail-top">
          {Object.keys(ROLES).map((k) => <button key={k} className={`railbtn lens ${k === role ? "on" : ""}`} onClick={() => enter(k)}>{k}</button>)}
        </div>
        <div className="rail-grp rail-bottom">
          <button className="railbtn" onClick={() => setShowQuery(true)} title="ask your data">Ask data</button>
          <button className={`railbtn ${perturbation ? "on" : ""}`} onClick={() => perturbation ? resetPerturbation() : applyPerturbation("improve_cac")} title="perturb the data — watch the finding re-derive">Shift data</button>
        </div>
      </nav>

      <div className="frame-main">
        {/* the perturb banner states engine-known, already-true state (like the footer's engine facts), so
            it PERSISTS through the re-curation window in its normal position (renders at click, not resolve)
            and does not move when the board arrives. */}
        {perturbation && <div className="perturb-banner"><span className="pb-tag">DATA PERTURBED</span><span className="pb-lbl">{PERTURBATIONS[perturbation].label}</span><span className="pb-note">{PERTURBATIONS[perturbation].note} The engine recomputed salience from the changed data — the finding you see below re-derived on its own, no code change.</span><button className="pb-reset" onClick={resetPerturbation}>reset data ›</button></div>}

        {showDebug && <div className="brief-overlay"><DebugPanel d={state.debug} onClose={() => setShowDebug(false)} /></div>}

        {/* §6 RE-curation: the window mirrors the entry composition (measure, centring, block, vertical
            position) — the two states differ only by the rail and the footer's contents. The stale board
            fades (invalidation) as the window arrives in the sweep's wake. */}
        {windowActive ? <div className="recuration">
          {boardFading && lastResolved.current && <main className="stage board-fading" aria-hidden="true">
            <Scorecard role={lastResolved.current._role} scorecardKeys={lastResolved.current.curation && lastResolved.current.curation.scorecardKeys} onPick={() => {}} />
            <TemplateBoard spec={lastResolved.current.spec} role={lastResolved.current._role} catalog={catalog} onPick={() => {}} finding={lastResolved.current.curation && lastResolved.current.curation.finding} source={lastResolved.current.source} curation={lastResolved.current.curation} />
          </main>}
          <RoleComposition role={role} windowMode={windowMode} placement="board" />
        </div> : <div className={`workarea ${picked ? "drawer-open" : ""} ${compressing ? "compressing" : ""}`}>
          <main className="stage">
            <Scorecard role={role} scorecardKeys={state.curation && state.curation.scorecardKeys} onPick={setPicked} />
            <TemplateBoard key={`${role}|${perturbation}|${(state.curation && state.curation.finding && state.curation.finding.label) || ""}`} spec={state.spec} role={role} catalog={catalog} onPick={setPicked} finding={state.curation && state.curation.finding} source={state.source} curation={state.curation} />
          </main>
          <TraceDrawer picked={picked} source={state.source} floating={showQuery || showTrust || showDebug} onClose={() => setPicked(null)} />
        </div>}
      </div>

      {/* footer band — three groups, treated separately (Tuning 5, §1). */}
      <footer className="rail-foot">
        {/* group 1 — what the engine already knows: row count · quarters · segments. No model dependency,
            so it is present from the board shell's first frame, all through the curation window. */}
        <span className="foot-facts"><span className="foot-src">⟡</span> {quarters} quarters · <b>{rows.toLocaleString()}</b> source rows · {segments} segments</span>
        {/* groups 3 + 2 — the model-dependent claim (model chose N of M · N evidence · N rejected) and the
            static route to the governing contract. The claim renders ONLY once curation resolves (a count
            not yet known is unknown, not zero → nothing during the window); the ▸ contract route is always
            present. Both open the Trust panel — the arrangement's claim, and the contract that governs it. */}
        <button className={`foot-status ${state.source || ""}`} onClick={() => setShowTrust(true)} title="the trust contract — what each layer may and may not do">
          {resolved && <span className="foot-claim">
            {state.source === "live"
              ? <><span className="live-dot" /> Curated live for the {role}{state.disclosure && <em className="disclose"> · overall #1: {state.disclosure.label} → {state.disclosure.owner.role} view</em>}{state.stats && <> · model chose <b>{state.stats.selected} of {state.stats.candidates}</b> panels · <b>{state.stats.evidence}</b> evidence · <b>{state.stats.rejected}</b> rejected</>}</>
              : <>Model unavailable — captured {role} arrangement. Numbers still live from the engine.{state.err && <em> · {state.err}</em>}</>}
          </span>}
          <span className="foot-trace">▸ the contract</span>
        </button>
        {proxy && <button className="foot-note" onClick={() => setShowTrust(true)} title="the trust contract — how this proxy is constructed"><sup className="proxy">a</sup> {proxy.label} is a proxy — {proxy.caveat}</button>}
      </footer>

      {showTrust && <div className="brief-overlay"><TrustPanel audit={audit.current} debug={state.debug} proxy={proxy} onClose={() => setShowTrust(false)} /></div>}

      {showQuery && <QueryModal aside={!!picked} queries={queries} onAsk={handleQuery} onClose={() => setShowQuery(false)} onPick={(p) => setPicked(p)} onRecurate={recurate} onAnswerFully={answerFully} busy={queries.some((q) => q.status === "loading")} />}
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
      .then((ds) => { setBaseDS(ds); initEngine(ds); setReady(true); })
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <div className="caliper"><div className="loading">could not load dataset</div></div>;
  if (!ready) return <div className="caliper"><div className="loading">…</div></div>;
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}
