// V12b-T — failing tests for the paired `V12b` top-level `Err`-note renderer:
// SLSH-3 (one-line render at the slash-dispatch boundary, sole subagent-mode
// surface), SLSH-4 (the per-kind SNK-a … SNK-k templates, rendered verbatim,
// total over any unlisted `kind`), and SLSH-5 (chain attribution — one
// ` from <callee_path> invoked at <parent_path>:<line>` suffix per
// `invoke_callee` hop, leaf-first, the leaf `kind` driving the per-kind text).
//
// Spec: slash-invocation.md SLSH-3 / SLSH-4 (SNK-a…SNK-k) / SLSH-5;
// errors-and-results/queryerror-variants.md (the nine-variant union). The SLSH-4
// backtick-in-cell markdown formatting is stripped from the emitted string, and
// the SLSH-5 worked examples show the intended backtick-free output — the
// expected strings below carry no backticks and use the em-dash U+2014 the
// templates specify.
//
// Every test reds on its own primary string-equality assertion while `V12b` is
// absent, because the `err-note-render.ts` seam stub returns a fixed sentinel
// (`<err-note-render unimplemented>`) that is neither an SNK template nor a
// chain suffix. No test reds on a compile error, a missing fixture, or a harness
// throw.

import { describe, expect, it } from "vitest";
import {
  renderLeafKindNote,
  renderTopLevelErrNote,
  type ChainHop,
} from "../src/runtime/err-note-render";
import type {
  CancelledError,
  CodeToolError,
  ContextOverflowError,
  InvokeCalleeError,
  InvokeInfraError,
  ModelToolError,
  QueryError,
  ToolLoopExhaustedError,
  TransportError,
  ValidationError,
} from "../src/runtime/query-error";
import type { InvocationRecord } from "../src/runtime/invoke-provenance";

const DASH = "\u2014"; // em-dash, the SLSH-4 template separator.

// --- Leaf `QueryError` factories (all required fields present) --------------

function validation(cause: ValidationError["cause"], attempts: number): ValidationError {
  return {
    kind: "validation",
    cause,
    message: "schema rejected",
    attempts,
    validation_errors: [],
    raw_response: null,
  };
}

function transport(message: string): TransportError {
  return {
    kind: "transport",
    message,
    http_status: null,
    provider: "anthropic-messages",
    retryable: true,
  };
}

function modelTool(tool_name: string, message: string): ModelToolError {
  return {
    kind: "model_tool",
    message,
    tool_name,
    tool_call_id: "toolu_1",
    raw_response: null,
  };
}

function contextOverflow(): ContextOverflowError {
  return {
    kind: "context_overflow",
    message: "over the limit",
    tokens_used: null,
    tokens_limit: null,
    raw_response: null,
  };
}

function cancelled(): CancelledError {
  return { kind: "cancelled", message: "aborted" };
}

function codeTool(
  tool_name: string,
  cause: CodeToolError["cause"],
  message: string,
): CodeToolError {
  return { kind: "code_tool", message, tool_name, cause };
}

function toolLoopExhausted(
  rounds: number,
  last_tool_name: string | null,
): ToolLoopExhaustedError {
  return {
    kind: "tool_loop_exhausted",
    message: "gave up",
    rounds,
    last_tool_name,
    raw_response: null,
  };
}

function invokeInfra(
  callee_path: string,
  cause: InvokeInfraError["cause"],
): InvokeInfraError {
  return { kind: "invoke_infra", message: "infra failed", callee_path, cause };
}

/** A catch-all leaf: a `kind` outside the nine theta 1.0.0 tags (ERR-15 openness). */
function unlistedKind(kind: string, message: string): QueryError {
  // `kind` is typed `string` (ERR-15), so a `{ kind, message }` shape satisfies
  // the union structurally (matching `CancelledError`'s field set) with an
  // unlisted tag — the SNK-k catch-all input.
  return { kind, message } as QueryError;
}

