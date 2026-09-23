// The per-theta `.thetalib` import resolution kit (PTQ-1147 Seam B): the
// directory probe / parse-cache / import-graph-walk / module-scope / re-export
// materialisation closures `checkThetaImports` (import-static-checks.ts)
// threads through the load pass, with the shared unreadable-path bookkeeping
// (bug 0428) and the resolved-but-unreadable IMP-1 diagnostic constructor.

import { posix } from "node:path";
import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import type { FileSystem } from "../seams/file-system";
import { canonicalizePath } from "../runtime/invocation";
import { normalizePath } from "../normalize-path";
import {
  UNRESOLVABLE_THETALIB_PATH_CODE,
  UNRESOLVABLE_THETALIB_PATH_HINT,
  loadThetaLibImport,
  unresolvableThetaLibPathMessage,
  type Resolver,
  type ThetaLibDirectoryProbe,
} from "../parser/imports";
import {
  resolveSubagentSessionConfigAt,
  type ThetaBody,
  type ThetaDocument,
} from "../parser/theta-document";
import type { ParsedFrontmatter } from "../parser/frontmatter";
import {
  enumDeclaringKey,
  type EnumRegistration,
  type MaterializedImport,
  type ModuleScope,
} from "../runtime/lexical-environment";
import { parseViaPassCache, type PassParseDeps } from "./pass-parse-cache";
import { resolveAndParseThetaLibReference, resolveThetaLibImports } from "./thetalib-load-parse";
import { extractThetaLibForms, type ThetaLibDeclarationStmt } from "./import-static-checks";

/**
 * `theta/load/unresolvable-thetalib-path` for a spec that RESOLVED (a byte-exact,
 * `readdir`-listed entry) but whose bytes could not be read (bug 0428): IMP-1's
 * "exists but is not readable … likewise unresolvable" clause, reported with the
 * identical code, message and hint the resolution-failure arm
 * (`loadThetaLibImport`) uses, so a read failure and a resolution failure are
 * indistinguishable to a reader of the diagnostic.
 */
export function unreadableThetaLibDiagnostic(site: { file: string; range: SourceRange }, spec: string): Diagnostic {
  return {
    severity: "error",
    code: UNRESOLVABLE_THETALIB_PATH_CODE,
    file: site.file,
    range: site.range,
    message: unresolvableThetaLibPathMessage(spec),
    hint: UNRESOLVABLE_THETALIB_PATH_HINT,
  };
}

/**
 * A `ThetaLibDirectoryProbe` backed by an async pre-populated cache: the resolver's
 * synchronous `entries` / `entryReadable` read from a cache the load pass fills
 * (via `precache`) before each `resolve` call — the byte-for-byte enumeration
 * IMP-1 requires, without a synchronous filesystem call.
 */
export class CachingThetaLibProbe implements ThetaLibDirectoryProbe {
  /** Parent dir (forward-slash) → its byte-exact entry names, or `null` when unreadable. */
  private readonly entriesCache = new Map<string, readonly string[] | null>();
  /** `${dir}\u0000${name}` → whether the byte-exact entry is readable. */
  private readonly readableCache = new Map<string, boolean>();
  /** Resolved-path string → its canonical `realpath` form, precached beside the directory listing (bug 0361). */
  private readonly canonicalCache = new Map<string, string>();

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
    if (!this.canonicalCache.has(resolved)) {
      // `canonicalizePath` mints the on-disk-cased identity (realpath.native
      // folds case-variant DIRECTORY segments on a case-insensitive host;
      // byte-identity on a case-sensitive host). A realpath failure — the
      // file removed between readdir and here, or an in-memory FS double whose
      // realpath rejects — falls back to the joined string, the
      // pre-canonicalisation identity, so this never worsens resolution and
      // never throws. The `.then(ok, err)` arm is the sanctioned I/O-boundary
      // pattern (mirrors the readdir read below), not a broad catch.
      const canonical = await canonicalizePath(this.fs, resolved).then(
        (real) => real,
        () => resolved,
      );
      this.canonicalCache.set(resolved, canonical);
    }
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

  canonicalize(resolvedPath: string): string {
    // Identity fallback when precache found no realpath (an unresolved miss,
    // or a double without realpath) preserves the pre-fix string identity —
    // strictly no worse than before this fix.
    return this.canonicalCache.get(resolvedPath) ?? resolvedPath;
  }
}

/** A parsed `.thetalib` module, cached per resolved path across the load pass. */
export interface ParsedThetaLib {
  readonly document: ThetaDocument;
}

