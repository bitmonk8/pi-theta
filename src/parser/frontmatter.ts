// V6a / V6a-T — the frontmatter field-contract parser seam.
//
// This module owns the loom-file YAML frontmatter parse described by
// frontmatter.md, frontmatter/frontmatter-fields-a.md, and
// frontmatter/frontmatter-fields-b-and-templates.md: the recognised loom 1.0
// field vocabulary, the field-contract defaults, the required `mode:` field
// (`loom/load/missing-mode` when absent), unknown-key tolerance emitted as the
// `loom/load/unknown-frontmatter-field` warning (the forward-compat seam), the
// per-call `timeout:` rejection (`loom/parse/timeout-field-rejected`, the
// NOCEIL-1 seam), and the present-`model:` load-time resolution that fires
// `loom/load/model-unresolved` through the model-reference-matcher injection
// seam this leaf defines.
//
// V6a-T (tests-task) declares the seam shapes — `parseFrontmatter`, the
// `ModelReferenceMatcher` injection interface, and the result/option records —
// and stubs `parseFrontmatter` as an inert seam so the failing tests compile and
// red on their own primary assertions. The paired V6a implementation leaf fills
// it in.

import {
  type Diagnostic,
  type SourceRange,
} from "../diagnostics/diagnostic";
import { LineCounter, parseDocument, isMap, isScalar, isSeq, type Node } from "yaml";
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
import { type BypassParamsField } from "../binder/binder-envelope";

/** A loom 1.0 invocation mode (`frontmatter-fields-a.md` field contract). */
export type LoomMode = "prompt" | "subagent";

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
 * resolution contract — loom's own exact-match resolver over
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
 * The loom's lowered `params:` object schema plus the load-time bypass inputs the
 * binder needs. Present iff the loom declares a `params:` block. `loweredSchema`
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

/** The recognised, defaulted frontmatter a successfully-loaded loom exposes. */
export interface ParsedFrontmatter {
  /** The required `mode:` field. */
  readonly mode: LoomMode;
  /** The present `model:` reference, when one was declared and resolved. */
  readonly model?: string;
  /**
   * The `bind_model:` reference verbatim, when declared. The binder pass over
   * `params:` uses it (chain step 1); absent when no `bind_model:` is declared.
   */
  readonly bindModel?: string;
  /**
   * The `bind_echo:` flag (defaulting-system-note-echo.md §"Echo policy";
   * default `true`). Present only when explicitly declared as a boolean; the
   * binder pass suppresses the success echo when this is `false` (the bypass
   * arms auto-suppress independently). Absent → the default-on behaviour.
   */
  readonly bindEcho?: boolean;
  /**
   * The lowered `params:` schema + bypass inputs, present iff the loom declares
   * a `params:` block. Consumed by the binder pass to classify bypass and build
   * the per-loom envelope schema.
   */
  readonly params?: ParsedParams;
  /**
   * The parsed `tool_loop` block (FRNT-1). Populated on every registered loom
   * — the default `{ maxRounds: 25 }` when the block is absent or empty. Owned
   * by the `V6e` implementation leaf; the `V6e-T` seam declares the shape.
   */
  readonly toolLoop?: ParsedToolLoop;
  /**
   * The parsed `respond_repair` block. Populated on every registered loom —
   * the default `{ attempts: 3 }` when the block is absent or empty. Owned by
   * the `V6e` implementation leaf; the `V6e-T` seam declares the shape.
   */
  readonly respondRepair?: ParsedRespondRepair;
  /**
   * The loom's callable set (`tools:` field, FRNT-2/FRNT-3). Each entry is
   * either a Pi-tool name (`grep`) or a `.loom`-callable path
   * (`./sentiment.loom`). Present iff the loom declares a non-empty `tools:`
   * field. Consumed by the `H8b` live tool-call / invoke resolvers to route a
   * `<name>(args)` call to the Pi-tool `execute` dispatch or the `.loom`
   * spawn-and-drive invoke path.
   */
  readonly tools?: readonly string[];
  /**
   * The parsed `system:` template (subagent-mode only). Present iff the loom
   * declares a valid `system:` field (no error-severity interpolation
   * diagnostic). Rendered at conversation-creation time via `renderSystemPrompt`
   * and installed as the spawned subagent session's system prompt (SUBAG-1;
   * subagent.md §"Subagent state-isolation matrix"). Absent → the spawned
   * conversation runs under the model's training defaults.
   */
  readonly system?: SystemTemplate;
}

