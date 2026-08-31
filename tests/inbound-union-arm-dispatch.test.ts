import { beforeEach, describe, expect, it, vi } from "vitest";

// The scripted off-session `complete()` reply queue the typed-query cell below
// drives, selected by recorded call index (the `tests/respond-tool-wire.test.ts`
// harness discipline reproduced in `tests/inbound-boundary-typed-query.test.ts`).
// `vi.hoisted` so the `vi.mock` factory — hoisted above every import — closes
// over a mutable holder. An unscripted dispatch fails loudly rather than
// returning a stub. Every other cell in this file contacts no provider seam at
// all, so the mock is inert for them.
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

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  parseThetaDocument,
  type EnumDecl,
  type ParseThetaDocumentDeps,
  type SchemaDecl,
  type ThetaDocument,
} from "../src/parser/theta-document";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { ThetaSource } from "../src/lexer/lexer";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import {
  buildInboundTranslationPlan,
  type InboundTranslationPlan,
} from "../src/parser/schema-lowering";
import { bindParamsInbound, decodeInboundValue } from "../src/runtime/inbound-boundary";
import { translateInbound } from "../src/runtime/wire-translation";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import {
  composeThetaFixture,
  type BinderRunInput,
  type BinderRunResult,
  type ConversationBinding,
  type ConversationBindInput,
  type ThetaCompositionInput,
  type ThetaProducerDeps,
} from "../src/extension/theta-composition-producer";
import { fillDefaultsAndRevalidate } from "../src/binder/defaulting";
import {
  createEffectfulStatementHost,
  type EffectfulStatementHostDeps,
  type QueryHostDispatch,
} from "../src/runtime/effectful-statement-host";
import { buildEnvironment, enumDeclaringKey } from "../src/runtime/lexical-environment";
import { executeBody, type BodyExecution, type ExecuteBodyDeps } from "../src/runtime/statement-executor";
import type {
  CommittedConversationMutator,
  CommittedSurface,
} from "../src/runtime/terminal-outcomes";
import type { CodeSideToolCall, ToolLoweringSink } from "../src/runtime/tool-call-execute";
import type { InvokeChild } from "../src/runtime/invoke-cancellation";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { QueryError } from "../src/runtime/query-error";
import type { RuntimeRoot } from "../src/runtime-root";
import { createProductionSpawnFn } from "../src/extension/production-subagent-host";
import { driveSubagentChild } from "../src/runtime/subagent-json-driver";
import {
  launchSubagentChild,
  SUBAGENT_EXTENSION_PIN_ENV,
  type ChildExitInfo,
  type ExecutableHost,
} from "../src/runtime/subagent-launcher";
import { SUBAGENT_PARAMS_ENV, SUBAGENT_PARAMS_FILE_ENV } from "../src/runtime/subagent-params";
import { WallClock } from "../src/seams/wall-clock";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
  type SchemaValidator,
} from "../src/seams/schema-validator";
import {
  brandSchemaValue,
  makeEnumValue,
  makeOk,
  schemaTagOf,
  valuesEqual,
  type ResultValue,
  type ThetaValue,
} from "../src/runtime/value";

// Bug 0172 face 2 — a value inside a `{"anyOf":[…]}` arm receives no enum tag,
// no schema brand and no descent. The inbound sidecar is keyed by JSON Pointer
// into the lowered fragment (`docs/spec_topics/schema-subset.md:87`, Lowering
// Algorithm step 5) and `anyOf` has no image in the data space the way
// `properties` and `items` do, so no map in the derived plan addresses the
// position and the walk hands the value on exactly as AJV admitted it
// (`src/runtime/wire-translation.ts:45`, `:137`). `invoke<Sev>` therefore binds
// a tagged variant while `invoke<Sev | null>` binds a bare string.
//
// THE RULE THESE CELLS ENCODE — first-ADMITTING-arm dispatch. Given a value AJV
// admitted against `{"anyOf":[A,B,…]}`, the value is re-tested against each arm
// in SOURCE ORDER and translated under the FIRST arm that admits it. Source
// order is the arm order the lowered document already carries
// (`docs/spec_topics/schema-subset.md:85`, *Array element order*: "`anyOf` lists
// variants in source order"), so the dispatch is deterministic; two arms that
// both admit are settled first-match-wins by that same order. The re-test goes
// through the CALLER'S OWN `SchemaValidator`
// (`src/seams/schema-validator.ts:104`) — the seam whose verdict admitted the
// value — so an arm compiles through the same content-addressed
// compiled-validator cache (`:116`) rather than a second validation route.
//
// WHAT IS RED HERE AND WHY. Nineteen cells: FIFTEEN RED on the missing
// dispatch, FOUR CONTROLs. Every cell asserts the END STATE — `valuesEqual`
// against a locally constructed variant, and `schemaTagOf` — never the JSON
// projection, which is byte-identical either way. The reds fall in three
// groups:
//
//   • The nine dispatch cells and the brand cell drive the real
//     `lowerQueryResponseSchema`, the real `AjvSchemaValidator`, the shipped
//     `buildInboundTranslationPlan` and the shipped inbound walk over a
//     hand-supplied payload, threading the arm-re-test seam into the walk's own
//     input.
//   • `RED (params-union-field)` drives the same walk over the `params:`
//     lowering instead — the theta's own `frontmatter.params.loweredSchema` —
//     through `bindParamsInbound`.
//   • The last four drive one PRODUCTION inbound boundary each, end to end:
//     the typed-query decode step through the shipped producer, the
//     binder-`args` projection through the composition entry, the `invoke`
//     return trampoline and the child-side `params:` intake across a real
//     spawned child. A boundary reaches the dispatch only by handing the shared
//     step its own `SchemaValidator`, so these four are what keep each
//     boundary's thread line load-bearing rather than silently droppable.
//
// The CONTROLs (`no-subtraction`, `boxed-carrier-passthrough`, `anonymous-arm`,
// `typed-query-premises`) hold now and must still hold once the dispatch lands;
// they are not weakened reds.
//
// TIER: offline, provider-free and deterministic throughout. Unit for every
// cell whose observable is the value one walk produces from a lowered document
// and a payload; integration for the two that spawn a real child, which is the
// only provenance where an enum value crosses as the bare wire string an arm
// can admit (an in-process carrier is a boxed `String` that no arm admits — the
// `boxed-carrier-passthrough` control pins exactly that). No higher tier adds
// an observable: a live model would vary the payload, not the walk.
//
// Spec: runtime-value-model.md:34 (§Wire-name translation, the inbound bullet —
// the enum-tag reattachment obligation and its four-boundary closing sentence),
// :13 (the enum row: a variant carries the wire string plus the declaring-enum
// tag, and cross-enum equality compares both), :22 (the cross-type rule an
// untagged variant falls into); schema-subset.md:81 (SUBS-1 — a union with any
// non-primitive arm lowers to `anyOf`, so `Sev | null` is a union position by
// specification), :85 (arm order is source order), :87 (the step-5 sidecar).
// Bug doc: docs/bugs/0172-inbound-translation-pass-unperformed-at-three-boundaries.md:479
// (§Reproduction (f), the measured rows) and :812 (§Fix "Face 2 — union
// (`anyOf`) arms", whose candidate 1 is the rule above).

// --- Substrate -------------------------------------------------------------

function makeParseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/**
 * Parse `src` and refuse anything that did not load cleanly. A theta carrying a
 * load error lowers no declarations, so a cell driving it would assert over an
 * empty document instead of a union position.
 */
function loadFixture(src: string, path: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, makeParseDeps());
  const errors = doc.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `harness: ${path} did not load cleanly, so its declarations did not lower and no cell ` +
        `below drives a real document: ${JSON.stringify(errors)}`,
    );
  }
  return doc;
}

