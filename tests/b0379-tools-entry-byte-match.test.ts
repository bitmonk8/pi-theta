import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";

// Bug 0379 — a `tools:` `.theta` entry's fate is judged on the ENTRY's own
// spelling, not the on-disk file's basename. On a case-insensitive filesystem
// (Windows/NTFS — the host this file runs on) the entry basename can diverge in
// case from the file it resolves to, and the two divergences are the bug:
//
//   (i)  entry `./util.theta` naming on-disk `Util.theta` — the derived default
//        name `util` is lowercase-first, so `resolveThetaCallee` opens the file
//        case-insensitively and the caller SILENTLY registers a callable `util`
//        that a case-sensitive collaborator's checkout cannot resolve
//        (src/parser/callable-set.ts:435-436 — `deps.resolveThetaCallee(spec)`
//        succeeds while `thetaDefaultName(spec)` reads the ENTRY spelling).
//   (ii) entry `./Util.theta` naming on-disk `util.theta` — the derived name
//        `Util` is not lowercase-first, so the caller is un-registered with the
//        LYING diagnostic `'tools:' entry './Util.theta' derives the default
//        name 'Util', which must be lowercase-first; rename the file or add an
//        'as' clause` (src/parser/callable-set.ts:265), whose remedy names a
//        rename of a file (`util.theta`) that already conforms.
//
// FIX WITNESSED — Option BM (byte-match discipline), parent-adjudicated. After
// the `.theta` callee resolves, the ENTRY's basename must BYTE-MATCH the
// resolved file's on-disk basename. A mismatch REFUSES the entry as
// `theta/load/unresolvable-theta-path` — the exact outcome a case-sensitive
// host already produces for a case-variant entry (the entry names no such
// file). The refusal reuses the existing message
// `cannot resolve .theta path '<entry-as-written>'`
// (src/parser/callable-set.ts:445). Byte-matched (exact-spelling) entries are
// unaffected; extension-case variance keeps its own byte-exact refusal.
//
// Option BM is dispatch-safe by construction: a refused entry un-registers its
// caller, so nothing is presented to the model under a name the parse-time body
// layer would derive differently (the split-brain the earlier "on-disk name
// WINS" route hit — the parser has no filesystem seam). Under BM the caller
// does not exist on either host.
//
// SPEC ANCHORS (the contract, not the current code):
//   - frontmatter/frontmatter-fields-a.md:84 — "For a `.theta` path, the
//     default name is **the file's basename** without the `.theta` extension":
//     the rule is defined over the on-disk file, not the entry spelling.
//   - diagnostics/code-registry-load.md:32 — `theta/load/unresolvable-theta-path`,
//     Message `cannot resolve .theta path '<path>'`, `<path>` the entry spec as
//     written (placeholder-rendering-b.md category 5).
//   - lexical.md §Extension matching — `.THETA` is refused byte-exact as
//     `theta/parse/invoke-non-theta-extension` (bug doc §Non-goals); that arm
//     is not this bug and must stay.
//
// TIER — unit, offline, provider-free, deterministic. The reachable input class
// is a `.theta` entry whose case diverges from the on-disk basename, and the
// filesystem's own case-folding is the system-under-test input; only a REAL
// on-disk workspace exercises it, so this drives the SHIPPED composition
// (`discoverAndComposeFixtures`, src/extension/production-composition.ts:391)
// over planted files and reads the load diagnostics off `ctx.ui.notify`
// (production-composition.ts:228 mirrors each error-severity diagnostic there).
// Registration and its diagnostics settle before any model, child process, or
// transport exists, so no integration or live tier can reach this observable
// more cheaply or more deterministically.
//
// NO SILENT SKIPPING — the host branch materialises real `it`s on whichever
// filesystem this runs on (case-insensitive → the two divergence cells;
// case-sensitive → the parity cell); the non-materialised branch is not a
// vitest skip and no `it` returns early. The precondition guard reds by name if
// the `tools:` resolution pass is not running, so no refusal assertion below can
// pass vacuously.

