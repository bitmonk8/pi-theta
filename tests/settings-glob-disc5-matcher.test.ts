import { describe, expect, it } from "vitest";
import {
  discoverThetas,
  type DiscoveredTheta,
  type DiscoveryInput,
} from "../src/discovery/discovery-walk";
import {
  discoverPackageThetas,
  type PackageDiscoveredTheta,
  type PackageDiscoveryInput,
} from "../src/discovery/package-discovery";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { FileSystem } from "../src/seams/file-system";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileSystem } from "./helpers/fake-file-system";

// Bug 0077 — the settings `thetaPaths` glob matcher compares an entry's basename
// against the PATTERN's basename rather than against the pattern
// (docs/bugs/0077-settings-glob-matches-pattern-basename.md).
//
// GOVERNING SPEC.
//   docs/spec_topics/discovery/package-and-settings.md, DISC-5 (anchor
//   `#disc-5`) pins the matcher: glob patterns are matched with the `minimatch`
//   engine "attempting each pattern against the candidate's
//   package-root-relative path, its basename, and its POSIX-normalised absolute
//   path", with `nocase` off. Three comparison strings, the whole pattern
//   against each one.
//   The same file's §"`thetaPaths` entry schema" → *Glob patterns and
//   exclusions* bullet binds the settings array to that sentence: "The glob
//   matcher, the `!`/`+`/`-` override ordering, and the exact-path treatment of
//   `+`/`-` operands follow the contract pinned at DISC-5 (the resolution base
//   differs — `thetaPaths` entries resolve relative to the settings file's
//   directory …)". The settings source therefore owes the same three
//   comparisons, with the settings-file directory as the relative base.
//   The same schema's *Directory entries* bullet: "A directory entry expands to
//   its non-recursive `*.theta` children … Subdirectories are not walked."
//   docs/spec_topics/discovery/discovery-sources.md, opening rule: "Discovery is
//   **non-recursive** and matches only `*.theta`".
//   DISC-5 step (2) of the fixed override order: "`!` patterns drop matching
//   paths from that set" — matching under those same three comparisons, so a
//   pattern naming one directory reaches no other directory's paths.
//
// THE DEFECT AT HEAD. `globMatches` (src/discovery/discovery-walk.ts) offers two
// comparisons and the second reduces the pattern to its own last segment
// (`minimatch(entry.base, basename(absPattern), …)`), so every directory
// qualification in the pattern is discarded before the comparison that decides
// the match; the root-relative comparison DISC-5 names is absent. The universe
// the predicate runs over is recursive (`listTree`) and rooted at the pattern's
// longest glob-free prefix (`staticPrefixRoot`), so the discarded qualification
// is exactly the information that would have held a match at one directory
// level. The `!` pass inside `resolveSettingsSource` re-inlines the same
// reduction (`minimatch(basename(key), basename(entry.abs), …)`) and iterates
// the whole `selected` map, which by that point holds the candidates every
// plain entry of the array contributed.
//
// PINNED POST-FIX CONTRACT (bug doc §Fix, settled). The predicate attempts the
// whole pattern against the entry's POSIX-normalised absolute path, its
// basename, and its settings-base-relative path (the last against the
// un-resolved pattern text), matching the shape of `matchesGlob`
// (src/discovery/package-discovery.ts); the `!` pass calls that same predicate
// instead of re-inlining a reduction. The fix adds no diagnostic on either
// path — it changes which candidates are selected, not what is reported — so
// every cell below pins an empty diagnostic set, which holds at HEAD and after.
//
// WHY THE PACKAGE WALKER IS IN THIS FILE. DISC-5 has two enforcement sites —
// `globMatches` for `thetaPaths` and `matchesGlob` for `pi.theta` — and the
// *Glob patterns and exclusions* bullet binds them to one contract, so one
// pattern text must mean one thing on both. Cell 3 drives
// `discoverPackageThetas` over cell 1's directory shape and cell 1's pattern
// text: it is the cross-implementation oracle that fixes which of the two
// answers is the correct one, and it sits beside the settings cells so the two
// cannot be read apart or moved apart.
//
// RED AT HEAD:
//   1  over-inclusion — `thetas/*.theta` reaches `thetas/sub/deep.theta`
//   2  over-exclusion — one `!thetas/*.theta` also drops `other/keep.theta`
// GREEN AT HEAD (and must still hold post-fix):
//   3  the package-walker oracle over cell 1's shape and pattern text
//   4  the `staticPrefixRoot` scope bound — a sibling directory lies outside the
//      universe the pattern is matched over

