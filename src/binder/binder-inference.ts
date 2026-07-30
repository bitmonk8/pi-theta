// The pi-ai `complete()` binder inference call.
//
// This module owns the construction of the one-shot structured-output
// `complete()` call the binder pass issues per slash dispatch
// (pi-integration-contract/binder-inference.md §"Binder inference call"),
// plus the ToolCall-arguments envelope extraction over the returned reply:
//
//   - `context.systemPrompt` is the rendered binder system prompt.
//   - `context.messages` is the fixed single-element `[user]` array whose content
//     is the canonical literal `Bind the slash-command arguments now.`.
//   - `context.tools` carries exactly one entry — the binder's structured-output
//     tool — `name` `__theta_bind_<slug>`, `description` the fixed literal, and
//     `parameters` the object attachment wrapper
//     `{ type: "object", properties: { envelope: <envelope schema> },
//     required: ["envelope"], additionalProperties: false }` wrapped as
//     `Type.Unsafe<unknown>` — an object-rooted wrapper because a top-level
//     `anyOf` is not a valid provider tool `input_schema`; BNDR-1/BNDR-2
//     survive one level down. The attachment copy has every `#/$defs/...`
//     reference dereferenced (structurally inlined, transitively) and carries
//     NO `$defs` key: provider tool input-schema `$ref`/`$defs` handling
//     live-degrades the forced arguments (the d848f1b2 failure class, scoped
//     to refs — bug 0011 live round), and the attachment is a derived wire
//     artifact, so inlining changes no versioned schema surface. The slug and
//     the AJV routing step both run over the envelope schema DOCUMENT itself,
//     whose refs and root `$defs` stay intact.
//   - `options.temperature` is `0`; the provider's tool choice is forced to that
//     single tool via the shared per-api `options.toolChoice` spelling
//     (`forcedToolChoiceForApi` — the same table the typed-query forced respond
//     dispatch uses).
//   - the fixed seed, when the resolved provider's `Api` carries a seed field, is
//     placed under that field name (per §"Provider seed-field mapping").
//   - `options.signal` is `thetaAbort.signal`; `options.onResponse` is the
//     provider-response capture callback.
//
// Spec: pi-integration-contract/binder-inference.md (§Binder inference call),
// pi-integration-contract/provider-error-mapping.md (§Provider seed-field
// mapping), binder/binder-bypass-and-envelope.md (envelope schema),
// binder/determinism-cancellation-failure.md (§Determinism — temperature 0, the
// fixed user-message literal, the fixed seed).

import { Type } from "typebox";
import type {
  Api,
  AssistantMessage,
  Context,
  Model,
  ProviderResponse,
  ProviderStreamOptions,
  Tool,
  ToolCall,
} from "@earendil-works/pi-ai";
import type { BinderEnvelopeSchema } from "./binder-envelope";
import { forcedToolChoiceForApi } from "./forced-tool-choice";

/**
 * The per-provider binder seed-field mapping
 * (provider-error-mapping.md §"Provider seed-field mapping"), keyed on the
 * resolved binder model's `api` field. A provider whose row omits the seed
 * field maps to `undefined` and receives no seed key; a provider absent from the
 * table likewise receives none. Held as a single named constant so the
 * seed-supporting set has one source of truth to widen (a spec-versioned change).
 */
const BINDER_SEED_FIELD_BY_API: Readonly<Record<string, string | undefined>> =
  Object.freeze({
    "openai-completions": "seed",
    mistral: "random_seed",
    "anthropic-messages": undefined,
    "amazon-bedrock": undefined,
  });

/**
 * The binder user message carries no wall-clock time — the call is deterministic
 * (temperature 0, fixed literal content) — but `@earendil-works/pi-ai`'s
 * `UserMessage` type requires a `timestamp`. A fixed `0` keeps the constructed
 * message deterministic and reads no ambient timing primitive.
 */
const BINDER_MESSAGE_TIMESTAMP = 0;

// --- fixed literals ---------------------------------------------------------

