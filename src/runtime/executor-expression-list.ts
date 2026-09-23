// V19c / V19c-T — the statement executor's expression-list evaluation rule.
//
// This module carries the ONE rule for evaluating a list of sub-expressions
// inside an outer expression (an array literal's elements, a method call's
// arguments): left-to-right evaluation through the supplied evaluator, with
// any non-`value` flow (a `?`-propagation, an effect `fail`, or a cancel)
// short-circuiting and carried verbatim. Shared so the expression forms that
// evaluate lists cannot drift apart on evaluation order or short-circuit
// disposition.
//
// Spec: expressions.md (left-to-right sub-expression evaluation).

import type { Expr } from "../parser/theta-document";
import type { EvalResult } from "./statement-executor-types";
import type { ThetaValue } from "./value";

/**
 * Evaluate `exprs` left-to-right through `evalOne`. The first non-`value`
 * flow short-circuits and is returned verbatim (`ok: false`); otherwise the
 * resolved values are returned in source order (`ok: true`).
 */
export async function evaluateExpressionList(
  exprs: readonly Expr[],
  evalOne: (expr: Expr) => Promise<EvalResult>,
): Promise<
  | { readonly ok: true; readonly values: ThetaValue[] }
  | { readonly ok: false; readonly flow: EvalResult }
> {
  const values: ThetaValue[] = [];
  for (const expr of exprs) {
    const evaluated = await evalOne(expr);
    if (evaluated.flow !== "value") {
      return { ok: false, flow: evaluated };
    }
    values.push(evaluated.value);
  }
  return { ok: true, values };
}
