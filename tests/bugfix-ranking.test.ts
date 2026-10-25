import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const helper = join(process.cwd(), "tools/bugfix/run.mjs");
function fixture(empty = false) {
  const cwd = mkdtempSync(join(tmpdir(), "bugfix-ranking-"));
  const git = (...args: string[]) => spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(git("init", "-b", "main").status).toBe(0);
  mkdirSync(join(cwd, "docs/bugs"), { recursive: true });
  writeFileSync(join(cwd, ".gitignore"), ".pi/tmp/\n/.trees/\n");
  const reports = {
    first: "docs/bugs/0001-prerequisite-documentation.md",
    second: "docs/bugs/0002-silent-payload-corruption.md",
    fixed: "docs/bugs/0003-already-fixed-prerequisite.md",
  };
  if (!empty) {
    writeFileSync(join(cwd, reports.first), "# Documentation\n- **Status:** open\n- **Sev/Diff estimate:** S1/D1\nA documentation prerequisite, not a runtime failure.\n");
    writeFileSync(join(cwd, reports.second), "# Wrong payload\n- **Status:** open\n- **Sev/Diff estimate:** S4/D1\nSilent wrong payload; historical blocker bug 0003.\n");
    writeFileSync(join(cwd, reports.fixed), "# Fixed prerequisite\n- **Status:** fixed (0.497.0)\nNo work remains for this prerequisite.\n");
    writeFileSync(join(cwd, "docs/bugs/0004-unrelated-closed.md"), "- **Status:** fixed\n");
  }
  const call = (...args: string[]) => spawnSync(process.execPath, [helper, ...args], { cwd, encoding: "utf8" });
  const start = () => {
    const r = call("rank-start");
    expect(r.status, r.stderr).toBe(0);
    return r.stdout.trim();
  };
  const render = (path: string, lines: string[]) => {
    writeFileSync(path + ".ranking.tsv", ["RANK1", ...lines, ""].join("\n"));
    return call("rank-render", path);
  };
  const valid = [
    "BUG\t0002\thigh\tfalse\tSilently returns the wrong payload without a diagnostic.",
    "BUG\t0001\tlow\tfalse\tOnly documentation is affected.",
    "EDGE\t0001\t0002\tSettle the prerequisite before changing the dependent behavior.",
    "GUIDE\tSeverity is not fix order: address 0001 before 0002; prerequisite 0003 is already fixed.",
  ];
  return { cwd, reports, git, call, start, render, valid, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

describe("open-bug severity ranking inventory and display gates", () => {
  it("snapshots the full current reports and referenced closed status without acquiring a fix lease", () => {
    const f = fixture();
    try {
      const before = f.git("status", "--porcelain").stdout;
      const path = f.start();
      const catalog = JSON.parse(readFileSync(path, "utf8"));
      expect(catalog.open.map((r: { id: string }) => r.id)).toEqual(["0001", "0002"]);
      expect(catalog.related.map((r: { id: string; status: string }) => [r.id, r.status])).toEqual([["0003", "fixed (0.497.0)"]]);
      for (const entry of [...catalog.open, ...catalog.related]) {
        expect(readFileSync(entry.snapshot)).toEqual(readFileSync(join(f.cwd, entry.path)));
      }
      expect(f.git("status", "--porcelain").stdout).toBe(before);
      expect(existsSync(join(f.cwd, ".pi/tmp/fix-bug.lock"))).toBe(false);
    } finally { f.cleanup(); }
  });

  it("does not disturb an existing paused fix run while assessing the inventory", () => {
    const f = fixture();
    try {
      const lease = join(f.cwd, ".pi/tmp/fix-bug.lock");
      mkdirSync(lease, { recursive: true });
      const owner = JSON.stringify({ run: "existing-paused-run" });
      writeFileSync(join(lease, "owner.json"), owner);
      const r = f.render(f.start(), f.valid);
      expect(r.status, r.stderr).toBe(0);
      expect(readFileSync(join(lease, "owner.json"), "utf8")).toBe(owner);
    } finally { f.cleanup(); }
  });

  it("renders impact order, canonical titles, reasons and distinct dependency order", () => {
    const f = fixture();
    try {
      const r = f.render(f.start(), f.valid);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain("1. 0002 — silent payload corruption [HIGH]");
      expect(r.stdout).toContain("2. 0001 — prerequisite documentation [LOW]");
      expect(r.stdout).toContain("Silently returns the wrong payload without a diagnostic.");
      expect(r.stdout).toContain("FIX-ORDER GUIDANCE (severity order is not necessarily implementation order)");
      expect(r.stdout).toContain("0001 before 0002");
      expect(r.stdout).toContain("prerequisite 0003 is already fixed");
      expect(r.stdout).not.toContain("3. 0003");
    } finally { f.cleanup(); }
  });

  it("marks conditional severity explicitly", () => {
    const f = fixture();
    try {
      const r = f.render(f.start(), f.valid.map(line => line.replace("high\tfalse", "high\ttrue")));
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain("[HIGH; provisional]");
    } finally { f.cleanup(); }
  });

  it("copies long source bytes completely, not just a tool-sized excerpt", () => {
    const f = fixture();
    try {
      const source = "- **Status:** open\n" + "long evidence line\n".repeat(4000) + "FULL-TAIL\n";
      writeFileSync(join(f.cwd, f.reports.first), source);
      const catalog = JSON.parse(readFileSync(f.start(), "utf8"));
      expect(readFileSync(catalog.open[0].snapshot, "utf8")).toBe(source);
    } finally { f.cleanup(); }
  });

  it.each(["open-status", "new-open", "closed-prerequisite", "body-only", "closed-body-only"])("refuses stale %s evidence rather than printing an old ranking", kind => {
    const f = fixture();
    try {
      const path = f.start();
      if (kind === "open-status") writeFileSync(join(f.cwd, f.reports.first), "- **Status:** fixed\n");
      if (kind === "new-open") writeFileSync(join(f.cwd, "docs/bugs/0005-new-bug.md"), "- **Status:** open\n");
      if (kind === "closed-prerequisite") writeFileSync(join(f.cwd, f.reports.fixed), "- **Status:** open\n");
      if (kind === "body-only") writeFileSync(join(f.cwd, f.reports.first), "- **Status:** open\nChanged impact evidence.\n");
      if (kind === "closed-body-only") writeFileSync(join(f.cwd, f.reports.fixed), "- **Status:** fixed (0.497.0)\nChanged prerequisite evidence.\n");
      const r = f.render(path, f.valid);
      expect(r.status).not.toBe(0);
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain("Bug reports changed during ranking");
    } finally { f.cleanup(); }
  });

  it.each(["missing", "duplicate", "unknown", "severity-order", "invalid-severity", "cycle", "closed-edge", "self-edge", "duplicate-edge", "no-guidance", "overlong"])("rejects %s assessment output", kind => {
    const f = fixture();
    try {
      let lines = [...f.valid];
      if (kind === "missing") lines = lines.slice(1);
      if (kind === "duplicate") lines[1] = lines[0]!;
      if (kind === "unknown") lines[0] = lines[0]!.replace("0002", "9999");
      if (kind === "severity-order") [lines[0], lines[1]] = [lines[1]!, lines[0]!];
      if (kind === "invalid-severity") lines[0] = lines[0]!.replace("high", "urgent");
      if (kind === "cycle") lines.push("EDGE\t0002\t0001\tContradictory prerequisite.");
      if (kind === "closed-edge") lines[2] = "EDGE\t0003\t0002\tThis prerequisite is already fixed.";
      if (kind === "self-edge") lines[2] = "EDGE\t0002\t0002\tCannot depend on itself.";
      if (kind === "duplicate-edge") lines.push(lines[2]!);
      if (kind === "no-guidance") lines = lines.filter(line => !line.startsWith("GUIDE"));
      if (kind === "overlong") lines[0] = "BUG\t0002\thigh\tfalse\t" + "x".repeat(261);
      const r = f.render(f.start(), lines);
      expect(r.status).not.toBe(0);
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain("BLOCKED:");
    } finally { f.cleanup(); }
  });

  it("returns EMPTY without allocating a ranking or requesting a model", () => {
    const f = fixture(true);
    try {
      expect(f.start()).toBe("EMPTY");
      expect(existsSync(join(f.cwd, ".pi/tmp"))).toBe(false);
    } finally { f.cleanup(); }
  });

  it("uses current status rather than a historical open row in a closed report", () => {
    const f = fixture(true);
    try {
      writeFileSync(join(f.cwd, "docs/bugs/0001-historical.md"), "- **Status:** fixed\n\nHistorical excerpt:\n- **Status:** open\n");
      expect(f.start()).toBe("EMPTY");
      expect(f.call("list").stdout.trim()).toBe("No open bugs.");
    } finally { f.cleanup(); }
  });

  it("refuses ambiguous open ids instead of dropping a report", () => {
    const f = fixture();
    try {
      writeFileSync(join(f.cwd, "docs/bugs/0001-duplicate-report.md"), "- **Status:** open\n");
      expect(f.call("rank-start").stderr).toContain("Open bug numbers are ambiguous");
    } finally { f.cleanup(); }
  });
});
