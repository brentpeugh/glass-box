/** Thesis-critical path proof: the DISCOVERY architecture, not the legacy detectors.
 *  Proves the seven claims the artifact actually rests on — that the finding is
 *  data-derived (not planted), that the neighborhood derives from it, and that the
 *  coherence validator enforces the trust boundary. Runs the REAL engine and the REAL
 *  validator (src/curation.ts), not copies.
 *  Run: npx tsx scripts/validate-discovery.ts */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createEngine } from "../src/engine-core";
import { validateCurationCore, WIDGET_DOMAIN, guardDirection, engineHeadline, guardFraming } from "../src/curation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const bundle = JSON.parse(fs.readFileSync(path.join(root, "public/caliper_dataset.json"), "utf8"));
const E = createEngine({ customers: bundle.facts.customers, opex: bundle.facts.opex, opportunities: bundle.facts.opportunities, quarters: bundle.meta.quarters, segments: bundle.meta.segments, benchmarks: bundle.benchmarks });

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, detail = "") => { cond ? pass++ : fail++; console.log(`  ${cond ? "✓" : "✗"} ${label}${cond ? "" : "  — " + detail}`); };

const salience = E.computeSalience();
const top = E.topFinding();
const nb = E.findingNeighborhood(top);
const catalog = Object.fromEntries(Object.keys(WIDGET_DOMAIN).map((k) => [k, { title: k }]));

console.log("DISCOVERY-PATH PROOF (thesis-critical)\n");

// 1 — the finding is data-derived: generic salience ranks CAC payback #1
ok("1. computeSalience() ranks CAC Payback as the top fact",
  salience[0].metric === "cac" && salience[0].dim === "benchmark",
  `top was ${salience[0].label}`);

// 2 — topFinding() is exactly the top of the ranking (no re-selection)
ok("2. topFinding() === computeSalience()[0]",
  top.id === salience[0].id && top.label === salience[0].label);

// 3 — the neighborhood derives from the top finding's cluster (efficiency), generically
ok("3. neighborhood derives from topFinding() (efficiency cluster)",
  nb.domain === "efficiency" && nb.metricIds.some((id: string) => id.includes("cac")),
  `domain ${nb.domain}`);

// 4 — the planted masking story is NOT the selected finding
ok("4. masking is NOT the selected top finding",
  !(top.dim === "divergence" && top.metric === "nrr"),
  `top is ${top.dim}/${top.metric}`);

// 5 — validator rejects evidence/test/widget IDs OUTSIDE the neighborhood
{
  const goodEvidence = top.mvs[0].id, badEvidence = "nrr.SMB.24Q4_25Q4"; // retention id, outside efficiency nb
  const r = validateCurationCore(
    { thesis: "efficiency is deteriorating", whyRole: "matters", evidenceIds: [goodEvidence, badEvidence], testIds: nb.testIds, widgetIds: ["metric_matrix", "hbar_nrr"] },
    nb, catalog, WIDGET_DOMAIN);
  ok("5. validator drops off-neighborhood evidence AND off-domain widgets",
    r.curation!.evidenceIds.length === 1 && !r.curation!.widgetIds.includes("hbar_nrr") && r.violations.length >= 2,
    JSON.stringify(r.violations));
}

// 6 — validator rejects a curation with NO falsifier (a read must be able to fail)
{
  const nonFalsifiers = nb.testIds.filter((t: string) => !nb.falsifierIds.includes(t));
  const r = validateCurationCore(
    { thesis: "efficiency is deteriorating", whyRole: "matters", evidenceIds: [top.mvs[0].id], testIds: nonFalsifiers, widgetIds: ["metric_matrix"] },
    nb, catalog, WIDGET_DOMAIN);
  ok("6. validator rejects a curation with no falsifier (not viable)",
    r.viable === false && r.violations.some((v) => v.includes("falsif")));
}

// 7 — validator strips model-authored numerals from prose
{
  const r = validateCurationCore(
    { thesis: "CAC payback is 21 months, well over benchmark", whyRole: "matters", evidenceIds: [top.mvs[0].id], testIds: nb.testIds, widgetIds: ["metric_matrix"] },
    nb, catalog, WIDGET_DOMAIN);
  ok("7. validator rejects model-authored numerals in framing",
    r.viable === false && r.violations.some((v) => v.includes("numeral")),
    "thesis with a digit should not be viable");
}

// 8 — directional coherence: framing that contradicts the engine's verdict is inadmissible,
//     and the engine-authored fallback is always consistent with the verdict
{
  const breachG = { label: "SaaS Magic Number", hasBenchmark: true, status: "breaches", direction: "falling" };
  const clearG = { label: "Gross Margin", hasBenchmark: true, status: "clears", direction: "rising" };
  const contradictBreach = guardDirection("SaaS Magic Number exceeds benchmark, performing strong", breachG).violated;
  const contradictClear = guardDirection("Gross Margin falls short below target", clearG).violated;
  const honestBreach = guardDirection("SaaS Magic Number falls below benchmark", breachG).violated;
  const fbBreach = engineHeadline(breachG), fbClear = engineHeadline(clearG);
  ok("8. validator rejects direction-contradicting framing; engine fallback stays truthful",
    contradictBreach === true && contradictClear === true && honestBreach === false &&
    guardDirection(fbBreach, breachG).violated === false && guardDirection(fbClear, clearG).violated === false,
    `contradictBreach=${contradictBreach} contradictClear=${contradictClear} honestBreach=${honestBreach} fb="${fbBreach}"`);
}

// 9 — the numeral guard covers word-form figures and unicode fractions, not just digits,
//     while leaving ordinary determiners ("one segment", fiscal "quarters") admissible
{
  const rejects = ["twenty-one months over target", "sixty percent of ARR", "two thirds of the book", "\u2154 of accounts"].every((t) => guardFraming(t).violated);
  const allows = ["one segment is lagging", "three quarters showed decline", "Enterprise carrying the number"].every((t) => !guardFraming(t).violated);
  ok("9. numeral guard covers word-form figures + fractions, not determiners", rejects && allows,
    `rejects=${rejects} allows=${allows}`);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — discovery path: ${pass}/${pass + fail} thesis-critical assertions`);
if (fail > 0) process.exit(1);
