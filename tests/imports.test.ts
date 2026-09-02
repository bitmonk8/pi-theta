import { describe, expect, it } from "vitest";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import {
  checkImportExtension,
  checkImportedSymbols,
  checkThetaLibTopLevelForm,
  detectImportCycle,
  loadThetaLibImport,
  RelativeThetaLibResolver,
  UnresolvableThetaLibPathError,
  importCycleMessage,
  importNameCollisionMessage,
  importNonThetaLibExtensionMessage,
  importUnknownSymbolMessage,
  unresolvableThetaLibPathMessage,
  IMPORT_CYCLE_CODE,
  IMPORT_NAME_COLLISION_CODE,
  IMPORT_NON_THETALIB_EXTENSION_CODE,
  IMPORT_UNKNOWN_SYMBOL_CODE,
  UNRESOLVABLE_THETALIB_PATH_CODE,
  THETALIB_TOP_LEVEL_STATEMENT_CODE,
  THETALIB_TOP_LEVEL_STATEMENT_MESSAGE,
  type ImportCheckInput,
  type ImportSite,
  type Resolver,
  type ThetaLibDirectoryProbe,
  type ThetaLibImportGraph,
} from "../src/parser/imports";

// V15c-T — failing tests for the paired `V15c` "Imports (`.thetalib` library
// files)" implementation.
//
// Spec: imports.md — the `.thetalib` file rules (permitted top-level forms), the
// `.thetalib`-only path resolution through the named `Resolver` seam, the IMP-1
// resolver failure contract, and the import-cycle / unknown-symbol /
// name-collision diagnostics.
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-parse.md, diagnostics/code-registry-load.md) per
// the *Diagnostic message anchors* rule.
//
// These tests red because the V15c resolution / diagnostic bodies are absent:
// `checkImportExtension` / `checkThetaLibTopLevelForm` / `detectImportCycle` return
// `undefined`, `checkImportedSymbols` returns `[]`, `RelativeThetaLibResolver.resolve`
// returns `""` (never throwing, never resolving), and `loadThetaLibImport` reports a
// registered file with no diagnostic. Each test reds on its own primary
// assertion (a missing throw, a missing diagnostic, an unresolved path, a
// wrongly-registered file), not on a compile error, missing fixture, or harness
// throw.

/** A throwaway 1:1–1:2 span for the located sites. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function site(file = "app.theta"): ImportSite {
  return { file, range: span() };
}

/**
 * A byte-for-byte directory probe double. `dirs` maps a directory path to its
 * exact entry names; `unreadable` names `<dir>/<name>` entries that exist
 * byte-exact but are not readable.
 */
function probe(
  dirs: Readonly<Record<string, readonly string[]>>,
  unreadable: ReadonlySet<string> = new Set(),
): ThetaLibDirectoryProbe {
  return {
    entries(dir: string): readonly string[] {
      const entries = dirs[dir];
      if (entries === undefined) {
        throw new UnresolvableThetaLibPathError(dir);
      }
      return entries;
    },
    entryReadable(dir: string, name: string): boolean {
      return !unreadable.has(`${dir}/${name}`);
    },
    // The in-memory fake paths have no real disk, so the canonical form is the
    // path itself (identity) — this changes no existing assertion.
    canonicalize(path: string): string {
      return path;
    },
  };
}

// --- IMP-1 — resolver failure contract --------------------------------------

describe("V15c-T — IMP-1 resolver failure contract", () => {
  it("IMP-1: a non-relative spec is unresolvable — the Resolver signals by throwing", () => {
    // A package-style spec is rejected by the relative-path resolver; the probe
    // is never consulted.
    const resolver = new RelativeThetaLibResolver(probe({}));
    expect(() => resolver.resolve("@scope/pkg.thetalib", "/proj/app.theta")).toThrow(
      UnresolvableThetaLibPathError,
    );
  });

  it("IMP-1: no byte-exact final-segment entry is unresolvable (a case-variant entry does not match)", () => {
    // The directory holds `Personas.thetalib`; the literal says `personas.thetalib`.
    // The byte-exact rule rejects on every host regardless of filesystem
    // case-equivalence.
    const resolver = new RelativeThetaLibResolver(
      probe({ "/proj/shared": ["Personas.thetalib"] }),
    );
    expect(() =>
      resolver.resolve("./shared/personas.thetalib", "/proj/app.theta"),
    ).toThrow(UnresolvableThetaLibPathError);
  });

  it("IMP-1: a byte-exact entry that is not readable is unresolvable", () => {
    const resolver = new RelativeThetaLibResolver(
      probe(
        { "/proj/shared": ["personas.thetalib"] },
        new Set(["/proj/shared/personas.thetalib"]),
      ),
    );
    expect(() =>
      resolver.resolve("./shared/personas.thetalib", "/proj/app.theta"),
    ).toThrow(UnresolvableThetaLibPathError);
  });

  it("IMP-1: a throw from `resolve` emits theta/load/unresolvable-thetalib-path and the file is not registered", () => {
    // A resolver double that throws on every spec, so this test pins the load
    // pipeline's failure contract independent of the relative resolver.
    const throwing: Resolver = {
      resolve(spec: string): string {
        throw new UnresolvableThetaLibPathError(spec);
      },
    };
    const load = loadThetaLibImport(
      throwing,
      "@scope/pkg.thetalib",
      "/proj/app.theta",
      site(),
    );
    const diag = load.diagnostics.find(
      (d) => d.code === UNRESOLVABLE_THETALIB_PATH_CODE,
    );
    expect(diag, "theta/load/unresolvable-thetalib-path").toBeDefined();
    // Registry Message (code-registry-load.md), `<path>` rendered as written.
    expect(diag?.message).toBe(
      unresolvableThetaLibPathMessage("@scope/pkg.thetalib"),
    );
    expect(diag?.message).toBe("cannot resolve .thetalib import '@scope/pkg.thetalib'");
    expect(load.registered, "the importing file is not registered").toBe(false);
  });
});

