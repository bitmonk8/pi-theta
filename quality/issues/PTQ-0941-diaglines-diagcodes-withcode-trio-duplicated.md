---
id: PTQ-0941
title: import-export-from-clause-required.test.ts and import-specifier-list-production-required.test.ts each redeclare the byte-identical diagLines/diagCodes/withCode trio over Diagnostic[]
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/import-export-from-clause-required.test.ts:208-221
  - tests/import-specifier-list-production-required.test.ts:272-285
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# import-export-from-clause-required.test.ts and import-specifier-list-production-required.test.ts each redeclare the byte-identical diagLines/diagCodes/withCode trio over Diagnostic[]

## Observation
Both in-scope files declare the same three module-scope functions —
`diagLines`, `diagCodes`, `withCode` — each taking `diagnostics: readonly
Diagnostic[]` directly (not a `ThetaDocument`), with the same doc comments and
the same bodies. Neither file imports these from any shared module; no
`tests/helpers/` module currently exports a `Diagnostic[]`-accepting version
of any of the three (the closest existing export, `tests/helpers/e2e-s1.ts`'s
`diagLines`/`diagCodes`/`withCode`, takes a `ThetaDocument` and would not
serve both files' call sites, several of which run the trio over
`result.diagnostics` from `loadImports`/`loadThetaLibDiags`, not over a
parsed document).

## Evidence
`tests/import-export-from-clause-required.test.ts:208-221`:
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Every diagnostic's code, in emission order. */
function diagCodes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((d) => d.code);
}

/** The diagnostics carrying `code`, in emission order. */
function withCode(diagnostics: readonly Diagnostic[], code: string): Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}
```

`tests/import-specifier-list-production-required.test.ts:272-285` — the
identical three functions, same doc comments, same bodies:
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Every diagnostic's code, in emission order. */
function diagCodes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((d) => d.code);
}

/** The diagnostics carrying `code`, in emission order. */
function withCode(diagnostics: readonly Diagnostic[], code: string): Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}
```

Exact search run: `grep -n "function diagLines\|function diagCodes\|function withCode" tests/import-export-from-clause-required.test.ts tests/import-specifier-list-production-required.test.ts` → three hits (one per function) in each file, at the line ranges cited above. `grep -n "diagLines\|diagCodes\|withCode" tests/helpers/*.ts` → only `tests/helpers/e2e-s1.ts:242,247,252`, whose three exports each take a `ThetaDocument` parameter, not `readonly Diagnostic[]` (confirmed by direct read: `export function diagLines(doc: ThetaDocument): string[]`).

