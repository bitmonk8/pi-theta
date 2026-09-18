---
id: PTQ-0561
title: b0271live/b0275live/b0280live each re-derive the same DIAG-4 registry-oracle and rendered-diagnostic-row inventory (normativeMessagePattern, renderedRows, rowsLocatedAt, describeRows, requireNoteChannel, normalisePath)
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts:319-429
  - tests/live/b0275live-escaping-tools-entry-below-immediate-callee-live-cell.test.ts:342-452
  - tests/live/b0280live-prompt-mode-below-immediate-callee-live-cell.test.ts:269-379
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0271live/b0275live/b0280live each re-derive the same DIAG-4 registry-oracle and rendered-diagnostic-row inventory (normativeMessagePattern, renderedRows, rowsLocatedAt, describeRows, requireNoteChannel, normalisePath)

## Observation
Three of the six files in this review's scope each declare the identical
six-function bundle for reading the DIAG-4 registry Message and locating
rendered diagnostic rows by file: `normalisePath`, a `RenderedRow` interface,
`renderedRows`, `rowsLocatedAt`, `describeRows`, `requireNoteChannel`, and
`normativeMessagePattern`. Every function's body is byte-identical across the
three files except for the interpolated bug number in `failLoudly` messages
and, in `normativeMessagePattern`, whether the registry is a parameter
(b0271, which reads two registry pages) or a closed-over module constant
(b0275 and b0280, which read one page each).

## Evidence

tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts:407-420
(re-read immediately before filing):
```ts
function rowsLocatedAt(
  handle: LiveExtensionHandle,
  code: string,
  stem: string,
): readonly RenderedRow[] {
  return renderedRows(handle, code).filter((row) => row.location.includes(`/${stem}.theta`));
}

/** Render a row list for an assertion message. */
function describeRows(rows: readonly RenderedRow[]): readonly string[] {
  return rows.map((row) => `${row.location}: ${row.message}`);
}

/** The boot put SOMETHING on the note channel, so an absence claim is not read off a dead channel. */
function requireNoteChannel(handle: LiveExtensionHandle, half: string): void {
```

tests/live/b0275live-escaping-tools-entry-below-immediate-callee-live-cell.test.ts:430-443
(same lines, same bodies):
```ts
function rowsLocatedAt(
  handle: LiveExtensionHandle,
  code: string,
  stem: string,
): readonly RenderedRow[] {
  return renderedRows(handle, code).filter((row) => row.location.includes(`/${stem}.theta`));
}

/** Render a row list for an assertion message. */
function describeRows(rows: readonly RenderedRow[]): readonly string[] {
  return rows.map((row) => `${row.location}: ${row.message}`);
}

/** The boot put SOMETHING on the note channel, so an absence claim is not read off a dead channel. */
function requireNoteChannel(handle: LiveExtensionHandle, half: string): void {
```

tests/live/b0280live-prompt-mode-below-immediate-callee-live-cell.test.ts:357-371
reproduces the same `rowsLocatedAt`/`describeRows`/`requireNoteChannel` shape
at those offsets (confirmed by direct read).

