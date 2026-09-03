// Bug 0417 — the binder's outside-the-table forced-`toolChoice` default
// `{type:"tool",name}` is a hard HTTP 400 on every `openai-responses` model,
// and the binder is the one forced-tool dispatch site with no provider gate in
// front of it (docs/bugs/0417-binder-openai-responses-toolchoice-400.md).
//
// Two faces, offline-witnessed here (the live 400 is in the paired
// `tests/live/b0417live-responses-binder-toolchoice-live-cell.test.ts`):
//
//   FACE A (spelling) — `FORCED_TOOL_CHOICE_BY_API` had no Responses-family
//   row, so an `openai-responses` binder call shipped the outside-the-table
//   `{type:"tool",name}` default the Responses API rejects. Reach 1 measured
//   the accepted shape as the FLAT `{type:"function",name}` (neither shipped
//   spelling works: the `"tool"` default 400s on the `type` value, the
//   `"function"` row's NESTED form 400s on the missing flat `name`). §Fix adds
//   a third spelling arm producing the flat form for `openai-responses` (live)
//   and `openai-codex-responses` (code-read: dist/api/openai-codex-responses.js
//   passes `options.toolChoice` through verbatim, sharing the
//   openai-responses-shared adapter family).
//
//   FACE B (gate, parent adjudication Option A) — the binder gains a
//   supported-api bound and SYNTHESIZES a transport refusal BEFORE any provider
//   call for an api with no measured forced-tool-choice row, mirroring the
//   typed-query respond path's synthesize-before-dispatch
//   (`production-theta-producer.ts:3296-3299`). Zero provider spend; the honest
//   refusal is routed through the existing transport failure surface + the bug
//   0397 `details.event` machinery (no new registry code).
//
// TIER: unit — offline, provider-free, deterministic. The off-session binder
// `complete()` free function is mocked (the bug 0397 / bug 0011 pattern) with a
// CALL COUNTER, so the gate's zero-spend claim is a real observable: the mock
// is asserted uncalled on the gated api. This file references ONLY existing
// public API, so it COMPILES and REDS at the fork.
//
// RED at fork (v0.398.0, HEAD 261e483b):
//   - Face A: `buildBinderCompleteCall` for `openai-responses` returns the
//     `{type:"tool",name}` default, not the flat function form → the spelling
//     cells red.
//   - Face B: no binder gate exists, so a `google-generative-ai` binder model
//     is DISPATCHED (the mocked `complete()` is called, twice under the
//     transport retry) and the surfaced note carries the SCRIPTED provider
//     message → the zero-spend and synthesized-refusal cells red.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The scripted off-session binder reply plus the call counter — the gate's
// zero-spend observable. `vi.hoisted` so the `vi.mock` factory can close over
// the mutable holder each test sets.
const scripted = vi.hoisted(() => ({
  replyFor: undefined as undefined | ((context: unknown) => unknown),
  calls: [] as unknown[],
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (model: unknown, context: unknown) => {
      scripted.calls.push({ model, context });
      return scripted.replyFor?.(context);
    }),
  };
});

