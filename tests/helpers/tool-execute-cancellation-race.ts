// Shared abort-race scaffold over the real tool-execute swallowing handler.

import {
  guardToolExecutePromise,
  type ToolExecuteCancellationGuard,
  type ToolExecuteSideChannels,
} from "../../src/runtime/tool-call-swallowing-handler";

const noopChannels: ToolExecuteSideChannels = {
  emitRuntimeEvent: (): void => {},
  emitDiagnostic: (): void => {},
};

/** Start an execution, attach its settlement observer, then abort synchronously. */
export function abortToolExecuteRace(
  execute: () => Promise<unknown>,
  onSettled: (
    guard: ToolExecuteCancellationGuard,
    resolve: (outcome: "settled" | "cancelled") => void,
  ) => void,
): Promise<"settled" | "cancelled"> {
  const controller = new AbortController();
  const guard: ToolExecuteCancellationGuard = { cancellationSurfaced: false };

  return new Promise<"settled" | "cancelled">((resolve) => {
    const guarded = guardToolExecutePromise(execute(), guard, noopChannels);
    guarded.then((): void => {
      onSettled(guard, resolve);
    });
    controller.signal.addEventListener("abort", (): void => {
      guard.cancellationSurfaced = true;
      resolve("cancelled");
    });
    controller.abort();
  });
}
