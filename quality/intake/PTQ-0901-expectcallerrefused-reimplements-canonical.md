---
id: PTQ-0901
title: callee-post-parse-errors and callee-tools-missing-theta-path each redeclare a local expectCallerRefused byte-identical to the canonical expectCallerRefusedWithCalleeHasErrors they already import alongside
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake
verdict: questionable
locations:                   # every cited site, repo-relative path:line-range
  - tests/callee-post-parse-errors-un-register-tools-caller.test.ts:330-350
  - tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:353-374
  - tests/helpers/compose-workspace-harness.ts:291-311
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 2
---

# callee-post-parse-errors and callee-tools-missing-theta-path each redeclare a local expectCallerRefused byte-identical to the canonical expectCallerRefusedWithCalleeHasErrors they already import alongside

## Observation
Both `tests/callee-post-parse-errors-un-register-tools-caller.test.ts` and
`tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts`
declare a module-scope function `expectCallerRefused(pass, callerPath,
callerName)` whose three-step body (assert `callerName` absent from
`pass.registered`; filter `allDiagnostics(pass.notes)` for an error-severity,
caller-located `CALLEE_HAS_ERRORS_CODE` row; assert that row's message
matches `normativeMessagePattern`) is identical between the two files apart
from one string-concatenation-style difference in the first failure message.
Both files already import `allDiagnostics`, `describeNotes`,
`normativeMessagePattern` and `requireDriven` from
`tests/helpers/compose-workspace-harness.ts` in the same import statement,
and that module already exports a function doing the same three-step check —
`expectCallerRefusedWithCalleeHasErrors` — parameterised over the code,
message pattern and entry-noun instead of hard-coding
`CALLEE_HAS_ERRORS_CODE`. Neither file imports that exported function.

## Evidence

