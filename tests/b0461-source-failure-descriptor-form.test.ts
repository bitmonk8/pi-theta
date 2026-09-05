// Bug 0461 — the three DISC-2 failure-mode registry rows
// (`theta/load/missing-source`, `theta/load/unreadable-source`,
// `theta/load/wrong-type-source`) render their `<descriptor>` placeholder as
// PROSE CATEGORY TEXT (`settings entry index 0`, `--theta flag #1`,
// `project .pi/theta/`, `global thetas directory`, `` package `foo` (pi.theta) ``)
// instead of the normative `<kind>:"<value>"` descriptor form
// placeholder-rendering-b.md §5 pins ("The descriptor format is normative")
// (docs/bugs/0461-source-failure-descriptor-category-text.md).
//
// GOVERNING SPEC:
//   - placeholder-rendering-b.md §5 (the `<descriptor>` rule — rendered
//     `<kind>:"<value>"`, kind from the closed five-set, value the source's own
//     configuration text verbatim / the conventional root's resolved path) and
//     its byte-exact missing-source vector.
//   - discovery-sources.md#descriptor-kinds — the closed 5-kind set
//     (`cli-flag`, `settings`, `project`, `global`, `package`).
//   - code-registry-load.md missing/unreadable/wrong-type-source rows, whose
//     *Message* columns all template on `<descriptor>` (DIAG-4,
//     diagnostic-shape.md: renderers emit the Message column
//     character-for-character with placeholders interpolated).
//
// THE DEFECT AT HEAD. `emitSourceFailure` (src/discovery/discovery-walk.ts)
// interpolates only the category `descriptor` string into all three templates;
// the descriptor VALUE (`descriptorValue`, threaded by bug 0440 for the
// cross-source-shadow mint) is in scope at every caller but never passed down.
// `thetasInDirectory`'s twin emitters in package-discovery.ts render the
// package category label the same way. So every missing/unreadable/wrong-type
// emission on every source diverges from the placeholder page's `<kind>:"<value>"`.
//
// EXPECTED (post-fix, §Fix Option 1 — the settled fix): each failure-mode mint
// renders the pinned `<kind>:"<value>"` descriptor via the existing
// `renderDescriptor` composition, keeping bug 0440's value-derivation rules
// (settings entry text verbatim; CLI flag string; package name;
// conventional-root resolved path).
//
// DESCRIPTOR VALUE derivations exercised below
// (placeholder-rendering-b.md §5, discovery-sources.md#descriptor-kinds):
//   settings kind=`settings`  value=the thetaPaths entry text verbatim (entry.raw)
//   cli      kind=`cli-flag`  value=`--theta <operand-as-passed>`
//   project  kind=`project`   value=resolved root path forward-slashed
//   global   kind=`global`    value=resolved root path
//   package  kind=`package`   value=package name
//
// RED against the current tree for the RIGHT reason: cells 1,2,4,5,6,7 red
// because the shipped emitters interpolate the category prose where the fix
// interpolates `<kind>:"<value>"` — the divergence is exactly the descriptor
// grammar, not a missing diagnostic, wrong severity, or seam error. Cell 8 (the
// cross-source-shadow control, bug 0440's already-pinned ground) is GREEN now
// AND after the fix, proving the fix does not disturb the shadow mint.

import { describe, expect, it } from "vitest";
import { discoverThetas, type DiscoveryInput } from "../src/discovery/discovery-walk";
import {
  discoverPackageThetas,
  type PackageDiscoveryInput,
} from "../src/discovery/package-discovery";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { FileStat, FileSystem } from "../src/seams/file-system";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileSystem } from "./helpers/fake-file-system";

const HOME = "/home/theta";
const CWD = "/project";
// The two conventional roots' resolved directory paths (0268 forward-slashed) —
// the descriptor VALUEs the fix renders for the project/global kinds.
// globalAgentDir() = <homedir>/.pi/agent; project root = <cwd>/.pi/theta.
const GLOBAL_ROOT = "/home/theta/.pi/agent/theta";
const PROJECT_ROOT = "/project/.pi/theta";
const SETTINGS_BASE = "/project/.pi";
const NM = "/project/node_modules";

const THETA_BODY = "mode: prompt\n---\n";

// The three failure-mode registry codes, used as string literals exactly as the
// committed discovery witnesses do (discovery-walk.test.ts, b0364, b0363,
// discovery-root-enumeration-failure) — each carries an asserting test, so it
// is NOT a corpus-gate carve-out and is gate-safe as a literal. The
// cross-source-shadow code (cell 8) is NOT gate-safe as a literal, so cell 8
// locates its diagnostic by message fragment, mirroring bug 0440.
const MISSING_SOURCE = "theta/load/missing-source";
const UNREADABLE_SOURCE = "theta/load/unreadable-source";
const WRONG_TYPE_SOURCE = "theta/load/wrong-type-source";
const SHADOW_FRAGMENT = "shadowed across discovery sources";

