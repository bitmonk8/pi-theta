import { describe, expect, it } from "vitest";
import {
  buildFnDeclaration,
  checkBareReturn,
  checkFnPlacement,
  checkFunctionReference,
  checkUnreachableCode,
  lowerFnDescription,
  resolveFnCall,
  resolveReturnType,
  type FnDeclaration,
  type ReturnContribution,
} from "../src/parser/functions";
import { discardForVoid, functionResult } from "../src/runtime/function-result";
import { displayType, type CompatType } from "../src/parser/type-compat";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// V3d-T — failing tests for the paired `V3d` "functions and return".
//
// Spec: functions.md (FN-1 Placement, FN-2 Documentation, FN-3 Loom return
// type, FN-4 Empty-tail body, FN-5 Final value) and return.md (RET-1 return
// type-check, RET-2 bare-return-in-non-void, RET-3 unreachable code).
//
// The parse/type obligations are asserted against the standalone
// src/parser/functions.ts seams (placement / reference / hoisted-resolution,
// the doc-comment AST/lowering seam, the return-type resolver, and the bare-
// return / unreachable-code checks); the FN-4 void discard and the FN-5 final-
// value contract are asserted against the src/runtime/function-result.ts seam.
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-parse.md) per the *Diagnostic message anchors*
// rule, each test citing its diagnostic code inline.
//
// These tests red because the V3d functions-and-return behaviour is absent:
// the placement / reference / bare-return / unreachable seams return no
// diagnostic; `resolveFnCall` and `resolveReturnType` return the inert
// `"unchecked"` sentinel (which equals none of the expected outcomes);
// `buildFnDeclaration` drops the doc; `lowerFnDescription` wrongly carries it;
// `functionResult` returns an unimplemented sentinel; and `discardForVoid` does
// not discard. Each test reds on its own primary assertion, not on a compile
// error, a missing fixture, or a harness throw.

/** A throwaway 1:1–1:2 span for the seam calls. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

/** A located site at the throwaway span. */
function site(): { file: string; range: SourceRange } {
  return { file: "test.loom", range: span() };
}

function prim(name: "string" | "number" | "integer" | "boolean" | "null"): CompatType {
  return { kind: "prim", name };
}

// --- functions.md FN-1 — Placement -----------------------------------------

describe("V3d-T — `fn` placement (FN-1)", () => {
  it("FN-1: a nested `fn` fires loom/parse/nested-fn (parse phase)", () => {
    const d = checkFnPlacement({ nested: true }, site());
    expect(d, "FN-1: loom/parse/nested-fn for a nested `fn`").toBeDefined();
    expect(d?.code).toBe("loom/parse/nested-fn");
    // Message from diagnostics/code-registry-parse.md.
    expect(d?.message).toBe(
      "nested 'fn' declarations are not supported in loom 1.0",
    );
  });

  it("FN-1: a top-level `fn` raises no placement diagnostic", () => {
    const d = checkFnPlacement({ nested: false }, site());
    expect(d, "FN-1: a top-level `fn` is the legal placement").toBeUndefined();
  });

  it("FN-1: a function name used as a value fires loom/parse/function-as-value (parse phase)", () => {
    const d = checkFunctionReference({ name: "rate_strictness", position: "value" }, site());
    expect(
      d,
      "FN-1: loom/parse/function-as-value for a function used as a value",
    ).toBeDefined();
    expect(d?.code).toBe("loom/parse/function-as-value");
    // Message from diagnostics/code-registry-parse.md (interpolates the name).
    expect(d?.message).toBe(
      "function 'rate_strictness' used outside call position; functions are not first-class in loom 1.0",
    );
  });

  it("FN-1: a function name in call position raises no diagnostic", () => {
    const d = checkFunctionReference({ name: "rate_strictness", position: "call" }, site());
    expect(
      d,
      "FN-1: a call-position function reference is well-formed",
    ).toBeUndefined();
  });

  it("FN-1: hoisted mutual recursion between two top-level `fn`s resolves regardless of order", () => {
    // `is_even` and `is_odd` are mutually recursive top-level `fn`s; the call to
    // the forward-declared peer resolves because declarations are hoisted.
    const hoisted = ["is_even", "is_odd"];
    expect(
      resolveFnCall("is_odd", hoisted),
      "FN-1: a forward reference to a hoisted top-level `fn` (mutual recursion) resolves",
    ).toBe("resolved");
    expect(
      resolveFnCall("is_even", hoisted),
      "FN-1: the reciprocal mutual-recursion call resolves too",
    ).toBe("resolved");
  });
});

