import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  discoverThetas,
  type DiscoveredTheta,
  type DiscoveryInput,
} from "../src/discovery/discovery-walk";
import {
  discoverPackageThetas,
  type PackageDiscoveryInput,
} from "../src/discovery/package-discovery";
import {
  createThetaExtension,
  type ThetaExtensionDeps,
} from "../src/extension/factory";
import { composeExtensionInstance } from "../src/extension/production-composition";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { FileStat, FileSystem } from "../src/seams/file-system";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileSystem } from "./helpers/fake-file-system";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";

// Bug 0113 — both `listTree` copies swallow every `readdir` rejection, so a
// denied subtree (or a denied static-prefix ROOT) under a settings `thetaPaths`
// glob's or a package `pi.theta` pattern's universe silently shrinks that
// universe: every `.theta` the pattern would have selected is absent and no
// diagnostic is emitted on any channel
// (docs/bugs/0113-listtree-glob-universe-swallow-silent.md).
//
// GOVERNING SPEC (docs/spec_topics/discovery/discovery-sources.md, line numbers
// re-derived at this tree's HEAD — the bug document's citations predate bug
// 0077's fix and are stale by two lines in this file):
//   :49     DISC-2's asymmetry paragraph — *explicit references* ("`pi.theta`
//           entries, settings entries, `--theta` flags") are non-silent
//           "because the author named it and expects it to resolve".
//   :56     the `Package pi.theta entry` row — *Unreadable path* = warning.
//   :57     the `Settings thetaPaths entry` row — *Unreadable path* = warning.
//   :63     rule 2 — each diagnostic "carries the source descriptor in its
//           `message` so the author can locate the offending configuration —
//           e.g. `"settings entry index 2"` … `` "package `foo` (pi.theta[0])" ``".
//   :64     rule 3 — "Errors are fatal for the offending entry only, not for
//           the whole discovery pass".
//   :68     the clean-leaf-`ENOENT` walk — "on `ENOENT`, walk the candidate
//           path's ancestor chain root-first; if every ancestor `lstat`s `ok`
//           and is a directory, classify the result as *missing* …; if any
//           ancestor `lstat` returns `EACCES`, `EPERM`, `ENOTDIR`, or itself
//           `ENOENT`, classify the result as *unreadable*", plus the Windows
//           motivation ("a parent ACL denies enumeration").
//   :69     THE ANCHOR — "A symlink loop or other traversal failure *inside* a
//           discovery root that does exist is an unreadable-source warning,
//           not silence — the silent-on-missing rule applies to the *root*
//           itself not existing, not to failures encountered while walking a
//           root that does."
//   :70     "an empty directory — or one whose entries are all non-`.theta`
//           files — enumerates zero thetas successfully and emits no
//           diagnostic".
// docs/spec_topics/discovery/package-and-settings.md:21 (DISC-5, the matcher
//   and the four-stage override order), :27 (the `` "package `foo` (pi.theta)" ``
//   descriptor form), :29 ("A glob pattern that resolves to zero files is
//   silent (not an error)"), :31 (the `theta/` fallback ignores subdirectories),
//   :92 (a directory entry is non-recursive), :97 ("Path-existence and
//   permission failures … are covered by the *Settings `thetaPaths` entry* row
//   … carry an `"settings entry index N"` source descriptor identifying the
//   offending array index").
// docs/spec_topics/diagnostics/code-registry-load.md:47 — the
//   `theta/load/unreadable-source` row, whose *Message* column is the only
//   source of every expected message below (DIAG-4,
//   docs/spec_topics/diagnostics/diagnostic-shape.md:74).
//
// THE DEFECT AT HEAD. `listTree` (`src/discovery/discovery-walk.ts`) maps the
// `readdir` rejection to `undefined` without capturing `.code` and
// returns from that subtree in silence; its signature takes no
// `diagnostics` parameter, so it cannot report. `treeFor` caches the
// universe per static-prefix root and `addGlob` filters it through
// `globMatches` — an entry absent from the universe reaches neither
// `addDir` nor `addFile`, so bug 0076's emitter inside
// `enumerateDirectory` is never entered for it. The package copy repeats
// the swallow verbatim (src/discovery/package-discovery.ts:314, via `readdirOr`
// at :155, called from `resolvePiThetas` at :398).
//
// THE PINNED POST-FIX CONTRACT (bug 0113 §Fix as ADJUDICATED in-run — Reading A
// of :69 governs; this file pins that adjudication and nothing wider):
//   1. A `readdir` failure ANYWHERE in a glob-universe walk — the static-prefix
//      root itself or a subtree below it — is an unreadable-source WARNING, not
//      silence (:69).
//   2. Code `theta/load/unreadable-source`, severity = the row's *Unreadable
//      path* cell = `warning` for both reachable rows (:56 Package `pi.theta`
//      entry, :57 Settings `thetaPaths` entry). `file` = the denied directory
//      path, POSIX-normalised. Message = the registry row's *Message* template
//      `discovery source is unreadable: <descriptor>`, sourced from
//      code-registry-load.md (DIAG-4).
//   3. Descriptor: settings side `settings entry index N` where N is the array
//      index of the glob entry that first triggered the walk that observed the
//      rejection — the universe is cached per static-prefix root, by
//      `treeFor` (`discovery-walk.ts`), so when several entries share a prefix the
//      LOWEST such index owns it (deterministic). Package side:
//      `` package `<name>` (pi.theta) `` (package-and-settings.md:27).
//   4. The MISSING arm stays SILENT: a clean-leaf `ENOENT` under the static
//      prefix leaves the pattern resolving to zero paths, which
//      package-and-settings.md:29 keeps silent — a universe walk NEVER emits
//      `theta/load/missing-source`. The settings copy classifies `ENOENT` via
//      the :68 ancestor walk (dirty chain ⇒ unreadable ⇒ warning; clean leaf ⇒
//      silent). The package copy treats every `ENOENT` as clean/silent (its
//      ancestors are pre-proven enterable — the reasoning `thetasInDirectory`
//      already states, src/discovery/package-discovery.ts:472).
//   5. EMISSION COUNT: exactly ONE diagnostic per denied path per pass. Where a
//      per-match enumeration (`enumerateDirectory` / `thetasInDirectory`)
//      already reported that same path, the universe walk does NOT add a second
//      — pattern `g/*` over a denied directory yields exactly one warning, not
//      two.
//   6. The silence controls stay silent: a genuinely empty subtree under the
//      prefix (:70), a subtree whose entries are all non-`.theta` files (:70,
//      second half), a static-prefix root that does not exist (clean-leaf
//      `ENOENT`, package-and-settings.md:29), and the package `theta/`
//      fallback's ignored subdirectories (:31, :92).
//
// RED AT HEAD (each on its own PRIMARY assertion — the diagnostic is absent;
// every PRIMARY message names the observed `diagnostics` array):
//   S1  settings `g/**/*.theta`, denied subtree EACCES  → one warning, index 0
//   S2  the same denial with EPERM                      → one warning
//   S3  `ENOENT` with a DIRTY ancestor chain (:68)      → one warning
//   S4  partial shrink: `ok/` registers, `denied/` warns
//   S5  two entries sharing one static prefix           → EXACTLY one warning
//   S6  the static-prefix ROOT itself denied EACCES     → one warning
//   S7  pattern-shape contrast — `g/*` yields EXACTLY ONE diagnostic for the
//       (code, file) pair (green at HEAD, reds if a fix double-reports per (5))
//       AND `g/**/*.theta` yields one too (red at HEAD), so the two pattern
//       shapes agree
//   S8  the `+`-recovery row: the file still registers AND the universe failure
//       is still reported
//   P1  package `pi.theta: ["**/*.theta"]` over a denied `cmds/` → one warning
//       naming `` package `beta` (pi.theta) ``
//   E1  end-to-end (bug 0013): the settings-side warning arrives on the
//       `theta-system-note` channel through the real `composeExtensionInstance`
//
// GREEN CONTROLS (hold at HEAD and must still hold post-fix):
//   S0  no denial — `g/**/*.theta` DOES select the nested theta and the pass is
//       silent, so every red above is a reporting gap, not a mis-specified
//       match (the bug doc's §Reproduction control)
//   S9  clean-leaf `ENOENT` on the subtree                        → SILENT
//   S10 a genuinely EMPTY subtree under the prefix (:70)          → SILENT
//   S11 a subtree whose entries are all non-`.theta` files (:70)  → SILENT
//   S12 a static-prefix root that does not exist (p-a-s.md:29)    → SILENT
//   P0  package control: no denial — the pattern selects the nested theta
//   P2  `pi.theta: []` (whole universe selected; `thetasInDirectory` reports)
//       → EXACTLY ONE diagnostic for that (code, file) pair — the package-side
//       double-report guard of (5)
//   P3  package `pi.theta` universe, `ENOENT` on the subtree      → SILENT (4)
//   P4  the `theta/` fallback's ignored subdirectories (p-a-s.md:31, :92) —
//       a denied nested directory costs nothing and owes nothing
//
// THE INJECTION SEAM. `tests/helpers/fake-file-system.ts` rejects EVERY member
// for a path in its `errors` map, so `lstat` fails too and no universe entry is
// produced for the denied path at all. Witnessing this defect needs `readdir`
// to reject while `lstat` still reports a directory, so the local
// `ReaddirDenied` decorator below — the shape bug 0076's witness establishes at
// tests/discovery-root-enumeration-failure.test.ts:296-351 — rejects `readdir`
// for exactly one configured path with a Node-style `.code` and delegates every
// other member to an inner `FakeFileSystem`. One addition this bug needs and
// bug 0076's copy does not: an optional per-path `lstat` denial, so cell S3 can
// make the denied path's ANCESTOR chain dirty (the :68 walk's unreadable arm)
// without denying the walk that reaches the path.

