// Path/filesystem-shape classification for the discovery walk: POSIX path
// helpers (`~/` home expansion included), the DISC-2 clean-leaf-ENOENT
// ancestor walk, and the per-candidate `lstat`/`realpath` outcome
// classification `classifyPath` drives. Split out of discovery-walk.ts
// (whose own V10a/V10a-T header describes the walk this module's
// classifications feed) — every member here was file-private before the
// split (0 importers outside discovery-walk.ts) and stays so except where
// discovery-walk.ts's own per-source enumeration
// (`resolveEntry`/`enumerateDirectory`) and settings `thetaPaths` resolution
// (`resolveSettingsSource`) still call back into it.
//
// Spec: discovery.md, discovery/discovery-sources.md (DISC-1, DISC-2).

import type { FileSystem } from "../seams/file-system";
import { nodeErrorCode } from "./node-error-code";

// --------------------------------------------------------------------------
// Path helpers — POSIX forward-slash form (the normalised comparison form per
// Lexical §"Path literals"; the `FileSystem` seam reports forward-slash paths).
// --------------------------------------------------------------------------

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function joinPosix(base: string, tail: string): string {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}/${tail}`;
}

export function basename(path: string): string {
  const norm = normalizePath(path);
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? norm : norm.slice(idx + 1);
}

/** Split a filename into `{ stem, ext }`; a leading-dot or extension-less name
 *  yields an empty `ext`. The split is on the final `.`. */
export function splitExtension(name: string): { readonly stem: string; readonly ext: string } {
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
export function expandHome(path: string, fs: FileSystem): string {
  if (path === "~") {
    return fs.homedir();
  }
  if (path.startsWith("~/")) {
    return joinPosix(fs.homedir(), path.slice(2));
  }
  return path;
}

/** True when a path is absolute (POSIX root or a Windows drive prefix). */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:/.test(path);
}

/** POSIX dirname (`/` for a root-level leaf). */
export function dirnameOf(path: string): string {
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
export function relativeToBase(baseDir: string | undefined, abs: string): string | undefined {
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
export function isGlobPattern(operand: string): boolean {
  return /[*?[\]{}]/.test(operand);
}

/** True when an operand's first character is a DISC-5 override prefix
 *  (`!`/`+`/`-`). DISC-5 is the settings source's grammar; a source that does
 *  not implement it (the CLI source) sees such a character as ordinary path
 *  text, not as a signal to strip before classifying. */
export function hasOverridePrefix(operand: string): boolean {
  const first = operand[0];
  return first === "!" || first === "+" || first === "-";
}

export type LstatOutcome =
  | { readonly ok: true; readonly isDir: boolean; readonly isFile: boolean; readonly isSymlink: boolean }
  | { readonly ok: false; readonly code: string | undefined };

export async function lstatOutcome(fs: FileSystem, path: string): Promise<LstatOutcome> {
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
export async function ancestorsClean(fs: FileSystem, path: string): Promise<boolean> {
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
export async function realpathOr(fs: FileSystem, path: string): Promise<string | undefined> {
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

export type PathClass =
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
export type EnoentPolicy = "ancestor-walk" | "missing";

export async function classifyPath(
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
