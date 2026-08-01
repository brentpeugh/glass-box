// Extracted from App.tsx (docs/briefs/extraction.md). Behaviour-preserving move — no logic change.
// The curation path — the one I/O boundary (callModel). fallbackCuration is deterministic.
import { E, BASE_DS } from "./engine";
import { WIDGET_DOMAIN, HEADLINE_KEYS, validateCurationCore, admissibleLenses } from "./curation";

// All model calls go through one seam. In production this hits the Netlify function
// holding the key server-side; running plain `vite` (no function) it throws and the
// callers fall back to captured compositions / graceful declines.
export async function callModel(task, messages, max_tokens, model) {
  const res = await fetch("/.netlify/functions/curate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, messages, max_tokens, model }) });
  if (!res.ok) throw new Error("model " + res.status);
  return res.json();
}
// The one high-judgment call — thesis formation + coherent curation — routes to the strongest
// model. Everything else stays on the cheap path. NOTE: the model field is advisory only — the
// Netlify function is server-authoritative and pins curate → Sonnet (it ignores this value).
const CURATION_MODEL = "claude-sonnet-4-6";

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
// The forms the model is OFFERED for a finding: catalog widgets whose domain is one of the
// finding's admissible lenses. SAME source (admissibleLenses) the validator admits by, so nothing
// offered is later dropped as off-domain. Exported so validate-curation.ts can prove offered ⊆ admitted.
export function offeredWidgets(nb, catalog) {
  return Object.keys(catalog).filter((id) => admissibleLenses(nb).includes(WIDGET_DOMAIN[id]));
}
// Per-metric quarter series for the deterministic lede's duration streak — a small, engine-backed
// series map used only by ledeFacts (the App-side METRIC_SERIES it once mirrored was retired with the
// finding-band components in Tuning 2).
const LEDE_SERIES: Record<string, (q: any, primary: any, i: number) => number | null> = {
  cac: (q) => { try { return E.cacPayback(q).value; } catch { return null; } },
  magic: (q) => { try { return E.magicNumber(q).value; } catch { return null; } },
  grossMargin: (q) => { try { return E.grossMargin(q).value; } catch { return null; } },
  qoq: (q) => { try { return E.qoqGrowth(q).value; } catch { return null; } },
  r40: (q, _p, i) => { try { return i >= 4 ? E.ruleOf40(q).value : null; } catch { return null; } },
  arr: (q, primary) => { try { const p = String((primary && primary.id) || "").split("."); const seg = p.length === 3 ? p[1] : null; return seg ? E.segArr(seg, q).value : E.companyArr(q).value; } catch { return null; } },
  nrr: (q, primary) => { try { const p = String((primary && primary.id) || "").split("."); const seg = p.length >= 3 && E.SEGMENTS.includes(p[1]) ? p[1] : null; const qi = E.QUARTERS.indexOf(q); if (qi < 4) return null; return E.nrr(seg, E.QUARTERS[qi - 4], q).value; } catch { return null; } },
};
const NUMWORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const numWord = (n: number) => NUMWORD[n] || String(n);
const fmtMoney = (v: number) => { const a = Math.abs(v); return (v < 0 ? "−$" : "$") + (a >= 1e9 ? (a / 1e9).toFixed(1) + "B" : a >= 1e6 ? (a / 1e6).toFixed(1) + "M" : a >= 1e3 ? (a / 1e3).toFixed(0) + "K" : a.toFixed(0)); };
const fmtVal = (v: number, u: string) => u === "usd" ? fmtMoney(v) : u === "percent" ? v.toFixed(1) + "%" : u === "ratio" ? v.toFixed(2) + "x" : u === "months" ? v.toFixed(0) + " months" : u === "pp" ? v.toFixed(0) + " pp" : v.toFixed(0);
const fmtBench = (v: number, u: string) => u === "usd" ? fmtMoney(v) : u === "percent" ? v + "%" : u === "ratio" ? v + "x" : u === "months" ? v + "-month" : "" + v;
const breachedMV = (m: any) => m && m.basis && (m.basis.good === "above" ? m.value < m.basis.thr : m.value > m.basis.thr);
const joinList = (a: string[]) => a.length <= 1 ? (a[0] || "") : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(", ")}, and ${a[a.length - 1]}`;
// slug an engine label into a stable token name (lowercase; runs of non-alphanumerics → "_"). A digit
// in a NAME is fine — it is part of an engine-supplied name (Rule of 40 → rule_of_40), never a value.
export const slugToken = (label: any) => String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
// The TOKEN VOCABULARY for a finding — the SINGLE source for the prompt (what the model may write), the
// validator (what it admits), and the renderer (what it substitutes + dye-scribes). One token per
// evidence metric, named by the slug of its label, rendering the value WITH ITS UNIT; plus a
// `<slug>_benchmark` token wherever the metric carries a benchmark. Each token records its source node
// id so the render layer can dye-scribe the substituted value to its trace — exactly as the lede does.
export function ledeTokens(finding: any) {
  const nb = E.findingNeighborhood(finding);
  const ids = [...new Set([...(finding.mvs || []).map((m: any) => m && m.id).filter(Boolean), ...(nb.metricIds || [])])];
  const tokens: Record<string, any> = {};
  for (const id of ids) {
    let mv: any; try { mv = E.store.get(id); } catch { continue; }
    if (!mv || !mv.label) continue;
    const name = slugToken(mv.label);
    if (!name || tokens[name]) continue;
    tokens[name] = { value: fmtVal(mv.value, mv.unit), nodeId: mv.id, label: mv.label, unit: mv.unit };
    if (mv.basis) tokens[`${name}_benchmark`] = { value: fmtBench(mv.basis.thr, mv.unit), nodeId: mv.id, label: `${mv.label} benchmark`, unit: mv.unit, benchmark: true };
  }
  return tokens;
}
// The DETERMINISTIC lede: the finding STATED and ENUMERATED — value/benchmark/breach/duration in the
// thesis, then a dense composition of the surrounding engine facts (which tracked metrics sit below
// target, the finding count and domain spread, the source-row count) as the "why". The model lede
// INTERPRETS; this one states and enumerates. Neither imitates the other — the difference is the point.
export function ledeFacts(finding: any) {
  try {
    const primary = (finding.mvs || [])[0];
    if (!primary || !primary.basis) return null;
    const b = primary.basis, u = primary.unit;
    const value = fmtVal(primary.value, u), bench = fmtBench(b.thr, u);
    const breached = breachedMV(primary);
    // duration: trailing consecutive quarters the metric moved in the UNFAVOURABLE direction
    let streak = 0;
    const sf = LEDE_SERIES[finding.metric];
    if (sf) {
      const vals = E.QUARTERS.map((q: any, i: number) => sf(q, primary, i)).filter((v: any) => v != null);
      for (let k = vals.length - 1; k > 0; k--) { const worse = b.good === "above" ? vals[k] < vals[k - 1] : vals[k] > vals[k - 1]; if (worse) streak++; else break; }
    }
    const streakClause = streak >= 2 ? ` after ${numWord(streak)} consecutive quarters of deterioration` : "";
    // the thesis is a HEADLINE — no terminal punctuation (the enumeration paragraph below keeps its full
    // stop). It is a TOKEN TEMPLATE, not a composed string: {slug} / {slug}_benchmark are substituted +
    // dye-scribed by the same render layer the model path uses — one substitution layer, both paths.
    const pslug = slugToken(primary.label);
    const template = `${primary.label} stands at {${pslug}} against a {${pslug}_benchmark} benchmark, ${breached ? "breaching" : "clearing"} it${streakClause}`;
    // enumeration: the surrounding tracked metrics, the finding spread, the row count
    const q = E.QUARTERS, latest = q[q.length - 1], w0 = q[q.length - 5];
    const safeMV = (fn: () => any) => { try { const m = fn(); return m && m.basis ? m : null; } catch { return null; } };
    const tracked = [
      safeMV(() => E.nrr(null, w0, latest)), safeMV(() => E.grr(null, w0, latest)),
      safeMV(() => E.cacPayback(latest)), safeMV(() => E.magicNumber(latest)),
      safeMV(() => E.ruleOf40(latest)), safeMV(() => E.grossMargin(latest)),
    ].filter(Boolean).filter((m: any) => m.label !== primary.label);   // the anchor is stated above, not re-listed
    const below = tracked.filter((m: any) => breachedMV(m)).map((m: any) => m.label);
    const holds = tracked.filter((m: any) => !breachedMV(m)).map((m: any) => m.label);
    const findings = E.computeSalience() || [];
    const domains = new Set(findings.map((f: any) => { try { return E.findingNeighborhood(f).domain; } catch { return null; } }).filter(Boolean));
    const rows = BASE_DS ? (BASE_DS.facts.customers.length + BASE_DS.facts.opex.length + BASE_DS.facts.opportunities.length) : 0;
    const metricsClause = below.length
      ? `Of the ${numWord(tracked.length)} other tracked metrics, ${joinList(below)} ${below.length === 1 ? "sits" : "sit"} below target${holds.length ? ` while ${joinList(holds)} ${holds.length === 1 ? "holds" : "hold"}` : ""}.`
      : `All ${numWord(tracked.length)} other tracked metrics hold their benchmarks.`;
    const enumeration = `${metricsClause} The engine surfaced ${findings.length} findings across ${numWord(domains.size)} domains, computed from ${rows.toLocaleString()} source rows.`;
    return { label: primary.label, primary, value, bench, breached, streak, template, enumeration };
  } catch { return null; }
}
export function fallbackCuration(fact) {
  const nb = E.findingNeighborhood(fact);
  // Order admissible widgets by RELEVANCE to the anchor finding's domain: the finding's own domain
  // first, then the remaining admissible lenses in lens order (stable sort keeps WIDGET_DOMAIN
  // declaration order within a domain). Without this the widgets sort by WIDGET_DOMAIN declaration
  // order alone, so a lens declared earlier (retention) precedes the finding's own domain
  // (concentration) and composeBoard's 3-slot cap renders off-anchor panels — retention bridges under
  // a concentration finding. Arbitrary declaration order must not decide what a deterministic board shows.
  const lenses = admissibleLenses(nb);
  const domainRank = [nb.domain, ...lenses.filter((d) => d !== nb.domain)];
  const widgetIds = Object.keys(WIDGET_DOMAIN)
    .filter((id) => lenses.includes(WIDGET_DOMAIN[id]))
    .sort((a, b) => domainRank.indexOf(WIDGET_DOMAIN[a]) - domainRank.indexOf(WIDGET_DOMAIN[b]));
  const evidenceIds = [...new Set([...(fact.mvs || []).map((m) => m.id), ...nb.metricIds])].slice(0, 4);   // exactly 4 — matches what the lede renders + what the footer reports
  const facts = ledeFacts(fact);
  return {
    // deterministic: state the anchor plainly (thesis) and enumerate the surrounding engine facts
    // (whyRole) — dense, not interpretive. Do NOT imitate the model's voice; the difference is the point.
    thesis: facts ? facts.template : `${fact.label} is the top finding the engine surfaced from this quarter's data`,
    whyRole: facts ? facts.enumeration : "This is the largest deviation from benchmark the engine measured, so it most warrants scrutiny before decisions rest on the headline numbers.",
    evidenceIds, testIds: nb.testIds.slice(0, 3), widgetIds,   // at most 3 — matches the lede foot; nb.testIds keeps a falsifier within the first 3
    scorecardKeys: FALLBACK_SCORECARD[nb.domain] || FALLBACK_SCORECARD.efficiency,
    rationaleTags: ["top salient anomaly", nb.domain], source: "fallback",
  };
}
function validateCuration(cur, finding, catalog) {
  const nb = E.findingNeighborhood(finding);
  // the model may NAME any metric it was shown as evidence — those engine labels (some contain
  // digits, e.g. "Rule of 40") are references, not authored values, so they're whitelisted.
  const evidenceLabels = (nb.metricIds || []).map((id: string) => { try { return E.store.get(id)?.label; } catch { return null; } }).filter(Boolean);
  const validTokens = Object.keys(ledeTokens(finding));   // the finding's token vocabulary — an unknown token rejects the curation
  return validateCurationCore(cur, nb, catalog, WIDGET_DOMAIN, evidenceLabels, validTokens);
}
function buildCurationPrompt(focus, finding, nb, catalog) {
  const metricMenu = nb.metricIds.map((id) => ({ id, label: E.store.get(id).label }));
  const tokenMenu = Object.entries(ledeTokens(finding)).map(([name, t]: [string, any]) => ({ token: `{${name}}`, of: t.label, rendersAs: t.value }));   // give the LITERAL rendered string (e.g. "12-month"), so the model can build grammar around it
  const testMenu = nb.testIds.map((id) => { const t = E.TEST_MENU.find((x) => x.id === id); return { id, question: t.label, falsifier: nb.falsifierIds.includes(id) }; });
  const widgetMenu = offeredWidgets(nb, catalog).map((id) => ({ id, label: catalog[id].title || id }));
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
Form the decision-relevant READ for the ${focus.role}. The engine surfaced this top statistical fact from a neutral scan; its finding neighborhood (the menus below) defines what is legible. Do NOT assume the issue is retention, growth, efficiency, or concentration — let the neighborhood and the evidence decide. Choose the framing and widgets most decision-relevant FOR THE ${focus.role}: a CFO (durability, forecast, capital allocation) and a CRO (conversion, motion, segment mix) should NOT surface the same board. Compose a COMPLETE board: select the set of widgets that give a full analytical view of this finding from complementary angles (e.g. the trend over time, the segment/component breakdown, the composition or share, a comparison against benchmark) — exactly 3 panels, ordered most important first. Choose the three most decision-relevant complementary angles; select fewer only if the finding genuinely cannot support three.${domainHint} Select ONLY from the menus below — you may not invent metrics, tests, or widgets.

Your prose must contain NO DIGITS and NO UNITS. Every figure is a TOKEN from the TOKENS list, written in curly braces exactly as listed (e.g. {cac_payback}). Each token in the list shows what it renders as (its "rendersAs") so you can build grammar around it — but you write the TOKEN, never the rendered text: "{cac_payback}", NOT "{cac_payback} months" (double unit) and NEVER a bare number. You may use ONLY tokens from the list; an unknown token rejects the whole read.
The THESIS carries the figures (as {tokens}). The WHY-IT-MATTERS is the argument: it must NOT restate any figure that the evidence column already shows — use NO tokens in whyRole; name a metric by its name if the argument needs it, but do not quote a value against its benchmark. Do NOT open the thesis or whyRole with the role name — the board's eyebrow already states the role.

EVIDENCE (metric ids you may cite): ${JSON.stringify(metricMenu)}
TOKENS (the ONLY figures you may write in prose — each renders value+unit and links to source): ${JSON.stringify(tokenMenu)}
TESTS (you MUST include at least one marked falsifier:true, so your read can fail): ${JSON.stringify(testMenu)}
WIDGETS (charts you may select, prioritized): ${JSON.stringify(widgetMenu)}
HEADLINE (metric keys for the vital-signs strip — pick 6 that matter to the ${focus.role} for THIS finding): ${JSON.stringify(headlineMenu)}

Return ONLY this JSON, nothing around it:
{"thesis":"ONE sentence, NO terminal punctuation — a HEADLINE; figures ONLY as {tokens}, no digits, no units; do not open with the role name","whyRole":"at most 280 CHARACTERS, ending with a full stop — why this finding bears on the role's decisions; NO {tokens} and NO figures (the values are already in the evidence column), name a metric by name if needed; do not open with the role name","evidenceIds":["EXACTLY 4 ids from EVIDENCE — the lede shows four"],"testIds":["EXACTLY 3 ids from TESTS, including >=1 falsifier — the lede shows three"],"widgetIds":["exactly 3 ids from WIDGETS composing the board — complementary views, most important first"],"scorecardKeys":["6 role-aware headline metric keys from HEADLINE, foregrounding the ones the finding implicates"],"rationaleTags":["short non-numeric tags"]}`;
}
// callModel is an INJECTED dependency (docs/briefs/extraction.md §4): the default is byte-identical
// to the shipped seam, so the app is unchanged; a Node harness can inject a direct API call or a
// recorded fixture. This is the only signature change in the extraction.
export async function curate(focus, catalog, targetFinding, { callModel: callModelFn = callModel } = {}) {
  const finding = targetFinding || E.topFinding();   // re-orient around a chosen discovered finding, or the top salient one
  if (!finding) return null;
  const nb = E.findingNeighborhood(finding);
  const prompt = buildCurationPrompt(focus, finding, nb, catalog);
  try {
    const data = await callModelFn("curate", [{ role: "user", content: prompt }], 600, CURATION_MODEL);
    const raw = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    const { viable, curation, violations } = validateCuration(parsed, finding, catalog);
    if (viable) return { ...curation, finding, violations, _debug: { prompt, raw, model: data.model } };
    return { ...fallbackCuration(finding), finding, violations: [...violations, "incoherent — fell back to deterministic read"], _debug: { prompt, raw, model: data.model } };
  } catch (e) {
    return { ...fallbackCuration(finding), finding, violations: ["model unavailable — deterministic read"], _debug: { prompt, raw: String(e).slice(0, 200), model: null } };
  }
}

// captured fallback per role (labeled), used only when the model is unavailable.
// Tuning 2, Stage A: trimmed to the three-panel board — a lede finding-card (CFO) plus exactly three
// chart/table panels. The dropped blocks (callouts, and the tail past the third panel) never
// rendered under composeBoard's three-slot cap anyway, so the rendered board is unchanged; the spec
// now simply names only what it shows.
export const FALLBACK = {
  CFO: { sections: [
    { heading: "", blocks: [
      { widget: "masking_card", emphasis: "hero", headline: "The headline hides the rot", soWhat: "Net retention only looks healthy because expansion masks an underwater segment." },
      { widget: "bridge_smb", emphasis: "standard", headline: "Where revenue leaks", soWhat: "In the worst segment, churn and contraction overwhelm expansion." },
      { widget: "efficiency_combo", emphasis: "standard", headline: "Spending more to grow less", soWhat: "Sales spend is climbing while each dollar buys less growth." },
      { widget: "metric_matrix", emphasis: "standard", headline: "The full trajectory", soWhat: "Every efficiency metric, every quarter — the deterioration is systemic." }] },
  ] },
  CRO: { sections: [
    { heading: "", blocks: [
      { widget: "segment_stack", emphasis: "hero", headline: "Enterprise carrying the number", soWhat: "Topline is growing and the Enterprise motion is doing the heavy lifting." },
      { widget: "accel_line", emphasis: "standard", headline: "Momentum is building", soWhat: "Quarter-over-quarter growth is speeding up, not flattening." },
      { widget: "bridge_enterprise", emphasis: "standard", headline: "The expansion engine", soWhat: "Existing Enterprise accounts keep growing well past what they started at." }] },
  ] },
};
