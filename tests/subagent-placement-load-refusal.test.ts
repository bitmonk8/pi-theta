// RFC-0012 §6 — the load-time gate at the composition root: an EXPLICIT
// `theta.subagentPlacement` that is not selectable refuses every `mode:
// subagent` theta and every theta declaring a `subagent fn` with
// `theta/load/subagent-placement-unavailable` (E), leaves other prompt-mode
// thetas registered, and `auto` never refuses. A backend registered over the
// factory-owned registry (the §5 handle) makes the same selection available.
// In-process over the real `composeExtensionInstance`; zero processes.

import { resolvingHost } from "./helpers/fake-json-child";
import { makeIdleModelHost } from "./helpers/compose-workspace-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  composeExtensionInstance,
  type ComposeSeamOverrides,
  type PlacementRegistrationHandle,
} from "../src/extension/production-composition";
import { PlacementRegistry } from "../src/runtime/subagent-placement-registry";
import { SUBAGENT_PLACEMENT_UNAVAILABLE_CODE } from "../src/runtime/subagent-placement-selection";

import type { PlacedChild, SubagentPlacementBackend } from "../src/runtime/subagent-placement";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

let workspaceDir: string;

beforeAll(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-rfc0012-placement-load-"));
  const dir = join(workspaceDir, ".pi", "theta");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "worker.theta"), ["---", "mode: subagent", "---", '"ok"', ""].join("\n"), "utf8");
  writeFileSync(
    join(dir, "inline.theta"),
    ["---", "mode: prompt", "---", "subagent fn step(x: string): string { x }", 'step("a")', ""].join("\n"),
    "utf8",
  );
  writeFileSync(join(dir, "plain.theta"), ["---", "mode: prompt", "---", '"hello"', ""].join("\n"), "utf8");
  // The explicit selection under test: a backend nobody has registered.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), JSON.stringify({ theta: { subagentPlacement: "herdr" } }), "utf8");
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

function fakeHost(): { pi: ExtensionAPI; ctx: ExtensionContext; notes: string[] } {
  const notes: string[] = [];
  const { pi: basePi, ctx } = makeIdleModelHost(workspaceDir, true);
  const pi = {
    ...basePi,
    sendMessage: (message: { content?: unknown }): void => {
      if (typeof message.content === "string") notes.push(message.content);
    },
  } as unknown as ExtensionAPI;
  return { pi, ctx, notes };
}

function herdr(detect: boolean): SubagentPlacementBackend {
  return {
    name: "herdr",
    priority: 10,
    capabilities: { visible: true, inheritsEnv: true },
    detect: (): boolean => detect,
    place: (): PlacedChild => ({
      handle: "pane",
      capabilities: { observesExit: false, inheritsEnv: true, visible: true },
      onExit: (): void => {},
      kill: (): void => {},
    }),
  };
}

async function compose(
  registration?: PlacementRegistrationHandle,
): Promise<{ registered: string[]; notes: string[]; diagnostics: Diagnostic[] }> {
  const { pi, ctx, notes } = fakeHost();
  const diagnostics: Diagnostic[] = [];
  const overrides: ComposeSeamOverrides = {
    subagentExecutableHost: resolvingHost(),
    subagentControlPlane: { env: {}, entry: { kind: "theta" } },
    emitResultEnvelope: (): void => {},
    ...(registration !== undefined ? { subagentPlacementRegistration: registration } : {}),
  };
  const wiring = await composeExtensionInstance(pi, ctx, overrides);
  // Load notes render `<file>: <code>: <message>` lines; lift the codes back out.
  for (const note of notes) {
    for (const line of note.split("\n")) {
      if (line.includes(SUBAGENT_PLACEMENT_UNAVAILABLE_CODE)) {
        diagnostics.push({ severity: "error", code: SUBAGENT_PLACEMENT_UNAVAILABLE_CODE, message: line });
      }
    }
  }
  return { registered: wiring.thetas.map((t) => t.slashName).sort(), notes, diagnostics };
}

describe("RFC-0012 §6 — explicit unavailable placement refuses child-launching thetas at load", () => {
  it("with `herdr` pinned and nothing registered: the mode: subagent theta and the subagent-fn theta refuse (one E each, at their files); the plain prompt-mode theta registers", async () => {
    const outcome = await compose();
    expect(outcome.registered).toEqual(["plain"]);
    expect(outcome.diagnostics).toHaveLength(2);
    const lines = outcome.diagnostics.map((d) => d.message);
    expect(lines.some((l) => l.includes("worker.theta") && l.includes("subagent placement 'herdr' is unavailable: no registered backend has this name"))).toBe(true);
    expect(lines.some((l) => l.includes("inline.theta") && l.includes("subagent placement 'herdr' is unavailable"))).toBe(true);
  });

  it("a registered, DETECTED `herdr` (the §5 handle) makes the pinned selection available: every theta registers and discover was emitted for the pass", async () => {
    const registry = new PlacementRegistry();
    let discovers = 0;
    const handle: PlacementRegistrationHandle = {
      registry,
      discover: (): void => {
        discovers += 1;
        // A backend answering the discover registers synchronously.
        registry.register(herdr(true));
      },
    };
    const outcome = await compose(handle);
    expect(discovers).toBe(1);
    expect(outcome.registered).toEqual(["inline", "plain", "worker"]);
    expect(outcome.diagnostics).toEqual([]);
  });

  it("a registered but UNDETECTED `herdr` still refuses, naming the detect verdict", async () => {
    const registry = new PlacementRegistry();
    registry.register(herdr(false));
    const outcome = await compose({ registry, discover: (): void => {} });
    expect(outcome.registered).toEqual(["plain"]);
    expect(outcome.diagnostics.every((d) => d.message.includes("the backend is not detected in this environment"))).toBe(true);
  });
});
