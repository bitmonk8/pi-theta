// E2E S5 — REQ-SLSH-23 (spec tag SLSH-5): the model-invoked `.theta`-callable
// tool-error surface emits NO chain suffix.
//
// Target requirement (docs/e2e-campaign/analysis/spec-requirements.md:955,
// docs/spec_topics/slash-invocation.md:54 SLSH-5):
//
//   "A `.theta` callable invoked by the model during a `@`-query loop feeds its
//    failure back as a tool-error result, not an `invoke_callee` cascade, so no
//    chain suffix is emitted for that surface."
//
// This is the negative counterpart of REQ-SLSH-22 (a direct `invoke(...)`
// cascade DOES append one ` from <callee_path> invoked at <parent_path>:<line>`
// suffix per hop — covered in tests/err-note-render.test.ts). The distinction
// keys off whether the surfaced `QueryError` is an `invoke_callee` cascade
// (with a populated V15g invocation chain) or a plain tool-error-result-style
// leaf (`model_tool` / `code_tool`) with NO chain.
//
// Spec chain-of-evidence for the "tool-error result, not invoke_callee" surface:
//   - tool-calls.md:34 — "the model-driven `@`...`` tool-call loop feeds that
//     same outcome back to the model as the failing `tool_use` block's
//     tool-result and continues looping" (never a theta `Err`, never
//     `invoke_callee`).
//   - tool-calls.md:36 — for a `.theta` callable the ONLY `code_tool` that can
//     arise is theta 1.0's `"unknown_tool"` safety net.
//   - errors-and-results: `ModelToolError` (`kind: "model_tool"`) is reserved
//     for the non-recoverable adapter-layer failure that CAN surface a
//     `QueryError` out of the loop; it is a leaf, never an `invoke_callee`.
//
// Offline-renderable seam: the top-level `Err`-note renderer
// (`renderTopLevelErrNote`) appends the SLSH-5 chain suffix strictly from its
// `chain: ChainHop[]` input (V15g invocation records, produced only for
// `invoke_callee` hops). The model-invoked tool-error surface produces no
// `invoke_callee` wrapper, hence an EMPTY chain, hence NO suffix. These tests
// assert exactly that against the real renderer imported from src/ — no src/
// edits, no stubbing.

import { describe, expect, it } from "vitest";
import { boundaryNoChain, calleeWrap, hop, modelTool, transport } from "./helpers/query-error-fixtures";
import {
  isInvokeCalleeError,
  renderLeafKindNote,
  renderTopLevelErrNote,
} from "../src/runtime/err-note-render";
import type {
  CodeToolError,
} from "../src/runtime/query-error";

const DASH = "\u2014"; // em-dash, the SLSH-4 template separator.
// The one substring whose presence is the SLSH-5 chain suffix's signature.
const SUFFIX_MARKER = "invoked at";

// --- Factories --------------------------------------------------------------

/**
 * A `CodeToolError` with `cause: "unknown_tool"` — the ONLY `code_tool` that can
 * arise for a `.theta` callable (tool-calls.md:36). Also a leaf, no chain.
 */
function unknownToolCode(tool_name: string, message: string): CodeToolError {
  return { kind: "code_tool", message, tool_name, cause: "unknown_tool" };
}

// ===========================================================================
// REQ-SLSH-23 — the model-invoked tool-error surface carries NO chain suffix.
// ===========================================================================