tests/callee-post-parse-errors-un-register-tools-caller.test.ts:330-350:
```ts
function expectCallerRefused(pass: LoadPass, callerPath: string, callerName: string): void {
  expect(
    pass.registered,
    `the caller must not register over a callee this pass un-registers\n${describeNotes(pass.notes)}`,
  ).not.toContain(callerName);

  const callerRows = allDiagnostics(pass.notes).filter(
    (d) =>
      d.code === CALLEE_HAS_ERRORS_CODE &&
      d.severity === "error" &&
      normalisePath(d.file ?? "") === callerPath,
  );
  expect(
    callerRows.length,
    `error-severity ${CALLEE_HAS_ERRORS_CODE} rows located at the caller's file: ` +
      `${callerRows.length}\n${describeNotes(pass.notes)}`,
  ).toBeGreaterThanOrEqual(1);
  expect((callerRows[0] as Diagnostic).message, `${CALLEE_HAS_ERRORS_CODE} message`).toMatch(
    normativeMessagePattern(REGISTRY, CALLEE_HAS_ERRORS_CODE),
  );
}
```

tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:353-374
— identical body, differing only in how the first message string is built
(template literal vs `"..." + describeNotes(...)`):
```ts
function expectCallerRefused(pass: LoadPass, callerPath: string, callerName: string): void {
  expect(
    pass.registered,
    "the caller must not register over a callee this same pass un-registers\n" +
      describeNotes(pass.notes),
  ).not.toContain(callerName);

  const callerRows = allDiagnostics(pass.notes).filter(
    (d) =>
      d.code === CALLEE_HAS_ERRORS_CODE &&
      d.severity === "error" &&
      normalisePath(d.file ?? "") === callerPath,
  );
  expect(
    callerRows.length,
    `error-severity ${CALLEE_HAS_ERRORS_CODE} rows located at the caller's file: ` +
      `${callerRows.length}\n${describeNotes(pass.notes)}`,
  ).toBeGreaterThanOrEqual(1);
  expect((callerRows[0] as Diagnostic).message, `${CALLEE_HAS_ERRORS_CODE} message`).toMatch(
    normativeMessagePattern(REGISTRY, CALLEE_HAS_ERRORS_CODE),
  );
}
```

tests/helpers/compose-workspace-harness.ts:291-311 — the already-exported
canonical of the same three-step check, taking the code/pattern/noun as
parameters instead of a module-scope constant:
```ts
export function expectCallerRefusedWithCalleeHasErrors(
  pass: LoadPass,
  callerPath: string,
  callerStem: string,
  code: string,
  messagePattern: RegExp,
  entryNoun: string,
): void {
  expect(
    pass.registered,
    "the caller must not register over a callee this same pass un-registers\n" +
      describeNotes(pass.notes),
  ).not.toContain(callerStem);

  const rows = errorRowsAt(pass, callerPath);
  expect(
    rows.map((d) => d.code),
    `one ${entryNoun} below this caller is one condition, so exactly one error-severity ` +
      `row belongs at ${callerPath}, and it is ${code}\n` +
      describeNotes(pass.notes),
  ).toEqual([code]);
  expect((rows[0] as Diagnostic).message, `${code} message`).toMatch(messagePattern);
}
```

Import lists confirming neither file pulls in the exported function: both
files' `from "./helpers/compose-workspace-harness"` statements list
`allDiagnostics, describeNotes, finishWorkspace, makeHost, normalisePath,
normativeMessagePattern, requireDriven, runLoadPass, type ComposeWorkspace,
type LoadPass` and stop there. Exact search: `grep -rln
"expectCallerRefusedWithCalleeHasErrors" tests/*.test.ts` → 2 hits
(`tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts`,
`tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts`),
neither of which is in this wave's scope; `grep -rln "DispatchPass"
tests/*.test.ts` is unrelated to this finding but confirms the two in-scope
files are the only declarers of their own local names in this area.

## Why this is a problem
The exact same three-step verification (not-registered, one caller-located
error row of a fixed code, message-pattern match) is typed out a second time
in each file under a locally scoped constant (`CALLEE_HAS_ERRORS_CODE`)
instead of calling the canonical, already-imported-from module's exported
function that performs the identical check parameterised over the code. A
change to the caller-refusal contract (e.g. widening the assertion from "at
least one row" to "exactly one row", which the canonical version already
does via `errorRowsAt`+`toEqual([code])` where the local copies use
`toBeGreaterThanOrEqual(1)`) would need to be applied to the shared helper
and then separately re-applied to two local copies that already diverge in
strictness from it.

## Suggested direction (non-binding, optional)
`tests/helpers/compose-workspace-harness.ts` already exports
`expectCallerRefusedWithCalleeHasErrors` for this exact three-step check,
parameterised over code/pattern/noun; the two files' own imports from that
same module are the observation that nothing blocks calling it instead of
the local copy.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin (`ls tests/*gate*.test.ts` has no match for either filename); not
  applicable.
- Recording-double check: `expectCallerRefused` reads an already-produced
  `LoadPass` built on a recording host double this finding does not touch;
  the finding claims the assertion FUNCTION's definition is duplicated, not
  that any assertion inside it is a MUST-NOT witness — the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "expectCallerRefused\|DispatchPass"
  docs/bugs/` → 0 hits; this finding does not allege a red or disabled test.
- coverage-matrix/bug-doc citation search: `grep -n
  "callee-post-parse-errors-un-register-tools-caller\|callee-tools-missing-theta-path-un-registers-tools-caller"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename or deletion of any file, `it()` or `describe()` — only that
  the two local `expectCallerRefused` definitions could call the existing
  exported function instead of re-declaring it.
- Overlap check: `find quality -iname "*expectcallerrefused*"` before filing
  showed only the resolved `PTQ-0300-expectcallerrefused-helper-duplicated.md`,
  whose cited locations are `tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts`
  and `tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts` —
  a disjoint file pair from this wave's scope; PTQ-0300's own fix is what
  produced the exported `expectCallerRefusedWithCalleeHasErrors` this finding
  cites as the unused canonical. PTQ-0428 (resolved, "fixed") migrated these
  same two files' `makeHost`/`runLoadPass`/etc. harness onto the shared
  module but its Evidence and locations never name `expectCallerRefused`,
  so this residual was not part of that fix.
- Coverage drift: not claimed; both files' cells and their own fixture logic
  are untouched by this observation, which is scoped to one shared
  assertion helper's duplicated definition.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at :330-350, :353-374 and harness :291-311; the two local bodies are identical modulo one string-concat style, `grep -rln expectCallerRefusedWithCalleeHasErrors tests/` → exactly b0275/b0280 (+ the harness), neither in-scope file imports it or `errorRowsAt` (0 hits), stated docs/bugs and coverage-matrix searches → 0, both files pass 17/17 so not a documented red, both locations under tests/ in the D7 copy-paste-helper class with no gate/recording-double carve-out; git shows the local copies survived the PTQ-0428 migration commit 8df01c07 (2026-09-18) while the canonical has existed since d81a828d (2026-09-13, PTQ-0300's fix), and PTQ-0428/PTQ-0525/same-wave d7-01-normativemessagepattern and d7-02-dispatchpass cite different helpers so not a duplicate; two caveats for the fixer: the title's "byte-identical to the canonical" overclaims (the canonical asserts exactly `[code]` over ALL caller-located error rows via `errorRowsAt` where the local copies assert ≥1 rows of the code — though the missing-theta-path cells at :580-586/:611-617 already pin the stricter shape themselves), and an uncounted third local declarer exists at tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:368 (`.toBe(1)` variant) to fold into the location list at acceptance (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- qw20260919162231: skipped — [PTQ-0914-bug0058-bug0100-local-parse-reimplements-parsedoc.md] PTQ-0914: Replaced both local parse wrappers with shared parseDoc; all tests and assertions retained. / PTQ-0916: Reused shared REGISTRY and RegistryRow; retained local message readers as triage permits. / PTQ-0917: Strengthened the assertion to require exactly one error note, retaining diagnostic and envelope checks. / PTQ-0918: Reused plantThetaWorkspace and disposeWorkspace in both files; fixture writes unchanged. No tests deleted. Required gate passed for all four issues: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0919-assertframestointernalerror-reimplements-assertinternalerror.md] PTQ-0919: Both framing helpers delegate to assertInternalError, preserving all four checks; no tests deleted or renamed. / PTQ-0921: Reused the canonical parse-registry reader and message lookup, retaining the non-empty-message guard; no tests deleted or renamed. / PTQ-0922: Replaced the inline pi/ctx double with makeHarness; discovery assertions remain unchanged; no tests deleted or renamed. / PTQ-0926: Shared thetaInput and driveBinder across all three files, preserving per-file parsing, contexts, and fixtures; no tests deleted or renamed. Required gate passed for all four fixes: tsc clean, 689 test files and 11,586 tests passed. ||
- qw20260919170939: skipped — [PTQ-0908-registry-oracle-reimplemented-b0268.md] PTQ-0908: Already uses readRegistry(["parse"]); cited duplication no longer reproduces. No edits. / PTQ-0909: Already uses soleByFragment at all four cited call sites; local soleCollision is absent. No edits. / PTQ-0910: compose() already delegates to runProductionLoad; duplicated host doubles are absent. No edits. / PTQ-0927: Replaced local parseDeps with the shared import and removed unused types. All tests and assertions retained. Required gate passed: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0928-detach-throw-harness-reimplements-supersessionharness.md] PTQ-0928: Reused shared supersession/base harnesses; preserved quiesce pass attribution and note recording. All assertions retained. / PTQ-0933: Migrated b0282 and triage-listed b0277 fixture builders to loadRowFromBody/loadRowFromParam; fixture paths and assertions unchanged. / PTQ-0934: Imported shared render in b0368 and triage-listed b0369; removed identical local copies without changing assertions. / PTQ-0937: Imported shared reportOf at both sites; preserved exact failure wording through an optional fixture label. No tests deleted. Exact verification gate passed: TypeScript and all 689 test files / 11,586 tests. || [PTQ-0938-requirepath-precondition-pair-duplicated.md] PTQ-0938: Centralized both path checks across all 12 callers, preserving check order and failure wording; no tests deleted. / PTQ-0939: Migrated all three triaged message readers to canonical registry helpers, retaining expected messages and adding placeholder-presence checks; no tests deleted. / PTQ-0942: Replaced the local reportOf with the canonical import, preserving narrowing and failure wording; no tests deleted. / PTQ-0945: Replaced the duplicate four-page registry read with shared REGISTRY and removed unused imports and type; no tests deleted. Required gate passed for all fixes: tsc and 11,586 tests across 689 files; git diff --check clean. ||
