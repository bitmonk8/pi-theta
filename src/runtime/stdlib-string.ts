// V3f / V3f-T — the `string` standard-library member seam.
//
// This module owns the `string` standard-library member surface of
// expressions.md §"Built-in methods and properties" (the EXPR code-keyed
// obligation area — no numbered REQ-IDs), evaluated on top of the V3a
// expression interpreter:
//
//   - the `string` members of the theta-1.0 stdlib table — the `length`
//     property (the UTF-16 code-unit count, matching JS `.length`, no grapheme
//     segmentation), `toLowerCase()` / `toUpperCase()` / `trim()` (the
//     locale-independent transforms), `startsWith(s)` / `endsWith(s)` /
//     `includes(s)` (each returning `boolean` with JS semantics), and
//     `split(sep)` (literal-only, returning `array<string>`, with the empty
//     separator decomposing into one string per UTF-16 code unit);
//   - `replace(from, to)` — the all-occurrences, single left-to-right
//     non-overlapping scan matching host `String.prototype.replaceAll`, with
//     `$`-sequences in `to` inserted literally (never interpreted as JS
//     replacement patterns) and an empty `from` returning the receiver
//     unchanged. The five normative reference vectors of expressions.md MUST
//     reproduce exactly;
//   - the static result element type of `array<T>.concat(array<U>)` — the least
//     upper bound `T ⊔ U` under the V2b `⊑` relation, the same LUB the
//     array-literal common-type rule computes (`integer ⊔ number = number`;
//     disjoint element types union to `T | U`).
//
// V3f-T (tests-task) declares the seam — the `evaluateStringMember` runtime
// dispatcher and the `concatElementType` LUB computation — and stubs the
// behaviour-bearing functions inertly so the failing tests compile and red on
// their own primary assertions:
//
//   - `evaluateStringMember` returns the inert `null` sentinel without
//     evaluating any member, so every result-value assertion reds (a `length`
//     count, a transform string, a `boolean` membership result, a `split`
//     array, or a `replace` reference vector);
//   - `concatElementType` returns the inert `null`-primitive sentinel without
//     computing the LUB, so every result-type assertion reds.
//
// No test reds on a compile error, a missing fixture, or a harness throw. The
// paired V3f implementation leaf fills these in (and wires member-access /
// method-call parsing into the V3a evaluator).

import { checkCompatible } from "../parser/type-compat";
import type { CompatType, TypeEnv } from "../parser/type-compat";
import { StdlibMethodArgumentDefectError, StdlibMethodArgumentKindDefectError } from "./runtime-panics";
import type { ThetaValue } from "./value";

/**
 * Bug 0315 — the per-parameter type descriptor a stdlib member's positional
 * argument is checked against. `"element"` and `"array"` exist only for the
 * `array<T>` table (`stdlib-array.ts`) — `T`, the receiver's own element type,
 * and "any `array<U>`" (for `concat`) respectively; neither descriptor is
 * meaningful outside an array receiver, so `string`/`object` signatures never
 * spell them. Defined once here (the first stdlib module read alphabetically)
 * and imported by `stdlib-array.ts` / `stdlib-object.ts` rather than
 * redeclared three times, so the parser's type-check arm and the three
 * runtime-belt dispatchers all read ONE shape.
 */
export type StdlibParamKind = "string" | "integer" | "element" | "array";

/**
 * A stdlib member's declared signature: the positional-argument arity bounds
 * `[min, max]` (both the `type`-phase `stdlib-arity-mismatch` parse check and
 * the runtime dispatcher belt read this) and, for the arity range's own
 * indices, the per-parameter type descriptor the `stdlib-arg-type-mismatch`
 * parse check resolves against (the runtime dispatcher belt reads `params`
 * too, as of bug 0394 — arity and kind are its two concerns).
 */
export interface StdlibMemberSignature {
  readonly min: number;
  readonly max: number;
  readonly params: readonly StdlibParamKind[];
}

