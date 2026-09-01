// Bug 0327 (E) — the OFF-SESSION driver seam: an untyped `subagent fn` query
// that exhausts on a NARRATED tool-use turn must surface the narration in the
// `tool_loop_exhausted` Err's `raw_response`.
//
// Spec: docs/bugs/0327-untyped-exhaustion-raw-response-always-null.md §Actual,
// whose off-session driver citation names the `OffSessionQueryModel` driver.
// That driver's `#driveFreePhaseRound` `tool_use` return maps ONLY the reply's
// `toolCall` content parts into the returned batch — the accompanying text
// parts (held in the conversation, present in `classified.text`) are never
// threaded to the loop's exhaustion branch. Combined with the loop's hardcoded
// `raw_response: null` (src/runtime/query-tool-loop.ts:388) the model's
// narration on the blocked terminal turn is discarded on the untyped path.
//
// PHASE 2: `#driveFreePhaseRound` maps the reply's text parts into the
// `tool_use` turn's (newly-widened) `text` slot alongside the batch, and the
// loop threads the last consumed tool_use turn's text into `raw_response`.
//
// This drives the PRODUCTION off-session producer end-to-end against a mocked
// `complete()` (the tests/off-session-two-phase.test.ts harness style) — offline
// and deterministic. RED today: `raw_response` arrives `null` instead of the
// scripted narration sentinel.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The recorded off-session `complete()` calls and the scripted reply queue
// (mirrors tests/off-session-two-phase.test.ts). `vi.hoisted` so the hoisted
// `vi.mock` factory can close over a mutable holder each cell sets.
const scripted = vi.hoisted(() => ({
  queue: [] as Array<
    (call: { model: unknown; context: unknown; options: unknown }) => unknown
  >,
  calls: [] as Array<{ model: unknown; context: unknown; options: unknown }>,
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (model: unknown, context: unknown, options: unknown) => {
      const call = { model, context, options };
      const index = scripted.calls.length;
      scripted.calls.push(call);
      if (scripted.queue.length === 0) {
        // No silent skipping: an unscripted dispatch fails loudly.
        throw new Error(
          `scripted complete() called with an EMPTY reply queue (call #${index + 1})`,
        );
      }
      const factory = scripted.queue[Math.min(index, scripted.queue.length - 1)]!;
      return factory(call);
    }),
  };
});

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { isResultValue, type ThetaValue } from "../src/runtime/value";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import type { RuntimeRoot } from "../src/runtime-root";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";

// The dispatch ctx's session model — the off-session free phase's model.
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

/**
 * The untyped `subagent fn` fixture under `tool_loop.max_rounds: 1`: the single
 * tool round consumes the only slot, so the loop exhausts at the round-1
 * boundary (QRY-16/CIO-4) and surfaces `Err(tool_loop_exhausted)` — the untyped
 * path, not a typed forced-respond terminator. The `?` propagates the Err across
 * the FN-6 boundary; `let out` binds it as the body's final value.
 */
const UNTYPED_FN_THETA_ROUNDS1 = [
  "---",
  "mode: prompt",
  "tool_loop:",
  "  max_rounds: 1",
  "---",
  "subagent fn helper(a: string) {",
  "  let v = @`Ping`?",
  "  v",
  "}",
  'let out = helper("x")',
  "out",
  "",
].join("\n");

/**
 * An `AssistantMessage`-shaped reply for the mocked `complete()`. A reply may
 * carry BOTH a text part and toolCall parts (the narrated tool-use turn this
 * cell scripts).
 */
