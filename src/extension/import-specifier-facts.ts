// Direct-import per-specifier fact collection (PTQ-1147 Seam C): resolve every
// direct `import` declaration's specifiers against its resolved `.thetalib`'s
// own top-level body, collecting the direct-declaration fact tables, the
// transitive bug-0465/0466 imported-type-decl closure, and the entry-path /
// union-specifier / registration-filter bookkeeping `checkThetaImports`
// (import-static-checks.ts) reads afterward.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import {
  IMPORTED_TYPE_NAME_COLLISION_CODE,
  IMPORTED_TYPE_NAME_COLLISION_HINT,
  checkImportUnknownSymbols,
  computeThetaLibExports,
  importedTypeNameCollisionMessage,
  loadThetaLibImport,
  type ImportSpecifier,
  type Resolver,
} from "../parser/imports";
import {
  collectBodyTypes,
  type EnumDecl,
  type FnDecl,
  type ImportDecl,
  type SchemaDecl,
  type SchemaFieldSource,
  type ThetaBody,
} from "../parser/theta-document";
import {
  toSystemParamType,
  type FrontmatterBodyTypes,
  type ParsedFrontmatter,
} from "../parser/frontmatter";
import type { SystemParamType } from "../parser/system-interpolation";
import type { MaterializedImport } from "../runtime/lexical-environment";
import type { ImportedFnCallee } from "./invoke-imported-checks";
import {
  unreadableThetaLibDiagnostic,
  type CachingThetaLibProbe,
  type ParsedThetaLib,
} from "./import-resolution-kit";
import {
  extractThetaLibForms,
  isRegistrationError,
  referencedNamedTypes,
  type ThetaLibDeclarationStmt,
} from "./import-static-checks";

/**
 * `theta/load/imported-type-name-collision` (bug 0466 §Fix Option 2): one
 * type name is claimed by two different declarations in the imported schema
 * closure — either an entry's own `as` alias against a same-lib sibling it
 * transitively references (`collectImportedTypeDecls`'s `collidedNames`), or
 * two specifiers' closures reaching the same name via different decls
 * (the cross-specifier aggregation below). Sited on the SPECIFIER whose
 * closure introduced the collision, matching every other IMP-* diagnostic's
 * per-specifier siting.
 */
function importedTypeNameCollisionDiagnostic(
  site: { file: string; range: SourceRange },
  name: string,
): Diagnostic {
  return {
    severity: "error",
    code: IMPORTED_TYPE_NAME_COLLISION_CODE,
    file: site.file,
    range: site.range,
    message: importedTypeNameCollisionMessage(name),
    hint: IMPORTED_TYPE_NAME_COLLISION_HINT,
  };
}

/**
 * Source-position keys carried on the decl AST nodes purely to anchor
 * diagnostics / `///` runs — the `range` span on every {@link NodeBase} and
 * the per-field `line` on {@link SchemaFieldSource}. They do NOT participate in
 * a schema's lowered `$defs` bytes, so two byte-identical-shaped decls that sit
 * at different offsets must compare EQUAL for collision purposes; stripping
 * these keys before the structural compare is what keeps a cosmetic line shift
 * from reading as a genuine collision.
 */
const DECL_SHAPE_POSITION_KEYS: ReadonlySet<string> = new Set(["range", "line"]);

/**
 * Bug 0466 §Fix Option 2 surface 3 (cross-specifier aggregation): whether `a`
 * and `b` — both already resolved as the decl bound to one contended type
 * name — are the SAME declaration (a diamond: the identical decl reached
 * through two specifiers, exempt from refusal) or two DIFFERENT declarations
 * that happen to share a name (a genuine collision). Reference equality
 * covers the common case (both specifiers resolve through the same cached
 * parse of one `.thetalib`, so the AST node is literally one object).
 *
 * The structural fallback compares the decls' SHAPE with source position
 * stripped ({@link DECL_SHAPE_POSITION_KEYS}), mirroring schema-subset.md's
 * byte-identity posture for judging "the same schema": two structurally
 * identical decls declared at different line/column offsets in two different
 * libs lower to the same `$defs` bytes, so they are the same declaration and
 * draw no refusal, while a genuinely different shape still refuses.
 */
