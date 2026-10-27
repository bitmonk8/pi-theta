// No retained runs: real controller subprocesses, isolated Git repositories, no provider.
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
const helper = join(process.cwd(), "tools/bugfix/run.mjs");
const stageControl = join('.pi', 'theta', 'workers', 'bugfix-stage.theta');
const oldRequest = "Exact parallel marker repair only; retain outer-kind refusal and original witness.";
const replacement = "Exact complete marker repair: parallel Result plus condition, addition, ordering and unknown method; retain outer-kind, binder marker, local enum/schema, unknown and subagent controls. Owner withholding is binding; no materialisation or global erasure.";
function fixture(failure: "plan" | "evidence" = "plan", legacy = false, deferredOwnerChoice = false) {
  const cwd = mkdtempSync(join(tmpdir(), "scope-revision-"));
  const put = (base: string, path: string, text: string) => { mkdirSync(dirname(join(base, path)), { recursive: true }); writeFileSync(join(base, path), text); };
  const git = (...args: string[]) => { const r = spawnSync("git", args, { cwd, encoding: "utf8" }); expect(r.status, r.stderr).toBe(0); };
  git("init", "-b", "main"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "Test");
  put(cwd, ".gitignore", ".pi/tmp/\n/.trees/\n"); put(cwd, "docs/bugs/0518-example.md", "# Marker\n- **Status:** open\n");
  put(cwd, "src/value.js", "original\n"); put(cwd, "tests/control.js", "retain\n");
  put(cwd, stageControl, "// retained control identity\n");
  git("add", "."); git("commit", "-m", "fixture");
  const call = (...args: string[]) => spawnSync(process.execPath, [helper, ...args], { cwd, encoding: "utf8" });
  const ok = (...args: string[]) => { const r = call(...args); expect(r.status, r.stderr + r.stdout).toBe(0); return r.stdout.trim(); };
  const run = ok("init", "518");
  const state = () => JSON.parse(readFileSync(join(run, "state.json"), "utf8"));
  const root = state().root;
  const report = (phase: string, status: string, request?: string) => {
    put(run, phase + ".md", "Exact report " + phase + ": all findings must be addressed.");
    if (phase === "plan") put(run, "spec-proposal.md", "No normative edits authorized.");
    if (request) put(run, "decision-request.md", request);
    put(run, "stage-" + phase + "-result.txt", status + "\nExact stage outcome");
    ok("record", run, phase);
  };
  put(run, "witnesses.json", JSON.stringify({ e2e: [{ argv: [process.execPath, "-e", "console.error('AssertionError: original marker leak');process.exit(1)"], failure_pattern: "AssertionError: original marker leak" }], unit: [], unit_omission_reason: "Controller boundary", live_required: false, live: [] }));
  ok("red", run);
  ok("begin", run, "plan"); report("plan", "pass");
  let ownerContext = "";
  if (deferredOwnerChoice) {
    ownerContext = ok("decision-start", run, "plan");
    writeFileSync(ownerContext + ".verdict.json", JSON.stringify({ disposition: "human", clear_preference: false, has_tradeoff: true, evidence_sufficient: true,
      summary: "Owner withholding choice is provisional, not repair approval.", recommendation: "Withhold unavailable imported-member types.", rationale: "The strategy is independent of the exact engineering remedy.",
      basis: ["Original design tradeoff"], alternatives: ["Withhold unavailable type information", "Materialise at load time"] }));
    ok("decision-record", run, ownerContext);
  }
  ok("begin", run, "repair"); report("repair", "needs_replan", oldRequest);
  ok("stage-replan", run, "repair");
  ok("begin", run, "plan"); report("plan", failure === "plan" ? "blocked" : "pass", oldRequest);
  if (legacy) {
    const saved = state();
    for (const checkpoint of Object.values(saved.checkpoints) as Record<string, unknown>[]) {
      for (const key of ["checkoutIdentityDigest", "sequence", "revision", "generation"]) delete checkpoint[key];
    }
    delete saved.transitionSequence; delete saved.lastTransition;
    writeFileSync(join(run, "state.json"), JSON.stringify(saved));
  }
  const review = "MUST FIX: parallel-only omits condition, addition, ordering and unknown-method leaks.";
  ok("snapshot", run);
  put(run, "evidence-review.md", review); put(run, "evidence-review-result.json", JSON.stringify({ ok: false, findings: review }));
  const context = ok("decision-start", run, failure);
  const verdict = (path: string, disposition = "blocked") => put(run, path.slice(run.length + 1) + ".verdict.json", JSON.stringify({ disposition, clear_preference: disposition === "continue", has_tradeoff: false, evidence_sufficient: disposition === "continue", summary: "Exact request incomplete.", recommendation: "Revise reports only to cover every finding.", rationale: "Owner withholding does not approve an incomplete repair.", basis: ["Exact stage and independent findings"], alternatives: ["Complete bounded request", "Retain blocked scope"] }));
  verdict(context); ok("decision-record", run, context);
  const beginRevision = () => ok("begin", run, "scope-revision");
  const propose = (text = replacement, status = "pass") => report("scope-revision", status, text);
  return { cwd, root, run, state, put, call, ok, report, verdict, context, ownerContext, beginRevision, propose, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

describe("rejected exact-scope report-only supersession", () => {
  it.each(["plan", "evidence"] as const)("supersedes a rejected %s without CONTINUE or currentPlan authority", failure => {
    const f = fixture(failure);
    try {
      const history = f.state().decisions;
      const original = readFileSync(join(f.run, "plan.md"));
      const red = readFileSync(join(f.run, "red-0.json"));
      expect(f.ok("scope-revision-status", f.run)).toBe("REQUIRED");
      f.beginRevision();
      const revision = f.state().scopeRevision;
      expect(readFileSync(join(revision.archive, "decision-request.md"), "utf8")).toBe(oldRequest);
      expect(readFileSync(join(revision.archive, "plan.md"))).toEqual(original);
      expect(f.call("begin", f.run, "implement").stderr).toContain("report-only scope revision");
      f.propose();
      const pending = f.state().pendingScopeReplan;
      expect(pending.exactRequest).toBe(replacement);
      expect(pending.supersedes).toBe(revision.archive);
      expect(f.state().decisions).toEqual(history);
      expect(readFileSync(join(f.run, "red-0.json"))).toEqual(red);
      expect(f.call("begin", f.run, "repair").stderr).toContain("exact scope authorization");
      f.ok("begin", f.run, "plan"); f.report("plan", "pass", replacement);
      const stale = f.ok("decision-start", f.run, "scope"); f.verdict(stale, "continue");
      expect(f.call("decision-record", f.run, stale).stderr).toContain("evidence-review-record");
      f.ok("snapshot", f.run);
      f.put(f.run, "evidence-review.md", "Clean independent complete-scope review.");
      f.put(f.run, "evidence-review-result.json", JSON.stringify({ ok: true, findings: "Clean independent complete-scope review." }));
      f.ok("evidence-review-record", f.run);
      const fresh = f.ok("decision-start", f.run, "scope"); f.verdict(fresh, "continue");
      f.ok("decision-record", f.run, fresh); f.ok("begin", f.run, "implement");
      expect(f.state().scopeReplanAuthorization.requestDigest).toBe(pending.requestDigest);
    } finally { f.cleanup(); }
  });

  it("does not reopen an already authorized scope because a later verification prerequisite failed", () => {
    const f = fixture("evidence");
    try {
      f.beginRevision(); f.propose(); f.ok("begin", f.run, "plan"); f.report("plan", "pass", replacement);
      f.ok("snapshot", f.run);
      f.put(f.run, "evidence-review.md", "Clean scope evidence.");
      f.put(f.run, "evidence-review-result.json", JSON.stringify({ ok: true, findings: "Clean scope evidence." }));
      f.ok("evidence-review-record", f.run);
      const scope = f.ok("decision-start", f.run, "scope"); f.verdict(scope, "continue"); f.ok("decision-record", f.run, scope);
      f.ok("begin", f.run, "implement"); f.report("implement", "blocked");
      f.ok("snapshot", f.run);
      f.put(f.run, "evidence-review.md", "Full verification timed out; cause not yet established.");
      f.put(f.run, "evidence-review-result.json", JSON.stringify({ ok: false, findings: "Full verification timed out; cause not yet established." }));
      const evidence = f.ok("decision-start", f.run, "evidence"); f.verdict(evidence); f.ok("decision-record", f.run, evidence);
      const authority = f.state().scopeReplanAuthorization;
      expect(f.ok("scope-revision-status", f.run)).toBe("NONE");
      expect(f.state().scopeReplanAuthorization).toEqual(authority);
      expect(f.state().checkpoints.implement.status).toBe("blocked");
      f.ok("pause", f.run); f.put(f.run, "resume.txt", "resume");
      expect(f.ok("resume-file", join(f.run, "resume.txt"), String(process.pid))).toBe(f.run);
      expect(f.ok("scope-revision-status", f.run)).toBe("NONE");
      expect(f.state().scopeReplanAuthorization).toEqual(authority);
      expect(f.state().scopeRevisionCount).toBe(1);
      expect(f.state().checkpoints.repair.status).toBe("needs_replan"); // retained history, not a new request
      // A later genuinely new stop must still migrate; old history is not a
      // blanket exemption for this phase or run.
      f.ok("begin", f.run, "repair");
      const newer = replacement + ' Additional exact boundary, not yet authorized.';
      f.report("repair", "needs_replan", newer); f.ok("pause", f.run);
      f.ok("resume-file", join(f.run, "resume.txt"), String(process.pid));
      expect(f.state().pendingScopeReplan.exactRequest).toBe(newer);
      expect(f.state().replanRequired).toBe(true);
      expect(f.state().scopeReplanAuthorization).toBeUndefined();
    } finally { f.cleanup(); }
  });

  it("admits the retained-0518 legacy shape from its immutable BLOCKED snapshot, not a completed plan", () => {
    const f = fixture("plan", true);
    try {
      expect(f.state().checkpoints.plan.checkoutIdentityDigest).toBeUndefined();
      expect(f.state().checkpoints.plan.status).toBe("blocked");
      f.put(f.run, "resume.txt", "resume");
      f.ok("resume-file", join(f.run, "resume.txt"), String(process.pid));
      expect(f.state().checkpoints.plan.status).toBe("blocked");
      f.beginRevision(); f.propose();
      expect(f.state().pendingScopeReplan.exactRequest).toBe(replacement);
      expect(f.state().decisions[0]).toMatchObject({ outcome: "BLOCKED", authority: null });
      expect(f.state().scopeReplanAuthorization).toBeUndefined();
    } finally { f.cleanup(); }
  });

  it("does not let later confirmation of the original withholding choice hide the legacy rejected scope", () => {
    const f = fixture("plan", true, true);
    try {
      const rejectedStop = f.state().lastTransition;
      writeFileSync(f.ownerContext + ".answer.txt", "User selected: 2. Approve recommended scoped decision");
      f.ok("decision-answer", f.run, f.ownerContext);
      expect(f.state().lastTransition).toEqual(rejectedStop);
      expect(f.state().lastAuthorizationTransition).toMatchObject({ kind: "decision", status: "CONTINUE", revision: f.state().revision, contextPath: f.ownerContext });
      expect(f.state().lastAuthorizationTransition.sequence).toBeGreaterThan(rejectedStop.sequence);
      expect(f.state().decisions.at(-1)).toMatchObject({ source: "human", outcome: "CONTINUE" });
      f.beginRevision(); f.propose();
      expect(f.state().pendingScopeReplan.exactRequest).toBe(replacement);
      expect(f.state().scopeReplanAuthorization).toBeUndefined();
      expect(f.state().decisions.some((item: { outcome: string; authority: unknown }) => item.outcome === "BLOCKED" && item.authority === null)).toBe(true);
      expect(f.call("begin", f.run, "implement").stderr).toContain("exact scope authorization");
    } finally { f.cleanup(); }
  });

  it.each(["request", "plan", "checkpoint", "review", "source", "index", "witness", "decision", "source-control", "owner-control", "head"]) ("refuses stale %s before report-only admission", what => {
    const f = fixture();
    try {
      if (what === "request") f.put(f.run, "decision-request.md", oldRequest + " drift");
      if (what === "plan") f.put(f.run, "plan.md", "drift");
      if (what === "checkpoint") {
        const saved = f.state(); saved.checkpoints.plan.attempt += 1;
        writeFileSync(join(f.run, "state.json"), JSON.stringify(saved));
      }
      if (what === "review") f.put(f.run, "evidence-review.md", "drift");
      if (what === "source" || what === "index") {
        f.put(f.root, "src/value.js", "drift\n");
        if (what === "index") {
          spawnSync("git", ["add", "src/value.js"], { cwd: f.root });
          f.put(f.root, "src/value.js", "original\n");
        }
      }
      if (what === "witness") f.put(f.run, "witnesses.json", "{}");
      if (what === "source-control" || what === "owner-control") f.put(what === "source-control" ? f.root : f.cwd, stageControl, "drift");
      if (what === "head") spawnSync("git", ["commit", "--allow-empty", "-m", "foreign commit"], { cwd: f.root });
      if (what === "decision") writeFileSync(f.state().decisions[0].path, "{}");
      const r = f.call("begin", f.run, "scope-revision");
      expect(r.status).toBe(1);
      expect(r.stderr).not.toContain("Unknown phase");
      expect(f.state().scopeRevisionCount).toBeUndefined();
    } finally { f.cleanup(); }
  });

  it.each(["source", "index", "plan", "checkpoint", "spec-authority", "review", "witness", "source-control", "owner-control", "head", "request-unchanged"])("rejects %s mutation during proposal without granting authority", what => {
    const f = fixture();
    try {
      f.beginRevision();
      if (what === "source" || what === "index") {
        f.put(f.root, "src/value.js", "drift\n");
        if (what === "index") { spawnSync("git", ["add", "src/value.js"], { cwd: f.root }); f.put(f.root, "src/value.js", "original\n"); }
      } else if (what === "source-control" || what === "owner-control") f.put(what === "source-control" ? f.root : f.cwd, stageControl, "drift");
      else if (what === "head") spawnSync("git", ["commit", "--allow-empty", "-m", "foreign commit"], { cwd: f.root });
      else if (what === "checkpoint" || what === "spec-authority") {
        const saved = f.state();
        if (what === "checkpoint") saved.checkpoints.plan.attempt += 1;
        else saved.specApproved = true;
        writeFileSync(join(f.run, "state.json"), JSON.stringify(saved));
      }
      else if (what !== "request-unchanged") f.put(f.run, what === "plan" ? "plan.md" : what === "review" ? "evidence-review.md" : "witnesses.json", "drift");
      f.put(f.run, "scope-revision.md", "Candidate addresses all findings.");
      f.put(f.run, "stage-scope-revision-result.txt", "pass\nCandidate complete");
      f.put(f.run, "decision-request.md", what === "request-unchanged" ? oldRequest : replacement);
      const r = f.call("record", f.run, "scope-revision");
      expect(r.status).toBe(1);
      expect(f.state().pendingScopeReplan.exactRequest).toBe(oldRequest);
      expect(f.state().scopeReplanAuthorization).toBeUndefined();
    } finally { f.cleanup(); }
  });

  it("preserves candidate lineage across repeated genuine rejection and stops at the durable bound", () => {
    const f = fixture();
    try {
      const originals = f.state().decisions;
      for (let cycle = 1; cycle <= 3; cycle++) {
        f.beginRevision();
        f.propose(replacement + " Revision " + cycle);
        const request = f.state().pendingScopeReplan.exactRequest;
        f.ok("begin", f.run, "plan"); f.report("plan", "blocked", request);
        const context = f.ok("decision-start", f.run, "plan"); f.verdict(context); f.ok("decision-record", f.run, context);
      }
      expect(f.call("begin", f.run, "scope-revision").stderr).toContain("Scope revision limit exhausted");
      expect(f.state().decisions.slice(0, 1)).toEqual(originals);
      expect(f.state().decisions.every((d: { outcome: string; authority: unknown }) => d.outcome === "BLOCKED" && d.authority === null)).toBe(true);
      expect(f.state().scopeReplanAuthorization).toBeUndefined();
      expect(f.state().planArchives.filter((a: { reason: string }) => a.reason === "scope-revision-candidate")).toHaveLength(3);
    } finally { f.cleanup(); }
  });

  it("fences a candidate result after cancellation until a new counted attempt begins", () => {
    const f = fixture();
    try {
      f.beginRevision(); f.ok("pause", f.run);
      f.put(f.run, "scope-revision.md", "Candidate report");
      f.put(f.run, "decision-request.md", replacement);
      f.put(f.run, "stage-scope-revision-result.txt", "pass\nCandidate report complete");
      expect(f.call("record", f.run, "scope-revision").stderr).toContain("cancelled/fenced");
      expect(f.state().pendingScopeReplan.exactRequest).toBe(oldRequest);
      expect(f.state().scopeRevisionCount).toBe(1);
      f.beginRevision(); f.propose();
      expect(f.state().scopeRevisionCount).toBe(2);
    } finally { f.cleanup(); }
  });

  it("bounds cancelled attempts across resume and preserves rejected histories", () => {
    const f = fixture();
    try {
      for (let i = 1; i <= 3; i++) {
        f.beginRevision();
        expect(f.state().scopeRevisionCount).toBe(i);
        f.ok("pause", f.run);
        f.put(f.run, "resume.txt", "resume");
        f.ok("resume-file", join(f.run, "resume.txt"), String(process.pid));
        f.ok("pause", f.run);
      }
      const r = f.call("begin", f.run, "scope-revision");
      expect(r.status).toBe(1); expect(r.stderr).toContain("Scope revision limit exhausted");
      expect(f.state().pendingScopeReplan.exactRequest).toBe(oldRequest);
      expect(f.state().decisions[0].outcome).toBe("BLOCKED");
      expect(f.state().planArchives.filter((a: { reason: string }) => a.reason === "rejected-scope-revision")).toHaveLength(3);
    } finally { f.cleanup(); }
  });

  it("stamps failed evidence/fix reviews and gates rather than retaining an older stage stop", () => {
    const f = fixture("evidence");
    try {
      const previous = f.state().lastTransition.sequence;
      f.ok("review-record", f.run, "evidence");
      expect(f.state().lastTransition).toMatchObject({ kind: "review", phase: "evidence", status: "blocked", revision: f.state().revision });
      f.ok("snapshot", f.run);
      f.put(f.run, "fix-review.md", "MUST FIX: retained independent finding.");
      f.put(f.run, "fix-review-result.json", JSON.stringify({ ok: false, findings: "MUST FIX: retained independent finding." }));
      f.ok("review-record", f.run, "fix");
      expect(f.state().lastTransition).toMatchObject({ kind: "review", phase: "fix", status: "blocked", revision: f.state().revision });
      expect(f.call("gate", f.run, "initial").stderr).toContain("Witness failed after fix");
      const stop = f.state().lastTransition;
      expect(stop).toMatchObject({ kind: "gate", phase: "initial", status: "blocked", revision: f.state().revision, reportPath: join(f.run, "green-1-0.json") });
      expect(stop.sequence).toBe(previous + 3);
      f.ok("pause", f.run); expect(f.state().lastTransition).toEqual(stop);
    } finally { f.cleanup(); }
  });

  it("stamps actual persisted revisions and does not replace a substantive stop on pause/resume", () => {
    const f = fixture();
    try {
      const stopped = f.state().lastTransition;
      expect(stopped).toMatchObject({ kind: "decision", phase: "plan", status: "BLOCKED", revision: f.state().revision, generation: f.state().generation });
      expect(stopped.sequence).toBeGreaterThan(0);
      f.ok("pause", f.run); expect(f.state().lastTransition).toEqual(stopped);
      f.put(f.run, "resume.txt", "resume"); f.ok("resume-file", join(f.run, "resume.txt"), String(process.pid));
      expect(f.state().lastTransition).toEqual(stopped);
      f.beginRevision(); f.propose();
      expect(f.state().lastTransition).toMatchObject({ kind: "scope-revision", phase: "scope-revision", status: "pass", revision: f.state().revision, generation: f.state().generation });
      expect(f.state().lastTransition.sequence).toBeGreaterThan(stopped.sequence);
    } finally { f.cleanup(); }
  });
});
