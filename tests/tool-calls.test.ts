import { describe, expect, it } from "vitest";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import {
  checkToolCallArguments,
  codeToolErrorCauses,
  codeToolErrorKind,
  enforceCodeToolArgDepth,
  lowerAcceptedThetaCallableReturn,
  lowerAcceptedPiToolReturn,
  modelToolErrorKind,
  surfaceThetaCallableCalleeFailure,
  surfaceThetaCallableInputValidationFailure,
  type ToolCallArgCheckInput,
} from "../src/runtime/tool-call";
import type { CancelledError } from "../src/runtime/query-error";
import type { ResultValue } from "../src/runtime/value";

// V14a-T — failing tests for the paired `V14a` "Tool calls (code-side) and
// `CodeToolError`" implementation leaf.
//
// Spec: tool-calls.md; pi-integration-contract/host-interfaces-core.md
// §"Tool execution from theta code"; errors-and-results/queryerror-variants.md.
//
// Each test reds on its own primary assertion because the V14a behaviour is
// absent: `checkToolCallArguments` raises no diagnostics, the closed-enum /
// distinctness surfaces are empty / `""`, the accepted-path lowerings return an
// inert `Err`, and the `.theta`-callable failure surfaces return `kind: ""`
// values. No test reds on a compile error, a missing fixture, or a harness
// throw.

/** A throwaway 1:1–1:2 span for the located seam calls. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

const FILE = "call.theta";

/** The first diagnostic carrying `code`, if any. */
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

/** Base fields shared by every `checkToolCallArguments` input in this file. */
function argSite(
  overrides: Partial<ToolCallArgCheckInput> & Pick<ToolCallArgCheckInput, "toolName" | "calleeKind" | "positionalCount">,
): ToolCallArgCheckInput {
  return { file: FILE, range: span(), ...overrides };
}

// RFC 0002 (docs/rfcs/0002-computed-tool-arguments.md) — the parse-time
// provable-disjointness facts threaded into the argument check, mirroring the
// existing `ToolCallStaticResolution` precomputed-facts pattern already used for
// the `.theta`-callable `tool-arg-type-mismatch` arm. `checkToolCallArguments`
// emits the new `theta/parse/tool-arg-schema-conflict` error *iff*
// `provablyDisjoint` is true; an unprovable mismatch falls through to the
// runtime AJV check and raises nothing at parse time.
interface ToolArgSchemaConflictFacts {
  readonly field: string;
  readonly provablyDisjoint: boolean;
  readonly expected: string;
  readonly actual: string;
}
interface SchemaAwareToolCallArgCheckInput extends ToolCallArgCheckInput {
  readonly schemaConflict?: ToolArgSchemaConflictFacts;
}

// --- Parse-time argument checks (arity → not-literal → type) ---------------

describe("code-side tool-call argument checks (tool-calls.md §Argument shape)", () => {
  it("theta/parse/tool-arg-arity: a multi-argument Pi-tool call fires", () => {
    // A two-argument Pi-tool call `read({...}, {...})` is arity-invalid
    // regardless of the argument shapes.
    const diags = checkToolCallArguments(
      argSite({ toolName: "read", calleeKind: "pi-tool", positionalCount: 2 }),
    );
    const d = withCode(diags, "theta/parse/tool-arg-arity");
    expect(d, "theta/parse/tool-arg-arity").toBeDefined();
    // Message template from code-registry-parse.md:
    //   `Pi tool '<name>' takes a single object argument; got <count>`
    expect(d?.message).toBe("Pi tool 'read' takes a single object argument; got 2");
  });

  it("RFC 0002 retirement: theta/parse/tool-arg-not-literal is NOT emitted for a computed Pi-tool argument", () => {
    // RFC 0002 retires `theta/parse/tool-arg-not-literal` for Pi-tool call sites
    // (a DIAG-2 code removal). The single positional argument's field values are
    // now full Theta expressions; a function-call field value is admitted.
    // (Updated from the pre-RFC expectation that this case *fired* the code.)
    const diags = checkToolCallArguments(
      argSite({
        toolName: "read",
        calleeKind: "pi-tool",
        positionalCount: 1,
        argumentSource: "{ path: resolve(x) }",
      }),
    );
    expect(
      withCode(diags, "theta/parse/tool-arg-not-literal"),
      "tool-arg-not-literal is retired for Pi-tool call sites",
    ).toBeUndefined();
  });

  it("theta/parse/tool-arg-type-mismatch: a statically-resolvable `.theta`-callable argument mismatch fires", () => {
    const diags = checkToolCallArguments(
      argSite({
        toolName: "summarise",
        calleeKind: "theta-callable",
        positionalCount: 1,
        staticResolution: {
          resolvable: true,
          matches: false,
          expected: "string",
          actual: "number",
        },
      }),
    );
    const d = withCode(diags, "theta/parse/tool-arg-type-mismatch");
    expect(d, "theta/parse/tool-arg-type-mismatch").toBeDefined();
    // Message template from code-registry-parse.md:
    //   `tool '<name>' argument type mismatch: expected <expected>, got <actual>`
    expect(d?.message).toBe(
      "tool 'summarise' argument type mismatch: expected string, got number",
    );
  });

  it("theta/parse/tool-arg-arity / tool-arg-type-mismatch: arity is checked before type", () => {
    // A call that both over-supplies positional arguments AND type-mismatches
    // fires only the arity code — arity is checked before type.
    const diags = checkToolCallArguments(
      argSite({
        toolName: "summarise",
        calleeKind: "theta-callable",
        positionalCount: 2,
        staticResolution: {
          resolvable: true,
          matches: false,
          expected: "string",
          actual: "number",
        },
      }),
    );
    expect(withCode(diags, "theta/parse/tool-arg-arity"), "arity fires").toBeDefined();
    expect(
      withCode(diags, "theta/parse/tool-arg-type-mismatch"),
      "type-mismatch suppressed by earlier arity failure",
    ).toBeUndefined();
  });
});

