import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  discoverThetas,
  type DiscoveredTheta,
  type DiscoveryInput,
} from "../src/discovery/discovery-walk";
import {
  discoverPackageThetas,
  type PackageDiscoveryInput,
} from "../src/discovery/package-discovery";
import type { Diagnostic, Severity } from "../src/diagnostics/diagnostic";
import type { FileStat, FileSystem } from "../src/seams/file-system";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileSystem } from "./helpers/fake-file-system";

// Bug 0076 — a discovery root that exists but whose enumeration fails
// contributes zero thetas and zero diagnostics
// (docs/bugs/0076-existing-root-enumeration-failure-silent.md).
//
// GOVERNING SPEC (docs/spec_topics/discovery/discovery-sources.md):
//   :51-56  DISC-2 failure-modes table, *Unreadable path* column — warning for
//           Global, Project, Package `theta/`, Package `pi.theta`, Settings;
//           error for CLI `--theta <path>`.
//   :51-56  the same table's *Missing path* column, which splits the two
//           package rows: silent for `Package theta/ directory` ("package may
//           ship none"), error for `Package pi.theta entry` ("manifest names a
//           missing path") — one enumeration call, two dispositions.
//   :61     rule 2 — every such diagnostic "carries the source descriptor in
//           its `message` so the author can locate the offending
//           configuration — e.g. `"settings entry index 2"`,
//           `"--theta flag #1"`, `` "package `foo` (pi.theta[0])" ``,
//           `` "package `foo` theta/ directory" ``,
//           `"global thetas directory"`, `"project .pi/theta/"`".
//   :62     rule 3 — "Errors are fatal for the offending entry only, not for
//           the whole discovery pass".
//   :66     the clean-leaf-`ENOENT` walk — "on `ENOENT`, walk the candidate
//           path's ancestor chain root-first; if every ancestor `lstat`s `ok`
//           and is a directory, classify the result as *missing* …; if any
//           ancestor `lstat` returns `EACCES`, `EPERM`, `ENOTDIR`, or itself
//           `ENOENT`, classify the result as *unreadable*". Same bullet names
//           `EACCES` / `EPERM` / `ENOTDIR` as the codes branched on, and gives
//           the Windows motivation: "a parent ACL denies enumeration".
//   :67     "A symlink loop or other traversal failure *inside* a discovery
//           root that does exist is an unreadable-source warning, not silence
//           — the silent-on-missing rule applies to the *root* itself not
//           existing, not to failures encountered while walking a root that
//           does."
//   :68     "an empty directory — or one whose entries are all non-`.theta`
//           files — enumerates zero thetas successfully and emits no
//           diagnostic".
// docs/spec_topics/discovery/package-and-settings.md:32 — "a missing `theta/`
//   fallback directory is silent (the package may simply ship none)"; :25 names
//   the `` "package `foo` (pi.theta)" `` descriptor form.
//
// THE DEFECT AT HEAD. The walk decides "is this root a directory" with
// `classifyPath` (src/discovery/discovery-walk.ts:273) and "can this root be
// enumerated" with `enumerateDirectory` (:301). The first reports its failures;
// the second maps every `fs.readdir` rejection to `{ ok: false }` without
// capturing `.code` (:306-309) and returns `[]` with no diagnostic (:310-312).
// A root that passes `lstat` and fails `readdir` therefore yields zero thetas
// and zero diagnostics through every caller: `resolveEntry`'s `dir` arm (:388,
// the CLI / project / global roots), the settings literal path `addDir`
// (:649-653), and the settings glob path `addGlob` (:695-705). The package
// walker repeats the swallow in `thetasInDirectory`
// (src/discovery/package-discovery.ts:442-454, via `readdirOr` at :159-164),
// which serves both the conventional `theta/` fallback (:501) and each
// directory a `pi.theta` entry contributes (:432).
//
// PINNED POST-FIX CONTRACT (bug doc §Fix, Option A — "pass the severity down"
// and emit from inside the failure branch). On a `readdir` rejection inside the
// enumeration of a discovery root, the walk emits through the existing
// `emitSourceFailure` helper (discovery-walk.ts:444-462) at the CALLING
// source's `FailureModes` severity, with `file` = the enumerated root path and
// the source descriptor in the message:
//   - rejection code is not `ENOENT`               → `theta/load/unreadable-source`
//                                                    at `modes.unreadable`
//   - `ENOENT`, every proper ancestor `lstat`s ok  → `theta/load/missing-source`
//     as a directory (the :66 clean-leaf walk,       at `modes.missing` (null,
//     `ancestorsClean` at :243)                      i.e. silent, for the
//                                                    conventional roots)
//   - `ENOENT`, dirty ancestor chain               → `theta/load/unreadable-source`
//                                                    at `modes.unreadable`
// Descriptors are the ones the walk already carries: `"project .pi/theta/"`
// (:790), `"global thetas directory"` (:803), `"--theta flag #<n>"` 1-based
// (:770), `"settings entry index <n>"` 0-based (:685); a glob-matched directory
// carries the matching entry's `"settings entry index <n>"`. The package walker
// carries `` "package `<name>` theta/ directory" `` for the conventional
// fallback and `` "package `<name>` (pi.theta)" `` for a `pi.theta`-contributed
// directory.
//
// A denied SUBTREE under a settings glob's static prefix (`listTree`,
// discovery-walk.ts:547 and package-discovery.ts:310) is DEFERRED — no spec
// text prescribes a disposition for a shrunken glob universe (bug doc §Fix,
// recommendation). No cell here asserts a diagnostic for that sub-case. The
// latitude that keeps it free is granted per cell, only where a deferred
// traversal actually crosses the path under test: cells 6 and 14 (the settings
// glob and the `pi.theta` directory) assert "at least one matching diagnostic"
// rather than an exact pass-wide count, because `listTree` traverses their
// denied path too; cell 15 pins an exact count of the diagnostics carrying its
// (code, file) pair, which leaves the deferred sub-case free to emit under a
// different code. Cell 12 gets no latitude at all: with `pi.theta` absent no
// `listTree` runs, so nothing deferred can reach that path and the cell pins an
// exact pass-wide count.
//
// RED AT HEAD (each on its own primary assertion — the diagnostic is absent):
//   1  project root, `readdir` EACCES        → warning
//   2  global root, `readdir` EPERM          → warning
//   3  CLI `--theta` root, `readdir` ELOOP   → ERROR (the sharpest cell)
//   4  project root, `readdir` ENOTDIR       → warning
//   5  settings literal dir entry, EACCES    → warning
//   6  settings glob-matched dir, EPERM      → warning
//   8  CLI root, clean-leaf `ENOENT`         → ERROR missing-source
//   9  denied project root + readable global → diagnostic AND the global theta
//  11  severity linkage: warning / warning / warning / error
//  12  package `theta/` fallback, EACCES     → warning
//  14  package `pi.theta` dir, EACCES        → warning
//  15  package `pi.theta` dir, clean `ENOENT` → ERROR missing-source (the
//      Missing cell that differs from the `theta/` row's)
//
// GREEN CONTROLS (hold at HEAD and must still hold post-fix):
//   0  the bug doc's §Reproduction control — the SAME root denied on every seam
//      member, so `lstat` fails too and the walk takes the already-correct
//      `classifyPath` arm. It asserts the identical shape cells 1-4 assert, so
//      it proves the expected diagnostic is reachable through
//      `emitSourceFailure` and the reds are a delivery gap in
//      `enumerateDirectory`, not a mis-specified expectation.
//   7  project root, clean-leaf `ENOENT` → SILENT (:51-52 Missing column is
//      "silent" for the conventional roots; guards the fix against
//      over-emission)
//  10  genuinely empty project root (`readdir` resolves `[]`) → SILENT (:68)
//  13  package with no `theta/` directory at all → SILENT
//      (package-and-settings.md:32)
//  16  package `theta/` fallback whose readdir rejects clean `ENOENT` while
//      `lstat` reports a directory → SILENT (the `Package theta/ directory`
//      row's Missing cell; the silence half of cell 15's row split)
//
// THE INJECTION SEAM. `tests/helpers/fake-file-system.ts` rejects EVERY member
// for a path in its `errors` map, so `lstat` fails too and the walk takes the
// `classifyPath` branch — which already reports correctly (that is the bug
// doc's §Reproduction control, and tests/discovery-walk.test.ts:168-183 pins
// it). Witnessing this defect needs `readdir` to reject while `lstat` still
// reports a directory, so the local `ReaddirDenied` decorator below rejects
// `readdir` for exactly one configured path with a Node-style `.code` and
// delegates every other member to an inner `FakeFileSystem`. The decorator
// shape mirrors `InstrumentedFileSystem`
// (tests/package-discovery.test.ts:60-113).

