// V10b / V10b-T — Package discovery (bounded walk).
//
// The theta extension owns package discovery end-to-end (Pi has no `pi.theta`
// slot): it walks the five installed-package roots itself — project
// `<config-dir>/npm/`, project `<config-dir>/git/<host>/<path>/`, project-local
// `node_modules/`, global `<global-agent-dir>/npm/`, and global
// `<global-agent-dir>/git/<host>/<path>/`, where the config-dir name and the
// global agent directory are both the running host's own (`.pi` on Pi, `.omp` on
// Oh-My-Pi, and a relocated global directory under either) — inspects
// each candidate package's `package.json`, and resolves either its `pi.theta`
// manifest array (minimatch globs with the fixed `!`/`+`/`-` override order) or
// the conventional `theta/` fallback directory. The walk is bounded: it stops
// after `theta.scanPackagesMaxFiles` `package.json` reads or
// `theta.scanPackagesTimeoutMs` wall-clock milliseconds (whichever fires first,
// file-count consulted before time on a tie), each candidate read is bounded by
// a per-read deadline `max(200, floor(scanPackagesTimeoutMs / 10))` armed
// through the injected `Clock.setTimeout` seam, and the whole walk is skipped
// when `theta.scanPackages` is `false`.
//
// V10b-T (tests-task) declares the seam shape and stubs `discoverPackageThetas`
// with an inert result (no thetas, no diagnostics) so the failing tests compile
// and red on their own primary assertions — the walk is absent, not throwing.
// The paired V10b implementation leaf fills this in and wires it into the
// priority-4 Package source of `discoverThetas`.
//
// Spec: discovery/package-and-settings.md (DISC-5 `pi.theta` shape + minimatch
// override order, DISC-6 bounded walk + per-read deadline), with the
// `theta/load/*` diagnostic codes/messages sourced from
// diagnostics/code-registry-load.md.

import { minimatch } from "minimatch";
import type { Diagnostic, Severity } from "../diagnostics/diagnostic";
import type { FileSystem } from "../seams/file-system";
import type { Clock, TimerHandle } from "../seams/clock";
import type { ThetaSettings } from "./settings";
import { nodeErrorCode } from "./node-error-code";

/**
 * Inputs to one package-discovery walk. The bounds (`scanPackages`,
 * `scanPackagesMaxFiles`, `scanPackagesTimeoutMs`) are read from the merged
 * `settings.theta` view V10c produces — the walk applies its built-in defaults
 * (`true` / `2000` / `2000`) only when the merged view omits a key, so an
 * operator override flows through to the walk rather than being overridden by a
 * hardcoded constant. The `Clock` seam times the walk and arms the per-read
 * deadline so the `FakeClock` test seam can drive both deterministically.
 */
export interface PackageDiscoveryInput {
  readonly fs: FileSystem;
  readonly clock: Clock;
  readonly settings: ThetaSettings;
}

/** One package-discovered, registrable theta: its slash name, absolute path, and source. */
export interface PackageDiscoveredTheta {
  readonly name: string;
  readonly path: string;
  readonly source: "package";
}

/** The outcome of one package-discovery walk. */
export interface PackageDiscoveryResult {
  readonly thetas: readonly PackageDiscoveredTheta[];
  readonly diagnostics: readonly Diagnostic[];
}

/** Built-in bound defaults (DISC-6 upper bounds, not target performance). */
export const DEFAULT_SCAN_PACKAGES = true;
export const DEFAULT_SCAN_PACKAGES_MAX_FILES = 2000;
export const DEFAULT_SCAN_PACKAGES_TIMEOUT_MS = 2000;

// --------------------------------------------------------------------------
// Diagnostic codes (sourced from diagnostics/code-registry-load.md).
// --------------------------------------------------------------------------

const MANIFEST_INVALID = "theta/load/manifest-invalid";
const MANIFEST_ESCAPES_PACKAGE = "theta/load/manifest-escapes-package";
const DISCOVERY_SLOW = "theta/load/discovery-slow";
const PACKAGE_READ_TIMEOUT = "theta/load/package-read-timeout";
const MISSING_SOURCE = "theta/load/missing-source";
const UNREADABLE_SOURCE = "theta/load/unreadable-source";

