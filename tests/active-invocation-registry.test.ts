// Tests for the `ActiveInvocationRegistry` container.
//
// Spec: pi-integration-contract/active-invocation-registry.md §"Active
// invocation registry" / §"Registry contract".
//
// Per the registry-name-is-internal testing posture, every assertion is on an
// observable side effect — entry counts via the probe seam and insertion-order
// iteration — never on the internal registry symbol. The dispatch-site setup
// and per-invocation `finally` are owned by the producer's bind choke points
// (production-theta-producer.ts) and covered by the producer's own wiring
// tests; the former standalone in-process dispatch-wrap seam
// (`createAgentSession` / `AgentSessionLike`) was retired under RFC-0005.

import { describe, expect, it } from "vitest";
import {
  ActiveInvocationRegistry,
  type ActiveInvocationEntry,
} from "../src/runtime/active-invocation-registry";

// --- helpers --------------------------------------------------------------

function makeEntry(theta: string, invocationId: string): ActiveInvocationEntry {
  return {
    thetaAbort: new AbortController(),
    disposeBarrier: Promise.resolve(),
    shutdownReason: undefined,
    theta,
    invocationId,
  };
}

// --- insertion-order iteration --------------------------------------------

describe("ActiveInvocationRegistry — insertion-order iteration (PIC area)", () => {
  it("iterates registered invocations in insertion order; teardown reaches every entry", () => {
    const registry = new ActiveInvocationRegistry();
    const e1 = makeEntry("alpha", "id-1");
    const e2 = makeEntry("beta", "id-2");
    const e3 = makeEntry("gamma", "id-3");

    registry.add(e1);
    registry.add(e2);
    registry.add(e3);

    // A registered invocation is tracked (entry-count probe).
    expect(registry.size()).toBe(3);

    // Iteration is insertion order, and teardown reaches every in-flight entry:
    // the ordered snapshot the teardown handler walks names all three, in order.
    expect(registry.snapshot().map((entry) => entry.invocationId)).toEqual([
      "id-1",
      "id-2",
      "id-3",
    ]);

    // Removal in the per-invocation `finally` shrinks the live set.
    registry.remove(e2);
    expect(registry.snapshot().map((entry) => entry.invocationId)).toEqual([
      "id-1",
      "id-3",
    ]);
    expect(registry.size()).toBe(2);
  });
});
