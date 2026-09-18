---
id: PTQ-0988
title: production-cancellation-wiring.test.ts redeclares promptTheta locally though it already imports its sibling builders from the same helper that exports it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/production-cancellation-wiring.test.ts:56-64
  - tests/production-cancellation-wiring.test.ts:87-93
  - tests/helpers/tool-call-dispatch-harness.ts:289-295
sites: 1
fix_scope: localized
d4_class: clone
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# production-cancellation-wiring.test.ts redeclares promptTheta locally though it already imports its sibling builders from the same helper that exports it

## Observation
`tests/production-cancellation-wiring.test.ts` imports seven AST-node
builders (`callExpr`, `tryExpr`, `identExpr`, `objectExpr`, `strExpr as
stringExpr`, `letStmt`, `statementBody as body`) from
`./helpers/tool-call-dispatch-harness`, then a few lines later declares its
own local `promptTheta` function instead of importing the same-named,
same-signature, exported `promptTheta` from that identical helper module.
The local function's body is byte-identical to the helper's exported one.

## Evidence

`tests/production-cancellation-wiring.test.ts:56-64` (the existing import
from the helper that already exports `promptTheta`):
```ts
import {
  callExpr,
  tryExpr,
  identExpr,
  objectExpr,
  strExpr as stringExpr,
  letStmt,
  statementBody as body,
} from "./helpers/tool-call-dispatch-harness";
```

`tests/production-cancellation-wiring.test.ts:87-93` (the local
redeclaration, immediately below the import block above):
```ts
function promptTheta(thetaBody: ThetaBody, tools?: readonly string[]): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = {
    mode: "prompt",
    ...(tools !== undefined ? { tools } : {}),
  };
  return { slashName: "demo", sourcePath: "/theta/demo.theta", frontmatter, body: thetaBody };
}
```

`tests/helpers/tool-call-dispatch-harness.ts:289-295` (the exported
function, re-read immediately before filing — identical parameter list,
identical body, only the `export` keyword and the file it lives in differ):
```ts
export function promptTheta(thetaBody: ThetaBody, tools?: readonly string[]): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = {
    mode: "prompt",
    ...(tools !== undefined ? { tools } : {}),
  };
  return { slashName: "demo", sourcePath: "/theta/demo.theta", frontmatter, body: thetaBody };
}
```

Both of `production-cancellation-wiring.test.ts`'s sibling files that share
this exact `promptTheta(thetaBody, tools?)` signature already import it from
the helper instead of redeclaring it: `grep -n "promptTheta" tests/nested-control-in-pure-position.test.ts` shows it listed in that file's import block (line 20) and used at every call site (14 call sites, lines 131–510), and `grep -n "promptTheta" tests/production-core-exec.test.ts` shows the same (imported at line 22, used at 12 call sites). `tests/pure-async-unification.test.ts:129` still carries its own local byte-identical copy, matching the same pattern this finding cites for `production-cancellation-wiring.test.ts` but that file is outside this wave's briefed scope.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: a fixture builder
(`promptTheta`) is re-implemented locally in a file that, in the very same
import statement block, already draws six other builders from the one
helper module that exports the identical function under the identical name
and signature. The file's own import list is the proof that nothing about
the module boundary or the dependency shape prevented importing
`promptTheta` alongside its siblings — the local copy is pure duplication of
code already reachable from an import already present.

## Suggested direction (non-binding, optional)
Adding `promptTheta` to the existing `tool-call-dispatch-harness` import in
`production-cancellation-wiring.test.ts` and dropping the local declaration
is the natural fold this file's own import list already points at, mirroring
what `nested-control-in-pure-position.test.ts` and `production-core-exec.test.ts`
already do for the identical function.

## False-positive check
- Gate-pin check: `production-cancellation-wiring.test.ts` does not match
  `*gate*.test.ts` or any named gate kin; the cited lines are a plain
  fixture-value builder, not a pinned count or inventory.
- Recording-double check: `promptTheta` builds a static
  `ThetaCompositionInput` value; it records no calls and backs no
  MUST-NOT witness — the carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "production-cancellation-wiring"
  docs/bugs/*.md` hits `docs/bugs/0012-...md` and
  `docs/bugs/0319-...md`; both cite the file by name as their own witness
  for CANCEL-2/CANCEL-3/CANCEL-4 wiring, neither documents this
  `promptTheta` duplication as a correct-reason red, and this finding
  proposes no merge, rename, or deletion of the file or any of its `it()`
  blocks.
- coverage-matrix citation search: `grep -n "production-cancellation-wiring"
  docs/reference/coverage-matrix.md` returns no hits.
- Duplicate/overlap check: searched `quality/resolved/` and
  `quality/intake/` for prior filings naming `promptTheta` —
  `PTQ-0403-active-invocation-dispatch-scaffolding-duplicated.md` covers a
  *different*, zero-argument `promptTheta()` shared between
  `active-invocation-binder-window.test.ts` and
  `active-invocation-wiring.test.ts` (its own triage note flags a fourth
  `rootWith` copy in `production-cancellation-wiring.test.ts`, but not this
  file's `promptTheta`); `PTQ-0639-03-nested-control-pure-position-harness-duplicated.md`
  covers the `(thetaBody, tools?)`-signature `promptTheta` shared between
  `nested-control-in-pure-position.test.ts` and
  `production-core-exec.test.ts` and is resolved — both of those files now
  import `promptTheta` rather than declaring it, confirming the fix landed
  there and did not touch `production-cancellation-wiring.test.ts`. No prior
  filing names `production-cancellation-wiring.test.ts`'s own `promptTheta`
  copy.
- Coverage-drift check: this finding is about a duplicated fixture-builder
  declaration that exists today alongside a live import of its own sibling
  functions; it makes no claim about any untested path.

## Triage
<!-- appended by triage -->
verdict: confirmed — all three excerpts reproduce verbatim at the cited lines (cancellation-wiring:56-64 import block, :87-93 local decl; tool-call-dispatch-harness.ts:289-295 export) and a mktemp sed-extract + diff shows the two bodies byte-identical modulo `export`; the local copy is live (3 call sites at :107/:135/:271) and the file is 4/4 green; the sibling claim reproduces — nested-control-in-pure-position.test.ts:20 and production-core-exec.test.ts:22 both import `promptTheta` from the same harness, and `grep -rn "function promptTheta" tests/` confirms only pure-async-unification.test.ts:129 carries another `(thetaBody, tools?)` copy (acknowledged in-body; the ~20 other hits are unrelated string-returning live-cell/minimal-slash builders); location in tests/, not a gate test, a plain value builder not a recording double, docs/bugs 0012/0319 name the file only as CANCEL witness with no merge/rename/delete proposed, coverage-matrix 0 hits; not a duplicate — resolved PTQ-0670 covered this file's eight AST builders (now imported; `promptTheta` was outside its inventory), resolved PTQ-0639 covered the nested-control↔core-exec pair whose fix left this file untouched, PTQ-0403 is the zero-arg fixture-dispatch-harness variant and PTQ-0615 the live-cell string variant; fix is a mechanical one-name import addition (triage: claude-fable-5-1)
