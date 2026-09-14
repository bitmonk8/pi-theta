// V10a / V10a-T — the five-source discovery walk, source priority, per-source
// failure modes, `~/` home expansion, slash-name validity, and the
// cross-source-shadow / cross-format-collision resolution (the theta always
// loses, asymmetrically).
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
// The discovery-wide types (`DiscoverySource`, `PiOwnedCommand`,
// `DiscoveryInput`, `DiscoveredTheta`, `DiscoveryResult`), the `theta/load/*`
// diagnostic codes, and the priority / failure-mode / slash-name tables this
// walk implements against — `PRIORITY`, `FailureModes`, `CONVENTIONAL_MODES`,
// `SETTINGS_MODES`, `CLI_MODES`, `SLASH_NAME` — live in `discovery-model.ts`
// (PTQ-0305's Seam 0, the leaf every concern here depends on) and are
// imported back in below; every name this file exported before that split is
// still exported from here.
//
// Spec: discovery.md, discovery/discovery-sources.md (DISC-1…DISC-4), with the
// `theta/load/*` diagnostic codes/messages sourced from
// diagnostics/code-registry-load.md.

import { minimatch } from "minimatch";
import type { Diagnostic, Severity } from "../diagnostics/diagnostic";
import type { FileSystem } from "../seams/file-system";
import type { ThetaSettings } from "./settings";
import { nodeErrorCode } from "./node-error-code";
import {
  ancestorsClean,
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
  realpathOr,
  relativeToBase,
  renderSourceDescriptor,
  splitExtension,
  walkTree,
  type EnoentPolicy,
  type PathClass,
} from "./discovery-path-classify";
import {
  CASE_COLLISION,
  CLI_MODES,
  CONVENTIONAL_MODES,
  CROSS_FORMAT_COLLISION,
  CROSS_SOURCE_SHADOW,
  INVALID_EXTENSION,
  INVALID_SLASH_NAME,
  MISSING_SOURCE,
  NON_CANONICAL_EXTENSION,
  PRIORITY,
  SETTINGS_MODES,
  SLASH_NAME,
  UNREADABLE_FILE,
  UNREADABLE_SOURCE,
  WRONG_TYPE_SOURCE,
  type DiscoveredTheta,
  type DiscoveryInput,
  type DiscoveryResult,
  type DiscoverySource,
  type FailureModes,
  type PiOwnedCommand,
} from "./discovery-model";
export type {
  DiscoveredTheta,
  DiscoveryInput,
  DiscoveryResult,
  DiscoverySource,
  PiOwnedCommand,
} from "./discovery-model";

/** A `*.theta` file found under a source, before validity/collision resolution. */
interface RawCandidate {
  readonly path: string;
  readonly stem: string;
}

/** Enumerate one directory: collect byte-exact `*.theta` candidates and emit
 *  per-directory `non-canonical-extension` warnings (DISC-3). A root
 *  `classifyPath` already accepted as a directory whose enumeration then
 *  fails is an unreadable (or, on a clean `ENOENT` ancestor chain, missing)
 *  source, not silence (discovery-sources.md:66-67) — the calling source's
 *  descriptor and severities are threaded through so the failure emits from
 *  the one place the rejection is observed. */
async function enumerateDirectory(
  fs: FileSystem,
  dir: string,
  source: DiscoverySource,
  descriptorValue: string,
  modes: FailureModes,
  diagnostics: Diagnostic[],
): Promise<RawCandidate[]> {
  const entries = await fs.readdir(dir).then(
    (names) => ({ ok: true as const, names }),
    (error: unknown) => ({ ok: false as const, code: nodeErrorCode(error) }),
  );
  if (!entries.ok) {
    if (entries.code === "ENOENT" && (await ancestorsClean(fs, dir))) {
      emitSourceFailure(modes.missing, MISSING_SOURCE, source, descriptorValue, dir, diagnostics, "missing");
    } else {
      emitSourceFailure(modes.unreadable, UNREADABLE_SOURCE, source, descriptorValue, dir, diagnostics, "unreadable");
    }
    return [];
  }
  const candidates: RawCandidate[] = [];
  const canonicalNames = new Set<string>();
  for (const name of entries.names) {
    const { ext } = splitExtension(name);
    if (ext === "theta" || ext === "thetalib") {
      canonicalNames.add(name);
    }
  }
  for (const name of entries.names) {
    const { stem, ext } = splitExtension(name);
    const lower = ext.toLowerCase();
    const full = joinPosix(dir, name);
    if (ext === "theta") {
      candidates.push({ path: full, stem });
      continue;
    }
    if (ext === "thetalib") {
      // Library file — importable, never a slash command; not discovered.
      continue;
    }
    if ((lower === "theta" || lower === "thetalib") && SLASH_NAME.test(stem)) {
      // Case-variant extension on a valid stem → non-canonical warning, unless
      // it deduplicates against a byte-exact canonical sibling (case-insensitive
      // filesystems surface one entry under two spellings) via `realpath`.
      if (await isCanonicalDuplicate(fs, full, dir, canonicalNames)) {
        continue;
      }
      diagnostics.push({
        severity: "warning",
        code: NON_CANONICAL_EXTENSION,
        file: full,
        message: `file '${full}' has non-canonical extension case; rename to lowercase '.theta' or '.thetalib'`,
      });
    }
  }
  return candidates;
}

