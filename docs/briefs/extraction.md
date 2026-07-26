# Glass Box — Curation Extraction Brief

**For:** Claude Code, working in `glass-box/`
**Type:** behaviour-preserving refactor. **Zero functional change, zero design change.**

---

## 0. Purpose

The entire curation orchestration lives inside `src/App.tsx` and is module-internal — the file
exports only `default App`. Consequences:

- the curation path has **no test coverage**, because nothing can import it
- `deriveShape` / `selectPartition` compute layout from model output and are unauditable from
  outside the view module
- the inventory measurement is blocked entirely

This turn moves that code out. Nothing about what the product does or how it looks changes.

---

## 1. Base and gate

State at the top of your report:

- the base commit SHA and branch you are working from
- which validator scripts exist on that base

The gate is every validator present on the base. On the shipped base that is:

```
tsx scripts/validate.ts            # 113/113 panel · 14/14 findings
tsx scripts/validate-discovery.ts  # 10/10 thesis assertions
```

**Green before you start, green at every commit.** If a validator is red on the base before you
touch anything, stop and report — do not refactor on top of a failing gate.

---

## 2. Capture the golden fixture FIRST

Before moving any code, capture the current behaviour so the refactor can be proved
behaviour-preserving. The fallback path is deterministic and needs no model key.

For the base dataset **and** the one perturbation state, for **both roles** (CFO, CRO), record:

- the full engine candidate set (findings, ids, salience)
- `fallbackCuration` output — selection, order, every field
- the derived shape: partition id, region assignments, region aspects
- the built catalog

Write to `analysis/golden/pre-extraction.json`.

After the refactor, regenerate the same fixture through the new module boundary and assert
**byte-identical** output. Any difference is a behaviour change and must be reported, not
reconciled.

---

## 3. What moves

Everything below currently lives in `src/App.tsx`:

`curate` · `buildCurationPrompt` · `callModel` · `fallbackCuration` · `FALLBACK` ·
`buildCatalog` · `CHART_MENU` · `PARTITIONS` · `deriveShape` · `selectPartition` ·
`fillPartition` · `PERTURBATIONS` · `perturbedDataset`

Proposed split — four modules, because these four things test differently:

| module | holds | character |
|---|---|---|
| `src/catalog.ts` | `CHART_MENU`, `buildCatalog` | data + pure function |
| `src/layout.ts` | `PARTITIONS`, `deriveShape`, `selectPartition`, `fillPartition` | pure functions — the highest-value coverage gain |
| `src/curate.ts` | `curate`, `buildCurationPrompt`, `callModel`, `fallbackCuration`, `FALLBACK` | has the one I/O boundary |
| `src/perturbations.ts` | `PERTURBATIONS`, `perturbedDataset` | pure data transform |

If the dependency graph makes a different split cleaner, **report the reason and your proposed
split before implementing it.**

`App.tsx` keeps rendering and state only. It imports from these modules.

---

## 4. The one non-mechanical change: inject the model call

`callModel` reaches the Netlify function, which a Node harness cannot do. Make it an injected
dependency:

```ts
curate(input, { callModel = shippedCallModel } = {})
```

The default must be byte-identical to today's implementation, so the app's behaviour is
unchanged. A harness can then inject a direct API call or a recorded fixture.

This is the only signature change permitted in this turn. Do not take the opportunity to
refactor anything else.

---

## 5. Circular dependencies

`App.tsx` will import these modules; none of them may import `App.tsx`. If shared types or
helpers are currently colocated in `App.tsx`, move them to a module both sides can import.

**If you find a cycle, report it — do not resolve it with a barrel file, a type-only import, or
a dynamic import.** A cycle is a finding about the current structure.

---

## 6. Prove the modules are reachable

Add `scripts/validate-curation.ts` with a small set of assertions — enough to prove the
extraction worked, not a full suite:

- `deriveShape` over three synthetic weight distributions (concentrated, diffuse, single-item):
  returns a valid partition, every selected item is assigned a region, no region is double-filled
- `selectPartition` is deterministic for identical input
- `buildCatalog` returns only forms whose domain is in the finding's related domains
- `fallbackCuration` output matches the golden fixture
- `perturbedDataset` is a pure transform — the base dataset is not mutated

Report as `N/N`. Wire it alongside the existing validators.

---

## 7. Out of scope

No design change. No CSS. No prompt change. No new eligibility logic. No trimming of
`CHART_MENU` or `PARTITIONS`. No fix to anything the refactor reveals — **report it instead.**

---

## 8. Report

- base SHA, branch, validators present
- the split you implemented, and any deviation from §3 with its reason
- golden fixture: byte-identical, or the exact diff
- `validate-curation.ts` result
- all base validators green
- any cycle found
- anything the extraction revealed that you were told not to fix
- net line delta (expected near zero — this is a move, not a rewrite)
