// Bug 0092 — `renderObject` (`src/render/argument-echo.ts`) reads
// `value[first.name]` with no record check and no own-key guard, and the sole
// descriptor producer `echoTypeFromValue`
// (`src/extension/production-theta-producer.ts`, module-private) manufactures
// the mismatch: its array arm derives ONE element descriptor from element 0 and
// `EchoType`'s array arm carries one `element` for the whole array, so
// `renderArray` renders every element under element 0's descriptor. An
// `array<T | null>` or an array of discriminated-union variants therefore
// aborts a slash invocation whose bind already succeeded, with a `TypeError`
// out of the echo path (`docs/bugs/0092-renderobject-first-field-unguarded-cast.md`).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/binder/defaulting-system-note-echo.md:43 — "Object
//     values shown as `{first-field-value, …}`"; "'First field' of an object
//     value is the first field listed in the declaring `schema` block's source
//     order", and for a discriminated union "the variant's declared fields are
//     used in the variant's own source order". The variant is resolved PER
//     VALUE, so an array of variants has one first-field answer per element.
//   - :42 — the array rule renders each element recursively, "a nested object
//     element renders as `{first-field-value, …}`". Per element.
//   - :28 / :20 — the success echo is appended "immediately before the theta
//     starts" with the grammar `Running /<name>: <formatted-args>`. Neither
//     sentence gives the echo a failure arm.
//   - docs/spec_topics/binder/determinism-cancellation-failure.md:35, :52 —
//     the binder's terminating failure classes. A renderer throw at the echo
//     step is in none of them.
//   - docs/spec_topics/schema-subset.md:8, :12 — `required` lists every
//     declared property and `additionalProperties` is always `false`, so an
//     array `anyOf` is the only admitted heterogeneity; a single-object param
//     missing a declared key is rejected by AJV before the echo.
//
// THE SETTLED DESIGN THIS FILE ENCODES (§Fix, as adjudicated for this lane):
//   1. `EchoType`'s array arm becomes
//      `{ readonly kind: "array"; readonly elements: readonly EchoType[] }` —
//      a per-element descriptor list REPLACING the single `element`. The
//      `{ kind: "string" }` placeholder the empty-array case needs today goes
//      away with the single-`element` shape.
//   2. `echoTypeFromValue`'s array arm maps EVERY element through
//      `echoTypeFromValue` with the same lowered `items` property, so each
//      element is described by itself and an `anyOf` items schema produces one
//      descriptor per variant.
//   3. `renderArray` renders element `i` under descriptor `i`; a
//      descriptor-count / element-count mismatch raises the caller-side
//      construction-bug class (`RangeError`) the empty-`fields` arm of
//      `renderObject` already uses.
//   4. `renderObject` tests both premises before the first-field read: `value`
//      must be a non-null, non-array object, and `first.name` must satisfy
//      `Object.prototype.hasOwnProperty.call(value, first.name)`. A violation
//      raises the same `RangeError` class, naming the offending field and the
//      value's own keys.
//
// FIELD ORDER IS AN EXPLICIT §Non-goal OF 0092. The descriptor keeps the
// VALUE's own key insertion order; only the crash goes away. The carrier-2
// expectation below is therefore `items=[{x, …}, {square, …}]` — element 0's
// own key order puts `label` first — and NOT the `{circle, …}` the bug
// document's §"Expected behaviour" writes, which silently adopts the declaring
// schema's source order that §Non-goals forbids this fix from settling. That is
// the one place the bug document is internally inconsistent with its own
// §Non-goals; the §Non-goal governs.
//
// RED / GREEN LEDGER, measured at HEAD 670875c8 (v0.205.0).
//   RED here, green once the fix lands:
//     a1 (carrier 1 — `TypeError … (reading 'label')`, 0 notes),
//     a2 (carrier 2 — `TypeError … (reading 'replace')`, 0 notes),
//     a3 (carrier 3 — bound, but the silent wrong note
//         `items=[null, null]`),
//     b1 (`{b:1}` under a numeric first field renders the literal
//         `{undefined, …}` instead of raising),
//     b2 (`null` under an object descriptor — `TypeError … (reading 'a')`
//         instead of the caller-side `RangeError`),
//     b3 (`{b:"y"}` under a string first field —
//         `TypeError … (reading 'replace')` instead of the `RangeError`),
//     b4 (descriptor-count / element-count mismatch — `TypeError … (reading
//         'kind')` from the absent single `element` instead of the
//         `RangeError`),
//     c4 (the ≥4-element rule under a per-element descriptor list —
//         `TypeError … (reading 'kind')`).
//   GREEN on both trees, asserted as non-regression pins of the BNDR-6
//   invariants §Fix requires the fix to preserve:
//     c1 (an empty array renders `[]` through the producer, with no synthetic
//         element descriptor needed),
//     c2 (an EMPTY per-element descriptor list renders `[]` — green at HEAD
//         only incidentally, because `[].map` never reads the absent single
//         `element`; it reds if the fix makes the empty list unrenderable),
//     c3 (the ≥4-element array renders `[a, b, c, …+N more]` with
//         `N = total − 3` over the FULL length, through the producer),
//     c5 (`array<number>` whose elements are runtime-integral renders every
//         element through the lowered-`properties` discriminator).
//   Measured tally at HEAD: 8 failed, 4 passed (12 cells).
//
// ANTI-VACUITY. Every producer row asserts the DELIVERED `theta-system-note`
// content by whole-string equality after asserting the bind happened and that
// exactly one note landed on the channel — never on `runBinder` resolving — so
// a harness that stopped reaching the emitter fails loudly instead of passing a
// zero-note filter. Every renderer row asserts the thrown value's CLASS and its
// message content, so a row that renders text (b1 today) and a row that throws
// the wrong class (b2/b3/b4 today) both red. The direct-renderer rows build the
// settled per-element descriptor shape through {@link arrayEcho}; the shape is
// the assertion.
//
// TIER: unit, offline, deterministic, provider-free. Groups B and C's direct
// rows settle inside calls on the exported pure renderer `renderEchoValue`.
// Group A and C's producer rows need the real
// `ProductionThetaProducer.runBinder()` because the defect is jointly owned by
// the renderer and its descriptor producer, and the producer is module-private:
// only the emitter path constructs the descriptor from a real lowered schema.
// They run the group-G rig of `tests/echo-value-rule1-sanitisation.test.ts`
// (§"G. Emitter-level witness through the production producer") — the
// off-session `complete()` scripted to a forced ToolCall, a REAL
// `AjvSchemaValidator` in the runtime root, an in-memory `fileSystem.readBytes`
// so `#recoverDeclaredDefaults` re-reads the fixture bytes, and the real
// `pi.sendMessage` delivery captured. The integration tier buys no reach over a
// scripted envelope (the binder's only contribution is the JSON `args`), and
// the live tier would make a fully determined observable stochastic.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The scripted off-session binder reply. `vi.hoisted` so the `vi.mock` factory
// (hoisted above the imports) can close over a mutable holder each test sets.
const scripted = vi.hoisted(() => ({
  replyFor: undefined as undefined | ((context: unknown) => unknown),
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export (types, helpers) passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (_model: unknown, context: unknown) =>
      scripted.replyFor?.(context),
    ),
  };
});

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";
import { renderEchoValue, type EchoType } from "../src/render/argument-echo";
import type { ThetaValue } from "../src/runtime/value";
import type { RuntimeRoot } from "../src/runtime-root";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";

