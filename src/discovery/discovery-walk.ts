// V10a / V10a-T — the five-source discovery walk, source priority, per-source
// failure modes, `~/` home expansion, slash-name validity, and the
// cross-source-shadow / cross-format-collision resolution (the loom always
// loses, asymmetrically).
//
// This module owns the discovery union over the CLI, Settings, Project,
// Packages, and Global sources, mapping each discovered `*.loom` file to its
// slash name (the filename stem, taken verbatim) and emitting the load-phase
// diagnostics the failure-modes table and collision rules mandate.
//
// V10a-T (tests-task) declares the seam shape and stubs `discoverLooms` with an
// inert result (no looms, no diagnostics) so the failing tests compile and red
// on their own primary assertions — the discovery walk is absent, not throwing.
// The paired V10a implementation leaf fills this in (and extends `DiscoveryInput`
// with the package-source plumbing V10b owns).
//
// Spec: discovery.md, discovery/discovery-sources.md (DISC-1…DISC-4), with the
// `loom/load/*` diagnostic codes/messages sourced from
// diagnostics/code-registry-load.md.

import { minimatch } from "minimatch";
import type { Diagnostic, Severity } from "../diagnostics/diagnostic";
import type { FileSystem } from "../seams/file-system";
import type { LoomSettings } from "./settings";

/** The five discovery sources, in priority order high→low. */
export type DiscoverySource = "cli" | "settings" | "project" | "package" | "global";

/**
 * A Pi-owned slash command already registered when the discovery walk runs.
 * Used by the cross-format collision check: a `.loom` deriving the same slash
 * name as one of these drops (the loom loses asymmetrically), the Pi-owned
 * entry survives.
 */
export interface PiOwnedCommand {
  readonly name: string;
  readonly source: "prompt" | "skill" | "extension";
}

/**
 * Inputs to one discovery pass. `cliPaths` is the already-split `--loom` flag
 * (the factory splits the raw flag on `path.delimiter` before calling, so the
 * walk is platform-independent). The merged `settings` carries `loomPaths`
 * from V10c.
 */
export interface DiscoveryInput {
  readonly fs: FileSystem;
  readonly settings: LoomSettings;
  readonly cliPaths?: readonly string[];
  readonly piOwnedNames?: readonly PiOwnedCommand[];
}

/** One discovered, registrable loom: its slash name, absolute path, and source. */
export interface DiscoveredLoom {
  readonly name: string;
  readonly path: string;
  readonly source: DiscoverySource;
}

/** The outcome of one discovery pass. */
export interface DiscoveryResult {
  readonly looms: readonly DiscoveredLoom[];
  readonly diagnostics: readonly Diagnostic[];
}

// --------------------------------------------------------------------------
// Diagnostic codes (sourced from diagnostics/code-registry-load.md).
// --------------------------------------------------------------------------

const MISSING_SOURCE = "loom/load/missing-source";
const UNREADABLE_SOURCE = "loom/load/unreadable-source";
const WRONG_TYPE_SOURCE = "loom/load/wrong-type-source";
const UNREADABLE_FILE = "loom/load/unreadable";
const CASE_COLLISION = "loom/load/case-collision";
const NON_CANONICAL_EXTENSION = "loom/load/non-canonical-extension";
const INVALID_SLASH_NAME = "loom/load/invalid-slash-name";
const CROSS_SOURCE_SHADOW = "loom/load/cross-source-shadow";
const CROSS_FORMAT_COLLISION = "loom/load/cross-format-collision";
const INVALID_EXTENSION = "loom/load/invalid-extension";

/** Accepted slash-name (filename stem) shape, per DISC-3 Filename validity. */
const SLASH_NAME = /^[a-z0-9][a-z0-9_-]*$/;

/** Source priority high→low; smaller number wins. Package (4) is V10b's. */
const PRIORITY: Record<DiscoverySource, number> = {
  cli: 1,
  settings: 2,
  project: 3,
  package: 4,
  global: 5,
} as const;