// --- functions.md FN-2 — Documentation -------------------------------------

describe("V3d-T — `fn` documentation (FN-2)", () => {
  it("FN-2: a leading `///` doc comment is preserved on the `fn` AST node", () => {
    const node = buildFnDeclaration({
      name: "rate_strictness",
      params: [{ name: "p", type: { kind: "named", name: "Author" } }],
      doc: "Rate this reviewer's likely strictness.",
    });
    expect(
      node.doc,
      "FN-2: the `///` doc comment is preserved on the AST as documentation",
    ).toBe("Rate this reviewer's likely strictness.");
  });

  it("FN-2: the doc comment does not lower into the provider payload (functions have no JSON Schema)", () => {
    const node: FnDeclaration = {
      name: "rate_strictness",
      params: [],
      doc: "Rate this reviewer's likely strictness.",
    };
    const fragment = lowerFnDescription(node);
    expect(
      fragment.description,
      "FN-2: a `fn`'s doc does not lower into provider payloads",
    ).toBeUndefined();
  });
});

// --- functions.md FN-3 / return.md RET-1 — return-type inference & check ----

describe("V3d-T — return-type inference (FN-3, RET-1)", () => {
  it("FN-3: an annotation-less body infers the LUB of its tail/`return` operands", () => {
    // Contributions `integer` and `number`: the LUB under `⊑` is `number`.
    const contributions: ReturnContribution[] = [
      { kind: "plain", type: prim("integer") },
      { kind: "plain", type: prim("number") },
    ];
    const r = resolveReturnType({
      contributions,
      hasQuestion: false,
      env: {},
      site: site(),
    });
    expect(r.kind, "FN-3: an annotation-less body infers its return type").toBe(
      "inferred",
    );
    if (r.kind !== "inferred") return;
    expect(r.inferred.wrapped, "FN-3: no `?`/`Result` operand ⇒ no wrap").toBe(
      false,
    );
    expect(
      displayType(r.inferred.payload),
      "FN-3: integer ⊔ number = number",
    ).toBe("number");
  });

  it("FN-3: a `?`-bearing body wraps the inferred LUB in Result<T, QueryError>", () => {
    // A single `string` tail with `?` in the body wraps to Result<string, …>.
    const r = resolveReturnType({
      contributions: [{ kind: "plain", type: prim("string") }],
      hasQuestion: true,
      env: {},
      site: site(),
    });
    expect(r.kind, "FN-3: an annotation-less `?`-body infers its return type").toBe(
      "inferred",
    );
    if (r.kind !== "inferred") return;
    expect(
      r.inferred.wrapped,
      "FN-3: a `?` in the body wraps the inferred type in Result",
    ).toBe(true);
    expect(
      displayType(r.inferred.payload),
      "FN-3: the wrapped success payload is the tail type `string`",
    ).toBe("string");
  });

  it("FN-3: a `Result`-typed contribution wraps and contributes its success payload", () => {
    // A `Result<integer, QueryError>` operand alongside a plain `number` tail:
    // the wrap applies (a `Result` contribution forces it) and the payload LUB
    // reconciles `integer` (the Result payload) with `number` to `number`.
    const contributions: ReturnContribution[] = [
      { kind: "result", payload: prim("integer") },
      { kind: "plain", type: prim("number") },
    ];
    const r = resolveReturnType({
      contributions,
      hasQuestion: false,
      env: {},
      site: site(),
    });
    expect(r.kind, "FN-3: a `Result`-operand body infers its return type").toBe(
      "inferred",
    );
    if (r.kind !== "inferred") return;
    expect(
      r.inferred.wrapped,
      "FN-3: a `Result`-typed contribution forces the Result wrap",
    ).toBe(true);
    expect(
      displayType(r.inferred.payload),
      "FN-3: the Result payload `integer` reconciles with `number` to `number`",
    ).toBe("number");
  });

  it("loom/parse/return-no-common-type: contributions sharing no common upper bound fire (type phase)", () => {
    // `string` and `number` share no common upper bound and no sink narrows them.
    const contributions: ReturnContribution[] = [
      { kind: "plain", type: prim("string") },
      { kind: "plain", type: prim("number") },
    ];
    const r = resolveReturnType({
      contributions,
      hasQuestion: false,
      env: {},
      site: site(),
    });
    expect(
      r.kind,
      "FN-3: contributions with no common upper bound have no inferred type",
    ).toBe("inference-no-common-type");
    if (r.kind !== "inference-no-common-type") return;
    expect(r.diagnostic.code).toBe("loom/parse/return-no-common-type");
    // Message from diagnostics/code-registry-parse.md.
    expect(r.diagnostic.message).toBe(
      "return operands have no common type; annotate the function return type or reconcile the operands",
    );
  });

  it("RET-1: an explicit return annotation type-checks the operands instead of inferring", () => {
    // With an explicit `number` annotation, a `string` operand is checked
    // against it (not inferred); the `⊑` outcome is `incompatible`.
    const r = resolveReturnType({
      annotation: prim("number"),
      contributions: [{ kind: "plain", type: prim("string") }],
      hasQuestion: false,
      env: {},
      site: site(),
    });
    expect(
      r.kind,
      "RET-1: an explicitly annotated body type-checks rather than infers",
    ).toBe("checked");
    if (r.kind !== "checked") return;
    expect(
      r.operandResults,
      "RET-1: a `string` operand under a `number` annotation is incompatible",
    ).toEqual(["incompatible"]);
  });

  it("RET-1: a return operand compatible with the annotation type-checks as compatible", () => {
    // An `integer` operand under a `number` annotation: `integer ⊑ number`.
    const r = resolveReturnType({
      annotation: prim("number"),
      contributions: [{ kind: "plain", type: prim("integer") }],
      hasQuestion: false,
      env: {},
      site: site(),
    });
    expect(r.kind, "RET-1: an annotated body is checked, not inferred").toBe(
      "checked",
    );
    if (r.kind !== "checked") return;
    expect(
      r.operandResults,
      "RET-1: an `integer` operand under a `number` annotation is compatible",
    ).toEqual(["compatible"]);
  });
});

