import { describe, expect, it } from "vitest";
import {
  discoverThetas,
  type DiscoveredTheta,
  type DiscoveryInput,
} from "../src/discovery/discovery-walk";
import {
  discoverPackageThetas,
  type PackageDiscoveredTheta,
} from "../src/discovery/package-discovery";
import { loadSettings, type ThetaSettings } from "../src/discovery/settings";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { FileStat, FileSystem } from "../src/seams/file-system";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileSystem } from "./helpers/fake-file-system";

// Every conventional path is resolved against the RUNNING host, and an absent
// conventional root is silent.
//
// Two contracts, one fixture family:
//
// (B2) The host-location seams `configDirName()` — `".pi"` on Pi, `".omp"` on
//      Oh-My-Pi — and `globalAgentDir()` are what every conventional path is
//      built from. `configDirName()` covers the PROJECT-relative set: the
//      project root `<cwd>/<config-dir>/theta/`, the diagnostic descriptor
//      naming it, `<cwd>/<config-dir>/settings.json`, the project
//      `thetaPathsBaseDir` arm, and two of the five installed-package roots.
//      `globalAgentDir()` covers the GLOBAL set: `<globalAgentDir>/theta/`,
//      `<globalAgentDir>/settings.json`, the global `thetaPathsBaseDir` arm, and
//      two more installed-package roots (`node_modules`, the fifth, is neither).
//      A theta must resolve all of those against the host actually running it,
//      not the one this extension was authored against
//      (src/seams/file-system.ts:28-73). Cells 1-6 run a `".omp"` host and plant
//      a `.pi` DECOY at the path a hardcoded spelling would reach; cell 7 runs a
//      RELOCATED global agent directory and plants the decoy at the
//      `<homedir>/<config-dir>/agent` path a SYNTHESISED global spelling would
//      reach. Either decoy going undiscovered — and unread — is what proves the
//      path is derived rather than baked in.
//      discovery-sources.md:43,45 spell the two roots with `.pi` because the
//      spec is written from Pi's vantage point; the generalisation is the host
//      substitution, not a different layout.
//
// (A4) An absent conventional root contributes nothing and SAYS nothing.
//      discovery-sources.md:47 — "conventional locations … silently tolerate
//      absence — that is the normal case on a fresh install"; :51-52, the
//      Missing column for the Global and Project rows, is "silent". :66's
//      clean-leaf-`ENOENT` walk says an `ENOENT` whose ancestor chain is itself
//      dirty ("any ancestor `lstat` returns … itself `ENOENT`") classifies as
//      *unreadable* — a warning. For a conventional root the nearest ancestor
//      IS the host config directory, and "the config directory does not exist
//      either" is the most ordinary shape of absence, so that rule turned the
//      universal case into two spurious `theta/load/unreadable-source`
//      warnings in every workspace. The walk now skips an `ENOENT` conventional
//      root before classification. The narrowness is the point, and cells 10-13
//      pin it: a root that EXISTS and cannot be read still warns (:51-52
//      Unreadable column), and the clean-leaf distinction is untouched for the
//      explicit CLI references (:56) where a missing intermediate directory is
//      real signal about a path the user typed.

const HOME = "/home/theta";
const CWD = "/project";

const MISSING_SOURCE = "theta/load/missing-source";
const UNREADABLE_SOURCE = "theta/load/unreadable-source";

/** A body that parses far enough to register (discovery only reads bytes). */
const THETA_BODY = "mode: prompt\n---\n";

// --------------------------------------------------------------------------
// Fixture + seam helpers.
// --------------------------------------------------------------------------

/** Proper-ancestor directories of `leaf`, root-first (the leaf itself is NOT
 *  registered), so an `ENOENT` on `leaf` is a CLEAN leaf under the :66 walk. */
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

interface FakeSpec {
  readonly dirs?: Record<string, readonly string[]>;
  readonly files?: Record<string, string>;
  readonly errors?: Record<string, string>;
}

