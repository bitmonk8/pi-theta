// Load-time (compose-pass) wiring for the `.thetalib` import subsystem the shipped
// pipeline previously never ran (imports.md §"Path resolution" / §"Unknown
// imported symbol" / §"Cycles" / IMP-1). Each check reuses an existing,
// unit-tested checker/resolver rather than reimplementing it (mirrors the
// invoke static-check compose pass in invoke-static-checks.ts):
//
//   - IMP-1 — `RelativeThetaLibResolver` + `loadThetaLibImport` over each
//     `import { … } from "./x.thetalib"` site: an unresolvable spec is
//     `theta/load/unresolvable-thetalib-path` and the importing theta does NOT
//     register.
//   - IMP-3 — `computeThetaLibExports` over the resolved `.thetalib`'s top-level forms,
//     then `checkImportedSymbols` against the importing specifiers
//     (`theta/parse/import-unknown-symbol` / `theta/parse/import-name-collision`).
//   - IMP-4 — the resolved `.thetalib` is parsed through `parseThetaDocument`, whose
//     `.thetalib`-keyed top-level check emits `theta/parse/thetalib-top-level-statement`;
//     those diagnostics are surfaced here so an illegal `.thetalib` top-level form
//     un-registers the importing theta.
//   - IMP-5 — `detectImportCycle` over the per-load-pass static `.thetalib` graph
//     (`theta/load/import-cycle`). Its edge set spans `import … from` and
//     `export … from` edges alike, per imports.md §Cycles and the code's registry
//     Trigger, so a re-export cycle is diagnosed on the same code as an import
//     cycle.
//   - Re-export chain resolution (imports.md §Re-exports, the resolution
//     paragraph) — three ordered phases over the `export … from` edges reachable
//     from the resolved entry libs. `closeOverReExports` collects those libs and
//     their edges, resolving each `export` STATEMENT's path once so
//     `theta/load/unresolvable-thetalib-path` fires once over the statement's
//     range, as on the import side. `fixReExportedNames` then computes every
//     collected lib's resolved export set as the LEAST FIXPOINT of the collected
//     file set: seeded with each lib's own declaration names, a re-export's
//     `exported` name is added whenever its source lib's current set carries its
//     `source` name, iterated to stability. Only then is each edge diagnosed: an
//     edge whose `source` is absent from that settled set draws one
//     `theta/parse/import-unknown-symbol` over the SPECIFIER (that code names one
//     symbol), sited on the re-exporting lib and reaching the importing theta
//     through the same registration-error arm as IMP-4. Diagnosing only after
//     the fixpoint settles is what makes the answer a function of the
//     `.thetalib` file set alone — never of the entry lib or the order an
//     importing file names its imports — which is the guarantee imports.md
//     §Re-exports states: a name that genuinely flows round a cycle is provided,
//     and only a name nothing in the reachable set provides is an unknown symbol.
//     `materializeChain` follows the same edges to bind the importing specifier's
//     local name to the declaration a chain ultimately names, bounded by a
//     visited-path set.
//
// The resolved `.thetalib`'s exported declarations are also materialised into the
// importing theta's runtime environment (imports.md §Visibility): an imported
// `fn` becomes callable (IMP-6) and — because its body runs through the caller's
// executor deps — its `@`-queries drive the caller's conversation (IMP-7).
//
// Spec: spec_topics/imports.md (§"`.thetalib` file rules", §"Path resolution",
// IMP-1, §Visibility, §"Unknown imported symbol", §Cycles),
// diagnostics/code-registry-parse.md, diagnostics/code-registry-load.md.

