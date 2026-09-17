// Strict executeBody hook shared by DRIVE-seam tests. Each test file keeps a
// top-level vi.mock and dynamically imports mockStatementExecutor from that
// factory: Vitest hoists vi.mock before static imports initialise. The same
// cached helper supplies the hook the test scripts; reset it after each test.

export const executorHook = {
  impl: undefined as
    | ((...args: readonly unknown[]) => Promise<unknown>)
    | undefined,
};

export async function mockStatementExecutor(
  importOriginal: () => Promise<typeof import("../../src/runtime/statement-executor")>,
) {
  const actual = await importOriginal();
  return {
    ...actual,
    executeBody: (...args: readonly unknown[]): Promise<unknown> => {
      if (executorHook.impl === undefined) {
        throw new Error("executorHook.impl not set by the test");
      }
      return executorHook.impl(...args);
    },
  };
}

export function resetExecutorHook(): void {
  executorHook.impl = undefined;
}
