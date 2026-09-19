// Shared scripted-live-session scaffold for the bug-0288/0319/0414 prompt-mode
// witnesses (PTQ-0328), plus production system-note capture (PTQ-0537) and
// scripted off-session binder rigs (PTQ-0454, PTQ-0463), including
// parse-then-drive params-default fixtures and the live two-phase query harness.
//
// WHY THIS FILE EXISTS. tests/b0288-prompt-turn-completion-witness.test.ts,
// tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts and
// tests/b0414-preabort-send-issued-witness.test.ts each drive the REAL
// prompt-mode binding (`createProductionProducerDeps` → `bindPromptConversation`
// → `executeBody`) against their own hand-built `ScriptedLiveSession` double,
// and each redeclared byte-for-byte the pieces that carry no cell-specific
// variation between them: the fixture model, the `SessionManager` entry shape,
// the in-flight-turn state shape, the entry-append pair, and the
// document-parsing / AJV factories. This module centralises those pieces only;
// each file's own `ScriptedLiveSession` behaviour (its `TurnScript` shape,
// `sendUserMessage` / `tick` / `isIdle`), `ctxDouble`, `driveLiveTheta` and
// clock choice stay local — that is where the three files' behaviour actually
// diverges.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module.
import { type Diagnostic } from "../../src/diagnostics/diagnostic";
import { expect } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext, ModelRegistry, ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  createProductionProducerDeps,
  type ProductionProducerInput,
} from "../../src/extension/production-theta-producer";
import type { BinderRunInput, ThetaCompositionInput } from "../../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../../src/runtime/statement-executor";
import type { RuntimeRoot } from "../../src/runtime-root";
import { rootDouble as fixedClockRoot } from "./runtime-belt-probe-harness";
import {
  parseThetaDocument,
  type ThetaDocument,
} from "../../src/parser/theta-document";
import type { ThetaSource } from "../../src/lexer/lexer";
import { AjvSchemaValidator } from "../../src/seams/schema-validator";
import { parseDeps } from "./e2e-s1";
import { jsonSlug } from "./proto-named-harness";

/**
 * The user session's selected model (the bug-0288 fixture model). Distinct
 * `.api` / `.provider` strings (the bug-0009 fixture discipline) so a
 * synthesised `TransportError.provider` is checked against the API-shaped
 * value the PIC-50 derivation pins.
 */
export const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

/** A `SessionManager` message entry (the `buildSessionContext` read shape). */
export interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

/** An in-flight scripted turn: its script plus polls elapsed since the milestone. */
export interface TurnState<TScript> {
  readonly script: TScript;
  polls: number;
}

/** Append a `user` message entry (the scripted-session shape every lineage file shares). */
export function appendUserEntry(entries: SessionEntryDouble[], text: string): void {
  appendMessageEntry(entries, { role: "user", content: [{ type: "text", text }], timestamp: 0 });
}

/** Append an `assistant` message entry (the scripted-session shape every lineage file shares). */
export function appendAssistantEntry(
  entries: SessionEntryDouble[],
  text: string | undefined,
  stopReason = "stop",
  errorMessage?: string,
): void {
  appendMessageEntry(entries, {
    role: "assistant",
    content: text !== undefined ? [{ type: "text", text }] : [],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "m1",
    stopReason,
    ...(errorMessage !== undefined ? { errorMessage } : {}),
    timestamp: 0,
  });
}

/** Append one message entry, deriving its `id`/`parentId` from the existing chain. */
function appendMessageEntry(entries: SessionEntryDouble[], message: Record<string, unknown>): void {
  const id = `e${entries.length + 1}`;
  const parentId = entries.length === 0 ? undefined : `e${entries.length}`;
  entries.push({ type: "message", id, parentId, message });
}

/** Parse `.theta` source through the production whole-file parser (must be clean). */
export function parse(src: string, path = "probe.theta", fixture = "fixture"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, `the ${fixture} theta must parse cleanly before it is driven`).toEqual([]);
  expect(doc.frontmatter, `the ${fixture} theta must carry parseable frontmatter`).not.toBeNull();
  return doc;
}

/** The production AJV validator (matches the sibling live-seam harnesses). */
export function ajv(): AjvSchemaValidator {
  return new AjvSchemaValidator({ emit: () => {}, slugOf: jsonSlug });
}

