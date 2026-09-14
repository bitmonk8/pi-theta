// A shared "recording e2e double + env-redirected temp workspace" harness for
// the b0462/b0463 composition-root package-merge test files (PTQ-0258).
//
// WHY THIS FILE EXISTS. tests/b0462-package-identity-dedup.test.ts,
// tests/b0462-package-merge-priority-adjudication.test.ts, and
// tests/b0463-package-source-disc3-validation.test.ts each independently
// redeclared the same `CapturedNote`/`Harness` types, the same `makeHarness`
// factory — a recording `ExtensionAPI`/`ExtensionContext` pair that drives the
// real `createThetaExtension(deps)(pi)` over `composeExtensionInstance` and
// captures every `theta-system-note` diagnostic — and the same
// `HOME`/`USERPROFILE`/`PI_CODING_AGENT_DIR` mint-redirect-restore pair around
// a temp workspace. This module centralises the parts that were byte-for-byte
// identical across those three files; each file's own fixture planting (and
// its own `mkdtemp` prefix) stays local.
//
// (tests/b0458-package-theta-pi-owned-collision.test.ts carries a fourth,
// structurally similar copy that also takes a second `ownedCommands`
// parameter and folds it into `getCommands()`; that shape is out of scope
// here and is left as-is.)
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module. `makeHarness` wires the real, shipped
// `createThetaExtension`/`composeExtensionInstance`
// (`src/extension/factory.ts`/`src/extension/production-composition.ts`);
// nothing about the seam itself is stubbed.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createThetaExtension, type ThetaExtensionDeps } from "../../src/extension/factory";
import { composeExtensionInstance } from "../../src/extension/production-composition";
import { FakeClock } from "./fake-clock";
import { FakeFileWatcher } from "./fake-file-watcher";

export interface CapturedNote {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
}

export interface Harness {
  readonly commands: Map<string, { description?: string }>;
  readonly registrations: string[];
  readonly notes: CapturedNote[];
  fireSessionStart(): Promise<void>;
}

/**
 * The e2e-s6 harness shape: factory + `composeExtensionInstance` over a real
 * temp workspace, recording every `registerCommand` call and every
 * `theta-system-note` diagnostic `pi.sendMessage` carries.
 */
export function makeHarness(cwd: string): Harness {
  const commands = new Map<string, { description?: string }>();
  const registrations: string[] = [];
  const notes: CapturedNote[] = [];
  const subscriptions = new Map<string, ((event: unknown, ctx: ExtensionContext) => unknown)[]>();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: { description?: string }): void => {
      commands.set(name, options);
      registrations.push(name);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
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
    registrations,
    notes,
    fireSessionStart: async () => {
      for (const handler of subscriptions.get("session_start") ?? []) {
        await handler({ type: "session_start" }, ctx);
      }
    },
  };
}

/** Notes carrying registry `code`. */
export function byCode(notes: readonly CapturedNote[], code: string): CapturedNote[] {
  return notes.filter((n) => n.code === code);
}

/** Notes whose message contains `fragment`. */
export function byFragment(notes: readonly CapturedNote[], fragment: string): CapturedNote[] {
  return notes.filter((n) => n.message.includes(fragment));
}

export interface PackageMergeWorkspace {
  readonly cwd: string;
  /** Restore `HOME`/`USERPROFILE`/`PI_CODING_AGENT_DIR` and remove the workspace. */
  readonly dispose: () => void;
}

/**
 * Mint a temp workspace under `<tmpdir>/<prefix>` and redirect
 * `HOME`/`USERPROFILE`/`PI_CODING_AGENT_DIR` into it, so the walk's global
 * root resolves deterministically (no real `~/.pi/agent` scan). Call the
 * returned `dispose()` from `afterEach` to restore the three env vars and
 * remove the workspace.
 */
export function mintWorkspace(prefix: string): PackageMergeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), prefix));
  const savedHome = process.env.HOME;
  const savedUserProfile = process.env.USERPROFILE;
  const savedAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.HOME = cwd;
  process.env.USERPROFILE = cwd;
  process.env.PI_CODING_AGENT_DIR = join(cwd, ".pi", "agent");
  return {
    cwd,
    dispose: (): void => {
      if (savedHome === undefined) delete process.env.HOME;
      else process.env.HOME = savedHome;
      if (savedUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = savedUserProfile;
      if (savedAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = savedAgentDir;
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}
