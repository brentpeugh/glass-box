/**
 * Caliper trust-architecture artifact — THE HONESTY CONTRACT
 * =========================================================
 * The types the shipped build actually runs. `engine-core.ts` produces the substance
 * objects (MetricValue, Finding, Provenance); `curation.ts` validates the model's output
 * against the engine's neighborhood; `App.tsx` renders from engine-owned catalog data.
 *
 * This file is the honesty document, so it states the claims PRECISELY — including where a
 * guarantee is structural and where it is layered defense. Overclaiming here would itself be
 * a thesis violation (the medium is the message), so the line is drawn exactly where the code
 * draws it.
 *
 * WHAT IS STRUCTURAL (no channel exists for the model to violate these)
 * --------------------------------------------------------------------
 * S1. Every rendered NUMBER is a MetricValue computed engine-side from raw rows. The model
 *     emits JSON of ids + prose only; there is no field on any model-produced object into
 *     which a value flows to the screen. (Verified: buildCatalog/resolveKpi/resolveQuery are
 *     the only sources of rendered figures.)
 * S2. Every number REFERENCES its inputs by id down to raw-row leaves; provenance is emitted
 *     at compute time and the trace RE-RESOLVES leaves live (RowSelector re-filters the rows
 *     and recomputes the sum), never reconstructs or decorates.
 * S3. All chart SCALES, axes, and baselines are computed by the renderer from engine data via
 *     niceScale. The model selects a widget id from a catalog whose data and scales are
 *     engine-produced; it has no channel that touches an axis. (There is no ChartSpec; the
 *     model cannot emit one.)
 * S4. LAYOUT is a deterministic rule-based packer over a shape derived from the composition's
 *     weight distribution. The model's one hint (partitionPref ∈ three values) only reinforces
 *     the derived shape; no coordinate ever crosses the boundary.
 * S5. COMPARISONS/verdicts (clears vs breaches, delta) live in MetricValue.basis, computed
 *     engine-side. The model never authors a benchmark verdict.
 *
 * WHAT IS LAYERED DEFENSE (not a single structural wall — the engine's verdict wins on detection)
 * ----------------------------------------------------------------------------------------------
 * L1. Prose VALENCE honesty is three layers, not a wall: (a) the narrate prompt is given only
 *     qualitative grounding (label, clears/breaches, rising/falling) and forbidden from success
 *     language on a breach; (b) guardDirection rejects framing whose direction contradicts the
 *     engine's verdict; (c) on rejection the headline is replaced by engineHeadline() — the
 *     engine's own verdict. A flat contradiction ("exceeds" on a breach) is caught; a purely
 *     euphemistic gloss with no directional claim can pass. The engine verdict is always shown
 *     alongside, so prose cannot invert what the number says — but "mechanically impossible" is
 *     reserved for S1–S5; prose valence is defense-in-depth.
 * L2. Digit leakage: guardFraming rejects any model string containing a digit (reject-and-
 *     fallback, not strip). Word-form numerals ("twenty-one") are prompt-forbidden and the model
 *     is never given figures to verbalize, so a word-number would have to be INVENTED to leak —
 *     blocked for every form that could be correct, layered for the invented-word edge.
 *
 * WHAT THE ENGINE DECIDES, NOT THE MODEL
 * --------------------------------------
 * - WHAT IS TRUE: MetricValue (deterministic or honestly "proxy"); honesty artifact is provenance.
 * - WHAT IS ANOMALOUS: computeSalience ranks facts by neutral effect size — role-agnostic.
 * - WHAT IS ADMISSIBLE: validateCurationCore drops fabricated/off-neighborhood ids and rejects a
 *   curation with no falsifier (advocacy is structurally inadmissible) or an authored numeral.
 * The model decides only WHAT MATTERS (which in-neighborhood evidence/widgets to foreground for
 * the role) and phrases the read — within the validator's bounds.
 */

