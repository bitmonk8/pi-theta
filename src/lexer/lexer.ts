// V1a / V1a-T — the lexer core seam.
//
// This module owns tokenisation and orchestrates encoding validation, newline
// normalisation, continuation joining, and contextual checks for a `.theta` /
// `.thetalib` source, per
// spec_topics/lexical.md and spec_topics/grammar.md §"Newline continuation".
// Lexer-surfaced diagnostics (`theta/load/invalid-encoding`, `theta/parse/*`)
// are delivered through the V7d producer-facing diagnostic-emission seam
// (`emitDiagnosticBatch`), never via a direct `pi.sendMessage` call.
//
// V1a-T (tests-task) declared this seam shape and stubbed `lexTheta`; V1a (this
// leaf) implements the encoding validator, the newline normalisation, the
// tokeniser, and the continuation pass.

import { type Diagnostic } from "../diagnostics/diagnostic";
import {
  emitDiagnosticBatch,
  type SystemNoteChannelDeps,
} from "../extension/system-note-channel";
import { decodeUtf8, normaliseNewlines, validateUtf8Encoding } from "./encoding";
import { collapseContinuations } from "./continuation";
import { contextualDiagnostics } from "./contextual-checks";
export { decodeUtf8, normaliseNewlines } from "./encoding";
export type { Pos, RawToken };

/**
 * Token kinds the lexer emits. `stmt-sep` is a *significant* newline that
 * actually terminates a statement: a newline swallowed by a continuation
 * trigger (open bracket, trailing/leading operator, trailing comma) produces
 * no `stmt-sep` token, so the spanning lines read as one statement.
 */
export type TokenKind =
  | "keyword"
  | "ident"
  | "number"
  | "string"
  | "punct"
  | "stmt-sep"
  | "eof";

/** A single lexed token. `text` is the post-normalisation source text. */
export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  /**
   * For `string` tokens: the decoded literal value with the escape table
   * (`\"`, `\'`, `\\`, `\n`, `\t`, `\r`, `\u{XXXX}`) lowered to its characters
   * (lexical.md §"String literals"). Absent on non-string tokens.
   */
  readonly value?: string;
  /**
   * For `number` tokens: the integer/number type classification — a literal
   * with no fractional or exponent part is `integer`, otherwise `number`
   * (lexical.md §"Number literals"). Absent on non-number tokens.
   */
  readonly numericType?: "integer" | "number";
  readonly range: {
    readonly start: { readonly line: number; readonly column: number };
    readonly end: { readonly line: number; readonly column: number };
  };
}

/** A raw, pre-decode source obtained via the PIC-13 `FileSystem.readBytes` seam. */
export interface ThetaSource {
  /** The source file path, used in diagnostic locations. */
  readonly path: string;
  /** The raw, pre-normalisation bytes (UTF-8-validated by the lexer). */
  readonly bytes: Uint8Array;
}

/** The result of lexing a single source. */
export interface LexResult {
  /** The token stream (post-normalisation, continuation-joined). */
  readonly tokens: readonly Token[];
  /** Every diagnostic the lexer raised (also delivered through the V7d seam). */
  readonly diagnostics: readonly Diagnostic[];
  /** `true` iff the source lexed with no error-severity diagnostic. */
  readonly ok: boolean;
}

/**
 * Lex a single `.theta` / `.thetalib` source: UTF-8-validate the raw bytes
 * (`theta/load/invalid-encoding`), normalise `\r\n` / `\r` → `\n`, then
 * tokenise — enforcing the identifier first-letter case rule
 * (`theta/parse/schema-case-mismatch`, `theta/parse/binding-case-mismatch`),
 * the reserved-keyword-as-identifier rule, the block-comment rejection, the
 * stray-backslash rule, the single-line-body rule, and the closed
 * continuation-trigger statement-joining rule.
 *
 * Any diagnostic produced is delivered through the V7d producer-facing
 * diagnostic-emission seam (`emitDiagnosticBatch`) as exactly one batched
 * `theta-system-note` — never via a direct `pi.sendMessage` call.
 */
