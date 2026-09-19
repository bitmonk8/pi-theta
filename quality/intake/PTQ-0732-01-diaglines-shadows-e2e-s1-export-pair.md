---
id: PTQ-0732
title: typeenv-prototype-names.test.ts and union-arm-literal-const-lowering.test.ts each redefine diagLines(doc) though both already import parseDoc from tests/helpers/e2e-s1, which exports the identical function
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake
verdict: questionable
locations:                   # every cited site, repo-relative path:line-range
  - tests/typeenv-prototype-names.test.ts:22,300-302
  - tests/union-arm-literal-const-lowering.test.ts:20,259-261
  - tests/helpers/e2e-s1.ts:99-102
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 2
---

# typeenv-prototype-names.test.ts and union-arm-literal-const-lowering.test.ts each redefine diagLines(doc) though both already import parseDoc from tests/helpers/e2e-s1, which exports the identical function

## Observation
Both files in this review's scope import `parseDoc` from `./helpers/e2e-s1` on
their own import line, and both then declare a module-private
`diagLines(doc: ThetaDocument): string[]` whose body is byte-identical to the
`diagLines` function `tests/helpers/e2e-s1.ts` already exports —
`doc.diagnostics.map((d) => \`${d.severity} ${d.code}: ${d.message}\`)`.
Neither file's import statement names `diagLines`, so each local declaration
shadows, rather than reuses, the export sitting in the same module the file
already draws from.

