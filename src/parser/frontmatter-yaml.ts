// YAML block extraction, source ranges, field rendering, and block-shape checks
// for the frontmatter field-contract parser.

import {
  normaliseLiteralValueLineBreaks, type Diagnostic,
  type SourceRange,
} from "../diagnostics/diagnostic";
import { isMap, isScalar, isSeq, type LineCounter, type Node, type YAMLError } from "yaml";
import { reservedKeywords } from "../lexer/lexer";

/** The opening / closing frontmatter fence line. */
const FENCE = "---";

/** The extracted frontmatter YAML block and its file-line offset. */
interface FrontmatterBlock {
  /** The YAML text between the fences (fences excluded). */
  readonly yaml: string;
  /**
   * The number to add to a 1-based line within `yaml` to reach the file line:
   * the opening fence occupies file line 1, so YAML line 1 is file line 2.
   */
  readonly lineOffset: number;
}

/**
 * Extract the leading `---`-fenced frontmatter block. Returns `undefined` when
 * the source has no opening fence or the opening fence is never closed — both
 * cases mean "no recognised frontmatter mapping", which downstream resolves to
 * the missing-`mode:` load error.
 */
function extractFrontmatterBlock(source: string): FrontmatterBlock | undefined {
  const lines = source.split("\n");
  if ((lines[0] ?? "").trim() !== FENCE) {
    return undefined;
  }
  for (let i = 1; i < lines.length; i += 1) {
    if ((lines[i] ?? "").trim() === FENCE) {
      return { yaml: lines.slice(1, i).join("\n"), lineOffset: 1 };
    }
  }
  return undefined;
}

/**
 * Map a YAML node's byte range onto a located `SourceRange` in file
 * coordinates. Returns `undefined` when the node carries no range.
 */
function rangeOf(
  node: Node | null | undefined,
  lineCounter: LineCounter,
  lineOffset: number,
): SourceRange | undefined {
  if (node === null || node === undefined || !node.range) {
    return undefined;
  }
  const [startOffset, endOffset] = node.range;
  const start = lineCounter.linePos(startOffset);
  const end = lineCounter.linePos(endOffset);
  return {
    start: { line: start.line + lineOffset, column: start.col },
    end: { line: end.line + lineOffset, column: end.col },
  };
}

/** The count of leading space/tab characters on `line`. */
function indentOf(line: string): number {
  return line.length - line.replace(/^[ \t]+/, "").length;
}

/**
 * The YAML scalar key `line`'s trimmed text spells, when it spells one
 * (bare, or single-/double-quoted) followed by `:`. `undefined` when the
 * trimmed text is not shaped as a mapping-entry key.
 */
function yamlKeyOf(line: string): string | undefined {
  const match = /^([A-Za-z0-9_-]+|'[^']*'|"[^"]*")\s*:/.exec(line.trim());
  if (match === null) {
    return undefined;
  }
  const raw = match[1] as string;
  return raw.startsWith("'") || raw.startsWith('"') ? raw.slice(1, -1) : raw;
}

/**
 * The `params:` field name that encloses `blockLines[targetIdx]`, for bug
 * 0263's `<scope>` clause: the failing line is inside a `params:` block only
 * when a top-level (zero-indent) `params:` line precedes it with nothing but
 * indented (or blank) lines in between, and the failing line itself spells a
 * field key. `undefined` for a top-level failure, or one inside some other
 * block.
 */
function enclosingParamsField(
  blockLines: readonly string[],
  targetIdx: number,
): string | undefined {
  const targetLine = blockLines[targetIdx] ?? "";
  if (targetLine.trim() === "" || indentOf(targetLine) === 0) {
    return undefined;
  }
  for (let i = targetIdx - 1; i >= 0; i -= 1) {
    const line = blockLines[i] ?? "";
    if (line.trim() === "") {
      continue;
    }
    if (indentOf(line) === 0) {
      return line.trim() === "params:" ? yamlKeyOf(targetLine) : undefined;
    }
  }
  return undefined;
}

/**
 * FM-5's report for a frontmatter block the YAML parser rejects (bug 0263):
 * one diagnostic keyed to `doc.errors[0]`, naming the position and the
 * offending source line it carries. Multiple `YAMLParseError`s from the same
 * authoring mistake (bug 0263 §Fix constraint 8) all key to this one — only
 * `firstError` is read. A report is always produced, so the refusal never
 * loses its only error-severity diagnostic: the position field is optional on
 * the error type, and an error carrying none falls back to the block's own
 * first character, which keeps the row's rendering total and lets the
 * required-`mode:` arm key on the rejection itself.
 */
