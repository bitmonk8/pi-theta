import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { checkThetaImports } from "../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { ThetaDocument } from "../src/parser/theta-document";
import type { FileSystem } from "../src/seams/file-system";
import { parseDeps, parseDoc } from "./helpers/e2e-s1";

// Bug 0429 — an imported-schema constructor's field set is judged at no phase.
// The same-file spelling `Author { junk: 1 }` against `schema Author { name:
// string }` draws two `E` refusals at parse — `theta/parse/extra-object-field`
// for `junk` and `theta/parse/missing-object-field` for the omitted `name`
// (checkObjectExpr, src/parser/theta-document.ts:9181 and :9189 →
// checkObjectLiteralFields, src/parser/literal-sublanguage.ts:600 and :611).
// The byte-identical constructor against the SAME declaration IMPORTED from a
// `.thetalib` is checked by nothing: parse defers on the imported name (the
// `imports.has(e.typeName)` arm, src/parser/theta-document.ts:9145, returns
// because the FS-free parser holds no library body), and the load pass — which
// resolves and parses the lib and holds its full `SchemaDecl.fields` — walks
// only imported `fn` CALL sites (`checkImportedFnCallArgs`,
// src/extension/invoke-static-checks.ts:1347), never `ObjectExpr` constructor
// sites (docs/bugs/0429-imported-schema-ctor-field-set-never-judged.md).
//
// SETTLED §Fix — Option 1 (LOAD-PASS constructor walk): alongside
// `checkImportedFnCallArgs`, walk the importing body's `ObjectExpr` sites whose
// `typeName` is an imported SCHEMA binding and judge the field set against the
// resolved lib's own `SchemaDecl.fields`, emitting the two EXISTING codes sited
// on the theta, `<schema>` rendering the constructor-site spelling. Shadowing
// (a local binding named like the import) DEFERS, mirroring
// `checkImportedFnCallArgs`'s `shadowedNames` arm; a re-export-chain-reached
// schema keeps the fn route's DIRECT-DECLARATION-ONLY fence (deferred).
//
// TIER — unit, offline, deterministic, provider-free. Every cell settles inside
// one `parseThetaDocument` (through the house driver `parseDoc`,
// tests/helpers/e2e-s1.ts) or one shipped `checkThetaImports` over an in-memory
// `FileSystem` double exposing the `readdir` / `readBytes` members the load pass
// reads (the shape tests/b0306-imported-enum-wire-values.test.ts and
// tests/imported-thetalib-fn-call-args-checked.test.ts establish). The
// adjudicated host IS `checkThetaImports`, so this tier drives the production
// seam directly; an integration tier would add a discovery round trip to a
// decision the load pass has already made and could not assert an absence more
// sharply, and a live tier would add a provider to an observable no model
// participates in — no model reads a constructor field set.
//
// NO SILENT SKIPPING (CLAUDE.md): nothing here early-returns or branches on the
// environment. A missing registry row, a frontmatter that did not parse, and a
// library that did not materialise each FAIL LOUDLY naming the unmet
// precondition, so no absence assertion is measured vacuously.

// ===========================================================================
// The two EXISTING codes the fix reuses (no code is minted — §Fix Option 1).
// ===========================================================================

/** A constructed field the schema does not declare. */
const EXTRA = "theta/parse/extra-object-field";
/** An omitted required field (every declared field is required — schemas.md). */
const MISSING = "theta/parse/missing-object-field";

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4). The two
// messages are read from the closed registry rather than hand-copied, so a
// reworded template reds by naming the registry, not by a bare string mismatch.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/** `code`'s normative *Message* template with `<field>`/`<schema>` filled. */
function msg(code: string, field: string, schema: string): string {
  const found = REGISTRY.find((r) => r.code === code);
  expect(
    found,
    `PRECONDITION (DIAG-2): ${REGISTRY_PAGE} must carry the registered row for ${code}`,
  ).toBeDefined();
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `PRECONDITION (DIAG-4): ${REGISTRY_PAGE} carries no *Message* value for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of [
    ["<field>", field],
    ["<schema>", schema],
  ] as const) {
    expect(
      out,
      `PRECONDITION (DIAG-4): the ${code} *Message* template must carry ${placeholder}; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}