// ===========================================================================
// The registry rows (DIAG-4) — every expected message below is sourced from
// the Message column of docs/spec_topics/diagnostics/code-registry-load.md,
// never pasted prose. Helper shapes mirror tests/load-warning-delivery.test.ts.
// ===========================================================================

interface RegistryRow {
  code: string;
  namespace: string;
  severity: string;
  phase: string;
  trigger: string;
  message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-load.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

/** The row's normative Message template (DIAG-4), asserted present loudly. */
function loadRowMessage(code: string): string {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    message,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-load.md must carry ` +
      `the Message row for ${code}`,
  ).toBeDefined();
  return message!;
}

/** Interpolate a registry Message template's `<placeholder>` slots. */
function interpolate(template: string, subs: Record<string, string>): string {
  return template.replace(/<([a-z-]+)>/g, (whole, name: string) => subs[name] ?? whole);
}

/**
 * A registry Message template as a whole-string RegExp with every
 * `<placeholder>` slot widened to `.+` — used where the descriptor's exact
 * spelling is left open by the spec (`(pi.theta)` at
 * package-and-settings.md:25 vs `(pi.theta[0])` at discovery-sources.md:61).
 */
function templateToRegExp(template: string): RegExp {
  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/<[a-z-]+>/g, ".+");
  return new RegExp(`^${escaped}$`);
}

const MISSING_SOURCE = "theta/load/missing-source";
const UNREADABLE_SOURCE = "theta/load/unreadable-source";

// ===========================================================================
// Fixtures. Shapes mirror tests/discovery-walk.test.ts:23-85.
// ===========================================================================

const HOME = "/home/theta";
const CWD = "/project";
const GLOBAL_ROOT = "/home/theta/.pi/agent/theta";
const PROJECT_ROOT = "/project/.pi/theta";
const NM = "/project/node_modules";

/** A body that parses far enough to register (the walk only reads bytes). */
const THETA_BODY = "mode: prompt\n---\n";

/** Proper-ancestor directories of `leaf`, so an `ENOENT` on `leaf` is a CLEAN
 *  leaf under the :66 walk (every ancestor `lstat`s ok as a directory) rather
 *  than an unreadable ancestor chain. The leaf itself is NOT registered. */
function ancestors(leaf: string): Record<string, string[]> {
  const segs = leaf.split("/").filter((s) => s.length > 0);
  const out: Record<string, string[]> = { "/": [] };
  let parent = "/";
  for (let i = 0; i < segs.length - 1; i++) {
    const path = parent === "/" ? `/${segs[i]}` : `${parent}/${segs[i]}`;
    out[path] = [];
    parent = path;
  }
  return out;
}

/** Merge several dirs maps, concatenating entry lists for shared keys. */
function mergeDirs(
  ...maps: Record<string, readonly string[]>[]
): Record<string, readonly string[]> {
  const out: Record<string, string[]> = {};
  for (const m of maps) {
    for (const [k, v] of Object.entries(m)) {
      out[k] = [...(out[k] ?? []), ...v];
    }
  }
  return out;
}

/** The two conventional roots' ancestor chains, in every walk fixture: an
 *  absent conventional root then classifies as a clean (silent) missing rather
 *  than as an unreadable ancestor failure, so each cell's diagnostic count is
 *  about the root under test alone. */
const BASE = mergeDirs(ancestors(GLOBAL_ROOT), ancestors(PROJECT_ROOT));

/** The five installed-package roots `packageRoots` enumerates
 *  (src/discovery/package-discovery.ts:232-242), registered as empty
 *  directories so a root's absence never contributes an incidental `readdir`
 *  rejection to a package cell's diagnostic set. */
const PKG_ROOTS: Record<string, readonly string[]> = {
  "/project/.pi/npm": [],
  "/project/.pi/git": [],
  [NM]: [],
  "/home/theta/.pi/agent/npm": [],
  "/home/theta/.pi/agent/git": [],
};

interface FakeSpec {
  readonly dirs?: Record<string, readonly string[]>;
  readonly files?: Record<string, string>;
  /** Per-path `.code` rejections applied to EVERY seam member (the fake's own
   *  `errors` map) — the control's blunt injection, not this defect's seam. */
  readonly errors?: Record<string, string>;
}

function build(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: mergeDirs(BASE, spec.dirs ?? {}),
    files: spec.files ?? {},
    errors: spec.errors ?? {},
  });
}

function buildPackages(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: mergeDirs(PKG_ROOTS, spec.dirs ?? {}),
    files: spec.files ?? {},
  });
}

/**
 * A `FileSystem` decorator that rejects `readdir` for exactly one path with a
 * Node-style `.code` and delegates every other member — notably `lstat` — to an
 * inner `FakeFileSystem`. This is the seam that reaches the defect: the root
 * classifies as a directory and only its enumeration fails.
 */
class ReaddirDenied implements FileSystem {
  readonly #inner: FakeFileSystem;
  readonly #denied: string;
  readonly #code: string;

  constructor(inner: FakeFileSystem, denied: string, code: string) {
    this.#inner = inner;
    this.#denied = denied;
    this.#code = code;
  }

  readdir(path: string): Promise<readonly string[]> {
    if (path === this.#denied) {
      const error: NodeJS.ErrnoException = new Error(`${this.#code}: readdir`);
      error.code = this.#code;
      return Promise.reject(error);
    }
    return this.#inner.readdir(path);
  }

