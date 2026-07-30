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
  makeEnumValue,
  schemaTagOf,
  valuesEqual,
  type ThetaValue,
} from "../src/runtime/value";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import { translateInbound } from "../src/runtime/wire-translation";
import type { SchemaSidecar } from "../src/parser/schema-lowering";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
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

// Bug 0020 — the enum and schema brands (`__thetaEnum` / `__thetaSchema`)
// classify by presence-only `hasOwnProperty`: an enumerable same-named key
// forges them, corrupting `==` and the QRY-18 interpolation render
// (docs/bugs/0020-enum-schema-tags-presence-only-forgeable.md).
//
// Spec: docs/spec_topics/runtime-value-model.md (value-representation table,
// enum row) — an enum value carries the wire string plus "an
// interpreter-PRIVATE tag identifying the declaring enum"; the
// reference-encoding paragraph pins the tag as "a non-enumerable symbol
// property on the JS string wrapper (described for debugging as
// `__thetaEnum`)" and says of the concrete shapes that "neither is reachable
// from theta code" — and already states the required posture for the sibling
// `Result` brand (post-0017): recognised "by that brand, never by the
// `{ ok, … }` shape". docs/spec_topics/query/query-escapes-stringification.md
// (QRY-18) — an interpolation renders by the Theta static type, "NOT by
// JavaScript's default `String(...)`, whose `[object Object]` … defaults would
// silently corrupt prompts"; a schema-typed object renders as COMPACT
// `JSON.stringify` with outbound wire-name translation.
// docs/spec_topics/query/query-failure-and-repair.md (QRY-22) — the typed-query
// gate the wire forgery must pass to reach the classifiers (group (f) pins the
// admitting permissive-`{}` positions).
//
// The defect (HEAD 655e4d39): the constructors install the tags non-enumerable
// (`makeEnumValue`, src/runtime/value.ts:119; `brandSchemaValue`, :158) — the
// representation half of "interpreter-private" is correct — but the
// classifiers test bare presence: `enumTagOf` (value.ts:131, module-private)
// tests `hasOwnProperty` at :132, `schemaTagOf` (value.ts:172) at :177. Any
// ENUMERABLE own key named `__thetaEnum` / `__thetaSchema` — all `JSON.parse`
// and theta-side object construction can produce — therefore classifies as a
// genuine brand. Every consumer inherits the forgery:
//   (a) `isEnumValue` (value.ts:190) classifies `JSON.parse`d / literal data
//       carrying the key as an enum value; `schemaTagOf` recovers a forged
//       declaring-schema name;
//   (c) `valuesEqual` (value.ts:260, enum arm first) routes a tag-carrying
//       plain object to the enum arm: structurally DIFFERENT objects sharing
//       the forged tag compare EQUAL (`String(obj)` is "[object Object]" on
//       both sides), and a tag-carrying object never receives the documented
//       object comparison (key set + per-key value);
//   (d) `interpolationTypeOf` (production-theta-producer.ts, module-private)
//       classifies the forged object `{ kind: "enum" }`, so the QRY-18 render
//       emits `String(value)` → "[object Object]" (query-render.ts enum arm)
//       in place of the compact JSON the object rule specifies; nested inside
//       an interpolated object, `translateInterpolationOutbound` collapses the
//       forged subtree the same way;
//   (e) end-to-end, a parse-clean theta can mint the tag in-language and `==`
//       over two structurally different values evaluates `true`.
//
// FIXED CONTRACT pinned by this file (RED now, GREEN after the fix): a tag
// classifies only when the own-property descriptor exists AND is
// non-enumerable — mirroring `isResultValue` (value.ts:209, the bug-0017
// precedent three declarations away). A plain object carrying an enumerable
// `__thetaEnum` / `__thetaSchema` key is an ordinary object value: object-arm
// `==`, compact-JSON interpolation, no schema-brand recovery. CONTROLS pin
// that genuine constructor-built values — `makeEnumValue`, `brandSchemaValue`,
// `Enum.Variant` access, the `translateInbound` sidecar re-tag — keep their
// classification, equality, and JSON-output semantics (green now, green
// after). The ctor-collision wrinkle (a schema field literally named
// `__thetaSchema`) is constructor-side and pinned by
// tests/schema-brand-symbol-migration.test.ts (bug 0026's symbol-brand
// migration).
//
// PROBED CURRENT SIGNATURES (655e4d39, all offline and deterministic):
//   - isEnumValue(JSON.parse('{"__thetaEnum":"Severity"}'))        → true
//   - schemaTagOf(JSON.parse('{"__thetaSchema":"Person",…}'))      → "Person"
//   - valuesEqual({__thetaEnum:"Severity",x:1},
//                 {__thetaEnum:"Severity",y:2})                    → true
//   - valuesEqual({__thetaEnum:"Severity",x:1},
//                 {__thetaEnum:"Severity",x:2})                    → true
//   - untyped live query interpolating the forged ctor value sends
//     "payload: [object Object]" (top-level) /
//     '{"inner":"[object Object]","note":"n"}' (nested)
//   - probe-7 theta (schema-ctor tag mint, `a == b`)               → success, true
//   - lowerQueryResponseSchema("NotDeclaredAnywhere", []) → {} and real AJV
//     ADMITS the forged payload; the closed `{ x: integer }` control REJECTS
//     it (additionalProperties, additionalProperty "__thetaEnum")
//
// HARNESS NOTES:
//   - `enumTagOf` is module-private; it is exercised through its exported
//     consumers `isEnumValue` and `valuesEqual`.
//   - The QRY-18 render witness drives the REAL module-private routing
//     (`renderQueryText` → `stringifyInterpolation` → `interpolationTypeOf` →
//     `translateInterpolationOutbound` / `stringifyInterpolatedValue`) — all
//     private to src/extension/production-theta-producer.ts — by executing an
//     UNTYPED prompt-mode query through the production binding and observing
//     the rendered text at the `pi.sendUserMessage` seam (the
//     tests/empty-query-annotation.test.ts LiveSessionDouble pattern: the
//     injected Clock's `setTimeout` ticks the session double, completing the
//     streamed turn with a scripted reply). No pi-ai mock is needed — an
//     untyped query never dispatches `complete()`.
//   - The forged value is minted IN-LANGUAGE via a schema-named ctor
//     (`Forged { __thetaEnum: "Severity", x: 1 }`) — the parser admits the
//     field name, and a bare object literal would trip the unrelated
//     `theta/parse/bare-object-literal` rejection (the bug-0017 harness note).
//     The ctor also installs a GENUINE non-enumerable `__thetaSchema: "Forged"`
//     brand — post-fix that brand (correctly) drives the wire-name lookup while
//     the enumerable `__thetaEnum` key rides along as ordinary data.
//   - Group (e) reuses the bug-0017 production-executor harness verbatim
//     (parseThetaDocument → createProductionProducerDeps →
//     bindPromptConversation → executeBody); the body drives no query, so the
//     minimal pi/root doubles suffice.
//   - Group (f) is INGRESS DOCUMENTATION, not a defect probe: it pins the
//     wire-reachability claim (a permissive-`{}` lowering position admits the
//     forged payload through the QRY-22 AJV gate; a closed declared schema
//     rejects it). Green now, green after — the fix changes classification,
//     not the gate.

