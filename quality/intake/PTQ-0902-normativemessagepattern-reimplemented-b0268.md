---
id: PTQ-0902
title: b0268 restates compose-workspace-harness.ts's normativeMessagePattern body instead of delegating to it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake
verdict: questionable
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0268-load-note-path-spelling-single-convention.test.ts:12-19
  - tests/b0268-load-note-path-spelling-single-convention.test.ts:135-152
  - tests/helpers/compose-workspace-harness.ts:267-281
  - tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:14-14
  - tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:204-206
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 2
---

# b0268 restates compose-workspace-harness.ts's normativeMessagePattern body instead of delegating to it

## Observation
tests/b0268-load-note-path-spelling-single-convention.test.ts imports six
symbols (`allDiagnostics`, `describeNotes`, `noteDiagnostics`, `requireDriven`,
`runLoadPass`, the `LoadPass` type) from `tests/helpers/compose-workspace-harness.ts`
in one statement, but declares its own module-scope `normativeMessagePattern`
function rather than importing the identically-named, identically-bodied
export that same module already carries. The local version differs from the
canonical export only in that it reads the module-scope `REGISTRY` constant
directly instead of taking a `registry` parameter, and its thrown message
names the parse-only registry page instead of "the docs/spec_topics/diagnostics/
registry pages". Sibling file tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts,
which imports from the same module, keeps a local `normativeMessagePattern`
wrapper too, but that wrapper's one-line body calls the imported
`normativeMessagePatternCore` rather than re-deriving its contents.

## Evidence

tests/b0268-load-note-path-spelling-single-convention.test.ts:12-19 — the
existing import statement, `normativeMessagePattern` absent from it (re-read
immediately before filing):
```ts
import {
  allDiagnostics,
  describeNotes,
  noteDiagnostics,
  requireDriven,
  runLoadPass,
  type LoadPass,
} from "./helpers/compose-workspace-harness";
```

