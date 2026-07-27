// Extracted from App.tsx (docs/briefs/extraction.md). Behaviour-preserving move — no logic change.
// The curation path — the one I/O boundary (callModel). fallbackCuration is deterministic.
import { E } from "./engine";
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
export function fallbackCuration(fact) {
  const nb = E.findingNeighborhood(fact);
  const widgetIds = Object.keys(WIDGET_DOMAIN).filter((id) => admissibleLenses(nb).includes(WIDGET_DOMAIN[id]));
  const evidenceIds = [...new Set([...(fact.mvs || []).map((m) => m.id), ...nb.metricIds])].slice(0, 6);
  return {
    thesis: `The most statistically anomalous signal in the book is ${fact.label} — it stands out sharply against the rest of the metrics, which is where decision risk concentrates.`,
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
Form the decision-relevant READ for the ${focus.role}. The engine surfaced this top statistical fact from a neutral scan; its finding neighborhood (the menus below) defines what is legible. Do NOT assume the issue is retention, growth, efficiency, or concentration — let the neighborhood and the evidence decide. Choose the framing and widgets most decision-relevant FOR THE ${focus.role}: a CFO (durability, forecast, capital allocation) and a CRO (conversion, motion, segment mix) should NOT surface the same board. Compose a COMPLETE board: select the set of widgets that give a full analytical view of this finding from complementary angles (e.g. the trend over time, the segment/component breakdown, the composition or share, a comparison against benchmark) — typically 5-6 panels, ordered most important first. Prefer a fuller board that examines the finding from several angles over a sparse one; only select fewer if the finding genuinely cannot support more.${domainHint} Select ONLY from the menus below — you may not invent metrics, tests, or widgets, and you may not write any digit in your prose (the engine owns all numbers).

EVIDENCE (metric ids you may cite): ${JSON.stringify(metricMenu)}
TESTS (you MUST include at least one marked falsifier:true, so your read can fail): ${JSON.stringify(testMenu)}
WIDGETS (charts you may select, prioritized): ${JSON.stringify(widgetMenu)}
HEADLINE (metric keys for the vital-signs strip — pick 6 that matter to the ${focus.role} for THIS finding): ${JSON.stringify(headlineMenu)}

Return ONLY this JSON, nothing around it:
{"thesis":"1-2 sentences, NO numbers — the story that matters for the ${focus.role}","whyRole":"1 sentence, NO numbers — why it matters to the ${focus.role}","evidenceIds":["ids from EVIDENCE"],"testIds":["ids from TESTS, including >=1 falsifier"],"widgetIds":["5-6 ids from WIDGETS composing a complete board — complementary views, most important first"],"partitionPref":"one of: analytical (dense data-grid lead) | hero (one dominant panel + rail) | balanced","scorecardKeys":["6 role-aware headline metric keys from HEADLINE, foregrounding the ones the finding implicates"],"rationaleTags":["short non-numeric tags"]}`;
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

// captured fallback per role (labeled), used only when the model is unavailable
export const FALLBACK = {
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
