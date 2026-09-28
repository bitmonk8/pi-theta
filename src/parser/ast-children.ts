// Generic AST child enumeration — the direct child expressions of an `Expr`
// node and the direct expressions / nested blocks a `Stmt` exposes. Shared
// substrate for the sibling walkers (`./type-layer-walk`,
// `./type-layer-interpolation`, `./theta-document`); re-exported from
// `./type-layer-checks` so existing importers resolve unchanged.

import type { Block, Expr, Stmt } from "./theta-document";
import { callWithClauseValues } from "./theta-document";

/**
 * The direct child expressions of an expression node — shared by the `?`
 * operand scan here and by theta-document.ts's interpolation-form scan and
 * call-site node walk.
 */
function childExprs(e: Expr): readonly Expr[] {
  switch (e.kind) {
    case "binary":
      return [e.left, e.right];
    case "ternary":
      return [e.condition, e.consequent, e.alternate];
    case "try":
      return [e.operand];
    case "index":
      return [e.target, e.index];
    case "member":
      return [e.target];
    case "array":
      return e.elements;
    case "call":
    case "invoke":
      // RFC 0009: a `?` inside a call-site `with` clause value is scanned as one
      // inside an argument is.
      return [...e.args, ...callWithClauseValues(e)];
    case "object":
      return e.fields.map((f) => f.value);
    case "match":
      return [e.scrutinee, ...e.arms.map((arm) => arm.body)];
    case "result-ctor":
      return [e.arg];
    case "method-call":
      return [e.target, ...e.args];
    default:
      return [];
  }
}

/** The direct expressions a statement exposes (for the `?` scan). */
function stmtExprs(s: Stmt): readonly Expr[] {
  switch (s.kind) {
    case "let":
      return s.init !== null ? [s.init] : [];
    case "reassign":
      return [s.value];
    case "if":
    case "while":
      return [s.condition];
    case "for":
      return [s.iterand];
    case "return":
      return s.operand !== null ? [s.operand] : [];
    case "query":
      return [s.query];
    case "tool-call":
      return [s.call];
    case "invoke":
      return [s.invoke];
    case "expr":
      return [s.expr];
    default:
      return [];
  }
}

/** The nested blocks a statement contains (for the `?` scan). */
function stmtBlocks(s: Stmt): readonly Block[] {
  switch (s.kind) {
    case "if": {
      const blocks: Block[] = [s.then];
      if (s.otherwise !== null) {
        if ("statements" in s.otherwise) {
          blocks.push(s.otherwise);
        } else {
          blocks.push(...stmtBlocks(s.otherwise));
        }
      }
      return blocks;
    }
    case "while":
    case "for":
      return [s.body];
    default:
      // A nested `fn` owns its own `?`-scope; do not descend into it here.
      return [];
  }
}

export { childExprs, stmtBlocks, stmtExprs };
