import { describe, expect, it } from "vitest";
import {
  discoverPackageLooms,
  type PackageDiscoveredLoom,
  type PackageDiscoveryInput,
  type PackageDiscoveryResult,
} from "../src/discovery/package-discovery";
import type { LoomSettings } from "../src/discovery/settings";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { FileStat, FileSystem } from "../src/seams/file-system";
import { FakeFileSystem } from "./helpers/fake-file-system";
import { FakeClock } from "./helpers/fake-clock";

// V10b-T — failing tests for the paired `V10b` package-discovery bounded walk
// (`src/discovery/package-discovery.ts`). The bullets trace to DISC-5 (`pi.looms`
// shape + minimatch `!`/`+`/`-` override order + file/dir/other rules) and
// DISC-6 (the file-count / wall-clock walk bounds, the per-read deadline, and
// the file-count-before-time tie-break) in discovery/package-and-settings.md,
// with diagnostic codes/messages sourced from the diagnostics/code-registry-
// load.md *Message* column.
//
// These tests red because the V10b `discoverPackageLooms` body is absent — the
// stub returns an empty looms/diagnostics result, so each assertion reds on the
// missing loom, the missing diagnostic, or the missing read, not on a compile
// error, an unconfigured fixture, or a harness throw.

const HOME = "/home/loom";
const CWD = "/project";
const NM = "/project/node_modules"; // the priority-4 node_modules package root

// --------------------------------------------------------------------------
// Fixture + seam helpers.
// --------------------------------------------------------------------------

interface FakeSpec {
  readonly dirs?: Record<string, readonly string[]>;
  readonly files?: Record<string, string>;
  readonly errors?: Record<string, string>;
  readonly symlinks?: Record<string, string>;
}

function baseFs(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: spec.dirs ?? {},
    files: spec.files ?? {},
    errors: spec.errors ?? {},
    symlinks: spec.symlinks ?? {},
  });
}

/**
 * A `FileSystem` decorator that counts `package.json` read attempts and, for a
 * configured set of paths, hangs the read forever (a never-settling promise) so
 * the walk's per-read deadline race — armed through the injected `Clock` — is
 * the only thing that can settle that candidate. Test code is unrestricted, so
 * this drives the DISC-6 per-read-timeout / global-timeout surface deterministically.
 */
class InstrumentedFileSystem implements FileSystem {
  packageJsonReads = 0;
  readonly #base: FakeFileSystem;
  readonly #hang: ReadonlySet<string>;

  constructor(base: FakeFileSystem, hang: Iterable<string> = []) {
    this.#base = base;
    this.#hang = new Set(hang);
  }

  #enterRead(path: string): Promise<never> | undefined {
    if (path.endsWith("/package.json")) {
      this.packageJsonReads++;
    }
    if (this.#hang.has(path)) {
      return new Promise<never>(() => {}); // never settles — only the deadline can win
    }
    return undefined;
  }

  async readText(path: string): Promise<string> {
    const hung = this.#enterRead(path);
    if (hung !== undefined) return hung;
    return this.#base.readText(path);
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const hung = this.#enterRead(path);
    if (hung !== undefined) return hung;
    return this.#base.readBytes(path);
  }

  writeText(path: string, contents: string): Promise<void> {
    return this.#base.writeText(path, contents);
  }
  exists(path: string): Promise<boolean> {
    return this.#base.exists(path);
  }
  homedir(): string {
    return this.#base.homedir();
  }
  cwd(): string {
    return this.#base.cwd();
  }
  readdir(path: string): Promise<readonly string[]> {
    return this.#base.readdir(path);
  }
  lstat(path: string): Promise<FileStat> {
    return this.#base.lstat(path);
  }
  realpath(path: string): Promise<string> {
    return this.#base.realpath(path);
  }
}

function makeInput(
  fs: FileSystem,
  clock: FakeClock,
  settings: LoomSettings,
): PackageDiscoveryInput {
  return { fs, clock, settings };
}

/** Flush the microtask queue so a suspended walk advances to its next await. */
async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

/**
 * Drive a walk that suspends on hung `package.json` reads: flush microtasks so
 * the walk reaches its per-read deadline race, then advance the `FakeClock` by
 * `step`, repeating enough times to fire every deadline. Extra advances after
 * the walk resolves are harmless (no pending timers remain).
 */
async function drive(
  input: PackageDiscoveryInput,
  clock: FakeClock,
  step: number,
  iterations = 24,
): Promise<PackageDiscoveryResult> {
  const p = discoverPackageLooms(input);
  for (let i = 0; i < iterations; i++) {
    await flush();
    clock.advance(step);
  }
  await flush();
  return p;
}

