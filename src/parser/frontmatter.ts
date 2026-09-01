// V6a / V6a-T — the frontmatter field-contract parser seam.
//
// This module owns the theta-file YAML frontmatter parse described by
// frontmatter.md, frontmatter/frontmatter-fields-a.md, and
// frontmatter/frontmatter-fields-b-and-templates.md: the recognised theta 1.0
// field vocabulary, the field-contract defaults, the required `mode:` field
// (`theta/load/missing-mode` when absent), unknown-key tolerance emitted as the
// `theta/load/unknown-frontmatter-field` warning (the forward-compat seam), the
// per-call `timeout:` rejection (`theta/parse/timeout-field-rejected`, the
// NOCEIL-1 seam), and the present-`model:` load-time resolution that fires
// `theta/load/model-unresolved` through the model-reference-matcher injection
// seam this leaf defines.
//
// V6a-T (tests-task) declares the seam shapes — `parseFrontmatter`, the
// `ModelReferenceMatcher` injection interface, and the result/option records —
// and stubs `parseFrontmatter` as an inert seam so the failing tests compile and
// red on their own primary assertions. The paired V6a implementation leaf fills
// it in.

import {
  normaliseLiteralValueLineBreaks, type Diagnostic,
  type SourceRange,
} from "../diagnostics/diagnostic";
import {
  LineCounter,
  parseDocument,
  isMap,
  isScalar,
  isSeq,
  type Node,
  type YAMLError,
} from "yaml";
import { type LoweredSchema } from "../seams/schema-validator";
import {
  parseParams,
  splitTopLevel,
  type ParamFieldInput,
  type BodyTypeDeclaration,
} from "./params";
import {
  checkSystemInterpolation,
  type SystemParamType,
  type SystemTemplate,
} from "./system-interpolation";
import {
  classifyBinderBypass,
  type BypassParamsField,
} from "../binder/binder-envelope";
import { reservedKeywords } from "../lexer/lexer";

/** A theta 1.0 invocation mode (`frontmatter-fields-a.md` field contract). */
export type ThetaMode = "prompt" | "subagent";

/**
 * The outcome of resolving a present `model:` reference against the available
 * model set, per the [binder-model parse rule]:
 *   - `resolved`  — exactly one available model matches.
 *   - `no-match`  — the reference (including a non-string scalar or a malformed
 *                   / `provider/modelId` reference) matches no available model.
 *   - `ambiguous` — a bare `modelId` matching models under more than one
 *                   provider (resolves to no model — not pick-first).
 */
export type ModelMatchOutcome = "resolved" | "no-match" | "ambiguous";

/**
 * The **model-reference-matcher injection seam** V6a defines: the interface the
 * parser's `model:` resolution hook calls. The concrete matcher (constructed and
 * injected by V9b's production wiring point) binds V11a's shared exact-match
 * resolution contract — theta's own exact-match resolver over
 * `ctx.modelRegistry.getAvailable()` matching a bare `modelId` against each
 * model's `Model<Api>.id` and a `provider/modelId` reference against
 * `Model<Api>.provider` (the short provider-id form, not the api-shaped
 * `Model<Api>.api`) plus `Model<Api>.id` — so this `model:` resolution and
 * V11a's binder-model resolution cannot decide "reference matches no available
 * model" differently. Declared in-leaf so V6a carries no forward `Deps.` edge
 * onto the downstream binder-model machinery.
 */
export interface ModelReferenceMatcher {
  /** Resolve a present, raw `model:` value against the available model set. */
  resolve(reference: unknown): ModelMatchOutcome;
}

/**
 * The parsed `tool_loop` block (FRNT-1). `maxRounds` is a non-negative integer
 * bounding free-phase tool-call rounds; `0` disables model-driven tool calls.
 * Absent / empty (`tool_loop: {}`) blocks default to `{ maxRounds: 25 }`.
 */
export interface ParsedToolLoop {
  /** The non-negative-integer free-phase round cap (FRNT-1). */
  readonly maxRounds: number;
}

/**
 * The parsed `respond_repair` block. `attempts` is a non-negative integer
 * bounding respond-repair follow-up turns. Absent / empty (`respond_repair: {}`)
 * blocks default to `{ attempts: 3 }`.
 */
export interface ParsedRespondRepair {
  /** The non-negative-integer respond-repair follow-up budget. */
  readonly attempts: number;
}

/**
 * The theta's lowered `params:` object schema plus the load-time bypass inputs the
 * binder needs. Present iff the theta declares a `params:` block. `loweredSchema`
 * is the AJV-validatable object document (`V6b`), absent when the block did not
 * lower cleanly (e.g. an unresolved named type); `defaultedFields` names the
 * fields that declared a `= <literal>` default; `fields` is the per-field bypass
 * classification input (`classifyBinderBypass`).
 */
export interface ParsedParams {
  /** The lowered `params:` object schema, when the block lowered cleanly. */
  readonly loweredSchema?: LoweredSchema;
  /** The wire names of fields that declared a default. */
  readonly defaultedFields: readonly string[];
  /** The per-field bypass-classification input, in declaration order. */
  readonly fields: readonly BypassParamsField[];
}

