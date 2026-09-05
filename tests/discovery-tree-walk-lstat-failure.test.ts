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
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { FileStat, FileSystem } from "../src/seams/file-system";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileSystem } from "./helpers/fake-file-system";

// `listTree` (`src/discovery/discovery-walk.ts`) classifies an
// entry-level `lstat` rejection by code and carries the non-`ENOENT` path out
// in `TreeWalk.unreadable` so `emitUniverseFailures` (same file) reports it;
// silence there is the defect this witness locks out (bug
// 0113 fix-record residual 1 / bug 0075 §Affected listTree site). The package
// copy (src/discovery/package-discovery.ts:355-363, `listTree` at :334) holds
// the same contract, surfaced by the package-side loop at :493-506. An
// `ENOENT` from that same `lstat` stays silent in both copies: the entry
// vanished between the enumeration and the probe, a clean leaf under a parent
// already proven enterable. The `readdir` rejection one level up already
// classifies and reports the same way (the settings copy at :580-584, the
// package copy at :341-345).
//
// GOVERNING SPEC (line numbers re-derived against this tree's HEAD):
//   docs/spec_topics/discovery/discovery-sources.md:69 — THE ANCHOR: "A symlink
//     loop or other traversal failure *inside* a discovery root that does exist
//     is an unreadable-source warning, not silence — the silent-on-missing rule
//     applies to the *root* itself not existing, not to failures encountered
//     while walking a root that does", and "The glob-universe walk itself
//     contributes at most one diagnostic per denied path per discovery pass,
//     however many patterns share that static-prefix root — and none at all for
//     a path that a per-match or per-source enumeration earlier in the same pass
//     has already reported under `theta/load/unreadable-source` or
//     `theta/load/missing-source`".
//   discovery-sources.md:56 — the `Package pi.theta entry` row: *Unreadable
//     path* = warning. :57 — the `Settings thetaPaths entry` row: likewise.
//   discovery-sources.md:63 — rule 2: each diagnostic "carries the source
//     descriptor in its `message` so the author can locate the offending
//     configuration".
//   discovery-sources.md:64 — rule 3: a failure is "fatal for the offending
//     entry only, not for the whole discovery pass".
//   docs/spec_topics/discovery/package-and-settings.md:27 — the
//     `` package `foo` (pi.theta) `` descriptor form; :29 — "A glob pattern that
//     resolves to zero files is silent (not an error)"; :97 — the settings
//     source renders the normative `` settings:"<value>" `` descriptor form.
//   docs/spec_topics/diagnostics/code-registry-load.md:48 — the
//     `theta/load/unreadable-source` row, whose *Message* column is the only
//     source of every expected message below (DIAG-4,
//     docs/spec_topics/diagnostics/diagnostic-shape.md:74).
//
// THE PINNED CONTRACT (settled by the operator for this witness, and no wider):
//   1. An entry-level `lstat` rejection during a universe walk is a traversal
//      failure inside a root that exists (:69) ⇒ `theta/load/unreadable-source`
//      at the source's *Unreadable path* severity — `warning` for both
//      reachable rows (:56, :57) — with the offending ENTRY path in `file`.
//   2. Descriptor: `` settings:"<value>" `` for the lowest-index entry owning
//      the shared universe (`treeFor` caches per static-prefix root,
//      `discovery-walk.ts`), `` package:"<name>" `` on the
//      package side (package-and-settings.md:27).
//   3. An `ENOENT` from that `lstat` stays SILENT: the entry vanished between
//      the enumeration and the probe — a clean leaf under a parent the
//      enumeration just proved enterable — so the pattern resolves to no path,
//      which package-and-settings.md:29 keeps silent.
//   4. At most one diagnostic per (code, file) per pass, and none where a
//      per-match or per-source enumeration in the same pass already reported
//      that path (:69, last sentences).
//
// THE INJECTION SEAM. `tests/helpers/fake-file-system.ts` rejects EVERY seam
// member for a path in its `errors` map, so its `readdir` would fail too and
// the entry would never be enumerated. Witnessing THIS defect needs the parent
// `readdir` to SUCCEED and name the entry while only the entry's own `lstat`
// rejects, so the local decorator below denies `lstat` for exactly one path
// with a named `.code` and delegates every other member to a stock
// `FakeFileSystem`. The mechanism mirrors the `lstatDenied` hook of
// tests/discovery-glob-universe-enumeration-failure.test.ts:378-383 (bug 0113's
// locked 19-cell witness) without importing from it: that file's decorator
// denies `readdir` primarily and `lstat` only to dirty an ancestor chain, which
// is the opposite polarity of this subject.