function schemaDeclsOf(doc: ThetaDocument): readonly SchemaDecl[] {
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

function enumDeclsOf(doc: ThetaDocument): readonly EnumDecl[] {
  return doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
}

/** The production content-addressing of `src/extension/production-composition.ts:3789-3818`. */
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
 * The declarations every annotation below resolves against: one named `enum`
 * and one named `schema` whose only field is of that enum's type, so a union
 * arm can be tested at the root position and one level down in the same
 * fixture.
 */
const UNION_SOURCE = [
  'enum Sev { High = "high", Low = "low" }',
  "schema Box { sev: Sev }",
  "Sev.High",
  "",
].join("\n");

const UNION_DOC = loadFixture(UNION_SOURCE, "union-arm-dispatch.theta");

/**
 * One inbound boundary's inputs for a single annotation: the lowered document
 * its verdict is taken against, the validator that takes it, and the shipped
 * plan the walk reads.
 *
 * The validator is constructed per boundary, never shared across cells: its
 * compiled-validator cache is per-instance state, and the dispatch rule fixes
 * that an arm re-test reuses the CALLER'S cache — the one cell's own — not some
 * ambient one.
 */
interface UnionBoundary {
  readonly annotation: string;
  readonly validator: AjvSchemaValidator;
  readonly lowered: Record<string, unknown>;
  readonly plan: InboundTranslationPlan;
}

/** Lower `annotation` against `doc`'s declarations and derive the shipped inbound plan. */
function boundaryFor(annotation: string, doc: ThetaDocument): UnionBoundary {
  const schemas = schemaDeclsOf(doc);
  const enums = enumDeclsOf(doc);
  const lowered = lowerQueryResponseSchema(annotation, schemas, enums);
  if (lowered === undefined) {
    throw new Error(
      `harness: the annotation \`${annotation}\` produced no lowered document, so there is ` +
        `nothing for AJV to admit and no plan for the inbound walk to read`,
    );
  }
  const document = lowered as Record<string, unknown>;
  return {
    annotation,
    validator: realAjv(),
    lowered: document,
    plan: buildInboundTranslationPlan({
      lowered: document,
      annotation,
      schemaNames: new Set(schemas.map((decl) => decl.name)),
      enumNames: new Set(enums.map((decl) => decl.name)),
    }),
  };
}

/**
 * The boundary's own AJV verdict over `payload`, as a PRECONDITION.
 * runtime-value-model.md:34 orders the pass "after AJV validation against the
 * lowered schema", so a payload the boundary refuses reaches no walk at all and
 * a red beneath it would say nothing about arm dispatch.
 */
function requireAdmitted(boundary: UnionBoundary, payload: unknown): void {
  const verdict = boundary.validator.compile(boundary.lowered).validate(payload);
  if (!verdict.ok) {
    throw new Error(
      `harness: the real AjvSchemaValidator refused ${JSON.stringify(payload)} against ` +
        `\`${boundary.annotation}\`, so this cell drives no inbound walk: ` +
        JSON.stringify(verdict.errors),
    );
  }
}

/**
 * The lowered document's root `anyOf` arms, in source order. Refuses an
 * annotation that lowered to something else, so a cell claiming to drive a
 * union position cannot silently drive a plain one.
 */
function rootArmsOf(boundary: UnionBoundary): readonly unknown[] {
  const arms = boundary.lowered["anyOf"];
  if (!Array.isArray(arms)) {
    throw new Error(
      `harness: \`${boundary.annotation}\` did not lower to a root \`anyOf\`, so there is no ` +
        `union position to dispatch over: ${JSON.stringify(boundary.lowered)}`,
    );
  }
  return arms;
}

/**
 * Run the shipped inbound walk over `value`, threading the boundary's own
 * validator as the seam an arm re-test compiles through.
 */
function walkInbound(boundary: UnionBoundary, value: unknown): ThetaValue {
  return translateInbound({
    validated: value,
    sidecars: boundary.plan.sidecars,
    rootDef: boundary.plan.rootDef,
    schemaNames: boundary.plan.schemaNames,
    schemaValidator: boundary.validator,
  });
}

/** The one field of a rebuilt `Box`, read positionally so a missing key reads as `undefined`. */
function sevFieldOf(value: ThetaValue): ThetaValue {
  return (value as { readonly sev: ThetaValue }).sev;
}

// ===========================================================================
// RED — §Reproduction (f)'s rows, each asserting the end state
// runtime-value-model.md:34 specifies rather than the value HEAD produces.
// ===========================================================================

describe("bug 0172 face 2 — first-admitting-arm dispatch at a lowered anyOf position", () => {
  it("RED (union-enum-root): `Sev | null` over \"high\" is tagged under arm 0", () => {
    const boundary = boundaryFor("Sev | null", UNION_DOC);
    requireAdmitted(boundary, "high");
    // The premise the cell rests on: SUBS-1 (schema-subset.md:81) makes this a
    // two-arm union, and the plan registers the root under its reserved key
    // because the annotation is not a bare declared name — so nothing the walk
    // reads at the root position names `Sev`.
    expect(rootArmsOf(boundary)).toHaveLength(2);
    expect(boundary.plan.rootDef).toBe("#root");

    const rebuilt = walkInbound(boundary, "high");

    expect(
      valuesEqual(rebuilt, makeEnumValue("Sev", "high")),
      "runtime-value-model.md:34 — the string admitted by arm 0 (`$ref` to the declared enum " +
        "`Sev`) carries that enum's tag, so it compares equal to a locally constructed variant",
    ).toBe(true);
    // The wire projection is identical on both sides of the dispatch, which is
    // why it cannot witness this bug: the enum carrier serialises to the bare
    // wire string (runtime-value-model.md:13).
    expect(JSON.stringify(rebuilt)).toBe('"high"');
  });

  it("RED (union-schema-root): `Box | null` over an object is branded and descended into", () => {
    const boundary = boundaryFor("Box | null", UNION_DOC);
    const payload = JSON.parse('{"sev":"high"}') as Record<string, unknown>;
    requireAdmitted(boundary, payload);
    expect(rootArmsOf(boundary)).toHaveLength(2);

    const rebuilt = walkInbound(boundary, payload);

    expect(
      schemaTagOf(rebuilt),
      "the object admitted by arm 0 (`$ref` to the declared schema `Box`) is rebuilt under that " +
        "entry, so `schemaTagOf` recovers the declaring schema exactly as at a non-union position",
    ).toBe("Box");
    expect(
      valuesEqual(sevFieldOf(rebuilt), makeEnumValue("Sev", "high")),
      "the descent reaches `Box`'s own `/properties/sev` named-enum position, which is the half " +
        "that compounds: an undescended arm loses the nested tag as well as the brand",
    ).toBe(true);
    expect(valuesEqual(rebuilt, brandSchemaValue({ sev: makeEnumValue("Sev", "high") }, "Box"))).toBe(
      true,
    );
  });

  it("RED (union-array-element): `array<Sev | null>` tags the element at its own depth", () => {
    const boundary = boundaryFor("array<Sev | null>", UNION_DOC);
    requireAdmitted(boundary, ["high"]);
    // The union sits at `/items`, not at the root, so this cell also pins that
    // the dispatch is per-position rather than root-only.
    expect(boundary.lowered["type"]).toBe("array");

    const rebuilt = walkInbound(boundary, ["high"]) as readonly ThetaValue[];

    expect(rebuilt).toHaveLength(1);
    expect(
      valuesEqual(rebuilt[0] as ThetaValue, makeEnumValue("Sev", "high")),
      "runtime-value-model.md:34 — tags attach at the same depth as the value the schema " +
        "annotates, so an element inside a union arm is tagged in place",
    ).toBe(true);
  });

  it("RED (union-array-arm): `array<Sev> | null` mints the array arm's own entry and tags its element", () => {
    const boundary = boundaryFor("array<Sev> | null", UNION_DOC);
    requireAdmitted(boundary, ["high"]);
    expect(rootArmsOf(boundary)).toEqual([
      { type: "array", items: { $ref: "#/$defs/Sev" } },
      { type: "null" },
    ]);

    const rebuilt = walkInbound(boundary, ["high"]) as readonly ThetaValue[];

    expect(rebuilt).toHaveLength(1);
    expect(
      valuesEqual(rebuilt[0] as ThetaValue, makeEnumValue("Sev", "high")),
      "runtime-value-model.md:34 — the arm that admits is an `array<Sev>`, so the walk descends " +
        "into it and tags the element at its own depth",
    ).toBe(true);

    // WHY the value above can be tagged at all. An array ARM is not addressable
    // from the enclosing fragment the way an array FIELD is — a field's element
    // hangs off the field's own pointer by `/items`, an arm's has no pointer at
    // all — so the plan mints a `$defs` key for the arm, and the element's
    // named-enum position lives in that minted entry's own sidecar. With no
    // mint the walk reaches the array and finds nothing describing its
    // elements.
    const minted = boundary.plan.sidecars.get("##root/anyOf/0");
    expect(
      minted?.namedEnumPositions,
      "the array arm resolves a minted `$defs` entry whose sidecar carries the element's " +
        "named-enum position",
    ).toEqual([{ pointer: "/items", enumName: "Sev" }]);
    expect(
      boundary.plan.schemaNames.has("##root/anyOf/0"),
      "a minted key names no declaration, so the rebuilt array is branded with nothing",
    ).toBe(false);
  });

  it("RED (union-array-arm-nested): the minted array arm carries its own `/items` union", () => {
    // The compounding row: a union arm whose own element position is a union.
    // The minted entry is classified in place at its own root, so it carries an
    // arms map rather than a named-enum one, and the element's tag comes from a
    // SECOND dispatch one level down.
    const boundary = boundaryFor("array<Sev | null> | null", UNION_DOC);
    requireAdmitted(boundary, ["high"]);

    const rebuilt = walkInbound(boundary, ["high"]) as readonly ThetaValue[];

    expect(rebuilt).toHaveLength(1);
    expect(
      valuesEqual(rebuilt[0] as ThetaValue, makeEnumValue("Sev", "high")),
      "the dispatch is per-position at every depth: the root arm names the array, the element " +
        "arm names `Sev`, and the tag lands on the element",
    ).toBe(true);

    const minted = boundary.plan.sidecars.get("##root/anyOf/0");
    expect(
      minted?.namedEnumPositions,
      "the minted entry describes the element as a union rather than as a named enum, so its " +
        "named-enum map is empty and the tag comes from the second dispatch",
    ).toEqual([]);
    expect(
      (minted?.unionArms ?? []).map((position) => position.pointer),
      "the minted fragment carries its OWN union position at `/items`",
    ).toEqual(["/items"]);
  });

  it("RED (source-order-arm-0): `Sev | Box` over a string is governed by the enum arm", () => {
    const boundary = boundaryFor("Sev | Box", UNION_DOC);
    requireAdmitted(boundary, "high");
    expect(rootArmsOf(boundary)).toEqual([{ $ref: "#/$defs/Sev" }, { $ref: "#/$defs/Box" }]);

    const rebuilt = walkInbound(boundary, "high");

    expect(
      valuesEqual(rebuilt, makeEnumValue("Sev", "high")),
      "arm 0 (`Sev`) admits the string, so it governs",
    ).toBe(true);
  });

  it("RED (source-order-arm-1): the same `Sev | Box` over an object is governed by the schema arm", () => {
    // The pair above and this one share one annotation and one arm order, so
    // together they show the dispatch is a RE-TEST of the value rather than a
    // fixed choice of arm 0: the same lowered document sends a string to arm 0
    // and an object to arm 1.
    const boundary = boundaryFor("Sev | Box", UNION_DOC);
    const payload = JSON.parse('{"sev":"high"}') as Record<string, unknown>;
    requireAdmitted(boundary, payload);
    expect(rootArmsOf(boundary)).toEqual([{ $ref: "#/$defs/Sev" }, { $ref: "#/$defs/Box" }]);
    // Arm 0 refuses this value, so first-match cannot be satisfied there.
    const arm0 = { ...(rootArmsOf(boundary)[0] as Record<string, unknown>), $defs: boundary.lowered["$defs"] };
    expect(boundary.validator.compile(arm0 as LoweredSchema).validate(payload).ok).toBe(false);

    const rebuilt = walkInbound(boundary, payload);

    expect(schemaTagOf(rebuilt), "arm 1 (`Box`) is the first that admits, so it governs").toBe("Box");
    expect(valuesEqual(sevFieldOf(rebuilt), makeEnumValue("Sev", "high"))).toBe(true);
  });

  it('RED (first-match-wins): `Sev | "high"` is adjudicated by arm order, not by ambiguity', () => {
    const boundary = boundaryFor('Sev | "high"', UNION_DOC);
    requireAdmitted(boundary, "high");
    const arms = rootArmsOf(boundary);
    expect(arms).toHaveLength(2);
    // BOTH arms admit `"high"`: arm 0 is the `Sev` `$ref`, and the
    // string-literal arm admits the literal's own value. The dispatch is
    // adjudicated FIRST-MATCH-WINS on schema-subset.md:85's source order, so arm
    // 0 governs and the value is tagged — the ambiguity is settled by the rule
    // rather than left to make the tag depend on a sibling arm's shape.
    //
    // THE PREMISE MOVED; THE SUBJECT DID NOT. Bug 0172's own residual 1 filed
    // the lowering defect this cell's premise rested on: at 0.102.0 arm 1 was
    // the EMPTY schema (`expect(arms[1]).toEqual({})`), which admits EVERY
    // value, so it also admitted `"low"`, `7` and `null`. Bug 0184 §Fix routes
    // the union-ARM recursion through the literal sublanguage, so arm 1 is now
    // schema-subset.md:79's `{"const":"high"}` — and this cell is STILL a real
    // both-arms-admit witness, because both arms admit `"high"` under the new
    // bytes too (bug 0184 §Reproduction (c) measured exactly that). What the fix
    // removes is the arm's over-admission, which is why the `"low"` row below is
    // now the discriminating case: `"low"` is admitted by arm 0 ONLY, so it is
    // tagged whichever order the two arms are written in, and the first-match
    // adjudication is doing work on `"high"` alone. Bug 0184 §Fix is the
    // authority that moved the premise; the subject — arm order settles a value
    // BOTH arms admit — is bug 0172 §Fix face 2's and is unchanged.
    expect(arms[0]).toEqual({ $ref: "#/$defs/Sev" });
    expect(
      arms[1],
      "schema-subset.md:79 gives the literal arm `{ \"const\": <value> }`; the EMPTY schema this " +
        "arm carried before bug 0184 §Fix admits every JSON value, which is what made the enum " +
        "tag a function of arm ORDER rather than of the value",
    ).toEqual({ const: "high" });
    expect(
      boundary.validator.compile(arms[1] as LoweredSchema).validate("high"),
      "the both-arms-admit premise on the literal's OWN value, which survives the fix: this is " +
        "what keeps first-match-wins the rule that decides the outcome for `\"high\"`",
    ).toEqual({
      ok: true,
    });
    // The arm's over-admission is gone: each of these is admitted by arm 0 and
    // refused by arm 1, so no ambiguity arises for them at all.
    for (const overAdmitted of ["low", 7, null] as const) {
      expect(
        boundary.validator.compile(arms[1] as LoweredSchema).validate(overAdmitted).ok,
        `the literal arm declares exactly \`"high"\`, so ${JSON.stringify(overAdmitted)} must be ` +
          `REFUSED by it (bug 0184 §Fix); an arm admitting it is the empty schema this cell's ` +
          `premise used to pin`,
      ).toBe(false);
    }

    const rebuilt = walkInbound(boundary, "high");

    expect(valuesEqual(rebuilt, makeEnumValue("Sev", "high"))).toBe(true);

    // THE DISCRIMINATING ROW. `"low"` is admitted by arm 0 only, under BOTH
    // spellings of the two arms, so its tag follows the VALUE rather than the
    // arm order — which is the property the empty arm destroyed and the
    // `{"const":"high"}` arm restores. The reversed spelling is read here as
    // well, because that is the spelling whose empty FIRST arm stripped the tag
    // from every value (bug 0184 §Reproduction (e)).
    for (const annotation of ['Sev | "high"', '"high" | Sev']) {
      const lowBoundary = boundaryFor(annotation, UNION_DOC);
      requireAdmitted(lowBoundary, "low");
      expect(
        valuesEqual(walkInbound(lowBoundary, "low"), makeEnumValue("Sev", "low")),
        `runtime-value-model.md:34 — \`@<${annotation}>\` over \`"low"\` has exactly ONE ` +
          `admitting arm (the \`Sev\` \`$ref\`), so first-match-wins selects it whichever ` +
          `position it is written in and the value is tagged. With an EMPTY literal arm the ` +
          `reversed spelling took that arm instead and the tag disappeared`,
      ).toBe(true);
    }
  });

  it("RED (decode-inbound-step): the shared boundary step tags a `Sev | null` payload", () => {
    // `decodeInboundValue` (`src/runtime/inbound-boundary.ts:59`) is the plan
    // derivation and the walk composed — the step all four inbound boundaries
    // of runtime-value-model.md:34 route through — so the dispatch has to be
    // reachable from a boundary's own inputs, not only from a pre-derived plan.
    const boundary = boundaryFor("Sev | null", UNION_DOC);
    requireAdmitted(boundary, "high");

    const decoded = decodeInboundValue({
      lowered: boundary.lowered,
      annotation: "Sev | null",
      schemaNames: new Set(schemaDeclsOf(UNION_DOC).map((decl) => decl.name)),
      enumNames: new Set(enumDeclsOf(UNION_DOC).map((decl) => decl.name)),
      validated: "high",
      schemaValidator: boundary.validator,
    });

    expect(valuesEqual(decoded, makeEnumValue("Sev", "high"))).toBe(true);
  });
});

/**
 * A union whose first arm is an INLINE object. Lowering hoists such an arm to a
 * `__inline_<slug>` `$defs` entry (schema-subset.md §"Lowering Algorithm" step
 * 2), which is a real entry the walk can re-enter but NOT a declared `schema`
 * name — so nothing brands the rebuilt record from the arm itself.
 */
const INLINE_ARM_SOURCE = [
  "schema Person2 { name: string }",
  'Person2 { name: "x" }',
  "",
].join("\n");

const INLINE_ARM_DOC = loadFixture(INLINE_ARM_SOURCE, "union-arm-inline.theta");

describe("bug 0172 face 2 — an arm resolving a non-declared entry cannot subtract a brand", () => {
  it("RED (non-declared-arm-brand): the rebuild under a hoisted inline arm re-installs the incoming brand", () => {
    const boundary = boundaryFor("{ name: string } | null", INLINE_ARM_DOC);
    const armRef = (rootArmsOf(boundary)[0] as { readonly $ref?: unknown }).$ref;
    if (typeof armRef !== "string" || !armRef.startsWith("#/$defs/__inline_")) {
      throw new Error(
        `harness: the inline-object arm did not hoist to a \`__inline_<slug>\` entry, so this cell ` +
          `drives no non-declared \`$defs\` target: ${JSON.stringify(boundary.lowered)}`,
      );
    }
    const inlineDef = armRef.slice("#/$defs/".length);
    expect(
      boundary.plan.schemaNames.has(inlineDef),
      "the premise: a hoisted inline entry is not a declared `schema`, so `rebuildUnder` installs " +
        "no brand of its own and a descent there would otherwise leave the record unbranded",
    ).toBe(false);

    // An in-process value: branded at construction with a schema the ARM does
    // not name, which is the corner where the descent could subtract.
    const value = brandSchemaValue({ name: "x" }, "Person2");
    requireAdmitted(boundary, value);

    const rebuilt = walkInbound(boundary, value);

    expect(
      rebuilt,
      "the arm admits, so the walk really descends and builds a fresh record — an identity " +
        "pass-through would keep the brand for a reason this cell does not test",
    ).not.toBe(value);
    expect(
      schemaTagOf(rebuilt),
      "a route that starts descending into union arms must still be unable to subtract " +
        "(`tests/wire-translation-inbound-retag.test.ts`): the rebuilt record carries the brand " +
        "the value arrived with, because the arm names no declaration to brand it from",
    ).toBe("Person2");
    expect((rebuilt as { readonly name: string }).name).toBe("x");
  });
});

/**
 * Boundary 3 of runtime-value-model.md:34 (binder `args`) with a union-typed
 * `params:` field. The lowered `params:` document is the theta's own
 * (`src/parser/params.ts`, surfaced through the parsed frontmatter), so this
 * cell drives the union position a real theta produces rather than a
 * hand-written one.
 */
const PARAMS_SOURCE = [
  "---",
  "description: bind a union-typed param",
  "mode: prompt",
  "model: m",
  "params:",
  "  sev: Sev | null",
  "  note: string",
  "---",
  'enum Sev { High = "high", Low = "low" }',
  "",
].join("\n");

const PARAMS_DOC = loadFixture(PARAMS_SOURCE, "union-arm-params.theta");

/** The theta's own lowered `params:` document — the one the binder already compiles. */
function loweredParams(): Record<string, unknown> {
  const lowered = PARAMS_DOC.frontmatter?.params?.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      "harness: the fixture's `params:` block produced no lowered schema, so there is no " +
        "document for AJV to admit against and no plan for the binder projection to read",
    );
  }
  return lowered as Record<string, unknown>;
}