function malformedFrontmatterYamlDiagnostic(
  blockYaml: string,
  firstError: YAMLError,
  lineOffset: number,
  file: string,
): Diagnostic {
  const pos = firstError.linePos?.[0] ?? { line: 1, col: 1 };
  const blockLines = blockYaml.split("\n");
  const targetIdx = pos.line - 1;
  const rawLine = blockLines[targetIdx] ?? "";
  const text = normaliseLiteralValueLineBreaks(rawLine.trim());
  const line = pos.line + lineOffset;
  const column = pos.col;
  const param = enclosingParamsField(blockLines, targetIdx);
  const scope = param === undefined ? "" : ` (in 'params:' field '${param}')`;
  return {
    severity: "error",
    code: "theta/load/malformed-frontmatter-yaml",
    file,
    // End-exclusive per the diagnostic shape: a one-column span at the
    // reported position, the narrowest located extent the parser's verdict
    // supports — the failure is a position, not a token the parser recovered.
    range: { start: { line, column }, end: { line, column: column + 1 } },
    message: `frontmatter block is not valid YAML: parse error at line ${line}, column ${column} near '${text}'${scope}`,
  };
}

/**
 * Recover a `params:` field's non-scalar right-hand side as the author's own
 * bytes. An unquoted inline object type (`p: {a: Triage, b: integer}`) parses
 * as a YAML flow mapping, not a scalar, so its declared type is read off the
 * value node's own `[range[0], range[1])` offsets into `yamlSource` rather
 * than re-serialised through YAML: the type side is theta's grammar, not
 * YAML's, and a round-trip could reorder or requote what the author wrote
 * (bug 0035). The function is total over non-scalar nodes, but the flow
 * mapping is the only non-scalar shape whose recovered bytes are accepted as
 * a declared type: every other shape — a block mapping, a block sequence, a
 * flow sequence, or any unenumerated node kind — is refused in
 * `extractParsedParams` with `theta/load/params-type-not-expression`
 * (`paramValueCanCarryType`, bug 0041), and its bytes serve only the retained
 * field record. A node carrying no range recovers the empty string — there is
 * no declared type to read.
 */
function paramValueSource(value: unknown, yamlSource: string): string {
  const node = value as Node | null | undefined;
  if (node === null || node === undefined || !node.range) {
    return "";
  }
  const [start, end] = node.range;
  return yamlSource.slice(start, end);
}

/**
 * Whether a `params:` field's YAML value node can carry a theta type
 * expression. The type side is theta's grammar, not YAML's: the only
 * non-scalar YAML shape that spells a `Type` is the flow mapping an inline
 * object type (`p: {a: Triage}`) parses as — every other node shape recovers
 * bytes no `Type` production spells. Stated positively (scalar or flow
 * mapping) so an unenumerated node kind is refused
 * (`theta/load/params-type-not-expression`) rather than recovered as bytes
 * and lowered permissively (bug 0041).
 */
function paramValueCanCarryType(value: unknown): boolean {
  return isScalar(value) || (isMap(value) && value.flow === true);
}

/**
 * Render a YAML scalar as the unquoted source text the `<value>` placeholder
 * substitutes (`placeholder-rendering-b.md` category 5): a YAML scalar with no
 * enclosing source quoting renders unquoted regardless of identifier shape.
 */
function renderScalarValue(value: unknown): string {
  return String(value);
}

/**
 * The bounded JSON kind token that stands in for a non-scalar `mode:` value in
 * the `theta/load/unknown-mode-value` `<value>` — a sequence is `array`, a
 * mapping is `object`, mirroring the settings-value-out-of-range `<observed>`
 * precedent (placeholder-rendering-b.md) so a present-but-bad `mode:` names its
 * shape without splicing unbounded source. A value-less explicit key (`? mode`)
 * carries a JS-null value node; the precedent renders null as `null`, so it maps
 * there too — keeping the two null spellings (`? mode` and bare `mode:`) on one
 * token. Any other non-scalar node (a mapping or an alias) is `object`: the
 * field contract pins no distinct token for an alias, and the only observable
 * is that the value is present-but-neither-recognised-mode.
 */
