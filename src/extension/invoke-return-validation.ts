// Typed-return resolution and validation for the production `invoke(...)`
// machinery (invoke-machinery.ts): resolve which return type a driven callee's
// `Ok` payload is checked against and whose declarations it resolves in
// (`InvokeReturnTyping` → `InvokeReturnSite`), then run the return-value
// boundary — the ceiling-#4 depth walk, the AJV check over the wire-form
// projection, and the inbound wire-name translation / enum retag. The schema
// validator is threaded in as a parameter; the module holds no state.
//
// Spec (narrative): invocation.md §Typed return, tool-calls.md §"Return type",
// runtime-value-model.md §"Wire-name translation",
// hard-ceilings/ceilings-3-and-4.md.

import { inferCalleeReturnAnnotation } from "../parser/functions";
import { lowerQueryResponseSchema } from "../parser/query-schema-lowering";
import type { ThetaBody } from "../parser/theta-document";
import { retagForwardedEnums } from "../runtime/enum-tag-carriage";
import { decodeInboundValue } from "../runtime/inbound-boundary";
import { enforceInvokeReturnDepth } from "../runtime/invoke-ceiling-depth";
import type { InvokeInfraError } from "../runtime/query-error";
import type { EnumTagEntry } from "../runtime/subagent-envelope";
import {
  makeErr,
  makeOk,
  type ResultValue,
  type ThetaValue,
} from "../runtime/value";
import { projectForValidation } from "../runtime/wire-translation";
import type { SchemaValidator } from "../seams/schema-validator";
import { mergedEnumDeclsOf, mergedSchemaDeclsOf } from "./query-text-render";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "./theta-composition-producer";

/**
 * How a driven callee's return type is typed at its call site, carried from the
 * expression resolver down to the return-validation boundary. The three arms
 * are the three call surfaces the invoke trampoline serves, and they differ in
 * WHOSE declarations the type resolves in — which is why the site cannot be
 * reduced to a bare annotation string:
 *
 *   - `annotated` — `invoke<Schema>(...)`: the caller's annotation and decls.
 *   - `callee-inferred` — a `.theta`-callable call through `tools:`: the
 *     callee's inferred return type and decls (tool-calls.md §"Return type").
 *   - `untyped` — a bare `invoke(...)`: no return type (invocation.md
 *     §"Typed return").
 */
export type InvokeReturnTyping =
  | { readonly kind: "annotated"; readonly annotation: string }
  | { readonly kind: "callee-inferred" }
  | { readonly kind: "untyped" };

/**
 * A resolved return-type site: the annotation source to lower and the theta
 * body whose `schema` / `enum` declarations resolve the names in it. Bug
 * 0465: `importedTypeDecls` rides alongside `declarations` so
 * `#validateInvokeReturn` can merge in the same file's imported schema/enum
 * decls the lowering seam needs — the CALLER's for `annotated` (the caller
 * wrote the annotation and its own imports resolve it), the CALLEE's for
 * `callee-inferred` (the inferred name resolves against the callee's own
 * decls, imports included).
 */
export interface InvokeReturnSite {
  readonly annotation: string;
  readonly declarations: ThetaBody;
  readonly importedTypeDecls?: ThetaCompositionInput["importedTypeDecls"];
}

/**
 * Resolve which return type a driven callee's `Ok` payload is checked
 * against, and whose declarations that type resolves in.
 *
 *   - `annotated` — an `invoke<Schema>` site: the CALLER wrote the annotation
 *     and the caller's `schema` / `enum` decls resolve it (invocation.md
 *     §"Typed return").
 *   - `callee-inferred` — a `.theta`-callable call through `tools:`: the site
 *     has no annotation, so tool-calls.md §"Return type" types it by the
 *     callee's inferred return type (FN-3), resolved against the CALLEE's own
 *     decls. `null` where the inference cannot name a type from syntax alone,
 *     which leaves that call exactly as it behaved before — no AJV check, no
 *     translation pass — matching that row's "otherwise the runtime AJV check
 *     enforces it" fallback for a boundary that has no type to enforce.
 *   - `untyped` — a bare `invoke(...)`: invocation.md §"Typed return" gives it
 *     no return type at all, so nothing is derived.
 */
