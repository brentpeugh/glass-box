/** Golden-fixture generator for the curation-extraction refactor (docs/briefs/extraction.md §2).
 *
 *  Captures the DETERMINISTIC (no-model) curation behaviour so the extraction can be proved
 *  byte-identical. For the base dataset AND the one perturbation state, for BOTH roles, it records:
 *    - the full engine candidate set (findings, ids, salience components)
 *    - fallbackCuration output (selection, order, every field)
 *    - the derived board shape (partition id, region assignments, region aspects)
 *    - a structural digest of the built catalog
 *
 *  The MOVED functions are imported below; the un-moved glue (roleScopedTopFinding, the
 *  spec build, the TemplateBoard board-derivation, the CHART_KINDS set) is replicated VERBATIM
 *  from src/App.tsx so the capture reflects the real app. Only the import block changes between
 *  the pre-extraction run (from ../src/App) and the post-extraction run (from the new modules).
 *
 *  Run: npx tsx scripts/gen-golden.ts [outPath]
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ── MOVED SURFACE (post-extraction: imported from the new module boundary) ──
import { E, initEngine } from "../src/engine";
import { buildCatalog, CHART_MENU } from "../src/catalog";
import { fallbackCuration } from "../src/curate";
import { deriveShape, selectPartition, fillPartition, PARTITIONS } from "../src/layout";
import { PERTURBATIONS } from "../src/perturbations";
// ─────────────────────────────────────────────────────────────────────────────────────────
import { WIDGET_DOMAIN, RELATED_DOMAINS } from "../src/curation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const base = JSON.parse(fs.readFileSync(path.join(root, "public/caliper_dataset.json"), "utf8"));

// ── replicated glue (stays in App.tsx; copied verbatim so the fixture reflects the real board) ──
const CHART_KINDS = new Set(["waterfall", "combo", "line", "stacked_area", "hbar", "bullet", "matrix", "scatter", "pareto", "heatmap", "indexed", "dumbbell", "treemap", "grouped", "quadrant", "small_multiples", "lorenz"]);
const ROLE_SCOPE: any = {
  CFO: ["efficiency", "concentration", "retention"],
  CRO: ["growth", "retention", "concentration"],
};
function roleScopedTopFinding(roleKey: string) {
  const scope = ROLE_SCOPE[roleKey] || ROLE_SCOPE.CFO;
  const inScope = E.computeSalience().find((f: any) => scope.includes(E.findingNeighborhood(f).domain));
  return inScope ? { ...inScope, scope: { window: [E.QUARTERS[E.QUARTERS.length - 5], E.QUARTERS[E.QUARTERS.length - 1]] } } : E.topFinding();
}
// spec build — buildCuratedState (App.tsx) lines building `spec` from a curation + anchor
function buildSpec(curation: any) {
  const isRetention = curation.finding && E.findingNeighborhood(curation.finding).domain === "retention";
  const lead = isRetention ? ["masking_card"] : ["salient_band"];
  const ids = [...lead, ...(curation.widgetIds || []).filter((id: string) => !lead.includes(id))];
  return { sections: [{ heading: "", blocks: ids.map((id: string, i: number) => (id === "masking_card" || i === 0) ? { widget: id, emphasis: "hero", headline: "", soWhat: i === 0 ? curation.thesis : "" } : { widget: id, emphasis: "standard", headline: "", soWhat: "" }) }] };
}
// board derivation — TemplateBoard (App.tsx): compose model + menu charts, pick a partition, fill it
function deriveBoard(spec: any, catalog: any, role: string, partitionPref: any, finding: any) {
  const kind = (id: string) => catalog[id]?.kind;
  const all = spec.sections.flatMap((s: any) => s.blocks).filter((b: any) => catalog[b.widget]).map((b: any) => ({ ...b, _kind: kind(b.widget) }));
  const findings = all.filter((b: any) => b._kind === "finding_card");
  const modelCharts = all.filter((b: any) => CHART_KINDS.has(b._kind));
  const chosen = new Set(modelCharts.map((b: any) => b.widget));
  const findingDomain = finding ? (() => { try { return E.findingNeighborhood(finding).domain; } catch { return null; } })() : null;
  const related = findingDomain ? (RELATED_DOMAINS[findingDomain] || [findingDomain]) : null;
  const scopedIds = related
    ? Object.keys(catalog).filter((id) => catalog[id] && CHART_KINDS.has(catalog[id].kind) && related.includes(WIDGET_DOMAIN[id]) && !chosen.has(id))
        .sort((a, b) => (WIDGET_DOMAIN[a] === findingDomain ? 0 : 1) - (WIDGET_DOMAIN[b] === findingDomain ? 0 : 1))
    : CHART_MENU.filter((id: string) => catalog[id] && CHART_KINDS.has(catalog[id].kind) && !chosen.has(id));
  const menuCharts = scopedIds.map((id: string) => ({ widget: id, _kind: catalog[id].kind }));
  const charts = [...modelCharts, ...menuCharts];
  const modelTables = all.filter((b: any) => b._kind === "table");
  const tables = modelTables.length ? modelTables : (catalog["segment_table"] ? [{ widget: "segment_table", _kind: "table" }] : []);
  const partitionId = selectPartition(findings.length, modelCharts, charts, tables.length, partitionPref);
  const p = PARTITIONS[partitionId];
  const placed = fillPartition(p, findings, charts, tables, role);
  return {
    partitionId,
    shape: deriveShape(modelCharts.length >= 3 ? modelCharts : charts),
    regions: placed.map((pl: any) => ({ a: pl.region.a, c: pl.region.c, r: pl.region.r, widget: pl.block.widget, kind: pl.block._kind })),
  };
}
// perturbedDataset without the module-global BASE_DS — same transform, transparent input setup
function perturb(name: string) {
  const d = JSON.parse(JSON.stringify(base));
  PERTURBATIONS[name].apply(d);
  return d;
}

// ── capture ──
const ROLES = ["CFO", "CRO"];
function candidateSet() {
  return E.computeSalience().map((f: any) => ({
    id: f.id, dim: f.dim, metric: f.metric, label: f.label, raw: f.raw, z: f.z,
    mvIds: (f.mvs || []).map((m: any) => m.id),
  }));
}
function catalogDigest(catalog: any) {
  const out: any = {};
  for (const id of Object.keys(catalog)) {
    const c = catalog[id];
    out[id] = { kind: c.kind, polarity: c.polarity ?? null, title: c.title ?? null, desc: c.desc ?? null, dataKeys: Object.keys(c.data || {}) };
  }
  return out;
}
function captureState(label: string, ds: any) {
  initEngine(ds);
  const catalog = buildCatalog();
  const roles: any = {};
  for (const role of ROLES) {
    const anchor = roleScopedTopFinding(role);
    const fb = fallbackCuration(anchor);
    const curation = { ...fb, finding: anchor };
    const spec = buildSpec(curation);
    const board = deriveBoard(spec, catalog, role, curation.partitionPref, curation.finding);
    roles[role] = {
      anchor: anchor ? { id: anchor.id, label: anchor.label } : null,
      fallbackCuration: fb,
      specWidgets: spec.sections[0].blocks.map((b: any) => b.widget),
      board,
    };
  }
  return { label, candidates: candidateSet(), catalog: catalogDigest(catalog), roles };
}

const fixture = {
  meta: { about: "golden fixture — deterministic curation behaviour, pre-extraction baseline", roles: ROLES },
  states: {
    base: captureState("base", base),
    perturbed_improve_cac: captureState("perturbed:improve_cac", perturb("improve_cac")),
  },
};

const outPath = process.argv[2] || path.join(root, "analysis/golden/pre-extraction.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2) + "\n");
console.log(`wrote ${path.relative(root, outPath)} · states: ${Object.keys(fixture.states).join(", ")} · roles: ${ROLES.join(", ")}`);
