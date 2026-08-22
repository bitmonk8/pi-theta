import { delimiter as PATH_DELIMITER } from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverThetas,
  type DiscoveredTheta,
  type DiscoveryInput,
} from "../src/discovery/discovery-walk";
import { loadSettings, type ThetaSettings } from "../src/discovery/settings";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { FakeFileSystem } from "./helpers/fake-file-system";

// e2e-s5 — offline-unit (METHOD M1) coverage for three uncovered DISC
// requirements, driven through the production discovery entry `discoverThetas`
// (src/discovery/discovery-walk.ts) and the settings parse/merge entry
// `loadSettings` (src/discovery/settings.ts), backed by the FakeFileSystem
// seam. Fixture idioms mirror tests/discovery-walk.test.ts and
// tests/settings-merge.test.ts exactly.
//
//   REQ-DISC-5  (spec-requirements.md:892) — the `--theta` flag joins multiple
//               paths with `path.delimiter`; each component is a file or a
//               directory resolved by the `thetaPaths` rules.
//   REQ-DISC-33 (spec-requirements.md:920) — theta 1.0 reads five settings keys;
//               unknown `thetas.*` keys are ignored WITHOUT a diagnostic.
//   REQ-DISC-14 (spec-requirements.md:901) — a directory entry is a valid path
//               regardless of contents (empty / only-non-.theta → zero thetas, no
//               diagnostic); the wrong-type rule fires only for a
//               non-.theta-file, non-directory target.

const HOME = "/home/theta";
const CWD = "/project";
const GLOBAL_ROOT = "/home/theta/.pi/agent/theta";
const PROJECT_ROOT = "/project/.pi/theta";
const PROJECT_SETTINGS = "/project/.pi/settings.json";
const GLOBAL_SETTINGS = "/home/theta/.pi/agent/settings.json";

/** Proper-ancestor directories of `leaf` (so a clean-leaf ENOENT lstats every
 *  ancestor as an enterable directory). The leaf itself is NOT registered. */
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

/** Both conventional roots' ancestor chains — registered in every fixture so an
 *  absent conventional root classifies as a clean (silent) missing. */
const BASE = mergeDirs(ancestors(GLOBAL_ROOT), ancestors(PROJECT_ROOT));

interface FakeSpec {
  readonly dirs?: Record<string, readonly string[]>;
  readonly files?: Record<string, string>;
  readonly errors?: Record<string, string>;
  readonly symlinks?: Record<string, string>;
  readonly others?: readonly string[];
}

function build(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: mergeDirs(BASE, spec.dirs ?? {}),
    files: spec.files ?? {},
    errors: spec.errors ?? {},
    symlinks: spec.symlinks ?? {},
    others: spec.others ?? [],
  });
}

const NO_SETTINGS: ThetaSettings = {};

function input(fs: FakeFileSystem, extra: Partial<DiscoveryInput> = {}): DiscoveryInput {
  return { fs, settings: NO_SETTINGS, ...extra };
}

