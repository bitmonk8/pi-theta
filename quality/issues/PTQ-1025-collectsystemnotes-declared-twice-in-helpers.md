---
id: PTQ-1025
title: Two tests/helpers/ modules each export a same-named collectSystemNotes with the same theta-system-note/theta-progress-entry walk
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/helpers/live-transcript.ts:33-58
  - tests/helpers/recording-system-note-channel.ts:79-120
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Two tests/helpers/ modules each export a same-named collectSystemNotes with the same theta-system-note/theta-progress-entry walk

## Observation
`tests/helpers/live-transcript.ts` and `tests/helpers/recording-system-note-channel.ts` each independently export a function named `collectSystemNotes(entries: readonly unknown[]): readonly string[]` that walks the same two `customType` branches (`theta-system-note` and, per the identical PIC-72 comment, `theta-progress-entry`) of a settled `SessionManager` entry slice and extracts the same rendered text. `tests/live/harness.ts` imports and re-exports the `recording-system-note-channel.ts` version (`export { collectSystemNotes } from "../helpers/recording-system-note-channel"`), while eight `tests/live/*.test.ts` files import `collectSystemNotes` directly from `../helpers/live-transcript` instead. Both bodies produce the identical ordered string list for the same input.

## Evidence
`tests/helpers/live-transcript.ts:33-58`:
```ts
export function collectSystemNotes(entries: readonly unknown[]): readonly string[] {
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
      // PIC-72 (runtime-event-channel.md): ... [same comment as below]
      const data = e.data as { content?: unknown } | undefined;
      if (typeof data?.content === "string") notes.push(data.content);
    }
  }
  return notes;
}
```

`tests/helpers/recording-system-note-channel.ts:79-120` (the composed pair — `collectSystemNoteEntries` plus the thin `collectSystemNotes` wrapper over it):
```ts
export function collectSystemNoteEntries(entries: readonly unknown[]): readonly SystemNoteEntry[] {
  const notes: SystemNoteEntry[] = [];
  for (const entry of entries) {
    const e = entry as { customType?: string; content?: unknown; details?: unknown; data?: unknown };
    if (e.customType === "theta-system-note") {
      const contents: string[] = [];
      if (typeof e.content === "string") contents.push(e.content);
      else if (Array.isArray(e.content)) {
        for (const part of e.content) {
          const t = (part as { text?: string }).text;
          if (typeof t === "string") contents.push(t);
        }
      }
      notes.push({ contents, details: e.details });
    } else if (e.customType === "theta-progress-entry") {
      // PIC-72 (runtime-event-channel.md): ... [same comment as above]
      const data = e.data as { content?: unknown; details?: unknown } | undefined;
      notes.push({
        contents: typeof data?.content === "string" ? [data.content] : [],
        details: data?.details,
      });
    }
  }
  return notes;
}

/** Extract content strings in transcript order, keeping each text part separate. */
export function collectSystemNotes(entries: readonly unknown[]): readonly string[] {
  return collectSystemNoteEntries(entries).flatMap((note) => note.contents);
}
```

Exact search: `grep -n "export function collectSystemNotes" tests/helpers/*.ts` → exactly these 2 hits. Import-site search: `grep -rn "collectSystemNotes" tests/live/*.test.ts tests/live/harness.ts` shows `tests/live/harness.ts:40-41` importing-and-re-exporting the `recording-system-note-channel` version, while `tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts:64`, `tests/live/b0106live-cofire-refusal-live-cell.test.ts:71`, and `tests/live/b0248live-nested-malformed-escape-live-cell.test.ts:92` (plus `b0146live-invoke-array-arg-live-cell.test.ts:66`) import the same name from `../helpers/live-transcript` instead — two live call-site groups resolving the identically-named function to two different module bindings.

## Why this is a problem
Both bodies exist to answer the same question ("what did the settled transcript's system-note channel carry"), walk the same two custom-entry-type branches, and carry the identical PIC-72 explanatory comment about the `theta-progress-entry` migration — a fact a maintainer updating that comment's rationale (or the channel-union logic it documents) in one file has no signal to also update in the other, since neither file imports from or references the other. The two live call-site groups (`../helpers/live-transcript` vs the `../helpers/recording-system-note-channel` re-export `tests/live/harness.ts` carries) currently agree by coincidence, not by a shared source.

## Suggested direction (non-binding, optional)
`tests/helpers/live-transcript.ts` could import `collectSystemNotes` from `./recording-system-note-channel` (the module `tests/live/harness.ts` already treats as canonical) rather than declaring its own copy.

## False-positive check
- Gate-pin check: neither file is `*gate*.test.ts` or a named gate kin; not a pinned-count gate.
- Recording-double check: `collectSystemNotes` is a stateless transcript READER (extracts strings from a settled entry slice), not a recording double backing a MUST-NOT-call negative witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "collectSystemNotes" docs/bugs/*.md` → 0 hits; no open bug documents a rationale for two separately-maintained copies.
- coverage-matrix/bug-doc citation search: `grep -n "live-transcript.ts\|recording-system-note-channel.ts" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()`; it only observes that a tests/helpers/ module duplicates a same-named sibling helper's function, which is squarely within the D7 boilerplate-duplication class, not coverage.
- Overlap check: `grep -rl "collectSystemNotes" quality/issues quality/resolved` before filing returns many files, but all of them describe individual `tests/live/*.test.ts` cells (or `tests/live/live-production-acceptance.test.ts`) locally re-deriving the UNEXPORTED `tests/live/harness.ts` copy of this walk — none names `tests/helpers/live-transcript.ts` itself as one of the two colliding definitions; this finding's root cause (two exporting tests/helpers/ modules, not a private-harness/no-export mismatch) is distinct from all of them.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `grep "export function collectSystemNotes" tests/` → exactly live-transcript.ts:33 and recording-system-note-channel.ts:119 (two further copies at double-session-start-live.test.ts:144 and hardening/probe-harness.ts:214 are unexported privates outside this filing's root cause); both excerpts reproduce at the cited lines, a comment-stripped mktemp diff shows the bodies differ only by the `SystemNoteEntry`/`details` wrapper layer that `flatMap(note => note.contents)` collapses back to the identical ordered string list, and the nine-line PIC-72 comment blocks are byte-identical; harness.ts:40-41 imports+re-exports the recording-system-note-channel copy while exactly four live cells (b0106:71, b0138:64, b0146:66, b0248:92) bind the live-transcript copy — the Observation's "eight" overcounts (Evidence's four is right), and the docs/bugs grep returns 2 hits (0048, 0287) not 0, but both cite harness.ts's own/double-session-start's reader, so neither refutes; git shows the two exports were minted by separate fix waves (88abbed7 vs 71039544), i.e. residue not design; D7 boilerplate-duplication, both sites under tests/, no gate/recording-double/coverage-matrix carve-out; not tracked — PTQ-0478/0479/0515/0516/0769 (all fixed) concern live cells restating the then-private harness copy and none names tests/helpers/live-transcript.ts, and the intake sibling d7-01-systemnotecontents-reimplements-live-transcript is a cell-vs-helper restatement, a different root cause (triage: claude-fable-5-1)
