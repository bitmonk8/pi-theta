// Bug 0011 — the production binder `complete()` call must be the SPEC-pinned
// forced-tool structured-output call, not a prose user message + text parse.
//
// This suite pins the forced-tool binder mechanism AT THE SEAMS by driving the
// production `ProductionThetaProducer.runBinder()` with a mocked pi-ai
// `complete()` (the e2e-s5 pattern) and asserting the captured
// `complete(model, context, options)` triple plus the routed outcome. It
// contains NO fix: at HEAD the RED PINS below fail (each for the documented
// reason) and the CONTROLS pass; after the bug-0011 option-1 fix all 17 pass.
//
// Spec pinned:
//   - pi-integration-contract/binder-inference.md §"Binder inference call" —
//     systemPrompt, the fixed user literal, the single `__theta_bind_<slug>`
//     tool, forced `options.toolChoice`, temperature 0, per-api seed field,
//     `options.signal`, `options.onResponse`, and the ToolCall-arguments
//     extraction rule (plain text / wrong-name ToolCall = malformed envelope).
//     ONE spec amendment rides the fix (bug 0011 option 1): the tool
//     `parameters` is the envelope schema ROOTED IN AN OBJECT WRAPPER
//     `{ type:"object", properties:{ envelope:<anyOf> }, required:["envelope"],
//     additionalProperties:false }` because a top-level `anyOf` is not a valid
//     provider `input_schema`; BNDR-1/BNDR-2 are preserved one level down at
//     `properties.envelope`. The bug-0011 LIVE round amended the `$defs`
//     transport half: the attachment copy dereferences every `#/$defs/...`
//     ref (inlined, transitively) and carries no `$defs` key — provider tool
//     input-schema `$ref`/`$defs` handling degrades the forced arguments —
//     while AJV/slug consume the envelope document itself (see the
//     POST-LIVE-FAILURE PIN at the bottom of the suite).
//   - binder/binder-bypass-and-envelope.md §"System-prompt structure
//     (normative)" (the 8-item V11d structure; byte-exact parameter lines) and
//     §"Binder envelope" (`maxLength: 500` model budget).
//   - binder/determinism-cancellation-failure.md §Determinism (FNV-1a seed,
//     reference vector `code-review` → 0x7ba86b63), §"Failure-mode templates",
//     §"Per-invocation retry budget" (malformed and transport each get ONE
//     retry; at most 3 calls).
//   - pi-integration-contract/provider-error-mapping.md §"Classifier input
//     surface" (HTTP status from the `onResponse`-captured `ProviderResponse`,
//     never a fabricated 200) and the anthropic-messages overflow signature
//     (HTTP 400 + "prompt is too long").
//
// RED PINS (fail at HEAD, documented reason each):
//    1. systemPrompt V11d structure         — HEAD: context.systemPrompt undefined.
//    2. default=<literal> parameter line    — HEAD: context.systemPrompt undefined.
//    3. fixed single user-message literal   — HEAD: content is the prose prompt.
//    4. one __theta_bind_<slug> tool + wrap — HEAD: context.tools undefined.
//    5. anthropic toolChoice spelling       — HEAD: options.toolChoice absent.
//    6. openai-completions toolChoice       — HEAD: options.toolChoice absent.
//    7. temperature/signal/onResponse       — HEAD: onResponse never registered
//       (temperature 0 and signal already conform at HEAD; onResponse is the teeth).
//    8. openai `seed` = FNV-1a              — HEAD: no seed key ever sent.
//    9. mistral `random_seed` + anthropic omission — HEAD: mistral arm red
//       (no random_seed); the anthropic omission alone would be green, so the
//       two arms share one test to keep it red at HEAD.
//   10. ToolCall ok envelope binds + echoes — HEAD: bound=false (text parse
//       finds no text in a ToolCall-only reply).
//   11. free-text envelope is MALFORMED     — HEAD: binds successfully (the
//       central red pin: HEAD's mechanism IS the free-text parse).
//   12. ToolCall needs_info routes          — HEAD: malformed note + 2 calls
//       instead of the needs_info note + 1 call.
//   13. onResponse status → classifier      — HEAD: fabricated httpStatus 200
//       misses the anthropic 400 overflow signature, so the note carries the
//       raw errorMessage instead of the fixed transport fallback.
//
// CONTROLS (green at HEAD for a mechanism-independent reason — HEAD cannot
// read ToolCall parts at all, so every ToolCall-only reply is malformed with
// the same observable — kept as the post-fix boundary pins):
//   14. needs_info message >500 chars → malformed (post-fix: envelope AJV
//       maxLength budget at the routing step).
//   15. ok arm with non-object args → malformed, never a silent `{}` bind
//       (post-fix: envelope AJV on the ok arm's args shape).
//   16. extra top-level envelope keys → malformed (post-fix: envelope AJV
//       additionalProperties:false at the routing step).
//   17. ToolCall with a different name → malformed (post-fix: the extraction
//       rule matches on the binder tool name).
//
// Deviations from the bug-0011 test plan (documented, deliberate):
//   - The expected tool name is `binderToolName(respondSchemaSlug(envelope))`,
//     NOT `schemaSlug(envelope)`: `schemaSlug` consumes the TAGGED
//     `LoweredJsonValue` form and its `canonicalForm` switches on `.kind`, so
//     handing it the plain envelope JSON document throws at runtime. The spec
//     sentence pins "the same recipe the typed-query `__theta_respond_<slug>`
//     tool name uses", and in production that recipe is `respondSchemaSlug`
//     (sha256 over JSON.stringify, first 16 hex chars) — the byte-equal-by-
//     construction naming the bug-0011 fix is expected to reuse.
//   - The FNV-1a reference decimal is 2074635107 (=== 0x7ba86b63, verified by
//     executing the spec algorithm); the plan's "2074572643" was a hex→decimal
//     transcription slip. The spec's hex vector is authoritative.
//   - The runtime-root double carries a REAL `AjvSchemaValidator` and an
//     in-memory `fileSystem.readBytes` over the fixture sources (beyond the
//     e2e-s5 minimal double), so the post-fix seams — envelope AJV at the
//     routing step, default-literal recovery for the Parameters block — behave
//     as production without this file needing to change again.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The scripted off-session binder reply. `vi.hoisted` so the `vi.mock` factory
// (hoisted above the imports) can close over a mutable holder each test sets.
// `replyFor` scripts the reply as a FUNCTION of the captured call so a ToolCall
// reply can name whatever tool production actually attached; `calls` captures
// the full `complete(model, context, options)` triple per attempt.
const scripted = vi.hoisted(() => ({
  reply: undefined as unknown,
  replyFor: undefined as
    | undefined
    | ((model: unknown, context: unknown, options: unknown) => unknown),
  calls: [] as Array<{ model: unknown; context: unknown; options: unknown }>,
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export (types, helpers) passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (model: unknown, context: unknown, options: unknown) => {
      scripted.calls.push({ model, context, options });
      return scripted.replyFor !== undefined
        ? scripted.replyFor(model, context, options)
        : scripted.reply;
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
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import {
  BINDER_MESSAGE_CONTENT,
  BINDER_TOOL_DESCRIPTION,
  binderToolName,
} from "../src/binder/binder-inference";
import { buildBinderEnvelopeSchema } from "../src/binder/binder-envelope";
import { deriveBinderSeed } from "../src/binder/binder-seed";
import { respondSchemaSlug } from "../src/runtime/typed-query-validation";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";

const SYSTEM_NOTE_CHANNEL = "theta-system-note";

/** A captured `pi.sendMessage` custom message (the theta-system-note channel). */
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
}

// --- theta fixtures ----------------------------------------------------------

// A two-required-string-param theta (forces a genuine binder pass — not a
// no-params or single-string bypass — with NO defaulted fields, so the ok arm's
// defaults-merge short-circuits without touching the filesystem seam).
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

// The defaulted-field variant: `tone` declares the Theta-literal default
// `"neutral"`, so the V11d Parameters block must render the byte-exact line
// `  tone (string) default="neutral"`. Tests against this fixture script a
// needs_info reply (never ok) so the binder pass terminates WITHOUT the ok-arm
// defaults-merge (the call is still issued and captured).
const DEFAULTED_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  topic: string",
  "  audience: string",
  '  tone: string = "neutral"',
  "---",
  "@`review ${topic} for ${audience} in a ${tone} tone`",
  "",
].join("\n");

// Bug 0011 live round (provider `$ref` handling): a params field referencing a
// body-declared `enum` lowers to `{ "$ref": "#/$defs/Severity" }` with the
// fragment under the envelope schema document's root `$defs` — the exact shape
// whose live binds ALL failed with the malformed-parse note while every
// ref-free envelope bound. The declaration rides the theta BODY (the e2e parse
// path here parses full documents), mirroring the live suite's NamedType
// fixtures.
const ENUM_PARAM_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  sev: Severity",
  "---",
  "enum Severity { Low, High }",
  "@`triage at ${sev} severity`",
  "",
].join("\n");

const TWO_PARAM_SOURCE_PATH = "/theta/code-review.theta";
const DEFAULTED_SOURCE_PATH = "/theta/code-review-defaulted.theta";
const ENUM_PARAM_SOURCE_PATH = "/theta/code-review-enum.theta";

/**
 * The fixture sources by their composition-input `sourcePath`, backing the root
 * double's in-memory `fileSystem.readBytes` so a post-fix default-literal
 * recovery over the fs seam resolves the same bytes the parser saw.
 */
const FIXTURE_SOURCES: ReadonlyMap<string, string> = new Map([
  [TWO_PARAM_SOURCE_PATH, TWO_PARAM_THETA],
  [DEFAULTED_SOURCE_PATH, DEFAULTED_THETA],
  [ENUM_PARAM_SOURCE_PATH, ENUM_PARAM_THETA],
]);

// --- binder-model doubles (one per pinned api) --------------------------------

/** A model-registry entry double sufficient for binder-model resolution. */
interface BinderModelDouble {
  readonly id: string;
  readonly provider: string;
  readonly api: string;
  readonly strictCapable: boolean;
}

// The theta's `bind_model: binder-model` reference matches on `Model.id`
// (bare-reference exact match), so only `id` must be "binder-model"; `api`
// selects the per-api toolChoice spelling and the seed-field row under test.
const ANTHROPIC_BINDER_MODEL: BinderModelDouble = {
  id: "binder-model",
  provider: "anthropic-messages",
  api: "anthropic-messages",
  strictCapable: true,
};
const OPENAI_BINDER_MODEL: BinderModelDouble = {
  id: "binder-model",
  provider: "openai",
  api: "openai-completions",
  strictCapable: true,
};
const MISTRAL_BINDER_MODEL: BinderModelDouble = {
  id: "binder-model",
  provider: "mistral",
  api: "mistral",
  strictCapable: true,
};

// --- harness (copied from the e2e-s5 pattern, extended per the header) --------

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/** Parse `.theta` source through the production whole-file parser. */
function parse(src: string) {
  const source: ThetaSource = {
    path: "code-review.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the binder theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the binder theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/**
 * The production AJV validator (real schema validation), wired with the same
 * JSON.stringify content-addressing the shipped composition root uses — so the
 * post-fix envelope AJV at the routing step validates exactly as production.
 */
function realAjvValidator(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}

/**
 * A runtime-root double sufficient for a binder pass: noop checkpoint,
 * deterministic ids, wall-clock zero, the REAL AJV validator (post-fix envelope
 * AJV), and an in-memory fs resolving the fixture sources by `sourcePath`
 * (post-fix default-literal recovery). Unknown paths reject loudly — never a
 * silent empty read.
 */
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    schemaValidator: realAjvValidator(),
    fileSystem: {
      readBytes: (path: string): Promise<Uint8Array> => {
        const src = FIXTURE_SOURCES.get(path);
        return src !== undefined
          ? Promise.resolve(new TextEncoder().encode(src))
          : Promise.reject(new Error(`fixture fs: no source registered for ${path}`));
      },
    },
  } as unknown as RuntimeRoot;
}

/**
 * A production producer wired with a capturing `pi.sendMessage`, a model
 * registry that resolves `binder-model` to the given api double, and the root
 * double. Returns the producer deps + the captured-notes sink.
 */
function producerWithCapture(model: BinderModelDouble = ANTHROPIC_BINDER_MODEL): {
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
    getAvailable: (): readonly unknown[] => [model],
    getApiKeyAndHeaders: async (): Promise<{ ok: boolean }> => ({ ok: true }),
  } as unknown as ModelRegistry;
  const deps = createProductionProducerDeps({ pi, root: rootDouble(), modelRegistry });
  return { deps, notes };
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

/** Build the composition input for a parsed fixture theta. */
function thetaInput(source: string, sourcePath: string): ThetaCompositionInput {
  const doc = parse(source);
  return {
    slashName: "code-review",
    sourcePath,
    frontmatter: doc.frontmatter!,
    body: doc.body,
    binderModel: "binder-model",
  };
}

function twoParamTheta(): ThetaCompositionInput {
  return thetaInput(TWO_PARAM_THETA, TWO_PARAM_SOURCE_PATH);
}

function defaultedTheta(): ThetaCompositionInput {
  return thetaInput(DEFAULTED_THETA, DEFAULTED_SOURCE_PATH);
}

function enumParamTheta(): ThetaCompositionInput {
  return thetaInput(ENUM_PARAM_THETA, ENUM_PARAM_SOURCE_PATH);
}

/**
 * Deep scan: every path at which the object key `key` occurs anywhere within
 * `value` (nested objects and arrays). `[]` means the key is entirely absent —
 * the bug-0011 live-round pin for `$ref` / `$defs` on the attached parameters.
 */
function deepKeyOccurrences(value: unknown, key: string): string[] {
  const hits: string[] = [];
  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (node === null || typeof node !== "object") {
      return;
    }
    for (const [k, child] of Object.entries(node as Record<string, unknown>)) {
      if (k === key) {
        hits.push(`${path}.${k}`);
      }
      visit(child, `${path}.${k}`);
    }
  };
  visit(value, "$");
  return hits;
}

