---
id: PTQ-0733
title: Both in-scope files reimplement e2e-s1's exported diagLines under a local declaration instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/union-generic-arm-lowering.test.ts:15
  - tests/union-generic-arm-lowering.test.ts:234-237
  - tests/unresolvable-operand-structural-target-adjudication.test.ts:26
  - tests/unresolvable-operand-structural-target-adjudication.test.ts:389-392
  - tests/helpers/e2e-s1.ts:99-102
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# Both in-scope files reimplement e2e-s1's exported diagLines under a local declaration instead of importing it

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc: ThetaDocument): string[]`,
rendering every diagnostic as `` `${severity} ${code}: ${message}` ``. Both
files in this review's scope import `parseDoc` from that exact module
(`./helpers/e2e-s1`) but do not import `diagLines`; each instead declares its
own module-local function with a byte-identical body — one keeping the name
`diagLines`, the other renaming it to `lines` — that performs the identical
projection.

## Evidence
`tests/helpers/e2e-s1.ts:99-102` (the canonical, already-exported helper):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/union-generic-arm-lowering.test.ts:15` (the import that omits `diagLines`)
and `:234-237` (the local reimplementation, same name, same body):
```ts
import { parseDoc } from "./helpers/e2e-s1";
...
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/unresolvable-operand-structural-target-adjudication.test.ts:26` (the
import that omits `diagLines`) and `:389-392` (the local reimplementation,
renamed to `lines`, identical body):
```ts
import { parseDoc } from "./helpers/e2e-s1";
...
/** `severity code: message` for EVERY diagnostic, in emission order. */
function lines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

Exact search: `grep -n "^function diagLines\|^function lines(doc" tests/union-generic-arm-lowering.test.ts tests/unresolvable-operand-structural-target-adjudication.test.ts` returns exactly these two declarations, one per file — the entire in-scope set for this review.

## Why this is a problem
Both files already reach into `tests/helpers/e2e-s1` for `parseDoc` in the same
import statement the canonical `diagLines` is exported from, so the
reimplementation is not a case of the helper being hard to find. The map
expression `doc.diagnostics.map((d) => \`${d.severity} ${d.code}: ${d.message}\`)`
is typed out a second and third time (once under the same name, once under a
different name for the identical purpose) rather than called once from the
already-imported module.

## Suggested direction (non-binding, optional)
Each site could add `diagLines` to its existing `./helpers/e2e-s1` import and
call it directly (the second file's local `lines` calls would become
`diagLines(...)`), rather than restating the render expression under a
separate local declaration.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: not applicable — `diagLines`/`lines` renders an
  already-produced diagnostics array for a positive assertion; it records no
  calls and backs no "never called" witness.
- docs/bugs/ signature search: `grep -rl "diagLines" docs/bugs/` returns no
  hits; no documented correct-reason red cites either local reimplementation.
- coverage-matrix/bug-doc citation search: `grep -n
  "union-generic-arm-lowering\|unresolvable-operand-structural-target-adjudication"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` — only that each site
  could call the already-imported module's `diagLines` directly — so no
  citation is disturbed.
- Coverage check: the claim is entirely about a repeated function
  DEFINITION; every copy is exercised by its own file's tests, and no
  behaviour path is claimed untested.
- Overlap check: grepped `quality/intake` and `quality/resolved` for
  `diagLines` together with either file's own name — the existing
  `qw20260917154546-d7-90-diaglines-reimplements-e2e-s1-helper.md` finding
  cites four `tests/live/*.test.ts` files with a different `(text, path)`
  signature, and PTQ-0205 (resolved) cites three different files
  (`annotation-nontype-text-refusal.test.ts`,
  `binder-param-line-newline-normalisation.test.ts`,
  `schema-body-nontype-text-refusal.test.ts`); neither names either file in
  this review's scope, so this is the first filing to cite this specific
  pair.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: all five excerpts match byte-for-byte at the cited lines (e2e-s1.ts:99-102 exports diagLines(doc); union-generic-arm-lowering.test.ts:15 and unresolvable-operand-structural-target-adjudication.test.ts:26 each import only parseDoc from that module, and :235 / :390 declare a local diagLines / lines with a body identical to the export, live at 8 and 3 call sites), the stated decl grep returns exactly those two declarations, docs/bugs/ has no diagLines hits and coverage-matrix.md has 0 hits for either file, neither file is a gate test, and no tracked issue covers this pair — resolved PTQ-0205 names 22 files by path but not these two and its fix commit 2594cd44 touched neither, while intake d7-90 cites four tests/live/ files with a different (text, path) signature; genuine D7 boilerplate duplication against an already-imported helper, mechanical dedupe (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
- qw20260919094008: skipped — [PTQ-0712-04-tool-admission-callablesetof-reimplemented.md] PTQ-0712: Shared callableSetOf across all three suites; retained both precondition assertions. / PTQ-0715: Extracted remaining duplicated helpers into existing helper modules; watcherAt and wiringAt were already shared. / PTQ-0716: Reused the compose-workspace harness, preserving the strict diagnostic-note precondition and all assertions. / PTQ-0717: Reused the production-load and workspace lifecycle helpers. No tests deleted or renamed across the cluster. Required gate passed: TypeScript and 11,585 tests across 689 files. || [PTQ-0719-04-tool-arg-parse-harness-makedeps-range-withcode-duplicated.md] PTQ-0719: Reused parseDeps and range; extended shared withCode to accept diagnostic lists. Assertions unchanged. / PTQ-0722: Reused production-load and workspace helpers, retaining lockstep’s stderr attribution wrapper. Tests unchanged. / PTQ-0723: Replaced both local load harnesses and workspace lifecycles with existing shared helpers. Per-row isolation and assertions preserved. / PTQ-0729: Migrated provider-gate scaffolding to the existing live/repair harness; retained body-only parsing and its distinct slug recipe. No tests deleted or renamed. Required gate passed for all fixes: tsc and 11,585 tests across 689 files. || [PTQ-0731-separator-test-local-parse-reimplements-parsedoc.md] PTQ-0731: Already imports parseDoc as parse; local duplicate is absent. No edits. / PTQ-0732: Both files already import shared diagLines; local duplicates are absent. No edits. / PTQ-0733: Both files already use shared diagLines, including the lines alias. No edits. / PTQ-0734: Registry migration was already present; removed its unused reader, associated imports/constant, and stranded comment. No tests or assertions changed. Required gate passed: TypeScript and all 689 test files / 11,585 tests. | review unconfirmed: PTQ-0731-separator-test-local-parse-reimplements-parsedoc.md — no working-tree change attributable; the cited local parse() at tests/import-specifier-separator-production-required.test.ts:233 is already gone at HEAD (line 12 now imports `parseDoc as parse` from ./helpers/e2e-s1, fixed in a prior commit), so re-triage for closure rather than re-fixing; PTQ-0732-01-diaglines-shadows-e2e-s1-export-pair.md — no working-tree change attributable; both local diagLines shadows are already gone at HEAD (typeenv-prototype-names.test.ts:22 and union-arm-literal-const-lowering.test.ts:20 now import diagLines from ./helpers/e2e-s1, fixed in a prior commit) — re-triage for closure; PTQ-0733-01-diaglines-reimplemented-both-in-scope-files.md — no working-tree change attributable; both local reimplementations are already gone at HEAD (union-generic-arm-lowering.test.ts:16 imports diagLines; unresolvable-operand-structural-target-adjudication.test.ts:26 imports `diagLines as lines`, fixed in a prior commit) — re-triage for closure. || [PTQ-0736-02-off-session-scripted-complete-harness-duplicated.md] PTQ-0736: Shared the queue mock, reply builder, tool reader, and model fixture across all eight suites; preserved reset policies and assertions. / PTQ-0737: Already resolved in current code: makeDeps is gone and parse delegates to parseDoc, preserving the retag.theta default. / PTQ-0738: Replaced the remaining structural-target scaffold with existing producer/root/checkpoint helpers; the receiver suite was already migrated. No tests deleted. / PTQ-0739: Reused shared workspace/load helpers with an optional registry-tools fixture; all assertions preserved. Required full gate passed for all changes: TypeScript and 11,585 tests across 689 files. | review unconfirmed: PTQ-0737-02-retag-makedeps-reimplements-e2e-s1.md — shed by the fixer: tests/wire-translation-inbound-retag.test.ts has no working-tree change; its module-scope makeDeps() (lines ~47-57) and parse() wrapper (~59-61) still redeclare what tests/helpers/e2e-s1.ts exports as parseDeps()/parseDoc(), and the file still imports nothing from ./helpers/e2e-s1. || [PTQ-0740-02-resolvecallableset-harness-quintuple-duplicated.md] PTQ-0740: Consolidated remaining callable-set helpers in tests/helpers/e2e-s1.ts, reused findCode, and removed the fourth file’s unused callee double. All tests and assertions preserved. Required verification command passed: TypeScript clean, 689 test files and 11,585 tests passed. / PTQ-0741: Shared the channel double through tests/helpers/recording-system-note-channel.ts, retaining the superset return shape and all recording assertions. No tests deleted; required gate passed. / PTQ-0742: No longer reproduces; the watcher test already imports shared REGISTRY. No registry edits made. / PTQ-0747: No longer reproduces; all three files already use shared registry readers, and both message wrappers delegate to registryMessageOf. No edits made. || [PTQ-0750-registry-oracle-reimplemented-inline-object-pair.md] PTQ-0750: Already resolved in current code; both files import the shared registry oracle. / PTQ-0751: Consolidated the duplicated harness into tests/helpers/e2e-s1.ts, preserving fixture paths and all test bodies. No tests deleted or renamed. Required gate passed: TypeScript and 11,585 tests across 689 files. / PTQ-0753: Already resolved in current code; registers() uses the imported isLoadParseError predicate. / PTQ-0754: Already resolved in current code; the test imports the shared ANTHROPIC_MODEL fixture. | review unconfirmed: PTQ-0750-registry-oracle-reimplemented-inline-object-pair.md — no working-tree change attributable to it; independently verified already resolved at HEAD by a prior committed batch (both inline-object files import REGISTRY from ./helpers/registry-oracle at line 1; the local parseRegistry/RegistryRow blocks are gone), so it needs closing via its own attributable fix record, not this diff. PTQ-0753-malformed-entry-resync-registers-reimplements-isloadparseerr.md — no working-tree change attributable; verified already resolved at HEAD (registers() at tests/inline-object-malformed-entry-resync.test.ts:294-295 is now !doc.diagnostics.some(isLoadParseError) with the helper imported from ./helpers/e2e-s1 at line 8), resolved by a prior committed batch. PTQ-0754-interpolation-parse-diagnostics-anthropic-model-not-migrated.md — no working-tree change attributable; verified already resolved at HEAD (tests/interpolation-parse-diagnostics.test.ts:1 imports ANTHROPIC_MODEL from ./helpers/scripted-live-session-harness; no local declaration remains, both use sites at :1068/:1075 use the import), resolved by a prior committed batch. ||
