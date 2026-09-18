---
id: PTQ-0773
title: The `F(path, lines)` PlantedFile fixture builder is redeclared byte-identically in three tests/live/hardening files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/hardening/question-operand-defect-abort.test.ts:41-45
  - tests/live/hardening/session-convdrive.test.ts:31-35
  - tests/live/hardening/session-promptstream.test.ts:41-45
sites: 3
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The `F(path, lines)` PlantedFile fixture builder is redeclared byte-identically in three tests/live/hardening files

## Observation
`tests/live/hardening/question-operand-defect-abort.test.ts`,
`tests/live/hardening/session-convdrive.test.ts`, and
`tests/live/hardening/session-promptstream.test.ts` each declare a
module-scope `const F = (path: string, lines: string[]): PlantedFile => ({...})`
arrow function that builds a `source: "project"` `PlantedFile` by joining
`lines` with `"\n"`. All three bodies are byte-identical. All three files
already import the `PlantedFile` type from the sibling `./probe-harness`
module, which defines `PlantedFile` but exports no such builder.

## Evidence
`tests/live/hardening/question-operand-defect-abort.test.ts:41-45`:
```ts
const F = (path: string, lines: string[]): PlantedFile => ({
  source: "project",
  path,
  text: lines.join("\n"),
});
```

`tests/live/hardening/session-convdrive.test.ts:31-35`:
```ts
const F = (path: string, lines: string[]): PlantedFile => ({
  source: "project",
  path,
  text: lines.join("\n"),
});
```

`tests/live/hardening/session-promptstream.test.ts:41-45`:
```ts
const F = (path: string, lines: string[]): PlantedFile => ({
  source: "project",
  path,
  text: lines.join("\n"),
});
```

Exact search: `grep -rn "^const F = (path: string, lines: string\[\])"
tests/live/hardening/*.ts` → exactly these three hits (re-read confirms no
fourth site in `tests/live/hardening/`).

## Why this is a problem
The same 5-line fixture builder is retyped whole into three separate files
rather than defined once. All three files already import `PlantedFile` (the
type `F`'s return shape must satisfy) from the sibling `./probe-harness`
module, so each author reached for the shared module for the type but then
re-derived the identical constructor function locally instead of importing
one shared definition.

## Suggested direction (non-binding, optional)
`tests/live/hardening/probe-harness.ts` already exports the `PlantedFile`
interface `F`'s return value is shaped against, and is the module all three
call sites already import from; it is the natural home for a single exported
builder.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named gate kinds (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate).
- Recording-double check: `F` builds a plain fixture object from its
  arguments; it records no calls and backs no "never called" assertion, so
  the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "question-operand-defect-abort\|session-convdrive\|session-promptstream" docs/bugs/*.md`
  → `docs/bugs/0019-question-operand-bypasses-result-normalisation.md` cites
  `question-operand-defect-abort.test.ts` as its live witness, and
  `docs/bugs/0254-verbatim-echo-drive-sentinels-survive-in-three-hardening-files.md`
  names `session-promptstream.test.ts:22` only as an example of an
  already-conformant task-question drive, not as a member of its three-file
  fix group; neither document states a rationale for redeclaring the `F`
  builder locally rather than sharing it, and neither pins the builder's body
  as required to diverge.
- coverage-matrix/bug-doc citation search: `grep -n
  "question-operand-defect-abort\|session-convdrive\|session-promptstream"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name, count, or assertion — only that the
  builder's definition could be shared — so the citation carve-out does not
  bind.
- Coverage check: the claim is entirely about a repeated helper-function
  DEFINITION, not a missing test path; every copy is exercised by the tests in
  its own file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three `const F = (path, lines): PlantedFile => ({ source: "project", path, text: lines.join("\n") })` copies reproduce byte-identically at the cited lines (question-operand-defect-abort:41-45, session-convdrive:31-35, session-promptstream:41-45); `grep -rn 'PlantedFile => ({' tests/` yields exactly those three sites, `tests/live/hardening/probe-harness.ts` exports the `PlantedFile` interface (150-156) but no builder, and all three files already import from it; in-scope D7 copy-paste fixture, not a gate/recording-double/witness-list carve-out (no it()/describe() change proposed; the 9 bug-doc hits — not 2 as the FP-check says — all concern drive sentinels, none pins the builder), and no store row tracks it (sibling d7-127-03 targets the offline twin tests/question-operand-defect.test.ts) (triage: claude-fable-5-1)