tests/b0268-load-note-path-spelling-single-convention.test.ts:135-152 — the
local reimplementation, full body:
```ts
/**
 * The row's normative *Message* (DIAG-4), as a regex with the `<placeholder>`
 * slots opened up. Throws naming the registry page when the row is absent, so
 * registry drift cannot degrade a presence assertion into a comparison against
 * `undefined`.
 */
function normativeMessagePattern(code: string): RegExp {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row ` +
        `for ${code} — the DIAG-4 column is this file's only message oracle, so a missing ` +
        `row is a harness failure, never a skip`,
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}
```

tests/helpers/compose-workspace-harness.ts:267-281 — the canonical export,
same computation, parameterised on `registry` instead of closing over a
module-scope constant (re-read immediately before filing):
```ts
export function normativeMessagePattern(
  registry: readonly { readonly code: string; readonly message: string }[],
  code: string,
): RegExp {
  const message = registryMessage(registry, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      "harness: the docs/spec_topics/diagnostics/ registry pages carry no Message row for " +
        `${code} — the DIAG-4 column is this file's only message oracle, so a missing row ` +
        "is a harness failure, never a skip",
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}
```

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:14 and
:204-206 — the sibling file's own local wrapper, importing the canonical
function under an alias and delegating to it instead of restating its body:
```ts
  normativeMessagePattern as normativeMessagePatternCore,
```
```ts
function normativeMessagePattern(code: string): RegExp {
  return normativeMessagePatternCore(REGISTRY, code);
}
```

Exact search: `grep -rl "normativeMessagePattern" tests/*.test.ts` → 10 files.
Of those, `grep -n "normativeMessagePatternCore\|normativeMessagePattern(REGISTRY" <file>`
shows b0275, b0280, b0320-tools-entry-extension-rule-unenforced and
grandchild-callee-drop-un-registers-depth-two-caller each define a
one-line delegating wrapper; callee-post-parse-errors-un-register-tools-caller
and callee-tools-missing-theta-path-un-registers-tools-caller call the
imported function directly with no local wrapper at all; only
tests/b0268-load-note-path-spelling-single-convention.test.ts (already
importing six other symbols from the same module) restates the function's
full body rather than delegating or importing it directly. (The remaining two
hits, lex-drop-single-delivery.test.ts and thetalib-reparse-walk-single-delivery.test.ts
and shared-subtree-judged-once-per-pass-not-once-per-path.test.ts, do not
import from tests/helpers/compose-workspace-harness.ts at all and are outside
this finding's claim, which is only about a file that already imports from
that module for other symbols.)

## Why this is a problem
tests/helpers/compose-workspace-harness.ts's own header states it centralises
functions "several sibling composition-root test files redeclared byte-for-
byte (or near so — an interpolated bug number, an added timing field) rather
than imported," and names `normativeMessagePattern` by name as one of the
functions it centralises. b0268 already imports six other symbols from this
exact module in one statement two lines above its own reimplementation, so
the omission is not a missing dependency edge but a restated body sitting
beside an existing import of the same module. Four sibling files that also
import from this module solve the identical need with a one-line delegating
wrapper (or a direct call); b0268 is the one file that instead keeps a second,
independently-maintained copy of the same message-pattern computation.

## Suggested direction (non-binding, optional)
tests/helpers/compose-workspace-harness.ts already exports
`normativeMessagePattern(registry, code)`; b0268's own `REGISTRY` constant
(a `RegistryRow[]` with `code`/`message` fields) satisfies that export's
parameter shape directly, so the local function could call the imported one
with `REGISTRY` the way tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts
already does.

## False-positive check
- Gate-pin check: tests/b0268-load-note-path-spelling-single-convention.test.ts
  does not match `*gate*.test.ts` or the named kin; the cited lines are a
  message-pattern helper, not a pinned count or inventory assertion.
- Recording-double check: `normativeMessagePattern` builds a `RegExp` from a
  registry lookup; it backs no recording double and no "never called"
  witness. Not applicable.
- docs/bugs/ signature search: `grep -n "Status" docs/bugs/0268-*.md` →
  docs/bugs/0268-load-notes-render-same-file-with-mixed-path-separators.md,
  "fixed (0.265.0)". `npx vitest run tests/b0268-load-note-path-spelling-single-convention.test.ts`
  → 2 passed (2) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0268-load-note-path-spelling-single-convention" docs/reference/coverage-matrix.md`
  → 0 hits. `grep -n "normativeMessagePattern" docs/bugs/0268-*.md` → 0 hits.
  This finding proposes no merge, rename or deletion of any test, `it()` or
  `describe()` — only that one local function could delegate to an
  already-imported-from module's export instead of restating its body — so no
  witness-list citation is disturbed.
- Overlap check against already-filed/resolved topics: PTQ-0427
  (b0268-load-note-makehost-duplicated, fixed) covers this same file's
  `makeHost`/`LoadPass`/`runLoadPass`/`requireDriven`/`noteDiagnostics`/
  `allDiagnostics`/`describeNotes` redeclarations and its own Evidence/
  Suggested-direction section explicitly carves `plantWorkspace` out as a
  legitimate local piece — it does not cite `normativeMessagePattern` or
  lines 135-152 anywhere, and the file's current state (confirmed by direct
  read) already reflects that fix: the six symbols PTQ-0427 named are now
  imported, while `normativeMessagePattern` remains the one piece that fix
  left as a local reimplementation. `grep -rl "normativeMessagePattern"
  quality/issues quality/resolved quality/intake` was inspected and no filed
  or resolved finding's Evidence cites this function in this file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all five excerpts reproduce at the cited lines (b0268 import :12-19 lacks `normativeMessagePattern`, local body :141-151, harness export :267-281, b0275 alias :14 and one-line wrapper :204-205); sed-extracted diff of the two bodies after the `REGISTRY`→`registry` substitution differs only in the throw-message wording (parse-page vs. registry-pages), computation byte-identical; the local copy is live (called :310) and predates the export (region 978670e0 2026-08-24 vs. harness c85b0239 2026-09-12) so it is an unmigrated residual, not a design choice; `grep -rl normativeMessagePattern tests/*.test.ts` → 10 reproduces, and b0268 is indeed the sole harness-importing file that restates the body (four delegate via `normativeMessagePatternCore`, three — including lex-drop-single-delivery, which the filing mislabels as a non-importer, immaterial — call the export directly; shared-subtree and thetalib-reparse-walk are the non-importers already tracked by PTQ-0695/PTQ-0716); bug doc 0268 fixed (0.265.0), test 2 passed at HEAD, coverage-matrix and bug-doc searches → 0, no merge/rename/delete proposed; all locations under tests/, D7 boilerplate-duplication class, no gate/recording-double/red-test carve-out; not a duplicate — PTQ-0427 (resolved) migrated the six other symbols and never cites :135-152, and the same-wave sibling d7-02 cites the distinct REGISTRY-read root cause (:116-133 vs. registry-oracle.ts) (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- qw20260919162231: skipped — [PTQ-0914-bug0058-bug0100-local-parse-reimplements-parsedoc.md] PTQ-0914: Replaced both local parse wrappers with shared parseDoc; all tests and assertions retained. / PTQ-0916: Reused shared REGISTRY and RegistryRow; retained local message readers as triage permits. / PTQ-0917: Strengthened the assertion to require exactly one error note, retaining diagnostic and envelope checks. / PTQ-0918: Reused plantThetaWorkspace and disposeWorkspace in both files; fixture writes unchanged. No tests deleted. Required gate passed for all four issues: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0919-assertframestointernalerror-reimplements-assertinternalerror.md] PTQ-0919: Both framing helpers delegate to assertInternalError, preserving all four checks; no tests deleted or renamed. / PTQ-0921: Reused the canonical parse-registry reader and message lookup, retaining the non-empty-message guard; no tests deleted or renamed. / PTQ-0922: Replaced the inline pi/ctx double with makeHarness; discovery assertions remain unchanged; no tests deleted or renamed. / PTQ-0926: Shared thetaInput and driveBinder across all three files, preserving per-file parsing, contexts, and fixtures; no tests deleted or renamed. Required gate passed for all four fixes: tsc clean, 689 test files and 11,586 tests passed. ||
- qw20260919170939: skipped — [PTQ-0908-registry-oracle-reimplemented-b0268.md] PTQ-0908: Already uses readRegistry(["parse"]); cited duplication no longer reproduces. No edits. / PTQ-0909: Already uses soleByFragment at all four cited call sites; local soleCollision is absent. No edits. / PTQ-0910: compose() already delegates to runProductionLoad; duplicated host doubles are absent. No edits. / PTQ-0927: Replaced local parseDeps with the shared import and removed unused types. All tests and assertions retained. Required gate passed: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0928-detach-throw-harness-reimplements-supersessionharness.md] PTQ-0928: Reused shared supersession/base harnesses; preserved quiesce pass attribution and note recording. All assertions retained. / PTQ-0933: Migrated b0282 and triage-listed b0277 fixture builders to loadRowFromBody/loadRowFromParam; fixture paths and assertions unchanged. / PTQ-0934: Imported shared render in b0368 and triage-listed b0369; removed identical local copies without changing assertions. / PTQ-0937: Imported shared reportOf at both sites; preserved exact failure wording through an optional fixture label. No tests deleted. Exact verification gate passed: TypeScript and all 689 test files / 11,586 tests. || [PTQ-0938-requirepath-precondition-pair-duplicated.md] PTQ-0938: Centralized both path checks across all 12 callers, preserving check order and failure wording; no tests deleted. / PTQ-0939: Migrated all three triaged message readers to canonical registry helpers, retaining expected messages and adding placeholder-presence checks; no tests deleted. / PTQ-0942: Replaced the local reportOf with the canonical import, preserving narrowing and failure wording; no tests deleted. / PTQ-0945: Replaced the duplicate four-page registry read with shared REGISTRY and removed unused imports and type; no tests deleted. Required gate passed for all fixes: tsc and 11,586 tests across 689 files; git diff --check clean. ||
