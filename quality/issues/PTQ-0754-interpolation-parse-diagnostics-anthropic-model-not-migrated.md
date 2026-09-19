---
id: PTQ-0754
title: interpolation-parse-diagnostics.test.ts redeclares the ANTHROPIC_MODEL fixture object instead of importing tests/helpers/scripted-live-session-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/interpolation-parse-diagnostics.test.ts:1017-1023
  - tests/helpers/scripted-live-session-harness.ts:36-47
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# interpolation-parse-diagnostics.test.ts redeclares the ANTHROPIC_MODEL fixture object instead of importing tests/helpers/scripted-live-session-harness.ts

## Observation
`tests/interpolation-parse-diagnostics.test.ts`'s group-(f) "rendered turn"
section declares its own module-scope `ANTHROPIC_MODEL` fixture object to seed
`ctx.model` / `ModelRegistry.getAvailable()` for its live prompt-mode drive.
`tests/helpers/scripted-live-session-harness.ts` already exports an object of
that exact name with field-for-field identical content, built for this same
purpose (its own header names the shape as "the bug-0288 fixture model" used
by prompt-mode drives over a scripted live session). The local declaration is
not an import of the helper.

## Evidence
tests/interpolation-parse-diagnostics.test.ts:1017-1023 — local declaration:
```ts
/** The user session's selected model (`ctx.model`) — provider derivation only. */
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```

tests/helpers/scripted-live-session-harness.ts:36-47 — the canonical,
already-exported object of the same name and shape:
```ts
/**
 * The user session's selected model (the bug-0288 fixture model). Distinct
 * `.api` / `.provider` strings (the bug-0009 fixture discipline) so a
 * synthesised `TransportError.provider` is checked against the API-shaped
 * value the PIC-50 derivation pins.
 */
export const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```

Import check: `grep -n "scripted-live-session-harness"
tests/interpolation-parse-diagnostics.test.ts` returns no hit — the file does
not import the helper module at all. Pattern-wide search:
`grep -rln "class LiveSessionDouble" tests/` returns 13 files, including
`interpolation-parse-diagnostics.test.ts`; `git log --oneline -1 --
tests/helpers/scripted-live-session-harness.ts` shows the helper (PTQ-0328)
migrated only three of that lineage (b0288, b0319, b0414, per its own header),
leaving this file's local `ANTHROPIC_MODEL` unmigrated.

## Why this is a problem
`tests/helpers/scripted-live-session-harness.ts` exists specifically to hold
this exact fixture object after a prior review found it (and its
`SessionEntryDouble`/`parseDeps`/`appendUserEntry` siblings) "redeclared
byte-for-byte" across files that drive `createProductionProducerDeps` →
`bindPromptConversation` → `executeBody` against a scripted live session — the
same pipeline `interpolation-parse-diagnostics.test.ts`'s group-(f)
`disposition()` helper drives. The object's own doc-comment in the canonical
helper cites two other fixture-discipline reasons (`bug-0288`/`bug-0009`) for
its exact field values, which this file's independent copy does not carry or
depend on, yet still had to reproduce field-for-field to get the same
behaviour.

## Suggested direction (non-binding, optional)
`tests/helpers/scripted-live-session-harness.ts` already exports
`ANTHROPIC_MODEL`; importing it in place of the local declaration is the
existing, purpose-built home for this exact fixture object.

## False-positive check
- Gate-pin check: `interpolation-parse-diagnostics.test.ts` does not match
  `*gate*.test.ts` or the named kin; the cited lines are a fixture-model
  constant, not a pinned count or corpus inventory assertion (the file's own
  census counts in its group-(g) section are a separate, legitimately pinned
  mechanism this finding does not touch).
- Recording-double check: `ANTHROPIC_MODEL` is a plain data fixture, not a
  recording double; the file's own `LiveSessionDouble` does record
  `sentQueryTexts` for positive assertions, not a "never called" witness, so
  the negative-witness carve-out is not implicated by this finding, which is
  scoped to the `ANTHROPIC_MODEL` object only.
