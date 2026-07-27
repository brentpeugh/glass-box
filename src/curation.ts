/**
 * Curation contract — the pure, testable coherence layer.
 * ======================================================
 * Extracted from the renderer so the SAME code the app runs is the code the
 * thesis-critical validation script proves (scripts/validate-discovery.ts).
 * A model curation is admissible only if it is COHERENT with the anchoring
 * finding's neighborhood: evidence/tests/widgets inside the neighborhood, at
 * least one genuine falsifier, prose numeral-free. Violations are dropped; if
 * what remains isn't viable, the caller falls back to the deterministic read.
 */

// widget → analytical domain (the semantic tag used for lens-coherence)
export const WIDGET_DOMAIN: Record<string, string> = {
  masking_card: "retention", bridge_smb: "retention", bridge_enterprise: "retention", bridge_blended: "retention", hbar_nrr: "retention",
  efficiency_combo: "efficiency", magic_line: "efficiency", metric_matrix: "efficiency", efficiency_bullets: "efficiency",
  accel_line: "growth", segment_stack: "growth",
  segment_table: "concentration", pareto_arr: "concentration", treemap_arr: "concentration",
  lorenz_arr: "concentration",
  scatter_eff_growth: "efficiency", heatmap_metrics: "efficiency", quadrant_eff: "efficiency",
  indexed_arr: "growth", grouped_growth: "growth", small_mult_arr: "growth",
  dumbbell_ret: "retention", heatmap_retention: "retention",
};
// Board-COMPOSITION relatedness: which chart families visually complete a board of a given domain.
// This is deliberately NOT the analytical-coherence relation (a concentration board tops up with
// concentration/growth charts, not retention bridges — see the top-up in App.tsx). It is a distinct
// concept from admissibleLenses() below, which governs what the model may be OFFERED and ADMITTED.
export const RELATED_DOMAINS: Record<string, string[]> = { retention: ["retention", "concentration"], efficiency: ["efficiency", "growth"], growth: ["growth", "concentration"], concentration: ["concentration", "growth"] };

// The finding's admissible analytical lenses — the SINGLE source of truth for both what the prompt
// OFFERS (buildCurationPrompt) and what the validator ADMITS (validateCurationCore). Engine-computed
// via findingNeighborhood → nb.lenses; falls back to the finding's own domain only if a caller hands
// in a lens-less neighborhood (production always has lenses). Offer and admit MUST derive from this
// one value, or forms get offered that are then dropped — the spurious-rejection bug this fixes.
export function admissibleLenses(nb: any): string[] { return nb.lenses || [nb.domain]; }

// model framing may not contain digits — the engine owns every number
// headline-strip metrics the model may curate into the vital-signs scorecard (broader than the
// read's neighborhood — vitals are orientation, not the analytical claim, so not neighborhood-gated)
export const HEADLINE_KEYS = ["nrr", "grr", "gross_margin", "magic_number", "cac_payback", "rule_of_40", "qoq_growth", "net_new_arr", "ent_share"];

