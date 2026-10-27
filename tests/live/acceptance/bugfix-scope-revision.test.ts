// One real production Sol worker; all controller/Git state lives in a disposable
// repository. The prompt-mode caller only persists the actual typed return.
import { describe, expect, it } from "vitest";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { failLoudly, parseSystemNoteCodes, spawnPiPrint } from "./harness";
import { parseThetaDocument } from "../../../src/parser/theta-document";
import { parseDeps } from "../../helpers/e2e-s1";

const project = process.cwd();
const helper = join(project, "tools/bugfix/run.mjs");
const workerPath = join(project, '.pi', 'theta', 'workers', 'bugfix-stage.theta');
const oldRequest = "Repair only src/diagnostics.cjs parallelResult() and tests/diagnostics.test.cjs parallel-result case: withhold unavailable imported-member type spelling from the parallel Result diagnostic. No condition, addition, ordering or unknown-method scope. Preserve original witnesses and controls; no implementation before exact authorization.";
const review = "MUST FIX — independent fixture evidence review rejects the parallel-only request. src/diagnostics.cjs condition(), addition(), ordering(), unknownMethod() still expose <imported-unavailable-member> (four omitted paths); tests/diagnostics.test.cjs names each case. Cover all five diagnostic paths explicitly while preserving outer-kind refusal, <binder-unknown>, local enum/schema precision, unmarked-unknown refusal and conservative subagent controls. Owner withholding is binding, not load-time materialisation or global marker erasure. Candidate reports only; no production/test/spec changes or approval.";

async function requireSol() {
  const registry = new ModelRegistry(await ModelRuntime.create());
  await registry.refresh();
  if (!registry.getAvailable().some(model => model.provider === "openai" && model.id === "gpt-6.1-sol")) {
    failLoudly("scope-revision live precondition unmet: credentialed openai/gpt-6.1-sol is required for the exact production worker; no substitute or silent skip.");
  }
}
function put(base: string, path: string, text: string) {
  mkdirSync(dirname(join(base, path)), { recursive: true });
  writeFileSync(join(base, path), text);
}
function json(path: string) { return JSON.parse(readFileSync(path, "utf8")); }
function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(result.status, result.stderr + result.stdout).toBe(0);
  return result.stdout.trim();
}