/** The outcome of a frontmatter parse: registration decision + diagnostics. */
export interface FrontmatterParseResult {
  /**
   * Whether the loom is registered. `false` for a load-time error (missing
   * `mode:`, unresolvable `model:`); `true` when the loom loads (including the
   * tolerated unknown-key warning case).
   */
  readonly registered: boolean;
  /** The defaulted frontmatter, present iff `registered` is `true`. */
  readonly frontmatter?: ParsedFrontmatter;
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
 * sufficient to decide `loom/parse/unresolved-named-type`, and the schema field
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
   * resolves so `loom/parse/unresolved-named-type` does not fire). Supplied so a
   * `params:` field of a `NamedType` produces a present, correct `loweredSchema`
   * rather than being mis-classified as a no-params loom. Absent name → the
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
 * The recognised loom 1.0 frontmatter field vocabulary (`frontmatter-fields-a.md`
 * §Field contract). A top-level key outside this set is tolerated and surfaces
 * as the `loom/load/unknown-frontmatter-field` forward-compat warning. `timeout`
 * is deliberately absent: it has a dedicated rejection code (the NOCEIL-1 seam),
 * not the generic unknown-key warning.
 */
const LOOM_1_0_FIELDS: ReadonlySet<string> = new Set([
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
 * Extract the `tools:` callable set (FRNT-2/FRNT-3): a plain scalar is the
 * comma-separated short form (frontmatter-fields-b-and-templates.md §YAML-shape:
 * the plain scalar split on commas, each entry trimmed) so `read, grep` becomes
 * two entries interchangeable with the YAML list form; a sequence becomes the
 * list of its scalar entries; any other shape (empty / non-scalar) yields
 * `undefined` (no callable set). Entries are split ONLY on commas — the
 * whitespace split that separates an `as` rename (`grep as g`) happens later in
 * the per-entry grammar, so a single scalar entry with an `as` clause stays one
 * entry. Entries are carried verbatim so the H8b resolvers can classify each as
 * a Pi-tool name or a `.loom`-callable path.
 */
function extractToolsList(node: unknown): readonly string[] | undefined {
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
      if (isScalar(item)) {
        entries.push(String(item.value));
      }
    }
    return entries.length > 0 ? entries : undefined;
  }
  return undefined;
}

/** The identifier-shape predicate `<key>` / `<observed>` string rendering uses. */
function isIdentifierShaped(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}

/**
 * Render the offending *parsed* scalar for the `<observed>` token on
 * `loom/load/frontmatter-value-out-of-range` (`placeholder-rendering-b.md` §8
 * parsed-scalar carve-out): a `number` (including integer-valued numbers) bare,
 * a `boolean` as `true`/`false`, `null` as the literal `null`, and a `string`
 * per category 5's `<key>` rule (bare when identifier-shaped, double-quoted
 * otherwise — so a stringly-typed `"25"` renders `"25"`, distinct from `25`).
 */
function renderObserved(value: unknown): string {
  if (typeof value === "string") {
    return isIdentifierShaped(value) ? value : `"${value}"`;
  }
  if (value === null || value === undefined) {
    return "null";
  }
  return String(value);
}

