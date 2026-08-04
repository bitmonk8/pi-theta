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
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { evaluateObjectMember } from "../src/runtime/stdlib-object";
import { brandSchemaValue, schemaTagOf, type ThetaValue } from "../src/runtime/value";
import {
  createProductionProducerDeps,
  type PiToolDispatch,
} from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";

// Bug 0080 — `keys()` / `values()` on a named-schema value, and the QRY-18
// outbound JSON built from the same record, follow the CONSTRUCTOR's field order
// instead of the schema's DECLARATION order. Both constructor evaluation sites
// build a fresh `{}` by walking the parsed `ObjectExpr.fields` array — source
// order at the call site — so the declaring schema's field order is never
// consulted even though both sites resolve that schema on the next line to
// decide whether to brand
// (docs/bugs/0080-keys-values-construction-order-not-declaration-order.md).
//
// SPEC ANCHORS (each verified against the corpus in this tree).
//   - docs/spec_topics/expressions.md, §"Built-in methods and properties", the
//     `object` member table: `keys()` — "Theta-side field names, in schema
//     declaration order for named schemas; insertion order otherwise";
//     `values()` — "Field values in the same order as `keys()`".
//   - the same page, §"Object construction": "Every declared field of the schema
//     must be present …; extra fields are `theta/parse/extra-object-field`;
//     field order is irrelevant". That sentence is what makes the two orders
//     differ, and what tells the author the constructor's order carries no
//     meaning.
//   - docs/reference/grammar.md mirrors the clause in its `object` stdlib line:
//     "declaration order for named schemas); `values(): array<T>`".
//   - docs/spec_topics/query/query-escapes-stringification.md, QRY-18's
//     Schema-typed-object row: "`JSON.stringify` of the value, **compact** (no
//     pretty-printing), with wire-name translation applied recursively" — the
//     stringify walks the same record, so the constructor's order is what the
//     model reads.
//   - docs/spec_topics/runtime-value-model.md, the object-schema row: "JS plain
//     object keyed by **theta-side names**, regardless of any wire-name renames
//     declared on the schema". It says nothing about order, so the expressions.md
//     `keys()` row is the sole ordering authority.
//
// FIXED CONTRACT pinned by this file (bug 0080 §Fix option 1, "Order at
// construction", the settled route): at BOTH constructor evaluation sites, when
// `env.resolveSchema(expr.typeName)` resolves, fields are assigned in the
// DECLARED schema's field order, falling back to `expr.fields` order for names
// the schema does not declare. Every downstream consumer then observes
// declaration order with no further change: `evaluateObjectMember`'s `case
// "keys"` / `case "values"` arms (src/runtime/stdlib-object.ts) return
// `Object.keys` / `Object.values` verbatim, and `translateInterpolationOutbound`
// (src/extension/production-theta-producer.ts) walks `Object.entries(value)`.
// Options 2 ("order at read") and 3 ("amend the spec") are rejected, so no
// diagnostic code, no DIAG-2 registry row, and no spec page changes: the fix
// makes the implementation conform to prose that already ships.
// tests/fixtures/h7a/permitted-codes.json is therefore untouched — this fix emits
// nothing new on any channel.
//
// THE LOCKSTEP OBLIGATION. Two sites establish the key order and must not drift
// (the same obligation bug 0027 records for the four read entry points):
//   1. `evalExpr`'s `if (expr.kind === "object")` arm in
//      src/runtime/statement-executor.ts. A `let` RHS composite literal is
//      decomposed on the executor path — never on the sync pure host — so every
//      `let`-bound constructor lands here (see the comment above that arm:
//      "Composite literals are decomposed on the executor path (not the sync
//      pure host) …"). Rows A, B, C, D, F, F2, G drive it.
//   2. `evaluatePureExpression`'s `case "object"` in
//      src/extension/production-theta-producer.ts, reached from
//      `stringifyInterpolation` → `evaluatePureExpression(parsed, env)` when the
//      constructor is written INLINE inside a `${…}` interpolation. Row L is the
//      only row that reaches it and is MANDATORY: a fix applied to site 1 alone
//      leaves L red.
//
// PRE-FIX BASELINE, re-derived at HEAD a410f727 / 0.69.0 with the drive below
// (offline: parse → `createProductionProducerDeps` → `bindPromptConversation` →
// `executeBody`, reading the body's final value and the text handed to
// `pi.sendUserMessage`). Every row's failure message names its own observation,
// so a red reads as "declaration order not observed", never as an unrelated
// error:
//   A   [p.keys(), p.values()] over P { a: "x", b: 1 }   → [["a","b"],["x",1]]
//   B   control, ctor in declaration order               → [["b","a"],[1,"x"]]
//   C   @`J${p}` over the same binding                   → J{"a":"x","b":1}
//   D   nested Outer { o: Inner { j: 2, i: 1 } }         → J{"o":{"j":2,"i":1}}
//   L   @`J${P { a: "x", b: 1 }}` (INLINE ctor)          → J{"a":"x","b":1}
//   O   renamed field `b as "B"`                         → J{"a":"x","B":1}
//   F   `__proto__`-named field                          → [["a"],["x"]]
//   F2  `constructor` / `toString`-named fields          → [["toString","constructor"],["x",7],true]
//   G   `__thetaSchema`-named field                      → [["z","__thetaSchema"],[1,"mine"]]
//   J   an extra ctor field                              → parse ["error theta/parse/extra-object-field"]
//   K   an unresolved ctor name                          → parse ["error theta/parse/unresolved-named-type"]
//   E   p == q over the two ctor orders                  → true
//   N   a bare Pi-tool argument object                   → received keys ["a","b"] (source order), unbranded
//
// RESIDUAL, pinned rather than fixed (row F). A field literally named
// `__proto__` is SILENTLY DROPPED at construction with no diagnostic:
// `obj[field.name] = value` invokes the inherited `__proto__` setter, which
// ignores a non-object value, so the record ends up with the other fields only
// and its prototype intact. That is a pre-existing defect of the record-building
// idiom, reported separately; row F pins HEAD's behaviour so this fix neither
// worsens it nor corrupts the record while reordering. Should the implementer
// null-prototype the record (the 0031/0038 hazard-class remedy), row F is the one
// cell to update, against that report — not this one.
//
// HARNESS. The drive is the shape bug 0079's witness established
// (tests/interpolated-result-gate.test.ts): `LiveSessionDouble` records every
// `pi.sendUserMessage` argument, appends the user entry, and `tick()`s the
// assistant reply from the injected Clock's `setTimeout`; `ctx.sessionManager`
// answers an EMPTY entry list because the observable is the send seam, not the
// transcript. An UNTYPED prompt-mode query never dispatches `complete()`, so no
// provider and no model is involved. `resolvePiTool` is threaded through
// `createProductionProducerDeps` for row N exactly as
// tests/conformance/production-conformance.test.ts's `producer(resolvePiTool)`
// threads it. Both files are reused as patterns; neither is modified.

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
const FIXTURE_PATH = "/theta/bug0080.theta";

