// The shared Node-style `.code` reader the three discovery modules classify
// filesystem rejections with.
//
// Each of them must tell one rejection apart from another — `ENOENT` (the path
// is not there, which is the ordinary case for every OPTIONAL discovery source)
// from `EACCES` / `EPERM` / `EISDIR` (the path is there and cannot be used,
// which is a real problem an operator must be told about). Collapsing the two
// is what made `theta/load/settings-unreadable` and `theta/load/unreadable-source`
// fire for merely-absent sources (docs/bugs/0013).
//
// It reads the code off the rejection value rather than binding a `catch`: the
// `node:fs` rejections carry no narrow error subtype to bind, and the
// broad-`catch` ban targets `catch` clauses, so every call site discriminates
// inside a Promise rejection handler instead.

/**
 * The Node-style `.code` string carried by a filesystem rejection, or
 * `undefined` when the thrown value carries no string `code` at all (a
 * non-Error rejection, or an Error without the property).
 *
 * The `in` narrowing is the check, not a formality: it types the property as
 * `unknown`, so the `typeof` guard below is what actually establishes the
 * string. No asserted shape stands in for either.
 */
export function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}
