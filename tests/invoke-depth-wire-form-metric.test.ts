// Bug 0202 — `#validateInvokeReturn` hands `enforceInvokeReturnDepth` the raw
// theta value, so `depthWalk` counts the boxed-`String` enum carrier's
// character indices as a nesting level (`Object.keys(new String("red"))` is
// `["0","1","2"]`), and a typed `invoke<array<array<array<array<Colour>>>>>` of
// a prompt-mode callee whose tail is `[[[[Colour.Red]]]]` — wire form
// `[[[["red"]]]]`, JSON-document depth 5, which the cap admits — binds
// `Err(InvokeInfraError { cause: "return_validation", message: "JSON document
// depth exceeds 5" })`, a message false of the value it names
// (`docs/bugs/0202-parent-depth-walk-counts-carrier-not-wire-depth.md`).
//
// SPEC. `docs/spec_topics/schema-subset.md:13` fixes ceiling #4's cap over "≤ 5
// levels of nesting at runtime (the JSON document depth, not the schema
// graph)"; `:22` restates it as "a property of the **runtime JSON value**";
// `:24–30` is the counting algorithm, whose rules range over JSON values alone
// — "A scalar (`string`, `number`, `integer`, `boolean`, `null`) has depth `1`"
// (`:26`), "An empty object `{}` or empty array `[]` has depth `1`" (`:27`), "A
// non-empty object or array has depth `1 + max(depth(child))` over its members
// or elements" (`:28`), "`anyOf` arms are not levels: depth is measured against
// the **materialised** value at runtime" (`:29`), "The cap is `depth ≤ 5`"
// (`:30`). No rule names a host representation, and `string` is in `:26`'s
// scalar list. `:39` names the five enforcement points, `:45` is point 5 (the
// `invoke<T>` return-value boundary) and `:47` fixes the walk as "a cheap
// fast-fail" that runs "**before** AJV at each site".
// `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:19` names ceiling #4 as
// "the JSON-document depth-5 ceiling against the five enforcement points",
// `:27` is the `invoke<T>` return-value row (destination *invoke parent*,
// carrier `Err(InvokeInfraError { cause: "return_validation", … })`) and `:41`
// is CIO-3, fixing the depth walk as "the first sub-check at every AJV
// validation boundary". `docs/spec_topics/runtime-value-model.md:13` (the
// enum-variant row) fixes that the tag "MUST NOT appear in JSON output
// (`JSON.stringify` of an enum value yields the bare wire string)", and `:16`
// records the boxed-`String` carrier as the non-normative reference encoding,
// an implementation detail that "neither is reachable from theta code, neither
// appears in any wire schema". `docs/spec_topics/invocation.md:36` fixes the
// return surface as mode-invariant: "A `prompt`-mode child attaches to the
// caller's current conversation, but the final value still propagates through
// the same return surface."
//
// THE CELL UNDER TEST, AND WHY THE HARNESS IS SHAPED THIS WAY. The gap opens
// only where no serialisation intervenes between the callee's own value and the
// depth gate: the prompt→prompt ATTACH cell inside `#driveCallee`, whose
// terminal value reaches `#validateInvokeReturn`
// (`src/extension/production-theta-producer.ts:3679`) unprojected. That method
// calls `enforceInvokeReturnDepth(calleePath, result.value as unknown)` at
// `:3693` — the interpreter's own value — and reaches
// `projectForValidation(result.value)` only at `:3706`, for the AJV call. The
// (b) cells therefore drive the real path end to end: `parseThetaDocument` →
// `createProductionProducerDeps({ parseCallee })` → `bindPromptConversation` →
// `executeBody`, with a REAL `AjvSchemaValidator`
// (`src/seams/schema-validator.ts:104`) on the runtime root — the harness shape
// `tests/invoke-return-enum-carrier-projection.test.ts` (bug 0174's shipped
// witness over this same method) uses. Both fixtures are `mode: prompt` and
// both declare `enum Colour { Red = "red" }`, because an `invoke<T>` annotation
// is the CALLER's and `#resolveReturnSite` (`:3616`) resolves it against the
// caller's own body. Every enum value below comes from real theta source
// (`Colour.Red`) or from `makeEnumValue` (`src/runtime/value.ts:135`); no cell
// hand-builds a box, so no cell can pass against a carrier the runtime does not
// actually mint. The (a) / (d) cells drive the shipped seams directly, where the
// verdict is observable without a caller.
//
// WHAT IS RED HERE, AND WHY. Four cells red on the bug's own symptom — a
// refusal carrying `"JSON document depth exceeds 5"` against a JSON document of
// depth 5:
//
//   - RED (b1), the primary: the caller binds `Err(InvokeInfraError { cause:
//     "return_validation" })` where `Ok [[[["red"]]]]` is due.
//   - RED (a1) / RED (a3): `enforceInvokeReturnDepth` breaches for `[[[[C]]]]`
//     and `{a:{b:{c:{d:C}}}}`, whose wire documents are depth 5.
//   - RED (d-params) / RED (d-code-tool): the two sibling theta-value sites
//     breach for the same payload.
//   - RED (ARITY-BOUNDARY): the one row of the arity curve that flips — four
//     array levels above the carrier, wire depth 5.
//
// WHICH ASSERTIONS ARE FENCES (green now, GREEN AFTER — a fix that moves one has
// over-reached): CONTROL (b2), (b3), (b4); CONTROL (a2), (a4), (a5); CONTROL
// (ARITY-FENCE); CONTROL (CAP-6-RETURN), (CAP-6-PARAMS), (CAP-6-CODE-TOOL) —
// the wire-depth-6 rows at all three moved gates, which pin the canonical
// `message`, `schema_keyword: "maxDepth"`, the boundary `cause` AND
// `issue.path`, so a route cannot buy the fix by dropping the RFC-6901 pointer;
// CONTROL (SITE-SCOPE-WALK) and (SITE-SCOPE-MODEL-DRIVEN); CONTROL
// (CROSS-GATE); CONTROL (RESULT-CARRIAGE); MECHANISM (POST-GATE).
//
// THE SETTLED ROUTE THESE ASSERTIONS ARE SHAPED AGAINST. The metric becomes the
// payload's WIRE FORM under `schema-subset.md:24–30`'s counting algorithm,
// computed by a NEW module `src/runtime/wire-form-depth-walk.ts` exporting
// `wireFormDepthWalk(value: unknown): DepthWalkResult` — a bounded,
// level-capped, RFC-6901-pointer-producing descent that consults the shared
// exported classifier bug 0201 shipped, `classifyWireNode`
// (`src/runtime/subagent-envelope.ts:555`, which answers `scalar` for a boxed
// `String` and `record` for a `Result`). `src/runtime/depth-walk.ts` stays
// byte-untouched and `depthWalk` keeps serving the parsed-JSON sites. All three
// theta-value sites move: `enforceInvokeReturnDepth` and
// `enforceInvokeParamsDepth` through the shared `enforceInvokeDepth`
// (`src/runtime/invoke-ceiling-depth.ts:136`), and `enforceCodeToolArgDepth`
// (`src/runtime/tool-call.ts:610`). The parsed-JSON sites do NOT move and keep
// `depthWalk`: `enforceModelToolArgDepth` (`tool-call.ts:743`) and the
// typed-query-response gate (`src/runtime/query-tool-loop.ts:647`); so does the
// binder slash-load `params` arm (`src/binder/defaulting.ts:146`), whose
// defaults are already wire-projected upstream
// (`production-theta-producer.ts:1387`, `defaultValue:
// projectForValidation(evaluated)`). The cap stays 5, the message, the
// `schema_keyword`, the `cause` values and the destination surfaces are
// unchanged, and `InvokeDepthBreach.issue.path` stays populated.
//
// TIER: unit. The observable is in-process by construction — the defect is
// precisely that no serialisation intervenes on the attach cell — so the
// offline production binding reaches it directly and an integration or live
// tier would add a process boundary that normalises the carrier and hides the
// defect. The paired live cell (H8a cell 56,
// `tests/live/live-production-acceptance.test.ts`) drives the same two payloads
// through the real shipped host for the note-channel observable.
//
// TOKENS: none. Every theta body here is a pure tail expression; no `@` query is
// issued, so no provider is contacted and no model turn is spent.

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
  type EnumDecl,
  type ParseThetaDocumentDeps,
  type SchemaDecl,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import {
  isResultValue,
  makeEnumValue,
  makeOk,
  valuesEqual,
  type EnumValue,
  type ResultValue,
  type ThetaValue,
} from "../src/runtime/value";
import { decodeInboundValue, declaredNames } from "../src/runtime/inbound-boundary";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { depthWalk, jsonDepth, MAX_JSON_DEPTH } from "../src/runtime/depth-walk";
import {
  enforceInvokeParamsDepth,
  enforceInvokeReturnDepth,
  type InvokeDepthBreach,
} from "../src/runtime/invoke-ceiling-depth";
import { enforceCodeToolArgDepth, enforceModelToolArgDepth } from "../src/runtime/tool-call";
import { projectForValidation } from "../src/runtime/wire-translation";
import {
  classifyWireNode,
  mapTooDeepReturnValue,
  parseEnvelopeLine,
  serializeOkEnvelope,
} from "../src/runtime/subagent-envelope";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";

