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

// Bug 0448 — a constructor naming an imported NON-OBJECT declaration is judged
// at no phase and mints a value at runtime. The same-file spelling of each is
// refused `theta/parse/unresolved-named-type` (the brace-constructible clause,
// docs/spec_topics/diagnostics/code-registry-parse.md:115: "a name declared
// here as an `enum`, or as a `schema` without an object body, is not
// constructible and fires this code"), drawn by checkObjectExpr's constructor
// classification (the `bodySchemas.has` arm, src/parser/theta-document.ts:9323).
// The byte-identical constructor against the SAME declaration IMPORTED from a
// `.thetalib` is checked by nothing: parse defers on the imported name (the
// `imports.has(e.typeName)` arm, src/parser/theta-document.ts:9245, because the
// FS-free parser holds neither the library's field bodies nor its KIND), and
// the load pass — which resolves and parses the lib and holds its full
// declaration — walks only imported-schema OBJECT field sets
// (`checkImportedSchemaCtorFields`, src/extension/invoke-static-checks.ts:1538,
// keyed on `importedSchemas` which is populated only when
// `schemaDecl.fields !== undefined`, src/extension/import-static-checks.ts:1209),
// never a constructor whose head resolves to an enum, an alias-form schema, or
// a fn. The per-specifier decl loop ALREADY finds the enum
// (import-static-checks.ts:1221), the alias/head-only schema (:1206–:1209) and
// the fn (:1189) for the same specifier and DROPS the kind for the constructor
// question — the residual its own comment records outright
// (import-static-checks.ts:1203–1204: "the imported alias-form/enum-name
// constructor stays silent here — a residual outside this bug's scope").
// Runtime then mints: `buildObjectSchemaValue` (src/runtime/value.ts:398, called
// at src/runtime/statement-executor.ts:1070) returns the record unbranded for
// an enum/fn `resolveSchema` miss, and brands it AS-IS for a fields-less alias
// registration (docs/bugs/0448-imported-non-object-ctor-mints-silently.md).
//
// SETTLED §Fix — Option 1 (LOAD-PASS kind check): in the per-specifier decl
// loop, record each imported binding's KIND, then judge each `ObjectExpr` whose
// `typeName` is an imported binding resolving to an enum / fields-less schema /
// fn, emitting `theta/parse/unresolved-named-type` (the REUSED same-file code
// and message per the brace-constructible clause) sited on the theta, with the
// 0429-shape fences: shadow-defer via `collectLocalBinderNames`, and
// direct-declaration-only (re-export chains withheld and stated).
//
// TIER — unit, offline, deterministic, provider-free. Every cell settles inside
// one `parseThetaDocument` (through the house driver `parseDoc`,
// tests/helpers/e2e-s1.ts) or one shipped `checkThetaImports` over an in-memory
// `FileSystem` double exposing the `readdir` / `readBytes` members the load pass
// reads (the shape tests/b0429-imported-schema-ctor-field-set.test.ts and
// tests/b0306-imported-enum-wire-values.test.ts establish). The adjudicated
// host IS `checkThetaImports`, so this tier drives the production seam directly;
// an integration tier would add a discovery round trip to a decision the load
// pass has already made and could not assert an absence more sharply, and a
// live tier would add a provider to an observable no model participates in — no
// model reads a constructor head's declared kind.
//
// NO SILENT SKIPPING (CLAUDE.md): nothing here early-returns or branches on the
// environment. A missing registry row, a frontmatter that did not parse, and a
// library that did not materialise each FAIL LOUDLY naming the unmet
// precondition, so no absence assertion is measured vacuously.

// ===========================================================================
// The EXISTING code the fix reuses (no code is minted — §Fix Option 1). It is
// the SAME code, with the SAME message, the same-file spelling already draws.
// ===========================================================================

