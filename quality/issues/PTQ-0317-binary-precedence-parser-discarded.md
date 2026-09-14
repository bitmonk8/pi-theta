---
id: PTQ-0317
title: ExprParser's 6-tier binary-operator precedence table is discarded by its only consumer, firstNonLiteral
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/literal-sublanguage.ts:93-108
  - src/parser/literal-sublanguage.ts:234-248
  - src/parser/literal-sublanguage.ts:308-324
  - src/parser/literal-sublanguage.ts:529-564
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: overbuilt          # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/parser/literal-sublanguage.ts#ExprParser.parseBinary # D8 only: the exemption key
wave: qw20260914060226
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-14
---

# ExprParser's 6-tier binary-operator precedence table is discarded by its only consumer, firstNonLiteral

## Observation
`ExprParser.parseBinary` (src/parser/literal-sublanguage.ts:308-324) climbs a 13-entry,
6-tier `BINARY_PRECEDENCE` table (:234-248: `||`=1, `&&`=2, `==`/`!=`=3, `<`/`<=`/`>`/`>=`=4,
`+`/`-`=5, `*`/`/`/`%`=6) to build correctly-grouped binary-expression sub-trees. The
`binary` and `ternary` variants of `ExprNode` (:93-108) carry no operand references at
all — only the shared `start`/`end` span every variant carries — so whatever grouping the
precedence climb computes is never attached to the node it returns. The sole consumer,
`firstNonLiteral` (:529-564), has no `case "binary"` or `case "ternary"` arm: both fall
through to `default`, which returns the whole node (its full consumed span) as "the
offending sub-expression" regardless of which operator(s) it contains or how they nest. A
file-wide grep for the two kind strings turns up only the type declaration and the two
construction sites — no reader anywhere in the file discriminates on them.

## Evidence
`src/parser/literal-sublanguage.ts:93-108` — the node shape; `binary`/`ternary` carry no
operand/branch fields:
```ts
type ExprNode = { readonly start: number; readonly end: number } & (
  | { readonly kind: "literal" } // string / number / boolean / null
  | { readonly kind: "neg"; readonly operand: ExprNode } // unary `-`
  | { readonly kind: "unary-other" } // any other unary (e.g. `!`)
  | { readonly kind: "ident" }
  | { readonly kind: "member"; readonly objectIsIdent: boolean } // `a.b`
  | { readonly kind: "call" }
  | { readonly kind: "index" }
  | { readonly kind: "binary" }
  | { readonly kind: "ternary" }
  ...
```

`src/parser/literal-sublanguage.ts:234-248` — the 6-tier table:
```ts
const BINARY_PRECEDENCE: Readonly<Record<string, number>> = Object.freeze({
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
});
```

`src/parser/literal-sublanguage.ts:308-324` — the precedence-climbing recursion; the
recursive call's result is never stored:
```ts
private parseBinary(minPrec: number): ExprNode {
  let left = this.parseUnary();
  for (;;) {
    const t = this.peek();
    if (t === undefined || t.kind !== "punct") {
      break;
    }
    const prec = BINARY_PRECEDENCE[t.text];
    if (prec === undefined || prec < minPrec) {
      break;
    }
    this.next();
    this.parseBinary(prec + 1);
    left = { kind: "binary", start: left.start, end: this.spanFrom(left.start) };
  }
  return left;
}
```

`src/parser/literal-sublanguage.ts:529-564` — the sole consumer; `binary`/`ternary` are
not named, both fall to `default`:
```ts
function firstNonLiteral(node: ExprNode, source: string): ExprNode | undefined {
  switch (node.kind) {
    case "literal":
      return undefined;
    case "neg":
      return isNumericLiteralOperand(node.operand, source) ? undefined : node;
    case "member":
      return node.objectIsIdent ? undefined : node;
    case "array":
      ...
    case "object":
      ...
    default:
      // ident, call, index, binary, ternary, template, query, unary-other,
      // unknown — all outside the literal sublanguage.
      return node;
  }
}
```

Job (overbuilt job statement): `checkLiteralSublanguage`'s input is one author-written
`params:` default RHS (or a Pi-tool bare-object-argument source) — a single expression,
typically well under a few hundred characters; its output is 0-or-1 `Diagnostic`. Map
importer counts: `checkLiteralSublanguage` 1 src / 6 test; `isBareObjectLiteral` 1/2;
`defaultLiteralStaticType` 1/3. All three read `ExprParser`'s output only through
`node.kind` (or, for arrays/objects, through the retained `elements`/`fieldValues`), never
through a binary/ternary sub-structure that the type does not carry.