// --------------------------------------------------------------------------
// Path helpers — POSIX forward-slash form (the `FileSystem` seam reports
// forward-slash paths; see discovery-walk.ts for the shared conventions).
// --------------------------------------------------------------------------

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, "/");
}

function joinPosix(base: string, tail: string): string {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}/${tail}`;
}

/** Split a filename into `{ stem, ext }` on the final `.` (leading-dot names
 *  yield an empty `ext`), mirroring discovery-walk.ts. */
function splitExtension(name: string): { readonly stem: string; readonly ext: string } {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) {
    return { stem: name, ext: "" };
  }
  return { stem: name.slice(0, idx), ext: name.slice(idx + 1) };
}

/** Collapse `.`/`..` segments in a POSIX path (used for the escape check). */
function normalizePosix(path: string): string {
  const norm = normalizeSlashes(path);
  const isAbsolute = norm.startsWith("/") || /^[A-Za-z]:/.test(norm);
  const drive = /^[A-Za-z]:/.test(norm) ? norm.slice(0, 2) : "";
  const rest = drive ? norm.slice(2) : norm;
  const out: string[] = [];
  for (const seg of rest.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") {
        out.pop();
      } else if (!isAbsolute) {
        out.push("..");
      }
      continue;
    }
    out.push(seg);
  }
  const joined = out.join("/");
  if (drive) return `${drive}/${joined}`;
  return isAbsolute ? `/${joined}` : joined;
}

/** The closed JSON-kind token set for the `manifest-invalid` `<kind>` tail. */
function jsonKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

// --------------------------------------------------------------------------
// Filesystem probes (all rejection-mapped, no broad `catch`).
// --------------------------------------------------------------------------

async function isDirectory(fs: FileSystem, path: string): Promise<boolean> {
  return fs.lstat(path).then(
    (stat) => stat.isDirectory(),
    () => false,
  );
}

async function isFileHelper(fs: FileSystem, path: string): Promise<boolean> {
  return fs.lstat(path).then(
    (stat) => stat.isFile(),
    () => false,
  );
}

async function readdirOr(fs: FileSystem, path: string): Promise<readonly string[] | undefined> {
  return fs.readdir(path).then(
    (names) => names,
    () => undefined,
  );
}

// --------------------------------------------------------------------------
// Per-read deadline race — built without `Promise.race` (banned by the
// Sequential-by-default rule), using a single manual first-settle promise.
// The timer is armed through the injected `Clock.setTimeout` seam so the
// `FakeClock` test seam drives it deterministically (DISC-6).
// --------------------------------------------------------------------------

type ReadOutcome =
  | { readonly timedOut: true }
  | { readonly timedOut: false; readonly text?: string };

async function readWithDeadline(
  fs: FileSystem,
  path: string,
  deadlineMs: number,
  clock: Clock,
): Promise<ReadOutcome> {
  return new Promise<ReadOutcome>((resolve) => {
    let settled = false;
    const timer: TimerHandle = clock.setTimeout(() => {
      if (settled) return;
      settled = true;
      // The in-flight read is abandoned; its eventual settlement is silenced
      // below and never re-routed into the discovery pass (DISC-6).
      resolve({ timedOut: true });
    }, deadlineMs);
    // The read resolves the race on success or failure; on a read rejection the
    // package is simply skipped (it did not parse). Handlers no-op once the
    // deadline has already won, silencing the abandoned read's settlement.
    void fs.readText(path).then(
      (text) => {
        if (settled) return;
        settled = true;
        clock.clearTimeout(timer);
        resolve({ timedOut: false, text });
      },
      () => {
        if (settled) return;
        settled = true;
        clock.clearTimeout(timer);
        resolve({ timedOut: false });
      },
    );
  });
}

// --------------------------------------------------------------------------
// Candidate-package enumeration across the five installed-package roots.
// --------------------------------------------------------------------------

type RootLayout = "npm" | "git";

interface PackageRoot {
  readonly path: string;
  readonly layout: RootLayout;
}

/** A candidate package: its root directory and a human-readable identity name. */
interface CandidatePackage {
  readonly dir: string;
  readonly name: string;
}

/** The five installed-package roots, project before global (DISC-6 order). */
function packageRoots(fs: FileSystem): readonly PackageRoot[] {
  const cwd = fs.cwd();
  // The two PROJECT install roots are reconstructible from the host's
  // config-dir NAME (`.pi` on Pi, `.omp` on Oh-My-Pi) because both hosts build
  // the project directory from that same static constant. The two GLOBAL roots
  // are not: they hang off the host's OWN resolved global agent directory, which
  // Pi relocates via `PI_CODING_AGENT_DIR` and Oh-My-Pi via an active profile
  // or `PI_CONFIG_DIR`. A synthesised `<homedir>/<config-dir>/agent/npm` is a
  // non-existent root, and a root that does not exist is silently skipped
  // (`enumerateRoot`) — so every globally installed theta package would
  // disappear without a diagnostic.
  const configDir = fs.configDirName();
  const globalAgentDir = fs.globalAgentDir();
  return [
    { path: joinPosix(cwd, `${configDir}/npm`), layout: "npm" },
    { path: joinPosix(cwd, `${configDir}/git`), layout: "git" },
    { path: joinPosix(cwd, "node_modules"), layout: "npm" },
    { path: joinPosix(globalAgentDir, "npm"), layout: "npm" },
    { path: joinPosix(globalAgentDir, "git"), layout: "git" },
  ];
}

/**
 * Enumerate one root's candidate packages. npm-style roots treat each immediate
 * child as a package, unwrapping `@scope` directories one level (the on-disk
 * layout for scoped packages). git-style roots (`<host>/<path>` layout, whose
 * `<path>` segment count is not fixed by the spec) descend until a directory
 * that directly contains a `package.json` is found — see notes.md.
 *
 * npm-style children are not `lstat`-pre-filtered: a non-directory / symlink
 * child simply fails its `package.json` read and contributes nothing (see the
 * dated notes.md divergence — this keeps the walk's await budget within the
 * `FakeClock`-driven per-read-deadline test's timing model).
 */
async function enumerateRoot(fs: FileSystem, root: PackageRoot): Promise<CandidatePackage[]> {
  const names = await readdirOr(fs, root.path);
  if (names === undefined) {
    return []; // a root that does not exist is silently skipped
  }
  if (root.layout === "npm") {
    const out: CandidatePackage[] = [];
    for (const name of names) {
      const abs = joinPosix(root.path, name);
      if (name.startsWith("@")) {
        const scopedNames = (await readdirOr(fs, abs)) ?? [];
        for (const child of scopedNames) {
          out.push({ dir: joinPosix(abs, child), name: `${name}/${child}` });
        }
      } else {
        out.push({ dir: abs, name });
      }
    }
    return out;
  }
  // git layout: descend to package.json-bearing directories.
  const out: CandidatePackage[] = [];
  const descend = async (dir: string, relName: string): Promise<void> => {
    const entries = await readdirOr(fs, dir);
    if (entries === undefined) return;
    if (entries.includes("package.json")) {
      out.push({ dir, name: relName });
      return; // a package is a descent leaf
    }
    for (const entry of entries) {
      const abs = joinPosix(dir, entry);
      if (await isDirectory(fs, abs)) {
        await descend(abs, relName === "" ? entry : `${relName}/${entry}`);
      }
    }
  };
  await descend(root.path, "");
  return out;
}

// --------------------------------------------------------------------------
// Package-tree enumeration + minimatch `!`/`+`/`-` resolution (DISC-5).
// --------------------------------------------------------------------------

interface TreeEntry {
  readonly abs: string;
  readonly rel: string;
  readonly base: string;
  readonly isDir: boolean;
  readonly isFile: boolean;
}

/** Recursively enumerate every file/dir under the package root (the universe
 *  the `pi.theta` patterns are matched against). Symlinks are not followed. */
async function listTree(fs: FileSystem, root: string): Promise<TreeEntry[]> {
  const out: TreeEntry[] = [];
  const walk = async (dir: string, relBase: string): Promise<void> => {
    const names = await readdirOr(fs, dir);
    if (names === undefined) return;
    for (const name of names) {
      const abs = joinPosix(dir, name);
      const rel = relBase === "" ? name : `${relBase}/${name}`;
      const stat = await fs.lstat(abs).then(
        (s) => ({ isDir: s.isDirectory(), isFile: s.isFile() }),
        () => undefined,
      );
      if (stat === undefined) continue;
      out.push({ abs, rel, base: name, isDir: stat.isDir, isFile: stat.isFile });
      if (stat.isDir) {
        await walk(abs, rel);
      }
    }
  };
  await walk(root, "");
  return out;
}

/** Match one glob against an entry's package-root-relative path, its basename,
 *  and its POSIX-normalised absolute path (`nocase` off), per DISC-5. */
function matchesGlob(entry: TreeEntry, pattern: string): boolean {
  return (
    minimatch(entry.rel, pattern, { nocase: false }) ||
    minimatch(entry.base, pattern, { nocase: false }) ||
    minimatch(entry.abs, pattern, { nocase: false })
  );
}

/** Exact-path match for `+`/`-` operands: the operand equals the entry's
 *  relative path, basename, or absolute path (mirroring `matchesAnyExactPattern`). */
function matchesExact(entry: TreeEntry, operand: string): boolean {
  return entry.rel === operand || entry.base === operand || entry.abs === operand;
}

/** True when an operand's resolved absolute path lies outside the package root. */
function escapesPackage(pkgRoot: string, operand: string): boolean {
  const abs =
    operand.startsWith("/") || /^[A-Za-z]:/.test(operand)
      ? normalizePosix(operand)
      : normalizePosix(`${pkgRoot}/${operand}`);
  const root = normalizePosix(pkgRoot);
  return !(abs === root || abs.startsWith(`${root}/`));
}

/**
 * Resolve one package's `pi.theta` array against its tree, applying the fixed
 * `!`/`+`/`-` override order (plain includes → `!` drops → `+` re-admits → `-`
 * removes, `-` taking final precedence), then contribute per the file/dir/other
 * match rule. Returns the surviving `.theta` paths (stem + absolute path).
 */
async function resolvePiThetas(
  fs: FileSystem,
  pkgRoot: string,
  pkgName: string,
  entries: readonly string[],
  diagnostics: Diagnostic[],
): Promise<Map<string, string>> {
  const plain: string[] = [];
  const bang: string[] = [];
  const plus: string[] = [];
  const minus: string[] = [];
  for (const raw of entries) {
    const prefix = raw[0];
    const operand = prefix === "!" || prefix === "+" || prefix === "-" ? raw.slice(1) : raw;
    if (escapesPackage(pkgRoot, operand)) {
      diagnostics.push({
        severity: "warning",
        code: MANIFEST_ESCAPES_PACKAGE,
        file: pkgRoot,
        message: `package '${pkgName}' 'pi.theta' entry '${raw}' resolves outside the package root`,
      });
      continue;
    }
    if (prefix === "!") bang.push(operand);
    else if (prefix === "+") plus.push(operand);
    else if (prefix === "-") minus.push(operand);
    else plain.push(operand);
  }

  const universe = await listTree(fs, pkgRoot);

  // (1) plain includes select the starting set (every path when none present).
  const selected = new Set<string>();
  if (plain.length === 0) {
    for (const entry of universe) selected.add(entry.abs);
  } else {
    for (const entry of universe) {
      if (plain.some((pattern) => matchesGlob(entry, pattern))) {
        selected.add(entry.abs);
      }
    }
  }
  // (2) `!` patterns drop matching paths.
  for (const entry of universe) {
    if (bang.some((pattern) => matchesGlob(entry, pattern))) {
      selected.delete(entry.abs);
    }
  }
  // (3) `+` operands re-admit an exact path dropped by step 2.
  for (const entry of universe) {
    if (plus.some((operand) => matchesExact(entry, operand))) {
      selected.add(entry.abs);
    }
  }
  // (4) `-` operands remove an exact path, taking final precedence.
  for (const entry of universe) {
    if (minus.some((operand) => matchesExact(entry, operand))) {
      selected.delete(entry.abs);
    }
  }

  // Per-match contribution: a `.theta` file registers directly; a directory is
  // scanned non-recursively for `*.theta`; any other file type is filtered.
  const thetas = new Map<string, string>(); // absPath → stem
  for (const entry of universe) {
    if (!selected.has(entry.abs)) continue;
    if (entry.isFile && splitExtension(entry.base).ext === "theta") {
      thetas.set(entry.abs, splitExtension(entry.base).stem);
    } else if (entry.isDir) {
      for (const [abs, stem] of await thetasInDirectory(
        fs,
        entry.abs,
        `package \`${pkgName}\` (pi.theta)`,
        "error",
        diagnostics,
      )) {
        thetas.set(abs, stem);
      }
    }
    // any other file type (non-`.theta` file, symlink) is filtered silently
  }
  return thetas;
}