function byCode(diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

function named(thetas: readonly DiscoveredTheta[], name: string): DiscoveredTheta | undefined {
  return thetas.find((l) => l.name === name);
}

const THETA = "mode: prompt\n---\n";

// ==========================================================================
// REQ-DISC-5 — `--theta` joins paths with `path.delimiter`; each component is a
// file or directory resolved by the `thetaPaths` rules.
//
// The delimiter split itself is performed by the extension factory
// (`readThetaFlagPaths`, private, requires the Pi `ExtensionAPI` seam) BEFORE
// calling `discoverThetas`, whose `cliPaths` is the already-split vector. The
// offline entry therefore reaches the "each component is a file or directory
// resolved by the thetaPaths rules" half directly; the test mirrors the factory
// contract by joining on `path.delimiter` and splitting the same way.
// ==========================================================================

describe("REQ-DISC-5 — --theta multi-path components", () => {
  it("REQ-DISC-5: each path.delimiter-joined --theta component resolves — a file contributes itself, a directory enumerates its .theta children", async () => {
    const fs = build({
      dirs: {
        ...ancestors("/cli/dir"),
        "/cli/dir": ["alpha.theta"],
      },
      files: {
        "/cli/dir/alpha.theta": THETA,
        "/cli/beta.theta": THETA,
      },
    });

    // Mirror the factory's `--theta A;B` → path.delimiter split.
    const rawFlag = ["/cli/beta.theta", "/cli/dir"].join(PATH_DELIMITER);
    const cliPaths = rawFlag.split(PATH_DELIMITER);
    expect(cliPaths).toEqual(["/cli/beta.theta", "/cli/dir"]); // delimiter round-trip

    const { thetas, diagnostics } = await discoverThetas(input(fs, { cliPaths }));

    // File component contributes itself directly.
    const beta = named(thetas, "beta");
    expect(beta).toBeDefined();
    expect(beta?.source).toBe("cli");
    expect(beta?.path).toBe("/cli/beta.theta");

    // Directory component enumerates its non-recursive `*.theta` children.
    const alpha = named(thetas, "alpha");
    expect(alpha).toBeDefined();
    expect(alpha?.source).toBe("cli");
    expect(alpha?.path).toBe("/cli/dir/alpha.theta");

    // Both components resolved cleanly — no failure diagnostics.
    expect(diagnostics).toHaveLength(0);
  });
});

// ==========================================================================
// REQ-DISC-33 — five recognised settings keys; unknown `thetas.*` ignored
// without diagnostic.
// ==========================================================================

describe("REQ-DISC-33 — recognised settings keys and unknown-key silence", () => {
  it("REQ-DISC-33: the five recognised keys are read and unknown `thetas.*` keys are ignored WITHOUT any diagnostic", async () => {
    const projectSettings = JSON.stringify({
      thetaPaths: ["a.theta"],
      theta: {
        binderModel: "some-model",
        scanPackages: false,
        scanPackagesMaxFiles: 500,
        scanPackagesTimeoutMs: 750,
        // Unknown forward-compat keys — must be dropped silently.
        futureKnob: "ignored",
        anotherUnknown: 123,
      },
    });
    const fs = new FakeFileSystem({
      homedir: HOME,
      cwd: CWD,
      files: {
        [PROJECT_SETTINGS]: projectSettings,
        [GLOBAL_SETTINGS]: "{}",
      },
    });

    const { settings, diagnostics } = await loadSettings(fs);

    // Key 1: top-level `thetaPaths`.
    expect(settings.thetaPaths).toEqual(["a.theta"]);
    // Keys 2-5: the four `thetas.*` scalars.
    expect(settings.theta?.binderModel).toBe("some-model");
    expect(settings.theta?.scanPackages).toBe(false);
    expect(settings.theta?.scanPackagesMaxFiles).toBe(500);
    expect(settings.theta?.scanPackagesTimeoutMs).toBe(750);

    // Unknown `thetas.*` keys are ignored — absent from the cleaned view.
    const thetas = settings.theta as Record<string, unknown> | undefined;
    expect(thetas?.["futureKnob"]).toBeUndefined();
    expect(thetas?.["anotherUnknown"]).toBeUndefined();

    // ...and produce NO diagnostic of any kind.
    expect(byCode(diagnostics, "theta/load/settings-value-out-of-range")).toHaveLength(0);
    expect(byCode(diagnostics, "theta/load/settings-invalid-entry")).toHaveLength(0);
    expect(diagnostics).toHaveLength(0);
  });
});

// ==========================================================================
// REQ-DISC-14 — a directory entry is a valid path regardless of contents; the
// wrong-type rule fires only for a non-.theta-file, non-directory target.
// ==========================================================================

describe("REQ-DISC-14 — directory validity regardless of contents", () => {
  it("REQ-DISC-14: an empty --theta directory enumerates zero thetas and emits NO diagnostic", async () => {
    const fs = build({
      dirs: {
        ...ancestors("/cli/empty"),
        "/cli/empty": [],
      },
    });
    const { thetas, diagnostics } = await discoverThetas(input(fs, { cliPaths: ["/cli/empty"] }));
    expect(thetas).toHaveLength(0);
    expect(diagnostics).toHaveLength(0);
    expect(byCode(diagnostics, "theta/load/wrong-type-source")).toHaveLength(0);
  });

  it("REQ-DISC-14: a --theta directory holding only non-.theta files enumerates zero thetas and emits NO diagnostic", async () => {
    const fs = build({
      dirs: {
        ...ancestors("/cli/plain"),
        "/cli/plain": ["notes.txt", "readme.md"],
      },
      files: {
        "/cli/plain/notes.txt": "not a theta",
        "/cli/plain/readme.md": "# readme",
      },
    });
    const { thetas, diagnostics } = await discoverThetas(input(fs, { cliPaths: ["/cli/plain"] }));
    expect(thetas).toHaveLength(0);
    expect(diagnostics).toHaveLength(0);
    expect(byCode(diagnostics, "theta/load/wrong-type-source")).toHaveLength(0);
  });

  it("REQ-DISC-14: a settings directory entry holding only non-.theta files enumerates zero thetas and emits NO diagnostic", async () => {
    const fs = build({
      dirs: {
        ...ancestors("/settings/dir"),
        "/settings/dir": ["data.json"],
      },
      files: {
        "/settings/dir/data.json": "{}",
      },
    });
    const { thetas, diagnostics } = await discoverThetas(
      input(fs, { settings: { thetaPaths: ["/settings/dir"] } }),
    );
    expect(thetas).toHaveLength(0);
    expect(diagnostics).toHaveLength(0);
  });

  // `REQ-DISC-14` has no anchor under docs/, so the class of a DANGLING link
  // is derived from the DISC-2 failure-modes table (that table, not the test
  // id, is authoritative): docs/spec_topics/discovery/discovery-sources.md:51,
  // rows :53-58, mirrored docs/reference/discovery-cli.md:46-53. The link's
  // target does not exist, so nothing here *resolves to* something that is
  // "neither a regular `.theta` file nor a directory" (:70) — the candidate is
  // an `ENOENT` on a clean ancestor chain (:68), and the CLI row's *Missing
  // path* cell is `error`.
  it("REQ-DISC-14: a DANGLING symlink --theta target is a missing-source error, not wrong-type", async () => {
    const fs = build({
      dirs: { ...ancestors("/cli/link") },
      symlinks: { "/cli/link": "/somewhere/else" },
    });
    const { thetas, diagnostics } = await discoverThetas(input(fs, { cliPaths: ["/cli/link"] }));
    expect(byCode(diagnostics, "theta/load/wrong-type-source")).toHaveLength(0);
    const missing = byCode(diagnostics, "theta/load/missing-source");
    expect(missing).toHaveLength(1);
    expect(missing[0]!.severity).toBe("error"); // CLI source: missing is fatal
    expect(missing[0]!.file).toBe("/cli/link");
    expect(thetas).toHaveLength(0);
  });

  it("REQ-DISC-14: the wrong-type rule fires only for a non-.theta-file, non-directory target (a fifo --theta target)", async () => {
    // A non-regular, non-directory entry: it exists and resolution leads to the
    // same entry, which is what the third column's title (:51) admits.
    const fs = build({
      dirs: { ...ancestors("/cli/fifo") },
      others: ["/cli/fifo"],
    });
    const { thetas, diagnostics } = await discoverThetas(input(fs, { cliPaths: ["/cli/fifo"] }));
    const wrongType = byCode(diagnostics, "theta/load/wrong-type-source");
    expect(wrongType).toHaveLength(1);
    expect(wrongType[0]!.severity).toBe("error"); // CLI source: wrong-type is fatal
    expect(thetas).toHaveLength(0);
  });
});