function renderNonScalarModeKind(node: unknown): string {
  if (node === null || node === undefined) return "null";
  if (isSeq(node)) return "array";
  return "object";
}

/**
 * The bounded kind token that stands in for a non-scalar `bind_context:` value
 * in the `theta/load/unknown-bind-context-value` `<value>` (bug 0297) — a
 * sequence is `array`, a mapping is `object`, so a present-but-bad
 * `bind_context:` names its shape without splicing unbounded source, mirroring
 * the mode-arm kind token (placeholder-rendering-b.md). A value-less explicit
 * key carries a JS-null value node and renders `null`, keeping it on the same
 * token as bare `bind_context:`. Any other non-scalar node (a mapping or an
 * alias) is `object`: the field contract pins no distinct token for an alias
 * and the only observable is that the value is present-but-neither-recognised.
 */
function renderNonScalarBindContextKind(node: unknown): string {
  if (node === null || node === undefined) return "null";
  if (isSeq(node)) return "array";
  return "object";
}

/**
 * Extract the `tools:` callable set (FRNT-2/FRNT-3): a plain scalar is the
 * comma-separated short form (frontmatter-fields-b-and-templates.md §YAML-shape:
 * the plain scalar split on commas, each entry trimmed) so `read, grep` becomes
 * two entries interchangeable with the YAML list form; a sequence becomes one
 * entry per item — a scalar item verbatim, a non-scalar item (`- {a: b}`) its
 * own verbatim YAML source slice via `paramValueSource`, so the closed
 * per-entry grammar in callable-set.ts judges it instead of the item being
 * dropped unexamined (bug 0069 §Fix constraint 3). This function is reached
 * only for the two admitted spellings — the caller (the `tools` arm of the
 * frontmatter key walk) routes here iff the value node `isScalar` or `isSeq`
 * and otherwise records a field-level refusal itself
 * (`theta/load/malformed-tools-field`, bug 0104), because the caller holds the
 * YAML node and its range and this function does not: downstream, the two
 * spellings are already collapsed into a plain string array, so a
 * present-but-unusable shape would be indistinguishable from an absent field,
 * and the absent field must keep loading silently.
 *
 * This function's `undefined` return is therefore ambiguous by design and is
 * NOT itself the refusal signal for a zero-entry scalar (bug 0206): the scalar
 * arm and the sequence arm both answer `undefined` for zero entries, but only
 * the scalar's zero-entry outcome is present-but-bad — `tools: []` (the
 * sequence arm's zero-entry input) is the one spelling the spec declares
 * equivalent to an absent field and must keep loading silently. The caller
 * disambiguates by testing which arm it dispatched to, not by testing this
 * return value alone. Entries are split ONLY on commas — the
 * whitespace split that separates an `as` rename (`grep as g`) happens later in
 * the per-entry grammar, so a single scalar entry with an `as` clause stays one
 * entry. Entries are carried verbatim so the H8b resolvers can classify each as
 * a Pi-tool name or a `.theta`-callable path. `yamlSource` is the frontmatter
 * block's raw YAML text, threaded from the `parseFrontmatter` call site, that
 * `paramValueSource` slices a non-scalar item's byte range out of.
 */
function extractToolsList(node: unknown, yamlSource: string): readonly string[] | undefined {
  if (isScalar(node)) {
    const entries = String(node.value)
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return entries.length > 0 ? entries : undefined;
  }
  if (isSeq(node)) {
    const entries: string[] = [];
    for (const item of node.items) {
      // A non-scalar sequence item recovers its own verbatim YAML source
      // instead of being dropped (bug 0069 §Fix constraint 3): the resolver's
      // closed per-entry grammar is the sole arbiter of well-formedness, so
      // the item still reaches a `tools:` diagnostic naming its own text
      // rather than silently narrowing the callable set.
      entries.push(isScalar(item) ? String(item.value) : paramValueSource(item, yamlSource));
    }
    return entries.length > 0 ? entries : undefined;
  }
  return undefined;
}

/**
 * The reserved-keyword spellings a `params:` key can carry (lexical.md
 * §Reserved words), read from the lexer's own set (`reservedKeywords()`,
 * lexer.ts) rather than restated here as a second source of truth — the same
 * reuse `params-lowering.ts`'s `RESERVED_KEYWORDS` makes for its atom classification. A
 * `Set`, not a plain object keyed by author text: a record keyed by arbitrary
 * source spellings needs a null prototype and an own-key guard to be indexed
 * safely by author input, which a `Set.has` call needs neither of. Immutable
 * module-level data, not mutable cross-invocation state, matching
 * `DEFERRED_FRONTMATTER_FIELDS` above.
 */
