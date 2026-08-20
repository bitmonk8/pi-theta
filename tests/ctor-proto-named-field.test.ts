import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type CallExpr,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import {
  buildObjectSchemaValue,
  schemaTagOf,
  valuesEqual,
  type SchemaFieldOrder,
  type ThetaValue,
} from "../src/runtime/value";
import {
  createProductionProducerDeps,
  type PiToolDispatch,
} from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";

// Bug 0119 — a declared schema field literally named `__proto__` is silently
// dropped at construction. Every record-building site on the construction path
// writes its fields by ASSIGNMENT into a plain object, and `__proto__` is not an
// ordinary string key there: it is an accessor inherited from
// `Object.prototype`, so the assignment invokes that setter instead of defining
// an own property (a no-op for a non-object value, a prototype replacement for
// an object one). No own key is created and no diagnostic is emitted on any
// channel, while the parse layer forces the field to be written and type-checks
// its value (docs/bugs/0119-proto-named-field-silently-dropped.md).
//
// SPEC ANCHORS (each re-derived against the corpus in this tree).
//   - docs/spec_topics/expressions.md §"Object construction": "Every declared
//     field of the schema must be present (omissions are
//     `theta/parse/missing-object-field`) … field order is irrelevant". A schema
//     declaring `__proto__` therefore forces every in-language construction
//     through the drop: the field MUST be written, and writing it yields a value
//     that does not carry it.
//   - docs/spec_topics/grammar.md restates the presence rule for `NamedObjectLit`.
//   - docs/spec_topics/runtime-value-model.md, the object row: "JS plain object
//     keyed by **theta-side names**, regardless of any wire-name renames
//     declared on the schema" — so the constructed value's theta-side keys are
//     exactly the declared names.
//   - docs/spec_topics/expressions.md, the `object` member table: `keys()` is
//     the theta-side field names in declaration order (bug 0080's contract),
//     `values()` the same order, `has(k)` `false` only "for unknown keys".
//   - docs/spec_topics/query/query-escapes-stringification.md, QRY-18's
//     Schema-typed-object row: compact `JSON.stringify` of the value with
//     wire-name translation applied recursively.
//
// THE SETTLED ROUTE, pinned by this file (bug 0119 §Fix route (b)): every field
// write on the construction path becomes
// `Object.defineProperty(rec, name, { value, enumerable: true, writable: true,
// configurable: true })` through one exported helper in src/runtime/value.ts.
// That descriptor is byte-identical to an assignment's, so no read surface
// moves; the record keeps `Object.prototype` (route (a)'s null-prototype record
// is NOT taken, which is why the prototype-identity assertions below are
// green-on-both-sides constraints rather than flip targets), and the brand stays
// a non-enumerable own symbol recoverable by `schemaTagOf` (bug 0026's shape,
// §Fix constraints 1-3). Routes (c) / (d) — refuse or reserve the name — are not
// taken, so no diagnostic code is minted and no registry row moves (§Fix
// constraint 6): the omission control below is green on both sides.
//
// THE WRITE SITES THIS FILE COVERS (§Fix constraint 5 and 7 — the four paths
// move together, and the scope over the adjacent sites is stated, not implicit):
//   1. `evalExpr`'s `expr.kind === "object"` arm, the field write at
//      src/runtime/statement-executor.ts:667 — every `let`-bound constructor.
//      Cells (A), (B), (C1-C4), (D), (E), (H) drive it.
//   2. `evaluatePureExpression`'s `case "object"`, the field write at
//      src/extension/production-theta-producer.ts:6284 — a constructor written
//      INLINE, with no intervening `let`, inside a `${…}` interpolation. Cell
//      (L) is its only witness: every other constructor cell here binds the
//      value first and so takes item 1's arm instead.
//   3. `buildObjectSchemaValue`'s rebuild, src/runtime/value.ts:403 (the
//      declared-fields write) and :408 (the undeclared-key fallback write),
//      bug 0080's single construction point. It is a SECOND drop point: the
//      own-key guard at :402 is `false` for a dropped `__proto__` so the
//      declared field is skipped as absent, and the rebuild re-drops a field
//      that does arrive. Cell (G1) covers :403 and reds if only the callers are
//      fixed; cell (G5) covers :408.
//   4. The two Pi-tool argument records — src/runtime/statement-executor.ts:352
//      (cells (I1) / (I2)) and its pure-host twin
//      src/extension/production-theta-producer.ts:4016 (cell (I3)) — which have
//      no rebuild downstream, so an object-valued field writes a prototype
//      across a boundary the interpreter does not own. The twin's field loop is
//      NOT reachable from theta source through the shipped executor: for a
//      Pi-tool call carrying an object-literal first argument
//      `preEvaluateToolArgs` always returns an evaluated record, and
//      `evaluatedToolArgs ?? lowerToolCallParams(expr, env)`
//      (src/extension/production-theta-producer.ts:3053) then takes the
//      left-hand side. Cell (I3) therefore drives the twin over the smallest
//      exported reach — `binding.executeDeps.host.runEffect(expr, env,
//      undefined)` — which is the reach tests/tool-arg-shape-enforcement.test.ts
//      already established for this same function.
//   5. The QRY-18 outbound wire-name write,
//      src/extension/production-theta-producer.ts:6195. The wire key is as
//      author-controlled as the theta-side name — a rename is constrained to a
//      non-empty string literal and nothing more (schemas.md:43) — so the same
//      inherited-accessor hazard applies to it, and QRY-18's
//      Schema-typed-object row requires the render to carry every declared
//      field under its wire name (query-escapes-stringification.md:27, with
//      schemas.md:30 / :39 admitting the name). Cells (D) and (K) witness that
//      clause.
// OUT OF SCOPE, and NOT because a report owns them:
//   - `src/runtime/wire-translation.ts` needs no work here. Its three record
//     builders are already null-prototyped — `Object.create(null)` at
//     `rebuildInbound` src/runtime/wire-translation.ts:370, `lowerOutbound`
//     :601 and `projectForValidation` :666 — so `__proto__` is an ordinary
//     string key on those records and neither the drop nor the prototype write
//     is possible there. That is route (a), the null-prototype remedy, applied
//     to that module by bug 0173 (fixed 0.96.0). Bug 0120, which earlier owned
//     `rebuildInbound`'s disposition, is fixed (0.97.0).
//   - The two `params:` records —
//     src/extension/production-theta-producer.ts:1866 (the `system:`-render
//     params record) and :1988 (the subagent `paramValues` marshalling record) —
//     are UNFIXED residuals of this fix, defended by neither route and owned by
//     no report. Both are `record[name] = value` over `bindInput.paramBindings`,
//     keyed by author-written `params:` field names, which
//     `theta/parse/binding-case-mismatch` admits with a `_` lead. This file
//     asserts nothing about them.
// Bug 0121 owns the KEY ORDER of the write in item 5 for integer-like wire
// names — a question `defineProperty` does not touch, since it leaves
// integer-like own-key ordering exactly where an assignment does; neither
// report's answer settles the other's.
//
// THE READ PATH IS ENUMERATED (cells C1-C4, D, E). Route (b) PRESERVES the
// field, so every own-key-only reader must deliver it: `assertKeyPresent`
// (src/runtime/runtime-panics.ts:222) behind indexed and member access, `keys` /
// `values` / `has` (src/runtime/stdlib-object.ts:114, :118, :123),
// `matchPattern`'s object arm (src/runtime/match-result.ts:214), `valuesEqual`'s
// enumerable-own-key walk (src/runtime/value.ts:550), the QRY-18 outbound
// `Object.entries` walk (src/extension/production-theta-producer.ts:6192) and
// the `JSON.stringify` at :6078.
//
// PRE-FIX BASELINE, re-derived at HEAD 69bc29e2 / 0.128.0 with the drives below.
// Every row's failure message names its own observation, so a red reads as "the
// declared field never landed", never as an unrelated error:
//   A   [q.keys(), q.values()]                     → [["a"],["x"]]
//   B   the record itself                          → own keys ["a"], no `__proto__` descriptor
//   C1  q.__proto__                                → panic `missing object key: __proto__`
//   C2  q["__proto__"]                             → panic `missing object key: __proto__`
//   C3  q.has("__proto__")                         → false
//   C4  match q { Q { __proto__: p } => p, … }     → the arm does not match (falls to `_`)
//   D   @`J${q}`                                   → J{"a":"x"} (short on the wire)
//   E1  q == r differing only in `__proto__`       → true
//   E2  valuesEqual(ctor value, JSON.parse twin)   → false in both argument orders
//   F   the field OMITTED                          → error theta/parse/missing-object-field (conformant)
//   G1  buildObjectSchemaValue, declared arm       → an own `__proto__` key is RE-dropped
//   G2-G4 its three early-return arms              → the key survives (they do not write)
//   G5  its undeclared-key fallback write          → an own `__proto__` key is RE-dropped
//   H   object-valued field, `q.__proto__.i`       → panic `missing object key: __proto__`
//   I1  grep({ a: "x", __proto__: Inner { i: 1 } }) → received keys ["a"], prototype IS the inner value
//   I2  grep({ a: "x", __proto__: 7 })             → received keys ["a"]
//   I3  the pure-host lowering of the same call    → params keys ["a"]
//   J   `constructor` / `toString`-named fields    → conformant already
//   K   `b as "__proto__"` rename render           → J{"a":"x"} (the renamed field is short)
//   L   @`J${Q { a: "x", __proto__: 7 }}` (INLINE) → J{"a":"x"} (short on the wire)
//
// HARNESS. The drive is the shape tests/ctor-declaration-order.test.ts
// established for bug 0080 (itself bug 0079's witness shape): parse →
// `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`
// against a `LiveSessionDouble` that records every `pi.sendUserMessage` argument
// and `tick()`s the assistant reply from the injected Clock's `setTimeout`. An
// UNTYPED prompt-mode query never dispatches `complete()`, so no provider and no
// model is involved. `resolvePiTool` is threaded through
// `createProductionProducerDeps` for cells (I1) / (I2) exactly as that file's
// row N threads it. That file is reused as a pattern; its only edit under this
// report is its own cell F (§Fix constraint 8).