/**
 * Bug 0394 KIND belt — the sibling of the bug-0315 arity belt above. Reuses
 * the same `params` descriptors the parse-time `stdlib-arg-type-mismatch`
 * check resolves against, so the runtime and parse checks never drift on what
 * counts as the right kind. Runs AFTER the arity belt (arity is a precondition
 * of even indexing `args[i]`), so a wrong-kind argument on a laundered
 * receiver fails loudly here instead of reaching the switch below and
 * JS-coercing (or, for `replace`'s `from` position, diverging — bug 0394).
 * `"element"` and an out-of-range index (an omitted optional argument) are
 * unchecked: `includes`/`indexOf` compare with `valuesEqual`, which is total
 * over any argument kind, and there is no descriptor to check for an argument
 * that was never supplied.
 */
export function assertStdlibArgumentKinds(
  member: string,
  signature: StdlibMemberSignature,
  args: readonly ThetaValue[],
): void {
  for (let i = 0; i < args.length; i += 1) {
    const kind = signature.params[i];
    const arg = args[i] as ThetaValue;
    if (kind === "string" && typeof arg !== "string") {
      throw new StdlibMethodArgumentKindDefectError(member, i, "a string", arg);
    }
    if (kind === "integer" && typeof arg !== "number") {
      throw new StdlibMethodArgumentKindDefectError(member, i, "an integer", arg);
    }
    if (kind === "array" && !Array.isArray(arg)) {
      throw new StdlibMethodArgumentKindDefectError(member, i, "an array", arg);
    }
    // "element" / undefined: unchecked — includes/indexOf are total over any
    // argument kind (V2c valuesEqual), and an omitted optional arg has no
    // descriptor to check.
  }
}

/**
 * Evaluate a `string` standard-library member on `receiver`: the `length`
 * property (called with `args === []`) or one of the method calls
 * (`toLowerCase` / `toUpperCase` / `trim` / `startsWith` / `endsWith` /
 * `includes` / `split` / `replace`), with the arguments already evaluated by
 * the V3a interpreter. Returns the member's theta value per the expressions.md
 * stdlib table and the normative `replace` reference vectors.
 */
/**
 * The `string` standard-library member surface (expressions.md §"Built-in
 * methods and properties"): the allow-list the `type`-phase
 * `theta/parse/unknown-method` check consumes. Kept in lockstep with the
 * `evaluateStringMember` dispatcher below — every name the dispatcher accepts
 * appears here, and no other.
 */
export const STRING_MEMBERS: ReadonlySet<string> = new Set([
  "length",
  "toLowerCase",
  "toUpperCase",
  "trim",
  "startsWith",
  "endsWith",
  "includes",
  "split",
  "replace",
]);

/**
 * Bug 0315 — the `string` member arity/argument-type table (expressions.md
 * §"Built-in methods and properties", the `string` Signature column):
 * `checkMethodCall`
 * (`../parser/type-layer-checks.ts`) reads it for the `stdlib-arity-mismatch` /
 * `stdlib-arg-type-mismatch` parse checks, and `evaluateStringMember` below
 * reads it for the runtime belt. Every key here is also a `STRING_MEMBERS`
 * name, and vice versa — the two are hand-written and independent (the
 * allow-list predates this table) rather than one derived from the other, so
 * a future member addition that updates only one of them is a silent drift a
 * reviewer must catch by inspection, the same discipline the sibling
 * `ARRAY_MEMBERS` / `OBJECT_MEMBERS` pairs below apply.
 */
export const STRING_MEMBER_SIGNATURES: ReadonlyMap<string, StdlibMemberSignature> = new Map([
  ["length", { min: 0, max: 0, params: [] }],
  ["toLowerCase", { min: 0, max: 0, params: [] }],
  ["toUpperCase", { min: 0, max: 0, params: [] }],
  ["trim", { min: 0, max: 0, params: [] }],
  ["startsWith", { min: 1, max: 1, params: ["string"] }],
  ["endsWith", { min: 1, max: 1, params: ["string"] }],
  ["includes", { min: 1, max: 1, params: ["string"] }],
  ["split", { min: 1, max: 1, params: ["string"] }],
  ["replace", { min: 2, max: 2, params: ["string", "string"] }],
]);