function isDifferentImportedTypeDecl(
  a: SchemaDecl | EnumDecl,
  b: SchemaDecl | EnumDecl,
): boolean {
  if (a === b) {
    return false;
  }
  const stripPosition = (_key: string, value: unknown): unknown =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).filter(
            ([k]) => !DECL_SHAPE_POSITION_KEYS.has(k),
          ),
        )
      : value;
  return JSON.stringify(a, stripPosition) !== JSON.stringify(b, stripPosition);
}

/**
 * Bug 0465 — schema-subset.md:72's "transitively imported" closure: starting
 * from ONE directly-imported schema or enum (`entrySchema` / `entryEnum`,
 * already found by the caller's own direct-declaration fence — mirrors
 * `importedSchemas` / `importedEnums`, NO re-export-chain follow), walk the
 * named types its fields / alias arms reference, pulling in each one's own
 * decl from the SAME directly-resolved lib (`libStatements`), recursively.
 * A referenced name absent from `libStatements` is a NESTED import inside the
 * lib — opaque here, same disposition as 0422's own nested-import stop — so
 * the walk does not descend into it; `lowerQueryResponseSchema` then treats
 * that name as unresolved at its own seam, unchanged.
 *
 * Each reached decl is stored under its lib-local (SOURCE) name so a
 * self-reference, a mutual-cycle back-edge, and every transitive field-ref —
 * all of which name the source — resolve at the lowering seam. When the
 * caller renamed the ENTRY (`import { X as Summary }`), the entry is
 * ADDITIONALLY stored under `outputName` (the specifier's LOCAL `as` binding)
 * as a `name: outputName` copy, so `@<Summary>` resolves.
 *
 * Storage is first-wins PER NAME only among visits of the SAME declaration
 * (a self-reference, a cycle back-edge, or a diamond reached twice — the
 * `originalSchemaOf` / `originalEnumOf` maps below track, per stored name,
 * which decl reference actually claimed it). When `outputName` equals the SOURCE name of a
 * DIFFERENT same-lib decl reached in the entry's own closure (bug 0466 —
 * `import { ReviewSummary as Detail }` where `ReviewSummary` itself
 * references a same-lib sibling `schema Detail`), the two decls contend for
 * one flat-`$defs` name that cannot mean both; that is a collision, not a
 * revisit, so it is recorded in `collidedNames` for the caller to refuse with
 * `theta/load/imported-type-name-collision` (§Fix Option 2, SETTLED) rather
 * than silently letting the entry win the name and drop the sibling.
 */
