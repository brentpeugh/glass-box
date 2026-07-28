# Stage 0 — Surface Inventory (read-only)

Base: `main` @ `3e409c1`. Register reskin brief. This is the checklist for every later stage.
Style lives in **one** stylesheet (`src/index.css`, 620 lines; token block on `.caliper`, line 3 — **not** `:root`) plus SVG/inline colours in `src/catalog.ts` and `src/App.tsx`.

---

## 1. Rendered surfaces (live vs fallback separately)

| # | surface | CSS anchors | states |
|---|---|---|---|
| 1 | Entry screen | `.entry .entry-mark .entry-sub .entry-roles .role` | single (pre-role) |
| 2 | Rail / header | `.hdr .hdr-mark .hdr-sub .hdr-status .hdr-l .hdr-r` | **live** (`curated live…`) / **fallback** (`Model unavailable…`) / loading |
| 3 | Role toggle | `.lensbtn .lensbtn.on` (+ `.hdr .lensbtn*`) | on / off |
| 4 | Rail actions | `.recur .recur.on` (Read/Query/Perturb/Tools) | idle / active(perturb) |
| 5 | Tools menu | `.hdr-menu-wrap .hdr-menu button` | open |
| 6 | KPI scorecard | `.scorecard .kcell .kcell-v .kcell-l .kcell-b{good,bad,trend}` | deterministic (identical both data states) |
| 7 | Salient band hero | `.fband .fside .fside-v .fband-verb .fband-inspect .fband-right .minigap .mg-* .mtrend .mt-*` | live / fallback |
| 8 | Board block frame | `.frame .frame-tick .frame-h .frame-sw` | **curated** (live) / **deterministic** (fallback) |
| 9 | Chart/table panels | see §1a | per-panel; benchmark/no-benchmark; good/bad |
| 10 | AnalystRead modal | `.brief .brief-head .brief-tag .brief-status{untested,holds,weakened} .brief-thesis .brief-why .brief-lbl .brief-sec .brief-ev .ev-card .brief-tests .test-row .test-run .test-verdict{confirms,weakens} .brief-foot .brief-src{live,fallback} .brief-load .brief-viol .brief-empty` | live/fallback × untested/holds/weakened; loading; empty |
| 11 | Query modal | `.qmodal-bg .qmodal .qmodal-h .qmodal-t .qmodal-x .qmodal-note .qmodal-results .qbar .qin .qbtn .asked .ans .ans-q .ans-intent .recur-act .recur-list .recur-row .both-value .both-hd` | loading / answered / declined / classified / both / failed |
| 12 | TraceDrawer | `.drawer .drawer-bar .drawer-t .drawer-x .drawer-body .ptype{extracted,calculated,modeled,finding} .node .node-* .proxy .rows .rows-tbl .rows-stat .rows-recon{,.bad} .anno` | present when a value is picked; recon ✓/✗ |
| 13 | TrustPanel — contract | `.tc-grid .tc-col .tc-h{ok,no,eng} .tc-contract .tc-line .tc-yes .tc-no` | static |
| 14 | TrustPanel — audit log | `.tc-audit .tc-row{curation,query,perturbation} .tc-kind .tc-detail .tc-empty` | empty / populated (curation rows carry live-vs-deterministic note) |
| 15 | DebugPanel / curation log | `.dbg .dbg-h .dbg-meta .dbg-rej .dbg-cols .dbg-col .dbg-cap .dbg-pre .dbg-title .dbg-close` | **live** (model proposed) / **fallback** (deterministic fallback) col-1 |
| 16 | Perturb banner | `.perturb-banner .pb-tag .pb-lbl .pb-note .pb-reset` | shown when perturbed |
| 17 | Error boundary | `.err-screen .err-h .err-msg .err-btn` | on throw |
| 18 | Loading | `.loading .brief-load` | transient |
| 19 | Empty / declined / error text | `.brief-empty .tc-empty .ans.declined .ans-decline` | — |

### 1a. Chart/table panel types (each a surface)
waterfall `.wf-*` · combo/line `.cx-*` (`Combo`,`LineChart`) · stacked_area `.area` · hbar `.hbar` · bullet `.bullet-* .bl-*` · matrix `.mx-*` · callout `.callout .co-*` · table `.dtable .dt-*` · scatter `.scat-*` · pareto `.par-*` · heatmap `.hm-*` · indexed `.idx-*` · dumbbell `.dmb-*` · treemap `.tm-*` · grouped (`GroupedBar`) · quadrant `.quad-*` · small_multiples · lorenz · mini dual-trend `.mt-*` · shared primitives `.cx-grid .cx-axis .cx-bench .cx-dot .cx-dlab .ax .dlab`.

