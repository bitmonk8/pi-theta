// A shared "hand-built theta_result envelope line" driver scaffold for
// `driveSubagentChild` (`src/runtime/subagent-json-driver.ts`) unit cells.
//
// WHY THIS FILE EXISTS. `tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts`
// declared its own module-scope `envelopeLine` / `tick` pair and a `driveDeps`
// builder sized to `driveSubagentChild`'s own dependency shape, byte-identical
// (bar one doc-comment wording) to the copy
// `tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts` and
// `tests/subagent-json-driver.test.ts` each still declare locally (unmigrated;
// outside this module's current scope). This module centralises that trio for
// the former file; a caller drives one hand-built `theta_result` line over a
// `FakeRpcChild` (`tests/helpers/fake-rpc-child.ts`) after one macrotask flush.
//
// TIER: unit, offline, provider-free, deterministic — the same tier as every
// file that imports this module.
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import { THETA_RESULT_KEY } from "../../src/runtime/subagent-envelope";
import type { SubagentChildProcess } from "../../src/runtime/subagent-launcher";

/** One hand-built `theta_result` envelope line (the child emits this on stdout). */
export function envelopeLine(payload: Record<string, unknown>): string {
  return JSON.stringify({ [THETA_RESULT_KEY]: payload });
}

/** A macrotask flush so the drive reaches its stdout-read await before the line lands. */
export function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** `driveSubagentChild`'s dependency shape, sized for a single hand-built-envelope drive. */
export function driveDeps(
  child: SubagentChildProcess,
  thetaAbort: AbortController,
  calleePath = "./worker.theta",
  emitDiagnostic: (d: Diagnostic) => void = (): void => {},
): {
  child: SubagentChildProcess;
  thetaAbort: AbortController;
  calleePath: string;
  emitDiagnostic: (d: Diagnostic) => void;
} {
  return {
    child,
    thetaAbort,
    calleePath,
    emitDiagnostic,
  };
}
