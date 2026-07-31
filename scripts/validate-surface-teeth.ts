/** Structural teeth proof for validate-surface.
 *  ============================================
 *  Every assertion must FAIL against a tree that violates it (else it proves nothing) and PASS on the
 *  current tree. This harness proves that STRUCTURALLY: it enumerates the assertions FROM the
 *  validator's own output — so a newly-added assertion appears here automatically and cannot be
 *  silently left unproven — and requires each one to trip in at least one "teeth fixture".
 *
 *  A fixture is a tree that violates the register. Two kinds:
 *    • whole-tree baselines — the pre-register commit (3e409c1), where the register-era rules trip; and
 *      the current tree with a specific fix stripped (for a regression the reskin itself introduced,
 *      which the pre-register tree can't reach because it predates the offending pattern).
 *    • targeted mutations — a single edit to the current tree that injects exactly one violation, the
 *      designated witness for an assertion no whole-tree baseline reaches.
 *
 *  FAILS if: the clean tree isn't all-pass · any enumerated assertion has no witness · any fixture is
 *  dead (trips nothing — it's proving nothing and should be removed or repaired).
 *
 *  Run:  npx tsx scripts/validate-surface-teeth.ts   (wired into `npm run validate:all`)
 */
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PRE_RESKIN = "3e409c1";
const FILES = ["index.css", "App.tsx", "catalog.ts"];
const SURFACE = path.join("scripts", "validate-surface.ts");

const run = (srcDir: string) => {
  try { return execSync(`npx tsx "${SURFACE}" "${srcDir}"`, { cwd: root, encoding: "utf8" }); }
  catch (e: any) { return (e.stdout || "") + (e.stderr || ""); } // exit 1 on failure is expected
};
const parse = (out: string) => {
  const rows: { name: string; pass: boolean }[] = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^\s*([✓✗])\s+(.+?)(?:\s\s—|$)/);
    if (m) rows.push({ name: m[2].trim(), pass: m[1] === "✓" });
  }
  return rows;
};
const mktmp = (tag: string) => fs.mkdtempSync(path.join(os.tmpdir(), `surface-${tag}-`));
const writeTree = (files: Record<string, string>, tag: string) => { const d = mktmp(tag); for (const f of FILES) fs.writeFileSync(path.join(d, f), files[f] ?? ""); return d; };
const curFiles = (): Record<string, string> => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(root, "src", f), "utf8")]));

// ── teeth fixtures — each returns a src dir whose tree violates the register ─────────────────────────
type Fixture = { name: string; note: string; build: () => string };
const fixtures: Fixture[] = [
  {
    name: "pre-reskin",
    note: `the pre-register commit ${PRE_RESKIN} — the register-era rules (radius, colour, dye, valence, legend, gradient, keyframes, numeric-anim, ladder, classes, mono, tabular, role, plane-absent, affordance) all trip here`,
    build: () => { const f: Record<string, string> = {}; for (const n of FILES) { try { f[n] = execSync(`git show ${PRE_RESKIN}:src/${n}`, { cwd: root, encoding: "utf8" }); } catch { f[n] = ""; } } return writeTree(f, "prereskin"); },
  },
  {
    name: "plane-fix-stripped",
    note: "current tree with the brief-head ink-ground fix removed — witness for the ink-ground rule, which the pre-register tree can't trip (it never put --ink/--ink-2 on an ink ground)",
    build: () => { const f = curFiles(); f["index.css"] = f["index.css"].split("\n").filter((l) => !/\.brief-head \.brief-(status\.(holds|weakened)|src\.(live|fallback))/.test(l)).join("\n"); return writeTree(f, "planefix"); },
  },
  {
    name: "skeleton-gated",
    note: "current tree with one authorship-gated block injected (`{isModel && <…/>}`) — witness for the identical-skeleton invariant, which no whole-tree baseline reaches (the pre-register tree had no live/fallback split)",
    build: () => { const f = curFiles(); f["App.tsx"] = f["App.tsx"].replace('<span className="lede-ground">', '{isModel && <span className="teeth-gate" />}<span className="lede-ground">'); return writeTree(f, "skeleton"); },
  },
];

console.log("TEETH PROOF — validate-surface (structural: assertions enumerated from the validator)\n");

const clean = parse(run(path.join(root, "src")));
const allNames = clean.map((r) => r.name);
const cleanAllPass = clean.length > 0 && clean.every((r) => r.pass);

const witnessOf = new Map<string, string[]>();   // assertion name → fixtures that trip it
const tripsOf = new Map<string, string[]>();      // fixture name → assertions it trips
for (const fx of fixtures) {
  const dir = fx.build();
  const trips = parse(run(dir)).filter((r) => !r.pass).map((r) => r.name);
  tripsOf.set(fx.name, trips);
  for (const n of trips) { const w = witnessOf.get(n) || []; w.push(fx.name); witnessOf.set(n, w); }
  fs.rmSync(dir, { recursive: true, force: true });
}

const noTeeth = allNames.filter((n) => !witnessOf.has(n));
const deadFixtures = fixtures.filter((fx) => (tripsOf.get(fx.name) || []).length === 0).map((fx) => fx.name);

console.log(`  clean tree: ${clean.filter((r) => r.pass).length}/${clean.length} pass  ${cleanAllPass ? "✓" : "✗"}\n`);
for (const fx of fixtures) {
  const t = tripsOf.get(fx.name) || [];
  console.log(`  fixture "${fx.name}": trips ${t.length} assertion(s)${t.length === 0 ? "  ✗ DEAD" : ""}`);
}
console.log(`\n  teeth coverage: ${allNames.length - noTeeth.length}/${allNames.length} assertions trip in ≥1 fixture`);
if (noTeeth.length) { console.log("  ✗ NO TEETH (add a fixture that trips these):"); for (const n of noTeeth) console.log(`     · ${n}`); }

const good = cleanAllPass && noTeeth.length === 0 && deadFixtures.length === 0;
console.log(`\n${good ? "PASS" : "FAIL"} — ${good ? `all ${allNames.length} assertions have teeth; clean tree green; no dead fixtures` : "see above"}.`);
if (!good) process.exit(1);