/** Per-source failure-mode severities (DISC-2 table). `null` = silent. */
interface FailureModes {
  readonly missing: Severity | null;
  readonly unreadable: Severity;
  readonly wrongType: Severity;
}

const CONVENTIONAL_MODES: FailureModes = {
  missing: null,
  unreadable: "warning",
  wrongType: "warning",
} as const;
const SETTINGS_MODES: FailureModes = {
  missing: "error",
  unreadable: "warning",
  wrongType: "error",
} as const;
const CLI_MODES: FailureModes = {
  missing: "error",
  unreadable: "error",
  wrongType: "error",
} as const;

// --------------------------------------------------------------------------
// Path helpers — POSIX forward-slash form (the normalised comparison form per
// Lexical §"Path literals"; the `FileSystem` seam reports forward-slash paths).
// --------------------------------------------------------------------------

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function joinPosix(base: string, tail: string): string {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}/${tail}`;
}

function basename(path: string): string {
  const norm = normalizePath(path);
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? norm : norm.slice(idx + 1);
}

/** Split a filename into `{ stem, ext }`; a leading-dot or extension-less name
 *  yields an empty `ext`. The split is on the final `.`. */
function splitExtension(name: string): { readonly stem: string; readonly ext: string } {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) {
    return { stem: name, ext: "" };
  }
  return { stem: name.slice(0, idx), ext: name.slice(idx + 1) };
}

/** Proper-ancestor directory paths of `path`, root-first (excludes the leaf). */
function properAncestors(path: string): readonly string[] {
  const segs = normalizePath(path)
    .split("/")
    .filter((s) => s.length > 0);
  const out: string[] = ["/"];
  let cur = "";
  for (let i = 0; i < segs.length - 1; i++) {
    cur += `/${segs[i]}`;
    out.push(cur);
  }
  return out;
}

/** Expand a leading bare `~` (alone or `~/…`) via the FileSystem.homedir()
 *  seam only — DISC-1: no `~user`, env, or platform branch. */
function expandHome(path: string, fs: FileSystem): string {
  if (path === "~") {
    return fs.homedir();
  }
  if (path.startsWith("~/")) {
    return joinPosix(fs.homedir(), path.slice(2));
  }
  return path;
}

/** True when a path is absolute (POSIX root or a Windows drive prefix). */
function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:/.test(path);
}

/** POSIX dirname (`/` for a root-level leaf). */
function dirnameOf(path: string): string {
  const norm = normalizePath(path);
  const idx = norm.lastIndexOf("/");
  return idx <= 0 ? "/" : norm.slice(0, idx);
}

/** True when an operand carries a minimatch glob metacharacter. The `!`/`+`/`-`
 *  override prefix is stripped by the caller before this test. */
function isGlobPattern(operand: string): boolean {
  return /[*?[\]{}]/.test(operand);
}

/** Node-style `.code` reader that binds no broad `catch` (the fs rejections
 *  carry no narrow subtype; the broad-catch ban targets `catch` clauses). */
function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

type LstatOutcome =
  | { readonly ok: true; readonly isDir: boolean; readonly isFile: boolean }
  | { readonly ok: false; readonly code: string | undefined };

async function lstatOutcome(fs: FileSystem, path: string): Promise<LstatOutcome> {
  return fs.lstat(path).then(
    (stat) => ({ ok: true as const, isDir: stat.isDirectory(), isFile: stat.isFile() }),
    (error: unknown) => ({ ok: false as const, code: nodeErrorCode(error) }),
  );
}

/** True when an `ENOENT` candidate is a *clean leaf*: every proper ancestor
 *  `lstat`s ok as a directory (DISC-2 clean-leaf-ENOENT walk). */
async function ancestorsClean(fs: FileSystem, path: string): Promise<boolean> {
  for (const ancestor of properAncestors(path)) {
    const outcome = await lstatOutcome(fs, ancestor);
    if (!outcome.ok || !outcome.isDir) {
      return false;
    }
  }
  return true;
}

/** Best-effort `realpath`; `undefined` when resolution rejects. */
async function realpathOr(fs: FileSystem, path: string): Promise<string | undefined> {
  return fs.realpath(path).then(
    (resolved) => normalizePath(resolved),
    () => undefined,
  );
}

// --------------------------------------------------------------------------
// Source resolution.
// --------------------------------------------------------------------------

type PathClass =
  | { readonly kind: "dir" }
  | { readonly kind: "file" }
  | { readonly kind: "missing" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "wrong-type" }
  | { readonly kind: "invalid-extension" };

async function classifyPath(fs: FileSystem, path: string): Promise<PathClass> {
  const outcome = await lstatOutcome(fs, path);
  if (!outcome.ok) {
    if (outcome.code === "ENOENT") {
      return (await ancestorsClean(fs, path))
        ? { kind: "missing" }
        : { kind: "unreadable" };
    }
    return { kind: "unreadable" };
  }
  if (outcome.isDir) {
    return { kind: "dir" };
  }
  if (outcome.isFile) {
    return { kind: "file" };
  }
  // A symlink or other non-regular, non-directory entry.
  return { kind: "wrong-type" };
}

/** A `*.loom` file found under a source, before validity/collision resolution. */
interface RawCandidate {
  readonly path: string;
  readonly stem: string;
}

/** Enumerate one directory: collect byte-exact `*.loom` candidates and emit
 *  per-directory `non-canonical-extension` warnings (DISC-3). */
async function enumerateDirectory(
  fs: FileSystem,
  dir: string,
  diagnostics: Diagnostic[],
): Promise<RawCandidate[]> {
  const entries = await fs.readdir(dir).then(
    (names) => ({ ok: true as const, names }),
    () => ({ ok: false as const }),
  );
  if (!entries.ok) {
    return [];
  }
  const candidates: RawCandidate[] = [];
  const canonicalNames = new Set<string>();
  for (const name of entries.names) {
    const { ext } = splitExtension(name);
    if (ext === "loom" || ext === "warp") {
      canonicalNames.add(name);
    }
  }
  for (const name of entries.names) {
    const { stem, ext } = splitExtension(name);
    const lower = ext.toLowerCase();
    const full = joinPosix(dir, name);
    if (ext === "loom") {
      candidates.push({ path: full, stem });
      continue;
    }
    if (ext === "warp") {
      // Library file — importable, never a slash command; not discovered.
      continue;
    }
    if ((lower === "loom" || lower === "warp") && SLASH_NAME.test(stem)) {
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
        message: `file '${full}' has non-canonical extension case; rename to lowercase '.loom' or '.warp'`,
      });
    }
  }
  return candidates;
}

/** True when `nonCanonicalPath` resolves (via `realpath`) to the same canonical
 *  path as some byte-exact `.loom`/`.warp` sibling in `dir`. */
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

/** Resolve one source entry (a directory root, or a single `.loom` file) into
 *  raw candidates, emitting the per-source failure diagnostic on any miss. */
async function resolveEntry(
  fs: FileSystem,
  path: string,
  descriptor: string,
  modes: FailureModes,
  explicitFile: boolean,
  diagnostics: Diagnostic[],
): Promise<RawCandidate[]> {
  const resolved = classifyForSource(await classifyPath(fs, path), path, explicitFile);
  switch (resolved.kind) {
    case "dir":
      return enumerateDirectory(fs, path, diagnostics);
    case "file":
      // A single `.loom` file entry contributes itself directly.
      return [{ path: normalizePath(path), stem: splitExtension(basename(path)).stem }];
    case "invalid-extension":
      // An explicit file reference (CLI `--loom` / settings `loomPaths`) that
      // resolves to a non-`.loom` regular file is an `invalid-extension` error
      // per Lexical §"Extension matching" — the settings/CLI extension check —
      // not `wrong-type-source`. The file does not register.
      diagnostics.push({
        severity: "error",
        code: INVALID_EXTENSION,
        file: normalizePath(path),
        message: `'${descriptor}' resolves to '${normalizePath(path)}' which does not end in .loom`,
      });
      return [];
    case "missing":
      emitSourceFailure(modes.missing, MISSING_SOURCE, descriptor, path, diagnostics, "missing");
      return [];
    case "unreadable":
      emitSourceFailure(modes.unreadable, UNREADABLE_SOURCE, descriptor, path, diagnostics, "unreadable");
      return [];
    case "wrong-type":
      emitSourceFailure(modes.wrongType, WRONG_TYPE_SOURCE, descriptor, path, diagnostics, "wrong-type");
      return [];
  }
}

/** Classify a resolved path for a source. A regular file whose name does not
 *  end in `.loom` is, for an *explicit file reference* (CLI `--loom` / settings
 *  `loomPaths`), an `invalid-extension` error; for a *conventional root*
 *  (directory-only) it is `wrong-type` — the root is neither a `.loom` file nor
 *  a directory. */
function classifyForSource(
  cls: PathClass,
  path: string,
  explicitFile: boolean,
): PathClass {
  if (cls.kind === "file" && splitExtension(basename(path)).ext !== "loom") {
    return explicitFile ? { kind: "invalid-extension" } : { kind: "wrong-type" };
  }
  return cls;
}

function emitSourceFailure(
  severity: Severity | null,
  code: string,
  descriptor: string,
  path: string,
  diagnostics: Diagnostic[],
  kind: "missing" | "unreadable" | "wrong-type",
): void {
  if (severity === null) {
    return; // conventional silent-on-missing
  }
  const message =
    kind === "missing"
      ? `discovery source path does not exist: ${descriptor}`
      : kind === "unreadable"
        ? `discovery source is unreadable: ${descriptor}`
        : `discovery source ${descriptor} is neither a .loom file nor a directory of them`;
  diagnostics.push({ severity, code, file: normalizePath(path), message });
}

/** A raw candidate together with its owning source (for case-collision and
 *  cross-source/format collision resolution). */
interface SourcedCandidate extends RawCandidate {
  readonly source: DiscoverySource;
  readonly sourceLabel: string;
}

/** Resolve intra-source case-collisions (DISC-3): two `*.loom` paths differing
 *  only in case collide; the byte-first path wins, the rest drop. */
function resolveCaseCollisions(
  candidates: readonly SourcedCandidate[],
  diagnostics: Diagnostic[],
): SourcedCandidate[] {
  const groups = new Map<string, SourcedCandidate[]>();
  for (const candidate of candidates) {
    const key = normalizePath(candidate.path).toLowerCase();
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [candidate]);
    } else {
      bucket.push(candidate);
    }
  }
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
// Settings `loomPaths` resolution (DISC-7 `loomPaths` entry schema).
//
// Unlike the CLI / conventional sources (whose entries are single directory
// roots or explicit `.loom` files), settings entries resolve relative to the
// settings-file directory, support globs, and carry the `!`/`+`/`-` override
// grammar of DISC-5 (the same fixed order the package `pi.looms` path uses:
// plain includes → `!` drops → `+` re-admits an exact path → `-` removes an
// exact path). A non-`.loom` file match is a `loom/load/invalid-extension`
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

/** Recursively enumerate every file/dir under `root` (symlinks not followed);
 *  the universe glob patterns are matched against. A non-existent / unreadable
 *  root yields the empty universe. */
async function listTree(fs: FileSystem, root: string): Promise<TreeEntry[]> {
  const out: TreeEntry[] = [];
  const walk = async (dir: string): Promise<void> => {
    const names = await fs.readdir(dir).then(
      (n) => n,
      () => undefined,
    );
    if (names === undefined) return;
    for (const name of names) {
      const abs = joinPosix(dir, name);
      const stat = await lstatOutcome(fs, abs);
      if (!stat.ok) continue;
      out.push({ abs, base: name, isDir: stat.isDir, isFile: stat.isFile });
      if (stat.isDir) {
        await walk(abs);
      }
    }
  };
  await walk(root);
  return out;
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

/** Match a universe entry against a resolved absolute glob pattern (matches the
 *  entry's absolute path and its basename, `nocase` off — DISC-5 matching). */
function globMatches(entry: TreeEntry, absPattern: string): boolean {
  return (
    minimatch(entry.abs, absPattern, { nocase: false }) ||
    minimatch(entry.base, basename(absPattern), { nocase: false })
  );
}

/** One parsed `loomPaths` entry: its array index, override prefix, and the
 *  operand resolved to an absolute POSIX path. */
interface ParsedSettingsEntry {
  readonly index: number;
  readonly prefix: "" | "!" | "+" | "-";
  readonly abs: string;
  readonly glob: boolean;
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
 * Resolve the Settings source's `loomPaths` into raw `.loom` candidates,
 * applying the DISC-5 override order and the DISC-7 `loomPaths` schema. Returns
 * candidates deduplicated by resolved absolute path; per-entry failures are
 * non-fatal.
 */
async function resolveSettingsSource(
  fs: FileSystem,
  settings: LoomSettings,
  diagnostics: Diagnostic[],
): Promise<RawCandidate[]> {
  const entries = settings.loomPaths ?? [];
  if (entries.length === 0) {
    return [];
  }
  const baseDir = settings.loomPathsBaseDir;

  const parsed: ParsedSettingsEntry[] = entries.map((raw, index) => {
    const first = raw[0];
    const prefix = first === "!" || first === "+" || first === "-" ? first : "";
    const operand = prefix === "" ? raw : raw.slice(1);
    return {
      index,
      prefix,
      abs: resolveSettingsOperand(operand, baseDir, fs),
      glob: isGlobPattern(operand),
    };
  });

  // `selected` is keyed by the candidate `.loom` file's absolute path (dedup by
  // resolved absolute path); dir entries have already been expanded to files.
  const selected = new Map<string, RawCandidate>();
  const treeCache = new Map<string, TreeEntry[]>();
  const treeFor = async (root: string): Promise<TreeEntry[]> => {
    const cached = treeCache.get(root);
    if (cached !== undefined) return cached;
    const tree = await listTree(fs, root);
    treeCache.set(root, tree);
    return tree;
  };

  const addDir = async (dir: string): Promise<void> => {
    for (const cand of await enumerateDirectory(fs, dir, diagnostics)) {
      selected.set(cand.path, cand);
    }
  };
  const addFile = (absPath: string, index: number): void => {
    // A file match must end in `.loom` (byte-exact lowercase); anything else is
    // an `invalid-extension` error, reported per match, and does not register.
    if (splitExtension(basename(absPath)).ext !== "loom") {
      diagnostics.push({
        severity: "error",
        code: INVALID_EXTENSION,
        file: absPath,
        message: `'loomPaths[${index}]' resolves to '${absPath}' which does not end in .loom`,
      });
      return;
    }
    selected.set(absPath, { path: absPath, stem: splitExtension(basename(absPath)).stem });
  };

  // A literal (non-glob) entry classifies directly, preserving the per-entry
  // missing / unreadable / wrong-type failure diagnostics of the DISC-2 table.
  const addLiteral = async (entry: ParsedSettingsEntry): Promise<void> => {
    const cls = await classifyPath(fs, entry.abs);
    const descriptor = `settings entry index ${entry.index}`;
    switch (cls.kind) {
      case "dir":
        await addDir(entry.abs);
        return;
      case "file":
        addFile(entry.abs, entry.index);
        return;
      case "missing":
        emitSourceFailure(SETTINGS_MODES.missing, MISSING_SOURCE, descriptor, entry.abs, diagnostics, "missing");
        return;
      case "unreadable":
        emitSourceFailure(SETTINGS_MODES.unreadable, UNREADABLE_SOURCE, descriptor, entry.abs, diagnostics, "unreadable");
        return;
      case "wrong-type":
        emitSourceFailure(SETTINGS_MODES.wrongType, WRONG_TYPE_SOURCE, descriptor, entry.abs, diagnostics, "wrong-type");
        return;
    }
  };

  // A glob entry enumerates the universe under its static-prefix root and
  // contributes per match (file → register, dir → non-recursive scan).
  const addGlob = async (entry: ParsedSettingsEntry): Promise<void> => {
    const tree = await treeFor(staticPrefixRoot(entry.abs));
    for (const universeEntry of tree) {
      if (!globMatches(universeEntry, entry.abs)) continue;
      if (universeEntry.isDir) {
        await addDir(universeEntry.abs);
      } else if (universeEntry.isFile) {
        addFile(universeEntry.abs, entry.index);
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
        ? minimatch(key, entry.abs, { nocase: false }) ||
          minimatch(basename(key), basename(entry.abs), { nocase: false })
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

  return [...selected.values()];
}

/**
 * Walk the (currently four — package source is V10b's) discovery sources,
 * resolve priority and collisions, and return the registrable looms plus the
 * load-phase diagnostics.
 */
export async function discoverLooms(input: DiscoveryInput): Promise<DiscoveryResult> {
  const { fs } = input;
  const diagnostics: Diagnostic[] = [];
  const candidates: SourcedCandidate[] = [];

  // CLI (priority 1) — explicit user intent: every failure mode is an error.
  const cliPaths = input.cliPaths ?? [];
  await collectFromEntries(
    fs,
    cliPaths.map((raw, index) => ({
      path: expandHome(raw, fs),
      descriptor: `--loom flag #${index + 1}`,
    })),
    "cli",
    CLI_MODES,
    true,
    candidates,
    diagnostics,
  );

  // Settings (priority 2) — explicit references resolved per the DISC-7
  // `loomPaths` entry schema: relative to the settings-file dir, with globs and
  // the `!`/`+`/`-` override grammar; missing/wrong-type are errors.
  const settingsSourceLabel = sourceLabelOf("settings");
  for (const candidate of await resolveSettingsSource(fs, input.settings, diagnostics)) {
    candidates.push({ ...candidate, source: "settings", sourceLabel: settingsSourceLabel });
  }

  // Project (priority 3) — conventional `.pi/looms/`; silent when absent.
  await collectFromEntries(
    fs,
    [{ path: joinPosix(fs.cwd(), ".pi/looms"), descriptor: "project .pi/looms/" }],
    "project",
    CONVENTIONAL_MODES,
    false,
    candidates,
    diagnostics,
  );

  // Package (priority 4) — owned by V10b; not plumbed into this walk yet.

  // Global (priority 5) — conventional `~/.pi/agent/looms/`; silent when absent.
  await collectFromEntries(
    fs,
    [{ path: joinPosix(fs.homedir(), ".pi/agent/looms"), descriptor: "global looms directory" }],
    "global",
    CONVENTIONAL_MODES,
    false,
    candidates,
    diagnostics,
  );

  // Per-source case-collision, then slash-name validity + per-file readability,
  // then cross-source/format collision resolution over the survivors.
  const caseResolved = resolveBySource(candidates, diagnostics);
  const valid = validateAndRead(fs, caseResolved, diagnostics);
  const looms = await resolveSlashNames(await valid, input.piOwnedNames ?? [], diagnostics);

  return { looms, diagnostics };
}