function calleeWrap(callee_path: string, inner: QueryError): InvokeCalleeError {
  return { kind: "invoke_callee", message: "callee returned Err", callee_path, inner };
}

function record(parentPath: string, callSiteLine: number): InvocationRecord {
  return { parentPath, callSiteLine };
}

function hop(calleePath: string, parentPath: string, callSiteLine: number): ChainHop {
  return { calleePath, record: record(parentPath, callSiteLine) };
}

/** Render a leaf error at the boundary with no chain (the SLSH-3 non-cascade path). */
function boundary(name: string, error: QueryError): string {
  return renderTopLevelErrNote({ thetaName: name, error, chain: [] });
}

// ===========================================================================
// SLSH-3 — one line at the slash-dispatch boundary.
// ===========================================================================

describe("V12b-T — SLSH-3 top-level Err at the slash-dispatch boundary", () => {
  it("SLSH-3: a top-level Err renders exactly one line (the sole subagent-mode surface)", () => {
    // SLSH-3: for a directly-slash-invoked subagent-mode theta this single line
    // is the ONLY user-facing surface for the failure — the renderer returns one
    // string, and it summarises the failure category, never dumping the full
    // QueryError JSON.
    const note = boundary("demo", transport("connection reset"));

    // Primary assertion: the rendered summary is the SNK-c one-liner, not the
    // stub sentinel and not a multi-line JSON dump.
    expect(note).toBe(`theta /demo returned Err: transport ${DASH} connection reset`);
    // One line: no embedded newline (a single system-note line, SLSH-3).
    expect(note.split("\n")).toHaveLength(1);
    // Never the raw JSON dump: the literal QueryError fields are not spilled.
    expect(note).not.toContain("http_status");
    expect(note).not.toContain("{");
  });
});

// ===========================================================================
// SLSH-4 / SNK-a … SNK-k — per-kind templates, rendered verbatim.
// ===========================================================================

describe("V12b-T — SLSH-4 per-kind note templates (SNK-a…SNK-k)", () => {
  it("SLSH-4 / SNK-a: validation (schema_validation) renders the respond-repair-attempts template verbatim", () => {
    const err = validation("schema_validation", 3);
    const expected = "theta /demo returned Err: model failed schema after 3 respond-repair attempts";
    // Both the isolated per-kind renderer and the boundary surface render it.
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-b: validation (empty_template) renders the empty-template template verbatim", () => {
    const err = validation("empty_template", 0);
    const expected = `theta /demo returned Err: rendered query template was empty ${DASH} no provider turn was issued`;
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-c: transport renders the transport template verbatim", () => {
    const err = transport("connection reset");
    const expected = `theta /demo returned Err: transport ${DASH} connection reset`;
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-d: model_tool renders the tool-failed template verbatim", () => {
    const err = modelTool("search", "bad arg");
    const expected = `theta /demo returned Err: tool search failed ${DASH} bad arg`;
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-e: context_overflow renders the context-overflow template verbatim", () => {
    const err = contextOverflow();
    const expected = "theta /demo returned Err: context overflow";
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-f: cancelled renders the cancelled template verbatim", () => {
    const err = cancelled();
    const expected = "theta /demo cancelled";
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-g: code_tool renders the code-tool-call-failed template verbatim (with cause)", () => {
    const err = codeTool("fmt", "execution", "threw");
    const expected = `theta /demo returned Err: tool fmt call failed (execution) ${DASH} threw`;
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-h: tool_loop_exhausted renders the exhaustion template verbatim", () => {
    const err = toolLoopExhausted(5, "grep");
    const expected = "theta /demo returned Err: tool-call loop exhausted after 5 rounds (last tool: grep)";
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-h: tool_loop_exhausted renders null when last_tool_name is null", () => {
    // SLSH-4: <last_tool_name> renders through summariseErrorField like any
    // other field, including its null case (`String(null) === "null"`) —
    // reachable when a cap-0 untyped query exhausts before any tool call
    // exists to name (bug 0308).
    const err = toolLoopExhausted(2, null);
    const expected = "theta /demo returned Err: tool-call loop exhausted after 2 rounds (last tool: null)";
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-i: invoke_infra renders the invoke-failed template verbatim (with cause)", () => {
    const err = invokeInfra("/abs/c.theta", "load_failure");
    const expected = "theta /demo returned Err: invoke of /abs/c.theta failed (load_failure)";
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-k: the catch-all renders verbatim and the renderer is total over any unlisted kind", () => {
    // SNK-k catch-all: an unlisted `kind` (ERR-15 discriminator openness) renders
    // `<kind> — <message>`; the renderer is total — it produces defined output
    // and never throws for any well-formed QueryError with an unlisted tag.
    const err = unlistedKind("binder", "boom");
    const expected = `theta /demo returned Err: binder ${DASH} boom`;
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
    // Totality over a second arbitrary unlisted kind — no throw, catch-all form.
    expect(() => boundary("demo", unlistedKind("future_variant", "x"))).not.toThrow();
    expect(boundary("demo", unlistedKind("future_variant", "x"))).toBe(
      `theta /demo returned Err: future_variant ${DASH} x`,
    );
  });
});

