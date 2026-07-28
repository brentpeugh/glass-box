/** Curation inventory harness — RUN 2 (post domain-relatedness fix, commit 3e409c1).
 *
 *  Re-run of docs/briefs/inventory.md. Same design: 2 data states (base, improve_cac) × 2 roles
 *  (CFO, CRO) × 10 repeats = 40 LIVE curation runs, same injected callModel seam, same matched
 *  request parameters, same §2 state-reset gate reported first.
 *
 *  Since the fix landed, buildCurationPrompt now OFFERS via admissibleLenses(nb) (= nb.lenses),
 *  the same value the validator admits by. So `eligibleForms` here uses the real offer
 *  (offeredWidgets) rather than the old RELATED_DOMAINS table.
 *
 *  Writes analysis/curation-inventory-2.{json,md}. DOES NOT touch the run-1 baseline
 *  (analysis/curation-inventory.{json,md}); it reads run 1 to produce the delta section.
 *
 *  MODEL ACCESS: Netlify function BYPASSED. callModel injected at the seam, POSTing to the Anthropic
 *  API with the key from .env.local, request body byte-for-byte per netlify/functions/curate.ts.
 *  Bypassing SKIPS the Origin allowlist and per-IP rate limiter. Prompt from buildCurationPrompt.
 *
 *  Run: npx tsx scripts/inventory-2.ts   (INV2_REUSE=1 re-aggregates cached -2 json, no API calls)
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { E, initEngine, setBaseDS } from "../src/engine";
import { buildCatalog, CHART_MENU } from "../src/catalog";
import { PARTITIONS, selectPartition, fillPartition } from "../src/layout";
import { curate, fallbackCuration, offeredWidgets } from "../src/curate";
import { PERTURBATIONS, perturbedDataset } from "../src/perturbations";
import { WIDGET_DOMAIN, RELATED_DOMAINS } from "../src/curation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const base = JSON.parse(fs.readFileSync(path.join(root, "public/caliper_dataset.json"), "utf8"));

// ── API key from .env.local ──
function loadKey(): string {
  for (const f of [".env.local", ".env"]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.*)\s*$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error("ANTHROPIC_API_KEY not found in .env.local or .env");
}
const KEY = loadKey();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── injected seam: byte-for-byte the body netlify/functions/curate.ts sends. NO temperature
//    (→ API default 1.0), NO system, NO stop_sequences. Same matched parameters as run 1. ──
const MODEL: Record<string, string> = { curate: "claude-sonnet-4-6", intent: "claude-haiku-4-5-20251001", narrate: "claude-haiku-4-5-20251001" };
const MAX: Record<string, number> = { curate: 1200, intent: 400, narrate: 300 };
let lastMeta: any = null;
let rateLimitHits = 0;
async function directCallModel(task: string, messages: any[], max_tokens: number, _model?: string) {
  const body = { model: MODEL[task], max_tokens: Math.min(Number(max_tokens) || MAX[task], MAX[task]), messages };
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    if ((res.status === 429 || res.status === 529)) {
      rateLimitHits++;
      const txt = await res.text();
      if (attempt < 5) { await sleep(2500 * (attempt + 1)); continue; }
      lastMeta = { status: res.status, error: txt.slice(0, 300) };
      throw new Error("model " + res.status);
    }
    if (!res.ok) { lastMeta = { status: res.status, error: (await res.text()).slice(0, 300) }; throw new Error("model " + res.status); }
    const data = await res.json();
    lastMeta = { status: res.status, stop_reason: data.stop_reason, usage: data.usage, model: data.model };
    return data;
  }
}

// ── replicated glue (matches App.tsx render layer) ──
const CHART_KINDS = (() => {
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  const m = app.match(/const CHART_KINDS = new Set\(\[([^\]]*)\]\)/);
  if (!m) throw new Error("could not locate CHART_KINDS in App.tsx");
  return new Set(m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean));
})();
const ROLE_SCOPE: any = { CFO: ["efficiency", "concentration", "retention"], CRO: ["growth", "retention", "concentration"] };
function roleScopedTopFinding(roleKey: string) {
  const scope = ROLE_SCOPE[roleKey] || ROLE_SCOPE.CFO;
  const inScope = E.computeSalience().find((f: any) => scope.includes(E.findingNeighborhood(f).domain));
  return inScope ? { ...inScope, scope: { window: [E.QUARTERS[E.QUARTERS.length - 5], E.QUARTERS[E.QUARTERS.length - 1]] } } : E.topFinding();
}
function buildSpec(curation: any) {
  const isRetention = curation.finding && E.findingNeighborhood(curation.finding).domain === "retention";
  const lead = isRetention ? ["masking_card"] : ["salient_band"];
  const ids = [...lead, ...(curation.widgetIds || []).filter((id: string) => !lead.includes(id))];
  return { sections: [{ heading: "", blocks: ids.map((id: string, i: number) => (id === "masking_card" || i === 0) ? { widget: id, emphasis: "hero", headline: "", soWhat: i === 0 ? curation.thesis : "" } : { widget: id, emphasis: "standard", headline: "", soWhat: "" }) }] };
}
function deriveBoard(spec: any, catalog: any, role: string, partitionPref: any, finding: any) {
  const kind = (id: string) => catalog[id]?.kind;
  const all = spec.sections.flatMap((s: any) => s.blocks).filter((b: any) => catalog[b.widget]).map((b: any) => ({ ...b, _kind: kind(b.widget) }));
  const findings = all.filter((b: any) => b._kind === "finding_card");
  const modelCharts = all.filter((b: any) => CHART_KINDS.has(b._kind));
  const chosen = new Set(modelCharts.map((b: any) => b.widget));
  // board top-up still uses RELATED_DOMAINS — App.tsx:773 is unchanged by the fix (board-composition
  // relatedness is a distinct concept from admissibleLenses; "concentration tops up with growth, not
  // retention bridges"). deriveBoard mirrors the app verbatim.
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
  return { partitionId, regions: placed.map((pl: any, i: number) => ({ index: i, form: pl.block.widget, aspect: pl.region.a })) };
}

// ── shared axes ──
const STATES = ["base", "improve_cac"] as const;
const ROLES = ["CFO", "CRO"] as const;
const CELLS = STATES.flatMap((s) => ROLES.map((r) => `${s}/${r}`));
const allForms = Object.keys(WIDGET_DOMAIN);
const RETENTION7 = allForms.filter((f) => WIDGET_DOMAIN[f] === "retention");
const cellKey = (r: any) => `${r.state}/${r.role}`;
const jaccard = (a: string[], b: string[]) => { const A = new Set(a), B = new Set(b); const inter = [...A].filter((x) => B.has(x)).length; const uni = new Set([...a, ...b]).size; return uni ? inter / uni : 1; };

setBaseDS(base);
function resetTo(state: string) { initEngine(state === "base" ? base : perturbedDataset("improve_cac")); }
function candidateSet() { return E.computeSalience().map((f: any) => ({ id: f.id, dim: f.dim, metric: f.metric, label: f.label, domain: E.findingNeighborhood(f).domain, salience: f.z, raw: f.raw })); }
function eligibleForms(nb: any, catalog: any) { return offeredWidgets(nb, catalog).map((id: string) => ({ id, domain: WIDGET_DOMAIN[id] })); }  // POST-FIX offer = admissibleLenses
function parseRaw(raw: any) { try { return JSON.parse(String(raw).replace(/```json|```/g, "").trim()); } catch { return null; } }

// ════════════════════════ §2 STATE-RESET ASSERTION (gate) ════════════════════════
resetTo("base"); const baseC1 = candidateSet();
resetTo("improve_cac"); const pertC = candidateSet();
resetTo("base"); const baseC2 = candidateSet();
const resetPass = JSON.stringify(baseC1) === JSON.stringify(baseC2);
const perturbationReal = JSON.stringify(baseC1) !== JSON.stringify(pertC);
console.log(`§2 STATE-RESET ASSERTION: ${resetPass ? "PASS" : "FAIL"} (base→perturbed→base, base candidate sets ${resetPass ? "byte-identical" : "DIVERGED"})`);
console.log(`   perturbation actually changes candidates: ${perturbationReal}`);
if (!resetPass) { console.error("STOP: state reset failed — downstream data would be contaminated (§2)."); process.exit(1); }

// ════════════════════════ §3 THE HARNESS — 40 live runs ════════════════════════
const REUSE = process.env.INV2_REUSE === "1" && fs.existsSync(path.join(root, "analysis/curation-inventory-2.json"));
let runs: any[] = [];
let runId = 0;
if (REUSE) {
  const prev = JSON.parse(fs.readFileSync(path.join(root, "analysis/curation-inventory-2.json"), "utf8"));
  runs = prev.runs; rateLimitHits = prev.meta.rateLimitHits || 0;
  console.log(`\nINV2_REUSE=1 — re-aggregating ${runs.length} cached runs (no API calls).`);
} else {
  console.log(`\nRunning ${STATES.length * ROLES.length * 10} live curations (temp=default 1.0, model=${MODEL.curate}) …`);
  for (const state of STATES) {
    for (const role of ROLES) {
      for (let rep = 0; rep < 10; rep++) {
        resetTo(state);                       // reset shared engine state before EVERY run (§2)
        const catalog = buildCatalog();
        const anchor = roleScopedTopFinding(role);
        const nb = E.findingNeighborhood(anchor);
        const eligible = eligibleForms(nb, catalog);
        let result: any, err: any = null;
        try { result = await curate({ role }, catalog, anchor, { callModel: directCallModel }); }
        catch (e) { err = String(e); result = { ...fallbackCuration(anchor), finding: anchor, violations: ["harness: " + err], source: "fallback", _debug: { raw: err } }; }
        const meta = lastMeta;
        const parsed = parseRaw(result._debug && result._debug.raw);
        const requested = parsed && Array.isArray(parsed.widgetIds) ? parsed.widgetIds : null;
        const spec = buildSpec(result);
        const board = deriveBoard(spec, catalog, role, result.partitionPref, result.finding);
        const run = {
          runId: runId++, state, role, repeat: rep, source: result.source,
          finding: { id: anchor.id, label: anchor.label, domain: nb.domain, salience: anchor.z },
          candidateForms: eligible,
          selectedForms: result.widgetIds || [],
          requestedForms: requested,
          panelCount: (result.widgetIds || []).length,
          partitionId: board.partitionId,
          regions: board.regions,
          rejections: { count: (result.violations || []).length, guards: result.violations || [], droppedWidgets: requested ? requested.filter((id: string) => !(result.widgetIds || []).includes(id)) : null },
          modelResponse: (result._debug && result._debug.raw) || "",
          apiMeta: meta,
        };
        runs.push(run);
        process.stdout.write(`  ${state}/${role}/#${rep} → ${result.source}${result.source === "live" ? ` · ${run.selectedForms.length} panels · ${board.partitionId}` : " (FALLBACK)"}${result.source === "live" && run.rejections.count ? ` · rej:${run.rejections.guards.join("|")}` : ""}\n`);
        await sleep(350);
      }
    }
  }
}

// ════════════════════════ raw dump ════════════════════════
const outJson = {
  meta: {
    run: 2, base: "3e409c1 (post domain-relatedness fix)",
    generated: "live via injected Anthropic seam (Netlify function bypassed — no Origin check, no rate limiter)",
    model: MODEL.curate, temperature: "unset (API default 1.0)", max_tokens: Math.min(600, MAX.curate),
    endpoint: "https://api.anthropic.com/v1/messages", anthropicVersion: "2023-06-01",
    design: `${STATES.length} states × ${ROLES.length} roles × 10 repeats = ${runs.length} runs`,
    offerSource: "admissibleLenses(nb) via offeredWidgets (post-fix)",
    stateResetAssertion: resetPass ? "PASS" : "FAIL", perturbationChangesCandidates: perturbationReal, rateLimitHits,
  },
  candidateSets: { base: baseC1, improve_cac: pertC },
  runs,
};
fs.mkdirSync(path.join(root, "analysis"), { recursive: true });
fs.writeFileSync(path.join(root, "analysis/curation-inventory-2.json"), JSON.stringify(outJson, null, 2) + "\n");

// ════════════════════════ aggregation (shared for run 2 body AND the delta vs run 1) ════════════════════════
function aggregate(rs: any[]) {
  const live = rs.filter((r) => r.source === "live");
  const fallback = rs.filter((r) => r.source !== "live");
  const selectedCount: Record<string, number> = {}, eligibleCount: Record<string, number> = {};
  for (const f of allForms) { selectedCount[f] = 0; eligibleCount[f] = 0; }
  for (const r of live) { for (const e of r.candidateForms) eligibleCount[e.id] = (eligibleCount[e.id] || 0) + 1; for (const id of r.selectedForms) selectedCount[id] = (selectedCount[id] || 0) + 1; }
  const everEligible = allForms.filter((f) => eligibleCount[f] > 0);
  const selected = allForms.filter((f) => selectedCount[f] > 0);
  const passedOver = everEligible.filter((f) => selectedCount[f] === 0);
  const neverEligible = allForms.filter((f) => eligibleCount[f] === 0);
  const partFreq: Record<string, number> = {}; for (const r of live) partFreq[r.partitionId] = (partFreq[r.partitionId] || 0) + 1;
  const neverProduced = Object.keys(PARTITIONS).filter((p) => !partFreq[p]);
  const divergence: Record<string, any> = {};
  for (const state of STATES) {
    const cfo = live.filter((r) => r.state === state && r.role === "CFO");
    const cro = live.filter((r) => r.state === state && r.role === "CRO");
    const js: number[] = []; const n = Math.min(cfo.length, cro.length);
    for (let i = 0; i < n; i++) js.push(jaccard(cfo[i].selectedForms, cro[i].selectedForms));
    divergence[state] = { meanJaccard: js.length ? js.reduce((a, b) => a + b, 0) / js.length : null, pairs: js.length };
  }
  const nd: Record<string, any> = {};
  for (const cell of CELLS) {
    const rs2 = live.filter((r) => cellKey(r) === cell);
    if (!rs2.length) { nd[cell] = { n: 0 }; continue; }
    const sel = rs2.map((r) => r.selectedForms.join(",")), part = rs2.map((r) => r.partitionId), pc = rs2.map((r) => r.panelCount);
    const modal = (arr: string[]) => { const c: Record<string, number> = {}; arr.forEach((x) => c[x] = (c[x] || 0) + 1); return Math.max(...Object.values(c)); };
    nd[cell] = { n: rs2.length, distinctSelections: new Set(sel).size, modalSelectionShare: modal(sel) / rs2.length, distinctPartitions: new Set(part).size, modalPartitionShare: modal(part) / rs2.length, distinctPanelCounts: new Set(pc).size };
  }
  let totalRejections = 0; const guardTally: Record<string, number> = {};
  const rejByCell: Record<string, any> = {};
  for (const cell of CELLS) { const rs2 = rs.filter((r) => cellKey(r) === cell); rejByCell[cell] = { total: rs2.reduce((a, r) => a + r.rejections.count, 0), withRej: rs2.filter((r) => r.rejections.count > 0).length }; }
  for (const r of rs) { totalRejections += r.rejections.count; for (const g of r.rejections.guards) guardTally[g] = (guardTally[g] || 0) + 1; }
  return { live, fallback, selectedCount, eligibleCount, selected, passedOver, neverEligible, partFreq, neverProduced, divergence, nd, totalRejections, guardTally, rejByCell };
}
const A2 = aggregate(runs);
const run1 = JSON.parse(fs.readFileSync(path.join(root, "analysis/curation-inventory.json"), "utf8"));
const A1 = aggregate(run1.runs);

// ════════════════════════ markdown ════════════════════════
const pct = (x: number) => (x * 100).toFixed(0) + "%";
const num = (x: number | null) => x == null ? "—" : x.toFixed(2);
const sign = (x: number) => (x > 0 ? "+" : "") + x;
let md = "";
md += `# Curation Inventory — Run 2 (post domain-relatedness fix)\n\n`;
md += `Base: main @ 3e409c1. Re-run of docs/briefs/inventory.md. The offer/admit fix landed, so the offered menu changed for concentration anchors; run-1 form-level results are stale. Run 1 (baseline) preserved at analysis/curation-inventory.{json,md}.\n\n`;
md += `**State-reset assertion (§2):** ${resetPass ? "**PASS**" : "**FAIL**"} — base → perturbed → base, base candidate sets ${resetPass ? "byte-identical" : "DIVERGED"}. Perturbation changes candidates: ${perturbationReal}.\n\n`;
md += `**Model access:** Netlify function **bypassed** — \`callModel\` injected at the seam, direct to \`api.anthropic.com/v1/messages\`, key from \`.env.local\`. Skips **Origin allowlist** + **per-IP rate limiter**. Prompt from \`buildCurationPrompt\`. Matched params: \`model=${MODEL.curate}\`, \`max_tokens=${Math.min(600, MAX.curate)}\`, **temperature unset → API default 1.0**, no system, no stop. Offer now sourced from \`admissibleLenses(nb)\` (post-fix).\n\n`;
md += `**Run counts:** total ${runs.length} · live ${A2.live.length} · fallback ${A2.fallback.length} · excluded ${A2.fallback.length}. Rate-limit (429/529): ${rateLimitHits}.\n\n`;

// selection frequency
md += `## Selection frequency per form (live)\n\n| form | domain | eligible | selected | rate |\n|---|---|--:|--:|--:|\n`;
for (const f of allForms.slice().sort((a, b) => (A2.selectedCount[b] / (A2.eligibleCount[b] || 1)) - (A2.selectedCount[a] / (A2.eligibleCount[a] || 1)))) {
  md += `| ${f} | ${WIDGET_DOMAIN[f]} | ${A2.eligibleCount[f]} | ${A2.selectedCount[f]} | ${A2.eligibleCount[f] ? pct(A2.selectedCount[f] / A2.eligibleCount[f]) : "n/a"} |\n`;
}
md += `\n**SELECTED:** ${A2.selected.join(", ") || "—"}\n\n**PASSED OVER:** ${A2.passedOver.join(", ") || "—"}\n\n**NEVER ELIGIBLE:** ${A2.neverEligible.join(", ") || "—"}\n\n`;

// partitions / divergence / nondeterminism / rejections
md += `## Partition frequency (live)\n\n| partition | count |\n|---|--:|\n`;
for (const [p, c] of Object.entries(A2.partFreq).sort((a, b) => b[1] - a[1])) md += `| ${p} | ${c} |\n`;
md += `\n**Never produced:** ${A2.neverProduced.join(", ") || "—"}\n\n`;
md += `## Role divergence\n\n`;
for (const s of STATES) md += `- **${s}**: mean Jaccard(CFO,CRO) over ${A2.divergence[s].pairs} pairs = **${num(A2.divergence[s].meanJaccard)}**\n`;
md += `\n## Nondeterminism (within-cell, 10 repeats)\n\n| cell | distinct selections | modal-selection share | distinct partitions | distinct panel counts |\n|---|--:|--:|--:|--:|\n`;
for (const cell of CELLS) { const x = A2.nd[cell]; md += x.n ? `| ${cell} | ${x.distinctSelections} | ${pct(x.modalSelectionShare)} | ${x.distinctPartitions} | ${x.distinctPanelCounts} |\n` : `| ${cell} | — | — | — | — |\n`; }
md += `\n## Rejections per cell\n\n| cell | total rejections | runs w/ ≥1 |\n|---|--:|--:|\n`;
for (const cell of CELLS) md += `| ${cell} | ${A2.rejByCell[cell].total} | ${A2.rejByCell[cell].withRej} |\n`;
md += `\nGuard totals: ${Object.entries(A2.guardTally).map(([g, c]) => `${g} ×${c}`).join("; ") || "none"}.\n\n`;

// ════════════════════════ DELTA vs run 1 (first-class output) ════════════════════════
md += `## Δ Delta vs run 1 (baseline analysis/curation-inventory.json)\n\n`;
md += `Report of movement only — no interpretation.\n\n`;

// 1. rejection count
md += `### 1. Rejection count\n\n`;
md += `Run 1 total: **${A1.totalRejections}** · Run 2 total: **${A2.totalRejections}** · Δ **${sign(A2.totalRejections - A1.totalRejections)}**.\n\n`;
md += `Guards — run 1: ${Object.entries(A1.guardTally).map(([g, c]) => `${g} ×${c}`).join("; ") || "none"} · run 2: ${Object.entries(A2.guardTally).map(([g, c]) => `${g} ×${c}`).join("; ") || "none"}.\n\n`;

// 2. retention forms
md += `### 2. Retention forms (the 7 previously NEVER ELIGIBLE)\n\n| form | run1 selected | run2 selected | run2 eligible | Δ selected |\n|---|--:|--:|--:|--:|\n`;
for (const f of RETENTION7) md += `| ${f} | ${A1.selectedCount[f]} | ${A2.selectedCount[f]} | ${A2.eligibleCount[f]} | ${sign(A2.selectedCount[f] - A1.selectedCount[f])} |\n`;
const retGain = RETENTION7.reduce((a, f) => a + (A2.selectedCount[f] - A1.selectedCount[f]), 0);
// what they displaced: forms whose selection count dropped run1→run2
const displaced = allForms.filter((f) => A2.selectedCount[f] < A1.selectedCount[f]).map((f) => ({ f, d: A2.selectedCount[f] - A1.selectedCount[f] })).sort((a, b) => a.d - b.d);
md += `\nRetention selections gained (Σ): **${sign(retGain)}**. Forms that lost selections run1→run2 (displaced): ${displaced.length ? displaced.map((x) => `${x.f} (${x.d})`).join(", ") : "none"}.\n\n`;

// 3. SELECTED / PASSED OVER list changes
const setDiff = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));
md += `### 3. SELECTED / PASSED OVER changes\n\n`;
md += `SELECTED added (run2 not run1): ${setDiff(A2.selected, A1.selected).join(", ") || "none"}\n\n`;
md += `SELECTED removed (run1 not run2): ${setDiff(A1.selected, A2.selected).join(", ") || "none"}\n\n`;
md += `PASSED OVER added (run2 not run1): ${setDiff(A2.passedOver, A1.passedOver).join(", ") || "none"}\n\n`;
md += `PASSED OVER removed (run1 not run2): ${setDiff(A1.passedOver, A2.passedOver).join(", ") || "none"}\n\n`;
md += `NEVER ELIGIBLE — run1: ${A1.neverEligible.join(", ") || "—"} · run2: ${A2.neverEligible.join(", ") || "—"}\n\n`;

// 4. partition frequency
md += `### 4. Partition frequency\n\n`;
md += `Never-produced count — run1: **${A1.neverProduced.length} of ${Object.keys(PARTITIONS).length}** · run2: **${A2.neverProduced.length} of ${Object.keys(PARTITIONS).length}** · Δ **${sign(A2.neverProduced.length - A1.neverProduced.length)}**.\n\n`;
md += `Partitions newly PRODUCED in run2 (absent in run1): ${setDiff(A1.neverProduced, A2.neverProduced).join(", ") || "none"}\n\n`;
md += `Partitions newly ABSENT in run2 (produced in run1): ${setDiff(A2.neverProduced, A1.neverProduced).join(", ") || "none"}\n\n`;
md += `| partition | run1 | run2 |\n|---|--:|--:|\n`;
for (const p of Object.keys(PARTITIONS)) md += `| ${p} | ${A1.partFreq[p] || 0} | ${A2.partFreq[p] || 0} |\n`;

// 5. role divergence
md += `\n### 5. Role divergence (mean Jaccard CFO vs CRO)\n\n| state | run1 | run2 | Δ |\n|---|--:|--:|--:|\n`;
for (const s of STATES) { const a = A1.divergence[s].meanJaccard, b = A2.divergence[s].meanJaccard; md += `| ${s} | ${num(a)} | ${num(b)} | ${a == null || b == null ? "—" : sign(Number((b - a).toFixed(2)))} |\n`; }

// 6. nondeterminism
md += `\n### 6. Nondeterminism (distinct selections · modal-selection share)\n\n| cell | run1 distinct | run1 modal | run2 distinct | run2 modal | Δ distinct |\n|---|--:|--:|--:|--:|--:|\n`;
for (const cell of CELLS) {
  const a = A1.nd[cell], b = A2.nd[cell];
  const ad = a.n ? a.distinctSelections : null, bd = b.n ? b.distinctSelections : null;
  md += `| ${cell} | ${ad ?? "—"} | ${a.n ? pct(a.modalSelectionShare) : "—"} | ${bd ?? "—"} | ${b.n ? pct(b.modalSelectionShare) : "—"} | ${ad == null || bd == null ? "—" : sign(bd - ad)} |\n`;
}
md += `\n`;

fs.writeFileSync(path.join(root, "analysis/curation-inventory-2.md"), md);
console.log(`\nwrote analysis/curation-inventory-2.json (${runs.length} runs) + analysis/curation-inventory-2.md`);
console.log(`live=${A2.live.length} fallback=${A2.fallback.length} rejections: run1=${A1.totalRejections} run2=${A2.totalRejections} rateLimitHits=${rateLimitHits}`);
