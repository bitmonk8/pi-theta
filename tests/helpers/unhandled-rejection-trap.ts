// Shared Node unhandled-rejection recording and settlement drain for cancellation tests.

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
