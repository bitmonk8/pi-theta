import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { checkThetaImports } from "../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import type { FileSystem } from "../src/seams/file-system";
import { parseDeps } from "./helpers/e2e-s1";

// Bug 0333 — a broken `export … from` edge inside a `.thetalib` reached ONLY
// through transitive plain-`import` hops is discarded at load with zero
// diagnostics, while the byte-identical fault in a directly-imported lib IS
// reported. Two codes are withheld on the transitive edge:
//   - `theta/load/unresolvable-thetalib-path` (missing source file), and
//   - `theta/parse/import-unknown-symbol`   (source name the lib never declares).
//
// WHY the fault is real, not merely unreached: the transitive lib IS resolved,
// read and parsed by the same load pass (`walkThetaLib` reaches it and it sits
// in `parseCache`); the `export … from` edge is computed-reachable and then
// never reported. The defect is transitive-only — at depth 1 both shapes are
// reported (each cell's DIRECT CONTROL proves it below).
//
// SPEC ANCHORS (the contract, re-derived against this tree; not the current code):
//   - docs/spec_topics/imports.md:23 (IMP-1) — a resolver throw "emits the
//     load-time diagnostic `theta/load/unresolvable-thetalib-path` … against
//     the importing file, and does not register that file", with no depth
//     qualifier. In T1's bug row the re-exporting transitive lib is the
//     importing file.
//   - docs/spec_topics/imports.md:115 — an unknown-symbol error is "collected
//     alongside every other parse / type error from the importing file and its
//     transitive `.thetalib` imports, and all are reported in one batch", and
//     an `export { Foo } from` specifier's check is reported against the
//     RE-EXPORTING `.thetalib` file. T2's transitive lib is exactly such a file.
//   - docs/spec_topics/diagnostics/code-registry-load.md:44 — the
//     `theta/load/unresolvable-thetalib-path` Trigger names "An `import` /
//     `export … from` `.thetalib` spec", no depth qualifier.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:136 — the
//     `theta/parse/import-unknown-symbol` Trigger names "An `import { ... }` or
//     `export { ... } from` specifier", no depth qualifier. (The bug doc cites
//     :135; re-derived at this tree the row sits at :136.)
//
// THE INVARIANT THIS FILE ENCODES: the transitive `export … from` edge draws
// exactly the diagnostic its depth-1 DIRECT control draws. Each of T1/T2
// measures its control in the same test and pins the control's ABSOLUTE value
// FIRST, then asserts the row delivers the same fault — mirroring the
// `expectDeliversLikeControl` philosophy of tests/reexport-chain-resolution.test.ts
// (a control asserted broken cannot vacuously satisfy an equality). The oracle
// stays on the spec sentence (the two codes carry no depth qualifier) rather
// than on a guessed post-fix string.
//
// TIER: **unit**, offline, deterministic, provider-free. Every claim settles
// inside one `parseThetaDocument` over a string plus one real `checkThetaImports`
// over an in-memory `FileSystem` double (the tests/reexport-chain-resolution.test.ts
// harness shape). No model, no session, no discovery round trip participates in
// a decision the load pass has already made, so an integration or live tier
// would add a provider to a computation none of them touch.
//
// RED AT HEAD 4181047c / v0.301.0: T1/T2/depth-2 each emit `[]` (silent —
// the bug); the well-formed transitive control already emits `[]`. The
// seed-widening fix turns T1 → unresolvable, T2 → unknown-symbol, depth-2 →
// unresolvable green at the fixing version 0.302.0, and the well-formed control
// stays `[]` throughout.

// ===========================================================================
// The registered codes and their normative messages (DIAG-4).
// ===========================================================================

/** IMP-1's code — withheld on the transitive missing-file edge (bug row T1). */
const UNRESOLVABLE_CODE = "theta/load/unresolvable-thetalib-path";

/** The unknown-symbol code — withheld on the transitive absent-name edge (bug row T2). */
const UNKNOWN_SYMBOL_CODE = "theta/parse/import-unknown-symbol";

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/reexport-chain-resolution.test.ts renders
// DIAG-4 messages from.
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

/**
 * A registered code's normative *Message* template (DIAG-4), read from the
 * registry so no expected string in this file is written twice.
 *
 * An absent Message cell is an unmet precondition, so this FAILS LOUDLY naming
 * the code rather than returning `undefined` for a later comparison to red on
 * obscurely — DIAG-4 makes the Message column normative character-for-character.
 */
