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

/** A catch-all leaf: a `kind` outside the nine loom 1.0.0 tags (ERR-15 openness). */
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
  return renderTopLevelErrNote({ loomName: name, error, chain: [] });
}

// ===========================================================================
// SLSH-3 — one line at the slash-dispatch boundary.
// ===========================================================================

describe("V12b-T — SLSH-3 top-level Err at the slash-dispatch boundary", () => {
  it("SLSH-3: a top-level Err renders exactly one line (the sole subagent-mode surface)", () => {
    // SLSH-3: for a directly-slash-invoked subagent-mode loom this single line
    // is the ONLY user-facing surface for the failure — the renderer returns one
    // string, and it summarises the failure category, never dumping the full
    // QueryError JSON.
    const note = boundary("demo", transport("connection reset"));

    // Primary assertion: the rendered summary is the SNK-c one-liner, not the
    // stub sentinel and not a multi-line JSON dump.
    expect(note).toBe(`loom /demo returned Err: transport ${DASH} connection reset`);
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
    const expected = "loom /demo returned Err: model failed schema after 3 respond-repair attempts";
    // Both the isolated per-kind renderer and the boundary surface render it.
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-b: validation (empty_template) renders the empty-template template verbatim", () => {
    const err = validation("empty_template", 0);
    const expected = `loom /demo returned Err: rendered query template was empty ${DASH} no provider turn was issued`;
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-c: transport renders the transport template verbatim", () => {
    const err = transport("connection reset");
    const expected = `loom /demo returned Err: transport ${DASH} connection reset`;
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-d: model_tool renders the tool-failed template verbatim", () => {
    const err = modelTool("search", "bad arg");
    const expected = `loom /demo returned Err: tool search failed ${DASH} bad arg`;
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-e: context_overflow renders the context-overflow template verbatim", () => {
    const err = contextOverflow();
    const expected = "loom /demo returned Err: context overflow";
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-f: cancelled renders the cancelled template verbatim", () => {
    const err = cancelled();
    const expected = "loom /demo cancelled";
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-g: code_tool renders the code-tool-call-failed template verbatim (with cause)", () => {
    const err = codeTool("fmt", "execution", "threw");
    const expected = `loom /demo returned Err: tool fmt call failed (execution) ${DASH} threw`;
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-h: tool_loop_exhausted renders the exhaustion template verbatim", () => {
    const err = toolLoopExhausted(5, "grep");
    const expected = "loom /demo returned Err: tool-call loop exhausted after 5 rounds (last tool: grep)";
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-h: tool_loop_exhausted renders the literal 'respond' when last_tool_name is null", () => {
    // SLSH-4: <last_tool_name> is rendered as the literal string `respond` when
    // last_tool_name is null (a defensive rendering with no loom 1.0-reachable
    // case, retained for forward compatibility).
    const err = toolLoopExhausted(2, null);
    const expected = "loom /demo returned Err: tool-call loop exhausted after 2 rounds (last tool: respond)";
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-i: invoke_infra renders the invoke-failed template verbatim (with cause)", () => {
    const err = invokeInfra("/abs/c.loom", "load_failure");
    const expected = "loom /demo returned Err: invoke of /abs/c.loom failed (load_failure)";
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
  });

  it("SLSH-4 / SNK-k: the catch-all renders verbatim and the renderer is total over any unlisted kind", () => {
    // SNK-k catch-all: an unlisted `kind` (ERR-15 discriminator openness) renders
    // `<kind> — <message>`; the renderer is total — it produces defined output
    // and never throws for any well-formed QueryError with an unlisted tag.
    const err = unlistedKind("binder", "boom");
    const expected = `loom /demo returned Err: binder ${DASH} boom`;
    expect(renderLeafKindNote("demo", err)).toBe(expected);
    expect(boundary("demo", err)).toBe(expected);
    // Totality over a second arbitrary unlisted kind — no throw, catch-all form.
    expect(() => boundary("demo", unlistedKind("future_variant", "x"))).not.toThrow();
    expect(boundary("demo", unlistedKind("future_variant", "x"))).toBe(
      `loom /demo returned Err: future_variant ${DASH} x`,
    );
  });
});

