---
id: PTQ-1381
title: quoted-inline-field-name-live-cell redeclares systemNoteContents instead of harness.ts's re-exported collectSystemNotes
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/quoted-inline-field-name-live-cell.test.ts:101-124
  - tests/live/harness.ts:40-41
  - tests/helpers/recording-system-note-channel.ts:118-121
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# quoted-inline-field-name-live-cell redeclares systemNoteContents instead of harness.ts's re-exported collectSystemNotes

## Observation
`tests/live/quoted-inline-field-name-live-cell.test.ts` declares a
module-scope `systemNoteContents` function that walks a settled
`SessionManager` entry list and extracts `theta-system-note` /
`theta-progress-entry` channel contents, including the PIC-72 doc comment
verbatim. `tests/live/harness.ts`, which this file already imports
`bootShippedExtension`/`plantThetaWorkspace`/`requireLiveProvider` from,
re-exports the identical function under the name `collectSystemNotes`. Four
sibling in-scope files in this same review batch
(`nested-array-element-sink-descent-live-cell.test.ts`,
`object-pattern-head-field-set-live-cell.test.ts` [via
`FAIL_CLOSED_MARKERS`/`turn.systemNotes`], `par-for-body-qry4-mismatch-live-cell.test.ts`,
and `reserved-keyword-remaining-positions-live-cell.test.ts`) already import
`collectSystemNotes` through this exact route.

## Evidence
`tests/live/quoted-inline-field-name-live-cell.test.ts:101-124`:
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
      // PIC-72 (runtime-event-channel.md): ...
      const data = e.data as { content?: unknown } | undefined;
      if (typeof data?.content === "string") notes.push(data.content);
    }
  }
  return notes;
}
```

`tests/live/harness.ts:40-41` (the re-export this file already has an import
path to):
```ts
import { collectSystemNotes } from "../helpers/recording-system-note-channel";
export { collectSystemNotes } from "../helpers/recording-system-note-channel";
```

`tests/helpers/recording-system-note-channel.ts:118-121` (the canonical
body, same branching, same PIC-72 comment):
```ts
/** Extract content strings in transcript order, keeping each text part separate. */
export function collectSystemNotes(entries: readonly unknown[]): readonly string[] {
  return collectSystemNoteEntries(entries).flatMap((note) => note.contents);
}
```

## Why this is a problem
This exact duplication (a local `systemNoteContents` reimplementing
`harness.ts`'s re-exported `collectSystemNotes`) has already been confirmed
and fixed twice for disjoint file sets (PTQ-0516, six sites; PTQ-1064, four
sites). `quoted-inline-field-name-live-cell.test.ts` was not among the cited
sites in either finding and still carries the identical restatement,
including the PIC-72 comment, sourced from the same import path the file
already uses for three other harness exports.

## Suggested direction (non-binding, optional)
Add `collectSystemNotes` to the existing `import { ... } from "./harness"`
statement and drop the local function.

## False-positive check
- Gate-pin check: not a `*gate*.test.ts` file.
- Recording-double check: not applicable; this is a settled-entry reader, not
  a negative-witness double.
- docs/bugs/ signature search: bug 0176's own report does not discuss the
  note-channel reader mechanism; no correct-reason-red posture applies.
- coverage-matrix/bug-doc citation search: `grep -rn
  "quoted-inline-field-name-live-cell" docs/reference/coverage-matrix.md
  docs/bugs/` found no hits; no merge/rename/delete is proposed.
- Confirmed PTQ-0516 and PTQ-1064 (status: fixed) each cite disjoint file
  sets that do not include this file, confirming this is a new, previously-
  uncited site for the same already-established root cause.

## Triage
verdict: confirmed — excerpt reproduces byte-for-byte at tests/live/quoted-inline-field-name-live-cell.test.ts:101-124 (sole caller :224), tests/live/harness.ts:40-41 re-exports collectSystemNotes and tests/helpers/recording-system-note-channel.ts:118-121 + collectSystemNoteEntries:130-147 yields the identical flat string list (same theta-system-note/theta-progress-entry branching, same PIC-72 comment); the file already imports four names from "./harness" and three of the four named siblings import collectSystemNotes there; `grep -l quoted-inline-field-name-live-cell quality/issues quality/resolved` is empty so no prior PTQ cites this site (PTQ-0516/1064 fixed disjoint sets; new uncited site, per PTQ-0629/0692/1072 precedent, not duplicate); minor inaccuracy noted — docs/bugs/0176,0243,0286,0287 do cite the file, but the fix is an in-file helper swap, not a merge/rename/delete, so the coverage carve-out does not apply (triage: claude-fable-5-1)
