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

// Bug 0430 — an unknown variant on an IMPORTED enum is refused at no static
// phase and aborts at runtime. The same-file spelling `enum Sev { Low }` +
// `Sev.Nope` draws `error theta/parse/unknown-variant: unknown variant 'Nope'
// on enum 'Sev'` at parse (the body walk's `member` arm,
// src/parser/theta-document.ts:9400, whose `refs.enums.get` at :9405 answers
// from `hoistEnumVariants` (:7894, hoisted at :8262) and pushes
// `checkVariantAccess`, src/parser/schema-declarations.ts:315). The
// byte-identical reference against the SAME declaration IMPORTED from a
// `.thetalib` is judged by nothing: parse defers on the imported name (the
// FS-free parser's `refs.enums` holds same-file enums only, so the arm skips),
// and the load pass — which resolves and parses the lib and materialises the
// full variant set (`materializeSymbol`'s enum arm carries `variants`,
// src/extension/import-static-checks.ts:278) — walks only imported `fn` CALL
// sites (`checkImportedFnCallArgs` wiring at src/extension/import-static-checks.ts:1155),
// never member-access sites. At runtime the executor's enum short-circuit
// misses, evaluates `Sev` itself as a value, gets `null` from the pure
// evaluator's safety net, and panics `NullMemberAccessPanic: null member
// access: .Nope` (src/runtime/runtime-panics.ts:359) — aborting the drive with
// a message naming a null target that is not null, never naming the actual
// fault, the variant (docs/bugs/0430-imported-enum-unknown-variant-panics-null-member.md).
//
// SETTLED §Fix — Option 1 (LOAD-PASS member-access walk): in
// `checkThetaImports`, walk the importing body's member expressions whose
// target is an imported-ENUM binding (unshadowed — mirror
// `checkImportedFnCallArgs`'s `shadowedNames` arm, src/extension/invoke-static-checks.ts:1371)
// and emit the EXISTING `theta/parse/unknown-variant` against the materialised
// variant set, sited on the theta, `<enum>`/`<variant>` byte-identical to the
// same-file control. The theta does NOT register (error → the runtime panic is
// never reached), so this witness asserts on `check.diagnostics`, NOT the
// runtime panic (the runtime belt Option 2 is out of THIS witness's scope). A
// re-export-chain enum keeps the fn route's DIRECT-DECLARATION-ONLY fence
// (deferred), mirroring bug 0138's `ImportedFnCallee` restriction
// (src/extension/invoke-static-checks.ts:1296).
//
// TIER — unit, offline, deterministic, provider-free. Every cell settles inside
// one `parseThetaDocument` (through the house driver `parseDoc`,
// tests/helpers/e2e-s1.ts) or one shipped `checkThetaImports` over an in-memory
// `FileSystem` double exposing the `readdir` / `readBytes` members the load pass
// reads (the shape tests/b0429-imported-schema-ctor-field-set.test.ts and
// tests/b0306-imported-enum-wire-values.test.ts establish). The adjudicated host
// IS `checkThetaImports`, so this tier drives the production seam directly; an
// integration tier would add a discovery round trip to a decision the load pass
// has already made and could not assert an absence more sharply, and a live tier
// would add a provider to an observable no model participates in — no model reads
// an enum variant reference.
//
// NO SILENT SKIPPING (CLAUDE.md): nothing here early-returns or branches on the
// environment. A missing registry row, a frontmatter that did not parse, and a
// library that did not materialise each FAIL LOUDLY naming the unmet
// precondition, so no absence assertion is measured vacuously.

// ===========================================================================
// The EXISTING code the fix reuses (no code is minted — §Fix Option 1, per
// 0185's binding code-identity adjudication: declared-enum head + undeclared
// tail is `theta/parse/unknown-variant`).
// ===========================================================================

/** An `Enum.Variant` reference whose `Variant` the enum does not declare. */
const UNKNOWN_VARIANT = "theta/parse/unknown-variant";

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

