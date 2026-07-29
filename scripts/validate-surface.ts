/** Register-surface validator (reskin Stage 4). A STATIC proof that the institutional register's
 *  invariants hold in the current tree — the reskin brief's §2–§4 rules, machine-checked. This is
 *  CSS-independent of the other three validators (they prove behaviour; this proves the surface).
 *
 *  Run:   npx tsx scripts/validate-surface.ts [srcDir]     → reports N/N, exit 1 on any failure.
 *  Teeth: npx tsx scripts/validate-surface.ts <pre-reskin-src>  → every assertion trips. The
 *         `npm run validate:surface:teeth` target checks out the pre-reskin commit's src/ into a
 *         temp dir and runs this against it, the way validate-curation proved its assertion against
 *         the pre-fix state. Each assertion's teeth are annotated inline (TEETH: …).
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.resolve(root, process.argv[2] || "src");

const read = (f: string) => (fs.existsSync(path.join(srcDir, f)) ? fs.readFileSync(path.join(srcDir, f), "utf8") : "");
const css = read("index.css");
const appTsx = read("App.tsx");
const catalogTs = read("catalog.ts");

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${name}${cond ? "" : "  — " + detail}`);
};

// ── comment stripping ───────────────────────────────────────────────────────────────────────────
const stripBlock = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const stripLine = (s: string) => s.replace(/^\s*\/\/.*$/gm, "");     // full-line // only (spares https://)
const stripAll = (s: string) => stripLine(stripBlock(s));

// ── CSS block walker: every `{…}` → {prelude, body}, any nesting depth (@media inner rules included) ─
type Block = { prelude: string; body: string; depth: number };
function walk(text: string): Block[] {
  const src = stripBlock(text);
  const out: Block[] = [];
  const stack: { prelude: string; bodyStart: number; depth: number }[] = [];
  let segStart = 0;
  for (let p = 0; p < src.length; p++) {
    const ch = src[p];
    if (ch === "{") {
      stack.push({ prelude: src.slice(segStart, p).trim(), bodyStart: p + 1, depth: stack.length });
      segStart = p + 1;
    } else if (ch === "}") {
      const b = stack.pop();
      if (b) out.push({ prelude: b.prelude, body: src.slice(b.bodyStart, p), depth: b.depth });
      segStart = p + 1;
    } else if (ch === ";" && stack.length === 0) {
      segStart = p + 1;
    }
  }
  return out;
}
const blocks = walk(css);
const isAt = (p: string) => p.startsWith("@");
const isStep = (p: string) => /^(\d+%|from|to)(\s*,\s*(\d+%|from|to))*$/.test(p);
const rules = blocks.filter((b) => !isAt(b.prelude) && !isStep(b.prelude));
const tokenBlock = rules.find((r) => r.prelude === ":root") || rules.find((r) => r.prelude === ".caliper");
const classesOf = (prelude: string) => (prelude.match(/\.[A-Za-z_][\w-]*/g) || []).map((s) => s.slice(1));
const hasClassIn = (prelude: string, set: Set<string>) => classesOf(prelude).some((c) => set.has(c));

console.log(`REGISTER-SURFACE PROOF  (src: ${path.relative(root, srcDir) || "src"})\n`);

// ── 1 · no non-zero border-radius ─────────────────────────────────────────────────────────────
// TEETH: pre-reskin had 15 non-zero radii + two 50% dots → trips.
{
  const bad: string[] = [];
  for (const b of blocks)
    for (const d of b.body.match(/border-radius:\s*[^;}]+/g) || []) {
      const v = d.split(":")[1].trim();
      if (!/^0(px|em|rem|%)?(\s+0(px|em|rem|%)?)*$/.test(v)) bad.push(`${b.prelude}{${d.trim()}}`);
    }
  ok("no non-zero border-radius", bad.length === 0, bad.join(" · "));
}

