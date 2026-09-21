// Shared type-layer iterand contract for sequential and parallel loops.

import type { Diagnostic } from "../diagnostics/diagnostic";
import { containsWithheldBinderType } from "./compat-type-traversal";
import { checkForIterand, type ControlFlowSite } from "./control-flow";
import type { CompatType, TypeEnv } from "./type-compat";

/**
 * CTRL-2 / grammar.md: the `par-for` iterand reuses the `for` contract — a
 * non-`array<T>` iterand is `theta/parse/non-array-iterand`.
 * `checkForIterand` refuses every non-`array<T>` iterand, an
 * unresolvable `named` included (./control-flow.ts), so it is
 * the one row that cannot defer on a withheld read by itself: the
 * verdict is withheld here instead. A `for` body inside another binder's
 * scope reaches this with the enclosing binder's withheld entry.
 */
export function checkIterand(
  iterandType: CompatType,
  site: ControlFlowSite,
  env: TypeEnv,
  diagnostics: Diagnostic[],
): void {
  const diag = containsWithheldBinderType(iterandType)
    ? undefined
    : checkForIterand({ type: iterandType }, site, env);
  if (diag !== undefined) {
    diagnostics.push(diag);
  }
}