function assistantReply(fields: {
  readonly stopReason: string;
  readonly text?: string;
  readonly toolCalls?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly arguments: Record<string, unknown>;
  }>;
}): Record<string, unknown> {
  const content: Record<string, unknown>[] = [];
  if (fields.text !== undefined) {
    content.push({ type: "text", text: fields.text });
  }
  for (const call of fields.toolCalls ?? []) {
    content.push({ type: "toolCall", id: call.id, name: call.name, arguments: call.arguments });
  }
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    stopReason: fields.stopReason,
    timestamp: 0,
  };
}

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/** Parse `.theta` source through the production whole-file parser (must be clean). */
function parse(src: string): ThetaDocument {
  const source: ThetaSource = { path: "probe.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/** The production AJV validator (unused on the untyped path; supplied for the root shape). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/** A runtime-root double sufficient for the off-session query drive. */
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}

/** The `ModelRegistry` double: `getAvailable` + `getApiKeyAndHeaders` (auth threading). */
function registryDouble(available: readonly unknown[]): ModelRegistry {
  return {
    getAvailable: () => [...available],
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
  } as unknown as ModelRegistry;
}

/** The dispatch ctx — MUST carry `.model` (the resolved off-session model). */
function ctxDouble(model: unknown): ExtensionCommandContext {
  return {
    model,
    sessionManager: {
      getEntries: (): readonly unknown[] => [],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

/** The `ExtensionAPI` double (the off-session drive touches no session surface). */
function piDouble(): ExtensionAPI {
  return {
    sendMessage: (): void => {},
    registerTool: (): void => {},
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    on: (): void => {},
  } as unknown as ExtensionAPI;
}

/** Drive one fixture theta through the production prompt-mode binding. */
async function driveTheta(source: string, model: unknown): Promise<BodyExecution> {
  const doc = parse(source);
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const deps = createProductionProducerDeps({
    pi: piDouble(),
    root: rootDouble(),
    modelRegistry: registryDouble([ANTHROPIC_MODEL]),
  });
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxDouble(model) });
  return executeBody(theta.body, binding.executeDeps);
}

/**
 * Dig the author-visible leaf `QueryError` out of a drive's final value (the
 * bug-0007/0010 harness shape): the `?`-propagated leaf crosses the `subagent
 * fn` boundary wrapped as `InvokeCalleeError { kind: "invoke_callee", inner }`.
 * Fails loudly (quoting the observed value) when the shape is anything else.
 */
function expectErrQueryError(execution: BodyExecution): Record<string, unknown> {
  expect(
    execution.outcome,
    `the drive's body must complete with the Err BOUND as its final value; ` +
      `observed outcome '${execution.outcome}' (error: ${JSON.stringify(execution.error)})`,
  ).toBe("success");
  const value = execution.result.value;
  const isErr =
    value !== undefined &&
    isResultValue(value as ThetaValue) &&
    (value as { readonly ok: boolean }).ok === false;
  expect(
    isErr,
    `the author-visible final value must be the Err Result; observed: ${JSON.stringify(value)}`,
  ).toBe(true);
  const envelope = (value as { readonly error: unknown }).error as Record<string, unknown>;
  expect(
    envelope.kind,
    `a ?-propagated Err crosses the subagent fn boundary as invoke_callee; observed: ${JSON.stringify(envelope)}`,
  ).toBe("invoke_callee");
  const inner = envelope.inner;
  expect(
    inner !== null && typeof inner === "object",
    `invoke_callee.inner must carry the leaf QueryError; observed: ${JSON.stringify(envelope)}`,
  ).toBe(true);
  return inner as Record<string, unknown>;
}

beforeEach(() => {
  scripted.queue = [];
  scripted.calls = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("bug 0327 (E) — off-session untyped exhaustion carries the narrated tool-use turn's text", () => {
  it("(E) a narrated tool-use turn that exhausts surfaces the narration in raw_response (OffSessionQueryModel #driveFreePhaseRound)", async () => {
    scripted.queue = [
      // complete() #1 — round 0: a NARRATED tool-use turn (text part + toolCall
      // part). It consumes the single slot; the loop then exhausts at the
      // round-1 boundary with NO second complete().
      () =>
        assistantReply({
          stopReason: "toolUse",
          text: "PLANSTEP read qz-ch2.txt to continue following the chain.",
          toolCalls: [{ id: "t1", name: "ghost-tool", arguments: {} }],
        }),
    ];

    const execution = await driveTheta(UNTYPED_FN_THETA_ROUNDS1, ANTHROPIC_MODEL);

    // Exactly ONE complete(): the narrated tool round; the exhaustion branch
    // fires without issuing another free-phase call (QRY-16/CIO-4).
    expect(
      scripted.calls.length,
      "one free-phase complete() — the tool round consumes the sole slot, then " +
        "the max_rounds-final branch exhausts (no second dispatch)",
    ).toBe(1);

    const err = expectErrQueryError(execution);
    expect(err.kind, `observed: ${JSON.stringify(err)}`).toBe("tool_loop_exhausted");
    // Control (should hold): the terminal tool name is recorded (ERR-19).
    expect(err.last_tool_name).toBe("ghost-tool");
    // THE WITNESS (red today): the narration emitted alongside the blocked
    // terminal tool call must reach `raw_response`; today the off-session driver
    // drops the text part and the loop hardcodes null.
    expect(err.raw_response).toBe(
      "PLANSTEP read qz-ch2.txt to continue following the chain.",
    );
  });
});