// ── 2 · no colour literal outside the token block (CSS hex/rgba, SVG attrs, JSX inline) ──────────
// TEETH: pre-reskin had 74 hex + 25 rgba in CSS and a treemap/segment hex ramp in App/catalog → trips.
{
  const litRe = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;
  const bad: string[] = [];
  for (const r of rules) {
    if (r === tokenBlock) continue;
    const hits = r.body.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/g);
    if (hits) bad.push(`${r.prelude}: ${[...new Set(hits)].join(",")}`);
  }
  for (const [name, text] of [["App.tsx", appTsx], ["catalog.ts", catalogTs]] as [string, string][]) {
    const hits = stripAll(text).match(/#[0-9a-fA-F]{3,6}\b|\brgba?\(/g);
    if (hits) bad.push(`${name}: ${[...new Set(hits)].slice(0, 8).join(",")}`);
  }
  ok("no colour literal outside the token block (CSS · SVG attrs · JSX inline)", bad.length === 0, bad.join(" · "));
}

// ── 3 · --dye only on route-to-source affordances; no second accent ──────────────────────────────
// The one sacred accent routes the eye/click to provenance (interactive source-routes + the framing
// that leads to them). A denied list would be fragile; the allowlist is the set of selectors that
// legitimately carry it. TEETH: pre-reskin used --gold/--brass/--navy (second accent + status) → trips.
{
  const ACCENT_OK = new Set([
    // interactive source-routes
    "inspect", "node-glyph", "node-kids", "proxy", "chart-title", "chart-trace", "fband-inspect",
    "dt-num", "mx-cell", "ev-trace", "test-run", "trust-link", "bridge-trace", "chip", "recur-rank",
    "recur", "pb-reset", "sf-badge", "drawer-t", "dbg-cap", "asked", "asked-h", "disclose",
    // structural accent that frames the traceable field
    "hdr", "sec-n", "card", "anno", "role", "frame-tick", "brief-head", "dbg-h", "fband",
    "rail",
  ]);
  const dyeBad: string[] = [], second: string[] = [];
  for (const r of rules) {
    if (r === tokenBlock) continue;
    if (/var\(--(gold|brass|navy)\)/.test(r.body)) second.push(r.prelude);
    if (/var\(--dye\)/.test(r.body) && !hasClassIn(r.prelude, ACCENT_OK)) dyeBad.push(r.prelude);
  }
  ok("--dye only on route-to-source affordances; no second accent (gold/brass/navy)",
    dyeBad.length === 0 && second.length === 0,
    [dyeBad.length ? `dye off-route: ${dyeBad.join(", ")}` : "", second.length ? `second accent: ${second.join(", ")}` : ""].filter(Boolean).join(" · "));
}

