// CTRL-4 `par for` body-restriction scan: post-parse diagnostics over a parsed
// `par for` body (control-flow.md CTRL-4).

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { Block, Expr, Stmt } from "./theta-ast";
import { callWithClauseValues } from "./theta-document";

/** The (diagnostics sink, file name) pair the scan reports into. */
export interface ParForScanContext {
readonly diagnostics: Diagnostic[];
readonly file: string;
}

/**
 * Emit the CTRL-4 body-restriction diagnostics over a parsed `par for` body:
 *   - an `@`-query against the enclosing conversation → `par-query-in-body`;
 *   - a reassignment to an outer `let mut` binding → `par-shared-mutation`;
 *   - a `break` / `continue` targeting the `par for` → `par-break-continue`;
 *   - a `return` statement, at any body depth → `par-return-in-body`.
 * A nested `par for` emits its own diagnostics during its own parse, so this
 * walk does not descend into a nested `par-for` body (only its iterand / max,
 * which evaluate in this body's scope).
 */
export function emitParForBodyDiagnostics(
  sink: ParForScanContext,
  body: Block,
  outerMutables: ReadonlySet<string>,
  loopVariable: string,
): void {
  const bodyLocals = new Set<string>();
  // The loop variable is a fresh per-iteration binding local to the body, not
  // the outer mutable it may shadow: a write to it is a write to that fresh
  // immutable binding (drawing `immutable-rebinding`, bug 0370 §Fix F1), never
  // a `par-shared-mutation` against the shadowed outer slot. Counting it as a
  // body-local keeps the shared-mutation scan from double-coding a
  // loop-variable write that shadows an outer `let mut` of the same name.
  if (loopVariable !== "_") {
    bodyLocals.add(loopVariable);
  }
  scanParForBlock(sink, body, outerMutables, bodyLocals, 0);
}

function scanParForBlock(
  sink: ParForScanContext,
  block: Block,
  outerMutables: ReadonlySet<string>,
  bodyLocals: Set<string>,
  loopDepth: number,
): void {
  for (const s of block.statements) {
    scanParForStmt(sink, s, outerMutables, bodyLocals, loopDepth);
  }
  if (block.tail !== null) {
    scanParForExpr(sink, block.tail, outerMutables, bodyLocals, loopDepth);
  }
}

function scanParForStmt(
  sink: ParForScanContext,
  s: Stmt,
  outerMutables: ReadonlySet<string>,
  bodyLocals: Set<string>,
  loopDepth: number,
): void {
  switch (s.kind) {
    case "let":
      if (s.init !== null) {
        scanParForExpr(sink, s.init, outerMutables, bodyLocals, loopDepth);
      }
      if (s.name !== "_") {
        bodyLocals.add(s.name);
      }
      return;
    case "reassign":
      if (outerMutables.has(s.target) && !bodyLocals.has(s.target)) {
        sink.diagnostics.push({
          severity: "error",
          code: "theta/parse/par-shared-mutation",
          file: sink.file,
          range: s.range,
          message: `cannot assign to outer binding '${s.target}' from inside a 'par for' body`,
        });
      }
      scanParForExpr(sink, s.value, outerMutables, bodyLocals, loopDepth);
      return;
    case "break":
    case "continue":
      // Legal only when it targets a plain `for` / `while` nested inside the
      // body; a `break` / `continue` targeting the `par for` itself has no
      // defined meaning under concurrent scheduling (CTRL-4).
      if (loopDepth === 0) {
        sink.diagnostics.push({
          severity: "error",
          code: "theta/parse/par-break-continue",
          file: sink.file,
          range: s.range,
          message: `'${s.kind}' is not permitted inside a 'par for' body`,
        });
      }
      return;
    case "if":
      scanParForExpr(sink, s.condition, outerMutables, bodyLocals, loopDepth);
      // The `then` block runs in a child scope at runtime (`executeIf` ->
      // `env.child()`), so a COPY of `bodyLocals` keeps a `let` declared
      // inside it from masking a sibling statement's shared-mutation
      // refusal once the block ends (mirrors the block-expression arm
      // below).
      scanParForBlock(sink, s.then, outerMutables, new Set(bodyLocals), loopDepth);
      if (s.otherwise !== null) {
        if ("statements" in s.otherwise) {
          // Same child-scope reasoning as `then`: an `else` block's `let`s
          // must not leak into statements after the `if`.
          scanParForBlock(sink, s.otherwise, outerMutables, new Set(bodyLocals), loopDepth);
        } else {
          scanParForStmt(sink, s.otherwise, outerMutables, bodyLocals, loopDepth);
        }
      }
      return;
    case "while":
      scanParForExpr(sink, s.condition, outerMutables, bodyLocals, loopDepth);
      // The loop body runs in a child scope per iteration, so copy
      // `bodyLocals` for the same reason as the `if` arms above.
      scanParForBlock(sink, s.body, outerMutables, new Set(bodyLocals), loopDepth + 1);
      return;
    case "for":
      scanParForExpr(sink, s.iterand, outerMutables, bodyLocals, loopDepth);
      // The loop body runs in a child scope per iteration, so copy
      // `bodyLocals` for the same reason as the `if` arms above.
      scanParForBlock(sink, s.body, outerMutables, new Set(bodyLocals), loopDepth + 1);
      return;
    case "query":
      sink.diagnostics.push({
        severity: "error",
        code: "theta/parse/par-query-in-body",
        file: sink.file,
        range: s.range,
        message:
          "`@` query against the enclosing conversation is not permitted inside a 'par for' body",
      });
      return;
    case "tool-call":
      scanParForExpr(sink, s.call, outerMutables, bodyLocals, loopDepth);
      return;
    case "invoke":
      scanParForExpr(sink, s.invoke, outerMutables, bodyLocals, loopDepth);
      return;
    case "expr":
      scanParForExpr(sink, s.expr, outerMutables, bodyLocals, loopDepth);
      return;
    case "return":
      // Refused at EVERY depth, unlike `break` / `continue` above: those stay
      // inside the loop they target when nested (depth > 0 admits them), but
      // a `return` inside a nested plain `for` / `while` crosses that inner
      // loop's boundary (the runtime propagates it outward) and is only
      // consumed at the `par for` boundary — so `loopDepth` is not consulted
      // here. Emitted before the operand walk so a query nested in the
      // operand still draws its own `par-query-in-body` refusal below.
      sink.diagnostics.push({
        severity: "error",
        code: "theta/parse/par-return-in-body",
        file: sink.file,
        range: s.range,
        message: "'return' is not permitted inside a 'par for' body",
      });
      if (s.operand !== null) {
        scanParForExpr(sink, s.operand, outerMutables, bodyLocals, loopDepth);
      }
      return;
    default:
      // fn / schema / enum / import / export / doc-comment carry no
      // enclosing-conversation body restriction to check.
      return;
  }
}

