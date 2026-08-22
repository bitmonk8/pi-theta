// V13a / V13a-T — the query-template render / escapes / stringification seam.
//
// This module owns the pure `@`...`` query-template rendering pipeline of
// query/query-forms.md and query/query-escapes-stringification.md:
//
//   - QRY-7 — newline-trim → dedent (in that fixed order), reproducing the
//     normative vector table (CR/CRLF normalised to LF first, LF-only line
//     splitting, {U+0020, U+0009} dedent alphabet, whitespace-only-line
//     normalisation).
//   - QRY-17 — template escapes (`` \` ``, `\$`, `\\`, `\n`, `\t`, `\r`) with
//     `theta/parse/illegal-template-escape` for any other backslash pair and
//     `theta/parse/unterminated-template` at EOF inside a body.
//   - QRY-18 — stringification of a `${expr}` interpolation by the Theta static
//     type of `expr`, and the static `theta/parse/interpolated-result` rejection
//     of a `Result`-valued interpolation.
//   - QRY-6 — the degenerate-template defences: the parse-time
//     `theta/parse/empty-template` warning (static body, escapes NOT applied),
//     and the runtime short-circuit to
//     `ValidationError{cause: "empty_template", attempts: 0}` (never the
//     respond-repair path).
//
// V13a-T (tests-task) declares the seam shapes and stubs the behaviour-bearing
// functions inertly so the failing tests compile and red on their own primary
// assertions (the render pipeline is an identity stub, the lexer emits no
// escape/termination diagnostics, stringification returns empty text, and both
// degenerate-template defences are no-ops). The paired V13a implementation leaf
// fills these in.
//
// Spec: query/query-forms.md, query/query-escapes-stringification.md.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";
import { type ValidationError } from "../runtime/query-error";
import { type ThetaValue } from "../runtime/value";
import { ThetaPanic } from "../runtime/runtime-panics";
import { renderCanonicalNumber } from "./canonical-number";
import {
  translateOutbound,
  type OutboundTranslationInput,
} from "../runtime/wire-translation";

// --- Whitespace alphabets ---------------------------------------------------
//
// Two distinct sets, deliberately not the regex `\s` class:
//
//   - The dedent common-prefix walk and the whitespace-only-*line* predicate of
//     QRY-7 rule 5 draw only from {U+0020 space, U+0009 tab}.
//   - The degenerate-template predicates of QRY-6 (parse-time warning and
//     runtime short-circuit) draw from the ASCII whitespace set pinned at
//     System-note rendering rule 1: {U+0009, U+000A, U+000B, U+000C, U+000D,
//     U+0020}. Non-ASCII whitespace (e.g. U+00A0) is ordinary content for both.

/** {U+0020, U+0009} — the dedent / whitespace-only-line alphabet (QRY-7 rule 5). */
const DEDENT_WHITESPACE = new Set<number>([0x20, 0x09]);

/** ASCII whitespace set pinned at System-note rendering rule 1 (QRY-6). */
const ASCII_WHITESPACE = new Set<number>([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20]);

/** Whether every code point of `text` is in the ASCII whitespace set (empty ⇒ true). */
function isAsciiWhitespaceOnly(text: string): boolean {
  for (const ch of text) {
    if (!ASCII_WHITESPACE.has(ch.codePointAt(0) as number)) {
      return false;
    }
  }
  return true;
}

// --- Diagnostic codes + registry-anchored message strings ------------------
//
// Message strings are sourced verbatim from the diagnostics registry
// (diagnostics/code-registry-parse.md) per the Diagnostic message anchors rule.

/** `theta/parse/illegal-template-escape` (E). */
export const ILLEGAL_TEMPLATE_ESCAPE_CODE = "theta/parse/illegal-template-escape";
/** `theta/parse/unterminated-template` (E). */
export const UNTERMINATED_TEMPLATE_CODE = "theta/parse/unterminated-template";
/** `theta/parse/empty-template` (W). */
export const EMPTY_TEMPLATE_CODE = "theta/parse/empty-template";
/** `theta/parse/interpolated-result` (E). */
export const INTERPOLATED_RESULT_CODE = "theta/parse/interpolated-result";

