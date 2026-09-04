import { describe, expect, it } from "vitest";
import { parseDoc, errors, hasCode } from "./helpers/e2e-s1";

// Bug 0420 — bug 0411's fix taught the doc-comment line scan to skip
// `@`...`` template interiors, but did so at line granularity across the
// WHOLE backtick span, over-reaching into `${…}` interpolation interiors.
//
// The 0411 mechanism (src/parser/theta-document.ts:1073–1092): a single walk
// over `lex.tokens` pairs backtick puncts into `templateLineSpans` (open,
// close), and `isTemplateLine` (:1086–1092) reports a body line excluded iff
// its column-1 position lies STRICTLY inside a span. Excluded lines form no
// doc-comment run (`matchDocLine` returns null, :1841–1842) and are skipped by
// the anchor forward scan (:1878).
//
// lexical.md:24 has two normative sentences. Sentence 1: comments inside the
// *text* of a query template are rendered prompt, not comments (0411's fixed
// axis). Sentence 2: "Comments inside a `${...}` interpolation behave exactly
// as in any other expression position." A column-1 `///` span excludes an
// interpolation interior too, so a `///` line one `${` deeper than prose is
// swallowed as a comment and vanishes — where the byte-identical line in any
// other expression position draws `theta/parse/doc-comment-misplaced`
// (grammar.md:204: `///` above `let`/expression/control-flow productions).
// The overreach violates sentence 2; the correct predicate is "column-1 inside
// template PROSE", i.e. inside a span AND NOT inside a `${…}` sub-span.
//
// Arms (encoding §Expected behaviour, not current behaviour):
//   P1    — RED at fork: an interpolation-interior column-1 `///` above a
//           non-anchor expression continuation loads clean (errors []); must
//           draw `doc-comment-misplaced` after the fix, exactly as P2 does.
//   P2    — GREEN both: the byte-identical `///` line in a multi-line
//           parenthesised expression already draws `doc-comment-misplaced`;
//           the lexical.md:24 sentence-2 expression-position baseline P1 must
//           match.
//   P1b   — GREEN both: P1 minus the `///` line loads clean; the multi-line
//           interpolation shape is legal/reachable, so the divergence is
//           `///`-specific, not shape-specific.
//   PC    — GREEN both: a template PROSE `///` line that merely CONTAINS
//           `${…}` later on the same line stays clean (prose governs column 1,
//           lexical.md:24 sentence 1); guards the refinement against
//           re-refusing prose (§Fix constraint c).
//   PROSE — GREEN both: a `///` prose line inside a template with NO
//           interpolation loads clean (0411's fixed axis, sentence 1); pins
//           that the refinement keeps prose rendering intact.
//   NEST   — RED at fork, GREEN after fix: a column-1 `///` line sits inside a `${…}`
//           interpolation whose interior contains a NESTED brace pair (a
//           record literal); the sub-span walk depth-counts braces so the
//           sub-span closes at the interpolation's MATCHING `}`, not the
//           record's inner `}` — pins the nested-brace counting branch, which
//           P1's depth-1 interpolation cannot exercise.

const DOC_MISPLACED = "theta/parse/doc-comment-misplaced";

// P1 — the divergence. A column-1 `///` line sits inside a MULTI-LINE `${…}`
// interpolation, above the `1 + 2` expression continuation (a non-anchor
// production). lexical.md:24 sentence 2 puts this in expression position;
// grammar.md:204 makes it `doc-comment-misplaced`. At the fork the line is
// excluded by `isTemplateLine`, forms no run, and is lexed away — clean load.
const P1 = `---
mode: prompt
---
let q = @\`before \${
/// weird
1 + 2
} after\`
q
`;

// P2 — the "any other expression position" baseline. Byte-identical `///`
// line, one `${` shallower: inside a multi-line PARENTHESISED expression
// instead of an interpolation. Draws `doc-comment-misplaced` at fork and
// after fix — the behaviour P1 must match (lexical.md:24 sentence 2).
const P2 = `---
mode: prompt
---
let x = (1 +
/// weird
2)
let q = @\`v \${x}\`
q
`;

// P1b — P1 with the `///` line removed. Proves the multi-line interpolation
// shape is itself legal and reachable; the divergence is the `///` line, not
// the shape. Clean at fork and after fix.
const P1b = `---
mode: prompt
---
let q = @\`before \${
1 + 2
} after\`
q
`;

// PC — §Fix constraint (c). A template PROSE `///` line whose text merely
// CONTAINS `${…}` later on the same line: column 1 is prose, so lexical.md:24
// sentence 1 governs — rendered prompt, not a comment. Clean at fork and after
// fix; guards against a refinement that re-refuses prose.
const PC = `---
mode: prompt
---
let q = @\`
/// prose \${1}
after\`
q
`;

// PROSE — a `///` prose line inside a template with NO interpolation.
// lexical.md:24 sentence 1: rendered prompt text, not a comment. Clean at fork
// and after fix; pins that the interpolation refinement leaves prose intact.
const PROSE = `---
mode: prompt
---
let q = @\`
/// prose line
after\`
q
`;

// NEST — a nested brace pair (a record literal) inside the interpolation,
// then a column-1 `///` line BETWEEN the record's `}` and the interpolation's
// real `}`. The sub-span walk must depth-count braces so the sub-span closes
// at the MATCHING `}`, not the record's inner `}` — otherwise the `///` line
// would be (wrongly) read as already outside the interpolation and excluded
// as template prose. The line is still expression position (lexical.md:24
// sentence 2) above the interpolation's non-anchor closing `}` (grammar.md:204).
const NEST = `---
mode: prompt
---
let q = @\`v \${ { a: 1 }
/// weird
}\`
q
`;

