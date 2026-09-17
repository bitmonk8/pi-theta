---
id: PTQ-0711
title: subagent-wire-parse-failed-emitter.test.ts redeclares the driveOver fake-child harness that tests/helpers/fake-json-child.ts now exports for exactly this reason
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-wire-parse-failed-emitter.test.ts:154-165
  - tests/helpers/fake-json-child.ts:309-326
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# subagent-wire-parse-failed-emitter.test.ts redeclares the driveOver fake-child harness that tests/helpers/fake-json-child.ts now exports for exactly this reason

## Observation
`tests/subagent-wire-parse-failed-emitter.test.ts` declares a module-scope
`driveOver(child, thetaAbort, emitted)` function whose body constructs one
`driveSubagentChild({ child, thetaAbort, calleePath: "/theta/child.theta",
emitDiagnostic })` call, under a comment stating "Drive harness (mirrors
tests/subagent-json-wire.test.ts)." `tests/helpers/fake-json-child.ts`
already exports a `driveOver(child, thetaAbort, emitted, calleePath)`
function with the identical body (parameterised by `calleePath` instead of
hard-coding it), whose own doc comment states it exists because "several
`subagent-*` test files (this repo's `driveOver` fake-child harness)
declared [it] verbatim." The in-scope file already imports `FakeJsonChild`
from that same helper module but does not import `driveOver` from it.

## Evidence

tests/subagent-wire-parse-failed-emitter.test.ts:154-165 (re-read
immediately before filing):
```ts
function driveOver(
  child: FakeJsonChild,
  thetaAbort: AbortController,
  emitted: Diagnostic[],
): ReturnType<typeof driveSubagentChild> {
  return driveSubagentChild({
    child,
    thetaAbort,
    calleePath: "/theta/child.theta",
    emitDiagnostic: (d) => emitted.push(d),
  });
}
```
(imported at line 75: `import { FakeJsonChild } from "./helpers/fake-json-child";` —
the same module that exports the canonical `driveOver` below, but that
export is not named in the import.)

tests/helpers/fake-json-child.ts:309-326 — the already-exported canonical
equivalent (re-read immediately before filing):
```ts
/**
 * Drive a `FakeJsonChild` through the real `driveSubagentChild`, recording every
 * diagnostic it emits into `emitted`. The small wrapper several `subagent-*`
 * test files (this repo's `driveOver` fake-child harness) declared verbatim.
 */
export function driveOver(
  child: FakeJsonChild,
  thetaAbort: AbortController,
  emitted: Diagnostic[],
  calleePath: string,
): ReturnType<typeof driveSubagentChild> {
  return driveSubagentChild({
    child,
    thetaAbort,
    calleePath,
    emitDiagnostic: (d) => emitted.push(d),
  });
}
```

A sibling file, `tests/b0258-envelope-parse-failed-line-summary-cr.test.ts`,
already imports the canonical export under an alias
(`import { driveOver as driveOverChild, FakeJsonChild } from
"./helpers/fake-json-child";`) and its own local `driveOver` is a one-line
forwarding call (`return driveOverChild(child, thetaAbort, emitted,
CALLEE);`) rather than a re-derivation, demonstrating the canonical helper
is reachable and sufficient for this exact shape. A second sibling,
`tests/subagent-json-wire.test.ts:35-45`, still redeclares the same body the
in-scope file mirrors (`calleePath: "/theta/child.theta"` hard-coded, no
import from the helper), cited here only as pattern context outside this
review's scope.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: a double-driving harness is
re-implemented in the in-scope file even though the canonical helper for
exactly this shape — `tests/helpers/fake-json-child.ts`'s `driveOver` — was
added specifically because this same body had already been "declared
verbatim" across several `subagent-*` test files (the helper's own doc
comment). The in-scope file already imports a sibling export
(`FakeJsonChild`) from the same module, so importing `driveOver` alongside
it is not a new dependency.

## Suggested direction (non-binding, optional)
The nine `driveOver(child, abort, emitted)` call sites in this file could
call the imported canonical `driveOver(child, abort, emitted,
"/theta/child.theta")` directly, the same forwarding shape
`tests/b0258-envelope-parse-failed-line-summary-cr.test.ts` already uses,
removing the local redeclaration entirely.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named
  kin; the cited lines are a drive-harness wrapper function, not a pinned
  count or inventory assertion.
- Recording-double check: `emitted` is a recording array used to assert on
  diagnostics that WERE emitted (positive read-back), not a MUST-NOT witness;
  the negative-witness carve-out does not apply, and this finding is about
  the wrapper function's re-derivation, not about the legitimacy of using a
  fake child at all.
- docs/bugs/ signature search: `grep -rl "driveOver" docs/bugs/*.md` → 0
  hits; bug 0086 (this file's governing doc) does not call for a per-file
  re-derivation of the drive harness.
- coverage-matrix/bug-doc citation search: `grep -n
  "subagent-wire-parse-failed-emitter" docs/reference/coverage-matrix.md` →
  0 hits. This finding proposes no merge, rename, or deletion of the file or
  any `describe`/`it` block — only that the nine call sites could bind to
  the already-exported canonical `driveOver` instead of a local
  redeclaration.
- Overlap check: two prior, now-resolved findings on this same root cause
  exist — `quality/resolved/PTQ-0211-driveover-harness-duplication.md` and
  `quality/resolved/PTQ-0360-b0347-envelope-driver-harness-duplicated.md` —
  but both predate the canonical helper's addition to
  `tests/helpers/fake-json-child.ts` (PTQ-0211's own fix is the likely origin
  of that export, per its doc comment naming exactly this repetition) and
  both were filed against different files
  (`tests/b0258-envelope-parse-failed-line-summary-cr.test.ts` /
  `tests/b0347-*`). Neither prior finding's `locations` cites
  `tests/subagent-wire-parse-failed-emitter.test.ts`, and no open
  intake candidate names it for this root cause
  (`grep -rl "driveOver" quality/intake/*.md` → no hits before this filing).
- Coverage-drift check: the claim is about a repeated harness-function
  DEFINITION, not a missing test path; every call site cited is exercised by
  the file's own passing tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced: the local driveOver at tests/subagent-wire-parse-failed-emitter.test.ts:154-165 is body-identical (calleePath literal vs parameter) to the export at tests/helpers/fake-json-child.ts:314-326, from which line 75 already imports FakeJsonChild; git shows the helper export landed in PTQ-0211's fix commit 2594cd44, which migrated only b0258 (now a one-line forward to driveOverChild) and never touched this file, so this is a genuinely un-migrated residual copy of the kind PTQ-0228/PTQ-0240/PTQ-0301 established as distinct from the originating finding rather than a duplicate of resolved PTQ-0211; searches re-run — 0 driveOver hits in docs/bugs, 0 coverage-matrix hits for the file, bug 0086 cites it only as a vitest run command, no other intake candidate names this root cause; 10/10 tests pass and no merge/rename/delete is proposed, so no D7 carve-out applies (only nit: 10 call sites at lines 184-371, not nine — confined to the non-binding direction paragraph) (triage: claude-fable-5-1)
