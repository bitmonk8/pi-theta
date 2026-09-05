import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { realpath as realpathAsync } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discoverThetas,
  type DiscoveredTheta,
  type DiscoveryInput,
} from "../src/discovery/discovery-walk";
import type { ThetaSettings } from "../src/discovery/settings";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { PiFileSystem } from "../src/seams/pi-file-system";

// Bug 0364 — `ancestorsClean` (src/discovery/discovery-walk.ts) answers false
// for a HEALTHY directory junction / symlinked directory on the ancestor chain.
// Its arm `if (!outcome.ok || !outcome.isDir) return false;` treats a link that
// `lstat`s ok but is not itself a directory (isDirectory()=false,
// isSymbolicLink()=true) as unclean — the correct verdict for a BROKEN link,
// wrong for a healthy one whose target the same walk enumerates. So a cleanly
// MISSING settings/CLI leaf under a junctioned ancestor is classified
// `unreadable-source` instead of the DISC-2-mandated `missing-source`:
//   - settings: WARNING theta/load/unreadable-source ("discovery source is
//     unreadable: settings entry index 0") — should be ERROR
//     theta/load/missing-source ("discovery source path does not exist:
//     settings entry index 0"); code, message AND severity are wrong.
//   - CLI: error either way, but code+message FLIP (unreadable → missing).
//
// DISC-2 (discovery-sources.md:49, failure-modes table :51-58, discriminator
// :68): a clean leaf is an ENOENT "on the candidate path whose ancestors all
// `lstat` successfully as directories the process can enter" — the junctioned
// chain IS enterable (cell 3 enumerates through it), so the natural-language
// rule classifies the missing leaf as *missing*, and the settings *Missing
// path* cell is error. §Fix: on `lstat` ok with `isSymbolicLink()` true,
// resolve the ancestor and `lstat` the target (directory → clean), mirroring
// `classifyResolvedTarget`'s candidate treatment; a broken link stays unclean.
//
// TIER: unit — offline, provider-free, deterministic. The bug doc's
// §Reproduction PRESCRIBES driving `discoverThetas` DIRECTLY over a REAL
// filesystem scratch root with the production `PiFileSystem`; no provider, no
// child process, no live model. A FakeFileSystem cell could not witness this at
// the production seam: the defect is a property of the REAL host's `lstat`
// reporting a directory junction as a non-directory symlink, and the point of
// this witness is that the PRODUCTION `PiFileSystem.lstat` over a REAL NTFS
// junction feeds `ancestorsClean` the isDirectory()=false / isSymbolicLink()=
// true shape the fix must resolve (the fake's link fidelity already carries the
// bug-0075 CANDIDATE fix; this is the ANCESTOR probe, a distinct seam). The
// integration/live tiers add a provider to a decision no model touches.
//
// AMBIENT ISOLATION: the walk also scans the real global root
// (`fs.globalAgentDir()`); every assertion filters to thetas/diagnostics under
// the per-test scratch dir (`underScratch`) so ambient discovery cannot
// pollute. The scratch root is <scratch>; the project conventional root is
// <scratch>/.pi/theta (absent → silent).
//
// No silent skipping: an unmet precondition (the junction did not materialise
// healthy) fails loudly naming it; there is no early return or vitest skip
// anywhere below. LF line endings only. Any `0.NNN.0` in a comment is the
// literal placeholder the fix's version fills.

const MISSING_SOURCE = "theta/load/missing-source";
const UNREADABLE_SOURCE = "theta/load/unreadable-source";

// The two `emitSourceFailure` messages, verbatim from discovery-walk.ts
// (`discovery source path does not exist: <descriptor>` for missing;
// `discovery source is unreadable: <descriptor>` for unreadable), with the
// descriptor rendered in the normative `<kind>:"<value>"` form
// (placeholder-rendering-b.md §5, bug 0461): the settings VALUE is the
// `thetaPaths` entry's own text verbatim (here, the literal path each cell
// passes — no override prefix, so `entry.raw` equals the operand), the CLI
// VALUE is the raw `--theta` operand. Asserting the whole
// {severity,code,file,message} shape makes "emits nothing else" observable.
const settingsDescriptor = (entryText: string): string => `settings:"${entryText}"`;
const cliDescriptor = (operand: string): string => `cli-flag:"--theta ${operand}"`;
const missingMsg = (descriptor: string): string =>
  `discovery source path does not exist: ${descriptor}`;