export function resolveReturnSite(
  theta: ConversationBindInput["theta"],
  returnTyping: InvokeReturnTyping,
  callee: ThetaCompositionInput,
): InvokeReturnSite | null {
  switch (returnTyping.kind) {
    case "annotated":
      return {
        annotation: returnTyping.annotation,
        declarations: theta.body,
        ...(theta.importedTypeDecls !== undefined
          ? { importedTypeDecls: theta.importedTypeDecls }
          : {}),
      };
    case "untyped":
      return null;
    case "callee-inferred": {
      // Bug 0465: feed the SAME merged (imports + same-file) name sets the
      // lowering seam itself will resolve against, so a constructor tail
      // naming an imported schema (or an enum-variant tail naming an
      // imported enum) is recognised here too — the §Non-goal residual
      // (`inferCalleeReturnAnnotation`'s conservative floor) this fix's
      // §Fix names as recovering, not filed on its own.
      const annotation = inferCalleeReturnAnnotation(
        callee.body,
        new Set(mergedSchemaDeclsOf(callee).map((decl) => decl.name)),
        new Set(mergedEnumDeclsOf(callee).map((decl) => decl.name)),
      );
      return annotation === null
        ? null
        : {
            annotation,
            declarations: callee.body,
            ...(callee.importedTypeDecls !== undefined
              ? { importedTypeDecls: callee.importedTypeDecls }
              : {}),
          };
    }
  }
}

/**
 * Typed-return runtime validation (invocation.md §Typed return, anchor
 * `#typed-return`): lower the resolved return-type
 * site's annotation against the declarations it resolves in, compile it, and
 * AJV-validate the child's `Ok` payload. A site-less call (`returnSite ===
 * null` — an untyped `invoke(...)`, or a `.theta`-callable call whose callee
 * return-type inference named none) or an `Err` result passes through
 * unchanged; a validation failure is surfaced as
 * `Err(InvokeInfraError{cause:"return_validation"})`.
 *
 * AJV is a structural surface — its `type: "string"` check is a `typeof` test
 * — and the enum carrier `makeEnumValue` builds is a boxed `String`
 * (`typeof === "object"`), so the AJV `validate` call runs only through
 * `projectForValidation`'s wire-form projection of the payload —
 * copy-on-change wherever no descendant needs collapsing AND no container
 * holds a value that is not identical to itself (a `NaN`, whose
 * walk-internal `!==` identity test reports "changed" though nothing
 * collapsed): only under both conditions is the projection the payload,
 * unchanged. Both call sites in `#driveCallee` — the prompt→prompt attach
 * cell and the subagent spawn cell — route through this one method, and it
 * reads the payload's WIRE FORM at both sub-checks, the depth walk as well
 * as the AJV call (bug 0202, which moves all three theta-value ceiling-#4
 * sites to that metric), so a callee's `mode:` frontmatter cannot change
 * whether a named-enum return validates, or what the caller binds for one.
 *
 * On success the ORIGINAL payload — never the projection — also runs
 * through the inbound translation pass runtime-value-model.md §"Wire-name
 * translation" names for `invoke` returns, ordered — as that section fixes
 * — after AJV validation. The subagent envelope is `JSON.stringify` of the
 * callee's own theta-side value, not a lowered-schema encoding, so the
 * derived sidecars carry an empty wire-name map and this pass only re-tags
 * named-enum positions and re-brands schema-typed objects — renaming here
 * would corrupt an already-correct key.
 *
 * The pass reaches the positions the derived sidecars key by JSON Pointer —
 * named-enum positions, `$ref` targets, array elements, the annotated root —
 * and a `{"anyOf":[…]}` position: there the walk re-tests the value against
 * each arm in source order and translates under the FIRST arm that admits it
 * (runtime-value-model.md §"Wire-name translation", the inbound bullet's
 * union clause), through the same `SchemaValidator` the verdict above came
 * from. No arm admitting the value hands it to the caller exactly as AJV
 * validated it: untagged, unbranded, and not descended into.
 */
