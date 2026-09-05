import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import { checkThetaImports } from "../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { FileSystem } from "../src/seams/file-system";
import { parseDeps } from "./helpers/e2e-s1";

// Witness tests for bug 0450
// (docs/bugs/0450-imported-enum-system-param-unjudged.md).
//
// A `system:` `${…}` path that steps into an IMPORTED-enum-typed param
// (`params: sev: Sev`, `system: "Level ${sev.Nope}"`) is judged at NO static
// phase. The path grammar's MUST is unqualified: any `.Ident` step off an
// enum-typed param violates `frontmatter-fields-b-and-templates.md:42` ("each
// subsequent `.Ident` must name a reachable field of an *object* schema") —
// an enum is not an object schema, so it terminates the path. The SAME-FILE
// spelling draws `theta/parse/system-interp-bad-field` at parse (the non-object
// arm in system-interpolation.ts's walk refuses the enum head). The IMPORTED
// spelling cannot be judged at parse — the FS-free parser classifies every
// imported param `opaque-object` (bug 0406 Rec A) and admits every step
// opaquely — AND is skipped by the bug 0422 load re-walk, whose head lookup
// keys on `importedSchemaShapes` (populated from `stmt.kind === "schema"`
// lookups alone; an `EnumDecl` never enters it) and whose loop-entry guard is
// `importedSchemaShapes.size > 0`. Net: `${sev.Nope}` — and deep chains
// `${sev.a.b.c}`, and even a REAL variant name `${sev.Low}` — load CLEAN
// against an imported `enum Sev { Low }`, where the byte-identical frontmatter
// with the enum moved same-file refuses at parse.
//
// SETTLED §Fix Option 1 (this witness's target): add an explicit enum-head arm
// to the 0422 load re-walk keyed on `importedEnums` (direct-declaration variant
// lists), refusing the FIRST `.Ident` step with the ALREADY-MINTED
// `theta/load/system-interp-bad-field` — byte-consistent with the same-file
// parse-arm E1 semantics, and direct-declarations only (chain withhold stated,
// mirroring the schema class). The loop-entry guard must also enter when
// `importedEnums.size > 0`.
//
// The E2* cases assert the specified POST-FIX behaviour (the owed load refusal)
// and are RED against the current tree for the RIGHT reason: parse `[]` AND
// load `[]` today, where the fix owes `theta/load/system-interp-bad-field`. The
// E1/E3/E4/E5 controls assert behaviour the fix must preserve and are GREEN
// before and after.
//
// TIER — unit, offline, deterministic, provider-free. The whole contract
// settles inside one `parseThetaDocument` over a string (E1's parse refusal)
// plus one `checkThetaImports` over an in-memory `FileSystem` double holding a
// real `.thetalib` fixture (E2*/E3/E4/E5's load pass) — the exact seam bug 0422
// and bug 0430 landed their imported-symbol judgements in. An integration tier
// would re-drive discovery to reach a decision the load pass has already made;
// a live tier would add a provider/child to a static-phase decision no model
// participates in.
//
// NO SILENT SKIPPING: the fake `readBytes`/`readdir` REJECT any unregistered
// path; every load cell asserts the imported symbol materialised as a
// precondition (so an import-resolution regression reds as an unmet
// precondition, not as this defect); E1 asserts its frontmatter parsed; and no
// cell early-returns. The owed message text is READ from the closed registry
// (DIAG-4), never hand-copied.

/** The load-phase code the fix reuses (bug 0422's minted sibling, no new code). */
const LOAD_BAD_FIELD_CODE = "theta/load/system-interp-bad-field";
/** The same-file parse-phase code whose message text the load code is byte-consistent with. */
const PARSE_BAD_FIELD_CODE = "theta/parse/system-interp-bad-field";

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live sharded registry — the parse + load pages this file oracles against. */
const REGISTRY = parseRegistry(
  ["code-registry-parse.md", "code-registry-load.md"]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

/**
 * A registry row's normative *Message* template (DIAG-4), read rather than
 * restated. FAILS LOUDLY naming the sharded pages when the row is absent, so
 * registry drift can never degrade an assertion into a comparison against
 * `undefined`.
 */
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `PRECONDITION (DIAG-4): the sharded registry must carry a Message cell for ${code} — it is this file's oracle for the owed refusal message, so an absent cell is an unmet precondition, not a skip`,
  ).toBeDefined();
  return template as string;
}

/**
 * The `system-interp-bad-field` message for one step `.field` off one `path`.
 * Both the parse and load rows share this template
 * (`'system:' interpolation '.<field>' does not name a reachable object field
 * on <path>`), so the load-owed text is byte-consistent with E1's parse refusal
 * by construction. Replacements are functions so a `$` in either name can never
 * read as a `String.replace` substitution pattern.
 */
