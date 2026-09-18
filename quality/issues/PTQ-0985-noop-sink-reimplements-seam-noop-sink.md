---
id: PTQ-0985
title: b0307-empty-template-parity.test.ts reimplements SEAM_NOOP_SINK as a local NOOP_SINK instead of importing it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0307-empty-template-parity.test.ts:2-12
  - tests/b0307-empty-template-parity.test.ts:105-108
  - tests/helpers/invoke-seam-scaffold.ts:46-49
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0307-empty-template-parity.test.ts reimplements SEAM_NOOP_SINK as a local NOOP_SINK instead of importing it

## Observation
`tests/b0307-empty-template-parity.test.ts` imports `SEAM_NOOP_CHECKPOINT` (aliased
`NOOP_CHECKPOINT`), `SITE`, `body`, `identExpr`, `letStmt`, `matchExpr`, `queryExpr` and
`realEnv` from `./helpers/invoke-seam-scaffold` (lines 2-12), but does not import that
same module's `SEAM_NOOP_SINK`. Instead it declares a local `const NOOP_SINK` (lines
105-108) whose object literal is byte-identical to the helper's exported
`SEAM_NOOP_SINK` (`tests/helpers/invoke-seam-scaffold.ts:47-49`).

## Evidence
`tests/b0307-empty-template-parity.test.ts:2-12` (the import already reaching into the
module that also exports `SEAM_NOOP_SINK`):
```ts
import {
  RecordingMutator,
  SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT,
  SITE,
  body,
  identExpr,
  letStmt,
  matchExpr,
  queryExpr,
  realEnv,
} from "./helpers/invoke-seam-scaffold";
```

`tests/b0307-empty-template-parity.test.ts:105-108` (the locally reimplemented fixture):
```ts
const NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};
```

`tests/helpers/invoke-seam-scaffold.ts:46-49` (the canonical export, same shape, same
two no-op methods):
```ts
/** A `ToolLoweringSink` that discards every diagnostic/system-note. */
export const SEAM_NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};
```

Other files that import `SEAM_NOOP_SINK` directly from the same module rather than
retyping it (confirmed by `grep -rn "SEAM_NOOP_SINK" tests/`, 12 hits total):
`tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts:67`,
`tests/b0295-child-internal-cancel-wrap-arm.test.ts:103`,
`tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts:98`,
`tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts:118`,
`tests/composition-producer.test.ts:4`, `tests/effectful-statement-host.test.ts:4`,
`tests/inbound-boundary-binder-args.test.ts:4`,
`tests/params-default-enum-access-merge.test.ts:3`.

## Why this is a problem
`tests/helpers/invoke-seam-scaffold.ts`'s own header states its purpose: centralising
seam scaffolding — including this exact `ToolLoweringSink` no-op — that would otherwise
be "byte-for-byte identical across several `executeBody`-driving invoke/code-call
bug-witness files." `b0307-empty-template-parity.test.ts` already imports a sibling
constant (`SEAM_NOOP_CHECKPOINT`) from that same module in the same import statement,
so the module is already open in this file; the `ToolLoweringSink` no-op is retyped
beside it rather than imported, reproducing exactly the byte-for-byte duplication the
helper module exists to prevent.

## Suggested direction (non-binding, optional)
Importing `SEAM_NOOP_SINK` alongside the other names already pulled from
`./helpers/invoke-seam-scaffold` removes the local retyping; this is an observation
about the helper already present in the same import line, not a design for the fix.

## False-positive check
- Gate-pin check: file name does not match `*gate*.test.ts` or kin; not a census/pin
  gate, does not apply.
- Recording-double check: `NOOP_SINK` records nothing (both methods discard their
  argument); it is not a negative witness, so the recording-double carve-out does not
  apply.
- docs/bugs/ signature search: `grep -rn "NOOP_SINK" docs/bugs/` → 0 hits; no documented
  correct-reason red cites this symbol.
- coverage-matrix/bug-doc citation search: `grep -n "b0307-empty-template-parity"
  docs/reference/coverage-matrix.md` → 0 hits. `grep -n
  "tests/b0307-empty-template-parity.test.ts" docs/bugs/0307-*.md` → 2 hits (the file is
  named in the bug's witness list), but this finding does not propose merging, renaming
  or deleting the test — only importing one already-open helper export in place of a
  retyped local constant — so the citation does not bar it.
- Coverage drift check: this finding does not claim any behaviour is untested; it is
  about a duplicated fixture literal inside an existing test.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at the cited lines (b0307:2-12 imports SEAM_NOOP_CHECKPOINT/RecordingMutator/SITE/… from invoke-seam-scaffold; b0307:105-108 `const NOOP_SINK: ToolLoweringSink`; scaffold :46-49 `export const SEAM_NOOP_SINK`), a mktemp sed-extract diff of the two method bodies is empty, the local is live (`sink: NOOP_SINK` :131) and the file is green (2/2); stated searches reproduce (docs/bugs NOOP_SINK → 0; coverage-matrix → 0; bug 0307 doc cites the file at :186/:197 but no merge/rename/delete is proposed; `SEAM_NOOP_SINK` in tests/ has grown to 18 hits / 10 files, drift upward only); not a *gate* file, no recording behaviour, D7 copy-paste-fixture class under tests/ with the helper module already open in the same import statement. Not a duplicate: PTQ-0529 (resolved) inventoried nine b0307 helpers and never named a sink (grep -i sink → 0); PTQ-0844 lists b0307:1 only as the RecordingMutator contrast example and targets b0316's copies; PTQ-0822/0895/0898/0937 track the same shape on disjoint files (tool-calls-off-surface-live-wiring, params-default-unresolvable-enum-variant, b0399, inbound-union-arm-dispatch); same-wave sibling d7-02-queryconfig covers `queryConfig()` not the sink. Fix is a mechanical one-name import (triage: claude-fable-5-1)
