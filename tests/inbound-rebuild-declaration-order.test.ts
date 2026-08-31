import { describe, expect, it } from "vitest";
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
  type SchemaSidecar,
} from "../src/parser/schema-lowering";
import { translateInbound } from "../src/runtime/wire-translation";
import { evaluateObjectMember } from "../src/runtime/stdlib-object";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import {
  buildObjectSchemaValue,
  makeEnumValue,
  schemaTagOf,
  valuesEqual,
  type ThetaValue,
} from "../src/runtime/value";

// Bug 0120 — the ORDER half, at the seam that owns it. `rebuildInbound`
// (`src/runtime/wire-translation.ts:223`) walks the validated payload with
// `Object.entries(value)` and writes each key into a fresh record in the order
// the payload carried, so a rebuilt named-schema value's `keys()` is the
// MODEL's field order, not the schema's declaration order that
// `docs/spec_topics/expressions.md:118` fixes: "Theta-side field names, in
// schema declaration order for named schemas; insertion order otherwise".
//
// Bug 0172 is why this is worth pinning now rather than later: its face-1
// wiring makes the typed-query and binder-`args` boundaries call this walk over
// MODEL-produced payloads, which is the provenance whose order the model
// chooses. The one boundary wired today takes a theta child's own
// `JSON.stringify`, whose object `buildObjectSchemaValue`
// (`src/runtime/value.ts:385`) already ordered — which is why no committed cell
// reds on order and why bug 0120's coordination note calls the order half
// vacuous on that boundary.
//
// THE PINNED CONTRACT. The lowering pass's per-schema sidecar
// (`SchemaSidecar`, `src/parser/schema-lowering.ts:271`) gains a per-`$defs`
// field-order carrier, and the inbound walk rebuilds each described object's
// fields in that order, then appends any remaining payload key in its existing
// relative order — key-set preserving and own-key-guarded, inventing no
// declared name, exactly as `buildObjectSchemaValue` already is at the
// constructor. Where the sidecar carries NO field order the payload's own order
// is preserved unchanged.
//
// WHAT IS RED HERE AND WHY. Cells (a), (b), (c) and (d) assert the
// declaration-ordered end state and red on the payload's order — an assertion
// failure comparing two key ARRAYS, never a compile or harness error. No
// symbol below is new: the field-order carrier is deliberately not named, so
// this file compiles against the tree as it stands and reds on behaviour.
// Cell (e) is a control, green on both sides.
//
// NO SORTING ON THE READ PATH. `tests/ctor-declaration-order.test.ts`'s cell
// (S) pins that `evaluateObjectMember` returns the record's own key order
// verbatim — "it neither consults the brand nor sorts" — so the order must be
// established at the rebuild, exactly as bug 0080 established it at
// construction. Every cell below therefore reads through that same seam.
//
// TIER: unit, offline, provider-free, deterministic. The subject is one
// `translateInbound` call over a real lowered document; nothing above this tier
// can attribute an order to the rebuild rather than to its caller.
//
// Spec: expressions.md:118 (the `keys()` order clause), :119 (`values()` is
// order-correlated); runtime-value-model.md:34 (§Wire-name translation, the
// inbound bullet — the rebuild this file orders); schema-subset.md:87
// (Lowering Algorithm step 5, the per-`$defs` sidecar the carrier belongs to).

function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