/** A constructor naming a non-brace-constructible declaration (enum / alias). */
const UNRESOLVED = "theta/parse/unresolved-named-type";

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4). The message
// is read from the closed registry rather than hand-copied, so a reworded
// template reds by naming the registry, not by a bare string mismatch.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/** `theta/parse/unresolved-named-type`'s normative *Message* with `<name>` filled. */
function nameMsg(name: string): string {
  const found = REGISTRY.find((r) => r.code === UNRESOLVED);
  expect(
    found,
    `PRECONDITION (DIAG-2): ${REGISTRY_PAGE} must carry the registered row for ${UNRESOLVED}`,
  ).toBeDefined();
  const template = registryMessage(REGISTRY, UNRESOLVED) as string | undefined;
  expect(
    template,
    `PRECONDITION (DIAG-4): ${REGISTRY_PAGE} carries no *Message* value for ${UNRESOLVED}`,
  ).toBeDefined();
  const out = template as string;
  expect(
    out,
    `PRECONDITION (DIAG-4): the ${UNRESOLVED} *Message* template must carry <name>; template=${JSON.stringify(template)}`,
  ).toContain("<name>");
  return out.replace("<name>", name);
}

// ===========================================================================
// Fixtures. The library declaration and the same-file declaration are
// byte-identical so the imported answer the fix owes is byte-identical to the
// same-file control's — the same code, the same message, the same head spelling.
// ===========================================================================

const APP_PATH = "/proj/app.theta";
const LIB_PATH = "/proj/lib.thetalib";
const MID_PATH = "/proj/mid.thetalib";

/** The importing `.theta`'s frontmatter; body starts on source line 5. */
const FM = ["---", 'model: "sonnet"', "mode: prompt", "---", ""].join("\n");

/** The three non-object declarations, identical whether same-file or in a lib. */
const ENUM_DECL = "enum Sev { Low }";
const ALIAS_DECL = "schema S = string";
const FN_DECL = "fn af(x: integer): integer { x }";
/** A valid object-form schema — the over-refusal guard (K4). */
const OBJECT_DECL = "schema Author { name: string }";
/**
 * A dual-kind lib: a fields-bearing object-form `schema X` AND a same-name
 * `enum X`. Both are legal top-level declarations (the same-file control below
 * parses clean), and same-file constructor precedence makes the fields-bearing
 * schema WIN — `checkObjectExpr` consults `refs.schemas` first — so `X { … }`
 * is judged as an object construction, never as the enum. The K8 over-refusal
 * guard.
 */
const DUALKIND_DECL = "schema X { a: string }\nenum X { A }";

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
 * resolved library body (and its KIND) is in hand, exactly where the load-pass
 * kind check would run. Without it an absence assertion could be measuring an
 * unresolvable import.
 */
function expectMaterialised(result: ComposeResult, expected: string, cell: string): void {
  expect(
    result.materialised,
    `PRECONDITION (${cell}): the load pass must materialise \`${expected}\`; that is the proof the library resolved, parsed and exported the symbol, so the kind check was genuinely reachable. Diagnostics: ${JSON.stringify(result.rendered)}`,
  ).toContain(expected);
}

/** The `unresolved-named-type` diagnostics present in `result`, in emission order. */
function unresolvedHits(result: ComposeResult): readonly Diagnostic[] {
  return result.diagnostics.filter((d) => d.code === UNRESOLVED);
}

// ===========================================================================
// K1a — same-file enum control. GREEN today. Pins the exact code + message the
// imported case (K1b) owes: `<name>` renders `Sev`, the enum head the author
// wrote at the constructor position.
// ===========================================================================

describe("bug 0448 (K1a) — a same-file enum constructor is refused", () => {
  it("K1a-samefile-enum: `Sev { junk: 1 }` against a same-file enum draws unresolved-named-type 'Sev'", () => {
    const doc = parseApp(`${ENUM_DECL}\nlet x = Sev { junk: 1 }\nx\n`);
    expect(
      doc.frontmatter,
      "anti-vacuity (K1a): the frontmatter did not parse, so this diagnostic list measures nothing",
    ).not.toBeNull();
    const rendered = doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
    // The ABSOLUTE PIN the imported case must reach — same declaration, same
    // construction, same code and message.
    expect(
      rendered,
      `K1a-samefile-enum — the same-file spelling is refused at parse; this is the exact code and message the imported spelling owes.\n  ACTUAL: ${JSON.stringify(rendered)}`,
    ).toEqual([`error ${UNRESOLVED}: ${nameMsg("Sev")}`]);
  });
});

