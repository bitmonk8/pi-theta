// Bug 0335 — inside a dependency `.thetalib`, a name bound by BOTH the
// library's own `import { X } from …` and its own top-level `fn`/`enum`/`schema`
// declaration is silently shadowed with no diagnostic. `imports.md:124` refuses
// exactly that collision — an imported symbol whose name collides with a
// top-level declaration in the same file is `theta/parse/import-name-collision`,
// "no implicit shadowing" — but `checkThetaImports` runs the collision arm
// (`checkImportNameCollisions`, src/parser/imports.ts) only over the COMPOSING
// theta's own specifiers, never over a resolved dependency `.thetalib`'s own
// specifiers against its own top-level names. So the collision loads clean and
// one binding silently shadows the other in the library's module scope.
//
// The witness surface is the LOAD diagnostic only. Per §Fix, the fix refuses
// registration at load, so neither runtime winner path is reached for a
// colliding name — this file therefore asserts the emitted collision code and
// its site, NOT the runtime winner (the bug doc's 222 / "b-wire" / "a-wire"
// values). Those values witness the incoherence of the silent-admit behaviour
// the fix removes; the fix's observable is the refusal, not the winner.
//
// SPEC ANCHORS (the contract, re-derived against this tree; not the current code):
//   - docs/spec_topics/imports.md:124 — §Name collisions: "An imported symbol
//     whose name collides with a top-level declaration in the same file is also
//     `theta/parse/import-name-collision` — no implicit shadowing." The rule
//     names "the same file" and does not exempt `.thetalib` files; a library
//     that imports `X` and declares `X` is exactly that collision. It is this
//     sentence the dependency-`.thetalib` load path currently refuses to apply.
//   - docs/spec_topics/imports.md:14 — the 0.291.0 declaring-scope rule: a
//     library body's free names resolve against "its own hoisted top-level
//     declarations and its own materialised imports"; silent on which wins when
//     both bind one name, which is why :124 refuses the input rather than
//     picking a winner.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:135 — the
//     `theta/parse/import-name-collision` row; normative Message (DIAG-4):
//     `imported symbol '<name>' collides with another import or top-level
//     declaration`.
//
// THE INVARIANT THIS FILE ENCODES: the collision `imports.md:124` refuses over
// the composing theta's own specifiers (the theta-side control, which already
// fires) is the SAME collision when it lives inside a resolved dependency
// `.thetalib` (R1–R4, currently silent) — so the dependency-`.thetalib` load
// path must draw the SAME `theta/parse/import-name-collision` code, sited on the
// offending library (`/proj/libA.thetalib`). The no-collision control and the
// theta-side control are regression guards proving the fix narrows nothing and
// mirrors an already-existing disposition.
//
// TIER: **unit**, offline, deterministic, provider-free. Every claim settles
// inside one `parseThetaDocument` over a string plus one real `checkThetaImports`
// over an in-memory `FileSystem` double (the b0302 / b0334 harness shape). The
// load pass has already made the collision verdict before any model, session, or
// discovery round trip; an integration or live tier would add a provider to a
// computation none of them touch.
//
// RED AT FORK 595f0b70 / v0.303.0: R1–R4 each emit `[]` (SILENT — the bug: the
// dependency-`.thetalib` path never runs the collision arm); the no-collision
// control emits `[]` (correct, GREEN now and post-fix); the theta-side control
// already fires `theta/parse/import-name-collision` (GREEN now and post-fix,
// proving the disposition pre-exists on the theta path). The fix runs the
// existing arm over every resolved dependency `.thetalib`'s own specifiers,
// turning R1–R4 → reporting, sited on `/proj/libA.thetalib`.

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

// ===========================================================================
// The reused code and its normative message (DIAG-4).
// ===========================================================================

/** The reused code — withheld on the dependency-`.thetalib` own-collision path (R1–R4). */
const IMPORT_NAME_COLLISION_CODE = "theta/parse/import-name-collision";

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/b0334-reexport-multisource-collision.test.ts
// renders DIAG-4 messages from, so no expected string in this file is written twice.
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
 * registry. An absent Message cell is an unmet precondition, so this FAILS
 * LOUDLY naming the code rather than returning `undefined` for a later
 * comparison to red on obscurely — DIAG-4 makes the Message column normative
 * character-for-character.
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