// --- RFC 0002 behavior 1 — parse acceptance of computed field values --------

// RFC 0002 (docs/rfcs/0002-computed-tool-arguments.md) admits the full
// expression grammar for the *field values* of a Pi-tool call's single
// bare-object argument. Each of these was previously a
// `theta/parse/tool-arg-not-literal` parse error; under RFC 0002 the call parses
// without error (no not-literal diagnostic, and no schema-conflict for these
// non-disjoint forms). Asserted against the `checkToolCallArguments` call-site
// seam — the Pi-tool argument position at which the literal check ran pre-RFC.
describe("RFC 0002 behavior 1 — computed Pi-tool field values parse without error", () => {
  const ACCEPTED: ReadonlyArray<readonly [string, string]> = [
    ["identifier reference to a let binding", "{ path: base }"],
    ["operator form (string concat)", '{ path: base + "/" + id }'],
    ["function call in a field value", "{ path: resolve(x) }"],
    ["`?` propagation operator", "{ body: read(p)? }"],
    ["`${...}` string interpolation", "{ note: `at ${id}` }"],
    ["nested array whose leaves are expressions", '{ items: [base, id + "1"] }'],
    ["nested object whose leaves are expressions", "{ nested: { key: resolve(x) } }"],
    // The exact example from RFC 0002 §Summary.
    ["the RFC 0002 example", '{ path: base + "/findings/" + id + ".md" }'],
  ];

  for (const [label, argumentSource] of ACCEPTED) {
    it(`accepts ${label}: no tool-arg-not-literal, no schema-conflict`, () => {
      const diags = checkToolCallArguments(
        argSite({ toolName: "read", calleeKind: "pi-tool", positionalCount: 1, argumentSource }),
      );
      expect(
        withCode(diags, "theta/parse/tool-arg-not-literal"),
        `tool-arg-not-literal must not fire for ${argumentSource}`,
      ).toBeUndefined();
      expect(
        withCode(diags, "theta/parse/tool-arg-schema-conflict"),
        `no provable disjointness for ${argumentSource}`,
      ).toBeUndefined();
    });
  }
});

// --- RFC 0002 behavior 2 — the bare-object *shape* rule is still enforced -----