/** `extra field '<field>' on schema '<schema>'`. */
const extraMsg = (field: string, schema: string): string => msg(EXTRA, field, schema);
/** `missing field '<field>' on schema '<schema>'`. */
const missingMsg = (field: string, schema: string): string => msg(MISSING, field, schema);

// ===========================================================================
// Fixtures. The library and same-file declaration are byte-identical so the
// imported answer the fix owes is byte-identical to the same-file control's.
// ===========================================================================

const APP_PATH = "/proj/app.theta";
const LIB_PATH = "/proj/lib.thetalib";
const MID_PATH = "/proj/mid.thetalib";

/** The importing `.theta`'s frontmatter; body starts on source line 5. */
const FM = ["---", 'model: "sonnet"', "mode: prompt", "---", ""].join("\n");

/** The declaring schema, identical whether same-file or in the lib. */
const SCHEMA = "schema Author { name: string }";

// ===========================================================================
// The in-memory `.thetalib` filesystem double. Only `readdir` / `readBytes` are
// exercised by `checkThetaImports`; every other member REJECTS, so an
// unexpected call reds instead of silently returning a stand-in value.
// ===========================================================================

function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => "/proj",
    configDirName: (): string => ".pi",
    globalAgentDir: (): string => "/home/.pi/agent",
    lstat: reject,
    realpath: reject,
    readdir: (path: string): Promise<readonly string[]> => {
      const entries = dirs.get(path);
      return entries === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(entries);
    },
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = Object.prototype.hasOwnProperty.call(files, path)
        ? files[path]
        : undefined;
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}

interface ComposeResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly materialised: readonly string[];
  readonly rendered: readonly string[];
}

/** Every diagnostic rendered `<severity> <code> <file>: <message>`. */
function render(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map(
    (d) => `${d.severity} ${d.code} ${d.file === undefined ? "-" : d.file}: ${d.message}`,
  );
}

/** Parse an importing `.theta` body under the shared frontmatter. */
function parseApp(body: string): ThetaDocument {
  return parseDoc(FM + body, APP_PATH);
}

/** Run the shipped load pass over one importing document and one library set. */
async function compose(doc: ThetaDocument, libs: Record<string, string>): Promise<ComposeResult> {
  expect(
    doc.frontmatter,
    `PRECONDITION: the importing theta's frontmatter must parse, or the load pass reads nothing. Parse diagnostics: ${JSON.stringify(render(doc.diagnostics))}`,
  ).not.toBeNull();
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: APP_PATH,
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const result = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  return {
    diagnostics: result.diagnostics,
    materialised: result.imports.map((m) => `${m.kind} ${m.name}`),
    rendered: render(result.diagnostics),
  };
}

/**
 * The anti-vacuity precondition every imported cell runs: the named symbol
 * MATERIALISED — proof the `.thetalib` path resolved, the library parsed, and
 * its declaration was found, i.e. the fixture reached the point where the
 * resolved library body is in hand, exactly where the load-pass constructor
 * walk would run. Without it an absence assertion could be measuring an
 * unresolvable import.
 */
function expectMaterialised(result: ComposeResult, expected: string, cell: string): void {
  expect(
    result.materialised,
    `PRECONDITION (${cell}): the load pass must materialise \`${expected}\`; that is the proof the library resolved, parsed and exported the symbol, so the constructor walk was genuinely reachable. Diagnostics: ${JSON.stringify(result.rendered)}`,
  ).toContain(expected);
}

