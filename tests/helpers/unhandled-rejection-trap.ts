// Shared side-channel recording and settlement drain for cancellation tests.

import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import type { RuntimeEvent } from "../../src/runtime/runtime-event-channel";
import type { SubstrateSideChannels } from "../../src/runtime/cancellation-core";

export interface RecordingChannels {
  readonly channels: SubstrateSideChannels;
  readonly events: RuntimeEvent[];
  readonly diagnostics: Diagnostic[];
}

/** Record runtime events and diagnostics on the cancellation side channels. */
export function makeChannels(): RecordingChannels {
  const events: RuntimeEvent[] = [];
  const diagnostics: Diagnostic[] = [];
  const channels: SubstrateSideChannels = {
    emitRuntimeEvent: (event): void => {
      events.push(event);
    },
    emitDiagnostic: (diagnostic): void => {
      diagnostics.push(diagnostic);
    },
  };
  return { channels, events, diagnostics };
}

/** Records every Node `unhandledRejection` process event for the active test.
 * Wire `install` / `dispose` through the caller's beforeEach / afterEach hooks. */
export function createUnhandledRejectionTrap(): {
  readonly unhandled: unknown[];
  install(): void;
  dispose(): void;
} {
  const unhandled: unknown[] = [];
  function onUnhandled(reason: unknown): void {
    unhandled.push(reason);
  }
  return {
    unhandled,
    install(): void {
      unhandled.length = 0;
      process.on("unhandledRejection", onUnhandled);
    },
    dispose(): void {
      process.off("unhandledRejection", onUnhandled);
    },
  };
}

/**
 * Drain microtasks and take a macrotask turn so a would-be `unhandledRejection`
 * (raised by Node on the next macrotask after the microtask queue empties for a
 * rejected, handler-less Promise) is observed if it fires.
 */
export async function settleAndObserve(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}
