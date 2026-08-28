// Bug 0174 — a typed `invoke<T>` of a `mode: prompt` callee fails
// return-validation for every named-enum position: `makeEnumValue`
// (`src/runtime/value.ts:135`) builds a boxed `String` (`:136`), and on the
// in-process prompt→prompt attach cell that value reaches AJV still boxed
// (`typeof` `"object"`), so `{"type":"string","enum":[…]}` refuses it and the
// caller receives `Err(InvokeInfraError { cause: "return_validation" })` — where
// the byte-identical callee body as `mode: subagent` crosses a `JSON.stringify`
// envelope, arrives as a JSON primitive, and returns `Ok`
// (`docs/bugs/0174-typed-invoke-enum-return-validation-prompt-cell.md`).
//
// SPEC. `docs/spec_topics/invocation.md:36` (§Final-value propagation across
// callees) fixes the return surface as mode-invariant: "A `prompt`-mode child
// attaches to the caller's current conversation, but the final value still
// propagates through the same return surface." `:55` (§Cross-mode semantics)
// fixes what the callee's mode DOES select — "whether it gets a fresh
// conversation or attaches to its caller's current conversation" — and nothing
// more; it is not specified to select whether a return value validates. `:28`
// (§Typed return) makes `invoke<Schema>` the form that carries a value back, so
// it is the only form this defect reaches. `runtime-value-model.md:13` (the enum
// row) fixes the tag's absence from JSON output, and `:16` records the
// boxed-`String` carrier as the non-normative reference encoding that satisfies
// it; the spec fixes the JSON projection, not `typeof`, which is where the AJV
// boundary reads. `:34` (§Wire-name translation, inbound bullet) orders the
// inbound pass "after AJV validation against the lowered schema" and names
// "`invoke` returns" in its four-boundary set; on this cell the verdict that
// pass is ordered after is `{"ok":false}`, so the pass never runs and the value
// never binds. Reference mirror: `docs/reference/type-system.md:154`.
//
// THE CELL UNDER TEST, AND WHY THE HARNESS IS SHAPED THIS WAY. The prompt→prompt
// attach guard is `callerMode === "prompt" && callee.frontmatter.mode ===
// "prompt"` inside `#driveCallee` (`src/extension/production-theta-producer.ts:3376`,
// `#driveCallee` at `:3306`). It runs the callee body in-process and routes its
// terminal value through `surfaceCalleeFinalValue` (`:3639`) to
// `#validateInvokeReturn` (`:3564`) at `:3410` — the same method the subagent
// spawn cell reaches at `:3448`. No serialisation intervenes, so the callee's
// own boxed enum value is what reaches the gate — and absent the wire-form
// projection the gate applies (`projectForValidation`, `:3591`) it is what AJV
// would be handed. Every cell below drives that real path end to end:
// `parseThetaDocument` → `createProductionProducerDeps({ parseCallee })` →
// `bindPromptConversation` → `executeBody`, with a REAL `AjvSchemaValidator`
// (`src/seams/schema-validator.ts:104`) on the runtime root — the
// `tests/result-value-privacy.test.ts` §(c) pattern. `bindPromptConversation`
// threads `callerMode: "prompt"` into `#resolveInvoke` (`:1557`), and the `pi`
// stub carries `getActiveTools` / `setActiveTools` for the PIC-17 suspend window.
//
// THE CALLER USES THE EXPLICIT `invoke<T>("./kidp.theta")` FORM, not a
// `tools:`-routed call. `#resolveInvoke` (`:3172`) turns `expr.returnSchema !==
// null` into `{ kind: "annotated" }`, and `#resolveReturnSite` (`:3507`)
// resolves an annotated site against the CALLER's own body — so every caller
// below declares the `enum` / `schema` its annotation names.
//
// TOKENS: none. Every theta body here is a pure tail expression; no query is
// issued, so no provider is contacted and no model turn is spent.
//
// TIER: unit. The whole cell is in-process by construction — the defect is
// precisely that no process boundary normalises the value — so the offline
// production binding reaches it directly. The paired integration witness
// (`tests/invoke-prompt-cell-enum-return.test.ts`) re-drives the same rows
// through real spawned children, where the `*-prompt` / `*-sub` asymmetry is
// observable in one process tree.
//
// WHAT IS RED HERE. Cells (a), (c), (f) and (ANYOF) red on the bug's own
// symptom: `Err(InvokeInfraError { cause: "return_validation" })` where an `Ok`
// carrying a tagged enum is due. The SEAM cell reds on the AJV verdict the
// shipped gate takes, observed through a recording decorator over the production
// validator. The controls, the boxed-pass-through cell and the subagent-leg cell
// are green now and must stay green.
//
// WHAT THE FIX MOVES, AND WHAT THESE ASSERTIONS ARE SHAPED AGAINST. The settled
// route is the bug document's §Fix (b): compute a wire-form projection for the
// AJV call ONLY and hand the callee's own value — boxed enums and schema brands
// intact — unchanged to the post-AJV translation pass and on to the caller. The
// PRIMARY assertion of every red cell is therefore the caller-visible outcome
// (`Ok`, with the tag intact), which is route-agnostic across all three §Fix
// candidates. Two assertions are route-(b)-shaped and are marked SECONDARY where
// they appear: the wire form observed at the `validate` argument (SEAM-2), and
// the raw-seam refusal of a boxed value (SEAM-1c), which stays true under (b)
// because (b) does not teach the seam about the carrier — under §Fix (c) both
// would move.

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
  brandSchemaValue,
  isResultValue,
  makeEnumValue,
  schemaTagOf,
  valuesEqual,
  type ResultValue,
  type ThetaValue,
} from "../src/runtime/value";
import { decodeInboundValue, declaredNames } from "../src/runtime/inbound-boundary";
import { enumDeclaringKey } from "../src/runtime/lexical-environment";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { parseEnvelopeLine, serializeOkEnvelope } from "../src/runtime/subagent-envelope";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import {
  AjvSchemaValidator,
  type CompiledValidator,
  type LoweredSchema,
  type SchemaSlug,
  type SchemaValidator,
  type ValidationError,
} from "../src/seams/schema-validator";