/** AJV-backed root; `clock.setTimeout` fires synchronously for instant-settle turns. */
export function rootDouble(overrides: {
  readonly clock?: Partial<RuntimeRoot["clock"]>;
  readonly tokenEstimator?: RuntimeRoot["tokenEstimator"];
  readonly fileSystem?: Pick<RuntimeRoot["fileSystem"], "readBytes">;
} = {}): RuntimeRoot {
  return { ...fixedClockRoot(), schemaValidator: ajv(), ...overrides } as unknown as RuntimeRoot;
}

/** A real AJV validator together with its emitted diagnostics. */
export function capturingAjv(): { readonly validator: AjvSchemaValidator; readonly emitted: Diagnostic[] } {
  const emitted: Diagnostic[] = [];
  return {
    validator: new AjvSchemaValidator({ emit: (d) => emitted.push(d), slugOf: jsonSlug }),
    emitted,
  };
}

/** A captured `pi.sendMessage` custom message, including its structured details. */
export interface CapturedNote<TDetails = unknown> {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
  readonly details?: TDetails;
}

/** Build the production producer with a note sink and the caller's root/registry seams. */
export function producerWithCapture<TDetails = unknown>(
  input: Omit<ProductionProducerInput, "pi">,
): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly notes: CapturedNote<TDetails>[];
} {
  const notes: CapturedNote<TDetails>[] = [];
  const pi = {
    sendMessage: (message: CapturedNote<TDetails>): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
  const deps = createProductionProducerDeps({ pi, ...input });
  return { deps, notes };
}

/** The system-note entries in capture order. */
export function noteChannelEntries<TDetails>(
  notes: readonly CapturedNote<TDetails>[],
): CapturedNote<TDetails>[] {
  return notes.filter((n) => n.customType === "theta-system-note");
}

/**
 * A captured binder message. `details` is read as well as `content` because
 * PIC-1 (c) is a claim about `details.event` (runtime-event-channel.md:110),
 * not about the rendered line.
 */
export type BinderCapturedNote = CapturedNote<{ readonly event?: Record<string, unknown> }>;

// A two-required-string-param theta (forces a genuine binder pass — not a
// no-params or single-string bypass — with NO defaulted fields, so the ok arm's
// defaults-merge short-circuits without touching the filesystem seam).
export const TWO_PARAM_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  topic: string",
  "  audience: string",
  "---",
  "@`review ${topic} for ${audience}`",
  "",
].join("\n");

const BINDER_MODEL = {
  id: "binder-model",
  provider: "anthropic-messages",
  api: "anthropic-messages",
  strictCapable: true,
};

/**
 * A production binder with a capturing `pi.sendMessage`, a registry resolving
 * `binder-model`, and the real AJV validator. The wall clock is fixed at zero;
 * callers may supply their own fixture filesystem for default recovery.
 */
export function binderProducerWithCapture(
  fileSystem?: Pick<RuntimeRoot["fileSystem"], "readBytes">,
): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly notes: BinderCapturedNote[];
} {
  const modelRegistry = {
    getAvailable: (): readonly unknown[] => [BINDER_MODEL],
    getApiKeyAndHeaders: async (): Promise<{ ok: boolean }> => ({ ok: true }),
  } as unknown as ModelRegistry;
  return producerWithCapture<{ readonly event?: Record<string, unknown> }>({
    root: rootDouble({
      clock: { wallNow: (): number => 0 },
      ...(fileSystem === undefined ? {} : { fileSystem }),
    }),
    modelRegistry,
  });
}

/**
 * Drive a scripted `ok` bind and read its single displayed system note. Fails
 * loudly naming the unmet precondition when the bind did not reach the emitter,
 * so a broken harness cannot masquerade as a passing assertion. Nothing here
 * catches: a throw out of the echo path surfaces as the test's own rejection.
 */
export async function bindAndReadNote(
  { deps, notes }: ReturnType<typeof binderProducerWithCapture>,
  input: BinderRunInput,
): Promise<string> {
  const result = await deps.runBinder(input);
  expect(result.bound, "the scripted `ok` envelope must bind for the echo to be emitted").toBe(
    true,
  );
  const channelNotes = noteChannelEntries(notes);
  expect(
    channelNotes,
    "exactly one theta-system-note (the success echo) is emitted on the `ok` arm",
  ).toHaveLength(1);
  expect(channelNotes[0]!.display, "the echo note is display:true").toBe(true);
  return channelNotes[0]!.content;
}