// ===========================================================================
// Shared parse harness (the bug-0017 pattern).
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
 * Parse a fixture source and fail LOUDLY on any error-severity diagnostic —
 * a fixture that stops parsing must never let a bug test pass or fail for the
 * wrong reason (no silent skip). The bug doc pins that `__thetaEnum` /
 * `__thetaSchema` are admitted as ordinary field names, so a rejection here is
 * a harness defect, not the bug.
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

/** The forged wire payload every group probes with (the bug doc's shape). */
const FORGED_ENUM_JSON = '{"__thetaEnum":"Severity","x":1}';

/** The production AJV validator over a content-address slug (the 0014 helper). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

// ===========================================================================
// Production-executor harness for NON-query bodies (group (e)) — the bug-0017
// prompt-mode binding: parseThetaDocument → createProductionProducerDeps →
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
  const doc = parseTheta("bug0020.theta", src);
  const theta: ThetaCompositionInput = {
    slashName: "bug0020",
    sourcePath: "/theta/bug0020.theta",
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

// ===========================================================================
// Live-query harness for group (d) — trimmed from
// tests/empty-query-annotation.test.ts: the untyped prompt-mode query issues
// ONE streamed user turn (`pi.sendUserMessage`) whose content IS the QRY-18
// rendered template; the injected Clock's `setTimeout` ticks the session
// double, completing the turn with the scripted assistant reply.
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
 * against the live session double and return the execution plus the captured
 * send surface. Fails loudly if the binding is not the live prompt drive.
 */
