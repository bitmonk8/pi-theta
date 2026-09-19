---
id: PTQ-0753
title: registers() in inline-object-malformed-entry-resync.test.ts re-derives the predicate tests/helpers/e2e-s1.ts already exports as isLoadParseError
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-object-malformed-entry-resync.test.ts:312-332
  - tests/helpers/e2e-s1.ts:87-97
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# registers() in inline-object-malformed-entry-resync.test.ts re-derives the predicate tests/helpers/e2e-s1.ts already exports as isLoadParseError

## Observation
tests/inline-object-malformed-entry-resync.test.ts declares a local
`registers(doc: ThetaDocument): boolean` whose body is
`!doc.diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")))`.
tests/helpers/e2e-s1.ts — the module this same file already imports `parseDoc`
from — exports `isLoadParseError(d: Diagnostic): boolean`, the identical
single-diagnostic predicate (`d.severity === "error" && (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/"))`).
`registers(doc)` is exactly `!doc.diagnostics.some(isLoadParseError)`.

## Evidence

tests/inline-object-malformed-entry-resync.test.ts:312-332 (re-read immediately before filing):
```ts
/**
 * `hasLoadParseError`'s predicate (src/extension/production-composition.ts),
 * restated over a parsed document: a theta registers unless some diagnostic is
 * an error-severity `theta/load/*` or `theta/parse/*`. Group (D)'s d1 is the
 * one row of this report where that predicate is TRUE at HEAD.
 *
 * This departs, deliberately, from the bug doc's §Observed-at reading of
 * "registers" as `frontmatter !== null`: post-fix, d1's frontmatter is
 * non-null with one body diagnostic, so the doc's reading would still call
 * d1 registered while this predicate does not. The production predicate is
 * the one that matters here — it is what decides whether the theta is kept
 * or dropped at load, which is what §Fix (f)'s "lose their loads-cleanly
 * status" is about.
 */
