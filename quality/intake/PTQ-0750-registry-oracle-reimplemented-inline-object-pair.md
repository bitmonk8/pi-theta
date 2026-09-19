---
id: PTQ-0750
title: Both inline-object test files re-declare the four-page registry read instead of importing tests/helpers/registry-oracle.ts
lens: D7
status: intake
verdict: questionable
locations:
  - tests/inline-empty-object-type.test.ts:121-140
  - tests/inline-object-duplicate-field-name.test.ts:151-170
  - tests/helpers/registry-oracle.ts:1-46
sites: 2
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 2
---

# Both inline-object test files re-declare the four-page registry read instead of importing tests/helpers/registry-oracle.ts

## Observation
Both files in scope open with a byte-for-byte identical `interface RegistryRow { readonly code: string; readonly message: string; }` plus a `const REGISTRY = parseRegistry([...four page names...].map(readFileSync...).join("\n"))` block that reads the same four diagnostics-registry pages (`code-registry-parse.md`, `-load.md`, `-runtime.md`, `-host.md`) through the same `parseRegistry` import. `tests/helpers/registry-oracle.ts` already exports exactly this read as `RegistryRow` / `readRegistry` / `REGISTRY`, with a header comment stating it exists because this exact block "were redeclared byte-for-byte (confirmed via `diff`) in several test files" and that the fix was to centralise the read while leaving each file's own message-rendering helper local. 30 other test files under `tests/` already import `REGISTRY` (or `readRegistry`) from that helper; the two files in this review's scope do not.

## Evidence

`tests/inline-empty-object-type.test.ts:121-140`:
```typescript
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];
```

`tests/inline-object-duplicate-field-name.test.ts:151-170` (identical shape, same four page names, same `readFileSync`/`fileURLToPath`/`.join("\n")` chain, same `as RegistryRow[]` cast):
```typescript
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];
```

`tests/helpers/registry-oracle.ts:1-46` (the canonical helper, whose own header names this exact redeclaration pattern as its reason for existing):
```typescript
// The shared four-page diagnostics-registry read (PTQ-0215).
//
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read only: each file's own
// `registryMessageOf` / `registryRowOf`-shaped reader — whose assertion style
// and wording vary per file — stays local, parameterised by the `REGISTRY` this
// module exports rather than by a locally re-parsed copy.
```

Import-site count: `grep -l "from \"./helpers/registry-oracle\"" tests/*.test.ts` returns 30 files (e.g. `tests/absent-member-presence-gate.test.ts`, `tests/acceptance-stderr-gate.test.ts`, `tests/alias-sink-array-element-check.test.ts`, `tests/annotation-nontype-text-refusal.test.ts`, `tests/annotation-root-brace-union-lowering.test.ts`, …); neither `tests/inline-empty-object-type.test.ts` nor `tests/inline-object-duplicate-field-name.test.ts` appears in that list — both still carry a local `RegistryRow`/`REGISTRY` declaration instead.