import { posix } from "node:path";
import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import type { FileSystem } from "../seams/file-system";
import {
  RelativeThetaLibResolver,
  checkImportNameCollisions,
  checkImportUnknownSymbols,
  computeThetaLibExports,
  detectImportCycle,
  loadThetaLibImport,
  type ImportSpecifier,
  type ReExportSpecifier,
  type Resolver,
  type ThetaLibDeclaration,
  type ThetaLibDirectoryProbe,
  type ThetaLibImportGraph,
  type ThetaLibModuleForms,
} from "../parser/imports";
import {
  parseThetaDocument,
  resolveSubagentSessionConfigAt,
  type ImportDecl,
  type ThetaBody,
  type ThetaDocument,
  type ParseThetaDocumentDeps,
} from "../parser/theta-document";
import type { ParsedFrontmatter } from "../parser/frontmatter";
import type { MaterializedImport } from "../runtime/lexical-environment";
import type { ThetaCompositionInput } from "./theta-composition-producer";
import {
  checkSubagentFnModelOverrides,
  checkSubagentFnStaticResolution,
  collectSubagentFns,
} from "./subagent-fn-static-checks";

/** Forward-slash-normalise a host path so the posix-based resolver joins cleanly. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/** The `.thetalib` file stem (basename minus `.thetalib`), used as the cycle-graph node id. */
function thetalibStem(path: string): string {
  const base = posix.basename(normalizePath(path));
  return base.endsWith(".thetalib") ? base.slice(0, -".thetalib".length) : base;
}

/** The top-level `import` declarations of a parsed body, in source order. */
function collectImports(body: ThetaBody): ImportDecl[] {
  const out: ImportDecl[] = [];
  for (const stmt of body.statements) {
    if (stmt.kind === "import") {
      out.push(stmt);
    }
  }
  return out;
}

/** The importing file's top-level declaration names (the collision-check arm). */
function collectTopLevelNames(body: ThetaBody): string[] {
  const names: string[] = [];
  for (const stmt of body.statements) {
    if (stmt.kind === "schema" || stmt.kind === "enum" || stmt.kind === "fn") {
      names.push(stmt.name);
    }
  }
  return names;
}

/**
 * Extract the top-level forms of a resolved `.thetalib` module that bear on
 * downstream visibility (imports.md §Visibility + §Re-exports): every top-level
 * `schema` / `enum` / `fn` (auto-exported), every `export … from` re-export, and
 * every plain `import` local. The parser's `specifiers` carry the `as`-alias
 * mapping, so a re-export's downstream name is its `exported` alias and a plain
 * import's binding is its `local` alias.
 */
function extractThetaLibForms(body: ThetaBody): ThetaLibModuleForms {
  const declarations: ThetaLibDeclaration[] = [];
  const reExports: ReExportSpecifier[] = [];
  const plainImports: ImportSpecifier[] = [];
  for (const stmt of body.statements) {
    if (stmt.kind === "schema" || stmt.kind === "enum" || stmt.kind === "fn") {
      declarations.push({ kind: stmt.kind, name: stmt.name });
    } else if (stmt.kind === "export") {
      for (const specifier of stmt.specifiers) {
        // Invariant, not a guard: a conforming `ExportDecl` always carries a
        // non-empty `.thetalib` path literal — a from-less specifier list is
        // refused at parse time (`theta/parse/import-missing-from-clause`,
        // imports.md §"Re-exports"), but that is not the only route: an
        // empty path literal is refused separately, by the extension check.
        // `stmt.path` can still be `""` here for a REFUSED lib, because
        // `checkThetaImports` pushes that lib's parse errors and then calls
        // this reader over the same parsed body regardless (bug 0058 §Fix
        // constraint 3); the pushed error is what keeps a from-less
        // re-export from ever reaching a REGISTERED export set, so this
        // reader does not re-test the path itself.
        reExports.push({
          source: specifier.source,
          exported: specifier.local,
          fromPath: stmt.path,
          range: specifier.range,
        });
      }
    } else if (stmt.kind === "import") {
      for (const specifier of stmt.specifiers) {
        plainImports.push({
          source: specifier.source,
          local: specifier.local,
          range: specifier.range,
        });
      }
    }
  }
  return { declarations, reExports, plainImports };
}