/**
 * The canonical literal `user`-role message content
 * (binder-inference.md §"Binder inference call"): a fixed constant of the binder
 * call — it neither restates the variable binding context (carried by
 * `systemPrompt`) nor varies per invocation.
 */
export const BINDER_MESSAGE_CONTENT = "Bind the slash-command arguments now.";

/**
 * The binder structured-output tool's fixed `description` literal
 * (binder-inference.md §"Binder inference call").
 */
export const BINDER_TOOL_DESCRIPTION =
  "Return the binder result envelope for the slash-command argument binding.";

/**
 * The binder structured-output tool `name` (binder-inference.md): `__theta_bind_`
 * followed by the schema slug of the lowered binder envelope schema (the same
 * canonical-schema-hash recipe the typed-query `__theta_respond_<slug>` tool
 * name uses) — the slug of the envelope schema DOCUMENT, not of its object
 * attachment wrapper.
 */
export function binderToolName(slug: string): string {
  return `__theta_bind_${slug}`;
}

/**
 * The single argument key of the binder tool's object attachment wrapper: the
 * forced ToolCall's `arguments` carry the envelope under this key. Shared by
 * call construction ({@link binderToolParametersSchema}) and reply extraction
 * ({@link extractBinderEnvelope}) so the two sides cannot disagree.
 */
const BINDER_ENVELOPE_ARGUMENT_KEY = "envelope";

/** The in-document `$defs` reference prefix the schema lowering emits. */
const DEFS_REF_PREFIX = "#/$defs/";

/**
 * Root the binder envelope schema in the object attachment wrapper the
 * provider receives as the tool's `parameters`
 * (binder-inference.md §"Binder inference call"):
 *
 *   `{ type: "object", properties: { envelope: <envelope schema> },
 *      required: ["envelope"], additionalProperties: false }`
 *
 * WHY the wrapper: provider tool input schemas must be object-rooted — a
 * top-level `anyOf` is rejected / yields empty forced arguments (the
 * live-confirmed `d848f1b2` finding) — so the three-arm BNDR-1/BNDR-2 envelope
 * is preserved one level down at `properties.envelope` while AJV keeps
 * validating the unwrapped envelope document.
 *
 * WHY the attachment copy INLINES `$defs` refs instead of transporting them
 * (bug 0011 live round): provider tool input-schema handling of `$ref`/`$defs`
 * degrades the forced arguments — every NamedType bind (whose params lower to
 * `{ "$ref": "#/$defs/<name>" }`, params.ts) failed live with the
 * malformed-parse note while every ref-free envelope bound; the pass/fail
 * partition was exactly the `$ref`/`$defs` axis (the d848f1b2 failure class,
 * scoped to refs). So every `#/$defs/<name>` reference in the attachment copy
 * is dereferenced (the referenced fragment structurally inlined, transitively)
 * and the attachment carries no `$defs` key at all. The attachment is a
 * derived wire artifact: the slug and the AJV routing step both consume the
 * envelope schema DOCUMENT itself (refs + root `$defs` intact), so inlining
 * changes no versioned schema surface. The input document is never mutated —
 * it is also the slug/AJV artifact.
 */
function binderToolParametersSchema(
  envelopeSchema: BinderEnvelopeSchema,
): Readonly<Record<string, unknown>> {
  const { $defs, ...envelope } = envelopeSchema as Record<string, unknown>;
  const defsTable =
    $defs !== null && typeof $defs === "object" && !Array.isArray($defs)
      ? ($defs as Readonly<Record<string, unknown>>)
      : undefined;
  const survivingRefs = new Set<string>();
  const inlined = inlineDefsRefs(envelope, defsTable, new Set(), survivingRefs);
  const wrapper: Record<string, unknown> = {
    type: "object",
    properties: { [BINDER_ENVELOPE_ARGUMENT_KEY]: inlined },
    required: [BINDER_ENVELOPE_ARGUMENT_KEY],
    additionalProperties: false,
  };
  // Residual closure (see the cycle-guard WHY on `inlineDefsRefs`): when a
  // resolvable ref survived the walk un-inlined (only the cycle guard can
  // cause that — a recursive named schema), keep the still-referenced `$defs`
  // closure at the wrapper root so the attachment stays self-consistent
  // rather than dangling.
  if (survivingRefs.size > 0 && defsTable !== undefined) {
    wrapper["$defs"] = residualDefsClosure(defsTable, survivingRefs);
  }
  return wrapper;
}