## Why this is a problem
The two files in scope duplicate, verbatim, a 20-line block that a canonical helper under `tests/helpers/` already exists to replace, and that helper's own doc comment describes exactly this shape (`interface RegistryRow` + a four-page `parseRegistry(...).join("\n")` read) as the redeclaration it was created to end. The local `RegistryRow` interface in each scope file is a narrower shape (`code`/`message` only) than the helper's exported `RegistryRow` (which also carries `namespace`/`severity`/`phase`/`trigger`), so the two files are not merely unmigrated — they independently re-typed a fixture the helper already types more completely.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s exported `REGISTRY` (`readRegistry(["parse","load","runtime","host"])`) is the same four-page union both files read locally; importing it in place of the local declaration is the shape the helper's own header already describes as its purpose.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin patterns; not applicable.
- Recording-double check: `REGISTRY`/`RegistryRow` is a static read of documentation, not a recording double; not applicable.
- docs/bugs/ signature search: `grep -rn "inline-empty-object-type.test.ts\|inline-object-duplicate-field-name.test.ts" docs/bugs/` returns dozens of citations, all naming specific test cells/line-ranges as witnesses of already-fixed bugs (0045, 0052, 0093, 0159, 0160, 0161, 0176, 0228, 0233, 0245, 0262, 0263, 0421); none of those citations concern the `RegistryRow`/`REGISTRY` block itself (all cite cell bodies further down each file), and this finding does not propose merging, renaming, or deleting either test file — only its local registry-read declaration.
- coverage-matrix/bug-doc citation search: both files are cited by name and by absolute line range in many docs/bugs/*.md entries (e.g. `docs/bugs/0093-...:78`, `docs/bugs/0176-...:1036`); those citations target specific `it(...)` cells, not the lines under evidence here (121-140 / 151-170), and no citation is to the registry-declaration block itself.
- Coverage drift: this finding does not claim any behaviour is untested; it is confined to a duplicated fixture declaration inside tests that already exist.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: both excerpts reproduce byte-for-byte at tests/inline-empty-object-type.test.ts:121-140 and tests/inline-object-duplicate-field-name.test.ts:151-170 (identical `interface RegistryRow {code,message}` + four-page `parseRegistry(...readFileSync...).join("\n")` read); tests/helpers/registry-oracle.ts:20-46 exports the same read as `REGISTRY`/`readRegistry` with a header naming this exact redeclaration as its reason for existing; `grep -l 'from "./helpers/registry-oracle"' tests/*.test.ts` = 30 and neither in-scope file imports it (grep -n registry-oracle on both = 0 hits); D7 copy-paste-fixture class, both locations under tests/, no gate file, no docs/bugs or coverage-matrix citation of lines 121-140/151-170; not a duplicate — no open/resolved PTQ names either file for this root cause (PTQ-0205 cites :249/:332, the local message-rendering helper the oracle header deliberately leaves local; PTQ-0404/0411/0412 cover other file sets and were accepted as distinct per-file-set rows), and sibling candidate d7-66 covers the fixture builder at :221-266/:301-353 only (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
- qw20260919094008: skipped — [PTQ-0712-04-tool-admission-callablesetof-reimplemented.md] PTQ-0712: Shared callableSetOf across all three suites; retained both precondition assertions. / PTQ-0715: Extracted remaining duplicated helpers into existing helper modules; watcherAt and wiringAt were already shared. / PTQ-0716: Reused the compose-workspace harness, preserving the strict diagnostic-note precondition and all assertions. / PTQ-0717: Reused the production-load and workspace lifecycle helpers. No tests deleted or renamed across the cluster. Required gate passed: TypeScript and 11,585 tests across 689 files. || [PTQ-0719-04-tool-arg-parse-harness-makedeps-range-withcode-duplicated.md] PTQ-0719: Reused parseDeps and range; extended shared withCode to accept diagnostic lists. Assertions unchanged. / PTQ-0722: Reused production-load and workspace helpers, retaining lockstep’s stderr attribution wrapper. Tests unchanged. / PTQ-0723: Replaced both local load harnesses and workspace lifecycles with existing shared helpers. Per-row isolation and assertions preserved. / PTQ-0729: Migrated provider-gate scaffolding to the existing live/repair harness; retained body-only parsing and its distinct slug recipe. No tests deleted or renamed. Required gate passed for all fixes: tsc and 11,585 tests across 689 files. || [PTQ-0731-separator-test-local-parse-reimplements-parsedoc.md] PTQ-0731: Already imports parseDoc as parse; local duplicate is absent. No edits. / PTQ-0732: Both files already import shared diagLines; local duplicates are absent. No edits. / PTQ-0733: Both files already use shared diagLines, including the lines alias. No edits. / PTQ-0734: Registry migration was already present; removed its unused reader, associated imports/constant, and stranded comment. No tests or assertions changed. Required gate passed: TypeScript and all 689 test files / 11,585 tests. | review unconfirmed: PTQ-0731-separator-test-local-parse-reimplements-parsedoc.md — no working-tree change attributable; the cited local parse() at tests/import-specifier-separator-production-required.test.ts:233 is already gone at HEAD (line 12 now imports `parseDoc as parse` from ./helpers/e2e-s1, fixed in a prior commit), so re-triage for closure rather than re-fixing; PTQ-0732-01-diaglines-shadows-e2e-s1-export-pair.md — no working-tree change attributable; both local diagLines shadows are already gone at HEAD (typeenv-prototype-names.test.ts:22 and union-arm-literal-const-lowering.test.ts:20 now import diagLines from ./helpers/e2e-s1, fixed in a prior commit) — re-triage for closure; PTQ-0733-01-diaglines-reimplemented-both-in-scope-files.md — no working-tree change attributable; both local reimplementations are already gone at HEAD (union-generic-arm-lowering.test.ts:16 imports diagLines; unresolvable-operand-structural-target-adjudication.test.ts:26 imports `diagLines as lines`, fixed in a prior commit) — re-triage for closure. || [PTQ-0736-02-off-session-scripted-complete-harness-duplicated.md] PTQ-0736: Shared the queue mock, reply builder, tool reader, and model fixture across all eight suites; preserved reset policies and assertions. / PTQ-0737: Already resolved in current code: makeDeps is gone and parse delegates to parseDoc, preserving the retag.theta default. / PTQ-0738: Replaced the remaining structural-target scaffold with existing producer/root/checkpoint helpers; the receiver suite was already migrated. No tests deleted. / PTQ-0739: Reused shared workspace/load helpers with an optional registry-tools fixture; all assertions preserved. Required full gate passed for all changes: TypeScript and 11,585 tests across 689 files. | review unconfirmed: PTQ-0737-02-retag-makedeps-reimplements-e2e-s1.md — shed by the fixer: tests/wire-translation-inbound-retag.test.ts has no working-tree change; its module-scope makeDeps() (lines ~47-57) and parse() wrapper (~59-61) still redeclare what tests/helpers/e2e-s1.ts exports as parseDeps()/parseDoc(), and the file still imports nothing from ./helpers/e2e-s1. || [PTQ-0740-02-resolvecallableset-harness-quintuple-duplicated.md] PTQ-0740: Consolidated remaining callable-set helpers in tests/helpers/e2e-s1.ts, reused findCode, and removed the fourth file’s unused callee double. All tests and assertions preserved. Required verification command passed: TypeScript clean, 689 test files and 11,585 tests passed. / PTQ-0741: Shared the channel double through tests/helpers/recording-system-note-channel.ts, retaining the superset return shape and all recording assertions. No tests deleted; required gate passed. / PTQ-0742: No longer reproduces; the watcher test already imports shared REGISTRY. No registry edits made. / PTQ-0747: No longer reproduces; all three files already use shared registry readers, and both message wrappers delegate to registryMessageOf. No edits made. || [PTQ-0750-registry-oracle-reimplemented-inline-object-pair.md] PTQ-0750: Already resolved in current code; both files import the shared registry oracle. / PTQ-0751: Consolidated the duplicated harness into tests/helpers/e2e-s1.ts, preserving fixture paths and all test bodies. No tests deleted or renamed. Required gate passed: TypeScript and 11,585 tests across 689 files. / PTQ-0753: Already resolved in current code; registers() uses the imported isLoadParseError predicate. / PTQ-0754: Already resolved in current code; the test imports the shared ANTHROPIC_MODEL fixture. | review unconfirmed: PTQ-0750-registry-oracle-reimplemented-inline-object-pair.md — no working-tree change attributable to it; independently verified already resolved at HEAD by a prior committed batch (both inline-object files import REGISTRY from ./helpers/registry-oracle at line 1; the local parseRegistry/RegistryRow blocks are gone), so it needs closing via its own attributable fix record, not this diff. PTQ-0753-malformed-entry-resync-registers-reimplements-isloadparseerr.md — no working-tree change attributable; verified already resolved at HEAD (registers() at tests/inline-object-malformed-entry-resync.test.ts:294-295 is now !doc.diagnostics.some(isLoadParseError) with the helper imported from ./helpers/e2e-s1 at line 8), resolved by a prior committed batch. PTQ-0754-interpolation-parse-diagnostics-anthropic-model-not-migrated.md — no working-tree change attributable; verified already resolved at HEAD (tests/interpolation-parse-diagnostics.test.ts:1 imports ANTHROPIC_MODEL from ./helpers/scripted-live-session-harness; no local declaration remains, both use sites at :1068/:1075 use the import), resolved by a prior committed batch. ||
- qw20260919104142: skipped — [PTQ-0779-02-statement-executor-invoke-seam-scaffold-not-migrated.md] PTQ-0779: Already migrated to shared span and no-op checkpoint imports; no changes needed. / PTQ-0787: Replaced local parseDeps() with the existing helper import; all tests and assertions preserved. / PTQ-0788: Replaced local parseDeps() with the existing helper import; all tests and assertions preserved. / PTQ-0789: Both files now import the shared model and entry type and delegate appends to the newly exported existing helper; no tests or assertions removed. Required verification command passed: TypeScript and all 11,585 tests across 689 files. || [PTQ-0793-canonical-honesty-sorted-closure-duplicated.md] PTQ-0793: Reused assertKeysSorted; retained fragment equality, array-order, and whitespace checks. No tests deleted or renamed. / PTQ-0794: Reused inlineDefName; removed the inline hash computation and unused crypto import. No tests deleted or renamed. / PTQ-0795: Shared holder-bound accessors in scripted-live-session-harness.ts; preserved errors, casts, mocks, and assertions. No tests deleted or renamed. / PTQ-0796: Shared AST capture in e2e-s1.ts; preserved fixture paths and all three assertions. No tests deleted or renamed. Required gate passed for all four issues: TypeScript and 11,585 tests across 689 files; no production or quality-store changes. || [PTQ-0797-ctor-proto-named-field-livesessiondouble-not-migrated.md] PTQ-0797: Reused shared model, entry type, and append helpers; imported parseDeps from its current home, e2e-s1.ts. Recording behavior and assertions unchanged; no tests deleted. / PTQ-0798: Replaced all five duplicated diagnostic helpers across three files with existing exports; assertions unchanged and no tests deleted. / PTQ-0799: Replaced both local diagLines helpers with imports and removed unused types; assertions unchanged and no tests deleted. / PTQ-0800: Imported shared diagLines, preserving the lines wrapper and all assertions; removed unused types; no tests deleted. Exact required verification gate passed for all four issues: TypeScript clean, 689 test files and 11,585 tests passed. No production or quality-store edits. || [PTQ-0801-diaglines-reimplemented-inline-object-empty-pair.md] PTQ-0801: Replaced both local diagLines implementations with the existing shared helper; no tests removed. / PTQ-0804: Reused PARSE_REGISTRY and removed the duplicate registry interface/read; assertions unchanged and no tests removed. / PTQ-0806: Shared the diagnostic/fn harness across all five triaged sites, preserving the annotation-specific registration predicate; no tests renamed or removed. / PTQ-0808: Both triaged message readers now delegate to registryMessageOf, preserving registry scope and placeholder checks; no tests removed. Required gate passed for all fixes: tsc and 11,585 tests across 689 files. ||