// ===========================================================================
// Parse harness.
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

/** The source path every fixture parses under; also the diagnostics' `file`. */
const FIXTURE_PATH = "/theta/bug0119.theta";

function parseOnly(src: string): ThetaDocument {
  const source: ThetaSource = { path: FIXTURE_PATH, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}

/** `severity code` for every diagnostic the parse aggregated, in emission order. */
function severityCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** `severity code :: message` — the DIAG-4 spelling cell (F) asserts. */
function severityCodeMessages(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code} :: ${d.message}`);
}

const FM = "---\nmode: prompt\n---\n";

/** Frontmatter for cells (I1) / (I2), whose argument object is a Pi-tool one. */
const FM_GREP_TOOL = "---\nmode: prompt\ntools:\n  - grep\n---\n";

// ===========================================================================
// The DIAG-4 oracle. Cell (F) asserts a diagnostic CODE and its MESSAGE, and
// reads the registry to prove both are the registered ones — an invented or
// reworded message must not pass by matching a string this file made up.
// ===========================================================================

const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as readonly { readonly code: string; readonly message: string }[];

/**
 * The registered *Message* template for `code`. A missing row fails LOUDLY: the
 * registry is this file's only code oracle, so its absence is a harness
 * failure, never a skip.
 */
function registeredMessage(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: no registry row for ${code} in docs/spec_topics/diagnostics/ — cell (F) asserts a registered code and its registered message, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

// ===========================================================================
// Production-composition drive harness.
// ===========================================================================

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

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
  /** Every text handed to `pi.sendUserMessage` — the wire-facing observable. */
  readonly sentQueryTexts: string[] = [];

  #idle = true;

  sendUserMessage(content: string): void {
    this.sendUserMessageCalls += 1;
    this.sentQueryTexts.push(content);
    this.#append({ role: "user", content: [{ type: "text", text: content }], timestamp: 0 });
    this.#idle = false;
  }

  isIdle(): boolean {
    return this.#idle;
  }

  /** Complete the in-flight streamed turn with the scripted reply. */
  tick(): void {
    if (this.#idle) {
      return;
    }
    this.#append({
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
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
  } as unknown as RuntimeRoot;
}

function registryDouble(): ModelRegistry {
  return {
    getAvailable: () => [ANTHROPIC_MODEL],
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
  } as unknown as ModelRegistry;
}

/**
 * `ctx` for the prompt-mode drive. `sessionManager` answers an EMPTY entry list:
 * the observables under test are the final value, the text handed to
 * `pi.sendUserMessage` and the Pi-tool argument object — not the transcript.
 */
function ctxLive(session: LiveSessionDouble): ExtensionCommandContext {
  return {
    model: ANTHROPIC_MODEL,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

/** One drive's disposition: the body produced a value, or the runtime threw. */
type Drive =
  | {
      readonly kind: "value";
      readonly execution: BodyExecution;
      readonly session: LiveSessionDouble;
    }
  | { readonly kind: "threw"; readonly thrown: unknown; readonly session: LiveSessionDouble };

/**
 * Parse + drive one prompt-mode theta through the production binding against
 * the live session double. Fails LOUDLY when the fixture stops parsing or the
 * binding is not the live prompt-mode one — every drive fixture here is
 * parse-clean at HEAD (that parse-cleanliness is half of what makes the drop a
 * defect), so a fixture that no longer parses can neither pass nor fail its cell
 * for the right reason.
 */
async function drive(
  src: string,
  resolvePiTool?: (name: string) => PiToolDispatch | undefined,
): Promise<Drive> {
  const doc = parseOnly(src);
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `harness: this fixture must reach the RUNTIME, but it failed to parse: ${errors
        .map((d) => `${d.code}: ${d.message}`)
        .join("; ")}`,
    );
  }
  const session = new LiveSessionDouble();
  const deps = createProductionProducerDeps({
    pi: livePi(session),
    root: rootLive(session),
    modelRegistry: registryDouble(),
    ...(resolvePiTool !== undefined ? { resolvePiTool } : {}),
  });
  const theta: ThetaCompositionInput = {
    slashName: "bug0119",
    sourcePath: FIXTURE_PATH,
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxLive(session) });
  if (binding.drivenAgainst !== "prompt-user-session") {
    throw new Error(
      `harness: expected the LIVE prompt-mode drive, got ${String(binding.drivenAgainst)}`,
    );
  }
  try {
    return { kind: "value", execution: await executeBody(doc.body, binding.executeDeps), session };
  } catch (thrown) {
    return { kind: "threw", thrown, session };
  }
}

/**
 * The body's final value. A throw or a non-success outcome fails LOUDLY — a cell
 * about the record's contents can only be read off a value the drive produced.
 */
async function finalValue(src: string, what: string): Promise<ThetaValue> {
  const outcome = await drive(src);
  if (outcome.kind === "threw") {
    throw new Error(
      `harness: ${what} must produce a final value; the drive threw ${String(outcome.thrown)}`,
    );
  }
  if (outcome.execution.outcome !== "success") {
    throw new Error(
      `harness: ${what} must succeed; the drive ended ${String(outcome.execution.outcome)}`,
    );
  }
  return outcome.execution.result.value as ThetaValue;
}

/**
 * A read cell's disposition, as a comparable value: the read delivered a value,
 * or it raised. The read surfaces under test PANIC on an absent key
 * (`theta/runtime/missing-object-key`, the registered disposition), so a cell
 * that expected a value would otherwise red as a harness throw whose message
 * buries the symptom. Reifying the panic puts "the declared field never landed"
 * in the assertion diff itself.
 */
type Read =
  | { readonly delivered: ThetaValue }
  | { readonly raised: string };

async function readOutcome(src: string): Promise<Read> {
  const outcome = await drive(src);
  if (outcome.kind === "threw") {
    return { raised: String(outcome.thrown) };
  }
  if (outcome.execution.outcome !== "success") {
    return { raised: `drive ended ${String(outcome.execution.outcome)}` };
  }
  return { delivered: outcome.execution.result.value as ThetaValue };
}

/**
 * The single text the drive handed to `pi.sendUserMessage` — the QRY-18 rendered
 * turn. A throw, or any count other than one, fails LOUDLY.
 */
async function renderedTurn(src: string, what: string): Promise<string> {
  const outcome = await drive(src);
  if (outcome.kind === "threw") {
    throw new Error(
      `harness: ${what} must render a turn; the drive threw ${String(outcome.thrown)}`,
    );
  }
  if (outcome.session.sendUserMessageCalls !== 1) {
    throw new Error(
      `harness: ${what} must drive exactly one streamed user turn; observed ${outcome.session.sendUserMessageCalls} (sent: ${JSON.stringify(outcome.session.sentQueryTexts)})`,
    );
  }
  return outcome.session.sentQueryTexts[0] as string;
}

/**
 * The theta-visible key list of an object-schema value. A non-object value fails
 * LOUDLY rather than yielding an empty list that would pass a key-set assertion
 * vacuously.
 */
function ownKeys(value: ThetaValue, what: string): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`harness: ${what} must be an object-schema value; got ${JSON.stringify(value)}`);
  }
  return Object.keys(value);
}

/**
 * The own property descriptor of `key` on `value`, or the string `"absent"` when
 * there is no own property of that name. The descriptor IS the contract route
 * (b) claims — `{ value, writable: true, enumerable: true, configurable: true }`,
 * byte-identical to an assignment's — so cell (B) compares descriptors, and the
 * `"absent"` sentinel makes the current drop legible in the diff.
 */
function ownDescriptor(value: ThetaValue, key: string, what: string): unknown {
  if (typeof value !== "object" || value === null) {
    throw new Error(`harness: ${what} must be an object value; got ${JSON.stringify(value)}`);
  }
  return Object.getOwnPropertyDescriptor(value, key) ?? "absent";
}

// ===========================================================================
// Fixtures.
// ===========================================================================

/** The measured schema: `__proto__` is DECLARED FIRST, so it leads `keys()`. */
const SCHEMA_Q = "schema Q { __proto__: integer, a: string }\n";
/** The constructor the presence rule forces every author of `Q` to write. */
const CTOR_Q = 'let q = Q { a: "x", __proto__: 7 }\n';
/** An OBJECT-valued `__proto__` field — the prototype-write sub-case. */
const SCHEMA_Q2 =
  "schema Inner { i: integer }\nschema Q2 { __proto__: Inner, a: string }\n";
const CTOR_Q2 = 'let q = Q2 { a: "x", __proto__: Inner { i: 1 } }\n';

/**
 * A record carrying `__proto__` as a genuine own ENUMERABLE DATA property — the
 * record route (b)'s construction sites will hand `buildObjectSchemaValue`, and
 * the one no caller can produce by assignment today. Written with
 * `Object.defineProperty` for exactly that reason.
 */
function recordWithOwnProtoField(protoValue: ThetaValue): Record<string, ThetaValue> {
  const rec: Record<string, ThetaValue> = {};
  Object.defineProperty(rec, "__proto__", {
    value: protoValue,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  rec["a"] = "x";
  if (!Object.prototype.hasOwnProperty.call(rec, "__proto__")) {
    throw new Error(
      "harness: the unit-row input must carry `__proto__` as an OWN key — without it the cell would assert nothing about the rebuild",
    );
  }
  return rec;
}

/** Cell (K)'s schema: the wire name is `__proto__`, no theta-side field is. */
const SCHEMA_P_RENAMED = 'schema P { b as "__proto__": integer, a: string }\n';
const CTOR_P = 'let p = P { b: 1, a: "x" }\n';

/** `Q`'s declaration as `buildObjectSchemaValue` sees it: `__proto__` first. */
const DECL_Q: SchemaFieldOrder = { fields: [{ name: "__proto__" }, { name: "a" }] };

// ===========================================================================
// (A) The measurement — the declared field must be present, in declaration
// order, at parse-clean admission.
// ===========================================================================

describe("bug 0119 (A) — a declared `__proto__` field survives construction", () => {
  it("RED (A): `keys()` / `values()` carry the declared `__proto__` field", async () => {
    // The report's §Reproduction P1, verbatim. `keys()` / `values()` are the only
    // object iteration surface theta 1.0 exposes, so a declared name missing
    // here is missing from every `for k in q.keys()` walk too. The ORDER asserted
    // is bug 0080's contract (declaration order), which route (b) must leave
    // intact: this cell reds today on CONTENTS, not on order.
    const value = await finalValue(FM + SCHEMA_Q + CTOR_Q + "[q.keys(), q.values()]\n", "cell A");
    expect(
      value,
      'PRIMARY (bug 0119, cell A — the declared field never landed): expressions.md §"Object construction" requires every declared field to be present and runtime-value-model.md fixes the value as "JS plain object keyed by theta-side names", so `Q { a: "x", __proto__: 7 }` must answer [["__proto__","a"],[7,"x"]]. HEAD observes [["a"],["x"]]: the constructor field write (src/runtime/statement-executor.ts:667) assigned instead of defining, so it reached `Object.prototype`\'s inherited `__proto__` setter, which ignores a non-object value, and no own property was ever created',
    ).toEqual([
      ["__proto__", "a"],
      [7, "x"],
    ]);
  });

  it("CONTROL (A, admission): the fixture parses with NO diagnostic on any channel", async () => {
    // Half of what makes the drop a defect rather than a refusal: the field name
    // passes code-registry-parse.md's `theta/parse/binding-case-mismatch` (which
    // admits any `_`-leading identifier in a field-name position), and bug 0031's
    // per-field type check validates the value in a null-prototype record. The
    // parse layer checks a value the runtime then discards. Green on both sides:
    // routes (c) / (d) — refuse or reserve the name — are not taken, so no
    // diagnostic appears here after the fix either.
    const doc = parseOnly(FM + SCHEMA_Q + CTOR_Q + "[q.keys(), q.values()]\n");
    expect(
      severityCodes(doc),
      "CONTROL (bug 0119, cell A): the declaration and the constructor are admitted at every severity — the settled route makes the runtime conform to expressions.md rather than minting a refusal, so this stays empty",
    ).toEqual([]);
  });
});

// ===========================================================================
// (B) The record itself — the descriptor, the prototype, the brand.
// ===========================================================================

describe("bug 0119 (B) — the record carries the field as an ordinary own enumerable data property", () => {
  it("RED (B): the `__proto__` field's own descriptor is an assignment's descriptor", async () => {
    // The descriptor IS route (b)'s claim, and the reason it was chosen over
    // route (a): `{ value, writable: true, enumerable: true, configurable: true }`
    // is byte-identical to what an assignment produces, so no read surface and no
    // descriptor-sensitive consumer moves (§Fix, route (b), measured).
    const record = await finalValue(FM + SCHEMA_Q + CTOR_Q + "q\n", "cell B");
    expect(
      ownDescriptor(record, "__proto__", "cell B"),
      "PRIMARY (bug 0119, cell B — the declared field never landed): route (b) writes each field with `Object.defineProperty(rec, name, { value, enumerable: true, writable: true, configurable: true })`, whose descriptor is byte-identical to an assignment's. HEAD has no own property of that name at all, so the descriptor is `\"absent\"`",
    ).toEqual({ value: 7, writable: true, enumerable: true, configurable: true });
  });

  it("RED (B, key set): the record's own keys are exactly the declared names", async () => {
    // §Fix constraint 4: the only difference any route may make is that a
    // declared `__proto__` field becomes present — no other name is invented,
    // dropped or duplicated.
    const record = await finalValue(FM + SCHEMA_Q + CTOR_Q + "q\n", "cell B's record");
    const keys = ownKeys(record, "cell B's record");
    expect(
      [...keys].sort(),
      "bug 0119 §Fix constraint 4: the key SET is exactly the declared theta-side names (HEAD: `__proto__` missing)",
    ).toEqual(["__proto__", "a"]);
    expect(
      keys.length,
      `bug 0119 §Fix constraint 4: exactly one key per declared field, no duplicate. Observed ${JSON.stringify(keys)}`,
    ).toBe(2);
    expect(
      keys,
      'PRIMARY (bug 0119, cell B): the record\'s own key order IS what `Object.keys` / `Object.values` / `JSON.stringify` report, so declaration order ["__proto__","a"] has to hold on the record itself. HEAD observes ["a"]',
    ).toEqual(["__proto__", "a"]);
  });

  it("CONTROL (B, prototype and brand): the record stays a plain branded object", async () => {
    // §Fix constraints 1-3, and the discriminator between the two live routes:
    // route (b) does NOT null-prototype the record, so `Object.prototype` stays
    // the prototype (and `String(record)` keeps yielding `[object Object]`
    // instead of raising, route (a)'s one measured perturbation), while the brand
    // stays a non-enumerable own symbol recoverable by `schemaTagOf` — bug 0026's
    // shape, which this fix must not reopen. Both assertions are green at HEAD
    // and must STAY green: they are the fix's non-extent, not its target.
    const record = await finalValue(FM + SCHEMA_Q + CTOR_Q + "q\n", "cell B's record");
    expect(
      Object.getPrototypeOf(record as object) === Object.prototype,
      "bug 0119 §Fix route (b): the record keeps `Object.prototype` — the field becomes an own key by `defineProperty`, not by removing the prototype",
    ).toBe(true);
    expect(
      schemaTagOf(record),
      "bug 0119 §Fix constraint 3: the declaring-schema brand still recovers, so the QRY-18 outbound render can still resolve the theta→wire rename map",
    ).toBe("Q");
    const symbols = Object.getOwnPropertySymbols(record as object);
    expect(
      symbols.length,
      `bug 0026: exactly one symbol-keyed own property — the brand. Observed ${symbols.length}`,
    ).toBe(1);
    expect(
      Object.getOwnPropertyDescriptor(record as object, symbols[0] as symbol)?.enumerable,
      "bug 0026: the brand stays NON-ENUMERABLE, so it never joins the theta-visible key walk and never reaches the wire JSON",
    ).toBe(false);
  });
});

