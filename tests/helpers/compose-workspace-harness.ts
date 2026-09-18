// A shared "recording host double + temp compose workspace" harness for the
// composition-root load-pass test files that drive `composeExtensionInstance`
// over a planted temp directory (PTQ-0213).
//
// WHY THIS FILE EXISTS. Several test files independently redeclared the same
// `PiHandler` type, `RecordedNote` / `HostDouble` interfaces, `makeHost`
// function, `ComposeWorkspace` interface, `normalisePath` function, and the
// settings-file-planting tail every temp workspace needs. This module
// centralises the parts that are byte-for-byte identical across those files;
// each file's own fixture-planting loop (which varies — a plain string body,
// or a body that is itself a function of the minted `cwd`) stays local and
// calls `finishWorkspace` once its own files are written.
//
// It also centralises the adjacent, textually-following half of the same
// harness family (PTQ-0230): the `LoadPass` shape `runLoadPass` returns by
// driving `composeExtensionInstance` over a `makeHost` double, and the
// `RecordedNote`/`Diagnostic` reading functions built on it
// (`noteDiagnostics`, `allDiagnostics`, `describeNotes`, `errorRowsAt`,
// `errorFilesOf`, `requireDriven`) and the DIAG-4 message-pattern builder
// (`normativeMessagePattern`) several sibling composition-root test files
// redeclared byte-for-byte (or near so — an interpolated bug number, an
// added timing field) rather than imported.
//
// `expectCallerRefusedWithCalleeHasErrors` (PTQ-0300) is this same family's
// caller-refusal assertion: a caller above a callee that failed its own
// structural checks must not register, and must carry exactly one
// error-severity row of `code`, matching `messagePattern`. Two sibling files
// redeclared it byte-for-byte apart from one interpolated noun naming the
// condition below the caller (`entryNoun`); the code and its registry-backed
// message pattern stay the caller's own, so the assertion takes both as
// parameters instead of pinning one code.
//
// `makeIdleModelHost` supplies the no-op host + idle, one-model context used
// by result-channel and registration-refusal tests; recording hooks stay local.
//
// TIER: unit, offline, deterministic, provider-free. Live load cells also reuse
// the pure `theta` text builder.

import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { registryMessage } from "../../tools/code-registry/index.js";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import { composeExtensionInstance } from "../../src/extension/production-composition";
import { RendererGate, SYSTEM_NOTE_CHANNEL } from "../../src/extension/system-note-channel";
import type { ParsedTheta } from "../../src/extension/reload-wiring";
import type { ExecutableHost } from "../../src/runtime/subagent-launcher";

export type PiHandler = (event: unknown, ctx: ExtensionContext) => unknown;

// The canonical factory-time `pi.on` subscription order (steps 1/3/4 of
// registration-steps.md): `resources_discover` (step 1, after the `--theta`
// flag), `session_start` (step 3), `session_shutdown` (step 4).
export const SUBSCRIPTION_ORDER = [
  "resources_discover",
  "session_start",
  "session_shutdown",
] as const;
export type PiEvent = (typeof SUBSCRIPTION_ORDER)[number];

export interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly details: unknown;
}

export interface HostDouble {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly notes: RecordedNote[];
  readonly notified: Array<readonly [string, string]>;
}

/** Inert SDK members shared by composition/bootstrap doubles; recording and fault hooks stay local. */
export function makeInertSdkMembers() {
  return {
    getFlag: (): undefined => undefined,
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
  };
}

export interface HostOptions {
  /** Runs after recording each send; may throw to simulate failed delivery. */
  readonly onSendMessage?: (message: RecordedNote) => void;
  /** Runs after recording each toast; may throw to simulate an unavailable UI. */
  readonly onNotify?: (message: string) => void;
}

/** A recording `ExtensionAPI` / `ExtensionContext` pair for `composeExtensionInstance`. */
export function makeHost(cwd: string, opts: HostOptions = {}): HostDouble {
  const notes: RecordedNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const handlers = new Map<string, PiHandler>();

  const pi = {
    ...makeInertSdkMembers(),
    registerFlag: (): void => {},
    getCommands: (): readonly { name: string; source: string }[] => [],
    on: (event: string, handler: PiHandler): void => {
      handlers.set(event, handler);
    },
    registerCommand: (): void => {},
    registerMessageRenderer: (): void => {},
    sendMessage: (message: { customType: string; content: string; details: unknown }): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        details: message.details,
      });
      opts.onSendMessage?.(message);
    },
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, type: "error"): void => {
        notified.push([message, type]);
        opts.onNotify?.(message);
      },
    },
  } as unknown as ExtensionContext;

  return { pi, ctx, notes, notified };
}

