// RFC-0006 new coverage — subagent-root regime + mode-regress guard (PIC-58).
//
// Spec: pi-integration-contract/subagent.md (PIC-58 #subagent-root-regime,
// #subagent-launch-contract env-marker rule), conversation-drive.md (prompt-mode
// driver mechanics), invocation.md (INV-4 the regime does not reset call-chain
// accounting).
//
// Covers:
//   - regime detection from the `PI_THETA_SUBAGENT_ROOT` env marker (set only by
//     the parent launcher, never authorable from a `.theta` file);
//   - the mode-regress guard: under the active regime, a `mode: subagent`
//     PROCESS-ROOT theta is driven in-process against the host session (NO child
//     spawn for the root), while a NESTED `mode: subagent` callee still spawns
//     its own child (the no-recursion guarantee).
//
// RED EXPECTATION (RFC-0006 not yet implemented): `detectSubagentRootRegime` /
// `selectSubagentDriver` throw `not implemented: RFC 0006`, so each assertion
// reds on its primary behaviour; the paired implementation greens them.

import { describe, expect, it } from "vitest";
import {
  detectSubagentRootRegime,
  selectSubagentDriver,
  SUBAGENT_ROOT_ENV_MARKER,
  type RootRegime,
} from "../src/runtime/subagent-root-regime";
import type { ThetaMode } from "../src/parser/frontmatter";

const ACTIVE: RootRegime = { active: true, slug: "code_review" };
const INACTIVE: RootRegime = { active: false };

describe("PIC-58 — subagent-root regime detection", () => {
  it("the regime marker is the parent-launcher-only `PI_THETA_SUBAGENT_ROOT` env var", () => {
    expect(SUBAGENT_ROOT_ENV_MARKER).toBe("PI_THETA_SUBAGENT_ROOT");
  });

  it("detects the active regime carrying the marked root slug", () => {
    const regime = detectSubagentRootRegime({ [SUBAGENT_ROOT_ENV_MARKER]: "code_review" });
    expect(regime.active).toBe(true);
    if (regime.active) {
      expect(regime.slug).toBe("code_review");
    }
  });

  it("is inactive when the marker is absent (this process is not a subagent child)", () => {
    expect(detectSubagentRootRegime({ PATH: "/usr/bin" }).active).toBe(false);
  });
});

describe("PIC-58 — mode-regress guard (driver selection)", () => {
  it("under the active regime, the `mode: subagent` PROCESS ROOT is driven IN-PROCESS (no child spawn)", () => {
    const selection = selectSubagentDriver({
      mode: "subagent" as ThetaMode,
      isProcessRoot: true,
      regime: ACTIVE,
    });
    // The regime, not the frontmatter `mode:`, selects the driver: the root runs
    // against the child process's own host session — a naive spawn would be
    // circular (a grandchild for the process root).
    expect(selection.kind).toBe("in-process-root");
  });

  it("a NESTED `mode: subagent` callee (not the process root) still SPAWNS its own child", () => {
    const selection = selectSubagentDriver({
      mode: "subagent" as ThetaMode,
      isProcessRoot: false,
      regime: ACTIVE,
    });
    // The no-recursion guarantee: the regime governs ONLY the process root, so a
    // nested subagent callee spawns in the normal way.
    expect(selection.kind).toBe("spawn-child");
  });

  it("outside the regime, a `mode: subagent` theta SPAWNS a child (the normal subagent path)", () => {
    const selection = selectSubagentDriver({
      mode: "subagent" as ThetaMode,
      isProcessRoot: true,
      regime: INACTIVE,
    });
    expect(selection.kind).toBe("spawn-child");
  });
});