  readText(path: string): Promise<string> {
    return this.#inner.readText(path);
  }
  readBytes(path: string): Promise<Uint8Array> {
    return this.#inner.readBytes(path);
  }
  writeText(path: string, contents: string): Promise<void> {
    return this.#inner.writeText(path, contents);
  }
  exists(path: string): Promise<boolean> {
    return this.#inner.exists(path);
  }
  homedir(): string {
    return this.#inner.homedir();
  }
  cwd(): string {
    return this.#inner.cwd();
  }
  lstat(path: string): Promise<FileStat> {
    return this.#inner.lstat(path);
  }
  realpath(path: string): Promise<string> {
    return this.#inner.realpath(path);
  }
}

function input(fs: FileSystem, extra: Partial<DiscoveryInput> = {}): DiscoveryInput {
  return { fs, settings: {}, ...extra };
}

function packageInput(fs: FileSystem): PackageDiscoveryInput {
  return { fs, clock: new FakeClock(), settings: {} };
}

function byCode(diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

function named(
  thetas: readonly DiscoveredTheta[],
  name: string,
): DiscoveredTheta | undefined {
  return thetas.find((t) => t.name === name);
}

/** The diagnostics carrying `code` and locating `file` (DISC-2 rule 2: `file`
 *  is the enumerated root path). */
function hitsFor(
  diagnostics: readonly Diagnostic[],
  code: string,
  file: string,
): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code && d.file === file);
}

interface ExpectedFailure {
  readonly code: string;
  readonly severity: Severity;
  readonly file: string;
  readonly descriptor: string;
}

/**
 * The bug-0076 pin: the enumeration failure of `expected.file` surfaced as one
 * diagnostic with the full DISC-2 shape — code, the source row's severity, the
 * root path in `file`, and the registry-sourced message carrying the source
 * descriptor. The PRIMARY assertion quotes every observed diagnostic so the
 * red-at-HEAD output proves the documented reason: nothing is emitted at all.
 */
function expectEnumerationFailure(
  diagnostics: readonly Diagnostic[],
  expected: ExpectedFailure,
  why: string,
): Diagnostic {
  const hits = hitsFor(diagnostics, expected.code, expected.file);
  expect(
    hits.length,
    `PRIMARY (bug 0076): ${why} — discovery-sources.md:67 forbids silence here ` +
      `("an unreadable-source warning, not silence"), and :51-56 gives the row a ` +
      `severity. AT HEAD enumerateDirectory (src/discovery/discovery-walk.ts:306-312) ` +
      `discards the readdir rejection without capturing .code and returns [] with no ` +
      `diagnostic, so the root contributes nothing and reports nothing. Observed ` +
      `diagnostics=${JSON.stringify(diagnostics)}`,
  ).toBeGreaterThanOrEqual(1);
  const diagnostic = hits[0]!;
  expect(
    diagnostic.severity,
    `DISC-2 (discovery-sources.md:51-56) gives this source's failure severity ` +
      `${expected.severity}`,
  ).toBe(expected.severity);
  expect(
    diagnostic.message,
    `DIAG-4: the message is the registry row's Message column interpolated with the ` +
      `source descriptor (discovery-sources.md:61)`,
  ).toBe(interpolate(loadRowMessage(expected.code), { descriptor: expected.descriptor }));
  return diagnostic;
}