async function collectFromEntries(
  fs: FileSystem,
  entries: readonly { readonly path: string; readonly descriptor: string }[],
  source: DiscoverySource,
  modes: FailureModes,
  explicitFile: boolean,
  out: SourcedCandidate[],
  diagnostics: Diagnostic[],
): Promise<void> {
  const sourceLabel = sourceLabelOf(source);
  for (const entry of entries) {
    const raw = await resolveEntry(fs, entry.path, entry.descriptor, modes, explicitFile, diagnostics);
    for (const candidate of raw) {
      out.push({ ...candidate, source, sourceLabel });
    }
  }
}

function sourceLabelOf(source: DiscoverySource): string {
  switch (source) {
    case "cli":
      return "--loom flag";
    case "settings":
      return "settings loomPaths";
    case "project":
      return "project .pi/looms/";
    case "package":
      return "package looms/ directory";
    case "global":
      return "global looms directory";
  }
}

/** Apply case-collision resolution independently within each source. */
function resolveBySource(
  candidates: readonly SourcedCandidate[],
  diagnostics: Diagnostic[],
): SourcedCandidate[] {
  const bySource = new Map<DiscoverySource, SourcedCandidate[]>();
  for (const candidate of candidates) {
    const bucket = bySource.get(candidate.source);
    if (bucket === undefined) {
      bySource.set(candidate.source, [candidate]);
    } else {
      bucket.push(candidate);
    }
  }
  const out: SourcedCandidate[] = [];
  for (const bucket of bySource.values()) {
    out.push(...resolveCaseCollisions(bucket, diagnostics));
  }
  return out;
}

