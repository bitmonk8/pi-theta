// Write-through console.error gate for the live suite's theta-owned stderr witness.

import { expect } from "vitest";
import { thetaOwnedStderrLines } from "../live/theta-stderr-prefixes";
import { captureConsoleErrorForEach } from "./compose-workspace-harness";

/** Assert the shared prefix-filtered capture, returning raw calls for cell-specific witnesses. */
export function assertThetaStderrCleanForEach(options: {
  readonly message?: (offenders: readonly string[]) => string;
  readonly assertLines?: (lines: readonly string[]) => void;
} = {}): { readonly calls: unknown[][] } {
  return captureConsoleErrorForEach({
    writeThrough: true,
    assertLines: (lines) => {
      const offenders = thetaOwnedStderrLines(lines);
      expect(
        offenders,
        options.message?.(offenders) ??
          "bug 0018's live verification observable for this suite is a 0-byte stderr capture; " +
            "this spy caught theta-owned stderr line(s) instead: " + JSON.stringify(offenders),
      ).toEqual([]);
      options.assertLines?.(lines);
    },
  });
}
