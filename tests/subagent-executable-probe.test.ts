// RFC-0005 new coverage — Step 0 (f) subagent-executable-resolution probe.
//
// The three in-process capability-3 pins (createAgentSession / ResourceLoader /
// SessionManager.inMemory) leave the Step 0 probe under RFC-0005; their
// replacement is the executable-resolution ladder, asserted at PROBE time
// (filesystem-existence only, no spawn). A host where neither rung yields a
// runnable child `pi` entry point fails theta registration FAIL-CLOSED with the
// probe's OWN precise diagnostic — theta/load/subagent-executable-unresolved —
// not theta/load/host-incompatible, and there is deliberately NO PATH fallback.
//
// Spec: pi-integration-contract/capability-probe.md Step 0 (f);
// pi-integration-contract/subagent.md #subagent-executable-resolution;
// diagnostics/code-registry-load.md (theta/load/subagent-executable-unresolved).
//
// RED EXPECTATION (RFC-0005 not yet implemented): the both-rungs-fail refusal
// assertion reds against the non-compliant probe stub; the paired
// implementation leaf greens it.

import { describe, expect, it } from "vitest";
import { probeSubagentExecutable } from "../src/extension/capability-probe";
import {
  SUBAGENT_EXECUTABLE_UNRESOLVED_CODE,
  SUBAGENT_EXECUTABLE_UNRESOLVED_MESSAGE,
  type ExecutableHost,
} from "../src/runtime/subagent-launcher";

function host(overrides: Partial<ExecutableHost>): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (p): boolean => /(?:^|\/)(?:node|bun)$/.test(p),
    ...overrides,
  };
}

describe("RFC-0005 — Step 0 (f) subagent-executable-resolution probe", () => {
  it("rung 1 present (argv[1] names an existing file) → the probe passes", () => {
    const outcome = probeSubagentExecutable(
      host({ argv1: "/app/pi/dist/index.js", fileExists: (p): boolean => p === "/app/pi/dist/index.js" }),
    );
    expect(outcome.ok).toBe(true);
  });

  it("rung 2 present (non-generic Pi binary) → the probe passes", () => {
    const outcome = probeSubagentExecutable(
      host({ argv1: undefined, execPath: "/opt/pi/pi", fileExists: (): boolean => false }),
    );
    expect(outcome.ok).toBe(true);
  });

  it("both rungs fail → fail-closed load-time refusal with theta/load/subagent-executable-unresolved (NO PATH fallback)", () => {
    const outcome = probeSubagentExecutable(
      host({ argv1: undefined, execPath: "/usr/bin/node", fileExists: (): boolean => false }),
    );

    // Fail-closed at load time: the theta does not register and the diagnostic
    // names the reason under its OWN code (not host-incompatible).
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.diagnostic.code).toBe(SUBAGENT_EXECUTABLE_UNRESOLVED_CODE);
      expect(outcome.diagnostic.message).toBe(SUBAGENT_EXECUTABLE_UNRESOLVED_MESSAGE);
    }
  });
});