const unreadableMsg = (descriptor: string): string =>
  `discovery source is unreadable: ${descriptor}`;

/** A body that reads far enough to register — discovery validates the slash
 *  name and file readability only, never the mode block, so a prompt-mode body
 *  suffices to exercise the discovery name/diagnostic this file asserts on. */
const THETA_BODY = "mode: prompt\n---\n";

// ── Scratch workspace ─────────────────────────────────────────────────────────

let scratchDir: string; // native (backslash on Windows) — for on-disk writes
let scratchPosix: string; // forward-slash — for references and prefix compares

/** Forward-slash form for reference/compare (Node fs accepts `/` on Windows and
 *  the walk normalises to `/`; a drive-letter path stays absolute). PiFileSystem
 *  reports forward-slash paths, so the `.file` field is the forward-slash
 *  junction/real spelling. */
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

function scratchNames(thetas: readonly DiscoveredTheta[]): string[] {
  return thetas
    .filter((t) => underScratch(t.path))
    .map((t) => t.name)
    .sort();
}

/** The comparable {severity,code,file,message} shape of every diagnostic whose
 *  file lies under the scratch root — an assertion on the whole array is what
 *  makes "emits nothing else" observable rather than implied. */
function scratchShape(diagnostics: readonly Diagnostic[]): unknown[] {
  return diagnostics
    .filter((d) => d.file !== undefined && underScratch(d.file))
    .map((d) => ({ severity: d.severity, code: d.code, file: d.file, message: d.message }));
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
 * Create `<scratch>/link` → `<scratch>/real` as a real directory alias. On
 * win32 a junction (`cmd /c mklink /J`) is the ordinary Windows spelling of a
 * directory alias and is exactly the ancestor shape the bug targets; on POSIX a
 * `fs.symlinkSync(target, link, "dir")` gives the same `lstat` signature
 * (isDirectory()=false, isSymbolicLink()=true) over a healthy target.
 */
function createDirectoryLink(nativeTargetPath: string, nativeLinkPath: string): void {
  if (process.platform === "win32") {
    execFileSync("cmd", ["/c", "mklink", "/J", nativeLinkPath, nativeTargetPath]);
  } else {
    symlinkSync(nativeTargetPath, nativeLinkPath, "dir");
  }
}

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "b0364-"));
  scratchPosix = posix(scratchDir);
  const realThetas = join(scratchDir, "real", "thetas");
  mkdirSync(realThetas, { recursive: true });
  writeFileSync(join(realThetas, "a.theta"), THETA_BODY, "utf8");
  createDirectoryLink(join(scratchDir, "real"), join(scratchDir, "link"));

  // Loud precondition: the created link must be HEALTHY — `lstat` reports a
  // symlink (isDirectory()=false, the non-directory arm `ancestorsClean`
  // mishandles) AND `realpath` resolves it to the real directory (proving the
  // chain is genuinely traversable, so a missing leaf beneath it is DISC-2
  // *missing*, not *unreadable*). A failed junction fails loudly here, never a
  // skip. The under-junction leaf must also be reachable: `a.theta` exists
  // through the link spelling.
  const linkStat = lstatSync(join(scratchDir, "link"));
  expect(
    linkStat.isSymbolicLink(),
    "precondition: <scratch>/link must be a symlink/junction (isSymbolicLink()=true) — the ancestor shape bug 0364 mishandles",
  ).toBe(true);
  expect(
    linkStat.isDirectory(),
    "precondition: <scratch>/link must NOT itself lstat as a directory (isDirectory()=false) — else the healthy-link arm is never reached",
  ).toBe(false);
  expect(
    posix(realpathSync(join(scratchDir, "link"))).toLowerCase(),
    "precondition: <scratch>/link must realpath-resolve to the real directory (a healthy, traversable link)",
  ).toBe(posix(join(scratchDir, "real")).toLowerCase());
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

