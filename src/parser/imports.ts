// V15c / V15c-T — `.warp` import resolution and diagnostics.
//
// This module owns the `.warp` import path: the permitted top-level forms
// (`import`/`export`/`schema`/`enum`/`fn`), relative `.warp`-only resolution
// through the named `Resolver` seam, and the import-cycle / unknown-symbol /
// name-collision / unresolvable-path diagnostics (per imports.md, incl. the
// IMP-1 resolver failure contract).
//
// V15c-T (tests-task) declares these seams and stubs each behaviour-bearing
// function inert so the failing tests compile and red on their own primary
// assertions. The paired V15c implementation leaf fills them in. Each stub
// returns a benign wrong value (no diagnostic / the empty string / a
// "registered" verdict with no resolved path) so the assertions red for the
// intended reason (implementation absent), never on a thrown harness error.
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-parse.md, diagnostics/code-registry-load.md) per
// the *Diagnostic message anchors* rule; `<path>` / `<name>` placeholders are
// rendered per diagnostics/placeholder-rendering-b.md (the path-literal text as
// written, no realpath normalisation).

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";

/** A located `import` / `export … from` / top-level-form site. */
export interface ImportSite {
  readonly file: string;
  readonly range: SourceRange;
}

// ── loom/parse/warp-top-level-statement ─────────────────────────────────────

export const WARP_TOP_LEVEL_STATEMENT_CODE = "loom/parse/warp-top-level-statement";
export const WARP_TOP_LEVEL_STATEMENT_MESSAGE =
  "top-level statement not permitted in .warp file; move into a fn body";
export const WARP_TOP_LEVEL_STATEMENT_HINT = "Move the code into a fn body.";

/**
 * A `.warp` top-level form. The permitted forms are `import`, `export`,
 * `schema`, `enum`, and `fn`; any other top-level form — a bare statement, a
 * `let` binding, or a query — is `loom/parse/warp-top-level-statement`
 * (imports.md §"`.warp` file rules").
 */
export type WarpTopLevelForm =
  | "import"
  | "export"
  | "schema"
  | "enum"
  | "fn"
  | "let"
  | "statement"
  | "query";

/**
 * Check a `.warp` file's top-level form, returning
 * `loom/parse/warp-top-level-statement` for a non-permitted form and
 * `undefined` for a permitted one.
 *
 * V15c-T stubs this inert (always `undefined`), so the non-permitted-form test
 * reds on its own primary assertion. The paired V15c leaf fills it in.
 */
export function checkWarpTopLevelForm(
  _form: WarpTopLevelForm,
  _site: ImportSite,
): Diagnostic | undefined {
  return undefined;
}

// ── loom/parse/import-non-warp-extension ────────────────────────────────────

export const IMPORT_NON_WARP_EXTENSION_CODE = "loom/parse/import-non-warp-extension";
export const IMPORT_NON_WARP_EXTENSION_HINT =
  "import paths must end in `.warp`; `.loom` files are not importable — use `invoke(...)` instead.";

/** `loom/parse/import-non-warp-extension` message (`<path>` as written). */
export function importNonWarpExtensionMessage(path: string): string {
  return `import path '${path}' does not end in .warp`;
}

/**
 * Check an `import` path literal's extension (`parse` phase), returning
 * `loom/parse/import-non-warp-extension` when the literal does not end in a
 * byte-exact lowercase `.warp` — including a `.loom`-suffixed path or a
 * non-lowercase `.WARP` / `.Warp` variant, which reject on every host
 * regardless of the filesystem's case-equivalence model (imports.md §"Path
 * resolution"; lexical.md §"Extension matching"). Returns `undefined` for a
 * byte-exact `.warp` path.
 *
 * V15c-T stubs this inert (always `undefined`), so both the `.loom` and the
 * `.WARP` variant tests red on their own primary assertions. The paired V15c
 * leaf fills it in.
 */