/**
 * Materialise one imported symbol from the resolved `.thetalib`'s body into a
 * runtime binding (imports.md §Visibility): an imported `fn` carries its
 * `FnDecl` body (callable), an imported `schema` / `enum` registers its
 * constructor / variants. The resolved declaration is found by its SOURCE name
 * (the name in the `.thetalib` file) and bound under the specifier's LOCAL name (the
 * `as` alias, or the source name when unaliased), which the runtime keys imports
 * by. Returns `undefined` when the source names no top-level declaration (an
 * unknown symbol — already diagnosed by IMP-3).
 */
function materializeSymbol(
  source: string,
  local: string,
  body: ThetaBody,
  callingFrontmatter: ParsedFrontmatter | null,
): MaterializedImport | undefined {
  for (const stmt of body.statements) {
    if (stmt.kind === "fn" && stmt.name === source) {
      // RFC 0001 FN-9: a `.thetalib` `subagent fn`'s session config was resolved
      // at PARSE time against the `.thetalib`'s own (absent) frontmatter, so it
      // carries only its `with`-clause overrides. Re-resolve it against the
      // CALLING theta's frontmatter here (materialisation runs in the calling
      // theta's compose context) so the spawned session inherits the CALLING
      // theta's model / tools / tool_loop / respond_repair — the same anchor as
      // the existing "calling theta's conversation" rule for library functions.
      const fn =
        stmt.subagent === true
          ? {
              ...stmt,
              sessionConfig: resolveSubagentSessionConfigAt(stmt, callingFrontmatter),
            }
          : stmt;
      return { name: local, kind: "fn", fn };
    }
    if (stmt.kind === "schema" && stmt.name === source) {
      return { name: local, kind: "schema" };
    }
    if (stmt.kind === "enum" && stmt.name === source) {
      return { name: local, kind: "enum", variants: stmt.variants ?? [] };
    }
  }
  return undefined;
}

/** Only error-severity parse/load diagnostics block registration (warnings still register). */
function isRegistrationError(diagnostic: Diagnostic): boolean {
  return (
    diagnostic.severity === "error" &&
    (diagnostic.code.startsWith("theta/parse/") ||
      diagnostic.code.startsWith("theta/load/"))
  );
}

/**
 * A `ThetaLibDirectoryProbe` backed by an async pre-populated cache: the resolver's
 * synchronous `entries` / `entryReadable` read from a cache the load pass fills
 * (via `precache`) before each `resolve` call — the byte-for-byte enumeration
 * IMP-1 requires, without a synchronous filesystem call.
 */
class CachingThetaLibProbe implements ThetaLibDirectoryProbe {
  /** Parent dir (forward-slash) → its byte-exact entry names, or `null` when unreadable. */
  private readonly entriesCache = new Map<string, readonly string[] | null>();
  /** `${dir}\u0000${name}` → whether the byte-exact entry is readable. */
  private readonly readableCache = new Map<string, boolean>();

  constructor(private readonly fs: FileSystem) {}

  /** Pre-read the directory a `spec` resolves against, so a later `resolve` reads it synchronously. */
  async precache(spec: string, fromFile: string): Promise<void> {
    if (!spec.startsWith("./") && !spec.startsWith("../")) {
      return; // non-relative spec: the resolver throws before touching the probe.
    }
    if (!spec.endsWith(".thetalib")) {
      return; // non-`.thetalib` spec: the resolver throws before touching the probe.
    }
    const resolved = posix.join(posix.dirname(fromFile), spec);
    const parent = posix.dirname(resolved);
    if (this.entriesCache.has(parent)) {
      return;
    }
    // An unreadable parent directory is an unresolvable path: a `null` cache
    // entry makes `entries` throw, which `loadThetaLibImport` treats as the
    // resolution-failure signal (IMP-1). The `.then(ok, err)` rejection arm
    // (not a broad `try`/`catch`) is the pipeline's sanctioned I/O-boundary
    // pattern (mirrors `parseDiscoveredTheta`'s `fs.readBytes` read).
    const names = await this.fs.readdir(parent).then(
      (value) => value,
      () => null,
    );
    this.entriesCache.set(parent, names);
    if (names !== null) {
      for (const name of names) {
        // A byte-exact entry `readdir` listed is readable; the EACCES / broken-
        // symlink refinement is not exercised by the shipped host seam here.
        this.readableCache.set(`${parent}\u0000${name}`, true);
      }
    }
  }

