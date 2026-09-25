// Shared harness for the prompt-mode PIC-17 windows (model window: bug 0479;
// thinking window: bug 0491). Drives a one-query prompt-mode theta through the
// REAL producer (`createProductionProducerDeps` → `bindPromptConversation` →
// `executeBody`) over an instant-settle user-session double that records every
// `pi.setModel` / `pi.setThinkingLevel` call and the model + thinking level
// each driven turn ran under. Offline, provider-free.
//
// The session double emulates the two host behaviours the windows depend on:
//   - `setModel` switches the session model and RE-DERIVES the thinking level
//     for the model it switches to (pi agent-session `setModel` →
//     `_getThinkingLevelForModelSwitch`): the `perModelThinking` entry for the
//     target model when present, else the level stays;
//   - `setThinkingLevel` sets the level (no clamping modelled).
import { expect } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../../src/runtime/statement-executor";
import { parse, rootDouble, sessionBranch } from "./scripted-live-session-harness";
import {
  SYSTEM_NOTE_CHANNEL,
  type SystemNoteChannelDeps,
} from "../../src/extension/system-note-channel";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";

/** A registry model double — the shape `matchAvailableModel` and the launcher read. */
export interface ModelDouble {
  readonly id: string;
  readonly provider: string;
  readonly api: string;
  readonly strictCapable: boolean;
}

/** The invoking session's own model (what `ctx.model` reports). */
export const SESSION_MODEL: ModelDouble = {
  id: "claude-test",
  provider: "anthropic",
  api: "anthropic-messages",
  strictCapable: true,
};
/** The theta's pinned model — same provider, different id, so only the id tells them apart. */
export const PINNED_MODEL: ModelDouble = {
  id: "claude-pinned",
  provider: "anthropic",
  api: "anthropic-messages",
  strictCapable: true,
};
export const PINNED_REF = `${PINNED_MODEL.provider}/${PINNED_MODEL.id}`;
export const SESSION_REF = `${SESSION_MODEL.provider}/${SESSION_MODEL.id}`;

export function registryOf(...models: readonly ModelDouble[]): ModelRegistry {
  return {
    getAvailable: (): readonly ModelDouble[] => [...models],
    find: (provider: string, id: string): ModelDouble | undefined =>
      models.find((m) => m.provider === provider && m.id === id),
  } as unknown as ModelRegistry;
}

export const QUERY_REPLY = "604";
const QUERY_SNAPSHOT = ["ambient-x", "ambient-y"];

/** A one-query prompt-mode theta with optional extra frontmatter lines. */
export function oneQueryTheta(...frontmatterLines: readonly (string | undefined)[]): string {
  const lines = frontmatterLines.filter((l): l is string => l !== undefined);
  return ["---", "mode: prompt", ...lines, "---", "let v = @`Ping`?", "v", ""].join("\n");
}

interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

export interface RecordedNote {
  readonly content: string;
  readonly display: boolean;
}

/** Scripted answer for one host call: a value, or "throw". */
export type Scripted<T> = T | "throw";

/**
 * The instant-settle user-session double (the b0372 shape): `sendUserMessage`
 * commits the user entry AND the reply in the same tick, so the drive's fast
 * path binds the reply without `isIdle()` ever reading false. It tracks the
 * session's CURRENT model and thinking level, so both windows are observable
 * as call logs and as what each driven turn ran under.
 */
export class InstantSettleSession {
  readonly entries: SessionEntryDouble[] = [];
  readonly notes: RecordedNote[] = [];
  /** Every `pi.setModel` call, in order (the window's swap-in and restore). */
  readonly setModelCalls: ModelDouble[] = [];
  /** Every `pi.setThinkingLevel` call, in order. */
  readonly setThinkingCalls: string[] = [];
  /** The model each driven turn ran under (the session model at send time). */
  readonly turnModels: string[] = [];
  /** The thinking level each driven turn ran under. */
  readonly turnThinking: string[] = [];
  currentModel: ModelDouble;
  currentThinking: string;

  constructor(
    readonly reply: string,
    initialModel: ModelDouble,
    /** Scripted `setModel` answers per call; `true` once exhausted. `"throw"` rejects. */
    private readonly setModelScript: readonly Scripted<boolean>[] = [],
    initialThinking = "medium",
    /** Host re-derivation on `setModel`: the level a switch to `provider/id` lands on. */
    private readonly perModelThinking: Readonly<Record<string, string>> = {},
    /** Scripted `setThinkingLevel` outcomes per call; `"ok"` once exhausted. */
    private readonly setThinkingScript: readonly Scripted<"ok">[] = [],
  ) {
    this.currentModel = initialModel;
    this.currentThinking = initialThinking;
  }

  sendUserMessage(text: string): void {
    this.turnModels.push(`${this.currentModel.provider}/${this.currentModel.id}`);
    this.turnThinking.push(this.currentThinking);
    this.#appendUser(text);
    this.#appendAssistant(this.reply);
  }

