// V10a / V10a-T — the five-source discovery walk, source priority, per-source
// failure modes, and `~/` home expansion.
//
// This module owns the discovery union over the CLI, Settings, Project,
// Packages, and Global sources, mapping each discovered `*.theta` file to its
// slash name (the filename stem, taken verbatim) and emitting the load-phase
// diagnostics the failure-modes table and collision rules mandate.
//
// V10a-T (tests-task) declared the seam shape; the paired V10a implementation
// leaf supplies `discoverThetas`, and V10b extended `DiscoveryInput` with the
// package-source plumbing it owns.
//
// The path/filesystem-shape classification this walk relies on — POSIX path
// helpers, the DISC-2 clean-leaf-ENOENT ancestor walk, and the per-candidate
// `lstat`/`realpath` outcome classification `classifyPath` drives — lives in
// `discovery-path-classify.ts` and is imported back in below.
//
// The per-source candidate enumeration and classification — collecting a
// directory's `*.theta` candidates, resolving one source entry (a directory
// root or an explicit `.theta` file) into raw candidates, and the bug 0363
// on-disk-entry lookup an explicit file reference needs — `RawCandidate`,
// `enumerateDirectory`, `isCanonicalDuplicate`, `onDiskFileCandidate`,
// `resolveEntry`, `classifyForSource`, `emitSourceFailure` — live in
// `discovery-source-enumerate.ts` (PTQ-0367, pre-announced by PTQ-0333 as
// "concern 1") and are imported back in below.
//
// The slash-name-validity gate and the cross-source-shadow /
// cross-format-collision resolution (the theta always loses, asymmetrically)
// — `sourceLabelOf`, `resolveBySource`, `validateAndRead`, `resolveSlashNames`
// — live in `discovery-collision-resolve.ts` (PTQ-0333, pre-announced by
// PTQ-0305's Seam 0 as "concern 5") and are imported back in below.
//
// The discovery-wide types (`DiscoverySource`, `PiOwnedCommand`,
// `DiscoveryInput`, `DiscoveredTheta`, `DiscoveryResult`), the `theta/load/*`
// diagnostic codes, the failure-mode tables, and the per-source
// `SourcedCandidate` shape this walk implements against — `FailureModes`,
// `CONVENTIONAL_MODES`, `SETTINGS_MODES`, `CLI_MODES`, `SourcedCandidate` —
// live in `discovery-model.ts` (PTQ-0305's Seam 0, the leaf every concern
// here depends on) and are imported back in below; every name this file
// exported before that split is still exported from here.
//
// Spec: discovery.md, discovery/discovery-sources.md (DISC-1…DISC-4), with the
// `theta/load/*` diagnostic codes/messages sourced from
// diagnostics/code-registry-load.md.

import { minimatch } from "minimatch";
import type { Diagnostic, Severity } from "../diagnostics/diagnostic";
import type { FileSystem } from "../seams/file-system";
import type { ThetaSettings } from "./settings";
import {
  basename,
  classifyPath,
  dirnameOf,
  expandHome,
  hasOverridePrefix,
  isAbsolutePath,
  isGlobPattern,
  joinPosix,
  lstatOutcome,
  normalizePath,
  relativeToBase,
  splitExtension,
  walkTree,
  type EnoentPolicy,
} from "./discovery-path-classify";
import {
  INVALID_EXTENSION,
  MISSING_SOURCE,
  SETTINGS_MODES,
  UNREADABLE_SOURCE,
  type DiscoveryInput,
  type DiscoveryResult,
  type DiscoverySource,
  type SourcedCandidate,
} from "./discovery-model";
import {
  resolveBySource,
  resolveSlashNames,
  sourceLabelOf,
  validateAndRead,
} from "./discovery-collision-resolve";
import {
  emitSourceFailure,
  enumerateDirectory,
  onDiskFileCandidate,
  resolveEntry,
  type RawCandidate,
} from "./discovery-source-enumerate";
export type {
  DiscoveredTheta,
  DiscoveryInput,
  DiscoveryResult,
  DiscoverySource,
  PiOwnedCommand,
} from "./discovery-model";