/** Non-recursive `*.theta` scan of a directory (byte-exact `.theta` extension).
 *  This one enumeration serves two DISC-2 rows whose *Missing path* cells
 *  disagree, so the caller supplies its own: `missing` is `null` for the
 *  conventional `theta/` fallback, because a package need not ship a `theta/`
 *  directory at all (package-and-settings.md:32), and `"error"` for a directory
 *  a `pi.theta` entry named, because the manifest authored that path
 *  (discovery-sources.md:54). Any other rejection code is a genuinely
 *  unreadable source, a warning under both rows (:53-54).
 *
 *  An `ENOENT` here needs no discovery-sources.md:66 ancestor walk: both call
 *  sites have already proven every ancestor enterable — the `theta/` fallback is
 *  reached only after `<pkg>/package.json` was read successfully, and a
 *  `pi.theta`-contributed directory comes out of the tree walk that `readdir`ed
 *  its parent — so the walk could only ever answer "clean". A directory that
 *  vanishes between that walk's `lstat` and this `readdir` is therefore *missing*
 *  (:66) rather than *unreadable* (:67): that is the disposition
 *  `enumerateDirectory` applies to a root `classifyPath` accepted and `readdir`
 *  then reported `ENOENT` for, so the two enumeration sites classify one
 *  rejection class identically. */