// ===========================================================================
// Cells 1-11 — `discoverThetas`: the CLI, settings, project, and global roots.
// ===========================================================================

describe("bug 0076 — a discovery root whose readdir rejects reports its failure (discovery-sources.md:51-56, :66-67)", () => {
  it("control 0 (green): the same project root denied on EVERY seam member reports the shape cells 1-4 assert (the bug doc's §Reproduction control)", async () => {
    // `lstat` fails here too, so `classifyPath`
    // (src/discovery/discovery-walk.ts:273-291) returns `unreadable` at :281 and
    // `resolveEntry` emits at :420. The assertion is byte-identical to cell 1's,
    // which is what makes cell 1's red a delivery gap rather than an
    // over-specified expectation: the code, severity, `file`, and
    // registry-sourced message are all producible by the walk as it stands.
    const fs = build({
      dirs: { [PROJECT_ROOT]: ["a.theta"] },
      files: { [`${PROJECT_ROOT}/a.theta`]: THETA_BODY },
      errors: { [PROJECT_ROOT]: "EACCES" },
    });

    const { diagnostics } = await discoverThetas(input(fs));

    expectEnumerationFailure(
      diagnostics,
      {
        code: UNREADABLE_SOURCE,
        severity: "warning",
        file: PROJECT_ROOT,
        descriptor: "project .pi/theta/",
      },
      "the root fails classification, which the walk already reports",
    );
    expect(diagnostics, "one root denied, one diagnostic").toHaveLength(1);
  });

  it("RED 1: project `.pi/theta` denied EACCES on readdir (lstat ok) emits exactly one unreadable-source warning naming `project .pi/theta/`", async () => {
    const fs = new ReaddirDenied(
      build({
        dirs: { [PROJECT_ROOT]: ["a.theta"] },
        files: { [`${PROJECT_ROOT}/a.theta`]: THETA_BODY },
      }),
      PROJECT_ROOT,
      "EACCES",
    );

    const { thetas, diagnostics } = await discoverThetas(input(fs));

    // The loss half of the defect, true at HEAD and post-fix: the theta under
    // the denied root cannot register. Only the reporting half changes.
    expect(
      thetas,
      "guard: the denied root contributes no theta either way",
    ).toHaveLength(0);
    expectEnumerationFailure(
      diagnostics,
      {
        code: UNREADABLE_SOURCE,
        severity: "warning",
        file: PROJECT_ROOT,
        descriptor: "project .pi/theta/",
      },
      "the project root exists as a directory and its enumeration is denied " +
        "(EACCES — the Windows parent-ACL case discovery-sources.md:66 cites)",
    );
    // :62 scopes the emission to the offending entry: the absent global root
    // stays silent, so the pass carries this one diagnostic and no other.
    expect(
      diagnostics,
      "one bad root emits its own diagnostic and nothing else (discovery-sources.md:62); " +
        "the absent global root's Missing cell is silent (:51)",
    ).toHaveLength(1);
  });

  it("RED 2: global `~/.pi/agent/theta` denied EPERM on readdir emits an unreadable-source warning naming `global thetas directory`", async () => {
    const fs = new ReaddirDenied(
      build({
        dirs: { [GLOBAL_ROOT]: ["g.theta"] },
        files: { [`${GLOBAL_ROOT}/g.theta`]: THETA_BODY },
      }),
      GLOBAL_ROOT,
      "EPERM",
    );

    const { diagnostics } = await discoverThetas(input(fs));

    expectEnumerationFailure(
      diagnostics,
      {
        code: UNREADABLE_SOURCE,
        severity: "warning",
        file: GLOBAL_ROOT,
        descriptor: "global thetas directory",
      },
      "the global root exists as a directory and its enumeration is denied (EPERM, " +
        "the second code discovery-sources.md:66 names)",
    );
    expect(
      byCode(diagnostics, UNREADABLE_SOURCE),
      "one root denied, one unreadable-source diagnostic",
    ).toHaveLength(1);
  });

  it("RED 3: CLI `--theta` root denied ELOOP on readdir emits an unreadable-source ERROR naming `--theta flag #1`", async () => {
    // The sharpest cell: DISC-2 (:56) makes every failure mode of the CLI
    // source an error, and :67 names a symlink loop inside an existing root as
    // exactly this state.
    const fs = new ReaddirDenied(
      build({
        dirs: { ...ancestors("/opt/loop"), "/opt/loop": ["c.theta"] },
        files: { "/opt/loop/c.theta": THETA_BODY },
      }),
      "/opt/loop",
      "ELOOP",
    );

    const { diagnostics } = await discoverThetas(input(fs, { cliPaths: ["/opt/loop"] }));

    expectEnumerationFailure(
      diagnostics,
      {
        code: UNREADABLE_SOURCE,
        severity: "error",
        file: "/opt/loop",
        descriptor: "--theta flag #1",
      },
      "the operator named this path on the command line and its enumeration fails " +
        "with a symlink loop (discovery-sources.md:67)",
    );
    expect(
      byCode(diagnostics, UNREADABLE_SOURCE),
      "one root denied, one unreadable-source diagnostic",
    ).toHaveLength(1);
  });

  it("RED 4: project `.pi/theta` denied ENOTDIR on readdir emits an unreadable-source warning", async () => {
    // ENOTDIR is the third code discovery-sources.md:66 branches on — a racing
    // replacement of the root between `lstat` and `readdir`.
    const fs = new ReaddirDenied(
      build({
        dirs: { [PROJECT_ROOT]: ["a.theta"] },
        files: { [`${PROJECT_ROOT}/a.theta`]: THETA_BODY },
      }),
      PROJECT_ROOT,
      "ENOTDIR",
    );

    const { diagnostics } = await discoverThetas(input(fs));

    expectEnumerationFailure(
      diagnostics,
      {
        code: UNREADABLE_SOURCE,
        severity: "warning",
        file: PROJECT_ROOT,
        descriptor: "project .pi/theta/",
      },
      "the project root's enumeration fails with ENOTDIR, the third code " +
        "discovery-sources.md:66 names",
    );
    expect(
      byCode(diagnostics, UNREADABLE_SOURCE),
      "one root denied, one unreadable-source diagnostic",
    ).toHaveLength(1);
  });

  it("RED 5: a settings literal directory entry denied EACCES on readdir emits an unreadable-source warning naming `settings entry index 0`", async () => {
    const fs = new ReaddirDenied(
      build({
        dirs: { "/project/.pi/t": ["s.theta"] },
        files: { "/project/.pi/t/s.theta": THETA_BODY },
      }),
      "/project/.pi/t",
      "EACCES",
    );

    const { diagnostics } = await discoverThetas(
      input(fs, { settings: { thetaPaths: ["t"], thetaPathsBaseDir: "/project/.pi" } }),
    );

    expectEnumerationFailure(
      diagnostics,
      {
        code: UNREADABLE_SOURCE,
        severity: "warning",
        file: "/project/.pi/t",
        descriptor: "settings entry index 0",
      },
      "the settings entry resolves to an existing directory whose enumeration is " +
        "denied; the Settings row's Unreadable cell is a warning (:55)",
    );
    expect(
      byCode(diagnostics, UNREADABLE_SOURCE),
      "one root denied, one unreadable-source diagnostic",
    ).toHaveLength(1);
  });

  it("RED 6: a settings glob-matched directory denied EPERM on readdir emits an unreadable-source warning naming the matching entry's `settings entry index 0`", async () => {
    // `addGlob` (src/discovery/discovery-walk.ts:707-717) reaches
    // `enumerateDirectory` once per matched directory; the descriptor it
    // carries is the matching entry's index, the form :61 already names for the
    // settings source. The glob UNIVERSE walk (`listTree`, :547) also fails on
    // this path; that sub-case is deferred, hence the "at least one" pin.
    const fs = new ReaddirDenied(
      build({
        dirs: { "/project/.pi/g": ["sub"], "/project/.pi/g/sub": ["s.theta"] },
        files: { "/project/.pi/g/sub/s.theta": THETA_BODY },
      }),
      "/project/.pi/g/sub",
      "EPERM",
    );

    const { diagnostics } = await discoverThetas(
      input(fs, { settings: { thetaPaths: ["g/*"], thetaPathsBaseDir: "/project/.pi" } }),
    );

    expectEnumerationFailure(
      diagnostics,
      {
        code: UNREADABLE_SOURCE,
        severity: "warning",
        file: "/project/.pi/g/sub",
        descriptor: "settings entry index 0",
      },
      "the glob matched an existing directory whose enumeration is denied (EPERM)",
    );
  });

  it("control 7 (green): a project root whose readdir rejects ENOENT with a clean ancestor chain stays SILENT", async () => {
    // The Missing column of the Project row (:52) is "silent", and the :66
    // clean-leaf walk is what separates this from cells 1-4: every proper
    // ancestor `lstat`s ok as a directory, so the state is *missing*, not
    // *unreadable*. This control guards the fix against over-emission — the
    // conventional roots' normal absence must not start warning.
    const fs = new ReaddirDenied(
      build({ dirs: { [PROJECT_ROOT]: [] } }),
      PROJECT_ROOT,
      "ENOENT",
    );

    const { thetas, diagnostics } = await discoverThetas(input(fs));

    expect(thetas, "no root contributes a theta").toHaveLength(0);
    expect(
      diagnostics,
      "a clean-leaf ENOENT on a conventional root is silent (discovery-sources.md:52 " +
        "Missing column, :66 clean-leaf walk) — the fix must not emit here",
    ).toHaveLength(0);
  });

  it("RED 8: a CLI `--theta` root whose readdir rejects ENOENT with a clean ancestor chain emits a missing-source ERROR naming `--theta flag #1`", async () => {
    // Same clean-leaf classification as control 7, opposite severity cell: the
    // CLI row's Missing column (:56) is "error (explicit user intent)".
    const fs = new ReaddirDenied(
      build({ dirs: { ...ancestors("/opt/gone"), "/opt/gone": [] } }),
      "/opt/gone",
      "ENOENT",
    );

    const { diagnostics } = await discoverThetas(input(fs, { cliPaths: ["/opt/gone"] }));

    expectEnumerationFailure(
      diagnostics,
      {
        code: MISSING_SOURCE,
        severity: "error",
        file: "/opt/gone",
        descriptor: "--theta flag #1",
      },
      "the CLI root's enumeration reports ENOENT and every proper ancestor lstats ok " +
        "as a directory, so the :66 walk classifies it missing — an error for the CLI row",
    );
    expect(
      byCode(diagnostics, MISSING_SOURCE),
      "one root, one missing-source diagnostic",
    ).toHaveLength(1);
  });

  it("RED 9: a denied project root does not abort the pass — the diagnostic is emitted AND a readable global root's theta still registers", async () => {
    // discovery-sources.md:62 — "Errors are fatal for the offending entry
    // only, not for the whole discovery pass".
    const fs = new ReaddirDenied(
      build({
        dirs: { [PROJECT_ROOT]: ["p.theta"], [GLOBAL_ROOT]: ["ok.theta"] },
        files: {
          [`${PROJECT_ROOT}/p.theta`]: THETA_BODY,
          [`${GLOBAL_ROOT}/ok.theta`]: THETA_BODY,
        },
      }),
      PROJECT_ROOT,
      "EACCES",
    );

    const { thetas, diagnostics } = await discoverThetas(input(fs));

    expectEnumerationFailure(
      diagnostics,
      {
        code: UNREADABLE_SOURCE,
        severity: "warning",
        file: PROJECT_ROOT,
        descriptor: "project .pi/theta/",
      },
      "the denied project root reports its failure while the pass continues",
    );
    expect(
      named(thetas, "ok"),
      "the readable global root still contributes its theta (discovery-sources.md:62)",
    ).toBeDefined();
    expect(
      named(thetas, "p"),
      "the denied root's theta does not register",
    ).toBeUndefined();
  });

  it("control 10 (green): a genuinely empty project root (readdir resolves []) stays SILENT", async () => {
    // discovery-sources.md:68 — "an empty directory … enumerates zero thetas
    // successfully and emits no diagnostic". No injection: the inner fake
    // reports the root as an empty directory, which is the state the fix must
    // keep distinguishable from a denied one.
    const fs = build({ dirs: { [PROJECT_ROOT]: [] } });

    const { thetas, diagnostics } = await discoverThetas(input(fs));

    expect(thetas, "an empty root contributes no theta").toHaveLength(0);
    expect(
      diagnostics,
      "an empty directory enumerates successfully and emits no diagnostic " +
        "(discovery-sources.md:68)",
    ).toHaveLength(0);
  });

  it("RED 11: the emitted severity is the source's row — warning for project / global / settings, ERROR for CLI", async () => {
    // WHY the severity, not the code alone, is load-bearing: the production
    // group sink `emitLoadNoteGroup`
    // (src/extension/production-composition.ts:1115-1132) routes error-severity
    // diagnostics through the pre-eval router and, at :1126-1131, batches
    // `severity === "warning"` onto the `theta-system-note` channel with NO
    // code allow-list. The discovery walk's diagnostics reach that sink as one
    // group (`sink.emitGroup(walk.diagnostics)`, :447); the bug-0013 pin
    // tests/load-warning-delivery.test.ts:564 (cell A2) already witnesses a
    // warning from the adjacent settings-stage group (:434) arriving on that
    // channel. Warning severity is therefore exactly what makes this
    // diagnostic user-visible, and the CLI row's error severity is what makes
    // it a pre-eval failure instead.
    const deniedDiagnostics = async (
      fs: FileSystem,
      extra: Partial<DiscoveryInput> = {},
    ): Promise<readonly Diagnostic[]> =>
      (await discoverThetas(input(fs, extra))).diagnostics;

    const projectDiagnostics = await deniedDiagnostics(
      new ReaddirDenied(build({ dirs: { [PROJECT_ROOT]: [] } }), PROJECT_ROOT, "EACCES"),
    );
    const globalDiagnostics = await deniedDiagnostics(
      new ReaddirDenied(build({ dirs: { [GLOBAL_ROOT]: [] } }), GLOBAL_ROOT, "EPERM"),
    );
    const settingsDiagnostics = await deniedDiagnostics(
      new ReaddirDenied(build({ dirs: { "/project/.pi/t": [] } }), "/project/.pi/t", "EACCES"),
      { settings: { thetaPaths: ["t"], thetaPathsBaseDir: "/project/.pi" } },
    );
    const cliDiagnostics = await deniedDiagnostics(
      new ReaddirDenied(
        build({ dirs: { ...ancestors("/opt/loop"), "/opt/loop": [] } }),
        "/opt/loop",
        "ELOOP",
      ),
      { cliPaths: ["/opt/loop"] },
    );

    const severityOf = (
      diagnostics: readonly Diagnostic[],
      file: string,
    ): string | undefined => hitsFor(diagnostics, UNREADABLE_SOURCE, file)[0]?.severity;

    expect(
      severityOf(projectDiagnostics, PROJECT_ROOT),
      `PRIMARY (bug 0076): the project row's Unreadable cell is a warning (:52), and ` +
        `warning severity is what reaches the theta-system-note channel through ` +
        `emitLoadNoteGroup. Observed=${JSON.stringify(projectDiagnostics)}`,
    ).toBe("warning");
    expect(
      severityOf(globalDiagnostics, GLOBAL_ROOT),
      `PRIMARY (bug 0076): the global row's Unreadable cell is a warning (:51). ` +
        `Observed=${JSON.stringify(globalDiagnostics)}`,
    ).toBe("warning");
    expect(
      severityOf(settingsDiagnostics, "/project/.pi/t"),
      `PRIMARY (bug 0076): the settings row's Unreadable cell is a warning (:55). ` +
        `Observed=${JSON.stringify(settingsDiagnostics)}`,
    ).toBe("warning");
    expect(
      severityOf(cliDiagnostics, "/opt/loop"),
      `PRIMARY (bug 0076): the CLI row makes every failure mode an error (:56), so this ` +
        `one routes as a pre-eval failure rather than a warning batch. ` +
        `Observed=${JSON.stringify(cliDiagnostics)}`,
    ).toBe("error");
  });
});

