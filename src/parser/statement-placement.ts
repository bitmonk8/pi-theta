// Statement-placement parse checker for the V19a parser seam
// (theta-document.ts): the recursive walk that refuses a from-bearing
// `export … from` / `import … from` statement at a position its host does not
// admit (bugs 0446/0447 §Fix Option 1 — `theta/parse/export-in-theta`,
// `theta/parse/export-not-top-level`, `theta/parse/import-not-top-level`).

import type { Diagnostic } from "../diagnostics/diagnostic";
import {
  EXPORT_IN_THETA_CODE,
  EXPORT_IN_THETA_HINT,
  EXPORT_IN_THETA_MESSAGE,
  EXPORT_NOT_TOP_LEVEL_CODE,
  EXPORT_NOT_TOP_LEVEL_HINT,
  EXPORT_NOT_TOP_LEVEL_MESSAGE,
  IMPORT_NOT_TOP_LEVEL_CODE,
  IMPORT_NOT_TOP_LEVEL_HINT,
  IMPORT_NOT_TOP_LEVEL_MESSAGE,
} from "./imports";
import type { Block, Expr, Stmt } from "./theta-ast";
// Shared document-seam helper (theta-document.ts's own export-block comment:
// sibling modules call them only during parsing, never during module
// initialisation — the same two-way seam ident-resolution.ts already rides).
import { callWithClauseValues } from "./theta-document";

/**
 * Check a from-bearing `export … from` / `import … from` statement's
 * PLACEMENT at every depth reachable from the document body AST, in both
 * hosts:
 *
 * - `export … from` (bug 0446 §Fix Option 1, widening bug 0431's
 *   top-level-only `.theta` refusal to the same recursive reach a nested
 *   position needs):
 *   - `.theta` host: `theta/parse/export-in-theta` at ANY depth — top level
 *     included — reusing bug 0431's code/message/hint unchanged. A `.theta`
 *     file is never importable regardless of where the statement sits, so
 *     one code covers every depth.
 *   - `.thetalib` host: `theta/parse/export-not-top-level` at a NESTED
 *     position only. A `.thetalib` top-level export stays legal (imports.md
 *     §Re-exports); nothing is emitted there.
 * - `import … from` (bug 0447 §Fix Option 1, the import sibling): a NESTED
 *   position draws `theta/parse/import-not-top-level` in EITHER host — no
 *   host split, unlike the export form. A nested import is never resolved
 *   (its path is never read by the load pass) or bound (its symbols never
 *   enter any scope) in a `.theta` or a `.thetalib` alike. A top-level
 *   import stays legal in both hosts (imports.md §Import statements) —
 *   nothing is emitted there.
 *
 * The descent mirrors the structural walker's own reach (`walkStatement` /
 * `walkBlock` / `walkExpr` above) — every `if`/`while`/`for`/`fn` body, every
 * `par for` body, every `subagent fn` `with`-clause value, and every
 * block-expression an arbitrarily nested expression tree can carry — so a
 * nested `export`/`import` cannot hide one level deeper in the document body
 * AST than this walk looks. Reach stops at the document body AST: a `query`
 * template's text is re-lexed by a separate throwaway parse this walk does
 * not traverse, so a statement hidden in a `${…}` interpolation is not
 * reached here. The from-less forms (`export { X }`, bug 0058's settled
 * ground; a from-less `import` is itself a shape fault,
 * `theta/parse/import-missing-from-clause`) are untouched at every depth —
 * their `path` is empty. Neither the ImportDecl nor the ExportDecl node is
 * otherwise altered, so the shape / reserved-keyword rules that also read
 * them keep firing on the same statement.
 */
export function checkStatementPlacement(block: Block, file: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const isThetaLib = file.endsWith(".thetalib");
  walkBlockForStatementPlacement(block, true, file, isThetaLib, diagnostics);
  return diagnostics;
}

function walkBlockForStatementPlacement(
  block: Block,
  topLevel: boolean,
  file: string,
  isThetaLib: boolean,
  out: Diagnostic[],
): void {
  for (const stmt of block.statements) {
    if (stmt.kind === "export" && stmt.path !== "") {
      if (!isThetaLib) {
        out.push({
          severity: "error",
          code: EXPORT_IN_THETA_CODE,
          file,
          range: stmt.range,
          message: EXPORT_IN_THETA_MESSAGE,
          hint: EXPORT_IN_THETA_HINT,
        });
      } else if (!topLevel) {
        out.push({
          severity: "error",
          code: EXPORT_NOT_TOP_LEVEL_CODE,
          file,
          range: stmt.range,
          message: EXPORT_NOT_TOP_LEVEL_MESSAGE,
          hint: EXPORT_NOT_TOP_LEVEL_HINT,
        });
      }
    } else if (stmt.kind === "import" && stmt.path !== "" && !topLevel) {
      out.push({
        severity: "error",
        code: IMPORT_NOT_TOP_LEVEL_CODE,
        file,
        range: stmt.range,
        message: IMPORT_NOT_TOP_LEVEL_MESSAGE,
        hint: IMPORT_NOT_TOP_LEVEL_HINT,
      });
    }
    walkStatementForStatementPlacement(stmt, file, isThetaLib, out);
  }
  if (block.tail !== null) {
    walkExprForStatementPlacement(block.tail, file, isThetaLib, out);
  }
}

