// V15c / V15c-T — `.thetalib` import resolution and diagnostics.
//
// This module owns the `.thetalib` import path's parse-phase checks: the
// permitted top-level forms (`import`/`export`/`schema`/`enum`/`fn`) and the
// related parse- and load-phase diagnostics; it re-exports the resolver seam
// from `thetalib-resolver`, the cycle detector from `import-cycle`, and
// visibility helpers from `thetalib-exports`.
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-parse.md, diagnostics/code-registry-load.md) per
// the *Diagnostic message anchors* rule; `<path>` / `<name>` placeholders are
// rendered per diagnostics/placeholder-rendering-b.md (the path-literal text as
// written, no realpath normalisation).

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import { isReservedSynthesisedName } from "./synthesised-names";

/** A located `import` / `export … from` / top-level-form site. */
export interface ImportSite {
  readonly file: string;
  readonly range: SourceRange;
}

// ── theta/parse/thetalib-top-level-statement ─────────────────────────────────────

export const THETALIB_TOP_LEVEL_STATEMENT_CODE = "theta/parse/thetalib-top-level-statement";
export const THETALIB_TOP_LEVEL_STATEMENT_MESSAGE =
  "top-level statement not permitted in .thetalib file; move into a fn body";
export const THETALIB_TOP_LEVEL_STATEMENT_HINT = "Move the code into a fn body.";

/**
 * A `.thetalib` top-level form. The permitted forms are `import`, `export`,
 * `schema`, `enum`, and `fn`; any other top-level form — a bare statement, a
 * `let` binding, or a query — is `theta/parse/thetalib-top-level-statement`
 * (imports.md §"`.thetalib` file rules").
 */
export type ThetaLibTopLevelForm =
  | "import"
  | "export"
  | "schema"
  | "enum"
  | "fn"
  | "let"
  | "statement"
  | "query";

/** The five forms a `.thetalib` top level may contain (imports.md §"`.thetalib` file rules"). */
const PERMITTED_THETALIB_TOP_LEVEL_FORMS: ReadonlySet<ThetaLibTopLevelForm> = new Set([
  "import",
  "export",
  "schema",
  "enum",
  "fn",
]);

/**
 * Check a `.thetalib` file's top-level form, returning
 * `theta/parse/thetalib-top-level-statement` for a non-permitted form and
 * `undefined` for a permitted one.
 */
export function checkThetaLibTopLevelForm(
  form: ThetaLibTopLevelForm,
  site: ImportSite,
): Diagnostic | undefined {
  if (PERMITTED_THETALIB_TOP_LEVEL_FORMS.has(form)) {
    return undefined;
  }
  return {
    severity: "error",
    code: THETALIB_TOP_LEVEL_STATEMENT_CODE,
    file: site.file,
    range: site.range,
    message: THETALIB_TOP_LEVEL_STATEMENT_MESSAGE,
    hint: THETALIB_TOP_LEVEL_STATEMENT_HINT,
  };
}

// ── theta/parse/export-in-theta ──────────────────────────────────────────────────

export const EXPORT_IN_THETA_CODE = "theta/parse/export-in-theta";
export const EXPORT_IN_THETA_MESSAGE =
  "a from-bearing 'export … from' is not permitted at a .theta top level; a .theta file is not importable, so its export is never read";
export const EXPORT_IN_THETA_HINT =
  ".theta files are not importable — remove the `from` clause or move this export into a .thetalib.";

// ── theta/parse/export-not-top-level ─────────────────────────────────────────

export const EXPORT_NOT_TOP_LEVEL_CODE = "theta/parse/export-not-top-level";
export const EXPORT_NOT_TOP_LEVEL_MESSAGE =
  "a from-bearing 'export … from' is only permitted at a .thetalib top level; nested in a fn/if body it is never read";
export const EXPORT_NOT_TOP_LEVEL_HINT = "Move the export to the .thetalib top level.";

// ── theta/parse/import-not-top-level ─────────────────────────────────────────

export const IMPORT_NOT_TOP_LEVEL_CODE = "theta/parse/import-not-top-level";
export const IMPORT_NOT_TOP_LEVEL_MESSAGE =
  "an 'import … from' is only permitted at the top level; nested in a fn/if body it is never resolved or bound";
export const IMPORT_NOT_TOP_LEVEL_HINT = "Move the import to the top level of the file.";

// ── theta/parse/import-non-thetalib-extension ────────────────────────────────────