- docs/bugs/ signature search: `grep -n "ANTHROPIC_MODEL"
  docs/bugs/*.md` returns no hit; the file is not a documented correct-reason
  red — `npx vitest run tests/interpolation-parse-diagnostics.test.ts` is
  this file's own subject (bug 0122's settled-rule witness), unrelated to
  fixture provenance.
- coverage-matrix/bug-doc citation search: `grep -rn
  "interpolation-parse-diagnostics" docs/reference/coverage-matrix.md
  docs/bugs/*.md` shows the file cited by bug 0122's own doc for its
  cell groups (a)-(g); none of those citations target lines 1011-1023, the
  fixture setup this finding proposes importing from the helper, and no
  merge/rename/delete of any cited cell is proposed.
- Coverage check: this finding is about a duplicated fixture-object
  DECLARATION, not a missing test path; every cell in the file's group (f)
  continues to pass under the current inline declaration.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced: the local `ANTHROPIC_MODEL` at tests/interpolation-parse-diagnostics.test.ts:1018-1023 is field-for-field identical to the export at tests/helpers/scripted-live-session-harness.ts:42-47, the file imports nothing from that helper (only ./helpers/e2e-s1 and ./helpers/theta-corpus), its two use sites (registryDouble getAvailable at :1075, ctxLive model at :1082) are both `as unknown as` casts so the import is a drop-in, the file passes today (41/41), and the helper's header + git log (feefe7ca, PTQ-0328) confirm the migration covered only b0288/b0319/b0414, leaving this copy a genuine residual (the PTQ-0301 precedent); no D7 carve-out applies (not a gate test, plain data fixture not a recording double, no docs/bugs or coverage-matrix pin on the cited lines, no merge/rename proposed) and no existing/resolved row or same-wave sibling cites this file as a location (PTQ-0272 is a different model()/registryOf() pair) (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