// =============================================================================
// (1) SETTINGS junction-missing — PRIMARY RED. A settings `thetaPaths` literal
//     naming a MISSING leaf under the junctioned ancestor. RED at fork: emits
//     WARNING theta/load/unreadable-source. Post-fix (asserted here): ERROR
//     theta/load/missing-source, so it reds now for the RIGHT reason (wrong
//     code, message AND severity on the settings source).
// =============================================================================

describe("bug 0364 (1) — settings junction-missing leaf: missing-source error, not unreadable-source warning", () => {
  it("emits ERROR theta/load/missing-source at the junction-spelled path, nothing else under scratch", async () => {
    const missingUnderLink = sp("link", "thetas", "nope");
    const { thetas, diagnostics } = await runWalk({
      settings: { thetaPaths: [missingUnderLink] },
    });

    expect(scratchNames(thetas), `no theta registers for a missing leaf; thetas=${json(thetas)}`).toEqual([]);
    // §Expected: DISC-2's settings *Missing path* cell is error/missing-source;
    // the junctioned chain is enterable (cell 3 proves it), so the absent leaf
    // is *missing*, not *unreadable*.
    expect(scratchShape(diagnostics)).toEqual([
      {
        severity: "error",
        code: MISSING_SOURCE,
        file: missingUnderLink,
        message: missingMsg(settingsDescriptor(missingUnderLink)),
      },
    ]);
  });
});

// =============================================================================
// (2) SETTINGS real-spelled twin CONTROL — green now AND after. The SAME
//     physical missing leaf spelled through the real directory. Proves the
//     primary red is the junction spelling, not a general break, AND guards
//     that every ancestor ABOVE scratch is itself a clean directory (else this
//     control would also red unreadable).
// =============================================================================

describe("bug 0364 (2) — settings real-spelled twin: missing-source error (control, green pre+post)", () => {
  it("emits ERROR theta/load/missing-source at the real-spelled path, nothing else under scratch", async () => {
    const missingUnderReal = sp("real", "thetas", "nope");
    const { thetas, diagnostics } = await runWalk({
      settings: { thetaPaths: [missingUnderReal] },
    });

    expect(scratchNames(thetas)).toEqual([]);
    expect(scratchShape(diagnostics)).toEqual([
      {
        severity: "error",
        code: MISSING_SOURCE,
        file: missingUnderReal,
        message: missingMsg(settingsDescriptor(missingUnderReal)),
      },
    ]);
  });
});

// =============================================================================
// (3) TRAVERSABILITY CONTROL — green now AND after (bug 0075's candidate fix
//     holds). The junction chain is FULLY readable when the leaf exists: a CLI
//     root spelled through the junction registers `a.theta` with zero
//     under-scratch diagnostics, BYTE-IDENTICAL to the real-spelled twin. This
//     is the observable that makes the junctioned chain "enterable", so the
//     missing-leaf verdict must be *missing*, not *unreadable*.
// =============================================================================

describe("bug 0364 (3) — junction chain is fully traversable: registers `a.theta`, byte-identical to real spelling", () => {
  it("junction-spelled CLI root registers a.theta with zero under-scratch diagnostics, identical to the real spelling", async () => {
    const viaLink = await runWalk({ cliPaths: [sp("link", "thetas")] });
    const viaReal = await runWalk({ cliPaths: [sp("real", "thetas")] });

    // The junction chain enumerates and registers the theta with no complaint.
    expect(scratchNames(viaLink.thetas)).toEqual(["a"]);
    expect(
      scratchShape(viaLink.diagnostics),
      `junction chain is readable → zero under-scratch diagnostics; diagnostics=${json(viaLink.diagnostics)}`,
    ).toEqual([]);

    // Byte-identical to the real spelling: same registered names, same (empty)
    // under-scratch diagnostics. The only difference between the two runs is the
    // ancestor spelling, so identity here proves the chain is fully readable.
    expect(scratchNames(viaLink.thetas)).toEqual(scratchNames(viaReal.thetas));
    expect(scratchShape(viaLink.diagnostics)).toEqual(scratchShape(viaReal.diagnostics));
  });
});

