import { describe, expect, it } from "vitest";
import {
  discoverLooms,
  type DiscoveredLoom,
  type DiscoveryInput,
  type PiOwnedCommand,
} from "../src/discovery/discovery-walk";
import { loadSettings, type LoomSettings } from "../src/discovery/settings";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { FakeFileSystem } from "./helpers/fake-file-system";

// V10a-T — failing tests for the paired `V10a` five-source discovery walk
// (`src/discovery/discovery-walk.ts`). The bullets trace to DISC-1…DISC-4 in
// discovery/discovery-sources.md, with diagnostic codes/messages sourced from
// the diagnostics/code-registry-load.md *Message* column, plus a cross-leaf
// integration bullet proving V10c's merged `loomPaths` reaches the walk.
//
// These tests red because the V10a `discoverLooms` body is absent — the stub
// returns an empty looms/diagnostics result, so each assertion reds on the
// missing loom or the missing diagnostic, not on a compile error, fixture, or
// harness throw.

const HOME = "/home/loom";
const CWD = "/project";
const GLOBAL_ROOT = "/home/loom/.pi/agent/looms";
const PROJECT_ROOT = "/project/.pi/looms";

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

/** The two conventional roots' ancestor chains — registered in every fixture so
 *  an absent conventional root classifies as a clean (silent) missing rather
 *  than as an unreadable ancestor failure. */
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

/** An empty merged-settings view (no settings-sourced loomPaths). */
const NO_SETTINGS: LoomSettings = {};

function input(fs: FakeFileSystem, extra: Partial<DiscoveryInput> = {}): DiscoveryInput {
  return { fs, settings: NO_SETTINGS, ...extra };
}

