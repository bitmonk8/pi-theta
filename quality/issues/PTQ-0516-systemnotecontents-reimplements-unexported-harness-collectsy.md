---
id: PTQ-0516
title: Six in-scope live cells reimplement harness.ts's unexported collectSystemNotes as a local systemNoteContents function
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/live-session-control.test.ts:120-138
  - tests/live/malformed-tool-entry-message-single-line-live-cell.test.ts:137-160
  - tests/live/nested-array-element-sink-descent-live-cell.test.ts:134-161
  - tests/live/par-for-body-qry4-mismatch-live-cell.test.ts:139-166
  - tests/live/params-default-unterminated-literal-live-cell.test.ts:116-143
  - tests/live/params-inline-enum-live-cell.test.ts:148-175
  - tests/live/harness.ts:814-838
sites: 6
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Six in-scope live cells reimplement harness.ts's unexported collectSystemNotes as a local systemNoteContents function

## Observation
Six of the eleven files in this review's scope each declare a module-scope
function that walks a settled `SessionManager` entry list and extracts the
`theta-system-note` / `theta-progress-entry` channel contents. Five of the six
declarations (all but `live-session-control.test.ts`) are byte-identical to
each other, including the PIC-72 doc comment inside the function body; the
sixth omits only that inline comment while keeping the identical code
branches. `tests/live/harness.ts` already contains this exact function, under
the name `collectSystemNotes`, but does not export it — so every file in this
review's scope that needs the full-session (not drive-scoped) reading of this
channel restates the walk locally instead of importing it.

## Evidence
`tests/live/harness.ts:814-838` (the canonical, unexported original):
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
```
(truncated at 15 lines; the function continues for four more lines identical
in shape across every site below: extract `data.content` and return `notes`.)

`tests/live/live-session-control.test.ts:120-136` (only site that drops the
PIC-72 comment; the code branches are otherwise identical):
```ts
function systemNoteContents(entries: readonly unknown[]): readonly string[] {
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
      const data = e.data as { content?: unknown } | undefined;
      if (typeof data?.content === "string") notes.push(data.content);
    }
  }
```

`tests/live/malformed-tool-entry-message-single-line-live-cell.test.ts:137-160`
(this site inlines the same walk directly in the test body rather than as a
named function, immediately after a comment reading "reader shape mirrors
tests/live/fn-param-list-unclosed-live-cell.test.ts's notes loop" — a third
file this cell's own author names as a fourth copy outside this review's
scope):
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
          const data = e.data as { content?: unknown } | undefined;
          if (typeof data?.content === "string") notes.push(data.content);
        }
      }
```

`tests/live/nested-array-element-sink-descent-live-cell.test.ts:134-149`,
`tests/live/par-for-body-qry4-mismatch-live-cell.test.ts:139-154`, and
`tests/live/params-default-unterminated-literal-live-cell.test.ts:116-131`
each declare the identical named function `systemNoteContents`, re-read from
each file and confirmed byte-identical to `harness.ts`'s `collectSystemNotes`
including the full PIC-72 comment, e.g.
`tests/live/par-for-body-qry4-mismatch-live-cell.test.ts:139-153`:
```ts
function systemNoteContents(entries: readonly unknown[]): readonly string[] {
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
```

`tests/live/params-inline-enum-live-cell.test.ts:148-163` carries the same
declaration and, uniquely among the six, states the duplication in its own
doc comment immediately above the function (lines 143-147):
```ts
/**
 * The `theta-system-note` channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md §"Assert on
 * real observables"). Mirrors `live-production-acceptance.test.ts`'s
 * unexported `systemNoteContents` / `./harness`'s unexported
 * `collectSystemNotes` — restated here because this is a standalone file.
```

Search: `grep -n "^function systemNoteContents\|const notes: string\[\] = \[\];"` across the eleven in-scope files, cross-checked against `grep -n "collectSystemNotes" tests/live/harness.ts`, confirms exactly these six in-scope sites carry the walk (the remaining five in-scope files —
`match-pattern-increment-decrement-live-cell.test.ts`,
`object-pattern-head-field-set-live-cell.test.ts`,
`object-pattern-head-unresolved-live-cell.test.ts`,
`off-session-overflow-classification.test.ts`, and
`par-for-body-return-live-cell.test.ts` — never read this channel off the
full session, either because they are registration-only cells or because
they read `driveSlashCaptureTurn`'s already-scoped `systemNotes` field
instead).

## Why this is a problem
`tests/live/harness.ts` already contains this exact walk under the name
`collectSystemNotes` (line 814), used internally to populate
`DrivenTurn.systemNotes` and `classifyLastTurn`'s note check. It is declared
without the `export` keyword, so no importer outside `harness.ts` itself can
reach it. Six files that need the FULL-session (not drive-scoped) reading of
the same channel each restate the identical ~15-25 line walk instead, one of
them (`params-inline-enum-live-cell.test.ts`) saying so explicitly in its own
doc comment, and another (`malformed-tool-entry-message-single-line-live-cell.test.ts`)
naming a fourth copy outside this review's scope as the shape it mirrors. A
change to the channel's shape (e.g. a future PIC-7x migration analogous to
PIC-72's own arrival) must be applied to seven near-identical bodies across
this scope alone rather than one.

## Suggested direction (non-binding, optional)
Exporting `collectSystemNotes` from `./harness` is the natural shared home
these six local declarations already point at by name and by doc-comment
cross-reference; the fix stage owns whether and how to do that.

## False-positive check
Gate-pin check: none of the six files match `*gate*.test.ts` or the named
gate/census kin, so the pinned-count carve-out does not apply. Recording-double
check: `systemNoteContents`/`collectSystemNotes` is a channel READER, not a
recording double asserting a negative witness — it does not fall under the
MUST-NOT-witness carve-out. docs/bugs/ signature search: this finding is about
duplicated test-helper code, not about a red/disabled test, so the
documented-correct-reason-red carve-out is not implicated; no search of
docs/bugs/ was needed for that reason. Coverage-matrix / bug-doc citation
search: `grep -rn "systemNoteContents\|collectSystemNotes" docs/reference/coverage-matrix.md`
and a search of `docs/bugs/*.md` for each of the six file names found no hits
naming this helper or citing these files' internals — this finding does not
propose renaming, merging, or deleting any test, only naming where the
canonical body of the six duplicated readers already lives, so the citation
pin is not engaged either way. This finding stays inside D7: it does not argue
a test should exist (coverage) and does not touch src/, extensions/, or
tools/.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all six excerpts reproduce at the cited lines (five byte-identical to harness.ts:814-838 including the PIC-72 comment, live-session-control.test.ts identical minus that comment); `function collectSystemNotes` at harness.ts:814 carries no `export` and grep across src/extensions/tools/tests finds no importer (only harness.ts's own three callers at :553/:676/:732 plus private redeclarations elsewhere), so the six in-scope files cannot reach it and restate the walk — D7 boilerplate/copy-paste helper duplication, all locations under tests/, no gate/recording-double/coverage-matrix carve-out engaged; not tracked by PTQ-0229 (b0287/b0289 message/note fixture builders) or PTQ-0326 (src/ channel const) (triage: claude-fable-5-1)
