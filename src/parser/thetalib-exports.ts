// ── V15i / V15i-T — export visibility and re-exports ─────────────────────────
//
// The `.thetalib` export-visibility semantics layered on V15c's resolution
// (imports.md §"Visibility" + §"Re-exports", coverage-matrix code-keyed-area
// token `cka-48`): every top-level `schema`/`enum`/`fn` is implicitly exported
// (no `export` keyword, no privacy modifier); an aliased `export … from` re-export
// is visible downstream as its alias while creating NO local binding for the
// re-exported source symbol; and a plain `import` is NOT re-exported downstream.

import type { SourceRange } from "../diagnostics/diagnostic";
import type { ImportSpecifier } from "./imports";

/** A top-level `.thetalib` declaration kind — each is implicitly exported (imports.md §Visibility). */
export type ThetaLibDeclarationKind = "schema" | "enum" | "fn";

/** A top-level `schema`/`enum`/`fn` declaration in a `.thetalib` file (auto-exported). */
export interface ThetaLibDeclaration {
  readonly kind: ThetaLibDeclarationKind;
  readonly name: string;
}

/**
 * An `export { A as B } from "./x.thetalib"` re-export form. Visible downstream as
 * `exported` (the `as` alias, or `source` when unaliased) and creating NO local
 * binding for `source` in the re-exporting file (imports.md §Re-exports).
 */
export interface ReExportSpecifier {
  /** The symbol as named in the re-exported-from `.thetalib` file (the source symbol). */
  readonly source: string;
  /** The downstream-visible name — the `as` alias, or `source` when unaliased. */
  readonly exported: string;
  /** The `.thetalib` path being re-exported from (as written). */
  readonly fromPath: string;
  readonly range: SourceRange;
}

/**
 * The top-level forms of one `.thetalib` module that bear on downstream visibility:
 * its auto-exported declarations, its `export … from` re-exports, and its plain
 * `import` specifiers (which bind locally but are NOT re-exported).
 */
export interface ThetaLibModuleForms {
  readonly declarations: readonly ThetaLibDeclaration[];
  readonly reExports: readonly ReExportSpecifier[];
  readonly plainImports: readonly ImportSpecifier[];
}

/**
 * Compute the set of names a `.thetalib` module makes visible to a downstream
 * importer (imports.md §Visibility + §Re-exports): every top-level declaration
 * name (auto-exported) plus every `export … from` re-export's downstream name
 * (`exported`); a plain `import` local is NOT included. This is exactly the
 * `resolvedExports` list `checkImportedSymbols` matches an importing specifier
 * against.
 *
 * Every top-level declaration is auto-exported (no `export` keyword, no privacy
 * modifier) and every `export … from` re-export is visible under its downstream
 * name (`exported`); a plain `import` local is excluded — a plain import is not
 * re-exported downstream (imports.md §Re-exports, negative half).
 */
export function computeThetaLibExports(forms: ThetaLibModuleForms): readonly string[] {
  return [
    ...forms.declarations.map((declaration) => declaration.name),
    ...forms.reExports.map((reExport) => reExport.exported),
  ];
}

/**
 * The names a `.thetalib` module binds locally: its top-level declarations plus its
 * plain `import` locals. An `export … from` re-export creates NO local binding
 * for its source symbol, so re-export sources are excluded (imports.md
 * §Re-exports — "a dedicated form that creates no local binding").
 *
 * A top-level declaration binds its own name locally and a plain `import` binds
 * its local (`as` alias or source name); an `export … from` re-export creates NO
 * local binding for its source symbol (imports.md §Re-exports — "a dedicated
 * form that creates no local binding"), so re-export sources are excluded.
 */
export function thetalibLocalBindings(forms: ThetaLibModuleForms): readonly string[] {
  return [
    ...forms.declarations.map((declaration) => declaration.name),
    ...forms.plainImports.map((specifier) => specifier.local),
  ];
}
