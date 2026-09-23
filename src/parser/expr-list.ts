// Shared comma-separated expression-list parsing for the body parser's call
// arguments (`(…)`) and array literals (`[…]`).

import type { Expr } from "./theta-ast";

/** The body parser's cursor, expression parser, and brace-suppression flag. */
interface ExprListCursor {
  advance(): unknown;
  isPunct(text: string): boolean;
  atEnd(): boolean;
  parseExpression(): Expr | null;
  getSuppressBrace(): boolean;
  setSuppressBrace(value: boolean): void;
}

/**
 * Parse a comma-separated expression list up to `close` (the opening bracket
 * already consumed), then consume `close` when present. Brace suppression is
 * cleared for the elements — a `{` inside a bracketed group is an object
 * literal, not a statement block — and restored afterwards. A null element
 * (parse failure) skips one token and continues, the parser's single-token
 * error recovery.
 */
export function parseDelimitedExprs(cursor: ExprListCursor, close: string): Expr[] {
  const items: Expr[] = [];
  const save = cursor.getSuppressBrace();
  cursor.setSuppressBrace(false);
  while (!cursor.isPunct(close) && !cursor.atEnd()) {
    const item = cursor.parseExpression();
    if (item === null) {
      cursor.advance();
      continue;
    }
    items.push(item);
    if (cursor.isPunct(",")) {
      cursor.advance();
    }
  }
  cursor.setSuppressBrace(save);
  if (cursor.isPunct(close)) {
    cursor.advance();
  }
  return items;
}
