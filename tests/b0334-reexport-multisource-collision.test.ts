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

// Bug 0334 — a `.thetalib` hub that re-exports the SAME exported name from two
// DIFFERENT declaring sources through its `export … from` closure carries NO
// diagnostic. `fixReExportedNames` keys each lib's resolved export set on name
// alone (`Map<string, Set<string>>`), so the second contributor of a repeated
// name is a silent no-op; a downstream `import { X } from "./hub.thetalib"`
// then binds whichever re-export edge appears first in the hub's source order
// via `materializeChain`'s first-matching-edge return — silently, and
// declaration-order-dependently. The byte-identical collision written as two
// `import { X }` specifiers in the importing theta IS reported
// (`checkImportNameCollisions` over the theta's own specifiers). Enforcement
// depth therefore tracks the collision's SHAPE (hub re-export set vs the
// theta's own specifiers), not the fault.
//
// SPEC ANCHORS (the contract, re-derived against this tree; not the current code):
//   - docs/spec_topics/imports.md:117 — §"Name collisions": "Two imports
//     bringing in the same symbol name is `theta/parse/import-name-collision`.
//     Resolve with `as`-aliasing." No sentence scopes the contract to the
//     importing theta's own specifiers; a name a hub's resolved export set
//     receives from two distinct declaring sources is two sources for one
//     imported name.
//   - docs/spec_topics/imports.md:124 — "no implicit shadowing." C1 is
//     implicit shadowing across a library boundary: b's `xf` is shadowed by
//     a's with no signal on either side.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:135 — the
//     `theta/parse/import-name-collision` row. Trigger: "Two imports bring in
//     the same symbol name, or an imported symbol collides with a top-level
//     declaration in the same file." Normative Message (DIAG-4):
//     `imported symbol '<name>' collides with another import or top-level
//     declaration`. (The bug doc cites :134; re-derived at this tree the row
//     sits at :135.)
//
// THE INVARIANT THIS FILE ENCODES: the collision the spec's §"Name collisions"
// contract refuses across the importing theta's specifiers (C2, which already
// reports) is the same collision when the two sources meet in a hub's
// re-export closure (C1) — so C1 and its declaration-order-swap variant must
// draw the SAME `theta/parse/import-name-collision` code. The diamond (C4) —
// one declaration reached by two re-export paths — is legal input at every
// gate and must STAY silent (the collision key is the resolved declaring site,
// not the immediate source lib). C3 (two different names) is clean. The
// direct-specifier control (C2) is pinned to report FIRST in each collision
// case so the presence assertion is not vacuous, mirroring the control-first
// philosophy of tests/b0333-transitive-lib-reexport-edge.test.ts and
// tests/reexport-chain-resolution.test.ts (a control asserted broken cannot
// vacuously satisfy a presence check). The oracle for the expected message is
// the registry's normative Message template rendered with `xf` (DIAG-4), never
// a hand-written string.
//
// TIER: **unit**, offline, deterministic, provider-free. Every claim settles
// inside one `parseThetaDocument` over a string plus one real `checkThetaImports`
// over an in-memory `FileSystem` double (the b0333 / reexport-chain-resolution
// harness shape). No model, session, or discovery round trip participates in a
// decision the load pass has already made, so an integration or live tier would
// add a provider to a computation none of them touch.
//
// RED AT HEAD 32a68c7d / v0.302.0: C1 and C1-reversed emit `[]` (SILENT — the
// bug); C2 already reports `theta/parse/import-name-collision`; C3 and C4
// already emit `[]`. The re-export-closure multi-source collision check turns
// C1 and C1-reversed → reporting at the fixing version 0.303.0, sited on the hub
// (`/proj/hub.thetalib`), while C2 stays reporting and C3/C4 stay `[]`.

// ===========================================================================
// The registered code and its normative message (DIAG-4).
// ===========================================================================

