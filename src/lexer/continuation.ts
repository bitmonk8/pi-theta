// Join raw lexer newlines under the closed continuation-trigger rule.

import { type Pos, type RawToken, type Token } from "./lexer";

export { collapseContinuations };

/**
 * Operator texts that, as the *trailing* token of a line, trigger newline
 * continuation: the binary / ternary set from grammar.md §Newline continuation,
 * plus the binding `=` the spec's own worked example (`let x =\n\n foo` is one
 * statement) treats as an incomplete-statement continuation trigger.
 */
function trailingTriggers(): ReadonlySet<string> {
  return new Set([
    "+", "-", "*", "/", "%", "==", "!=", "<", "<=", ">", ">=", "&&", "||",
    "?", ":", "=",
  ]);
}

/**
 * Operator texts that, as the *leading* token of the next non-blank line,
 * trigger newline continuation (the binary / ternary set; `=` is not a leading
 * trigger).
 */
function leadingTriggers(): ReadonlySet<string> {
  return new Set([
    "+", "-", "*", "/", "%", "==", "!=", "<", "<=", ">", ">=", "&&", "||",
    "?", ":",
  ]);
}

/**
 * Collapse raw newline markers into significant `stmt-sep` tokens, applying the
 * closed continuation-trigger rule (grammar.md §Newline continuation): a run of
 * one or more newlines is swallowed (no `stmt-sep`) when the bracket depth is
 * open, the prior token is a trailing trigger, or the next token is a leading
 * trigger — otherwise it collapses to exactly one `stmt-sep`. Collapsing the
 * whole run in one decision is what makes blank lines transparent to a
 * continuation. A trailing `eof` token is always appended.
 */
function collapseContinuations(raw: readonly RawToken[]): Token[] {
  const out: Token[] = [];
  const trailing = trailingTriggers();
  const leading = leadingTriggers();
  let depth = 0;
  let i = 0;

  const isTrailing = (t: Token | undefined): boolean =>
    t !== undefined && t.kind === "punct" && trailing.has(t.text);
  const isLeading = (t: RawToken | undefined): boolean =>
    t !== undefined && t.kind === "punct" && leading.has(t.text);

  while (i < raw.length) {
    const t = raw[i];
    if (t === undefined) {
      break;
    }
    if (t.kind === "newline") {
      let j = i;
      while (j < raw.length && raw[j]?.kind === "newline") {
        j += 1;
      }
      const prev = out.length > 0 ? out[out.length - 1] : undefined;
      const next = j < raw.length ? raw[j] : undefined;
      const swallow = depth > 0 || isTrailing(prev) || isLeading(next);
      if (!swallow) {
        out.push({ kind: "stmt-sep", text: "\n", range: t.range });
      }
      i = j;
      continue;
    }

    if (t.kind === "punct") {
      if (t.text === "(" || t.text === "[" || t.text === "{") {
        depth += 1;
      } else if (t.text === ")" || t.text === "]" || t.text === "}") {
        if (depth > 0) {
          depth -= 1;
        }
      }
    }
    out.push({
      kind: t.kind,
      text: t.text,
      ...(t.value !== undefined ? { value: t.value } : {}),
      ...(t.numericType !== undefined ? { numericType: t.numericType } : {}),
      range: t.range,
    });
    i += 1;
  }

  const last = out.length > 0 ? out[out.length - 1] : undefined;
  const eofPos: Pos = last !== undefined ? last.range.end : { line: 1, column: 1 };
  out.push({ kind: "eof", text: "", range: { start: eofPos, end: eofPos } });
  return out;
}