// ===========================================================================
// (C) The READ PATH, every reader enumerated. Route (b) preserves the field, so
// each own-key-only reader must deliver it.
// ===========================================================================

describe("bug 0119 (C) — every read surface delivers the preserved field", () => {
  it("RED (C1): member access `q.__proto__` reads the field", async () => {
    // Member access routes through `assertKeyPresent`
    // (src/runtime/runtime-panics.ts:222), whose `hasOwnProperty.call` test is
    // `false` for a key that is not on the record, so a dropped field raises the
    // registered `theta/runtime/missing-object-key` panic instead of answering 7.
    expect(
      await readOutcome(FM + SCHEMA_Q + CTOR_Q + "q.__proto__\n"),
      "PRIMARY (bug 0119, cell C1 — the declared field never landed): a declared field's value must be readable by member access. HEAD raises `missing object key: __proto__`, the registered disposition for an ABSENT key (code-registry-runtime.md), because the construction write never created one",
    ).toEqual({ delivered: 7 });
  });

  it("RED (C2): index access `q[\"__proto__\"]` reads the field", async () => {
    // The second read spelling shares `assertKeyPresent` with member access, so
    // it must agree with cell C1 exactly.
    expect(
      await readOutcome(FM + SCHEMA_Q + CTOR_Q + 'q["__proto__"]\n'),
      "PRIMARY (bug 0119, cell C2 — the declared field never landed): the indexed read spelling shares `assertKeyPresent` with member access and must deliver the same 7. HEAD raises `missing object key: __proto__`",
    ).toEqual({ delivered: 7 });
  });

  it("RED (C3): `q.has(\"__proto__\")` is true for a declared, written field", async () => {
    // expressions.md's `object` table fixes `has(k)` as `false` "for unknown
    // keys (no panic)". A declared field the constructor was FORCED to write is
    // not an unknown key, so `false` here is outside what that row admits.
    expect(
      await finalValue(FM + SCHEMA_Q + CTOR_Q + 'q.has("__proto__")\n', "cell C3"),
      "PRIMARY (bug 0119, cell C3 — the declared field never landed): `has` is `Object.prototype.hasOwnProperty.call` (src/runtime/stdlib-object.ts:124) and answers `false` at HEAD, which expressions.md reserves for UNKNOWN keys — the field is declared and was written",
    ).toBe(true);
  });

  it("RED (C4): an object-pattern `match` arm binds the field", async () => {
    // The pattern grammar admits an object/schema pattern whose listed fields
    // match inner patterns (expressions.md §"Pattern grammar"), and `matchPattern`
    // gates each listed field on `hasOwnProperty.call`
    // (src/runtime/match-result.ts:214). Measured: this fixture parses with zero
    // diagnostics, so the arm is reachable, and whether it matches is decided by
    // whether the declared field is an own key of the record.
    expect(
      await finalValue(
        FM + SCHEMA_Q + CTOR_Q + "match q { Q { __proto__: p } => p, _ => 0 }\n",
        "cell C4",
      ),
      "PRIMARY (bug 0119, cell C4 — the declared field never landed): the object pattern's own-key guard (src/runtime/match-result.ts:214) fails, so the arm does not match and HEAD falls to the `_` arm answering 0. A preserved field binds `p` to 7",
    ).toBe(7);
  });
});

