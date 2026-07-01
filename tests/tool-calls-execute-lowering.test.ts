import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type {
  Checkpoint,
  CheckpointKind,
  CheckpointSite,
} from "../src/seams/checkpoint";
import type { RuntimeEvent } from "../src/runtime/runtime-event-channel";
import type {
  CommittedSideEffect,
  CompensatingTurn,
  RollbackCompensator,
} from "../src/runtime/no-rollback";
import { handleNoRollbackTerminalEvent } from "../src/runtime/no-rollback";
import {
  CODE_TOOL_MESSAGE_MAX_BYTES,
  filterJoinToolText,
  lowerResolvedToolEnvelope,
  lowerToolExecuteThrow,
  runCodeSideToolCall,
  truncateUtf8CodePointBoundary,
  type AgentToolResultEnvelope,
  type CodeSideToolCall,
  type ToolContentBlock,
  type ToolLoweringSink,
} from "../src/runtime/tool-call-execute";

// V14g-T — failing tests for the paired `V14g` "Code-side `execute()`
// envelope-lowering (runtime surface)" implementation leaf.
//
// Spec: pi-integration-contract/host-interfaces-core.md §"Tool execution from
// loom code" (post-F-1578 AgentToolResult shape — no code-side `isError`);
// cancellation.md §Granularity (coverage-matrix.md code-keyed-area token
// `cka-47`, `V14g` tool-call checkpoint facet); errors-and-results/
// queryerror-variants.md §"Code-side tool-call variant";
// errors-and-results/error-model.md §"No rollback" (ERR-13).
//
// Each test reds on its own primary assertion because the V14g behaviour is
// absent: `filterJoinToolText` returns a sentinel, `lowerResolvedToolEnvelope`
// returns an inert `Err`, `truncateUtf8CodePointBoundary` is the identity,
// `lowerToolExecuteThrow` carries a sentinel `message`, and `runCodeSideToolCall`
// fires no checkpoint and dispatches nothing. No test reds on a compile error, a
// missing fixture, or a harness throw.

const TOOL_SITE: CheckpointSite = { file: "call.loom", line: 4, column: 7 };

const utf8Len = (s: string): number => new TextEncoder().encode(s).length;

/** A never-aborted signal for the checkpoint-presence and value arms. */
function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

/**
 * A `Checkpoint` recording the ordered `(kind, site)` sequence so a test can
 * assert a cancellation checkpoint fires immediately before each code-side tool
 * dispatch (PIC-10 / cancellation.md §Granularity). `before` resolves on the
 * microtask queue — the macrotask-yield property is `V17c`'s, not this leaf's.
 */
class RecordingCheckpoint implements Checkpoint {
  readonly kinds: CheckpointKind[] = [];
  readonly sites: CheckpointSite[] = [];
  readonly log: string[];

  constructor(log: string[]) {
    this.log = log;
  }

  before(kind: CheckpointKind, site: CheckpointSite): Promise<void> {
    this.kinds.push(kind);
    this.sites.push(site);
    this.log.push(`checkpoint:${kind}`);
    return Promise.resolve();
  }
}

/**
 * A `ToolLoweringSink` that records any normative side-channel emission so a
 * test can assert the non-text-block discard path touches none of them.
 */
class RecordingSink implements ToolLoweringSink {
  readonly emissions: string[] = [];
  runtimeEvent(event: RuntimeEvent): void {
    this.emissions.push(`runtime-event:${event.kind}`);
  }
  diagnostic(diag: Diagnostic): void {
    this.emissions.push(`diagnostic:${diag.code}`);
  }
  systemNote(message: string): void {
    this.emissions.push(`system-note:${message}`);
  }
}

/** A `RollbackCompensator` spy: records any forbidden compensating operation. */
class SpyCompensator implements RollbackCompensator {
  readonly calls: string[] = [];
  unwindSideEffect(id: string): void {
    this.calls.push(`unwind:${id}`);
  }
  appendCompensatingTurn(turn: CompensatingTurn): void {
    this.calls.push(`append:${turn.id}`);
  }
  enumerateCompletedSideEffects(effects: readonly CommittedSideEffect[]): void {
    this.calls.push(`enumerate:${effects.length}`);
  }
}

