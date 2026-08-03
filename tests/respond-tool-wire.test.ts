// Bug 0028 — the respond tool's WIRE CONTRACT: the schema the synthesised
// `__theta_respond_<slug>` tool is registered with, and the reverse mapping from
// a model-produced argument object back to the candidate response payload
// (docs/bugs/0028-unresolved-annotation-silent-permissive-lowering.md §Fix).
//
// WHY this file exists. A tool call's `arguments` are a JSON OBJECT at the wire,
// and the host validates them against the registered `parameters` document
// BEFORE the theta side sees them (pi-agent-core's agent loop:
// `prepareArguments` → pi-ai `validateToolArguments` → `execute`). Two shapes
// the lowered response schema cannot satisfy on its own, both observed live as
// NON-TERMINATING repair spins that died in
// `theta/runtime/reload-teardown-timeout`:
//
//   (1) A NON-OBJECT ROOT. `@<Severity>` over a declared enum lowers to
//       `{"type":"string","enum":[…]}` (schema-subset.md:80) and `@<string>` to
//       `{"type":"string"}`. Registered verbatim, EVERY possible call fails:
//         Validation failed for tool "__theta_respond_…":
//           - root: must be string
//         Received arguments: {}
//       so the fix registers the single-property envelope
//       `{"type":"object","properties":{"value":<lowered>},"required":["value"]}`
//       and unwraps `.value` as the payload.
//   (2) A NESTED OBJECT/ARRAY PARAM DELIVERED AS A JSON-ENCODED STRING. Models
//       routinely send `"pet": "{\"species\":\"dog\"}"`, which the host's own
//       coercion does not parse:
//         - pet: must be object
//         Received arguments: {"owner_name":"ann","pet":"{\"species\":\"dog\"}"}
//       so the fix parses those strings back at the boundary, schema-directed,
//       before validation — the same compatibility shim pi's own `edit` tool
//       applies through `prepareArguments` for the identical model behaviour.
//
// Tier: unit / offline / deterministic. The pure-function cells drive
// `src/runtime/respond-tool-wire.ts` directly; the PRODUCTION cells drive the
// shipped producer (`createProductionProducerDeps` → the real two-phase
// off-session drive) with only pi-ai's `complete()` replaced by a recording
// script, and additionally invoke the REGISTERED `ToolDefinition` the way
// pi-agent-core does — `prepareArguments` on the off-session cells, and
// `execute` against an ARMED capture mid-turn in section (4), which is the only
// window in which the producer's capture slot exists — so the live on-session
// boundary is exercised without a provider. The live twins
// (tests/live/typed-query-wire-shapes.test.ts) prove the same two shapes
// terminate against a real model.
//
// Spec: query/query-tool-loop.md (QRY-14 respond tool / QRY-15 conveyance),
// query/query-failure-and-repair.md (QRY-22 validate-then-bind),
// schema-subset.md (SUBS-1 — the emission table the envelope wraps and never
// rewrites).

import { beforeEach, describe, expect, it, vi } from "vitest";