function noteChannelEntries(notes: readonly CapturedNote[]): CapturedNote[] {
  return notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL);
}

// --- captured-call accessors ---------------------------------------------------

/** Narrow view over a captured `complete()` context argument. */
interface CapturedContextView {
  readonly systemPrompt?: unknown;
  readonly messages?: ReadonlyArray<{ readonly role?: unknown; readonly content?: unknown }>;
  readonly tools?: ReadonlyArray<{
    readonly name?: unknown;
    readonly description?: unknown;
    readonly parameters?: unknown;
  }>;
}

/** The captured call at `index`; throws (specific Error) when absent. */
function capturedCall(index: number): { model: unknown; context: unknown; options: unknown } {
  const call = scripted.calls[index];
  if (call === undefined) {
    throw new Error(
      `no complete() call captured at index ${index} (captured: ${scripted.calls.length})`,
    );
  }
  return call;
}

function contextOf(index: number): CapturedContextView {
  return capturedCall(index).context as CapturedContextView;
}

function optionsOf(index: number): Record<string, unknown> {
  return capturedCall(index).options as Record<string, unknown>;
}

// --- scripted replies ------------------------------------------------------------

/**
 * A stand-in binder tool name used ONLY when the captured call carries no
 * `context.tools` (i.e. at HEAD, which sends none and text-parses the reply,
 * ignoring ToolCall parts entirely) — it keeps the scripted ToolCall reply
 * well-formed; nothing at HEAD ever reads it.
 */
