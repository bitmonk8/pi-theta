// Frontmatter split and `///` doc-comment recovery for the V19a parser seam
// (theta-document.ts): the pre-lex frontmatter fence split, the line scan that
// recovers `///` doc-comment runs the lexer discards (bug 0411 / bug 0420
// template-prose exclusion included), and the description-attachment / merge
// passes that fold the recovered runs back into the statement list.

import type { Diagnostic, Position, SourceRange } from "../diagnostics/diagnostic";
import type { Token } from "../lexer/lexer";
import type { FrontmatterBlock } from "./frontmatter";
import { checkDocCommentPlacement, joinDocComment } from "./descriptions";
import type { DocComment, Stmt } from "./theta-ast";

/**
 * Split a normalised source into its optional leading `---` frontmatter block
 * and the executable body. The frontmatter region is blanked (not removed) in
 * the returned body so body line numbers stay aligned with the original
 * source. The block carries the fence-stripped YAML text plus the file-line
 * offset of the opening fence, in the `FrontmatterBlock` shape
 * `parseFrontmatter` accepts directly. Returns `frontmatter: null` when no
 * leading fence is present.
 */
export function splitFrontmatter(text: string): {
  frontmatter: FrontmatterBlock | null;
  bodyText: string;
} {
  const lines = text.split("\n");
  let open = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const t = (lines[i] ?? "").trim();
    if (t === "") {
      continue;
    }
    open = t === "---" ? i : -1;
    break;
  }
  if (open < 0) {
    return { frontmatter: null, bodyText: text };
  }
  let close = -1;
  for (let i = open + 1; i < lines.length; i += 1) {
    if ((lines[i] ?? "").trim() === "---") {
      close = i;
      break;
    }
  }
  if (close < 0) {
    // FM-4: an opening `---` with no closing `---` is a malformed, unterminated
    // frontmatter fence. frontmatter.md delimits the block with a closing
    // fence; an unclosed block is not a valid frontmatter mapping. Rather than
    // swallow the whole file as frontmatter and silently register a do-nothing
    // empty-body theta (dropping the author's query), yield an EMPTY frontmatter
    // block so `parseFrontmatter` produces `theta/load/missing-mode` and the
    // theta un-registers with author feedback. The closed diagnostics registry
    // (docs/reference/diagnostics.md) has no dedicated unterminated-fence code;
    // missing-mode is the documented "no recognised frontmatter mapping"
    // surface (see `extractFrontmatterBlock` in frontmatter.ts).
    return {
      frontmatter: { yaml: "", lineOffset: open + 1 },
      bodyText: lines.map(() => "").join("\n"),
    };
  }
  const yaml = lines.slice(open + 1, close).join("\n");
  const bodyText = lines.map((l, i) => (i <= close ? "" : l)).join("\n");
  return { frontmatter: { yaml, lineOffset: open + 1 }, bodyText };
}

// --------------------------------------------------------------------------
// `///` doc-comment line scan
// --------------------------------------------------------------------------

/**
 * Classify a `///` run's anchor by RANGE LOOKUP against the already-parsed
 * top-level statement list, per descriptions.md §Placement / grammar.md §`///`
 * placement (five eligible anchors: `schema`, `enum`, schema field, enum
 * variant, `fn`). The verdict is structural — a range containment test —
 * rather than a leading-word sniff, because a field or variant line leads
 * with its own NAME, not a keyword, so no lexical test can place it: `Low,`
 * and `language: string,` carry no shared prefix an eligible-set match could
 * key on, and their only distinguishing fact is that a schema/enum DECLARATION
 * encloses their line.
 *
 * Two passes, in this order, because a declaration HEAD line and a BODY
 * INTERIOR line need different tests and a line can satisfy only one:
 *   1. exact start: `anchorLine` IS a declaration's first line — `schema`,
 *      `enum`, or `fn` (reference/grammar.md:311 `FnDecl ::= SubagentMod?
 *      "fn" …`, so a `subagent fn` head-line still classifies `"fn"`).
 *   2. body interior: `anchorLine` falls strictly inside a schema/enum
 *      declaration's range (after its head, at/before its closing `}`) — a
 *      field row (only when the schema is the object form, `fields` present;
 *      the alias/`by` forms carry no field list to anchor against) or a
 *      variant row.
 * Anything neither pass matches — `let`, `import`, `export`, expression /
 * control-flow statements, or a line past the last statement (EOF) — is
 * `"other"`.
 */