function collectImportedTypeDecls(
  entrySchema: SchemaDecl | undefined,
  entryEnum: EnumDecl | undefined,
  outputName: string,
  libStatements: ThetaBody["statements"],
): {
  readonly schemas: ReadonlyMap<string, SchemaDecl>;
  readonly enums: ReadonlyMap<string, EnumDecl>;
  /** Bug 0466: type names claimed by two different same-lib decls in this entry's closure. */
  readonly collidedNames: ReadonlySet<string>;
} {
  const schemaByName = new Map<string, SchemaDecl>();
  const enumByName = new Map<string, EnumDecl>();
  for (const stmt of libStatements) {
    if (stmt.kind === "schema") {
      schemaByName.set(stmt.name, stmt);
    } else if (stmt.kind === "enum") {
      enumByName.set(stmt.name, stmt);
    }
  }

  const schemas = new Map<string, SchemaDecl>();
  const enums = new Map<string, EnumDecl>();
  const visitedSchemas = new Set<string>();
  const collidedNames = new Set<string>();
  // Per stored name, the ORIGINAL (pre-rename) decl reference that claimed it —
  // separate from `schemas`/`enums`, whose stored value under an alias name is
  // a `{ ...decl, name: asName }` copy, not `decl` itself. Comparing against
  // this map (not against the stored copy) is what tells a diamond revisit of
  // the SAME decl (exempt) apart from a genuine collision with a DIFFERENT decl.
  const originalSchemaOf = new Map<string, SchemaDecl>();
  const originalEnumOf = new Map<string, EnumDecl>();

  /** Claim `name` for `decl`, storing `storedValue`; records a bug-0466 collision instead when `name` is already claimed by a different decl. */
  const claimSchema = (name: string, decl: SchemaDecl, storedValue: SchemaDecl): void => {
    const claimant = originalSchemaOf.get(name);
    if (claimant === undefined) {
      originalSchemaOf.set(name, decl);
      schemas.set(name, storedValue);
    } else if (claimant !== decl) {
      collidedNames.add(name);
    }
  };
  const claimEnum = (name: string, decl: EnumDecl, storedValue: EnumDecl): void => {
    const claimant = originalEnumOf.get(name);
    if (claimant === undefined) {
      originalEnumOf.set(name, decl);
      enums.set(name, storedValue);
    } else if (claimant !== decl) {
      collidedNames.add(name);
    }
  };

  const typeSourcesOf = (decl: SchemaDecl): readonly string[] =>
    decl.fields !== undefined
      ? decl.fields.map((f) => f.typeSource)
      : (decl.arms ?? []);

  const visitSchema = (sourceName: string, asName: string): void => {
    const decl = schemaByName.get(sourceName);
    // Head-only (neither `fields` nor `arms`) carries no lowerable shape —
    // `lowerQueryResponseSchema`'s own unresolved-name arm already handles it
    // the same as a same-file head-only decl would.
    const hasShape =
      decl !== undefined && (decl.fields !== undefined || decl.arms !== undefined);
    if (decl !== undefined && hasShape) {
      // Claim under the SOURCE name so a self-reference, a cycle back-edge, and
      // every transitive field-ref (which all spell the source) resolve;
      // additionally under the alias when the entry was renamed. This runs on
      // every entry — INCLUDING the renamed entry, before the visited guard's
      // early return below — so a renamed self-recursive schema's own source
      // name is recorded rather than lost to the guard.
      claimSchema(sourceName, decl, decl);
      if (asName !== sourceName) {
        claimSchema(asName, decl, { ...decl, name: asName });
      }
    }
    // The visited guard fences the field-walk recursion alone (cycle
    // termination); storage above is independent of it.
    if (visitedSchemas.has(sourceName)) {
      return;
    }
    visitedSchemas.add(sourceName);
    if (decl === undefined || !hasShape) {
      return;
    }
    for (const typeSource of typeSourcesOf(decl)) {
      for (const ref of referencedNamedTypes(typeSource)) {
        visitSchema(ref, ref);
        visitEnum(ref, ref);
      }
    }
  };
  const visitEnum = (sourceName: string, asName: string): void => {
    const decl = enumByName.get(sourceName);
    if (decl !== undefined && decl.variants !== undefined) {
      // Same dual claim as `visitSchema`: source name so a schema field
      // referencing this enum by its lib-local name resolves, plus the alias
      // when the entry was renamed. An enum has no field body to walk.
      claimEnum(sourceName, decl, decl);
      if (asName !== sourceName) {
        claimEnum(asName, decl, { ...decl, name: asName });
      }
    }
  };

  if (entrySchema !== undefined) {
    visitSchema(entrySchema.name, outputName);
  }
  if (entryEnum !== undefined) {
    visitEnum(entryEnum.name, outputName);
  }
  return { schemas, enums, collidedNames };
}

/**
 * Completeness ledger for the per-kind `.find()` lookups inside
 * `collectImportedSpecifierFacts`'s per-specifier loop below (`schemaDecl` /
 * `fnDecl` / `enumDecl`): each key names one of those three lookups, whose
 * own result shape is the behaviour (so it does not switch through
 * {@link isThetaLibDeclarationStmt}). `satisfies` fails `tsc` the moment
 * {@link ThetaLibDeclarationStmt} gains a kind not also listed here.
 */
const IMPORTED_SPECIFIER_DECLARATION_KINDS = {
  schema: true,
  fn: true,
  enum: true,
} satisfies Record<ThetaLibDeclarationStmt["kind"], true>;

