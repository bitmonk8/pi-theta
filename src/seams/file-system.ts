// H3a — `FileSystem` seam (PIC-13). Declares the seam interface's full member
// signatures, sourced from host-interfaces-services.md#fakefilesystem--filesystem-interface.
// The per-member behaviour (Node-style `.code` rejection mapping, `homedir()` /
// `cwd()` single-source-of-truth rules, the readdir entry-name encoding
// guarantee, the `realpath` canonicalisation guarantees) is added by the V8*
// leaves implementing the `PiFileSystem` / `FakeFileSystem` adapters.
//
// Spec: host-interfaces-services.md PIC-13.

export interface FileStat {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

export interface FileSystem {
  /** Text read; rejects with Node-style `.code` (`ENOENT` / `EACCES` / `EPERM` / …). */
  readText(path: string): Promise<string>;
  /** Raw, pre-decode byte sequence; same `.code` rejection shape as `readText`. */
  readBytes(path: string): Promise<Uint8Array>;
  writeText(path: string, contents: string): Promise<void>;
  /** Resolves `false` on `ENOENT`; rejects on any other error. */
  exists(path: string): Promise<boolean>;
  /** Single source of truth for home-directory expansion; never reads `process.env`. */
  homedir(): string;
  /** Factory-time working directory captured once; never reads `process.cwd()` ad-hoc. */
  cwd(): string;
  /**
   * The host's config-directory NAME (`".pi"` on Pi, `".omp"` on Oh-My-Pi) — a
   * bare name, not a path, and so only sound where the host itself composes the
   * path from that same static constant. That is exactly the PROJECT-relative
   * set: the `<cwd>/<configDirName>/theta/` discovery root and the descriptor
   * naming it, `<cwd>/<configDirName>/settings.json`, and the project
   * installed-package roots `<cwd>/<configDirName>/npm` and `.../git`. Both
   * hosts do build the project directory from the static constant (Pi's
   * `CONFIG_DIR_NAME`; Oh-My-Pi's `getProjectAgentDir`), so reconstructing
   * those from the name is exact rather than a guess.
   *
   * It is NOT sound for the GLOBAL locations — those come from
   * `globalAgentDir()`, because neither host derives its global agent directory
   * from `<homedir>/<configDirName>/agent` alone.
   *
   * A host-location primitive on this seam beside `homedir()` / `cwd()` for the
   * usual reason — a theta must resolve against the host actually running it,
   * not the one it was authored against. Two independent readers consume the
   * underlying host constant: the project-relative paths above (through this
   * seam), and the subagent child-argv CLI dialect selection, which reads the
   * loaded SDK's `CONFIG_DIR_NAME` directly as its host-identity signal
   * (`resolveHostCliDialect`) rather than going through the `FileSystem` seam,
   * since it runs where no `FileSystem` is in scope.
   */
  configDirName(): string;
  /**
   * The host's OWN resolved global agent directory: the absolute path the host
   * itself reads its global state out of, taken from the host SDK's
   * `getAgentDir()` — never synthesised by this extension. Every GLOBAL
   * conventional location hangs off it: the `<globalAgentDir>/theta/` discovery
   * root, `<globalAgentDir>/settings.json`, the global installed-package roots
   * `<globalAgentDir>/npm` and `.../git`, and the global arm of
   * `thetaPathsBaseDir`.
   *
   * Contrasted with `configDirName()`: a directory NAME cannot reconstruct this
   * path on either host. Pi returns `$PI_CODING_AGENT_DIR` (tilde-expanded)
   * whenever that is set, and Oh-My-Pi resolves
   * `<config-dir>/profiles/<profile>/agent` under an active profile while also
   * honouring a `PI_CONFIG_DIR` override of the config-dir name itself. Under
   * `omp --profile x`, or with either environment variable set,
   * `<homedir>/<configDirName>/agent` is a directory the host never touches, so
   * synthesising it would make a global theta placed where the host actually
   * keeps it — and the global settings file the host actually writes — silently
   * invisible, with no diagnostic to explain the absence.
   */
  globalAgentDir(): string;
  /** Entry names only (no full paths); same `.code` rejection shape as `readText`. */
  readdir(path: string): Promise<readonly string[]>;
  /** Does NOT follow symlinks; same `.code` rejection shape as `readText`. */
  lstat(path: string): Promise<FileStat>;
  /** Resolves symlinks to a canonical absolute path; rejects `ELOOP` / `ENOENT` / `EACCES` / `EPERM`. */
  realpath(path: string): Promise<string>;
}
