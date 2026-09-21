// Whole-body local-binder collection for conservative callee resolution.
// Withholding can suppress a diagnostic, never manufacture one.

import type { Block, Expr, Stmt, ThetaBody } from "./theta-document";
import { callWithClauseValues } from "./theta-document";
import { collectPatternBinderNames } from "./match-result";

/**
 * A whole-file over-approximation of every name a LOCAL binder can bind,
 * anywhere in `body`: the frontmatter `params:` field wire names
 * (`paramsFieldNames`), every `let` name, every `for` / `par for` loop
 * variable, every `match`-arm pattern binding, and every `fn` parameter name —
 * including an UNANNOTATED one. Recursive over every statement, block and
 * expression the grammar admits, a nested `fn` body included.
 *
 * expressions.md §"Identifier resolution" ranks `local > fn > import >
 * callable`, so a call of a locally bound name is not a user-`fn` call; but
 * `TypeLayerWalk`'s own `bindings` map is still not a complete local view. A
 * frontmatter `params:` field's declared type reaches it now (bug 0192 §Fix
 * seeds the root map from the same records this function's caller derives
 * `paramsFieldNames` from — `paramsFieldBindings`), but it still holds the
 * binder classes this layer cannot type (a match-arm binding, an unannotated
 * `fn` parameter, a loop variable whose iterand is not an `array<T>` — the
 * `array` case carries the iterand's element type, bug 0126 §Fix) as WITHHELD
 * entries rather than as judged types (`recordWithheldBinders`) — so
 * resolution is withheld for any name bound as a local ANYWHERE in the file.
 * Withholding can only suppress an emission, never produce one, the asymmetry
 * this module's header already states.
 */
export function collectLocalBinderNames(
  body: ThetaBody,
  paramsFieldNames: readonly string[],
): ReadonlySet<string> {
  const names = new Set<string>(paramsFieldNames);
  walkBlockForLocalBinders(body, names);
  return names;
}

function walkBlockForLocalBinders(block: Block, names: Set<string>): void {
  for (const stmt of block.statements) {
    walkStmtForLocalBinders(stmt, names);
  }
  if (block.tail !== null) {
    walkExprForLocalBinders(block.tail, names);
  }
}

function walkStmtForLocalBinders(stmt: Stmt, names: Set<string>): void {
  switch (stmt.kind) {
    case "let":
      names.add(stmt.name);
      if (stmt.init !== null) {
        walkExprForLocalBinders(stmt.init, names);
      }
      return;
    case "reassign":
      walkExprForLocalBinders(stmt.value, names);
      return;
    case "if":
      walkExprForLocalBinders(stmt.condition, names);
      walkBlockForLocalBinders(stmt.then, names);
      if (stmt.otherwise !== null) {
        if ("statements" in stmt.otherwise) {
          walkBlockForLocalBinders(stmt.otherwise, names);
        } else {
          walkStmtForLocalBinders(stmt.otherwise, names);
        }
      }
      return;
    case "while":
      walkExprForLocalBinders(stmt.condition, names);
      walkBlockForLocalBinders(stmt.body, names);
      return;
    case "for":
      names.add(stmt.variable);
      walkExprForLocalBinders(stmt.iterand, names);
      walkBlockForLocalBinders(stmt.body, names);
      return;
    case "fn":
      for (const p of stmt.params) {
        names.add(p.name);
      }
      walkBlockForLocalBinders(stmt.body, names);
      return;
    case "return":
      if (stmt.operand !== null) {
        walkExprForLocalBinders(stmt.operand, names);
      }
      return;
    case "query":
      walkExprForLocalBinders(stmt.query, names);
      return;
    case "tool-call":
      walkExprForLocalBinders(stmt.call, names);
      return;
    case "invoke":
      walkExprForLocalBinders(stmt.invoke, names);
      return;
    case "expr":
      walkExprForLocalBinders(stmt.expr, names);
      return;
    default:
      // break / continue / schema / enum / import / export / doc-comment —
      // no local binder, no nested expression.
      return;
  }
}

function walkExprForLocalBinders(expr: Expr, names: Set<string>): void {
  switch (expr.kind) {
    case "ternary":
      walkExprForLocalBinders(expr.condition, names);
      walkExprForLocalBinders(expr.consequent, names);
      walkExprForLocalBinders(expr.alternate, names);
      return;
    case "binary":
      walkExprForLocalBinders(expr.left, names);
      walkExprForLocalBinders(expr.right, names);
      return;
    case "try":
      walkExprForLocalBinders(expr.operand, names);
      return;
    case "array":
      for (const el of expr.elements) {
        walkExprForLocalBinders(el, names);
      }
      return;
    case "index":
      walkExprForLocalBinders(expr.target, names);
      walkExprForLocalBinders(expr.index, names);
      return;
    case "member":
      walkExprForLocalBinders(expr.target, names);
      return;
    case "object":
      for (const field of expr.fields) {
        walkExprForLocalBinders(field.value, names);
      }
      return;
    case "match":
      walkExprForLocalBinders(expr.scrutinee, names);
      for (const arm of expr.arms) {
        collectPatternBinderNames(arm.pattern, names);
        walkExprForLocalBinders(arm.body, names);
      }
      return;
    case "result-ctor":
      walkExprForLocalBinders(expr.arg, names);
      return;
    case "method-call":
      walkExprForLocalBinders(expr.target, names);
      for (const arg of expr.args) {
        walkExprForLocalBinders(arg, names);
      }
      return;
    case "call":
    case "invoke":
      // RFC 0009: a call-site `with` clause value is an expression position with
      // an argument's exact rules, so a binder inside one is collected too.
      for (const arg of [...expr.args, ...callWithClauseValues(expr)]) {
        walkExprForLocalBinders(arg, names);
      }
      return;
    case "par-for":
      names.add(expr.variable);
      walkExprForLocalBinders(expr.iterand, names);
      if (expr.max !== null) {
        walkExprForLocalBinders(expr.max, names);
      }
      walkBlockForLocalBinders(expr.body, names);
      return;
    case "block":
      walkBlockForLocalBinders(expr.body, names);
      return;
    default:
      // ident / number / string / bool / null — no local binder, no nested
      // expression.
      return;
  }
}
