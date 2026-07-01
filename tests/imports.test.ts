import { describe, expect, it } from "vitest";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import {
  checkImportExtension,
  checkImportedSymbols,
  checkWarpTopLevelForm,
  detectImportCycle,
  loadWarpImport,
  RelativeWarpResolver,
  UnresolvableWarpPathError,
  importCycleMessage,
  importNameCollisionMessage,
  importNonWarpExtensionMessage,
  importUnknownSymbolMessage,
  unresolvableWarpPathMessage,
  IMPORT_CYCLE_CODE,
  IMPORT_NAME_COLLISION_CODE,
  IMPORT_NON_WARP_EXTENSION_CODE,
  IMPORT_UNKNOWN_SYMBOL_CODE,
  UNRESOLVABLE_WARP_PATH_CODE,
  WARP_TOP_LEVEL_STATEMENT_CODE,
  WARP_TOP_LEVEL_STATEMENT_MESSAGE,
  type ImportCheckInput,
  type ImportSite,
  type Resolver,
  type WarpDirectoryProbe,
  type WarpImportGraph,
} from "../src/parser/imports";

// V15c-T — failing tests for the paired `V15c` "Imports (`.warp` library
// files)" implementation.
//
// Spec: imports.md — the `.warp` file rules (permitted top-level forms), the
// `.warp`-only path resolution through the named `Resolver` seam, the IMP-1
// resolver failure contract, and the import-cycle / unknown-symbol /
// name-collision diagnostics.
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-parse.md, diagnostics/code-registry-load.md) per
// the *Diagnostic message anchors* rule.
//
// These tests red because the V15c resolution / diagnostic bodies are absent:
// `checkImportExtension` / `checkWarpTopLevelForm` / `detectImportCycle` return
// `undefined`, `checkImportedSymbols` returns `[]`, `RelativeWarpResolver.resolve`
// returns `""` (never throwing, never resolving), and `loadWarpImport` reports a
// registered file with no diagnostic. Each test reds on its own primary
// assertion (a missing throw, a missing diagnostic, an unresolved path, a
// wrongly-registered file), not on a compile error, missing fixture, or harness
// throw.

