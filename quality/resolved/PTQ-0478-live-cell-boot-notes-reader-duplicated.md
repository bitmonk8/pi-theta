---
id: PTQ-0478
title: Six in-scope live cells each re-derive tests/live/harness.ts's private collectSystemNotes body as a local bootNotes/systemNotesOf function
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts:341-368
  - tests/live/b0274live-reserved-keyword-type-head-registration.test.ts:272-296
  - tests/live/b0275live-escaping-tools-entry-below-immediate-callee-live-cell.test.ts:364-391
  - tests/live/b0277live-unapplied-generic-head-registration.test.ts:202-229
  - tests/live/b0278live-result-arity-mismatch-registration.test.ts:176-203
  - tests/live/b0280live-prompt-mode-below-immediate-callee-live-cell.test.ts:291-318
  - tests/live/harness.ts:813-838
sites: 6                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Six in-scope live cells each re-derive tests/live/harness.ts's private collectSystemNotes body as a local bootNotes/systemNotesOf function

## Observation
Each of the six files in this review's scope declares its own function
(`bootNotes` in three files, `systemNotesOf` in two, and the identical logic
inlined directly in a test body in the sixth) that walks
`handle.sessionManager.getEntries()`, reads `customType === "theta-system-note"`
entries' `content` (string or text-part array) and `customType ===
"theta-progress-entry"` entries' `data.content`, and returns the accumulated
strings. `tests/live/harness.ts` already contains a function
(`collectSystemNotes`, line 813) that walks the identical shape over an
`entries: readonly unknown[]` parameter with byte-identical branch logic and
the identical PIC-72 comment block, but it is not exported from the module.

## Evidence

tests/live/harness.ts:813-838 (private, not exported):
```ts
function collectSystemNotes(entries: readonly unknown[]): readonly string[] {
  const notes: string[] = [];
  for (const entry of entries) {
    const e = entry as { customType?: string; content?: unknown; data?: unknown };
    if (e.customType === "theta-system-note") {
      if (typeof e.content === "string") notes.push(e.content);
      else if (Array.isArray(e.content)) {
        for (const part of e.content) {
          const t = (part as { text?: string }).text;
          if (typeof t === "string") notes.push(t);
        }
      }
    } else if (e.customType === "theta-progress-entry") {
      // PIC-72 (runtime-event-channel.md): the three migrated operator-note
      // classes (parse/load/type diagnostic BATCH, structural-change,
      // binder-model recovery) deliver through the `theta-progress-entry`
      // custom-entry channel instead of `theta-system-note` whenever both
      // entry members are present (entry-channel.ts). The entry's `data`
```

tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts:341-355
(re-read immediately before filing; identical branch logic and identical
comment text, operating on `LiveExtensionHandle` instead of a raw entry
array):
```ts
function bootNotes(handle: LiveExtensionHandle): readonly string[] {
  const notes: string[] = [];
  for (const entry of handle.sessionManager.getEntries()) {
    const e = entry as { customType?: string; content?: unknown; data?: unknown };
    if (e.customType === "theta-system-note") {
      if (typeof e.content === "string") notes.push(e.content);
      else if (Array.isArray(e.content)) {
        for (const part of e.content) {
          const t = (part as { text?: string }).text;
          if (typeof t === "string") notes.push(t);
        }
      }
    } else if (e.customType === "theta-progress-entry") {
```

tests/live/b0275live-escaping-tools-entry-below-immediate-callee-live-cell.test.ts:364-368
and tests/live/b0280live-prompt-mode-below-immediate-callee-live-cell.test.ts:291-295
open with the identical `function bootNotes(handle: LiveExtensionHandle):
readonly string[] {` signature and the same five-line loop opening as the
b0271 excerpt above (confirmed by direct read of both files at the cited
offsets).

tests/live/b0277live-unapplied-generic-head-registration.test.ts:202-206 and
tests/live/b0278live-result-arity-mismatch-registration.test.ts:176-180 open
with the identical `function systemNotesOf(handle: { sessionManager: {
getEntries: () => unknown[] } }): string[] {` signature and the same loop body.

tests/live/b0274live-reserved-keyword-type-head-registration.test.ts:272-283
(the same logic, inlined directly inside the `it()` body rather than factored
into a function):
```ts
      const notes: string[] = [];
      for (const entry of handle.sessionManager.getEntries()) {
        const e = entry as { customType?: string; content?: unknown; data?: unknown };
        if (e.customType === "theta-system-note") {
          if (typeof e.content === "string") notes.push(e.content);
          else if (Array.isArray(e.content)) {
            for (const part of e.content) {
              const t = (part as { text?: string }).text;
              if (typeof t === "string") notes.push(t);
            }
          }
        } else if (e.customType === "theta-progress-entry") {
```

Exact search: `grep -n "^function bootNotes\|^function systemNotesOf" tests/live/*.test.ts` restricted to the six files in this review's scope returns exactly the five named-function hits above (b0271, b0275, b0280 as `bootNotes`; b0277, b0278 as `systemNotesOf`); `grep -n "const notes: string\[\] = \[\];" tests/live/b0274live-reserved-keyword-type-head-registration.test.ts` locates the sixth, inlined occurrence at line 272. All six bodies are byte-identical in their branch structure and PIC-72 comment text, diverging only in the parameter shape (`LiveExtensionHandle` vs. a bare `{ sessionManager: ... }` structural type vs. no parameter at all in the inlined case) and in whether the result is `readonly string[]` or `string[]`.

## Why this is a problem
`tests/live/harness.ts` already implements this exact walk as `collectSystemNotes` (line 813), used internally by the harness's own `driveSlashCaptureTurn`. Because that function is not exported, each of the six files in this review's scope re-derives the same ~20-line branch structure, including the same PIC-72 explanatory comment, under two different local names. A change to the `theta-progress-entry` channel's shape (the migration the PIC-72 comment itself describes as already having happened once) touches `collectSystemNotes` in the harness and independently touches all six local copies, with nothing to signal a copy left un-updated.

## Suggested direction (non-binding, optional)
`tests/live/harness.ts`'s own `collectSystemNotes` already solves this for the harness's internal use; exporting it (or an equivalent taking a `LiveExtensionHandle`) is the natural shared home the six local copies point at.

## False-positive check
- Gate-pin check: none of the six files matches `*gate*.test.ts` or the named gate kin; none of the cited excerpts is a pinned-count or inventory assertion.
- Recording-double check: the six local functions read a recording double's already-recorded entries; the finding is about the reader code being duplicated, not about a "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "Status" docs/bugs/0271-*.md docs/bugs/0274-*.md docs/bugs/0275-*.md docs/bugs/0277-*.md docs/bugs/0278-*.md docs/bugs/0280-*.md` — all six report fixed status at HEAD; none of the six test files is a documented correct-reason red, so the reader-duplication claim is not masking an open bug.
- coverage-matrix/bug-doc citation search: `grep -rn "b0271live\|b0274live\|b0275live\|b0277live\|b0278live\|b0280live" docs/reference/coverage-matrix.md` — 0 hits (these six live-cell files are not cited by name in the coverage matrix); this finding proposes no merge, rename or deletion of any test, only that the six local reader functions could import a shared export instead of re-deriving it.
- Coverage check: this is not a claim that a path is untested; every cited function is already exercised by its own file's assertions. Scoped to the shared reader code only.
- Overlap check: `grep -rl "bootNotes\|systemNotesOf" quality/intake quality/resolved` before filing returned no existing finding citing this function-name pair; this is a new observation distinct from the already-filed `qw20260917154546-d7-01-b0270-compose-workspace-harness-not-migrated.md` (which covers a different pair of non-`live` files and a different harness bundle — `makeHost`/`runLoadPass`/`requireDriven`, not the note-channel reader) and distinct from resolved PTQ-0237/PTQ-0230 (which cover the non-`live` `tests/b0275-...` file's registry-oracle and load-pass-diagnostic bundles, not this file's `tests/live/b0275live-...` counterpart).

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: all six excerpts reproduce at the cited lines (b0271:341, b0274:272 inlined, b0275:364, b0277:202, b0278:176, b0280:291) with branch logic and PIC-72 comment byte-identical to tests/live/harness.ts:814 collectSystemNotes, which greps as non-exported (used only at harness.ts:553/676/732); all six bug docs are `fixed`, coverage-matrix cites none of the six by name, no .skip/.only; in-scope D7 boilerplate/copy-paste duplication in tests/ with no tracked PTQ on this root cause (PTQ-0229 is b0287/b0289's entry-fixture builders, not the reader) — note the pattern is repo-wider (58 tests/ files carry the cast line, 12 a named bootNotes/systemNotesOf) and same-wave siblings d7-01-note-channel-extraction / d7-01-systemnotecontents-octuplicated / d7-71 / d7-73 / d7-90 / d7-96-03 / d7-97-01 / d7-99-02 file the same root cause over disjoint file sets, so acceptance should consolidate them under one canonical export-collectSystemNotes issue (triage: claude-fable-5-1)
