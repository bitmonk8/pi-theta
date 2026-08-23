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
import { buildInboundTranslationPlan, type SchemaSidecar } from "../src/parser/schema-lowering";
import { translateInbound, translateOutbound } from "../src/runtime/wire-translation";
import { evaluateObjectMember } from "../src/runtime/stdlib-object";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import {
  brandSchemaValue,
  isResultValue,
  makeEnumValue,
  makeOk,
  schemaTagOf,
  valuesEqual,
  type ThetaValue,
} from "../src/runtime/value";

// Bug 0067 — `translateInbound` (`src/runtime/wire-translation.ts`) gained a
// production caller (`#validateInvokeReturn`,
// `src/extension/production-theta-producer.ts`) but had no unit coverage of
// its own end-state beyond `tests/wire-name-translation.test.ts` (which
// predates the `$ref`-target map and the schema-brand half). These tests pin
// the seam directly, at the boundary's own inputs and outputs, so a
// regression here is attributable to `translateInbound` rather than rediscovered
// through the process-spawning witness in
// `tests/subagent-invoke-inbound-enum-tag.test.ts`.
//
// Spec: runtime-value-model.md §"Wire-name translation" (enum-tag
// reattachment, `Result` never lowerable), value-representation table
// (object row: theta-side keying; enum row: interpreter-private tag).
// docs/bugs/0020-enum-schema-tags-presence-only-forgeable.md pins the
// non-enumerable-brand posture `schemaTagOf` reads by.