// ===========================================================================
// The registry row (DIAG-4) — every expected message below is sourced from the
// Message column of docs/spec_topics/diagnostics/code-registry-load.md.
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

/** The row's normative Message template (DIAG-4), asserted present loudly so a
 *  registry rename fails naming the unmet precondition instead of skipping. */
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
 * `<placeholder>` slot widened to `.+` — used on the package side, where the
 * descriptor's exact spelling is left open by the spec carrying two forms:
 * `` package `foo` (pi.theta) `` (package-and-settings.md:27) against
 * `` package `foo` (pi.theta[0]) `` (discovery-sources.md:63).
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
// Fixtures.
// ===========================================================================

const HOME = "/home/theta";
const CWD = "/project";
const GLOBAL_ROOT = "/home/theta/.pi/agent/theta";
const PROJECT_ROOT = "/project/.pi/theta";
const SETTINGS_BASE = "/project/.pi";
const PREFIX_ROOT = "/project/.pi/g";
const DENIED_SUB = "/project/.pi/g/sub";
const NM = "/project/node_modules";

/** A body that parses far enough to register (the walk only reads bytes). */
const THETA_BODY = "mode: prompt\n---\n";

/** Proper-ancestor directories of `leaf`, registered empty; the leaf itself is
 *  not registered, so an `ENOENT` on it is a clean leaf. */
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

/** The conventional roots' ancestor chains plus the settings-base chain, in
 *  every settings fixture, so a cell's diagnostic set is about the path under
 *  test alone and the fixture's directory shape stays self-consistent. */
const BASE = mergeDirs(
  ancestors(GLOBAL_ROOT),
  ancestors(PROJECT_ROOT),
  ancestors(DENIED_SUB),
);

/** The five installed-package roots `packageRoots` enumerates
 *  (src/discovery/package-discovery.ts:226-246), registered as empty
 *  directories so a root's absence never contributes an incidental rejection
 *  to a package cell's diagnostic set. */
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
}

function build(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: mergeDirs(BASE, spec.dirs ?? {}),
    files: spec.files ?? {},
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

/** A Node-style error carrying the injected `.code` (what `nodeErrorCode`,
 *  src/discovery/node-error-code.ts:25, reads). */
function codeError(code: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`${code}: lstat`);
  error.code = code;
  return error;
}

/**
 * A `FileSystem` decorator that rejects `lstat` for exactly one path with a
 * named Node-style `.code` and delegates every other member — `readdir`
 * included — to an inner `FakeFileSystem`. This is the seam that reaches the
 * defect: the parent enumerates successfully and names the entry, and only the
 * entry's own type probe fails, which is what `listTree` discards.
 */
class LstatDenied implements FileSystem {
  readonly #inner: FakeFileSystem;
  readonly #denied: string;
  readonly #code: string;

  constructor(inner: FakeFileSystem, denied: string, code: string) {
    this.#inner = inner;
    this.#denied = denied;
    this.#code = code;
  }