/** The reused code — withheld on the hub's multi-source re-export collision (C1/C1-reversed). */
const IMPORT_NAME_COLLISION_CODE = "theta/parse/import-name-collision";

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/b0333-transitive-lib-reexport-edge.test.ts
// renders DIAG-4 messages from.
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
// (the b0333 / reexport-chain-resolution harness shape).
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
async function b0334LoadDiags(
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

// ===========================================================================
// Fixtures. Declaration bodies are one member per line (docs/STYLE.md). Every
// `fn` mirrors the bug doc §Reproduction signature `fn n(n: integer): integer`.
// ===========================================================================

/** `fn <name>(n: integer): integer { <expr> }`, one member per line. */
function fnDecl(name: string, expr: string): string {
  return [`fn ${name}(n: integer): integer {`, `  ${expr}`, "}", ""].join("\n");
}

/** `a.thetalib` declares `xf` as `n + 1`; `b.thetalib` declares `xf` as `n + 100` (two DISTINCT declaring sites). */
const A_XF = fnDecl("xf", "n + 1");
const B_XF = fnDecl("xf", "n + 100");

// ===========================================================================
// C1 — multi-source re-export collision through a hub: silent at HEAD.
// hub re-exports `xf` from a.thetalib then b.thetalib; a and b each declare a
// DIFFERENT `fn xf`. The importer writes one name from one hub and has no `as`
// to disambiguate a collision it cannot see. The direct-specifier control (C2)
// is pinned to report FIRST so the presence check is not vacuous.
// ===========================================================================

describe("bug 0334 (C1) — a hub re-exporting one name from two sources draws import-name-collision", () => {
  const EXPECTED = line(IMPORT_NAME_COLLISION_CODE, collisionMessage("xf"));

  const A_AND_B: Record<string, string> = {
    "/proj/a.thetalib": A_XF,
    "/proj/b.thetalib": B_XF,
  };

  it(`GREEN (C1-control / C2): two direct specifiers naming 'xf' already draw ${IMPORT_NAME_COLLISION_CODE}`, async () => {
    // The direct-specifier control. This is the absolute pin the C1 presence
    // assertions rest on — the two sources of C1 are the two sources here, one
    // hop removed through the hub. A control asserted reporting cannot let a
    // presence check pass vacuously.
    const control = await b0334LoadDiags(
      ['import { xf } from "./a.thetalib"', 'import { xf } from "./b.thetalib"'].join("\n"),
      A_AND_B,
    );
    expect(control.appParseCodes, "the importing theta parses clean — the collision is a load-pass diagnostic").toEqual(
      [],
    );
    expect(
      control.diagLines,
      "imports.md:117: two import specifiers naming one local 'xf' fire import-name-collision (checkImportNameCollisions over the theta's own specifiers)",
    ).toEqual([EXPECTED]);
  });

  it(`RED at HEAD (C1): hub re-exports 'xf' from a then b; the importer's \`import { xf }\` draws the SAME ${IMPORT_NAME_COLLISION_CODE}`, async () => {
    const control = await b0334LoadDiags(
      ['import { xf } from "./a.thetalib"', 'import { xf } from "./b.thetalib"'].join("\n"),
      A_AND_B,
    );
    // control precondition: the direct case must report, or the presence check is vacuous.
    expect(control.diagLines, "control precondition: the direct two-specifier collision reports").toEqual([
      EXPECTED,
    ]);

    // hub re-exports `xf` from a (n + 1) then b (n + 100); the importer writes
    // one name from one hub. At HEAD `fixReExportedNames` collapses the two
    // edges to one Set member and the collision is silent.
    const row = await b0334LoadDiags('import { xf } from "./hub.thetalib"', {
      "/proj/hub.thetalib": ['export { xf } from "./a.thetalib"', 'export { xf } from "./b.thetalib"', ""].join(
        "\n",
      ),
      ...A_AND_B,
    });
    expect(row.appParseCodes, "the importing theta parses clean — the fault is in the hub's export closure").toEqual(
      [],
    );
    expect(
      row.diagLines,
      `imports.md:117 (no sentence scopes the contract to the theta's own specifiers) and :124 (no implicit shadowing): the hub's resolved export set receives 'xf' from two DISTINCT declaring sites (a: n+1, b: n+100), which is ${IMPORT_NAME_COLLISION_CODE} sited on the hub. HEAD emits []. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toEqual([EXPECTED]);
    // The collision is the SOLE diagnostic, so it must be reported exactly
    // once and sited on the hub (imports.md §Re-exports: the fault lives in
    // the re-exporting lib's closure, not the importing theta).
    const hubCollisions = row.diagnostics.filter((d) => d.code === IMPORT_NAME_COLLISION_CODE);
    expect(
      hubCollisions.map((d) => d.file),
      `exactly one import-name-collision, sited on the hub. Rendered diagnostics: ${JSON.stringify(row.diagLines)}`,
    ).toEqual(["/proj/hub.thetalib"]);
  });

  it(`RED at HEAD (C1-reversed): swapping the hub's export order draws the SAME ${IMPORT_NAME_COLLISION_CODE}`, async () => {
    const control = await b0334LoadDiags(
      ['import { xf } from "./a.thetalib"', 'import { xf } from "./b.thetalib"'].join("\n"),
      A_AND_B,
    );
    expect(control.diagLines, "control precondition: the direct two-specifier collision reports").toEqual([
      EXPECTED,
    ]);

    // The declaration-order-swap variant: hub lists b first, then a. At HEAD
    // the binding tracks declaration order (b wins) with no diagnostic either
    // way; the fix must fire the SAME collision regardless of edge order.
    const row = await b0334LoadDiags('import { xf } from "./hub.thetalib"', {
      "/proj/hub.thetalib": ['export { xf } from "./b.thetalib"', 'export { xf } from "./a.thetalib"', ""].join(
        "\n",
      ),
      ...A_AND_B,
    });
    expect(row.appParseCodes, "the importing theta parses clean either way").toEqual([]);
    expect(
      row.diagLines,
      `the collision is symmetric in edge order — reversing the hub's two \`export … from\` lines must draw the same ${IMPORT_NAME_COLLISION_CODE}, not flip a silent winner. HEAD emits []. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toEqual([EXPECTED]);
    // Symmetric in edge order: exactly one collision, still sited on the hub.
    const hubCollisions = row.diagnostics.filter((d) => d.code === IMPORT_NAME_COLLISION_CODE);
    expect(
      hubCollisions.map((d) => d.file),
      `exactly one import-name-collision regardless of edge order. Rendered diagnostics: ${JSON.stringify(row.diagLines)}`,
    ).toEqual(["/proj/hub.thetalib"]);
  });
});

// ===========================================================================
// C3 — control: a hub-free program importing two DIFFERENT names is clean, and
// remains clean under the widened check. GREEN before and after.
// ===========================================================================

describe("bug 0334 (C3) — two imports of different names stay clean", () => {
  it("GREEN (C3): import { xf } from a and { yf } from b reports nothing", async () => {
    const row = await b0334LoadDiags(
      ['import { xf } from "./a.thetalib"', 'import { yf } from "./b.thetalib"'].join("\n"),
      {
        "/proj/a.thetalib": fnDecl("xf", "n + 1"),
        "/proj/b.thetalib": fnDecl("yf", "n + 100"),
      },
    );
    expect(row.appParseCodes, "the importing theta parses clean").toEqual([]);
    expect(
      row.diagLines,
      `distinct names bind distinct locals — no collision at any gate; the widened check must not false-positive. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// C5 — the deferred seam: a hub that DECLARES `fn xf` AND re-exports `xf` from
// two sources. The hub's own declaration binds `xf` (materializeChain resolves
// direct-first), so both re-export edges are inert — they union no new member
// into a set that already carries the own declaration. Whether that own
// declaration shadowing its own re-export edges is itself a collision is
// docs/spec_topics/imports.md — bug 0334 §Non-goals bullet 3 ("a re-export
// whose name shadows the re-exporting lib's OWN top-level declaration … a
// further seam … no probe here drove it"): explicitly DEFERRED. This row MUST
// stay silent, or the check has annexed a seam this bug left for later.
// ===========================================================================

describe("bug 0334 (C5) — a hub declaring the re-exported name stays silent (§Non-goals bullet 3, deferred)", () => {
  it("GREEN (C5): hub declares `fn xf` AND re-exports xf from a and b — own-declaration-shadowed edges are inert", async () => {
    const row = await b0334LoadDiags('import { xf } from "./hub.thetalib"', {
      "/proj/hub.thetalib": [
        fnDecl("xf", "n + 7"),
        'export { xf } from "./a.thetalib"',
        'export { xf } from "./b.thetalib"',
        "",
      ].join("\n"),
      "/proj/a.thetalib": A_XF,
      "/proj/b.thetalib": B_XF,
    });
    expect(row.appParseCodes, "the importing theta parses clean").toEqual([]);
    expect(
      row.diagLines,
      `§Non-goals bullet 3 (re-export-shadows-own-declaration, DEFERRED): the hub's own \`fn xf\` binds 'xf' and its two re-export edges are inert, so this bug's multi-source check must NOT fire here. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// C4 — the diamond: one declaration reached through two re-export paths. hub
// re-exports `xf` from midA and midB; midA and midB each re-export `xf` from
// base; base declares the ONE `fn xf`. Both chains resolve to base's single
// declaration, so the import binds one declaration by two paths — NOT a
// collision. This row is legal input at every gate and MUST STAY silent: the
// collision key is the resolved DECLARING SITE (base's `xf`), not the immediate
// source lib, so the fix's grouping must treat these two edges as one.
// ===========================================================================

describe("bug 0334 (C4) — a diamond re-export of one declaration stays silent (the exemption)", () => {
  it("GREEN (C4): hub → {midA, midB} → base, one `fn xf`, reports nothing and MUST keep reporting nothing", async () => {
    const row = await b0334LoadDiags('import { xf } from "./hub.thetalib"', {
      "/proj/hub.thetalib": ['export { xf } from "./midA.thetalib"', 'export { xf } from "./midB.thetalib"', ""].join(
        "\n",
      ),
      "/proj/midA.thetalib": 'export { xf } from "./base.thetalib"\n',
      "/proj/midB.thetalib": 'export { xf } from "./base.thetalib"\n',
      "/proj/base.thetalib": fnDecl("xf", "n + 1"),
    });
    expect(row.appParseCodes, "the importing theta parses clean").toEqual([]);
    expect(
      row.diagLines,
      `the diamond exemption: both re-export chains resolve to base's ONE \`fn xf\`, so 'xf' is one declaration reached by two paths, not two declarations under one name. The collision key is the declaring site — the fix must keep this row [] while firing on C1. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// C6 — a THREE-edge collision in ONE hub: hub re-exports `xf` from a, then b,
// then a again. The fix's grouping-by-`fromLib`-then-`exported` walks every
// edge in the group and `break`s at the FIRST edge whose resolved declaring
// site differs from the group's first edge — this fixture locks that a
// three-edge group (not just the two-edge shape C1/C1-reversed cover) still
// fires the diagnostic exactly ONCE, not once per differing edge.
// ===========================================================================

describe("bug 0334 (C6) — a three-edge collision in one hub fires exactly once", () => {
  const EXPECTED = line(IMPORT_NAME_COLLISION_CODE, collisionMessage("xf"));

  it(`RED at HEAD (C6): hub re-exports 'xf' from a, b, then a again — exactly one ${IMPORT_NAME_COLLISION_CODE}, sited on the hub`, async () => {
    const row = await b0334LoadDiags('import { xf } from "./hub.thetalib"', {
      "/proj/hub.thetalib": [
        'export { xf } from "./a.thetalib"',
        'export { xf } from "./b.thetalib"',
        'export { xf } from "./a.thetalib"',
        "",
      ].join("\n"),
      "/proj/a.thetalib": A_XF,
      "/proj/b.thetalib": B_XF,
    });
    expect(row.appParseCodes, "the importing theta parses clean — the fault is in the hub's export closure").toEqual(
      [],
    );
    expect(
      row.diagLines,
      `a three-edge group (a, b, a) must still draw the collision exactly once — the collision line must appear once, not once per differing edge or once per repeated edge. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toEqual([EXPECTED]);
    const hubCollisions = row.diagnostics.filter((d) => d.code === IMPORT_NAME_COLLISION_CODE);
    expect(
      hubCollisions.map((d) => d.file),
      `exactly one import-name-collision across a three-edge group, sited on the hub. Rendered diagnostics: ${JSON.stringify(row.diagLines)}`,
    ).toEqual(["/proj/hub.thetalib"]);
  });
});

// ===========================================================================
// C7 — the collision reached TRANSITIVELY: hub re-exports `xf` from mid ONLY
// (a single edge — hub's own group has length 1, so hub draws nothing). mid
// re-exports `xf` from a AND from b (the two-source collision lives in MID,
// not in hub or in the importing theta). This locks that the check covers a
// re-exporting lib reached through the walk, not only the directly-imported
// hub: the collision fires on the transitively-reached re-exporting lib
// (mid), reaching the importing theta through the registration channel —
// demonstrating the check rides the same `walked`-wide seed bug 0333 widened.
// ===========================================================================

describe("bug 0334 (C7) — a collision reached transitively through a re-export chain fires on the reached lib, not the hub", () => {
  const EXPECTED = line(IMPORT_NAME_COLLISION_CODE, collisionMessage("xf"));

  it(`RED at HEAD (C7): hub → mid (single edge) → {a, b} (two sources) — the ${IMPORT_NAME_COLLISION_CODE} fires on mid, not hub`, async () => {
    const row = await b0334LoadDiags('import { xf } from "./hub.thetalib"', {
      "/proj/hub.thetalib": 'export { xf } from "./mid.thetalib"\n',
      "/proj/mid.thetalib": [
        'export { xf } from "./a.thetalib"',
        'export { xf } from "./b.thetalib"',
        "",
      ].join("\n"),
      "/proj/a.thetalib": A_XF,
      "/proj/b.thetalib": B_XF,
    });
    expect(row.appParseCodes, "the importing theta parses clean — a red here would be a harness fault, not the collision under witness").toEqual(
      [],
    );
    expect(
      row.diagLines,
      `hub's own group has length 1 (a single edge to mid) so hub draws nothing; the two-source collision lives in mid's group (a, b) and must still fire reached through the walk. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toEqual([EXPECTED]);
    const midCollisions = row.diagnostics.filter((d) => d.code === IMPORT_NAME_COLLISION_CODE);
    expect(
      midCollisions.map((d) => d.file),
      `exactly one import-name-collision, sited on mid (NOT hub, NOT app) — the transitively-reached re-exporting lib, not the directly-imported one. Rendered diagnostics: ${JSON.stringify(row.diagLines)}`,
    ).toEqual(["/proj/mid.thetalib"]);
  });
});