function makeDeps(): ParseThetaDocumentDeps {
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

function parse(src: string, path = "retag.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}

function schemaDeclsOf(doc: ThetaDocument): readonly SchemaDecl[] {
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

function enumDeclsOf(doc: ThetaDocument): readonly EnumDecl[] {
  return doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
}

/** A hand-built `Person` sidecar: one renamed field, one named-enum field. */
function personSidecar(): SchemaSidecar {
  return {
    wireNames: [{ theta: "first_name", wire: "FirstName" }],
    namedEnumPositions: [{ pointer: "/properties/severity", enumName: "Severity" }],
    refTargets: [],
  };
}

describe("translateInbound — re-tag and re-brand end state (runtime-value-model.md §Wire-name translation)", () => {
  it("reattaches a root-position enum tag; the rebuilt value still JSON.stringifys to the bare wire string", () => {
    const rootSidecar: SchemaSidecar = {
      wireNames: [],
      namedEnumPositions: [{ pointer: "", enumName: "Sev" }],
      refTargets: [],
    };
    const rebuilt = translateInbound({
      validated: "high",
      sidecars: new Map([["Sev", rootSidecar]]),
      rootDef: "Sev",
    });
    expect(valuesEqual(rebuilt, makeEnumValue("Sev", "high"))).toBe(true);
    expect(JSON.stringify(rebuilt)).toBe('"high"');
  });

  it("recurses an array element through its $ref target: rename, enum re-tag, and brand all apply per element", () => {
    const rootSidecar: SchemaSidecar = {
      wireNames: [],
      namedEnumPositions: [],
      refTargets: [{ pointer: "/items", defName: "Person" }],
    };
    const sidecars = new Map<string, SchemaSidecar>([
      ["Person", personSidecar()],
      ["#root", rootSidecar],
    ]);
    const rebuilt = translateInbound({
      validated: [
        { FirstName: "Ada", severity: "high" },
        { FirstName: "Bob", severity: "low" },
      ],
      sidecars,
      rootDef: "#root",
      schemaNames: new Set(["Person"]),
    });
    expect(Array.isArray(rebuilt)).toBe(true);
    const elements = rebuilt as readonly ThetaValue[];
    const first = elements[0] as { readonly first_name: string; readonly severity: ThetaValue };
    const second = elements[1] as { readonly first_name: string; readonly severity: ThetaValue };
    expect(first.first_name).toBe("Ada");
    expect(Object.prototype.hasOwnProperty.call(first, "FirstName")).toBe(false);
    expect(valuesEqual(first.severity, makeEnumValue("Severity", "high"))).toBe(true);
    expect(second.first_name).toBe("Bob");
    expect(valuesEqual(second.severity, makeEnumValue("Severity", "low"))).toBe(true);
    expect(schemaTagOf(first as unknown as ThetaValue)).toBe("Person");
    expect(schemaTagOf(second as unknown as ThetaValue)).toBe("Person");
  });

  it("a rebuilt object of a declared schema is recoverable through schemaTagOf, with the brand non-enumerable and the key count unchanged (bug 0020's posture)", () => {
    const rebuilt = translateInbound({
      validated: { FirstName: "Ada", severity: "high" },
      sidecars: new Map([["Person", personSidecar()]]),
      rootDef: "Person",
      schemaNames: new Set(["Person"]),
    }) as { readonly [k: string]: ThetaValue };

    expect(schemaTagOf(rebuilt)).toBe("Person");
    // Two wire keys in, two theta keys out — the rename replaces a key, the
    // brand adds none (bug 0020: a brand is a symbol-keyed property, invisible
    // to `Object.keys`).
    expect(Object.keys(rebuilt).sort()).toEqual(["first_name", "severity"]);
    // Non-enumerable, observably: object spread copies only OWN ENUMERABLE
    // properties (string- and symbol-keyed alike), so a brand that survived a
    // spread would be enumerable — value.ts's `privateBrandOf` posture.
    expect(schemaTagOf({ ...rebuilt })).toBeUndefined();
    expect(JSON.stringify(rebuilt)).toBe('{"first_name":"Ada","severity":"high"}');
  });

  it("a payload naming __thetaSchema as an ordinary string key recovers NO tag", () => {
    const rebuilt = translateInbound({
      validated: { FirstName: "Ada", severity: "high", __thetaSchema: "Forged" },
      sidecars: new Map([["Person", personSidecar()]]),
      rootDef: "Person",
      // No `schemaNames`: nothing here is genuinely branded, so a passing
      // `schemaTagOf` could only mean the forged string key was misread as
      // the brand.
    }) as { readonly [k: string]: ThetaValue };

    expect(schemaTagOf(rebuilt)).toBeUndefined();
    // The forged key is ordinary payload data and is neither stripped nor
    // specially interpreted — it occupies a string key, the brand a disjoint
    // symbol key (value.ts, bug 0026's posture).
    expect(rebuilt["__thetaSchema"]).toBe("Forged");
  });

  it("an __inline_<slug> position reached through a declared schema's own $ref is NOT branded, even though its enclosing schema is", () => {
    // Real lowering, not a hand-built sidecar: `Boxed.obj`'s inline `{ x: Sev }`
    // field type hoists to a genuine `__inline_<slug>` `$defs` entry — the
    // position `buildInboundTranslationPlan`'s `schemaNames` output must
    // exclude, because no author-declared `schema` named it.
    const doc = parse('enum Sev { High = "high" }\nschema Boxed { obj: { x: Sev } }\nSev.High\n');
    const schemas = schemaDeclsOf(doc);
    const enums = enumDeclsOf(doc);
    const lowered = lowerQueryResponseSchema("Boxed", schemas, enums);
    if (lowered === undefined) {
      throw new Error("harness: 'Boxed' did not lower");
    }
    const plan = buildInboundTranslationPlan({
      lowered: lowered as Record<string, unknown>,
      annotation: "Boxed",
      schemaNames: new Set(schemas.map((decl) => decl.name)),
      enumNames: new Set(enums.map((decl) => decl.name)),
    });
    const inlineName = [...plan.sidecars.keys()].find((name) => name.startsWith("__inline_"));
    if (inlineName === undefined) {
      throw new Error("harness: expected a minted __inline_<slug> $defs entry");
    }
    expect(plan.schemaNames.has(inlineName)).toBe(false);
    expect(plan.schemaNames.has("Boxed")).toBe(true);

    const rebuilt = translateInbound({
      validated: { obj: { x: "high" } },
      sidecars: plan.sidecars,
      rootDef: plan.rootDef,
      schemaNames: plan.schemaNames,
    }) as { readonly obj: { readonly x: ThetaValue } };

    expect(valuesEqual(rebuilt.obj.x, makeEnumValue("Sev", "high"))).toBe(true);
    // The enclosing declared schema IS branded...
    expect(schemaTagOf(rebuilt as unknown as ThetaValue)).toBe("Boxed");
    // ...but the anonymous inline-object position it contains is not — it
    // names no declaration a caller could recover through `schemaTagOf`.
    expect(schemaTagOf(rebuilt.obj as unknown as ThetaValue)).toBeUndefined();
  });

  it("a brand at a position the plan does not describe survives the walk: schemaTagOf still recovers it", () => {
    // Real lowering, not a hand-built sidecar: `q: Person2 | null` has a
    // non-primitive arm, so schema-subset.md §"Lowering Algorithm" step 3 emits
    // `{"anyOf":[{"$ref":…},{"type":"null"}]}` — a position the sidecar cannot
    // key, because `anyOf` has no image in the data space the way `properties`
    // and `items` do.
    const doc = parse(
      'schema Person2 { name: string }\nschema U2 { q: Person2 | null }\nPerson2 { name: "x" }\n',
    );
    const schemas = schemaDeclsOf(doc);
    const enums = enumDeclsOf(doc);
    const lowered = lowerQueryResponseSchema("U2", schemas, enums);
    if (lowered === undefined) {
      throw new Error("harness: 'U2' did not lower");
    }
    const plan = buildInboundTranslationPlan({
      lowered: lowered as Record<string, unknown>,
      annotation: "U2",
      schemaNames: new Set(schemas.map((decl) => decl.name)),
      enumNames: new Set(enums.map((decl) => decl.name)),
    });
    const uSidecar = plan.sidecars.get("U2");
    if (uSidecar === undefined) {
      throw new Error("harness: the derived plan carries no 'U2' sidecar");
    }
    // The premise the assertions below rest on: no map in `U2`'s sidecar
    // addresses `/properties/q`, so the walk reaches that value with nothing to
    // say about it.
    expect(uSidecar.refTargets ?? []).toEqual([]);
    expect(uSidecar.namedEnumPositions).toEqual([]);

    // An in-process callee's own value: theta-side-named and branded at
    // construction, which is how it reaches the invoke return boundary on the
    // prompt→prompt cell (no JSON round trip strips the brand first).
    const inner = brandSchemaValue({ name: "x" }, "Person2");
    const outer = brandSchemaValue({ q: inner as ThetaValue }, "U2");
    expect(schemaTagOf(inner as unknown as ThetaValue)).toBe("Person2");

    const rebuilt = translateInbound({
      validated: outer,
      sidecars: plan.sidecars,
      rootDef: plan.rootDef,
      schemaNames: plan.schemaNames,
    }) as { readonly q: ThetaValue };

    // The undescribed position keeps the brand it arrived with: a rebuild there
    // could only subtract, and both `schemaTagOf` consumers — the QRY-18
    // outbound render's `as` renames and the `QuestionOperandDefectError`
    // summariser's schema name — degrade silently once it is gone.
    expect(schemaTagOf(rebuilt.q)).toBe("Person2");
    expect((rebuilt.q as { readonly name: string }).name).toBe("x");
    // The described root is still rebuilt and re-branded, so leaving the union
    // arm alone costs the walk nothing where it does have information.
    expect(schemaTagOf(rebuilt as unknown as ThetaValue)).toBe("U2");
  });

  it("a Result value passes through unchanged: isResultValue stays true and no rebuild occurs", () => {
    const ok = makeOk("plain-value");
    const rebuilt = translateInbound({
      validated: ok,
      sidecars: new Map([["Person", personSidecar()]]),
      rootDef: "Person",
      schemaNames: new Set(["Person"]),
    });
    // Same reference: `Result` has no lowered-schema form, so nothing about it
    // is rebuilt, renamed, or re-tagged.
    expect(rebuilt).toBe(ok);
    expect(isResultValue(rebuilt)).toBe(true);
  });

  it("valuesEqual treats a constructor-built value and the rebuilt inbound value of the same schema as equal", () => {
    const ctorBuilt = brandSchemaValue(
      { first_name: "Ada", severity: makeEnumValue("Severity", "high") },
      "Person",
    );
    const rebuilt = translateInbound({
      validated: { FirstName: "Ada", severity: "high" },
      sidecars: new Map([["Person", personSidecar()]]),
      rootDef: "Person",
      schemaNames: new Set(["Person"]),
    });
    expect(valuesEqual(ctorBuilt, rebuilt)).toBe(true);
  });
});

// ===========================================================================
// Bug 0173 — the two record builds of this seam
// (`rebuildInbound`'s `src/runtime/wire-translation.ts:299`, `lowerOutbound`'s
// `:366`) are filled by `result[key] = …` over key strings the payload supplies
// or the author declares, so that key space is payload- and author-controlled
// and `__proto__` is a live name in it. These cells pin the construction rule
// that keeps such a name an ordinary own key. The hazard the rule answers: on a
// plain `{}` the assignment resolves through `Object.prototype`'s inherited
// `__proto__` setter, so an object-valued entry becomes the record's PROTOTYPE
// and a primitive-valued one is discarded, and neither mints an own key nor
// raises a diagnostic on any channel. `Object.create(null)` leaves no inherited
// setter to reach, so the assignment mints an own key like any other.
//
// The end state below is §Fix (a): both records built with `Object.create(null)`,
// the rule this corpus already applies at five sites
// (`src/parser/type-layer-checks.ts:330`, `:792`, `parseParams`
// (`src/parser/params.ts`),
// `src/extension/invoke-static-checks.ts:943`, `:1056`, the design note at
// `type-layer-checks.ts:317`). A key spelled `__proto__` is then an ordinary
// own enumerable key: `Object.keys` reports it, `JSON.stringify` emits it, and
// the record's prototype stays `null`. Bug 0038's witness states the same
// three-part observable for the `TypeEnv`
// (`tests/typeenv-prototype-names.test.ts:1006`, group (g)), and states why the
// construction half needs an observable of its own: a write the prototype
// setter swallows loses the field outright, so no read-side guard can restore
// it.
//
// Spec: runtime-value-model.md:34 — the inbound pass "rebuilds the value with
// theta-side names using each schema's translation map", uniformly at every
// inbound boundary; a rebuild missing a key the validated JSON carried is a
// different value. runtime-value-model.md:12 — an object-schema value is a "JS
// plain object keyed by theta-side names". schemas.md:30 — a wire name is an
// arbitrary JSON property name, so the outbound record's key space is
// author-controlled without restriction.
//
// Every payload here is built with `JSON.parse`. An object literal spelling
// `"__proto__"` sets the prototype at parse time and mints no own key, which
// would leave these cells asserting nothing; `JSON.parse` mints the own key,
// and is also how the payload arrives at the one wired caller
// (`#validateInvokeReturn`, `src/extension/production-theta-producer.ts:3436`,
// whose input is `JSON.parse` of a subagent child's `JSON.stringify`). Each
// such cell asserts that premise before it drives the seam.
// ===========================================================================

/**
 * The permissive sidecar a derived plan produces for a boundary with no
 * renames and no named-enum positions — the shape that still makes a position a
 * record-building one, since `buildInboundTranslationPlan` registers the root
 * fragment under `rootDef` whatever its shape.
 */
function permissiveSidecar(): SchemaSidecar {
  return { wireNames: [], namedEnumPositions: [], refTargets: [] };
}

/**
 * The OWN value at `key`, read through a descriptor so no inherited accessor
 * can answer in place of an own property — the distinction these cells are
 * about.
 */
function ownValue(record: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(record, key)?.value;
}

/** The production content-addressing of `src/extension/production-composition.ts:318`. */
function productionSlugOf(schema: LoweredSchema): SchemaSlug {
  const canonicalBytes = JSON.stringify(schema);
  return { slug: canonicalBytes, canonicalBytes };
}

describe("bug 0173 — a payload or wire key spelled __proto__ at the two record builds", () => {
  it("an object-valued __proto__ payload key becomes an own field of the rebuilt record, not its prototype", () => {
    const payload = JSON.parse('{"__proto__":{"polluted":"yes"},"ok2":"v"}') as {
      readonly [k: string]: ThetaValue;
    };
    expect(Object.hasOwn(payload, "__proto__")).toBe(true);
    expect(Object.keys(payload)).toEqual(["__proto__", "ok2"]);

    const rebuilt = translateInbound({
      validated: payload,
      sidecars: new Map([["Pr", permissiveSidecar()]]),
      rootDef: "Pr",
    }) as { readonly [k: string]: ThetaValue };

    // §Non-goals bounds the claim: the write lands on the rebuilt record alone,
    // never on `Object.prototype`, so no later-constructed plain object answers
    // for the payload's key. That bound holds on both sides of §Fix (a).
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();

    expect(Object.keys(rebuilt)).toEqual(["__proto__", "ok2"]);
    expect(Object.hasOwn(rebuilt, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(rebuilt)).toBeNull();
    expect(JSON.stringify(rebuilt)).toBe('{"__proto__":{"polluted":"yes"},"ok2":"v"}');
    // The field value at a position no sidecar keys passes through by reference
    // (`rebuildInbound`'s `pointer !== ""` arm), so the own key carries exactly
    // what AJV validated.
    expect(ownValue(rebuilt, "__proto__")).toBe(payload["__proto__"]);
  });

  it("a primitive-valued __proto__ payload key is carried across: the rebuilt record's key count is the observable", () => {
    const payload = JSON.parse('{"__proto__":"str","ok2":"v"}') as {
      readonly [k: string]: ThetaValue;
    };
    expect(Object.hasOwn(payload, "__proto__")).toBe(true);

    const rebuilt = translateInbound({
      validated: payload,
      sidecars: new Map([["Pr", permissiveSidecar()]]),
      rootDef: "Pr",
    }) as { readonly [k: string]: ThetaValue };

    // A primitive assignment through the inherited setter returns without
    // effect and without a throw, leaving the prototype untouched — so the key
    // SET, not the prototype, is what separates the two ends of §Fix (a) on
    // this row.
    expect(Object.keys(rebuilt)).toEqual(["__proto__", "ok2"]);
    expect(Object.getPrototypeOf(rebuilt)).toBeNull();
    expect(ownValue(rebuilt, "__proto__")).toBe("str");
    expect(JSON.stringify(rebuilt)).toBe('{"__proto__":"str","ok2":"v"}');
  });

  it("a rename whose theta-side name is __proto__ mints an own field, not a prototype", () => {
    const payload = JSON.parse('{"Proto":{"polluted":"yes"},"ok2":"v"}') as {
      readonly [k: string]: ThetaValue;
    };
    // The colliding name is the sidecar's THETA side — a declared field name —
    // so the payload carries no `__proto__` key at all. This row is the
    // author-controlled half of the key space (schemas.md:30), live for any
    // boundary whose sidecars carry renames.
    expect(Object.hasOwn(payload, "__proto__")).toBe(false);
    const renaming: SchemaSidecar = {
      wireNames: [{ theta: "__proto__", wire: "Proto" }],
      namedEnumPositions: [],
      refTargets: [],
    };

    const rebuilt = translateInbound({
      validated: payload,
      sidecars: new Map([["Pr", renaming]]),
      rootDef: "Pr",
    }) as { readonly [k: string]: ThetaValue };

    expect(Object.keys(rebuilt)).toEqual(["__proto__", "ok2"]);
    expect(Object.getPrototypeOf(rebuilt)).toBeNull();
    expect(ownValue(rebuilt, "__proto__")).toBe(payload["Proto"]);
    expect(JSON.stringify(rebuilt)).toBe('{"__proto__":{"polluted":"yes"},"ok2":"v"}');
  });

  it("the schema brand survives on a null-prototype rebuilt record, non-enumerable, beside the colliding own key", () => {
    // §Fix (c)'s premise, pinned independently of the seam: `brandSchemaValue`
    // installs a symbol key through `Object.defineProperty`
    // (`src/runtime/value.ts:277`) and `schemaTagOf` reads that same symbol
    // (`:300`), so neither consults the record's prototype.
    const local = Object.create(null) as { [k: string]: ThetaValue };
    local["ok2"] = "v";
    brandSchemaValue(local, "Pr");
    expect(schemaTagOf(local)).toBe("Pr");
    expect(Object.getPrototypeOf(local)).toBeNull();

    const payload = JSON.parse('{"__proto__":{"polluted":"yes"},"ok2":"v"}') as {
      readonly [k: string]: ThetaValue;
    };
    expect(Object.hasOwn(payload, "__proto__")).toBe(true);

    const rebuilt = translateInbound({
      validated: payload,
      sidecars: new Map([["Pr", permissiveSidecar()]]),
      rootDef: "Pr",
      schemaNames: new Set(["Pr"]),
    }) as { readonly [k: string]: ThetaValue };

    expect(schemaTagOf(rebuilt)).toBe("Pr");
    // Non-enumerable, observably: a spread copies own ENUMERABLE properties,
    // string- and symbol-keyed alike, so a surviving brand would be enumerable
    // (bug 0020's posture).
    expect(schemaTagOf({ ...rebuilt })).toBeUndefined();
    expect(Object.getPrototypeOf(rebuilt)).toBeNull();
    expect(Object.keys(rebuilt)).toEqual(["__proto__", "ok2"]);
  });

  it("outbound: a theta-side own __proto__ key lowers to an own wire key", () => {
    const value = JSON.parse('{"__proto__":{"polluted":"yes"},"ok2":"v"}') as {
      readonly [k: string]: ThetaValue;
    };
    expect(Object.hasOwn(value, "__proto__")).toBe(true);

    const wire = translateOutbound({
      value,
      sidecars: new Map([["Pr", permissiveSidecar()]]),
      rootDef: "Pr",
    }) as { readonly [k: string]: unknown };

    // `lowerOutbound` rebuilds a nested plain object unconditionally, so the
    // wire record's field is a structural copy rather than the theta-side
    // reference — the observable here is the key set and the prototype, never
    // identity.
    expect(Object.keys(wire)).toEqual(["__proto__", "ok2"]);
    expect(Object.getPrototypeOf(wire)).toBeNull();
    expect(JSON.stringify(wire)).toBe('{"__proto__":{"polluted":"yes"},"ok2":"v"}');
  });

  it('outbound: an as "__proto__" wire rename lowers to an own wire key', () => {
    const value = JSON.parse('{"p":{"polluted":"yes"},"ok2":"v"}') as {
      readonly [k: string]: ThetaValue;
    };
    expect(Object.hasOwn(value, "__proto__")).toBe(false);
    const renaming: SchemaSidecar = {
      wireNames: [{ theta: "p", wire: "__proto__" }],
      namedEnumPositions: [],
      refTargets: [],
    };

    const wire = translateOutbound({
      value,
      sidecars: new Map([["Pr", renaming]]),
      rootDef: "Pr",
    }) as { readonly [k: string]: unknown };

    expect(Object.keys(wire)).toEqual(["__proto__", "ok2"]);
    expect(Object.getPrototypeOf(wire)).toBeNull();
    expect(JSON.stringify(wire)).toBe('{"__proto__":{"polluted":"yes"},"ok2":"v"}');
  });

  it("an ordinary payload is unperturbed: own keys, insertion order, JSON.stringify, brand, and valuesEqual in both argument orders", () => {
    // §Fix constraint 1's lock, and it holds on BOTH sides of §Fix (a): a
    // record whose keys do not collide with `Object.prototype` is
    // indistinguishable either way, and the constraint asserts that rather than
    // assuming it. This cell is not a red witness.
    const payload = JSON.parse('{"b":"2","a":"1"}') as { readonly [k: string]: ThetaValue };
    const rebuilt = translateInbound({
      validated: payload,
      sidecars: new Map([["Pr", permissiveSidecar()]]),
      rootDef: "Pr",
      schemaNames: new Set(["Pr"]),
    }) as { readonly [k: string]: ThetaValue };

    // Payload order, not sorted order — `b` precedes `a` on both sides, so a
    // reordering would be visible here (bug 0120 owns whether DECLARATION order
    // should govern instead; that question is disjoint from this one).
    expect(Object.keys(rebuilt)).toEqual(["b", "a"]);
    expect(JSON.stringify(rebuilt)).toBe('{"b":"2","a":"1"}');
    expect(schemaTagOf(rebuilt)).toBe("Pr");

    // `valuesEqual`'s object arm compares `Object.keys` plus
    // `propertyIsEnumerable.call` (`src/runtime/value.ts:541-558`), both own-key, so
    // the relation is symmetric across a locally constructed value of the same
    // schema — asserted in both argument orders because only one of the two
    // objects changes shape under §Fix (a).
    const constructed = brandSchemaValue({ b: "2", a: "1" }, "Pr");
    expect(valuesEqual(rebuilt, constructed)).toBe(true);
    expect(valuesEqual(constructed, rebuilt)).toBe(true);
  });

  it('an ordinary payload is unperturbed through the object stdlib surface: keys(), values(), has(), and has("toString") false', () => {
    // The second half of §Fix constraint 1's lock, through the real
    // `evaluateObjectMember` (`src/runtime/stdlib-object.ts:105`). Green on both
    // sides of §Fix (a); not a red witness.
    const payload = JSON.parse('{"b":"2","a":"1"}') as { readonly [k: string]: ThetaValue };
    const rebuilt = translateInbound({
      validated: payload,
      sidecars: new Map([["Pr", permissiveSidecar()]]),
      rootDef: "Pr",
    }) as { readonly [k: string]: ThetaValue };

    expect(evaluateObjectMember(rebuilt, "keys", [])).toEqual(["b", "a"]);
    expect(evaluateObjectMember(rebuilt, "values", [])).toEqual(["2", "1"]);
    expect(evaluateObjectMember(rebuilt, "has", ["a"])).toBe(true);
    expect(evaluateObjectMember(rebuilt, "has", ["nope"])).toBe(false);
    // `has` tests own keys only (`stdlib-object.ts:123`), so an
    // `Object.prototype` member name reports absent whatever the record's
    // prototype is — the read half §Fix (b) states needs no new guard.
    expect(evaluateObjectMember(rebuilt, "has", ["toString"])).toBe(false);
  });

  it("AJV control: a closed lowered fragment refuses the colliding key before the walk runs, and admits the payload without it", () => {
    // §Reproduction (b) — the report's own unreachability claim, pinned rather
    // than asserted. `#validateInvokeReturn` calls `translateInbound` only under
    // `verdict.ok` (`src/extension/production-theta-producer.ts:3464`, the call
    // at `:3472`), so on a closed lowered fragment the key never reaches either
    // record build. §Fix (a) removes the walk's DEPENDENCE on that closedness,
    // not the closedness: this cell is green on both sides and is not a red
    // witness.
    const doc = parse('schema Pr { ok2: string }\nPr { ok2: "b" }\n');
    const lowered = lowerQueryResponseSchema("Pr", schemaDeclsOf(doc), enumDeclsOf(doc));
    if (lowered === undefined) {
      throw new Error("harness: 'Pr' did not lower");
    }
    expect(lowered).toEqual({
      type: "object",
      properties: { ok2: { type: "string" } },
      required: ["ok2"],
      additionalProperties: false,
    });

    const validator = new AjvSchemaValidator({ emit: (): void => {}, slugOf: productionSlugOf });
    const compiled = validator.compile(lowered);

    const refused = compiled.validate(JSON.parse('{"__proto__":{"polluted":"yes"},"ok2":"b"}'));
    if (refused.ok) {
      throw new Error("harness: the closed fragment admitted a payload spelling __proto__");
    }
    expect(refused.errors.map((error) => error.keyword)).toEqual(["additionalProperties"]);
    expect(refused.errors[0]?.params["additionalProperty"]).toBe("__proto__");

    expect(compiled.validate(JSON.parse('{"ok2":"b"}'))).toEqual({ ok: true });
  });
});