// ===========================================================================
// SLSH-5 — chain attribution.
// ===========================================================================

describe("V12b-T — SLSH-5 chain attribution", () => {
  it("SLSH-5: a single invoke_callee hop appends one ` from <callee> invoked at <parent>:<line>` suffix (leaf kind drives the row)", () => {
    // A `transport` failure inside child.theta cascaded out of parent.theta at the
    // `invoke(` token on line 42 (SLSH-5 worked example — single-hop).
    const err = calleeWrap("/abs/path/to/child.theta", transport("connection reset"));
    const chain = [hop("/abs/path/to/child.theta", "/abs/path/to/parent.theta", 42)];
    expect(renderTopLevelErrNote({ thetaName: "entry", error: err, chain })).toBe(
      `theta /entry returned Err: transport ${DASH} connection reset` +
        " from /abs/path/to/child.theta invoked at /abs/path/to/parent.theta:42",
    );
  });

  it("SLSH-5: a .theta-callable bare-identifier parent renders the identical suffix (line from the callee-name identifier)", () => {
    // A `transport` failure inside a `.theta` callable registered as `summarise`
    // (resolving to ./summariser.theta), called by `summarise(doc)` on line 18 of
    // parent.theta (SLSH-5 worked example — .theta-callable parent). The suffix is
    // identical to the literal invoke(...) form; the provenance line is consumed
    // from V15g's record (the callee-name identifier's line), not derived here.
    const err = calleeWrap("/abs/path/to/summariser.theta", transport("connection reset"));
    const chain = [hop("/abs/path/to/summariser.theta", "/abs/path/to/parent.theta", 18)];
    expect(renderTopLevelErrNote({ thetaName: "entry", error: err, chain })).toBe(
      `theta /entry returned Err: transport ${DASH} connection reset` +
        " from /abs/path/to/summariser.theta invoked at /abs/path/to/parent.theta:18",
    );
  });

  it("SLSH-5: a three-level cascade renders both hops leaf-first, single-space-separated, with the leaf kind driving the row", () => {
    // A cascade grandchild → child → parent whose leaf is `model_tool` (SLSH-5
    // worked example — multi-hop three-level). Leaf-first: the innermost hop
    // (grandchild invoked at child:7) precedes the outer hop (child invoked at
    // parent:42).
    const leaf = modelTool("foo", "bad arg");
    const err = calleeWrap("/abs/child.theta", calleeWrap("/abs/grandchild.theta", leaf));
    // Chain in OUTER-to-inner encounter order (matching the nesting walk).
    const chain = [
      hop("/abs/child.theta", "/abs/parent.theta", 42),
      hop("/abs/grandchild.theta", "/abs/child.theta", 7),
    ];
    const note = renderTopLevelErrNote({ thetaName: "entry", error: err, chain });
    expect(note).toBe(
      `theta /entry returned Err: tool foo failed ${DASH} bad arg` +
        " from /abs/grandchild.theta invoked at /abs/child.theta:7" +
        " from /abs/child.theta invoked at /abs/parent.theta:42",
    );
    // Leaf-first ordering: the innermost hop's suffix precedes the outer hop's.
    expect(note.indexOf("invoked at /abs/child.theta:7")).toBeLessThan(
      note.indexOf("invoked at /abs/parent.theta:42"),
    );
    // The leaf `kind` (model_tool), not the invoke_callee wrapper, drives the row.
    expect(note).toContain(`tool foo failed ${DASH} bad arg`);
    expect(note).not.toContain("callee returned Err");
  });

  it("SLSH-5: the chain suffix appends to the catch-all row too (unlisted leaf kind)", () => {
    // SLSH-5 worked example — catch-all interaction: the catch-all row renders
    // first (`<kind> — <message>` with leaf values), then the chain suffix
    // appends in the same form.
    const err = calleeWrap("/abs/c.theta", unlistedKind("binder", "boom"));
    const chain = [hop("/abs/c.theta", "/abs/p.theta", 9)];
    expect(renderTopLevelErrNote({ thetaName: "entry", error: err, chain })).toBe(
      `theta /entry returned Err: binder ${DASH} boom` +
        " from /abs/c.theta invoked at /abs/p.theta:9",
    );
  });
});

