---
id: PTQ-0227
title: b0296, b0297, b0298, and b0301 each redefine the same doc()/expectRow/expectNoRow frontmatter-diagnostic fixture harness
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0296-mode-nonscalar-value-collapse.test.ts:102-128
  - tests/b0297-bind-context-bind-model-nonscalar.test.ts:123-149
  - tests/b0298-system-nonscalar-silent-drop-and-prompt-mode-suppression.test.ts:127-143
  - tests/b0301-bind-echo-tool-loop-respond-repair-holes.test.ts:130-168
sites: 4
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0296, b0297, b0298, and b0301 each redefine the same doc()/expectRow/expectNoRow frontmatter-diagnostic fixture harness

## Observation
Four sibling frontmatter-field bug-report test files each independently
declare a two-piece harness: a `doc(frontmatter: string): ThetaDocument`
fixture builder that wraps `parseDoc` around one fixed one-field template,
and an `expectRow`/`expectNoRow` pair that asserts a diagnostic row is (or is
not) present with a given code/severity/message. The `doc()` builder's body
and JSDoc are byte-identical across all four files; `expectRow`/`expectNoRow`
are byte-identical in two of the four and near-identical (a compressed
one-liner, or an added `severity` parameter) in the other two. None of the
four files cites another as the source of this harness, and no
`tests/helpers/` module exports either piece.

## Evidence
tests/b0296-mode-nonscalar-value-collapse.test.ts:102-128:
```ts
/** One theta file: `---` fences over `<frontmatter>`, body `let x = 1`. */
function doc(frontmatter: string): ThetaDocument {
  return parseDoc(`---\n${frontmatter}\n---\nlet x = 1\n`);
}

/** Assert a refusal row is present at error severity with the given Message. */
function expectRow(
  diags: readonly Diagnostic[],
  code: string,
  message: string,
): void {
  const row = findCode(diags, code);
  expect(
    row,
    `expected a ${code} row; got codes ${JSON.stringify(codes(diags))}`,
  ).toBeDefined();
  expect((row as Diagnostic).severity).toBe("error");
  expect((row as Diagnostic).message).toBe(message);
}

/** Assert NO row carries the given code (the collapse must not survive). */
function expectNoRow(diags: readonly Diagnostic[], code: string): void {
  expect(
    findCode(diags, code),
    `expected NO ${code} row; got codes ${JSON.stringify(codes(diags))}`,
  ).toBeUndefined();
}
```

tests/b0297-bind-context-bind-model-nonscalar.test.ts:123-149 — `doc()` is
byte-identical to the excerpt above; `expectRow` is byte-identical; only
`expectNoRow`'s one-line comment differs ("the recognised value must stay
clean" instead of "the collapse must not survive"):
```ts
/** One theta file: `---` fences over `<frontmatter>`, body `let x = 1`. */
function doc(frontmatter: string): ThetaDocument {
  return parseDoc(`---\n${frontmatter}\n---\nlet x = 1\n`);
}

/** Assert a refusal row is present at error severity with the given Message. */
function expectRow(
  diags: readonly Diagnostic[],
  code: string,
  message: string,
): void {
  const row = findCode(diags, code);
  expect(
    row,
    `expected a ${code} row; got codes ${JSON.stringify(codes(diags))}`,
  ).toBeDefined();
  expect((row as Diagnostic).severity).toBe("error");
  expect((row as Diagnostic).message).toBe(message);
}

/** Assert NO row carries the given code (the recognised value must stay clean). */
function expectNoRow(diags: readonly Diagnostic[], code: string): void {
  expect(
    findCode(diags, code),
    `expected NO ${code} row; got codes ${JSON.stringify(codes(diags))}`,
  ).toBeUndefined();
}
```

