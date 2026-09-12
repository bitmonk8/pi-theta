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
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function readFile(root: string, relPath: string): string {
  return readFileSync(join(root, ...relPath.split("/")), "utf8");
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
  opts: {
    location: string;
    status?: string;
    id?: string;
    more?: string[];
    lens?: string;
    extra?: Record<string, string>;
  },
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
      `lens: ${opts.lens ?? "D2"}`,
      `status: ${status}`,
      "verdict: confirmed",
      "locations:",
      `  - ${opts.location}`,
      ...(opts.more ?? []).map((l) => `  - ${l}`),
      "sites: 1",
      "fix_scope: localized",
      "wave: w0",
      "reported_by: scratch (test)",
      "date: 2020-01-01",
      ...Object.entries(opts.extra ?? {}).map(([k, v]) => `${k}: ${v}`),
      "---",
      "",
      "# scratch finding",
      "",
    ].join("\n"),
  );
}

function writeIntake(root: string, filename: string, opts: { extra?: Record<string, string>; triageNote?: string }): string {
  const relPath = `quality/intake/${filename}`;
  writeFile(
    root,
    relPath,
    [
      "---",
      "id: pending",
      "title: scratch finding",
      "lens: D9",
      "status: intake",
      "verdict: pending",
      "locations:",
      "  - src/big.ts:1-700",
      "sites: 1",
      "fix_scope: module",
      "wave: w0",
      "reported_by: scratch (test)",
      "date: 2020-01-01",
      ...Object.entries(opts.extra ?? {}).map(([k, v]) => `${k}: ${v}`),
      "---",
      "",
      "# scratch finding",
      "",
      "## Triage",
      opts.triageNote ?? "",
      "",
    ].join("\n"),
  );
  return relPath;
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

  it("cell 13: --max splitting keeps issues that cite a shared file in the SAME part (file-disjoint parts)", () => {
    // Issue order would put a+b in p1 and c+d in p2; but a and c both cite
    // shared.test.ts (c only as a secondary location), so they must travel
    // together — two worktree lanes editing one file is a cherry-pick conflict.
    writeIssue(root, "PTQ-0031-a.md", { location: "tests/shared.test.ts:1-2", id: "PTQ-0031" });
    writeIssue(root, "PTQ-0032-b.md", { location: "tests/only-b.test.ts:1-2", id: "PTQ-0032" });
    writeIssue(root, "PTQ-0033-c.md", { location: "tests/only-c.test.ts:1-2", id: "PTQ-0033", more: ["tests/shared.test.ts:9-10"] });
    writeIssue(root, "PTQ-0034-d.md", { location: "tests/only-d.test.ts:1-2", id: "PTQ-0034" });

    const r = runStore(root, ["clusters", "--max", "2"]);
    expect(r.status).toBe(0);
    const rows = r.stdout.trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
    const partOf = new Map<string, string>();
    for (const [key, manifest] of rows) {
      if (key === undefined || manifest === undefined) throw new Error(`malformed clusters row: ${JSON.stringify(rows)}`);
      for (const line of readFile(root, manifest).split("\n").filter(Boolean)) partOf.set(line, key);
    }
    expect(partOf.get("quality/issues/PTQ-0031-a.md")).toBe(partOf.get("quality/issues/PTQ-0033-c.md"));
    // Every part respects --max and no cited file appears in two parts.
    for (const [, , count] of rows) expect(Number(count)).toBeLessThanOrEqual(2);
    expect(rows.length).toBe(2);
  });

  it("cell 14: a file-connected component larger than --max stays one part (never split into conflicting lanes)", () => {
    writeIssue(root, "PTQ-0041-a.md", { location: "tests/hub.test.ts:1-2", id: "PTQ-0041" });
    writeIssue(root, "PTQ-0042-b.md", { location: "tests/hub.test.ts:3-4", id: "PTQ-0042" });
    writeIssue(root, "PTQ-0043-c.md", { location: "tests/hub.test.ts:5-6", id: "PTQ-0043" });

    const r = runStore(root, ["clusters", "--max", "2"]);
    expect(r.status).toBe(0);
    const rows = r.stdout.trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
    expect(rows.length).toBe(1);
    const only = rows[0] ?? [];
    expect(only[0]).toBe("tests");
    expect(Number(only[2])).toBe(3);
  });

  it("cell 11: open-count counts only status: open issues", () => {
    writeIssue(root, "PTQ-0021-open.md", { location: "src/runtime/a.ts:1-2", id: "PTQ-0021", status: "open" });
    writeIssue(root, "PTQ-0022-fixed.md", { location: "src/runtime/a.ts:3-4", id: "PTQ-0022", status: "fixed" });
    const r = runStore(root, ["open-count"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("1");
  });

  it("cell 15: reject --verdict human-keep-whole records a D9 exemption at the host's current LOC; other verdicts and hostless findings record nothing", () => {
    writeFile(root, "src/big.ts", makeLines(700));
    const f1 = writeIntake(root, "w0-d9-01-a.md", { extra: { d9_host: "src/big.ts", d9_class: "breakdown", d9_band: "zone" } });
    const r1 = runStore(root, ["reject", "--finding", f1, "--verdict", "human-keep-whole", "--reason", "spec-cited invariant"]);
    expect(r1.status).toBe(0);
    const exemptions1 = JSON.parse(readFile(root, "quality/exemptions.json"));
    expect(exemptions1["src/big.ts"]).toMatchObject({ loc: 700, reason: "spec-cited invariant", finding: f1 });

    // A different verdict records nothing (still just the one entry above).
    const f2 = writeIntake(root, "w0-d9-02-b.md", { extra: { d9_host: "src/big.ts", d9_class: "breakdown", d9_band: "zone" } });
    const r2 = runStore(root, ["reject", "--finding", f2, "--verdict", "false-positive", "--reason", "refuted"]);
    expect(r2.status).toBe(0);
    expect(Object.keys(JSON.parse(readFile(root, "quality/exemptions.json")))).toEqual(["src/big.ts"]);

    // A finding with no d9_host records nothing even on human-keep-whole.
    const f3 = writeIntake(root, "w0-d9-03-c.md", { extra: {} });
    const r3 = runStore(root, ["reject", "--finding", f3, "--verdict", "human-keep-whole", "--reason", "n/a"]);
    expect(r3.status).toBe(0);
    expect(Object.keys(JSON.parse(readFile(root, "quality/exemptions.json")))).toEqual(["src/big.ts"]);
  });

  it("cell 16: D9 issues cluster by host FILE, share a part on the same host, split by directory when basenames collide, and D9 ownership defers other lenses", () => {
    writeIssue(root, "PTQ-0101-a.md", {
      location: "src/big.ts:1-700",
      id: "PTQ-0101",
      lens: "D9",
      extra: { d9_host: "src/big.ts", d9_class: "breakdown", d9_band: "zone" },
    });
    writeIssue(root, "PTQ-0102-b.md", {
      location: "src/big.ts:1-700",
      id: "PTQ-0102",
      lens: "D9",
      extra: { d9_host: "src/big.ts", d9_class: "misplacement", d9_band: "zone" },
    });
    writeIssue(root, "PTQ-0103-c.md", {
      location: "src/sub/other.ts:1-50",
      id: "PTQ-0103",
      lens: "D9",
      extra: { d9_host: "src/sub/other.ts" },
    });
    writeIssue(root, "PTQ-0104-d.md", {
      location: "src/other2/other.ts:1-50",
      id: "PTQ-0104",
      lens: "D9",
      extra: { d9_host: "src/other2/other.ts" },
    });
    // Cites the D9-owned host: deferred, never clustered.
    writeIssue(root, "PTQ-0105-e.md", { location: "src/big.ts:5-6", id: "PTQ-0105", lens: "D2" });
    // Cites an unrelated file: clustered as usual.
    writeIssue(root, "PTQ-0106-f.md", { location: "src/runtime/unrelated.ts:1-2", id: "PTQ-0106", lens: "D2" });

    const r = runStore(root, ["clusters"]);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("deferred quality/issues/PTQ-0105-e.md: file owned by D9 lane d9/src__big.ts");

    const rows = r.stdout.trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
    const byKey = new Map(rows.map((c) => [c[0], c]));

    expect(byKey.get("d9/src__big.ts")?.[2]).toBe("2");
    expect(readFile(root, byKey.get("d9/src__big.ts")![1]!).trim().split("\n")).toEqual([
      "quality/issues/PTQ-0101-a.md",
      "quality/issues/PTQ-0102-b.md",
    ]);
    // Same basename, different directories -> two distinct parts.
    expect(byKey.get("d9/src__sub__other.ts")?.[2]).toBe("1");
    expect(byKey.get("d9/src__other2__other.ts")?.[2]).toBe("1");

    const nonD9Keys = [...byKey.keys()].filter((k): k is string => typeof k === "string" && !k.startsWith("d9/"));
    expect(nonD9Keys).toEqual(["src/runtime"]);
  });

  it("cell 17: exempt / exemptions / unexempt manage quality/exemptions.json directly; an unknown #fn host fails naming candidates", () => {
    writeFile(root, "src/host.ts", "export function foo() {\n  return 1;\n}\n");

    const r1 = runStore(root, ["exempt", "--host", "src/host.ts", "--reason", "data-only module"]);
    expect(r1.status).toBe(0);

    const r2 = runStore(root, ["exemptions"]);
    expect(r2.status).toBe(0);
    expect(r2.stdout.trim().split("\n").map((l) => l.split("\t"))).toEqual([
      ["src/host.ts", "3", expect.any(String), "data-only module"],
    ]);

    const r3 = runStore(root, ["unexempt", "--host", "src/host.ts"]);
    expect(r3.status).toBe(0);
    expect(runStore(root, ["exemptions"]).stdout).toBe("");

    const r4 = runStore(root, ["exempt", "--host", "src/host.ts#bar", "--reason", "x"]);
    expect(r4.status).toBe(1);
    expect(r4.stderr).toContain("unknown host");
    expect(r4.stderr).toContain("foo");
  });

  it("cell 18: log-review appends one flattened row per shard to quality/REVIEW_LOG.md, header once; a missing notes file dies", () => {
    const manifest = "quality/tmp/w1/D9/shard-01.txt";
    writeFile(root, manifest, "src/a.ts\nsrc/b.ts\nsrc/c.ts\n");
    writeFile(root, "quality/tmp/w1/D9/shard-01.notes.txt", "kept whole: src/a.ts#f \u2014 closed-enumeration: 9 arms | longest 12 LOC\nrouting: hollow module src/c.ts \u2192 D2\n");

    const r1 = runStore(root, ["log-review", "--wave", "w1", "--lens", "D9", "--manifest", manifest, "--notes-file", "quality/tmp/w1/D9/shard-01.notes.txt"]);
    expect(r1.status).toBe(0);
    const r2 = runStore(root, ["log-review", "--wave", "w1", "--lens", "D9", "--manifest", manifest, "--notes-file", "quality/tmp/w1/D9/shard-01.notes.txt", "--filed", "2"]);
    expect(r2.status).toBe(0);

    const log = readFile(root, "quality/REVIEW_LOG.md");
    const rows = log.split("\n").filter((l) => l.startsWith("|") && !l.startsWith("|---"));
    // Header + two data rows; the header is written exactly once.
    expect(rows.length).toBe(3);
    expect(rows[0]).toBe("| date | wave | lens | shard | filed | notes |");
    expect(rows[1]).toContain("| w1 | D9 | shard-01 (3 files: src/a.ts \u2026 src/c.ts) | - | ");
    // Newlines collapse to ' / ' and pipes are escaped so the table stays a table.
    expect(rows[1]).toContain("9 arms \\| longest 12 LOC / routing: hollow module");
    expect(rows[2]).toContain("| 2 | kept whole");

    const r3 = runStore(root, ["log-review", "--wave", "w1", "--lens", "D9", "--manifest", manifest, "--notes-file", "quality/tmp/nope.txt"]);
    expect(r3.status).toBe(1);
    expect(r3.stderr).toContain("notes file");
  });

  it("cell 19: resolve records a skip on every listed-but-unfixed issue and parks it in intake at the second skip", () => {
    writeIssue(root, "PTQ-0051-fixed.md", { location: "tests/a.test.ts:1-2", id: "PTQ-0051" });
    writeIssue(root, "PTQ-0052-stuck.md", { location: "tests/b.test.ts:1-2", id: "PTQ-0052" });
    const manifest = "quality/tmp/clusters/tests.txt";
    writeFile(root, manifest, "quality/issues/PTQ-0051-fixed.md\nquality/issues/PTQ-0052-stuck.md\n");
    writeFile(root, "quality/tmp/fix-notes.txt", "PTQ-0052: no longer reproduces at the cited lines | review: none\n");

    const r1 = runStore(root, ["resolve", "--manifest", manifest, "--fixed", "PTQ-0051-fixed.md", "--wave", "w1", "--notes-file", "quality/tmp/fix-notes.txt"]);
    expect(r1.status).toBe(0);
    expect(r1.stdout).toContain("quality/resolved/PTQ-0051-fixed.md");
    expect(r1.stdout).toContain("skipped PTQ-0052-stuck.md (fix_skips: 1)");
    const afterOne = readFile(root, "quality/issues/PTQ-0052-stuck.md");
    expect(afterOne).toMatch(/^fix_skips: 1$/m);
    expect(afterOne).toMatch(/^status: open$/m);
    expect(afterOne).toContain("## Fix attempts");
    expect(afterOne).toContain("- w1: skipped \u2014 PTQ-0052: no longer reproduces");

    // Second wave, same issue skipped again: parked for a human ruling.
    writeIssue(root, "PTQ-0053-other.md", { location: "tests/c.test.ts:1-2", id: "PTQ-0053" });
    writeFile(root, manifest, "quality/issues/PTQ-0052-stuck.md\nquality/issues/PTQ-0053-other.md\n");
    const r2 = runStore(root, ["resolve", "--manifest", manifest, "--fixed", "PTQ-0053-other.md", "--wave", "w2", "--notes-file", "quality/tmp/fix-notes.txt"]);
    expect(r2.status).toBe(0);
    expect(r2.stdout).toContain("parked quality/intake/PTQ-0052-stuck.md (fix_skips: 2)");
    expect(existsSync(join(root, "quality/issues/PTQ-0052-stuck.md"))).toBe(false);
    const parked = readFile(root, "quality/intake/PTQ-0052-stuck.md");
    expect(parked).toMatch(/^status: intake$/m);
    expect(parked).toMatch(/^verdict: questionable$/m);
    expect(parked).toMatch(/^fix_skips: 2$/m);
    expect(parked).toContain("- w2: skipped");
    expect(parked).toMatch(/verdict: questionable \u2014 parked by the store: skipped by the fixer in 2 waves/);
    expect(readFile(root, "quality/TRIAGE_LOG.md")).toContain("| PTQ-0052-stuck.md | parked |");
    // open-count no longer sees it.
    expect(runStore(root, ["open-count"]).stdout.trim()).toBe("0");
  });

  it("cell 20: accept keeps an already-minted PTQ id (a parked issue re-accepted) and resets fix_skips", () => {
    writeFile(
      root,
      "quality/intake/PTQ-0052-stuck.md",
      [
        "---",
        "id: PTQ-0052",
        "title: stuck",
        "lens: D7",
        "status: intake",
        "verdict: questionable",
        "locations:",
        "  - tests/b.test.ts:1-2",
        "fix_skips: 2",
        "---",
        "",
        "# stuck",
        "",
        "## Triage",
        "verdict: questionable \u2014 parked by the store",
        "",
      ].join("\n"),
    );
    writeIssue(root, "PTQ-0060-later.md", { location: "tests/z.test.ts:1-2", id: "PTQ-0060" });
    const r = runStore(root, ["accept", "--finding", "quality/intake/PTQ-0052-stuck.md", "--note", "direction: extract the helper into tests/helpers/b.ts"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("quality/issues/PTQ-0052-stuck.md");
    const text = readFile(root, "quality/issues/PTQ-0052-stuck.md");
    expect(text).toMatch(/^id: PTQ-0052$/m);
    expect(text).toMatch(/^status: open$/m);
    expect(text).toMatch(/^fix_skips: 0$/m);
    expect(text).toContain("verdict: confirmed \u2014 direction: extract the helper");

    // A lens that self-assigned a PTQ id (no store-written fix_skips) is still minted fresh.
    writeFile(
      root,
      "quality/intake/w9-d2-01-forged.md",
      ["---", "id: PTQ-0001", "title: forged", "lens: D2", "status: intake", "verdict: pending", "locations:", "  - src/x.ts:1-2", "---", "", "# forged", "", "## Triage", "verdict: confirmed \u2014 ok (triage: x)", ""].join("\n"),
    );
    const r2 = runStore(root, ["accept", "--finding", "quality/intake/w9-d2-01-forged.md"]);
    expect(r2.status).toBe(0);
    expect(r2.stdout.trim()).toBe("quality/issues/PTQ-0061-forged.md");
  });

  it("cell 21: reject on a parked issue records the parked triage line, not a Fix-attempts bullet", () => {
    writeFile(
      root,
      "quality/intake/PTQ-0070-parked.md",
      [
        "---", "id: PTQ-0070", "title: parked", "lens: D7", "status: intake", "verdict: questionable",
        "locations:", "  - tests/p.test.ts:1-2", "fix_skips: 2", "---", "", "# parked", "",
        "## Triage", "verdict: confirmed \u2014 real (triage: x)", "verdict: questionable \u2014 parked by the store: skipped by the fixer in 2 waves (store)", "",
        "## Fix attempts", "- w1: skipped \u2014 could not reproduce", "- w2: skipped \u2014 could not reproduce", "",
      ].join("\n"),
    );
    const r = runStore(root, ["reject", "--finding", "quality/intake/PTQ-0070-parked.md", "--verdict", "human-retire"]);
    expect(r.status).toBe(0);
    const row = readFile(root, "quality/TRIAGE_LOG.md").split("\n").find((l) => l.includes("PTQ-0070-parked.md"));
    expect(row).toContain("| human-retire | verdict: questionable \u2014 parked by the store");
    expect(row).not.toContain("could not reproduce");
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
