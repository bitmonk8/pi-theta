---
id: PTQ-1733
title: The acceptance tests independently install the same three-spy model-resolver double.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/acceptance-host-env-isolation.test.ts:20-24
  - tests/acceptance-live-host-precondition.test.ts:10-19
  - tests/helpers/model-registry-fixture.ts:18-26
sites: 2
fix_scope: cross-module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The acceptance tests independently install the same three-spy model-resolver double.

## Observation
The two acceptance test files each install a double for `ModelRuntime.create`, `ModelRegistry.prototype.refresh`, and `ModelRegistry.prototype.getAvailable`. Both refresh spies resolve to the same `{ aborted: false, errors: new Map() }` shape, and both cast the available-model list through the same SDK return type. The host-isolation test supplies one fixed model and an empty runtime; the precondition test parameterizes the model list and supplies credential-metadata methods for its missing-provider case. These are two implementations of the same resolver setup, with different fixture inputs. `tests/helpers/` already contains model-registry fixtures, although its existing `registryOf` helper wraps a structural registry rather than installing these SDK spies.

## Evidence
`tests/acceptance-host-env-isolation.test.ts:20-24` — first installation:

```ts
  vi.spyOn(ModelRuntime, "create").mockResolvedValue({} as ModelRuntime);
  vi.spyOn(ModelRegistry.prototype, "refresh").mockResolvedValue({ aborted: false, errors: new Map() });
  vi.spyOn(ModelRegistry.prototype, "getAvailable").mockReturnValue([
    { provider: "openai", id: "gpt-6.1-sol" },
  ] as ReturnType<ModelRegistry["getAvailable"]>);
```

`tests/acceptance-live-host-precondition.test.ts:10-19` — second installation:

```ts
function availableModels(models: readonly { readonly id?: string; readonly provider: string }[]): void {
  vi.spyOn(ModelRuntime, "create").mockResolvedValue({
    listCredentials: async () => [],
    getProvider: () => undefined,
  } as unknown as ModelRuntime);
  vi.spyOn(ModelRegistry.prototype, "refresh").mockResolvedValue({ aborted: false, errors: new Map() });
  vi.spyOn(ModelRegistry.prototype, "getAvailable").mockReturnValue(
    models as ReturnType<ModelRegistry["getAvailable"]>,
  );
}
```

`tests/helpers/model-registry-fixture.ts:18-26` — existing related helper, not an equivalent spy installer:

```ts
/** One `AvailableModel` fixture row. */
export function model(id: string, provider: string, api: string): AvailableModel {
  return { id, provider, api };
}

/** A `ModelRegistrySurface` over a fixed `AvailableModel` array. */
export function registryOf(models: readonly AvailableModel[]): ModelRegistrySurface {
  return { getAvailable: () => models };
}
```

The count is two resolver-double installations in the two scoped acceptance files; both counted sites are reproduced above. The bodies are near-identical, not byte-identical: the runtime payload and model-list source differ, while all three spy targets, the refresh result, and the model-list cast match.

## Why this is a problem
This is D7 copy-paste doubles and boilerplate duplication. The same SDK resolver contract is encoded independently in both test setups: all three intercepted methods and the refresh result shape must be maintained at two sites. The repeated material is dependency setup, not the distinct envelope-isolation and precondition assertions. The observation concerns duplicated existing test code, not runtime isolation, missing behaviour checks, or the choice of test tier.

## Suggested direction (non-binding, optional)
The existing model-registry fixture module demonstrates the natural `tests/helpers/` home for this kind of test-side dependency setup; its current structural wrapper does not itself replace the SDK-spy sequence.

## False-positive check
- Gate-pin: neither acceptance file is a gate or census test, and the cited sequences contain no pinned corpus counts. The annotation test's census is not part of this finding.
- Recording-double: these spies supply runtime/registry responses; the cited sequences do not implement a MUST-NOT call-recording witness. No negative-call assertion is challenged.
- docs/bugs/ signature search: `rg -n 'acceptance-host-env-isolation|acceptance-live-host-precondition' docs/reference/coverage-matrix.md docs/bugs` returned no matches. A separate search for `availableModels|ModelRuntime|ModelRegistry` found SDK/provider discussions, not a documented requirement to keep these two setup implementations separate. This is not a finding about a red or disabled test.
- Coverage-matrix/bug-doc citation search: the filename search above returned no citations. No test merge, rename, deletion, count change, or assertion change is proposed.
- Existing-report check: the same two-filename search under `quality/intake`, `quality/issues`, and `quality/resolved` returned no matches before filing. The registry-reader duplication already recorded against the annotation test is not re-filed here.
- Intent check: `git log -p -2 -- tests/acceptance-live-host-precondition.test.ts` shows its runtime/refresh fixture adapting to the SDK upgrade in `de146127`; `git show --format=fuller --stat f084fcc0 -- tests/acceptance-host-env-isolation.test.ts tests/acceptance-live-host-precondition.test.ts` identifies the later host-isolation test addition. The stated purposes are preserved by the distinct tests; neither history entry states that the resolver setup must be independently implemented.
- Coverage boundary: this finding inventories two existing double implementations only. It makes no claim that another test or execution path should exist.

## Triage
verdict: confirmed — Both cited acceptance tests independently install the same three SDK spies, refresh-result shape, and model-list cast for resolveAcceptanceHost; the runtime payload/model inputs differ as reported, while registryOf is only a structural wrapper. This is verified D7 double/setup duplication; searches and history reproduce, no carve-out applies, and no existing or resolved finding prescribes or tracks this spy setup. (triage: claude-opus-5-5)