tests/b0298-system-nonscalar-silent-drop-and-prompt-mode-suppression.test.ts:127-143
— the same `doc()` body verbatim; `expectRow` collapsed onto fewer lines but
asserting the identical three things (a defined row, `severity === "error"`,
`message === message`); this file declares no `expectNoRow` at all:
```ts
/** One theta file: `---` fences over `<frontmatter>`, body `let x = 1`. */
function doc(frontmatter: string): ThetaDocument {
  return parseDoc(`---\n${frontmatter}\n---\nlet x = 1\n`);
}

/** A `system:` over a block SEQUENCE — the ordinary YAML reflex for multi-line text. */
const SYSTEM_BLOCK_SEQUENCE = "system:\n  - You are a reviewer";
/** A `system:` over a block MAPPING — the second non-scalar node kind. */
const SYSTEM_BLOCK_MAPPING = "system:\n  text: You are a reviewer";

/** Assert the refusal row is present at error severity with the settled Message. */
function expectRow(diags: readonly Diagnostic[], code: string, message: string): void {
  const row = findCode(diags, code);
  expect(row, `expected a ${code} row; got codes ${JSON.stringify(codes(diags))}`).toBeDefined();
  expect((row as Diagnostic).severity).toBe("error");
  expect((row as Diagnostic).message).toBe(message);
}
```