/** Proper-ancestor directories of `leaf` as empty dirs, so an ENOENT on `leaf`
 *  is a CLEAN leaf under the DISC-2 ancestor walk (every ancestor lstats ok as
 *  a directory ⇒ *missing*, not *unreadable*). The leaf itself is NOT
 *  registered. Copied from tests/b0440-cross-source-shadow-descriptor-form.test.ts. */
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
}

function build(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: spec.dirs ?? {},
    files: spec.files ?? {},
  });
}

/** The five installed-package roots `packageRoots` enumerates, registered as
 *  empty directories so a root's absence never contributes an incidental
 *  readdir rejection to the package cell. Copied from
 *  tests/discovery-glob-universe-enumeration-failure.test.ts. */
const PKG_ROOTS: Record<string, readonly string[]> = {
  "/project/.pi/npm": [],
  "/project/.pi/git": [],
  [NM]: [],
  "/home/theta/.pi/agent/npm": [],
  "/home/theta/.pi/agent/git": [],
};

function buildPackages(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: mergeDirs(PKG_ROOTS, spec.dirs ?? {}),
    files: spec.files ?? {},
  });
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

/**
 * A `FileSystem` decorator rejecting `readdir` for exactly one path with a
 * Node-style `.code`, delegating every other member to an inner
 * `FakeFileSystem`. This is the seam that reaches the unreadable arm: the denied
 * directory still `lstat`s as a directory, so classification descends into it
 * and only its enumeration fails. Copied from
 * tests/discovery-glob-universe-enumeration-failure.test.ts (the lstat-denial
 * cell that file adds is unused here, so this copy omits it).
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
    return this.#inner.lstat(path);
  }
  realpath(path: string): Promise<string> {
    return this.#inner.realpath(path);
  }
}

/** A Node-style error carrying the injected `.code` (`nodeErrorCode` reads it). */
function codeError(code: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`${code}: readdir`);
  error.code = code;
  return error;
}

/** The single diagnostic carrying `code`, or a loud failure naming the unmet
 *  precondition — never a silent skip when the expected diagnostic is absent or
 *  duplicated (the witness would otherwise be vacuous). Mirrors bug 0440's
 *  `soleByFragment`. */
function soleByCode(diagnostics: readonly Diagnostic[], code: string): Diagnostic {
  const hits = diagnostics.filter((d) => d.code === code);
  expect(
    hits,
    `expected exactly one diagnostic with code '${code}'; got ${hits.length}: ${JSON.stringify(diagnostics)}`,
  ).toHaveLength(1);
  return hits[0]!;
}

/** The single diagnostic whose message contains `fragment` (cell 8's shadow
 *  locator — the shadow code is not gate-safe as a literal). Mirrors bug 0440. */
function soleByFragment(diagnostics: readonly Diagnostic[], fragment: string): Diagnostic {
  const hits = diagnostics.filter((d) => d.message.includes(fragment));
  expect(
    hits,
    `expected exactly one diagnostic whose message contains '${fragment}'; got ${hits.length}: ${JSON.stringify(hits.map((d) => d.message))}`,
  ).toHaveLength(1);
  return hits[0]!;
}

// --------------------------------------------------------------------------
// Cell 1 — settings MISSING. An absolute `thetaPaths` entry whose leaf is
// cleanly missing (ancestors planted) classifies *missing* ⇒ error. The entry
// is absolute, so entry.raw === the operand === the resolved path. The fix
// renders `settings:"<entry.raw>"`; HEAD emits `settings entry index 0`.
// Expected byte string:
//   discovery source path does not exist: settings:"/project/.pi/nope"
// --------------------------------------------------------------------------

describe("b0461 cell 1 — settings missing renders the descriptor form", () => {
  it("renders settings:\"<entry.raw>\", not `settings entry index 0`", async () => {
    const leaf = "/project/.pi/nope";
    const fs = build({ dirs: ancestors(leaf) });

    const { diagnostics } = await discoverThetas(settingsInput(fs, [leaf]));

    const missing = soleByCode(diagnostics, MISSING_SOURCE);
    expect(missing.severity).toBe("error");
    expect(missing.message).toBe(
      `discovery source path does not exist: settings:"/project/.pi/nope"`,
    );
  });
});

