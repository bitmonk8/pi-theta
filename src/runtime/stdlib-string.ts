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
//     reproduce exactly.
//
// V3f-T (tests-task) declared the seam — the `evaluateStringMember` runtime
// dispatcher; V3f (this leaf) supplies the behaviour (and wired member-access /
// method-call parsing into the V3a evaluator).

import { assertStdlibMemberArguments, type StdlibMemberSignature } from "./stdlib-signature";
import type { ThetaValue } from "./value";

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

/**
 * Evaluate a `string` standard-library member on `receiver`: the `length`
 * property (called with `args === []`) or one of the method calls
 * (`toLowerCase` / `toUpperCase` / `trim` / `startsWith` / `endsWith` /
 * `includes` / `split` / `replace`), with the arguments already evaluated by
 * the V3a interpreter. Returns the member's theta value per the expressions.md
 * stdlib table and the normative `replace` reference vectors.
 */
export function evaluateStringMember(
  receiver: string,
  member: string,
  args: readonly ThetaValue[],
): ThetaValue {
  assertStdlibMemberArguments(member, STRING_MEMBER_SIGNATURES, args);
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
 * `$$`, `$n`) are never interpreted as JS replacement patterns, so this uses
 * the function-replacer form of the host `String.prototype.replaceAll` (its
 * string-replacement form does interpret them). An empty `from` returns the
 * receiver unchanged.
 */
function replaceLiteral(receiver: string, from: string, to: string): string {
  if (from === "") {
    return receiver;
  }
  return receiver.replaceAll(from, () => to);
}