/** The recognised, defaulted frontmatter a successfully-loaded theta exposes. */
export interface ParsedFrontmatter {
  /** The required `mode:` field. */
  readonly mode: ThetaMode;
  /** The present `model:` reference, when one was declared and resolved. */
  readonly model?: string;
  /**
   * The `bind_model:` reference verbatim, when declared. The binder pass over
   * `params:` uses it (chain step 1); absent when no `bind_model:` is declared.
   */
  readonly bindModel?: string;
  /**
   * A present `bind_model:` whose value is a non-scalar YAML node (sequence /
   * mapping / alias): present-but-unresolvable, NOT absent (bug 0297). Threaded
   * into binder-model resolution so the chain does NOT fall back to the
   * `theta.binderModel` setting (the ABSENT-field behaviour) — a non-bypass
   * theta fails `theta/load/binder-model-unresolved`; a bypass-eligible theta
   * keeps its existing silently-ignored disposition. Absent for every scalar or
   * absent `bind_model:`.
   */
  readonly bindModelUnresolvable?: true;
  /**
   * The `bind_echo:` flag (defaulting-system-note-echo.md §"Echo policy";
   * default `true`). Present only when explicitly declared as a boolean; the
   * binder pass suppresses the success echo when this is `false` (the bypass
   * arms auto-suppress independently). Absent → the default-on behaviour.
   */
  readonly bindEcho?: boolean;
  /**
   * The lowered `params:` schema + bypass inputs, present iff the theta declares
   * a `params:` block. Consumed by the binder pass to classify bypass and build
   * the per-theta envelope schema.
   */
  readonly params?: ParsedParams;
  /**
   * The parsed `tool_loop` block (FRNT-1). Populated on every registered theta
   * — the default `{ maxRounds: 25 }` when the block is absent or empty. Owned
   * by the `V6e` implementation leaf; the `V6e-T` seam declares the shape.
   */
  readonly toolLoop?: ParsedToolLoop;
  /**
   * The parsed `respond_repair` block. Populated on every registered theta —
   * the default `{ attempts: 3 }` when the block is absent or empty. Owned by
   * the `V6e` implementation leaf; the `V6e-T` seam declares the shape.
   */
  readonly respondRepair?: ParsedRespondRepair;
  /**
   * The theta's callable set (`tools:` field, FRNT-2/FRNT-3). Each entry is
   * either a Pi-tool name (`grep`) or a `.theta`-callable path
   * (`./sentiment.theta`). Present iff the theta declares a `tools:` field that
   * yields at least one entry: an absent field and `tools: []` both leave this
   * property undefined, and so does a scalar or sequence whose value node the
   * frontmatter layer refused before this result was built (bugs 0104, 0206).
   * Consumed by the `H8b` live tool-call / invoke resolvers to route a
   * `<name>(args)` call to the Pi-tool `execute` dispatch or the `.theta`
   * spawn-and-drive invoke path.
   */
  readonly tools?: readonly string[];
  /**
   * The parsed `system:` template (subagent-mode only). Present iff the theta
   * declares a valid `system:` field (no error-severity interpolation
   * diagnostic). Rendered at conversation-creation time via `renderSystemPrompt`
   * and installed as the spawned subagent session's system prompt (SUBAG-1;
   * subagent.md §"Subagent state-isolation matrix"). Absent → the spawned
   * conversation runs under the model's training defaults.
   */
  readonly system?: SystemTemplate;
  /**
   * The resolved `bind_context:` value (BNDR-10) — `"session"` when the theta
   * declares `bind_context: session` (prompt-mode only; on a subagent-mode theta
   * it is inert and treated as `"none"`), else `"none"`. Drives whether the
   * slash-argument binder receives a *Recent session context* block
   * (binder/binder-model-and-context.md §Binder context). Absent ⇒ `"none"`.
   */
  readonly bindContext?: "none" | "session";
  /**
   * The theta's `description:` frontmatter (frontmatter-fields-a.md) — mirrors
   * Pi's prompt-template spelling. Populates the slash-command autocomplete
   * entry via `pi.registerCommand(name, { description, handler })`. Absent when
   * omitted or empty (the command registers without description text).
   */
  readonly description?: string;
  /**
   * The theta's `argument-hint:` frontmatter (frontmatter-fields-a.md) —
   * binder-grounding-only in theta 1.0: it renders as the binder system
   * prompt's `Argument hint:` line (binder-bypass-and-envelope.md
   * §System-prompt structure item 3). Absent when omitted, empty, or a
   * non-string scalar (the line is then omitted entirely).
   */
  readonly argumentHint?: string;
}

/** The outcome of a frontmatter parse: registration decision + diagnostics. */
export interface FrontmatterParseResult {
  /**
   * Whether the theta is registered. `false` for a load-time error (missing
   * `mode:`, unresolvable `model:`); `true` when the theta loads (including the
   * tolerated unknown-key warning case).
   */
  readonly registered: boolean;
  /** The defaulted frontmatter, present iff `registered` is `true`. */
  readonly frontmatter?: ParsedFrontmatter;
  /**
   * The `params:` fields as written, in declaration order — the located form
   * carrying each field's own `range` and its verbatim `defaultSource`.
   * `ParsedFrontmatter.params.fields` is the binder's bypass-classification
   * projection and carries no range, so a whole-file check that must point at a
   * `params:` line (rather than at the synthesized zero body range) reads this
   * instead. Empty when the source declares no `params:` block.
   */
  readonly paramFields: readonly ParamFieldInput[];
  /** Every diagnostic raised during the parse, in source order. */
  readonly diagnostics: readonly Diagnostic[];
}

/** One body-level `schema` object field, as the whole-file resolution sees it. */
export interface FrontmatterSchemaField {
  readonly name: string;
  readonly typeSource: string;
}

/**
 * The whole-file named-type set the `params:` / `system:` value-validations
 * resolve a `NamedType` against: the body `schema` declarations (carrying their
 * object field sources when present), the body `enum` declarations, and the
 * symbols pulled in by body `import` declarations. Resolution is whole-file, so
 * a frontmatter → body forward reference resolves; supplying only the names is
 * sufficient to decide `theta/parse/unresolved-named-type`, and the schema field
 * sources let the `system:` interpolation surface descend `.Ident` steps.
 */
export interface FrontmatterBodyTypes {
  readonly schemas: ReadonlyMap<string, readonly FrontmatterSchemaField[] | undefined>;
  readonly enums: ReadonlySet<string>;
  readonly imports: ReadonlySet<string>;
  /**
   * The lowered JSON-Schema fragment each body-level named type contributes,
   * keyed by name: a body `schema` lowers to its object body, a body `enum` to
   * `{ type: "string", enum: [<wire values>] }`, and an imported symbol to a
   * permissive `{}` (precise cross-file lowering is out of scope — the name
   * resolves so `theta/parse/unresolved-named-type` does not fire). Supplied so a
   * `params:` field of a `NamedType` produces a present, correct `loweredSchema`
   * rather than being mis-classified as a no-params theta. Absent name → the
   * `NamedType` resolves against no declaration (frontmatter-only parse).
   */
  readonly lowered: ReadonlyMap<string, Record<string, unknown>>;
}

/** Inputs to a frontmatter parse. */
export interface ParseFrontmatterOptions {
  /** The source file path, for located diagnostics. */
  readonly file: string;
  /** The injected model-reference matcher the `model:` hook consults. */
  readonly modelMatcher: ModelReferenceMatcher;
  /**
   * The whole-file named-type set the `params:` named-type resolution and the
   * `system:` interpolation checks resolve against. Absent when the caller has
   * no body AST (a frontmatter-only parse); a `NamedType` param then resolves
   * against no declaration.
   */
  readonly bodyTypes?: FrontmatterBodyTypes;
}

/**
 * The recognised theta 1.0 frontmatter field vocabulary (`frontmatter-fields-a.md`
 * §Field contract). A top-level key outside this set is tolerated and surfaces
 * as the `theta/load/unknown-frontmatter-field` forward-compat warning. `timeout`
 * is deliberately absent: it has a dedicated rejection code (the NOCEIL-1 seam),
 * not the generic unknown-key warning.
 */
const THETA_1_0_FIELDS: ReadonlySet<string> = new Set([
  "description",
  "argument-hint",
  "mode",
  "model",
  "bind_model",
  "bind_context",
  "bind_echo",
  "tools",
  "system",
  "respond_repair",
  "tool_loop",
  "params",
]);

/**
 * Frontmatter field names reserved for deferred theta 1.0 features named in
 * Future Considerations (`frontmatter-fields-a.md` §Field contract; Deferred
 * appendix Cluster 2). A reserved key is not part of the theta 1.0 vocabulary but
 * is distinguished from a genuinely-unknown key: it surfaces as the
 * `theta/load/deferred-frontmatter-field` warning rather than the generic
 * `theta/load/unknown-frontmatter-field`, so an author who set a knob from a
 * newer minor gets a reserved-feature signal. Both spellings of the deferred
 * binder-temperature knob are recognised (the authoritative frontmatter page
 * names it `binder_temperature`; Future Considerations spells it
 * `bind_temperature`). Membership is disjoint from `THETA_1_0_FIELDS`.
 */