// ===========================================================================
// (D) The QRY-18 outbound render — what the model is shown.
// ===========================================================================

describe("bug 0119 (D) — the QRY-18 render carries the field to the model", () => {
  it("RED (D): interpolating the value renders both declared fields", async () => {
    // QRY-18's Schema-typed-object row is compact `JSON.stringify` of the value
    // with wire-name translation applied recursively. Two writes have to hold
    // for the field to reach the model: the construction path has to put it on
    // the record, and the outbound pass has to carry it across — it walks
    // `Object.entries(value)`
    // (src/extension/production-theta-producer.ts:6192) and re-keys each entry
    // by its wire name (:6195), where an unrenamed field's wire key is the
    // theta-side `__proto__` and so meets the same accessor. Both writes define
    // rather than assign, so this render is in scope and green.
    expect(
      await renderedTurn(FM + SCHEMA_Q + CTOR_Q + "@`J${q}`\n", "cell D"),
      'PRIMARY (bug 0119, cell D — the declared field never landed on the wire): QRY-18 renders the value\'s own enumerable keys, so HEAD sends J{"a":"x"} for a schema declaring `__proto__` first. The preserved field renders J{"__proto__":7,"a":"x"}',
    ).toBe('J{"__proto__":7,"a":"x"}');
  });
});

