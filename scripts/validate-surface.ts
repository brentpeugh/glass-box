/** Surface enforcement — the structural safeguard the design philosophy lacked (brief §8).
 *  Asserts the withholding invariants over src/ so violations are unrepresentable, not merely
 *  currently-absent. Seven assertions from §8, plus two: the shim deadline and the drift seam.
 *  Run: npx tsx scripts/validate-surface.ts   → reports N/9. */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const curation = fs.readFileSync(path.join(root, "src/curation.ts"), "utf8");
const engine = fs.readFileSync(path.join(root, "src/engine-core.ts"), "utf8");

// strip /* */ comments (keep newlines) so comments never trip a literal/keyword check
const strip = (s: string) => { let o = ""; for (let i = 0; i < s.length;) { if (s[i] === "/" && s[i + 1] === "*") { const e = s.indexOf("*/", i + 2); o += (e < 0 ? s.slice(i) : s.slice(i, e + 2)).replace(/[^\n]/g, " "); i = e < 0 ? s.length : e + 2; } else { o += s[i++]; } } return o; };
const cssC = strip(css);

// the :root token block = the first `.caliper{ ... }` rule (canonical tokens live only here)
const tokStart = cssC.indexOf(".caliper{");
let depth = 0, tokEnd = tokStart;
for (let i = cssC.indexOf("{", tokStart); i < cssC.length; i++) { if (cssC[i] === "{") depth++; else if (cssC[i] === "}") { depth--; if (depth === 0) { tokEnd = i; break; } } }
const tokenBlock = cssC.slice(tokStart, tokEnd + 1);
const outsideTokens = cssC.slice(0, tokStart) + cssC.slice(tokEnd + 1);

// parse CSS into {selector, body} rules (top-level and inside @media)
type Rule = { sel: string; body: string };
const rules: Rule[] = [];
{ let b = "", i = 0; const stack: string[] = [];
  while (i < cssC.length) { const ch = cssC[i];
    if (ch === "{") { const pre = b.trim(); b = ""; if (pre.startsWith("@")) { stack.push(pre); i++; continue; }
      let d = 1, j = i + 1; for (; j < cssC.length && d > 0; j++) { if (cssC[j] === "{") d++; else if (cssC[j] === "}") d--; }
      const body = cssC.slice(i + 1, j - 1);
      pre.split(",").map((s) => s.trim()).filter(Boolean).forEach((sel) => rules.push({ sel, body }));
      i = j; continue;
    } else if (ch === "}") { if (stack.length) stack.pop(); b = ""; i++; continue; } else { b += ch; i++; } } }

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "✓" : "✗"} ${label}${ok || !detail ? "" : "\n      " + detail}`); };

// 1 — no border-radius with a non-zero value
const radii = [...cssC.matchAll(/border-radius\s*:\s*([^;}]+)/g)].map((m) => m[1].trim()).filter((v) => !/^(0(px)?|none)$/.test(v));
check("1. zero radius everywhere (no non-zero border-radius)", radii.length === 0, `found: ${radii.join(", ")}`);

// 2 — no hex or rgb()/rgba() colour literal outside the :root token block
const lits = [...outsideTokens.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([\d.,\s%]+\)/g)].map((m) => m[0]);
check("2. no colour literal outside the token block", lits.length === 0, `found: ${[...new Set(lits)].slice(0, 8).join(", ")}`);

// 3 — --dye only on: the read's prose-value rule, the provenance-peek rule, and the pedestal's
// provenance invitation (the ONE board dye). Rejected anywhere else.
const DYE_OK = /(\.ev-val|\.peek|\.invite)/;
const dyeRules = rules.filter((r) => /var\(--dye\)/.test(r.body));
const dyeStray = dyeRules.filter((r) => !DYE_OK.test(r.sel));
check("3. --dye only on prose-value, peek, and pedestal-invitation rules", dyeStray.length === 0 && dyeRules.length > 0, dyeRules.length === 0 ? "--dye is unused" : `stray: ${dyeStray.map((r) => r.sel).join(", ")}`);

// 4 — exactly one filled dark background on an interactive element
const filled = rules.filter((r) => /background\s*:\s*var\(--ink\)|background\s*:\s*#(000|14171a)/.test(r.body) && (/cursor\s*:\s*pointer/.test(r.body) || /button/.test(r.sel)));
check("4. exactly one filled dark interactive background (the falsifier)", filled.length === 1, `count ${filled.length}: ${filled.map((r) => r.sel).join(", ")}`);

// 5 — --plane used by exactly one region (as a background)
const planeRegions = rules.filter((r) => /background\s*:\s*var\(--plane\)/.test(r.body));
check("5. --plane is one region", planeRegions.length === 1, `count ${planeRegions.length}: ${planeRegions.map((r) => r.sel).join(", ")}`);

// 6 — every @keyframes has a matching prefers-reduced-motion guard
const kf = [...cssC.matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
const rmBlock = (cssC.match(/@media\s*\([^)]*prefers-reduced-motion[^)]*\)\s*{([\s\S]*?)}\s*(?:$|\/\*|@|\.|#|[a-z])/i) || [, ""])[1] || cssC.slice(cssC.search(/prefers-reduced-motion/));
const kfBad = kf.filter((name) => { const users = rules.filter((r) => new RegExp(`animation\\s*:[^;]*\\b${name}\\b`).test(r.body)).map((r) => r.sel); return users.some((sel) => !new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*{[^}]*animation\\s*:\\s*none`).test(cssC.slice(cssC.search(/prefers-reduced-motion/)))); });
check("6. every @keyframes has a reduced-motion guard", kf.length > 0 ? kfBad.length === 0 : true, `unguarded: ${kfBad.join(", ")}  (keyframes: ${kf.join(", ") || "none"})`);