export function checkImportExtension(
  _pathLiteral: string,
  _site: ImportSite,
): Diagnostic | undefined {
  return undefined;
}

// ── loom/load/unresolvable-warp-path + the Resolver seam (IMP-1) ─────────────

export const UNRESOLVABLE_WARP_PATH_CODE = "loom/load/unresolvable-warp-path";
export const UNRESOLVABLE_WARP_PATH_HINT =
  "Use a relative `./` or `../` path ending in `.warp` that points at an existing, readable file.";

/** `loom/load/unresolvable-warp-path` message (`<path>` as written). */
export function unresolvableWarpPathMessage(path: string): string {
  return `cannot resolve .warp import '${path}'`;
}

/**
 * The exception a `Resolver` throws to signal an unresolvable spec (IMP-1). The
 * load pipeline treats a throw from `resolve` as a resolution failure.
 */
export class UnresolvableWarpPathError extends Error {
  readonly spec: string;
  constructor(spec: string) {
    super(unresolvableWarpPathMessage(spec));
    this.name = "UnresolvableWarpPathError";
    this.spec = spec;
  }
}

/**
 * Import-path resolution seam (imports.md §"Resolver interface"). loom 1.0.0
 * ships exactly one implementation (`RelativeWarpResolver`); the seam is what
 * lets the deferred package-style / project-rooted extensions land by
 * registering additional implementations rather than rewriting import sites.
 */
export interface Resolver {
  /** Resolve `spec` against `fromFile`'s directory; throw to signal unresolvable (IMP-1). */
  resolve(spec: string, fromFile: string): string;
}

/**
 * A byte-for-byte directory probe the relative resolver enumerates to satisfy
 * the byte-exact final-segment match rule (IMP-1). Enumerating the resolved
 * parent directory once is what lets the resolver reject a case-variant entry
 * (`Personas.warp` for a `personas.warp` literal) on a case-insensitive host,
 * which a single `exists` / `readText` could not.
 */
export interface WarpDirectoryProbe {
  /** Entry names in `dir`, byte-for-byte as `FileSystem.readdir` returns them; throws if `dir` is unreadable. */
  entries(dir: string): readonly string[];
  /** Whether the byte-exact entry `dir`/`name` is readable (`EACCES` / `EPERM` / broken symlink → `false`). */
  entryReadable(dir: string, name: string): boolean;
}

/**
 * The single loom 1.0.0 `Resolver`: a relative-path resolver that joins `spec`
 * against the directory of `fromFile` and requires the `.warp` extension.
 * Non-relative specs (`@scope/pkg`, `/looms/...`), a missing byte-exact
 * final-segment directory entry, and a byte-exact-but-unreadable entry are all
 * unresolvable and throw `UnresolvableWarpPathError` (IMP-1).
 *
 * V15c-T stubs `resolve` inert (returns the empty string), so the IMP-1 throw
 * test reds (no throw is raised) and the success-path test reds (`""` is not
 * the resolved path). The paired V15c leaf fills it in.
 */
export class RelativeWarpResolver implements Resolver {
  constructor(private readonly probe: WarpDirectoryProbe) {}

  resolve(spec: string, fromFile: string): string {
    void this.probe;
    void spec;
    void fromFile;
    return "";
  }
}