// ===========================================================================
// (E) Equality — the dropped field is invisible to `==`, and the wire-provenance
// twin never compares equal.
// ===========================================================================

describe("bug 0119 (E) — equality observes the preserved field", () => {
  it("RED (E1): two values differing ONLY in the `__proto__` field are not equal", async () => {
    // §Why it matters: at HEAD both records are `{"a":"x"}`, so `==` is `true`
    // for values whose declared fields differ. Equality itself is a non-goal
    // here (`valuesEqual` stays order- and prototype-insensitive); this cell reds
    // because the operands are short, and greens because they stop being short.
    expect(
      await finalValue(
        FM + SCHEMA_Q + CTOR_Q + 'let r = Q { a: "x", __proto__: 9 }\n' + "q == r\n",
        "cell E1",
      ),
      "PRIMARY (bug 0119, cell E1 — the declared field never landed): `Q { a: \"x\", __proto__: 7 }` and `Q { a: \"x\", __proto__: 9 }` differ in a declared field, so `==` must be `false`. HEAD answers `true` because both records carry only `a`",
    ).toBe(false);
  });

  it("RED (E2): a wire-provenance twin compares EQUAL to a constructor-built value", async () => {
    // `JSON.parse` mints an own `__proto__` key, so a `Q` arriving as JSON
    // carries the field. At HEAD it therefore never compares equal to a
    // constructor-built `Q` in either argument order — the provenance split bug
    // 0026 recorded, with the arms swapped. `valuesEqual`'s enumerable-own-key
    // walk (src/runtime/value.ts:550) is called directly here because the twin
    // has no in-language spelling.
    const record = await finalValue(FM + SCHEMA_Q + CTOR_Q + "q\n", "cell E2");
    const wireTwin = JSON.parse('{"__proto__":7,"a":"x"}') as ThetaValue;
    if (!Object.prototype.hasOwnProperty.call(wireTwin as object, "__proto__")) {
      throw new Error(
        "harness: `JSON.parse` must mint an own `__proto__` key on the twin — without it this cell compares two short records and asserts nothing",
      );
    }
    expect(
      [valuesEqual(record, wireTwin), valuesEqual(wireTwin, record)],
      "PRIMARY (bug 0119, cell E2 — the declared field never landed): one schema's value must not split by provenance. HEAD observes [false,false] — the constructor-built record has own keys [\"a\"] and the JSON-parsed twin [\"__proto__\",\"a\"], so the key-count/key-walk comparison fails in both argument orders",
    ).toEqual([true, true]);
  });
});

// ===========================================================================
// (F) The omission control — the presence rule that forces the input class, and
// the DIAG-2/DIAG-4 non-extent of the settled route.
// ===========================================================================

describe("bug 0119 (F) — omitting the field is still the registered parse refusal", () => {
  it("CONTROL (F): the omission is `theta/parse/missing-object-field`, message unchanged", async () => {
    // This is why the defect has no conforming spelling: the author MUST write
    // the field (or take this refusal), and writing it yields a value without it.
    // Green on both sides — routes (c) / (d) are not taken, so the settled fix
    // mints no code and rewords no *Message* (§Fix constraint 6; DIAG-2 /
    // DIAG-4). The asserted message is built from the registry's own template, so
    // a reworded row cannot pass by matching a string this file made up.
    const expected = registeredMessage("theta/parse/missing-object-field")
      .replace("<field>", "__proto__")
      .replace("<schema>", "Q");
    const doc = parseOnly(FM + SCHEMA_Q + 'let q = Q { a: "x" }\n' + "q\n");
    expect(
      severityCodeMessages(doc),
      "CONTROL (bug 0119, cell F): omitting the declared field is refused at parse with the registered code and its registered message — the presence rule the runtime must now honour, unchanged by the fix",
    ).toEqual([`error theta/parse/missing-object-field :: ${expected}`]);
  });
});