import type { Api, Model, ProviderResponse } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import {
  binderToolName,
  buildBinderCompleteCall,
  type BinderCompleteCallInput,
} from "../src/binder/binder-inference";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import {
  composeThetaFixture,
  type ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import {
  ActiveInvocationRegistry,
  type ActiveInvocationEntry,
} from "../src/runtime/active-invocation-registry";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { BinderEnvelopeSchema } from "../src/binder/binder-envelope";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";

const SYSTEM_NOTE_CHANNEL = "theta-system-note";
const KNOWN_WALL_NOW = 1720000000000;

// ============================================================================
// FACE A — the flat Responses-family forced-tool-choice spelling
// ============================================================================

describe("bug 0417 Face A — openai-responses / openai-codex-responses spell the FLAT {type:'function',name}", () => {
  const envelope: BinderEnvelopeSchema = {
    anyOf: [
      {
        type: "object",
        properties: { kind: { const: "ok" } },
        required: ["kind"],
      },
    ],
  };
  function callInput(api: string): BinderCompleteCallInput {
    return {
      model: { api } as unknown as Model<Api>,
      systemPrompt: "You are the binder.",
      envelopeSchema: envelope,
      slug: "triage",
      seed: 7,
      signal: new AbortController().signal,
      onResponse: (_r: ProviderResponse, _m: Model<Api>) => {},
    };
  }

  it("openai-responses → flat {type:'function',name} (Reach 1 measured; NOT the {type:'tool',name} default, NOT the nested {function:{name}} form)", () => {
    const call = buildBinderCompleteCall(callInput("openai-responses"));
    expect(
      (call.options as Record<string, unknown>)["toolChoice"],
      "the Responses API rejects the outside-the-table {type:'tool',name} default with a 400 " +
        "on the `type` value; the accepted shape is the FLAT function form (bug 0417 Reach 1)",
    ).toEqual({ type: "function", name: binderToolName("triage") });
  });

  it("openai-codex-responses → flat {type:'function',name} (code-read: verbatim options.toolChoice passthrough, openai-responses-shared adapter family)", () => {
    const call = buildBinderCompleteCall(callInput("openai-codex-responses"));
    expect((call.options as Record<string, unknown>)["toolChoice"]).toEqual({
      type: "function",
      name: binderToolName("triage"),
    });
  });

  it("azure-openai-responses stays OUTSIDE the table (code-read: dist/api/azure-openai-responses.js never reads options.toolChoice) → default {type:'tool',name}", () => {
    // Azure silently DROPS the forced tool choice, so it shares no verbatim
    // passthrough and earns no measured row; the binder gate (Face B) refuses
    // it before dispatch, so the pure-function default is never shipped for it.
    const call = buildBinderCompleteCall(callInput("azure-openai-responses"));
    expect((call.options as Record<string, unknown>)["toolChoice"]).toEqual({
      type: "tool",
      name: binderToolName("triage"),
    });
  });
});

// ============================================================================
// FACE B — the binder supported-api gate (synthesize-before-dispatch)
// ============================================================================

interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
  readonly details?: { readonly event?: Record<string, unknown> };
}

