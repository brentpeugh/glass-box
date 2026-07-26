/** Proof that the extracted curation modules are reachable and behave (docs/briefs/extraction.md §6).
 *  A small set of assertions — enough to prove the extraction worked, not a full suite.
 *  Run: npx tsx scripts/validate-curation.ts   → reports N/N.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { E, initEngine, setBaseDS, BASE_DS } from "../src/engine";
import { buildCatalog } from "../src/catalog";
import { deriveShape, selectPartition, fillPartition, PARTITIONS } from "../src/layout";
import { fallbackCuration, curate } from "../src/curate";
import { perturbedDataset } from "../src/perturbations";
import { WIDGET_DOMAIN, RELATED_DOMAINS } from "../src/curation";

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
const chart = (kind: string, widget: string) => ({ _kind: kind, widget });

console.log("CURATION MODULE PROOF (extraction reachability)\n");

// 1 — deriveShape + partition selection + fill over three synthetic weight distributions.
//     Every placed item lands in a region; no region is double-filled; the partition is real.
const DISTS: Record<string, any[]> = {
  concentrated: [chart("matrix", "metric_matrix"), chart("line", "magic_line"), chart("line", "accel_line"), chart("hbar", "hbar_nrr")],   // one heavy + light → hero
  diffuse: [chart("combo", "efficiency_combo"), chart("waterfall", "bridge_smb"), chart("waterfall", "bridge_enterprise"), chart("hbar", "hbar_nrr"), chart("stacked_area", "segment_stack")], // comparable → grid/balanced
  single: [chart("line", "magic_line")],   // one item → compact
};
for (const [label, charts] of Object.entries(DISTS)) {
  const shape = deriveShape(charts);
  const findings = [chart("finding_card", "salient_band")];
  const tables = [chart("table", "segment_table")];
  const partId = selectPartition(findings.length, charts, charts, tables.length, null);
  const p = PARTITIONS[partId];
  const placed = fillPartition(p, findings, charts, tables, "CFO");
  const regionKeys = placed.map((pl: any) => `${pl.region.c}|${pl.region.r}`);
  const noDoubleFill = new Set(regionKeys).size === regionKeys.length;
  const allItemsKnown = placed.every((pl: any) => [...charts, ...findings, ...tables].some((it) => it.widget === pl.block.widget));
  const validPartition = !!p && Array.isArray(p.regions) && p.regions.length > 0;
  ok(`deriveShape/${label}: shape=${shape} → partition '${partId}' valid, ${placed.length} placed, no double-fill`,
    validPartition && noDoubleFill && allItemsKnown && placed.length > 0,
    `valid=${validPartition} noDouble=${noDoubleFill} known=${allItemsKnown} placed=${placed.length}`);
}

// 2 — selectPartition is deterministic for identical input.
const charts2 = DISTS.diffuse;
const a = selectPartition(1, charts2, charts2, 1, null);
const b = selectPartition(1, charts2, charts2, 1, null);
ok(`selectPartition deterministic (identical input → '${a}')`, a === b, `${a} vs ${b}`);

// 3 — buildCatalog: filtering the built catalog by a finding's related domains yields only
//     on-domain forms (the board's top-up rule), and the set is non-empty.
const catalog = buildCatalog();
const anchorCFO = roleScopedTopFinding("CFO");
const domain = E.findingNeighborhood(anchorCFO).domain;
const related = RELATED_DOMAINS[domain] || [domain];
const onDomain = Object.keys(catalog).filter((id) => WIDGET_DOMAIN[id] && related.includes(WIDGET_DOMAIN[id]));
const allOnDomain = onDomain.every((id) => related.includes(WIDGET_DOMAIN[id]));
ok(`buildCatalog: ${onDomain.length} forms in finding domains [${related.join(",")}], all on-domain`, onDomain.length > 0 && allOnDomain);

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

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — curation modules: ${pass}/${pass + fail} assertions`);
if (fail > 0) process.exit(1);