/** True when `nonCanonicalPath` resolves (via `realpath`) to the same canonical
 *  path as some byte-exact `.theta`/`.thetalib` sibling in `dir`. */
async function isCanonicalDuplicate(
  fs: FileSystem,
  nonCanonicalPath: string,
  dir: string,
  canonicalNames: ReadonlySet<string>,
): Promise<boolean> {
  if (canonicalNames.size === 0) {
    return false;
  }
  const target = await realpathOr(fs, nonCanonicalPath);
  if (target === undefined) {
    return false;
  }
  for (const name of canonicalNames) {
    const sibling = await realpathOr(fs, joinPosix(dir, name));
    if (sibling !== undefined && sibling === target) {
      return true;
    }
  }
  return false;
}

/** Bug 0363: for an EXPLICIT file reference (a CLI `--theta` component or a
 *  settings `thetaPaths` literal/glob match) the slash name and candidate path
 *  must come from the ON-DISK directory entry, not the reference's own
 *  spelling. A case-insensitive host resolves a case-variant reference to the
 *  real file, and DISC-3 Filename validity pins the slash name to that file's
 *  own stem taken verbatim — so `Plan.theta` reached via `plan.theta` is judged
 *  on `Plan` (refused) and `good.theta` reached via `GOOD.theta` registers
 *  `/good`. `readdir` the parent and take the entry the filesystem resolved: a
 *  byte-exact name wins (a case-sensitive host can hold `good.theta` and
 *  `GOOD.theta` as distinct entries, and the reference named exactly one), else
 *  the case-insensitive host's unique fold answers. This makes the explicit-file
 *  arm consistent with the enumeration arm (`enumerateDirectory`, whose
 *  candidates already carry `readdir` names). When the parent cannot be
 *  enumerated the reference spelling is the best available answer —
 *  classification already proved a file is present, so this is not the common
 *  path. */
async function onDiskFileCandidate(fs: FileSystem, path: string): Promise<RawCandidate> {
  const norm = normalizePath(path);
  const dir = dirnameOf(norm);
  const wanted = basename(norm);
  const wantedLower = wanted.toLowerCase();
  // A bare `X:` drive spec is drive-RELATIVE on Windows (the cwd on that drive);
  // the drive root is `X:/`, so enumerate that form while the returned candidate
  // path still joins the bare `dir` (paths stay `C:/plan.theta`, never `C://`).
  const dirForReaddir = /^[A-Za-z]:$/.test(dir) ? `${dir}/` : dir;
  const names = await fs.readdir(dirForReaddir).then(
    (entries) => entries,
    () => undefined,
  );
  if (names !== undefined) {
    let folded: string | undefined;
    for (const name of names) {
      if (name === wanted) {
        return { path: joinPosix(dir, name), stem: splitExtension(name).stem };
      }
      if (folded === undefined && name.toLowerCase() === wantedLower) {
        folded = name;
      }
    }
    if (folded !== undefined) {
      return { path: joinPosix(dir, folded), stem: splitExtension(folded).stem };
    }
  }
  return { path: norm, stem: splitExtension(wanted).stem };
}

/** Resolve one source entry (a directory root, or a single `.theta` file) into
 *  raw candidates, emitting the per-source failure diagnostic on any miss.
 *  `descriptor` names an EXPLICIT file entry (CLI `--theta` / settings
 *  `thetaPaths`) for the `invalid-extension` message; a conventional root is
 *  directory-only, never routes to that arm, and so carries none. */