const DEFERRED_FRONTMATTER_FIELDS: ReadonlySet<string> = new Set([
  "binder_temperature",
  "bind_temperature",
]);

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
  if (typeof value === "string") {
    return value;
  }
  if (value === null) {
    return "null";
  }
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
 * token. Any other non-scalar node (an alias) falls back to `object`: the field
 * contract pins no token for it, and the only observable is that the value is
 * present-but-neither-recognised-mode.
 */
function renderNonScalarModeKind(node: unknown): string {
  if (node === null || node === undefined) return "null";
  if (isSeq(node)) return "array";
  if (isMap(node)) return "object";
  return "object";
}

/**
 * The bounded kind token that stands in for a non-scalar `bind_context:` value
 * in the `theta/load/unknown-bind-context-value` `<value>` (bug 0297) — a
 * sequence is `array`, a mapping is `object`, so a present-but-bad
 * `bind_context:` names its shape without splicing unbounded source, mirroring
 * the mode-arm kind token (placeholder-rendering-b.md). A value-less explicit
 * key carries a JS-null value node and renders `null`, keeping it on the same
 * token as bare `bind_context:`. Any other non-scalar node (an alias) falls
 * back to `object`: the field contract pins no token for it and the only
 * observable is that the value is present-but-neither-recognised.
 */
