/** Curation inventory harness (inventory-brief §3–5).
 *
 *  The brief specifies 20 perturbation states × 2 roles + 3 repeats = 43 LIVE curation runs,
 *  reusing "the shipped prompt path." Building it surfaced three hard boundaries that stop those
 *  runs — each a finding, not a thing to route around (brief §1 / §8):
 *
 *   B1  MODULE BOUNDARY. The shipped curation path is NOT in curation.ts (as §3 assumes) — it is
 *       in src/App.tsx, and every piece of it is module-internal (App.tsx exports only `default App`):
 *         curate, buildCurationPrompt, callModel, CURATION_MODEL, PERTURBATIONS, perturbedDataset,
 *         buildCatalog, PARTITIONS, deriveShape/selectPartition, fallbackCuration, FALLBACK, CHART_MENU.
 *       The guardrails forbid editing App.tsx to export them AND forbid writing a parallel prompt.
 *       So the shipped selection path cannot be driven from a script without violating the guardrails.
 *   B2  NO MODEL KEY. callModel POSTs to /.netlify/functions/curate, which needs ANTHROPIC_API_KEY.
 *       The repo's .env.local holds no secret (the key lives only in Netlify env). With no key and no
 *       running function, every call throws → every run lands in fallback → zero model selections.
 *       Per §3/§2a, fallback runs carry no selection and must be excluded — leaving 0 usable runs.
 *   B3  ONE PERTURBATION, NOT 20. PERTURBATIONS = { improve_cac } — a single state. The "20
 *       perturbation states" the harness is sized for do not exist in the shipped code.
 *
 *  What CAN be measured from the exported surface (engine-core `createEngine`; curation.ts
 *  `WIDGET_DOMAIN`/`RELATED_DOMAINS`) is the engine-side CANDIDATE denominator for the base state:
 *  the findings the engine surfaces before any curation, and, per the domain-membership eligibility
 *  rule, which forms are candidates for each. That, plus the blocker manifest, is emitted here so the
 *  boundary is auditable. It does NOT fabricate model selections.
 *
 *  Run: npx tsx scripts/inventory.ts   → writes analysis/curation-inventory.json
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createEngine } from "../src/engine-core";
import { WIDGET_DOMAIN, RELATED_DOMAINS } from "../src/curation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const bundle = JSON.parse(fs.readFileSync(path.join(root, "public/caliper_dataset.json"), "utf8"));
const B = { customers: bundle.facts.customers, opex: bundle.facts.opex, opportunities: bundle.facts.opportunities, quarters: bundle.meta.quarters, segments: bundle.meta.segments, benchmarks: bundle.benchmarks };
const E: any = createEngine(B);

const DOMAIN_FORMS = Object.keys(WIDGET_DOMAIN); // the 22 domain-gated forms
const num = (v: any) => (typeof v === "number" && !isNaN(v) ? v : null);

// ── engine-side candidate set for the BASE state (the only state that exists; see B3) ──
const findings: any[] = (() => { try { return E.computeSalience() || []; } catch { return []; } })();
const candidates = findings.map((f: any, i: number) => {
  const nb = (() => { try { return E.findingNeighborhood(f); } catch { return {}; } })();
  const related = nb.lenses || RELATED_DOMAINS[nb.domain] || (nb.domain ? [nb.domain] : []);
  const eligibleForms = DOMAIN_FORMS.filter((form) => related.includes(WIDGET_DOMAIN[form]));
  const score = num(f.salience) ?? num(f.raw); // engine's ranking magnitude, if exposed on the fact
  return {
    rank: i + 1,
    id: f.id ?? `${f.dim ?? f.type ?? "fact"}:${f.metric ?? ""}`,
    label: f.label ?? f.summary ?? null,
    kind_of_fact: f.dim ?? f.type ?? null,
    metric: f.metric ?? null,
    polarity: f.polarity ?? null,
    salience_score: score,
    domain: nb.domain ?? null,
    lenses: nb.lenses ?? null,
    eligible_form_domains: related,
    eligible_forms: eligibleForms,
  };
});

const scores = candidates.map((c) => c.salience_score).filter((s): s is number => s != null);
const sum = scores.reduce((a, b) => a + b, 0);
const salience_shape = sum > 0 ? {
  scored_findings: scores.length,
  top1_share: +(scores[0] / sum).toFixed(4),
  top3_share: +(scores.slice(0, 3).reduce((a, b) => a + b, 0) / sum).toFixed(4),
  hhi_concentration: +scores.map((s) => (s / sum) ** 2).reduce((a, b) => a + b, 0).toFixed(4),
} : { scored_findings: 0, note: "salience score is not exposed on the finding facts returned by computeSalience(); only rank order is observable" };

const out = {
  generated: "static — no model runs (see blockers)",
  run_counts: { total_attempted: 0, live: 0, fallback: 0, excluded_fallback: 0, note: "no run could execute; see blockers B1/B2/B3" },
  blockers: {
    B1_module_boundary: {
      finding: "the shipped curation path is in src/App.tsx and unexported (App.tsx exports only `default App`)",
      needed_but_unexported: ["curate", "buildCurationPrompt", "callModel", "CURATION_MODEL", "PERTURBATIONS", "perturbedDataset", "buildCatalog", "PARTITIONS", "deriveShape", "selectPartition", "fallbackCuration", "FALLBACK", "CHART_MENU"],
      why_not_routed_around: "guardrails forbid editing App.tsx to export, and forbid writing a parallel prompt",
    },
    B2_no_model_key: { finding: "ANTHROPIC_API_KEY is not in the repo (Netlify env only); callModel would throw and every run would fall back", },
    B3_one_perturbation: { finding: "PERTURBATIONS = { improve_cac } — 1 state, not the 20 the harness is sized for", available_states: ["improve_cac"], },
  },
  base_state_candidate_set: {
    state: "base (unperturbed)",
    finding_count: candidates.length,
    salience_shape,
    candidates,
  },
  measurable_note: "Only the engine-side candidate denominator for the base state is observable without the model. Selection/partition/role-divergence statistics require the live model + the unexported path and were not measured.",
};

fs.mkdirSync(path.join(root, "analysis"), { recursive: true });
fs.writeFileSync(path.join(root, "analysis/curation-inventory.json"), JSON.stringify(out, null, 2));

console.log("=".repeat(64));
console.log("CURATION INVENTORY — harness could not execute the specified runs");
console.log(`  runs: total 0 · live 0 · fallback 0 · excluded 0   (blocked: B1 unexported path · B2 no key · B3 1 perturbation)`);
console.log(`  base candidate set: ${candidates.length} findings surfaced by the engine`);
console.log(`  salience shape: ${JSON.stringify(salience_shape)}`);
console.log(`  wrote analysis/curation-inventory.json`);
console.log("=".repeat(64));
