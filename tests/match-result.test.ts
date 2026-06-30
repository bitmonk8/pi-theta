import { describe, expect, it } from "vitest";
import {
  checkMatchArmTypes,
  checkQuestionOperand,
  checkQuestionScope,
  type EnclosingReturnScope,
  type QuestionOperandType,
} from "../src/parser/match-result";
import {
  evaluateMatch,
  MatchError,
  MATCH_ERROR_CODE,
  type MatchArm,
} from "../src/runtime/match-result";
import type { CompatType, PrimitiveName, TypeEnv } from "../src/parser/type-compat";
import type { LoomValue } from "../src/runtime/value";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// V4a-T — failing tests for the paired `V4a` "`match`, `?`, and `Result`"
// implementation.
//
// Spec: errors-and-results.md, errors-and-results/error-model.md (closure into
// expressions.md §`?` operator / §`match` expression and type-system.md
// §"Type compatibility").
//
//   - ERR-18 (expressions.md ERR-18 / §`?` operator) — a `?` whose operand is
//     not statically `Result<_, QueryError>` fires
//     `loom/parse/question-on-non-result` (type phase), asserted against the
//     `checkQuestionOperand` seam (src/parser/match-result.ts).
//   - expressions.md §`?` operator — a `?` outside a `Result`-compatible scope
//     fires `loom/parse/question-outside-result-fn` (type phase), asserted
//     against the `checkQuestionScope` seam.
//   - expressions.md §`match` expression (Arm syntax) — a `match` whose arm
//     bodies share no common upper bound under type-system.md §"Type
//     compatibility" fires `loom/parse/match-arm-type-mismatch` (type phase),
//     and a well-typed `match` resolves to the LUB of its arms, asserted
//     against the `checkMatchArmTypes` seam.
//   - error-model.md §"Runtime panics" — a value matching none of the six
//     pattern forms raises the `loom/runtime/match-error` panic (`MatchError`),
//     while a value matching one of the six forms binds and evaluates the
//     selected arm, asserted against the `evaluateMatch` seam
//     (src/runtime/match-result.ts). V4a-T asserts only this raise-versus-bind
//     exhaustion behaviour; the panic's `?`/`match` bypass and its registered
//     message template are deferred to V4b-T.
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-parse.md) per the *Diagnostic message anchors*
// rule.
//
// These tests red because the V4a `match`/`?`/`Result` checks and the runtime
// `match` dispatcher are absent: every parse/type seam is an inert stub
// returning no diagnostic / no LUB, and `evaluateMatch` matches no arm and
// raises no panic. Each obligation test reds on its own primary assertion (an
// absent expected diagnostic, an absent LUB, an unthrown `MatchError`, or a
// sentinel return value), not on a compile error, a missing fixture, or a
// harness throw.

/** A throwaway 1:1–1:2 span for the seam calls. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

/** A located site at the throwaway span. */
function site(): { file: string; range: SourceRange } {
  return { file: "test.loom", range: span() };
}

const PRIM = (name: PrimitiveName): CompatType => ({ kind: "prim", name });

// --- expressions.md ERR-18 — `?` operand-type precondition -----------------

describe("V4a-T — `?` operand-type precondition (ERR-18)", () => {
  it("ERR-18: `?` on a non-`Result` operand fires loom/parse/question-on-non-result (type phase)", () => {
    // `let x = 5?` — the operand `5` is `integer`, not `Result<T, QueryError>`.
    const operand: QuestionOperandType = { kind: "non-result", display: "integer" };

    const diag = checkQuestionOperand(operand, site());

    expect(
      diag,
      "ERR-18: a non-Result `?` operand fires loom/parse/question-on-non-result",
    ).toBeDefined();
    expect(diag?.code).toBe("loom/parse/question-on-non-result");
    // Phase is `type` (a lex/parse/type batch pre-evaluation failure); severity
    // is error.
    expect(diag?.severity).toBe("error");
    // Message from diagnostics/code-registry-parse.md (`<type>` = `integer`).
    expect(diag?.message).toBe("'?' requires a Result operand; got integer");
  });

  it("ERR-18: `?` on a `Result<T, QueryError>` operand fires no diagnostic", () => {
    const operand: QuestionOperandType = { kind: "result", errIsQueryError: true };
    expect(checkQuestionOperand(operand, site())).toBeUndefined();
  });
});