export const IMPORT_NON_THETALIB_EXTENSION_CODE = "theta/parse/import-non-thetalib-extension";
export const IMPORT_NON_THETALIB_EXTENSION_HINT =
  "import paths must end in `.thetalib`; `.theta` files are not importable — use `invoke(...)` instead.";

/** `theta/parse/import-non-thetalib-extension` message (`<path>` as written). */
export function importNonThetaLibExtensionMessage(path: string): string {
  return `import path '${path}' does not end in .thetalib`;
}

/**
 * Check an `import` path literal's extension (`parse` phase), returning
 * `theta/parse/import-non-thetalib-extension` when the literal does not end in a
 * byte-exact lowercase `.thetalib` — including a `.theta`-suffixed path or a
 * non-lowercase `.THETALIB` / `.ThetaLib` variant, which reject on every host
 * regardless of the filesystem's case-equivalence model (imports.md §"Path
 * resolution"; lexical.md §"Extension matching"). Returns `undefined` for a
 * byte-exact `.thetalib` path.
 */
export function checkImportExtension(
  pathLiteral: string,
  site: ImportSite,
): Diagnostic | undefined {
  // Byte-exact lowercase `.thetalib`: `.THETALIB` / `.ThetaLib` / `.theta` all reject, on
  // every host regardless of the filesystem's case-equivalence model.
  if (pathLiteral.endsWith(".thetalib")) {
    return undefined;
  }
  return {
    severity: "error",
    code: IMPORT_NON_THETALIB_EXTENSION_CODE,
    file: site.file,
    range: site.range,
    message: importNonThetaLibExtensionMessage(pathLiteral),
    hint: IMPORT_NON_THETALIB_EXTENSION_HINT,
  };
}

// ── theta/parse/import-unknown-symbol + theta/parse/import-name-collision ──────

export const IMPORT_UNKNOWN_SYMBOL_CODE = "theta/parse/import-unknown-symbol";
export const IMPORT_NAME_COLLISION_CODE = "theta/parse/import-name-collision";
export const IMPORT_NAME_COLLISION_HINT = "Resolve with `as`-aliasing.";

/** `theta/parse/import-unknown-symbol` message (`<name>` is the source symbol, not the alias). */
export function importUnknownSymbolMessage(name: string, path: string): string {
  return `imported symbol '${name}' is not declared or re-exported by '${path}'`;
}

/** `theta/parse/import-name-collision` message (`<name>` as written). */
export function importNameCollisionMessage(name: string): string {
  return `imported symbol '${name}' collides with another import or top-level declaration`;
}

// ── theta/load/imported-type-name-collision ────────────────────────────────────

/**
 * Bug 0466 (§Fix Option 2): a directly-imported entry's `as` alias claims the
 * SOURCE name of a DIFFERENT decl reached in that entry's own same-lib closure
 * (`import { ReviewSummary as Detail }` where `ReviewSummary` itself declares
 * `detail: Detail` against a same-lib `schema Detail`). One flat `$defs` name
 * cannot mean both, so the collector refuses rather than let first-wins bind
 * the wrong shape — imports.md §Name collisions' no-implicit-shadowing posture
 * (two sources never silently bind one name), applied one level in.
 */
export const IMPORTED_TYPE_NAME_COLLISION_CODE = "theta/load/imported-type-name-collision";
export const IMPORTED_TYPE_NAME_COLLISION_HINT =
  "Choose a different 'as' alias so each imported and transitively-referenced type resolves to one declaration.";

/** `theta/load/imported-type-name-collision` message (`<name>` is the contended type name). */
export function importedTypeNameCollisionMessage(name: string): string {
  return `imported type name '${name}' is claimed by two different declarations in the imported schema closure; disambiguate with a different 'as' alias`;
}

// ── theta/parse/import-reserved-synthesised-name ───────────────────────────────

export const IMPORT_RESERVED_SYNTHESISED_NAME_CODE =
  "theta/parse/import-reserved-synthesised-name";

/**
 * `theta/parse/import-reserved-synthesised-name` message. `<name>` renders the
 * LOCAL binding — the `as` alias where present, else the source name — not the
 * source symbol: the opposite of `importUnknownSymbolMessage`, because the
 * reservation is a property of the name the importing file BINDS (the one that
 * can occupy a `$defs` key or resolve as a `params:` `NamedType`), not of the
 * name the `.thetalib` file exports.
 */
export function importReservedSynthesisedNameMessage(name: string): string {
  return `imported symbol '${name}' binds a reserved synthesised name`;
}