// ===========================================================================
// Fixtures. Shapes mirror tests/discovery-walk.test.ts (`ancestors` /
// `mergeDirs` / `BASE` / `build`) and tests/package-discovery.test.ts
// (`baseFs` / `manifest` / `FakeClock`).
// ===========================================================================

const HOME = "/home/theta";
const CWD = "/project";
const GLOBAL_ROOT = "/home/theta/.pi/agent/theta";
const PROJECT_ROOT = "/project/.pi/theta";
const NM = "/project/node_modules";

/** The settings-file directory `thetaPaths` entries resolve against (the
 *  *Resolution* bullet of the `thetaPaths` entry schema: `.pi/settings.json`
 *  entries resolve relative to `.pi/`). */
const SETTINGS_BASE = "/project/.pi";

/** A body that registers (this walk reads bytes and the filename, not syntax). */
const THETA_BODY = "mode: prompt\n---\n";

/** Proper-ancestor directories of `leaf`, so an `ENOENT` on `leaf` is a clean
 *  leaf under the discovery-sources.md ancestor walk (every ancestor `lstat`s ok
 *  as a directory) rather than an unreadable ancestor chain. The leaf itself is
 *  NOT registered. */
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

/** The two conventional roots' ancestor chains, in every settings fixture: an
 *  absent conventional root then classifies as a clean (silent) missing rather
 *  than as an unreadable ancestor failure, so each cell's diagnostic set is
 *  about its `thetaPaths` array alone. */
const BASE = mergeDirs(ancestors(GLOBAL_ROOT), ancestors(PROJECT_ROOT));

/** The five installed-package roots `packageRoots` enumerates
 *  (src/discovery/package-discovery.ts), registered as empty directories so no
 *  root's absence contributes an incidental rejection to cell 3's diagnostics. */
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