  entries(dir: string): readonly string[] {
    const names = this.entriesCache.get(dir);
    if (names === undefined || names === null) {
      throw new Error(`.thetalib parent directory not readable: ${dir}`);
    }
    return names;
  }

  entryReadable(dir: string, name: string): boolean {
    return this.readableCache.get(`${dir}\u0000${name}`) ?? false;
  }
}

/** A parsed `.thetalib` module, cached per resolved path across the load pass. */
interface ParsedThetaLib {
  readonly document: ThetaDocument;
}

/** The outcome of the per-theta `.thetalib` import resolution pass. */
export interface ThetaImportCheck {
  /** Every diagnostic; an error-severity entry un-registers the importing theta. */
  readonly diagnostics: Diagnostic[];
  /** The resolved `.thetalib` symbols materialised into the runtime environment (IMP-6 / IMP-7). */
  readonly imports: MaterializedImport[];
}

/**
 * Run the load-time `.thetalib` import checks for one discovered theta, returning
 * every diagnostic (error-severity entries un-register the theta) and the
 * resolved imported symbols to materialise into its runtime environment.
 *
 * A theta with no top-level `import` (or an in-memory theta with no source path)
 * resolves nothing and yields an empty result — the passing valid-import control
 * is preserved: a resolvable `.thetalib` whose exports satisfy every specifier
 * produces no diagnostic and registers cleanly.
 */