/**
 * Registry Message for `theta/parse/illegal-template-escape`:
 * `illegal escape sequence in @`...` template: \<char>`.
 */
export function illegalTemplateEscapeMessage(char: string): string {
  return `illegal escape sequence in @\`...\` template: \\${char}`;
}
/** Registry Message for `theta/parse/unterminated-template`. */
export const UNTERMINATED_TEMPLATE_MESSAGE = "unterminated @`...` query template";
/** Registry Message for `theta/parse/empty-template`. */
export const EMPTY_TEMPLATE_MESSAGE =
  "query template body is empty after newline-trim and dedent";
/** Registry Message for `theta/parse/interpolated-result`. */
export const INTERPOLATED_RESULT_MESSAGE =
  "Result value cannot be interpolated; unwrap with ? or match first";

/**
 * The QRY-18 runtime fallback for a `Result`-valued `${expr}` interpolation
 * whose static type the type-layer gate (`src/parser/type-layer-checks.ts`)
 * could not resolve ahead of load (e.g. an inferred binding that widens past
 * the parser's static view). Carries the same registered
 * `theta/parse/interpolated-result` code the static gate emits — QRY-18's
 * "static where possible, runtime where not" posture. A `ThetaPanic`
 * subclass, not a plain thrown `Error`, so `isThetaPanic` classifies it and
 * QRY-21 (a panic during interpolation is never caught by `let _ =`) holds
 * for it, exactly as it already does for `MissingObjectKeyPanic` /
 * `NullMemberAccessPanic` (`../runtime/runtime-panics.ts`).
 */
export class InterpolatedResultPanic extends ThetaPanic {
  readonly code = INTERPOLATED_RESULT_CODE;
  constructor(message: string) {
    super(message);
    this.name = "InterpolatedResultPanic";
  }
}

/**
 * The `ValidationError.message` the runtime short-circuit carries (QRY-6). The
 * *rendered*-empty runtime message is distinct from the parse-time warning's
 * `EMPTY_TEMPLATE_MESSAGE`.
 */
export const EMPTY_TEMPLATE_RENDER_MESSAGE = "rendered query template is empty";

// --- Escape / termination lexing (QRY-17) ----------------------------------

/**
 * One lexed part of a `@`...`` template body: a literal text run (escapes
 * already resolved to their bytes) or a `${...}` interpolation carrying the
 * verbatim expression source between the braces.
 */
export type QueryTemplatePart =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "interp"; readonly exprSource: string };

/**
 * The result of lexing a `@`...`` template literal: the ordered parts, any
 * escape / termination diagnostics, and whether a closing backtick was found
 * (`false` ⇒ EOF inside the body ⇒ `theta/parse/unterminated-template`).
 */
export interface QueryTemplateLexResult {
  readonly parts: readonly QueryTemplatePart[];
  readonly diagnostics: readonly Diagnostic[];
  readonly terminated: boolean;
}

/**
 * Lex a `@`...`` query-template literal (QRY-17). `source` begins with the
 * opening backtick and, when terminated, ends at the matching unescaped closing
 * backtick. Recognised escapes are `` \` `` (literal backtick), `\$` (literal
 * `$`, suppressing interpolation), `\\` (literal backslash), and `\n` / `\t` /
 * `\r`; any other backslash pair emits `theta/parse/illegal-template-escape`.
 * Reaching EOF before a closing backtick sets `terminated: false` and emits
 * `theta/parse/unterminated-template`. Curly braces are ordinary text; only the
 * `${` / `}` pair delimits an interpolation.
 */
