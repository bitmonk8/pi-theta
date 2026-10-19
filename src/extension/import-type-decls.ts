// Shared direct-import type closure for calling thetas and declaring libraries.
// Preserve the 0465/0466 fence: direct entries and their SAME-library referenced
// declarations only; nested imports and re-export-only types remain opaque.
import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import {
  IMPORTED_TYPE_NAME_COLLISION_CODE,
  IMPORTED_TYPE_NAME_COLLISION_HINT,
  importedTypeNameCollisionMessage,
} from "../parser/imports";
import { collectUnresolvedNamedTypes } from "../parser/body-type-lowering";
import type { EnumDecl, SchemaDecl, ThetaBody } from "../parser/theta-document";

/** An empty declared set turns the existing unresolved-name walk into a reference walk. */
export function referencedNamedTypes(typeSource: string): readonly string[] {
  return collectUnresolvedNamedTypes(typeSource, new Set());
}

// Positions anchor diagnostics/descriptions but do not change the lowered shape.
const DECL_SHAPE_POSITION_KEYS: ReadonlySet<string> = new Set(["range", "line"]);
function isDifferentImportedTypeDecl(a: SchemaDecl | EnumDecl, b: SchemaDecl | EnumDecl): boolean {
  if (a === b) return false;
  const stripPosition = (_key: string, value: unknown): unknown =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(
          ([k]) => !DECL_SHAPE_POSITION_KEYS.has(k),
        ))
      : value;
  return JSON.stringify(a, stripPosition) !== JSON.stringify(b, stripPosition);
}

/** Store source names AND the entry alias; bound recursion independently of storage. */
function collectImportedTypeDecls(
  entrySchema: SchemaDecl | undefined,
  entryEnum: EnumDecl | undefined,
  outputName: string,
  libStatements: ThetaBody["statements"],
) {
  const schemaByName = new Map<string, SchemaDecl>();
  const enumByName = new Map<string, EnumDecl>();
  for (const stmt of libStatements) {
    if (stmt.kind === "schema") schemaByName.set(stmt.name, stmt);
    else if (stmt.kind === "enum") enumByName.set(stmt.name, stmt);
  }
  const schemas = new Map<string, SchemaDecl>();
  const enums = new Map<string, EnumDecl>();
  const visitedSchemas = new Set<string>();
  const collidedNames = new Set<string>();
  // Compare original nodes, not the renamed copies stored under alias names.
  const originalSchemaOf = new Map<string, SchemaDecl>();
  const originalEnumOf = new Map<string, EnumDecl>();
  const makeClaim = <T extends SchemaDecl | EnumDecl>(
    originalOf: Map<string, T>, stored: Map<string, T>,
  ): ((name: string, decl: T, storedValue: T) => void) => (name, decl, storedValue) => {
    const claimant = originalOf.get(name);
    if (claimant === undefined) {
      originalOf.set(name, decl);
      stored.set(name, storedValue);
    } else if (claimant !== decl) {
      collidedNames.add(name);
    }
  };
  const claimSchema = makeClaim(originalSchemaOf, schemas);
  const claimEnum = makeClaim(originalEnumOf, enums);
  const visitSchema = (sourceName: string, asName: string): void => {
    const decl = schemaByName.get(sourceName);
    const hasShape = decl !== undefined && (decl.fields !== undefined || decl.arms !== undefined);
    if (decl !== undefined && hasShape) {
      claimSchema(sourceName, decl, decl);
      if (asName !== sourceName) claimSchema(asName, decl, { ...decl, name: asName });
    }
    if (visitedSchemas.has(sourceName)) return;
    visitedSchemas.add(sourceName);
    if (decl === undefined || !hasShape) return;
    const sources = decl.fields !== undefined ? decl.fields.map((f) => f.typeSource) : (decl.arms ?? []);
    for (const source of sources) {
      for (const ref of referencedNamedTypes(source)) {
        visitSchema(ref, ref);
        visitEnum(ref, ref);
      }
    }
  };
  const visitEnum = (sourceName: string, asName: string): void => {
    const decl = enumByName.get(sourceName);
    if (decl !== undefined && decl.variants !== undefined) {
      claimEnum(sourceName, decl, decl);
      if (asName !== sourceName) claimEnum(asName, decl, { ...decl, name: asName });
    }
  };
  if (entrySchema !== undefined) visitSchema(entrySchema.name, outputName);
  if (entryEnum !== undefined) visitEnum(entryEnum.name, outputName);
  return { schemas, enums, collidedNames };
}

/** Add one specifier's closure to a module-local accumulator; never merge scopes. */
export function recordImportedTypeDecls(
  entrySchema: SchemaDecl | undefined,
  entryEnum: EnumDecl | undefined,
  outputName: string,
  libStatements: ThetaBody["statements"],
  schemas: Map<string, SchemaDecl>,
  enums: Map<string, EnumDecl>,
  mintedCollisions: Set<string>,
  site: { file: string; range: SourceRange },
  diagnostics: Diagnostic[],
): void {
  const transitive = collectImportedTypeDecls(entrySchema, entryEnum, outputName, libStatements);
  const collide = (name: string): void => {
    if (mintedCollisions.has(name)) return;
    mintedCollisions.add(name);
    diagnostics.push({
      severity: "error", code: IMPORTED_TYPE_NAME_COLLISION_CODE,
      file: site.file, range: site.range,
      message: importedTypeNameCollisionMessage(name), hint: IMPORTED_TYPE_NAME_COLLISION_HINT,
    });
  };
  for (const name of transitive.collidedNames) collide(name);
  const aggregate = <T extends SchemaDecl | EnumDecl>(
    reached: ReadonlyMap<string, T>, stored: Map<string, T>,
  ): void => {
    for (const [name, decl] of reached) {
      const existing = stored.get(name);
      if (existing === undefined) stored.set(name, decl);
      else if (isDifferentImportedTypeDecl(existing, decl)) collide(name);
    }
  };
  aggregate(transitive.schemas, schemas);
  aggregate(transitive.enums, enums);
}
