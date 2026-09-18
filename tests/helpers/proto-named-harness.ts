// Shared schema and own-key primitives for the proto-named regression witnesses.

import type { SourceRange } from "../../src/diagnostics/diagnostic";
import { parseParams } from "../../src/parser/params";
import type { LoweredSchema, SchemaSlugFn } from "../../src/seams/schema-validator";

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

/**
 * One `params:` field as the frontmatter seam hands it to `parseParams`. A
 * `defaultSource` is the default RHS verbatim, so the lowering's own
 * `defaultSource` gate decides `required` exactly as it does in production.
 */
export interface Field {
  readonly name: string;
  readonly typeSource: string;
  readonly defaultSource?: string;
}

/**
 * The lowered `params:` document for `fields`, through the shipped `parseParams`
 * (`src/parser/params.ts`) — never a hand-built table where the production
 * producer can be driven instead. Fails LOUDLY on any error-severity diagnostic
 * or a withheld schema: `code-registry-parse.md:19` admits a `_`-leading name,
 * so a diagnostic here is a harness failure, and a withheld document would leave
 * the cell asserting nothing.
 */
export function loweredParams(
  fields: readonly Field[],
  what: string,
  file = "test.theta",
): LoweredSchema {
  const result = parseParams(
    fields.map((field, index) => ({ ...field, range: range(index + 1) })),
    [],
    { file },
  );
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `harness: ${what}'s \`params:\` block must lower CLEAN (code-registry-parse.md:19 admits a \`_\`-leading name), so a diagnostic here is a harness failure. Observed ${errors
        .map((d) => `${d.code}: ${d.message}`)
        .join("; ")}`,
    );
  }
  if (result.loweredSchema === undefined) {
    throw new Error(
      `harness: \`parseParams\` withheld the lowered schema for ${what} with no error-severity diagnostic — the cell has nothing to compile`,
    );
  }
  return result.loweredSchema;
}