// The recorded off-session `complete()` calls and the scripted reply queue (the
// tests/off-session-two-phase.test.ts harness discipline). `vi.hoisted` so the
// `vi.mock` factory — hoisted above every import — can close over a mutable
// holder. An unscripted dispatch fails loudly rather than returning a stub.
const scripted = vi.hoisted(() => ({
  queue: [] as Array<
    (call: { model: unknown; context: unknown; options: unknown }) => unknown
  >,
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
import {
  RESPOND_ENVELOPE_KEY,
  coerceRespondWireArguments,
  respondPayloadFromWire,
  respondSchemaIsEnveloped,
  respondToolWireSchema,
  unwrapRespondPayload,
} from "../src/runtime/respond-tool-wire";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import type { EnumDecl, SchemaDecl } from "../src/parser/theta-document";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { executeBody } from "../src/runtime/statement-executor";
import type { BodyExecution } from "../src/runtime/statement-executor";
import type { RuntimeRoot } from "../src/runtime-root";
import { parseDoc } from "./helpers/e2e-s1";

/** The real AJV seam (no coercion, no default-fill) — the QRY-22 validator. */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/** Lower one annotation against a body source through the real seam. */
function lower(annotation: string, body: string): LoweredSchema {
  const doc = parseDoc(`---\nmode: prompt\n---\n${body}\n`, "wire.theta");
  expect(
    doc.diagnostics,
    `fixture guard: the body must parse cleanly; ` +
      JSON.stringify(doc.diagnostics.map((d) => `${d.severity} ${d.code}`)),
  ).toEqual([]);
  const schemas = doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
  const enums = doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
  const lowered = lowerQueryResponseSchema(annotation, schemas, enums);
  expect(
    lowered,
    `fixture guard: \`@<${annotation}>\` must lower to a document (undefined is ` +
      `reserved for the EMPTY annotation alone)`,
  ).toBeDefined();
  return lowered as LoweredSchema;
}

// ===========================================================================
// (1) THE ENVELOPE — a non-object root is wrapped, an object root is not.
// ===========================================================================

describe("bug 0028 wire contract — the respond tool's registered parameters", () => {
  for (const [label, annotation, body, expectedRoot] of [
    [
      "a declared enum root (schema-subset.md:80)",
      "Severity",
      'enum Severity { Low = "low", High = "high" }',
      { type: "string", enum: ["low", "high"] },
    ],
    ["a bare `string` root", "string", "", { type: "string" }],
    ["a bare `integer` root", "integer", "", { type: "integer" }],
    [
      "a literal-union root (schema-subset.md:80, the same rule as the declared enum)",
      '"a" | "b"',
      "",
      { type: "string", enum: ["a", "b"] },
    ],
  ] as const) {
    it(`ENVELOPE ${label}: the lowered root rides the envelope's \`value\` position`, () => {
      const lowered = lower(annotation, body);
      expect(
        lowered,
        `fixture guard: the annotation must lower to the pinned non-object root`,
      ).toEqual(expectedRoot);
      expect(
        respondSchemaIsEnveloped(lowered),
        `a non-object root cannot be satisfied by ANY argument object, so it must ` +
          `be enveloped; observed lowered=${JSON.stringify(lowered)}`,
      ).toBe(true);
      expect(
        respondToolWireSchema(lowered),
        `the registered wire schema is exactly the settled envelope — an object root ` +
          `with the lowered schema at \`${RESPOND_ENVELOPE_KEY}\`, that key required. ` +
          `Registered bare, the host rejects every call with \`root: must be ` +
          `${String((expectedRoot as { type?: string }).type ?? "…")}\` and the model ` +
          `repair-spins until the invocation is torn down`,
      ).toEqual({
        type: "object",
        properties: { [RESPOND_ENVELOPE_KEY]: expectedRoot },
        required: [RESPOND_ENVELOPE_KEY],
      });
    });
  }

  it("ENVELOPE-DEFS: a non-object root's `$defs` is lifted to the ENVELOPE root, where `#/$defs/<Name>` resolves", () => {
    // `array<Item>` lowers to a non-object root that MINTS a ref. Nested under
    // `properties.value.$defs` that ref would dangle — `#/$defs/…` pointers
    // resolve against the document root and nowhere else — and the registration
    // would fail to compile.
    const lowered = lower("array<Item>", "schema Item { sku: string }");
    expect(
      lowered,
      "fixture guard: the array root must mint a $ref and carry its fragment",
    ).toEqual({
      type: "array",
      items: { $ref: "#/$defs/Item" },
      $defs: { Item: expect.anything() },
    });
    const wire = respondToolWireSchema(lowered) as Record<string, unknown>;
    expect(
      Object.keys(wire["$defs"] as object),
      `the fragment table must sit at the WIRE document root; observed ` +
        `${JSON.stringify(wire)}`,
    ).toEqual(["Item"]);
    expect(
      (wire["properties"] as Record<string, Record<string, unknown>>)[RESPOND_ENVELOPE_KEY]?.[
        "$defs"
      ],
      "the payload position sheds the table it handed to the root",
    ).toBeUndefined();
    // The real AJV seam is the arbiter: a dangling ref throws at compile.
    const validator = ajv().compile(wire);
    expect(
      validator.validate({ [RESPOND_ENVELOPE_KEY]: [{ sku: "x" }] }).ok,
      "a conforming enveloped call validates against the registered wire schema",
    ).toBe(true);
    expect(
      validator.validate({ [RESPOND_ENVELOPE_KEY]: [{ nope: 1 }] }).ok,
      "the envelope does not weaken the payload's validation — an undeclared " +
        "property still fails through the lifted fragment",
    ).toBe(false);
  });

  for (const [label, annotation, body] of [
    ["a named schema", "Triage", "schema Triage { urgent: boolean }"],
    ["an inline object", "{ a: string, b: integer }", ""],
    [
      "a self-recursive named schema",
      "Tree",
      "schema Tree { name: string, children: array<Tree> }",
    ],
  ] as const) {
    it(`OBJECT-ROOT ${label}: registered UNCHANGED — the envelope exists only where the wire is unsatisfiable`, () => {
      const lowered = lower(annotation, body);
      expect(
        respondSchemaIsEnveloped(lowered),
        `an object root is already satisfiable by an argument object; enveloping it ` +
          `would rename every existing typed query's argument shape for nothing`,
      ).toBe(false);
      expect(
        respondToolWireSchema(lowered),
        "the object-root registration is byte-identical to the lowered schema",
      ).toBe(lowered);
      expect(
        unwrapRespondPayload(lowered, { a: 1 }),
        "an object root's arguments ARE the payload — the unwrap is the identity",
      ).toEqual({ a: 1 });
    });
  }

  it("OBJECT-ROOT permissive `{}`: the total-function residual stays un-enveloped", () => {
    // `lowerQueryResponseSchema` stays TOTAL, returning `{}` for an
    // unresolvable named annotation (bug doc §Fix). `{}` admits an argument
    // object as readily as anything else, so there is nothing to make
    // conveyable.
    expect(respondSchemaIsEnveloped({}), "`{}` needs no envelope").toBe(false);
    expect(respondToolWireSchema({}), "`{}` is registered verbatim").toEqual({});
  });

  it("UNWRAP: the envelope's `value` is the payload, and a malformed enveloped call is NOT rewritten", () => {
    const lowered = lower("Severity", "enum Severity { Low, High }");
    expect(
      unwrapRespondPayload(lowered, { [RESPOND_ENVELOPE_KEY]: "Low" }),
      "the unwrap yields the BARE value the declared schema validates",
    ).toBe("Low");
    expect(
      unwrapRespondPayload(lowered, { [RESPOND_ENVELOPE_KEY]: null }),
      "a present-but-null payload position unwraps to null, not to the envelope",
    ).toBe(null);
    for (const malformed of [{ other: "Low" }, "Low", null, [1]] as const) {
      expect(
        unwrapRespondPayload(lowered, malformed),
        `a call that does not carry \`${RESPOND_ENVELOPE_KEY}\` passes through ` +
          `VERBATIM, so QRY-22 validation reports the non-conforming payload it ` +
          `actually received instead of a fabricated undefined; input ` +
          `${JSON.stringify(malformed)}`,
      ).toEqual(malformed);
    }
  });
});

// ===========================================================================
// (2) THE JSON-STRING COERCION — schema-directed, encoding-only.
// ===========================================================================

describe("bug 0028 wire contract — JSON-encoded nested params are parsed before validation", () => {
  const NESTED = ["schema Owner { owner_name: string, pet: Pet }", "schema Pet { species: string }"].join(
    "\n",
  );

  it("COERCE-REF: a nested named-schema param delivered as a JSON string is parsed (the `pet: must be object` spin)", () => {
    const lowered = lower("Owner", NESTED);
    expect(
      (lowered as { properties: Record<string, unknown> }).properties["pet"],
      "fixture guard: the nested named schema must lower to a $ref (bug 0028's two-pass lowering)",
    ).toEqual({ $ref: "#/$defs/Pet" });
    const wire = respondToolWireSchema(lowered);
    const coerced = coerceRespondWireArguments(wire, {
      owner_name: "ann",
      pet: '{"species": "dog"}',
    });
    expect(
      coerced,
      "the JSON-encoded nested object is parsed back through the `$ref`, so the " +
        "payload validates instead of failing `pet: must be object` forever",
    ).toEqual({ owner_name: "ann", pet: { species: "dog" } });
    expect(
      ajv().compile(lowered).validate(coerced).ok,
      "the coerced payload passes the REAL QRY-22 validator",
    ).toBe(true);
  });

  it("COERCE-ARRAY: a JSON-encoded array param, and JSON-encoded elements inside a real array, are both parsed", () => {
    const lowered = lower("Owner", "schema Owner { pets: array<Pet> }\nschema Pet { species: string }");
    const wire = respondToolWireSchema(lowered);
    expect(
      coerceRespondWireArguments(wire, { pets: '[{"species":"dog"}]' }),
      "a whole array delivered as one JSON string is parsed",
    ).toEqual({ pets: [{ species: "dog" }] });
    expect(
      coerceRespondWireArguments(wire, { pets: ['{"species":"cat"}'] }),
      "elements delivered as JSON strings inside a real array are parsed too",
    ).toEqual({ pets: [{ species: "cat" }] });
  });

  it("COERCE-RECURSIVE: a self-recursive `$ref` graph terminates and is coerced at depth", () => {
    const lowered = lower("Tree", "schema Tree { name: string, children: array<Tree> }");
    const wire = respondToolWireSchema(lowered);
    const coerced = coerceRespondWireArguments(wire, {
      name: "root",
      children: ['{"name":"leaf","children":[]}'],
    });
    expect(
      coerced,
      "chasing `#/$defs/Tree` back into itself must terminate, not recurse forever",
    ).toEqual({ name: "root", children: [{ name: "leaf", children: [] }] });
    expect(
      ajv().compile(lowered).validate(coerced).ok,
      "the coerced recursive payload passes the REAL validator",
    ).toBe(true);
  });

  it("COERCE-ENVELOPE: a non-object root's payload is coerced at its `value` position, then unwrapped", () => {
    const lowered = lower("array<Item>", "schema Item { sku: string }");
    expect(
      respondPayloadFromWire(lowered, { [RESPOND_ENVELOPE_KEY]: '[{"sku":"x"}]' }),
      "one boundary function: coerce against the wire schema, then unwrap the envelope",
    ).toEqual([{ sku: "x" }]);
    expect(
      respondPayloadFromWire(lowered, { [RESPOND_ENVELOPE_KEY]: [{ sku: "x" }] }),
      "an already-structured enveloped payload is unchanged by the coercion",
    ).toEqual([{ sku: "x" }]);
  });

  for (const [label, args, expected] of [
    [
      "a declared `string` field whose value LOOKS like JSON keeps its string value",
      { owner_name: '{"not":"parsed"}', pet: { species: "dog" } },
      { owner_name: '{"not":"parsed"}', pet: { species: "dog" } },
    ],
    [
      "a nested param that is a non-JSON string is left for validation to reject",
      { owner_name: "ann", pet: "system" },
      { owner_name: "ann", pet: "system" },
    ],
    [
      "a nested param whose JSON parses to the WRONG type is left untouched",
      { owner_name: "ann", pet: "[1,2]" },
      { owner_name: "ann", pet: "[1,2]" },
    ],
    [
      "an undeclared extra property is neither parsed nor dropped",
      { owner_name: "ann", pet: { species: "dog" }, extra: '{"a":1}' },
      { owner_name: "ann", pet: { species: "dog" }, extra: '{"a":1}' },
    ],
  ] as const) {
    it(`COERCE-SCOPED ${label}`, () => {
      const wire = respondToolWireSchema(lower("Owner", NESTED));
      expect(
        coerceRespondWireArguments(wire, args),
        "the coercion repairs the ENCODING only — never the shape, and never a " +
          "position the schema does not declare structural",
      ).toEqual(expected);
    });
  }
});

// ===========================================================================
// (3) THE PRODUCTION BOUNDARY — the registered ToolDefinition and the shipped
// two-phase drive, both offline.
// ===========================================================================

/** A `mode: prompt` theta whose `subagent fn` runs the off-session two-phase drive. */
function fnTheta(body: string): string {
  return [
    "---",
    "mode: prompt",
    "respond_repair:",
    "  attempts: 0",
    "---",
    body,
    "subagent fn helper(a: string) {",
    "  let v = @<Shape>`Ping`?",
    "  v",
    "}",
    'let out = helper("x")',
    "out",
    "",
  ].join("\n");
}

/**
 * Drive one theta through the shipped producer, returning the settled body
 * execution (the primary observable: `outcome` plus the FN-5 value the query
 * bound), the notes `pi.sendMessage` received, and the registered tools.
 */
async function drive(source: string): Promise<{
  readonly execution: BodyExecution;
  readonly notes: readonly string[];
  readonly tools: readonly ToolDefinition[];
}> {
  const doc = parseDoc(source, "wireprod.theta");
  expect(
    doc.diagnostics,
    `fixture guard: the driven theta must parse cleanly; ` +
      JSON.stringify(doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`)),
  ).toEqual([]);
  const theta: ThetaCompositionInput = {
    slashName: "wireprod",
    sourcePath: "/theta/wireprod.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const notes: string[] = [];
  const tools: ToolDefinition[] = [];
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
      registerTool: (definition: ToolDefinition): void => {
        tools.push(definition);
      },
      getActiveTools: (): string[] => [],
      setActiveTools: (): void => {},
      on: (): void => {},
    } as unknown as ExtensionAPI,
    root: {
      checkpoint: { before: (): Promise<void> => Promise.resolve() },
      idSource: {
        newInvocationId: (): string => "inv-1",
        newToolCallId: (): string => "tc-1",
      },
      clock: { wallNow: (): number => 0 },
      schemaValidator: ajv(),
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
  return { execution, notes, tools };
}

/**
 * Assert the drive bound `expected` as the typed query's value. The FN-5 value
 * of the `subagent fn` is the bound query result, so this is the end-to-end
 * observable: a failed unwrap or an uncoerced param cannot reach it.
 */
function expectBound(
  result: { readonly execution: BodyExecution; readonly notes: readonly string[] },
  expected: unknown,
  why: string,
): void {
  expect(
    result.execution.outcome,
    `${why} — the body must complete successfully; error=` +
      `${JSON.stringify(result.execution.error)}, notes=${JSON.stringify(result.notes)}`,
  ).toBe("success");
  expect(
    result.execution.result.value,
    `${why} — the bound value is the FN-5 result of the \`subagent fn\` whose body ` +
      `is the typed query`,
  ).toEqual(expected);
  expect(
    result.notes.filter((note) => /returned Err|aborted|cancelled/.test(note)),
    `${why} — no fail-closed note may be surfaced; notes=${JSON.stringify(result.notes)}`,
  ).toEqual([]);
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

/** The trailing QRY-15 user message of the forced respond dispatch. */
function trailingTemplate(call: { readonly context: unknown }): string {
  const messages = (call.context as { readonly messages?: readonly unknown[] }).messages ?? [];
  const last = messages[messages.length - 1] as { readonly content?: unknown } | undefined;
  return typeof last?.content === "string" ? last.content : JSON.stringify(last?.content);
}

describe("bug 0028 wire contract — the shipped respond-tool boundary (offline)", () => {
  // The scripted factory is selected by the RECORDED CALL INDEX, so the record
  // is reset per cell: a carried-over index would silently hand the free-phase
  // turn another cell's reply.
  beforeEach(() => {
    scripted.calls.length = 0;
    scripted.queue = [];
  });

  it("PROD-ENVELOPE: an enveloped enum-root call binds through the real off-session drive, and QRY-15 conveys the schema the tool ACCEPTS", async () => {
    scripted.queue = [
      () => assistantReply({ stopReason: "stop", text: "thinking" }),
      (call) => {
        const name = contextToolsOf(call)?.[0]?.["name"];
        expect(typeof name, "the forced dispatch must present the respond tool").toBe(
          "string",
        );
        return assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc1", name: name as string, arguments: { value: "low" } }],
        });
      },
    ];
    const result = await drive(fnTheta('enum Shape { Low = "low", High = "high" }'));
    expect(
      scripted.calls.length,
      "the two-phase drive issues exactly TWO complete() calls — a repair spin " +
        "would issue more (or, live, never terminate)",
    ).toBe(2);
    expectBound(
      result,
      "low",
      "the enveloped call must UNWRAP to the bare wire value before validation " +
        "(validating the envelope object against the enum root rejects everything)",
    );
    const template = trailingTemplate(scripted.calls[scripted.calls.length - 1]!);
    expect(
      template,
      `QRY-15 must convey the schema the tool ACTUALLY accepts (the envelope) — an ` +
        `instruction describing a shape the tool rejects asks the model to repeat ` +
        `the failure; observed: ${template}`,
    ).toContain('"value"');
    expect(
      template,
      "the conveyed envelope carries the lowered enum at its payload position",
    ).toContain('"low"');
  });

  it("PROD-COERCE: a nested named-schema param delivered as a JSON string binds through the real off-session drive", async () => {
    scripted.queue = [
      () => assistantReply({ stopReason: "stop", text: "thinking" }),
      (call) => {
        const name = contextToolsOf(call)?.[0]?.["name"];
        return assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            {
              id: "tc1",
              name: name as string,
              // Verbatim the live wire shape that spun forever pre-fix.
              arguments: { owner_name: "ann", pet: '{"species": "dog"}' },
            },
          ],
        });
      },
    ];
    const result = await drive(
      fnTheta(
        ["schema Shape { owner_name: string, pet: Pet }", "schema Pet { species: string }"].join(
          "\n",
        ),
      ),
    );
    expect(
      scripted.calls.length,
      "exactly TWO complete() calls — pre-fix the `pet: must be object` verdict " +
        "drove repair rounds until the invocation was torn down",
    ).toBe(2);
    expectBound(result, { owner_name: "ann", pet: { species: "dog" } },
      "the JSON-encoded nested object must be parsed at the boundary, so the payload " +
        "validates and binds instead of failing `pet: must be object` forever",
    );
  });

  it("PROD-COERCE-FREEPHASE: a JSON-encoded nested param on a FREE-PHASE respond call is coerced by the driver that services it", async () => {
    // The early-respond arm (QRY-14): the model calls the respond tool mid-loop,
    // so the off-session driver validates and captures the call itself — a
    // second boundary with no host validation and no `prepareArguments` hook.
    scripted.queue = [
      (call) => {
        const name = contextToolsOf(call)?.[0]?.["name"];
        return assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            {
              id: "tc1",
              name: name as string,
              arguments: { owner_name: "ann", pet: '{"species": "dog"}' },
            },
          ],
        });
      },
    ];
    const result = await drive(
      fnTheta(
        ["schema Shape { owner_name: string, pet: Pet }", "schema Pet { species: string }"].join(
          "\n",
        ),
      ),
    );
    expect(
      scripted.calls.length,
      "an early respond TERMINATES the free phase — exactly ONE complete() call, no " +
        "forced dispatch",
    ).toBe(1);
    expectBound(result, { owner_name: "ann", pet: { species: "dog" } },
      "the free-phase servicing path must coerce and capture the payload; pre-fix its " +
        "AJV verdict was `pet: must be object` and the call was fed back as an error",
    );
  });

  it("PROD-TOOLDEF: the REGISTERED ToolDefinition carries the envelope and a `prepareArguments` shim", async () => {
    // The first two legs of the live on-session boundary as pi-agent-core
    // drives it: `parameters` (what the host validates against) and
    // `prepareArguments(arguments)` (the only hook that runs before that
    // validation). The third leg — `execute` against an armed capture — needs a
    // live turn and is section (4)'s PROD-EXECUTE-ENVELOPE cell.
    scripted.queue = [
      () => assistantReply({ stopReason: "stop", text: "thinking" }),
      (call) => {
        const name = contextToolsOf(call)?.[0]?.["name"];
        return assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc1", name: name as string, arguments: { value: "low" } }],
        });
      },
    ];
    const { tools } = await drive(fnTheta('enum Shape { Low = "low", High = "high" }'));
    expect(
      tools.length,
      `exactly one respond tool is registered for the query's lowered schema ` +
        `(PIC-44); observed ${JSON.stringify(tools.map((t) => t.name))}`,
    ).toBe(1);
    const definition = tools[0]!;
    expect(
      JSON.parse(JSON.stringify(definition.parameters)),
      "the registration carries the WIRE envelope — the host validates the model's " +
        "arguments against THIS document before `execute` ever runs",
    ).toEqual({
      type: "object",
      properties: { value: { type: "string", enum: ["low", "high"] } },
      required: ["value"],
    });
    expect(
      typeof definition.prepareArguments,
      "the pre-validation shim must be present — it is the only hook that runs " +
        "BEFORE the host's own tool-argument validation (pi's `edit` tool uses the " +
        "same one for the identical JSON-string model behaviour)",
    ).toBe("function");
    expect(
      definition.prepareArguments!({ value: "low" }),
      "an already-structured enveloped call is unchanged by the shim",
    ).toEqual({ value: "low" });
  });

  it("PROD-TOOLDEF-COERCE: the registered shim parses a JSON-encoded nested param before the host validates", async () => {
    scripted.queue = [
      () => assistantReply({ stopReason: "stop", text: "thinking" }),
      (call) => {
        const name = contextToolsOf(call)?.[0]?.["name"];
        return assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: name as string, arguments: { owner_name: "ann", pet: { species: "dog" } } },
          ],
        });
      },
    ];
    const { tools } = await drive(
      fnTheta(
        ["schema Shape { owner_name: string, pet: Pet }", "schema Pet { species: string }"].join(
          "\n",
        ),
      ),
    );
    const definition = tools[0]!;
    expect(
      definition.prepareArguments!({ owner_name: "ann", pet: '{"species":"dog"}' }),
      "the shim parses the JSON-encoded nested object, so the host's validation " +
        "sees the object its schema demands",
    ).toEqual({ owner_name: "ann", pet: { species: "dog" } });
    expect(
      JSON.parse(JSON.stringify(definition.parameters)),
      "an object root is registered UNCHANGED — no envelope where the wire is " +
        "already satisfiable",
    ).toEqual({
      type: "object",
      properties: {
        owner_name: { type: "string" },
        pet: { $ref: "#/$defs/Pet" },
      },
      required: ["owner_name", "pet"],
      additionalProperties: false,
      $defs: {
        Pet: {
          type: "object",
          properties: { species: { type: "string" } },
          required: ["species"],
          additionalProperties: false,
        },
      },
    });
  });
});