export async function checkThetaImports(
  input: ThetaCompositionInput,
  deps: {
    readonly fs: FileSystem;
    readonly parseDeps: ParseThetaDocumentDeps;
  },
): Promise<ThetaImportCheck> {
  const diagnostics: Diagnostic[] = [];
  const imports: MaterializedImport[] = [];
  const importDecls = collectImports(input.body);
  if (importDecls.length === 0 || input.sourcePath === undefined) {
    return { diagnostics, imports };
  }

  const fromFile = normalizePath(input.sourcePath);
  const probe = new CachingThetaLibProbe(deps.fs);
  const resolver: Resolver = new RelativeThetaLibResolver(probe);
  const parseCache = new Map<string, ParsedThetaLib | undefined>();

  const parseThetaLib = async (resolvedPath: string): Promise<ParsedThetaLib | undefined> => {
    if (parseCache.has(resolvedPath)) {
      return parseCache.get(resolvedPath);
    }
    // Resolved-but-unreadable (or unparseable) `.thetalib` → `undefined`, treated as
    // no forms/exports. The `.then(ok, err)` rejection arm is the pipeline's
    // sanctioned I/O-boundary pattern (not a broad `try`/`catch`): a read
    // rejection OR a synchronous parse throw inside the fulfil arm both settle
    // to `undefined`.
    const parsed: ParsedThetaLib | undefined = await deps.fs
      .readBytes(resolvedPath)
      .then(
        (bytes) => ({
          document: parseThetaDocument({ path: resolvedPath, bytes }, deps.parseDeps),
        }),
        () => undefined,
      );
    parseCache.set(resolvedPath, parsed);
    return parsed;
  };

  // Build the static `.thetalib` import graph transitively from this theta's direct
  // imports (imports.md §Cycles). Nodes are `.thetalib` stems; an edge `A → B`
  // exists when `A.thetalib` has a resolvable `import … from "./B.thetalib"` OR a
  // resolvable `export … from "./B.thetalib"` re-export: imports.md §Cycles walks
  // the `.thetalib` graph over both edge kinds, which is also what
  // `collectCallableClosureSources` already does.
  const graphEdges = new Map<string, string[]>();
  const walked = new Set<string>();
  const walkThetaLib = async (resolvedPath: string): Promise<void> => {
    if (walked.has(resolvedPath)) {
      return;
    }
    walked.add(resolvedPath);
    const stem = thetalibStem(resolvedPath);
    const parsed = await parseThetaLib(resolvedPath);
    const targets: string[] = [];
    if (parsed !== undefined) {
      // One edge per STATEMENT (an `export` statement's N specifiers name one
      // path, so they are one edge), mirroring the `import` side.
      const edges: Array<{ path: string; range: SourceRange }> = [];
      for (const stmt of parsed.document.body.statements) {
        if (stmt.kind === "import" || (stmt.kind === "export" && stmt.path.endsWith(".thetalib"))) {
          edges.push({ path: stmt.path, range: stmt.range });
        }
      }
      for (const edge of edges) {
        await probe.precache(edge.path, normalizePath(resolvedPath));
        const load = loadThetaLibImport(resolver, edge.path, normalizePath(resolvedPath), {
          file: resolvedPath,
          range: edge.range,
        });
        if (load.registered && load.resolvedPath !== undefined) {
          targets.push(thetalibStem(load.resolvedPath));
          await walkThetaLib(load.resolvedPath);
        }
      }
    }
    graphEdges.set(stem, targets);
  };

  /**
   * One `export { source as exported } from "<specPath>"` specifier, with both
   * ends already resolved: `fromLib` re-exports `exported`, drawing on
   * `sourceLib`'s `source`.
   */
  interface ReExportEdge {
    readonly fromLib: string;
    readonly sourceLib: string;
    readonly specPath: string;
    readonly source: string;
    readonly exported: string;
    readonly range: SourceRange;
  }

  /** Each collected lib's own top-level declaration names — the fixpoint's seed. */
  const libDeclaredNames = new Map<string, readonly string[]>();
  const reExportEdges: ReExportEdge[] = [];
  const closedOver = new Set<string>();

  /**
   * Phase 1 — collect the `.thetalib` files reachable from one resolved entry lib
   * over `export … from` edges, with their declaration names and their edges.
   *
   * Resolution happens here and once per `export` STATEMENT, because the path
   * belongs to the statement and not to each of its specifiers: that is what
   * makes `theta/load/unresolvable-thetalib-path` fire once over `stmt.range`,
   * identically to the import loop below ranging it over `decl.range`. The
   * per-path guard also bounds a re-export cycle, so no name is admitted or
   * diagnosed during collection — the answer to "which names does this lib
   * provide" is not knowable until the fixpoint below settles.
   */
  const closeOverReExports = async (resolvedPath: string): Promise<void> => {
    if (closedOver.has(resolvedPath)) {
      return;
    }
    closedOver.add(resolvedPath);
    const parsed = await parseThetaLib(resolvedPath);
    if (parsed === undefined) {
      libDeclaredNames.set(resolvedPath, []);
      return;
    }
    libDeclaredNames.set(
      resolvedPath,
      extractThetaLibForms(parsed.document.body).declarations.map(
        (declaration) => declaration.name,
      ),
    );
    for (const stmt of parsed.document.body.statements) {
      if (stmt.kind !== "export") {
        continue;
      }
      // A path not ending in `.thetalib` is SKIPPED, mirroring the import loop's
      // extension skip below: the parse-time
      // `theta/parse/import-non-thetalib-extension` is already the answer for
      // that spelling (and a from-less export's `path: ""` is the same rule), so
      // this analysis does not double-report it.
      if (!stmt.path.endsWith(".thetalib")) {
        continue;
      }
      await probe.precache(stmt.path, resolvedPath);
      const load = loadThetaLibImport(resolver, stmt.path, resolvedPath, {
        file: resolvedPath,
        range: stmt.range,
      });
      if (!load.registered || load.resolvedPath === undefined) {
        // IMP-1 on the re-export statement's own path, sited on the re-exporting
        // lib. An unresolvable source lib contributes no edge, so the specifiers
        // it names draw no second, unknown-symbol report.
        diagnostics.push(...load.diagnostics);
        continue;
      }
      for (const specifier of stmt.specifiers) {
        reExportEdges.push({
          fromLib: resolvedPath,
          sourceLib: load.resolvedPath,
          specPath: stmt.path,
          source: specifier.source,
          exported: specifier.local,
          range: specifier.range,
        });
      }
      await closeOverReExports(load.resolvedPath);
    }
  };

  /**
   * Phase 2 — the least fixpoint of the collected file set: each lib's resolved
   * export set is its own declaration names plus every re-export whose source lib
   * provides the name it draws on.
   *
   * Iterating to stability rather than recursing down one chain is what makes the
   * result a pure function of the `.thetalib` file set (imports.md §Re-exports):
   * a name that genuinely flows round a cycle is reached on a later round instead
   * of being cut by whichever chain the derivation happened to enter on. The sets
   * only grow, inside the finite universe of names the collected files spell, so
   * the loop terminates.
   */
  const fixReExportedNames = (): Map<string, Set<string>> => {
    const provided = new Map<string, Set<string>>();
    for (const [path, names] of libDeclaredNames) {
      provided.set(path, new Set(names));
    }
    let grew = true;
    while (grew) {
      grew = false;
      for (const edge of reExportEdges) {
        const target = provided.get(edge.fromLib);
        if (target === undefined || target.has(edge.exported)) {
          continue;
        }
        if (provided.get(edge.sourceLib)?.has(edge.source) === true) {
          target.add(edge.exported);
          grew = true;
        }
      }
    }
    return provided;
  };

  /**
   * Phase 3 — one `theta/parse/import-unknown-symbol` per re-export whose source
   * name the settled fixpoint shows nothing provides, sited on the re-exporting
   * lib and ranged over the specifier (that code names one symbol).
   */
  const diagnoseReExports = (provided: Map<string, Set<string>>): void => {
    for (const edge of reExportEdges) {
      const sourceExports = provided.get(edge.sourceLib) ?? new Set<string>();
      if (sourceExports.has(edge.source)) {
        continue;
      }
      diagnostics.push(
        ...checkImportUnknownSymbols(
          edge.fromLib,
          edge.specPath,
          [{ source: edge.source, local: edge.exported, range: edge.range }],
          [...sourceExports],
        ),
      );
    }
  };

  // Materialise an importing specifier by following the
  // re-export chain (imports.md §Re-exports, the resolution paragraph) when the
  // resolved lib's own body carries no matching
  // top-level declaration for the SOURCE name — searching the re-export whose
  // `exported` equals that source name, at its resolved source lib, binding
  // under the IMPORTING specifier's LOCAL name throughout. Bounded by a
  // visited-path set (fresh per top-level specifier) so a re-export cycle
  // terminates by contributing no binding, matching `resolveLibExports`'
  // in-progress bound.
  const materializeChain = async (
    source: string,
    local: string,
    resolvedPath: string,
    body: ThetaBody,
    callingFrontmatter: ParsedFrontmatter | null,
    visited: Set<string>,
  ): Promise<MaterializedImport | undefined> => {
    if (visited.has(resolvedPath)) {
      return undefined;
    }
    visited.add(resolvedPath);
    const direct = materializeSymbol(source, local, body, callingFrontmatter);
    if (direct !== undefined) {
      return direct;
    }
    for (const reExport of extractThetaLibForms(body).reExports) {
      if (reExport.exported !== source || !reExport.fromPath.endsWith(".thetalib")) {
        continue;
      }
      await probe.precache(reExport.fromPath, resolvedPath);
      const load = loadThetaLibImport(resolver, reExport.fromPath, resolvedPath, {
        file: resolvedPath,
        range: reExport.range,
      });
      if (!load.registered || load.resolvedPath === undefined) {
        continue;
      }
      const sourceParsed = await parseThetaLib(load.resolvedPath);
      if (sourceParsed === undefined) {
        continue;
      }
      const materialized = await materializeChain(
        reExport.source,
        local,
        load.resolvedPath,
        sourceParsed.document.body,
        callingFrontmatter,
        visited,
      );
      if (materialized !== undefined) {
        return materialized;
      }
    }
    return undefined;
  };

  const localTopLevelNames = collectTopLevelNames(input.body);
  const entryStems: string[] = [];
  /** Every resolved directly-imported lib, the roots of the re-export closure. */
  const entryResolvedPaths: string[] = [];
  // The union of every importing `import … from` decl's specifiers, checked once
  // for name collisions after the per-decl loop (imports.md §"Name collisions"):
  // two imports binding the same local name — from two different `.thetalib` files or
  // the same file twice — is `theta/parse/import-name-collision`, not last-import-
  // wins shadowing. Per-decl checking would only see one specifier at a time and
  // miss the import-vs-import collision the import-vs-local arm already catches.
  const allSpecifiers: ImportSpecifier[] = [];

  for (const decl of importDecls) {
    const spec = decl.path;
    const site = { file: input.sourcePath, range: decl.range };

    // A wrong-extension / backslash import already produced its parse error
    // (IMP-2, at whole-file parse); do not resolve it (it can never resolve).
    if (!spec.endsWith(".thetalib")) {
      continue;
    }

    // IMP-1: resolve the spec; a throw from the resolver is
    // `theta/load/unresolvable-thetalib-path` and the theta does not register.
    await probe.precache(spec, fromFile);
    const load = loadThetaLibImport(resolver, spec, fromFile, site);
    diagnostics.push(...load.diagnostics);
    if (!load.registered || load.resolvedPath === undefined) {
      continue;
    }
    const resolvedPath = load.resolvedPath;
    entryStems.push(thetalibStem(resolvedPath));
    entryResolvedPaths.push(resolvedPath);

    // IMP-4: parse the resolved `.thetalib`; its `.thetalib`-keyed top-level check
    // (and any nested import extension error) surfaces here so an illegal form
    // un-registers the importing theta.
    const parsed = await parseThetaLib(resolvedPath);
    if (parsed === undefined) {
      continue;
    }
    for (const diagnostic of parsed.document.diagnostics) {
      if (isRegistrationError(diagnostic)) {
        diagnostics.push(diagnostic);
      }
    }

    // IMP-3: compute the resolved `.thetalib`'s export set and check this decl's
    // specifiers against it (unknown-symbol arm, per resolved file). The
    // name-collision arm runs once after the loop over the union of every decl's
    // specifiers, so an import-vs-import collision across two separate `import`
    // statements is caught (not silently last-import-wins).
    const forms = extractThetaLibForms(parsed.document.body);
    const resolvedExports = computeThetaLibExports(forms);
    const specifiers = decl.specifiers;
    allSpecifiers.push(...specifiers);
    diagnostics.push(
      ...checkImportUnknownSymbols(
        input.sourcePath,
        spec,
        specifiers,
        resolvedExports,
      ),
    );

    // IMP-6 / IMP-7: materialise each resolved symbol so an imported `fn` is
    // callable and its query body drives the caller's conversation. The
    // declaration is found by its source name, following the re-export chain
    // when the resolved lib's own body carries no matching declaration, and
    // bound under its local (`as`) name.
    for (const specifier of specifiers) {
      const materialized = await materializeChain(
        specifier.source,
        specifier.local,
        resolvedPath,
        parsed.document.body,
        input.frontmatter,
        new Set<string>(),
      );
      if (materialized !== undefined) {
        imports.push(materialized);
      }
    }

    // Seed the cycle graph from this resolved `.thetalib`.
    await walkThetaLib(resolvedPath);
  }

  // Re-export chain resolution, phases 1–3 (imports.md §Re-exports): collect the
  // `export … from` closure of every resolved entry lib, settle the fixpoint over
  // the whole collected file set, and only then diagnose. Running it over the
  // union of the entry libs rather than per entry is what the spec sentence
  // requires — the resolved export set and the errors reported for it are a
  // function of the `.thetalib` file set alone — and a re-export that fails it
  // un-registers the importing theta through the registration-error arm rather
  // than by a second diagnostic sited on the importer's own specifier, whose
  // admission stays on the SYNTACTIC set (`computeThetaLibExports`) above.
  for (const resolvedPath of entryResolvedPaths) {
    await closeOverReExports(resolvedPath);
  }
  diagnoseReExports(fixReExportedNames());

  // IMP-3 (name collisions): check the union of every resolved decl's specifiers
  // once, so two imports binding the same local name — across two separate
  // `import` statements, whether from different `.thetalib` files or the same file
  // twice — fire `theta/parse/import-name-collision` (imports.md §"Name
  // collisions"), mirroring the import-vs-local-declaration arm.
  diagnostics.push(
    ...checkImportNameCollisions(
      input.sourcePath,
      allSpecifiers,
      localTopLevelNames,
    ),
  );

  // RFC 0001 FN-6 across the import boundary: an imported `.thetalib` `subagent
  // fn` body is materialised into the calling theta's environment and, when
  // called, runs against the calling theta's executor with the LIBRARY's names
  // in scope. So a self-recursive `subagent fn r(x){ r(x)? }` (or a mutual cycle
  // between two `subagent fn`s) declared INSIDE a `.thetalib` recurses without
  // bound at runtime exactly as a same-file self-cycle does. The compose pass'
  // own `checkSubagentFnStaticResolution` runs only over the composing theta's
  // top-level body, so the imported bodies must be cycle-checked here. Run the
  // same unit-tested check over every parsed `.thetalib` body (entry AND
  // transitively-walked), keyed by resolved path so each lib is checked once; a
  // length-1 `theta/load/invocation-cycle` un-registers the importing theta.
  // (Mutual recursion that spans two `.thetalib` files requires each to `import`
  // the other, which is an import cycle already caught by IMP-5 below.)
  for (const [resolvedPath, parsed] of parseCache) {
    if (parsed === undefined) {
      continue;
    }
    diagnostics.push(
      ...checkSubagentFnStaticResolution({
        body: parsed.document.body,
        file: resolvedPath,
        parseDiagnostics: parsed.document.diagnostics,
      }),
    );
    // RFC 0001 FN-7 / FN-9: an imported `.thetalib` `subagent fn`'s
    // `with { model }` override is applied at spawn; hold it to the same
    // load-time bar as an in-file override (and as frontmatter `model:`), so an
    // unresolvable library override un-registers the importing theta rather than
    // silently falling back at runtime.
    diagnostics.push(
      ...checkSubagentFnModelOverrides(
        collectSubagentFns(parsed.document.body),
        resolvedPath,
        deps.parseDeps.modelMatcher,
      ),
    );
  }

  // IMP-5: walk the static import graph from each directly-imported `.thetalib`;
  // the first cycle discovered un-registers the importing theta.
  const graph: ThetaLibImportGraph = { edges: graphEdges };
  for (const entry of entryStems) {
    const cycle = detectImportCycle(entry, graph, {
      file: input.sourcePath,
      range: input.body.statements[0]?.range ?? {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
      },
    });
    if (cycle !== undefined) {
      diagnostics.push(cycle);
      break;
    }
  }

  return { diagnostics, imports };
}
