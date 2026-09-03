// V11d / V11d-T — Binder system-prompt builder.
//
// This module owns the code-keyed obligation area `cka-45`
// (binder/binder-bypass-and-envelope.md §"System-prompt structure (normative)"):
// the runtime constructs a system prompt conveying the theta's binding context to
// the binder model. The exact wording is non-normative; the structural
// obligations are the contract:
//
//   1. Theta identity line — `Theta: /<name>` (exactly one).
//   2. Description line — `Description: <description>` iff frontmatter
//      `description:` is non-empty after its line breaks (together with
//      adjoining horizontal whitespace) collapse to one U+0020 and the
//      result's leading/trailing U+0020 is trimmed; omitted entirely
//      otherwise (a raw value that collapses to nothing is treated as empty,
//      the same as an absent or already-empty value). A break-free value
//      renders unchanged.
//   3. Argument-hint line — `Argument hint: <value>` iff `argument-hint:` is
//      non-empty by the same post-collapse test as item 2; omitted entirely
//      otherwise. The same collapse-and-trim rule as item 2 governs the
//      interpolated scalar's line breaks.
//   4. Parameters block — a `Parameters:` header (unindented) plus one per-field
//      line per declared field in declaration order, each indented with exactly
//      two U+0020 SPACE, matching `<wire-name> (<type>) <requirement>[ — <desc>]`;
//      the whole block (header and lines) omitted when `params:` is absent/empty.
//   5. User-arguments line — `User arguments: <raw>` (always present; `<raw>` is
//      the slash text after the command name with leading/trailing
//      slash-argument whitespace stripped, no other normalisation).
//   6. Session-context block — an opening line beginning with the literal token
//      `Recent session context` and ending with `:`, then the compact transcript
//      body, then a terminating blank line (the block ends `\n\n`); emitted iff
//      `bind_context: session` and the truncation walk produced ≥1 turn; omitted
//      entirely otherwise.
//   7. Envelope-kinds enumeration — the three `kind` tokens `ok`, `needs_info`,
//      `ambiguous` all listed.
//   8. No-invent-defaults instruction — one line containing the literal
//      substring `defaulted` and at least one of `Do not` / `omit` / `skip`.
//
//   *Type display* — the per-field `<type>` is the declared Theta type in the
//   surface syntax of Type System, not the JSON-Schema lowering; a line break
//   inside a string literal renders as the two-character escape `\n`,
//   preserving the value that literal denotes, and every other line break
//   collapses, with its surrounding horizontal whitespace, to one U+0020
//   SPACE, so the rendering never spans more than the one physical line item 4
//   requires.
//   *Default-literal rendering* — the `<literal>` in `default=<literal>` is the
//   field default in the Theta literal sublanguage surface syntax, and the same
//   two-arm rule governs its line breaks. The string-literal arm escapes where
//   the other collapses because `\n` is that sublanguage's own spelling for a
//   newline, so the rendered literal still denotes the recorded value.
//   *Parameter-line reference renderings* — the four reference per-field lines
//   are reproduced byte-exact, including the description-omitted form
//   (`  language (string) required`, no trailing space or em-dash).
//
// V11d implements these seams: `renderBinderParamLine` renders one per-field
// line (item 4, Type display, Default-literal rendering, byte-exact
// Parameter-line reference renderings) and `buildBinderSystemPrompt` assembles
// the full prompt from the eight structural items.
//
// Spec: binder/binder-bypass-and-envelope.md (§"System-prompt structure
// (normative)", §"Binder system prompt", Type display, Default-literal
// rendering, Parameter-line reference renderings); the compact-transcript body
// referenced by item 6 is rendered by V11b (BNDR-7/8/9) and the truncation walk
// by V11i (cka-39) — both are inputs to this builder, not its responsibility.

import { trimSlashArgumentWhitespace } from "./binder-envelope";