async function driveQueryTheta(
  src: string,
): Promise<{ execution: BodyExecution; session: LiveSessionDouble }> {
  const doc = parseTheta("bug0020-query.theta", src);
  const session = new LiveSessionDouble([{ stopReason: "stop", text: "ok" }]);
  const deps = createProductionProducerDeps({
    pi: livePi(session),
    root: rootLive(session),
    modelRegistry: registryDouble(),
  });
  const theta: ThetaCompositionInput = {
    slashName: "bug0020q",
    sourcePath: "/theta/bug0020q.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxLive(session) });
  if (binding.drivenAgainst !== "prompt-user-session") {
    throw new Error(
      `harness: expected the LIVE prompt-mode drive, got ${String(binding.drivenAgainst)}`,
    );
  }
  const execution = await executeBody(doc.body, binding.executeDeps);
  return { execution, session };
}

// ===========================================================================
// (a) classifier units — the brand is the non-enumerable descriptor, not the
// key name. JSON.parse and object literals produce only ENUMERABLE keys.
// ===========================================================================

describe("bug 0020 (a) — enum/schema tags classify by descriptor privacy, not key presence", () => {
  it("RED (a1): a JSON-parsed payload naming `__thetaEnum` is NOT an enum value", () => {
    const wireForged = JSON.parse('{"__thetaEnum":"Severity"}') as ThetaValue;
    expect(
      isEnumValue(wireForged),
      "PRIMARY (bug 0020): JSON.parse produces only enumerable own properties — a wire payload naming the tag must not classify as an enum value (runtime-value-model.md enum row: the tag is interpreter-PRIVATE)",
    ).toBe(false);
  });

  it("RED (a2): an object-literal `__thetaEnum` key does not classify — the brand is the non-enumerable descriptor, not the name", () => {
    expect(
      isEnumValue({ __thetaEnum: "Severity" }),
      "PRIMARY (bug 0020): an object literal carries the tag name as enumerable user data, not a brand — only makeEnumValue's non-enumerable install classifies",
    ).toBe(false);
  });

  it("RED (a3): a JSON-parsed payload naming `__thetaSchema` recovers NO declaring-schema tag", () => {
    const wireForged = JSON.parse('{"__thetaSchema":"Person","name":"x"}') as ThetaValue;
    expect(
      schemaTagOf(wireForged),
      "PRIMARY (bug 0020): a wire payload must not select, by name, which declared schema's theta→wire renames the QRY-18 outbound render applies to it (brandSchemaValue's contract: indistinguishable from a plain object on every theta-visible surface)",
    ).toBeUndefined();
  });

  it("RED (a4): an object-literal `__thetaSchema` key recovers no schema tag", () => {
    expect(
      schemaTagOf({ __thetaSchema: "Person", name: "x" }),
      "PRIMARY (bug 0020): an enumerable same-named key is ordinary user data — only brandSchemaValue's non-enumerable install is the brand",
    ).toBeUndefined();
  });
});

// ===========================================================================
// (b) genuine-value CONTROLS — every constructor site keeps classification,
// equality, and JSON-output semantics. Green now, green after.
// ===========================================================================

describe("bug 0020 (b) — controls: constructor-built values keep their semantics (green now, green after)", () => {
  it("CONTROL (b1): makeEnumValue / brandSchemaValue values classify; unrelated values do not", () => {
    expect(isEnumValue(makeEnumValue("Severity", "low")), "makeEnumValue builds a genuine enum value").toBe(
      true,
    );
    expect(
      schemaTagOf(brandSchemaValue({ name: "x" }, "Person")),
      "brandSchemaValue installs the recoverable declaring-schema brand",
    ).toBe("Person");
    expect(isEnumValue("low"), "a bare wire string is not an enum value").toBe(false);
    expect(isEnumValue({ severity: "low" }), "an untagged object is not an enum value").toBe(false);
    expect(isEnumValue(null), "null is never an enum value").toBe(false);
    expect(schemaTagOf({ name: "x" }), "an untagged object carries no schema tag").toBeUndefined();
    expect(schemaTagOf(["x"]), "an array never carries a schema tag").toBeUndefined();
    expect(schemaTagOf(null), "null carries no schema tag").toBeUndefined();
  });

  it("CONTROL (b2): `Enum.Variant` access through a real LexicalEnvironment classifies and equals makeEnumValue of the same pair", () => {
    // The runtime `Enum.Variant` access path (lexical-environment.ts
    // resolveEnumVariant) constructs through makeEnumValue — the genuine
    // in-language enum mint the fix must not disturb.
    const env = buildEnvironment({
      body: { statements: [], tail: null },
      enums: [
        { name: "Severity", variants: ["Low", "High"], values: { Low: "low", High: "high" } },
      ],
    });
    const variant = env.resolveEnumVariant("Severity", "Low");
    if (variant === undefined) {
      throw new Error("harness: Severity.Low did not resolve against the registered enum");
    }
    expect(isEnumValue(variant), "the resolved variant classifies as an enum value").toBe(true);
    expect(
      valuesEqual(variant, makeEnumValue("Severity", "low")),
      "the resolved variant equals a locally constructed variant of the same enum and wire value",
    ).toBe(true);
  });

  it("CONTROL (b3): the translateInbound sidecar re-tag classifies as enum, equals a local makeEnumValue, and stays out of JSON output", () => {
    // The inbound wire boundary (wire-translation.ts): a named-enum position
    // re-tags the validated string through makeEnumValue so the rebuilt value
    // compares equal to a locally constructed variant
    // (runtime-value-model.md §Wire-name translation).
    const sidecar: SchemaSidecar = {
      wireNames: [],
      namedEnumPositions: [{ pointer: "/properties/severity", enumName: "Severity" }],
    };
    const rebuilt = translateInbound({
      validated: JSON.parse('{"severity":"low"}') as unknown,
      sidecars: new Map<string, SchemaSidecar>([["Triage", sidecar]]),
      rootDef: "Triage",
    });
    if (rebuilt === null || typeof rebuilt !== "object" || Array.isArray(rebuilt)) {
      throw new Error(
        `harness: translateInbound must rebuild an object; got ${JSON.stringify(rebuilt)}`,
      );
    }
    const severity = (rebuilt as { readonly [k: string]: ThetaValue })["severity"];
    if (severity === undefined) {
      throw new Error("harness: the rebuilt value lacks the `severity` field");
    }
    expect(isEnumValue(severity), "the re-tagged position classifies as an enum value").toBe(true);
    expect(
      valuesEqual(severity, makeEnumValue("Severity", "low")),
      "the re-tagged value equals a locally built variant of the same enum",
    ).toBe(true);
    expect(
      JSON.stringify(rebuilt),
      "the genuine tag is non-enumerable — JSON output is the bare wire form (enum row: the tag MUST NOT appear in JSON output)",
    ).toBe('{"severity":"low"}');
  });

  it("CONTROL (b4): enum equality compares the declaring-enum tag AND the wire value", () => {
    expect(
      valuesEqual(makeEnumValue("A", "x"), makeEnumValue("B", "x")),
      "cross-enum equality is false even when wire values match (Severity.High == OtherEnum.High is false)",
    ).toBe(false);
    expect(
      valuesEqual(makeEnumValue("A", "x"), makeEnumValue("A", "x")),
      "same enum, same wire value — true",
    ).toBe(true);
    expect(
      valuesEqual(makeEnumValue("A", "x"), makeEnumValue("A", "y")),
      "same enum, differing wire value — false",
    ).toBe(false);
  });
});

// ===========================================================================
// (c) valuesEqual — a tag-carrying plain object must take the OBJECT arm
// (key set + per-key value), never the enum arm's tag + String(value)
// comparison. Both corruption directions are pinned.
// ===========================================================================

describe("bug 0020 (c) — valuesEqual routes tag-carrying plain objects to the OBJECT arm", () => {
  it("RED (c1): structurally DIFFERENT objects sharing a forged `__thetaEnum` string must NOT compare equal", () => {
    // The bug doc's probe 3: at HEAD the enum arm compares tag ("Severity" ==
    // "Severity") plus String(value) ("[object Object]" == "[object Object]")
    // and answers TRUE for objects with disjoint payload keys.
    expect(
      valuesEqual({ __thetaEnum: "Severity", x: 1 }, { __thetaEnum: "Severity", y: 2 }),
      "PRIMARY (bug 0020): the enum arm compares the forged tag plus String(value) — '[object Object]' on both sides — so structurally DIFFERENT objects currently compare equal; the object rule (key set + per-key value) must answer false",
    ).toBe(false);
  });

  it("RED (c2): tag-carrying plain objects take the OBJECT arm — same key set, differing value compares false", () => {
    // The other direction of the corruption: a tag-carrying object never
    // receives the documented object comparison at HEAD — the enum arm
    // short-circuits first and ignores the real fields entirely.
    expect(
      valuesEqual({ __thetaEnum: "Severity", x: 1 }, { __thetaEnum: "Severity", x: 2 }),
      "PRIMARY (bug 0020): per-key object comparison must see x: 1 != x: 2; the enum arm currently hides the fields behind String(value)",
    ).toBe(false);
  });

  it("CONTROL (c3): structurally IDENTICAL tag-carriers compare true (green now via the WRONG arm, green after via the object arm)", () => {
    // Right answer today for the wrong reason (enum arm: equal tags, equal
    // "[object Object]" strings); must stay true once the pair routes through
    // genuine per-key object comparison (equal key sets, equal values).
    expect(valuesEqual({ __thetaEnum: "Severity", x: 1 }, { __thetaEnum: "Severity", x: 1 })).toBe(
      true,
    );
  });

  it("CONTROL (c4): a forged tag-carrier never equals a genuine enum value, in either argument order (green now, green after — different reason)", () => {
    // At HEAD this is false because the enum arm's wire-string comparison
    // fails ("[object Object]" vs "low"); post-fix it is false because the
    // pair is cross-type (object vs enum). Same verdict, different arm —
    // pinned so the fix cannot regress it while re-routing.
    expect(
      valuesEqual({ __thetaEnum: "Severity", x: 1 }, makeEnumValue("Severity", "low")),
      "forged tag-carrier vs genuine enum value is a cross-type pair",
    ).toBe(false);
    expect(
      valuesEqual(makeEnumValue("Severity", "low"), { __thetaEnum: "Severity", x: 1 }),
      "…in the reversed argument order too",
    ).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Object-arm MEMBERSHIP sub-group — the bug-0020 corruption class through
  // the object arm itself (pre-existing at 655e4d39, surviving the classifier
  // fix): an own-property membership read on the non-walked side matches a
  // genuine non-enumerable brand by name AND value. Membership must be
  // enumerable-only — a brand is not a theta-side key — so brands neither
  // satisfy membership (c5) nor defeat it (c6).
  // -------------------------------------------------------------------------

  it("RED-CLASS (c5): a forged enumerable `__thetaSchema` key never matches a genuine non-enumerable brand in object-arm membership — false in BOTH argument orders", () => {
    // Key counts are EQUAL — 2 enumerable own keys each (forged:
    // {__thetaSchema, name}; branded: {name, other}, its brand non-enumerable)
    // — which is what carries the pair past the key-count guard into the
    // per-key membership check. There an own-property (enumerable-blind) read
    // matches the forged tag against the genuine brand by name AND by value
    // ("Person" == "Person"), answering true in exactly one argument order —
    // an asymmetric false-equal in `==`. The object contract compares the
    // THETA-SIDE key set; B's is {name, other}, not {__thetaSchema, name}.
    const forgedPlain = JSON.parse('{"__thetaSchema":"Person","name":"x"}') as ThetaValue;
    const genuinelyBranded = brandSchemaValue({ name: "x", other: 1 }, "Person");
    expect(
      valuesEqual(forgedPlain, genuinelyBranded),
      "PRIMARY (bug 0020 class): the forged enumerable tag must not satisfy membership against the genuine brand — the operands' theta-side key sets differ",
    ).toBe(false);
    expect(
      valuesEqual(genuinelyBranded, forgedPlain),
      "…in the reversed argument order too",
    ).toBe(false);
  });

  it("CONTROL (c6): a genuine brand does not defeat object equality — branded vs plain twin compares true in both orders (green now, green after)", () => {
    // Brands are excluded from BOTH halves of the object arm — the
    // `Object.keys` walk (enumerable-only) and the enumerable-only membership
    // test — so a branded value stays indistinguishable from its plain twin
    // (brandSchemaValue's contract: invisible on every theta-visible surface).
    const branded = brandSchemaValue({ name: "x" }, "Person");
    expect(
      valuesEqual(branded, { name: "x" }),
      "the non-enumerable brand is not a theta-side key — it must not defeat equality",
    ).toBe(true);
    expect(
      valuesEqual({ name: "x" }, branded),
      "…in the reversed argument order too",
    ).toBe(true);
  });
});

// ===========================================================================
// (d) QRY-18 render — a forged enum payload interpolated into a query template
// must render by the OBJECT rule (compact JSON, wire-name translation), never
// String(value) → "[object Object]". Driven through the REAL private routing
// (see HARNESS NOTES) and observed at the pi.sendUserMessage seam.
// ===========================================================================

describe("bug 0020 (d) — QRY-18 render: a forged-enum payload renders as compact JSON, not [object Object]", () => {
  it("RED (d1): a top-level forged interpolation renders the object's compact JSON", async () => {
    const { execution, session } = await driveQueryTheta(
      FM +
        "schema Forged { __thetaEnum: string, x: integer }\n" +
        'let a = Forged { __thetaEnum: "Severity", x: 1 }\n' +
        "let v = @`payload: ${a}`?\n" +
        "v",
    );

    expect(
      session.sendUserMessageCalls,
      "harness guard: the untyped query drives exactly one streamed user turn",
    ).toBe(1);
    const sent = session.sentQueryTexts[0]!;
    expect(
      sent,
      `PRIMARY (bug 0020): interpolationTypeOf classifies the forged object { kind: "enum" } and renders String(value) — the payload is destroyed; QRY-18's object rule requires the compact JSON. Observed rendered text: ${JSON.stringify(sent)}`,
    ).toContain(FORGED_ENUM_JSON);
    expect(
      sent,
      "QRY-18's stated purpose: never JavaScript's default String(...), whose [object Object] silently corrupts the prompt",
    ).not.toContain("[object Object]");
    expect(execution.outcome, "the driven query completes and the body succeeds").toBe("success");
  });

  it("RED (d2): a forged enum NESTED in an interpolated object keeps its subtree in the rendered JSON", async () => {
    // translateInterpolationOutbound recurses into the Wrap value's fields; at
    // HEAD isEnumValue(inner) is true and the whole subtree collapses to
    // "[object Object]" inside the rendered JSON.
    const { execution, session } = await driveQueryTheta(
      FM +
        "schema Forged { __thetaEnum: string, x: integer }\n" +
        "schema Wrap { inner: Forged, note: string }\n" +
        'let a = Forged { __thetaEnum: "Severity", x: 1 }\n' +
        'let w = Wrap { inner: a, note: "n" }\n' +
        "let v = @`payload: ${w}`?\n" +
        "v",
    );

    expect(
      session.sendUserMessageCalls,
      "harness guard: the untyped query drives exactly one streamed user turn",
    ).toBe(1);
    const sent = session.sentQueryTexts[0]!;
    expect(
      sent,
      `PRIMARY (bug 0020): the nested forged value must render as its compact-JSON subtree inside the enclosing object render. Observed rendered text: ${JSON.stringify(sent)}`,
    ).toContain(`{"inner":${FORGED_ENUM_JSON},"note":"n"}`);
    expect(sent, "no subtree collapses to [object Object]").not.toContain("[object Object]");
    expect(execution.outcome, "the driven query completes and the body succeeds").toBe("success");
  });
});

// ===========================================================================
// (e) production executor end-to-end — the tag is mintable IN-LANGUAGE
// (parse-clean, no wire), and `==` over two structurally different carriers
// must answer false. The bug doc's probe 7.
// ===========================================================================

describe("bug 0020 (e) — `==` over in-language tag-carrying objects (production executor)", () => {
  it("RED (e1): structurally different ctor values sharing a forged `__thetaEnum` field compare `a == b` → false", async () => {
    const execution = await runSource(
      FM +
        "schema A { __thetaEnum: string, x: integer }\n" +
        "schema B { __thetaEnum: string, y: integer }\n" +
        'let a = A { __thetaEnum: "Severity", x: 1 }\n' +
        'let b = B { __thetaEnum: "Severity", y: 2 }\n' +
        "a == b",
    );

    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(
      execution.result.value,
      "PRIMARY (bug 0020): a and b are structurally DIFFERENT objects ({__thetaEnum, x} vs {__thetaEnum, y}) — the object rule answers false; at HEAD the forged tags route the pair to the enum arm and `a == b` evaluates true (the spec's 'not reachable from theta code' claim fails in-language, parse-clean)",
    ).toBe(false);
  });

  it("CONTROL (e2): the same theta without the tag fields evaluates false (green now, green after)", async () => {
    const execution = await runSource(
      FM +
        "schema A { x: integer }\n" +
        "schema B { y: integer }\n" +
        "let a = A { x: 1 }\n" +
        "let b = B { y: 2 }\n" +
        "a == b",
    );

    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(
      execution.result.value,
      "untagged ctor values already compare through the object arm — key sets differ",
    ).toBe(false);
  });
});

// ===========================================================================
// (f) INGRESS DOCUMENTATION (green now, green after) — the wire-reachability
// claim: a permissive-`{}` lowering position (an annotation name that resolves
// to no declaration) ADMITS the forged payload through the QRY-22 AJV gate; a
// closed declared schema rejects it. The bug-0020 fix changes classification,
// not this gate.
//
// REACHABILITY (bug 0028, docs/bugs/0028-unresolved-annotation-silent-
// permissive-lowering.md): this position is no longer parse-clean. The
// annotation root, a `schema` body field type, and an inline-object annotation
// field each emit `theta/parse/unresolved-named-type` (E) for a name resolving
// to no top-level `schema`/`enum` declaration and no imported `.thetalib`
// symbol, so such a theta REFUSES AT LOAD and the permissive lowering is
// unreachable FROM SOURCE — the parse gate is the sole enforcement point. Bug
// 0028 also removed the forward/self arm from this position's description
// entirely: those now lower to a real recursive `$ref`, not to `{}`. What
// survives is the seam's total-function contract (bug 0028 §Fix,
// "lowerQueryResponseSchema stays a total function returning `{}`"), so both
// assertions below stand unchanged — reached only by calling the seam
// DIRECTLY, as (f1) does, never by loading a theta.
// ===========================================================================

describe("bug 0020 (f) — CONTROL/INGRESS: the QRY-22 gate's permissive `{}` lowering admits the forged payload", () => {
  it("CONTROL/INGRESS (f1): an unresolved annotation lowers permissively to {} and real AJV ADMITS the forged payload", () => {
    // The seam is called DIRECTLY here: bug 0028's parse gate refuses this name
    // at every source position that would reach the lowering, so the `{}` arm is
    // no longer constructible from a loadable theta. It survives as the seam's
    // total-function contract, deliberately unchanged (bug 0028 §Fix —
    // `#validateInvokeReturn`'s `undefined` arm returns its result UNVALIDATED,
    // which is strictly worse than `{}` for `invoke<T>`), which is why this
    // assertion is untouched by that fix.
    const lowered = lowerQueryResponseSchema("NotDeclaredAnywhere", []);
    expect(
      lowered,
      "an annotation name resolving to no declaration lowers permissively to {} — the seam's total-function contract, now reachable only by a direct call (bug 0028's parse gate refuses it from source)",
    ).toEqual({});
    const verdict = ajv()
      .compile(lowered!)
      .validate(JSON.parse(FORGED_ENUM_JSON));
    expect(
      verdict.ok,
      "the permissive document admits the tag-carrying payload — this is how wire data reaches the classifiers",
    ).toBe(true);
  });

  it("CONTROL/INGRESS (f2): a closed declared schema REJECTS the forged key with additionalProperties `__thetaEnum`", () => {
    const lowered = lowerQueryResponseSchema("{ x: integer }", []);
    if (lowered === undefined) {
      throw new Error("harness: the closed inline annotation `{ x: integer }` failed to lower");
    }
    const verdict = ajv().compile(lowered).validate(JSON.parse(FORGED_ENUM_JSON));
    if (verdict.ok) {
      expect.fail(
        "a closed declared schema (additionalProperties: false) must reject the tag-carrying payload",
      );
    }
    expect(
      verdict.errors.some(
        (e) => e.keyword === "additionalProperties" && e.params["additionalProperty"] === "__thetaEnum",
      ),
      `the rejection names the forged key: observed errors ${JSON.stringify(verdict.errors)}`,
    ).toBe(true);
  });
});
