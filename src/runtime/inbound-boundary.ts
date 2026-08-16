// The step every inbound boundary performs between its AJV verdict and the
// value binding into theta scope.
//
// runtime-value-model.md §"Wire-name translation" states the inbound rule once
// and closes its boundary set at four — typed query results, tool-call return
// decoding where typed, `invoke` returns, and binder `args` — "and is not
// restated per call site". The rule's content is owned by
// `./wire-translation`'s `translateInbound`; the per-`$defs` sidecars it walks
// are derived from a lowered document by `../parser/schema-lowering`'s
// `buildInboundTranslationPlan`. This module is the two of them composed, so a
// boundary spells the step once rather than re-deriving the plan shape.
//
// It is a shared step, NOT an enforced entry point: nothing here makes a
// boundary unable to bind a value without routing through it. Bug 0067
// §Options posed the question — "whether `translateInbound` gains a single
// enforced entry point that every inbound boundary is required to route
// through" — and bug 0172 §Fix (d) carries it forward unanswered. This module
// deliberately does not decide it: it gives the four boundaries a common
// implementation to call, not a mechanism that forbids calling anything else.

import type { ThetaBody } from "../parser/theta-document";
import { buildInboundTranslationPlan } from "../parser/schema-lowering";
import { translateInbound } from "./wire-translation";
import type { ThetaValue } from "./value";

/**
 * The plan-derivation inputs one inbound boundary holds: the lowered document
 * its AJV verdict was taken against, the annotation source that document was
 * produced from, and the declared `schema` / `enum` names of the body whose
 * declarations the annotation resolves against.
 */
export interface InboundBoundaryInput {
  /** The lowered schema document the payload was AJV-validated against. */
  readonly lowered: Record<string, unknown>;
  /** The verbatim annotation source `lowered` was produced from. */
  readonly annotation: string;
  /** The declared `schema` names — the only names a rebuilt object may be branded with. */
  readonly schemaNames: ReadonlySet<string>;
  /** The declared `enum` names — the only names a validated string position may be tagged with. */
  readonly enumNames: ReadonlySet<string>;
  /** The AJV-validated payload. */
  readonly validated: unknown;
}

/**
 * Translate one AJV-validated payload to its theta-side value: derive the
 * per-`$defs` sidecars from `lowered` and run the inbound walk over them.
 *
 * Ordered after the caller's own AJV verdict and before the value binds, as
 * runtime-value-model.md §"Wire-name translation" fixes ("after AJV validation
 * against the lowered schema, the runtime walks the validated JSON"). The walk
 * re-tags named-enum positions, re-brands schema-typed objects and orders each
 * described object's own fields by declaration; it applies no rename, because
 * every sidecar `buildInboundTranslationPlan` derives carries an empty
 * wire-name map by construction — the lowering the boundaries here consume
 * emits theta-side property names, so renaming an already-theta-side key would
 * corrupt it.
 */
export function decodeInboundValue(input: InboundBoundaryInput): ThetaValue {
  const plan = buildInboundTranslationPlan({
    lowered: input.lowered,
    annotation: input.annotation,
    schemaNames: input.schemaNames,
    enumNames: input.enumNames,
  });
  return translateInbound({
    validated: input.validated,
    sidecars: plan.sidecars,
    rootDef: plan.rootDef,
    schemaNames: plan.schemaNames,
  });
}

/**
 * The annotation a `params:` document is planned under. A `params:` block has
 * no annotation source of its own — it is an anonymous object root, not a
 * named declaration — and `#` falls outside the identifier alphabet, so
 * `buildInboundTranslationPlan` registers the root under its reserved `#root`
 * key and no rebuilt params object is ever branded as if it were a declared
 * `schema`. The declared `schema` / `enum` names the fields REFERENCE still
 * reach the plan through `$defs`, so a `sev: Sev` field is tagged and a
 * `box: Box` field branded exactly as at any other boundary.
 */
const PARAMS_ROOT_ANNOTATION = "#params";

/** The inputs the binder-`args` projection needs to bind one params record. */
export interface ParamsBindingInput {
  /** The validated params record: the binder's merged `args`, or a child's marshalled params. */
  readonly params: Readonly<Record<string, unknown>>;
  /** The theta's own lowered `params:` document, absent when it declares no `params:`. */
  readonly lowered: Record<string, unknown> | undefined;
  /** The theta body whose `schema` / `enum` declarations the params types resolve against. */
  readonly body: ThetaBody;
}

/**
 * Project a validated params record onto the executor's per-name `paramBindings`
 * map, translating it inbound first.
 *
 * runtime-value-model.md §"Wire-name translation" names binder `args` as one of
 * the four inbound boundaries, so a `params:` field declared as a named `enum`
 * must reach body scope as a tagged variant rather than as the wire string AJV
 * admitted. The record is translated WHOLE — the lowered `params:` document
 * describes the args object, not its fields individually — and only then split
 * into per-name bindings, so a nested schema-typed field is branded and a
 * nested named-enum field tagged at its own depth.
 *
 * A theta with no `params:` has no lowered document to plan against, so its
 * record is projected unchanged. Frontmatter `params:` DEFAULTS never arrive
 * here: they bypass the inbound pass by specification (`runtime-value-model.md`
 * §"Wire-name translation", the defaults clause) and are merged before this
 * projection as already-theta-side values.
 */
export function bindParamsInbound(input: ParamsBindingInput): Map<string, ThetaValue> {
  const { params, lowered, body } = input;
  const decoded =
    lowered === undefined
      ? params
      : decodeInboundValue({
          lowered,
          annotation: PARAMS_ROOT_ANNOTATION,
          schemaNames: declaredNames(body, "schema"),
          enumNames: declaredNames(body, "enum"),
          validated: params,
        });
  const bindings = new Map<string, ThetaValue>();
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    // A non-object params record has no named slots to install. Unreachable
    // through the two production projections (both validate an object against
    // a closed object document first), so this is the total-function arm
    // rather than a behaviour.
    return bindings;
  }
  for (const [name, value] of Object.entries(decoded)) {
    bindings.set(name, value as ThetaValue);
  }
  return bindings;
}

/**
 * The theta body's declared `schema` / `enum` names. Read off the body rather
 * than off a lexical environment: the two consumers are leaf boundaries holding
 * a parsed body and nothing else.
 */
export function declaredNames(body: ThetaBody, kind: "schema" | "enum"): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of body.statements) {
    if (statement.kind === kind) {
      names.add((statement as { readonly name: string }).name);
    }
  }
  return names;
}