/**
 * Collapse the line breaks out of an interpolated frontmatter scalar before it
 * is folded into item 2's or item 3's line (Description / Argument-hint):
 * `description:` and `argument-hint:` are prose, not a `Type` and not a
 * `Literal` (docs/spec_topics/binder/binder-bypass-and-envelope.md
 * §"System-prompt structure (normative)" items 2, 3), so no
 * sublanguage escape denotes anything inside either value. Unlike *Type
 * display* / *Default-literal rendering* (item 4), there is therefore no
 * string-literal arm here: running one over prose would render an ordinary
 * apostrophe's adjacent break as a literal backslash-n the reader cannot tell
 * apart from the author's own text, defeating the value the line exists to
 * convey. Every maximal run of U+0020 SPACE, U+0009 TAB, U+000D CR and
 * U+000A LF that contains at least one CR or LF collapses, with the whole
 * run, to one U+0020; a run containing no break is preserved verbatim. This
 * collapse arm duplicates `normaliseParamLineBreaks`'s non-literal arm in
 * shape rather than calling it: the two answer different spec sentences —
 * item 4's `<type>` / `<literal>` tokens there, items 2 and 3's whole
 * interpolated value here — and may move independently under a future
 * adjudication, so no shared helper is factored out. The leading/trailing
 * trim (U+0020 only) discharges the item-2/item-3 sentences above for a YAML
 * block scalar's clip-retained trailing newline: without it, `description: |`
 * collapses that trailing break to a U+0020 and the rendered line still
 * carries trailing whitespace the item list does not authorise. U+00A0 is
 * never touched by either the collapse or the trim. Text carrying no CR and
 * no LF is returned unchanged (the fast path), which is what keeps every
 * break-free corpus value and the item-2/item-3 assertions in
 * `tests/binder-system-prompt.test.ts` byte-identical. A value made only of
 * U+0020 / U+0009 / U+000D / U+000A collapses and trims to `""`; the two
 * call sites test this function's result for emptiness (not the raw
 * argument) so that value omits the line exactly as an absent or already-
 * empty field does, per item 2's and item 3's omission clauses.
 */
function normalisePromptTextLineBreaks(text: string): string {
  if (!/[\r\n]/.test(text)) {
    return text;
  }
  const n = text.length;
  let out = "";
  let i = 0;
  while (i < n) {
    const c = text[i] ?? "";
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      let j = i;
      let sawBreak = false;
      while (j < n) {
        const wc = text[j] ?? "";
        if (wc !== " " && wc !== "\t" && wc !== "\r" && wc !== "\n") {
          break;
        }
        if (wc === "\r" || wc === "\n") {
          sawBreak = true;
        }
        j += 1;
      }
      out += sawBreak ? " " : text.slice(i, j);
      i = j;
      continue;
    }
    out += c;
    i += 1;
  }
  let start = 0;
  let end = out.length;
  while (start < end && out[start] === " ") {
    start += 1;
  }
  while (end > start && out[end - 1] === " ") {
    end -= 1;
  }
  return out.slice(start, end);
}

// --- per-field descriptor ---------------------------------------------------

/**
 * The requirement token of one per-field line (item 4): exactly one of the
 * literal `required` or `default=<literal>`.
 *
 *   - `{ kind: "required" }` — a required-without-default field.
 *   - `{ kind: "default"; literal }` — a defaulted field; `literal` is the
 *     field's default already rendered in the Theta literal sublanguage surface
 *     syntax (the *Default-literal rendering* rule: `Severity.High`, `"hello"`,
 *     `[1, 2, 3]`, `[]`), emitted verbatim after `default=`.
 */
export type ParamRequirement =
  | { readonly kind: "required" }
  | { readonly kind: "default"; readonly literal: string };

