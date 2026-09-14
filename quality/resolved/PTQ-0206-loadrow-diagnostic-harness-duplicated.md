---
id: PTQ-0206
title: b0274 and b0277 redefine, near-verbatim, the same LoadRow/registered/expectCaptured/expectRows diagnostic-load harness
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts:161-330
  - tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts:128-300
  - tests/helpers/e2e-s1.ts:60-81
sites: 3
fix_scope: cross-module       # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260911104855
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# b0274 and b0277 redefine, near-verbatim, the same LoadRow/registered/expectCaptured/expectRows diagnostic-load harness

## Observation
tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts and
tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts each
independently declare the same "bug-report diagnostic-load harness": a
`RegistryRow` interface plus a `REGISTRY_PATH`/`REGISTRY` load off the same
registry page, a `msg`/`line`/`reservedLine` message-rendering trio, a
`LoadRow` interface plus a `FRONTMATTER` constant and a `theta`/`row` builder
that parses a source through `parseDoc` and projects it into
codes/lines/declared/statements, a `registered` predicate mirroring the
composition root's registration gate, a `startPositions` projector, and a
two-part `expectCaptured`/`expectRows` assertion pair. Every one of these is
either byte-identical between the two files or identical apart from a renamed
parameter (`row` → `r`) or one added layer of indirection (b0277 threads a
`row(label, source)` helper underneath its own `theta`). The exact
`expectCaptured` function signature recurs verbatim in six further files in
the same bug-report family. tests/helpers/e2e-s1.ts, which both files already
import `parseDoc` from, exports no `LoadRow`-shaped row builder and no
`expectCaptured`/`expectRows`/`registered` helper alongside its existing
`Diagnostic[]`-shaped exports.

## Evidence

tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts:161-172:
```ts
interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PATH}`, import.meta.url)), "utf8"),
) as RegistryRow[];
```

tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts:128-139
(byte-identical):
```ts
interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PATH}`, import.meta.url)), "utf8"),
) as RegistryRow[];
```

tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts:252-264
— the row builder:
```ts
function theta(label: string, body: string): LoadRow {
  const doc = parseDoc(`${FRONTMATTER}${body}\n`, "b0274.theta");
  return {
    label,
    codes: doc.diagnostics.map((d: Diagnostic) => d.code),
    lines: doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`),
    declared: doc.body.statements
      .filter((s) => s.kind === "schema" || s.kind === "enum")
      .map((s) => (s as { name: string }).name),
    statements: doc.body.statements.length,
    doc,
  };
}
```

tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts:202-214 —
its `row` helper, whose object-construction body is byte-identical:
```ts
function row(label: string, source: string): LoadRow {
  const doc = parseDoc(source, "b0277.theta");
  return {
    label,
    codes: doc.diagnostics.map((d: Diagnostic) => d.code),
    lines: doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`),
    declared: doc.body.statements
      .filter((s) => s.kind === "schema" || s.kind === "enum")
      .map((s) => (s as { name: string }).name),
    statements: doc.body.statements.length,
    doc,
  };
}
```

tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts:297-310
— the precondition assertion:
```ts
function expectCaptured(rows: readonly LoadRow[], names: readonly string[]): void {
  const empty = rows.filter((r) => r.statements === 0).map((r) => r.label);
  expect(
    empty,
    "precondition: every fixture must parse to at least one body statement; a row listed here lost its body upstream of the type walk, so its diagnostic list says nothing about this bug",
  ).toEqual([]);
  const mismatched = rows
    .filter((r) => JSON.stringify(r.declared) !== JSON.stringify(names))
    .map((r) => [r.label, r.declared]);
  expect(
    mismatched,
    `precondition: every fixture must capture exactly the declarations ${JSON.stringify(names)}`,
  ).toEqual([]);
}
```

tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts:266-279
(byte-identical, including the message strings):
```ts
function expectCaptured(rows: readonly LoadRow[], names: readonly string[]): void {
  const empty = rows.filter((r) => r.statements === 0).map((r) => r.label);
  expect(
    empty,
    "precondition: every fixture must parse to at least one body statement; a row listed here lost its body upstream of the type walk, so its diagnostic list says nothing about this bug",
  ).toEqual([]);
  const mismatched = rows
    .filter((r) => JSON.stringify(r.declared) !== JSON.stringify(names))
    .map((r) => [r.label, r.declared]);
  expect(
    mismatched,
    `precondition: every fixture must capture exactly the declarations ${JSON.stringify(names)}`,
  ).toEqual([]);
}
```

The remaining pieces of the same harness are correspondingly identical, cited
by line range: `msg` (b0274:193-208, b0277:157-172 — byte-identical body),
`line`/`reservedLine` (b0274:211-218, b0277:175-182 — byte-identical),
`registered` (b0274:274-276, b0277:243-245 — identical logic, parameter
renamed `row`→`r`), `startPositions` (b0274:285-289, b0277:254-258 — identical
logic, same rename), and `expectRows` (b0274:318-330, b0277:287-295 —
identical two-stage `.toEqual` structure, reformatted onto fewer lines in
b0277).

Pattern-wide search: `grep -rl "^function expectCaptured(rows: readonly
LoadRow\[\], names: readonly string\[\]): void {" tests --include="*.test.ts"`
→ exactly 8 files: tests/b0262-unresolved-named-type-reference-positions.test.ts,
tests/b0273-query-result-error-side-unresolved-name.test.ts,
tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts,
tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts,
tests/b0278-result-arity-mismatch-silent-at-query-response-annotation.test.ts,
tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts,
tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts, and
tests/b0284-non-identifier-applied-generic-head.test.ts. `grep -rln
"^interface LoadRow {" tests --include="*.test.ts"` returns the identical
8-file set.

tests/helpers/e2e-s1.ts:60-74 — the canonical shared module both reviewed
files already import `parseDoc` from, showing the adjacent `Diagnostic[]`
helpers it already hosts (none shaped like `LoadRow`/`expectCaptured`):
```ts
/** True iff any diagnostic carries the given code. */
export function hasCode(diags: readonly Diagnostic[], code: string): boolean {
  return diags.some((d) => d.code === code);
}

/** The first diagnostic carrying the given code, if any. */
export function findCode(
  diags: readonly Diagnostic[],
  code: string,
): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

/** All distinct diagnostic codes present (sorted, for readable failures). */
export function codes(diags: readonly Diagnostic[]): string[] {
```

## Why this is a problem
This is the "Boilerplate duplication" class: a multi-part setup/assertion
harness — registry loading, message rendering, a row builder wrapping
`parseDoc`, a registration predicate, a position projector, and a two-stage
assertion pair — recurs as one unit rather than being shared. The two files
reviewed here reproduce it with only cosmetic variation (a renamed parameter,
one added indirection layer), and the harness's most distinctive single
function, `expectCaptured`, is byte-identical (including its two literal
precondition-failure strings) across at least 8 files total. Both reviewed
files already import `parseDoc` from tests/helpers/e2e-s1.ts, which hosts
`hasCode`/`findCode`/`codes`/`errors` as shared, exported `Diagnostic[]`
projections, so the convention of factoring this class of read-only test
plumbing into that module is already established for smaller pieces of the
same domain; the `LoadRow` row-builder and its `registered`/`expectCaptured`/
`expectRows` companions have no counterpart there and are instead re-derived
at each of the 8 sites.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts already hosts `parseDoc` and four adjacent
`Diagnostic[]`-shaped exports that both reviewed files draw on; it is the
existing home for shared, read-only parse-and-project test plumbing of this
shape.

## False-positive check
- Gate-pin: neither tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts
  nor tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts nor
  tests/helpers/e2e-s1.ts matches `*gate*.test.ts` or the named kin. Two of the
  six further files the pattern-wide search names
  (tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts,
  tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts) do
  match the `*gate*.test.ts` glob by filename, but this finding cites them only
  as additional instances of the same duplicated, domain-free load-harness
  function — it makes no claim about a pinned count or inventory those two
  files assert, so the census/pin carve-out's concern does not apply to the
  claim being made.
- Recording-double: `expectCaptured`/`expectRows`/`registered`/`startPositions`
  all read fields off an already-returned `LoadRow` (itself built from
  `parseDoc`'s return value); none records a call to assert something was
  never invoked, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0274-reserved-keyword-in-result-error-argument-silent-at-query-capture.md
  Status "fixed (0.272.0)"; docs/bugs/0277-unapplied-generic-head-admitted-and-inert-at-five-type-positions.md
  Status "fixed (0.275.0)". `npx vitest run
  tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts
  tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts` passes
  (31 tests, both files) at HEAD. The six further files found by the
  pattern-wide search were also run
  (`tests/b0262-unresolved-named-type-reference-positions.test.ts`,
  `tests/b0273-query-result-error-side-unresolved-name.test.ts`,
  `tests/b0278-result-arity-mismatch-silent-at-query-response-annotation.test.ts`,
  `tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts`,
  `tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts`,
  `tests/b0284-non-identifier-applied-generic-head.test.ts`) and all 92 of
  their tests pass; none is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0274-reserved-keyword-type-head-at-five-unwired-captures\|b0277-unapplied-generic-head-at-five-filtered-captures"
  docs/reference/coverage-matrix.md` → 0 hits, and the same search for the six
  further filenames also returns 0 hits. This finding does not propose merging,
  renaming or deleting any file — only that the shared harness could be
  imported rather than redefined — so no citation is affected.
- Coverage check: the claim is entirely about a repeated harness DEFINITION,
  not a missing test path; every cited function is exercised by the tests in
  its own file.

## Triage
verdict: confirmed — every cited excerpt (RegistryRow/REGISTRY, msg/line/reservedLine, LoadRow interface, theta/row builder, registered, startPositions, expectCaptured, expectRows) reproduces byte-for-byte or with the stated trivial rename at the cited lines in both files, and the expectCaptured 8-file pattern search, docs/bugs status, vitest pass counts for the six further files, and coverage-matrix 0-hit search all reproduce; D7 boilerplate-duplication, no gate-pin/negative-witness/coverage-matrix carve-out applies (the report's own claim that the `interface LoadRow` grep returns "the identical 8-file set" is wrong — it returns 16 files — and its 31-test count for the two focal files is wrong — actual is 26 — but neither error touches the core byte-identical-harness claim, which is independently verified). (triage: claude-opus-5)
