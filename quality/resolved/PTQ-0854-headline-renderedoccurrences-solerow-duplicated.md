---
id: PTQ-0854
title: thetalib-reparse-walk-single-delivery.test.ts redeclares lex-drop-single-delivery.test.ts's headLine/renderedOccurrences/soleRow diagnostic-count oracle, which no tests/helpers/ module exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/thetalib-reparse-walk-single-delivery.test.ts:329-334
  - tests/thetalib-reparse-walk-single-delivery.test.ts:351-365
  - tests/thetalib-reparse-walk-single-delivery.test.ts:388-402
  - tests/lex-drop-single-delivery.test.ts:323-332
  - tests/lex-drop-single-delivery.test.ts:334-348
  - tests/lex-drop-single-delivery.test.ts:362-378
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# thetalib-reparse-walk-single-delivery.test.ts redeclares lex-drop-single-delivery.test.ts's headLine/renderedOccurrences/soleRow diagnostic-count oracle, which no tests/helpers/ module exports

## Observation
`tests/thetalib-reparse-walk-single-delivery.test.ts` declares module-local
`headLine`, `renderedOccurrences`, and `soleRow` functions that render a
`Diagnostic` to its first line, count verbatim occurrences of a rendered
line across a set of recorded system notes, and locate the single source
row for a code (failing loudly when none is found). `tests/lex-drop-single-delivery.test.ts`
declares the same three functions, functionally and (for `headLine` /
`renderedOccurrences`) near byte-identically. Neither
`tests/helpers/compose-workspace-harness.ts` (which both files' surrounding
`makeHost`/`ComposeWorkspace`/`LoadPass`/`normalisePath`/`noteDiagnostics`/
`allDiagnostics`/`describeNotes`/`requireDriven`/`normativeMessagePattern`
pieces duplicate, per a separate already-filed finding) nor any other
`tests/helpers/` module exports this three-function diagnostic-delivery-count
oracle; it exists only as two independent, unshared copies.

## Evidence
`tests/thetalib-reparse-walk-single-delivery.test.ts:329-334` (`headLine`):
```ts
function headLine(diagnostic: Diagnostic): string {
  const { file, range, code, message } = diagnostic;
  if (file !== undefined && range !== undefined) {
    return `${file}:${range.start.line}:${range.start.column}: ${code}: ${message}`;
  }
  return file !== undefined ? `${file}: ${code}: ${message}` : `${code}: ${message}`;
}
```

`tests/lex-drop-single-delivery.test.ts:323-332` (`headLine` — identical
logic, wrapped across more lines by Prettier):
```ts
function headLine(diagnostic: Diagnostic): string {
  const { file, range, code, message } = diagnostic;
  if (file !== undefined && range !== undefined) {
    return `${file}:${range.start.line}:${range.start.column}: ${code}: ${message}`;
  }
  return file !== undefined
    ? `${file}: ${code}: ${message}`
    : `${code}: ${message}`;
}
```

`tests/thetalib-reparse-walk-single-delivery.test.ts:351-365`
(`renderedOccurrences`):
```ts
function renderedOccurrences(
  notes: readonly RecordedNote[],
  needle: string,
): number {
  const hay = notes.map((n) => n.content).join("\n");
  let count = 0;
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at === -1) {
      return count;
    }
    count += 1;
    from = at + needle.length;
  }
}
```

`tests/lex-drop-single-delivery.test.ts:334-348` (`renderedOccurrences` —
byte-identical body, confirmed by direct `sed` extraction and comparison):
```ts
function renderedOccurrences(
  notes: readonly RecordedNote[],
  needle: string,
): number {
  const hay = notes.map((n) => n.content).join("\n");
  let count = 0;
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at === -1) {
      return count;
    }
    count += 1;
    from = at + needle.length;
  }
}
```

`tests/thetalib-reparse-walk-single-delivery.test.ts:388-402` (`soleRow`):
```ts
function soleRow(notes: readonly RecordedNote[], code: string): Diagnostic {
  const rows = allDiagnostics(notes).filter((d) => d.code === code);
  if (rows.length === 0) {
    expect.fail(
      `harness: no ${code} row reached the channel — the bug-0264 fixture no longer ` +
        `exercises its phase, so nothing below is verified. Notes:\n${describeNotes(notes)}`,
    );
  }
  const lines = new Set(rows.map(headLine));
  expect(
    lines.size,
    `${code} delivered under ${lines.size} distinct normalised rendered lines; ` +
      `expected one source row\n${describeNotes(notes)}`,
  ).toBe(1);
  return rows[0] as Diagnostic;
}
```

`tests/lex-drop-single-delivery.test.ts:362-378` (`soleRow` — the same
filter/fail-loudly/dedup-by-`headLine`/return-first shape, differing only in
the hard-coded bug id in the failure message and the omission of the
`describeNotes` tail in the distinct-lines message):
```ts
function soleRow(
  notes: readonly RecordedNote[],
  code: string,
): Diagnostic {
  const rows = allDiagnostics(notes).filter((d) => d.code === code);
  if (rows.length === 0) {
    expect.fail(
      `harness: no ${code} row reached the channel — the bug-0255 fixture no longer ` +
        `exercises its phase, so nothing below is verified. Notes:\n${describeNotes(notes)}`,
    );
  }
  const lines = new Set(rows.map(headLine));
  expect(
    lines.size,
    `${code} delivered under ${lines.size} distinct rendered lines; expected one source row`,
  ).toBe(1);
  return rows[0] as Diagnostic;
}
```