/** One declared `params:` field, for the per-field system-prompt line (item 4). */
export interface SystemPromptParamField {
  /** The field's wire name (the leading token of the per-field line). */
  readonly wireName: string;
  /**
   * The field's declared Theta type in the *surface syntax* of Type System
   * (e.g. `string`, `array<integer>`, `string | null`, `Author`) — never the
   * JSON-Schema lowering, and PROJECTED to what that lowering kept
   * (`projectRenderedParamType`, src/parser/params.ts; bug 0251 §Fix): a
   * top-level inline-object segment the lowering discarded is not carried
   * here, so this field and the forced-tool envelope's `args` fragment
   * describe the same set of properties. A well-formed declared type
   * projects to itself and is emitted verbatim inside the `(<type>)`
   * parentheses; the caller (`binderPromptParamField`,
   * production-theta-producer.ts) is the one projection call site.
   */
  readonly type: string;
  /** The requirement token — `required` or `default=<literal>`. */
  readonly requirement: ParamRequirement;
  /**
   * The field's description, already normalised per Descriptions. When present
   * and non-empty the ` — <description>` segment is appended (U+0020 U+2014
   * U+0020 separator); when absent or empty the segment (and its leading space
   * and em-dash) is omitted and the line ends immediately after the requirement
   * with no trailing whitespace.
   */
  readonly description?: string;
}

// --- session-context block input --------------------------------------------

/**
 * The Session-context block input (item 6). Present iff `bind_context: session`
 * and the truncation walk (V11i) produced ≥1 included turn; absent (`undefined`
 * on the builder input) otherwise, in which case the whole block is omitted.
 */
export interface SystemPromptSessionContext {
  /**
   * The compact transcript body rendered by V11b (BNDR-7/8/9): the bytes that
   * follow the opening line up to (but not including) the terminating blank
   * line, ending with the trailing `\n` of its last turn block.
   */
  readonly transcriptBody: string;
}

// --- builder input -----------------------------------------------------------

/** Inputs to constructing one binder system prompt. */
export interface BuildBinderSystemPromptInput {
  /** The bare slash command name (no leading `/`) — item 1. */
  readonly name: string;
  /**
   * The theta's frontmatter `description:`. The Description line (item 2) is
   * omitted entirely when this is absent, `""`, or non-empty but collapses to
   * `""` under `normalisePromptTextLineBreaks` (a value made only of line
   * breaks and horizontal whitespace) — "non-empty" for item 2's condition is
   * measured on the collapsed-and-trimmed value, not the raw scalar.
   */
  readonly description?: string;
  /**
   * The theta's frontmatter `argument-hint:`. The Argument-hint line (item 3)
   * is omitted entirely under the same absent/empty/collapses-to-empty test
   * as `description` above.
   */
  readonly argumentHint?: string;
  /**
   * The declared `params:` fields in declaration order. Empty ⇒ the whole
   * Parameters block (header and lines) is omitted (item 4).
   */
  readonly params: readonly SystemPromptParamField[];
  /**
   * The raw slash text after the command name (untrimmed). The builder strips
   * leading/trailing slash-argument whitespace for the User-arguments line
   * (item 5) and applies no other normalisation.
   */
  readonly rawArguments: string;
  /** The Session-context block input (item 6); omitted ⇒ block omitted. */
  readonly sessionContext?: SystemPromptSessionContext;
}

// --- the per-field line (item 4) --------------------------------------------

/**
 * Render one per-field line of the Parameters block (item 4): the indent-and-
 * content portion, ending immediately before its terminating `\n`. The two
 * leading bytes are U+0020 U+0020; the content is
 * `<wire-name> (<type>) <requirement>[ — <description>]`.
 *
 * `<type>` and the `<literal>` inside `<requirement>` are each recorded,
 * author-controlled text (`SystemPromptParamField.type`,
 * `ParamRequirement.literal`) that may itself carry a line break, so both are
 * passed through `normaliseParamLineBreaks` before interpolation — the two
 * tokens *Type display* and *Default-literal rendering* govern. `description`
 * receives no such transform: it is a caller-supplied string, and no theta 1.0
 * authoring surface populates one — the ` — <description>` slot is RESERVED
 * with no theta 1.0 carrier (binder-bypass-and-envelope.md §System-prompt
 * structure item 4). `binderPromptParamField`
 * (`src/extension/production-theta-producer.ts`) sets no `description`, so for
 * every registrable theta this branch is unreached and pins renderer-oracle
 * bytes only. A future carrier MUST first extend the *Type display* /
 * *Default-literal rendering* line-break discipline to this slot before wiring
 * it, since it interpolates the description with no collapse-and-trim.
 *
 * The requirement token is `required` or `default=<literal>` (item 4,
 * Default-literal rendering); the ` — <description>` segment (U+0020 U+2014
 * U+0020 separator) is appended iff `description` is present and non-empty, and
 * omitted entirely otherwise so the line ends immediately after the
 * requirement with no trailing whitespace.
 */
