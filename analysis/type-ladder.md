# Stage 1 — Type-ladder snap: direction census + overflow findings

Every `font-size` in `src/index.css` snapped to the 5-step ladder (`--t-1`10 · `--t-2`11 · `--t-3`14 · `--t-4`20 · `--t-6`40). No intermediate sizes invented; no cell adjusted. Computed-style confirmed: only ladder sizes render on text (the 16px/13.33px computed values are layout **containers with no direct text** — `.hdr`, `.stage`, `.partition`, `.kcell` button — not authored, not text-bearing).

**159 sites · LARGER 100 · SMALLER 26 · EQUAL 33.**

Direction matters differently (per instruction): **larger** risks clipping in the no-scroll cells and needs a decision where it clips; **smaller** frees space and needs none — but the fact that **100 of 126 non-equal sites go larger** is itself a finding: **the fixed cells were tuned to a denser type scale than the ladder** (mostly 8–13px), so the ladder is systematically bigger than what the layout was built for. The confirmed clip below is the symptom.

## FONT-LOADING FIX (measurements were invalid until this)

The preview tool (and any CSP that blocks external font files) did **not** load the Google-Fonts `@import`: `document.fonts.check('14px "IBM Plex Mono"')` returned **false**, all Plex Mono/Serif faces `unloaded`. Every width measurement fell back to the system monospace (wider than Plex Mono), so the first overflow census was unreliable. **Fix:** self-hosted the fonts via `@fontsource` (latin subset, only the weights used), imported in `main.tsx`; removed the external `@import`. After the fix, `check('600 12px "IBM Plex Mono"')` = true, Serif/Sans true. All measurements below were taken with fonts loaded and forced-reflowed.

## Overflow / near-miss in no-scroll cells (browser, computed style, fonts loaded — report, do not resolve)

Checked so far: **CFO fallback board**, 1440×900, `--t-tab` applied. **No hard clips.** The earlier "metric_matrix 28px horizontal clip" was a **FALSE POSITIVE from fallback-font metrics** — with Plex Mono loaded and `--t-tab`(12px) on tabular cells, the matrix width fits **exactly** (content 412px / cell 412px). Corrected:

| site | result | note |
|---|---|---|
| `.matrix` width | 412/412 (exact) | horizontal clip **resolved** by real font + `--t-tab` |
| `.matrix` height | 224/159 (1.41×) | vertical → internal `overflow-y:auto` scroll (pre-existing behaviour; the type snap enlarged the scroll extent) — not a hard clip |

**Near-misses — content ≥95% of its box (no-margin; clips on the next dataset or viewport):** concentrated in the two fixed-density grids tuned to the old 9–10px scale:

- **KPI scorecard `.kcell`** (218px cells): labels `.kcell-l` "CAC Payback" **100.6%**, "Rule of 40 proxy" 100.2%, "SaaS Magic Number" 99.9%, "Gross Margin" 99.7%; values `.kcell-v` "$2.50M"/"105.7%" 99.4%, several at 100%; deltas `.kcell-b` 99.0–99.2%. Driver: `.kcell-l` 9→11, `.kcell-b` 10→11 — the scorecard was tuned for 9–10px labels; at 11 they have no margin.
- **metric_matrix `.mx-cell`** value cells ("$1.3M"…) sit at exactly **100%** of their 36px columns (12px `--t-tab`) — a one-char-longer value (e.g. "$10.5M") overflows.
- **chart titles `.chart-title`** long strings at ~100% of the header (inherent to long titles; borderline).

This is the type↔fixed-layout coupling — **reported, not resolved** (no intermediate size, no cell change). The KPI scorecard is the tightest and the most likely to clip on live model output or a wider dataset.

**Remaining verification:** CRO board, perturbed state, **live** board (needs the model function; plain `vite` runs fallback only), and the read / query / trace / trust / debug modals.

**Also observed (Stage 3 / §4, not type):** `.kcell-b` deltas still use ▲/▼ arrow glyphs (should be parenthesised), and "Rule of 40 proxy" shows the PROXY tag inline (should be a superscript footnote). Noted for Stage 3.

## LARGER (100) — each a clipping candidate; only `.matrix` confirmed to clip so far
Biggest jumps first (px):
- `.fside-v` salient hero 25→40 (+15), 29→40 (+11), 36→40 (+4), 38→40 (+2), 42→40 is *smaller*
- headings: `.hdr-mark` 15→20, `.ans-q` 15→20, `.qmodal-t` 15→20, `.frame-h` 16→20/19→20, `.err-h` 16→20, `.sec-t` 18→20
- matrix/table body: `.mx-cell` 10/11→14, `.mx-lab` 10.5/11.5→14, `.dt-num` 11.5/12.5→14, `.dt-seg` 12/13→14, `.dt-head` 10→11, `.mx-head` 9→11
- chart micro 8–9.5→10: `.wf-axis` `.wf-xlab` `.wf-xval` `.dlab` `.mg-lab` `.mg-cap` `.bl-tlab` `.bl-rowlab` `.mt-bench-lab` `.mt-qlab` `.ax-lab` `.scat-lab` `.hm-txt` `.idx-lab` `.tm-val` `.quad-zone`7.5→10 `.cx-ytick/xtick` `.cx-bench-lab` `.cx-axlab` `.ev-trace` `.brief-viol`
- caps labels 9–10.5→11: `.frame-tick` `.chart-trace` `.kcell-l` `.ptype`8.5→11 `.brief-tag/status/lbl/src` `.recur-lbl` `.pb-tag` `.both-lbl` `.tc-h/yes/no/kind` `.asked-h` `.dbg-cap/meta` `.sf-badge/ctx` `.test-run` `.proxy`9→11 `.hdr-sub` `.fband-inspect` `.ans-intent` `.rows-recon`
- body 12–13.5→14: `.sec-s` `.node-desc/label/val` `.role-f` `.rows-stat/tbl` `.bridge-h/trace` `.frame-sw` `.co-l` `.ev-note` `.tc-col/line/row/empty` `.pb-note/lbl` `.recur-act/flabel` `.err-msg` `.test-q` `.brief-why/foot` `.ans-decline` `.hdr-status`11.5→14