// ===========================================================================
// The lowered fragments this bug is about, pinned verbatim.
//
// `enum Sev { High = "high", Low = "low" }` lowers to a `{"type":"string", …}`
// fragment, which is what makes the boxed carrier fail: AJV's `type` check is a
// `typeof` test. The `enum` keyword fails alongside it, which is why a named
// enum's error list carries two entries where a bare `{"type":"string"}` carries
// one. The `enum`-lowering row is committed at
// `tests/literal-union-string-enum-emission.test.ts:94`.
// ===========================================================================

const LOWERED_SEV = '{"type":"string","enum":["high","low"]}';

const LOWERED_BOX =
  '{"type":"object","properties":{"sev":{"$ref":"#/$defs/Sev"},"who":{"type":"string"}},' +
  '"required":["sev","who"],"additionalProperties":false,' +
  '"$defs":{"Sev":{"type":"string","enum":["high","low"]}}}';

const LOWERED_ARRAY_SEV =
  '{"type":"array","items":{"$ref":"#/$defs/Sev"},' +
  '"$defs":{"Sev":{"type":"string","enum":["high","low"]}}}';

// ===========================================================================
// Harness — the real production prompt-mode binding over a real parse.
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
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic — a fixture
 * that stops parsing must never let a bug test pass, or red, for the wrong
 * reason (*No silent test skipping*).
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
 * content-addressing the shipped composition root uses — the
 * `tests/binder-forced-tool-dispatch.test.ts` / `tests/result-value-privacy.test.ts`
 * `realAjvValidator()` pattern. A stub would decide the verdict this file is
 * about, so the real seam is what every cell runs against.
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

/** One observed `validate` call at the runtime's AJV seam. */
interface ValidateRecord {
  readonly schema: LoweredSchema;
  readonly value: unknown;
  readonly verdict: { ok: true } | { ok: false; errors: readonly ValidationError[] };
}

/**
 * A `SchemaValidator` decorator that records what the runtime hands the AJV
 * seam and what verdict comes back, delegating every decision to the injected
 * production validator.
 *
 * The gate this bug is about is
 * `validator.validate(projectForValidation(result.value))`
 * (`src/extension/production-theta-producer.ts:3591`). It is private to
 * `ProductionThetaProducer`, so the seam it calls is the only place a test can
 * observe the argument and the verdict without reaching into the class.
 */
class RecordingSchemaValidator implements SchemaValidator {
  readonly records: ValidateRecord[] = [];
  readonly #inner: SchemaValidator;

  constructor(inner: SchemaValidator) {
    this.#inner = inner;
  }

  compile(schema: LoweredSchema): CompiledValidator {
    const compiled = this.#inner.compile(schema);
    const records = this.records;
    return {
      validate: (value: unknown) => {
        const verdict = compiled.validate(value);
        records.push({ schema, value, verdict });
        return verdict;
      },
    };
  }

  invalidate(schemaSlug: string): void {
    this.#inner.invalidate(schemaSlug);
  }
}

function rootDouble(schemaValidator: SchemaValidator): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    schemaValidator,
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

const CALLEE_PATH = "./kidp.theta";
const PROMPT_FM = "---\nmode: prompt\n---\n";