function byCode(diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

function named(looms: readonly DiscoveredLoom[], name: string): DiscoveredLoom | undefined {
  return looms.find((l) => l.name === name);
}

// --------------------------------------------------------------------------
// DISC-1 — home-directory expansion via the FileSystem.homedir() seam only.
// --------------------------------------------------------------------------

describe("V10a-T — DISC-1 home-directory expansion", () => {
  it("DISC-1: a bare `~/` prefix expands via the FileSystem.homedir() seam", async () => {
    // Settings entry `~/extra` must resolve under homedir() = /home/loom.
    const fs = build({
      dirs: { ...ancestors("/home/loom/extra"), "/home/loom/extra": ["foo.loom"] },
      files: { "/home/loom/extra/foo.loom": "mode: prompt\n---\n" },
    });
    const { looms } = await discoverLooms(
      input(fs, { settings: { loomPaths: ["~/extra"] } }),
    );
    const foo = named(looms, "foo");
    expect(foo).toBeDefined();
    // Pins the expansion source: the path is the homedir()-joined absolute path.
    expect(foo?.path).toBe("/home/loom/extra/foo.loom");
  });

  it("DISC-1: the `~user` form is not honoured (no env/platform branch) — it is taken literally", async () => {
    // `~bob/extra` is NOT user-bob's home: it is a literal path. The would-be
    // wrong expansion to <homedir>/bob/extra must NOT contribute.
    const fs = build({
      dirs: {
        ...ancestors("~bob/extra"),
        "~bob/extra": ["lit.loom"],
        ...ancestors("/home/loom/bob/extra"),
        "/home/loom/bob/extra": ["wrong.loom"],
      },
      files: {
        "~bob/extra/lit.loom": "mode: prompt\n---\n",
        "/home/loom/bob/extra/wrong.loom": "mode: prompt\n---\n",
      },
    });
    const { looms } = await discoverLooms(
      input(fs, { settings: { loomPaths: ["~bob/extra"] } }),
    );
    // Taken literally: the literal-path loom is found, the ~user-expanded one is not.
    expect(named(looms, "lit")).toBeDefined();
    expect(named(looms, "wrong")).toBeUndefined();
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
    const { diagnostics } = await discoverLooms(
      input(fs, { settings: { loomPaths: ["/abs/missing"] } }),
    );
    const missing = byCode(diagnostics, "loom/load/missing-source");
    expect(missing).toHaveLength(1); // only the explicit settings entry
    expect(missing[0]!.severity).toBe("error");
    expect(missing[0]!.message).toContain("settings"); // descriptor names the source
  });

  it("DISC-2: a missing CLI `--loom` path is an error", async () => {
    const fs = build({ dirs: { ...ancestors("/cli/missing") } });
    const { diagnostics } = await discoverLooms(
      input(fs, { cliPaths: ["/cli/missing"] }),
    );
    const missing = byCode(diagnostics, "loom/load/missing-source");
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
    const { diagnostics } = await discoverLooms(
      input(fs, { cliPaths: ["/cli/denied"] }),
    );
    const unreadable = byCode(diagnostics, "loom/load/unreadable-source");
    expect(unreadable).toHaveLength(2);
    const bySeverity = (s: string) => unreadable.filter((d) => d.severity === s).length;
    expect(bySeverity("warning")).toBe(1); // conventional global root
    expect(bySeverity("error")).toBe(1); // CLI flag
  });

  it("DISC-2: a conventional root that resolves to a regular file (wrong type) is a warning", async () => {
    // Global root path is a file, not a directory → wrong-type, severity warning.
    const fs = build({ files: { [GLOBAL_ROOT]: "not a directory" } });
    const { diagnostics } = await discoverLooms(input(fs));
    const wrongType = byCode(diagnostics, "loom/load/wrong-type-source");
    expect(wrongType).toHaveLength(1);
    expect(wrongType[0]!.severity).toBe("warning");
  });

  it("DISC-2: the clean-leaf-ENOENT ancestor walk separates missing (all ancestors ok) from unreadable (an ancestor denies entry)", async () => {
    // Settings entry [0]: candidate ENOENT, every ancestor lstats ok → missing (error).
    // Settings entry [1]: an ancestor lstats EACCES → unreadable (warning).
    const fs = build({
      dirs: { ...ancestors("/clean/leaf/looms"), ...ancestors("/blocked/leaf/looms") },
      errors: { "/blocked/leaf": "EACCES" },
    });
    const { diagnostics } = await discoverLooms(
      input(fs, { settings: { loomPaths: ["/clean/leaf/looms", "/blocked/leaf/looms"] } }),
    );
    expect(byCode(diagnostics, "loom/load/missing-source")).toHaveLength(1); // clean leaf
    const unreadable = byCode(diagnostics, "loom/load/unreadable-source");
    expect(unreadable).toHaveLength(1); // blocked ancestor
    expect(unreadable[0]!.severity).toBe("warning"); // settings source
  });

  it("DISC-2: a discovered `.loom` file that is itself unreadable warns and is skipped; siblings still register", async () => {
    const fs = build({
      dirs: { [PROJECT_ROOT]: ["good.loom", "bad.loom"] },
      files: { [`${PROJECT_ROOT}/good.loom`]: "mode: prompt\n---\n" },
      errors: { [`${PROJECT_ROOT}/bad.loom`]: "EACCES" },
    });
    const { looms, diagnostics } = await discoverLooms(input(fs));
    const unreadable = byCode(diagnostics, "loom/load/unreadable");
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0]!.severity).toBe("warning");
    expect(named(looms, "good")).toBeDefined(); // scan continues past the bad file
    expect(named(looms, "bad")).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// DISC-3 — case collisions, non-canonical extension case, slash-name validity.
// --------------------------------------------------------------------------

describe("V10a-T — DISC-3 collisions and validity", () => {
  it("DISC-3: two case-variant `*.loom` entries in one source fire loom/load/case-collision (warning)", async () => {
    // Case-sensitive filesystem: `plan.loom` and `Plan.loom` coexist as distinct
    // entries and collide case-insensitively per source.
    const fs = build({
      caseInsensitive: false,
      dirs: { [PROJECT_ROOT]: ["plan.loom", "Plan.loom"] },
      files: {
        [`${PROJECT_ROOT}/plan.loom`]: "mode: prompt\n---\n",
        [`${PROJECT_ROOT}/Plan.loom`]: "mode: prompt\n---\n",
      },
    });
    const { diagnostics } = await discoverLooms(input(fs));
    const hits = byCode(diagnostics, "loom/load/case-collision");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("warning");
    // Both colliding paths are named in the rendered message.
    expect(hits[0]!.message).toContain("plan.loom");
    expect(hits[0]!.message).toContain("Plan.loom");
  });

  it("DISC-3: a valid stem with a non-canonical extension case fires loom/load/non-canonical-extension (warning); invalid-stem files stay silent", async () => {
    const fs = build({
      caseInsensitive: false,
      dirs: { [PROJECT_ROOT]: ["helper.LOOM", "notes.txt.LOOM", "Foo.LOOM"] },
      files: {
        [`${PROJECT_ROOT}/helper.LOOM`]: "x",
        [`${PROJECT_ROOT}/notes.txt.LOOM`]: "x",
        [`${PROJECT_ROOT}/Foo.LOOM`]: "x",
      },
    });
    const { diagnostics } = await discoverLooms(input(fs));
    const hits = byCode(diagnostics, "loom/load/non-canonical-extension");
    // Only `helper.LOOM` (valid stem, case-variant ext) warns; `notes.txt.LOOM`
    // and `Foo.LOOM` have invalid stems and stay silent.
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("warning");
    expect(hits[0]!.message).toContain("helper.LOOM");
  });

  it("DISC-3: a `.loom` stem failing `^[a-z0-9][a-z0-9_-]*$` fires loom/load/invalid-slash-name (error) and does not register", async () => {
    const fs = build({
      dirs: { [PROJECT_ROOT]: ["Foo.loom", "valid.loom"] },
      files: {
        [`${PROJECT_ROOT}/Foo.loom`]: "mode: prompt\n---\n",
        [`${PROJECT_ROOT}/valid.loom`]: "mode: prompt\n---\n",
      },
    });
    const { looms, diagnostics } = await discoverLooms(input(fs));
    const hits = byCode(diagnostics, "loom/load/invalid-slash-name");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("error");
    expect(named(looms, "Foo")).toBeUndefined(); // rejected before registration
    expect(named(looms, "valid")).toBeDefined(); // the valid sibling still registers
  });
});

// --------------------------------------------------------------------------
// DISC-4 — slash-name collision on the final derived name; the loom always
// loses asymmetrically.
// --------------------------------------------------------------------------

describe("V10a-T — DISC-4 cross-format collision", () => {
  it("DISC-4: two same-priority looms deriving one slash name fire loom/load/cross-format-collision (error); none register", async () => {
    // Two settings directory entries (same priority) each ship `dup.loom`.
    const fs = build({
      dirs: {
        ...ancestors("/a/looms"),
        "/a/looms": ["dup.loom"],
        ...ancestors("/b/looms"),
        "/b/looms": ["dup.loom"],
      },
      files: {
        "/a/looms/dup.loom": "mode: prompt\n---\n",
        "/b/looms/dup.loom": "mode: prompt\n---\n",
      },
    });
    const { looms, diagnostics } = await discoverLooms(
      input(fs, { settings: { loomPaths: ["/a/looms", "/b/looms"] } }),
    );
    const hits = byCode(diagnostics, "loom/load/cross-format-collision");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("error");
    expect(named(looms, "dup")).toBeUndefined(); // every colliding loom drops
  });

  it("DISC-4: a loom colliding with a Pi-owned command fires loom/load/cross-format-collision (error); the loom loses, the Pi-owned entry survives", async () => {
    const fs = build({
      dirs: { [PROJECT_ROOT]: ["code-review.loom"] },
      files: { [`${PROJECT_ROOT}/code-review.loom`]: "mode: prompt\n---\n" },
    });
    const piOwned: readonly PiOwnedCommand[] = [{ name: "code-review", source: "prompt" }];
    const { looms, diagnostics } = await discoverLooms(
      input(fs, { piOwnedNames: piOwned }),
    );
    const hits = byCode(diagnostics, "loom/load/cross-format-collision");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("error");
    // Asymmetric loss: the loom drops; the Pi-owned `code-review` is untouched.
    expect(named(looms, "code-review")).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// Settings source (cross-leaf integration; no spec REQ-ID): the merged
// `loomPaths` value from V10c reaches the discovery walk.
// --------------------------------------------------------------------------

describe("V10a-T — Settings discovery source plumbing", () => {
  it("a loomPaths entry supplied through V10c's merged settings contributes its .loom file via the Settings source", async () => {
    const fs = build({
      dirs: { ...ancestors("/extra/looms"), "/extra/looms": ["settings-loom.loom"] },
      files: {
        // Project settings.json names an extra loom directory.
        "/project/.pi/settings.json": JSON.stringify({ loomPaths: ["/extra/looms"] }),
        "/extra/looms/settings-loom.loom": "mode: prompt\n---\n",
      },
    });
    // The merged settings value is produced by V10c and threaded into the walk.
    const { settings } = await loadSettings(fs);
    expect(settings.loomPaths).toEqual(["/extra/looms"]); // V10c plumbing precondition
    const { looms } = await discoverLooms(input(fs, { settings }));
    const discovered = named(looms, "settings-loom");
    expect(discovered).toBeDefined();
    expect(discovered?.source).toBe("settings"); // reached the walk via the Settings source
  });
});
