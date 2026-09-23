// The frontmatter contract-type family: the exported type/interface surface a
// theta-file frontmatter parse produces and consumes — the theta 1.0 mode and
// model-match vocabulary, the model-reference-matcher injection seam, the
// parsed block/params/frontmatter records, the parse result envelope, and the
// whole-file body-type inputs. Declaration-only; the field-contract parse
// machinery that populates these shapes lives in frontmatter.ts, which
// re-exports this module so importers of either surface resolve unchanged.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";
import { type LoweredSchema } from "../seams/schema-validator";
import { type ParamFieldInput } from "./params";
import { type SystemTemplate } from "./system-interpolation";
import { type BypassParamsField } from "../binder/binder-envelope";

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