/** The `import-name-collision` message rendered for one colliding name (DIAG-4). */
function collisionMessage(name: string): string {
  return normativeMessage(IMPORT_NAME_COLLISION_CODE).replace("<name>", name);
}

/** One rendered diagnostic line — the `severity code: message` shape the harness uses. */
function line(code: string, message: string): string {
  return `error ${code}: ${message}`;
}

// ===========================================================================
// Parse drivers, the in-memory `.thetalib` filesystem double, and the load pass
// (the b0302 / b0334 harness shape, reused verbatim).
// ===========================================================================

/** The importing `.theta` frontmatter every fixture shares (a real prompt-mode theta). */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

function parseApp(body: string): ThetaDocument {
  return parseThetaDocument(
    { path: "/proj/app.theta", bytes: new TextEncoder().encode(`${APP_FRONTMATTER}\n${body}`) },
    parseDeps(),
  );
}

// Only `readdir` / `readBytes` are exercised; every other member rejects so an
// unexpected call reds loudly rather than returning a silent default.
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
 * returning the load pass's diagnostics rendered as `severity code: message`
 * plus the raw diagnostics (so a cell can assert the collision's `file`).
 *
 * The importing theta's frontmatter is asserted to parse — if it did not the
 * load pass would read nothing and a later red would be a harness fault rather
 * than the missing diagnostic under witness.
 */
async function loadDiags(appBody: string, libs: Record<string, string>): Promise<LoadResult> {
  const app = parseApp(appBody);
  expect(
    app.frontmatter,
    `the importing theta's frontmatter must parse or the load pass reads nothing; diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter: app.frontmatter as ParsedFrontmatter,
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

/** The one library file the collision must be sited on post-fix. */
const LIB_A = "/proj/libA.thetalib";

/** The app body every dependency-collision cell shares: import `probe` from libA and call it. */
const APP_IMPORTS_PROBE = ['import { probe } from "./libA.thetalib"', "probe()", ""].join("\n");

// ===========================================================================
// R1–R4 — the dependency-`.thetalib` own-import-vs-own-declaration collision:
// SILENT at the fork (the bug), reporting sited on libA post-fix. All library
// declarations are convention-cased (lowercase fn, uppercase type) so
// `binding-case-mismatch` noise is absent, per the bug doc §Reproduction.
// ===========================================================================

describe("bug 0335 — a dependency `.thetalib`'s own import colliding with its own declaration draws import-name-collision", () => {
  const EXPECTED_HELPER = line(IMPORT_NAME_COLLISION_CODE, collisionMessage("helper"));
  const EXPECTED_X = line(IMPORT_NAME_COLLISION_CODE, collisionMessage("X"));

  it(`RED at fork (R1, colliding fn): libA imports 'helper' AND declares 'fn helper' — draws ${IMPORT_NAME_COLLISION_CODE} on libA`, async () => {
    // imports.md:124: an imported symbol colliding with a same-file top-level
    // declaration is import-name-collision, "no implicit shadowing". libA
    // imports `helper` from libB and declares its own `fn helper` — the exact
    // collision. Bug 0335: `checkThetaImports` runs the collision arm only over
    // the composing theta's specifiers, so the dependency library's own
    // collision is undiagnosed and loads clean ([]).
    const row = await loadDiags(APP_IMPORTS_PROBE, {
      [LIB_A]: [
        'import { helper } from "./libB.thetalib"',
        "fn helper(): integer { 222 }",
        "fn probe(): integer { helper() }",
        "",
      ].join("\n"),
      "/proj/libB.thetalib": "fn helper(): integer { 111 }\n",
    });
    expect(row.appParseCodes, "the importing theta parses clean — the fault is inside the dependency library").toEqual(
      [],
    );
    expect(
      row.diagLines,
      `bug 0335 / imports.md:124 ("no implicit shadowing", not restricted to .theta files): libA both imports 'helper' and declares 'fn helper', which is ${IMPORT_NAME_COLLISION_CODE}. The SAME collision written in a .theta already fires (theta-side control); the dependency-.thetalib path is currently undiagnosed and emits []. Rendered: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toEqual([EXPECTED_HELPER]);
    const collisions = row.diagnostics.filter((d) => d.code === IMPORT_NAME_COLLISION_CODE);
    expect(
      collisions.map((d) => d.file),
      `the collision is a property of libA's own specifiers, so it must be sited on ${LIB_A} (imports.md:124 "the same file"), not the importing theta. Rendered: ${JSON.stringify(row.diagLines)}`,
    ).toEqual([LIB_A]);
  });

  it(`RED at fork (R2, colliding enum): libA imports 'X' AND declares 'enum X' — draws ${IMPORT_NAME_COLLISION_CODE} on libA`, async () => {
    // Convention-cased type name `X` (uppercase) so no binding-case-mismatch
    // noise. Bug 0335: undiagnosed on the dependency-.thetalib path ([]).
    const row = await loadDiags(APP_IMPORTS_PROBE, {
      [LIB_A]: [
        'import { X } from "./libB.thetalib"',
        'enum X { A = "a-wire" }',
        "fn probe(): X { X.A }",
        "",
      ].join("\n"),
      "/proj/libB.thetalib": 'enum X { A = "b-wire" }\n',
    });
    expect(row.appParseCodes, "the importing theta parses clean").toEqual([]);
    expect(
      row.diagLines,
      `bug 0335 / imports.md:124: libA both imports 'X' and declares 'enum X' — import-name-collision, undiagnosed on the dependency-.thetalib path (emits []). Rendered: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toEqual([EXPECTED_X]);
    const collisions = row.diagnostics.filter((d) => d.code === IMPORT_NAME_COLLISION_CODE);
    expect(
      collisions.map((d) => d.file),
      `sited on ${LIB_A} — libA's own specifier collides with libA's own enum. Rendered: ${JSON.stringify(row.diagLines)}`,
    ).toEqual([LIB_A]);
  });

  it(`RED at fork (R3, colliding schema): libA imports 'X' AND declares 'schema X' — draws ${IMPORT_NAME_COLLISION_CODE} on libA`, async () => {
    // The schema variant of the same collision. Bug 0335: undiagnosed ([]).
    const row = await loadDiags(APP_IMPORTS_PROBE, {
      [LIB_A]: [
        'import { X } from "./libB.thetalib"',
        "schema X {",
        "  a: integer",
        "}",
        "fn probe(): X { X { a: 9 } }",
        "",
      ].join("\n"),
      "/proj/libB.thetalib": ["schema X {", "  b: integer", "}", ""].join("\n"),
    });
    expect(row.appParseCodes, "the importing theta parses clean").toEqual([]);
    expect(
      row.diagLines,
      `bug 0335 / imports.md:124: libA both imports 'X' and declares 'schema X' — import-name-collision, undiagnosed on the dependency-.thetalib path (emits []). Rendered: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toEqual([EXPECTED_X]);
    const collisions = row.diagnostics.filter((d) => d.code === IMPORT_NAME_COLLISION_CODE);
    expect(
      collisions.map((d) => d.file),
      `sited on ${LIB_A} — libA's own specifier collides with libA's own schema. Rendered: ${JSON.stringify(row.diagLines)}`,
    ).toEqual([LIB_A]);
  });

  it(`RED at fork (R4, importer reads the collided enum): app imports 'X' from libA which imports AND declares 'enum X' — draws ${IMPORT_NAME_COLLISION_CODE} on libA`, async () => {
    // R4 differs only in the read site: the importer reads `X.A` out of libA
    // instead of libA's `probe` reading it. The collision is still libA's own
    // (import { X } + enum X), so post-fix it draws import-name-collision on
    // libA regardless of who reads the name. Bug 0335: undiagnosed ([]).
    const row = await loadDiags(['import { X } from "./libA.thetalib"', "X.A", ""].join("\n"), {
      [LIB_A]: [
        'import { X } from "./libB.thetalib"',
        'enum X { A = "a-wire" }',
        "",
      ].join("\n"),
      "/proj/libB.thetalib": 'enum X { A = "b-wire" }\n',
    });
    expect(row.appParseCodes, "the importing theta parses clean").toEqual([]);
    expect(
      row.diagLines,
      `bug 0335 / imports.md:124: the collision is libA's own (import { X } + enum X); an importer reading X.A out of libA must still see it refused, undiagnosed on the dependency-.thetalib path (emits []). Rendered: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toEqual([EXPECTED_X]);
    const collisions = row.diagnostics.filter((d) => d.code === IMPORT_NAME_COLLISION_CODE);
    expect(
      collisions.map((d) => d.file),
      `sited on ${LIB_A} — the collision belongs to libA's own specifiers, not to the reading site. Rendered: ${JSON.stringify(row.diagLines)}`,
    ).toEqual([LIB_A]);
  });
});

