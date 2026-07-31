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
    "node-glyph", "proxy", "chart-title", "chart-trace",
    "dt-num", "mx-cell", "kcell-v", "ev-trace", "test-run", "bridge-trace", "chip", "recur-rank",
    "pb-reset", "dbg-cap", "asked", "asked-h", "disclose", "foot-src", "foot-trace", "dye-scribe", "lede-figures", "audit-toggle", "trace-origin-mark",
    // structural accent that frames the traceable field
    "sec-n", "card", "role", "frame-tick", "brief-head", "dbg-h",
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
    "kcell-v", "kcell-b", "co-v", "co-basis", "mx-cell", "dt-num", "node-val", "drawer-rootval",
    "ev-val", "bl-val", "tm-val", "wf-xval", "cx-dlab", "dlab", "readout", "wf-bar", "co-bar",
    "cx-dot", "scat-dot", "hbar-bar",
  ]);
  const bad: string[] = [];
  for (const r of rules)
    if (hasClassIn(r.prelude, NUMERIC) && /(?:transition|animation)(?:-name)?:\s*(?!none)/.test(r.body)) bad.push(r.prelude);
  ok("no transition/animation on a numeric-value element", bad.length === 0, bad.join(", "));
}

// ── 9 · every font-size resolves to the ladder or --t-tab ────────────────────────────────────────
// Ladder = --t-1 10 · --t-2 11 · --t-3 14 · --t-4 20 · --t-5 26 · --t-6 40 (+ --t-tab 12 for tabular).
// TEETH: pre-reskin had 29 distinct font-size values → trips hard.
{
  const okVal = /^(var\(--t-[12345]\)|var\(--t-3b\)|var\(--t-tab\)|10px|11px|12px|14px|16px|20px|26px|inherit)$/;
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

// ── 11 · the thirteen text classes (§2c) ──────────────────────────────────────────────────────────
// Every type-defining rule (sets BOTH font-size and font-weight) resolves to exactly one of the
// thirteen (family, size, weight, tracking) tuples — no ad-hoc combinations. The class is decided by what the
// text does; a chart title and a modal title are the same class. TEETH: post-2b chart titles are
// (mono,11,400) — mono is legal only at 10/12 — so they are NOT a class and trip here.
const SIZE: Record<string, number> = { "--t-1": 10, "--t-2": 11, "--t-3": 14, "--t-3b": 16, "--t-4": 20, "--t-5": 26, "--t-tab": 12, "10px": 10, "11px": 11, "12px": 12, "14px": 14, "16px": 16, "20px": 20, "26px": 26 };
const sizePx = (v: string) => { const m = v.trim().match(/var\((--t-[\w-]+)\)/); return m ? SIZE[m[1]] : SIZE[v.trim()]; };
const declVal = (body: string, prop: string) => { const m = body.match(new RegExp("(?:^|[;{\\s])" + prop + ":\\s*([^;}]+)")); return m ? m[1].trim() : null; };
const isMono = (body: string) => /var\(--font-mono\)|IBM Plex Mono/.test(body);
// declared letter-spacing in em: undefined = not declared · null = declared but non-em (px etc.) · number = em
const declTrackEm = (body: string): number | null | undefined => { const v = declVal(body, "letter-spacing"); if (v == null) return undefined; const m = v.match(/^(-?\d*\.?\d+)em$/); return m ? parseFloat(m[1]) : null; };
// (family, size, weight, tracking-em) — tracking is the tracked-caps letter-spacing (.10em for the
// three caps roles: title/label/note); null where the role isn't tracked-caps and its letter-spacing
// is unconstrained. One value per role: adding tracking here is what makes a .14em label a violation.
const CLASSES: Record<string, [string, number, number, number | null]> = {
  hero: ["sans", 26, 700, null], lede: ["sans", 26, 600, null], value: ["sans", 20, 700, null], heading: ["sans", 20, 600, null], prose: ["sans", 16, 400, null],
  name: ["sans", 14, 400, null], action: ["sans", 16, 600, null], datum: ["sans", 12, 700, null], title: ["sans", 11, 600, 0.10],
  label: ["sans", 11, 400, 0.10], scaffold: ["sans", 10, 400, null], note: ["mono", 10, 400, 0.10], machine: ["mono", 12, 400, null],
};
const TRIPLES = new Set(Object.values(CLASSES).map(([f, s, w]) => `${f}|${s}|${w}`));
const CLASS_OF: Record<string, string> = Object.fromEntries(Object.entries(CLASSES).map(([n, [f, s, w]]) => [`${f}|${s}|${w}`, n]));   // (fam|px|wt) → class name (each triple is unique)
const MARKS = new Set(["rail-mark"]);   // the brand glyph (⟡) is not a text class — exempt
// tracking is enforced for the caps roles EXCEPT the rail chrome: .railbtn tracks tighter (.08em) so
// its two-word labels fit the 56px rail — widening to .10em risks clipping the razor-thin fit.
const TRACK_EXEMPT = new Set(["railbtn"]);
{
  const bad: string[] = [];
  for (const r of rules) {
    if (r === tokenBlock || hasClassIn(r.prelude, MARKS)) continue;
    if (/^\.t-(hero|lede|value|heading|prose|name|action|datum|title|label|scaffold|note|machine)$/.test(r.prelude.trim())) continue; // the canonical defs
    const size = declVal(r.body, "font-size"), weight = declVal(r.body, "font-weight");
    if (!size || !weight || size === "inherit") continue;   // only rules that define both
    const px = sizePx(size); if (px == null) continue;       // bad sizes are #9's job
    const wt = parseInt(weight, 10); if (isNaN(wt)) continue;
    const fam = isMono(r.body) ? "mono" : "sans";
    const key = `${fam}|${px}|${wt}`;
    if (!TRIPLES.has(key)) { bad.push(`${r.prelude} → ${fam} ${px}/${wt}`); continue; }
    // tracking: a caps role (title/label/note) carries ONE tracking value (.10em); a rule that declares
    // a different one is two values for one role (the .14em-vs-override shadow this now catches).
    const cls = CLASS_OF[key], spec = CLASSES[cls][3];
    if (spec != null && !hasClassIn(r.prelude, TRACK_EXEMPT)) {
      const t = declTrackEm(r.body);
      if (t !== undefined && (t == null || Math.abs(t - spec) > 1e-9)) bad.push(`${r.prelude} → ${cls} tracking ${t == null ? "non-em" : t + "em"} ≠ ${spec}em`);
    }
  }
  ok("every type rule resolves to one of the 13 classes — (family, size, weight, tracking)", bad.length === 0, bad.join(" · "));
}

// ── 12 · mono marks raw machine output only ───────────────────────────────────────────────────────
// --font-mono appears only on .note and .machine — source lines, provenance rows, IDs, JSON. On any
// other selector mono is decorative. TEETH: post-2b put mono on kcell-v, dt-num, chart-title, the KPI
// labels … → trips.
{
  const NOTE_MACHINE = new Set(["src-note", "co-note", "foot-note", "foot-status", "ev-trace", "brief-viol", "node-op", "node-desc", "dbg-meta", "proxy", "rows-recon", "err-msg", "rows-stat", "rows-cap", "rows-tbl", "dbg-pre", "mono", "t-note", "t-machine"]);
  const bad: string[] = [];
  for (const r of rules) {
    if (r === tokenBlock) continue;
    if (isMono(r.body) && !hasClassIn(r.prelude, NOTE_MACHINE)) bad.push(r.prelude);
  }
  ok("--font-mono only on .note / .machine (raw machine output), never decorative", bad.length === 0, bad.join(", "));
}

// ── 13 · tabular figures ──────────────────────────────────────────────────────────────────────────
// Every class carrying figures — hero, value, datum, machine — sets tabular-nums (uniform-width digits
// without a monospace face, the two-voice rule's whole point). Checked on the canonical class defs.
{
  const bad: string[] = [];
  for (const cls of ["t-hero", "t-value", "t-datum", "t-machine"]) {
    const r = rules.find((x) => x.prelude.trim() === "." + cls);
    if (!r || !/font-variant-numeric:[^;}]*(tabular-nums|var\(--num\))/.test(r.body)) bad.push(cls);
  }
  ok("tabular-nums on every figure class (hero, value, datum, machine)", bad.length === 0, `missing: ${bad.join(", ")}`);
}

