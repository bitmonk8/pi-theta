import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  discoverThetas,
  type DiscoveredTheta,
  type DiscoveryInput,
} from "../src/discovery/discovery-walk";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { FileSystem } from "../src/seams/file-system";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { FakeFileSystem } from "./helpers/fake-file-system";

// The CLI source is a single-invocation override whose components the shell
// normally expands, so a `--theta` component shares with a settings
// `thetaPaths` entry only the file-vs-directory rule
// (docs/spec_topics/discovery/discovery-sources.md:33) — not the DISC-5 glob
// and `!`/`+`/`-` override grammar
// (docs/spec_topics/discovery/package-and-settings.md:91), which stays the
// settings source's alone. A leading `!`, `+` or `-` on a `--theta` component
// therefore carries no override meaning: the component is taken as a LITERAL
// path, and when that literal path does not exist the CLI row's *Missing path*
// cell (discovery-sources.md:58, mirrored at
// docs/reference/discovery-cli.md:53) is the one that applies —
// `theta/load/missing-source`, error.
//
// Such an operand is virtually always relative in shape (it begins with the
// prefix character, not with `/` or a drive letter), so DISC-2's
// clean-leaf-`ENOENT` ancestor walk (discovery-sources.md:68, implemented by
// `ancestorsClean` / `properAncestors` in src/discovery/discovery-walk.ts) is
// asked about the relative prefixes `!` and `!/opt`, which no filesystem
// carries. That walk exists to tell an operator that a directory ALONG a typed
// path is missing or unenterable; on an override-prefixed component it answers
// about path segments the operator never typed, so it does not apply and the
// classification is `missing`, not `unreadable`. A NON-`ENOENT` rejection on
// the same component keeps the `unreadable` classification, which is truthful:
// the path exists and cannot be read.
//
// GOVERNING SPEC (line numbers re-derived against this tree's HEAD):
//   docs/spec_topics/discovery/discovery-sources.md:33 — THE ANCHOR: "Each path
//     component of the `--theta` CLI flag (after splitting on
//     `path.delimiter`), resolved by the same file-vs-directory rule as
//     settings entries" — the shared rule, scoped to file-vs-directory.
//   discovery-sources.md:7 — the CLI source bullet, which states how a
//     `--theta` component resolves.
//   discovery-sources.md:58 — the DISC-2 failure-modes table's `CLI --theta
//     <path>` row: Missing = error, Unreadable = error, Wrong type = error.
//   discovery-sources.md:68 — DISC-2's clean-leaf-`ENOENT` implementation note:
//     the ancestor walk, and "if any ancestor `lstat` returns `EACCES`,
//     `EPERM`, `ENOTDIR`, or itself `ENOENT`, classify the result as
//     *unreadable*".
//   discovery-sources.md:64 — rule 3: "Errors are fatal for the offending entry
//     only, not for the whole discovery pass".
//   discovery-sources.md:63 — rule 2: each diagnostic "carries the source
//     descriptor in its `message`", and the three source-shaped codes render
//     it in the normative `<kind>:"<value>"` form — e.g.
//     `` cli-flag:"--theta /opt/plan" ``.
//   docs/spec_topics/discovery/package-and-settings.md:91 — the DISC-5 glob and
//     `!`/`+`/`-` override grammar, whose home is the settings source.
//   docs/reference/discovery-cli.md:53 — the operator-facing mirror of the CLI
//     failure-modes row.
//   docs/spec_topics/diagnostics/code-registry-load.md:47 (`missing-source`)
//     and :48 (`unreadable-source`) — the only source of every expected message
//     below (DIAG-4, docs/spec_topics/diagnostics/diagnostic-shape.md:74).
//
// THE PINNED CONTRACT (settled by the operator for this witness, and no wider):
//   1. A `--theta` component whose first character is `!`, `+` or `-` is a
//      literal path. It performs no exclusion and no force-include: a plain
//      component's thetas stay registered alongside it.
//   2. An `ENOENT` on such a component classifies `missing` ⇒
//      `theta/load/missing-source`, severity `error` (the CLI row at
//      discovery-sources.md:58), `file` = the operand text verbatim, message =
//      the registry row interpolated with the `cli-flag:"--theta <operand>"`
//      descriptor — and NOT `theta/load/unreadable-source`.
//   3. A non-`ENOENT` rejection on such a component still classifies
//      `unreadable`: the path exists and cannot be read.
//   4. Untouched, and pinned here by control cells: DISC-2's ancestor walk for
//      every ordinary `--theta` component (dirty chain ⇒ `unreadable`, clean
//      chain ⇒ `missing`); the absence of glob expansion for this source (a
//      glob operand that names no path is `missing-source`); and the settings
//      source's DISC-5 grammar, where `!` still excludes with zero diagnostics.
//
// THE FIXTURE SHAPE. `tests/helpers/fake-file-system.ts` is keyed by verbatim
// path strings, so a directory whose name genuinely begins with `!` is
// expressible — which is what makes the literal-path reading observable rather
// than merely asserted (cell 6). The conventional project and global roots are
// left absent in every fixture: DISC-2's conventional-root exemption skips an
// `ENOENT` root before classification, so each cell's diagnostic set is about
// its CLI or settings entry alone.

