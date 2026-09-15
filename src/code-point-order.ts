// Unicode code-point (lexical) string comparator.
//
// A pure, dependency-free helper (no imports) shared by two independent
// canonical-serialisation obligations that each require object keys in
// ascending Unicode code-point order: the compact-transcript renderer's
// canonical JSON (binder/binder-model-and-context.md BNDR-8, `canonicalJson`
// in `src/binder/compact-transcript.ts`) and the canonical schema hash
// (docs/reference/schema-subset.md §"Canonical schema hash" step 2,
// `canonicalForm` in `src/parser/schema-lowering.ts`). One shared
// implementation means a correction to the comparison (an empty string, an
// unpaired surrogate, an astral-plane character) reaches both call sites.

/**
 * Compare two strings by Unicode code-point (lexical) order. The default `<`
 * on strings compares UTF-16 code units, which diverges from code-point order
 * only across the surrogate range; iterating code points keeps astral keys
 * ordered correctly.
 */
export function compareCodePoint(a: string, b: string): number {
  const aPoints = [...a];
  const bPoints = [...b];
  const len = Math.min(aPoints.length, bPoints.length);
  for (let i = 0; i < len; i += 1) {
    const ap = aPoints[i]?.codePointAt(0) ?? 0;
    const bp = bPoints[i]?.codePointAt(0) ?? 0;
    if (ap !== bp) {
      return ap - bp;
    }
  }
  return aPoints.length - bPoints.length;
}