// ── 14 · role teeth — the two drifts the class system exists to catch ──────────────────────────────
// A chart title and a modal title do the same job → both `title` (600, caps). A falsifier question is a
// clickable proposition → `action` (600), not `prose` (400) commentary. TEETH: post-2b chart-title is
// (mono,11,400) and .test-q is (sans,14,400) — both trip.
{
  const roleOf = (cls: string): [string, number, number] | null => {
    const r = rules.find((x) => classesOf(x.prelude).includes(cls) && declVal(x.body, "font-size") && declVal(x.body, "font-weight"));
    if (!r) return null;
    const px = sizePx(declVal(r.body, "font-size")!); const wt = parseInt(declVal(r.body, "font-weight")!, 10);
    return [isMono(r.body) ? "mono" : "sans", px as number, wt];
  };
  const eq = (a: [string, number, number] | null, cls: string) => !!a && `${a[0]}|${a[1]}|${a[2]}` === `${CLASSES[cls][0]}|${CLASSES[cls][1]}|${CLASSES[cls][2]}`;
  const ct = roleOf("chart-title"), tq = roleOf("test-q");
  ok("chart titles are `title` (not an axis-tick weight)", eq(ct, "title"), `chart-title → ${ct ? ct.join("/") : "?"}`);
  ok("falsifier questions are `action` (not `prose` commentary)", eq(tq, "action"), `test-q → ${tq ? tq.join("/") : "?"}`);
}