/**
 * Drive `invoke<annotation>("./kidp.theta")` in a prompt-mode caller against a
 * prompt-mode callee served by `parseCallee`, and return the boundary `Result`
 * together with everything the AJV seam saw.
 *
 * `callerDecls` are the caller's own `enum` / `schema` declarations: an
 * `invoke<T>` annotation is the CALLER's and `#resolveReturnSite`
 * (`src/extension/production-theta-producer.ts:3507`) resolves it there.
 */
async function driveTypedInvoke(input: {
  readonly annotation: string;
  readonly callerDecls: string;
  readonly calleeBody: string;
}): Promise<{ readonly result: ResultValue; readonly records: readonly ValidateRecord[] }> {
  const calleeDoc = parseTheta("kidp.theta", PROMPT_FM + input.calleeBody);
  const callee: ThetaCompositionInput = {
    slashName: "kidp",
    sourcePath: "/theta/kidp.theta",
    frontmatter: calleeDoc.frontmatter as ParsedFrontmatter,
    body: calleeDoc.body,
  };
  const recorder = new RecordingSchemaValidator(realAjvValidator());
  const deps = createProductionProducerDeps({
    // `getActiveTools` / `setActiveTools` satisfy the PIC-17 prompt→prompt
    // suspend window (`runPromptSuspendInvoke`); `sendMessage` satisfies the
    // theta-system-note channel.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(recorder),
    modelRegistry: {} as unknown as ModelRegistry,
    parseCallee: () => Promise.resolve(callee),
  });

  const callerSrc =
    PROMPT_FM + input.callerDecls + `invoke<${input.annotation}>("${CALLEE_PATH}")\n`;
  const callerDoc = parseTheta("caller.theta", callerSrc);
  const theta: ThetaCompositionInput = {
    slashName: "caller",
    sourcePath: "/theta/caller.theta",
    frontmatter: callerDoc.frontmatter as ParsedFrontmatter,
    body: callerDoc.body,
  };
  const bindInput: ConversationBindInput = { theta, args: "", ctx: ctxDouble() };
  const binding = deps.bindPromptConversation(bindInput);
  const execution = await executeBody(theta.body, binding.executeDeps);
  return { result: boundaryResult(execution), records: recorder.records };
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

/** The single recorded `validate` call taken against `expected`, or a loud failure. */
function recordFor(
  records: readonly ValidateRecord[],
  expected: string,
): ValidateRecord {
  const matches = records.filter((r) => JSON.stringify(r.schema) === expected);
  if (matches.length !== 1) {
    throw new Error(
      `precondition unmet: expected exactly one AJV validate call against ${expected}, saw ` +
        `${matches.length} of ${records.length} recorded documents ` +
        `${JSON.stringify(records.map((r) => JSON.stringify(r.schema)))}`,
    );
  }
  return matches[0] as ValidateRecord;
}

/** The observed AJV failure positions, for a red that names where the payload was refused. */
function verdictDetail(record: ValidateRecord): string {
  return record.verdict.ok
    ? ""
    : ` — observed ${JSON.stringify(
        record.verdict.errors.map((e) => `${e.instancePath || "<root>"} ${e.schemaPath}`),
      )}, typeof at the gate ${typeof record.value}`;
}

const SEV_DECL = 'enum Sev { High = "high", Low = "low" }\n';
const BOX_DECL = "schema Box { sev: Sev, who: string }\n";

// ===========================================================================
// (a) The root-position cell — `invoke<Sev>` of a prompt-mode callee whose body
// is `Sev.High`. §Reproduction (a) row `a-prompt`.
// ===========================================================================

describe("bug 0174 (a) — invoke<Sev> of a prompt-mode callee returning a root-position enum variant", () => {
  it("RED (a): the caller receives Ok carrying the tagged variant, not Err(cause: return_validation)", async () => {
    const { result } = await driveTypedInvoke({
      annotation: "Sev",
      callerDecls: SEV_DECL,
      calleeBody: SEV_DECL + "Sev.High\n",
    });

    // PRIMARY. invocation.md:36 — "the final value still propagates through the
    // same return surface". The byte-identical callee as `mode: subagent`
    // returns Ok("high") (§Reproduction (a) row `a-sub`), so the mode is
    // selecting whether the value validates, which :55 gives it no authority to
    // do.
    expect(
      result.ok,
      `PRIMARY (bug 0174): a prompt-mode callee's named-enum final value must reach the caller ` +
        `as Ok — the boxed String carrier reaches AJV unnormalised and ` +
        `{"type":"string","enum":[…]} refuses it${errDetail(result)}`,
    ).toBe(true);
    if (!result.ok) {
      return;
    }

    // runtime-value-model.md:13 — the variant "compares equal to a locally
    // constructed variant of the same enum" is the property the whole tag
    // exists for; :34 states it as the inbound pass's obligation.
    // 0337: `Sev` is declared in BOTH "kidp.theta" (the callee, whose
    // declaration the returned variant actually belongs to) and "caller.theta"
    // (the caller's OWN declaration, which it never wrote) — the two mint
    // distinct declaring keys and compare unequal.
    expect(
      valuesEqual(result.value, makeEnumValue(enumDeclaringKey("/theta/kidp.theta", "Sev"), "high")),
      "the received variant compares equal to a locally constructed Sev.High of the CALLEE's own declaration",
    ).toBe(true);
    expect(
      valuesEqual(result.value, makeEnumValue(enumDeclaringKey("/theta/caller.theta", "Sev"), "high")),
      "0337: the returned variant belongs to the callee's declaration, not the caller's own",
    ).toBe(false);

    // §Fix (b): the callee's OWN value crosses unchanged, so the boxed carrier
    // is still the carrier. A bare primitive here would mean the caller was
    // handed a round-tripped copy (§Fix (a)) — a different route with a
    // different GOV-15 consequence.
    expect(
      typeof result.value,
      "the caller receives the callee's own enum value, whose reference encoding " +
        "(runtime-value-model.md:16) is a boxed String",
    ).toBe("object");

    // runtime-value-model.md:13 — "The tag MUST NOT appear in JSON output
    // (`JSON.stringify` of an enum value yields the bare wire string)".
    expect(
      JSON.stringify(result.value),
      "the received variant still serialises to the bare wire string",
    ).toBe('"high"');
  });
});

// ===========================================================================
// (c) The array-element cell — `invoke<array<Sev>>`. §Reproduction (a) row
// `c-prompt`; the measured failure position is `/0`.
// ===========================================================================

describe("bug 0174 (c) — invoke<array<Sev>> of a prompt-mode callee returning [Sev.High]", () => {
  it("RED (c): the caller receives Ok whose element 0 is the tagged variant", async () => {
    const { result } = await driveTypedInvoke({
      annotation: "array<Sev>",
      callerDecls: SEV_DECL,
      calleeBody: SEV_DECL + "[Sev.High]\n",
    });

    // PRIMARY. The defect applies at any depth: an array element is refused at
    // `instancePath: "/0"` exactly as the root is refused at `""`.
    expect(
      result.ok,
      `PRIMARY (bug 0174): a named-enum ARRAY ELEMENT must not refuse the whole payload` +
        `${errDetail(result)}`,
    ).toBe(true);
    if (!result.ok) {
      return;
    }

    const received = result.value as readonly ThetaValue[];
    expect(Array.isArray(received), "the payload crosses as an array").toBe(true);
    expect(received.length, "one element crosses").toBe(1);
    // 0337: same declaring-key split as cell (a) — the element belongs to the
    // callee's ("kidp.theta") declaration, not the caller's own.
    expect(
      valuesEqual(received[0] as ThetaValue, makeEnumValue(enumDeclaringKey("/theta/kidp.theta", "Sev"), "high")),
      "element 0 compares equal to a locally constructed Sev.High of the CALLEE's own declaration",
    ).toBe(true);
    expect(
      valuesEqual(received[0] as ThetaValue, makeEnumValue(enumDeclaringKey("/theta/caller.theta", "Sev"), "high")),
      "0337: element 0 belongs to the callee's declaration, not the caller's own",
    ).toBe(false);
    expect(typeof received[0], "element 0 is still the boxed carrier").toBe("object");
  });
});

// ===========================================================================
// (f) The object-field cell — `invoke<Box>` over a branded object with one
// named-enum field and one plain `string` field. §Reproduction (a) row
// `f-prompt`; the measured failure position is `/sev`, and the `who` field
// validates, which is what makes this the depth row rather than a root row.
// ===========================================================================

describe("bug 0174 (f) — invoke<Box> of a prompt-mode callee returning Box { sev: Sev.High, who: \"w\" }", () => {
  it("RED (f): the caller receives Ok whose .sev is the tagged variant and whose brand resolves Box", async () => {
    const { result } = await driveTypedInvoke({
      annotation: "Box",
      callerDecls: SEV_DECL + BOX_DECL,
      calleeBody: SEV_DECL + BOX_DECL + 'Box { sev: Sev.High, who: "w" }\n',
    });

    // PRIMARY. One enum field anywhere in a returned schema refuses the whole
    // payload — the sibling `string` field validates on its own.
    expect(
      result.ok,
      `PRIMARY (bug 0174): a named-enum FIELD must not refuse an object whose other field ` +
        `validates${errDetail(result)}`,
    ).toBe(true);
    if (!result.ok) {
      return;
    }

    // runtime-value-model.md:12 — an object value is keyed by theta-side names.
    const received = result.value as { readonly [k: string]: ThetaValue };
    expect(
      schemaTagOf(result.value),
      "the received object is branded with the declared schema name",
    ).toBe("Box");
    // 0337: same declaring-key split as cell (a) — `.sev` belongs to the
    // callee's ("kidp.theta") declaration, not the caller's own.
    expect(
      valuesEqual(received.sev as ThetaValue, makeEnumValue(enumDeclaringKey("/theta/kidp.theta", "Sev"), "high")),
      ".sev compares equal to a locally constructed Sev.High of the CALLEE's own declaration",
    ).toBe(true);
    expect(
      valuesEqual(received.sev as ThetaValue, makeEnumValue(enumDeclaringKey("/theta/caller.theta", "Sev"), "high")),
      "0337: .sev belongs to the callee's declaration, not the caller's own",
    ).toBe(false);
    expect(typeof received.sev, ".sev is still the boxed carrier").toBe("object");
    expect(received.who, ".who crosses unchanged").toBe("w");
  });
});

// ===========================================================================
// (ANYOF) `invoke<Sev | null>` — a named enum under a `{"anyOf":[…]}` root.
//
// THIS CELL PINS PASS-THROUGH OF AN ALREADY-TAGGED VALUE, NOT THE ABSENCE OF
// `anyOf` ARM DISPATCH. Bug 0172 face 2 gives a `{"anyOf":[…]}` position
// first-admitting-arm dispatch (runtime-value-model.md §"Wire-name
// translation", the inbound bullet's union clause): the walk re-tests the
// value against each arm in source order and translates under the first that
// admits it. The callee's own value here is the boxed `String`
// `makeEnumValue` builds (`typeof === "object"`), which neither arm of
// `Sev | null` admits — arm 0 refuses it on its `type: "string"` check, arm 1
// on its `type: "null"` check — so the walk hands it to the caller untouched:
// identity pass-through because the value matches no arm, not because a union
// position stops the walk from dispatching.
//
// It is load-bearing FOR THIS BUG because it separates the settled §Fix (b) from
// the rejected §Fix (a). Measured over the shipped seams: `decodeInboundValue`
// handed the wire PRIMITIVE `"high"` under the `Sev|null` annotation returns a
// bare string that does NOT compare equal to `makeEnumValue("Sev","high")` — so
// a route that translated the PROJECTION would silently bind an untagged value
// here. Route (b) hands the callee's own already-tagged value downstream, and
// the pass passes it through, which is what this cell asserts.
// ===========================================================================

describe("bug 0174 (ANYOF) — invoke<Sev | null> of a prompt-mode callee returning Sev.High", () => {
  it("RED (ANYOF): the caller receives Ok and the already-tagged variant passes through intact", async () => {
    const { result } = await driveTypedInvoke({
      annotation: "Sev | null",
      callerDecls: SEV_DECL,
      calleeBody: SEV_DECL + "Sev.High\n",
    });

    // PRIMARY. The lowered root is `{"anyOf":[{"$ref":"#/$defs/Sev"},{"type":"null"}], …}`
    // and the boxed carrier fails BOTH arms, so the whole union is refused.
    expect(
      result.ok,
      `PRIMARY (bug 0174): a named-enum value under an anyOf root must validate through its ` +
        `enum arm${errDetail(result)}`,
    ).toBe(true);
    if (!result.ok) {
      return;
    }

    // The tag survives because the callee's own value was never replaced — NOT
    // because anything descended into the `anyOf` arm.
    // 0337: same declaring-key split as cell (a) — the pass-through value still
    // belongs to the callee's ("kidp.theta") declaration, not the caller's own.
    expect(
      valuesEqual(result.value, makeEnumValue(enumDeclaringKey("/theta/kidp.theta", "Sev"), "high")),
      "the caller's value is still the callee's tagged variant; an untagged primitive here " +
        "would mean the payload was round-tripped and could not be re-tagged under anyOf",
    ).toBe(true);
    expect(
      valuesEqual(result.value, makeEnumValue(enumDeclaringKey("/theta/caller.theta", "Sev"), "high")),
      "0337: the pass-through value belongs to the callee's declaration, not the caller's own",
    ).toBe(false);
    expect(typeof result.value, "the boxed carrier crossed unchanged").toBe("object");
  });
});

// ===========================================================================
// CONTROLS — the over-reach fence (§Reproduction (b)). The same cell delivers
// every non-enum payload today; a fix that changes any of these has widened past
// this report. GREEN now and after.
// ===========================================================================

describe("bug 0174 CONTROLS — the prompt→prompt cell delivers non-enum payloads unchanged", () => {
  it("CONTROL (d): invoke<string> of a callee returning \"PSTR\" (green now, green after)", async () => {
    const { result } = await driveTypedInvoke({
      annotation: "string",
      callerDecls: "",
      calleeBody: '"PSTR"\n',
    });

    expect(result.ok, `a plain string crosses the cell${errDetail(result)}`).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value, "the string is unchanged").toBe("PSTR");
  });

  it("CONTROL (e): invoke<S> over an enum-FREE schema (green now, green after)", async () => {
    const decls = "schema S { a: string, b: boolean }\n";
    const { result } = await driveTypedInvoke({
      annotation: "S",
      callerDecls: decls,
      calleeBody: decls + 'S { a: "x", b: true }\n',
    });

    expect(result.ok, `an enum-free branded object crosses the cell${errDetail(result)}`).toBe(
      true,
    );
    if (!result.ok) {
      return;
    }
    // The bound content is what a fix must not move: a route that round-tripped
    // the payload (§Fix (a)) changes the identity of this object, and GOV-15
    // (`source-language-stability.md:5`) makes that a change to enumerate.
    expect(result.value, "the caller binds the same content").toEqual({ a: "x", b: true });
    expect(schemaTagOf(result.value), "the schema brand resolves").toBe("S");
    expect(
      Object.keys(result.value as { readonly [k: string]: ThetaValue }),
      "the theta-side key set crosses in declaration order",
    ).toEqual(["a", "b"]);
  });

  it("CONTROL (g): invoke<array<integer>> of a callee returning [1, 2, 3] (green now, green after)", async () => {
    const { result } = await driveTypedInvoke({
      annotation: "array<integer>",
      callerDecls: "",
      calleeBody: "[1, 2, 3]\n",
    });

    expect(result.ok, `an integer array crosses the cell${errDetail(result)}`).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value, "the array is unchanged").toEqual([1, 2, 3]);
  });
});