// --------------------------------------------------------------------------
// Settings `thetaPaths` resolution (package-and-settings.md §"`thetaPaths` entry schema").
//
// Unlike the CLI / conventional sources (whose entries are single directory
// roots or explicit `.theta` files), settings entries resolve relative to the
// settings-file directory, support globs, and carry the `!`/`+`/`-` override
// grammar of DISC-5 (the same fixed order the package `pi.theta` path uses:
// plain includes → `!` drops → `+` re-admits an exact path → `-` removes an
// exact path). A non-`.theta` file match is a `theta/load/invalid-extension`
// error (not `wrong-type-source`); a directory expands non-recursively; a
// literal path that is missing / unreadable / a non-regular type still carries
// the per-entry-index failure diagnostic of the failure-modes table.
// --------------------------------------------------------------------------

/** One recursively-enumerated filesystem entry (the universe a glob matches). */
interface TreeEntry {
  readonly abs: string;
  readonly base: string;
  readonly isDir: boolean;
  readonly isFile: boolean;
}

/** One glob-universe enumeration: the entries found, plus the paths whose own
 *  enumeration failed reportably. A shrunken universe is a well-formed value,
 *  so the failures travel out with it — the walk observes the rejection but
 *  only the caller knows which `thetaPaths` entry's universe it shrank
 *  (discovery-sources.md:73 wants that entry's descriptor). */
interface TreeWalk {
  readonly entries: TreeEntry[];
  /** Directories that exist and could not be enumerated, plus any entry a
   *  directory's `readdir` named whose own `lstat` rejected with a code other
   *  than `ENOENT`. A clean-leaf `ENOENT` is absent instead: there the pattern
   *  resolves to no path, which package-and-settings.md:29 keeps silent. */
  readonly unreadable: string[];
}

/** Recursively enumerate every file/dir under `root` (symlinks not followed);
 *  the universe glob patterns are matched against. A failure to enumerate any
 *  directory in that walk — the static-prefix root itself or a subtree below
 *  it — or to `lstat` an entry that walk enumerated, is a traversal failure
 *  inside a root that exists, an unreadable source and not silence
 *  (discovery-sources.md:73), so the rejection is classified by the :72
 *  clean-leaf rule and carried out rather than dropped. Delegates to the
 *  shared `walkTree` helper (PTQ-0287) with the `"ancestor-walk"` ENOENT
 *  policy: this walk's root is a settings glob's static-prefix directory, not
 *  pre-proven to exist, so a directory-level `ENOENT` needs the clean-leaf
 *  check rather than being assumed clean. */
async function listTree(fs: FileSystem, root: string): Promise<TreeWalk> {
  const walk = await walkTree(fs, root, "ancestor-walk", (abs, base, isDir, isFile) => ({
    abs,
    base,
    isDir,
    isFile,
  }));
  return walk;
}

/** Report each glob-universe traversal failure at the source's *Unreadable
 *  path* severity, once the pass's per-match reports are in. A path a
 *  per-match enumeration already reported is left to that report:
 *  discovery-sources.md:73 pairs one offending path with one descriptor, and
 *  the universe walk is the coarser observer of the same rejection — with
 *  pattern `g/*` both walks cross the denied directory, and the author is owed
 *  one diagnostic for it, not two. */
function emitUniverseFailures(
  failures: ReadonlyMap<string, string>,
  severity: Severity,
  diagnostics: Diagnostic[],
): void {
  for (const [path, descriptorValue] of failures) {
    const file = normalizePath(path);
    const alreadyReported = diagnostics.some(
      (diagnostic) =>
        diagnostic.file === file &&
        (diagnostic.code === UNREADABLE_SOURCE || diagnostic.code === MISSING_SOURCE),
    );
    if (alreadyReported) continue;
    emitSourceFailure(severity, "settings", descriptorValue, path, diagnostics, "unreadable");
  }
}

/** The longest leading path segment run containing no glob metacharacter — the
 *  directory to root the universe enumeration at. */
function staticPrefixRoot(absPattern: string): string {
  const segs = normalizePath(absPattern).split("/");
  const out: string[] = [];
  for (const seg of segs) {
    if (isGlobPattern(seg)) break;
    out.push(seg);
  }
  const joined = out.join("/");
  return joined === "" ? "/" : joined;
}

/** Match a universe entry against a settings `thetaPaths` glob entry,
 *  attempting DISC-5's three comparison strings — "the candidate's
 *  package-root-relative path, its basename, and its POSIX-normalised
 *  absolute path" — with `nocase: false` throughout. `entry.abs` and
 *  `entry.base` are matched against `absPattern` (the resolved, absolute
 *  pattern); the root-relative comparison is matched against `rawPattern`
 *  (the un-resolved operand text) instead, because the settings source's root
 *  is the settings-file directory rather than a package root — `absPattern`
 *  has already absorbed that directory and can only ever match the
 *  absolute-path comparison, never a root-relative one. Mirrors
 *  `matchesGlob` (package-discovery.ts), the DISC-5 sibling for `pi.theta`. */
