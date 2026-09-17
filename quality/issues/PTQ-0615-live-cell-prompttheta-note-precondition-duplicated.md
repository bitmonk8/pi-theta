---
id: PTQ-0615
title: b0274live/b0277live/b0278live each redeclare the identical promptTheta builder, CASE_CODE constant, and note-channel-precondition fixture body
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/b0274live-reserved-keyword-type-head-registration.test.ts:143,148-150,224-226
  - tests/live/b0277live-unapplied-generic-head-registration.test.ts:150,155-157,194-198
  - tests/live/b0278live-result-arity-mismatch-registration.test.ts:129,134-136,169-173
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0274live/b0277live/b0278live each redeclare the identical promptTheta builder, CASE_CODE constant, and note-channel-precondition fixture body

## Observation
Three of the six files in this review's scope each declare an identical
two-line `promptTheta(bodyLines)` builder, an identical `CASE_CODE =
"theta/parse/binding-case-mismatch"` constant, and an identical planted
fixture whose only structural role is a note-channel precondition: a theta
whose body is `["let P = 1", "@`hi`"]` (or the same two lines inlined) run
through `promptTheta`, at a stem that differs only in the bug-number prefix
(`b0274livenotechannel`, `b0277livenotechannel`, `b0278livenotechannel`).

## Evidence

tests/live/b0274live-reserved-keyword-type-head-registration.test.ts:143,148-150
(re-read immediately before filing):
```ts
const CASE_CODE = "theta/parse/binding-case-mismatch";
...
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "description: d", "mode: prompt", "---", "", ...bodyLines].join("\n") + "\n";
}
```
and its note-channel fixture at 224-226:
```ts
        stem: "b0274livenotechannel",
        text: promptTheta(["let P = 1", "@`hi`"]),
      },
```

tests/live/b0277live-unapplied-generic-head-registration.test.ts:150,155-157,194-198
(identical `CASE_CODE` value, identical `promptTheta` body, identical fixture
shape as a named `NOTE_CHANNEL` constant):
```ts
const CASE_CODE = "theta/parse/binding-case-mismatch";
...
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "description: d", "mode: prompt", "---", "", ...bodyLines].join("\n") + "\n";
}
...
const NOTE_CHANNEL: PlantedTheta = {
  source: "project",
  stem: "b0277livenotechannel",
  text: promptTheta(["let P = 1", "@`hi`"]),
};
```

tests/live/b0278live-result-arity-mismatch-registration.test.ts:129,134-136,169-173
reproduces the identical `CASE_CODE`, `promptTheta`, and `NOTE_CHANNEL` shape
at those offsets (confirmed by direct read — only the stem's bug-number
prefix differs).

Exact search: `grep -n '^const CASE_CODE = "theta/parse/binding-case-mismatch";$' tests/live/b0274live-reserved-keyword-type-head-registration.test.ts tests/live/b0277live-unapplied-generic-head-registration.test.ts tests/live/b0278live-result-arity-mismatch-registration.test.ts` returns exactly one hit per file, all with the identical right-hand-side string. `grep -n '"let P = 1"' ` over the same three files returns one hit per file, each immediately followed by `"@\`hi\`"`.

## Why this is a problem
Each file's own comment explains the note-channel precondition identically ("a parse fault that existed and fired before this change-set... If it does not, the channel — not this bug — is the fault"), and each file re-derives the same builder, the same borrowed code constant, and the same two-line fixture body to implement that identical precondition rather than sharing one definition. A change to what "bug 0139's" already-live code is, or to the `promptTheta` frontmatter shape all three files' other fixtures also depend on, touches three independently-typed copies with nothing to signal a copy left un-updated.

## Suggested direction (non-binding, optional)
A shared `promptTheta` builder and a shared `CASE_CODE`/note-channel-precondition-fixture pair, parameterised on the bug-number stem prefix, is the natural shared home the three files' identical declarations point at.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the named gate kin; the cited lines are a builder function and fixture literals, not pinned-count assertions.
- Recording-double check: not applicable — `promptTheta` and the note-channel fixture are planted source text, not a recording double or "never called" witness.
- docs/bugs/ signature search: `grep -n "Status" docs/bugs/0274-*.md docs/bugs/0277-*.md docs/bugs/0278-*.md` — all three report fixed status at HEAD; none is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rn "b0274live\|b0277live\|b0278live" docs/reference/coverage-matrix.md` — 0 hits; this finding proposes no merge, rename or deletion of any test, only that the shared builder/constant/fixture could be declared once instead of three times.
- Coverage check: not a claim of untested behaviour; each file's own precondition assertion against its own planted fixture is unaffected.
- Overlap check: this finding's cited ranges (`CASE_CODE`, `promptTheta`, the `NOTE_CHANNEL`/`b027Xlivenotechannel` fixture) are disjoint from the sibling candidate `qw20260917154546-d7-01-live-cell-boot-notes-reader-duplicated.md`, which covers these same three files' separate `systemNotesOf` note-reader function at different line offsets — a distinct root cause (fixture/builder duplication versus channel-reader-function duplication). No existing filed or resolved finding names this three-file `promptTheta`/`CASE_CODE`/note-channel-fixture duplication.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: `const CASE_CODE = "theta/parse/binding-case-mismatch";` sits at exactly b0274live:143 / b0277live:150 / b0278live:129, the two-line `promptTheta` body is byte-identical at 148-149 / 155-156 / 134-135, and the `b027Xlivenotechannel` fixture with `promptTheta(["let P = 1", "@\`hi\`"])` is at 224-225 / 197-198 / 171-172 (both stated greps reproduce at one hit per file); each file's header names b0274live as the shape it "mirrors", so this is a copy-paste fixture/boilerplate class in tests/ — not a gate/pin test, not a recording double, 0 coverage-matrix hits, no merge/rename/delete proposed, failLoudly posture untouched; no store row tracks it (PTQ-0396's `promptTheta` is the package-merge `(description, body)` builder, a different function; intake siblings d7-01/d7-71 cover the separate `systemNotesOf` reader); note for the fixer: the same byte-identical builder + `CASE_CODE` + note-channel fixture also recurs in b0262live:168, b0281live:202, b0282live:269 and b0284live:256 (7 copies total, `grep -rl '"description: d", "mode: prompt"' tests/`), so the shared home should sweep all seven, not only the three this shard cited (triage: claude-fable-5-1)
