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

// Bug 0304 — every load-time fault inside a `.thetalib` reached through one
// plain-`import` hop is discarded: a transitive lib's unresolvable import path
// (IMP-1), its illegal top-level statement, and its unknown import symbol all
// register the importing theta with zero diagnostics, while the byte-identical
// fault one hop earlier (in the directly-imported lib) un-registers it.
//
// The contract the drops violate is imports.md's own batching sentence
// (docs/spec_topics/imports.md): an error is "collected alongside every other
// parse / type error from the importing file and its transitive `.thetalib`
// imports". IMP-1 (imports.md) and the two parse codes carry no depth qualifier
// in their registry Triggers (docs/spec_topics/diagnostics/code-registry-load.md
// and code-registry-parse.md), so nothing in the spec scopes them to
// directly-imported libs. `walkThetaLib` already resolves every transitive edge
// and holds every transitive parse result in `parseCache`; the faults are
// computed and then dropped, not unreachable (bug doc §"Actual behaviour").
//
// THE INVARIANT THIS FILE ENCODES: the depth-1 control and the transitive row
// carry the SAME registered code with the SAME normative message, sited on the
// faulting file — the direct import un-registers, so the transitive one must
// too. Each transitive row asserts its depth-1 control GREEN in the same cell
// BEFORE the transitive assertion, so a broken control reds as a broken control
// rather than passing an equality vacuously (AGENTS.md §"No silent skipping").
//
// TIER: **unit**, offline, deterministic, provider-free. Every claim settles
// inside one `parseThetaDocument` over a string plus one `checkThetaImports`
// over an in-memory `FileSystem` double — the load pass has already made the
// batching decision this file measures; an integration or live tier would add a
// discovery round trip or a provider to a decision no session and no model
// participates in.
//
// RED AT HEAD: the three transitive cells and the three depth-2 cells red with
// an EMPTY diagnostic batch where the registered code is expected; each depth-1
// control is GREEN. All three drops are fixed together (bug doc §Fix), turning
// the six reds green at the merge version 0.288.0.
//
// DIAG-4: expected diagnostic messages are READ FROM THE REGISTRY
// (docs/spec_topics/diagnostics/*.md), never restated as prose, so no expected
// string in this file is written twice.

// ===========================================================================
// The registered codes and their normative messages (DIAG-2 / DIAG-4).
// ===========================================================================

/** C1 / depth-2 IMP-1: a transitive lib's unresolvable `.thetalib` import path. */
const UNRESOLVABLE_CODE = "theta/load/unresolvable-thetalib-path";

/** C2 / depth-2 parse: a transitive lib's illegal top-level statement. */
const TOP_LEVEL_CODE = "theta/parse/thetalib-top-level-statement";

/** C3 / depth-2 unknown-symbol: a transitive lib's own import naming an absent symbol. */
const UNKNOWN_SYMBOL_CODE = "theta/parse/import-unknown-symbol";

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

// The sharded registry, read from the spec corpus and concatenated — the same
// input tests/code-registry.test.ts reconciles.
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
 * the code and the sharded page rather than returning `undefined` for a later
 * comparison to red on obscurely (AGENTS.md §"No silent skipping").
 */
function normativeMessage(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `no Message cell for ${code} — DIAG-4 makes the Message column normative ` +
      `character-for-character, so an absent cell is an unmet precondition, not a ` +
      `skip. Expected in the Imports cluster of ` +
      `docs/spec_topics/diagnostics/code-registry-{load,parse}.md`,
  ).toBeDefined();
  return template as string;
}

/** The IMP-1 message rendered for one spec path. */
function unresolvableMessage(path: string): string {
  return normativeMessage(UNRESOLVABLE_CODE).replace("<path>", path);
}

/** The illegal-top-level-statement message (no placeholders). */
function topLevelMessage(): string {
  return normativeMessage(TOP_LEVEL_CODE);
}

/** The unknown-symbol message rendered for one source name and one spec path. */
function unknownSymbolMessage(name: string, path: string): string {
  return normativeMessage(UNKNOWN_SYMBOL_CODE).replace("<name>", name).replace("<path>", path);
}