// ===========================================================================
// Descriptor constructors (the settled §Fix shape)
// ===========================================================================

/**
 * Build the settled array descriptor: one `EchoType` per element, in element
 * order.
 */
function arrayEcho(...elements: readonly EchoType[]): EchoType {
  return { kind: "array", elements };
}

/** An object descriptor whose single (hence first) field is `name: type`. */
function objectEcho(name: string, type: EchoType): EchoType {
  return { kind: "object", fields: [{ name, type }] };
}

const STR: EchoType = { kind: "string" };

/**
 * Call `renderEchoValue` and return what it threw, or `undefined` when it
 * returned. The returned text is reported in the assertion message so a row
 * that renders instead of raising names the text it rendered.
 */
function thrownBy(value: unknown, type: EchoType): { readonly error?: unknown; readonly text?: string } {
  try {
    return { text: renderEchoValue(value as ThetaValue, type) };
  } catch (error) {
    return { error };
  }
}

/**
 * Assert a row raised the caller-side construction-bug class (`RangeError`, the
 * class `renderObject`'s empty-`fields` arm already uses) and that its message
 * names each of `mentions`. Fails loudly, naming the rendered text, when the
 * row returned instead of raising.
 */
function expectCallerSideRangeError(
  outcome: { readonly error?: unknown; readonly text?: string },
  mentions: readonly string[],
): void {
  expect(
    outcome.error,
    `the row must raise the caller-side construction-bug class; it rendered ${JSON.stringify(outcome.text)} instead`,
  ).toBeInstanceOf(RangeError);
  const message = String((outcome.error as Error).message);
  for (const mention of mentions) {
    expect(
      message,
      "the RangeError must name the offending field and the value's own keys",
    ).toContain(mention);
  }
}

