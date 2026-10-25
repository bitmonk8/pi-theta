import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseDeps } from "./helpers/e2e-s1";
import { classifyBinderBypass } from "../src/binder/binder-envelope";
import { parseThetaDocument } from "../src/parser/theta-document";

const helper = join(process.cwd(), "tools/bugfix/run.mjs");
function invoke(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [helper, ...args], { cwd, encoding: "utf8" });
}
function git(cwd: string, ...args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
function repo(remote = false) {
  const owner = mkdtempSync(join(tmpdir(), "bugfix-control-"));
  git(owner, "init", "-b", "main"); git(owner, "config", "user.email", "test@example.invalid"); git(owner, "config", "user.name", "Test");
  const putAt = (root: string, path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text);
  };
  putAt(owner, ".gitignore", ".pi/tmp/\n");
  putAt(owner, "docs/bugs/0001-example.md", "# Example\n- **Status:** open\n");
  putAt(owner, "src/value.js", "export const value = 1;\n");
  putAt(owner, "tests/retained.js", "// original tests\n");
  putAt(owner, "package.json", JSON.stringify({ scripts: { typecheck: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"' } }));
  git(owner, "add", "."); git(owner, "commit", "-m", "baseline");
  const bare = join(owner, ".pi/tmp/origin.git");
  if (remote) { git(owner, "init", "--bare", bare); git(owner, "remote", "add", "origin", bare); }
  const base = git(owner, "rev-parse", "HEAD");
  const call = (...args: string[]) => invoke(owner, ...args);
  const start = () => { const r = call("init", "1"); expect(r.status, r.stderr).toBe(0); return r.stdout.trim(); };
  const run = start();
  const state = () => JSON.parse(readFileSync(join(run, "state.json"), "utf8"));
  const root = state().root as string;
  const put = (path: string, text: string) => putAt(root, path, text);
  const putRun = (path: string, text: string) => putAt(run, path, text);
  const ok = (...args: string[]) => { const r = call(...args); expect(r.status, r.stderr + r.stdout).toBe(0); return r.stdout.trim(); };
  const witnesses = (argv = [process.execPath, "-e", "if(!require('fs').readFileSync('src/value.js','utf8').includes('value = 2')){console.error('AssertionError: BUG_ONE expected 2 got 1');process.exit(1)}"]) => {
    putRun("witnesses.json", JSON.stringify({ e2e: [{ argv, failure_pattern: "AssertionError: BUG_ONE expected 2 got 1" }], unit: [], unit_omission_reason: "No smaller boundary", live_required: false, live: [] }));
  };
  const verified = () => {
    witnesses(); ok("red", run); put("src/value.js", "export const value = 2;\n"); ok("gate", run, "final"); ok("snapshot", run);
    putRun("final-review.md", "CLEAN — independent fixture review");
    putRun("final-review-result.json", JSON.stringify({ ok: true, findings: "CLEAN — independent fixture review" }));
    ok("final-review-record", run);
  };
  return { owner, root, bare, base, run, state, start, call, ok, put, putRun, witnesses, verified, cleanup: () => rmSync(owner, { recursive: true, force: true }) };
}

describe("numbered bug workflow control plane", () => {
  it.each(["fix-bug.theta", "workers/bugfix-stage.theta", "workers/bugfix-review.theta", "workers/bugfix-rank.theta", "workers/bugfix-decide.theta"])("%s parses cleanly", name => {
    const path = join(".pi/theta", name);
    expect(parseThetaDocument({ path, bytes: new Uint8Array(readFileSync(path)) }, parseDeps()).diagnostics).toEqual([]);
  });
  it("defaults to one request string, five reviews and shipment enabled; rejects unsafe options", () => {
    const path = join(".pi", "theta", "fix-bug.theta");
    const doc = parseThetaDocument({ path, bytes: new Uint8Array(readFileSync(path)) }, parseDeps());
    expect(classifyBinderBypass(doc.frontmatter!.params!.fields!).kind).toBe("single-string-bypass");
    const f = repo();
    try {
      f.putRun("request.txt", "499"); expect(f.ok("parse-file", join(f.run, "request.txt"))).toBe("FIX\n0499\ntrue\n5");
      f.putRun("request.txt", "0499 review_rounds 3 ship false"); expect(f.ok("parse-file", join(f.run, "request.txt"))).toBe("FIX\n0499\nfalse\n3");
      for (const text of ["499 ship maybe", "499 review_rounds 9", "499 ship true ship false", "499; touch bad"]) {
        f.putRun("request.txt", text); expect(f.call("parse-file", join(f.run, "request.txt")).status).not.toBe(0);
      }
    } finally { f.cleanup(); }
  });
  it("creates a dedicated branch/worktree, keeps artifacts outside it, and leaves the owner checkout unchanged", () => {
    const f = repo();
    try {
      expect(f.root).not.toBe(f.owner);
      expect(f.run.startsWith(f.root + "/")).toBe(false);
      expect(f.state()).toMatchObject({ ownerRoot: f.owner, ownerBranch: "main", ownerBase: f.base, base: f.base });
      expect(git(f.root, "branch", "--show-current")).toBe(f.state().branch);
      expect(f.state().branch).toMatch(/^fix-bug\/0001-/);
      f.put("tests/new.js", "// worktree only");
      expect(existsSync(join(f.owner, "tests/new.js"))).toBe(false);
      expect(git(f.owner, "status", "--porcelain")).toBe("");
      expect(git(f.owner, "rev-parse", "HEAD")).toBe(f.base);
      expect(invoke(f.root, "snapshot", f.run).stderr).toContain("original owner checkout");
    } finally { f.cleanup(); }
  });
  it("lists current open bugs numerically even when dirty and rejects invalid/new closed requests", () => {
    const f = repo();
    try {
      expect(f.call("init", "1;touch bad").status).not.toBe(0);
      writeFileSync(join(f.owner, "docs/bugs/0003-third-bug.md"), "- **Status:** open — pending\n");
      writeFileSync(join(f.owner, "docs/bugs/0002-fixed-bug.md"), "- **Status:** fixed\nHistorical status: open\n");
      expect(f.ok("list")).toBe("0001 example\n0003 third bug");
      expect(f.call("init", "1").stderr).toContain("Working tree must be clean");
      f.ok("release", f.run);
      rmSync(join(f.owner, "docs/bugs/0003-third-bug.md")); rmSync(join(f.owner, "docs/bugs/0002-fixed-bug.md"));
      writeFileSync(join(f.owner, "docs/bugs/0001-example.md"), "- **Status:** fixed\n");
      git(f.owner, "add", "."); git(f.owner, "commit", "-m", "closed");
      expect(f.call("init", "1").stderr).toContain("not marked open");
      expect(f.ok("list")).toBe("No open bugs.");
    } finally { f.cleanup(); }
  });
  it("runs pre-fix witnesses in the worktree and refuses green/infra reds or production edits", () => {
    const f = repo();
    try {
      f.witnesses([process.execPath, "-e", "console.log('PASS')"]); expect(f.call("red", f.run).status).not.toBe(0);
      f.witnesses([process.execPath, "-e", "console.error('ENOENT missing');process.exit(1)"]); expect(f.call("red", f.run).status).not.toBe(0);
      f.put("src/value.js", "fix too soon"); f.witnesses(); expect(f.call("red", f.run).stderr).toContain("tests only");
      git(f.root, "restore", "src/value.js"); f.ok("red", f.run);
      expect(JSON.parse(readFileSync(join(f.run, "red-0.json"), "utf8")).code).toBe(1);
      f.putRun("witnesses.json", "{}"); expect(f.call("red", f.run).status).not.toBe(0);
    } finally { f.cleanup(); }
  });
  it("detects reviewer/index edits and a changed worker HEAD", () => {
    const f = repo();
    try {
      f.ok("snapshot", f.run); f.put("tests/new.js", "new");
      expect(f.call("review-check", f.run).stderr).toContain("reviewer changed files");
      git(f.root, "add", "."); git(f.root, "commit", "-m", "foreign");
      expect(f.call("snapshot", f.run).stderr).toContain("HEAD/branch changed");
    } finally { f.cleanup(); }
  });
  it("requires exact manual spec approval; defaults, cancellation, headless and free text cannot approve", () => {
    const f = repo();
    try {
      f.putRun("spec-proposal.md", "Exact proposal");
      for (const answer of ["User cancelled the selection", "Error: UI not available", "User selected: 1. Stop", "User wrote: User selected: 2. Approve proposed spec changes"]) {
        f.putRun("spec-answer.txt", answer); expect(f.call("approval", f.run).status).not.toBe(0);
      }
      f.put("docs/spec_topics/new.md", "unapproved"); expect(f.call("snapshot", f.run).stderr).toContain("without owner approval");
      rmSync(join(f.root, "docs/spec_topics"), { recursive: true });
      f.putRun("spec-answer.txt", "User selected: 2. Approve proposed spec changes"); f.ok("approval", f.run);
    } finally { f.cleanup(); }
  });
  it("preserves branch, worktree and artifacts on pause, release and ship false", () => {
    const f = repo();
    try {
      f.verified(); const branch = f.state().branch;
      f.ok("configure", f.run, "false", "5"); expect(f.call("ship", f.run).stderr).toContain("Shipment disabled");
      f.ok("pause", f.run); f.ok("release", f.run);
      expect(existsSync(f.root)).toBe(true); expect(existsSync(join(f.run, "final-review.md"))).toBe(true);
      expect(git(f.owner, "rev-parse", branch)).toBe(f.base);
      expect(readFileSync(join(f.root, "src/value.js"), "utf8")).toContain("value = 2");
      expect(git(f.owner, "rev-parse", "HEAD")).toBe(f.base);
      expect(f.ok("approval-report", f.run)).toBe("CLEAR");
    } finally { f.cleanup(); }
  });
  it("requires green final gates and clean review before shipment", () => {
    const f = repo();
    try {
      expect(f.call("ship", f.run).stderr).toContain("Missing final verification");
      f.witnesses(); f.ok("red", f.run); f.put("src/value.js", "export const value = 2;\n"); f.ok("gate", f.run, "final");
      expect(f.call("ship", f.run).stderr).toContain("clean final independent review");
      f.ok("snapshot", f.run); f.putRun("final-review.md", "MUST FIX"); f.putRun("final-review-result.json", JSON.stringify({ ok: false, findings: "MUST FIX" }));
      expect(f.call("final-review-record", f.run).stderr).toContain("Missing clean final independent review");
    } finally { f.cleanup(); }
  });
  it("refuses post-review bytes/mode/index drift without resetting unrelated staged content", () => {
    const f = repo();
    try {
      f.verified(); f.put("src/value.js", "export const value = 3;\n");
      expect(f.call("ship", f.run).stderr).toContain("changed after final verification");
      f.put("src/value.js", "export const value = 2;\n"); const mode = statSync(join(f.root, "src/value.js")).mode;
      chmodSync(join(f.root, "src/value.js"), 0o755); expect(f.call("ship", f.run).stderr).toMatch(/mode|checkout.*changed/i); chmodSync(join(f.root, "src/value.js"), mode);
      const bytes = readFileSync(join(f.root, "package.json")); f.put("package.json", "{\"unreviewed\":true}"); git(f.root, "add", "package.json"); writeFileSync(join(f.root, "package.json"), bytes);
      expect(f.call("ship", f.run).stderr).toMatch(/index|staged/i); expect(git(f.root, "diff", "--cached", "--name-only")).toBe("package.json");
      git(f.root, "reset", "HEAD", "--", "package.json");
      f.put("src/value.js", "export const value = 3;\n"); git(f.root, "add", "src/value.js"); f.put("src/value.js", "export const value = 2;\n");
      expect(f.call("ship", f.run).stderr).toMatch(/index|staged/i);
      expect(git(f.owner, "rev-parse", "HEAD")).toBe(f.base);
    } finally { f.cleanup(); }
  });
  it("commits on the fix branch, merges main, pushes main, then removes only successful worktree/branch", () => {
    const f = repo(true);
    try {
      f.verified(); const branch = f.state().branch; f.ok("ship", f.run);
      const shipment = JSON.parse(readFileSync(join(f.run, "shipment.json"), "utf8"));
      expect(shipment).toMatchObject({ pushed: true, merged: true, cleaned: true });
      expect(git(f.bare, "rev-parse", "refs/heads/main")).toBe(shipment.sha);
      expect(git(f.owner, "rev-parse", "HEAD")).toBe(shipment.sha);
      expect(git(f.owner, "branch", "--show-current")).toBe("main");
      expect(git(f.owner, "status", "--porcelain")).toBe("");
      expect(existsSync(f.root)).toBe(false); expect(git(f.owner, "branch", "--list", branch)).toBe("");
      expect(existsSync(join(f.run, "state.json"))).toBe(true); expect(existsSync(join(f.run, "red-0.json"))).toBe(true);
      expect(existsSync(join(f.owner, ".pi/tmp/fix-bug.lock"))).toBe(false);
      expect(f.ok("approval-report", f.run)).toBe("CLEAR");
    } finally { f.cleanup(); }
  });
  it("retains committed fix branch, worktree and audit on push failure", () => {
    const f = repo(true);
    try {
      writeFileSync(join(f.bare, "hooks/pre-receive"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
      f.verified(); const result = f.call("ship", f.run);
      expect(result.status).not.toBe(0); expect(result.stderr).toContain("push failed");
      const shipment = JSON.parse(readFileSync(join(f.run, "shipment.json"), "utf8"));
      expect(shipment).toMatchObject({ merged: true, pushed: false });
      expect(existsSync(f.root)).toBe(true); expect(git(f.owner, "rev-parse", f.state().branch)).toBe(shipment.sha);
      expect(existsSync(join(f.run, "red-0.json"))).toBe(true); expect(existsSync(join(f.owner, ".pi/tmp/fix-bug.lock"))).toBe(true);
      f.ok("pause", f.run); expect(existsSync(f.root)).toBe(true);
    } finally { f.cleanup(); }
  });
  it.each(["dirty", "head"])("refuses shipment when original owner checkout has %s drift", kind => {
    const f = repo(true);
    try {
      f.verified(); writeFileSync(join(f.owner, "src/value.js"), "foreign edit\n");
      if (kind === "head") { git(f.owner, "add", "."); git(f.owner, "commit", "-m", "foreign"); }
      expect(f.call("ship", f.run).status).not.toBe(0);
      expect(existsSync(f.root)).toBe(true); expect(git(f.root, "rev-parse", "HEAD")).toBe(f.base);
      expect(readFileSync(join(f.owner, "src/value.js"), "utf8")).toBe("foreign edit\n");
    } finally { f.cleanup(); }
  });
  it("refuses overlapping runs until explicit lease release, without removing abandoned worktrees", () => {
    const f = repo();
    try {
      expect(f.call("init", "1").stderr).toContain("Another bug workflow"); f.ok("release", f.run);
      const next = f.start(); expect(next).not.toBe(f.run); expect(existsSync(f.root)).toBe(true);
    } finally { f.cleanup(); }
  });
  it("requires e2e witnesses and declared live commands for live-exercised changes", () => {
    const f = repo();
    try {
      f.putRun("witnesses.json", JSON.stringify({ e2e: [], unit: [] })); expect(f.call("red", f.run).stderr).toContain("end-to-end witness");
      f.witnesses(); const w = JSON.parse(readFileSync(join(f.run, "witnesses.json"), "utf8")); w.live_required = true; f.putRun("witnesses.json", JSON.stringify(w));
      expect(f.call("red", f.run).stderr).toContain("require live commands");
    } finally { f.cleanup(); }
  });
});