// ===========================================================================
// Parse drivers, the in-memory `.thetalib` filesystem double, and the load pass.
// The double's shape (only `readdir` / `readBytes` exercised, every other member
// rejecting so an unexpected call reds) is the one
// tests/reexport-chain-resolution.test.ts uses.
// ===========================================================================

/** The importing `.theta` frontmatter every fixture shares (bug doc §Reproduction). */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

function parse(source: string, path: string): ThetaDocument {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
}

function parseApp(body: string): ThetaDocument {
  return parse(`${APP_FRONTMATTER}\n${body}`, "/proj/app.theta");
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

/**
 * Parse `/proj/app.theta`, run the real `checkThetaImports` over `libs`, and
 * return the load pass's diagnostics — the registration-channel batch whose
 * emptiness IS the bug.
 */
async function loadDiagnostics(
  appBody: string,
  libs: Record<string, string>,
): Promise<readonly Diagnostic[]> {
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
  return check.diagnostics;
}

/** The error-severity diagnostics carrying `code`, in emission order. */
function errorsWithCode(diagnostics: readonly Diagnostic[], code: string): Diagnostic[] {
  return diagnostics.filter((d) => d.severity === "error" && d.code === code);
}

/** `severity code: message [file]` renders, for readable reds. */
function render(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message} [${d.file}]`);
}

/**
 * Assert EXACTLY ONE error of `code` fired, sited on `file` with `message`.
 *
 * Used for both the depth-1 controls (asserted first, GREEN at HEAD) and the
 * transitive rows (RED at HEAD until the drop is pushed), so a control's failure
 * is distinguishable from a transitive row's.
 */
function expectSingleError(
  label: string,
  diagnostics: readonly Diagnostic[],
  code: string,
  file: string,
  message: string,
): void {
  const hits = errorsWithCode(diagnostics, code);
  expect(
    hits.length,
    `${label}: expected exactly one error ${code}. imports.md's batching sentence ` +
      `collects parse/load errors from "the importing file and its transitive ` +
      `.thetalib imports", and this code's registry Trigger carries no depth ` +
      `qualifier. Rendered batch: ${JSON.stringify(render(diagnostics))}`,
  ).toBe(1);
  const hit = hits[0] as Diagnostic;
  expect(
    hit.file,
    `${label}: the diagnostic is sited on the faulting file, reaching the theta ` +
      `through the registration channel (bug doc §Fix: diagnostics carry the ` +
      `faulting LIB's file:)`,
  ).toBe(file);
  expect(hit.message, `${label}: DIAG-4 — the normative Message rendered from the registry`).toBe(
    message,
  );
}

// ===========================================================================
// C1 — transitive unresolvable import path (IMP-1).
// ===========================================================================

describe("bug 0304 C1 — a transitive lib's unresolvable import path is batched", () => {
  const A_MISSING = ['import { bf } from "./missing.thetalib"', "fn af(x: integer): integer { x }", ""].join(
    "\n",
  );

  it(`GREEN (C1-control): a directly-imported unresolvable path draws ${UNRESOLVABLE_CODE} sited on the theta`, async () => {
    // The depth-1 control: the byte-identical fault one hop earlier un-registers
    // the theta today. Its absolute pin is what keeps the transitive assertion
    // from passing vacuously.
    const diags = await loadDiagnostics('import { x } from "./missing.thetalib"', {});
    expectSingleError(
      "C1-control",
      diags,
      UNRESOLVABLE_CODE,
      "/proj/app.theta",
      unresolvableMessage("./missing.thetalib"),
    );
  });

  it(`RED (C1-transitive): a transitive lib's unresolvable path draws ${UNRESOLVABLE_CODE} sited on that lib`, async () => {
    const control = await loadDiagnostics('import { x } from "./missing.thetalib"', {});
    expectSingleError(
      "C1-transitive control precondition",
      control,
      UNRESOLVABLE_CODE,
      "/proj/app.theta",
      unresolvableMessage("./missing.thetalib"),
    );
    const diags = await loadDiagnostics('import { af } from "./a.thetalib"', {
      "/proj/a.thetalib": A_MISSING,
    });
    expectSingleError(
      "C1-transitive",
      diags,
      UNRESOLVABLE_CODE,
      "/proj/a.thetalib",
      unresolvableMessage("./missing.thetalib"),
    );
  });
});

// ===========================================================================
// C2 — transitive illegal top-level statement.
// ===========================================================================

