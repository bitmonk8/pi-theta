// V6a / V6a-T — the frontmatter field-contract parser seam.
//
// This module orchestrates the theta-file YAML frontmatter parse described by
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
// V6a-T (tests-task) declared the seam shapes — `parseFrontmatter`, the
// `ModelReferenceMatcher` injection interface, and the result/option records —
// and stubbed `parseFrontmatter`; V6a (this leaf) implements the whole field
// contract above.

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
  type YAMLMap,
} from "yaml";
import { type LoweredSchema } from "../seams/schema-validator";
import {
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
import { toSystemParamType } from "./system-param-types";
import { extractParsedParams } from "./frontmatter-params";
import {
  type FrontmatterBlock,
  extractFrontmatterBlock,
  rangeOf,
  malformedFrontmatterYamlDiagnostic,
  renderScalarValue,
  renderNonScalarModeKind,
  renderNonScalarBindContextKind,
  extractToolsList,
  TOOL_LOOP_SUBKEYS,
  RESPOND_REPAIR_SUBKEYS,
  checkBlockShape,
  unknownSubKeyDiagnostics,
  resolveNonNegIntBlock,
  checkMethodology,
} from "./frontmatter-yaml";

export { toSystemParamType } from "./system-param-types";
export { extractParsedParams } from "./frontmatter-params";
export * from "./frontmatter-yaml";

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
   * The `system:` value's located range, present iff `system` is present
   * (bug 0422 route (a)): the load-phase template-revalidation consumer
   * (`import-static-checks.ts`) needs a range to site its own diagnostic on
   * when a walked-off imported field is found post-load, and `SystemTemplate`
   * itself carries no range of its own (it is built once, at parse, from a
   * `systemValue` string with no positional trailer). Carrying it here —
   * rather than re-deriving it — keeps the load-phase diagnostic Located
   * (file + range) per diagnostic-shape.md's located-site classification.
   */
  readonly systemRange?: SourceRange;
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
  /**
   * The explicit `as "Wire"` rename, when present (schemas.md §Wire-name
   * renaming). Needed so `toSystemParamType` can build the outbound
   * wire-name-translation sidecars for a body-schema `system:` render
   * (bug 0407) — without it, the `system:` surface would have no way to know
   * a field's wire spelling differs from its theta-side name.
   */
  readonly wireName?: string;
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
   * The alias/union right-hand side arms captured on `SchemaDecl.arms`
   * (theta-document.ts), keyed by schema name — present iff the decl is the
   * `schema X = A | B` alias/union form (bug 0427 §Fix). Empty for a schema
   * with an object body (its shape is already on `schemas`) and for a
   * genuinely head-only decl (unreachable in a registering doc). Lets
   * `toSystemParamType`'s `fields === undefined` arm dispatch on what the
   * alias actually names instead of falling to the permissive `string`
   * terminal.
   */
  readonly aliasArms: ReadonlyMap<string, readonly string[]>;
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
 * Frontmatter field names reserved for deferred theta 1.0 features named in
 * Future Considerations (`frontmatter-fields-a.md` §Field contract; Deferred
 * appendix Cluster 2). A reserved key is not part of the theta 1.0 vocabulary but
 * is distinguished from a genuinely-unknown key: it surfaces as the
 * `theta/load/deferred-frontmatter-field` warning rather than the generic
 * `theta/load/unknown-frontmatter-field`, so an author who set a knob from a
 * newer minor gets a reserved-feature signal. Both spellings of the deferred
 * binder-temperature knob are recognised (the authoritative frontmatter page
 * names it `binder_temperature`; Future Considerations spells it
 * `bind_temperature`). Membership is disjoint from the recognised theta 1.0
 * field vocabulary (`frontmatter-fields-a.md` §Field contract), each member
 * of which `parseFrontmatter`'s field loop claims with its own per-key arm.
 */
const DEFERRED_FRONTMATTER_FIELDS: ReadonlySet<string> = new Set([
  "binder_temperature",
  "bind_temperature",
]);

/** Values, presence flags, and source ranges collected from recognised YAML fields. */
interface RecognisedFields {
  readonly modeValue: string | undefined;
  readonly modeRange: SourceRange | undefined;
  readonly modePresent: boolean;
  readonly modeValueKind: string | undefined;
  readonly modelPresent: boolean;
  readonly modelRaw: unknown;
  readonly modelRange: SourceRange | undefined;
  readonly bindContextValue: string | undefined;
  readonly bindContextRange: SourceRange | undefined;
  readonly bindContextPresent: boolean;
  readonly bindContextValueKind: string | undefined;
  readonly descriptionValue: string | undefined;
  readonly bindModelValue: string | undefined;
  readonly bindModelUnresolvable: boolean;
  readonly bindEchoValue: boolean | undefined;
  readonly bindEchoRange: SourceRange | undefined;
  readonly bindEchoPresent: boolean;
  readonly bindEchoScalar: string | undefined;
  readonly bindEchoValueKind: string | undefined;
  readonly bindEchoValueRange: SourceRange | undefined;
  readonly argumentHintPresent: boolean;
  readonly argumentHintRange: SourceRange | undefined;
  readonly argumentHintValue: string | undefined;
  readonly toolLoopNode: Node | null | undefined;
  readonly respondRepairNode: Node | null | undefined;
  readonly paramsNode: Node | null | undefined;
  readonly paramsPresent: boolean;
  readonly paramsRange: SourceRange | undefined;
  readonly systemPresent: boolean;
  readonly systemValue: string | undefined;
  readonly systemRange: SourceRange | undefined;
  readonly toolsValue: readonly string[] | undefined;
  readonly toolsMalformedRange: SourceRange | undefined;
}

/** Collect recognised fields and emit per-key diagnostics in YAML source order. */
function collectRecognisedFields(
  map: YAMLMap<unknown, Node | null> | undefined,
  lineCounter: LineCounter,
  lineOffset: number,
  file: string,
  diagnostics: Diagnostic[],
  block: FrontmatterBlock | undefined,
): RecognisedFields {
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
      } else {
        // Forward-compat seam: a key no arm above recognised (the theta 1.0
        // vocabulary, `frontmatter-fields-a.md` §Field contract) warns once and
        // is tolerated.
        diagnostics.push({
          severity: "warning",
          code: "theta/load/unknown-frontmatter-field",
          file,
          ...(keyRange !== undefined ? { range: keyRange } : {}),
          message: `unknown frontmatter field '${normaliseLiteralValueLineBreaks(key)}'`,
        });
      }
    }
  }
  return {
    modeValue,
    modeRange,
    modePresent,
    modeValueKind,
    modelPresent,
    modelRaw,
    modelRange,
    bindContextValue,
    bindContextRange,
    bindContextPresent,
    bindContextValueKind,
    descriptionValue,
    bindModelValue,
    bindModelUnresolvable,
    bindEchoValue,
    bindEchoRange,
    bindEchoPresent,
    bindEchoScalar,
    bindEchoValueKind,
    bindEchoValueRange,
    argumentHintPresent,
    argumentHintRange,
    argumentHintValue,
    toolLoopNode,
    respondRepairNode,
    paramsNode,
    paramsPresent,
    paramsRange,
    systemPresent,
    systemValue,
    systemRange,
    toolsValue,
    toolsMalformedRange,
  };
}

