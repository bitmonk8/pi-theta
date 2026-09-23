---
id: PTQ-1475
title: live-production-acceptance.test.ts's local systemNoteContents re-implements tests/helpers/recording-system-note-channel.ts's collectSystemNotes
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/live-production-acceptance.test.ts:925-957
  - tests/helpers/recording-system-note-channel.ts:118-161
sites: 1
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# live-production-acceptance.test.ts's local systemNoteContents re-implements tests/helpers/recording-system-note-channel.ts's collectSystemNotes

## Observation
`tests/live/live-production-acceptance.test.ts` defines a private module-level
function `systemNoteContents(entries)` (lines 925-957) that walks a settled
`SessionManager` entry list and extracts `theta-system-note` /
`theta-progress-entry` text content. `tests/helpers/recording-system-note-channel.ts`
exports `collectSystemNotes(entries)` (line 161, delegating to
`collectSystemNoteEntries` at lines 118-141) that walks the same two
`customType` branches, over the same `entries: readonly unknown[]` parameter,
extracting the same text. The file's own doc comment above the local function
claims a semantic difference ("this cell reads the FULL entry list, not a
per-drive slice") to justify not importing the canonical helper, but the
canonical `collectSystemNotes` takes the identical `entries: readonly
unknown[]` parameter and imposes no slicing of its own — slicing is a
caller-side choice, not a property of the function being duplicated.

## Evidence
tests/live/live-production-acceptance.test.ts:925-957
```ts
/**
 * The `theta-system-note` channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md §"Assert on
 * real observables"). Mirrors `./harness`'s unexported `collectSystemNotes`
 * (not imported: this cell reads the FULL entry list, not a per-drive slice,
 * since the diagnostic under test fires at load time, before any drive).
 */
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
  return notes;
}
```

tests/helpers/recording-system-note-channel.ts:118-161
```ts
export function collectSystemNoteEntries(entries: readonly unknown[]): readonly SystemNoteEntry[] {
  const notes: SystemNoteEntry[] = [];
  for (const entry of entries) {
    const e = entry as {
      customType?: string;
      content?: unknown;
      details?: unknown;
      data?: unknown;
    };
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

Both functions receive the same `entries: readonly unknown[]` parameter (the
full settled `SessionManager` entry list in this file's every call site — see
e.g. `systemNoteContents(handle.sessionManager.getEntries())` at line 8890 and
elsewhere in the file), branch on the same two `customType` values, extract
`content` the same way for `theta-system-note`, and extract `data.content` the
same way for `theta-progress-entry`. Passing the identical full entry array to
`collectSystemNotes` produces the identical `readonly string[]` this local
function returns.

## Why this is a problem
The local function's own doc comment states the reason it is not delegating to
the canonical helper is a slicing difference that does not exist in either
function's signature or body — both operate over whatever `entries` array the
caller passes, with no internal slicing logic in either. The two bodies
implement the same walk over the same two branches with the same field
extraction; this is boilerplate/logic duplication of a helper that already
lives under `tests/helpers/`.

## Suggested direction (non-binding, optional)
`tests/helpers/recording-system-note-channel.ts`'s exported `collectSystemNotes`
is the natural shared home for this walk, as observed from its existing export
surface and identical parameter shape.

## False-positive check
- Gate-pin check: file name does not match `*gate*.test.ts` or the named gate
  kin; not a census/pin test.
- Recording-double check: `systemNoteContents` is a plain reader, not a
  recording double asserting a MUST-NOT-be-called negative witness.
- docs/bugs/ signature search: `grep -rln "systemNoteContents" docs/bugs/*.md`
  returns no hits naming this local function as a documented correct-reason
  red or pinned witness.
- coverage-matrix/bug-doc citation search: `grep -n "systemNoteContents"
  docs/reference/coverage-matrix.md` returns no hits; the function is not
  cited by name in any bug doc's witness list.
- Existing-filing overlap: `grep -rl "live-production-acceptance"
  quality/resolved quality/issues quality/intake | xargs grep -li
  "systemNoteContents"` surfaces PTQ-0516 (locations list five other
  `tests/live/*.test.ts` files, not this one) and PTQ-1025 (a distinct root
  cause — two competing exporting `tests/helpers/` modules, not a
  private-harness mismatch); neither cites this file's lines 925-957, so this
  is a disjoint-file instance of the same family, consistent with the accepted
  precedent in PTQ-1064's triage note that this root cause is filed per
  disjoint file set.

## Triage
verdict: confirmed — independently re-verified: local `systemNoteContents` at live-production-acceptance.test.ts:925-957 matches `collectSystemNoteEntries`/`collectSystemNotes` at recording-system-note-channel.ts:118-161 branch-for-branch (helper's flatMap drops empty-contents entries, so the returned string[] is identical); copy is live (47 call sites, all `systemNoteContents(handle.sessionManager.getEntries())`); the file already imports from `./harness` (:45) and harness.ts:41 re-exports `collectSystemNotes`, so the doc comment's "unexported" is stale and its "full list vs per-drive slice" excuse is refuted (helper takes any array; harness's own callers slice caller-side at :556/:679/:735); docs/bugs grep 0, coverage-matrix grep 0, not a gate test or recording double — D7 boilerplate duplication wholly under tests/; not a duplicate: no fixed (PTQ-0479/0515/0516/0760/0769/0774/1064) or open (PTQ-1356/1357/1381) filing lists this file in its locations — PTQ-0516 names it only inside a quoted "Mirrors" comment — and repo precedent (PTQ-1064 note) mints disjoint-file slices of this root cause separately (triage: claude-fable-5-1)