// --- functions.md FN-4 — Empty-tail body -----------------------------------

describe("V3d-T — empty-tail body (FN-4)", () => {
  it("FN-4: an empty-tail body infers the `null` literal type", () => {
    const r = resolveReturnType({
      contributions: [],
      hasQuestion: false,
      env: {},
      site: site(),
    });
    expect(r.kind, "FN-4: an empty-tail body has an inferred return type").toBe(
      "inferred",
    );
    if (r.kind !== "inferred") return;
    expect(
      r.inferred.wrapped,
      "FN-4: an empty-tail body with no `?` is not Result-wrapped",
    ).toBe(false);
    expect(
      displayType(r.inferred.payload),
      "FN-4: an empty-tail body infers `null`",
    ).toBe("null");
  });

  it("FN-4: a `?`-bearing empty-tail body infers Result<null, QueryError>", () => {
    const r = resolveReturnType({
      contributions: [],
      hasQuestion: true,
      env: {},
      site: site(),
    });
    expect(r.kind, "FN-4: a `?`-bearing empty-tail body has an inferred type").toBe(
      "inferred",
    );
    if (r.kind !== "inferred") return;
    expect(
      r.inferred.wrapped,
      "FN-4: a `?` in an empty-tail body wraps the inferred type in Result",
    ).toBe(true);
    expect(
      displayType(r.inferred.payload),
      "FN-4: the wrapped success payload of an empty-tail `?`-body is `null`",
    ).toBe("null");
  });

  it("FN-4: a `void` function discards its tail value (produces null)", () => {
    expect(
      discardForVoid(42),
      "FN-4: a `void` function discards its tail value and produces null",
    ).toBeNull();
  });
});