export function lexQueryTemplate(source: string): QueryTemplateLexResult {
  const parts: QueryTemplatePart[] = [];
  const diagnostics: Diagnostic[] = [];
  let text = "";
  let terminated = false;

  const flushText = (): void => {
    if (text.length > 0) {
      parts.push({ kind: "text", value: text });
      text = "";
    }
  };

  // Skip the opening backtick; `source` begins with it.
  let i = source[0] === "`" ? 1 : 0;

  while (i < source.length) {
    const c = source[i];

    if (c === "\\") {
      const next = source[i + 1];
      if (next === undefined) {
        // Trailing backslash at EOF — the body is unterminated; stop scanning
        // and let the post-loop `unterminated` diagnostic fire.
        break;
      }
      switch (next) {
        case "`":
          text += "`";
          break;
        case "$":
          text += "$";
          break;
        case "\\":
          text += "\\";
          break;
        case "n":
          text += "\n";
          break;
        case "t":
          text += "\t";
          break;
        case "r":
          text += "\r";
          break;
        default:
          // No other escapes are recognised (QRY-17): a backslash before any
          // other character is `theta/parse/illegal-template-escape`. Recovery
          // renders the offending character as literal content so the rest of
          // the body still lexes.
          diagnostics.push({
            severity: "error",
            code: ILLEGAL_TEMPLATE_ESCAPE_CODE,
            message: illegalTemplateEscapeMessage(next),
          });
          text += next;
      }
      i += 2;
      continue;
    }

    if (c === "`") {
      terminated = true;
      i += 1;
      break;
    }

    if (c === "$" && source[i + 1] === "{") {
      // Only the `${` / `}` pair delimits an interpolation; braces alone are
      // ordinary text. Track nesting so a `}` inside the expression (e.g. an
      // object literal) does not close the interpolation early.
      flushText();
      let depth = 1;
      let j = i + 2;
      let exprSource = "";
      while (j < source.length) {
        const cj = source[j];
        if (cj === "{") {
          depth += 1;
        } else if (cj === "}") {
          depth -= 1;
          if (depth === 0) {
            break;
          }
        }
        exprSource += cj;
        j += 1;
      }
      parts.push({ kind: "interp", exprSource });
      // Advance past the closing `}` (or to EOF when the interpolation was not
      // closed — the outer loop then ends and `unterminated` fires).
      i = j + 1;
      continue;
    }

    text += c;
    i += 1;
  }

  flushText();

  if (!terminated) {
    diagnostics.push({
      severity: "error",
      code: UNTERMINATED_TEMPLATE_CODE,
      message: UNTERMINATED_TEMPLATE_MESSAGE,
    });
  }

  return { parts, diagnostics, terminated };
}

// --- Newline-trim → dedent (QRY-7) -----------------------------------------

/**
 * Apply the two QRY-7 rendered-text normalisations in their fixed order —
 * **newline-trim first, then dedent** — to the fully-assembled template text
 * (post-escape, post-interpolation). Source CR / CRLF are normalised to LF
 * first; splitting is LF-only; the dedent alphabet and the whitespace-only-line
 * predicate are exactly {U+0020, U+0009}; whitespace-only lines are normalised
 * to empty lines and excluded from the common-prefix computation. Reproduces
 * the normative vector table.
 */
export function renderTemplateText(text: string): string {
  // Source CR / CRLF are normalised to LF before newline-trim and dedent run.
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // A template with no line-feed is a single physical line: both newline-trim
  // and dedent are no-ops, so any leading whitespace inside the backticks is
  // preserved (QRY-5 / QRY-7 vector 5). A line-feed introduced only by
  // newline-trim's own removal must still take the dedent path (vector 7), so
  // this branch keys off the pre-trim newline presence, not the post-trim text.
  if (!normalised.includes("\n")) {
    return normalised;
  }

  // Newline-trim: strip a single LF immediately after the opening backtick and
  // a single LF immediately before the closing backtick.
  let trimmed = normalised;
  if (trimmed.startsWith("\n")) {
    trimmed = trimmed.slice(1);
  }
  if (trimmed.endsWith("\n")) {
    trimmed = trimmed.slice(0, -1);
  }

  return dedent(trimmed);
}

/** Leading run of {U+0020, U+0009} characters at the start of `line`. */
function leadingDedentWhitespace(line: string): string {
  let end = 0;
  while (end < line.length && DEDENT_WHITESPACE.has(line.charCodeAt(end))) {
    end += 1;
  }
  return line.slice(0, end);
}

/** Whether `line` is empty or drawn solely from the {U+0020, U+0009} alphabet. */
function isDedentBlankLine(line: string): boolean {
  return leadingDedentWhitespace(line).length === line.length;
}