/**
 * A `FileSystem` decorator reporting a chosen `configDirName()` / resolved
 * `globalAgentDir()` and recording every path the walk reads or lists,
 * delegating every other member to an inner `FakeFileSystem`. The shared fake
 * hardcodes `".pi"` and `<homedir>/.pi/agent` (and existing suites depend on
 * those defaults), so the host substitution is injected here rather than in the
 * fake. The delegation shape mirrors `ReaddirDenied`
 * (tests/discovery-root-enumeration-failure.test.ts:300-350).
 *
 * The two recorders serve the NEGATIVE direction: "the `.pi` path was never
 * even consulted" is a stronger statement than "the `.pi` theta did not
 * register", and it is the one that fails if a second hardcoded spelling is
 * reintroduced beside the derived one.
 *
 * `globalAgentDir` defaults to `<homedir>/<configDirName>/agent` — the answer
 * BOTH hosts' own `getAgentDir()` gives when nothing relocates it — so the B2
 * and A4 cells below read exactly the paths they always did. Cell 7 passes it
 * explicitly, which is the only way to express the relocated case: a directory
 * NAME cannot.
 */
class HostFileSystem implements FileSystem {
  /** Every path passed to `readText` / `readBytes`, in call order. */
  readonly reads: string[] = [];
  /** Every path passed to `readdir`, in call order. */
  readonly listings: string[] = [];
  readonly #inner: FakeFileSystem;
  readonly #configDirName: string;
  readonly #globalAgentDir: string;

  constructor(inner: FakeFileSystem, configDirName: string, globalAgentDir?: string) {
    this.#inner = inner;
    this.#configDirName = configDirName;
    this.#globalAgentDir = globalAgentDir ?? `${inner.homedir()}/${configDirName}/agent`;
  }

  configDirName(): string {
    return this.#configDirName;
  }

  globalAgentDir(): string {
    return this.#globalAgentDir;
  }