function globMatches(
  entry: TreeEntry,
  absPattern: string,
  rawPattern: string,
  baseDir: string | undefined,
): boolean {
  const rel = relativeToBase(baseDir, entry.abs);
  return (
    minimatch(entry.abs, absPattern, { nocase: false }) ||
    minimatch(entry.base, absPattern, { nocase: false }) ||
    (rel !== undefined && minimatch(rel, rawPattern, { nocase: false }))
  );
}

/** Reconstruct a `TreeEntry` view of a `selected`-map key so the `!` step
 *  (in `resolveSettingsSource`) can call `globMatches` instead of re-inlining
 *  its comparisons. `isDir`/`isFile` are hard-coded because the predicate
 *  reads only `abs`/`base`, which the absolute-path key alone carries.
 *  `selected` admits a key by its `.theta` name, not its file type —
 *  `enumerateDirectory` classifies by extension with no `lstat` — so a
 *  non-regular entry so named is admitted here and rejected only later, at
 *  `validateAndRead`; the type flags are therefore not guaranteed by the map
 *  and are deliberately unread at this call site. */
function fileEntryOf(abs: string): TreeEntry {
  return { abs, base: basename(abs), isDir: false, isFile: true };
}

/** One parsed `thetaPaths` entry: its array index, override prefix, the
 *  operand resolved to an absolute POSIX path, and the operand's un-resolved
 *  text. The root-relative comparison in `globMatches` needs the pattern
 *  exactly as written in `operand` — the resolved `abs` form has already
 *  absorbed the settings-base directory and can only ever match an absolute
 *  path. */
interface ParsedSettingsEntry {
  readonly index: number;
  readonly prefix: "" | "!" | "+" | "-";
  readonly abs: string;
  readonly glob: boolean;
  readonly operand: string;
  /** The entry's own array text, verbatim (prefix included) — the descriptor
   *  VALUE this entry's candidates carry (placeholder-rendering-b.md §5: "the
   *  settings entry"). Distinct from `operand`, which is prefix-stripped for
   *  the override-grammar comparisons. */
  readonly raw: string;
}

/** Resolve one raw operand to an absolute POSIX path: a bare `~` / `~/…`
 *  expands via the seam (DISC-1), an absolute path normalises as-is, and a
 *  relative entry joins the settings-file directory (`baseDir`). When no base
 *  dir is known (settings supplied without an origin) a relative entry is taken
 *  verbatim. */
function resolveSettingsOperand(
  operand: string,
  baseDir: string | undefined,
  fs: FileSystem,
): string {
  const expanded = expandHome(operand, fs);
  if (isAbsolutePath(expanded) || expanded.startsWith("~")) {
    return normalizePath(expanded);
  }
  if (baseDir !== undefined) {
    return normalizePath(joinPosix(baseDir, expanded));
  }
  return normalizePath(expanded);
}

/**
 * Resolve the Settings source's `thetaPaths` into raw `.theta` candidates,
 * applying the DISC-5 override order and the `thetaPaths` entry schema. Returns
 * candidates deduplicated by resolved absolute path; per-entry failures are
 * non-fatal.
 */