function normativeMessage(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `no Message cell for ${code} — DIAG-4 makes the Message column normative ` +
      `character-for-character, so an absent cell is an unmet precondition, not a skip`,
  ).toBeDefined();
  return template as string;
}

/** The IMP-1 message rendered for one spec path (DIAG-4). */
function unresolvableMessage(path: string): string {
  return normativeMessage(UNRESOLVABLE_CODE).replace("<path>", path);
}

/** The unknown-symbol message rendered for one source name and one spec path (DIAG-4). */
function unknownSymbolMessage(name: string, path: string): string {
  return normativeMessage(UNKNOWN_SYMBOL_CODE)
    .replace("<name>", name)
    .replace("<path>", path);
}

/** One rendered diagnostic line — the `severity code: message` shape the harness uses. */
function line(code: string, message: string): string {
  return `error ${code}: ${message}`;
}

// ===========================================================================
// Parse drivers, the in-memory `.thetalib` filesystem double, and the load pass
// (the tests/reexport-chain-resolution.test.ts harness shape).
// ===========================================================================

/** The importing `.theta` frontmatter every fixture shares. */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

function parseApp(body: string): ThetaDocument {
  return parseThetaDocument(
    { path: "/proj/app.theta", bytes: new TextEncoder().encode(`${APP_FRONTMATTER}\n${body}`) },
    parseDeps(),
  );
}

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

interface LoadResult {
  readonly appParseCodes: string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly diagLines: string[];
}

/**
 * Parse `/proj/app.theta` and run the real `checkThetaImports` over `libs`,
 * returning the load pass's diagnostics rendered as `severity code: message`.
 *
 * The importing theta's frontmatter is asserted to parse — if it did not the
 * load pass would read nothing and a later red would be a harness fault rather
 * than the missing diagnostic under witness.
 */