// ============================================================================
// 0. SHARED PRIMITIVES
// ============================================================================
export type Grain = "company" | "segment" | "account";
export type Unit = "usd" | "percent" | "ratio" | "months" | "count" | "number" | "pp";

export interface Scope {
  grain: Grain;
  segment?: string;            // present when grain === "segment"
  quarter?: string;            // point-in-time, e.g. "25Q4"
  window?: [string, string];   // cohort/trend window, e.g. ["24Q4", "25Q4"]
}

// ============================================================================
// 1. PROVENANCE  (S2)
// ============================================================================
/** A reference held by provenance: either another computed value (drill down)
 *  or a leaf row set that resolves against the raw tables. */
export type ProvRef =
  | { kind: "metric"; id: string }
  | {
      kind: "rows";
      table: "customers" | "opportunities" | "opex";
      predicate: string;       // human-readable filter, e.g. "segment=SMB AND arr_25q4>0"
      count: number;           // how many rows matched
      idsSample?: string[];    // a few ids for the trace UI; full set resolved on demand
      selector?: RowSelector;  // structured, serializable filter so the trace resolves leaves
                               // to rows WITHOUT parsing prose. In the browser it filters the
                               // loaded rows; in production it re-queries the warehouse.
    };

/** Machine-resolvable row filter. Kept deliberately small; extend per fact as needed. */
export interface RowSelector {
  kind?: "col_sum" | "retention" | "delta" | "opex" | "opps";
  table?: "customers" | "opportunities" | "opex";
  seg?: string | null;         // segment filter (null/undefined = all)
  activeAt?: string;           // quarter at which the row must be non-zero (cohort gate)
  col?: string;                // the column being summed/measured, e.g. "arr_25Q4"
  quarter?: string;            // point-in-time filter (opex/opportunities)
  startQ?: string;             // retention cohort start quarter
  endQ?: string;               // retention cohort end quarter
  from?: string;               // delta: prior quarter
  to?: string;                 // delta: current quarter
  field?: string;              // opex field being summed
  q?: string;                  // opps close quarter
}

export interface Provenance {
  op: string;                  // machine id: "sum" | "ratio" | "cohort_retention" | "hhi" | ...
  description: string;         // human: "Sum of ARR across 412 SMB accounts active in 25Q4"
  inputs: ProvRef[];           // recurses through MetricValues down to RowSet leaves
  configRefs?: string[];       // defined constants used: "benchmark.magic_number"
}

// ============================================================================
// 2. METRIC VALUE — engine-produced, self-interpreting number  (S1, S5)
// ============================================================================
export interface MetricValue {
  id: string;
  metric: string;              // "magic_number" | "nrr" | "arr" | "ent_share" | ...
  label: string;               // "SaaS Magic Number"
  scope: Scope;
  value: number;
  unit: Unit;
  format: string;              // renderer format string
  goodWhen: "higher" | "lower" | "neutral";   // metric POLARITY (config) — NOT role valence
  basis?: {                    // computed comparison context, itself sourced (S5)
    kind: "benchmark" | "prior_period" | "peer_median";
    ref: string | { metricId: string };
    thr?: number;              // threshold compared against (config)
    good?: "above" | "below";  // which side is favorable (config)
    delta?: number;            // value - reference (engine-computed)
  };
  epistemic: "deterministic" | "proxy";        // "proxy" => e.g. Rule of 40; carries note
  note?: string;               // disclosure when epistemic === "proxy"
  provenance: Provenance;      // HOW this number was computed
  curve?: { acc: number; arr: number }[];      // distribution curves (Lorenz) carry their points
}

// ============================================================================
// 3. FINDING — engine-produced notable pattern  (S1, and the salience ranking)
// ============================================================================
export type FindingType =
  | "benchmark_breach"
  | "trend"
  | "cross_segment_divergence"
  | "concentration"
  | "masking"
  | "acceleration";