const RESERVED_KEYWORDS: ReadonlySet<string> = reservedKeywords();

/** The identifier-shape predicate `<key>` / `<observed>` string rendering uses. */
function isIdentifierShaped(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}

/**
 * Render the offending *parsed* scalar for the `<observed>` token on
 * `theta/load/frontmatter-value-out-of-range` (`placeholder-rendering-b.md` §8
 * parsed-scalar carve-out): a `number` (including integer-valued numbers) bare,
 * a `boolean` as `true`/`false`, `null` as the literal `null`, and a `string`
 * by category 5's `<key>` identifier-shape split (bare when identifier-shaped;
 * otherwise — unlike `<key>`'s plain double-quoting — via `JSON.stringify`, so
 * every break, interior `"`/`\`, and other control character renders as its
 * two-character JSON form, keeping `message` single-line
 * (diagnostic-shape.md:34) and matching the settings twin's already-shipped
 * rendering (settings.ts:132-135); a stringly-typed `"25"` still renders
 * `"25"`, distinct from `25`).
 */
function renderObserved(value: unknown): string {
  if (typeof value === "string") {
    return isIdentifierShaped(value) ? value : JSON.stringify(value);
  }
  if (value === null || value === undefined) {
    return "null";
  }
  return String(value);
}

/** Recognised `tool_loop:` sub-keys (FRNT-1). */
const TOOL_LOOP_SUBKEYS: ReadonlySet<string> = new Set(["max_rounds"]);
/** Recognised `respond_repair:` sub-keys (FRNT-1). */
const RESPOND_REPAIR_SUBKEYS: ReadonlySet<string> = new Set(["attempts", "methodology"]);

// The observed non-mapping block node's kind, where a mapping was expected: a scalar
// by its JSON kind, a sequence as array, any other non-scalar (an alias) as object. A
// null-valued scalar never reaches this — it is the equivalent-to-absent spelling.
function renderNonMapBlockKind(node: Node): string {
  if (isSeq(node)) return "array";
  if (isScalar(node)) {
    const v = node.value;
    if (typeof v === "number") return "number";
    if (typeof v === "boolean") return "boolean";
    return "string";
  }
  return "object";
}

// A present `tool_loop:` / `respond_repair:` value that is not a mapping is refused
// (0.332.0, bug 0301 face b): a scalar, a sequence, or an alias where the block contract
// requires a mapping. Absent, a null scalar (bare key / `null` / `~`), and a mapping
// (including the empty `{}`) are the equivalent-to-absent spellings and return
// undefined (silent) — the null scalar is the spec's own name for the absent case.
function checkBlockShape(
  blockNode: Node | null | undefined,
  fieldName: string,
  malformedCode: string,
  file: string,
  lineCounter: LineCounter,
  lineOffset: number,
): Diagnostic | undefined {
  if (blockNode === null || blockNode === undefined) return undefined;
  if (isMap(blockNode)) return undefined;
  if (isScalar(blockNode) && blockNode.value === null) return undefined;
  const range = rangeOf(blockNode, lineCounter, lineOffset);
  return {
    severity: "error",
    code: malformedCode,
    file,
    ...(range !== undefined ? { range } : {}),
    message: `malformed '${fieldName}:' field; expected a mapping, got ${renderNonMapBlockKind(blockNode)}`,
  };
}

// An unrecognised sub-key inside a `tool_loop:` / `respond_repair:` mapping draws the
// EXISTING unknown-frontmatter-field warning with the dotted `<block>.<sub-key>` form
// (0.332.0, bug 0301 face c), keeping the theta registered — the top-level forward-compat
// posture one indentation level down. Only reached for a mapping block.
function unknownSubKeyDiagnostics(
  blockNode: Node | null | undefined,
  dottedPrefix: string,
  recognised: ReadonlySet<string>,
  file: string,
  lineCounter: LineCounter,
  lineOffset: number,
): Diagnostic[] {
  if (!isMap(blockNode)) return [];
  const out: Diagnostic[] = [];
  for (const it of blockNode.items) {
    if (!isScalar(it.key)) continue;
    const sub = String(it.key.value);
    if (recognised.has(sub)) continue;
    const range = rangeOf(it.key, lineCounter, lineOffset);
    out.push({
      severity: "warning",
      code: "theta/load/unknown-frontmatter-field",
      file,
      ...(range !== undefined ? { range } : {}),
      message: `unknown frontmatter field '${dottedPrefix}.${normaliseLiteralValueLineBreaks(sub)}'`,
    });
  }
  return out;
}

