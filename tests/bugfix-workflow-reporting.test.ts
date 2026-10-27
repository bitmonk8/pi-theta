// Real CLI + workflow + real subagent processes, with deterministic workers:
// no provider requests and no changes to the real checkout/run evidence.
import { describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { topLevelThetaHostEnv } from "./helpers/top-level-theta-env";
import { parseThetaDocument } from "../src/parser/theta-document";
import { parseDeps } from "./helpers/e2e-s1";
// @ts-expect-error plain ESM controller
import { projectJobProgress } from "../tools/bugfix/batch.mjs";

const root = process.cwd();
const cli = process.env.PI_THETA_TEST_PI_CLI ?? join(root, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
type Scenario = "final-reviewer-error" | "fix-reviewer-error" | "closure-error" | "reviewer-retry" | "environment" | "implementation" | "not-reproduced" | "gate" | "worker-error" | "reviewer-error" | "resume" | "replan-refusal" | "autonomous" | "spec-auto" | "plan-scope" | "plan-repair" | "scope-loop" | "scope-supersession";
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
function worker(scenario: Scenario, rejectFirstCandidate = false) {
  const schema = readFileSync(join(root, ".pi", "theta", "workers", "bugfix-stage.theta"), "utf8")
    .match(/schema BugStage \{[^}]+\}/)?.[0];
  if (!schema) throw new Error("Missing production stage schema");
  const asTheta = (value: Record<string, string>) => "BugStage { " + Object.entries(value)
    .map(([key, text]) => `${key}: ${JSON.stringify(text)}`).join(", ") + " }";
  const invocationFixture = ["final-reviewer-error", "fix-reviewer-error", "closure-error", "reviewer-retry"].includes(scenario);
  const witness = invocationFixture || ["resume", "replan-refusal", "autonomous", "spec-auto", "plan-scope", "plan-repair", "scope-loop", "scope-supersession"].includes(scenario)
    ? "if(!require('fs').existsSync('src/fixed.txt')){console.error('AssertionError: fixture expected 2 got 1');process.exit(1)}"
    : "console.error('AssertionError: fixture expected 2 got 1');process.exit(1)";
  const manifest = JSON.stringify({
    e2e: [{ argv: ["node", "-e", witness], failure_pattern: "AssertionError: fixture expected 2 got 1" }],
    unit: [], unit_omission_reason: "Reporting fixture only", live_required: false, live: [],
  });
  const pass = { ...verdicts.implementation, status: "pass", summary: "Fixture stage passed." };
  const revision = { ...verdicts.implementation, status: "needs_spec", summary: "A revised specification ruling is needed.", progress: "Partial implementation retained; waiting for exact proposal approval." };
  return [
    "---", "mode: subagent", "tools: read, write, bash", "params:", "  run_dir: string", "  phase: string", "  feedback: string", "---", schema,
    'fn shell_path(path: string): string { "\'" + path.replace("\'", "\'\\\\\'\'") + "\'" }',
    'let checkout = bash({ command: "node -e \\"process.stdout.write(JSON.parse(require(\'fs\').readFileSync(process.argv[1],\'utf8\')).root)\\" " + shell_path(run_dir + "/state.json") })?.trim()',
    'write({ path: run_dir + "/" + phase + ".md", content: "Deterministic reporting fixture: " + phase })?',
    'if phase == "plan" { write({ path: run_dir + "/spec-proposal.md", content: "No spec change needed." })? }',
    'if phase == "plan" {',
    '  let request = bash({ command: "node -e \\"process.stdout.write(JSON.parse(require(\'fs\').readFileSync(process.argv[1],\'utf8\')).pendingScopeReplan?.exactRequest ?? \'NO_SCOPE_REQUEST\')\\" " + shell_path(run_dir + "/state.json") })?.trim()',
    '  if request != "NO_SCOPE_REQUEST" { write({ path: run_dir + "/decision-request.md", content: request })? }',
    ...(scenario === "scope-loop" ? ['  if request != "NO_SCOPE_REQUEST" { return ' + asTheta({ ...pass, status: "needs_decision" }) + ' }'] : []),
    ...(scenario === "scope-supersession" ? ['  if request != "NO_SCOPE_REQUEST" && !request.startsWith("Complete replacement:") { return ' + asTheta({ ...pass, status: "blocked", summary: "Parallel-only request omits four nonparallel diagnostic cases." }) + ' }'] : []),
    '}',
    ...(scenario === "worker-error" ? ['let missing = read({ path: "missing-worker-input.txt" })?'] : []),
    ...(invocationFixture || scenario === "implementation" || scenario === "gate" || scenario === "reviewer-error" || scenario === "resume" || scenario === "replan-refusal" || scenario === "autonomous" || scenario === "spec-auto" || scenario === "plan-scope" || scenario === "plan-repair" || scenario === "scope-loop" || scenario === "scope-supersession" ? [
      'if phase == "reproduce" {',
      `  write({ path: run_dir + "/witnesses.json", content: ${JSON.stringify(manifest)} })?`,
      "}",
      ...(invocationFixture ? ['if phase == "implement" { write({ path: checkout + "/src/fixed.txt", content: "partial fix" })? }'] : []),
      ...(scenario === "closure-error" ? ['if phase == "close" { read({ path: "missing-closure-input.txt" })? }'] : []),
      ...(scenario === "implementation" ? ['if phase == "implement" { return ' + asTheta(verdicts.implementation) + " }"] : []),
      ...(scenario === "plan-scope" ? [
        'if phase == "plan" {',
        '  let authority = match read({ path: run_dir + "/decision-authorizations.md" }) { Ok(text) => text, Err(_) => "" }',
        '  if authority == "" {',
        '    write({ path: run_dir + "/decision-request.md", content: "Exact reports-only PLAN scope: retain existing primitive semantics and correct the fixture coverage description; no normative edits." })?',
        '    return ' + asTheta({ ...pass, status: "needs_decision" }),
        '  }',
        '}',
        'if phase == "implement" { write({ path: checkout + "/src/fixed.txt", content: "partial fix" })? }',
      ] : []),
      ...(scenario === "plan-repair" ? [
        'if phase == "plan" {',
        '  let feedback = match read({ path: run_dir + "/decision-authorizations.md" }) { Ok(text) => text, Err(_) => "" }',
        '  write({ path: run_dir + "/plan.md", content: feedback == "" ? "Rejected plan: fixture description needs correction." : "Repaired plan: exact fixture description corrected after explicit archived revision." })?',
        '}',
        'if phase == "implement" { write({ path: checkout + "/src/fixed.txt", content: "partial fix" })? }',
      ] : []),
      ...(scenario === "spec-auto" ? [
        'if phase == "plan" {',
        '  write({ path: run_dir + "/spec-proposal.md", content: "Exact established contract: retain refusal, correct contradictory prose." })?',
        '  return ' + asTheta(revision),
        '}',
        'if phase == "implement" { write({ path: checkout + "/src/fixed.txt", content: "partial fix" })? }',
      ] : []),
      ...(scenario === "scope-supersession" ? [
        'if phase == "scope-revision" {',
        ...(rejectFirstCandidate ? [
          String.raw`  let attempt_number = bash({ command: "node -e \"process.stdout.write(String(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).scopeRevision.number))\" " + shell_path(run_dir + "/state.json") })?.trim()`,
          '  if attempt_number == "1" {',
          '    write({ path: run_dir + "/decision-request.md", content: "First replacement still incomplete: only parallel and condition; remaining findings require another exact candidate." })?',
          '    return ' + asTheta(pass),
          '  }',
        ] : []),
        '  write({ path: run_dir + "/decision-request.md", content: "Complete replacement: parallel Result plus condition, addition, ordering and unknown method; retain outer-kind, historical binder, local enum/schema, unmarked unknown and subagent controls. Withholding remains binding; no materialisation/global erasure." })?',
        '}',
        'if phase == "implement" {',
        '  let authority = match read({ path: run_dir + "/decision-authorizations.md" }) { Ok(text) => text, Err(_) => "" }',
        '  if authority == "" {',
        '    write({ path: run_dir + "/decision-request.md", content: "Parallel-only marker repair; original witnesses remain frozen." })?',
        '    return ' + asTheta({ ...pass, status: "needs_replan" }),
        '  }',
        '  write({ path: checkout + "/src/fixed.txt", content: "partial fix" })?',
        '}',
      ] : []),
      ...(scenario === "autonomous" || scenario === "scope-loop" ? [
        'if phase == "implement" {',
        '  write({ path: checkout + "/src/fixed.txt", content: "partial fix" })?',
        '  let authority = match read({ path: run_dir + "/decision-authorizations.md" }) { Ok(text) => text, Err(_) => "" }',
        (scenario === "scope-loop" ? '  if true {' : '  if authority == "" {'),
        '    write({ path: run_dir + "/decision-request.md", content: "Exact fixture-only scope: change tests/legacy.test.js TypeEnv constructor new Map() to {}, preserving its assertion and original red evidence." })?',
        '    return ' + asTheta({ ...verdicts.implementation, status: "needs_replan" }),
        '  }',
        '  write({ path: checkout + "/tests/legacy.test.js", content: "const env = {}; // same assertion" })?',
        '}',
      ] : []),
      ...(scenario === "replan-refusal" ? [
        'if phase == "plan" {',
        '  let ready = match read({ path: run_dir + "/spec-revision-proposal.md" }) { Ok(text) => text, Err(_) => "no" }',
        '  if ready != "no" {',
        '    write({ path: run_dir + "/spec-proposal.md", content: "New exact contract" })?',
        '    return ' + asTheta(revision),
        '  }',
        '}',
        'if phase == "implement" {',
        '  write({ path: checkout + "/src/fixed.txt", content: "partial fix" })?',
        '  let ready = match read({ path: run_dir + "/spec-revision-proposal.md" }) { Ok(text) => text, Err(_) => "no" }',
        '  if ready == "no" {',
        '    write({ path: run_dir + "/spec-revision-proposal.md", content: "New exact contract" })?',
        '    return ' + asTheta(revision),
        '  }',
        '}',
      ] : []),
      ...(scenario === "resume" ? [
        'if phase == "implement" {',
        '  write({ path: checkout + "/src/fixed.txt", content: "partial fix" })?',
        '  let allowed = match read({ path: run_dir + "/resume-allow.txt" }) { Ok(text) => text, Err(_) => "no" }',
        '  if allowed != "yes" { return ' + asTheta(verdicts.implementation) + ' }',
        '}',
      ] : []),
      asTheta(pass),
    ] : [asTheta(scenario === "not-reproduced" ? verdicts["not-reproduced"] : verdicts.environment)]), "",
  ].join("\n");
}
type RankingCase = "one" | "two" | "missing" | "duplicate" | "backwards" | "cycle" | "stale" | "empty";
function rankingWorker(kind: RankingCase) {
  const source = readFileSync(join(root, ".pi", "theta", "workers", "bugfix-rank.theta"), "utf8");
  const schemas = source.match(/schema RankItem[\s\S]*?(?=\nlet assessment:)/)?.[0];
  if (!schemas) throw new Error("Missing ranking schemas");
  const item = (id: string, severity = "medium") => `RankItem { id: "${id}", severity: "${severity}", provisional: false, reason: "A reported runtime failure needs attention." }`;
  let items = [item("0001")];
  if (["two", "cycle"].includes(kind)) items = [item("0002", "high"), item("0001", "low")];
  if (kind === "duplicate") items = [item("0001"), item("0001")];
  if (kind === "backwards") items = [item("0001", "low"), item("0002", "high")];
  const edges = kind === "cycle" ? [
    'RankEdge { before: "0001", after: "0002", reason: "First prerequisite." }',
    'RankEdge { before: "0002", after: "0001", reason: "Conflicting prerequisite." }',
  ] : kind === "two" ? ['RankEdge { before: "0001", after: "0002", reason: "Resolve the prerequisite first." }'] : [];
  return [
    "---", "mode: subagent", "tools: read, write", "params:", "  catalog_path: string", "---", schemas,
    // A test-only stand-in for an external edit during the model assessment.
    ...(kind === "stale" ? ['write({ path: "docs/bugs/0001-example.md", content: "- **Status:** fixed" })?'] : []),
    ...(kind === "empty" ? ['let missing = read({ path: "RANKER_MUST_NOT_RUN" })?'] : []),
    `BugRanking { bugs: [${items.join(", ")}], ordering: [${edges.join(", ")}], guidance: ["Severity is not fix order; inspect actual prerequisites before implementation."] }`, "",
  ].join("\n");
}
function probe(args: string, options: { workflow?: string; scenario?: Scenario; ranking?: RankingCase; decision?: "human"; rejectFirstCandidate?: boolean } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), options.scenario === "resume" ? "bugfix-report-'quoted-" : "bugfix-report-"));
  const theta = join(cwd, ".pi/theta");
  const agent = join(cwd, "agent");
  mkdirSync(join(theta, "workers"), { recursive: true });
  mkdirSync(join(cwd, "tools/bugfix"), { recursive: true });
  mkdirSync(join(cwd, "docs/bugs"), { recursive: true });
  mkdirSync(agent);
  mkdirSync(join(cwd, ".pi/tmp"));
  // Instrument a forbidden dialog rather than omitting the tool: a swallowed
  // tool error must not make a mid-run question look like successful automation.
  const questionCallsPath = join(cwd, ".pi/tmp/question-calls.jsonl");
  writeFileSync(join(cwd, "question.mjs"), 'import { appendFileSync } from "node:fs";\nexport default function(pi) { pi.registerTool({ name: "question", label: "Question", description: "Forbidden approval dialog fixture", parameters: {type:"object", properties:{}}, async execute(_id, args) { '
    + 'appendFileSync(' + JSON.stringify(questionCallsPath) + ', JSON.stringify(args) + "\\n"); throw new Error("Unexpected approval request");'
    + ' } }); }\n');
  writeFileSync(join(agent, "auth.json"), JSON.stringify({ openai: { type: "api_key", key: "pi-theta-no-network" } }));
  writeFileSync(join(agent, "settings.json"), JSON.stringify({ defaultProvider: "openai", defaultModel: "gpt-5.5", defaultProjectTrust: "always", theta: { binderModel: "openai/gpt-5.5" } }));
  writeFileSync(join(cwd, ".gitignore"), "agent/\n.pi/tmp/\n/.trees/\n");
  // Even early-stop scenarios now pass the real worktree bootstrap. No external
  // dependencies are needed; their original stage/gate assertions stay intact.
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"' } }));
  writeFileSync(join(cwd, "docs/bugs/0001-example.md"), "# Example\n- **Status:** " + (options.ranking === "empty" ? "fixed" : "open") + "\n");
  if (["two", "missing", "duplicate", "backwards", "cycle"].includes(options.ranking ?? "one")) {
    writeFileSync(join(cwd, "docs/bugs/0002-higher-impact.md"), "# More impact\n- **Status:** open\n");
  }
  if (["final-reviewer-error", "fix-reviewer-error", "closure-error", "reviewer-retry", "resume", "replan-refusal", "autonomous", "spec-auto", "plan-scope", "plan-repair", "scope-loop", "scope-supersession"].includes(options.scenario ?? "")) {
    mkdirSync(join(cwd, "src"));
    mkdirSync(join(cwd, "tests"));
    writeFileSync(join(cwd, "tests/legacy.test.js"), "const env = new Map(); // same assertion");
  }
  let workflow = options.workflow ?? readFileSync(join(root, ".pi", "theta", "fix-bug.theta"), "utf8");
  if (options.scenario === "replan-refusal") {
    // The decision/refusal is the observable, not the model's explanation turn.
    // Astra's typed reasoning is rendered directly; there is no parent-model
    // explanation turn to mock or a manual resume before the exact decision.
    expect(workflow).not.toContain("let presentation = @`");
  }
  writeFileSync(join(theta, "fix-bug.theta"), workflow);
  for (const file of ["run.mjs", "atomic-record.mjs", "worktree-env.mjs", "update-pi-config.mjs"]) {
    copyFileSync(join(root, "tools/bugfix", file), join(cwd, "tools/bugfix", file));
  }
  writeFileSync(join(theta, "workers/bugfix-stage.theta"), worker(options.scenario ?? "environment", options.rejectFirstCandidate));
  writeFileSync(join(theta, "workers/bugfix-rank.theta"), rankingWorker(options.ranking ?? "one"));
  writeFileSync(join(theta, "workers/bugfix-review.theta"), '---\nmode: subagent\ntools: read\nparams:\n  run_dir: string\n  focus: string\n---\nschema Review { ok: boolean, findings: string }\n'
    + (options.scenario === "reviewer-error" ? 'let missing = read({ path: "missing-reviewer-input.txt" })?\n' : "")
    + (["final-reviewer-error", "fix-reviewer-error", "reviewer-retry"].includes(options.scenario ?? "") ? 'if focus == "' + (options.scenario === "fix-reviewer-error" ? 'fix' : 'final') + '" {\n let allowed = match read({ path: run_dir + "/review-retry-allow.txt" }) { Ok(text) => text, Err(_) => "no" }\n if allowed != "yes" { read({ path: "missing-reviewer-return.txt" })? }\n}\n' : "")
    + (options.scenario === "plan-repair" ? 'if focus == "evidence" {\n let plan = read({ path: run_dir + "/plan.md" })?\n if !plan.startsWith("Repaired plan:") { return Review { ok: false, findings: "MUST FIX: correct the fixture description in the reports-only plan; preserve all original evidence and test assertions." } }\n}\n' : "")
    + 'Review { ok: true, findings: "CLEAN — reporting fixture" }\n');
  const decisionSchemas = readFileSync(join(root, ".pi", "theta", "workers", "bugfix-decide.theta"), "utf8")
    .match(/schema BugDecision[\s\S]*?(?=\nlet result:)/)?.[0];
  if (!decisionSchemas) throw new Error("Missing decision schema");
  const human = options.scenario === "replan-refusal" || options.decision === "human";
  const automatic = ["autonomous", "spec-auto", "plan-scope", "plan-repair", "scope-loop", "scope-supersession"].includes(options.scenario ?? "");
  writeFileSync(join(theta, "workers/bugfix-decide.theta"), [
    "---", "mode: subagent", "tools: read, bash", "params:", "  context_path: string", "---", decisionSchemas,
    'read({ path: context_path })?',
    // Like the retained closure incident, a missing decision return must not
    // replace the already recorded stage execution failure with a verdict.
    ...(options.scenario === "closure-error" ? ['read({ path: "missing-closure-decision-input.txt" })?'] : []),
    ...(options.scenario === "scope-supersession" ? [
      String.raw`fn shell_path(path: string): string { "'" + path.replace("'", "'\\''") + "'" }`,
      String.raw`let status = bash({ command: "node -e \"process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).status ?? 'none')\" " + shell_path(context_path) })?.trim()`,

      'BugDecision { disposition: status == "blocked" ? "blocked" : "continue", clear_preference: status != "blocked", has_tradeoff: false, evidence_sufficient: status != "blocked",',
    ] : [`BugDecision { disposition: "${human ? "human" : automatic ? "continue" : "blocked"}", clear_preference: ${automatic && !human}, has_tradeoff: ${human}, evidence_sufficient: true,`]),
    'summary: "Decision fixture inspected the exact context.", recommendation: "Preserve assertions and follow the recorded scope.",',
    'rationale: "Existing principles prefer fixture-only correction; unresolved contract choices remain with the owner.",',
    'basis: ["AGENTS.md: preserve assertions and original evidence"], alternatives: ["Apply the exact scoped correction.", "Retain the obsolete fixture and remain blocked."] }', "",
  ].join("\n"));
  try {
    // A refused slash command can fall back to a natural-language provider turn.
    // Catch syntax regressions before spawning, rather than reaching fake auth.
    for (const path of [join(theta, "fix-bug.theta"), join(theta, "workers/bugfix-stage.theta"), join(theta, "workers/bugfix-review.theta"), join(theta, "workers/bugfix-rank.theta"), join(theta, "workers/bugfix-decide.theta")]) {
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
    const remote = join(cwd, ".pi/tmp/origin.git");
    if (["autonomous", "spec-auto", "replan-refusal"].includes(options.scenario ?? "") || options.decision === "human") {
      expect(spawnSync("git", ["init", "--bare", "-b", "main", remote], { cwd, encoding: "utf8" }).status).toBe(0);
      expect(spawnSync("git", ["remote", "add", "origin", remote], { cwd, encoding: "utf8" }).status).toBe(0);
    }
    let result = launch(args);
    let firstStop = "";
    let resumedState = "";
    let redPreserved = false;
    let leaseReleased = false;
    let partialWorkPreserved = false;
    let firstFailedState = "";
    if (options.scenario === "reviewer-retry") {
      firstStop = result.stdout;
      const run = JSON.parse(readFileSync(join(cwd, ".pi/tmp/fix-bug.lock/owner.json"), "utf8")).run as string;
      firstFailedState = readFileSync(join(run, "state.json"), "utf8");
      const before = JSON.parse(firstFailedState);
      const proofs = before.verifiedGateFiles.map((name: string) => readFileSync(join(run, name)));
      writeFileSync(join(run, "review-retry-allow.txt"), "yes");
      result = launch("resume");
      redPreserved = proofs.every((bytes: Buffer, index: number) => bytes.equals(readFileSync(join(run, before.verifiedGateFiles[index]))));
    }
    if (options.scenario === "resume") {
      expect(result.status, result.stderr + result.stdout).toBe(0);
      expect(result.stdout).toContain("Typecheck rejects Map");
      firstStop = result.stdout;
      const run = JSON.parse(readFileSync(join(cwd, ".pi/tmp/fix-bug.lock/owner.json"), "utf8")).run as string;
      const red = readFileSync(join(run, "red-0.json"));
      expect(existsSync(join(run, "active")), "normal stop must pause the active marker").toBe(false);
      writeFileSync(join(run, "resume-allow.txt"), "yes");
      result = launch("resume");
      resumedState = readFileSync(join(run, "state.json"), "utf8");
      redPreserved = red.equals(readFileSync(join(run, "red-0.json")));
      leaseReleased = !existsSync(join(cwd, ".pi/tmp/fix-bug.lock"));
      partialWorkPreserved = readFileSync(join(JSON.parse(resumedState).root, "src/fixed.txt"), "utf8") === "partial fix";
    }
    if (options.rejectFirstCandidate) {
      expect(result.status, result.stderr + result.stdout).toBe(0);
      expect(result.stdout).not.toContain("VERIFIED, NOT SHIPPED");
      firstStop = result.stdout;
      const run = JSON.parse(readFileSync(join(cwd, ".pi/tmp/fix-bug.lock/owner.json"), "utf8")).run as string;
      const first = JSON.parse(readFileSync(join(run, "state.json"), "utf8"));
      expect(first.scopeRevisionCount).toBe(1);
      expect(first.checkpoints.plan.status).toBe("blocked");
      const red = readFileSync(join(run, "red-0.json"));
      result = launch("resume");
      resumedState = readFileSync(join(run, "state.json"), "utf8");
      redPreserved = red.equals(readFileSync(join(run, "red-0.json")));
    }
    if (options.scenario === "replan-refusal") {
      const run = JSON.parse(readFileSync(join(cwd, ".pi/tmp/fix-bug.lock/owner.json"), "utf8")).run as string;
      resumedState = readFileSync(join(run, "state.json"), "utf8");
      redPreserved = existsSync(join(run, "red-0.json"));
      partialWorkPreserved = readFileSync(join(JSON.parse(resumedState).root, "src/fixed.txt"), "utf8") === "partial fix";
    }
    const entries = existsSync(join(cwd, ".pi/tmp")) ? readdirSync(join(cwd, ".pi/tmp")) : [];
    const completedRun = entries.find(name => name.startsWith("fix-bug-0001-"));
    const completedState = completedRun ? readFileSync(join(cwd, ".pi/tmp", completedRun, "state.json"), "utf8") : "";
    const shipmentPath = completedRun ? join(cwd, ".pi/tmp", completedRun, "shipment.json") : "";
    const shipment = shipmentPath && existsSync(shipmentPath) ? JSON.parse(readFileSync(shipmentPath, "utf8")) : null;
    const pushedSha = existsSync(remote) ? spawnSync("git", ["--git-dir", remote, "rev-parse", "--verify", "refs/heads/main"], { cwd, encoding: "utf8" }).stdout.trim() : "";
    const state = completedState ? JSON.parse(completedState) : null;
    const runPath = completedRun ? join(cwd, ".pi/tmp", completedRun) : "";
    const artifact = (name: string) => runPath && existsSync(join(runPath, name)) ? readFileSync(join(runPath, name), "utf8") : "";
    const finalReview = artifact("final-review-result.json");
    const evidenceReview = artifact("evidence-review-result.json");
    const fixReview = artifact("fix-review-result.json");
    const finalGates = runPath ? readdirSync(runPath).filter(name => /^gate-\d+-final-\d+\.json$/.test(name)).map(name => JSON.parse(artifact(name))) : [];
    const mainSha = spawnSync("git", ["rev-parse", "refs/heads/main"], { cwd, encoding: "utf8" }).stdout.trim();
    const branchRetained = state ? spawnSync("git", ["show-ref", "--verify", "--quiet", "refs/heads/" + state.branch], { cwd, encoding: "utf8" }).status === 0 : false;
    const worktreeRetained = state ? existsSync(state.root) : false;
    const worktrees = spawnSync("git", ["worktree", "list", "--porcelain"], { cwd, encoding: "utf8" }).stdout;
    const questionCalls = existsSync(questionCallsPath) ? readFileSync(questionCallsPath, "utf8").trim().split("\n") : [];
    const mainFixed = existsSync(join(cwd, "src/fixed.txt"));
    const mainStatus = spawnSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }).stdout;
    const leaseRetained = existsSync(join(cwd, ".pi/tmp/fix-bug.lock"));
    const runArtifactsRetained = !!runPath && existsSync(join(runPath, "state.json")) && existsSync(join(runPath, "red-0.json"));
    return { ...result, firstStop, firstFailedState, resumedState, redPreserved, leaseReleased, partialWorkPreserved, completedState, shipment, pushedSha,
      runPath, finalReview, evidenceReview, fixReview, finalGates, mainSha, branchRetained, worktreeRetained, worktrees, questionCalls, mainFixed, mainStatus, leaseRetained, runArtifactsRetained };
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
function cleanHost(result: ReturnType<typeof probe>) {
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr + "\n" + result.stdout).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.questionCalls, "no approval dialog may be called, even if its error is swallowed").toEqual([]);
}
function pendingApproval(result: ReturnType<typeof probe>) {
  const state = JSON.parse(result.completedState);
  expect(result.stdout).toContain("VERIFIED — OWNER APPROVAL REQUIRED; NOT MERGED OR PUSHED");
  expect(result.stdout).toContain("PENDING OWNER APPROVAL — shipment blocked");
  expect(result.stdout).toContain("All reviews and gates passed. Branch and worktree retained");
  expect(result.stdout.match(/PENDING OWNER APPROVAL — shipment blocked/g)).toHaveLength(1);
  expect(result.stdout).not.toContain("STOP —");
  expect(result.stdout).not.toContain("MERGED TO MAIN AND PUSHED");
  // A printed promise is not the observable: require the independently bound
  // final review, actual green final gate records, and completed close stage.
  expect(state.checkpoints.close).toMatchObject({ status: "pass" });
  expect(state.stages).toEqual(["red", "gate-initial", "gate-final"]);
  expect(state.finalReviewDigest).toEqual(expect.any(String));
  expect(JSON.parse(result.finalReview)).toMatchObject({ ok: true, findings: "CLEAN — reporting fixture" });
  expect(result.finalGates).toHaveLength(2);
  expect(result.finalGates.every(gate => gate.code === 0)).toBe(true);
  expect(result.shipment).toBeNull();
  expect(result.pushedSha).toBe("");
  expect(result.mainSha).toBe(state.base);
  expect(result.mainFixed).toBe(false);
  expect(result.mainStatus).toBe("");
  expect(result.branchRetained).toBe(true);
  expect(result.worktreeRetained).toBe(true);
  expect(result.worktrees).toContain(state.root);
  expect(state.root).toBe(join(state.ownerRoot, ".trees", basename(result.runPath)));
  expect(result.runArtifactsRetained).toBe(true);
  expect(result.leaseRetained).toBe(true);
}
function card(text: string, stage: string) {
  expect(text).toContain("STOP — Bug 0001\nStopped at:     " + stage);
  for (const label of ["Reason:", "Environment:", "Bug valid:", "Fixable:", "Progress:", "You need to:", "Recommendation:", "Artifacts:"]) {
    expect(text.split("\n").filter(line => line.startsWith(label)), label).toHaveLength(1);
  }
  expect(text).toContain("/.pi/tmp/fix-bug-");
}

