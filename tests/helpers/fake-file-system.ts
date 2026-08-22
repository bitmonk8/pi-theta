// V8b — in-memory `FakeFileSystem` conforming `FileSystem` seam implementation
// (PIC-13). Test code (unrestricted) constructs it with the values it should
// report, so a conformance test drives the seam's `.code` rejection mapping,
// the `readBytes` raw-bytes contract, `homedir()` / `cwd()` single-source-of-
// truth values, the `readdir` entry-name encoding guarantee, and `realpath`'s
// case-canonicalisation / transitive-symlink / ELOOP / ENOENT behaviour at
// chosen boundaries instead of reaching the real disk.
//
// Spec: host-interfaces-services.md PIC-13; lexical.md §Encoding.

import type { FileStat, FileSystem } from "../../src/seams/file-system";

/**
 * Constructor inputs the fake reports. Every map is keyed by absolute path.
 * A path present in `errors` rejects every operation on it with the configured
 * Node-style `.code` (`ENOENT` / `EACCES` / `EPERM` / `ELOOP` / `ENOTDIR` / …),
 * exercising the same rejection surface production reaches through Node.
 */
export interface FakeFileSystemOptions {
  /** Reported by `homedir()` (the Home-directory expansion single source). */
  readonly homedir: string;
  /** Reported by `cwd()` (the factory-time project-local discovery root). */
  readonly cwd: string;
  /** Regular files: path → content (string is UTF-8 encoded; bytes used as-is). */
  readonly files?: Readonly<Record<string, string | Uint8Array>>;
  /** Directories: path → entry names (no full paths, no normalisation). */
  readonly dirs?: Readonly<Record<string, readonly string[]>>;
  /** Symlinks: path → immediate target. Every primitive that a host resolves
   *  through a link (`readdir`, `readText`, `readBytes`, `realpath`) resolves
   *  these at EVERY path component, transitively; `lstat` alone does not, which
   *  is the PIC-13 distinction the seam documents. Targets are absolute. */
  readonly symlinks?: Readonly<Record<string, string>>;
  /** Entries that exist but are neither a regular file, nor a directory, nor a
   *  link — a fifo, socket or device node. `lstat` reports one, `readdir`
   *  rejects `ENOTDIR` and the byte readers reject with a deterministic
   *  non-`ENOENT` code (`EINVAL`) — a fixed fake value, not a claim about what
   *  any particular host reports for these node types.
   *  These are the only inputs for which DISC-2's wrong-type column, titled
   *  "Path is wrong type (file vs dir)", is reachable through a resolved
   *  candidate (discovery-sources.md DISC-2). */
  readonly others?: readonly string[];
  /** Injected per-path Node-style `.code` rejections. */
  readonly errors?: Readonly<Record<string, string>>;
  /** When true, `realpath` canonicalises component/leaf case to one entry. */
  readonly caseInsensitive?: boolean;
}

/** Build a Node-style error carrying the injected `.code`. */
function codeError(code: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`${code}: fake filesystem`);
  error.code = code;
  return error;
}

class FakeStat implements FileStat {
  constructor(
    private readonly kind: "file" | "dir" | "symlink" | "other",
  ) {}
  isDirectory(): boolean {
    return this.kind === "dir";
  }
  isFile(): boolean {
    return this.kind === "file";
  }
  isSymbolicLink(): boolean {
    return this.kind === "symlink";
  }
}

export class FakeFileSystem implements FileSystem {
  readonly #homedir: string;
  readonly #cwd: string;
  // Regular files are mutable so `writeText` can round-trip through `readText`.
  readonly #files: Map<string, string | Uint8Array>;
  readonly #dirs: Map<string, readonly string[]>;
  readonly #symlinks: Map<string, string>;
  readonly #others: Set<string>;
  readonly #errors: Map<string, string>;
  readonly #caseInsensitive: boolean;

  constructor(options: FakeFileSystemOptions) {
    this.#homedir = options.homedir;
    this.#cwd = options.cwd;
    this.#files = new Map(Object.entries(options.files ?? {}));
    this.#dirs = new Map(Object.entries(options.dirs ?? {}));
    this.#symlinks = new Map(Object.entries(options.symlinks ?? {}));
    this.#others = new Set(options.others ?? []);
    this.#errors = new Map(Object.entries(options.errors ?? {}));
    this.#caseInsensitive = options.caseInsensitive === true;
  }

