# Glass Box — Surface Rebuild Brief

**For:** Claude Code, working in `glass-box/`
**Reference mock:** `docs/design/glass-box-ei-mock.html` — open it in a browser before writing code.
**Type:** surface-only rebuild. No engine changes.

---

## 0. Guardrails — read first

**Do not modify:**
- `src/engine-core.ts`
- `src/contract.ts`
- `src/curation.ts`
- `netlify/functions/curate.ts`
- anything in `scripts/`

**Both validators must be green before every commit:**
```
tsx scripts/validate.ts            # oracle: 113/113 panel, 14/14 findings
tsx scripts/validate-discovery.ts  # 10/10 thesis assertions
```
`tsx` is at `/home/claude/.npm-global/bin/tsx`.

**No new dependencies** except two Google webfonts.

If a visual change appears to require touching engine output, **stop and report it.** Do not
change the engine to suit the surface. The engine owns all substance; that invariant is the
entire product.

---

## 1. Governing conviction

> **The page discloses its own authorship. Every mark declares whether the engine computed it,
> the model chose it, or the validator admitted it.**

Every decision below derives from that sentence. When a judgment call comes up that this brief
does not cover, resolve it against that sentence, not against what looks good.

---

## 2. Why this rebuild exists

Glass Box was audited against the Esoteric Industrialism invariants and the failure has a shape:

> It passes every invariant that requires **adding** something — assign typefaces to roles, track
> the labels, anchor the aggregates, build the provenance model. It fails every invariant that
> requires **withholding** something — withhold the accent, refuse the softened edge, withhold
> motion unless it signifies, derive the grid instead of picking numbers that look fine.

That is what "looks AI-generated" means as a visual signal: the union of every locally defensible
choice, with nothing refused. **The work in this rebuild is mostly deletion.** If a stage of this
brief produces a net increase in CSS, something has gone wrong.

---

## 3. Tokens — copy exactly, derive nothing

> **Register (amended 3d): institutional finance.** The ground is a cool neutral, not paper.

```css
:root{
  /* field */
  --field:         #e4e7e9;   /* cool neutral ground, not paper — engine territory */
  --plane:         #f3f4f6;   /* the ONE advanced plane — interpretive territory */
  --ink:           #14171a;
  --ink-mute:      #666d73;
  --scribe:        rgba(20,23,26,.13);
  --scribe-strong: rgba(20,23,26,.26);

  /* SACRED — one accent in the entire product */
  --dye:           #1f539f;   /* machinist's layout dye = traceable to raw rows (unchanged) */

  /* sacred geometry, inherited from Strata */
  --h: 56px;    /* spiritual  */
  --S: 192px;   /* industrial */
  --u: 8px;     /* atomic     */
}
```

Faces:
| role | face | sizes |
|---|---|---|
| interpretive / narrative | **Source Serif 4** 300/400, italic 400 | 15.5–34px |
| machine / data / numerals | **IBM Plex Mono** 400/500/600 | 9–13px |
| structural / labels | **IBM Plex Sans** 500 | 9.5–10px, `.12–.14em`, uppercase |

Source Serif 4 carries the interpretive register (amended 3d — was Spectral). The two Plex voices are inherited. The tri-voice
role mapping is the invariant; the specific faces are the instantiation.

---

## 4. Forbidden — delete on sight

| # | Delete | Why |
|---|---|---|
| F1 | Every chart series colour. Series are `--ink`. | Colour must earn a job; a single series doesn't need one |
| F2 | Gold `#d8a72a` everywhere, including TARGET labels and danger-zone tints | Threshold is not a sacred job |
| F3 | Green/red status colour on values | The sign already carries direction; colour is a second signal saying the same thing |
| F4 | `border-radius` — all of it, no exceptions | Rectangles are truth |
| F5 | Bordered card containers around panels | Twelve identical borders encode nothing |
| F6 | Icon glyphs inside buttons (`◈ ↻ ⌕ ···`) | Text labels are preferred |
| F7 | Bracketed action labels `[ READ ]` | Strata's dialect; does not port to a light register |
| F8 | Any second signal that repeats a first | Border + fill, coloured arrow beside a signed number, etc. |
| F9 | Redundant chart marks — nodes on every point, gridlines on both axes, legends for one series | Every line load-bearing |
| F10 | Counting/rolling number animations, fades on data | A number is a fact; it does not arrive gradually |

**Grep gates:** after Stage 1 there should be zero matches for `border-radius`, `#d8a72a`,
`#1f6cb0`, `#1a8a5a`, `#c73f34`, `#152437`, `#e8ebef` anywhere in `src/`.

---

## 5. Required

| # | Rule |
|---|---|
| R1 | **One accent.** `--dye` appears only on values traceable to raw rows, and on the 2px rule of the provenance peek. Nowhere else. |
| R2 | **One advanced plane.** Only the curated-read chamber uses `--plane`. Lightness means *a model wrote this prose*. Everything else sits on `--field`. |
| R3 | **One filled action.** The falsifier — the test that could weaken the read. Every other action is tracked caps with a 2px underline for state. |
| R4 | **Zero radius**, everywhere. |
| R5 | **Geometry from the constants.** Rail `1h`. Pedestal `1h` compact / `1S` full. Charts `4h` = 224px. Spacing in multiples of `--u`. |
| R6 | **Motion: one detent, one referent.** The validator arriving animates once — `cubic-bezier(.16,1,.3,1)`, ~620ms, honouring `prefers-reduced-motion`. Nothing else in the product moves. |
| R7 | **Labels** are IBM Plex Sans 10px, `.14em`, uppercase, `--ink-mute`. Never `--ink`, never full contrast. |
| R8 | **Provenance peek** uses the two-line format: line 1 the answer or formula, line 2 the sources with tier. Same shape for all four tiers. |
| R9 | **Summation rule** — 1px `--scribe-strong` above any total or verdict row. |
| R10 | **Status indicators** are 8px squares. Never circles. |
| R11 | **Charts:** max data point ≤ 85% of plot height. Horizontal graduations only. Reference lines are `--scribe-strong` dashed `1 3`, labelled in mono, never coloured. One terminal marker (square) with a mono value label. |