/**
 * Check an import / `export … from` specifier's LOCAL binding (`parse` phase):
 * a binding matching one of schema-subset.md §Synthesised names (`:108`)'s four
 * forms exactly is `theta/parse/import-reserved-synthesised-name`. This is the
 * one name-introducing position the casing rule (lexical.md:15) does not close
 * — a leading `_` is legal in the lowercase-first binding position it governs
 * (lexical.md:16) — and it is the reachable spelling: the `schema`/`enum`
 * declaration spelling of the same name is already refused there (bug 0040
 * §Kind). Checked at `local` rather than `source` because `local` is the name
 * that ends up resolvable as a `params:` `NamedType`
 * (frontmatter-fields-a.md:58) and reachable as a `$defs` key
 * (schema-subset.md:73/:76); the source symbol never is.
 */
export function checkImportReservedSynthesisedName(
  local: string,
  site: ImportSite,
): Diagnostic | undefined {
  if (!isReservedSynthesisedName(local)) {
    return undefined;
  }
  return {
    severity: "error",
    code: IMPORT_RESERVED_SYNTHESISED_NAME_CODE,
    file: site.file,
    range: site.range,
    message: importReservedSynthesisedNameMessage(local),
  };
}

// ── theta/parse/import-missing-from-clause ─────────────────────────────────────

export const IMPORT_MISSING_FROM_CLAUSE_CODE = "theta/parse/import-missing-from-clause";
export const IMPORT_MISSING_FROM_CLAUSE_MESSAGE =
  "import / export specifier list requires a 'from' clause with a .thetalib path literal";
export const IMPORT_MISSING_FROM_CLAUSE_HINT =
  "Add a `from` clause naming the `.thetalib` the symbols come from.";

/**
 * Check an `import` / `export` statement's trailing clause (`parse` phase): a
 * specifier list is a production only with a `from` clause naming a
 * `.thetalib` path literal (imports.md §"Re-exports"), so an absent `from`
 * keyword, or one present with no `string` token after it, is
 * `theta/parse/import-missing-from-clause`. One call answers for the WHOLE
 * statement — `parseImportExport` calls this once, after the specifier list
 * and the trailing clause are both consumed, ranged over the statement rather
 * than a specifier — unlike `checkImportReservedSynthesisedName` above, which
 * answers a per-specifier question and stays per-specifier on the same
 * from-less input (bug 0058 §Fix constraint 1: the two checks co-emit).
 */
export function checkImportMissingFromClause(
  hasFromKeyword: boolean,
  hasPathLiteral: boolean,
  site: ImportSite,
): Diagnostic | undefined {
  if (hasFromKeyword && hasPathLiteral) {
    return undefined;
  }
  return {
    severity: "error",
    code: IMPORT_MISSING_FROM_CLAUSE_CODE,
    file: site.file,
    range: site.range,
    message: IMPORT_MISSING_FROM_CLAUSE_MESSAGE,
    hint: IMPORT_MISSING_FROM_CLAUSE_HINT,
  };
}

// ── theta/parse/import-malformed-specifier-list ────────────────────────────────

export const IMPORT_MALFORMED_SPECIFIER_LIST_CODE =
  "theta/parse/import-malformed-specifier-list";
export const IMPORT_MALFORMED_SPECIFIER_LIST_MESSAGE =
  "import / export specifier list must carry at least one specifier, each 'Name' or 'Name as Alias'";

/**
 * Check an `import` / `export` statement's specifier list (`parse` phase) for
 * the shape `ImportDecl` / `ExportDecl` require: `"{" ImportSpec (","
 * ImportSpec)* ","? "}"` with at least one specifier (imports.md §"Re-exports").
 * A missing brace or an empty list is a STATEMENT-level fact, so this answers
 * once for the whole statement — like `checkImportMissingFromClause` above,
 * not per specifier.
 *
 * GATED on a well-formed trailing clause (`hasFromKeyword && hasPathLiteral`):
 * `checkImportMissingFromClause`'s registry *Trigger* already claims the
 * degenerate bare-keyword (`import`, `export`) and empty-list (`import {}`,
 * `export {}`) spellings that have no `from` clause, so those keep emitting
 * that one code alone — co-emitting here would widen a Trigger the registry
 * already commits elsewhere and would move 0058's whole-list witnesses and
 * the reserved-keyword matrix's swallowed-keyword cells.
 */
export function checkImportMalformedSpecifierList(
  hasBraces: boolean,
  specifierCount: number,
  hasFromKeyword: boolean,
  hasPathLiteral: boolean,
  site: ImportSite,
): Diagnostic | undefined {
  if (!hasFromKeyword || !hasPathLiteral) {
    return undefined;
  }
  if (hasBraces && specifierCount > 0) {
    return undefined;
  }
  return {
    severity: "error",
    code: IMPORT_MALFORMED_SPECIFIER_LIST_CODE,
    file: site.file,
    range: site.range,
    message: IMPORT_MALFORMED_SPECIFIER_LIST_MESSAGE,
  };
}