## Why this is a problem
The two in-scope files declare the identical three-function reader trio,
character-for-character, rather than importing a shared implementation. Both
files call the trio dozens of times each (`diagLines`/`diagCodes`/`withCode`
appear as call sites throughout both files' `describe` blocks), so the
duplication is load-bearing rather than incidental, and it exists between the
two in-scope files with no third-party divergence to explain a fork.

## Suggested direction (non-binding, optional)
A `tests/helpers/`-hosted `Diagnostic[]`-accepting `diagLines`/`diagCodes`/
`withCode` trio — parallel to `tests/helpers/e2e-s1.ts`'s existing
`ThetaDocument`-accepting versions, which cannot serve the call sites that
read `result.diagnostics` from a load-pass result rather than a parsed
document — is the natural home the two files' identical declarations point
toward.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a listed gate kin;
  not a pinned-count/inventory gate.
- Recording-double check: the trio are stateless readers over a diagnostics
  array, not a recording double backing a "never called" witness; the
  carve-out does not apply.
- docs/bugs/ signature search: `grep -n "diagLines\|diagCodes\|withCode" docs/bugs/0058-fromless-export-form-parses-without-spec-production.md docs/bugs/0100-production-excluded-import-export-spellings-parse-clean.md` → 0 hits in either; neither bug document cites these helper names or attributes a deliberate reason for a local, diverging copy.
- coverage-matrix/bug-doc citation search: `grep -n "import-export-from-clause-required\|import-specifier-list-production-required" docs/reference/coverage-matrix.md` → 0 hits. No merge, rename, or deletion of any `it()`/`describe()` is proposed — only relocating the shared reader trio to a helper — so any bug-doc witness-list citation of either file by name is unaffected.
- Duplicate-topic check: `grep -rl "function diagLines" quality/issues quality/intake quality/resolved` surfaces the large pre-existing `diagLines`-reimplementation family (PTQ-0591, PTQ-0663, PTQ-0664, PTQ-0674, PTQ-0732 through PTQ-0733, PTQ-0798 through PTQ-0802, PTQ-0857, PTQ-0865, PTQ-0869, PTQ-0877, PTQ-0882, PTQ-0893, PTQ-0899…), each targeting a different file or file pair; none names `import-export-from-clause-required.test.ts` or `import-specifier-list-production-required.test.ts`, and the already-filed PTQ-0914/PTQ-0916/PTQ-0813 covering this exact pair target `parse()`, the `RegistryRow`/`REGISTRY` read, and `isRegistrationError` respectively — none of the three names `diagLines`, `diagCodes`, or `withCode` — so this is a distinct, unfiled root cause at these two files.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce at tests/import-export-from-clause-required.test.ts:208-221 and tests/import-specifier-list-production-required.test.ts:272-285, mktemp `diff` of the two 14-line spans is empty (byte-identical, doc comments included), both copies are live (16/2/10 and 23/8/12 call sites for diagLines/diagCodes/withCode), neither file imports the trio, and the only helper exports (tests/helpers/e2e-s1.ts:242/247/252) take `ThetaDocument` — and e2e-s1's `diagCodes` renders `<severity> <code>`, not the bare code, so it is not a drop-in even where a doc is at hand; both sites under tests/, D7 boilerplate-duplication class, no gate/recording-double/red-test carve-out, coverage-matrix → 0 hits, and no open or resolved PTQ tracks a `Diagnostic[]`-accepting diagLines/diagCodes/withCode at these files (PTQ-0731/0813/0914/0916 on this family target `parse()`, `isRegistrationError`, and the registry read). Two corrections for the fixer: (1) the candidate's `sites: 2` undercounts — a THIRD byte-identical copy (mktemp `diff` empty) sits at tests/import-specifier-separator-production-required.test.ts:252-265, live at 18/7/10 call sites, and should be folded into the same dedupe (sites: 3); (2) the stated docs/bugs grep does not reproduce as "0 hits" — docs/bugs/0100:929 mentions `diagCodes` in prose about a RED cell's widened expected array, but that is a description of an assertion's contents, not a witness-list dependency on the helper's declaration site, so relocating the trio to a helper under the same names leaves it unaffected (triage: claude-fable-5-1)

## Fix attempts
- qw20260919203448: skipped — [PTQ-0966-assertrowsurfacelive-precondition-pair-duplicated.md] PTQ-0966: Already resolved in current code; both tests use shared invokeArgPreconditions. / PTQ-1031: Imported shared runProductionLoad and LoadOutcome; removed local duplicates and unused imports. All tests and assertions preserved; required gate passed. / PTQ-1035: Reused shared theta and fixture types across all four triaged files. Fixtures, tests and assertions unchanged; required gate passed. / PTQ-1037: Imported shared makeShippedHarness; removed duplicate harness declarations and unused imports. All tests and assertions preserved. Required TypeScript/full-test gate passed: 689 files, 11,586 tests. || [PTQ-1045-pkg-roots-buildpackages-not-migrated-glob-universe.md] PTQ-1045: Reused canonical buildPackages and its root map at all three triaged sites; no tests or assertions removed or changed. / PTQ-1052: Shared packageInput through tests/helpers/fake-file-system.ts across all five identical copies; no tests or assertions removed or changed. / PTQ-1088: Replaced inline teardown with disposeWorkspace; no tests removed. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. / PTQ-0963: No longer reproduces; every triaged duplicate already uses shared helpers. No edits made. | review unconfirmed: PTQ-0963-tools-load-witness-harness-duplicated.md — shed by the fixer: neither tests/tools-derived-name-shape.test.ts nor tests/tools-entry-closed-grammar.test.ts appears in the working-tree diff; all five duplicated pieces (expectedMessage at :129-140/:112-123, PlantedTheta/theta at :211-218/:181-188, the outcome/workspaceDir/beforeAll/afterAll/observed block at :284-305/:272-293, withCode at :428-430/:469-471) remain in both files, and the triage-noted third copy in tests/uppercase-pi-tool-name-refusal.test.ts is likewise untouched. || [PTQ-0992-b0379-caseinsensitive-guard-cannot-fail.md] PTQ-0992: Removed three tautological assertions and corrected the associated comment; retained every test and all registration/diagnostic assertions. / PTQ-1019: Already resolved in current code: one file-scope constant serves both readers; the unused third copy is absent. / PTQ-1030: Already resolved in current code: the header, H1 title, and asserted constant all say 50. / PTQ-1055: Shared Exp/render/renderAll through tests/helpers/registry-oracle.ts and removed orphaned local wrappers; no tests deleted. Required verification passed: TypeScript and all 11,586 tests across 689 files. | review unconfirmed: PTQ-1019-arity-array-two-literal-triplicated.md — untouched/shed: tests/nested-inline-enum-generic-argument-refusal.test.ts has no working-tree change; all three `line(ARITY, [["<ctor>","array"],["<expected>","1"],["<actual>","2"]])` copies remain at :781-785, :967-971 (rebuilt per loop iteration), and :1163-1167 (the dead never-read third copy). PTQ-1030-h1-title-stale-cell-count.md — untouched/shed: tests/inline-object-wire-name-rename-refusal.test.ts has no working-tree change; the "CONTROL H1" title still says 49 at :1452 while the body asserts NEW_ROW_LIST_CELLS = 50 (:744), and the top-of-file ANTI-VACUITY comment at :170-171 still says 47. ||