// --- expressions.md §`?` operator — enclosing-scope precondition -----------

describe("V4a-T — `?` enclosing-scope precondition (question-outside-result-fn)", () => {
  it("`?` in a scope whose return type is not Result-compatible fires loom/parse/question-outside-result-fn (type phase)", () => {
    // A scope with an explicit return annotation that does not admit
    // `Result<U, QueryError>` for any `U`.
    const scope: EnclosingReturnScope = { kind: "annotated", resultCompatible: false };

    const diag = checkQuestionScope(scope, site());

    expect(
      diag,
      "`?` outside a Result-compatible scope fires loom/parse/question-outside-result-fn",
    ).toBeDefined();
    expect(diag?.code).toBe("loom/parse/question-outside-result-fn");
    expect(diag?.severity).toBe("error");
    // Message from diagnostics/code-registry-parse.md.
    expect(diag?.message).toBe(
      "'?' used in a scope whose return type is not Result<T, QueryError>",
    );
  });

  it("`?` in an inferred scope (no explicit return annotation) fires no diagnostic", () => {
    const scope: EnclosingReturnScope = { kind: "inferred" };
    expect(checkQuestionScope(scope, site())).toBeUndefined();
  });

  it("`?` in a Result-compatible annotated scope fires no diagnostic", () => {
    const scope: EnclosingReturnScope = { kind: "annotated", resultCompatible: true };
    expect(checkQuestionScope(scope, site())).toBeUndefined();
  });
});

// --- expressions.md §`match` expression — arm common-type ------------------

describe("V4a-T — `match` arm common-type (match-arm-type-mismatch)", () => {
  const env: TypeEnv = {};

  it("loom/parse/match-arm-type-mismatch: arm bodies sharing no common upper bound fire the diagnostic (type phase)", () => {
    // `string` and `integer` share no common upper bound and no sink narrows
    // them.
    const armTypes: readonly CompatType[] = [PRIM("string"), PRIM("integer")];

    const { diagnostics } = checkMatchArmTypes({
      armTypes,
      sink: undefined,
      env,
      site: site(),
    });

    const codes = diagnostics.map((d) => d.code);
    expect(
      codes,
      "loom/parse/match-arm-type-mismatch: arms with no common upper bound fire the mismatch diagnostic",
    ).toContain("loom/parse/match-arm-type-mismatch");
    const mismatch = diagnostics.find(
      (d) => d.code === "loom/parse/match-arm-type-mismatch",
    );
    expect(mismatch?.severity).toBe("error");
    // Message from diagnostics/code-registry-parse.md.
    expect(mismatch?.message).toBe(
      "match arm body type does not match the common type of the other arms",
    );
  });

  it("loom/parse/match-arm-type-mismatch: a well-typed `match` resolves to the LUB of its arms (integer ⊔ number = number)", () => {
    // `integer` widens to `number` (TYPE-2); the well-typed `match` resolves to
    // the least upper bound `number`.
    const armTypes: readonly CompatType[] = [PRIM("integer"), PRIM("number")];

    const { diagnostics, lub } = checkMatchArmTypes({
      armTypes,
      sink: undefined,
      env,
      site: site(),
    });

    expect(
      diagnostics,
      "a well-typed `match` produces no match-arm-type-mismatch diagnostic",
    ).toEqual([]);
    expect(
      lub,
      "loom/parse/match-arm-type-mismatch: a well-typed `match` resolves to the LUB of its arms",
    ).toEqual({ kind: "prim", name: "number" });
  });

  it("loom/parse/match-arm-type-mismatch: a single-type `match` resolves to that type", () => {
    const { diagnostics, lub } = checkMatchArmTypes({
      armTypes: [PRIM("string"), PRIM("string")],
      sink: undefined,
      env,
      site: site(),
    });

    expect(diagnostics).toEqual([]);
    expect(lub).toEqual({ kind: "prim", name: "string" });
  });
});

// --- error-model.md §"Runtime panics" — match-error raise vs bind ----------