// ===========================================================================
// The registry row (DIAG-4) — every expected message below is sourced from the
// Message column of docs/spec_topics/diagnostics/code-registry-load.md, never
// pasted prose. Helper shapes mirror
// tests/discovery-root-enumeration-failure.test.ts:158-203.
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
 * spelling is left open by the spec (`` package `foo` (pi.theta) `` at
 * package-and-settings.md:27 against `` package `foo` (pi.theta[0]) `` at
 * discovery-sources.md:63).
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
// Fixtures. Shapes mirror tests/discovery-root-enumeration-failure.test.ts.
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

/** Proper-ancestor directories of `leaf`, so an `ENOENT` on `leaf` is a CLEAN
 *  leaf under the :68 walk (every ancestor `lstat`s ok as a directory) rather
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

/** The two conventional roots' ancestor chains plus the settings-base chain, in
 *  every settings fixture, so a cell's diagnostic set is about the path under
 *  test alone and the fixture's directory shape stays self-consistent. */
const BASE = mergeDirs(
  ancestors(GLOBAL_ROOT),
  ancestors(PROJECT_ROOT),
  ancestors(DENIED_SUB),
);

/** The five installed-package roots `packageRoots` enumerates
 *  (src/discovery/package-discovery.ts:226-246), registered as empty
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
   *  `errors` map) — the blunt injection, not this defect's seam. */
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
 * Node-style `.code` — and, optionally, `lstat` for one other path — and
 * delegates every other member to an inner `FakeFileSystem`. This is the seam
 * that reaches the defect: the denied directory still `lstat`s as a directory,
 * so the universe walk descends into it and only its enumeration fails.
 * Mirrors tests/discovery-root-enumeration-failure.test.ts:296-351, extended
 * with the `lstat` denial cell S3 needs for a dirty ancestor chain.
 */