// ── 4 · --pos/--neg only on variance values, never a chart mark or a UI status ───────────────────
// Valence tokens (both this generation and the pre-reskin --verdant/--ember family) may appear only
// on the sanctioned variance selectors. TEETH: pre-reskin put --verdant/--ember on live-dot, statuses,
// err boundary, recon, ptype … → trips.
{
  const VALENCE = /var\(--(pos|neg|verdant|verdant-bg|ember|ember-bg|ember2)\)/;
  const VARIANCE_OK = new Set(["kcell-b", "rows-tbl"]);
  const bad: string[] = [];
  for (const r of rules) {
    if (r === tokenBlock) continue;
    if (VALENCE.test(r.body) && !hasClassIn(r.prelude, VARIANCE_OK)) bad.push(r.prelude);
  }
  ok("--pos/--neg only on variance values (never a chart mark or UI status)", bad.length === 0, bad.join(", "));
  // report-only: JSX valence className sites, for the eye (selector binding can't be proven statically).
  const jsx = (stripAll(appTsx).match(/\?\s*"pos"\s*:\s*"neg"|className=["'`][^"'`]*\b(?:pos|neg)\b/g) || []);
  console.log(`  · report-only: ${jsx.length} JSX valence-class site(s) — all must be Δ cells in .rows-tbl`);
}

// ── 5 · no legend markup ─────────────────────────────────────────────────────────────────────────
// Markup = rendered JSX, not a dead CSS class; charts carry direct end-labels, no colour key.
// TEETH: pre-reskin rendered <div className="legend"> with .sw swatch chips (removed in Stage 2) → trips.
{
  const bad: string[] = [];
  for (const [name, text] of [["App.tsx", appTsx], ["catalog.ts", catalogTs]] as [string, string][]) {
    const jsx = stripAll(text);
    if (/class(?:Name)?=(["'`{])[^"'`>]*\blegend\b/.test(jsx)) bad.push(`${name}: legend className`);
    if (/class(?:Name)?=(["'`{])[^"'`>]*(?<![\w-])sw(?![\w-])/.test(jsx)) bad.push(`${name}: .sw swatch`);
  }
  ok("no legend markup", bad.length === 0, bad.join(" · "));
}

// ── 6 · no gradient or url() fill ───────────────────────────────────────────────────────────────
// TEETH: pre-reskin had linear-gradients + SVG <linearGradient>/stopColor and a font @import url() → trips.
{
  const re = /linear-gradient|radial-gradient|conic-gradient|\burl\(|<(?:linear|radial)gradient|stop-?color|gradientunits/i;
  const bad: string[] = [];
  for (const [name, text] of [["index.css", stripBlock(css)], ["App.tsx", stripAll(appTsx)], ["catalog.ts", stripAll(catalogTs)]] as [string, string][]) {
    const m = text.match(re);
    if (m) bad.push(`${name}: ${m[0]}`);
  }
  ok("no gradient or url() fill", bad.length === 0, bad.join(" · "));
}

// ── 7 · every @keyframes is applied and guarded under prefers-reduced-motion (no dead keyframes) ──
// A defined-but-unapplied keyframe is register cruft; an applied one must be disabled under RM.
// TEETH: pre-reskin defined pulse + grow but applied neither → both dead → trips.
{
  const kf = [...stripBlock(css).matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  const rmText = blocks.filter((b) => b.prelude.startsWith("@media") && /prefers-reduced-motion\s*:\s*reduce/.test(b.prelude)).map((b) => b.body).join("\n");
  const inlineAnim = stripAll(appTsx);
  const bad: string[] = [];
  for (const name of kf) {
    const cssUsers = rules.filter((r) => new RegExp(`animation(?:-name)?:[^;}]*\\b${name}\\b`).test(r.body));
    const inlineUsed = new RegExp(`animation[^;}"'\`]*\\b${name}\\b`).test(inlineAnim);
    if (cssUsers.length === 0 && !inlineUsed) { bad.push(`${name} (dead — defined, never applied)`); continue; }
    for (const c of cssUsers)
      if (!classesOf(c.prelude).some((cl) => new RegExp(`\\.${cl}\\b[^{}]*animation\\s*:\\s*none`).test(rmText))) bad.push(`${name} on ${c.prelude} (unguarded)`);
  }
  ok("every @keyframes is applied and guarded under prefers-reduced-motion (no dead keyframes)", bad.length === 0, bad.join(" · "));
}

// ── 8 · no transition or animation on an element carrying a numeric value ─────────────────────────
// The numbers are the authority — a readout or a value-bearing mark must not move or fade. TEETH:
// pre-reskin grew the waterfall/hbar value bars (animation:grow) and transitioned value cells → trips.
{
  const NUMERIC = new Set([
    "kcell-v", "kcell-b", "co-v", "co-basis", "fside-v", "mx-cell", "dt-num", "sf-val", "node-val",
    "ev-val", "bl-val", "tm-val", "wf-xval", "cx-dlab", "dlab", "readout", "wf-bar", "co-bar",
    "cx-dot", "scat-dot", "mt-dot", "hbar-bar",
  ]);
  const bad: string[] = [];
  for (const r of rules)
    if (hasClassIn(r.prelude, NUMERIC) && /(?:transition|animation)(?:-name)?:\s*(?!none)/.test(r.body)) bad.push(r.prelude);
  ok("no transition/animation on a numeric-value element", bad.length === 0, bad.join(", "));
}

// ── 9 · every font-size resolves to the ladder or --t-tab ────────────────────────────────────────
// Ladder = --t-1 10 · --t-2 11 · --t-3 14 · --t-4 20 · --t-6 40 (+ --t-tab 12 for tabular). TEETH:
// pre-reskin had 29 distinct font-size values → trips hard.
{
  const okVal = /^(var\(--t-[12346]\)|var\(--t-tab\)|10px|11px|12px|14px|20px|40px|inherit)$/;
  const bad: string[] = [];
  for (const b of blocks)
    for (const d of b.body.match(/font-size:\s*[^;}]+/g) || []) {
      const v = d.split(":")[1].trim();
      if (!okVal.test(v)) bad.push(`${b.prelude}{${d.trim()}}`);
    }
  ok("every font-size resolves to the ladder or --t-tab", bad.length === 0, bad.join(" · "));
}

// ── 10 · type on an ink ground uses --frame-ink/--frame-mute, never --ink/--ink-2 ────────────────
// A valence/status sweep can recolour a foreground without checking its background; on an ink-ground
// container, --ink/--ink-2 text is invisible. For each member of a known-ink container, the EFFECTIVE
// (cascaded) resting colour must be a frame token. TEETH: catches .brief-src.live/.fallback and
// .brief-status.holds/.weakened on the ink .brief-head before their dark-head overrides are added.
{
  const INK: Record<string, string[]> = {
    "brief-head": ["brief-tag", "brief-x", "brief-src.live", "brief-src.fallback", "brief-status.untested", "brief-status.holds", "brief-status.weakened"],
    "hdr": ["hdr-mark", "hdr-sub", "hdr-r", "hdr-status", "lensbtn", "recur", "trust-link", "disclose"],
    "dbg-h": ["dbg-title", "dbg-meta", "dbg-close"],
    "rail": ["rail-mark", "railbtn"],
  };  // .rail-foot is a --field surface (Tuning 1a), not an ink container — its text is ink/ink-2
  const lastSimple = (p: string) => p.trim().split(/\s+|>|\+|~/).filter(Boolean).pop() || "";
  const clsOf = (sel: string) => new Set((sel.match(/\.[A-Za-z_][\w-]*/g) || []).map((s) => s.slice(1)));
  const colorOf = (body: string) => { const m = body.match(/(?:^|[;{\s])color:\s*var\(--([\w-]+)\)/); return m ? m[1] : null; };
  const selfBg = (body: string) => /background(?:-color)?:\s*var\(--(?!ink\b)[\w-]+\)/.test(body); // establishes its own non-ink ground
  // expand comma-separated selector lists into individual (sel, body) declarations
  const decls = rules.flatMap((r) => r.prelude.split(",").map((sel) => ({ sel: sel.trim(), body: r.body })));
  const bad: string[] = [];
  for (const [container, members] of Object.entries(INK)) {
    const scopedRe = new RegExp("\\." + container + "(?![-\\w])");
    for (const member of members) {
      const want = new Set(member.split("."));
      const cands = decls.filter((d) => {
        if (lastSimple(d.sel).includes(":")) return false;               // skip :hover/:focus states
        const ls = clsOf(lastSimple(d.sel));
        return ls.size === want.size && [...want].every((c) => ls.has(c)) && colorOf(d.body);
      });
      if (!cands.length) continue;
      const scoped = cands.filter((d) => scopedRe.test(d.sel));
      const winner = (scoped.length ? scoped : cands).slice(-1)[0];       // scoped beats global; later beats earlier
      const col = colorOf(winner.body);
      if ((col === "ink" || col === "ink-2") && !selfBg(winner.body)) bad.push(`${container} › ${member} (--${col})`);
    }
  }
  ok("type on an ink ground uses --frame-ink/--frame-mute, never --ink/--ink-2", bad.length === 0, bad.join(" · "));
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — register surface: ${pass}/${pass + fail} assertions`);
if (fail > 0) process.exit(1);