// ===========================================================================
// K1b — imported enum. RED today (the load pass returns `[]`). The fix must
// draw the SAME code sited on the importing theta, byte-identical to K1a's
// message.
// ===========================================================================

describe("bug 0448 (K1b) — the imported enum constructor owes the same refusal", () => {
  it("K1b-imported-enum: `Sev { junk: 1 }` against an imported enum draws unresolved-named-type on the theta", async () => {
    const doc = parseApp(
      [`import { Sev } from "./lib.thetalib"`, "let x = Sev { junk: 1 }", "x", ""].join("\n"),
    );
    // Parse defers on the imported name by design (FS-free parser holds neither
    // the field bodies nor the kind), so the app's own parse must be clean — the
    // kind verdict is the LOAD pass's to draw. A parse-tier emission here would
    // mean a different defect.
    expect(
      doc.diagnostics.map((d) => d.code),
      `K1b-imported-enum — the FS-free parser cannot see the lib, so parse must stay silent on the imported constructor. ACTUAL: ${JSON.stringify(render(doc.diagnostics))}`,
    ).toEqual([]);
    const result = await compose(doc, { [LIB_PATH]: ENUM_DECL });
    expectMaterialised(result, "enum Sev", "K1b");
    // RED at HEAD: `checkThetaImports` has no constructor-head kind check, so
    // this list is empty and the record `{ junk: 1 }` is minted UNBRANDED with
    // zero diagnostics. The fix must add exactly the row K1a pins, sited on the
    // importing theta with `<name>` = the constructor-site spelling `Sev`.
    expect(
      result.rendered,
      `K1b-imported-enum — the imported enum constructor owes the byte-identical refusal K1a draws, sited on ${APP_PATH}.\n  At HEAD the load pass has no kind check, so this list is empty and the wrong-kind record loads clean.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([`error ${UNRESOLVED} ${APP_PATH}: ${nameMsg("Sev")}`]);
  });
});

// ===========================================================================
// K2a — same-file alias-form schema control. GREEN today. `<name>` = `S`.
// ===========================================================================

describe("bug 0448 (K2a) — a same-file alias-form schema constructor is refused", () => {
  it("K2a-samefile-alias: `S { a: 1 }` against `schema S = string` draws unresolved-named-type 'S'", () => {
    const doc = parseApp(`${ALIAS_DECL}\nlet x = S { a: 1 }\nx\n`);
    expect(
      doc.frontmatter,
      "anti-vacuity (K2a): the frontmatter did not parse, so this diagnostic list measures nothing",
    ).not.toBeNull();
    const rendered = doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
    expect(
      rendered,
      `K2a-samefile-alias — a `+`schema without an object body is not brace-constructible; this is the exact code and message the imported spelling owes.\n  ACTUAL: ${JSON.stringify(rendered)}`,
    ).toEqual([`error ${UNRESOLVED}: ${nameMsg("S")}`]);
  });
});

// ===========================================================================
// K2b — imported alias-form schema. RED today. The fix owes the same refusal;
// materialises `schema S` (fields-less, so it never enters `importedSchemas`
// and the field-set walk never sees it).
// ===========================================================================

describe("bug 0448 (K2b) — the imported alias-form schema constructor owes the same refusal", () => {
  it("K2b-imported-alias: `S { a: 1 }` against an imported `schema S = string` draws unresolved-named-type on the theta", async () => {
    const doc = parseApp(
      [`import { S } from "./lib.thetalib"`, "let x = S { a: 1 }", "x", ""].join("\n"),
    );
    expect(
      doc.diagnostics.map((d) => d.code),
      `K2b-imported-alias — parse must stay silent on the imported constructor. ACTUAL: ${JSON.stringify(render(doc.diagnostics))}`,
    ).toEqual([]);
    const result = await compose(doc, { [LIB_PATH]: ALIAS_DECL });
    expectMaterialised(result, "schema S", "K2b");
    // RED at HEAD: the fields-less alias never enters `importedSchemas`
    // (import-static-checks.ts:1209 guards on `schemaDecl.fields !== undefined`),
    // so the field-set walk never sees the site and no kind check exists beside
    // it. Runtime brands the record AS-IS with the `S` schema tag.
    expect(
      result.rendered,
      `K2b-imported-alias — the imported alias-form constructor owes the byte-identical refusal K2a draws, sited on ${APP_PATH}.\n  At HEAD the list is empty and the record is branded as a schema whose type is 'string'.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([`error ${UNRESOLVED} ${APP_PATH}: ${nameMsg("S")}`]);
  });
});

// ===========================================================================
// K3a — same-file fn control. GREEN today. `<name>` = `af`.
// ===========================================================================

describe("bug 0448 (K3a) — a same-file fn-name constructor is refused", () => {
  it("K3a-samefile-fn: `af { a: 1 }` against a same-file fn draws unresolved-named-type 'af'", () => {
    const doc = parseApp(`${FN_DECL}\nlet x = af { a: 1 }\nx\n`);
    expect(
      doc.frontmatter,
      "anti-vacuity (K3a): the frontmatter did not parse, so this diagnostic list measures nothing",
    ).not.toBeNull();
    const rendered = doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
    expect(
      rendered,
      `K3a-samefile-fn — a fn name is not brace-constructible; this is the exact code and message the imported spelling owes.\n  ACTUAL: ${JSON.stringify(rendered)}`,
    ).toEqual([`error ${UNRESOLVED}: ${nameMsg("af")}`]);
  });
});

// ===========================================================================
// K3b — imported fn. RED today. The fix owes the same refusal; materialises
// `fn af`.
// ===========================================================================

describe("bug 0448 (K3b) — the imported fn-name constructor owes the same refusal", () => {
  it("K3b-imported-fn: `af { a: 1 }` against an imported fn draws unresolved-named-type on the theta", async () => {
    const doc = parseApp(
      [`import { af } from "./lib.thetalib"`, "let x = af { a: 1 }", "x", ""].join("\n"),
    );
    expect(
      doc.diagnostics.map((d) => d.code),
      `K3b-imported-fn — parse must stay silent on the imported constructor. ACTUAL: ${JSON.stringify(render(doc.diagnostics))}`,
    ).toEqual([]);
    const result = await compose(doc, { [LIB_PATH]: FN_DECL });
    expectMaterialised(result, "fn af", "K3b");
    // RED at HEAD: the fn decl is found (import-static-checks.ts:1189) but its
    // kind is dropped for the constructor question, so this list is empty and
    // the record `{ a: 1 }` is minted UNBRANDED.
    expect(
      result.rendered,
      `K3b-imported-fn — the imported fn-name constructor owes the byte-identical refusal K3a draws, sited on ${APP_PATH}.\n  At HEAD the list is empty and the wrong-kind record loads clean.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([`error ${UNRESOLVED} ${APP_PATH}: ${nameMsg("af")}`]);
  });
});

// ===========================================================================
// K4 — valid imported OBJECT-schema constructor. GREEN before AND after
// (over-refusal guard): the fix must refuse only NON-object heads, leaving bug
// 0429's object class untouched. A correct construction against an imported
// object schema draws nothing and the schema materialises.
// ===========================================================================

describe("bug 0448 (K4) — a valid imported object-schema constructor is not refused", () => {
  it("K4-valid-object: `Author { name: \"x\" }` draws nothing and the object schema materialises", async () => {
    const doc = parseApp(
      [`import { Author } from "./lib.thetalib"`, 'let x = Author { name: "x" }', "x", ""].join("\n"),
    );
    const result = await compose(doc, { [LIB_PATH]: OBJECT_DECL });
    expectMaterialised(result, "schema Author", "K4");
    // The fix keys on the head's KIND (enum / fields-less schema / fn); an
    // object-form schema is brace-constructible and must stay silent. A fix that
    // refused this over-reaches into bug 0429's already-judged object class.
    expect(
      result.rendered,
      `K4-valid-object — a construction against an imported object-form schema must stay silent (0429's class, untouched).\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// K5 — shadowing defer. SCOPE FENCE, not a red witness: green both before and
// after the fix. A LOCAL `let Sev = 1` binding outranks the import
// (expressions.md §"Identifier resolution": arm (1) local binding shadows arm
// (3) import), so the `Sev { junk: 1 }` constructor does NOT denote the imported
// enum and the load-pass kind check must DEFER via `collectLocalBinderNames`,
// mirroring `checkImportedSchemaCtorFields`'s `shadowedNames` arm. The `let`
// shadow (not a colliding top-level decl) is chosen so the shadow adds no
// import-name-collision that would muddy the "no unresolved-named-type"
// assertion — the assertion filters to this code alone for exactly that reason.
// ===========================================================================

describe("bug 0448 (K5) — a locally-shadowed constructor name defers (scope fence)", () => {
  it("K5-shadow-defer: a local `let Sev` outranks the import, so the load pass draws no unresolved-named-type", async () => {
    const doc = parseApp(
      [
        `import { Sev } from "./lib.thetalib"`,
        "let Sev = 1",
        "let x = Sev { junk: 1 }",
        "x",
        "",
      ].join("\n"),
    );
    const result = await compose(doc, { [LIB_PATH]: ENUM_DECL });
    // The symbol still materialises (the import statement is present); the fence
    // is that the KIND CHECK defers because the call site denotes the local let.
    expectMaterialised(result, "enum Sev", "K5");
    expect(
      unresolvedHits(result),
      `K5-shadow-defer — arm (1) local binding outranks arm (3) import, so the constructor does not name the imported enum; the load-pass kind check must defer exactly as \`checkImportedSchemaCtorFields\`'s \`shadowedNames\` arm does.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// K6 — re-export-chain fence. SCOPE FENCE, not a red witness: green both before
// and after the fix. The app reaches `Sev` through `mid.thetalib` re-exporting
// from `lib.thetalib`. The fix keeps the 0429 route's DIRECT-DECLARATION-ONLY
// fence: an enum reached only through a re-export chain is not a DIRECT
// top-level declaration in the directly-resolved library, so the kind check
// WITHHOLDS — a deliberate withhold, stated, not an oversight.
// ===========================================================================

describe("bug 0448 (K6) — a re-export-chain-reached constructor defers (scope fence)", () => {
  it("K6-reexport-fence: a constructor on a re-export-chain enum draws no unresolved-named-type", async () => {
    const doc = parseApp(
      [`import { Sev } from "./mid.thetalib"`, "let x = Sev { junk: 1 }", "x", ""].join("\n"),
    );
    const result = await compose(doc, {
      [MID_PATH]: 'export { Sev } from "./lib.thetalib"\n',
      [LIB_PATH]: ENUM_DECL,
    });
    // The chain still materialises `Sev` (proof the fixture reached the load
    // pass), but the kind check resolves the SOURCE name in the DIRECTLY
    // resolved library only, so a chain-reached enum withholds.
    expectMaterialised(result, "enum Sev", "K6");
    expect(
      unresolvedHits(result),
      `K6-reexport-fence — the direct-declaration-only fence (mirroring bug 0429's re-export withhold): a re-export-chain enum is not directly declared in the resolved library, so the kind check withholds. This documents the fence as a deliberate withhold, not an oversight.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// K7 — alias rendering. RED today (the load pass returns `[]`), and it pins the
// ALIASED red-witness shape mirroring bug 0429's b3-compose-alias / A6 cell:
// `<name>` must render the CALL-SITE alias `Level`, never the library's own
// declared name `Sev` — that text appears nowhere on the offending line. The
// binding materialises under the local (alias) name, so the fix keys and
// renders by the constructor-site spelling.
// ===========================================================================

describe("bug 0448 (K7) — an aliased imported constructor renders the alias, not the source name", () => {
  it("K7-alias-renders-alias: `Level { junk: 1 }` renders `<name>` = `Level`, not `Sev`", async () => {
    const doc = parseApp(
      [
        `import { Sev as Level } from "./lib.thetalib"`,
        "let x = Level { junk: 1 }",
        "x",
        "",
      ].join("\n"),
    );
    const result = await compose(doc, { [LIB_PATH]: ENUM_DECL });
    // Materialised under the LOCAL (alias) name — the imported-binding kind is
    // keyed by the constructor-site binding, mirroring `importedFns` /
    // `importedSchemas`' own key convention (`specifier.local`).
    expectMaterialised(result, "enum Level", "K7");
    // RED at HEAD: empty list. The fix owes the refusal rendering the call-site
    // spelling; the source name `Sev` must appear nowhere on the offending line.
    expect(
      result.rendered,
      `K7-alias-renders-alias — the kind data comes from the LIBRARY's enum decl, but `+`<name> renders the CALL-SITE spelling; rendering \`Sev\` here would name text that appears nowhere on the offending line.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([`error ${UNRESOLVED} ${APP_PATH}: ${nameMsg("Level")}`]);
  });
});

// ===========================================================================
// K8 — dual-kind over-refusal guard. GREEN after the F1 remedy. A lib legally
// declaring BOTH a fields-bearing `schema X { a: string }` AND a same-name
// `enum X { A }` must NOT over-refuse the imported `X { a: "x" }` construction:
// same-file constructor precedence has `checkObjectExpr` consult the object-
// form schema set FIRST (`refs.schemas`), so the fields-bearing schema is
// brace-constructible and wins the constructor question, the enum never
// reached. The load pass must mirror that precedence — a specifier whose
// direct decl carries a fields-bearing schema is CONSTRUCTIBLE and is not
// recorded in `importedNonCtorKinds` (bug 0429's field-set walk owns it), so
// `checkImportedNonCtorTypeNames` draws nothing on the valid construction.
// ===========================================================================

describe("bug 0448 (K8) — a fields-bearing schema outranks a same-name enum (over-refusal guard)", () => {
  it("K8-samefile-control: `X { a: \"x\" }` against `schema X {a} enum X {A}` parses clean []", () => {
    const doc = parseApp(`${DUALKIND_DECL}\nlet v = X { a: "x" }\nv\n`);
    expect(
      doc.frontmatter,
      "anti-vacuity (K8): the frontmatter did not parse, so this diagnostic list measures nothing",
    ).not.toBeNull();
    // The same-file precedence control: the fields-bearing schema is
    // brace-constructible and wins, so the byte-identical imported spelling
    // owes silence, not a refusal.
    expect(
      doc.diagnostics.map((d) => d.code),
      `K8-samefile-control — the fields-bearing schema wins the same-file constructor question; this is the clean baseline the imported spelling owes.\n  ACTUAL: ${JSON.stringify(render(doc.diagnostics))}`,
    ).toEqual([]);
  });

  it("K8-dualkind-valid: `X { a: \"x\" }` against a dual-kind lib draws nothing and materialises `schema X`", async () => {
    const doc = parseApp(
      [`import { X } from "./lib.thetalib"`, 'let v = X { a: "x" }', "v", ""].join("\n"),
    );
    const result = await compose(doc, { [LIB_PATH]: DUALKIND_DECL });
    expectMaterialised(result, "schema X", "K8");
    // The F1 remedy: the fields-bearing schema outranks the same-name enum, so
    // `X` enters `importedSchemas` (constructible) and is NOT recorded as a
    // non-ctor kind. A valid construction against it draws nothing.
    expect(
      result.rendered,
      `K8-dualkind-valid — a fields-bearing schema of the same name outranks the enum; the valid construction must stay silent, not draw a lone false unresolved-named-type.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([]);
  });

  it("K8-dualkind-wrongfields: `X { junk: 1 }` draws bug 0429's field-set refusal, not unresolved-named-type", async () => {
    const doc = parseApp(
      [`import { X } from "./lib.thetalib"`, "let v = X { junk: 1 }", "v", ""].join("\n"),
    );
    const result = await compose(doc, { [LIB_PATH]: DUALKIND_DECL });
    expectMaterialised(result, "schema X", "K8");
    // The fields-bearing schema class still OWNS the site: a wrong field set
    // draws bug 0429's `extra-object-field`, proving the construction is judged
    // as an object schema, never mis-refused as a non-ctor kind.
    expect(
      unresolvedHits(result),
      `K8-dualkind-wrongfields — the schema class owns the site; a wrong field set is bug 0429's ground, never a non-ctor unresolved-named-type.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([]);
    expect(
      result.diagnostics.some((d) => d.code === "theta/parse/extra-object-field"),
      `K8-dualkind-wrongfields — the imported schema field-set walk (bug 0429) must refuse the extra field \`junk\`, proving the fields-bearing schema class owns the site.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toBe(true);
  });
});