export function renderBinderParamLine(field: SystemPromptParamField): string {
  const type = normaliseParamLineBreaks(field.type);
  const requirement =
    field.requirement.kind === "required"
      ? "required"
      : `default=${normaliseParamLineBreaks(field.requirement.literal)}`;
  // Two leading U+0020 SPACE, then `<wire-name> (<type>) <requirement>`.
  const base = `  ${field.wireName} (${type}) ${requirement}`;
  const description = field.description;
  if (description !== undefined && description !== "") {
    // Separator is exactly U+0020 U+2014 U+0020 (space, em-dash, space).
    return `${base} \u2014 ${description}`;
  }
  return base;
}

/**
 * Render the line breaks out of one recorded `<type>` or `<literal>` token
 * before it is interpolated into a per-field line (*Type display*,
 * *Default-literal rendering*): a `params:` declaration's declared type or
 * default RHS is recorded verbatim, and its source may itself span physical
 * lines (a YAML block scalar, a flow mapping wrapped for readability, a union
 * or generic split across lines) — item 4 requires the rendered line to stay
 * one physical line regardless of how the source was wrapped.
 *
 * A line break inside a string literal renders as the two-character escape
 * `\n` — collapsing it to a space would change the value the literal
 * denotes. Every other line break renders as one U+0020 SPACE, collapsing
 * with any surrounding horizontal whitespace into that one space. Text
 * carrying no line break is returned unchanged (the fast path below), which is
 * what keeps the four *Parameter-line reference renderings* and every
 * committed-corpus `Parameters:` block byte-identical.
 *
 * "String literal" is docs/spec_topics/lexical.md §String literals' regular
 * string: a single- (`'...'`) or double-quoted (`"..."`) span in which a
 * backslash and the character immediately after it form one escape unit, so
 * `\"` does not close the span. The span walk below mirrors the string-token
 * loop in `tokeniseExpr` (src/parser/literal-sublanguage.ts:136–150),
 * including its unterminated-quote disposition: an opening quote with no
 * match runs to end of text. A backtick or `@` byte never opens a span here —
 * template and query-template forms are outside the literal sublanguage
 * (docs/spec_topics/grammar.md §Theta literal sublanguage) and outside this
 * scan, so a line break next to one takes the collapse arm below.
 */