/**
 * Script a ToolCall-bearing binder reply carrying `{ envelope }` in its
 * `arguments`, naming the binder tool production actually attached on the
 * captured call (`context.tools[0].name`) — the bug-0011 forced-tool
 * extraction reads the envelope from the FIRST ToolCall naming the binder
 * tool; a free-text reply would be the malformed-envelope class.
 * The mutable holder belongs to the caller's or shared helper's `vi.hoisted` mock scope.
 * A missing-tool message makes absence a harness failure instead of a fallback reply.
 */
export function scriptEnvelope(
  scripted: { replyFor: undefined | ((context: unknown) => unknown) },
  envelope: unknown,
  missingToolMessage?: string,
): void {
  scripted.replyFor = (context: unknown): unknown => {
    const tools = (context as { tools?: ReadonlyArray<{ name?: unknown }> }).tools;
    if (typeof tools?.[0]?.name !== "string" && missingToolMessage !== undefined) {
      throw new Error(missingToolMessage);
    }
    const name = typeof tools?.[0]?.name === "string" ? tools[0].name : "__theta_bind_none";
    return {
      role: "assistant",
      content: [{ type: "toolCall", id: "tc-1", name, arguments: { envelope } }],
      stopReason: "toolUse",
      timestamp: 0,
    };
  };
}

/** What one fixture did when the shipped load path and binder were handed it. */
export interface DriveOutcome {
  /** The one-line disposition: the assertion subject of each drive cell. */
  readonly summary: string;
  readonly diagnostics: readonly string[];
  readonly binderCalls: number;
  readonly notes: readonly string[];
}

/**
 * Bind the parse/drive harness to its fixture filesystem and hoisted complete()
 * recorder. Keep the caller's default rendering (JSON versus String) unchanged.
 * Unregistered filesystem paths reject rather than hiding a recovery failure.
 * The reply omits `p`, exercising the real default merge and AJV validation.
 */
export function makeDefaultBinderDrive(
  fixtureSources: ReadonlyMap<string, string>,
  scripted: { calls: unknown[]; replyFor: undefined | ((context: unknown) => unknown) },
  renderDefault: (value: unknown) => string | undefined,
): (name: string, source: string) => Promise<DriveOutcome> {
  /**
   * Parse a fixture through the shipped whole-file parser and, ONLY when it
   * registers, drive one real binder pass over it.
   *
   * The registration verdict is a VALUE in `summary`, never a skipped drive: a
   * fixture that registers is driven and reports what it bound, which is what
   * makes a red name the bound value rather than an absent test.
   */
  async function driveIfRegistered(name: string, source: string): Promise<DriveOutcome> {
    scripted.calls = [];
    scriptEnvelope(
      scripted,
      { kind: "ok", args: { topic: "hello" } },
      "the binder call attached no forced tool, so no ToolCall reply can name it — the harness cannot script an envelope",
    );
    const thetaSource: ThetaSource = {
      path: `${name}.theta`,
      bytes: new TextEncoder().encode(source),
    };
    const doc = parseThetaDocument(thetaSource, parseDeps());
    const diagnostics = doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
    if (doc.frontmatter === null) {
      return { summary: "refused at load", diagnostics, binderCalls: 0, notes: [] };
    }
    const { deps, notes } = binderProducerWithCapture({
      readBytes: (path: string): Promise<Uint8Array> => {
        const source = fixtureSources.get(path);
        return source !== undefined
          ? Promise.resolve(new TextEncoder().encode(source))
          : Promise.reject(new Error(`fixture fs: no source registered for ${path}`));
      },
    });
    const theta: ThetaCompositionInput = {
      slashName: name,
      sourcePath: `/theta/${name}.theta`,
      frontmatter: doc.frontmatter,
      body: doc.body,
      binderModel: "binder-model",
    };
    const result = await deps.runBinder({
      theta,
      args: "hello",
      ctx: {} as unknown as ExtensionCommandContext,
    });
    const channel = noteChannelEntries(notes).map((n) => n.content);
    return {
      summary: `registered and driven; bound=${String(result.bound)}; p=${renderDefault(
        result.args?.["p"],
      )}; binder calls=${scripted.calls.length}`,
      diagnostics,
      binderCalls: scripted.calls.length,
      notes: channel,
    };
  }

  return driveIfRegistered;
}