// ===========================================================================
// Harness — the real production prompt-mode binding over a real parse, plus the
// vehicles. Mirrors `tests/invoke-return-enum-carrier-projection.test.ts`.
// ===========================================================================

const CALLEE_PATH = "./kid.theta";
const PROMPT_FM = "---\nmode: prompt\n---\n";
const COLOUR_DECL = 'enum Colour { Red = "red" }\n';

/** The one wire string every cell's carrier holds, so no cell depends on variant length. */
const RED = "red";

/**
 * `Colour.Red`'s runtime carrier, built by the shipped `makeEnumValue`
 * (`src/runtime/value.ts:135`) rather than hand-boxed: the defect is a property
 * of that function's `new String(wire)` output, so a hand-made box would let a
 * cell pass against a representation the runtime never mints.
 */
function colourRed(): EnumValue {
  return makeEnumValue("Colour", RED);
}

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
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic — a fixture
 * that stops parsing must never let a bug test pass, or red, for the wrong
 * reason (*No silent test skipping*). Both fixture sources sit inside GOV-15's
 * loads-cleanly input set (`source-language-stability.md:9`), which this check
 * establishes per run rather than assuming.
 */
function parseTheta(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `precondition unmet: fixture ${path} failed to parse — ` +
        `${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/**
 * The production AJV validator, wired with the same `JSON.stringify`
 * content-addressing the shipped composition root uses. A stub would decide the
 * verdict the (b) cells route through, so the real seam is what every cell runs
 * against.
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

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    schemaValidator: realAjvValidator(),
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

/**
 * Drive `invoke<annotation>("./kid.theta")` in a prompt-mode caller against a
 * prompt-mode callee whose body is `calleeTail`, and return the boundary
 * `Result`. Both documents declare `enum Colour` because the annotation is the
 * caller's and the callee's tail names its own variant.
 */
async function driveTypedInvoke(input: {
  readonly annotation: string;
  readonly calleeTail: string;
}): Promise<ResultValue> {
  const calleeDoc = parseTheta("kid.theta", PROMPT_FM + COLOUR_DECL + input.calleeTail);
  const callee: ThetaCompositionInput = {
    slashName: "kid",
    sourcePath: "/theta/kid.theta",
    frontmatter: calleeDoc.frontmatter as ParsedFrontmatter,
    body: calleeDoc.body,
  };
  const deps = createProductionProducerDeps({
    // `getActiveTools` / `setActiveTools` satisfy the PIC-17 prompt→prompt
    // suspend window; `sendMessage` satisfies the theta-system-note channel.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    parseCallee: () => Promise.resolve(callee),
  });

  const callerSrc =
    PROMPT_FM + COLOUR_DECL + `invoke<${input.annotation}>("${CALLEE_PATH}")\n`;
  const callerDoc = parseTheta("caller.theta", callerSrc);
  const theta: ThetaCompositionInput = {
    slashName: "caller",
    sourcePath: "/theta/caller.theta",
    frontmatter: callerDoc.frontmatter as ParsedFrontmatter,
    body: callerDoc.body,
  };
  const bindInput: ConversationBindInput = { theta, args: "", ctx: ctxDouble() };
  const binding = deps.bindPromptConversation(bindInput);
  return boundaryResult(await executeBody(theta.body, binding.executeDeps));
}

/**
 * The `Result` the tail `invoke<T>(...)` expression produced. A caller body that
 * did not reach its tail says nothing about the return boundary, so that is a
 * loud harness failure rather than a cell outcome.
 */
function boundaryResult(execution: BodyExecution): ResultValue {
  if (execution.outcome !== "success") {
    throw new Error(
      `precondition unmet: the caller body ended '${execution.outcome}' instead of reaching its ` +
        `tail invoke — error ${JSON.stringify(execution.error)}`,
    );
  }
  const tail = execution.result.value;
  if (tail === undefined || !isResultValue(tail)) {
    throw new Error(
      `precondition unmet: the caller's tail value is not the invoke boundary Result — ` +
        `${JSON.stringify(tail)}`,
    );
  }
  return tail;
}

