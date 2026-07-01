import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { CompatSite, CompatType, TypeEnv } from "../src/parser/type-compat";
import {
  CALLEE_HAS_ERRORS_CODE,
  CALLEE_HAS_ERRORS_HINT,
  INVOKE_ARG_TYPE_MISMATCH_CODE,
  INVOKE_ARITY_TOO_FEW_CODE,
  INVOKE_ARITY_TOO_MANY_CODE,
  INVOKE_NON_LOOM_EXTENSION_CODE,
  INVOKE_RETURN_TYPE_MISMATCH_CODE,
  calleeHasErrorsMessage,
  checkCalleeHasErrors,
  checkInvokeArgTypes,
  checkInvokeArity,
  checkInvokeCall,
  checkInvokeExtension,
  checkInvokeReturnType,
  invokeArgTypeMismatchMessage,
  invokeArityTooFewMessage,
  invokeArityTooManyMessage,
  invokeNonLoomExtensionMessage,
  invokeReturnTypeMismatchMessage,
} from "../src/parser/invoke-diagnostics";

// V15f-T — failing tests for the paired `V15f` "Invoke parse/load diagnostics".
//
// Spec: invocation.md (§Argument binding, §Typed return, §Argument arity,
// §Resolution, §Static resolution), implementation-notes.md
// ("Static-resolution load pass"). Each diagnostic is keyed to the INV
// parse/load code-keyed obligation area; every test cites its `loom/...` code
// inline and sources the expected message from the registry-anchored message
// builder (per the *Diagnostic message anchors* rule).
//
// Each test reds on its own primary assertion because the V15f behaviour is
// absent: every checker returns a single inert `stub/v15f-unimplemented`
// diagnostic, so a fire-case test reds (wrong code) and a skip-case test reds
// (unexpected length 1). No test reds on a compile error, a missing fixture, or
// a harness throw.

const SITE: CompatSite = {
  file: "/proj/.pi/looms/entry.loom",
  range: { start: { line: 3, column: 5 }, end: { line: 3, column: 40 } },
};

const NUMBER: CompatType = { kind: "prim", name: "number" };
const STRING: CompatType = { kind: "prim", name: "string" };
const INTEGER: CompatType = { kind: "prim", name: "integer" };

/** `Cat ⊑ Animal`: `Animal = Cat | Dog` (alias to a union of two named schemas). */
const CAT: CompatType = { kind: "named", name: "Cat" };
const ANIMAL: CompatType = { kind: "named", name: "Animal" };
const ANIMAL_ENV: TypeEnv = {
  Cat: { kind: "object-schema" },
  Dog: { kind: "object-schema" },
  Animal: {
    kind: "alias",
    rhs: {
      kind: "union",
      arms: [
        { kind: "named", name: "Cat" },
        { kind: "named", name: "Dog" },
      ],
    },
  },
};

function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

// --------------------------------------------------------------------------
// loom/parse/invoke-arg-type-mismatch (invocation.md §Argument binding)
// --------------------------------------------------------------------------