class ReaddirDenied implements FileSystem {
  readonly #inner: FakeFileSystem;
  readonly #denied: string;
  readonly #code: string;
  readonly #lstatDenied: { readonly path: string; readonly code: string } | undefined;

  constructor(
    inner: FakeFileSystem,
    denied: string,
    code: string,
    lstatDenied?: { readonly path: string; readonly code: string },
  ) {
    this.#inner = inner;
    this.#denied = denied;
    this.#code = code;
    this.#lstatDenied = lstatDenied;
  }

  readdir(path: string): Promise<readonly string[]> {
    if (path === this.#denied) {
      return Promise.reject(codeError(this.#code));
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
  configDirName(): string {
    return this.#inner.configDirName();
  }
  globalAgentDir(): string {
    return this.#inner.globalAgentDir();
  }
  lstat(path: string): Promise<FileStat> {
    if (this.#lstatDenied !== undefined && path === this.#lstatDenied.path) {
      return Promise.reject(codeError(this.#lstatDenied.code));
    }
    return this.#inner.lstat(path);
  }
  realpath(path: string): Promise<string> {
    return this.#inner.realpath(path);
  }
}

/** A Node-style error carrying the injected `.code` (what `nodeErrorCode`,
 *  src/discovery/node-error-code.ts:25, reads). */
function codeError(code: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`${code}: readdir`);
  error.code = code;
  return error;
}

function input(fs: FileSystem, extra: Partial<DiscoveryInput> = {}): DiscoveryInput {
  return { fs, settings: {}, ...extra };
}

/** A settings input whose `thetaPaths` resolve against `/project/.pi`. */
function settingsInput(fs: FileSystem, thetaPaths: readonly string[]): DiscoveryInput {
  return input(fs, { settings: { thetaPaths, thetaPathsBaseDir: SETTINGS_BASE } });
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

/** The diagnostics carrying `code` and locating `file` (DISC-2 rule 2 at
 *  discovery-sources.md:63: `file` is the denied directory path). */
function hitsFor(
  diagnostics: readonly Diagnostic[],
  code: string,
  file: string,
): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code && d.file === file);
}

/**
 * The bug-0113 pin: the universe walk's `readdir` failure on `file` surfaced as
 * exactly ONE diagnostic with the adjudicated shape — `theta/load/unreadable-source`,
 * `warning`, the denied path in `file`, and the registry-sourced message
 * carrying `descriptor`. The PRIMARY assertion quotes every observed diagnostic
 * so the red-at-HEAD output proves the documented reason: nothing is emitted at
 * all. The count is pinned EXACT per adjudication (5) — one diagnostic per
 * denied path per pass, whichever walk observes it first.
 */
function expectUniverseFailure(
  diagnostics: readonly Diagnostic[],
  file: string,
  descriptor: string,
  why: string,
): void {
  const hits = hitsFor(diagnostics, UNREADABLE_SOURCE, file);
  expect(
    hits.length,
    `PRIMARY (bug 0113): ${why} — discovery-sources.md:69 forbids silence for a ` +
      `"traversal failure inside a discovery root that does exist" ("an ` +
      `unreadable-source warning, not silence"), and :57 gives the Settings row's ` +
      `Unreadable cell the severity warning. AT HEAD listTree ` +
      `(src/discovery/discovery-walk.ts) maps the readdir rejection to undefined ` +
      `without capturing .code and returns from the subtree in silence; ` +
      `it takes no diagnostics parameter, so the shrunken universe is ` +
      `unreported. Observed diagnostics=${JSON.stringify(diagnostics)}`,
  ).toBe(1);
  const diagnostic = hits[0]!;
  expect(
    diagnostic.severity,
    "the Settings `thetaPaths` entry row's Unreadable cell is a warning " +
      "(discovery-sources.md:57), and warning severity is what reaches the " +
      "theta-system-note channel (cell E1)",
  ).toBe("warning");
  expect(
    diagnostic.message,
    "DIAG-4: the message is the registry row's Message column interpolated with the " +
      "source descriptor (discovery-sources.md:63, package-and-settings.md:97)",
  ).toBe(interpolate(loadRowMessage(UNREADABLE_SOURCE), { descriptor }));
  expect(
    diagnostics.filter((d) => d.code === MISSING_SOURCE),
    "adjudication (4): a universe walk NEVER emits missing-source — a pattern " +
      "resolving to zero paths is silent (package-and-settings.md:29)",
  ).toHaveLength(0);
}

// ===========================================================================
// Cells S0-S12 — the settings `thetaPaths` universe (`listTree`,
// `src/discovery/discovery-walk.ts`, reached through `treeFor` from `addGlob`).
// ===========================================================================

describe("bug 0113 — a settings glob universe whose readdir rejects reports its failure (discovery-sources.md:69, :57)", () => {
  /** `/project/.pi/g/sub/s.theta`, the theta every measurement cell loses. */
  const nestedThetaFixture: FakeSpec = {
    dirs: { [PREFIX_ROOT]: ["sub"], [DENIED_SUB]: ["s.theta"] },
    files: { [`${DENIED_SUB}/s.theta`]: THETA_BODY },
  };

  it("control S0 (green): with nothing denied, `g/**/*.theta` DOES select the nested theta and the pass is silent", async () => {
    // The bug doc's §Reproduction control: it establishes that the pattern
    // selects the file through `globMatches` (`src/discovery/discovery-walk.ts`,
    // bug 0077's conformant predicate), so every red below is the universe walk
    // losing a path it enumerated successfully in this cell — not a
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
      "a fully-enumerated universe emits nothing (discovery-sources.md:70)",
    ).toHaveLength(0);
  });

  it("RED S1: `g/**/*.theta` whose subtree denies readdir EACCES emits one unreadable-source warning naming `settings entry index 0`", async () => {
    const fs = new ReaddirDenied(build(nestedThetaFixture), DENIED_SUB, "EACCES");

    const { thetas, diagnostics } = await discoverThetas(
      settingsInput(fs, ["g/**/*.theta"]),
    );

    // The loss half of the defect, true at HEAD and post-fix: the universe is
    // short, so the theta cannot register. Only the reporting half changes.
    expect(
      named(thetas, "s"),
      "guard: the theta under the denied subtree is absent either way — the " +
        "adjudication adds the diagnostic, it does not recover the path",
    ).toBeUndefined();
    expectUniverseFailure(
      diagnostics,
      DENIED_SUB,
      "settings entry index 0",
      "the static-prefix root `/project/.pi/g` enumerates successfully and the " +
        "failure is one level below it (EACCES — the Windows parent-ACL case " +
        "discovery-sources.md:68 cites)",
    );
  });

  it("RED S2: the same subtree denying readdir EPERM emits the same one warning", async () => {
    const fs = new ReaddirDenied(build(nestedThetaFixture), DENIED_SUB, "EPERM");

    const { diagnostics } = await discoverThetas(settingsInput(fs, ["g/**/*.theta"]));

    expectUniverseFailure(
      diagnostics,
      DENIED_SUB,
      "settings entry index 0",
      "EPERM is the second code discovery-sources.md:68 branches on, and at HEAD it " +
        "is indistinguishable from EACCES and from a clean-leaf ENOENT because no " +
        "code is read at all",
    );
  });

  it("RED S3: the subtree denying readdir ENOENT with a DIRTY ancestor chain emits one unreadable-source warning (the :68 unreadable arm)", async () => {
    // The :68 walk decides this cell: `/project/.pi` — a proper ancestor of the
    // denied path — fails `lstat` with EACCES, so the chain is dirty and the
    // ENOENT classifies as *unreadable*, not *missing*. The `lstat` denial is
    // deliberately placed on a path the universe walk itself never `lstat`s
    // (it walks downward from `/project/.pi/g`), so the only consumer of that
    // rejection is `ancestorsClean` (`src/discovery/discovery-walk.ts`).
    // Cell S9 is the same rejection code with a clean chain and must stay
    // SILENT — the pair is what makes the code classification observable.
    const fs = new ReaddirDenied(build(nestedThetaFixture), DENIED_SUB, "ENOENT", {
      path: SETTINGS_BASE,
      code: "EACCES",
    });

    const { diagnostics } = await discoverThetas(settingsInput(fs, ["g/**/*.theta"]));

    expectUniverseFailure(
      diagnostics,
      DENIED_SUB,
      "settings entry index 0",
      "the rejection is ENOENT and an ancestor (`/project/.pi`) lstats EACCES, so " +
        "the :68 ancestor walk classifies the result unreadable for this explicit " +
        "reference",
    );
  });

  it("RED S4: the loss is per-subtree — the readable sibling registers AND the denied one warns (discovery-sources.md:64)", async () => {
    const denied = `${PREFIX_ROOT}/denied`;
    const fs = new ReaddirDenied(
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

    const { thetas, diagnostics } = await discoverThetas(
      settingsInput(fs, ["g/**/*.theta"]),
    );

    expect(
      named(thetas, "a"),
      "guard: the readable sibling registers, which is what makes the loss hard to " +
        "notice — a plausible inventory that is one theta short",
    ).toBeDefined();
    expect(named(thetas, "b"), "guard: the denied subtree's theta is absent").toBeUndefined();
    expectUniverseFailure(
      diagnostics,
      denied,
      "settings entry index 0",
      "one denied subtree marks the inventory short while the pass completes " +
        "(discovery-sources.md:64)",
    );
  });

  it("RED S5: two entries sharing one static-prefix root emit EXACTLY ONE warning, owned by the LOWEST index", async () => {
    // `treeFor` (`src/discovery/discovery-walk.ts`) caches the universe by
    // static-prefix root, so entry 1 never walks: it reads entry 0's cached
    // tree. Adjudication (3) pins that determinism as the attribution rule —
    // the lowest index that triggered the walk owns the rejection — and (5)
    // pins the count at one, not one per sharing entry.
    const fs = new ReaddirDenied(
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
    expectUniverseFailure(
      diagnostics,
      DENIED_SUB,
      "settings entry index 0",
      "two thetaPaths entries share one cached universe walk, so the rejection is " +
        "observed once and attributed to the lowest index that triggered it",
    );
  });

  it("RED S6: the glob's own static-prefix ROOT denying readdir EACCES emits one unreadable-source warning", async () => {
    // Sharper than a subtree: `/project/.pi/g` is the directory the entry text
    // names literally, and at HEAD it produces nothing. A glob entry never
    // reaches `classifyPath` — `resolveSettingsSource` (`src/discovery/discovery-walk.ts`)
    // routes it to `addGlob`, not `addLiteral` — so the
    // entry-level classification that reports a denied literal directory is not
    // on this path either. Adjudication (1) covers the root explicitly.
    const fs = new ReaddirDenied(build(nestedThetaFixture), PREFIX_ROOT, "EACCES");

    const { thetas, diagnostics } = await discoverThetas(
      settingsInput(fs, ["g/**/*.theta"]),
    );

    expect(thetas, "guard: the whole universe is empty, so nothing registers").toHaveLength(0);
    expectUniverseFailure(
      diagnostics,
      PREFIX_ROOT,
      "settings entry index 0",
      "the static-prefix root itself — the literal directory the author typed — " +
        "cannot be enumerated, and the loss is total",
    );
  });

  it("RED S7: pattern shape does not decide the disposition — `g/*` and `g/**/*.theta` each yield EXACTLY ONE diagnostic for the denied path", async () => {
    // The contrast that makes bug 0113 a residual of bug 0076. `g/*` matches
    // the denied DIRECTORY, which is in the universe (its own `lstat` succeeded
    // while its parent was being walked), so `addGlob` sends it to `addDir`
    // → `enumerateDirectory`, which reports after bug 0076.
    // `g/**/*.theta` matches only the FILE inside it, which the shrunken
    // universe does not hold, so no arm is entered.
    //
    // The `g/*` half is GREEN at HEAD and is the double-report guard of
    // adjudication (5): the universe walk crosses the same path in the same
    // pass, and a fix that emits there unconditionally would make this two.
    // The `g/**/*.theta` half is the RED.
    const deniedFs = (): FileSystem =>
      new ReaddirDenied(build(nestedThetaFixture), DENIED_SUB, "EACCES");

    const dirPattern = await discoverThetas(settingsInput(deniedFs(), ["g/*"]));
    const filePattern = await discoverThetas(settingsInput(deniedFs(), ["g/**/*.theta"]));

    expect(
      hitsFor(dirPattern.diagnostics, UNREADABLE_SOURCE, DENIED_SUB).length,
      `adjudication (5): exactly ONE diagnostic per denied path per pass. With \`g/*\` ` +
        `the per-match enumeration already reports this path; the universe walk MUST ` +
        `NOT add a second for the same (code, file) pair. ` +
        `Observed diagnostics=${JSON.stringify(dirPattern.diagnostics)}`,
    ).toBe(1);
    expectUniverseFailure(
      filePattern.diagnostics,
      DENIED_SUB,
      "settings entry index 0",
      "the same fixture and the same denied path under a pattern that matches the " +
        "file rather than the directory — at HEAD `g/*` warns and `g/**/*.theta` is " +
        "silent, a difference with no basis in any spec sentence",
    );
    expect(
      hitsFor(filePattern.diagnostics, UNREADABLE_SOURCE, DENIED_SUB)[0]?.message,
      "the two pattern shapes agree on the descriptor as well as the count",
    ).toBe(hitsFor(dirPattern.diagnostics, UNREADABLE_SOURCE, DENIED_SUB)[0]?.message);
  });

  it("RED S8: a `+` operand recovers the file AND the universe failure is still reported", async () => {
    // Override stage (3) routes a `+` operand through `addLiteral`
    // (`src/discovery/discovery-walk.ts`), which calls
    // `classifyPath` on the file itself; the file's `lstat` succeeds and it
    // registers. That locates the loss precisely — the `.theta` is readable
    // throughout, only the universe that would have found it is short — and it
    // pins that the diagnostic is owed even when a later stage happens to
    // re-admit the same path.
    const fs = new ReaddirDenied(build(nestedThetaFixture), DENIED_SUB, "EACCES");

    const { thetas, diagnostics } = await discoverThetas(
      settingsInput(fs, ["g/**/*.theta", "+g/sub/s.theta"]),
    );

    expect(
      named(thetas, "s"),
      "guard: the `+` operand classifies the file directly and it registers",
    ).toBeDefined();
    expectUniverseFailure(
      diagnostics,
      DENIED_SUB,
      "settings entry index 0",
      "the universe walk entry 0 triggered still failed, and the walk owes the " +
        "report whether or not a later override stage re-admits the path",
    );
  });

  it("control S9 (green): a subtree whose readdir rejects a clean-leaf ENOENT stays SILENT", async () => {
    // Adjudication (4): a clean-leaf ENOENT under the static prefix leaves the
    // pattern resolving to zero paths, which package-and-settings.md:29 keeps
    // silent. Every proper ancestor of the denied path lstats ok as a directory
    // (the :68 clean-leaf walk), which is the ONLY difference from cell S3.
    const fs = new ReaddirDenied(build(nestedThetaFixture), DENIED_SUB, "ENOENT");

    const { thetas, diagnostics } = await discoverThetas(
      settingsInput(fs, ["g/**/*.theta"]),
    );

    expect(thetas, "the pattern resolves to zero paths").toHaveLength(0);
    expect(
      diagnostics,
      "a clean-leaf ENOENT under a glob's static prefix is silent — the fix must " +
        "not emit missing-source here (package-and-settings.md:29)",
    ).toHaveLength(0);
  });

  it("control S10 (green): a genuinely EMPTY subtree under the static prefix stays SILENT (discovery-sources.md:70)", async () => {
    // No injection: the inner fake reports `sub` as an empty directory. This is
    // the state the defect is currently indistinguishable from, and the reason
    // :70's carve-out has work to do only if failed enumeration is not silent.
    const fs = build({ dirs: { [PREFIX_ROOT]: ["sub"], [DENIED_SUB]: [] } });

    const { thetas, diagnostics } = await discoverThetas(
      settingsInput(fs, ["g/**/*.theta"]),
    );

    expect(thetas, "an empty subtree contributes no theta").toHaveLength(0);
    expect(
      diagnostics,
      "an empty directory enumerates zero thetas successfully and emits no " +
        "diagnostic (discovery-sources.md:70)",
    ).toHaveLength(0);
  });

  it("control S11 (green): a subtree whose entries are all non-`.theta` files stays SILENT (discovery-sources.md:70, second half)", async () => {
    // The half of :70 the bug doc records as "required silent and not yet
    // measured". Both pattern shapes are exercised: `g/*` matches the directory
    // and enumerates it (zero `.theta` children, no diagnostic), and
    // `g/**/*.theta` matches nothing at all.
    const spec: FakeSpec = {
      dirs: { [PREFIX_ROOT]: ["sub"], [DENIED_SUB]: ["notes.md", "README"] },
      files: { [`${DENIED_SUB}/notes.md`]: "x", [`${DENIED_SUB}/README`]: "x" },
    };

    const dirPattern = await discoverThetas(settingsInput(build(spec), ["g/*"]));
    const filePattern = await discoverThetas(
      settingsInput(build(spec), ["g/**/*.theta"]),
    );

    expect(dirPattern.thetas, "no `.theta` children to contribute").toHaveLength(0);
    expect(
      dirPattern.diagnostics,
      "a directory whose entries are all non-`.theta` files enumerates zero thetas " +
        "successfully and emits no diagnostic (discovery-sources.md:70)",
    ).toHaveLength(0);
    expect(filePattern.thetas, "the pattern matches nothing").toHaveLength(0);
    expect(
      filePattern.diagnostics,
      "and a pattern matching nothing in a fully-enumerated universe is silent " +
        "(package-and-settings.md:29)",
    ).toHaveLength(0);
  });

  it("control S12 (green): a static-prefix root that does not exist at all stays SILENT (package-and-settings.md:29)", async () => {
    // No injection: `/project/.pi/g` is simply not registered, so the fake's own
    // `readdir` rejects ENOENT with every proper ancestor lstatting ok as a
    // directory — the :68 clean leaf. The glob resolves to zero files, which is
    // silent by design; adjudication (4) keeps it so.
    const fs = build({});

    const { thetas, diagnostics } = await discoverThetas(
      settingsInput(fs, ["g/**/*.theta"]),
    );

    expect(thetas, "an absent prefix root yields an empty universe").toHaveLength(0);
    expect(
      diagnostics,
      "a glob pattern that resolves to zero files is silent, not an error " +
        "(package-and-settings.md:29) — the fix must not emit here",
    ).toHaveLength(0);
  });
});

// ===========================================================================
// Cells P0-P4 — the package `pi.theta` universe
// (src/discovery/package-discovery.ts:314, called from resolvePiThetas at
// :398, whose `diagnostics` parameter is in scope at that call).
// ===========================================================================

describe("bug 0113 — a package `pi.theta` universe whose readdir rejects reports its failure (discovery-sources.md:69, :56)", () => {
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

  /** The package-side pin: exactly one warning whose message frame is the
   *  registry template (DIAG-4) and whose descriptor names the package and the
   *  manifest key. The descriptor slot is matched by content because the spec
   *  carries two spellings — `` package `foo` (pi.theta) ``
   *  (package-and-settings.md:27) and `` package `foo` (pi.theta[0]) ``
   *  (discovery-sources.md:63). */
  function expectPackageUniverseFailure(
    diagnostics: readonly Diagnostic[],
    file: string,
    why: string,
  ): void {
    const hits = hitsFor(diagnostics, UNREADABLE_SOURCE, file);
    expect(
      hits.length,
      `PRIMARY (bug 0113): ${why} — discovery-sources.md:69 forbids silence and :56 ` +
        `gives the \`Package pi.theta entry\` row's Unreadable cell the severity ` +
        `warning. AT HEAD listTree (src/discovery/package-discovery.ts:314) drops the ` +
        `rejection through readdirOr (:155) and returns from the subtree in silence ` +
        `(:318), so the universe every override stage and the contribution loop ` +
        `iterate is short. Observed diagnostics=${JSON.stringify(diagnostics)}`,
    ).toBe(1);
    const diagnostic = hits[0]!;
    expect(
      diagnostic.severity,
      "the `Package pi.theta` row's Unreadable cell is a warning (discovery-sources.md:56)",
    ).toBe("warning");
    expect(
      diagnostic.message,
      "DIAG-4: the message is the registry row's Message template",
    ).toMatch(templateToRegExp(loadRowMessage(UNREADABLE_SOURCE)));
    expect(
      diagnostic.message,
      "the descriptor names the offending package (discovery-sources.md:63)",
    ).toContain("package `beta`");
    expect(
      diagnostic.message,
      "and the manifest key that contributed it (package-and-settings.md:27)",
    ).toContain("pi.theta");
    expect(
      diagnostics.filter((d) => d.code === MISSING_SOURCE),
      "adjudication (4): the package copy treats every ENOENT as clean, and a " +
        "universe walk never emits missing-source",
    ).toHaveLength(0);
  }

  it("control P0 (green): with nothing denied, `pi.theta: [\"**/*.theta\"]` selects the nested theta and the pass is silent", async () => {
    const fs = buildPackages(betaFixture(["**/*.theta"]));

    const { thetas, diagnostics } = await discoverPackageThetas(packageInput(fs));

    expect(
      named(thetas, "b"),
      "the pattern selects `<pkg>/cmds/b.theta` when the universe is complete",
    ).toBeDefined();
    expect(diagnostics, "a complete universe emits nothing").toHaveLength(0);
  });

  it("RED P1: `pi.theta: [\"**/*.theta\"]` over a `cmds/` denying readdir EACCES emits one unreadable-source warning naming the package", async () => {
    const fs = new ReaddirDenied(
      buildPackages(betaFixture(["**/*.theta"])),
      DENIED_CMDS,
      "EACCES",
    );

    const { thetas, diagnostics } = await discoverPackageThetas(packageInput(fs));

    expect(
      named(thetas, "b"),
      "guard: the theta under the denied subtree is absent either way",
    ).toBeUndefined();
    expectPackageUniverseFailure(
      diagnostics,
      DENIED_CMDS,
      "the package root enumerates successfully and the failure is one level below " +
        "it, so the pattern's match is absent from the universe entirely",
    );
  });

  it("control P2 (green): `pi.theta: []` selects the whole universe and yields EXACTLY ONE diagnostic for the denied directory", async () => {
    // With no plain include pattern the starting set is every path under the
    // package root (package-and-settings.md:21), which holds the denied
    // DIRECTORY (its own `lstat` succeeded while the root was being walked), so
    // the per-match contribution loop (src/discovery/package-discovery.ts:433)
    // sends it to `thetasInDirectory` (:472) and bug 0076's emitter fires.
    // Green at HEAD; this is the package-side double-report guard of
    // adjudication (5) — the universe walk crosses the same path in the same
    // pass and must not add a second diagnostic for that (code, file) pair.
    const fs = new ReaddirDenied(
      buildPackages(betaFixture([])),
      DENIED_CMDS,
      "EACCES",
    );

    const { diagnostics } = await discoverPackageThetas(packageInput(fs));

    expect(
      hitsFor(diagnostics, UNREADABLE_SOURCE, DENIED_CMDS).length,
      `adjudication (5): exactly ONE diagnostic per denied path per pass — the ` +
        `per-match enumeration already reports this path. ` +
        `Observed diagnostics=${JSON.stringify(diagnostics)}`,
    ).toBe(1);
  });

  it("control P3 (green): a `pi.theta` universe subtree whose readdir rejects ENOENT stays SILENT", async () => {
    // Adjudication (4): the package copy treats every ENOENT as clean and
    // silent — its ancestors are pre-proven enterable, the reasoning
    // `thetasInDirectory` (src/discovery/package-discovery.ts:472) already
    // states — and a pattern resolving to zero paths is silent
    // (package-and-settings.md:29).
    const fs = new ReaddirDenied(
      buildPackages(betaFixture(["**/*.theta"])),
      DENIED_CMDS,
      "ENOENT",
    );

    const { thetas, diagnostics } = await discoverPackageThetas(packageInput(fs));

    expect(thetas, "the pattern resolves to zero paths").toHaveLength(0);
    expect(
      diagnostics,
      "an ENOENT inside a package universe walk is silent — the fix must not emit " +
        "missing-source or unreadable-source here",
    ).toHaveLength(0);
  });

  it("control P4 (green): the conventional `theta/` fallback's ignored subdirectories stay SILENT even when denied", async () => {
    // `resolvePackage` routes the fallback to `thetasInDirectory` directly
    // (src/discovery/package-discovery.ts:542) and builds NO universe, so the
    // `Package theta/ directory` row is out of this defect's reach. The nested
    // directory is excluded by the non-recursion rule
    // (package-and-settings.md:31, :92), not by the denial: no theta is lost,
    // so no diagnostic is owed.
    const nested = `${NM}/gamma/theta/nested`;
    const fs = new ReaddirDenied(
      buildPackages({
        dirs: {
          ...ancestors(nested),
          [NM]: ["gamma"],
          [`${NM}/gamma`]: ["package.json", "theta"],
          [`${NM}/gamma/theta`]: ["g.theta", "nested"],
          [nested]: ["n.theta"],
        },
        files: {
          [`${NM}/gamma/package.json`]: JSON.stringify({ name: "gamma" }),
          [`${NM}/gamma/theta/g.theta`]: THETA_BODY,
          [`${nested}/n.theta`]: THETA_BODY,
        },
      }),
      nested,
      "EACCES",
    );

    const { thetas, diagnostics } = await discoverPackageThetas(packageInput(fs));

    expect(named(thetas, "g"), "the fallback's own `.theta` child registers").toBeDefined();
    expect(
      named(thetas, "n"),
      "the nested theta is excluded by non-recursion, not by the denial",
    ).toBeUndefined();
    expect(
      diagnostics,
      "the `theta/` fallback builds no universe and loses nothing to the denial, so " +
        "it owes nothing (package-and-settings.md:31, :92)",
    ).toHaveLength(0);
  });
});

// ===========================================================================
// Cell E1 — end-to-end channel confirmation (bug 0013). A warning no sink
// surfaces is not a fix: the route is `sink.emitGroup(walk.diagnostics)`
// (src/extension/production-composition.ts:539) into `emitLoadNoteGroup`
// (:1269-1286), whose warning arm (:1280-1284) selects on
// `severity === "warning"` with no code allow-list. Harness shape mirrors
// tests/load-warning-delivery.test.ts:280-362 (the bug-0013 pin at :564).
//
// The composition root builds its own `PiFileSystem` from `ctx.cwd`
// (production-composition.ts:330) and `ComposeSeamOverrides` (:175-194) carries
// no filesystem seam, so this cell cannot inject the `ReaddirDenied` decorator.
// It reaches the SAME universe-walk swallow on the real filesystem instead: the
// static-prefix root of `g/**/*.theta` is `<ws>/.pi/g`, and a REGULAR FILE at
// that path makes the real `fs.readdir` reject `ENOTDIR` — one of the three
// codes discovery-sources.md:68 classifies as *unreadable* — with no ACL
// manipulation and no platform branch. A glob entry never reaches
// `classifyPath`, so no wrong-type arm sees this path either; under
// adjudication (1)/(2) it is an unreadable-source warning.
// ===========================================================================

/** A recorded `pi.sendMessage` call (the `theta-system-note` channel). */
interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: { readonly diagnostics?: readonly Diagnostic[] } | undefined;
  readonly triggerTurn: unknown;
}

interface ShippedHarness {
  readonly commands: Map<string, unknown>;
  readonly notes: RecordedNote[];
  readonly notifications: string[];
  fireSessionStart(): Promise<void>;
}

function makeShippedHarness(cwd: string): ShippedHarness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const notifications: string[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (
      message: {
        customType: string;
        content: string;
        display: boolean;
        details: unknown;
      },
      options: { triggerTurn: unknown },
    ): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        details: message.details as RecordedNote["details"],
        triggerTurn: options.triggerTurn,
      });
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    // A recording toast so a warning wrongly routed to the transient surface is
    // observable (diagnostic-shape.md transient-toast MUST NOT).
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const deps: ThetaExtensionDeps = {
    fixtures: [],
    composeInstance: (composePi, composeCtx) =>
      composeExtensionInstance(composePi, composeCtx, {
        fileWatcher: new FakeFileWatcher(),
        clock: new FakeClock(),
      }),
  };
  createThetaExtension(deps)(pi);

  return {
    commands,
    notes,
    notifications,
    fireSessionStart: async () => {
      for (const handler of subscriptions.get("session_start") ?? []) {
        await handler({ type: "session_start" }, ctx);
      }
    },
  };
}

describe("bug 0113 — the universe-walk warning reaches the theta-system-note channel (bug 0013's route)", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-0113-"));
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    // A readable control theta, so the pass is proven to run and register.
    writeFileSync(
      join(workspace, ".pi", "theta", "okctl.theta"),
      ["---", "mode: prompt", "---", "@`hi`", ""].join("\n"),
      "utf8",
    );
    // The settings entry whose glob universe fails, and the REGULAR FILE at its
    // static-prefix root that makes the real `readdir` reject ENOTDIR.
    writeFileSync(
      join(workspace, ".pi", "settings.json"),
      JSON.stringify({ thetaPaths: ["g/**/*.theta"] }),
      "utf8",
    );
    writeFileSync(join(workspace, ".pi", "g"), "not a directory\n", "utf8");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("RED E1: the settings-side unreadable-source WARNING arrives on the theta-system-note channel through the real composition root", async () => {
    const harness = makeShippedHarness(workspace);

    await harness.fireSessionStart();

    expect(
      harness.commands.has("okctl"),
      "guard: the pass completes and the readable control theta registers " +
        "(discovery-sources.md:64)",
    ).toBe(true);
    expect(
      harness.notifications,
      "warnings MUST NOT route through ctx.ui.notify (diagnostic-shape.md transient " +
        "toasts) — this must hold before and after the fix",
    ).toHaveLength(0);

    const hits = harness.notes.filter((note) =>
      (note.details?.diagnostics ?? []).some(
        (d) =>
          d.code === UNREADABLE_SOURCE &&
          d.severity === "warning" &&
          (d.file ?? "").endsWith("/.pi/g"),
      ),
    );
    expect(
      hits.length,
      `PRIMARY (bug 0113 + bug 0013): the glob universe's static-prefix root ` +
        `<ws>/.pi/g is a regular file, so the real fs.readdir rejects ENOTDIR — one of ` +
        `the codes discovery-sources.md:68 classifies as unreadable — and :69 forbids ` +
        `silence. The warning must reach the theta-system-note channel through ` +
        `sink.emitGroup(walk.diagnostics) (production-composition.ts:539) → ` +
        `emitLoadNoteGroup's warning arm (:1280-1284). AT HEAD listTree ` +
        `(discovery-walk.ts) produces no diagnostic at all, so nothing is ` +
        `emitted and nothing is delivered. Observed notes=` +
        `${JSON.stringify(harness.notes)}`,
    ).toBeGreaterThanOrEqual(1);
    const note = hits[0]!;
    expect(
      note.customType,
      "the persistent-diagnostics channel's envelope (diagnostic-shape.md)",
    ).toBe("theta-system-note");
    expect(note.display, "the note is displayed").toBe(true);
    expect(note.triggerTurn, "a load note never triggers a turn").toBe(false);
    const delivered = (note.details?.diagnostics ?? []).find(
      (d) => d.code === UNREADABLE_SOURCE,
    )!;
    expect(
      delivered.message,
      "DIAG-4: the delivered message is the registry row's Message column carrying " +
        "the `settings entry index N` descriptor (package-and-settings.md:97)",
    ).toBe(
      interpolate(loadRowMessage(UNREADABLE_SOURCE), {
        descriptor: "settings entry index 0",
      }),
    );
  });
});
