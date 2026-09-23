---
id: PTQ-1357
title: b0046live and alias-sink-array-element-check-live-cell each reimplement collectSystemNotes's theta-system-note/theta-progress-entry extraction inline
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/b0046live-by-clause-undecided-inputs-live-cell.test.ts:211-234
  - tests/live/alias-sink-array-element-check-live-cell.test.ts:85-108
  - tests/helpers/recording-system-note-channel.ts:79-121
sites: 2
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# b0046live and alias-sink-array-element-check-live-cell each reimplement collectSystemNotes's theta-system-note/theta-progress-entry extraction inline

## Observation
`tests/live/b0046live-by-clause-undecided-inputs-live-cell.test.ts` (inline in
its `it()` body) and `tests/live/alias-sink-array-element-check-live-cell.test.ts`
(as a module-scope `systemNoteContents` function) each walk a settled
`SessionManager` entry list and extract the `theta-system-note` /
`theta-progress-entry` channel contents, including the identical PIC-72 doc
comment about the entry-channel migration. `tests/helpers/recording-system-note-channel.ts`
exports `collectSystemNotes`, which is re-exported by name from
`tests/live/harness.ts` (`export { collectSystemNotes } from
"../helpers/recording-system-note-channel";`) — the same module both files
already import `bootShippedExtension`/`plantThetaWorkspace`/
`requireLiveProvider` from. Neither of the two files imports it. (A sibling
file in this same scope, `tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts`,
imports `collectSystemNotes` directly from `../helpers/live-transcript`,
showing the import path is already in routine use.)

## Evidence

`tests/live/b0046live-by-clause-undecided-inputs-live-cell.test.ts:211-234`:
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

`tests/live/alias-sink-array-element-check-live-cell.test.ts:85-108`:
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
```

`tests/helpers/recording-system-note-channel.ts:118-121` (the canonical body,
re-exported through `tests/live/harness.ts:40-41`):
```ts
/** Extract content strings in transcript order, keeping each text part separate. */
export function collectSystemNotes(entries: readonly unknown[]): readonly string[] {
  return collectSystemNoteEntries(entries).flatMap((note) => note.contents);
}
```

Exact search: `grep -rn "customType === \"theta-system-note\"" tests/live/*.test.ts | wc -l` (broad, whole tests/live/ tree) returns many hits across the suite; restricted to this review's briefed scope, the two files above are the only ones in-scope that reimplement the extraction rather than importing `collectSystemNotes` (the other in-scope files that touch the note channel — `b0138live-imported-fn-arg-refusal-live-cell.test.ts` — import it).

## Why this is a problem
Both files re-derive, byte-for-byte including the PIC-72 migration comment,
logic a canonical helper already exports through the same barrel module
(`tests/live/harness.ts`) each file already imports from. A change to the
entry-channel shape (e.g. a further custom-entry migration) would need to
land in the canonical helper and in each of these two independent copies for
this pattern to keep working, with nothing enforcing that a copy is not left
stale.

## Suggested direction (non-binding, optional)
Importing `collectSystemNotes` from `../helpers/live-transcript` (or via the
`tests/live/harness.ts` re-export both files already use for other harness
symbols) in place of the inline loop / local `systemNoteContents` function is
the natural next step, observationally — the same import path a sibling file
in this review's scope already uses.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; the cited lines are a note-extraction loop/function, not a pinned
  count.
- Recording-double check: this is not a "never called" negative witness; it
  is a channel-content reader duplicated across two files.
- docs/bugs/ signature search: `grep -n "Status" docs/bugs/0046-*.md
  docs/bugs/0157-*.md` — both report fixed status; neither cites this
  duplication as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0046live-by-clause-undecided-inputs\|alias-sink-array-element-check"
  docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no
  merge, rename or deletion of either test file or its `it()` block, only
  that the shared extraction helper could be imported instead of
  reimplemented.
- Coverage check: not a claim of untested behaviour; each file's own
  fixed-observable assertion against its own settled entries is unaffected.
- Duplicate-search: `grep -rl "b0046live-by-clause-undecided-inputs\|alias-sink-array-element-check"
  quality/resolved/*.md quality/intake/*.md` → hits only for unrelated
  root causes (registry-oracle reimplementation, CASE_CODE/promptTheta
  minimal-builder duplication in PTQ-0768/PTQ-1042); the resolved
  PTQ-1064 fix (systemNoteContents quadruplicated) named four different
  files (`reserved-keyword-remaining-positions-live-cell.test.ts`,
  `schema-field-discard-recovery-live-cell.test.ts`,
  `unterminated-template-registration-live-cell.test.ts`,
  `withheld-binder-provenance-live-cell.test.ts`) and its fix touched only
  those four; neither file cited here was named or fixed by that filing.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: b0046live:211-234 (inline loop over `handle.sessionManager.getEntries()`) and alias-sink:85-108 (`systemNoteContents`, live at :220) reproduce at the cited lines and their loop bodies extracted to $TEMP diff identical apart from the iterable name, matching tests/helpers/recording-system-note-channel.ts:83-121 `collectSystemNoteEntries`/`collectSystemNotes` branch-for-branch with the verbatim nine-line PIC-72 comment; harness.ts:40-41 imports and re-exports `collectSystemNotes`, both files import from `./harness` (b0046live:102-108, alias-sink:64-70) yet grep `collectSystemNotes` in either → 0 hits, while sibling b0138live:62/213 already imports and calls it; docs/bugs 0046/0157 are fixed, coverage-matrix grep → 0, not a gate/recording-double/red-test carve-out — D7 boilerplate/copy-paste helper duplication wholly under tests/, fix is a mechanical import swap; not a duplicate: neither file appears in the locations of PTQ-0478/0479/0515/0516/0760/0761/0769/0774/1025/1064 (all fixed; repo precedent mints disjoint-file slices separately) and the only tracked hits on these filenames are PTQ-0768/PTQ-1042 (registry-oracle / CASE_CODE precondition — different root causes); same-wave siblings d7-01-schema-body-unclosed, d7-01-redeclared-six-in-scope-files and d7-02-quoted-inline file disjoint file sets (triage: claude-fable-5-1)
