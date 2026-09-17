---
id: PTQ-0426
title: The argRange/letRange PRECONDITION-checking helper pair is reimplemented byte-for-byte in three sibling parse-diagnostics test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/fn-arg-type-mismatch-wired.test.ts:609-621
  - tests/fn-arg-type-mismatch-wired.test.ts:686-693
  - tests/division-result-type-number.test.ts:551-563
  - tests/division-result-type-number.test.ts:570-577
  - tests/modulo-zero-result-type-number.test.ts:596-608
  - tests/modulo-zero-result-type-number.test.ts:615-622
sites: 3
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The argRange/letRange PRECONDITION-checking helper pair is reimplemented byte-for-byte in three sibling parse-diagnostics test files

## Observation
`tests/fn-arg-type-mismatch-wired.test.ts` defines two private harness functions, `argRange` and `letRange`, whose job is to locate the sole matching call argument / `let` binding in a parsed fixture and fail loudly (via `expect(...).toHaveLength(1)` / `toBeGreaterThan(index)`) when the fixture's shape has drifted. The same two functions, with the same signatures, the same two-step precondition structure and the same verbatim `PRECONDITION: …` message text (down to punctuation), are independently defined in `tests/division-result-type-number.test.ts` and `tests/modulo-zero-result-type-number.test.ts`. The only difference between the three copies is the name of the local accessor each file's own AST-walk exposes (`collectCalls(doc)` / `collectLets(doc)` in the wired file, `anchorsOf(doc).calls` / `anchorsOf(doc).lets` in the other two).