/**
 * Non-mutating structural walk that dereferences every pure
 * `{ "$ref": "#/$defs/<name>" }` node against `defs` (the envelope document's
 * root `$defs` table), inlining the referenced fragment transitively — a
 * `$defs` fragment may itself carry refs into `$defs` (e.g. a `schema` decl
 * referencing an `enum`). Handles refs anywhere: `properties`, `items`,
 * `anyOf` arms, nested objects/arrays.
 *
 * Only the PURE ref shape is dereferenced: the lowering's single `$ref` mint
 * site (params.ts `lowerTypeExpr` NamedType atom) emits `{ $ref }` with no
 * sibling keys, so a node carrying `$ref` plus siblings cannot arise from a
 * lowered theta schema and is left untouched (copied verbatim), as is any ref
 * not shaped `#/$defs/<name>`. An unresolvable `#/$defs/...` ref — one naming
 * no entry in the root table — is left verbatim in the attachment, which keeps
 * the inliner TOTAL for an input it cannot resolve. No author input reaches
 * that branch: the `params:` document's root `$defs` holds the transitive
 * closure of every ref the lowering mints (`hoistNestedDefs`, params.ts, lifts
 * each fragment-local closure to that document's own root, so a name reached
 * only THROUGH another name is still root-resolvable), and
 * `buildBinderEnvelopeSchema` hoists that same table verbatim to the envelope
 * document root — the table this walk resolves against. A ref the walk cannot
 * resolve would equally fail the envelope document's own AJV compile at the
 * routing step, so leaving it verbatim adds no failure mode of its own.
 *
 * Nested `$defs` keys encountered during the walk are dropped from the copy:
 * `#/$defs/...` pointers resolve only against the DOCUMENT root, so a non-root
 * `$defs` is never a resolution target for AJV or the provider, and after
 * inlining it is dead weight of exactly the key the provider degrades on.
 *
 * WHY the cycle guard (`expansionPath`, a seen-set of `$defs` names on the
 * current expansion path): the theta surface pins recursive named schemas as
 * representable (schemas.md §Recursion — self- and mutual recursion "supported
 * transparently"; schema-subset.md §Reuse — "including recursive references";
 * the depth ceiling bounds runtime DATA, not the schema graph), and bug
 * 0028's two-pass `buildBodyTypeSchemas` (body-type-lowering.ts) makes a
 * recursive `$ref` graph REACHABLE from author input: a `params:` field
 * naming a self- or mutually-recursive `schema` lowers to a ref whose target
 * fragment refs back into the same closure, so walking into that name a
 * second time hits this guard — it is LIVE, not defensive. Its documented
 * disposition is the shipped path for a recursive named schema reached
 * through the `params:` binder envelope: on a cycle the branch stops inlining
 * — the `$ref` node survives as-is and is recorded in `survivingRefs` so the
 * caller retains its `$defs` closure at the wrapper root — rather than
 * recursing the structural walk forever. No author input throws at dispatch
 * time.
 */
function inlineDefsRefs(
  node: unknown,
  defs: Readonly<Record<string, unknown>> | undefined,
  expansionPath: ReadonlySet<string>,
  survivingRefs: Set<string>,
): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => inlineDefsRefs(item, defs, expansionPath, survivingRefs));
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  const source = node as Record<string, unknown>;
  const ref = source["$ref"];
  if (
    typeof ref === "string" &&
    ref.startsWith(DEFS_REF_PREFIX) &&
    Object.keys(source).length === 1
  ) {
    const name = ref.slice(DEFS_REF_PREFIX.length);
    const fragment = defs?.[name];
    if (fragment !== undefined && !expansionPath.has(name)) {
      return inlineDefsRefs(fragment, defs, new Set(expansionPath).add(name), survivingRefs);
    }
    if (fragment !== undefined) {
      // Cycle guard hit (a recursive named schema — see the WHY above): stop
      // inlining this branch, keep the ref, and have the caller retain its
      // closure so the attachment stays self-consistent.
      survivingRefs.add(name);
    }
    // Unresolvable name: left untouched — dangling in the input document too.
    return { ...source };
  }
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "$defs") {
      // Non-root `$defs` are never resolution targets (root-pointer
      // semantics); dropped from the attachment copy — see the doc comment.
      continue;
    }
    copy[key] = inlineDefsRefs(value, defs, expansionPath, survivingRefs);
  }
  return copy;
}

