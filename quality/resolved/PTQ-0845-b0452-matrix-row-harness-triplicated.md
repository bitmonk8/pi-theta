---
id: PTQ-0845
title: b0452's MatrixRow/tableCells/perVariantMatrixRows/matrixRowDump/flatten harness is near-identical to b0404's and b0434's own copies
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0452-render-fail-refusal-note-matrix-row-coverage.test.ts:60,90-147
  - tests/b0434-operator-facing-note-matrix-row-coverage.test.ts:83,133-183
  - tests/b0404-custom-type-unsafe-note-matrix-row.test.ts:66,122-165
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0452's MatrixRow/tableCells/perVariantMatrixRows/matrixRowDump/flatten harness is near-identical to b0404's and b0434's own copies

## Observation
tests/b0452-render-fail-refusal-note-matrix-row-coverage.test.ts declares,
module scope, a `flatten` one-liner, a `MatrixRow` interface, a `tableCells`
row-splitter, a `perVariantMatrixRows` table-locator, and a `matrixRowDump`
diagnostic dumper — a five-piece harness for locating and reading the
"Per-variant `display` / `content` pairings (normative)" markdown table in
`docs/spec_topics/pi-integration-contract/runtime-event-channel.md`. The
same five pieces, statement-for-statement identical apart from an
in-message bug number and (in b0404's case) folding `line`/`text` into a
shared `Site` base type, are independently declared in
tests/b0434-operator-facing-note-matrix-row-coverage.test.ts and
tests/b0404-custom-type-unsafe-note-matrix-row.test.ts. No file imports
from either of the others; each restates the full sequence locally.

## Evidence
`flatten` — identical one-liner in all three (exact search
`grep -n 'const flatten = (text: string): string => text.replace' tests/*.test.ts`,
6 hits total across the repo; 3 fall in this wave's scope-adjacent trio):
- tests/b0452-render-fail-refusal-note-matrix-row-coverage.test.ts:60
- tests/b0434-operator-facing-note-matrix-row-coverage.test.ts:83
- tests/b0404-custom-type-unsafe-note-matrix-row.test.ts:66
```ts
const flatten = (text: string): string => text.replace(/\s+/g, " ").trim();
```

`tableCells` — identical in all three
(tests/b0452-render-fail-refusal-note-matrix-row-coverage.test.ts:99-105):
```ts
/** A markdown table row `| a | b | c |` split into trimmed cells `[a, b, c]`. */
function tableCells(rawRow: string): string[] {
  return rawRow
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}
```
Same body at tests/b0434-operator-facing-note-matrix-row-coverage.test.ts:142-148
and tests/b0404-custom-type-unsafe-note-matrix-row.test.ts:127-133.

`perVariantMatrixRows` — same header-locate / blank-skip / `|`-row-collect
loop in all three, differing only in the throw message's bug number and (b0404
only) an extra `what: "per-variant matrix row"` field:
tests/b0452-render-fail-refusal-note-matrix-row-coverage.test.ts:113-140:
```ts
function perVariantMatrixRows(): readonly MatrixRow[] {
  const lines = linesOf(readCorpus(RUNTIME_EVENT_CHANNEL));
  const headerIdx = lines.findIndex(
    (l) => l.includes("Per-variant") && l.includes("pairings (normative)"),
  );
  if (headerIdx < 0) {
    throw new Error(
      `harness precondition unmet: ${RUNTIME_EVENT_CHANNEL} carries no "Per-variant … pairings (normative)" table header — the matrix bug 0452 adds a row to cannot be located, so the matrix cells would score vacuously`,
    );
  }
  const rows: MatrixRow[] = [];
  let i = headerIdx + 1;
  while (i < lines.length && (lines[i] ?? "").trim() === "") i += 1;
  for (; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    if (raw.startsWith("|")) {
      rows.push({ line: i + 1, text: flatten(raw), cells: tableCells(raw) });
      continue;
    }
    break;
  }
```
tests/b0434-operator-facing-note-matrix-row-coverage.test.ts:156-176 is the
same loop, body-identical, only the header-not-found message swaps "bug 0452
adds a row to" for "bug 0434 generalises". tests/b0404-custom-type-unsafe-note-matrix-row.test.ts:141-163
is the same loop with "bug 0404 extends" and one extra literal field
(`what: "per-variant matrix row"`) in the pushed row.

`MatrixRow` interface — byte-identical between b0452 and b0434
(tests/b0452-render-fail-refusal-note-matrix-row-coverage.test.ts:90-97 /
tests/b0434-operator-facing-note-matrix-row-coverage.test.ts:133-140):
```ts
interface MatrixRow {
  /** 1-based line number, re-derived on every run. */
  readonly line: number;
  /** The row's own text, flattened. */
  readonly text: string;
  /** The row's markdown cells, trimmed: [selector, display, content]. */
  readonly cells: readonly string[];
}
```
b0404 folds the same two fields (`line`, and an equivalent of `text`) into a
shared `Site` base type it extends (tests/b0404-custom-type-unsafe-note-matrix-row.test.ts:122-125),
carrying the identical `cells` field.

`matrixRowDump` — same shape in b0452 and b0434
(tests/b0452-render-fail-refusal-note-matrix-row-coverage.test.ts:143-147):
```ts
function matrixRowDump(): string {
  return perVariantMatrixRows()
    .map((r) => `  line ${r.line}: ${r.text.slice(0, 160)}`)
    .join("\n");
}
```
tests/b0434-operator-facing-note-matrix-row-coverage.test.ts's own version
differs only in the slice length (140 vs 160 chars) — b0452's own comment at
line 142 ("mirroring b0434") names the source it copied from.

## Why this is a problem
This is the "Boilerplate duplication" class. Three test files independently
declare the same five-piece "locate and parse the Per-variant matrix table"
harness against the same target document
(`docs/spec_topics/pi-integration-contract/runtime-event-channel.md`), with
only the header-not-found error message's bug number (and one dump's slice
length) differing between the b0452/b0434 pair. b0452's own comment
("mirroring b0434") shows the second author copied the first rather than
factoring a shared reader; no test currently imports this reader from a
shared location, so a future change to the target table's header text or
row-splitting convention must be hand-applied in three separate places.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting a parameterised `perVariantMatrixRows`
(taking the corpus path and the header-not-found message's bug-number
fragment) plus `tableCells`/`flatten`/a dump formatter would let each of
b0404, b0434, and b0452 import the reader instead of restating it, mirroring
how `tests/helpers/corpus-reader.ts` already centralises the lower-level
`readCorpus`/`linesOf` primitives all three build on.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); this
  finding does not contest any pinned count/inventory assertion inside the
  cells these functions feed, only that the row-locating harness code itself
  is restated three times.