describe("RFC 0002 behavior 2 — the Pi-tool argument shape rule survives the retirement", () => {
  it("theta/parse/tool-arg-arity: a multi-argument Pi-tool call `read({...}, {...})` is still rejected", () => {
    const diags = checkToolCallArguments(
      argSite({ toolName: "read", calleeKind: "pi-tool", positionalCount: 2 }),
    );
    const d = withCode(diags, "theta/parse/tool-arg-arity");
    expect(d, "tool-arg-arity remains live for Pi-tool calls").toBeDefined();
    expect(d?.message).toBe("Pi tool 'read' takes a single object argument; got 2");
  });

  it("a whole let-bound object `read(args)` (not an inline bare object literal) is still rejected", () => {
    // RFC 0002 keeps the bare-object *shape* rule: the argument must be an
    // inline `{ ... }` literal so the tool's registered input schema supplies
    // the field names. A bare identifier does not satisfy `ToolArg`. The
    // specific code changed with the RFC (tool-arg-not-literal retired), so this
    // asserts the shape rejection remains an error, and that it is NOT the
    // retired code.
    const diags = checkToolCallArguments(
      argSite({ toolName: "read", calleeKind: "pi-tool", positionalCount: 1, argumentSource: "args" }),
    );
    expect(
      diags.some((d) => d.severity === "error"),
      "read(args) shape rejection remains an error at the Pi-tool call site",
    ).toBe(true);
    expect(
      withCode(diags, "theta/parse/tool-arg-not-literal"),
      "the shape rejection is not the retired tool-arg-not-literal code",
    ).toBeUndefined();
    // Finding #2: the shape rejection uses the dedicated
    // `theta/parse/tool-arg-not-object-literal` code whose message names the
    // actual violation — inline the object literal — rather than the misdirecting
    // `theta/parse/bare-object-literal` "name the schema (Schema { ... })"
    // remedy, which is wrong here (the tool's registered input schema already
    // supplies the shape).
    const shape = withCode(diags, "theta/parse/tool-arg-not-object-literal");
    expect(shape, "the shape rejection uses the dedicated tool-arg shape code").toBeDefined();
    expect(shape?.severity).toBe("error");
    expect(shape?.message).toBe(
      "Pi tool 'read' argument must be written inline as a bare object literal { ... }; a let-bound value cannot supply the field shape",
    );
    // It must NOT reuse the misdirecting bare-object-literal remedy.
    expect(
      withCode(diags, "theta/parse/bare-object-literal"),
      "the shape rejection is not the misdirecting bare-object-literal code",
    ).toBeUndefined();
    expect(shape?.message, "the message does not tell the author to name a schema").not.toContain(
      "name the schema",
    );
  });
});

// --- RFC 0002 behavior 6 — provable-disjointness parse-time diagnostic --------

describe("RFC 0002 behavior 6 — theta/parse/tool-arg-schema-conflict (provable disjointness only)", () => {
  it("fires (error) when a field expression's static type is provably disjoint from the schema field type", () => {
    // A `number`-typed expression passed to a `string`-typed schema field: the
    // accepted-value sets are disjoint under the schema subset, so the runtime
    // AJV check is certain to reject — the parser front-runs it (sound).
    const input: SchemaAwareToolCallArgCheckInput = {
      file: FILE,
      range: span(),
      toolName: "read",
      calleeKind: "pi-tool",
      positionalCount: 1,
      argumentSource: "{ path: 42 }",
      schemaConflict: { field: "path", provablyDisjoint: true, expected: "string", actual: "number" },
    };
    const diags = checkToolCallArguments(input);
    const d = withCode(diags, "theta/parse/tool-arg-schema-conflict");
    expect(d, "provable disjointness fires the parse-time error").toBeDefined();
    expect(d?.severity).toBe("error");
    // Message template from code-registry-parse.md.
    expect(d?.message).toBe(
      "Pi tool 'read' argument field 'path' type is provably disjoint from the input schema: expected string, got number",
    );
  });

  it("does NOT fire when disjointness is not provable (falls through to the runtime AJV check)", () => {
    // The subset cannot prove disjointness (e.g. a union with a satisfiable arm,
    // or a value the subset cannot represent). RFC 0002 mandates this MUST fall
    // through to the runtime AJV `Err(CodeToolError { cause: "validation" })`
    // path rather than erroring at parse time — the check never rejects a
    // program AJV would accept.
    const input: SchemaAwareToolCallArgCheckInput = {
      file: FILE,
      range: span(),
      toolName: "read",
      calleeKind: "pi-tool",
      positionalCount: 1,
      argumentSource: "{ path: maybe }",
      schemaConflict: { field: "path", provablyDisjoint: false, expected: "string", actual: "string | number" },
    };
    const diags = checkToolCallArguments(input);
    expect(
      withCode(diags, "theta/parse/tool-arg-schema-conflict"),
      "an unprovable mismatch is not a parse error",
    ).toBeUndefined();
  });
});

// --- RFC 0002 behavior 7 — runtime validation surface (CodeToolError) --------