/** `code`'s normative *Message* template with `<variant>`/`<enum>` filled. */
function msg(code: string, variant: string, enumName: string): string {
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
    ["<variant>", variant],
    ["<enum>", enumName],
  ] as const) {
    expect(
      out,
      `PRECONDITION (DIAG-4): the ${code} *Message* template must carry ${placeholder}; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}

/** `unknown variant '<variant>' on enum '<enum>'`. */
const variantMsg = (variant: string, enumName: string): string => msg(UNKNOWN_VARIANT, variant, enumName);

// ===========================================================================
// Fixtures. The library and same-file declaration are byte-identical so the
// imported answer the fix owes is byte-identical to the same-file control's.
// ===========================================================================

const APP_PATH = "/proj/app.theta";
const LIB_PATH = "/proj/lib.thetalib";
const MID_PATH = "/proj/mid.thetalib";

/** The importing `.theta`'s frontmatter; body starts on source line 5. */
const FM = ["---", 'model: "sonnet"', "mode: prompt", "---", ""].join("\n");

/** The declaring enum, identical whether same-file or in the lib. */
const ENUM = "enum Sev { Low }";

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
 * The anti-vacuity precondition every imported cell runs: the enum MATERIALISED
 * — proof the `.thetalib` path resolved, the library parsed, and its
 * declaration was found, i.e. the fixture reached the point where the resolved
 * library body (and its variant set) is in hand, exactly where the load-pass
 * member-access walk would run. Without it an absence assertion could be
 * measuring an unresolvable import.
 */
function expectMaterialised(result: ComposeResult, expected: string, cell: string): void {
  expect(
    result.materialised,
    `PRECONDITION (${cell}): the load pass must materialise \`${expected}\`; that is the proof the library resolved, parsed and exported the enum with its variant set, so the member-access walk was genuinely reachable. Diagnostics: ${JSON.stringify(result.rendered)}`,
  ).toContain(expected);
}

/** The unknown-variant hits present in `result`, rendered, in emission order. */
function variantHits(result: ComposeResult): string[] {
  return result.diagnostics
    .filter((d) => d.code === UNKNOWN_VARIANT)
    .map((d) => `${d.severity} ${d.code} ${d.file === undefined ? "-" : d.file}: ${d.message}`);
}

// ===========================================================================
// B1 — same-file control. GREEN today. Pins the exact code + message the
// imported case (B2) owes: the `<enum>` spelling is `Sev`, the unknown variant
// is `Nope`. The same-file `member` arm holds the variant set from
// `hoistEnumVariants`, so this refusal fires at PARSE.
// ===========================================================================

describe("bug 0430 (B1) — the same-file unknown-variant reference is refused at parse", () => {
  it("B1-samefile-control: `Sev.Nope` against a same-file `enum Sev { Low }` draws unknown-variant", () => {
    const doc = parseApp(`${ENUM}\nlet x = Sev.Nope\nx\n`);
    expect(
      doc.frontmatter,
      "anti-vacuity (B1): the frontmatter did not parse, so this diagnostic list measures nothing",
    ).not.toBeNull();
    const rendered = doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
    // The ABSOLUTE PIN the imported case must reach — same declaration, same
    // reference, same code and message. schemas.md:97: "Unknown-variant
    // references … are `theta/parse/unknown-variant`."
    expect(
      rendered,
      `B1-samefile-control — the same-file spelling is refused at parse; this is the exact code and message the imported spelling owes.\n  ACTUAL: ${JSON.stringify(rendered)}`,
    ).toEqual([`error ${UNKNOWN_VARIANT}: ${variantMsg("Nope", "Sev")}`]);
  });
});

