// RFC-0006 new coverage — return-value envelope (PIC-59).
//
// Spec: pi-integration-contract/subagent.md (PIC-59 #subagent-return-envelope,
// #subagent-error-fidelity, #subagent-cli-wire-pins), invocation.md (INV-5),
// errors-and-results/queryerror-variants.md (the `err` arm mirrors the
// `QueryError` union), diagnostics/code-registry-runtime.md
// (`subagent-envelope-parse-failed`, `subagent-envelope-schema-skew`,
// `subagent-exit-without-envelope`).
//
// Covers the RFC's named list for the envelope:
//   - round-trip: every `Err` variant representable today + `Ok` values per the
//     runtime value model; single-line JSONL framing; reserved-key matching;
//   - stray-line tolerance: non-envelope lines (valid JSON events, garbage,
//     partial JSON) ignored, envelope still found;
//   - envelope-parse failure → parse-failed + fail-closed internal_error;
//   - schema-skew (version mismatch) → detected, not tolerated;
//   - exit-without-envelope → Err(InvokeInfraError { cause: "internal_error" }),
//     never a fabricated value.
//
// RED EXPECTATION (RFC-0006 not yet implemented): the serialise / parse / scan /
// map helpers throw `not implemented: RFC 0006`, so each assertion reds on its
// primary behaviour; the paired implementation leaf greens them.

import { describe, expect, it } from "vitest";
import {
  lineCarriesReservedKey,
  mapEnvelopeParseFailure,
  mapEnvelopeSchemaSkew,
  mapExitWithoutEnvelope,
  parseEnvelopeLine,
  scanStreamForEnvelope,
  serializeErrEnvelope,
  serializeOkEnvelope,
  SUBAGENT_ENVELOPE_PARSE_FAILED_CODE,
  SUBAGENT_ENVELOPE_SCHEMA_SKEW_CODE,
  SUBAGENT_EXIT_WITHOUT_ENVELOPE_CODE,
  THETA_ENVELOPE_VERSION,
  THETA_RESULT_KEY,
} from "../src/runtime/subagent-envelope";
import {
  theta10QueryErrorKinds,
  type CancelledError,
  type CodeToolError,
  type ContextOverflowError,
  type InvokeCalleeError,
  type InvokeInfraError,
  type ModelToolError,
  type QueryError,
  type ToolLoopExhaustedError,
  type TransportError,
  type ValidationError,
} from "../src/runtime/query-error";

// ---------------------------------------------------------------------------
// Representative instances of the runtime value model + every QueryError variant.
// ---------------------------------------------------------------------------

/** `Ok` values per the runtime value model (JSON-representable by construction). */
const OK_VALUES: readonly unknown[] = [
  "hello",
  42,
  3.14,
  true,
  false,
  null,
  [1, 2, 3],
  { a: 1, b: { c: [true, "x"] } },
];

const VALIDATION: ValidationError = {
  kind: "validation",
  cause: "schema_validation",
  message: "response failed schema validation",
  attempts: 2,
  validation_errors: [{ path: "/x", message: "must be string", schema_keyword: "type" }],
  raw_response: "{}",
};
const TRANSPORT: TransportError = {
  kind: "transport",
  message: "provider 529",
  http_status: 529,
  provider: "anthropic-messages",
  retryable: true,
};
const MODEL_TOOL: ModelToolError = {
  kind: "model_tool",
  message: "tool loop crashed",
  tool_name: "grep",
  tool_call_id: "call-1",
  raw_response: null,
};
const CONTEXT_OVERFLOW: ContextOverflowError = {
  kind: "context_overflow",
  message: "context overflow",
  tokens_used: 100,
  tokens_limit: 50,
  raw_response: null,
};
const CANCELLED: CancelledError = { kind: "cancelled", message: "cancelled" };
const TOOL_LOOP_EXHAUSTED: ToolLoopExhaustedError = {
  kind: "tool_loop_exhausted",
  message: "tool-call loop exhausted",
  rounds: 25,
  last_tool_name: "read",
  raw_response: null,
};
const CODE_TOOL: CodeToolError = {
  kind: "code_tool",
  message: "execute threw",
  tool_name: "bash",
  cause: "execution",
};
// invoke_infra covers the panic route AND the internal_error / validation causes.
const INVOKE_INFRA_PANIC: InvokeInfraError = {
  kind: "invoke_infra",
  message: "index out of bounds",
  callee_path: "/theta/child.theta",
  cause: "panic",
};
const INVOKE_INFRA_INTERNAL: InvokeInfraError = {
  kind: "invoke_infra",
  message: "internal error: boom",
  callee_path: "/theta/child.theta",
  cause: "internal_error",
};
const INVOKE_INFRA_VALIDATION: InvokeInfraError = {
  kind: "invoke_infra",
  message: "params failed schema validation",
  callee_path: "/theta/child.theta",
  cause: "validation",
};
const INVOKE_CALLEE: InvokeCalleeError = {
  kind: "invoke_callee",
  message: "callee returned Err",
  callee_path: "/theta/child.theta",
  inner: TRANSPORT,
};