function registers(doc: ThetaDocument): boolean {
  return !doc.diagnostics.some(
    (d: Diagnostic) =>
      d.severity === "error" &&
      (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
  );
}
```

tests/helpers/e2e-s1.ts:87-97 (re-read immediately before filing), the
exported single-diagnostic form of the same predicate:
```ts
/**
 * True iff `d` is the error-severity `theta/load/*` or `theta/parse/*` refusal
 * that blocks registration (mirrors `hasLoadParseError`,
 * src/extension/production-composition.ts).
 */
export function isLoadParseError(d: Diagnostic): boolean {
  return (
    d.severity === "error" &&
    (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/"))
  );
}
```

The file's import block (tests/inline-object-malformed-entry-resync.test.ts:1-9)
already reads `import { parseDoc } from "./helpers/e2e-s1";` — the same module
`isLoadParseError` is exported from — but does not import `isLoadParseError`.

Exact search: `grep -n "^function registers" tests/*.test.ts --include="*.test.ts"`
finds this same predicate body (identical clause set, differing only in the
frontmatter-vs-hasLoadParseError reading each file picks) independently
declared as `registers`/`registersCleanly` in nine further files
(tests/b0341-inferred-literal-binding-refuses-primitive-rhs.test.ts,
tests/fn-param-sink-array-literal.test.ts,
tests/inline-object-field-name-case.test.ts,
tests/inline-object-field-name-comparison-key.test.ts,
tests/inline-object-quoted-field-name-refusal.test.ts,
tests/inline-object-wire-name-rename-refusal.test.ts,
tests/nested-array-element-sink-descent.test.ts,
tests/schema-field-name-case.test.ts,
tests/type-name-as-value-refusal.test.ts); this finding is confined to the one
site inside this review's assigned scope
(tests/inline-object-malformed-entry-resync.test.ts).

## Why this is a problem
`isLoadParseError` is not a narrower or differently-scoped predicate than the
one `registers` computes: both test `d.severity === "error"` and
`(d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/"))` with
no additional or missing clause. The reviewed file's own doc comment justifies
choosing the `hasLoadParseError` reading of "registers" over the bug doc's
`frontmatter !== null` reading — a real, stated design choice — but that
choice does not require re-deriving the predicate's boolean logic locally: the
already-imported helper module carries the exact single-diagnostic test this
function needs, and the file could have written `!doc.diagnostics.some(isLoadParseError)`
using the already-live import instead of restating the two `startsWith`
clauses inline.

## Suggested direction (non-binding, optional)
`!doc.diagnostics.some(isLoadParseError)`, using the already-imported
`isLoadParseError` from `tests/helpers/e2e-s1.ts`, expresses the same
predicate `registers` computes today.

## False-positive check
- Gate-pin check: tests/inline-object-malformed-entry-resync.test.ts does not
  match `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate).
- Recording-double check: `registers` reads an already-produced diagnostics
  array; it records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "registers" docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md`
  → hits at lines 179, 236, 316, 383, 439, 456, 762, all defining or using
  "registers" as `frontmatter !== null` or narrating a fixture's disposition —
  none states a rationale for re-deriving `isLoadParseError`'s boolean logic
  locally rather than importing it; the file's own comment explains only why
  it picked the `hasLoadParseError` READING over the doc's `frontmatter !== null`
  reading, not why the predicate itself is restated inline.
- coverage-matrix/bug-doc citation search: `grep -n "inline-object-malformed-entry-resync"
  docs/reference/coverage-matrix.md` → 0 hits. docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md
  cites this file by name as its §Fix (e) witness and by group/cell id (A, B,
  C, D, F, J, L; d1/d3 etc.), never by `registers`'s internal implementation;
  this finding proposes no change to any `it()`/`describe()` name, count, or
  assertion — only to where the boolean predicate `registers` computes is
  derived — so no cited witness cell is disturbed.
- Prior-filing overlap check: `grep -rl "isLoadParseError" quality/intake/*.md
  quality/resolved/*.md` finds two pending candidates
  (qw20260917154546-d7-02-blocksregistration-reimplements-isloadparseerror-in-index-element-alias.md,
  qw20260917154546-d7-04-blocksregistration-reimplements-isloadparseerror.md)
  and resolved PTQ-0268; all three name a different local function
  (`blocksRegistration` / `expectBlocksRegistration`) in different files, none
  of which is tests/inline-object-malformed-entry-resync.test.ts or its
  `registers` function, so this is a new site of the recurring class rather
  than a re-filing of any of them.
- Coverage check: the claim is about a repeated predicate DEFINITION, not a
  missing test path; `registers` is exercised by group (D)'s d1 cell in the
  file today.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/inline-object-malformed-entry-resync.test.ts:312-332 and tests/helpers/e2e-s1.ts:87-97; the file imports only `parseDoc` from ./helpers/e2e-s1 (line 9) while `isLoadParseError` (added there in f0333c15, PTQ-0268's fix, after this test's 2026-08-22 authorship) is the clause-identical single-diagnostic predicate, so `registers` is exactly `!doc.diagnostics.some(isLoadParseError)`; `grep "^function registers" tests/*.test.ts` reproduces the stated 10 files; one live call site (line 725, cell d1); not a gate file, 0 coverage-matrix hits, bug doc 0231 cites cells not the predicate; PTQ-0268 and same-wave siblings d7-02/d7-157-02 each name a different file's function, so this is a new site of the class, not a duplicate (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
- qw20260919094008: skipped — [PTQ-0712-04-tool-admission-callablesetof-reimplemented.md] PTQ-0712: Shared callableSetOf across all three suites; retained both precondition assertions. / PTQ-0715: Extracted remaining duplicated helpers into existing helper modules; watcherAt and wiringAt were already shared. / PTQ-0716: Reused the compose-workspace harness, preserving the strict diagnostic-note precondition and all assertions. / PTQ-0717: Reused the production-load and workspace lifecycle helpers. No tests deleted or renamed across the cluster. Required gate passed: TypeScript and 11,585 tests across 689 files. || [PTQ-0719-04-tool-arg-parse-harness-makedeps-range-withcode-duplicated.md] PTQ-0719: Reused parseDeps and range; extended shared withCode to accept diagnostic lists. Assertions unchanged. / PTQ-0722: Reused production-load and workspace helpers, retaining lockstep’s stderr attribution wrapper. Tests unchanged. / PTQ-0723: Replaced both local load harnesses and workspace lifecycles with existing shared helpers. Per-row isolation and assertions preserved. / PTQ-0729: Migrated provider-gate scaffolding to the existing live/repair harness; retained body-only parsing and its distinct slug recipe. No tests deleted or renamed. Required gate passed for all fixes: tsc and 11,585 tests across 689 files. || [PTQ-0731-separator-test-local-parse-reimplements-parsedoc.md] PTQ-0731: Already imports parseDoc as parse; local duplicate is absent. No edits. / PTQ-0732: Both files already import shared diagLines; local duplicates are absent. No edits. / PTQ-0733: Both files already use shared diagLines, including the lines alias. No edits. / PTQ-0734: Registry migration was already present; removed its unused reader, associated imports/constant, and stranded comment. No tests or assertions changed. Required gate passed: TypeScript and all 689 test files / 11,585 tests. | review unconfirmed: PTQ-0731-separator-test-local-parse-reimplements-parsedoc.md — no working-tree change attributable; the cited local parse() at tests/import-specifier-separator-production-required.test.ts:233 is already gone at HEAD (line 12 now imports `parseDoc as parse` from ./helpers/e2e-s1, fixed in a prior commit), so re-triage for closure rather than re-fixing; PTQ-0732-01-diaglines-shadows-e2e-s1-export-pair.md — no working-tree change attributable; both local diagLines shadows are already gone at HEAD (typeenv-prototype-names.test.ts:22 and union-arm-literal-const-lowering.test.ts:20 now import diagLines from ./helpers/e2e-s1, fixed in a prior commit) — re-triage for closure; PTQ-0733-01-diaglines-reimplemented-both-in-scope-files.md — no working-tree change attributable; both local reimplementations are already gone at HEAD (union-generic-arm-lowering.test.ts:16 imports diagLines; unresolvable-operand-structural-target-adjudication.test.ts:26 imports `diagLines as lines`, fixed in a prior commit) — re-triage for closure. || [PTQ-0736-02-off-session-scripted-complete-harness-duplicated.md] PTQ-0736: Shared the queue mock, reply builder, tool reader, and model fixture across all eight suites; preserved reset policies and assertions. / PTQ-0737: Already resolved in current code: makeDeps is gone and parse delegates to parseDoc, preserving the retag.theta default. / PTQ-0738: Replaced the remaining structural-target scaffold with existing producer/root/checkpoint helpers; the receiver suite was already migrated. No tests deleted. / PTQ-0739: Reused shared workspace/load helpers with an optional registry-tools fixture; all assertions preserved. Required full gate passed for all changes: TypeScript and 11,585 tests across 689 files. | review unconfirmed: PTQ-0737-02-retag-makedeps-reimplements-e2e-s1.md — shed by the fixer: tests/wire-translation-inbound-retag.test.ts has no working-tree change; its module-scope makeDeps() (lines ~47-57) and parse() wrapper (~59-61) still redeclare what tests/helpers/e2e-s1.ts exports as parseDeps()/parseDoc(), and the file still imports nothing from ./helpers/e2e-s1. || [PTQ-0740-02-resolvecallableset-harness-quintuple-duplicated.md] PTQ-0740: Consolidated remaining callable-set helpers in tests/helpers/e2e-s1.ts, reused findCode, and removed the fourth file’s unused callee double. All tests and assertions preserved. Required verification command passed: TypeScript clean, 689 test files and 11,585 tests passed. / PTQ-0741: Shared the channel double through tests/helpers/recording-system-note-channel.ts, retaining the superset return shape and all recording assertions. No tests deleted; required gate passed. / PTQ-0742: No longer reproduces; the watcher test already imports shared REGISTRY. No registry edits made. / PTQ-0747: No longer reproduces; all three files already use shared registry readers, and both message wrappers delegate to registryMessageOf. No edits made. || [PTQ-0750-registry-oracle-reimplemented-inline-object-pair.md] PTQ-0750: Already resolved in current code; both files import the shared registry oracle. / PTQ-0751: Consolidated the duplicated harness into tests/helpers/e2e-s1.ts, preserving fixture paths and all test bodies. No tests deleted or renamed. Required gate passed: TypeScript and 11,585 tests across 689 files. / PTQ-0753: Already resolved in current code; registers() uses the imported isLoadParseError predicate. / PTQ-0754: Already resolved in current code; the test imports the shared ANTHROPIC_MODEL fixture. | review unconfirmed: PTQ-0750-registry-oracle-reimplemented-inline-object-pair.md — no working-tree change attributable to it; independently verified already resolved at HEAD by a prior committed batch (both inline-object files import REGISTRY from ./helpers/registry-oracle at line 1; the local parseRegistry/RegistryRow blocks are gone), so it needs closing via its own attributable fix record, not this diff. PTQ-0753-malformed-entry-resync-registers-reimplements-isloadparseerr.md — no working-tree change attributable; verified already resolved at HEAD (registers() at tests/inline-object-malformed-entry-resync.test.ts:294-295 is now !doc.diagnostics.some(isLoadParseError) with the helper imported from ./helpers/e2e-s1 at line 8), resolved by a prior committed batch. PTQ-0754-interpolation-parse-diagnostics-anthropic-model-not-migrated.md — no working-tree change attributable; verified already resolved at HEAD (tests/interpolation-parse-diagnostics.test.ts:1 imports ANTHROPIC_MODEL from ./helpers/scripted-live-session-harness; no local declaration remains, both use sites at :1068/:1075 use the import), resolved by a prior committed batch. ||