function classifyDocAnchor(
  statements: readonly Stmt[],
  anchorLine: number | undefined,
): string {
  if (anchorLine === undefined) {
    return "other";
  }
  for (const stmt of statements) {
    if (stmt.range.start.line === anchorLine) {
      if (stmt.kind === "schema") return "schema";
      if (stmt.kind === "enum") return "enum";
      if (stmt.kind === "fn") return "fn";
    }
  }
  for (const stmt of statements) {
    if (stmt.range.start.line < anchorLine && anchorLine <= stmt.range.end.line) {
      if (stmt.kind === "schema" && stmt.fields !== undefined) return "field";
      if (stmt.kind === "enum") return "variant";
    }
  }
  return "other";
}

/** Build the doc-comment scan's template-prose predicate, excluding interpolations. */
export function templateProseLineSpans(tokens: readonly Token[]): (line: number) => boolean {
  // Bug 0411 §Fix option 1, refined by bug 0420 §Fix option 1 — `scanDocComments`
  // is the one line-oriented pass over the body text with no `@`...`` template
  // guard (lexical.md:24 sentence 1: text inside a query template is rendered
  // prompt, not a comment); the lexer's own `inTemplateProse` and
  // `contextualDiagnostics`'s `inTemplateBody` both already toggle on backtick
  // puncts to skip template interiors, so this scan gets the same toggle over
  // the already-in-scope `tokens`. Backticks are template delimiters and
  // always pair (matching lexer.ts's own toggle) EXCEPT when lexed inside a
  // `${…}` interpolation, where a backtick is ordinary punctuation, not a
  // delimiter (lexer.ts) — so the toggle only fires at interpolation depth 0.
  // Any document containing an unpaired top-level backtick already refused
  // upstream of this call, so on an accepted document every depth-0 backtick
  // token here is a genuine open/close pair, and `templateLineSpans` recovers
  // every template span exactly as 0411 left it.
  //
  // 0411 excluded a template span's lines wholesale, which over-reached into
  // `${…}` interpolation interiors: lexical.md:24 sentence 2 puts interpolation
  // contents in expression position, where the SAME `///` line one production
  // over already draws `doc-comment-misplaced` (grammar.md:204). The walk below
  // additionally tracks interpolation sub-spans — the lexer marks entry with an
  // adjacent `$` `{` punct pair (only ever emitted together, from template
  // prose) and nested `{`/`}` puncts while inside, so a depth counter over
  // those puncts between a template's `${` and its matching `}` recovers each
  // sub-span. `isTemplateLine` then excludes a line iff column-1 sits inside a
  // template span AND NOT inside one of its interpolation sub-spans: prose
  // stays excluded (sentence 1), interpolation interiors are treated as
  // ordinary expression position (sentence 2). A line whose column-1 is prose
  // but that merely CONTAINS a later `${…}` stays excluded — the interpolation
  // sub-span for that occurrence opens at a column > 1 on the same line, so
  // column-1 never falls strictly inside it. `docLine` anchors matches at `^`,
  // so a line with real code before an opening backtick, or after a closing
  // one, is correctly left un-excluded either way.
  const templateLineSpans: { open: Position; close: Position }[] = [];
  const interpSpans: { open: Position; close: Position }[] = [];
  let openBacktick: Position | undefined;
  let interpDepth = 0;
  let interpOpen: Position | undefined;
  let prevTok: Token | undefined;
  for (const tok of tokens) {
    if (tok.kind === "punct" && tok.text === "`" && interpDepth === 0) {
      if (openBacktick === undefined) {
        openBacktick = tok.range.start;
      } else {
        templateLineSpans.push({ open: openBacktick, close: tok.range.start });
        openBacktick = undefined;
      }
    } else if (tok.kind === "punct" && tok.text === "{") {
      if (
        openBacktick !== undefined &&
        interpDepth === 0 &&
        prevTok?.kind === "punct" &&
        prevTok.text === "$"
      ) {
        interpDepth = 1;
        interpOpen = prevTok.range.start;
      } else if (interpDepth > 0) {
        interpDepth += 1;
      }
    } else if (tok.kind === "punct" && tok.text === "}" && interpDepth > 0) {
      interpDepth -= 1;
      if (interpDepth === 0 && interpOpen !== undefined) {
        interpSpans.push({ open: interpOpen, close: tok.range.start });
        interpOpen = undefined;
      }
    }
    prevTok = tok;
  }
  const posBefore = (a: Position, b: Position): boolean =>
    a.line < b.line || (a.line === b.line && a.column < b.column);
  const isTemplateLine = (line: number): boolean => {
    const lineStart: Position = { line, column: 1 };
    const inTemplate = templateLineSpans.some(
      (span) => posBefore(span.open, lineStart) && posBefore(lineStart, span.close),
    );
    if (!inTemplate) {
      return false;
    }
    const inInterp = interpSpans.some(
      (span) => posBefore(span.open, lineStart) && posBefore(lineStart, span.close),
    );
    return !inInterp;
  };

  return isTemplateLine;
}