function renderNonScalarBindContextKind(node: unknown): string {
  if (node === null || node === undefined) return "null";
  if (isSeq(node)) return "array";
  if (isMap(node)) return "object";
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
 * reuse `params.ts`'s `RESERVED_KEYWORDS` makes for its atom classification. A
 * `Set`, not a plain object keyed by author text: a record keyed by arbitrary
 * source spellings needs a null prototype and an own-key guard to be indexed
 * safely by author input, which a `Set.has` call needs neither of. Immutable
 * module-level data, not mutable cross-invocation state, matching
 * `THETA_1_0_FIELDS` above.
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
  if (blockNode === null || blockNode === undefined || !isMap(blockNode)) return [];
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
      message: `unknown frontmatter field '${dottedPrefix}.${sub}'`,
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
  if (blockNode === null || blockNode === undefined || !isMap(blockNode)) {
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
  if (blockNode === null || blockNode === undefined || !isMap(blockNode)) {
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

/**
 * Map a `params:` field type-expression source to the `SystemParamType` the
 * `system:` interpolation surface consumes. Primitives map to their scalar
 * kinds; `array<T>` terminates as an array; a top-level union / other generic
 * terminates as a compact-object value; a `NamedType` resolving to a body
 * `enum` is an enum, one resolving to an object `schema` carries its typed
 * fields (so `.Ident` steps validate), and any other / unresolved atom
 * terminates as a scalar (so `${param}` is admitted but `${param.field}` is a
 * bad-field). `seen` guards a self-referential schema against unbounded
 * descent.
 */
function toSystemParamType(
  typeSource: string,
  bodyTypes: FrontmatterBodyTypes | undefined,
  seen: ReadonlySet<string>,
): SystemParamType {
  const s = typeSource.trim();
  const lt = s.indexOf("<");
  if (lt > 0 && s.endsWith(">")) {
    const ctor = s.slice(0, lt).trim();
    return ctor === "array" ? { kind: "array" } : { kind: "discriminated-union" };
  }
  if (splitTopLevel(s, "|").length > 1) {
    return { kind: "discriminated-union" };
  }
  switch (s) {
    case "string":
      return { kind: "string" };
    case "integer":
      return { kind: "integer" };
    case "number":
      return { kind: "number" };
    case "boolean":
      return { kind: "boolean" };
    case "null":
      return { kind: "null" };
    default:
      break;
  }
  if (bodyTypes !== undefined) {
    if (bodyTypes.enums.has(s)) {
      return { kind: "enum" };
    }
    if (bodyTypes.schemas.has(s)) {
      const fields = bodyTypes.schemas.get(s);
      if (fields !== undefined && !seen.has(s)) {
        const nextSeen = new Set(seen);
        nextSeen.add(s);
        const map = new Map<string, SystemParamType>();
        for (const field of fields) {
          map.set(field.name, toSystemParamType(field.typeSource, bodyTypes, nextSeen));
        }
        return { kind: "object", fields: map };
      }
      return { kind: "string" };
    }
  }
  return { kind: "string" };
}

/**
 * Split a `params:` field value scalar (`<type-expr>` optionally followed by
 * `= <literal>`) into its type expression and default RHS at the first top-level
 * `=` — one not nested inside `<...>` angle brackets, `{...}` braces, `[...]`
 * brackets, or a `"`/`'` string literal (so `array<string> = []` and
 * `Author = { name: "x" }` split correctly, and an `==`/`>=` inside a default is
 * not mistaken for the separator).
 */
function splitParamValue(raw: string): { typeSource: string; defaultSource?: string } {
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (quote !== undefined) {
      if (c === "\\" && i + 1 < raw.length) {
        i += 1;
      } else if (c === quote) {
        quote = undefined;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "<" || c === "{" || c === "[") {
      depth += 1;
      continue;
    }
    if (c === ">" || c === "}" || c === "]") {
      depth -= 1;
      continue;
    }
    if (depth === 0 && c === "=" && raw[i + 1] !== "=" && raw[i - 1] !== "=") {
      const typeSource = raw.slice(0, i).trim();
      const defaultSource = raw.slice(i + 1).trim();
      return { typeSource, defaultSource };
    }
  }
  return { typeSource: raw.trim() };
}

/** Whether a lowered type expression is a nullable union (a top-level `| null` arm). */
function typeSourceIsNullable(typeSource: string): boolean {
  return typeSource
    .split("|")
    .map((arm) => arm.trim())
    .some((arm) => arm === "null");
}

/**
 * Extract the theta's lowered `params:` schema plus the load-time bypass inputs
 * from the `params:` YAML node. Returns `undefined` when the block is absent,
 * `null`, or not a mapping. The lowered schema is derived through the `V6b`
 * `parseParams` seam, supplied with the whole-file body-level named types
 * (`bodyTypeDecls`) so a `NamedType` param (a body `enum` / `schema`) lowers to
 * a present `loweredSchema` with the resolved `$def` — BIND-1: an empty body-type
 * list here previously left `loweredSchema` absent for a `NamedType` param, which
 * the runtime binder guard then mis-classified as a no-params theta. The raw
 * per-field inputs are returned alongside so `parseFrontmatter` can run the
 * whole-file `params:` diagnostics pass and build the `system:` interpolation
 * param types.
 *
 * Each field's declared type is recovered as the author's own bytes: a scalar
 * RHS reads its parsed value; a non-scalar RHS — an inline object type, a YAML
 * flow mapping — reads the value node's own source range via
 * `paramValueSource` (bug 0035), so that shape reaches `parseParams` instead of
 * being discarded as an empty type. A value node that cannot carry a type
 * expression (`paramValueCanCarryType`) draws the per-field
 * `theta/load/params-type-not-expression` in the returned diagnostics; the
 * field is still recorded so the `system:` interpolation seam and `parseParams`
 * see the same field set and the refusal stays one diagnostic (bug 0041).
 */
function extractParsedParams(
  paramsNode: Node | null | undefined,
  file: string,
  lineCounter: LineCounter,
  lineOffset: number,
  bodyTypeDecls: readonly BodyTypeDeclaration[],
  yamlSource: string,
): {
  params: ParsedParams | undefined;
  fieldInputs: readonly ParamFieldInput[];
  diagnostics: readonly Diagnostic[];
} {
  if (paramsNode === null || paramsNode === undefined || !isMap(paramsNode)) {
    return { params: undefined, fieldInputs: [], diagnostics: [] };
  }
  const fieldInputs: ParamFieldInput[] = [];
  const bypassFields: BypassParamsField[] = [];
  const defaultedFields: string[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const item of paramsNode.items) {
    if (!isScalar(item.key)) {
      continue;
    }
    const name = String(item.key.value);
    const rawValue = isScalar(item.value)
      ? String(item.value.value)
      : paramValueSource(item.value, yamlSource);
    const { typeSource, defaultSource } = splitParamValue(rawValue);
    const range =
      rangeOf((item.value ?? item.key) as Node, lineCounter, lineOffset) ??
      { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } };
    // lexical.md §Identifiers requires lowercase-first for a schema field
    // name, and code-registry-parse.md's binding-case-mismatch row already
    // names the field-name position in its Trigger. A `params:` key is that
    // position twice over: it lowers to an object schema's property
    // (schemas.md), and frontmatter-fields-a.md's "exposed as typed variables
    // in the theta body" makes it a body binding as well, so the rule applies
    // on either reading. `range` above is the VALUE node's, not the key's, so
    // a diagnostic naming the key needs a range of its own; on an unranged key
    // node it falls back to `range`, the same `??` fallback `range` itself
    // already uses. The predicate is `checkName`'s own two-comparison form
    // (lexer.ts). Its two exclusions hold the guard to the Trigger's
    // "Identifier in a … field-name position": a key spelling no theta
    // identifier (a quoted phrase), and a reserved keyword. Two arms split the
    // position between two rules, in the order every other enforcement site
    // uses — `checkName` returns from its keyword arm before its first-letter
    // test, and `parseFn`'s parameter arm tests the keyword kind ahead of the
    // case arm. The keyword arm below claims a reserved spelling under
    // lexical.md §Reserved words / code-registry-parse.md:21; the `ident`-
    // shaped arm after it judges the first letter's case under lexical.md
    // §Identifiers / code-registry-parse.md:19. The two subjects are disjoint,
    // so neither arm can reach the other's input.
    if (RESERVED_KEYWORDS.has(name)) {
      // lexical.md:20 reserves 32 spellings from identifier position with no
      // scope list, and code-registry-parse.md:21's Trigger names no
      // position either: a `params:` key is an identifier position twice
      // over (schemas.md's field-identifier reading, and
      // frontmatter-fields-a.md:57's "exposed as typed variables in the
      // theta body"), and it is the face that reaches furthest — the
      // spelling becomes a JSON Schema property key and a `wireName` the
      // binder and the provider receive (row L1). This key is a YAML scalar,
      // not a token, so the predicate is membership in the shipped
      // `RESERVED_KEYWORDS` set rather than a `kind` test, and the range
      // comes from the key node itself, the same fallback-to-`range` shape
      // the case arm below uses for the same key. Emitted under the
      // registered `theta/parse/*` code and not a `theta/load/` twin: DIAG-2
      // closes the registry, the `load` namespace carries no
      // reserved-keyword row, and the code names the RULE rather than the
      // module. The keyword arm runs first — mirroring `parseFn`'s
      // parameter-name check (`theta-document.ts`, `keyword` ahead of
      // `ident`) — though the case arm's own `!RESERVED_KEYWORDS.has` guard
      // already keeps the two subjects disjoint.
      diagnostics.push({
        severity: "error",
        code: "theta/parse/reserved-keyword-as-identifier",
        file,
        range: rangeOf(item.key as Node, lineCounter, lineOffset) ?? range,
        message: `reserved keyword '${name}' cannot be used as an identifier`,
      });
    } else if (isIdentifierShaped(name)) {
      const first = name[0] ?? "";
      const isUpper = first >= "A" && first <= "Z";
      if (isUpper) {
        diagnostics.push({
          severity: "error",
          code: "theta/parse/binding-case-mismatch",
          file,
          range: rangeOf(item.key as Node, lineCounter, lineOffset) ?? range,
          message: "binding name must start with a lowercase letter or _",
        });
      }
    }
    // A value node outside `paramValueCanCarryType`'s set declares no type
    // expression: the only non-scalar YAML shape that spells a `Type` is the
    // flow mapping an inline object type parses as, and every other node
    // shape recovers bytes no `Type` production spells. One registered error
    // per offending field; the field is still recorded below so no second
    // diagnostic cascades at the `system:` interpolation seam (bug 0041).
    // `shapeRefused` rides along with the retained field so `parseParams`
    // (bug 0059 §Fix constraint 1) can tell a node already refused HERE from
    // one whose recovered TEXT it must judge itself, and skip its own
    // refusal — the ordering comment on the `paramsShapeDiags` push in
    // `parseFrontmatter`, below, states why: a field whose RHS spells no type
    // expression is reported as such, not by whatever the lowering makes of
    // its recovered bytes.
    const shapeRefused = !paramValueCanCarryType(item.value);
    if (shapeRefused) {
      diagnostics.push({
        severity: "error",
        code: "theta/load/params-type-not-expression",
        file,
        range,
        message: `'params:' field '${name}' right-hand side is not a theta type expression`,
      });
    }
    fieldInputs.push({
      name,
      typeSource,
      ...(defaultSource !== undefined ? { defaultSource } : {}),
      range,
      ...(shapeRefused ? { shapeRefused: true } : {}),
    });
    bypassFields.push({
      wireName: name,
      type: typeSource,
      hasDefault: defaultSource !== undefined,
      // Retained for the binder system prompt's `default=<literal>` requirement
      // token (V11d Parameters block) — the bypass classification ignores it.
      ...(defaultSource !== undefined ? { defaultSource } : {}),
      nullable: typeSourceIsNullable(typeSource),
    });
    if (defaultSource !== undefined) {
      defaultedFields.push(name);
    }
  }
  const lowered = parseParams(fieldInputs, bodyTypeDecls, { file });
  return {
    params: {
      ...(lowered.loweredSchema !== undefined ? { loweredSchema: lowered.loweredSchema } : {}),
      defaultedFields,
      fields: bypassFields,
    },
    fieldInputs,
    diagnostics,
  };
}

/**
 * Parse a theta file's YAML frontmatter against the theta 1.0 field contract
 * (`frontmatter.md`, `frontmatter/frontmatter-fields-a.md`):
 *
 *   - the required `mode:` field — `theta/load/missing-mode` (E) when absent, and
 *     the theta is not registered;
 *   - unknown top-level keys, and unrecognised sub-keys inside a `tool_loop:` /
 *     `respond_repair:` block (rendered with the dotted `<block>.<sub-key>` form) —
 *     `theta/load/unknown-frontmatter-field` (W), one per key, tolerated (the theta
 *     still registers);
 *   - the per-call `timeout:` field — `theta/parse/timeout-field-rejected` (E),
 *     the NOCEIL-1 seam;
 *   - a present `model:` value resolved at load time through the injected
 *     model-reference matcher — `theta/load/model-unresolved` (E) on no-match /
 *     ambiguity, and the theta is not registered.
 *
 * The theta registers iff no error-severity diagnostic was raised.
 */
export function parseFrontmatter(
  source: string,
  options: ParseFrontmatterOptions,
): FrontmatterParseResult {
  const { file, modelMatcher } = options;
  const diagnostics: Diagnostic[] = [];

  const block = extractFrontmatterBlock(source);
  const lineCounter = new LineCounter();
  const doc =
    block === undefined
      ? undefined
      : parseDocument(block.yaml, { lineCounter });
  // FM-5: refuse a partially-recovered YAML parse. The `yaml` lib recovers from
  // malformed input (e.g. `x: : :`) and exposes the damage in `doc.errors`;
  // consuming its partial `contents` as if well-formed would register a theta
  // built from frontmatter the parser itself rejected. Discard the recovered
  // `contents` so `map` stays undefined and no recognised field is read off a
  // partial parse; `doc.errors[0]` carries the position and offending text
  // the diagnostic below is built from (bug 0263), so the report names the
  // parser's own verdict rather than falling through to the "no recognised
  // frontmatter mapping" surface `theta/load/missing-mode` covers.
  const yamlErrored = doc !== undefined && doc.errors.length > 0;
  const map =
    doc !== undefined && !yamlErrored && isMap(doc.contents)
      ? doc.contents
      : undefined;
  const lineOffset = block?.lineOffset ?? 0;
  if (yamlErrored) {
    // `yamlErrored` is true only for a non-empty error list, so the first
    // element is present; the report is total, which is what lets the
    // required-`mode:` arm below key on the rejection alone.
    const firstError = doc?.errors[0];
    if (firstError !== undefined) {
      diagnostics.push(
        malformedFrontmatterYamlDiagnostic(
          block?.yaml ?? "",
          firstError,
          lineOffset,
          file,
        ),
      );
    }
  }

  // The recognised fields the contract pins behaviour for.
  let modeValue: string | undefined;
  let modeRange: SourceRange | undefined;
  let modePresent = false;
  let modeValueKind: string | undefined;
  let modelPresent = false;
  let modelRaw: unknown;
  let modelRange: SourceRange | undefined;
  let bindContextValue: string | undefined;
  let bindContextRange: SourceRange | undefined;
  let bindContextPresent = false;
  let bindContextValueKind: string | undefined;
  let descriptionValue: string | undefined;
  let bindModelValue: string | undefined;
  let bindModelUnresolvable = false;
  let bindEchoValue: boolean | undefined;
  let bindEchoRange: SourceRange | undefined;
  let bindEchoPresent = false;
  let bindEchoScalar: string | undefined;
  let bindEchoValueKind: string | undefined;
  let bindEchoValueRange: SourceRange | undefined;
  let argumentHintPresent = false;
  let argumentHintRange: SourceRange | undefined;
  let argumentHintValue: string | undefined;
  let toolLoopNode: Node | null | undefined;
  let respondRepairNode: Node | null | undefined;
  let paramsNode: Node | null | undefined;
  let paramsPresent = false;
  let paramsRange: SourceRange | undefined;
  let systemPresent = false;
  let systemValue: string | undefined;
  let systemRange: SourceRange | undefined;
  let toolsValue: readonly string[] | undefined;
  let toolsMalformedRange: SourceRange | undefined;

  if (map !== undefined) {
    for (const item of map.items) {
      if (!isScalar(item.key)) {
        // Non-scalar keys are outside the theta 1.0 contract; skip — there is no
        // field-contract behaviour pinned for them.
        continue;
      }
      const key = String(item.key.value);
      const keyRange = rangeOf(item.key, lineCounter, lineOffset);
      const rawValue = isScalar(item.value) ? item.value.value : item.value;
      const valueRange = rangeOf(
        (item.value ?? item.key) as Node,
        lineCounter,
        lineOffset,
      );

      if (key === "mode") {
        // A present non-scalar `mode:` value is present-but-bad, not absent:
        // record presence so the required-mode arm keys on genuine absence, and
        // the value's bounded kind token so the unknown-mode-value arm can name
        // the shape. `modeValueKind` is set for exactly the non-scalar present
        // case (where `modeValue` stays undefined).
        modePresent = true;
        if (isScalar(item.value)) {
          modeValue = String(item.value.value);
        } else {
          modeValueKind = renderNonScalarModeKind(item.value);
        }
        modeRange = valueRange;
        continue;
      }
      if (key === "model") {
        modelPresent = true;
        modelRaw = rawValue;
        modelRange = valueRange;
        continue;
      }
      if (key === "bind_model") {
        // A present non-scalar `bind_model:` is present-but-unresolvable, not
        // absent: it must NOT fall back to the `theta.binderModel` settings the
        // spec reserves for an ABSENT field (frontmatter-fields-a.md). Record an
        // unresolvable marker (no fabricated string) so binder-model resolution
        // routes it through the existing `theta/load/binder-model-unresolved`
        // machinery exactly as an unresolvable declared string (bug 0297).
        if (isScalar(item.value)) {
          bindModelValue = String(item.value.value);
        } else {
          bindModelUnresolvable = true;
        }
        continue;
      }
      if (key === "description") {
        // frontmatter-fields-a.md: `description` mirrors Pi's prompt-template
        // spelling and populates the slash-command autocomplete entry (passed to
        // `pi.registerCommand(name, { description, handler })`). Retained here so
        // the composition can thread it onto the `ThetaFixture`.
        //
        // A null scalar (bare key / `null` / `~`) is the spec's own name for
        // "no description" (frontmatter-fields-a.md:37) — excluded here so it
        // maps to absent instead of the fabricated text "null" (bug 0299).
        descriptionValue =
          isScalar(item.value) && item.value.value !== null
            ? String(item.value.value)
            : undefined;
        continue;
      }
      if (key === "argument-hint") {
        // frontmatter-fields-a.md: `argument-hint` is binder-grounding-only in
        // theta 1.0 (Pi has no `argumentHint` slot for extension commands) —
        // that grounding is the binder system prompt's `Argument hint:` line
        // (binder-bypass-and-envelope.md §System-prompt structure item 3), so
        // the scalar VALUE is retained alongside the presence + range the
        // advisory `theta/load/argument-hint-not-displayed` reads (fired when
        // no `description:` accompanies it — an empty autocomplete entry).
        argumentHintPresent = true;
        argumentHintRange = keyRange;
        argumentHintValue =
          isScalar(item.value) && typeof item.value.value === "string"
            ? item.value.value
            : undefined;
        continue;
      }
      if (key === "bind_echo") {
        // §"Echo policy": `bind_echo:` (`true` | `false`; default `true`) is a closed-set
        // field. A present value outside the two booleans is present-but-bad, not absent,
        // and draws theta/load/unknown-bind-echo-value (0.332.0) — mirroring the bind_context:
        // recognised-key/unrecognised-value split. No truth-coercion: a string "false"
        // refuses rather than reading as the boolean false. The key range feeds the bypass
        // advisories; the value range ranges the refusal.
        bindEchoPresent = true;
        if (typeof rawValue === "boolean") {
          bindEchoValue = rawValue;
        } else if (isScalar(item.value)) {
          bindEchoScalar = String(item.value.value);
        } else {
          bindEchoValueKind = renderNonScalarBindContextKind(item.value);
        }
        bindEchoRange = keyRange;
        bindEchoValueRange = valueRange;
        continue;
      }
      if (key === "params") {
        paramsNode = item.value;
        paramsPresent = true;
        paramsRange = valueRange ?? keyRange;
        continue;
      }
      if (key === "bind_context") {
        // A present non-scalar `bind_context:` value is present-but-bad, not
        // absent: record presence so the unknown-value arm keys on presence, and
        // the value's bounded kind token so it can name the shape (bug 0297,
        // mirroring the `mode:` arm). `bindContextValueKind` is set for exactly
        // the non-scalar present case (where `bindContextValue` stays undefined).
        bindContextPresent = true;
        if (isScalar(item.value)) {
          bindContextValue = String(item.value.value);
        } else {
          bindContextValueKind = renderNonScalarBindContextKind(item.value);
        }
        bindContextRange = valueRange;
        continue;
      }
      if (key === "tools") {
        // FRNT-2/FRNT-3 callable set: a scalar (`tools: grep`) or a sequence
        // (`tools:\n  - ./sentiment.theta`) of Pi-tool names / `.theta`-callable
        // paths. Surfaced verbatim; the H8b resolvers classify each entry. A
        // value that is neither spelling (a mapping, an alias, or no value node
        // at all) is refused at this layer, where the YAML node and its range
        // are still in hand (bug 0104) — the same reachability argument that
        // put `params: null` here rather than in the resolver.
        //
        // The scalar arm is checked separately from the sequence arm (rather
        // than testing `extractToolsList`'s return value once) because a
        // zero-entry SCALAR (a quoted or block spelling whose comma split
        // yields no entry, e.g. `tools: ""`) is present-but-bad and must be
        // refused under this same code (bug 0206), while a zero-entry SEQUENCE
        // (`tools: []`) collapses to the identical `undefined` return and MUST
        // stay silent — it is the one spelling the spec declares equivalent to
        // an absent field. Keying on the return value alone cannot tell the two
        // apart; keying on the arm can, because the arm already knows which
        // spelling produced it. The refusal is ranged on the value node,
        // falling back to the key for a pair that carries no value node at
        // all, which is the range convention every other frontmatter-shape
        // refusal here follows.
        if (isScalar(item.value)) {
          toolsValue = extractToolsList(item.value, block?.yaml ?? "");
          if (toolsValue === undefined) {
            toolsMalformedRange = valueRange ?? keyRange;
          }
        } else if (isSeq(item.value)) {
          toolsValue = extractToolsList(item.value, block?.yaml ?? "");
        } else {
          toolsMalformedRange = valueRange ?? keyRange;
        }
        continue;
      }
      if (key === "system") {
        // Captured for the subagent-mode-only rule + the `${…}` interpolation
        // checks, run once the whole-file named-type set is known.
        systemPresent = true;
        if (!isScalar(item.value)) {
          systemValue = undefined;
        } else if (item.value.value === null) {
          // A value-less `system:` (bare key / `null` / `~`) carries no prompt: map
          // it to the empty template so it renders byte-identically to `system: ""`
          // (a zero-part template) instead of the fabricated text "null" — the null
          // VALUE is the spec's own name for the absent case (bug 0299). It maps to
          // `""`, not `undefined`: `undefined` is the sentinel the malformed-field
          // check below keys on to raise `theta/load/malformed-system-field`, a code
          // reserved for a present NON-scalar `system:` — a null scalar IS a scalar,
          // so refusing it here would misclassify an absent value as malformed.
          systemValue = "";
        } else {
          systemValue = String(item.value.value);
        }
        systemRange = valueRange ?? keyRange;
        continue;
      }
      if (key === "tool_loop") {
        toolLoopNode = item.value;
        continue;
      }
      if (key === "respond_repair") {
        respondRepairNode = item.value;
        continue;
      }
      if (key === "timeout") {
        // NOCEIL-1 seam: per-call timeouts are rejected in theta 1.0.
        diagnostics.push({
          severity: "error",
          code: "theta/parse/timeout-field-rejected",
          file,
          ...(keyRange !== undefined ? { range: keyRange } : {}),
          message: "'timeout:' field is not supported in theta 1.0",
        });
        continue;
      }
      if (DEFERRED_FRONTMATTER_FIELDS.has(key)) {
        // Reserved-for-a-deferred-feature seam: a key reserved for a deferred
        // theta 1.0 feature warns with the dedicated code (not the generic
        // unknown-key code) and is tolerated; the theta still registers.
        diagnostics.push({
          severity: "warning",
          code: "theta/load/deferred-frontmatter-field",
          file,
          ...(keyRange !== undefined ? { range: keyRange } : {}),
          message: `frontmatter field '${key}' is reserved for a deferred theta 1.0 feature`,
        });
      } else if (!THETA_1_0_FIELDS.has(key)) {
        // Forward-compat seam: an unrecognised key warns once and is tolerated.
        diagnostics.push({
          severity: "warning",
          code: "theta/load/unknown-frontmatter-field",
          file,
          ...(keyRange !== undefined ? { range: keyRange } : {}),
          message: `unknown frontmatter field '${key}'`,
        });
      }
    }
  }

  // Required `mode:`. A block the YAML parser rejected already drew
  // `theta/load/malformed-frontmatter-yaml` above and never reached the field
  // loop, so a key never seen there is a statement about the discard, not the
  // source (bug 0263 §Fix constraint 1) — gate this arm to a block that parsed
  // and genuinely omits `mode:`. `modePresent` (set at the mode arm for both
  // scalar and non-scalar values) is the presence signal, not `modeValue`: a
  // present non-scalar value leaves `modeValue` undefined too, and that case is
  // present-but-bad, routed to `unknown-mode-value` below, not missing (bug 0296).
  if (!modePresent && !yamlErrored) {
    diagnostics.push({
      severity: "error",
      code: "theta/load/missing-mode",
      file,
      message: "frontmatter is missing required field 'mode:'",
    });
  }

  // `bind_context: session` on a `mode: subagent` theta is inert: subagent-mode
  // thetas invoked from a slash command have no caller-session context to
  // attach, so declaring it warns (not errors) and the theta still registers.
  if (bindContextValue === "session" && modeValue === "subagent") {
    diagnostics.push({
      severity: "warning",
      code: "theta/parse/bind-context-session-on-subagent",
      file,
      ...(bindContextRange !== undefined ? { range: bindContextRange } : {}),
      message: "'bind_context: session' has no effect on a mode: subagent theta",
    });
  }

  // `argument-hint:` declared without a (non-empty) `description:` renders an
  // empty autocomplete entry, since Pi's extension-registered commands have no
  // `argumentHint` slot and only `description` reaches the dropdown. Advisory
  // only; the theta still registers.
  if (
    argumentHintPresent &&
    (descriptionValue === undefined || descriptionValue === "")
  ) {
    diagnostics.push({
      severity: "warning",
      code: "theta/load/argument-hint-not-displayed",
      file,
      ...(argumentHintRange !== undefined ? { range: argumentHintRange } : {}),
      message:
        "'argument-hint:' declared without 'description:'; Pi's autocomplete entry will be empty",
    });
  }

  // Present `model:` — resolved through the injected matcher seam.
  let resolvedModel: string | undefined;
  if (modelPresent) {
    const outcome = modelMatcher.resolve(modelRaw);
    if (outcome === "resolved") {
      resolvedModel = renderScalarValue(modelRaw);
    } else {
      diagnostics.push({
        severity: "error",
        code: "theta/load/model-unresolved",
        file,
        ...(modelRange !== undefined ? { range: modelRange } : {}),
        message: `theta 'model:' value '${normaliseLiteralValueLineBreaks(
          renderScalarValue(modelRaw),
        )}' resolves to no available model, or is ambiguous across providers`,
      });
    }
  }

  // FRNT-1: parse + range-validate the `tool_loop` / `respond_repair` blocks,
  // defaulting to `{ maxRounds: 25 }` / `{ attempts: 3 }` when absent or empty.
  const toolLoopResult = resolveNonNegIntBlock(
    toolLoopNode,
    "max_rounds",
    "tool_loop.max_rounds",
    25,
    file,
    lineCounter,
    lineOffset,
  );
  const respondRepairResult = resolveNonNegIntBlock(
    respondRepairNode,
    "attempts",
    "respond_repair.attempts",
    3,
    file,
    lineCounter,
    lineOffset,
  );
  if ("diagnostic" in toolLoopResult) {
    diagnostics.push(toolLoopResult.diagnostic);
  }
  if ("diagnostic" in respondRepairResult) {
    diagnostics.push(respondRepairResult.diagnostic);
  }
  const toolLoopMalformed = checkBlockShape(toolLoopNode, "tool_loop", "theta/load/malformed-tool-loop-field", file, lineCounter, lineOffset);
  if (toolLoopMalformed !== undefined) diagnostics.push(toolLoopMalformed);
  diagnostics.push(...unknownSubKeyDiagnostics(toolLoopNode, "tool_loop", TOOL_LOOP_SUBKEYS, file, lineCounter, lineOffset));
  const respondRepairMalformed = checkBlockShape(respondRepairNode, "respond_repair", "theta/load/malformed-respond-repair-field", file, lineCounter, lineOffset);
  if (respondRepairMalformed !== undefined) diagnostics.push(respondRepairMalformed);
  diagnostics.push(...unknownSubKeyDiagnostics(respondRepairNode, "respond_repair", RESPOND_REPAIR_SUBKEYS, file, lineCounter, lineOffset));

  // A present-but-unrecognised `mode:` is the separate unknown-mode-value error
  // (distinct from missing-mode, which fired above only when `mode:` is absent);
  // "missing" and "present-but-bad" do not collapse into one code.
  if (
    modePresent &&
    modeValue !== "prompt" &&
    modeValue !== "subagent"
  ) {
    // A scalar renders its recovered bytes verbatim (line-break-normalised); a
    // non-scalar renders the kind token recorded at the mode arm. `modeValueKind`
    // is defined whenever `modeValue` is undefined on this branch (the mode arm's
    // invariant), so the cast names that invariant rather than widening the type.
    const renderedModeValue =
      modeValue !== undefined
        ? normaliseLiteralValueLineBreaks(modeValue)
        : (modeValueKind as string);
    diagnostics.push({
      severity: "error",
      code: "theta/load/unknown-mode-value",
      file,
      ...(modeRange !== undefined ? { range: modeRange } : {}),
      message: `unknown 'mode:' value '${renderedModeValue}'; expected 'prompt' or 'subagent'`,
    });
  }

  // A present `bind_context:` value other than `none` / `session` (incl.
  // non-string scalars) is the unknown-bind-context-value load error.
  if (
    bindContextPresent &&
    bindContextValue !== "none" &&
    bindContextValue !== "session"
  ) {
    // A scalar renders its recovered bytes verbatim (line-break-normalised); a
    // non-scalar renders the kind token recorded at the bind_context arm.
    // `bindContextValueKind` is defined whenever `bindContextValue` is undefined
    // on this branch (the bind_context arm's invariant), so the cast names that
    // invariant rather than widening the type (bug 0297).
    const renderedBindContextValue =
      bindContextValue !== undefined
        ? normaliseLiteralValueLineBreaks(bindContextValue)
        : (bindContextValueKind as string);
    diagnostics.push({
      severity: "error",
      code: "theta/load/unknown-bind-context-value",
      file,
      ...(bindContextRange !== undefined ? { range: bindContextRange } : {}),
      message: `unknown 'bind_context:' value '${renderedBindContextValue}'; expected 'none' or 'session'`,
    });
  }

  // A present `bind_echo:` value that is neither boolean is the unknown-bind-echo-value
  // load error (0.332.0) — a scalar renders String(value) line-break-normalised, a
  // non-scalar renders the kind token recorded at the bind_echo arm.
  if (bindEchoPresent && bindEchoValue === undefined) {
    const renderedBindEchoValue =
      bindEchoScalar !== undefined
        ? normaliseLiteralValueLineBreaks(bindEchoScalar)
        : (bindEchoValueKind as string);
    diagnostics.push({
      severity: "error",
      code: "theta/load/unknown-bind-echo-value",
      file,
      ...(bindEchoValueRange !== undefined ? { range: bindEchoValueRange } : {}),
      message: `unknown 'bind_echo:' value '${renderedBindEchoValue}'; expected true or false`,
    });
  }

  // The redundant `params: null` is rejected — omit `params:` or use `params: {}`
  // (both of which are equivalent no-params forms).
  const paramsIsNull =
    paramsPresent &&
    (paramsNode === null ||
      paramsNode === undefined ||
      (isScalar(paramsNode) && paramsNode.value === null));
  if (paramsIsNull) {
    diagnostics.push({
      severity: "error",
      code: "theta/load/params-null",
      file,
      ...(paramsRange !== undefined ? { range: paramsRange } : {}),
      message:
        "'params: null' is not permitted; omit 'params:' or use 'params: {}'",
    });
  }

  // A `tools:` value that is neither of the two admitted spellings (a plain
  // scalar or a sequence) is refused outright rather than treated as absent
  // (bug 0104), and so is an admitted SCALAR whose comma split yields zero
  // entries (bug 0206, e.g. `tools: ""`): both would otherwise collapse onto
  // the same silent empty callable set as the genuinely absent field, and the
  // theta's declared callable set is the only door for both the model-driven
  // and code-driven call paths, so an author who mis-shapes or empties the
  // field gets no signal at all. `tools: []` is excluded by construction — its
  // zero-entry outcome comes from the sequence arm, which never sets this
  // range — so the one spelling the spec declares equivalent to absent stays
  // silent.
  if (toolsMalformedRange !== undefined) {
    diagnostics.push({
      severity: "error",
      code: "theta/load/malformed-tools-field",
      file,
      range: toolsMalformedRange,
      message:
        "malformed 'tools:' field; expected a comma-separated list of entries or a YAML sequence",
    });
  }

  // `respond_repair.methodology:` outside the recognised set.
  const methodologyDiag = checkMethodology(
    respondRepairNode,
    file,
    lineCounter,
    lineOffset,
  );
  if (methodologyDiag !== undefined) {
    diagnostics.push(methodologyDiag);
  }

  // The whole-file body-level named types the `params:` RHS resolves against.
  // Each carries its lowered JSON-Schema fragment (a body `enum` / `schema`
  // lowers concretely; an import lowers permissively) so a `NamedType` param
  // produces a present `loweredSchema` (BIND-1). The SAME decl list feeds the
  // runtime lowering (`extractParsedParams`) and the diagnostics pass below, so
  // the two agree on resolution.
  const bodyTypeDecls: BodyTypeDeclaration[] = [];
  if (options.bodyTypes !== undefined) {
    for (const [name, lowered] of options.bodyTypes.lowered) {
      bodyTypeDecls.push({ name, lowered });
    }
  }

  // `params:` lowering + bypass classification (the binder's runtime schema).
  const {
    params,
    fieldInputs,
    diagnostics: paramsShapeDiags,
  } = extractParsedParams(
    paramsNode,
    file,
    lineCounter,
    lineOffset,
    bodyTypeDecls,
    block?.yaml ?? "",
  );
  // The per-field shape refusals land before the `parseParams` diagnostics:
  // a field whose RHS spells no type expression is reported as such, not by
  // whatever the lowering makes of its recovered bytes.
  diagnostics.push(...paramsShapeDiags);

  // Whole-file `params:` named-type / ordering / default-literal diagnostics.
  // The named-type resolution is whole-file, so the body `schema`/`enum` decls
  // and imported symbols supplied via `options.bodyTypes` resolve a forward
  // `NamedType` reference; only a genuinely-undeclared type fires
  // `theta/parse/unresolved-named-type`.
  if (fieldInputs.length > 0) {
    diagnostics.push(
      ...parseParams(fieldInputs, bodyTypeDecls, { file }).diagnostics,
    );
  }

  // An explicit `bind_echo: true` has no effect on either binder-bypass shape:
  // the bypass skips the binder call entirely, so no success echo is produced.
  // The two shapes own distinct codes: the single-string bypass is the
  // parse-phase `theta/parse/bind-echo-on-bypass`; the no-params bypass is the
  // load-phase `theta/load/bind-echo-without-params`. A defaulted (absent)
  // `bind_echo` never fires either; only an explicit `true` does.
  if (bindEchoValue === true) {
    const bypass = classifyBinderBypass(params?.fields);
    if (bypass.kind === "single-string-bypass") {
      diagnostics.push({
        severity: "warning",
        code: "theta/parse/bind-echo-on-bypass",
        file,
        ...(bindEchoRange !== undefined ? { range: bindEchoRange } : {}),
        message:
          "'bind_echo: true' has no effect on a single-string-bypass theta",
      });
    } else if (bypass.kind === "no-params-bypass") {
      diagnostics.push({
        severity: "warning",
        code: "theta/load/bind-echo-without-params",
        file,
        ...(bindEchoRange !== undefined ? { range: bindEchoRange } : {}),
        message: "'bind_echo: true' has no effect on a no-params theta",
      });
    }
  }

  // `system:` subagent-mode-only rule + `${…}` interpolation checks, run against
  // the theta's typed `params` (`system:` on a `mode: prompt` theta is rejected).
  //
  // Keyed on `systemPresent`, not on `systemValue !== undefined` (bug 0298):
  // a present non-scalar `system:` (block sequence/mapping) still needs to
  // draw a diagnostic, either the shape refusal below or, on a `mode: prompt`
  // theta, `theta/parse/system-on-prompt-mode` — that code's registered
  // trigger is presence of the key, not readability of its value, so a
  // non-scalar value must still reach `checkSystemInterpolation`. Only a
  // present-AND-non-scalar `system:` on a non-prompt theta has no rule left to
  // apply it to: it is refused directly under the bug 0104 `tools:`-row shape
  // rather than being fed a fabricated value.
  let systemTemplate: SystemTemplate | undefined;
  if (systemPresent) {
    if (modeValue !== "prompt" && systemValue === undefined) {
      diagnostics.push({
        severity: "error",
        code: "theta/load/malformed-system-field",
        file,
        ...(systemRange !== undefined ? { range: systemRange } : {}),
        message:
          "malformed 'system:' field; expected a scalar system prompt",
      });
    } else {
      const systemParams = new Map<string, SystemParamType>();
      for (const fieldInput of fieldInputs) {
        systemParams.set(
          fieldInput.name,
          toSystemParamType(fieldInput.typeSource, options.bodyTypes, new Set()),
        );
      }
      // `systemValue ?? ""`: on the `mode: prompt` branch
      // `checkSystemInterpolation` returns the prompt-mode refusal before it
      // reads `systemValue`'s content, so the `""` fill is never inspected; on
      // the subagent-scalar branch `systemValue` is always defined here, so
      // the fallback is a no-op and this arm stays byte-identical to before.
      const systemResult = checkSystemInterpolation({
        systemValue: systemValue ?? "",
        mode: modeValue === "prompt" ? "prompt" : "subagent",
        params: systemParams,
        file,
        ...(systemRange !== undefined ? { range: systemRange } : {}),
      });
      diagnostics.push(...systemResult.diagnostics);
      // The template is present only on a valid subagent `system:` (no
      // error-severity interpolation diagnostic); retain it so the runtime spawn
      // can render and install it (SUBAG-1).
      systemTemplate = systemResult.template;
    }
  }

  const registered = !diagnostics.some((d) => d.severity === "error");
  if (!registered) {
    return { registered: false, paramFields: fieldInputs, diagnostics };
  }

  // `modeValue` is defined here: a missing `mode:` is an error, which would have
  // set `registered` to `false` above. An out-of-range `tool_loop` /
  // `respond_repair` value also unsets `registered`, so both results carry a
  // `value` here.
  const toolLoop: ParsedToolLoop = {
    maxRounds: "value" in toolLoopResult ? toolLoopResult.value : 25,
  };
  const respondRepair: ParsedRespondRepair = {
    attempts: "value" in respondRepairResult ? respondRepairResult.value : 3,
  };
  const frontmatter: ParsedFrontmatter = {
    mode: modeValue as ThetaMode,
    ...(resolvedModel !== undefined ? { model: resolvedModel } : {}),
    ...(bindModelValue !== undefined ? { bindModel: bindModelValue } : {}),
    ...(bindModelUnresolvable ? { bindModelUnresolvable: true as const } : {}),
    ...(bindEchoValue !== undefined ? { bindEcho: bindEchoValue } : {}),
    ...(params !== undefined ? { params } : {}),
    toolLoop,
    respondRepair,
    ...(toolsValue !== undefined ? { tools: toolsValue } : {}),
    ...(systemTemplate !== undefined ? { system: systemTemplate } : {}),
    // BNDR-10: retain `bind_context: session` so the binder can source the
    // Recent session context block. A subagent-mode `session` is inert (a
    // warning was emitted above) and is normalised to `none`.
    ...(bindContextValue === "session" && modeValue === "prompt"
      ? { bindContext: "session" as const }
      : {}),
    // frontmatter-fields-a.md: a non-empty `description` populates the
    // slash-command autocomplete entry.
    ...(descriptionValue !== undefined && descriptionValue !== ""
      ? { description: descriptionValue }
      : {}),
    // A non-empty `argument-hint:` grounds the binder system prompt's
    // `Argument hint:` line (its only theta 1.0 consumer).
    ...(argumentHintValue !== undefined && argumentHintValue !== ""
      ? { argumentHint: argumentHintValue }
      : {}),
  };
  return { registered: true, frontmatter, paramFields: fieldInputs, diagnostics };
}
