---
id: PTQ-0987
title: test named for `?` composing with a `.field` access chain verifies no access chain at all
lens: D7
status: open
verdict: confirmed
locations:
  - tests/whole-program-parser.test.ts:507-514
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# test named for `?` composing with a `.field` access chain verifies no access chain at all

## Observation
The `describe` block at tests/whole-program-parser.test.ts:507 is titled
"postfix `?` still terminates and composes with access", and its sole `it` at
line 508 is titled "wraps a `.field` chain result under `?` correctly
(foo()?.bar order)". The source string parsed at line 509 is
`"let s = sentiment(text)?"` — a bare call followed by `?`, with no `.field`
or `.bar` member access anywhere in the input. The body (lines 510-513)
asserts only that the `let` init is a `TryExpr` whose operand's `kind` is
`"call"`.

## Evidence
tests/whole-program-parser.test.ts:507-514
```ts
describe("core-exec: postfix `?` still terminates and composes with access", () => {
  it("wraps a `.field` chain result under `?` correctly (foo()?.bar order)", () => {
    const doc = parse(["let s = sentiment(text)?"].join("\n"));
    const let_ = doc.body.statements.find((s): s is LetStmt => s.kind === "let");
    const init = let_?.init as TryExpr | undefined;
    expect(init?.kind).toBe("try");
    expect(init?.operand.kind).toBe("call");
  });
});
```
No `.field`, `.bar`, `member`, or `index` node appears in the parsed source
string or in either of the two `expect` calls. The two assertions only confirm
that a bare call under postfix `?` parses as `{ kind: "try", operand: { kind:
"call" } }` — the same shape already exercised by the QRY-19 "?"-propagate
negative-pin test earlier in the file (tests/whole-program-parser.test.ts:349
region, `@`Summarise.`?` parses as an `ExprStmt` wrapping a `try`).

## Why this is a problem
A reader following the describe title ("composes with access") and the test
name ("wraps a `.field` chain result… foo()?.bar order") expects the test to
parse an input containing a member/index access composed with `?` (something
shaped like `foo()?.bar`) and assert the resulting composition order. The
actual parsed input, `sentiment(text)?`, contains no access node, and neither
assertion inspects a `member` or `index` kind anywhere in the AST. A reader
who trusts the name to conclude that postfix-`?`-then-`.field` composition is
verified here would be mistaken — the test verifies only that `?` wraps a bare
call in a `TryExpr`, a narrower and different claim than the name states.

## Suggested direction (non-binding, optional)
The name and describe title could be brought in line with what the body
actually checks (`?` terminating over a bare call becomes a `TryExpr` wrapping
that call), or the parsed source could include an access-chain-under-`?` form
if that composition is the fact meant to be witnessed by this test.

## False-positive check
- Gate-pin check: file is not `*gate*.test.ts` or kin; not applicable.
- Recording-double check: no double/fake involved; not applicable.
- docs/bugs/ signature search: `grep -rln "foo()?.bar\|wraps a \`.field\` chain\|postfix \`?\` still terminates" docs/` → no hits; not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "wraps a" docs/reference/coverage-matrix.md` → no hits; this test is not pinned by external citation.
- This finding is confined to the name-vs-body mismatch; no claim is made that composition of `?` with a following `.field`/`.bar` access is untested elsewhere in the suite (that would be a coverage claim, out of scope) — the absence is cited only to demonstrate the misread the current name invites.

## Triage
verdict: confirmed — independently re-verified: the excerpt reproduces verbatim at tests/whole-program-parser.test.ts:507-515; the describe title ("composes with access") and it-title ("wraps a `.field` chain result under `?` … foo()?.bar order") name a member-access-under-`?` composition while the sole parsed input `let s = sentiment(text)?` contains no `.` access and the two assertions check only `{kind:"try", operand.kind:"call"}` (`grep -n '"member"\|"index"'` in the file hits only the separate accessor tests at :377-401, never lines 507-515); wrong from birth — landing commit 04dbb013 (2026-07-03) carries the identical title and body and no later commit touched the range; D7 misleading-name class (title asserts a claim the body cannot witness, same class as PTQ-0943 on a different test in this file, which is fixed and disjoint — pattern-form count vs `?`/access composition); not a *gate* file, no recording double, file green (40/40), docs/ signature search (0), coverage-matrix (0) and docs/bugs citations (:37, :254-287, :355-395 only) reproduce, no rename of a pinned test proposed; the aside citing the sibling `try` witness at ":349 region" is off — that witness is the `foo()?`/`bar()` statement-boundary test at :295-305 — but it is supporting context, not the root cause (triage: claude-fable-5-1)