export function lexTheta(
  source: ThetaSource,
  deps: SystemNoteChannelDeps,
): LexResult {
  const file = source.path;

  // Step 1 — validate the raw bytes before decoding or normalising.
  const encodingDiag = validateUtf8Encoding(source.bytes, file, deps);
  if (encodingDiag !== undefined) {
    return { tokens: [], diagnostics: [encodingDiag], ok: false };
  }

  // Step 2 — decode (skipping a leading UTF-8 BOM) and normalise CRLF / bare CR
  // to LF before any position is recorded, so spans are on the normalised
  // stream and CRLF / LF sources tokenise identically (lexical.md §Newline
  // normalisation).
  const text = normaliseNewlines(decodeUtf8(source.bytes));

  // Step 3 — tokenise, then collapse newlines into significant `stmt-sep`
  // tokens under the closed continuation-trigger rule (grammar.md §Newline
  // continuation), then run the contextual identifier / keyword / single-line
  // body checks.
  const scanned = scanTokens(text, file);
  const tokens = collapseContinuations(scanned.tokens);
  const contextual = contextualDiagnostics(tokens, file);
  const diagnostics: Diagnostic[] = [...scanned.diagnostics, ...contextual];

  if (diagnostics.length > 0) {
    // Producers hand diagnostics to the V7d seam; they never call
    // `pi.sendMessage` directly.
    emitDiagnosticBatch(diagnostics, deps);
  }
  return { tokens, diagnostics, ok: diagnostics.length === 0 };
}

/** A 1-indexed source position / range, matching the `Token` span shape. */
type Range = Token["range"];
type Pos = Range["start"];

/** An interior token kind: every {@link TokenKind} except the synthetic `eof`. */
type InteriorKind = Exclude<TokenKind, "eof">;

/** A scanned token before continuation collapsing; `newline` is a raw break. */
interface RawToken {
  readonly kind: InteriorKind | "newline";
  readonly text: string;
  readonly value?: string;
  readonly numericType?: "integer" | "number";
  readonly range: Range;
}

/**
 * The reserved keywords that cannot be used as identifiers (lexical.md).
 * Exported for the parser leaves that classify a reserved spelling at an
 * identifier slot: each needs the same 32-member set this module already
 * enforces at the token level (`NamedType ::= Ident`, and a reserved spelling
 * is never an `Ident`), rather than a second copy of it.
 */
export function reservedKeywords(): ReadonlySet<string> {
  return new Set([
    "let", "mut", "fn", "if", "else", "for", "in", "while", "break",
    "continue", "return", "match", "schema", "enum", "import", "export",
    "from", "as", "by", "invoke", "true", "false", "null", "Ok", "Err",
    "Result", "string", "number", "integer", "boolean", "array", "void",
  ]);
}

/**
 * Two-character operator tokens recognised greedily ahead of single chars,
 * including `++` / `--`. The increment/decrement pair is recognised here,
 * not at the parser's expression walk, because byte adjacency — no
 * whitespace between the two characters — is information only the scanner
 * has; the parser sees tokens, not bytes.
 */
