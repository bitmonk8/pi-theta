// RFC-0006 — pre-spawn model guard and child-side model resolution (PIC-62) seam.
//
// Under RFC 0006 the whole callee runs in a spawned child `pi` process and the
// model crosses the boundary as a REFERENCE (`--provider <p> --model <id>`),
// re-resolved child-side. PIC-62 pins the two model-resolution obligations that
// bracket the spawn:
//
//   - PARENT-SIDE pre-spawn guard (`guardResolvedModel`): when the theta's
//     resolved model is `undefined` — frontmatter `model:` absent and the
//     inherited session model `undefined` — the runtime MUST NOT spawn the
//     child; it fails the invocation with `theta/runtime/subagent-model-unresolved`
//     and, to an `invoke` parent, `Err(InvokeInfraError { cause:
//     "subagent_model_unresolved" })`. The check is ENTRY-POINT-AGNOSTIC: it
//     runs identically at the slash-command, `tools:` `tool.execute`, and
//     `invoke(...)` entry points (it consumes only the resolved model, so no
//     entry-point discriminator enters the seam).
//   - CHILD-SIDE resolution confirmation (`confirmChildModel`): the child
//     re-resolves the marshalled reference against its OWN model registry (no
//     RPC state surface) and, on mismatch, fails the invocation with
//     `theta/runtime/subagent-model-preflight-mismatch` and `Err(InvokeInfraError
//     { cause: "subagent_model_preflight_mismatch" })`, its message naming the
//     expected vs. the child-resolved model. The failure reaches the parent
//     through the return envelope ([PIC-59](./subagent.md#pic-59)), not over any
//     RPC round-trip.
//
// WHY a dedicated seam succeeds the RFC-0005 PIC-40 pair (`subagent-isolation.ts`):
// PIC-40 pinned a child-side pre-flight over the RPC `get_state` /
// `get_available_models` state surface; RFC 0006's `-p` child has no RPC state
// surface, so re-resolution is local to the child and any mismatch is reported
// through the envelope. The pinned diagnostic codes and `InvokeInfraError`
// causes are preserved (stable diagnostics contract); the mechanism is re-coined.
//
// RED EXPECTATION (RFC-0006 not yet implemented): `guardResolvedModel` /
// `confirmChildModel` throw `not implemented: RFC 0006`, so each assertion reds
// on its primary behaviour; the paired implementation leaf greens them.
//
// Spec: pi-integration-contract/subagent.md (PIC-62 #subagent-pre-spawn-model-guard,
// #subagent-model-marshalling), diagnostics/code-registry-runtime.md
// (`theta/runtime/subagent-model-unresolved`,
// `theta/runtime/subagent-model-preflight-mismatch`),
// errors-and-results/queryerror-variants.md (the `invoke_infra` causes).

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { InvokeInfraError } from "./query-error";

// ---------------------------------------------------------------------------
// Diagnostic codes (registry-pinned).
// ---------------------------------------------------------------------------

/**
 * `theta/runtime/subagent-model-unresolved` — the pre-spawn model guard found
 * the resolved `model` to be `undefined`, so the runtime refused to spawn the
 * child (diagnostics/code-registry-runtime.md).
 */
export const SUBAGENT_MODEL_UNRESOLVED_CODE = "theta/runtime/subagent-model-unresolved";

/**
 * `theta/runtime/subagent-model-preflight-mismatch` — the child re-resolved the
 * marshalled `--provider`/`--model` reference to a different model than intended
 * (diagnostics/code-registry-runtime.md).
 */
export const SUBAGENT_MODEL_PREFLIGHT_MISMATCH_CODE = "theta/runtime/subagent-model-preflight-mismatch";

/**
 * The registry-pinned Message-column string for `theta/runtime/subagent-model-unresolved`
 * (code-registry-runtime.md).
 */
export const SUBAGENT_MODEL_UNRESOLVED_MESSAGE =
  "subagent invocation has no resolved model: frontmatter 'model:' is absent and the inherited session model is undefined";