/** The `Err` payload rendered into an assertion message, so a red names the cause. */
function errDetail(result: ResultValue): string {
  return result.ok ? "" : ` — observed Err ${JSON.stringify(result.error)}`;
}

/**
 * A depth breach rendered into an assertion message: the message the refusal
 * carries, the pointer it names, and the wire document it is false of. A red
 * that does not name all three cannot be told from an unrelated throw.
 */
function breachDetail(breach: InvokeDepthBreach | undefined, value: unknown): string {
  if (breach === undefined) {
    return " — no breach";
  }
  return (
    ` — observed ${JSON.stringify(breach.error.message)} at path ` +
    `${JSON.stringify(breach.issue.path)} (cause ${breach.error.cause}) against the wire ` +
    `document ${JSON.stringify(value)}, whose depth is ${jsonDepth(JSON.parse(JSON.stringify(value)))}`
  );
}

/** `value` nested under `levels` array literals — the arity-table vehicle builder. */
function nest(value: unknown, levels: number): unknown {
  let out = value;
  for (let i = 0; i < levels; i += 1) {
    out = [out];
  }
  return out;
}

/** The depth of the JSON DOCUMENT `value` serialises to, re-read through a parser. */
function wireDepth(value: unknown): number {
  return jsonDepth(JSON.parse(JSON.stringify(value)) as unknown);
}

/**
 * The leaf of a `nest`ed vehicle: element 0 taken `levels` times. A payload that
 * is not that shape is a loud harness failure rather than a cell outcome —
 * mis-indexing one level would otherwise let a carrier assertion read a
 * container and pass or fail for a reason the bug has nothing to do with.
 */
function firstLeaf(value: unknown, levels: number): unknown {
  let out = value;
  for (let level = 0; level < levels; level += 1) {
    if (!Array.isArray(out) || out.length === 0) {
      throw new Error(
        `precondition unmet: the payload is not ${levels} array levels deep — level ${level} ` +
          `holds ${JSON.stringify(out)} inside ${JSON.stringify(value)}`,
      );
    }
    out = (out as readonly unknown[])[0];
  }
  return out;
}

// ===========================================================================
// (b) End to end through the real prompt→prompt attach cell. §Reproduction (b).
//
// b1 is this report's PRIMARY observable: what a CALLER binds. b3 is the
// discriminator — its wire document is byte-identical to b1's and its
// annotation has the same shape; the only difference is whether the level-5
// scalar is a named-enum variant or a string literal.
// ===========================================================================