// --- theta/parse/thetalib-top-level-statement ------------------------------------

describe("V15c-T — permitted `.thetalib` top-level forms", () => {
  it("theta/parse/thetalib-top-level-statement: a top-level statement fires", () => {
    const diag = checkThetaLibTopLevelForm("statement", site("lib.thetalib"));
    expect(diag, "theta/parse/thetalib-top-level-statement").toBeDefined();
    expect(diag?.code).toBe(THETALIB_TOP_LEVEL_STATEMENT_CODE);
    // Registry Message (code-registry-parse.md).
    expect(diag?.message).toBe(THETALIB_TOP_LEVEL_STATEMENT_MESSAGE);
    expect(diag?.message).toBe(
      "top-level statement not permitted in .thetalib file; move into a fn body",
    );
  });

  it("theta/parse/thetalib-top-level-statement: a top-level `let` binding and a top-level query both fire", () => {
    expect(
      checkThetaLibTopLevelForm("let", site("lib.thetalib")),
      "top-level let",
    ).toBeDefined();
    expect(
      checkThetaLibTopLevelForm("query", site("lib.thetalib")),
      "top-level query",
    ).toBeDefined();
  });

  it("theta/parse/thetalib-top-level-statement: the permitted forms (import/export/schema/enum/fn) do not fire", () => {
    for (const form of ["import", "export", "schema", "enum", "fn"] as const) {
      expect(
        checkThetaLibTopLevelForm(form, site("lib.thetalib")),
        `permitted form: ${form}`,
      ).toBeUndefined();
    }
  });
});

// --- theta/parse/import-non-thetalib-extension -----------------------------------

describe("V15c-T — import path extension (byte-exact lowercase .thetalib)", () => {
  it("theta/parse/import-non-thetalib-extension: a .theta-suffixed import path fires", () => {
    const diag = checkImportExtension("./shared/personas.theta", site());
    expect(diag, "theta/parse/import-non-thetalib-extension (.theta)").toBeDefined();
    expect(diag?.code).toBe(IMPORT_NON_THETALIB_EXTENSION_CODE);
    // Registry Message (code-registry-parse.md), `<path>` as written.
    expect(diag?.message).toBe(
      importNonThetaLibExtensionMessage("./shared/personas.theta"),
    );
    expect(diag?.message).toBe(
      "import path './shared/personas.theta' does not end in .thetalib",
    );
  });

  it("theta/parse/import-non-thetalib-extension: a non-lowercase .THETALIB variant fires (byte-exact lowercase, every host)", () => {
    // `.THETALIB` is not byte-exact lowercase `.thetalib`, so it rejects identically on
    // case-sensitive and case-insensitive hosts.
    const diag = checkImportExtension("./shared/personas.THETALIB", site());
    expect(diag, "theta/parse/import-non-thetalib-extension (.THETALIB)").toBeDefined();
    expect(diag?.code).toBe(IMPORT_NON_THETALIB_EXTENSION_CODE);
    expect(diag?.message).toBe(
      "import path './shared/personas.THETALIB' does not end in .thetalib",
    );
  });

  it("theta/parse/import-non-thetalib-extension: a byte-exact lowercase .thetalib path does not fire", () => {
    expect(
      checkImportExtension("./shared/personas.thetalib", site()),
    ).toBeUndefined();
  });
});

// --- theta/load/import-cycle -------------------------------------------------

