// Independent test oracle for docs/spec_topics/schema-subset.md's canonical
// schema hash: Unicode code-point key order, SHA-256 truncation and inline names.
// No production canonicaliser or slug helper is imported; the hand-written
// canonical forms and their honesty checks remain in each test file.
import { createHash } from "node:crypto";
import { expect } from "vitest";

/** SHA-256 of the canonical-form bytes, first 16 lowercase hex characters. */
export function slugOfCanonicalForm(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

/** The synthesised `$defs` key for a fragment given its canonical form (:73). */
export function inlineDefName(canonical: string): string {
  return `__inline_${slugOfCanonicalForm(canonical)}`;
}

/**
 * Compare by Unicode code point, as schema-subset.md:100 requires. UTF-16 code
 * unit order diverges across the surrogate range. This test-only comparator
 * stays independent of the implementation it checks.
 */
export function compareCodePoint(a: string, b: string): number {
  const ap = [...a];
  const bp = [...b];
  for (let i = 0; i < Math.min(ap.length, bp.length); i += 1) {
    const x = ap[i]?.codePointAt(0) ?? 0;
    const y = bp[i]?.codePointAt(0) ?? 0;
    if (x !== y) {
      return x - y;
    }
  }
  return ap.length - bp.length;
}

/** Assert every object key in a parsed canonical form is code-point sorted. */
export function assertKeysSorted(label: string, value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertKeysSorted(label, item, `${path}[${i}]`));
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  const keys = Object.keys(value as Record<string, unknown>);
  expect(
    keys,
    `${label}: §Canonical schema hash step 2 (:100) sorts object keys by Unicode code point; keys at ${path} are ${JSON.stringify(keys)}`,
  ).toEqual([...keys].sort(compareCodePoint));
  for (const key of keys) {
    assertKeysSorted(label, (value as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

/** Collect local $defs reference names in traversal order. */
export function refNames(value: unknown): string[] {
  const names: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    if (node === null || typeof node !== "object") {
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (key === "$ref" && typeof child === "string") {
        const match = /^#\/\$defs\/(.+)$/.exec(child);
        if (match?.[1] !== undefined) {
          names.push(match[1]);
        }
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  return names;
}

/**
 * Every `$ref` in a document resolves against the DOCUMENT ROOT's `$defs`. An
 * arm hoisted without the matching closure leaves a dangling pointer AJV
 * refuses with `MissingRefError`; this check names the missing entry before the
 * compile does.
 */
export function expectRefsClosed(
  label: string,
  document: Readonly<Record<string, unknown>>,
  requirement = "have a fragment at the document root, or AJV refuses the whole document with MissingRefError",
): void {
  const defs = (document["$defs"] ?? {}) as Record<string, unknown>;
  const missing = [...new Set(refNames(document))].filter((name) => !(name in defs));
  expect(
    missing,
    `${label}: every \`#/$defs/<name>\` pointer must ${requirement}; document=${JSON.stringify(document)}`,
  ).toEqual([]);
}