/** The two field-set codes present in `result`, in emission order. */
function fieldSetHits(result: ComposeResult): string[] {
  return result.diagnostics.filter((d) => d.code === EXTRA || d.code === MISSING).map((d) => d.code);
}

// ===========================================================================
// A1 — same-file control. GREEN today. Pins the exact codes + messages the
// imported case (A2) owes: the `<schema>` spelling is `Author`, the extra field
// is `junk`, the missing required field is `name`.
// ===========================================================================

describe("bug 0429 (A1) — the same-file constructor draws both field-set refusals", () => {
  it("A1-samefile-control: `Author { junk: 1 }` against a same-file schema draws extra + missing", () => {
    const doc = parseApp(`${SCHEMA}\nlet a = Author { junk: 1 }\na\n`);
    expect(
      doc.frontmatter,
      "anti-vacuity (A1): the frontmatter did not parse, so this diagnostic list measures nothing",
    ).not.toBeNull();
    const rendered = doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
    // Both refusals, byte-exact. This is the ABSOLUTE PIN the imported case must
    // reach — same declaration, same construction, same codes and messages.
    expect(
      rendered,
      `A1-samefile-control — the same-file spelling is refused at parse; these are the exact codes and messages the imported spelling owes.\n  ACTUAL: ${JSON.stringify(rendered)}`,
    ).toEqual([
      `error ${EXTRA}: ${extraMsg("junk", "Author")}`,
      `error ${MISSING}: ${missingMsg("name", "Author")}`,
    ]);
  });
});

// ===========================================================================
// A2 — imported. RED today (the load pass returns `[]`). The fix must draw BOTH
// codes sited on the importing theta, byte-identical to A1's messages.
// ===========================================================================