async function resolveSettingsSource(
  fs: FileSystem,
  settings: ThetaSettings,
  diagnostics: Diagnostic[],
  roots: Set<string>,
): Promise<(RawCandidate & { readonly descriptorValue: string })[]> {
  const entries = settings.thetaPaths ?? [];
  if (entries.length === 0) {
    return [];
  }
  const baseDir = settings.thetaPathsBaseDir;

  const parsed: ParsedSettingsEntry[] = entries.map((raw, index) => {
    const first = raw[0];
    const prefix = first === "!" || first === "+" || first === "-" ? first : "";
    const operand = prefix === "" ? raw : raw.slice(1);
    return {
      index,
      prefix,
      abs: resolveSettingsOperand(operand, baseDir, fs),
      glob: isGlobPattern(operand),
      operand,
      raw,
    };
  });

  // `selected` is keyed by the candidate `.theta` file's absolute path (dedup by
  // resolved absolute path); dir entries have already been expanded to files.
  // Each stored candidate also carries the descriptor VALUE of the entry that
  // selected it (placeholder-rendering-b.md §5) alongside the on-disk answer.
  const selected = new Map<string, RawCandidate & { readonly descriptorValue: string }>();
  const treeCache = new Map<string, TreeWalk>();
  // A universe failure is attributed to the entry whose glob first triggered
  // the walk that observed it: `treeCache` shares one universe across every
  // entry with the same static prefix, so at the point of observation no single
  // index owns the rejection, and the first (lowest-index) consumer is the
  // deterministic choice. Maps path → the owning entry's descriptor VALUE
  // (`entry.raw`), rendered into the normative `<kind>:"<value>"` form at
  // `emitUniverseFailures` (placeholder-rendering-b.md §5).
  const universeFailures = new Map<string, string>();
  const treeFor = async (root: string, descriptorValue: string): Promise<TreeEntry[]> => {
    const cached = treeCache.get(root);
    if (cached !== undefined) return cached.entries;
    const tree = await listTree(fs, root);
    treeCache.set(root, tree);
    for (const path of tree.unreadable) {
      if (!universeFailures.has(path)) universeFailures.set(path, descriptorValue);
    }
    return tree.entries;
  };

  const addDir = async (dir: string, descriptorValue: string): Promise<void> => {
    roots.add(normalizePath(dir));
    for (const cand of await enumerateDirectory(fs, dir, "settings", descriptorValue, diagnostics)) {
      selected.set(cand.path, { ...cand, descriptorValue });
    }
  };
  const addFile = async (absPath: string, index: number, descriptorValue: string): Promise<void> => {
    // A file match must end in `.theta` (byte-exact lowercase); anything else is
    // an `invalid-extension` error, reported per match, and does not register.
    // This check stays over the ENTRY text `absPath` (Lexical §Extension matching):
    // extension validity is about what the operator wrote, not the on-disk name.
    if (splitExtension(basename(absPath)).ext !== "theta") {
      diagnostics.push({
        severity: "error",
        code: INVALID_EXTENSION,
        file: absPath,
        message: `'thetaPaths[${index}]' resolves to '${absPath}' which does not end in .theta`,
      });
      return;
    }
    roots.add(dirnameOf(absPath));
    // Keyed by the entry-spelled `absPath` (not the on-disk path) so the DISC-5
    // `!`/`-` drop operands, which compare against `entry.abs`, still match this
    // entry; only the stored candidate's path/stem carry the on-disk answer
    // (bug 0363).
    selected.set(absPath, { ...(await onDiskFileCandidate(fs, absPath)), descriptorValue });
  };

  // A literal (non-glob) entry classifies directly, preserving the per-entry
  // missing / unreadable / wrong-type failure diagnostics of the DISC-2 table.
  const addLiteral = async (entry: ParsedSettingsEntry): Promise<void> => {
    // The settings source implements DISC-5's own grammar (its prefix parse
    // above already stripped the override character), so an ENOENT here is
    // about ancestor directories the operator actually wrote into the entry.
    const cls = await classifyPath(fs, entry.abs, "ancestor-walk");
    switch (cls.kind) {
      case "dir":
        await addDir(entry.abs, entry.raw);
        return;
      case "file":
        await addFile(entry.abs, entry.index, entry.raw);
        return;
      case "missing":
        emitSourceFailure(SETTINGS_MODES.missing, "settings", entry.raw, entry.abs, diagnostics, "missing");
        return;
      case "unreadable":
        emitSourceFailure(SETTINGS_MODES.unreadable, "settings", entry.raw, entry.abs, diagnostics, "unreadable");
        return;
      case "wrong-type":
        emitSourceFailure(SETTINGS_MODES.wrongType, "settings", entry.raw, entry.abs, diagnostics, "wrong-type");
        return;
    }
  };

  // A glob entry enumerates the universe under its static-prefix root and
  // contributes per match (file → register, dir → non-recursive scan).
  const addGlob = async (entry: ParsedSettingsEntry): Promise<void> => {
    const tree = await treeFor(staticPrefixRoot(entry.abs), entry.raw);
    for (const universeEntry of tree) {
      if (!globMatches(universeEntry, entry.abs, entry.operand, baseDir)) continue;
      if (universeEntry.isDir) {
        await addDir(universeEntry.abs, entry.raw);
      } else if (universeEntry.isFile) {
        await addFile(universeEntry.abs, entry.index, entry.raw);
      }
    }
  };

  // Fixed DISC-5 override order: (1) plain includes select the starting set.
  for (const entry of parsed) {
    if (entry.prefix !== "") continue;
    if (entry.glob) await addGlob(entry);
    else await addLiteral(entry);
  }
  // (2) `!` patterns drop selected candidates (glob → pattern match; literal →
  // the exact path, or a directory whose children were contributed).
  for (const entry of parsed) {
    if (entry.prefix !== "!") continue;
    for (const key of [...selected.keys()]) {
      const drop = entry.glob
        ? globMatches(fileEntryOf(key), entry.abs, entry.operand, baseDir)
        : key === entry.abs || dirnameOf(key) === entry.abs;
      if (drop) selected.delete(key);
    }
  }
  // (3) `+` operands re-admit an exact path (classified like a plain literal).
  for (const entry of parsed) {
    if (entry.prefix !== "+") continue;
    await addLiteral(entry);
  }
  // (4) `-` operands remove an exact path (or a directory's contributed
  // children), taking final precedence.
  for (const entry of parsed) {
    if (entry.prefix !== "-") continue;
    for (const key of [...selected.keys()]) {
      if (key === entry.abs || dirnameOf(key) === entry.abs) selected.delete(key);
    }
  }

  emitUniverseFailures(universeFailures, SETTINGS_MODES.unreadable, diagnostics);

  return [...selected.values()];
}

