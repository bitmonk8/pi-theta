// V8b — `PiFileSystem` production adapter for the `FileSystem` seam (PIC-13).
//
// Delegates the `FileSystem` interface to Node's `fs.promises` / `os` surface,
// applying PIC-13's Node-style `.code` rejection mapping, the `readBytes`
// raw-pre-decode-bytes contract (lexical.md §Encoding), the `readdir`
// entry-name encoding guarantee (no Unicode normalisation), and `realpath`'s
// case-canonicalisation / transitive-symlink / byte-stable guarantees.
//
// Spec: host-interfaces-services.md PIC-13; lexical.md §Encoding.

import { promises as fsp, realpath as realpathCallback } from "node:fs";
import os from "node:os";
import { promisify } from "node:util";
// These are STATIC NAMED imports, which makes both symbols a hard host
// requirement rather than a soft capability: a host build that does not publish
// one fails Bun's static export check when the extension is validated (Bun issue
// #5968 — the Oh-My-Pi legacy-pi-coding-agent-shim records the same hazard), and
// that is a LINK failure, so the whole extension never loads and no theta
// diagnostic is emitted to explain it. The floor is a host version, not a
// runtime branch: it cannot be probed or degraded around from inside this module.
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent"; // allow-pi-surface: PIC#13 — the host config-dir name every PROJECT-relative discovery path is built from, plus the host's own resolved global agent directory every GLOBAL one hangs off
import type { FileStat, FileSystem } from "./file-system";

// `realpath.native` canonicalises every path component — including leaf case on
// a case-insensitive filesystem — to the on-disk spelling, satisfying PIC-13's
// case-canonicalisation and byte-stable canonical-output guarantees that bare
// `fs.promises.realpath` does not (it can echo the input leaf case). The
// callback form is promisified so the call stays off the event-loop-blocking
// synchronous surface the *Sequential by default* rule bans.
const realpathNative = promisify(realpathCallback.native);

export class PiFileSystem implements FileSystem {
  // The factory-time working directory captured ONCE at construction, per
  // PIC-13's `cwd()` single-source-of-truth rule — production never re-reads
  // `process.cwd()` ad-hoc. The composition root MAY inject the host-reported
  // working directory (the `session_start` `ctx.cwd`) explicitly; when omitted
  // the adapter falls back to the process working directory captured once here.
  readonly #cwd: string;

  constructor(cwd?: string) {
    this.#cwd = cwd ?? process.cwd(); // allow-ambient: process.cwd — FileSystem
  }

  configDirName(): string {
    // The host SDK's own constant, read off the LOADED module — so a theta
    // resolves its PROJECT-relative discovery roots and settings file against
    // the host actually running it (`".pi"` on Pi, `".omp"` on Oh-My-Pi).
    return CONFIG_DIR_NAME;
  }

  globalAgentDir(): string {
    // The host's own answer, not a reconstruction: `getAgentDir()` is the very
    // function each host uses for its own global state, so it already applies
    // Pi's `PI_CODING_AGENT_DIR` override and Oh-My-Pi's active-profile /
    // `PI_CONFIG_DIR` resolution. Calling it is what keeps a relocated global
    // agent directory visible instead of silently unread — and it is the reason
    // this adapter reads no environment variable of its own, which would only
    // re-derive one host's rule and get the other host wrong.
    return getAgentDir();
  }

  readText(path: string): Promise<string> {
    return fsp.readFile(path, "utf8");
  }

  async readBytes(path: string): Promise<Uint8Array> {
    // Raw, pre-decode bytes: `readFile` with no encoding yields a Buffer; copy
    // it into a standalone `Uint8Array` so the result does not alias Node's
    // internal pooled storage. Invalid UTF-8 is preserved byte-for-byte.
    const buffer = await fsp.readFile(path);
    return new Uint8Array(buffer);
  }

  async writeText(path: string, contents: string): Promise<void> {
    await fsp.writeFile(path, contents, "utf8");
  }

  exists(path: string): Promise<boolean> {
    // Resolve `false` only on `ENOENT`; any other error (EACCES / EPERM / …)
    // rejects. The discrimination uses a Promise rejection handler rather than
    // a `try`/`catch` because Node's fs errors carry no narrow exception
    // subtype to bind — the broad-`catch` ban targets `catch` clauses.
    return fsp.access(path).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return false;
        }
        throw error;
      },
    );
  }

  homedir(): string {
    // Node's `os.homedir()` resolves `$HOME` / `%USERPROFILE%` internally; the
    // adapter never reads `process.env` and uses no platform-conditional branch.
    return os.homedir();
  }

  cwd(): string {
    return this.#cwd;
  }

  readdir(path: string): Promise<readonly string[]> {
    // Entry names only (no full paths), returned as the raw on-disk filename
    // bytes interpreted as UTF-8 with no Unicode normalisation — Node's
    // `readdir` does no folding, satisfying the entry-name encoding guarantee.
    return fsp.readdir(path);
  }

  lstat(path: string): Promise<FileStat> {
    // `lstat` does NOT follow symlinks; the returned `Stats` already exposes the
    // `isDirectory` / `isFile` / `isSymbolicLink` predicates the seam declares.
    return fsp.lstat(path);
  }

  realpath(path: string): Promise<string> {
    return realpathNative(path) as Promise<string>;
  }
}