`normativeMessagePattern`, all three files (b0271:319-330, b0275:342-353,
b0280:269-280), same body modulo the registry-parameter difference and the
bug-number string:
```ts
function normativeMessagePattern(code: string): RegExp {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    failLoudly(
      "bug-0275 live cell precondition unmet: " +
        "docs/spec_topics/diagnostics/code-registry-load.md carries no Message row for " +
        `${code} — the DIAG-4 column is this cell's only message oracle, so a missing row ` +
        "is a harness failure, never a skip",
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}
```
(b0280's copy at the cited offset is character-for-character the same modulo
`bug-0275` → `bug-0280`.)

`renderedRows`/`normalisePath`/`RenderedRow`, all three files (b0271:371-403,
b0275:394-426, b0280:321-353) — same doc comments, same `marker`-splitting
logic, same field names, confirmed identical by direct read at each offset.

Exact search: `grep -n "^function normalisePath\|^function renderedRows\|^function rowsLocatedAt\|^function describeRows\|^function requireNoteChannel\|^function normativeMessagePattern" tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts tests/live/b0275live-escaping-tools-entry-below-immediate-callee-live-cell.test.ts tests/live/b0280live-prompt-mode-below-immediate-callee-live-cell.test.ts` returns exactly six matches per file (18 total), one per named function, at the offsets cited above.

## Why this is a problem
Each of the three files carries the same ~110-line registry-oracle-and-row-inventory bundle (parse the DIAG-4 registry page(s), build a `normativeMessagePattern` regex from the shipped Message column, split rendered `theta-system-note` lines at the code marker into location/message pairs, and filter by located stem) as an independently-typed, independently-maintained copy rather than a shared import. A change to `renderDiagnosticLine`'s line format (`src/diagnostics/diagnostic.ts`, the format `renderedRows`'s marker-splitting logic depends on) would need to be applied identically in all three copies, with nothing to signal a copy left un-updated; the three files already share the identical fixture shape (a `tools:` chain of a root/grandparent, a child, and a grandchild) and the identical DIAG-4-reading discipline, so the duplication is the same harness solving the same problem three times.

## Suggested direction (non-binding, optional)
The six functions (`normalisePath`, `RenderedRow`, `renderedRows`, `rowsLocatedAt`, `describeRows`, `requireNoteChannel`, `normativeMessagePattern`) are candidates for a shared `tests/live/` helper the three `tools:`-chain registration cells could import, parameterised on the bug id string used in `failLoudly` messages and on the registry page(s) to read.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the named gate kin; the cited functions are reader/oracle utilities, not pinned-count assertions.
- Recording-double check: `rowsLocatedAt`/`describeRows` filter and format an already-recorded note array; this finding is about the reader code being duplicated, not about a "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "Status" docs/bugs/0271-*.md docs/bugs/0275-*.md docs/bugs/0280-*.md` — all three report fixed status at HEAD; none of the three files is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rn "b0271live\|b0275live\|b0280live" docs/reference/coverage-matrix.md` — 0 hits; this finding proposes no merge, rename or deletion of any test, only that the six-function bundle could be imported from a shared module instead of re-declared three times.
- Coverage check: not a claim of untested behaviour; every cited function is exercised by its own file's assertions.
- Overlap check: this finding's cited ranges (319-429 / 342-452 / 269-379, the registry-oracle and row-inventory functions) are disjoint from the sibling candidate `qw20260917154546-d7-01-live-cell-boot-notes-reader-duplicated.md`, which covers the separate `bootNotes`/`systemNotesOf` note-reader function alone (cited at 341-368 / 364-391 / 291-318 in the same three files, a distinct root cause — a private harness equivalent exists for that one, but not for this six-function bundle). Resolved PTQ-0237/PTQ-0230 cover the non-`live` `tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts` file (no `live` in the path) and its own registry-oracle/load-pass-diagnostic bundle against `tests/helpers/registry-oracle.ts` and `tests/helpers/compose-workspace-harness.ts` — a different file with a different (already-existing, importable) canonical helper; this finding is scoped to the three `tests/live/*live-cell.test.ts` files, none of which imports either helper (`grep -n "registry-oracle\|compose-workspace-harness" tests/live/b0271live-*.test.ts tests/live/b0275live-*.test.ts tests/live/b0280live-*.test.ts` → 0 hits), and no existing filed/resolved finding names this three-file live-cell set for this bundle.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: all three excerpts match at the cited lines; the 18-hit function grep reproduces; `diff` of b0275:342-452 vs b0280:269-379 and of b0271:371-429 vs b0275:394-452 with the bug number normalised is byte-identical (b0271's normativeMessagePattern differs only by taking registry/page as parameters); every function is live (describeRows called 6/8/7 times); no `registry-oracle`/`compose-workspace-harness` import in any of the three, no coverage-matrix citation, all three bugs fixed. Two notes for the fixer: the candidate undercounts — the same bundle (minus describeRows) also lives in tests/live/b0267live-…:248-353 and b0270live-…:285-390, filed separately as sibling intake qw20260917154546-d7-02-b0267-b0270-registry-oracle-harness-duplicated.md (disjoint file set, same shared-helper direction; land one helper for all five); and `normativeMessagePattern` already has an exported parameterised equivalent at tests/helpers/compose-workspace-harness.ts:221-235 (throws instead of failLoudly) — the other five members have no shared home. (triage: claude-fable-5-1)
