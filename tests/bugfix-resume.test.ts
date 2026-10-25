import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const helper = join(process.cwd(), "tools/bugfix/run.mjs");
function call(cwd: string, ...args: string[]) {
  // Controllers always run in the original checkout, even when this test is
  // manipulating worker files in the linked worktree.
  const common = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, encoding: "utf8" });
  return spawnSync(process.execPath, [helper, ...args], { cwd: dirname(common.stdout.trim()), encoding: "utf8" });
}
function git(cwd: string, ...args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim();
}
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "bugfix-resume-"));
  git(cwd, "init", "-b", "main");
  git(cwd, "config", "user.email", "test@example.invalid");
  git(cwd, "config", "user.name", "Test");
  mkdirSync(join(cwd, "docs/bugs"), { recursive: true });
  mkdirSync(join(cwd, "src"));
  mkdirSync(join(cwd, "tests"));
  mkdirSync(join(cwd, ".pi/theta"), { recursive: true });
  writeFileSync(join(cwd, ".gitignore"), ".pi/tmp/\n/.trees/\n");
  writeFileSync(join(cwd, ".pi", "theta", "fix-bug.theta"), "// frozen control identity\n");
  writeFileSync(join(cwd, "docs/bugs/0001-example.md"), "# Example\n- **Status:** open\n");
  writeFileSync(join(cwd, "src/value.js"), "export const value = 1;\n");
  git(cwd, "add", "."); git(cwd, "commit", "-m", "baseline");
  const started = call(cwd, "init", "1");
  expect(started.status, started.stderr).toBe(0);
  const run = started.stdout.trim();
  const request = join(cwd, ".pi/tmp/resume-request.txt");
  const state = () => JSON.parse(readFileSync(join(run, "state.json"), "utf8"));
  const resume = (text = "resume") => {
    writeFileSync(request, text);
    return call(cwd, "resume-file", request, String(process.pid));
  };
  const complete = (phase: string, status = "pass") => {
    expect(call(cwd, "begin", run, phase).status).toBe(0);
    writeFileSync(join(run, phase + ".md"), "Evidence for " + phase);
    if (phase === "plan") writeFileSync(join(run, "spec-proposal.md"), "No change needed");
    writeFileSync(join(run, "stage-" + phase + "-result.txt"), status + "\nSummary for " + phase);
    const r = call(cwd, "record", run, phase);
    expect(r.status, r.stderr).toBe(0);
  };
  const red = () => {
    writeFileSync(join(run, "witnesses.json"), JSON.stringify({
      e2e: [{ argv: [process.execPath, "-e", "if(!require('fs').readFileSync('src/value.js','utf8').includes('value = 2')){console.error('AssertionError: expected two');process.exit(1)}"], failure_pattern: "AssertionError: expected two" }],
      unit: [], unit_omission_reason: "fixture", live_required: false, live: [],
    }));
    const r = call(cwd, "red", run); expect(r.status, r.stderr).toBe(0);
  };
  return { cwd: state().root as string, ownerRoot: cwd, run, request, state, resume, complete, red, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

function batchFixture(f: ReturnType<typeof fixture>) {
  const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
  const batchRun = join(f.ownerRoot, ".pi/tmp/fix-all-bugs-11111111-1111-4111-8111-111111111111");
  mkdirSync(join(batchRun, "jobs/0001.launch"), { recursive: true });
  const manifest = join(batchRun, "jobs/0001.json");
  const source = f.state();
  const raw = JSON.stringify({ version: 1, ownerRoot: f.ownerRoot, batchRun, id: "0001", base: source.base, review_rounds: 5 });
  writeFileSync(manifest, raw);
  const parent = { version: 1, root: f.ownerRoot, base: source.base, jobs: { "0001": { manifest, manifestDigest: hash(raw), sourceRun: f.run, status: "scheduled", resumeRequested: true } }, workflowUpgrades: [] as unknown[] };
  const saveParent = () => writeFileSync(join(batchRun, "state.json"), JSON.stringify(parent));
  saveParent();
  const claim = { version: 1, batchRun, id: "0001", manifest, manifestDigest: hash(raw), base: source.base, run: f.run };
  const claimPath = join(batchRun, "jobs/0001.launch/owner.json");
  writeFileSync(claimPath, JSON.stringify(claim));
  writeFileSync(join(f.ownerRoot, ".pi/tmp/fix-bug.lock/owner.json"), JSON.stringify({ run: batchRun, kind: "batch" }));
  mkdirSync(join(f.run, "lease"));
  writeFileSync(join(f.run, "lease/owner.json"), JSON.stringify({ run: f.run }));
  Object.assign(source, { batchRun, batchManifest: manifest, batchManifestDigest: hash(raw), options: { ship: false, review_rounds: 5 } });
  writeFileSync(join(f.run, "state.json"), JSON.stringify(source));
  const resume = () => {
    writeFileSync(f.request, "batch-resume " + manifest);
    return call(f.cwd, "resume-batch-file", f.request, String(process.pid));
  };
  return { batchRun, parent, saveParent, manifest, claim, claimPath, resume, hash };
}

describe("durable /fix-bug resume control plane", () => {
  it("routes legacy exact implementation scope stops through authority-free replanning, not prose heuristics", () => {
    const f = fixture();
    try {
      f.complete("plan"); f.red();
      expect(call(f.cwd, "begin", f.run, "implement").status).toBe(0);
      writeFileSync(join(f.run, "implement.md"), "Routine exact fixture revision; prior plan remains immutable.");
      writeFileSync(join(f.run, "decision-request.md"), "Exact common-prefix revision for one named fixture, preserving controls.");
      writeFileSync(join(f.run, "stage-implement-result.txt"), "blocked\nA fresh plan/review is required");
      expect(call(f.cwd, "record", f.run, "implement").status).toBe(0);
      const plan = readFileSync(join(f.run, "plan.md"));
      expect(f.resume().status).toBe(0);
      expect(f.state().replanRequired).toBe(true);
      expect(f.state().decisions).toBeUndefined();
      expect(f.state().checkpoints.plan).toBeUndefined();
      const archive = f.state().pendingScopeReplan.archive;
      expect(readFileSync(join(archive, "plan.md"))).toEqual(plan);
      expect(call(f.cwd, "begin", f.run, "implement").stderr).toContain("exact scope authorization");
    } finally { f.cleanup(); }
  });

  it("authenticates batch resume against the original manifest, launch claim and scheduled source without a new run", () => {
    const f = fixture();
    try {
      f.complete("plan"); f.red();
      const b = batchFixture(f);
      const proof = readFileSync(join(f.run, "red-0.json"));
      expect(b.resume().stdout.trim()).toBe(f.run);
      expect(f.state().options).toEqual({ ship: false, review_rounds: 5 });
      expect(f.state().resumeCount).toBe(1);
      expect(readFileSync(join(f.run, "red-0.json"))).toEqual(proof);
      expect(call(f.cwd, "cached", f.run, "plan").stdout.trim()).toBe("PASS");
      expect(b.resume().stderr).toContain("still marked active");
      expect(call(f.cwd, "pause", f.run).status).toBe(0);
      b.parent.jobs["0001"].resumeRequested = false; b.saveParent();
      expect(b.resume().stderr).toContain("explicitly scheduled");
      b.parent.jobs["0001"].resumeRequested = true; b.saveParent();
      writeFileSync(join(f.ownerRoot, ".pi/tmp/fix-bug.lock/owner.json"), JSON.stringify({ run: b.batchRun + "-different", kind: "batch" }));
      expect(b.resume().stderr).toContain("checkout lease");
      writeFileSync(join(f.ownerRoot, ".pi/tmp/fix-bug.lock/owner.json"), JSON.stringify({ run: b.batchRun, kind: "batch" }));
      writeFileSync(b.claimPath, JSON.stringify({ ...b.claim, run: f.run + "-other" }));
      expect(b.resume().stderr).toContain("launch claim");
      expect(existsSync(join(f.run, "active"))).toBe(false);
      writeFileSync(b.claimPath, JSON.stringify(b.claim));
      writeFileSync(b.manifest, readFileSync(b.manifest, "utf8") + " ");
      expect(b.resume().stderr).toContain("immutable digest");
    } finally { f.cleanup(); }
  });

  it("permits only recorded owner workflow upgrades while retaining the exact original source controls/base", () => {
    const f = fixture();
    try {
      f.complete("plan"); f.complete("implement", "blocked"); f.red();
      const b = batchFixture(f);
      const sourceState = f.state();
      const control = [".pi", "theta", "fix-bug.theta"].join("/");
      const original = readFileSync(join(f.cwd, control));
      writeFileSync(join(f.ownerRoot, control), "// repaired owner workflow\n");
      git(f.ownerRoot, "add", control); git(f.ownerRoot, "commit", "-m", "workflow repair only");
      b.parent.base = git(f.ownerRoot, "rev-parse", "HEAD"); b.saveParent();
      expect(b.resume().stderr).toContain("authenticated owner workflow upgrade");
      const upgrade = { base: sourceState.base, sha: b.parent.base, ownerControls: [{ path: control, digest: b.hash(readFileSync(join(f.ownerRoot, control))) }] };
      b.parent.workflowUpgrades.push(upgrade); b.saveParent();
      expect(b.resume().status).toBe(0);
      expect(f.state().base).toBe(sourceState.base);
      expect(f.state().controlDigest).toBe(sourceState.controlDigest);
      const retainedControl = readFileSync(join(f.cwd, control));
      expect(retainedControl).toEqual(original);
      expect(call(f.cwd, "pause", f.run).status).toBe(0);
      writeFileSync(join(f.cwd, control), "// source changed\n");
      expect(b.resume().stderr).toContain("Workflow/control files changed");
      writeFileSync(join(f.cwd, control), original);
      upgrade.ownerControls[0]!.digest = "0".repeat(64); b.saveParent();
      expect(b.resume().stderr).toContain("latest authenticated upgrade");
      upgrade.ownerControls.push({ path: "src/value.js", digest: "0".repeat(64) }); b.saveParent();
      expect(b.resume().stderr).toContain("path union/subset");
    } finally { f.cleanup(); }
  });

  it("rejects committed batch sources and never adopts a changed registered source", () => {
    const f = fixture();
    try {
      const b = batchFixture(f);
      writeFileSync(join(f.run, "batch-commit.json"), "{}");
      expect(b.resume().stderr).toContain("Committed/shipped sources");
      rmSync(join(f.run, "batch-commit.json"));
      b.parent.jobs["0001"].sourceRun = f.run + "-not-original"; b.saveParent();
      expect(b.resume().status).not.toBe(0);
      expect(existsSync(join(f.run, "active"))).toBe(false);
    } finally { f.cleanup(); }
  });

  it("parses explicit resume syntax, preserves omitted options, and rejects unsafe/duplicate options", () => {
    const f = fixture();
    try {
      for (const [input, output] of [
        ["resume", "RESUME\n\nkeep\nkeep"],
        ["resume 1 ship false review_rounds 2", "RESUME\n0001\nfalse\n2"],
        ["batch-resume /tmp/original manifest.json", "BATCH_RESUME\n/tmp/original manifest.json\nfalse\n5"],
      ] as const) {
        writeFileSync(f.request, input);
        expect(call(f.cwd, "parse-file", f.request).stdout.trimEnd()).toBe(output);
      }
      for (const input of ["resume ../outside", "resume 1;touch bad", "resume ship maybe", "resume review_rounds 0", "resume ship true ship false", "batch-resume relative.json", "batch-resume /tmp/../manifest.json", "batch-resume /tmp/manifest.json\nship true"]) {
        writeFileSync(f.request, input);
        expect(call(f.cwd, "parse-file", f.request).status).not.toBe(0);
      }
    } finally { f.cleanup(); }
  });

  it("publishes initialization only after saving original options and claiming active execution", () => {
    const f = fixture();
    try {
      expect(call(f.cwd, "release", f.run).status).toBe(0);
      writeFileSync(f.request, "1 ship false review_rounds 2");
      const started = call(f.cwd, "start-file", f.request, String(process.pid));
      expect(started.status, started.stderr).toBe(0);
      const run = started.stdout.trim();
      const readState = () => JSON.parse(readFileSync(join(run, "state.json"), "utf8"));
      expect(JSON.parse(readFileSync(join(f.ownerRoot, ".pi/tmp/fix-bug.lock/owner.json"), "utf8")).run).toBe(run);
      expect(existsSync(join(run, "active/owner.json"))).toBe(true);
      expect(readState().options).toEqual({ ship: false, review_rounds: 2 });
      // B cannot take over A between init/configure/enter: those are now one
      // start transaction. Even a legacy pending configure cannot alter B/A.
      expect(f.resume("resume ship true").stderr).toContain("still marked active");
      expect(call(f.cwd, "configure", run, "true", "5").stderr).toContain("Cannot configure an active workflow");
      expect(readState().options).toEqual({ ship: false, review_rounds: 2 });
      expect(call(f.cwd, "pause", run).status).toBe(0);
      expect(f.resume().status).toBe(0);
      expect(readState().options).toEqual({ ship: false, review_rounds: 2 });
    } finally { f.cleanup(); }
  });

  it("does not expose a resumable lease when initialization cannot claim its host", () => {
    const f = fixture();
    try {
      expect(call(f.cwd, "release", f.run).status).toBe(0);
      writeFileSync(f.request, "1 ship false");
      expect(call(f.cwd, "start-file", f.request, "0").status).not.toBe(0);
      expect(existsSync(join(f.ownerRoot, ".pi/tmp/fix-bug.lock"))).toBe(false);
      expect(f.resume().stderr).toContain("No paused run");
    } finally { f.cleanup(); }
  });

  it("isolates overlapping request handoffs with different bug assertions and shipment options", () => {
    const f = fixture();
    try {
      const a = call(f.cwd, "request").stdout.trim();
      const b = call(f.cwd, "request").stdout.trim();
      expect(a).not.toBe(b);
      writeFileSync(a, "resume 1 ship false");
      writeFileSync(b, "resume 2 ship true");
      const first = call(f.cwd, "resume-file", a, String(process.pid));
      expect(first.status, first.stderr).toBe(0);
      expect(first.stdout.trim()).toBe(f.run);
      expect(f.state().id).toBe("0001");
      expect(f.state().options.ship).toBe(false);
      expect(call(f.cwd, "resume-file", b, String(process.pid)).status).not.toBe(0);
      expect(call(f.cwd, "pause", f.run).status).toBe(0);
      expect(call(f.cwd, "resume-file", b, String(process.pid)).stderr).toContain("does not match");
      expect(f.state().options.ship).toBe(false);
      expect(readFileSync(a, "utf8")).toBe("resume 1 ship false");
      expect(readFileSync(b, "utf8")).toBe("resume 2 ship true");
    } finally { f.cleanup(); }
  });

  it("resumes the lease's same run and saved options, never guesses from old directories", () => {
    const f = fixture();
    try {
      expect(call(f.cwd, "configure", f.run, "false", "3").status).toBe(0);
      const r = f.resume(); expect(r.status, r.stderr).toBe(0);
      expect(r.stdout.trim()).toBe(f.run);
      expect(f.state().options).toEqual({ ship: false, review_rounds: 3 });
      expect(f.state().resumeCount).toBe(1);
      expect(call(f.cwd, "cached", f.run, "reproduce").stdout.trim()).toBe("RUN");
      expect(call(f.cwd, "pause", f.run).status).toBe(0);
      expect(f.resume("resume 1 ship true review_rounds 2").status).toBe(0);
      expect(f.state().options).toEqual({ ship: true, review_rounds: 2 });
      expect(call(f.cwd, "release", f.run).status).toBe(0);
      expect(f.resume().stderr).toContain("No paused run");
    } finally { f.cleanup(); }
  });

  it("requires explicit quiescence confirmation for both live and dead-host markers", () => {
    const f = fixture();
    try {
      expect(call(f.cwd, "enter", f.run, String(process.pid)).status).toBe(0);
      expect(f.resume().stderr).toContain("still marked active");
      expect(call(f.cwd, "pause", f.run).status).toBe(0);
      mkdirSync(join(f.run, "active"));
      writeFileSync(join(f.run, "active/owner.json"), JSON.stringify({ pid: 2147483647 }));
      expect(f.resume().stderr).toContain("dead host may have surviving workers/gates");
      expect(call(f.cwd, "pause", f.run).status).toBe(0);
      expect(f.resume().status).toBe(0);
      expect(f.resume().status).not.toBe(0);
    } finally { f.cleanup(); }
  });

  it("serializes activation attempts and refuses unexplained activation claims", () => {
    const f = fixture();
    try {
      mkdirSync(join(f.run, "activation"));
      expect(f.resume().stderr).toContain("Another activation is in progress");
      expect(existsSync(join(f.run, "active"))).toBe(false);
    } finally { f.cleanup(); }
  });

  it("reuses completed proof stages, reruns interrupted/blocked stages, and archives prior reports", () => {
    const f = fixture();
    try {
      f.complete("reproduce"); f.complete("diagnose"); f.red(); f.complete("plan");
      f.complete("implement", "blocked");
      expect(f.resume().status).toBe(0);
      for (const phase of ["reproduce", "diagnose", "plan"]) expect(call(f.cwd, "cached", f.run, phase).stdout.trim()).toBe("PASS");
      expect(call(f.cwd, "cached", f.run, "implement").stdout.trim()).toBe("RUN");
      expect(call(f.cwd, "begin", f.run, "implement").status).toBe(0);
      expect(f.state().checkpoints.implement).toMatchObject({ attempt: 2, status: "running" });
      expect(readFileSync(join(f.run, "history/implement-2-before-implement.md"), "utf8")).toBe("Evidence for implement");
      expect(call(f.cwd, "cached", f.run, "implement").stdout.trim()).toBe("RUN");
    } finally { f.cleanup(); }
  });

  it("allows partial source edits but never reruns or overwrites accepted pre-fix reds", () => {
    const f = fixture();
    try {
      f.complete("reproduce"); f.red();
      const proof = readFileSync(join(f.run, "red-0.json"));
      writeFileSync(join(f.cwd, "src/value.js"), "export const value = 2;\n");
      expect(f.resume().status).toBe(0);
      const r = call(f.cwd, "red", f.run); expect(r.status, r.stderr).toBe(0);
      expect(readFileSync(join(f.run, "red-0.json"))).toEqual(proof);
      expect(call(f.cwd, "pause", f.run).status).toBe(0);
      const mutated = JSON.parse(proof.toString()); mutated.output += "\nMutated but same pinned assertion signature";
      writeFileSync(join(f.run, "red-0.json"), JSON.stringify(mutated));
      expect(f.resume().stderr).toContain("Original red evidence changed");
      writeFileSync(join(f.run, "red-0.json"), proof);
      writeFileSync(join(f.run, "witnesses.json"), "{}");
      expect(f.resume().stderr).toContain("Witness commands/signatures changed");
    } finally { f.cleanup(); }
  });

  it("invalidates a completed implementation after checkout drift and never caches repair/closure", () => {
    const f = fixture();
    try {
      f.complete("implement"); f.complete("repair"); f.complete("close");
      expect(call(f.cwd, "cached", f.run, "implement").stdout.trim()).toBe("PASS");
      for (const phase of ["repair", "close"]) expect(call(f.cwd, "cached", f.run, phase).stdout.trim()).toBe("RUN");
      writeFileSync(join(f.cwd, "src/value.js"), "export const value = 2;\n");
      expect(call(f.cwd, "cached", f.run, "implement").stdout.trim()).toBe("RUN");
    } finally { f.cleanup(); }
  });

  it("invalidates completed implementation when a new plan is recorded without checkout edits", () => {
    const f = fixture();
    try {
      f.complete("plan"); f.complete("implement");
      expect(call(f.cwd, "cached", f.run, "implement").stdout.trim()).toBe("PASS");
      expect(call(f.cwd, "begin", f.run, "plan").status).toBe(0);
      writeFileSync(join(f.run, "plan.md"), "A new reviewed implementation plan");
      writeFileSync(join(f.run, "stage-plan-result.txt"), "pass\nNew plan");
      expect(call(f.cwd, "record", f.run, "plan").status).toBe(0);
      expect(call(f.cwd, "cached", f.run, "implement").stdout.trim()).toBe("RUN");
    } finally { f.cleanup(); }
  });

  it("retains implementation updates separately and explicitly replans a revised spec proposal", () => {
    const f = fixture();
    try {
      f.complete("plan");
      writeFileSync(join(f.run, "spec-answer.txt"), "User selected: 2. Approve proposed spec changes");
      expect(call(f.cwd, "approval", f.run).status).toBe(0);
      writeFileSync(join(f.run, "implementation-update.md"), "Actual implementation outcomes, not a plan rewrite");
      f.complete("implement", "blocked");
      expect(f.resume().status).toBe(0);
      expect(call(f.cwd, "cached", f.run, "plan").stdout.trim()).toBe("PASS");
      expect(call(f.cwd, "pause", f.run).status).toBe(0);
      writeFileSync(join(f.run, "spec-revision-proposal.md"), "New exact scope");
      f.complete("implement", "needs_spec");
      expect(f.state().replanRequired).toBe(true);
      expect(f.state().checkpoints.plan).toBeUndefined();
      expect(readFileSync(join(f.run, "history/implement-2-before-replan-plan.md"), "utf8")).toBe("Evidence for plan");
      expect(f.resume().status).toBe(0);
      expect(call(f.cwd, "cached", f.run, "plan").stdout.trim()).toBe("RUN");
      expect(call(f.cwd, "begin", f.run, "plan").status).toBe(0);
      writeFileSync(join(f.run, "plan.md"), "Revised plan");
      writeFileSync(join(f.run, "spec-proposal.md"), "New exact scope");
      writeFileSync(join(f.run, "stage-plan-result.txt"), "needs_spec\nRevised scope needs its own approval");
      expect(call(f.cwd, "record", f.run, "plan").status).toBe(0);
      expect(call(f.cwd, "approved", f.run).status).not.toBe(0);
      expect(f.state().approvedProposal).toBe("No change needed");
      writeFileSync(join(f.run, "spec-answer.txt"), "User selected: 2. Approve proposed spec changes");
      expect(call(f.cwd, "approval", f.run).status).toBe(0);
      expect(call(f.cwd, "approved", f.run).status).toBe(0);
      // Approval is artifact-only: the unchanged checkout must not cache the
      // old needs_spec result and trap implementation in an endless stop.
      expect(call(f.cwd, "cached", f.run, "implement").stdout.trim()).toBe("RUN");
      f.complete("implement");
      expect(f.state().checkpoints.implement).toMatchObject({ attempt: 3, status: "pass" });
      expect(call(f.cwd, "cached", f.run, "implement").stdout.trim()).toBe("PASS");
    } finally { f.cleanup(); }
  });

  it("archives fix/evidence/final review findings across repeated resumes", () => {
    const f = fixture();
    try {
      const files = ["evidence-review.md", "reviews.md", "final-review.md"];
      for (const file of files) writeFileSync(join(f.run, file), "Original MUST-FIX: " + file);
      expect(f.resume().status).toBe(0);
      for (const file of files) {
        expect(readFileSync(join(f.run, "history/resume-1-before-" + file), "utf8")).toBe("Original MUST-FIX: " + file);
        writeFileSync(join(f.run, file), "Next review: " + file);
      }
      expect(call(f.cwd, "pause", f.run).status).toBe(0);
      expect(f.resume().status).toBe(0);
      for (const file of files) {
        expect(readFileSync(join(f.run, "history/resume-1-before-" + file), "utf8")).toBe("Original MUST-FIX: " + file);
        expect(readFileSync(join(f.run, "history/resume-2-before-" + file), "utf8")).toBe("Next review: " + file);
      }
    } finally { f.cleanup(); }
  });

  it("reads authoritative state only after exclusive execution ownership", () => {
    const f = fixture();
    try {
      expect(call(f.cwd, "configure", f.run, "false", "2").status).toBe(0);
      expect(call(f.cwd, "enter", f.run, String(process.pid)).status).toBe(0);
      expect(f.resume().status).not.toBe(0);
      f.complete("plan");
      expect(call(f.cwd, "pause", f.run).status).toBe(0);
      expect(f.resume().status).toBe(0);
      expect(f.state().options).toEqual({ ship: false, review_rounds: 2 });
      expect(f.state().checkpoints.plan.status).toBe("pass");
      expect(call(f.cwd, "cached", f.run, "plan").stdout.trim()).toBe("PASS");
    } finally { f.cleanup(); }
  });

  it("does not infer completion from a report file and refuses altered completed reports", () => {
    const f = fixture();
    try {
      writeFileSync(join(f.run, "implement.md"), "Looks green but was never recorded");
      expect(call(f.cwd, "cached", f.run, "implement").stdout.trim()).toBe("RUN");
      f.complete("plan");
      writeFileSync(join(f.run, "plan.md"), "Changed without checkpoint reconciliation");
      expect(f.resume().stderr).toContain("Completed stage report/result changed: plan");
    } finally { f.cleanup(); }
  });

  it.each(["head", "control", "wrong-bug", "legacy", "shipped", "spec"])("refuses unsafe %s resume", reason => {
    const f = fixture();
    try {
      if (reason === "head") { writeFileSync(join(f.cwd, "src/value.js"), "changed"); git(f.cwd, "add", "."); git(f.cwd, "commit", "-m", "foreign"); }
      if (reason === "control") writeFileSync(join(f.cwd, ".pi", "theta", "fix-bug.theta"), "changed workflow");
      if (reason === "legacy") { const s = f.state(); delete s.resumeVersion; writeFileSync(join(f.run, "state.json"), JSON.stringify(s)); }
      if (reason === "shipped") writeFileSync(join(f.run, "shipment.json"), JSON.stringify({ pushed: true }));
      if (reason === "spec") { mkdirSync(join(f.cwd, "docs/spec_topics")); writeFileSync(join(f.cwd, "docs/spec_topics/changed.md"), "unapproved"); }
      expect(f.resume(reason === "wrong-bug" ? "resume 2" : "resume").status).not.toBe(0);
      expect(existsSync(join(f.run, "active"))).toBe(false);
    } finally { f.cleanup(); }
  });

  it("requires the exact saved spec approval and never infers it from a proposal", () => {
    const f = fixture();
    try {
      writeFileSync(join(f.run, "spec-proposal.md"), "Exact contract");
      expect(call(f.cwd, "approved", f.run).status).not.toBe(0);
      writeFileSync(join(f.run, "spec-answer.txt"), "User selected: 2. Approve proposed spec changes");
      expect(call(f.cwd, "approval", f.run).status).toBe(0);
      expect(call(f.cwd, "approved", f.run).status).toBe(0);
      writeFileSync(join(f.run, "spec-proposal.md"), "Different contract");
      expect(call(f.cwd, "approved", f.run).status).not.toBe(0);
    } finally { f.cleanup(); }
  });

  it("fences an outstanding controller/gate from overwriting a newer resumed state", async () => {
    const f = fixture();
    let child: ReturnType<typeof spawn> | undefined;
    let settled: Promise<number | null> | undefined;
    const release = join(f.cwd, ".pi/tmp/gate-release");
    try {
      f.red();
      writeFileSync(join(f.cwd, "src/value.js"), "export const value = 2;\n");
      const wait = "const fs=require('fs');fs.writeFileSync('.pi/tmp/gate-started','');while(!fs.existsSync('.pi/tmp/gate-release')){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10)}";
      writeFileSync(join(f.cwd, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e " + JSON.stringify(wait), test: 'node -e "process.exit(0)"' } }));
      let output = "";
      child = spawn(process.execPath, [helper, "gate", f.run, "initial"], { cwd: f.ownerRoot, stdio: ["ignore", "pipe", "pipe"] });
      child.stdout?.on("data", data => { output += data.toString(); });
      child.stderr?.on("data", data => { output += data.toString(); });
      settled = new Promise((resolve, reject) => { child!.once("error", reject); child!.once("close", resolve); });
      const deadline = Date.now() + 15000;
      while (!existsSync(join(f.cwd, ".pi/tmp/gate-started")) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
      expect(existsSync(join(f.cwd, ".pi/tmp/gate-started")), output).toBe(true);
      // Simulate a mistaken manual quiescence confirmation; the old gate MUST
      // still be unable to write its stale snapshot over this newer invocation.
      expect(call(f.cwd, "pause", f.run).status).toBe(0);
      expect(f.resume().status).toBe(0);
      const generation = f.state().generation;
      writeFileSync(release, "go");
      expect(await settled, output).not.toBe(0);
      expect(output).toContain("Stale controller invocation");
      expect(f.state().generation).toBe(generation);
      expect(f.state().resumeCount).toBe(1);
      expect(f.state().verifiedDigest).toBeUndefined();
    } finally {
      writeFileSync(release, "go");
      if (settled) await settled;
      f.cleanup();
    }
  }, 25000);

  it("preserves failed gate attempts and clears old verification permission on resume", () => {
    const f = fixture();
    try {
      f.red();
      writeFileSync(join(f.cwd, "src/value.js"), "export const value = 2;\n");
      writeFileSync(join(f.cwd, "package.json"), JSON.stringify({ scripts: { typecheck: 'node -e "process.exit(1)"', test: 'node -e "process.exit(0)"' } }));
      expect(call(f.cwd, "gate", f.run, "initial").status).not.toBe(0);
      const failed = readFileSync(join(f.run, "gate-1-initial-0.json"));
      expect(f.state().gateCount).toBe(1);
      writeFileSync(join(f.cwd, "package.json"), JSON.stringify({ scripts: { typecheck: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"' } }));
      expect(call(f.cwd, "gate", f.run, "final").status).toBe(0);
      expect(f.state().stages).toContain("gate-final");
      writeFileSync(join(f.run, "ship-answer.txt"), "User selected: 2. Commit and push this fix");
      expect(f.state().gateCount).toBe(2);
      expect(readFileSync(join(f.run, "gate-1-initial-0.json"))).toEqual(failed);
      expect(f.state().verifiedDigest).toBeTypeOf("string");
      expect(f.resume().status).toBe(0);
      expect(f.state().verifiedDigest).toBeUndefined();
      expect(f.state().verifiedPaths).toBeUndefined();
      expect(f.state().stages).toEqual(["red"]);
      expect(f.state().resumeHistory[0].priorStages).toContain("gate-final");
      expect(existsSync(join(f.run, "ship-answer.txt"))).toBe(false);
      expect(readFileSync(join(f.run, "history/resume-1-before-ship-answer.txt"), "utf8")).toContain("Commit and push this fix");
      expect(call(f.cwd, "gate", f.run, "initial").status).toBe(0);
      writeFileSync(join(f.run, "ship-answer.txt"), "User selected: 2. Commit and push this fix");
      expect(call(f.cwd, "ship", f.run).stderr).toContain("Missing final verification");
    } finally { f.cleanup(); }
  });
});
