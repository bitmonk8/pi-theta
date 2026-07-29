import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import {
  brandSchemaValue,
  isEnumValue,
  isResultValue,
  makeEnumValue,
  makeErr,
  makeOk,
  schemaTagOf,
  valuesEqual,
  type ThetaValue,
} from "../src/runtime/value";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";

// Bug 0026 — a schema ctor whose DECLARED field is literally named
// `__thetaSchema` has that field destroyed by the brand install: the
// constructor-assigned enumerable property is redefined into the
// non-enumerable brand, replacing both its value and its descriptor
// (docs/bugs/0026-ctor-field-named-thetaschema-destroyed-by-brand.md).
//
// Spec: docs/spec_topics/expressions.md §Object construction (:209) — "Every
// declared field of the schema must be present (omissions are
// `theta/parse/missing-object-field`)"; the parse gate enforces presence in
// SOURCE, and the constructed runtime value is what that presence is for.
// docs/spec_topics/runtime-value-model.md, value-representation table,
// object-schema row (:12) — an object-schema value is a "JS plain object keyed
// by **theta-side names**"; and the non-normative reference-encoding paragraph
// (:16) — the concrete brand shapes are "implementation details — neither is
// reachable from theta code". `brandSchemaValue`'s own contract
// (src/runtime/value.ts:179–185) — the tag is installed non-enumerable "so the
// branded value is indistinguishable from a plain object on every
// theta-visible surface". docs/spec_topics/query/query-escapes-stringification.md
// (QRY-18) — a schema-typed interpolation renders as compact `JSON.stringify`
// with outbound wire-name translation, over the value's theta-side keys.
//
// The defect (HEAD dd4f3d3b; `src/` byte-identical to the observation commit
// b542dafe): the three interpreter-private brands live in the SAME string-key
// namespace as user field names — `ENUM_TAG = "__thetaEnum"`
// (src/runtime/value.ts:48), `RESULT_TAG = "__thetaResult"` (:73),
// `SCHEMA_TAG = "__thetaSchema"` (:177). Both ctor hosts are assign-then-brand:
// a field loop writes every declared field as an ordinary enumerable data
// property (statement-executor.ts:664 effectful host;
// production-theta-producer.ts:5645 pure host) and `brandSchemaValue`
// (value.ts:186) then installs the brand with an UNCONDITIONAL
// `Object.defineProperty` (:190–195). The constructor-assigned property is
// still configurable, so the redefinition succeeds and overwrites both halves
// of it — the value (`"user-data"` → the schema name) and the descriptor
// (enumerable → non-enumerable, non-writable, non-configurable). Consequences
// pinned here: the declared field vanishes from `JSON.stringify`,
// `Object.keys`, the `valuesEqual` enumerable-key walk, and the QRY-18
// outbound render (production-theta-producer.ts:5560, `Object.entries`), and a
// ctor-provenance value never equals its wire-provenance twin. Every declared
// field is mandatory in a ctor, so a schema declaring the field forces EVERY
// in-language construction through the destruction; no diagnostic fires at
// parse or at runtime.
//
// FIXED CONTRACT pinned by this file (RED now, GREEN after the fix): the three
// interpreter-private brands leave the string-key namespace — `ENUM_TAG`,
// `SCHEMA_TAG` and `RESULT_TAG` all become module `Symbol`s in one migration
// (§Fix, settled). A declared field named `__thetaSchema` then coexists with
// the brand as ordinary enumerable data: value and descriptor survive
// construction, the field reaches JSON / `Object.keys` / the QRY-18 render,
// `schemaTagOf` still recovers the declaring schema, and ctor- and
// wire-provenance twins of the same schema compare equal. The collision class
// disappears wholesale rather than per-name, so group (e) pins the same
// namespace-vacancy property for all three tags: a PARTIAL migration (e.g.
// `SCHEMA_TAG` alone) leaves a sibling brand occupying a string key and reds
// (e4). Neither ctor host changes — the hosts call `brandSchemaValue` exactly
// as today and the collision disappears underneath them.
//
// CONTROLS (green now, green after): the sibling ctor fields `__thetaEnum` /
// `__thetaResult` survive as ordinary enumerable data and forge no
// classification (the bug-0020 posture: classification is the non-enumerable
// descriptor, never the key name), and every genuine constructor-built value
// keeps its classification and JSON-output semantics — `makeEnumValue` →
// `isEnumValue` with the bare wire string, `makeOk` / `makeErr` →
// `isResultValue` with the brand out of JSON, `brandSchemaValue` →
// `schemaTagOf` with the brand out of `Object.keys` and JSON.
//
// PROBED CURRENT SIGNATURES (dd4f3d3b, all offline, deterministic, no
// provider):
//   - brandSchemaValue over a constructor-assigned enumerable field:
//       before {"value":"user-data","writable":true,"enumerable":true,"configurable":true}
//       after  {"value":"F","writable":false,"enumerable":false,"configurable":false}
//   - `schema F { __thetaSchema: string, x: integer }` /
//     `F { __thetaSchema: "user-data", x: 1 }` — parse diagnostics [] (none of
//     any severity); executor outcome "success";
//       JSON.stringify(value) → {"x":1}
//       schemaTagOf(value)    → "F"
//   - valuesEqual(ctorValue, JSON.parse('{"__thetaSchema":"user-data","x":1}'))
//       → false, and false in the reversed argument order
//   - QRY-18 render at the pi.sendUserMessage seam, BOTH ctor hosts
//     (executor host via a `let`; pure host via the ctor written inline in the
//     interpolation): "payload: {\"x\":1}"
//   - sibling ctor fields (already inert post-0020):
//       G { __thetaEnum: "Severity", x: 1 } → {"__thetaEnum":"Severity","x":1};
//         isEnumValue false; schemaTagOf "G"
//       H { __thetaResult: true, x: 1 }     → {"__thetaResult":true,"x":1};
//         isResultValue false; schemaTagOf "H"
//   - string-key namespace occupancy of the three brands:
//       Object.getOwnPropertyNames(makeEnumValue("Severity","low"))
//         → ["0","1","2","length","__thetaEnum"]
//       Object.getOwnPropertyNames(makeOk(1))   → ["ok","value","__thetaResult"]
//       Object.getOwnPropertyNames(makeErr("e")) → ["ok","error","__thetaResult"]
//       Object.getOwnPropertyNames(brandSchemaValue({name:"x"},"Person"))
//         → ["name","__thetaSchema"]
//
// HARNESS NOTES:
//   - Offline throughout. No provider, no network, no live model: the QRY-18
//     witness drives an UNTYPED prompt-mode query, which never dispatches
//     `complete()`, against the `LiveSessionDouble` pattern of
//     tests/enum-schema-tag-privacy.test.ts group (d) — the injected Clock's
//     `setTimeout` ticks the session double, completing the streamed turn with
//     a scripted reply.
//   - Both ctor hosts are reached from the same query harness:
//     `stringifyInterpolation` (production-theta-producer.ts:5490) evaluates
//     the interpolation through the PURE host, so a ctor written inline in the
//     interpolation is built by production-theta-producer.ts:5643–5649, while a
//     ctor bound by a preceding `let` is built by the EFFECTFUL host
//     (statement-executor.ts:657–673) and reaches the render as an ident
//     resolution. These are the only two `brandSchemaValue` call sites in
//     `src/`.
//   - `parseTheta` fails LOUDLY on any error-severity diagnostic: the bug doc
//     pins that the declaration and the ctor are both admitted with zero
//     diagnostics, so a parse rejection here is a harness defect, never the
//     bug. Group (b) additionally asserts the zero-diagnostic admission
//     explicitly, so the admitting side is a visible pin rather than a
//     precondition of the harness.
//   - Group (e)'s namespace-vacancy assertions (e4) read
//     `Object.getOwnPropertyNames`, the direct observable of the fixed
//     contract's root-cause statement ("move the brands out of the string-key
//     namespace"). They deliberately do not assert a positive encoding, so any
//     fix that vacates the string-key namespace satisfies them.
//   - No shared mutable state: every double is constructed per test through
//     explicit injection, mirroring the sibling bug-lock files.