describe("RFC 0002 behavior 7 — runtime validation surfaces as Err(CodeToolError { cause: 'validation' })", () => {
  // The generic AJV type-check for code-side arguments is delegated to Pi's
  // tool runtime (`PiToolDispatch` carries no input schema); the theta-observable
  // code-side `cause: "validation"` surface is the pre-dispatch ceiling-#4 check.
  // A value that is wrong only at runtime (here, over-deep — not provably
  // disjoint at parse time) surfaces on exactly the runtime validation path that
  // behavior 6's unprovable arm falls through to, and the tool is not dispatched.
  it("a runtime-only-wrong argument surfaces validation Err (kind code_tool, cause validation)", () => {
    const breach = enforceCodeToolArgDepth("read", { a: { b: { c: { d: { e: 1 } } } } });
    expect(breach, "a depth-6 argument trips the runtime validation surface").toBeDefined();
    expect(breach?.error.kind).toBe("code_tool");
    expect(breach?.error.cause).toBe("validation");
    expect(breach?.result.ok, "surfaces as Err(CodeToolError)").toBe(false);
  });

  it("a within-cap argument does not front-run at this boundary (defers to the downstream AJV check)", () => {
    const ok = enforceCodeToolArgDepth("read", { a: { b: { c: { d: 1 } } } });
    expect(ok, "a within-cap argument defers to the runtime AJV boundary").toBeUndefined();
  });
});

// --- CodeToolError closed enum + distinctness from ModelToolError ----------

// cka-13 / V14a: the TOOL code-keyed obligation area (tool-calls.md) closes across
// V14a (this code-side call + CodeToolError + return-type table), V14b, V14c,
// V14e; the assertions in this file witness the V14a facet against the shipped
// code-side tool-call machinery.
describe("CodeToolError (tool-calls.md TOOL code-keyed area; queryerror-variants.md)", () => {
  it("CodeToolError.cause is closed at validation / execution / cancelled / unknown_tool", () => {
    expect(codeToolErrorCauses()).toEqual([
      "validation",
      "execution",
      "cancelled",
      "unknown_tool",
    ]);
  });

  it("CodeToolError is distinct from ModelToolError (different `kind` wire tags)", () => {
    expect(codeToolErrorKind()).toBe("code_tool");
    expect(modelToolErrorKind()).toBe("model_tool");
    expect(codeToolErrorKind()).not.toBe(modelToolErrorKind());
  });
});

// --- Accepted-path return lowering (Pi tool → Ok(string); `.theta` → Ok(T)) --

describe("accepted-path return lowering (tool-calls.md §Return type)", () => {
  it("a conforming Pi-tool return lowers to Ok(string) carrying the final output", () => {
    const result: ResultValue = lowerAcceptedPiToolReturn("file contents\nsecond line");
    expect(result.ok, "Pi-tool accepted path is Ok").toBe(true);
    if (result.ok) {
      expect(result.value).toBe("file contents\nsecond line");
    }
  });

  it("a conforming subagent-mode `.theta` return lowers to Ok(T) carrying the payload", () => {
    // The callee's inferred return type `T` — here a structured object payload.
    const payload = { severity: "high", label: "bug" };
    const result: ResultValue = lowerAcceptedThetaCallableReturn(payload);
    expect(result.ok, "`.theta`-callable accepted path is Ok").toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(payload);
    }
  });
});

// --- `.theta`-callable failure surface (Invoke*Error, never CodeToolError) ---

describe("`.theta`-callable failure surface (tool-calls.md §Failures)", () => {
  it("an input-validation failure surfaces as InvokeInfraError { cause: 'validation' }", () => {
    const err = surfaceThetaCallableInputValidationFailure(
      "./summariser.theta",
      "params failed input-schema validation",
    );
    expect(err.kind, "input-validation surfaces via InvokeInfraError").toBe("invoke_infra");
    expect(err.cause).toBe("validation");
    expect(err.callee_path).toBe("./summariser.theta");
    // Never a CodeToolError — the `.theta`-callable arm uses the invoke surface.
    expect(err.kind).not.toBe("code_tool");
  });

  it("a callee-returned failure surfaces as InvokeCalleeError carrying the inner error", () => {
    const inner: CancelledError = { kind: "cancelled", message: "aborted" };
    const err = surfaceThetaCallableCalleeFailure("./triage.theta", inner, "callee failed");
    expect(err.kind, "callee failure surfaces via InvokeCalleeError").toBe("invoke_callee");
    expect(err.callee_path).toBe("./triage.theta");
    expect(err.inner).toEqual(inner);
    expect(err.kind).not.toBe("code_tool");
  });
});