// ===========================================================================
// (G) The unit rows over `buildObjectSchemaValue` — ALL FOUR arms. The
// declared-fields arm is the SECOND drop point: cell (G1) reds if only the two
// callers are fixed (§Fix constraint 5).
// ===========================================================================

describe("bug 0119 (G) — `buildObjectSchemaValue` preserves an own `__proto__` key in every arm", () => {
  it("RED (G1): the declared-fields arm returns the field it was handed", async () => {
    // The rebuild is the arm bug 0080 added (src/runtime/value.ts:400 the fresh
    // record, :402 the own-key guard, :403 / :408 the two writes). Handed a
    // record that DOES carry an own enumerable `__proto__` data property — the
    // record route (b)'s fixed callers will produce — HEAD returns one without
    // it, because both writes are assignments into a plain object. A fix confined
    // to the callers is a no-op for this arm.
    const input = recordWithOwnProtoField(7);
    const built = buildObjectSchemaValue(input, "Q", () => DECL_Q);
    expect(
      Object.keys(built),
      'PRIMARY (bug 0119, cell G1 — the SECOND drop point): the declared-fields rebuild must carry every own key of its input into the declaration-ordered record. HEAD observes ["a"]: `ordered[field.name] = …` (src/runtime/value.ts:403) is an assignment, so the `__proto__` key is dropped a second time',
    ).toEqual(["__proto__", "a"]);
    expect(
      ownDescriptor(built as ThetaValue, "__proto__", "cell G1"),
      "bug 0119 §Fix route (b): the rebuilt record's field descriptor matches an assignment's exactly",
    ).toEqual({ value: 7, writable: true, enumerable: true, configurable: true });
    expect(
      Object.getPrototypeOf(built as object) === Object.prototype,
      "bug 0119 §Fix constraint: the rebuild keeps `Object.prototype` — the field is defined, not exempted by removing the prototype",
    ).toBe(true);
    expect(
      schemaTagOf(built as ThetaValue),
      "bug 0119 §Fix constraint 1/3: the rebuild is still the single place the value is ordered and branded",
    ).toBe("Q");
  });

  it("CONTROL (G2): the bare-object arm returns its input untouched", async () => {
    // `typeName === null` (src/runtime/value.ts:390) — a bare object literal.
    // This arm does not write, so it neither drops nor rebuilds; the field
    // survives at HEAD. Pinned so a fix that rebuilds in more arms than route (b)
    // touches cannot silently start dropping here (§Fix constraint 5: one
    // behaviour, one implementation).
    const input = recordWithOwnProtoField(7);
    const built = buildObjectSchemaValue(input, null, () => DECL_Q);
    expect(
      built === (input as unknown),
      "CONTROL (bug 0119, cell G2): the bare-object arm returns the caller's own record identically — no rebuild, so no second drop point",
    ).toBe(true);
    expect(
      Object.keys(built),
      "CONTROL (bug 0119, cell G2): the own `__proto__` key survives the arm that does not write",
    ).toEqual(["__proto__", "a"]);
  });

  it("CONTROL (G3): the unresolved-name arm returns its input untouched", async () => {
    // `resolveSchema` answering `undefined` (src/runtime/value.ts:394) — bug
    // 0025's passthrough, refused at parse in-language and defensive here.
    const input = recordWithOwnProtoField(7);
    const built = buildObjectSchemaValue(input, "NoSuchSchema", () => undefined);
    expect(
      built === (input as unknown),
      "CONTROL (bug 0119, cell G3): the unresolved-name arm returns the caller's record identically",
    ).toBe(true);
    expect(
      Object.keys(built),
      "CONTROL (bug 0119, cell G3): the own `__proto__` key survives the unresolved-name arm",
    ).toEqual(["__proto__", "a"]);
  });

  it("CONTROL (G4): the fields-absent arm brands its input and keeps the field", async () => {
    // `decl.fields === undefined` (src/runtime/value.ts:397) — bug 0033's alias /
    // `by … = …` / head-only schema shape. It brands in place and returns the
    // same record, so the field survives with its brand.
    const input = recordWithOwnProtoField(7);
    const built = buildObjectSchemaValue(input, "Q", () => ({}));
    expect(
      built === (input as unknown),
      "CONTROL (bug 0119, cell G4): the fields-absent arm brands the caller's record in place and returns it identically",
    ).toBe(true);
    expect(
      Object.keys(built),
      "CONTROL (bug 0119, cell G4): the own `__proto__` key survives the fields-absent arm",
    ).toEqual(["__proto__", "a"]);
    expect(
      schemaTagOf(built as ThetaValue),
      "CONTROL (bug 0119, cell G4): that arm's brand install is unchanged by the fix",
    ).toBe("Q");
  });

  it("RED (G5): the undeclared-key fallback write carries an own `__proto__` key too", async () => {
    // The rebuild has TWO writes, not one: the declared-fields loop
    // (src/runtime/value.ts:403) and then a fallback loop over every own key of
    // the input the declaration does not name (:408). Cell (G1) drives only the
    // first, so without this row the second is unwitnessed and could go on
    // dropping the field.
    //
    // No theta source reaches this state: a constructor naming a field the
    // schema does not declare is refused at parse with
    // `theta/parse/extra-object-field` (code-registry-parse.md). The row is a
    // direct unit row for that reason — `buildObjectSchemaValue` is exported and
    // its two writes must obey one rule (§Fix constraint 5), so the arm is
    // pinned on its own terms rather than through a fixture that cannot exist.
    const input = recordWithOwnProtoField(7);
    const built = buildObjectSchemaValue(input, "Q", () => ({ fields: [{ name: "a" }] }));
    expect(
      Object.keys(built),
      'PRIMARY (bug 0119, cell G5 — the fallback write is a drop point of its own): a declaration naming only `a` sends the input\'s other own key through the fallback write at src/runtime/value.ts:408, so the rebuilt record must be ["a","__proto__"] — the declared field first, then the undeclared one in the input\'s own-key order. An assignment there observes ["a"]',
    ).toEqual(["a", "__proto__"]);
    expect(
      ownDescriptor(built as ThetaValue, "__proto__", "cell G5"),
      "bug 0119 §Fix route (b): the fallback write's descriptor matches the declared-fields write's, and an assignment's",
    ).toEqual({ value: 7, writable: true, enumerable: true, configurable: true });
    expect(
      Object.getPrototypeOf(built as object) === Object.prototype,
      "bug 0119 §Fix constraint: the fallback write defines the key rather than removing the prototype",
    ).toBe(true);
  });
});

// ===========================================================================
// (H) The OBJECT-valued field — where the assignment is a prototype write rather
// than a no-op. Through a constructor the mutation is contained by bug 0080's
// rebuild; route (b) must make the field readable AND keep that containment.
// ===========================================================================

