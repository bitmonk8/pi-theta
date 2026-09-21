// Shared named-type classification for index receivers, built-in receivers,
// and expression operands.

import type { CompatType, NamedDecl } from "./type-compat";

/**
 * Classify a resolved named declaration: unknown names defer to the runtime
 * safety net; nominal object schemas use the caller's category.
 */
export function classifyNamedDecl<Category>(
  decl: NamedDecl | undefined,
  objectCategory: Category,
  classifyRhs: (rhs: CompatType) => Category,
): Category | "unknown" {
  if (decl === undefined) {
    return "unknown";
  }
  if (decl.kind === "object-schema") {
    return objectCategory;
  }
  // A transparent alias: classify its resolved RHS (TYPE-11).
  return classifyRhs(decl.rhs);
}
