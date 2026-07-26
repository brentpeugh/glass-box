// The engine singleton, factored out of App.tsx so the view layer and the extracted curation
// modules (catalog / curate / perturbations) share ONE engine instance. Everything downstream
// reads `E` as a live binding: initEngine() reassigns it and every importer sees the new value.
// One engine, two consumers: this same engine-core is what scripts/validate.ts proves against
// the oracle. The browser never hand-edits it.
import { createEngine } from "./engine-core";

export let E: any;
export let BASE_DS: any = null;   // retained so perturbations transform a copy and reset restores the original

export function initEngine(ds: any) {
  E = createEngine({ customers: ds.facts.customers, opex: ds.facts.opex, quarters: ds.meta.quarters, segments: ds.meta.segments, benchmarks: ds.benchmarks, opportunities: ds.facts.opportunities });
}
// BASE_DS is a module binding; importers cannot assign it, so the bootstrap sets it through here.
export function setBaseDS(ds: any) { BASE_DS = ds; }