  setModel(model: ModelDouble): Promise<boolean> {
    const n = this.setModelCalls.length;
    this.setModelCalls.push(model);
    const scripted = this.setModelScript[n] ?? true;
    if (scripted === "throw") {
      return Promise.reject(new Error(`setModel rejected (scripted call ${n})`));
    }
    if (scripted) {
      this.currentModel = model;
      const derived = this.perModelThinking[`${model.provider}/${model.id}`];
      if (derived !== undefined) {
        this.currentThinking = derived;
      }
    }
    return Promise.resolve(scripted);
  }

  getThinkingLevel(): string {
    return this.currentThinking;
  }

  setThinkingLevel(level: string): void {
    const n = this.setThinkingCalls.length;
    this.setThinkingCalls.push(level);
    if ((this.setThinkingScript[n] ?? "ok") === "throw") {
      throw new Error(`setThinkingLevel threw (scripted call ${n})`);
    }
    this.currentThinking = level;
  }

  isIdle(): boolean {
    return true;
  }

  sendMessage(message: { customType?: string; content?: string; display?: boolean }): void {
    if (message.customType === SYSTEM_NOTE_CHANNEL) {
      this.notes.push({ content: String(message.content ?? ""), display: message.display === true });
    }
  }

  #appendUser(text: string): void {
    this.#append({ role: "user", content: [{ type: "text", text }], timestamp: 0 });
  }

  #appendAssistant(text: string): void {
    this.#append({
      role: "assistant",
      content: [{ type: "text", text }],
      api: this.currentModel.api,
      provider: this.currentModel.provider,
      model: this.currentModel.id,
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

function piDouble(session: InstantSettleSession, withThinkingApi: boolean): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => [...QUERY_SNAPSHOT],
    setActiveTools: (): void => {},
    setModel: (model: ModelDouble): Promise<boolean> => session.setModel(model),
    ...(withThinkingApi
      ? {
          getThinkingLevel: (): string => session.getThinkingLevel(),
          setThinkingLevel: (level: string): void => session.setThinkingLevel(level),
        }
      : {}),
    registerTool: (): void => {},
    on: (): void => {},
    sendMessage: (message: { customType?: string; content?: string; display?: boolean }): void =>
      session.sendMessage(message),
  } as unknown as ExtensionAPI;
}

function ctxDouble(session: InstantSettleSession): ExtensionCommandContext {
  return {
    // A live getter: the window's step-1a snapshot reads the CURRENT session
    // model, and after a swap the host would report the swapped model here.
    get model(): ModelDouble {
      return session.currentModel;
    },
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

export interface QueryDriveResult {
  readonly execution: BodyExecution;
  readonly session: InstantSettleSession;
  readonly diagnostics: Diagnostic[];
  readonly caught: unknown;
}

export async function driveQuery(input: {
  /** Extra frontmatter lines (e.g. a `model:` and/or `thinking:` line). */
  readonly frontmatterLines: readonly (string | undefined)[];
  readonly setModelScript?: readonly Scripted<boolean>[];
  readonly registry?: ModelRegistry;
  readonly initialThinking?: string;
  readonly perModelThinking?: Readonly<Record<string, string>>;
  readonly setThinkingScript?: readonly Scripted<"ok">[];
  /** Omit the host's thinking-level API (default: present). */
  readonly withoutThinkingApi?: boolean;
}): Promise<QueryDriveResult> {
  const doc = parse(oneQueryTheta(...input.frontmatterLines));
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const session = new InstantSettleSession(
    QUERY_REPLY,
    SESSION_MODEL,
    input.setModelScript ?? [],
    input.initialThinking ?? "medium",
    input.perModelThinking ?? {},
    input.setThinkingScript ?? [],
  );
  const diagnostics: Diagnostic[] = [];
  const systemNoteChannel: SystemNoteChannelDeps = {
    pi: {
      sendMessage: (message): void => {
        if (message.customType === SYSTEM_NOTE_CHANNEL) {
          session.notes.push({ content: String(message.content ?? ""), display: message.display === true });
        }
      },
    },
    ui: { notify: (): void => {} },
    emitDiagnostic: (d): void => {
      diagnostics.push(d);
    },
  };
  const deps = createProductionProducerDeps({
    pi: piDouble(session, input.withoutThinkingApi !== true),
    root: rootDouble(),
    modelRegistry: input.registry ?? registryOf(SESSION_MODEL, PINNED_MODEL),
    emitDiagnostic: (d): void => {
      diagnostics.push(d);
    },
    systemNoteChannel,
  });
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxDouble(session) });
  expect(binding.drivenAgainst, "the harness must bind the LIVE prompt-mode drive").toBe("prompt-user-session");
  let execution: BodyExecution | undefined;
  let caught: unknown;
  try {
    execution = await executeBody(theta.body, binding.executeDeps);
  } catch (thrown) {
    caught = thrown;
  }
  return { execution: execution as BodyExecution, session, diagnostics, caught };
}