function buildWalk(spec: FakeSpec): FakeFileSystem {
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

function settingsInput(fs: FileSystem, thetaPaths: readonly string[]): DiscoveryInput {
  return { fs, settings: { thetaPaths, thetaPathsBaseDir: SETTINGS_BASE } };
}

function packageInput(fs: FileSystem): PackageDiscoveryInput {
  return { fs, clock: new FakeClock(), settings: {} };
}

/** package.json contents naming a `pi.theta` array. */
function manifest(piThetas: readonly string[]): string {
  return JSON.stringify({ name: "p", pi: { theta: piThetas } });
}

/** The registered slash names, sorted, so a cell pins the whole selected set
 *  rather than the presence or absence of one member. */
function names(thetas: readonly (DiscoveredTheta | PackageDiscoveredTheta)[]): string[] {
  return thetas.map((t) => t.name).sort();
}

/** The registered absolute paths, sorted (the identity behind each name). */
function paths(thetas: readonly (DiscoveredTheta | PackageDiscoveredTheta)[]): string[] {
  return thetas.map((t) => t.path).sort();
}

/** Observed thetas and diagnostics rendered into a failure message, so a red
 *  cell names the whole state it saw and not only the set diff. */
function observed(
  thetas: readonly (DiscoveredTheta | PackageDiscoveredTheta)[],
  diagnostics: readonly Diagnostic[],
): string {
  return (
    `observed ${JSON.stringify(thetas.map((t) => `${t.name} -> ${t.path}`))}; ` +
    `diagnostics ${JSON.stringify(diagnostics.map((d) => `${d.code}: ${d.message}`))}`
  );
}

/**
 * The bug doc's §Reproduction tree under the settings base dir: a `thetas/`
 * directory holding one theta plus a `sub/` subdirectory holding a second theta
 * and a non-`.theta` file, beside an unrelated `other/` directory holding a
 * third theta. Cells 1 and 2 read the same shape so their two symptoms are
 * attributable to the pattern array alone.
 */
function reproductionTree(): FakeFileSystem {
  return buildWalk({
    dirs: {
      ...ancestors(`${SETTINGS_BASE}/thetas/sub`),
      [`${SETTINGS_BASE}/thetas`]: ["top.theta", "sub"],
      [`${SETTINGS_BASE}/thetas/sub`]: ["deep.theta", "notes.md"],
      [`${SETTINGS_BASE}/other`]: ["keep.theta"],
    },
    files: {
      [`${SETTINGS_BASE}/thetas/top.theta`]: THETA_BODY,
      [`${SETTINGS_BASE}/thetas/sub/deep.theta`]: THETA_BODY,
      [`${SETTINGS_BASE}/thetas/sub/notes.md`]: "not a theta",
      [`${SETTINGS_BASE}/other/keep.theta`]: THETA_BODY,
    },
  });
}

// ===========================================================================
// Cell 1 — over-inclusion. A plain glob include selects at its own directory
// level only.
// ===========================================================================

describe("bug 0077 (1) — a plain `thetaPaths` glob include stays at the pattern's directory level", () => {
  it("DISC-5: `thetas/*.theta` selects `thetas/top.theta` alone — no comparison string of `thetas/sub/deep.theta` is matched by the pattern", async () => {
    const fs = reproductionTree();

    const { thetas, diagnostics } = await discoverThetas(
      settingsInput(fs, ["thetas/*.theta"]),
    );

    // The whole set, positively: the nested file is out AND the level-matching
    // file survives, so neither direction of the matcher can be traded for the
    // other. `thetas/sub/deep.theta` is matched by none of DISC-5's three
    // comparison strings — abs `/project/.pi/thetas/sub/deep.theta` against
    // `/project/.pi/thetas/*.theta` (one `*` crosses no `/`), basename
    // `deep.theta` against the whole pattern, rel `thetas/sub/deep.theta`
    // against `thetas/*.theta` — and the *Directory entries* bullet plus
    // discovery-sources.md's non-recursion rule forbid the reach independently.
    expect(
      names(thetas),
      `DISC-5 + the non-recursion rule: only \`thetas/top.theta\` matches ` +
        `\`thetas/*.theta\`; ${observed(thetas, diagnostics)}`,
    ).toEqual(["top"]);
    expect(
      paths(thetas),
      `the surviving candidate is the level-matching file itself; ` +
        `${observed(thetas, diagnostics)}`,
    ).toEqual([`${SETTINGS_BASE}/thetas/top.theta`]);
    // A glob resolving to fewer paths is silent (DISC-5 edge case: "A glob
    // pattern that resolves to zero files is silent"), and the non-`.theta`
    // sibling inside `sub/` is matched by no comparison string, so it raises no
    // `invalid-extension` per-match report either.
    expect(
      diagnostics,
      `narrowing the matcher reports nothing; ${observed(thetas, diagnostics)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// Cell 2 — over-exclusion. A `!` glob drops the paths it matches and no others.
// ===========================================================================

describe("bug 0077 (2) — a `!` glob drops only the paths DISC-5 says it matches", () => {
  it("DISC-5 step (2): `!thetas/*.theta` beside the `thetas` and `other` directory entries leaves `other/keep.theta` selected", async () => {
    const fs = reproductionTree();

    // Two literal directory entries select their non-recursive `*.theta`
    // children (`thetas/top.theta`, `other/keep.theta`); the `!` entry names
    // paths under `thetas/` only.
    const { thetas, diagnostics } = await discoverThetas(
      settingsInput(fs, ["thetas", "other", "!thetas/*.theta"]),
    );

    // `other/keep.theta` is matched by no DISC-5 comparison string of
    // `!thetas/*.theta`: abs `/project/.pi/other/keep.theta`, basename
    // `keep.theta`, rel `other/keep.theta` — none against
    // `/project/.pi/thetas/*.theta` / `thetas/*.theta`. Step (2) drops matching
    // paths, so the entry that names one directory cannot reach the candidate a
    // different entry contributed.
    expect(
      names(thetas),
      `DISC-5 step (2): the \`!\` entry drops \`thetas/top.theta\` and nothing ` +
        `else; ${observed(thetas, diagnostics)}`,
    ).toEqual(["keep"]);
    expect(
      paths(thetas),
      `the surviving candidate comes from the \`other\` entry; ` +
        `${observed(thetas, diagnostics)}`,
    ).toEqual([`${SETTINGS_BASE}/other/keep.theta`]);
    // An exclusion that resolves is silent under DISC-5, and `thetaPaths` has no
    // other surface reporting what it resolved to. The empty set is pinned on
    // both sides of the fix so a narrowed `!` domain cannot be paid for with a
    // new report.
    expect(
      diagnostics,
      `the override steps report nothing; ${observed(thetas, diagnostics)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// Cell 3 — the cross-implementation oracle: `pi.theta`'s `matchesGlob` over
// cell 1's shape and cell 1's pattern text.
// ===========================================================================

describe("bug 0077 (3) — the package walker is the oracle for one DISC-5 pattern text", () => {
  it("DISC-5: `pi.theta: [\"thetas/*.theta\"]` over `thetas/top.theta` + `thetas/sub/deep.theta` registers `top` alone", async () => {
    // WHY here: DISC-5 is enforced twice — `globMatches` for `thetaPaths`,
    // `matchesGlob` for `pi.theta` — and the *Glob patterns and exclusions*
    // bullet binds `thetaPaths` to the DISC-5 contract, so one pattern text
    // means one thing on both sites. This cell fixes which answer that is, over
    // the directory shape and the pattern text cell 1 uses; the two cells must
    // agree, and this one must not move to make them agree.
    const fs = buildPackages({
      dirs: {
        [NM]: ["p"],
        [`${NM}/p`]: ["package.json", "thetas"],
        [`${NM}/p/thetas`]: ["top.theta", "sub"],
        [`${NM}/p/thetas/sub`]: ["deep.theta"],
      },
      files: {
        [`${NM}/p/package.json`]: manifest(["thetas/*.theta"]),
        [`${NM}/p/thetas/top.theta`]: THETA_BODY,
        [`${NM}/p/thetas/sub/deep.theta`]: THETA_BODY,
      },
    });

    const { thetas, diagnostics } = await discoverPackageThetas(packageInput(fs));

    expect(
      names(thetas),
      `DISC-5's three comparison strings, whole pattern each: only ` +
        `\`thetas/top.theta\` matches; ${observed(thetas, diagnostics)}`,
    ).toEqual(["top"]);
    expect(
      paths(thetas),
      `the package-root-relative comparison selects the level-matching file; ` +
        `${observed(thetas, diagnostics)}`,
    ).toEqual([`${NM}/p/thetas/top.theta`]);
    expect(
      diagnostics,
      `a conformant match set is silent; ${observed(thetas, diagnostics)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// Cell 4 — the scope bound the settings glob universe already has.
// ===========================================================================

describe("bug 0077 (4) — the static-prefix root bounds the universe a settings glob is matched over", () => {
  it("DISC-5: `a/*.theta` selects `a/one.theta` and never reaches the sibling directory `b/`", async () => {
    // `staticPrefixRoot` roots the enumeration at the pattern's longest
    // glob-free prefix, so `b/two.theta` is not in the universe at all. This
    // holds independently of which comparison strings the predicate offers,
    // which is why it must stay green through the fix: it separates the scope
    // bound from the matcher, and a fix that narrowed the enumeration instead of
    // the predicate would not be witnessed by cells 1 and 2 alone.
    const fs = buildWalk({
      dirs: {
        ...ancestors(`${SETTINGS_BASE}/a`),
        [`${SETTINGS_BASE}/a`]: ["one.theta"],
        [`${SETTINGS_BASE}/b`]: ["two.theta"],
      },
      files: {
        [`${SETTINGS_BASE}/a/one.theta`]: THETA_BODY,
        [`${SETTINGS_BASE}/b/two.theta`]: THETA_BODY,
      },
    });

    const { thetas, diagnostics } = await discoverThetas(settingsInput(fs, ["a/*.theta"]));

    expect(
      names(thetas),
      `the universe is rooted at the pattern's glob-free prefix, so the sibling ` +
        `directory contributes nothing; ${observed(thetas, diagnostics)}`,
    ).toEqual(["one"]);
    expect(
      paths(thetas),
      `the selected candidate is the one under the static-prefix root; ` +
        `${observed(thetas, diagnostics)}`,
    ).toEqual([`${SETTINGS_BASE}/a/one.theta`]);
    expect(
      diagnostics,
      `a resolving glob is silent; ${observed(thetas, diagnostics)}`,
    ).toEqual([]);
  });
});
