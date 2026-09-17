---
id: PTQ-0512
title: subagent-json-driver.test.ts redeclares the envelopeLine/tick/driveDeps trio that tests/helpers/subagent-json-driver-harness.ts's own header names it as still carrying
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-json-driver.test.ts:43-62
  - tests/helpers/subagent-json-driver-harness.ts:1-47
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# subagent-json-driver.test.ts redeclares the envelopeLine/tick/driveDeps trio that tests/helpers/subagent-json-driver-harness.ts's own header names it as still carrying

## Observation
`tests/subagent-json-driver.test.ts` declares module-scope `envelopeLine`
(builds one hand-built `theta_result` envelope line) and `tick` (a
macrotask flush) functions whose bodies are byte-identical to the exports of
the same names in `tests/helpers/subagent-json-driver-harness.ts`, plus a
`driveDeps` builder of the identical shape (differing only in the literal
`calleePath` value and in recording emitted diagnostics into a caller-owned
array rather than a no-op). The helper module's own header explicitly names
this file as one of the two sites its extraction did not migrate.

## Evidence
tests/subagent-json-driver.test.ts:43-62 (in scope):
```ts
/** One hand-built `theta_result` envelope line (the child emits this on stdout). */
function envelopeLine(payload: Record<string, unknown>): string {
  return JSON.stringify({ [THETA_RESULT_KEY]: payload });
}

/** A microtask+macrotask flush so the drive reaches its stdout-read await. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function driveDeps(child: SubagentChildProcess, thetaAbort: AbortController, emitted: Diagnostic[] = []) {
  return {
    child,
    thetaAbort,
    calleePath: "/theta/child.theta",
    emitDiagnostic: (d: Diagnostic): void => {
      emitted.push(d);
    },
  };
}
```

tests/helpers/subagent-json-driver-harness.ts:1-47 (the canonical module, header naming this file directly):
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

`envelopeLine` and `tick` are byte-for-byte identical between the two files
(re-read immediately before filing); `driveDeps` matches the helper's
dependency-object shape (`child`, `thetaAbort`, `calleePath`,
`emitDiagnostic`) but names a different literal path
(`/theta/child.theta` vs `./worker.theta`) and threads a caller-supplied
`emitted` array into `emitDiagnostic` instead of the helper's no-op.

Exact search: `grep -rln "^function envelopeLine" tests --include="*.test.ts"`
→ 3 hits (`tests/subagent-json-driver.test.ts`,
`tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts`,
`tests/subagent-wire-parse-failed-classifier.test.ts`, the last carrying
only `envelopeLine`). `grep -rln "^function tick" tests --include="*.test.ts"`
→ 2 hits (`tests/subagent-json-driver.test.ts`,
`tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts`).
`grep -n "subagent-json-driver-harness" tests/subagent-json-driver.test.ts`
→ 0 hits (this file imports nothing from the canonical module).

## Why this is a problem
`tests/helpers/subagent-json-driver-harness.ts` was authored specifically to
centralise this exact trio, and its own header text names
`tests/subagent-json-driver.test.ts` directly as one of two files whose copy
the extraction pass did not migrate. The file in this review's scope is that
named, still-unmigrated copy: a reader who finds the canonical helper and
searches for who else needs this shape has no signal from
`subagent-json-driver.test.ts` itself that a shared module already exists
next door under the identical export names for two of the three functions.

## Suggested direction (non-binding, optional)
`tests/helpers/subagent-json-driver-harness.ts` already exports
`envelopeLine`/`tick` under the identical names this file redeclares, and a
`driveDeps` of the identical shape; the helper's own header names this file
as the site the earlier extraction did not reach.

## False-positive check
- Gate-pin check: this file does not match `*gate*.test.ts` or the named
  gate kin; the cited lines are hand-built-envelope/driver-deps plumbing,
  not a pinned count or inventory assertion.
- Recording-double check: `driveDeps`'s `emitDiagnostic` records into a
  caller-supplied array consumed by later assertions in this file (e.g. "a
  child that exits WITHOUT an envelope maps fail-closed...", which asserts
  on `emitted.map((d) => d.code)`), a forward positive-witness use, not a
  MUST-NOT-call negative witness; the recording-double carve-out does not
  apply to the claim that the DEFINITION is duplicated.
- docs/bugs/ signature search: `grep -rn "subagent-json-driver.test.ts"
  docs/bugs/*.md` → no hits; not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "subagent-json-driver.test.ts" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` block — only that two (of three) helper functions
  could be imported rather than redeclared, and the third aligned with the
  existing shape — so no citation is affected.
- Overlap check: `qw20260917154546-d7-02-b0294-unit-driver-harness-not-migrated.md`
  (already filed this wave) makes the equivalent claim against
  `tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts`, a
  different, out-of-this-review's-scope file; that finding's own evidence
  quotes the same helper header naming `tests/subagent-json-driver.test.ts`
  as the second unmigrated site, which is the file this finding targets —
  the two findings are the same root-cause pattern applied to two distinct,
  named files, not a duplicate of each other.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every cited function already backs this file's own
  currently-passing tests.

## Triage
verdict: confirmed — independently reproduced: envelopeLine/tick bodies at tests/subagent-json-driver.test.ts:43-51 diff byte-identical against tests/helpers/subagent-json-driver-harness.ts:21-29 (only tick's doc comment differs), driveDeps :53-62 matches the helper's four-field shape (differing by calleePath literal and a recording sink fed at :109/:207), grep counts 3/2 reproduce, the file has zero helper imports and b0347 is the helper's sole importer; not a duplicate — resolved PTQ-0360 located only b0347 and its fix's header explicitly left this file unmigrated (same residual-copy pattern PTQ-0301 confirmed after PTQ-0244), intake sibling d7-02 targets b0294; bug 0009 is fixed and cites the file without any test the finding would merge/rename/delete, coverage-matrix 0 hits (triage: claude-fable-5-1)