  lstat(path: string): Promise<FileStat> {
    if (path === this.#denied) {
      return Promise.reject(codeError(this.#code));
    }
    return this.#inner.lstat(path);
  }
  readdir(path: string): Promise<readonly string[]> {
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
  configDirName(): string {
    return this.#inner.configDirName();
  }
  globalAgentDir(): string {
    return this.#inner.globalAgentDir();
  }
  realpath(path: string): Promise<string> {
    return this.#inner.realpath(path);
  }
}

function settingsInput(fs: FileSystem, thetaPaths: readonly string[]): DiscoveryInput {
  return { fs, settings: { thetaPaths, thetaPathsBaseDir: SETTINGS_BASE } };
}

function packageInput(fs: FileSystem): PackageDiscoveryInput {
  return { fs, clock: new FakeClock(), settings: {} };
}

function named(
  thetas: readonly DiscoveredTheta[],
  name: string,
): DiscoveredTheta | undefined {
  return thetas.find((t) => t.name === name);
}

/** The diagnostics carrying `code` and locating `file` (rule 2 at
 *  discovery-sources.md:63: `file` is the offending path). */
function hitsFor(
  diagnostics: readonly Diagnostic[],
  code: string,
  file: string,
): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code && d.file === file);
}

/**
 * The settings-side pin: the entry whose `lstat` rejected is reported exactly
 * once as `theta/load/unreadable-source`, `warning`, with that entry's path in
 * `file` and the registry-sourced message carrying `descriptor`. The PRIMARY
 * assertion quotes every observed diagnostic so the red-at-HEAD output proves
 * the documented reason: nothing is emitted at all.
 */
function expectEntryLstatFailure(
  diagnostics: readonly Diagnostic[],
  file: string,
  descriptor: string,
  why: string,
): void {
  const hits = hitsFor(diagnostics, UNREADABLE_SOURCE, file);
  expect(
    hits.length,
    `PRIMARY (bug 0113 residual 1 / bug 0075 §Affected): ${why} — ` +
      `discovery-sources.md:69 forbids silence for a "traversal failure inside a ` +
      `discovery root that does exist" ("an unreadable-source warning, not ` +
      `silence"), and :57 gives the Settings row's Unreadable cell the severity ` +
      `warning. listTree (src/discovery/discovery-walk.ts) must classify ` +
      `an entry whose lstat rejects by \`.code\` and carry the non-ENOENT path out ` +
      `in TreeWalk.unreadable, so a shrunken universe is always reported. ` +
      `Observed diagnostics=${JSON.stringify(diagnostics)}`,
  ).toBe(1);
  const diagnostic = hits[0]!;
  expect(
    diagnostic.severity,
    "the Settings `thetaPaths` entry row's Unreadable cell is a warning " +
      "(discovery-sources.md:57)",
  ).toBe("warning");
  expect(
    diagnostic.message,
    "DIAG-4: the message is the registry row's Message column interpolated with " +
      "the source descriptor (discovery-sources.md:63, package-and-settings.md:97)",
  ).toBe(interpolate(loadRowMessage(UNREADABLE_SOURCE), { descriptor }));
  expect(
    diagnostics.filter((d) => d.code === MISSING_SOURCE),
    "a universe walk never emits missing-source — a pattern resolving to zero " +
      "paths is silent (package-and-settings.md:29)",
  ).toHaveLength(0);
}

// ===========================================================================
// Cells 1-4, 7-9 — the settings `thetaPaths` universe (`listTree`,
// `src/discovery/discovery-walk.ts`, reached through `treeFor` from `addGlob`).
// ===========================================================================

describe("listTree's per-entry lstat rejection reports its traversal failure (settings thetaPaths universe)", () => {
  /** `/project/.pi/g/sub/s.theta`, the theta every measurement cell loses. */
  const nestedThetaFixture: FakeSpec = {
    dirs: { [PREFIX_ROOT]: ["sub"], [DENIED_SUB]: ["s.theta"] },
    files: { [`${DENIED_SUB}/s.theta`]: THETA_BODY },
  };

  it("cell 9a (green control): with nothing denied, `g/**/*.theta` selects the nested theta and the pass is silent", async () => {
    // Establishes that the pattern reaches the nested file through the complete
    // universe, so every red below is a reporting gap rather than a
    // mis-specified match.
    const fs = build(nestedThetaFixture);

    const { thetas, diagnostics } = await discoverThetas(
      settingsInput(fs, ["g/**/*.theta"]),
    );

    expect(
      named(thetas, "s"),
      "the pattern selects `/project/.pi/g/sub/s.theta` when the universe is complete",
    ).toBeDefined();
    expect(
      diagnostics,
      "a fully-enumerated universe emits nothing — no failure mode in DISC-2 fires",
    ).toHaveLength(0);
  });

  it("cell 1 (RED): a mid-walk entry whose lstat rejects EACCES emits one unreadable-source warning naming `settings:\"g/**/*.theta\"`", async () => {
    const fs = new LstatDenied(build(nestedThetaFixture), DENIED_SUB, "EACCES");

    const { thetas, diagnostics } = await discoverThetas(
      settingsInput(fs, ["g/**/*.theta"]),
    );

    // The loss half of the defect holds either way: the reporting half is what
    // the pinned contract adds.
    expect(
      named(thetas, "s"),
      "guard: the theta below the dropped entry is absent either way — the pin " +
        "adds the diagnostic, it does not recover the path",
    ).toBeUndefined();
    expectEntryLstatFailure(
      diagnostics,
      DENIED_SUB,
      `settings:"g/**/*.theta"`,
      "the static-prefix root `/project/.pi/g` enumerates successfully and names " +
        "`sub`, whose own lstat is denied EACCES — the Windows parent-ACL shape",
    );
  });

  it("cell 2 (RED): the same entry rejecting EPERM emits the same one warning", async () => {
    const fs = new LstatDenied(build(nestedThetaFixture), DENIED_SUB, "EPERM");

    const { diagnostics } = await discoverThetas(settingsInput(fs, ["g/**/*.theta"]));

    expectEntryLstatFailure(
      diagnostics,
      DENIED_SUB,
      `settings:"g/**/*.theta"`,
      "EPERM is the second code discovery-sources.md:68 classifies as unreadable, " +
        "and at the drop site it is indistinguishable from EACCES and from a " +
        "vanished entry because no code is read at all",
    );
  });

  it("cell 3 (RED): the same entry rejecting ENOTDIR emits the same one warning", async () => {
    // ENOTDIR is the shape a junction or reparse point that is not a symlink
    // surfaces on Windows, and the third code discovery-sources.md:68 names as
    // unreadable rather than missing.
    const fs = new LstatDenied(build(nestedThetaFixture), DENIED_SUB, "ENOTDIR");

    const { diagnostics } = await discoverThetas(settingsInput(fs, ["g/**/*.theta"]));

    expectEntryLstatFailure(
      diagnostics,
      DENIED_SUB,
      `settings:"g/**/*.theta"`,
      "ENOTDIR on an entry the parent just enumerated is a traversal failure " +
        "inside a root that exists, not an absence",
    );
  });

  it("cell 4 (green control): the entry rejecting ENOENT stays SILENT and the universe lacks that path", async () => {
    // The entry vanished between the enumeration and the probe: a clean leaf
    // under a parent the successful `readdir` just proved enterable. The
    // pattern then resolves to no path, which package-and-settings.md:29 keeps
    // silent — the contrast with cells 1-3 is what makes the code
    // classification observable.
    const fs = new LstatDenied(build(nestedThetaFixture), DENIED_SUB, "ENOENT");

    const { thetas, diagnostics } = await discoverThetas(
      settingsInput(fs, ["g/**/*.theta"]),
    );

    expect(thetas, "the pattern resolves to zero paths").toHaveLength(0);
    expect(
      diagnostics,
      "a vanished entry leaves the pattern resolving to zero files, which is " +
        "silent (package-and-settings.md:29) — the fix must not emit here",
    ).toHaveLength(0);
  });

  it("cell 7 (RED): two entries sharing one static-prefix root emit EXACTLY ONE warning, owned by the LOWEST index", async () => {
    // `treeFor` (`src/discovery/discovery-walk.ts`) caches the universe by
    // static-prefix root, so entry 1 reads entry 0's cached tree and never
    // walks. That determinism is the attribution rule: the lowest index that
    // triggered the walk owns the rejection, and the count is one, not one per
    // sharing entry (discovery-sources.md:69).
    const fs = new LstatDenied(
      build({
        dirs: { [PREFIX_ROOT]: ["sub"], [DENIED_SUB]: ["s.theta", "t.theta"] },
        files: {
          [`${DENIED_SUB}/s.theta`]: THETA_BODY,
          [`${DENIED_SUB}/t.theta`]: THETA_BODY,
        },
      }),
      DENIED_SUB,
      "EACCES",
    );

    const { thetas, diagnostics } = await discoverThetas(
      settingsInput(fs, ["g/**/s.theta", "g/**/t.theta"]),
    );

    expect(thetas, "guard: both thetas are lost with the shared universe").toHaveLength(0);
    expectEntryLstatFailure(
      diagnostics,
      DENIED_SUB,
      `settings:"g/**/s.theta"`,
      "two thetaPaths entries share one cached universe walk, so the rejection is " +
        "observed once and attributed to the lowest index that triggered it",
    );
  });

  it("cell 8 (green control): a path a per-entry classification already reported is NOT reported twice for the same (code, file)", async () => {
    // Entry 1 is a literal, so `addLiteral` (`src/discovery/discovery-walk.ts`)
    // classifies `/project/.pi/g/sub` directly: its lstat rejects EACCES,
    // `classifyPath` (same file) answers `unreadable`, and the entry-level warning
    // fires with entry 1's descriptor. Entry 0's universe walk crosses the same
    // path in the same pass and must add nothing — discovery-sources.md:69
    // gives "none at all for a path that a per-match or per-source enumeration
    // earlier in the same pass has already reported".
    const fs = new LstatDenied(build(nestedThetaFixture), DENIED_SUB, "EACCES");

    const { diagnostics } = await discoverThetas(
      settingsInput(fs, ["g/**/*.theta", "g/sub"]),
    );

    expect(
      hitsFor(diagnostics, UNREADABLE_SOURCE, DENIED_SUB).length,
      `at most one diagnostic per (code, file) per pass, and none from the ` +
        `universe walk where an earlier per-entry report already names an ` +
        `offending configuration for that path (discovery-sources.md:69). ` +
        `Observed diagnostics=${JSON.stringify(diagnostics)}`,
    ).toBe(1);
    expect(
      hitsFor(diagnostics, MISSING_SOURCE, DENIED_SUB),
      "the path exists and is unreadable, so no missing-source is owed",
    ).toHaveLength(0);
  });

  it("cell 9b (green control): one dropped entry does not poison the rest — the readable sibling still registers", async () => {
    // Rule 3 (discovery-sources.md:64): the failure is fatal for the offending
    // entry only. This is what makes the silent loss hard to notice — a
    // plausible inventory that is one theta short.
    const denied = `${PREFIX_ROOT}/denied`;
    const fs = new LstatDenied(
      build({
        dirs: {
          [PREFIX_ROOT]: ["ok", "denied"],
          [`${PREFIX_ROOT}/ok`]: ["a.theta"],
          [denied]: ["b.theta"],
        },
        files: {
          [`${PREFIX_ROOT}/ok/a.theta`]: THETA_BODY,
          [`${denied}/b.theta`]: THETA_BODY,
        },
      }),
      denied,
      "EACCES",
    );

    const { thetas } = await discoverThetas(settingsInput(fs, ["g/**/*.theta"]));

    expect(named(thetas, "a"), "the readable sibling registers").toBeDefined();
    expect(named(thetas, "b"), "the dropped entry's theta is absent").toBeUndefined();
  });
});

// ===========================================================================
// Cells 5-6 — the package `pi.theta` universe
// (src/discovery/package-discovery.ts:355-363, inside listTree at :334, called
// from resolvePiThetas at :435, whose `diagnostics` parameter is in scope).
// ===========================================================================

describe("listTree's per-entry lstat rejection reports its traversal failure (package pi.theta universe)", () => {
  const DENIED_CMDS = `${NM}/beta/cmds`;

  /** Package `beta` with `pi.theta` and a `cmds/` directory holding `b.theta`. */
  function betaFixture(piTheta: readonly string[]): FakeSpec {
    return {
      dirs: {
        ...ancestors(DENIED_CMDS),
        [NM]: ["beta"],
        [`${NM}/beta`]: ["package.json", "cmds"],
        [DENIED_CMDS]: ["b.theta"],
      },
      files: {
        [`${NM}/beta/package.json`]: JSON.stringify({
          name: "beta",
          pi: { theta: piTheta },
        }),
        [`${DENIED_CMDS}/b.theta`]: THETA_BODY,
      },
    };
  }

  it("control (green): with nothing denied, `pi.theta: [\"**/*.theta\"]` selects the nested theta and the pass is silent", async () => {
    const fs = buildPackages(betaFixture(["**/*.theta"]));

    const { thetas, diagnostics } = await discoverPackageThetas(packageInput(fs));

    expect(
      named(thetas, "b"),
      "the pattern selects `<pkg>/cmds/b.theta` when the universe is complete",
    ).toBeDefined();
    expect(diagnostics, "a complete universe emits nothing").toHaveLength(0);
  });

  it("cell 5 (RED): a package-universe entry whose lstat rejects EACCES emits one warning naming the package", async () => {
    const fs = new LstatDenied(
      buildPackages(betaFixture(["**/*.theta"])),
      DENIED_CMDS,
      "EACCES",
    );

    const { thetas, diagnostics } = await discoverPackageThetas(packageInput(fs));

    expect(
      named(thetas, "b"),
      "guard: the theta below the dropped entry is absent either way",
    ).toBeUndefined();
    const hits = hitsFor(diagnostics, UNREADABLE_SOURCE, DENIED_CMDS);
    expect(
      hits.length,
      `PRIMARY (bug 0113 residual 1 / bug 0075 §Affected): the package root ` +
        `enumerates successfully and names \`cmds\`, whose own lstat is denied ` +
        `EACCES, so the pattern's match is absent from the universe entirely. ` +
        `discovery-sources.md:69 forbids silence and :56 gives the ` +
        `\`Package pi.theta entry\` row's Unreadable cell the severity warning. ` +
        `listTree (src/discovery/package-discovery.ts:355-363) must classify the ` +
        `lstat rejection by \`.code\` and carry the non-ENOENT path out in ` +
        `TreeWalk.unreadable, so it is always reported. ` +
        `Observed diagnostics=${JSON.stringify(diagnostics)}`,
    ).toBe(1);
    const diagnostic = hits[0]!;
    expect(
      diagnostic.severity,
      "the `Package pi.theta` row's Unreadable cell is a warning " +
        "(discovery-sources.md:56)",
    ).toBe("warning");
    expect(
      diagnostic.message,
      "DIAG-4: the message is the registry row's Message template",
    ).toMatch(templateToRegExp(loadRowMessage(UNREADABLE_SOURCE)));
    // Post-0461 the descriptor renders the normative `package:"<name>"` form
    // (placeholder-rendering-b.md §5), collapsing the pi.theta-vs-theta/
    // distinction the pre-fix category prose carried — the kind:value grammar
    // has no slot for the manifest key, so that assertion drops.
    expect(
      diagnostic.message,
      "the descriptor names the offending package (placeholder-rendering-b.md §5)",
    ).toContain('package:"beta"');
    expect(
      diagnostics.filter((d) => d.code === MISSING_SOURCE),
      "a universe walk never emits missing-source",
    ).toHaveLength(0);
  });

  it("cell 6 (green control): a package-universe entry rejecting ENOENT stays SILENT", async () => {
    // The package copy's ancestors are pre-proven enterable — the reasoning
    // `thetasInDirectory` (src/discovery/package-discovery.ts:519-528) already
    // states — so a vanished entry is clean/missing, and a pattern resolving to
    // zero paths is silent (package-and-settings.md:29).
    const fs = new LstatDenied(
      buildPackages(betaFixture(["**/*.theta"])),
      DENIED_CMDS,
      "ENOENT",
    );

    const { thetas, diagnostics } = await discoverPackageThetas(packageInput(fs));

    expect(thetas, "the pattern resolves to zero paths").toHaveLength(0);
    expect(
      diagnostics,
      "a vanished package-universe entry is silent — the fix must emit neither " +
        "missing-source nor unreadable-source here",
    ).toHaveLength(0);
  });
});