async function resolveEntry(
  fs: FileSystem,
  path: string,
  descriptor: string | undefined,
  source: DiscoverySource,
  descriptorValue: string,
  modes: FailureModes,
  explicitFile: boolean,
  enoentPolicy: EnoentPolicy,
  diagnostics: Diagnostic[],
  roots: Set<string>,
): Promise<RawCandidate[]> {
  const resolved = classifyForSource(await classifyPath(fs, path, enoentPolicy), path, explicitFile);
  switch (resolved.kind) {
    case "dir":
      roots.add(normalizePath(path));
      return enumerateDirectory(fs, path, source, descriptorValue, modes, diagnostics);
    case "file":
      // A single `.theta` file entry contributes itself directly. Bug 0363: the
      // slash name and candidate path come from the ON-DISK directory entry,
      // not this reference's own spelling.
      roots.add(dirnameOf(normalizePath(path)));
      return [await onDiskFileCandidate(fs, path)];
    case "invalid-extension":
      // An explicit file reference (CLI `--theta` / settings `thetaPaths`) that
      // resolves to a non-`.theta` regular file is an `invalid-extension` error
      // per Lexical §"Extension matching" — the settings/CLI extension check —
      // not `wrong-type-source`. The file does not register. Only an explicit
      // entry reaches this arm (`classifyForSource` gates the kind on
      // `explicitFile`) and every explicit entry names itself, so `descriptor`
      // is present here.
      diagnostics.push({
        severity: "error",
        code: INVALID_EXTENSION,
        file: normalizePath(path),
        message: `'${descriptor!}' resolves to '${normalizePath(path)}' which does not end in .theta`,
      });
      return [];
    case "missing":
      emitSourceFailure(modes.missing, MISSING_SOURCE, source, descriptorValue, path, diagnostics, "missing");
      return [];
    case "unreadable":
      emitSourceFailure(modes.unreadable, UNREADABLE_SOURCE, source, descriptorValue, path, diagnostics, "unreadable");
      return [];
    case "wrong-type":
      emitSourceFailure(modes.wrongType, WRONG_TYPE_SOURCE, source, descriptorValue, path, diagnostics, "wrong-type");
      return [];
  }
}

/** Classify a resolved path for a source. A regular file whose name does not
 *  end in `.theta` is, for an *explicit file reference* (CLI `--theta` / settings
 *  `thetaPaths`), an `invalid-extension` error; for a *conventional root*
 *  (directory-only) it is `wrong-type` — the root is neither a `.theta` file nor
 *  a directory. */
function classifyForSource(
  cls: PathClass,
  path: string,
  explicitFile: boolean,
): PathClass {
  if (cls.kind === "file" && splitExtension(basename(path)).ext !== "theta") {
    return explicitFile ? { kind: "invalid-extension" } : { kind: "wrong-type" };
  }
  return cls;
}

// Renders the failure-mode rows' `<descriptor>` in the normative
// `<kind>:"<value>"` form (placeholder-rendering-b.md §5) — the same grammar
// the cross-source-shadow mint (`renderDescriptor`) already uses, so one
// source rejected by two different observers (a shadow note and a failure
// note) never renders under two grammars for the same pass (bug 0461).
function emitSourceFailure(
  severity: Severity | null,
  code: string,
  source: DiscoverySource,
  descriptorValue: string,
  path: string,
  diagnostics: Diagnostic[],
  kind: "missing" | "unreadable" | "wrong-type",
): void {
  if (severity === null) {
    return; // conventional silent-on-missing
  }
  const descriptor = renderSourceDescriptor(source, descriptorValue);
  const message =
    kind === "missing"
      ? `discovery source path does not exist: ${descriptor}`
      : kind === "unreadable"
        ? `discovery source is unreadable: ${descriptor}`
        : `discovery source ${descriptor} is neither a .theta file nor a directory of them`;
  diagnostics.push({ severity, code, file: normalizePath(path), message });
}

/** A raw candidate together with its owning source (for case-collision and
 *  cross-source/format collision resolution). */