Exact search: `grep -rln "^function headLine\|^function renderedOccurrences\|^function soleRow" tests/*.test.ts` → exactly these two files. `grep -n "headLine\|renderedOccurrences\|soleRow" tests/helpers/compose-workspace-harness.ts` → 0 hits; that module's own exported set (`makeHost`, `ComposeWorkspace`, `normalisePath`, `finishWorkspace`, `LoadPass`, `runLoadPass`, `noteDiagnostics`, `allDiagnostics`, `describeNotes`, `errorRowsAt`, `errorFilesOf`, `requireDriven`, `normativeMessagePattern`, `expectCallerRefusedWithCalleeHasErrors`) does not include this trio.

## Why this is a problem
`tests/thetalib-reparse-walk-single-delivery.test.ts`'s own header states
its host doubles and fixture-planting shape are "MODELLED ON (duplicated
from, not shared with) `tests/lex-drop-single-delivery.test.ts`," but that
acknowledgement does not extend a shared home to this three-function
rendered/structural diagnostic-delivery-count oracle: no `tests/helpers/`
module exports `headLine`, `renderedOccurrences`, or `soleRow`, so the two
files each carry their own copy of the same rendering, verbatim-counting,
and dedup-and-fail-loudly logic, changeable independently with nothing to
signal a copy left behind.

## Suggested direction (non-binding, optional)
A shared export for this trio — alongside the already-shared
`tests/helpers/compose-workspace-harness.ts` module both files otherwise
duplicate — is the natural home two independent, functionally identical
copies point at; each file's own `positionKey`/`structuralOccurrences`/
`expectDeliveredExactlyOnce` additions (present only in the reviewed file,
to handle bug 0264's separator-spelling divergence) would stay local on top
of it.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named gate kin;
  not applicable.
- Recording-double check: `RecordedNote`/`notes` are legitimate recording
  arrays backing real presence/count assertions in both files; this finding
  challenges only where the counting-and-rendering helper functions are
  declared, not any assertion made against their output.
- docs/bugs/ signature search: `grep -rl "headLine\|renderedOccurrences\|soleRow" docs/bugs/` → docs/bugs/0264-thetalib-reparse-walks-reemit-lex-rows-per-walk.md and docs/bugs/0268-load-notes-render-same-file-with-mixed-path-separators.md, both discussing the counting behaviour these functions implement, not the harness-location choice; no documented correct-reason red covers this duplication.
- coverage-matrix/bug-doc citation search: `grep -n "thetalib-reparse-walk-single-delivery.test.ts\|lex-drop-single-delivery.test.ts" docs/reference/coverage-matrix.md` → 0 hits. `grep -rl "thetalib-reparse-walk-single-delivery" docs/bugs/` → docs/bugs/0264, 0267, 0268 name this file as a witness by bug number, not by its internal `headLine`/`renderedOccurrences`/`soleRow` functions. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` in either file.
- Prior-filing overlap check: `grep -rl "compose-workspace-harness" quality/issues/*.md` → PTQ-0477 (lex-drop vs. extension-bootstrap-sink-liveness' `makeHost`/`plantMalformedTheta`) and PTQ-0716 (thetalib-reparse vs. compose-workspace-harness.ts's `PiHandler`/`RecordedNote`/`HostDouble`/`makeHost`/`ComposeWorkspace`/`normalisePath`/`LoadPass`/`runLoadPass`/`noteDiagnostics`/`allDiagnostics`/`describeNotes`/`requireDriven`); neither PTQ's evidence list names `headLine`, `renderedOccurrences`, or `soleRow`, and neither of those three functions is exported by `compose-workspace-harness.ts`, so this is a distinct root cause (no existing canonical helper covers it) rather than a re-file of either.
- Coverage check: the claim is about a repeated helper-function DEFINITION already exercised by both files' own count assertions; no coverage/untested-path claim is made.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: all six excerpts reproduce at the cited lines (headLine actually spans 329-335, one-line drift); sed-extracted `renderedOccurrences` copies are byte-identical, `headLine` identical modulo Prettier wrapping (tr -d ' \n' | cmp → equal), `soleRow` diff -w differs only in the hard-coded bug id (0264 vs 0255) and a `describeNotes` tail in one message; both copies are live (lex-drop: 6/4/6 call sites, reparse-walk: 2/2/2 via expectDeliveredExactlyOnce); repo-wide grep of the three identifiers across src/ extensions/ tools/ tests/ hits only these two files and tests/helpers/compose-workspace-harness.ts's 17 exports do not include them, so no canonical home exists — D7 boilerplate-duplication class, both sites under tests/, not a gate file, no recording-double/red-test carve-out engaged, coverage-matrix cites neither file (0 hits), docs/bugs 0264/0268 discuss the counting behaviour not the helper's location, and no it()/describe() merge/rename/delete is proposed; not a duplicate: PTQ-0716's root cause is members compose-workspace-harness.ts ALREADY exports (its evidence never names the trio; its triage note mentions soleRow only in passing) so its import-the-helper fix leaves these three copies standing, PTQ-0477 covers lex-drop's makeHost vs extension-bootstrap-sink-liveness, PTQ-0560 has 0 mentions — distinct root cause (no shared export exists); fixer note: a shared `soleRow` needs a bugId parameter, mirroring the helper's `requireDriven(pass, bugId)` shape (triage: claude-fable-5-1)