describe("bug 0172 face 2 — the binder `args` boundary over a union-typed param", () => {
  it("RED (params-union-field): `sev: Sev | null` binds a tagged variant", () => {
    const lowered = loweredParams();
    const properties = lowered["properties"] as Record<string, unknown>;
    const sevPosition = properties["sev"] as Record<string, unknown>;
    if (!Array.isArray(sevPosition["anyOf"])) {
      throw new Error(
        "harness: `sev: Sev | null` did not lower to an `anyOf` position, so this cell drives no " +
          `union arm: ${JSON.stringify(lowered)}`,
      );
    }
    const params = JSON.parse('{"sev":"high","note":"n"}') as Record<string, unknown>;
    // One validator for both the merge verdict and the arm re-test, which is
    // the seam-reuse half of the rule.
    const validator = realAjv();
    const verdict = validator.compile(lowered).validate(params);
    if (!verdict.ok) {
      throw new Error(
        `harness: the real AjvSchemaValidator refused the merged args against the fixture's own ` +
          `\`params:\` document, so no binder projection runs: ${JSON.stringify(verdict.errors)}`,
      );
    }

    const bindings = bindParamsInbound({
      params,
      lowered,
      body: PARAMS_DOC.body,
      schemaValidator: validator,
    });

    expect(
      valuesEqual(bindings.get("sev") as ThetaValue, makeEnumValue("Sev", "high")),
      "runtime-value-model.md:34 names binder `args` among the four inbound boundaries, so a " +
        "union-typed param reaches body scope as a tagged variant, not as the wire string",
    ).toBe(true);
    // The sibling non-union param is unaffected: the dispatch adds a tag where
    // an arm names a declaration and changes nothing elsewhere.
    expect(bindings.get("note")).toBe("n");
  });
});

