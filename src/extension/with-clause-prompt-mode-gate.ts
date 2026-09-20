// RFC 0009 (invocation.md INV-8 static mode gate) — the call-site `with`
// clause's mode-gate refusal: the one decision both clause-bearing call
// surfaces apply identically — `checkInvokeExprCallSurface` in
// invoke-expr-call-surface.ts for `invoke(...)`, and
// `checkThetaCallableCallSurface` in invoke-static-checks.ts for `.theta`
// callables.
//
// PTQ-0364: extracted into this module to avoid growing invoke-static-checks.ts
// past the D4 justify band (1000 LOC). Both caller modules import
// `withClausePromptModeRefusal` here. `checkClauseCwdType`, the sibling
// INV-6 rule this mirrors (the clause's `cwd` value), remains in
// invoke-static-checks.ts.
//
// Spec: invocation.md INV-8, placeholder-rendering-b.md §7 (the `<callee>`
// rendering rule each caller's own comment states).

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import type { CallWithClause } from "../parser/theta-document";
import type { ThetaMode } from "../parser/frontmatter";
import {
  withClausePromptModeCalleeMessage,
  WITH_CLAUSE_PROMPT_MODE_CALLEE_CODE,
  WITH_CLAUSE_PROMPT_MODE_CALLEE_HINT,
} from "../parser/invoke-diagnostics";

/**
 * RFC 0009 (invocation.md INV-8 static mode gate): refuse a call-site `with`
 * clause on a statically-resolvable PROMPT-mode callee, before that site's
 * arity/type block — the one shared decision both clause-bearing surfaces
 * apply, mirroring `checkClauseCwdType`'s own surface-spanning shape for the
 * sibling INV-6 rule (invoke-static-checks.ts). `mode: undefined` means the
 * callee is not statically resolvable (the `invoke(...)` surface's own
 * possibility; the `.theta`-callable surface's callee is always statically
 * resolvable by the time its caller reaches this gate) and then no
 * diagnostic fires — the runtime validation arm owns that case (registry row
 * Trigger). `presented` renders as `<callee>`: the `invoke(...)` surface
 * passes the verbatim path literal (that IS the text at its own diagnostic
 * range) and the `.theta`-callable surface passes the presented callable
 * name (placeholder-rendering-b.md §7) — each caller's own existing
 * rendering rule, unchanged by this extraction.
 */
export function withClausePromptModeRefusal(input: {
  readonly clause?: CallWithClause;
  readonly mode: ThetaMode | undefined;
  readonly file: string;
  readonly range: SourceRange;
  readonly presented: string;
}): Diagnostic | undefined {
  if (input.clause === undefined || input.mode !== "prompt") {
    return undefined;
  }
  return {
    severity: "error",
    code: WITH_CLAUSE_PROMPT_MODE_CALLEE_CODE,
    file: input.file,
    range: input.range,
    message: withClausePromptModeCalleeMessage(input.presented),
    hint: WITH_CLAUSE_PROMPT_MODE_CALLEE_HINT,
  };
}