/**
 * Recover `///` doc-comment runs from the body text (the lexer emits no
 * comment tokens) and delegate each run's placement to V5c's
 * `checkDocCommentPlacement`. The anchor is derived structurally, by range
 * lookup against the already-parsed statement list (`classifyDocAnchor`), not
 * by sniffing the following line's leading word — the leading word cannot
 * distinguish a schema field or enum variant (which lead with their own name)
 * from any other statement.
 *
 * `isTemplateLine` (bug 0411 §Fix) reports whether a 1-indexed line's
 * column-1 position sits inside a `@`...`` query template body; per
 * lexical.md:24 such a line is rendered prompt text, never a comment, so both
 * scans below treat it as an ordinary non-doc, non-anchor line regardless of
 * what it textually looks like.
 */
export function scanDocComments(
  bodyText: string,
  file: string,
  statements: readonly Stmt[],
  isTemplateLine: (line: number) => boolean,
): {
  nodes: DocComment[];
  diagnostics: Diagnostic[];
  attachments: DocDescriptionAttachment[];
} {
  const lines = bodyText.split("\n");
  const nodes: DocComment[] = [];
  const diagnostics: Diagnostic[] = [];
  const attachments: DocDescriptionAttachment[] = [];
  const docLine = /^[ \t]*\/\/\/(?!\/)(.*)$/;
  // A `///`-shaped line inside a template body is prompt prose, not a doc
  // comment (lexical.md:24) — never let it seed or extend a run.
  const matchDocLine = (idx: number): RegExpExecArray | null =>
    isTemplateLine(idx + 1) ? null : docLine.exec(lines[idx] ?? "");

  let i = 0;
  while (i < lines.length) {
    const first = matchDocLine(i);
    if (first === null) {
      i += 1;
      continue;
    }
    const startLine = i + 1; // 1-indexed
    const content: string[] = [];
    while (i < lines.length) {
      const m = matchDocLine(i);
      if (m === null) {
        break;
      }
      content.push(m[1] ?? "");
      i += 1;
    }
    const range: SourceRange = {
      start: { line: startLine, column: 1 },
      end: { line: startLine, column: (lines[startLine - 1] ?? "").length + 1 },
    };
    nodes.push({ kind: "doc-comment", lines: content, range });

    // The anchor line is the next non-blank, non-comment line's 1-indexed
    // line number — NOT its leading word (a field or variant line leads with
    // its own name, which the classifier must not read). `undefined` when no
    // such line exists (EOF): `classifyDocAnchor` maps that to "other", so a
    // trailing `///` with no following production stays misplaced. A
    // template-interior line is skipped here too (bug 0411 §Fix): it is
    // rendered prose, not a candidate anchor, exactly like a blank or `//`
    // line.
    let anchorLine: number | undefined;
    for (let j = i; j < lines.length; j += 1) {
      const raw = lines[j] ?? "";
      if (raw.trim() === "" || /^[ \t]*\/\//.test(raw) || isTemplateLine(j + 1)) {
        continue;
      }
      anchorLine = j + 1;
      break;
    }
    const anchor = classifyDocAnchor(statements, anchorLine);
    const diag = checkDocCommentPlacement(anchor, { file, range });
    if (diag !== undefined) {
      diagnostics.push(diag);
    }
    // Every run gets an attachment candidate regardless of anchor kind;
    // `attachDocDescriptions` decides which anchors actually consume it
    // (schema/enum decl and field lines only — A1: variant/fn lines are never
    // read, so their doc text stays AST-only via the floating `DocComment`
    // node above, not this map).
    attachments.push({ anchorLine, description: joinDocComment(content) });
  }
  return { nodes, diagnostics, attachments };
}

