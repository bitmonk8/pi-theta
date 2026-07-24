// RFC-0006 parent-side subagent wire (rebased from the retired RFC-0005
// `subagent-rpc-wire.test.ts`).
//
// Under RFC 0006 the parent no longer drives a remote RPC session: the whole
// callee runs in a spawned child `pi --mode json -p "/<slug>"`, and the
// parent-side contract reduces to ENVELOPE CONSUMPTION (PIC-59) plus stdin-close
// cancellation (PIC-63). The retired RPC wire surface (`serializePromptCommand`
// / `serializeAbortCommand` / `parseRpcEventLine` / `readTerminalAgentEnd` /
// `queryChildResolvedModel`) is gone; this suite preserves its coverage INTENT
// against the successor surface — the parent-side drive loop over the child's
// stdout envelope line, with stray-line tolerance, Ok/Err mapping, fail-closed
// child-exit-without-envelope, and stdin-close cancellation — exercised over the
// `FakeJsonChild` harness through the real `driveSubagentChild` /
// `attachSubagentStdinCancellation`.
//
// Spec: pi-integration-contract/subagent.md (PIC-59, PIC-63), invocation.md
// (INV-5), diagnostics/code-registry-runtime.md.

import { describe, expect, it } from "vitest";
import {
  attachSubagentStdinCancellation,
  driveSubagentChild,
} from "../src/runtime/subagent-json-driver";
import {
  SUBAGENT_ENVELOPE_PARSE_FAILED_CODE,
  SUBAGENT_EXIT_WITHOUT_ENVELOPE_CODE,
} from "../src/runtime/subagent-envelope";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { InvokeInfraError, QueryError, TransportError } from "../src/runtime/query-error";
import { WallClock } from "../src/seams/wall-clock";
import { FakeJsonChild } from "./helpers/fake-json-child";

function driveOver(
  child: FakeJsonChild,
  thetaAbort: AbortController,
  emitted: Diagnostic[],
): ReturnType<typeof driveSubagentChild> {
  return driveSubagentChild({
    child,
    thetaAbort,
    calleePath: "/theta/child.theta",
    provider: "anthropic",
    emitDiagnostic: (d) => emitted.push(d),
    clock: new WallClock(),
  });
}

describe("RFC-0006 — parent-side subagent json wire: envelope consumption (PIC-59)", () => {
  it("resolves Ok(value) from the reserved-key envelope line, ignoring stray --mode json events before it", async () => {
    const child = new FakeJsonChild();
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);

    // Stray, valid `--mode json` event lines and garbage precede the envelope —
    // the parent ignores every non-`theta_result` line.
    child.emitEventLine({ type: "agent_start" });
    child.emitRawLine("not json at all {");
    child.emitEventLine({ type: "tool_call", name: "read" });
    child.emitOkEnvelope({ verdict: "approved", score: 3 });

    const result = await drive;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ verdict: "approved", score: 3 });
    }
    // No failure diagnostic on the clean Ok path.
    expect(emitted).toHaveLength(0);
  });

  it("resolves Err(QueryError) from an `err` envelope (transport fidelity preserved across the wire)", async () => {
    const child = new FakeJsonChild();
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);

    const transport: TransportError = {
      kind: "transport",
      message: "provider 500",
      http_status: 500,
      provider: "anthropic",
      retryable: true,
    };
    child.emitErrEnvelope(transport as QueryError);

    const result = await drive;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("transport");
      expect((result.error as TransportError).http_status).toBe(500);
    }
  });

  it("fail-closed: a child that exits WITHOUT an envelope maps to Err(InvokeInfraError internal_error) + subagent-exit-without-envelope", async () => {
    const child = new FakeJsonChild();
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);

    // Crash (nonzero exit) with no envelope — never a fabricated value.
    child.crashWith(1, null, "boom");

    const result = await drive;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const infra = result.error as unknown as InvokeInfraError;
      expect(infra.kind).toBe("invoke_infra");
      expect(infra.cause).toBe("internal_error");
    }
    const codes = emitted.map((d) => d.code);
    expect(codes).toContain(SUBAGENT_EXIT_WITHOUT_ENVELOPE_CODE);
    // The companion crash-detail diagnostic rides alongside on a nonzero exit.
    expect(codes).toContain("theta/runtime/subagent-child-crashed");
  });

  it("a reserved-key line that fails the pinned schema maps fail-closed + subagent-envelope-parse-failed", async () => {
    const child = new FakeJsonChild();
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);

    // Carries the reserved key but neither the `ok` nor `err` arm.
    child.emitRawLine(JSON.stringify({ theta_result: { v: 1 } }));
    child.crashWith(0, null);

    const result = await drive;
    expect(result.ok).toBe(false);
    expect(emitted.map((d) => d.code)).toContain(SUBAGENT_ENVELOPE_PARSE_FAILED_CODE);
  });
});

describe("RFC-0006 — parent-side subagent json wire: stdin-close cancellation (PIC-63)", () => {
  it("aborting closes the child's parent-held stdin pipe (the grace signal)", () => {
    const child = new FakeJsonChild({ exitOnStdinEof: false });
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const reg = attachSubagentStdinCancellation(abort, child, {
      emitDiagnostic: (d) => emitted.push(d),
    });

    expect(child.stdinClosed).toBe(false);
    abort.abort();
    expect(child.stdinClosed).toBe(true);
    reg.detach();
  });

  it("the spawn-then-immediate-cancel path closes stdin synchronously (already-aborted at attach)", () => {
    const child = new FakeJsonChild({ exitOnStdinEof: false });
    const abort = new AbortController();
    abort.abort();
    attachSubagentStdinCancellation(abort, child, { emitDiagnostic: () => {} });
    expect(child.stdinClosed).toBe(true);
  });

  it("an aborted invocation whose child exited without an envelope maps to Err(cancelled), not internal_error", async () => {
    const child = new FakeJsonChild({ exitOnStdinEof: true });
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);
    attachSubagentStdinCancellation(abort, child, { emitDiagnostic: (d) => emitted.push(d) });

    // Abort → stdin close → the fake child exits on EOF WITHOUT an envelope. The
    // cancellation short-circuit wins over the no-envelope map (PIC-63).
    abort.abort();

    const result = await drive;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("cancelled");
    }
  });
});