/**
 * Resolve a non-negative-integer sub-field of a `tool_loop` / `respond_repair`
 * block (FRNT-1). An absent, `null`, or non-map block — and a block missing the
 * sub-field — takes `defaultValue`. A present sub-field must parse to a
 * non-negative integer (integer-ness judged on the parsed numeric value, so
 * `25` and `25.0` both accept); anything else (a negative integer, a
 * non-integer number, a non-number scalar, or `null`) yields the
 * `loom/load/frontmatter-value-out-of-range` load error and the loom is not
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
      code: "loom/load/frontmatter-value-out-of-range",
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
 * non-string scalars) is `loom/load/unknown-methodology-value` (E) and the loom
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
    code: "loom/load/unknown-methodology-value",
    file,
    ...(range !== undefined ? { range } : {}),
    message: `unknown 'respond_repair.methodology:' value '${value}'; expected 'validator_error', 'schema_repeat', or 'none'`,
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
 * Extract the loom's lowered `params:` schema plus the load-time bypass inputs
 * from the `params:` YAML node. Returns `undefined` when the block is absent,
 * `null`, or not a mapping. The lowered schema is derived through the `V6b`
 * `parseParams` seam, supplied with the whole-file body-level named types
 * (`bodyTypeDecls`) so a `NamedType` param (a body `enum` / `schema`) lowers to
 * a present `loweredSchema` with the resolved `$def` — BIND-1: an empty body-type
 * list here previously left `loweredSchema` absent for a `NamedType` param, which
 * the runtime binder guard then mis-classified as a no-params loom. The raw
 * per-field inputs are returned alongside so `parseFrontmatter` can run the
 * whole-file `params:` diagnostics pass and build the `system:` interpolation
 * param types.
 */