// Live prompt-mode two-phase query harness (bug 0010 and its repair restart).

/** The ambient user-session active-tool set the PIC-17 gate must restore. */
export const AMBIENT_ACTIVE_TOOLS: readonly string[] = ["ambient-a"];

/** The scripted trailing assistant message one driven turn commits. */
interface ScriptedAssistantReply {
  readonly stopReason: string;
  readonly text?: string;
  readonly errorMessage?: string;
}

/**
 * The live user-session double the free phase drives (adapted from
 * tests/prompt-provider-field-derivation.test.ts):
 *
 *  - `sendUserMessage` commits the `user` entry and marks the session
 *    streaming;
 *  - `tick()` (invoked from the injected `Clock`'s `setTimeout`) completes the
 *    in-flight streamed turn — invoking the one-shot `onMidTurn` hook FIRST
 *    (mid-turn, so a cell can call the registered respond tool's `execute` or
 *    replay governor events while the turn is live), then firing any hook for
 *    that turn ordinal before committing the scripted trailing `assistant` entry;
 *  - the reply queue is STICKY-LAST (the bug-0007 discipline): a runtime that
 *    drives MORE turns than the two-phase contract scripts (the retired fused
 *    turn + text-parse respond-repair re-drives did) keeps observing the
 *    terminal reply, so the over-driving stays observable as the
 *    `sendUserMessageCalls` COUNT pin instead of a mid-flight harness throw;
 *  - `entries` back `ctx.sessionManager.getEntries()` — the PIC-51/PIC-53 read
 *    surface AND the query-window rebuild surface the off-session respond turn
 *    reads (bug 0010).
 */
class LiveSessionDouble {
  readonly entries: SessionEntryDouble[] = [];
  /** Proof of ON-SESSION traffic (the off-session respond turn issues none). */
  sendUserMessageCalls = 0;
  readonly sentQueryTexts: string[] = [];
  /** One-shot mid-turn hook: fires inside the FIRST in-flight `tick()`. */
  onMidTurn: (() => void) | undefined = undefined;

  /** Per-turn one-shot mid-turn hooks, keyed by 0-based driven-turn ordinal. */
  readonly midTurnHooks = new Map<number, () => void>();
  readonly #firedMidTurnHooks = new Set<number>();

  #idle = true;
  #completedTurns = 0;
  #midTurnFired = false;
  readonly #replies: readonly ScriptedAssistantReply[];

  constructor(replies: readonly ScriptedAssistantReply[]) {
    this.#replies = [...replies];
  }

  sendUserMessage(content: string): void {
    this.sendUserMessageCalls += 1;
    this.sentQueryTexts.push(content);
    appendUserEntry(this.entries, content);
    this.#idle = false;
  }

  isIdle(): boolean {
    return this.#idle;
  }

  /** Complete the in-flight streamed turn (inert while idle). */
  tick(): void {
    if (this.#idle) {
      return;
    }
    if (!this.#midTurnFired) {
      // The turn is live: the governor (if armed) is between `begin`/`end` and
      // the respond capture slot (if any) is active — exactly the window the
      // early-respond and governor cells need.
      this.#midTurnFired = true;
      this.onMidTurn?.();
    }
    const turn = this.#completedTurns;
    const hook = this.midTurnHooks.get(turn);
    if (hook !== undefined && !this.#firedMidTurnHooks.has(turn)) {
      // The turn is live: the governor (if re-armed) is between `begin`/`end`
      // and the respond capture slot (if re-armed) is active — exactly the
      // window the repair-turn early-respond and fresh-budget cells need.
      this.#firedMidTurnHooks.add(turn);
      hook();
    }
    if (this.#replies.length === 0) {
      // No silent skipping: a cell that scripts NO session replies pins a
      // drive that must issue NO session turn at all.
      throw new Error(
        "live session double: a driven turn completed with an EMPTY reply queue",
      );
    }
    const reply =
      this.#replies[Math.min(this.#completedTurns, this.#replies.length - 1)]!;
    this.#completedTurns += 1;
    appendAssistantEntry(this.entries, reply.text, reply.stopReason, reply.errorMessage);
    this.#idle = true;
  }
}