// ===========================================================================
// B2 — imported. RED today (the load pass returns `[]`). The fix must draw the
// unknown-variant row sited on the importing theta, byte-identical to B1's
// message. Do NOT execute the body: post-fix the theta does not register (the
// `E` denies registration and the runtime panic is never reached), so the
// assertion is on `check.diagnostics`, not the runtime.
// ===========================================================================

describe("bug 0430 (B2) — the imported unknown-variant reference owes the same refusal", () => {
  it("B2-imported: `Sev.Nope` against an imported `enum Sev { Low }` draws unknown-variant on the theta", async () => {
    const doc = parseApp(
      [`import { Sev } from "./lib.thetalib"`, "let x = Sev.Nope", "x", ""].join("\n"),
    );
    // Parse defers on the imported name by design (FS-free parser holds no
    // library variant set), so the app's own parse must be clean — the
    // unknown-variant verdict is the LOAD pass's to draw, not the parser's. A
    // parse-tier emission here would mean a different defect.
    expect(
      doc.diagnostics.map((d) => d.code),
      `B2-imported — the FS-free parser cannot see the lib's variant set, so parse must stay silent on the imported reference. ACTUAL: ${JSON.stringify(render(doc.diagnostics))}`,
    ).toEqual([]);
    const result = await compose(doc, { [LIB_PATH]: ENUM });
    expectMaterialised(result, "enum Sev", "B2");
    // RED at HEAD: `checkThetaImports` has no member-access walk, so this list is
    // empty and `Sev.Nope` loads clean, then at runtime the executor's enum
    // short-circuit misses and the fall-through fabricates a null target — the
    // pre-fix runtime observable is `NullMemberAccessPanic: null member access:
    // .Nope` (src/runtime/runtime-panics.ts:359), a panic whose subject is wrong
    // twice (the enum is not null; the fault is the variant). That panic is WHY
    // the static refusal matters, but it is NOT this witness's assertion — the
    // fix is the static LOAD refusal, so the fix must add exactly the one row B1
    // pins, sited on the importing theta with `<enum>` = `Sev`.
    expect(
      variantHits(result),
      `B2-imported — the imported reference owes the byte-identical refusal B1 draws, sited on ${APP_PATH}.\n  At HEAD the load pass has no member-access walk, so this list is empty and the unknown-variant reference loads clean (runtime-panics at .Nope).\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([`error ${UNKNOWN_VARIANT} ${APP_PATH}: ${variantMsg("Nope", "Sev")}`]);
  });
});

// ===========================================================================
// B3 — valid imported variant. GREEN before AND after (guards against
// over-refusal): a valid variant reference against the imported enum must draw
// nothing and the enum must still materialise. This is the class fence — the
// defect is exactly the UNKNOWN variant, not imported enums generally (bug
// 0306's witness pins that `Sev.Low` evaluates normally).
// ===========================================================================

describe("bug 0430 (B3) — a valid imported variant reference is not refused", () => {
  it("B3-valid-imported: `Sev.Low` draws nothing and the enum materialises", async () => {
    const doc = parseApp(
      [`import { Sev } from "./lib.thetalib"`, "let x = Sev.Low", "x", ""].join("\n"),
    );
    const result = await compose(doc, { [LIB_PATH]: ENUM });
    expectMaterialised(result, "enum Sev", "B3");
    // The passing control that proves B2's emission is the UNKNOWN VARIANT and
    // not the member-access shape itself; a fix that refused this over-reaches.
    expect(
      result.rendered,
      `B3-valid-imported — a reference to a DECLARED variant of the imported enum must stay silent.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// B4 — shadowing defer. SCOPE FENCE, not a red witness: green both before and
// after the fix. A LOCAL binding named `Sev` (`let Sev = 1`) outranks the
// import (expressions.md §"Identifier resolution": arm (1) local binding shadows
// arm (3) import), so the `Sev.Nope` member access does NOT denote the imported
// enum and the load-pass walk must DEFER, mirroring `checkImportedFnCallArgs`'s
// `shadowedNames` arm (src/extension/invoke-static-checks.ts:1371).
//
// SHADOW SHAPE: `let Sev = 1` — a `let` binding of the imported name, NOT a
// local `enum Sev`. A local `enum Sev` alongside `import { Sev }` would draw
// `theta/parse/import-name-collision`, muddying the "no unknown-variant"
// assertion. A `let` collides with nothing at parse (the collision code is
// scoped to top-level declarations, not `let`s) yet still shadows lexically. It
// DOES draw two unrelated PARSE-tier rows — `binding-case-mismatch` (a
// capitalised `let` name) and `unknown-method` (`.Nope` read as a method call on
// a number) — which is why this cell filters `check.diagnostics` to the
// unknown-variant code only rather than scoring the whole list; the fence is
// that the LOAD-pass walk draws no unknown-variant, at either tree state.
// ===========================================================================

describe("bug 0430 (B4) — a locally-shadowed enum name defers (scope fence)", () => {
  it("B4-shadow-defer: a local `let Sev` outranks the import, so the load pass draws no unknown-variant", async () => {
    const doc = parseApp(
      [
        `import { Sev } from "./lib.thetalib"`,
        "let Sev = 1",
        "let x = Sev.Nope",
        "x",
        "",
      ].join("\n"),
    );
    const result = await compose(doc, { [LIB_PATH]: ENUM });
    // The enum still materialises (the import statement is present); the fence is
    // that the WALK defers because the member target denotes the local binding.
    expectMaterialised(result, "enum Sev", "B4");
    expect(
      variantHits(result),
      `B4-shadow-defer — arm (1) local binding outranks arm (3) import, so the member target does not name the imported enum; the load-pass walk must defer exactly as \`checkImportedFnCallArgs\`'s \`shadowedNames\` arm does.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// B5 — re-export-chain fence. SCOPE FENCE, not a red witness: green both before
// and after the fix. The app reaches `Sev` through `mid.thetalib` re-exporting
// from `lib.thetalib`. The fix keeps the fn route's DIRECT-DECLARATION-ONLY
// fence (bug 0138's `ImportedFnCallee` restriction,
// src/extension/invoke-static-checks.ts:1296): an enum reached only through a
// re-export chain is not a DIRECT top-level declaration in the directly-resolved
// library, so the walk WITHHOLDS the unknown-variant verdict — a deliberate
// withhold that documents §Fix face-2 residual (a static walk fenced to
// directly-declared imports leaves the runtime fall-through reachable for this
// chain-reached class; the runtime belt Option 2 is the complementary answer,
// out of THIS witness's scope). Matches bug 0138 / bug 0429's re-export fence.
// ===========================================================================

describe("bug 0430 (B5) — a re-export-chain-reached enum defers (scope fence)", () => {
  it("B5-reexport-fence: an unknown variant on a re-export-chain enum draws no unknown-variant", async () => {
    const doc = parseApp(
      [`import { Sev } from "./mid.thetalib"`, "let x = Sev.Nope", "x", ""].join("\n"),
    );
    const result = await compose(doc, {
      [MID_PATH]: 'export { Sev } from "./lib.thetalib"\n',
      [LIB_PATH]: ENUM,
    });
    // The chain still materialises `Sev` (proof the fixture reached the load
    // pass), but the member-access walk resolves the SOURCE name in the DIRECTLY
    // resolved library only, so a chain-reached enum withholds.
    expectMaterialised(result, "enum Sev", "B5");
    expect(
      variantHits(result),
      `B5-reexport-fence — the direct-declaration-only fence (mirroring bug 0138's ImportedFnCallee restriction): a re-export-chain enum is not directly declared in the resolved library, so the walk withholds. This documents the fence as a deliberate withhold (face-2 residual), not an oversight.\n  ACTUAL: ${JSON.stringify(result.rendered)}`,
    ).toEqual([]);
  });
});
