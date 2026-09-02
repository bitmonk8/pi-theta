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
//     from every `.thetalib` the import walk reaches. `closeOverReExports` collects those libs and
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
import { canonicalizePath } from "../runtime/invocation";
import {
  IMPORT_NAME_COLLISION_CODE,
  IMPORT_NAME_COLLISION_HINT,
  RelativeThetaLibResolver,
  checkImportNameCollisions,
  checkImportUnknownSymbols,
  computeThetaLibExports,
  detectImportCycle,
  importNameCollisionMessage,
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
  resolveSubagentSessionConfigAt,
  type FnDecl,
  type ImportDecl,
  type ThetaBody,
  type ThetaDocument,
} from "../parser/theta-document";
import { parseViaPassCache, type PassParseDeps } from "./pass-parse-cache";
import type { ParsedFrontmatter } from "../parser/frontmatter";
import {
  enumDeclaringKey,
  type EnumRegistration,
  type MaterializedImport,
  type ModuleScope,
} from "../runtime/lexical-environment";
import type { ThetaCompositionInput } from "./theta-composition-producer";
import {
  checkSubagentFnModelOverrides,
  checkSubagentFnStaticResolution,
  collectSubagentFns,
} from "./subagent-fn-static-checks";
import { checkImportedFnCallArgs, type ImportedFnCallee } from "./invoke-static-checks";

/** Forward-slash-normalise a host path so the posix-based resolver joins cleanly. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * The `.thetalib` file stem (basename minus `.thetalib`). The IMP-5 cycle
 * graph is keyed by resolved path (bug 0302: two files sharing a basename in
 * different directories are distinct nodes), so this renders the printed
 * cycle path from those resolved-path node ids at emission rather than
 * serving as the node id itself.
 */
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

/**
 * The `enum` declarations of a `.thetalib` body, as `EnumRegistration`s tagged
 * with their declaring-declaration identity key (bug 0303 / bug 0305): a
 * module-scope enum read and a caller-side imported read of the SAME
 * declaration mint identical `enumDeclaringKey(resolvedPath, name)` tags, so
 * they compare `==` equal.
 */