class RecordingRegistry extends ActiveInvocationRegistry {
  readonly addedIds: string[] = [];
  override add(entry: ActiveInvocationEntry): void {
    this.addedIds.push(entry.invocationId);
    super.add(entry);
  }
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

function realAjv(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}

// The fixture path deliberately carries no diagnostic-code-shaped directory
// segment: the registry closed-set corpus gate scans test text for code-shaped
// spans, and a path under a code-shaped directory would register as a spurious
// asserted-code (bug 0230 §Fix, the extractor's document-name artefact class).
const THETA_PATH = "/fixtures/b0417-two-param.theta";
const TWO_PARAM_THETA = [
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

function rootDouble(): RuntimeRoot {
  let n = 0;
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: {
      newInvocationId: (): string => `inv-${(n += 1)}`,
      newToolCallId: (): string => "tc-1",
    },
    clock: { wallNow: (): number => KNOWN_WALL_NOW },
    schemaValidator: realAjv(),
    fileSystem: {
      readBytes: (path: string): Promise<Uint8Array> =>
        path === THETA_PATH
          ? Promise.resolve(new TextEncoder().encode(TWO_PARAM_THETA))
          : Promise.reject(new Error(`fixture fs: no source for ${path}`)),
    },
  } as unknown as RuntimeRoot;
}

function twoParamTheta(): ThetaCompositionInput {
  const source: ThetaSource = { path: THETA_PATH, bytes: new TextEncoder().encode(TWO_PARAM_THETA) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the binder theta must parse cleanly before it is driven").toEqual([]);
  return {
    slashName: "b0417",
    sourcePath: THETA_PATH,
    frontmatter: doc.frontmatter!,
    body: doc.body,
    binderModel: "binder-model",
  };
}

interface DriveOutcome {
  readonly notes: CapturedNote[];
  readonly completeCalls: number;
}

async function driveDispatch(binderApi: string): Promise<DriveOutcome> {
  const notes: CapturedNote[] = [];
  const pi = {
    sendMessage: (message: CapturedNote): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
  const model = {
    id: "binder-model",
    provider: "gw",
    api: binderApi,
    strictCapable: true,
  };
  const modelRegistry = {
    getAvailable: (): readonly unknown[] => [model],
    getApiKeyAndHeaders: async (): Promise<{ ok: boolean }> => ({ ok: true }),
  } as unknown as ModelRegistry;
  const registry = new RecordingRegistry();
  const deps = createProductionProducerDeps({
    pi,
    root: rootDouble(),
    modelRegistry,
    activeInvocations: registry,
  });
  await composeThetaFixture(twoParamTheta(), deps).run("alpha beta", {
    signal: undefined,
  } as unknown as ExtensionCommandContext);
  return { notes, completeCalls: scripted.calls.length };
}

function channelNotes(notes: readonly CapturedNote[]): CapturedNote[] {
  return notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL);
}

// The `errorMessage` a scripted `stopReason:"error"` reply carries; at fork
// (no gate) it drives the transport retry and surfaces on the note, proving
// the binder PAID for the doomed call rather than synthesizing before it.
const SCRIPTED_PROVIDER_MESSAGE = "SCRIPTED-PROVIDER-400-should-never-surface-under-the-gate";
function scriptTransport(): void {
  scripted.replyFor = (): unknown => ({
    role: "assistant",
    content: [],
    stopReason: "error",
    errorMessage: SCRIPTED_PROVIDER_MESSAGE,
    timestamp: 0,
  });
}

beforeEach(() => {
  scripted.replyFor = undefined;
  scripted.calls = [];
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("bug 0417 Face B — an outside-the-gate binder api synthesizes the refusal with ZERO provider calls", () => {
  it("google-generative-ai: the note is a synthesized transport refusal AND complete() is never called", async () => {
    scriptTransport();
    const outcome = await driveDispatch("google-generative-ai");

    expect(
      outcome.completeCalls,
      "the gate must synthesize BEFORE any provider call (zero spend); at fork the doomed " +
        "call was issued (and retried). complete() call count: " + outcome.completeCalls,
    ).toBe(0);

    const rows = channelNotes(outcome.notes);
    expect(rows.length, "exactly one binder-failure note").toBe(1);
    const note = rows[0]!;
    expect(
      note.details?.event?.["kind"],
      "the refusal is routed through the existing transport failure surface (no new registry code)",
    ).toBe("transport");
    expect(
      note.details?.event?.["message"],
      "the note must carry the SYNTHESIZED honest refusal, NOT the scripted provider message a " +
        "real dispatch would return (at fork it surfaces the scripted message). observed: " +
        JSON.stringify(note.details?.event?.["message"]),
    ).not.toBe(SCRIPTED_PROVIDER_MESSAGE);
    expect(
      note.content,
      "the user-facing note names the refused api in the transport parenthetical",
    ).toContain("google-generative-ai");
    expect(note.content).toContain("argument binder unavailable");
  });

  it("openai-responses (inside the gate): the binder IS dispatched (not gated out) and no `argument binder unavailable` note surfaces", async () => {
    // Script a valid `ok` envelope so the bind succeeds; the observable is that
    // openai-responses reaches a real provider call and is NOT refused — the
    // flat-spelling SHAPE is pinned by Face A's pure-function cell.
    scripted.replyFor = (context: unknown): unknown => {
      const tools = (context as { tools?: ReadonlyArray<{ name?: unknown }> }).tools;
      const name = typeof tools?.[0]?.name === "string" ? tools[0].name : "__theta_bind_none";
      return {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "tc-1",
            name,
            arguments: { envelope: { kind: "ok", args: { topic: "a", audience: "b" } } },
          },
        ],
        stopReason: "toolUse",
        timestamp: 0,
      };
    };
    const outcome = await driveDispatch("openai-responses");

    expect(
      outcome.completeCalls,
      "openai-responses is inside the gate, so the binder dispatches for real",
    ).toBeGreaterThan(0);
    const rows = channelNotes(outcome.notes);
    expect(
      rows.some((n) => n.content.includes("argument binder unavailable")),
      "openai-responses must NOT be refused by the gate. Notes: " +
        JSON.stringify(rows.map((n) => n.content)),
    ).toBe(false);
  });
});
