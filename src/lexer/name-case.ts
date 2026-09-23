// The shared first-letter case rule separating type-like names from bindings.

/**
 * Whether `name` starts with an uppercase ASCII letter — the lexical.md:15
 * first-letter rule that separates a type-like name (a `schema` / `enum` /
 * type-like binding, PascalCase) from a value binding (lowercase-first or
 * `_`). This is the ONE copy of the guard every enforcement position asks —
 * `contextualDiagnostics` (./contextual-checks), the `fn` parameter and
 * schema-field checks (../parser/body-parser), the `params:` key check
 * (../parser/frontmatter-params), the inline object-type field check
 * (../parser/type-walk), and the `resolveNamed` read seam
 * (../parser/type-compat) — so the lexer, the parsers, and the compatibility
 * engine agree on the classification by construction rather than by mirrored
 * two-comparison predicates.
 */
export function isTypeLikeName(name: string): boolean {
  const first = name[0] ?? "";
  return first >= "A" && first <= "Z";
}