describe("fix-bug completion reporting through the real host", () => {
  it.each(["final-reviewer-error", "fix-reviewer-error", "reviewer-error"] as Scenario[])("durably reports %s without a semantic verdict or gate-success blocker", scenario => {
    const result = probe("1 ship false", { scenario });
    cleanHost(result);
    const phase = scenario === "reviewer-error" ? "evidence" : scenario === "fix-reviewer-error" ? "fix" : "final";
    const source = JSON.parse(result.completedState);
    expect(result.stdout).toContain("missing-reviewer-");
    expect(result.stdout).not.toContain("VERIFIED, NOT SHIPPED");
    expect(source.lastTransition).toMatchObject({ kind: "invocation", phase, status: "blocked", summary: expect.stringContaining("INVOCATION FAILURE") });
    expect(source.finalReviewDigest).toBeUndefined();
    expect(result.finalReview).toBe("");
    expect(phase === "evidence" ? result.evidenceReview : phase === "fix" ? result.fixReview : result.finalReview).toBe("");
    if (phase === "final") {
      expect(result.finalGates).toHaveLength(2);
      expect(result.finalGates.every(gate => gate.code === 0)).toBe(true);
      expect(source.verifiedGateDigest).toBeTruthy();
    }
    const value = projectJobProgress({ sourceRun: result.runPath, status: "blocked" }, source);
    expect(value.execution).toBe("blocked"); expect(value.verification).toBe("incomplete");
    expect(value.immediateBlocker).toContain("INVOCATION FAILURE");
    expect(value.nextAction).toContain("launch/transport");
    expect(result.leaseRetained).toBe(true); expect(result.shipment).toBeNull();
  }, 120000);

  it("records the primary reviewer failure before a failing final display tool", () => {
    const workflow = readFileSync(join(root, ".pi", "theta", "fix-bug.theta"), "utf8")
      .replace('theta_print({ text: summary })?', 'read({ path: "FINAL_DISPLAY_FAILURE" })?');
    const result = probe("1 ship false", { scenario: "final-reviewer-error", workflow });
    const source = JSON.parse(result.completedState);
    expect(source.lastTransition).toMatchObject({ kind: "invocation", phase: "final", status: "blocked", summary: expect.stringContaining("missing-reviewer-return.txt") });
    expect(source.finalReviewDigest).toBeUndefined(); expect(result.finalReview).toBe("");
    expect(result.finalGates.every(gate => gate.code === 0)).toBe(true);
    expect(result.shipment).toBeNull(); expect(result.leaseRetained).toBe(true);
  }, 120000);

  it("keeps closure worker execution failure as the durable primary stop", () => {
    const result = probe("1 ship false", { scenario: "closure-error" });
    cleanHost(result); card(result.stdout, "Closure record (before final verification)");
    const source = JSON.parse(result.completedState);
    expect(source.lastTransition).toMatchObject({ kind: "stage", phase: "close", status: "blocked", summary: expect.stringContaining("missing-closure-input.txt") });
    expect(result.finalGates).toEqual([]); expect(result.finalReview).toBe("");
    expect(projectJobProgress({ sourceRun: result.runPath, status: "blocked" }, source).immediateBlocker).toContain("missing-closure-input.txt");
  }, 120000);

  it("a successful retry obtains fresh mandatory gates/review without erasing the failed invocation", () => {
    const result = probe("1 ship false", { scenario: "reviewer-retry" });
    cleanHost(result);
    expect(result.firstStop).toContain("missing-reviewer-return.txt");
    expect(result.stdout).toContain("VERIFIED, NOT SHIPPED");
    expect(result.redPreserved).toBe(true);
    const before = JSON.parse(result.firstFailedState); const after = JSON.parse(result.completedState);
    expect(after.gateCount).toBeGreaterThan(before.gateCount);
    for (const [key, value] of Object.entries(before.reviewInvocations)) expect(after.reviewInvocations[key]).toEqual(value);
    expect(after.lastTransition).toMatchObject({ kind: "review", phase: "final", status: "pass" });
    expect(after.finalReviewDigest).toBeTruthy(); expect(result.shipment).toBeNull();
  }, 120000);

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
    const state = JSON.parse(result.completedState);
    expect(state.lastTransition).toMatchObject({ kind: "gate", phase: "initial", status: "blocked" });
    expect(state.lastTransition.revision).toBe(state.revision - 1); // pause must not overwrite the gate stop
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
    expect(state.lastTransition).toMatchObject({ kind: "review", phase: "final", status: "pass", generation: 3 });
    expect(state.lastTransition.sequence).toBeGreaterThan(state.checkpoints.implement.sequence);
  }, 120000);

  it("provisionally continues a revised-spec tradeoff after partial implementation and defers owner approval until final verification", () => {
    const result = probe("1", { scenario: "replan-refusal" });
    cleanHost(result);
    pendingApproval(result);
    expect(result.stdout).toContain("New exact contract");
    expect(result.stdout).not.toContain("implementation has not started");
    expect(result.partialWorkPreserved).toBe(true);
    expect(result.redPreserved).toBe(true);
    const state = JSON.parse(result.completedState);
    expect(state.checkpoints.plan.attempt).toBe(2);
    expect(state.checkpoints.implement).toMatchObject({ status: "pass", attempt: 2 });
    expect(state.specApproved).toBe(true);
    expect(state.approvedProposal).toBe("New exact contract");
    expect(state.decisions.at(-1)).toMatchObject({ source: "astra", outcome: "CONTINUE", authority: { type: "exact-spec-proposal", provisional: true, gitAuthority: false } });
  }, 120000);

  it("automatically authorizes a bounded test correction, retries and commits/pushes by default without a dialog", () => {
    // The fixture question tool throws on ANY call. Success therefore proves
    // neither the routine decision nor shipment interrupted for owner consent.
    const result = probe("1", { scenario: "autonomous" });
    cleanHost(result);
    expect(result.stdout).toContain("ASTRA — continuing scope");
    expect(result.stdout).toContain("MERGED TO MAIN AND PUSHED");
    const state = JSON.parse(result.completedState);
    expect(state.options.ship).toBe(true);
    expect(state.checkpoints.implement).toMatchObject({ status: "pass", attempt: 2 });
    expect(state.checkpoints.plan.attempt).toBe(2);
    expect(state.planArchives).toHaveLength(1);
    expect(state.planArchives[0].reason).toBe("stage-scope-replan");
    expect(state.decisions[0]).toMatchObject({ phase: "scope", outcome: "CONTINUE", authority: { type: "exact-scoped-request", gitAuthority: false } });
    expect(result.shipment).toMatchObject({ merged: true, pushed: true, cleaned: true, branch: state.branch, worktree: state.root });
    expect(result.pushedSha).toBe(result.shipment.sha);
    expect(result.mainSha).toBe(result.shipment.sha);
    expect(result.mainFixed).toBe(true);
    expect(result.mainStatus).toBe("");
    expect(result.branchRetained).toBe(false);
    expect(result.worktreeRetained).toBe(false);
    expect(result.worktrees).not.toContain(state.root);
    expect(result.leaseRetained).toBe(false);
    expect(result.runArtifactsRetained).toBe(true);
    expect(result.finalReview && JSON.parse(result.finalReview).ok).toBe(true);
    expect(result.stdout).not.toContain("OWNER APPROVAL REQUIRED");
    expect(result.stdout).not.toContain("STOP —");
  }, 120000);

  it("real-host rejected scope revision cannot remain a parallel-only repair or reuse BLOCKED authority", () => {
    const result = probe("1 ship false", { scenario: "scope-supersession" });
    cleanHost(result);
    expect(result.stdout).toContain("ASTRA — BLOCKED at plan");
    expect(result.stdout).toContain("VERIFIED, NOT SHIPPED");
    const state = JSON.parse(result.completedState);
    expect(state.scopeRevisionCount).toBe(1);
    expect(state.pendingScopeReplan.exactRequest).toContain("condition, addition, ordering and unknown method");
    expect(state.pendingScopeReplan.supersedes).toBe(state.scopeRevision.archive);
    expect(state.decisions.map((item: { outcome: string }) => item.outcome)).toEqual(["BLOCKED", "CONTINUE"]);
    expect(state.decisions[0].authority).toBeNull();
    expect(state.decisions[1]).toMatchObject({ phase: "scope", authority: { exactRequest: state.pendingScopeReplan.exactRequest } });
    expect(state.checkpoints.plan.attempt).toBe(3);
    expect(state.checkpoints.implement).toMatchObject({ status: "pass", attempt: 2 });
    expect(state.lastTransition).toMatchObject({ kind: "review", phase: "final", status: "pass", generation: 1 });
    expect(state.lastTransition.revision).toBeLessThan(state.revision); // pause is housekeeping, not a new source stop
    expect(result.shipment).toBeNull();
  }, 120000);

  it("runs another revision worker after a successful candidate is rejected, including across resume", () => {
    const result = probe("1 ship false", { scenario: "scope-supersession", rejectFirstCandidate: true });
    cleanHost(result);
    expect(result.stdout).toContain("VERIFIED, NOT SHIPPED");
    const state = JSON.parse(result.completedState);
    expect(state.scopeRevisionCount).toBe(2);
    expect(state.checkpoints['scope-revision'].attempt).toBe(2);
    expect(state.planArchives.filter((a: { reason: string }) => a.reason === 'scope-revision-candidate')).toHaveLength(2);
    expect(state.decisions.filter((d: { outcome: string }) => d.outcome === 'BLOCKED')).toHaveLength(2);
    expect(result.redPreserved).toBe(true);
    expect(result.shipment).toBeNull();
  }, 180000);

  it("red-direction control: disabling report-only supersession cannot claim a complete real-host repair", () => {
    const source = readFileSync(join(root, ".pi", "theta", "fix-bug.theta"), "utf8");
    const admission = 'if revision == "REQUIRED" {';
    expect(source).toContain(admission);
    const start = source.indexOf(admission);
    const end = source.indexOf('\nif revision != "NONE"', start);
    expect(end).toBeGreaterThan(start);
    const workflow = source.slice(0, start) + admission + '\n  return checkpoint_stop(bug, "Disabled scope-revision negative control", "Report-only supersession deliberately disabled.", "Restore the tested transition.", "No incomplete parallel-only repair is authorized.", run)\n}' + source.slice(end);
    const result = probe("1 ship false", { workflow, scenario: "scope-supersession" });
    cleanHost(result);
    expect(result.stdout).toContain("Report-only supersession deliberately disabled.");
    expect(result.stdout).not.toContain("VERIFIED, NOT SHIPPED");
    const state = JSON.parse(result.completedState);
    expect(state.checkpoints.plan.status).toBe("blocked");
    expect(state.decisions[0]).toMatchObject({ outcome: "BLOCKED", authority: null });
    expect(state.scopeRevisionCount).toBeUndefined();
    expect(result.finalGates).toEqual([]);
  }, 120000);

  it("bounds repeated typed non-spec replans without granting shipment or waiving fresh review", () => {
    const result = probe("1 ship false", { scenario: "scope-loop" });
    cleanHost(result);
    expect(result.stdout).toContain("Three workflow cycles did not reach verified completion.");
    const state = JSON.parse(result.completedState);
    expect(state.checkpoints.implement).toMatchObject({ status: "needs_replan", attempt: 3 });
    expect(state.planArchives).toHaveLength(3);
    expect(state.decisions.map((decision: { phase: string }) => decision.phase)).toEqual(["scope", "scope"]);
    expect(result.finalGates).toEqual([]);
    expect(result.shipment).toBeNull();
    expect(result.leaseRetained).toBe(true);
  }, 120000);

  it("authorizes a clearly preferred exact spec proposal without a dialog and honors ship false", () => {
    const result = probe("1 ship false", { scenario: "spec-auto" });
    cleanHost(result);
    expect(result.stdout).toContain("ASTRA — continuing plan");
    expect(result.stdout).toContain("VERIFIED, NOT SHIPPED");
    const state = JSON.parse(result.completedState);
    expect(state.specApproved).toBe(true);
    expect(state.approvedProposal).toBe("Exact established contract: retain refusal, correct contradictory prose.");
    expect(result.shipment).toBeNull();
    expect(result.stdout).not.toContain("STOP —");
  }, 120000);

  it("automatically resolves a PLAN-stage scoped request without accidentally authorizing specification edits", () => {
    const result = probe("1 ship false", { scenario: "plan-scope" });
    cleanHost(result);
    expect(result.stdout).toContain("VERIFIED, NOT SHIPPED");
    const state = JSON.parse(result.completedState);
    expect(state.checkpoints.plan.attempt).toBe(2);
    expect(state.specApproved).not.toBe(true);
    expect(state.decisions[0].authority.type).toBe("exact-scoped-request");
  }, 120000);

  it("continues a genuine PLAN-stage tradeoff in exact provisional scope and reports pending approval only after all final gates/reviews", () => {
    const result = probe("1", { scenario: "plan-scope", decision: "human" });
    cleanHost(result);
    pendingApproval(result);
    expect(result.stdout).toContain("ASTRA — continuing plan");
    expect(result.stdout).toContain("Exact reports-only PLAN scope");
    const state = JSON.parse(result.completedState);
    expect(state.specApproved).not.toBe(true);
    expect(state.checkpoints.plan).toMatchObject({ status: "pass", attempt: 2 });
    expect(state.checkpoints.implement.status).toBe("pass");
    expect(state.decisions.at(-1)).toMatchObject({ source: "astra", outcome: "CONTINUE", authority: { type: "exact-scoped-request", provisional: true, gitAuthority: false } });
  }, 120000);

  it("retains a verified provisional fix with ship false and still surfaces pending owner decisions", () => {
    const result = probe("1 ship false", { scenario: "autonomous", decision: "human" });
    cleanHost(result);
    pendingApproval(result);
    expect(result.stdout).toContain("ASTRA — continuing scope");
    expect(result.stdout).toContain("change tests/legacy.test.js TypeEnv constructor new Map() to {}");
    const state = JSON.parse(result.completedState);
    expect(state.options.ship).toBe(false);
    expect(state.checkpoints.implement).toMatchObject({ status: "pass", attempt: 2 });
    expect(state.decisions.at(-1)).toMatchObject({ outcome: "CONTINUE", authority: { provisional: true } });
  }, 120000);

  it("red-direction control: an early pending-approval report is not accepted as final verification", () => {
    const source = readFileSync(join(root, ".pi", "theta", "fix-bug.theta"), "utf8");
    const start = source.indexOf('let approvals = bash({ command: prefix + "approval-report "');
    const end = source.indexOf("\nif !ship {", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const approvalBlock = source.slice(start, end);
    const gate = 'if !control(prefix + "gate " + quoted + " initial")';
    expect(source).toContain(gate);
    // This deliberately lies about completion before close/final gate/review.
    // The state/artifact assertions must reject it even though the report text
    // and provisional scope match the normal successful pending path.
    const workflow = (source.slice(0, start) + source.slice(end)).replace(gate, approvalBlock + "\n" + gate);
    const result = probe("1", { workflow, scenario: "plan-scope", decision: "human" });
    cleanHost(result);
    expect(result.stdout).toContain("PENDING OWNER APPROVAL — shipment blocked");
    expect(result.finalReview).toBe("");
    expect(result.finalGates).toEqual([]);
    expect(JSON.parse(result.completedState).checkpoints.close).toBeUndefined();
    expect(() => pendingApproval(result)).toThrowError(expect.objectContaining({ name: "AssertionError" }));
  }, 120000);

  it("revises an explicitly invalidated rejected plan and obtains fresh clean evidence review automatically", () => {
    const result = probe("1 ship false", { scenario: "plan-repair" });
    cleanHost(result);
    expect(result.stdout).toContain("ASTRA — continuing evidence");
    expect(result.stdout).toContain("VERIFIED, NOT SHIPPED");
    const state = JSON.parse(result.completedState);
    expect(state.checkpoints.plan.attempt).toBe(2);
    expect(state.replanRequired).toBe(false);
    expect(state.decisions[0]).toMatchObject({ phase: "evidence", outcome: "CONTINUE" });
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

  it("prints the severity ranking and fix-order guidance exactly once", () => {
    const result = probe("");
    cleanHost(result);
    expect(result.stdout).toContain("1. 0001 — example [MEDIUM]");
    expect(result.stdout).toContain("A reported runtime failure needs attention.");
    expect(result.stdout).toContain("FIX-ORDER GUIDANCE");
    expect(result.stdout.match(/OPEN BUGS — SEVERITY RANKING/g)).toHaveLength(1);
    expect(result.stdout).not.toContain("reproduction started");
  }, 120000);

  it("shows impact order separately from the prerequisite order", () => {
    const result = probe("", { ranking: "two" });
    cleanHost(result);
    expect(result.stdout).toContain("1. 0002 — higher impact [HIGH]");
    expect(result.stdout).toContain("2. 0001 — example [LOW]");
    expect(result.stdout).toContain("0001 before 0002: Resolve the prerequisite first.");
  }, 120000);

  it.each(["missing", "duplicate", "backwards", "cycle", "stale"] as const)("does not display a %s model assessment as a valid ranking", kind => {
    const result = probe("", { ranking: kind });
    cleanHost(result);
    expect(result.stdout).toContain("STOP — Bug (listing)");
    expect(result.stdout).toContain("Open-bug severity / fix-order assessment");
    expect(result.stdout).not.toContain("OPEN BUGS — SEVERITY RANKING");
    expect(result.stdout).not.toContain("reproduction started");
  }, 120000);

  it("keeps an empty inventory model-free", () => {
    const result = probe("", { ranking: "empty" });
    cleanHost(result);
    expect(result.stdout).toBe("No open bugs.\n");
  }, 120000);
});
