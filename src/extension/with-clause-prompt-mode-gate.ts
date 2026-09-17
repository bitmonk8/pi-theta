// RFC 0009 (invocation.md INV-8 static mode gate) — the call-site `with`
// clause's mode-gate refusal: the one decision both clause-bearing call
// surfaces inside `checkInvokeStaticResolution` (./invoke-static-checks.ts)
// apply identically — the inline `invoke(...)` loop and the delegated
// `.theta`-callable loop (`checkThetaCallableCallSurface`).
//
// PTQ-0364: split into its own module rather than living beside its two
// callers — invoke-static-checks.ts is over the D4 justify band (1000 LOC),
// so a helper shared only within that file is never grown there. This
// module holds `withClausePromptModeRefusal` alone; invoke-static-checks.ts
// imports it back like any other caller. `checkClauseCwdType`, the sibling
// INV-6 rule this mirrors (the clause's `cwd` value), stays behind in
// invoke-static-checks.ts, unmoved by this change.
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