async function thetasInDirectory(
  fs: FileSystem,
  dir: string,
  descriptor: string,
  missing: Severity | null,
  diagnostics: Diagnostic[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const entries = await fs.readdir(dir).then(
    (names) => ({ ok: true as const, names }),
    (error: unknown) => ({ ok: false as const, code: nodeErrorCode(error) }),
  );
  if (!entries.ok) {
    if (entries.code === "ENOENT") {
      if (missing !== null) {
        diagnostics.push({
          severity: missing,
          code: MISSING_SOURCE,
          file: dir,
          message: `discovery source path does not exist: ${descriptor}`,
        });
      }
    } else {
      diagnostics.push({
        severity: "warning",
        code: UNREADABLE_SOURCE,
        file: dir,
        message: `discovery source is unreadable: ${descriptor}`,
      });
    }
    return out;
  }
  for (const name of entries.names) {
    const { stem, ext } = splitExtension(name);
    if (ext !== "theta") continue;
    const abs = joinPosix(dir, name);
    if (await isFileHelper(fs, abs)) {
      out.set(abs, stem);
    }
  }
  return out;
}

/** Read `pi.theta` off a parsed manifest: absent, or the raw field value. */
function readPiThetasField(
  parsed: unknown,
): { readonly kind: "absent" } | { readonly kind: "value"; readonly value: unknown } {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { kind: "absent" };
  }
  const pi = (parsed as { pi?: unknown }).pi;
  if (typeof pi !== "object" || pi === null || Array.isArray(pi)) {
    return { kind: "absent" };
  }
  if (!Object.prototype.hasOwnProperty.call(pi, "theta")) {
    return { kind: "absent" };
  }
  return { kind: "value", value: (pi as { theta?: unknown }).theta };
}