// ===========================================================================
// Controls — regression guards. GREEN now and post-fix: the fix must narrow
// nothing (no collision → no code) and must mirror an already-existing
// disposition (the same collision in a .theta already fires).
// ===========================================================================

describe("bug 0335 (controls) — no false positive, and the theta-side disposition pre-exists", () => {
  it("GREEN (no-collision control): libA imports 'other', declares 'fn helper', probe reads both — reports nothing", async () => {
    // libA imports a DIFFERENT name (`other`) than it declares (`helper`), so
    // there is no own-import-vs-own-declaration collision. This is [] now and
    // must stay [] post-fix — a guard proving the widened check does not
    // false-positive on a library that merely imports and declares distinct
    // names.
    const row = await loadDiags(APP_IMPORTS_PROBE, {
      [LIB_A]: [
        'import { other } from "./libB.thetalib"',
        "fn helper(): integer { 222 }",
        "fn probe(): integer { helper() + other() }",
        "",
      ].join("\n"),
      "/proj/libB.thetalib": "fn other(): integer { 111 }\n",
    });
    expect(row.appParseCodes, "the importing theta parses clean").toEqual([]);
    const collisions = row.diagnostics.filter((d) => d.code === IMPORT_NAME_COLLISION_CODE);
    expect(
      collisions.map((d) => `${d.severity} ${d.code}: ${d.message}`),
      `distinct names (import 'other' vs declare 'helper') are not a collision at any gate; the widened check must not false-positive. Rendered: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toEqual([]);
  });

  it(`GREEN (theta-side control): the SAME collision written in a composing .theta already draws ${IMPORT_NAME_COLLISION_CODE}`, async () => {
    // The consistency oracle the fix owes: the composing theta imports `helper`
    // and declares its own `fn helper` — byte-identical to R1's libA collision,
    // one file up. `checkImportNameCollisions` runs over the composing theta's
    // own specifiers, so this fires TODAY, sited on the composing theta. It
    // proves the disposition pre-exists on the theta path; bug 0335 is the
    // absence of that same arm over a resolved dependency `.thetalib`.
    const row = await loadDiags(
      ['import { helper } from "./libB.thetalib"', "fn helper(): integer { 222 }", "helper()", ""].join("\n"),
      { "/proj/libB.thetalib": "fn helper(): integer { 111 }\n" },
    );
    expect(row.appParseCodes, "the composing theta parses clean — the collision is a load-pass diagnostic").toEqual(
      [],
    );
    expect(
      row.diagLines,
      `imports.md:124: an import { helper } colliding with a top-level fn helper in the SAME .theta already fires (checkImportNameCollisions over the composing theta's own specifiers). Rendered: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toEqual([line(IMPORT_NAME_COLLISION_CODE, collisionMessage("helper"))]);
    const collisions = row.diagnostics.filter((d) => d.code === IMPORT_NAME_COLLISION_CODE);
    expect(
      collisions.map((d) => d.file),
      `the theta-side collision is sited on the composing theta (/proj/app.theta), witnessing that the disposition exists — bug 0335 is only that the dependency-.thetalib path never runs it. Rendered: ${JSON.stringify(row.diagLines)}`,
    ).toEqual(["/proj/app.theta"]);
  });
});