// --------------------------------------------------------------------------
// Cell 2 — settings UNREADABLE. An absolute literal `thetaPaths` DIRECTORY
// entry whose readdir rejects EACCES routes addLiteral→addDir→enumerateDirectory
// carrying entry.raw as the descriptor value; the enumeration failure classifies
// *unreadable* ⇒ warning. entry.raw === the absolute path as written.
// The fix renders `settings:"<entry.raw>"`; HEAD emits `settings entry index 0`.
// Expected byte string:
//   discovery source is unreadable: settings:"/project/.pi/denied"
// --------------------------------------------------------------------------

describe("b0461 cell 2 — settings unreadable renders the descriptor form", () => {
  it("renders settings:\"<entry.raw>\", not `settings entry index 0`", async () => {
    const dir = "/project/.pi/denied";
    const fs = new ReaddirDenied(
      build({ dirs: mergeDirs(ancestors(dir), { [dir]: [] }) }),
      dir,
      "EACCES",
    );

    const { diagnostics } = await discoverThetas(settingsInput(fs, [dir]));

    const unreadable = soleByCode(diagnostics, UNREADABLE_SOURCE);
    expect(unreadable.severity).toBe("warning");
    expect(unreadable.message).toBe(
      `discovery source is unreadable: settings:"/project/.pi/denied"`,
    );
  });
});

// --------------------------------------------------------------------------
// Cell 3 — settings WRONG-TYPE. OMITTED, stated loudly per the task's guard: a
// settings `thetaPaths` entry classifies *wrong-type* only when the resolved
// path is a regular file whose name does NOT end in `.theta` — but for an
// EXPLICIT file reference (settings/CLI) `classifyForSource` maps exactly that
// shape to `invalid-extension` (a DIFFERENT code + template, not `<descriptor>`),
// NOT to wrong-type-source (src/discovery/discovery-walk.ts classifyForSource:
// `explicitFile ? { kind: "invalid-extension" } : { kind: "wrong-type" }`). A
// clean settings wrong-type-source cannot be constructed without that
// invalid-extension collision, so faking one would red on the wrong grammar.
// The wrong-type row's descriptor form is instead witnessed on the GLOBAL
// conventional source (explicitFile=false), which the bug doc's §Expected pins
// byte-exactly — see cell 6.

// --------------------------------------------------------------------------
// Cell 4 — cli MISSING. A `--theta` operand whose leaf is cleanly missing
// classifies *missing* ⇒ error (CLI_MODES.missing). The cli-flag descriptor
// VALUE is the raw operand as passed, prefixed `--theta ` (verbatim, no
// expandHome/normalizePath). The fix renders `cli-flag:"--theta <raw>"`; HEAD
// emits `--theta flag #1`.
// Expected byte string:
//   discovery source path does not exist: cli-flag:"--theta /project/.pi/nope2"
// --------------------------------------------------------------------------

describe("b0461 cell 4 — cli missing renders the descriptor form", () => {
  it("renders cli-flag:\"--theta <raw>\", not `--theta flag #1`", async () => {
    const operand = "/project/.pi/nope2";
    const fs = build({ dirs: ancestors(operand) });

    const { diagnostics } = await discoverThetas(input(fs, { cliPaths: [operand] }));

    const missing = soleByCode(diagnostics, MISSING_SOURCE);
    expect(missing.severity).toBe("error");
    expect(missing.message).toBe(
      `discovery source path does not exist: cli-flag:"--theta /project/.pi/nope2"`,
    );
  });
});

// --------------------------------------------------------------------------
// Cell 5 — project UNREADABLE. The conventional project root `/project/.pi/theta`
// exists as a directory but its readdir rejects EACCES ⇒ *unreadable* warning
// (CONVENTIONAL_MODES: missing is silent, unreadable warns). The descriptor
// VALUE is the root's resolved directory path, forward-slashed
// (normalizePath(root.path)). The fix renders `project:"<root>"`; HEAD emits
// `project .pi/theta/`.
// Expected byte string:
//   discovery source is unreadable: project:"/project/.pi/theta"
// --------------------------------------------------------------------------

describe("b0461 cell 5 — project unreadable renders the descriptor form", () => {
  it("renders project:\"<root>\", not `project .pi/theta/`", async () => {
    const fs = new ReaddirDenied(
      build({ dirs: mergeDirs(ancestors(PROJECT_ROOT), { [PROJECT_ROOT]: [] }) }),
      PROJECT_ROOT,
      "EACCES",
    );

    const { diagnostics } = await discoverThetas(input(fs));

    const unreadable = soleByCode(diagnostics, UNREADABLE_SOURCE);
    expect(unreadable.severity).toBe("warning");
    expect(unreadable.message).toBe(
      `discovery source is unreadable: project:"/project/.pi/theta"`,
    );
  });
});