async function b0333LoadDiags(
  appBody: string,
  libs: Record<string, string>,
): Promise<LoadResult> {
  const app = parseApp(appBody);
  expect(
    app.frontmatter,
    `the importing theta's frontmatter must parse or the load pass reads nothing; diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const frontmatter = app.frontmatter as ParsedFrontmatter;
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  return {
    appParseCodes: app.diagnostics.map((d) => d.code),
    diagnostics: check.diagnostics,
    diagLines: check.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
  };
}

/** Every diagnostic's code, in emission order — the control-equality oracle for T2. */
function codesOf(result: LoadResult): string[] {
  return result.diagnostics.map((d) => d.code);
}

// ===========================================================================
// Fixtures. Declaration bodies are one member per line (docs/STYLE.md). Every
// `fn` mirrors the bug doc §Reproduction signature `fn n(x: integer): integer`.
// The importing theta's body is always `import { af } from "./a.thetalib"`.
// ===========================================================================

const APP_IMPORTS_A = 'import { af } from "./a.thetalib"\n';

/** `fn <name>(x: integer): integer { x }`, one member per line. */
function fnDecl(name: string): string {
  return [`fn ${name}(x: integer): integer {`, "  x", "}", ""].join("\n");
}

/** The missing source path both T1 rows name — identical bytes, so their diagnostics render identically. */
const MISSING = "./missing.thetalib";

// ===========================================================================
// T1 — a transitive lib re-exports from a MISSING file.
// Bug row: theta → a (plain `import bf`) → b, where `b` carries the broken
// `export { X } from "./missing.thetalib"`. Direct control: `a` itself carries
// the byte-identical broken re-export, which already reports.
// ===========================================================================

describe("bug 0333 (T1) — transitive re-export from a missing file draws IMP-1", () => {
  const EXPECTED = line(UNRESOLVABLE_CODE, unresolvableMessage(MISSING));

  it(`GREEN (T1-control): the DIRECT broken re-export from ${MISSING} already draws ${UNRESOLVABLE_CODE}`, async () => {
    // depth-1: `a` carries the broken `export … from` itself. This is the
    // absolute pin the equality below rests on — a control asserted broken
    // cannot let the equality pass vacuously.
    const control = await b0333LoadDiags(APP_IMPORTS_A, {
      "/proj/a.thetalib": `export { X } from "${MISSING}"\n${fnDecl("af")}`,
    });
    expect(control.appParseCodes, "the importing theta parses clean — the fault is in the lib").toEqual([]);
    expect(
      control.diagLines,
      `imports.md:23 (IMP-1): a directly-imported lib's re-export from an unresolvable ${MISSING} emits ${UNRESOLVABLE_CODE} against that lib`,
    ).toEqual([EXPECTED]);
  });

  it(`RED at HEAD (T1-transitive): a plain-import-reached lib's re-export from ${MISSING} draws the SAME ${UNRESOLVABLE_CODE}`, async () => {
    const control = await b0333LoadDiags(APP_IMPORTS_A, {
      "/proj/a.thetalib": `export { X } from "${MISSING}"\n${fnDecl("af")}`,
    });
    // control precondition: the direct case must report, or the equality is vacuous.
    expect(control.diagLines, "control precondition: the depth-1 broken re-export reports").toEqual([
      EXPECTED,
    ]);

    // theta → a (plain `import bf`) → b; the broken re-export lives in `b`,
    // reached only through the plain-import hop.
    const row = await b0333LoadDiags(APP_IMPORTS_A, {
      "/proj/a.thetalib": `import { bf } from "./b.thetalib"\n${fnDecl("af")}`,
      "/proj/b.thetalib": `export { X } from "${MISSING}"\n${fnDecl("bf")}`,
    });
    expect(row.appParseCodes, "the importing theta parses clean either way").toEqual([]);
    expect(
      row.diagLines,
      `imports.md:23 (IMP-1) carries no depth qualifier and code-registry-load.md:44's Trigger names the \`export … from\` spec: the transitive re-exporting lib is the importing file for the unresolvable ${MISSING} and must draw ${UNRESOLVABLE_CODE}. HEAD emits []. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toContain(EXPECTED);
    // Control-equality oracle: the missing path is byte-identical in both rows,
    // so the transitive edge delivers the direct edge's exact diagnostic line.
    expect(
      row.diagLines,
      "the transitive edge draws exactly what the byte-identical direct edge draws",
    ).toEqual(control.diagLines);
  });
});

// ===========================================================================
// T2 — a transitive lib re-exports an ABSENT name.
// Bug row: theta → a (plain `import bf`) → b, where `b` has
// `export { X } from "./c.thetalib"` and `c` declares only `other`. Direct
// control: `a` carries `export { X } from "./b.thetalib"` and `b` declares only
// `other`. The re-exporting lib's own `fromPath` necessarily differs between the
// two rows (`./c.thetalib` vs `./b.thetalib` — the transitive row needs an extra
// hop), so full-string equality is impossible; the control-equality oracle is
// therefore on the delivered CODE, with each message pinned absolutely.
// ===========================================================================

describe("bug 0333 (T2) — transitive re-export of an absent name draws import-unknown-symbol", () => {
  const EXPECTED_ROW = line(UNKNOWN_SYMBOL_CODE, unknownSymbolMessage("X", "./c.thetalib"));
  const EXPECTED_CONTROL = line(UNKNOWN_SYMBOL_CODE, unknownSymbolMessage("X", "./b.thetalib"));

  it(`GREEN (T2-control): the DIRECT re-export of an absent name already draws ${UNKNOWN_SYMBOL_CODE}`, async () => {
    // depth-1: `a` re-exports `X` from `b`, which declares only `other`.
    const control = await b0333LoadDiags(APP_IMPORTS_A, {
      "/proj/a.thetalib": `export { X } from "./b.thetalib"\n${fnDecl("af")}`,
      "/proj/b.thetalib": fnDecl("other"),
    });
    expect(control.appParseCodes, "the importing theta parses clean — the fault is in the lib").toEqual([]);
    expect(
      control.diagLines,
      "imports.md:115: a directly-imported lib's re-export of a name its source lib does not declare draws import-unknown-symbol against the re-exporting lib",
    ).toEqual([EXPECTED_CONTROL]);
  });

  it(`RED at HEAD (T2-transitive): a plain-import-reached lib's re-export of an absent name draws the SAME ${UNKNOWN_SYMBOL_CODE}`, async () => {
    const control = await b0333LoadDiags(APP_IMPORTS_A, {
      "/proj/a.thetalib": `export { X } from "./b.thetalib"\n${fnDecl("af")}`,
      "/proj/b.thetalib": fnDecl("other"),
    });
    // control precondition: the direct case must report, or the equality is vacuous.
    expect(control.diagLines, "control precondition: the depth-1 absent-name re-export reports").toEqual([
      EXPECTED_CONTROL,
    ]);

    // theta → a (plain `import bf`) → b; `b` re-exports `X` from `c`, and `c`
    // declares only `other`. The broken re-export is reached only through the
    // plain-import hop into `b`.
    const row = await b0333LoadDiags(APP_IMPORTS_A, {
      "/proj/a.thetalib": `import { bf } from "./b.thetalib"\n${fnDecl("af")}`,
      "/proj/b.thetalib": `export { X } from "./c.thetalib"\n${fnDecl("bf")}`,
      "/proj/c.thetalib": fnDecl("other"),
    });
    expect(row.appParseCodes, "the importing theta parses clean either way").toEqual([]);
    expect(
      row.diagLines,
      `imports.md:115 batches an unknown-symbol error from "the importing file and its transitive \`.thetalib\` imports" and sites an \`export { X } from\` check on the re-exporting lib: \`c\` declares no \`X\`, so the transitive re-export must draw ${UNKNOWN_SYMBOL_CODE}. HEAD emits []. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toContain(EXPECTED_ROW);
    // Control-equality oracle on the delivered CODE (the message paths differ
    // by construction — the transitive row's re-exporting lib names `./c` where
    // the control's names `./b`): the transitive edge draws the same fault CODE
    // its depth-1 direct control draws.
    expect(
      codesOf(row),
      "the transitive edge draws the same fault code the direct edge draws",
    ).toEqual(codesOf(control));
  });
});

// ===========================================================================
// DEPTH-2 — theta → a → b → c, all plain imports, broken
// `export { X } from "./missing.thetalib"` in `c`. Pins that the widened seed
// reaches every walked lib at depth ≥ 2, not merely the first transitive hop.
// ===========================================================================

describe("bug 0333 (depth-2) — a broken re-export two plain-import hops down still draws IMP-1", () => {
  const EXPECTED = line(UNRESOLVABLE_CODE, unresolvableMessage(MISSING));

  it(`RED at HEAD (depth-2): theta → a → b → c with the broken re-export in c draws ${UNRESOLVABLE_CODE}`, async () => {
    const row = await b0333LoadDiags(APP_IMPORTS_A, {
      "/proj/a.thetalib": `import { bf } from "./b.thetalib"\n${fnDecl("af")}`,
      "/proj/b.thetalib": `import { cf } from "./c.thetalib"\n${fnDecl("bf")}`,
      "/proj/c.thetalib": `export { X } from "${MISSING}"\n${fnDecl("cf")}`,
    });
    expect(row.appParseCodes, "the importing theta parses clean").toEqual([]);
    expect(
      row.diagLines,
      `imports.md:23 (IMP-1) carries no depth qualifier: the broken re-export sits two plain-import hops down in \`c\`, which the import walk reaches and parses, so ${UNRESOLVABLE_CODE} must fire. HEAD emits []. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toContain(EXPECTED);
  });
});

// ===========================================================================
// WELL-FORMED CONTROL — theta → a → b, `b` has `export { other } from
// "./c.thetalib"` and `c` declares `other`. Regression guard: the widened seed
// must not double-report or false-positive a legal transitive re-export. GREEN
// both before and after the fix.
// ===========================================================================

describe("bug 0333 (well-formed) — a legal transitive re-export stays clean", () => {
  it("GREEN (well-formed): theta → a → b with a resolvable, declared transitive re-export reports nothing", async () => {
    const row = await b0333LoadDiags(APP_IMPORTS_A, {
      "/proj/a.thetalib": `import { bf } from "./b.thetalib"\n${fnDecl("af")}`,
      "/proj/b.thetalib": `export { other } from "./c.thetalib"\n${fnDecl("bf")}`,
      "/proj/c.thetalib": fnDecl("other"),
    });
    expect(row.appParseCodes, "the importing theta parses clean").toEqual([]);
    expect(
      row.diagLines,
      `\`c\` declares \`other\` and \`./c.thetalib\` resolves, so the transitive re-export is legal at every gate — the widened seed must neither double-report nor false-positive it. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toEqual([]);
  });
});
