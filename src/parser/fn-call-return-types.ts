// Written ordinary-fn call values, collected in the declaring file only.
import type { Stmt } from "./theta-document";
import type { CompatType } from "./type-compat";
import { collectTopLevelFns } from "./functions";
import { annotationSourceIsNotTypeExpression } from "./annotation-validation";
import { annotationToCompatType } from "./annotation-compat";

/**
 * Hoisted same-file annotations, excluding every conservatively shadowed name.
 * Subagent annotations constrain boundary success payloads, not call values
 * (FN-6). Imported and annotation-less returns need separate analysis; never
 * infer them here. Keep the shared converter's nominal/structural limits.
 */
export function collectFnCallReturnTypes(
  statements: readonly Stmt[],
  shadowedNames: ReadonlySet<string>,
): ReadonlyMap<string, CompatType> {
  const types = new Map<string, CompatType>();
  for (const [name, fn] of collectTopLevelFns(statements)) {
    if (fn.subagent || shadowedNames.has(name) || fn.returnType === null ||
        annotationSourceIsNotTypeExpression(fn.returnType)) {
      continue;
    }
    // FN-4: an ordinary void call discards its tail and yields literal null.
    const type: CompatType | undefined = fn.returnType.trim() === "void"
      ? { kind: "literal", typesAs: "null" }
      : annotationToCompatType(fn.returnType);
    if (type !== undefined) types.set(name, type);
  }
  return types;
}
