---
id: PTQ-1042
title: fn-param-annotation-optional-live-cell and fn-param-list-unclosed-live-cell each redeclare the minimal promptTheta builder, the CASE_CODE constant, and the identical note-channel-precondition fixture
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/live/fn-param-annotation-optional-live-cell.test.ts:106,117-119,145-146
  - tests/live/fn-param-list-unclosed-live-cell.test.ts:86,89-91,118-122
sites: 2
fix_scope: module
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# fn-param-annotation-optional-live-cell and fn-param-list-unclosed-live-cell each redeclare the minimal promptTheta builder, the CASE_CODE constant, and the identical note-channel-precondition fixture

## Observation
Both `tests/live/fn-param-annotation-optional-live-cell.test.ts` and
`tests/live/fn-param-list-unclosed-live-cell.test.ts` declare, at module
scope: an identical three-line `promptTheta(bodyLines)` builder (`["---",
"mode: prompt", "---", ...bodyLines]`), an identical `CASE_CODE =
"theta/parse/binding-case-mismatch"` constant (bug 0139's row, described in
each file with the same "live at HEAD" wording), and a planted fixture whose
only role is the note-channel precondition — a theta whose body is exactly
`["let P = 1", "@\`hi\`"]` run through `promptTheta`, at a stem differing only
by the file's own cell-letter prefix (`cellcnotechan` vs
`cellenotechannel`). This `promptTheta` shape (no `description:` field, no
blank line before the body) is distinct from the four-line `promptTheta`
exported by `tests/helpers/live-diagnostic-oracle.ts` (which includes
`description: d` and a blank separator line) that other files in this same
review's scope (b0281live/b0282live/b0284live) import instead of declaring
locally.

## Evidence

tests/live/fn-param-annotation-optional-live-cell.test.ts:106,117-119:
```ts
const CASE_CODE = "theta/parse/binding-case-mismatch";
...
/** A `mode: prompt` `.theta` whose body is the given lines. */
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "mode: prompt", "---", ...bodyLines].join("\n") + "\n";
}
```
and its note-channel-precondition fixture at :145-146:
```ts
        stem: "cellcnotechan",
        text: promptTheta(["let P = 1", "@`hi`"]),
```

tests/live/fn-param-list-unclosed-live-cell.test.ts:86,89-91:
```ts
const CASE_CODE = "theta/parse/binding-case-mismatch";

/** A `mode: prompt` `.theta` whose body is the given lines. */
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "mode: prompt", "---", ...bodyLines].join("\n") + "\n";
}
```
and its note-channel-precondition fixture at :118-122:
```ts
      {
        source: "project",
        stem: "cellenotechannel",
        text: promptTheta(["let P = 1", "@`hi`"]),
      },
```