// ===========================================================================
// Shared parse harness (the bug-0017 / bug-0020 pattern).
// ===========================================================================

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

/**
 * Parse a fixture source and fail LOUDLY on any error-severity diagnostic — a
 * fixture that stops parsing must never let a bug test pass or fail for the
 * wrong reason (no silent skip).
 */
function parseTheta(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture ${path} failed to parse: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

const FM = "---\nmode: prompt\n---\n";

/** The bug doc's verbatim residual fixture — the schema that declares the brand name. */
const COLLIDING_SCHEMA = "schema F { __thetaSchema: string, x: integer }\n";

/** The bug doc's verbatim ctor for that schema. */
const COLLIDING_CTOR = 'F { __thetaSchema: "user-data", x: 1 }';

/** The wire form the ctor must produce — declared field preserved, brand invisible. */
const CTOR_WIRE_JSON = '{"__thetaSchema":"user-data","x":1}';

/** The descriptor a constructor-assigned theta-side field carries. */
const ORDINARY_ENUMERABLE_DATA = {
  value: "user-data",
  writable: true,
  enumerable: true,
  configurable: true,
};

/** The production AJV validator over a content-address slug (the 0014 helper). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/**
 * Narrow a runtime value to the plain-object arm, failing LOUDLY otherwise —
 * a non-object here means the fixture bound something other than the ctor
 * value, which would make every downstream assertion meaningless.
 */
function asObjectValue(value: ThetaValue | undefined, what: string): object {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`harness: ${what} must be a plain object value; got ${JSON.stringify(value)}`);
  }
  return value as unknown as object;
}

