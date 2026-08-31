import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createThetaExtension,
  type ThetaExtensionDeps,
} from "../src/extension/factory";
import {
  composeExtensionInstance,
  discoverAndComposeFixtures,
} from "../src/extension/production-composition";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";

// S6 (PIC) — WITNESS for FIND-S6-1 (theta-defect, FIXED): the theta `description:`
// frontmatter (and `///` doc-comment lowering into it — DESC area) is threaded to
// `pi.registerCommand` on BOTH production composition paths.
//
// Spec: registration-steps.md §slash-handler-registration (REQ-PIC-31): the
// factory "registers survivors via `pi.registerCommand(name,{description,handler})`
// (only `description`+`handler` keys)"; frontmatter-fields-a.md: `description`
// populates the Pi autocomplete dropdown entry.
//
// Fix: `runComposePass` reconstructs each runnable as
// `{ ...composedInput, ...(description), run: fixture.run }`
// (production-composition.ts:1150), threading the TOP-LEVEL `description` that
// `composeThetaFixture` computed (theta-composition-producer.ts:300-303). The
// factory registers with `fixture.description` (factory.ts:370), so the
// description reaches `pi.registerCommand` — the autocomplete entry is texted.
//
// These tests assert the CORRECT (conforming) behaviour post-fix (assertions
// marked `// FIND-S6-1 (fixed)`).

const THETA_WITH_DESC = [
  "---",
  "mode: prompt",
  "description: HELLO-DESC",
  "---",
  "@`hi`",
  "",
].join("\n");

describe("S6 FIND-S6-1 — description drop on the discoverAndComposeFixtures path", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-s6-desc-a-"));
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    writeFileSync(
      join(workspace, ".pi", "theta", "hi.theta"),
      THETA_WITH_DESC,
      "utf8",
    );
    // A minimal valid settings file pins the fixture's settings read to a known
    // value. An ABSENT settings file is silent (package-and-settings.md
    // §Failure modes), so the plant is hermeticity, not noise suppression.
    writeFileSync(join(workspace, ".pi", "settings.json"), "{}", "utf8");
  });
  afterEach(() => rmSync(workspace, { recursive: true, force: true }));

  it("parses description into frontmatter and threads it onto the composed runnable's top-level description", async () => {
    const pi = {
      getFlag: (): undefined => undefined,
      getCommands: (): unknown[] => [],
      sendMessage: (): void => {},
      registerCommand: (): void => {},
      registerMessageRenderer: (): void => {},
      registerFlag: (): void => {},
      on: (): void => {},
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd: workspace,
      hasUI: false,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] },
      ui: { notify: (): void => {} },
    } as unknown as ExtensionContext;

    const thetas = await discoverAndComposeFixtures(pi, ctx);
    expect(thetas).toHaveLength(1);
    const theta = thetas[0] as { description?: string; frontmatter?: { description?: string } };

    // Parsing is correct: the frontmatter carries the description.
    expect(theta.frontmatter?.description).toBe("HELLO-DESC");
    // FIND-S6-1 (fixed): the top-level `description` the factory reads is threaded.
    expect(theta.description).toBe("HELLO-DESC");
  });
});

describe("S6 FIND-S6-1 — description drop reaches pi.registerCommand on the composeInstance path", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-s6-desc-b-"));
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    writeFileSync(
      join(workspace, ".pi", "theta", "hi.theta"),
      THETA_WITH_DESC,
      "utf8",
    );
  });
  afterEach(() => rmSync(workspace, { recursive: true, force: true }));

  it("registers the slash command WITH the description option (autocomplete entry texted)", async () => {
    const commands = new Map<string, { description?: string }>();
    const subscriptions = new Map<
      string,
      ((event: unknown, ctx: ExtensionContext) => unknown)[]
    >();
    const pi = {
      registerFlag: (): void => {},
      registerMessageRenderer: (): void => {},
      registerCommand: (name: string, options: { description?: string }): void => {
        commands.set(name, options);
      },
      on: (
        event: string,
        handler: (e: unknown, c: ExtensionContext) => unknown,
      ): void => {
        const list = subscriptions.get(event) ?? [];
        list.push(handler);
        subscriptions.set(event, list);
      },
      getFlag: (): undefined => undefined,
      getCommands: (): { name: string; source: string }[] =>
        [...commands.keys()].map((name) => ({ name, source: "extension" })),
      sendMessage: (): void => {},
      sendUserMessage: (): void => {},
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd: workspace,
      hasUI: false,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] },
      ui: { notify: (): void => {} },
    } as unknown as ExtensionContext;

    const deps: ThetaExtensionDeps = {
      fixtures: [],
      composeInstance: (composePi, composeCtx) =>
        composeExtensionInstance(composePi, composeCtx, {
          fileWatcher: new FakeFileWatcher(),
          clock: new FakeClock(),
        }),
    };
    createThetaExtension(deps)(pi);
    for (const handler of subscriptions.get("session_start") ?? []) {
      await handler({ type: "session_start" }, ctx);
    }

    expect(commands.has("hi")).toBe(true);
    // FIND-S6-1 (fixed): REQ-PIC-31 requires `{description,handler}`; the
    // description now reaches the registered options.
    expect(commands.get("hi")).toHaveProperty("description", "HELLO-DESC");
  });
});