describe("V4a-T — runtime `match` raise-versus-bind exhaustion (loom/runtime/match-error)", () => {
  it("loom/runtime/match-error: a value matching none of the arms raises the MatchError panic", () => {
    // Scrutinee `5` matches neither a string-literal arm nor an `Ok(_)` arm.
    const arms: readonly MatchArm[] = [
      { pattern: { kind: "literal", value: "x" }, body: () => "string-arm" },
      {
        pattern: { kind: "constructor", ctor: "Ok", inner: { kind: "wildcard" } },
        body: () => "ok-arm",
      },
    ];

    expect(
      () => evaluateMatch(5, arms),
      "loom/runtime/match-error: a scrutinee matching no arm raises MatchError",
    ).toThrow(MatchError);
  });

  it("loom/runtime/match-error: the raised panic carries the loom/runtime/match-error code", () => {
    const arms: readonly MatchArm[] = [
      { pattern: { kind: "literal", value: "x" }, body: () => "string-arm" },
    ];

    let raised: unknown;
    try {
      evaluateMatch(5, arms);
    } catch (e: unknown) {
      raised = e;
    }
    expect(
      raised instanceof MatchError,
      "loom/runtime/match-error: the non-exhaustive-match panic is a MatchError",
    ).toBe(true);
    expect((raised as MatchError).code).toBe(MATCH_ERROR_CODE);
    expect(MATCH_ERROR_CODE).toBe("loom/runtime/match-error");
  });

  it("loom/runtime/match-error: a wildcard pattern matches and evaluates its arm (no panic)", () => {
    const arms: readonly MatchArm[] = [
      { pattern: { kind: "wildcard" }, body: () => "wildcard-arm" },
    ];
    expect(evaluateMatch(42, arms)).toBe("wildcard-arm");
  });

  it("loom/runtime/match-error: an identifier pattern matches and binds the scrutinee", () => {
    const arms: readonly MatchArm[] = [
      { pattern: { kind: "identifier", name: "x" }, body: (b) => b.x as LoomValue },
    ];
    expect(evaluateMatch("bound", arms)).toBe("bound");
  });

  it("loom/runtime/match-error: a literal pattern matches by structural equality and evaluates its arm", () => {
    const arms: readonly MatchArm[] = [
      { pattern: { kind: "literal", value: "hit" }, body: () => "literal-arm" },
      { pattern: { kind: "wildcard" }, body: () => "fallthrough" },
    ];
    expect(evaluateMatch("hit", arms)).toBe("literal-arm");
  });

  it("loom/runtime/match-error: a constructor pattern matches the Result variant and binds its inner value", () => {
    const okValue: LoomValue = { ok: true, value: "inner" };
    const arms: readonly MatchArm[] = [
      {
        pattern: { kind: "constructor", ctor: "Ok", inner: { kind: "identifier", name: "v" } },
        body: (b) => b.v as LoomValue,
      },
      { pattern: { kind: "wildcard" }, body: () => "fallthrough" },
    ];
    expect(evaluateMatch(okValue, arms)).toBe("inner");
  });

  it("loom/runtime/match-error: an object/schema pattern matches listed fields and binds them", () => {
    const obj: LoomValue = { kind: "validation", attempts: "three" };
    const arms: readonly MatchArm[] = [
      {
        pattern: {
          kind: "object",
          fields: [
            { name: "kind", pattern: { kind: "literal", value: "validation" } },
            { name: "attempts", pattern: { kind: "identifier", name: "attempts" } },
          ],
        },
        body: (b) => b.attempts as LoomValue,
      },
      { pattern: { kind: "wildcard" }, body: () => "fallthrough" },
    ];
    expect(evaluateMatch(obj, arms)).toBe("three");
  });

  it("loom/runtime/match-error: an array pattern matches an exact-length array and binds each slot", () => {
    const arr: LoomValue = ["first", "second"];
    const arms: readonly MatchArm[] = [
      {
        pattern: {
          kind: "array",
          elements: [
            { kind: "identifier", name: "a" },
            { kind: "identifier", name: "b" },
          ],
        },
        body: (bnd) => `${String(bnd.a)}-${String(bnd.b)}`,
      },
      { pattern: { kind: "wildcard" }, body: () => "fallthrough" },
    ];
    expect(evaluateMatch(arr, arms)).toBe("first-second");
  });
});
