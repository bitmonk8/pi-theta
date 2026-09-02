import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discoverThetas,
  type DiscoveredTheta,
  type DiscoveryInput,
} from "../src/discovery/discovery-walk";
import type { ThetaSettings } from "../src/discovery/settings";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { PiFileSystem } from "../src/seams/pi-file-system";

// Bug 0363 — an explicit `.theta` file reference (CLI `--theta` component or a
// settings `thetaPaths` literal/glob) has its slash name derived from the
// REFERENCE's own basename spelling, not the on-disk directory-entry name. On a
// case-insensitive host (Windows/NTFS — this campaign) a case-variant reference
// resolves to the real file, so the registered name and the on-disk name
// disagree. Two directions diverge from DISC-3 (discovery-sources.md:76, "The
// slash name is the theta's filename stem taken verbatim … the file does not
// register" for a rejected stem):
//   (i)  on-disk `Plan.theta` (stem `Plan`, DISC-3 mandates
//        `theta/load/invalid-slash-name` refusal) registers SILENTLY as `/plan`
//        when the entry spells it lowercase `plan.theta`.
//   (ii) on-disk `good.theta` (legal stem) is wrongly refused
//        `theta/load/invalid-slash-name` when the entry spells it `GOOD.theta`.
// The settled §Fix derives stem AND candidate path from the on-disk directory
// entry for explicit file refs, so (i) → invalid-slash-name on the real stem
// `Plan` with no registration, and (ii) → registers `/good`.
//
// TIER: unit — offline, provider-free, deterministic. The bug doc's
// §Reproduction PRESCRIBES driving `discoverThetas` DIRECTLY over a real
// filesystem scratch root with the production `PiFileSystem`; no provider, no
// child process, no live model. This overrides the default executor-harness
// pattern. A FakeFileSystem cell (as in tests/discovery-walk.ts) could not
// witness this: the defect only manifests when a case-variant reference
// RESOLVES to a differently-cased on-disk entry, which is a property of the
// REAL host filesystem's case-sensitivity, not of the fake.
//
// The witness only reds on a case-INSENSITIVE filesystem. Each witnessing cell
// probes the real scratch filesystem's case-sensitivity (mirroring
// tests/b0329-hash-mismatch-refuses-invocation.test.ts) and asserts BOTH
// branches with real assertions — never a skip:
//   - case-INSENSITIVE = the witness (RED pre-fix): the case-variant reference
//     resolves to the real file, so the FIXED outcome is asserted and the test
//     reds today.
//   - case-SENSITIVE = control: the case-variant reference does NOT resolve →
//     `theta/load/missing-source` and no registration (identical pre/post fix;
//     §Non-goals bullet 3). Asserted loudly.
//
// AMBIENT ISOLATION: the walk also scans the real global root
// (`fs.globalAgentDir()`); every assertion filters to thetas/diagnostics under
// the per-test scratch dir (`underScratch`) so ambient discovery cannot pollute.
//
// No silent skipping: an unmet precondition (the FS case-probe rethrows any
// non-ENOENT error) fails loudly naming it; there is no early return or vitest
// skip anywhere below. LF line endings only. Any `0.355.0` in a comment is the
// literal placeholder the fix's version fills.

const INVALID_SLASH_NAME = "theta/load/invalid-slash-name";
const MISSING_SOURCE = "theta/load/missing-source";

/** A body that reads far enough to register — discovery validates the slash
 *  name and file readability only, never the mode block, so a prompt-mode body
 *  suffices to exercise the discovery name/diagnostic this file asserts on. */
const THETA_BODY = "mode: prompt\n---\n";

// ── Scratch workspace ─────────────────────────────────────────────────────────

let scratchDir: string; // native (backslash on Windows) — for on-disk writes
let scratchPosix: string; // forward-slash — for references and prefix compares
let xNativeDir: string; // <scratch>/x on disk

/** Forward-slash form for reference/compare (Node fs accepts `/` on Windows and
 *  the walk normalises to `/`; a drive-letter path stays absolute). */
function posix(path: string): string {
  return path.replace(/\\/g, "/");
}

/** A forward-slash absolute path under the scratch root. */
function sp(...parts: string[]): string {
  return [scratchPosix, ...parts].join("/");
}

/** True when `path` lies under the per-test scratch root (case-insensitive: the
 *  host may report the temp prefix in a different case than `tmpdir()` did). */
function underScratch(path: string): boolean {
  return posix(path).toLowerCase().startsWith(scratchPosix.toLowerCase());
}

function namedUnderScratch(
  thetas: readonly DiscoveredTheta[],
  name: string,
): DiscoveredTheta | undefined {
  return thetas.find((t) => t.name === name && underScratch(t.path));
}

function scratchDiags(diags: readonly Diagnostic[], code: string): Diagnostic[] {
  return diags.filter((d) => d.code === code && d.file !== undefined && underScratch(d.file));
}

const json = (value: unknown): string => JSON.stringify(value);

/**
 * Drive `discoverThetas` over the real scratch root with the production
 * `PiFileSystem` whose cwd is the scratch root (so the project conventional
 * root is `<scratch>/.pi/theta`, absent → silent). Only the explicit references
 * this test passes reach the scratch files.
 */