describe("bug 0202 (b1) — invoke<array<array<array<array<Colour>>>>> of a prompt-mode callee whose tail is [[[[Colour.Red]]]]", () => {
  it("RED (b1): the caller binds Ok carrying the depth-5 wire document, not Err(cause: return_validation)", async () => {
    const result = await driveTypedInvoke({
      annotation: "array<array<array<array<Colour>>>>",
      calleeTail: "[[[[Colour.Red]]]]\n",
    });

    // PRIMARY. `schema-subset.md:13` fixes the cap over "the JSON document
    // depth" and `:24–30`'s counting algorithm makes this document
    // (`[[[["red"]]]]`) depth 5, which `:30`'s `depth ≤ 5` admits. The refusal
    // observed here names that depth and is false of it: the fifth level the
    // walk counts is a character index of the carrier
    // (`Object.keys(new String("red"))` is `["0","1","2"]`), pinned by the
    // MECHANISM cell below.
    expect(
      result.ok,
      `PRIMARY (bug 0202): a callee tail whose JSON document is [[[["red"]]]] — depth 5, inside ` +
        `ceiling #4's cap — must bind Ok, not a refusal naming a depth the document does not ` +
        `have${errDetail(result)}`,
    ).toBe(true);
    if (!result.ok) {
      return;
    }

    // `runtime-value-model.md:13` — the tag "MUST NOT appear in JSON output".
    // The bound payload's wire document is the one the cap admitted.
    expect(
      JSON.stringify(result.value),
      "the bound payload serialises to the document the cap admits",
    ).toBe('[[[["red"]]]]');

    const inner = firstLeaf(result.value, 4) as ThetaValue;

    // MEASURED, not assumed: the bound leaf is still the boxed carrier
    // (`typeof "object"`), because bug 0174 §Fix (b) hands the callee's OWN
    // value — not the projection — to the post-AJV inbound pass and on to the
    // caller (`production-theta-producer.ts:3706` validates
    // `projectForValidation(result.value)`; `:3709` decodes `result.value`).
    // Established two ways at HEAD `1ead931f`, since the b1 row cannot reach
    // this point today: (i) the CONTROL (b2) row below — the same payload one
    // level shallower, which takes the identical code path minus the depth gate
    // — binds a leaf of `typeof "object"` that compares equal to a locally
    // constructed variant; (ii) the MECHANISM (POST-GATE) cell drives the whole
    // post-gate half of the method over this very payload and measures the same.
    expect(
      typeof inner,
      "the caller receives the callee's own enum value, whose reference encoding " +
        "(runtime-value-model.md:16) is a boxed String",
    ).toBe("object");
    expect(
      valuesEqual(inner, colourRed()),
      "the level-5 element compares equal to a locally constructed Colour.Red",
    ).toBe(true);
  });
});

describe("bug 0202 (b) CONTROLS — the three rows that bracket b1 (green now, green after)", () => {
  it("CONTROL (b2): the same enum one level shallower binds Ok [[[\"red\"]]]", async () => {
    const result = await driveTypedInvoke({
      annotation: "array<array<array<Colour>>>",
      calleeTail: "[[[Colour.Red]]]\n",
    });

    expect(result.ok, `three array levels above the carrier bind Ok${errDetail(result)}`).toBe(
      true,
    );
    if (!result.ok) {
      return;
    }
    expect(JSON.stringify(result.value), "the wire document is depth 4").toBe('[[["red"]]]');
    const leaf = firstLeaf(result.value, 3) as ThetaValue;
    // The measurement the b1 leaf assertion above is calibrated against.
    expect(typeof leaf, "the bound leaf is the callee's own boxed carrier").toBe("object");
    expect(
      valuesEqual(leaf, colourRed()),
      "and compares equal to a locally constructed Colour.Red",
    ).toBe(true);
  });

  it("CONTROL (b3): the byte-identical wire document under array<array<array<array<string>>>> binds Ok", async () => {
    const result = await driveTypedInvoke({
      annotation: "array<array<array<array<string>>>>",
      calleeTail: '[[[["red"]]]]\n',
    });

    // THE DISCRIMINATOR. Same document, same annotation shape; only the
    // level-5 scalar's declared type differs, and today that difference decides
    // Ok against Err.
    expect(
      result.ok,
      `a string literal at the same level-5 position binds Ok, which is what makes the ` +
        `enum variant's refusal a property of the carrier${errDetail(result)}`,
    ).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(JSON.stringify(result.value), "the same wire document b1 carries").toBe(
      '[[[["red"]]]]',
    );
    const leaf = firstLeaf(result.value, 4);
    // A `string`-annotated position carries no carrier at all, which is the
    // whole difference from b1.
    expect(typeof leaf, "a string literal is never boxed").toBe("string");
  });

  it("CONTROL (b4): the same enum at the root binds Ok \"red\"", async () => {
    const result = await driveTypedInvoke({
      annotation: "Colour",
      calleeTail: "Colour.Red\n",
    });

    expect(result.ok, `a root-position variant binds Ok${errDetail(result)}`).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(JSON.stringify(result.value), "the wire document is a depth-1 scalar").toBe('"red"');
    expect(
      valuesEqual(result.value, colourRed()),
      "and compares equal to a locally constructed Colour.Red",
    ).toBe(true);
  });
});

// ===========================================================================
// (a) The seam directly — `enforceInvokeReturnDepth` over the raw theta value.
// §Reproduction (a).
// ===========================================================================