function twoCharOperators(): ReadonlySet<string> {
  return new Set(["==", "!=", "<=", ">=", "&&", "||", "++", "--"]);
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isHexDigit(c: string): boolean {
  return isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
}

function isIdentStart(c: string): boolean {
  return (c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_";
}

function isIdentPart(c: string): boolean {
  return isIdentStart(c) || isDigit(c);
}

/** The cursor shared by token scanning and its literal phases. */
interface ScannerCursor {
  readonly text: string;
  readonly n: number;
  readonly i: number;
  readonly pos: () => Pos;
  readonly advance: () => string;
}

/** Token and diagnostic sinks shared by the scanner phases. */
interface ScannerSinks {
  readonly tokens: RawToken[];
  readonly diagnostics: Diagnostic[];
}

/**
 * String literals: single- or double-quoted, single-line. The escape table
 * (`\"`, `\'`, `\\`, `\n`, `\t`, `\r`, `\u{XXXX}`) is decoded into the
 * token's `value`; `text` keeps the verbatim source slice. An unrecognised
 * or malformed escape is `theta/parse/illegal-escape`; a `\u{...}` whose
 * scalar value is out of range or names a surrogate is
 * `theta/parse/invalid-unicode-escape` (lexical.md §"String literals").
 */
function scanStringLiteral(cursor: ScannerCursor, sinks: ScannerSinks, file: string): void {
  const { text, n, pos, advance } = cursor;
  const { tokens, diagnostics } = sinks;
  const quote = text[cursor.i];
  const start = pos();
  let raw = advance(); // opening quote
  let value = "";
  let closed = false;
  while (cursor.i < n && text[cursor.i] !== "\n") {
    const ch = text[cursor.i];
    if (ch === undefined) {
      break;
    }
    if (ch === quote) {
      raw += advance(); // closing quote
      closed = true;
      break;
    }
    if (ch === "\\") {
      const escStart = pos();
      raw += advance(); // the backslash
      const e = text[cursor.i];
      if (e === undefined || e === "\n") {
        // Dangling backslash at end of line / EOF: an unrecognised escape.
        diagnostics.push({
          severity: "error",
          code: "theta/parse/illegal-escape",
          file,
          range: { start: escStart, end: pos() },
          message: "illegal escape sequence: \\",
        });
        break;
      }
      if (e === '"' || e === "'" || e === "\\") {
        value += e;
        raw += advance();
      } else if (e === "n") {
        value += "\n";
        raw += advance();
      } else if (e === "t") {
        value += "\t";
        raw += advance();
      } else if (e === "r") {
        value += "\r";
        raw += advance();
      } else if (e === "u") {
        raw += advance(); // the `u`
        // `\u{XXXX}` — 1–6 hex digits between braces, a Unicode scalar
        // value (lexical.md §"String literals"). Consume the whole
        // bracketed (or braceless) digit run before judging the form, so
        // no unconsumed digit ever re-enters the loop as string content.
        let hex = "";
        let braced = false;
        let braceClosed = false;
        if (text[cursor.i] === "{") {
          braced = true;
          raw += advance(); // `{`
          while (cursor.i < n && isHexDigit(text[cursor.i] ?? "")) {
            const digit = advance();
            hex += digit;
            raw += digit;
          }
          if (text[cursor.i] === "}") {
            raw += advance(); // `}`
            braceClosed = true;
          }
        } else {
          // Braceless `\uXXXX` has no in-form value to judge either, but
          // the digit run still must not leak into `value` as content.
          while (cursor.i < n && isHexDigit(text[cursor.i] ?? "")) {
            const digit = advance();
            hex += digit;
            raw += digit;
          }
        }
        // A malformed FORM (missing `{`, `}`, zero digits, or more than
        // six) has no in-form value to judge, so it draws
        // `illegal-escape`, not `invalid-unicode-escape` — that code
        // stays exactly on its registered out-of-range/surrogate value
        // trigger and is computed only once the form itself is
        // well-formed (bug 0412 §Fix).
        const wellFormed =
          braced && braceClosed && hex.length >= 1 && hex.length <= 6;
        const cp = wellFormed ? parseInt(hex, 16) : NaN;
        const isScalar =
          wellFormed && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff);
        if (isScalar) {
          value += String.fromCodePoint(cp);
        } else if (wellFormed) {
          diagnostics.push({
            severity: "error",
            code: "theta/parse/invalid-unicode-escape",
            file,
            range: { start: escStart, end: pos() },
            message:
              "invalid Unicode escape: value is not a Unicode scalar value",
          });
        } else {
          diagnostics.push({
            severity: "error",
            code: "theta/parse/illegal-escape",
            file,
            range: { start: escStart, end: pos() },
            message: "illegal escape sequence: \\u",
          });
        }
      } else {
        diagnostics.push({
          severity: "error",
          code: "theta/parse/illegal-escape",
          file,
          range: { start: escStart, end: { line: pos().line, column: pos().column + 1 } },
          message: `illegal escape sequence: \\${e}`,
        });
        raw += advance(); // consume the offending character
      }
      continue;
    }
    value += ch;
    raw += advance();
  }
  if (!closed) {
    // Single-line-only string literals (lexical.md §"String literals"): a
    // scan that ends without a closing quote either hit a literal newline
    // (the current char is `\n`) or ran off the end of the source (EOF).
    if (text[cursor.i] === "\n") {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/literal-newline-in-string",
        file,
        range: { start, end: pos() },
        message: "literal newline in string literal",
      });
    } else {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/unterminated-string",
        file,
        range: { start, end: pos() },
        message: "unterminated string literal",
      });
    }
  }
  tokens.push({
    kind: "string",
    text: raw,
    value,
    range: { start, end: pos() },
  });
}

