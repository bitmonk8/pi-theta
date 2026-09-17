---
id: PTQ-0760
title: The theta-system-note/theta-progress-entry channel reader is restated five times across the in-scope live cells, byte-identical to an unexported harness helper
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts:97-124
  - tests/live/discovery-entry-lstat-failure-live-cell.test.ts:113-140
  - tests/live/discovery-symlinked-root-live-cell.test.ts:95-119
  - tests/live/duplicate-enum-value-message-single-line-live-cell.test.ts:127-151
  - tests/live/double-session-start-live.test.ts:144-171
  - tests/live/harness.ts:814-841
sites: 5
fix_scope: module
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The theta-system-note/theta-progress-entry channel reader is restated five times across the in-scope live cells, byte-identical to an unexported harness helper

## Observation
Five files in the briefed scope each declare their own function (or inline the same logic directly in a test body) that walks a slice of `SessionManager.getEntries()` and extracts the `theta-system-note` channel's rendered text, including the PIC-72 fallback that reads the same content off a `theta-progress-entry` custom entry's `data.content`. `tests/live/harness.ts` already contains the identical function (`collectSystemNotes`, line 814), but it is not exported — only `driveSlashCaptureTurn`'s per-drive slice (`turn.systemNotes`) is available to importers. Every in-scope file that needs a note read scoped to something other than "one drive's own entries" (a load-time note before any drive, or a bind-scoped slice spanning a second `bindExtensions` call) restates the full block instead.

## Evidence
tests/live/harness.ts:814-841 (the canonical, unexported implementation):
```
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
      ...
      const data = e.data as { content?: unknown } | undefined;
      if (typeof data?.content === "string") notes.push(data.content);
    }
  }
  return notes;
}
```

tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts:97-124 (`function systemNoteContents`), tests/live/discovery-entry-lstat-failure-live-cell.test.ts:113-140 (`function systemNoteContents`), and tests/live/double-session-start-live.test.ts:144-171 (`function collectSystemNotes`) each restate the identical body verbatim down to the PIC-72 comment wording — e.g. discovery-entry-lstat-failure-live-cell.test.ts:113-121:
```
function systemNoteContents(entries: readonly unknown[]): readonly string[] {
  const notes: string[] = [];
  for (const entry of entries) {
    const e = entry as { customType?: string; content?: unknown; data?: unknown };
    if (e.customType === "theta-system-note") {
      if (typeof e.content === "string") notes.push(e.content);
      else if (Array.isArray(e.content)) {
        for (const part of e.content) {
          const t = (part as { text?: string }).text;
```

tests/live/discovery-symlinked-root-live-cell.test.ts:95-119 and tests/live/duplicate-enum-value-message-single-line-live-cell.test.ts:127-151 inline the same loop directly inside the test body (no wrapping function) rather than declaring even a local restatement — e.g. discovery-symlinked-root-live-cell.test.ts:95-103:
```
          const notes: string[] = [];
          for (const entry of handle.sessionManager.getEntries()) {
            const e = entry as { customType?: string; content?: unknown; data?: unknown };
            if (e.customType === "theta-system-note") {
              if (typeof e.content === "string") notes.push(e.content);
              else if (Array.isArray(e.content)) {
                for (const part of e.content) {
                  const t = (part as { text?: string }).text;
                  if (typeof t === "string") notes.push(t);
```

The discovery-entry-lstat-failure-live-cell.test.ts:107-111 doc comment names the pattern directly: "Mirrors cell 62's `systemNoteContents` (unexported from `./harness`, so each acceptance-style file restates it against the full entry list …)".

## Why this is a problem
`collectSystemNotes` in `tests/live/harness.ts:814-841` is the exact byte-for-byte body five in-scope test files restate (three as a named function, two inlined into a test). The restating files' own comments name the reason: the harness function is not exported, so "each acceptance-style file restates it." The natural home for a channel reader used this way across many live cells is the shared harness module it already lives in — the code just needs to cross the file's own `export` boundary, not be re-authored five more times, including the multi-line PIC-72 explanatory comment repeated verbatim in every copy.

## Suggested direction (non-binding, optional)
None of the five call sites need anything the existing `collectSystemNotes` lacks (a `readonly unknown[]` slice in, `readonly string[]` out) — exporting the harness's own function is the change these files are each already working around individually.

## False-positive check
Gate-pin check: none of the five files match `*gate*.test.ts` or kin; not a pinned-count gate. Recording-double check: this is a plain data-extraction reader, not a negative-witness double. docs/bugs/ signature search: no docs/bugs report cites restating this function as an intended, documented shape — the discovery-entry-lstat-failure-live-cell.test.ts comment explains WHY the duplication exists (an unexported harness symbol) without claiming it is desired. coverage-matrix/bug-doc citation search: `grep -rl "systemNoteContents\|collectSystemNotes" docs/` returned no hits, so none of the five duplicate sites is pinned by name in `docs/reference/coverage-matrix.md` or a bug doc's witness list. This finding does not propose any coverage change, only that the five duplicate bodies could resolve to the one export; it does not touch test outcomes.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: all six excerpts match at the cited lines and the five copies are content-identical to tests/live/harness.ts:814-841 `collectSystemNotes` (diffed whitespace-normalised; 3 named functions + 2 inlined loops, PIC-72 comment included), which carries no `export` and is consumed only internally at harness.ts:553/676/732; all locations under tests/, D7 class boilerplate duplication, no gate/coverage-matrix/witness-list pin (candidate's "docs/ grep no hits" claim is inaccurate — docs/bugs/0048 and 0287 cite `collectSystemNotes` by drifted line numbers as an available reader, neither ratifies the local copies); not in the tracked PTQ list (resolved PTQ-0229 covered the `message()`/`note()` fixture builders, not this reader). Note for acceptance: the same root cause spans ~59 tests/live files and is co-filed by same-wave intake siblings (d7-71-systemnotesof-shadows-collectsystemnotes, d7-01-systemnotecontents-collectsystemnotes-octuplicated, d7-73, d7-97-01, d7-99-02 et al.) against disjoint file sets — consolidate under one PTQ whose fix is exporting the harness function (triage: claude-fable-5-1)