function fixture(logs: string) {
  const cwd = mkdtempSync(join(tmpdir(), "theta-scope-revision-live-"));
  const call = (...args: string[]) => {
    const result = spawnSync(process.execPath, [helper, ...args], { cwd, encoding: "utf8", timeout: 15000 });
    appendFileSync(join(logs, "controller.jsonl"), JSON.stringify({ args, status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.message }) + "\n");
    return result;
  };
  const ok = (...args: string[]) => {
    const result = call(...args);
    expect(result.error, result.stderr + result.stdout).toBeUndefined();
    expect(result.status, result.stderr + result.stdout).toBe(0);
    return result.stdout.trim();
  };
  put(cwd, ".gitignore", ".pi/tmp/\n/.trees/\n");
  put(cwd, "AGENTS.md", "# Bounded diagnostic project\nRead docs/spec_topics/diagnostics.md and docs/owner-decisions.md. The current stage is reports only: no implementation, tracked test/spec edits, staging, commits, network or shipment. A scope candidate is not approval. Preserve all original red evidence and independent findings. No package installation is necessary for this dependency-free fixture.\n");
  put(cwd, "docs/owner-decisions.md", "# Binding withholding choice\nThe owner has chosen to WITHHOLD unavailable imported-member type information at static diagnostic boundaries. Do not materialise types at load time and do not erase markers globally. This chooses a strategy only; it does not approve the rejected parallel-only scope or authorize edits. Historical binder marker <binder-unknown> must remain visible in binder diagnostics.\n");
  put(cwd, "docs/spec_topics/diagnostics.md", "# Diagnostic contract\nAn unavailable imported member has no statically available member type. Withhold its spelling at every diagnostic rendering boundary: parallel Result, boolean condition, numeric addition, ordering comparison and unknown-method receiver. Retain the outer-kind refusal (including Result/boolean/number/orderable requirements) and the unknown-method name. This is not permission to admit invalid operations. Preserve <binder-unknown> for binder diagnostics, precise local enum and schema names, rejection of unmarked unknown values and conservative subagent callable rules. Scope-revision writes reports and a candidate only; source, tests and this contract stay untouched.\n");
  put(cwd, "src/diagnostics.cjs", [
    "const imported = '<imported-unavailable-member>';",
    "exports.parallelResult = () => 'parallel requires Result, got ' + imported;",
    "exports.condition = () => 'condition requires boolean, got ' + imported;",
    "exports.addition = () => 'addition requires number, got ' + imported;",
    "exports.ordering = () => 'ordering requires orderable operands, got ' + imported;",
    "exports.unknownMethod = () => 'unknown method missing on ' + imported;",
    "exports.binder = () => 'binder type <binder-unknown>';",
    "exports.localEnum = () => 'enum Color';",
    "exports.localSchema = () => 'schema User';",
    "exports.unknown = () => 'refuse unmarked unknown';",
    "exports.subagent = () => 'refuse unsafe subagent callable';", "",
  ].join("\n"));
  put(cwd, "tests/diagnostics.test.cjs", [
    "const assert = require('node:assert/strict');",
    "const d = require('../src/diagnostics.cjs');",
    "// Existing acceptance cases, currently red; each remains independently required.",
    "for (const name of ['parallelResult', 'condition', 'addition', 'ordering', 'unknownMethod']) {",
    "  assert.ok(!d[name]().includes('<imported-unavailable-member>'), name + ': imported type must be withheld');",
    "}",
    "assert.match(d.parallelResult(), /requires Result/);",
    "assert.match(d.condition(), /requires boolean/);",
    "assert.match(d.addition(), /requires number/);",
    "assert.match(d.ordering(), /requires orderable/);",
    "assert.match(d.unknownMethod(), /unknown method missing/);",
    "assert.match(d.binder(), /<binder-unknown>/);",
    "assert.equal(d.localEnum(), 'enum Color'); assert.equal(d.localSchema(), 'schema User');",
    "assert.match(d.unknown(), /refuse/); assert.match(d.subagent(), /refuse/);", "",
  ].join("\n"));
  put(cwd, "docs/bugs/0001-marker-rendering.md", "# Unavailable imported member type leaks into diagnostics\n- **Status:** open\n\nAll five functions parallelResult/condition/addition/ordering/unknownMethod in src/diagnostics.cjs expose <imported-unavailable-member>. The owner selected withholding (docs/owner-decisions.md). tests/diagnostics.test.cjs has the five failing cases and preserved controls. The rejected exact request covered only parallel Result and is incomplete. Revise scope reports only; do not fix source, change tests/spec, authorize implementation or ship.\n");
  const theta = join(cwd, ".pi/theta");
  mkdirSync(join(theta, "workers"), { recursive: true });
  copyFileSync(workerPath, join(theta, "workers/bugfix-stage.theta"));
  // No replacement verdict or extra provider query: these bytes come directly
  // from the real BugStage return. A single string parameter bypasses binder.
  put(theta, "scope-probe.theta", [
    "---", "mode: prompt", 'model: "openai/gpt-6.1-sol"', "tools:", "  - ./workers/bugfix-stage.theta", "  - write", "params:", "  run_dir: string", "---",
    'fn json_text(value: string): string {',
    '  "\\\"" + value.replace("\\\\", "\\\\\\\\").replace("\\\"", "\\\\\\\"")',
    '    .replace("\\n", "\\\\n").replace("\\r", "\\\\r").replace("\\t", "\\\\t") + "\\\""',
    '}',
    'let actual = bugfix_stage(run_dir, "scope-revision", "Read the immutable scopeRevision archive and its independent four-omission findings. Produce a complete report-only candidate covering every named diagnostic path and protected control; owner withholding is binding. Do not implement or approve. This tiny dependency-free fixture already has authentic red evidence and complete source/contract inputs. No additional verification runs or recursive inventory/hashing are needed. Keep both candidate and report compact, approximately 500 words each, using a table for exact files/cases, proposed diagnostics and controls. Cite the existing evidence and lineage; return the actual typed outcome promptly after writing both reports.")?',
    'write({ path: run_dir + "/scope-worker.actual.json", content: "{\\\"status\\\":" + json_text(actual.status) + ",\\\"summary\\\":" + json_text(actual.summary) + "}" })?',
    'write({ path: run_dir + "/stage-scope-revision-result.txt", content: actual.status + "\\n" + actual.summary })?',
    '"Actual scope-revision result persisted; no implementation authority"', "",
  ].join("\n"));
  for (const path of [join(theta, "scope-probe.theta"), join(theta, "workers/bugfix-stage.theta")]) {
    expect(parseThetaDocument({ path, bytes: new Uint8Array(readFileSync(path)) }, parseDeps()).diagnostics, path).toEqual([]);
  }
  git(cwd, "init", "-b", "main"); git(cwd, "config", "user.email", "test@example.invalid"); git(cwd, "config", "user.name", "Test");
  git(cwd, "add", "."); git(cwd, "commit", "-m", "bounded report-only live fixture");
  const run = ok("init", "1");
  const state = () => json(join(run, "state.json"));
  const worktree = state().root as string;
  const report = (phase: string, status: string, request?: string) => {
    put(run, phase + ".md", phase === "plan" ? "Rejected plan: repair only src/diagnostics.cjs parallelResult and its parallel test. This is incomplete; no edits authorized.\n" : "Repair requires a fresh exact scope; no source or test changes were made.\n");
    if (phase === "plan") put(run, "spec-proposal.md", "No normative change; follow the existing withholding contract.\n");
    if (request) put(run, "decision-request.md", request);
    put(run, "stage-" + phase + "-result.txt", status + "\nReport-only fixture checkpoint");
    ok("record", run, phase);
  };
  put(run, "witnesses.json", JSON.stringify({ e2e: [{ argv: [process.execPath, "tests/diagnostics.test.cjs"], failure_pattern: "parallelResult: imported type must be withheld" }], unit: [], unit_omission_reason: "Five tiny exported diagnostic boundaries and controls are directly exercised by the original assertion script.", live_required: false, live: [] }));
  ok("red", run);
  ok("begin", run, "plan"); report("plan", "pass");
  ok("begin", run, "repair"); report("repair", "needs_replan", oldRequest);
  ok("stage-replan", run, "repair");
  ok("begin", run, "plan"); report("plan", "blocked", oldRequest);
  ok("snapshot", run);
  put(run, "evidence-review.md", review);
  put(run, "evidence-review-result.json", JSON.stringify({ ok: false, findings: review }));
  // Explicit fake independent rejection is fixture setup, not the live worker's
  // return and never an approval. All immutable decision records are authentic.
  const context = ok("decision-start", run, "plan");
  writeFileSync(context + ".verdict.json", JSON.stringify({ disposition: "blocked", clear_preference: false, has_tradeoff: false, evidence_sufficient: false, summary: "Parallel-only scope omits four known render paths.", recommendation: "Revise the exact candidate in reports only.", rationale: review, basis: ["Existing withholding contract", "Five concrete source renderings"], alternatives: ["Complete bounded withholding request", "Retain rejected request and remain blocked"] }));
  expect(ok("decision-record", run, context)).toBe("BLOCKED");
  return { cwd, run, state, worktree, theta: join(worktree, ".pi/theta"), call, ok };
}