// =============================================================================
// (4) CLI junction-missing — RED (code/message flip). A `--theta` naming a
//     MISSING leaf under the junction. Error at BOTH fork and fix (CLI
//     unreadable AND missing are both error), but code+message FLIP: RED at
//     fork emits theta/load/unreadable-source ("… is unreadable …"); post-fix
//     (asserted) theta/load/missing-source ("… does not exist …").
// =============================================================================

describe("bug 0364 (4) — CLI junction-missing leaf: code+message flip unreadable → missing", () => {
  it("emits ERROR theta/load/missing-source at the junction-spelled path, nothing else under scratch", async () => {
    const missingUnderLink = sp("link", "thetas", "nope");
    const { thetas, diagnostics } = await runWalk({
      cliPaths: [missingUnderLink],
    });

    expect(scratchNames(thetas)).toEqual([]);
    expect(scratchShape(diagnostics)).toEqual([
      {
        severity: "error",
        code: MISSING_SOURCE,
        file: missingUnderLink,
        message: missingMsg(cliDescriptor(missingUnderLink)),
      },
    ]);
  });
});

// =============================================================================
// (5) CLI real-spelled twin CONTROL — green now AND after. Same physical
//     missing leaf spelled through the real directory. Proves cell 4's red is
//     the junction spelling alone.
// =============================================================================

describe("bug 0364 (5) — CLI real-spelled twin: missing-source error (control, green pre+post)", () => {
  it("emits ERROR theta/load/missing-source at the real-spelled path, nothing else under scratch", async () => {
    const missingUnderReal = sp("real", "thetas", "nope");
    const { thetas, diagnostics } = await runWalk({
      cliPaths: [missingUnderReal],
    });

    expect(scratchNames(thetas)).toEqual([]);
    expect(scratchShape(diagnostics)).toEqual([
      {
        severity: "error",
        code: MISSING_SOURCE,
        file: missingUnderReal,
        message: missingMsg(cliDescriptor(missingUnderReal)),
      },
    ]);
  });
});

// =============================================================================
// (6) SETTINGS broken-link-ancestor NEGATIVE GUARD — green pre AND post. The
//     fix (discovery-walk.ts) makes a HEALTHY link ancestor diverge from a
//     BROKEN one via `resolvedAncestorIsDir`; the healthy arm's *missing*
//     verdict is witnessed by cells 1/4, and this cell pins the BROKEN arm so
//     a future change that treated any link ancestor as clean (accepting the
//     link without proving its target resolves to a directory) is caught. A
//     link whose target has been removed — so `lstat` still reports a symlink
//     but `realpath` REJECTS — must classify as *unreadable*, per the retained
//     spec sentence "Use `lstat` (not `stat`) as the ancestor probe so a
//     broken symlink at an ancestor classifies as *unreadable* rather than
//     silently traversing." A broken link was unclean before this bug's fix
//     and must stay unclean after it, so this cell is a divergence guard, not
//     a fork-dependent witness.
// =============================================================================

describe("bug 0364 (6) — settings broken-link-ancestor: unreadable-source warning (negative guard, green pre+post)", () => {
  it("emits WARNING theta/load/unreadable-source at the broken-link-spelled path, nothing else under scratch", async () => {
    const goneTargetNative = join(scratchDir, "gone-target");
    const brokenLinkNative = join(scratchDir, "broken");
    mkdirSync(goneTargetNative, { recursive: true });
    createDirectoryLink(goneTargetNative, brokenLinkNative);
    rmSync(goneTargetNative, { recursive: true, force: true });

    // Loud precondition: the link must still `lstat` as a symlink (its target's
    // removal does not touch the link entry itself) AND `realpath` must REJECT
    // (proving the link is genuinely broken, not merely unusual). Asserted via
    // a .then(ok, err) rejection arm, matching this file's no-catch(...) style;
    // an unmet precondition fails loudly by name, never a skip.
    const brokenLinkStat = lstatSync(brokenLinkNative);
    expect(
      brokenLinkStat.isSymbolicLink(),
      "precondition: <scratch>/broken must remain a symlink/junction after its target is removed — else this cell is not exercising a broken link",
    ).toBe(true);
    await realpathAsync(brokenLinkNative).then(
      (resolved) => {
        throw new Error(
          `precondition: <scratch>/broken must have a rejecting realpath (a broken link) — it resolved to ${resolved} instead`,
        );
      },
      (err: NodeJS.ErrnoException) => {
        expect(
          err.code,
          `precondition: <scratch>/broken's realpath must reject ENOENT-class — got code=${json(err.code)}`,
        ).toBe("ENOENT");
      },
    );

    const missingUnderBroken = sp("broken", "thetas", "nope");
    const { thetas, diagnostics } = await runWalk({
      settings: { thetaPaths: [missingUnderBroken] },
    });

    expect(scratchNames(thetas), `no theta registers past a broken-link ancestor; thetas=${json(thetas)}`).toEqual(
      [],
    );
    expect(scratchShape(diagnostics)).toEqual([
      {
        severity: "warning",
        code: UNREADABLE_SOURCE,
        file: missingUnderBroken,
        message: unreadableMsg(settingsDescriptor(missingUnderBroken)),
      },
    ]);
  });
});

