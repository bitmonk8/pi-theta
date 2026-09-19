// Scratch discovery roots and ordered real-pi drives for H9a fixtures.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { parseSystemNoteCodes, requireLiveHost, spawnPiPrint, type PiPrintResult } from "../live/acceptance/harness";
import { errorCodes, parseDoc } from "./e2e-s1";

interface FixtureDrive<Root extends string> {
  readonly root: Root;
  readonly slashInvocation: string;
  readonly check: (result: PiPrintResult) => void;
}

/**
 * Plant named discovery roots, then spawn and check each run in order with its
 * own empty cwd. A failed assertion stops later runs; every root/cwd is removed
 * on either outcome. Callers own the live-host precondition and their oracles.
 */
export async function drivePiPrintFixtures<Root extends string>(
  slug: string,
  roots: Readonly<Record<Root, Readonly<Record<string, string>>>>,
  drives: readonly FixtureDrive<Root>[],
): Promise<void> {
  const dirs = new Map<Root, string>();
  const cwds: string[] = [];
  try {
    for (const name of Object.keys(roots) as Root[]) {
      dirs.set(name, mkdtempSync(join(tmpdir(), `theta-${slug}${name === "" ? "" : `-${name}`}-`)));
    }
    for (const _drive of drives) {
      cwds.push(mkdtempSync(join(tmpdir(), `theta-${slug}-cwd-`)));
    }
    for (const [name, dir] of dirs) {
      for (const [file, text] of Object.entries(roots[name])) {
        writeFileSync(join(dir, file), text, "utf8");
      }
    }
    for (const [index, drive] of drives.entries()) {
      const result = await spawnPiPrint({
        thetaDir: dirs.get(drive.root)!,
        slashInvocation: drive.slashInvocation,
        cwd: cwds[index]!,
      });
      drive.check(result);
    }
  } finally {
    for (const dir of [...dirs.values(), ...cwds]) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

/**
 * Drive one fixture root, requiring a clean exit and the cell's stdout witness.
 * Callers keep their live-host precondition, fixture bytes and failure rationale.
 */
export async function expectPiPrintFixture(
  slug: string,
  files: Readonly<Record<string, string>>,
  drive: {
    readonly slashInvocation: string;
    readonly expectedStdout: string;
    readonly stdoutMessage: (result: PiPrintResult) => string;
    readonly label?: string;
    readonly rootName?: string;
  },
): Promise<void> {
  const root = drive.rootName ?? "root";
  const label = drive.label ?? "probe";
  await drivePiPrintFixtures(slug, { [root]: files }, [{
    root,
    slashInvocation: drive.slashInvocation,
    check(result) {
      expect(
        result.exitCode,
        `${label}: expected a no-error exit (0), got ${String(result.exitCode)}. stderr: ${result.stderr}`,
      ).toBe(0);
      expect(result.stdout, drive.stdoutMessage(result)).toContain(drive.expectedStdout);
    },
  }]);
}

interface OffenderProbeCleanCase {
  readonly slug: string;
  readonly files: Readonly<Record<string, string>>;
  readonly clean: {
    readonly slashInvocation: string;
    readonly expected: string;
    readonly message: (clean: PiPrintResult) => string;
    readonly codesMessage: string;
  };
  readonly probe: {
    readonly slashInvocation: string;
    readonly expected: string;
    readonly unexpected: string;
    readonly message: (probe: PiPrintResult) => string;
    readonly unexpectedMessage?: (probe: PiPrintResult) => string;
    readonly checkAdditional?: (probe: PiPrintResult) => void;
  };
  readonly measurementMessage: (probe: PiPrintResult, observedCodes: readonly string[]) => string;
}

/**
 * Drive the clean sibling before its refusal probe in the same discovery root.
 * Keep the clean exit/stdout/empty-stderr/no-code guards and the probe's positive
 * and negative stdout witnesses. Callers own attribution and live-host checks,
 * including any provider-qualified bind_model needed to construct the fixtures.
 */
export async function expectOffenderProbeClean(test: OffenderProbeCleanCase): Promise<void> {
  await drivePiPrintFixtures(test.slug, { root: test.files }, [
    {
      root: "root",
      slashInvocation: test.clean.slashInvocation,
      check(clean) {
        expect(
          clean.exitCode,
          `clean: expected a no-error exit (0), got ${String(clean.exitCode)}. stderr: ${clean.stderr}`,
        ).toBe(0);
        expect(clean.stdout, test.clean.message(clean)).toContain(test.clean.expected);
        // Bug 0030's empty-capture gate: every nonblank stderr line is rejected.
        expect(
          clean.stderr.split(/\r?\n/).filter((line) => line.trim().length > 0),
          `clean: stderr must be empty for a diagnostic-free run (bug 0030 §Fix empty-capture gate). stderr: ${clean.stderr}`,
        ).toEqual([]);
        expect(
          parseSystemNoteCodes(clean.stdout + clean.stderr),
          test.clean.codesMessage,
        ).toEqual([]);
      },
    },
    {
      root: "root",
      slashInvocation: test.probe.slashInvocation,
      check(probe) {
        expect(
          probe.exitCode,
          `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. stderr: ${probe.stderr}`,
        ).toBe(0);
        expect(probe.stdout, test.probe.message(probe)).toContain(test.probe.expected);
        expect(
          probe.stdout,
          test.probe.unexpectedMessage?.(probe) ?? `probe: the Ok arm must not fire; stdout: ${probe.stdout}`,
        ).not.toContain(test.probe.unexpected);
        test.probe.checkAdditional?.(probe);

        // MEASUREMENT (permitted-codes disposition): use the same regex as the
        // H9a manifest's permittedCodesSubset invariant, never an assumption.
        const observedCodes = parseSystemNoteCodes(probe.stdout + probe.stderr);
        expect(observedCodes, test.measurementMessage(probe, observedCodes)).toEqual([]);
      },
    },
  ]);
}

interface OffenderControlCase {
  readonly slug: string;
  readonly offender: string;
  readonly offenderProbe: string;
  readonly control: string;
  readonly controlProbe: string;
  readonly code: string;
  readonly refused: string;
  readonly loaded: string;
  readonly controlOk: string;
  readonly offenderLabel: string;
  readonly controlLabel: string;
  readonly unfixedBehavior: string;
}

/**
 * Attribute the refusal offline before requiring a live host, then prove both
 * refusal and control drive through invoke. Separate discovery roots keep the
 * offender's load-time system note out of the control's drive.
 */
export async function expectOffenderControlRefusal(test: OffenderControlCase): Promise<void> {
  const offenderFile = `${test.slug}offender.theta`;
  const controlFile = `${test.slug}control.theta`;
  expect(
    errorCodes(test.offender, `/proj/${offenderFile}`),
    `attribution: the offender's ${test.offenderLabel} must carry exactly ${test.code}`,
  ).toEqual([test.code]);
  expect(
    parseDoc(test.offender, `/proj/${offenderFile}`).frontmatter,
    "attribution: a refused theta does not register (frontmatter is null)",
  ).toBeNull();
  expect(
    errorCodes(test.control, `/proj/${controlFile}`),
    `attribution: the ${test.controlLabel} control carries no error and registers`,
  ).toEqual([]);
  expect(
    parseDoc(test.control, `/proj/${controlFile}`).frontmatter,
    `attribution: the ${test.controlLabel} control registers (frontmatter non-null)`,
  ).not.toBeNull();

  // Fails loudly naming the unmet precondition; never a skip or early return.
  await requireLiveHost();

  await drivePiPrintFixtures(test.slug, {
    off: {
      [offenderFile]: test.offender,
      [`${test.slug}offenderprobe.theta`]: test.offenderProbe,
    },
    ctl: {
      [controlFile]: test.control,
      [`${test.slug}controlprobe.theta`]: test.controlProbe,
    },
  }, [
    {
      root: "off",
      slashInvocation: `/${test.slug}offenderprobe`,
      check(probe) {
        expect(
          probe.exitCode,
          `offender probe: expected a no-error exit (0), got ${String(probe.exitCode)}. ` +
            `stderr: ${probe.stderr}`,
        ).toBe(0);
        expect(
          probe.stdout,
          `offender probe: the ${test.offenderLabel} theta must NOT load, so ` +
            `invoke("./${offenderFile}") resolves Err(InvokeInfraError) and the ` +
            `match prints "${test.refused}". Printing "${test.loaded}" means ` +
            `${test.unfixedBehavior}. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
        ).toContain(test.refused);
        expect(
          probe.stdout,
          `offender probe: the Ok arm must not fire; stdout: ${probe.stdout}`,
        ).not.toContain(test.loaded);
      },
    },
    {
      root: "ctl",
      slashInvocation: `/${test.slug}controlprobe`,
      check(control) {
        expect(
          control.exitCode,
          `control probe: expected a no-error exit (0), got ${String(control.exitCode)}. ` +
            `stderr: ${control.stderr}`,
        ).toBe(0);
        expect(
          control.stdout,
          `control probe: the ${test.controlLabel} theta must register and DRIVE — ` +
            `it returns 777 and the prober computes 777 + 100 = ${test.controlOk}. A ` +
            `control the fix wrongly refused resolves Err → d = 0 → answer 100. ` +
            `stdout: ${control.stdout} stderr: ${control.stderr}`,
        ).toContain(test.controlOk);
      },
    },
  ]);
}