describe("loom/parse/invoke-arg-type-mismatch (invocation.md §Argument binding)", () => {
  it("loom/parse/invoke-arg-type-mismatch: a mismatched positional arg fires when the callee is statically resolvable", () => {
    const diags = checkInvokeArgTypes({
      staticallyResolvable: true,
      args: [{ paramName: "n", paramType: NUMBER, argType: STRING }],
      env: {},
      site: SITE,
    });
    const d = withCode(diags, INVOKE_ARG_TYPE_MISMATCH_CODE);
    expect(d, "loom/parse/invoke-arg-type-mismatch for string-under-number").toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe(
      invokeArgTypeMismatchMessage(0, "n", "number", "string"),
    );
  });

  it("loom/parse/invoke-arg-type-mismatch: the check is skipped (no parse error) when the callee is NOT statically resolvable — runtime AJV is the net", () => {
    const diags = checkInvokeArgTypes({
      staticallyResolvable: false,
      args: [{ paramName: "n", paramType: NUMBER, argType: STRING }],
      env: {},
      site: SITE,
    });
    // Not statically resolvable → no parse diagnostic; the runtime AJV check is
    // the only safety net (invocation.md §Argument binding).
    expect(diags).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
// loom/parse/invoke-return-type-mismatch (invocation.md §Typed return)
// --------------------------------------------------------------------------

describe("loom/parse/invoke-return-type-mismatch (invocation.md §Typed return)", () => {
  it("loom/parse/invoke-return-type-mismatch: a narrower callee return under a wider annotation (Cat ⊑ Animal) is ACCEPTED — compatibility, not equality", () => {
    const diags = checkInvokeReturnType({
      callee: "planner",
      calleeResolvable: true,
      schema: ANIMAL,
      calleeReturn: CAT,
      env: ANIMAL_ENV,
      site: SITE,
    });
    // T_calleeReturn ⊑ Schema holds (Cat ⊑ Animal), so no parse error fires.
    expect(diags).toHaveLength(0);
  });

  it("loom/parse/invoke-return-type-mismatch: an incompatible callee return under the annotation fires when both sides are statically resolvable", () => {
    const diags = checkInvokeReturnType({
      callee: "planner",
      calleeResolvable: true,
      schema: NUMBER,
      calleeReturn: STRING,
      env: {},
      site: SITE,
    });
    const d = withCode(diags, INVOKE_RETURN_TYPE_MISMATCH_CODE);
    expect(d, "loom/parse/invoke-return-type-mismatch for string-under-number").toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe(invokeReturnTypeMismatchMessage("planner", "string"));
  });

  it("loom/parse/invoke-return-type-mismatch: no parse error fires when the callee is NOT statically resolvable — runtime AJV is the net", () => {
    const diags = checkInvokeReturnType({
      callee: "planner",
      calleeResolvable: false,
      schema: NUMBER,
      calleeReturn: STRING,
      env: {},
      site: SITE,
    });
    expect(diags).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
// loom/parse/invoke-arity-too-few / -too-many (invocation.md §Argument arity)
// --------------------------------------------------------------------------

describe("loom/parse/invoke-arity-* (invocation.md §Argument arity)", () => {
  it("loom/parse/invoke-arity-too-few: fewer than the non-defaulted params count fires when statically resolvable", () => {
    const diags = checkInvokeArity({
      callee: "planner",
      staticallyResolvable: true,
      requiredCount: 2,
      totalCount: 2,
      providedCount: 1,
      site: SITE,
    });
    const d = withCode(diags, INVOKE_ARITY_TOO_FEW_CODE);
    expect(d, "loom/parse/invoke-arity-too-few for 1<2 required").toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe(invokeArityTooFewMessage("planner", 2, 1));
  });

  it("loom/parse/invoke-arity-too-few: too-few falls back to the runtime AJV check (no parse error) when NOT statically resolvable", () => {
    const diags = checkInvokeArity({
      callee: "planner",
      staticallyResolvable: false,
      requiredCount: 2,
      totalCount: 2,
      providedCount: 1,
      site: SITE,
    });
    // Not statically resolvable → Err(InvokeInfraError { cause: "validation" })
    // at runtime, not a parse error (invocation.md §Argument arity).
    expect(diags).toHaveLength(0);
  });

  it("loom/parse/invoke-arity-too-many: more than the total params count is ALWAYS a parse error, even when NOT statically resolvable", () => {
    const diags = checkInvokeArity({
      callee: "planner",
      staticallyResolvable: false,
      requiredCount: 2,
      totalCount: 2,
      providedCount: 3,
      site: SITE,
    });
    const d = withCode(diags, INVOKE_ARITY_TOO_MANY_CODE);
    expect(d, "loom/parse/invoke-arity-too-many fires regardless of static resolvability").toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe(invokeArityTooManyMessage("planner", 2, 3));
  });

  it("loom/parse/invoke-arity-*: an in-range arity (defaulted-tail slot omitted) fires neither arity code", () => {
    const diags = checkInvokeArity({
      callee: "planner",
      staticallyResolvable: true,
      requiredCount: 1,
      totalCount: 2,
      providedCount: 1,
      site: SITE,
    });
    expect(diags).toHaveLength(0);
  });

  it("loom/parse/invoke-arity-too-many: arity is checked BEFORE per-argument type — a too-many + mistyped call reports arity, not invoke-arg-type-mismatch", () => {
    const diags = checkInvokeCall({
      callee: "planner",
      staticallyResolvable: true,
      requiredCount: 1,
      totalCount: 1,
      // Two args against a 1-param callee, and arg 0 is also mistyped.
      args: [
        { paramName: "n", paramType: NUMBER, argType: STRING },
        { paramName: "<extra>", paramType: NUMBER, argType: NUMBER },
      ],
      env: {},
      site: SITE,
    });
    // Arity checked first: the arity error is reported and the per-argument
    // type check does not run (invocation.md §Argument arity).
    expect(
      withCode(diags, INVOKE_ARITY_TOO_MANY_CODE),
      "arity-too-many is reported",
    ).toBeDefined();
    expect(
      withCode(diags, INVOKE_ARG_TYPE_MISMATCH_CODE),
      "per-argument type check does not run when arity fails",
    ).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// loom/parse/invoke-non-loom-extension (invocation.md §Resolution)
// --------------------------------------------------------------------------

describe("loom/parse/invoke-non-loom-extension (invocation.md §Resolution)", () => {
  it("loom/parse/invoke-non-loom-extension: an invoke(...) .warp path fires", () => {
    const diags = checkInvokeExtension({
      literalPath: "./lib.warp",
      surface: "invoke",
      site: SITE,
    });
    const d = withCode(diags, INVOKE_NON_LOOM_EXTENSION_CODE);
    expect(d, "loom/parse/invoke-non-loom-extension for .warp path").toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe(invokeNonLoomExtensionMessage("./lib.warp"));
  });

  it("loom/parse/invoke-non-loom-extension: a non-lowercase .LOOM variant fires (byte-exact lowercase match)", () => {
    const diags = checkInvokeExtension({
      literalPath: "./mod.LOOM",
      surface: "invoke",
      site: SITE,
    });
    const d = withCode(diags, INVOKE_NON_LOOM_EXTENSION_CODE);
    expect(d, "loom/parse/invoke-non-loom-extension for .LOOM variant").toBeDefined();
    expect(d?.message).toBe(invokeNonLoomExtensionMessage("./mod.LOOM"));
  });

  it("loom/parse/invoke-non-loom-extension: the same code fires for a tools: entry whose path does not end in .loom", () => {
    const diags = checkInvokeExtension({
      literalPath: "./helper.LOOM",
      surface: "tools",
      site: SITE,
    });
    const d = withCode(diags, INVOKE_NON_LOOM_EXTENSION_CODE);
    expect(d, "loom/parse/invoke-non-loom-extension for tools: entry").toBeDefined();
    expect(d?.message).toBe(invokeNonLoomExtensionMessage("./helper.LOOM"));
  });

  it("loom/parse/invoke-non-loom-extension: a byte-exact-lowercase .loom path fires nothing", () => {
    const diags = checkInvokeExtension({
      literalPath: "./ok.loom",
      surface: "invoke",
      site: SITE,
    });
    expect(diags).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
// loom/load/callee-has-errors (invocation.md §Static resolution)
// --------------------------------------------------------------------------

describe("loom/load/callee-has-errors (invocation.md §Static resolution)", () => {
  const RELATED = [
    {
      file: "/proj/.pi/looms/plan.loom",
      range: { start: { line: 5, column: 1 }, end: { line: 5, column: 12 } },
      message: "unexpected token",
    },
  ];

  it("loom/load/callee-has-errors: a tools: .loom entry pointing at a broken callee is severity ERROR (callable cannot be created; parent does not register)", () => {
    const diags = checkCalleeHasErrors({
      calleePath: "./plan.loom",
      surface: "tools",
      hasErrors: true,
      relatedSites: RELATED,
      site: SITE,
    });
    const d = withCode(diags, CALLEE_HAS_ERRORS_CODE);
    expect(d, "loom/load/callee-has-errors for a tools: entry").toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe(calleeHasErrorsMessage("./plan.loom"));
    expect(d?.hint).toBe(CALLEE_HAS_ERRORS_HINT);
    // The underlying error sites are listed via `related`.
    expect(d?.related).toEqual(RELATED);
  });

  it("loom/load/callee-has-errors: a literal invoke(...) callee that is broken is severity WARNING (parent registers; static checks skipped; runtime AJV is the net)", () => {
    const diags = checkCalleeHasErrors({
      calleePath: "./plan.loom",
      surface: "invoke",
      hasErrors: true,
      relatedSites: RELATED,
      site: SITE,
    });
    const d = withCode(diags, CALLEE_HAS_ERRORS_CODE);
    expect(d, "loom/load/callee-has-errors for an invoke(...) literal").toBeDefined();
    expect(d?.severity).toBe("warning");
    expect(d?.message).toBe(calleeHasErrorsMessage("./plan.loom"));
  });

  it("loom/load/callee-has-errors: a callee that resolves cleanly fires nothing", () => {
    const diags = checkCalleeHasErrors({
      calleePath: "./plan.loom",
      surface: "tools",
      hasErrors: false,
      relatedSites: [],
      site: SITE,
    });
    expect(diags).toHaveLength(0);
  });
});
