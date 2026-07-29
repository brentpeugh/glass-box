/** Teeth proof for validate-surface (the way validate-curation.ts was proven against its pre-fix
 *  state): every register-surface assertion must FAIL against the pre-reskin baseline and PASS on the
 *  current tree. If an assertion passes on pre-reskin it has no teeth — this script fails loudly.
 *  Run:  npx tsx scripts/validate-surface-teeth.ts   (or npm run validate:surface:teeth)
 */
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PRE_RESKIN = "3e409c1"; // brief base — "full register sweep" started here
const FILES = ["index.css", "App.tsx", "catalog.ts"];

const run = (srcDir: string) => {
  try {
    return execSync(`npx tsx "${path.join("scripts", "validate-surface.ts")}" "${srcDir}"`, { cwd: root, encoding: "utf8" });
  } catch (e: any) {
    return (e.stdout || "") + (e.stderr || ""); // exit 1 on failures is expected; keep the output
  }
};
const score = (out: string) => {
  const m = out.match(/register surface: (\d+)\/(\d+)/);
  return m ? { pass: +m[1], total: +m[2] } : { pass: -1, total: -1 };
};

// pre-reskin src → temp dir
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "surface-teeth-"));
for (const f of FILES) fs.writeFileSync(path.join(tmp, f), execSync(`git show ${PRE_RESKIN}:src/${f}`, { cwd: root, encoding: "utf8" }));

const pre = run(tmp);
const cur = run(path.join(root, "src"));
const preScore = score(pre), curScore = score(cur);

console.log(`TEETH PROOF — validate-surface vs pre-reskin ${PRE_RESKIN}\n`);
console.log(`  pre-reskin (${PRE_RESKIN}):  ${preScore.pass}/${preScore.total} pass  → ${preScore.total - preScore.pass} of ${preScore.total} assertions trip (teeth)`);
console.log(`  current tree:        ${curScore.pass}/${curScore.total} pass`);

const teeth = preScore.pass === 0 && preScore.total > 0;      // every assertion fails on pre-reskin
const holds = curScore.pass === curScore.total && curScore.total > 0; // every assertion passes now
console.log(`\n${teeth && holds ? "PASS" : "FAIL"} — ${teeth ? "all" : "NOT all"} assertions have teeth; current tree ${holds ? "clean" : "NOT clean"}.`);
if (!(teeth && holds)) {
  if (!teeth) console.log("  ✗ some assertion passed on pre-reskin (no teeth):\n" + pre.split("\n").filter((l) => l.includes("✓")).join("\n"));
  process.exit(1);
}
fs.rmSync(tmp, { recursive: true, force: true });
