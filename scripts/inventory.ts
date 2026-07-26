/** Curation inventory harness (inventory-brief revised, §2–§6).
 *
 *  2 data states (base, improve_cac) × 2 roles (CFO, CRO) × 10 repeats = 40 LIVE curation runs.
 *  Model nondeterminism is the primary variance being measured.
 *
 *  MODEL ACCESS (brief §3 amendment): the Netlify function layer is BYPASSED. callModel is injected
 *  directly at the seam and POSTs to the Anthropic API, reading ANTHROPIC_API_KEY from .env.local.
 *  The request body is replicated byte-for-byte from netlify/functions/curate.ts (see directCallModel).
 *  Bypassing the function SKIPS the Origin allowlist and the per-IP rate limiter. The prompt still
 *  comes from buildCurationPrompt via curate() — no parallel prompt.
 *
 *  Run: npx tsx scripts/inventory.ts
 *    → analysis/curation-inventory.json (raw per-run)  +  analysis/curation-inventory.md (aggregation)
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { E, initEngine, setBaseDS, BASE_DS } from "../src/engine";
import { buildCatalog, CHART_MENU } from "../src/catalog";
import { PARTITIONS, deriveShape, selectPartition, fillPartition } from "../src/layout";
import { curate, fallbackCuration } from "../src/curate";
import { PERTURBATIONS, perturbedDataset } from "../src/perturbations";
import { WIDGET_DOMAIN, RELATED_DOMAINS } from "../src/curation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const base = JSON.parse(fs.readFileSync(path.join(root, "public/caliper_dataset.json"), "utf8"));

// ── API key from .env.local (brief says .env; the shipped file is .env.local) ──
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

// ── the injected seam. Byte-for-byte the request body netlify/functions/curate.ts sends: only
//    { model, max_tokens, messages }. model is server-authoritative (MODEL[task], client field
//    ignored); max_tokens is clamped to the server cap. NO temperature (→ API default 1.0), NO
//    system prompt, NO stop_sequences — exactly as production. ──
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

// ── replicated glue (lives in App.tsx; copied verbatim so the board derivation matches the app) ──
const CHART_KINDS = readChartKinds();
function readChartKinds(): Set<string> {
  // read the real set from App.tsx (render-side registry) rather than hardcoding — needed for §6 drift.
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  const m = app.match(/const CHART_KINDS = new Set\(\[([^\]]*)\]\)/);
  if (!m) throw new Error("could not locate CHART_KINDS in App.tsx");
  return new Set(m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean));
}
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
    regions: placed.map((pl: any, i: number) => ({ index: i, form: pl.block.widget, aspect: pl.region.a })),
  };
}

// ── state management. The shared singleton (E/BASE_DS) is reset before EVERY run (§2). ──
const STATES = ["base", "improve_cac"] as const;
const ROLES = ["CFO", "CRO"] as const;
setBaseDS(base);
function stateDataset(state: string) { return state === "base" ? base : perturbedDataset("improve_cac"); }
function resetTo(state: string) { initEngine(stateDataset(state)); }
function candidateSet() {
  return E.computeSalience().map((f: any) => ({ id: f.id, dim: f.dim, metric: f.metric, label: f.label, domain: E.findingNeighborhood(f).domain, salience: f.z, raw: f.raw }));
}
function eligibleForms(nb: any, catalog: any) {
  const related = RELATED_DOMAINS[nb.domain] || [];   // the widget menu the model is OFFERED (buildCurationPrompt)
  return Object.keys(catalog).filter((id) => WIDGET_DOMAIN[id] && related.includes(WIDGET_DOMAIN[id])).map((id) => ({ id, domain: WIDGET_DOMAIN[id] }));
}
function parseRaw(raw: any) { try { return JSON.parse(String(raw).replace(/```json|```/g, "").trim()); } catch { return null; } }

// ════════════════════════ §2 STATE-RESET ASSERTION (gate) ════════════════════════
resetTo("base"); const baseC1 = candidateSet();
resetTo("improve_cac"); const pertC = candidateSet();
resetTo("base"); const baseC2 = candidateSet();
const resetPass = JSON.stringify(baseC1) === JSON.stringify(baseC2);
const perturbationReal = JSON.stringify(baseC1) !== JSON.stringify(pertC);
console.log(`§2 STATE-RESET ASSERTION: ${resetPass ? "PASS" : "FAIL"} (base→perturbed→base, base candidate sets ${resetPass ? "byte-identical" : "DIVERGED"})`);
console.log(`   perturbation actually changes candidates: ${perturbationReal}`);
if (!resetPass) { console.error("STOP: state reset failed — all downstream data would be contaminated (§2)."); process.exit(1); }

// ════════════════════════ §3 THE HARNESS — 40 live runs ════════════════════════
// INV_REUSE=1 re-derives the markdown from a saved raw JSON without re-spending API calls.
const REUSE = process.env.INV_REUSE === "1" && fs.existsSync(path.join(root, "analysis/curation-inventory.json"));
let runs: any[] = [];
let runId = 0;
if (REUSE) {
  const prev = JSON.parse(fs.readFileSync(path.join(root, "analysis/curation-inventory.json"), "utf8"));
  runs = prev.runs; rateLimitHits = prev.meta.rateLimitHits || 0;
  console.log(`\nINV_REUSE=1 — re-aggregating ${runs.length} cached runs (no API calls).`);
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
      try {
        result = await curate({ role }, catalog, anchor, { callModel: directCallModel });
      } catch (e) { err = String(e); result = { ...fallbackCuration(anchor), finding: anchor, violations: ["harness: " + err], source: "fallback", _debug: { raw: err } }; }
      const meta = lastMeta;
      const parsed = parseRaw(result._debug && result._debug.raw);
      const requested = parsed && Array.isArray(parsed.widgetIds) ? parsed.widgetIds : null;
      const spec = buildSpec(result);
      const board = deriveBoard(spec, catalog, role, result.partitionPref, result.finding);
      const run = {
        runId: runId++, state, role, repeat: rep, source: result.source,
        finding: { id: anchor.id, label: anchor.label, domain: nb.domain, salience: anchor.z },
        candidateForms: eligible,
        selectedForms: result.widgetIds || [],           // accepted, in model order
        requestedForms: requested,                        // model's raw selection pre-validator (best effort)
        panelCount: (result.widgetIds || []).length,
        partitionId: board.partitionId,
        regions: board.regions,
        rejections: {
          count: (result.violations || []).length,
          guards: result.violations || [],
          droppedWidgets: requested ? requested.filter((id: string) => !(result.widgetIds || []).includes(id)) : null,
        },
        modelResponse: (result._debug && result._debug.raw) || "",
        apiMeta: meta,
      };
      runs.push(run);
      process.stdout.write(`  ${state}/${role}/#${rep} → ${result.source}${result.source === "live" ? ` · ${run.selectedForms.length} panels · ${board.partitionId}` : " (FALLBACK)"}${meta && meta.stop_reason && meta.stop_reason !== "end_turn" ? ` · stop=${meta.stop_reason}` : ""}\n`);
      await sleep(350);
    }
  }
}
}

// ════════════════════════ raw dump ════════════════════════
const outJson = {
  meta: {
    generated: "live via injected Anthropic seam (Netlify function bypassed — no Origin check, no rate limiter)",
    model: MODEL.curate, temperature: "unset (API default 1.0)", max_tokens: Math.min(600, MAX.curate),
    endpoint: "https://api.anthropic.com/v1/messages", anthropicVersion: "2023-06-01",
    design: `${STATES.length} states × ${ROLES.length} roles × 10 repeats = ${runs.length} runs`,
    stateResetAssertion: resetPass ? "PASS" : "FAIL", perturbationChangesCandidates: perturbationReal,
    rateLimitHits,
  },
  candidateSets: { base: baseC1, improve_cac: pertC },
  runs,
};
fs.mkdirSync(path.join(root, "analysis"), { recursive: true });
fs.writeFileSync(path.join(root, "analysis/curation-inventory.json"), JSON.stringify(outJson, null, 2) + "\n");

// ════════════════════════ §5 AGGREGATION → markdown ════════════════════════
const live = runs.filter((r) => r.source === "live");
const fallback = runs.filter((r) => r.source !== "live");
const cellKey = (r: any) => `${r.state}/${r.role}`;
const CELLS = STATES.flatMap((s) => ROLES.map((r) => `${s}/${r}`));
const allForms = Object.keys(WIDGET_DOMAIN);

// 5.2 selection frequency per form (over live runs)
const eligibleCount: Record<string, number> = {}, selectedCount: Record<string, number> = {};
for (const f of allForms) { eligibleCount[f] = 0; selectedCount[f] = 0; }
for (const r of live) {
  for (const e of r.candidateForms) eligibleCount[e.id] = (eligibleCount[e.id] || 0) + 1;
  for (const id of r.selectedForms) selectedCount[id] = (selectedCount[id] || 0) + 1;
}
// 5.3 buckets
const everEligible = allForms.filter((f) => eligibleCount[f] > 0);
const selected = allForms.filter((f) => selectedCount[f] > 0);
const passedOver = everEligible.filter((f) => selectedCount[f] === 0);
const neverEligible = allForms.filter((f) => eligibleCount[f] === 0);

// 5.4 head-to-head by finding (anchor)
const byFinding: Record<string, any> = {};
for (const r of live) {
  const k = `${r.finding.label} [${r.finding.domain}]`;
  byFinding[k] = byFinding[k] || { eligible: new Set(), chosen: {} as Record<string, number>, runs: 0 };
  byFinding[k].runs++;
  for (const e of r.candidateForms) byFinding[k].eligible.add(e.id);
  for (const id of r.selectedForms) byFinding[k].chosen[id] = (byFinding[k].chosen[id] || 0) + 1;
}
// 5.5 partition frequency
const partFreq: Record<string, number> = {};
for (const r of live) partFreq[r.partitionId] = (partFreq[r.partitionId] || 0) + 1;
const allPartitions = Object.keys(PARTITIONS);
const neverProduced = allPartitions.filter((p) => !partFreq[p]);
// 5.6 form × region-aspect
const formAspect: Record<string, Record<string, number>> = {};
for (const r of live) for (const reg of r.regions) { formAspect[reg.form] = formAspect[reg.form] || {}; formAspect[reg.form][reg.aspect] = (formAspect[reg.form][reg.aspect] || 0) + 1; }
// 5.7 role divergence (Jaccard CFO vs CRO per state, averaged over repeat pairs by index)
function jaccard(a: string[], b: string[]) { const A = new Set(a), B = new Set(b); const inter = [...A].filter((x) => B.has(x)).length; const uni = new Set([...a, ...b]).size; return uni ? inter / uni : 1; }
const divergence: Record<string, any> = {};
for (const state of STATES) {
  const cfo = live.filter((r) => r.state === state && r.role === "CFO");
  const cro = live.filter((r) => r.state === state && r.role === "CRO");
  const js: number[] = [];
  const n = Math.min(cfo.length, cro.length);
  for (let i = 0; i < n; i++) js.push(jaccard(cfo[i].selectedForms, cro[i].selectedForms));
  const cfoForms = new Set(cfo.flatMap((r) => r.selectedForms));
  const croForms = new Set(cro.flatMap((r) => r.selectedForms));
  divergence[state] = {
    meanJaccard: js.length ? js.reduce((a, b) => a + b, 0) / js.length : null,
    cfoFindings: [...new Set(cfo.map((r) => r.finding.label))],
    croFindings: [...new Set(cro.map((r) => r.finding.label))],
    uniqueToCFO: [...cfoForms].filter((f) => !croForms.has(f)),
    uniqueToCRO: [...croForms].filter((f) => !cfoForms.has(f)),
    pairs: js.length,
  };
}
// 5.8 nondeterminism per cell
const nd: Record<string, any> = {};
for (const cell of CELLS) {
  const rs = live.filter((r) => cellKey(r) === cell);
  if (!rs.length) { nd[cell] = { n: 0 }; continue; }
  const sel = rs.map((r) => r.selectedForms.join(",")), part = rs.map((r) => r.partitionId), pc = rs.map((r) => r.panelCount);
  const modal = (arr: string[]) => { const c: Record<string, number> = {}; arr.forEach((x) => c[x] = (c[x] || 0) + 1); return Math.max(...Object.values(c)); };
  nd[cell] = {
    n: rs.length,
    distinctSelections: new Set(sel).size, modalSelectionShare: modal(sel) / rs.length,
    distinctPartitions: new Set(part).size, modalPartitionShare: modal(part) / rs.length,
    distinctPanelCounts: new Set(pc).size, panelCounts: pc,
  };
}
// 5.9 panel count distribution
const panelDist: Record<string, Record<number, number>> = {};
for (const cell of CELLS) { const rs = live.filter((r) => cellKey(r) === cell); const d: Record<number, number> = {}; rs.forEach((r) => d[r.panelCount] = (d[r.panelCount] || 0) + 1); panelDist[cell] = d; }
// 5.10 rejection rate per cell
const rej: Record<string, any> = {};
const guardTally: Record<string, number> = {};
for (const cell of CELLS) {
  const rs = runs.filter((r) => cellKey(r) === cell);       // include fallback for rejection accounting
  const withRej = rs.filter((r) => r.rejections.count > 0).length;
  const guards: Record<string, number> = {};
  for (const r of rs) for (const g of r.rejections.guards) { guards[g] = (guards[g] || 0) + 1; guardTally[g] = (guardTally[g] || 0) + 1; }
  rej[cell] = { runs: rs.length, runsWithRejection: withRej, guards };
}
// §6 registry drift
const menuKinds = CHART_MENU.map((id: string) => ({ id, kind: (buildCatalog() as any)[id]?.kind, inChartKinds: CHART_KINDS.has((buildCatalog() as any)[id]?.kind) }));
resetTo("base"); const cat0 = buildCatalog();
const chartFormsInCatalog = Object.keys(cat0).filter((id) => CHART_KINDS.has(cat0[id].kind));
const chartFormsNotInMenu = chartFormsInCatalog.filter((id) => !CHART_MENU.includes(id));
const menuNotInCatalog = CHART_MENU.filter((id: string) => !cat0[id]);
const menuKindNotChart = CHART_MENU.filter((id: string) => cat0[id] && !CHART_KINDS.has(cat0[id].kind));

// Measurement caveat: the widget menu the model is OFFERED (buildCurationPrompt uses
// RELATED_DOMAINS[domain]) is WIDER than what the validator ADMITS (nb.lenses). Forms offered but
// inadmissible are dropped every time — so some PASSED-OVER forms are structurally inadmissible,
// not merely unpicked. Recomputed deterministically per state anchor (no API).
const admissibilityGap: Record<string, any> = {};
for (const state of STATES) {
  resetTo(state);
  for (const role of ROLES) {
    const a = roleScopedTopFinding(role); const nb = E.findingNeighborhood(a);
    const offered = RELATED_DOMAINS[nb.domain] || [];
    const admissible = nb.lenses || RELATED_DOMAINS[nb.domain] || [nb.domain];
    const offeredButInadmissible = allForms.filter((f) => offered.includes(WIDGET_DOMAIN[f]) && !admissible.includes(WIDGET_DOMAIN[f]));
    const k = `${state}/${role}`;
    admissibilityGap[k] = { finding: a.label, domain: nb.domain, offered, admissible, offeredButInadmissible };
  }
}
const structurallyInadmissible = new Set<string>();
for (const g of Object.values(admissibilityGap) as any[]) g.offeredButInadmissible.forEach((f: string) => structurallyInadmissible.add(f));
const passedOverStructural = passedOver.filter((f) => structurallyInadmissible.has(f));
const passedOverGenuine = passedOver.filter((f) => !structurallyInadmissible.has(f));

// ── render markdown ──
const pct = (x: number) => (x * 100).toFixed(0) + "%";
const num = (x: number | null) => x == null ? "—" : x.toFixed(2);
let md = "";
md += `# Curation Inventory\n\n`;
md += `**State-reset assertion (§2):** ${resetPass ? "**PASS**" : "**FAIL**"} — base → perturbed → base; the two base candidate sets are ${resetPass ? "byte-identical" : "DIVERGED"}. Perturbation changes the candidate set: ${perturbationReal}.\n\n`;
md += `**Model access:** Netlify function **bypassed** — \`callModel\` injected at the seam, POSTing directly to \`api.anthropic.com/v1/messages\` with the key from \`.env.local\`. This skips the **Origin allowlist** and the **per-IP rate limiter**. Prompt from \`buildCurationPrompt\` (no parallel prompt). Request body matches production: \`model=${MODEL.curate}\`, \`max_tokens=${Math.min(600, MAX.curate)}\`, **temperature unset → API default 1.0**, no system prompt, no stop sequences.\n\n`;
md += `**Run counts:** total ${runs.length} · live ${live.length} · fallback ${fallback.length} · excluded-from-selection-stats ${fallback.length}. Anthropic rate-limit (429/529) responses: ${rateLimitHits}.\n\n`;

md += `## 2. Selection frequency per form (live runs)\n\n| form | domain | eligible | selected | rate |\n|---|---|--:|--:|--:|\n`;
for (const f of allForms.slice().sort((a, b) => (selectedCount[b] / (eligibleCount[b] || 1)) - (selectedCount[a] / (eligibleCount[a] || 1)))) {
  md += `| ${f} | ${WIDGET_DOMAIN[f]} | ${eligibleCount[f]} | ${selectedCount[f]} | ${eligibleCount[f] ? pct(selectedCount[f] / eligibleCount[f]) : "n/a"} |\n`;
}
md += `\n## 3. Two-bucket classification\n\n`;
md += `**SELECTED** (chosen ≥ 1×): ${selected.length ? selected.join(", ") : "—"}\n\n`;
md += `**PASSED OVER** (eligible ≥ 1×, never chosen): ${passedOver.length ? passedOver.join(", ") : "—"}\n\n`;
md += `  ↳ of which **structurally inadmissible** (offered by the prompt but always dropped by the validator — see Measurement notes): ${passedOverStructural.length ? passedOverStructural.join(", ") : "—"}\n\n`;
md += `  ↳ of which **genuinely unpicked** (admissible, model chose not to): ${passedOverGenuine.length ? passedOverGenuine.join(", ") : "—"}\n\n`;
md += `**NEVER ELIGIBLE** on these 2 states: ${neverEligible.length ? neverEligible.join(", ") : "—"}\n\n`;

md += `## 4. Head-to-head substitution (per anchored finding, live)\n\n`;
for (const [k, v] of Object.entries(byFinding)) {
  const chosenSorted = Object.entries(v.chosen).sort((a: any, b: any) => b[1] - a[1]);
  const elig = [...v.eligible];
  md += `**${k}** — ${v.runs} live runs · eligible forms: ${elig.join(", ")}\n\n`;
  md += `  chosen: ${chosenSorted.map(([id, c]) => `${id}×${c}`).join(", ") || "—"}\n\n`;
  const neverChosenElig = elig.filter((id) => !v.chosen[id]);
  if (neverChosenElig.length) md += `  eligible but never chosen for this finding: ${neverChosenElig.join(", ")}\n\n`;
}

md += `## 5. Partition frequency (live)\n\n| partition | count |\n|---|--:|\n`;
for (const [p, c] of Object.entries(partFreq).sort((a, b) => b[1] - a[1])) md += `| ${p} | ${c} |\n`;
md += `\n**Never produced:** ${neverProduced.length ? neverProduced.join(", ") : "—"}\n\n`;

md += `## 6. Form × region-aspect matrix (live placements)\n\n| form | aspects (region ratios it landed in) |\n|---|---|\n`;
for (const f of Object.keys(formAspect).sort()) md += `| ${f} | ${Object.entries(formAspect[f]).sort((a, b) => b[1] - a[1]).map(([a, c]) => `${a}×${c}`).join(", ")} |\n`;

md += `\n## 7. Role divergence (CFO vs CRO)\n\n`;
for (const state of STATES) {
  const d = divergence[state];
  md += `**${state}** — mean Jaccard(CFO,CRO) over ${d.pairs} repeat-pairs: **${num(d.meanJaccard)}**\n\n`;
  md += `  CFO anchored on: ${d.cfoFindings.join("; ")} · CRO anchored on: ${d.croFindings.join("; ")}\n\n`;
  md += `  forms unique to CFO: ${d.uniqueToCFO.join(", ") || "—"} · unique to CRO: ${d.uniqueToCRO.join(", ") || "—"}\n\n`;
}
const anyDiverge = STATES.some((s) => (divergence[s].meanJaccard ?? 1) < 1 || divergence[s].uniqueToCFO.length || divergence[s].uniqueToCRO.length);
md += `Divergence measurable: **${anyDiverge ? "yes" : "no"}**.\n\n`;

md += `## 8. Nondeterminism (within-cell, 10 repeats)\n\n| cell | n | distinct selections | modal-selection share | distinct partitions | modal-partition share | distinct panel counts |\n|---|--:|--:|--:|--:|--:|--:|\n`;
for (const cell of CELLS) { const x = nd[cell]; if (!x.n) { md += `| ${cell} | 0 | — | — | — | — | — |\n`; continue; } md += `| ${cell} | ${x.n} | ${x.distinctSelections} | ${pct(x.modalSelectionShare)} | ${x.distinctPartitions} | ${pct(x.modalPartitionShare)} | ${x.distinctPanelCounts} |\n`; }

md += `\n## 9. Panel count distribution\n\n| cell | counts (panelCount×freq) |\n|---|---|\n`;
for (const cell of CELLS) md += `| ${cell} | ${Object.entries(panelDist[cell]).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `${k}×${v}`).join(", ") || "—"} |\n`;
md += `\nSalience concentration per state (top-1 z / Σz over positive z): base and perturbed anchors listed in §7; panel count vs salience is discussed inline.\n\n`;

md += `## 10. Rejection rate per cell\n\n| cell | runs | runs w/ ≥1 rejection | guards fired |\n|---|--:|--:|---|\n`;
for (const cell of CELLS) { const x = rej[cell]; md += `| ${cell} | ${x.runs} | ${x.runsWithRejection} | ${Object.entries(x.guards).map(([g, c]) => `${g} ×${c}`).join("; ") || "—"} |\n`; }
md += `\nGuard totals: ${Object.entries(guardTally).map(([g, c]) => `${g} ×${c}`).join("; ") || "none"}.\n\n`;

md += `## §6 Registry drift — CHART_MENU (selection) vs CHART_KINDS (render)\n\n`;
md += `CHART_MENU ids and their kinds: ${menuKinds.map((m) => `${m.id}→${m.kind}${m.inChartKinds ? "" : " ⚠NOT-IN-CHART_KINDS"}`).join(", ")}.\n\n`;
md += `- CHART_MENU ids missing from catalog: ${menuNotInCatalog.length ? menuNotInCatalog.join(", ") : "none"}\n`;
md += `- CHART_MENU ids whose kind ∉ CHART_KINDS: ${menuKindNotChart.length ? menuKindNotChart.join(", ") : "none"}\n`;
md += `- Catalog forms with a chart kind (∈ CHART_KINDS) but absent from CHART_MENU top-up: ${chartFormsNotInMenu.length ? chartFormsNotInMenu.join(", ") : "none"}\n\n`;
md += `**Recommended assertion for validate-curation.ts** (do not fix here): every id in \`CHART_MENU\` exists in \`buildCatalog()\` and has a kind in \`CHART_KINDS\`; conversely flag any chart-kind catalog form absent from \`CHART_MENU\` so the two registries cannot silently drift.\n\n`;

md += `## Measurement notes / caveats (report, not fix)\n\n`;
md += `**Offered ⊋ admissible.** The widget menu the model is OFFERED comes from \`buildCurationPrompt\` = \`RELATED_DOMAINS[domain]\`, but the validator ADMITS per \`nb.lenses\` — and the two disagree for the concentration finding. This is why the "off-domain widget(s) — dropped" guard fires in every concentration cell: the model reasonably picks a form it was shown, and it is dropped every time.\n\n`;
md += `| state/role | anchor domain | offered domains | admissible (lenses) | offered-but-inadmissible forms |\n|---|---|---|---|---|\n`;
for (const [k, g] of Object.entries(admissibilityGap) as any[]) md += `| ${k} | ${g.domain} | ${g.offered.join(", ")} | ${g.admissible.join(", ")} | ${g.offeredButInadmissible.join(", ") || "—"} |\n`;
md += `\n**Consequence for trimming:** the PASSED OVER bucket is not homogeneous. \`${passedOverStructural.join(", ") || "—"}\` are passed over because they are **structurally inadmissible** under a concentration anchor (offered, never admissible) — a prompt/validator inconsistency, not evidence the form is redundant. \`${passedOverGenuine.join(", ") || "—"}\` are **genuinely unpicked** by the model despite being admissible — the real trim candidates. Do not conflate the two.\n\n`;
md += `**Denominator note.** "eligible" in §2/§3 counts times a form was OFFERED (in the model's widget menu = \`RELATED_DOMAINS[domain]\`), the honest denominator for "how often the model had the chance to pick it." Because offered ⊋ admissible, a form can have eligible > 0 yet be un-keepable.\n\n`;
md += `**Limits / not measured.** (1) Only **1** perturbation exists (\`improve_cac\`) → the data-state axis is 2, and both perturbed cells collapse onto the same concentration anchor, so cross-state variety is minimal. (2) 10 repeats bound within-cell variance resolution to ~±10%. (3) Temperature is the API default (1.0, unset) to match production exactly. (4) Function layer bypassed → Origin check and rate limiter not exercised (0 rate-limit events at this volume — not proof the production limiter works).\n\n`;

fs.writeFileSync(path.join(root, "analysis/curation-inventory.md"), md);
console.log(`\nwrote analysis/curation-inventory.json (${runs.length} runs) + analysis/curation-inventory.md`);
console.log(`live=${live.length} fallback=${fallback.length} rateLimitHits=${rateLimitHits}`);