// --- return.md RET-2 / RET-3 — bare return and unreachable code -------------

describe("V3d-T — bare `return` (RET-2)", () => {
  it("loom/parse/bare-return-in-non-void: a bare `return` in a non-`void` function fires (type phase)", () => {
    const d = checkBareReturn({ returnTypeIsVoid: false }, site());
    expect(
      d,
      "RET-2: loom/parse/bare-return-in-non-void for a non-`void` scope",
    ).toBeDefined();
    expect(d?.code).toBe("loom/parse/bare-return-in-non-void");
    // Message from diagnostics/code-registry-parse.md.
    expect(d?.message).toBe("missing return value");
  });

  it("loom/parse/bare-return-in-non-void: a bare `return` at the top level fires (no annotation ⇒ non-void)", () => {
    // A top-level loom has no return annotation, so a bare `return` there is
    // also loom/parse/bare-return-in-non-void (RET-2).
    const d = checkBareReturn({ returnTypeIsVoid: false }, site());
    expect(
      d,
      "RET-2: a top-level bare `return` is bare-return-in-non-void",
    ).toBeDefined();
    expect(d?.code).toBe("loom/parse/bare-return-in-non-void");
  });

  it("RET-2: a bare `return` inside a `void` function raises no diagnostic", () => {
    const d = checkBareReturn({ returnTypeIsVoid: true }, site());
    expect(
      d,
      "RET-2: a bare `return` is legal inside a `void`-annotated function",
    ).toBeUndefined();
  });
});

describe("V3d-T — unreachable code after `return` (RET-3)", () => {
  it("loom/parse/unreachable-code: a statement after a `return` in the same block warns (parse phase)", () => {
    const d = checkUnreachableCode({ hasCodeAfterReturn: true }, site());
    expect(
      d,
      "RET-3: loom/parse/unreachable-code for code after a `return`",
    ).toBeDefined();
    expect(d?.code).toBe("loom/parse/unreachable-code");
    expect(d?.severity, "RET-3: unreachable code is a warning, not an error").toBe(
      "warning",
    );
    // Message from diagnostics/code-registry-parse.md.
    expect(d?.message).toBe("unreachable code after return");
  });

  it("RET-3: a block with no code after its `return` raises no diagnostic", () => {
    const d = checkUnreachableCode({ hasCodeAfterReturn: false }, site());
    expect(
      d,
      "RET-3: no statement after the `return` ⇒ no unreachable-code warning",
    ).toBeUndefined();
  });
});

// --- functions.md FN-5 — Final value ----------------------------------------

describe("V3d-T — final value at the function-result seam (FN-5)", () => {
  it("FN-5: on the success path the body's produced value is the final value", () => {
    const r = functionResult("success", 42);
    expect(r.present, "FN-5: a final value is present on the success path").toBe(
      true,
    );
    expect(
      r.value,
      "FN-5: the success final value is the body's produced value",
    ).toBe(42);
  });

  it("FN-5: on failure no final value flows (the caller observes only the Err envelope)", () => {
    const r = functionResult("fail", 42);
    expect(
      r.present,
      "FN-5: no final value is present on the failure path",
    ).toBe(false);
    expect(r.value, "FN-5: no value flows on failure").toBeUndefined();
  });

  it("FN-5: on cancellation no final value flows", () => {
    const r = functionResult("cancel", 42);
    expect(
      r.present,
      "FN-5: no final value is present on the cancellation path",
    ).toBe(false);
    expect(r.value, "FN-5: no value flows on cancellation").toBeUndefined();
  });
});