  readText(path: string): Promise<string> {
    this.reads.push(path);
    return this.#inner.readText(path);
  }
  readBytes(path: string): Promise<Uint8Array> {
    this.reads.push(path);
    return this.#inner.readBytes(path);
  }
  readdir(path: string): Promise<readonly string[]> {
    this.listings.push(path);
    return this.#inner.readdir(path);
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

/**
 * A fake reporting `configDirName` for the host under test, and — when
 * `globalAgentDir` is supplied — a global agent directory that does NOT sit
 * under `<homedir>/<configDirName>`.
 */
function hostFs(
  configDirName: string,
  spec: FakeSpec,
  globalAgentDir?: string,
): HostFileSystem {
  return new HostFileSystem(
    new FakeFileSystem({
      homedir: HOME,
      cwd: CWD,
      dirs: spec.dirs ?? {},
      files: spec.files ?? {},
      errors: spec.errors ?? {},
    }),
    configDirName,
    globalAgentDir,
  );
}

/** The conventional project root for a host: `<cwd>/<config-dir>/theta`. */
function projectRoot(configDir: string): string {
  return `${CWD}/${configDir}/theta`;
}

/** The conventional global root: `<homedir>/<config-dir>/agent/theta`. */
function globalRoot(configDir: string): string {
  return `${HOME}/${configDir}/agent/theta`;
}

const NO_SETTINGS: ThetaSettings = {};

function input(fs: FileSystem, extra: Partial<DiscoveryInput> = {}): DiscoveryInput {
  return { fs, settings: NO_SETTINGS, ...extra };
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

function namedPackage(
  thetas: readonly PackageDiscoveredTheta[],
  name: string,
): PackageDiscoveredTheta | undefined {
  return thetas.find((t) => t.name === name);
}

/** Paths under a `.pi` config directory (the decoy spelling) among `paths`. */
function piPaths(paths: readonly string[]): readonly string[] {
  return paths.filter((p) => p.includes("/.pi/"));
}

// ==========================================================================
// B2 — every conventional path is built from the host-location seams:
// `configDirName()` for the project-relative ones, `globalAgentDir()` for the
// global ones.
// ==========================================================================

describe("B2 — the host-location seams are the source of every conventional path", () => {
  it("1. discoverThetas takes the project root from the host config dir: `<cwd>/.omp/theta/` registers, the `.pi` decoy is never listed", async () => {
    const fs = hostFs(".omp", {
      dirs: mergeDirs(
        ancestors(projectRoot(".omp")),
        ancestors(globalRoot(".omp")),
        {
          [projectRoot(".omp")]: ["x.theta"],
          // The path a hardcoded `.pi` would reach — fully populated, so its
          // absence from the result is about the derivation, not the fixture.
          [projectRoot(".pi")]: ["decoy.theta"],
        },
      ),
      files: {
        [`${projectRoot(".omp")}/x.theta`]: THETA_BODY,
        [`${projectRoot(".pi")}/decoy.theta`]: THETA_BODY,
      },
    });

    const { thetas, diagnostics } = await discoverThetas(input(fs));

    expect(named(thetas, "x")?.path).toBe(`${projectRoot(".omp")}/x.theta`);
    expect(named(thetas, "x")?.source).toBe("project");
    expect(named(thetas, "decoy")).toBeUndefined();
    expect(piPaths(fs.listings)).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it("2. discoverThetas takes the global root from the host config dir: `<homedir>/.omp/agent/theta/` registers, the `.pi` decoy is never listed", async () => {
    const fs = hostFs(".omp", {
      dirs: mergeDirs(
        ancestors(projectRoot(".omp")),
        ancestors(globalRoot(".omp")),
        {
          [globalRoot(".omp")]: ["g.theta"],
          [globalRoot(".pi")]: ["gdecoy.theta"],
        },
      ),
      files: {
        [`${globalRoot(".omp")}/g.theta`]: THETA_BODY,
        [`${globalRoot(".pi")}/gdecoy.theta`]: THETA_BODY,
      },
    });

    const { thetas, diagnostics } = await discoverThetas(input(fs));

    expect(named(thetas, "g")?.path).toBe(`${globalRoot(".omp")}/g.theta`);
    expect(named(thetas, "g")?.source).toBe("global");
    expect(named(thetas, "gdecoy")).toBeUndefined();
    expect(piPaths(fs.listings)).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it("3. the project-source descriptor names the directory the host actually reads — `.omp/theta`, never `.pi/theta` (discovery-sources.md:61)", async () => {
    // The root EXISTS and cannot be read (EACCES), which is the Unreadable
    // column of the Project row: a warning carrying the source descriptor. An
    // operator sent to the wrong directory by that descriptor is the bug this
    // defends — the message is the only thing that locates the problem.
    const fs = hostFs(".omp", {
      dirs: mergeDirs(ancestors(projectRoot(".omp")), ancestors(globalRoot(".omp"))),
      errors: { [projectRoot(".omp")]: "EACCES" },
    });

    const { diagnostics } = await discoverThetas(input(fs));

    const unreadable = byCode(diagnostics, UNREADABLE_SOURCE);
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0]!.severity).toBe("warning");
    expect(unreadable[0]!.file).toBe(projectRoot(".omp"));
    expect(unreadable[0]!.message).toContain(".omp/theta");
    expect(unreadable[0]!.message).not.toContain(".pi/theta");
  });

  it("4. loadSettings reads both settings files from the host config dir; the `.pi` files are never read", async () => {
    // Distinct values in all four files: the merged view must be built from the
    // two `.omp` files alone. `scanPackagesMaxFiles` comes only from the global
    // `.omp` file, so it also proves the GLOBAL read was derived (a result
    // built from the project file alone would drop it).
    const fs = hostFs(".omp", {
      files: {
        [`${CWD}/.omp/settings.json`]: JSON.stringify({
          theta: { binderModel: "omp-project" },
        }),
        [`${HOME}/.omp/agent/settings.json`]: JSON.stringify({
          theta: { binderModel: "omp-global", scanPackagesMaxFiles: 7 },
        }),
        [`${CWD}/.pi/settings.json`]: JSON.stringify({
          theta: { binderModel: "pi-project", scanPackagesMaxFiles: 999 },
        }),
        [`${HOME}/.pi/agent/settings.json`]: JSON.stringify({
          theta: { binderModel: "pi-global", scanPackagesMaxFiles: 999 },
        }),
      },
    });

    const { settings, diagnostics } = await loadSettings(fs);

    expect(settings.theta?.binderModel).toBe("omp-project"); // project over global
    expect(settings.theta?.scanPackagesMaxFiles).toBe(7); // global-only key retained
    expect(fs.reads).toContain(`${CWD}/.omp/settings.json`);
    expect(fs.reads).toContain(`${HOME}/.omp/agent/settings.json`);
    expect(piPaths(fs.reads)).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it("5. thetaPathsBaseDir is derived from the same config dir — project `<cwd>/.omp`, global `<homedir>/.omp/agent`", async () => {
    // The base dir is what relative `thetaPaths` entries resolve against, so a
    // `.pi`-flavoured base dir would silently resolve every relative entry into
    // a directory the host does not own.
    const projectSupplied = hostFs(".omp", {
      files: {
        [`${CWD}/.omp/settings.json`]: JSON.stringify({ thetaPaths: ["./extra"] }),
        [`${HOME}/.omp/agent/settings.json`]: JSON.stringify({ thetaPaths: ["./global"] }),
      },
    });
    const project = await loadSettings(projectSupplied);
    expect(project.settings.thetaPathsBaseDir).toContain(".omp");
    expect(project.settings.thetaPathsBaseDir).toBe(`${CWD}/.omp`);

    // With only the global file supplying the array, the origin dir is the
    // global settings dir — still config-dir-derived.
    const globalOnly = hostFs(".omp", {
      files: {
        [`${HOME}/.omp/agent/settings.json`]: JSON.stringify({ thetaPaths: ["./global"] }),
      },
    });
    const global = await loadSettings(globalOnly);
    expect(global.settings.thetaPathsBaseDir).toContain(".omp");
    expect(global.settings.thetaPathsBaseDir).toBe(`${HOME}/.omp/agent`);
  });

  it("6. four of the five installed-package roots follow the host config dir; `node_modules` (the one that is not config-dir-relative) does not", async () => {
    const OMP_ROOTS = [
      `${CWD}/.omp/npm`,
      `${CWD}/.omp/git`,
      `${HOME}/.omp/agent/npm`,
      `${HOME}/.omp/agent/git`,
    ];
    const fs = hostFs(".omp", {
      dirs: {
        [`${CWD}/.omp/npm`]: ["pkg"],
        [`${CWD}/.omp/npm/pkg`]: ["package.json", "theta"],
        [`${CWD}/.omp/npm/pkg/theta`]: ["p.theta"],
        [`${CWD}/.omp/git`]: [],
        [`${CWD}/node_modules`]: [],
        [`${HOME}/.omp/agent/npm`]: [],
        [`${HOME}/.omp/agent/git`]: [],
        // The decoy install root: a fully-formed package a `.pi` spelling
        // would discover.
        [`${CWD}/.pi/npm`]: ["decoypkg"],
        [`${CWD}/.pi/npm/decoypkg`]: ["package.json", "theta"],
        [`${CWD}/.pi/npm/decoypkg/theta`]: ["decoy.theta"],
      },
      files: {
        [`${CWD}/.omp/npm/pkg/package.json`]: JSON.stringify({ name: "pkg" }),
        [`${CWD}/.omp/npm/pkg/theta/p.theta`]: THETA_BODY,
        [`${CWD}/.pi/npm/decoypkg/package.json`]: JSON.stringify({ name: "decoypkg" }),
        [`${CWD}/.pi/npm/decoypkg/theta/decoy.theta`]: THETA_BODY,
      },
    });

    const { thetas } = await discoverPackageThetas({ fs, clock: new FakeClock(), settings: {} });

    // Observable: the package installed under the host's own npm root is found.
    expect(namedPackage(thetas, "p")?.path).toBe(`${CWD}/.omp/npm/pkg/theta/p.theta`);
    expect(namedPackage(thetas, "decoy")).toBeUndefined();
    // And the enumeration consulted exactly the host-derived roots.
    for (const root of OMP_ROOTS) {
      expect(fs.listings).toContain(root);
    }
    expect(fs.listings).toContain(`${CWD}/node_modules`); // NOT config-dir-relative
    expect(piPaths(fs.listings)).toEqual([]);
  });

  it("7. every GLOBAL path hangs off the host's own resolved globalAgentDir(), not `<homedir>/<config-dir>/agent`: a RELOCATED global agent dir is discovered and read", async () => {
    // The cell that makes the second seam load-bearing. `globalAgentDir()` is
    // `/relocated/agent` — nothing a config-dir NAME can spell, which is the
    // real shape of `PI_CODING_AGENT_DIR=/relocated/agent` on Pi and of
    // `omp --profile x` / `PI_CONFIG_DIR` on Oh-My-Pi. Under the old
    // `<homedir>/<config-dir>/agent` synthesis the walk would look in
    // `/home/theta/.omp/agent`, find it ENOENT, and skip it SILENTLY: every
    // global theta and every global setting gone with no diagnostic. So the
    // decoy here is planted at the SYNTHESISED path and fully populated — if any
    // arm still synthesises, it registers the decoy (or reads the decoy's
    // settings) instead, and this cell fails.
    const RELOCATED = "/relocated/agent";
    const SYNTHESISED = `${HOME}/.omp/agent`;
    const fs = hostFs(
      ".omp",
      {
        dirs: mergeDirs(
          ancestors(projectRoot(".omp")),
          ancestors(`${RELOCATED}/theta`),
          {
            [`${RELOCATED}/theta`]: ["rg.theta"],
            [`${RELOCATED}/npm`]: ["gpkg"],
            [`${RELOCATED}/npm/gpkg`]: ["package.json", "theta"],
            [`${RELOCATED}/npm/gpkg/theta`]: ["gp.theta"],
            [`${RELOCATED}/git`]: [],
            [`${CWD}/node_modules`]: [],
            // The synthesised spelling, fully formed.
            [`${SYNTHESISED}/theta`]: ["gdecoy.theta"],
            [`${SYNTHESISED}/npm`]: ["decoypkg"],
            [`${SYNTHESISED}/npm/decoypkg`]: ["package.json", "theta"],
            [`${SYNTHESISED}/npm/decoypkg/theta`]: ["decoy.theta"],
          },
        ),
        files: {
          [`${RELOCATED}/theta/rg.theta`]: THETA_BODY,
          [`${RELOCATED}/npm/gpkg/package.json`]: JSON.stringify({ name: "gpkg" }),
          [`${RELOCATED}/npm/gpkg/theta/gp.theta`]: THETA_BODY,
          [`${RELOCATED}/settings.json`]: JSON.stringify({
            thetaPaths: ["./global"],
            theta: { binderModel: "relocated-global" },
          }),
          [`${SYNTHESISED}/theta/gdecoy.theta`]: THETA_BODY,
          [`${SYNTHESISED}/npm/decoypkg/package.json`]: JSON.stringify({ name: "decoypkg" }),
          [`${SYNTHESISED}/npm/decoypkg/theta/decoy.theta`]: THETA_BODY,
          [`${SYNTHESISED}/settings.json`]: JSON.stringify({
            theta: { binderModel: "synthesised-global" },
          }),
        },
      },
      RELOCATED,
    );

    // (a) the global conventional `theta/` root.
    const { thetas, diagnostics } = await discoverThetas(input(fs));
    expect(named(thetas, "rg")?.path).toBe(`${RELOCATED}/theta/rg.theta`);
    expect(named(thetas, "rg")?.source).toBe("global");
    expect(named(thetas, "gdecoy")).toBeUndefined();
    expect(diagnostics).toEqual([]);

    // (b) the global settings file, and (c) the global `thetaPathsBaseDir` arm —
    // the base dir every relative global `thetaPaths` entry resolves against.
    const { settings } = await loadSettings(fs);
    expect(settings.theta?.binderModel).toBe("relocated-global");
    expect(settings.thetaPathsBaseDir).toBe(RELOCATED);

    // (d) the two global installed-package roots.
    const packages = await discoverPackageThetas({ fs, clock: new FakeClock(), settings: {} });
    expect(namedPackage(packages.thetas, "gp")?.path).toBe(`${RELOCATED}/npm/gpkg/theta/gp.theta`);
    expect(namedPackage(packages.thetas, "decoy")).toBeUndefined();
    expect(fs.listings).toContain(`${RELOCATED}/npm`);
    expect(fs.listings).toContain(`${RELOCATED}/git`);

    // Nothing under the synthesised directory was even consulted — the stronger
    // statement, and the one a reintroduced hardcoded spelling would break.
    const synthesised = [...fs.listings, ...fs.reads].filter((p) => p.startsWith(SYNTHESISED));
    expect(synthesised).toEqual([]);
  });
});

// ==========================================================================
// A4 — an absent conventional root is silent; an unreadable one is not.
// Both host spellings, because the fix is host-agnostic: the bug was live on
// Pi (`.pi` never created) exactly as on Oh-My-Pi.
// ==========================================================================

describe("A4 — an absent conventional discovery root is silent (discovery-sources.md:47, :51-52)", () => {
  for (const configDir of [".pi", ".omp"] as const) {
    it(`8. neither conventional root exists and the ${configDir} config dir itself is absent: zero diagnostics (no unreadable-source)`, async () => {
      // The universal fresh-install shape: cwd and homedir exist, the host
      // config directory does not. Under :66 the roots' `ENOENT` has a dirty
      // ancestor chain (the config dir is itself `ENOENT`), which used to
      // classify BOTH roots as unreadable and put two warnings on every
      // session in every workspace.
      const fs = hostFs(configDir, {
        dirs: { "/": [], [CWD]: [], "/home": [], [HOME]: [] },
      });

      const { thetas, diagnostics } = await discoverThetas(input(fs));

      expect(byCode(diagnostics, UNREADABLE_SOURCE)).toEqual([]);
      expect(diagnostics).toEqual([]);
      expect(thetas).toEqual([]);
    });

    it(`9. the ${configDir} config dir exists but its theta/ root does not: still zero diagnostics (clean leaf, Missing column is silent)`, async () => {
      const fs = hostFs(configDir, {
        dirs: mergeDirs(
          ancestors(projectRoot(configDir)),
          ancestors(globalRoot(configDir)),
        ),
      });

      const { thetas, diagnostics } = await discoverThetas(input(fs));

      expect(diagnostics).toEqual([]);
      expect(thetas).toEqual([]);
    });

    it(`10. the ${configDir} project root EXISTS but rejects EACCES: the unreadable-source warning is still emitted (Unreadable column)`, async () => {
      const fs = hostFs(configDir, {
        dirs: mergeDirs(
          ancestors(projectRoot(configDir)),
          ancestors(globalRoot(configDir)),
        ),
        errors: { [projectRoot(configDir)]: "EACCES" },
      });

      const { diagnostics } = await discoverThetas(input(fs));

      const unreadable = byCode(diagnostics, UNREADABLE_SOURCE);
      expect(unreadable).toHaveLength(1);
      expect(unreadable[0]!.severity).toBe("warning");
      expect(unreadable[0]!.file).toBe(projectRoot(configDir));
      // The silence is scoped to absence: a real access failure must not be
      // downgraded to a missing (silent) source.
      expect(byCode(diagnostics, MISSING_SOURCE)).toEqual([]);
    });

    it(`11. the ${configDir} global root EXISTS but rejects EPERM: the unreadable-source warning is still emitted while the absent project root stays silent`, async () => {
      const fs = hostFs(configDir, {
        dirs: mergeDirs(
          ancestors(projectRoot(configDir)),
          ancestors(globalRoot(configDir)),
        ),
        errors: { [globalRoot(configDir)]: "EPERM" },
      });

      const { diagnostics } = await discoverThetas(input(fs));

      const unreadable = byCode(diagnostics, UNREADABLE_SOURCE);
      expect(unreadable).toHaveLength(1); // the global root only
      expect(unreadable[0]!.file).toBe(globalRoot(configDir));
      expect(unreadable[0]!.severity).toBe("warning");
    });
  }

  it("12. an explicit `--theta` path is unaffected: a clean-leaf miss is still a missing-source ERROR (discovery-sources.md:56)", async () => {
    const fs = hostFs(".omp", {
      dirs: mergeDirs(
        ancestors(projectRoot(".omp")),
        ancestors(globalRoot(".omp")),
        ancestors("/elsewhere/typo.theta"),
      ),
    });

    const { diagnostics } = await discoverThetas(
      input(fs, { cliPaths: ["/elsewhere/typo.theta"] }),
    );

    const missing = byCode(diagnostics, MISSING_SOURCE);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.severity).toBe("error");
    expect(missing[0]!.file).toBe("/elsewhere/typo.theta");
    expect(missing[0]!.message).toContain("--theta flag #1");
  });

  it("13. DISC-2's clean-leaf distinction survives for explicit references: a `--theta` path with an ABSENT intermediate directory is an unreadable-source ERROR, not silence (:66)", async () => {
    // The exact ancestor-chain shape the conventional roots are now excused
    // from. For a path the user typed it remains a signal, and at CLI severity
    // (the Unreadable column of the `--theta` row is "error").
    const fs = hostFs(".omp", {
      dirs: mergeDirs(
        ancestors(projectRoot(".omp")),
        ancestors(globalRoot(".omp")),
        { "/": [] },
      ),
    });

    const { diagnostics } = await discoverThetas(
      input(fs, { cliPaths: ["/gone/deeper/typo.theta"] }),
    );

    const unreadable = byCode(diagnostics, UNREADABLE_SOURCE);
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0]!.severity).toBe("error");
    expect(unreadable[0]!.file).toBe("/gone/deeper/typo.theta");
    expect(unreadable[0]!.message).toContain("--theta flag #1");
  });
});