// ===========================================================================
// SEAM — §Reproduction (c) re-driven over the shipped seams: the real
// `parseThetaDocument`, the real `lowerQueryResponseSchema`
// (`src/runtime/query-schema-lowering.ts:113`), and the production
// `AjvSchemaValidator` (`src/seams/schema-validator.ts:104`) with the shipped
// `JSON.stringify` content-addressing.
// ===========================================================================

/** The `Sev` / `Box` declaration set, parsed exactly as the runtime reads it. */
function fixtureDocument(): ThetaDocument {
  return parseTheta("seam.theta", PROMPT_FM + SEV_DECL + BOX_DECL + "1\n");
}

function declsOf(doc: ThetaDocument): {
  readonly schemas: readonly SchemaDecl[];
  readonly enums: readonly EnumDecl[];
} {
  // The producer reads its declaration sets off the body statements
  // (`schemaDeclsOf` / `enumDeclsOf`,
  // `src/extension/production-theta-producer.ts:5277` / `:5288`); mirroring that
  // keeps the lowering input identical to the runtime's.
  return {
    schemas: doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema"),
    enums: doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum"),
  };
}

function loweredFor(annotation: string): LoweredSchema {
  const doc = fixtureDocument();
  const { schemas, enums } = declsOf(doc);
  const lowered = lowerQueryResponseSchema(annotation, schemas, enums);
  if (lowered === undefined) {
    throw new Error(
      `precondition unmet: '${annotation}' lowered to nothing, so no AJV verdict is observable`,
    );
  }
  return lowered;
}