- qw20260919094008: skipped — [PTQ-0712-04-tool-admission-callablesetof-reimplemented.md] PTQ-0712: Shared callableSetOf across all three suites; retained both precondition assertions. / PTQ-0715: Extracted remaining duplicated helpers into existing helper modules; watcherAt and wiringAt were already shared. / PTQ-0716: Reused the compose-workspace harness, preserving the strict diagnostic-note precondition and all assertions. / PTQ-0717: Reused the production-load and workspace lifecycle helpers. No tests deleted or renamed across the cluster. Required gate passed: TypeScript and 11,585 tests across 689 files. || [PTQ-0719-04-tool-arg-parse-harness-makedeps-range-withcode-duplicated.md] PTQ-0719: Reused parseDeps and range; extended shared withCode to accept diagnostic lists. Assertions unchanged. / PTQ-0722: Reused production-load and workspace helpers, retaining lockstep’s stderr attribution wrapper. Tests unchanged. / PTQ-0723: Replaced both local load harnesses and workspace lifecycles with existing shared helpers. Per-row isolation and assertions preserved. / PTQ-0729: Migrated provider-gate scaffolding to the existing live/repair harness; retained body-only parsing and its distinct slug recipe. No tests deleted or renamed. Required gate passed for all fixes: tsc and 11,585 tests across 689 files. || [PTQ-0731-separator-test-local-parse-reimplements-parsedoc.md] PTQ-0731: Already imports parseDoc as parse; local duplicate is absent. No edits. / PTQ-0732: Both files already import shared diagLines; local duplicates are absent. No edits. / PTQ-0733: Both files already use shared diagLines, including the lines alias. No edits. / PTQ-0734: Registry migration was already present; removed its unused reader, associated imports/constant, and stranded comment. No tests or assertions changed. Required gate passed: TypeScript and all 689 test files / 11,585 tests. | review unconfirmed: PTQ-0731-separator-test-local-parse-reimplements-parsedoc.md — no working-tree change attributable; the cited local parse() at tests/import-specifier-separator-production-required.test.ts:233 is already gone at HEAD (line 12 now imports `parseDoc as parse` from ./helpers/e2e-s1, fixed in a prior commit), so re-triage for closure rather than re-fixing; PTQ-0732-01-diaglines-shadows-e2e-s1-export-pair.md — no working-tree change attributable; both local diagLines shadows are already gone at HEAD (typeenv-prototype-names.test.ts:22 and union-arm-literal-const-lowering.test.ts:20 now import diagLines from ./helpers/e2e-s1, fixed in a prior commit) — re-triage for closure; PTQ-0733-01-diaglines-reimplemented-both-in-scope-files.md — no working-tree change attributable; both local reimplementations are already gone at HEAD (union-generic-arm-lowering.test.ts:16 imports diagLines; unresolvable-operand-structural-target-adjudication.test.ts:26 imports `diagLines as lines`, fixed in a prior commit) — re-triage for closure. || [PTQ-0736-02-off-session-scripted-complete-harness-duplicated.md] PTQ-0736: Shared the queue mock, reply builder, tool reader, and model fixture across all eight suites; preserved reset policies and assertions. / PTQ-0737: Already resolved in current code: makeDeps is gone and parse delegates to parseDoc, preserving the retag.theta default. / PTQ-0738: Replaced the remaining structural-target scaffold with existing producer/root/checkpoint helpers; the receiver suite was already migrated. No tests deleted. / PTQ-0739: Reused shared workspace/load helpers with an optional registry-tools fixture; all assertions preserved. Required full gate passed for all changes: TypeScript and 11,585 tests across 689 files. | review unconfirmed: PTQ-0737-02-retag-makedeps-reimplements-e2e-s1.md — shed by the fixer: tests/wire-translation-inbound-retag.test.ts has no working-tree change; its module-scope makeDeps() (lines ~47-57) and parse() wrapper (~59-61) still redeclare what tests/helpers/e2e-s1.ts exports as parseDeps()/parseDoc(), and the file still imports nothing from ./helpers/e2e-s1. || [PTQ-0740-02-resolvecallableset-harness-quintuple-duplicated.md] PTQ-0740: Consolidated remaining callable-set helpers in tests/helpers/e2e-s1.ts, reused findCode, and removed the fourth file’s unused callee double. All tests and assertions preserved. Required verification command passed: TypeScript clean, 689 test files and 11,585 tests passed. / PTQ-0741: Shared the channel double through tests/helpers/recording-system-note-channel.ts, retaining the superset return shape and all recording assertions. No tests deleted; required gate passed. / PTQ-0742: No longer reproduces; the watcher test already imports shared REGISTRY. No registry edits made. / PTQ-0747: No longer reproduces; all three files already use shared registry readers, and both message wrappers delegate to registryMessageOf. No edits made. || [PTQ-0750-registry-oracle-reimplemented-inline-object-pair.md] PTQ-0750: Already resolved in current code; both files import the shared registry oracle. / PTQ-0751: Consolidated the duplicated harness into tests/helpers/e2e-s1.ts, preserving fixture paths and all test bodies. No tests deleted or renamed. Required gate passed: TypeScript and 11,585 tests across 689 files. / PTQ-0753: Already resolved in current code; registers() uses the imported isLoadParseError predicate. / PTQ-0754: Already resolved in current code; the test imports the shared ANTHROPIC_MODEL fixture. | review unconfirmed: PTQ-0750-registry-oracle-reimplemented-inline-object-pair.md — no working-tree change attributable to it; independently verified already resolved at HEAD by a prior committed batch (both inline-object files import REGISTRY from ./helpers/registry-oracle at line 1; the local parseRegistry/RegistryRow blocks are gone), so it needs closing via its own attributable fix record, not this diff. PTQ-0753-malformed-entry-resync-registers-reimplements-isloadparseerr.md — no working-tree change attributable; verified already resolved at HEAD (registers() at tests/inline-object-malformed-entry-resync.test.ts:294-295 is now !doc.diagnostics.some(isLoadParseError) with the helper imported from ./helpers/e2e-s1 at line 8), resolved by a prior committed batch. PTQ-0754-interpolation-parse-diagnostics-anthropic-model-not-migrated.md — no working-tree change attributable; verified already resolved at HEAD (tests/interpolation-parse-diagnostics.test.ts:1 imports ANTHROPIC_MODEL from ./helpers/scripted-live-session-harness; no local declaration remains, both use sites at :1068/:1075 use the import), resolved by a prior committed batch. ||