/** Every `Err` variant an in-process subagent could surface today (PIC-59). */
const ERR_VARIANTS: readonly QueryError[] = [
  VALIDATION,
  TRANSPORT,
  MODEL_TOOL,
  CONTEXT_OVERFLOW,
  CANCELLED,
  TOOL_LOOP_EXHAUSTED,
  CODE_TOOL,
  INVOKE_INFRA_PANIC,
  INVOKE_INFRA_INTERNAL,
  INVOKE_INFRA_VALIDATION,
  INVOKE_CALLEE,
];

/** Build a raw (unserialised) envelope object for a hand-constructed stdout line. */
function envelopeObject(payload: Record<string, unknown>): string {
  return JSON.stringify({ [THETA_RESULT_KEY]: payload });
}

// ---------------------------------------------------------------------------
// Round-trip — every Err variant + Ok values, single-line JSONL framing.
// ---------------------------------------------------------------------------

describe("PIC-59 — envelope round-trip (Ok values)", () => {
  it("the pinned reserved key is `theta_result` and the schema is versioned", () => {
    expect(THETA_RESULT_KEY).toBe("theta_result");
    expect(THETA_ENVELOPE_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("serialises an Ok value as exactly ONE LF-terminated JSONL line under the reserved key", () => {
    const line = serializeOkEnvelope({ a: 1 });
    expect(line.endsWith("\n")).toBe(true);
    // Single line: no embedded newline splits the reserved-key line mid-write.
    expect(line.trimEnd().includes("\n")).toBe(false);
    const obj = JSON.parse(line.trimEnd()) as Record<string, unknown>;
    expect(Object.keys(obj)).toEqual([THETA_RESULT_KEY]);
  });

  for (const value of OK_VALUES) {
    it(`round-trips Ok(${JSON.stringify(value)})`, () => {
      const parsed = parseEnvelopeLine(serializeOkEnvelope(value).trimEnd());
      expect(parsed.kind).toBe("ok");
      if (parsed.kind === "ok") {
        expect(parsed.value).toEqual(value);
      }
    });
  }
});

describe("PIC-59 — envelope round-trip (every Err variant)", () => {
  it("the fixture set covers all nine theta 1.0.0 QueryError kinds", () => {
    const covered = new Set(ERR_VARIANTS.map((e) => e.kind));
    for (const kind of theta10QueryErrorKinds()) {
      expect(covered.has(kind), `Err fixture set covers kind '${kind}'`).toBe(true);
    }
  });

  for (const err of ERR_VARIANTS) {
    const label = err.kind === "invoke_infra" ? `invoke_infra/${(err as InvokeInfraError).cause}` : err.kind;
    it(`round-trips Err(${label}) with zero fidelity loss`, () => {
      const line = serializeErrEnvelope(err);
      expect(line.endsWith("\n")).toBe(true);
      const parsed = parseEnvelopeLine(line.trimEnd());
      expect(parsed.kind).toBe("err");
      if (parsed.kind === "err") {
        expect(parsed.error).toEqual(err);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Reserved-key matching + stray-line tolerance.
// ---------------------------------------------------------------------------

describe("PIC-59 — reserved-key matching + stray-line tolerance", () => {
  it("matches a reserved-key line; ignores valid events, garbage, and partial JSON", () => {
    expect(lineCarriesReservedKey(envelopeObject({ v: THETA_ENVELOPE_VERSION, ok: 1 }))).toBe(true);
    // A valid `--mode json` event carries no reserved key.
    expect(lineCarriesReservedKey(JSON.stringify({ type: "agent_end", messages: [] }))).toBe(false);
    // Garbage.
    expect(lineCarriesReservedKey("this is not json {")).toBe(false);
    // Partial JSON (a stray line cannot corrupt the envelope).
    expect(lineCarriesReservedKey('{"theta_result": ')).toBe(false);
  });

  it("scans past stray lines to the reserved-key envelope in a captured stream", () => {
    const scan = scanStreamForEnvelope([
      JSON.stringify({ type: "agent_start" }),
      "garbage <<<>>>",
      '{"partial": ',
      envelopeObject({ v: THETA_ENVELOPE_VERSION, ok: "FINAL" }),
      JSON.stringify({ type: "agent_end", messages: [] }),
    ]);
    expect(scan.found).toBe(true);
    if (scan.found) {
      expect(scan.parse.kind).toBe("ok");
      if (scan.parse.kind === "ok") {
        expect(scan.parse.value).toBe("FINAL");
      }
    }
  });

  it("returns not-found when the stream carries no reserved-key line", () => {
    const scan = scanStreamForEnvelope([
      JSON.stringify({ type: "agent_end", messages: [] }),
      "noise",
    ]);
    expect(scan.found).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Parse failure / schema skew / exit-without-envelope (fail-closed).
// ---------------------------------------------------------------------------

describe("PIC-59 — envelope-parse failure (fail-closed internal_error)", () => {
  it("a reserved-key line that fails the pinned schema → parse-failed → Err(internal_error) + pinned diagnostic", () => {
    const bad = envelopeObject({ v: THETA_ENVELOPE_VERSION, neither_ok_nor_err: true });
    const parsed = parseEnvelopeLine(bad);
    expect(parsed.kind).toBe("parse-failed");

    const mapping = mapEnvelopeParseFailure(bad, "/theta/child.theta");
    expect(mapping.error.kind).toBe("invoke_infra");
    expect(mapping.error.cause).toBe("internal_error");
    expect(mapping.error.callee_path).toBe("/theta/child.theta");
    expect(mapping.diagnostic.code).toBe(SUBAGENT_ENVELOPE_PARSE_FAILED_CODE);
    expect(mapping.diagnostic.severity).toBe("error");
  });
});

describe("PIC-59 — envelope schema skew (detected, not tolerated)", () => {
  it("an unrecognised envelope version → schema-skew → Err(internal_error) + pinned diagnostic", () => {
    const future = envelopeObject({ v: THETA_ENVELOPE_VERSION + 1, ok: 1 });
    const parsed = parseEnvelopeLine(future);
    expect(parsed.kind).toBe("schema-skew");
    if (parsed.kind === "schema-skew") {
      expect(parsed.observed).toBe(THETA_ENVELOPE_VERSION + 1);
      expect(parsed.required).toBe(THETA_ENVELOPE_VERSION);
    }

    const mapping = mapEnvelopeSchemaSkew(THETA_ENVELOPE_VERSION + 1, THETA_ENVELOPE_VERSION, "/theta/child.theta");
    expect(mapping.diagnostic.code).toBe(SUBAGENT_ENVELOPE_SCHEMA_SKEW_CODE);
    expect(mapping.error.kind).toBe("invoke_infra");
    expect(mapping.error.cause).toBe("internal_error");
  });
});

describe("PIC-59 / INV-5 — child exit WITHOUT an envelope (fail-closed, never fabricated)", () => {
  it("crash / kill / zero-exit-no-envelope → Err(InvokeInfraError { cause: internal_error }) with the exit detail", () => {
    const mapping = mapExitWithoutEnvelope("exited code 1", "/theta/child.theta");
    expect(mapping.error.kind).toBe("invoke_infra");
    expect(mapping.error.cause).toBe("internal_error");
    expect(mapping.error.callee_path).toBe("/theta/child.theta");
    // The exit detail rides the message — never a fabricated Ok value.
    expect(mapping.error.message).toContain("exited code 1");
    expect(mapping.diagnostic.code).toBe(SUBAGENT_EXIT_WITHOUT_ENVELOPE_CODE);
  });
});