Both files' own comment blocks state the identical purpose in near-identical
wording ("the channel carries load-phase parse codes at all... If it does
not, the channel — not this bug — is the fault").

Exact search: `grep -n 'CASE_CODE = "theta/parse/binding-case-mismatch"' tests/live/fn-param-annotation-optional-live-cell.test.ts tests/live/fn-param-list-unclosed-live-cell.test.ts` → one hit per file, identical right-hand side; `grep -n '^function promptTheta' tests/live/fn-param-annotation-optional-live-cell.test.ts tests/live/fn-param-list-unclosed-live-cell.test.ts` → one hit per file, byte-identical three-line bodies (re-diffed immediately before filing via a `sed`-range extraction: zero output). The same `CASE_CODE`/minimal-`promptTheta` pair additionally recurs (outside this wave's scope) in `tests/live/b0046live-by-clause-undecided-inputs-live-cell.test.ts:114,117`, `tests/live/b0259live-enum-body-unclosed-at-eof-live-cell.test.ts:108,111`, `tests/live/fn-param-not-identifier-live-cell.test.ts:103,106`, and `tests/live/schema-body-unclosed-at-eof-live-cell.test.ts:93,96` — four further sites, not cited as evidence here because they fall outside this review's briefed scope.

## Why this is a problem
Two in-scope files, whose own bug numbers are unrelated (0150 and 0151, both
about `fn` parameter-list parsing edge cases), independently re-derive the
identical minimal frontmatter builder, the identical borrowed
already-live-code constant, and the identical note-channel-precondition
fixture body used to prove the channel is wired before either file's
fixed-code absence assertion is trusted. A change to bug 0139's code string,
to the minimal frontmatter shape both files' own OTHER fixtures also share,
or to the precondition fixture's body would need to land in both copies with
nothing enforcing that a second copy is not left stale.

## Suggested direction (non-binding, optional)
A shared minimal `promptTheta` builder plus a shared `CASE_CODE`/
note-channel-precondition-fixture pair (parameterised on the stem prefix),
alongside the four other same-shape live cells named above, is the natural
shared home both files' declarations point at — the same shape of fold
`tests/helpers/live-diagnostic-oracle.ts` already provides for the
four-line `promptTheta`/`noteChannelTheta` variant used elsewhere in this
review's scope.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; the cited lines are a builder function and fixture literals, not
  pinned-count assertions.
- Recording-double check: `promptTheta` and the note-channel fixture are
  planted source text, not a recording double or "never called" witness;
  the carve-out does not apply.
- docs/bugs/ signature search: `grep -n "Status" docs/bugs/0150-*.md
  docs/bugs/0151-*.md` — both report fixed status; neither cites this
  duplication as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "fn-param-annotation-optional-live-cell\|fn-param-list-unclosed-live-cell"
  docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no
  merge, rename or deletion of either test file or its `it()` block, only
  that the shared builder/constant/fixture could be declared once.
- Coverage check: not a claim of untested behaviour; each file's own
  fixed-observable assertion against its own planted fixture is unaffected.
- Duplicate-search: `grep -rl "binding-case-mismatch" quality/issues/*.md
  quality/resolved/*.md quality/intake/*.md 2>/dev/null | xargs grep -l
  "fn-param-annotation-optional\|fn-param-list-unclosed" 2>/dev/null` → 0
  hits before this filing; PTQ-0615 (resolved) covers the *other*,
  four-line `promptTheta`/`CASE_CODE` variant (`description: d` +
  blank-line shape) across a disjoint file set (b0274live/b0277live/
  b0278live, with a triage note sweeping b0262live/b0281live/b0282live/
  b0284live) and does not name either file cited here or the minimal
  three-line `promptTheta` shape.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: `const CASE_CODE = "theta/parse/binding-case-mismatch"` sits at exactly annotation-optional:106 / list-unclosed:86, the three-line minimal `promptTheta` bodies at :117-119 / :89-91 are byte-identical (mktemp sed-extract + diff empty), and the `promptTheta(["let P = 1", "@\`hi\`"])` precondition fixture is at :145-146 / :120-121 differing only in stem; both stated greps reproduce at one hit per file; neither file imports `tests/helpers/live-diagnostic-oracle.ts`, which (created by PTQ-0615's fix, commits e3546327/5e1860ec) already exports the identical `CASE_CODE` and a `noteChannelTheta(stem)` whose body is exactly this fixture — so the constant+fixture halves are a reimplemented-despite-exported-helper case and only the `promptTheta` shape (no `description: d`, no blank line) is a genuinely distinct minimal variant; copy-paste fixture/boilerplate class in tests/, not a gate test, not a recording double, 0 coverage-matrix hits, bug docs 0150:1009 / 0151:1213 name the files only as witnesses and no merge/rename/delete is proposed, failLoudly posture untouched; not a duplicate — PTQ-0615 is fixed over a disjoint b02XXlive set and PTQ-0988 is the tool-call-dispatch `(thetaBody, tools?)` variant; two notes for the fixer: (1) the unswept set is SIX files, not two — `grep -rl 'const CASE_CODE = "theta/parse/binding-case-mismatch"' tests/live/` minus live-diagnostic-oracle importers = b0046live:114, b0259live:108, fn-param-not-identifier:103, schema-body-unclosed-at-eof:93 plus the two cited (b0367live:62 carries the minimal `promptTheta` alone, no CASE_CODE); (2) same-wave intake sibling qw20260918202006-d7-10 (b0259live alone, filed 55 s earlier) shares this root cause and should fold into whichever row is minted (triage: claude-fable-5-1)

## Fix attempts
- qw20260918202006: skipped — [PTQ-1024-clean-stem-vacuity-guard-quadruplicated.md] PTQ-1024: Shared the clean fixture and registration guard across all five files, including b0267. Assertions preserved; required gate and affected live tests passed. / PTQ-1048: Shared chain-source builders and driven-turn assertions across three files. Fixture bytes and test names preserved; required gate and affected live tests passed. / PTQ-1034: Replaced local helpers in b0351, b0357, and triage-added b0307 with canonical errorCodes imports. Assertions unchanged; required gate and affected live tests passed. / PTQ-1040: Replaced both local helpers with canonical errorCodes imports and removed orphaned Diagnostic imports. Assertions unchanged; required gate and affected live tests passed. Overall verification: TypeScript, 687 offline files (11,569 tests), and all 10 affected live files passed. No tests deleted. ||
