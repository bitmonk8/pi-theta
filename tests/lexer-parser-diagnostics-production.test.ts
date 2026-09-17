import { describe, expect, it } from "vitest";
import { codesOf } from "./helpers/e2e-s1";

// V20d-T — failing tests for the paired `V20d` "unimplemented lexer/parser
// diagnostics" wiring.
//
// Convention: conventions.md (phase categories — production-wiring). Narrative
// spec references: lexical.md (§"String literals"), grammar.md
// (§"match arm body"), expressions.md (§"Operator precedence",
// §"Pattern grammar"), control-flow.md, bindings.md
// (§"Reassignment is a statement", §"Immutable contexts"). Closes no new spec
// REQ-ID.
//
// Bucket B (not implemented): these eight registry codes appear nowhere in
// `src/**` — two lexer checks (`unterminated-string`,
// `literal-newline-in-string`) and six parser checks (`comparison-chaining`,
// `statement-in-arm-body`, `match-guard-not-supported`,
// `rest-pattern-not-supported`, `mut-on-discard`, `assignment-as-expression`)
// — so malformed source is silently accepted. These tests drive the production
// lex/parse path through the real whole-file parser (`parseThetaDocument`, which
// internally runs `lexTheta`), asserting the malformed source is rejected with
// its registry code.
//
// Every test reds today for the intended reason: the eight lexer/parser checks
// are absent from `src/**`, so `parseThetaDocument` aggregates no diagnostic for
// the malformed body and each `toContain(<code>)` assertion reds on its own
// primary assertion — not on a compile error, a missing fixture, or a harness
// throw (`parseThetaDocument` aggregates diagnostics and does not throw).

// ===========================================================================
// theta/parse/unterminated-string — `cka-1` lexical (owned V1b), integration
// witness. EOF reached while scanning a string literal.
// ===========================================================================

describe("V20d-T — unterminated-string fires in production", () => {
  it("rejects a string literal with no closing quote (reds today — silently accepted)", () => {
    // theta/parse/unterminated-string — EOF inside an open string literal.
    const codes = codesOf('let x = "abc');
    expect(codes).toContain("theta/parse/unterminated-string");
  });
});

// ===========================================================================
// theta/parse/literal-newline-in-string — `cka-1` lexical (owned V1b),
// integration witness. A literal newline inside a single-line string literal.
// ===========================================================================

describe("V20d-T — literal-newline-in-string fires in production", () => {
  it("rejects a literal newline inside a regular string literal (reds today)", () => {
    // theta/parse/literal-newline-in-string — a raw newline inside a `"..."`.
    const codes = codesOf('let x = "ab\ncd"');
    expect(codes).toContain("theta/parse/literal-newline-in-string");
  });
});

// ===========================================================================
// theta/parse/comparison-chaining — (owned V3a), integration witness.
// Comparison operators are non-associative and do not chain.
// ===========================================================================

describe("V20d-T — comparison-chaining fires in production", () => {
  it("rejects a chained comparison `a < b < c` (reds today — silently accepted)", () => {
    // theta/parse/comparison-chaining — `1 < 2 < 3` is non-associative.
    const codes = codesOf("let x = 1 < 2 < 3");
    expect(codes).toContain("theta/parse/comparison-chaining");
  });
});

// ===========================================================================
// theta/parse/statement-in-arm-body — (owned V4a), integration witness.
// A `match` arm body must be an expression, not a bare statement.
// ===========================================================================

describe("V20d-T — statement-in-arm-body fires in production", () => {
  it("rejects a bare `if` statement in a `match` arm body (reds today)", () => {
    // theta/parse/statement-in-arm-body — a bare `if` (no wrapping `{ ... }`)
    // in arm-body position (grammar.md §"match arm body").
    const codes = codesOf(
      [
        "let y = 1",
        "let z = match y {",
        "  0 => if true { 1 } else { 2 },",
        "  _ => 3,",
        "}",
      ].join("\n"),
    );
    expect(codes).toContain("theta/parse/statement-in-arm-body");
  });
});

// ===========================================================================
// theta/parse/match-guard-not-supported — (owned V4a), integration witness.
// Guarded `match` arms are not in theta 1.0.
// ===========================================================================

describe("V20d-T — match-guard-not-supported fires in production", () => {
  it("rejects a guarded `match` arm `n if cond => …` (reds today)", () => {
    // theta/parse/match-guard-not-supported — `Pattern if cond => ...`.
    const codes = codesOf(
      [
        "let y = 1",
        "let z = match y {",
        "  n if n > 3 => 1,",
        "  _ => 2,",
        "}",
      ].join("\n"),
    );
    expect(codes).toContain("theta/parse/match-guard-not-supported");
  });
});

// ===========================================================================
// theta/parse/rest-pattern-not-supported — (owned V3b), integration witness.
// Rest patterns (`[first, ...rest]`, `{ kind, ...other }`) are not in theta 1.0.
// ===========================================================================

describe("V20d-T — rest-pattern-not-supported fires in production", () => {
  it("rejects a rest pattern `[first, ...rest]` in a destructure (reds today)", () => {
    // theta/parse/rest-pattern-not-supported — an array rest pattern.
    const codes = codesOf(
      [
        "let y = [1, 2, 3]",
        "let z = match y {",
        "  [first, ...rest] => first,",
        "  _ => 0,",
        "}",
      ].join("\n"),
    );
    expect(codes).toContain("theta/parse/rest-pattern-not-supported");
  });
});

// ===========================================================================
// theta/parse/mut-on-discard — (owned V3b), integration witness.
// `let mut _ = ...` — `_` cannot be reassigned, so `mut` is meaningless on it.
// ===========================================================================

describe("V20d-T — mut-on-discard fires in production", () => {
  it("rejects `let mut _ = ...` (reds today — silently accepted)", () => {
    // theta/parse/mut-on-discard — `mut` on the discard binding `_`.
    const codes = codesOf("let mut _ = 1");
    expect(codes).toContain("theta/parse/mut-on-discard");
  });
});

// ===========================================================================
// theta/parse/assignment-as-expression — (owned V3b), integration witness.
// Assignment is statement-only; it may not be used in expression position.
// ===========================================================================

describe("V20d-T — assignment-as-expression fires in production", () => {
  it("rejects an assignment used as an expression `if (x = 1) { … }` (reds today)", () => {
    // theta/parse/assignment-as-expression — assignment in expression position
    // (bindings.md §"Reassignment is a statement").
    const codes = codesOf(
      ["let mut x = 0", "if (x = 1) {", "  let a = 1", "}"].join("\n"),
    );
    expect(codes).toContain("theta/parse/assignment-as-expression");
  });
});
