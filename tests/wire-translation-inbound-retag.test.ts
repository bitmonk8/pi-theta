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
import { translateInbound } from "../src/runtime/wire-translation";
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
