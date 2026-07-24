# /audits — Adversarial Audit Record

Glass Box claims that the model structurally cannot author or misrepresent substance. This directory is the attempt to break that claim, and what happened each time. It is published alongside the code because a trust architecture whose verification is private is asking for exactly the deference it argues against.

## The record

| File | What it is |
|---|---|
| `00-scope-brief-original.md` | The scope and intent the artifact was built to, written before the audit. Round 1 was conducted against this document. |
| `01-audit-round-1.md` | Full audit against the original brief: invariant-by-invariant verdicts, adversarial attempts, drift check, skeptic's read. |
| `02-audit-round-2.md` | Delta audit of the round-1 fixes, plus new findings. |
| `03-audit-round-3.md` | Delta audit of the round-2 fixes. |
| `04-resolution.md` | Closes the one open item — a safety layer that passed review twice and never ran — with its live verification. |
| `05-scope-brief-current.md` | The scope brief rewritten to describe the shipped architecture. |

**The brief appears twice on purpose.** Round 1's largest finding was that the documentation and the build had diverged: the contract file described types the application no longer used, and the README described a role-divergence demonstration the live system had superseded with a better mechanism. For an artifact whose thesis is that claims must match reality, documentation drift is a first-class defect, not a nit. Both versions are published so that finding remains legible instead of quietly erased by the fix.

## Method and attribution

The audits were conducted by Claude (Anthropic), directed and adjudicated by the author. Each round was given the codebase and the scope brief, and asked to break the claims — reading every source file, running the validation suites independently, probing the engine and validator adversarially, inspecting the dataset for smuggled answers, and testing the deployed system rather than only the repository.

Findings were then fixed and re-audited. Rounds 2 and 3 exist because the first two attempts at one fix silently failed in production; round 4 exists because the record would be dishonest without the resolution.

That an AI adversarially audited an AI-trust architecture — and repeatedly found real defects, including in its own commissioned fixes — is disclosed rather than hidden. It is consistent with how the artifact was built, and the findings are independently reproducible: see below.

## What is omitted, and why

Specific adversarial payloads and live-endpoint attack procedures are **not** published: the demonstration is publicly reachable and metered, and a copy-paste attack cookbook serves no reader who is evaluating the work. Findings, verdicts, root causes, and reasoning appear in full; the executable specifics are described by class rather than reproduced verbatim. The round-1 adversarial battery — a script encoding exact attack inputs against the engine and validator — is withheld for the same reason; its findings are recorded in `01-audit-round-1.md`.

The audit documents are otherwise published as written, lightly edited only to remove those specifics and incidental notes about the author's distribution plans. No technical finding, verdict, or criticism has been softened or removed.

## Reproducing the structural claims

The claims that matter do not require the attack scripts. From the repository root:

```
npm install
npm run validate          # engine oracle + discovery-path proof
```

This runs the independent reference oracle against the engine (metric-by-metric, from raw rows) and the discovery-path proof, which asserts among other things that the finding the system surfaces is derived from the data by generic salience rather than planted — including that the one narrative deliberately authored into the synthetic dataset is *not* the finding the engine selects.

For the deployed system:

```
bash scripts/probe-limit.sh    # rate-limit acceptance test against the live function
```

And the trust claims themselves are inspectable in the running demo: click any number to walk its provenance to the source rows, which are re-queried and re-summed live; ask a question outside the data contract and watch it decline by name; perturb the input data and watch a different finding derive itself.

## The one-line summary

Across four rounds, every structural invariant held under attack. The defects found were real — an open model-proxy endpoint, a documentation set describing a superseded architecture, a decorative reconciliation mark, a guard that would have rejected the system's own vocabulary, and a rate limiter that passed code review twice while not existing at runtime — and all are fixed, with the failures recorded rather than removed. **The measured delta between what this repository claims and what the deployed system does is zero.**