/**
 * Check one `import` / `export` specifier (`parse` phase) for a dangling
 * `as`: the `as` keyword was consumed with no following ident-or-keyword
 * alias token, a shape neither `ImportSpec` nor `ExportSpec` admits
 * (imports.md §"Re-exports", `Ident` or `Ident "as" Ident` and nothing else).
 * A dangling `as` is a SPECIFIER-level fact, so this answers once per
 * malformed specifier, ranged over that specifier — like bug 0040's
 * `checkImportReservedSynthesisedName` above. UNGATED: it co-emits with that
 * check and with `checkImportMissingFromClause` on a from-less list.
 */
export function checkImportDanglingAlias(
  aliasConsumedWithNoAlias: boolean,
  site: ImportSite,
): Diagnostic | undefined {
  if (!aliasConsumedWithNoAlias) {
    return undefined;
  }
  return {
    severity: "error",
    code: IMPORT_MALFORMED_SPECIFIER_LIST_CODE,
    file: site.file,
    range: site.range,
    message: IMPORT_MALFORMED_SPECIFIER_LIST_MESSAGE,
  };
}

/**
 * Check an `import` / `export` specifier list (`parse` phase) for a
 * SEPARATOR-degenerate list: two specifiers adjacent with no `,` between
 * them, a `,` with no specifier before it or with a `,` already pending, or a
 * token the specifier loop's catch-all discarded. `ImportDecl` / `ExportDecl`
 * spell the list as `"{" ImportSpec ("," ImportSpec)* ","? "}"` (imports.md
 * §"Re-exports", the `ImportDecl` / `ExportDecl` production block) — one
 * specifier between separators and exactly one optional trailing comma — so
 * each of those three shapes is
 * outside the production even though the recovered list is non-empty and
 * alias-complete, which is why neither `checkImportMalformedSpecifierList`
 * above (subject: an absent or zero-specifier list) nor `checkImportDanglingAlias`
 * above (subject: a dangling `as`) has a subject for it (bug 0211).
 *
 * GATED like `checkImportMalformedSpecifierList`'s statement arm
 * (`hasFromKeyword && hasPathLiteral`): this is a third arm of the same
 * STATEMENT-level fact family, so it stays inside the same trailing-clause
 * fence rather than widen `checkImportMissingFromClause`'s registry *Trigger*
 * (bug 0211 §Fix constraint 3; registry disposition in the
 * `theta/parse/import-malformed-specifier-list` row's statement-arm gate,
 * docs/spec_topics/diagnostics/code-registry-parse.md) — a from-less
 * degenerate list already draws that one code alone, and un-gating this arm
 * would co-emit a second statement-ranged diagnostic there.
 *
 * SUPPRESSED on an empty recovered list (`specifierCount === 0`, the
 * zero-specifier arm's own subject above) or when any specifier in the list
 * carried a dangling `as` (`anyDanglingAlias`, the dangling-alias arm's own
 * subject above): the three arms of this one code must partition the
 * recovered list so at most one statement-ranged diagnostic fires per
 * statement (bug 0211 §Fix constraint 2's granularity, carried in the
 * `theta/parse/import-malformed-specifier-list` row's partition sentence,
 * code-registry-parse.md) — without the suppression, `{ , }` (a stray leading
 * comma into an empty list) and
 * `{ a as as b }` (a discarded second `as` beside a dangling first one)
 * would each draw a second, redundant diagnostic of the same code.
 */
export function checkImportSeparatorDegenerateSpecifierList(
  hasSeparatorDegeneracy: boolean,
  specifierCount: number,
  anyDanglingAlias: boolean,
  hasFromKeyword: boolean,
  hasPathLiteral: boolean,
  site: ImportSite,
): Diagnostic | undefined {
  if (!hasFromKeyword || !hasPathLiteral) {
    return undefined;
  }
  if (!hasSeparatorDegeneracy || specifierCount === 0 || anyDanglingAlias) {
    return undefined;
  }
  return {
    severity: "error",
    code: IMPORT_MALFORMED_SPECIFIER_LIST_CODE,
    file: site.file,
    range: site.range,
    message: IMPORT_MALFORMED_SPECIFIER_LIST_MESSAGE,
  };
}

