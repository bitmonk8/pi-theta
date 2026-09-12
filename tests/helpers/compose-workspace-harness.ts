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
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module.

import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { registryMessage } from "../../tools/code-registry/index.js";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import { composeExtensionInstance } from "../../src/extension/production-composition";
import { RendererGate, SYSTEM_NOTE_CHANNEL } from "../../src/extension/system-note-channel";
import type { ParsedTheta } from "../../src/extension/reload-wiring";

export type PiHandler = (event: unknown, ctx: ExtensionContext) => unknown;

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

/** A recording `ExtensionAPI` / `ExtensionContext` pair for `composeExtensionInstance`. */
export function makeHost(cwd: string): HostDouble {
  const notes: RecordedNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const handlers = new Map<string, PiHandler>();

  const pi = {
    registerFlag: (): void => {},
    getFlag: (): undefined => undefined,
    getCommands: (): readonly { name: string; source: string }[] => [],
    on: (event: string, handler: PiHandler): void => {
      handlers.set(event, handler);
    },
    registerCommand: (): void => {},
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {},
    sendMessage: (message: { customType: string; content: string; details: unknown }): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        details: message.details,
      });
    },
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, type: "error"): void => {
        notified.push([message, type]);
      },
    },
  } as unknown as ExtensionContext;

  return { pi, ctx, notes, notified };
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
export async function runLoadPass(workspace: ComposeWorkspace): Promise<LoadPass> {
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

// ── Observation helpers (PTQ-0230) ──────────────────────────────────────────

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
 * exactly as each importing file's own bug report does.
 */
export function requireDriven(pass: LoadPass, bugId: string): void {
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
 * against `undefined`.
 */
export function normativeMessagePattern(
  registry: readonly { readonly code: string; readonly message: string }[],
  code: string,
): RegExp {
  const message = registryMessage(registry, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      "harness: the docs/spec_topics/diagnostics/ registry pages carry no Message row for " +
        `${code} — the DIAG-4 column is this file's only message oracle, so a missing row ` +
        "is a harness failure, never a skip",
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}