export function validateInvokeReturn(
  schemaValidator: SchemaValidator,
  calleePath: string,
  returnSite: InvokeReturnSite | null,
  result: ResultValue,
  calleeResolvedPath: string | undefined,
  forwardedEnumTags?: readonly EnumTagEntry[],
): ResultValue {
  if (returnSite === null || !result.ok) {
    return result;
  }
  const { annotation: returnSchema, declarations, importedTypeDecls } = returnSite;
  const mergedSite = { body: declarations, importedTypeDecls };
  // Ceiling #4 (ceilings-3-and-4.md#ceiling-4-table, the `invoke<T>` return-value
  // row; CIO-3): the depth walk is the FIRST sub-check at the return-value AJV
  // boundary, over the payload's WIRE FORM — the JSON document, not the carrier
  // graph (bug 0202). A depth-6+ document surfaces to the invoke parent as
  // `Err(InvokeInfraError { cause: "return_validation" })` before AJV is consulted.
  const depthBreach = enforceInvokeReturnDepth(calleePath, result.value as unknown);
  if (depthBreach !== undefined) {
    return depthBreach.result;
  }
  const lowered = lowerQueryResponseSchema(
    returnSchema,
    mergedSchemaDeclsOf(mergedSite),
    mergedEnumDeclsOf(mergedSite),
  );
  if (lowered === undefined) {
    return result;
  }
  const validator = schemaValidator.compile(lowered);
  const verdict = validator.validate(projectForValidation(result.value));
  if (verdict.ok) {
    const decoded = decodeInboundValue({
      lowered: lowered as unknown as Record<string, unknown>,
      annotation: returnSchema,
      schemaNames: new Set(mergedSchemaDeclsOf(mergedSite).map((decl) => decl.name)),
      enumNames: new Set(mergedEnumDeclsOf(mergedSite).map((decl) => decl.name)),
      validated: result.value as unknown,
      schemaValidator: schemaValidator,
      // Bug 0337 (subagent-leg / tools:-callee-leg adjudication, Option 1):
      // an `invoke<T>` return whose carrier is a JSON primitive string (the
      // subagent envelope leg) is retagged by the inbound decode; mint the
      // CALLEE's file-qualified declaring key so the returned variant carries
      // the same tag on the subagent leg as the prompt→prompt boxed-carrier
      // leg keeps intact — mode invariance (0174's witness). The value belongs
      // to the callee's declaration, so a caller reading it against its own
      // same-named enum compares unequal.
      ...(calleeResolvedPath !== undefined
        ? { enumDeclaringPath: calleeResolvedPath }
        : {}),
    });
    // Bug 0342 §Fix (D3 carriage): the immediate-callee retag above is right
    // for one hop and wrong across a SUBAGENT hop that forwards a value it
    // did not itself declare — the PIC-59 envelope collapsed that value's
    // own boxed carrier before this decode ever saw it, so the retag above
    // stamped the immediate callee's key over the forwarding file's own
    // declaring key. When the envelope carried the `enum_tags` sidecar,
    // restore each forwarded position's declaring key over that stamp.
    // Absent `forwardedEnumTags` (undefined, or an empty list) leaves
    // `decoded` exactly as the immediate-callee retag produced it — the
    // attach leg's call site passes nothing here, by design.
    const retagged =
      forwardedEnumTags !== undefined && forwardedEnumTags.length > 0
        ? retagForwardedEnums(decoded, forwardedEnumTags)
        : decoded;
    return makeOk(retagged);
  }
  const error: InvokeInfraError = {
    kind: "invoke_infra",
    message: `invoke<${returnSchema}> return value failed validation`,
    callee_path: calleePath,
    cause: "return_validation",
  };
  return makeErr(error as unknown as ThetaValue);
}