async function runWalk(extra: {
  settings?: ThetaSettings;
  cliPaths?: readonly string[];
}): Promise<{ thetas: readonly DiscoveredTheta[]; diagnostics: readonly Diagnostic[] }> {
  const fs = new PiFileSystem(scratchPosix);
  const inputObj: DiscoveryInput = {
    fs,
    settings: extra.settings ?? {},
    ...(extra.cliPaths !== undefined ? { cliPaths: extra.cliPaths } : {}),
  };
  const { thetas, diagnostics } = await discoverThetas(inputObj);
  return { thetas, diagnostics };
}

/**
 * Whether the scratch filesystem is case-insensitive: write a lowercase probe
 * file, attempt the uppercase read. A successful read ⇒ case-insensitive. Only
 * ENOENT is the case-sensitive signal; any other error is a real fault and
 * rethrows (no swallow — CLAUDE.md/AGENTS.md "let crash"). The probe file lives
 * in the per-test scratch root and is removed here.
 */
function filesystemIsCaseInsensitive(dir: string): boolean {
  const lower = join(dir, "b0363-case-probe-aa");
  writeFileSync(lower, "x", "utf8");
  try {
    readFileSync(join(dir, "b0363-case-probe-AA"), "utf8");
    return true;
  } catch (probeError: unknown) {
    const code = (probeError as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw probeError;
    }
    return false;
  } finally {
    rmSync(lower, { force: true });
  }
}

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "b0363-"));
  scratchPosix = posix(scratchDir);
  xNativeDir = join(scratchDir, "x");
  mkdirSync(xNativeDir, { recursive: true });
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

// =============================================================================
// (A) SETTINGS thetaPaths, direction (i): lowercase reference `plan.theta`
//     naming on-disk `Plan.theta`. Exercises the settings `addFile` arm
//     (discovery-walk.ts addFile). RED today: registers `/plan`, zero
//     diagnostics.
// =============================================================================

describe("bug 0363 (A) — settings thetaPaths, on-disk `Plan.theta` referenced as `plan.theta`", () => {
  it("refuses on the on-disk stem `Plan` (invalid-slash-name), and does not register `/plan`", async () => {
    writeFileSync(join(xNativeDir, "Plan.theta"), THETA_BODY, "utf8");
    const { thetas, diagnostics } = await runWalk({
      settings: { thetaPaths: [sp("x", "plan.theta")] },
    });
    const caseInsensitive = filesystemIsCaseInsensitive(scratchDir);

    if (caseInsensitive) {
      expect(caseInsensitive, "case-insensitive filesystem branch").toBe(true);
      // RED pre-fix: the lowercase reference resolves to on-disk `Plan.theta`
      // and the entry-spelled stem `plan` passes SLASH_NAME, so `/plan`
      // registers silently today. Post-fix the on-disk stem `Plan` is judged.
      expect(
        namedUnderScratch(thetas, "plan"),
        `direction (i): /plan must NOT register (on-disk stem is Plan); thetas=${json(thetas)}`,
      ).toBeUndefined();
      // RED pre-fix: zero diagnostics under scratch today. Post-fix DISC-3
      // refuses the real stem `Plan` from the on-disk directory entry.
      const invalid = scratchDiags(diagnostics, INVALID_SLASH_NAME);
      expect(
        invalid.length,
        `direction (i): one invalid-slash-name expected on the on-disk file; diagnostics=${json(diagnostics)}`,
      ).toBe(1);
      expect(basename(posix(invalid[0]!.file!))).toBe("Plan.theta");
      expect(invalid[0]!.severity).toBe("error");
    } else {
      expect(caseInsensitive, "case-sensitive filesystem branch").toBe(false);
      // Control (§Non-goals 3): the lowercase reference does not resolve to the
      // uppercase file, so it is a missing settings source — identical pre/post.
      const missing = scratchDiags(diagnostics, MISSING_SOURCE);
      expect(
        missing.length,
        `case-sensitive control: one missing-source expected; diagnostics=${json(diagnostics)}`,
      ).toBe(1);
      expect(missing[0]!.severity).toBe("error");
      expect(namedUnderScratch(thetas, "plan")).toBeUndefined();
    }
  });
});

// =============================================================================
// (B) SETTINGS thetaPaths, direction (ii): uppercase reference `GOOD.theta`
//     naming on-disk `good.theta`. RED today: refused invalid-slash-name.
// =============================================================================

