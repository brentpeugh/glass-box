/**
 * Caliper trust-architecture artifact — LOCKED CONTRACT
 * =====================================================
 * The single source of types for every layer. The headless engine produces the
 * substance objects; the renderer consumes specs; the AI layers are fenced into
 * composition and interpretation. If a change would violate an invariant below,
 * the change is wrong — not the invariant.
 *
 * HONESTY INVARIANTS (load-bearing — the architecture exists to enforce these)
 * ---------------------------------------------------------------------------
 * I1. Substance lives ONLY in engine-produced objects (MetricValue, Finding).
 *     The model never emits a number. There is no field on a model-produced
 *     object into which a value could be injected.
 * I2. Higher layers REFERENCE lower objects by id; they never copy values.
 *     Finding -> MetricValue ids. Block -> Finding/MetricValue ids. One source
 *     of truth per number, one trace per number.
 * I3. Provenance is emitted at COMPUTE TIME, never reconstructed. Two layers:
 *     a MetricValue traces HOW a number was computed; a Finding additionally
 *     traces WHY it was judged notable (slope, t-stat, gate cleared).
 * I4. The renderer owns all chart axis scales deterministically from data
 *     ranges. The model may choose WHICH metrics and WHICH chart type; it has
 *     no authority over scale, baseline, or axis bounds. (Combo charts most of
 *     all — the dual-axis misleading-scale failure is closed by construction.)
 * I5. The only probabilistic number in the system is Intent.confidence — the
 *     L1 interpretation of a user query. Computed metrics are "deterministic"
 *     (or honestly labeled "proxy"); their honesty artifact is provenance, not
 *     a confidence score.
 * I6. Open-ended input that exceeds the deterministic substrate is DECLINED or
 *     DEGRADED, never generated past. QueryResult carries an explicit failure
 *     branch. Refusal is a demonstrated feature, not a hidden error.
 * I7. Composition is initiation-agnostic: entry (engine-initiated) and query
 *     (user-initiated) produce the SAME Block/Section types. Layout placement
 *     of a query result is decided by RULE (relatesTo), not by the model.
 */

// ============================================================================
// 0. SHARED PRIMITIVES
// ============================================================================
export type Grain = "company" | "segment" | "account";
export type Unit = "usd" | "percent" | "ratio" | "months" | "count";

export interface Scope {
  grain: Grain;
  segment?: string;            // present when grain === "segment"
  quarter?: string;            // point-in-time, e.g. "25Q4"
  window?: [string, string];   // cohort/trend window, e.g. ["24Q4", "25Q4"]
}

// ============================================================================
// 1. PROVENANCE  (invariants I2, I3)
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
      selector?: RowSelector;  // structured, serializable filter so the trace can resolve
                               // leaves to rows WITHOUT parsing `predicate` prose. In the
                               // browser it filters the loaded rows; in production it
                               // re-queries the warehouse. (Added in the trace-port slice.)
    };

/** Machine-resolvable row filter. Kept deliberately small; extend per fact as needed. */
export interface RowSelector {
  table?: "customers" | "opportunities" | "opex";
  seg?: string | null;         // segment filter (null/undefined = all)
  activeAt?: string;           // quarter at which the row must be non-zero (cohort gate)
  col?: string;                // the column being summed/measured, e.g. "arr_25Q4"
  quarter?: string;            // point-in-time filter (opex/opportunities)
}

export interface Provenance {
  op: string;                  // machine id: "sum" | "ratio" | "cohort_retention" | "linear_trend" | ...
  description: string;         // human: "Sum of ARR across 412 SMB accounts active in 25Q4"
  inputs: ProvRef[];           // recurses through MetricValues down to RowSet leaves
  configRefs?: string[];       // defined constants used: "benchmark.magic_number", "cohort.window_def"
}

// ============================================================================
// 2. METRIC VALUE  — engine-produced, self-interpreting number  (I1)
// ============================================================================
export interface MetricValue {
  id: string;
  metric: string;              // "magic_number" | "nrr" | "arr" | "win_rate" | ...
  label: string;               // "SaaS Magic Number"
  scope: Scope;
  value: number;
  unit: Unit;
  format: string;              // renderer format string: "$0.0M" | "0.0%" | "0.00x" | "0 mo"
  goodWhen: "higher" | "lower" | "neutral";   // metric POLARITY (config) — NOT role valence
  basis?: {                    // computed comparison context, itself sourced
    kind: "benchmark" | "prior_period" | "peer_median";
    ref: string | { metricId: string };       // config id, or another MetricValue
    delta?: number;            // value - reference (engine-computed)
  };
  epistemic: "deterministic" | "proxy";        // "proxy" => e.g. Rule of 40; carries note
  note?: string;               // disclosure when epistemic === "proxy"
  provenance: Provenance;      // HOW this number was computed
}

