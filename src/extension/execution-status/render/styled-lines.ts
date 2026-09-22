// RFC 0015 (D4) — the lexer-token → styled-line mapper and its per-file
// cache. Highlighting comes from real `lexTheta` output (the RFC rejected a
// regex highlighter: we own the lexer). The mapper is pure text → spans;
// role → fg-SGR mapping happens at emit time in D5, where the fg strings
// come from `theme.getFgAnsi` — so no theme or TUI dependency lives here.
//
// Spike Q3 mechanics this module implements:
// - Comments are GAPS, not tokens (comment-only lines emit ZERO tokens), so
//   recovery is per-line against the lexer's own normalized source: every
//   character of a line not covered by a visible token range is one trivia
//   span. That single rule covers leading/trailing comments, comment-only
//   lines, inter-token whitespace, tabs, and `@`...`` template prose lines
//   (which also emit no interior tokens).
// - `stmt-sep` ranges can span line boundaries and claim nothing visible;
//   they (and `eof`) are excluded from claiming entirely.
// - The mapper styles the SAME normalized text the token ranges refer to:
//   the cache leg reproduces the lexer's own decode + newline normalization
//   (`decodeUtf8` + `normaliseNewlines`, BOM skip included) so 1-indexed
//   line/column spans line up exactly.
//
// Spike Deviation 4: `CustomEntryComponent.invalidate()` re-invokes the
// renderer, so the cache cannot live on the component — it is an explicit
// data structure the CALLER owns (extension/card state keyed by
// invocationId holds one per drive), passed in per call.

import {
  decodeUtf8,
  lexTheta,
  normaliseNewlines,
  type ThetaSource,
  type Token,
} from "../../../lexer/lexer";
import { inertSystemNoteChannel } from "../../system-note-channel";

/**
 * The syntax role of one span. Code roles mirror the visible `TokenKind`s
 * 1:1; `trivia` is everything recovered from unclaimed gaps — comments,
 * whitespace, and template prose — which D5 maps to the comment fg role
 * (whitespace carries no glyphs, so fg-coloring it is inert).
 */
export type SyntaxRole = "keyword" | "ident" | "number" | "string" | "punct" | "trivia";

/** One run of same-role characters on one line. `text` is verbatim source. */
export interface StyledSpan {
  readonly text: string;
  readonly role: SyntaxRole;
}

/** One source line as spans; concatenating `spans[].text` rebuilds the line. */
export interface StyledLine {
  readonly spans: readonly StyledSpan[];
}

// A visible token's claim on one line: 1-indexed columns, end-exclusive.
interface LineClaim {
  readonly startColumn: number;
  readonly endColumn: number;
  readonly role: SyntaxRole;
}

/**
 * Map normalized source text + its lexed tokens to per-line styled spans.
 * `normalizedText` MUST be the exact text the token ranges were produced
 * over (LF-only, BOM-skipped) — use {@link styledLinesFor} when starting
 * from raw bytes. Throws on overlapping token claims: the lexer never emits
 * them, so an overlap is a caller bug, not a render condition to paper over.
 */
export function computeStyledLines(
  normalizedText: string,
  tokens: readonly Token[],
): readonly StyledLine[] {
  const lines = normalizedText.split("\n");
  const claimsByLine = new Map<number, LineClaim[]>();

  for (const token of tokens) {
    // `stmt-sep` (may span lines, claims nothing visible) and the synthetic
    // `eof` are the only kinds without a code role.
    if (token.kind === "stmt-sep" || token.kind === "eof") {
      continue;
    }
    const role: SyntaxRole = token.kind;
    const { start, end } = token.range;
    // Every visible token the lexer emits today is single-line (strings are
    // single-line by grammar), but the slice below is written per-line so a
    // future multi-line kind degrades to correct claims instead of garbage.
    for (let lineNo = start.line; lineNo <= end.line; lineNo++) {
      const lineText = lines[lineNo - 1] ?? "";
      const startColumn = lineNo === start.line ? start.column : 1;
      const endColumn = lineNo === end.line ? end.column : lineText.length + 1;
      if (endColumn <= startColumn) {
        continue;
      }
      const existing = claimsByLine.get(lineNo);
      const claim: LineClaim = { startColumn, endColumn, role };
      if (existing === undefined) {
        claimsByLine.set(lineNo, [claim]);
      } else {
        existing.push(claim);
      }
    }
  }

  return lines.map((lineText, index) => {
    const claims = (claimsByLine.get(index + 1) ?? []).sort(
      (a, b) => a.startColumn - b.startColumn,
    );
    const spans: StyledSpan[] = [];
    let cursor = 1; // 1-indexed column of the first unclaimed character
    for (const claim of claims) {
      if (claim.startColumn < cursor) {
        throw new Error(
          "styled-line mapper invariant violated: overlapping token ranges " +
            `on line ${index + 1} (column ${claim.startColumn} < ${cursor})`,
        );
      }
      if (claim.startColumn > cursor) {
        spans.push({ text: lineText.slice(cursor - 1, claim.startColumn - 1), role: "trivia" });
      }
      spans.push({
        text: lineText.slice(claim.startColumn - 1, claim.endColumn - 1),
        role: claim.role,
      });
      cursor = claim.endColumn;
    }
    if (cursor <= lineText.length) {
      spans.push({ text: lineText.slice(cursor - 1), role: "trivia" });
    }
    return { spans };
  });
}

/**
 * The per-file styled-line cache, keyed by source path. An explicit
 * caller-owned structure (spike Deviation 4): the card state for one
 * invocation owns one and passes it to every render; dropping the card
 * drops the cache. A `Map` alias rather than a class — there is no
 * behavior to encapsulate, only the lex-once contract of
 * {@link styledLinesFor}.
 */
export type StyledLineCache = Map<string, readonly StyledLine[]>;

/** A fresh, empty cache (one per card / invocation). */
export function createStyledLineCache(): StyledLineCache {
  return new Map();
}

/**
 * The cache-fronted mapper: styled lines for `source`, lexing AT MOST once
 * per path per cache lifetime. The source is immutable for a run (the RFC's
 * premise for lex-at-card-creation), so a hit returns the cached array even
 * if the caller re-reads bytes that changed on disk — the card must keep
 * showing the text the running program was lexed from.
 */
export function styledLinesFor(
  cache: StyledLineCache,
  source: ThetaSource,
): readonly StyledLine[] {
  const hit = cache.get(source.path);
  if (hit !== undefined) {
    return hit;
  }
  // Reproduce the lexer's own normalization (decode with BOM skip, then
  // CRLF/CR → LF) so the styled text is byte-identical to what the token
  // ranges index. A source that fails UTF-8 validation lexes to zero tokens;
  // the mapper then degrades every line to trivia rather than refusing.
  // lexTheta delivers diagnostics through the note-channel seam; the card
  // lexes a script that already lexed clean at drive start (RFC §"Syntax
  // highlighting"), and even if it did not, re-announcing its diagnostics
  // from a render substrate would duplicate the load path's report — so the
  // channel is the shared inert one (PTQ-1237 consolidation) and
  // `LexResult.diagnostics` is ignored.
  const normalizedText = normaliseNewlines(decodeUtf8(source.bytes));
  const result = lexTheta(source, inertSystemNoteChannel());
  const styled = computeStyledLines(normalizedText, result.tokens);
  cache.set(source.path, styled);
  return styled;
}