/** A `pi.theta` value is valid iff it is an array of strings. */
function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/**
 * Resolve one candidate package's thetas from its already-read `package.json`
 * text: parse (parse failure → contribute nothing silently), then either the
 * `pi.theta` manifest array or the conventional `theta/` fallback directory.
 */
async function resolvePackage(
  fs: FileSystem,
  candidate: CandidatePackage,
  manifestText: string,
  diagnostics: Diagnostic[],
): Promise<Map<string, string>> {
  const parsed = await Promise.resolve()
    .then(() => JSON.parse(manifestText) as unknown)
    .then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const }),
    );
  if (!parsed.ok) {
    return new Map(); // a package.json that does not parse contributes nothing
  }
  const field = readPiThetasField(parsed.value);
  if (field.kind === "absent") {
    // Fallback: the conventional `theta/` directory, scanned non-recursively.
    return thetasInDirectory(
      fs,
      joinPosix(candidate.dir, "theta"),
      `package \`${candidate.name}\` theta/ directory`,
      null,
      diagnostics,
    );
  }
  if (!isStringArray(field.value)) {
    diagnostics.push({
      severity: "error",
      code: MANIFEST_INVALID,
      file: joinPosix(candidate.dir, "package.json"),
      message: `package '${candidate.name}' has invalid 'pi.theta': expected string[], got ${jsonKind(field.value)}`,
    });
    return new Map();
  }
  return resolvePiThetas(fs, candidate.dir, candidate.name, field.value, diagnostics);
}

