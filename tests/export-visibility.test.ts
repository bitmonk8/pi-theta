import { describe, expect, it } from "vitest";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import {
  checkImportedSymbols,
  computeWarpExports,
  warpLocalBindings,
  IMPORT_UNKNOWN_SYMBOL_CODE,
  type ImportSpecifier,
  type ReExportSpecifier,
  type WarpDeclaration,
  type WarpModuleForms,
} from "../src/parser/imports";

// V15i-T — failing tests for the paired `V15i` "Imports — export visibility and
// re-exports" implementation.
//
// Spec: imports.md §"Visibility" + §"Re-exports". These three obligations carry
// no numbered REQ-ID; they are the code-keyed obligation area coverage-matrix.md
// records under token `cka-48` (auto-export of every top-level schema/enum/fn;
// the aliased `export … from` re-export that creates no local binding; the
// negative rule that a plain `import` is not re-exported downstream). Each test
// cites `cka-48` inline per the *Tests* code-citation discipline.
//
// These tests red because the V15i visibility bodies are absent: the V15i-T
// stub of `computeWarpExports` returns the WRONG set (the plain-import locals,
// which are precisely NOT downstream-visible) and omits the auto-exported
// declarations and the `export … from` re-exports that ARE, and the stub of
// `warpLocalBindings` returns the re-export SOURCE names (which a re-export does
// not bind locally). So each visibility assertion reds on its own primary
// assertion (a missing export, a wrongly-present export, a wrongly-present local
// binding, a missing / unexpected downstream diagnostic), not on a compile
// error, missing fixture, or harness throw.

/** A throwaway 1:1–1:2 span for the located specifiers. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function decl(kind: WarpDeclaration["kind"], name: string): WarpDeclaration {
  return { kind, name };
}

function reExport(
  source: string,
  exported: string,
  fromPath = "./x.warp",
): ReExportSpecifier {
  return { source, exported, fromPath, range: span() };
}

function plainImport(source: string, local = source): ImportSpecifier {
  return { source, local, range: span() };
}

// --- cka-48 — auto-export visibility ----------------------------------------

describe("V15i-T — cka-48 auto-export visibility", () => {
  it("cka-48: a top-level schema, enum, and fn are each exported with no `export` keyword", () => {
    // A `.warp` file with three bare top-level declarations and nothing else —
    // no `export` keyword, no privacy modifier (imports.md §Visibility).
    const forms: WarpModuleForms = {
      declarations: [
        decl("schema", "Author"),
        decl("enum", "Role"),
        decl("fn", "persona_block"),
      ],
      reExports: [],
      plainImports: [],
    };
    const exportsList = computeWarpExports(forms);
    // Each declaration is implicitly exported and therefore downstream-visible.
    expect(exportsList, "auto-exported schema").toContain("Author");
    expect(exportsList, "auto-exported enum").toContain("Role");
    expect(exportsList, "auto-exported fn").toContain("persona_block");
  });

  it("cka-48: an importing file resolves an auto-exported symbol with no diagnostic", () => {
    const forms: WarpModuleForms = {
      declarations: [
        decl("schema", "Author"),
        decl("enum", "Role"),
        decl("fn", "persona_block"),
      ],
      reExports: [],
      plainImports: [],
    };
    // The importer's `resolvedExports` come from the resolved `.warp` file's
    // computed export set — so a bare `import { Author, Role, persona_block }`
    // binds with no `import-unknown-symbol`.
    const diagnostics = checkImportedSymbols({
      file: "app.loom",
      specPath: "./personas.warp",
      specifiers: [
        plainImport("Author"),
        plainImport("Role"),
        plainImport("persona_block"),
      ],
      resolvedExports: computeWarpExports(forms),
      localTopLevelNames: [],
    });
    expect(
      diagnostics.filter((d) => d.code === IMPORT_UNKNOWN_SYMBOL_CODE),
      "an auto-exported symbol resolves with no unknown-symbol diagnostic",
    ).toHaveLength(0);
  });
});

// --- cka-48 — re-export with alias ------------------------------------------

describe("V15i-T — cka-48 aliased re-export", () => {
  it("cka-48: `export { A as B } from \"./x.warp\"` is visible downstream as B, not A", () => {
    const forms: WarpModuleForms = {
      declarations: [],
      reExports: [reExport("A", "B", "./x.warp")],
      plainImports: [],
    };
    const exportsList = computeWarpExports(forms);
    expect(exportsList, "the re-export is visible under its alias `B`").toContain(
      "B",
    );
    expect(
      exportsList,
      "the source name `A` is not itself re-exported (only the alias)",
    ).not.toContain("A");
  });

  it("cka-48: the aliased re-export creates no local binding for A (or B)", () => {
    const forms: WarpModuleForms = {
      declarations: [],
      reExports: [reExport("A", "B", "./x.warp")],
      plainImports: [],
    };
    const locals = warpLocalBindings(forms);
    // A re-export is a dedicated form that binds nothing locally (imports.md
    // §Re-exports): neither the source symbol `A` nor the alias `B` is a local
    // binding of the re-exporting file.
    expect(locals, "no local binding for the re-exported source `A`").not.toContain(
      "A",
    );
    expect(locals, "no local binding for the alias `B`").not.toContain("B");
  });

  it("cka-48: a downstream importer binds the aliased re-export as B with no diagnostic", () => {
    const reExporter: WarpModuleForms = {
      declarations: [],
      reExports: [reExport("A", "B", "./x.warp")],
      plainImports: [],
    };
    // A further downstream file `import { B } from "<re-exporting file>"` binds
    // because `B` is in the re-exporting file's computed export set.
    const diagnostics = checkImportedSymbols({
      file: "downstream.loom",
      specPath: "./reexporter.warp",
      specifiers: [plainImport("B")],
      resolvedExports: computeWarpExports(reExporter),
      localTopLevelNames: [],
    });
    expect(
      diagnostics.filter((d) => d.code === IMPORT_UNKNOWN_SYMBOL_CODE),
      "the alias `B` resolves downstream with no unknown-symbol diagnostic",
    ).toHaveLength(0);
  });
});

// --- cka-48 — a plain import is not re-exported -----------------------------

describe("V15i-T — cka-48 plain import is not re-exported", () => {
  it("cka-48: a plain `import { A }` does not add A to the importing file's exports", () => {
    const forms: WarpModuleForms = {
      declarations: [],
      reExports: [],
      plainImports: [plainImport("A")],
    };
    // Only declarations and explicit `export … from` forms are visible to
    // downstream importers — a plain `import` is not re-exported (imports.md
    // §Re-exports, negative half).
    expect(
      computeWarpExports(forms),
      "a plain import is not re-exported downstream",
    ).not.toContain("A");
  });

  it("cka-48: a further downstream `import { A }` from the re-importing file is an unknown symbol", () => {
    // The re-importing file plainly imports `A` and re-exports nothing.
    const reImporter: WarpModuleForms = {
      declarations: [],
      reExports: [],
      plainImports: [plainImport("A")],
    };
    // A downstream file `import { A } from "<re-importing file>"` sees `A` as
    // neither a declaration nor a re-export → `loom/parse/import-unknown-symbol`.
    const diagnostics = checkImportedSymbols({
      file: "downstream.loom",
      specPath: "./reimporter.warp",
      specifiers: [plainImport("A")],
      resolvedExports: computeWarpExports(reImporter),
      localTopLevelNames: [],
    });
    expect(
      diagnostics.find((d) => d.code === IMPORT_UNKNOWN_SYMBOL_CODE),
      "A is invisible downstream — a plain import is not re-exported",
    ).toBeDefined();
  });
});