// ===========================================================================
// The registry rows (DIAG-4) — every expected message below is sourced from the
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

const MISSING_SOURCE = "theta/load/missing-source";
const UNREADABLE_SOURCE = "theta/load/unreadable-source";

// ===========================================================================
// Fixtures.
// ===========================================================================

const HOME = "/home/theta";
const CWD = "/project";

/** The directory every plain CLI component in this file points at. */
const T = "/opt/t";
/** A directory whose own NAME begins with `!` — the literal-path fixture. */
const BANG_DIR = "!/opt/lit";

/** A body that parses far enough to register (the walk only reads bytes). */
const THETA_BODY = "mode: prompt\n---\n";

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

/** `/opt/t` holding `a.theta`, with a complete POSIX ancestor chain so an
 *  `ENOENT` on a leaf under it is a CLEAN leaf. */
const BASE_DIRS: Record<string, readonly string[]> = {
  "/": ["opt"],
  "/opt": ["t"],
  [T]: ["a.theta"],
};
const BASE_FILES: Record<string, string> = { [`${T}/a.theta`]: THETA_BODY };

interface FakeSpec {
  readonly dirs?: Record<string, readonly string[]>;
  readonly files?: Record<string, string>;
  readonly errors?: Record<string, string>;
}

function build(spec: FakeSpec = {}): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: mergeDirs(BASE_DIRS, spec.dirs ?? {}),
    files: { ...BASE_FILES, ...(spec.files ?? {}) },
    errors: spec.errors ?? {},
  });
}