describe("bug 0202 (a) — enforceInvokeReturnDepth over a carrier-bearing payload at wire depth 5", () => {
  it("RED (a1): [[[[Colour.Red]]]] — wire document [[[[\"red\"]]]], depth 5 — is not refused", () => {
    const value = nest(colourRed(), 4);
    const breach = enforceInvokeReturnDepth(CALLEE_PATH, value);

    // PRIMARY at the seam. The pointer the breach carries records the mechanism
    // exactly: `/0/0/0/0/0` — five segments for a document with four array
    // levels, the fifth indexing a character of the carrier.
    expect(
      breach,
      `PRIMARY (bug 0202): ceiling #4's cap is a property of the JSON document ` +
        `(schema-subset.md:13, :22), and this document is depth 5` +
        breachDetail(breach, value),
    ).toBeUndefined();
  });

  it("RED (a3): {a:{b:{c:{d:Colour.Red}}}} — the over-count is not array-specific", () => {
    const value = { a: { b: { c: { d: colourRed() } } } };
    const breach = enforceInvokeReturnDepth(CALLEE_PATH, value);

    expect(
      breach,
      `PRIMARY (bug 0202): an object-nested carrier at wire level 5 is refused for the same ` +
        `reason an array-nested one is` + breachDetail(breach, value),
    ).toBeUndefined();
  });

  it("CONTROL (a2): the byte-identical wire document without a carrier is admitted (green now, green after)", () => {
    // a1 and a2 have byte-identical `JSON.stringify` output and opposite
    // verdicts today. This row is what makes the a1 refusal false rather than
    // merely strict.
    const value = nest(RED, 4);
    expect(JSON.stringify(value), "the same document a1 carries").toBe('[[[["red"]]]]');
    expect(
      enforceInvokeReturnDepth(CALLEE_PATH, value),
      "a plain string at level 5 is inside the cap",
    ).toBeUndefined();
  });

  it("CONTROL (a4): the same carrier one level shallower is admitted (green now, green after)", () => {
    const value = nest(colourRed(), 3);
    expect(
      enforceInvokeReturnDepth(CALLEE_PATH, value),
      "three array levels above the carrier stay inside the cap under either metric",
    ).toBeUndefined();
  });

  it("CONTROL (a5): the empty-wire-string variant is admitted at four levels (green now, green after)", () => {
    // The mechanism isolated: `Object.keys(new String(""))` is `[]`, so
    // `hasChildren` (`src/runtime/depth-walk.ts:120`) is false and the empty
    // variant is the one enum value the shipped walk already counts as the
    // scalar it is. Under the settled route every variant counts that way.
    const value = nest(makeEnumValue("Colour", ""), 4);
    expect(Object.keys(new String("")), "the empty carrier has no character indices").toEqual([]);
    expect(
      enforceInvokeReturnDepth(CALLEE_PATH, value),
      "the empty-string variant at level 5 is inside the cap",
    ).toBeUndefined();
  });
});

// ===========================================================================
// (d) The two sibling theta-value sites the settled route moves with the return
// gate. §Reproduction (d).
//
// Both are handed interpreter values, not parsed JSON: the `invoke(...)`
// `params` gate walks `argValues: readonly ThetaValue[]` built by
// `evaluatePureExpression` (`src/extension/production-theta-producer.ts:3293`,
// `:3330`, walked per argument at `:3440`), and the code-driven tool-args gate
// walks `lowerToolCallParams`'s `evaluatePureExpression` output (`:3016`,
// `:3979`, walked at `:3032`). So a carrier is reachable at both.
// ===========================================================================

describe("bug 0202 (d) — the sibling theta-value ceiling-#4 gates over the same payload", () => {
  it("RED (d-params): enforceInvokeParamsDepth does not refuse a carrier at wire level 5", () => {
    const value = nest(colourRed(), 4);
    const breach = enforceInvokeParamsDepth(CALLEE_PATH, value);

    expect(
      breach,
      `PRIMARY (bug 0202): the invoke params gate measures the same cap over the same document ` +
        `and must agree with the return gate` + breachDetail(breach, value),
    ).toBeUndefined();
  });

  it("RED (d-code-tool): enforceCodeToolArgDepth does not refuse a carrier at wire level 5", () => {
    const value = nest(colourRed(), 4);
    const breach = enforceCodeToolArgDepth("t", value);

    expect(
      breach,
      `PRIMARY (bug 0202): the code-driven tool-args gate measures the same cap over the same ` +
        `document — observed ${
          breach === undefined
            ? "no breach"
            : `${JSON.stringify(breach.error.message)} (kind ${breach.error.kind}, cause ${breach.error.cause}) at path ${JSON.stringify(breach.issue.path)}`
        } against the wire document ${JSON.stringify(value)}, whose depth is ${wireDepth(value)}`,
    ).toBeUndefined();
  });
});

// ===========================================================================
// The arity curve. §Reproduction (a)'s second table, re-measured: the carrier
// adds exactly one level at every position, independent of the wire string.
//
// Measured at HEAD `1ead931f`, `enforceInvokeReturnDepth` over
// `nest(Colour.Red, levels)`:
//
//   levels | jsonDepth(raw) | wire depth | refused now | refused after
//   ------ | -------------- | ---------- | ----------- | -------------
//        0 |              2 |          1 | no          | no
//        1 |              3 |          2 | no          | no
//        2 |              4 |          3 | no          | no
//        3 |              5 |          4 | no          | no
//        4 |              6 |          5 | YES         | no   <- the flip
//        5 |              7 |          6 | yes         | yes
// ===========================================================================

