// Offline CLI control-plane tests. Every Git write and command is confined to a
// disposable repository; no provider, implementation worker, commit or push is
// requested against the real checkout.
import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseThetaDocument } from "../src/parser/theta-document";
import { parseDeps } from "./helpers/e2e-s1";

const helper = join(process.cwd(), "tools/bugfix/run.mjs");
const specSelection = "User selected: 2. Approve proposed spec changes";
const scopedSelection = "User selected: 2. Approve recommended scoped decision";
const proposal = "docs/spec_topics/value.md: preserve the existing value=2 runtime contract; correct only the contradictory value=1 prose.";
const request = "Authorize tests/value.test.js case legacy-value only: expected 1 -> 2, following docs/owner-decisions.md#value. Preserve known/unknown controls and original witnesses.json/red-0.json. No production/spec changes.";
function call(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [helper, ...args], { cwd, encoding: "utf8" });
}
function git(cwd: string, ...args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim();
}
function fixture(phase = "implement", scoped = true, planScoped = false) {
  const cwd = mkdtempSync(join(tmpdir(), "bugfix-decisions-"));
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), text);
  };
  git(cwd, "init", "-b", "main");
  git(cwd, "config", "user.email", "test@example.invalid");
  git(cwd, "config", "user.name", "Test");
  put(".gitignore", ".pi/tmp/\n");
  put("AGENTS.md", "Preserve existing semantics and independent review; never waive green gates or erase original reds.\n");
  put("docs/bugs/0001-example.md", "# Example\n- **Status:** open\n");
  put("docs/owner-decisions.md", "# Value\nOwner ruling: value=2 is the existing contract; correct the exact legacy-value oracle only, retaining controls and original red proof.\n");
  put("docs/spec_topics/value.md", "The established runtime value is 2.\n");
  put("src/value.js", "export const value = 1;\n");
  put("tests/value.test.js", "// legacy-value expects 1; known/unknown controls remain\n");
  git(cwd, "add", "."); git(cwd, "commit", "-m", "decision fixture");
  const started = call(cwd, "init", "1");
  expect(started.status, started.stderr).toBe(0);
  const run = started.stdout.trim();
  const putRun = (path: string, text: string) => writeFileSync(join(run, path), text);
  const state = () => JSON.parse(readFileSync(join(run, "state.json"), "utf8"));
  const ok = (...args: string[]) => {
    const result = call(cwd, ...args);
    expect(result.status, result.stderr + result.stdout).toBe(0);
    return result.stdout.trim();
  };
  // Capture an actual correct-reason red before any delegated authorization.
  putRun("witnesses.json", JSON.stringify({
    e2e: [{ argv: [process.execPath, "-e", "if(!require('fs').readFileSync('src/value.js','utf8').includes('value = 2')){console.error('AssertionError: original expected two');process.exit(1)}"], failure_pattern: "AssertionError: original expected two" }],
    unit: [], unit_omission_reason: "No smaller boundary in this control-plane fixture", live_required: false, live: [],
  }));
  ok("red", run);
  ok("begin", run, phase);
  putRun(phase + ".md", "Exact evidence and bounded proposal; original red remains retained.\n");
  if (phase === "plan") putRun("spec-proposal.md", proposal);
  if (scoped && (phase !== "plan" || planScoped)) putRun("decision-request.md", request);
  putRun("stage-" + phase + "-result.txt", (phase === "plan" && !planScoped ? "needs_spec" : scoped ? "needs_decision" : "blocked") + "\nExact pending decision");
  ok("record", run, phase);
  const clean = "CLEAN — independent evidence/plan review; no gate waiver.\n";
  putRun("evidence-review.md", clean);
  if (phase === "plan" && !planScoped) {
    ok("snapshot", run);
    putRun("evidence-review-result.json", JSON.stringify({ ok: true, findings: clean }));
    ok("evidence-review-record", run);
  }
  const start = () => ok("decision-start", run, phase);
  const verdict = (context: string, patch: Record<string, unknown> = {}) => {
    const value = {
      disposition: "continue", clear_preference: true, has_tradeoff: false, evidence_sufficient: true,
      summary: "Existing owner ruling establishes the bounded correction.",
      recommendation: "Authorize only the exact snapshotted proposal/request.",
      rationale: "The contradictory baseline is inferior to the established contract; preserve all controls, original red and independent gates.",
      basis: ["docs/owner-decisions.md#value", "docs/spec_topics/value.md:1", run + "/red-0.json"],
      alternatives: ["Correct only the exact contradictory legacy expectation.", "Keep the contradictory baseline; inferior under the existing owner ruling."],
      ...patch,
    };
    writeFileSync(context + ".verdict.json", JSON.stringify(value));
    return value;
  };
  const record = (context: string) => call(cwd, "decision-record", run, context);
  const answer = (context: string, text: string) => {
    writeFileSync(context + ".answer.txt", text);
    return call(cwd, "decision-answer", run, context);
  };
  const human = (context: string) => verdict(context, {
    disposition: "human", clear_preference: false, has_tradeoff: true,
    summary: "Two materially valid compatibility/security policies remain.",
  });
  return { cwd, run, phase, put, putRun, state, ok, start, verdict, record, answer, human,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

describe("autonomous bug-fix decision control plane", () => {
  it("ships a parseable read-only Astra decision worker", () => {
    const path = join(".pi", "theta", "workers", "bugfix-decide.theta");
    const source = readFileSync(path, "utf8");
    const doc = parseThetaDocument({ path, bytes: new Uint8Array(Buffer.from(source)) }, parseDeps());
    expect(doc.diagnostics).toEqual([]);
    expect(source).toMatch(/^model: "openai\/gpt-6-astra"$/m);
    expect(source).toMatch(/^tools: read, bash, grep$/m);
  });

  it("allocates unique immutable decision contexts, not one shared request file", () => {
    const f = fixture();
    try {
      const a = f.start(); const bytes = readFileSync(a); const b = f.start();
      expect(a).not.toBe(b);
      expect(a).toMatch(/\/decision-[0-9a-f-]+\/context\.json$/);
      expect(dirname(a)).not.toBe(dirname(b));
      expect(readFileSync(a)).toEqual(bytes);
      expect(JSON.stringify(JSON.parse(bytes.toString()))).toContain(request);
      expect(f.state().specApproved).not.toBe(true);
    } finally { f.cleanup(); }
  });

  it("automatically approves only the exact saved PLAN specification proposal", () => {
    const f = fixture("plan");
    try {
      const context = f.start(); f.verdict(context);
      const result = f.record(context);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe("CONTINUE");
      expect(f.state()).toMatchObject({ specApproved: true, approvedProposal: proposal });
      const saved = JSON.parse(readFileSync(f.state().decisions.at(-1).path, "utf8"));
      expect(saved).toMatchObject({ outcome: "CONTINUE", phase: "plan", source: "astra", authority: { exactRequest: proposal, gitAuthority: false } });
      expect(existsSync(join(f.run, "spec-answer.txt"))).toBe(false);
      expect(f.ok("approved", f.run)).toBe("PASS");
      f.putRun("spec-proposal.md", proposal + " Also change unrelated behavior.");
      expect(call(f.cwd, "approved", f.run).status).not.toBe(0);
    } finally { f.cleanup(); }
  });

  it("keeps PLAN scoped decisions distinct from specification approvals and does not require an earlier review", () => {
    const f = fixture("plan", true, true);
    try {
      rmSync(join(f.run, "evidence-review.md"));
      const context = f.start(); f.verdict(context);
      expect(f.ok("decision-kind", f.run, context)).toBe("SCOPED");
      expect(f.record(context).stdout.trim()).toBe("CONTINUE");
      expect(f.state().specApproved).not.toBe(true);
      expect(f.state().decisions.at(-1).authority).toMatchObject({ type: "exact-scoped-request", exactRequest: request });
    } finally { f.cleanup(); }
  });

  it.each(["absent", "failed", "stale-plan"])("does not authorize specification scope from an %s evidence-review binding", reason => {
    const f = fixture("plan");
    try {
      if (reason === "absent") rmSync(join(f.run, "evidence-review-result.json"));
      if (reason === "failed") {
        f.putRun("evidence-review.md", "MUST FIX — unsupported plan");
        f.putRun("evidence-review-result.json", JSON.stringify({ ok: false, findings: "MUST FIX — unsupported plan" }));
      }
      if (reason === "stale-plan") {
        f.ok("begin", f.run, "plan");
        f.putRun("plan.md", "A changed plan has not received a clean evidence review.");
        f.putRun("spec-proposal.md", proposal);
        f.putRun("stage-plan-result.txt", "needs_spec\nChanged plan needs review");
        f.ok("record", f.run, "plan");
      }
      const context = f.start(); f.verdict(context);
      expect(f.record(context).status).not.toBe(0);
      expect(f.state().specApproved).not.toBe(true);
    } finally { f.cleanup(); }
  });

  it("records exact test authority without editing tests/specs, shipping or waiving gates", () => {
    const f = fixture();
    try {
      const head = git(f.cwd, "rev-parse", "HEAD");
      const manifest = readFileSync(join(f.run, "witnesses.json"));
      const red = readFileSync(join(f.run, "red-0.json"));
      const tests = readFileSync(join(f.cwd, "tests/value.test.js"));
      const context = f.start(); f.verdict(context);
      expect(f.record(context).stdout.trim()).toBe("CONTINUE");
      const authority = readFileSync(join(f.run, "decision-authorizations.md"), "utf8");
      expect(authority).toContain(request);
      expect(authority).toContain("established contract");
      expect(f.state().specApproved).not.toBe(true);
      expect(f.state().verifiedDigest).toBeUndefined();
      expect(f.state().stages).toEqual(["red"]);
      expect(f.ok("cached", f.run, "implement")).toBe("RUN");
      expect(readFileSync(join(f.run, "witnesses.json"))).toEqual(manifest);
      expect(readFileSync(join(f.run, "red-0.json"))).toEqual(red);
      expect(readFileSync(join(f.cwd, "tests/value.test.js"))).toEqual(tests);
      expect(git(f.cwd, "status", "--porcelain")).toBe("");
      expect(git(f.cwd, "rev-parse", "HEAD")).toBe(head);
      expect(existsSync(join(f.run, "shipment.json"))).toBe(false);
      // Standing ship permission is not a decision dialog, nor a gate waiver.
      expect(call(f.cwd, "ship", f.run).stderr).toContain("Missing final verification");
      const gate = call(f.cwd, "gate", f.run, "final");
      expect(gate.status).not.toBe(0);
      expect(gate.stderr).toContain("Witness failed after fix");
      expect(f.state().verifiedDigest).toBeUndefined();
      expect(f.state().stages).not.toContain("gate-final");
      expect(readFileSync(join(f.run, "red-0.json"))).toEqual(red);
      f.put("docs/spec_topics/value.md", "Unauthorized normative change\n");
      expect(call(f.cwd, "snapshot", f.run).status).not.toBe(0);
    } finally { f.cleanup(); }
  });

  it("ordinary blocked-stage continuation does not create unspecified edit authority", () => {
    const f = fixture("implement", false);
    try {
      const context = f.start(); f.verdict(context);
      expect(f.record(context).stdout.trim()).toBe("CONTINUE");
      expect(f.state().specApproved).not.toBe(true);
      expect(f.state().verifiedDigest).toBeUndefined();
      expect(f.ok("cached", f.run, "implement")).toBe("RUN");
      if (existsSync(join(f.run, "decision-authorizations.md"))) {
        expect(readFileSync(join(f.run, "decision-authorizations.md"), "utf8")).not.toContain(request);
      }
    } finally { f.cleanup(); }
  });

  it.each(["plan", "implement"])("HUMAN grants no %s authority before the exact owner selection", phase => {
    const f = fixture(phase);
    try {
      const context = f.start(); f.human(context);
      const result = f.record(context);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe("HUMAN");
      expect(f.state().specApproved).not.toBe(true);
      expect(f.state().decisions.at(-1).authority).toBeNull();
      expect(readFileSync(join(f.run, "decision-authorizations.md"), "utf8")).toContain("No approval or expanded scope granted.");
      const selection = phase === "plan" ? specSelection : scopedSelection;
      for (const text of ["User cancelled the selection", "Error: UI not available", "User selected: 1. Stop", "User wrote: " + selection, "approve", selection + " and all future changes"]) {
        expect(f.answer(context, text).status, text).not.toBe(0);
        expect(f.state().specApproved).not.toBe(true);
        expect(f.state().decisions.at(-1).authority).toBeNull();
      }
      const answered = f.answer(context, selection);
      expect(answered.status, answered.stderr).toBe(0);
      if (phase === "plan") {
        expect(f.state()).toMatchObject({ specApproved: true, approvedProposal: proposal });
      } else {
        expect(readFileSync(join(f.run, "decision-authorizations.md"), "utf8")).toContain(request);
        expect(f.state().specApproved).not.toBe(true);
      }
      expect(f.state().verifiedDigest).toBeUndefined();
    } finally { f.cleanup(); }
  });

  it.each(["unrecorded", "continue", "blocked"])("rejects owner-answer authority for a %s decision instead of a recorded HUMAN", disposition => {
    const f = fixture("plan");
    try {
      const context = f.start();
      if (disposition !== "unrecorded") {
        f.verdict(context, disposition === "blocked" ? { disposition: "blocked", clear_preference: false, evidence_sufficient: false } : {});
        expect(f.record(context).status).toBe(0);
      }
      expect(f.answer(context, specSelection).status).not.toBe(0);
      if (disposition !== "continue") expect(f.state().specApproved).not.toBe(true);
    } finally { f.cleanup(); }
  });

  it("persists BLOCKED as no authority and retains the original witness manifest/red", () => {
    const f = fixture("plan");
    try {
      const files = ["witnesses.json", "red-0.json"];
      const original = files.map(path => readFileSync(join(f.run, path)));
      const context = f.start(); f.verdict(context, { disposition: "blocked", clear_preference: false, evidence_sufficient: false });
      const result = f.record(context);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe("BLOCKED");
      expect(f.state().specApproved).not.toBe(true);
      expect(f.state().decisions.at(-1).authority).toBeNull();
      expect(readFileSync(join(f.run, "decision-authorizations.md"), "utf8")).toContain("No approval or expanded scope granted.");
      files.forEach((path, i) => expect(readFileSync(join(f.run, path))).toEqual(original[i]));
    } finally { f.cleanup(); }
  });

  it.each([
    ["unknown disposition", { disposition: "approve" }],
    ["continue with tradeoff", { has_tradeoff: true }],
    ["continue without preference", { clear_preference: false }],
    ["continue without evidence", { evidence_sufficient: false }],
    ["human with preference", { disposition: "human", clear_preference: true, has_tradeoff: true }],
    ["human without tradeoff", { disposition: "human", clear_preference: false, has_tradeoff: false }],
    ["string boolean", { evidence_sufficient: "true" }],
    ["blank summary", { summary: " " }],
    ["blank recommendation", { recommendation: "" }],
    ["blank rationale", { rationale: "\n" }],
    ["no cited basis", { basis: [] }],
    ["non-string basis", { basis: [17] }],
    ["unexpected permission field", { ship: true }],
    ["duplicate alternatives", { alternatives: ["Same choice", "Same choice"] }],
    ["one alternative", { alternatives: ["Only one"] }],
    ["blank alternative", { alternatives: ["One", " "] }],
  ] as const)("rejects malformed/inconsistent verdict: %s", (_name, patch) => {
    const f = fixture("plan");
    try {
      const context = f.start(); f.verdict(context, patch);
      expect(f.record(context).status).not.toBe(0);
      expect(f.state().specApproved).not.toBe(true);
      expect(existsSync(join(f.run, "decision-authorizations.md"))).toBe(false);
    } finally { f.cleanup(); }
  });

  it("rejects replay of a recorded decision and of an answered HUMAN", () => {
    const f = fixture();
    try {
      const context = f.start(); f.human(context);
      expect(f.record(context).stdout.trim()).toBe("HUMAN");
      expect(f.record(context).status).not.toBe(0);
      expect(f.answer(context, scopedSelection).status).toBe(0);
      const records = JSON.stringify(f.state().decisions);
      expect(f.answer(context, scopedSelection).status).not.toBe(0);
      expect(f.record(context).status).not.toBe(0);
      expect(JSON.stringify(f.state().decisions)).toBe(records);
    } finally { f.cleanup(); }
  });

  it("rejects invalid JSON and a missing required verdict field", () => {
    const f = fixture("plan");
    try {
      const context = f.start();
      writeFileSync(context + ".verdict.json", "{broken");
      expect(f.record(context).status).not.toBe(0);
      const value: Partial<ReturnType<typeof f.verdict>> = f.verdict(context);
      delete value.rationale;
      writeFileSync(context + ".verdict.json", JSON.stringify(value));
      expect(f.record(context).status).not.toBe(0);
      expect(f.state().specApproved).not.toBe(true);
    } finally { f.cleanup(); }
  });

  it("explicitly archives and invalidates a rejected cached plan before a routine authorized revision", () => {
    const f = fixture("plan");
    try {
      const oldPlan = readFileSync(join(f.run, "plan.md"));
      const findings = "MUST FIX — correct the plan's mistaken fixture assumption; source/test changes remain prohibited.";
      f.putRun("evidence-review.md", findings);
      f.putRun("evidence-review-result.json", JSON.stringify({ ok: false, findings }));
      const context = f.ok("decision-start", f.run, "evidence");
      const decision = f.verdict(context);
      expect(f.record(context).stdout.trim()).toBe("CONTINUE");
      const feedback = join(f.run, "evidence-replan-feedback.md");
      writeFileSync(feedback, findings + "\n" + decision.recommendation);
      f.ok("replan", f.run, feedback);
      expect(f.ok("cached", f.run, "plan")).toBe("RUN");
      expect(f.state().replanRequired).toBe(true);
      expect(f.state().replanFeedback).toBeDefined();
      const archive = f.state().planArchives.at(-1).path;
      expect(readFileSync(join(archive, "plan.md"))).toEqual(oldPlan);
      expect(f.state().evidenceReviewBinding).toBeUndefined();
    } finally { f.cleanup(); }
  });

  it.each(["resume", "begin", "cached", "gate", "ship"])("validates accepted decision evidence before %s can reuse authority", operation => {
    const f = fixture();
    try {
      const context = f.start(); f.verdict(context);
      expect(f.record(context).stdout.trim()).toBe("CONTINUE");
      writeFileSync(join(dirname(f.state().decisions.at(-1).path), "authority.json"), "{}\n");
      const args = operation === "resume"
        ? ["resume-file", join(f.run, "resume.txt"), String(process.pid)]
        : [operation, f.run, ...(operation === "begin" || operation === "cached" ? ["implement"] : operation === "gate" ? ["final"] : [])];
      if (operation === "resume") f.putRun("resume.txt", "resume");
      const result = call(f.cwd, ...args);
      expect(result.status, result.stdout + result.stderr).not.toBe(0);
      expect(result.stderr).toMatch(/decision|authority/i);
      expect(existsSync(join(f.run, "shipment.json"))).toBe(false);
    } finally { f.cleanup(); }
  });

  it("rejects tampering with the rendered worker-facing authority view even without another decision request", () => {
    const f = fixture();
    try {
      const context = f.start(); f.verdict(context);
      expect(f.record(context).stdout.trim()).toBe("CONTINUE");
      f.putRun("decision-authorizations.md", "Invented permission for every test change.");
      expect(call(f.cwd, "begin", f.run, "implement").status).not.toBe(0);
    } finally { f.cleanup(); }
  });

  it.each(["request", "checkout", "context", "generation", "precedent", "owner-record", "owner-addendum", "plan-addendum", "proposal", "red", "manifest"])("rejects stale %s before recording authority", reason => {
    const f = fixture(reason === "proposal" ? "plan" : "implement");
    try {
      const context = f.start(); f.verdict(context);
      if (reason === "request") f.putRun("decision-request.md", request + " Additional case.");
      if (reason === "checkout") f.put("src/value.js", "export const value = 3;\n");
      if (reason === "context") writeFileSync(context, readFileSync(context, "utf8") + " ");
      if (reason === "precedent") f.putRun("decision-authorizations.md", "A later owner restriction: do not edit the baseline.\n");
      if (reason === "owner-record") f.putRun("owner-decision.md", "New owner ruling: do not change this baseline.\n");
      if (reason === "owner-addendum") f.putRun("owner-further-decision.md", "A further exact owner restriction applies.\n");
      if (reason === "plan-addendum") f.putRun("plan-legacy-scope-addendum.md", "The authorized group excludes this assertion.\n");
      if (reason === "proposal") f.putRun("spec-proposal.md", "Different normative scope");
      if (reason === "red") f.putRun("red-0.json", "{}");
      if (reason === "manifest") f.putRun("witnesses.json", "{}");
      if (reason === "generation") {
        f.putRun("resume-request.txt", "resume");
        f.ok("resume-file", join(f.run, "resume-request.txt"), String(process.pid));
      }
      expect(f.record(context).status, reason).not.toBe(0);
      expect(f.state().specApproved).not.toBe(true);
      if (reason !== "precedent") expect(existsSync(join(f.run, "decision-authorizations.md"))).toBe(false);
    } finally { f.cleanup(); }
  });

  it.each(["request", "checkout", "generation", "context", "precedent", "owner-record"])("rejects stale %s even after HUMAN and exact owner selection", reason => {
    const f = fixture();
    try {
      const context = f.start(); f.human(context);
      expect(f.record(context).stdout.trim()).toBe("HUMAN");
      if (reason === "request") f.putRun("decision-request.md", request + " Expanded scope.");
      if (reason === "checkout") f.put("tests/value.test.js", "changed after owner presentation\n");
      if (reason === "context") writeFileSync(context, readFileSync(context, "utf8") + "\n");
      if (reason === "precedent") f.putRun("decision-authorizations.md", "New owner refusal.\n");
      if (reason === "owner-record") f.putRun("owner-decision.md", "New owner ruling: do not change this baseline.\n");
      if (reason === "generation") {
        f.putRun("resume-request.txt", "resume");
        f.ok("resume-file", join(f.run, "resume-request.txt"), String(process.pid));
      }
      expect(f.answer(context, scopedSelection).status).not.toBe(0);
      expect(f.state().specApproved).not.toBe(true);
    } finally { f.cleanup(); }
  });
});
