// Real CLI + workflow + real subagent processes, with deterministic workers:
// no provider requests and no changes to the real checkout/run evidence.
import { describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { topLevelThetaHostEnv } from "./helpers/top-level-theta-env";
import { parseThetaDocument } from "../src/parser/theta-document";
import { parseDeps } from "./helpers/e2e-s1";

const root = process.cwd();
const cli = process.env.PI_THETA_TEST_PI_CLI ?? join(root, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
type Scenario = "environment" | "implementation" | "not-reproduced" | "gate" | "worker-error" | "reviewer-error" | "resume" | "replan-refusal";
const verdicts = {
  environment: {
    status: "blocked", summary: "Test SDK cannot use stored OAuth.",
    environment: "Yes — test SDK authentication is unavailable.",
    bug_validity: "Unknown — reproduction was blocked before the assertion.",
    fixability: "Unknown — implementation has not been attempted.",
    progress: "No fix applied; diagnosis, review and shipment have not run.",
    next_action: "Configure supported test SDK authentication.",
    recommendation: "Repair authentication and rerun reproduction; do not close the bug.",
  },
  implementation: {
    status: "blocked", summary: "Typecheck rejects Map arguments in two test helpers; one witness is frozen.",
    environment: "No — test-fixture typing errors, not infrastructure.",
    bug_validity: "Confirmed — pre-fix assertion failures reproduce the collector defect.",
    fixability: "Yes — collector fix applied locally; fixture correction needs approval.",
    progress: "Tests/lint pass; typecheck fails. No independent fix review, closure or shipment.",
    next_action: "Approve only the two TypeEnv constructor arguments changing from new Map() to {}.",
    recommendation: "Approve the fixture-only correction, preserve assertions/red evidence, then reverify and review.",
  },
  "not-reproduced": {
    status: "not_reproduced", summary: "The reported assertion does not fail on current HEAD.",
    environment: "No — the witness ran successfully.",
    bug_validity: "Not reproduced — this does not establish that the bug is invalid.",
    fixability: "Unknown — no current failing case was established.",
    progress: "No production fix applied; no closure or shipment.",
    next_action: "Provide the failing input or confirm whether a prior change fixed it.",
    recommendation: "Keep the report open until its disposition is supported by evidence.",
  },
};
function worker(scenario: Scenario) {
  const schema = readFileSync(join(root, ".pi", "theta", "workers", "bugfix-stage.theta"), "utf8")
    .match(/schema BugStage \{[^}]+\}/)?.[0];
  if (!schema) throw new Error("Missing production stage schema");
  const asTheta = (value: Record<string, string>) => "BugStage { " + Object.entries(value)
    .map(([key, text]) => `${key}: ${JSON.stringify(text)}`).join(", ") + " }";
  const witness = scenario === "resume" || scenario === "replan-refusal"
    ? "if(!require('fs').existsSync('src/fixed.txt')){console.error('AssertionError: fixture expected 2 got 1');process.exit(1)}"
    : "console.error('AssertionError: fixture expected 2 got 1');process.exit(1)";
  const manifest = JSON.stringify({
    e2e: [{ argv: ["node", "-e", witness], failure_pattern: "AssertionError: fixture expected 2 got 1" }],
    unit: [], unit_omission_reason: "Reporting fixture only", live_required: false, live: [],
  });
  const pass = { ...verdicts.implementation, status: "pass", summary: "Fixture stage passed." };
  const revision = { ...verdicts.implementation, status: "needs_spec", summary: "A revised specification ruling is needed.", progress: "Partial implementation retained; waiting for exact proposal approval." };
  return [
    "---", "mode: subagent", "tools: read, write", "params:", "  run_dir: string", "  phase: string", "  feedback: string", "---", schema,
    'write({ path: run_dir + "/" + phase + ".md", content: "Deterministic reporting fixture: " + phase })?',
    'if phase == "plan" { write({ path: run_dir + "/spec-proposal.md", content: "No spec change needed." })? }',
    ...(scenario === "worker-error" ? ['let missing = read({ path: "missing-worker-input.txt" })?'] : []),
    ...(scenario === "implementation" || scenario === "gate" || scenario === "reviewer-error" || scenario === "resume" || scenario === "replan-refusal" ? [
      'if phase == "reproduce" {',
      `  write({ path: run_dir + "/witnesses.json", content: ${JSON.stringify(manifest)} })?`,
      "}",
      ...(scenario === "implementation" ? ['if phase == "implement" { return ' + asTheta(verdicts.implementation) + " }"] : []),
      ...(scenario === "replan-refusal" ? [
        'if phase == "plan" {',
        '  let ready = match read({ path: run_dir + "/resume-allow.txt" }) { Ok(text) => text, Err(_) => "no" }',
        '  if ready == "yes" {',
        '    write({ path: run_dir + "/spec-proposal.md", content: "New exact contract" })?',
        '    return ' + asTheta(revision),
        '  }',
        '}',
        'if phase == "implement" {',
        '  write({ path: "src/fixed.txt", content: "partial fix" })?',
        '  write({ path: run_dir + "/spec-revision-proposal.md", content: "New exact contract" })?',
        '  return ' + asTheta(revision),
        '}',
      ] : []),
      ...(scenario === "resume" ? [
        'if phase == "implement" {',
        '  write({ path: "src/fixed.txt", content: "partial fix" })?',
        '  let allowed = match read({ path: run_dir + "/resume-allow.txt" }) { Ok(text) => text, Err(_) => "no" }',
        '  if allowed != "yes" { return ' + asTheta(verdicts.implementation) + ' }',
        '}',
      ] : []),
      asTheta(pass),
    ] : [asTheta(scenario === "not-reproduced" ? verdicts["not-reproduced"] : verdicts.environment)]), "",
  ].join("\n");
}
function probe(args: string, options: { workflow?: string; scenario?: Scenario } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), options.scenario === "resume" ? "bugfix-report-'quoted-" : "bugfix-report-"));
  const theta = join(cwd, ".pi/theta");
  const agent = join(cwd, "agent");
  mkdirSync(join(theta, "workers"), { recursive: true });
  mkdirSync(join(cwd, "tools/bugfix"), { recursive: true });
  mkdirSync(join(cwd, "docs/bugs"), { recursive: true });
  mkdirSync(agent);
  mkdirSync(join(cwd, ".pi/tmp"));
  writeFileSync(join(cwd, "question.mjs"), 'export default function(pi) { pi.registerTool({ name: "question", label: "Question", description: "Deterministic decision fixture", parameters: {type:"object", properties:{}}, async execute() { '
    + (options.scenario === "replan-refusal" ? 'return { content: [{type:"text",text:"User selected: 1. Stop without spec changes"}] };' : 'throw new Error("Unexpected approval request");')
    + ' } }); }\n');
  writeFileSync(join(agent, "auth.json"), JSON.stringify({ openai: { type: "api_key", key: "pi-theta-no-network" } }));
  writeFileSync(join(agent, "settings.json"), JSON.stringify({ defaultProvider: "openai", defaultModel: "gpt-5.5", defaultProjectTrust: "always", theta: { binderModel: "openai/gpt-5.5" } }));
  writeFileSync(join(cwd, ".gitignore"), "agent/\n.pi/tmp/\n");
  writeFileSync(join(cwd, "docs/bugs/0001-example.md"), "# Example\n- **Status:** open\n");
  if (options.scenario === "resume" || options.scenario === "replan-refusal") {
    mkdirSync(join(cwd, "src"));
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"' } }));
  }
  let workflow = options.workflow ?? readFileSync(join(root, ".pi", "theta", "fix-bug.theta"), "utf8");
  if (options.scenario === "replan-refusal") {
    // The decision/refusal is the observable, not the model's explanation turn.
    const presentation = /let presentation = @`[\s\S]*?`\?/g;
    expect(workflow.match(presentation)).toHaveLength(1);
    workflow = workflow.replace(presentation, 'let presentation = "Deterministic spec decision fixture"');
  }
  writeFileSync(join(theta, "fix-bug.theta"), workflow);
  copyFileSync(join(root, "tools/bugfix/run.mjs"), join(cwd, "tools/bugfix/run.mjs"));
  writeFileSync(join(theta, "workers/bugfix-stage.theta"), worker(options.scenario ?? "environment"));
  writeFileSync(join(theta, "workers/bugfix-review.theta"), '---\nmode: subagent\ntools: read\nparams:\n  run_dir: string\n  focus: string\n---\nschema Review { ok: boolean, findings: string }\n'
    + (options.scenario === "reviewer-error" ? 'let missing = read({ path: "missing-reviewer-input.txt" })?\n' : "")
    + 'Review { ok: true, findings: "CLEAN — reporting fixture" }\n');
  try {
    // A refused slash command can fall back to a natural-language provider turn.
    // Catch syntax regressions before spawning, rather than reaching fake auth.
    for (const path of [join(theta, "fix-bug.theta"), join(theta, "workers/bugfix-stage.theta"), join(theta, "workers/bugfix-review.theta")]) {
      const doc = parseThetaDocument({ path, bytes: new Uint8Array(readFileSync(path)) }, parseDeps());
      expect(doc.diagnostics, path).toEqual([]);
    }
    for (const command of [["init", "-b", "main"], ["config", "user.email", "test@example.invalid"], ["config", "user.name", "Test"], ["add", "."], ["commit", "-m", "fixture"]]) {
      const r = spawnSync("git", command, { cwd, encoding: "utf8" });
      expect(r.status, r.stderr).toBe(0);
    }
    const launch = (request: string) => spawnSync(process.execPath, [cli, "-ne", "-e", join(cwd, "question.mjs"), "-e", join(root, "extensions"), "--theta", theta, "--theta", join(theta, "workers"), "--session", join(cwd, ".pi/tmp/session.jsonl"), "-p", "/fix-bug" + (request ? " " + request : "")], {
      cwd, encoding: "utf8", timeout: 90000,
      env: topLevelThetaHostEnv(process.env, join(root, "extensions"), process.pid, {
        PI_OFFLINE: "1", PI_CODING_AGENT_DIR: agent,
      }),
    });
    let result = launch(args);
    let firstStop = "";
    let resumedState = "";
    let redPreserved = false;
    let leaseReleased = false;
    let partialWorkPreserved = false;
    if (options.scenario === "resume" || options.scenario === "replan-refusal") {
      expect(result.status, result.stderr + result.stdout).toBe(0);
      expect(result.stdout).toContain(options.scenario === "resume" ? "Typecheck rejects Map" : "A revised specification ruling is needed.");
      firstStop = result.stdout;
      const run = JSON.parse(readFileSync(join(cwd, ".pi/tmp/fix-bug.lock/owner.json"), "utf8")).run as string;
      const red = readFileSync(join(run, "red-0.json"));
      expect(existsSync(join(run, "active")), "normal stop must pause the active marker").toBe(false);
      writeFileSync(join(run, "resume-allow.txt"), "yes");
      result = launch("resume");
      resumedState = readFileSync(join(run, "state.json"), "utf8");
      redPreserved = red.equals(readFileSync(join(run, "red-0.json")));
      leaseReleased = !existsSync(join(cwd, ".pi/tmp/fix-bug.lock"));
      partialWorkPreserved = readFileSync(join(cwd, "src/fixed.txt"), "utf8") === "partial fix";
    }
    return { ...result, firstStop, resumedState, redPreserved, leaseReleased, partialWorkPreserved };
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
function cleanHost(result: ReturnType<typeof probe>) {
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr + "\n" + result.stdout).toBe(0);
  expect(result.stderr).toBe("");
}
function card(text: string, stage: string) {
  expect(text).toContain("STOP — Bug 0001\nStopped at:     " + stage);
  for (const label of ["Reason:", "Environment:", "Bug valid:", "Fixable:", "Progress:", "You need to:", "Recommendation:", "Artifacts:"]) {
    expect(text.split("\n").filter(line => line.startsWith(label)), label).toHaveLength(1);
  }
  expect(text).toContain("/.pi/tmp/fix-bug-");
}

