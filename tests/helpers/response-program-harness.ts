// Shared harness setup and transcript-replay assertions for the H4 response surfaces.

import { expect } from "vitest";
import { loadExtension } from "../harness/index";

/** Load the extension through the harness and return its scripting surface. */
export function harnessDouble() {
  return loadExtension({ fixtures: [] }).double;
}

/** Assert same-instance replay and cross-instance transcript determinism. */
export function assertDeterministicReplay(
  script: (double: ReturnType<typeof harnessDouble>) => void,
): void {
  const first = harnessDouble();
  script(first);
  const runA = first.driveResponses();
  const runB = first.responses.drive();
  // Same instance, replayed: byte-identical observable transcript.
  expect(runB).toEqual(runA);

  // A second, independently-constructed harness double with the identical
  // script yields the identical transcript (cross-instance determinism).
  const second = harnessDouble();
  script(second);
  expect(second.driveResponses()).toEqual(runA);
}
