// V1b / V1b-T — the literal-and-path validation seam.
//
// String and number *lexing* (the escape table, the integer/number type
// classification, and the parse-time range checks) live in the V1a lexer core
// (`lexTheta`, src/lexer/lexer.ts): V1b fills in escape decoding onto the
// `Token.value` field, the integer/number tag onto `Token.numericType`, and the
// `theta/parse/{illegal-escape,invalid-unicode-escape,integer-literal-out-of-range,
// number-literal-not-finite,unsupported-feature}` diagnostics the lexer raises
// during scanning (per spec_topics/lexical.md §"String literals" / §"Number
// literals"). This module owns the two literal checks that need a parse / type
// context the tokeniser does not have:
//
//   - `validatePathLiteral` — the path-literal rules from
//     lexical.md §"Path literals" / §"Extension matching": forward-slash
//     separators only (`theta/parse/invalid-path-separator`) and the byte-exact
//     lowercase `.theta` / `.thetalib` final-segment check
//     (`theta/parse/invoke-non-theta-extension` / `theta/parse/import-non-thetalib-extension`).
//     Later import / invoke parser leaves call this against the resolved path
//     literal; the `tools:` surface's extension check is owned solely by
//     `checkInvokeExtension` (src/parser/invoke-diagnostics.ts), since that
//     seam has no per-entry source range for this ranged checker to attach to.
//   - `checkIntegerNarrowing` — the one-way `integer → number` widening rule from
//     lexical.md §"Number literals" (`theta/parse/integer-narrowing` when a
//     `number` value reaches an `integer` position). The full type-compatibility
//     engine (V2b) consumes this literal-level check.
//
// V1b-T (tests-task) declares the seam shapes and stubs both functions as inert
// no-ops so the failing tests compile and red on their own primary assertions
// (no diagnostic produced). The paired V1b implementation leaf fills them in.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";

/** The numeric-literal type classification (lexical.md §"Number literals"). */
export type NumericLiteralType = "integer" | "number";

/** Where a path literal appears — selects the byte-exact extension check. */
export type PathLiteralKind = "import" | "invoke";

/** A path literal as written in source (post-escape-decode value + its span). */
export interface PathLiteral {
  /** The decoded path string, exactly as written (no realpath normalisation). */
  readonly value: string;
  /** The source span of the literal, used in diagnostic locations. */
  readonly range: SourceRange;
}

/** A located site at which a numeric narrowing is judged. */
export interface NarrowingSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * Validate a path literal against the lexical.md path-literal rules. Produces
 * (in spec order) `theta/parse/invalid-path-separator` for any backslash, then
 * the byte-exact lowercase final-segment check: an `invoke` path that does not
 * end in `.theta` is `theta/parse/invoke-non-theta-extension`, and an `import`
 * path that does not end in `.thetalib` is
 * `theta/parse/import-non-thetalib-extension`. The check is byte-exact lowercase, so
 * `.THETA` is rejected identically on case-sensitive and case-insensitive hosts.
 *
 * Diagnostics are produced in spec order: the backslash separator check first,
 * then the byte-exact lowercase final-segment check.
 */
export function validatePathLiteral(
  literal: PathLiteral,
  kind: PathLiteralKind,
  file: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { value, range } = literal;

  // Forward-slash separators only: any backslash is a parse error, located at
  // the offending span (lexical.md §"Path literals").
  if (value.includes("\\")) {
    diagnostics.push({
      severity: "error",
      code: "theta/parse/invalid-path-separator",
      file,
      range,
      message: "invalid path separator: backslash in path literal",
    });
  }

  // Byte-exact lowercase final-segment check, on the literal as written (no
  // realpath normalisation). `import` paths must end in `.thetalib`; `invoke`
  // paths must end in `.theta`. The comparison is byte-exact lowercase, so
  // `.THETA` / `.THETALIB` is rejected identically cross-OS
  // (lexical.md §"Extension matching").
  if (kind === "import") {
    if (!value.endsWith(".thetalib")) {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/import-non-thetalib-extension",
        file,
        range,
        message: `import path '${value}' does not end in .thetalib`,
      });
    }
  } else if (!value.endsWith(".theta")) {
    diagnostics.push({
      severity: "error",
      code: "theta/parse/invoke-non-theta-extension",
      file,
      range,
      message: `invoke path '${value}' does not end in .theta`,
    });
  }

  return diagnostics;
}

/**
 * Judge a numeric narrowing: when a `number` value reaches an `integer`
 * position, return `theta/parse/integer-narrowing`; the reverse (`integer`
 * widening to `number`) is permitted and returns `undefined`.
 *
 */
export function checkIntegerNarrowing(
  sourceType: NumericLiteralType,
  targetType: NumericLiteralType,
  site: NarrowingSite,
): Diagnostic | undefined {
  if (sourceType === "number" && targetType === "integer") {
    return {
      severity: "error",
      code: "theta/parse/integer-narrowing",
      file: site.file,
      range: site.range,
      message: "cannot narrow number to integer",
    };
  }
  return undefined;
}