describe("V15c-T — import cycle detection", () => {
  it("theta/load/import-cycle: a `.thetalib` static-graph cycle fires with its path printed", () => {
    // a.thetalib imports b.thetalib, b.thetalib imports a.thetalib.
    const graph: ThetaLibImportGraph = {
      edges: new Map<string, readonly string[]>([
        ["a", ["b"]],
        ["b", ["a"]],
      ]),
    };
    const diag = detectImportCycle("a", graph, site("a.thetalib"));
    expect(diag, "theta/load/import-cycle").toBeDefined();
    expect(diag?.code).toBe(IMPORT_CYCLE_CODE);
    // Registry Message (code-registry-load.md): the cycle path, first stem
    // repeated at the end, each stem suffixed `.thetalib`.
    expect(diag?.message).toBe(importCycleMessage(["a", "b", "a"]));
    expect(diag?.message).toBe("import cycle: a.thetalib → b.thetalib → a.thetalib");
  });

  it("theta/load/import-cycle: an acyclic `.thetalib` graph does not fire", () => {
    const graph: ThetaLibImportGraph = {
      edges: new Map<string, readonly string[]>([
        ["a", ["b"]],
        ["b", []],
      ]),
    };
    expect(detectImportCycle("a", graph, site("a.thetalib"))).toBeUndefined();
  });
});

// --- theta/parse/import-unknown-symbol ---------------------------------------

describe("V15c-T — unknown imported symbol", () => {
  it("theta/parse/import-unknown-symbol: a specifier naming an undeclared symbol fires, naming the source (not the alias)", () => {
    const input: ImportCheckInput = {
      file: "app.theta",
      specPath: "./personas.thetalib",
      // `Foo` is imported under alias `Bar`; the resolved file declares only `Author`.
      specifiers: [{ source: "Foo", local: "Bar", range: span() }],
      resolvedExports: ["Author"],
      localTopLevelNames: [],
    };
    const diags = checkImportedSymbols(input);
    const diag = diags.find((d) => d.code === IMPORT_UNKNOWN_SYMBOL_CODE);
    expect(diag, "theta/parse/import-unknown-symbol").toBeDefined();
    // Registry Message (code-registry-parse.md): names the SOURCE symbol `Foo`,
    // not the alias `Bar`, and renders `<path>` as written.
    expect(diag?.message).toBe(
      importUnknownSymbolMessage("Foo", "./personas.thetalib"),
    );
    expect(diag?.message).toBe(
      "imported symbol 'Foo' is not declared or re-exported by './personas.thetalib'",
    );
  });
});

// --- theta/parse/import-name-collision ---------------------------------------

describe("V15c-T — import name collision", () => {
  it("theta/parse/import-name-collision: two imports binding the same local name fire", () => {
    const input: ImportCheckInput = {
      file: "app.theta",
      specPath: "./team.thetalib",
      specifiers: [
        { source: "Author", local: "Author", range: span() },
        { source: "Author", local: "Author", range: span() },
      ],
      resolvedExports: ["Author"],
      localTopLevelNames: [],
    };
    const diag = checkImportedSymbols(input).find(
      (d) => d.code === IMPORT_NAME_COLLISION_CODE,
    );
    expect(diag, "theta/parse/import-name-collision (two imports)").toBeDefined();
    expect(diag?.message).toBe(importNameCollisionMessage("Author"));
    expect(diag?.message).toBe(
      "imported symbol 'Author' collides with another import or top-level declaration",
    );
  });

  it("theta/parse/import-name-collision: an import colliding with a same-file top-level declaration fires", () => {
    const input: ImportCheckInput = {
      file: "app.theta",
      specPath: "./personas.thetalib",
      specifiers: [{ source: "Author", local: "Author", range: span() }],
      resolvedExports: ["Author"],
      localTopLevelNames: ["Author"],
    };
    const diag = checkImportedSymbols(input).find(
      (d) => d.code === IMPORT_NAME_COLLISION_CODE,
    );
    expect(
      diag,
      "theta/parse/import-name-collision (same-file top-level)",
    ).toBeDefined();
  });
});

// --- Resolver success path (complements the IMP-1 throw test) ---------------

describe("V15c-T — resolver success path", () => {
  it("a resolvable relative `.thetalib` import resolves and binds its symbols", () => {
    const resolver = new RelativeThetaLibResolver(
      probe({ "/proj/shared": ["personas.thetalib"] }),
    );
    // Relative resolution joins the spec against the importing file's directory.
    const resolved = resolver.resolve(
      "./shared/personas.thetalib",
      "/proj/app.theta",
    );
    expect(resolved, "the resolved `.thetalib` path").toBe(
      "/proj/shared/personas.thetalib",
    );

    // The load pipeline registers the file and carries the resolved path.
    const load = loadThetaLibImport(
      resolver,
      "./shared/personas.thetalib",
      "/proj/app.theta",
      site(),
    );
    expect(load.registered, "the importing file is registered").toBe(true);
    expect(load.resolvedPath, "the resolved path is carried").toBe(
      "/proj/shared/personas.thetalib",
    );
    expect(
      load.diagnostics.filter((d: Diagnostic) => d.severity === "error"),
      "no error diagnostic on the success path",
    ).toHaveLength(0);

    // A known imported symbol binds with no diagnostic.
    const bind = checkImportedSymbols({
      file: "app.theta",
      specPath: "./shared/personas.thetalib",
      specifiers: [{ source: "Author", local: "Author", range: span() }],
      resolvedExports: ["Author", "persona_block"],
      localTopLevelNames: [],
    });
    expect(bind, "a known symbol binds with no diagnostic").toHaveLength(0);
  });
});
