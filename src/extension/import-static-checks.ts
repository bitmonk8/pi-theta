// Load-time (compose-pass) orchestration for the `.thetalib` import subsystem,
// with re-export closure resolution in import-reexport-closure.ts, the
// probe/parse/graph/materialisation resolution kit in import-resolution-kit.ts,
// and direct-import per-specifier fact collection in import-specifier-facts.ts
// (imports.md §"Path resolution" / §"Unknown
// imported symbol" / §"Cycles" / IMP-1). Each check reuses an existing,
// unit-tested checker/resolver rather than reimplementing it (mirrors the
// invoke static-check compose pass in invoke-static-checks.ts):
//
//   - IMP-1 — `RelativeThetaLibResolver` + `loadThetaLibImport` over each
//     `import { … } from "./x.thetalib"` site: an unresolvable spec is
//     `theta/load/unresolvable-thetalib-path` and the importing theta does NOT
//     register.
//   - IMP-3 — `computeThetaLibExports` over the resolved `.thetalib`'s top-level forms,
//     then `checkImportUnknownSymbols` / `checkImportNameCollisions` against the
//     importing specifiers
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
//     through the same registration-error arm as IMP-4; in the same diagnose
//     phase, a re-exported name whose chains resolve to two different declaring
//     sites draws `theta/parse/import-name-collision` (bug 0334,
//     `diagnoseReExportCollisions`). Diagnosing only after
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
import { normalizePath } from "../normalize-path";
import {
  RelativeThetaLibResolver,
  checkImportNameCollisions,
  checkImportUnknownSymbols,
  computeThetaLibExports,
  detectImportCycle,
  type ImportSpecifier,
  type ReExportSpecifier,
  type Resolver,
  type ThetaLibDeclaration,
  type ThetaLibImportGraph,
  type ThetaLibModuleForms,
} from "../parser/imports";
import type {
  EnumDecl,
  FnDecl,
  ImportDecl,
  SchemaDecl,
  Stmt,
  ThetaBody,
} from "../parser/theta-document";
import { collectLocalBinderNames } from "../parser/type-layer-checks";
import type { PassParseDeps } from "./pass-parse-cache";
import { resolveThetaLibImports } from "./thetalib-load-parse";
import type { SystemTemplate } from "../parser/system-interpolation";
import type { MaterializedImport } from "../runtime/lexical-environment";
import type { ThetaCompositionInput } from "./theta-composition-producer";
import {
  checkSubagentFnModelOverrides,
  checkSubagentFnStaticResolution,
  collectSubagentFns,
} from "./subagent-fn-static-checks";
import { collectCallSites } from "./invoke-static-checks";
import {
  checkImportedEnumVariantAccess,
  checkImportedFnCallArgs,
  checkImportedNonCtorTypeNames,
  checkImportedSchemaCtorFields,
} from "./invoke-imported-checks";
import { patchSystemTemplateForImports } from "./import-system-template-patch";
import { resolveReExportClosure } from "./import-reexport-closure";
import {
  CachingThetaLibProbe,
  createImportResolutionKit,
  type ParsedThetaLib,
} from "./import-resolution-kit";
import { collectImportedSpecifierFacts } from "./import-specifier-facts";

export {
  CachingThetaLibProbe,
  unreadableThetaLibDiagnostic,
  type ParsedThetaLib,
} from "./import-resolution-kit";

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
 * The three `.thetalib` top-level statement kinds imports.md's permitted-forms
 * list (§"`.thetalib` file rules") admits as declarable/exportable — `schema`,
 * `enum`, `fn` (the list's other two admitted forms, `import` and `export`,
 * never declare a symbol). The one place in this file that spells out the
 * three-kind test; every other site below that needs to recognise one of
 * these three kinds reads through this type or its guard,
 * `isThetaLibDeclarationStmt`, instead of re-testing `stmt.kind` against the
 * three literals itself.
 */
export type ThetaLibDeclarationStmt = SchemaDecl | FnDecl | EnumDecl;

/** Type guard for {@link ThetaLibDeclarationStmt}. */
function isThetaLibDeclarationStmt(stmt: Stmt): stmt is ThetaLibDeclarationStmt {
  return stmt.kind === "schema" || stmt.kind === "fn" || stmt.kind === "enum";
}

