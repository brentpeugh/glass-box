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
  scatter_eff_growth: "efficiency", quadrant_eff: "efficiency",
  indexed_arr: "growth", grouped_growth: "growth", small_mult_arr: "growth",
  dumbbell_ret: "retention", heatmap_retention: "retention",
};
// (RELATED_DOMAINS retired in Tuning 2, Stage A — its only remaining consumer was the board top-up,
// now removed with the fixed three-slot composition. See analysis/retired-layout.md.)

// Per-form metric metadata — the catalog held no per-form metric list (each form's metrics were only
// implicit in its `data` payload), so panel DISTINCTNESS could not be checked. This declares, per form:
//   • kind    — the analytical form (line, combo, treemap, …); a form is a contribution in its own right
//   • renders — every metric the form shows (drives uniqueness: each panel adds a metric OR a form)
//   • series  — the metrics the form draws as a prominent DATA SERIES (line/bar/area/point/gauge); a dense
//               grid or table has none. Drives the FORM CLAUSE below.
//   • subject — the single metric a form is DEDICATED to (a one-metric line, callout, ranked bar, or
//               distribution), else null.
// The FORM CLAUSE (the part that matters): a metric with a dedicated panel among the selected set must
// not also be drawn as a series on another selected panel — this is what catches the magic number being
// both its own line (magic_line) AND the combo's overlay; a naive uniqueness rule passes the combo (it
// contributes S&M spend). UNIQUENESS is metric-OR-form: strict metric-only uniqueness cannot fill three
// slots once a dense grid (metric_matrix renders every efficiency metric) is chosen, so a panel also
// counts if it is an analytical form no other selected panel provides.
type FormMetric = { kind: string; renders: string[]; series: string[]; subject: string | null };
export const FORM_METRICS: Record<string, FormMetric> = {
  efficiency_combo:   { kind: "combo",        renders: ["sm_spend", "magic_number"], series: ["sm_spend", "magic_number"], subject: null },
  magic_line:         { kind: "line",         renders: ["magic_number"], series: ["magic_number"], subject: "magic_number" },
  accel_line:         { kind: "line",         renders: ["qoq_growth"], series: ["qoq_growth"], subject: "qoq_growth" },
  metric_matrix:      { kind: "matrix",       renders: ["nrr", "grr", "gross_margin", "magic_number", "cac_payback", "rule_of_40", "net_new_arr", "qoq_growth"], series: [], subject: null },
  efficiency_bullets: { kind: "bullet",       renders: ["magic_number", "cac_payback", "rule_of_40"], series: ["magic_number", "cac_payback", "rule_of_40"], subject: null },
  scatter_eff_growth: { kind: "scatter",      renders: ["magic_number", "qoq_growth"], series: ["magic_number", "qoq_growth"], subject: null },
  quadrant_eff:       { kind: "quadrant",     renders: ["magic_number", "qoq_growth"], series: ["magic_number", "qoq_growth"], subject: null },
  segment_stack:      { kind: "stacked_area", renders: ["seg_arr"], series: ["seg_arr"], subject: null },
  segment_table:      { kind: "table",        renders: ["seg_arr", "ent_share", "nrr", "grr"], series: [], subject: null },
  pareto_arr:         { kind: "pareto",       renders: ["seg_arr", "arr_cumshare"], series: ["seg_arr", "arr_cumshare"], subject: null },
  treemap_arr:        { kind: "treemap",      renders: ["seg_arr", "ent_share"], series: ["seg_arr"], subject: null },
  lorenz_arr:         { kind: "lorenz",       renders: ["arr_dist"], series: ["arr_dist"], subject: "arr_dist" },
  indexed_arr:        { kind: "indexed",      renders: ["seg_arr"], series: ["seg_arr"], subject: null },
  grouped_growth:     { kind: "grouped",      renders: ["seg_arr"], series: ["seg_arr"], subject: null },
  small_mult_arr:     { kind: "small_multiples", renders: ["seg_arr"], series: ["seg_arr"], subject: null },
  hbar_nrr:           { kind: "hbar",         renders: ["nrr"], series: ["nrr"], subject: "nrr" },
  dumbbell_ret:       { kind: "dumbbell",     renders: ["grr", "nrr"], series: ["grr", "nrr"], subject: null },
  heatmap_retention:  { kind: "heatmap",      renders: ["nrr", "grr"], series: [], subject: null },
  bridge_smb:         { kind: "waterfall",    renders: ["nrr"], series: [], subject: null },
  bridge_enterprise:  { kind: "waterfall",    renders: ["nrr"], series: [], subject: null },
  bridge_blended:     { kind: "waterfall",    renders: ["nrr"], series: [], subject: null },
  masking_card:       { kind: "finding_card", renders: ["nrr"], series: [], subject: null },
  callout_magic:      { kind: "callout",      renders: ["magic_number"], series: ["magic_number"], subject: "magic_number" },
  callout_cac:        { kind: "callout",      renders: ["cac_payback"], series: ["cac_payback"], subject: "cac_payback" },
  callout_r40:        { kind: "callout",      renders: ["rule_of_40"], series: ["rule_of_40"], subject: "rule_of_40" },
  callout_grr:        { kind: "callout",      renders: ["grr"], series: ["grr"], subject: "grr" },
  salient_band:       { kind: "finding_card", renders: [], series: [], subject: null },
};
// Compose a DISTINCT panel set from an ordered (salience-ranked) id list — greedy, keeping priority order.
// A form is dropped if it violates the FORM CLAUSE against an already-kept form, or adds neither a new
// metric nor a new analytical form. Composed, not truncated: callers fill from the remaining ranked menu.
export function distinctPanels(ids: string[]): string[] {
  const kept: string[] = [];
  const subjects = new Set<string>(), series = new Set<string>(), renders = new Set<string>(), kinds = new Set<string>();
  for (const id of ids) {
    const fm = FORM_METRICS[id];
    if (!fm) { kept.push(id); continue; }   // unknown form: fail open, never block
    // form clause: a dedicated metric must not be drawn as a series on another selected panel (both ways)
    const formClash = fm.series.some((m) => subjects.has(m)) || (fm.subject != null && series.has(fm.subject));
    if (formClash) continue;
    // uniqueness: contributes a metric no kept panel renders, OR an analytical form not yet present
    if (!fm.renders.some((m) => !renders.has(m)) && kinds.has(fm.kind)) continue;
    kept.push(id);
    if (fm.subject) subjects.add(fm.subject);
    fm.series.forEach((m) => series.add(m));
    fm.renders.forEach((m) => renders.add(m));
    kinds.add(fm.kind);
  }
  return kept;
}

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
  // Substitution tokens ({cac_payback}, {rule_of_40}) are engine-vocabulary slots — the engine owns the
  // value and unit they render, and their VALIDITY is checked separately (unknown tokens reject). Strip
  // them before the numeral test, so a digit INSIDE a token name (rule_of_40) doesn't false-trip while a
  // bare digit outside a token still does.
  let probe = original.replace(/\{[a-z0-9_]+\}/gi, " ");
  // Engine-named objects (e.g. "Rule of 40", "Top-10 ARR Share") legitimately contain digits.
  // NAMING one is REFERENCING an engine object, not authoring a value — so exact label strings
  // (case-insensitive) are stripped before the numeral test, and the guard checks what remains.
  // A bare digit outside a known label/token still trips, so no value can be smuggled in.
  for (const lab of allowedLabels) {
    if (lab && lab.length > 1) probe = probe.replace(new RegExp(lab.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  }
  const violated = /\d/.test(probe) || NUMWORD.test(probe);
  return { text: violated ? "" : original, violated };
}
// The set of tokens a model string writes ({name}). Used to reject an unknown/invented token — an
// engine-vocabulary slot that has no substitution must never reach the screen.
export function usedTokens(text: any): string[] { return [...String(text || "").matchAll(/\{([a-z0-9_]+)\}/gi)].map((m) => m[1]); }

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
export function validateCurationCore(cur: any, nb: any, catalog: any, widgetDomain: Record<string, string> = WIDGET_DOMAIN, allowedLabels: string[] = [], validTokens: string[] = [], anchorTokens: string[] = []) {
  const mSet = new Set(nb.metricIds), tSet = new Set(nb.testIds), fSet = new Set(nb.falsifierIds);
  const rel = admissibleLenses(nb);
  const violations: string[] = [];
  // token vocabulary: every {token} in the prose must be one the engine supplied for this finding.
  // An invented/unknown token has no substitution — it must reject the read, never reach the screen.
  const tokenVocab = new Set(validTokens);
  const thesisTokens = usedTokens(cur.thesis), whyTokens = usedTokens(cur.whyRole);
  const unknownTokens = [...thesisTokens, ...whyTokens].filter((t) => !tokenVocab.has(t));
  if (unknownTokens.length) violations.push(`unknown token(s) {${[...new Set(unknownTokens)].join("}, {")}} — not in the finding's vocabulary`);
  // the thesis states ONE metric — the anchor (+ its benchmark) — and only it; the why carries NO
  // figures at all. Composed to the cap (rejected, not truncated) — like the panel/evidence/test caps.
  const offAnchor = anchorTokens.length ? thesisTokens.filter((t) => !anchorTokens.includes(t)) : [];
  if (offAnchor.length) violations.push(`thesis cites a non-anchor metric ({${[...new Set(offAnchor)].join("}, {")}}) — a headline states one metric`);
  if (whyTokens.length) violations.push("why-it-matters restates figures — it must carry no tokens (the evidence column shows them)");
  // exactly 4 evidence values — the lede renders 4, so the count the footer reports must equal what
  // shows (same discipline as the 3-panel target). Off-neighborhood dropped first, then capped to 4.
  const evidenceIds = (cur.evidenceIds || []).filter((id: string) => mSet.has(id)).slice(0, 4);
  if (evidenceIds.length < (cur.evidenceIds || []).filter((id: string) => mSet.has(id)).length) violations.push("evidence beyond the four the lede shows — dropped");
  else if (evidenceIds.length < (cur.evidenceIds || []).length) violations.push("evidence outside the finding neighborhood — dropped");
  // at most 3 tests — the lede foot shows three (same cap as the 3-panel / 4-evidence targets). Off-
  // neighborhood dropped first, then capped to 3 (the falsifier check below runs on the capped set).
  const inNbTests = (cur.testIds || []).filter((id: string) => tSet.has(id));
  const testIds = inNbTests.slice(0, 3);
  if (testIds.length < inNbTests.length) violations.push("tests beyond the three the lede shows — dropped");
  else if (testIds.length < (cur.testIds || []).length) violations.push("unsupported test id(s) — dropped");
  const inDomainWidgets = (cur.widgetIds || []).filter((id: string) => catalog[id] && rel.includes(widgetDomain[id]));
  if (inDomainWidgets.length < (cur.widgetIds || []).length) violations.push("off-domain widget(s) — dropped");
  // panel distinctness: each panel must add a metric or a form no other shows, and a metric with a
  // dedicated panel must not be a series on another (the form clause). Redundant panels are dropped —
  // composed to the constraint, not truncated (the deterministic fallback fills; same as the caps).
  const widgetIds = distinctPanels(inDomainWidgets);
  if (widgetIds.length < inDomainWidgets.length) violations.push("redundant panel(s) — a metric with a dedicated panel drawn as a series on another; dropped");
  const hasFalsifier = testIds.some((id: string) => fSet.has(id));
  if (!hasFalsifier) violations.push("no falsifying test selected — a read must be able to fail");
  const tG = guardFraming(cur.thesis || "", allowedLabels), wG = guardFraming(cur.whyRole || "", allowedLabels);
  if (tG.violated || wG.violated) violations.push("authored numerals stripped from prose");
  const scorecardKeys = (cur.scorecardKeys || []).filter((k: string) => HEADLINE_KEYS.includes(k)).slice(0, 6);
  const viable = evidenceIds.length > 0 && hasFalsifier && tG.text.length > 0 && unknownTokens.length === 0 && offAnchor.length === 0 && whyTokens.length === 0;
  return { viable, violations, curation: viable ? { thesis: tG.text, whyRole: wG.text, evidenceIds, testIds, widgetIds, scorecardKeys, rationaleTags: cur.rationaleTags || [], source: "live" } : null };
}
