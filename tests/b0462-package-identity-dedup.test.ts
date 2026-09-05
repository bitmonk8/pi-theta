// Bug 0462 (F1) — package-identity dedup inside the package walker.
//
// package-and-settings.md:30: "A package present in both a project root and a
// global root is deduplicated by package identity (npm package name / git URL
// without ref / resolved absolute path). The project copy wins and the global
// copy contributes nothing; this is package-level dedup, not a
// cross-source-shadow event." discovery-sources.md:89: "The same dedup
// applies … inside the package walker."
//
// Routing package candidates through the walk's five-tier adjudication (the
// 0458/0462/0463 fix) removed the composition root's own slash-name merge loop.
// Without an identity dedup INSIDE `discoverPackageThetas`, the SAME package
// present in a project root and a global root enters the walk as TWO tier-4
// `package`-source candidates with the same stem; `resolveSlashNames` then sees
// a same-priority theta-vs-theta collision and drops BOTH with
// `theta/load/cross-format-collision` — a regression against the dedup DISC
// pins as conformant (0458 §Non-goals, 0462 §Fix).
//
// This witness reds without the F1 dedup (both `lint` copies drop with one
// cross-format-collision error; `lint` never registers) and greens with it (the
// project copy registers alone, no shadow and no collision note). Face (iii) of
// b0462-package-merge-priority-adjudication.test.ts guards the opposite
// direction: two DIFFERENT packages sharing a stem have DIFFERENT identities,
// survive this dedup, and correctly drop-all.
//
// The cross-source-shadow diagnostic is a closed-set carve-out
// (tests/registry-closed-set-corpus-gate.test.ts): located by MESSAGE FRAGMENT,
// never its registry-code literal. The cross-format-collision code is not a
// carve-out and is located by its literal.

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

const CROSS_FORMAT_COLLISION = "theta/load/cross-format-collision";
const SHADOW_FRAGMENT = "shadowed across discovery sources";

function promptTheta(description: string, body: string): string {
  return ["---", "mode: prompt", `description: ${description}`, "---", `@\`${body}\``, ""].join(
    "\n",
  );
}

interface CapturedNote {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
}

interface Harness {
  readonly commands: Map<string, { description?: string }>;
  readonly notes: CapturedNote[];
  fireSessionStart(): Promise<void>;
}

function makeHarness(cwd: string): Harness {
  const commands = new Map<string, { description?: string }>();
  const notes: CapturedNote[] = [];
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
    sendMessage: (message: {
      customType?: string;
      details?: { diagnostics?: readonly CapturedNote[] };
    }): void => {
      if (message?.customType !== "theta-system-note") return;
      const diagnostics = message.details?.diagnostics;
      if (!Array.isArray(diagnostics)) return;
      for (const d of diagnostics) {
        notes.push({ code: d.code, message: d.message, severity: d.severity });
      }
    },
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
    notes,
    fireSessionStart: async () => {
      for (const handler of subscriptions.get("session_start") ?? []) {
        await handler({ type: "session_start" }, ctx);
      }
    },
  };
}

function byCode(notes: readonly CapturedNote[], code: string): CapturedNote[] {
  return notes.filter((n) => n.code === code);
}
function byFragment(notes: readonly CapturedNote[], fragment: string): CapturedNote[] {
  return notes.filter((n) => n.message.includes(fragment));
}

/** Write a package's `package.json` + one theta under `<root>/<pkg>/theta/`. */
function plantPackageThetaAt(
  packageRoot: string,
  pkg: string,
  stem: string,
  contents: string,
): void {
  const dir = join(packageRoot, pkg, "theta");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(packageRoot, pkg, "package.json"),
    JSON.stringify({ name: pkg, version: "1.0.0" }),
    "utf8",
  );
  writeFileSync(join(dir, `${stem}.theta`), contents, "utf8");
}

describe("b0462 (F1) — package-identity dedup inside the package walker", () => {
  let workspace: string;
  let savedHome: string | undefined;
  let savedUserProfile: string | undefined;
  let savedAgentDir: string | undefined;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-b0462-dedup-"));
    savedHome = process.env.HOME;
    savedUserProfile = process.env.USERPROFILE;
    savedAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.HOME = workspace;
    process.env.USERPROFILE = workspace;
    process.env.PI_CODING_AGENT_DIR = join(workspace, ".pi", "agent");
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserProfile;
    if (savedAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = savedAgentDir;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("registers the project copy exactly once, with no collision and no shadow note", async () => {
    // The SAME package `pkg-a` in a PROJECT root (node_modules, enumerated
    // first) and a GLOBAL root (<agentDir>/npm), both shipping `lint.theta`,
    // discriminated by `description:` frontmatter.
    plantPackageThetaAt(
      join(workspace, "node_modules"),
      "pkg-a",
      "lint",
      promptTheta("project-copy-lint", "lint"),
    );
    plantPackageThetaAt(
      join(workspace, ".pi", "agent", "npm"),
      "pkg-a",
      "lint",
      promptTheta("global-copy-lint", "lint"),
    );

    const harness = makeHarness(workspace);
    await harness.fireSessionStart();

    // The project copy wins (enumerated first); it registers exactly once.
    expect(harness.commands.has("lint")).toBe(true);
    expect(harness.commands.get("lint")?.description).toBe("project-copy-lint");

    // Package-level dedup is NOT a cross-source-shadow event…
    expect(byFragment(harness.notes, SHADOW_FRAGMENT)).toHaveLength(0);
    // …and the two copies must NOT reach the walk as two colliding tier-4
    // candidates (which would drop both with a cross-format-collision).
    expect(byCode(harness.notes, CROSS_FORMAT_COLLISION)).toHaveLength(0);
  });
});