// --- Shipped-composition load harness (pi/ctx doubles copied from ------------
// --- tools-derived-name-shape.test.ts) ---------------------------------------

interface LoadOutcome {
  /** Slash names the production compose helper returned (returned fixtures). */
  readonly registered: readonly string[];
  /** Error-severity diagnostic messages surfaced via `ctx.ui.notify`. */
  readonly notifications: readonly string[];
}

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
  return { registered: fixtures.map((f) => f.slashName), notifications };
}

/**
 * Plant a `.pi/theta/` workspace, run the shipped load, tear the workspace
 * down. Each direction gets its OWN workspace because a case-insensitive
 * filesystem cannot hold both `util.theta` and `Util.theta` in one directory
 * (they share an inode), so the two divergence cells cannot co-tenant.
 */
async function loadWorkspace(
  thetas: Readonly<Record<string, string>>,
): Promise<LoadOutcome> {
  const dir = mkdtempSync(join(tmpdir(), "b0379-"));
  try {
    const thetaDir = join(dir, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    for (const [name, text] of Object.entries(thetas)) {
      writeFileSync(join(thetaDir, name), text, "utf8");
    }
    // A minimal valid settings file pins the settings read to a known value; an
    // ABSENT file is silent (package-and-settings.md §Failure modes), so this is
    // hermeticity, not noise suppression (mirrors the sibling harnesses).
    writeFileSync(join(dir, ".pi", "settings.json"), "{}", "utf8");
    return await runProductionLoad(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The registered / notified sets, rendered for an assertion message. */
function observed(o: LoadOutcome): string {
  return (
    ` [registered=${JSON.stringify(o.registered)}` +
    ` notifications=${JSON.stringify(o.notifications)}]`
  );
}

// --- Fixtures (bug 0379 §Reproduction) ---------------------------------------
// Double-quoted so `${…}` and backticks stay literal `.theta` body text rather
// than TS interpolation.

/** The subagent-mode, valid callee every caller below points at. */
const CALLEE =
  "---\nmode: subagent\nparams:\n  q: string\n---\n@`callee ${q}`\n";

/** A prompt-mode caller with a single `tools:` entry and a body that calls no callable. */
function callerTheta(entry: string): string {
  return "---\nmode: prompt\ntools:\n  - " + entry + "\n---\n@`hi`\n";
}

/** The `theta/load/unresolvable-theta-path` Message for an entry spec as written. */
function unresolvableMessage(entry: string): string {
  return `cannot resolve .theta path '${entry}'`;
}

/** The stable substring of direction (ii)'s HEAD lie (`theta/load/invalid-derived-tool-name`). */
const DERIVED_NAME_SUBSTRING = "derives the default name";

/** The stable substring of the extension refusal (`theta/parse/invoke-non-theta-extension`). */
const NON_THETA_EXTENSION_SUBSTRING = "does not end in .theta";

// --- FS case-sensitivity probe (helper copied VERBATIM from -------------------
// --- tests/b0329-hash-mismatch-refuses-invocation.test.ts cell D; only the ----
// --- probe filename's bug number is localised to b0379) ----------------------

/**
 * Whether the workspace filesystem is case-insensitive: write a lowercase file,
 * attempt the uppercase read. A successful read ⇒ case-insensitive. Only ENOENT
 * is the case-sensitive signal; any other error is a real fault and rethrows
 * (no swallow — CLAUDE.md/AGENTS.md "let crash"). The probe file lives in the
 * per-test tmp workspace and is removed with it.
 */
function filesystemIsCaseInsensitive(dir: string): boolean {
  const lower = join(dir, "b0379-case-probe-aa");
  writeFileSync(lower, "x", "utf8");
  try {
    readFileSync(join(dir, "b0379-case-probe-AA"), "utf8");
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

/** Probe this host's filesystem once, over a throwaway directory. */
function probeCaseSensitivity(): boolean {
  const dir = mkdtempSync(join(tmpdir(), "b0379-probe-"));
  try {
    return filesystemIsCaseInsensitive(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const caseInsensitive = probeCaseSensitivity();

// =============================================================================
// Preconditions guard — the `tools:` resolution pass runs, so no refusal
// assertion below can pass vacuously. Host-agnostic (a nonexistent path is
// unresolvable on every filesystem).
// =============================================================================

describe("bug 0379 (guard) — the tools: resolution pass runs (no vacuous refusals below)", () => {
  it("registers the byte-match control caller and surfaces a known unresolvable refusal", async () => {
    const outcome = await loadWorkspace({
      "util.theta": CALLEE,
      "pcaller.theta": callerTheta("./util.theta"),
      "gcaller.theta": callerTheta("./nonexistent.theta"),
    });
    expect(
      outcome.registered,
      "the byte-match control caller `pcaller` did not register, so every " +
        "refusal assertion below would pass vacuously." + observed(outcome),
    ).toContain("pcaller");
    expect(
      outcome.notifications,
      "no `tools:`-resolution notification surfaced for the deliberately " +
        "nonexistent entry, so the load path is not resolving `tools:` at all " +
        "and every refusal assertion below would pass vacuously." +
        observed(outcome),
    ).toContain(unresolvableMessage("./nonexistent.theta"));
  });
});

// =============================================================================
// (3) Byte-match control — an exact-spelling entry is unaffected by Option BM.
//     GREEN at HEAD and post-fix. Host-agnostic.
// =============================================================================

describe("bug 0379 (3) — an exact-spelling entry registers with no unresolvable refusal", () => {
  it("`./util.theta` naming on-disk `util.theta` registers the caller and draws no unresolvable refusal", async () => {
    const outcome = await loadWorkspace({
      "util.theta": CALLEE,
      "pcaller.theta": callerTheta("./util.theta"),
    });
    expect(
      outcome.registered,
      "a byte-matched entry must keep registering its caller." + observed(outcome),
    ).toContain("pcaller");
    expect(
      outcome.notifications,
      "a byte-matched entry must draw no unresolvable refusal." + observed(outcome),
    ).not.toContain(unresolvableMessage("./util.theta"));
  });
});

// =============================================================================
// (4) Extension-case NON-GOAL — `./util.THETA` keeps its own byte-exact
//     wrong-extension refusal, NOT the unresolvable one. GREEN at HEAD and
//     post-fix. Host-agnostic (the extension check is byte-exact on the entry
//     text, before callee resolution). Bug doc §Non-goals.
// =============================================================================

describe("bug 0379 (4) — `./util.THETA` is refused as a wrong extension, not as unresolvable", () => {
  it("draws the `invoke-non-theta-extension` refusal and not the unresolvable one", async () => {
    const outcome = await loadWorkspace({
      "util.theta": CALLEE,
      "pcaller.theta": callerTheta("./util.THETA"),
    });
    expect(
      outcome.notifications.some((n) => n.includes(NON_THETA_EXTENSION_SUBSTRING)),
      "the wrong-extension entry must keep its byte-exact refusal." +
        observed(outcome),
    ).toBe(true);
    expect(
      outcome.notifications,
      "an extension-case variance is not an unresolvable path." + observed(outcome),
    ).not.toContain(unresolvableMessage("./util.THETA"));
  });
});

// =============================================================================
// Host-dependent cells. On a case-INSENSITIVE host the two divergence cells
// (1) and (2) apply and are RED at HEAD; on a case-SENSITIVE host the parity
// cell (5) applies and is GREEN at HEAD. Exactly one branch materialises on a
// given host; both branches are real `it`s asserting real observables (no
// vitest skip, no early return). Each `it` asserts the probed branch value
// loudly so it is on the record.
// =============================================================================

if (caseInsensitive) {
  describe("bug 0379 (1) — direction (i): silent-accept closes (case-insensitive host)", () => {
    it("`./util.theta` naming on-disk `Util.theta` un-registers the caller with an unresolvable refusal", async () => {
      // At HEAD: `thetaDefaultName('./util.theta')` is `util` (lowercase-first),
      // `resolveThetaCallee` opens `Util.theta` case-insensitively, and the
      // caller SILENTLY registers `util` — RED on both assertions. Under BM the
      // entry basename `util.theta` byte-mismatches the on-disk `Util.theta`, so
      // the entry is refused as `unresolvable-theta-path` and the caller does
      // not register.
      expect(caseInsensitive, "probed filesystem branch: case-INSENSITIVE").toBe(true);
      const outcome = await loadWorkspace({
        "Util.theta": CALLEE,
        "pcaller.theta": callerTheta("./util.theta"),
      });
      expect(
        outcome.registered,
        "direction (i): the case-variant entry resolved case-insensitively and " +
          "the caller registered silently — Option BM must refuse the byte " +
          "mismatch so the caller does not register." + observed(outcome),
      ).not.toContain("pcaller");
      expect(
        outcome.notifications,
        "direction (i): Option BM refuses the byte-mismatched entry with the " +
          "existing unresolvable message." + observed(outcome),
      ).toContain(unresolvableMessage("./util.theta"));
    });
  });

  describe("bug 0379 (2) — direction (ii): lying refusal closes (case-insensitive host)", () => {
    it("`./Util.theta` naming on-disk `util.theta` un-registers with the unresolvable refusal, not the derived-name lie", async () => {
      // At HEAD: `thetaDefaultName('./Util.theta')` is `Util` (not
      // lowercase-first), so the caller is un-registered with the LYING
      // `derives the default name 'Util'` diagnostic that orders a rename of a
      // file (`util.theta`) already conforming. Under BM the entry basename
      // `Util.theta` byte-mismatches the on-disk `util.theta`, so the refusal is
      // the honest `unresolvable-theta-path` and the derived-name lie is gone.
      expect(caseInsensitive, "probed filesystem branch: case-INSENSITIVE").toBe(true);
      const outcome = await loadWorkspace({
        "util.theta": CALLEE,
        "pcaller.theta": callerTheta("./Util.theta"),
      });
      expect(
        outcome.registered,
        "direction (ii): the caller must not register." + observed(outcome),
      ).not.toContain("pcaller");
      expect(
        outcome.notifications,
        "direction (ii): Option BM refuses with the unresolvable message." +
          observed(outcome),
      ).toContain(unresolvableMessage("./Util.theta"));
      expect(
        outcome.notifications.some((n) => n.includes(DERIVED_NAME_SUBSTRING)),
        "direction (ii): the lying `derives the default name` refusal names a " +
          "no-op rename of a conforming file and must be gone under Option BM." +
          observed(outcome),
      ).toBe(false);
    });
  });
} else {
  describe("bug 0379 (5) — parity: a case-variant entry already resolves to no file (case-sensitive host)", () => {
    it("`./Util.theta` naming on-disk `util.theta` un-registers the caller with the same unresolvable refusal Option BM gives a case-insensitive host", async () => {
      // On a case-sensitive host `./Util.theta` names no file, so the entry is
      // already `unresolvable-theta-path` and the caller does not register —
      // the cross-host parity Option BM restores for a case-insensitive host.
      // GREEN at HEAD; this branch exists so the file asserts loudly whichever
      // filesystem it runs on.
      expect(caseInsensitive, "probed filesystem branch: case-SENSITIVE").toBe(false);
      const outcome = await loadWorkspace({
        "util.theta": CALLEE,
        "pcaller.theta": callerTheta("./Util.theta"),
      });
      expect(
        outcome.registered,
        "parity: on a case-sensitive host `./Util.theta` names no file." +
          observed(outcome),
      ).not.toContain("pcaller");
      expect(
        outcome.notifications,
        "parity: the unresolvable refusal is the same outcome Option BM gives a " +
          "case-insensitive host." + observed(outcome),
      ).toContain(unresolvableMessage("./Util.theta"));
    });
  });
}