/**
 * The `enum` declarations of a `.thetalib` body, as `EnumRegistration`s tagged
 * with their declaring-declaration identity key (bug 0303 / bug 0305): a
 * module-scope enum read and a caller-side imported read of the SAME
 * declaration mint identical `enumDeclaringKey(resolvedPath, name)` tags, so
 * they compare `==` equal.
 */
export function enumsOf(body: ThetaBody, resolvedPath: string): EnumRegistration[] {
  const out: EnumRegistration[] = [];
  for (const stmt of body.statements) {
    if (stmt.kind === "enum" && stmt.variants !== undefined) {
      out.push({
        name: stmt.name,
        variants: stmt.variants,
        ...(stmt.variantValues !== undefined ? { values: stmt.variantValues } : {}),
        declaringKey: enumDeclaringKey(resolvedPath, stmt.name),
      });
    }
  }
  return out;
}

/**
 * Completeness ledger for `materializeSymbol`'s per-kind `if`-chain below:
 * each key names one kind that chain's own return-shape logic handles by
 * hand (its per-kind result shape is the behaviour, so it does not switch
 * through {@link isThetaLibDeclarationStmt}). `satisfies` fails `tsc` the
 * moment {@link ThetaLibDeclarationStmt} gains a kind not also listed here.
 */
const MATERIALIZE_SYMBOL_DECLARATION_KINDS = {
  fn: true,
  schema: true,
  enum: true,
} satisfies Record<ThetaLibDeclarationStmt["kind"], true>;

/**
 * Materialise one imported symbol from the resolved `.thetalib`'s body into a
 * runtime binding (imports.md §Visibility): an imported `fn` carries its
 * `FnDecl` body (callable), an imported `schema` / `enum` registers its
 * constructor / variants. The resolved declaration is found by its SOURCE name
 * (the name in the `.thetalib` file) and bound under the specifier's LOCAL name (the
 * `as` alias, or the source name when unaliased), which the runtime keys imports
 * by. `resolvedPath` is the LIB `body` was parsed from — for an `enum` it feeds
 * the declaring-declaration tag (`enumDeclaringKey`, bug 0305), so the runtime
 * keys enum identity on the declaration, not the local alias. Returns
 * `undefined` when the source names no top-level declaration (an unknown
 * symbol — already diagnosed by IMP-3).
 */
export function materializeSymbol(
  source: string,
  local: string,
  resolvedPath: string,
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
      return {
        name: local,
        kind: "enum",
        variants: stmt.variants ?? [],
        ...(stmt.variantValues !== undefined ? { values: stmt.variantValues } : {}),
        // The declaring-declaration identity (bug 0305): keyed on the LIB
        // this declaration is found in (`resolvedPath`) and its declared
        // name (`source`), not the importing specifier's local alias
        // (`local`) — so two aliases of one declaration, or a direct import
        // and a re-export rename of the same declaration, mint the same
        // runtime tag.
        declaringKey: enumDeclaringKey(resolvedPath, source),
      };
    }
  }
  return undefined;
}