/** The direct-import fact sinks consumed after per-specifier collection. */
interface ImportedSpecifierFacts {
  entryResolvedPaths: string[];
  allSpecifiers: ImportSpecifier[];
  importedFns: Map<string, ImportedFnCallee>;
  importedSchemas: Map<string, readonly SchemaFieldSource[]>;
  importedEnums: Map<string, readonly string[]>;
  importedNonCtorNames: Set<string>;
  importedTypeSchemas: Map<string, SchemaDecl>;
  importedTypeEnums: Map<string, EnumDecl>;
  importedSchemaShapes: Map<string, SystemParamType>;
  registrationFilteredPaths: Set<string>;
}

/** Per-decl inputs and pass-wide sinks used while recording one specifier. */
interface ImportedSpecifierFactDeps {
  sourcePath: string;
  frontmatter: ParsedFrontmatter;
  materializeChain: (
    source: string,
    local: string,
    resolvedPath: string,
    body: ThetaBody,
    callingFrontmatter: ParsedFrontmatter | null,
    visited: Set<string>,
  ) => Promise<MaterializedImport | undefined>;
  diagnostics: Diagnostic[];
  imports: MaterializedImport[];
  mintedTypeNameCollisions: Set<string>;
  libBodyTypesByPath: Map<string, FrontmatterBodyTypes>;
}

