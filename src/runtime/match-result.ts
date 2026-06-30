// V4a / V4a-T — the runtime `match`-evaluation seam.
//
// This module owns the runtime dispatch of a `match` expression over the six
// loom 1.0 pattern forms of expressions.md §"Pattern grammar (loom 1.0)" —
// wildcard, identifier, literal, constructor, object/schema, and array — and
// the `loom/runtime/match-error` panic (the implementation refers to it as
// `MatchError`) that fires when a scrutinee value matches none of a `match`'s
// arms (errors-and-results/error-model.md §"Runtime panics"; loom 1.0 does not
// statically check exhaustiveness, per expressions.md §"Exhaustiveness").
//
// V4a-T (tests-task) declares the seam — the `Pattern` model, the `MatchArm`
// shape, the `MatchError` panic class, and the `evaluateMatch` entry point —
// and asserts only the raise-versus-bind exhaustion behaviour: a scrutinee
// matching one of the six pattern forms binds and evaluates the selected arm,
// while a scrutinee matching none raises `MatchError`. The panic's `?`/`match`
// bypass and its registered `loom/runtime/match-error` message template are
// deferred to and closed by V4b-T, so V4a-T does not assert the message string.
//
// `evaluateMatch` is stubbed inert (it matches no arm and raises no panic), so
// the raise-versus-bind tests red on their own primary assertions (no thrown
// `MatchError`, and a sentinel return value rather than the selected arm's
// value), not on a compile error, a missing fixture, or a harness throw. The
// paired V4a implementation leaf fills it in.

import { type LoomValue } from "./value";

/** The registry code carried by the non-exhaustive-`match` runtime panic. */
export const MATCH_ERROR_CODE = "loom/runtime/match-error";

/**
 * The non-exhaustive-`match` runtime panic (errors-and-results/error-model.md
 * §"Runtime panics"; the implementation refers to it as `MatchError`). Carries
 * the `loom/runtime/match-error` registry code. The registered message-template
 * formatting and the `?`/`match` bypass routing are deferred to V4b-T; V4a-T
 * asserts only that this panic is raised when a scrutinee matches no arm.
 */
export class MatchError extends Error {
  readonly code = MATCH_ERROR_CODE;

  constructor(message: string) {
    super(message);
    this.name = "MatchError";
  }
}

/**
 * One of the six loom 1.0 `match` pattern forms (expressions.md §"Pattern
 * grammar (loom 1.0)"):
 *
 *   - `wildcard`    — `_`: matches anything, binds nothing.
 *   - `identifier`  — `x`: matches anything, binds the value to `name`.
 *   - `literal`     — `"validation"`, `0`, `true`, `null`: matches by structural
 *                     equality against `value`.
 *   - `constructor` — `Ok(p)` / `Err(p)`: matches the named `Result` variant and
 *                     recurses into `inner`.
 *   - `object`      — `Schema { field: p, ... }`: matches an object whose listed
 *                     `fields` match their inner patterns; unlisted fields are
 *                     ignored.
 *   - `array`       — `[a, b]`: matches an exact-length array, each slot against
 *                     its pattern.
 */
export type Pattern =
  | { readonly kind: "wildcard" }
  | { readonly kind: "identifier"; readonly name: string }
  | { readonly kind: "literal"; readonly value: LoomValue }
  | { readonly kind: "constructor"; readonly ctor: "Ok" | "Err"; readonly inner: Pattern }
  | {
      readonly kind: "object";
      readonly fields: readonly { readonly name: string; readonly pattern: Pattern }[];
    }
  | { readonly kind: "array"; readonly elements: readonly Pattern[] };

/** The bindings a matched pattern introduces (identifier name → bound value). */
export type Bindings = Readonly<Record<string, LoomValue>>;

/**
 * One `match` arm: a `pattern` and a `body` evaluated with the bindings the
 * pattern introduces. The body is a thunk so a non-selected arm's body is never
 * evaluated (expressions.md §`match` expression — arms evaluate to a value).
 */
export interface MatchArm {
  readonly pattern: Pattern;
  readonly body: (bindings: Bindings) => LoomValue;
}

/**
 * Evaluate a `match` expression: dispatch `scrutinee` against `arms` in order,
 * first matching arm wins, and evaluate the selected arm's `body` with the
 * bindings its pattern introduces. When `scrutinee` matches none of the arms,
 * raise `MatchError` (`loom/runtime/match-error`) — loom 1.0 performs no static
 * exhaustiveness check, so non-exhaustion surfaces at runtime
 * (expressions.md §"Exhaustiveness").
 *
 * V4a-T stubs this inert: it matches no arm and raises no panic, returning a
 * sentinel. The paired V4a leaf implements pattern dispatch, binding, and the
 * `MatchError` raise.
 */
export function evaluateMatch(
  _scrutinee: LoomValue,
  _arms: readonly MatchArm[],
): LoomValue {
  // V4a-T stub: inert. Returns a sentinel that no bind test expects and raises
  // no `MatchError`, so the raise-versus-bind tests red on their own primary
  // assertions. The paired V4a leaf implements the six-pattern dispatch and the
  // non-exhaustive-`match` `MatchError` raise.
  return null;
}