// ===========================================================================
// Bug 0177 — non-string `QueryError` payload fields at the interpolating SNK
// rows. ADDITIVE: none of the 16 cells above is edited, re-pinned or deleted.
//
// Spec: docs/bugs/0177-err-note-render-string-coercion-on-record-error-fields.md
// §Fix (a) (the eight positions), §Fix (b) (the rendering rule),
// §Fix (c) constraint 1 (no change for a string-valued field),
// §Fix (d) (this witness), §Reproduction (b) (the measured rows).
//
// The settled rule ("the law"): every position that embeds a `QueryError`
// payload field in a user-facing string renders that field through one total,
// prototype-blind summariser — never bare template substitution, never
// `String(...)`:
//   1. a string renders verbatim (no quoting, truncation or escaping);
//   2. a number / boolean / bigint / undefined / null renders as
//      `String(value)` (`null` -> `null`);
//   3. an enum value (a boxed `String`) renders as its bare wire string;
//   4. any other object or array renders as compact `JSON.stringify` (QRY-18,
//      `docs/spec_topics/query/query-escapes-stringification.md:16`, `:27`;
//      `summariseScrutinee`, `src/runtime/match-result.ts:88`);
//   5. except that when (4) cannot produce a bounded finite string —
//      `JSON.stringify` throws (a cycle) or returns `undefined`, or the output
//      exceeds a 200-character cap — the value renders as
//      `summariseNonResultOperand`'s capped descriptor instead
//      (`src/runtime/runtime-panics.ts:440`).
//
// At HEAD every cell below reds for one of the two measured reasons: a
// plain-prototype record substitutes as `[object Object]`
// (`renderLeafKindNote`'s seven interpolating rows — SNK-a, SNK-c, SNK-d,
// SNK-g, SNK-h, SNK-i, SNK-k, all in `err-note-render.ts`), and a null-prototype
// record — the shape `rebuildInbound` mints since bug 0173
// (`src/runtime/wire-translation.ts:370`) — raises
// `TypeError: Cannot convert object to primitive value` from inside the
// renderer. The cells assert the rendered string under the law, not merely
// `not.toThrow()` (§Fix (d)).
//
// These cells import nothing that does not exist at HEAD: the new summariser
// module `src/runtime/err-field-summary.ts` is the implementer's to add, so
// every assertion here runs through the shipped public entry points
// `renderLeafKindNote` and `renderTopLevelErrNote`, both declared in
// `err-note-render.ts`.