/**
 * Walk the five discovery sources — CLI, Settings, Project, Packages (the
 * candidates the composition's own bounded scan pushes in as
 * `input.packageCandidates`), and Global — resolve priority and collisions, and
 * return the registrable thetas plus the load-phase diagnostics.
 */
export async function discoverThetas(input: DiscoveryInput): Promise<DiscoveryResult> {
  const { fs } = input;
  const diagnostics: Diagnostic[] = [];
  const candidates: SourcedCandidate[] = [];
  // The resolved discovery-root union over this walk's four sources
  // (cli/settings/project/global): threaded (not module-scope)
  // through every choke point that confirms a source DIRECTORY present, or
  // resolves an explicit file's parent, so a present-but-empty root (a
  // scaffolded `.pi/theta/` with no `.theta` yet) still lands in the set the
  // watcher is armed over (bug 0310).
  const roots = new Set<string>();

  // CLI (priority 1) — explicit user intent: every failure mode is an error.
  const cliPaths = input.cliPaths ?? [];
  await collectFromEntries(
    fs,
    cliPaths.map((raw, index) => ({
      path: expandHome(raw, fs),
      descriptor: `--theta flag #${index + 1}`,
      // Computed from the RAW operand, before `expandHome`: the DISC-5 prefix
      // question is about what the operator typed, and `~` expansion cannot
      // itself introduce or remove a leading `!`/`+`/`-`.
      enoentPolicy: hasOverridePrefix(raw) ? ("missing" as const) : ("ancestor-walk" as const),
      // The cli-flag descriptor VALUE is the raw operand as passed — verbatim,
      // no `expandHome`/`normalizePath` (placeholder-rendering-b.md §5).
      descriptorValue: `--theta ${raw}`,
    })),
    "cli",
    candidates,
    diagnostics,
    roots,
  );

  // Settings (priority 2) — explicit references resolved per the
  // `thetaPaths` entry schema: relative to the settings-file dir, with globs and
  // the `!`/`+`/`-` override grammar; missing/wrong-type are errors.
  const settingsSourceLabel = sourceLabelOf("settings");
  for (const candidate of await resolveSettingsSource(fs, input.settings, diagnostics, roots)) {
    candidates.push({ ...candidate, source: "settings", sourceLabel: settingsSourceLabel });
  }

  // Project (priority 3) — conventional `<config-dir>/theta/`; silent when
  // absent. The config-dir name is the HOST's (`.pi` on Pi, `.omp` on
  // Oh-My-Pi), read through the seam so the root and the descriptor that names
  // it in diagnostics both point at the directory the running host actually
  // conventions. Reconstructing the PROJECT directory from the bare name is
  // exact: both hosts build it from the same static constant.
  //
  // The GLOBAL root is not reconstructible that way, so it hangs off the host's
  // own resolved global agent directory instead (`globalAgentDir()`): Pi
  // relocates that with `PI_CODING_AGENT_DIR`, Oh-My-Pi with an active profile
  // or `PI_CONFIG_DIR`, and a synthesised `<homedir>/<config-dir>/agent/theta`
  // would then be an absent directory — which this walk skips SILENTLY, so
  // every global theta would vanish with no diagnostic at all.
  const configDir = fs.configDirName();
  const conventionalRoots: readonly {
    readonly source: Exclude<DiscoverySource, "package">;
    readonly path: string;
  }[] = [
    {
      source: "project" as const,
      path: joinPosix(fs.cwd(), `${configDir}/theta`),
    },
    {
      source: "global" as const,
      path: joinPosix(fs.globalAgentDir(), "theta"),
    },
  ];
  for (const root of conventionalRoots) {
    // A conventional root is OPTIONAL: `CONVENTIONAL_MODES.missing === null`
    // promises that absence contributes nothing and says nothing. Skipping an
    // absent root BEFORE classification is what keeps that promise, because
    // DISC-2's clean-leaf-ENOENT rule (`classifyPath`) downgrades an absent
    // path to `unreadable` — a WARNING — as soon as a proper ancestor is
    // absent too. For a conventional root that ancestor is the host config
    // directory itself, and "the config directory does not exist either" is
    // the most ordinary form of "not present": on a host that never creates
    // that directory it is the universal case, so every session in every
    // workspace would carry two spurious `unreadable-source` warnings.
    //
    // Only ENOENT is skipped. A root that EXISTS but cannot be read (EACCES /
    // EPERM) still reaches the classifier and still warns — that is a real
    // problem an operator needs told about, and it is what `unreadable`
    // means. DISC-2's clean-leaf distinction is untouched for the settings
    // source and every ordinary (non-override-prefixed) CLI component, where
    // an absent intermediate directory is a genuine signal about a path the
    // user typed; an override-prefixed CLI component skips that walk instead
    // (see `EnoentPolicy`).
    const probe = await lstatOutcome(fs, root.path);
    if (!probe.ok && probe.code === "ENOENT") {
      continue;
    }
    if (probe.ok && probe.isDir) {
      // A conventional root that EXISTS as a directory is an active root per
      // discovery-sources.md regardless of whether it currently holds a
      // `.theta` — the file-derived set below drops an empty one, so this guard
      // records the root's presence even when it holds no `.theta` (bug 0310); a
      // non-empty root is also recorded by `resolveEntry`'s `case "dir"` and the
      // Set dedups.
      roots.add(normalizePath(root.path));
    }
    await collectFromEntries(
      fs,
      [
        {
          path: root.path,
          enoentPolicy: "ancestor-walk",
          // No operator-typed source text for a conventional root: the
          // descriptor VALUE is the root's own resolved directory path,
          // 0268 forward-slashed (placeholder-rendering-b.md §5).
          descriptorValue: normalizePath(root.path),
        },
      ],
      root.source,
      candidates,
      diagnostics,
      roots,
    );
  }

  // Package (priority 4) — the candidates the composition's own bounded scan
  // already resolved, pushed in as ordinary SourcedCandidates so the same
  // adjudication chain below covers them (V10b: Option 1, route through walk).
  const packageSourceLabel = sourceLabelOf("package");
  for (const pc of input.packageCandidates ?? []) {
    candidates.push({
      path: pc.path,
      stem: pc.stem,
      source: "package",
      sourceLabel: packageSourceLabel,
      descriptorValue: pc.descriptorValue,
    });
  }

  // Per-source case-collision, then slash-name validity + per-file readability,
  // then cross-source/format collision resolution over the survivors.
  const caseResolved = resolveBySource(candidates, diagnostics);
  const valid = validateAndRead(fs, caseResolved, diagnostics);
  const thetas = await resolveSlashNames(
    await valid,
    input.piOwnedNames ?? [],
    diagnostics,
    input.markedRoot,
  );

  return { thetas, diagnostics, roots: [...roots] };
}

async function collectFromEntries(
  fs: FileSystem,
  entries: readonly {
    readonly path: string;
    /** Present only on an EXPLICIT file entry (CLI `--theta` / settings
     *  `thetaPaths`), whose `invalid-extension` diagnostic names it; a
     *  conventional root is directory-only and carries none. */
    readonly descriptor?: string;
    readonly enoentPolicy: EnoentPolicy;
    readonly descriptorValue: string;
  }[],
  source: Exclude<DiscoverySource, "package">,
  out: SourcedCandidate[],
  diagnostics: Diagnostic[],
  roots: Set<string>,
): Promise<void> {
  const sourceLabel = sourceLabelOf(source);
  for (const entry of entries) {
    const raw = await resolveEntry(
      fs,
      entry.path,
      entry.descriptor,
      source,
      entry.descriptorValue,
      entry.enoentPolicy,
      diagnostics,
      roots,
    );
    for (const candidate of raw) {
      out.push({ ...candidate, source, sourceLabel, descriptorValue: entry.descriptorValue });
    }
  }
}