const HEAD_FALLBACK_TOOL_NAME = "__theta_bind_0000000000000000";

/** The binder tool name production attached on this call, or the HEAD fallback. */
function attachedBinderToolName(context: unknown): string {
  const tools = (context as CapturedContextView).tools;
  const name = tools?.[0]?.name;
  return typeof name === "string" ? name : HEAD_FALLBACK_TOOL_NAME;
}

/**
 * A ToolCall-bearing assistant reply (the pi-ai `ToolCall` content-part shape:
 * `{ type: "toolCall", id, name, arguments }`, stopReason `"toolUse"`).
 */
function toolCallReply(name: string, args: Record<string, unknown>): unknown {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id: "tc-1", name, arguments: args }],
    stopReason: "toolUse",
    timestamp: 0,
  };
}

/**
 * Script a ToolCall reply carrying `{ envelope }` in its arguments, naming the
 * tool production actually attached on the captured call (so the reply always
 * matches the sent tool, whatever slug production derives).
 */
function scriptToolCallEnvelope(envelope: unknown): void {
  scripted.replyFor = (_model, context) =>
    toolCallReply(attachedBinderToolName(context), { envelope });
}

/** An assistant reply whose text content is the given free-text envelope JSON. */
function freeTextReply(json: string): unknown {
  return {
    role: "assistant",
    content: [{ type: "text", text: json }],
    stopReason: "end_turn",
    timestamp: 0,
  };
}