/** Longest common literal prefix of two strings. */
function commonPrefix(a: string, b: string): string {
  const limit = Math.min(a.length, b.length);
  let n = 0;
  while (n < limit && a[n] === b[n]) {
    n += 1;
  }
  return a.slice(0, n);
}

/**
 * The dedent normalisation of QRY-7: strip the longest common leading
 * {U+0020, U+0009} prefix shared by every non-blank line; whitespace-only lines
 * are excluded from the common-prefix computation and normalised to empty
 * lines. LF-only line splitting.
 */
function dedent(text: string): string {
  const lines = text.split("\n");
  let margin: string | undefined;
  for (const line of lines) {
    if (isDedentBlankLine(line)) {
      continue;
    }
    const indent = leadingDedentWhitespace(line);
    margin = margin === undefined ? indent : commonPrefix(margin, indent);
  }
  const prefix = margin ?? "";
  return lines
    .map((line) => (isDedentBlankLine(line) ? "" : line.slice(prefix.length)))
    .join("\n");
}

// --- Stringification of interpolated values (QRY-18) -----------------------

/**
 * The Theta static type of a `${expr}` interpolation, selecting its
 * stringification rule (QRY-18 table). `array` / `object` carry the sidecars +
 * root `$defs` so the compact `JSON.stringify` output applies outbound
 * wire-name translation recursively; `result` is the statically-rejected arm.
 */
export type InterpolationType =
  | { readonly kind: "string" }
  | { readonly kind: "integer" }
  | { readonly kind: "number" }
  | { readonly kind: "boolean" }
  | { readonly kind: "null" }
  | { readonly kind: "enum" }
  | {
      readonly kind: "array";
      readonly sidecars?: OutboundTranslationInput["sidecars"];
      readonly rootDef?: string;
    }
  | {
      readonly kind: "object";
      readonly sidecars?: OutboundTranslationInput["sidecars"];
      readonly rootDef?: string;
    }
  | { readonly kind: "result" };

/**
 * The outcome of stringifying one interpolation: the rendered text, or the
 * `theta/parse/interpolated-result` diagnostic when `expr`'s static type is
 * `Result<T, E>` (QRY-18, `Result` row).
 */
export type StringifyResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/**
 * Stringify one `${expr}` interpolation by the Theta static type of `expr`
 * (QRY-18). `string` renders verbatim; `integer` / `number` via the canonical
 * decimal renderer; `boolean` / `null` as their literals; an enum as its bare
 * wire value unquoted; `array` / `object` as compact `JSON.stringify` with
 * outbound wire-name translation applied; a `Result`-typed expr is rejected
 * with `theta/parse/interpolated-result`.
 */
export function stringifyInterpolatedValue(
  value: ThetaValue,
  type: InterpolationType,
): StringifyResult {
  switch (type.kind) {
    case "string":
      return { ok: true, text: value as string };
    case "integer":
      return { ok: true, text: renderCanonicalNumber(value as number, "integer") };
    case "number":
      return { ok: true, text: renderCanonicalNumber(value as number, "number") };
    case "boolean":
      return { ok: true, text: (value as boolean) ? "true" : "false" };
    case "null":
      return { ok: true, text: "null" };
    case "enum":
      // The enum brand is dropped — the model only ever sees the bare wire
      // string. The boxed-string enum value stringifies to its wire form.
      return { ok: true, text: String(value) };
    case "array":
    case "object": {
      // Compact `JSON.stringify` (no pretty-printing) with outbound wire-name
      // translation applied recursively. When the sidecars / root `$defs` are
      // supplied, lower theta-side names to wire before serialising; otherwise
      // `JSON.stringify` already collapses enum values to their bare wire form.
      const lowered =
        type.sidecars !== undefined && type.rootDef !== undefined
          ? translateOutbound({
              value,
              sidecars: type.sidecars,
              rootDef: type.rootDef,
            })
          : value;
      return { ok: true, text: JSON.stringify(lowered) };
    }
    case "result":
      // Static rejection: a `Result`-valued interpolation is a parse error
      // (QRY-18, `Result` row).
      return {
        ok: false,
        diagnostic: {
          severity: "error",
          code: INTERPOLATED_RESULT_CODE,
          message: INTERPOLATED_RESULT_MESSAGE,
        },
      };
  }
}

