// Shared schema and own-key primitives for the proto-named regression witnesses.

import type { SourceRange } from "../../src/diagnostics/diagnostic";
import type { SchemaSlugFn } from "../../src/seams/schema-validator";

/** A content-addressing function deriving a distinct slug per distinct schema. */
export const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};

/** Whether `key` is an OWN key of `target` — never a prototype-chain read. */
export function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * How a record's prototype reads back: the sentinel string for
 * `Object.prototype`, else the prototype's own JSON. The sentinel keeps the
 * failure diff legible when a field's schema node or default replaces the prototype.
 */
export function prototypeReport(target: object): string {
  const proto = Object.getPrototypeOf(target);
  if (proto === Object.prototype) {
    return "Object.prototype";
  }
  if (proto === null) {
    return "null";
  }
  return JSON.stringify(proto);
}

/** A throwaway located range for the `params:` field inputs. */
export function range(line: number): SourceRange {
  return { start: { line, column: 1 }, end: { line, column: 10 } };
}
