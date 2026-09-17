// Caller-controlled reload completion for debounce and teardown tests.

import { vi } from "vitest";
import type { RebuildOutcome } from "../../src/extension/reload-debounce";

/**
 * A `rebuild` whose completion is caller-controlled (the V10d-T pattern): each
 * call parks a resolver so a rebuild can be held "in flight" and released
 * deterministically.
 */
export function controllableRebuild(): {
  rebuild: ReturnType<typeof vi.fn>;
  settle: (outcome: RebuildOutcome) => void;
  inFlightCount: () => number;
} {
  const resolvers: Array<(o: RebuildOutcome) => void> = [];
  let settled = 0;
  const rebuild = vi.fn(
    () =>
      new Promise<RebuildOutcome>((resolve) => {
        resolvers.push((o) => {
          settled++;
          resolve(o);
        });
      }),
  );
  return {
    rebuild,
    settle: (outcome) => {
      const next = resolvers[settled];
      if (next === undefined) {
        throw new Error("no in-flight rebuild to settle");
      }
      next(outcome);
    },
    inFlightCount: () => rebuild.mock.calls.length - settled,
  };
}