/** Record one specifier's direct-declaration facts, type closure and materialized binding in order. */
async function recordImportedSpecifierFacts(
  specifier: ImportSpecifier,
  parsed: ParsedThetaLib,
  resolvedPath: string,
  facts: ImportedSpecifierFacts,
  deps: ImportedSpecifierFactDeps,
): Promise<void> {
  const {
    importedFns, importedSchemas, importedEnums, importedNonCtorNames,
    importedTypeSchemas, importedTypeEnums, importedSchemaShapes,
  } = facts;
  const {
    sourcePath, frontmatter, materializeChain, diagnostics, imports,
    mintedTypeNameCollisions, libBodyTypesByPath,
  } = deps;
  // Bug 0138 route 2 / bug 0429 / bug 0430 / bug 0448: resolve the
  // specifier's SOURCE name against the directly-resolved library's own
  // top-level body ONLY — no re-export chain follow-through here
  // (`ImportedFnCallee`'s own doc comment, ../extension/invoke-imported-checks.ts,
  // states the deferral this restriction records: a symbol reached only
  // through a re-export chain stays silent under this route, a withhold
  // rather than a duplicated chain-walk of `materializeChain`'s own logic
  // below).
  //
  // Bug 0429 — the object-form `schema` lookup: at the same-file parse
  // position, a head-only / alias-form `schema` (no `.fields`) is REFUSED
  // outright (checkObjectExpr's own `bodySchemas.has` arm draws
  // `theta/parse/unresolved-named-type`, theta-document.ts's constructor-
  // name classification) because it is not brace-constructible under any
  // reading. This LOAD route judges FIELD SETS only (`importedSchemas`) —
  // a fields-less decl carries none to judge against — so bug 0448 records
  // the NAME instead, in `importedNonCtorNames`, for
  // `checkImportedNonCtorTypeNames` to judge the constructor-head question
  // the field-set walk cannot reach (a sibling of bug 0430's enum-variant
  // class).
  const schemaDecl = parsed.document.body.statements.find(
    (stmt): stmt is SchemaDecl => stmt.kind === "schema" && stmt.name === specifier.source,
  );
  // Bug 0448 — same-file constructor precedence: `checkObjectExpr` consults
  // the object-form schema set FIRST (`refs.schemas`), so a fields-bearing
  // `schema X { … }` is brace-constructible and WINS even when the same lib
  // also declares an `enum` / `fn` / alias-form `schema` named `X` — the
  // same-file `X { … }` parses clean, the field set owning it. Mirror that
  // precedence: a specifier whose direct decl carries such a schema is
  // constructible, so it enters `importedSchemas` (bug 0429's field-set
  // walk) and NONE of the non-ctor arms below record it. Every
  // `importedNonCtorNames` arm is gated on `!hasCtorSchema`, keeping the
  // set's meaning — non-brace-constructible imported bindings — honest.
  const hasCtorSchema = schemaDecl !== undefined && schemaDecl.fields !== undefined;
  if (schemaDecl !== undefined && schemaDecl.fields !== undefined) {
    importedSchemas.set(specifier.local, schemaDecl.fields);
  }
  if (schemaDecl !== undefined && !hasCtorSchema) {
    importedNonCtorNames.add(specifier.local);
  }
  const fnDecl = parsed.document.body.statements.find(
    (stmt): stmt is FnDecl => stmt.kind === "fn" && stmt.name === specifier.source,
  );
  if (fnDecl !== undefined) {
    importedFns.set(specifier.local, {
      fn: fnDecl,
      libraryStatements: parsed.document.body.statements,
    });
    // Bug 0448 — a `fn` name is not brace-constructible under any reading
    // (schemas.md / expressions.md §Object construction), the same ground
    // the same-file constructor position refuses it on: `checkObjectExpr`
    // finds no object-form `schema`, `enum`, or import of the name and
    // draws `theta/parse/unresolved-named-type` from its NO-DECLARATION
    // fall-through arm (theta-document.ts, "resolves to no declaration at
    // all"). Recorded here — unless a fields-bearing schema of the same
    // name outranks it (`hasCtorSchema`, above) — so
    // `checkImportedNonCtorTypeNames` can judge the constructor question
    // this loop otherwise drops.
    if (!hasCtorSchema) {
      importedNonCtorNames.add(specifier.local);
    }
  }
  // Bug 0430 — the `enum` sibling of the `schema` lookup above, same
  // direct-declaration-only restriction (no re-export chain follow): a
  // non-`{ … }` enum shape the body parser could not read carries no
  // `variants` list to judge member accesses against, so it stays absent
  // from the map (a withhold, matching the `schemaDecl.fields` guard
  // above).
  const enumDecl = parsed.document.body.statements.find(
    (stmt): stmt is EnumDecl => stmt.kind === "enum" && stmt.name === specifier.source,
  );
  if (enumDecl !== undefined && enumDecl.variants !== undefined) {
    importedEnums.set(specifier.local, enumDecl.variants);
  }
  if (enumDecl !== undefined && !hasCtorSchema) {
    // Bug 0448 — an `enum` name is never brace-constructible (the same
    // ground `checkObjectExpr`'s `enums.has` arm refuses it on at the
    // same-file constructor position), independent of whether its
    // variant SHAPE parsed (`importedEnums`'s own `.variants !== undefined`
    // guard, above, is a `checkImportedEnumVariantAccess` concern, not a
    // brace-constructibility one) — recorded on any direct top-level
    // `enum` match unless a fields-bearing schema of the same name outranks
    // it (`hasCtorSchema`, above), mirroring same-file precedence.
    importedNonCtorNames.add(specifier.local);
  }
  // Bug 0465: feed the QUERY/INVOKE lowering seam the SAME direct-decl
  // finds (`schemaDecl` / `enumDecl`) already made above, plus their
  // transitive lib-of-lib closure, renaming only the entry to the
  // specifier's LOCAL (`as`) binding (schema-subset.md:72).
  const {
    schemas: transitiveSchemas,
    enums: transitiveEnums,
    collidedNames,
  } = collectImportedTypeDecls(
    schemaDecl,
    enumDecl,
    specifier.local,
    parsed.document.body.statements,
  );
  const specifierSite = { file: sourcePath, range: specifier.range };
  // Bug 0466 §Fix Option 2 surface 1/2: the entry's own `as` alias claimed
  // a same-lib sibling's source name — refuse rather than let the sibling
  // that `collectImportedTypeDecls` dropped bind silently.
  for (const name of collidedNames) {
    if (!mintedTypeNameCollisions.has(name)) {
      mintedTypeNameCollisions.add(name);
      diagnostics.push(importedTypeNameCollisionDiagnostic(specifierSite, name));
    }
  }
  // Bug 0466 §Fix Option 2 surface 3: cross-specifier aggregation. A name
  // this closure reaches that an EARLIER specifier's closure already
  // claimed is a diamond (the SAME decl reached twice — exempt) unless the
  // two decls are structurally different, in which case it is the same
  // collision one aggregation level up.
  for (const [name, decl] of transitiveSchemas) {
    const existing = importedTypeSchemas.get(name);
    if (existing === undefined) {
      importedTypeSchemas.set(name, decl);
    } else if (isDifferentImportedTypeDecl(existing, decl) && !mintedTypeNameCollisions.has(name)) {
      mintedTypeNameCollisions.add(name);
      diagnostics.push(importedTypeNameCollisionDiagnostic(specifierSite, name));
    }
  }
  for (const [name, decl] of transitiveEnums) {
    const existing = importedTypeEnums.get(name);
    if (existing === undefined) {
      importedTypeEnums.set(name, decl);
    } else if (isDifferentImportedTypeDecl(existing, decl) && !mintedTypeNameCollisions.has(name)) {
      mintedTypeNameCollisions.add(name);
      diagnostics.push(importedTypeNameCollisionDiagnostic(specifierSite, name));
    }
  }
  const materialized = await materializeChain(
    specifier.source,
    specifier.local,
    resolvedPath,
    parsed.document.body,
    frontmatter,
    new Set<string>(),
  );
  if (materialized !== undefined) {
    imports.push(materialized);
  }
  // Bug 0422 route (a): a direct schema match (`schemaDecl`, the find this
  // specifier's own decl loop already made above over
  // `parsed.document.body`) builds the real object shell for the
  // load-phase template revalidation below. `collectBodyTypes` over the
  // LIB's own body gives `toSystemParamType` the lib's own named-type set
  // (nested fields referencing another schema/enum IN THE SAME LIB
  // resolve; a nested import stays `opaque-object`, admitting further —
  // unchanged from the parse-time disposition for that deeper case).
  if (schemaDecl !== undefined) {
    let libBodyTypes = libBodyTypesByPath.get(resolvedPath);
    if (libBodyTypes === undefined) {
      libBodyTypes = collectBodyTypes(parsed.document.body.statements, resolvedPath).bodyTypes;
      libBodyTypesByPath.set(resolvedPath, libBodyTypes);
    }
    importedSchemaShapes.set(
      specifier.local,
      toSystemParamType(specifier.source, libBodyTypes, new Map()),
    );
  }
}