// --- Degenerate rendered templates (QRY-6) ---------------------------------

/**
 * Projects a raw (pre-escape) `@`...`` template body onto the STATIC body
 * QRY-6 (query-forms.md#qry-6) defines its parse-time predicate over: "every
 * literal segment between interpolations". A backslash escape pair is copied
 * verbatim — both characters, unrewritten — because the predicate reads the
 * body pre-escape (this is what makes the `\n` two-character sequence a
 * suppression hatch rather than whitespace); a `${…}` interpolation span is
 * dropped in its entirety, brace-depth tracked so a nested `{`/`}` inside the
 * expression does not close the span early; every other character is copied
 * as-is. The concatenation of the surviving literal segments is returned.
 */
export function queryTemplateStaticBody(rawTemplate: string): string {
  let out = "";
  let i = 0;
  while (i < rawTemplate.length) {
    const ch = rawTemplate[i]!;
    if (ch === "\\" && i + 1 < rawTemplate.length) {
      out += ch + rawTemplate[i + 1]!;
      i += 2;
      continue;
    }
    if (ch === "$" && rawTemplate[i + 1] === "{") {
      i += 2;
      let depth = 1;
      while (i < rawTemplate.length && depth > 0) {
        if (rawTemplate[i] === "{") {
          depth += 1;
        } else if (rawTemplate[i] === "}") {
          depth -= 1;
        }
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * The parse-time `theta/parse/empty-template` warning (QRY-6). The predicate is
 * evaluated over the *static* body — every literal segment between
 * interpolations, newline-trim and dedent notionally applied, the escape
 * rewrites notionally **not** applied — so a whitespace-only static body warns
 * while an explicit `\n` literal (the two-character `` \n `` sequence,
 * pre-escape) suppresses it. Returns the warning diagnostic, or `undefined`
 * when the static body carries non-whitespace content.
 */
export function emptyTemplateWarning(
  staticBody: string,
  range?: SourceRange,
): Diagnostic | undefined {
  // The predicate is evaluated over the static body with newline-trim and
  // dedent notionally applied and the escape rewrites notionally NOT applied,
  // so the literal two-character `\n` sequence is non-whitespace and suppresses
  // the warning while a genuinely whitespace-only body warns.
  const rendered = renderTemplateText(staticBody);
  if (!isAsciiWhitespaceOnly(rendered)) {
    return undefined;
  }
  return {
    severity: "warning",
    code: EMPTY_TEMPLATE_CODE,
    message: EMPTY_TEMPLATE_MESSAGE,
    ...(range !== undefined ? { range } : {}),
  };
}

/**
 * The runtime short-circuit of QRY-6. Immediately before the user turn would be
 * issued, if the *fully-rendered* text has length 0 or contains only characters
 * from the ASCII whitespace set {U+0009, U+000A, U+000B, U+000C, U+000D,
 * U+0020} (never the regex `\s` class, so U+00A0-only text issues a turn), the
 * query short-circuits to `Err(ValidationError{cause: "empty_template",
 * attempts: 0, validation_errors: [], raw_response: null})` without a provider
 * round-trip and without triggering respond-repair. Returns the
 * `ValidationError`, or `undefined` when the render is non-degenerate.
 */
export function renderEmptyShortCircuit(
  renderedText: string,
): ValidationError | undefined {
  // The predicate uses the ASCII whitespace set only — never the regex `\s`
  // class — so a render consisting solely of non-ASCII whitespace (e.g. U+00A0)
  // issues a turn rather than short-circuiting.
  if (!isAsciiWhitespaceOnly(renderedText)) {
    return undefined;
  }
  return {
    kind: "validation",
    cause: "empty_template",
    message: EMPTY_TEMPLATE_RENDER_MESSAGE,
    attempts: 0,
    validation_errors: [],
    raw_response: null,
  };
}
