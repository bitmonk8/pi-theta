---
id: PTQ-0272
title: A `model()`/`registryOf()` `AvailableModel`/`ModelRegistrySurface` fixture pair is independently reimplemented in four test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/binder-model-resolution.test.ts:41-49
  - tests/b0418-binder-model-reference-first-slash-ordering.test.ts:39-47
  - tests/registration-reload-wiring.test.ts:49-51
  - tests/registration-reload-wiring.test.ts:172-176
  - tests/execution-status-entry-migration-witnesses.test.ts:138-141
sites: 4
fix_scope: cross-module
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# A `model()`/`registryOf()` `AvailableModel`/`ModelRegistrySurface` fixture pair is independently reimplemented in four test files

## Observation
`tests/binder-model-resolution.test.ts` defines a private `model(id, provider,
api)` fixture builder returning an `AvailableModel` object literal, and a
private `registryOf(models)` wrapper returning a `ModelRegistrySurface` whose
`getAvailable` closes over the array. The identical pair (same field order,
same one-line `getAvailable` body) recurs in three other test files. No file
under `tests/helpers/` exports either helper; each of the four files
constructs its own.

## Evidence
tests/binder-model-resolution.test.ts:41-49:
```ts
const model = (id: string, provider: string, api: string): AvailableModel => ({
  id,
  provider,
  api,
});

const registryOf = (models: readonly AvailableModel[]): ModelRegistrySurface => ({
  getAvailable: () => models,
});
```

tests/b0418-binder-model-reference-first-slash-ordering.test.ts:39-47 (same
shape, same field order):
```ts
const model = (id: string, provider: string, api: string): AvailableModel => ({
  id,
  provider,
  api,
});

const registryOf = (models: readonly AvailableModel[]): ModelRegistrySurface => ({
  getAvailable: () => models,
});
```

tests/registration-reload-wiring.test.ts:49-51 (`registryOf` as a module-level
function declaration instead of an arrow-const, same one-line body):
```ts
function registryOf(models: readonly AvailableModel[]): ModelRegistrySurface {
  return { getAvailable: () => models };
}
```

tests/registration-reload-wiring.test.ts:172-176 (`model`, scoped inside one
`describe` block instead of module scope, same three fields):
```ts
  const model = (
    id: string,
    provider: string,
    api: string,
  ): AvailableModel => ({ id, provider, api });
```

tests/execution-status-entry-migration-witnesses.test.ts:138-141 (both
helpers, same shape, on one line each):
```ts
const model = (id: string, provider: string, api: string): AvailableModel => ({ id, provider, api });
const registryOf = (models: readonly AvailableModel[]): ModelRegistrySurface => ({
  getAvailable: () => models,
});
```

Search: `grep -rl "ModelRegistrySurface" tests/*.ts` returns exactly these
four files and no others; `grep -rl "registryOf" tests/*.ts` returns the same
four files. No file under `tests/helpers/` matches
`grep -rl "AvailableModel" tests/helpers/`.

## Why this is a problem
Four independent test files construct the same two-field fixture shape (an
`AvailableModel` triple and a `ModelRegistrySurface` closing over an array of
them) for driving `createModelReferenceMatcher` /
`resolveBinderModel`/`matchAvailableModel`, with the core logic — the object
literal's field order and the one-line `getAvailable` closure — copied
identically in every occurrence; only cosmetic form differs (arrow-const vs.
function declaration, module-scope vs. describe-scope, one-line vs.
multi-line parameter lists). No canonical version of this pair exists under
`tests/helpers/` despite four sites independently arriving at it.

## Suggested direction (non-binding, optional)
A `model()`/`registryOf()` pair belongs beside the other model/registry-shaped
fixtures already centralised under `tests/helpers/`, given four files already
carry copies of exactly this pair.

## False-positive check
- Gate-pin check: none of the four files match `*gate*.test.ts` or the named
  gate kin.
- Recording-double check: not applicable — `registryOf` returns a static
  `getAvailable` closure over a fixed array; it records no calls and backs no
  MUST-NOT-called witness.
- docs/bugs/ signature search: `grep -rl "binder-model-resolution.test.ts\|b0418-binder-model-reference-first-slash-ordering.test.ts\|registration-reload-wiring.test.ts\|execution-status-entry-migration-witnesses.test.ts" docs/bugs/*.md`
  hits several bug docs (0178, 0185, 0297, 0418, 0475) that cite these files
  as fix witnesses for their own, unrelated subjects (binder-model
  resolution behaviour, not this fixture pair); none documents a
  correct-reason red for any of the four files, and all four are green
  (`npx vitest run tests/binder-model-resolution.test.ts` passes 12/12 as
  shown in a sibling finding).
- coverage-matrix/bug-doc citation search: `grep -n
  "binder-model-resolution\|b0418-binder-model-reference-first-slash-ordering\|registration-reload-wiring\|execution-status-entry-migration-witnesses"
  docs/reference/coverage-matrix.md` returns no hits — none of the four files
  are cited there by name. This finding does not propose merging, renaming,
  or deleting any test, only that a private fixture pair is currently copied
  four times, so no citation is disturbed.
- Scope: only `tests/binder-model-resolution.test.ts` is in this wave's
  review scope; the other three files are cited solely as duplication
  evidence and were not otherwise reviewed.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all five excerpts and both `grep -rl` counts reproduce exactly (ModelRegistrySurface/registryOf hit only these 4 files under tests/*.ts, AvailableModel absent from tests/helpers/), the id/provider/api and getAvailable() shapes match src/extension/reload-wiring.ts:498-510 verbatim, no gate/negative-witness/documented-red/coverage-matrix carve-out applies, all 44 tests across the four files pass, and no existing or resolved PTQ covers this fixture pair (PTQ-0168 is unrelated doc-staleness) (triage: claude-opus-5)
