import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseDeps } from "./helpers/e2e-s1";
import { classifyBinderBypass } from "../src/binder/binder-envelope";
import { parseThetaDocument } from "../src/parser/theta-document";

const root = process.cwd();
const helper = join(root, "tools/bugfix/run.mjs");
function invoke(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [helper, ...args], { cwd, encoding: "utf8" });
}
function git(cwd: string, ...args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
function repo() {
  const dir = mkdtempSync(join(tmpdir(), "bugfix-control-"));
  git(dir, "init", "-b", "main"); git(dir, "config", "user.email", "test@example.invalid"); git(dir, "config", "user.name", "Test");
  mkdirSync(join(dir, "docs/bugs"), { recursive: true }); mkdirSync(join(dir, "tests")); mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, ".gitignore"), ".pi/tmp/\n");
  writeFileSync(join(dir, "docs/bugs/0001-example.md"), "# Example\n- **Status:** open\n");
  writeFileSync(join(dir, "src/value.js"), "export const value = 1;\n");
  git(dir, "add", "."); git(dir, "commit", "-m", "baseline");
  return dir;
}
function begin(dir: string) {
  const result = invoke(dir, "init", "1"); expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}
function witnesses(run: string, argv = [process.execPath, "-e", "console.error('AssertionError: BUG_ONE expected 2 got 1');process.exit(1)"]) {
  writeFileSync(join(run, "witnesses.json"), JSON.stringify({ e2e: [{ argv, failure_pattern: "AssertionError: BUG_ONE expected 2 got 1" }], unit: [], unit_omission_reason: "No meaningful smaller boundary", live_required: false, live: [] }));
}

