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
// V10a-T (tests-task) declares the seam shape and stubs `discoverThetas` with an
// inert result (no thetas, no diagnostics) so the failing tests compile and red
// on their own primary assertions — the discovery walk is absent, not throwing.
// The paired V10a implementation leaf fills this in (and extends `DiscoveryInput`
// with the package-source plumbing V10b owns).
//
// Spec: discovery.md, discovery/discovery-sources.md (DISC-1…DISC-4), with the
// `theta/load/*` diagnostic codes/messages sourced from
// diagnostics/code-registry-load.md.

import { minimatch } from "minimatch";
import type { Diagnostic, Severity } from "../diagnostics/diagnostic";
import type { FileSystem } from "../seams/file-system";
import type { ThetaSettings } from "./settings";
import { nodeErrorCode } from "./node-error-code";

/** The five discovery sources, in priority order high→low. */
export type DiscoverySource = "cli" | "settings" | "project" | "package" | "global";

/**
 * A Pi-owned slash command already registered when the discovery walk runs.
 * Used by the cross-format collision check: a `.theta` deriving the same slash
 * name as one of these drops (the theta loses asymmetrically), the Pi-owned
 * entry survives.
 */
export interface PiOwnedCommand {
  readonly name: string;
  readonly source: "prompt" | "skill" | "extension";
}

/**
 * Inputs to one discovery pass. `cliPaths` is the already-split `--theta` flag
 * (the factory splits the raw flag on `path.delimiter` before calling, so the
 * walk is platform-independent). The merged `settings` carries `thetaPaths`
 * from V10c.
 */
export interface DiscoveryInput {
  readonly fs: FileSystem;
  readonly settings: ThetaSettings;
  readonly cliPaths?: readonly string[];
  readonly piOwnedNames?: readonly PiOwnedCommand[];
  /**
   * Bug 0331: the marked root's winning source path, as the parent resolved
   * it, threaded from the AUTHENTICATED control plane
   * (`detectMarkedRootWinner`). `undefined` outside the subagent-root regime
   * or when the carrier is absent/malformed — the walk then applies today's
   * collision resolution unconditionally. Scoped to `slug` alone: a genuine
   * collision or shadow under any OTHER name is unaffected.
   */
  readonly markedRoot?: { readonly slug: string; readonly winnerPath: string } | undefined;
}

/** One discovered, registrable theta: its slash name, absolute path, and source. */
export interface DiscoveredTheta {
  readonly name: string;
  readonly path: string;
  readonly source: DiscoverySource;
}

/** The outcome of one discovery pass. */
export interface DiscoveryResult {
  readonly thetas: readonly DiscoveredTheta[];
  readonly diagnostics: readonly Diagnostic[];
  /** The resolved discovery-root union over the walk's own four sources
   *  (cli/settings/project/global): directories that exist at
   *  scan time, regardless of whether they
   *  currently hold a `.theta`. Distinct from `thetas`' dirnames, which drop
   *  any present-but-empty root. */
  readonly roots: readonly string[];
}

// --------------------------------------------------------------------------
// Diagnostic codes (sourced from diagnostics/code-registry-load.md).
// --------------------------------------------------------------------------

const MISSING_SOURCE = "theta/load/missing-source";
const UNREADABLE_SOURCE = "theta/load/unreadable-source";
const WRONG_TYPE_SOURCE = "theta/load/wrong-type-source";
const UNREADABLE_FILE = "theta/load/unreadable";
const CASE_COLLISION = "theta/load/case-collision";
const NON_CANONICAL_EXTENSION = "theta/load/non-canonical-extension";
const INVALID_SLASH_NAME = "theta/load/invalid-slash-name";
const CROSS_SOURCE_SHADOW = "theta/load/cross-source-shadow";
const CROSS_FORMAT_COLLISION = "theta/load/cross-format-collision";
const INVALID_EXTENSION = "theta/load/invalid-extension";

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