// ===========================================================================
// Harness — the group-G rig of tests/echo-value-rule1-sanitisation.test.ts
// ===========================================================================

const SYSTEM_NOTE_CHANNEL = "theta-system-note";

/** A captured `pi.sendMessage` custom message (the theta-system-note channel). */
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
}

/**
 * Script a ToolCall-bearing binder reply carrying `{ envelope }` in its
 * `arguments`, naming the binder tool production actually attached on the
 * captured call — the forced-tool extraction reads the envelope from the FIRST
 * ToolCall naming that tool, so a free-text reply would be the
 * malformed-envelope class instead of the `ok` arm under test.
 */
function scriptEnvelope(envelope: unknown): void {
  scripted.replyFor = (context: unknown): unknown => {
    const tools = (context as { tools?: ReadonlyArray<{ name?: unknown }> }).tools;
    const name = typeof tools?.[0]?.name === "string" ? tools[0].name : "__theta_bind_none";
    return {
      role: "assistant",
      content: [{ type: "toolCall", id: "tc-1", name, arguments: { envelope } }],
      stopReason: "toolUse",
      timestamp: 0,
    };
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

const SOURCE_PATH = "/fixtures/t.theta";

/**
 * A runtime-root double sufficient for a binder pass: noop checkpoint,
 * deterministic ids, wall-clock zero, the REAL AJV validator (the forced-tool
 * routing validates the extracted envelope, and the post-default-merge hook
 * re-validates the merged document), and an in-memory fs serving exactly the
 * bytes the parser saw so `#recoverDeclaredDefaults` re-reads the same source.
 * An unregistered path REJECTS loudly: a silent empty read would turn a
 * defaults-recovery failure into a clean-looking merge.
 */
function rootDouble(source: string): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    schemaValidator: new AjvSchemaValidator({
      emit: (): void => {},
      slugOf: (schema: LoweredSchema): SchemaSlug => {
        const canonicalBytes = JSON.stringify(schema);
        return { slug: canonicalBytes, canonicalBytes };
      },
    }),
    fileSystem: {
      readBytes: (path: string): Promise<Uint8Array> =>
        path === SOURCE_PATH
          ? Promise.resolve(new TextEncoder().encode(source))
          : Promise.reject(new Error(`fixture fs: no source registered for ${path}`)),
    },
  } as unknown as RuntimeRoot;
}

const BINDER_MODEL = {
  id: "binder-model",
  provider: "anthropic-messages",
  api: "anthropic-messages",
  strictCapable: true,
};