describe("bug 0119 (H) — an object-valued `__proto__` field is data, not a prototype", () => {
  it("RED (H): the field reads back as the inner value", async () => {
    expect(
      await readOutcome(FM + SCHEMA_Q2 + CTOR_Q2 + "q.__proto__.i\n"),
      "PRIMARY (bug 0119, cell H — the declared field never landed): an object-valued declared field must be readable like any other. HEAD raises `missing object key: __proto__` — the assignment replaced the upstream record's PROTOTYPE with the inner value and bug 0080's rebuild then discarded that record",
    ).toEqual({ delivered: 1 });
  });

  it("RED (H, containment): the record carries the inner value and does NOT inherit from it", async () => {
    // The two halves are independent. That the field is an own key is the fix;
    // that the record's prototype stays `Object.prototype` and the record does
    // not inherit `i` is the containment route (b) must preserve — at HEAD it
    // holds only incidentally, because the rebuild discards the mutated record.
    const record = await finalValue(FM + SCHEMA_Q2 + CTOR_Q2 + "q\n", "cell H's record");
    expect(
      Object.keys(record as object),
      'PRIMARY (bug 0119, cell H): the object-valued field is an ordinary own key in declaration order. HEAD observes ["a"]',
    ).toEqual(["__proto__", "a"]);
    expect(
      Object.getPrototypeOf(record as object) === Object.prototype,
      "bug 0119 §Fix constraint: an object-valued declared field must never become the record's prototype — `defineProperty` cannot write one, which is the property this cell locks",
    ).toBe(true);
    expect(
      "i" in (record as object),
      "bug 0119 §Fix constraint: the record must not INHERIT the inner value's fields — a theta value's field set is its own keys",
    ).toBe(false);
    expect(
      schemaTagOf(
        (Object.getOwnPropertyDescriptor(record as object, "__proto__")?.value ??
          null) as ThetaValue,
      ),
      "the inner constructor's own brand survives as the field's value, so a nested QRY-18 render can still resolve `Inner`'s renames",
    ).toBe("Inner");
  });
});

// ===========================================================================
// (I) The Pi-tool argument seam — a HOST boundary with no rebuild downstream, so
// what the record is IS what the tool receives.
// ===========================================================================

describe("bug 0119 (I) — the Pi-tool argument record carries the field, not a prototype", () => {
  /** Drive one `grep({…})` call and return the argument object the tool got. */
  async function receivedArgs(src: string, what: string): Promise<object> {
    let received: unknown;
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (_id, params): Promise<AgentToolResultEnvelope> => {
        received = params;
        return Promise.resolve({ content: [{ type: "text", text: "done" }] });
      },
    });
    const outcome = await drive(src, resolvePiTool);
    if (outcome.kind === "threw") {
      throw new Error(
        `harness: ${what} must dispatch the Pi tool; the drive threw ${String(outcome.thrown)}`,
      );
    }
    if (received === undefined) {
      throw new Error(
        `harness: ${what}'s \`PiToolDispatch.execute\` never ran, so no argument object was recorded — the cell would assert nothing`,
      );
    }
    if (outcome.execution.result.value !== "done") {
      throw new Error(
        `harness: ${what} must unwrap the tool's Ok(text) so the recorded argument object is the lowered one; observed ${JSON.stringify(outcome.execution.result.value)}`,
      );
    }
    return received as object;
  }

  it("RED (I1): an OBJECT-valued field reaches the host as data on a plain object", async () => {
    // `preEvaluateToolArgs` (src/runtime/statement-executor.ts:352) writes the
    // argument record and has NO rebuild downstream, so the record it builds IS
    // what the host tool receives: an assignment there hands the tool an object
    // whose PROTOTYPE is a theta value. Every theta-side read is own-key-guarded,
    // so nothing in the language observes that; the host does. The key order
    // asserted is the bare literal's insertion order
    // (the argument object names no schema, so nothing may reorder it — bug
    // 0080's carve-out).
    const received = await receivedArgs(
      FM_GREP_TOOL +
        "schema Inner { i: integer }\n" +
        'let hits = grep({ a: "x", __proto__: Inner { i: 1 } })?\nhits\n',
      "cell I1",
    );
    expect(
      Object.keys(received),
      'PRIMARY (bug 0119, cell I1 — the declared field never landed): the tool must receive both argument fields as own keys in source order. HEAD observes ["a"]',
    ).toEqual(["a", "__proto__"]);
    expect(
      Object.getPrototypeOf(received) === Object.prototype,
      "PRIMARY (bug 0119, cell I1 — a prototype written across a host boundary): HEAD replaces the argument object's prototype with the theta value, so the host sees `\"i\" in received === true` for a field it was never sent. `defineProperty` cannot write a prototype",
    ).toBe(true);
    expect(
      "i" in received,
      "bug 0119: the host must not inherit the inner value's fields from the argument object",
    ).toBe(false);
    expect(
      ownDescriptor(received as ThetaValue, "__proto__", "cell I1"),
      "bug 0119 §Fix route (b): the tool-argument field is an ordinary own enumerable data property, descriptor-identical to an assignment's",
    ).toMatchObject({ writable: true, enumerable: true, configurable: true });
  });

  it("RED (I3): the pure-host lowering of the same call also carries the field", async () => {
    // The pure-host twin of the seam above, src/extension/production-theta-producer.ts:4016.
    // Its field loop runs only when `#resolveToolCall` is handed no
    // pre-evaluated argument record (`evaluatedToolArgs ?? lowerToolCallParams(…)`,
    // :3053), which the shipped executor never does for a Pi-tool call carrying
    // an object-literal first argument — `preEvaluateToolArgs` evaluates those
    // fields itself. The smallest exported reach is therefore the producer's own
    // host surface, called with `evaluatedToolArgs === undefined`, which is the
    // reach tests/tool-arg-shape-enforcement.test.ts uses to isolate this same
    // function. The expression driven is REAL parsed source, not a synthetic AST,
    // so the field name reaching the write is the one an author wrote.
    const src = FM_GREP_TOOL + 'grep({ a: "x", __proto__: 7 })\n';
    const doc = parseOnly(src);
    const errors = doc.diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        `harness: cell I3's fixture must parse clean; observed ${errors
          .map((d) => `${d.code}: ${d.message}`)
          .join("; ")}`,
      );
    }
    const tail = doc.body.tail;
    if (tail === null || tail.kind !== "call") {
      throw new Error(
        `harness: cell I3 drives the tail CALL expression through the producer's host surface; the parsed tail is ${String(tail === null ? "absent" : tail.kind)}`,
      );
    }

    let received: unknown;
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (_id, params): Promise<AgentToolResultEnvelope> => {
        received = params;
        return Promise.resolve({ content: [{ type: "text", text: "done" }] });
      },
    });
    const session = new LiveSessionDouble();
    const deps = createProductionProducerDeps({
      pi: livePi(session),
      root: rootLive(session),
      modelRegistry: registryDouble(),
      resolvePiTool,
    });
    const theta: ThetaCompositionInput = {
      slashName: "bug0119",
      sourcePath: FIXTURE_PATH,
      frontmatter: doc.frontmatter as ParsedFrontmatter,
      body: doc.body,
    };
    const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxLive(session) });
    const outcome = await binding.executeDeps.host.runEffect(
      tail as CallExpr,
      binding.executeDeps.env,
      undefined,
    );
    if (!outcome.ok) {
      throw new Error(
        `harness: cell I3's ordinary-path lowering must dispatch the tool; the effect failed with ${JSON.stringify(outcome.error)}`,
      );
    }
    if (received === undefined) {
      throw new Error(
        "harness: cell I3's `PiToolDispatch.execute` never ran, so no params object was recorded — the cell would assert nothing",
      );
    }

    expect(
      Object.keys(received as object),
      'PRIMARY (bug 0119, cell I3 — the declared field never landed): the pure-host lowering must put both argument fields on the params object as own keys in source order. An assignment there observes ["a"]',
    ).toEqual(["a", "__proto__"]);
    expect(
      (received as Record<string, unknown>)["__proto__"],
      "bug 0119: the pure-host lowering carries the field's value unchanged",
    ).toBe(7);
    expect(
      Object.getPrototypeOf(received as object) === Object.prototype,
      "bug 0119 §Fix route (b): the params object stays a plain object — `defineProperty` cannot write a prototype",
    ).toBe(true);
  });

  it("RED (I2, scalar control): a scalar-valued field reaches the host as data", async () => {
    // The scalar arm of the same seam: the inherited setter ignores a non-object
    // value, so an assignment leaves the key absent with no prototype write to
    // notice. Both arms must land the same own key.
    const received = await receivedArgs(
      FM_GREP_TOOL + 'let hits = grep({ a: "x", __proto__: 7 })?\nhits\n',
      "cell I2",
    );
    expect(
      Object.keys(received),
      'PRIMARY (bug 0119, cell I2 — the declared field never landed): the tool must receive both argument fields. HEAD observes ["a"]',
    ).toEqual(["a", "__proto__"]);
    expect(
      (received as Record<string, unknown>)["__proto__"],
      "bug 0119: the scalar field's value reaches the host unchanged",
    ).toBe(7);
  });
});

