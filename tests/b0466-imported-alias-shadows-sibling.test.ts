import { fakeThetaLibFs } from "./helpers/thetalib-load-harness";
import { describe, expect, it } from "vitest";
import { lowerQueryResponseSchema } from "../src/parser/query-schema-lowering";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import type { SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { checkThetaImports } from "../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseDeps, parseDoc, schemaDeclsOf, enumDeclsOf } from "./helpers/e2e-s1";

// Bug 0466 — aliasing a `.thetalib` import to the SOURCE name of one of its own
// same-lib transitive dependencies (`import { ReviewSummary as Detail }` where
// `ReviewSummary` declares `detail: Detail` against a same-lib `schema Detail`)
// collides two schemas on one flat-`$defs` name. Pre-fix,
// `collectImportedTypeDecls` (src/extension/import-static-checks.ts:264, storage
// :304-310) stores the aliased ENTRY under `Detail` first and drops the sibling
// silently — `$defs/Detail` binds ReviewSummary's own shape (self-recursive with
// required fields), so AJV refuses EVERY reply including one conforming exactly
// to the declared shapes. No diagnostic is minted at any layer (the KNOWN
// RESIDUAL doc-comment, import-static-checks.ts:255-263).
//
// FIX (§Fix Option 2, SETTLED — operator 2026-09-20): convert the silent drop
// into a LOUD load-time refusal. When the directly-imported entry's `as` alias
// (`outputName`) equals the source name of a DIFFERENT decl reached in that
// entry's same-lib closure, mint the load-time error
// `theta/load/imported-type-name-collision` and un-register the theta, matching
// imports.md:137's no-implicit-shadowing posture (two sources never silently
// bind one name) and preserving schema-subset.md:72's closure rule.
//
// SPEC:
//   - schema-subset.md:72 (Lowering Algorithm step 1): every named schema in the
//     closure — top-level and transitively imported — becomes one `$defs/<Name>`
//     entry. The sibling `Detail` is in the closure (the entry's own field
//     references it), yet first-wins drops it; the fix refuses rather than drop.
//   - imports.md:130-139 (§Name collisions): "no implicit shadowing" — two
//     sources never silently bind one name; the alias-vs-lib-internal-sibling
//     collision is the same posture, one level in.
//
// TIER — unit, offline, deterministic, provider-free: the collision is decided
// at collection time inside `collectImportedTypeDecls`, which the real
// `checkThetaImports` load pass runs SYNCHRONOUSLY over an in-memory `.thetalib`
// FS before any provider turn. The control routes the merged closure through the
// same production data-flow the 0465 suite pins (`lowerQueryResponseSchema` +
// real `AjvSchemaValidator`). An integration/live tier would add a provider to a
// seam no model participates in and could not sharpen the refuse-vs-lower
// contrast this test pins deterministically.
//
// NO SILENT SKIPPING (CLAUDE.md / AGENTS.md): nothing early-returns or branches
// on the environment. A frontmatter that did not parse and a schema that failed
// to lower each FAIL LOUDLY naming the unmet precondition, so no assertion is
// measured vacuously.

// ===========================================================================
// Shared fixtures — the doc §Reproduction fixtures verbatim.
// ===========================================================================

const FM = ["---", 'model: "sonnet"', "mode: prompt", "---", ""].join("\n");
const LIB_PATH = "/proj/quality.thetalib";
const APP_PATH = "/proj/app.theta";

/** The shared lib: `ReviewSummary` transitively references a same-lib sibling `Detail`. */
const COLLISION_LIB =
  "schema Detail { count: integer }\nschema ReviewSummary { shard: string, detail: Detail }\n";

/** The refusal diagnostic (0466-pins.md): CODE + DIAG-4 normative message with `<name>` = `Detail`. */
const COLLISION_CODE = "theta/load/imported-type-name-collision";
const COLLISION_MESSAGE =
  "imported type name 'Detail' is claimed by two different declarations in the imported schema closure; disambiguate with a different 'as' alias";

/** The conforming payload (doc §Reproduction) — exactly the declared shapes. */
const CONFORMING = { shard: "s", detail: { count: 1 } } as const;
/** A garbage `detail` — `count` is a string, not the declared integer. */
const GARBAGE = { shard: "s", detail: { count: "junk" } } as const;

// ===========================================================================
// Substrate — mirrors the 0465 suite's real production data-flow helpers.
// ===========================================================================

/** Parse an importing `.theta` body under the shared frontmatter; frontmatter parse is a loud precondition. */
function parseApp(body: string, path = APP_PATH): ThetaDocument {
  const doc = parseDoc(FM + body, path);
  expect(
    doc.frontmatter,
    `PRECONDITION: the theta frontmatter must parse, else the body is read against nothing. Diagnostics: ${JSON.stringify(doc.diagnostics.map((d) => d.code))}`,
  ).not.toBeNull();
  return doc;
}

function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: "review-summary",
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/** Drive the real `checkThetaImports` load pass over the in-memory lib. */
async function runImportCheck(
  doc: ThetaDocument,
  libFiles: Record<string, string>,
): Promise<Awaited<ReturnType<typeof checkThetaImports>>> {
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: APP_PATH,
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  return checkThetaImports(input, {
    fs: fakeThetaLibFs(libFiles),
    parseDeps: parseDeps(),
  });
}

/**
 * The 0465 suite's real production data-flow, minus the "no diagnostic"
 * precondition (a control asserts silence explicitly; the collision case
 * asserts the refusal): run the real `checkThetaImports`, merge its
 * `importedTypeDecls` channel same-file-wins (imported-first), and lower the
 * annotation through the same `lowerQueryResponseSchema` seam the producer's
 * typed-query call site drives.
 */
function mergeAndLower(
  annotation: string,
  doc: ThetaDocument,
  check: Awaited<ReturnType<typeof checkThetaImports>>,
): { lowered: LoweredSchema; schemas: readonly SchemaDecl[] } {
  const sameFileSchemas = schemaDeclsOf(doc);
  const sameFileEnums = enumDeclsOf(doc);
  const sameFileSchemaNames = new Set(sameFileSchemas.map((d) => d.name));
  const sameFileEnumNames = new Set(sameFileEnums.map((d) => d.name));
  const schemas = [
    ...check.importedTypeDecls.schemas.filter((d) => !sameFileSchemaNames.has(d.name)),
    ...sameFileSchemas,
  ];
  const enums = [
    ...check.importedTypeDecls.enums.filter((d) => !sameFileEnumNames.has(d.name)),
    ...sameFileEnums,
  ];
  const lowered = lowerQueryResponseSchema(annotation, schemas, enums);
  expect(
    lowered,
    `PRECONDITION: \`${annotation}\` lowered to undefined — the annotation carries no lowerable shape at all, a different failure than the collision this bug is about.`,
  ).toBeDefined();
  return { lowered: lowered as LoweredSchema, schemas };
}

// ===========================================================================
// (a) COLLISION — the alias equals a same-lib sibling's source name; the load
// pass MUST refuse loudly. RED at HEAD (silent first-wins drop, no diagnostic).
// ===========================================================================

describe("bug 0466 (a) — `import { ReviewSummary as Detail }` collides the alias with a same-lib sibling and MUST refuse", () => {
  it("mints exactly one `theta/load/imported-type-name-collision` load-time error, sited on the import specifier", async () => {
    const importLine = 'import { ReviewSummary as Detail } from "./quality.thetalib"';
    const doc = parseApp(`${importLine}\nlet d: Detail = @\`x\`?\nd\n`);
    const check = await runImportCheck(doc, { [LIB_PATH]: COLLISION_LIB });
    const collisions = check.diagnostics.filter((d) => d.code === COLLISION_CODE);
    expect(
      collisions,
      "0466 §Fix Option 2: the alias-vs-sibling collision MUST mint exactly one load-time refusal; at HEAD the sibling is dropped silently (zero diagnostics)",
    ).toHaveLength(1);
    const collision = collisions[0];
    expect(collision?.severity, "a load-time ERROR un-registers the importing theta").toBe("error");
    expect(collision?.message).toBe(COLLISION_MESSAGE);

    // 0466-pins.md: the diagnostic is sited "at the import specifier" — pin the
    // FILE and the specifier's line/column span so a relocation of the site
    // regresses loudly rather than silently drifting off the specifier token.
    // The `ReviewSummary as Detail` specifier sits on the import statement's
    // line; the range spans from the SOURCE name to the end of the `as` alias.
    expect(collision?.file, "the refusal sites on the importing theta, not the lib").toBe(APP_PATH);
    // The frontmatter block occupies the leading lines; its trailing newline
    // lands the body's first line (the import) at `FM.split("\n").length`.
    const importLineNumber = FM.split("\n").length;
    const specStartColumn = importLine.indexOf("ReviewSummary") + 1;
    const specEndColumn = importLine.indexOf("Detail") + "Detail".length + 1;
    expect(collision?.range?.start, "the range starts at the specifier's source name").toEqual({
      line: importLineNumber,
      column: specStartColumn,
    });
    expect(collision?.range?.end, "the range ends one past the specifier's `as` alias").toEqual({
      line: importLineNumber,
      column: specEndColumn,
    });
  });
});

// ===========================================================================
// (b) CONTROL — the alias equals no same-lib sibling source name; the closure
// lowers and validates exactly as today. GREEN at HEAD (true non-collision
// closures stay unaffected — the fix's explicit guarantee).
// ===========================================================================

describe("bug 0466 (b) — `import { ReviewSummary as Summary }` is a true non-collision closure and stays unaffected", () => {
  it("emits no diagnostic, collects both `Summary` and the sibling `Detail`, and validates the declared shapes", async () => {
    const doc = parseApp(
      'import { ReviewSummary as Summary } from "./quality.thetalib"\nlet s: Summary = @`x`?\ns\n',
    );
    const check = await runImportCheck(doc, { [LIB_PATH]: COLLISION_LIB });

    // No collision: the alias `Summary` does not equal any same-lib sibling
    // source name, so the load pass stays silent (unaffected by the fix).
    expect(
      check.diagnostics,
      `the control alias collides with nothing and MUST load clean. Diagnostics: ${JSON.stringify(check.diagnostics.map((d) => `${d.severity} ${d.code}`))}`,
    ).toEqual([]);

    // schema-subset.md:72: the closure collects the aliased entry (`Summary`)
    // AND its transitively-referenced sibling (`Detail`) — both get a `$defs`.
    const { lowered, schemas } = mergeAndLower("Summary", doc, check);
    const names = new Set(schemas.map((d) => d.name));
    expect(
      names.has("Summary"),
      "the aliased entry ReviewSummary must be collected under its `as` name `Summary`",
    ).toBe(true);
    expect(
      names.has("Detail"),
      "the transitively-referenced sibling `Detail` must stay in the closure (not dropped)",
    ).toBe(true);

    // Same-file gate, both directions: the conforming payload validates, the
    // garbage `detail` is refused — routed through the real AJV validator.
    const compiled = ajv().compile(lowered);
    expect(
      compiled.validate(CONFORMING).ok,
      "the conforming payload {shard, detail:{count}} validates against the declared shapes",
    ).toBe(true);
    expect(
      compiled.validate(GARBAGE).ok,
      "a garbage `detail` (count is a string) is refused — the sibling `Detail`'s `count: integer` constrains it",
    ).toBe(false);
  });
});

// ===========================================================================
// (c) F1 CROSS-LIB BYTE-IDENTITY EXEMPTION — two different `.thetalib` files
// each declaring a STRUCTURALLY-IDENTICAL `schema Shared { n: integer }` at
// DIFFERENT source offsets, imported such that both transitive closures reach
// `Shared`. The cross-specifier aggregation (surface 3) compares the two
// reached decls: structurally identical ⇒ the SAME declaration ⇒ no refusal.
// RED before the F1 fix (the pre-fix `JSON.stringify(a) !== JSON.stringify(b)`
// serialises the position-bearing `range`/`line` fields, so the same shape at
// two offsets reads as "different" and falsely refuses); GREEN after (position
// stripped before the structural compare).
// ===========================================================================

/** lib1: `Shared` at line 1 (no leading blank), referenced by a wrapper. */
const LIB1 = "schema Shared { n: integer }\nschema Wrapper1 { s: Shared }\n";
/** lib2: a STRUCTURALLY-IDENTICAL `Shared`, shifted down one line by a leading blank so its `range`/field `line` differ from lib1's. */
const LIB2 = "\nschema Shared { n: integer }\nschema Wrapper2 { s: Shared }\n";

describe("bug 0466 (c) — a byte-identical `Shared` reached from two different libs at different offsets is the same declaration and MUST NOT refuse", () => {
  it("emits no `theta/load/imported-type-name-collision` for the cross-lib byte-identity diamond", async () => {
    const doc = parseApp(
      'import { Wrapper1 } from "./lib1.thetalib"\nimport { Wrapper2 } from "./lib2.thetalib"\nlet a: Wrapper1 = @`x`?\nlet b: Wrapper2 = @`y`?\na\n',
    );
    const check = await runImportCheck(doc, {
      "/proj/lib1.thetalib": LIB1,
      "/proj/lib2.thetalib": LIB2,
    });
    const collisions = check.diagnostics.filter((d) => d.code === COLLISION_CODE);
    expect(
      collisions,
      `structurally-identical decls at different offsets are the SAME declaration (schema-subset.md byte-identity) — no refusal. Diagnostics: ${JSON.stringify(check.diagnostics.map((d) => `${d.severity} ${d.code}`))}`,
    ).toHaveLength(0);
  });
});