// ============================================================================
// 3. FINDING — engine-produced notable pattern  (I1, I3)
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
  summary: string;             // engine-authored, factual: "Blended NRR 106% masks SMB at 80%"
  values: string[];            // MetricValue ids composing it — NO copied numbers (I2)
  salience: number;            // 0..1 role-AGNOSTIC notability (effect size / breach mag / gap)
  polarity: "good" | "bad" | "neutral";        // metric-polarity direction — NOT role framing
  evidence: Record<string, number>;            // why it fired: { t: -6.3, effect: -0.56, gate: 2.5 }
  provenance: Provenance;      // WHY it was judged notable (distinct from value provenance)
}

// ============================================================================
// 4. COMPOSITION — model-produced, bounded  (I1, I4, I7)
//    Composition -> Section -> Block. Blocks are LEAVES (two-level nesting).
// ============================================================================

/** Structured framing for callouts, cards, and charts. The model authors these
 *  strings; the trace labels them as the model layer. Substance is never here. */
export interface StructuredFraming {
  headline: string;            // short, role-specific
  caption?: string;            // one line of context
  soWhat?: string;             // the role-relevant implication
}

export type BlockKind =
  | "narrative"        // prose briefing over referenced findings — uses `prose`, free string
  | "metric_callout"   // one MetricValue, large, with its basis — uses `framing`
  | "callout_strip"    // compact row of several callouts (e.g. the CFO breach stack)
  | "finding_card"     // a Finding: summary + values + drill-down affordance
  | "chart"            // renders a ChartSpec (type selects the visual)
  | "comparison_table"; // segments × metrics grid (later)

export type ChartType =
  | "line"             // metric over quarters, optional benchmark reference line
  | "stacked_area"     // ARR by segment over time (growth AND concentration)
  | "grouped_bar"      // segment comparison at a point (segment NRR vs benchmark)
  | "waterfall"        // retention bridge / net-new decomposition (the masking visual)
  | "combo"            // S&M bars + magic-number line — efficiency tension in one frame (I4)
  | "treemap";         // concentration as share (later)

export interface ChartSpec {
  type: ChartType;
  /** Each series references a MetricValue (or a series of them); the renderer
   *  pulls values and OWNS all axis scaling (I4). The model picks metrics +
   *  type + encoding role only. */
  series: { metricRef: string; encode: "x" | "y" | "y2" | "color" | "size" | "value" }[];
  benchmarkRef?: string;       // optional threshold reference line (config id)
}

export interface Block {
  id: string;
  kind: BlockKind;
  refs: string[];              // Finding / MetricValue ids presented — NEVER raw values (I2)
  emphasis: "hero" | "standard" | "compact";   // composition weight, not content
  framing?: StructuredFraming; // metric_callout | callout_strip | finding_card | chart
  prose?: string;              // narrative only
  chartSpec?: ChartSpec;       // present iff kind === "chart"
  /** Query-absorption hook (I7): the Finding/MetricValue this block answers about.
   *  The dashboard places the block adjacent to / expanded-from whatever already
   *  presents that ref; if nothing matches, it opens a fixed "Your questions"
   *  section. The model supplies the ref it already has — never a coordinate. */
  relatesTo?: string;
}

export interface Section {
  id: string;
  heading?: string;            // role-distinctive grouping: "Retention", "Efficiency", "Growth"
  blocks: Block[];             // leaves only — no deeper nesting
}

export interface Composition {
  source:
    | { kind: "entry"; role: string }
    | { kind: "query"; intentId: string };
  sections: Section[];
  rev: number;                 // stateful: a query bumps rev and merges its blocks by rule
}

// ============================================================================
// 5. QUERY BOUNDARY — L1 intent + the decline branch  (I5, I6)
// ============================================================================
export type IntentType =
  | "current_state"
  | "segment_breakdown"
  | "ranking"
  | "comparison"
  | "trend"
  | "metric_lookup";

export interface Intent {
  type: IntentType;
  params: Record<string, unknown>;
  echo: string;                // "what I understood you asked" — shown back to the user
  confidence: number;          // 0..1 — the ONLY probabilistic number in the system (I5)
}

export type QueryResult =
  | { ok: true; intent: Intent; blocks: Block[] }       // blocks merge into the live dashboard
  | {
      ok: false;
      reason: "unsupported_metric" | "no_primitive" | "out_of_scope";
      message: string;         // decline/degrade, never generate off-substrate (I6)
    };

// ============================================================================
// NOT IN THIS CONTRACT (by design)
// ----------------------------------------------------------------------------
// - No stored metrics or findings in the shipped dataset (raw rows + config only).
// - No model-authored numbers, axis scales, or layout coordinates.
// - No forecasting / projection types — the engine is deterministic; such asks
//   take the QueryResult decline branch.
//
// NEXT STEP: build the headless TypeScript engine that PRODUCES MetricValue and
// Finding from caliper_dataset.json. It is correct iff it reproduces the metric
// panel and the 14 findings in findings_validation.json (the oracle). No UI, no
// AI, no renderer yet — substance and provenance first, proven against ground
// truth, one vertical slice end to end before going wide.
// ============================================================================
