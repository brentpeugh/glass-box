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
  scatter_eff_growth: "efficiency", heatmap_metrics: "efficiency", quadrant_eff: "efficiency",
  indexed_arr: "growth", grouped_growth: "growth", small_mult_arr: "growth",
  dumbbell_ret: "retention", heatmap_retention: "retention",
};
// domains a finding's widgets may draw from when the neighborhood doesn't declare lenses
export const RELATED_DOMAINS: Record<string, string[]> = { retention: ["retention", "concentration"], efficiency: ["efficiency", "growth"], growth: ["growth", "concentration"], concentration: ["concentration", "retention"] };

// model framing may not contain digits — the engine owns every number
// headline-strip metrics the model may curate into the vital-signs scorecard (broader than the
// read's neighborhood — vitals are orientation, not the analytical claim, so not neighborhood-gated)
export const HEADLINE_KEYS = ["nrr", "grr", "gross_margin", "magic_number", "cac_payback", "rule_of_40", "qoq_growth", "net_new_arr", "ent_share"];

export function guardFraming(text: any) { const t = String(text || ""); const violated = /\d/.test(t); return { text: violated ? "" : t, violated }; }

// The coherence validator. Pure: it takes the finding's neighborhood (from the engine),
// the catalog, and the widget-domain map — no renderer state. This is the function the app
// runs live AND the function the discovery-path test proves.
export function validateCurationCore(cur: any, nb: any, catalog: any, widgetDomain: Record<string, string> = WIDGET_DOMAIN) {
  const mSet = new Set(nb.metricIds), tSet = new Set(nb.testIds), fSet = new Set(nb.falsifierIds);
  const rel = nb.lenses || RELATED_DOMAINS[nb.domain] || [nb.domain];
  const violations: string[] = [];
  const evidenceIds = (cur.evidenceIds || []).filter((id: string) => mSet.has(id));
  if (evidenceIds.length < (cur.evidenceIds || []).length) violations.push("evidence outside the finding neighborhood — dropped");
  const testIds = (cur.testIds || []).filter((id: string) => tSet.has(id));
  if (testIds.length < (cur.testIds || []).length) violations.push("unsupported test id(s) — dropped");
  const widgetIds = (cur.widgetIds || []).filter((id: string) => catalog[id] && rel.includes(widgetDomain[id]));
  if (widgetIds.length < (cur.widgetIds || []).length) violations.push("off-domain widget(s) — dropped");
  const hasFalsifier = testIds.some((id: string) => fSet.has(id));
  if (!hasFalsifier) violations.push("no falsifying test selected — a read must be able to fail");
  const tG = guardFraming(cur.thesis || ""), wG = guardFraming(cur.whyRole || "");
  if (tG.violated || wG.violated) violations.push("authored numerals stripped from prose");
  const scorecardKeys = (cur.scorecardKeys || []).filter((k: string) => HEADLINE_KEYS.includes(k)).slice(0, 6);
  const partitionPref = ["analytical", "hero", "balanced"].includes(cur.partitionPref) ? cur.partitionPref : null;
  const viable = evidenceIds.length > 0 && hasFalsifier && tG.text.length > 0;
  return { viable, violations, curation: viable ? { thesis: tG.text, whyRole: wG.text, evidenceIds, testIds, widgetIds, partitionPref, scorecardKeys, rationaleTags: cur.rationaleTags || [], source: "live" } : null };
}