// ===========================================================================
// Cells 12-16 — `discoverPackageThetas`: the conventional `theta/` fallback and
// a `pi.theta`-contributed directory, both enumerated by `thetasInDirectory`
// (src/discovery/package-discovery.ts:468-509), whose two DISC-2 rows share an
// *Unreadable* cell (cells 12, 14) and split on *Missing* (cells 15, 16).
// ===========================================================================

describe("bug 0076 — a package directory whose readdir rejects reports its failure (discovery-sources.md:53-54)", () => {
  it("RED 12: a package's conventional `theta/` fallback denied EACCES emits an unreadable-source warning naming the package", async () => {
    const fs = new ReaddirDenied(
      buildPackages({
        dirs: {
          ...ancestors(`${NM}/alpha/theta`),
          [NM]: ["alpha"],
          [`${NM}/alpha`]: ["package.json", "theta"],
          [`${NM}/alpha/theta`]: ["p.theta"],
        },
        files: {
          [`${NM}/alpha/package.json`]: JSON.stringify({ name: "alpha" }),
          [`${NM}/alpha/theta/p.theta`]: THETA_BODY,
        },
      }),
      `${NM}/alpha/theta`,
      "EACCES",
    );

    const { thetas, diagnostics } = await discoverPackageThetas(packageInput(fs));

    expect(thetas, "the denied fallback directory contributes no theta").toHaveLength(0);
    expectEnumerationFailure(
      diagnostics,
      {
        code: UNREADABLE_SOURCE,
        severity: "warning",
        file: `${NM}/alpha/theta`,
        descriptor: "package `alpha` theta/ directory",
      },
      "the package's `theta/` directory exists and its enumeration is denied; the " +
        "Package `theta/` row's Unreadable cell is a warning (:53)",
    );
    // Exactness is earned here, unlike cells 6 and 14: with `pi.theta` absent,
    // `resolvePackage` goes straight to `thetasInDirectory` and no `listTree`
    // runs, so no deferred traversal can ever reach this path. One denied
    // fallback therefore owes exactly one diagnostic, and :62 scopes the
    // emission to the offending entry, so the pass carries no other.
    expect(
      hitsFor(diagnostics, UNREADABLE_SOURCE, `${NM}/alpha/theta`),
      "one denied fallback directory, one unreadable-source diagnostic — two " +
        "warnings for one denial would be a defect, not latitude",
    ).toHaveLength(1);
    expect(
      diagnostics,
      "and nothing else in the pass (discovery-sources.md:62)",
    ).toHaveLength(1);
  });

  it("control 13 (green): a package that ships no `theta/` directory at all stays SILENT", async () => {
    // package-and-settings.md:32 — "a missing `theta/` fallback directory is
    // silent (the package may simply ship none)". No injection: the inner fake
    // rejects the absent directory's readdir with ENOENT and every proper
    // ancestor lstats ok as a directory, so the :66 walk classifies it missing.
    const fs = buildPackages({
      dirs: {
        ...ancestors(`${NM}/gamma/theta`),
        [NM]: ["gamma"],
        [`${NM}/gamma`]: ["package.json"],
      },
      files: { [`${NM}/gamma/package.json`]: JSON.stringify({ name: "gamma" }) },
    });

    const { thetas, diagnostics } = await discoverPackageThetas(packageInput(fs));

    expect(thetas, "a package shipping no thetas contributes none").toHaveLength(0);
    expect(
      diagnostics,
      "a missing `theta/` fallback is silent (package-and-settings.md:32) — the fix " +
        "must not emit here",
    ).toHaveLength(0);
  });

  it("RED 14: a directory contributed by a `pi.theta` entry, denied EACCES, emits an unreadable-source warning naming the package and its manifest key", async () => {
    const denied = `${NM}/beta/cmds`;
    const fs = new ReaddirDenied(
      buildPackages({
        dirs: {
          ...ancestors(denied),
          [NM]: ["beta"],
          [`${NM}/beta`]: ["package.json", "cmds"],
          [denied]: ["b.theta"],
        },
        files: {
          [`${NM}/beta/package.json`]: JSON.stringify({
            name: "beta",
            pi: { theta: ["cmds"] },
          }),
          [`${denied}/b.theta`]: THETA_BODY,
        },
      }),
      denied,
      "EACCES",
    );

    const { thetas, diagnostics } = await discoverPackageThetas(packageInput(fs));

    expect(thetas, "the denied directory contributes no theta").toHaveLength(0);
    const hits = hitsFor(diagnostics, UNREADABLE_SOURCE, denied);
    expect(
      hits.length,
      `PRIMARY (bug 0076): a directory the manifest's \`pi.theta\` names exists and its ` +
        `enumeration is denied; the Package \`pi.theta\` row's Unreadable cell is a ` +
        `warning (discovery-sources.md:54). AT HEAD thetasInDirectory ` +
        `(src/discovery/package-discovery.ts:444) drops the rejection through readdirOr ` +
        `(:159-164) and scans an empty name list. Observed ` +
        `diagnostics=${JSON.stringify(diagnostics)}`,
    ).toBeGreaterThanOrEqual(1);
    const diagnostic = hits[0]!;
    expect(
      diagnostic.severity,
      "the Package `pi.theta` row's Unreadable cell is a warning (:54)",
    ).toBe("warning");
    // The registry frame is pinned byte-exact (DIAG-4); the descriptor slot is
    // matched by content because the spec carries two spellings for it —
    // `` "package `foo` (pi.theta)" `` (package-and-settings.md:25) and
    // `` "package `foo` (pi.theta[0])" `` (discovery-sources.md:61).
    expect(
      diagnostic.message,
      "DIAG-4: the message is the registry row's Message template",
    ).toMatch(templateToRegExp(loadRowMessage(UNREADABLE_SOURCE)));
    expect(
      diagnostic.message,
      "the descriptor names the offending package (discovery-sources.md:61)",
    ).toContain("package `beta`");
    expect(
      diagnostic.message,
      "the descriptor names the manifest key that contributed the directory " +
        "(package-and-settings.md:25)",
    ).toContain("pi.theta");
  });

  it("RED 15: a directory a `pi.theta` entry names, whose readdir rejects a clean-leaf ENOENT while lstat reports a directory, emits a missing-source ERROR naming the package", async () => {
    // The row split cells 12-14 do not reach: `thetasInDirectory` serves both
    // package rows, and their *Missing* cells disagree — error for `Package
    // pi.theta entry` ("manifest names a missing path", :54), silent for
    // `Package theta/ directory` (:53, the mirror is control 16). Every proper
    // ancestor is registered as a directory, so the state is the :66 clean leaf
    // — *missing*, not *unreadable*.
    //
    // Reachable because the deferred `listTree` walk
    // (src/discovery/package-discovery.ts:310-331) drops its own `readdir`
    // rejection for this path yet keeps the entry (its `lstat` reports a
    // directory), so the per-match contribution still calls
    // `thetasInDirectory`, which observes the rejection second and must report
    // it.
    const denied = `${NM}/beta/cmds`;
    const fs = new ReaddirDenied(
      buildPackages({
        dirs: {
          ...ancestors(denied),
          [NM]: ["beta"],
          [`${NM}/beta`]: ["package.json", "cmds"],
          [denied]: ["b.theta"],
        },
        files: {
          [`${NM}/beta/package.json`]: JSON.stringify({
            name: "beta",
            pi: { theta: ["cmds"] },
          }),
          [`${denied}/b.theta`]: THETA_BODY,
        },
      }),
      denied,
      "ENOENT",
    );

    const { thetas, diagnostics } = await discoverPackageThetas(packageInput(fs));

    expect(thetas, "the unenumerable directory contributes no theta").toHaveLength(0);
    // Exactly one, scoped to this (code, file) pair: the deferred `listTree`
    // sub-case crosses the same path and stays free to emit under its own code.
    const hits = hitsFor(diagnostics, MISSING_SOURCE, denied);
    expect(
      hits.length,
      `PRIMARY (bug 0076): the manifest named this directory and its enumeration ` +
        `reports ENOENT on a clean ancestor chain, so the :66 walk classifies it ` +
        `missing — an error for the \`Package pi.theta entry\` row (:54). AT HEAD ` +
        `thetasInDirectory suppresses every ENOENT rejection unconditionally, which is ` +
        `the \`theta/\` row's disposition applied to both rows. Observed ` +
        `diagnostics=${JSON.stringify(diagnostics)}`,
    ).toBe(1);
    const diagnostic = hits[0]!;
    expect(
      diagnostic.severity,
      "the `Package pi.theta entry` row's Missing cell is an error (:54)",
    ).toBe("error");
    // The registry frame is pinned byte-exact (DIAG-4); the descriptor slot is
    // matched by content because the spec carries two spellings for it —
    // `` "package `foo` (pi.theta)" `` (package-and-settings.md:25) and
    // `` "package `foo` (pi.theta[0])" `` (discovery-sources.md:61).
    expect(
      diagnostic.message,
      "DIAG-4: the message is the registry row's Message template",
    ).toMatch(templateToRegExp(loadRowMessage(MISSING_SOURCE)));
    expect(
      diagnostic.message,
      "the descriptor names the offending package (discovery-sources.md:61)",
    ).toContain("package `beta`");
    expect(
      diagnostic.message,
      "the descriptor names the manifest key that contributed the directory " +
        "(package-and-settings.md:25)",
    ).toContain("pi.theta");
  });

  it("control 16 (green): a package's conventional `theta/` fallback whose readdir rejects a clean-leaf ENOENT while lstat reports a directory stays SILENT", async () => {
    // Cell 15's mirror across the row split, same rejection code on the same
    // enumeration call: package-and-settings.md:32 — "a missing `theta/`
    // fallback directory is silent". Control 13 covers the directory being
    // absent outright (the fake's own ENOENT); here `lstat` reports a directory
    // and only the enumeration rejects, which is the state that would tempt an
    // implementation to reuse cell 15's error severity for both rows.
    const fs = new ReaddirDenied(
      buildPackages({
        dirs: {
          ...ancestors(`${NM}/delta/theta`),
          [NM]: ["delta"],
          [`${NM}/delta`]: ["package.json", "theta"],
          [`${NM}/delta/theta`]: ["d.theta"],
        },
        files: {
          [`${NM}/delta/package.json`]: JSON.stringify({ name: "delta" }),
          [`${NM}/delta/theta/d.theta`]: THETA_BODY,
        },
      }),
      `${NM}/delta/theta`,
      "ENOENT",
    );

    const { thetas, diagnostics } = await discoverPackageThetas(packageInput(fs));

    expect(thetas, "the unenumerable fallback contributes no theta").toHaveLength(0);
    expect(
      diagnostics,
      "the `Package theta/ directory` row's Missing cell is silent " +
        "(discovery-sources.md:53, package-and-settings.md:32) — the per-row severity " +
        "must not be widened to cover this row",
    ).toHaveLength(0);
  });
});