Empirical check: I ported the tokeniser + `parsePrimary`/`parseUnary`/`parseBinary`/
`parseTernary` logic verbatim into a standalone Node script and ran it against 13
expressions (nested parens, mixed-operator chains, unary combinations) under three
tables — the file's own `BINARY_PRECEDENCE`, an all-tiers-equal table (every operator
weight 1), and a deliberately reversed-precedence table (`*` binds loosest, `||`
tightest). The reported top-level `kind` and the consumed span (`end` / `residualStart`)
were byte-identical across all three tables for every case (13/13 matches), because the
token cursor is shared across recursion levels: every recognised operator token in the
construct is consumed by the outermost `parseBinary(1)` call regardless of the specific
precedence values, so the precedence distinctions never surface in the only two things
either consumer reads (`kind`, span).

## Why this is a problem
The is-literal check needs exactly two facts from a binary/ternary construct: that it is
outside the four admitted shapes (primitive / `Enum.Variant` / array / object literal),
and the span to quote in the diagnostic. Fact one is already true the instant any
recognised operator token appears, independent of precedence; fact two, per the empirical
check above, does not depend on the specific precedence values either. The 6-tier table
and the `minPrec`-threaded recursion in `parseBinary` therefore compute a distinction (how
the operators group) that no code in this file — nor any code reachable through the
type, which has no field to carry that distinction on a `binary`/`ternary` node — ever
reads.

## Suggested direction (non-binding, optional)
Unproven hypothesis, not a design: a flat loop over the SET of recognised binary-operator
tokens (no per-operator tier) appears, per the check above, to produce identical `kind`/
span output for every consumer in this file. This has not been checked against every
possible caller outside `src/parser` that might slice source text using positions this
parser reports; that would need verifying before treating the simpler shape as safe.

## False-positive check
- Grepped `"binary"|"ternary"` across the whole file: only the type declaration (:101-102)
  and the two construction sites (:303, :321) match — no `case`/`if` anywhere inspects a
  stored operand/branch field, because the type carries none.
- Re-read `firstNonLiteral` (:529-564) in full: confirmed `binary`/`ternary` are not
  explicit `case`s; both fall to `default`, which returns the whole node without descent.
- Re-read the file's other two readers of parsed output: `isBareObjectLiteral` tests only
  `node.kind === "object"`; `defaultLiteralStaticType`'s `primitiveLiteralType` handles only
  `"literal"`/`"neg"` and answers `undefined` for every other kind including `binary`.
  Neither inspects binary/ternary substructure.
- Ran the empirical Node reproduction described above (13 cases, 3 precedence tables,
  13/13 identical `kind`+span results) rather than relying on inspection alone, given this
  lens's own prior rejections were for under-verified reimplementation-equivalence claims.
- Checked for a stated rationale (grepped "precedence" — 5 hits, all label comments, no
  bug-number or future-consumer cross-reference) — unlike the rest of this file and the
  rest of the shard, where a non-obvious shape almost always carries a bug-number or
  spec-clause citation; this shape carries none, so the "knob/guard with a stated
  rationale" not-finding precedent does not apply here.
- Checked the type-arm/spec-enumeration not-finding precedent: the module's own header
  states the literal sublanguage forbids "operators other than the unary `-` carve-out for
  numeric literals" as ONE undifferentiated class — the spec does not name six precedence
  tiers, so the table does not mirror a spec-named enumeration.
- Not a re-file of a D9 breakdown claim: this file's only flagged breakdown item is
  `tokeniseExpr` (115 LOC, band justify); `ExprParser` (238 LOC) and `parseBinary` (17 LOC)
  are a distinct locus from that citation.
- Not dead code (D2): `BINARY_PRECEDENCE` and `parseBinary` are reached on every literal
  RHS containing a binary operator, through `checkLiteralSublanguage`'s live call sites
  (1 src / 6 test importers per the map).

## Triage
verdict: questionable — accounting independently verified: all 4 excerpts match verbatim at their exact cited lines, importer counts (1 src/6 test, 1/2, 1/3) confirmed by re-grepping actual import statements, and re-running parseBinary (ported + transpiled, unmodified logic) under 3 differing precedence tables against 19 expressions gave byte-identical kind/span output every time, matching grammar.md's single undifferentiated "operators other than unary `-`" forbidden clause (no six-tier spec enumeration, no exemption, no rationale comment on the table); per the D8 protocol an accurate simplification accounting caps at questionable — the simpler shape is a human ruling, never confirmed (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-14): the simpler shape is a flat binary loop. In src/parser/literal-sublanguage.ts ExprParser.parseBinary parses a unary operand, then while the next token is any recognised binary operator consumes it and parses the next unary operand, producing one binary node spanning the first operand's start to the last operand's end - no precedence tiers, no minPrec threading; delete BINARY_PRECEDENCE and its comment; the ternary layer above and every other production stay as they are. Contract: kind and span output byte-identical for every input (triage's 19-expression check); all six test importers stay green unchanged - a differing test means the flattening is wrong, not the test. The spec (grammar.md: operators other than unary minus are forbidden in the literal sublanguage, undifferentiated) needs no change.