// 7 — no transition/animation on any element carrying a numeric value
const VALUE_SEL = [".ev-val", ".kcell-v", ".sf-val", ".mx-cell", ".dt-num", ".co-v", ".fside-v", ".read-verdict", ".cx-dlab", ".term", ".dlab", ".idx-lab", ".mt-end", ".bl-val"];
const animatedValues = rules.filter((r) => VALUE_SEL.some((v) => r.sel === v || r.sel.endsWith(" " + v)) && /(^|;|\s)(transition|animation)\s*:/.test(r.body));
check("7. no transition/animation on numeric-value elements", animatedValues.length === 0, animatedValues.map((r) => r.sel).join(", "));

// 8 — shim deadline: zero var(--DEAD) references AND zero legacy-alias definitions
const deadRefs = (cssC.match(/var\(--DEAD\)/g) || []).length;
const aliasDefs = (cssC.match(/--(paper|parch|rule|grid|muted|faint|slate|slate-l|slate-d|navy|data|verdant|ember|ember2|brass|gold|verdant-bg|ember-bg|panel|DEAD)\s*:/g) || []).length;
check("8. shim gone: zero --DEAD refs and zero legacy-alias definitions", deadRefs === 0 && aliasDefs === 0, `--DEAD refs ${deadRefs}, alias defs ${aliasDefs}`);

// 9 — drift seam: the surface must not reimplement the engine's benchmark→grounding derivation.
// The engine exports no grounding deriver, so the surface owns ONE seam (deriveGrounding). Assert
// the mv.basis→status derivation is centralised there and flag the missing engine export.
const engineExportsGrounding = /export\s+function\s+(deriveGrounding|groundingOf|grounding)\b/.test(curation + engine);
const appC = strip(app);
const hasHelper = /function\s+deriveGrounding\s*\(/.test(appC);
const consumes = /engineHeadline\(deriveGrounding\(/.test(appC) && /grounding:\s*deriveGrounding\(/.test(appC);
const inlineBasisGrounding = (appC.match(/grounding\s*:\s*\{[^}]*basis/g) || []).length; // the NAMED drift: mv.basis grounding built inline
const toneDupes = (appC.match(/\.basis\.good\s*===\s*"above"/g) || []).length;           // benchmark logic reused for marker tone
const ok9 = engineExportsGrounding ? consumes : (hasHelper && consumes && inlineBasisGrounding === 0);
check("9. grounding drift consumed via one seam (no engine export)", ok9,
  engineExportsGrounding ? "engine exports a deriver — surface must consume it (drop the local helper)"
    : `no engine export; deriveGrounding=${hasHelper}, consumed=${consumes}, inline mv.basis grounding=${inlineBasisGrounding} (want 0). FLAG: the engine should export this deriver — ${toneDupes} marker-tone sites still reuse the basis→direction comparison, which an engine export would eliminate.`);

console.log("=".repeat(64));
console.log(`SURFACE  ${pass}/${pass + fail} assertions`);
console.log(fail === 0 ? "PASS — surface invariants hold" : "FAIL — surface drift");
process.exit(fail === 0 ? 0 : 1);
