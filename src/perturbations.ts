// Extracted from App.tsx (docs/briefs/extraction.md). Behaviour-preserving move — no logic change.
// Pure data transform: apply a single-axis change to a COPY of the base dataset.
import { BASE_DS } from "./engine";

// ===== PERTURBATION: prove discovery is real, not scripted. Apply a transparent, SINGLE-AXIS change
// to the real data — not a re-authored dataset — then recompute salience from scratch. The finding
// re-orders on its own and the whole app re-orients, with no code change. Verified blind: cutting
// recent S&M removes the CAC/efficiency anomaly and the engine surfaces ARR concentration as the new
// top risk — unprompted. (Discipline: change the input condition, never the output finding.) =====
export const PERTURBATIONS = {
  improve_cac: {
    label: "Improve go-to-market efficiency",
    note: "Cut S&M spend ~40% in the last three quarters — a more efficient acquisition motion.",
    apply: (d) => { for (const o of d.facts.opex) if (["25Q2", "25Q3", "25Q4"].includes(o.quarter)) o.sm_spend *= 0.6; },
  },
};
export function perturbedDataset(name) {
  const d = JSON.parse(JSON.stringify(BASE_DS));
  PERTURBATIONS[name].apply(d);
  return d;
}
