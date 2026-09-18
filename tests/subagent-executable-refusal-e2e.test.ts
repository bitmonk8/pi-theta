// RFC-0005 — Step 0 (f) subagent-executable-resolution refusal, wired THROUGH
// the real composition root (`composeExtensionInstance`).
//
// capability-probe.md Step 0 (f) + subagent.md #subagent-executable-resolution:
// when neither executable-resolution rung yields a runnable child `pi` entry
// point, a SUBAGENT-MODE theta MUST refuse registration fail-closed at LOAD with
// `theta/load/subagent-executable-unresolved` (naming the reason) rather than
// failing at first spawn. This drives the REAL wiring: a fake executable host
// whose both rungs fail is injected through the compose seam override, a
// subagent theta and a prompt theta are discovered on disk, and the refusal is
// asserted to be scoped to the subagent theta.
//
// Spec: pi-integration-contract/capability-probe.md (Step 0 (f)),
// pi-integration-contract/subagent.md (#subagent-executable-resolution),
// diagnostics/code-registry-load.md (`theta/load/subagent-executable-unresolved`).

import { resolvingHost, bothRungsFailHost } from "./helpers/fake-json-child";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SUBAGENT_EXECUTABLE_THETAS,
  runExecutableLoad as runLoad,
} from "./helpers/compose-workspace-harness";
import { plantThetaWorkspace, disposeWorkspace } from "./helpers/production-load-harness";
import { SUBAGENT_EXECUTABLE_UNRESOLVED_CODE } from "../src/runtime/subagent-launcher";

let workspaceDir: string;

beforeAll(() => {
  workspaceDir = plantThetaWorkspace("theta-rfc0005-exec-refusal-", SUBAGENT_EXECUTABLE_THETAS);
});

afterAll(() => {
  disposeWorkspace(workspaceDir);
});

describe("RFC-0005 — Step 0 (f) executable-resolution refusal through the composition root", () => {
  it("both rungs fail → the subagent theta is refused registration with theta/load/subagent-executable-unresolved", async () => {
    const outcome = await runLoad(workspaceDir, bothRungsFailHost());

    // The subagent theta does NOT register (fail-closed at load, not first spawn).
    expect(outcome.registered).not.toContain("subq");
    // The pinned diagnostic code is surfaced, naming the reason.
    expect(outcome.noteContent.join("\n")).toContain(
      SUBAGENT_EXECUTABLE_UNRESOLVED_CODE,
    );
  });

  it("the refusal is scoped to subagent mode — the prompt-mode theta still registers", async () => {
    const outcome = await runLoad(workspaceDir, bothRungsFailHost());
    expect(outcome.registered).toContain("promptq");
  });

  it("a resolving host admits the subagent theta (no refusal)", async () => {
    const outcome = await runLoad(workspaceDir, resolvingHost());
    expect(outcome.registered).toContain("subq");
    expect(outcome.noteContent.join("\n")).not.toContain(
      SUBAGENT_EXECUTABLE_UNRESOLVED_CODE,
    );
  });
});