/** The importing file's top-level declaration names (the collision-check arm). */
function collectTopLevelNames(body: ThetaBody): string[] {
  const names: string[] = [];
  for (const stmt of body.statements) {
    if (isThetaLibDeclarationStmt(stmt)) {
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
export function extractThetaLibForms(body: ThetaBody): ThetaLibModuleForms {
  const declarations: ThetaLibDeclaration[] = [];
  const reExports: ReExportSpecifier[] = [];
  const plainImports: ImportSpecifier[] = [];
  for (const stmt of body.statements) {
    if (isThetaLibDeclarationStmt(stmt)) {
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

/** Only error-severity parse/load diagnostics block registration (warnings still register). */
export function isRegistrationError(diagnostic: Diagnostic): boolean {
  return (
    diagnostic.severity === "error" &&
    (diagnostic.code.startsWith("theta/parse/") ||
      diagnostic.code.startsWith("theta/load/"))
  );
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
   * root (`../lib/x.thetalib`, the imports.md §"Path resolution" form). Empty for a
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
  /**
   * Bug 0423 route (a): the `system:` template with a load-phase rename-map
   * carry applied — present ONLY when at least one BARE `${param}` path part
   * (a root object terminal, `segments.length === 1`) resolved to a
   * directly-imported schema THAT CARRIES A REAL WIRE RENAME (its outbound
   * sidecar has a non-empty `wireNames` set — a field whose wire name differs
   * from its theta name), in which case that part's `type` is replaced with
   * the schema's real `InterpolationType` (carrying its `sidecars` /
   * `rootDef`) and `valueDriven` is dropped, so the render applies wire-name
   * translation instead of serialising the theta-side value unchanged. Every
   * other part (text, scalar-terminal paths, nested/multi-segment paths — the
   * latter is bug 0424's ground) AND a bare param over a RENAME-FREE imported
   * schema are carried over unchanged. Byte-identity for the rename-free
   * class therefore holds by ABSENCE: a rename-free schema is not patched, so
   * its value-driven render keeps today's bytes for every value kind; only a
   * schema carrying a real rename is patched (its bytes SHOULD change to the
   * wire names, which is outside the rename-free constraint). Absent when no
   * renamed-schema bare param exists, so a rename-free import or a theta with
   * no `system:` import dependency renders byte-identically to before this
   * fix — the caller composes the effective template as
   * `patchedSystemTemplate ?? input.frontmatter.system`, mirroring how
   * {@link imports} is threaded. This is a NEW returned value, not an
   * in-place mutation: the parsed `ParsedFrontmatter` / `SystemTemplate` stay
   * readonly.
   */
  readonly patchedSystemTemplate?: SystemTemplate;
  /**
   * Bug 0465 route — the declaring lib's own `SchemaDecl` / `EnumDecl` nodes
   * for every directly-imported schema/enum this theta's `import` specifiers
   * name (entry renamed to its LOCAL binding), plus their transitive
   * lib-of-lib closure (schema-subset.md:72 "transitively imported"), so a
   * caller can widen `lowerQueryResponseSchema`'s declaration inputs beyond
   * same-file decls at the typed `@`-query / `invoke<Schema>` seam. Absent a
   * top-level `import`, both arrays are empty — matching {@link imports}.
   */
  readonly importedTypeDecls: { readonly schemas: readonly SchemaDecl[]; readonly enums: readonly EnumDecl[] };
}

/**
 * Check registration errors and import declarations across the reached libs,
 * then the importing theta's union of specifiers for name collisions. Retain
 * the parse-cache snapshot and append diagnostics in the original pass order.
 */
async function checkTransitiveLibDeclarations(
  parseCache: Map<string, ParsedThetaLib | undefined>,
  registrationFilteredPaths: Set<string>,
  probe: CachingThetaLibProbe,
  resolver: Resolver,
  parseThetaLib: (resolvedPath: string) => Promise<ParsedThetaLib | undefined>,
  sourcePath: string,
  allSpecifiers: readonly ImportSpecifier[],
  localTopLevelNames: readonly string[],
  diagnostics: Diagnostic[],
): Promise<void> {
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
    for await (const { stmt, resolved } of resolveThetaLibImports(
      parsedLib.document.body,
      libResolvedPath,
      probe,
      resolver,
      parseThetaLib,
    )) {
      diagnostics.push(
        ...checkImportUnknownSymbols(
          libResolvedPath,
          stmt.path,
          stmt.specifiers,
          computeThetaLibExports(extractThetaLibForms(resolved.parsed.document.body)),
        ),
      );
    }

    // Bug 0335: imports.md §"Name collisions" refuses "an imported symbol whose name
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
      sourcePath,
      allSpecifiers,
      localTopLevelNames,
    ),
  );
}

/**
 * RFC 0001 FN-6 across the import boundary: an imported `.thetalib` `subagent
 * fn` body is materialised into the calling theta's environment and, when
 * called, runs against the calling theta's executor with the LIBRARY's names
 * in scope. So a self-recursive `subagent fn r(x){ r(x)? }` (or a mutual cycle
 * between two `subagent fn`s) declared INSIDE a `.thetalib` recurses without
 * bound at runtime exactly as a same-file self-cycle does. The compose pass'
 * own `checkSubagentFnStaticResolution` runs only over the composing theta's
 * top-level body, so the imported bodies must be cycle-checked here. Run the
 * same unit-tested check over every parsed `.thetalib` body (entry AND
 * transitively-walked), keyed by resolved path so each lib is checked once; a
 * length-1 `theta/load/invocation-cycle` un-registers the importing theta.
 * (Mutual recursion that spans two `.thetalib` files requires each to `import`
 * the other, which is an import cycle already caught by IMP-5 below.)
 */
function checkReachedLibSubagentFns(
  parseCache: ReadonlyMap<string, ParsedThetaLib | undefined>,
  modelMatcher: PassParseDeps["modelMatcher"],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
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
        modelMatcher,
      ),
    );
  }
  return diagnostics;
}

/**
 * IMP-5: walk the static import graph from each directly-imported `.thetalib`;
 * the first cycle discovered un-registers the importing theta.
 */
function checkImportCycles(
  entryResolvedPaths: readonly string[],
  graphEdges: ThetaLibImportGraph["edges"],
  site: { file: string; range: SourceRange },
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const graph: ThetaLibImportGraph = { edges: graphEdges };
  for (const entry of entryResolvedPaths) {
    const cycle = detectImportCycle(
      entry,
      graph,
      site,
      thetalibStem,
    );
    if (cycle !== undefined) {
      diagnostics.push(cycle);
      break;
    }
  }
  return diagnostics;
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
    return {
      diagnostics,
      imports,
      undelivered: diagnostics,
      resolvedLibs: [],
      importedTypeDecls: { schemas: [], enums: [] },
    };
  }

  const fromFile = normalizePath(input.sourcePath);
  const probe = new CachingThetaLibProbe(deps.fs);
  const resolver: Resolver = new RelativeThetaLibResolver(probe);
  const {
    parseThetaLib,
    walkThetaLib,
    materializeChain,
    parseCache,
    walked,
    graphEdges,
    unreadablePaths,
  } = createImportResolutionKit(deps, probe, resolver, diagnostics);

  const localTopLevelNames = collectTopLevelNames(input.body);
  // Bug 0138/0429/0430/0448/0465, PTQ-0368 Seam C: resolve every direct
  // `import` declaration's specifiers against its resolved `.thetalib`'s own
  // top-level body — split out to `collectImportedSpecifierFacts` above (see
  // its doc comment for exactly what it reads and returns).
  const {
    entryResolvedPaths,
    allSpecifiers,
    importedFns,
    importedSchemas,
    importedEnums,
    importedNonCtorNames,
    importedTypeSchemas,
    importedTypeEnums,
    importedSchemaShapes,
    registrationFilteredPaths,
  } = await collectImportedSpecifierFacts(
    importDecls,
    input.sourcePath,
    input.frontmatter,
    fromFile,
    probe,
    resolver,
    parseThetaLib,
    unreadablePaths,
    walkThetaLib,
    materializeChain,
    diagnostics,
    imports,
  );

  // Bug 0422/0423/0450 — LOAD-phase `system:` template revalidation and
  // sidecar carry for directly-imported schemas/enums (import-system-template-patch.ts).
  const patchedParts = patchSystemTemplateForImports(
    input,
    importedSchemaShapes,
    importedEnums,
    diagnostics,
  );

  // The params-field wire-name list the four imported-symbol-usage checks
  // below share as their shadow set: `input.frontmatter?.params?.fields ?? []`
  // mapped to `wireName` is the same NAME-KEYING ADJUDICATION
  // `parseThetaDocument`'s `checkTypeLayer` call site uses
  // (../parser/theta-document.ts) — the body-visible identifier a `params:`
  // field binds, cited rather than re-derived. Computed once here so the four
  // checks below cannot silently diverge on it.
  const paramsFieldNames = (input.frontmatter?.params?.fields ?? []).map((f) => f.wireName);

  // PTQ-0319 / PTQ-0330: the shadow set and the call-site walk are each a
  // whole-body traversal (`collectLocalBinderNames`,
  // `../parser/type-layer-checks.ts`; `collectCallSites`,
  // `./invoke-static-checks.ts`) that all four `checkImported*` routes below
  // need identically — computed ONCE here, over the same `input.body` /
  // `paramsFieldNames` every route would otherwise re-derive, and passed in
  // rather than re-walked per route.
  const shadowedNames = collectLocalBinderNames(input.body, paramsFieldNames);
  const callSites = collectCallSites(input.body);

  // Bug 0138 route 2: judge every imported-`fn` call site's argument COUNT and
  // TYPE, ONCE over the importing theta's own body, now that the per-decl loop
  // above holds the whole `importedFns` map.
  diagnostics.push(
    ...checkImportedFnCallArgs(
      input.body,
      input.sourcePath,
      shadowedNames,
      callSites,
      importedFns,
    ),
  );

  // Bug 0429: judge every imported-`schema` constructor site's field set,
  // ONCE over the importing theta's own body, now that the per-decl loop
  // above holds the whole `importedSchemas` map — the same wiring shape as
  // the `checkImportedFnCallArgs` push immediately above.
  diagnostics.push(
    ...checkImportedSchemaCtorFields(
      input.sourcePath,
      shadowedNames,
      callSites,
      importedSchemas,
    ),
  );

  // Bug 0430: judge every imported-`enum` variant-access site's variant name,
  // ONCE over the importing theta's own body, now that the per-decl loop
  // above holds the whole `importedEnums` map — the same wiring shape as the
  // `checkImportedSchemaCtorFields` push immediately above.
  diagnostics.push(
    ...checkImportedEnumVariantAccess(
      input.sourcePath,
      shadowedNames,
      callSites,
      importedEnums,
    ),
  );

  // Bug 0448: judge every imported constructor site whose head resolves to a
  // NON-brace-constructible declaration (an `enum`, a `fn`, or a fields-less
  // `schema`), ONCE over the importing theta's own body, now that the
  // per-decl loop above holds the whole `importedNonCtorNames` set — the same
  // wiring shape as the two pushes immediately above.
  diagnostics.push(
    ...checkImportedNonCtorTypeNames(
      input.sourcePath,
      shadowedNames,
      callSites,
      importedNonCtorNames,
    ),
  );

  // Re-export chain resolution, phases 1–3 (imports.md §Re-exports): collect the
  // `export … from` closure of every `.thetalib` the import walk reached (`walked`,
  // not only the entry libs — bug 0333's fix — so a re-export fault inside a lib
  // reached only through plain-`import` hops is covered too), settle the fixpoint
  // over the whole collected file set, and only then diagnose — unknown re-exported
  // names, then same-name collisions across declaring sites (bug 0334). Running it over the
  // union of the whole reached set rather than per lib is what the spec sentence
  // requires — the resolved export set and the errors reported for it are a
  // function of the `.thetalib` file set alone — and a re-export that fails it
  // un-registers the importing theta through the registration-error arm rather
  // than by a second diagnostic sited on the importer's own specifier, whose
  // admission stays on the SYNTACTIC set (`computeThetaLibExports`) above.
  diagnostics.push(
    ...(await resolveReExportClosure(walked, parseThetaLib, probe, resolver, unreadablePaths)),
  );

  await checkTransitiveLibDeclarations(
    parseCache,
    registrationFilteredPaths,
    probe,
    resolver,
    parseThetaLib,
    input.sourcePath,
    allSpecifiers,
    localTopLevelNames,
    diagnostics,
  );

  diagnostics.push(...checkReachedLibSubagentFns(parseCache, deps.parseDeps.modelMatcher));

  diagnostics.push(
    ...checkImportCycles(entryResolvedPaths, graphEdges, {
      file: input.sourcePath,
      range: input.body.statements[0]?.range ?? {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
      },
    }),
  );

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
  //
  // Bug 0423: `patchedSystemTemplate` is present only when the re-walk above
  // patched at least one bare-param part — which happens ONLY for a schema
  // carrying a real wire rename (F3/F4 rename-gate). A rename-free imported
  // schema is never patched, so a theta importing only rename-free schemas
  // (or no `system:` import at all) renders through the unpatched fallback
  // the caller already has (`??`): byte-identity holds by ABSENCE, not by a
  // no-op patch.
  return {
    diagnostics,
    imports,
    undelivered,
    resolvedLibs: [...walked],
    ...(patchedParts !== undefined ? { patchedSystemTemplate: { parts: patchedParts } } : {}),
    importedTypeDecls: {
      schemas: [...importedTypeSchemas.values()],
      enums: [...importedTypeEnums.values()],
    },
  };
}