/**
 * The `ExtensionAPI` surface the two-phase drive touches, RECORDING every
 * observable the bug-0010 pins read: `registerTool` definitions (the PIC-44
 * respond-tool registration), every `setActiveTools` vector in order (the
 * PIC-17 install vector + restore), the `getActiveTools` snapshot reads, and
 * every `pi.on` registration (the CIO-4 governor arming).
 */
class RecordingPi {
  readonly registeredTools: ToolDefinition[] = [];
  readonly setActiveToolsCalls: string[][] = [];
  getActiveToolsCalls = 0;
  /** Bug 0479: every PIC-17 model-window `setModel` (swap-in, then restore) in order. */
  readonly setModelCalls: string[] = [];
  readonly onEvents: string[] = [];
  readonly handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
  readonly api: ExtensionAPI;

  constructor(session: LiveSessionDouble, recordModelChanges: boolean) {
    const record = this;
    this.api = {
      sendUserMessage: (content: string): void => session.sendUserMessage(content),
      getActiveTools: (): string[] => {
        record.getActiveToolsCalls += 1;
        return [...AMBIENT_ACTIVE_TOOLS];
      },
      setActiveTools: (names: string[]): void => {
        record.setActiveToolsCalls.push([...names]);
      },
      ...(recordModelChanges ? {
        // Bug 0479 (PIC-17 model window): a theta whose `model:` resolves to a
        // model other than ctx.model is swapped in for its free-phase turn and
        // the session model restored after it. The double accepts every switch.
        setModel: (model: { provider: string; id: string }): Promise<boolean> => {
          record.setModelCalls.push(`${model.provider}/${model.id}`);
          return Promise.resolve(true);
        },
      } : {}),
      registerTool: (tool: ToolDefinition): void => {
        record.registeredTools.push(tool);
      },
      on: (event: string, handler: (...args: unknown[]) => unknown): void => {
        record.onEvents.push(event);
        const list = record.handlers.get(event) ?? [];
        list.push(handler);
        record.handlers.set(event, list);
      },
      sendMessage: (): void => {},
    } as unknown as ExtensionAPI;
  }
}

/**
 * A runtime-root double for the LIVE prompt-mode drive: a noop checkpoint,
 * deterministic ids, and a `Clock` whose `setTimeout` first `tick()`s the
 * session double (completing any in-flight streamed turn) and then fires the
 * callback synchronously — the prompt-provider-field-derivation harness shape.
 */
function liveSessionRoot(session: LiveSessionDouble): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        session.tick();
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}

/**
 * Bug 0010 harness accommodation (permitted outside the frozen scripted-driver
 * suites): the `ModelRegistry` double carries `getAvailable` — the surface a
 * present frontmatter `model:` resolves against (`matchAvailableModel(ref,
 * modelRegistry.getAvailable())`) for the respond dispatch — and
 * `getApiKeyAndHeaders`, the respond call's auth threading copied from
 * `#completeBinderReply` (`options.apiKey` / `options.headers` when `auth.ok`).
 */
function registryDouble(available: readonly unknown[]): ModelRegistry {
  return {
    getAvailable: () => [...available],
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
  } as unknown as ModelRegistry;
}