describe("bug 0304 C2 — a transitive lib's illegal top-level statement is batched", () => {
  const A_IMPORTS_B = ['import { bf } from "./b.thetalib"', "fn af(x: integer): integer { x }", ""].join(
    "\n",
  );
  const B_ILLEGAL = ["let x = 3", "fn bf(x: integer): integer { x }", ""].join("\n");

  it(`GREEN (C2-control): a directly-imported lib's illegal top-level statement draws ${TOP_LEVEL_CODE}`, async () => {
    const diags = await loadDiagnostics('import { bf } from "./b.thetalib"', {
      "/proj/b.thetalib": B_ILLEGAL,
    });
    expectSingleError(
      "C2-control",
      diags,
      TOP_LEVEL_CODE,
      "/proj/b.thetalib",
      topLevelMessage(),
    );
  });

  it(`RED (C2-transitive): a transitive lib's illegal top-level statement draws ${TOP_LEVEL_CODE}`, async () => {
    const control = await loadDiagnostics('import { bf } from "./b.thetalib"', {
      "/proj/b.thetalib": B_ILLEGAL,
    });
    expectSingleError(
      "C2-transitive control precondition",
      control,
      TOP_LEVEL_CODE,
      "/proj/b.thetalib",
      topLevelMessage(),
    );
    const diags = await loadDiagnostics('import { af } from "./a.thetalib"', {
      "/proj/a.thetalib": A_IMPORTS_B,
      "/proj/b.thetalib": B_ILLEGAL,
    });
    expectSingleError(
      "C2-transitive",
      diags,
      TOP_LEVEL_CODE,
      "/proj/b.thetalib",
      topLevelMessage(),
    );
  });
});

// ===========================================================================
// C3 — transitive unknown import symbol.
// ===========================================================================

describe("bug 0304 C3 — a transitive lib's own import naming an absent symbol is batched", () => {
  const A_UNKNOWN = ['import { nope } from "./b.thetalib"', "fn af(x: integer): integer { x }", ""].join(
    "\n",
  );
  const B_OTHER = "fn other(x: integer): integer { x }\n";

  it(`GREEN (C3-control): a directly-imported absent symbol draws ${UNKNOWN_SYMBOL_CODE} sited on the theta`, async () => {
    const diags = await loadDiagnostics('import { nope } from "./b.thetalib"', {
      "/proj/b.thetalib": B_OTHER,
    });
    expectSingleError(
      "C3-control",
      diags,
      UNKNOWN_SYMBOL_CODE,
      "/proj/app.theta",
      unknownSymbolMessage("nope", "./b.thetalib"),
    );
  });

  it(`RED (C3-transitive): a transitive lib's own import of an absent symbol draws ${UNKNOWN_SYMBOL_CODE} sited on that lib`, async () => {
    const control = await loadDiagnostics('import { nope } from "./b.thetalib"', {
      "/proj/b.thetalib": B_OTHER,
    });
    expectSingleError(
      "C3-transitive control precondition",
      control,
      UNKNOWN_SYMBOL_CODE,
      "/proj/app.theta",
      unknownSymbolMessage("nope", "./b.thetalib"),
    );
    const diags = await loadDiagnostics('import { af } from "./a.thetalib"', {
      "/proj/a.thetalib": A_UNKNOWN,
      "/proj/b.thetalib": B_OTHER,
    });
    expectSingleError(
      "C3-transitive",
      diags,
      UNKNOWN_SYMBOL_CODE,
      "/proj/a.thetalib",
      unknownSymbolMessage("nope", "./b.thetalib"),
    );
  });
});

// ===========================================================================
// DEPTH-2 CHAIN — theta → a → b → c. Pins the post-walk batch sites: each of
// the three codes fires at depth 2, sited on the faulting LIB (never on `a` or
// the theta). A fix that resolves one hop only would pass C1–C3 and red here.
// Each cell asserts its depth-1 control GREEN first (same code, direct site).
// ===========================================================================

