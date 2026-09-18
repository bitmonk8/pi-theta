---
id: PTQ-1064
title: Four in-scope live cells redeclare systemNoteContents byte-identical to harness.ts's re-exported collectSystemNotes
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/reserved-keyword-remaining-positions-live-cell.test.ts:106-136
  - tests/live/schema-field-discard-recovery-live-cell.test.ts:72-99
  - tests/live/unterminated-template-registration-live-cell.test.ts:112-139
  - tests/live/withheld-binder-provenance-live-cell.test.ts:97-124
  - tests/live/harness.ts:40-41
  - tests/helpers/recording-system-note-channel.ts:119-121
sites: 4
fix_scope: module
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Four in-scope live cells redeclare systemNoteContents byte-identical to harness.ts's re-exported collectSystemNotes

## Observation
Four of the nine in-scope files each declare a module-scope function
`systemNoteContents(entries: readonly unknown[]): readonly string[]` that
walks a settled `SessionManager` entry list and extracts the
`theta-system-note` / `theta-progress-entry` channel contents, including the
identical PIC-72 doc comment. `tests/live/harness.ts` — the module all four
files already import `bootShippedExtension`/`plantThetaWorkspace`/
`requireLiveProvider` from — imports `collectSystemNotes` from
`tests/helpers/recording-system-note-channel.ts` and re-exports it by name
(`export { collectSystemNotes } from "../helpers/recording-system-note-channel";`),
so the identical function is reachable through the same import statement
each file already writes. None of the four imports it.

## Evidence

`tests/live/harness.ts:40-41`:
```ts
import { collectSystemNotes } from "../helpers/recording-system-note-channel";
export { collectSystemNotes } from "../helpers/recording-system-note-channel";
```

`tests/helpers/recording-system-note-channel.ts:118-121` (the canonical body):
```ts
/** Extract content strings in transcript order, keeping each text part separate. */
export function collectSystemNotes(entries: readonly unknown[]): readonly string[] {
  return collectSystemNoteEntries(entries).flatMap((note) => note.contents);
}
```
(`collectSystemNoteEntries`, :79-116, performs the same
`theta-system-note`/`theta-progress-entry` branching, PIC-72 comment
included, as every local copy below.)

`tests/live/schema-field-discard-recovery-live-cell.test.ts:72-99`:
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
  return notes;
}
```

`tests/live/unterminated-template-registration-live-cell.test.ts:112-139` and
`tests/live/withheld-binder-provenance-live-cell.test.ts:97-124` reproduce the
same body verbatim (re-read immediately before filing; only whitespace column
of the `if`/`else if` branches on lines 77/78-style shorthand differs from
none — all three of these three files share that exact one-line-`if` style).
`tests/live/reserved-keyword-remaining-positions-live-cell.test.ts:106-136`
reproduces the identical branching with the `if`/`else if` bodies wrapped in
braces across more lines, otherwise the same walk and the same PIC-72 comment
verbatim.

Exact search: `grep -rn "^function systemNoteContents" tests/live/*.test.ts` →
20 hits repo-wide; the four cited above are the ones inside this review's
briefed scope. `grep -n "collectSystemNotes" tests/live/reserved-keyword-remaining-positions-live-cell.test.ts tests/live/schema-field-discard-recovery-live-cell.test.ts tests/live/unterminated-template-registration-live-cell.test.ts tests/live/withheld-binder-provenance-live-cell.test.ts` → 0 hits in all four (each file's `from "./harness"` import list, confirmed by direct read, names other harness symbols only).

## Why this is a problem
The identical ~25-30 line entry-classification walk, including its PIC-72
doc-comment paragraph, is retyped whole into four separate files inside this
review's scope even though the exact function is already exported under the
same name from the very module (`./harness`) each of the four already imports
`bootShippedExtension` and friends from. A change to the channel-union rule
(the PIC-72 comment's own subject) requires editing this walk in five places
(the canonical definition plus these four local copies) to stay consistent,
rather than one.

## Suggested direction (non-binding, optional)
`tests/live/harness.ts` already re-exports `collectSystemNotes` under the
same import path these four files already use for other harness symbols; that
is the natural point the four local copies already converge on.

## False-positive check
- Gate-pin check: none of the four files match `*gate*.test.ts` or the named
  gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); none
  asserts a pinned count or inventory in this function.
- Recording-double check: `systemNoteContents` is a pure reader over settled,
  already-recorded entries, not a call-recording double asserting a
  MUST-NOT-called witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "function systemNoteContents"
  docs/bugs/*.md` → 0 hits; none of the four files' own bug docs (0153, 0133,
  0246, 0143) documents a rationale for redeclaring this reader locally
  instead of importing `collectSystemNotes`.
- coverage-matrix/bug-doc citation search: `grep -n
  "reserved-keyword-remaining-positions-live-cell\|schema-field-discard-recovery-live-cell\|unterminated-template-registration-live-cell\|withheld-binder-provenance-live-cell"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name, count, or assertion — only that the
  repeated reader function could be imported once — so the citation carve-out
  does not bind.
- Coverage check: the claim is entirely about a repeated reader-function
  DEFINITION, not a missing test path; every copy is exercised by its own
  file's passing test.
- Prior-finding overlap check: `quality/resolved/PTQ-0515-systemnotecontents-collectsystemnotes-octuplicated.md`
  and `quality/resolved/PTQ-0516-systemnotecontents-reimplements-unexported-harness-collectsystemnotes.md`
  (both `status: fixed`) cover the identical root cause and function shape,
  but their own `locations:` cite disjoint file sets (neither lists any of
  these four files); PTQ-0515's triage note records the pattern recurs
  ~35 times repo-wide across `tests/live` and that other same-wave shards
  filing disjoint subsets are treated as separate, non-duplicate filings
  pending a repo-wide consolidation. None of these four files appears in
  either resolved ticket's location list.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: sed-extracted bodies at schema-field-discard:72-99, unterminated-template:112-139 and withheld-binder-provenance:97-124 diff byte-identical, and reserved-keyword-remaining-positions:106-136 diffs identical after stripping braces/whitespace (the brace-style variance the body already discloses; the title's "byte-identical" is thus 3/4 strictly, non-refuting); each copy is live (2 refs per file) and matches tests/helpers/recording-system-note-channel.ts:83-121 `collectSystemNoteEntries`/`collectSystemNotes` branch-for-branch with the verbatim PIC-72 comment; harness.ts:40-41 does import+re-export `collectSystemNotes`, all four files import from `./harness` (bootShippedExtension/plantThetaWorkspace/requireLiveProvider/PlantedTheta ± driveSlashCaptureTurn) yet grep `collectSystemNotes` in the four → 0 hits; `^function systemNoteContents` in tests/live/*.test.ts → 20 as stated; docs/bugs signature grep → 0, coverage-matrix grep → 0, no gate/recording-double carve-out — D7 boilerplate/copy-paste helper duplication wholly under tests/; not a duplicate: none of these four files appears in the locations of PTQ-0515/0516/0769 (fixed) or open PTQ-0760/PTQ-0774, and repo precedent mints disjoint-file slices of this root cause separately — acceptance should fold this into the open PTQ-0760/PTQ-0774 consolidation row (same-wave siblings d7-01 ×2 and d7-14 file further disjoint slices) (triage: claude-fable-5-1)
