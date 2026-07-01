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

import { posix } from "node:path";
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

/** The five forms a `.warp` top level may contain (imports.md §"`.warp` file rules"). */
const PERMITTED_WARP_TOP_LEVEL_FORMS: ReadonlySet<WarpTopLevelForm> = new Set([
  "import",
  "export",
  "schema",
  "enum",
  "fn",
]);

/**
 * Check a `.warp` file's top-level form, returning
 * `loom/parse/warp-top-level-statement` for a non-permitted form and
 * `undefined` for a permitted one.
 *
 * V15c-T stubs this inert (always `undefined`), so the non-permitted-form test
 * reds on its own primary assertion. The paired V15c leaf fills it in.
 */
export function checkWarpTopLevelForm(
  form: WarpTopLevelForm,
  site: ImportSite,
): Diagnostic | undefined {
  if (PERMITTED_WARP_TOP_LEVEL_FORMS.has(form)) {
    return undefined;
  }
  return {
    severity: "error",
    code: WARP_TOP_LEVEL_STATEMENT_CODE,
    file: site.file,
    range: site.range,
    message: WARP_TOP_LEVEL_STATEMENT_MESSAGE,
    hint: WARP_TOP_LEVEL_STATEMENT_HINT,
  };
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
  pathLiteral: string,
  site: ImportSite,
): Diagnostic | undefined {
  // Byte-exact lowercase `.warp`: `.WARP` / `.Warp` / `.loom` all reject, on
  // every host regardless of the filesystem's case-equivalence model.
  if (pathLiteral.endsWith(".warp")) {
    return undefined;
  }
  return {
    severity: "error",
    code: IMPORT_NON_WARP_EXTENSION_CODE,
    file: site.file,
    range: site.range,
    message: importNonWarpExtensionMessage(pathLiteral),
    hint: IMPORT_NON_WARP_EXTENSION_HINT,
  };
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
    // Only relative `./` / `../` specs are in scope for loom 1.0; a
    // package-style (`@scope/pkg`) or project-rooted (`/looms/...`) spec is
    // unresolvable and signalled by throwing (IMP-1).
    if (!spec.startsWith("./") && !spec.startsWith("../")) {
      throw new UnresolvableWarpPathError(spec);
    }
    // The relative resolver requires the `.warp` extension (byte-exact
    // lowercase); a non-`.warp` spec is unresolvable through this resolver.
    if (!spec.endsWith(".warp")) {
      throw new UnresolvableWarpPathError(spec);
    }

    // Join the spec against the importing file's directory, then match the
    // final segment byte-for-byte against the resolved parent directory's
    // entries — enumerating once via the probe rather than a single
    // `exists`/`readText`, so a case-variant entry (`Personas.warp` for a
    // `personas.warp` literal) rejects on a case-insensitive host (IMP-1).
    const resolved = posix.join(posix.dirname(fromFile), spec);
    const parent = posix.dirname(resolved);
    const finalSegment = posix.basename(resolved);

    // `entries` throws (unreadable parent directory) → unresolvable, and the
    // throw is the resolution-failure signal, so it propagates unchanged.
    const names = this.probe.entries(parent);
    if (!names.includes(finalSegment)) {
      throw new UnresolvableWarpPathError(spec);
    }
    if (!this.probe.entryReadable(parent, finalSegment)) {
      throw new UnresolvableWarpPathError(spec);
    }
    return resolved;
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
  resolver: Resolver,
  spec: string,
  fromFile: string,
  site: ImportSite,
): WarpImportLoad {
  let resolvedPath: string;
  try {
    resolvedPath = resolver.resolve(spec, fromFile);
  } catch (resolveError: unknown) { // allow-broad-catch: loom/load/unresolvable-warp-path — spec_topics/imports.md (IMP-1: the load pipeline treats *any* throw from `resolve` as a resolution failure)
    // IMP-1 mandates treating a throw from `resolve` as a resolution failure —
    // any throw, not only `UnresolvableWarpPathError` — so this does not
    // rethrow. The diagnostic renders the spec path as written (`<path>`), not
    // the thrown error's message.
    void resolveError;
    return {
      registered: false,
      diagnostics: [
        {
          severity: "error",
          code: UNRESOLVABLE_WARP_PATH_CODE,
          file: site.file,
          range: site.range,
          message: unresolvableWarpPathMessage(spec),
          hint: UNRESOLVABLE_WARP_PATH_HINT,
        },
      ],
    };
  }
  return { resolvedPath, registered: true, diagnostics: [] };
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
  input: ImportCheckInput,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const exported = new Set(input.resolvedExports);

  // Unknown-symbol arm: a specifier whose SOURCE symbol is neither a top-level
  // declaration nor a transitive re-export of the resolved file. The message
  // names the source symbol, not the `as` alias. No fast-fail — every offending
  // specifier is collected (multi-error batching rule).
  for (const specifier of input.specifiers) {
    if (!exported.has(specifier.source)) {
      diagnostics.push({
        severity: "error",
        code: IMPORT_UNKNOWN_SYMBOL_CODE,
        file: input.file,
        range: specifier.range,
        message: importUnknownSymbolMessage(specifier.source, input.specPath),
      });
    }
  }

  // Name-collision arm: a local binding shared by two imports, or colliding
  // with a same-file top-level declaration. The message names the local name;
  // each colliding name is reported once.
  const localTopLevel = new Set(input.localTopLevelNames);
  const seenLocal = new Set<string>();
  const reported = new Set<string>();
  for (const specifier of input.specifiers) {
    const local = specifier.local;
    const collides = localTopLevel.has(local) || seenLocal.has(local);
    if (collides && !reported.has(local)) {
      diagnostics.push({
        severity: "error",
        code: IMPORT_NAME_COLLISION_CODE,
        file: input.file,
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
  entry: string,
  graph: WarpImportGraph,
  site: ImportSite,
): Diagnostic | undefined {
  const stack: string[] = [];
  const onStack = new Set<string>();
  const visited = new Set<string>();
  let cyclePath: readonly string[] | undefined;

  const walk = (node: string): void => {
    if (cyclePath !== undefined) {
      return;
    }
    stack.push(node);
    onStack.add(node);
    for (const next of graph.edges.get(node) ?? []) {
      if (onStack.has(next)) {
        // Back-edge: the cycle path runs from `next`'s first appearance on the
        // current stack, with `next` repeated at the end.
        const from = stack.indexOf(next);
        cyclePath = [...stack.slice(from), next];
        return;
      }
      if (!visited.has(next)) {
        walk(next);
        if (cyclePath !== undefined) {
          return;
        }
      }
    }
    stack.pop();
    onStack.delete(node);
    visited.add(node);
  };

  walk(entry);
  if (cyclePath === undefined) {
    return undefined;
  }
  return {
    severity: "error",
    code: IMPORT_CYCLE_CODE,
    file: site.file,
    range: site.range,
    message: importCycleMessage(cyclePath),
  };
}

// ── V15i / V15i-T — export visibility and re-exports ─────────────────────────
//
// The `.warp` export-visibility semantics layered on V15c's resolution
// (imports.md §"Visibility" + §"Re-exports", coverage-matrix code-keyed-area
// token `cka-48`): every top-level `schema`/`enum`/`fn` is implicitly exported
// (no `export` keyword, no privacy modifier); an aliased `export … from` re-export
// is visible downstream as its alias while creating NO local binding for the
// re-exported source symbol; and a plain `import` is NOT re-exported downstream.
//
// V15i-T (tests-task) declares these two seams and stubs each inert-but-wrong so
// the failing visibility tests compile and red on their own primary assertions.
// `computeWarpExports` returns the WRONG set — the plain-import locals, which
// are precisely the names that are NOT downstream-visible — and omits the
// auto-exported declarations and the `export … from` re-exports that ARE, so
// every positive/negative visibility assertion reds for the intended reason
// (implementation absent). `warpLocalBindings` symmetrically returns the
// re-export SOURCE names, which create no local binding, so the "no local
// binding for the re-exported symbol" assertion reds. The paired V15i leaf
// fills both in.

/** A top-level `.warp` declaration kind — each is implicitly exported (imports.md §Visibility). */
export type WarpDeclarationKind = "schema" | "enum" | "fn";

/** A top-level `schema`/`enum`/`fn` declaration in a `.warp` file (auto-exported). */
export interface WarpDeclaration {
  readonly kind: WarpDeclarationKind;
  readonly name: string;
}

/**
 * An `export { A as B } from "./x.warp"` re-export form. Visible downstream as
 * `exported` (the `as` alias, or `source` when unaliased) and creating NO local
 * binding for `source` in the re-exporting file (imports.md §Re-exports).
 */
export interface ReExportSpecifier {
  /** The symbol as named in the re-exported-from `.warp` file (the source symbol). */
  readonly source: string;
  /** The downstream-visible name — the `as` alias, or `source` when unaliased. */
  readonly exported: string;
  /** The `.warp` path being re-exported from (as written). */
  readonly fromPath: string;
  readonly range: SourceRange;
}

/**
 * The top-level forms of one `.warp` module that bear on downstream visibility:
 * its auto-exported declarations, its `export … from` re-exports, and its plain
 * `import` specifiers (which bind locally but are NOT re-exported).
 */
export interface WarpModuleForms {
  readonly declarations: readonly WarpDeclaration[];
  readonly reExports: readonly ReExportSpecifier[];
  readonly plainImports: readonly ImportSpecifier[];
}

/**
 * Compute the set of names a `.warp` module makes visible to a downstream
 * importer (imports.md §Visibility + §Re-exports): every top-level declaration
 * name (auto-exported) plus every `export … from` re-export's downstream name
 * (`exported`); a plain `import` local is NOT included. This is exactly the
 * `resolvedExports` list `checkImportedSymbols` matches an importing specifier
 * against.
 *
 * V15i-T stubs this to the WRONG set (the plain-import locals only), so each
 * visibility test reds on its own primary assertion. The paired V15i leaf fills
 * it in.
 */
export function computeWarpExports(forms: WarpModuleForms): readonly string[] {
  return forms.plainImports.map((specifier) => specifier.local);
}

/**
 * The names a `.warp` module binds locally: its top-level declarations plus its
 * plain `import` locals. An `export … from` re-export creates NO local binding
 * for its source symbol, so re-export sources are excluded (imports.md
 * §Re-exports — "a dedicated form that creates no local binding").
 *
 * V15i-T stubs this to the WRONG set (the re-export source names, which are
 * exactly what a re-export does NOT bind locally), so the "no local binding for
 * the re-exported symbol" assertion reds. The paired V15i leaf fills it in.
 */
export function warpLocalBindings(forms: WarpModuleForms): readonly string[] {
  return forms.reExports.map((reExport) => reExport.source);
}