function extractParsedParams(
  paramsNode: Node | null | undefined,
  file: string,
  lineCounter: LineCounter,
  lineOffset: number,
  bodyTypeDecls: readonly BodyTypeDeclaration[],
): { params: ParsedParams | undefined; fieldInputs: readonly ParamFieldInput[] } {
  if (paramsNode === null || paramsNode === undefined || !isMap(paramsNode)) {
    return { params: undefined, fieldInputs: [] };
  }
  const fieldInputs: ParamFieldInput[] = [];
  const bypassFields: BypassParamsField[] = [];
  const defaultedFields: string[] = [];
  for (const item of paramsNode.items) {
    if (!isScalar(item.key)) {
      continue;
    }
    const name = String(item.key.value);
    const rawValue = isScalar(item.value) ? String(item.value.value) : "";
    const { typeSource, defaultSource } = splitParamValue(rawValue);
    const range =
      rangeOf((item.value ?? item.key) as Node, lineCounter, lineOffset) ??
      { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } };
    fieldInputs.push({
      name,
      typeSource,
      ...(defaultSource !== undefined ? { defaultSource } : {}),
      range,
    });
    bypassFields.push({
      wireName: name,
      type: typeSource,
      hasDefault: defaultSource !== undefined,
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
  };
}

/**
 * Parse a loom file's YAML frontmatter against the loom 1.0 field contract
 * (`frontmatter.md`, `frontmatter/frontmatter-fields-a.md`):
 *
 *   - the required `mode:` field — `loom/load/missing-mode` (E) when absent, and
 *     the loom is not registered;
 *   - unknown top-level keys — `loom/load/unknown-frontmatter-field` (W), one per
 *     key, tolerated (the loom still registers);
 *   - the per-call `timeout:` field — `loom/parse/timeout-field-rejected` (E),
 *     the NOCEIL-1 seam;
 *   - a present `model:` value resolved at load time through the injected
 *     model-reference matcher — `loom/load/model-unresolved` (E) on no-match /
 *     ambiguity, and the loom is not registered.
 *
 * The loom registers iff no error-severity diagnostic was raised.
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
  // consuming its partial `contents` as if well-formed would register a loom
  // built from frontmatter the parser itself rejected. The closed diagnostics
  // registry (docs/reference/diagnostics.md) has NO dedicated malformed-YAML
  // code, so a YAML parse failure degrades to the documented "no recognised
  // frontmatter mapping" surface: discard the recovered `contents` so `map`
  // becomes undefined and `loom/load/missing-mode` fires (the same surface
  // `extractFrontmatterBlock` resolves an unusable frontmatter block to).
  const yamlErrored = doc !== undefined && doc.errors.length > 0;
  const map =
    doc !== undefined && !yamlErrored && isMap(doc.contents)
      ? doc.contents
      : undefined;
  const lineOffset = block?.lineOffset ?? 0;

  // The recognised fields the contract pins behaviour for.
  let modeValue: string | undefined;
  let modeRange: SourceRange | undefined;
  let modelPresent = false;
  let modelRaw: unknown;
  let modelRange: SourceRange | undefined;
  let bindContextValue: string | undefined;
  let bindContextRange: SourceRange | undefined;
  let bindModelValue: string | undefined;
  let bindEchoValue: boolean | undefined;
  let toolLoopNode: Node | null | undefined;
  let respondRepairNode: Node | null | undefined;
  let paramsNode: Node | null | undefined;
  let paramsPresent = false;
  let paramsRange: SourceRange | undefined;
  let systemPresent = false;
  let systemValue: string | undefined;
  let systemRange: SourceRange | undefined;
  let toolsValue: readonly string[] | undefined;

  if (map !== undefined) {
    for (const item of map.items) {
      if (!isScalar(item.key)) {
        // Non-scalar keys are outside the loom 1.0 contract; skip — there is no
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
        modeValue = isScalar(item.value)
          ? String(item.value.value)
          : undefined;
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
        bindModelValue = isScalar(item.value)
          ? String(item.value.value)
          : undefined;
        continue;
      }
      if (key === "bind_echo") {
        // §"Echo policy": `bind_echo:` (`true` | `false`; default `true`). Only a
        // boolean scalar is captured; a non-boolean value leaves the default-on
        // behaviour (the dedicated no-params / bypass warnings are out of scope).
        bindEchoValue = typeof rawValue === "boolean" ? rawValue : undefined;
        continue;
      }
      if (key === "params") {
        paramsNode = item.value;
        paramsPresent = true;
        paramsRange = valueRange ?? keyRange;
        continue;
      }
      if (key === "bind_context") {
        bindContextValue = isScalar(item.value)
          ? String(item.value.value)
          : undefined;
        bindContextRange = valueRange;
        continue;
      }
      if (key === "tools") {
        // FRNT-2/FRNT-3 callable set: a scalar (`tools: grep`) or a sequence
        // (`tools:\n  - ./sentiment.loom`) of Pi-tool names / `.loom`-callable
        // paths. Surfaced verbatim; the H8b resolvers classify each entry.
        toolsValue = extractToolsList(item.value);
        continue;
      }
      if (key === "system") {
        // Captured for the subagent-mode-only rule + the `${…}` interpolation
        // checks, run once the whole-file named-type set is known.
        systemPresent = true;
        systemValue = isScalar(item.value) ? String(item.value.value) : undefined;
        systemRange = valueRange;
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
        // NOCEIL-1 seam: per-call timeouts are rejected in loom 1.0.
        diagnostics.push({
          severity: "error",
          code: "loom/parse/timeout-field-rejected",
          file,
          ...(keyRange !== undefined ? { range: keyRange } : {}),
          message: "'timeout:' field is not supported in loom 1.0",
        });
        continue;
      }
      if (!LOOM_1_0_FIELDS.has(key)) {
        // Forward-compat seam: an unrecognised key warns once and is tolerated.
        diagnostics.push({
          severity: "warning",
          code: "loom/load/unknown-frontmatter-field",
          file,
          ...(keyRange !== undefined ? { range: keyRange } : {}),
          message: `unknown frontmatter field '${key}'`,
        });
      }
    }
  }

  // Required `mode:`.
  if (modeValue === undefined) {
    diagnostics.push({
      severity: "error",
      code: "loom/load/missing-mode",
      file,
      message: "frontmatter is missing required field 'mode:'",
    });
  }

  // `bind_context: session` on a `mode: subagent` loom is inert: subagent-mode
  // looms invoked from a slash command have no caller-session context to
  // attach, so declaring it warns (not errors) and the loom still registers.
  if (bindContextValue === "session" && modeValue === "subagent") {
    diagnostics.push({
      severity: "warning",
      code: "loom/parse/bind-context-session-on-subagent",
      file,
      ...(bindContextRange !== undefined ? { range: bindContextRange } : {}),
      message: "'bind_context: session' has no effect on a mode: subagent loom",
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
        code: "loom/load/model-unresolved",
        file,
        ...(modelRange !== undefined ? { range: modelRange } : {}),
        message: `loom 'model:' value '${renderScalarValue(
          modelRaw,
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

  // A present-but-unrecognised `mode:` is the separate unknown-mode-value error
  // (distinct from missing-mode, which fired above only when `mode:` is absent);
  // "missing" and "present-but-bad" do not collapse into one code.
  if (
    modeValue !== undefined &&
    modeValue !== "prompt" &&
    modeValue !== "subagent"
  ) {
    diagnostics.push({
      severity: "error",
      code: "loom/load/unknown-mode-value",
      file,
      ...(modeRange !== undefined ? { range: modeRange } : {}),
      message: `unknown 'mode:' value '${modeValue}'; expected 'prompt' or 'subagent'`,
    });
  }

  // A present `bind_context:` value other than `none` / `session` (incl.
  // non-string scalars) is the unknown-bind-context-value load error.
  if (
    bindContextValue !== undefined &&
    bindContextValue !== "none" &&
    bindContextValue !== "session"
  ) {
    diagnostics.push({
      severity: "error",
      code: "loom/load/unknown-bind-context-value",
      file,
      ...(bindContextRange !== undefined ? { range: bindContextRange } : {}),
      message: `unknown 'bind_context:' value '${bindContextValue}'; expected 'none' or 'session'`,
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
      code: "loom/load/params-null",
      file,
      ...(paramsRange !== undefined ? { range: paramsRange } : {}),
      message:
        "'params: null' is not permitted; omit 'params:' or use 'params: {}'",
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
  const { params, fieldInputs } = extractParsedParams(
    paramsNode,
    file,
    lineCounter,
    lineOffset,
    bodyTypeDecls,
  );

  // Whole-file `params:` named-type / ordering / default-literal diagnostics.
  // The named-type resolution is whole-file, so the body `schema`/`enum` decls
  // and imported symbols supplied via `options.bodyTypes` resolve a forward
  // `NamedType` reference; only a genuinely-undeclared type fires
  // `loom/parse/unresolved-named-type`.
  if (fieldInputs.length > 0) {
    diagnostics.push(
      ...parseParams(fieldInputs, bodyTypeDecls, { file }).diagnostics,
    );
  }

  // `system:` subagent-mode-only rule + `${…}` interpolation checks, run against
  // the loom's typed `params` (`system:` on a `mode: prompt` loom is rejected).
  let systemTemplate: SystemTemplate | undefined;
  if (systemPresent && systemValue !== undefined) {
    const systemParams = new Map<string, SystemParamType>();
    for (const fieldInput of fieldInputs) {
      systemParams.set(
        fieldInput.name,
        toSystemParamType(fieldInput.typeSource, options.bodyTypes, new Set()),
      );
    }
    const systemResult = checkSystemInterpolation({
      systemValue,
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

  const registered = !diagnostics.some((d) => d.severity === "error");
  if (!registered) {
    return { registered: false, diagnostics };
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
    mode: modeValue as LoomMode,
    ...(resolvedModel !== undefined ? { model: resolvedModel } : {}),
    ...(bindModelValue !== undefined ? { bindModel: bindModelValue } : {}),
    ...(bindEchoValue !== undefined ? { bindEcho: bindEchoValue } : {}),
    ...(params !== undefined ? { params } : {}),
    toolLoop,
    respondRepair,
    ...(toolsValue !== undefined ? { tools: toolsValue } : {}),
    ...(systemTemplate !== undefined ? { system: systemTemplate } : {}),
  };
  return { registered: true, frontmatter, diagnostics };
}