/**
 * The transitive `$defs` closure of `roots` over `defs`, retaining each
 * reachable fragment as a fresh `structuredClone` copy (uniform fresh-copy
 * discipline with the inlining walk — the attachment never aliases the input
 * document). Feeds the residual-`$defs` branch of
 * {@link binderToolParametersSchema} only (a surviving cycle-guarded ref);
 * retaining the full closure keeps every surviving ref — including refs inside
 * retained fragments — resolvable from the wrapper root.
 */
function residualDefsClosure(
  defs: Readonly<Record<string, unknown>>,
  roots: ReadonlySet<string>,
): Readonly<Record<string, unknown>> {
  const retained: Record<string, unknown> = {};
  const visited = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.shift();
    if (name === undefined || visited.has(name)) {
      continue;
    }
    visited.add(name);
    if (!Object.prototype.hasOwnProperty.call(defs, name)) {
      continue;
    }
    const fragment = defs[name];
    retained[name] = structuredClone(fragment);
    queue.push(...collectDefsRefNames(fragment));
  }
  return retained;
}

/**
 * Every `<name>` referenced by a `{ "$ref": "#/$defs/<name>" }` node anywhere
 * within `node` (a structural scan over nested objects and arrays).
 */
function collectDefsRefNames(node: unknown): string[] {
  const names: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (value === null || typeof value !== "object") {
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "$ref" && typeof child === "string" && child.startsWith(DEFS_REF_PREFIX)) {
        names.push(child.slice(DEFS_REF_PREFIX.length));
      }
      visit(child);
    }
  };
  visit(node);
  return names;
}

// --- the complete() call construction ---------------------------------------

/** Inputs to constructing one binder `complete()` call. */
export interface BinderCompleteCallInput {
  /** The resolved binder `Model<Api>` handle. */
  readonly model: Model<Api>;
  /** The rendered binder system prompt (`context.systemPrompt`). */
  readonly systemPrompt: string;
  /**
   * The per-theta binder envelope schema (the three-arm anyOf document);
   * rooted in the object attachment wrapper before the `Type.Unsafe<unknown>`
   * wrap.
   */
  readonly envelopeSchema: BinderEnvelopeSchema;
  /** The schema slug of the lowered envelope schema (drives `__theta_bind_<slug>`). */
  readonly slug: string;
  /** The fixed seed value (mapped under the provider's seed field, when it has one). */
  readonly seed: number;
  /** The cancellation source — `thetaAbort.signal` (always defined). */
  readonly signal: AbortSignal;
  /** The provider-response capture callback registered on every binder call. */
  readonly onResponse: (response: ProviderResponse, model: Model<Api>) => void;
}

/**
 * The constructed `complete(model, context, options)` argument triple. The
 * runtime hands this to `@earendil-works/pi-ai`'s `complete()` free function.
 */
export interface BinderCompleteCall {
  readonly model: Model<Api>;
  readonly context: Context;
  readonly options: ProviderStreamOptions;
}

/**
 * Construct the binder `complete()` call for one binder attempt
 * (binder-inference.md §"Binder inference call"): the rendered system prompt,
 * the fixed user-message literal, the single forced `__theta_bind_<slug>` tool
 * carrying the object-rooted envelope wrapper, `temperature: 0`, the per-api
 * seed placement, the abort signal, and the provider-response capture. The
 * constructor is auth-free — the caller threads registry auth (apiKey/headers)
 * into the returned `options` before dispatching.
 */