/** The outcome of running an `import` spec through the load pipeline (IMP-1). */
export interface WarpImportLoad {
  /** The resolved `.warp` path — present only when resolution succeeded. */
  readonly resolvedPath?: string;
  /** Whether the importing file is registered (a resolution failure does not register it). */
  readonly registered: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Run an `import` spec through the load pipeline (IMP-1): call
 * `resolver.resolve` and, on an `UnresolvableWarpPathError` throw, emit
 * `loom/load/unresolvable-warp-path` against the importing file and do NOT
 * register it; on success, register the file and carry the resolved path.
 *
 * V15c-T stubs this inert — it reports the file as registered with no resolved
 * path and no diagnostic — so the IMP-1 failure test reds (no diagnostic /
 * `registered` not `false`) and the success test reds (no `resolvedPath`). The
 * paired V15c leaf fills it in.
 */
export function loadWarpImport(
  _resolver: Resolver,
  _spec: string,
  _fromFile: string,
  _site: ImportSite,
): WarpImportLoad {
  return { registered: true, diagnostics: [] };
}

// ── loom/parse/import-unknown-symbol + loom/parse/import-name-collision ──────

export const IMPORT_UNKNOWN_SYMBOL_CODE = "loom/parse/import-unknown-symbol";
export const IMPORT_NAME_COLLISION_CODE = "loom/parse/import-name-collision";
export const IMPORT_NAME_COLLISION_HINT = "Resolve with `as`-aliasing.";

/** `loom/parse/import-unknown-symbol` message (`<name>` is the source symbol, not the alias). */
export function importUnknownSymbolMessage(name: string, path: string): string {
  return `imported symbol '${name}' is not declared or re-exported by '${path}'`;
}

/** `loom/parse/import-name-collision` message (`<name>` as written). */
export function importNameCollisionMessage(name: string): string {
  return `imported symbol '${name}' collides with another import or top-level declaration`;
}

/** A single `import { … }` / `export { … } from` specifier. */
export interface ImportSpecifier {
  /** The symbol as named in the resolved `.warp` file (the source symbol). */
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
  /** Top-level declarations + transitive `export … from` re-exports of the resolved `.warp` file. */
  readonly resolvedExports: readonly string[];
  /** Top-level declaration names in the importing file (for the same-file collision arm). */
  readonly localTopLevelNames: readonly string[];
}

/**
 * Check an importing file's specifiers (`parse` phase), returning
 * `loom/parse/import-unknown-symbol` for a specifier whose source symbol is
 * neither a top-level declaration nor a transitive re-export of the resolved
 * file (the message names the source symbol, not the alias), and
 * `loom/parse/import-name-collision` for a local binding shared by two imports
 * or colliding with a top-level declaration in the same file. Participates in
 * the multi-error batching rule (returns every diagnostic, no fast-fail).
 *
 * V15c-T stubs this inert (always `[]`), so the unknown-symbol and
 * name-collision tests red on their own primary assertions. The paired V15c
 * leaf fills it in.
 */
export function checkImportedSymbols(
  _input: ImportCheckInput,
): readonly Diagnostic[] {
  return [];
}

// ── loom/load/import-cycle ──────────────────────────────────────────────────

export const IMPORT_CYCLE_CODE = "loom/load/import-cycle";

/**
 * `loom/load/import-cycle` message. `stems` is the cycle path as file-path
 * stems (the first stem repeated at the end); rendered as
 * `import cycle: a.warp → b.warp → a.warp` (each stem suffixed `.warp`, joined
 * by ` → `), per diagnostics/placeholder-rendering-b.md.
 */
export function importCycleMessage(stems: readonly string[]): string {
  return `import cycle: ${stems.map((s) => `${s}.warp`).join(" → ")}`;
}

/**
 * The static `.warp` import graph: `edges` maps each file stem to the stems it
 * imports.
 */
export interface WarpImportGraph {
  readonly edges: ReadonlyMap<string, readonly string[]>;
}

/**
 * Walk the static `.warp` import graph from `entry`, returning
 * `loom/load/import-cycle` with the cycle path printed when a cycle is
 * discovered, and `undefined` for an acyclic graph (imports.md §"Cycles").
 *
 * V15c-T stubs this inert (always `undefined`), so the cycle test reds on its
 * own primary assertion. The paired V15c leaf fills it in.
 */
export function detectImportCycle(
  _entry: string,
  _graph: WarpImportGraph,
  _site: ImportSite,
): Diagnostic | undefined {
  return undefined;
}