describe("bug 0202 ARITY — the refusal threshold, bracketed from both sides", () => {
  it("CONTROL (ARITY-FENCE): 0–3 levels are admitted and 5 levels are refused (green now, green after)", () => {
    for (const levels of [0, 1, 2, 3]) {
      const value = nest(colourRed(), levels);
      expect(wireDepth(value), `${levels} levels put the wire document at depth ${levels + 1}`).toBe(
        levels + 1,
      );
      expect(
        enforceInvokeReturnDepth(CALLEE_PATH, value),
        `a wire document of depth ${levels + 1} is inside the cap`,
      ).toBeUndefined();
    }

    // The row above the cap: five levels is wire depth 6 and stays refused, so
    // the fix narrows the refusal rather than removing it.
    const overCap = nest(colourRed(), 5);
    expect(wireDepth(overCap), "five levels put the wire document at depth 6").toBe(6);
    expect(
      enforceInvokeReturnDepth(CALLEE_PATH, overCap),
      "a wire document of depth 6 is refused under either metric",
    ).toBeDefined();
  });

  it("RED (ARITY-BOUNDARY): four levels — wire depth 5 — is the one row that must stop being refused", () => {
    const value = nest(colourRed(), 4);
    expect(wireDepth(value), "four levels put the wire document at depth 5").toBe(5);
    const breach = enforceInvokeReturnDepth(CALLEE_PATH, value);
    expect(
      breach,
      `PRIMARY (bug 0202): the flip row of the arity curve — the carrier's one extra level is ` +
        `the whole defect` + breachDetail(breach, value),
    ).toBeUndefined();
  });

  it("MECHANISM: the over-count is the box's character indices, not the tag and not the length (green now, green after)", () => {
    // The tag is invisible to `Object.keys` (a non-enumerable symbol,
    // `src/runtime/value.ts:137–142`); the box is not.
    expect(Object.keys(new String(RED)), "the carrier's own enumerable keys").toEqual([
      "0",
      "1",
      "2",
    ]);
    expect(jsonDepth(colourRed()), "the raw carrier counts as a non-empty object").toBe(2);
    expect(
      jsonDepth(makeEnumValue("Colour", "crimson")),
      "a seven-character variant adds the same one level, so length is not the mechanism",
    ).toBe(2);
    expect(JSON.stringify(colourRed()), "the wire form is the bare scalar string").toBe('"red"');
    // The shared classifier bug 0201 exported already answers the question the
    // settled route's new walk consults it for.
    expect(
      classifyWireNode(colourRed()),
      "classifyWireNode (src/runtime/subagent-envelope.ts:555) sorts the carrier as a scalar",
    ).toEqual({ kind: "scalar" });
  });
});

// ===========================================================================
// The wire-depth-6 fences at all three moved gates. GREEN now and GREEN after.
//
// These pin what a route must NOT buy the fix with: the canonical message, the
// `schema_keyword`, the boundary `cause`, and the RFC-6901 pointer to the
// too-deep WIRE position. `InvokeDepthBreach.issue` types `path` non-optional
// (`src/runtime/invoke-ceiling-depth.ts:71–75`), and a wire-form walk that
// returned a bare `boolean` would have to fabricate one.
//
// The pointers are measured, and they are the same under both metrics because
// the level check precedes the node classification in either walk: for
// `[[[[[C]]]]]` the level-6 node is the carrier at `/0/0/0/0/0`, and its wire
// form `[[[[["red"]]]]]` puts `"red"` at that same position; for
// `{a:{b:{c:{d:{e:C}}}}}` both name `/a/b/c/d/e`.
// ===========================================================================

describe("bug 0202 CAP-6 FENCES — a wire document deeper than the cap still refuses at every moved gate", () => {
  it("CONTROL (CAP-6-RETURN): the invoke<T> return gate refuses wire depth 6 with the canonical surface (green now, green after)", () => {
    expect(MAX_JSON_DEPTH, "the cap this report does not move").toBe(5);

    const arrays = nest(colourRed(), 5);
    expect(wireDepth(arrays), "the vehicle's wire document is depth 6").toBe(6);
    const breach = enforceInvokeReturnDepth(CALLEE_PATH, arrays);
    expect(breach, "a wire document past the cap is refused").toBeDefined();
    if (breach === undefined) {
      return;
    }
    // ceilings-3-and-4.md:19 (canonical message + schema_keyword), :27 (the
    // `invoke<T>` return row's carrier and cause).
    expect(breach.error.message, "the canonical message").toBe("JSON document depth exceeds 5");
    expect(breach.issue.message, "the issue carries it too").toBe(
      "JSON document depth exceeds 5",
    );
    expect(breach.issue.schema_keyword, "the canonical schema_keyword").toBe("maxDepth");
    expect(breach.error.kind, "the invoke-parent carrier").toBe("invoke_infra");
    expect(breach.error.cause, "the invoke<T> return row's cause").toBe("return_validation");
    expect(breach.error.callee_path, "naming the callee").toBe(CALLEE_PATH);
    expect(breach.result.ok, "surfaced as an Err to the invoke parent").toBe(false);
    // THE POINTER FENCE: the RFC-6901 position of the too-deep wire node.
    expect(
      breach.issue.path,
      "the pointer names the too-deep wire position and must survive the metric change",
    ).toBe("/0/0/0/0/0");

    const objects = { a: { b: { c: { d: { e: colourRed() } } } } };
    expect(wireDepth(objects), "the object vehicle is depth 6 too").toBe(6);
    const objectBreach = enforceInvokeReturnDepth(CALLEE_PATH, objects);
    expect(objectBreach, "and is refused").toBeDefined();
    expect(
      objectBreach?.issue.path,
      "with the pointer to its own too-deep wire position",
    ).toBe("/a/b/c/d/e");
  });

  it("CONTROL (CAP-6-PARAMS): the invoke params gate refuses wire depth 6 with cause validation (green now, green after)", () => {
    const value = nest(colourRed(), 5);
    const breach = enforceInvokeParamsDepth(CALLEE_PATH, value);
    expect(breach, "a wire document past the cap is refused at the params gate").toBeDefined();
    if (breach === undefined) {
      return;
    }
    expect(breach.error.message, "the canonical message").toBe("JSON document depth exceeds 5");
    expect(breach.issue.schema_keyword, "the canonical schema_keyword").toBe("maxDepth");
    expect(breach.error.kind, "the invoke-parent carrier").toBe("invoke_infra");
    // The input-side cause, distinct from the return row's.
    expect(breach.error.cause, "the params row's cause").toBe("validation");
    expect(breach.issue.path, "the pointer to the too-deep wire position").toBe("/0/0/0/0/0");
  });

  it("CONTROL (CAP-6-CODE-TOOL): the code-driven tool-args gate refuses wire depth 6 with a CodeToolError (green now, green after)", () => {
    const value = nest(colourRed(), 5);
    const breach = enforceCodeToolArgDepth("t", value);
    expect(breach, "a wire document past the cap is refused at the code-tool gate").toBeDefined();
    if (breach === undefined) {
      return;
    }
    expect(breach.error.message, "the canonical message").toBe("JSON document depth exceeds 5");
    expect(breach.issue.schema_keyword, "the canonical schema_keyword").toBe("maxDepth");
    expect(breach.error.kind, "the code-driven row's carrier").toBe("code_tool");
    expect(breach.error.cause, "the code-driven row's cause").toBe("validation");
    expect(breach.error.tool_name, "naming the tool").toBe("t");
    expect(breach.issue.path, "the pointer to the too-deep wire position").toBe("/0/0/0/0/0");
    expect(
      enforceCodeToolArgDepth("t", { a: { b: { c: { d: { e: colourRed() } } } } })?.issue.path,
      "and the object vehicle's own pointer",
    ).toBe("/a/b/c/d/e");
  });
});