const text = (t: string): ToolContentBlock => ({ type: "text", text: t });
const image = (): ToolContentBlock => ({ type: "image", source: "…" });

function resolvingCall(
  toolName: string,
  content: readonly ToolContentBlock[],
  committed: readonly CommittedSideEffect[] = [],
): CodeSideToolCall {
  return { toolName, dispatch: async () => ({ content }), committed };
}

// ===========================================================================
// (1) content-block filtering / joining — text kept, joined with a single
// "\n", non-text discarded (host-interfaces-core.md §"Tool execution from loom
// code").
// ===========================================================================

describe("V14g-T — execute() envelope content filter/join (host-interfaces-core.md §Tool execution from loom code)", () => {
  it("filters content to type==='text' and joins .text with a single '\\n' (no leading/trailing separator)", () => {
    const joined = filterJoinToolText([text("first"), text("second"), text("third")]);
    // Single line-feed between blocks; nothing before the first or after the last.
    expect(joined).toBe("first\nsecond\nthird");
  });

  it("discards non-text blocks (images, resource refs) and joins only surviving text", () => {
    const joined = filterJoinToolText([text("alpha"), image(), text("beta")]);
    expect(joined).toBe("alpha\nbeta");
  });

  it("preserves empty text blocks as empty joined segments (join is '\\n', not a skip)", () => {
    // Two text blocks, the first empty, join to a leading line-feed — the join is
    // over surviving text entries, not a filter of empty strings.
    const joined = filterJoinToolText([text(""), text("x")]);
    expect(joined).toBe("\nx");
  });
});

// ===========================================================================
// (2) accepted-path lowering — Ok(<filtered/joined text>), including Ok("") for
// an empty result, with NO diagnostic / RuntimeEvent / system-note on the
// non-text discard path.
// ===========================================================================

describe("V14g-T — accepted-path envelope lowering to Ok (host-interfaces-core.md §Tool execution from loom code)", () => {
  it("a cleanly-resolving envelope lowers to Ok(<filtered/joined text>)", () => {
    const sink = new RecordingSink();
    const result = lowerResolvedToolEnvelope(
      { content: [text("line one"), text("line two")] },
      sink,
    );
    expect(result.ok, "resolving envelope lowers to Ok").toBe(true);
    if (result.ok) {
      expect(result.value).toBe("line one\nline two");
    }
  });

  it("content: [] lowers to Ok('') (an empty result is a legal Ok(''))", () => {
    const sink = new RecordingSink();
    const result = lowerResolvedToolEnvelope({ content: [] }, sink);
    expect(result.ok, "empty content lowers to Ok").toBe(true);
    if (result.ok) {
      expect(result.value).toBe("");
    }
  });

  it("a content array with no surviving text blocks lowers to Ok('')", () => {
    const sink = new RecordingSink();
    const result = lowerResolvedToolEnvelope({ content: [image(), image()] }, sink);
    expect(result.ok, "no-surviving-text lowers to Ok").toBe(true);
    if (result.ok) {
      expect(result.value).toBe("");
    }
  });

  it("emits NO RuntimeEvent / loom-system-note / diagnostic on the non-text discard path", () => {
    const sink = new RecordingSink();
    const result = lowerResolvedToolEnvelope(
      { content: [text("kept"), image(), text("also kept")] },
      sink,
    );
    // Primary: the non-text block was discarded and only text survived.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("kept\nalso kept");
    }
    // Discard is not a QueryError and not in the always-log set: nothing emitted.
    expect(sink.emissions).toEqual([]);
  });
});

// ===========================================================================
// (5a) 4096-byte code-point-boundary truncation (host-interfaces-core.md
// §"Tool execution from loom code" — worked example).
// ===========================================================================