/**
 * The registry-pinned Message-column template for
 * `theta/runtime/subagent-model-preflight-mismatch` (code-registry-runtime.md):
 * `subagent model pre-flight mismatch: expected '<expected>', child resolved '<resolved>'`.
 * Names expected vs. the child-resolved model.
 */
export function renderModelPreflightMismatchMessage(expected: string, resolved: string): string {
  return `subagent model pre-flight mismatch: expected '${expected}', child resolved '${resolved}'`;
}

// ---------------------------------------------------------------------------
// Parent-side pre-spawn guard.
// ---------------------------------------------------------------------------

/**
 * The parent-side pre-spawn guard verdict: proceed to spawn, or refuse fail-closed
 * with the `theta/runtime/subagent-model-unresolved` diagnostic and the
 * `Err(InvokeInfraError { cause: "subagent_model_unresolved" })` an `invoke`
 * parent observes.
 */
export type ModelGuardVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: InvokeInfraError; readonly diagnostic: Diagnostic };

/**
 * PIC-62 obligation 1 (parent-side). Decide whether the child spawn may proceed
 * given the theta's resolved model. A resolved `undefined` (frontmatter `model:`
 * absent and inherited `ctx.model` `undefined`) MUST NOT spawn the child; it
 * fails the invocation with `theta/runtime/subagent-model-unresolved` and, to an
 * `invoke` parent, `Err(InvokeInfraError { cause: "subagent_model_unresolved" })`.
 * The seam consumes ONLY the resolved model, so it is entry-point-agnostic: it
 * behaves identically at the slash-command, `tools:` `tool.execute`, and
 * `invoke(...)` entry points.
 */
export function guardResolvedModel(model: string | undefined): ModelGuardVerdict {
  // PIC-62: a resolved `undefined` model (frontmatter `model:` absent and the
  // inherited session model `undefined`) MUST NOT spawn the child. The seam
  // consumes only the resolved model, so it is entry-point-agnostic.
  if (model === undefined) {
    return {
      ok: false,
      error: {
        kind: "invoke_infra",
        message: SUBAGENT_MODEL_UNRESOLVED_MESSAGE,
        callee_path: "",
        cause: "subagent_model_unresolved",
      },
      diagnostic: {
        severity: "error",
        code: SUBAGENT_MODEL_UNRESOLVED_CODE,
        message: SUBAGENT_MODEL_UNRESOLVED_MESSAGE,
      },
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Child-side resolution confirmation.
// ---------------------------------------------------------------------------

/**
 * The child-side confirmation verdict: proceed, or fail the invocation with the
 * `theta/runtime/subagent-model-preflight-mismatch` diagnostic and the
 * `Err(InvokeInfraError { cause: "subagent_model_preflight_mismatch" })` the
 * envelope carries back to the parent.
 */
export type ChildModelVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: InvokeInfraError; readonly diagnostic: Diagnostic };

/**
 * PIC-62 obligation 2 (child-side). Confirm the marshalled `--provider`/`--model`
 * reference re-resolved child-side to the intended model. On mismatch, fail the
 * invocation with `theta/runtime/subagent-model-preflight-mismatch` and
 * `Err(InvokeInfraError { cause: "subagent_model_preflight_mismatch" })`, the
 * message naming `expected` vs. the child-`resolved` model. Reported to the
 * parent through the return envelope, never over an RPC state surface.
 */
export function confirmChildModel(expected: string, resolved: string): ChildModelVerdict {
  if (expected === resolved) {
    return { ok: true };
  }
  // PIC-62: the marshalled reference re-resolved child-side to a different model —
  // terminal for the invocation (the runtime does not retry). Reported to the
  // parent through the return envelope, never over an RPC state surface.
  const message = renderModelPreflightMismatchMessage(expected, resolved);
  return {
    ok: false,
    error: {
      kind: "invoke_infra",
      message,
      callee_path: "",
      cause: "subagent_model_preflight_mismatch",
    },
    diagnostic: {
      severity: "error",
      code: SUBAGENT_MODEL_PREFLIGHT_MISMATCH_CODE,
      message,
    },
  };
}