/** A throwaway 1:1–1:2 span for the located sites. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function site(file = "app.loom"): ImportSite {
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
): WarpDirectoryProbe {
  return {
    entries(dir: string): readonly string[] {
      const entries = dirs[dir];
      if (entries === undefined) {
        throw new UnresolvableWarpPathError(dir);
      }
      return entries;
    },
    entryReadable(dir: string, name: string): boolean {
      return !unreadable.has(`${dir}/${name}`);
    },
  };
}

// --- IMP-1 — resolver failure contract --------------------------------------

describe("V15c-T — IMP-1 resolver failure contract", () => {
  it("IMP-1: a non-relative spec is unresolvable — the Resolver signals by throwing", () => {
    // A package-style spec is rejected by the relative-path resolver; the probe
    // is never consulted.
    const resolver = new RelativeWarpResolver(probe({}));
    expect(() => resolver.resolve("@scope/pkg.warp", "/proj/app.loom")).toThrow(
      UnresolvableWarpPathError,
    );
  });

  it("IMP-1: no byte-exact final-segment entry is unresolvable (a case-variant entry does not match)", () => {
    // The directory holds `Personas.warp`; the literal says `personas.warp`.
    // The byte-exact rule rejects on every host regardless of filesystem
    // case-equivalence.
    const resolver = new RelativeWarpResolver(
      probe({ "/proj/shared": ["Personas.warp"] }),
    );
    expect(() =>
      resolver.resolve("./shared/personas.warp", "/proj/app.loom"),
    ).toThrow(UnresolvableWarpPathError);
  });

  it("IMP-1: a byte-exact entry that is not readable is unresolvable", () => {
    const resolver = new RelativeWarpResolver(
      probe(
        { "/proj/shared": ["personas.warp"] },
        new Set(["/proj/shared/personas.warp"]),
      ),
    );
    expect(() =>
      resolver.resolve("./shared/personas.warp", "/proj/app.loom"),
    ).toThrow(UnresolvableWarpPathError);
  });

  it("IMP-1: a throw from `resolve` emits loom/load/unresolvable-warp-path and the file is not registered", () => {
    // A resolver double that throws on every spec, so this test pins the load
    // pipeline's failure contract independent of the relative resolver.
    const throwing: Resolver = {
      resolve(spec: string): string {
        throw new UnresolvableWarpPathError(spec);
      },
    };
    const load = loadWarpImport(
      throwing,
      "@scope/pkg.warp",
      "/proj/app.loom",
      site(),
    );
    const diag = load.diagnostics.find(
      (d) => d.code === UNRESOLVABLE_WARP_PATH_CODE,
    );
    expect(diag, "loom/load/unresolvable-warp-path").toBeDefined();
    // Registry Message (code-registry-load.md), `<path>` rendered as written.
    expect(diag?.message).toBe(
      unresolvableWarpPathMessage("@scope/pkg.warp"),
    );
    expect(diag?.message).toBe("cannot resolve .warp import '@scope/pkg.warp'");
    expect(load.registered, "the importing file is not registered").toBe(false);
  });
});

// --- loom/parse/warp-top-level-statement ------------------------------------

describe("V15c-T — permitted `.warp` top-level forms", () => {
  it("loom/parse/warp-top-level-statement: a top-level statement fires", () => {
    const diag = checkWarpTopLevelForm("statement", site("lib.warp"));
    expect(diag, "loom/parse/warp-top-level-statement").toBeDefined();
    expect(diag?.code).toBe(WARP_TOP_LEVEL_STATEMENT_CODE);
    // Registry Message (code-registry-parse.md).
    expect(diag?.message).toBe(WARP_TOP_LEVEL_STATEMENT_MESSAGE);
    expect(diag?.message).toBe(
      "top-level statement not permitted in .warp file; move into a fn body",
    );
  });

  it("loom/parse/warp-top-level-statement: a top-level `let` binding and a top-level query both fire", () => {
    expect(
      checkWarpTopLevelForm("let", site("lib.warp")),
      "top-level let",
    ).toBeDefined();
    expect(
      checkWarpTopLevelForm("query", site("lib.warp")),
      "top-level query",
    ).toBeDefined();
  });

  it("loom/parse/warp-top-level-statement: the permitted forms (import/export/schema/enum/fn) do not fire", () => {
    for (const form of ["import", "export", "schema", "enum", "fn"] as const) {
      expect(
        checkWarpTopLevelForm(form, site("lib.warp")),
        `permitted form: ${form}`,
      ).toBeUndefined();
    }
  });
});

// --- loom/parse/import-non-warp-extension -----------------------------------

describe("V15c-T — import path extension (byte-exact lowercase .warp)", () => {
  it("loom/parse/import-non-warp-extension: a .loom-suffixed import path fires", () => {
    const diag = checkImportExtension("./shared/personas.loom", site());
    expect(diag, "loom/parse/import-non-warp-extension (.loom)").toBeDefined();
    expect(diag?.code).toBe(IMPORT_NON_WARP_EXTENSION_CODE);
    // Registry Message (code-registry-parse.md), `<path>` as written.
    expect(diag?.message).toBe(
      importNonWarpExtensionMessage("./shared/personas.loom"),
    );
    expect(diag?.message).toBe(
      "import path './shared/personas.loom' does not end in .warp",
    );
  });

  it("loom/parse/import-non-warp-extension: a non-lowercase .WARP variant fires (byte-exact lowercase, every host)", () => {
    // `.WARP` is not byte-exact lowercase `.warp`, so it rejects identically on
    // case-sensitive and case-insensitive hosts.
    const diag = checkImportExtension("./shared/personas.WARP", site());
    expect(diag, "loom/parse/import-non-warp-extension (.WARP)").toBeDefined();
    expect(diag?.code).toBe(IMPORT_NON_WARP_EXTENSION_CODE);
    expect(diag?.message).toBe(
      "import path './shared/personas.WARP' does not end in .warp",
    );
  });

  it("loom/parse/import-non-warp-extension: a byte-exact lowercase .warp path does not fire", () => {
    expect(
      checkImportExtension("./shared/personas.warp", site()),
    ).toBeUndefined();
  });
});

// --- loom/load/import-cycle -------------------------------------------------

describe("V15c-T — import cycle detection", () => {
  it("loom/load/import-cycle: a `.warp` static-graph cycle fires with its path printed", () => {
    // a.warp imports b.warp, b.warp imports a.warp.
    const graph: WarpImportGraph = {
      edges: new Map<string, readonly string[]>([
        ["a", ["b"]],
        ["b", ["a"]],
      ]),
    };
    const diag = detectImportCycle("a", graph, site("a.warp"));
    expect(diag, "loom/load/import-cycle").toBeDefined();
    expect(diag?.code).toBe(IMPORT_CYCLE_CODE);
    // Registry Message (code-registry-load.md): the cycle path, first stem
    // repeated at the end, each stem suffixed `.warp`.
    expect(diag?.message).toBe(importCycleMessage(["a", "b", "a"]));
    expect(diag?.message).toBe("import cycle: a.warp → b.warp → a.warp");
  });

  it("loom/load/import-cycle: an acyclic `.warp` graph does not fire", () => {
    const graph: WarpImportGraph = {
      edges: new Map<string, readonly string[]>([
        ["a", ["b"]],
        ["b", []],
      ]),
    };
    expect(detectImportCycle("a", graph, site("a.warp"))).toBeUndefined();
  });
});

// --- loom/parse/import-unknown-symbol ---------------------------------------

describe("V15c-T — unknown imported symbol", () => {
  it("loom/parse/import-unknown-symbol: a specifier naming an undeclared symbol fires, naming the source (not the alias)", () => {
    const input: ImportCheckInput = {
      file: "app.loom",
      specPath: "./personas.warp",
      // `Foo` is imported under alias `Bar`; the resolved file declares only `Author`.
      specifiers: [{ source: "Foo", local: "Bar", range: span() }],
      resolvedExports: ["Author"],
      localTopLevelNames: [],
    };
    const diags = checkImportedSymbols(input);
    const diag = diags.find((d) => d.code === IMPORT_UNKNOWN_SYMBOL_CODE);
    expect(diag, "loom/parse/import-unknown-symbol").toBeDefined();
    // Registry Message (code-registry-parse.md): names the SOURCE symbol `Foo`,
    // not the alias `Bar`, and renders `<path>` as written.
    expect(diag?.message).toBe(
      importUnknownSymbolMessage("Foo", "./personas.warp"),
    );
    expect(diag?.message).toBe(
      "imported symbol 'Foo' is not declared or re-exported by './personas.warp'",
    );
  });
});

// --- loom/parse/import-name-collision ---------------------------------------

describe("V15c-T — import name collision", () => {
  it("loom/parse/import-name-collision: two imports binding the same local name fire", () => {
    const input: ImportCheckInput = {
      file: "app.loom",
      specPath: "./team.warp",
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
    expect(diag, "loom/parse/import-name-collision (two imports)").toBeDefined();
    expect(diag?.message).toBe(importNameCollisionMessage("Author"));
    expect(diag?.message).toBe(
      "imported symbol 'Author' collides with another import or top-level declaration",
    );
  });

  it("loom/parse/import-name-collision: an import colliding with a same-file top-level declaration fires", () => {
    const input: ImportCheckInput = {
      file: "app.loom",
      specPath: "./personas.warp",
      specifiers: [{ source: "Author", local: "Author", range: span() }],
      resolvedExports: ["Author"],
      localTopLevelNames: ["Author"],
    };
    const diag = checkImportedSymbols(input).find(
      (d) => d.code === IMPORT_NAME_COLLISION_CODE,
    );
    expect(
      diag,
      "loom/parse/import-name-collision (same-file top-level)",
    ).toBeDefined();
  });
});

// --- Resolver success path (complements the IMP-1 throw test) ---------------

describe("V15c-T — resolver success path", () => {
  it("a resolvable relative `.warp` import resolves and binds its symbols", () => {
    const resolver = new RelativeWarpResolver(
      probe({ "/proj/shared": ["personas.warp"] }),
    );
    // Relative resolution joins the spec against the importing file's directory.
    const resolved = resolver.resolve(
      "./shared/personas.warp",
      "/proj/app.loom",
    );
    expect(resolved, "the resolved `.warp` path").toBe(
      "/proj/shared/personas.warp",
    );

    // The load pipeline registers the file and carries the resolved path.
    const load = loadWarpImport(
      resolver,
      "./shared/personas.warp",
      "/proj/app.loom",
      site(),
    );
    expect(load.registered, "the importing file is registered").toBe(true);
    expect(load.resolvedPath, "the resolved path is carried").toBe(
      "/proj/shared/personas.warp",
    );
    expect(
      load.diagnostics.filter((d: Diagnostic) => d.severity === "error"),
      "no error diagnostic on the success path",
    ).toHaveLength(0);

    // A known imported symbol binds with no diagnostic.
    const bind = checkImportedSymbols({
      file: "app.loom",
      specPath: "./shared/personas.warp",
      specifiers: [{ source: "Author", local: "Author", range: span() }],
      resolvedExports: ["Author", "persona_block"],
      localTopLevelNames: [],
    });
    expect(bind, "a known symbol binds with no diagnostic").toHaveLength(0);
  });
});