tests/b0301-bind-echo-tool-loop-respond-repair-holes.test.ts:130-168 — the
same `doc()` body verbatim; `expectRow` adds one parameter (`severity`, since
this file's rows are a mix of error/warning) but is otherwise the same three
assertions; `expectNoRow` is byte-identical to b0296/b0297's body:
```ts
/** One theta file: `---` fences over `<frontmatter>`, body `let x = 1`. */
function doc(frontmatter: string): ThetaDocument {
  return parseDoc(`---\n${frontmatter}\n---\nlet x = 1\n`);
}
...
/** Assert a row is present at the given severity carrying the exact Message. */
function expectRow(
  diags: readonly Diagnostic[],
  code: string,
  severity: Diagnostic["severity"],
  message: string,
): void {
  const row = findCode(diags, code);
  expect(
    row,
    `expected a ${code} row; got codes ${JSON.stringify(codes(diags))}`,
  ).toBeDefined();
  expect((row as Diagnostic).severity).toBe(severity);
  expect((row as Diagnostic).message).toBe(message);
}

/** Assert NO row carries the given code. */
function expectNoRow(diags: readonly Diagnostic[], code: string): void {
  expect(
    findCode(diags, code),
    `expected NO ${code} row; got codes ${JSON.stringify(codes(diags))}`,
  ).toBeUndefined();
}
```

Exact search: `grep -rn "^function doc(frontmatter: string): ThetaDocument {" tests --include="*.test.ts"`
returns exactly these 4 files and no others. All four already import
`parseDoc`/`findCode`/`codes` from `tests/helpers/e2e-s1.ts`.

## Why this is a problem
The same two-piece harness — a one-field theta-document fixture builder and a
diagnostic-row present/absent assertion pair — is retyped whole into four
independently authored sibling files rather than shared. `doc()`'s body and
JSDoc are byte-for-byte identical in all four; `expectRow`/`expectNoRow` are
byte-identical in two of the four and differ only by a compressed formatting
or one added parameter in the other two. None of the four files' extensive
prose (each carries a multi-paragraph header citing the others by bug number
for shared TEST-CASE shapes, e.g. "mirrors bug 0296 cell G") acknowledges
that this specific harness code is shared — each presents it as freshly
authored. This repository already has an established, working precedent for
extracting exactly this class of per-sibling-bug-file harness into
`tests/helpers/` (e.g. `tests/helpers/production-load-harness.ts`'s
`runProductionLoad`, `tests/helpers/load-row-harness.ts`), so the convention
of sharing this kind of read-and-assert plumbing is already established for
adjacent cases; this particular fixture-builder/row-assertion pair has no
counterpart there and is instead re-derived at each of the 4 sites.

## Suggested direction (non-binding, optional)
All four files already import `parseDoc`/`findCode`/`codes` from
`tests/helpers/e2e-s1.ts`; that existing import point is the home the
`doc()`/`expectRow`/`expectNoRow` trio already sits beside in every one of the
four files.

## False-positive check
- Gate-pin check: none of the four files (b0296-mode-nonscalar-value-collapse,
  b0297-bind-context-bind-model-nonscalar,
  b0298-system-nonscalar-silent-drop-and-prompt-mode-suppression,
  b0301-bind-echo-tool-loop-respond-repair-holes) matches `*gate*.test.ts` or
  the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: `doc()`/`expectRow`/`expectNoRow` build a fixture and
  read fields off an already-returned `ThetaDocument`/`Diagnostic[]`; none
  records a call to prove something was never invoked, so the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0296-mode-nonscalar-value-collapses-to-missing-mode.md`,
  `0297-bind-context-nonscalar-silently-registers.md`,
  `0298-system-nonscalar-silent-drop-and-prompt-mode-suppression.md`, and
  `0301-bind-echo-tool-loop-respond-repair-silent-default-holes.md` are all
  **Status: fixed**; each names its test file as a pinned "witness" with a
  specific cell count (9, 12, 8, and 20 cells respectively), but none discusses
  or requires a specific implementation of `doc()`/`expectRow`/`expectNoRow` —
  the pin is on the cells' behaviour, not this internal plumbing. `npx vitest
  run` on each of the four files reproduces its pinned cell count, all green
  (9/9, 12/12, 8/8, 20/20), so none is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0296-mode-nonscalar-value-collapse\|b0297-bind-context-bind-model-nonscalar\|b0298-system-nonscalar-silent-drop\|b0301-bind-echo-tool-loop-respond-repair-holes"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge,
  rename, or deletion of any test or cell — only that the internal fixture
  builder and assertion helpers could be imported rather than redefined — so
  no witness-list citation is disturbed.
- Distinct from the already-filed registry-oracle family (PTQ-0206, PTQ-0207,
  PTQ-0215): those findings, and this wave's own
  `qw20260912091742-d7-01-corpus-discovery-harness-duplicated.md`, are about a
  DIFFERENT, already-covered duplication — the `RegistryRow`/`REGISTRY`
  registry-page read and the DIAG-4 anchor test bodies built on it, which also
  recur in these same four files (confirmed: `grep -rl "interface RegistryRow"
  tests --include="*.test.ts"` returns 100+ files including all four here).
  This finding's Evidence deliberately excludes those declarations and cites
  only `doc()`/`expectRow`/`expectNoRow`, which are absent from
  `tests/helpers/registry-oracle.ts` and from any resolved PTQ's cited
  locations.
- Distinct from the rejected d7-01/d7-03 shape (documented, widely-repeated
  sibling convention): none of the four files' own comments acknowledges
  `doc()`/`expectRow`/`expectNoRow` as intentionally copied from a named
  sibling — the "mirrors bug 0296 cell G" / "Mirrors bug 0296's `? mode` cell
  H" comments found in b0297 (lines 252, 299) refer to mirroring a per-cell
  TEST CASE shape (an alias fixture, a no-value-node fixture), not to sharing
  this harness code, so the "explicitly documented convention" carve-out that
  applied to the SEAM_NOOP_* / `fakeThetaLibFs` patterns elsewhere in this
  wave's scope does not apply here.
- Coverage check: the claim is entirely about a repeated harness DEFINITION,
  not a missing test path; every cited function is exercised by the tests in
  its own file.

## Triage
verdict: confirmed — every excerpt and line range reproduces exactly (doc() byte-identical across all four via diff; expectRow byte-identical b0296/b0297, compressed-but-identical-logic in b0298, +severity param in b0301; expectNoRow byte-identical b0296/b0301, absent in b0298), the `^function doc(frontmatter: string): ThetaDocument {` search returns exactly these 4 files, none is a gate/kin file, all four docs/bugs entries are fixed with vitest reproducing 9/12/8/20 green, coverage-matrix.md has 0 hits, and the finding is correctly distinguished from the already-tracked RegistryRow/registry-oracle duplication (PTQ-0206/0207/0215, also present in these same four files but not cited here) and from this wave's unrelated corpus-discovery finding — genuine D7 boilerplate/copy-paste-fixture duplication in tests/, no matching PTQ or rejection in the ledger (triage: claude-opus-5)