/** The one model the idle host registry offers. */
const AVAILABLE_MODEL = { id: "claude-test", provider: "anthropic", api: "anthropic-messages" };

export interface IdleModelHostOptions {
  /** Record string notes emitted during composition, when supplied. */
  readonly noteContent?: string[];
  /** Registry entries for mode-independent tool admission. Default: no tools. */
  readonly tools?: readonly unknown[];
  /** PIC-64 rung-2 surfaces; false models a host with no host-loop rung. Default true. */
  readonly hostLoopSurfaces?: boolean;
  /** Expose the upstream rung-1 member without wiring a dispatcher. Default false. */
  readonly getToolDefinitionMember?: boolean;
}

/** A no-op composition host with one available model and an empty, idle session. */
export function makeIdleModelHost(
  cwd: string,
  hasUI: boolean,
  options?: IdleModelHostOptions,
): { pi: ExtensionAPI; ctx: ExtensionContext } {
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (message: { content?: unknown }): void => {
      if (typeof message.content === "string") {
        options?.noteContent?.push(message.content);
      }
    },
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    getAllTools: (): readonly unknown[] => [...(options?.tools ?? [])],
    registerMessageRenderer: (): void => {},
    // PIC-64 rung 2 (host-loop dispatch) Pi surfaces — present by default so the
    // `probeHostLoopSurfaces` probe passes in BOTH the parent and the
    // child-regime runs (the rung is establishable wherever the surfaces are).
    // The surfaces-absent variant drops `registerProvider`, killing the probe.
    ...(options?.hostLoopSurfaces ?? true
      ? {
          registerProvider: (): void => {},
          unregisterProvider: (): void => {},
          setModel: (): Promise<boolean> => Promise.resolve(true),
        }
      : {}),
    // The rung-1 upstream surface, exposed WITHOUT any rung-1 dispatcher
    // existing in the codebase — the host shape that must not let registration
    // outrun dispatchability.
    ...(options?.getToolDefinitionMember === true
      ? { getToolDefinition: (): undefined => undefined }
      : {}),
    on: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    hasUI,
    model: AVAILABLE_MODEL,
    isIdle: (): boolean => true,
    modelRegistry: {
      getAvailable: (): readonly unknown[] => [AVAILABLE_MODEL],
      find: (): undefined => undefined,
    },
    sessionManager: { getEntries: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;
  return { pi, ctx };
}

export interface ComposeWorkspace {
  readonly cwd: string;
  /** Absolute, separator-normalised path of a file planted on the project source. */
  path: (name: string) => string;
  readonly dispose: () => void;
}

/** Separator-normalise a path so Win32 `\` and POSIX `/` spellings compare. */
export function normalisePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Finish planting a temp compose workspace at `cwd`, once a caller has written
 * its own `.pi/theta/` (and optional `outside/`) fixture files there: write a
 * minimal valid settings file — an ABSENT settings file is silent
 * (package-and-settings.md §Failure modes), so the plant is hermeticity, not
 * noise suppression — and return the `ComposeWorkspace` handle.
 */
export function finishWorkspace(cwd: string): ComposeWorkspace {
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    path: (name: string): string => normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}

// ── The load pass (PTQ-0230) ────────────────────────────────────────────────

export interface LoadPass {
  /** Every `theta-system-note` the pass put on the channel, in order. */
  readonly notes: readonly RecordedNote[];
  readonly offChannel: readonly RecordedNote[];
  readonly notified: readonly (readonly [string, string])[];
  /** Slash names the pass actually registered. */
  readonly registered: readonly string[];
  readonly thetas: readonly ParsedTheta[];
}

/**
 * Drive the SHIPPED composition root over the planted workspace with an
 * UNDEGRADED `RendererGate`, so every note takes the transcript
 * (`pi.sendMessage`) arm the author reads.
 */
export async function runLoadPass(workspace: Pick<ComposeWorkspace, "cwd">): Promise<LoadPass> {
  const host = makeHost(workspace.cwd);
  const wiring = await composeExtensionInstance(host.pi, host.ctx, undefined, new RendererGate());
  return {
    notes: host.notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL),
    offChannel: host.notes.filter((n) => n.customType !== SYSTEM_NOTE_CHANNEL),
    notified: host.notified,
    registered: wiring.thetas.map((t) => t.slashName),
    thetas: wiring.thetas,
  };
}