function byCode(diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

function named(
  looms: readonly PackageDiscoveredLoom[],
  name: string,
): PackageDiscoveredLoom | undefined {
  return looms.find((l) => l.name === name);
}

/** package.json contents naming a `pi.looms` array (or the raw value verbatim). */
function manifest(piLooms: unknown): string {
  return JSON.stringify({ name: "unused", pi: { looms: piLooms } });
}

// ==========================================================================
// DISC-5 — `pi.looms` shape, minimatch override order, file/dir/other rules.
// ==========================================================================

describe("V10b-T — DISC-5 package manifest resolution", () => {
  it("DISC-5: a `pi.looms` that is not a string[] fires loom/load/manifest-invalid (error); the package contributes no looms and siblings still process", async () => {
    const fs = baseFs({
      dirs: {
        [NM]: ["bad", "good"],
        [`${NM}/bad`]: ["package.json"],
        [`${NM}/good`]: ["package.json", "g.loom"],
      },
      files: {
        [`${NM}/bad/package.json`]: manifest("not-an-array"),
        [`${NM}/good/package.json`]: manifest(["*.loom"]),
        [`${NM}/good/g.loom`]: "mode: prompt\n---\n",
      },
    });
    const { looms, diagnostics } = await discoverPackageLooms(
      makeInput(fs, new FakeClock(), {}),
    );
    const invalid = byCode(diagnostics, "loom/load/manifest-invalid");
    expect(invalid).toHaveLength(1);
    expect(invalid[0]!.severity).toBe("error");
    // Message names the offending package (registry Message column).
    expect(invalid[0]!.message).toContain("bad");
    expect(invalid[0]!.message).toContain("expected string[]");
    expect(named(looms, "g")).toBeDefined(); // the valid sibling still processes
  });

  it("DISC-5: `pi.looms` globs resolve `!`/`+`/`-` in the fixed order — `-` takes final precedence over a `+` re-admission", async () => {
    // Universe {a,b,c,x}. `*.loom` includes all; `!b` drops b then `+b` re-admits
    // it (b survives); `!x` drops x, `+x` re-admits, `-x` removes it (x drops,
    // proving step-4 `-` beats step-3 `+`). Final registered: a, b, c.
    const fs = baseFs({
      dirs: {
        [NM]: ["ord"],
        [`${NM}/ord`]: ["package.json", "a.loom", "b.loom", "c.loom", "x.loom"],
      },
      files: {
        [`${NM}/ord/package.json`]: manifest([
          "*.loom",
          "!b.loom",
          "+b.loom",
          "!x.loom",
          "+x.loom",
          "-x.loom",
        ]),
        [`${NM}/ord/a.loom`]: "mode: prompt\n---\n",
        [`${NM}/ord/b.loom`]: "mode: prompt\n---\n",
        [`${NM}/ord/c.loom`]: "mode: prompt\n---\n",
        [`${NM}/ord/x.loom`]: "mode: prompt\n---\n",
      },
    });
    const { looms } = await discoverPackageLooms(makeInput(fs, new FakeClock(), {}));
    expect(named(looms, "a")).toBeDefined();
    expect(named(looms, "b")).toBeDefined(); // dropped by `!`, re-admitted by `+`
    expect(named(looms, "c")).toBeDefined();
    expect(named(looms, "x")).toBeUndefined(); // `-` overrides the `+` re-admission
  });

  it("DISC-5: file/dir/other match rules — a `.loom` match registers directly, a directory match is scanned non-recursively, any other file type is filtered silently", async () => {
    const fs = baseFs({
      dirs: {
        [NM]: ["mix"],
        [`${NM}/mix`]: ["package.json", "single.loom", "sub", "notes.md"],
        [`${NM}/mix/sub`]: ["d.loom", "deeper"],
        [`${NM}/mix/sub/deeper`]: ["deep.loom"],
      },
      files: {
        [`${NM}/mix/package.json`]: manifest(["single.loom", "sub", "notes.md"]),
        [`${NM}/mix/single.loom`]: "mode: prompt\n---\n",
        [`${NM}/mix/notes.md`]: "not a loom",
        [`${NM}/mix/sub/d.loom`]: "mode: prompt\n---\n",
        [`${NM}/mix/sub/deeper/deep.loom`]: "mode: prompt\n---\n",
      },
    });
    const { looms } = await discoverPackageLooms(makeInput(fs, new FakeClock(), {}));
    expect(named(looms, "single")).toBeDefined(); // `.loom` file match → direct
    expect(named(looms, "d")).toBeDefined(); // directory match → non-recursive scan
    expect(named(looms, "deep")).toBeUndefined(); // nested subdir is NOT recursed
    expect(named(looms, "notes")).toBeUndefined(); // non-`.loom` file filtered silently
  });

  it("DISC-5: a `pi.looms` entry resolving outside the package root fires loom/load/manifest-escapes-package (warning) per entry; in-root entries still process", async () => {
    const fs = baseFs({
      dirs: {
        [NM]: ["esc"],
        [`${NM}/esc`]: ["package.json", "in.loom"],
      },
      files: {
        [`${NM}/esc/package.json`]: manifest(["../outside.loom", "in.loom"]),
        [`${NM}/esc/in.loom`]: "mode: prompt\n---\n",
        [`${NM}/outside.loom`]: "mode: prompt\n---\n",
      },
    });
    const { looms, diagnostics } = await discoverPackageLooms(
      makeInput(fs, new FakeClock(), {}),
    );
    const escapes = byCode(diagnostics, "loom/load/manifest-escapes-package");
    expect(escapes).toHaveLength(1);
    expect(escapes[0]!.severity).toBe("warning");
    expect(escapes[0]!.message).toContain("esc"); // names the package
    expect(named(looms, "in")).toBeDefined(); // in-root entry still processes
    expect(named(looms, "outside")).toBeUndefined(); // the escaping entry is skipped
  });
});

// ==========================================================================
// DISC-6 — the bounded walk (file-count / wall-clock caps, per-read deadline,
// tie-break), and the settings-sourced bounds reaching the walk.
// ==========================================================================

/** Register `count` node_modules packages, each shipping one `pN.loom` via `pi.looms`. */
function manyPackages(count: number): FakeSpec {
  const dirs: Record<string, readonly string[]> = { [NM]: [] };
  const files: Record<string, string> = {};
  const names: string[] = [];
  for (let i = 1; i <= count; i++) {
    const name = `p${i}`;
    names.push(name);
    dirs[`${NM}/${name}`] = ["package.json", `${name}.loom`];
    files[`${NM}/${name}/package.json`] = manifest(["*.loom"]);
    files[`${NM}/${name}/${name}.loom`] = "mode: prompt\n---\n";
  }
  dirs[NM] = names;
  return { dirs, files };
}

describe("V10b-T — DISC-6 bounded walk", () => {
  it("DISC-6: the walk trips loom/load/discovery-slow at the operator `looms.scanPackagesMaxFiles` value (distinct from the 2000 default); packages after the cap contribute nothing", async () => {
    // maxFiles = 3, five candidate packages → the cap fires; a walk that ignored
    // the setting and used the hardcoded 2000 constant would never trip here.
    const fs = baseFs(manyPackages(5));
    const { looms, diagnostics } = await discoverPackageLooms(
      makeInput(fs, new FakeClock(), { looms: { scanPackagesMaxFiles: 3 } }),
    );
    const slow = byCode(diagnostics, "loom/load/discovery-slow");
    expect(slow).toHaveLength(1);
    expect(slow[0]!.severity).toBe("warning");
    expect(slow[0]!.message).toContain(NM); // names the root being scanned
    expect(slow[0]!.message).toContain("scanPackagesMaxFiles"); // the cap that fired
    expect(looms).toHaveLength(3); // only the first three packages contributed
  });

  it("DISC-6: the walk trips loom/load/discovery-slow at the operator `looms.scanPackagesTimeoutMs` value (distinct from the 2000 default), driven through the FakeClock seam", async () => {
    // timeoutMs = 500 → per-read deadline 200; four hung reads advance fake time
    // 200ms each, so the elapsed cap crosses 500 at the fourth cap-check. A walk
    // ignoring the setting (hardcoded 2000ms) would not trip within these reads.
    const hang = [1, 2, 3, 4].map((i) => `${NM}/p${i}/package.json`);
    const fs = new InstrumentedFileSystem(baseFs(manyPackages(4)), hang);
    const clock = new FakeClock();
    const { diagnostics } = await drive(
      makeInput(fs, clock, { looms: { scanPackagesTimeoutMs: 500 } }),
      clock,
      200,
    );
    const slow = byCode(diagnostics, "loom/load/discovery-slow");
    expect(slow.length).toBeGreaterThanOrEqual(1);
    expect(slow[0]!.message).toContain("scanPackagesTimeoutMs"); // time cap fired
    expect(slow[0]!.message).not.toContain("scanPackagesMaxFiles");
  });

  it("DISC-6: when both caps are simultaneously satisfied at one cap-check site, the file-count predicate is consulted before time — the warning's cap is `looms.scanPackagesMaxFiles`", async () => {
    // maxFiles = 2, timeoutMs = 400 → per-read deadline 200. Two hung reads
    // advance fake time to 400 while the file count reaches 2, so the third
    // cap-check sees BOTH predicates true; the tie resolves to the file cap.
    const hang = [1, 2, 3].map((i) => `${NM}/p${i}/package.json`);
    const fs = new InstrumentedFileSystem(baseFs(manyPackages(3)), hang);
    const clock = new FakeClock();
    const { diagnostics } = await drive(
      makeInput(fs, clock, {
        looms: { scanPackagesMaxFiles: 2, scanPackagesTimeoutMs: 400 },
      }),
      clock,
      200,
    );
    const slow = byCode(diagnostics, "loom/load/discovery-slow");
    expect(slow.length).toBeGreaterThanOrEqual(1);
    expect(slow[0]!.message).toContain("scanPackagesMaxFiles"); // file-count wins the tie
    expect(slow[0]!.message).not.toContain("scanPackagesTimeoutMs");
  });

  it("DISC-6: `looms.scanPackages: false` skips the walk wholesale — zero candidate `package.json` reads — while an otherwise-identical enabled walk reads and contributes", async () => {
    // Disabled: no package.json is opened at all.
    const disabledFs = new InstrumentedFileSystem(baseFs(manyPackages(1)));
    const disabled = await discoverPackageLooms(
      makeInput(disabledFs, new FakeClock(), { looms: { scanPackages: false } }),
    );
    // Enabled control (default scanPackages): the same fixture IS walked.
    const enabledFs = new InstrumentedFileSystem(baseFs(manyPackages(1)));
    const enabled = await discoverPackageLooms(makeInput(enabledFs, new FakeClock(), {}));

    // Primary red on the stub: the enabled walk must read and contribute.
    expect(enabledFs.packageJsonReads).toBeGreaterThan(0);
    expect(named(enabled.looms, "p1")).toBeDefined();
    // The disabled walk opens nothing and contributes nothing.
    expect(disabledFs.packageJsonReads).toBe(0);
    expect(disabled.looms).toHaveLength(0);
  });

  it("DISC-6: a candidate `package.json` read exceeding the per-read deadline fires loom/load/package-read-timeout (warning, details.kind) at the default 200ms deadline; the walk continues to the next candidate", async () => {
    // Default timeoutMs 2000 → per-read deadline max(200, floor(2000/10)) = 200.
    const fs = new InstrumentedFileSystem(baseFs({
      dirs: {
        [NM]: ["slow", "fast"],
        [`${NM}/slow`]: ["package.json", "s.loom"],
        [`${NM}/fast`]: ["package.json", "f.loom"],
      },
      files: {
        [`${NM}/slow/package.json`]: manifest(["*.loom"]),
        [`${NM}/slow/s.loom`]: "mode: prompt\n---\n",
        [`${NM}/fast/package.json`]: manifest(["*.loom"]),
        [`${NM}/fast/f.loom`]: "mode: prompt\n---\n",
      },
    }), [`${NM}/slow/package.json`]);
    const clock = new FakeClock();
    const { looms, diagnostics } = await drive(makeInput(fs, clock, {}), clock, 200);
    const timeouts = byCode(diagnostics, "loom/load/package-read-timeout");
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0]!.severity).toBe("warning");
    expect(timeouts[0]!.details?.["kind"]).toBe("package-read-timeout");
    expect(timeouts[0]!.message).toContain("slow"); // names the package
    expect(timeouts[0]!.message).toContain("200ms"); // the derived default deadline
    expect(named(looms, "f")).toBeDefined(); // the walk continued past the timeout
    expect(named(looms, "s")).toBeUndefined(); // the timed-out package contributed nothing
  });

  it("DISC-6: the per-read deadline scales with the operator override — `looms.scanPackagesTimeoutMs` drives it to max(200, floor(override/10)), not a constant 200ms", async () => {
    // timeoutMs = 5000 → per-read deadline max(200, floor(5000/10)) = 500. The
    // rendered `<deadline>` must be 500ms, reddening the misreading that hardcodes
    // a fixed 200ms per-read deadline off the 2000 default.
    const fs = new InstrumentedFileSystem(baseFs({
      dirs: {
        [NM]: ["slow", "fast"],
        [`${NM}/slow`]: ["package.json", "s.loom"],
        [`${NM}/fast`]: ["package.json", "f.loom"],
      },
      files: {
        [`${NM}/slow/package.json`]: manifest(["*.loom"]),
        [`${NM}/slow/s.loom`]: "mode: prompt\n---\n",
        [`${NM}/fast/package.json`]: manifest(["*.loom"]),
        [`${NM}/fast/f.loom`]: "mode: prompt\n---\n",
      },
    }), [`${NM}/slow/package.json`]);
    const clock = new FakeClock();
    const { looms, diagnostics } = await drive(
      makeInput(fs, clock, { looms: { scanPackagesTimeoutMs: 5000 } }),
      clock,
      200,
    );
    const timeouts = byCode(diagnostics, "loom/load/package-read-timeout");
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0]!.message).toContain("500ms"); // scaled deadline, not 200ms
    expect(timeouts[0]!.message).not.toContain("200ms");
    expect(named(looms, "f")).toBeDefined(); // walk still continued
  });
});
