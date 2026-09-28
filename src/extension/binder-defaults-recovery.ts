// The declared-defaults half of the `V11a` frontmatter binder run
// (binder-run.ts): recover each defaulted `params:` field's evaluated value
// from the theta's own frontmatter, fill-if-absent those defaults into the
// binder-returned `args` behind the post-default-merge AJV boundary, and settle
// the binder outcome on that verdict. `recoverDeclaredDefaults` is the exported
// boundary the invoke machinery's omitted-defaulted recovery (bug 0409) reaches
// through `BinderRunner`.
//
// Spec (narrative): defaulting-system-note-echo.md,
// binder/binder-bypass-and-envelope.md.

import type { DefaultedField } from "../binder/defaulting";
import { fillDefaultsAndRevalidate } from "../binder/defaulting";
import type { BinderArgsClassification, BinderFailureSurface } from "../binder/retry-taxonomy";
import { parseExpressionSource } from "../parser/theta-document";
import type { ActiveInvocationTicket } from "../runtime/active-invocation-registry";
import { evaluatePureExpression } from "../runtime/pure-expression-evaluator";
import { isThetaPanic } from "../runtime/runtime-panics";
import type { ThetaValue } from "../runtime/value";
import { projectForValidation } from "../runtime/wire-translation";
import type { SchemaValidator } from "../seams/schema-validator";
import { thetaLookupEnvironment } from "./callable-lowering";
import type {
  BinderRunInput,
  BinderRunResult,
  ConversationBindInput,
} from "./theta-composition-producer";

/**
 * The `BinderRunner` collaborators `settleBinderOutcome` reaches back through:
 * the runtime root's schema validator and the two binder system-note emitters
 * that stay on the runner with the rest of its note channel.
 */
export interface BinderOutcomeSettleDeps {
  /** The runtime root's `SchemaValidator` seam (`ProductionProducerInput.root`). */
  readonly schemaValidator: SchemaValidator;
  /** `BinderRunner`'s `#emitBinderFailureNote` (bug 0397 §Fix). */
  readonly emitBinderFailureNote: (
    thetaName: string,
    surface: BinderFailureSurface,
    ticket: ActiveInvocationTicket | undefined,
  ) => void;
  /** `BinderRunner`'s `#emitBinderEchoNote` (BND-1). */
  readonly emitBinderEchoNote: (
    theta: ConversationBindInput["theta"],
    params: NonNullable<ConversationBindInput["theta"]["frontmatter"]["params"]>,
    mergedArgs: Readonly<Record<string, unknown>>,
    defaultedWireNames: readonly string[],
  ) => void;
}

/**
 * The post-default-merge outcome `runBinder` routes on: the merged `args`, the
 * `params`-boundary classification the named hook computed over them, and the
 * wire names `fillDefaultsAndRevalidate` actually filled — the echo's `(default)`
 * tag source (`defaulting.ts:70–75`), so the tag is read from what the fill step
 * did rather than recomputed from what the theta declared.
 */
interface MergedDeclaredDefaults {
  readonly args: Readonly<Record<string, unknown>>;
  readonly classification: BinderArgsClassification;
  readonly defaultedWireNames: readonly string[];
}

/**
 * Settle a successful binder envelope: merge declared defaults, route on the
 * post-merge AJV verdict, and emit the BND-1 success echo.
 *
 * §Defaulting (defaulting-system-note-echo.md#post-default-merge-ajv-validation;
 * binder-bypass-and-envelope.md#binder-envelope): defaults are filled by the
 * runtime AFTER the binder returns, not by the binder. The binder is told
 * which fields have defaults and MAY omit them from `args`; the runtime then
 * fills any defaulted wire name absent from `args` (fill-if-absent) and
 * AJV-validates the merged result before the body runs. Without this merge a
 * declared default (`count: integer = 3`) never reaches body scope and the
 * body sees the field as absent (BND-2). Only the genuine binder pass reaches
 * here — a defaulted field forces the `binder` classification (the
 * single-string / no-params bypasses carry no defaults), so the bypass arms
 * in `#applyBinderBypassOrNull` are intentionally left unchanged.
 */
