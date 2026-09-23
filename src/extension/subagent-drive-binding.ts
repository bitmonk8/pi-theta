// RFC-0006 subagent drive/teardown binding for the production theta producer:
// `buildSubagentDriveBinding` wires a launched subagent child process's drive
// loop, cancellation detach, placement-lease release, params-file cleanup and
// bounded-kill teardown into a `ConversationBinding`. Split out of
// callable-lowering.ts (PTQ-1436); that module re-exports the name so existing
// importers resolve unchanged.

import { runSubagentChildTeardown } from "../runtime/subagent-isolation";
import type { PlacementLease } from "../runtime/subagent-placement-selection";
import {
  attachSubagentCancellation,
  driveSubagentChild,
  type SubagentInvocationResult,
} from "../runtime/subagent-json-driver";
import type { EnumTagEntry, FnTail } from "../runtime/subagent-envelope";
import type { RuntimeRoot } from "../runtime-root";
import type { ActiveInvocationTicket } from "../runtime/active-invocation-registry";
import type {
  ConversationBinding,
  ConversationBindInput,
} from "./theta-composition-producer";
import type { InvokeResultSource } from "../runtime/invoke-cancellation";
import { makeErr, makeOk, type ResultValue, type ThetaValue } from "../runtime/value";
import type { Diagnostic } from "../diagnostics/diagnostic";

/** Build the launched child's drive/provenance closures and idempotent teardown. */
export function buildSubagentDriveBinding({
  child, thetaAbort, theta, emitDiagnostic, detachChildTap, placementLease,
  paramsCleanup, cancellation, ticket, root, finishInvocation,
}: {
  child: Parameters<typeof driveSubagentChild>[0]["child"];
  thetaAbort: AbortController;
  theta: ConversationBindInput["theta"];
  emitDiagnostic: (diagnostic: Diagnostic) => void;
  detachChildTap: (() => void) | undefined;
  placementLease: PlacementLease;
  paramsCleanup: () => void;
  cancellation: ReturnType<typeof attachSubagentCancellation>;
  ticket: ActiveInvocationTicket;
  root: RuntimeRoot;
  finishInvocation: () => void;
}): ConversationBinding {
    /**
     * PIC-59. Await the child's `theta_result` envelope (stray-line tolerant) and
     * map `ok`/`err` to the invocation `Result`. A child that exits WITHOUT an
     * envelope maps fail-closed to Err(InvokeInfraError{cause:"internal_error"}).
     * The file-callee slash/invoke drive seam calls this INSTEAD of executing the
     * body in-process (the whole callee body ran in the child).
     */
    // Bug 0342 §Fix (D3 carriage): the subagent leg's per-position
    // declaring-enum tags, parsed off the envelope's OPTIONAL `enum_tags`
    // sidecar on the Ok path. Captured in this closure so the returned
    // binding's `forwardedEnumTags` can hand them to the invoke-return retag
    // once `drive()` has actually run; `undefined` until then, and whenever
    // the envelope carried no sidecar (an enum-free return, or an
    // envelope-version predating it).
    let forwardedEnumTagsHolder: readonly EnumTagEntry[] | undefined;
    // Bug 0294 provenance sidecar (mirrors `forwardedEnumTagsHolder`'s
    // holder/accessor pattern): an `Ok` settle is always the callee's own
    // return; an `err` settle carries the envelope-consumption seam's own
    // `source` tag (`SubagentInvocationResult`'s err arm), which `#driveCallee`
    // reads via `driveSource()` to source-tag the subagent leg's body outcome.
    let lastDriveSource: InvokeResultSource = "callee-returned";
    // RFC 0012 §10: the `fn_tail` marker of the last settled envelope (a
    // `subagent fn` child's `Result`-valued tail), same holder pattern.
    let lastFnTail: FnTail | undefined;
    const drive = async (): Promise<ResultValue> => {
      const result: SubagentInvocationResult = await driveSubagentChild({
        child,
        thetaAbort,
        calleePath: theta.sourcePath ?? theta.slashName,
        emitDiagnostic,
      });
      lastFnTail = result.fnTail;
      if (result.ok) {
        forwardedEnumTagsHolder = result.enumTags;
        lastDriveSource = "callee-returned";
        return makeOk(result.value as ThetaValue);
      }
      lastDriveSource = result.source;
      return makeErr(result.error as unknown as ThetaValue);
    };

    // PIC-65 / PIC-66 child-process teardown. Runs on EVERY exit of the drive
    // seam's `finally`. Bounded-awaits child exit (already settled on the normal
    // path — the child self-exits after its envelope) and kills on timeout
    // (process-tree kill on Windows); detaches the one-shot cancellation listener; deletes any
    // `PI_THETA_PARAMS_FILE` temp file (PIC-60 backstop). Idempotent; a no-op
    // when no child was launched (the `subagent fn` in-process path).
    let toreDown = false;
    const teardown = async (): Promise<void> => {
      if (toreDown) return;
      toreDown = true;
      // EXST-5: detach the activity tap before the child teardown runs
      // (idempotent — a Set delete after close is a no-op).
      detachChildTap?.();
      // RFC 0012 §6: free this launch's visible slot for the next launch.
      placementLease.release();
      // PIC-60 backstop: delete the params temp file regardless of launch outcome.
      try {
        paramsCleanup();
      } catch (cleanupError: unknown) { // allow-broad-catch: PIC-60 temp-file backstop — pi-integration-contract/subagent.md
        void cleanupError;
      }
      await runSubagentChildTeardown(child, {
        emitDiagnostic,
        detachAbortListener: cancellation.detach,
        settleDisposeBarrier: ticket.settleDisposeBarrier,
        clock: root.clock,
      });
    };

    return {
      drivenAgainst: "subagent-private-session",
      drive,
      // Bug 0342 §Fix: hands the subagent leg's per-position declaring-enum
      // tags (captured by `drive()`, above) to `#validateInvokeReturn`'s
      // invoke-return retag. Undefined until `drive()` has settled an `Ok`
      // whose envelope carried the sidecar.
      forwardedEnumTags: (): readonly EnumTagEntry[] | undefined => forwardedEnumTagsHolder,
      // Bug 0294: exposes `lastDriveSource` (set by `drive()`, above) so
      // `#driveCallee` can source-tag the subagent leg's body outcome for the
      // XMODE-1 wrap without re-deriving it from the settled `Result`'s `kind`.
      driveSource: (): InvokeResultSource => lastDriveSource,
      // RFC 0012 §10: the `fn_tail` marker for `#resolveSubagentFnChild`'s
      // FN-6 projection; `undefined` on every `.theta` callee envelope.
      driveFnTail: (): FnTail | undefined => lastFnTail,
      teardown,
      finishInvocation,
    };
}