/** Check cross-field contracts and resolve model and block defaults in diagnostic order. */
function checkRecognisedFields(
  fields: RecognisedFields,
  yamlErrored: boolean,
  file: string,
  modelMatcher: ModelReferenceMatcher,
  lineCounter: LineCounter,
  lineOffset: number,
  diagnostics: Diagnostic[],
): {
  resolvedModel: string | undefined;
  toolLoopResult: ReturnType<typeof resolveNonNegIntBlock>;
  respondRepairResult: ReturnType<typeof resolveNonNegIntBlock>;
} {
  const {
    modeValue,
    modeRange,
    modePresent,
    modeValueKind,
    modelPresent,
    modelRaw,
    modelRange,
    bindContextValue,
    bindContextRange,
    bindContextPresent,
    bindContextValueKind,
    descriptionValue,
    bindEchoValue,
    bindEchoPresent,
    bindEchoScalar,
    bindEchoValueKind,
    bindEchoValueRange,
    argumentHintPresent,
    argumentHintRange,
    toolLoopNode,
    respondRepairNode,
    paramsNode,
    paramsPresent,
    paramsRange,
    toolsMalformedRange,
  } = fields;
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
  return { resolvedModel, toolLoopResult, respondRepairResult };
}

/** Validate the system field and build its template against the lowered params field set. */
function buildSystemTemplate(
  fields: RecognisedFields,
  fieldInputs: readonly ParamFieldInput[],
  options: ParseFrontmatterOptions,
  file: string,
  diagnostics: Diagnostic[],
): SystemTemplate | undefined {
  const { systemPresent, systemValue, systemRange, modeValue } = fields;
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
          toSystemParamType(fieldInput.typeSource, options.bodyTypes, new Map()),
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
  return systemTemplate;
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
 *
 * `source` is either a whole fenced document (the fences are stripped here via
 * `extractFrontmatterBlock`) or an already-extracted `FrontmatterBlock` — the
 * shape `splitFrontmatter` produces — so a caller that has already separated
 * the fences feeds the block (with its real file-line offset) directly instead
 * of re-synthesising fences for a second strip.
 */
export function parseFrontmatter(
  source: string | FrontmatterBlock,
  options: ParseFrontmatterOptions,
): FrontmatterParseResult {
  const { file, modelMatcher } = options;
  const diagnostics: Diagnostic[] = [];

  const block = typeof source === "string" ? extractFrontmatterBlock(source) : source;
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

  const fields = collectRecognisedFields(map, lineCounter, lineOffset, file, diagnostics, block);
  const {
    modeValue,
    bindContextValue,
    descriptionValue,
    bindModelValue,
    bindModelUnresolvable,
    bindEchoValue,
    bindEchoRange,
    argumentHintValue,
    paramsNode,
    systemRange,
    toolsValue,
  } = fields;
  const { resolvedModel, toolLoopResult, respondRepairResult } = checkRecognisedFields(
    fields, yamlErrored, file, modelMatcher, lineCounter, lineOffset, diagnostics,
  );

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
    loweringDiagnostics: paramsLoweringDiags,
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
  diagnostics.push(...paramsLoweringDiags);

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

  const systemTemplate = buildSystemTemplate(fields, fieldInputs, options, file, diagnostics);

  const registered = !diagnostics.some((d) => d.severity === "error");
  if (!registered) {
    return { registered: false, paramFields: fieldInputs, diagnostics };
  }

  // `modeValue` is defined here: a missing `mode:` is an error, which would have
  // set `registered` to `false` above. An out-of-range `tool_loop` /
  // `respond_repair` value also unsets `registered`, so both results carry a
  // `value` here.
  const toolLoop: ParsedToolLoop = {
    maxRounds: (toolLoopResult as { value: number }).value,
  };
  const respondRepair: ParsedRespondRepair = {
    attempts: (respondRepairResult as { value: number }).value,
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
    ...(systemTemplate !== undefined && systemRange !== undefined ? { systemRange } : {}),
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