export async function settleBinderOutcome(
  deps: BinderOutcomeSettleDeps,
  binderInput: BinderRunInput,
  params: NonNullable<ConversationBindInput["theta"]["frontmatter"]["params"]>,
  binderArgs: Record<string, unknown>,
): Promise<BinderRunResult> {
  const merged = await mergeDeclaredDefaults(deps.schemaValidator, binderInput.theta, params, binderArgs);
  // The post-default-merge verdict routes BEFORE the success echo: an
  // AJV-on-`args` classification (a merged document AJV refuses, or a
  // ceiling-#4 depth breach cross-routed per CIO-1) is terminal — no retry
  // (HC3-c), the failure-mode row surfaces, and the theta does not start. The
  // echo asserts a bind that happened, so it may not precede the verdict that
  // decides whether it did.
  if (merged.classification.kind !== "ok") {
    deps.emitBinderFailureNote(binderInput.theta.slashName, merged.classification, binderInput.invocationTicket);
    return { bound: false };
  }
  // §"Echo policy" (BND-1): on a successful bind the runtime appends the
  // one-line success echo note (`Running /<name>: …`) on the theta-system-note
  // channel immediately before the theta starts, UNLESS `bind_echo: false`. The
  // bypass arms auto-suppress the echo independently and never reach here.
  deps.emitBinderEchoNote(binderInput.theta, params, merged.args, merged.defaultedWireNames);
  return { bound: true, args: merged.args };
}

/**
 * Fill-if-absent the theta's declared `params:` defaults into the binder-returned
 * `args`, then run the post-default-merge AJV validation, reusing the
 * unit-tested `fillDefaultsAndRevalidate` (`binder/defaulting.ts`). A wire name
 * PRESENT in `args` is preserved unchanged (a user-supplied value wins over the
 * default); a wire name ABSENT takes its declared default. The merged args are
 * returned together with the `params`-boundary classification the caller routes
 * on, so the named hook's verdict reaches a consumer.
 *
 * The hook runs whenever the theta presents a lowered `params:` schema, not
 * only when it declares defaults: enforcement point #4 is about the `params`
 * boundary, so a theta with no defaults still needs the depth walk over the
 * binder's own args, and a theta whose defaults could not be recovered still
 * needs what DID arrive validated.
 *
 * The parser retains each default's literal source on the parsed `ParsedParams`
 * (`fields[].defaultSource`, feeding the binder system prompt's
 * `default=<literal>` line), but not its evaluated value, so the values are
 * recovered here from the theta's own loaded frontmatter: each defaulted
 * field's recorded `defaultSource` is parsed + evaluated through the same pure
 * evaluator the body uses. Recovery is best-effort — a default that does not
 * parse, or a default that parses and then panics while evaluating, leaves
 * that field unfilled, never throws. An unfilled field is ABSENT from the
 * merged args, and a defaulted field is never in the lowered schema's
 * `required` set (`parseParams`, `parser/params.ts`, writes
 * `required.push(field.name)` only under `field.defaultSource === undefined`),
 * so the post-default-merge AJV check below ADMITS that absence and the
 * invocation binds without the field. Both best-effort cases therefore reach
 * one end state, and what DID arrive is still validated at the `params`
 * boundary.
 */
async function mergeDeclaredDefaults(
  schemaValidator: SchemaValidator,
  theta: ConversationBindInput["theta"],
  params: NonNullable<ConversationBindInput["theta"]["frontmatter"]["params"]>,
  binderArgs: Readonly<Record<string, unknown>>,
): Promise<MergedDeclaredDefaults> {
  if (params.loweredSchema === undefined) {
    // No lowered `params:` document to validate against, so the boundary this
    // hook guards does not exist for this theta. (`runBinder` already returns
    // ahead of the binder pass in that case; this is its type narrowing.) No
    // fill step ran, so no wire name took a default.
    return { args: binderArgs, classification: { kind: "ok" }, defaultedWireNames: [] };
  }
  // Recovery is best-effort and may yield nothing (a default that does not
  // re-parse, a default whose evaluation panics). That leaves the field
  // unfilled — it does NOT excuse the boundary: what did arrive is still
  // validated below.
  const defaults =
    params.defaultedFields.length === 0
      ? []
      : await recoverDeclaredDefaults(theta, params.defaultedFields);
  // Post-default-merge AJV validation runs against the MERGED args, behind
  // ceiling #4's depth walk (§Defaulting; CIO-3). The classification is
  // returned to the caller, which owns the body-run vs short-circuit routing.
  const validator = schemaValidator.compile(params.loweredSchema);
  const result = fillDefaultsAndRevalidate({ binderArgs, defaults, validator });
  return {
    args: result.args,
    classification: result.classification,
    defaultedWireNames: result.defaultedWireNames,
  };
}

