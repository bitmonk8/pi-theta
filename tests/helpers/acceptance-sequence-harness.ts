// Shared fixture setup, ordered sentinel drives, and teardown for H9a acceptance cells.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect } from "vitest";
import { requireLiveHost, spawnPiPrint, type PiPrintResult } from "../live/acceptance/harness";

/** One control or refusal-probe drive, with the caller's fixture-pinned observable and failure prose. */
interface AcceptanceDrive {
  readonly label: string;
  readonly slashInvocation: string;
  readonly expected: string;
  readonly unexpected?: string;
  readonly message: (result: PiPrintResult) => string;
}

/**
 * Require the live host, plant one discovery root, then drive and assert each
 * control/probe in order with its own cwd. A failed assertion stops the sequence;
 * the root and every cwd are removed on success, assertion failure, or spawn failure.
 */
export async function driveAcceptanceSequence(options: {
  readonly slug: string;
  readonly files: Readonly<Record<string, string>>;
  readonly drives: readonly AcceptanceDrive[];
}): Promise<void> {
  await requireLiveHost();

  const thetaDir = mkdtempSync(join(tmpdir(), `theta-${options.slug}-root-`));
  const cwds = options.drives.map(() => mkdtempSync(join(tmpdir(), `theta-${options.slug}-cwd-`)));
  try {
    for (const [name, source] of Object.entries(options.files)) {
      const path = join(thetaDir, name);
      if (dirname(path) !== thetaDir) mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, source, "utf8");
    }
    for (const [index, drive] of options.drives.entries()) {
      const result = await spawnPiPrint({
        thetaDir,
        slashInvocation: drive.slashInvocation,
        cwd: cwds[index]!,
      });
      expect(
        result.exitCode,
        `${drive.label}: expected a no-error exit (0), got ${String(result.exitCode)}. ` +
          `stderr: ${result.stderr}`,
      ).toBe(0);
      expect(result.stdout, drive.message(result)).toContain(drive.expected);
      if (drive.unexpected !== undefined) {
        expect(
          result.stdout,
          `${drive.label}: the Ok arm must not fire; stdout: ${result.stdout}`,
        ).not.toContain(drive.unexpected);
      }
    }
  } finally {
    rmSync(thetaDir, { recursive: true, force: true });
    for (const cwd of cwds) rmSync(cwd, { recursive: true, force: true });
  }
}
