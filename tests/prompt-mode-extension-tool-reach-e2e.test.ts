// Bug 0001 / PIC-64 — PROMPT-mode extension-tool reach END-TO-END through the
// production compose helper (`discoverAndComposeFixtures`): a prompt-mode theta
// discovered on disk, whose `tools:` names an extension-registered tool and
// whose CODE calls it, (a) REGISTERS (mode-independent admission +
// parent-established host-loop rung) and (b) at dispatch drives the tool
// through host-loop dispatch against the PARENT'S live host session — the
// fabricated bridge turn executes the tool, the code-supplied arguments arrive
// VERBATIM, and the session model + active set are restored afterwards.
//
// The fake parent host simulates Pi's agent loop through the SAME shared
// fabricated-turn simulation production-host-loop-dispatch.test.ts drives
// (tests/helpers/fake-host-loop-host.ts `FakeHostLoopHost`) — `sendUserMessage`
// schedules a fabricated turn that invokes the registered bridge provider's
// two-state `streamSimple`, executes the authored `tool_use` against a fake tool
// executor, appends the toolResult transcript entry, and fires `agent_settled` —
// but here it backs the COMPOSITION-BUILT dispatch (the real
// `createProductionHostLoopDispatch`, wired inside the `runComposePass` the
// shipped root shares), not an injected seam: load and dispatch are production;
// registration is not reached. This wrapper contributes only the PARENT leg's
// load-pass surfaces (the discovery/admission `ExtensionAPI` / `ExtensionContext`
// doubles), delegating every host-loop member to the shared core.
//
// Also witnessed: LOAD-TIME-ONLY resolution — `pi.getAllTools()` is consulted
// at load and NOT re-consulted by invocations (Resolution snapshot: "the
// runtime never re-queries Pi's tool registry by name during execution").
//
// Spec: pi-integration-contract/subagent.md PIC-64 (#pic-64,
// #subagent-host-loop-dispatch — the parent leg), frontmatter-fields-a.md
// §`tools` (mode-independent admission), frontmatter-fields-b-and-templates.md
// §Resolution snapshot (*Prompt-mode extension-tool leg*),
// tool-registration-lifetime.md PIC-17 (the query-window/turn active-set
// protocol the dispatch reuses), docs/bugs/0001-extension-tools-unreachable.md.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import { EXTENSION_TOOL_UNREACHABLE_CODE } from "../src/runtime/host-loop-dispatch";
import { FakeHostLoopHost } from "./helpers/fake-host-loop-host";

// --- The planted prompt-mode theta ------------------------------------------

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/**
 * The bug-0001 acceptance theta: PROMPT mode, an extension tool in `tools:`,
 * and a CODE-side call to it (the zero-token side-effect channel). The `?`
 * unwraps the tool's Ok so the body's final value is the tool text.
 */
const CODECALL = theta(
  "---",
  "mode: prompt",
  "tools: my_tool",
  "---",
  'my_tool({ op: "write", n: 7 })?',
);

const MY_TOOL_SCHEMA = {
  type: "object",
  properties: { op: { type: "string" }, n: { type: "number" } },
  required: ["op"],
} as const;

// --- Fake parent host --------------------------------------------------------

/**
 * The fake PARENT host: serves the production compose helper's load pass (the
 * discovery/admission `pi` + `ctx` surfaces) AND simulates the user session's
 * host agent loop for the composition-built host-loop dispatch — the SAME
 * shared fabricated-turn core production-host-loop-dispatch.test.ts drives
 * (`FakeHostLoopHost`), with only the parent-leg load-pass surfaces added.
 */
class FakeParentHost {
  /** The shared fabricated-turn simulation (providers, model, active set, transcript). */
  readonly loop: FakeHostLoopHost;
  readonly notifications: string[] = [];
  readonly notes: string[] = [];
  getAllToolsCalls = 0;

  constructor(readonly cwd: string) {
    this.loop = new FakeHostLoopHost((name, args) => ({
      content: [{ type: "text", text: `RAN:${name}:${JSON.stringify(args)}` }],
      isError: false,
    }));
  }

  get executorCalls(): readonly { name: string; args: unknown }[] {
    return this.loop.executorCalls;
  }

  get currentModelId(): string {
    return this.loop.currentModelId;
  }

  get activeTools(): readonly string[] {
    return this.loop.activeTools;
  }

  get pi(): ExtensionAPI {
    const loop = this.loop;
    return {
      getFlag: (): undefined => undefined,
      getCommands: (): readonly unknown[] => [],
      sendMessage: (message: { content?: unknown }): void => {
        if (typeof message.content === "string") {
          this.notes.push(message.content);
        }
      },
      registerMessageRenderer: (): void => {},
      getActiveTools: (): string[] => loop.getActiveTools(),
      setActiveTools: (names: string[]): void => loop.setActiveTools(names),
      // The extension-registered tool the mode-independent admission reads —
      // COUNTED so the load-time-only-resolution invariant is assertable.
      getAllTools: (): readonly unknown[] => {
        this.getAllToolsCalls += 1;
        return [
          {
            name: "my_tool",
            parameters: MY_TOOL_SCHEMA,
            sourceInfo: { scope: "user" },
          },
        ];
      },
      registerProvider: (name: string, config: { streamSimple: unknown }): void =>
        loop.registerProvider(name, config),
      unregisterProvider: (name: string): void => loop.unregisterProvider(name),
      setModel: (model: Model<Api>): Promise<boolean> => loop.setModel(model),
      sendUserMessage: (content: string): void => loop.sendUserMessage(content),
      on: (event: string, handler: () => void): void => loop.on(event, handler),
    } as unknown as ExtensionAPI;
  }