// ===========================================================================
// SITE SCOPE — the settled route's boundary, pinned in both directions.
// ===========================================================================

describe("bug 0202 SITE SCOPE — what stays on the parsed-JSON metric", () => {
  it("CONTROL (SITE-SCOPE-WALK): depthWalk and jsonDepth keep no carrier arm (green now, green after)", () => {
    // `src/runtime/depth-walk.ts` stays byte-untouched: it answers for the
    // parsed-JSON sites, where `hasChildren` (`:120`) is exact because
    // `JSON.parse` produces only `null`, primitives, plain objects and arrays.
    // The settled route adds `src/runtime/wire-form-depth-walk.ts` beside it
    // rather than teaching this walk about a representation it never sees.
    const value = nest(colourRed(), 4);
    expect(jsonDepth(value), "the raw carrier graph is six levels deep").toBe(6);
    expect(depthWalk(value).ok, "so this walk refuses it, correctly for its own domain").toBe(
      false,
    );
    expect(jsonDepth(nest(RED, 4)), "the parsed document is five").toBe(5);
    expect(depthWalk(nest(RED, 4)).ok, "which this walk admits").toBe(true);
  });

  it("CONTROL (SITE-SCOPE-MODEL-DRIVEN): the model-driven tool-args gate still breaches on a carrier (green now, green after)", () => {
    // THIS CELL PINS THE SITE-SCOPE BOUNDARY, NOT A REACHABLE BEHAVIOUR.
    // `enforceModelToolArgDepth` (`src/runtime/tool-call.ts:743`) keeps
    // `depthWalk` because every one of its call sites is handed a model-produced
    // argument document — parsed JSON, in which a boxed `String` cannot occur.
    // Read from source: `src/extension/production-theta-producer.ts:2932`
    // (`enforceModelToolArgDepth(payload)`, the live respond tool's
    // model-supplied args, recovered from the wire by
    // `respondPayloadFromWire` at `:2928`), `:5181`
    // (`enforceModelToolArgDepth(payload)`, the off-session respond
    // channel, recovered from the wire by `respondPayloadFromWire` at
    // `:5180`), `:5264` (`call.arguments`, a model-emitted
    // `tool_use`), `:5350` (`args` of `lowerModelDrivenThetaCall`), and
    // `src/extension/prompt-tool-loop-governor.ts:189` (`event.input`, pi's own
    // `tool_call` hook payload). No carrier is production-reachable there, so
    // the verdict below is unobservable in production either way; the cell exists
    // so a route that widened `depthWalk` instead of adding a walk beside it
    // reds here.
    const value = nest(colourRed(), 4);
    const breach = enforceModelToolArgDepth(value);
    expect(breach, "the model-driven gate keeps the parsed-JSON metric").toBeDefined();
    expect(
      breach?.message,
      "and its model-facing feedback text keeps the pointer-prefixed form",
    ).toBe("/0/0/0/0/0 JSON document depth exceeds 5");
  });
});

// ===========================================================================
// CROSS-GATE AGREEMENT — §Reproduction (c). The child-side gate bug 0187
// shipped already admits this payload, and the parent's own post-parse walk
// admits the document the child writes. Pre-fix this is the asymmetry
// `invocation.md:36` forbids; post-fix both gates agree.
// ===========================================================================

describe("bug 0202 CROSS-GATE — the child-side gate and the parent's post-parse walk already agree", () => {
  it("CONTROL (CROSS-GATE): the same payload crosses the envelope writer and the parent's post-parse walk (green now, green after)", () => {
    const value = nest(colourRed(), 4);

    // `mapTooDeepReturnValue` (`src/runtime/subagent-envelope.ts:795`) measures
    // the wire form through `classifyWireNode`, so it admits this payload.
    expect(
      mapTooDeepReturnValue(value, CALLEE_PATH),
      "the child-side ceiling-#4 gate admits a document of depth 5",
    ).toBeUndefined();

    const line = serializeOkEnvelope(value);
    expect(line, "and the PIC-59 envelope carries the depth-5 document").toBe(
      '{"theta_result":{"v":1,"ok":[[[["red"]]]]}}\n',
    );

    const parsed = parseEnvelopeLine(line.trimEnd());
    expect(parsed.kind, "the parent re-reads an ok envelope").toBe("ok");
    if (parsed.kind !== "ok") {
      return;
    }
    expect(
      enforceInvokeReturnDepth(CALLEE_PATH, parsed.value),
      "and the parent's own depth gate admits the parsed document — the same gate that " +
        "refuses the byte-identical value on the in-process attach cell",
    ).toBeUndefined();
  });
});

