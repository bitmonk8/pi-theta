// The synthesised-name reservation predicate (schema-subset.md §Synthesised
// names, `:108`; bug 0040 §Fix Half A).
//
// schema-subset.md `:108` names FOUR forms the schema slug appears in, "the
// source of truth for the full set": `__inline_<slug>` ($defs hoist keys),
// `__theta_respond_<slug>` (the typed-query one-shot tool), `__theta_bind_<slug>`
// (the binder's structured-output tool), and `__theta_callee_<slug>__<post-
// rename-name>` (a `.theta` callee's prompt-mode registered tool). An author
// name in one of those exact shapes collides with the mint path's own
// namespace wherever the mint and an author-resolved name can land in the same
// table — today the `params:` `$defs` seam (`lowerCtx.defs`, params.ts).
//
// This module is the ONE construction point for "is this name a synthesised
// form", so every consumer tests the identical shape: `imports.ts` (the
// import-specifier reservation check) and `params.ts` (the `$defs`-writer that
// must not claim a reserved key on the author-resolution path) both import it
// rather than each keeping its own copy that could drift apart. Neither of
// those two modules imports the other, so importing this one from both adds no
// cycle.
//
// The reserved set is EXACTLY these four forms with `<slug>` fixed at 16
// LOWERCASE hex characters (§Canonical schema hash step 4: "First 16 hex
// characters of the digest, lowercased") — never the bare prefix. A same-prefix
// name that cannot equal a minted slug stays legal: `__inline_zzz` (not hex),
// uppercase hex (step 4 lowercases the digest), and 15- or 17-hex-character
// runs (one short of or over the fixed width) can never be produced by the
// recipe, so refusing them would refuse more than the namespace the mint
// actually occupies. The callee form's tail is likewise exact: `:108` spells it
// `__theta_callee_<slug>__<post-rename-name>`, and a *name* cannot be empty, so
// `__theta_callee_<slug>` with no `__`-and-tail at all, and
// `__theta_callee_<slug>__` with an empty tail, both stay legal too.
const HEX16 = "[0-9a-f]{16}";

const RESERVED_SYNTHESISED_NAME = new RegExp(
  `^(?:__inline_${HEX16}|__theta_respond_${HEX16}|__theta_bind_${HEX16}|__theta_callee_${HEX16}__[A-Za-z0-9_]+)$`,
);

/**
 * Whether `name` matches one of schema-subset.md §Synthesised names (`:108`)'s
 * four forms exactly (the bare prefix alone does not match).
 */
export function isReservedSynthesisedName(name: string): boolean {
  return RESERVED_SYNTHESISED_NAME.test(name);
}