/** Scan a decimal literal, rejecting unsupported tails and out-of-range values. */
function scanNumberLiteral(cursor: ScannerCursor, sinks: ScannerSinks, file: string): void {
  const { text, n, pos, advance } = cursor;
  const { tokens, diagnostics } = sinks;
  const start = pos();
  let value = "";
  let isFractional = false;
  while (cursor.i < n) {
    const d = text[cursor.i];
    if (d === undefined || !isDigit(d)) {
      break;
    }
    value += advance();
  }
  if (text[cursor.i] === ".") {
    isFractional = true;
    value += advance();
    while (cursor.i < n) {
      const d = text[cursor.i];
      if (d === undefined || !isDigit(d)) {
        break;
      }
      value += advance();
    }
  }
  if (text[cursor.i] === "e" || text[cursor.i] === "E") {
    isFractional = true;
    value += advance();
    if (text[cursor.i] === "+" || text[cursor.i] === "-") {
      value += advance();
    }
    while (cursor.i < n) {
      const d = text[cursor.i];
      if (d === undefined || !isDigit(d)) {
        break;
      }
      value += advance();
    }
  }

  // A digit/letter/underscore abutting the decimal literal is a reserved or
  // malformed numeric form — the theta 1.0-deferred hex (`0x`), octal (`0o`),
  // binary (`0b`), and underscore-separator (`1_000`) syntaxes all surface
  // here as `theta/parse/unsupported-feature` (lexical.md §"Number literals").
  const tail = text[cursor.i];
  if (tail !== undefined && isIdentPart(tail)) {
    let extra = "";
    while (cursor.i < n) {
      const d = text[cursor.i];
      if (d === undefined || !isIdentPart(d)) {
        break;
      }
      extra += advance();
    }
    const fullText = value + extra;
    diagnostics.push({
      severity: "error",
      code: "theta/parse/unsupported-feature",
      file,
      range: { start, end: pos() },
      message: `unsupported syntactic feature: ${fullText}`,
    });
    tokens.push({ kind: "number", text: fullText, range: { start, end: pos() } });
    return;
  }

  // A literal with no fractional or exponent part is typed `integer`,
  // otherwise `number`. The magnitude is judged per lexed token, before the
  // parse-time unary-`-` fold: an out-of-safe-range integer or a
  // non-finite number rejects rather than silently rounding to a double or
  // yielding `Infinity` (lexical.md §"Number literals").
  const numericType: "integer" | "number" = isFractional
    ? "number"
    : "integer";
  const parsed = Number(value);
  if (numericType === "integer" && parsed > Number.MAX_SAFE_INTEGER) {
    diagnostics.push({
      severity: "error",
      code: "theta/parse/integer-literal-out-of-range",
      file,
      range: { start, end: pos() },
      message: "integer literal exceeds the safe-integer range",
    });
  } else if (numericType === "number" && !Number.isFinite(parsed)) {
    diagnostics.push({
      severity: "error",
      code: "theta/parse/number-literal-not-finite",
      file,
      range: { start, end: pos() },
      message: "number literal is not a finite IEEE-754 double",
    });
  }
  tokens.push({
    kind: "number",
    text: value,
    numericType,
    range: { start, end: pos() },
  });
}

/**
 * Tokenise the normalised stream into raw tokens (newlines preserved as
 * `newline` markers for the continuation pass) and the lexical diagnostics that
 * surface during scanning (`theta/parse/block-comment`,
 * `theta/parse/stray-backslash`). A block comment aborts scanning after its
 * diagnostic, since the rest of the stream is not lexable as line comments.
 */