function badFieldMessage(field: string, path: string): string {
  return registryMessageOf(LOAD_BAD_FIELD_CODE)
    .replace("<field>", () => field)
    .replace("<path>", () => path);
}

const LIB_PATH = "/proj/lib.thetalib";
const MID_PATH = "/proj/mid.thetalib";

/** The directly-declared imported enum — the class 0422's re-walk skips. */
const ENUM_LIB = "enum Sev { Low }\n";
/** A directly-declared imported schema — the class 0422's re-walk DOES judge (E3). */
const SCHEMA_LIB = ["schema Author {", "  name: string,", "}", ""].join("\n");
/** The re-export chain (E5): `Sev` reached only through mid.thetalib's re-export. */
const MID_REEXPORT = 'export { Sev } from "./lib.thetalib"\n';

/**
 * The same-file spelling (E1): the enum moved INTO the theta. `enum Sev { Low }`
 * in the body makes `toSystemParamType` classify `sev` `{ kind: "enum" }`, and
 * the parse walk's non-object arm refuses any `.Ident` step off it.
 */
function sameFileSource(systemTemplate: string): string {
  return [
    "---",
    'model: "sonnet"',
    "mode: subagent",
    "params:",
    "  sev: Sev",
    `system: '${systemTemplate}'`,
    "---",
    "enum Sev { Low }",
    "1",
    "",
  ].join("\n");
}

/** The importing subagent theta, parameterised over param name, type, import source, and template. */
function importedSource(opts: {
  readonly paramName: string;
  readonly typeName: string;
  readonly from: string;
  readonly system: string;
}): string {
  return [
    "---",
    'model: "sonnet"',
    "mode: subagent",
    "params:",
    `  ${opts.paramName}: ${opts.typeName}`,
    `system: '${opts.system}'`,
    "---",
    `import { ${opts.typeName} } from "${opts.from}"`,
    "let x = 1",
    "",
  ].join("\n");
}

/**
 * An in-memory `FileSystem` serving only the registered `.thetalib` fixtures —
 * every other member REJECTS, so a resolution that reads off-fixture reds
 * loudly rather than resolving an empty buffer (the b0303/b0422 `fakeThetaLibFs`).
 */
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
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}

function parseApp(source: string): ThetaDocument {
  return parseThetaDocument(
    { path: "/proj/app.theta", bytes: new TextEncoder().encode(source) },
    parseDeps(),
  );
}

/** One measured static row: the combined parse + import-check diagnostics and the materialised imports. */
interface StaticRow {
  readonly parseCodes: readonly string[];
  readonly loadCodes: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly materialised: readonly string[];
  readonly frontmatterPresent: boolean;
  readonly systemPresent: boolean;
}

/**
 * Drive the real static pipeline for one `system:` template: parse
 * `/proj/app.theta`, then (when it has imports) run `checkThetaImports` over the
 * fixture `.thetalib`. The imported-enum refusal the fix owes is a phase=load
 * diagnostic, so the observable splits into the PARSE codes (the same-file E1
 * refusal) and the LOAD codes (the import-check pass) — kept separate so a cell
 * can assert "empty parse AND empty load" as the current-state RED evidence.
 */
async function measure(source: string, files: Record<string, string>): Promise<StaticRow> {
  const app = parseApp(source);
  const parseErrors = app.diagnostics.filter((d) => d.severity === "error");
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter: app.frontmatter as ParsedFrontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(files),
    parseDeps: parseDeps(),
  });
  const loadErrors = check.diagnostics.filter((d) => d.severity === "error");
  return {
    parseCodes: parseErrors.map((d) => d.code),
    loadCodes: loadErrors.map((d) => d.code),
    diagnostics: [...app.diagnostics, ...check.diagnostics],
    materialised: check.imports.map((m) => `${m.kind} ${m.name}`),
    frontmatterPresent: app.frontmatter !== undefined,
    systemPresent: app.frontmatter?.system !== undefined,
  };
}

/** The imported cell shares this precondition: the imported symbol resolves and materialises. */
function expectMaterialised(row: StaticRow, symbol: string, label: string): void {
  expect(
    row.materialised,
    `${label}: the imported symbol must resolve and materialise or the load pass sees nothing to judge against`,
  ).toContain(symbol);
}