/** Validate each surviving candidate's slash name, then confirm readability of
 *  the underlying `.loom` file (DISC-2 rule 1 / DISC-3 Filename validity). */
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
          "slash names must be lowercase kebab/snake; rename the file (e.g. `code-review.loom`)",
        hint: "Slash names must be lowercase kebab/snake; rename the file (e.g. `code-review.loom`).",
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
        message: `.loom file is unreadable: '${candidate.path}'`,
      });
      continue;
    }
    out.push(candidate);
  }
  return out;
}

/** Resolve cross-source-shadow (different priority → higher wins) and
 *  cross-format-collision (same priority loom-vs-loom, or loom-vs-Pi-owned;
 *  the loom always loses asymmetrically) over the validated candidates. */
async function resolveSlashNames(
  candidates: readonly SourcedCandidate[],
  piOwned: readonly PiOwnedCommand[],
  diagnostics: Diagnostic[],
): Promise<DiscoveredLoom[]> {
  const piNames = new Set(piOwned.map((command) => command.name));
  const byName = new Map<string, SourcedCandidate[]>();
  for (const candidate of candidates) {
    const bucket = byName.get(candidate.stem);
    if (bucket === undefined) {
      byName.set(candidate.stem, [candidate]);
    } else {
      bucket.push(candidate);
    }
  }

  const looms: DiscoveredLoom[] = [];
  for (const [name, group] of byName) {
    // Loom-vs-Pi-owned: the loom always loses; the Pi-owned entry survives.
    if (piNames.has(name)) {
      diagnostics.push({
        severity: "error",
        code: CROSS_FORMAT_COLLISION,
        message: `slash name '${name}' collides at the same priority: ${group
          .map((candidate) => `'${candidate.path}'`)
          .join(", ")} (Pi-owned command '${name}' survives)`,
      });
      continue;
    }

    const minPriority = Math.min(...group.map((candidate) => PRIORITY[candidate.source]));
    const topTier = group.filter((candidate) => PRIORITY[candidate.source] === minPriority);
    const lowerTier = group.filter((candidate) => PRIORITY[candidate.source] !== minPriority);

    if (topTier.length > 1) {
      // Same-priority loom-vs-loom: every colliding loom drops.
      diagnostics.push({
        severity: "error",
        code: CROSS_FORMAT_COLLISION,
        message: `slash name '${name}' collides at the same priority: ${topTier
          .map((candidate) => `'${candidate.path}'`)
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
        message: `slash name '${name}' shadowed across discovery sources: '${winner.path}' wins over '${shadowed.path}'`,
      });
    }
    looms.push({ name, path: winner.path, source: winner.source });
  }

  return looms;
}