## SMALLER (26) — frees space, no decision
`.co-v` 30→20, `.sf-val` 30→20, `.role-k` 26→20, `.loading` 24→20, `.kcell-v` 22/21→20, `.entry-mark` 22→20, `.fside-v` 42→40, `.cx-dlab` 13→10, `.drawer-t` 13.5→11, `.fside-l` 13→11, `.recur` 13→11, `.chart-title` 12.5/12→11, `.readout` 15→14, `.entry-sub` 15→14, `.qmodal-x/brief-x` 15→14, `.inspect` 12→11, `.qbtn` 12→11, `.sf-lbl` 12→11, `.recur-rank` 12→11, `.bl-val` 11→10, `.tm-lab` 11→10, `.honesty` 11.5→11 (dead, display:none), `.qmodal-note` 11.5→11.

## EQUAL (33) — already on ladder
`.hdr-r` `.sec-n` `.anno` `.chip` `.lensbtn` `.drawer-t/x`(11) `.dbg-h/rej/pre/tog` `.qin` `.chart-tag` `.fband-verb` `.mt-end` `.kcell-b` `.node-op` `.ev-val` `.brief-thesis`(20) `.brief-load` `.ev-lbl` `.test-verdict` `.pb-reset` `.hdr-menu` `.err-btn` `.hdr`(lensbtn) etc.

## CRO scorecard + register fixes (browser, fonts loaded)

**CRO scorecard clips outright** (before fixes): `.kcell-l` "CAC Payback" 100.6%, `.kcell-v` "6.6%" 100.9%; "Enterprise ARR Share" 100.2%, "Blended NRR" 100.5%, "QoQ ARR Growth" 100.2% (all at/over the edge, zero margin). The 218px scorecard cell can't hold the longest role labels at 11px.

**Two register fixes applied (role rules, not per-site, ladder untouched):**
1. **Tracked-caps label tracking .16em → .10em** — one rule over all 20 `text-transform:uppercase` label classes. Finding: on this base the labels were **never at .16em** (`.kcell-l` was ~1px ≈ .09em), so this freed ~nothing on the scorecard; it unifies the label voice but is neutral for fit.
2. **Tabular horizontal padding → --in-1** — one rule over `.mx-cell,.mx-lab,.dt-num,.dt-seg,.rows-tbl td`. First applied symmetric (`--in-1` both sides) which *widened* the matrix (its numeric cells had `padding-left:0`) → corrected to `padding-left:0; padding-right:var(--in-1)` (reduce the column gap, keep the hug). Matrix width then fits exactly (412/412).

**Re-measured, both grids — STILL ≥95% (the genuine type↔layout coupling, a decision not a fix):**
- **KPI scorecard**: after .10em, still "6.6%" 100.9% (CLIP), "Enterprise ARR Share" 100.2%, "Net New ARR" 100.2%, and a cluster of labels/values at 99–100%. The scorecard's fixed 218px 6-up cell is the binding constraint; 11px labels + the longest role names have no margin.
- **metric_matrix**: width fits (412/412) but each value cell sits at **exactly 100%** of its 1fr column ("$1.3M"…) — a one-char-longer value ("$10.5M") overflows. The fixed 412px cell with 8 equal value columns at 12px tabular has zero slack.

**Conclusion:** neither fix resolves the saturation — both grids remain at the edge because their **fixed cell widths (218px scorecard, 412px matrix — structural dims)** were tuned to the pre-reskin denser type scale. This is the type↔layout coupling; per the brief it is the one place a structural change is warranted, **as a decision**: widen those cells, shorten the labels, or accept clipping on the longest strings. Reported, not resolved.

## Resolution (decisions applied)

- **KPI scorecard → content-driven columns** (§7 sanctioned structural change; recorded in surfaces.md §3b). Re-measured CFO + CRO: **0 true text clips, row fits**. The scorecard saturation is resolved.
- **metric_matrix → NO CHANGE (recorded DATA RISK, not a present defect).** Value cells sit at ~100% of their 1fr column; the 8 value columns already redistribute (`1fr`), so today's data renders without clipping. The risk is **live/future data**: a value one character longer than the widest present ("$10.5M" vs "$2.5M", or a negative in parens) would exceed its column and clip inside the fixed 412px cell. Not fixed by design decision — logged here as a data risk to watch.