function scanParForExpr(
  sink: ParForScanContext,
  e: Expr,
  outerMutables: ReadonlySet<string>,
  bodyLocals: Set<string>,
  loopDepth: number,
): void {
  switch (e.kind) {
    case "block":
      // A block expression carries a whole statement list, so the CTRL-4
      // body restrictions have to reach inside it. It is not a loop, so
      // `loopDepth` is unchanged and a `break` / `continue` in it still
      // targets the `par for`. Its `let`s bind in a child scope (the runtime
      // evaluates the body in `env.child()`), so a COPY of `bodyLocals`
      // keeps them from masking a sibling's shared-mutation refusal.
      scanParForBlock(sink, e.body, outerMutables, new Set(bodyLocals), loopDepth);
      return;
    case "query":
      sink.diagnostics.push({
        severity: "error",
        code: "theta/parse/par-query-in-body",
        file: sink.file,
        range: e.range,
        message:
          "`@` query against the enclosing conversation is not permitted inside a 'par for' body",
      });
      return;
    case "par-for":
      // A nested `par for` emits its own body diagnostics; its iterand / max
      // evaluate in THIS body's scope, so scan those but not its body.
      scanParForExpr(sink, e.iterand, outerMutables, bodyLocals, loopDepth);
      if (e.max !== null) {
        scanParForExpr(sink, e.max, outerMutables, bodyLocals, loopDepth);
      }
      return;
    case "try":
      scanParForExpr(sink, e.operand, outerMutables, bodyLocals, loopDepth);
      return;
    case "binary":
      scanParForExpr(sink, e.left, outerMutables, bodyLocals, loopDepth);
      scanParForExpr(sink, e.right, outerMutables, bodyLocals, loopDepth);
      return;
    case "ternary":
      scanParForExpr(sink, e.condition, outerMutables, bodyLocals, loopDepth);
      scanParForExpr(sink, e.consequent, outerMutables, bodyLocals, loopDepth);
      scanParForExpr(sink, e.alternate, outerMutables, bodyLocals, loopDepth);
      return;
    case "call":
    case "invoke":
      // RFC 0009: the clause value is walked as an argument is.
      for (const arg of [...e.args, ...callWithClauseValues(e)]) {
        scanParForExpr(sink, arg, outerMutables, bodyLocals, loopDepth);
      }
      return;
    case "member":
      scanParForExpr(sink, e.target, outerMutables, bodyLocals, loopDepth);
      return;
    case "index":
      scanParForExpr(sink, e.target, outerMutables, bodyLocals, loopDepth);
      scanParForExpr(sink, e.index, outerMutables, bodyLocals, loopDepth);
      return;
    case "method-call":
      scanParForExpr(sink, e.target, outerMutables, bodyLocals, loopDepth);
      for (const arg of e.args) {
        scanParForExpr(sink, arg, outerMutables, bodyLocals, loopDepth);
      }
      return;
    case "object":
      for (const field of e.fields) {
        scanParForExpr(sink, field.value, outerMutables, bodyLocals, loopDepth);
      }
      return;
    case "array":
      for (const el of e.elements) {
        scanParForExpr(sink, el, outerMutables, bodyLocals, loopDepth);
      }
      return;
    case "result-ctor":
      scanParForExpr(sink, e.arg, outerMutables, bodyLocals, loopDepth);
      return;
    case "match":
      scanParForExpr(sink, e.scrutinee, outerMutables, bodyLocals, loopDepth);
      for (const arm of e.arms) {
        scanParForExpr(sink, arm.body, outerMutables, bodyLocals, loopDepth);
      }
      return;
    default:
      // ident / number / string / bool / null — no query / nested par-for.
      return;
  }
}