/**
 * Recover the declared default's evaluated VALUE for each defaulted wire name
 * from the theta's own parsed frontmatter. The parsed `ParsedParams` already
 * retains each default's literal source (`fields[].defaultSource`, feeding
 * the binder system prompt's `default=<literal>` line) but not its evaluated
 * value, so this looks each wire name up on `theta.frontmatter.params.fields`
 * and parses + evaluates its recorded `defaultSource` with the body's pure
 * evaluator (so an enum / schema-literal default resolves against the body's
 * declarations), then projects the evaluated value to wire form for the
 * post-default-merge AJV boundary it feeds (`fillDefaultsAndRevalidate`,
 * `binder/defaulting.ts`). The declaring-enum tag / schema brand a wire-form
 * default loses here is re-established downstream by the binder-`args`
 * inbound boundary (`bindParamsInbound`, `runtime/inbound-boundary.ts`,
 * reached from `paramBindingsFrom` in `src/extension/theta-composition-producer.ts`)
 * that `runtime-value-model.md:34` already mandates over binder `args`.
 */
export async function recoverDeclaredDefaults(
  theta: ConversationBindInput["theta"],
  defaultedFields: readonly string[],
): Promise<readonly DefaultedField[]> {
  const fieldsByWireName = new Map(
    (theta.frontmatter.params?.fields ?? []).map((field) => [field.wireName, field] as const),
  );
  const env = thetaLookupEnvironment(theta);
  const defaults: DefaultedField[] = [];
  for (const wireName of defaultedFields) {
    const defaultSource = fieldsByWireName.get(wireName)?.defaultSource;
    if (defaultSource === undefined) {
      continue;
    }
    const parsed = parseExpressionSource(defaultSource);
    if (parsed === null) {
      continue;
    }
    // The evaluated default is a runtime `ThetaValue` from the body's own
    // evaluator: `Enum.Variant` resolves through
    // `LexicalEnvironment.resolveEnumVariant` to `makeEnumValue`'s boxed
    // `String` (`typeof === "object"`), while the merge's consumer is an AJV
    // `type: "string"` check — a `typeof` test — over a record whose other
    // half is `JSON.parse`d binder output. Project here so the merged
    // document is homogeneous wire form, which is what
    // `DefaultedField.defaultValue` (`binder/defaulting.ts`) already
    // contracts for.
    // A default that parses can still fail to EVALUATE — an `Enum.Variant`
    // whose head resolves to no first-class value hands the pure evaluator's
    // member arm a `null` target, which panics. The panic is correct where it
    // is raised and wrong here: this recovery's contract (above) is that a
    // default it cannot make a value of leaves its field unfilled, which keeps
    // the field out of the merged args. A defaulted field is not in the lowered
    // schema's `required` set (`parseParams` guards the `required.push` on
    // `field.defaultSource === undefined`), so the post-default-merge AJV check
    // ADMITS that absence and the invocation binds without the field — the end
    // state the two sibling best-effort cases above (an absent recorded default,
    // a default that does not parse) already reach, with what DID arrive still
    // validated there. Only the closed `ThetaPanic` set is absorbed
    // — any other throw is an interpreter defect and belongs to the
    // runtime-defect surface, so it propagates unchanged.
    let evaluated: ThetaValue;
    try {
      evaluated = evaluatePureExpression(parsed, env);
    } catch (thrown) { // allow-broad-catch: ThetaPanic-only, re-raised below — error-model.md#runtime-panics
      if (!isThetaPanic(thrown)) {
        throw thrown;
      }
      continue;
    }
    defaults.push({
      wireName,
      defaultValue: projectForValidation(evaluated),
    });
  }
  return defaults;
}