// ===========================================================================
// CONTROLS — green at HEAD and green once the dispatch lands. Each states a
// property the descent must not break, so a route that widens past the rule
// reds here instead of passing quietly.
// ===========================================================================

/**
 * The fixture of `tests/wire-translation-inbound-retag.test.ts:206` verbatim:
 * a declared schema behind a `T | null` field, whose in-process value arrives
 * already branded. That cell pins that a brand at a position the plan does not
 * describe survives the walk, and §Fix's face-2 constraints make it binding on
 * any route that starts descending into arms.
 */
const NESTED_SOURCE = [
  "schema Person2 { name: string }",
  "schema U2 { q: Person2 | null }",
  'Person2 { name: "x" }',
  "",
].join("\n");

const NESTED_DOC = loadFixture(NESTED_SOURCE, "union-arm-nested.theta");

describe("bug 0172 face 2 — controls the descent must not break", () => {
  it("CONTROL (no-subtraction): the other three sidecar maps stay silent at the union position, and a brand there survives", () => {
    // GREEN AT HEAD AND AFTER. The descent only ADDS. The arms are a statement
    // about which arm governs, not about the position itself, so
    // `namedEnumPositions` and `refTargets` at `/properties/q` stay empty — the
    // premise `tests/wire-translation-inbound-retag.test.ts:206` asserts before
    // it drives the walk. What the arms buy is reach: arm 0 names `Person2`,
    // the walk re-enters that entry, and re-installs the same brand the value
    // arrived with.
    const boundary = boundaryFor("U2", NESTED_DOC);
    const sidecar = boundary.plan.sidecars.get("U2");
    if (sidecar === undefined) {
      throw new Error("harness: the derived plan carries no 'U2' sidecar");
    }
    expect(sidecar.refTargets ?? []).toEqual([]);
    expect(sidecar.namedEnumPositions).toEqual([]);

    // An in-process callee's own value: theta-side-named and branded at
    // construction, which is how it reaches an invoke return boundary without a
    // JSON round trip stripping the brand first.
    const inner = brandSchemaValue({ name: "x" }, "Person2");
    const outer = brandSchemaValue({ q: inner as ThetaValue }, "U2");
    expect(schemaTagOf(inner as unknown as ThetaValue)).toBe("Person2");

    const rebuilt = walkInbound(boundary, outer) as { readonly q: ThetaValue };

    expect(
      schemaTagOf(rebuilt.q),
      "a rebuild inside the arm may not subtract: both `schemaTagOf` consumers degrade silently " +
        "once the brand is gone",
    ).toBe("Person2");
    expect((rebuilt.q as { readonly name: string }).name).toBe("x");
    expect(schemaTagOf(rebuilt as unknown as ThetaValue)).toBe("U2");
  });

  it("CONTROL (boxed-carrier-passthrough): an already-tagged value matches no arm and crosses by identity", () => {
    // GREEN AT HEAD AND AFTER, and it is what keeps bug 0174's `(ANYOF)` cell
    // true: an in-process `invoke` callee's enum value is a boxed `String`
    // (`typeof "object"`), which AJV's `type: "string"` test refuses, so no arm
    // admits it and the walk returns it untouched. The tag survives because the
    // value was never replaced — the dispatch adds nothing here and must remove
    // nothing either.
    const boundary = boundaryFor("Sev | null", UNION_DOC);
    const carrier = makeEnumValue("Sev", "high");
    expect(typeof carrier).toBe("object");
    const verdict = boundary.validator.compile(boundary.lowered).validate(carrier);
    expect(
      verdict.ok,
      "the premise: the whole union refuses the carrier, so neither arm can admit it either",
    ).toBe(false);

    const rebuilt = walkInbound(boundary, carrier);

    expect(rebuilt).toBe(carrier);
    expect(valuesEqual(rebuilt, makeEnumValue("Sev", "high"))).toBe(true);
  });
});