/** Create the mutually recursive module-scope and re-export materializers with their own caches. */
function createMaterializer(
  parseThetaLib: (resolvedPath: string) => Promise<ParsedThetaLib | undefined>,
  probe: CachingThetaLibProbe,
  resolver: Resolver,
) {
  // Bug 0303: the DECLARING module's own environment for an imported `fn`,
  // built from the lib's own body plus its own materialised imports
  // (recursively — a lib-to-lib import) and its own enum registrations.
  // Cached per resolved path (reusing the existing path-keyed `parseCache`
  // pattern) and bounded by an in-progress visited set INDEPENDENTLY of IMP-5's
  // cycle refusal (constraint 4): IMP-5 refuses an import cycle for the
  // IMPORTING THETA at the top level, but building a module scope is a
  // separate recursive walk over the SAME `.thetalib` graph that this cache
  // must bound on its own terms.
  const moduleScopeCache = new Map<string, ModuleScope>();
  const moduleScopeInProgress = new Set<string>();
  const buildModuleScope = async (
    resolvedPath: string,
    body: ThetaBody,
    callingFrontmatter: ParsedFrontmatter | null,
  ): Promise<ModuleScope> => {
    const cached = moduleScopeCache.get(resolvedPath);
    if (cached !== undefined) {
      return cached;
    }
    if (moduleScopeInProgress.has(resolvedPath)) {
      // A lib-to-lib import cycle reached while BUILDING a module scope
      // returns a bounded partial — this lib's own enums, no imports — rather
      // than recursing without termination.
      return { body, imports: [], enums: enumsOf(body, resolvedPath), residence: resolvedPath };
    }
    moduleScopeInProgress.add(resolvedPath);
    const moduleImports: MaterializedImport[] = [];
    for await (const { stmt, resolved } of resolveThetaLibImports(
      body,
      resolvedPath,
      probe,
      resolver,
      parseThetaLib,
    )) {
      for (const specifier of stmt.specifiers) {
        const materialized = await materializeChain(
          specifier.source,
          specifier.local,
          resolved.resolvedPath,
          resolved.parsed.document.body,
          callingFrontmatter,
          new Set<string>(),
        );
        if (materialized !== undefined) {
          moduleImports.push(materialized);
        }
      }
    }
    const scope: ModuleScope = {
      body,
      imports: moduleImports,
      enums: enumsOf(body, resolvedPath),
      // Bug 0354, INV-4: the DECLARING lib's own resolved path (this function
      // is always called with the declaring lib's `resolvedPath`/`body`, see
      // `materializeChain`'s doc-comment above) — the cross-file classifier's
      // callee-residence input.
      residence: resolvedPath,
    };
    moduleScopeInProgress.delete(resolvedPath);
    moduleScopeCache.set(resolvedPath, scope);
    return scope;
  };

  // Materialise an importing specifier by following the
  // re-export chain (imports.md §Re-exports, the resolution paragraph) when the
  // resolved lib's own body carries no matching
  // top-level declaration for the SOURCE name — searching the re-export whose
  // `exported` equals that source name, at its resolved source lib, binding
  // under the IMPORTING specifier's LOCAL name throughout. Bounded by a
  // visited-path set (fresh per top-level specifier) so a re-export cycle
  // terminates by contributing no binding, matching `buildModuleScope`'s
  // `moduleScopeInProgress` bound.
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
    const direct = materializeSymbol(source, local, resolvedPath, body, callingFrontmatter);
    if (direct !== undefined) {
      if (direct.kind !== "fn") {
        return direct;
      }
      // Bug 0303: attach the DECLARING lib's own module scope so the imported
      // `fn`'s body resolves free names there. `resolvedPath`/`body` here are
      // the DECLARING lib's — a re-export chain's recursive call above already
      // carries the declaring lib's own resolvedPath/body when it finds the
      // fn, so the module scope is the true declaring module's, not the
      // re-exporting lib's.
      return {
        ...direct,
        moduleScope: await buildModuleScope(resolvedPath, body, callingFrontmatter),
      };
    }
    for (const reExport of extractThetaLibForms(body).reExports) {
      if (reExport.exported !== source || !reExport.fromPath.endsWith(".thetalib")) {
        continue;
      }
      const resolved = await resolveAndParseThetaLibReference(
        reExport.fromPath,
        reExport.range,
        resolvedPath,
        probe,
        resolver,
        parseThetaLib,
      );
      if (resolved === undefined) {
        continue;
      }
      const materialized = await materializeChain(
        reExport.source,
        local,
        resolved.resolvedPath,
        resolved.parsed.document.body,
        callingFrontmatter,
        visited,
      );
      if (materialized !== undefined) {
        return materialized;
      }
    }
    return undefined;
  };

  return { materializeChain };
}

/**
 * Create the per-theta parse, import-graph, module-scope and re-export
 * materialisation closures with their shared caches. Graph-walk diagnostics
 * append to the caller's sink in traversal order.
 */
