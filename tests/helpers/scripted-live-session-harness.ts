// Shared scripted-live-session scaffold for the bug-0288/0319/0414 prompt-mode
// witnesses (PTQ-0328), plus production system-note capture (PTQ-0537) and
// scripted off-session binder rigs (PTQ-0454, PTQ-0463), including
// parse-then-drive params-default fixtures.
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
import type { ExtensionAPI, ExtensionCommandContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import {
  createProductionProducerDeps,
  type ProductionProducerInput,
} from "../../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../../src/runtime-root";
import { rootDouble as fixedClockRoot } from "./runtime-belt-probe-harness";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../../src/parser/theta-document";
import type { ThetaSource } from "../../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../../src/extension/system-note-channel";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../../src/seams/schema-validator";

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

/** Parse-theta-document deps whose seams are inert offline no-ops. */
export function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
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
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
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
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return {
    validator: new AjvSchemaValidator({ emit: (d) => emitted.push(d), slugOf }),
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
 * Script a ToolCall-bearing binder reply carrying `{ envelope }` in its
 * `arguments`, naming the binder tool production actually attached on the
 * captured call (`context.tools[0].name`) — the bug-0011 forced-tool
 * extraction reads the envelope from the FIRST ToolCall naming the binder
 * tool; a free-text reply would be the malformed-envelope class.
 * The mutable holder stays in the caller's `vi.hoisted` mock scope.
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