describe("bug 0304 depth-2 — a fault two hops down is batched, sited on the faulting lib", () => {
  const A_IMPORTS_B = ['import { bf } from "./b.thetalib"', "fn af(x: integer): integer { x }", ""].join(
    "\n",
  );

  it(`RED (depth2-IMP-1): b's unresolvable path draws ${UNRESOLVABLE_CODE} sited on /proj/b.thetalib`, async () => {
    const control = await loadDiagnostics('import { x } from "./missing.thetalib"', {});
    expectSingleError(
      "depth2-IMP-1 control precondition",
      control,
      UNRESOLVABLE_CODE,
      "/proj/app.theta",
      unresolvableMessage("./missing.thetalib"),
    );
    const diags = await loadDiagnostics('import { af } from "./a.thetalib"', {
      "/proj/a.thetalib": A_IMPORTS_B,
      "/proj/b.thetalib": [
        'import { cf } from "./c.thetalib"',
        "fn bf(x: integer): integer { x }",
        "",
      ].join("\n"),
    });
    expectSingleError(
      "depth2-IMP-1",
      diags,
      UNRESOLVABLE_CODE,
      "/proj/b.thetalib",
      unresolvableMessage("./c.thetalib"),
    );
  });

  it(`RED (depth2-parse): c's illegal top-level statement draws ${TOP_LEVEL_CODE} sited on /proj/c.thetalib`, async () => {
    const control = await loadDiagnostics('import { bf } from "./b.thetalib"', {
      "/proj/b.thetalib": ["let x = 3", "fn bf(x: integer): integer { x }", ""].join("\n"),
    });
    expectSingleError(
      "depth2-parse control precondition",
      control,
      TOP_LEVEL_CODE,
      "/proj/b.thetalib",
      topLevelMessage(),
    );
    const diags = await loadDiagnostics('import { af } from "./a.thetalib"', {
      "/proj/a.thetalib": A_IMPORTS_B,
      "/proj/b.thetalib": [
        'import { cf } from "./c.thetalib"',
        "fn bf(x: integer): integer { x }",
        "",
      ].join("\n"),
      "/proj/c.thetalib": ["let y = 5", "fn cf(x: integer): integer { x }", ""].join("\n"),
    });
    expectSingleError(
      "depth2-parse",
      diags,
      TOP_LEVEL_CODE,
      "/proj/c.thetalib",
      topLevelMessage(),
    );
  });

  it(`RED (depth2-unknown-symbol): b's import of an absent symbol draws ${UNKNOWN_SYMBOL_CODE} sited on /proj/b.thetalib`, async () => {
    const control = await loadDiagnostics('import { ghost } from "./c.thetalib"', {
      "/proj/c.thetalib": "fn other(x: integer): integer { x }\n",
    });
    expectSingleError(
      "depth2-unknown-symbol control precondition",
      control,
      UNKNOWN_SYMBOL_CODE,
      "/proj/app.theta",
      unknownSymbolMessage("ghost", "./c.thetalib"),
    );
    const diags = await loadDiagnostics('import { af } from "./a.thetalib"', {
      "/proj/a.thetalib": A_IMPORTS_B,
      "/proj/b.thetalib": [
        'import { ghost } from "./c.thetalib"',
        "fn bf(x: integer): integer { x }",
        "",
      ].join("\n"),
      "/proj/c.thetalib": "fn other(x: integer): integer { x }\n",
    });
    expectSingleError(
      "depth2-unknown-symbol",
      diags,
      UNKNOWN_SYMBOL_CODE,
      "/proj/b.thetalib",
      unknownSymbolMessage("ghost", "./c.thetalib"),
    );
  });
});

// ===========================================================================
// DIAMOND — theta → {a, a2} → b. Two directly-imported libs both import the
// same faulty b, and b is NEVER a direct decl of the theta itself. `walkThetaLib`
// reaches b through both parents, but its `walked` Set and `parseThetaLib`'s
// `parseCache` Map are keyed by resolved path, so the second parent's walk hits
// a cache/visited hit and never re-parses or re-walks b — the dedup here is
// settled before `registrationFilteredPaths` is ever consulted for b's path.
// This cell pins that per-resolved-path dedup: b's parse error fires ONCE, not
// once per parent.
// ===========================================================================