/**
 * A `schema` alias of a string-literal union inside a union arm. The alias is a
 * declared `schema` name but not a declared `enum` name, so the lowering pass
 * classifies its `$ref` as an anonymous string-literal-union position
 * (`src/parser/schema-lowering.ts:496`) and step 5 keeps it out of the
 * named-enum map.
 */
const ALIAS_SOURCE = [
  'enum Sev { High = "high", Low = "low" }',
  'schema Tier = "gold" | "silver"',
  "Sev.High",
  "",
].join("\n");

const ALIAS_DOC = loadFixture(ALIAS_SOURCE, "union-arm-alias.theta");

describe("bug 0172 face 2 — the anonymous-union rule is untouched", () => {
  it('CONTROL (anonymous-arm): `Tier | null` over "gold" stays a plain string', () => {
    // GREEN AT HEAD AND AFTER. runtime-value-model.md:34 fixes that an
    // anonymous string-literal-union position receives no tag, which is what
    // keeps `Severity.Low == "low"` false at :22 and is pinned as a control by
    // `tests/subagent-invoke-inbound-enum-tag.test.ts:314-319`. Arm dispatch
    // chooses WHICH arm governs; it does not widen WHICH arms carry a name, so
    // an arm naming no declared `enum` still yields a bare string.
    const boundary = boundaryFor("Tier | null", ALIAS_DOC);
    requireAdmitted(boundary, "gold");
    expect(rootArmsOf(boundary)).toEqual([{ $ref: "#/$defs/Tier" }, { type: "null" }]);

    const rebuilt = walkInbound(boundary, "gold");

    expect(typeof rebuilt).toBe("string");
    expect(rebuilt).toBe("gold");
    expect(schemaTagOf(rebuilt)).toBeUndefined();
    expect(valuesEqual(rebuilt, makeEnumValue("Tier", "gold"))).toBe(false);
    expect(valuesEqual(rebuilt, makeEnumValue("Sev", "gold"))).toBe(false);
  });
});

// ===========================================================================
// THE PRODUCTION THREAD LINES. Each cell below drives ONE real inbound
// boundary end-to-end over a union-typed position, through the shipped
// producer rather than a hand-built plan. The dispatch is reachable at a
// boundary only where that boundary hands the shared step its own
// `SchemaValidator`, so each cell is what makes its boundary's thread line
// load-bearing: remove the argument and that boundary alone reverts to an
// untagged union bind, which is the per-boundary omission this bug family
// exists to close.
// ===========================================================================

/**
 * The typed-query fixture: a root annotation that is a UNION, so the respond
 * tool registers the single-property envelope (`src/runtime/respond-tool-wire.ts`
 * — an `anyOf` root is not argument-object-satisfiable) and the loop unwraps
 * `.value` before its verdict. The query sits in a `subagent fn` so the
 * two-phase drive runs OFF-SESSION over a held conversation, and FN-5 makes the
 * function's final value the query's own bound value.
 */
const QUERY_SOURCE = [
  "---",
  "mode: prompt",
  "respond_repair:",
  "  attempts: 0",
  "---",
  'enum Sev { High = "high", Low = "low" }',
  "subagent fn classify(hint: string) {",
  "  let sev = @<Sev | null>`classify this`?",
  "  sev",
  "}",
  'let out = classify("h")',
  "out",
  "",
].join("\n");

const QUERY_DOC = loadFixture(QUERY_SOURCE, "union-arm-query.theta");

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
 * Script the two-phase off-session drive: a free-phase turn calling no tool,
 * then a forced respond dispatch whose respond-tool call carries `payload`
 * (QRY-14).
 */
