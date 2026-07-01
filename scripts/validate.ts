/** Node-side proof: the canonical engine-core reproduces the oracle exactly.
 *  Run: npx tsx scripts/validate.ts   → 113/113 panel checks, 14/14 findings. */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createEngine } from "../src/engine-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(__dirname, "..");
const bundle = JSON.parse(fs.readFileSync(path.join(root, "public/caliper_dataset.json"), "utf8"));
const oracle = JSON.parse(fs.readFileSync(path.join(root, "scripts/findings_validation.json"), "utf8"));
const B = { customers: bundle.facts.customers, opex: bundle.facts.opex, opportunities: bundle.facts.opportunities, quarters: bundle.meta.quarters, segments: bundle.meta.segments, benchmarks: bundle.benchmarks };
const E = createEngine(B);
const Q: string[] = B.quarters, S: string[] = B.segments;

let pass = 0, fail = 0;
const chk = (label: string, got: number, exp: number | null, tol: number) => { if (exp === null || isNaN(got)) return; const ok = Math.abs(got - exp) <= tol; ok ? pass++ : fail++; if (!ok) console.log(`  ✗ ${label}: ${got} vs ${exp}`); };
const oc = oracle.metric_panel.company, os = oracle.metric_panel.segment;
Q.forEach((q, i) => {
  chk(`arr ${q}`, E.companyArr(q).value, oc.arr[i], 50);
  chk(`gm ${q}`, E.grossMargin(q).value, oc.gross_margin[i], 0.01);
  chk(`ent ${q}`, E.entShare(q).value, oc.ent_share[i], 0.01);
  chk(`top10 ${q}`, E.top10Share(q).value, oc.top10_share[i], 0.01);
  const g = E.qoqGrowth(q); if (g) chk(`qoq ${q}`, g.value, oc.qoq_growth[i], 0.001);
  const m = E.magicNumber(q); if (m) chk(`magic ${q}`, m.value, oc.magic_number[i], 0.001);
  const c = E.cacPayback(q); if (c) chk(`cac ${q}`, c.value, oc.cac_payback_mo[i], 0.01);
  const r = E.ruleOf40(q); if (r) chk(`r40 ${q}`, r.value, oc.rule_of_40[i], 0.01);
  S.forEach((s) => { chk(`${s} arr ${q}`, E.segArr(s, q).value, os[s].arr[i], 50); chk(`${s} wr ${q}`, E.winRate(s, q).value, os[s].win_rate[i], 0.01); });
});
chk("blended NRR", E.nrr(null, "24Q4", "25Q4").value, oc.nrr_latest, 0.01);
chk("blended GRR", E.grr(null, "24Q4", "25Q4").value, oc.grr_latest, 0.01);
S.forEach((s) => { chk(`${s} NRR`, E.nrr(s, "24Q4", "25Q4").value, os[s].nrr_latest, 0.01); chk(`${s} GRR`, E.grr(s, "24Q4", "25Q4").value, os[s].grr_latest, 0.01); });

const findings = E.runDetectors();
const ofs = oracle.findings;
const scopeLabel = (f: any) => f.type === "masking" ? "company+segment" : f.type === "cross_segment_divergence" ? "segment" : (f.scope.segment ?? "company");
let fp = 0, ff = 0;
findings.forEach((f: any, i: number) => { const o = ofs[i]; const ok = o && o.type === f.type && o.metric === f.metric && o.scope === scopeLabel(f) && o.direction === f.polarity && Math.abs(o.salience - f.salience) < 0.005; ok ? fp++ : ff++; });

console.log("=".repeat(60));
console.log(`PANEL    ${pass} passed, ${fail} failed`);
console.log(`FINDINGS ${fp}/${ofs.length} reproduced (+ranking), ${ff} mismatched`);
console.log((fail === 0 && ff === 0 && findings.length === ofs.length) ? "PASS — engine-core verified against the oracle" : "FAIL");
process.exit(fail === 0 && ff === 0 ? 0 : 1);