function producerWithCapture(source: string): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly notes: CapturedNote[];
} {
  const notes: CapturedNote[] = [];
  const pi = {
    sendMessage: (message: CapturedNote): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
  const modelRegistry = {
    getAvailable: (): readonly unknown[] => [BINDER_MODEL],
    getApiKeyAndHeaders: async (): Promise<{ ok: boolean }> => ({ ok: true }),
  } as unknown as ModelRegistry;
  const deps = createProductionProducerDeps({ pi, root: rootDouble(source), modelRegistry });
  return { deps, notes };
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

/** Compose one fixture theta source from its `params:` lines and its body. */
function thetaSource(paramLines: readonly string[], bodyLines: readonly string[]): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: binder-model",
    "params:",
    ...paramLines,
    "---",
    ...bodyLines,
    "",
  ].join("\n");
}

function compositionInput(source: string): ThetaCompositionInput {
  const parsed: ThetaSource = {
    path: "t.theta",
    bytes: new TextEncoder().encode(source),
  };
  const doc = parseThetaDocument(parsed, parseDeps());
  expect(
    doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    "the fixture must parse cleanly before it is driven — a refused parse would make the echo assertion unreachable",
  ).toEqual([]);
  expect(doc.frontmatter, "the fixture must carry parseable frontmatter").not.toBeNull();
  return {
    slashName: "t",
    sourcePath: SOURCE_PATH,
    frontmatter: doc.frontmatter!,
    body: doc.body,
    binderModel: "binder-model",
  };
}

/**
 * Drive one scripted `ok` bind over `source` and return the single delivered
 * `theta-system-note` content. Fails loudly naming the unmet precondition when
 * the bind did not reach the emitter, so a broken harness cannot masquerade as
 * a passing assertion. Nothing here catches: a throw out of the echo path (the
 * 0092 symptom) surfaces as the test's own rejection.
 */
async function bindAndReadNote(
  source: string,
  args: Readonly<Record<string, unknown>>,
): Promise<string> {
  scriptEnvelope({ kind: "ok", args });
  const { deps, notes } = producerWithCapture(source);
  const result = await deps.runBinder({
    theta: compositionInput(source),
    args: "some free-text invocation tail",
    ctx: ctxDouble(),
  });
  expect(result.bound, "the scripted `ok` envelope must bind for the echo to be emitted").toBe(
    true,
  );
  const channelNotes = notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL);
  expect(
    channelNotes,
    "exactly one theta-system-note (the success echo) is emitted on the `ok` arm",
  ).toHaveLength(1);
  expect(channelNotes[0]!.display, "the echo note is display:true").toBe(true);
  return channelNotes[0]!.content;
}