describe("V14g-T — 4096-byte code-point-boundary truncation (host-interfaces-core.md §Tool execution from loom code)", () => {
  it("truncates a pure-ASCII over-limit string to exactly maxBytes bytes", () => {
    const s = "a".repeat(5000);
    const out = truncateUtf8CodePointBoundary(s, CODE_TOOL_MESSAGE_MAX_BYTES);
    expect(utf8Len(out)).toBe(4096);
    expect(out).toBe("a".repeat(4096));
  });

  it("worked example: 4095 ASCII bytes + a 3-byte code point (U+2026) truncates to 4095 bytes", () => {
    // Including the 3-byte '…' would yield 4098 bytes, so it is dropped entirely.
    const s = "a".repeat(4095) + "\u2026";
    expect(utf8Len(s)).toBe(4098);
    const out = truncateUtf8CodePointBoundary(s, CODE_TOOL_MESSAGE_MAX_BYTES);
    expect(utf8Len(out)).toBe(4095);
    expect(out).toBe("a".repeat(4095));
  });

  it("never splits a multi-byte code point: no bytes of a partial code point appear", () => {
    // 2047 '…' code points = 6141 bytes; the cap lands mid-code-point, so the
    // straddling code point is dropped, leaving a whole number of code points.
    const s = "\u2026".repeat(2047);
    const out = truncateUtf8CodePointBoundary(s, CODE_TOOL_MESSAGE_MAX_BYTES);
    const outBytes = utf8Len(out);
    expect(outBytes).toBeLessThanOrEqual(4096);
    // The result MAY be up to three bytes short, but is a whole number of code
    // points (each '…' is 3 bytes) — so the byte length is divisible by 3.
    expect(outBytes % 3).toBe(0);
    expect([...out].every((cp) => cp === "\u2026")).toBe(true);
  });

  it("leaves an at-or-under-limit string unchanged", () => {
    const s = "short message";
    expect(truncateUtf8CodePointBoundary(s, CODE_TOOL_MESSAGE_MAX_BYTES)).toBe(s);
  });
});

// ===========================================================================
// (5b) execute()-throw lowering — Err(CodeToolError { cause: "execution" })
// whose message is the thrown value coerced to the underlying-error string and
// truncated under the 4096-byte rule (host-interfaces-core.md §"Tool execution
// from loom code").
// ===========================================================================

describe("V14g-T — execute()-throw lowering to CodeToolError (host-interfaces-core.md §Tool execution from loom code)", () => {
  it("an Error throw lowers to CodeToolError { cause: 'execution' } carrying the Error's .message", () => {
    const err = lowerToolExecuteThrow(new Error("disk write failed"), "write");
    expect(err.kind).toBe("code_tool");
    expect(err.cause).toBe("execution");
    expect(err.tool_name).toBe("write");
    expect(err.message).toBe("disk write failed");
  });

  it("a non-Error throw is coerced to the underlying-error string (no undefined / TypeError)", () => {
    // The §underlying-error coercion falls to String(v) for a non-object throw.
    expect(lowerToolExecuteThrow(42, "read").message).toBe("42");
    expect(lowerToolExecuteThrow("bare string throw", "read").message).toBe(
      "bare string throw",
    );
  });

  it("the coerced message is truncated under the same 4096-byte code-point-boundary rule", () => {
    const err = lowerToolExecuteThrow(new Error("x".repeat(9000)), "read");
    expect(err.cause).toBe("execution");
    expect(utf8Len(err.message)).toBe(4096);
  });
});

// ===========================================================================
// cka-47 / V14g — a cancellation checkpoint fires immediately before each
// code-side <name>(args) tool call (cancellation.md §Granularity; V8a
// Checkpoint seam PIC-10).
// ===========================================================================