**Surface count:** 19 top-level surfaces; **21** chart/table panel types; most have ≥2 states → ~40 surface-states to verify per stage.

---

## 2. Where colour / size / radius / border / spacing values are set

**CSS (`src/index.css`)** — the whole register. Censuses of forbidden items **currently present**:

| item | count | notes |
|---|--:|---|
| `--gold` / `--brass` refs (the two gold jobs + accent) | **53** | forbidden |
| `--navy` refs (chrome band) | **6** | + literals `#152437`,`#3a4a63`,`#5a6b84`,`#aeb9c9`,`#8b98ab` on the rail |
| `border-radius` non-zero | **15** | +`50%` ×2 (dots) → **17** total |
| hex colour literals | **74** (38 distinct) | outside the token block |
| `rgba(...)` literals | **25** | tints/shadows/badges |
| `font-size` declarations | **162** across **29 distinct** values | target ladder = 5 (+t-5) |
| series/`--data` blue refs | **7** | + segment palette (below) |
| `@keyframes` | **2** (`pulse`,`grow`) | only **1** `prefers-reduced-motion` block guards them |
| serif families | `IBM Plex Serif` / `Newsreader` | read thesis/why |

Distinct hex literals: `#152437 #1a8a5a #1b2431 #1f3a5f #1f6cb0 #2C3137 #39424B #3a4a63 #5E6A74 #5a6b84 #6a7583 #8A2A20 #8b98ab #8ba6c4 #9AA1A8 #9aa5b2 #A9B0B8 #EDEFF1 #EEF0F2 #F0F2F4 #F4EFE6 #FAFBFC #FFFFFF #FbF9F4 #aeb9c6 #aeb9c9 #c3ccd6 #c3cdda #c73f34 #d5dae1 #d8a72a #e6f2ec #e8ebef #edeff2 #eef1f4 #f4f6f8 #f6e8e6 #fff`.

**`src/catalog.ts`** — segment series palette: `#8ba6c4`, `#4a7ba8`, `#1f3a5f` (lines 10–12); `grouped_growth` colours `["var(--slate-l)","var(--slate-d)"]` (line 62).

**`src/App.tsx`** — treemap shade ramp `["#1f3a5f","#4a7ba8","#8ba6c4","#b8c8da"]` (line 571); series colour applied inline via `style={{stroke:s.color}}` / `{{fill:s.color}}` / `{{background:se.color}}` (lines 221, 543–545, 631–632); heatmap `style={{opacity:…}}` (526). Layout inline styles (`gridColumn`,`gridRow`,`gridTemplateRows`,`marginLeft`) are structural, **not** register.

**Old token block (`.caliper`, line 3 + later passes):** `--ink --paper --panel --rule --muted --verdant --verdant-bg --ember --ember-bg --ember2 --brass --slate --slate-d --slate-l --navy --data --gold --grid --faint` + layout `--u --field(=1440px) --gap --pad --parch` (24 defined).

---

## 3. Things with NO token to map onto after §2 (report, do not invent)

1. **`--field` NAME COLLISION.** §2 defines `--field:#edeff0` (surface colour). The existing CSS already uses `--field:1440px` as the **content max-width** (`.stage{max-width:var(--field)}`, line 147/149). Applying §2 verbatim would set `max-width:#edeff0` → invalid → full-bleed → a **layout change (forbidden)**. Resolution needed: keep the surface colour as `--field` and rename the width var (e.g. `--measure:1440px`), preserving the width. Flagging, not inventing.
2. **Layout dimensions have no token in §2.** The token set covers register (colour, type ladder, *inner* spacing `--in-*`/`--out`, weights) but **not** structural layout: `--field(1440px) --gap(16px) --pad(32px) --u(8px)`, grid `repeat(12,…)`, chart cell heights (`248px`,`232px`,`64px`), `min-width`/`min-height`, media breakpoints (`900/1100/780/640px`). §2 forbids "spacing literals outside the token set" but §7 forbids layout changes. **Interpretation to confirm:** §2's forbiddance targets *register* spacing (component padding/gaps that should snap to `--in-*`/`--out`); structural layout dimensions are out of scope and preserved as-is. Otherwise every layout dimension is an un-mappable literal.
3. **`--mk` is used in §3 but not defined in §2.** §3 point-markers say `--mk 6px`; the §2 block has no `--mk`. Needs `--mk:6px` added or a 6px literal — flagging per "don't invent."
4. **`--t-5:26px`** — brief says define only if a surface uses it (serif verdict in the read). This base's read surface has **no distinct serif verdict** (`.brief-thesis` is serif at 20px = `--t-4`; there is no 26px verdict element). → **do not define `--t-5`** unless a verdict element is added. Confirming the conditional resolves to "omit."
5. **Font families are unspecified by §2/§3.** Current: IBM Plex Sans (body), IBM Plex Mono (labels/axis/values), IBM Plex Serif + Newsreader (read prose). The register keeps mono + serif + sans, re-sized only. No token maps family; families preserved as-is. `Newsreader` appears only as a fallback (overridden to IBM Plex Serif line 599) — dead-ish, report.
6. **Type-ladder snap has layout side-effects.** 29 distinct sizes must collapse to {10,11,14,20,40}. Some snaps grow text (axis 8→10, ticks 7.5–9.5→10; value 21/22→20; hero 42/36→40). In fixed-height chart cells and the no-scroll viewport this can overflow — a **register change with a layout consequence** to verify at Stage 2, not a licence to move anything.

