---
id: PTQ-1356
title: Six of nine in-scope live cells redeclare systemNoteContents byte-identical to harness.ts's re-exported collectSystemNotes
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/index-sentinel-typeenv-case-fence-live-cell.test.ts:126-153
  - tests/live/inline-field-name-not-identifier-live-cell.test.ts:98-125
  - tests/live/inline-object-empty-field-type-truncation-live-cell.test.ts:185-212
  - tests/live/inline-object-field-name-case-live-cell.test.ts:90-117
  - tests/live/inline-object-malformed-entry-resync-live-cell.test.ts:119-146
  - tests/live/inline-object-wire-name-rename-live-cell.test.ts:83-110
  - tests/live/harness.ts:40-41
  - tests/helpers/recording-system-note-channel.ts:118-121
sites: 6
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# Six of nine in-scope live cells redeclare systemNoteContents byte-identical to harness.ts's re-exported collectSystemNotes

## Observation
Six of the nine files in this review's scope each declare a module-scope
function `systemNoteContents(entries: readonly unknown[]): readonly string[]`
that walks a settled `SessionManager` entry list and extracts the
`theta-system-note` / `theta-progress-entry` channel contents, including the
identical PIC-72 doc comment. `tests/live/harness.ts` — the module all six
files already import `bootShippedExtension`/`plantThetaWorkspace`/
`requireLiveProvider` from — imports `collectSystemNotes` from
`tests/helpers/recording-system-note-channel.ts` and re-exports it by name
(`export { collectSystemNotes } from "../helpers/recording-system-note-channel";`).
None of the six imports it; two sibling files in this same review's scope
(`generic-argument-bracket-group-truncation-live-cell.test.ts`,
`generic-argument-inline-field-key-live-cell.test.ts`) already do import
`collectSystemNotes` from `./harness` instead of redeclaring it.

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

`tests/live/inline-object-wire-name-rename-live-cell.test.ts:83-110`
(re-read immediately before filing):
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

`tests/live/index-sentinel-typeenv-case-fence-live-cell.test.ts:126-153`,
`tests/live/inline-field-name-not-identifier-live-cell.test.ts:98-125`,
`tests/live/inline-object-empty-field-type-truncation-live-cell.test.ts:185-212`,
`tests/live/inline-object-field-name-case-live-cell.test.ts:90-117`, and
`tests/live/inline-object-malformed-entry-resync-live-cell.test.ts:119-146`
each reproduce this exact 28-line body, PIC-72 comment included, verbatim
(re-read immediately before filing; each is byte-identical to the excerpt
above with only the function's own start line differing).

Exact search: `grep -n "^function systemNoteContents" tests/live/*.test.ts`
for the nine files in this review's scope returns 6 hits (the six cited
above); `grep -n "collectSystemNotes"` against those same six files returns
0 hits (each file's `from "./harness"` import list, confirmed by direct
read, names other harness symbols only —
`bootShippedExtension`/`driveSlashCaptureTurn`/`plantThetaWorkspace`/
`requireLiveProvider`/`PlantedTheta`). The remaining three in-scope files
either import `collectSystemNotes` directly from `./harness`
(`generic-argument-bracket-group-truncation-live-cell.test.ts:86`,
`generic-argument-inline-field-key-live-cell.test.ts:75`) or read the
channel only through `driveSlashCaptureTurn`'s already-exported
`systemNotes` field (`inline-object-stray-close-token-live-cell.test.ts`,
confirmed no `systemNoteContents` declaration).

## Why this is a problem
The identical ~28-line entry-classification walk, including its PIC-72
doc-comment paragraph, is retyped whole into six separate files inside this
review's scope even though the exact function is already exported under the
same name from the very module (`./harness`) each of the six already imports
`bootShippedExtension` and friends from, and two sibling files in this same
scope already demonstrate the import in place of the redeclaration. A
change to the channel-union rule (the PIC-72 comment's own subject) requires
editing this walk in seven places (the canonical definition plus these six
local copies) to stay consistent, rather than one.

## Suggested direction (non-binding, optional)
`tests/live/harness.ts` already re-exports `collectSystemNotes` under the
same import path these six files already use for other harness symbols
(and two sibling files in this same scope already use it that way); that is
the natural point the six local copies already converge on.

## False-positive check
- Gate-pin check: none of the six files matches `*gate*.test.ts` or the
  named gate kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); none of the cited lines is a pinned
  count or inventory assertion.