describe("V14g-T — tool-call cancellation checkpoint (cka-47 / V14g)", () => {
  it("cka-47 / V14g: a 'tool-call' checkpoint fires immediately before the dispatch, carrying the call site", async () => {
    const log: string[] = [];
    const checkpoint = new RecordingCheckpoint(log);
    const call: CodeSideToolCall = {
      toolName: "read",
      dispatch: async () => {
        log.push("dispatch");
        return { content: [text("ok")] };
      },
      committed: [],
    };

    await runCodeSideToolCall(checkpoint, liveSignal(), TOOL_SITE, call, new RecordingSink());

    // The `tool-call` checkpoint precedes the dispatch and carries the call site.
    expect(checkpoint.kinds[0]).toBe("tool-call");
    expect(checkpoint.sites[0]).toEqual(TOOL_SITE);
    expect(log.indexOf("checkpoint:tool-call")).toBeLessThan(log.indexOf("dispatch"));
  });

  it("cka-47 / V14g: an abort observed at the tool-call checkpoint skips the dispatch", async () => {
    const log: string[] = [];
    const checkpoint = new RecordingCheckpoint(log);
    const controller = new AbortController();
    controller.abort(); // already aborted before the pre-dispatch checkpoint
    let dispatched = false;
    const call: CodeSideToolCall = {
      toolName: "read",
      dispatch: async () => {
        dispatched = true;
        return { content: [text("ok")] };
      },
      committed: [],
    };

    const outcome = await runCodeSideToolCall(
      checkpoint,
      controller.signal,
      TOOL_SITE,
      call,
      new RecordingSink(),
    );

    // The checkpoint fired, the abort was observed, and the tool was not dispatched.
    expect(checkpoint.kinds).toEqual(["tool-call"]);
    expect(outcome.kind).toBe("cancelled");
    expect(dispatched).toBe(false);
  });

  it("cka-47 / V14g: a cleanly-resolving live call surfaces Ok(<joined text>) after the checkpoint", async () => {
    const checkpoint = new RecordingCheckpoint([]);
    const outcome = await runCodeSideToolCall(
      checkpoint,
      liveSignal(),
      TOOL_SITE,
      resolvingCall("read", [text("file"), text("body")]),
      new RecordingSink(),
    );
    expect(outcome.kind).toBe("value");
    if (outcome.kind === "value") {
      expect(outcome.result.ok).toBe(true);
      if (outcome.result.ok) {
        expect(outcome.result.value).toBe("file\nbody");
      }
    }
  });

  it("cka-47 / V14g: an execute() throw on the live surface surfaces Err(CodeToolError { cause: 'execution' })", async () => {
    const checkpoint = new RecordingCheckpoint([]);
    const call: CodeSideToolCall = {
      toolName: "write",
      dispatch: async () => {
        throw new Error("permission denied");
      },
      committed: [],
    };
    const outcome = await runCodeSideToolCall(
      checkpoint,
      liveSignal(),
      TOOL_SITE,
      call,
      new RecordingSink(),
    );
    expect(outcome.kind).toBe("execution-error");
    if (outcome.kind === "execution-error") {
      expect(outcome.error.kind).toBe("code_tool");
      expect(outcome.error.cause).toBe("execution");
      expect(outcome.error.tool_name).toBe("write");
      expect(outcome.error.message).toBe("permission denied");
      expect(outcome.result.ok).toBe(false);
    }
  });
});

// ===========================================================================
// ERR-13 (V14g co-witness) — completed-callee finality on the live code-side
// tool-call surface: a tool call driven to completion keeps its committed side
// effect after a downstream terminal event, with no compensating turn injected
// (error-model.md#err-13; delegated live carrier for V4f).
// ===========================================================================

describe("V14g-T — ERR-13 completed-callee finality on the live V14g surface (error-model.md#err-13)", () => {
  it("ERR-13 (V14g): a code-side tool call driven to completion keeps its committed side effect after a downstream cancel, with no compensating turn injected", async () => {
    const committed: readonly CommittedSideEffect[] = [
      { kind: "tool-call", id: "loom-direct:call-0", description: "write committed" },
    ];
    const call = resolvingCall("write", [text("done")], committed);

    // Drive the tool call to completion on the live surface (commits its effect).
    const outcome = await runCodeSideToolCall(
      new RecordingCheckpoint([]),
      liveSignal(),
      TOOL_SITE,
      call,
      new RecordingSink(),
    );
    expect(outcome.kind).toBe("value");
    if (outcome.kind !== "value") return;
    expect(outcome.committed).toEqual(committed);

    // Fire a downstream cancellation through the no-rollback contract and assert
    // the runtime injects no compensating turn and unwinds nothing — the
    // completed callee's side effect persists (ERR-13, completed-callee finality).
    const spy = new SpyCompensator();
    handleNoRollbackTerminalEvent(
      {
        site: "completed-callee-finality",
        event: "cancellation",
        committed: outcome.committed,
      },
      spy,
    );
    expect(spy.calls).toEqual([]);
    expect(outcome.committed).toHaveLength(1);
  });
});
