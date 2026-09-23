---
id: PTQ-1347
title: schema-body-unclosed-at-eof-live-cell.test.ts reimplements collectSystemNotes's theta-system-note/theta-progress-entry extraction inline instead of importing it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/schema-body-unclosed-at-eof-live-cell.test.ts:165-188
  - tests/live/harness.ts:40-41
  - tests/helpers/recording-system-note-channel.ts:118-121
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# schema-body-unclosed-at-eof-live-cell.test.ts reimplements collectSystemNotes's theta-system-note/theta-progress-entry extraction inline instead of importing it

## Observation
`tests/live/schema-body-unclosed-at-eof-live-cell.test.ts`'s single `it()`
body walks `handle.sessionManager.getEntries()` and manually extracts
`theta-system-note` / `theta-progress-entry` channel contents into a local
`notes: string[]` array, including the identical PIC-72 migration comment
that documents why `theta-progress-entry` is unioned in. `tests/live/harness.ts`
(the same module this file already imports `bootShippedExtension`,
`driveSlashCaptureTurn`, `plantThetaWorkspace`, `requireLiveProvider`, and
`PlantedTheta` from) re-exports the canonical `collectSystemNotes` helper by
name at line 41. The file never imports or calls it.

## Evidence

`tests/live/schema-body-unclosed-at-eof-live-cell.test.ts:165-188`:
```ts
      // Real observable 2: the note channel. `theta-system-note` entries are
      // read off the settled in-memory `SessionManager` (deterministic; no
      // dependence on event timing), exactly as `driveSlashCaptureTurn`'s
      // `systemNotes` channel does for driven turns.
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
          // PIC-72 (runtime-event-channel.md): the three migrated operator-note
          // classes (parse/load/type diagnostic BATCH, structural-change,
          // binder-model recovery) deliver through the `theta-progress-entry`
          // custom-entry channel instead of `theta-system-note` whenever both
          // entry members are present (entry-channel.ts). The entry's `data`
          // carries the SAME `SystemNote` shape the message channel used to
          // carry (PIC-71: byte-identical rendered content), so extracting its
          // `content` keeps every existing substring assertion working
          // unchanged — a channel-union repair, not a weakening.
          const data = e.data as { content?: unknown } | undefined;
          if (typeof data?.content === "string") notes.push(data.content);
        }
      }
```

`tests/live/harness.ts:40-41` (the re-export this file's own import block
already draws five other symbols from):
```ts
import { collectSystemNotes } from "../helpers/recording-system-note-channel";
export { collectSystemNotes } from "../helpers/recording-system-note-channel";
```

`tests/helpers/recording-system-note-channel.ts:118-121` (the canonical
body):
```ts
/** Extract content strings in transcript order, keeping each text part separate. */
export function collectSystemNotes(entries: readonly unknown[]): readonly string[] {
  return collectSystemNoteEntries(entries).flatMap((note) => note.contents);
}
```

`tests/live/schema-body-unclosed-at-eof-live-cell.test.ts:83-89` (the file's
own import list, drawn from the same module that re-exports the helper):
```ts
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
```

Sibling files in this same review scope that touch the identical channel
already import the canonical helper instead of reimplementing it:
`tests/live/unterminated-template-registration-live-cell.test.ts:87` and
`tests/live/withheld-binder-provenance-live-cell.test.ts:79` both write
`collectSystemNotes,` inside their `./harness` import block.

## Why this is a problem
The file re-derives, byte-for-byte including the PIC-72 migration comment,
logic a canonical helper already exports through the same barrel module
(`tests/live/harness.ts`) this file already imports five other symbols from.
Two sibling files in this exact review scope (`unterminated-template-registration-live-cell.test.ts`,
`withheld-binder-provenance-live-cell.test.ts`) import the helper from the
identical module for the identical purpose, showing the import path is
already in routine, working use next to this file's inline copy.

## Suggested direction (non-binding, optional)
Adding `collectSystemNotes` to the existing `./harness` import block in place
of the inline loop is the natural next step, observationally — the same
import path two sibling files in this review's scope already use for the
same channel extraction.

## False-positive check
- Gate-pin check: this file does not match `*gate*.test.ts` or the named
  gate kin; the cited lines are a note-extraction loop, not a pinned count.
- Recording-double check: this is not a "never called" negative witness; it
  is a channel-content reader duplicated against a canonical helper.
- docs/bugs/ signature search: `grep -n "Status" docs/bugs/0245-*.md` →
  "Status: fixed (0.226.0)"; the bug is fixed, and nothing in the doc cites
  this inline extraction as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "schema-body-unclosed-at-eof-live-cell" docs/reference/coverage-matrix.md`
  → 0 hits; this finding proposes no merge, rename or deletion of the test
  file or its `it()` block, only that the already-imported barrel module's
  `collectSystemNotes` re-export could be used instead of the inline copy.
- Coverage check: not a claim of untested behaviour; the file's own
  fixed-observable assertions against `notes`/`joined` are unaffected.
- Duplicate-search: `grep -rl "schema-body-unclosed-at-eof-live-cell"
  quality/resolved/*.md quality/intake/*.md` → the only hit is
  PTQ-1042 (an unrelated CASE_CODE/promptTheta precondition-pair finding);
  the resolved PTQ-1064 fix (systemNoteContents quadruplicated) named four
  different files (`reserved-keyword-remaining-positions-live-cell.test.ts`,
  `schema-field-discard-recovery-live-cell.test.ts`,
  `unterminated-template-registration-live-cell.test.ts`,
  `withheld-binder-provenance-live-cell.test.ts`) and its fix touched only
  those four — confirmed by re-reading all four current files, which now
  import `collectSystemNotes` — while this file was not named or fixed by
  that filing and still carries the inline copy today. A same-wave sibling
  finding (`qw20260922211400-d7-01-systemnotecontents-reimplemented-b0046live-alias-sink.md`)
  covers the identical pattern in two different, unrelated files
  (`b0046live-by-clause-undecided-inputs-live-cell.test.ts`,
  `alias-sink-array-element-check-live-cell.test.ts`), neither of which is
  in this review's briefed scope or cited here.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — D7 boilerplate duplication verified: tests/live/schema-body-unclosed-at-eof-live-cell.test.ts:169-188 inlines a byte-level copy of collectSystemNoteEntries' theta-system-note/theta-progress-entry loop (PIC-72 comment included) while importing five symbols from ./harness, which re-exports collectSystemNotes at harness.ts:41; siblings unterminated-template-registration-live-cell.test.ts:80/162 and withheld-binder-provenance-live-cell.test.ts:79/227 already import and call it against the same handle.sessionManager.getEntries(); bug 0245 is fixed (0.226.0), no coverage-matrix citation, and no existing PTQ names this file for this root cause (PTQ-0507/0835/1042 are registry-oracle/msg/precondition findings; PTQ-1064 fixed four other files) — fix is a mechanical import swap (triage: claude-fable-5-1)