// --------------------------------------------------------------------------
// Cell 6 — global WRONG-TYPE. The conventional global root
// `/home/theta/.pi/agent/theta` is planted as a REGULAR FILE, so it classifies
// *wrong-type* ⇒ warning (conventional roots are explicitFile=false, so a
// non-`.theta` file is wrong-type, not invalid-extension). The descriptor VALUE
// is the root's resolved directory path. The fix renders `global:"<root>"`; HEAD
// emits `global thetas directory`. Matches the bug doc's §Expected exactly.
// Expected byte string:
//   discovery source global:"/home/theta/.pi/agent/theta" is neither a .theta file nor a directory of them
// --------------------------------------------------------------------------

describe("b0461 cell 6 — global wrong-type renders the descriptor form", () => {
  it("renders global:\"<root>\", not `global thetas directory`", async () => {
    const fs = build({
      dirs: ancestors(GLOBAL_ROOT),
      files: { [GLOBAL_ROOT]: "not a directory\n" },
    });

    const { diagnostics } = await discoverThetas(input(fs));

    const wrongType = soleByCode(diagnostics, WRONG_TYPE_SOURCE);
    expect(wrongType.severity).toBe("warning");
    expect(wrongType.message).toBe(
      `discovery source global:"/home/theta/.pi/agent/theta" is neither a .theta file nor a directory of them`,
    );
  });
});

// --------------------------------------------------------------------------
// Cell 7 — package UNREADABLE. Package `beta` with `pi.theta: ["**/*.theta"]`
// over a `cmds/` directory whose readdir rejects EACCES. The universe walk
// records `cmds/` unreadable and the package emitter warns (bug 0113, fixed
// 0.126.0, guarantees this report). The descriptor VALUE is the package name.
// The fix renders `package:"beta"`; HEAD emits `` package `beta` (pi.theta) ``.
// Expected byte string:
//   discovery source is unreadable: package:"beta"
// --------------------------------------------------------------------------

describe("b0461 cell 7 — package unreadable renders the descriptor form", () => {
  it("renders package:\"<name>\", not `` package `beta` (pi.theta) ``", async () => {
    const deniedCmds = `${NM}/beta/cmds`;
    const fs = new ReaddirDenied(
      buildPackages({
        dirs: {
          ...ancestors(deniedCmds),
          [NM]: ["beta"],
          [`${NM}/beta`]: ["package.json", "cmds"],
          [deniedCmds]: ["b.theta"],
        },
        files: {
          [`${NM}/beta/package.json`]: JSON.stringify({
            name: "beta",
            pi: { theta: ["**/*.theta"] },
          }),
          [`${deniedCmds}/b.theta`]: THETA_BODY,
        },
      }),
      deniedCmds,
      "EACCES",
    );

    const { diagnostics } = await discoverPackageThetas(packageInput(fs));

    const unreadable = soleByCode(diagnostics, UNREADABLE_SOURCE);
    expect(unreadable.severity).toBe("warning");
    expect(unreadable.message).toBe(`discovery source is unreadable: package:"beta"`);
  });
});

// --------------------------------------------------------------------------
// Cell 8 — CONTROL (GREEN now AND after fix). The cross-source-shadow row is
// bug 0440's already-pinned ground and is untouched by this fix. Copied from
// tests/b0440-cross-source-shadow-descriptor-form.test.ts arm 1: a `--theta`
// file (priority 1) shadows a settings `thetaPaths` file (priority 2) deriving
// the same slash name; the mint already renders the descriptor form. This
// proves the fix does not disturb the shadow mint.
// --------------------------------------------------------------------------

describe("b0461 cell 8 (control) — cross-source-shadow keeps the descriptor form", () => {
  it("renders 'cli-flag:\"--theta …\"' wins over 'settings:\"…\"', unchanged by this fix", async () => {
    const fs = build({
      dirs: mergeDirs(
        ancestors("/ext/plan.theta"),
        { "/ext": ["plan.theta"] },
        ancestors("/work/plan.theta"),
        { "/work": ["plan.theta"] },
      ),
      files: {
        "/ext/plan.theta": THETA_BODY,
        "/work/plan.theta": THETA_BODY,
      },
    });

    const { diagnostics } = await discoverThetas(
      input(fs, {
        cliPaths: ["/ext/plan.theta"],
        settings: { thetaPaths: ["/work/plan.theta"] },
      }),
    );

    const shadow = soleByFragment(diagnostics, SHADOW_FRAGMENT);
    expect(shadow.message).toBe(
      `slash name 'plan' shadowed across discovery sources: 'cli-flag:"--theta /ext/plan.theta"' wins over 'settings:"/work/plan.theta"'`,
    );
  });
});