// --- expected-shape helpers -----------------------------------------------------

const OK_ENVELOPE = { kind: "ok", args: { topic: "async", audience: "team" } } as const;
const BINDER_ARGS = "the async module for the team";

/**
 * The TRUE three-arm anyOf envelope schema for a fixture theta, built over the
 * PARSED theta's own lowered params schema + defaulted fields — the document
 * the wrapper's `properties.envelope` must carry verbatim (BNDR-1/BNDR-2 one
 * level down) and the document whose slug names `__theta_bind_<slug>`.
 */
function expectedEnvelopeSchemaOf(
  theta: ThetaCompositionInput,
): Readonly<Record<string, unknown>> {
  const params = theta.frontmatter.params;
  if (params?.loweredSchema === undefined) {
    throw new Error("fixture defect: the theta's params block must lower cleanly");
  }
  return buildBinderEnvelopeSchema({
    paramsSchema: params.loweredSchema,
    defaultedFields: params.defaultedFields,
  });
}

/** Drive one binder pass and return its result. */
async function driveBinder(
  deps: ReturnType<typeof createProductionProducerDeps>,
  theta: ThetaCompositionInput,
): Promise<{ readonly bound: boolean; readonly args?: Readonly<Record<string, unknown>> }> {
  return deps.runBinder({ theta, args: BINDER_ARGS, ctx: ctxDouble() });
}

// The failure-mode template rows under test (determinism-cancellation-failure.md
// §"Failure-mode templates"; the separator is U+2014 EM DASH).
const MALFORMED_NOTE =
  "theta /code-review: argument binding failed \u2014 could not parse arguments";
const NEEDS_INFO_NOTE =
  "theta /code-review: argument binding needs more info \u2014 which repository?";
const TRANSPORT_FALLBACK_NOTE =
  "theta /code-review: argument binder unavailable (anthropic-messages: provider transport failure)";

