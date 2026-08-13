import { describe, expect, it } from "vitest";
import {
  discoverThetas,
  type DiscoveredTheta,
  type DiscoveryInput,
  type PiOwnedCommand,
} from "../src/discovery/discovery-walk";
import { loadSettings, type ThetaSettings } from "../src/discovery/settings";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { FakeFileSystem } from "./helpers/fake-file-system";

// V10a-T — failing tests for the paired `V10a` five-source discovery walk
// (`src/discovery/discovery-walk.ts`). The bullets trace to DISC-1…DISC-4 in
// discovery/discovery-sources.md, with diagnostic codes/messages sourced from
// the diagnostics/code-registry-load.md *Message* column, plus a cross-leaf
// integration bullet proving V10c's merged `thetaPaths` reaches the walk.
//
// These tests red because the V10a `discoverThetas` body is absent — the stub
// returns an empty theta/diagnostics result, so each assertion reds on the
// missing theta or the missing diagnostic, not on a compile error, fixture, or
// harness throw.

const HOME = "/home/theta";
const CWD = "/project";
const GLOBAL_ROOT = "/home/theta/.pi/agent/theta";
const PROJECT_ROOT = "/project/.pi/theta";

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

/** The two conventional roots' ancestor chains, registered in every fixture.
 *  An absent conventional root is skipped BEFORE classification today (DISC-2's
 *  conventional-root exemption), so the chains are not load-bearing for those
 *  roots any more; they keep each fixture's directory shape self-consistent. */
const BASE = mergeDirs(ancestors(GLOBAL_ROOT), ancestors(PROJECT_ROOT));

interface FakeSpec {
  readonly dirs?: Record<string, readonly string[]>;
  readonly files?: Record<string, string>;
  readonly errors?: Record<string, string>;
  readonly symlinks?: Record<string, string>;
  readonly caseInsensitive?: boolean;
}

function build(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: mergeDirs(BASE, spec.dirs ?? {}),
    files: spec.files ?? {},
    errors: spec.errors ?? {},
    symlinks: spec.symlinks ?? {},
    ...(spec.caseInsensitive !== undefined ? { caseInsensitive: spec.caseInsensitive } : {}),
  });
}

/** An empty merged-settings view (no settings-sourced thetaPaths). */
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

// --------------------------------------------------------------------------
// DISC-1 — home-directory expansion via the FileSystem.homedir() seam only.
// --------------------------------------------------------------------------