/**
 * One `///` run's join result, paired with the 1-indexed source line of the
 * production it anchors to (`undefined` when no such line exists, e.g. a
 * trailing run at EOF). `attachDocDescriptions` consumes these by building an
 * anchorLine→description map and reading it only at the schema/enum-DECL and
 * field lines A1 designates as lowering targets.
 */
interface DocDescriptionAttachment {
  readonly anchorLine: number | undefined;
  readonly description: string;
}

/**
 * Attach `///` descriptions to their anchor declarations by line lookup,
 * BEFORE `mergeByLine` folds the floating `DocComment` nodes back into the
 * statement list. Per the A1 adjudication (docs/bugs/0358-…, §Fix), only
 * schema-DECL, enum-DECL, and schema-FIELD anchors consume a description here;
 * a `fn` head line or an enum variant line is never a key this function reads,
 * so its doc text is never attached (accepted-but-AST-only: it survives only
 * as the floating `DocComment` sibling `mergeByLine` still produces).
 * Statements outside this set (`let`, `import`, `export`, expressions, doc
 * comments themselves) pass through unchanged. Rebuilds by object-spread so
 * every unrelated field/statement is preserved verbatim.
 *
 * Attachment mirrors placement: a `//` or blank line between the trailing
 * `///` run and the anchor does NOT disconnect it (`scanDocComments`'s
 * `anchorLine` scan skips both, 0357's shipped placement behaviour), so a
 * validly-placed run always lowers — never a silent drop. The `//`-terminates
 * rule of `extractDescription` governs run FORMATION (a `//` inside the `///`
 * block breaks the maximal run), which `scanDocComments`'s forward `docLine`
 * scan already enforces.
 */
export function attachDocDescriptions(
  statements: readonly Stmt[],
  attachments: readonly DocDescriptionAttachment[],
): Stmt[] {
  const byLine = new Map<number, string>();
  for (const attachment of attachments) {
    if (attachment.anchorLine !== undefined) {
      byLine.set(attachment.anchorLine, attachment.description);
    }
  }
  return statements.map((stmt) => {
    if (stmt.kind === "schema") {
      const description = byLine.get(stmt.range.start.line);
      let fields = stmt.fields;
      let fieldsChanged = false;
      if (stmt.fields !== undefined) {
        // Mirror `classifyDocAnchor`'s precedence so one `///` run reaches one
        // anchor: its exact-start pass (a line that IS the decl head) wins over
        // its body-interior pass (a field row), and a run keyed to a line
        // carrying several fields sits immediately above the FIRST of them.
        // `consumed` records each line whose description a field has already
        // taken, so the same line's text is never re-attached to a later field
        // sharing that line.
        const consumed = new Set<number>();
        const mapped = stmt.fields.map((field) => {
          // A field on the decl head line is NOT a field anchor: that line is
          // the schema-DECL anchor, so a `///` above it lowers into the decl's
          // own `description` (above) and must not leak onto the field.
          if (field.line === undefined || field.line === stmt.range.start.line) {
            return field;
          }
          if (consumed.has(field.line)) {
            return field;
          }
          const fieldDescription = byLine.get(field.line);
          if (fieldDescription === undefined) {
            return field;
          }
          consumed.add(field.line);
          fieldsChanged = true;
          return { ...field, description: fieldDescription };
        });
        if (fieldsChanged) {
          fields = mapped;
        }
      }
      if (description === undefined && !fieldsChanged) {
        return stmt;
      }
      return {
        ...stmt,
        ...(description !== undefined ? { description } : {}),
        ...(fields !== undefined ? { fields } : {}),
      };
    }
    if (stmt.kind === "enum") {
      const description = byLine.get(stmt.range.start.line);
      return description !== undefined ? { ...stmt, description } : stmt;
    }
    return stmt;
  });
}

/** Merge doc-comment nodes into the statement list, ordered by source line. */
export function mergeByLine(
  statements: readonly Stmt[],
  docs: readonly DocComment[],
): Stmt[] {
  const merged: Stmt[] = [...statements, ...docs];
  return merged.sort((a, b) => {
    const al = a.range.start.line;
    const bl = b.range.start.line;
    if (al !== bl) {
      return al - bl;
    }
    return a.range.start.column - b.range.start.column;
  });
}
