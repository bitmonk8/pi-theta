---
id: PTQ-0779
title: statement-executor.test.ts redeclares invoke-seam-scaffold's span()/no-op checkpoint instead of importing them
lens: D7
status: open
verdict: confirmed
locations:
  - tests/statement-executor.test.ts:67-69
  - tests/statement-executor.test.ts:165-169
  - tests/helpers/invoke-seam-scaffold.ts:29-35
  - tests/helpers/invoke-seam-scaffold.ts:51-53
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# statement-executor.test.ts redeclares invoke-seam-scaffold's span()/no-op checkpoint instead of importing them

## Observation
`tests/statement-executor.test.ts` declares its own module-scope `span()`
function and `NOOP_CHECKPOINT` constant, each byte-identical in body to an
export of `tests/helpers/invoke-seam-scaffold.ts` (`span()`,
`SEAM_NOOP_CHECKPOINT`) — a helper whose own header states it centralises
exactly this pair (plus a no-op sink/mutator) because it recurs across
`executeBody`-driving bug-witness files. The reviewed file drives the real
`executeBody` throughout and imports neither export.

## Evidence
`tests/statement-executor.test.ts:67-69`:
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

`tests/statement-executor.test.ts:165-169`:
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

`tests/helpers/invoke-seam-scaffold.ts:29-35` and `:51-53` (the canonical
exports, re-read verbatim immediately before filing):
```ts
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```
```ts
export function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

Search: `grep -n "invoke-seam-scaffold" tests/statement-executor.test.ts` — 0
hits; the file imports neither export.

## Why this is a problem
Both no-op pieces the file needs to drive `executeBody` (a throwaway
`SourceRange` builder for its hand-built AST nodes, and an
already-resolved-promise `Checkpoint` for its `ExecuteBodyDeps.checkpoint`
default) are, body for body, the same scaffolding
`tests/helpers/invoke-seam-scaffold.ts` already exports under its own name
for this exact purpose. This file's own `RecordingMutator` and
`ScriptedCheckpoint` are file-specific recording/scripted doubles (already
filed separately in this wave) and are not part of this claim — only the two
inert stand-ins that have a byte-identical canonical export are cited here.

## Suggested direction (non-binding, optional)
Importing `SEAM_NOOP_CHECKPOINT` and `span()` from
`tests/helpers/invoke-seam-scaffold.ts` in place of the file's own two local
declarations is the natural fit the helper's own stated purpose points to;
this is an observation about the existing import surface, not a design for
the change.

## False-positive check
- Gate-pin carve-out: `tests/statement-executor.test.ts` is not a
  `*gate*.test.ts` file and asserts no pinned count/inventory this finding
  touches.
- Recording-double carve-out: `NOOP_CHECKPOINT` is an inert stand-in, not a
  MUST-NOT-called negative witness; the file's separate `RecordingMutator`
  and `ScriptedCheckpoint` classes ARE legitimate recording/scripted doubles
  but are excluded from this claim (see Observation), so the carve-out
  concern does not touch what is cited here.
- docs/bugs/ signature search: `grep -rl "statement-executor" docs/bugs/*.md`
  — 0 hits; no bug document pins or excuses this file's local `span`/
  `NOOP_CHECKPOINT` pair.
- coverage-matrix/bug-doc citation search: `grep -n "statement-executor"
  docs/reference/coverage-matrix.md` — hits exist naming the file as a whole
  (its own `cka-50` row), never the internal `span`/`NOOP_CHECKPOINT` pair;
  this finding proposes no merge, rename, or deletion of the file or any test
  in it, only that the two no-op constructs could import the existing
  scaffold instead of redeclaring it.
- Reference/callers check: `tests/helpers/invoke-seam-scaffold.ts`'s exports
  are live (its own header names bug 0294/0295/0347/0349 as importers; this
  same wave's other shards confirm further importers), not a dead-code
  target being proposed.
- Coverage-drift check: this finding is about a redeclared no-op pair, not a
  missing test path; the file's own cka-50/CTRL-1/FN-5/cka-47/ERR-*/STL-6/
  CANCEL-1/RFC-0002 tests are unaffected by this claim.
- Overlap check: this wave's own `qw20260917154546-d7-02-scriptedcheckpoint-
  quadruplicated.md` already cites this file's `ScriptedCheckpoint` class
  (lines 149-162) as one of four duplicate sites; that finding's root cause
  (a scripted timing double with no canonical home) is disjoint from this
  one's (two INERT no-ops with an EXISTING canonical export the file simply
  does not import), so this finding does not restate it.

## Triage
<!-- triage appends its note here -->
verdict: questionable — observation reproduces (span()/NOOP_CHECKPOINT at :67-69/:165-169 byte-identical to invoke-seam-scaffold.ts:31-35/:54-56, 0 scaffold imports, file drives the real executeBody 28×, 28/28 vitest pass, no *gate*/witness-list carve-out — the 3 docs/bugs hits for the test file (0226/0307/0351) pin STL-6 and a call site, not these declarations; candidate's stated greps misreport: docs/bugs `statement-executor` = 91 hits not 0, coverage-matrix = 0 hits not "hits exist", both immaterial) but the anchor is contestable rather than mechanical: the two cited pieces are exactly the two suite-wide single-ingredient idioms (identical `function span(): SourceRange` in 42 tests/ files, identical no-op Checkpoint literal in 88), this file (886feda4, 2026-07-02) predates the helper (f593d10e, 2026-09-12) and is not in its header roster of invoke/code-call bug-witness files around an InvokeChild double, and resolved PTQ-0244's own ratified text names this very file's span()/NOOP_CHECKPOINT pair as the wider convention distinct from the bundle it deduped (its triage: "NOOP_CHECKPOINT alone, generic AST span()" = false-positive shape when claimed alone) — whether invoke-seam-scaffold becomes the suite-wide no-op ExecuteBodyDeps home needs a human ruling, the same disposition as same-wave sibling d7-140-01 static-type-inference (triage: claude-fable-5-1)
verdict: confirmed — re-triaged independently: span() at tests/statement-executor.test.ts:67-69 and NOOP_CHECKPOINT at :165-169 sed-extracted and diffed byte-identical (modulo `export`/name) to tests/helpers/invoke-seam-scaffold.ts:54-56 and :31-35, the file has 0 scaffold imports while both locals are live (30 span() uses; NOOP_CHECKPOINT threaded into the executeBody deps) and drive the real executeBody 28× with 28/28 vitest passing; D7 copy-paste-fixture class in tests/ only, not a *gate* file, inert stand-ins not recording doubles, and the candidate's misreported greps (docs/bugs `statement-executor` = 91 files not 0; coverage-matrix = 0 not "hits exist") are immaterial because the three bug docs naming the file (0226/0307/0351) pin STL-6 lines and a `range: span()` call site, never these declarations; the earlier questionable note's "predates the helper / wider convention" reservation is superseded by ratified precedent — the human has accepted PTQ-0594 (effectful-statement-host, same 2026-07-02 vintage, span+NOOP_CHECKPOINT+SINK), PTQ-0603 (NOOP_CHECKPOINT alone), PTQ-0545/0613/0650/0655/0705/0720 as confirmed, every one a pre-helper file outside its header roster, so per-file un-migrated scaffold no-ops are an accepted D7 class; no existing PTQ cites this file's span/NOOP_CHECKPOINT pair (PTQ-0575 ScriptedCheckpoint and PTQ-0701 RecordingMutator cover disjoint declarations) (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