describe("bug 0174 SEAM-1 — the lowering and the carrier, measured at the shipped seams", () => {
  it("MECHANISM (SEAM-1a): a named enum lowers to a {\"type\":\"string\", …} fragment at every depth (green now, green after)", () => {
    expect(JSON.stringify(loweredFor("Sev")), "the root-position fragment").toBe(LOWERED_SEV);
    expect(JSON.stringify(loweredFor("Box")), "the named-enum FIELD lowers through $ref").toBe(
      LOWERED_BOX,
    );
    expect(
      JSON.stringify(loweredFor("array<Sev>")),
      "the named-enum ELEMENT lowers through $ref",
    ).toBe(LOWERED_ARRAY_SEV);
  });

  it("MECHANISM (SEAM-1b): the enum carrier is a boxed String whose JSON projection is the bare wire string (green now, green after)", () => {
    const variant = makeEnumValue("Sev", "high");
    // runtime-value-model.md:16 (non-normative reference encoding) — the cost of
    // the carrier that discharges :13 is `typeof === "object"`.
    expect(typeof variant, "the reference encoding boxes the wire string").toBe("object");
    expect(JSON.stringify(variant), "the tag never appears in JSON output").toBe('"high"');
  });

  it("MECHANISM (SEAM-1c): AJV is a structural surface — the seam admits the primitive and refuses the box (green now, green after under §Fix (b))", () => {
    // SECONDARY / route-shaped. The settled route (§Fix (b)) does NOT teach the
    // `AjvSchemaValidator` seam about the enum carrier — it computes a wire-form
    // projection at the invoke boundary and leaves the seam alone — so this stays
    // true, and the fix's obligation is that the shipped gate never hands the
    // seam a boxed value (SEAM-2). Under §Fix (c) (normalise inside the seam)
    // this row moves and must be updated with the route.
    const validator = realAjvValidator();
    const sev = validator.compile(loweredFor("Sev"));

    expect(sev.validate("high"), "the wire primitive validates").toEqual({ ok: true });

    const boxedVerdict = sev.validate(makeEnumValue("Sev", "high"));
    expect(boxedVerdict.ok, "the seam refuses the boxed carrier structurally").toBe(false);
    if (boxedVerdict.ok) {
      return;
    }
    expect(
      boxedVerdict.errors.map((e) => `${e.instancePath}|${e.schemaPath}|${e.message}`),
      "a named enum fails `type` and `enum` together, which is why its error list carries two " +
        "entries where a bare {\"type\":\"string\"} carries one",
    ).toEqual([
      "|#/type|must be string",
      "|#/enum|must be equal to one of the allowed values",
    ]);
  });
});