/** A single `import { … }` / `export { … } from` specifier. */
export interface ImportSpecifier {
  /** The symbol as named in the resolved `.thetalib` file (the source symbol). */
  readonly source: string;
  /** The local binding — the `as` alias, or the source name when unaliased. */
  readonly local: string;
  readonly range: SourceRange;
}

/** Inputs to the imported-symbol check for one importing file. */
export interface ImportCheckInput {
  readonly file: string;
  /** The import path literal as written (rendered as `<path>` in the unknown-symbol message). */
  readonly specPath: string;
  readonly specifiers: readonly ImportSpecifier[];
  /** Top-level declarations + transitive `export … from` re-exports of the resolved `.thetalib` file. */
  readonly resolvedExports: readonly string[];
  /** Top-level declaration names in the importing file (for the same-file collision arm). */
  readonly localTopLevelNames: readonly string[];
}

/**
 * Unknown-symbol arm (`parse` phase): a specifier whose SOURCE symbol is
 * neither a top-level declaration nor a transitive re-export of the resolved
 * `.thetalib` file is `theta/parse/import-unknown-symbol`. The message names the
 * source symbol, not the `as` alias. No fast-fail — every offending specifier is
 * collected (multi-error batching rule). Scoped to a single `import … from`
 * decl because the export set is per-resolved-file.
 */
export function checkImportUnknownSymbols(
  file: string,
  specPath: string,
  specifiers: readonly ImportSpecifier[],
  resolvedExports: readonly string[],
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const exported = new Set(resolvedExports);
  for (const specifier of specifiers) {
    if (!exported.has(specifier.source)) {
      diagnostics.push({
        severity: "error",
        code: IMPORT_UNKNOWN_SYMBOL_CODE,
        file,
        range: specifier.range,
        message: importUnknownSymbolMessage(specifier.source, specPath),
      });
    }
  }
  return diagnostics;
}

/**
 * Name-collision arm (`parse` phase): a LOCAL binding shared by two imports —
 * whether from two different `.thetalib` files or the same file imported twice — or
 * colliding with a same-file top-level declaration is
 * `theta/parse/import-name-collision` (imports.md §"Name collisions": no implicit
 * shadowing; resolve with `as`-aliasing). The message names the local name; each
 * colliding name is reported once. `specifiers` is the union of EVERY importing
 * `import … from` decl's specifiers for the file, so an import-vs-import collision
 * across two separate `import` statements is caught, mirroring the import-vs-
 * local-declaration arm rather than being lost to last-import-wins shadowing.
 */
export function checkImportNameCollisions(
  file: string,
  specifiers: readonly ImportSpecifier[],
  localTopLevelNames: readonly string[],
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const localTopLevel = new Set(localTopLevelNames);
  const seenLocal = new Set<string>();
  const reported = new Set<string>();
  for (const specifier of specifiers) {
    const local = specifier.local;
    const collides = localTopLevel.has(local) || seenLocal.has(local);
    if (collides && !reported.has(local)) {
      diagnostics.push({
        severity: "error",
        code: IMPORT_NAME_COLLISION_CODE,
        file,
        range: specifier.range,
        message: importNameCollisionMessage(local),
        hint: IMPORT_NAME_COLLISION_HINT,
      });
      reported.add(local);
    }
    seenLocal.add(local);
  }
  return diagnostics;
}

/**
 * Check an importing file's specifiers (`parse` phase), returning
 * `theta/parse/import-unknown-symbol` for a specifier whose source symbol is
 * neither a top-level declaration nor a transitive re-export of the resolved
 * file (the message names the source symbol, not the alias), and
 * `theta/parse/import-name-collision` for a local binding shared by two imports
 * or colliding with a top-level declaration in the same file. Participates in
 * the multi-error batching rule (returns every diagnostic, no fast-fail).
 *
 * Retained as the single-decl composition of {@link checkImportUnknownSymbols}
 * and {@link checkImportNameCollisions}. The load pass (import-static-checks.ts)
 * calls the two arms separately — the unknown-symbol arm per resolved decl and
 * the collision arm once over the union of every decl's specifiers — so an
 * import-vs-import collision across two separate `import` statements is caught.
 */
export function checkImportedSymbols(
  input: ImportCheckInput,
): readonly Diagnostic[] {
  return [
    ...checkImportUnknownSymbols(
      input.file,
      input.specPath,
      input.specifiers,
      input.resolvedExports,
    ),
    ...checkImportNameCollisions(
      input.file,
      input.specifiers,
      input.localTopLevelNames,
    ),
  ];
}

export * from "./thetalib-resolver";
export * from "./import-cycle";
export * from "./thetalib-exports";
