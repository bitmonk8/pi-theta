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
import { composeExtensionInstance } from "../src/extension/production-composition";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";

// S6 (PIC / DISC seam at the composition root) — the package-source two-stage
// merge.
//
// code-surface.md §5 / Summary point 3: the discovery WALK defers package
// source (`discoverThetas`, `discovery-walk.ts`, "not plumbed into this walk
// yet"); package thetas are merged in only at the composition root
// (production-composition.ts:319-334), and ONLY when the package theta's slash
// name is not already claimed by a higher/lower-priority walk theta. The
// isolated `discoverPackageThetas` unit tests (tests/package-discovery.test.ts)
// exercise the walk in isolation but NOT this `claimed.has(pkg.name)` merge
// tiebreak. This drives the shipped `composeExtensionInstance` over a real temp
// workspace to pin the merge behaviour end-to-end.
//
// Spec: discovery/package-and-settings.md (DISC-5 package source, priority-4);
// registration-steps.md §slash-handler-registration (PIC-31 survivors).
//
// The `os.homedir()` global package roots (`~/.pi/agent/npm|git`) are redirected
// to the empty temp workspace so the walk is deterministic (no real global
// package scan).

const PROJECT_DUP = ["---", "mode: prompt", "---", "@`project`", ""].join("\n");
const PACKAGE_DUP = ["---", "mode: prompt", "---", "@`package`", ""].join("\n");
const PACKAGE_UNIQUE = ["---", "mode: prompt", "---", "@`package`", ""].join(
  "\n",
);

interface Harness {
  readonly commands: Map<string, { description?: string }>;
  readonly registrations: string[];
  fireSessionStart(): Promise<void>;
}

function makeHarness(cwd: string): Harness {
  const commands = new Map<string, { description?: string }>();
  const registrations: string[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: { description?: string }): void => {
      commands.set(name, options);
      registrations.push(name);
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
    cwd,
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

  return {
    commands,
    registrations,
    fireSessionStart: async () => {
      for (const handler of subscriptions.get("session_start") ?? []) {
        await handler({ type: "session_start" }, ctx);
      }
    },
  };
}

describe("S6 — composition-root package two-stage merge", () => {
  let workspace: string;
  let savedHome: string | undefined;
  let savedUserProfile: string | undefined;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-s6-pkgmerge-"));
    // Redirect os.homedir() so the global package roots resolve under the empty
    // workspace (deterministic — no real ~/.pi/agent scan).
    savedHome = process.env.HOME;
    savedUserProfile = process.env.USERPROFILE;
    process.env.HOME = workspace;
    process.env.USERPROFILE = workspace;

    // Project theta (walk-discovered, higher priority) claiming `dup`.
    const thetaDir = join(workspace, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    writeFileSync(join(thetaDir, "dup.theta"), PROJECT_DUP, "utf8");

    // A project-local node_modules package (priority-4) with a conventional
    // `theta/` dir: a COLLIDING `dup` and a UNIQUE `uniquepkg`.
    const pkgThetas = join(workspace, "node_modules", "pkg-a", "theta");
    mkdirSync(pkgThetas, { recursive: true });
    writeFileSync(
      join(workspace, "node_modules", "pkg-a", "package.json"),
      JSON.stringify({ name: "pkg-a", version: "1.0.0" }),
      "utf8",
    );
    writeFileSync(join(pkgThetas, "dup.theta"), PACKAGE_DUP, "utf8");
    writeFileSync(join(pkgThetas, "uniquepkg.theta"), PACKAGE_UNIQUE, "utf8");
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserProfile;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("merges in a uniquely-named package theta (unclaimed) and drops a package theta whose name is already claimed by a walk theta", async () => {
    const harness = makeHarness(workspace);
    await harness.fireSessionStart();

    // The unique package theta is merged in at the composition root (its slash
    // name is unclaimed by the walk).
    expect(harness.commands.has("uniquepkg")).toBe(true);

    // The colliding name is registered exactly once: the package `dup` is
    // dropped by the `!claimed.has(pkg.name)` tiebreak (production-composition
    // .ts:319-334), so it never enters the composed set and cannot override /
    // duplicate the higher-priority project walk theta.
    expect(harness.commands.has("dup")).toBe(true);
    expect(harness.registrations.filter((n) => n === "dup")).toHaveLength(1);

    // Only the three expected commands register (no stray package duplicate).
    expect(new Set(harness.registrations)).toEqual(
      new Set(["dup", "uniquepkg"]),
    );
  });
});