/** The one-own-key record every §Reproduction (b) row places at a field. */
function plainRec(): Record<string, unknown> {
  return { n: "x" };
}

/**
 * Its null-prototype twin — the shape `rebuildInbound` builds with
 * `Object.create(null)` (`src/runtime/wire-translation.ts:370`, bug 0173's
 * §Fix (a)) and that a typed `invoke<T>` return binds into theta code
 * (§Reproduction (d)).
 */
function nullProtoRec(): Record<string, unknown> {
  const o = Object.create(null) as Record<string, unknown>;
  o.n = "x";
  return o;
}

/** Law rule 4's rendering of both records above: compact `JSON.stringify`. */
const REC_JSON = '{"n":"x"}';

/** Both prototypes, driven through every row (§Reproduction (b), (a)). */
const PROTOS: readonly (readonly [string, () => Record<string, unknown>])[] = [
  ["plain-prototype", plainRec],
  ["null-prototype", nullProtoRec],
];

/** Build an arbitrary leaf shape as a `QueryError` (ERR-15 openness). */
function leafOf(fields: Record<string, unknown>): QueryError {
  return fields as unknown as QueryError;
}

describe("bug 0177 — a record at an interpolating SNK field renders through the summariser", () => {
  for (const [proto, mk] of PROTOS) {
    it(`SNK-k: a record at 'kind' renders as compact JSON, not [object Object] and not a throw — ${proto}`, () => {
      // §Reproduction (b) rows 1-2: plain renders
      // `theta /t returned Err: [object Object] — m`; null-prototype throws.
      // SNK-k's return sits in `err-note-render.ts`'s `default:` arm.
      expect(renderLeafKindNote("t", leafOf({ kind: mk(), message: "m" }))).toBe(
        `theta /t returned Err: ${REC_JSON} ${DASH} m`,
      );
    });

    it(`SNK-k: a record at 'message' renders as compact JSON — ${proto}`, () => {
      // §Reproduction (b) row 3. Same template, second placeholder
      // (`err-note-render.ts`).
      expect(renderLeafKindNote("t", leafOf({ kind: "weird", message: mk() }))).toBe(
        `theta /t returned Err: weird ${DASH} ${REC_JSON}`,
      );
    });

    it(`SNK-c: a record at transport 'message' renders as compact JSON — ${proto}`, () => {
      // §Reproduction (b) row 4; the row's return is in `err-note-render.ts`.
      expect(renderLeafKindNote("t", leafOf({ kind: "transport", message: mk() }))).toBe(
        `theta /t returned Err: transport ${DASH} ${REC_JSON}`,
      );
    });

    it(`SNK-d: a record at model_tool 'tool_name' renders as compact JSON — ${proto}`, () => {
      // §Reproduction (b) row 5; the row's return is in `err-note-render.ts`.
      expect(
        renderLeafKindNote("t", leafOf({ kind: "model_tool", tool_name: mk(), message: "m" })),
      ).toBe(`theta /t returned Err: tool ${REC_JSON} failed ${DASH} m`);
    });

    it(`SNK-g: a record at code_tool 'cause' renders as compact JSON — ${proto}`, () => {
      // §Reproduction (b) row 6; the row's return is in `err-note-render.ts`.
      expect(
        renderLeafKindNote(
          "t",
          leafOf({ kind: "code_tool", tool_name: "x", cause: mk(), message: "m" }),
        ),
      ).toBe(`theta /t returned Err: tool x call failed (${REC_JSON}) ${DASH} m`);
    });

    it(`SNK-i: a record at invoke_infra 'callee_path' renders as compact JSON — ${proto}`, () => {
      // §Reproduction (b) row 7; the row's return is in `err-note-render.ts`.
      expect(
        renderLeafKindNote("t", leafOf({ kind: "invoke_infra", callee_path: mk(), cause: "c" })),
      ).toBe(`theta /t returned Err: invoke of ${REC_JSON} failed (c)`);
    });

    it(`SNK-a: a record at validation 'attempts' renders as compact JSON — ${proto}`, () => {
      // §Reproduction (b) row 8; the row's return is in `err-note-render.ts`.
      expect(
        renderLeafKindNote(
          "t",
          leafOf({ kind: "validation", cause: "schema_validation", attempts: mk() }),
        ),
      ).toBe(`theta /t returned Err: model failed schema after ${REC_JSON} respond-repair attempts`);
    });

    it(`SNK-h: records at 'rounds' and at 'last_tool_name' render as compact JSON — ${proto}`, () => {
      // §Reproduction (b) row 9 measures `rounds`; `last_tool_name: null` routes
      // through `summariseErrorField` directly (bug 0308) and renders `null`.
      // Both sit in `err-note-render.ts`'s `tool_loop_exhausted` case.
      expect(
        renderLeafKindNote(
          "t",
          leafOf({ kind: "tool_loop_exhausted", rounds: mk(), last_tool_name: null }),
        ),
      ).toBe(
        `theta /t returned Err: tool-call loop exhausted after ${REC_JSON} rounds (last tool: null)`,
      );
      expect(
        renderLeafKindNote(
          "t",
          leafOf({ kind: "tool_loop_exhausted", rounds: 2, last_tool_name: mk() }),
        ),
      ).toBe(
        `theta /t returned Err: tool-call loop exhausted after 2 rounds (last tool: ${REC_JSON})`,
      );
    });

    it(`SLSH-3: renderTopLevelErrNote over a direct leaf with a record 'kind' renders as compact JSON — ${proto}`, () => {
      // §Reproduction (b), first `renderTopLevelErrNote` row: the boundary entry
      // point, `renderTopLevelErrNote` in `err-note-render.ts`, reaches the
      // same coercion.
      expect(
        renderTopLevelErrNote({
          thetaName: "t",
          error: leafOf({ kind: mk(), message: "m" }),
          chain: [],
        }),
      ).toBe(`theta /t returned Err: ${REC_JSON} ${DASH} m`);
    });

    it(`SLSH-5: an invoke_callee wrapper is not a shield — the walked-to leaf's record 'kind' renders as compact JSON — ${proto}`, () => {
      // §Reproduction (b), second `renderTopLevelErrNote` row: the wrapper walk
      // (`renderTopLevelErrNote`'s `while` loop, `err-note-render.ts`) reaches
      // the leaf before the row renders.
      expect(
        renderTopLevelErrNote({
          thetaName: "t",
          error: calleeWrap("./k.theta", leafOf({ kind: mk(), message: "m" })),
          chain: [],
        }),
      ).toBe(`theta /t returned Err: ${REC_JSON} ${DASH} m`);
    });
  }

  it("SNK-e / SNK-f: the two non-interpolating rows are unaffected by a record at 'message'", () => {
    // §Reproduction (b), last two rows, and §Reproduction (g): SNK-e
    // (`err-note-render.ts`) and SNK-f interpolate no
    // payload field, so no value in one can perturb them. Green at HEAD and
    // green after the fix — the controls that show the defect is the
    // interpolation, not the dispatch.
    for (const [, mk] of PROTOS) {
      expect(renderLeafKindNote("t", leafOf({ kind: "context_overflow", message: mk() }))).toBe(
        "theta /t returned Err: context overflow",
      );
      expect(renderLeafKindNote("t", leafOf({ kind: "cancelled", message: mk() }))).toBe(
        "theta /t cancelled",
      );
    }
  });

  it("constraint 1: every string- and number-valued field still renders byte-identically", () => {
    // §Fix (c) constraint 1 / law rules 1-2: the summariser returns a string
    // unchanged (no quoting, truncation or escaping) and a number as
    // `String(value)`, so GOV-15 observable (c)
    // (`docs/spec_topics/governance/source-language-stability.md:5`) moves only
    // for the inputs that render `[object Object]` or throw at HEAD. Green at
    // HEAD and green after the fix.
    expect(renderLeafKindNote("demo", validation("schema_validation", 3))).toBe(
      "theta /demo returned Err: model failed schema after 3 respond-repair attempts",
    );
    expect(renderLeafKindNote("demo", validation("empty_template", 0))).toBe(
      `theta /demo returned Err: rendered query template was empty ${DASH} no provider turn was issued`,
    );
    expect(renderLeafKindNote("demo", transport("connection reset"))).toBe(
      `theta /demo returned Err: transport ${DASH} connection reset`,
    );
    expect(renderLeafKindNote("demo", modelTool("search", "bad arg"))).toBe(
      `theta /demo returned Err: tool search failed ${DASH} bad arg`,
    );
    expect(renderLeafKindNote("demo", contextOverflow())).toBe(
      "theta /demo returned Err: context overflow",
    );
    expect(renderLeafKindNote("demo", cancelled())).toBe("theta /demo cancelled");
    expect(renderLeafKindNote("demo", codeTool("fmt", "execution", "threw"))).toBe(
      `theta /demo returned Err: tool fmt call failed (execution) ${DASH} threw`,
    );
    expect(renderLeafKindNote("demo", toolLoopExhausted(5, "grep"))).toBe(
      "theta /demo returned Err: tool-call loop exhausted after 5 rounds (last tool: grep)",
    );
    expect(renderLeafKindNote("demo", toolLoopExhausted(2, null))).toBe(
      "theta /demo returned Err: tool-call loop exhausted after 2 rounds (last tool: null)",
    );
    expect(renderLeafKindNote("demo", invokeInfra("/abs/c.theta", "load_failure"))).toBe(
      "theta /demo returned Err: invoke of /abs/c.theta failed (load_failure)",
    );
    expect(renderLeafKindNote("demo", unlistedKind("binder", "boom"))).toBe(
      `theta /demo returned Err: binder ${DASH} boom`,
    );
    // A string field is rendered verbatim — never JSON-quoted (law rule 1).
    expect(renderLeafKindNote("demo", transport('he said "hi"'))).toBe(
      `theta /demo returned Err: transport ${DASH} he said "hi"`,
    );
  });

  it("law rule 5: a cycle-carrying record renders the capped descriptor and does not throw", () => {
    // §Fix (b) candidate 1's stated cost — "`JSON.stringify` throws on a cycle
    // — which the summariser must then handle, or the fix reintroduces the
    // throw it removes on a different input". Law rule 5 falls back to
    // `summariseNonResultOperand`'s descriptor
    // (`src/runtime/runtime-panics.ts:440`, its capped own-key list at `:461`).
    for (const [, mk] of PROTOS) {
      const cyc = mk();
      cyc.self = cyc;
      expect(renderLeafKindNote("t", leafOf({ kind: cyc, message: "m" }))).toBe(
        `theta /t returned Err: an object with keys n, self ${DASH} m`,
      );
    }
  });

  it("law rule 5: a record whose compact JSON exceeds the 200-character cap renders the capped descriptor", () => {
    // §Fix (b) candidate 1's other stated cost — unbounded output length — and
    // §Fix (c) constraint 1's requirement that the cap "must not apply to
    // strings that render today" (the constraint-1 cell above pins that half).
    for (const [, mk] of PROTOS) {
      const big = mk();
      delete big.n;
      big.a = "x".repeat(150);
      big.b = "y".repeat(150);
      expect(JSON.stringify(big).length).toBeGreaterThan(200);
      expect(renderLeafKindNote("t", leafOf({ kind: big, message: "m" }))).toBe(
        `theta /t returned Err: an object with keys a, b ${DASH} m`,
      );
    }
  });
});