function normaliseParamLineBreaks(text: string): string {
  if (!/[\r\n]/.test(text)) {
    return text;
  }
  const n = text.length;
  let out = "";
  let i = 0;
  while (i < n) {
    const c = text[i] ?? "";
    if (c === '"' || c === "'") {
      const quote = c;
      out += quote;
      i += 1;
      while (i < n && text[i] !== quote) {
        let ch = text[i] ?? "";
        if (ch === "\\" && i + 1 < n) {
          // The escape unit: emitted verbatim, and what keeps the character
          // after it — even a quote — from ending the span here.
          out += "\\";
          i += 1;
          ch = text[i] ?? "";
        }
        if (ch === "\r") {
          out += "\\n";
          i += text[i + 1] === "\n" ? 2 : 1;
          continue;
        }
        if (ch === "\n") {
          out += "\\n";
          i += 1;
          continue;
        }
        out += ch;
        i += 1;
      }
      if (i < n) {
        out += text[i] ?? ""; // the closing quote
        i += 1;
      }
      continue;
    }
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      let j = i;
      let sawBreak = false;
      while (j < n) {
        const wc = text[j] ?? "";
        if (wc !== " " && wc !== "\t" && wc !== "\r" && wc !== "\n") {
          break;
        }
        if (wc === "\r" || wc === "\n") {
          sawBreak = true;
        }
        j += 1;
      }
      out += sawBreak ? " " : text.slice(i, j);
      i = j;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

// --- the full prompt ---------------------------------------------------------

/**
 * Construct the binder system prompt for one binder attempt (item list above).
 *
 * The wording of the fixed intro / envelope / no-invent lines is non-normative;
 * the listed tokens, line-prefixes, and conditional-presence rules are the
 * contract. This rendering follows the illustrative example in the spec.
 */
export function buildBinderSystemPrompt(input: BuildBinderSystemPromptInput): string {
  // Accumulate the prompt line-by-line; each `push` contributes one `\n`-
  // terminated line, except the Session-context block, which owns its own
  // multi-line framing including the terminating blank line.
  let out = "";
  const line = (value: string): void => {
    out += `${value}\n`;
  };

  line("You bind free-form slash-command arguments to typed theta parameters.");
  line("");

  // Item 1 — Theta identity line (exactly one).
  line(`Theta: /${input.name}`);

  // Item 2 — Description line (only when non-empty). "Non-empty" is measured
  // on the collapsed-and-trimmed value, not the raw frontmatter scalar: a
  // value made only of line breaks and horizontal whitespace collapses to "",
  // and item 2's omission clause forbids a `Description:` token with an empty
  // value, so that value must render exactly as an absent field does.
  if (input.description !== undefined) {
    const collapsedDescription = normalisePromptTextLineBreaks(input.description);
    if (collapsedDescription !== "") {
      line(`Description: ${collapsedDescription}`);
    }
  }

  // Item 3 — Argument-hint line. Same collapsed-value emptiness test as item 2,
  // for the same reason (item 3's omission clause).
  if (input.argumentHint !== undefined) {
    const collapsedArgumentHint = normalisePromptTextLineBreaks(input.argumentHint);
    if (collapsedArgumentHint !== "") {
      line(`Argument hint: ${collapsedArgumentHint}`);
    }
  }

  // Item 4 — Parameters block (only when ≥1 field), in declaration order.
  if (input.params.length >= 1) {
    line("");
    line("Parameters:");
    for (const field of input.params) {
      line(renderBinderParamLine(field));
    }
  }

  // Item 5 — User-arguments line (always present). Strip only leading/trailing
  // ASCII slash-argument whitespace; no other normalisation.
  line("");
  line(`User arguments: ${trimSlashArgumentWhitespace(input.rawArguments)}`);

  // Item 6 — Session-context block (only when the input carries a body). The
  // opening line begins with the literal token `Recent session context` and
  // ends with `:`; the body ends with its last turn block's trailing `\n`; the
  // terminating blank line is exactly one further `\n`, so the block ends `\n\n`.
  if (input.sessionContext !== undefined) {
    out += "\n";
    out += "Recent session context (most recent 20 turns / 8000 tokens):\n";
    out += input.sessionContext.transcriptBody;
    out += "\n";
  }

  // Item 7 — Envelope-kinds enumeration (the three `kind` tokens are normative).
  line("");
  line("Return one of three envelopes:");
  line('- { "kind": "ok", "args": { ... } } when every required parameter can be confidently extracted.');
  line('- { "kind": "needs_info", "message": "<one sentence>" } when a required parameter cannot be determined.');
  line('- { "kind": "ambiguous", "message": "<one sentence>", "candidates": [...] | null } when multiple bindings are plausible.');

  // Item 8 — No-invent-defaults instruction (single line: `defaulted` + a
  // directive of `Do not` / `omit` / `skip`).
  line("");
  line("Do not invent values for defaulted parameters that the user did not specify; omit them.");

  return out;
}