/**
 * IMP-4 admission for one DIRECT `import` decl's resolved `.thetalib` (PTQ-1159
 * Seam B): parse the resolved lib; its `.thetalib`-keyed top-level check (and
 * any nested import extension error) surfaces here so an illegal form
 * un-registers the importing theta. Filtered inline at the caller's loop
 * position (not deferred to the post-walk pass) so the emission order stays
 * IMP-4-then-IMP-3 for a direct decl, as callers of this batch already depend
 * on; recorded in `registrationFilteredPaths` so the post-walk pass does not
 * re-push it. Returns the parsed lib, or `undefined` when the decl does not
 * admit (the caller skips to its next decl — the unreadable arm below has
 * already pushed its own diagnostic and seeded the walk set by then).
 */
async function admitDirectImportLib(
  spec: string,
  site: { file: string; range: SourceRange },
  resolvedPath: string,
  parseThetaLib: (resolvedPath: string) => Promise<ParsedThetaLib | undefined>,
  unreadablePaths: ReadonlySet<string>,
  walkThetaLib: (resolvedPath: string) => Promise<void>,
  registrationFilteredPaths: Set<string>,
  diagnostics: Diagnostic[],
): Promise<ParsedThetaLib | undefined> {
  const parsed = await parseThetaLib(resolvedPath);
  if (parsed === undefined) {
    // Bug 0428: resolution succeeded (the entry is byte-exact and listed)
    // but the bytes could not be read — IMP-1's "likewise unresolvable"
    // clause at DIRECT depth, sited on this decl exactly as the
    // resolution-failure arm above sites its own push on `site`. An
    // unparseable-but-READABLE lib (not this arm; `registrationFilteredPaths`
    // below handles that) never reaches this branch, since `parsed` would be
    // a `ParsedThetaLib` carrying parse diagnostics, not `undefined`.
    if (unreadablePaths.has(resolvedPath)) {
      diagnostics.push(unreadableThetaLibDiagnostic(site, spec));
      // Bug 0312: seed the walk set with this resolved-but-unreadable lib so
      // its resolved path enters `resolvedLibs` (=[...walked]) and thus the
      // caller's watch set — symmetric with a TRANSITIVE resolved-but-
      // unreadable lib, which already reaches `walked` through `walkThetaLib`.
      // Without this a DIRECT unreadable lib would be invisible to the reload
      // closure, so repairing the permission/directory problem would fire no
      // recompose (0312's contract). `walkThetaLib` self-guards (`walked.has`),
      // reparses nothing (the `undefined` is cached in `parseCache`), and sets
      // empty graph edges — the same terminal state the readable arm's
      // trailing `walkThetaLib` seed reaches.
      await walkThetaLib(resolvedPath);
    }
    return undefined;
  }
  if (!registrationFilteredPaths.has(resolvedPath)) {
    registrationFilteredPaths.add(resolvedPath);
    for (const diagnostic of parsed.document.diagnostics) {
      if (isRegistrationError(diagnostic)) {
        diagnostics.push(diagnostic);
      }
    }
  }
  return parsed;
}

