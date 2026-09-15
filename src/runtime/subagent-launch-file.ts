// RFC-0012 §2 — the launch file: the control plane off inherited environment.
//
// A child a multiplexer places is not the parent's child process and may not
// inherit its environment, so the `PI_THETA_*` control plane cannot ride the
// env there and the ppid authentication gate (`authenticateControlPlane`,
// `production-subagent-host.ts`) has nothing to check. For every non-`pipe`
// placement the parent instead writes a LAUNCH FILE — a JSON document in a
// parent-private 0700 directory, mode 0600, unpredictable name — holding every
// control-plane value the env would have carried, the result-channel
// coordinates (§3), the presentation, the entry (§10) and a per-launch nonce.
// Its path travels on argv as `--theta-launch <path>` (`SUBAGENT_LAUNCH_FLAG`).
//
// Authentication changes shape, not strength (subagent.md
// #subagent-control-plane-authentication): the ppid check defeated a `.env`-
// planted environment because a file written ahead of time cannot state a
// per-run pid; the launch file defeats it because `.env` cannot author argv,
// the file is parent-private, and its nonce is consumed on first read (the
// child deletes the file as it reads it and echoes the nonce on the channel's
// hello frame, so a replay names a nonce the parent no longer accepts). A path
// that does not exist, is not owned by the current user, or fails to parse is
// treated exactly as a failed ppid check: the control plane is dropped and the
// process runs as an ordinary top-level pi. No new diagnostic code is minted.
//
// Under `pipe` no launch file exists: a fn entry rides the env
// (`SUBAGENT_LAUNCH_ENTRY_ENV`) and everything else stays as it was.

import {
  SUBAGENT_CONTROL_PLANE_ENV_KEYS,
  SUBAGENT_LAUNCH_ENTRY_ENV,
  SUBAGENT_LAUNCH_FLAG,
} from "./subagent-launcher";
import {
  THETA_LAUNCH_ENTRY,
  type SubagentLaunchEntry,
  type SubagentPlacementPresentation,
} from "./subagent-placement";

/** The launch-file document version; a parent and child of one build agree on it. */
export const LAUNCH_FILE_VERSION = 1;

/** Parent-private directory mode (owner-only). */
export const LAUNCH_FILE_DIR_MODE = 0o700;
/** Launch-file mode (owner-only), the PIC-60 params-file precedent. */
export const LAUNCH_FILE_MODE = 0o600;

/** The result-channel coordinates the child dials (§3). */
export interface LaunchFileChannel {
  /** Loopback TCP port the parent listens on (`127.0.0.1`). */
  readonly port: number;
  /** The hello token proving a connection belongs to this launch. */
  readonly token: string;
}

/** The launch-file document. */
export interface SubagentLaunchFileDocument {
  readonly v: typeof LAUNCH_FILE_VERSION;
  /** Per-launch nonce; consumed on first read and echoed on the channel hello. */
  readonly nonce: string;
  /**
   * Every `PI_THETA_*` control-plane value this launch would have put in the
   * child env: the root marker, the params carriers, the callable-hash map, the
   * winner path, the depth, the parent pid, the extension pin. Projected over
   * the child's env view in place of env carriage.
   */
  readonly controlPlane: Readonly<Record<string, string>>;
  readonly channel?: LaunchFileChannel;
  readonly presentation: SubagentPlacementPresentation;
  readonly entry: SubagentLaunchEntry;
}

/** The filesystem the launch file is written and read through (injected; fake in tests). */
export interface LaunchFileFs {
  /** Create a fresh private directory (mode 0700) and return its path. */
  mkdtemp(prefix: string, mode: number): string;
  /** Write `contents` to `path` at `mode`. */
  writeFile(path: string, contents: string, mode: number): void;
  readFile(path: string): string;
  /** Delete the file; a failure is swallowed by the caller (best effort). */
  unlink(path: string): void;
  /** Remove the (now empty) private directory; best effort. */
  rmdir(path: string): void;
  /**
   * The owning uid of `path`, or `undefined` on a host without POSIX ownership
   * (Windows), where the 0700 directory is the whole protection.
   */
  ownerUid(path: string): number | undefined;
  /** The current process's uid, or `undefined` where the concept does not exist. */
  currentUid(): number | undefined;
}

/**
 * Project the launch's control-plane carriage out of the composed child env:
 * every `SUBAGENT_CONTROL_PLANE_ENV_KEYS` member the env carries a value for.
 * This is what the launch file carries instead of the env.
 */
export function projectLaunchFileControlPlane(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const projected: Record<string, string> = {};
  for (const key of SUBAGENT_CONTROL_PLANE_ENV_KEYS) {
    const value = env[key];
    if (value !== undefined) {
      projected[key] = value;
    }
  }
  return projected;
}

/**
 * Write the launch file into a fresh parent-private directory and return its
 * path (the value `--theta-launch` carries). One directory per launch so a
 * `par for` fan-out never collides.
 */