// ===========================================================================
// SLSH-5 — chain attribution.
// ===========================================================================

describe("V12b-T — SLSH-5 chain attribution", () => {
  it("SLSH-5: a single invoke_callee hop appends one ` from <callee> invoked at <parent>:<line>` suffix (leaf kind drives the row)", () => {
    // A `transport` failure inside child.loom cascaded out of parent.loom at the
    // `invoke(` token on line 42 (SLSH-5 worked example — single-hop).
    const err = calleeWrap("/abs/path/to/child.loom", transport("connection reset"));
    const chain = [hop("/abs/path/to/child.loom", "/abs/path/to/parent.loom", 42)];
    expect(renderTopLevelErrNote({ loomName: "entry", error: err, chain })).toBe(
      `loom /entry returned Err: transport ${DASH} connection reset` +
        " from /abs/path/to/child.loom invoked at /abs/path/to/parent.loom:42",
    );
  });

  it("SLSH-5: a .loom-callable bare-identifier parent renders the identical suffix (line from the callee-name identifier)", () => {
    // A `transport` failure inside a `.loom` callable registered as `summarise`
    // (resolving to ./summariser.loom), called by `summarise(doc)` on line 18 of
    // parent.loom (SLSH-5 worked example — .loom-callable parent). The suffix is
    // identical to the literal invoke(...) form; the provenance line is consumed
    // from V15g's record (the callee-name identifier's line), not derived here.
    const err = calleeWrap("/abs/path/to/summariser.loom", transport("connection reset"));
    const chain = [hop("/abs/path/to/summariser.loom", "/abs/path/to/parent.loom", 18)];
    expect(renderTopLevelErrNote({ loomName: "entry", error: err, chain })).toBe(
      `loom /entry returned Err: transport ${DASH} connection reset` +
        " from /abs/path/to/summariser.loom invoked at /abs/path/to/parent.loom:18",
    );
  });

  it("SLSH-5: a three-level cascade renders both hops leaf-first, single-space-separated, with the leaf kind driving the row", () => {
    // A cascade grandchild → child → parent whose leaf is `model_tool` (SLSH-5
    // worked example — multi-hop three-level). Leaf-first: the innermost hop
    // (grandchild invoked at child:7) precedes the outer hop (child invoked at
    // parent:42).
    const leaf = modelTool("foo", "bad arg");
    const err = calleeWrap("/abs/child.loom", calleeWrap("/abs/grandchild.loom", leaf));
    // Chain in OUTER-to-inner encounter order (matching the nesting walk).
    const chain = [
      hop("/abs/child.loom", "/abs/parent.loom", 42),
      hop("/abs/grandchild.loom", "/abs/child.loom", 7),
    ];
    const note = renderTopLevelErrNote({ loomName: "entry", error: err, chain });
    expect(note).toBe(
      `loom /entry returned Err: tool foo failed ${DASH} bad arg` +
        " from /abs/grandchild.loom invoked at /abs/child.loom:7" +
        " from /abs/child.loom invoked at /abs/parent.loom:42",
    );
    // Leaf-first ordering: the innermost hop's suffix precedes the outer hop's.
    expect(note.indexOf("invoked at /abs/child.loom:7")).toBeLessThan(
      note.indexOf("invoked at /abs/parent.loom:42"),
    );
    // The leaf `kind` (model_tool), not the invoke_callee wrapper, drives the row.
    expect(note).toContain(`tool foo failed ${DASH} bad arg`);
    expect(note).not.toContain("callee returned Err");
  });

  it("SLSH-5: the chain suffix appends to the catch-all row too (unlisted leaf kind)", () => {
    // SLSH-5 worked example — catch-all interaction: the catch-all row renders
    // first (`<kind> — <message>` with leaf values), then the chain suffix
    // appends in the same form.
    const err = calleeWrap("/abs/c.loom", unlistedKind("binder", "boom"));
    const chain = [hop("/abs/c.loom", "/abs/p.loom", 9)];
    expect(renderTopLevelErrNote({ loomName: "entry", error: err, chain })).toBe(
      `loom /entry returned Err: binder ${DASH} boom` +
        " from /abs/c.loom invoked at /abs/p.loom:9",
    );
  });
});