// ===========================================================================
// (J) Sibling-name controls — the general own-key guard must not be traded for a
// special case on one name.
// ===========================================================================

describe("bug 0119 (J) — fields named after other `Object.prototype` members are unaffected", () => {
  it("CONTROL (J): `constructor` / `toString` fields keep their declared positions and `has`", async () => {
    // These names are ordinary data properties because own-key assignment shadows
    // the inherited ones — no accessor is involved, so they were never dropped.
    // Green on both sides: a route that special-cased `__proto__` instead of
    // making every field write descriptor-defining would leave these alone, but a
    // route that reworked the guard could regress them, which is what this cell
    // catches.
    expect(
      await finalValue(
        FM +
          "schema R { constructor: integer, toString: string }\n" +
          'let r = R { toString: "x", constructor: 7 }\n' +
          '[r.keys(), r.values(), r.has("constructor")]\n',
        "cell J",
      ),
      "CONTROL (bug 0119, cell J): sibling `Object.prototype` names are conformant at HEAD (declaration order, both values, `has` true) and must stay conformant — the fix generalises the field write, it does not special-case one name",
    ).toEqual([
      ["constructor", "toString"],
      [7, "x"],
      true,
    ]);
  });
});

// ===========================================================================
// (K) The wire-rename witness — a field renamed `as "__proto__"` reaches the
// outbound wire-name write (src/extension/production-theta-producer.ts:6195)
// with no theta-side `__proto__` anywhere in the schema, and must appear in the
// render under that wire name: §Expected behaviour reads
// query-escapes-stringification.md:27 together with schemas.md:30 / :39 / :43,
// which admit an arbitrary non-empty wire-name string.
// ===========================================================================

describe('bug 0119 (K) — a field renamed `as "__proto__"` reaches the wire under that name', () => {
  it('RED (K): the QRY-18 render carries the renamed field as `"__proto__"`', async () => {
    // The theta-side value is complete and correctly ordered either way — a
    // rename lives on the wire side only (runtime-value-model.md:12) — so the
    // theta-side row here is a green-on-both-sides constraint and the rendered
    // bytes are the flip. Bug 0121 asks a different question about this same
    // write — whether the record's key ORDER is guaranteed at all for
    // integer-like wire names — and this cell neither asserts nor settles it:
    // defining a key leaves integer-like own-key ordering exactly where an
    // assignment does.
    const value = await finalValue(
      FM + SCHEMA_P_RENAMED + CTOR_P + "[p.keys(), p.values()]\n",
      "cell K's value",
    );
    expect(
      value,
      "CONTROL (bug 0119, cell K): the theta-side keys are the declared theta-side names in declaration order — the rename lives on the wire side only (runtime-value-model.md:12's object row), so this row is unmoved by the fix",
    ).toEqual([
      ["b", "a"],
      [1, "x"],
    ]);
    expect(
      await renderedTurn(FM + SCHEMA_P_RENAMED + CTOR_P + "@`J${p}`\n", "cell K"),
      'PRIMARY (bug 0119, cell K — the renamed field never landed on the wire): schemas.md:43 constrains a rename to a non-empty string literal and nothing more, and query-escapes-stringification.md:27 requires the render to be `JSON.stringify` of the value with wire-name translation applied, so `b as "__proto__"` must render J{"__proto__":1,"a":"x"}. HEAD sends J{"a":"x"}: `result[wireKey] = …` reaches the inherited `__proto__` setter at the outbound wire-name write',
    ).toBe('J{"__proto__":1,"a":"x"}');
  });
});

// ===========================================================================
// (L) The INLINE constructor — the pure host's own construction site
// (src/extension/production-theta-producer.ts:6284), which no other cell in
// this file reaches.
// ===========================================================================

describe("bug 0119 (L) — an inline constructor inside an interpolation carries the field", () => {
  it("RED (L): `@`J${Q { … }}`` renders both declared fields", async () => {
    // The constructor is written INLINE, with no intervening `let`: the query's
    // interpolation is a PURE expression, so it is evaluated by
    // `evaluatePureExpression`'s `case "object"` in the producer rather than by
    // the executor's `evalExpr` object arm that every other constructor cell
    // here drives (each of those binds the value with `let` first). The two arms
    // are separately implemented field loops over the same AST, so route (b) has
    // to reach both; this cell is the only witness for the producer's.
    expect(
      await renderedTurn(FM + SCHEMA_Q + '@`J${Q { a: "x", __proto__: 7 }}`\n', "cell L"),
      'PRIMARY (bug 0119, cell L — the declared field never landed): an inline constructor is built by the pure host (src/extension/production-theta-producer.ts:6284), whose field write must define rather than assign, so this renders J{"__proto__":7,"a":"x"}. An assignment there sends J{"a":"x"}',
    ).toBe('J{"__proto__":7,"a":"x"}');
  });
});