export interface Finding {
  id: string;
  type: FindingType;
  metric: string;
  scope: Scope;
  summary: string;             // engine-authored, factual (engine layer — carries numbers by design)
  values: string[];            // MetricValue ids composing it — NO copied numbers
  salience: number;            // 0..1 role-AGNOSTIC notability (effect size / breach mag / gap)
  polarity: "good" | "bad" | "neutral";        // metric-polarity direction — NOT role framing
  evidence: Record<string, number>;            // why it fired: { t: -6.3, effect: -0.56 }
  provenance: Provenance;      // WHY it was judged notable (distinct from value provenance)
}

// ============================================================================
// 4. THE CURATION CONTRACT — the model's ONLY output channel
//    The model returns ids + prose. The validator (validateCurationCore) filters every id
//    against the engine's finding neighborhood and rejects non-viable reads. This is the whole
//    surface across which model judgment reaches the board.
// ============================================================================

/** What the model returns for a board (raw, pre-validation). Every array is ids the validator
 *  checks against the neighborhood; every string is prose the guards check for digits/valence.
 *  There is no numeric or coordinate field — by construction. */
export interface CurationRequest {
  thesis: string;              // prose, no digits (guardFraming)
  whyRole: string;             // prose, no digits
  evidenceIds: string[];       // must be in the finding's metric neighborhood
  testIds: string[];           // must include >= 1 falsifier, or the read is not viable
  widgetIds: string[];         // must be catalog ids in the finding's related domains
  partitionPref?: "analytical" | "hero" | "balanced" | null;  // advisory only (S4)
  scorecardKeys: string[];     // headline-strip metric keys
  rationaleTags?: string[];    // short non-numeric tags
}

/** What the validator emits. `viable:false` => the deterministic fallback curation renders,
 *  so the board always composes fully whether the model succeeded, partially fired, or failed. */
export interface CurationResult {
  viable: boolean;
  violations: string[];        // human-readable record of every drop/rejection (shown in the log)
  curation:
    | (CurationRequest & { source: "live" | "fallback" })
    | null;                    // null iff not viable → caller uses the fallback
}

// ============================================================================
// 5. QUERY BOUNDARY — the router, the grounding, the decline branch
//    A user query is CLASSIFIED (server-side), then either answered (engine computes the value,
//    model narrates the verdict's direction), re-orients the board around a discovered finding,
//    or is DECLINED. Refusal is a displayed feature, never a silent guess.
// ============================================================================
export type QueryMode = "answer" | "both" | "reorient" | "unsupported";

export interface QueryClassification {
  mode: QueryMode;
  echo: string;                // "what I understood you asked" — shown back to the user
  confidence: "low" | "medium" | "high";
  domain?: string;             // for reorientation: which finding-domain the interest maps to
  intent?: unknown;            // for answer: the resolvable metric request
  reason?: string;             // for unsupported: why it's out of the data contract
}

/** The ONLY thing the narration model is given about a computed answer — qualitative, never the
 *  number. The model cannot leak what it was never shown (S1); it can only phrase the verdict,
 *  and guardDirection + engineHeadline keep even that consistent with the engine (L1). */
export interface NarrateGrounding {
  label: string;
  hasBenchmark: boolean;
  status: "clears" | "breaches" | null;
  direction: "rising" | "falling" | "flat" | null;
  proxy: boolean;
}

// ============================================================================
// NOT IN THIS CONTRACT (by design)
// ----------------------------------------------------------------------------
// - No stored metrics or findings in the shipped dataset (raw rows + config only; verified).
// - No model-authored numbers, comparisons, axis scales, or layout coordinates (S1–S5).
// - No forecasting/projection — the engine is deterministic; such asks take the decline branch.
// - The neighborhood/domain/test menus are hand-authored for this closed world. In production
//   they would be derived from a metric registry and verified by the oracle generalized — the
//   engine already demonstrates the pattern (every semantic relation has an executable check).
// ============================================================================
