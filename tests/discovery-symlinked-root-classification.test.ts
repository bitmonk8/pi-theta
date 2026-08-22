import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  discoverThetas,
  type DiscoveredTheta,
  type DiscoveryInput,
} from "../src/discovery/discovery-walk";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { FakeFileSystem } from "./helpers/fake-file-system";

// Bug 0075 (headline half) — how `classifyPath`
// (src/discovery/discovery-walk.ts) must classify a discovery candidate
// that the host resolves through a symlink or a Windows directory junction.
//
// GOVERNING SPEC (every line number re-derived against this tree):
//   docs/spec_topics/discovery/discovery-sources.md:68 — DISC-2's clean-leaf
//     implementation note, THE ANCHOR: "Use `lstat` (not `stat`) as the
//     ancestor probe so a broken symlink at an ancestor classifies as
//     *unreadable* rather than silently traversing. The candidate path itself
//     is checked with `readdir` or `stat` first; only failure triggers the
//     ancestor walk, and successful enumeration short-circuits." Two probes at
//     two positions: `lstat` for the ancestor chain, `readdir`/`stat` — both of
//     which resolve links — for the candidate.
//   discovery-sources.md:51 — the failure-modes table, whose third column is
//     scoped by its own title to "Path is wrong type (file vs dir)"; the CLI
//     row's three cells are all `error`, the Global and Project rows warn on
//     unreadable and wrong-type and are silent on missing (:53-58). Mirrored at
//     docs/reference/discovery-cli.md:46-53, codes at :55-56.
//   discovery-sources.md:70 — "The wrong-type rule fires only when the path
//     resolves to something that is neither a regular `.theta` file nor a
//     directory" — *resolves to*, so the arm is about the target, not the link.
//   discovery-sources.md:62 — DISC-2 rule 1 names a "broken symlink" as a
//     `theta/load/unreadable` warning on a discoverable `.theta` file, which
//     presupposes that an unbroken one is discoverable.
//   docs/spec_topics/diagnostics/code-registry-load.md:47-49 — the three
//     source-failure rows; their *Message* column is the only source of every
//     expected message string below (DIAG-4).
//
// THE PINNED CONTRACT (bug 0075 §Expected behaviour and §Fix Option B):
//   1. A candidate the host resolves to a directory — through one link or a
//      chain of them — classifies `dir`, is enumerated, and emits nothing.
//   2. A candidate resolving to a regular `.theta` file classifies `file` and
//      registers, emitting nothing.
//   3. A DANGLING link routes through the existing `ENOENT` branch
//      (EnoentPolicy / `ancestorsClean`, discovery-walk.ts), so on a clean
//      ancestor chain it is `theta/load/missing-source` — error for the CLI
//      row of DISC-2's failure-modes table (discovery-sources.md) — NOT
//      `theta/load/wrong-type-source`. The class is re-derived here from that
//      table, since `REQ-DISC-14` (the requirement id the sibling e2e cell
//      carries) has no anchor under `docs/`.
//   4. `theta/load/wrong-type-source` is PRESERVED for a candidate that
//      resolves to a genuine non-regular, non-directory entry (fifo, socket,
//      device) — the only input DISC-2's wrong-type column still admits once
//      links resolve.
//   5. An existing-but-unreadable root stays `theta/load/unreadable-source`,
//      and an ordinary directory / ordinary `.theta` file are unaffected: a
//      probe reordering must move no other cell of the table.
//
// THE SEAM. `tests/helpers/fake-file-system.ts` mirrors the host split PIC-13
// documents: `readdir` / `readText` / `readBytes` / `realpath` resolve
// symlinked components transitively, `lstat` alone does not. That fidelity is
// what makes the classification reachable offline through the real
// `discoverThetas`; its `others` option supplies the non-regular entry that
// contract 4 needs, which no other fixture primitive can express.

