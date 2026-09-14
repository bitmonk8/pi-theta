// A shared "discover + dispatch + theta-system-note-channel" harness for the
// test files that drive `discoverAndComposeFixtures` over a planted temp
// `.pi/theta/` workspace, dispatch its top-level fixtures, and read the
// resulting `theta-system-note` channel (PTQ-0225).
//
// WHY THIS FILE EXISTS. tests/b0293-invoke-callee-cause-partition.test.ts and
// tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts each independently
// redeclared the same `RecordedMessage` interface and the same `hostPi` /
// `loadCtx` / `dispatchCtx` / `noteContents` / `errNote` functions, plus the
// same dispatch-loop-and-teardown sequence. This module centralises the parts
// that are byte-for-byte identical (or identical apart from one file-specific
// message string) across those files; each file's own fixture-planting body,
// its top-level stem list, and its own `notes` array stay local.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module.

import { rmSync } from "node:fs";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../../src/extension/factory";

/** One recorded `pi.sendMessage` batch — a `theta-system-note` entry, or off-channel. */
export interface RecordedMessage {
  readonly customType?: string;
  readonly content?: string;
}

/**
 * A host `pi` double for driving `discoverAndComposeFixtures` and dispatching
 * the resulting fixtures fully offline: `sendMessage` records every batch into
 * `notes` (this harness's sole observable); `sendUserMessage` is the
 * provider-turn surface and must never be reached — it throws
 * `offlineViolationMessage`, so a turn slipping in fails loudly rather than
 * silently reaching for credentials.
 */
export function hostPi(notes: RecordedMessage[], offlineViolationMessage: string): ExtensionAPI {
  return {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    registerMessageRenderer: (): void => {},
    sendUserMessage: (): void => {
      throw new Error(offlineViolationMessage);
    },
    sendMessage: (message: RecordedMessage): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
}

/** A `discoverAndComposeFixtures` load context over `cwd`; the UI/model seams are inert. */
export function loadCtx(cwd: string): ExtensionContext {
  return {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;
}

/** A dispatch context over `cwd` for running one discovered top-level `ThetaFixture`. */
export function dispatchCtx(cwd: string): ExtensionCommandContext {
  return {
    cwd,
    signal: undefined,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
    sessionManager: {
      getEntries: (): readonly unknown[] => [],
      getLeafId: (): undefined => undefined,
    },
    waitForIdle: (): Promise<void> => Promise.resolve(),
    isIdle: (): boolean => true,
    abort: (): void => {},
  } as unknown as ExtensionCommandContext;
}

/** Every `theta-system-note` content `notes` recorded, in emission order. */
export function noteContents(notes: readonly RecordedMessage[]): readonly string[] {
  return notes
    .filter((note) => note.customType === "theta-system-note")
    .map((note) => String(note.content));
}

/**
 * The single top-level `Err` note one dispatch produced, out of `notes`. Zero
 * — or more than one — fails loudly naming the whole channel, so a
 * compile/fixture/harness fault can never masquerade as the wrong cause (or a
 * missing suffix).
 */
export function errNote(notes: readonly RecordedMessage[], slashName: string): string {
  const rows = noteContents(notes).filter((content) =>
    content.startsWith(`theta /${slashName} returned Err:`),
  );
  if (rows.length !== 1) {
    throw new Error(
      `harness precondition unmet: /${slashName} produced ${String(rows.length)} top-level ` +
        `Err notes, expected exactly 1 — channel: ${JSON.stringify(noteContents(notes))}`,
    );
  }
  return rows[0] as string;
}

/**
 * Run every planted top-level fixture named in `stems` through `dispatchCtx`,
 * failing loudly naming any stem the composition root did not register.
 */
export async function dispatchTopLevelFixtures(
  fixtures: readonly ThetaFixture[],
  cwd: string,
  stems: readonly string[],
): Promise<void> {
  for (const stem of stems) {
    const fixture = fixtures.find((f) => f.slashName === stem);
    if (fixture === undefined) {
      throw new Error(
        `harness precondition unmet: /${stem} did not register through the production ` +
          `composition root — registered: ${JSON.stringify(fixtures.map((f) => f.slashName))}`,
      );
    }
    await fixture.run("", dispatchCtx(cwd));
  }
}

/** Remove a planted temp workspace, tolerating an unset `dir` (a `beforeAll` throw before planting). */
export function disposeWorkspace(dir: string | undefined): void {
  if (dir !== undefined) {
    rmSync(dir, { recursive: true, force: true });
  }
}