// Reject digits, unicode fractions, and figure-like spelled numbers ("twenty-one", "sixty percent",
// "two million") — but NOT ordinary determiners ("one segment", "three quarters"). The model is
// never given figures to verbalize, so this only catches an *invented* word-number; reject-not-strip.
const NUMWORD = /[\u00bc-\u00be\u2150-\u215e]|\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)[\s-](percent|points?|times|fold|basis|months?|dollars?|thirds?|halves|half|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?)\b/i;
export function guardFraming(text: any, allowedLabels: string[] = []) {
  const original = String(text || "");
  let probe = original;
  // Engine-named objects (e.g. "Rule of 40", "Top-10 ARR Share") legitimately contain digits.
  // NAMING one is REFERENCING an engine object, not authoring a value — so exact label strings
  // (case-insensitive) are stripped before the numeral test, and the guard checks what remains.
  // A bare digit outside a known label still trips, so no value can be smuggled in.
  for (const lab of allowedLabels) {
    if (lab && lab.length > 1) probe = probe.replace(new RegExp(lab.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  }
  const violated = /\d/.test(probe) || NUMWORD.test(probe);
  return { text: violated ? "" : original, violated };
}

// Directional coherence: the engine owns the VERDICT (does the metric clear/breach its benchmark,
// is it rising/falling) exactly as it owns the numbers. A framing whose direction language
// contradicts the engine's verdict is INADMISSIBLE — just like an invented numeral. Returns
// violated=true when the model asserts the opposite of what the engine computed.
const UP_WORDS = /\b(exceed\w*|above|outperform\w*|beat\w*|surpass\w*|strong\w*|healthy|robust|ahead|clearing|clears|improv\w*|gain\w*|rising|climb\w*)\b/i;
const DOWN_WORDS = /\b(below|breach\w*|miss\w*|weak\w*|short|behind|lag\w*|trail\w*|underperform\w*|declin\w*|fall\w*|drop\w*|erod\w*|deteriorat\w*|shortfall)\b/i;
export function guardDirection(text: any, grounding: any) {
  const t = String(text || "");
  if (!grounding) return { violated: false };
  // benchmark verdict: "clears" ⇒ favorable, "breaches" ⇒ unfavorable
  if (grounding.hasBenchmark && grounding.status) {
    const favorable = grounding.status === "clears";
    if (favorable && DOWN_WORDS.test(t) && !UP_WORDS.test(t)) return { violated: true, reason: "framing says underperformance but the engine says it clears the benchmark" };
    if (!favorable && UP_WORDS.test(t) && !DOWN_WORDS.test(t)) return { violated: true, reason: "framing says outperformance but the engine says it breaches the benchmark" };
  }
  return { violated: false };
}
// Deterministic, always-true fallback headline built from the engine's verdict — used when the
// model's framing is rejected for contradicting the engine. The engine's verdict wins.
export function engineHeadline(grounding: any) {
  const label = grounding?.label || "Metric";
  if (grounding?.hasBenchmark && grounding?.status) return grounding.status === "clears" ? `${label} clears its benchmark` : `${label} below its benchmark`;
  if (grounding?.direction && grounding.direction !== "flat") return `${label} ${grounding.direction}`;
  return `${label} — engine-computed`;
}

// The coherence validator. Pure: it takes the finding's neighborhood (from the engine),
// the catalog, and the widget-domain map — no renderer state. This is the function the app
// runs live AND the function the discovery-path test proves.
export function validateCurationCore(cur: any, nb: any, catalog: any, widgetDomain: Record<string, string> = WIDGET_DOMAIN, allowedLabels: string[] = []) {
  const mSet = new Set(nb.metricIds), tSet = new Set(nb.testIds), fSet = new Set(nb.falsifierIds);
  const rel = admissibleLenses(nb);
  const violations: string[] = [];
  const evidenceIds = (cur.evidenceIds || []).filter((id: string) => mSet.has(id));
  if (evidenceIds.length < (cur.evidenceIds || []).length) violations.push("evidence outside the finding neighborhood — dropped");
  const testIds = (cur.testIds || []).filter((id: string) => tSet.has(id));
  if (testIds.length < (cur.testIds || []).length) violations.push("unsupported test id(s) — dropped");
  const widgetIds = (cur.widgetIds || []).filter((id: string) => catalog[id] && rel.includes(widgetDomain[id]));
  if (widgetIds.length < (cur.widgetIds || []).length) violations.push("off-domain widget(s) — dropped");
  const hasFalsifier = testIds.some((id: string) => fSet.has(id));
  if (!hasFalsifier) violations.push("no falsifying test selected — a read must be able to fail");
  const tG = guardFraming(cur.thesis || "", allowedLabels), wG = guardFraming(cur.whyRole || "", allowedLabels);
  if (tG.violated || wG.violated) violations.push("authored numerals stripped from prose");
  const scorecardKeys = (cur.scorecardKeys || []).filter((k: string) => HEADLINE_KEYS.includes(k)).slice(0, 6);
  const partitionPref = ["analytical", "hero", "balanced"].includes(cur.partitionPref) ? cur.partitionPref : null;
  const viable = evidenceIds.length > 0 && hasFalsifier && tG.text.length > 0;
  return { viable, violations, curation: viable ? { thesis: tG.text, whyRole: wG.text, evidenceIds, testIds, widgetIds, partitionPref, scorecardKeys, rationaleTags: cur.rationaleTags || [], source: "live" } : null };
}