function scanTokens(
  text: string,
  file: string,
): { tokens: RawToken[]; diagnostics: Diagnostic[] } {
  const tokens: RawToken[] = [];
  const diagnostics: Diagnostic[] = [];
  const reserved = reservedKeywords();
  const twoChar = twoCharOperators();
  const n = text.length;

  let i = 0;
  let line = 1;
  let column = 1;

  // Query-template body state machine (grammar.md §Comments / §Lexical: "Text
  // inside a `@`...`` query template is not a comment", and "stray backslash
  // outside any string literal, path literal, or `@`...`` query-template body").
  // Between the backticks of a `@`...`` template the text is PROSE, not code,
  // so `//`, `/*`, and `\` are ordinary characters — NOT a line-comment,
  // block-comment, or stray-backslash. `inTemplateProse` is set on the opening
  // backtick and cleared on the matching closing backtick. A `${...}`
  // interpolation temporarily leaves prose for normal code lexing (comments ARE
  // valid inside `${...}`), tracked by `interpDepth` (brace nesting; 0 ⇒ not in
  // an interpolation, so a `}` returning it to 0 resumes prose).
  let inTemplateProse = false;
  let interpDepth = 0;
  // Position of the opening backtick of the currently-open `@`...`` template,
  // or `null` when none is open. Threaded so the EOF branch below can span the
  // diagnostic's range from that backtick rather than pointing only at EOF
  // (QRY-17; code-registry-parse.md's `theta/parse/unterminated-template` row).
  let templateOpenStart: Pos | null = null;

  const pos = (): Pos => ({ line, column });
  const advance = (): string => {
    const c = text[i] ?? "";
    i += 1;
    if (c === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    return c;
  };

  const cursor: ScannerCursor = {
    text,
    n,
    get i() { return i; },
    pos,
    advance,
  };
  const sinks: ScannerSinks = { tokens, diagnostics };

  while (i < n) {
    const c = text[i];
    if (c === undefined) {
      break;
    }

    // Template PROSE region: consume verbatim. The parser recovers the template
    // by slicing the raw body between the backtick TOKENS (theta-document.ts
    // parseQuery) and re-lexes `${...}` from that slice (query-render.ts
    // lexQueryTemplate), so prose needs no interior tokens — only the backtick
    // delimiters and interpolation `${` must still tokenise. Advancing keeps
    // line/column correct for those delimiter spans.
    if (inTemplateProse) {
      if (c === "`") {
        const start = pos();
        advance();
        tokens.push({ kind: "punct", text: "`", range: { start, end: pos() } });
        inTemplateProse = false; // closing delimiter — resume code lexing
        templateOpenStart = null; // the template closed; no longer owed an EOF diagnostic
        continue;
      }
      if (c === "\\") {
        // A backslash escapes the next character in template prose (`\`` is a
        // literal backtick, `\$` suppresses interpolation); consume the pair so
        // an escaped backtick / `${` is never mistaken for a delimiter, mirroring
        // query-render.ts lexQueryTemplate. It is NOT a stray backslash.
        advance(); // the backslash
        if (i < n && text[i] !== undefined) {
          advance(); // the escaped character
        }
        continue;
      }
      if (c === "$" && text[i + 1] === "{") {
        // Enter a `${...}` interpolation: emit the `$` and `{` delimiter puncts
        // (the same tokens the code path would, so the continuation/bracket pass
        // is unaffected) and resume normal code lexing.
        const dollarStart = pos();
        advance(); // `$`
        tokens.push({ kind: "punct", text: "$", range: { start: dollarStart, end: pos() } });
        const braceStart = pos();
        advance(); // `{`
        tokens.push({ kind: "punct", text: "{", range: { start: braceStart, end: pos() } });
        inTemplateProse = false;
        interpDepth = 1;
        continue;
      }
      // Any other prose character (incl. `//`, `/*`, brackets, whitespace, and
      // newlines): consume it with no token and no diagnostic.
      advance();
      continue;
    }

    if (c === "\n") {
      const start = pos();
      advance();
      tokens.push({ kind: "newline", text: "\n", range: { start, end: pos() } });
      continue;
    }
    // Insignificant whitespace. The stream this scanner walks has already been
    // newline-normalised (`normaliseNewlines`), so no carriage return survives
    // to reach here and the `\n` branch above is the sole line-break handler.
    if (c === " " || c === "\t") {
      advance();
      continue;
    }

    // Comments. `//` and `///` run to end of line and emit no token.
    if (c === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") {
        advance();
      }
      continue;
    }
    // Block comments are rejected and abort the scan.
    if (c === "/" && text[i + 1] === "*") {
      const start = pos();
      diagnostics.push({
        severity: "error",
        code: "theta/parse/block-comment",
        file,
        range: { start, end: { line: start.line, column: start.column + 2 } },
        message: "block comments are not supported",
      });
      return { tokens, diagnostics };
    }

    if (c === '"' || c === "'") {
      scanStringLiteral(cursor, sinks, file);
      continue;
    }

    // A backslash outside any literal is a stray backslash (theta has no
    // line-continuation marker).
    if (c === "\\") {
      const start = pos();
      advance();
      diagnostics.push({
        severity: "error",
        code: "theta/parse/stray-backslash",
        file,
        range: { start, end: pos() },
        message: "stray backslash in source",
      });
      continue;
    }

    if (isDigit(c)) {
      scanNumberLiteral(cursor, sinks, file);
      continue;
    }

    if (isIdentStart(c)) {
      const start = pos();
      let value = "";
      while (i < n) {
        const d = text[i];
        if (d === undefined || !isIdentPart(d)) {
          break;
        }
        value += advance();
      }
      tokens.push({
        kind: reserved.has(value) ? "keyword" : "ident",
        text: value,
        range: { start, end: pos() },
      });
      continue;
    }

    // Semicolons are not part of the theta grammar (lexical.md §"Statement
    // terminators": statements are separated by newlines). A stray `;` (a
    // trailing statement terminator, or one used to pack statements) is
    // rejected rather than silently tokenised and dropped by the parser. Emit
    // the generic parser reject and consume it without a token so the
    // surrounding statements still parse.
    if (c === ";") {
      const semiStart = pos();
      advance();
      diagnostics.push({
        severity: "error",
        code: "theta/parse/unsupported-feature",
        file,
        range: { start: semiStart, end: pos() },
        message:
          "unsupported syntactic feature: ';' (semicolons are not part of the grammar)",
      });
      continue;
    }

    // Operators / punctuation: greedily prefer a recognised two-char operator.
    const start = pos();
    const pair = text.slice(i, i + 2);
    if (pair.length === 2 && twoChar.has(pair)) {
      advance();
      advance();
      tokens.push({ kind: "punct", text: pair, range: { start, end: pos() } });
      continue;
    }
    advance();
    tokens.push({ kind: "punct", text: c, range: { start, end: pos() } });
    if (c === "`" && interpDepth === 0) {
      // Opening backtick of a `@`...`` template. Only at top-level code: inside a
      // `${...}` interpolation a backtick is ordinary punctuation, matching the
      // parser, which stops its template walk at the first backtick token.
      inTemplateProse = true;
      templateOpenStart = start; // recovered if EOF arrives before the closing backtick
    } else if (interpDepth > 0 && c === "{") {
      interpDepth += 1;
    } else if (interpDepth > 0 && c === "}") {
      interpDepth -= 1;
      if (interpDepth === 0) {
        inTemplateProse = true; // interpolation closed — resume template prose
      }
    }
  }

  // EOF reached while a `@`...`` query template was still open (QRY-17,
  // query-escapes-stringification.md#qry-17; code-registry-parse.md's
  // `theta/parse/unterminated-template` row, phase `lex`). Both `inTemplateProse`
  // (prose region, never re-entered a `${...}` interpolation) and `interpDepth >
  // 0` (EOF arrived mid-interpolation, so the flag was cleared at `${` but the
  // template is still open — the row's Trigger, "EOF reached while scanning a
  // @`...` query template", covers this sub-case without naming it separately)
  // are open-template states at loop exit. Mirrors the `theta/parse/unterminated-string`
  // EOF/newline split above, minus the newline branch: a template has no
  // single-line restriction, so only EOF ends it unterminated.
  if (inTemplateProse || interpDepth > 0) {
    if (templateOpenStart === null) {
      // Unreachable by construction: both open-template states are entered only
      // where `templateOpenStart` is set to the opening backtick's position, and
      // cleared only where the template actually closes. A null here would mean
      // the state machine's invariant broke, not a legitimate EOF — fail loudly
      // rather than mint a diagnostic with a fabricated range.
      throw new Error(
        "lexer invariant violated: open @\`...\` template at EOF with no recorded opening backtick position",
      );
    }
    diagnostics.push({
      severity: "error",
      code: "theta/parse/unterminated-template",
      file,
      range: { start: templateOpenStart, end: pos() },
      message: "unterminated @\`...\` query template",
    });
  }

  return { tokens, diagnostics };
}
