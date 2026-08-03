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
//   - IMP-5 — `detectImportCycle` over the per-load-pass static `.thetalib` import
//     graph (`theta/load/import-cycle`).
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
import type { Diagnostic } from "../diagnostics/diagnostic";
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
  // exists when `A.thetalib` has a resolvable `import … from "./B.thetalib"`.
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
      for (const decl of collectImports(parsed.document.body)) {
        await probe.precache(decl.path, normalizePath(resolvedPath));
        const load = loadThetaLibImport(resolver, decl.path, normalizePath(resolvedPath), {
          file: resolvedPath,
          range: decl.range,
        });
        if (load.registered && load.resolvedPath !== undefined) {
          targets.push(thetalibStem(load.resolvedPath));
          await walkThetaLib(load.resolvedPath);
        }
      }
    }
    graphEdges.set(stem, targets);
  };

  const localTopLevelNames = collectTopLevelNames(input.body);
  const entryStems: string[] = [];
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
    // declaration is found by its source name and bound under its local (`as`)
    // name.
    for (const specifier of specifiers) {
      const materialized = materializeSymbol(
        specifier.source,
        specifier.local,
        parsed.document.body,
        input.frontmatter,
      );
      if (materialized !== undefined) {
        imports.push(materialized);
      }
    }

    // Seed the cycle graph from this resolved `.thetalib`.
    await walkThetaLib(resolvedPath);
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
