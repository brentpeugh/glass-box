/** Teeth proof for validate-surface (the way validate-curation.ts was proven against its pre-fix
 *  state): every assertion must FAIL against a tree that violates it and PASS on the current tree.
 *
 *  Two baselines, because the assertions guard two kinds of regression:
 *   • #1–#9 are register-era invariants → proven against the pre-reskin commit (3e409c1), where all
 *     nine trip. (#10 can't: pre-reskin never put --ink/--ink-2 on an ink ground — it used visible
 *     chrome tones — so there is nothing there for #10 to catch. That is honest, not a gap.)
 *   • #10 guards a regression the reskin itself introduced (the Stage-4 valence sweep) → proven
 *     against the current tree with its brief-head fix stripped, where #10 trips.
 *  All ten pass on the current tree.
 *  Run:  npx tsx scripts/validate-surface-teeth.ts   (or npm run validate:surface:teeth)
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
const INK_ASSERTION = "ink ground"; // substring identifying assertion #10

const run = (srcDir: string) => {
  try { return execSync(`npx tsx "${path.join("scripts", "validate-surface.ts")}" "${srcDir}"`, { cwd: root, encoding: "utf8" }); }
  catch (e: any) { return (e.stdout || "") + (e.stderr || ""); } // exit 1 on failure is expected
};
const parse = (out: string) => {
  const m: { name: string; pass: boolean }[] = [];
  for (const line of out.split("\n")) {
    const r = line.match(/^\s*([✓✗])\s+(.+?)(?:\s\s—|$)/);
    if (r) m.push({ name: r[2].trim(), pass: r[1] === "✓" });
  }
  return m;
};
const tmp = (tag: string) => fs.mkdtempSync(path.join(os.tmpdir(), `surface-${tag}-`));

// ── baseline A: pre-reskin src ────────────────────────────────────────────────────────────────
const preDir = tmp("prereskin");
for (const f of FILES) fs.writeFileSync(path.join(preDir, f), execSync(`git show ${PRE_RESKIN}:src/${f}`, { cwd: root, encoding: "utf8" }));

// ── baseline B: current src with the brief-head ink-ground fix stripped ─────────────────────────
const preFixDir = tmp("prefix");
for (const f of FILES) {
  let text = fs.readFileSync(path.join(root, "src", f), "utf8");
  if (f === "index.css")
    text = text.split("\n").filter((l) => !/\.brief-head \.brief-(status\.(holds|weakened)|src\.(live|fallback))/.test(l)).join("\n");
  fs.writeFileSync(path.join(preFixDir, f), text);
}

const pre = parse(run(preDir));
const preFix = parse(run(preFixDir));
const cur = parse(run(path.join(root, "src")));

const nonInk = (rows: typeof pre) => rows.filter((r) => !r.name.includes(INK_ASSERTION));
const inkRow = (rows: typeof pre) => rows.find((r) => r.name.includes(INK_ASSERTION));

console.log(`TEETH PROOF — validate-surface\n`);
const preTeeth = nonInk(pre).length === 9 && nonInk(pre).every((r) => !r.pass);
console.log(`  #1–#9 vs pre-reskin ${PRE_RESKIN}:   ${nonInk(pre).filter((r) => !r.pass).length}/9 trip  ${preTeeth ? "✓" : "✗"}`);
const inkTeeth = inkRow(preFix) ? !inkRow(preFix)!.pass : false;
console.log(`  #10 vs fix-stripped tree:      ${inkTeeth ? "trips ✓" : "did NOT trip ✗"}`);
const clean = cur.length === 10 && cur.every((r) => r.pass);
console.log(`  current tree:                  ${cur.filter((r) => r.pass).length}/${cur.length} pass  ${clean ? "✓" : "✗"}`);

const good = preTeeth && inkTeeth && clean;
console.log(`\n${good ? "PASS" : "FAIL"} — all ten assertions have teeth; current tree ${clean ? "clean" : "NOT clean"}.`);
if (good) { fs.rmSync(preDir, { recursive: true, force: true }); fs.rmSync(preFixDir, { recursive: true, force: true }); }
else process.exit(1);