/** The dispatch ctx: the user-session model + the committed-transcript surface. */
function ctxDouble(session: LiveSessionDouble, model: unknown): ExtensionCommandContext {
  return {
    model,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

/** One assembled drive: the session/pi doubles plus the REUSABLE producer deps. */
interface TwoPhaseHarness {
  readonly session: LiveSessionDouble;
  readonly pi: RecordingPi;
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly theta: ThetaCompositionInput;
  readonly ctx: ExtensionCommandContext;
  /** Present only when the cell supplied one (see makeHarness opts.thetaAbort). */
  readonly thetaAbort?: AbortController;
}

/** Bind the suite's fallback tool-name recipe and optional model-switch recording. */
export function twoPhaseHarness(
  fallbackToolName: () => string,
  recordModelChanges = false,
) {
  function makeHarness(opts: {
    readonly model?: unknown;
    readonly availableModels?: readonly unknown[];
    /** Fires ONCE inside the first in-flight `tick()` — mid-turn. */
    readonly onMidTurn?: (harness: TwoPhaseHarness) => void;
    readonly source: string;
    readonly sessionReplies: readonly ScriptedAssistantReply[];
    /**
     * Cancellation cells (bug 0010 fix round 2, R2-1): the harness-owned
     * per-invocation controller, threaded as the bind input's `thetaAbort` so a
     * scripted `complete()` factory can abort the theta signal mid-flight (the
     * off-session suite's established pattern, applied to the live binding).
     */
    readonly thetaAbort?: AbortController;
    /**
     * Per-turn one-shot mid-turn hooks, keyed by 0-based driven-turn ordinal —
     * turn 0 is the ORIGINAL free-phase turn, turn 1 the FIRST repair follow-up
     * turn. Fired inside the turn's in-flight `tick()`, before the assistant
     * reply commits.
     */
    readonly midTurnHooks?: ReadonlyArray<
      readonly [turn: number, hook: (harness: TwoPhaseHarness) => void]
    >;
  }): TwoPhaseHarness {
    const doc = parse(opts.source);
    const theta: ThetaCompositionInput = {
      slashName: "probe",
      sourcePath: "/theta/probe.theta",
      frontmatter: doc.frontmatter!,
      body: doc.body,
    };
    const session = new LiveSessionDouble(opts.sessionReplies);
    const pi = new RecordingPi(session, recordModelChanges);
    const deps = createProductionProducerDeps({
      pi: pi.api,
      root: liveSessionRoot(session),
      modelRegistry: registryDouble(opts.availableModels ?? [ANTHROPIC_MODEL]),
    });
    const harness: TwoPhaseHarness = {
      session,
      pi,
      deps,
      theta,
      ctx: ctxDouble(session, opts.model === undefined ? ANTHROPIC_MODEL : opts.model),
      ...(opts.thetaAbort !== undefined ? { thetaAbort: opts.thetaAbort } : {}),
    };
    if (opts.onMidTurn !== undefined) {
      session.onMidTurn = (): void => opts.onMidTurn!(harness);
    }
    for (const [turn, hook] of opts.midTurnHooks ?? []) {
      session.midTurnHooks.set(turn, (): void => hook(harness));
    }
    return harness;
  }

  /**
   * The respond tool name the drive minted — read from the `registerTool`
   * capture (the authoritative PIC-44 name), falling back to the recipe-computed
   * name so a cell can script a reply factory before any drive has registered
   * (the two names are byte-equal for these non-colliding fixtures).
   */
  function respondToolNameOf(harness: TwoPhaseHarness): string {
    return harness.pi.registeredTools[0]?.name ?? fallbackToolName();
  }

  return { makeHarness, respondToolNameOf };
}

/**
 * Drive the harness theta once through the PRODUCTION prompt-mode binding.
 * Re-invocable on the SAME harness: cell (c) drives twice through the same
 * producer instance to pin the PIC-44 registration-cache reuse.
 */
export async function drive(harness: TwoPhaseHarness): Promise<BodyExecution> {
  const binding = harness.deps.bindPromptConversation({
    theta: harness.theta,
    args: "",
    ctx: harness.ctx,
    ...(harness.thetaAbort !== undefined ? { thetaAbort: harness.thetaAbort } : {}),
  });
  expect(
    binding.drivenAgainst,
    "the harness must bind the LIVE prompt-mode drive (the user session), not an off-session host",
  ).toBe("prompt-user-session");
  return executeBody(harness.theta.body, binding.executeDeps);
}

/** Extract a message's text (string content or text-part array). */
export function messageText(message: unknown): string {
  const msg = message as { readonly content?: unknown };
  if (typeof msg.content === "string") {
    return msg.content;
  }
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(
        (part): part is { readonly type: string; readonly text: string } =>
          (part as { readonly type?: unknown }).type === "text" &&
          typeof (part as { readonly text?: unknown }).text === "string",
      )
      .map((part) => part.text)
      .join("");
  }
  return "";
}

/**
 * An `AssistantMessage`-shaped reply for the mocked `complete()`. `toolCalls`
 * scripts pi-ai `ToolCall` content parts (`{type: "toolCall", ...}`) alongside
 * any text part.
 */
export function assistantReply(fields: {
  readonly stopReason: string;
  readonly text?: string;
  readonly errorMessage?: string;
  readonly toolCalls?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly arguments: unknown;
  }>;
}): Record<string, unknown> {
  const content: Record<string, unknown>[] = [];
  if (fields.text !== undefined) {
    content.push({ type: "text", text: fields.text });
  }
  for (const call of fields.toolCalls ?? []) {
    content.push({
      type: "toolCall",
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    });
  }
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    stopReason: fields.stopReason,
    ...(fields.errorMessage !== undefined ? { errorMessage: fields.errorMessage } : {}),
    timestamp: 0,
  };
}