interface SourcedCandidate extends RawCandidate {
  readonly source: DiscoverySource;
  readonly sourceLabel: string;
  /** The descriptor VALUE per placeholder-rendering-b.md §5: the source's own
   *  configuration text verbatim (the `--theta` operand, the settings entry,
   *  the package name) or, for the two conventional-root sources with no
   *  operator-typed text, the root's resolved directory path (0268
   *  forward-slashed). Rendered at the cross-source-shadow/collision mint
   *  sites via `renderDescriptor`, never read for candidate identity or
   *  ordering. */
  readonly descriptorValue: string;
}

/** Resolve intra-source case-collisions (DISC-3): two `*.theta` paths differing
 *  only in case collide; the byte-first path wins, the rest drop. */
function resolveCaseCollisions(
  candidates: readonly SourcedCandidate[],
  diagnostics: Diagnostic[],
): SourcedCandidate[] {
  const groups = Map.groupBy(candidates, (candidate) => normalizePath(candidate.path).toLowerCase());
  const survivors: SourcedCandidate[] = [];
  for (const bucket of groups.values()) {
    const distinct = dedupeByPath(bucket);
    if (distinct.length === 1) {
      survivors.push(distinct[0]!);
      continue;
    }
    const sorted = [...distinct].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const winner = sorted[0]!;
    diagnostics.push({
      severity: "warning",
      code: CASE_COLLISION,
      file: winner.path,
      message: `case-insensitive filename collision in ${winner.sourceLabel}: '${sorted[0]!.path}' and '${sorted[1]!.path}'`,
    });
    survivors.push(winner);
  }
  return survivors;
}

/** Drop entries resolving to the same byte-exact path (a source reaching one
 *  directory through two entries dedupes silently before collision detection). */
function dedupeByPath(candidates: readonly SourcedCandidate[]): SourcedCandidate[] {
  const seen = new Set<string>();
  const out: SourcedCandidate[] = [];
  for (const candidate of candidates) {
    const key = normalizePath(candidate.path);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(candidate);
    }
  }
  return out;
}

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
 *  (discovery-sources.md:63 wants that entry's descriptor). */
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
 *  (discovery-sources.md:69), so the rejection is classified by the :68
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
 *  per-match enumeration already reported is left to that report: rule 2
 *  (discovery-sources.md:63) pairs one offending path with one descriptor, and
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
    emitSourceFailure(severity, UNREADABLE_SOURCE, "settings", descriptorValue, path, diagnostics, "unreadable");
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
    for (const cand of await enumerateDirectory(fs, dir, "settings", descriptorValue, SETTINGS_MODES, diagnostics)) {
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
        emitSourceFailure(SETTINGS_MODES.missing, MISSING_SOURCE, "settings", entry.raw, entry.abs, diagnostics, "missing");
        return;
      case "unreadable":
        emitSourceFailure(SETTINGS_MODES.unreadable, UNREADABLE_SOURCE, "settings", entry.raw, entry.abs, diagnostics, "unreadable");
        return;
      case "wrong-type":
        emitSourceFailure(SETTINGS_MODES.wrongType, WRONG_TYPE_SOURCE, "settings", entry.raw, entry.abs, diagnostics, "wrong-type");
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
    CLI_MODES,
    true,
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
    readonly source: DiscoverySource;
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
      CONVENTIONAL_MODES,
      false,
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
  source: DiscoverySource,
  modes: FailureModes,
  explicitFile: boolean,
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
      modes,
      explicitFile,
      entry.enoentPolicy,
      diagnostics,
      roots,
    );
    for (const candidate of raw) {
      out.push({ ...candidate, source, sourceLabel, descriptorValue: entry.descriptorValue });
    }
  }
}

function sourceLabelOf(source: DiscoverySource): string {
  switch (source) {
    case "cli":
      return "--theta flag";
    case "settings":
      return "settings thetaPaths";
    case "project":
      // The host config-dir name is unavailable at this pure-label seam, so the
      // Pi spelling stands in for the source CATEGORY here. This label is what
      // the case-collision message above (`case-insensitive filename collision
      // in ${sourceLabel}`) names — the path-bearing project diagnostics render
      // the normative `<kind>:"<value>"` descriptor form instead, so this
      // prose spelling never has to stand in for a real directory there.
      return "project .pi/theta/";
    case "package":
      return "package theta/ directory";
    case "global":
      return "global thetas directory";
  }
}