// ── 15 · authorship is marked by the LABEL alone — no ground channel (§5, Stage C) ────────────────
// The lede once used a --plane ground to mark model-authored prose; that channel was REMOVED. Authorship
// is now carried by the MODEL-AUTHORED / DETERMINISTIC label and nothing else. STRONGER than the old
// "--plane never on deterministic content": with no second ground, the earlier failure mode (a ground
// that disagrees with the label) is UNREPRESENTABLE. The check: (a) the --plane channel is gone (no
// token, no reference); (b) no .lede-prose rule paints a ground but --field; (c) no authorship-gated
// ground class in the JSX. TEETH (fixture "plane-ground"): reviving a --plane ground trips it.
{
  const bad: string[] = [];
  // (a) the --plane channel is removed entirely (block comments are stripped, so a mention there is fine)
  if (/--plane\b/.test(stripBlock(css))) bad.push("--plane still present (authorship ground channel not removed)");
  // (b) the lede ground is always --field — no .lede-prose rule paints another ground token
  for (const r of rules) {
    if (r === tokenBlock) continue;
    if (/\.lede-prose\b/.test(r.prelude)) { const m = r.body.match(/background(?:-color)?:\s*var\(--([\w-]+)\)/); if (m && m[1] !== "field") bad.push(`${r.prelude} paints --${m[1]} (lede ground must stay --field)`); }
  }
  // (c) JSX: no authorship-gated ground class on the lede (a `plane` ground class is the revived channel)
  const groundClass = [...stripAll(appTsx).matchAll(/className=(\{`[^`]*`\}|"[^"]*"|'[^']*')/g)].map((m) => m[1]).filter((s) => /\bplane\b/.test(s));
  if (groundClass.length) bad.push(`jsx authorship ground class: ${groundClass[0].replace(/\s+/g, " ").slice(0, 60)}`);
  ok("authorship is marked by the label alone — lede ground always --field, no --plane channel (§5)", bad.length === 0, bad.join(" · "));
}

// ── 17 · identical skeleton across states — no block is gated on authorship (§ invariant) ──────────
// Live and fallback hold the same blocks, in the same positions, at the same sizes; only the content
// and the authorship LABEL differ (the ground is --field either way). A block that renders in one state and not the other
// (a state-gated `&&`, or a `? <block> : null`) is the violation: if a deterministic path can't fill a
// block the model fills, that's a gap to close, not a reason to hide the block. TEETH: any
// `{isModel && <…/>}` or `{isModel ? <…/> : null}` trips.
{
  const jsx = stripAll(appTsx);
  const STATE = `(?:isModel|isLive|source\\s*===?\\s*["'\`](?:live|fallback)["'\`])`;
  const patterns = [
    new RegExp(`${STATE}\\s*&&\\s*<`, "g"),                       // block gated ON a state
    new RegExp(`${STATE}\\s*\\?[^:{}]*<[^:{}]*:\\s*null\\b`, "g"), // <block> in true branch, null in false
    new RegExp(`${STATE}\\s*\\?\\s*null\\s*:[^{}]*<`, "g"),        // null in true branch, <block> in false
  ];
  const bad: string[] = [];
  for (const rx of patterns) for (const m of jsx.matchAll(rx)) bad.push(m[0].replace(/\s+/g, " ").slice(0, 56));
  // T4: the falsifier block and its aggregate badge are part of the shared skeleton — present in BOTH
  // states (a gate on either would already trip the patterns above). Assert they exist so they can't be
  // silently dropped, and that the aggregate rides the authorship label rather than a state branch.
  if (!/className="lede-tests"/.test(jsx)) bad.push("falsifier block (.lede-tests) absent from the lede");
  if (!/className="lede-test test-q"/.test(jsx)) bad.push("falsifier question (.lede-test action) absent");
  if (!/\{aggregate\}/.test(jsx)) bad.push("aggregate result badge absent from the authorship label");
  ok("identical skeleton across states — incl. the falsifier block + aggregate badge (§ invariant)", bad.length === 0, bad.join(" · "));
}

// ── 18 · every route-to-provenance affordance (--dye) resolves to `label` type ────────────────────
// CONTRACT (broadened, Stage D): --dye routes the eye/click to PROVENANCE — whether the provenance of
// a VALUE (`▸ trace` on a chart/evidence value) or the provenance of a PANEL'S PRESENCE (`▸ alternatives`
// on a slot — the forms it was chosen over, and the engine-derived reasons), or the provenance of the
// ARRANGEMENT itself (`▸ the contract` on the footer claim — the contract governing how the board was
// made). All wear ONE form: ▸ …, tracked caps, sans 11/400, --dye. This pins the TYPE (the dye allowlist
// #3 gates WHERE dye may live). TEETH: a route at title weight (600), or in mono, or not caps, trips it.
{
  const AFFORDANCE = ["chart-trace", "ev-trace", "audit-toggle", "foot-trace"];
  const [lf, ls, lw, lt] = CLASSES.label;   // sans, 11, 400, .10em
  const bad: string[] = [];
  for (const cls of AFFORDANCE) {
    const r = rules.find((x) => classesOf(x.prelude).includes(cls) && declVal(x.body, "font-size"));
    if (!r) { bad.push(`${cls} (no rule)`); continue; }
    if (!/var\(--dye\)/.test(r.body)) { bad.push(`${cls} (not --dye)`); continue; }
    const px = sizePx(declVal(r.body, "font-size")!);
    const wt = declVal(r.body, "font-weight") ? parseInt(declVal(r.body, "font-weight")!, 10) : 400;
    const fam = isMono(r.body) ? "mono" : "sans";
    const caps = /text-transform:\s*uppercase/.test(r.body);
    const track = declTrackEm(r.body);
    const trackOk = lt == null || track === lt;
    if (fam !== lf || px !== ls || wt !== lw || !caps || !trackOk) bad.push(`${cls} → ${fam} ${px}/${wt}${caps ? "" : " not-caps"}${trackOk ? "" : ` track ${track == null ? "non-em" : track + "em"}`}`);
  }
  ok("every trace affordance (--dye route-to-source) resolves to `label` type", bad.length === 0, bad.join(" · "));
}

// ── 19 · the lede's model prose reaches the DOM only through <Substitute> (T4 digit closure) ────────
// The model authors words + {tokens}; the engine owns every figure. If the raw model string were
// interpolated ({curation.thesis}), a digit could reach the most prominent prose on the board
// unengineered. The STRUCTURAL guarantee (stronger than the behavioural digit-guard): the lede-sentence
// and lede-why render via <Substitute> — which emits only engine-owned token values, dye-scribed to
// their source — and no raw curation.thesis/whyRole is interpolated into the lede. This is what
// converts "no number reaches the screen unengineered" from behaviour into structure. TEETH (fixture
// "raw-thesis"): rendering {curation.thesis} raw in .lede-sentence trips it.
{
  const jsx = stripAll(appTsx);
  const bad: string[] = [];
  const sentence = jsx.match(/<p className="lede-sentence">([\s\S]*?)<\/p>/);
  const whyP = jsx.match(/<p className="lede-why">([\s\S]*?)<\/p>/);
  if (!sentence || !/<Substitute\b/.test(sentence[1])) bad.push("lede-sentence not rendered via <Substitute>");
  if (!whyP || !/<Substitute\b/.test(whyP[1])) bad.push("lede-why not rendered via <Substitute>");
  if (/\{\s*curation\.(thesis|whyRole)\s*\}/.test(jsx)) bad.push("raw model prose interpolated — curation.thesis/whyRole reaches the DOM unengineered");
  ok("lede model prose reaches the DOM only through <Substitute> (no raw digit path)", bad.length === 0, bad.join(" · "));
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — register surface: ${pass}/${pass + fail} assertions`);
if (fail > 0) process.exit(1);
