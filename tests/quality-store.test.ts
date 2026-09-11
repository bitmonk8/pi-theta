// First unit tests for tools/quality/store.mjs (default suite: offline,
// deterministic, provider-free — spawning node/git children is established
// practice, cf. tests/subagent-child-real-spawn.test.ts and the parse gate's
// own git spawn). Exercises the store against a scratch fixture repo rooted
// via QUALITY_STORE_ROOT (env DI — the store's ROOT constant is computed at
// module top level, before flag parsing, so an env var is the no-restructure
// seam: ROOT is a top-level constant in tools/quality/store.mjs).
//
// Cells 1, 4, 5, 7, 9 fail against the pre-design store.mjs (proving they
// bite); cells 2, 3, 8, 10, 11 pin existing behaviour the refactor must not
// regress.

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const STORE = fileURLToPath(new URL("../tools/quality/store.mjs", import.meta.url));

function runStore(root: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [STORE, ...args], {
    encoding: "utf8",
    env: { ...process.env, QUALITY_STORE_ROOT: root },
  });
}

function git(root: string, ...args: string[]): string {
  const r = spawnSync(
    "git",
    ["-C", root, "-c", "user.name=q", "-c", "user.email=q@q.invalid", ...args],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

/** Exactly n lines of content, ending in a trailing newline (countLines(file) == n). */
function makeLines(n: number): string {
  return Array.from({ length: n }, () => "x").join("\n") + "\n";
}

function writeFile(root: string, relPath: string, content: string): void {
  const abs = join(root, ...relPath.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

function writeSurfaces(root: string): void {
  writeFile(
    root,
    "quality/surfaces.json",
    JSON.stringify(
      {
        D2: { include: ["src/"], exclude: [], ext: [".ts"], shard_loc: 6000 },
        D7: { include: ["tests/"], exclude: ["tests/fixtures/"], ext: [".ts"], shard_loc: 500 },
      },
      null,
      2,
    ) + "\n",
  );
}

function writeIssue(
  root: string,
  filename: string,
  opts: { location: string; status?: string; id?: string },
): void {
  const status = opts.status ?? "open";
  const id = opts.id ?? filename.replace(/\.md$/, "");
  writeFile(
    root,
    `quality/issues/${filename}`,
    [
      "---",
      `id: ${id}`,
      "title: scratch finding",
      "lens: D2",
      `status: ${status}`,
      "verdict: confirmed",
      "locations:",
      `  - ${opts.location}`,
      "sites: 1",
      "fix_scope: localized",
      "wave: w0",
      "reported_by: scratch (test)",
      "date: 2020-01-01",
      "---",
      "",
      "# scratch finding",
      "",
    ].join("\n"),
  );
}

describe("tools/quality/store.mjs (scratch fixture store via QUALITY_STORE_ROOT)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "qstore-"));
    git(root, "init", "-q");
    git(root, "config", "core.autocrlf", "false");
    writeSurfaces(root);
    writeFile(root, "quality/state.json", "{}\n");
    writeFile(root, "src/runtime/a.ts", makeLines(50));
    writeFile(root, "src/extension/b.ts", makeLines(50));
    writeFile(root, "tests/one.test.ts", makeLines(400));
    writeFile(root, "tests/two.test.ts", makeLines(400));
    writeFile(root, "tests/live/x.test.ts", makeLines(100));
    writeFile(root, "tests/fixtures/skip.ts", makeLines(10));
    writeFile(root, "root.ts", makeLines(10));
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "seed fixture");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("cell 1: lenses prints the configured ids sorted, one per line", () => {
    const r = runStore(root, ["lenses"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("D2\nD7\n");
  });

  it("cell 2: needs-review --lens D7 with empty state lists exactly the D7 surface", () => {
    const r = runStore(root, ["needs-review", "--lens", "D7"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("tests/live/x.test.ts\ntests/one.test.ts\ntests/two.test.ts\n");
  });

  it("cell 3: needs-review --lens D9 exits 1 naming the unknown lens", () => {
    const r = runStore(root, ["needs-review", "--lens", "D9"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("unknown lens 'D9'");
  });

  it("cell 4: shard --lens D7 --wave w1 (no --target-loc) uses the per-lens default (500)", () => {
    const r = runStore(root, ["shard", "--lens", "D7", "--wave", "w1"]);
    expect(r.status).toBe(0);
    const manifests = r.stdout.trim().split("\n").filter(Boolean);
    expect(manifests).toEqual(["quality/tmp/w1/D7/shard-01.txt", "quality/tmp/w1/D7/shard-02.txt"]);
    const union = new Set<string>();
    for (const m of manifests) {
      const lines = readFileSync(join(root, m), "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      for (const l of lines) union.add(l);
    }
    const needsReview = runStore(root, ["needs-review", "--lens", "D7"]).stdout
      .trim()
      .split("\n")
      .filter(Boolean);
    expect([...union].sort()).toEqual(needsReview.sort());

    // --target-loc 0 behaves identically (0 == absent).
    const r0 = runStore(root, ["shard", "--lens", "D7", "--wave", "w1z", "--target-loc", "0"]);
    expect(r0.status).toBe(0);
    expect(r0.stdout.trim().split("\n").filter(Boolean)).toEqual([
      "quality/tmp/w1z/D7/shard-01.txt",
      "quality/tmp/w1z/D7/shard-02.txt",
    ]);
  });

  it("cell 5: --target-loc overrides the per-lens default; per-lens defaults are independent", () => {
    const r7 = runStore(root, ["shard", "--lens", "D7", "--wave", "w2", "--target-loc", "2000"]);
    expect(r7.status).toBe(0);
    expect(r7.stdout.trim().split("\n").filter(Boolean).length).toBe(1);

    const r2 = runStore(root, ["shard", "--lens", "D2", "--wave", "w2"]);
    expect(r2.status).toBe(0);
    expect(r2.stdout.trim().split("\n").filter(Boolean).length).toBe(1);
  });

  it("cell 6: --target-loc below the floor exits 1", () => {
    const r = runStore(root, ["shard", "--lens", "D7", "--wave", "w-floor", "--target-loc", "100"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("--target-loc");
  });

  it("cell 7: --max-shards emits the path-contiguous prefix; the remainder stays due", () => {
    const r1 = runStore(root, ["shard", "--lens", "D7", "--wave", "w3", "--max-shards", "1"]);
    expect(r1.status).toBe(0);
    const manifests = r1.stdout.trim().split("\n").filter(Boolean);
    expect(manifests).toEqual(["quality/tmp/w3/D7/shard-01.txt"]);

    const manifestLines = readFileSync(join(root, manifests[0]!), "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    expect(manifestLines).toEqual(["tests/live/x.test.ts", "tests/one.test.ts"]);

    const head = git(root, "rev-parse", "HEAD").trim();
    const mr = runStore(root, [
      "mark-reviewed",
      "--lens",
      "D7",
      "--sha",
      head,
      "--manifest",
      manifests[0]!,
    ]);
    expect(mr.status).toBe(0);

    const remainder = runStore(root, ["needs-review", "--lens", "D7"]).stdout.trim();
    expect(remainder).toBe("tests/two.test.ts");

    // --max-shards 0 == unlimited: the whole (now-shrunk-by-one-file) due set
    // packs into shards with no cap, i.e. every packed shard is emitted.
    const rAll = runStore(root, ["shard", "--lens", "D7", "--wave", "w3b", "--max-shards", "0"]);
    expect(rAll.status).toBe(0);
    expect(rAll.stdout.trim().split("\n").filter(Boolean).length).toBe(1);
  });

  it("cell 8: mark-reviewed is per-lens keyed and sha-delta re-dues an edited file", () => {
    const head1 = git(root, "rev-parse", "HEAD").trim();

    const d2Manifests = runStore(root, ["shard", "--lens", "D2", "--wave", "w4"]).stdout
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const m of d2Manifests) {
      runStore(root, ["mark-reviewed", "--lens", "D2", "--sha", head1, "--manifest", m]);
    }

    const d7Manifests = runStore(root, ["shard", "--lens", "D7", "--wave", "w4"]).stdout
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const m of d7Manifests) {
      runStore(root, ["mark-reviewed", "--lens", "D7", "--sha", head1, "--manifest", m]);
    }

    const state = JSON.parse(readFileSync(join(root, "quality/state.json"), "utf8"));
    expect(Object.keys(state.D7).sort()).toEqual([
      "tests/live/x.test.ts",
      "tests/one.test.ts",
      "tests/two.test.ts",
    ]);
    expect(Object.keys(state.D2).sort()).toEqual(["src/extension/b.ts", "src/runtime/a.ts"]);
    // D7's marking did not disturb D2's recorded shas.
    expect(state.D2["src/runtime/a.ts"]).toBe(head1);
    expect(state.D2["src/extension/b.ts"]).toBe(head1);

    expect(runStore(root, ["needs-review", "--lens", "D7"]).stdout).toBe("");

    // Edit + commit one marked D7 file: it alone becomes due again.
    writeFile(root, "tests/one.test.ts", makeLines(400) + "// edited\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "edit one.test.ts");
    expect(runStore(root, ["needs-review", "--lens", "D7"]).stdout).toBe("tests/one.test.ts\n");
  });

  it("cell 9: clusters key by dirname (first two directory segments)", () => {
    writeIssue(root, "PTQ-0001-a.md", { location: "tests/one.test.ts:1-2", id: "PTQ-0001" });
    writeIssue(root, "PTQ-0002-b.md", { location: "tests/live/x.test.ts:1-2", id: "PTQ-0002" });
    writeIssue(root, "PTQ-0003-c.md", { location: "src/runtime/a.ts:1-2", id: "PTQ-0003" });
    writeIssue(root, "PTQ-0004-d.md", { location: "root.ts:1-2", id: "PTQ-0004" });

    const r = runStore(root, ["clusters"]);
    expect(r.status).toBe(0);
    const rows = r.stdout.trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
    const keys = rows.map((c) => c[0]).sort();
    expect(keys).toEqual(["src/runtime", "tests", "tests/live", "unclustered"]);

    for (const [key, manifest, count] of rows) {
      const lines = readFileSync(join(root, manifest!), "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      expect(lines.length).toBe(Number(count));
      if (key === "tests") expect(lines).toEqual(["quality/issues/PTQ-0001-a.md"]);
      if (key === "tests/live") expect(lines).toEqual(["quality/issues/PTQ-0002-b.md"]);
      if (key === "src/runtime") expect(lines).toEqual(["quality/issues/PTQ-0003-c.md"]);
      if (key === "unclustered") expect(lines).toEqual(["quality/issues/PTQ-0004-d.md"]);
    }
  });

  it("cell 10: clusters --max splits an oversized key into ordered parts", () => {
    writeIssue(root, "PTQ-0011-a.md", { location: "tests/helpers/x.ts:1-2", id: "PTQ-0011" });
    writeIssue(root, "PTQ-0012-b.md", { location: "tests/helpers/y.ts:1-2", id: "PTQ-0012" });
    writeIssue(root, "PTQ-0013-c.md", { location: "tests/helpers/z.ts:1-2", id: "PTQ-0013" });

    const r = runStore(root, ["clusters", "--max", "2"]);
    expect(r.status).toBe(0);
    const rows = r.stdout.trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
    const byKey = new Map(rows.map((c) => [c[0], Number(c[2])]));
    expect(byKey.get("tests/helpers__p1")).toBe(2);
    expect(byKey.get("tests/helpers__p2")).toBe(1);
  });

  it("cell 11: open-count counts only status: open issues", () => {
    writeIssue(root, "PTQ-0021-open.md", { location: "src/runtime/a.ts:1-2", id: "PTQ-0021", status: "open" });
    writeIssue(root, "PTQ-0022-fixed.md", { location: "src/runtime/a.ts:3-4", id: "PTQ-0022", status: "fixed" });
    const r = runStore(root, ["open-count"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("1");
  });

  it("cell 12: default ROOT (env absent) resolves to the real repo and lists D2 + D7", () => {
    // Scrub any ambient override so the fallback itself is what runs.
    const env = { ...process.env };
    delete env.QUALITY_STORE_ROOT;
    const r = spawnSync(process.execPath, [STORE, "lenses"], { encoding: "utf8", env });
    expect(r.status).toBe(0);
    const ids = r.stdout.trim().split("\n").filter(Boolean);
    expect(ids).toContain("D2");
    expect(ids).toContain("D7");
  });
});
