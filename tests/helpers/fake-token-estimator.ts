// V8e — in-memory `FakeTokenEstimator` conforming `TokenEstimator` seam test
// double (PIC-16). Drives the session-context truncation bounds at chosen
// per-message integer counts rather than coupling a test to Pi's estimation
// heuristic: the constructor takes the per-message counts it should report
// (keyed by message identity), and `estimate(message)` returns the configured
// integer for each message rather than deriving one from message content.
//
// Spec: host-interfaces-services.md PIC-16.

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { TokenEstimator } from "../../src/seams/token-estimator";

export class FakeTokenEstimator implements TokenEstimator {
  readonly #counts: ReadonlyMap<AgentMessage, number>;

  constructor(counts: ReadonlyMap<AgentMessage, number>) {
    this.#counts = counts;
  }

  estimate(message: AgentMessage): number {
    const count = this.#counts.get(message);
    // No silent fallback: an unconfigured message is a test-setup defect, not a
    // zero count that would silently corrupt the truncation-bounds total.
    if (count === undefined) {
      throw new Error(
        "FakeTokenEstimator.estimate: no configured count for the supplied message",
      );
    }
    return count;
  }
}
