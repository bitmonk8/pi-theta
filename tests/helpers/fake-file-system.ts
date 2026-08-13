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
  /** Symlinks: path → immediate target (resolved transitively by `realpath`). */
  readonly symlinks?: Readonly<Record<string, string>>;
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
    private readonly kind: "file" | "dir" | "symlink",
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
  readonly #errors: Map<string, string>;
  readonly #caseInsensitive: boolean;

  constructor(options: FakeFileSystemOptions) {
    this.#homedir = options.homedir;
    this.#cwd = options.cwd;
    this.#files = new Map(Object.entries(options.files ?? {}));
    this.#dirs = new Map(Object.entries(options.dirs ?? {}));
    this.#symlinks = new Map(Object.entries(options.symlinks ?? {}));
    this.#errors = new Map(Object.entries(options.errors ?? {}));
    this.#caseInsensitive = options.caseInsensitive === true;
  }

  async readText(path: string): Promise<string> {
    const injected = this.#errors.get(path);
    if (injected !== undefined) {
      throw codeError(injected);
    }
    const content = this.#files.get(path);
    if (content === undefined) {
      throw codeError("ENOENT");
    }
    return typeof content === "string" ? content : new TextDecoder().decode(content);
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const injected = this.#errors.get(path);
    if (injected !== undefined) {
      throw codeError(injected);
    }
    const content = this.#files.get(path);
    if (content === undefined) {
      throw codeError("ENOENT");
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
    return this.#files.has(path) || this.#dirs.has(path) || this.#symlinks.has(path);
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
    const injected = this.#errors.get(path);
    if (injected !== undefined) {
      throw codeError(injected);
    }
    const entries = this.#dirs.get(path);
    if (entries === undefined) {
      throw codeError("ENOENT");
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
    throw codeError("ENOENT");
  }

  async realpath(path: string): Promise<string> {
    const seen = new Set<string>();
    let current = path;
    // Follow every symlink on the chain transitively; detect cycles as ELOOP.
    for (;;) {
      const injected = this.#errors.get(current);
      if (injected !== undefined) {
        throw codeError(injected);
      }
      const target = this.#lookupSymlink(current);
      if (target === undefined) {
        break;
      }
      if (seen.has(current)) {
        throw codeError("ELOOP");
      }
      seen.add(current);
      current = target;
    }
    const canonical = this.#resolveExisting(current);
    if (canonical === undefined) {
      throw codeError("ENOENT");
    }
    return canonical;
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
   * Canonical spelling of an existing (non-symlink) path among files/dirs, or
   * `undefined` if no such entry exists. Under case-insensitivity the returned
   * value is the on-disk key spelling, so case-variant inputs to one entry
   * yield byte-identical output (the case-canonicalisation guarantee).
   */
  #resolveExisting(path: string): string | undefined {
    if (this.#files.has(path) || this.#dirs.has(path)) {
      return path;
    }
    if (this.#caseInsensitive) {
      const lower = path.toLowerCase();
      for (const key of [...this.#files.keys(), ...this.#dirs.keys()]) {
        if (key.toLowerCase() === lower) {
          return key;
        }
      }
    }
    return undefined;
  }
}