function cliInput(fs: FileSystem, cliPaths: readonly string[]): DiscoveryInput {
  return { fs, settings: {}, cliPaths };
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
 * The pin: an override-prefixed `--theta` component that names no path is
 * reported exactly once as `theta/load/missing-source`, `error`, with the
 * operand text verbatim in `file` and the registry-sourced message carrying the
 * `cli-flag:"--theta <operand>"` descriptor — and the `unreadable-source` code appears
 * nowhere for that path. The PRIMARY assertion quotes every observed diagnostic
 * so the red output names the code that arrives instead.
 */
function expectLiteralMissing(
  diagnostics: readonly Diagnostic[],
  file: string,
  descriptor: string,
  why: string,
): void {
  const hits = hitsFor(diagnostics, MISSING_SOURCE, file);
  expect(
    hits.length,
    `PRIMARY (bug 0078): ${why} — a leading \`!\`/\`+\`/\`-\` carries no override ` +
      `meaning for the CLI source, whose shared rule with settings entries is the ` +
      `file-vs-directory one alone (discovery-sources.md:33), so the operand is a ` +
      `literal path that does not exist and the CLI row's Missing cell applies ` +
      `(discovery-sources.md:58: error). DISC-2's clean-leaf ancestor walk ` +
      `(discovery-sources.md:68) is not consulted for such a component, because ` +
      `its relative prefixes are segments the operator never typed. ` +
      `Observed diagnostics=${JSON.stringify(diagnostics)}`,
  ).toBe(1);
  const diagnostic = hits[0]!;
  expect(
    diagnostic.severity,
    "the CLI `--theta <path>` row's Missing cell is an error " +
      "(discovery-sources.md:58, docs/reference/discovery-cli.md:53)",
  ).toBe("error");
  expect(
    diagnostic.message,
    "DIAG-4: the message is the registry row's Message column interpolated with " +
      "the source descriptor (discovery-sources.md:63)",
  ).toBe(interpolate(loadRowMessage(MISSING_SOURCE), { descriptor }));
  expect(
    hitsFor(diagnostics, UNREADABLE_SOURCE, file),
    `the operand names no path at all, so nothing about it is unreadable: ` +
      `\`theta/load/unreadable-source\` reports "a discovery source's path exists ` +
      `but cannot be read" (code-registry-load.md:48). ` +
      `Observed diagnostics=${JSON.stringify(diagnostics)}`,
  ).toHaveLength(0);
}

/** The mirror pin: an unreadable classification, reported once at the CLI row's
 *  error severity, with no `missing-source` for the same path. */
function expectUnreadable(
  diagnostics: readonly Diagnostic[],
  file: string,
  descriptor: string,
  why: string,
): void {
  const hits = hitsFor(diagnostics, UNREADABLE_SOURCE, file);
  expect(
    hits.length,
    `${why}. Observed diagnostics=${JSON.stringify(diagnostics)}`,
  ).toBe(1);
  const diagnostic = hits[0]!;
  expect(
    diagnostic.severity,
    "the CLI `--theta <path>` row's Unreadable cell is an error " +
      "(discovery-sources.md:58)",
  ).toBe("error");
  expect(
    diagnostic.message,
    "DIAG-4: the message is the registry row's Message column interpolated with " +
      "the source descriptor (discovery-sources.md:63)",
  ).toBe(interpolate(loadRowMessage(UNREADABLE_SOURCE), { descriptor }));
  expect(
    hitsFor(diagnostics, MISSING_SOURCE, file),
    "the path is not classified missing, so no missing-source is owed",
  ).toHaveLength(0);
}

// ===========================================================================
// Cells 1-3 — an override-prefixed `--theta` component naming no path
// (`discoverThetas`' CLI arm → `collectFromEntries` → `resolveEntry` →
// `classifyPath`, all in src/discovery/discovery-walk.ts).
// ===========================================================================

describe("an override-prefixed --theta component is a literal path whose absence is missing-source", () => {
  it("cell 0 (green control): the plain component alone registers its theta and the pass is silent", async () => {
    // Establishes the baseline every measurement cell adds one component to, so
    // a red below is about that component and not about the fixture.
    const { thetas, diagnostics } = await discoverThetas(cliInput(build(), [T]));

    expect(
      named(thetas, "a"),
      "`/opt/t` enumerates `a.theta` through the CLI source",
    ).toBeDefined();
    expect(diagnostics, "a resolvable CLI component emits nothing").toHaveLength(0);
  });

  it("cell 1 (RED): `!<dir>` emits one missing-source error naming the operand text, and the plain component's theta stays registered", async () => {
    const { thetas, diagnostics } = await discoverThetas(
      cliInput(build(), [T, `!${T}`]),
    );

    // The documented disposition, not a defect: the CLI source has no exclusion
    // grammar, so the plain component's selection is untouched
    // (discovery-sources.md:33 shares only the file-vs-directory rule; the
    // override grammar at package-and-settings.md:91 is the settings source's).
    expect(
      named(thetas, "a"),
      "a `!` component performs no exclusion for the CLI source, so `/opt/t`'s " +
        "theta stays registered (discovery-sources.md:64: a failing entry is " +
        "fatal for itself only)",
    ).toBeDefined();
    expectLiteralMissing(
      diagnostics,
      `!${T}`,
      `cli-flag:"--theta !${T}"`,
      "`!/opt/t` is a path whose first character is `!`",
    );
  });

  it("cell 2 (RED): `+<file>` emits one missing-source error naming the operand text", async () => {
    const operand = `+${T}/a.theta`;

    const { thetas, diagnostics } = await discoverThetas(cliInput(build(), [operand]));

    expect(
      thetas,
      "a `+` component force-includes nothing for the CLI source: it is a " +
        "literal path, and this one names no file",
    ).toHaveLength(0);
    expectLiteralMissing(
      diagnostics,
      operand,
      `cli-flag:"--theta ${operand}"`,
      "`+/opt/t/a.theta` is a path whose first character is `+`",
    );
  });

  it("cell 3 (RED): `-<dir>` emits one missing-source error naming the operand text, and the plain component's theta stays registered", async () => {
    const { thetas, diagnostics } = await discoverThetas(
      cliInput(build(), [T, `-${T}`]),
    );

    expect(
      named(thetas, "a"),
      "a `-` component force-excludes nothing for the CLI source",
    ).toBeDefined();
    expectLiteralMissing(
      diagnostics,
      `-${T}`,
      `cli-flag:"--theta -${T}"`,
      "`-/opt/t` is a path whose first character is `-`",
    );
  });
});

// ===========================================================================
// Cells 4-5 — DISC-2's clean-leaf-`ENOENT` ancestor walk for ORDINARY `--theta`
// components (`ancestorsClean` / `properAncestors`, consulted from
// `classifyPath`). Both green at HEAD: this is the behaviour cells 1-3 must not
// disturb.
// ===========================================================================

describe("DISC-2's ancestor walk stays in force for an ordinary --theta component", () => {
  it("cell 4 (green control): an absent component with an ABSENT ancestor is unreadable-source", async () => {
    // `/nope` is absent, so the ancestor chain of `/nope/deep/x.theta` is dirty
    // and discovery-sources.md:68's unreadable arm fires — the signal about a
    // directory the operator did type.
    const operand = "/nope/deep/x.theta";

    const { thetas, diagnostics } = await discoverThetas(cliInput(build(), [operand]));

    expect(thetas, "nothing registers from an absent component").toHaveLength(0);
    expectUnreadable(
      diagnostics,
      operand,
      `cli-flag:"--theta ${operand}"`,
      "an ordinary absolute component whose ancestor `/nope` is itself absent " +
        "classifies unreadable (discovery-sources.md:68), and the CLI row makes " +
        "it an error (:58)",
    );
  });

  it("cell 5 (green control): an absent component with CLEAN ancestors is missing-source", async () => {
    // Every proper ancestor of `/opt/t/absent.theta` — `/`, `/opt`, `/opt/t` —
    // `lstat`s as a directory, so the leaf is clean and classifies missing.
    const operand = `${T}/absent.theta`;

    const { thetas, diagnostics } = await discoverThetas(cliInput(build(), [operand]));

    expect(thetas, "nothing registers from an absent component").toHaveLength(0);
    expectLiteralMissing(
      diagnostics,
      operand,
      `cli-flag:"--theta ${operand}"`,
      "an ordinary absolute component under an entirely enterable chain is a " +
        "clean leaf-`ENOENT`",
    );
  });
});

// ===========================================================================
// Cells 6-7 — the two arms an override-prefixed component keeps: a path that
// EXISTS resolves literally, and a non-`ENOENT` rejection stays unreadable.
// Both green at HEAD.
// ===========================================================================

describe("an override-prefixed --theta component keeps literal-path semantics on every non-ENOENT arm", () => {
  it("cell 6 (green control): `!<dir>` whose path EXISTS registers its thetas with zero diagnostics", async () => {
    // A directory whose name begins with `!` is a legal path on POSIX and in the
    // seam, and taking the operand literally is exactly what lets it resolve.
    // This is the cell that would red if the prefix were instead rejected with a
    // dedicated code.
    const fs = build({
      dirs: { [BANG_DIR]: ["l.theta"] },
      files: { [`${BANG_DIR}/l.theta`]: THETA_BODY },
    });

    const { thetas, diagnostics } = await discoverThetas(cliInput(fs, [BANG_DIR]));

    const theta = named(thetas, "l");
    expect(
      theta,
      "the literal reading resolves `!/opt/lit` to the directory of that name, " +
        "which enumerates `l.theta`",
    ).toBeDefined();
    expect(theta?.path, "the registered path is the operand's own subtree").toBe(
      `${BANG_DIR}/l.theta`,
    );
    expect(
      diagnostics,
      `a resolvable component emits nothing whatever its first character. ` +
        `Observed diagnostics=${JSON.stringify(diagnostics)}`,
    ).toHaveLength(0);
  });

  it("cell 7 (green control): `!<dir>` whose lstat rejects EACCES is unreadable-source", async () => {
    // The path exists and cannot be read, which is precisely what
    // `theta/load/unreadable-source` reports (code-registry-load.md:48) — the
    // non-`ENOENT` arm of `classifyPath` is untouched by cells 1-3.
    const operand = `!${T}`;
    const fs = build({ errors: { [operand]: "EACCES" } });

    const { diagnostics } = await discoverThetas(cliInput(fs, [operand]));

    expectUnreadable(
      diagnostics,
      operand,
      `cli-flag:"--theta ${operand}"`,
      "an EACCES rejection on an override-prefixed component is a path that " +
        "exists and cannot be read (code-registry-load.md:48), so the unreadable " +
        "classification is the truthful one",
    );
  });
});

// ===========================================================================
// Cells 8-9 — the two neighbouring behaviours that stay exactly as they are:
// the CLI source expands no globs, and the settings source's DISC-5 grammar is
// untouched. Both green at HEAD.
// ===========================================================================

describe("the neighbouring dispositions are unchanged", () => {
  it("cell 8 (green control): a CLI glob operand names no path and is missing-source", async () => {
    // Glob expansion is the shell's job for this single-invocation source, so
    // `*.theta` reaching `discoverThetas` verbatim is a literal path that does
    // not exist. `isGlobPattern` exists in src/discovery/discovery-walk.ts and
    // is deliberately not consulted on this path.
    const operand = `${T}/*.theta`;

    const { thetas, diagnostics } = await discoverThetas(cliInput(build(), [operand]));

    expect(
      named(thetas, "a"),
      "the CLI source performs no glob expansion, so `a.theta` is not selected " +
        "by the pattern",
    ).toBeUndefined();
    expectLiteralMissing(
      diagnostics,
      operand,
      `cli-flag:"--theta ${operand}"`,
      "a glob operand's ancestors `/`, `/opt` and `/opt/t` all enumerate, so the " +
        "pattern text is a clean leaf-`ENOENT`",
    );
  });

  it("cell 9 (green control): settings `[\"<dir>\", \"!<dir>\"]` still excludes, with zero thetas and zero diagnostics", async () => {
    // DISC-5 (package-and-settings.md:91) lives on the settings source and stays
    // there: step 1 selects `/opt/t/a.theta`, step 2's `!` entry drops it, and
    // neither step reports anything.
    const { thetas, diagnostics } = await discoverThetas({
      fs: build(),
      settings: { thetaPaths: [T, `!${T}`], thetaPathsBaseDir: "/opt" },
    });

    expect(
      thetas,
      "the `!` entry drops the children the plain entry contributed",
    ).toHaveLength(0);
    expect(
      diagnostics,
      `an honoured settings exclusion is silent — the operand is a pattern, not ` +
        `a path to classify. Observed diagnostics=${JSON.stringify(diagnostics)}`,
    ).toHaveLength(0);
  });
});

// ===========================================================================
// Cells 10-12 — boundary hardening on `hasOverridePrefix` (src/discovery/
// discovery-walk.ts): the predicate reads the RAW operand's first character
// only, so it must fire on the shortest possible override-shaped operand and
// must NOT fire on an operand whose shape (leading `~`, a Windows drive
// letter) is unrelated to the DISC-5 prefix set `!`/`+`/`-`. All three are
// green at HEAD — they harden the predicate against a future edit that widens
// it (e.g. to any non-alphanumeric first character, which would wrongly catch
// neither of cells 11-12 here but could catch other punctuation-led paths).
// ===========================================================================

describe("hasOverridePrefix boundary cells: computed on the raw operand's first character alone", () => {
  it("cell 10 (green control): the bare operand `-` is missing-source, the shortest override-shaped operand", async () => {
    // `-` is a single relative segment, so `properAncestors` walks nothing —
    // its ancestor-collection loop never runs, leaving `ancestorsClean`
    // vacuously true. That makes the leaf classify `missing` under either
    // `EnoentPolicy` value, independent of what `hasOverridePrefix` reads on
    // this operand's lone character. This cell pins that vacuous-ancestor-
    // chain edge, not a discrimination of the override-prefix predicate.
    const { thetas, diagnostics } = await discoverThetas(cliInput(build(), ["-"]));

    expect(thetas, "a bare `-` names no path, so nothing registers").toHaveLength(0);
    expectLiteralMissing(
      diagnostics,
      "-",
      `cli-flag:"--theta -"`,
      "a bare `-` operand's first (and only) character is the override prefix `-`",
    );
  });

  it("cell 11 (green control): a `~`-prefixed operand keeps DISC-2's ancestor walk, proving the predicate reads the RAW text before `expandHome`", async () => {
    // `hasOverridePrefix` is called on `raw`, before `expandHome` — so a `~`
    // (never a DISC-5 prefix) keeps "ancestor-walk" policy regardless of what
    // the expansion produces. `/home/theta` is absent from every fixture dir
    // map in this file, so the expanded path's ancestor chain is dirty at
    // `/home`, and the walk's `unreadable` arm fires — the observable that
    // would NOT occur if the predicate (wrongly) matched on the EXPANDED path
    // or on some other shape than "first raw character": an `unreadable`
    // verdict here is possible only because the walk ran at all.
    const operand = "~/absent-dir/x.theta";
    const expanded = `${HOME}/absent-dir/x.theta`;

    const { thetas, diagnostics } = await discoverThetas(cliInput(build(), [operand]));

    expect(thetas, "the expanded path names no file").toHaveLength(0);
    expectUnreadable(
      diagnostics,
      expanded,
      `cli-flag:"--theta ${operand}"`,
      "a `~`-prefixed operand is not override-shaped, so DISC-2's ancestor walk " +
        "runs on the expanded path (discovery-sources.md:68); `/home` is absent " +
        "from this fixture, so the chain is dirty and the classification is " +
        "`unreadable`, not `missing`",
    );
  });

  it("cell 12 (green control): a Windows-drive-shaped operand keeps DISC-2's ancestor walk, undisturbed by the leading drive letter's colon", async () => {
    // `C` is not `!`/`+`/`-`, so `hasOverridePrefix` reads false and policy
    // stays "ancestor-walk". `properAncestors` (src/discovery/discovery-walk.ts)
    // climbs a drive-letter-absolute path from `C:/`; neither `C:/` nor
    // `C:/absent` is declared in any fixture dir map, so the chain is dirty at
    // the very first ancestor and the walk's `unreadable` arm fires — again an
    // outcome only reachable because the walk ran.
    const operand = "C:/absent/x.theta";

    const { thetas, diagnostics } = await discoverThetas(cliInput(build(), [operand]));

    expect(thetas, "the operand names no file").toHaveLength(0);
    expectUnreadable(
      diagnostics,
      operand,
      `cli-flag:"--theta ${operand}"`,
      "a Windows-drive-shaped operand is not override-shaped, so DISC-2's " +
        "ancestor walk runs (discovery-sources.md:68) and finds the drive-root " +
        "ancestor `C:/` absent, classifying `unreadable`, not `missing`",
    );
  });
});