describe("fix-bug completion reporting through the real host", () => {
  it("distinguishes an environment-blocked reproduction from an invalid or unfixable bug", () => {
    const result = probe("1");
    cleanHost(result);
    expect(result.stdout).toContain("Bug 0001: reproduction started. Artifacts:");
    card(result.stdout, "Reproduction");
    for (const [field, value] of Object.entries(verdicts.environment)) {
      if (field !== "status") expect(result.stdout).toContain(value);
    }
  }, 120000);

  it("reports the 0512-shaped implementation stop with a specific approval and recommendation", () => {
    const result = probe("1", { scenario: "implementation" });
    cleanHost(result);
    card(result.stdout, "Implementation / worker verification (before independent fix review)");
    for (const [field, value] of Object.entries(verdicts.implementation)) {
      if (field !== "status") expect(result.stdout).toContain(value);
    }
  }, 120000);

  it("does not turn not_reproduced into a claim that the bug is invalid", () => {
    const result = probe("1", { scenario: "not-reproduced" });
    cleanHost(result);
    card(result.stdout, "Reproduction");
    expect(result.stdout).toContain(verdicts["not-reproduced"].bug_validity);
    expect(result.stdout).toContain(verdicts["not-reproduced"].recommendation);
  }, 120000);

  it("reports the known stage even when the worker returns Err instead of a verdict", () => {
    const result = probe("1", { scenario: "worker-error" });
    cleanHost(result);
    card(result.stdout, "Reproduction");
    expect(result.stdout).toContain("worker execution failed; no stage verdict was returned");
    expect(result.stdout).toContain("missing-worker-input.txt");
    expect(result.stdout).toContain("partial edits may exist");
  }, 120000);

  it("stops at the named review stage on reviewer Err instead of starting a code repair", () => {
    const result = probe("1", { scenario: "reviewer-error" });
    cleanHost(result);
    card(result.stdout, "Evidence/plan review — worker execution");
    expect(result.stdout).toContain("missing-reviewer-input.txt");
    expect(result.stdout).toContain("Resolve the reviewer failure before implementation");
    expect(result.stdout).not.toContain("Typecheck rejects Map");
  }, 120000);

  it("also formats a mechanical gate failure without inventing an environment diagnosis", () => {
    const result = probe("1", { scenario: "gate" });
    cleanHost(result);
    card(result.stdout, "Initial verification (before independent fix review)");
    expect(result.stdout).toContain("Unknown — this checkpoint does not classify the cause.");
    expect(result.stdout).toContain("gate-*-initial-*.json");
    expect(result.stdout).toContain("require green gates before review");
  }, 120000);

  it("resumes a blocked implementation in the same run through fresh gates/reviews and local handoff", () => {
    const result = probe("1 ship false review_rounds 2", { scenario: "resume" });
    cleanHost(result);
    card(result.firstStop, "Implementation / worker verification");
    expect(result.stdout).toContain("resuming recorded checkpoints");
    expect(result.stdout).toContain("VERIFIED, NOT SHIPPED");
    expect(result.stdout).not.toContain("reproduction started");
    const state = JSON.parse(result.resumedState);
    expect(state.resumeCount).toBe(1);
    expect(state.options).toEqual({ ship: false, review_rounds: 2 });
    expect(state.checkpoints.reproduce.attempt).toBe(1);
    expect(state.checkpoints.diagnose.attempt).toBe(1);
    expect(state.checkpoints.plan.attempt).toBe(1);
    expect(state.checkpoints.implement.attempt).toBe(2);
    expect(state.checkpoints.close.status).toBe("pass");
    expect(state.stages).toEqual(["red", "gate-initial", "gate-final"]);
    expect(result.redPreserved).toBe(true);
    expect(result.leaseReleased).toBe(true);
  }, 120000);

  it("retains partial work and reports revised-spec refusal honestly after implementation started", () => {
    const result = probe("1 ship false", { scenario: "replan-refusal" });
    cleanHost(result);
    card(result.stdout, "Specification approval (before continuing implementation)");
    expect(result.stdout).toContain("Earlier partial work, if any, is retained.");
    expect(result.stdout).not.toContain("implementation has not started");
    expect(result.partialWorkPreserved).toBe(true);
    expect(result.redPreserved).toBe(true);
    expect(JSON.parse(result.resumedState).checkpoints.plan.attempt).toBe(2);
    expect(result.leaseReleased).toBe(false);
  }, 120000);

  it("red-direction control: returning the stop card alone is invisible", () => {
    const source = readFileSync(join(root, ".pi", "theta", "fix-bug.theta"), "utf8");
    expect(source.match(/theta_print\(\{ text: summary \}\)\?/g)).toHaveLength(1);
    const result = probe("1", { workflow: source.replace("theta_print({ text: summary })?", "") });
    cleanHost(result);
    expect(result.stdout).toContain("reproduction started");
    expect(result.stdout).not.toContain("STOP —");
    expect(result.stdout).not.toContain(verdicts.environment.summary);
  }, 120000);

  it("reports invalid arguments before any worker is launched", () => {
    const result = probe("1 ship maybe");
    cleanHost(result);
    expect(result.stdout).toContain("Stopped at:     Argument validation (before reproduction)");
    expect(result.stdout).toContain("Environment:    No — invalid command arguments.");
    expect(result.stdout).toContain("You need to:    Use /fix-bug NUMBER");
    expect(result.stdout).not.toContain("reproduction started");
  }, 120000);

  it("explains a resume request with no paused owner instead of starting reproduction", () => {
    const result = probe("resume");
    cleanHost(result);
    expect(result.stdout).toContain("STOP — Bug (lease owner)");
    expect(result.stdout).toContain("Resume validation (before continuation)");
    expect(result.stdout).toContain("No paused run owns this checkout");
    expect(result.stdout).not.toContain("reproduction started");
  }, 120000);

  it("prints the listing exactly once", () => {
    const result = probe("");
    cleanHost(result);
    expect(result.stdout).toBe("0001 example\n");
  }, 120000);
});