function parse(src: string, path = "order.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, makeDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `harness: the fixture document did not load cleanly, so no cell below speaks about a ` +
        `real lowered schema: ${JSON.stringify(errors)}`,
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

/** The production content-addressing of `src/extension/production-composition.ts:3789`. */
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
 * The whole fixture corpus: one document so a single parse serves every cell and
 * every lowered fragment traces back to the same declarations. Each schema
 * declares its fields in an order a payload below deliberately does not use.
 */
const FIXTURE = [
  'enum Sev { High = "high", Low = "low" }',
  "schema Box { sev: Sev, who: string }",
  "schema Inner { a: string, b: string }",
  "schema Outer { inner: Inner, tag: string }",
  "schema Elem { p: string, q: string }",
  'Box { sev: Sev.High, who: "w" }',
  "",
].join("\n");

const DOC = parse(FIXTURE);
const SCHEMAS = schemaDeclsOf(DOC);
const ENUMS = enumDeclsOf(DOC);

/** The declared field names of `name`, in declaration order — the order the fix must produce. */
function declaredOrderOf(name: string): readonly string[] {
  const decl = SCHEMAS.find((s) => s.name === name);
  if (decl?.fields === undefined) {
    throw new Error(`harness: schema '${name}' retained no field list, so it names no order`);
  }
  return decl.fields.map((field) => field.name);
}

/** Lower `annotation` through the production lowering, failing loudly when it does not lower. */
function lowerOf(annotation: string): LoweredSchema {
  const lowered = lowerQueryResponseSchema(annotation, SCHEMAS, ENUMS);
  if (lowered === undefined) {
    throw new Error(`harness: '${annotation}' did not lower, so there is no document to plan over`);
  }
  return lowered;
}

/** The derived inbound plan for `annotation`, over the real lowered document. */
function planOf(annotation: string, lowered: LoweredSchema): InboundTranslationPlan {
  return buildInboundTranslationPlan({
    lowered: lowered as Record<string, unknown>,
    annotation,
    schemaNames: new Set(SCHEMAS.map((decl) => decl.name)),
    enumNames: new Set(ENUMS.map((decl) => decl.name)),
  });
}

/**
 * Validate `payload` against `lowered` through the real AJV seam, failing loudly
 * on a refusal: `runtime-value-model.md:34` places the rebuild "after AJV
 * validation against the lowered schema", so a cell whose payload AJV refuses
 * would be measuring a value the boundary never binds.
 */
function admittedByAjv(lowered: LoweredSchema, payload: unknown): void {
  const verdict = realAjv().compile(lowered).validate(payload);
  if (!verdict.ok) {
    throw new Error(
      `harness: AJV refused the payload the cell rebuilds, so the cell would measure a value ` +
        `no boundary binds: ${JSON.stringify(verdict.errors)}`,
    );
  }
}

/** Rebuild `payload` under the derived plan — the production call shape of the one wired caller. */
function rebuild(plan: InboundTranslationPlan, payload: unknown): ThetaValue {
  return translateInbound({
    validated: payload,
    sidecars: plan.sidecars,
    rootDef: plan.rootDef,
    schemaNames: plan.schemaNames,
  });
}

/** `keys()` read through the theta-visible stdlib seam (`expressions.md:118`). */
function thetaKeysOf(value: ThetaValue): unknown {
  return evaluateObjectMember(value as { readonly [k: string]: ThetaValue }, "keys", []);
}

describe("bug 0120 — the inbound rebuild orders a described object's fields by declaration (expressions.md:118)", () => {
  it("(a) a model-ordered payload of a named schema rebuilds into declaration order", () => {
    const lowered = lowerOf("Box");
    // The order the fix must produce, read off the declaration rather than
    // restated: a cell that hard-codes the order twice cannot notice a fixture
    // edit that changes it.
    expect(
      declaredOrderOf("Box"),
      "premise: `Box` declares `sev` before `who`, so declaration order and payload order differ",
    ).toEqual(["sev", "who"]);

    // `JSON.parse`, not an object literal: it is how a model-produced payload
    // reaches every boundary bug 0172 wires, and it is what makes the key order
    // below the MODEL's rather than this file's.
    const payload = JSON.parse('{"who":"w","sev":"high"}') as Record<string, unknown>;
    expect(
      Object.keys(payload),
      "premise: the payload really is model-ordered, so a declaration-ordered result cannot be a coincidence",
    ).toEqual(["who", "sev"]);
    admittedByAjv(lowered, payload);

    const rebuilt = rebuild(planOf("Box", lowered), payload);

    expect(
      thetaKeysOf(rebuilt),
      "expressions.md:118 — `keys()` on a named-schema value is declaration order; the rebuild is where an inbound value's order is established (ctor-declaration-order.test.ts cell (S) forbids sorting at the read)",
    ).toEqual(["sev", "who"]);
    expect(
      Object.keys(rebuilt as object),
      "the record's own key order IS what `keys()` reports, so the two must agree",
    ).toEqual(["sev", "who"]);
    // The retag and re-brand halves already hold at this seam; asserted here so
    // a red above is attributable to the order alone.
    expect(schemaTagOf(rebuilt)).toBe("Box");
    expect(
      valuesEqual((rebuilt as { readonly sev: ThetaValue }).sev, makeEnumValue("Sev", "high")),
    ).toBe(true);
  });

  it("(b) a NESTED named-schema field position orders by the same carrier", () => {
    const lowered = lowerOf("Outer");
    expect(declaredOrderOf("Outer")).toEqual(["inner", "tag"]);
    expect(declaredOrderOf("Inner")).toEqual(["a", "b"]);

    const payload = JSON.parse('{"tag":"t","inner":{"b":"B","a":"A"}}') as Record<string, unknown>;
    admittedByAjv(lowered, payload);
    const plan = planOf("Outer", lowered);
    // The premise the nested claim rests on: the walk reaches `Inner` through
    // its own `$defs` sidecar, so a per-`$defs` field order is addressable
    // there exactly as at the root.
    expect(
      plan.sidecars.get("Outer")?.refTargets,
      "premise: `Outer`'s sidecar names `/properties/inner` as a `$ref` into `Inner`, which is how the walk re-enters at that fragment's own root",
    ).toEqual([{ pointer: "/properties/inner", defName: "Inner" }]);

    const rebuilt = rebuild(plan, payload) as { readonly inner: ThetaValue };

    expect(
      thetaKeysOf(rebuilt as unknown as ThetaValue),
      "expressions.md:118 at the root of a nested shape",
    ).toEqual(["inner", "tag"]);
    expect(
      thetaKeysOf(rebuilt.inner),
      "expressions.md:118 at a nested named-schema field: `Inner` declares `a` before `b`, and the walk entered its fragment through the `$ref` target",
    ).toEqual(["a", "b"]);
  });

  it("(c) an array<T> element position orders by the same carrier", () => {
    const lowered = lowerOf("array<Elem>");
    expect(declaredOrderOf("Elem")).toEqual(["p", "q"]);

    const payload = JSON.parse('[{"q":"2","p":"1"},{"q":"4","p":"3"}]') as readonly unknown[];
    admittedByAjv(lowered, payload);
    const rebuilt = rebuild(planOf("array<Elem>", lowered), payload) as readonly ThetaValue[];

    expect(Array.isArray(rebuilt), "premise: an array root rebuilds as an array").toBe(true);
    expect(
      thetaKeysOf(rebuilt[0] as ThetaValue),
      "expressions.md:118 at an array ELEMENT: the element's `$ref` target is `Elem`, whose declaration order governs it exactly as a field's does",
    ).toEqual(["p", "q"]);
    expect(thetaKeysOf(rebuilt[1] as ThetaValue)).toEqual(["p", "q"]);
  });

  it("(d) ctor provenance: a locally constructed value and the rebuilt value are byte-identical JSON and equal in both argument orders", () => {
    const lowered = lowerOf("Box");
    const payload = JSON.parse('{"who":"w","sev":"high"}') as Record<string, unknown>;
    admittedByAjv(lowered, payload);
    const rebuilt = rebuild(planOf("Box", lowered), payload);

    // The constructor's own path, through the single construction point bug
    // 0080 established: the record is handed over in the CONSTRUCTOR's source
    // order and reordered into declaration order before branding, so the two
    // provenances can only agree if the rebuild orders too.
    const constructed = buildObjectSchemaValue(
      { who: "w", sev: makeEnumValue("Sev", "high") },
      "Box",
      (name: string) => SCHEMAS.find((decl) => decl.name === name),
    );
    expect(
      JSON.stringify(constructed),
      "premise: `buildObjectSchemaValue` orders by declaration, so the ctor side of the comparison is the specified order",
    ).toBe('{"sev":"high","who":"w"}');

    expect(
      JSON.stringify(rebuilt),
      "QRY-18 stringifies the same record, so two provenances of one schema's value must produce identical bytes; they differ only in the order the rebuild preserved",
    ).toBe(JSON.stringify(constructed));

    // `valuesEqual` compares own keys and values, not their order
    // (`src/runtime/value.ts:494`), so this pair holds on both sides of the
    // fix. It is not a red witness; it is here because a route that reordered
    // by dropping or inventing a key would break it, and the assertion is
    // symmetric only if the key SETS stayed equal.
    expect(valuesEqual(constructed, rebuilt)).toBe(true);
    expect(valuesEqual(rebuilt, constructed)).toBe(true);
  });

  it("(e) CONTROL — a sidecar carrying no field order leaves the payload's order untouched", () => {
    // The invariant that keeps the landed cells of
    // `tests/wire-translation-inbound-retag.test.ts` green: a synthetic sidecar
    // (a hand-built literal, a permissive root, a `$defs` entry with no object
    // body) names no declaration, so there is no order to impose and the
    // payload's own order is the only defensible one. Green on both sides of
    // the fix — this cell is not a red witness.
    const synthetic: SchemaSidecar = {
      wireNames: [],
      namedEnumPositions: [],
      refTargets: [],
    };
    const payload = JSON.parse('{"who":"w","sev":"high"}') as Record<string, unknown>;
    const rebuilt = translateInbound({
      validated: payload,
      sidecars: new Map([["Synth", synthetic]]),
      rootDef: "Synth",
      schemaNames: new Set(["Synth"]),
    });

    expect(
      thetaKeysOf(rebuilt),
      "no carrier, no reorder: a sidecar that names no declared field list leaves `keys()` at the payload's own order (expressions.md:118's `insertion order otherwise`)",
    ).toEqual(["who", "sev"]);
    expect(JSON.stringify(rebuilt)).toBe('{"who":"w","sev":"high"}');
    expect(
      evaluateObjectMember(rebuilt as { readonly [k: string]: ThetaValue }, "values", []),
      "`values()` stays order-correlated with `keys()` (expressions.md:119)",
    ).toEqual(["w", "high"]);
  });

  it("(f) CONTROL — a payload key the field-order list does not name is APPENDED after the declared block", () => {
    // Where the carrier IS present but does not name every payload key, the
    // unnamed key does not hold its payload-order position: it follows the
    // whole declared block, keeping its order relative to the other unnamed
    // keys. That is `buildObjectSchemaValue`'s established discipline at the
    // constructor (`src/runtime/value.ts` — "every declared field name PRESENT
    // in `constructedFields`, in DECLARED order, then every remaining
    // constructed key in its existing relative order"), and the two
    // provenances of one schema's value must agree, which is what cell (d)
    // pins for the fully-declared case. Green on both sides of the fix — this
    // cell is not a red witness.
    //
    // The sidecar is synthetic because no DERIVED plan can reach this shape:
    // `buildInboundTranslationPlan` lists every key of the fragment's own
    // `properties`, and the lowered object form carries
    // `additionalProperties: false`, so AJV refuses an unnamed key before the
    // rebuild ever sees one.
    const synthetic: SchemaSidecar = {
      wireNames: [],
      namedEnumPositions: [],
      refTargets: [],
      fieldOrder: ["a"],
    };
    const payload = JSON.parse('{"z":1,"a":2,"y":3}') as Record<string, unknown>;
    expect(
      Object.keys(payload),
      "premise: the only named field sits between two unnamed ones, so appending and holding position are distinguishable",
    ).toEqual(["z", "a", "y"]);

    const rebuilt = translateInbound({
      validated: payload,
      sidecars: new Map([["Synth", synthetic]]),
      rootDef: "Synth",
      schemaNames: new Set(["Synth"]),
    });

    expect(
      thetaKeysOf(rebuilt),
      "the named field comes first, then the unnamed keys in the relative order the payload carried",
    ).toEqual(["a", "z", "y"]);
    expect(
      Object.keys(rebuilt as object).length,
      "the reorder is key-set preserving: nothing is dropped, duplicated or invented",
    ).toBe(3);
  });
});
