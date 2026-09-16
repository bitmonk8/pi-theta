---
id: PTQ-0360
title: b0347 redeclares the envelopeLine/tick/driveDeps subagent-driver harness trio that b0294 and subagent-json-driver.test.ts already carry, byte-identical apart from one comment
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts:120-146
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260915044704
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-15
---

# b0347 redeclares the envelopeLine/tick/driveDeps subagent-driver harness trio that b0294 and subagent-json-driver.test.ts already carry, byte-identical apart from one comment

## Observation
tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts declares module-scope `envelopeLine`, `tick`, and `driveDeps` functions immediately under its own section comment "(F) Subagent-leg driver harness — hand-built envelope line, mirroring b0294." tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts declares the identical three functions under the identical names, bodies, and types — byte-identical apart from one doc-comment's wording on `tick`. tests/subagent-json-driver.test.ts declares the same `envelopeLine`/`tick` pair byte-identical and a `driveDeps` of the same shape and purpose, differing only in an added default parameter and a different placeholder `calleePath` literal. Neither `tests/helpers/fake-rpc-child.ts` (the `FakeRpcChild` double all three files already import) nor any other `tests/helpers/` module exports this trio.

## Evidence

tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts:120-146 (re-read immediately before filing):
```ts
// ===========================================================================
// (F) Subagent-leg driver harness — hand-built envelope line, mirroring b0294.
// ===========================================================================

/** One hand-built `theta_result` envelope line (the child emits this on stdout). */
function envelopeLine(payload: Record<string, unknown>): string {
  return JSON.stringify({ [THETA_RESULT_KEY]: payload });
}

/** A macrotask flush so the drive reaches its stdout-read await before the line lands. */
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

tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts:101-123 (out of this wave's scope, cited as pattern context — confirmed byte-identical to the b0347 excerpt above apart from the `tick` doc comment's wording, "microtask+macrotask" vs "macrotask...before the line lands"):
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

tests/subagent-json-driver.test.ts:44-58 (out of this wave's scope, cited as pattern context — a third copy of `envelopeLine`/`tick` byte-identical to b0294's wording, with `driveDeps` carrying the same three-field shape under a different placeholder path and a diagnostic-recording body instead of a no-op):
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
```

Exact searches: `grep -rn "^function envelopeLine" tests --include="*.test.ts"` → 4 hits (b0294, b0347, subagent-json-driver.test.ts, subagent-wire-parse-failed-classifier.test.ts — the last carries only `envelopeLine`, not `tick`/`driveDeps`, since it drives a line classifier directly rather than `driveSubagentChild`). `grep -rn "^function tick" tests --include="*.test.ts"` → 3 hits (b0294, b0347, subagent-json-driver.test.ts). `grep -rn "^function driveDeps" tests --include="*.test.ts"` → 3 hits (the same three files).

## Why this is a problem
b0347's own section comment ("mirroring b0294") names its copy source directly, and a line-for-line diff against that source shows `envelopeLine` and `driveDeps` byte-identical — including the arbitrary placeholder `calleePath: "./worker.theta"`, an unforced literal that two independent authors would not coincidentally choose alike — with only `tick`'s doc comment reworded. tests/subagent-json-driver.test.ts (which predates both bug-numbered files, per `docs/bugs/0009-live-prompt-queryerror-provider-field-derivation.md`'s citation of it) carries the same pair a third time. No `tests/helpers/` module holds this trio, so each of the three files re-derives the identical "drive `driveSubagentChild` over a `FakeRpcChild`, from one hand-built envelope line, after one macrotask flush" harness in place of importing it.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting `envelopeLine`/`tick` verbatim (both already byte-identical across all three sites) plus a parameterisable `driveDeps` (varying only `calleePath` and the diagnostic sink) is the home this trio's own repetition, and its in-file "mirroring b0294" credit, already point toward.

## False-positive check
- Gate-pin check: tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts does not match `*gate*.test.ts` or the named kin; the cited lines are hand-built-envelope/driver-deps plumbing, not a pinned count or inventory assertion.
- Recording-double check: `driveDeps`'s `emitDiagnostic` is a bare no-op in b0347/b0294 and a push-into-array recorder in subagent-json-driver.test.ts, but this finding does not claim any assertion built on those recordings cannot fail — it claims the three functions' own DEFINITIONS are duplicated, a distinct claim the negative-witness carve-out does not cover.
- docs/bugs/ signature search: docs/bugs/0347-subagent-leg-propagated-mintable-invoke-infra-stays-bare.md Status "fixed (0.347.0)"; docs/bugs/0294-callee-propagated-invoke-infra-unwrapped-misattributed.md Status "fixed (0.326.0)". `npx vitest run tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts tests/subagent-json-driver.test.ts` → 57 passed (57) at HEAD, so none of the three is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0347-subagent-leg-propagated-mintable-wrapped-unit" docs/reference/coverage-matrix.md` → 0 hits. `grep -rl "b0294-callee-propagated-invoke-infra-wrapped-unit\|subagent-json-driver" docs/bugs/*.md` shows both cited in other bugs' witness lists (docs/bugs/0295, docs/bugs/0347 itself, and docs/bugs/0009 respectively) — this finding proposes no merge, rename, or deletion of any of the three files or their `it()`/`describe()` blocks, only that three small helper functions could be imported rather than redeclared, so none of those citations is disturbed.
- Scope note: tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts and tests/subagent-json-driver.test.ts are outside this wave's six-file scope; both are cited only as pattern context confirming the duplication's extent, not as additional reviewed locations — mirroring the already-resolved PTQ-0344's own in-scope/pattern-context boundary for this same pair of sibling files (which covered a different, non-overlapping scaffold group: `SEAM_NOOP_CHECKPOINT`/`SEAM_NOOP_SINK`/`SEAM_NOOP_MUTATOR`/`span`/`RecordedHop`, already migrated to `tests/helpers/invoke-seam-scaffold.ts` and imported at this file's own lines 100-106 — confirmed distinct from the `envelopeLine`/`tick`/`driveDeps` trio cited here, which PTQ-0244/PTQ-0344 did not mention).
- Coverage check: this finding does not claim a missing test path; every cited function is exercised by the three files' own currently-passing tests (confirmed above). The claim is confined to a repeated DEFINITION, not to test behaviour or coverage.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced: b0347:120-146's envelopeLine/tick/driveDeps are byte-identical to b0294:101-123 (only tick's doc comment differs) and same-shape to subagent-json-driver.test.ts:44-58 (driveDeps differs only by an added default param + calleePath literal); grep counts (4/3/3) and the tests/helpers/ absence both reproduce exactly, docs/bugs 0294/0347 are fixed with all 57 tests passing at HEAD, coverage-matrix has 0 hits for the b0347 file, and PTQ-0344 (confirmed, same host file) covers a distinct non-overlapping SEAM_NOOP/span/RecordedHop scaffold — no duplicate on record (triage: claude-opus-5)
