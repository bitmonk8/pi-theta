---
id: PTQ-0528
title: b0294-unit redeclares the envelopeLine/tick/driveDeps subagent-driver harness that tests/helpers/subagent-json-driver-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts:101-122
  - tests/helpers/subagent-json-driver-harness.ts:1-47
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0294-unit redeclares the envelopeLine/tick/driveDeps subagent-driver harness that tests/helpers/subagent-json-driver-harness.ts already exports

## Observation
tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts declares,
module scope, an `envelopeLine` function, a `tick` macrotask-flush function,
and a `driveDeps` builder sized to `driveSubagentChild`'s dependency shape —
the trio used to drive `driveSubagentChild` over a `FakeRpcChild` from one
hand-built `theta_result` envelope line. `tests/helpers/subagent-json-driver-harness.ts`
already exports all three under the identical names with the identical (or,
for `tick`, a reworded-comment-only) bodies, and its own header states it was
built to centralise this exact trio, naming this file directly as one of the
two still-unmigrated copies at authoring time ("`tests/subagent-json-driver.test.ts`
each still declare locally (unmigrated; outside this module's current
scope)" — the header's own antecedent is
`tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts`, named one
sentence earlier). This test file imports nothing from the helper.

## Evidence

tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts:101-122 (re-read immediately before filing):
```ts
/** One hand-built `theta_result` envelope line (the child emits this on stdout). */
function envelopeLine(payload: Record<string, unknown>): string {
  return JSON.stringify({ [THETA_RESULT_KEY]: payload });
}

/** A microtask+macrotask flush so the drive reaches its stdout-read await. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function driveDeps(child: SubagentChildProcess, thetaAbort: AbortController): {
  child: SubagentChildProcess;
  thetaAbort: AbortController;
  calleePath: string;
  emitDiagnostic: (d: Diagnostic) => void;
} {
  return {
    child,
    thetaAbort,
    calleePath: "./worker.theta",
    emitDiagnostic: (): void => {},
  };
}
```

tests/helpers/subagent-json-driver-harness.ts:1-47 — the canonical exports (header naming this file):
```ts
// WHY THIS FILE EXISTS. `tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts`
// declared its own module-scope `envelopeLine` / `tick` pair and a `driveDeps`
// builder sized to `driveSubagentChild`'s own dependency shape, byte-identical
// (bar one doc-comment wording) to the copy
// `tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts` and
// `tests/subagent-json-driver.test.ts` each still declare locally (unmigrated;
// outside this module's current scope). This module centralises that trio for
// the former file; ...

/** One hand-built `theta_result` envelope line (the child emits this on stdout). */
export function envelopeLine(payload: Record<string, unknown>): string {
  return JSON.stringify({ [THETA_RESULT_KEY]: payload });
}

/** A macrotask flush so the drive reaches its stdout-read await before the line lands. */
export function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** `driveSubagentChild`'s dependency shape, sized for a single hand-built-envelope drive. */
export function driveDeps(
  child: SubagentChildProcess,
  thetaAbort: AbortController,
): {
  child: SubagentChildProcess;
  thetaAbort: AbortController;
  calleePath: string;
  emitDiagnostic: (d: Diagnostic) => void;
} {
  return {
    child,
    thetaAbort,
    calleePath: "./worker.theta",
    emitDiagnostic: (): void => {},
  };
}
```

Exact searches: `grep -rln "^function envelopeLine" tests --include="*.test.ts"`
→ 3 hits (this file, tests/subagent-json-driver.test.ts,
tests/subagent-wire-parse-failed-classifier.test.ts — the last carries only
`envelopeLine`, not `tick`/`driveDeps`). `grep -rln "^function tick" tests --include="*.test.ts"`
→ 2 hits (this file, tests/subagent-json-driver.test.ts).
`grep -rln "^function driveDeps" tests --include="*.test.ts"` → 2 hits (the
same two files). `grep -n "subagent-json-driver-harness" tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts`
→ confirms that sibling file already imports the shared module instead of
declaring the trio locally.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: `tests/helpers/subagent-json-driver-harness.ts`
exports the identical `envelopeLine`/`tick`/`driveDeps` trio this file
declares locally, and the helper's own header — written when this exact
duplication (PTQ-0360, confirmed/fixed) was resolved for the sibling
b0347 file — names this file's copy directly as one of the two remaining
unmigrated instances. The migration that created the helper and updated
b0347 to import it (confirmed by the grep above) did not touch this file,
which is now in this wave's scope and still carries its own copy.

## Suggested direction (non-binding, optional)
`tests/helpers/subagent-json-driver-harness.ts` already exports this exact
three-symbol trio under the identical names, and its own header names this
file as one of the two sites the extraction did not yet reach; it is the
existing home this file's (F)-section harness could import instead of
redeclaring.

## False-positive check
- Gate-pin check: this file does not match `*gate*.test.ts` or the named
  kin; the cited lines are hand-built-envelope/driver-deps plumbing, not a
  pinned count or inventory assertion.
- Recording-double check: `driveDeps`'s `emitDiagnostic` is a bare no-op in
  this file, but this finding does not claim any assertion built on it
  cannot fail — it claims the three functions' own DEFINITIONS are
  duplicated, a distinct claim the negative-witness carve-out does not
  cover.
- docs/bugs/ signature search: docs/bugs/0294-callee-propagated-invoke-infra-unwrapped-misattributed.md
  Status "fixed (0.326.0)" — not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0294-callee-propagated-invoke-infra-wrapped-unit" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of the file
  or any `it()`/`describe()` block — only that three small helper functions
  could be imported rather than redeclared — so no citation is affected.
- Overlap check against already-filed/resolved topics: PTQ-0360 ("b0347
  redeclares the envelopeLine/tick/driveDeps... that b0294 and
  subagent-json-driver.test.ts already carry") is the closest prior finding;
  its own scope note states tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts
  "is outside this wave's six-file scope; cited only as pattern context." The
  fix that resolved PTQ-0360 created the helper module and migrated b0347
  only (confirmed by grep above); this file is the residual that finding's
  own text declined to claim, the same "fix landed elsewhere, this file was
  left out of scope" shape already accepted at PTQ-0228/PTQ-0301.
- Coverage check: the claim is about a repeated DEFINITION, not a missing
  test path; every cited function is exercised by this file's own
  currently-passing tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced: b0294-unit:101-122's envelopeLine/tick/driveDeps match tests/helpers/subagent-json-driver-harness.ts:21-47's exports byte-for-byte (only tick's doc comment differs), the helper's header names b0294-unit as an unmigrated copy, b0294-unit's sole helpers/ import is fake-rpc-child (line 76) while b0347:74 already imports the trio from the helper; grep counts 3/2/2 reproduce exactly; the helper's creating commit 22c61f58 never touched b0294-unit (its last change is 859a2a33); docs/bugs/0294 is fixed (0.326.0), coverage-matrix has 0 hits, and no merge/rename/delete is proposed so the 0295/0347 witness-list citations are undisturbed; PTQ-0360 (resolved) scoped itself to b0347 only and the sibling intake candidate d7-01-subagent-json-driver-envelopeline-tick-not-migrated targets a different file's copy — same accepted residual shape as PTQ-0228/PTQ-0301, no duplicate on record (triage: claude-fable-5-1)