describe("bug 0174 SEAM-2 — the verdict the shipped invoke gate actually takes", () => {
  it("RED (SEAM-2a): the AJV verdict on the root-position enum return is {ok:true}", async () => {
    const { records } = await driveTypedInvoke({
      annotation: "Sev",
      callerDecls: SEV_DECL,
      calleeBody: SEV_DECL + "Sev.High\n",
    });
    const record = recordFor(records, LOWERED_SEV);

    // PRIMARY. The verdict is the observable §Reproduction (c) measures at
    // `instancePath: ""`; it is route-agnostic — every §Fix candidate makes it
    // `{ok:true}`.
    expect(
      record.verdict.ok,
      `PRIMARY (bug 0174): the gate at production-theta-producer.ts:3591 must take a passing ` +
        `verdict for a callee's own Sev.High${verdictDetail(record)}`,
    ).toBe(true);

    // SECONDARY / route-shaped (§Fix (b): "Compute the wire-form projection for
    // the AJV call only"). What the gate hands the seam is a wire form; what the
    // caller receives is still the boxed carrier, asserted in cell (a).
    expect(
      typeof record.value,
      "the value handed to the AJV seam is the payload's wire form",
    ).toBe("string");
  });

  it("RED (SEAM-2b): the AJV verdict on a named-enum FIELD (/sev) is {ok:true}", async () => {
    const { records } = await driveTypedInvoke({
      annotation: "Box",
      callerDecls: SEV_DECL + BOX_DECL,
      calleeBody: SEV_DECL + BOX_DECL + 'Box { sev: Sev.High, who: "w" }\n',
    });
    const record = recordFor(records, LOWERED_BOX);

    expect(
      record.verdict.ok,
      `PRIMARY (bug 0174): the refusal at instancePath "/sev" must not fire for a branded object ` +
        `whose enum field is the callee's own variant${verdictDetail(record)}`,
    ).toBe(true);

    const seen = record.value as { readonly [k: string]: unknown };
    expect(typeof seen.sev, "the enum FIELD reaches the seam in wire form").toBe("string");
    // The SCHEMA_TAG brand is invisible to AJV either way — a non-enumerable
    // symbol is not walked by `Object.entries` (bug 0020's privacy posture,
    // `src/runtime/value.ts:186`) — so the projection and the value agree on
    // structure, which is what keeps the reported `instancePath` addressable
    // (§Fix (b), second bullet).
    expect(seen.who, "the sibling string field is unchanged at the seam").toBe("w");
  });

  it("RED (SEAM-2c): the AJV verdict on a named-enum ELEMENT (/0) is {ok:true}", async () => {
    const { records } = await driveTypedInvoke({
      annotation: "array<Sev>",
      callerDecls: SEV_DECL,
      calleeBody: SEV_DECL + "[Sev.High]\n",
    });
    const record = recordFor(records, LOWERED_ARRAY_SEV);

    expect(
      record.verdict.ok,
      `PRIMARY (bug 0174): the refusal at instancePath "/0" must not fire for an array of the ` +
        `callee's own variants${verdictDetail(record)}`,
    ).toBe(true);

    const seen = record.value as readonly unknown[];
    expect(Array.isArray(seen), "the element container reaches the seam as an array").toBe(true);
    expect(typeof seen[0], "the enum ELEMENT reaches the seam in wire form").toBe("string");
  });
});

