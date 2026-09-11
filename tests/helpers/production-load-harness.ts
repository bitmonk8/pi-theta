// A shared "run the shipped composition root over a fake host, mirroring its
// stderr diagnostic channel" load harness (PTQ-0210).
//
// WHY THIS FILE EXISTS. Several test files independently redeclared the same
// `LoadOutcome` shape and the same `runProductionLoad` function: a fake,
// no-UI `ExtensionAPI` / `ExtensionContext` pair sized to
// `discoverAndComposeFixtures`, a `process.stderr.write` interposition that
// captures `makeLoadEmit`'s rendered diagnostic lines (the load's no-UI
// mirror) around one `discoverAndComposeFixtures` call, and a reshape of the
// result into `{registered, notifications, diagnosticLines}`.
//
// TIER: unit, offline, provider-free, deterministic — the same tier as every
// file that imports this module. `discoverAndComposeFixtures` is the real,
// shipped composition-root entry point; nothing about ITS behaviour is
// stubbed, only its `pi` / `ctx` host.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../../src/extension/factory";
import { discoverAndComposeFixtures } from "../../src/extension/production-composition";

export interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
  /** `theta: <file>:<line>:<col>: <code>: <message>`, one per diagnostic. */
  readonly diagnosticLines: readonly string[];
}

/**
 * Run the shipped composition root's discovery/compose pass over `cwd`
 * through a fake, no-UI host: `pi.ui.notify` calls are recorded, and
 * `process.stderr.write` is interposed for the call's duration to capture the
 * load's no-UI diagnostic mirror. The handle is restored in a `.finally`, so
 * no assertion runs while the interposition is live.
 */
export async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const chunks: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  // The stderr mirror is a real production channel (a `-p` / CI operator's only
  // sight of a load diagnostic) written directly rather than through an
  // injectable seam, so interposing on the handle is the only way to read it.
  // The window is one awaited call and the handle is restored on both outcomes,
  // so no assertion below runs while the interposition is live.
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    pi,
    ctx,
  ).finally(() => {
    process.stderr.write = write;
  });

  return {
    registered: fixtures.map((f) => f.slashName),
    notifications,
    diagnosticLines: chunks
      .join("")
      .split(/\r?\n/)
      .filter((line) => line.length > 0),
  };
}