/**
 * Bug 0138 route 2 / bug 0429 / bug 0430 / bug 0448 / bug 0465 route (PTQ-0334's
 * own deferred Seam C, PTQ-0368): resolve every direct `import` declaration's
 * specifiers against its resolved `.thetalib`'s own top-level body, collecting
 * the direct-declaration facts `checkThetaImports`'s later rows read — the
 * imported-fn/schema/enum/non-constructible-name tables, the transitive
 * query/invoke type closure, and the `system:` template load-phase schema
 * shells — plus the entry-path / union-specifier / registration-filter
 * bookkeeping the `system:` patch, the four `checkImported*` pushes, the
 * transitive lib-level checks, and IMP-5's cycle detection still read
 * afterward. Takes as explicit parameters exactly what this loop read from
 * `checkThetaImports`'s scope before this split (the `parseThetaLib` /
 * `walkThetaLib` closures and the `unreadablePaths` set they share,
 * `materializeChain`, the resolver/probe pair, the import declarations, and
 * the importing theta's own `sourcePath` / `frontmatter`), and pushes into
 * the caller's own `diagnostics` / `imports` sinks in the SAME order this
 * loop always has (IMP-4-then-IMP-3 per direct decl, `imports` populated per
 * resolved specifier) — the caller's later rows append to the same arrays
 * unchanged.
 */
