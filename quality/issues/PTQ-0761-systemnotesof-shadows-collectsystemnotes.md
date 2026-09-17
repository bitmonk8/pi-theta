---
id: PTQ-0761
title: b0281live/b0282live/b0284live each redeclare the theta-system-note/theta-progress-entry reader tests/live/harness.ts already implements as collectSystemNotes
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/b0281live-applied-reserved-generic-head-registration.test.ts:206-233
  - tests/live/b0282live-unknown-applied-generic-head-registration.test.ts:273-300
  - tests/live/b0284live-non-identifier-applied-generic-head.test.ts:260-287
  - tests/live/harness.ts:814-841
sites: 3
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0281live/b0282live/b0284live each redeclare the theta-system-note/theta-progress-entry reader tests/live/harness.ts already implements as collectSystemNotes

## Observation
Each of tests/live/b0281live-applied-reserved-generic-head-registration.test.ts,
tests/live/b0282live-unknown-applied-generic-head-registration.test.ts and
tests/live/b0284live-non-identifier-applied-generic-head.test.ts declares, at
module scope, its own `systemNotesOf(handle)` function: it walks
`handle.sessionManager.getEntries()`, extracts every `theta-system-note`
entry's `content` (string or text-part array) and every `theta-progress-entry`
entry's `data.content`, and returns the merged list of note strings.
tests/live/harness.ts — the module all three files already import
`bootShippedExtension`/`driveSlashCaptureTurn`/`plantThetaWorkspace`/
`requireLiveProvider` from — contains a function-scope-identical reader,
`collectSystemNotes(entries)`, walking the SAME two `customType` branches with
the SAME field extraction logic; it is declared without the `export` keyword,
so none of the three files can import it and each instead redeclares the walk
locally, wrapping it around `handle.sessionManager.getEntries()` inline.
`tests/live/b0277live-unapplied-generic-head-registration.test.ts` and
`tests/live/b0278live-result-arity-mismatch-registration.test.ts` (outside
this wave's scope) carry the identical fourth and fifth copies of the same
`systemNotesOf` declaration.

## Evidence

tests/live/b0281live-applied-reserved-generic-head-registration.test.ts:206-233:
```ts
function systemNotesOf(handle: { sessionManager: { getEntries: () => unknown[] } }): string[] {
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
  return notes;
}
```

tests/live/b0282live-unknown-applied-generic-head-registration.test.ts:273-300
and tests/live/b0284live-non-identifier-applied-generic-head.test.ts:260-287
are each byte-identical to the excerpt above (independently re-diffed
immediately before filing: `diff` of all three extracted bodies produced zero
output).

tests/live/harness.ts:814-841, the un-exported canonical version already
walking the same two branches:
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
The only difference between the two versions is the outer loop's source: the
three test files' `systemNotesOf` calls `handle.sessionManager.getEntries()`
inline inside the `for...of`, while harness.ts's `collectSystemNotes` takes
`entries` as a parameter — a difference in caller shape, not in the walk
logic, which (including the PIC-72 comment) is copied verbatim.

Exact search: `grep -rln "function systemNotesOf" tests/live/*.test.ts` → 5
hits (b0277, b0278, b0281, b0282, b0284); the three hits inside this wave's
scope are the three cited above.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" / boilerplate-duplication class: a
reader for the `theta-system-note`/`theta-progress-entry` channel union
already exists in the shared harness these files already import from for
every other piece of their scaffolding (`bootShippedExtension`,
`driveSlashCaptureTurn`, `plantThetaWorkspace`, `requireLiveProvider`), but it
is not exported, so three (five, counting the two out-of-scope siblings) live
cells that need to read notes off a settled session BEFORE any turn is driven
(a registration-only observable) each re-derive the identical 28-line walk
rather than a single shared one.

## Suggested direction (non-binding, optional)
tests/live/harness.ts's `collectSystemNotes` already implements this walk; the
natural home for the three files' identical logic is that same function,
exported, called as `collectSystemNotes(handle.sessionManager.getEntries())`.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named kin; `systemNotesOf` is a note-channel reader, not a pinned count or
  inventory assertion.
- Recording-double check: `systemNotesOf`/`collectSystemNotes` are stateless
  readers over already-settled entries; they record no calls and back no
  "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0281-applied-ok-err-generic-application-silent-at-every-capture.md,
  docs/bugs/0282-unknown-applied-generic-head-silent-at-every-position.md and
  docs/bugs/0284-non-identifier-applied-generic-head-silent-at-five-captures.md
  all read "Status: fixed"; none names `systemNotesOf` or `collectSystemNotes`.
- coverage-matrix/bug-doc citation search: `grep -n "b0281live\|b0282live\|b0284live" docs/reference/coverage-matrix.md`
  → 0 hits; no citing document pins this helper's name or location, and this
  finding proposes no merge, rename or deletion of any test or `it()`/
  `describe()` — only that the reader could be imported rather than
  redeclared.
- Coverage check: the claim is about a repeated reader DEFINITION, not a
  missing test path; each file's `systemNotesOf` is exercised by its own
  test's assertions.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: the three `systemNotesOf` bodies at b0281live:206-233, b0282live:273-300, b0284live:260-287 are byte-identical (sed-extract + diff → zero output), each is live (called at :283/:368/:346), and tests/live/harness.ts:814 declares `collectSystemNotes` without `export` with the same two-branch walk and verbatim PIC-72 comment; `grep -rln "function systemNotesOf" tests/` reproduces 5 hits (b0277/b0278/b0281/b0282/b0284), all three files already import from ./harness, coverage-matrix grep → 0 hits, bug docs 0281/0282/0284 read fixed and name neither helper; all locations under tests/, no gate/recording-double/red-test carve-out applies; PTQ-0229 tracks the message()/note() fixture builders, not this reader — the same export-collectSystemNotes root cause also sits in disjoint-file-set intake siblings (d7-01-systemnotecontents-reimplements-unexported-harness-collectsystemnotes, d7-71-systemnotecontents-note-reader-quintupled, d7-73, d7-90, d7-96-03, d7-97-01, d7-99-02) which acceptance may want to fold into one PTQ (triage: claude-fable-5-1)