export function evaluateStringMember(
  receiver: string,
  member: string,
  args: readonly ThetaValue[],
): ThetaValue {
  // Bug 0315 runtime belt: a laundered receiver (a statically-unresolvable
  // `string` value) reaches here without ever passing through the parse-time
  // `stdlib-arity-mismatch` check (`../parser/type-layer-checks.ts` defers on
  // an "unknown"-classified receiver), so a wrong-arity call would otherwise
  // fall through to the unchecked `args[i] as …` casts below and forward raw
  // JS `undefined` into the host method (bug 0315 §Reproduction). Thrown
  // BEFORE the switch, so no case below ever sees an out-of-arity `args`. The
  // arity check is followed by the bug-0394 KIND check (same laundered-
  // receiver gap, one level down: a correct-arity call with a wrong-KIND
  // argument), so the belt now covers both arity and kind.
  const signature = STRING_MEMBER_SIGNATURES.get(member);
  if (signature !== undefined) {
    if (args.length < signature.min || args.length > signature.max) {
      throw new StdlibMethodArgumentDefectError(member, signature.min, signature.max, args.length);
    }
    assertStdlibArgumentKinds(member, signature, args);
  }
  switch (member) {
    // `length` — the UTF-16 code-unit count (JS `.length`; no grapheme or
    // code-point segmentation).
    case "length":
      return receiver.length;
    // Locale-independent case transforms and Unicode-whitespace trim.
    case "toLowerCase":
      return receiver.toLowerCase();
    case "toUpperCase":
      return receiver.toUpperCase();
    case "trim":
      return receiver.trim();
    // Membership predicates — `boolean`, JS semantics.
    case "startsWith":
      return receiver.startsWith(args[0] as string);
    case "endsWith":
      return receiver.endsWith(args[0] as string);
    case "includes":
      return receiver.includes(args[0] as string);
    // Literal-only split. Empty separator decomposes into one string per
    // UTF-16 code unit (JS `String.prototype.split("")`).
    case "split":
      return receiver.split(args[0] as string);
    // All-occurrences literal replace — see `replaceLiteral`.
    case "replace":
      return replaceLiteral(receiver, args[0] as string, args[1] as string);
    default:
      throw new Error(`unknown string stdlib member: ${member}`);
  }
}

/**
 * `replace(from, to)` — replaces all occurrences of `from` via a single
 * left-to-right, non-overlapping scan: after each match the next match is
 * sought past the consumed region, with no rewind into the consumed text or the
 * inserted replacement. `to` is inserted literally — `$`-sequences (`$&`,
 * `$$`, `$n`) are never interpreted as JS replacement patterns, so this cannot
 * use the host `String.prototype.replaceAll`, whose string-replacement form
 * does interpret them. An empty `from` returns the receiver unchanged.
 */
function replaceLiteral(receiver: string, from: string, to: string): string {
  if (from === "") {
    return receiver;
  }
  let result = "";
  let cursor = 0;
  for (;;) {
    const at = receiver.indexOf(from, cursor);
    if (at === -1) {
      result += receiver.slice(cursor);
      return result;
    }
    result += receiver.slice(cursor, at) + to;
    cursor = at + from.length;
  }
}

/**
 * Compute the static result element type of `array<T>.concat(array<U>)` — the
 * least upper bound `T ⊔ U` of the receiver element type `left` and the
 * argument element type `right` under the V2b `⊑` relation, the same LUB the
 * array-literal common-type rule computes (`integer ⊔ number = number`;
 * disjoint element types union to `left | right`).
 */
export function concatElementType(
  left: CompatType,
  right: CompatType,
  env: TypeEnv,
): CompatType {
  // LUB under `⊑`: if one element type is `⊑` the other, the wider one is the
  // LUB (this collapses identical types and applies the `integer ⊑ number`
  // widening in both call directions). Disjoint element types union to
  // `left | right`, receiver-first — the same union the array-literal
  // common-type rule (case 2) computes.
  if (checkCompatible(left, right, env) === "compatible") {
    return right;
  }
  if (checkCompatible(right, left, env) === "compatible") {
    return left;
  }
  return { kind: "union", arms: [left, right] };
}