describe("bug 0304 diamond — a faulty lib shared by two parents is batched once", () => {
  const A_IMPORTS_B = ['import { bf } from "./b.thetalib"', "fn af(x: integer): integer { x }", ""].join(
    "\n",
  );
  const A2_IMPORTS_B = ['import { bf } from "./b.thetalib"', "fn a2f(x: integer): integer { x }", ""].join(
    "\n",
  );
  const B_ILLEGAL = ["let z = 1", "fn bf(x: integer): integer { x }", ""].join("\n");

  it(`RED (diamond-dedup): b reached through two parents draws ${TOP_LEVEL_CODE} exactly once`, async () => {
    // The theta imports a and a2; both import b, but b is never one of the
    // theta's own direct decls. `walkThetaLib`'s `walked` Set (and `parseThetaLib`'s
    // `parseCache`) key on b's resolved path, so the second parent's walk into b
    // is a no-op — b is parsed and its registration error filtered exactly once.
    // A fix that walked or filtered per parent rather than per resolved path
    // would red here with two `/proj/b.thetalib` rows. Turns green with the
    // transitive fix at the merge version 0.288.0.
    const diags = await loadDiagnostics(
      ['import { af } from "./a.thetalib"', 'import { a2f } from "./a2.thetalib"'].join("\n"),
      {
        "/proj/a.thetalib": A_IMPORTS_B,
        "/proj/a2.thetalib": A2_IMPORTS_B,
        "/proj/b.thetalib": B_ILLEGAL,
      },
    );
    expectSingleError(
      "diamond-dedup",
      diags,
      TOP_LEVEL_CODE,
      "/proj/b.thetalib",
      topLevelMessage(),
    );
  });
});

// ===========================================================================
// DIRECT+TRANSITIVE OVERLAP — theta → {a, b} directly AND theta → a → b.
// b is BOTH a direct decl of the theta and reached transitively through a, so
// this is the one cell that forces the `registrationFilteredPaths` two-site
// split (the diamond cell above is deduped earlier, by `walked` / `parseCache`,
// before that set is ever consulted).
//
// This is a DEDUP-REGRESSION GUARD, not a red-at-HEAD bug witness: at HEAD b is
// a direct decl, so the pre-fix inline per-direct-decl filter already pushed b's
// error exactly once and no post-walk pass existed to double it — the cell is
// green at HEAD. It reds only against a BROKEN version of this fix: drop the
// post-walk skip-guard and b's error fires twice; drop the inline push and it
// fires zero times for the transitive path. Either way != 1, so the cell pins
// that this fix's added post-walk pass does not re-push a lib the inline filter
// already recorded.
// ===========================================================================

describe("bug 0304 overlap — a lib that is both a direct decl and reached transitively is batched once", () => {
  const A_IMPORTS_B = ['import { bf } from "./b.thetalib"', "fn af(x: integer): integer { x }", ""].join(
    "\n",
  );
  const B_ILLEGAL = ["let z = 1", "fn bf(x: integer): integer { x }", ""].join("\n");

  it(`DEDUP-GUARD (overlap-dedup): b, direct AND transitive, draws ${TOP_LEVEL_CODE} exactly once and a's import of bf stays clean`, async () => {
    // The theta imports a first, then b directly; a also imports b. `walkThetaLib`
    // parses b while walking a's edges, then the decl loop reaches b as a direct
    // decl and the inline filter pushes b's registration error — recording b's
    // path in `registrationFilteredPaths` so the post-walk pass does not re-push
    // it. A dedup break in either direction fires this code 0 or 2 times, never 1.
    const diags = await loadDiagnostics(
      ['import { af } from "./a.thetalib"', 'import { bf } from "./b.thetalib"'].join("\n"),
      {
        "/proj/a.thetalib": A_IMPORTS_B,
        "/proj/b.thetalib": B_ILLEGAL,
      },
    );
    expectSingleError(
      "overlap-dedup",
      diags,
      TOP_LEVEL_CODE,
      "/proj/b.thetalib",
      topLevelMessage(),
    );
    // b DOES declare bf, so a's own `import { bf } from "./b.thetalib"` must draw
    // no unknown-symbol noise — the post-walk pass's IMP-3 check over a's own
    // specifiers must find bf and stay silent.
    expect(
      errorsWithCode(diags, UNKNOWN_SYMBOL_CODE),
      `overlap-dedup: a's own import of bf from b must not draw ${UNKNOWN_SYMBOL_CODE} — b declares bf. Rendered batch: ${JSON.stringify(render(diags))}`,
    ).toHaveLength(0);
  });
});
