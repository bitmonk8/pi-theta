// V5c / V5c-T — the `///` doc-comment description seam.
//
// This module owns the parse-time lowering of Rust-style `///` doc comments
// into JSON Schema `description:` fields, the multi-line join + common-leading-
// whitespace strip, and the placement check (descriptions.md §Placement /
// §Multi-line / §`//` is a regular code comment, and grammar.md
// §`///` placement):
//
//   - `///` above a `schema` / `enum` / schema field / enum variant lowers its
//     joined text byte-for-byte into the anchor's `description:`; a `///` above
//     a top-level `fn` lowers nowhere (functions have no JSON Schema) and is
//     preserved on the AST as human-facing documentation only.
//   - `loom/parse/doc-comment-misplaced` — a `///` above any other production
//     (`let`, `import`, `export`, expression / control-flow statements).
//   - Consecutive `///` lines join with newlines; common leading whitespace is
//     stripped (same algorithm as query-template dedent); empty `///` lines
//     become blank lines; a regular `//` comment is never propagated.
//
// V5c-T (tests-task) declares these seam shapes and stubs the behaviour-bearing
// functions so the failing tests compile and red on their own primary
// assertions. The paired V5c implementation leaf fills these in.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";

/** A located site at which a `///` doc comment is checked. */
export interface DocCommentSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * The eligible anchor productions a `///` may sit above per descriptions.md
 * §Placement and grammar.md §`///` placement. `schema`/`enum`/`field`/`variant`
 * lower into JSON Schema; `fn` is eligible but lowers nowhere (AST-only).
 */
export type DocAnchorKind = "schema" | "enum" | "field" | "variant" | "fn";

/**
 * Join a multi-line `///` doc comment into one description string. Each element
 * of `docLines` is the `RestOfLine` content of one `///` line — the text after
 * the `///` marker, leading whitespace included. The lines are joined with
 * `\n`, the common leading whitespace shared by every non-blank line is then
 * stripped (the same dedent algorithm as query templates), and empty `///`
 * lines become blank lines. No other transformation is performed.
 */
export function joinDocComment(docLines: readonly string[]): string {
  // Common-leading-whitespace strip, same algorithm as the query-template
  // dedent (query-forms.md QRY-7): the common prefix is the longest common
  // literal prefix of the non-blank lines, drawn only from U+0020 (space) and
  // U+0009 (tab); whitespace-only lines are ignored when computing the prefix
  // and are normalised to an empty line in the output.
  const isBlank = (line: string): boolean => /^[ \t]*$/.test(line);

  const nonBlank = docLines.filter((line) => !isBlank(line));

  // Longest common {space,tab} prefix shared by every non-blank line.
  let prefix: string | undefined;
  for (const line of nonBlank) {
    const lead = /^[ \t]*/.exec(line)?.[0] ?? "";
    if (prefix === undefined) {
      prefix = lead;
      continue;
    }
    let i = 0;
    const max = Math.min(prefix.length, lead.length);
    while (i < max && prefix[i] === lead[i]) i += 1;
    prefix = prefix.slice(0, i);
  }
  const common = prefix ?? "";

  const stripped = docLines.map((line) =>
    isBlank(line) ? "" : line.slice(common.length),
  );
  return stripped.join("\n");
}

/**
 * Extract the description text from the maximal run of `///` lines immediately
 * above an anchor. Each element of `commentLines` is one raw comment line,
 * including its `//` or `///` marker. Only `///` lines contribute; a regular
 * `//` line is not propagated into the description and terminates the run.
 * Returns `undefined` when no trailing `///` line is present.
 */
export function extractDescription(
  commentLines: readonly string[],
): string | undefined {
  // A `///` doc line, capturing the RestOfLine content after the marker; the
  // negative lookahead keeps a four-slash `////` line from reading as a doc
  // comment (its fourth slash is ordinary content of a regular `//` comment).
  const docLine = /^[ \t]*\/\/\/(?!\/)(.*)$/;

  // Collect the maximal run of `///` lines immediately above the anchor — the
  // trailing run. A regular `//` (or any non-`///`) line terminates the run
  // and is not propagated.
  const restOfLines: string[] = [];
  for (let i = commentLines.length - 1; i >= 0; i -= 1) {
    const match = docLine.exec(commentLines[i] ?? "");
    if (match === null) break;
    restOfLines.unshift(match[1] ?? "");
  }

  if (restOfLines.length === 0) return undefined;
  return joinDocComment(restOfLines);
}

/**
 * Lower a doc comment onto an anchor's JSON Schema fragment. For a
 * `schema`/`enum`/`field`/`variant` anchor the `description` text is written
 * byte-for-byte as the fragment's `description` (no escaping, dedenting, or
 * wrapping beyond the join the caller already applied). For a `fn` anchor the
 * fragment is returned unchanged — functions have no JSON Schema, so the
 * description stays AST-only.
 */
export function lowerDescription(
  description: string,
  anchor: DocAnchorKind,
  fragment: Record<string, unknown>,
): Record<string, unknown> {
  // A `fn` anchor has no JSON Schema, so the description stays AST-only and the
  // fragment is returned unchanged.
  if (anchor === "fn") return fragment;

  // Schema-bearing anchors (`schema`/`enum`/`field`/`variant`) carry the text
  // byte-for-byte into `description` — no escaping, dedenting, or wrapping
  // beyond the join the caller already applied. Pre-existing fragment keys are
  // preserved untouched alongside the added description.
  return { ...fragment, description };
}

/**
 * Check a `///` doc comment's placement, returning
 * `loom/parse/doc-comment-misplaced` when the production the `///` sits above is
 * not one of `schema` / `enum` / schema field / enum variant / top-level `fn`.
 * Returns `undefined` for an eligible anchor production.
 */
export function checkDocCommentPlacement(
  production: string,
  site: DocCommentSite,
): Diagnostic | undefined {
  // The eligible anchor productions per descriptions.md §Placement and
  // grammar.md §`///` placement. A `///` above any other production fires
  // `loom/parse/doc-comment-misplaced`.
  const eligible: ReadonlySet<string> = new Set<DocAnchorKind>([
    "schema",
    "enum",
    "field",
    "variant",
    "fn",
  ]);
  if (eligible.has(production)) return undefined;

  // Message string sourced from the diagnostics registry
  // (diagnostics/code-registry-parse.md) per the *Diagnostic message anchors*
  // rule.
  return {
    severity: "error",
    code: "loom/parse/doc-comment-misplaced",
    file: site.file,
    range: site.range,
    message: "'///' doc comment is not legal above this production",
  };
}
