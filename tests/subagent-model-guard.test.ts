// RFC-0006 new coverage — pre-spawn model guard + child-side model resolution (PIC-62).
//
// Spec: pi-integration-contract/subagent.md (PIC-62 #subagent-pre-spawn-model-guard,
// #subagent-model-marshalling), diagnostics/code-registry-runtime.md
// (`theta/runtime/subagent-model-unresolved`,
// `theta/runtime/subagent-model-preflight-mismatch`),
// errors-and-results/queryerror-variants.md (the `invoke_infra` causes).
//
// Covers the PIC-62 named obligations:
//   - parent-side pre-spawn guard: a resolved `undefined` model refuses the
//     spawn with `theta/runtime/subagent-model-unresolved` +
//     Err(InvokeInfraError { cause: "subagent_model_unresolved" }); the refusal
//     is ENTRY-POINT-AGNOSTIC (identical at slash / tool.execute / invoke);
//   - child-side confirmation: a re-resolve mismatch fails with
//     `theta/runtime/subagent-model-preflight-mismatch` + Err(InvokeInfraError
//     { cause: "subagent_model_preflight_mismatch" }), the message naming both
//     the expected and the child-resolved model identifiers.
//
// REQ-ID: PIC-62 (release-gate REQ-ID token; the gate greps tests/** for it).
//
// RED EXPECTATION (RFC-0006 not yet implemented): `guardResolvedModel` /
// `confirmChildModel` throw `not implemented: RFC 0006`, so each assertion reds
// on its primary behaviour; the paired implementation leaf greens them.

import { describe, expect, it } from "vitest";
import {
  confirmChildModel,
  guardResolvedModel,
  SUBAGENT_MODEL_PREFLIGHT_MISMATCH_CODE,
  SUBAGENT_MODEL_UNRESOLVED_CODE,
} from "../src/runtime/subagent-model-guard";

// ---------------------------------------------------------------------------
// PIC-62 obligation 1 — parent-side pre-spawn guard (entry-point-agnostic).
// ---------------------------------------------------------------------------

/**
 * The three entry points PIC-62 pins the guard to behave IDENTICALLY at. The
 * guard seam consumes only the resolved model (no entry-point discriminator),
 * so the parameterisation asserts that entry-point agnosticism directly.
 */
const ENTRY_POINTS = ["slash-command", "tools:tool.execute", "invoke"] as const;

describe("PIC-62 — pre-spawn model guard (resolved model undefined → no spawn)", () => {
  it("a resolved model refuses the spawn with the pinned diagnostic + Err(invoke_infra subagent_model_unresolved)", () => {
    const verdict = guardResolvedModel(undefined);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      // PIC-62: MUST NOT spawn — the refusal carries the registry-pinned code.
      expect(verdict.diagnostic.code).toBe(SUBAGENT_MODEL_UNRESOLVED_CODE);
      expect(verdict.diagnostic.severity).toBe("error");
      // Surfaces to an `invoke` parent as this precise `invoke_infra` cause.
      expect(verdict.error.kind).toBe("invoke_infra");
      expect(verdict.error.cause).toBe("subagent_model_unresolved");
    }
  });

  it("a resolved (non-undefined) model proceeds to the spawn", () => {
    const verdict = guardResolvedModel("claude-test");
    expect(verdict.ok).toBe(true);
  });

  // PIC-62: the check "behaves identically at the slash-command, `tools:`
  // `tool.execute`, and `invoke(...)` entry points". The seam is entry-point-
  // agnostic by construction (it consumes only the resolved model), so the same
  // input yields the same verdict regardless of which entry drove it.
  for (const entryPoint of ENTRY_POINTS) {
    it(`the unresolved-model refusal is identical at the ${entryPoint} entry point`, () => {
      const verdict = guardResolvedModel(undefined);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) {
        expect(verdict.diagnostic.code).toBe(SUBAGENT_MODEL_UNRESOLVED_CODE);
        expect(verdict.error.kind).toBe("invoke_infra");
        expect(verdict.error.cause).toBe("subagent_model_unresolved");
      }
    });
  }
});

// ---------------------------------------------------------------------------
// PIC-62 obligation 2 — child-side re-resolution confirmation.
// ---------------------------------------------------------------------------

describe("PIC-62 — child-side model re-resolution confirmation", () => {
  it("a matching re-resolution proceeds", () => {
    const verdict = confirmChildModel("anthropic/claude-x", "anthropic/claude-x");
    expect(verdict.ok).toBe(true);
  });

  it("a mismatch fails with the pinned diagnostic + Err(invoke_infra subagent_model_preflight_mismatch), naming expected vs resolved", () => {
    const expected = "anthropic/claude-expected";
    const resolved = "anthropic/claude-resolved";
    const verdict = confirmChildModel(expected, resolved);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.diagnostic.code).toBe(SUBAGENT_MODEL_PREFLIGHT_MISMATCH_CODE);
      expect(verdict.diagnostic.severity).toBe("error");
      expect(verdict.error.kind).toBe("invoke_infra");
      expect(verdict.error.cause).toBe("subagent_model_preflight_mismatch");
      // The message names BOTH the expected and the child-resolved identifiers.
      expect(verdict.diagnostic.message).toContain(expected);
      expect(verdict.diagnostic.message).toContain(resolved);
    }
  });
});