describe("live report-only rejected-scope supersession", () => {
  it("uses the real Sol stage worker, rejects checkout drift, and records only an unapproved complete candidate", async () => {
    await requireSol();
    const worker = readFileSync(workerPath, "utf8");
    expect(worker).toMatch(/^model: "openai\/gpt-6\.1-sol"$/m);
    const logRoot = join(project, ".pi/tmp/log");
    mkdirSync(logRoot, { recursive: true });
    const logs = mkdtempSync(join(logRoot, "scope-revision-live-"));
    console.log("Scope revision acceptance retained logs:", logs);
    const f = fixture(logs);
    const session = join(f.worktree, ".pi/tmp/scope-probe-session.jsonl");
    try {
      expect(readFileSync(join(f.theta, "workers/bugfix-stage.theta"), "utf8")).toBe(worker);
      const head = git(f.worktree, "rev-parse", "HEAD");
      const index = git(f.worktree, "ls-files", "--stage");
      const branch = git(f.worktree, "branch", "--show-current");
      const source = readFileSync(join(f.worktree, "src/diagnostics.cjs"));
      const history = f.state().decisions;
      const decisions = history.map((item: { path: string }) => [item.path, readFileSync(item.path)] as const);
      const protectedPaths = ["witnesses.json", "red-0.json", "plan.md", "spec-proposal.md", "stage-plan-result.txt", "evidence-review.md", "evidence-review-result.json"];
      const originals = protectedPaths.map(path => readFileSync(join(f.run, path)));
      expect(f.ok("scope-revision-status", f.run)).toBe("REQUIRED");
      f.ok("begin", f.run, "scope-revision");
      const rejected = f.state().scopeRevision;
      expect(readFileSync(join(rejected.archive, "decision-request.md"), "utf8")).toBe(oldRequest);
      expect(f.call("begin", f.run, "implement").stderr).toMatch(/report-only scope revision/i);
      for (const path of ["scope-worker.actual.json", "stage-scope-revision-result.txt", "scope-revision.md"]) {
        expect(existsSync(join(f.run, path)), "No stale output may satisfy the live observable: " + path).toBe(false);
      }
      // Real CLI, explicit current extension/child pins, authenticated parent PID
      // and inherited worker control-plane scrub all come from this harness.
      const result = await spawnPiPrint({
        cwd: f.worktree, thetaDir: f.theta, extraThetaDirs: [join(f.theta, "workers")],
        slashInvocation: "/scope-probe " + f.run,
        extraArgs: ["--mode", "json", "--session", session], abortAfterMs: 330000,
      });
      writeFileSync(join(logs, "host.stdout.jsonl"), result.stdout);
      writeFileSync(join(logs, "host.stderr.txt"), result.stderr);
      writeFileSync(join(logs, "host-result.json"), JSON.stringify(result));
      const diagnostic = "Retained logs: " + logs + "\n" + result.stderr + "\n" + result.stdout;
      expect(result.exitCode, diagnostic).toBe(0);
      expect(result.stderr, diagnostic).toBe("");
      expect(parseSystemNoteCodes(diagnostic), diagnostic).toEqual([]);
      expect(result.stdout, diagnostic).not.toContain("theta-system-note");
      expect(result.stdout, diagnostic).not.toContain("theta_result");
      if (existsSync(session)) expect(readFileSync(session, "utf8"), diagnostic).not.toMatch(/"customType"\s*:\s*"theta-system-note"/);
      expect(existsSync(join(f.run, "scope-worker.actual.json")), diagnostic).toBe(true);
      const actual = json(join(f.run, "scope-worker.actual.json"));
      expect(actual.status, JSON.stringify(actual)).toBe("pass");
      expect(typeof actual.summary).toBe("string");
      expect(actual.summary.trim().length).toBeGreaterThan(0);
      expect(readFileSync(join(f.run, "stage-scope-revision-result.txt"), "utf8")).toBe(actual.status + "\n" + actual.summary);
      const candidate = readFileSync(join(f.run, "decision-request.md"), "utf8");
      const report = readFileSync(join(f.run, "scope-revision.md"), "utf8");
      expect(candidate).not.toBe(oldRequest);
      // Semantic coverage, not a model verbatim-echo demand. Every known path,
      // concrete edit surface and protected control must appear in the request.
      for (const pattern of [/src\/diagnostics\.cjs/, /tests\/diagnostics\.test\.cjs/, /parallel.*Result|parallelResult/is, /condition/i, /addition/i, /ordering/i, /unknown.?method/i, /withhold/i, /outer.kind|requires Result/i, /binder/i, /local.*enum|enum.*local/is, /schema/i, /unmarked.*unknown|unknown.*unmarked/is, /subagent/i, /alternative/i, /risk/i]) {
        expect(candidate, "Incomplete actual scope candidate: " + pattern + "\n" + candidate).toMatch(pattern);
      }
      expect(report + "\n" + candidate).toContain(rejected.requestDigest);
      // A run-relative immutable archive citation is just as exact as its
      // absolute form; do not demand a particular model prose/path rendering.
      expect([rejected.archive, relative(f.run, rejected.archive)].some(path => (report + "\n" + candidate).includes(path)), "Actual candidate/report must cite the exact superseded archive").toBe(true);
      expect(report.trim().length).toBeGreaterThan(100);
      const unchanged = () => {
        expect(readFileSync(join(f.worktree, "src/diagnostics.cjs"))).toEqual(source);
        expect(git(f.worktree, "status", "--porcelain")).toBe("");
        expect(git(f.cwd, "status", "--porcelain")).toBe("");
        expect(git(f.worktree, "rev-parse", "HEAD")).toBe(head);
        expect(git(f.cwd, "rev-parse", "HEAD")).toBe(head);
        expect(git(f.worktree, "branch", "--show-current")).toBe(branch);
        expect(git(f.worktree, "ls-files", "--stage")).toBe(index);
        protectedPaths.forEach((path, index) => expect(readFileSync(join(f.run, path)), path).toEqual(originals[index]));
        expect(f.state().decisions).toEqual(history);
        for (const [path, bytes] of decisions) expect(readFileSync(path)).toEqual(bytes);
        expect(f.state().scopeReplanAuthorization).toBeUndefined();
        expect(f.state().specApproved).not.toBe(true);
        expect(existsSync(join(f.run, "shipment.json"))).toBe(false);
      };
      unchanged();
      // Red direction with the SAME actual candidate: no second provider spend.
      // The controller must reject a protected source mutation atomically, then
      // accept those unchanged actual reports once the exact bytes are restored.
      const stateBefore = readFileSync(join(f.run, "state.json"));
      try {
        writeFileSync(join(f.worktree, "src/diagnostics.cjs"), Buffer.concat([source, Buffer.from("// forbidden drift\n")]));
        const refused = f.call("record", f.run, "scope-revision");
        expect(refused.status, refused.stderr + refused.stdout).toBe(1);
        expect(refused.stderr).toContain("Report-only scope revision checkout/index changed");
        expect(readFileSync(join(f.run, "state.json"))).toEqual(stateBefore);
        expect(f.state().pendingScopeReplan.exactRequest).toBe(oldRequest);
        appendFileSync(join(logs, "assertion-directions.txt"), "RED: real controller refused protected checkout drift with the actual live candidate; state unchanged.\n");
      } finally { writeFileSync(join(f.worktree, "src/diagnostics.cjs"), source); }
      unchanged();
      expect(f.ok("record", f.run, "scope-revision")).toBe("PASS");
      const saved = f.state();
      expect(saved.scopeRevision.status).toBe("pass");
      expect(saved.pendingScopeReplan).toMatchObject({ exactRequest: candidate, supersedes: rejected.archive });
      expect(saved.replanRequired).toBe(true);
      expect(saved.checkpoints.plan).toBeUndefined();
      expect(saved.evidenceReviewBinding).toBeUndefined();
      expect(saved.planArchives.filter((item: { reason: string }) => item.reason === "rejected-scope-revision")).toHaveLength(1);
      expect(saved.planArchives.filter((item: { reason: string }) => item.reason === "scope-revision-candidate")).toHaveLength(1);
      const archive = saved.pendingScopeReplan.archive;
      expect(readFileSync(join(archive, "decision-request.md"), "utf8")).toBe(candidate);
      expect(json(join(archive, "lineage.json"))).toEqual({ supersedes: rejected.archive, requestDigest: saved.pendingScopeReplan.requestDigest });
      expect(f.call("evidence-review-record", f.run).stderr).toMatch(/completed, current plan checkpoint/);
      for (const phase of ["implement", "repair"]) {
        const refused = f.call("begin", f.run, phase);
        expect(refused.status).toBe(1);
        expect(refused.stderr).toContain("fresh plan/evidence review and exact scope authorization");
      }
      expect(f.ok("scope-status", f.run)).toBe("REQUIRED");
      unchanged();
      appendFileSync(join(logs, "assertion-directions.txt"), "GREEN: same actual candidate accepted after byte restoration; lineage archived, old rejection retained, fresh PLAN/review/exact scope authority still required. No implementation or approval.\n");
    } finally {
      // Capture all evidence BEFORE deleting only this test's disposable repo.
      if (existsSync(session)) copyFileSync(session, join(logs, "session.jsonl"));
      const children = session.replace(/\.jsonl$/, "");
      if (existsSync(children)) cpSync(children, join(logs, "child-sessions"), { recursive: true });
      if (existsSync(f.run)) cpSync(f.run, join(logs, "run"), { recursive: true });
      rmSync(f.cwd, { recursive: true, force: true });
    }
  }, 420000);
});