export function writeLaunchFile(document: SubagentLaunchFileDocument, fs: LaunchFileFs): string {
  const dir = fs.mkdtemp("pi-theta-launch-", LAUNCH_FILE_DIR_MODE);
  const path = `${dir}/launch.json`;
  fs.writeFile(path, JSON.stringify(document), LAUNCH_FILE_MODE);
  return path;
}

/**
 * Delete a launch file and its private directory (the parent's backstop when
 * placement never happened, or after the child has read it). Best effort: a
 * file the child already consumed is the expected case.
 */
export function deleteLaunchFile(path: string, fs: LaunchFileFs): void {
  try {
    fs.unlink(path);
  } catch (unlinkError: unknown) { // allow-broad-catch: RFC-0012 launch-file backstop delete — pi-integration-contract/subagent.md
    void unlinkError;
  }
  try {
    fs.rmdir(dirnameOf(path));
  } catch (rmdirError: unknown) { // allow-broad-catch: RFC-0012 launch-file backstop delete — pi-integration-contract/subagent.md
    void rmdirError;
  }
}

/** The directory half of a `<dir>/launch.json` path (both separator spellings). */
function dirnameOf(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx < 0 ? path : path.slice(0, idx);
}

/**
 * Find the `--theta-launch <path>` pair on a raw argv. Pure; the production
 * caller hands it `process.argv`. The factory reads it THIS way rather than
 * through `pi.getFlag`, because Pi applies extension-flag values after the
 * extension factories have run (`applyExtensionFlagValues`,
 * `agent-session-services.js`), and the regime must be known at factory entry
 * (watcher suppression, the `theta_progress` child arm).
 */
export function findLaunchFlagOnArgv(argv: readonly string[]): string | undefined {
  const flag = `--${SUBAGENT_LAUNCH_FLAG}`;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === flag) {
      const next = argv[i + 1];
      return next !== undefined && next.length > 0 ? next : undefined;
    }
    if (arg !== undefined && arg.startsWith(`${flag}=`)) {
      const value = arg.slice(flag.length + 1);
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}

/**
 * Read a launch file ONCE and delete it. Returns the parsed document, or
 * `undefined` for every failure — absent path, unowned file, unreadable,
 * unparseable, wrong version or shape — which the caller treats as a dropped
 * control plane (a failed ppid check's verdict, no new code). The delete runs
 * whatever the parse outcome, so a malformed file is consumed too.
 */
export function readLaunchFileOnce(
  path: string,
  fs: LaunchFileFs,
): SubagentLaunchFileDocument | undefined {
  let raw: string;
  try {
    // Ownership first: a file another user planted at a guessed path must
    // not be read at all. Hosts without uids (Windows) skip the check — the
    // 0700 directory is the protection there.
    const owner = fs.ownerUid(path);
    const me = fs.currentUid();
    if (owner !== undefined && me !== undefined && owner !== me) {
      return undefined;
    }
    raw = fs.readFile(path);
  } catch (readError: unknown) { // allow-broad-catch: RFC-0012 launch-file intake — an unreadable file drops the control plane, pi-integration-contract/subagent.md
    void readError;
    return undefined;
  } finally {
    deleteLaunchFile(path, fs);
  }
  return parseLaunchFileDocument(raw);
}

/** Parse and structurally validate a launch-file document; `undefined` on any shape failure. */
export function parseLaunchFileDocument(raw: string): SubagentLaunchFileDocument | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (parseError: unknown) { // allow-broad-catch: RFC-0012 launch-file intake — malformed JSON drops the control plane, pi-integration-contract/subagent.md
    void parseError;
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  if (record["v"] !== LAUNCH_FILE_VERSION) {
    return undefined;
  }
  const nonce = record["nonce"];
  if (typeof nonce !== "string" || nonce.length === 0) {
    return undefined;
  }
  const controlPlaneRaw = record["controlPlane"];
  if (typeof controlPlaneRaw !== "object" || controlPlaneRaw === null || Array.isArray(controlPlaneRaw)) {
    return undefined;
  }
  const controlPlane: Record<string, string> = {};
  for (const [key, value] of Object.entries(controlPlaneRaw as Record<string, unknown>)) {
    // Only the closed control-plane key set is honoured: a launch file cannot
    // inject arbitrary environment variables into the child's env view.
    if (!SUBAGENT_CONTROL_PLANE_ENV_KEYS.includes(key) || typeof value !== "string") {
      return undefined;
    }
    controlPlane[key] = value;
  }
  const presentation = record["presentation"];
  if (presentation !== "headless" && presentation !== "visible") {
    return undefined;
  }
  const entry = parseLaunchEntry(record["entry"]);
  if (entry === undefined) {
    return undefined;
  }
  let channel: LaunchFileChannel | undefined;
  if (record["channel"] !== undefined) {
    const channelRaw = record["channel"];
    if (typeof channelRaw !== "object" || channelRaw === null) {
      return undefined;
    }
    const port = (channelRaw as Record<string, unknown>)["port"];
    const token = (channelRaw as Record<string, unknown>)["token"];
    if (
      typeof port !== "number" ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      typeof token !== "string" ||
      token.length === 0
    ) {
      return undefined;
    }
    channel = { port, token };
  }
  return {
    v: LAUNCH_FILE_VERSION,
    nonce,
    controlPlane,
    ...(channel !== undefined ? { channel } : {}),
    presentation,
    entry,
  };
}

