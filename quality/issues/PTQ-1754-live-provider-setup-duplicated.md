---
id: PTQ-1754
title: The H8a and hardening harnesses repeat the live-provider initialization sequence.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/harness.ts:110-123
  - tests/live/hardening/probe-harness.ts:118-129
  - tests/live/hardening/probe-harness.ts:131-138
  - tests/live/harness.ts:37-38
  - tests/live/hardening/probe-harness.ts:42-43
sites: 2
fix_scope: cross-module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The H8a and hardening harnesses repeat the live-provider initialization sequence.

## Observation
The two live harnesses each implement the same provider setup: create a model runtime, construct and refresh its registry, read available models, fail on an empty list, select the live model, and return the runtime/registry/model/model-id bundle. There are two copies in the reviewed scope. They differ in the `idOf` parameter annotation and the formatting and text of the no-selected-model failure. The hardening harness separately wraps its resolver promise in a synchronous provider handle; that wrapper is not the duplicated sequence being reported.

## Evidence
Occurrence 1 — `tests/live/harness.ts:110-123`:
```ts
  const modelRuntime = await ModelRuntime.create();
  const modelRegistry = new ModelRegistry(modelRuntime);
  await modelRegistry.refresh();
  const available = modelRegistry.getAvailable();
  if (available.length === 0) {
    failLoudly(await liveModelPreconditionMessage(modelRuntime));
  }
  const idOf = (m: LiveModel): string => (m as { id?: string }).id ?? "";
  const model = selectLiveModel(available);
  if (model === undefined) {
    failLoudly("live-host precondition unmet: no resolvable live model.");
  }
  return { modelRuntime, modelRegistry, model, modelId: idOf(model) };
}
```

Occurrence 2 — `tests/live/hardening/probe-harness.ts:118-129`:
```ts
  const modelRuntime = await ModelRuntime.create();
  const modelRegistry = new ModelRegistry(modelRuntime);
  await modelRegistry.refresh();
  const available = modelRegistry.getAvailable();
  if (available.length === 0) {
    failLoudly(await liveModelPreconditionMessage(modelRuntime));
  }
  const idOf = (m: unknown): string => (m as { id?: string }).id ?? "";
  const model = selectLiveModel(available);
  if (model === undefined) failLoudly("no resolvable live model");
  return { modelRuntime, modelRegistry, model, modelId: idOf(model) };
}
```

The separate hardening wrapper, `tests/live/hardening/probe-harness.ts:131-138`, explains the different public entry-point shape without changing the setup sequence:
```ts
/** Resolve the configured live provider/model; fail loudly if none (never a silent skip). */
export function requireLiveProvider(): LiveProvider {
  // Kick off resolution eagerly and memoize so every `runProbe` shares one runtime.
  const resolved = resolveLiveProvider();
  // Avoid an unhandled-rejection warning before the first `await options.provider.resolved`.
  resolved.catch(() => undefined);
  return { resolved };
}
```

Both sites already share the selection and missing-provider message helpers. `tests/live/harness.ts:37-38`:
```ts
import { liveModelPreconditionMessage } from "../helpers/live-model-precondition";
import { selectLiveModel } from "../helpers/live-model-selection";
```
`tests/live/hardening/probe-harness.ts:42-43`:
```ts
import { liveModelPreconditionMessage } from "../../helpers/live-model-precondition";
import { selectLiveModel } from "../../helpers/live-model-selection";
```

## Why this is a problem
This is D7 boilerplate duplication in test-harness setup, not an objection to fail-loud preconditions. The two copies encode the same SDK initialization order and returned provider bundle independently, even though both already import the same selection and precondition-message policy. Maintaining that initialization sequence currently requires editing both bodies; the differences shown above do not represent different initialization steps.

## Suggested direction (non-binding, optional)
The existing `tests/helpers/live-model-selection.ts` and `tests/helpers/live-model-precondition.ts` modules identify the natural shared-helper neighborhood for this setup. The synchronous hardening handle versus asynchronous H8a entry point is outside the duplication claim.

## False-positive check
- **Gate-pin:** neither harness is a gate test, and the cited sequence contains no corpus inventory or expected-count assertion.
- **Recording-double:** these bodies initialize a real SDK runtime and registry; this is not a call-recording negative witness.
- **docs/bugs/ signature search:** `rg -l 'resolveLiveProvider|selectLiveModel|live-model-precondition|live-model-selection' docs/bugs docs/reference/coverage-matrix.md` returned no matches. No red or disabled test is alleged. Both empty-model paths fail loudly, which is the correct live-suite posture; the detached rejection handler on the wrapper is not being reported as a skip.
- **Coverage-matrix/bug-doc citation:** the preceding search covered the resolver/helper names in both locations; `rg -n 'tests/live/harness.ts|probe-harness.ts' docs/reference/coverage-matrix.md` also returned no matches. No test merge, rename, or deletion is proposed, and existing bug witnesses remain intact.
- **History/intent:** `git log -S 'const modelRuntime = await ModelRuntime.create'` over the two harness paths identified `d57ce767` and the hardening relocation `a6a5953e`. Their commit messages describe the SDK port and suite relocation, respectively, rather than two different provider-initialization contracts. The current wrapper difference is retained explicitly in this finding.
- **Prior-topic check:** searches of `quality/issues`, `quality/resolved`, and `quality/intake` for `ModelRuntime`, `resolveLiveProvider`, and `selectLiveModel` found no report of these two real-runtime initialization bodies. The pending acceptance-model-resolver-double finding concerns SDK spies in two different tests, not this real setup sequence; PTQ-0480 concerns repeated caller-side empty-model-id guards.
- **Scope/coverage:** all reported code is under `tests/`. This finding concerns two existing setup implementations, not a missing test or suite composition, and asserts no runtime-risk harm.

## Triage
verdict: confirmed — Both live harnesses independently implement the same runtime creation, registry refresh, availability checks, model selection, and returned bundle; excerpts, searches, and history reproduce. This is D7 setup-boilerplate duplication under tests/, distinct from the hardening promise wrapper and acceptance SDK doubles; no carve-out or existing/resolved finding prescribes or tracks these copies. (triage: claude-opus-5-5)
