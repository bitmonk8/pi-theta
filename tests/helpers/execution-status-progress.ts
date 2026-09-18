// Shared registration recorder and invocation/argument fixtures for progress-tool tests.

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type {
  THETA_PROGRESS_PARAMETERS,
  ThetaProgressParams,
} from "../../src/extension/execution-status/progress-tool";
import type { ActiveInvocationEntry } from "../../src/runtime/active-invocation-registry";

export function fakeHostApi(): {
  hostApi: { registerTool: (t: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>) => void };
  calls: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>[];
} {
  const calls: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>[] = [];
  return {
    hostApi: {
      registerTool: (t): void => {
        calls.push(t);
      },
    },
    calls,
  };
}

export function fakeEntry(overrides: Partial<ActiveInvocationEntry> = {}): ActiveInvocationEntry {
  return {
    thetaAbort: new AbortController(),
    disposeBarrier: Promise.resolve(),
    shutdownReason: undefined,
    theta: "quality-loop",
    invocationId: "inv-1",
    ...overrides,
  };
}

export const ARGS: ThetaProgressParams = { message: "built 3 of 12", scope: "fix", done: 3, total: 12 };
