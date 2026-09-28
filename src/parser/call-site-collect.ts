// Call-site bucketing over the parser's shared call-site walk
// (`walkCallSiteNodes`, theta-document.ts): one traversal of a theta body
// sorted into `invoke(...)`, `CallExpr`, `ObjectExpr` and `MemberExpr` arrays,
// consumed by the invoke/import/with-clause static checks.

import type {
  CallExpr,
  InvokeExpr,
  MemberExpr,
  ObjectExpr,
  ThetaBody,
} from "./theta-document";
import { walkCallSiteNodes } from "./theta-document";

/**
 * The four call-shaped node kinds the shared walk (`walkCallSiteNodes`,
 * `../parser/theta-document.ts`) visits in ONE traversal: every `invoke(...)`
 * expression, every `CallExpr` — a `.theta`-callable-call CANDIDATE whose
 * callee is resolved against the caller's frozen callable set by
 * `resolveThetaCallableCallSites`, not by this walk — every `ObjectExpr`
 * constructor site (bug 0429) and every `MemberExpr` (bug 0430). One walk
 * keeps all four call surfaces in lockstep across this module,
 * `extension-tool-reachability.ts`, `subagent-fn-static-checks.ts` and
 * `collectClauseBearingCalls`: a second, independently written walker would
 * drift out of sync as the `Expr` / `Stmt` node shapes evolve (bug 0071).
 * `checkInvokeStaticResolution` therefore traverses a body once and feeds
 * every one of its check loops from that one result.
 */
export interface CollectedCallSites {
  readonly invokeExprs: InvokeExpr[];
  readonly callExprs: CallExpr[];
  /**
   * Bug 0429: every `ObjectExpr` constructor site reachable in the body,
   * bare and named alike — filtered to named (`typeName !== null`) sites by
   * consumers, mirroring `callExprs`' own unresolved-collection-then-filter
   * shape rather than pre-filtering during the walk.
   */
  readonly objectExprs: ObjectExpr[];
  /**
   * Bug 0430: every `MemberExpr` (`target.field`) reachable in the body,
   * unfiltered — consumers test `target.kind === "ident"` themselves,
   * mirroring `objectExprs`' own unresolved-collection-then-filter shape.
   */
  readonly memberExprs: MemberExpr[];
}

/**
 * Run the shared call-site walk once (`CollectedCallSites`) over a theta
 * body. A `par for` body is an ordinary call-site region (control-flow.md
 * CTRL-4 admits `invoke(...)`, `.theta` callable calls, `subagent fn` calls
 * and Pi-tool calls inside it) and so is a `let`-RHS / match-arm-body block
 * (bug 0082 §Fix) — both must surface every one of INV-3 (arity, both call
 * surfaces), INV-1 (`invoke(...)` path-escape, invocation.md §Resolution),
 * `checkCalleeHasErrors`, and INV-4 (`buildInvokeGraph`'s cycle edges)
 * exactly as a statement-level occurrence would; the shared walk reaches both
 * without a per-check special case.
 */
export function collectCallSites(body: ThetaBody): CollectedCallSites {
  const out: CollectedCallSites = { invokeExprs: [], callExprs: [], objectExprs: [], memberExprs: [] };
  // `target.method(args)` (a `MethodCallExpr`) is a method call, not a
  // `.theta`-callable-call candidate — `method` names a stdlib member, never a
  // `tools:` name — so it has no case below and joins none of the four arrays;
  // `walkCallSiteNodes` still reaches its target and args, just uncollected.
  walkCallSiteNodes(body, (node) => {
    switch (node.kind) {
      case "invoke":
        out.invokeExprs.push(node);
        return;
      case "call":
        out.callExprs.push(node);
        return;
      case "object":
        // Bug 0429: the constructor NODE itself joins `objectExprs` (a bare
        // `{ … }` included — filtered by `typeName` downstream).
        out.objectExprs.push(node);
        return;
      case "member":
        // Bug 0430: the member NODE itself joins `memberExprs` (mirroring the
        // 0429 `object` arm's own-node-plus-descend shape).
        out.memberExprs.push(node);
        return;
    }
  });
  return out;
}
