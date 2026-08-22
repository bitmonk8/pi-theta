import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PiFileSystem } from "../src/seams/pi-file-system";
import { FakeFileSystem } from "./helpers/fake-file-system";
import type { FileSystem } from "../src/seams/file-system";

// V8b-T — failing tests for the paired `V8b` `FileSystem` seam implementation
// (`PiFileSystem` production adapter + in-memory `FakeFileSystem`). The bullets
// trace to PIC-13 (host-interfaces-services.md) and lexical.md §Encoding.
//
// These tests red because the V8b adapters are stubs that throw — the
// implementation under test is absent. Each assertion names the specific
// PIC-13 / §Encoding behaviour it pins so the red is on the assertion, not a
// fixture or harness throw.

/** Resolve the Node-style `.code` a rejecting promise carries (undefined if it resolves). */
async function rejectionCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code;
  }
  return undefined;
}

// --------------------------------------------------------------------------
// FakeFileSystem — drives the PIC-13 seam contract at chosen boundaries.
// --------------------------------------------------------------------------

describe("V8b — FakeFileSystem (PIC-13 seam contract)", () => {
  const HOME = "/home/theta";
  const CWD = "/project";
  const INVALID_UTF8 = new Uint8Array([0x68, 0x69, 0xff, 0xfe]); // "hi" + lone bytes

  function fake(extra: Partial<{
    files: Record<string, string | Uint8Array>;
    dirs: Record<string, readonly string[]>;
    symlinks: Record<string, string>;
    others: readonly string[];
    errors: Record<string, string>;
    caseInsensitive: boolean;
  }> = {}): FileSystem {
    return new FakeFileSystem({
      homedir: HOME,
      cwd: CWD,
      ...extra,
    });
  }

  it("PIC-13: readText returns the injected file content", async () => {
    const fs = fake({ files: { "/a.txt": "hello" } });
    await expect(fs.readText("/a.txt")).resolves.toBe("hello");
  });

  it("PIC-13: readText rejects with `.code === \"ENOENT\"` for a missing path", async () => {
    const fs = fake({ files: { "/a.txt": "hello" } });
    expect(await rejectionCode(fs.readText("/missing.txt"))).toBe("ENOENT");
  });

  it("PIC-13: readText surfaces injected EACCES / EPERM `.code` values unchanged", async () => {
    const fs = fake({ errors: { "/locked": "EACCES", "/denied": "EPERM" } });
    expect(await rejectionCode(fs.readText("/locked"))).toBe("EACCES");
    expect(await rejectionCode(fs.readText("/denied"))).toBe("EPERM");
  });

  it("lexical.md §Encoding: readBytes returns the raw pre-decode bytes (Uint8Array), preserving invalid UTF-8", async () => {
    const fs = fake({ files: { "/src.theta": INVALID_UTF8 } });
    const bytes = await fs.readBytes("/src.theta");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual(Array.from(INVALID_UTF8));
  });

  it("lexical.md §Encoding: readBytes carries the same ENOENT / EACCES / EPERM `.code` mapping as readText", async () => {
    const fs = fake({ errors: { "/locked": "EACCES", "/denied": "EPERM" } });
    expect(await rejectionCode(fs.readBytes("/missing.theta"))).toBe("ENOENT");
    expect(await rejectionCode(fs.readBytes("/locked"))).toBe("EACCES");
    expect(await rejectionCode(fs.readBytes("/denied"))).toBe("EPERM");
  });

  it("PIC-13: writeText then readText round-trips the contents", async () => {
    const fs = fake();
    await fs.writeText("/out.txt", "written");
    await expect(fs.readText("/out.txt")).resolves.toBe("written");
  });

  it("PIC-13: exists resolves true for a present path and false on ENOENT", async () => {
    const fs = fake({ files: { "/a.txt": "x" } });
    await expect(fs.exists("/a.txt")).resolves.toBe(true);
    await expect(fs.exists("/missing.txt")).resolves.toBe(false);
  });

  it("PIC-13: exists rejects (does not resolve false) on a non-ENOENT error", async () => {
    const fs = fake({ errors: { "/locked": "EACCES" } });
    expect(await rejectionCode(fs.exists("/locked"))).toBe("EACCES");
  });

  it("PIC-13: homedir() returns the constructor-injected value (no process.env read)", () => {
    expect(fake().homedir()).toBe(HOME);
  });

  it("PIC-13: cwd() returns the constructor-injected value (no process.cwd() read)", () => {
    expect(fake().cwd()).toBe(CWD);
  });

  it("PIC-13: readdir returns entry names only (no full paths)", async () => {
    const fs = fake({ dirs: { "/d": ["a.theta", "b.thetalib", "sub"] } });
    await expect(fs.readdir("/d")).resolves.toEqual(["a.theta", "b.thetalib", "sub"]);
  });

  it("PIC-13 entry-name encoding guarantee: readdir returns NFD bytes un-normalised (not folded to NFC)", async () => {
    const nfd = "cafe\u0301"; // c a f e + COMBINING ACUTE ACCENT (NFD spelling of "café")
    const nfc = "caf\u00e9"; // precomposed é (NFC)
    const fs = fake({ dirs: { "/d": [nfd] } });
    const entries = await fs.readdir("/d");
    expect(entries).toEqual([nfd]);
    expect(entries[0]).not.toBe(nfc);
  });

  it("PIC-13: readdir rejects with the Node-style `.code` mapping", async () => {
    const fs = fake({ errors: { "/locked": "EACCES" } });
    expect(await rejectionCode(fs.readdir("/missing"))).toBe("ENOENT");
    expect(await rejectionCode(fs.readdir("/locked"))).toBe("EACCES");
  });

  it("PIC-13: lstat does NOT follow symlinks — a symlink path stats as a symbolic link", async () => {
    const fs = fake({
      files: { "/target": "x" },
      symlinks: { "/link": "/target" },
    });
    const st = await fs.lstat("/link");
    expect(st.isSymbolicLink()).toBe(true);
    expect(st.isFile()).toBe(false);
  });

  it("PIC-13: lstat reports file vs directory and rejects with the `.code` mapping", async () => {
    const fs = fake({ files: { "/f": "x" }, dirs: { "/d": [] } });
    expect((await fs.lstat("/f")).isFile()).toBe(true);
    expect((await fs.lstat("/d")).isDirectory()).toBe(true);
    expect(await rejectionCode(fs.lstat("/missing"))).toBe("ENOENT");
  });

  // The link-following split PIC-13 inherits from Node, and the axis DISC-2's
  // clean-leaf note leans on: "The candidate path itself is checked with
  // `readdir` or `stat` first" (discovery-sources.md:68) presupposes that those
  // primitives resolve a link while `lstat` does not. The mirror-image
  // assertions against the real `PiFileSystem` over a Windows junction are in
  // the production-adapter describe below.
  it("PIC-13: readdir follows a link and enumerates the target directory's entries", async () => {
    const fs = fake({
      dirs: { "/real": ["greet.theta"] },
      files: { "/real/greet.theta": "x" },
      symlinks: { "/link": "/real" },
    });
    await expect(fs.readdir("/link")).resolves.toEqual(["greet.theta"]);
  });

  it("PIC-13: readText follows a link at a non-final path component", async () => {
    const fs = fake({
      dirs: { "/real": ["greet.theta"] },
      files: { "/real/greet.theta": "body" },
      symlinks: { "/link": "/real" },
    });
    await expect(fs.readText("/link/greet.theta")).resolves.toBe("body");
  });

  it("PIC-13: lstat alone does NOT follow a link to a directory", async () => {
    const fs = fake({
      dirs: { "/real": ["greet.theta"] },
      symlinks: { "/link": "/real" },
    });
    const st = await fs.lstat("/link");
    expect(st.isDirectory()).toBe(false);
    expect(st.isSymbolicLink()).toBe(true);
  });

  it("PIC-13: a non-regular, non-directory entry lstats as neither file nor directory nor link", async () => {
    // A fifo / socket / device node — the only input class for which DISC-2's
    // wrong-type column stays reachable through a candidate that resolves.
    const fs = fake({ others: ["/fifo"] });
    const st = await fs.lstat("/fifo");
    expect(st.isFile()).toBe(false);
    expect(st.isDirectory()).toBe(false);
    expect(st.isSymbolicLink()).toBe(false);
    expect(await rejectionCode(fs.readdir("/fifo"))).toBe("ENOTDIR");
    await expect(fs.realpath("/fifo")).resolves.toBe("/fifo");
  });

  it("PIC-13: realpath follows symlinks transitively to a canonical absolute path", async () => {
    const fs = fake({
      files: { "/real/target": "x" },
      symlinks: { "/a": "/b", "/b": "/real/target" },
    });
    await expect(fs.realpath("/a")).resolves.toBe("/real/target");
  });

  it("PIC-13: realpath rejects ELOOP on a symlink cycle", async () => {
    const fs = fake({ symlinks: { "/x": "/y", "/y": "/x" } });
    expect(await rejectionCode(fs.realpath("/x"))).toBe("ELOOP");
  });

  it("PIC-13: realpath rejects ENOENT on a missing component and EACCES / EPERM on permission failure", async () => {
    const fs = fake({
      symlinks: { "/dangling": "/gone" },
      errors: { "/denied": "EPERM" },
    });
    expect(await rejectionCode(fs.realpath("/dangling"))).toBe("ENOENT");
    expect(await rejectionCode(fs.realpath("/denied"))).toBe("EPERM");
  });

  it("PIC-13 byte-stable canonical-output guarantee: two inputs naming one target yield byte-identical realpath output", async () => {
    const fs = fake({
      files: { "/real/target": "x" },
      symlinks: { "/link": "/real/target" },
    });
    const viaLink = await fs.realpath("/link");
    const direct = await fs.realpath("/real/target");
    expect(viaLink).toBe(direct);
  });

  it("PIC-13 case-canonicalisation guarantee: case-variant inputs to one entry yield byte-identical realpath output", async () => {
    const fs = fake({
      files: { "/Project/File": "x" },
      caseInsensitive: true,
    });
    const lower = await fs.realpath("/project/file");
    const mixed = await fs.realpath("/Project/File");
    expect(lower).toBe(mixed);
  });
});