---

## 3a. Ambiguous values — `--gap` / `--pad` / `--u` consumer census (finding, not classified mid-sweep)

Per instruction: these read as *both* register spacing and structural dimension; every consumer is listed with what it drives. Not folded into `--in-*`/`--out` — **preserved as-is** in Stage 1 pending an explicit classification decision.

**`--u` (8px, line 170)** — **0 consumers anywhere in `src/`.** Defined, never referenced. Vestigial: neither register nor structure until something consumes it. Finding: dead token.

**`--gap` (24px line 170, overridden 16px line 208)** — all consumers are grid/flex gutters:
| consumer | drives | reads as |
|---|---|---|
| `.grid12 { gap:var(--gap) }` (181) | gutter of the 12-col board grid | **structural** (sets inter-panel cell spacing / where panels sit) — overlaps register "space between" |
| `.split-minor { gap:var(--gap) }` (186) | gap between stacked callouts in a minor column | structural gutter — overlaps register |
| `.bridges { gap:var(--gap) }` (194) | gutter of the 2-col bridges grid | structural gutter — overlaps register |

All three are layout *gutters*. They set the grid's inter-cell spacing (structure) yet are literally "space between elements" (register). Ambiguous → listed, not decided.

**`--pad` (32px, line 170)** — consumers:
| consumer | drives | reads as |
|---|---|---|
| `.stage { padding:0 var(--pad) … }` (172, 292, 326) | horizontal framing of the whole content field | **structural** (frames the field; comment at line 148 calls framing margins "structural") |
| `.hdr { padding:10px var(--pad) }` (324) | rail padding | **mixed** — vertical is register (space around rail content); horizontal aligns the rail to the field edge → structural alignment |
| `.honesty { padding-left/right:var(--pad) }` (173) | honesty-bar padding | register — **but `.honesty` is `display:none` (369)**, so dead |

`--pad` is consumed by both a structural framer (`.stage`) and a register/alignment context (`.hdr`), plus one dead rule. Ambiguous → listed, not decided.

**Stage-1 handling:** `--gap`, `--pad`, `--u` and their `var()` uses are **left unchanged** (structural/ambiguous → preserve; consistent with §7). They are *not* converted to `--in-*`/`--out`. Classification is deferred to an explicit decision, not made mid-sweep.

## 3b. §7 SANCTIONED STRUCTURAL CHANGE (KPI scorecard)

The one structural change the reskin was entitled to make (type↔layout coupling, decided explicitly): the KPI scorecard grid changed from **six equal columns** (`repeat(6, minmax(0,1fr))`) to **content-driven** (`repeat(6, auto)` + `justify-content:space-between`). The longest role label ("Enterprise ARR Share") takes what it needs, the shortest returns it; the row still fills the width; **no panel moves position** — only the internal division changes. Verified by computed style: **0 true text clips on CFO and CRO, row fits** (`scrollWidth ≤ clientWidth`). This is the sole structural edit in the reskin; everything else is register-only.

## 4. §7 coupling assessment (preliminary)
No surface found that **cannot** be reskinned without moving an element — the change is register-only (colour/type/border/radius/background). The single structural risk is item 3.6 (type-snap overflow in fixed cells), to be confirmed by computed-style + live load at Stages 2–3. If any cell clips after the type snap, that is a coupling finding to report (§7), not restructure.