/** The recorded `complete()` call's `context.tools`, duck-typed. */
export function contextToolsOf(call: { readonly context: unknown }):
  | readonly Record<string, unknown>[]
  | undefined {
  const tools = (call.context as { readonly tools?: unknown }).tools;
  return tools === undefined ? undefined : (tools as readonly Record<string, unknown>[]);
}

/** The recorded `complete()` call's context.messages, duck-typed. */
export function contextMessagesOf(call: {
  readonly context: unknown;
}): readonly Record<string, unknown>[] {
  const context = call.context as { readonly messages?: unknown };
  expect(
    Array.isArray(context.messages),
    `the complete() context must carry a messages array; observed context: ${JSON.stringify(call.context)}`,
  ).toBe(true);
  return context.messages as readonly Record<string, unknown>[];
}

/** Dig the leaf `QueryError` of the given kind out of a `?`-unwound failed drive. */
export function expectErrOfKind(execution: BodyExecution, kind: string): Record<string, unknown> {
  expect(
    execution.outcome,
    `the \`?\`-unwound Err must FAIL the body (ERR-18); observed outcome '${execution.outcome}' ` +
      `(final value: ${JSON.stringify(execution.result.value)})`,
  ).toBe("fail");
  const error = execution.error;
  expect(
    error !== null && typeof error === "object",
    `the fail outcome must carry the leaf QueryError; observed: ${JSON.stringify(error)}`,
  ).toBe(true);
  const leaf = error as unknown as Record<string, unknown>;
  expect(
    leaf.kind,
    `the leaf QueryError classifies as ${kind}; observed: ${JSON.stringify(leaf)}`,
  ).toBe(kind);
  return leaf;
}

/** Assert a successful drive resolving the typed value. */
export function expectValue(execution: BodyExecution, expected: unknown, why: string): void {
  expect(
    execution.outcome,
    `${why}; observed outcome '${execution.outcome}' (error: ${JSON.stringify(execution.error)})`,
  ).toBe("success");
  expect(execution.result.value, why).toEqual(expected);
}

/**
 * Replay a fabricated CIO-4 round pattern through the CAPTURED governor hooks
 * (adapted from tests/prompt-tool-loop-governor.test.ts): each round is one
 * `before_provider_request` followed by one `tool_call`, returning each
 * round's first non-undefined `ToolCallEventResult`. Returns `undefined` when
 * the governor hooks were never registered (the pre-fix typed drive — the
 * calling cell reds on the registration pin first).
 */
export function runGovernorRoundProbe(
  pi: RecordingPi,
  rounds: number,
): Array<unknown | undefined> | undefined {
  const providerRequestHandlers = pi.handlers.get("before_provider_request");
  const toolCallHandlers = pi.handlers.get("tool_call");
  if (
    providerRequestHandlers === undefined ||
    toolCallHandlers === undefined ||
    providerRequestHandlers.length === 0 ||
    toolCallHandlers.length === 0
  ) {
    return undefined;
  }
  const results: Array<unknown | undefined> = [];
  for (let round = 0; round < rounds; round += 1) {
    for (const handler of providerRequestHandlers) {
      handler(undefined, undefined);
    }
    let decision: unknown;
    for (const handler of toolCallHandlers) {
      const result = handler(
        { type: "tool_call", toolCallId: `fab-${round}`, toolName: "grep", input: {} },
        undefined,
      );
      if (decision === undefined) {
        decision = result;
      }
    }
    results.push(decision);
  }
  return results;
}

/** The rule-3 prefix/suffix separator of `renderFailureNote` (U+2014 EM DASH). */
export const EM_DASH = "\u2014";

/** The two-character `<ajv-summary>` inter-issue separator (`renderAjvSummary`). */
export const AJV_SUMMARY_SEPARATOR = "; ";

/** The AJV-on-`args` row's fixed phrase (determinism-cancellation-failure.md:52). */
export const AJV_ARGS_PHRASE = "argument binding produced invalid args";

/** The AJV-on-`args` note for one theta and one rendered `<ajv-summary>`. */
export function ajvArgsNote(thetaName: string, ajvSummary: string): string {
  return `theta /${thetaName}: ${AJV_ARGS_PHRASE} ${EM_DASH} ${ajvSummary}`;
}