/**
 * Walk the five installed-package roots, resolve each candidate package's
 * `pi.theta` manifest (or `theta/` fallback), and return the registrable thetas
 * plus the load-phase diagnostics, subject to the DISC-6 file-count / wall-clock
 * bounds and the per-read deadline.
 *
 * The bounds come from the merged `settings.theta` view (V10c); the built-in
 * defaults (`true` / `2000` / `2000`) apply only where a key is absent, so an
 * operator override flows through rather than being overridden by a hardcoded
 * constant. Elapsed time and the per-read deadline are read/armed through the
 * injected `Clock` seam.
 */
export async function discoverPackageThetas(
  input: PackageDiscoveryInput,
): Promise<PackageDiscoveryResult> {
  const { fs, clock, settings } = input;
  const thetas: PackageDiscoveredTheta[] = [];
  const diagnostics: Diagnostic[] = [];

  const thetasSettings = settings.theta ?? {};
  const scanPackages = thetasSettings.scanPackages ?? DEFAULT_SCAN_PACKAGES;
  if (!scanPackages) {
    // The walk is skipped wholesale: no root is scanned, no read is issued.
    return { thetas, diagnostics };
  }
  const maxFiles = thetasSettings.scanPackagesMaxFiles ?? DEFAULT_SCAN_PACKAGES_MAX_FILES;
  const timeoutMs = thetasSettings.scanPackagesTimeoutMs ?? DEFAULT_SCAN_PACKAGES_TIMEOUT_MS;
  const perReadDeadline = Math.max(200, Math.floor(timeoutMs / 10));

  // The walk clock starts at the first candidate cap-check, not at function
  // entry: candidate enumeration (root `readdir`s) is not part of the bounded
  // read budget, so it must not consume the `scanPackagesTimeoutMs` window.
  let start: number | undefined;
  let filesRead = 0;
  let aborted = false;
  const registered = new Set<string>(); // absolute `.theta` paths already added

  for (const root of packageRoots(fs)) {
    if (aborted) break;
    const candidates = await enumerateRoot(fs, root);
    for (const candidate of candidates) {
      if (start === undefined) start = clock.now();
      // Cap-check before each new candidate-package read attempt. The file-count
      // predicate is consulted before the elapsed-time predicate, so a tie at
      // one cap-check site resolves to the `scanPackagesMaxFiles` cap (DISC-6).
      if (filesRead >= maxFiles) {
        diagnostics.push({
          severity: "warning",
          code: DISCOVERY_SLOW,
          file: root.path,
          message: `package-discovery walk aborted at ${root.path}: theta.scanPackagesMaxFiles cap reached`,
        });
        aborted = true;
        break;
      }
      if (clock.now() - start >= timeoutMs) {
        diagnostics.push({
          severity: "warning",
          code: DISCOVERY_SLOW,
          file: root.path,
          message: `package-discovery walk aborted at ${root.path}: theta.scanPackagesTimeoutMs cap reached`,
        });
        aborted = true;
        break;
      }

      // Arm the per-read deadline (through `Clock.setTimeout`) and read.
      filesRead++;
      const manifestPath = joinPosix(candidate.dir, "package.json");
      const outcome = await readWithDeadline(fs, manifestPath, perReadDeadline, clock);
      if (outcome.timedOut) {
        diagnostics.push({
          severity: "warning",
          code: PACKAGE_READ_TIMEOUT,
          file: manifestPath,
          message: `package '${candidate.name}' package.json read exceeded ${perReadDeadline}ms during package discovery`,
          details: { kind: "package-read-timeout" },
        });
        continue; // treat as unreadable for this scan; the walk continues
      }
      if (outcome.text === undefined) {
        continue; // read failed (no package.json / unreadable) → contributes nothing
      }
      const resolved = await resolvePackage(fs, candidate, outcome.text, diagnostics);
      for (const [abs, stem] of resolved) {
        if (registered.has(abs)) continue;
        registered.add(abs);
        thetas.push({ name: stem, path: abs, source: "package" });
      }
    }
  }

  return { thetas, diagnostics };
}
