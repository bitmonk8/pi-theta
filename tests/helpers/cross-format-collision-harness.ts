// A shared "factory + composeExtensionInstance seam over a real mkdtemp
// workspace" harness for the cross-format-collision bug-witness files
// (PTQ-0251).
//
// WHY THIS FILE EXISTS. tests/b0459-cross-format-collision-message-form.test.ts's
// "cell 4" and tests/b0460-skill-arm-vacuous-at-pin.test.ts's top-level harness
// each independently redeclared the same `FakeCommandInfo` shape, the same
// `pi`/`ctx`/`fire` object-literal harness wiring `createThetaExtension` +
// `composeExtensionInstance` with a `FakeClock` and a `FakeFileWatcher`, and the
// same closing assertion block for the rendered collision note. This module
// centralises the pieces that were byte-for-byte identical between the two.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module. `makeHarness` wires the real, shipped
// `createThetaExtension` / `composeExtensionInstance`
// (`src/extension/factory.ts` / `src/extension/production-composition.ts`)
// over a fake `pi`/`ctx` pair; nothing about the seam itself is stubbed.

import { expect } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createThetaExtension, type ThetaExtensionDeps } from "../../src/extension/factory";
import { composeExtensionInstance } from "../../src/extension/production-composition";
import { FakeClock } from "./fake-clock";
import { FakeFileWatcher } from "./fake-file-watcher";

/** One `pi.getCommands()` entry — the fake's `SlashCommandInfo` shape, extended
 *  (per bug 0024's harness) with the optional host-populated `sourceInfo` whose
 *  `path` the pinned host carries for every prompt template. */
export interface FakeCommandInfo {
  readonly name: string;
  readonly source: string;
  readonly sourceInfo?: {
    readonly path: string;
    readonly source: string;
    readonly scope: string;
    readonly origin: string;
  };
}

export interface CollisionHarness {
  readonly pi: ExtensionAPI;
  readonly notes: string[];
  readonly registeredNames: () => string[];
  fireSessionStart(): Promise<void>;
}

/**
 * Factory + composeExtensionInstance seam over a real mkdtemp workspace.
 * `extra` plants the genuine Pi-owned entry under test; the extension's own
 * registrations come back as `source: "extension"`, exactly as the host
 * reports them.
 */
export function makeHarness(cwd: string, extra: readonly FakeCommandInfo[]): CollisionHarness {
  const commands = new Map<string, unknown>();
  const notes: string[] = [];
  const subscriptions = new Map<string, ((e: unknown, c: ExtensionContext) => unknown)[]>();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    // Faithful to the host: an extension's own registrations come back as
    // `source: "extension"`; `extra` plants the genuine Pi-owned entry.
    getCommands: (): readonly FakeCommandInfo[] => [
      ...[...commands.keys()].map((name) => ({ name, source: "extension" })),
      ...extra,
    ],
    sendMessage: (message: { content: string }): void => {
      notes.push(message.content);
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const fire = async (event: string): Promise<void> => {
    for (const handler of subscriptions.get(event) ?? []) {
      await handler({ type: event }, ctx);
    }
  };

  const clock = new FakeClock();
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    composeInstance: async (pi2, ctx2, ownRegisteredNames) =>
      composeExtensionInstance(
        pi2,
        ctx2,
        { fileWatcher: new FakeFileWatcher(), clock },
        undefined,
        ownRegisteredNames,
      ),
  };
  createThetaExtension(deps)(pi);

  return {
    pi,
    notes,
    registeredNames: () => [...commands.keys()],
    fireSessionStart: () => fire("session_start"),
  };
}

/**
 * Assert exactly one collision note, that it names `forwardMd` (the colliding
 * `.md` sibling, forward-slash spelled), carries no off-template
 * ` (Pi-owned command '<name>' survives)` suffix, and no backslash anywhere in
 * the rendered paths (bug 0459 §Fix).
 */
export function expectSoleCollisionNote(collision: readonly string[], forwardMd: string): void {
  expect(
    collision,
    `expected exactly one collision note; got ${JSON.stringify(collision)}`,
  ).toHaveLength(1);
  const note = collision[0]!;
  // (a) the `.md` sibling is named, forward-slash spelled.
  expect(note).toContain(forwardMd);
  // (b) no off-template survives-suffix.
  expect(note).not.toContain("survives)");
  // (c) forward-slash spelling: no backslash anywhere in the rendered paths.
  expect(note).not.toMatch(/\\/);
}