/** Render one candidate as the normative `<kind>:"<value>"` descriptor
 *  (placeholder-rendering-b.md §5/§7) — the mint site for the
 *  cross-source-shadow `<higher>`/`<lower>` placeholders must render this
 *  form, not a bare candidate path. */
function renderDescriptor(candidate: SourcedCandidate): string {
  return renderSourceDescriptor(candidate.source, candidate.descriptorValue);
}

/** Apply case-collision resolution independently within each source. */
function resolveBySource(
  candidates: readonly SourcedCandidate[],
  diagnostics: Diagnostic[],
): SourcedCandidate[] {
  const bySource = Map.groupBy(candidates, (candidate) => candidate.source);
  const out: SourcedCandidate[] = [];
  for (const bucket of bySource.values()) {
    out.push(...resolveCaseCollisions(bucket, diagnostics));
  }
  return out;
}

/** Validate each surviving candidate's slash name, then confirm readability of
 *  the underlying `.theta` file (DISC-2 rule 1 / DISC-3 Filename validity). */
async function validateAndRead(
  fs: FileSystem,
  candidates: readonly SourcedCandidate[],
  diagnostics: Diagnostic[],
): Promise<SourcedCandidate[]> {
  const out: SourcedCandidate[] = [];
  for (const candidate of candidates) {
    if (!SLASH_NAME.test(candidate.stem)) {
      diagnostics.push({
        severity: "error",
        code: INVALID_SLASH_NAME,
        file: candidate.path,
        message:
          "slash names must be lowercase kebab/snake; rename the file (e.g. `code-review.theta`)",
        hint: "Slash names must be lowercase kebab/snake; rename the file (e.g. `code-review.theta`).",
      });
      continue;
    }
    const readable = await fs.readBytes(candidate.path).then(
      () => true,
      () => false,
    );
    if (!readable) {
      diagnostics.push({
        severity: "warning",
        code: UNREADABLE_FILE,
        file: candidate.path,
        message: `.theta file is unreadable: '${candidate.path}'`,
      });
      continue;
    }
    out.push(candidate);
  }
  return out;
}

/** Bug 0331: within one name group, collapse candidates whose
 *  separator-normalized path is identical down to ONE candidate, keeping the
 *  HIGHEST-priority (lowest `PRIORITY` number) tier — one physical file is one
 *  candidate, regardless of how many discovery sources reach it. Regime-
 *  independent (runs for every group, not just a marked root): a source
 *  reaching the SAME file via a different separator spelling is not a
 *  distinct copy, so it must not draw its own cross-source-shadow warning.
 *  Genuinely-distinct files (different normalized paths) are untouched —
 *  separator normalization alone decides identity here, deliberately short of
 *  `fs.realpath` (parent-side symlink/`..` semantics for distinct files stay
 *  exactly as today). Map iteration preserves each surviving key's first-seen
 *  position, so diagnostic message ordering for the untouched groups is
 *  unaffected. */
function dedupeByIdentity(group: readonly SourcedCandidate[]): SourcedCandidate[] {
  const byPath = new Map<string, SourcedCandidate>();
  for (const candidate of group) {
    const key = normalizePath(candidate.path);
    const existing = byPath.get(key);
    if (existing === undefined || PRIORITY[candidate.source] < PRIORITY[existing.source]) {
      byPath.set(key, candidate);
    }
  }
  return [...byPath.values()];
}

/** Shared `<paths>` ordering for both `theta/load/cross-format-collision`
 *  arms (placeholder-rendering-b.md:57): discovery-source PRIORITY first,
 *  then byte-wise normalised (forward-slash) absolute path — a single
 *  comparator so the same-format and Pi-owned mints cannot drift apart
 *  again (0459 §Fix Residual 2). */
function collisionPathOrder(a: SourcedCandidate, b: SourcedCandidate): number {
  if (PRIORITY[a.source] !== PRIORITY[b.source]) return PRIORITY[a.source] - PRIORITY[b.source];
  const na = normalizePath(a.path);
  const nb = normalizePath(b.path);
  return na < nb ? -1 : na > nb ? 1 : 0;
}

/** Resolve cross-source-shadow (different priority → higher wins) and
 *  cross-format-collision (same priority theta-vs-theta, or theta-vs-Pi-owned;
 *  the theta always loses asymmetrically) over the validated candidates.
 *  Bug 0331: identity-dedup runs first (regime-independent); then, past the
 *  Pi-owned guard (a Pi-owned collision is decided first), a marked-root
 *  pre-emption scoped to `markedRoot?.slug` (regime-gated) may register that
 *  group's winner alone before the tier adjudication runs. */