describe("bug 0450 — imported-enum `system:` param path is judged at no static phase", () => {
  // E1 — SAME-FILE CONTROL (GREEN now and after). The enum moved into the theta
  // is visible to the parser, so any `.Ident` step off it (`.Nope`) draws the
  // PARSE refusal and the theta does not register. This cell also PINS the
  // byte-consistency target: E2's owed LOAD message must equal the message E1
  // actually draws at parse (same registry template, different phase prefix).
  it("E1 CONTROL: same-file `enum Sev { Low }` + `${sev.Nope}` refuses at parse (`.Nope` on `sev`)", async () => {
    const row = await measure(sameFileSource("Level ${sev.Nope}"), {});
    // The parse walk `return undefined`s the template ON refusal, so its own
    // presence cannot be the precondition here (that IS what E1 measures). The
    // loud precondition is that the frontmatter block parsed at all.
    expect(
      row.frontmatterPresent,
      "E1 precondition: the frontmatter block must parse for the walk to run over it",
    ).toBe(true);
    expect(
      row.parseCodes,
      "any `.Ident` step off a same-file enum param terminates the path (frontmatter-fields-b-and-templates.md:42)",
    ).toContain(PARSE_BAD_FIELD_CODE);
    const parseDiag = row.diagnostics.find((d) => d.code === PARSE_BAD_FIELD_CODE);
    expect(
      parseDiag?.message,
      "E1's parse refusal is the byte-consistency target for E2's owed LOAD message",
    ).toBe(badFieldMessage("Nope", "sev"));
  });

  // E2 — IMPORTED (RED now, GREEN after). `${sev.Nope}` against an imported
  // `enum Sev { Low }`. RED for the RIGHT reason: parse `[]` (opaque-object
  // admit, bug 0406) AND load `[]` (the 0422 re-walk skips the enum class),
  // where the fix owes the LOAD refusal naming `.Nope` on `sev` —
  // byte-consistent with E1.
  it("E2 RED: imported `${sev.Nope}` owes a LOAD refusal (`.Nope` on `sev`), byte-consistent with E1", async () => {
    const row = await measure(
      importedSource({ paramName: "sev", typeName: "Sev", from: "./lib.thetalib", system: "Level ${sev.Nope}" }),
      { [LIB_PATH]: ENUM_LIB },
    );
    expectMaterialised(row, "enum Sev", "E2");
    // Current-state RED evidence: the class loads clean at BOTH static phases.
    expect(
      row.systemPresent,
      "E2: the `system:` template must survive parse (admitted opaquely, bug 0406 Rec A) for the load pass to be the only remaining judge",
    ).toBe(true);
    expect(
      row.parseCodes,
      "E2 parse admits opaquely (bug 0406 Rec A) — no parse refusal is owed or observed",
    ).not.toContain(PARSE_BAD_FIELD_CODE);
    // The owed behaviour: the load re-walk must refuse the first step.
    expect(
      row.loadCodes,
      "an imported enum param's `.Ident` step must draw the load-phase `system-interp-bad-field` (§Fix Option 1)",
    ).toContain(LOAD_BAD_FIELD_CODE);
    const loadDiag = row.diagnostics.find((d) => d.code === LOAD_BAD_FIELD_CODE);
    expect(
      loadDiag?.message,
      "the load refusal must name `.Nope` on `sev`, byte-consistent with the same-file parse refusal (E1)",
    ).toBe(badFieldMessage("Nope", "sev"));
  });

  // E2b — IMPORTED DEEP CHAIN (RED now, GREEN after). `${sev.a.b.c}` owes a
  // refusal at the FIRST step (`.a` on `sev`) — the enum terminates the path,
  // so the chain never reaches `.b`/`.c`. Identical silence today.
  it("E2b RED: imported deep chain `${sev.a.b.c}` owes a LOAD refusal at the first step (`.a` on `sev`)", async () => {
    const row = await measure(
      importedSource({ paramName: "sev", typeName: "Sev", from: "./lib.thetalib", system: "Level ${sev.a.b.c}" }),
      { [LIB_PATH]: ENUM_LIB },
    );
    expectMaterialised(row, "enum Sev", "E2b");
    expect(
      row.parseCodes,
      "E2b parse admits the whole chain opaquely — no parse refusal observed",
    ).not.toContain(PARSE_BAD_FIELD_CODE);
    expect(
      row.loadCodes,
      "a deep chain off an imported enum param must refuse at the FIRST step at load",
    ).toContain(LOAD_BAD_FIELD_CODE);
    const loadDiag = row.diagnostics.find((d) => d.code === LOAD_BAD_FIELD_CODE);
    expect(
      loadDiag?.message,
      "the refusal must name the FIRST step `.a` on `sev` (the enum terminates the path)",
    ).toBe(badFieldMessage("a", "sev"));
  });

  // E2c — IMPORTED, REAL VARIANT NAME (RED now, GREEN after). `${sev.Low}` names
  // a REAL variant of `enum Sev { Low }`, but a variant name is not an object
  // field — an enum terminates the path, so even a valid variant name refuses.
  // E1's same-file reading confirms the enum kind takes the non-object arm.
  // This proves the fix refuses ANY `.Ident` step on the enum param, not just
  // unknown names.
  it("E2c RED: imported `${sev.Low}` (a REAL variant name) still owes a LOAD refusal (`.Low` on `sev`)", async () => {
    const row = await measure(
      importedSource({ paramName: "sev", typeName: "Sev", from: "./lib.thetalib", system: "Level ${sev.Low}" }),
      { [LIB_PATH]: ENUM_LIB },
    );
    expectMaterialised(row, "enum Sev", "E2c");
    expect(
      row.parseCodes,
      "E2c parse admits opaquely — no parse refusal observed",
    ).not.toContain(PARSE_BAD_FIELD_CODE);
    expect(
      row.loadCodes,
      "even a real variant name is a `.Ident` step off an enum param and must refuse at load",
    ).toContain(LOAD_BAD_FIELD_CODE);
    const loadDiag = row.diagnostics.find((d) => d.code === LOAD_BAD_FIELD_CODE);
    expect(
      loadDiag?.message,
      "the refusal must name `.Low` on `sev` — enums terminate the path, valid variant names included",
    ).toBe(badFieldMessage("Low", "sev"));
  });

  // E3 — SCHEMA-CLASS ASYMMETRY CONTROL (GREEN before AND after). The 0422
  // route already fires for the schema class: `${a.typo}` against an imported
  // `schema Author { name: string }` draws the LOAD refusal. This proves the
  // load route runs one map-lookup away from where the enum class is skipped —
  // it must stay green through the fix.
  it("E3 CONTROL: imported schema `${a.typo}` already draws the LOAD refusal (`.typo` on `a`)", async () => {
    const row = await measure(
      importedSource({ paramName: "a", typeName: "Author", from: "./lib.thetalib", system: "X ${a.typo}" }),
      { [LIB_PATH]: SCHEMA_LIB },
    );
    expectMaterialised(row, "schema Author", "E3");
    expect(
      row.loadCodes,
      "an imported schema's walked-off field already refuses at load (bug 0422) — the route runs one lookup from the enum class",
    ).toContain(LOAD_BAD_FIELD_CODE);
    const loadDiag = row.diagnostics.find((d) => d.code === LOAD_BAD_FIELD_CODE);
    expect(loadDiag?.message, "E3 names `.typo` on `a`").toBe(badFieldMessage("typo", "a"));
  });

  // E4 — BARE-PARAM OVER-REFUSAL GUARD (GREEN before AND after). A bare
  // `${sev}` (no `.Ident` step) is "always allowed" for every declared param
  // (frontmatter-fields-b-and-templates.md:42, §Non-goal). The fix judges only
  // `.Ident` steps, so a bare enum param must draw NOTHING at either phase.
  it("E4 CONTROL: imported bare `${sev}` draws nothing (bare `${param}` is always allowed)", async () => {
    const row = await measure(
      importedSource({ paramName: "sev", typeName: "Sev", from: "./lib.thetalib", system: "Level ${sev}" }),
      { [LIB_PATH]: ENUM_LIB },
    );
    expectMaterialised(row, "enum Sev", "E4");
    expect(row.parseCodes, "a bare enum param draws no parse refusal").not.toContain(
      PARSE_BAD_FIELD_CODE,
    );
    expect(row.loadCodes, "a bare enum param must draw no load refusal — bare `${param}` is always allowed").toEqual(
      [],
    );
  });

  // E5 — RE-EXPORT-CHAIN FENCE (GREEN before AND after). `Sev` reached only
  // through mid.thetalib's `export … from` re-export builds no direct-declaration
  // entry, so `${sev.Nope}` is WITHHELD at load — direct-declarations only,
  // mirroring bug 0422's / bug 0430's chain withhold. The chain still
  // materialises `Sev` (proof the fixture reached the load pass).
  it("E5 CONTROL: re-export-chain `${sev.Nope}` is withheld at load (direct-declaration-only fence)", async () => {
    const row = await measure(
      importedSource({ paramName: "sev", typeName: "Sev", from: "./mid.thetalib", system: "Level ${sev.Nope}" }),
      { [MID_PATH]: MID_REEXPORT, [LIB_PATH]: ENUM_LIB },
    );
    expectMaterialised(row, "enum Sev", "E5");
    expect(
      row.loadCodes,
      "a re-export-chain enum is not directly declared in the resolved lib — the walk withholds (chain withhold, §Non-goal)",
    ).not.toContain(LOAD_BAD_FIELD_CODE);
    expect(row.loadCodes, "the re-export-chain cell registers clean at load").toEqual([]);
  });
});