export async function collectImportedSpecifierFacts(
  importDecls: readonly ImportDecl[],
  sourcePath: string,
  frontmatter: ParsedFrontmatter,
  fromFile: string,
  probe: CachingThetaLibProbe,
  resolver: Resolver,
  parseThetaLib: (resolvedPath: string) => Promise<ParsedThetaLib | undefined>,
  unreadablePaths: Set<string>,
  walkThetaLib: (resolvedPath: string) => Promise<void>,
  materializeChain: (
    source: string,
    local: string,
    resolvedPath: string,
    body: ThetaBody,
    callingFrontmatter: ParsedFrontmatter | null,
    visited: Set<string>,
  ) => Promise<MaterializedImport | undefined>,
  diagnostics: Diagnostic[],
  imports: MaterializedImport[],
): Promise<ImportedSpecifierFacts> {
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
  // Bug 0429 route — the constructor-side sibling of `importedFns` above,
  // keyed the same way (specifier LOCAL name) and populated in the SAME
  // per-decl loop, holding the directly-resolved library's own
  // `SchemaDecl.fields` for `checkImportedSchemaCtorFields` to judge each
  // `ObjectExpr` constructor site against.
  const importedSchemas = new Map<string, readonly SchemaFieldSource[]>();
  // Bug 0430 route — the variant-access sibling of `importedSchemas` above,
  // keyed the same way (specifier LOCAL name) and populated in the SAME
  // per-decl loop, holding the directly-resolved library's own `EnumDecl`
  // variant list for `checkImportedEnumVariantAccess` to judge each
  // `MemberExpr` access site against.
  const importedEnums = new Map<string, readonly string[]>();
  // Bug 0448 route — the non-constructible sibling of the `importedSchemas` /
  // `importedEnums` lookups above, keyed the same way (specifier LOCAL name)
  // and populated in the SAME per-decl loop: every imported binding whose
  // DIRECT declaration is not brace-constructible (an `enum`, a `fn`, or a
  // fields-less/alias-form `schema`), for `checkImportedNonCtorTypeNames` to
  // judge each `ObjectExpr` constructor site against. Membership alone decides
  // that verdict (all three shapes draw one diagnostic), so this is a name set.
  const importedNonCtorNames = new Set<string>();
  // Bug 0465 route — the QUERY/INVOKE-LOWERING sibling of `importedSchemas` /
  // `importedEnums` above: the two producer call sites that lower a typed
  // `@<Schema>` / `invoke<Schema>` annotation (query-schema-lowering.ts) need
  // the declaring lib's own `SchemaDecl` / `EnumDecl` decl nodes rather than
  // field lists, because `lowerQueryResponseSchema` walks `.fields` / `.arms`
  // directly. Keyed by the name each decl resolves under: its lib-local
  // (source) name so self-/cycle/transitive refs resolve, plus the specifier's
  // LOCAL (`as`) name for the entry so `@<Summary>` resolves for
  // `import { X as Summary }` (`collectImportedTypeDecls` mints both).
  // First-wins across specifiers/libs — an earlier import's decl is never
  // displaced by a later one reaching the same name transitively.
  const importedTypeSchemas = new Map<string, SchemaDecl>();
  const importedTypeEnums = new Map<string, EnumDecl>();
  // Bug 0466 §Fix Option 2: contended type names already refused by an
  // `imported-type-name-collision` diagnostic, so a name collided at the
  // single-specifier surface (`collectImportedTypeDecls`'s `collidedNames`)
  // or merged in from a second specifier below is refused exactly once even
  // when the same contended name recurs (e.g. a third specifier reaching the
  // same pair of decls again).
  const mintedTypeNameCollisions = new Set<string>();
  // Bug 0422 route (a): the real object `SystemParamType` shell for an
  // imported schema, keyed by the LOCAL binding name (`params:` names an
  // imported schema by this name, e.g. `author: Author`) — built ONLY when
  // the schema declares directly in the resolved lib this specifier names
  // (mirrors `materializeSymbol`'s own direct-match arm, not the re-export
  // chain `materializeChain` falls through to below): a schema reached only
  // through a re-export chain stays out of scope for this load-phase
  // revalidation, the same deferral `importedFns` above already documents
  // for its own re-export-chain withhold. Populated below, consumed by the
  // template-revalidation pass after this loop.
  const importedSchemaShapes = new Map<string, SystemParamType>();
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

  const facts: ImportedSpecifierFacts = {
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
  };

  for (const decl of importDecls) {
    const spec = decl.path;
    const site = { file: sourcePath, range: decl.range };

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

    // IMP-4 (PTQ-1159 Seam B): parse + unreadable arm + inline registration
    // filter, extracted to `admitDirectImportLib` above — called from this same
    // loop position so the emission order stays IMP-4-then-IMP-3 per direct decl.
    const parsed = await admitDirectImportLib(
      spec,
      site,
      resolvedPath,
      parseThetaLib,
      unreadablePaths,
      walkThetaLib,
      registrationFilteredPaths,
      diagnostics,
    );
    if (parsed === undefined) {
      continue;
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
        sourcePath,
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
    //
    // PTQ-0331: `collectBodyTypes` over this decl's resolved library (below,
    // bug 0422 route (a)) is a pure function of `(parsed.document.body.statements,
    // resolvedPath)` alone, and neither varies across this specifier loop — so
    // it is computed the first time a schema-importing specifier of THIS
    // statement needs it and reused for the statement's remaining specifiers,
    // in this Map keyed by resolved library path. Declared fresh per decl (not
    // hoisted beside `parseCache`/`moduleScopeCache` above): no cross-statement
    // sharing.
    const libBodyTypesByPath = new Map<string, FrontmatterBodyTypes>();
    const specifierDeps: ImportedSpecifierFactDeps = {
      sourcePath, frontmatter, materializeChain, diagnostics, imports,
      mintedTypeNameCollisions, libBodyTypesByPath,
    };
    for (const specifier of specifiers) {
      await recordImportedSpecifierFacts(specifier, parsed, resolvedPath, facts, specifierDeps);
    }

    // Seed the cycle graph from this resolved `.thetalib`.
    await walkThetaLib(resolvedPath);
  }

  return facts;
}