describe("bug 0363 (B) — settings thetaPaths, on-disk `good.theta` referenced as `GOOD.theta`", () => {
  it("registers `/good` on the on-disk stem `good`, with no invalid-slash-name", async () => {
    writeFileSync(join(xNativeDir, "good.theta"), THETA_BODY, "utf8");
    const { thetas, diagnostics } = await runWalk({
      settings: { thetaPaths: [sp("x", "GOOD.theta")] },
    });
    const caseInsensitive = filesystemIsCaseInsensitive(scratchDir);

    if (caseInsensitive) {
      expect(caseInsensitive, "case-insensitive filesystem branch").toBe(true);
      // RED pre-fix: the entry-spelled stem `GOOD` fails SLASH_NAME, so the
      // well-formed on-disk file is refused today. Post-fix the on-disk stem
      // `good` is legal and registers.
      expect(
        namedUnderScratch(thetas, "good"),
        `direction (ii): /good must register (on-disk stem good is legal); thetas=${json(thetas)}`,
      ).toBeDefined();
      // §Fix takes the candidate PATH from the on-disk entry too: the winnerPath
      // carrier the child re-derives (S2 escalation) consumes this path, so it
      // must be the real `good.theta`, not the entry-spelled `GOOD.theta`.
      expect(basename(posix(namedUnderScratch(thetas, "good")!.path))).toBe("good.theta");
      // RED pre-fix: an invalid-slash-name is emitted for the on-disk file
      // today. Post-fix none.
      expect(
        scratchDiags(diagnostics, INVALID_SLASH_NAME),
        `direction (ii): no invalid-slash-name expected for a legal on-disk stem; diagnostics=${json(diagnostics)}`,
      ).toEqual([]);
    } else {
      expect(caseInsensitive, "case-sensitive filesystem branch").toBe(false);
      // Control (§Non-goals 3): the uppercase reference does not resolve.
      const missing = scratchDiags(diagnostics, MISSING_SOURCE);
      expect(
        missing.length,
        `case-sensitive control: one missing-source expected; diagnostics=${json(diagnostics)}`,
      ).toBe(1);
      expect(missing[0]!.severity).toBe("error");
      expect(namedUnderScratch(thetas, "good")).toBeUndefined();
    }
  });
});

// =============================================================================
// (E) CLI `--theta`, direction (i): lowercase component `plan.theta` naming
//     on-disk `Plan.theta`. Exercises the SEPARATE `resolveEntry` case "file"
//     arm (discovery-walk.ts resolveEntry), distinct from A/B's settings
//     `addFile` arm. RED today: registers `/plan`, zero diagnostics.
// =============================================================================

describe("bug 0363 (E) — CLI --theta, on-disk `Plan.theta` referenced as `plan.theta`", () => {
  it("refuses on the on-disk stem `Plan` (invalid-slash-name), and does not register `/plan`", async () => {
    writeFileSync(join(xNativeDir, "Plan.theta"), THETA_BODY, "utf8");
    const { thetas, diagnostics } = await runWalk({
      cliPaths: [sp("x", "plan.theta")],
    });
    const caseInsensitive = filesystemIsCaseInsensitive(scratchDir);

    if (caseInsensitive) {
      expect(caseInsensitive, "case-insensitive filesystem branch").toBe(true);
      expect(
        namedUnderScratch(thetas, "plan"),
        `direction (i) via CLI: /plan must NOT register; thetas=${json(thetas)}`,
      ).toBeUndefined();
      const invalid = scratchDiags(diagnostics, INVALID_SLASH_NAME);
      expect(
        invalid.length,
        `direction (i) via CLI: one invalid-slash-name expected on the on-disk file; diagnostics=${json(diagnostics)}`,
      ).toBe(1);
      expect(basename(posix(invalid[0]!.file!))).toBe("Plan.theta");
      expect(invalid[0]!.severity).toBe("error");
    } else {
      expect(caseInsensitive, "case-sensitive filesystem branch").toBe(false);
      // Control: a missing CLI path is an error (CLI_MODES.missing === error).
      const missing = scratchDiags(diagnostics, MISSING_SOURCE);
      expect(
        missing.length,
        `case-sensitive control: one missing-source expected; diagnostics=${json(diagnostics)}`,
      ).toBe(1);
      expect(missing[0]!.severity).toBe("error");
      expect(namedUnderScratch(thetas, "plan")).toBeUndefined();
    }
  });
});

// =============================================================================
// (C) CONTROL — byte-identical neighbour: an EXACT-case settings reference
//     `good.theta` naming on-disk `good.theta`. The on-disk derivation is a
//     no-op for an exact-case entry, so `/good` registers with zero diagnostics
//     pre AND post fix. GREEN today; must stay green (proves the fix does not
//     perturb the ordinary path). No FS-branch: an exact-case reference
//     resolves on any filesystem.
// =============================================================================

describe("bug 0363 (C) — control: exact-case settings reference `good.theta`", () => {
  it("registers `/good` with no diagnostics (exact-case entry, identical pre/post fix)", async () => {
    writeFileSync(join(xNativeDir, "good.theta"), THETA_BODY, "utf8");
    const { thetas, diagnostics } = await runWalk({
      settings: { thetaPaths: [sp("x", "good.theta")] },
    });

    expect(
      namedUnderScratch(thetas, "good"),
      `control: /good must register from an exact-case entry; thetas=${json(thetas)}`,
    ).toBeDefined();
    expect(
      diagnostics.filter((d) => d.file !== undefined && underScratch(d.file)),
      `control: no diagnostics expected under scratch; diagnostics=${json(diagnostics)}`,
    ).toEqual([]);
  });
});
