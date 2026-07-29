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
import { makeOk, type ThetaValue } from "../src/runtime/value";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";

// V4a-T — failing tests for the paired `V4a` "`match`, `?`, and `Result`"
// implementation.
//
// Spec: errors-and-results.md, errors-and-results/error-model.md (closure into
// expressions.md §`?` operator / §`match` expression and type-system.md
// §"Type compatibility").
//
//   - ERR-18 (expressions.md ERR-18 / §`?` operator) — a `?` whose operand is
//     not statically `Result<_, QueryError>` fires
//     `theta/parse/question-on-non-result` (type phase), asserted against the
//     `checkQuestionOperand` seam (src/parser/match-result.ts).
//   - expressions.md §`?` operator — a `?` outside a `Result`-compatible scope
//     fires `theta/parse/question-outside-result-fn` (type phase), asserted
//     against the `checkQuestionScope` seam.
//   - expressions.md §`match` expression (Arm syntax) — a `match` whose arm
//     bodies share no common upper bound under type-system.md §"Type
//     compatibility" fires `theta/parse/match-arm-type-mismatch` (type phase),
//     and a well-typed `match` resolves to the LUB of its arms, asserted
//     against the `checkMatchArmTypes` seam.
//   - error-model.md §"Runtime panics" — a value matching none of the six
//     pattern forms raises the `theta/runtime/match-error` panic (`MatchError`),
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
  return { file: "test.theta", range: span() };
}

const PRIM = (name: PrimitiveName): CompatType => ({ kind: "prim", name });

// --- expressions.md ERR-18 — `?` operand-type precondition -----------------