// ===========================================================================
// P1 — RED at fork. The interpolation-interior `///` line is in expression
// position (lexical.md:24 sentence 2); a `///` above the `1 + 2` non-anchor
// continuation is `doc-comment-misplaced` (grammar.md:204). At the fork the
// 0411 line-granular exclusion swallows it and the theta loads clean; the fix
// must make P1 draw exactly what P2 draws.
// ===========================================================================
describe("bug 0420 P1 — a `///` inside a multi-line `${…}` interpolation refuses the load", () => {
  it("draws doc-comment-misplaced, matching the parenthesised-expression baseline", () => {
    const doc = parseDoc(P1, "b0420-p1.theta");
    expect(
      hasCode(doc.diagnostics, DOC_MISPLACED),
      "a column-1 `///` inside a `${…}` interpolation is in expression position " +
        "(lexical.md:24 sentence 2), so a `///` above the `1 + 2` non-anchor " +
        "continuation must draw theta/parse/doc-comment-misplaced (grammar.md:204) — " +
        "it must not be excluded as template prose and silently vanish",
    ).toBe(true);
  });
});

// ===========================================================================
// P2 — GREEN both. The lexical.md:24 sentence-2 baseline: the byte-identical
// `///` line inside a multi-line parenthesised expression. Draws
// doc-comment-misplaced at fork and after fix; this is the behaviour P1 must
// reach.
// ===========================================================================
describe("bug 0420 P2 — the expression-position baseline draws doc-comment-misplaced", () => {
  it("a `///` inside a multi-line parenthesised expression refuses the load", () => {
    const doc = parseDoc(P2, "b0420-p2.theta");
    expect(
      hasCode(doc.diagnostics, DOC_MISPLACED),
      "a column-1 `///` above a mid-expression continuation is doc-comment-misplaced " +
        "(grammar.md:204); this is the expression-position behaviour lexical.md:24 " +
        "sentence 2 requires the interpolation interior (P1) to match",
    ).toBe(true);
  });
});

// ===========================================================================
// P1b — GREEN both. P1 with the `///` line removed. The multi-line
// interpolation shape is legal and reachable, so the P1 divergence is
// `///`-specific.
// ===========================================================================
describe("bug 0420 P1b — the multi-line interpolation shape itself is legal", () => {
  it("loads clean with the `///` line removed", () => {
    const doc = parseDoc(P1b, "b0420-p1b.theta");
    expect(
      errors(doc.diagnostics).map((d) => d.code),
      "a multi-line `${…}` interpolation with no `///` line is a legal, reachable " +
        "shape (lexical.md:24 sentence 2 governs its interior as expression position); " +
        "it must load with zero error-severity diagnostics",
    ).toEqual([]);
  });
});

// ===========================================================================
// PC — GREEN both (§Fix constraint c). A template PROSE `///` line that merely
// contains `${…}` later on the same line: column 1 is prose. The interpolation
// refinement must not re-refuse it.
// ===========================================================================
describe("bug 0420 PC — a prose `///` line merely containing `${…}` stays clean", () => {
  it("loads clean; prose governs column 1", () => {
    const doc = parseDoc(PC, "b0420-pc.theta");
    expect(
      errors(doc.diagnostics).map((d) => d.code),
      "column 1 is inside template *text*, so lexical.md:24 sentence 1 governs — " +
        "the line is rendered prompt, not a comment — even though `${…}` appears " +
        "later on the line; it must load with zero error-severity diagnostics",
    ).toEqual([]);
  });
});

// ===========================================================================
// PROSE — GREEN both. A `///` prose line inside a template with NO
// interpolation. 0411's fixed axis; the interpolation refinement must keep it
// intact.
// ===========================================================================
describe("bug 0420 PROSE — a `///` prose line inside a template loads clean", () => {
  it("renders as prompt text and draws no doc-comment-misplaced", () => {
    const doc = parseDoc(PROSE, "b0420-prose.theta");
    expect(
      hasCode(doc.diagnostics, DOC_MISPLACED),
      "a `///`-led prose line inside template *text* is rendered prompt " +
        "(lexical.md:24 sentence 1), not a doc comment; it must not draw " +
        "theta/parse/doc-comment-misplaced",
    ).toBe(false);
    expect(
      errors(doc.diagnostics).map((d) => d.code),
      "the template prose is rendered, not extracted, so the theta loads with " +
        "zero error-severity diagnostics",
    ).toEqual([]);
  });
});

// ===========================================================================
// NEST — RED at fork, GREEN after fix. The interpolation contains a nested brace pair (a record
// literal); the sub-span walk must depth-count braces so the sub-span closes
// at the interpolation's MATCHING `}`, not the record's inner `}`.
// ===========================================================================
describe("bug 0420 NEST — a `///` line inside an interpolation with a nested brace pair refuses the load", () => {
  it("depth-counts the record literal's braces and draws doc-comment-misplaced", () => {
    const doc = parseDoc(NEST, "b0420-nest.theta");
    expect(
      hasCode(doc.diagnostics, DOC_MISPLACED),
      "the `///` line sits inside the interpolation sub-span — the inner record " +
        "braces `{ a: 1 }` are depth-counted so the sub-span does NOT close at the " +
        "record's `}`; the line is expression position (lexical.md:24 sentence 2) " +
        "above the interpolation's non-anchor closing `}` (grammar.md:204), so it " +
        "must draw the misplaced diagnostic, not be swallowed as prose",
    ).toBe(true);
  });
});