// ===========================================================================
// RESULT CARRIAGE — §Non-goals. The parent gate's `Result` behaviour already
// agrees with the wire form, so this fix does not widen it. `Result` is the one
// carrier `depthWalk` and the settled route's wire-form walk answer identically:
// the brand is a non-enumerable symbol, so `Object.keys` and `JSON.stringify`
// see the same `ok` / `value` keys.
// ===========================================================================

describe("bug 0202 RESULT CARRIAGE — the Result bound is inherited, not widened", () => {
  it("CONTROL (RESULT-CARRIAGE): Ok([[[[1]]]]) is a depth-6 document and the invoke gate refuses it (green now, green after)", () => {
    const value = makeOk(nest(1, 4) as ThetaValue);
    expect(JSON.stringify(value), "the Result's own wire form carries two levels of its own").toBe(
      '{"ok":true,"value":[[[[1]]]]}',
    );
    expect(wireDepth(value), "so the document is depth 6").toBe(6);
    expect(jsonDepth(value), "and the raw graph measures the same 6").toBe(6);

    const breach = enforceInvokeReturnDepth(CALLEE_PATH, value);
    expect(breach, "which the gate refuses under either metric").toBeDefined();
    expect(breach?.error.message, "with the canonical message").toBe(
      "JSON document depth exceeds 5",
    );
    expect(
      breach?.issue.path,
      "and a pointer that descends the Result's own enumerable value key",
    ).toBe("/value/0/0/0/0");
  });
});

// ===========================================================================
// MECHANISM (POST-GATE) — the post-gate half of `#validateInvokeReturn` over
// the b1 payload, so the b1 assertions are provably reachable in the green
// direction rather than only in the red one.
//
// This is the method's own second and third steps, driven with the shipped
// seams over the raw carrier payload: AJV against
// `projectForValidation(result.value)` (`production-theta-producer.ts:3706`)
// and `decodeInboundValue` over `result.value` (`:3709`). Both already answer
// for this payload at HEAD; the depth sub-check at `:3693` is the only thing
// standing between it and `Ok`.
// ===========================================================================

const B1_ANNOTATION = "array<array<array<array<Colour>>>>";

const B1_LOWERED =
  '{"type":"array","items":{"type":"array","items":{"type":"array","items":' +
  '{"type":"array","items":{"$ref":"#/$defs/Colour"}}}},' +
  '"$defs":{"Colour":{"type":"string","enum":["red"]}}}';

/** The `Colour` declaration set, parsed exactly as the runtime reads it. */
function declarationDocument(): ThetaDocument {
  return parseTheta("seam.theta", PROMPT_FM + COLOUR_DECL + "1\n");
}

function loweredB1(doc: ThetaDocument): LoweredSchema {
  // The producer reads its declaration sets off the body statements
  // (`schemaDeclsOf` / `enumDeclsOf`,
  // `src/extension/production-theta-producer.ts:5400` / `:5411`); mirroring that
  // keeps the lowering input identical to the runtime's.
  const schemas = doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
  const enums = doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
  const lowered = lowerQueryResponseSchema(B1_ANNOTATION, schemas, enums);
  if (lowered === undefined) {
    throw new Error(
      `precondition unmet: '${B1_ANNOTATION}' lowered to nothing, so no AJV verdict is observable`,
    );
  }
  return lowered;
}

describe("bug 0202 MECHANISM (POST-GATE) — the rest of the method already binds the b1 payload", () => {
  it("CONTROL: AJV admits the wire projection and the inbound pass returns the tagged carrier (green now, green after)", () => {
    const doc = declarationDocument();
    const lowered = loweredB1(doc);
    expect(JSON.stringify(lowered), "the lowered annotation, pinned verbatim").toBe(B1_LOWERED);

    // The gates below take `unknown`, but `projectForValidation` is typed over
    // the interpreter's own value domain, which is what the method hands it.
    const value = nest(colourRed(), 4) as ThetaValue;
    const validator = realAjvValidator();

    // `projectForValidation` (`src/runtime/wire-translation.ts:637`) collapses
    // the boxed `String` to `value.valueOf()`, which is why the AJV call sits on
    // the projection side of bug 0174's split.
    expect(JSON.stringify(projectForValidation(value)), "the projection's document").toBe(
      '[[[["red"]]]]',
    );
    expect(
      jsonDepth(projectForValidation(value)),
      "whose depth is 5 — the projection the depth gate runs 13 lines ahead of",
    ).toBe(5);
    expect(
      validator.compile(lowered).validate(projectForValidation(value)),
      "AJV admits the projection",
    ).toEqual({ ok: true });

    // And the post-AJV inbound pass over the ORIGINAL value hands the caller
    // the callee's own tagged carrier — the measurement the b1 leaf assertions
    // are calibrated against.
    const decoded = decodeInboundValue({
      lowered: lowered as unknown as Record<string, unknown>,
      annotation: B1_ANNOTATION,
      schemaNames: declaredNames(doc.body, "schema"),
      enumNames: declaredNames(doc.body, "enum"),
      validated: value,
      schemaValidator: validator,
    });
    const inner = firstLeaf(decoded, 4) as ThetaValue;
    expect(typeof inner, "the level-5 element stays the boxed carrier").toBe("object");
    expect(
      valuesEqual(inner, colourRed()),
      "and compares equal to a locally constructed Colour.Red",
    ).toBe(true);
    expect(JSON.stringify(decoded), "the bound payload's wire document").toBe('[[[["red"]]]]');
  });
});