describe("V4a-T — `?` operand-type precondition (ERR-18)", () => {
  it("ERR-18: `?` on a non-`Result` operand fires theta/parse/question-on-non-result (type phase)", () => {
    // `let x = 5?` — the operand `5` is `integer`, not `Result<T, QueryError>`.
    const operand: QuestionOperandType = { kind: "non-result", display: "integer" };

    const diag = checkQuestionOperand(operand, site());

    expect(
      diag,
      "ERR-18: a non-Result `?` operand fires theta/parse/question-on-non-result",
    ).toBeDefined();
    expect(diag?.code).toBe("theta/parse/question-on-non-result");
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

// --- bug 0019 — ERR-18 gate widening: `union` / `object` CompatTypes --------
//
// Bug 0019 (docs/bugs/0019-question-operand-bypasses-result-normalisation.md):
// the production classifier feeding `checkQuestionOperand`
// (`questionOperandKind`, src/parser/type-layer-checks.ts) classifies only
// `prim` / `literal` / `array` inferred CompatTypes; `union` and `object` —
// non-`Result` BY CONSTRUCTION — fall to the unclassified arm and the theta
// loads in violation of ERR-18. The seam itself (`checkQuestionOperand`) is
// total for classified input, so the gap is pinned through the production
// whole-file parse; the seam cases below pin the message the widened arms
// must interpolate (display via `displayType`).
//
// Source reachability (verified at 7fa76517):
//   - `union`: reachable ONLY through a fn-param annotation — `walkFn` seeds
//     the fn scope with `annotationToCompatType(p.type)`, and
//     `annotationToCompatType` maps `number | string` to a `union` CompatType.
//     A `let` annotation does NOT reach the `?` site (bindings store the RHS
//     INFERRED type, not the annotation).
//   - `object`: NOT constructible at a `?` operand site from real source —
//     `annotationToCompatType` maps an inline object annotation (`{ a: T }`)
//     to a nominal `named` reference, and the inference pass's `#typeExpr`
//     never yields an `object` CompatType (an object ctor types as
//     `named <schema>`). The object arm is therefore covered at the seam
//     level only (message contract), not with a fabricated source fixture.

describe("bug 0019 — ERR-18 gate widening (union / object CompatTypes classify as non-result)", () => {
  /** The production whole-file parse (the route through `questionOperandKind`). */
  function productionCodesOf(src: string): string[] {
    const systemNote: SystemNoteChannelDeps = {
      pi: { sendMessage: (): void => {} },
      ui: { notify: (): void => {} },
      emitDiagnostic: (): void => {},
    };
    const modelMatcher: ModelReferenceMatcher = {
      resolve: (): "resolved" => "resolved",
    };
    const deps: ParseThetaDocumentDeps = { systemNote, modelMatcher };
    const source: ThetaSource = { path: "bug0019.theta", bytes: new TextEncoder().encode(src) };
    return parseThetaDocument(source, deps).diagnostics.map((d) => d.code);
  }

  it("RED: `?` on a union-typed fn param fires theta/parse/question-on-non-result in the production parse (fn-param route)", () => {
    // `x` carries the union CompatType `number | string` (fn-param route);
    // the fn has no return annotation, so the enclosing scope is `inferred`
    // and no `question-outside-result-fn` fires — the operand diagnostic is
    // the only one expected, asserted by containment.
    const codes = productionCodesOf(
      ["fn f(x: number | string) {", "  let v = x?", "  v", "}"].join("\n"),
    );
    expect(
      codes,
      "bug 0019: a union-typed `?` operand is non-Result by construction and must fire ERR-18's theta/parse/question-on-non-result at load",
    ).toContain("theta/parse/question-on-non-result");
  });

  it("message contract: a union display renders through the registry message (green now — pins the widened arm's output)", () => {
    // The widened `union` arm classifies as
    // `{ kind: "non-result", display: displayType(type) }`;
    // `displayType({ union [number, string] })` renders "number | string".
    const diag = checkQuestionOperand(
      { kind: "non-result", display: "number | string" },
      site(),
    );
    expect(diag?.code).toBe("theta/parse/question-on-non-result");
    expect(diag?.message).toBe("'?' requires a Result operand; got number | string");
  });

  it("message contract: an object display renders through the registry message (green now — seam-level only, see reachability note)", () => {
    // No real source constructs an `object` CompatType at a `?` operand site
    // (see the describe comment), so the object arm's coverage is the seam
    // message it must interpolate via `displayType` once widened.
    const diag = checkQuestionOperand(
      { kind: "non-result", display: "{ a: number }" },
      site(),
    );
    expect(diag?.code).toBe("theta/parse/question-on-non-result");
    expect(diag?.message).toBe("'?' requires a Result operand; got { a: number }");
  });
});

// --- expressions.md §`?` operator — enclosing-scope precondition -----------

describe("V4a-T — `?` enclosing-scope precondition (question-outside-result-fn)", () => {
  it("`?` in a scope whose return type is not Result-compatible fires theta/parse/question-outside-result-fn (type phase)", () => {
    // A scope with an explicit return annotation that does not admit
    // `Result<U, QueryError>` for any `U`.
    const scope: EnclosingReturnScope = { kind: "annotated", resultCompatible: false };

    const diag = checkQuestionScope(scope, site());

    expect(
      diag,
      "`?` outside a Result-compatible scope fires theta/parse/question-outside-result-fn",
    ).toBeDefined();
    expect(diag?.code).toBe("theta/parse/question-outside-result-fn");
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

  it("theta/parse/match-arm-type-mismatch: arm bodies sharing no common upper bound fire the diagnostic (type phase)", () => {
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
      "theta/parse/match-arm-type-mismatch: arms with no common upper bound fire the mismatch diagnostic",
    ).toContain("theta/parse/match-arm-type-mismatch");
    const mismatch = diagnostics.find(
      (d) => d.code === "theta/parse/match-arm-type-mismatch",
    );
    expect(mismatch?.severity).toBe("error");
    // Message from diagnostics/code-registry-parse.md.
    expect(mismatch?.message).toBe(
      "match arm body type does not match the common type of the other arms",
    );
  });

  it("theta/parse/match-arm-type-mismatch: a well-typed `match` resolves to the LUB of its arms (integer ⊔ number = number)", () => {
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
      "theta/parse/match-arm-type-mismatch: a well-typed `match` resolves to the LUB of its arms",
    ).toEqual({ kind: "prim", name: "number" });
  });

  it("theta/parse/match-arm-type-mismatch: a single-type `match` resolves to that type", () => {
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

describe("V4a-T — runtime `match` raise-versus-bind exhaustion (theta/runtime/match-error)", () => {
  it("theta/runtime/match-error: a value matching none of the arms raises the MatchError panic", () => {
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
      "theta/runtime/match-error: a scrutinee matching no arm raises MatchError",
    ).toThrow(MatchError);
  });

  it("theta/runtime/match-error: the raised panic carries the theta/runtime/match-error code", () => {
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
      "theta/runtime/match-error: the non-exhaustive-match panic is a MatchError",
    ).toBe(true);
    expect((raised as MatchError).code).toBe(MATCH_ERROR_CODE);
    expect(MATCH_ERROR_CODE).toBe("theta/runtime/match-error");
  });

  it("theta/runtime/match-error: a wildcard pattern matches and evaluates its arm (no panic)", () => {
    const arms: readonly MatchArm[] = [
      { pattern: { kind: "wildcard" }, body: () => "wildcard-arm" },
    ];
    expect(evaluateMatch(42, arms)).toBe("wildcard-arm");
  });

  it("theta/runtime/match-error: an identifier pattern matches and binds the scrutinee", () => {
    const arms: readonly MatchArm[] = [
      { pattern: { kind: "identifier", name: "x" }, body: (b) => b.x as ThetaValue },
    ];
    expect(evaluateMatch("bound", arms)).toBe("bound");
  });

  it("theta/runtime/match-error: a literal pattern matches by structural equality and evaluates its arm", () => {
    const arms: readonly MatchArm[] = [
      { pattern: { kind: "literal", value: "hit" }, body: () => "literal-arm" },
      { pattern: { kind: "wildcard" }, body: () => "fallthrough" },
    ];
    expect(evaluateMatch("hit", arms)).toBe("literal-arm");
  });

  it("theta/runtime/match-error: a constructor pattern matches the Result variant and binds its inner value", () => {
    // A genuine constructor-built Result: only makeOk/makeErr-branded values
    // classify as Results (bug 0017), so a forged { ok, value } literal would
    // match no constructor pattern.
    const okValue: ThetaValue = makeOk("inner");
    const arms: readonly MatchArm[] = [
      {
        pattern: { kind: "constructor", ctor: "Ok", inner: { kind: "identifier", name: "v" } },
        body: (b) => b.v as ThetaValue,
      },
      { pattern: { kind: "wildcard" }, body: () => "fallthrough" },
    ];
    expect(evaluateMatch(okValue, arms)).toBe("inner");
  });

  it("theta/runtime/match-error: an object/schema pattern matches listed fields and binds them", () => {
    const obj: ThetaValue = { kind: "validation", attempts: "three" };
    const arms: readonly MatchArm[] = [
      {
        pattern: {
          kind: "object",
          fields: [
            { name: "kind", pattern: { kind: "literal", value: "validation" } },
            { name: "attempts", pattern: { kind: "identifier", name: "attempts" } },
          ],
        },
        body: (b) => b.attempts as ThetaValue,
      },
      { pattern: { kind: "wildcard" }, body: () => "fallthrough" },
    ];
    expect(evaluateMatch(obj, arms)).toBe("three");
  });

  it("theta/runtime/match-error: an array pattern matches an exact-length array and binds each slot", () => {
    const arr: ThetaValue = ["first", "second"];
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