- Recording-double check: not applicable — these are pure read/parse
  functions over a markdown corpus, not recording doubles or MUST-NOT
  witnesses.
- docs/bugs/ signature search: `grep -rl "perVariantMatrixRows\|tableCells"
  docs/bugs/*.md` → 0 hits; each file's own bug doc
  (docs/bugs/0452-system-render-fail-note-matches-no-matrix-row.md,
  docs/bugs/0434-operator-facing-diagnostics-notes-rowless.md,
  docs/bugs/0404-custom-type-unsafe-note-pairing-outside-variant-matrix.md)
  discusses the target table's content, not the test harness shape, and none
  sanctions the duplication.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0452-render-fail-refusal-note-matrix-row-coverage.test.ts\|b0434-operator-facing-note-matrix-row-coverage.test.ts\|b0404-custom-type-unsafe-note-matrix-row.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` block in any of the
  three files — only that the row-locating harness functions could be
  imported from one shared module.
- Coverage check: the claim is about a repeated harness definition, not a
  missing test path; the harness is exercised by each file's own passing
  cells.
- Prior-finding overlap check: `grep -rl "perVariantMatrixRows\|tableCells"
  quality/resolved quality/intake` → 0 hits before this filing; not a
  re-filing of any listed PTQ or same-wave candidate.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: sed-extracted b0452:90-140 / b0434:133-183 / b0404:122-173 and diffed — `MatrixRow`, `tableCells`, and the `perVariantMatrixRows` header-locate/blank-skip/`|`-collect loop are body-identical bar the header-not-found message's bug-number clause, one doc-comment word, and b0404's `Site` base + `what:` literal; `matrixRowDump` b0452:142-147 vs b0434:229-234 differs only in the 160/140 slice and b0452's comment names b0434 as its source; `flatten` one-liner reproduces at :60/:83/:66 (6 files repo-wide as stated); `perVariantMatrixRows|tableCells` greps only to these three tests (no tests/helpers export, no cross-imports — b0452/b0404 import only `linesOf`/`readCorpus` from corpus-reader, b0434 imports nothing from it), all three files pass under vitest so every copy is live, none matches a gate name, docs/bugs and coverage-matrix searches reproduce at 0, no merge/rename/delete proposed; all locations under tests/, D7 boilerplate-duplication class; not a duplicate — resolved PTQ-0208/0540/0587 cover only the lower-level readCorpus/linesOf trio in these files, and PTQ-0270/0547 read different tables/docs (triage: claude-fable-5-1)