// ===========================================================================
// (4) THE ON-SESSION `execute` ARM — the registered tool's own dispatch, with
//     the producer's respond capture ARMED, over a NON-OBJECT root.
// ===========================================================================

/** A `mode: prompt` theta whose TOP-LEVEL typed query has an ENUM (non-object) root. */
const ENUM_ROOT_THETA = [
  "---",
  "mode: prompt",
  "respond_repair:",
  "  attempts: 0",
  "---",
  'enum Severity { Low = "low", High = "high" }',
  "let v = @<Severity>`Ping`?",
  "v",
  "",
].join("\n");

/**
 * The in-memory user session an ON-SESSION free phase drives (the
 * tests/typed-two-phase-live.test.ts `LiveSessionDouble` discipline, reduced to
 * the single turn this section needs): `sendUserMessage` commits the user entry
 * and marks the turn streaming; `tick()` — reached only through the injected
 * `Clock` — fires the one-shot mid-turn hook while the turn is LIVE, which is
 * the sole window in which the producer's respond-capture slot is armed, and
 * then commits the trailing assistant entry.
 */
class OnSessionDouble {
  readonly entries: Array<{
    readonly type: "message";
    readonly id: string;
    readonly parentId: string | undefined;
    readonly message: Record<string, unknown>;
  }> = [];
  sendUserMessageCalls = 0;
  onMidTurn: (() => void) | undefined = undefined;

