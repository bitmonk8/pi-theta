---
id: PTQ-1747
title: The B0516 unit and control files repeat the raw lexer-to-body-parser harness.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0516-final-par-for-unit.test.ts:19-26
  - tests/b0516-final-par-for-controls.test.ts:63-70
sites: 2
fix_scope: module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The B0516 unit and control files repeat the raw lexer-to-body-parser harness.

## Observation
Two B0516 files independently define `raw(source: string): Block` with the same eight-line sequence. Each encodes source, invokes the real lexer with inert note dependencies, requires clean lexing, constructs `BodyParser`, parses the body, requires no parser diagnostics, and returns the body. The only textual differences inside these functions are the two assertion messages. A raw-body-parser harness under `tests/helpers/` is the natural shared home for this sequence; the fixture programs and their assertions are separate from it.

## Evidence
`tests/b0516-final-par-for-unit.test.ts:19-26`:

```ts
function raw(source: string): Block {
  const lexed = lexTheta({ path: FILE, bytes: new TextEncoder().encode(source) }, parseDeps().systemNote);
  expect(lexed.diagnostics, "unit fixture must lex cleanly").toEqual([]);
  const parser = new BodyParser(lexed.tokens, FILE, source);
  const body = parser.parseBody();
  expect(parser.diagnostics, "raw fixture must parse without recovery").toEqual([]);
  return body;
}
```

`tests/b0516-final-par-for-controls.test.ts:63-70`:

```ts
function raw(source: string): Block {
  const lexed = lexTheta({ path: FILE, bytes: new TextEncoder().encode(source) }, parseDeps().systemNote);
  expect(lexed.diagnostics, "StmtBlock control must lex cleanly").toEqual([]);
  const parser = new BodyParser(lexed.tokens, FILE, source);
  const body = parser.parseBody();
  expect(parser.diagnostics, "StmtBlock control must parse without recovery").toEqual([]);
  return body;
}
```

Count: two harness implementations, both cited above. This is a message-only divergence, not a difference in parser entry point or processing steps.

## Why this is a problem
This is **boilerplate duplication**: the same fixture-admission and raw-parser setup is maintained in two test files. The duplicated code includes both prerequisite checks as well as the lexer/parser invocation sequence, rather than just fixture-specific values. The unit and StmtBlock controls have different semantic assertions, but those differences are outside the repeated harness.

## Suggested direction (non-binding, optional)
Consider sharing only the raw parsing setup while retaining each test name, fixture, assertion, and parser-isolation boundary. The files are cited in `docs/bugs/0516-statement-position-par-for-trailing-value-kept.md`; this observation does not propose merging, renaming, or deleting their tests.

## False-positive check
- **Gate-pin:** neither file is a census/pin gate; the cited functions contain no pinned inventory or expected count. The complaint is the repeated harness, not any parse-shape pin.
- **Recording-double:** these functions invoke the production lexer and parser, not negative-witness recording doubles. No MUST-NOT assertion is questioned.
- **docs/bugs/ signature search:** searched `docs/bugs/` for `b0516`, `0516`, `raw parser unit`, and `StmtBlock raw layout`, then read bug 0516, including its preserved-red and control sections. It records structural/type failures and post-fix passes, not a disabled-test prerequisite. This finding does not characterize those historical reds as skips.
- **Coverage-matrix/bug-doc citation search:** `rg -n 'b0516-final-par-for-(controls|unit)' docs/bugs/ docs/reference/coverage-matrix.md` finds bug 0516's execution/control records (lines 316, 341 and 364), with no coverage-matrix match. Those citations are acknowledged above; no test merger, rename or deletion is proposed.
- **Helper and duplicate check:** searched `tests/helpers/` for `parseBody(`, raw-parser function declarations and `new BodyParser`; no canonical raw-body-parser driver was found. `rg -n 'b0516-final-par-for|b0514-fn-query|function raw\(source' quality/` returned no matches before filing. The two counted sites were re-read with line numbers immediately before filing.
- **History intent:** `git log` and `git show --stat fe910ec5` show both files landed with `fix: resolve bug 0516`. The bug record requires distinct raw-layout and inference witnesses, which this report leaves intact; it does not require duplicated harness implementations.
- **Scope:** this judges existing test setup only. It makes no coverage, suite-composition, runtime-risk, or production-code claim.

## Triage
verdict: confirmed — Both cited eight-line raw helpers reproduce exactly, differing only in assertion messages and their file-local path constants; they duplicate live lexer/parser setup and clean-diagnostic checks, with no canonical raw-body helper, applicable D7 carve-out, prescribed resolved-helper shape, or existing finding covering these sites. (triage: claude-opus-5-5)