- Recording-double check: `systemNoteContents` is a pure reader over
  settled, already-recorded entries used to build content strings for
  `toContain`/`.some(...)` assertions; none of the cited call sites is a
  MUST-NOT-called witness, so the recording-double carve-out does not
  apply.
- docs/bugs/ signature search: `grep -rl "function systemNoteContents"
  docs/bugs/*.md` returns 0 hits; none of the six files' own bug docs
  documents a rationale for redeclaring this reader locally instead of
  importing `collectSystemNotes`.
- coverage-matrix/bug-doc citation search: `grep -n
  "index-sentinel-typeenv-case-fence-live-cell\|inline-field-name-not-identifier-live-cell\|inline-object-empty-field-type-truncation-live-cell\|inline-object-field-name-case-live-cell\|inline-object-malformed-entry-resync-live-cell\|inline-object-wire-name-rename-live-cell"
  docs/reference/coverage-matrix.md` returns 0 hits. This finding proposes
  no change to any `it()`/`describe()` name, count, or assertion — only that
  the repeated reader function could be imported once — so the citation
  carve-out does not bind.
- Coverage check: the claim is entirely about a repeated reader-function
  definition, not a missing test path; every copy is exercised by its own
  file's passing test.
- Prior-finding overlap check: `grep -rl "systemNoteContents"
  quality/intake quality/resolved` shows this exact root cause already
  confirmed and fixed against disjoint file sets in
  `quality/resolved/PTQ-0515-systemnotecontents-collectsystemnotes-octuplicated.md`,
  `quality/resolved/PTQ-0516-systemnotecontents-reimplements-unexported-harness-collectsy.md`,
  `quality/resolved/PTQ-0760-systemnotecontents-note-reader-quintupled.md`,
  `quality/resolved/PTQ-0769-bootnotes-systemnotecontents-duplicated.md`,
  `quality/resolved/PTQ-0774-03-systemnotecontents-duplicated-generic-argument-cells.md`,
  and open intake candidate
  `qw20260922211400-d7-01-systemnotecontents-reimplemented-b0046live-alias-sink.md`;
  none of those `locations:` lists cites any of the six files named here
  (checked by grep on each file's basename against every one of those
  files), and repo precedent (PTQ-0515's and PTQ-1064's own triage notes)
  records that disjoint-file slices of this same root cause are filed and
  accepted separately pending a repo-wide consolidation.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: the six 28-line `systemNoteContents` bodies sed-extracted at the cited lines (126/98/185/90/119/83, zero drift) all hash to md5 380e0a2d20e473fb1ab80d1ae69bac17 (the same hash PTQ-0515's triage recorded for the original copies), each is live (2-3 refs per file), and each matches tests/helpers/recording-system-note-channel.ts:83-121 `collectSystemNoteEntries`/`collectSystemNotes` branch-for-branch incl. the verbatim PIC-72 comment (the canonical's extra `details` capture is dropped by `collectSystemNotes`'s flatMap, so output is equivalent); harness.ts:40-41 does import+re-export `collectSystemNotes`, all six files import from `./harness` yet `collectSystemNotes` greps to 0 in them, while the two generic-argument siblings import it (:86/:75) and stray-close-token has neither symbol; `^function systemNoteContents` → 6/9 in scope (12 remaining repo-wide), docs/bugs signature grep → 0, coverage-matrix grep for the six basenames → 0, no gate/recording-double carve-out — D7 boilerplate/copy-paste helper duplication wholly under tests/; not a duplicate: every prior row on this root cause (PTQ-0515/0516/0760/0769/0774/1064) is now resolved and none cites any of these six files (wire-name-rename was twice ruled duplicate against then-open PTQ-0479/0760 whose fixes did not migrate it — TRIAGE_LOG:90/158), quality/issues currently holds no systemNoteContents row, and the same-wave siblings (schema-body-unclosed, b0046live/alias-sink, quoted-inline) cite disjoint files; per the PTQ-1064 precedent a disjoint-file slice is minted separately — acceptance should fold this and its three same-wave siblings into one consolidation row (triage: claude-fable-5-1)
