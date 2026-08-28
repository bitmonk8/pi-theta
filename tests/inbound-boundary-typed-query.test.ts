// Bug 0172, boundary 1 — a typed `@<Schema>` query binds the AJV-validated
// payload itself. `runTypedQueryLoop` returns `{ kind: "value", value:
// forced.payload }` (`src/runtime/query-tool-loop.ts:724`) and
// `runQueryEffect`'s typed arm hands that value straight on
// (`src/runtime/effectful-statement-host.ts:195`), so the inbound wire-name
// translation pass `docs/spec_topics/runtime-value-model.md:34` states for this
// boundary never runs: a named-enum position arrives untagged and a
// schema-typed object unbranded, on a path whose every verdict is `ok` and
// whose every surface is silent.
//
// WHICH SURFACE THIS DRIVES, AND WHY. The shipped producer, from
// `createProductionProducerDeps` through `bindPromptConversation` to
// `executeBody` — the `tests/respond-tool-wire.test.ts` §(3) harness shape,
// with pi-ai's `complete()` replaced by a scripted reply queue and every other
// collaborator the production one. That reaches `#resolvePromptQuery`
// (`src/extension/production-theta-producer.ts`), which is the sole production
// builder of the `QueryHostDispatch` this boundary's translation step rides on.
// A hand-built dispatch would assert over a dispatch no theta ever gets, so the
// populator itself — the half that can silently stop populating — would stay
// unwitnessed.
//
// The query sits in a `subagent fn` body so the two-phase drive runs
// OFF-SESSION over a held conversation (bug 0010 increment D), which needs no
// user session and no turn-lifecycle double; the free-phase turn and the forced
// respond dispatch are the two scripted `complete()` calls. FN-5 makes the
// function's final value the query's bound value, so the executed body's result
// IS what theta code would see at the bind.
//
// THE ASSERTED END STATE is the one bug 0172 §Reproduction (b) measures on the
// boundary the bug 0067 fix wired, over the identical lowered document and the
// identical payload: the root brands `Box`, the named-enum field compares equal
// to a locally constructed `Sev.High`, and — with bug 0120's order half —
// `keys()` is the schema's declaration order rather than the model's.
//
// WHAT IS RED HERE AND WHY. Cells (a), (b) and (c) red on the untranslated
// value: an absent brand, a bare string that compares `false` against the
// caller's own variant, and the model's key order. Every red is an assertion
// failure over a bound value, never a compile or harness error. Cells (d) and
// (e) are controls, green on both sides.
//
// TIER: unit, offline, provider-free, deterministic. The scripted `complete()`
// replaces the provider at the seam the production off-session driver already
// takes, so no tier above this one adds an observable — and no tier below
// reaches the production dispatch builder at all.
//
// Spec: runtime-value-model.md:34 (§Wire-name translation, the inbound bullet
// and its four-boundary closing sentence — "typed query results" is the first
// of the four), :13 (the enum row: the tag is what `==` compares, and it MUST
// NOT appear in JSON output), :22 (an untagged string and a variant share no
// structural ground, so `==` is `false`); expressions.md:118 (the declaration
// -order `keys()` clause bug 0120 owns).

import { beforeEach, describe, expect, it, vi } from "vitest";

// The scripted off-session `complete()` reply queue, selected by recorded call
// index (the `tests/respond-tool-wire.test.ts` harness discipline). `vi.hoisted`
// so the `vi.mock` factory — hoisted above every import — closes over a mutable
// holder. An unscripted dispatch fails loudly rather than returning a stub.
const scripted = vi.hoisted(() => ({
  queue: [] as Array<(call: { model: unknown; context: unknown; options: unknown }) => unknown>,
  calls: [] as Array<{ model: unknown; context: unknown; options: unknown }>,
}));

vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (model: unknown, context: unknown, options: unknown) => {
      const call = { model, context, options };
      const index = scripted.calls.length;
      scripted.calls.push(call);
      if (scripted.queue.length === 0) {
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
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { EnumDecl, SchemaDecl } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import type { RuntimeRoot } from "../src/runtime-root";
import { evaluateObjectMember } from "../src/runtime/stdlib-object";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { makeEnumValue, schemaTagOf, valuesEqual, type ThetaValue } from "../src/runtime/value";
import { enumDeclaringKey } from "../src/runtime/lexical-environment";
import { parseDoc } from "./helpers/e2e-s1";

// --- Substrate -------------------------------------------------------------

/** The production content-addressing of `src/extension/production-composition.ts:318`. */
function realAjv(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}

/**
 * The theta whose typed query this file drives. `Box` declares `sev` before
 * `who`; the scripted payload below carries them the other way round, so the
 * model's order and the declaration's order are distinguishable at the bind.
 * The query sits in a `subagent fn` so it drives OFF-SESSION, and `?` plus
 * FN-5 make the executed body's final value the query's own bound value.
 */
const SOURCE = [
  "---",
  "mode: prompt",
  "respond_repair:",
  "  attempts: 0",
  "---",
  'enum Sev { High = "high", Low = "low" }',
  "schema Box { sev: Sev, who: string }",
  "subagent fn classify(hint: string) {",
  "  let box = @<Box>`classify this`?",
  "  box",
  "}",
  'let out = classify("h")',
  "out",
  "",
].join("\n");

/** The parsed fixture: one parse serves the drive and every lowering assertion. */
const DOC = parseDoc(SOURCE, "typed-query.theta");
const DOC_ERRORS = DOC.diagnostics.filter((d) => d.severity === "error");
const SCHEMAS: readonly SchemaDecl[] = DOC.body.statements.filter(
  (s): s is SchemaDecl => s.kind === "schema",
);
const ENUMS: readonly EnumDecl[] = DOC.body.statements.filter(
  (s): s is EnumDecl => s.kind === "enum",
);

/** The model-ordered payload every cell drives: `who` first, `sev` second. */
function modelOrderedPayload(): Record<string, unknown> {
  // `JSON.parse`, because that is the provenance of a respond-tool payload and
  // it is what makes the key order the MODEL's rather than this file's.
  return JSON.parse('{"who":"w","sev":"high"}') as Record<string, unknown>;
}

/** An `AssistantMessage`-shaped scripted reply. */
function assistantReply(fields: {
  readonly stopReason: string;
  readonly text?: string;
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

/** The recorded `complete()` call's `context.tools`, duck-typed. */
function contextToolsOf(call: { readonly context: unknown }):
  | readonly Record<string, unknown>[]
  | undefined {
  const tools = (call.context as { readonly tools?: unknown }).tools;
  return tools === undefined ? undefined : (tools as readonly Record<string, unknown>[]);
}

/**
 * Script the two-phase off-session drive: a free-phase turn that calls no tool,
 * then a forced respond dispatch whose respond-tool call carries `payload`
 * (QRY-14).
 */
function scriptRespondWith(payload: unknown): void {
  scripted.queue = [
    () => assistantReply({ stopReason: "stop", text: "thinking" }),
    (call) => {
      const name = contextToolsOf(call)?.[0]?.["name"];
      if (typeof name !== "string") {
        // No silent skipping: the whole drive rests on the forced dispatch
        // presenting the registered respond tool (QRY-14 / PIC-44). A missing
        // presentation fails here naming itself rather than leaving a cell to
        // assert over a payload no boundary produced.
        throw new Error(
          "harness: the forced respond dispatch presented no respond tool, so no payload " +
            "reaches the typed-query boundary",
        );
      }
      return assistantReply({
        stopReason: "toolUse",
        toolCalls: [{ id: "tc1", name, arguments: payload }],
      });
    },
  ];
}

/**
 * Drive the fixture through the SHIPPED producer over `payload`, returning the
 * settled body execution and the notes `pi.sendMessage` received. Every
 * collaborator below the scripted `complete()` is the production one, so the
 * `QueryHostDispatch` the typed boundary consumes is built by
 * `#resolvePromptQuery`.
 */
async function driveTypedQuery(payload: unknown): Promise<{
  readonly execution: BodyExecution;
  readonly notes: readonly string[];
}> {
  if (DOC_ERRORS.length > 0) {
    throw new Error(
      `harness: the fixture theta did not load cleanly, so the query driven below is not ` +
        `the production one: ${JSON.stringify(DOC_ERRORS)}`,
    );
  }
  scriptRespondWith(payload);
  const theta: ThetaCompositionInput = {
    slashName: "typed-query",
    sourcePath: "/theta/typed-query.theta",
    frontmatter: DOC.frontmatter!,
    body: DOC.body,
  };
  const notes: string[] = [];
  const model = {
    id: "m1",
    api: "anthropic-messages",
    provider: "anthropic",
    strictCapable: true,
  };
  const deps = createProductionProducerDeps({
    pi: {
      sendMessage: (message: { readonly content?: unknown }): void => {
        notes.push(String(message.content ?? ""));
      },
      registerTool: (_definition: ToolDefinition): void => {},
      getActiveTools: (): string[] => [],
      setActiveTools: (): void => {},
      on: (): void => {},
    } as unknown as ExtensionAPI,
    root: {
      checkpoint: { before: (): Promise<void> => Promise.resolve() },
      idSource: {
        newInvocationId: (): string => "inv-0172-a",
        newToolCallId: (): string => "tc-1",
      },
      clock: { wallNow: (): number => 0 },
      schemaValidator: realAjv(),
    } as unknown as RuntimeRoot,
    modelRegistry: {
      getAvailable: () => [model],
      getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
    } as unknown as ModelRegistry,
  });
  const binding = deps.bindPromptConversation({
    theta,
    args: "",
    ctx: {
      model,
      sessionManager: {
        getEntries: (): readonly unknown[] => [],
        getLeafId: (): undefined => undefined,
      },
    } as unknown as ExtensionCommandContext,
  });
  const execution = await executeBody(theta.body, binding.executeDeps);
  return { execution, notes };
}

/** The bound value, failing loudly when the drive did not bind one. */
function boundValue(result: {
  readonly execution: BodyExecution;
  readonly notes: readonly string[];
}): ThetaValue {
  if (result.execution.outcome !== "success") {
    throw new Error(
      `harness: the driven body did not complete, so no cell below speaks about the inbound ` +
        `pass: error=${JSON.stringify(result.execution.error)}, ` +
        `notes=${JSON.stringify(result.notes)}`,
    );
  }
  const failClosed = result.notes.filter((note) => /returned Err|aborted|cancelled/.test(note));
  if (failClosed.length > 0) {
    throw new Error(
      `harness: the drive surfaced a fail-closed note, so the value below is not the one a ` +
        `clean typed query binds: ${JSON.stringify(failClosed)}`,
    );
  }
  return result.execution.result.value as ThetaValue;
}

describe("bug 0172 — typed query results perform the inbound translation pass (runtime-value-model.md:34)", () => {
  // The scripted factory is selected by the RECORDED CALL INDEX, so the record
  // is reset per cell: a carried-over index would hand the free-phase turn
  // another cell's reply.
  beforeEach(() => {
    scripted.calls.length = 0;
    scripted.queue = [];
  });

  it("(a) the bound value of a schema-annotated typed query is branded with its declaring schema", async () => {
    const value = boundValue(await driveTypedQuery(modelOrderedPayload()));

    expect(
      schemaTagOf(value),
      "runtime-value-model.md:34 — the inbound pass brands a rebuilt object with the `$defs` entry naming its declared schema, so `schemaTagOf`'s two consumers (the QRY-18 outbound render's rename map, the QuestionOperandDefectError operand summary) see the same value a constructor built",
    ).toBe("Box");
  });

  it("(b) a named-enum position of the bound value compares equal to a locally constructed variant", async () => {
    const value = boundValue(await driveTypedQuery(modelOrderedPayload()));
    const field = (value as { readonly sev: ThetaValue }).sev;

    // 0337: this fixture's own declaring file is "/theta/typed-query.theta";
    // the locally-constructed comparand must carry that same declaring key.
    expect(
      valuesEqual(field, makeEnumValue(enumDeclaringKey("/theta/typed-query.theta", "Sev"), "high")),
      "runtime-value-model.md:34 — the pass reattaches the declaring-enum tag at every named-enum position 'so the resulting value compares equal to a locally constructed variant of the same enum'; an untagged string takes the cross-type arm of :22 and reads false",
    ).toBe(true);
    expect(
      valuesEqual(makeEnumValue(enumDeclaringKey("/theta/typed-query.theta", "Sev"), "high"), field),
      "equality is symmetric, and only one of the two operands changes shape under the fix",
    ).toBe(true);
  });

  it("(c) the bound value's keys() are the schema's declaration order, not the model's", async () => {
    const payload = modelOrderedPayload();
    expect(
      Object.keys(payload),
      "premise: the respond payload really is model-ordered, so a declaration-ordered bind cannot be a coincidence",
    ).toEqual(["who", "sev"]);
    const declared = SCHEMAS.find((decl) => decl.name === "Box")?.fields?.map((f) => f.name);
    expect(declared, "premise: `Box` declares `sev` before `who`").toEqual(["sev", "who"]);

    const value = boundValue(await driveTypedQuery(payload));

    expect(
      Object.keys(value as object),
      "the record's own key order IS what `keys()` reports, so the two must agree",
    ).toEqual(["sev", "who"]);
    expect(
      evaluateObjectMember(value as { readonly [k: string]: ThetaValue }, "keys", []),
      "expressions.md:118 — `keys()` on a named-schema value is declaration order; this boundary is where bug 0120's model-ordered hazard bites, because the payload's order is the model's choice",
    ).toEqual(["sev", "who"]);
  });

  it("(d) CONTROL — the JSON projection carries the same fields and no tag, which is why it is not the observable", async () => {
    // The reason every cell above reads the END STATE rather than the JSON: the
    // tag is interpreter-private (runtime-value-model.md:13 — it "MUST NOT
    // appear in JSON output"), so the projection of a tagged value and of an
    // untranslated one carry the same field values either way. Green on both
    // sides; this cell is not a red witness.
    const value = boundValue(await driveTypedQuery(modelOrderedPayload()));

    expect(
      JSON.parse(JSON.stringify(value)),
      "the projection carries the same field values whether or not the pass ran — order aside, it distinguishes nothing",
    ).toEqual({ sev: "high", who: "w" });
    expect(
      JSON.stringify((value as { readonly sev: ThetaValue }).sev),
      "runtime-value-model.md:13 — an enum value's wire form is the bare string; the declaring-enum tag never crosses the wire",
    ).toBe('"high"');
  });

  it("(e) CONTROL — the query bound a value at all, and AJV is what admitted it", async () => {
    // The premise every cell above rests on, pinned rather than assumed: this
    // payload conforms, so the loop reaches its terminal bind rather than
    // respond-repair, and the pass the fix adds runs AFTER a verdict that was
    // already `ok` (runtime-value-model.md:34 fixes that ordering). Green on
    // both sides; this cell is not a red witness.
    const lowered = lowerQueryResponseSchema("Box", SCHEMAS, ENUMS);
    if (lowered === undefined) {
      throw new Error("harness: 'Box' did not lower");
    }
    expect(lowered).toEqual({
      type: "object",
      properties: { sev: { $ref: "#/$defs/Sev" }, who: { type: "string" } },
      required: ["sev", "who"],
      additionalProperties: false,
      $defs: { Sev: { type: "string", enum: ["high", "low"] } },
    });
    expect(realAjv().compile(lowered).validate(modelOrderedPayload())).toEqual({ ok: true });

    const result = await driveTypedQuery(modelOrderedPayload());
    expect(
      scripted.calls.length,
      "the two-phase drive issues exactly TWO complete() calls — a repair spin would issue more",
    ).toBe(2);
    expect(
      result.execution.outcome,
      `a conforming payload binds a value rather than surfacing an Err; ` +
        `error=${JSON.stringify(result.execution.error)}, notes=${JSON.stringify(result.notes)}`,
    ).toBe("success");
  });
});