function scriptRespondWith(payload: unknown): void {
  scripted.queue = [
    () => assistantReply({ stopReason: "stop", text: "thinking" }),
    (call) => {
      const name = contextToolsOf(call)?.[0]?.["name"];
      if (typeof name !== "string") {
        // No silent skipping: the drive rests on the forced dispatch presenting
        // the registered respond tool (QRY-14 / PIC-44). A missing presentation
        // fails here naming itself rather than leaving a cell to assert over a
        // payload no boundary produced.
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

/** The `pi` surface the production producer needs, recording the notes it emits. */
function recordingPi(notes: string[]): ExtensionAPI {
  return {
    sendMessage: (message: { readonly content?: unknown }): void => {
      notes.push(String(message.content ?? ""));
    },
    registerTool: (_definition: ToolDefinition): void => {},
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    on: (): void => {},
  } as unknown as ExtensionAPI;
}

/** The runtime root the production producer reads its collaborators from. */
function rootWith(validator: AjvSchemaValidator): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: {
      newInvocationId: (): string => "inv-0172-face2",
      newToolCallId: (): string => "tc-1",
    },
    clock: { wallNow: (): number => 0 },
    schemaValidator: validator,
  } as unknown as RuntimeRoot;
}

/** The model reference the scripted `complete()` stands behind; never contacted. */
const SCRIPTED_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

/** The registry the production producer resolves its off-session model through. */
function scriptedModelRegistry(): ModelRegistry {
  return {
    getAvailable: () => [SCRIPTED_MODEL],
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
  } as unknown as ModelRegistry;
}

/**
 * Drive the union-annotated typed query through the SHIPPED producer over
 * `payload`. Every collaborator below the scripted `complete()` is the
 * production one, so the `QueryHostDispatch` the typed boundary consumes is
 * built by `#resolvePromptQuery` — the sole production builder of the decode
 * closure this boundary's thread line lives in.
 */
async function driveTypedQuery(payload: unknown): Promise<{
  readonly execution: BodyExecution;
  readonly notes: readonly string[];
}> {
  scriptRespondWith(payload);
  const theta: ThetaCompositionInput = {
    slashName: "union-query",
    sourcePath: "/theta/union-arm-query.theta",
    frontmatter: QUERY_DOC.frontmatter!,
    body: QUERY_DOC.body,
  };
  const notes: string[] = [];
  const deps = createProductionProducerDeps({
    pi: recordingPi(notes),
    root: rootWith(realAjv()),
    modelRegistry: scriptedModelRegistry(),
  });
  const binding = deps.bindPromptConversation({
    theta,
    args: "",
    ctx: {
      model: SCRIPTED_MODEL,
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
      `harness: the driven body did not complete, so no assertion below speaks about the ` +
        `inbound pass: error=${JSON.stringify(result.execution.error)}, ` +
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

describe("bug 0172 face 2 — the typed-query boundary over a union annotation", () => {
  // The scripted factory is selected by the RECORDED CALL INDEX, so the record
  // is reset per cell: a carried-over index would hand the free-phase turn
  // another cell's reply.
  beforeEach(() => {
    scripted.calls.length = 0;
    scripted.queue = [];
  });

  it("RED (typed-query-union): `@<Sev | null>` binds a tagged variant through the shipped producer", async () => {
    const value = boundValue(await driveTypedQuery({ value: "high" }));

    // 0337: this fixture's own declaring file is "/theta/union-arm-query.theta";
    // the locally-constructed comparand must carry that same declaring key.
    expect(
      valuesEqual(value, makeEnumValue(enumDeclaringKey("/theta/union-arm-query.theta", "Sev"), "high")),
      "runtime-value-model.md:34 — typed query results is the first of the four inbound " +
        "boundaries, and the arm admitting the unwrapped payload is the `Sev` `$ref`, so the bound " +
        "value compares equal to a locally constructed variant",
    ).toBe(true);
    expect(
      valuesEqual(makeEnumValue(enumDeclaringKey("/theta/union-arm-query.theta", "Sev"), "high"), value),
      "equality is symmetric, and only one of the two operands changes shape under the dispatch",
    ).toBe(true);
    expect(
      JSON.stringify(value),
      "runtime-value-model.md:13 — the declaring-enum tag never crosses the wire, which is why " +
        "the projection cannot witness this boundary",
    ).toBe('"high"');
  });

  it("CONTROL (typed-query-premises): the union root is enveloped, admitted by AJV, and bound in two turns", async () => {
    // GREEN AT HEAD AND AFTER. The premises the cell above rests on: the
    // annotation really lowers to a union root, and the payload is admitted
    // BEFORE the pass runs — the ordering runtime-value-model.md:34 fixes.
    const lowered = lowerQueryResponseSchema(
      "Sev | null",
      schemaDeclsOf(QUERY_DOC),
      enumDeclsOf(QUERY_DOC),
    );
    if (lowered === undefined) {
      throw new Error("harness: `Sev | null` did not lower, so the fixture drives no union root");
    }
    expect(lowered).toEqual({
      anyOf: [{ $ref: "#/$defs/Sev" }, { type: "null" }],
      $defs: { Sev: { type: "string", enum: ["high", "low"] } },
    });
    expect(realAjv().compile(lowered).validate("high")).toEqual({ ok: true });

    const result = await driveTypedQuery({ value: "high" });

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

// --- Boundary 3, parent side: the composition entry's `paramBindingsFrom` ---

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

const NOOP_SINK: ToolLoweringSink = {
  runtimeEvent(): void {},
  diagnostic(): void {},
  systemNote(): void {},
};

class InertMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}

/** Executor deps over the params fixture's own body — declarations only, so no effect dispatches. */
function inertExecuteDeps(): ExecuteBodyDeps {
  const hostDeps: EffectfulStatementHostDeps = {
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    sink: NOOP_SINK,
    file: "union-arm-params.theta",
    evaluatePure(): ThetaValue {
      throw new Error("harness: the params fixture body is declarations only, with no pure tail");
    },
    resolveQuery(): QueryHostDispatch {
      throw new Error("harness: the params fixture body issues no query");
    },
    resolveToolCall(): CodeSideToolCall {
      throw new Error("harness: the params fixture body issues no tool call");
    },
    resolveInvoke(): InvokeChild {
      throw new Error("harness: the params fixture body issues no invoke");
    },
  };
  return {
    env: buildEnvironment({ body: PARAMS_DOC.body }),
    host: createEffectfulStatementHost(hostDeps),
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new InertMutator(),
    mode: "prompt",
    file: "union-arm-params.theta",
  };
}

/**
 * The validator the SHIPPED producer hands the composition entry. Read off the
 * real producer rather than constructed here, so the accessor that supplies it
 * in production is part of what this cell drives; a producer exposing none
 * fails loudly naming the precondition rather than letting the cell fall back
 * to a locally built validator and pass regardless.
 */
function productionSchemaValidator(validator: AjvSchemaValidator): Pick<SchemaValidator, "compile"> {
  const producer = createProductionProducerDeps({
    pi: recordingPi([]),
    root: rootWith(validator),
    modelRegistry: scriptedModelRegistry(),
  });
  const exposed = producer.schemaValidator;
  if (exposed === undefined) {
    throw new Error(
      "harness: the production producer exposes no `schemaValidator`, so the composition entry " +
        "has nothing to hand its binder-`args` projection and this cell drives no arm dispatch",
    );
  }
  return exposed;
}

interface BinderCapture {
  paramBindings: ReadonlyMap<string, ThetaValue> | undefined;
  postMergeOk: boolean | undefined;
  errNotes: string[];
  panicNotes: string[];
}

/**
 * Drive `composeThetaFixture(...).run(...)` over producer deps whose binder step
 * is the REAL post-default-merge path and whose prompt-mode bind CAPTURES the
 * `paramBindings` the composition entry projected. ONE validator serves the
 * merge verdict and the arm re-test, which is the seam-reuse half of the rule.
 */
async function driveBinderAndCapture(args: Record<string, unknown>): Promise<BinderCapture> {
  const capture: BinderCapture = {
    paramBindings: undefined,
    postMergeOk: undefined,
    errNotes: [],
    panicNotes: [],
  };
  const validator = realAjv();
  const theta: ThetaCompositionInput = {
    slashName: "unionparams",
    frontmatter: PARAMS_DOC.frontmatter!,
    body: PARAMS_DOC.body,
    sourcePath: "union-arm-params.theta",
  };
  const deps: ThetaProducerDeps = {
    runBinder(_input: BinderRunInput): Promise<BinderRunResult> {
      const merged = fillDefaultsAndRevalidate({
        binderArgs: args,
        // The fixture declares no `= <literal>` defaults: these cells isolate a
        // binder-supplied value at this boundary; the defaulted-field case is
        // owned by the ten-cell witness params-default-enum-access-merge.test.ts.
        defaults: [],
        validator: validator.compile(loweredParams() as LoweredSchema),
      });
      capture.postMergeOk = merged.validation.ok;
      return Promise.resolve({ bound: true, args: merged.args });
    },
    bindPromptConversation(input: ConversationBindInput): ConversationBinding {
      capture.paramBindings = input.paramBindings;
      return {
        drivenAgainst: "prompt-user-session",
        executeDeps: inertExecuteDeps(),
        surface(_execution: BodyExecution): ResultValue {
          return makeOk(null);
        },
      };
    },
    spawnSubagentConversation(): Promise<ConversationBinding> {
      throw new Error("harness: the params fixture is prompt-mode, so no subagent session spawns");
    },
    emitTopLevelErrNote(_name: string, error: QueryError): void {
      capture.errNotes.push(JSON.stringify(error));
    },
    emitPanicNote(framing: string, _diagnostic: Diagnostic): void {
      capture.panicNotes.push(framing);
    },
    schemaValidator: productionSchemaValidator(validator),
  };
  await composeThetaFixture(theta, deps).run("", {} as unknown as ExtensionCommandContext);
  return capture;
}

/** The captured bindings, failing loudly when the composition entry projected none. */
function bindingsOf(capture: BinderCapture): ReadonlyMap<string, ThetaValue> {
  if (capture.panicNotes.length > 0 || capture.errNotes.length > 0) {
    throw new Error(
      `harness: the dispatch surfaced notes instead of binding cleanly — panic ${JSON.stringify(
        capture.panicNotes,
      )} err ${JSON.stringify(capture.errNotes)}`,
    );
  }
  if (capture.postMergeOk !== true) {
    throw new Error(
      "harness: the post-default-merge AJV verdict was not ok, so the value the cell reads never " +
        "passed the boundary the pass is specified to follow",
    );
  }
  if (capture.paramBindings === undefined) {
    throw new Error(
      "harness: the producer projected no `paramBindings`, so the parent-side binder-args " +
        "boundary was not reached",
    );
  }
  return capture.paramBindings;
}

describe("bug 0172 face 2 — the binder-`args` boundary, parent side, over a union-typed param", () => {
  it("RED (binder-parent-union): `sev: Sev | null` reaches body scope tagged through the composition entry", async () => {
    const bindings = bindingsOf(
      await driveBinderAndCapture(
        JSON.parse('{"sev":"high","note":"n"}') as Record<string, unknown>,
      ),
    );
    const sev = bindings.get("sev");
    if (sev === undefined) {
      throw new Error(
        `harness: no 'sev' binding reached body scope; the projection carried ${JSON.stringify([
          ...bindings.keys(),
        ])}`,
      );
    }

    // 0337: this fixture's own declaring file is "union-arm-params.theta"; the
    // locally-constructed comparand must carry that same declaring key.
    expect(
      valuesEqual(sev, makeEnumValue(enumDeclaringKey("union-arm-params.theta", "Sev"), "high")),
      "runtime-value-model.md:34 names binder `args` among the four inbound boundaries, so a " +
        "union-typed param reaches body scope as a tagged variant — which it can only do if the " +
        "composition entry hands its projection the runtime's own validator",
    ).toBe(true);
    expect(
      bindings.get("note"),
      "the sibling non-union param is unaffected: the dispatch adds a tag where an arm names a " +
        "declaration and changes nothing elsewhere",
    ).toBe("n");
  });
});

// --- Boundary 2: the invoke return trampoline -------------------------------
//
// WHY THIS ONE SPAWNS. An IN-PROCESS callee's enum value is the boxed `String`
// `makeEnumValue` builds, which no `type: "string"` arm admits — the
// `boxed-carrier-passthrough` control above pins exactly that, and it is why an
// in-process cell cannot witness this boundary at all. Only a `mode: subagent`
// callee's `theta_result` envelope carries the raw wire form (`JSON.stringify`
// child-side, `JSON.parse` parent-side, PIC-59), which is the one provenance
// here where the value is a plain string an arm CAN admit.
//
// TOKENS: none. Both bodies below are pure tail expressions, so no callee
// issues a query; the marshalled `--provider`/`--model` reference only
// satisfies the PIC-62 launch argv shape.
//
// THE CHILD PINS (AGENTS.md #subagent-child-pins) are all three: `process.argv[1]`
// replaced by the repo's own pi CLI entry through the `ExecutableHost`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN` set to this working tree's `extensions/`,
// and `parentPid` written beside it so the AUTHENTICATED control plane does not
// strip the pin.

/** The repo's pinned pi CLI entry — the SAME executable resolution rung 1 uses in production. */
const PI_CLI_ENTRY = fileURLToPath(
  new URL("../node_modules/@earendil-works/pi-coding-agent/dist/cli.js", import.meta.url),
);

/** This working tree's extension entry (the build under test). */
const EXTENSION_ENTRY = fileURLToPath(new URL("../extensions", import.meta.url));

/** The marshalled model reference riding the child argv (PIC-62). NEVER CONTACTED. */
const CHILD_MODEL_PROVIDER = "anthropic";
const CHILD_MODEL_ID = "claude-fable-5";

/** Fail loudly on a missing precondition — never a silent skip. */
function requirePath(path: string, what: string): void {
  if (!existsSync(path)) {
    throw new Error(
      `precondition unmet: ${what} not found at ${path} — the bug-0172 face-2 invoke witness ` +
        `needs the repo install (npm install); it never silently skips.`,
    );
  }
}

/** The callee: an enum-variant tail, which crosses the envelope as the bare wire string. */
const INVOKE_KID = [
  "---",
  "mode: subagent",
  "---",
  'enum Sev { High = "high", Low = "low" }',
  "Sev.High",
  "",
].join("\n");

/**
 * The driven root: one UNION-annotated `invoke`, compared against a locally
 * constructed variant of the caller's own declarations, with the same
 * comparison in-process on the next line as a control.
 */
const INVOKE_TOP = [
  "---",
  "mode: subagent",
  "---",
  'enum Sev { High = "high", Low = "low" }',
  // 0337: `crossedNotStr` is a tag-presence discriminator (docs/bugs `#0337`)
  // — it proves `ve` still carries an enum tag rather than a bare string.
  "schema R { crossed: boolean, local: boolean, crossedNotStr: boolean }",
  'let re = invoke<Sev | null>("./kid.theta")',
  "let ve = re?",
  "R { crossed: ve == Sev.High, local: Sev.High == Sev.High, crossedNotStr: ve == \"high\" }",
  "",
].join("\n");

/** Narrow the envelope's `Ok` payload to the report object, failing loudly when it is not one. */
function reportOf(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `the driven root returned ${JSON.stringify(value)} instead of the R report object — the ` +
        `fixture pair did not reach its tail expression, so no assertion below is meaningful`,
    );
  }
  return value as Record<string, unknown>;
}

/** One driven child: the settled envelope, the drain, and how the process ended. */
interface ChildDrive {
  readonly ok: boolean;
  readonly payload: unknown;
  readonly diagnostics: readonly Diagnostic[];
  readonly exit: ChildExitInfo | "no exit observed";
  readonly killedByWatchdog: boolean;
}

/**
 * Spawn `<thetaDir>/<slug>.theta` through the REAL production launch path and
 * drive it to its PIC-59 envelope. `params` is the marshalled root-params
 * carrier (`PI_THETA_PARAMS`); the two carriers this process might itself hold
 * are named and cleared so nothing inherited leaks into the child.
 *
 * A launch that does not start is a harness precondition, not a result: it
 * throws naming itself rather than leaving a cell to assert over a child that
 * never ran.
 */
async function driveRootChild(input: {
  readonly scratchDir: string;
  readonly thetaDir: string;
  readonly slug: string;
  readonly params?: string;
}): Promise<ChildDrive> {
  requirePath(PI_CLI_ENTRY, "the pi CLI entry (node_modules/@earendil-works/pi-coding-agent)");
  requirePath(EXTENSION_ENTRY, "this working tree's extension entry (extensions/)");

  // Rung-1 executable resolution, exactly as a pi-hosted parent resolves it
  // (node + the entry script); pinned to the repo's own pi install.
  const host: ExecutableHost = {
    argv1: PI_CLI_ENTRY,
    execPath: process.execPath,
    fileExists: (p: string): boolean => existsSync(p),
    isGenericRuntime: (): boolean => false,
  };
  const diagnostics: Diagnostic[] = [];
  const emitDiagnostic = (d: Diagnostic): void => {
    diagnostics.push(d);
  };
  // The extension pin rides `parentEnv` and inherits down to any grandchild the
  // root theta spawns; `parentPid` is what authenticates the pin at each level,
  // so omitting it would strip the pin silently and bind ambient builds.
  const launch = launchSubagentChild(
    {
      argv: {
        slug: input.slug,
        thetaDirs: [input.thetaDir],
        systemPrompt: "",
        hostTools: [],
        noHostTools: true,
        provider: CHILD_MODEL_PROVIDER,
        model: CHILD_MODEL_ID,
        projectTrust: false,
      },
      cwd: input.scratchDir,
      parentEnv: {
        ...process.env,
        [SUBAGENT_EXTENSION_PIN_ENV]: EXTENSION_ENTRY,
        [SUBAGENT_PARAMS_ENV]: input.params,
        [SUBAGENT_PARAMS_FILE_ENV]: undefined,
      },
      parentPid: process.pid,
      invokeDepth: 0,
      host,
    },
    { spawn: createProductionSpawnFn(), emitDiagnostic },
  );
  if (!launch.ok) {
    throw new Error(
      `harness: the child did not launch (${JSON.stringify(launch.reason)}), so no cell below ` +
        `observes an inbound boundary: ${JSON.stringify(diagnostics)}`,
    );
  }
  const child = launch.child;

  // Subscribed BEFORE driving so the terminal `'close'` is never missed.
  let exit: ChildExitInfo | "no exit observed" = "no exit observed";
  const exitPromise = new Promise<ChildExitInfo>((resolve) =>
    child.onExit((info) => {
      exit = info;
      resolve(info);
    }),
  );
  // In-test bound BELOW the vitest timeout: on a stall (the root child or a
  // grandchild making no progress) kill the tree so the drive settles
  // fail-closed and the assertions report loudly, instead of the test and a
  // live process tree hanging to the outer timeout.
  let killedByWatchdog = false;
  let result: Awaited<ReturnType<typeof driveSubagentChild>>;
  try {
    const watchdog = setTimeout(() => {
      killedByWatchdog = true;
      child.kill();
    }, 60_000);
    result = await driveSubagentChild({
      child,
      thetaAbort: new AbortController(),
      calleePath: join(input.thetaDir, `${input.slug}.theta`),
      emitDiagnostic,
      clock: new WallClock(),
    });
    clearTimeout(watchdog);
  } finally {
    // Reap on every path (idempotent on an already-exited child), then await its
    // exit (bounded): the dying child's cwd is inside the scratch tree, so
    // leaving it live could make the caller's cleanup throw EBUSY and replace a
    // primary assertion error with a less diagnostic one.
    child.kill();
    let reapTimer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      exitPromise,
      new Promise<void>((resolve) => {
        reapTimer = setTimeout(resolve, 5_000);
      }),
    ]);
    clearTimeout(reapTimer);
  }
  return {
    ok: result.ok,
    payload: result.ok ? result.value : result.error,
    diagnostics,
    exit,
    killedByWatchdog,
  };
}

/** Best-effort scratch cleanup; never mask the primary test failure. */
function dropScratch(scratchDir: string): void {
  try {
    rmSync(scratchDir, { recursive: true, force: true });
  } catch {
    // The child's cwd may still be releasing; the OS temp sweeper owns the rest.
  }
}

/** One discovery root, holding the fixtures a cell's root theta resolves `./` against. */
function plantThetas(files: Readonly<Record<string, string>>): {
  readonly scratchDir: string;
  readonly thetaDir: string;
} {
  const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0172-face2-"));
  const thetaDir = join(scratchDir, "thetas");
  mkdirSync(thetaDir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(thetaDir, name), text);
  }
  return { scratchDir, thetaDir };
}

describe("bug 0172 face 2 — the invoke return boundary over a union annotation", () => {
  it(
    "RED (invoke-union): `invoke<Sev | null>` of a subagent callee binds a tagged variant",
    async () => {
      const planted = plantThetas({ "kid.theta": INVOKE_KID, "top.theta": INVOKE_TOP });
      try {
        const drive = await driveRootChild({
          scratchDir: planted.scratchDir,
          thetaDir: planted.thetaDir,
          slug: "top",
        });

        expect(
          drive.killedByWatchdog,
          "the driven root made no progress within 60s — the nested subagent spawn did not " +
            "settle, so nothing about the arm dispatch was observed",
        ).toBe(false);
        expect(
          drive.ok,
          `the driven root resolved fail-closed instead of Ok: ${JSON.stringify(drive.payload)} ` +
            `diagnostics: ${JSON.stringify(drive.diagnostics)}`,
        ).toBe(true);
        const report = reportOf(drive.payload);

        // 0337: the callee `kid.theta` declares its OWN `Sev`, distinct from
        // `top.theta`'s `Sev` — the value the invoke returns is a value of a
        // declaration the caller (`top.theta`) did not write, so it does NOT
        // satisfy the caller's own `Sev.High` in `==` (parent-ratified
        // semantics, bug 0337).
        expect.soft(
          report.crossed,
          "0337: the returned variant belongs to the callee's declaration (a different file), so it does not satisfy the caller's own Sev.",
        ).toBe(false);
        // 0337/0172: PRESERVE THE OWNING BUG'S SUBJECT — a bare flip to false
        // would also pass if the tag were dropped to a plain string, silently
        // un-protecting the landed inbound-retag witness. This discriminator
        // proves `ve` is still a TAGGED enum, not a dropped bare string
        // (cross-type equality is false per runtime-value-model.md:22).
        expect.soft(
          report.crossedNotStr,
          "0337/0172: the returned value is a TAGGED enum, not a dropped bare string (cross-type equality is false per runtime-value-model.md:22).",
        ).toBe(false);
        expect.soft(
          report.local,
          "CONTROL: the same comparison in-process, same theta, same line — a red here means the " +
            "fixture, not the boundary, is what failed",
        ).toBe(true);
        expect.soft(
          drive.diagnostics,
          `the defect is silent — no Err and no diagnostic; a non-empty drain means the run ` +
            `failed for a different reason: ${JSON.stringify(drive.diagnostics)}`,
        ).toEqual([]);

        // PIC-59: one invocation per process — after the envelope the child
        // self-exits 0.
        expect(drive.exit).toEqual({ code: 0, signal: null });
      } finally {
        dropScratch(planted.scratchDir);
      }
    },
    120_000,
  );
});

// --- Boundary 3, child side: the marshalled-params intake -------------------

/**
 * A spawned subagent ROOT whose sole `params:` field is union-typed. A union is
 * not binder-bypass-eligible, so the child takes the PIC-60 regime that intakes
 * the marshalled `PI_THETA_PARAMS` JSON directly — the projection this cell
 * drives — and the body compares the bound value against the callee's own
 * declaring enum, so an untagged bare `"high"` reads `false` through
 * `valuesEqual`'s cross-type arm.
 */
const CHILD_PARAMS_ROOT = [
  "---",
  "mode: subagent",
  "params:",
  "  sev: Sev | null",
  "---",
  'enum Sev { High = "high", Low = "low" }',
  "sev == Sev.High",
  "",
].join("\n");

/** The same shape with a `string` param: the control that isolates the union arm. */
const CHILD_PARAMS_CONTROL = [
  "---",
  "mode: subagent",
  "params:",
  "  note: string",
  "  sev: Sev | null",
  "---",
  'enum Sev { High = "high", Low = "low" }',
  "note",
  "",
].join("\n");

describe("bug 0172 face 2 — the child-side `params:` intake over a union-typed param", () => {
  it(
    "RED (child-params-union): a marshalled `sev: Sev | null` binds tagged inside the spawned child",
    async () => {
      const planted = plantThetas({
        "root.theta": CHILD_PARAMS_ROOT,
        "rootctl.theta": CHILD_PARAMS_CONTROL,
      });
      try {
        const drive = await driveRootChild({
          scratchDir: planted.scratchDir,
          thetaDir: planted.thetaDir,
          slug: "root",
          params: JSON.stringify({ sev: "high" }),
        });

        expect(
          drive.killedByWatchdog,
          "the driven root made no progress within 60s, so nothing about the intake was observed",
        ).toBe(false);
        expect(
          drive.ok,
          `the driven root resolved fail-closed instead of Ok: ${JSON.stringify(drive.payload)} ` +
            `diagnostics: ${JSON.stringify(drive.diagnostics)}`,
        ).toBe(true);
        expect(
          drive.payload,
          "runtime-value-model.md:34 — binder `args` covers both `params:` projections, so the " +
            "child-side intake dispatches the union arm too and the marshalled string binds as a " +
            "tagged variant; untagged, `sev == Sev.High` takes the cross-type arm (:22) and the " +
            "envelope carries false",
        ).toBe(true);

        // CONTROL, same harness and same marshalled carrier: a non-union param
        // beside the union one is bound and readable either way, so a red above
        // is the dispatch and not the intake as a whole.
        const control = await driveRootChild({
          scratchDir: planted.scratchDir,
          thetaDir: planted.thetaDir,
          slug: "rootctl",
          params: JSON.stringify({ note: "n", sev: "high" }),
        });
        expect(
          control.ok,
          `the control root resolved fail-closed: ${JSON.stringify(control.payload)} ` +
            `diagnostics: ${JSON.stringify(control.diagnostics)}`,
        ).toBe(true);
        expect(control.payload).toBe("n");
      } finally {
        dropScratch(planted.scratchDir);
      }
    },
    120_000,
  );
});
