---
id: PTQ-0943
title: "captures the six pattern forms" test body verifies only five of the six PatternNode kinds, never touching array patterns
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/whole-program-parser.test.ts:459-488
  - src/parser/theta-document.ts:348-381
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# "captures the six pattern forms" test body verifies only five of the six PatternNode kinds, never touching array patterns

## Observation
`src/parser/theta-document.ts:348-381` defines `PatternNode` with a doc
comment stating it is "one of the six theta 1.0 `match` pattern forms" and
enumerates exactly six kinds: `wildcard`, `identifier`, `literal`,
`constructor`, `object`, `array`. The test titled "captures the six pattern
forms" in `tests/whole-program-parser.test.ts:459-488` asserts on only five
of those kinds — `constructor`, `identifier`, `object`, `literal`, and
`wildcard` — and never constructs, parses, or asserts anything about an
`array` pattern anywhere in the test or the file.

## Evidence

`src/parser/theta-document.ts:348-381` — the six-kind union the title's
number references:
```ts
export type PatternNode =
  | { readonly kind: "wildcard" }
  | { readonly kind: "identifier"; readonly name: string }
  | {
      readonly kind: "literal";
      readonly value: string | number | boolean | null;
      readonly numericType?: "integer" | "number";
    }
  | { readonly kind: "constructor"; readonly ctor: "Ok" | "Err"; readonly inner: PatternNode }
  | {
      readonly kind: "object";
      readonly typeName: string | null;
      readonly fields: readonly { readonly name: string; readonly pattern: PatternNode }[];
      readonly range: SourceRange;
    }
  | { readonly kind: "array"; readonly elements: readonly PatternNode[] };
```

`tests/whole-program-parser.test.ts:459-488` — the full test body:
```ts
  it("captures the six pattern forms — constructor over an object pattern, wildcard-in-Err, identifier binding", () => {
    const doc = parse(src);
    const let_ = doc.body.statements.find((s): s is LetStmt => s.kind === "let");
    const m = let_?.init as MatchExpr;
    // Arm 0: Ok(t) — constructor over an identifier binding.
    expect(m.arms[0]?.pattern.kind).toBe("constructor");
    const arm0 = m.arms[0]?.pattern;
    if (arm0?.kind === "constructor") {
      expect(arm0.ctor).toBe("Ok");
      expect(arm0.inner.kind).toBe("identifier");
    }
    // Arm 1: Err(QueryError { … }) — constructor over an object pattern.
    const arm1 = m.arms[1]?.pattern;
    if (arm1?.kind === "constructor") {
      expect(arm1.ctor).toBe("Err");
      expect(arm1.inner.kind).toBe("object");
      if (arm1.inner.kind === "object") {
        expect(arm1.inner.fields.map((f) => f.name)).toEqual(["kind", "cause"]);
        expect(arm1.inner.fields[0]?.pattern).toEqual({
          kind: "literal",
          value: "validation",
        });
      }
    }
    // Arm 2: Err(_) — constructor over a wildcard.
    const arm2 = m.arms[2]?.pattern;
    if (arm2?.kind === "constructor") {
      expect(arm2.inner.kind).toBe("wildcard");
    }
  });
```
The distinct `PatternNode.kind` values this body asserts on:
`constructor` (arm0/arm1/arm2's outer pattern), `identifier` (arm0's inner),
`object` (arm1's inner), `literal` (arm1's inner field's pattern), and
`wildcard` (arm2's inner) — five kinds. `array` is absent.

Exact search: `grep -n "kind: \"array\"\|pattern.kind === \"array\"\|array pattern" tests/whole-program-parser.test.ts` returns 0 hits — no test in this file constructs or asserts an array pattern anywhere, not only in this one `it`.

## Why this is a problem
The title "captures the six pattern forms" is a specific, countable claim
that matches the exact vocabulary of the type it is testing ("one of the six
theta 1.0 `match` pattern forms", `theta-document.ts:349-350`). A reader
encountering this test name and its parenthetical ("constructor over an
object pattern, wildcard-in-Err, identifier binding") would read it as an
enumeration of the six forms the test demonstrates, cross-check against the
source's own "six" language, and conclude every pattern-node kind is
witnessed by this one assertion block. The body actually witnesses five of
the six kinds named in the type it mirrors, and the sixth (`array`) is
untouched by name in the title's own list of three examples as well as in
the assertions — the mismatch is between the counted claim ("six") and the
demonstrated count (five kinds), not a subjective read.

## Suggested direction (non-binding, optional)
None — noting the count mismatch is the observation; the routing note above
records it for the fix stage.

## False-positive check
- Gate-pin check: this file does not match `*gate*.test.ts` or any named
  gate-kin pattern; the assertion under scrutiny is not a pinned
  count/inventory gate mechanism, it is a per-arm kind assertion.
- Recording-double check: no recording double is involved; the assertions
  read the real parsed `MatchExpr`/`PatternNode` AST directly.
- docs/bugs/ signature search: `grep -rn "captures the six pattern forms\|whole-program-parser.test.ts:459" docs/bugs/` returns 0 hits; no open bug doc cites this test's red/disabled status or this line range as a pinned witness.
- coverage-matrix/bug-doc citation search: `grep -rn "whole-program-parser" docs/reference/coverage-matrix.md` returns 0 hits; `grep -rn "whole-program-parser" docs/bugs/` returns hits only at other line ranges (0058:155,660,712,890; 0062:480; 0360:53,172,183,186), none citing lines 459-488 or this test's name — this finding does not touch any pinned citation and proposes no merge/rename/delete.
- Coverage-drift check: the claim is about the title's own numeric claim vs.
  the body's demonstrated count, not "array patterns are untested" as a
  standalone coverage gap — the routing note below records the latter
  separately, as a note rather than a filing.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/whole-program-parser.test.ts:459-488 and src/parser/theta-document.ts:348-381; `grep -n '"array"' tests/whole-program-parser.test.ts` → 0 hits (widened beyond the candidate's pattern, still 0), the spec table docs/spec_topics/expressions.md:163-172 enumerates exactly six forms (Wildcard, Identifier, Literal, Constructor, Object/schema, Array) and the body asserts only five kinds (constructor, identifier, object, literal, wildcard) across a three-arm fixture with no array arm; the title was wrong from birth — at its landing commit 04dbb013 (2026-07-03) PatternNode (then loom-document.ts:176-186) already carried all six kinds including `array` while the test body asserted the same five it does today, so "six" was never witnessed; D7 misleading-name class (a countable title claim the body cannot witness, same class as PTQ-0566/0745/0917 on different tests), sole filed site under tests/ (the src/ location is the supporting definition, sites: 1), not a *gate* file, no recording double, docs/bugs (whole-program-parser hits only at :37, :254-287, :355-395) and coverage-matrix (0 hits) searches reproduce, no rename/merge of a pinned test proposed; no existing PTQ cites this test or file (triage: claude-fable-5-1)