describe("V10a-T — DISC-1 home-directory expansion", () => {
  it("DISC-1: a bare `~/` prefix expands via the FileSystem.homedir() seam", async () => {
    // Settings entry `~/extra` must resolve under homedir() = /home/theta.
    const fs = build({
      dirs: { ...ancestors("/home/theta/extra"), "/home/theta/extra": ["foo.theta"] },
      files: { "/home/theta/extra/foo.theta": "mode: prompt\n---\n" },
    });
    const { thetas } = await discoverThetas(
      input(fs, { settings: { thetaPaths: ["~/extra"] } }),
    );
    const foo = named(thetas, "foo");
    expect(foo).toBeDefined();
    // Pins the expansion source: the path is the homedir()-joined absolute path.
    expect(foo?.path).toBe("/home/theta/extra/foo.theta");
  });

  it("DISC-1: the `~user` form is not honoured (no env/platform branch) — it is taken literally", async () => {
    // `~bob/extra` is NOT user-bob's home: it is a literal path. The would-be
    // wrong expansion to <homedir>/bob/extra must NOT contribute.
    const fs = build({
      dirs: {
        ...ancestors("~bob/extra"),
        "~bob/extra": ["lit.theta"],
        ...ancestors("/home/theta/bob/extra"),
        "/home/theta/bob/extra": ["wrong.theta"],
      },
      files: {
        "~bob/extra/lit.theta": "mode: prompt\n---\n",
        "/home/theta/bob/extra/wrong.theta": "mode: prompt\n---\n",
      },
    });
    const { thetas } = await discoverThetas(
      input(fs, { settings: { thetaPaths: ["~bob/extra"] } }),
    );
    // Taken literally: the literal-path theta is found, the ~user-expanded one is not.
    expect(named(thetas, "lit")).toBeDefined();
    expect(named(thetas, "wrong")).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// DISC-2 — per-source missing / unreadable / wrong-type modes + the
// clean-leaf-ENOENT ancestor walk.
// --------------------------------------------------------------------------

describe("V10a-T — DISC-2 failure modes", () => {
  it("DISC-2: a missing conventional root is silent, a missing settings entry is an error", async () => {
    // Global + project roots absent (clean leaves, silent); one settings entry
    // names a missing path (explicit → error).
    const fs = build({ dirs: { ...ancestors("/abs/missing") } });
    const { diagnostics } = await discoverThetas(
      input(fs, { settings: { thetaPaths: ["/abs/missing"] } }),
    );
    const missing = byCode(diagnostics, "theta/load/missing-source");
    expect(missing).toHaveLength(1); // only the explicit settings entry
    expect(missing[0]!.severity).toBe("error");
    expect(missing[0]!.message).toContain("settings"); // descriptor names the source
  });

  it("DISC-2: a missing CLI `--theta` path is an error", async () => {
    const fs = build({ dirs: { ...ancestors("/cli/missing") } });
    const { diagnostics } = await discoverThetas(
      input(fs, { cliPaths: ["/cli/missing"] }),
    );
    const missing = byCode(diagnostics, "theta/load/missing-source");
    expect(missing).toHaveLength(1);
    expect(missing[0]!.severity).toBe("error"); // explicit user intent
  });

  it("DISC-2: an unreadable conventional root is a warning, an unreadable CLI path is an error", async () => {
    // Global root exists but enumeration is denied (EACCES); a CLI path is
    // likewise denied. Conventional → warning, CLI → error (severity asymmetry).
    const fs = build({
      dirs: { [GLOBAL_ROOT]: [], "/cli/denied": [] },
      errors: { [GLOBAL_ROOT]: "EACCES", "/cli/denied": "EACCES" },
    });
    const { diagnostics } = await discoverThetas(
      input(fs, { cliPaths: ["/cli/denied"] }),
    );
    const unreadable = byCode(diagnostics, "theta/load/unreadable-source");
    expect(unreadable).toHaveLength(2);
    const bySeverity = (s: string) => unreadable.filter((d) => d.severity === s).length;
    expect(bySeverity("warning")).toBe(1); // conventional global root
    expect(bySeverity("error")).toBe(1); // CLI flag
  });

  it("DISC-2: a conventional root that resolves to a regular file (wrong type) is a warning", async () => {
    // Global root path is a file, not a directory → wrong-type, severity warning.
    const fs = build({ files: { [GLOBAL_ROOT]: "not a directory" } });
    const { diagnostics } = await discoverThetas(input(fs));
    const wrongType = byCode(diagnostics, "theta/load/wrong-type-source");
    expect(wrongType).toHaveLength(1);
    expect(wrongType[0]!.severity).toBe("warning");
  });

  it("DISC-2: the clean-leaf-ENOENT ancestor walk separates missing (all ancestors ok) from unreadable (an ancestor denies entry)", async () => {
    // Settings entry [0]: candidate ENOENT, every ancestor lstats ok → missing (error).
    // Settings entry [1]: an ancestor lstats EACCES → unreadable (warning).
    const fs = build({
      dirs: { ...ancestors("/clean/leaf/theta"), ...ancestors("/blocked/leaf/theta") },
      errors: { "/blocked/leaf": "EACCES" },
    });
    const { diagnostics } = await discoverThetas(
      input(fs, { settings: { thetaPaths: ["/clean/leaf/theta", "/blocked/leaf/theta"] } }),
    );
    expect(byCode(diagnostics, "theta/load/missing-source")).toHaveLength(1); // clean leaf
    const unreadable = byCode(diagnostics, "theta/load/unreadable-source");
    expect(unreadable).toHaveLength(1); // blocked ancestor
    expect(unreadable[0]!.severity).toBe("warning"); // settings source
  });

  it("DISC-2: a discovered `.theta` file that is itself unreadable warns and is skipped; siblings still register", async () => {
    const fs = build({
      dirs: { [PROJECT_ROOT]: ["good.theta", "bad.theta"] },
      files: { [`${PROJECT_ROOT}/good.theta`]: "mode: prompt\n---\n" },
      errors: { [`${PROJECT_ROOT}/bad.theta`]: "EACCES" },
    });
    const { thetas, diagnostics } = await discoverThetas(input(fs));
    const unreadable = byCode(diagnostics, "theta/load/unreadable");
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0]!.severity).toBe("warning");
    expect(named(thetas, "good")).toBeDefined(); // scan continues past the bad file
    expect(named(thetas, "bad")).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// DISC-3 — case collisions, non-canonical extension case, slash-name validity.
// --------------------------------------------------------------------------

describe("V10a-T — DISC-3 collisions and validity", () => {
  it("DISC-3: two case-variant `*.theta` entries in one source fire theta/load/case-collision (warning)", async () => {
    // Case-sensitive filesystem: `plan.theta` and `Plan.theta` coexist as distinct
    // entries and collide case-insensitively per source.
    const fs = build({
      caseInsensitive: false,
      dirs: { [PROJECT_ROOT]: ["plan.theta", "Plan.theta"] },
      files: {
        [`${PROJECT_ROOT}/plan.theta`]: "mode: prompt\n---\n",
        [`${PROJECT_ROOT}/Plan.theta`]: "mode: prompt\n---\n",
      },
    });
    const { diagnostics } = await discoverThetas(input(fs));
    const hits = byCode(diagnostics, "theta/load/case-collision");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("warning");
    // Both colliding paths are named in the rendered message.
    expect(hits[0]!.message).toContain("plan.theta");
    expect(hits[0]!.message).toContain("Plan.theta");
  });

  it("DISC-3: a valid stem with a non-canonical extension case fires theta/load/non-canonical-extension (warning); invalid-stem files stay silent", async () => {
    const fs = build({
      caseInsensitive: false,
      dirs: { [PROJECT_ROOT]: ["helper.THETA", "notes.txt.THETA", "Foo.THETA"] },
      files: {
        [`${PROJECT_ROOT}/helper.THETA`]: "x",
        [`${PROJECT_ROOT}/notes.txt.THETA`]: "x",
        [`${PROJECT_ROOT}/Foo.THETA`]: "x",
      },
    });
    const { diagnostics } = await discoverThetas(input(fs));
    const hits = byCode(diagnostics, "theta/load/non-canonical-extension");
    // Only `helper.THETA` (valid stem, case-variant ext) warns; `notes.txt.THETA`
    // and `Foo.THETA` have invalid stems and stay silent.
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("warning");
    expect(hits[0]!.message).toContain("helper.THETA");
  });

  it("DISC-3: a `.theta` stem failing `^[a-z0-9][a-z0-9_-]*$` fires theta/load/invalid-slash-name (error) and does not register", async () => {
    const fs = build({
      dirs: { [PROJECT_ROOT]: ["Foo.theta", "valid.theta"] },
      files: {
        [`${PROJECT_ROOT}/Foo.theta`]: "mode: prompt\n---\n",
        [`${PROJECT_ROOT}/valid.theta`]: "mode: prompt\n---\n",
      },
    });
    const { thetas, diagnostics } = await discoverThetas(input(fs));
    const hits = byCode(diagnostics, "theta/load/invalid-slash-name");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("error");
    expect(named(thetas, "Foo")).toBeUndefined(); // rejected before registration
    expect(named(thetas, "valid")).toBeDefined(); // the valid sibling still registers
  });
});

// --------------------------------------------------------------------------
// DISC-4 — slash-name collision on the final derived name; the theta always
// loses asymmetrically.
// --------------------------------------------------------------------------

describe("V10a-T — DISC-4 cross-format collision", () => {
  it("DISC-4: two same-priority thetas deriving one slash name fire theta/load/cross-format-collision (error); none register", async () => {
    // Two settings directory entries (same priority) each ship `dup.theta`.
    const fs = build({
      dirs: {
        ...ancestors("/a/theta"),
        "/a/theta": ["dup.theta"],
        ...ancestors("/b/theta"),
        "/b/theta": ["dup.theta"],
      },
      files: {
        "/a/theta/dup.theta": "mode: prompt\n---\n",
        "/b/theta/dup.theta": "mode: prompt\n---\n",
      },
    });
    const { thetas, diagnostics } = await discoverThetas(
      input(fs, { settings: { thetaPaths: ["/a/theta", "/b/theta"] } }),
    );
    const hits = byCode(diagnostics, "theta/load/cross-format-collision");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("error");
    expect(named(thetas, "dup")).toBeUndefined(); // every colliding theta drops
  });

  it("DISC-4: a theta colliding with a Pi-owned command fires theta/load/cross-format-collision (error); the theta loses, the Pi-owned entry survives", async () => {
    const fs = build({
      dirs: { [PROJECT_ROOT]: ["code-review.theta"] },
      files: { [`${PROJECT_ROOT}/code-review.theta`]: "mode: prompt\n---\n" },
    });
    const piOwned: readonly PiOwnedCommand[] = [{ name: "code-review", source: "prompt" }];
    const { thetas, diagnostics } = await discoverThetas(
      input(fs, { piOwnedNames: piOwned }),
    );
    const hits = byCode(diagnostics, "theta/load/cross-format-collision");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("error");
    // Asymmetric loss: the theta drops; the Pi-owned `code-review` is untouched.
    expect(named(thetas, "code-review")).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// Settings source (cross-leaf integration; no spec REQ-ID): the merged
// `thetaPaths` value from V10c reaches the discovery walk.
// --------------------------------------------------------------------------

describe("V10a-T — Settings discovery source plumbing", () => {
  it("a thetaPaths entry supplied through V10c's merged settings contributes its .theta file via the Settings source", async () => {
    const fs = build({
      dirs: { ...ancestors("/extra/theta"), "/extra/theta": ["settings-theta.theta"] },
      files: {
        // Project settings.json names an extra theta directory.
        "/project/.pi/settings.json": JSON.stringify({ thetaPaths: ["/extra/theta"] }),
        "/extra/theta/settings-theta.theta": "mode: prompt\n---\n",
      },
    });
    // The merged settings value is produced by V10c and threaded into the walk.
    const { settings } = await loadSettings(fs);
    expect(settings.thetaPaths).toEqual(["/extra/theta"]); // V10c plumbing precondition
    const { thetas } = await discoverThetas(input(fs, { settings }));
    const discovered = named(thetas, "settings-theta");
    expect(discovered).toBeDefined();
    expect(discovered?.source).toBe("settings"); // reached the walk via the Settings source
  });
});