describe("bug 0429 (A2) — the imported constructor owes the same two refusals", () => {
  it("A2-imported: `Author { junk: 1 }` against an imported schema draws extra + missing on the theta", async () => {
    const doc = parseApp(
      [`import { Author } from "./lib.thetalib"`, "let a = Author { junk: 1 }", "a", ""].join("\n"),
    );
    // Parse defers on the imported name by design (FS-free parser), so the app's
    // own parse must be clean — the field-set verdict is the LOAD pass's to draw,
    // not the parser's. A parse-tier emission here would mean a different defect.
    expect(
      doc.diagnostics.map((d) => d.code),
      `A2-imported — the FS-free parser cannot see the lib, so parse must stay silent on the imported constructor. ACTUAL: ${JSON.stringify(render(doc.diagnostics))}`,
    ).toEqual([]);
    const result = await compose(doc, { [LIB_PATH]: SCHEMA });
    expectMaterialised(result, "schema Author", "A2");
    // RED at HEAD: `checkThetaImports` has no constructor-site walk, so this list
    // is empty and the record `{ junk: 1 }` is branded AS-IS with zero
    // diagnostics. The fix must add exactly the two rows A1 pins, sited on the
    // importing theta with `<schema>` = the constructor-site spelling `Author`.
    expect(
      result.rendered,
      `A2-imported — the imported constructor owes the byte-identical refusals A1 draws, sited on ${APP_PATH}.\n  At HEAD the load pass has no ObjectExpr constructor walk, so this list is empty and the wrong-shaped record loads clean.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([
      `error ${EXTRA} ${APP_PATH}: ${extraMsg("junk", "Author")}`,
      `error ${MISSING} ${APP_PATH}: ${missingMsg("name", "Author")}`,
    ]);
  });
});

// ===========================================================================
// A3 — valid imported ctor. GREEN before AND after (guards against
// over-refusal): a correct construction against the imported schema must draw
// nothing and the schema must still materialise.
// ===========================================================================

describe("bug 0429 (A3) — a correct imported construction is not refused", () => {
  it("A3-valid-imported: `Author { name: \"x\" }` draws nothing and the schema materialises", async () => {
    const doc = parseApp(
      [`import { Author } from "./lib.thetalib"`, 'let a = Author { name: "x" }', "a", ""].join("\n"),
    );
    const result = await compose(doc, { [LIB_PATH]: SCHEMA });
    expectMaterialised(result, "schema Author", "A3");
    // The passing control that proves A2's emission is the WRONG FIELD SET and
    // not the construction shape itself; a fix that refused this over-reaches.
    expect(
      result.rendered,
      `A3-valid-imported — a construction whose field set matches the imported declaration must stay silent.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// A4 — shadowing defer. SCOPE FENCE, not a red witness: green both before and
// after the fix. A LOCAL `let Author = 1` binding outranks the import
// (expressions.md §"Identifier resolution": arm (1) local binding shadows arm
// (3) import), so the `Author { junk: 1 }` constructor does NOT denote the
// imported schema and the load-pass walk must DEFER, mirroring
// `checkImportedFnCallArgs`'s `shadowedNames` arm.
//
// The `let` shadow (not a local `schema Author`) is chosen deliberately: a
// local `schema Author` alongside `import { Author }` would draw
// `theta/parse/import-name-collision`, adding a diagnostic that would muddy the
// "no field-set diagnostic" assertion. A `let` binding collides with nothing at
// parse (imports.md §"Name collisions" scopes the collision code to top-level
// declarations, not `let`s) yet still shadows lexically, so it defers cleanly.
// ===========================================================================

describe("bug 0429 (A4) — a locally-shadowed constructor name defers (scope fence)", () => {
  it("A4-shadow-defer: a local `let Author` outranks the import, so the load pass draws no field-set diagnostic", async () => {
    const doc = parseApp(
      [
        `import { Author } from "./lib.thetalib"`,
        "let Author = 1",
        "let a = Author { junk: 1 }",
        "a",
        "",
      ].join("\n"),
    );
    const result = await compose(doc, { [LIB_PATH]: SCHEMA });
    // The symbol still materialises (the import statement is present); the fence
    // is that the WALK defers because the call site denotes the local binding.
    expectMaterialised(result, "schema Author", "A4");
    expect(
      fieldSetHits(result),
      `A4-shadow-defer — arm (1) local binding outranks arm (3) import, so the constructor does not name the imported schema; the load-pass walk must defer exactly as \`checkImportedFnCallArgs\`'s \`shadowedNames\` arm does.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// A5 — re-export-chain fence. SCOPE FENCE, not a red witness: green both before
// and after the fix. The app reaches `Author` through `mid.thetalib`
// re-exporting from `lib.thetalib`. The fix keeps the fn route's
// DIRECT-DECLARATION-ONLY fence (checkImportedFnCallArgs' `ImportedFnCallee`
// deferral): a schema reached only through a re-export chain is not a DIRECT
// top-level declaration in the directly-resolved library, so the walk WITHHOLDS
// the field-set verdict — a deliberate withhold mirroring bug 0138's restriction.
// ===========================================================================

describe("bug 0429 (A5) — a re-export-chain-reached constructor defers (scope fence)", () => {
  it("A5-reexport-fence: a wrong field set on a re-export-chain schema draws no field-set diagnostic", async () => {
    const doc = parseApp(
      [`import { Author } from "./mid.thetalib"`, "let a = Author { junk: 1 }", "a", ""].join("\n"),
    );
    const result = await compose(doc, {
      [MID_PATH]: 'export { Author } from "./lib.thetalib"\n',
      [LIB_PATH]: SCHEMA,
    });
    // The chain still materialises `Author` (proof the fixture reached the load
    // pass), but the field-set walk resolves the SOURCE name in the DIRECTLY
    // resolved library only, so a chain-reached schema withholds.
    expectMaterialised(result, "schema Author", "A5");
    expect(
      fieldSetHits(result),
      `A5-reexport-fence — the direct-declaration-only fence (mirroring bug 0138's ImportedFnCallee restriction): a re-export-chain schema is not directly declared in the resolved library, so the walk withholds. This documents the fence as a deliberate withhold, not an oversight.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// A6 — alias rendering. GREEN both before and after this cell is added (the
// fix already renders the constructor-site spelling — A2 pins the unaliased
// case; this cell pins the ALIASED one, mirroring bug 0138's b3-compose-alias
// cell). `<schema>` must render the CALL-SITE alias `Writer`, never the
// library's own declared name `Author` — that text appears nowhere on the
// offending line.
// ===========================================================================

describe("bug 0429 (A6) — an aliased import renders the alias, not the source name", () => {
  it("A6-alias-renders-alias: `Writer { junk: 1 }` renders `<schema>` = `Writer`, not `Author`", async () => {
    const doc = parseApp(
      [
        `import { Author as Writer } from "./lib.thetalib"`,
        "let a = Writer { junk: 1 }",
        "a",
        "",
      ].join("\n"),
    );
    const result = await compose(doc, { [LIB_PATH]: SCHEMA });
    // Materialised under the LOCAL (alias) name — `importedSchemas` keys by the
    // constructor-site binding, mirroring `importedFns`'s own key convention.
    expectMaterialised(result, "schema Writer", "A6");
    expect(
      result.rendered,
      `A6-alias-renders-alias — the parameter/field data comes from the LIBRARY's \`SchemaDecl\`, but \`<schema>\` renders the CALL-SITE spelling; rendering \`Author\` here would name text that appears nowhere on the offending line.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([
      `error ${EXTRA} ${APP_PATH}: ${extraMsg("junk", "Writer")}`,
      `error ${MISSING} ${APP_PATH}: ${missingMsg("name", "Writer")}`,
    ]);
  });
});

// ===========================================================================
// A7 — lib-internal fence. SCOPE FENCE, not a red witness: green both before
// and after the fix, mirroring bug 0138's g1-lib-to-lib-deferred cell. A
// wrong-field-set `ObjectExpr` construction inside a `.thetalib` BODY (not the
// importing theta's own body) is never reached: `checkImportedSchemaCtorFields`
// (src/extension/invoke-static-checks.ts) walks the IMPORTING THETA's own body
// only — it is called once, on `input.body`, and is never handed a resolved
// library's statements. `mid.thetalib` imports `Author` from `lib.thetalib`
// and constructs a wrong-shaped `Author` in ITS OWN top-level body; the app
// reaches `mid.thetalib` only through a benign, well-typed call to `mid`'s own
// `fn g`, so nothing in the app's body names the imported schema at all.
// ===========================================================================

describe("bug 0429 (A7) — a lib-internal constructor is out of reach, deferred not dropped", () => {
  it("A7-lib-internal-deferred: a wrong-field-set constructor INSIDE a lib body draws nothing", async () => {
    const doc = parseApp(
      [`import { g } from "./mid.thetalib"`, "let r = g()", "r", ""].join("\n"),
    );
    const result = await compose(doc, {
      [MID_PATH]: [
        `import { Author } from "./lib.thetalib"`,
        "let bad = Author { junk: 1 }",
        "fn g(): number { 1 }",
        "",
      ].join("\n"),
      [LIB_PATH]: SCHEMA,
    });
    // Proof the fixture reached mid.thetalib's own body (where the wrong-shaped
    // constructor lives) via a genuinely resolved, benign call — not a chain
    // that never got that far.
    expectMaterialised(result, "fn g", "A7");
    expect(
      fieldSetHits(result),
      `A7-lib-internal-deferred — the fence: the constructor walk runs over the IMPORTING THETA's own body only, so a wrong-field-set \`ObjectExpr\` written INSIDE a \`.thetalib\` body (here, mid.thetalib's own \`Author { junk: 1 }\`) is out of reach and stays silent — the same fence bug 0138's g1 cell states for call sites.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([]);
  });
});