// ===========================================================================
// The registry rows (DIAG-4) — the source of every expected message.
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
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-load.md must ` +
      `carry the Message row for ${code}`,
  ).toBeDefined();
  return message!;
}

/** Interpolate a registry Message template's `<placeholder>` slots. */
function interpolate(template: string, subs: Record<string, string>): string {
  return template.replace(/<([a-z-]+)>/g, (whole, name: string) => subs[name] ?? whole);
}

const MISSING_SOURCE = "theta/load/missing-source";
const UNREADABLE_SOURCE = "theta/load/unreadable-source";
const WRONG_TYPE_SOURCE = "theta/load/wrong-type-source";

// ===========================================================================
// Fixtures.
// ===========================================================================

const HOME = "/home/theta";
const CWD = "/project";
const GLOBAL_ROOT = "/home/theta/.pi/agent/theta";
const PROJECT_ROOT = "/project/.pi/theta";

/** A body that parses far enough to register (the walk reads the bytes). */
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

/** Both conventional roots' ancestor chains, in every fixture, so an absent
 *  conventional root classifies as a clean (silent) missing and each cell's
 *  diagnostic set is about the path under test alone. */
const BASE = mergeDirs(ancestors(GLOBAL_ROOT), ancestors(PROJECT_ROOT));

interface FakeSpec {
  readonly dirs?: Record<string, readonly string[]>;
  readonly files?: Record<string, string>;
  readonly symlinks?: Record<string, string>;
  readonly others?: readonly string[];
  readonly errors?: Record<string, string>;
}

function build(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: mergeDirs(BASE, spec.dirs ?? {}),
    files: spec.files ?? {},
    symlinks: spec.symlinks ?? {},
    others: spec.others ?? [],
    errors: spec.errors ?? {},
  });
}

function input(fs: FakeFileSystem, extra: Partial<DiscoveryInput> = {}): DiscoveryInput {
  return { fs, settings: {}, ...extra };
}

function names(thetas: readonly DiscoveredTheta[]): string[] {
  return thetas.map((t) => t.name).sort();
}

/** The comparable shape of a diagnostic: an assertion on the whole array of
 *  these is what makes "emits nothing else" observable rather than implied. */
function shape(diagnostics: readonly Diagnostic[]): unknown[] {
  return diagnostics.map((d) => ({
    severity: d.severity,
    code: d.code,
    file: d.file,
    message: d.message,
  }));
}

// ===========================================================================
// Contracts 1 and 2 — a candidate the host resolves through a link.
// ===========================================================================

describe("bug 0075 — a link-resolved discovery candidate classifies by its target", () => {
  it("DISC-2 clean-leaf note (discovery-sources.md:68): a Global root that is a symlink to a real directory enumerates it and emits nothing", async () => {
    const fs = build({
      dirs: {
        ...ancestors("/opt/global-target"),
        "/opt/global-target": ["greet.theta"],
      },
      files: { "/opt/global-target/greet.theta": THETA_BODY },
      symlinks: { [GLOBAL_ROOT]: "/opt/global-target" },
    });

    const { thetas, diagnostics } = await discoverThetas(input(fs));

    expect(shape(diagnostics)).toEqual([]);
    expect(names(thetas)).toEqual(["greet"]);
  });

  it("DISC-2 clean-leaf note (discovery-sources.md:68): a Project `.pi/theta` root that is a symlink to a real directory enumerates it and emits nothing", async () => {
    const fs = build({
      dirs: {
        ...ancestors("/project/real-thetas"),
        "/project/real-thetas": ["plan.theta"],
      },
      files: { "/project/real-thetas/plan.theta": THETA_BODY },
      symlinks: { [PROJECT_ROOT]: "/project/real-thetas" },
    });

    const { thetas, diagnostics } = await discoverThetas(input(fs));

    expect(shape(diagnostics)).toEqual([]);
    expect(names(thetas)).toEqual(["plan"]);
  });

  it("discovery-sources.md:70 — a `--theta` component naming a symlinked DIRECTORY resolves to a directory, so no wrong-type rule fires", async () => {
    const fs = build({
      dirs: {
        ...ancestors("/links/dirlink"),
        ...ancestors("/opt/thetas"),
        "/opt/thetas": ["a.theta"],
      },
      files: { "/opt/thetas/a.theta": THETA_BODY },
      symlinks: { "/links/dirlink": "/opt/thetas" },
    });

    const { thetas, diagnostics } = await discoverThetas(
      input(fs, { cliPaths: ["/links/dirlink"] }),
    );

    expect(shape(diagnostics)).toEqual([]);
    expect(names(thetas)).toEqual(["a"]);
  });

  it("discovery-sources.md:70 — a `--theta` component naming a symlinked `.theta` FILE resolves to a regular file and registers", async () => {
    const fs = build({
      dirs: {
        ...ancestors("/links/b.theta"),
        ...ancestors("/opt/thetas"),
        "/opt/thetas": ["a.theta"],
      },
      files: { "/opt/thetas/a.theta": THETA_BODY },
      symlinks: { "/links/b.theta": "/opt/thetas/a.theta" },
    });

    const { thetas, diagnostics } = await discoverThetas(
      input(fs, { cliPaths: ["/links/b.theta"] }),
    );

    expect(shape(diagnostics)).toEqual([]);
    // The slash name comes from the operand's own stem (`resolveEntry`'s file
    // arm, discovery-walk.ts), not from the link target's.
    expect(names(thetas)).toEqual(["b"]);
  });

  it("discovery-sources.md:70 — a settings `thetaPaths` literal entry naming a symlinked directory enumerates it and emits nothing", async () => {
    const fs = build({
      dirs: {
        ...ancestors("/links/settingslink"),
        ...ancestors("/opt/shared"),
        "/opt/shared": ["shared.theta"],
      },
      files: { "/opt/shared/shared.theta": THETA_BODY },
      symlinks: { "/links/settingslink": "/opt/shared" },
    });

    const { thetas, diagnostics } = await discoverThetas(
      input(fs, { settings: { thetaPaths: ["/links/settingslink"] } }),
    );

    expect(shape(diagnostics)).toEqual([]);
    expect(names(thetas)).toEqual(["shared"]);
  });

  it("DISC-2 clean-leaf note (discovery-sources.md:68): a symlink CHAIN to a real directory resolves transitively, as on the host", async () => {
    const fs = build({
      dirs: {
        ...ancestors("/links/chain"),
        ...ancestors("/opt/thetas"),
        "/opt/thetas": ["a.theta"],
      },
      files: { "/opt/thetas/a.theta": THETA_BODY },
      symlinks: { "/links/chain": "/links/mid", "/links/mid": "/opt/thetas" },
    });

    const { thetas, diagnostics } = await discoverThetas(
      input(fs, { cliPaths: ["/links/chain"] }),
    );

    expect(shape(diagnostics)).toEqual([]);
    expect(names(thetas)).toEqual(["a"]);
  });
});

// ===========================================================================
// Contracts 3, 4 and 5 — the classes the reorder must leave where they are.
// ===========================================================================

describe("bug 0075 — the neighbouring classes the candidate probe must preserve", () => {
  it("failure-modes table (discovery-sources.md:51): a DANGLING `--theta` link is a missing-source error, not wrong-type", async () => {
    // The target does not exist, so the candidate is an `ENOENT` whose proper
    // ancestors all `lstat` as enterable directories — DISC-2's clean leaf
    // (discovery-sources.md:68) — and the CLI row's *Missing path* cell is
    // `error`. Nothing here resolves to a non-`.theta`-file, non-directory
    // entry, which is the only thing the third column's title admits (:70).
    const fs = build({
      dirs: { ...ancestors("/cli/dangling") },
      symlinks: { "/cli/dangling": "/somewhere/else" },
    });

    const { thetas, diagnostics } = await discoverThetas(
      input(fs, { cliPaths: ["/cli/dangling"] }),
    );

    expect(thetas).toEqual([]);
    expect(shape(diagnostics)).toEqual([
      {
        severity: "error",
        code: MISSING_SOURCE,
        file: "/cli/dangling",
        message: interpolate(loadRowMessage(MISSING_SOURCE), {
          descriptor: "--theta flag #1",
        }),
      },
    ]);
  });

  it("failure-modes table (discovery-sources.md:51): a genuine non-regular, non-directory `--theta` target stays a wrong-type-source error", async () => {
    // A fifo / socket / device node: it exists, `lstat` reports neither file
    // nor directory nor link, and resolution leads to the same entry. This is
    // the residue of the wrong-type column once links classify by target.
    const fs = build({
      dirs: { ...ancestors("/pipes/fifo") },
      others: ["/pipes/fifo"],
    });

    const { thetas, diagnostics } = await discoverThetas(
      input(fs, { cliPaths: ["/pipes/fifo"] }),
    );

    expect(thetas).toEqual([]);
    expect(shape(diagnostics)).toEqual([
      {
        severity: "error",
        code: WRONG_TYPE_SOURCE,
        file: "/pipes/fifo",
        message: interpolate(loadRowMessage(WRONG_TYPE_SOURCE), {
          descriptor: "--theta flag #1",
        }),
      },
    ]);
  });

  it("failure-modes table (discovery-sources.md:51): an ordinary directory root and an ordinary `.theta` file entry classify unchanged", async () => {
    const fs = build({
      dirs: {
        ...ancestors("/plain/dir"),
        "/plain/dir": ["one.theta"],
        "/plain/loose": ["two.theta"],
      },
      files: {
        "/plain/dir/one.theta": THETA_BODY,
        "/plain/loose/two.theta": THETA_BODY,
      },
    });

    const { thetas, diagnostics } = await discoverThetas(
      input(fs, { cliPaths: ["/plain/dir", "/plain/loose/two.theta"] }),
    );

    expect(shape(diagnostics)).toEqual([]);
    expect(names(thetas)).toEqual(["one", "two"]);
  });

  it("failure-modes table (discovery-sources.md:51): an EACCES `--theta` directory root stays an unreadable-source error", async () => {
    // The root exists but every probe on it is denied, so no reordering of the
    // candidate probes can reclassify it: `theta/load/unreadable-source` at the
    // CLI row's *Unreadable path* severity.
    const fs = build({
      dirs: { ...ancestors("/denied/root"), "/denied/root": ["x.theta"] },
      files: { "/denied/root/x.theta": THETA_BODY },
      errors: { "/denied/root": "EACCES" },
    });

    const { thetas, diagnostics } = await discoverThetas(
      input(fs, { cliPaths: ["/denied/root"] }),
    );

    expect(thetas).toEqual([]);
    expect(shape(diagnostics)).toEqual([
      {
        severity: "error",
        code: UNREADABLE_SOURCE,
        file: "/denied/root",
        message: interpolate(loadRowMessage(UNREADABLE_SOURCE), {
          descriptor: "--theta flag #1",
        }),
      },
    ]);
  });
});

// ===========================================================================
// Seam fidelity — the fake's link handling against the real host's.
// ===========================================================================
//
// The host half of this axis (real `PiFileSystem` over a Windows junction,
// mirrored against `FakeFileSystem`) lives with the rest of the PIC-13 seam
// conformance cells, in tests/filesystem-seam.test.ts.