export function buildBinderCompleteCall(
  input: BinderCompleteCallInput,
): BinderCompleteCall {
  const toolName = binderToolName(input.slug);

  const tool: Tool = {
    name: toolName,
    description: BINDER_TOOL_DESCRIPTION,
    parameters: Type.Unsafe<unknown>(binderToolParametersSchema(input.envelopeSchema)),
  };

  const context: Context = {
    systemPrompt: input.systemPrompt,
    messages: [
      {
        role: "user",
        content: BINDER_MESSAGE_CONTENT,
        timestamp: BINDER_MESSAGE_TIMESTAMP,
      },
    ],
    tools: [tool],
  };

  const options: ProviderStreamOptions = {
    temperature: 0,
    signal: input.signal,
    onResponse: input.onResponse,
    // The per-api forced-tool-choice spelling (bug 0010 pin clarification): the
    // normalized `{type:"tool",name}` is a 400/TypeError on the
    // openai-completions / mistral-family adapters, so the shared table spells
    // the choice per the resolved binder model's api.
    toolChoice: forcedToolChoiceForApi(String(input.model.api), toolName),
  };

  // Provider seed-field mapping: place the fixed seed under the provider's seed
  // field name, when its row carries one; omit it otherwise.
  const seedField = BINDER_SEED_FIELD_BY_API[input.model.api];
  if (seedField !== undefined) {
    (options as Record<string, unknown>)[seedField] = input.seed;
  }

  return { model: input.model, context, options };
}

// --- envelope extraction ------------------------------------------------------

/**
 * The outcome of extracting the binder envelope from one reply:
 *
 *   - `match` — the first ToolCall naming the binder tool carried a non-null
 *     object `arguments` with the {@link BINDER_ENVELOPE_ARGUMENT_KEY} key;
 *     `envelope` is that key's value (AJV-validated by the caller against the
 *     unwrapped envelope schema).
 *   - `match-malformed` — a ToolCall named the binder tool but its `arguments`
 *     are unusable (not a non-null object, or no `envelope` key): the
 *     malformed-envelope class, never a transport failure.
 *   - `no-match` — no ToolCall names the binder tool. `hasAnyToolCall`
 *     distinguishes a wrong-name ToolCall from a plain-text reply (both are the
 *     malformed-envelope condition on a clean stop; the caller consults
 *     stopReason / errorMessage / HTTP status for the failure routing).
 */
export type BinderEnvelopeExtraction =
  | { readonly kind: "match"; readonly envelope: unknown }
  | { readonly kind: "match-malformed" }
  | { readonly kind: "no-match"; readonly hasAnyToolCall: boolean };

/**
 * Extract the binder envelope from a resolved binder reply per the
 * binder-inference.md extraction rule: the FIRST `ToolCall` content part whose
 * `name` matches the binder's structured-output tool supplies the attachment
 * wrapper object in its `arguments`; the envelope is the value of its
 * `envelope` key. Success extraction takes precedence over any
 * stopReason/errorMessage/HTTP-status classification — the caller applies this
 * BEFORE failure routing. Pure and unit-consumable: no provider surface, no
 * validator (the caller owns the AJV step).
 */
export function extractBinderEnvelope(
  reply: AssistantMessage,
  toolName: string,
): BinderEnvelopeExtraction {
  const calls = reply.content.filter(
    (part): part is ToolCall => part.type === "toolCall",
  );
  const match = calls.find((call) => call.name === toolName);
  if (match === undefined) {
    return { kind: "no-match", hasAnyToolCall: calls.length > 0 };
  }
  const args: unknown = match.arguments;
  if (
    typeof args !== "object" ||
    args === null ||
    Array.isArray(args) ||
    !Object.prototype.hasOwnProperty.call(args, BINDER_ENVELOPE_ARGUMENT_KEY)
  ) {
    return { kind: "match-malformed" };
  }
  return {
    kind: "match",
    envelope: (args as Record<string, unknown>)[BINDER_ENVELOPE_ARGUMENT_KEY],
  };
}
