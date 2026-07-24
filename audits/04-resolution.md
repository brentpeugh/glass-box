# Glass Box — Round 4: Resolution

*Basis: the fixes commissioned in round 3, applied and then verified against the deployed system. This round exists because rounds 2 and 3 both ended with a safety layer that passed review and did not run — an arc that would be dishonest to leave open in the record.*

---

## What was outstanding

Round 3 closed with the architecture clean — every structural invariant holding under adversarial probing, the numeral guard resisting evasion including its own vocabulary, deployment parity exact — and exactly one open item: **the per-IP rate limiter on the model-proxy function had been correctly written twice and had never once worked in production.** Round 2 found it silently dead. Round 3 found it dead again after a correct-looking migration, this time failing *loudly* in logs, which narrowed the cause to the storage layer being unavailable rather than the counting logic being wrong.

The README, meanwhile, claimed per-IP rate limiting was applied. For three consecutive rounds, that sentence was the project's entire remaining gap between claims and reality.

## The fix

Two changes, both aimed at the failure *class* rather than the instance:

**1. The bundler override was removed.** The function's runtime configuration had been pinning it to a legacy bundling path, which kept it off the modern pipeline that provisions the storage connection context — making the round-3 signature migration necessary but not sufficient. The configuration file now documents the absence so the line is not helpfully restored later.

**2. The limiter became layered, because a single fail-open dependency is indistinguishable from a working one.** The design that shipped:

- **L1 — in-memory, per warm instance.** No dependencies, no configuration, cannot fail or misconfigure. Sequential abuse reuses the warm instance, so this layer alone satisfies the acceptance test. Best-effort across concurrent instances; self-pruning.
- **L2 — durable store, cross-instance, strong consistency.** Note the second latent bug caught here: the default *eventual* consistency could serve stale counts under rapid fire and never accumulate — so even a correctly-provisioned store would have under-counted. This layer fails open **but loud**: a store error logs with a named tag and the request proceeds, with L1 still holding the line.
- **The backstop remains the hard spend cap** on the model provider account.

Net effect: if the durable layer is unavailable, the endpoint still limits, and the logs say which layer answered.

**3. An executable acceptance test was committed to the repo** (`scripts/probe-limit.sh`), so the verification is a command rather than a memory: it issues a burst past the configured limit and requires the rejection status at the first request over it, exiting non-zero otherwise. The README was rewritten to describe the layered design accurately and to state that the limiter is *verified empirically, not assumed*.

## Verification

Run against the deployed system after the fix:

- **Origin gating:** requests without a recognized Origin, and requests from unlisted origins, are both rejected. (In round 1, an unauthenticated caller could reach the model endpoint and obtain a completion.)
- **Rate limiting — first run: no rejection.** The burst passed cleanly. Cause: the deploy had not finished propagating; the test had outrun the build.
- **Rate limiting — second run, after the deploy settled: PASS.** The burst was rejected at exactly the first request over the configured limit — the designed threshold, not an approximation of it.
- **Deployment parity:** the served client bundle remained byte-identical to the repository build, as in every prior round.

## Verdict, and why this round is in the record

Every honesty invariant holds mechanically and survived adversarial probing; the guards resist evasion including their own vocabulary; the dataset is clean; both validation suites pass in full; the deployed client is byte-identical to the repository; and the model endpoint now refuses both strangers and gluttons, verifiably. **The measured delta between what this repository claims and what the deployed system does is zero.**

The rate-limiter arc is kept in the published record deliberately. A safety layer that passed code review twice and did not exist at runtime either time is the single best argument for the thesis this artifact is built to demonstrate: *structural guarantees are what you build; empirical verification against the live system is how you learn whether you built them.* Fail-open plus swallowed errors made "working" and "dead" identical from the outside — the same shape as "the model won't fabricate," which is equally plausible, equally reviewable, and equally worthless until something tries to break it and fails.