beforeEach(() => {
  scripted.replyFor = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// A. The three reachable carriers, through the production emitter
// ===========================================================================

/** Carrier 1 — an author-controlled declared default, no model in the loop. */
const CARRIER_1 = thetaSource(
  ["  topic: string", `  items: 'array<Shape | null> = [Shape { label: "x" }, null]'`],
  ["schema Shape { label: string }", "@`x ${topic}`"],
);

/** Carrier 2 — binder-supplied args over a discriminated union. */
const CARRIER_2 = thetaSource(
  ["  items: array<Shape>", "  topic: string"],
  [
    `schema Circle { kind: "circle", label: string }`,
    `schema Square { kind: "square", size: integer }`,
    "schema Shape = Circle | Square",
    "@`x ${topic}`",
  ],
);

/** Carrier 3 — the silent row: `array<Shape | null>` with the `null` first. */
const CARRIER_3 = thetaSource(
  ["  topic: string", "  items: array<Shape | null>"],
  ["schema Shape { label: string }", "@`x ${topic}`"],
);

describe("bug 0092 — an array whose element shapes differ echoes each element under its own descriptor", () => {
  it("a1: the declared-default carrier echoes the object element and the null element by their own rules ", async () => {
    // The author-controlled carrier: the binder omits `items`, the
    // fill-if-absent arm supplies `[Shape { label: "x" }, null]` recovered by
    // `#recoverDeclaredDefaults`, and no model decided anything. At HEAD the
    // whole invocation aborts with `TypeError: Cannot read properties of null
    // (reading 'label')` out of `renderObject` and ZERO notes are delivered.
    // §"Expected behaviour": the object element by the object rule, the `null`
    // element by the `null` rule, with the field tagged `(default)` because it
    // took its declared default this run.
    const content = await bindAndReadNote(CARRIER_1, { topic: "t" });
    expect(content).toBe("Running /t: topic=t, items=[{x, …}, null] (default)");
  });

  it("a2: a discriminated-union array echoes each variant's own first field ", async () => {
    // Element 0's own key order puts `label` first, so at HEAD the whole array
    // is described as `{label: string}` and element 1 (a `Square`, which
    // carries no `label`) reaches `sanitizeSystemNoteSubstring` as `undefined`
    // → `TypeError: Cannot read properties of undefined (reading 'replace')`.
    // Post-fix each element is described by itself. FIELD ORDER is a §Non-goal:
    // the descriptor keeps each value's own key insertion order, so element 0
    // renders its `label` (`x`) and element 1 its `kind` (`square`).
    const content = await bindAndReadNote(CARRIER_2, {
      topic: "t",
      items: [
        { label: "x", kind: "circle" },
        { kind: "square", size: 2 },
      ],
    });
    expect(content).toBe("Running /t: items=[{x, …}, {square, …}], topic=t");
  });

  it("a3: the `[null, {…}]` array no longer renders its object element as `null` ", async () => {
    // The same root cause in its SILENT form: element 0 is `null`, so at HEAD
    // the whole array is described `{kind:"null"}` and element 1 — a real
    // object — is delivered on the success channel as the literal `null`, an
    // output no BNDR-6 row admits. Nothing throws and nothing signals.
    const content = await bindAndReadNote(CARRIER_3, {
      topic: "t",
      items: [null, { label: "x" }],
    });
    expect(content).toBe("Running /t: topic=t, items=[null, {x, …}]");
  });
});

// ===========================================================================
// B. The direct-renderer rows — the guard `renderObject` does not have
// ===========================================================================

describe("bug 0092 — renderObject tests its two premises instead of assuming them", () => {
  it("b1: a record lacking the first field under a numeric type raises instead of rendering `{undefined, …}` ", () => {
    // §"Actual behaviour": the `as ThetaValue` cast erases the `undefined` a
    // missing key produces, and `renderCanonicalNumber` returns the STRING
    // "undefined" for it. At HEAD this row renders `{undefined, …}` and is
    // delivered on the success channel as if conformant. §Fix: the own-key
    // premise is tested before the read, and a violation raises the
    // caller-side construction-bug class naming the field and the value's own
    // keys.
    expectCallerSideRangeError(thrownBy({ b: 1 }, objectEcho("a", { kind: "integer" })), [
      "a",
      "b",
    ]);
  });

  it("b2: a null value under an object descriptor raises the caller-side class, not a TypeError ", () => {
    // `null[first.name]` throws inside `renderObject` itself at HEAD —
    // `TypeError: Cannot read properties of null (reading 'a')` — two frames
    // from the descriptor/value disagreement that caused it. §Fix: `value`
    // must be a non-null, non-array object, tested before the read.
    expectCallerSideRangeError(thrownBy(null, objectEcho("a", STR)), ["a"]);
  });

  it("b3: a record lacking a string-typed first field raises the caller-side class, not a .replace TypeError ", () => {
    // The 0087 residual: the `string` arm routes through
    // `sanitizeSystemNoteSubstring` (`src/binder/system-note.ts`), so a missing
    // string-typed first field fails on `.replace` at HEAD. The failure names
    // neither the field nor the descriptor.
    expectCallerSideRangeError(thrownBy({ b: "y" }, objectEcho("a", STR)), ["a", "b"]);
  });

  it("b4: a descriptor-count / element-count mismatch raises the same caller-side class ", () => {
    // §Fix item 3: `renderArray` renders element `i` under descriptor `i`, so a
    // list that does not cover the array is a caller-side construction bug in
    // exactly the sense the empty-`fields` arm already names. At HEAD the array
    // arm carries a single `element`, so this descriptor's absent `element`
    // reaches the switch as `undefined` → `TypeError … (reading 'kind')`.
    const outcome = thrownBy(["a", "b", "c"], arrayEcho(STR, STR));
    expect(
      outcome.error,
      `a descriptor list shorter than the array must raise the caller-side construction-bug class; it rendered ${JSON.stringify(outcome.text)} instead`,
    ).toBeInstanceOf(RangeError);
  });
});

// ===========================================================================
// C. The BNDR-6 invariants the fix must preserve (§Fix constraints)
// ===========================================================================

/** An `array<string>` param, for the empty-array and ≥4-element rows. */
const STRING_ARRAY_THETA = thetaSource(
  ["  topic: string", "  items: array<string>"],
  ["@`x ${topic}`"],
);

/** An `array<number>` param, for the integer/number discriminator row. */
const NUMBER_ARRAY_THETA = thetaSource(
  ["  topic: string", "  items: array<number>"],
  ["@`x ${topic}`"],
);

describe("bug 0092 — the BNDR-6 array invariants survive the per-element descriptor list", () => {
  it("c1: an empty array still renders `[]` through the production emitter ", async () => {
    // §Fix: "An empty array keeps rendering `[]` without needing a synthetic
    // element descriptor — the `{ kind: "string" }` placeholder exists only to
    // satisfy the current single-`element` shape and goes away with it." A pin,
    // green on both trees: it reds only if the fix makes the empty descriptor
    // list unrenderable.
    const content = await bindAndReadNote(STRING_ARRAY_THETA, { topic: "t", items: [] });
    expect(content).toBe("Running /t: topic=t, items=[]");
  });

  it("c2: an empty per-element descriptor list renders an empty array as `[]` ", () => {
    // The same invariant at the renderer, stated in the settled shape: zero
    // elements, zero descriptors, no synthetic placeholder. Reds at HEAD, whose
    // array arm has no `elements` member to read.
    expect(renderEchoValue([] as unknown as ThetaValue, arrayEcho())).toBe("[]");
  });

  it("c3: a 5-element array still renders `[a, b, c, …+2 more]` through the production emitter ", async () => {
    // §Fix: "the array rule still renders at most the first three elements and
    // still computes `…+N more` as `total − 3` over the full length". N is
    // measured over the FULL array (5 − 3 = 2), not over the descriptor list or
    // the rendered prefix. A pin, green on both trees.
    const content = await bindAndReadNote(STRING_ARRAY_THETA, {
      topic: "t",
      items: ["a", "b", "c", "d", "e"],
    });
    expect(content).toBe("Running /t: topic=t, items=[a, b, c, …+2 more]");
  });

  it("c4: the ≥4-element rule counts `…+N more` over the full length under a per-element list ", () => {
    // The same invariant at the renderer, in the settled shape, with the
    // elements deliberately non-uniform in rendering so a fix that reused
    // descriptor 0 for the prefix would red on the second element too.
    expect(
      renderEchoValue(
        ["a", "b b", "c", "d", "e"] as unknown as ThetaValue,
        arrayEcho(STR, STR, STR, STR, STR),
      ),
    ).toBe('[a, "b b", c, …+2 more]');
  });

  it("c5: every element of an `array<number>` takes the lowered-`properties` discriminator ", async () => {
    // §Fix: "The `integer` / `number` discriminator keeps coming from the
    // lowered `properties` and never from runtime integrality
    // (`loweredSchemaKindIsInteger`), for every element of an array." The
    // mapped-per-element arm must pass the SAME lowered `items` property to
    // every element, not `undefined` for elements past index 0. Honest scope
    // note: BNDR-4 and BNDR-5 both delegate to `canonicalDecimal`
    // (`src/render/canonical-number.ts`), so the two kinds coincide byte-wise
    // and this row pins the per-element rendering rather than a text
    // difference between the discriminators. A pin, green on both trees.
    const content = await bindAndReadNote(NUMBER_ARRAY_THETA, {
      topic: "t",
      items: [1, 2.5, 3],
    });
    expect(content).toBe("Running /t: topic=t, items=[1, 2.5, 3]");
  });
});
