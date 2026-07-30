/** Proof that the extracted curation modules are reachable and behave (docs/briefs/extraction.md §6).
 *  A small set of assertions — enough to prove the extraction worked, not a full suite.
 *  Run: npx tsx scripts/validate-curation.ts   → reports N/N.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { E, initEngine, setBaseDS, BASE_DS } from "../src/engine";
import { buildCatalog, CHART_MENU } from "../src/catalog";
import { composeBoard, CHART_KINDS, BOARD_SLOTS } from "../src/layout";
import { fallbackCuration, curate, offeredWidgets } from "../src/curate";
import { perturbedDataset } from "../src/perturbations";
import { WIDGET_DOMAIN, validateCurationCore, admissibleLenses } from "../src/curation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const base = JSON.parse(fs.readFileSync(path.join(root, "public/caliper_dataset.json"), "utf8"));
const golden = JSON.parse(fs.readFileSync(path.join(root, "analysis/golden/pre-extraction.json"), "utf8"));

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = "") => { cond ? pass++ : fail++; console.log(`  ${cond ? "✓" : "✗"} ${name}${cond ? "" : "  — " + detail}`); };

setBaseDS(base);
initEngine(base);

// ── replicated glue (stays in App.tsx) — the role-scoped anchor, needed only to reproduce inputs ──
const ROLE_SCOPE: any = { CFO: ["efficiency", "concentration", "retention"], CRO: ["growth", "retention", "concentration"] };
function roleScopedTopFinding(roleKey: string) {
  const scope = ROLE_SCOPE[roleKey] || ROLE_SCOPE.CFO;
  const inScope = E.computeSalience().find((f: any) => scope.includes(E.findingNeighborhood(f).domain));
  return inScope ? { ...inScope, scope: { window: [E.QUARTERS[E.QUARTERS.length - 5], E.QUARTERS[E.QUARTERS.length - 1]] } } : E.topFinding();
}
const catalog = buildCatalog();
const specOf = (lead: string, chartIds: string[]) => ({ sections: [{ heading: "", blocks: [{ widget: lead }, ...chartIds.map((w) => ({ widget: w }))] }] });

console.log("CURATION MODULE PROOF (extraction reachability)\n");

// 1 — composeBoard (the fixed three-slot layout that retired PARTITIONS/deriveShape/selectPartition/
//     fillPartition — see analysis/retired-layout.md): the lede is the finding-card; the panels are
//     the model's chart/table blocks in model order, capped at BOARD_SLOTS, drawn ONLY from the spec
//     (nothing injected), no duplicates.
const CASES: Record<string, { lead: string; charts: string[]; expect: number }> = {
  "three-panel": { lead: "salient_band", charts: ["efficiency_combo", "magic_line", "metric_matrix"], expect: 3 },
  "over-cap":    { lead: "salient_band", charts: ["efficiency_combo", "bridge_smb", "bridge_enterprise", "hbar_nrr", "segment_stack"], expect: 3 },
  "under-fill":  { lead: "masking_card", charts: ["bridge_smb"], expect: 1 },
};
for (const [label, c] of Object.entries(CASES)) {
  const { lede, panels } = composeBoard(specOf(c.lead, c.charts), catalog);
  const specWidgets = new Set([c.lead, ...c.charts]);
  const ledeOk = !!lede && lede.widget === c.lead && catalog[c.lead].kind === "finding_card";
  const countOk = panels.length === c.expect && panels.length <= BOARD_SLOTS;
  const subsetOk = panels.every((p: any) => specWidgets.has(p.widget));
  const noDup = new Set(panels.map((p: any) => p.widget)).size === panels.length;
  const kindsOk = panels.every((p: any) => CHART_KINDS.has(p._kind) || p._kind === "table");
  ok(`composeBoard/${label}: lede=${lede?.widget}, ${panels.length}≤${BOARD_SLOTS} panels, spec-subset, no dup`,
    !!ledeOk && countOk && subsetOk && noDup && kindsOk,
    `lede=${ledeOk} count=${countOk}(${panels.length}) subset=${subsetOk} noDup=${noDup} kinds=${kindsOk}`);
}

// 2 — composeBoard is deterministic for identical input.
const det = (s: any) => composeBoard(s, catalog).panels.map((p: any) => p.widget).join(",");
const s2 = specOf("salient_band", ["efficiency_combo", "magic_line", "metric_matrix"]);
const a = det(s2), b = det(s2);
ok(`composeBoard deterministic (identical input → [${a}])`, a === b, `${a} vs ${b}`);

// 3 — bounded composition (Tuning 2 §b): the board renders ONLY what the model chose — no menu
//     top-up, no default table. A two-chart selection renders exactly two panels (not padded to
//     three), and every rendered panel is a form the model selected.
{
  const chosen = ["efficiency_combo", "magic_line"];
  const { panels } = composeBoard(specOf("salient_band", chosen), catalog);
  const twoNotThree = panels.length === 2;
  const noInjected = panels.every((p: any) => chosen.includes(p.widget));
  ok(`bounded top-up: 2-chart selection → ${panels.length} panels, none injected`,
    twoNotThree && noInjected, `count=${panels.length} noInjected=${noInjected}`);
}

// 4 — fallbackCuration output matches the golden fixture (base state, both roles).
for (const role of ["CFO", "CRO"]) {
  const anchor = roleScopedTopFinding(role);
  const got = JSON.stringify(fallbackCuration(anchor));
  const want = JSON.stringify(golden.states.base.roles[role].fallbackCuration);
  ok(`fallbackCuration matches golden (base/${role})`, got === want, "diverged from analysis/golden/pre-extraction.json");
}

// 5 — perturbedDataset is a pure transform: the base dataset is not mutated.
const snapshot = JSON.stringify(base);
const perturbed = perturbedDataset("improve_cac");
const baseUntouched = JSON.stringify(base) === snapshot && base === BASE_DS;
const perturbedDiffers = JSON.stringify(perturbed) !== snapshot;
ok("perturbedDataset is pure (base dataset not mutated; output differs)", baseUntouched && perturbedDiffers,
  `untouched=${baseUntouched} differs=${perturbedDiffers}`);

// 6 — the injected callModel dependency (§4) is honoured: an injected seam is invoked, and a
//     throwing seam still yields the deterministic fallback (proving injection, not the network).
await (async () => {
  initEngine(base);
  let called = false;
  const injected = async () => { called = true; throw new Error("injected seam reached"); };
  const res = await curate({ role: "CFO" }, catalog, roleScopedTopFinding("CFO"), { callModel: injected });
  ok("curate honours injected callModel (invoked; falls back deterministically)", called && !!res && res.source === "fallback",
    `called=${called} source=${res && res.source}`);
})();

// 7 — one source of truth for domain relatedness: what buildCurationPrompt OFFERS must be a
//     SUBSET of what validateCuration ADMITS, for every finding in both candidate sets. Zero
//     offered-but-inadmissible. (Before the fix, a concentration anchor offered growth forms per
//     RELATED_DOMAINS that the validator dropped per nb.lenses — 30 spurious rejections.)
{
  const offenders: string[] = [];
  let checked = 0;
  for (const [label, ds] of [["base", base], ["perturbed", perturbedDataset("improve_cac")]] as [string, any][]) {
    initEngine(ds);
    const cat = buildCatalog();
    for (const f of E.computeSalience()) {
      const nb = E.findingNeighborhood(f);
      const offered = offeredWidgets(nb, cat);
      // admit the same offered set through the REAL validator; anything dropped is off-domain
      const { curation } = validateCurationCore(
        { thesis: "x", whyRole: "y", evidenceIds: nb.metricIds.slice(0, 1), testIds: [nb.falsifierIds[0]], widgetIds: offered, scorecardKeys: [], rationaleTags: [] },
        nb, cat, WIDGET_DOMAIN);
      const admitted = curation ? curation.widgetIds : [];
      const inadmissible = offered.filter((id: string) => !admitted.includes(id));
      checked++;
      if (inadmissible.length) offenders.push(`${label}/${f.id}(${nb.domain}): ${inadmissible.join(",")}`);
    }
  }
  initEngine(base);
  ok(`offered ⊆ admitted for all ${checked} findings across both states (0 offered-but-inadmissible)`,
    offenders.length === 0, offenders.join(" | "));
}

// 8 — registry integrity (inventory §6 recommendation): every CHART_MENU id resolves in
//     buildCatalog() with a kind in CHART_KINDS (the render-side registry). CHART_KINDS is now the
//     single exported source in src/layout.ts, imported above.
{
  const cat = buildCatalog();
  const menuBad = CHART_MENU.filter((id: string) => !cat[id] || !CHART_KINDS.has(cat[id].kind));
  ok(`every CHART_MENU id resolves in buildCatalog() with a kind in CHART_KINDS`, menuBad.length === 0,
    `unresolved/mismatched: ${menuBad.join(",")}`);
  // Report-only (do NOT assert): chart-kind catalog forms absent from CHART_MENU.
  const chartFormsNotInMenu = Object.keys(cat).filter((id) => CHART_KINDS.has(cat[id].kind) && !CHART_MENU.includes(id));
  console.log(`  · report-only: ${chartFormsNotInMenu.length} chart-kind catalog forms absent from CHART_MENU (not a failure): ${chartFormsNotInMenu.join(", ")}`);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — curation modules: ${pass}/${pass + fail} assertions`);
if (fail > 0) process.exit(1);
