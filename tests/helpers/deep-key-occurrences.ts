// A JSON deep-key-scan oracle shared by the bug-0011 envelope test files
// (PTQ-0276).
//
// WHY THIS FILE EXISTS. tests/binder-inference-provider-mapping.test.ts and
// tests/binder-forced-tool-dispatch.test.ts each independently declared the
// same `deepKeyOccurrences` recursive scan, used to prove the bug-0011
// `$ref`/`$defs` inliner leaves no trace of either key anywhere in the
// attached tool-parameters copy. This module centralises that shared
// traversal; each file's own fixtures and the specific key it scans for stay
// local.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module. `deepKeyOccurrences` inspects a static value
// snapshot; it is not a fake, double, or recording seam.

/**
 * Deep scan: every path at which the object key `key` occurs anywhere within
 * `value` (nested objects and arrays). `[]` means the key is entirely absent —
 * the bug-0011 live-round pin for `$ref` / `$defs` on the attachment copy.
 */
export function deepKeyOccurrences(value: unknown, key: string): string[] {
  const hits: string[] = [];
  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (node === null || typeof node !== "object") {
      return;
    }
    for (const [k, child] of Object.entries(node as Record<string, unknown>)) {
      if (k === key) {
        hits.push(`${path}.${k}`);
      }
      visit(child, `${path}.${k}`);
    }
  };
  visit(value, "$");
  return hits;
}
