---
id: PTQ-0769
title: The theta-system-note-channel reader (bootNotes/systemNoteContents) is reimplemented verbatim in four in-scope live cells
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/b0106live-cofire-refusal-live-cell.test.ts:86-118
  - tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts:183-206
  - tests/live/b0146live-invoke-array-arg-live-cell.test.ts:228-253
  - tests/live/b0248live-nested-malformed-escape-live-cell.test.ts:106-136
sites: 4
fix_scope: module             # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The theta-system-note-channel reader (bootNotes/systemNoteContents) is reimplemented verbatim in four in-scope live cells

## Observation
`tests/live/harness.ts` carries a private (unexported) `collectSystemNotes`
reader used internally by `driveSlashCaptureTurn` and `classifyLastTurn`. Four
of the ten files in this review's scope each restate the identical body of
that reader as their own local, differently-named function
(`bootNotes`/`systemNoteContents`) so they can read the FULL boot-time entry
list rather than `driveSlashCaptureTurn`'s per-drive slice. The function body
— walk `entries`, branch on `customType === "theta-system-note"` (string or
text-part-array content) vs `customType === "theta-progress-entry"` (read
`data.content`) — is byte-identical across all four sites, including the
seven-line PIC-72 comment explaining the `theta-progress-entry` fallback arm.

## Evidence
`tests/live/b0106live-cofire-refusal-live-cell.test.ts:86-118`:
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

/** The boot notes naming one planted `.theta` file (the rendered line carries its path). */
function notesFor(handle: LiveExtensionHandle, stem: string): readonly string[] {
  return bootNotes(handle).filter((n) => n.includes(`${stem}.theta`));
}
```

`tests/live/b0248live-nested-malformed-escape-live-cell.test.ts:106-136`
carries the identical `bootNotes` body plus an identical `notesFor` wrapper
(re-read from the file, matching the above verbatim, including the PIC-72
comment).

`tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts:183-206`
carries the same walk under the name `systemNoteContents(entries)`, taking the
entry array directly rather than a handle:
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
```
(the PIC-72 comment and the `data.content` fallback that follow are identical
to the `bootNotes` excerpt above).

`tests/live/b0146live-invoke-array-arg-live-cell.test.ts:228-253` carries the
same `systemNoteContents(entries)` shape, confirmed identical body by direct
read.

Search: `grep -n "customType === \"theta-system-note\""` across the ten
in-scope files returns exactly 4 hits, one per file listed above (the other
six in-scope files never read this channel directly).

## Why this is a problem
All four copies exist because `tests/live/harness.ts`'s own reader
(`collectSystemNotes`) is not exported, so a file needing the FULL boot-time
entry list (rather than the per-drive slice `driveSlashCaptureTurn` returns)
cannot import it and re-derives the identical 24-line function under a
locally invented name instead. Three of the four copies even say so directly
in their own doc comment ("Mirrors the harness's own private
`collectSystemNotes` reader"), naming the duplication as a known fact at
write time rather than an accidental drift.

## Suggested direction (non-binding, optional)
The natural home for this reader — as an observation, not a design — is
`tests/live/harness.ts` itself, as an exported sibling of the already-exported
`bootShippedExtension`/`plantThetaWorkspace`/`requireLiveProvider`, the module
every one of these four files already imports from.

## False-positive check
- Gate-pin check: none of the four files match `*gate*.test.ts` or the named
  gate kinds; not applicable.
- Recording-double check: not applicable — this is a channel reader, not a
  double recording calls for a MUST-NOT witness.
- docs/bugs/ signature search: `grep -rl "collectSystemNotes\|systemNoteContents\|bootNotes"` under
  `docs/bugs/` returns no hits; no documented correct-reason-red cites this
  reader shape.
- coverage-matrix/bug-doc citation search: the finding proposes no merge,
  rename, or deletion of any test — only that the shared reader live once in
  `tests/live/harness.ts` — so the citation-pinning rule does not apply.
- Confirmed this stays a test-code-only observation: `tests/live/harness.ts`
  is itself a test-support module under `tests/`, not `src/`, `extensions/`,
  or `tools/`.
- Confirmed this is not a coverage claim: no site is missing a check; all
  four already perform the equivalent read, just via four separate
  re-derivations of the same function.

## Triage
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines and their loop bodies extracted to $TEMP diff byte-identical to each other and to tests/live/harness.ts:814 `collectSystemNotes` (no `export` keyword; the harness export list omits it), with the bootNotes variants differing only in feeding `handle.sessionManager.getEntries()` for `entries`; D7 boilerplate-duplication class, all sites under tests/, no gate/recording-double/documented-red/coverage-matrix carve-out engaged; two non-refuting inaccuracies noted — only 2 of 4 copies (b0106:83, b0248:103) carry the "Mirrors the harness's own private collectSystemNotes" comment (b0138/b0146 cite AGENTS.md instead), and the docs/bugs grep returns 2 hits (0048, 0287) that cite harness.ts's own reader, not these copies; no tracked PTQ covers this root cause (PTQ-0229 is the b0287/b0289 entry-builder fixtures), but same-wave intake siblings d7-01/d7-02/d7-71/d7-73/d7-96-03/d7-97-01/d7-99-02 file the same root cause on disjoint file sets (~39 copies repo-wide per `grep -rn "function bootNotes\|function systemNoteContents" tests/`) and should be merged at acceptance (triage: claude-fable-5-1)
