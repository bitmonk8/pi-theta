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
  buildSidecar,
  type InboundTranslationPlan,
  type SidecarFieldInput,
} from "../src/parser/schema-lowering";

// Bug 0067 — the inbound translation pass this seam feeds
// (`#validateInvokeReturn`, `src/extension/production-theta-producer.ts`) has
// no test coverage of `buildInboundTranslationPlan` itself: the function that
// derives, from a LOWERED schema document, the per-`$defs` sidecars an inbound
// boundary needs to re-tag named-enum positions and recurse through `$ref`
// targets.
//
// Every lowered document below is produced by the REAL `lowerQueryResponseSchema`
// (the same seam `#validateInvokeReturn` calls) over a real parsed theta body —
// not a hand-built JSON Schema fragment — so a regression in the lowering pass
// itself (a changed `$defs` shape, a changed `properties` keying) would red
// here before it could silently desynchronise the plan derivation.
//
// Spec: schema-subset.md §"Lowering Algorithm" step 5 (per-schema sidecar;
// the third `$ref`-target map this bug lands), runtime-value-model.md
// §"Wire-name translation".

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

/** Parse real theta source (mirrors `tests/query-schema-resolve.test.ts`'s harness). */
function parse(src: string, path = "plan.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}

function schemaDeclsOf(doc: ThetaDocument): readonly SchemaDecl[] {
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

function enumDeclsOf(doc: ThetaDocument): readonly EnumDecl[] {
  return doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
}

/**
 * One theta body carrying every declaration the tests below need: a named
 * `enum`; a schema with a named-enum field and an `as`-renamed field (`P`); a
 * schema referencing another schema under a field name that differs from the
 * referenced schema's own name, both directly and through `array<T>` (`Team`,
 * `manager: Person` / `roster: array<Person>`); an anonymous string-literal
 * union field (`Q`); and a `schema … = "a" | "b"` alias that lowers to the
 * identical shape as a named `enum` (`Alias`).
 */
const FIXTURE = `
enum Sev { High = "high" }
schema Person { name: string }
schema Team { manager: Person, roster: array<Person> }
schema P { sev: Sev, who as "Who": string }
schema Q { s: "a" | "b" }
schema Alias = "a" | "b"
Person { name: "x" }
`;

/** Build the plan for `annotation` against `FIXTURE`'s real lowered document. */
function planFor(annotation: string): InboundTranslationPlan {
  const doc = parse(FIXTURE);
  const schemas = schemaDeclsOf(doc);
  const enums = enumDeclsOf(doc);
  const lowered = lowerQueryResponseSchema(annotation, schemas, enums);
  if (lowered === undefined) {
    throw new Error(`harness: annotation '${annotation}' did not lower against FIXTURE`);
  }
  return buildInboundTranslationPlan({
    lowered: lowered as Record<string, unknown>,
    annotation,
    schemaNames: new Set(schemas.map((decl) => decl.name)),
    enumNames: new Set(enums.map((decl) => decl.name)),
  });
}

describe("buildInboundTranslationPlan (schema-subset.md §Lowering Algorithm step 5)", () => {
  it("a bare enum annotation names the ROOT position as its own named-enum position", () => {
    const plan = planFor("Sev");
    expect(plan.rootDef).toBe("Sev");
    const sidecar = plan.sidecars.get("Sev");
    expect(sidecar?.namedEnumPositions).toContainEqual({ pointer: "", enumName: "Sev" });
    // An enum name is never a `schema` name, so it is never brandable.
    expect(plan.schemaNames.has("Sev")).toBe(false);
  });

  it("a root array<EnumName> registers the reserved root key and tags the element one /items deep", () => {
    const plan = planFor("array<Sev>");
    // `array<Sev>` is not a bare declared name, so the root is NOT registered
    // under a declaration name (`Sev` names the ELEMENT type, not the root).
    expect(plan.rootDef).not.toBe("Sev");
    const sidecar = plan.sidecars.get(plan.rootDef);
    expect(sidecar?.namedEnumPositions).toContainEqual({ pointer: "/items", enumName: "Sev" });
    // The reserved root key is never a declared name, so it is never brandable.
    expect(plan.schemaNames.has(plan.rootDef)).toBe(false);
  });

  it("tags a named-enum FIELD of an object, and leaves the wire-name map empty despite an `as` rename", () => {
    const plan = planFor("P");
    const sidecar = plan.sidecars.get("P");
    expect(sidecar?.namedEnumPositions).toContainEqual({
      pointer: "/properties/sev",
      enumName: "Sev",
    });
    // `P` declares `who as "Who"`, yet the derived sidecar's wire-name map is
    // empty: `lowerObjectFields` keys `properties` by the theta-side field
    // name (`LowerableField` carries no `wireName`), so the lowered document
    // is already theta-side-keyed and there is no rename left to record.
    expect(sidecar?.wireNames).toEqual([]);
    expect(plan.schemaNames.has("P")).toBe(true);
  });

  it("resolves a field's $ref TARGET, not the field's own name — manager: Person names $defs Person", () => {
    const plan = planFor("Team");
    const sidecar = plan.sidecars.get("Team");
    expect(sidecar?.refTargets).toContainEqual({
      pointer: "/properties/manager",
      defName: "Person",
    });
    expect(sidecar?.refTargets?.some((t) => t.defName === "manager")).toBe(false);
    // The target's own sidecar is derived too, so recursion has somewhere to land.
    expect(plan.sidecars.has("Person")).toBe(true);
  });

  it("resolves an array<Person> FIELD's element $ref target one /items deeper than the field itself", () => {
    const plan = planFor("Team");
    const sidecar = plan.sidecars.get("Team");
    expect(sidecar?.refTargets).toContainEqual({
      pointer: "/properties/roster/items",
      defName: "Person",
    });
  });

  it("a root array<Person> resolves its element $ref target under the reserved root key", () => {
    const plan = planFor("array<Person>");
    const sidecar = plan.sidecars.get(plan.rootDef);
    expect(sidecar?.refTargets).toContainEqual({ pointer: "/items", defName: "Person" });
    // Unlike the reserved root key itself, `Person` IS a declared schema and
    // IS reachable, so it is brandable — runtime-value-model.md §"Wire-name
    // translation" attaches tags "at the same depth as the value the schema
    // annotates", so an array element whose `$ref` resolves a declared schema
    // is branded at that depth, exactly as a named-enum element is tagged there.
    expect(plan.schemaNames.has("Person")).toBe(true);
  });

  it("leaves an anonymous string-literal-union FIELD out of the named-enum map", () => {
    const plan = planFor("Q");
    const sidecar = plan.sidecars.get("Q");
    expect(sidecar?.namedEnumPositions ?? []).toEqual([]);
  });

  it("does not tag a `schema S = \"a\" | \"b\"` alias root, even though it lowers to the identical enum shape", () => {
    const plan = planFor("Alias");
    const sidecar = plan.sidecars.get("Alias");
    // `Alias` lowers to the same `{ "type": "string", "enum": [...] }` shape a
    // named `enum` does; step 5 admits a position only when its source type
    // WAS a named `enum` declaration, and an alias is a `schema`, not an
    // `enum`, so this must stay untagged.
    expect(sidecar?.namedEnumPositions ?? []).toEqual([]);
  });
});

describe("buildSidecar — $ref-target map and array-element pointer emission (schema-subset.md §Lowering Algorithm step 5)", () => {
  it("captures a per-position $ref target on the same JSON-Pointer keying as the other two maps", () => {
    const fields: SidecarFieldInput[] = [
      {
        thetaName: "manager",
        pointer: "/properties/manager",
        type: { kind: "other" },
        refTarget: "Person",
      },
    ];
    const sidecar = buildSidecar(fields);
    expect(sidecar.refTargets).toContainEqual({ pointer: "/properties/manager", defName: "Person" });
  });

  it("emits an array-element position by appending /items to the field's own pointer, recursing for array<array<T>>", () => {
    const fields: SidecarFieldInput[] = [
      {
        thetaName: "grid",
        pointer: "/properties/grid",
        type: { kind: "other" },
        element: {
          type: { kind: "other" },
          refTarget: "Row",
          element: { type: { kind: "named-enum", enumName: "Severity" } },
        },
      },
    ];
    const sidecar = buildSidecar(fields);
    // The outer array's own element position (one `/items`) resolves `Row`.
    expect(sidecar.refTargets).toContainEqual({ pointer: "/properties/grid/items", defName: "Row" });
    // `Row`'s own element position (two `/items`, `array<array<Severity>>`) is tagged.
    expect(sidecar.namedEnumPositions).toContainEqual({
      pointer: "/properties/grid/items/items",
      enumName: "Severity",
    });
  });

  it("always emits the refTargets map, empty when no position of a field is a $ref", () => {
    const sidecar = buildSidecar([
      { thetaName: "age", pointer: "/properties/age", type: { kind: "other" } },
    ]);
    expect(sidecar.refTargets).toEqual([]);
  });
});