async function resolveSlashNames(
  candidates: readonly SourcedCandidate[],
  piOwned: readonly PiOwnedCommand[],
  diagnostics: Diagnostic[],
  markedRoot?: { readonly slug: string; readonly winnerPath: string },
): Promise<DiscoveredTheta[]> {
  const piOwnedByName = Map.groupBy(piOwned, (command) => command.name);
  const byName = Map.groupBy(candidates, (candidate) => candidate.stem);

  const thetas: DiscoveredTheta[] = [];
  for (const [name, rawGroup] of byName) {
    const group = dedupeByIdentity(rawGroup);

    // Theta-vs-Pi-owned: the theta always loses; the Pi-owned entry survives.
    // `<paths>` is the registered theta candidate(s) first (priority-then-path
    // ordered), then the colliding `.md`-sibling tail (placeholder-rendering-b.md:57);
    // a foreign extension command carrying no host path falls back to its
    // registered name (0459 §Fix adjudication rider) — no survives-suffix.
    if (piOwnedByName.has(name)) {
      const thetaPaths = [...group]
        .sort(collisionPathOrder)
        .map((candidate) => normalizePath(candidate.path));
      const siblingPaths = (piOwnedByName.get(name) ?? [])
        .map((command) => (command.path !== undefined && command.path !== "" ? normalizePath(command.path) : command.name))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      diagnostics.push({
        severity: "error",
        code: CROSS_FORMAT_COLLISION,
        message: `slash name '${name}' collides at the same priority: ${[...thetaPaths, ...siblingPaths].join(", ")}`,
      });
      continue;
    }

    // Bug 0331: marked-root pre-emption, scoped to `markedRoot.slug` alone,
    // adjudicated AFTER the Pi-owned guard above because a Pi-owned collision
    // is decided FIRST. The parent's carrier resolved this slug across theta
    // TIERS, not against Pi-ownedness, so a name a foreign extension owns in
    // the child (but not the parent) takes the Pi-owned arm and drops the
    // theta — the theta never pre-empts a non-theta registration
    // (discovery-sources.md#disc-4), matching the parent. Past that guard,
    // when the parent-named winner survives dedup here it registers ALONE —
    // no cross-format-collision / cross-source-shadow diagnostic — and every
    // sibling for THIS slug drops silently. A winner that names no surviving
    // candidate (absent carrier, hostile value, stale path) falls through to
    // today's tier adjudication below — the safe fallback the trust boundary
    // and the skew fence both rely on.
    if (markedRoot !== undefined && name === markedRoot.slug) {
      const winnerKey = normalizePath(markedRoot.winnerPath);
      const winner = group.find((candidate) => normalizePath(candidate.path) === winnerKey);
      if (winner !== undefined) {
        thetas.push({ name, path: winner.path, source: winner.source });
        continue;
      }
    }

    const minPriority = Math.min(...group.map((candidate) => PRIORITY[candidate.source]));
    const topTier = group.filter((candidate) => PRIORITY[candidate.source] === minPriority);
    const lowerTier = group.filter((candidate) => PRIORITY[candidate.source] !== minPriority);

    if (topTier.length > 1) {
      // Same-priority theta-vs-theta: every colliding theta drops. `<paths>`
      // is priority-then-absolute-path ordered (placeholder-rendering-b.md:57),
      // not collection/insertion order.
      diagnostics.push({
        severity: "error",
        code: CROSS_FORMAT_COLLISION,
        message: `slash name '${name}' collides at the same priority: ${[...topTier]
          .sort(collisionPathOrder)
          .map((candidate) => normalizePath(candidate.path))
          .join(", ")}`,
      });
      continue;
    }

    const winner = topTier[0]!;
    for (const shadowed of lowerTier) {
      // Different priority: the higher-priority source wins; the rest shadow.
      diagnostics.push({
        severity: "warning",
        code: CROSS_SOURCE_SHADOW,
        message: `slash name '${name}' shadowed across discovery sources: '${renderDescriptor(winner)}' wins over '${renderDescriptor(shadowed)}'`,
      });
    }
    thetas.push({ name, path: winner.path, source: winner.source });
  }

  return thetas;
}