/** Proper-ancestor directory paths of `path`, root-first (excludes the leaf).
 *  The chain climbs from the path's real root so the clean-leaf-ENOENT walk
 *  (DISC-2) probes ancestors that actually exist on the host: a Windows
 *  drive-letter absolute path (`C:/Users/…`) climbs from the drive root `C:/`,
 *  a POSIX absolute path (`/home/…`) from `/`, and a relative path from its
 *  first segment. Reconstructing a POSIX `/C:` chain for a Windows path (the
 *  pre-fix behaviour) named ancestors that never exist, so `ancestorsClean`
 *  returned false and a genuine clean-leaf ENOENT was mis-classified as
 *  `unreadable` (warning) instead of `missing` (error) — DISC-2 mandates the
 *  same result on POSIX and Windows with no platform branch, and this keys off
 *  the path's own shape rather than the host. */
function properAncestors(path: string): readonly string[] {
  const segs = normalizePath(path)
    .split("/")
    .filter((s) => s.length > 0);
  const out: string[] = [];
  if (/^[A-Za-z]:$/.test(segs[0] ?? "")) {
    // Windows drive-letter absolute: the chain climbs from the drive root
    // `C:/`, then `C:/Users`, … (never the bogus POSIX-rooted `/C:`).
    out.push(`${segs[0]}/`);
    let cur = segs[0] ?? "";
    for (let i = 1; i < segs.length - 1; i++) {
      cur = `${cur}/${segs[i]}`;
      out.push(cur);
    }
  } else if (normalizePath(path).startsWith("/")) {
    // POSIX absolute: the chain climbs from `/` (unchanged behaviour).
    out.push("/");
    let cur = "";
    for (let i = 0; i < segs.length - 1; i++) {
      cur += `/${segs[i]}`;
      out.push(cur);
    }
  } else {
    // Relative: no synthetic root; ancestors are the relative path prefixes.
    let cur = "";
    for (let i = 0; i < segs.length - 1; i++) {
      cur = cur === "" ? (segs[i] ?? "") : `${cur}/${segs[i]}`;
      out.push(cur);
    }
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

/** The `baseDir`-relative POSIX path of `abs`, or `undefined` when `baseDir` is
 *  absent or `abs` does not lie under it. A candidate outside the base dir has
 *  no root-relative comparison string to offer the DISC-5 matcher — the
 *  package walker's root-relative string is unconditional only because its
 *  universe is rooted at the package root itself, a guarantee this
 *  independently-resolved settings base dir does not carry. Byte-exact
 *  comparison: DISC-5 pins `nocase: false`. */
function relativeToBase(baseDir: string | undefined, abs: string): string | undefined {
  if (baseDir === undefined) {
    return undefined;
  }
  const norm = normalizePath(baseDir);
  const root = norm.endsWith("/") ? norm.slice(0, -1) : norm;
  const prefix = root === "" ? "/" : `${root}/`;
  const normAbs = normalizePath(abs);
  return normAbs.startsWith(prefix) ? normAbs.slice(prefix.length) : undefined;
}

/** True when an operand carries a minimatch glob metacharacter. The `!`/`+`/`-`
 *  override prefix is stripped by the caller before this test. */
function isGlobPattern(operand: string): boolean {
  return /[*?[\]{}]/.test(operand);
}

/** True when an operand's first character is a DISC-5 override prefix
 *  (`!`/`+`/`-`). DISC-5 is the settings source's grammar; a source that does
 *  not implement it (the CLI source) sees such a character as ordinary path
 *  text, not as a signal to strip before classifying. */
function hasOverridePrefix(operand: string): boolean {
  const first = operand[0];
  return first === "!" || first === "+" || first === "-";
}

type LstatOutcome =
  | { readonly ok: true; readonly isDir: boolean; readonly isFile: boolean; readonly isSymlink: boolean }
  | { readonly ok: false; readonly code: string | undefined };

async function lstatOutcome(fs: FileSystem, path: string): Promise<LstatOutcome> {
  return fs.lstat(path).then(
    (stat) => ({
      ok: true as const,
      isDir: stat.isDirectory(),
      isFile: stat.isFile(),
      isSymlink: stat.isSymbolicLink(),
    }),
    (error: unknown) => ({ ok: false as const, code: nodeErrorCode(error) }),
  );
}

/** True when an `ENOENT` candidate is a *clean leaf*: every proper ancestor
 *  `lstat`s ok as a directory, OR `lstat`s ok as a link whose resolved target
 *  is a directory (DISC-2 clean-leaf-ENOENT walk). The link arm mirrors
 *  `classifyResolvedTarget`'s candidate treatment: a healthy directory
 *  junction/symlink is an ordinary enterable ancestor, while a broken one's
 *  `realpath` rejects and the chain stays unclean — `lstat` remains the
 *  probe the spec pins, the resolve only disambiguates the link case. */
async function ancestorsClean(fs: FileSystem, path: string): Promise<boolean> {
  for (const ancestor of properAncestors(path)) {
    const outcome = await lstatOutcome(fs, ancestor);
    if (!outcome.ok) {
      return false;
    }
    if (outcome.isDir) {
      continue;
    }
    // A healthy directory junction / symlinked directory `lstat`s ok but
    // reports isDirectory()=false / isSymbolicLink()=true — the same shape
    // `classifyResolvedTarget` resolves for a link CANDIDATE. Probe it via
    // its resolved target: a directory target means the chain is enterable
    // (DISC-2 *missing*), anything else unclean. A BROKEN link's `realpath`
    // rejects → unclean, so `lstat` stays the discriminator the spec pins.
    if (outcome.isSymlink && (await resolvedAncestorIsDir(fs, ancestor))) {
      continue;
    }
    return false;
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

type RealpathOutcome =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly code: string | undefined };

/** `realpath` outcome carrying the rejection's Node-style `.code`, for a
 *  caller (`classifyPath`'s resolved-target step below) that must tell a
 *  dangling target (`ENOENT`) apart from a denied one — a distinction
 *  `realpathOr`'s existing callers collapse and do not need. */
async function realpathOutcome(fs: FileSystem, path: string): Promise<RealpathOutcome> {
  return fs.realpath(path).then(
    (resolved) => ({ ok: true as const, path: normalizePath(resolved) }),
    (error: unknown) => ({ ok: false as const, code: nodeErrorCode(error) }),
  );
}

/** `ancestorsClean`'s link-arm probe: resolve a healthy-`lstat` link ancestor
 *  to its target and ask whether THAT is a directory, so a junction/symlinked
 *  directory on the chain counts as enterable the way a real directory does. */
async function resolvedAncestorIsDir(fs: FileSystem, ancestor: string): Promise<boolean> {
  const target = await realpathOutcome(fs, ancestor);
  if (!target.ok) {
    return false;
  }
  const outcome = await lstatOutcome(fs, target.path);
  return outcome.ok && outcome.isDir;
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

/** Governs how `classifyPath` resolves an `ENOENT` candidate. `"ancestor-walk"`
 *  runs DISC-2's clean-leaf walk, which asks whether every directory segment
 *  the operand names along the way is itself enterable. `"missing"` skips that
 *  walk and classifies `ENOENT` outright: for an operand whose leading
 *  character is a DISC-5 override prefix but whose source honours no DISC-5
 *  grammar, the walk's relative-looking prefix segments (`!`, `!/opt`) are
 *  path text the operator never typed as directories, so asking whether they
 *  are enterable answers a question about the wrong thing. */
type EnoentPolicy = "ancestor-walk" | "missing";

async function classifyPath(
  fs: FileSystem,
  path: string,
  enoentPolicy: EnoentPolicy,
): Promise<PathClass> {
  // DISC-2's implementation note assigns the candidate probe to `readdir` or
  // `stat` — both of which follow links — and reserves `lstat` for the
  // ancestor chain (`ancestorsClean` above). A successful `readdir` both
  // resolves any link in the path and proves the target a directory
  // ("successful enumeration short-circuits", discovery-sources.md DISC-2).
  const enumerable = await fs.readdir(path).then(
    () => true,
    () => false,
  );
  if (enumerable) {
    return { kind: "dir" };
  }
  const outcome = await lstatOutcome(fs, path);
  if (!outcome.ok) {
    if (outcome.code === "ENOENT") {
      if (enoentPolicy === "missing") {
        return { kind: "missing" };
      }
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
  // `lstat` on the candidate itself reports neither a directory nor a regular
  // file: a symlink/junction whose target `stat` would still resolve, or a
  // genuine non-regular entry that resolves to itself. `readdir` already
  // rejected (a symlinked file, or a non-directory entry, both reject
  // `ENOTDIR`), so resolve the target the way the host's `stat` would and
  // classify by what it finds there.
  return classifyResolvedTarget(fs, path, enoentPolicy);
}

/** The DISC-2 candidate probe's link-resolution step: `realpath` then `lstat`
 *  the resolved path, so a link (or a chain of them) classifies by its
 *  target's own type rather than by the link's. A dangling target routes
 *  through the SAME `ENOENT`/`ancestorsClean` branch `classifyPath` uses for
 *  its own direct `ENOENT`, keyed off the ORIGINAL candidate path — the
 *  operand's own ancestor chain is what DISC-2's clean-leaf rule asks about,
 *  not the unreachable target's. */
async function classifyResolvedTarget(
  fs: FileSystem,
  path: string,
  enoentPolicy: EnoentPolicy,
): Promise<PathClass> {
  const target = await realpathOutcome(fs, path);
  if (!target.ok) {
    return classifyUnresolvedTarget(fs, path, target.code, enoentPolicy);
  }
  const outcome = await lstatOutcome(fs, target.path);
  if (!outcome.ok) {
    return classifyUnresolvedTarget(fs, path, outcome.code, enoentPolicy);
  }
  if (outcome.isDir) {
    return { kind: "dir" };
  }
  if (outcome.isFile) {
    return { kind: "file" };
  }
  // Resolution reached an entry that is itself neither a directory nor a
  // regular file (fifo, socket, device) — the residue DISC-2's wrong-type
  // column, titled "Path is wrong type (file vs dir)", still admits once
  // links resolve to their target's own type.
  return { kind: "wrong-type" };
}

/** Shared rejection handling for both steps of `classifyResolvedTarget`
 *  (the `realpath` call and the resolved-path `lstat`): `ENOENT` is a
 *  DANGLING link, classified through the candidate's own ancestor walk
 *  exactly as a direct `ENOENT` on the candidate is; any other code is a
 *  real read failure on an existing path. */
async function classifyUnresolvedTarget(
  fs: FileSystem,
  path: string,
  code: string | undefined,
  enoentPolicy: EnoentPolicy,
): Promise<PathClass> {
  if (code !== "ENOENT") {
    return { kind: "unreadable" };
  }
  if (enoentPolicy === "missing") {
    return { kind: "missing" };
  }
  return (await ancestorsClean(fs, path)) ? { kind: "missing" } : { kind: "unreadable" };
}

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
  descriptor: string,
  modes: FailureModes,
  diagnostics: Diagnostic[],
): Promise<RawCandidate[]> {
  const entries = await fs.readdir(dir).then(
    (names) => ({ ok: true as const, names }),
    (error: unknown) => ({ ok: false as const, code: nodeErrorCode(error) }),
  );
  if (!entries.ok) {
    if (entries.code === "ENOENT" && (await ancestorsClean(fs, dir))) {
      emitSourceFailure(modes.missing, MISSING_SOURCE, descriptor, dir, diagnostics, "missing");
    } else {
      emitSourceFailure(modes.unreadable, UNREADABLE_SOURCE, descriptor, dir, diagnostics, "unreadable");
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
 *  raw candidates, emitting the per-source failure diagnostic on any miss. */
async function resolveEntry(
  fs: FileSystem,
  path: string,
  descriptor: string,
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
      return enumerateDirectory(fs, path, descriptor, modes, diagnostics);
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
      // not `wrong-type-source`. The file does not register.
      diagnostics.push({
        severity: "error",
        code: INVALID_EXTENSION,
        file: normalizePath(path),
        message: `'${descriptor}' resolves to '${normalizePath(path)}' which does not end in .theta`,
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
        : `discovery source ${descriptor} is neither a .theta file nor a directory of them`;
  diagnostics.push({ severity, code, file: normalizePath(path), message });
}

/** A raw candidate together with its owning source (for case-collision and
 *  cross-source/format collision resolution). */
interface SourcedCandidate extends RawCandidate {
  readonly source: DiscoverySource;
  readonly sourceLabel: string;
}

/** Resolve intra-source case-collisions (DISC-3): two `*.theta` paths differing
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
// Settings `thetaPaths` resolution (DISC-7 `thetaPaths` entry schema).
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
 *  clean-leaf rule and carried out rather than dropped. */
async function listTree(fs: FileSystem, root: string): Promise<TreeWalk> {
  const out: TreeEntry[] = [];
  const unreadable: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const outcome = await fs.readdir(dir).then(
      (n) => ({ ok: true as const, names: n }),
      (error: unknown) => ({ ok: false as const, code: nodeErrorCode(error) }),
    );
    if (!outcome.ok) {
      if (!(outcome.code === "ENOENT" && (await ancestorsClean(fs, dir)))) {
        unreadable.push(dir);
      }
      return;
    }
    for (const name of outcome.names) {
      const abs = joinPosix(dir, name);
      const stat = await lstatOutcome(fs, abs);
      if (!stat.ok) {
        // A clean-leaf ENOENT here is the entry vanishing between the readdir
        // that named it and this probe: a leaf under a parent already proven
        // enterable, so the pattern resolves to no path there and
        // package-and-settings.md:29 keeps it silent. Any other code is a
        // traversal failure inside a root that exists (discovery-sources.md:69).
        if (stat.code !== "ENOENT") unreadable.push(abs);
        continue;
      }
      out.push({ abs, base: name, isDir: stat.isDir, isFile: stat.isFile });
      if (stat.isDir) {
        await walk(abs);
      }
    }
  };
  await walk(root);
  return { entries: out, unreadable };
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
  for (const [path, descriptor] of failures) {
    const file = normalizePath(path);
    const alreadyReported = diagnostics.some(
      (diagnostic) =>
        diagnostic.file === file &&
        (diagnostic.code === UNREADABLE_SOURCE || diagnostic.code === MISSING_SOURCE),
    );
    if (alreadyReported) continue;
    emitSourceFailure(severity, UNREADABLE_SOURCE, descriptor, path, diagnostics, "unreadable");
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
 * applying the DISC-5 override order and the DISC-7 `thetaPaths` schema. Returns
 * candidates deduplicated by resolved absolute path; per-entry failures are
 * non-fatal.
 */
async function resolveSettingsSource(
  fs: FileSystem,
  settings: ThetaSettings,
  diagnostics: Diagnostic[],
  roots: Set<string>,
): Promise<RawCandidate[]> {
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
    };
  });

  // `selected` is keyed by the candidate `.theta` file's absolute path (dedup by
  // resolved absolute path); dir entries have already been expanded to files.
  const selected = new Map<string, RawCandidate>();
  const treeCache = new Map<string, TreeWalk>();
  // A universe failure is attributed to the entry whose glob first triggered
  // the walk that observed it: `treeCache` shares one universe across every
  // entry with the same static prefix, so at the point of observation no single
  // index owns the rejection, and the first (lowest-index) consumer is the
  // deterministic choice.
  const universeFailures = new Map<string, string>();
  const treeFor = async (root: string, descriptor: string): Promise<TreeEntry[]> => {
    const cached = treeCache.get(root);
    if (cached !== undefined) return cached.entries;
    const tree = await listTree(fs, root);
    treeCache.set(root, tree);
    for (const path of tree.unreadable) {
      if (!universeFailures.has(path)) universeFailures.set(path, descriptor);
    }
    return tree.entries;
  };

  const addDir = async (dir: string, descriptor: string): Promise<void> => {
    roots.add(normalizePath(dir));
    for (const cand of await enumerateDirectory(fs, dir, descriptor, SETTINGS_MODES, diagnostics)) {
      selected.set(cand.path, cand);
    }
  };
  const addFile = async (absPath: string, index: number): Promise<void> => {
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
    selected.set(absPath, await onDiskFileCandidate(fs, absPath));
  };

  // A literal (non-glob) entry classifies directly, preserving the per-entry
  // missing / unreadable / wrong-type failure diagnostics of the DISC-2 table.
  const addLiteral = async (entry: ParsedSettingsEntry): Promise<void> => {
    // The settings source implements DISC-5's own grammar (its prefix parse
    // above already stripped the override character), so an ENOENT here is
    // about ancestor directories the operator actually wrote into the entry.
    const cls = await classifyPath(fs, entry.abs, "ancestor-walk");
    const descriptor = `settings entry index ${entry.index}`;
    switch (cls.kind) {
      case "dir":
        await addDir(entry.abs, descriptor);
        return;
      case "file":
        await addFile(entry.abs, entry.index);
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
    const tree = await treeFor(
      staticPrefixRoot(entry.abs),
      `settings entry index ${entry.index}`,
    );
    for (const universeEntry of tree) {
      if (!globMatches(universeEntry, entry.abs, entry.operand, baseDir)) continue;
      if (universeEntry.isDir) {
        await addDir(universeEntry.abs, `settings entry index ${entry.index}`);
      } else if (universeEntry.isFile) {
        await addFile(universeEntry.abs, entry.index);
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
 * Walk the (currently four — package source is V10b's) discovery sources,
 * resolve priority and collisions, and return the registrable thetas plus the
 * load-phase diagnostics.
 */
/**
 * The descriptor naming the conventional project discovery root in diagnostics.
 * Built from the HOST's config-dir name so a reader is pointed at the directory
 * that host actually reads (`.pi/theta/` on Pi, `.omp/theta/` on Oh-My-Pi)
 * rather than at the one this extension was authored against.
 */
function projectSourceLabel(configDirName: string): string {
  return `project ${configDirName}/theta/`;
}

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
    })),
    "cli",
    CLI_MODES,
    true,
    candidates,
    diagnostics,
    roots,
  );

  // Settings (priority 2) — explicit references resolved per the DISC-7
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
    readonly descriptor: string;
  }[] = [
    {
      source: "project" as const,
      path: joinPosix(fs.cwd(), `${configDir}/theta`),
      descriptor: projectSourceLabel(configDir),
    },
    // Package (priority 4) — owned by V10b; not plumbed into this walk yet.
    {
      source: "global" as const,
      path: joinPosix(fs.globalAgentDir(), "theta"),
      descriptor: "global thetas directory",
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
      [{ path: root.path, descriptor: root.descriptor, enoentPolicy: "ancestor-walk" }],
      root.source,
      CONVENTIONAL_MODES,
      false,
      candidates,
      diagnostics,
      roots,
    );
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
    readonly descriptor: string;
    readonly enoentPolicy: EnoentPolicy;
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
      modes,
      explicitFile,
      entry.enoentPolicy,
      diagnostics,
      roots,
    );
    for (const candidate of raw) {
      out.push({ ...candidate, source, sourceLabel });
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
      // Pi spelling stands in for the source CATEGORY here. Every path-bearing
      // project diagnostic is built with `projectSourceLabel(configDir)` below,
      // which names the real directory.
      return "project .pi/theta/";
    case "package":
      return "package theta/ directory";
    case "global":
      return "global thetas directory";
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

  const thetas: DiscoveredTheta[] = [];
  for (const [name, rawGroup] of byName) {
    const group = dedupeByIdentity(rawGroup);

    // Theta-vs-Pi-owned: the theta always loses; the Pi-owned entry survives.
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
      // Same-priority theta-vs-theta: every colliding theta drops.
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
    thetas.push({ name, path: winner.path, source: winner.source });
  }

  return thetas;
}