  async readText(path: string): Promise<string> {
    const target = this.#resolveForFollowingPrimitive(path);
    const content = this.#files.get(target);
    if (content === undefined) {
      throw codeError(this.#others.has(target) ? "EINVAL" : "ENOENT");
    }
    return typeof content === "string" ? content : new TextDecoder().decode(content);
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const target = this.#resolveForFollowingPrimitive(path);
    const content = this.#files.get(target);
    if (content === undefined) {
      throw codeError(this.#others.has(target) ? "EINVAL" : "ENOENT");
    }
    return typeof content === "string"
      ? new TextEncoder().encode(content)
      : new Uint8Array(content);
  }

  async writeText(path: string, contents: string): Promise<void> {
    const injected = this.#errors.get(path);
    if (injected !== undefined) {
      throw codeError(injected);
    }
    this.#files.set(path, contents);
  }

  async exists(path: string): Promise<boolean> {
    const injected = this.#errors.get(path);
    if (injected !== undefined) {
      if (injected === "ENOENT") {
        return false;
      }
      throw codeError(injected);
    }
    return (
      this.#files.has(path) ||
      this.#dirs.has(path) ||
      this.#symlinks.has(path) ||
      this.#others.has(path)
    );
  }

  homedir(): string {
    return this.#homedir;
  }

  cwd(): string {
    return this.#cwd;
  }

  configDirName(): string {
    return ".pi";
  }

  // The Pi-shaped default that pairs with `configDirName()` above: with no
  // `PI_CODING_AGENT_DIR` relocation Pi's own `getAgentDir()` answers exactly
  // `<homedir>/.pi/agent`, so every fixture written against that spelling keeps
  // reading the same paths. A suite that needs a RELOCATED global directory —
  // the case a directory name cannot express — decorates this fake and
  // overrides this member (see tests/host-config-dir.test.ts).
  globalAgentDir(): string {
    return `${this.#homedir}/.pi/agent`;
  }

  async readdir(path: string): Promise<readonly string[]> {
    const target = this.#resolveForFollowingPrimitive(path);
    const entries = this.#dirs.get(target);
    if (entries === undefined) {
      throw codeError(
        this.#others.has(target) || this.#files.has(target) ? "ENOTDIR" : "ENOENT",
      );
    }
    // Returned verbatim — no Unicode normalisation, per the entry-name guarantee.
    return entries;
  }

  async lstat(path: string): Promise<FileStat> {
    const injected = this.#errors.get(path);
    if (injected !== undefined) {
      throw codeError(injected);
    }
    // `lstat` does NOT follow symlinks: a symlink path stats as a symbolic link.
    if (this.#symlinks.has(path)) {
      return new FakeStat("symlink");
    }
    if (this.#dirs.has(path)) {
      return new FakeStat("dir");
    }
    if (this.#files.has(path)) {
      return new FakeStat("file");
    }
    if (this.#others.has(path)) {
      return new FakeStat("other");
    }
    throw codeError("ENOENT");
  }

  async realpath(path: string): Promise<string> {
    const canonical = this.#resolveExisting(this.#resolveForFollowingPrimitive(path));
    if (canonical === undefined) {
      throw codeError("ENOENT");
    }
    return canonical;
  }

  /**
   * The path a link-following primitive actually operates on: the injected
   * rejection for the requested path (and, when resolution moves it, for the
   * resolved path) is raised first, then every symlinked component is followed
   * transitively. This is the host contract `PiFileSystem` inherits from Node —
   * only `lstat` bypasses it — and DISC-2's implementation note leans on it:
   * "The candidate path itself is checked with `readdir` or `stat` first"
   * (docs/spec_topics/discovery/discovery-sources.md, DISC-2 clean-leaf note).
   */
  #resolveForFollowingPrimitive(path: string): string {
    const injected = this.#errors.get(path);
    if (injected !== undefined) {
      throw codeError(injected);
    }
    const resolved = this.#followLinks(path, 0);
    if (resolved !== path) {
      const onTarget = this.#errors.get(resolved);
      if (onTarget !== undefined) {
        throw codeError(onTarget);
      }
    }
    return resolved;
  }

  /** Follow symlinks at every component of an absolute path; a chain deeper
   *  than the host's own limit — which a cycle always is — rejects `ELOOP`. */
  #followLinks(path: string, depth: number): string {
    if (depth > 40) {
      throw codeError("ELOOP");
    }
    if (!path.startsWith("/")) {
      return path;
    }
    let current = "";
    for (const segment of path.split("/")) {
      if (segment.length === 0) {
        continue;
      }
      current = `${current}/${segment}`;
      const target = this.#lookupSymlink(current);
      if (target !== undefined) {
        current = this.#followLinks(target, depth + 1);
        if (current.length > 1 && current.endsWith("/")) {
          current = current.slice(0, -1);
        }
      }
    }
    return current === "" ? "/" : current;
  }

  /** Immediate symlink target for a path, honouring case-insensitive matching. */
  #lookupSymlink(path: string): string | undefined {
    const exact = this.#symlinks.get(path);
    if (exact !== undefined) {
      return exact;
    }
    if (this.#caseInsensitive) {
      for (const [key, value] of this.#symlinks) {
        if (key.toLowerCase() === path.toLowerCase()) {
          return value;
        }
      }
    }
    return undefined;
  }

  /**
   * Canonical spelling of an existing (non-symlink) path among files, dirs and
   * non-regular entries, or
   * `undefined` if no such entry exists. Under case-insensitivity the returned
   * value is the on-disk key spelling, so case-variant inputs to one entry
   * yield byte-identical output (the case-canonicalisation guarantee).
   */
  #resolveExisting(path: string): string | undefined {
    if (this.#files.has(path) || this.#dirs.has(path) || this.#others.has(path)) {
      return path;
    }
    if (this.#caseInsensitive) {
      const lower = path.toLowerCase();
      for (const key of [...this.#files.keys(), ...this.#dirs.keys(), ...this.#others]) {
        if (key.toLowerCase() === lower) {
          return key;
        }
      }
    }
    return undefined;
  }
}
