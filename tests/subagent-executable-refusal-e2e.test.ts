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

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { composeExtensionInstance } from "../src/extension/production-composition";
import type { ExecutableHost } from "../src/runtime/subagent-launcher";
import { SUBAGENT_EXECUTABLE_UNRESOLVED_CODE } from "../src/runtime/subagent-launcher";

function theta(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

const THETAS: readonly { readonly stem: string; readonly text: string }[] = [
  // A subagent-mode theta: refused when the child `pi` executable is unresolvable.
  { stem: "subq", text: theta("---", "mode: subagent", "model: claude-test", "---", "@`hi`") },
  // A prompt-mode theta: never launches a child, so it MUST still register.
  { stem: "promptq", text: theta("---", "mode: prompt", "---", "@`hi`") },
];

/** An executable host whose BOTH resolution rungs fail (no runnable entry point). */
function bothRungsFailHost(): ExecutableHost {
  return {
    argv1: undefined, // rung 1: no entry script
    execPath: "/usr/bin/node", // rung 2: a generic runtime is not Pi itself
    fileExists: (): boolean => false,
    isGenericRuntime: (): boolean => true,
  };
}

/** An executable host whose rung 1 resolves (a runnable entry point exists). */
function resolvingHost(): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (): boolean => false,
  };
}

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly noteContent: readonly string[];
}

async function runLoad(cwd: string, host: ExecutableHost): Promise<LoadOutcome> {
  const noteContent: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    // The load-phase pre-eval note channel routes error-severity load diagnostics
    // through `pi.sendMessage`; capture the rendered content so the pinned code
    // can be witnessed.
    sendMessage: (message: { content?: unknown }): void => {
      if (typeof message.content === "string") {
        noteContent.push(message.content);
      }
    },
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    hasUI: true,
    modelRegistry: {
      getAvailable: (): readonly unknown[] => [
        { id: "claude-test", provider: "anthropic", api: "anthropic-messages" },
      ],
    },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const wiring = await composeExtensionInstance(pi, ctx, { subagentExecutableHost: host });
  return { registered: wiring.thetas.map((t) => t.slashName), noteContent };
}

let workspaceDir: string;

beforeAll(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-rfc0005-exec-refusal-"));
  const dir = join(workspaceDir, ".pi", "theta");
  mkdirSync(dir, { recursive: true });
  for (const l of THETAS) {
    writeFileSync(join(dir, `${l.stem}.theta`), l.text, "utf8");
  }
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
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
