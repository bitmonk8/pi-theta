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
// Also provides the session-free `composeThetaFixture` dispatch scaffold for
// active-invocation and cancellation wiring tests (PTQ-0403).
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module.

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../../src/extension/factory";
import type { ThetaCompositionInput } from "../../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../../src/parser/frontmatter";
import type { ThetaBody } from "../../src/parser/theta-document";
import type { Clock } from "../../src/seams/clock";
import type { RuntimeRoot } from "../../src/runtime-root";
import type { Checkpoint } from "../../src/seams/checkpoint";

export { disposeWorkspace } from "./production-load-harness";

/** One recorded `pi.sendMessage` batch — a `theta-system-note` entry, or off-channel. */
export interface RecordedMessage {
  readonly customType?: string;
  readonly content?: string;
  readonly display?: boolean;
  readonly details?: Record<string, unknown>;
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

export function rootWith(
  checkpoint: Checkpoint,
  invocationId = "inv-1",
  clock?: Clock,
): RuntimeRoot {
  return {
    checkpoint,
    idSource: { newInvocationId: () => invocationId, newToolCallId: () => "tc-1" },
    ...(clock === undefined ? {} : { clock }),
  } as unknown as RuntimeRoot;
}

export function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {} } as unknown as ExtensionAPI;
}

export function promptTheta(): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" } as ParsedFrontmatter;
  return {
    slashName: "demo",
    sourcePath: "/theta/demo.theta",
    frontmatter,
    body: { statements: [], tail: null } as unknown as ThetaBody,
  };
}

/** The dispatch ctx the drive seam threads: `signal: undefined` is the
 *  documented idle-entry the cancel-forwarding tolerates, and the `fail`-outcome
 *  surface never touches `sessionManager`. */
export function driveCtx(): ExtensionCommandContext {
  return { signal: undefined, cwd: "/tmp" } as unknown as ExtensionCommandContext;
}

/** Flush pending microtasks/macrotasks so `run` reaches the parked binder or
 *  body await before the registry is sampled. */
export const tick = (): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Record every `pi.sendMessage` payload without a provider-turn surface. */
export function recordingPi(log: RecordedMessage[]): ExtensionAPI {
  return {
    sendMessage: (message: RecordedMessage): void => {
      log.push(message);
    },
  } as unknown as ExtensionAPI;
}
