// Shared window-1 producer prompt-mode query harness for the active-set
// restore-protocol witnesses (PTQ-1311).
//
// WHY THIS FILE EXISTS. tests/b0372-active-set-restore-protocol.test.ts and
// tests/b0433-active-set-advisory-note-no-details.test.ts each declared the
// same `InstantSettleSession` + `piDouble`/`ctxDouble`/`rootDouble`/`parse`/
// `driveQuery` scaffold to drive one production prompt-mode query window
// (`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`,
// the b0288 pattern) over an in-memory instant-settle session double, diverging
// only in the gate double's throw behaviour and the shape each file captures
// off `pi.sendMessage`. This module centralises the drive, parameterised over
// the gate double and the session's `sendMessage` capture, so both files (and
// any later active-set-restore witness) call one definition.
//
// TIER: unit, offline, deterministic, provider-free. The producer, binding and
// executor are the real, shipped ones; only the `RuntimeRoot`/`ExtensionAPI`
// host around them is doubled.

import { expect } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../../src/runtime/statement-executor";
import { ajv, sessionBranch } from "./scripted-live-session-harness";
import { rootDouble as beltRootDouble } from "./runtime-belt-probe-harness";
import type { RuntimeRoot } from "../../src/runtime-root";
import type { ThetaDocument } from "../../src/parser/theta-document";
import { parseDoc } from "./e2e-s1";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import type { SystemNoteChannelDeps } from "../../src/extension/system-note-channel";

export const ANTHROPIC_MODEL = { id: "m1", api: "anthropic-messages", provider: "anthropic", strictCapable: true };
export const QUERY_SNAPSHOT = ["ambient-x", "ambient-y"];
export const QUERY_REPLY = "604";
export const ONE_QUERY_THETA = ["---", "mode: prompt", "---", "let v = @`Ping`?", "v", ""].join("\n");

/** A `SessionManager` message entry (the `buildSessionContext` read shape). */
export interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

/** The message shape `pi.sendMessage` receives on this window. */
export interface SystemNoteMessage {
  customType?: string;
  content?: string;
  display?: boolean;
  details?: unknown;
}

/** The narrow gate surface the window's `piDouble` forwards to. */
export interface ActiveSetGateDouble {
  getActiveTools(): string[];
  setActiveTools(names: string[]): void;
}

/**
 * The instant-settle user-session double: `sendUserMessage` commits the user
 * entry AND the reply inside the same tick (the b0288 guard-cell shape), so the
 * turn is settled without `isIdle()` ever being observed false and the drive's
 * fast path binds the reply. `sendMessage` hands every message to the caller's
 * `capture`; whatever it returns (non-`undefined`) is recorded on `notes`, so
 * each suite chooses the wire shape it inspects (content/display only, or the
 * full `details`-bearing message).
 */
export class InstantSettleSession<TNote> {
  readonly entries: SessionEntryDouble[] = [];
  readonly notes: TNote[] = [];

  constructor(
    readonly reply: string,
    private readonly capture: (message: SystemNoteMessage) => TNote | undefined,
  ) {}

  sendUserMessage(text: string): void {
    this.#appendUser(text);
    this.#appendAssistant(this.reply);
  }

  isIdle(): boolean {
    return true;
  }

  sendMessage(message: SystemNoteMessage): void {
    const captured = this.capture(message);
    if (captured !== undefined) this.notes.push(captured);
  }

  #appendUser(text: string): void {
    this.#append({ role: "user", content: [{ type: "text", text }], timestamp: 0 });
  }

  #appendAssistant(text: string): void {
    this.#append({
      role: "assistant",
      content: [{ type: "text", text }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "m1",
      stopReason: "stop",
      timestamp: 0,
    });
  }

  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
}

/** Parse the fixture theta, loud on any error-severity diagnostic. */
export function parse(src: string): ThetaDocument {
  const doc = parseDoc(src, "probe.theta");
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/** The belt's fixed synchronous-clock root, plus the AJV schema validator. */
export function rootDouble(): RuntimeRoot {
  return { ...beltRootDouble(), schemaValidator: ajv() };
}

export function piDouble(
  session: InstantSettleSession<unknown>,
  gate: ActiveSetGateDouble,
): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => gate.getActiveTools(),
    setActiveTools: (names: string[]): void => gate.setActiveTools(names),
    registerTool: (): void => {},
    on: (): void => {},
    sendMessage: (message: SystemNoteMessage): void => session.sendMessage(message),
  } as unknown as ExtensionAPI;
}

export function ctxDouble(session: InstantSettleSession<unknown>): ExtensionCommandContext {
  return {
    model: ANTHROPIC_MODEL,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
      getBranch: (): readonly SessionEntryDouble[] => sessionBranch(session.entries),
    },
  } as unknown as ExtensionCommandContext;
}

export interface QueryDriveResult<TNote, TGate extends ActiveSetGateDouble> {
  readonly execution: BodyExecution;
  readonly session: InstantSettleSession<TNote>;
  readonly gate: TGate;
  readonly diagnostics: Diagnostic[];
  readonly caught: unknown;
}

/**
 * Drive the one-query theta through the production prompt-mode binding with the
 * given session and gate doubles. Captures a THROW out of `executeBody` (the
 * masking shape a bare restore throw takes: a plain `Error` reframed one layer
 * up, above this seam) rather than letting it abort the test as an opaque
 * harness error.
 */
export async function driveQueryWindow<TNote, TGate extends ActiveSetGateDouble>(
  session: InstantSettleSession<TNote>,
  gate: TGate,
): Promise<QueryDriveResult<TNote, TGate>> {
  const doc = parse(ONE_QUERY_THETA);
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const diagnostics: Diagnostic[] = [];
  const systemNoteChannel: SystemNoteChannelDeps = {
    pi: {
      sendMessage: (message): void => session.sendMessage(message),
    },
    ui: { notify: (): void => {} },
    emitDiagnostic: (d): void => {
      diagnostics.push(d);
    },
  };
  const deps = createProductionProducerDeps({
    pi: piDouble(session, gate),
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    emitDiagnostic: (d): void => {
      diagnostics.push(d);
    },
    systemNoteChannel,
  });
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxDouble(session) });
  expect(
    binding.drivenAgainst,
    "the harness must bind the LIVE prompt-mode drive (the user session)",
  ).toBe("prompt-user-session");

  let execution: BodyExecution | undefined;
  let caught: unknown;
  try {
    execution = await executeBody(theta.body, binding.executeDeps);
  } catch (thrown) {
    caught = thrown;
  }
  return { execution: execution as BodyExecution, session, gate, diagnostics, caught };
}