// --------------------------------------------------------------------------
// PiFileSystem — production adapter delegating to Node, exercised on disk.
// --------------------------------------------------------------------------

describe("V8b — PiFileSystem (PIC-13 production adapter)", () => {
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "theta-v8b-"));
    await writeFile(path.join(dir, "text.txt"), "hello", "utf8");
    await writeFile(path.join(dir, "raw.theta"), Buffer.from([0x68, 0x69, 0xff, 0xfe]));
    await mkdir(path.join(dir, "subdir"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("PIC-13: readText reads a real file's text content", async () => {
    const fs = new PiFileSystem();
    await expect(fs.readText(path.join(dir, "text.txt"))).resolves.toBe("hello");
  });

  it("lexical.md §Encoding: readBytes returns the file's raw pre-decode bytes including invalid UTF-8", async () => {
    const fs = new PiFileSystem();
    const bytes = await fs.readBytes(path.join(dir, "raw.theta"));
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual([0x68, 0x69, 0xff, 0xfe]);
  });

  it("PIC-13: readText and readBytes reject with `.code === \"ENOENT\"` for a missing path", async () => {
    const fs = new PiFileSystem();
    const missing = path.join(dir, "nope.txt");
    expect(await rejectionCode(fs.readText(missing))).toBe("ENOENT");
    expect(await rejectionCode(fs.readBytes(missing))).toBe("ENOENT");
  });

  it("PIC-13: writeText writes a real file readable by readText", async () => {
    const fs = new PiFileSystem();
    const p = path.join(dir, "written.txt");
    await fs.writeText(p, "round-trip");
    await expect(fs.readText(p)).resolves.toBe("round-trip");
  });

  it("PIC-13: exists resolves true for a present path and false for a missing one", async () => {
    const fs = new PiFileSystem();
    await expect(fs.exists(path.join(dir, "text.txt"))).resolves.toBe(true);
    await expect(fs.exists(path.join(dir, "absent.txt"))).resolves.toBe(false);
  });

  it("PIC-13: homedir() reports os.homedir() and never reads process.env", () => {
    const fs = new PiFileSystem();
    expect(fs.homedir()).toBe(os.homedir());
  });

  it("PIC-13: cwd() captures the working directory once at construction (never re-reads process.cwd())", () => {
    const original = process.cwd();
    const fs = new PiFileSystem();
    const captured = fs.cwd();
    expect(captured).toBe(original);
    const tmp = mkdtempSync(path.join(os.tmpdir(), "theta-cwd-"));
    try {
      process.chdir(tmp);
      // Captured once at construction — a later process.chdir must not change it.
      expect(fs.cwd()).toBe(captured);
    } finally {
      process.chdir(original);
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("PIC-13: readdir returns entry names only (no full paths)", async () => {
    const fs = new PiFileSystem();
    const entries = await fs.readdir(dir);
    expect(entries).toContain("text.txt");
    expect(entries).toContain("subdir");
    expect(entries).not.toContain(path.join(dir, "text.txt"));
  });

  it("PIC-13: lstat reports file vs directory", async () => {
    const fs = new PiFileSystem();
    expect((await fs.lstat(path.join(dir, "text.txt"))).isFile()).toBe(true);
    expect((await fs.lstat(path.join(dir, "subdir"))).isDirectory()).toBe(true);
  });

  it("PIC-13 byte-stable canonical-output guarantee: realpath yields one canonical path for equivalent inputs", async () => {
    const fs = new PiFileSystem();
    const a = await fs.realpath(path.join(dir, "subdir"));
    const b = await fs.realpath(path.join(dir, "subdir") + path.sep + "." );
    expect(a).toBe(b);
  });

  it("PIC-13: realpath rejects with `.code === \"ENOENT\"` when a path component is missing", async () => {
    const fs = new PiFileSystem();
    expect(await rejectionCode(fs.realpath(path.join(dir, "missing", "leaf")))).toBe("ENOENT");
  });

  // The host behaviour `FakeFileSystem` is required to mirror on the
  // link-following axis (the fake's describe above asserts the same three
  // facts). A JUNCTION, not a symlink:
  // `fs.symlink` for a directory needs privileges on Windows and a junction
  // does not, so a junction is the default-privilege way to point a discovery
  // root at a checked-out thetas directory — and Node reports it as a symlink.
  it("PIC-13: readdir and readText follow a directory junction that lstat reports as a link", async () => {
    const fs = new PiFileSystem();
    const target = path.join(dir, "junction-target");
    const link = path.join(dir, "junction-link");
    await mkdir(target);
    await writeFile(path.join(target, "greet.theta"), "body", "utf8");
    symlinkSync(target, link, "junction");

    await expect(fs.readdir(link)).resolves.toEqual(["greet.theta"]);
    await expect(fs.readText(path.join(link, "greet.theta"))).resolves.toBe("body");
    const st = await fs.lstat(link);
    expect(st.isDirectory()).toBe(false);
    expect(st.isSymbolicLink()).toBe(true);
  });
});