// ===========================================================================
// BOXED PASS-THROUGH — the reading §Fix (b) rests on, exercised rather than
// read.
//
// §Fix (b): "`rebuildInbound` passes a boxed `String` through (`isPlainObject`
// excludes `value instanceof String`) and its re-tag arm tests `typeof value ===
// "string"`, so an already-tagged boxed value is neither re-tagged nor damaged.
// Verified by reading at HEAD; a route must witness it rather than rely on the
// reading." This is that witness, driven through the shipped post-AJV step
// `#validateInvokeReturn` calls — `decodeInboundValue`
// (`src/runtime/inbound-boundary.ts:59`) at
// `src/extension/production-theta-producer.ts:3594` — with the real lowered
// document.
//
// `isPlainObject` (`src/runtime/wire-translation.ts:78`) excludes
// `value instanceof String` at `:83`, and the named-enum re-tag arm
// (`rebuildInbound`, `:240`) tests `typeof value === "string"` at `:248`.
//
// CONTROL: green at HEAD. It witnesses an existing property the fix relies on,
// not a behaviour the fix introduces.
// ===========================================================================

describe("bug 0174 BOXED PASS-THROUGH — the post-AJV inbound pass over an already-tagged value", () => {
  it("CONTROL: a boxed enum handed to decodeInboundValue comes back as the SAME reference, still tagged (green now, green after)", () => {
    const doc = fixtureDocument();
    const variant = makeEnumValue("Sev", "high");
    const decoded = decodeInboundValue({
      lowered: loweredFor("Sev") as unknown as Record<string, unknown>,
      annotation: "Sev",
      schemaNames: declaredNames(doc.body, "schema"),
      enumNames: declaredNames(doc.body, "enum"),
      validated: variant,
    });

    expect(
      decoded === (variant as unknown as ThetaValue),
      "the walk neither re-tags nor rebuilds an already-tagged boxed value",
    ).toBe(true);
    expect(
      valuesEqual(decoded, makeEnumValue("Sev", "high")),
      "and it still compares equal to a locally constructed variant",
    ).toBe(true);
    expect(typeof decoded, "the carrier is intact").toBe("object");
  });

  it("CONTROL: a branded Box whose .sev is boxed keeps its brand and its tagged field (green now, green after)", () => {
    const doc = fixtureDocument();
    const branded = brandSchemaValue({ sev: makeEnumValue("Sev", "high"), who: "w" }, "Box");
    const decoded = decodeInboundValue({
      lowered: loweredFor("Box") as unknown as Record<string, unknown>,
      annotation: "Box",
      schemaNames: declaredNames(doc.body, "schema"),
      enumNames: declaredNames(doc.body, "enum"),
      validated: branded,
    });

    const fields = decoded as { readonly [k: string]: ThetaValue };
    expect(schemaTagOf(decoded), "the schema brand still resolves").toBe("Box");
    expect(typeof fields.sev, ".sev stays the boxed carrier").toBe("object");
    expect(
      valuesEqual(fields.sev as ThetaValue, makeEnumValue("Sev", "high")),
      ".sev stays tagged",
    ).toBe(true);
    expect(fields.who, ".who is untouched").toBe("w");
  });
});