// ===========================================================================
// Production-executor harness for NON-query bodies — the bug-0017 prompt-mode
// binding: parseThetaDocument → createProductionProducerDeps →
// bindPromptConversation → executeBody.
// ===========================================================================

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function producer() {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

/** Parse + run a self-contained query-free prompt-mode source. */
function runSource(src: string): Promise<BodyExecution> {
  const doc = parseTheta("bug0026.theta", src);
  const theta: ThetaCompositionInput = {
    slashName: "bug0026",
    sourcePath: "/theta/bug0026.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  return executeBody(theta.body, binding.executeDeps);
}

/**
 * Run a fixture whose tail is a schema ctor and hand back the constructed
 * object value. Fails LOUDLY on a non-success outcome so a body that never
 * produced the value cannot masquerade as a passing assertion.
 */
async function runCtorValue(src: string): Promise<object> {
  const execution = await runSource(src);
  if (execution.outcome !== "success") {
    throw new Error(
      `harness: the ctor fixture must run to a success outcome; got ${String(execution.outcome)}`,
    );
  }
  return asObjectValue(execution.result.value, "the fixture's tail ctor value");
}

// ===========================================================================
// Offline query harness for the QRY-18 render witness — the
// tests/enum-schema-tag-privacy.test.ts group (d) LiveSessionDouble pattern.
// The untyped prompt-mode query issues ONE streamed user turn
// (`pi.sendUserMessage`) whose content IS the QRY-18 rendered template; the
// injected Clock's `setTimeout` ticks the session double, completing the turn
// with the scripted assistant reply. No provider is contacted.
// ===========================================================================

/** The user session's selected model (`ctx.model`) — provider derivation only. */
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

class LiveSessionDouble {
  readonly entries: SessionEntryDouble[] = [];
  sendUserMessageCalls = 0;
  /** The rendered query texts — the QRY-18 render observable under test. */
  readonly sentQueryTexts: string[] = [];

  #idle = true;
  #completedTurns = 0;
  readonly #replies: readonly { readonly stopReason: string; readonly text: string }[];

  constructor(replies: readonly { readonly stopReason: string; readonly text: string }[]) {
    this.#replies = [...replies];
  }

  sendUserMessage(content: string): void {
    this.sendUserMessageCalls += 1;
    this.sentQueryTexts.push(content);
    this.#append({
      role: "user",
      content: [{ type: "text", text: content }],
      timestamp: 0,
    });
    this.#idle = false;
  }

  isIdle(): boolean {
    return this.#idle;
  }

  /** Complete the in-flight streamed turn (inert while idle; loud when unscripted). */
  tick(): void {
    if (this.#idle) {
      return;
    }
    if (this.#replies.length === 0) {
      throw new Error("live session double: a driven turn completed with an EMPTY reply queue");
    }
    const reply = this.#replies[Math.min(this.#completedTurns, this.#replies.length - 1)]!;
    this.#completedTurns += 1;
    this.#append({
      role: "assistant",
      content: [{ type: "text", text: reply.text }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "m1",
      stopReason: reply.stopReason,
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

function livePi(session: LiveSessionDouble): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    sendMessage: (): void => {},
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (): void => {},
  } as unknown as ExtensionAPI;
}

function rootLive(session: LiveSessionDouble): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
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

function registryDouble(): ModelRegistry {
  return {
    getAvailable: () => [ANTHROPIC_MODEL],
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
  } as unknown as ModelRegistry;
}

function ctxLive(session: LiveSessionDouble): ExtensionCommandContext {
  return {
    model: ANTHROPIC_MODEL,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

/**
 * Drive one untyped-query prompt-mode theta through the production binding
 * against the session double and return the single rendered query text. Fails
 * LOUDLY if the binding is not the prompt drive or the turn count is not one —
 * either would mean the captured text is not the QRY-18 render under test.
 */
async function renderedQueryText(src: string): Promise<string> {
  const doc = parseTheta("bug0026-query.theta", src);
  const session = new LiveSessionDouble([{ stopReason: "stop", text: "ok" }]);
  const deps = createProductionProducerDeps({
    pi: livePi(session),
    root: rootLive(session),
    modelRegistry: registryDouble(),
  });
  const theta: ThetaCompositionInput = {
    slashName: "bug0026q",
    sourcePath: "/theta/bug0026q.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxLive(session) });
  if (binding.drivenAgainst !== "prompt-user-session") {
    throw new Error(
      `harness: expected the prompt-mode drive, got ${String(binding.drivenAgainst)}`,
    );
  }
  const execution = await executeBody(doc.body, binding.executeDeps);
  if (execution.outcome !== "success") {
    throw new Error(
      `harness: the query fixture must run to a success outcome; got ${String(execution.outcome)}`,
    );
  }
  if (session.sendUserMessageCalls !== 1) {
    throw new Error(
      `harness: the untyped query must drive exactly one streamed user turn; got ${session.sendUserMessageCalls}`,
    );
  }
  return session.sentQueryTexts[0]!;
}

// ===========================================================================
// (a) UNIT — `brandSchemaValue` over an object already carrying an own
// enumerable `__thetaSchema` data property. The brand and the declared field
// occupy disjoint namespaces, so branding is additive: the field's value and
// descriptor are untouched and the brand is still recoverable.
// ===========================================================================

describe("bug 0026 (a) — brandSchemaValue is additive over a same-named declared field", () => {
  it("RED (a1): the declared field's VALUE and ENUMERABILITY survive the brand install", () => {
    const assigned: { [key: string]: ThetaValue } = { __thetaSchema: "user-data", x: 1 };

    // Precondition, asserted rather than assumed: the ctor hosts' field loop
    // writes an ordinary enumerable data property, which is what makes the
    // unconditional `Object.defineProperty` redefinition legal.
    expect(
      Object.getOwnPropertyDescriptor(assigned, "__thetaSchema"),
      "harness precondition: a constructor-assigned field is ordinary enumerable data before branding",
    ).toEqual(ORDINARY_ENUMERABLE_DATA);

    const branded = brandSchemaValue(assigned, "F");

    expect(
      Object.getOwnPropertyDescriptor(branded, "__thetaSchema"),
      "PRIMARY (bug 0026): the brand must not redefine a same-named DECLARED field — brandSchemaValue's contract is that branding is invisible on every theta-visible surface, so the field keeps its assigned value 'user-data' and its enumerable/writable/configurable descriptor",
    ).toEqual(ORDINARY_ENUMERABLE_DATA);
    expect(
      (branded as { readonly [key: string]: ThetaValue })["__thetaSchema"],
      "PRIMARY (bug 0026): reading the declared field yields the assigned value, not the schema name",
    ).toBe("user-data");
  });

  it("RED (a2): the brand still recovers the declaring schema alongside the surviving field", () => {
    const branded = brandSchemaValue({ __thetaSchema: "user-data", x: 1 }, "F");

    expect(
      schemaTagOf(branded),
      "the brand and the declared field coexist — schemaTagOf recovers the declaring schema for the QRY-18 outbound wire-name translation",
    ).toBe("F");
    expect(
      JSON.stringify(branded),
      "PRIMARY (bug 0026): the declared theta-side field reaches JSON output (runtime-value-model.md object-schema row: a JS plain object keyed by theta-side names); the brand stays out of it",
    ).toBe(CTOR_WIRE_JSON);
    expect(
      Object.keys(branded),
      "the enumerable key walk sees the declared field and not the brand",
    ).toEqual(["__thetaSchema", "x"]);
  });
});

// ===========================================================================
// (b) END-TO-END through the production executor — the bug doc's verbatim
// residual fixture, parse-clean and constructed through the effectful ctor
// host (statement-executor.ts:657–673).
// ===========================================================================

describe("bug 0026 (b) — the ctor delivers every declared field (production executor)", () => {
  it("CONTROL (b0): the declaration and the ctor are admitted with ZERO error-severity diagnostics (green now, green after)", () => {
    const doc = parseTheta("bug0026-admit.theta", FM + COLLIDING_SCHEMA + COLLIDING_CTOR);
    expect(
      doc.diagnostics.filter((d) => d.severity === "error"),
      "the admitting side is silent: no parse guard rejects a declared field named `__thetaSchema`, so the value the executor builds is the only place the contract can be enforced",
    ).toEqual([]);
  });

  it("RED (b1): `F { __thetaSchema: \"user-data\", x: 1 }` stringifies with the declared field intact", async () => {
    const value = await runCtorValue(FM + COLLIDING_SCHEMA + COLLIDING_CTOR);

    expect(
      JSON.stringify(value),
      `PRIMARY (bug 0026): every declared field is mandatory in a ctor (expressions.md §Object construction) and the constructed value is what that presence is for — the brand install must not delete '__thetaSchema' from the value. Observed: ${JSON.stringify(value)}`,
    ).toBe(CTOR_WIRE_JSON);
    expect(
      Object.keys(value),
      "the theta-side key set is both declared fields, in declaration order",
    ).toEqual(["__thetaSchema", "x"]);
  });

  it("RED (b2): the constructed field is ordinary enumerable data and the brand coexists", async () => {
    const value = await runCtorValue(FM + COLLIDING_SCHEMA + COLLIDING_CTOR);

    expect(
      Object.getOwnPropertyDescriptor(value, "__thetaSchema"),
      "PRIMARY (bug 0026): the ctor host assigns the declared field as enumerable data and the brand install must leave that descriptor alone — a frozen non-enumerable descriptor carrying the schema name means the field was overwritten by the brand",
    ).toEqual(ORDINARY_ENUMERABLE_DATA);
    expect(
      schemaTagOf(value as ThetaValue),
      "the declaring-schema brand is still recoverable — the fix removes the collision, not the brand",
    ).toBe("F");
  });
});

// ===========================================================================
// (c) PROVENANCE-TWIN EQUALITY — a ctor-built value and the wire-provenance
// value of the same schema are structurally identical, so `==` is true in both
// argument orders. `rebuildInbound` (wire-translation.ts:129) rebuilds plain
// enumerable objects, and the QRY-22 lowering marks the field required and the
// schema closed, so the twin is exactly what a validated response binds.
// ===========================================================================

describe("bug 0026 (c) — ctor-provenance and wire-provenance values of one schema compare equal", () => {
  it("RED (c1): valuesEqual(ctorValue, wireTwin) is true in BOTH argument orders", async () => {
    const ctorValue = (await runCtorValue(FM + COLLIDING_SCHEMA + COLLIDING_CTOR)) as ThetaValue;
    const wireTwin = JSON.parse(CTOR_WIRE_JSON) as ThetaValue;

    expect(
      valuesEqual(ctorValue, wireTwin),
      `PRIMARY (bug 0026): the two values carry the same theta-side key set and the same per-key values, so the object rule answers true; a destroyed declared field leaves the ctor value with one enumerable key against the twin's two and the key-count guard answers false. Observed ctor value: ${JSON.stringify(ctorValue)}`,
    ).toBe(true);
    expect(
      valuesEqual(wireTwin, ctorValue),
      "…in the reversed argument order too — structural equality is symmetric",
    ).toBe(true);
  });
});

// ===========================================================================
// (d) QRY-18 RENDER WITNESS — the declared field reaches the model. The
// outbound render walks enumerable keys (production-theta-producer.ts:5560),
// so a destroyed field is absent from the interpolated JSON and the assigned
// value never leaves the interpreter. Driven offline through both ctor hosts.
// ===========================================================================

describe("bug 0026 (d) — QRY-18 outbound render carries the declared field (both ctor hosts)", () => {
  it("RED (d1): EFFECTFUL host — a `let`-bound ctor value interpolates with the declared field", async () => {
    const sent = await renderedQueryText(
      FM +
        COLLIDING_SCHEMA +
        `let a = ${COLLIDING_CTOR}\n` +
        "let v = @`payload: ${a}`?\n" +
        "v",
    );

    expect(
      sent,
      `PRIMARY (bug 0026): the value the model is shown must carry every declared field — QRY-22 lowers '__thetaSchema' required and the schema closed, so a render that drops it asks the model to invent the value the theta believes it sent. Observed rendered text: ${JSON.stringify(sent)}`,
    ).toContain(`payload: ${CTOR_WIRE_JSON}`);
    expect(
      sent,
      "the assigned field value reaches the prompt",
    ).toContain("user-data");
  });

  it("RED (d2): PURE host — a ctor written inline in the interpolation renders the same", async () => {
    // `stringifyInterpolation` evaluates the interpolation through the pure
    // host (production-theta-producer.ts:5643–5649), the second and last
    // `brandSchemaValue` call site — the fix must hold at both without either
    // host changing.
    const sent = await renderedQueryText(
      FM + COLLIDING_SCHEMA + `let v = @\`payload: \${${COLLIDING_CTOR}}\`?\n` + "v",
    );

    expect(
      sent,
      `PRIMARY (bug 0026): the pure ctor host brands the same way and must deliver the same declared field to the render. Observed rendered text: ${JSON.stringify(sent)}`,
    ).toContain(`payload: ${CTOR_WIRE_JSON}`);
    expect(
      sent,
      "the assigned field value reaches the prompt",
    ).toContain("user-data");
  });
});

// ===========================================================================
// (e) SIBLING-TAG CONTROLS — the fix migrates all three brands together, so
// the lock covers all three. e1–e3 are green now and green after (the bug-0020
// posture must survive the re-encoding); e4 pins the namespace vacancy that
// makes the collision class disappear wholesale, and reds on a PARTIAL
// migration that moves one tag and leaves a sibling in the string-key
// namespace.
// ===========================================================================

describe("bug 0026 (e) — sibling-tag controls across all three brands", () => {
  it("CONTROL (e1): a declared ctor field named `__thetaEnum` is ordinary data and forges no enum (green now, green after)", async () => {
    const value = await runCtorValue(
      FM +
        "schema G { __thetaEnum: string, x: integer }\n" +
        'G { __thetaEnum: "Severity", x: 1 }',
    );

    expect(
      JSON.stringify(value),
      "the sibling-named field survives construction as ordinary enumerable data",
    ).toBe('{"__thetaEnum":"Severity","x":1}');
    expect(
      isEnumValue(value as ThetaValue),
      "an enumerable same-named key is user data, not a brand — it must not classify as an enum value (bug 0020 posture)",
    ).toBe(false);
    expect(
      schemaTagOf(value as ThetaValue),
      "the declaring-schema brand is unaffected by the sibling-named field",
    ).toBe("G");
  });

  it("CONTROL (e2): a declared ctor field named `__thetaResult` is ordinary data and forges no Result (green now, green after)", async () => {
    const value = await runCtorValue(
      FM +
        "schema H { __thetaResult: boolean, x: integer }\n" +
        "H { __thetaResult: true, x: 1 }",
    );

    expect(
      JSON.stringify(value),
      "the sibling-named field survives construction as ordinary enumerable data",
    ).toBe('{"__thetaResult":true,"x":1}');
    expect(
      isResultValue(value as ThetaValue),
      "an enumerable same-named key must not classify as a `Result` (type-system.md `Result` row: observed only via constructors; bug 0017)",
    ).toBe(false);
    expect(
      schemaTagOf(value as ThetaValue),
      "the declaring-schema brand is unaffected by the sibling-named field",
    ).toBe("H");
  });

  it("CONTROL (e3): genuine constructor-built values keep classification and JSON output (green now, green after)", () => {
    const enumValue = makeEnumValue("Severity", "low");
    expect(isEnumValue(enumValue), "makeEnumValue builds a genuine enum value").toBe(true);
    expect(
      JSON.stringify(enumValue),
      "the enum brand never appears in JSON output — an enum value serialises to the bare wire string (runtime-value-model.md, enum row)",
    ).toBe('"low"');

    const okValue = makeOk(1);
    const errValue = makeErr("boom");
    expect(isResultValue(okValue), "makeOk builds a genuine `Result`").toBe(true);
    expect(isResultValue(errValue), "makeErr builds a genuine `Result`").toBe(true);
    expect(
      JSON.stringify(okValue),
      "the `Result` brand never serialises — only the Ok/Err discriminator and payload do",
    ).toBe('{"ok":true,"value":1}');
    expect(
      JSON.stringify(errValue),
      "…and the same on the Err arm",
    ).toBe('{"ok":false,"error":"boom"}');

    const branded = brandSchemaValue({ name: "x" }, "Person");
    expect(schemaTagOf(branded), "brandSchemaValue installs a recoverable brand").toBe("Person");
    expect(
      Object.keys(branded),
      "the brand never appears in the theta-visible key walk (`obj.keys()`)",
    ).toEqual(["name"]);
    expect(
      JSON.stringify(branded),
      "the brand never appears in JSON output",
    ).toBe('{"name":"x"}');
  });

  it("RED-PARTIAL-GUARD (e4): none of the three brands occupies the string-key namespace", () => {
    // The fixed contract's root-cause statement: the brands leave the
    // namespace user field names live in, which is what makes the collision
    // class disappear for every name rather than for `__thetaSchema` alone. A
    // migration that moves one tag and leaves a sibling behind reds here.
    expect(
      Object.getOwnPropertyNames(makeEnumValue("Severity", "low")),
      "PRIMARY (bug 0026): the enum brand must not be an own STRING key of the carrier — a string-keyed brand shares the namespace with declared field names, which is the collision cause",
    ).not.toContain("__thetaEnum");
    expect(
      Object.getOwnPropertyNames(makeOk(1)),
      "PRIMARY (bug 0026): the `Result` brand must not be an own STRING key",
    ).not.toContain("__thetaResult");
    expect(
      Object.getOwnPropertyNames(makeErr("boom")),
      "…on the Err arm too",
    ).not.toContain("__thetaResult");
    expect(
      Object.getOwnPropertyNames(brandSchemaValue({ name: "x" }, "Person")),
      "PRIMARY (bug 0026): the schema brand must not be an own STRING key — a declared field named `__thetaSchema` and the brand must be able to coexist on one object",
    ).not.toContain("__thetaSchema");
  });
});