export function createImportResolutionKit(
  deps: { readonly fs: FileSystem; readonly parseDeps: PassParseDeps },
  probe: CachingThetaLibProbe,
  resolver: Resolver,
  diagnostics: Diagnostic[],
) {
  const parseCache = new Map<string, ParsedThetaLib | undefined>();
  // Bug 0428: resolved paths whose `readBytes` rejected, distinguished from the
  // pipeline's only other `parseThetaLib` outcome (a document, however
  // unparseable its content) so the three read-failure arms below can push
  // IMP-1 exactly once per site without conflating "unreadable" with the
  // already-handled "parses to an illegal `.thetalib`" case. `parseCache`
  // itself stays `ParsedThetaLib | undefined` (unchanged shape, so every
  // existing `parsed === undefined` consumer keeps its current behaviour) —
  // this is an ADDITIONAL fact recorded beside it, not a replacement.
  const unreadablePaths = new Set<string>();

  const parseThetaLib = async (resolvedPath: string): Promise<ParsedThetaLib | undefined> => {
    if (parseCache.has(resolvedPath)) {
      return parseCache.get(resolvedPath);
    }
    // A `readBytes` rejection settles to `undefined` (recorded in
    // `unreadablePaths` first, bug 0428) and is treated as no forms/exports for
    // every consumer that does not itself check that set. The `.then(ok, err)`
    // rejection arm is the pipeline's sanctioned I/O-boundary pattern, not a
    // broad `try`/`catch`.
    const parsed: ParsedThetaLib | undefined = await deps.fs
      .readBytes(resolvedPath)
      .then(
        (bytes) => ({
          // Bug 0264: this `.thetalib` may already be parsed this pass — by an
          // earlier importer's own `parseThetaLib` cache miss, the discovery
          // walk, or a closure walk — so route through the pass-scoped cache
          // instead of parsing unconditionally.
          document: parseViaPassCache({ path: resolvedPath, bytes }, deps.parseDeps),
        }),
        () => {
          unreadablePaths.add(resolvedPath);
          return undefined;
        },
      );
    parseCache.set(resolvedPath, parsed);
    return parsed;
  };

  // Build the static `.thetalib` import graph transitively from this theta's direct
  // imports (imports.md §Cycles). Nodes are RESOLVED PATHS, not basename stems
  // (bug 0302): two files sharing a basename in different directories are
  // distinct files, and imports.md §Cycles walks the FILE graph, so collapsing
  // them into one node both draws false self-loop cycles and overwrites real
  // edges. An edge `A → B` exists when `A.thetalib` has a resolvable
  // `import … from "./B.thetalib"` OR a resolvable `export … from "./B.thetalib"`
  // re-export: imports.md §Cycles walks the `.thetalib` graph over both edge
  // kinds, which is also what `collectCallableClosureSources` already does.
  const graphEdges = new Map<string, string[]>();
  const walked = new Set<string>();
  const walkThetaLib = async (resolvedPath: string): Promise<void> => {
    if (walked.has(resolvedPath)) {
      return;
    }
    walked.add(resolvedPath);
    const parsed = await parseThetaLib(resolvedPath);
    const targets: string[] = [];
    if (parsed !== undefined) {
      // One edge per STATEMENT (an `export` statement's N specifiers name one
      // path, so they are one edge), mirroring the `import` side. `kind` is
      // carried through so the failure arm below pushes `load.diagnostics` for
      // `.thetalib` `import` edges only (bug 0304 fix 1). A non-`.thetalib`
      // `import` edge is skipped for the same reason the direct decl loop skips
      // it: the parser already emitted
      // `theta/parse/import-non-thetalib-extension` for that spelling and the
      // resolver can never resolve it, so pushing IMP-1 here would double-report
      // the identical wrong-extension fault (two codes for one statement).
      //
      // An `export … from` edge is not pushed here. `closeOverReExports` is now
      // seeded from every lib this walk reaches (bug 0333's fix), so it already
      // pushes IMP-1 once for a failed source of ANY reached lib's re-export —
      // pushing here too would double-report the same fault on the same
      // statement. The closure stays the sole reporter of `export`-edge faults;
      // this guard is what keeps that division of labour instead of splitting
      // one fault across two pushes.
      const edges: Array<{ path: string; range: SourceRange; kind: "import" | "export" }> = [];
      for (const stmt of parsed.document.body.statements) {
        if (stmt.kind === "import" || (stmt.kind === "export" && stmt.path.endsWith(".thetalib"))) {
          edges.push({ path: stmt.path, range: stmt.range, kind: stmt.kind });
        }
      }
      for (const edge of edges) {
        await probe.precache(edge.path, normalizePath(resolvedPath));
        const load = loadThetaLibImport(resolver, edge.path, normalizePath(resolvedPath), {
          file: resolvedPath,
          range: edge.range,
        });
        if (load.registered && load.resolvedPath !== undefined) {
          targets.push(load.resolvedPath);
          await walkThetaLib(load.resolvedPath);
          // Bug 0428: the edge RESOLVED (a byte-exact, listed entry) but the
          // target's bytes could not be read — IMP-1's "likewise unresolvable"
          // clause at TRANSITIVE depth. Sited on this edge (the importing lib's
          // statement), matching the resolution-failure arm's siting below.
          // `export`-kind edges are excluded: `closeOverReExports` is the sole
          // reporter for a re-export source's read failure (mirrors the existing
          // resolution-failure division of labour in the comment above).
          if (edge.kind === "import" && unreadablePaths.has(load.resolvedPath)) {
            diagnostics.push(
              unreadableThetaLibDiagnostic({ file: resolvedPath, range: edge.range }, edge.path),
            );
          }
        } else if (edge.kind === "import" && edge.path.endsWith(".thetalib")) {
          diagnostics.push(...load.diagnostics);
        }
      }
    }
    graphEdges.set(resolvedPath, targets);
  };

  const { materializeChain } = createMaterializer(parseThetaLib, probe, resolver);

  return {
    parseThetaLib,
    walkThetaLib,
    materializeChain,
    parseCache,
    walked,
    graphEdges,
    unreadablePaths,
  };
}
