// Offline CLI hooks used by the batch collector. Git writes are confined to
// disposable repositories; no provider, remote, or real-checkout commit is used.
import { describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";

const helper = join(process.cwd(), "tools/bugfix/run.mjs");
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function git(root: string, ...args: string[]) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim();
}
function fixture() {
  // Exercise spaces in both checkout and manifest paths through the CLI.
  const owner = mkdtempSync(join(tmpdir(), "bugfix batch hooks "));
  const putAt = (root: string, path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  git(owner, "init", "-b", "main");
  git(owner, "config", "user.email", "test@example.invalid");
  git(owner, "config", "user.name", "Test");
  putAt(owner, ".gitignore", ".pi/tmp/\n/.trees/\n");
  putAt(owner, "docs/bugs/0001-example.md", "# Example\n- **Status:** open\n");
  putAt(owner, "docs/bugs/0002-second.md", "# Second\n- **Status:** open\n");
  putAt(owner, "src/value.js", "export const value = 1;\n");
  putAt(owner, "tests/retained.js", "// retained baseline\n");
  putAt(owner, "package.json", JSON.stringify({ scripts: { typecheck: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"' } }));
  git(owner, "add", "."); git(owner, "commit", "-m", "baseline");
  const base = git(owner, "rev-parse", "HEAD");
  const batchRun = join(owner, ".pi/tmp", "fix-all-bugs-" + randomUUID());
  const lock = join(owner, ".pi/tmp/fix-bug.lock");
  const manifest = join(batchRun, "jobs/0001.json");
  const parentPath = join(batchRun, "state.json");
  const putJSON = (path: string, value: unknown) => putAt(dirname(path), path.slice(dirname(path).length + 1), JSON.stringify(value, null, 2) + "\n");
  const readJSON = (path: string) => JSON.parse(readFileSync(path, "utf8"));
  const parent = () => readJSON(parentPath);
  const job = () => readJSON(manifest);
  putJSON(manifest, { version: 1, batchRun, ownerRoot: owner, id: "0001", base, review_rounds: 5 });
  putJSON(parentPath, { version: 1, root: owner, base, jobs: { "0001": { manifest, manifestDigest: sha256(readFileSync(manifest)), status: "scheduled" } } });
  putJSON(join(lock, "owner.json"), { run: batchRun, kind: "batch" });
  const lockBytes = readFileSync(join(lock, "owner.json"));
  const request = join(batchRun, "request.txt");
  putAt(batchRun, "request.txt", "batch " + manifest);
  const call = (...args: string[]) => spawnSync(process.execPath, [helper, ...args], { cwd: owner, encoding: "utf8" });
  const ok = (...args: string[]) => {
    const r = call(...args); expect(r.status, r.stderr + r.stdout).toBe(0); return r.stdout.trim();
  };
  const register = () => { const p = parent(); p.jobs["0001"].manifestDigest = sha256(readFileSync(manifest)); putJSON(parentPath, p); };
  const start = () => ok("start-file", request, String(process.pid));
  const state = (run: string) => readJSON(join(run, "state.json"));
  const green = (run: string, final = true) => {
    putJSON(join(run, "witnesses.json"), {
      e2e: [{ argv: [process.execPath, "-e", "if(!require('fs').readFileSync('src/value.js','utf8').includes('value = 2')){console.error('AssertionError: expected two');process.exit(1)}"], failure_pattern: "AssertionError: expected two" }],
      unit: [], unit_omission_reason: "No smaller boundary", live_required: false, live: [],
    });
    ok("red", run);
    putAt(state(run).root, "src/value.js", "export const value = 2;\n");
    ok("gate", run, final ? "final" : "initial");
  };
  const review = (run: string) => {
    ok("snapshot", run);
    putAt(run, "final-review.md", "CLEAN — independent fixture review");
    putJSON(join(run, "final-review-result.json"), { ok: true, findings: "CLEAN — independent fixture review" });
    ok("final-review-record", run);
  };
  const verified = () => { const run = start(); green(run); review(run); return run; };
  return { owner, base, batchRun, lock, lockBytes, manifest, parentPath, request, putAt, putJSON, readJSON, parent, job, register, call, ok, start, state, green, review, verified, cleanup: () => rmSync(owner, { recursive: true, force: true }) };
}

describe("batch support in the standalone bug controller", () => {
  it("parses the complete absolute manifest path, including spaces, with fixed safe options", () => {
    const f = fixture();
    try {
      expect(f.ok("parse-file", f.request)).toBe(`BATCH\n${f.manifest}\nfalse\n5`);
      for (const request of ["batch relative.json", "batch /absolute\nother.json", "batch /tmp/../job.json"]) {
        f.putAt(f.batchRun, "request.txt", request);
        expect(f.call("parse-file", f.request).status).not.toBe(0);
      }
    } finally { f.cleanup(); }
  });

  it("starts an isolated active worktree with a per-run lease, leaving the parent's lease intact", () => {
    const f = fixture();
    try {
      const run = f.start(); const state = f.state(run);
      expect(run.startsWith(join(f.owner, ".pi/tmp/fix-bug-0001-"))).toBe(true);
      expect(state).toMatchObject({ ownerRoot: f.owner, ownerBase: f.base, base: f.base, batchRun: f.batchRun, batchManifest: f.manifest, options: { ship: false, review_rounds: 5 } });
      expect(state.root).toBe(join(f.owner, ".trees", basename(run)));
      expect(git(f.owner, "check-ignore", state.root)).toBe(state.root);
      expect(f.readJSON(join(run, "lease/owner.json"))).toEqual({ run });
      expect(f.readJSON(join(run, "active/owner.json")).pid).toBe(process.pid);
      expect(readFileSync(join(f.lock, "owner.json"))).toEqual(f.lockBytes);
      expect(git(f.owner, "rev-parse", "HEAD")).toBe(f.base);
      expect(f.readJSON(join(f.batchRun, "jobs/0001.launch/owner.json"))).toMatchObject({ version: 1, batchRun: f.batchRun, id: "0001", manifest: f.manifest, manifestDigest: sha256(readFileSync(f.manifest)), base: f.base, run, pid: expect.any(Number) });
      expect(existsSync(join(f.batchRun, "controller.lock"))).toBe(false);
      f.ok("pause", run);
      expect(f.call("configure", run, "true", "5").stderr).toContain("Batch options are fixed");
      expect(f.call("configure", run, "false", "4").stderr).toContain("Batch options are fixed");
      expect(f.call("ship", run).stderr).toContain("Batch runs cannot ship");
      f.ok("release", run);
      expect(existsSync(join(run, "lease"))).toBe(false);
      expect(readFileSync(join(f.lock, "owner.json"))).toEqual(f.lockBytes);
      expect(existsSync(state.root)).toBe(true);
    } finally { f.cleanup(); }
  });

  it("rejects replay both while active and after the original source settles", () => {
    const f = fixture();
    try {
      const run = f.start();
      const claim = join(f.batchRun, "jobs/0001.launch/owner.json");
      const bytes = readFileSync(claim);
      for (const settled of [false, true]) {
        if (settled) { f.ok("pause", run); f.ok("release", run); }
        expect(f.call("start-file", f.request, String(process.pid)).stderr).toContain("already has a launch claim");
        expect(readFileSync(claim)).toEqual(bytes);
        expect(readFileSync(join(f.lock, "owner.json"))).toEqual(f.lockBytes);
        expect(git(f.owner, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(2);
      }
    } finally { f.cleanup(); }
  });

  it.each(["missing-status", "blocked", "pending-approval", "verified", "integrated", "finished"])("rejects %s launch admission before claiming or starting a source", kind => {
    const f = fixture();
    try {
      const parent = f.parent();
      if (kind === "finished") parent.finished = true;
      else if (kind === "missing-status") delete parent.jobs["0001"].status;
      else parent.jobs["0001"].status = kind;
      f.putJSON(f.parentPath, parent);
      expect(f.call("start-file", f.request, String(process.pid)).stderr).toContain("unfinished parent and a scheduled job");
      expect(existsSync(join(f.batchRun, "jobs/0001.launch"))).toBe(false);
      expect(readFileSync(join(f.lock, "owner.json"))).toEqual(f.lockBytes);
      expect(git(f.owner, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
    } finally { f.cleanup(); }
  });

  it("serializes launch admission with parent controller operations", () => {
    const f = fixture();
    try {
      const guard = join(f.batchRun, "controller.lock");
      mkdirSync(guard);
      f.putAt(guard, "sentinel", "parent transaction");
      expect(f.call("start-file", f.request, String(process.pid)).stderr).toContain("batch controller operation is in progress");
      expect(readFileSync(join(guard, "sentinel"), "utf8")).toBe("parent transaction");
      expect(existsSync(join(f.batchRun, "jobs/0001.launch"))).toBe(false);
      rmSync(guard, { recursive: true });
      // Model finish committing its state before releasing controller.lock.
      const parent = f.parent(); parent.finished = true; f.putJSON(f.parentPath, parent);
      expect(f.call("start-file", f.request, String(process.pid)).stderr).toContain("unfinished parent");
      expect(readFileSync(join(f.lock, "owner.json"))).toEqual(f.lockBytes);
    } finally { f.cleanup(); }
  });

  it("admits at most one of simultaneous CLI launch attempts", async () => {
    const f = fixture();
    try {
      const start = () => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(process.execPath, [helper, "start-file", f.request, String(process.pid)], { cwd: f.owner });
        let stdout = ""; let stderr = "";
        child.stdout.on("data", data => { stdout += data; });
        child.stderr.on("data", data => { stderr += data; });
        child.on("error", reject);
        child.on("close", code => resolve({ code, stdout, stderr }));
      });
      const results = await Promise.all([start(), start()]);
      expect(results.filter(r => r.code === 0), JSON.stringify(results)).toHaveLength(1);
      expect(results.find(r => r.code !== 0)?.stderr).toMatch(/already has a launch claim|batch controller operation is in progress/);
      const run = results.find(r => r.code === 0)!.stdout.trim();
      expect(f.readJSON(join(f.batchRun, "jobs/0001.launch/owner.json")).run).toBe(run);
      expect(readdirSync(join(f.owner, ".pi/tmp")).filter(name => /^fix-bug-0001-/.test(name)).filter(name => existsSync(join(f.owner, ".pi/tmp", name, "active")))).toHaveLength(1);
      expect(git(f.owner, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(2);
      expect(readFileSync(join(f.lock, "owner.json"))).toEqual(f.lockBytes);
    } finally { f.cleanup(); }
  });

  it.each(["digest", "unregistered", "owner-root", "parent-root", "batch-root", "job-id", "version", "rounds", "base", "lock-kind", "lock-run", "symlink"])("rejects %s manifest/registration tampering without touching the parent lease", kind => {
    const f = fixture();
    try {
      const job = f.job(); const parent = f.parent();
      if (kind === "digest") writeFileSync(f.manifest, readFileSync(f.manifest, "utf8") + " ");
      else if (kind === "unregistered") { parent.jobs = {}; f.putJSON(f.parentPath, parent); }
      else if (kind === "parent-root") { parent.root += "-other"; f.putJSON(f.parentPath, parent); }
      else if (kind === "lock-kind") f.putJSON(join(f.lock, "owner.json"), { run: f.batchRun });
      else if (kind === "lock-run") f.putJSON(join(f.lock, "owner.json"), { run: f.batchRun + "-other", kind: "batch" });
      else if (kind === "symlink") { const raw = readFileSync(f.manifest); rmSync(f.manifest); f.putAt(f.batchRun, "elsewhere.json", raw.toString()); symlinkSync(join(f.batchRun, "elsewhere.json"), f.manifest); }
      else {
        if (kind === "owner-root") job.ownerRoot += "-other";
        if (kind === "batch-root") job.batchRun += "-other";
        if (kind === "job-id") job.id = "0002";
        if (kind === "version") job.version = 2;
        if (kind === "rounds") job.review_rounds = 4;
        if (kind === "base") job.base = "0".repeat(40);
        f.putJSON(f.manifest, job); f.register();
      }
      const lease = readFileSync(join(f.lock, "owner.json"));
      expect(f.call("start-file", f.request, String(process.pid)).status).not.toBe(0);
      expect(readFileSync(join(f.lock, "owner.json"))).toEqual(lease);
      expect(git(f.owner, "rev-parse", "HEAD")).toBe(f.base);
    } finally { f.cleanup(); }
  });

  it("requires a clean current main, and preserves the parent's lease even if activation fails", () => {
    const f = fixture();
    try {
      f.putAt(f.owner, "src/value.js", "foreign edit");
      expect(f.call("start-file", f.request, String(process.pid)).stderr).toContain("Working tree must be clean");
      git(f.owner, "restore", "src/value.js");
      git(f.owner, "switch", "-c", "other");
      expect(f.call("start-file", f.request, String(process.pid)).stderr).toContain("current owner main HEAD");
      git(f.owner, "switch", "main");
      expect(f.call("start-file", f.request, "not-a-pid").status).not.toBe(0);
      expect(readFileSync(join(f.lock, "owner.json"))).toEqual(f.lockBytes);
      const claim = join(f.batchRun, "jobs/0001.launch/owner.json");
      const bytes = readFileSync(claim);
      const run = f.readJSON(claim).run;
      expect(run).toContain("fix-bug-0001-");
      expect(existsSync(join(f.owner, ".trees", basename(run)))).toBe(false);
      expect(existsSync(join(run, "active"))).toBe(false);
      expect(existsSync(join(run, "lease"))).toBe(false);
      expect(existsSync(join(f.batchRun, "controller.lock"))).toBe(false);
      expect(f.call("start-file", f.request, String(process.pid)).stderr).toContain("already has a launch claim");
      expect(readFileSync(claim)).toEqual(bytes);
    } finally { f.cleanup(); }
  });

  it("retains its claim when worktree creation fails after activation", () => {
    const f = fixture();
    try {
      const gitdir = git(f.owner, "rev-parse", "--absolute-git-dir");
      f.putAt(gitdir, "worktrees", "block git worktree initialization");
      expect(f.call("start-file", f.request, String(process.pid)).stderr).toContain("git worktree failed");
      const claim = join(f.batchRun, "jobs/0001.launch/owner.json");
      const bytes = readFileSync(claim); const run = f.readJSON(claim).run;
      expect(existsSync(join(run, "active"))).toBe(false);
      expect(existsSync(join(run, "lease"))).toBe(false);
      expect(existsSync(join(f.batchRun, "controller.lock"))).toBe(false);
      rmSync(join(gitdir, "worktrees"));
      expect(f.call("start-file", f.request, String(process.pid)).stderr).toContain("already has a launch claim");
      expect(readFileSync(claim)).toEqual(bytes);
      expect(readFileSync(join(f.lock, "owner.json"))).toEqual(f.lockBytes);
    } finally { f.cleanup(); }
  });

  it("treats even an incomplete launch claim as consumed", () => {
    const f = fixture();
    try {
      const claim = join(f.batchRun, "jobs/0001.launch"); mkdirSync(claim);
      expect(f.call("start-file", f.request, String(process.pid)).stderr).toContain("already has a launch claim");
      expect(readdirSync(claim)).toEqual([]);
      expect(readFileSync(join(f.lock, "owner.json"))).toEqual(f.lockBytes);
    } finally { f.cleanup(); }
  });

  it("exports only after final gates and bound clean review; export is strictly read-only", () => {
    const f = fixture();
    try {
      const run = f.start();
      expect(f.call("export-verified", run).stderr).toContain("Missing final verification");
      f.green(run, false);
      expect(f.call("export-verified", run).stderr).toContain("Missing final verification");
      f.ok("gate", run, "final");
      expect(f.call("export-verified", run).stderr).toContain("clean final independent review");
      f.review(run);
      const state = readFileSync(join(run, "state.json"));
      const index = git(f.state(run).root, "ls-files", "--stage", "-z");
      expect(f.ok("export-verified", run)).toBe("PASS");
      expect(readFileSync(join(run, "state.json"))).toEqual(state);
      expect(git(f.state(run).root, "ls-files", "--stage", "-z")).toBe(index);
      expect(existsSync(join(run, "batch-commit.json"))).toBe(false);
      expect(readFileSync(join(f.lock, "owner.json"))).toEqual(f.lockBytes);
    } finally { f.cleanup(); }
  });

  it.each(["bytes", "mode", "index-outside", "index-partial", "gate", "review", "manifest", "lease", "launch-claim"])("rejects %s drift at both collector and commit hooks, preserving all staged content", kind => {
    const f = fixture();
    try {
      const run = f.verified(); const root = f.state(run).root;
      if (kind === "bytes") f.putAt(root, "src/value.js", "export const value = 3;\n");
      if (kind === "mode") chmodSync(join(root, "src/value.js"), statSync(join(root, "src/value.js")).mode ^ 0o100);
      if (kind === "index-outside") { const bytes = readFileSync(join(root, "package.json")); f.putAt(root, "package.json", "{}"); git(root, "add", "package.json"); writeFileSync(join(root, "package.json"), bytes); }
      if (kind === "index-partial") { f.putAt(root, "src/value.js", "export const value = 3;\n"); git(root, "add", "src/value.js"); f.putAt(root, "src/value.js", "export const value = 2;\n"); }
      if (kind === "gate") f.putAt(run, f.state(run).verifiedGateFiles[0], "{}");
      if (kind === "review") f.putAt(run, "final-review.md", "MUST FIX");
      if (kind === "manifest") writeFileSync(f.manifest, readFileSync(f.manifest, "utf8") + " ");
      if (kind === "lease") f.putJSON(join(run, "lease/owner.json"), { run: "other" });
      if (kind === "launch-claim") {
        const claim = join(f.batchRun, "jobs/0001.launch/owner.json");
        f.putJSON(claim, { ...f.readJSON(claim), run: "other" });
      }
      const index = git(root, "ls-files", "--stage", "-z");
      expect(f.call("export-verified", run).status).not.toBe(0);
      expect(f.call("commit-verified", run).status).not.toBe(0);
      expect(git(root, "ls-files", "--stage", "-z")).toBe(index);
      expect(git(root, "rev-parse", "HEAD")).toBe(f.base);
      expect(existsSync(join(run, "batch-commit.json"))).toBe(false);
      expect(readFileSync(join(f.lock, "owner.json"))).toEqual(f.lockBytes);
    } finally { f.cleanup(); }
  });

  it("rejects pending human approvals even with green gates and a clean final review", () => {
    const f = fixture();
    try {
      const run = f.start();
      f.putAt(run, "implement.md", "Two viable compatibility policies remain.");
      f.putAt(run, "decision-request.md", "Allow only the exact local compatibility policy; no Git authority.");
      const context = f.ok("decision-start", run, "implement");
      f.putJSON(context + ".verdict.json", {
        disposition: "human", clear_preference: false, has_tradeoff: true, evidence_sufficient: true,
        summary: "Compatibility tradeoff", recommendation: "Choose the bounded policy", rationale: "Both options are viable under existing evidence.",
        basis: ["The existing compatibility contract"], alternatives: ["Keep old behavior", "Adopt the bounded behavior"],
      });
      expect(f.ok("decision-record", run, context)).toBe("CONTINUE");
      f.green(run); f.review(run);
      expect(f.ok("approval-report", run)).toContain("PENDING OWNER APPROVAL");
      expect(f.call("export-verified", run).stderr).toContain("Pending owner approvals");
      expect(f.call("commit-verified", run).stderr).toContain("Pending owner approvals");
      expect(git(f.state(run).root, "rev-parse", "HEAD")).toBe(f.base);
    } finally { f.cleanup(); }
  });

  it("commits only the verified branch, persists its identity, and can pause/export without merging or cleanup", () => {
    const f = fixture();
    try {
      const run = f.verified(); const root = f.state(run).root;
      // The real /fix-bug ship-false path settles and releases before its
      // parent collects. Parent registration remains the narrow hook authority.
      f.ok("pause", run); f.ok("release", run);
      expect(existsSync(join(run, "lease"))).toBe(false);
      expect(f.ok("export-verified", run)).toBe("PASS");
      // Exact pre-staging is allowed; it is not authority for any extra bytes.
      git(root, "add", "src/value.js");
      expect(f.ok("commit-verified", run)).toBe("PASS");
      const artifact = f.readJSON(join(run, "batch-commit.json"));
      const sha = git(root, "rev-parse", "HEAD");
      expect(artifact).toMatchObject({ version: 1, sha, branch: f.state(run).branch, worktree: root, batchRun: f.batchRun, base: f.base, verifiedPaths: ["src/value.js"] });
      expect(f.state(run).batchCommit).toEqual({ sha, artifactDigest: sha256(readFileSync(join(run, "batch-commit.json"))) });
      expect(sha).not.toBe(f.base);
      expect(git(f.owner, "rev-parse", "HEAD")).toBe(f.base);
      expect(git(root, "status", "--porcelain")).toBe("");
      expect(existsSync(join(run, "shipment.json"))).toBe(false);
      expect(f.call("commit-verified", run).status).not.toBe(0);
      f.ok("pause", run);
      expect(existsSync(join(run, "active"))).toBe(false);
      // Settled source identity survives terminal classification and another
      // integration's authenticated advancement of the parent main/base.
      git(f.owner, "commit", "--allow-empty", "-m", "another integration");
      const parent = f.parent(); parent.base = git(f.owner, "rev-parse", "HEAD");
      parent.jobs["0001"].status = "integrated"; parent.jobs["0001"].sourceRun = run;
      f.putJSON(f.parentPath, parent);
      expect(f.ok("export-verified", run)).toBe("PASS");
      expect(existsSync(root)).toBe(true);
      expect(git(f.owner, "branch", "--list", f.state(run).branch)).not.toBe("");
      expect(readFileSync(join(f.lock, "owner.json"))).toEqual(f.lockBytes);
      f.putJSON(join(run, "batch-commit.json"), { ...artifact, sha: f.base });
      expect(f.call("export-verified", run).stderr).toContain("artifact changed");
    } finally { f.cleanup(); }
  });

  it("keeps deletions and new files verifiable after the scoped commit", () => {
    const f = fixture();
    try {
      const run = f.start(); f.green(run); const root = f.state(run).root;
      rmSync(join(root, "tests/retained.js"));
      f.putAt(root, "tests/new.js", "// verified addition\n");
      f.ok("gate", run, "final"); f.review(run);
      f.ok("commit-verified", run); f.ok("pause", run);
      expect(f.ok("export-verified", run)).toBe("PASS");
      expect(f.state(run).verifiedPaths).toEqual(["src/value.js", "tests/new.js", "tests/retained.js"]);
    } finally { f.cleanup(); }
  });

  it("retains commit-time hook mutations as a failed durable artifact, not integration authority", () => {
    const f = fixture();
    try {
      const run = f.verified(); const root = f.state(run).root;
      const hooks = git(f.owner, "rev-parse", "--absolute-git-dir") + "/hooks";
      f.putAt(hooks, "pre-commit", "#!/bin/sh\nprintf 'unreviewed hook edit\\n' > src/value.js\ngit add src/value.js\n");
      chmodSync(join(hooks, "pre-commit"), 0o755);
      expect(f.call("commit-verified", run).status).not.toBe(0);
      expect(existsSync(join(run, "batch-commit.json"))).toBe(true);
      expect(f.state(run).batchCommit).toBeUndefined();
      expect(f.call("export-verified", run).status).not.toBe(0);
      expect(git(f.owner, "rev-parse", "HEAD")).toBe(f.base);
      f.ok("pause", run);
      expect(existsSync(root)).toBe(true);
      expect(readFileSync(join(f.lock, "owner.json"))).toEqual(f.lockBytes);
    } finally { f.cleanup(); }
  });

  it("never grants the commit-only hook to ordinary numbered runs", () => {
    const f = fixture();
    try {
      rmSync(f.lock, { recursive: true });
      const run = f.ok("init", "1");
      expect(f.state(run).batchRun).toBeUndefined();
      expect(f.call("commit-verified", run).stderr).toContain("only for batch runs");
      expect(f.state(run).options).toEqual({ ship: true, review_rounds: 5 });
    } finally { f.cleanup(); }
  });
});