function enumsOf(body: ThetaBody, resolvedPath: string): EnumRegistration[] {
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
 * by. `resolvedPath` is the LIB `body` was parsed from — for an `enum` it feeds
 * the declaring-declaration tag (`enumDeclaringKey`, bug 0305), so the runtime
 * keys enum identity on the declaration, not the local alias. Returns
 * `undefined` when the source names no top-level declaration (an unknown
 * symbol — already diagnosed by IMP-3).
 */
function materializeSymbol(
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
interface ParsedThetaLib {
  readonly document: ThetaDocument;
}

/** The outcome of the per-theta `.thetalib` import resolution pass. */
export interface ThetaImportCheck {
  /** Every diagnostic; an error-severity entry un-registers the importing theta. */
  readonly diagnostics: Diagnostic[];
  /** The resolved `.thetalib` symbols materialised into the runtime environment (IMP-6 / IMP-7). */
  readonly imports: MaterializedImport[];
  /**
   * Bug 0312: every `.thetalib` resolved path this theta's transitive import
   * walk reached (`walked` below) — the SAME closure IMP-5's cycle check and
   * the re-export fixpoint already traverse, surfaced so a caller can widen a
   * watch set to cover a `.thetalib` that resolves outside every discovery
   * root (`../lib/x.thetalib`, imports.md:19's blessed form). Empty for a
   * theta with no top-level `import` or no source path, matching `imports`
   * and `diagnostics` in that case.
   */
  readonly resolvedLibs: readonly string[];
  /**
   * Bug 0264: the {@link diagnostics} subset the caller may still put on the
   * channel this pass — `diagnostics` itself is unfiltered (the registration
   * decision reads it whole, per §Fix) but some of its rows are the SAME
   * `Diagnostic` objects `lexTheta` already delivered for this `.thetalib`
   * earlier in the pass (this importer's own parse, or an earlier importer's).
   * Computed once via `deps.parseDeps.passParseCache?.claimUndelivered`; equal
   * to `diagnostics` when no pass cache is threaded (non-production callers).
   */
  readonly undelivered: readonly Diagnostic[];
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
    readonly parseDeps: PassParseDeps;
    /**
     * Bug 0267: whether this call may claim its rows against the pass-scoped
     * delivered-set (bug 0264's dedup). DEFAULT true — every existing call
     * site (the discovered-theta compose loop) keeps claiming, byte-equivalent
     * to before this parameter existed. Pass `false` for an OBSERVING walk
     * that must not consume the callee's own delivery budget — a `tools:`
     * caller probing whether a callee it has not yet discovered would fail
     * this check. Consuming the budget from that probe would starve the
     * callee's own later `runComposePass` iteration of its rows (the note the
     * author actually reads), while `undelivered` here is never read by the
     * probe — it discards `ThetaImportCheck` down to a boolean
     * (`calleeFailsOwnStructuralChecks`). `tests/thetalib-reparse-walk-single-delivery.test.ts`
     * is bug 0264's single-delivery witness; this parameter exists so this
     * bug's fix cannot move its counts.
     */
    readonly claimDelivery?: boolean;
  },
): Promise<ThetaImportCheck> {
  const diagnostics: Diagnostic[] = [];
  const imports: MaterializedImport[] = [];
  const importDecls = collectImports(input.body);
  if (importDecls.length === 0 || input.sourcePath === undefined) {
    return { diagnostics, imports, undelivered: diagnostics, resolvedLibs: [] };
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
          // Bug 0264: this `.thetalib` may already be parsed this pass — by an
          // earlier importer's own `parseThetaLib` cache miss, the discovery
          // walk, or a closure walk — so route through the pass-scoped cache
          // instead of parsing unconditionally.
          document: parseViaPassCache({ path: resolvedPath, bytes }, deps.parseDeps),
        }),
        () => undefined,
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
        } else if (edge.kind === "import" && edge.path.endsWith(".thetalib")) {
          diagnostics.push(...load.diagnostics);
        }
      }
    }
    graphEdges.set(resolvedPath, targets);
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
   * Phase 1 — collect the `.thetalib` files reachable from one walked lib
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

  /**
   * Bug 0334: the terminal declaring site `(lib, name)` reaches over the
   * re-export graph, keyed as `` `${lib}\u0000${name}` `` rather than as a
   * `(lib, name)` pair: that pair IS the collision key, and one string carries
   * it through `Set` value-equality. A name that is this lib's OWN declaration resolves to itself; a
   * name reached only through `export … from` edges follows the first edge
   * whose `exported` matches, recursing on its source. `visited` bounds a
   * re-export cycle exactly as `materializeChain`'s own visited set does, so a
   * cyclic chain contributes no site rather than looping — a name that never
   * reaches a real declaration cannot collide with anything.
   */
  const resolveDeclaringSite = (
    lib: string,
    name: string,
    visited: Set<string>,
  ): string | undefined => {
    const key = `${lib}\u0000${name}`;
    if (visited.has(key)) {
      return undefined;
    }
    visited.add(key);
    if (libDeclaredNames.get(lib)?.includes(name) === true) {
      return key;
    }
    for (const edge of reExportEdges) {
      if (edge.fromLib !== lib || edge.exported !== name) {
        continue;
      }
      const site = resolveDeclaringSite(edge.sourceLib, edge.source, visited);
      if (site !== undefined) {
        return site;
      }
    }
    return undefined;
  };

  /**
   * Bug 0334: a re-exporting lib's resolved export set that receives one name
   * from two edges resolving to DIFFERENT declaring sites is the same
   * ambiguity `checkImportNameCollisions` refuses across an importing theta's
   * own specifiers (imports.md §"Name collisions") — reached here one hop
   * removed, through the re-export closure `fixReExportedNames` already
   * dedups to a bare name set. Grouping by declaring site (not by
   * `sourceLib`) is what keeps the diamond (two paths to ONE declaration)
   * exempt: both its edges resolve to the same key, so the "differs" test
   * never fires. Each edge resolves against a FRESH `visited` set — one
   * edge's cycle bound must not starve a sibling edge's resolution — and an
   * edge that resolves to no site at all is skipped, since an unresolved name
   * is `diagnoseReExports`'s unknown-symbol subject, never a collision
   * partner. One diagnostic per colliding group, sited on the second
   * (differing) edge, mirrors `checkImportNameCollisions`' one-report-per-
   * collision shape.
   */
  const diagnoseReExportCollisions = (): void => {
    const groups = new Map<string, Map<string, ReExportEdge[]>>();
    for (const edge of reExportEdges) {
      let byName = groups.get(edge.fromLib);
      if (byName === undefined) {
        byName = new Map<string, ReExportEdge[]>();
        groups.set(edge.fromLib, byName);
      }
      const edges = byName.get(edge.exported) ?? [];
      edges.push(edge);
      byName.set(edge.exported, edges);
    }
    for (const [fromLib, byName] of groups.entries()) {
      for (const [exported, edges] of byName.entries()) {
        if (edges.length < 2) {
          continue;
        }
        // A name the re-exporting lib declares itself is bound from that own
        // declaration (materializeChain resolves direct-first), so its
        // re-export edges are inert and cannot collide. Diagnosing them would
        // fire on the re-export-shadows-own-declaration seam that this bug
        // leaves deferred (§Non-goals bullet 3).
        if (libDeclaredNames.get(fromLib)?.includes(exported) === true) {
          continue;
        }
        let firstSite: string | undefined;
        for (const edge of edges) {
          const site = resolveDeclaringSite(edge.sourceLib, edge.source, new Set<string>());
          if (site === undefined) {
            continue;
          }
          if (firstSite === undefined) {
            firstSite = site;
            continue;
          }
          if (site !== firstSite) {
            diagnostics.push({
              severity: "error",
              code: IMPORT_NAME_COLLISION_CODE,
              file: edge.fromLib,
              range: edge.range,
              message: importNameCollisionMessage(edge.exported),
              hint: IMPORT_NAME_COLLISION_HINT,
            });
            break;
          }
        }
      }
    }
  };

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
    for (const stmt of body.statements) {
      if (stmt.kind !== "import" || !stmt.path.endsWith(".thetalib")) {
        continue;
      }
      await probe.precache(stmt.path, resolvedPath);
      const load = loadThetaLibImport(resolver, stmt.path, resolvedPath, {
        file: resolvedPath,
        range: stmt.range,
      });
      if (!load.registered || load.resolvedPath === undefined) {
        continue;
      }
      const sourceParsed = await parseThetaLib(load.resolvedPath);
      if (sourceParsed === undefined) {
        continue;
      }
      for (const specifier of stmt.specifiers) {
        const materialized = await materializeChain(
          specifier.source,
          specifier.local,
          load.resolvedPath,
          sourceParsed.document.body,
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
  /** Every resolved directly-imported lib, the roots of the re-export closure. */
  const entryResolvedPaths: string[] = [];
  // The union of every importing `import … from` decl's specifiers, checked once
  // for name collisions after the per-decl loop (imports.md §"Name collisions"):
  // two imports binding the same local name — from two different `.thetalib` files or
  // the same file twice — is `theta/parse/import-name-collision`, not last-import-
  // wins shadowing. Per-decl checking would only see one specifier at a time and
  // miss the import-vs-import collision the import-vs-local arm already catches.
  const allSpecifiers: ImportSpecifier[] = [];
  // Bug 0138 route 2's callee map, local binding name → the directly-resolved
  // library's own `FnDecl` plus that library's statement list. Populated
  // below, in the SAME specifiers loop that already holds each resolved and
  // parsed library body (`materializeChain`'s own loop) — no separate walk.
  const importedFns = new Map<string, ImportedFnCallee>();
  // Bug 0304 fix 2: `isRegistrationError` must fire for every `parseCache`
  // entry exactly once. A DIRECT decl's own resolved lib is filtered inline
  // below, in the same position bug 0138's own test pins (`isRegistrationError`
  // must land BEFORE that decl's unknown-symbol check and BEFORE the post-loop
  // `checkImportedFnCallArgs` push, in emission order) — moving it out to a
  // single post-walk pass over `parseCache` would still be correct for
  // COVERAGE but wrong for ORDER, since a post-walk pass necessarily runs
  // after every decl's own pushes. This set is the seam: the post-walk pass
  // (below, after the re-export closure) skips whatever this loop already
  // filtered, so every entry is still filtered exactly once overall.
  const registrationFilteredPaths = new Set<string>();

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
    entryResolvedPaths.push(resolvedPath);

    // IMP-4: parse the resolved `.thetalib`; its `.thetalib`-keyed top-level check
    // (and any nested import extension error) surfaces here so an illegal form
    // un-registers the importing theta. Filtered inline (not deferred to the
    // post-walk pass below) so the emission order stays IMP-4-then-IMP-3 for a
    // direct decl, as callers of this batch already depend on; recorded in
    // `registrationFilteredPaths` so the post-walk pass does not re-push it.
    const parsed = await parseThetaLib(resolvedPath);
    if (parsed === undefined) {
      continue;
    }
    if (!registrationFilteredPaths.has(resolvedPath)) {
      registrationFilteredPaths.add(resolvedPath);
      for (const diagnostic of parsed.document.diagnostics) {
        if (isRegistrationError(diagnostic)) {
          diagnostics.push(diagnostic);
        }
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
      // Bug 0138 route 2: resolve the specifier's SOURCE name against the
      // directly-resolved library's own top-level body ONLY — no re-export
      // chain follow-through here (`ImportedFnCallee`'s own doc comment,
      // ../extension/invoke-static-checks.ts, states the deferral this
      // restriction records: a symbol reached only through a re-export
      // chain stays silent under this route, a withhold rather than a
      // duplicated chain-walk of `materializeChain`'s own logic below).
      const fnDecl = parsed.document.body.statements.find(
        (stmt): stmt is FnDecl => stmt.kind === "fn" && stmt.name === specifier.source,
      );
      if (fnDecl !== undefined) {
        importedFns.set(specifier.local, {
          fn: fnDecl,
          libraryStatements: parsed.document.body.statements,
        });
      }
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

  // Bug 0138 route 2: judge every imported-`fn` call site's argument COUNT and
  // TYPE, ONCE over the importing theta's own body, now that the per-decl loop
  // above holds the whole `importedFns` map. `input.frontmatter?.params?.fields
  // ?? []` mapped to `wireName` is the same NAME-KEYING ADJUDICATION
  // `parseThetaDocument`'s `checkTypeLayer` call site uses
  // (../parser/theta-document.ts) — the body-visible identifier a `params:`
  // field binds, cited rather than re-derived.
  diagnostics.push(
    ...checkImportedFnCallArgs(
      input.body,
      input.sourcePath,
      (input.frontmatter?.params?.fields ?? []).map((f) => f.wireName),
      importedFns,
    ),
  );

  // Re-export chain resolution, phases 1–3 (imports.md §Re-exports): collect the
  // `export … from` closure of every `.thetalib` the import walk reached (`walked`,
  // not only the entry libs — bug 0333's fix — so a re-export fault inside a lib
  // reached only through plain-`import` hops is covered too), settle the fixpoint
  // over the whole collected file set, and only then diagnose. Running it over the
  // union of the whole reached set rather than per lib is what the spec sentence
  // requires — the resolved export set and the errors reported for it are a
  // function of the `.thetalib` file set alone — and a re-export that fails it
  // un-registers the importing theta through the registration-error arm rather
  // than by a second diagnostic sited on the importer's own specifier, whose
  // admission stays on the SYNTACTIC set (`computeThetaLibExports`) above.
  for (const resolvedPath of walked) {
    await closeOverReExports(resolvedPath);
  }
  diagnoseReExports(fixReExportedNames());
  diagnoseReExportCollisions();

  // Bug 0304 fixes 2 and 3: every lib the walks above reached — direct AND
  // transitively-walked, over both `import` and `export … from` edges — sits in
  // `parseCache` by now, keyed by resolved path, so one pass over a snapshot of
  // it (`[...parseCache]`; the loop mutates nothing here, but the snapshot
  // keeps this pass independent of any future entry the loop body might add)
  // covers both:
  //   (2) the registration-error filter (imports.md :111's transitive half of
  //       the batch) for every entry the decl loop above did NOT already
  //       filter inline (`registrationFilteredPaths`) — i.e. every
  //       transitively-walked lib, so it is filtered exactly once overall
  //       without disturbing the direct-decl IMP-4-then-IMP-3 emission order;
  //   (3) the unknown-symbol check IMP-3 already runs for the importing
  //       THETA's own specifiers, now also run for each lib's OWN `import`
  //       specifiers against its resolved source's export set — no call site
  //       did this before, which is candidate C3's drop. An unresolvable
  //       source is skipped: `walkThetaLib`'s edge loop (fix 1) already pushes
  //       IMP-1 for it, so checking symbols against a source that does not
  //       exist would double-report the same missing-file fault as an
  //       unrelated unknown-symbol one.
  for (const [libResolvedPath, parsedLib] of [...parseCache]) {
    if (parsedLib === undefined) {
      continue;
    }
    if (!registrationFilteredPaths.has(libResolvedPath)) {
      registrationFilteredPaths.add(libResolvedPath);
      for (const diagnostic of parsedLib.document.diagnostics) {
        if (isRegistrationError(diagnostic)) {
          diagnostics.push(diagnostic);
        }
      }
    }
    for (const stmt of parsedLib.document.body.statements) {
      if (stmt.kind !== "import" || !stmt.path.endsWith(".thetalib")) {
        continue;
      }
      await probe.precache(stmt.path, libResolvedPath);
      const load = loadThetaLibImport(resolver, stmt.path, libResolvedPath, {
        file: libResolvedPath,
        range: stmt.range,
      });
      if (!load.registered || load.resolvedPath === undefined) {
        continue;
      }
      const sourceParsed = await parseThetaLib(load.resolvedPath);
      if (sourceParsed === undefined) {
        continue;
      }
      diagnostics.push(
        ...checkImportUnknownSymbols(
          libResolvedPath,
          stmt.path,
          stmt.specifiers,
          computeThetaLibExports(extractThetaLibForms(sourceParsed.document.body)),
        ),
      );
    }

    // Bug 0335: `imports.md:124` refuses "an imported symbol whose name
    // collides with a top-level declaration in the same file" without
    // exempting `.thetalib` files, but until now the collision arm only ever
    // ran over the COMPOSING theta's own specifiers (below) — never over a
    // resolved dependency `.thetalib`'s own `import … from` specifiers against
    // its own top-level `fn`/`enum`/`schema` names. That let a library import
    // `X` and declare its own `X` load clean, then resolve inconsistently at
    // runtime depending on declaration kind and read site. This reuses the
    // existing `theta/parse/import-name-collision` code (no new registry row)
    // over the union of the library's OWN import specifiers and its OWN
    // top-level names, sited on the library file itself — the same arm the
    // theta-side oracle already fires for the identical collision.
    const libOwnSpecifiers: ImportSpecifier[] = [];
    for (const libImportDecl of collectImports(parsedLib.document.body)) {
      libOwnSpecifiers.push(...libImportDecl.specifiers);
    }
    diagnostics.push(
      ...checkImportNameCollisions(
        libResolvedPath,
        libOwnSpecifiers,
        collectTopLevelNames(parsedLib.document.body),
      ),
    );
  }

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
  for (const entry of entryResolvedPaths) {
    const cycle = detectImportCycle(
      entry,
      graph,
      {
        file: input.sourcePath,
        range: input.body.statements[0]?.range ?? {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 },
        },
      },
      thetalibStem,
    );
    if (cycle !== undefined) {
      diagnostics.push(cycle);
      break;
    }
  }

  // Bug 0264: compute the undelivered remainder ONCE, after every diagnostic
  // this importer's checks produce has been pushed — `diagnostics` is
  // complete at this point, so `claimUndelivered` sees the whole set this
  // caller is about to hand `runComposePass`, not a partial prefix.
  //
  // Bug 0267: an observing call (`deps.claimDelivery === false`) skips the
  // claim entirely rather than claiming and discarding — `claimUndelivered`
  // MUTATES the pass-scoped delivered-set (bug 0264), so claiming here on
  // behalf of a caller that never puts these rows on the channel would consume
  // budget the callee's own later `runComposePass` iteration needs to emit its
  // own rows at all.
  const undelivered =
    deps.claimDelivery === false
      ? []
      : (deps.parseDeps.passParseCache?.claimUndelivered(diagnostics) ?? diagnostics);
  // Bug 0312: `walked` already holds every `.thetalib` resolved path this
  // theta's transitive import walk reached (`walkThetaLib`'s own dedup set),
  // so surfacing it is a read, not a second walk.
  return { diagnostics, imports, undelivered, resolvedLibs: [...walked] };
}