// ===========================================================================
// SUBAGENT LEG — constraint §Fix (d)(4): the leg that already passes does not
// move. This is the normalisation the prompt cell lacks, measured at the same
// seams (§Reproduction (d)).
// ===========================================================================

describe("bug 0174 SUBAGENT LEG — the PIC-59 envelope normalises the carrier incidentally", () => {
  it("CONTROL: serializeOkEnvelope collapses the boxed carrier to a JSON primitive that AJV admits (green now, green after)", () => {
    const variant = makeEnumValue("Sev", "high");

    // `serializeOkEnvelope` (`src/runtime/subagent-envelope.ts:94`) is
    // `JSON.stringify` of the payload; the parent re-reads it with
    // `parseEnvelopeLine` (`:149`).
    const line = serializeOkEnvelope(variant);
    expect(line, "the PIC-59 line carries the bare wire string").toBe(
      '{"theta_result":{"v":1,"ok":"high"}}\n',
    );

    const parsed = parseEnvelopeLine(line.trimEnd());
    expect(parsed.kind, "the parent re-reads an ok envelope").toBe("ok");
    if (parsed.kind !== "ok") {
      return;
    }
    expect(
      typeof parsed.value,
      "a process boundary is a JSON boundary — the value arrives a primitive",
    ).toBe("string");
    expect(
      realAjvValidator().compile(loweredFor("Sev")).validate(parsed.value),
      "which is why the subagent leg's verdict passes and must keep passing",
    ).toEqual({ ok: true });
  });
});