/**
 * Resolve a non-negative-integer sub-field of a `tool_loop` / `respond_repair`
 * block (FRNT-1). An absent, `null`, or non-map block — and a block missing the
 * sub-field — takes `defaultValue`. A present sub-field must parse to a
 * non-negative integer (integer-ness judged on the parsed numeric value, so
 * `25` and `25.0` both accept); anything else (a negative integer, a
 * non-integer number, a non-number scalar, or `null`) yields the
 * `theta/load/frontmatter-value-out-of-range` load error and the theta is not
 * registered.
 */
function resolveNonNegIntBlock(
  blockNode: Node | null | undefined,
  subKey: string,
  dottedKey: string,
  defaultValue: number,
  file: string,
  lineCounter: LineCounter,
  lineOffset: number,
): { value: number } | { diagnostic: Diagnostic } {
  if (!isMap(blockNode)) {
    return { value: defaultValue };
  }
  const sub = blockNode.items.find(
    (it) => isScalar(it.key) && String(it.key.value) === subKey,
  );
  if (sub === undefined) {
    return { value: defaultValue };
  }
  const raw = isScalar(sub.value) ? sub.value.value : sub.value;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
    return { value: raw };
  }
  const range = rangeOf((sub.value ?? sub.key) as Node, lineCounter, lineOffset);
  return {
    diagnostic: {
      severity: "error",
      code: "theta/load/frontmatter-value-out-of-range",
      file,
      ...(range !== undefined ? { range } : {}),
      message: `frontmatter field '${dottedKey}' must be a non-negative integer; got ${renderObserved(
        raw,
      )}`,
    },
  };
}

/** The recognised `respond_repair.methodology:` values (frontmatter.md). */
const RECOGNISED_METHODOLOGIES: ReadonlySet<string> = new Set([
  "validator_error",
  "schema_repeat",
  "none",
]);

/**
 * Validate a present `respond_repair.methodology:` sub-field against the
 * recognised set (`validator_error` / `schema_repeat` / `none`). Absent (or a
 * non-map block) takes the default; a present value outside the set (including
 * non-string scalars) is `theta/load/unknown-methodology-value` (E) and the theta
 * is not registered.
 */
function checkMethodology(
  blockNode: Node | null | undefined,
  file: string,
  lineCounter: LineCounter,
  lineOffset: number,
): Diagnostic | undefined {
  if (!isMap(blockNode)) {
    return undefined;
  }
  const sub = blockNode.items.find(
    (it) => isScalar(it.key) && String(it.key.value) === "methodology",
  );
  if (sub === undefined) {
    return undefined;
  }
  const raw = isScalar(sub.value) ? sub.value.value : sub.value;
  const value = raw === null || raw === undefined ? "null" : String(raw);
  if (RECOGNISED_METHODOLOGIES.has(value)) {
    return undefined;
  }
  const range = rangeOf((sub.value ?? sub.key) as Node, lineCounter, lineOffset);
  return {
    severity: "error",
    code: "theta/load/unknown-methodology-value",
    file,
    ...(range !== undefined ? { range } : {}),
    message: `unknown 'respond_repair.methodology:' value '${normaliseLiteralValueLineBreaks(value)}'; expected 'validator_error', 'schema_repeat', or 'none'`,
  };
}

export {
  type FrontmatterBlock,
  extractFrontmatterBlock,
  rangeOf,
  malformedFrontmatterYamlDiagnostic,
  paramValueSource,
  paramValueCanCarryType,
  renderScalarValue,
  renderNonScalarModeKind,
  renderNonScalarBindContextKind,
  extractToolsList,
  RESERVED_KEYWORDS,
  isIdentifierShaped,
  TOOL_LOOP_SUBKEYS,
  RESPOND_REPAIR_SUBKEYS,
  checkBlockShape,
  unknownSubKeyDiagnostics,
  resolveNonNegIntBlock,
  checkMethodology,
};
