---
id: PTQ-0638
title: nested-inline-enum-generic-argument-refusal.test.ts's whole sink-position harness is copy-pasted from generic-argument-shredded-group-refusal.test.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/nested-inline-enum-generic-argument-refusal.test.ts:191-330
  - tests/nested-inline-enum-generic-argument-refusal.test.ts:416-424
  - tests/generic-argument-shredded-group-refusal.test.ts:163-268
  - tests/generic-argument-shredded-group-refusal.test.ts:277-341
sites: 2
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# nested-inline-enum-generic-argument-refusal.test.ts's whole sink-position harness is copy-pasted from generic-argument-shredded-group-refusal.test.ts

## Observation
`tests/nested-inline-enum-generic-argument-refusal.test.ts` (bug 0217) and
`tests/generic-argument-shredded-group-refusal.test.ts` (bug 0204, extensively
cited throughout the 0217 file's own comments as its precedent) each
independently declare the same four-page registry read, the same
`registryMessageOf`/`line` template renderer, the same `schemaRefusal`/
`paramsRefusal` wrappers, the same `Read` interface, the same `diagLines`,
`read`, `loweredF`, and `seamCtx` functions — all byte-identical or
near-identical across the two files, rather than the 0217 file importing them
from the 0204 file's module or a shared `tests/helpers/` location.

## Evidence
`tests/nested-inline-enum-generic-argument-refusal.test.ts:191-206` (RegistryRow + REGISTRY):
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
```

`tests/generic-argument-shredded-group-refusal.test.ts:163-177` (the same shape):
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
```

`tests/nested-inline-enum-generic-argument-refusal.test.ts:222-236` (`registryMessageOf`/`line`):
```ts
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: the diagnostics code registry must carry the *Message* row for ${code}; ` +
      `without it every expected message in this file would be a restatement, which DIAG-4 bars`,
  ).toBeDefined();
  return template as string;
}

/** \`error <code>: <message>\` for one substitution set, rendered from the registry. */
function line(code: string, subs: ReadonlyArray<readonly [string, string]>): string {
  let message = registryMessageOf(code);
  for (const [placeholder, value] of subs) {
```

`tests/generic-argument-shredded-group-refusal.test.ts:194-207` (the same functions, same bodies):
```ts
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: the diagnostics code registry must carry the *Message* row for ${code}; ` +
      `without it every expected message in this file would be a restatement, which DIAG-4 bars`,
  ).toBeDefined();
  return template as string;
}

/** \`error <code>: <message>\` for one substitution set, rendered from the registry. */
function line(code: string, subs: ReadonlyArray<readonly [string, string]>): string {
  let message = registryMessageOf(code);
  for (const [placeholder, value] of subs) {
```

`tests/nested-inline-enum-generic-argument-refusal.test.ts:416-424` (`seamCtx`):
```ts
function seamCtx(): { readonly ctx: LowerCtx; readonly sink: string[] } {
  const sink: string[] = [];
  return {
    ctx: { bodyTypeMap: new Map(), defs: {}, unresolved: [], unspellable: sink },
    sink,
  };
}
```

`tests/generic-argument-shredded-group-refusal.test.ts:334-341` (the same function, verbatim):
```ts
function seamCtx(): { readonly ctx: LowerCtx; readonly sink: string[] } {
  const sink: string[] = [];
  return {
    ctx: { bodyTypeMap: new Map(), defs: {}, unresolved: [], unspellable: sink },
    sink,
  };
}
```

The `Read` interface, `diagLines`, `read`, and `loweredF` (`nested-inline-enum-generic-argument-refusal.test.ts:296-330` vs `generic-argument-shredded-group-refusal.test.ts:255-332`) carry the same field set, same loud-throw preconditions, and near-identical wording (0217's `read`/`fixture` additionally cover the four annotation-side positions and a `params:`-scalar quoting guard, which 0204's version lacks); the registry pieces above are byte-for-byte identical between the two files.

## Why this is a problem
The 0217 file's own header repeatedly cites 0204's cell IDs (l1-l4, g1-g2, h1) as the fence rows this file must keep green, showing the author read and depended on 0204's file directly, yet re-typed its harness rather than importing it. Six functions/constants (`RegistryRow`, `REGISTRY`, `registryMessageOf`, `line`, `seamCtx`, and the `Read`/`diagLines`/`read`/`loweredF` group) are duplicated across the two files with no shared module; a future edit to the registry-read shape or the loud-precondition wording (e.g. `code-registry.test.ts`'s DIAG-2/DIAG-4 anchors changing) has two independent, hand-synchronised copies to update.

## Suggested direction (non-binding, optional)
The natural home for the shared registry read, message renderer, and sink-position `fixture`/`Read`/`read`/`loweredF`/`seamCtx` harness is a `tests/helpers/` module the two bug files both import, parameterised by the position set each file exercises — named here as observation of where the duplication collapses, not as a design.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or named kin; not applicable.
- Recording-double carve-out: `seamCtx`/`read` build fixtures and read diagnostics, not negative-call-witness doubles; not applicable.
- docs/bugs/ signature search: `grep -rn "0204\|0217" docs/bugs/` confirms both are separate, independently-numbered bug reports (0204, 0217) each with their own fixture set; the harness duplication is between their test files, not a documented correct-reason-red.
- coverage-matrix/bug-doc citation search: `grep -rn "generic-argument-shredded-group-refusal\|nested-inline-enum-generic-argument-refusal" docs/reference/coverage-matrix.md docs/bugs/` found no citation of either file by name that this finding would contradict; no merge/rename/delete is proposed.
- Confirmed this stays inside `tests/`; neither cited file is under `src/`, `extensions/`, or `tools/`.

## Triage
verdict: confirmed — independently re-verified: `diff` of nested-inline-enum-generic-argument-refusal.test.ts:191-245 against generic-argument-shredded-group-refusal.test.ts:163-217 (RegistryRow/REGISTRY/registryMessageOf/line/schemaRefusal/paramsRefusal) is empty (byte-identical), neither file imports the ratified tests/helpers/registry-oracle.ts home (PTQ-0215, 30 importers) and both still call parseRegistry over the four pages; the Read/diagLines/read/loweredF/seamCtx group matches except for the disclosed 0217 extensions plus one undisclosed semantic fork the fixer must parameterise (Read.codes is emission-order in 0217 vs distinct-sorted in 0204); both files in tests/, no gate/recording-double carve-out applies, coverage-matrix cites neither, and no open/resolved PTQ names either file except PTQ-0205 (diagLines only, narrower root cause) — not a duplicate (triage: claude-fable-5-1)