function parseOnly(src: string): ThetaDocument {
  const source: ThetaSource = { path: FIXTURE_PATH, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}

/** `severity code` for every diagnostic the parse aggregated, in emission order. */
function severityCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

const FM = "---\nmode: prompt\n---\n";

/** Frontmatter for row N, whose bare object literal is a Pi-tool argument. */
const FM_GREP_TOOL = "---\nmode: prompt\ntools:\n  - grep\n---\n";

// ===========================================================================
// The DIAG-4 oracle. Rows J and K assert diagnostic CODES, and read the registry
// to prove each asserted code is a registered one — a renamed or invented code
// must not pass by matching a string this file made up.
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
 * Assert `code` has a row in the DIAG-2 registry. A missing row fails LOUDLY:
 * the registry is this file's only code oracle, so its absence is a harness
 * failure, never a skip.
 */
function assertRegistered(code: string): void {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: no registry row for ${code} in docs/spec_topics/diagnostics/ — rows J and K assert registered codes, so a missing row is a harness failure, never a skip`,
    );
  }
}

// ===========================================================================
// Production-composition drive harness (the tests/interpolated-result-gate.test.ts
// shape). One untyped prompt-mode query issues ONE streamed user turn whose
// content IS the QRY-18 rendered template; the injected Clock's `setTimeout`
// ticks the session double, completing the turn with the scripted reply.
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
 * the observable under test is the final value and the text handed to
 * `pi.sendUserMessage`, not the transcript.
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
 * Parse + drive one prompt-mode theta through the production binding against the
 * live session double. Fails LOUDLY when the fixture stops parsing or the
 * binding is not the live prompt-mode one — every drive fixture here is
 * parse-clean at HEAD, and a fixture that no longer parses can neither pass nor
 * fail its cell for the right reason.
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
    slashName: "bug0080",
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
 * The body's final value. A throw or a non-success outcome fails LOUDLY — an
 * ordering cell can only be read off a value the drive actually produced.
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
 * The theta-visible key list of an object-schema value, read off the value the
 * drive produced. A non-object value fails LOUDLY rather than yielding an empty
 * list that would pass a key-set assertion vacuously.
 */
function ownKeys(value: ThetaValue, what: string): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`harness: ${what} must be an object-schema value; got ${JSON.stringify(value)}`);
  }
  return Object.keys(value);
}

// ===========================================================================
// Fixture prologues.
// ===========================================================================

/** `b` is DECLARED first; every row below constructs it second. */
const SCHEMA_P = "schema P { b: integer, a: string }\n";
/** The constructor whose source order contradicts the declaration. */
const CTOR_P_REVERSED = 'let p = P { a: "x", b: 1 }\n';
/** The tail expression that reads both ordering surfaces at once. */
const READ_KEYS_VALUES = "[p.keys(), p.values()]\n";

// ===========================================================================
// (A) Site 1 — the executor's constructor arm, read through `keys()` / `values()`.
// ===========================================================================

describe("bug 0080 (A) — `keys()` / `values()` follow the schema's declaration order", () => {
  it("RED (A): a constructor written out of declaration order still answers declaration order", async () => {
    // The bug's §Reproduction, verbatim. `keys()` and `values()` are the only
    // object iteration surface theta 1.0 exposes, so this is the order a
    // `for k in p.keys()` loop visits.
    const value = await finalValue(FM + SCHEMA_P + CTOR_P_REVERSED + READ_KEYS_VALUES, "row A");
    expect(
      value,
      'PRIMARY (bug 0080, row A — declaration order not observed): `schema P { b: integer, a: string }` declares `b` first, and expressions.md\'s `object` table fixes `keys()` as "Theta-side field names, in schema declaration order for named schemas" with `values()` "in the same order as `keys()`". Constructing `P { a: "x", b: 1 }` — an order the same page\'s §"Object construction" calls irrelevant — observed [["a","b"],["x",1]] at HEAD 0.69.0, i.e. the CONSTRUCTOR\'s order, because `evalExpr`\'s `if (expr.kind === "object")` arm (src/runtime/statement-executor.ts) assigns over `expr.fields` and never consults the schema it resolves on the next line to decide branding',
    ).toEqual([
      ["b", "a"],
      [1, "x"],
    ]);
  });

  it("RED (A, key-set integrity): reordering drops no key and duplicates none", async () => {
    // Order alone is a weak assertion: a mangled reorder that emitted `["b","b"]`
    // or dropped `a` could satisfy an order-only check on some other fixture.
    // The key SET and the key COUNT are asserted alongside the order so the
    // record's contents are pinned independently of their sequence — the bug's
    // §Fix constraint: "reordering must not drop or duplicate a key".
    const value = await finalValue(FM + SCHEMA_P + CTOR_P_REVERSED + "p\n", "row A's value");
    const keys = ownKeys(value, "row A's value");
    expect(
      [...keys].sort(),
      "bug 0080 §Fix constraint: the reordered record's key SET is exactly the declared theta-side names (HEAD: the same set, in constructor order)",
    ).toEqual(["a", "b"]);
    expect(
      keys.length,
      `bug 0080 §Fix constraint: exactly one key per declared field, no duplicate. Observed ${JSON.stringify(keys)}`,
    ).toBe(2);
    expect(
      keys,
      'PRIMARY (bug 0080, row A): the record\'s own key order IS what `Object.keys` / `Object.values` / `JSON.stringify` all report, so declaration order has to be established at construction. HEAD observes ["a","b"]',
    ).toEqual(["b", "a"]);
  });

  it("CONTROL (B): a constructor already in declaration order is unchanged", async () => {
    // The control that proves the result tracks the constructor rather than the
    // schema at HEAD: the two orders coincide here, so this cell is green on both
    // sides of the fix. A fix that reorders by anything other than the
    // declaration (a sort, say) reds here immediately.
    const value = await finalValue(
      FM + SCHEMA_P + 'let p = P { b: 1, a: "x" }\n' + READ_KEYS_VALUES,
      "row B",
    );
    expect(
      value,
      "CONTROL (bug 0080, row B): with the constructor written in declaration order the two orders coincide, so this row is correct at HEAD and must stay correct — the fix reorders to the DECLARATION, not to some other order",
    ).toEqual([
      ["b", "a"],
      [1, "x"],
    ]);
  });
});

// ===========================================================================
// (C) Site 1 — the same record, through the QRY-18 outbound render.
// ===========================================================================

describe("bug 0080 (C) — the QRY-18 outbound JSON carries declaration order", () => {
  it("RED (C): interpolating a `let`-bound value renders its fields in declaration order", async () => {
    // `translateInterpolationOutbound` (src/extension/production-theta-producer.ts)
    // walks `Object.entries(value)`, so the wire JSON inherits the construction
    // order verbatim. Field order is a real prompt-engineering input — the model
    // reads the object left to right — and at HEAD it varies with an incidental
    // detail of the constructor's source text.
    const turn = await renderedTurn(FM + SCHEMA_P + CTOR_P_REVERSED + "@`J${p}`\n", "row C");
    expect(
      turn,
      'PRIMARY (bug 0080, row C — declaration order not observed on the wire): QRY-18\'s Schema-typed-object row renders compact `JSON.stringify` of the record, and the record is built in constructor order, so HEAD sends J{"a":"x","b":1} to the model for a schema that declares `b` first',
    ).toBe('J{"b":1,"a":"x"}');
  });

  it("RED (D): a NESTED constructor's own declaration order reaches the wire too", async () => {
    // The outbound walk recurses, so the inner constructor's order wins at every
    // nesting level. This row pins that the fix applies to the nested
    // construction as well as the outer one — both are the same `evalExpr` arm,
    // reached recursively.
    const turn = await renderedTurn(
      FM +
        "schema Inner { i: integer, j: integer }\n" +
        "schema Outer { o: Inner }\n" +
        "let v = Outer { o: Inner { j: 2, i: 1 } }\n" +
        "@`J${v}`\n",
      "row D",
    );
    expect(
      turn,
      'PRIMARY (bug 0080, row D — nested declaration order not observed): `Inner` declares `i` before `j`; HEAD sends J{"o":{"j":2,"i":1}} because the inner constructor\'s source order is what `evalExpr`\'s object arm recorded and `translateInterpolationOutbound` recursed over',
    ).toBe('J{"o":{"i":1,"j":2}}');
  });

  it("RED (O): a RENAMED field keeps its wire name and takes its declared position", async () => {
    // The renamed-field row separates the two independent transformations the
    // outbound walk applies: `b as "B"` renames theta→wire (runtime-value-model.md
    // §Wire-name translation, driven by the construction-time brand), and bug 0080
    // reorders. A fix that reordered by WIRE name, or that rebuilt the record and
    // lost the brand, would break the rename — so this cell pins both at once.
    const turn = await renderedTurn(
      FM + 'schema P { b as "B": integer, a: string }\n' + CTOR_P_REVERSED + "@`J${p}`\n",
      "row O",
    );
    expect(
      turn,
      'PRIMARY (bug 0080, row O — declaration order not observed for a renamed field): HEAD sends J{"a":"x","B":1} — the rename is applied (so the brand survives construction) but the position is the constructor\'s. The declared order is `b as "B"` first, so the wire key `B` leads',
    ).toBe('J{"B":1,"a":"x"}');
  });
});

// ===========================================================================
// (L) Site 2 — THE SECOND CONSTRUCTION SITE. The only row that reaches
// `evaluatePureExpression`'s `case "object"` in
// src/extension/production-theta-producer.ts. A fix applied to the executor arm
// alone leaves this cell red; that is the lockstep obligation, witnessed.
// ===========================================================================

describe("bug 0080 (L) — the pure host's constructor arm (SECOND SITE) orders by declaration too", () => {
  it("RED (L): a constructor written INLINE inside an interpolation renders declaration order", async () => {
    // An interpolation source is re-parsed and evaluated by the module-private
    // pure evaluator (`stringifyInterpolation` → `evaluatePureExpression`), never
    // by the executor — so the constructor here is built by the SECOND site,
    // whose `case "object"` runs the identical `for (const field of expr.fields)`
    // loop under the identical brand condition. Row C is this row's site-1 twin:
    // the two must agree byte for byte.
    const turn = await renderedTurn(FM + SCHEMA_P + '@`J${P { a: "x", b: 1 }}`\n', "row L");
    expect(
      turn,
      'PRIMARY (bug 0080, row L — SECOND CONSTRUCTION SITE, declaration order not observed): the inline constructor is built by `evaluatePureExpression`\'s `case "object"` (src/extension/production-theta-producer.ts), which walks `expr.fields` exactly as the executor arm does, so HEAD sends J{"a":"x","b":1}. If row C is green and this row is red, the fix landed at ONE of the two constructor sites and they have drifted',
    ).toBe('J{"b":1,"a":"x"}');
  });
});

// ===========================================================================
// (G) / (F2) / (F) — JS-hostile field names. The record must be reordered
// without disturbing the symbol brand (bug 0026) or the record's prototype.
// ===========================================================================

describe("bug 0080 (G) — a field named `__thetaSchema` reorders like any other, and the brand survives", () => {
  it("RED (G): the `__thetaSchema`-named field takes its declared position", async () => {
    // Bug 0026's shape: `__thetaSchema` is an ordinary string-keyed field, and the
    // brand `brandSchemaValue` installs occupies a module-private SYMBOL that no
    // declared field can ever occupy. Reordering must move the string key and
    // leave the symbol alone.
    const value = await finalValue(
      FM +
        "schema S { __thetaSchema: string, z: integer }\n" +
        'let s = S { z: 1, __thetaSchema: "mine" }\n' +
        "[s.keys(), s.values()]\n",
      "row G",
    );
    expect(
      value,
      'PRIMARY (bug 0080, row G — declaration order not observed): `S` declares `__thetaSchema` first. HEAD observes [["z","__thetaSchema"],[1,"mine"]] — constructor order. The field is an ordinary string key (bug 0026), so it reorders like any other field',
    ).toEqual([
      ["__thetaSchema", "z"],
      ["mine", 1],
    ]);
  });

  it("RED (G, brand integrity): the reordered record still recovers its declaring schema, non-enumerably", async () => {
    // The bug's §Fix constraint, at the seam: "the brand install
    // (`brandSchemaValue`) must still target a value whose *string* keys are
    // exactly the declared theta-side names, so bug 0026's `__thetaSchema`-named
    // field case stays intact; reordering must not drop or duplicate a key."
    // (quoted from the report: "so bug 0026's `__thetaSchema`-named-field case
    // stays intact"). `schemaTagOf` is the only reader of that brand and is what
    // QRY-18's outbound walk resolves the rename map from, so a reorder that
    // rebuilt the record and lost the brand silently disables wire-name
    // translation.
    const value = await finalValue(
      FM +
        "schema S { __thetaSchema: string, z: integer }\n" +
        'let s = S { z: 1, __thetaSchema: "mine" }\n' +
        "s\n",
      "row G's value",
    );
    expect(
      schemaTagOf(value),
      "bug 0080 §Fix constraint: the reordered record still carries the declaring-schema brand — `schemaTagOf` is what `translateInterpolationOutbound` resolves the theta→wire rename map from",
    ).toBe("S");
    const record = value as object;
    const symbols = Object.getOwnPropertySymbols(record);
    expect(
      symbols.length,
      `bug 0026: exactly one symbol-keyed own property — the brand. Observed ${symbols.length}`,
    ).toBe(1);
    expect(
      Object.getOwnPropertyDescriptor(record, symbols[0] as symbol)?.enumerable,
      "bug 0026: the brand is NON-ENUMERABLE, so it never appears in the theta-visible key walk and never reaches the wire JSON",
    ).toBe(false);
    const keys = ownKeys(value, "row G's value");
    expect(
      [...keys].sort(),
      'bug 0080 §Fix constraint: the string keys are exactly the declared theta-side names — the `__thetaSchema` field is data, not the brand',
    ).toEqual(["__thetaSchema", "z"]);
    expect(
      keys.length,
      `bug 0080 §Fix constraint: no duplicated key. Observed ${JSON.stringify(keys)}`,
    ).toBe(2);
    expect(
      keys,
      'PRIMARY (bug 0080, row G): HEAD observes ["z","__thetaSchema"] — constructor order — where the declaration is `__thetaSchema` then `z`',
    ).toEqual(["__thetaSchema", "z"]);
  });
});

describe("bug 0080 (F2) — fields named after `Object.prototype` members reorder too", () => {
  it("RED (F2): `constructor` / `toString` fields take their declared positions, and `has` is unaffected", async () => {
    // Own-key assignment shadows the inherited names, so these are ordinary
    // string-keyed fields the reorder must move like any other. `has("constructor")`
    // rides along as the non-goal control: the bug's §Non-goals excludes `has(k)`,
    // whose `Object.prototype.hasOwnProperty.call` (src/runtime/stdlib-object.ts,
    // `case "has"`) is order-independent and must stay `true` here.
    const value = await finalValue(
      FM +
        "schema R { constructor: integer, toString: string }\n" +
        'let r = R { toString: "x", constructor: 7 }\n' +
        '[r.keys(), r.values(), r.has("constructor")]\n',
      "row F2",
    );
    expect(
      value,
      'PRIMARY (bug 0080, row F2 — declaration order not observed): `R` declares `constructor` before `toString`; HEAD observes [["toString","constructor"],["x",7],true] — constructor order, with `has` already conformant',
    ).toEqual([
      ["constructor", "toString"],
      [7, "x"],
      true,
    ]);
  });
});

describe("bug 0080 (F) — the `__proto__`-named field: a pinned residual, not a fix target", () => {
  it("CONTROL (F): the `__proto__` field stays silently dropped, and the record's prototype stays intact", async () => {
    // WHY PINNED RATHER THAN FIXED: `obj[field.name] = value` in both constructor
    // arms invokes `Object.prototype`'s inherited `__proto__` SETTER, which
    // ignores a non-object value — so the field never becomes an own key and no
    // diagnostic is emitted. That drop is a pre-existing defect of the
    // record-building idiom (the 0031/0038 null-prototype hazard class), reported
    // separately from bug 0080 as a residual; this fix must neither worsen it nor
    // corrupt the record while reordering. Reordering the assignments cannot
    // change the outcome, so this cell is green on both sides. Should the
    // implementer null-prototype the record, THIS cell is the one to update —
    // against the residual report, not against bug 0080.
    const value = await finalValue(
      FM +
        "schema Q { __proto__: integer, a: string }\n" +
        'let q = Q { a: "x", __proto__: 7 }\n' +
        "[q.keys(), q.values()]\n",
      "row F",
    );
    expect(
      value,
      'CONTROL (bug 0080, row F — pinned residual): HEAD parses this source with NO diagnostic and observes [["a"],["x"]] — the `__proto__` field is silently dropped by the inherited setter. The bug-0080 reorder must leave that unchanged',
    ).toEqual([["a"], ["x"]]);
    const record = await finalValue(
      FM +
        "schema Q { __proto__: integer, a: string }\n" +
        'let q = Q { a: "x", __proto__: 7 }\n' +
        "q\n",
      "row F's value",
    );
    expect(
      Object.getPrototypeOf(record as object) === Object.prototype,
      "bug 0080 §Fix constraint (must not corrupt the record): the dropped `__proto__` assignment left the record an ordinary plain object, and the reorder must keep it one",
    ).toBe(true);
    expect(
      schemaTagOf(record),
      "the record is still branded with its declaring schema even though one declared field never landed",
    ).toBe("Q");
  });
});

// ===========================================================================
// (J) / (K) — the parse rejections that make the undeclared-name fallback
// DEFENSIVE. Both are green on each side of the fix; pinned so the fallback is
// never mistaken for a reachable path.
// ===========================================================================

describe("bug 0080 (J, K) — the rejected constructors the fallback is defensive against", () => {
  it("CONTROL (J): a field the schema does not declare is still a parse error", async () => {
    // bug 0080 §Fix option 1: the fix falls back to `expr.fields` order "for
    // names the schema does not declare — an already-rejected case, so the
    // fallback is defensive". This cell is the evidence for "already-rejected":
    // an undeclared name never reaches construction.
    assertRegistered("theta/parse/extra-object-field");
    const doc = parseOnly(FM + SCHEMA_P + 'let p = P { a: "x", b: 1, c: 3 }\n' + "p\n");
    expect(
      severityCodes(doc),
      "CONTROL (bug 0080, row J): an extra constructor field is `theta/parse/extra-object-field` (expressions.md §\"Object construction\"), so the declaration-order walk never meets a name the schema does not declare",
    ).toEqual(["error theta/parse/extra-object-field"]);
  });

  it("CONTROL (K): an unresolved constructor name is still a parse error (bug 0025 passthrough)", async () => {
    // The other half of "the schema resolves": both constructor arms brand only
    // when `env.resolveSchema(expr.typeName) !== undefined`, and the reorder is
    // gated on the same resolution. A constructor naming no schema is refused at
    // load, so the unresolved case never reaches either arm.
    assertRegistered("theta/parse/unresolved-named-type");
    const doc = parseOnly(FM + 'let p = NoSuchSchema { a: "x", b: 1 }\n' + "p\n");
    expect(
      severityCodes(doc),
      "CONTROL (bug 0080, row K): an unresolved constructor name is `theta/parse/unresolved-named-type` (bug 0025, fixed 0.37.0), so the reorder's `resolveSchema` gate has nothing to fall through for",
    ).toEqual(["error theta/parse/unresolved-named-type"]);
  });
});

// ===========================================================================
// (E) / (N) / (S) — the explicit NON-GOALS. Green on both sides; each is a
// property a reorder could plausibly break.
// ===========================================================================

describe("bug 0080 (E, N, S) — non-goals: equality, bare objects, and the read seam", () => {
  it("CONTROL (E): equality stays order-insensitive", async () => {
    // bug 0080 §Non-goals: "Not about equality, which is order-insensitive by
    // spec and is implemented order-insensitively (`valuesEqual`,
    // src/runtime/value.ts)." Pinned THROUGH the drive rather than by calling
    // `valuesEqual` directly, so it holds for whatever records the fix builds.
    // §Why it matters (3) is the reason this must not become order-sensitive: the
    // two values are `==` at HEAD while rendering as different bytes, and the fix
    // closes that gap by fixing the bytes, not by narrowing equality.
    const value = await finalValue(
      FM +
        SCHEMA_P +
        CTOR_P_REVERSED +
        'let q = P { b: 1, a: "x" }\n' +
        "p == q\n",
      "row E",
    );
    expect(
      value,
      "CONTROL (bug 0080, row E): two values of the same schema whose constructors write the fields in opposite orders compare `==` — true at HEAD, and the reorder must not make equality order-sensitive",
    ).toBe(true);
  });

  it("CONTROL (N): a BARE object value keeps INSERTION order — a Pi-tool argument", async () => {
    // bug 0080 §Non-goals: "Not about anonymous / bare object values, where
    // 'insertion order otherwise' is what the implementation already does
    // correctly." expressions.md §"Object construction" admits a bare object
    // literal in exactly two positions — a `params:` default and a Pi-tool
    // argument — and only the second admits full expressions. The first is also
    // unreachable as a witness at this HEAD: a fixture whose `params:` default is
    // a bare object literal (`cfg: P = { b: 1, a: "x" }`) fails the frontmatter
    // read outright (`theta/load/missing-mode` plus one
    // `theta/parse/unknown-identifier` per use of the bound name), so it never
    // reaches a drive. `preEvaluateToolArgs` (src/runtime/statement-executor.ts)
    // builds the argument object by walking the argument literal's own `fields`
    // and never consults `typeName`; a bare literal's `typeName` is null, so no
    // declaring schema is resolvable for it and nothing may reorder it —
    // asserted with a `schema P { b, a }` DECLARED IN SCOPE whose
    // field names are exactly the argument's, which is the input a reorder keyed
    // on names rather than on the constructor's resolved schema would scramble.
    let received: unknown;
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (_id, params): Promise<AgentToolResultEnvelope> => {
        received = params;
        return Promise.resolve({ content: [{ type: "text", text: "done" }] });
      },
    });
    const outcome = await drive(
      FM_GREP_TOOL + SCHEMA_P + 'let hits = grep({ a: "x", b: 1 })?\nhits\n',
      resolvePiTool,
    );
    if (outcome.kind === "threw") {
      throw new Error(
        `harness: row N must dispatch the Pi tool; the drive threw ${String(outcome.thrown)}`,
      );
    }
    if (received === undefined) {
      throw new Error(
        "harness: row N's `PiToolDispatch.execute` never ran, so no argument object was recorded — the cell would assert nothing",
      );
    }
    expect(
      schemaTagOf(received as ThetaValue),
      "row N's precondition: a bare object literal names no schema, so `expr.typeName` is null and the argument object carries no declaring-schema brand — nothing identifies a declaration order for it",
    ).toBeUndefined();
    expect(
      Object.keys(received as object),
      'CONTROL (bug 0080, row N): the anonymous argument object keeps SOURCE order ["a","b"] (expressions.md: "insertion order otherwise"), even though a schema declaring `b` before `a` is in scope. A reorder keyed on field NAMES rather than on the constructor\'s resolved schema reds here',
    ).toEqual(["a", "b"]);
    expect(
      outcome.execution.result.value,
      "row N's guard: the tool really dispatched and `?` unwrapped its Ok(text), so the recorded argument object is the lowered one",
    ).toBe("done");
  });

  it("CONTROL (S): the READ seam reports the record's own key order verbatim", async () => {
    // WHY THIS CELL EXISTS: it is the evidence for the settled route. bug 0080
    // §Fix option 2 ("order at read") would have `evaluateObjectMember` sort by
    // the brand; option 1 orders at construction instead. This cell pins that the
    // read seam is a faithful mirror of the record — `case "keys"` returns
    // `Object.keys(receiver)` and `case "values"` returns `Object.values(receiver)`
    // (src/runtime/stdlib-object.ts) — so construction is the ONLY place the order
    // can come from, and it pins that a branded record reads identically to an
    // unbranded one (the brand is non-enumerable, so it is invisible here).
    // Green on both sides: the fix changes construction, not this seam.
    const declared: { [key: string]: ThetaValue } = { b: 1, a: "x" };
    const branded = brandSchemaValue(declared, "P");
    expect(
      schemaTagOf(branded as ThetaValue),
      "harness precondition: the seam receiver really is branded, so the cell speaks about a named-schema value",
    ).toBe("P");
    expect(
      evaluateObjectMember(branded, "keys", []),
      "the read seam returns the record's own key order verbatim — it neither consults the brand nor sorts, which is why bug 0080's order must be established at construction",
    ).toEqual(["b", "a"]);
    expect(
      evaluateObjectMember(branded, "values", []),
      "`values()` is `Object.values` of the same record, so it is order-correlated with `keys()` by construction",
    ).toEqual([1, "x"]);
  });
});