---

## 6. Composition

Front door is the **Board** (amended — the earlier "front door is the Read" was withdrawn).
The Board is the one view; the Read is a modal feature opened over it.

```
┌─────────────────────────────────────────────────────────┐
│ RAIL  1h — wordmark · engine status · role · actions     │
├─────────────────────────────────────────────────────────┤
│ GRADUATION 11px — vernier scale, majors 56px, minors 8px │
├─────────────────────────────────────────────────────────┤
│ BOARD CANVAS — the composed board (deriveShape +         │
│   partition machinery + role-divergence-by-composition). │
│   RELEASE: ≥13h a fixed canvas, monolith scrolls          │
│   internally, overflow declared by a graduated field      │
│   edge (no native scrollbar); <13h release to document    │
│   scroll — never clip.                                    │
│   ── summation rule ──  REJECTION BAND (board-level:      │
│   a validator verdict about the composition)              │
├─────────────────────────────────────────────────────────┤
│ PEDESTAL 1h fixed — aggregates · provenance invitation   │
└─────────────────────────────────────────────────────────┘

READ surface (modal, opened from the rail):
  engine VERDICT (computed, off-plane)
  model NARRATIVE on --plane   ← --plane lifts model-authored content wherever it
  CITATION INDEX                  renders; it is not tied to a chamber region
  FALSIFIER + filled action
```

The CFO/CRO toggle stays in the rail. Role divergence shows in the board composition
(deriveShape) and, when the read is open, in the narrative. There is no Read↔Board view
toggle: one view, plus a read feature over it.

**--plane** keeps its meaning — it lifts model-authored content (the read's narrative) — and
applies wherever that content renders, not to a fixed chamber region. The **pedestal** is the
single home for session state.

**Silo** (historical): the read-view's right column was first a curation log, then a citation
index. With the board-first reversal the read is a modal and the silo-as-region is retired; the
citation index lives inline within the read.

**Overlay vs compression (amended).** Overlay is permitted only when the covering surface is a
*different work surface or mental model* not directly connected to what it covers; compression
is required when the detail is *about something on screen*. The read may be a modal (a distinct
mental model over the board). But provenance opened from inside the read **compresses within the
read** — it does not stack a second overlay.

**Motion (R6, amended):** exactly **one** semantic motion event — the validator arriving. The
Read↔Board threshold detent from the two-view design no longer exists; do not wire it.

---

## 7. Sequence — each stage independently verifiable

**Stage 1 — `index.css` only.** Replace the token block. Purge every hex not in the token set.
Purge all `border-radius`. Swap the three faces. Both validators green.
*Expected result: the app looks broken but internally consistent. That is correct. Do not
"fix" layout in this stage.*

**Stage 2 — chrome.** Rail, graduation, pedestal, action styling. Delete icon glyphs and
bracket labels.

**Stage 3 — composition.** Read becomes the default view. 75/25 chamber/silo. Remove card
containers; replace grouping with scribe rules and whitespace.

**Stage 4 — charts.** Rebuild against R11. This is the largest deletion: series colours,
gold targets, redundant nodes, legends, danger tints.

**Stage 5 — promote the thesis.** Rejection, falsifier, and provenance peek become
first-class typographic elements. The rejection currently renders as a status string in the
chrome; it should be a labelled block with a summation rule above it.

Commit at each stage. Report validator output each time.

---

## 8. Build the enforcement — `scripts/validate-surface.ts`

**This is the part that matters most.** Glass Box drifted because the design philosophy was a
behavioural safeguard — intent, memory, care — with nothing structural to enforce it. Every
other platform has a primitives library that makes violations unrepresentable. Glass Box does
not. A rebuild without a lint reproduces the original failure.

Write a validator, in the same style as the existing two, asserting over `src/`:

1. No `border-radius` with a non-zero value.
2. No hex or `rgb()` colour literal outside the `:root` token block.
3. `--dye` is referenced only by the traceable-value and provenance-peek rules.
4. Exactly one rule sets a filled dark background on an interactive element.
5. `--plane` is used by exactly one region.
6. Every `@keyframes` has a matching `prefers-reduced-motion` guard.
7. No `transition` or `animation` on any element carrying a numeric value.

Wire it into the same command surface as the other validators. Report as `N/7`.

---

## 9. Acceptance

Before declaring done, run the Six-Question Test against every element you touched:
necessary · precise · honest · silent · systematic · serves the whole. Any *no* means the
element is removed or redesigned.

Then report:
- `validate.ts` — expect 113/113 and 14/14
- `validate-discovery.ts` — expect 10/10
- `validate-surface.ts` — expect 7/7
- net line delta in `src/` (should be negative)
- anything in this brief you could not satisfy, and why
