// Shared field-list parsing for typed and bare object patterns.

import type { Token } from "../lexer/lexer";
import type { PatternNode } from "./theta-document";

/** The body parser's cursor and recursive pattern operations. */
interface ObjectPatternCursor {
  advance(): Token;
  peek(): Token;
  isPunct(text: string): boolean;
  atEnd(): boolean;
  tryConsumeRestPattern(): boolean;
  parsePattern(): PatternNode;
}

/** Consume an opening `{`, its pattern fields, and the closing `}` when present. */
export function parseObjectPatternFields(
  cursor: ObjectPatternCursor,
): { readonly name: string; readonly pattern: PatternNode }[] {
  cursor.advance();
  const fields: { readonly name: string; readonly pattern: PatternNode }[] = [];
  while (!cursor.isPunct("}") && !cursor.atEnd()) {
    if (cursor.tryConsumeRestPattern()) {
      if (cursor.isPunct(",")) {
        cursor.advance();
      }
      continue;
    }
    const nameTok = cursor.peek();
    if (nameTok.kind !== "ident" && nameTok.kind !== "string") {
      cursor.advance();
      continue;
    }
    cursor.advance();
    let fieldPattern: PatternNode;
    if (cursor.isPunct(":")) {
      cursor.advance();
      fieldPattern = cursor.parsePattern();
    } else {
      // `{ field }` sugars `{ field: field }` (grammar.md §Pattern
      // grammar): a colon-less field binds the field value to a
      // same-named identifier, never a wildcard on the next token.
      fieldPattern = { kind: "identifier", name: nameTok.text };
    }
    fields.push({ name: nameTok.text, pattern: fieldPattern });
    if (cursor.isPunct(",")) {
      cursor.advance();
    }
  }
  if (cursor.isPunct("}")) {
    cursor.advance();
  }
  return fields;
}