  #idle = true;
  #midTurnFired = false;
  #turnsCompleted = 0;

  sendUserMessage(content: string): void {
    this.sendUserMessageCalls += 1;
    this.#append({ role: "user", content: [{ type: "text", text: content }], timestamp: 0 });
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
      this.#midTurnFired = true;
      this.onMidTurn?.();
    }
    this.#turnsCompleted += 1;
    if (this.#turnsCompleted > 1) {
      // No silent skipping: a captured early respond terminates the free phase
      // after ONE turn. A second driven turn would otherwise be absorbed as
      // another benign `stop` and the divergence would never surface.
      throw new Error(
        `on-session double: the drive completed free-phase turn #${this.#turnsCompleted}; ` +
          `a captured early respond terminates the free phase after exactly ONE`,
      );
    }
    this.#append({
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "m1",
      stopReason: "stop",
      timestamp: 0,
    });
    this.#idle = true;
  }

  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
}

/**
 * Drive a theta whose TOP-LEVEL typed query runs ON-SESSION through the shipped
 * producer, handing `midTurn` the registered respond `ToolDefinition` while the
 * turn streams — the window in which `#executeRespondTool` sees a live capture.
 */
async function driveOnSession(
  source: string,
  midTurn: (definition: ToolDefinition) => Promise<unknown>,
): Promise<{
  readonly execution: BodyExecution;
  readonly notes: readonly string[];
  readonly executeResult: unknown;
  readonly sessionTurns: number;
}> {
  const doc = parseDoc(source, "wireonsession.theta");
  expect(
    doc.diagnostics,
    `fixture guard: the driven theta must parse cleanly; ` +
      JSON.stringify(doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`)),
  ).toEqual([]);
  const theta: ThetaCompositionInput = {
    slashName: "wireonsession",
    sourcePath: "/theta/wireonsession.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const session = new OnSessionDouble();
  const notes: string[] = [];
  const tools: ToolDefinition[] = [];
  let placed: Promise<unknown> | undefined;
  session.onMidTurn = (): void => {
    const definition = tools[0];
    if (definition === undefined) {
      // No silent skipping: this section's premise is a REGISTERED respond tool
      // reachable mid-turn (PIC-44 / QRY-14). A missing registration fails here
      // naming itself instead of leaving the cell to pass on a vacuous drive.
      throw new Error(
        "on-session drive: no respond tool was registered before the free-phase turn",
      );
    }
    placed = midTurn(definition);
  };
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
      sendUserMessage: (content: string): void => {
        session.sendUserMessage(content);
      },
      registerTool: (definition: ToolDefinition): void => {
        tools.push(definition);
      },
      getActiveTools: (): string[] => [],
      setActiveTools: (): void => {},
      on: (): void => {},
    } as unknown as ExtensionAPI,
    root: {
      checkpoint: { before: (): Promise<void> => Promise.resolve() },
      idSource: {
        newInvocationId: (): string => "inv-1",
        newToolCallId: (): string => "tc-1",
      },
      clock: {
        now: (): number => 0,
        wallNow: (): number => 0,
        // The producer's turn-lifecycle polls run on this seam, so completing
        // the streamed turn here is what makes the mid-turn window observable.
        setTimeout: (fn: () => void): unknown => {
          session.tick();
          fn();
          return 0;
        },
        clearTimeout: (): void => {},
      },
      schemaValidator: ajv(),
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
      signal: undefined,
      isIdle: (): boolean => session.isIdle(),
      waitForIdle: (): Promise<void> => Promise.resolve(),
      sessionManager: {
        getEntries: (): readonly unknown[] => [...session.entries],
        getLeafId: (): undefined => undefined,
      },
    } as unknown as ExtensionCommandContext,
  });
  expect(
    binding.drivenAgainst,
    "the capture slot is armed only by the ON-SESSION free phase; a drive bound " +
      "off-session would exercise nothing",
  ).toBe("prompt-user-session");
  const execution = await executeBody(theta.body, binding.executeDeps);
  expect(
    placed,
    "the mid-turn hook must have placed the respond-tool call — an unplaced call " +
      "would leave the assertions below reading a drive that never touched `execute`",
  ).toBeDefined();
  return {
    execution,
    notes,
    executeResult: await placed,
    sessionTurns: session.sendUserMessageCalls,
  };
}

/** The text parts of one respond-tool `execute` result. */
function executeResultText(result: unknown): string {
  const parts =
    (result as { readonly content?: ReadonlyArray<{ type?: unknown; text?: unknown }> })
      .content ?? [];
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("");
}

describe("bug 0028 wire contract — the registered `execute` against an armed capture (offline)", () => {
  beforeEach(() => {
    scripted.calls.length = 0;
    scripted.queue = [];
  });

  it('PROD-EXECUTE-ENVELOPE: an ENUM-root query\'s `execute` unwraps the envelope — `{value:"low"}` captures the BARE "low"', async () => {
    // The arm no other cell reaches: pi-agent-core hands `execute` the
    // host-validated WIRE arguments, which for a non-object root are the
    // ENVELOPE. Captured verbatim, `{value:"low"}` reaches the enum root's AJV
    // validator, which rejects it — the call comes back `isError`, nothing is
    // captured, and the query cannot resolve from the answer the model gave.
    // The scripted queue stays EMPTY: a captured early respond skips the forced
    // off-session dispatch, so any `complete()` call throws loudly.
    const result = await driveOnSession(ENUM_ROOT_THETA, (definition) =>
      (
        definition.execute as unknown as (
          id: string,
          params: unknown,
          signal: AbortSignal | undefined,
        ) => Promise<unknown>
      )("tc-early", { value: "low" }, new AbortController().signal),
    );
    expect(
      (result.executeResult as { readonly isError?: unknown }).isError,
      `the enveloped call is VALID once unwrapped, so \`execute\` must not report an ` +
        `error; observed: ${JSON.stringify(result.executeResult)}`,
    ).toBeFalsy();
    expect(
      executeResultText(result.executeResult),
      `the valid call's tool-result text records the final answer (QRY-14 one-shot ` +
        `capture); observed: ${JSON.stringify(result.executeResult)}`,
    ).toMatch(/recorded/i);
    expect(
      result.sessionTurns,
      "exactly ONE on-session free-phase turn carried the call",
    ).toBe(1);
    expect(
      scripted.calls.length,
      "a captured early respond skips the forced off-session dispatch — ZERO complete() calls",
    ).toBe(0);
    expectBound(
      result,
      "low",
      "the captured payload is the BARE enum value the declared schema validates, " +
        "not the `{value: …}` wire envelope",
    );
  });
});