describe("E2E S5 / REQ-SLSH-23 — model-invoked .theta-callable tool-error surface emits no chain suffix", () => {
  it("REQ-SLSH-23: a model_tool leaf is NOT an invoke_callee cascade (no wrapper, no invocation chain)", () => {
    // Spec: the failure "feeds its failure back as a tool-error result, not an
    // `invoke_callee` cascade". The surfaced QueryError is a leaf model_tool —
    // it is not the invoke_callee wrapper, so the renderer's cascade recogniser
    // rejects it and there is no `inner` chain to walk.
    const err = modelTool("my_summariser", "adapter failed");
    expect(err.kind).toBe("model_tool");
    expect(isInvokeCalleeError(err)).toBe(false);
    // No self-referential `inner` — this surface never nests a QueryError.
    expect((err as unknown as { inner?: unknown }).inner).toBeUndefined();
  });

  it("REQ-SLSH-23: a model_tool tool-error surface renders the plain SNK-d row with NO ' from ... invoked at ...' suffix", () => {
    // The correct model-invoked surface: leaf model_tool + EMPTY chain (no V15g
    // invocation record exists, because no invoke_callee hop was produced).
    const err = modelTool("my_summariser", "adapter failed");
    const expected = `theta /entry returned Err: tool my_summariser failed ${DASH} adapter failed`;

    // Boundary render == the bare per-kind row: no chain suffix appended.
    expect(boundaryNoChain("entry", err)).toBe(expected);
    // The isolated per-kind renderer never emits a suffix by construction.
    expect(renderLeafKindNote("entry", err)).toBe(expected);
    // The SLSH-5 suffix signature is absent on the surfaced note.
    expect(boundaryNoChain("entry", err)).not.toContain(SUFFIX_MARKER);
    expect(boundaryNoChain("entry", err)).not.toContain(" from ");
  });

  it("REQ-SLSH-23: a code_tool (unknown_tool) tool-error surface renders SNK-g with NO chain suffix", () => {
    // The only code_tool a .theta callable can raise (tool-calls.md:36) — still a
    // leaf with an empty chain, so no suffix.
    const err = unknownToolCode("my_summariser", "no such tool");
    const expected = `theta /entry returned Err: tool my_summariser call failed (unknown_tool) ${DASH} no such tool`;

    expect(boundaryNoChain("entry", err)).toBe(expected);
    expect(boundaryNoChain("entry", err)).not.toContain(SUFFIX_MARKER);
    expect(isInvokeCalleeError(err)).toBe(false);
  });

  it("REQ-SLSH-23 vs REQ-SLSH-22: identical leaf kind — no suffix on the tool-error surface, suffix on the invoke cascade", () => {
    // Hold the LEAF fixed (a transport failure inside child.theta) and vary ONLY
    // the surface. This isolates the SLSH-5 discriminator: the chain suffix is
    // a function of the invoke_callee cascade (populated chain), NOT of the leaf
    // kind. The tool-error surface (leaf + empty chain) MUST omit it; the direct
    // invoke(...) cascade (invoke_callee wrapper + one hop) MUST include it.
    const leaf = transport("connection reset");
    const row = `theta /entry returned Err: transport ${DASH} connection reset`;

    // REQ-SLSH-23 surface: model-invoked during a @-query loop → tool-error
    // result → leaf, empty chain → no suffix.
    const toolErrorSurface = boundaryNoChain("entry", leaf);
    expect(toolErrorSurface).toBe(row);
    expect(toolErrorSurface).not.toContain(SUFFIX_MARKER);

    // REQ-SLSH-22 surface (contrast, covered in err-note-render.test.ts): a
    // direct invoke(...) cascade → invoke_callee wrapper + one V15g hop → suffix.
    const cascade = calleeWrap("/abs/child.theta", leaf);
    const cascadeNote = renderTopLevelErrNote({
      thetaName: "entry",
      error: cascade,
      chain: [hop("/abs/child.theta", "/abs/parent.theta", 42)],
    });
    expect(cascadeNote).toBe(
      `${row} from /abs/child.theta invoked at /abs/parent.theta:42`,
    );
    expect(cascadeNote).toContain(SUFFIX_MARKER);

    // The two surfaces diverge ONLY by the suffix; the per-kind row is identical.
    expect(cascadeNote.startsWith(toolErrorSurface)).toBe(true);
    expect(cascadeNote.length).toBeGreaterThan(toolErrorSurface.length);
  });

  it("REQ-SLSH-23: a model_tool leaf never walks to a nested leaf — the boundary walk is a no-op and cannot fabricate a hop", () => {
    // Reinforces the mechanism: because the surface is a leaf (not invoke_callee)
    // the renderer's inner-walk terminates immediately, so even the isolated
    // per-kind renderer and the boundary renderer agree byte-for-byte. There is
    // no invocation record for the renderer to consume, so no suffix is possible.
    const err = modelTool("grep", "bad arg");
    expect(boundaryNoChain("entry", err)).toBe(renderLeafKindNote("entry", err));
    // Totality: the renderer never throws and never emits a suffix on this
    // surface for a second arbitrary tool name/message.
    const other = modelTool("read", "file vanished");
    expect(() => boundaryNoChain("entry", other)).not.toThrow();
    expect(boundaryNoChain("entry", other)).not.toContain(SUFFIX_MARKER);
  });
});
