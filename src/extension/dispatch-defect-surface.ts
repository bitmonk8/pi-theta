// Frame slash-dispatch runtime defects as theta-system-notes (error-model.md §"Runtime panics").

import {
  completePanicSite,
  HostFatal,
  isThetaPanic,
  renderPanicSuffixLines,
  surfaceUnexpectedThrow,
} from "../runtime/runtime-panics";
import { ToolReturnShapeDefectError } from "../runtime/tool-call-off-surface";
import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import type { ThetaCompositionInput, ThetaProducerDeps } from "./theta-composition-contract";

/**
 * The `internal error: ` prefix the runtime-defect surface
 * (`surfaceUnexpectedThrow`) and the `ToolReturnShapeDefectError.diagnostic`
 * both stamp onto their `message`. The slash-dispatch internal-error framing
 * (`theta /<name> aborted with internal error: <error.message>`,
 * code-registry-runtime.md `theta/runtime/internal-error`) carries the BARE
 * `error.message`, so the prefix is stripped when composing the framing to
 * avoid a doubled `internal error: internal error: …`.
 */
const INTERNAL_ERROR_PREFIX = "internal error: ";

/**
 * A synthesized zero-length body `SourceRange` for a bare `ThetaPanic`, which
 * carries no `SourceRange` of its own. A `ToolReturnShapeDefectError.diagnostic`
 * already carries a precise site and is preferred over this synthetic one.
 */
const ZERO_BODY_RANGE: SourceRange = {
  start: { line: 0, column: 0 },
  end: { line: 0, column: 0 },
} as const;

/**
 * Surface a runtime defect thrown at slash dispatch as ONE framed
 * `theta-system-note` (error-model.md §"Runtime panics"): `details:
 * { diagnostics: [Diagnostic] }`, `display: true`, `triggerTurn: false`, session
 * NOT torn down. Shared by the dispatch-site setup wrap's catch and the
 * top-level drive catch so both routes to the runtime-defect surface frame the
 * note identically. `HostFatal` propagates (NOCEIL-3 fail-fast) and never
 * reaches `emitPanicNote`.
 */
function surfaceDispatchDefect(
  thrown: unknown,
  theta: ThetaCompositionInput,
  deps: ThetaProducerDeps,
): void {
  if (thrown instanceof HostFatal) {
    // NOCEIL-3 (hard-ceilings): a host fatal is the ONLY thing that propagates —
    // re-raise it (fail-fast); it never reaches `emitPanicNote`.
    throw thrown;
  }
  const site = { file: theta.sourcePath ?? theta.slashName, range: ZERO_BODY_RANGE };
  if (isThetaPanic(thrown)) {
    // Two-phase site completion (bug 0476 §Fix, BLOCKER A): the pure host
    // evaluator (production-theta-producer.ts) knows the raising node's range
    // but not the top-level body's on-disk file, so it records a PENDING range
    // via `attachPanicRange`. THIS is the one place that knows the top-level
    // file (the theta's own source path is the correct file for the
    // top-level body — a `.thetalib` leaf frame already carries its own
    // residence via `attachPanicSite`/`pushPanicFrame`'s explicit `file`), so
    // complete the site BEFORE building the diagnostic/suffix below — every
    // downstream read of `thrown.site` / `thrown.frames[*].file` must see the
    // completed values.
    completePanicSite(thrown, theta.sourcePath ?? theta.slashName);
    // ThetaPanic framing (error-model.md §"Runtime panics"; §"Panic site
    // suffix (normative)", bug 0476 §Fix; BLOCKER B): the diagnostic's
    // `file`/`range` come from the panic's own SITE, attached at the
    // innermost raise — the zero body range is now a defensive fallback for a
    // panic that reached this catch with no site (no shipped construction
    // seam leaves one unattached; see the bug 0476 tripwire witness).
    // `renderPanicSuffixLines` renders NOTHING — no `hint`, no note suffix —
    // when `thrown.site` is `undefined`, even if `thrown.frames` is
    // non-empty: frames render only UNDER a site (BLOCKER B / option (a)), so
    // a site-less panic's open frames are never surfaced.
    const panicSite = thrown.site ?? site;
    const suffixLines = renderPanicSuffixLines(thrown);
    const diagnostic: Diagnostic = {
      severity: "error",
      code: thrown.code,
      file: panicSite.file,
      range: panicSite.range,
      message: thrown.message,
      ...(suffixLines.length > 0 ? { hint: suffixLines.join("\n") } : {}),
    };
    const suffix = suffixLines.map((line) => `\n  ${line}`).join("");
    deps.emitPanicNote(`theta /${theta.slashName} aborted: ${thrown.message}${suffix}`, diagnostic);
    return;
  }
  // internal-error framing: a `ToolReturnShapeDefectError` already carries a
  // precise-site `theta/runtime/internal-error` diagnostic (prefer it);
  // otherwise `surfaceUnexpectedThrow` builds one for the generic throw. Both
  // stamp the `internal error: <msg>` prefix onto the diagnostic message; the
  // framing (code-registry-runtime.md `theta/runtime/internal-error`) carries
  // the BARE `<error.message>`, so the prefix is stripped before composing
  // `… aborted with internal error: <msg>`.
  const diagnostic =
    thrown instanceof ToolReturnShapeDefectError
      ? thrown.diagnostic
      : surfaceUnexpectedThrow(thrown, site);
  if (diagnostic === undefined) {
    // Defensive (unreachable): `surfaceUnexpectedThrow` returns `undefined` only
    // for a `ThetaPanic` / `HostFatal`, both handled above. Re-raise rather than
    // fabricate a note, preserving fail-fast.
    throw thrown;
  }
  const detail = diagnostic.message.startsWith(INTERNAL_ERROR_PREFIX)
    ? diagnostic.message.slice(INTERNAL_ERROR_PREFIX.length)
    : diagnostic.message;
  deps.emitPanicNote(
    `theta /${theta.slashName} aborted with internal error: ${detail}`,
    diagnostic,
  );
}

export { surfaceDispatchDefect };