export function theta(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

export const SUBAGENT_EXECUTABLE_THETAS: readonly { readonly stem: string; readonly text: string }[] = [
  // A subagent-mode theta: refused when the child `pi` executable is unresolvable.
  { stem: "subq", text: theta("---", "mode: subagent", "model: claude-test", "---", "@`hi`") },
  // A prompt-mode theta: never launches a child, so it MUST still register.
  { stem: "promptq", text: theta("---", "mode: prompt", "---", "@`hi`") },
];

export interface ExecutableLoadOutcome {
  readonly registered: readonly string[];
  readonly noteContent: readonly string[];
}

/** Load prompt/subagent fixtures through the real executable-host override seam. */
export async function runExecutableLoad(cwd: string, host: ExecutableHost): Promise<ExecutableLoadOutcome> {
  const noteContent: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    // The load-phase pre-eval note channel routes error-severity load diagnostics
    // through `pi.sendMessage`; capture the rendered content so the pinned code
    // can be witnessed.
    sendMessage: (message: { content?: unknown }): void => {
      if (typeof message.content === "string") {
        noteContent.push(message.content);
      }
    },
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    hasUI: true,
    modelRegistry: {
      getAvailable: (): readonly unknown[] => [
        { id: "claude-test", provider: "anthropic", api: "anthropic-messages" },
      ],
    },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const wiring = await composeExtensionInstance(pi, ctx, { subagentExecutableHost: host });
  return { registered: wiring.thetas.map((t) => t.slashName), noteContent };
}

// ── Observation helpers (PTQ-0230) ──────────────────────────────────────────

/**
 * The note LINES (split across every note) that contain ALL of `substrings`.
 * Load-refusal notes render as `<file>: <code>: <message>`, so matching a code
 * AND the refusing theta's filename on ONE line attributes the refusal to that
 * theta — a whole-pass `toContain` would be satisfied by any other theta's
 * refusal in the same pass.
 */
export function noteLinesContaining(
  noteContent: readonly string[],
  ...substrings: readonly string[]
): string[] {
  return noteContent
    .flatMap((note) => note.split("\n"))
    .filter((line) => substrings.every((substring) => line.includes(substring)));
}

export function noteDiagnostics(note: RecordedNote): readonly Diagnostic[] {
  const details = note.details as { diagnostics?: unknown } | undefined;
  const diagnostics = details?.diagnostics;
  if (!Array.isArray(diagnostics)) {
    expect.fail(
      `system note carries no details.diagnostics array: ${JSON.stringify(note.details)}`,
    );
  }
  return diagnostics as readonly Diagnostic[];
}

export function allDiagnostics(notes: readonly RecordedNote[]): readonly Diagnostic[] {
  return notes.flatMap((note) => [...noteDiagnostics(note)]);
}

export function describeNotes(notes: readonly RecordedNote[]): string {
  return notes.length === 0
    ? "[] (NO NOTE ON THE CHANNEL)"
    : notes.map((n, i) => `[${i}] ${n.content}`).join("\n");
}

/** Error-severity rows the pass located at `file`, in emission order. */
export function errorRowsAt(pass: LoadPass, file: string): readonly Diagnostic[] {
  return allDiagnostics(pass.notes).filter(
    (d) => d.severity === "error" && normalisePath(d.file ?? "") === file,
  );
}

/** Files at which the pass located an error-severity row of `code`, sorted. */
export function errorFilesOf(pass: LoadPass, code: string): readonly string[] {
  return allDiagnostics(pass.notes)
    .filter((d) => d.severity === "error" && d.code === code)
    .map((d) => normalisePath(d.file ?? "?"))
    .sort();
}

/**
 * The host double must have been driven at all before any decision means
 * anything. `bugId` (e.g. `"0275"`) names the fixture in the thrown message,
 * exactly as each importing file's own bug report does. `requireNotes` keeps
 * diagnostic-channel witnesses from accepting registration alone as evidence.
 */
export function requireDriven(pass: LoadPass, bugId: string, requireNotes = false): void {
  if (pass.notes.length === 0 && requireNotes) {
    throw new Error(
      "harness: the composition root put NOTHING on the theta-system-note channel — " +
        `the bug-${bugId} fixture no longer reaches the diagnostic channel, so no spelling ` +
        "below is verified",
    );
  }
  if (pass.notes.length === 0 && pass.registered.length === 0) {
    throw new Error(
      "harness: the composition root neither registered a theta nor put anything on the " +
        `theta-system-note channel — the bug-${bugId} fixture no longer reaches the load pass, ` +
        "so nothing below is verified",
    );
  }
}

/**
 * The row's normative *Message* (DIAG-4) as a regex with the `<placeholder>`
 * slots opened up. Throws naming the registry pages when the row is absent, so
 * registry drift can never degrade a presence assertion into a comparison
 * against `undefined`. Live callers may supply their own fail-loud precondition.
 */
export function normativeMessagePattern(
  registry: readonly { readonly code: string; readonly message: string }[],
  code: string,
  onMissing?: () => never,
): RegExp {
  const message = registryMessage(registry, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    if (onMissing !== undefined) onMissing();
    throw new Error(
      "harness: the docs/spec_topics/diagnostics/ registry pages carry no Message row for " +
        `${code} — the DIAG-4 column is this file's only message oracle, so a missing row ` +
        "is a harness failure, never a skip",
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}

/**
 * `docs/spec_topics/invocation.md` line 22 at a `tools:` edge above a callee
 * that failed its own structural checks: the caller does not register, and
 * EXACTLY ONE error-severity row is located at its file, `code`, matching
 * `messagePattern` (DIAG-4). `entryNoun` names the condition below the caller
 * in the failure message (e.g. `"escaping entry"`, `"prompt-mode entry"`),
 * exactly as each importing bug file's own report phrases it (PTQ-0300).
 */
export function expectCallerRefusedWithCalleeHasErrors(
  pass: LoadPass,
  callerPath: string,
  callerStem: string,
  code: string,
  messagePattern: RegExp,
  entryNoun: string,
): void {
  expect(
    pass.registered,
    "the caller must not register over a callee this same pass un-registers\n" +
      describeNotes(pass.notes),
  ).not.toContain(callerStem);

  const rows = errorRowsAt(pass, callerPath);
  expect(
    rows.map((d) => d.code),
    `one ${entryNoun} below this caller is one condition, so exactly one error-severity ` +
      `row belongs at ${callerPath}, and it is ${code}\n` +
      describeNotes(pass.notes),
  ).toEqual([code]);
  expect((rows[0] as Diagnostic).message, `${code} message`).toMatch(messagePattern);
}

// Narrow the recorded diagnostics to exactly one, failing loudly (no silent
// skip) when the factory emitted none or more than one.
export function exactlyOne(diagnostics: readonly Diagnostic[]): Diagnostic {
  if (diagnostics.length !== 1) {
    expect.fail(
      `expected exactly one extension-bootstrap-failed diagnostic, got ${diagnostics.length}`,
    );
  }
  return diagnostics[0] as Diagnostic;
}

/** Read an installed factory subscription, failing loudly when it is absent. */
export function requireHandler(
  host: { readonly handlers: Map<string, PiHandler> },
  event: string,
): PiHandler {
  const handler = host.handlers.get(event);
  if (handler === undefined) {
    expect.fail(
      `the factory installed no '${event}' subscription (installed: ${[...host.handlers.keys()].join(", ") || "none"})`,
    );
  }
  return handler;
}

/** Spy `console.error`, returning its accumulating argument log. */
export function captureConsoleError(): unknown[][] {
  const calls: unknown[][] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]): void => {
    calls.push(args);
  });
  return calls;
}

/** Capture fresh `console.error` calls per test; validate before restoring, even on failure. */
export function captureConsoleErrorForEach(options: {
  readonly writeThrough?: boolean;
  readonly assertLines?: (lines: readonly string[]) => void;
} = {}): { readonly calls: unknown[][] } {
  const capture = { calls: [] as unknown[][] };
  let restore: (() => void) | undefined;
  beforeEach(() => {
    capture.calls = options.writeThrough
      ? vi.spyOn(console, "error").mock.calls
      : captureConsoleError();
    const spy = vi.mocked(console.error);
    restore = () => spy.mockRestore();
  });
  afterEach(() => {
    try {
      options.assertLines?.(capture.calls.map((args) => args.map(String).join(" ")));
    } finally {
      restore?.();
      restore = undefined;
    }
  });
  return capture;
}

/** Spy `process.stderr.write`, returning its accumulating chunk log. */
export function captureStderr(): string[] {
  const chunks: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation(
    (chunk: string | Uint8Array): boolean => {
      chunks.push(String(chunk));
      return true;
    },
  );
  return chunks;
}