## Evidence
`tests/fn-arg-type-mismatch-wired.test.ts:609-621`:
```ts
function argRange(doc: ThetaDocument, callee: string, index: number): SourceRange {
  const calls = collectCalls(doc).filter((c) => c.callee === callee);
  expect(
    calls,
    `PRECONDITION: the fixture must hold exactly one call of '${callee}'; the parse found ${calls.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  const args = calls[0]!.args;
  expect(
    args.length,
    `PRECONDITION: the call of '${callee}' must carry an argument at index ${index}; it carries ${args.length}. Diagnostics: ${render(doc)}`,
  ).toBeGreaterThan(index);
  return args[index]!;
}
```

`tests/division-result-type-number.test.ts:551-563` — identical body, `anchorsOf(doc).calls` in place of `collectCalls(doc)`:
```ts
function argRange(doc: ThetaDocument, callee: string, index: number): SourceRange {
  const calls = anchorsOf(doc).calls.filter((c) => c.callee === callee);
  expect(
    calls,
    `PRECONDITION: the fixture must hold exactly one call of '${callee}'; the parse found ${calls.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  const args = calls[0]!.args;
  expect(
    args.length,
    `PRECONDITION: the call of '${callee}' must carry an argument at index ${index}; it carries ${args.length}. Diagnostics: ${render(doc)}`,
  ).toBeGreaterThan(index);
  return args[index]!;
}
```

`tests/modulo-zero-result-type-number.test.ts:596-608` — the same body a third time:
```ts
function argRange(doc: ThetaDocument, callee: string, index: number): SourceRange {
  const calls = anchorsOf(doc).calls.filter((c) => c.callee === callee);
  expect(
    calls,
    `PRECONDITION: the fixture must hold exactly one call of '${callee}'; the parse found ${calls.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  const args = calls[0]!.args;
  expect(
    args.length,
    `PRECONDITION: the call of '${callee}' must carry an argument at index ${index}; it carries ${args.length}. Diagnostics: ${render(doc)}`,
  ).toBeGreaterThan(index);
  return args[index]!;
}
```

The `letRange` counterpart repeats the same pattern in all three files. `tests/fn-arg-type-mismatch-wired.test.ts:686-693`:
```ts
function letRange(doc: ThetaDocument, name: string): SourceRange {
  const hits = collectLets(doc).filter((l) => l.name === name);
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one \`let ${name}\`; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  return hits[0]!.range;
}
```

`tests/division-result-type-number.test.ts:570-577`:
```ts
function letRange(doc: ThetaDocument, name: string): SourceRange {
  const hits = anchorsOf(doc).lets.filter((l) => l.name === name);
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one \`let ${name}\`; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  return hits[0]!.range;
}
```

`tests/modulo-zero-result-type-number.test.ts:615-622` — the same body a third time:
```ts
function letRange(doc: ThetaDocument, name: string): SourceRange {
  const hits = anchorsOf(doc).lets.filter((l) => l.name === name);
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one \`let ${name}\`; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  return hits[0]!.range;
}
```

Search used: `grep -n "function argRange\|function letRange" tests/*.test.ts` — hits exactly these three files (`tests/fn-arg-type-mismatch-wired.test.ts`, `tests/division-result-type-number.test.ts`, `tests/modulo-zero-result-type-number.test.ts`), no fourth. `grep -n "function collectCalls" tests/` additionally shows the underlying call-collecting AST walk that `argRange` filters (named `collectCalls` in the wired file, folded into `anchorsOf` in the other two, and independently reimplemented again under the name `collectCalls` in `tests/fn-call-arity-unchecked.test.ts:267` and `tests/imported-thetalib-fn-call-args-checked.test.ts:461`, with the same `walkExpr`/`walkStmt`/`walkBlock` recursive shape over the same `Expr`/`Stmt` node kinds) — the same "locate this fixture's sole call/let, fail loudly if the count is not exactly one" harness is hand-rolled independently at every one of these bug-scoped parse-diagnostics test files.

## Why this is a problem
`argRange` and `letRange` are not incidental test code — every positive and negative cell in `tests/fn-arg-type-mismatch-wired.test.ts` (and the equivalent cells in the other two files) calls one of them as its anti-vacuity precondition, the mechanism that keeps an "emits nothing" assertion from measuring a drifted fixture instead of the intended one. That the exact same precondition text and structure was independently retyped in `tests/division-result-type-number.test.ts` and `tests/modulo-zero-result-type-number.test.ts` (both of which the wired file's own header comments name as sibling arithmetic-result checks reached through the same `type-layer-checks.ts` walk) means a change to the precondition's wording, to the "exactly one" cardinality rule, or to a fix for a bug in it, has to be applied by hand at three separate call sites with no shared symbol tying them together.

## Suggested direction (non-binding, optional)
`tests/helpers/` already holds several per-domain parse/harness modules (e.g. `e2e-s1.ts` for the shared `parseDoc` driver); the `argRange`/`letRange` precondition pair, parameterised over whatever accessor a given file's own AST-collection function exposes, is a plausible additional resident there — a routing observation, not a design.

## False-positive check
Gate-pin check: none of the three files matches `*gate*.test.ts` or the named gate kin; not applicable. Recording-double check: `argRange`/`letRange` throw on a missing/duplicate match rather than recording a call for a MUST-NOT witness; not a recording double. docs/bugs/ signature search: `grep -rl "argRange\|letRange"` against `docs/bugs/` returns nothing — no open bug doc cites either symbol by name, so this is not a documented correct-reason red. coverage-matrix/bug-doc citation search: `grep -n "argRange\|letRange" docs/reference/coverage-matrix.md` returns nothing, and neither symbol appears in any bug doc's witness list — no test is pinned by name here, and this finding proposes no rename/merge/delete of any `it(...)` cell, only of the shared private helper functions, so the citation carve-out does not apply. This claim is about test code that exists (three verbatim-duplicated helper bodies), not about a missing test, so it does not drift into coverage.

## Triage
<!-- appended by triage -->
verdict: confirmed — all six excerpts reproduce byte-for-byte at the cited lines and `grep "function argRange\|function letRange" tests/` hits exactly these 3 files/6 definitions (accessor name is the sole difference; both PRECONDITION templates identical to the character), helpers are load-bearing (argRange/letRange call sites 65/27, 22/18, 12/17) and were authored in three separate commits (3efdb4ac bug-0050, 4d072c83 bug-0142, 35b718cc bug-0152) — D7 boilerplate duplication of the same class as confirmed PTQ-0257/PTQ-0300, not a duplicate of PTQ-0242 (same helpers, cannot-fail class); two ancillary claims are refuted for the record: the docs/bugs grep does NOT return nothing (7 bug docs mention the helpers, but only as the witness cells' precondition behaviour — none pins the helper as file-private or names an it() cell for rename/merge/delete, so the witness-list carve-out still does not apply; coverage-matrix grep is genuinely 0), and the wired file's header does not name the two sibling files (grep division/modulo/0142/0152 → 0 hits) (triage: claude-fable-5-1)