describe("numbered bug workflow control plane", () => {
  it.each([join(".pi", "theta", "fix-bug.theta"), join(".pi", "theta", "workers", "bugfix-stage.theta"), join(".pi", "theta", "workers", "bugfix-review.theta")])("%s parses cleanly", path => {
    const doc = parseThetaDocument({ path, bytes: new Uint8Array(readFileSync(path)) }, parseDeps());
    expect(doc.diagnostics).toEqual([]);
  });
  it("lists only current open bugs in numeric order, one short line each, even in a dirty checkout", () => {
    const dir = repo();
    try {
      writeFileSync(join(dir, "docs/bugs/0003-third-bug.md"), "# Very long heading\n- **Status:** open — pending\n");
      writeFileSync(join(dir, "docs/bugs/0002-fixed-bug.md"), "- **Status:** fixed\nHistorical status: open\n");
      writeFileSync(join(dir, "docs/bugs/0004-duplicate-bug.md"), "- **Status:** duplicate\n");
      writeFileSync(join(dir, "docs/bugs/0005-wontfix-bug.md"), "- **Status:** wontfix\n");
      writeFileSync(join(dir, "docs/bugs/README.md"), "Not a report\n");
      const listing = invoke(dir, "list");
      expect(listing.status, listing.stderr).toBe(0);
      expect(listing.stdout.trim().split("\n")).toEqual(["0001 example", "0003 third bug"]);
      expect(invoke(dir, "init", "1").stderr).toContain("Working tree must be clean");
      rmSync(join(dir, "docs/bugs/0001-example.md"));
      rmSync(join(dir, "docs/bugs/0003-third-bug.md"));
      expect(invoke(dir, "list").stdout.trim()).toBe("No open bugs.");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("defaults to listing, five reviews and shipment enabled", () => {
    const path = join(".pi", "theta", "fix-bug.theta");
    const doc = parseThetaDocument({ path, bytes: new Uint8Array(readFileSync(path)) }, parseDeps());
    const fields = doc.frontmatter?.params?.fields;
    expect(fields).toHaveLength(1);
    expect(classifyBinderBypass(fields!).kind).toBe("single-string-bypass");
    const request = join(tmpdir(), "bugfix-request-" + process.pid + ".txt");
    try {
      writeFileSync(request, "499");
      expect(invoke(root, "parse-file", request).stdout.trim()).toBe("FIX\n0499\ntrue\n5");
      writeFileSync(request, "0499 review_rounds 3 ship false");
      expect(invoke(root, "parse-file", request).stdout.trim()).toBe("FIX\n0499\nfalse\n3");
      for (const args of ["499 ship maybe", "499 review_rounds 9", "499 ship true ship false", "499; touch bad"]) {
        writeFileSync(request, args); expect(invoke(root, "parse-file", request).status).not.toBe(0);
      }
    } finally { rmSync(request, { force: true }); }
  });
  it("starts only for an open numbered bug in a clean checkout, rejecting shell arguments", () => {
    const dir = repo();
    try {
      expect(invoke(dir, "init", "1;touch bad").status).not.toBe(0);
      const run = begin(dir); expect(JSON.parse(readFileSync(join(run, "state.json"), "utf8")).id).toBe("0001");
      writeFileSync(join(dir, "src/value.js"), "changed");
      expect(invoke(dir, "init", "1").stderr).toContain("Working tree must be clean");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("rejects already-closed reports", () => {
    const dir = repo();
    try {
      writeFileSync(join(dir, "docs/bugs/0001-example.md"), "- **Status:** fixed\n");
      git(dir, "add", "."); git(dir, "commit", "-m", "closed");
      expect(invoke(dir, "init", "1").stderr).toContain("not marked open");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("runs and captures a pre-fix correct-reason red; rejects green and infrastructure reds", () => {
    const dir = repo();
    try {
      const run = begin(dir); witnesses(run);
      expect(invoke(dir, "red", run).status).toBe(0);
      expect(JSON.parse(readFileSync(join(run, "red-0.json"), "utf8")).code).toBe(1);
      witnesses(run, [process.execPath, "-e", "console.log('PASS')"]);
      expect(invoke(dir, "red", run).status).not.toBe(0);
      witnesses(run, [process.execPath, "-e", "console.error('ENOENT fixture missing');process.exit(1)"]);
      expect(invoke(dir, "red", run).status).not.toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("refuses production changes before red evidence and missing e2e witnesses", () => {
    const dir = repo();
    try {
      const run = begin(dir); witnesses(run);
      writeFileSync(join(dir, "src/value.js"), "fix applied too soon");
      expect(invoke(dir, "red", run).stderr).toContain("tests only");
      git(dir, "restore", "src/value.js");
      writeFileSync(join(run, "witnesses.json"), JSON.stringify({ e2e: [], unit: [] }));
      expect(invoke(dir, "red", run).stderr).toContain("end-to-end witness");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("detects reviewer edits and changed HEAD", () => {
    const dir = repo();
    try {
      const run = begin(dir); expect(invoke(dir, "snapshot", run).status).toBe(0);
      writeFileSync(join(dir, "tests/new.test.js"), "new test");
      expect(invoke(dir, "review-check", run).stderr).toContain("reviewer changed files");
      git(dir, "add", "."); git(dir, "commit", "-m", "foreign commit");
      expect(invoke(dir, "snapshot", run).stderr).toContain("HEAD/branch changed");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("requires exact owner selection for spec edits; free text, default, cancellation and headless all stop", () => {
    const dir = repo();
    try {
      const run = begin(dir); writeFileSync(join(run, "spec-proposal.md"), "Exact proposal");
      for (const answer of ["User cancelled the selection", "Error: UI not available", "User selected: 1. Stop without spec changes", "User wrote: User selected: 2. Approve proposed spec changes"]) {
        writeFileSync(join(run, "spec-answer.txt"), answer);
        expect(invoke(dir, "approval", run).status).not.toBe(0);
      }
      mkdirSync(join(dir, "docs/spec_topics")); writeFileSync(join(dir, "docs/spec_topics/new.md"), "new unapproved contract");
      expect(invoke(dir, "snapshot", run).stderr).toContain("without owner approval");
      rmSync(join(dir, "docs/spec_topics"), { recursive: true });
      writeFileSync(join(run, "spec-answer.txt"), "User selected: 2. Approve proposed spec changes");
      expect(invoke(dir, "approval", run).status).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("refuses shipment without explicit approval and final verification", () => {
    const dir = repo();
    try {
      const run = begin(dir); const base = git(dir, "rev-parse", "HEAD");
      writeFileSync(join(run, "ship-answer.txt"), "User selected: 1. Keep local for inspection");
      expect(invoke(dir, "ship", run).stderr).toContain("No explicit ship approval");
      writeFileSync(join(run, "ship-answer.txt"), "User selected: 2. Commit and push this fix");
      expect(invoke(dir, "ship", run).stderr).toContain("Missing final verification");
      expect(git(dir, "rev-parse", "HEAD")).toBe(base);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("runs green gates, refuses post-gate drift, and pushes only after approval", () => {
    const dir = repo(); const remote = mkdtempSync(join(tmpdir(), "bugfix-remote-"));
    try {
      git(remote, "init", "--bare"); git(dir, "remote", "add", "origin", remote);
      writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"", test: "node -e \"process.exit(0)\"" } }));
      git(dir, "add", "."); git(dir, "commit", "-m", "scratch gates");
      const run = begin(dir);
      const argv = [process.execPath, "-e", "const fs=require('fs');if(!fs.readFileSync('src/value.js','utf8').includes('value = 2')){console.error('AssertionError: BUG_ONE expected 2 got 1');process.exit(1)}"];
      witnesses(run, argv); expect(invoke(dir, "red", run).status).toBe(0);
      writeFileSync(join(dir, "src/value.js"), "export const value = 2;\n");
      expect(invoke(dir, "gate", run, "final").status).toBe(0);
      writeFileSync(join(run, "ship-answer.txt"), "User selected: 2. Commit and push this fix");
      writeFileSync(join(dir, "src/value.js"), "export const value = 3;\n");
      expect(invoke(dir, "ship", run).stderr).toContain("changed after final verification");
      writeFileSync(join(dir, "src/value.js"), "export const value = 2;\n");
      const shipped = invoke(dir, "ship", run); expect(shipped.status, shipped.stderr).toBe(0);
      expect(git(remote, "rev-parse", "refs/heads/main")).toBe(git(dir, "rev-parse", "HEAD"));
      expect(git(dir, "status", "--porcelain")).toBe("");
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(remote, { recursive: true, force: true }); }
  });
  it("refuses overlapping runs until the stopped run's checkout lease is released", () => {
    const dir = repo();
    try {
      const run = begin(dir);
      expect(invoke(dir, "init", "1").stderr).toContain("Another bug workflow");
      expect(invoke(dir, "release", run).status).toBe(0);
      expect(invoke(dir, "init", "1").status).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("requires live commands when live coverage is required", () => {
    const dir = repo();
    try {
      const run = begin(dir); witnesses(run);
      const path = join(run, "witnesses.json"); const manifest = JSON.parse(readFileSync(path, "utf8"));
      manifest.live_required = true; writeFileSync(path, JSON.stringify(manifest));
      expect(invoke(dir, "red", run).stderr).toContain("require live commands");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