function walkStatementForStatementPlacement(
  stmt: Stmt,
  file: string,
  isThetaLib: boolean,
  out: Diagnostic[],
): void {
  switch (stmt.kind) {
    case "let":
      if (stmt.init !== null) {
        walkExprForStatementPlacement(stmt.init, file, isThetaLib, out);
      }
      return;
    case "reassign":
      walkExprForStatementPlacement(stmt.value, file, isThetaLib, out);
      return;
    case "if":
      walkExprForStatementPlacement(stmt.condition, file, isThetaLib, out);
      walkBlockForStatementPlacement(stmt.then, false, file, isThetaLib, out);
      if (stmt.otherwise !== null) {
        if ("statements" in stmt.otherwise) {
          walkBlockForStatementPlacement(stmt.otherwise, false, file, isThetaLib, out);
        } else {
          walkStatementForStatementPlacement(stmt.otherwise, file, isThetaLib, out);
        }
      }
      return;
    case "while":
      walkExprForStatementPlacement(stmt.condition, file, isThetaLib, out);
      walkBlockForStatementPlacement(stmt.body, false, file, isThetaLib, out);
      return;
    case "for":
      walkExprForStatementPlacement(stmt.iterand, file, isThetaLib, out);
      walkBlockForStatementPlacement(stmt.body, false, file, isThetaLib, out);
      return;
    case "fn":
      walkBlockForStatementPlacement(stmt.body, false, file, isThetaLib, out);
      // A `subagent fn`'s `with { … }` field values are nested expression
      // positions on the main document AST, so a from-bearing export hidden
      // in one is inert unless walked here.
      for (const field of stmt.withClause ?? []) {
        walkExprForStatementPlacement(field.value, file, isThetaLib, out);
      }
      return;
    case "return":
      if (stmt.operand !== null) {
        walkExprForStatementPlacement(stmt.operand, file, isThetaLib, out);
      }
      return;
    case "query":
      walkExprForStatementPlacement(stmt.query, file, isThetaLib, out);
      return;
    case "tool-call":
      walkExprForStatementPlacement(stmt.call, file, isThetaLib, out);
      return;
    case "invoke":
      walkExprForStatementPlacement(stmt.invoke, file, isThetaLib, out);
      return;
    case "expr":
      walkExprForStatementPlacement(stmt.expr, file, isThetaLib, out);
      return;
    default:
      // `break` / `continue` / `schema` / `enum` / `import` / `export` /
      // `doc-comment` carry no nested Block or Expr this walk needs to reach.
      return;
  }
}

function walkExprForStatementPlacement(
  e: Expr,
  file: string,
  isThetaLib: boolean,
  out: Diagnostic[],
): void {
  switch (e.kind) {
    case "array":
      for (const el of e.elements) {
        walkExprForStatementPlacement(el, file, isThetaLib, out);
      }
      return;
    case "binary":
      walkExprForStatementPlacement(e.left, file, isThetaLib, out);
      walkExprForStatementPlacement(e.right, file, isThetaLib, out);
      return;
    case "ternary":
      walkExprForStatementPlacement(e.condition, file, isThetaLib, out);
      walkExprForStatementPlacement(e.consequent, file, isThetaLib, out);
      walkExprForStatementPlacement(e.alternate, file, isThetaLib, out);
      return;
    case "try":
      walkExprForStatementPlacement(e.operand, file, isThetaLib, out);
      return;
    case "call":
    case "invoke":
      // RFC 0009: a call-site `with` clause value is an expression position with
      // an argument's exact rules, so it is walked beside the arguments.
      for (const arg of [...e.args, ...callWithClauseValues(e)]) {
        walkExprForStatementPlacement(arg, file, isThetaLib, out);
      }
      return;
    case "member":
      walkExprForStatementPlacement(e.target, file, isThetaLib, out);
      return;
    case "index":
      walkExprForStatementPlacement(e.target, file, isThetaLib, out);
      walkExprForStatementPlacement(e.index, file, isThetaLib, out);
      return;
    case "object":
      for (const field of e.fields) {
        walkExprForStatementPlacement(field.value, file, isThetaLib, out);
      }
      return;
    case "match":
      walkExprForStatementPlacement(e.scrutinee, file, isThetaLib, out);
      for (const arm of e.arms) {
        walkExprForStatementPlacement(arm.body, file, isThetaLib, out);
      }
      return;
    case "result-ctor":
      walkExprForStatementPlacement(e.arg, file, isThetaLib, out);
      return;
    case "method-call":
      walkExprForStatementPlacement(e.target, file, isThetaLib, out);
      for (const arg of e.args) {
        walkExprForStatementPlacement(arg, file, isThetaLib, out);
      }
      return;
    case "par-for":
      walkExprForStatementPlacement(e.iterand, file, isThetaLib, out);
      if (e.max !== null) {
        walkExprForStatementPlacement(e.max, file, isThetaLib, out);
      }
      walkBlockForStatementPlacement(e.body, false, file, isThetaLib, out);
      return;
    case "block":
      walkBlockForStatementPlacement(e.body, false, file, isThetaLib, out);
      return;
    default:
      // ident / number / string / bool / null / query — no nested Block or
      // Expr on this document-body AST for the walk to reach. A `query`
      // template's text is a raw string re-lexed as a separate throwaway
      // parse (`parseInterpolationSource`) that this walk does not traverse;
      // a `${…}` interpolation can admit a `par for` whose body is a
      // statement block, so a statement hidden there is not reached here and
      // is a separate follow-up concern outside bug 0446/0447's seam.
      return;
  }
}