// =============================================================================
// (7) SETTINGS IMMEDIATE broken-link-ancestor DISCRIMINATOR — the leaf sits
//     DIRECTLY under the broken link (no intermediate segment), so
//     `<scratch>/broken` is the LAST ancestor the walk probes and
//     `resolvedAncestorIsDir` is the SOLE decider — nothing deeper can ENOENT
//     first and mask the verdict. This is the cell that genuinely exercises the
//     fix's resolve-then-`lstat`-target step: a broken link's `realpath`
//     rejects, so the ancestor is unclean and the missing leaf is *unreadable*
//     (retained spec sentence "a broken symlink at an ancestor classifies as
//     *unreadable*"). A regression that accepted any `lstat`-ok symlink
//     ancestor without proving its target resolves to a directory would
//     misclassify this leaf as *missing* (error) — this cell reds on it while
//     cell 6, whose deeper `thetas/` segment ENOENTs at the OS level, would
//     not. Green under the shipped fix.
// =============================================================================

describe("bug 0364 (7) — settings immediate broken-link-ancestor: unreadable-source warning (resolve-step discriminator)", () => {
  it("emits WARNING theta/load/unreadable-source for a leaf directly under a broken link, nothing else under scratch", async () => {
    const goneTargetNative = join(scratchDir, "gone-target");
    const brokenLinkNative = join(scratchDir, "broken");
    mkdirSync(goneTargetNative, { recursive: true });
    createDirectoryLink(goneTargetNative, brokenLinkNative);
    rmSync(goneTargetNative, { recursive: true, force: true });

    // Same loud broken-link precondition as cell 6: the link `lstat`s as a
    // symlink but `realpath` rejects. An unmet precondition fails loudly.
    const brokenLinkStat = lstatSync(brokenLinkNative);
    expect(
      brokenLinkStat.isSymbolicLink(),
      "precondition: <scratch>/broken must remain a symlink/junction after its target is removed",
    ).toBe(true);
    await realpathAsync(brokenLinkNative).then(
      (resolved) => {
        throw new Error(
          `precondition: <scratch>/broken must have a rejecting realpath (a broken link) — it resolved to ${resolved} instead`,
        );
      },
      (err: NodeJS.ErrnoException) => {
        expect(
          err.code,
          `precondition: <scratch>/broken's realpath must reject ENOENT-class — got code=${json(err.code)}`,
        ).toBe("ENOENT");
      },
    );

    // Leaf DIRECTLY under the broken link: `<scratch>/broken` is the final
    // ancestor, so its resolve-step verdict alone decides the walk.
    const missingUnderBroken = sp("broken", "nope");
    const { thetas, diagnostics } = await runWalk({
      settings: { thetaPaths: [missingUnderBroken] },
    });

    expect(scratchNames(thetas), `no theta registers past a broken-link ancestor; thetas=${json(thetas)}`).toEqual(
      [],
    );
    expect(scratchShape(diagnostics)).toEqual([
      {
        severity: "warning",
        code: UNREADABLE_SOURCE,
        file: missingUnderBroken,
        message: unreadableMsg(settingsDescriptor(missingUnderBroken)),
      },
    ]);
  });
});
