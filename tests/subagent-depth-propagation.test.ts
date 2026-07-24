// RFC-0006 new coverage — depth propagation across two process levels (INV-4).
//
// Spec: invocation.md (INV-4 wire-level depth carriage across subagent-mode
// child boundaries; the per-chain cap is the process-tree depth bound),
// pi-integration-contract/subagent.md (PIC-58 depth env carriage in the launch
// contract, PIC-59 the trip surfaces to the invoke parent through the envelope),
// diagnostics/code-registry-runtime.md (`theta/runtime/invoke-depth-exceeded`).
//
// Covers: the invoke-depth env var is inherited + incremented across two (fake)
// process levels; the cap trips in the process that hits it (via the existing
// `pushCountableFrame` panic) and SURFACES THROUGH THE ENVELOPE to the invoke
// parent as Err(InvokeInfraError { cause: "panic" }) — the RFC-0006 new surface.
//
// The env carriage + depth counter functions already exist (RFC-0005 /
// invocation.md); the RFC-0006 new surface exercised here is the return
// envelope carrying the depth-exceeded panic. Those envelope calls throw
// `not implemented: RFC 0006`, so each `it` reds on the envelope surfacing.

import { describe, expect, it } from "vitest";
import {
  buildSubagentChildEnv,
  SUBAGENT_INVOKE_DEPTH_ENV,
} from "../src/runtime/subagent-launcher";
import {
  InvokeDepthExceededPanic,
  newInvokeChainAtDepth,
  parseInboundInvokeDepth,
  pushCountableFrame,
  surfaceDepthOverflow,
} from "../src/runtime/invoke-depth-cycle";
import { parseEnvelopeLine, serializeErrEnvelope } from "../src/runtime/subagent-envelope";
import type { InvokeInfraError } from "../src/runtime/query-error";

describe("INV-4 / PIC-59 — depth propagation across two process levels", () => {
  it("the depth env is inherited + incremented across two fake process hops", () => {
    // Level 0 (top) at chain depth 31 launches the level-1 child, marshalling its
    // CURRENT chain depth on the child env.
    const level1Env = buildSubagentChildEnv({ PATH: "/usr/bin" }, 1000, 31);
    expect(level1Env[SUBAGENT_INVOKE_DEPTH_ENV]).toBe("31");

    // Level 1 (child) seeds its top-level chain from the inbound carriage and
    // pushes one countable frame (an `invoke`), incrementing to 32.
    const level1Chain = newInvokeChainAtDepth(parseInboundInvokeDepth(level1Env[SUBAGENT_INVOKE_DEPTH_ENV]));
    expect(level1Chain.depth).toBe(31);
    const level1Pushed = pushCountableFrame(level1Chain, "direct-invoke");
    expect(level1Pushed.depth).toBe(32);

    // Level 1 launches the level-2 grandchild, marshalling its now-incremented
    // chain depth — the counter crosses the process boundary unchanged.
    const level2Env = buildSubagentChildEnv({ PATH: "/usr/bin" }, 1001, level1Pushed.depth);
    expect(level2Env[SUBAGENT_INVOKE_DEPTH_ENV]).toBe("32");
    expect(parseInboundInvokeDepth(level2Env[SUBAGENT_INVOKE_DEPTH_ENV])).toBe(32);
  });

  it("the cap trips in the process that hits it and surfaces to the invoke parent through the envelope", () => {
    // Level 2 (grandchild) seeds its chain at the inbound depth 32 and pushes one
    // more countable frame — bringing the count to 33 (> 32) — which trips the cap
    // in THIS process.
    const level2Chain = newInvokeChainAtDepth(32);
    let panic: InvokeDepthExceededPanic | undefined;
    try {
      pushCountableFrame(level2Chain, "direct-invoke");
    } catch (thrown: unknown) {
      if (thrown instanceof InvokeDepthExceededPanic) {
        panic = thrown;
      } else {
        throw thrown;
      }
    }
    expect(panic, "the 33rd frame trips the depth cap in the grandchild process").toBeDefined();

    // The panic surfaces to the invoke parent as Err(InvokeInfraError { cause:
    // "panic" }) and rides the return envelope back across the process boundary.
    const surface = surfaceDepthOverflow(panic!, { topLevel: false, calleePath: "/theta/grandchild.theta" });
    expect(surface.mode).toBe("nested");
    const nested = surface as { mode: "nested"; error: InvokeInfraError };
    expect(nested.error.cause).toBe("panic");

    // RFC-0006 new surface: the grandchild emits the err envelope; the level-1
    // parent reconstructs it from the `theta_result` line.
    const line = serializeErrEnvelope(nested.error);
    const parsed = parseEnvelopeLine(line.trimEnd());
    expect(parsed.kind).toBe("err");
    if (parsed.kind === "err") {
      const infra = parsed.error as InvokeInfraError;
      expect(infra.kind).toBe("invoke_infra");
      expect(infra.cause).toBe("panic");
    }
  });
});
