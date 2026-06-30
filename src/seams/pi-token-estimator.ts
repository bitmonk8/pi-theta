// V8e — `PiTokenEstimator` production adapter for the `TokenEstimator` seam (PIC-16).
//
// Production wiring delegates `estimate(message)` to the `estimateTokens` named
// import from `@earendil-works/pi-coding-agent`, forwarding the message and
// returning the import's result unchanged — redefining none of Pi's estimation
// algorithm. The seam is relied on as a deterministic pure function of its
// `message` argument at a fixed Pi-SDK pin.
//
// Spec: host-interfaces-services.md PIC-16; host-interfaces-core.md
// #estimatetokens-named-export.

import { estimateTokens } from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { TokenEstimator } from "./token-estimator";

export class PiTokenEstimator implements TokenEstimator {
  estimate(message: AgentMessage): number {
    // Delegate to Pi's pinned `estimateTokens`, returning its result unchanged
    // — loom redefines none of Pi's estimation algorithm. Relied on as a
    // deterministic pure function of `message` at the fixed Pi-SDK pin.
    return estimateTokens(message);
  }
}
