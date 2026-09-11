---
id: PTQ-0207
title: b0272 and b0273 duplicate their LoadRow/theta/registered fixture-load harness and msg/line message renderer almost byte-for-byte
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0272-enclosing-annotation-refusal-nested-head.test.ts:168-242
  - tests/b0273-query-result-error-side-unresolved-name.test.ts:139-217
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260911104855
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# b0272 and b0273 duplicate their LoadRow/theta/registered fixture-load harness and msg/line message renderer almost byte-for-byte

## Observation
tests/b0272-enclosing-annotation-refusal-nested-head.test.ts and
tests/b0273-query-result-error-side-unresolved-name.test.ts each define a
private `msg`/`line` registry-message renderer, a `LoadRow` interface, a
`FRONTMATTER` constant, a `theta(label, body)` function that parses a fixture
through the shared `parseDoc` helper into a `LoadRow`, and a `registered(row)`
function mirroring the composition root's registration predicate. Across the
~75 lines these five pieces occupy in each file, the only byte differences are
the fixture-name literal passed to `parseDoc` (`"b0272.theta"` vs
`"b0273.theta"`) and one JSDoc comment's wording on `line`. Neither file
imports the other piece from `tests/helpers/`; no such module exists there.

## Evidence
tests/b0272-enclosing-annotation-refusal-nested-head.test.ts:168-182 — the
`msg` renderer:
```ts
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${REGISTRY_PATH} must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
```

tests/b0273-query-result-error-side-unresolved-name.test.ts:139-153 — the
same function, confirmed byte-identical by `diff`:
```ts
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${REGISTRY_PATH} must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
```

tests/b0272-enclosing-annotation-refusal-nested-head.test.ts:205-219 — the
`LoadRow` interface, `FRONTMATTER` constant and the start of `theta`:
```ts
interface LoadRow {
  readonly label: string;
  readonly codes: readonly string[];
  readonly lines: readonly string[];
  readonly declared: readonly string[];
  readonly statements: number;
  readonly doc: ThetaDocument;
}

/** The frontmatter every fixture carries, per the bug document's §Reproduction. */
const FRONTMATTER = "---\ndescription: d\nmode: prompt\n---\n\n";

/** A `mode: prompt` theta whose body is `body` verbatim, parsed once. */
function theta(label: string, body: string): LoadRow {
  const doc = parseDoc(`${FRONTMATTER}${body}\n`, "b0272.theta");
```

tests/b0273-query-result-error-side-unresolved-name.test.ts:180-194 — the
same three declarations, confirmed byte-identical by `diff` except the
fixture-name literal on the last line:
```ts
interface LoadRow {
  readonly label: string;
  readonly codes: readonly string[];
  readonly lines: readonly string[];
  readonly declared: readonly string[];
  readonly statements: number;
  readonly doc: ThetaDocument;
}

/** The frontmatter every fixture carries, per the bug document's §Reproduction. */
const FRONTMATTER = "---\ndescription: d\nmode: prompt\n---\n\n";

/** A `mode: prompt` theta whose body is `body` verbatim, parsed once. */
function theta(label: string, body: string): LoadRow {
  const doc = parseDoc(`${FRONTMATTER}${body}\n`, "b0273.theta");
```

tests/b0272-enclosing-annotation-refusal-nested-head.test.ts:240-242 and
tests/b0273-query-result-error-side-unresolved-name.test.ts:215-217 — the
`registered` mirror, byte-identical:
```ts
function registered(row: LoadRow): boolean {
  return !row.doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
}
```

Exact searches against `tests/*.test.ts` (both cited files included in every
count): `grep -rl "interface LoadRow"` → 16 files; `grep -rl "function
theta(label: string, body: string)"` → 10 files; `grep -rl "function
registered(row: LoadRow)"` → 7 files; `grep -rlF 'const FRONTMATTER =
"---\ndescription: d\nmode: prompt\n---\n\n";'` → 11 files; `grep -rl
"function msg(code: string, fills: ReadonlyArray"` → 55 files; `grep -rl
"^function line(code: string, fills: ReadonlyArray"` → 12 files.