## Evidence
`tests/helpers/e2e-s1.ts:99-102` (the canonical, already-exported helper):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/typeenv-prototype-names.test.ts:22` (the import that reaches the same
module) and `:300-302` (the local shadow):
```ts
import { parseDoc } from "./helpers/e2e-s1";
...
/** The whole diagnostic list, order-preserving, as comparable strings. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/union-arm-literal-const-lowering.test.ts:20` (the same import) and
`:259-261` (the local shadow, byte-identical body):
```ts
import { parseDoc } from "./helpers/e2e-s1";
...
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

Search: `grep -n "^function diagLines\|^import.*e2e-s1" tests/typeenv-prototype-names.test.ts tests/union-arm-literal-const-lowering.test.ts` returns exactly one `import` line and one `function diagLines` declaration per file — 2 sites total in this review's scope, both re-read from the files immediately before filing.

## Why this is a problem
The signature is identical (`(doc: ThetaDocument): string[]`) and the map
expression is byte-for-byte identical to the exported helper both files
already reach into the same module for. This is the same duplication class
`quality/resolved/PTQ-0205-diagline-rendering-helper-duplication.md` fixed by
adding `diagLines`/`diagCodes` as exports to `tests/helpers/e2e-s1.ts` (that
finding's own evidence cites `tests/typeenv-prototype-names.test.ts:300` as
one of dozens of pre-fix instances) — the export now exists, but these two
files still carry their own copy of the function it replaced rather than
importing it, so the fix did not reach either site.

## Suggested direction (non-binding, optional)
Both files' own import line already names the module the canonical
`diagLines` lives in; adding the name to that same import and dropping the
local declaration is the route each file's own code already points at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kinds (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: `diagLines` renders an already-produced diagnostic
  list for a positive comparison; it records no calls and backs no
  "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "diagLines" docs/bugs/` → no hits;
  neither file's local declaration is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "diagLines"
  docs/reference/coverage-matrix.md` → no hits. Both files are themselves
  witness files for open bugs (0038, 0184) cited by name in their own header
  comments, but this finding proposes no change to any `it()`/`describe()`
  name, count, red/green disposition, or assertion — only where the
  `diagLines` function body is defined — so no cited witness is affected.
- Confirmed the canonical export exists and matches byte-for-byte:
  `tests/helpers/e2e-s1.ts:99-102`, re-read immediately before filing.
- Confirmed this is not a coverage claim: both local functions are already
  exercised by every diagnostic assertion in their file; the observation is
  the duplicated definition site, not a missing test.
- Checked the already-filed candidate list for this wave for any finding
  citing either file by path: `grep -rl "typeenv-prototype-names\|union-arm-literal-const-lowering" quality/intake/*.md quality/resolved/*.md` before writing this file
  found only `quality/resolved/PTQ-0205-diagline-rendering-helper-duplication.md`
  (which cites `typeenv-prototype-names.test.ts:300` as one of many pre-fix
  instances of the general pattern, not as a filed finding against these two
  files specifically) — no duplicate.

## Triage
verdict: confirmed — independently re-verified: both local declarations (typeenv-prototype-names.test.ts:300-302, union-arm-literal-const-lowering.test.ts:259-261) are byte-identical in signature and body to the exported `diagLines` at tests/helpers/e2e-s1.ts:100-102, each file's sole e2e-s1 import (:22 / :20) names only `parseDoc`, the stated grep reproduces exactly (1 import + 1 declaration per file), and docs/bugs/, coverage-matrix and exemptions searches all return 0 hits; not a duplicate — PTQ-0205's fix commit 2594cd44 migrated only its 3 cited test files and touched neither of these (the 68-file count was pattern evidence, not cited sites), matching the repo's accepted residual-site convention (PTQ-0228, PTQ-0240, PTQ-0301, PTQ-0405), and no peer intake candidate in this wave cites either file (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
- qw20260919094008: skipped — [PTQ-0712-04-tool-admission-callablesetof-reimplemented.md] PTQ-0712: Shared callableSetOf across all three suites; retained both precondition assertions. / PTQ-0715: Extracted remaining duplicated helpers into existing helper modules; watcherAt and wiringAt were already shared. / PTQ-0716: Reused the compose-workspace harness, preserving the strict diagnostic-note precondition and all assertions. / PTQ-0717: Reused the production-load and workspace lifecycle helpers. No tests deleted or renamed across the cluster. Required gate passed: TypeScript and 11,585 tests across 689 files. || [PTQ-0719-04-tool-arg-parse-harness-makedeps-range-withcode-duplicated.md] PTQ-0719: Reused parseDeps and range; extended shared withCode to accept diagnostic lists. Assertions unchanged. / PTQ-0722: Reused production-load and workspace helpers, retaining lockstep’s stderr attribution wrapper. Tests unchanged. / PTQ-0723: Replaced both local load harnesses and workspace lifecycles with existing shared helpers. Per-row isolation and assertions preserved. / PTQ-0729: Migrated provider-gate scaffolding to the existing live/repair harness; retained body-only parsing and its distinct slug recipe. No tests deleted or renamed. Required gate passed for all fixes: tsc and 11,585 tests across 689 files. || [PTQ-0731-separator-test-local-parse-reimplements-parsedoc.md] PTQ-0731: Already imports parseDoc as parse; local duplicate is absent. No edits. / PTQ-0732: Both files already import shared diagLines; local duplicates are absent. No edits. / PTQ-0733: Both files already use shared diagLines, including the lines alias. No edits. / PTQ-0734: Registry migration was already present; removed its unused reader, associated imports/constant, and stranded comment. No tests or assertions changed. Required gate passed: TypeScript and all 689 test files / 11,585 tests. | review unconfirmed: PTQ-0731-separator-test-local-parse-reimplements-parsedoc.md — no working-tree change attributable; the cited local parse() at tests/import-specifier-separator-production-required.test.ts:233 is already gone at HEAD (line 12 now imports `parseDoc as parse` from ./helpers/e2e-s1, fixed in a prior commit), so re-triage for closure rather than re-fixing; PTQ-0732-01-diaglines-shadows-e2e-s1-export-pair.md — no working-tree change attributable; both local diagLines shadows are already gone at HEAD (typeenv-prototype-names.test.ts:22 and union-arm-literal-const-lowering.test.ts:20 now import diagLines from ./helpers/e2e-s1, fixed in a prior commit) — re-triage for closure; PTQ-0733-01-diaglines-reimplemented-both-in-scope-files.md — no working-tree change attributable; both local reimplementations are already gone at HEAD (union-generic-arm-lowering.test.ts:16 imports diagLines; unresolvable-operand-structural-target-adjudication.test.ts:26 imports `diagLines as lines`, fixed in a prior commit) — re-triage for closure. || [PTQ-0736-02-off-session-scripted-complete-harness-duplicated.md] PTQ-0736: Shared the queue mock, reply builder, tool reader, and model fixture across all eight suites; preserved reset policies and assertions. / PTQ-0737: Already resolved in current code: makeDeps is gone and parse delegates to parseDoc, preserving the retag.theta default. / PTQ-0738: Replaced the remaining structural-target scaffold with existing producer/root/checkpoint helpers; the receiver suite was already migrated. No tests deleted. / PTQ-0739: Reused shared workspace/load helpers with an optional registry-tools fixture; all assertions preserved. Required full gate passed for all changes: TypeScript and 11,585 tests across 689 files. | review unconfirmed: PTQ-0737-02-retag-makedeps-reimplements-e2e-s1.md — shed by the fixer: tests/wire-translation-inbound-retag.test.ts has no working-tree change; its module-scope makeDeps() (lines ~47-57) and parse() wrapper (~59-61) still redeclare what tests/helpers/e2e-s1.ts exports as parseDeps()/parseDoc(), and the file still imports nothing from ./helpers/e2e-s1. || [PTQ-0740-02-resolvecallableset-harness-quintuple-duplicated.md] PTQ-0740: Consolidated remaining callable-set helpers in tests/helpers/e2e-s1.ts, reused findCode, and removed the fourth file’s unused callee double. All tests and assertions preserved. Required verification command passed: TypeScript clean, 689 test files and 11,585 tests passed. / PTQ-0741: Shared the channel double through tests/helpers/recording-system-note-channel.ts, retaining the superset return shape and all recording assertions. No tests deleted; required gate passed. / PTQ-0742: No longer reproduces; the watcher test already imports shared REGISTRY. No registry edits made. / PTQ-0747: No longer reproduces; all three files already use shared registry readers, and both message wrappers delegate to registryMessageOf. No edits made. || [PTQ-0750-registry-oracle-reimplemented-inline-object-pair.md] PTQ-0750: Already resolved in current code; both files import the shared registry oracle. / PTQ-0751: Consolidated the duplicated harness into tests/helpers/e2e-s1.ts, preserving fixture paths and all test bodies. No tests deleted or renamed. Required gate passed: TypeScript and 11,585 tests across 689 files. / PTQ-0753: Already resolved in current code; registers() uses the imported isLoadParseError predicate. / PTQ-0754: Already resolved in current code; the test imports the shared ANTHROPIC_MODEL fixture. | review unconfirmed: PTQ-0750-registry-oracle-reimplemented-inline-object-pair.md — no working-tree change attributable to it; independently verified already resolved at HEAD by a prior committed batch (both inline-object files import REGISTRY from ./helpers/registry-oracle at line 1; the local parseRegistry/RegistryRow blocks are gone), so it needs closing via its own attributable fix record, not this diff. PTQ-0753-malformed-entry-resync-registers-reimplements-isloadparseerr.md — no working-tree change attributable; verified already resolved at HEAD (registers() at tests/inline-object-malformed-entry-resync.test.ts:294-295 is now !doc.diagnostics.some(isLoadParseError) with the helper imported from ./helpers/e2e-s1 at line 8), resolved by a prior committed batch. PTQ-0754-interpolation-parse-diagnostics-anthropic-model-not-migrated.md — no working-tree change attributable; verified already resolved at HEAD (tests/interpolation-parse-diagnostics.test.ts:1 imports ANTHROPIC_MODEL from ./helpers/scripted-live-session-harness; no local declaration remains, both use sites at :1068/:1075 use the import), resolved by a prior committed batch. ||
- qw20260919104142: skipped — [PTQ-0779-02-statement-executor-invoke-seam-scaffold-not-migrated.md] PTQ-0779: Already migrated to shared span and no-op checkpoint imports; no changes needed. / PTQ-0787: Replaced local parseDeps() with the existing helper import; all tests and assertions preserved. / PTQ-0788: Replaced local parseDeps() with the existing helper import; all tests and assertions preserved. / PTQ-0789: Both files now import the shared model and entry type and delegate appends to the newly exported existing helper; no tests or assertions removed. Required verification command passed: TypeScript and all 11,585 tests across 689 files. || [PTQ-0793-canonical-honesty-sorted-closure-duplicated.md] PTQ-0793: Reused assertKeysSorted; retained fragment equality, array-order, and whitespace checks. No tests deleted or renamed. / PTQ-0794: Reused inlineDefName; removed the inline hash computation and unused crypto import. No tests deleted or renamed. / PTQ-0795: Shared holder-bound accessors in scripted-live-session-harness.ts; preserved errors, casts, mocks, and assertions. No tests deleted or renamed. / PTQ-0796: Shared AST capture in e2e-s1.ts; preserved fixture paths and all three assertions. No tests deleted or renamed. Required gate passed for all four issues: TypeScript and 11,585 tests across 689 files; no production or quality-store changes. || [PTQ-0797-ctor-proto-named-field-livesessiondouble-not-migrated.md] PTQ-0797: Reused shared model, entry type, and append helpers; imported parseDeps from its current home, e2e-s1.ts. Recording behavior and assertions unchanged; no tests deleted. / PTQ-0798: Replaced all five duplicated diagnostic helpers across three files with existing exports; assertions unchanged and no tests deleted. / PTQ-0799: Replaced both local diagLines helpers with imports and removed unused types; assertions unchanged and no tests deleted. / PTQ-0800: Imported shared diagLines, preserving the lines wrapper and all assertions; removed unused types; no tests deleted. Exact required verification gate passed for all four issues: TypeScript clean, 689 test files and 11,585 tests passed. No production or quality-store edits. || [PTQ-0801-diaglines-reimplemented-inline-object-empty-pair.md] PTQ-0801: Replaced both local diagLines implementations with the existing shared helper; no tests removed. / PTQ-0804: Reused PARSE_REGISTRY and removed the duplicate registry interface/read; assertions unchanged and no tests removed. / PTQ-0806: Shared the diagnostic/fn harness across all five triaged sites, preserving the annotation-specific registration predicate; no tests renamed or removed. / PTQ-0808: Both triaged message readers now delegate to registryMessageOf, preserving registry scope and placeholder checks; no tests removed. Required gate passed for all fixes: tsc and 11,585 tests across 689 files. ||