/**
 * Parse a `SubagentLaunchEntry` value (the launch file's `entry`, or the JSON
 * on `SUBAGENT_LAUNCH_ENTRY_ENV`); `undefined` on any shape failure.
 */
export function parseLaunchEntry(value: unknown): SubagentLaunchEntry | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record["kind"] === "theta") {
    return THETA_LAUNCH_ENTRY;
  }
  if (record["kind"] === "fn") {
    const name = record["name"];
    if (typeof name === "string" && name.length > 0) {
      return { kind: "fn", name };
    }
  }
  return undefined;
}

/**
 * The entry carried on the env control plane under `pipe`: the JSON on
 * `SUBAGENT_LAUNCH_ENTRY_ENV`, read from the AUTHENTICATED env view. Absent or
 * malformed ⇒ the theta entry (a `.theta` callee's launch writes no key).
 */
export function readLaunchEntryFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): SubagentLaunchEntry {
  const raw = env[SUBAGENT_LAUNCH_ENTRY_ENV];
  if (raw === undefined) {
    return THETA_LAUNCH_ENTRY;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (parseError: unknown) { // allow-broad-catch: RFC-0012 fn-entry env intake — malformed JSON falls back to the theta entry, pi-integration-contract/subagent.md
    void parseError;
    return THETA_LAUNCH_ENTRY;
  }
  return parseLaunchEntry(parsed) ?? THETA_LAUNCH_ENTRY;
}

// ---------------------------------------------------------------------------
// Child-side control-plane view.
// ---------------------------------------------------------------------------

/**
 * The child process's ONE control-plane view, computed once at factory entry
 * and threaded to every reader that used to call `readParentEnv()` directly:
 * the env view (ppid-authenticated env carriage, OR the launch file's
 * carriage projected over an env scrubbed of stale control-plane keys), plus
 * the launch-file facts that have no env equivalent.
 */
export interface SubagentChildControlPlane {
  /** The control-plane env view every `PI_THETA_*` reader consumes. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** What this process runs as its root invocation (§10). */
  readonly entry: SubagentLaunchEntry;
  /** Present iff a valid launch file was consumed. */
  readonly launch?: {
    readonly nonce: string;
    readonly presentation: SubagentPlacementPresentation;
    readonly channel?: LaunchFileChannel;
  };
}

/**
 * Build the child's control-plane view. `authenticatedEnv` is the ppid-gated
 * env (`authenticateControlPlane`); `launchFilePath` is the `--theta-launch`
 * value found on argv, if any.
 *
 *   - No launch file on argv ⇒ today's view: the authenticated env, the entry
 *     from `SUBAGENT_LAUNCH_ENTRY_ENV`.
 *   - A launch file on argv that reads and parses ⇒ the file's carriage
 *     REPLACES env carriage: every control-plane key is scrubbed from the env
 *     (a multiplexer that did inherit the parent's env would otherwise leak a
 *     stale sibling's values) and the file's values are projected over it.
 *   - A launch file on argv that fails ⇒ the control plane is dropped: the
 *     process runs as an ordinary top-level pi (the failed-ppid verdict).
 */
export function readChildControlPlane(input: {
  readonly authenticatedEnv: Readonly<Record<string, string | undefined>>;
  readonly launchFilePath: string | undefined;
  readonly launchFs: LaunchFileFs;
}): SubagentChildControlPlane {
  if (input.launchFilePath === undefined) {
    return {
      env: input.authenticatedEnv,
      entry: readLaunchEntryFromEnv(input.authenticatedEnv),
    };
  }
  const scrubbed: Record<string, string | undefined> = { ...input.authenticatedEnv };
  for (const key of SUBAGENT_CONTROL_PLANE_ENV_KEYS) {
    delete scrubbed[key];
  }
  const document = readLaunchFileOnce(input.launchFilePath, input.launchFs);
  if (document === undefined) {
    return { env: scrubbed, entry: THETA_LAUNCH_ENTRY };
  }
  return {
    env: { ...scrubbed, ...document.controlPlane },
    entry: document.entry,
    launch: {
      nonce: document.nonce,
      presentation: document.presentation,
      ...(document.channel !== undefined ? { channel: document.channel } : {}),
    },
  };
}