beforeEach(() => {
  scripted.reply = undefined;
  scripted.replyFor = undefined;
  scripted.calls = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("bug 0011 — the binder complete() call is the spec-pinned forced-tool structured-output call", () => {
  // ---------------------------------------------------------------------------
  // RED PIN 1 — HEAD: context.systemPrompt is undefined (everything rides the
  // prose user message), so the first assertion below fails.
  // ---------------------------------------------------------------------------
  it("call shape: systemPrompt carries the V11d structure", async () => {
    scriptToolCallEnvelope(OK_ENVELOPE);
    const { deps } = producerWithCapture();

    await driveBinder(deps, twoParamTheta());

    expect(scripted.calls.length).toBeGreaterThanOrEqual(1);
    const systemPrompt = contextOf(0).systemPrompt;
    expect(
      systemPrompt,
      "the binder call must carry the rendered binder system prompt (binder-inference.md)",
    ).toBeTypeOf("string");
    const prompt = systemPrompt as string;
    const lines = prompt.split("\n");

    // Item 1 — exactly one Theta identity line.
    expect(lines.filter((l) => l === "Theta: /code-review")).toHaveLength(1);
    // Item 4 — Parameters block header + byte-exact per-field lines (two U+0020).
    expect(lines).toContain("Parameters:");
    expect(lines).toContain("  topic (string) required");
    expect(lines).toContain("  audience (string) required");
    // Item 5 — User-arguments line carries the raw slash text.
    expect(lines).toContain(`User arguments: ${BINDER_ARGS}`);
    // Item 7 — all three envelope kind tokens are listed.
    expect(prompt).toMatch(/\bok\b/);
    expect(prompt).toMatch(/\bneeds_info\b/);
    expect(prompt).toMatch(/\bambiguous\b/);
    // Item 8 — one line couples `defaulted` with a directive substring.
    expect(
      lines.some(
        (l) =>
          l.includes("defaulted") &&
          (l.includes("Do not") || l.includes("omit") || l.includes("skip")),
      ),
      "one line must carry the no-invent-defaults instruction (item 8)",
    ).toBe(true);
    // The OLD prose prompt's inline JSON-only instruction must be gone.
    expect(prompt).not.toContain("Respond with ONLY a single minified JSON object");
  });

  // ---------------------------------------------------------------------------
  // RED PIN 2 — HEAD: context.systemPrompt is undefined. The needs_info reply
  // (not ok) keeps the defaulted theta's pass off the ok-arm defaults-merge:
  // the call is still issued and captured; runBinder returns bound:false.
  // ---------------------------------------------------------------------------
  it("call shape: defaulted field renders default=<literal> in the Parameters block", async () => {
    scriptToolCallEnvelope({ kind: "needs_info", message: "which repository?" });
    const { deps } = producerWithCapture();

    const result = await driveBinder(deps, defaultedTheta());

    expect(scripted.calls.length).toBeGreaterThanOrEqual(1);
    const systemPrompt = contextOf(0).systemPrompt;
    expect(
      systemPrompt,
      "the binder call must carry the rendered binder system prompt (binder-inference.md)",
    ).toBeTypeOf("string");
    const lines = (systemPrompt as string).split("\n");
    // Default-literal rendering: the Theta literal surface syntax, byte-exact.
    expect(lines).toContain('  tone (string) default="neutral"');
    // The needs_info reply terminates without binding (no fs-touching merge).
    expect(result.bound).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // RED PIN 3 — HEAD: the single user message's content is the rendered prose
  // prompt (varying per invocation, embedding the raw arguments), not the
  // canonical fixed literal.
  // ---------------------------------------------------------------------------
  it("call shape: context.messages is the fixed single user literal", async () => {
    scriptToolCallEnvelope(OK_ENVELOPE);
    const { deps } = producerWithCapture();

    await driveBinder(deps, twoParamTheta());

    const messages = contextOf(0).messages;
    expect(messages, "the binder call must carry context.messages").toBeDefined();
    expect(messages).toHaveLength(1);
    const message = messages![0]!;
    expect(message.role).toBe("user");
    expect(
      message.content,
      "the single user message is the canonical fixed literal (determinism: the message is part of the call's fixed footprint)",
    ).toBe(BINDER_MESSAGE_CONTENT);
    // The variable binding context rides systemPrompt, never the message.
    expect(String(message.content)).not.toContain(BINDER_ARGS);
  });

  // ---------------------------------------------------------------------------
  // RED PIN 4 — HEAD: context.tools is undefined (the envelope schema is inlined
  // as prompt text instead of attached as the forced tool).
  // ---------------------------------------------------------------------------
  it("call shape: exactly one __theta_bind_<slug> tool with object-rooted parameters wrapping the envelope schema", async () => {
    scriptToolCallEnvelope(OK_ENVELOPE);
    const { deps } = producerWithCapture();
    const theta = twoParamTheta();
    const expectedEnvelope = expectedEnvelopeSchemaOf(theta);

    await driveBinder(deps, theta);

    const tools = contextOf(0).tools;
    expect(
      tools,
      "the binder call must attach exactly one structured-output tool (binder-inference.md)",
    ).toBeDefined();
    expect(tools).toHaveLength(1);
    const tool = tools![0]!;

    // The slug is content-addressed over the TRUE anyOf envelope document (NOT
    // the object wrapper), by the same recipe the typed-query respond tool
    // name uses (see the header deviation note on respondSchemaSlug).
    expect(String(tool.name)).toMatch(/^__theta_bind_[0-9a-f]{16}$/);
    expect(tool.name).toBe(binderToolName(respondSchemaSlug(expectedEnvelope)));
    expect(tool.description).toBe(BINDER_TOOL_DESCRIPTION);

    // The bug-0011 spec amendment: parameters is the envelope schema ROOTED IN
    // AN OBJECT WRAPPER (a top-level anyOf is not a valid provider
    // input_schema). BNDR-1/BNDR-2 survive verbatim at properties.envelope.
    // Property-level assertions tolerate a Type.Unsafe wrap (same plain
    // document, enumerable-key-identical).
    const parameters = tool.parameters as {
      readonly type?: unknown;
      readonly properties?: { readonly envelope?: unknown };
      readonly required?: unknown;
      readonly additionalProperties?: unknown;
    };
    expect(parameters.type).toBe("object");
    expect(parameters.required).toEqual(["envelope"]);
    expect(parameters.additionalProperties).toBe(false);
    expect(parameters.properties?.envelope).toEqual(expectedEnvelope);
  });

  // ---------------------------------------------------------------------------
  // RED PIN 5 — HEAD: options.toolChoice is never set on the binder path.
  // ---------------------------------------------------------------------------
  it("call shape: per-api forced toolChoice — anthropic-messages spells {type:'tool',name}", async () => {
    scriptToolCallEnvelope(OK_ENVELOPE);
    const { deps } = producerWithCapture(ANTHROPIC_BINDER_MODEL);

    await driveBinder(deps, twoParamTheta());

    const toolChoice = optionsOf(0)["toolChoice"] as
      | { readonly type?: unknown; readonly name?: unknown; readonly function?: unknown }
      | undefined;
    expect(
      toolChoice,
      "the provider's tool choice must be forced to the binder tool (binder-inference.md)",
    ).toBeDefined();
    expect(toolChoice!.type).toBe("tool");
    // Self-consistency: the forced name IS the attached tool's name.
    expect(toolChoice!.name).toBe(attachedBinderToolName(capturedCall(0).context));
    // The anthropic spelling carries no OpenAI-style `function` wrapper.
    expect(toolChoice!.function).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // RED PIN 6 — HEAD: options.toolChoice is never set on the binder path.
  // ---------------------------------------------------------------------------
  it("call shape: per-api forced toolChoice — openai-completions spells {type:'function',function:{name}}", async () => {
    scriptToolCallEnvelope(OK_ENVELOPE);
    const { deps } = producerWithCapture(OPENAI_BINDER_MODEL);

    await driveBinder(deps, twoParamTheta());

    const toolChoice = optionsOf(0)["toolChoice"] as
      | {
        readonly type?: unknown;
        readonly name?: unknown;
        readonly function?: { readonly name?: unknown };
      }
      | undefined;
    expect(
      toolChoice,
      "the provider's tool choice must be forced to the binder tool (binder-inference.md)",
    ).toBeDefined();
    expect(toolChoice!.type).toBe("function");
    expect(toolChoice!.function?.name).toBe(
      attachedBinderToolName(capturedCall(0).context),
    );
    // The function-style spelling carries no top-level `name`.
    expect(toolChoice!.name).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // RED PIN 7 — HEAD already sends temperature 0 and the abort signal; the RED
  // teeth is options.onResponse, which HEAD never registers (the classifier's
  // HTTP-status input is fabricated instead — see RED PIN 13).
  // ---------------------------------------------------------------------------
  it("call shape: temperature 0, signal present, onResponse registered", async () => {
    scriptToolCallEnvelope(OK_ENVELOPE);
    const { deps } = producerWithCapture();

    await driveBinder(deps, twoParamTheta());

    const options = optionsOf(0);
    expect(options["temperature"], "Determinism: temperature is 0").toBe(0);
    expect(
      options["signal"],
      "the thetaAbort signal is forwarded as options.signal (CANCEL-4)",
    ).toBeInstanceOf(AbortSignal);
    expect(
      options["onResponse"],
      "the provider-response capture callback must be registered on every binder call (binder-inference.md; RED at HEAD)",
    ).toBeTypeOf("function");
  });

  // ---------------------------------------------------------------------------
  // RED PIN 8 — HEAD: no seed key is ever sent (the WHY comment at
  // #completeBinderReply records the omission).
  // ---------------------------------------------------------------------------
  it("determinism: FNV-1a seed under the provider seed field — openai-completions `seed`", async () => {
    scriptToolCallEnvelope(OK_ENVELOPE);
    const { deps } = producerWithCapture(OPENAI_BINDER_MODEL);

    await driveBinder(deps, twoParamTheta());

    // The spec reference vector pins the FNV-1a algorithm itself:
    // `code-review` → 0x7ba86b63 (decimal 2074635107), 32-bit unsigned.
    expect(deriveBinderSeed("code-review")).toBe(0x7ba86b63);
    expect(deriveBinderSeed("code-review")).toBe(2074635107);
    expect(
      optionsOf(0)["seed"],
      "openai-completions places the fixed seed under `seed` (provider seed-field mapping)",
    ).toBe(deriveBinderSeed("code-review"));
  });

  // ---------------------------------------------------------------------------
  // RED PIN 9 — HEAD: the mistral arm reds (no random_seed key is ever sent).
  // The anthropic omission arm alone would be green at HEAD (HEAD sends no seed
  // to anyone), so both arms share this test to keep it red.
  // ---------------------------------------------------------------------------
  it("determinism: mistral maps random_seed; anthropic-messages omits the seed key", async () => {
    // Drive 1 — mistral: the seed rides the `random_seed` field.
    scriptToolCallEnvelope(OK_ENVELOPE);
    const mistral = producerWithCapture(MISTRAL_BINDER_MODEL);
    await driveBinder(mistral.deps, twoParamTheta());
    const mistralOptions = optionsOf(0);
    expect(
      mistralOptions["random_seed"],
      "mistral places the fixed seed under `random_seed` (provider seed-field mapping)",
    ).toBe(deriveBinderSeed("code-review"));
    expect("seed" in mistralOptions, "mistral takes no `seed` key").toBe(false);

    // Drive 2 — anthropic-messages: its row omits the seed field entirely.
    scripted.calls = [];
    scriptToolCallEnvelope(OK_ENVELOPE);
    const anthropic = producerWithCapture(ANTHROPIC_BINDER_MODEL);
    await driveBinder(anthropic.deps, twoParamTheta());
    const anthropicOptions = optionsOf(0);
    expect("seed" in anthropicOptions, "anthropic-messages receives no `seed` key").toBe(false);
    expect(
      "random_seed" in anthropicOptions,
      "anthropic-messages receives no `random_seed` key",
    ).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // RED PIN 10 — HEAD: bound=false. HEAD text-parses the reply and a
  // ToolCall-only reply carries no text, so the ok envelope is never seen.
  // ---------------------------------------------------------------------------
  it("extraction: the envelope rides the first matching ToolCall's arguments — an ok envelope binds and echoes", async () => {
    scriptToolCallEnvelope(OK_ENVELOPE);
    const { deps, notes } = producerWithCapture();

    const result = await driveBinder(deps, twoParamTheta());

    expect(
      result.bound,
      "an ok envelope extracted from the matching ToolCall's arguments binds (binder-inference.md extraction rule; RED at HEAD)",
    ).toBe(true);
    expect(result.args).toEqual({ topic: "async", audience: "team" });
    // One clean call — no retry was consumed.
    expect(scripted.calls).toHaveLength(1);
    // The BND-1 success echo is the only theta-system-note.
    const channelNotes = noteChannelEntries(notes);
    expect(channelNotes).toHaveLength(1);
    expect(channelNotes[0]!.content).toBe("Running /code-review: topic=async, audience=team");
    expect(channelNotes[0]!.display).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // RED PIN 11 — THE CENTRAL PIN. HEAD: a free-text envelope reply BINDS
  // (result.bound === true) because the free-text parse IS HEAD's mechanism.
  // Under the pinned mechanism a plain-text reply carries no matching ToolCall
  // and is the malformed-envelope class: one retry, then the malformed note.
  // ---------------------------------------------------------------------------
  it("extraction: a plain-text envelope reply is the malformed-envelope class", async () => {
    scripted.reply = freeTextReply(JSON.stringify(OK_ENVELOPE));
    const { deps, notes } = producerWithCapture();

    const result = await driveBinder(deps, twoParamTheta());

    expect(
      result.bound,
      "a plain-text reply (no ToolCall) must NOT bind — it is the malformed-envelope class (RED at HEAD: HEAD binds it)",
    ).toBe(false);
    // Malformed-envelope class: exactly one retry (2 calls total).
    expect(scripted.calls).toHaveLength(2);
    const channelNotes = noteChannelEntries(notes);
    expect(channelNotes).toHaveLength(1);
    expect(channelNotes[0]!.content).toBe(MALFORMED_NOTE);
    expect(channelNotes[0]!.display).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // RED PIN 12 — HEAD: a ToolCall-only reply text-parses to nothing, so HEAD
  // emits the MALFORMED note after 2 calls instead of the needs_info note
  // after exactly 1 (needs_info is terminal — no retry budget applies).
  // ---------------------------------------------------------------------------
  it("routing: a ToolCall needs_info envelope routes to the needs_info failure note", async () => {
    scriptToolCallEnvelope({ kind: "needs_info", message: "which repository?" });
    const { deps, notes } = producerWithCapture();

    const result = await driveBinder(deps, twoParamTheta());

    const channelNotes = noteChannelEntries(notes);
    expect(channelNotes).toHaveLength(1);
    expect(
      channelNotes[0]!.content,
      "the needs_info envelope surfaces its failure-mode row (RED at HEAD: malformed row instead)",
    ).toBe(NEEDS_INFO_NOTE);
    expect(result.bound).toBe(false);
    // needs_info is terminal: exactly ONE call, no retry consumed.
    expect(scripted.calls).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // RED PIN 13 — HEAD: onResponse is never registered, so the classifier input
  // fabricates httpStatus 200; the anthropic overflow signature (gated on HTTP
  // 400) cannot match and the transport note carries the RAW errorMessage.
  // With the REAL captured 400 the signature matches → ContextOverflow → folds
  // to transport-class with the FIXED fallback message.
  // ---------------------------------------------------------------------------
  it("classifier: onResponse-captured HTTP status reaches the classifier — anthropic 400 overflow signature folds to the fixed transport message", async () => {
    scripted.replyFor = (model, _context, options) => {
      // The provider delivered an HTTP 400 before the body resolved: fire the
      // registered capture callback (undefined at HEAD — the optional call
      // no-ops, which is exactly the defect under pin).
      (
        options as {
          readonly onResponse?: (response: unknown, model: unknown) => void;
        }
      ).onResponse?.({ status: 400, headers: {} }, model);
      return {
        role: "assistant",
        content: [],
        stopReason: "error",
        errorMessage: "prompt is too long for this model",
        timestamp: 0,
      };
    };
    const { deps, notes } = producerWithCapture(ANTHROPIC_BINDER_MODEL);

    const result = await driveBinder(deps, twoParamTheta());

    const channelNotes = noteChannelEntries(notes);
    expect(channelNotes).toHaveLength(1);
    expect(
      channelNotes[0]!.content,
      "a REAL 400 + anthropic overflow signature classifies ContextOverflow and folds to the fixed transport fallback (RED at HEAD: fabricated 200 keeps the raw errorMessage)",
    ).toBe(TRANSPORT_FALLBACK_NOTE);
    // Transport-class (overflow folds into it): exactly one retry.
    expect(scripted.calls).toHaveLength(2);
    expect(result.bound).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // CONTROL 14 — green at HEAD because HEAD cannot read ToolCall parts at all
  // (a ToolCall-only reply text-parses to nothing → malformed, same
  // observable). Post-fix it guards the envelope AJV at the routing step: the
  // maxLength 500 message budget rejects a runaway needs_info as malformed.
  // ---------------------------------------------------------------------------
  it("AJV at routing: an oversized needs_info message (>500 chars) is malformed", async () => {
    scriptToolCallEnvelope({ kind: "needs_info", message: "x".repeat(501) });
    const { deps, notes } = producerWithCapture();

    const result = await driveBinder(deps, twoParamTheta());

    expect(result.bound).toBe(false);
    expect(scripted.calls).toHaveLength(2);
    const channelNotes = noteChannelEntries(notes);
    expect(channelNotes).toHaveLength(1);
    expect(channelNotes[0]!.content).toBe(MALFORMED_NOTE);
  });

  // ---------------------------------------------------------------------------
  // CONTROL 15 — green at HEAD (same reason as control 14). Post-fix it guards
  // the ok-arm args shape: a non-object `args` fails the envelope AJV and is
  // malformed — never silently coerced to a `{}` bind.
  // ---------------------------------------------------------------------------
  it("AJV at routing: an ok envelope whose args is not an object is malformed — never a silent {} bind", async () => {
    scriptToolCallEnvelope({ kind: "ok", args: "not-an-object" });
    const { deps, notes } = producerWithCapture();

    const result = await driveBinder(deps, twoParamTheta());

    expect(result.bound).toBe(false);
    const channelNotes = noteChannelEntries(notes);
    expect(channelNotes).toHaveLength(1);
    expect(channelNotes[0]!.content).toBe(MALFORMED_NOTE);
    expect(scripted.calls).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // CONTROL 16 — green at HEAD (same reason as control 14). Post-fix it guards
  // additionalProperties:false on the envelope arms at the routing step.
  // ---------------------------------------------------------------------------
  it("AJV at routing: an envelope with extra top-level keys is malformed", async () => {
    scriptToolCallEnvelope({
      kind: "ok",
      args: { topic: "a", audience: "b" },
      extra: 1,
    });
    const { deps, notes } = producerWithCapture();

    const result = await driveBinder(deps, twoParamTheta());

    expect(result.bound).toBe(false);
    const channelNotes = noteChannelEntries(notes);
    expect(channelNotes).toHaveLength(1);
    expect(channelNotes[0]!.content).toBe(MALFORMED_NOTE);
    expect(scripted.calls).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // CONTROL 17 — green at HEAD (same reason as control 14). Post-fix it guards
  // the extraction rule's name match: a ToolCall whose name is NOT the binder
  // tool is "no matching ToolCall" — the malformed-envelope condition.
  // ---------------------------------------------------------------------------
  it("extraction: a ToolCall with a different name is malformed", async () => {
    scripted.replyFor = () =>
      toolCallReply("__theta_bind_ffffffffffffffff", { envelope: OK_ENVELOPE });
    const { deps, notes } = producerWithCapture();

    const result = await driveBinder(deps, twoParamTheta());

    expect(result.bound).toBe(false);
    const channelNotes = noteChannelEntries(notes);
    expect(channelNotes).toHaveLength(1);
    expect(channelNotes[0]!.content).toBe(MALFORMED_NOTE);
    expect(scripted.calls).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // POST-LIVE-FAILURE PIN (bug 0011 live round: provider `$ref` handling) — the
  // live gate's three NamedType cases (enum, schema-typed, mixed) failed EVERY
  // bind with the malformed-parse note while all seven $ref-free envelopes
  // bound; the pass/fail partition was exactly the `$ref`/`$defs` axis
  // (Anthropic's tool input_schema handling of refs degrades the forced
  // arguments — the d848f1b2 class scoped to refs). This pin drives the
  // PRODUCTION path with an enum-typed param and asserts both halves of the
  // fix: the ATTACHED tool parameters carry no $ref/$defs anywhere (inlined
  // wire copy), and the envelope AJV routing — which consumes the envelope
  // schema DOCUMENT itself, refs + root $defs intact — still accepts the enum
  // value (bound args flow through to the echo).
  // ---------------------------------------------------------------------------
  it("attachment inlining: an enum-typed param yields $ref/$defs-free tool parameters AND still binds through envelope AJV", async () => {
    scriptToolCallEnvelope({ kind: "ok", args: { sev: "High" } });
    const { deps, notes } = producerWithCapture();

    const result = await driveBinder(deps, enumParamTheta());

    // The captured attachment: no $ref, no $defs anywhere (deep scan).
    expect(scripted.calls).toHaveLength(1);
    const parameters = contextOf(0).tools?.[0]?.parameters;
    expect(parameters, "the binder call must attach the wrapped parameters").toBeDefined();
    expect(deepKeyOccurrences(parameters, "$ref")).toEqual([]);
    expect(deepKeyOccurrences(parameters, "$defs")).toEqual([]);
    // The enum fragment is inlined at the ok arm's args site.
    const wrapper = parameters as {
      readonly properties?: {
        readonly envelope?: { readonly anyOf?: ReadonlyArray<Record<string, unknown>> };
      };
    };
    const okArm = wrapper.properties?.envelope?.anyOf?.[0] as
      | { readonly properties?: { readonly args?: Record<string, unknown> } }
      | undefined;
    const argsProperties = okArm?.properties?.args?.["properties"] as
      | Record<string, unknown>
      | undefined;
    expect(argsProperties?.["sev"]).toEqual({ type: "string", enum: ["Low", "High"] });
    // The AJV routing step validates the envelope DOCUMENT (refs + root $defs
    // intact): the enum value binds and the BND-1 echo fires.
    expect(result.bound).toBe(true);
    expect(result.args).toEqual({ sev: "High" });
    const channelNotes = noteChannelEntries(notes);
    expect(channelNotes).toHaveLength(1);
    expect(channelNotes[0]!.content).toBe("Running /code-review: sev=High");
    expect(channelNotes[0]!.display).toBe(true);
  });
});