  get ctx(): ExtensionContext {
    const host = this;
    const loop = this.loop;
    return {
      cwd: this.cwd,
      hasUI: true,
      get model(): Model<Api> {
        return loop.currentModel;
      },
      isIdle: (): boolean => loop.isIdle(),
      modelRegistry: {
        getAvailable: (): readonly unknown[] => [],
        find: (provider: string, id: string): Model<Api> | undefined =>
          loop.findRegisteredModel(provider, id),
      },
      sessionManager: {
        getEntries: (): readonly { type: string; message?: Record<string, unknown> }[] =>
          [...loop.entries],
        getLeafId: (): undefined => undefined,
      },
      ui: {
        notify: (message: string): void => {
          host.notifications.push(message);
        },
      },
    } as unknown as ExtensionContext;
  }

  /** The per-dispatch `ExtensionCommandContext` a slash dispatch would carry. */
  runCtx(): ExtensionCommandContext {
    const loop = this.loop;
    return {
      signal: undefined,
      cwd: this.cwd,
      get model(): Model<Api> {
        return loop.currentModel;
      },
      isIdle: (): boolean => loop.isIdle(),
      waitForIdle: (): Promise<void> => Promise.resolve(),
      modelRegistry: {
        getAvailable: (): readonly unknown[] => [],
        find: (provider: string, id: string): Model<Api> | undefined =>
          loop.findRegisteredModel(provider, id),
      },
      sessionManager: {
        getEntries: (): readonly { type: string; message?: Record<string, unknown> }[] =>
          [...loop.entries],
        getLeafId: (): undefined => undefined,
      },
      ui: { notify: (): void => {} },
    } as unknown as ExtensionCommandContext;
  }
}

// --- Suite -------------------------------------------------------------------

let workspaceDir: string;
let host: FakeParentHost;
let fixtures: readonly ThetaFixture[];
let getAllToolsCallsAtLoad: number;

function fixtureOf(name: string): ThetaFixture {
  const fixture = fixtures.find((f) => f.slashName === name);
  expect(
    fixture,
    `the prompt-mode code-calling theta '${name}' did not register — ` +
      "PIC-64 mode-independent admission + the parent host-loop rung are not wired. " +
      "Registered: " + JSON.stringify(fixtures.map((f) => f.slashName)) +
      "; notifications: " + JSON.stringify(host.notifications),
  ).toBeDefined();
  return fixture as ThetaFixture;
}

beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0001-e2e-"));
  const dir = join(workspaceDir, ".pi", "theta");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "codecall.theta"), CODECALL, "utf8");
  host = new FakeParentHost(workspaceDir);
  fixtures = await discoverAndComposeFixtures(host.pi, host.ctx);
  getAllToolsCallsAtLoad = host.getAllToolsCalls;
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

describe("bug 0001 e2e — prompt-mode code-side extension-tool reach through the production compose helper", () => {
  it("the prompt-mode code-calling theta REGISTERS (admission + parent host-loop rung), with no unknown-tool and no extension-tool-unreachable refusal", () => {
    expect(fixtures.map((f) => f.slashName)).toContain("codecall");
    expect(host.notifications.join("\n")).not.toContain("unknown Pi tool 'my_tool'");
    expect(host.notes.join("\n")).not.toContain(EXTENSION_TOOL_UNREACHABLE_CODE);
  });

  it("resolution is LOAD-time: the registry snapshot (pi.getAllTools) was consulted during the load pass", () => {
    expect(
      getAllToolsCallsAtLoad,
      "prompt-mode admission resolves against the pi.getAllTools() snapshot at theta-load time",
    ).toBeGreaterThanOrEqual(1);
  });

  it("dispatching the theta drives the extension tool through the PARENT's host loop with the code-supplied arguments VERBATIM, then restores the model and active set", async () => {
    const fixture = fixtureOf("codecall");

    await fixture.run("", host.runCtx());

    // The host agent loop executed the tool exactly once, with the verbatim
    // deterministic arguments (zero model tokens — the bridge authored the call).
    expect(host.executorCalls).toEqual([
      { name: "my_tool", args: { op: "write", n: 7 } },
    ]);
    // The bridge model is NOT left installed on the user's session…
    expect(host.currentModelId).toBe("real-model");
    // …and the ambient active set is restored to its pre-dispatch snapshot.
    expect(host.activeTools).toEqual(["ambient-a", "ambient-b"]);
  });

  it("invocation does NOT re-resolve: a second dispatch executes the tool again with ZERO further pi.getAllTools reads", async () => {
    const fixture = fixtureOf("codecall");
    const callsBefore = host.getAllToolsCalls;
    const executionsBefore = host.executorCalls.length;

    await fixture.run("", host.runCtx());

    // The tool ran again through the pinned load-time resolution…
    expect(host.executorCalls.length).toBe(executionsBefore + 1);
    // …without a single re-resolution against the registry snapshot
    // (Resolution snapshot: invocation does not re-resolve).
    expect(host.getAllToolsCalls).toBe(callsBefore);
  });
});