## Why this is a problem
This is the "Boilerplate duplication" class: a five-piece load-and-render
harness (`msg`, `line`, `LoadRow`, `FRONTMATTER`, `theta`, `registered`) is
retyped whole into a second sibling file rather than shared, and `diff`
confirms the retyping is byte-for-byte except one fixture-name string and one
comment. Both files already import the one piece that IS centralised
(`parseDoc`, from `tests/helpers/e2e-s1.ts`), so the harness around that call
is the only part left to hand-copy. The pattern is not confined to this pair:
the same interface name, function name and constant recur, exactly or
near-exactly, across eight to sixteen further sibling `b02xx` parser-diagnostic
test files (counts above), which is the shape a harness takes when each new
sibling bug's test file is started from the previous one's file rather than
from a shared module. `tests/helpers/` holds no module exporting any of these
five pieces.

## Suggested direction (non-binding, optional)
Both files already import `parseDoc` from `tests/helpers/e2e-s1.ts`; that
established import point is the home the `msg`/`line`/`LoadRow`/`theta`/
`registered` quintet already sits beside, parameterised by the registry path
and the fixture-name label that are this harness's only two per-file values.

## False-positive check
- Gate-pin carve-out: neither `tests/b0272-enclosing-annotation-refusal-nested-head.test.ts`
  nor `tests/b0273-query-result-error-side-unresolved-name.test.ts` matches
  `*gate*.test.ts` or the named kin; not applicable, and no cited assertion is
  a pinned count or inventory — `msg`/`line`/`theta`/`registered` are plain
  helper functions, not `expect` calls.
- Recording-double carve-out: none of the five pieces records a call for a
  "never called" witness; `registered` re-derives a boolean from an already-
  produced diagnostics array, and `theta` parses a literal source string
  through the shared `parseDoc`; not applicable.
- docs/bugs/ signature search: `docs/bugs/0272-enclosing-annotation-refusal-swallows-nested-unresolved-head.md`
  Status "fixed (0.269.0)"; `docs/bugs/0273-propagated-result-error-side-unresolved-name-silent.md`
  Status "fixed (0.267.0)". `npx vitest run
  tests/b0272-enclosing-annotation-refusal-nested-head.test.ts
  tests/b0273-query-result-error-side-unresolved-name.test.ts` → both green,
  18/18 tests passing at HEAD, so neither is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0272-enclosing-annotation-refusal-nested-head\|b0273-query-result-error-side-unresolved-name"
  docs/reference/coverage-matrix.md` → no hits. Neither file name appears in
  any `docs/bugs/*.md` witness list under the other bug's number. This finding
  proposes no merge, rename or deletion of either test file or any
  `it()`/`describe()` — only that the internal harness functions could be
  imported rather than retyped — so the citation carve-out does not bind.
- Overlap check against this same wave's other D7 candidates: this finding's
  cited line ranges exclude the `RegistryRow`/`REGISTRY` declarations that
  precede `msg` in both files (b0272:139-150, b0273:114-125); that block
  performs the identical `parseRegistry(readFileSync(...))` operation already
  generalised, with a repo-wide 212/189-file count, by the sibling candidate
  `qw20260911104855-d7-02-registry-oracle-harness-duplication.md`. This
  finding's evidence starts at `msg` specifically so the two candidates do not
  re-cite the same lines under two different root causes.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every piece cited is exercised by the tests in its own
  file.

## Triage
verdict: confirmed — independently verified: `msg`/`registered` are byte-identical (diff) and `LoadRow`/`FRONTMATTER`/`theta` differ only in the fixture-name literal at the cited lines in both files; all six pattern-search counts (16/10/7/11/55/12) reproduce exactly; no `tests/helpers/` module exports any of the five pieces; both files pass 18/18 at HEAD and are absent from coverage-matrix.md; correctly scoped D7 boilerplate-duplication with no matching ticket in the given ledger (triage: claude-opus-5)
