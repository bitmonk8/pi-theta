// Real CLI, real production orchestrators/helpers and real child processes.
// Only model workers are deterministic fixtures: no provider requests, real
// worktrees/branches, real red/green gates, and a local bare origin.
import { describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseThetaDocument } from "../src/parser/theta-document";
import { parseDeps } from "./helpers/e2e-s1";
import { topLevelThetaHostEnv } from "./helpers/top-level-theta-env";

const root = process.cwd();
const cli = process.env.PI_THETA_TEST_PI_CLI ?? join(root, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const production = (name: string) => readFileSync(join(root, ".pi/theta", name), "utf8");
function schema(name: string, file: string) {
  const text = production(file).match(new RegExp("schema " + name + " \\{[^}]+\\}"))?.[0];
  if (!text) throw new Error("Missing production schema " + name);
  return text;
}
const header = (params: string, tools = "bash") => `---\nmode: subagent\ntools: ${tools}\nparams:\n${params}---\n`;
const quoteFn = `fn q(s: string): string { "'" + s.replace("'", "'\\\\''") + "'" }\n`;
const stageValue = (status: string) => `BugStage { status: "${status}", summary: "Deterministic batch stage.", environment: "No infrastructure blocker.", bug_validity: "Witness proves reported failure.", fixability: "Bounded fixture fix.", progress: "See durable stage and gate evidence.", next_action: "Continue within recorded scope.", recommendation: "Preserve original witnesses." }`;

type Scenario = "complete" | "ungated" | "isolated" | "uncertain" | "resume" | "planner-failure" | "empty"
  | "prepare-negative" | "prepare-settlement-blocked" | "review-negative" | "review-uncertain" | "review-settlement-blocked";
function workers(cwd: string, scenario: Scenario) {
  const theta = join(cwd, ".pi/theta");
  const ids = scenario === "complete" ? ["0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008", "0009"]
    : scenario === "isolated" ? ["0001", "0002", "0003", "0004"] : scenario === "resume" ? ["0001", "0002"] : scenario === "empty" ? [] : ["0001"];
  const items = ids.map(id => `BatchBug { id: "${id}", ready: ${id !== "0008"}, reason: "${id === "0008" ? "Existing owner hold is unresolved." : "Ready under existing contract."}", dependencies: [${id === "0006" || (scenario === "isolated" && id === "0003") ? '"0001"' : scenario === "isolated" && id === "0004" ? '"0002"' : id === "0009" ? '"0007"' : ""}], files: ["src/${["0001", "0002"].includes(id) ? "shared" : id}.txt"] }`);
  writeFileSync(join(theta, "workers/bugfix-batch-plan.theta"), header("  catalog_path: string\n", "read")
    + schema("BatchBug", "workers/bugfix-batch-plan.theta") + "\n" + schema("BatchPlan", "workers/bugfix-batch-plan.theta")
    + '\nread({ path: catalog_path })?\n'
    + (["empty", "resume", "planner-failure"].includes(scenario) ? 'read({ path: "PLANNER_MUST_NOT_RETURN_A_PLAN" })?\n' : "")
    + `BatchPlan { bugs: [${items.join(", ")}], guidance: ["Overlap is advisory; only causal prerequisites create dependencies."] }\n`);
  writeFileSync(join(theta, "workers/bugfix-stage.theta"), header("  run_dir: string\n  phase: string\n  feedback: string\n")
    + schema("BugStage", "workers/bugfix-stage.theta") + "\n" + quoteFn
    + 'let status = bash({ command: "node fixture.mjs stage " + q(run_dir) + " " + q(phase) })?.trim()\n'
    + `if status == "DECISION" { return ${stageValue("needs_decision")} }\nif status == "BLOCKED" { return ${stageValue("blocked")} }\n${stageValue("pass")}\n`);
  writeFileSync(join(theta, "workers/bugfix-review.theta"), header("  run_dir: string\n  focus: string\n", "read")
    + 'schema Review { ok: boolean, findings: string }\nread({ path: run_dir + "/state.json" })?\nReview { ok: true, findings: "CLEAN — deterministic independent batch review" }\n');
  writeFileSync(join(theta, "workers/bugfix-decide.theta"), header("  context_path: string\n", "read")
    + schema("BugDecision", "workers/bugfix-decide.theta") + '\nread({ path: context_path })?\n'
    + (scenario === "resume"
      ? 'BugDecision { disposition: "blocked", clear_preference: false, has_tradeoff: false, evidence_sufficient: false, summary: "Fixture stage intentionally paused; resume its original source when the prerequisite marker is present.", recommendation: "Resume the retained source; no policy choice or owner approval is needed.", rationale: "Objective fixture prerequisite is not yet available.", basis: ["Original red and plan remain valid."], alternatives: ["Wait for the prerequisite marker."] }\n'
      : 'BugDecision { disposition: "human", clear_preference: false, has_tradeoff: true, evidence_sufficient: true, summary: "A material fixture policy tradeoff remains.", recommendation: "Apply the exact provisional fixture repair.", rationale: "Both outcomes are viable; owner must approve before shipment.", basis: ["Fixture AGENTS.md preserves both choices for owner approval."], alternatives: ["Apply the scoped repair.", "Retain the existing fixture."] }\n'));
  // The production lane delegates start/resume to the production /fix-bug.
  writeFileSync(join(theta, "workers/bugfix-batch-merge.theta"), header("  context_path: string\n", "bash, read")
    + schema("BatchMerge", "workers/bugfix-batch-merge.theta") + "\n" + quoteFn
    + (scenario === "uncertain"
      ? 'bash({ command: "node fixture.mjs merge-interrupted " + q(context_path) })?\nread({ path: "WORKER_TRANSPORT_FAILURE_NO_TYPED_VERDICT" })?\n'
      : scenario === "ungated" ? ""
      : 'bash({ command: "node fixture.mjs ' + (scenario === "isolated" ? "merge-isolated" : scenario.startsWith("prepare-") ? scenario : "merge") + ' " + q(context_path) })?\n')
    + `BatchMerge { ok: ${!scenario.startsWith("prepare-")}, findings: "${scenario.startsWith("prepare-") ? "Preparation declined: preserved typed negative evidence." : "Committed merge prepared; no gate or shipment authority."}" }\n`);
  writeFileSync(join(theta, "workers/bugfix-batch-review.theta"), header("  context_path: string\n", "bash, read")
    + 'schema BatchReview { ok: boolean, findings: string }\n' + quoteFn
    + 'bash({ command: "node fixture.mjs ' + (scenario.startsWith("review-") ? scenario : "review") + ' " + q(context_path) })?\n'
    + (scenario === "review-uncertain" ? 'read({ path: "REVIEW_TRANSPORT_FAILURE_NO_TYPED_VERDICT" })?\n' : "")
    + `BatchReview { ok: ${scenario !== "review-negative" && scenario !== "review-settlement-blocked"}, findings: "${scenario === "review-negative" || scenario === "review-settlement-blocked" ? "Independent fresh review declined despite passing gate." : "CLEAN — independent committed-diff review with actual gate evidence."}" }\n`);
  // No ranker is involved when /fix-bug receives its private batch manifest.
  writeFileSync(join(theta, "workers/bugfix-rank.theta"), header("  catalog_path: string\n", "read")
    + 'read({ path: "BATCH_MUST_NOT_CALL_RANKER" })?\n"UNREACHABLE"\n');
  return ids;
}

// This fixture runs inside each real stage child's cwd, never edits controller
// state, and supplies real failing/passing commands to the production gate code.
const fixture = String.raw`
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const git = (cwd, ...args) => run(cwd, ['git', ...args]);
function run(cwd, argv) {
  const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(argv.join(' ') + '\n' + r.stderr + r.stdout);
  return r.stdout.trim();
}
function event(owner, value) { appendFileSync(join(owner, '.pi/tmp/events.jsonl'), JSON.stringify(value) + '\n'); }
const [op, path, phase] = process.argv.slice(2);
if (op === 'stage') {
  const s = read(join(path, 'state.json'));
  if (process.cwd() !== s.root || git(s.root, 'branch', '--show-current') !== s.branch) throw new Error('Stage escaped its isolated branch/worktree');
  if (s.root !== join(s.ownerRoot, '.trees', basename(path)) || git(s.ownerRoot, 'check-ignore', s.root) !== s.root) throw new Error('Source worktree is not in ignored owner-root .trees');
  if (s.options.ship !== false || s.options.review_rounds !== 5) throw new Error('Lane has shipping authority or wrong review bound');
  const batchBase = read(join(s.batchRun, 'state.json')).base;
  if (git(s.ownerRoot, 'rev-parse', 'HEAD') !== batchBase || git(s.ownerRoot, 'ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0] !== batchBase) throw new Error('Owner/remote shipped while a lane is active');
  writeFileSync(join(path, phase + '.md'), 'Deterministic ' + phase + ' for ' + s.id + '\n');
  if (phase === 'reproduce') {
    event(s.ownerRoot, { type: 'lane-start', id: s.id, root: s.root, branch: s.branch, base: s.base });
    const program = "if(!require('fs').existsSync('src/" + s.id + ".txt')){console.error('AssertionError: bug " + s.id + " expected fixed behavior');process.exit(1)}";
    writeFileSync(join(path, 'witnesses.json'), JSON.stringify({ e2e: [{ argv: ['node', '-e', program], failure_pattern: 'AssertionError: bug ' + s.id + ' expected fixed behavior' }], unit: [], unit_omission_reason: 'Single inline filesystem regression has no smaller meaningful unit.', live_required: false, live: [] }));
  }
  if (phase === 'plan') {
    writeFileSync(join(path, 'spec-proposal.md'), 'No specification change needed.');
    if (s.id === '0007' && !existsSync(join(path, 'decision-authorizations.md'))) {
      writeFileSync(join(path, 'decision-request.md'), 'Exact provisional scope: create src/0007.txt with fixed fixture behavior. This is a genuine fixture-policy tradeoff requiring owner approval before shipment; preserve all assertions and original red evidence.\n' + 'RETAIN_FULL_SCOPE_ON_DISK: preserve each compatibility and review obligation.\n'.repeat(1600));
      process.stdout.write('DECISION'); process.exit(0);
    }
  }
  if (phase === 'implement') {
    if (s.id === '0001' && existsSync(join(s.ownerRoot, '.pi/tmp/resume-fixture')) && !existsSync(join(s.ownerRoot, '.pi/tmp/resume-enabled'))) {
      event(s.ownerRoot, { type: 'lane-paused', id: s.id });
      process.stdout.write('BLOCKED'); process.exit(0);
    }
    writeFileSync(join(s.root, 'src', s.id + '.txt'), 'fixed\n');
  }
  if (phase === 'close') {
    writeFileSync(join(s.root, s.bug), '# Fixture ' + s.id + '\n- **Status:** fixed\nVerified in local batch branch; not yet integrated or pushed.\n');
    event(s.ownerRoot, { type: 'lane-close', id: s.id });
  }
  process.stdout.write('PASS');
} else if (op === 'test-gate') {
  const marker = join(process.cwd(), '.pi/tmp/integration-context');
  if (existsSync(marker)) {
    const c = read(readFileSync(marker, 'utf8'));
    if (existsSync(join(c.reportDirectory, 'active'))) throw new Error('Gate ran inside a model worker instead of deterministic parent orchestration');
    if (!read(join(c.reportDirectory, 'prepare-verdict.json')).ok) throw new Error('Gate lacks successful durable preparation');
    event(c.ownerRoot, { type: 'controller-gate', id: c.id });
    if (existsSync(join(process.cwd(), '.pi/tmp/reject-integration'))) {
      event(c.ownerRoot, { type: 'merge-rejected', id: c.id });
      console.error('INTEGRATION_ONLY_FAILURE'); process.exit(1);
    }
  }
} else if (op.startsWith('review')) {
  const c = read(path);
  if (!existsSync(join(c.reportDirectory, 'active'))) throw new Error('Independent reviewer lacks active marker');
  if (!read(join(c.reportDirectory, 'prepare-verdict.json')).ok) throw new Error('Review lacks preparation');
  if (read(c.gatePath).sha !== git(c.root, 'rev-parse', 'HEAD')) throw new Error('Review lacks current committed gate');
  if (git(c.ownerRoot, 'rev-parse', 'HEAD') !== c.base || git(c.ownerRoot, 'ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0] !== c.base) throw new Error('Integration shipped before independent review');
  event(c.ownerRoot, { type: 'merge-gated', id: c.id, sha: git(c.root, 'rev-parse', 'HEAD') });
  if (op === 'review-settlement-blocked') mkdirSync(join(c.batchRun, 'controller.lock'));
  process.stdout.write('PASS');
} else if (op.startsWith('merge') || op.startsWith('prepare-')) {
  const c = read(path);
  if (c.root !== join(c.ownerRoot, '.trees', basename(c.batchRun) + '-integrate-' + c.id) || git(c.ownerRoot, 'check-ignore', c.root) !== c.root) throw new Error('Integration worktree is not in ignored owner-root .trees');
  for (const name of readdirSync(join(c.ownerRoot, '.pi/tmp')).filter(n => n.startsWith('fix-bug-'))) {
    const run = join(c.ownerRoot, '.pi/tmp', name);
    if (existsSync(join(run, 'state.json')) && read(join(run, 'state.json')).batchRun === c.batchRun && existsSync(join(run, 'active'))) throw new Error('Integration began before every fixer settled');
  }
  const batch = read(join(c.batchRun, 'state.json'));
  if (Object.values(batch.jobs).filter(j => j.status === 'integrating').length !== 1) throw new Error('Concurrent integration transaction');
  event(c.ownerRoot, { type: 'merge-start', id: c.id, base: c.base, source: c.sourceSha });
  if (git(c.ownerRoot, 'rev-parse', 'HEAD') !== c.base) throw new Error('Owner changed before integration');
  run(c.root, c.mergeArgv);
  if (op === 'merge-interrupted') { process.stdout.write('PASS'); process.exit(0); }
  mkdirSync(join(c.root, '.pi/tmp'), { recursive: true });
  writeFileSync(join(c.root, '.pi/tmp/integration-context'), path);
  if (op === 'merge-isolated' && c.id === '0001') writeFileSync(join(c.root, '.pi/tmp/reject-integration'), 'Known integration-only prepush failure.');
  if (op === 'prepare-settlement-blocked') mkdirSync(join(c.batchRun, 'controller.lock'));
  event(c.ownerRoot, { type: 'merge-prepared', id: c.id });
  process.stdout.write('PASS');
} else throw new Error('Unknown fixture operation');
`;

type Event = { type: string; id: string; root?: string; branch?: string; base?: string; sha?: string };
function requiredObservation<T>(value: T | null | undefined, label: string): T {
  if (value == null) throw new Error(`Missing ${label}`);
  return value;
}
function probe(scenario: Scenario) {
  const cwd = mkdtempSync(join(tmpdir(), "fix-all-bugs-host-"));
  const theta = join(cwd, ".pi/theta");
  const agent = join(cwd, "agent");
  const git = (...args: string[]) => {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    expect(r.status, r.stderr + r.stdout).toBe(0);
    return r.stdout.trim();
  };
  try {
    for (const dir of [join(".pi", "theta", "workers"), ".pi/tmp", "tools/bugfix", "docs/bugs", "src", "tests", "agent"]) mkdirSync(join(cwd, dir), { recursive: true });
    writeFileSync(join(cwd, ".gitignore"), "agent/\n.pi/tmp/\n/.trees/\n");
    writeFileSync(join(cwd, "src/initial.txt"), "initial\n");
    writeFileSync(join(cwd, "tests/initial.txt"), "initial\n");
    writeFileSync(join(cwd, "AGENTS.md"), "Preserve all witnesses; fixture policy tradeoffs require owner approval before shipment.\n");
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "batch-host-fixture", scripts: { typecheck: 'node --check fixture.mjs', test: 'node fixture.mjs test-gate' } }));
    writeFileSync(join(cwd, "fixture.mjs"), fixture);
    writeFileSync(join(agent, "auth.json"), JSON.stringify({ openai: { type: "api_key", key: "pi-theta-no-network" } }));
    writeFileSync(join(agent, "settings.json"), JSON.stringify({ defaultProvider: "openai", defaultModel: "gpt-6.1-sol", defaultProjectTrust: "always", theta: { binderModel: "openai/gpt-6.1-sol" } }));
    for (const file of ["fix-all-bugs.theta", "fix-bug.theta", "workers/bugfix-batch-lane.theta"]) writeFileSync(join(theta, file), production(file));
    // Controller-owned gate/recovery helpers are part of the shipped control surface.
    for (const file of readdirSync(join(root, "tools/bugfix")).filter(name => name.endsWith(".mjs"))) copyFileSync(join(root, "tools/bugfix", file), join(cwd, "tools/bugfix", file));
    const ids = workers(cwd, scenario);
    for (const id of ids) writeFileSync(join(cwd, "docs/bugs", id + "-fixture.md"), `# Fixture ${id}\n- **Status:** open\n${id === "0008" ? "Explicit owner hold; do not attempt.\n" : ""}`);
    // Refusal fallback must never accidentally turn a parse regression into a
    // provider request using the fixture's deliberately invalid credentials.
    for (const path of [join(theta, "fix-all-bugs.theta"), join(theta, "fix-bug.theta"), ...readdirSync(join(theta, "workers")).map(name => join(theta, "workers", name))]) {
      expect(parseThetaDocument({ path, bytes: new Uint8Array(readFileSync(path)) }, parseDeps()).diagnostics, path).toEqual([]);
    }
    writeFileSync(join(cwd, "question.mjs"), `import { appendFileSync } from "node:fs";\nexport default function(pi) { pi.registerTool({ name: "question", label: "Question", description: "Forbidden approval dialog", parameters: {type:"object", properties:{}}, async execute() { appendFileSync(${JSON.stringify(join(cwd, ".pi/tmp/questions"))}, "called\\n"); throw new Error("Unexpected approval dialog"); } }); }\n`);
    git("init", "-b", "main"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "Test"); git("add", "."); git("commit", "-m", "fixture");
    const base = git("rev-parse", "HEAD");
    const remote = join(cwd, ".pi/tmp/origin.git");
    git("init", "--bare", "-b", "main", remote); git("remote", "add", "origin", remote); git("push", "origin", "main");
    const host = (request: string, label: string) => {
      const result = spawnSync(process.execPath, [cli, "-ne", "-e", join(cwd, "question.mjs"), "-e", join(root, "extensions"), "--theta", theta, "--theta", join(theta, "workers"), "--session", join(cwd, `.pi/tmp/${label}-session.jsonl`), "-p", request], {
        cwd, encoding: "utf8", timeout: 240000, maxBuffer: 8 * 1024 * 1024,
        env: topLevelThetaHostEnv(process.env, join(root, "extensions"), process.pid, { PI_OFFLINE: "1", PI_CODING_AGENT_DIR: agent }),
      });
      writeFileSync(join(tmpdir(), `fix-all-bugs-${scenario}-${label}-${process.pid}.log`), result.stdout + "\nSTDERR:\n" + result.stderr);
      expect(result.error, result.stdout + result.stderr).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).not.toContain("theta_result");
      return result;
    };
    const controller = (...args: string[]) => {
      const result = spawnSync(process.execPath, [join(cwd, "tools/bugfix/batch.mjs"), ...args], { cwd, encoding: "utf8" });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      return result.stdout.trim();
    };
    let originals: Record<string, { run: string; root: string; branch: string; manifest: Buffer; claim: Buffer; witness: Buffer; red: Buffer }> = {};
    let beforeResumeEvents = 0;
    if (scenario === "resume") {
      writeFileSync(join(cwd, ".pi/tmp/resume-fixture"), "Initial source 0001 pauses safely during implementation.");
      const batch = controller("start");
      controller("catalog", batch);
      writeFileSync(join(batch, "plan.json"), JSON.stringify({ bugs: ids.map(id => ({ id, ready: true, reason: "Established fixture contract", dependencies: [], files: [`src/${id}.txt`] })), guidance: [] }));
      expect(controller("plan", batch)).toBe("PASS");
      const manifests = controller("next", batch).split("\n");
      for (const manifest of manifests) {
        const id = json(manifest).id;
        host("/fix-bug batch " + manifest, "prepare-" + id);
        expect(controller("collect", batch, id)).toBe(id === "0001" ? "BLOCKED" : "VERIFIED");
      }
      const state = json(join(batch, "state.json"));
      originals = Object.fromEntries(ids.map(id => {
        const source = state.jobs[id].sourceRun;
        const s = json(join(source, "state.json"));
        return [id, { run: source, root: s.root, branch: s.branch, manifest: readFileSync(state.jobs[id].manifest), claim: readFileSync(join(batch, "jobs", id + ".launch/owner.json")), witness: readFileSync(join(source, "witnesses.json")), red: readFileSync(join(source, "red-0.json")) }];
      }));
      beforeResumeEvents = readFileSync(join(cwd, ".pi/tmp/events.jsonl"), "utf8").trim().split("\n").length;
      writeFileSync(join(cwd, ".pi/tmp/resume-enabled"), "Continue the same retained source.");
    }
    const result = host("/fix-all-bugs" + (scenario === "resume" ? " resume" : ""), "batch");
    expect(result.error, result.stdout + result.stderr).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(existsSync(join(cwd, ".pi/tmp/questions")), "no swallowed approval dialog").toBe(false);
    const batchName = readdirSync(join(cwd, ".pi/tmp")).find(name => name.startsWith("fix-all-bugs-"));
    expect(batchName, result.stdout).toBeDefined();
    const run = join(cwd, ".pi/tmp", batchName!);
    const state = json(join(run, "state.json"));
    const events: Event[] = existsSync(join(cwd, ".pi/tmp/events.jsonl")) ? readFileSync(join(cwd, ".pi/tmp/events.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line)) : [];
    const sources = Object.fromEntries(Object.entries(state.jobs).map(([id, job]: [string, any]) => [id, job.sourceRun ? {
      state: json(join(job.sourceRun, "state.json")),
      red: existsSync(join(job.sourceRun, "red-0.json")) ? json(join(job.sourceRun, "red-0.json")) : null,
      final: existsSync(join(job.sourceRun, "final-review-result.json")) ? json(join(job.sourceRun, "final-review-result.json")) : null,
      finalGates: readdirSync(job.sourceRun).filter(name => /^gate-\d+-final-\d+\.json$/.test(name)).map(name => json(join(job.sourceRun, name))),
      retained: existsSync(json(join(job.sourceRun, "state.json")).root),
      ignored: git("check-ignore", json(join(job.sourceRun, "state.json")).root),
      committed: existsSync(join(job.sourceRun, "batch-commit.json")),
      shipment: existsSync(join(job.sourceRun, "shipment.json")),
    } : null]));
    const integrations = Object.fromEntries(Object.entries(state.jobs).filter(([, job]: [string, any]) => job.integration).map(([id, job]: [string, any]) => {
      const context = json(job.integration);
      const binding = join(context.reportDirectory, "review-binding.json");
      expect(context.root).toBe(join(cwd, ".trees", basename(run) + "-integrate-" + id));
      expect(git("check-ignore", context.root)).toBe(context.root);
      const gateLogs = readdirSync(context.reportDirectory).filter(name => /^gate-\d+$/.test(name)).flatMap(name => {
        const folder = join(context.reportDirectory, name);
        return readdirSync(folder).filter(file => /^\d+\.json$/.test(file)).map(file => json(join(folder, file)));
      });
      return [id, { context, retained: existsSync(context.root), active: existsSync(join(context.reportDirectory, "active")), verdict: existsSync(context.verdictPath) ? json(context.verdictPath) : null, preparation: existsSync(join(context.reportDirectory, "prepare-verdict.json")) ? json(join(context.reportDirectory, "prepare-verdict.json")) : null, gateLogs, gate: existsSync(context.gatePath) ? json(context.gatePath) : null, binding: existsSync(binding) ? json(binding) : null }];
    }));
    for (const [id, original] of Object.entries(originals)) {
      expect(state.jobs[id].sourceRun).toBe(original.run);
      expect(readFileSync(state.jobs[id].manifest)).toEqual(original.manifest);
      expect(readFileSync(join(run, "jobs", id + ".launch/owner.json"))).toEqual(original.claim);
      expect(readFileSync(join(original.run, "witnesses.json"))).toEqual(original.witness);
      expect(readFileSync(join(original.run, "red-0.json"))).toEqual(original.red);
      expect(sources[id]!.state.root).toBe(original.root);
      expect(sources[id]!.state.branch).toBe(original.branch);
    }
    const sourceRunCount = readdirSync(join(cwd, ".pi/tmp")).filter(name => /^fix-bug-\d{4}-/.test(name)).length;
    const settlementBlocked = scenario.endsWith("settlement-blocked");
    const detail = settlementBlocked && !existsSync(join(run, "report.json")) ? null : json(join(run, "report.json"));
    const overview = settlementBlocked ? "Controller deliberately blocked by fixture; evidence retained." : controller("render-report", run);
    const fullAudit = settlementBlocked && !existsSync(join(run, "report.txt")) ? "" : readFileSync(join(run, "report.txt"), "utf8");
    const observation = { state, sources, integrations, events, detail, overview, fullAudit, sourceRunCount, beforeResumeEvents, stdout: result.stdout, base, main: git("rev-parse", "HEAD"), remote: git("--git-dir", remote, "rev-parse", "main"), status: git("status", "--porcelain"), branches: git("branch", "--format=%(refname:short)"), worktrees: git("worktree", "list", "--porcelain"), lease: existsSync(join(cwd, ".pi/tmp/fix-bug.lock")), integrationLock: existsSync(join(run, "integration.lock")) };
    writeFileSync(join(tmpdir(), `fix-all-bugs-${scenario}-${process.pid}.json`), JSON.stringify(observation, null, 2));
    return observation;
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

describe("/fix-all-bugs through the real host with deterministic workers", () => {
  it("runs independent /fix-bug lanes with a four-worktree cap, overlap-aware waves, dependency-safe serialized shipping and retained pending approvals", () => {
    const r = probe("complete");
    expect(r.stdout).not.toContain("BATCH STOP");
    expect(r.stdout).toContain("FIX ALL BUGS — COMPLETE");
    expect(r.stdout).not.toContain("STOPPED / NOT FINALIZED");
    expect(r.overview).toContain("owner decision pending");
    expect(r.fullAudit).toContain("PENDING OWNER APPROVAL");
    expect(r.fullAudit).toContain("Rationale:");
    expect(Buffer.byteLength(r.overview, "utf8")).toBeLessThan(48000);
    expect(r.overview).not.toContain("RETAIN_FULL_SCOPE_ON_DISK");
    for (let id = 1; id <= 9; id++) expect(r.overview).toContain(String(id).padStart(4, "0"));
    expect(r.detail).toBeDefined();
    expect(r.status).toBe("");
    const starts = r.events.filter(e => e.type === "lane-start");
    expect(starts.map(e => e.id).sort()).toEqual(["0001", "0002", "0003", "0004", "0005", "0006", "0007"]);
    expect(new Set(starts.map(e => e.root)).size).toBe(7);
    expect(new Set(starts.map(e => e.branch)).size).toBe(7);
    // 0002 overlaps 0001; 0006 must wait for 0001. Independent alternatives fill
    // the first four slots instead. All four genuinely overlap in execution.
    expect(starts.slice(0, 4).map(e => e.id).sort()).toEqual(["0001", "0003", "0004", "0005"]);
    const active = new Set<string>();
    let highWater = 0;
    let merging: string | null = null;
    for (const e of r.events) {
      if (e.type === "lane-start") { active.add(e.id); highWater = Math.max(highWater, active.size); expect(merging).toBeNull(); }
      if (e.type === "lane-close") active.delete(e.id);
      if (e.type === "merge-start") { expect(active.size, "every fixer settles before owner/remote changes").toBe(0); expect(merging).toBeNull(); merging = e.id; }
      if (e.type === "merge-gated") { expect(merging).toBe(e.id); merging = null; }
    }
    expect(highWater).toBe(4);
    const firstIntegrated = r.events.find(e => e.type === "merge-gated" && e.id === "0001")!;
    const dependent = starts.find(e => e.id === "0006")!;
    expect(r.events.indexOf(dependent)).toBeGreaterThan(r.events.indexOf(firstIntegrated));
    expect(dependent.base).not.toBe(r.base);
    const integrated = ["0001", "0002", "0003", "0004", "0005", "0006"];
    for (const id of integrated) {
      expect(r.state.jobs[id].status, id).toBe("integrated");
      const source = requiredObservation(r.sources[id], `source run for ${id}`);
      expect(source.state.options).toEqual({ ship: false, review_rounds: 5 });
      expect(source.state.root).toBe(join(r.state.root, ".trees", basename(r.state.jobs[id].sourceRun)));
      expect(source.ignored).toBe(source.state.root);
      expect(source.state.checkpoints).toMatchObject({ reproduce: { status: "pass" }, diagnose: { status: "pass" }, plan: { status: "pass" }, implement: { status: "pass" }, close: { status: "pass" } });
      expect(source.red).not.toBeNull();
      expect(source.final).toMatchObject({ ok: true });
      expect(source.finalGates).toHaveLength(2);
      expect(source.finalGates.every((g: any) => g.code === 0)).toBe(true);
      expect(source.committed).toBe(true);
      expect(source.shipment, "lane never ships itself").toBe(false);
      expect(source.retained, "only successfully integrated worktrees are removed").toBe(false);
      const integration = requiredObservation(r.integrations[id], `integration for ${id}`);
      expect(integration.preparation).toMatchObject({ ok: true, findings: expect.stringContaining("no gate or shipment authority") });
      expect(integration.verdict).toMatchObject({ ok: true, findings: expect.stringContaining("independent committed-diff review") });
      expect(integration.gate.sha).toBe(integration.binding.sha);
      expect(integration.binding.verdict).toMatchObject({ ok: true });
      expect(integration.retained).toBe(false);
      expect(r.worktrees).not.toContain(source.state.root);
      expect(r.worktrees).not.toContain(integration.context.root);
      expect(r.state.jobs[id].shipment).toMatchObject({ pushed: true, cleaned: true });
    }
    expect(r.main).toBe(r.remote);
    expect(r.main).not.toBe(r.base);
    expect(r.state.jobs["0007"].status).toBe("pending-approval");
    const pending = requiredObservation(r.sources["0007"], "pending source run for 0007");
    expect(pending.state.checkpoints.close.status).toBe("pass");
    expect(pending.state.decisions).toEqual(expect.arrayContaining([expect.objectContaining({ authority: expect.objectContaining({ provisional: true, gitAuthority: false }) })]));
    expect(pending.final).toMatchObject({ ok: true });
    expect(pending.finalGates).toHaveLength(2);
    expect(pending.red).not.toBeNull();
    expect(pending.retained).toBe(true);
    expect(pending.state.root).toBe(join(r.state.root, ".trees", basename(r.state.jobs["0007"].sourceRun)));
    expect(pending.ignored).toBe(pending.state.root);
    expect(pending.committed).toBe(false);
    expect(pending.shipment).toBe(false);
    expect(r.branches).toContain(pending.state.branch);
    expect(r.worktrees).toContain(pending.state.root);
    expect(r.integrations["0007"]).toBeUndefined();
    expect(r.state.jobs["0008"]).toBeUndefined();
    expect(r.state.outcomes["0008"].status).toBe("authorization-required");
    expect(r.state.jobs["0009"]).toBeUndefined();
    expect(r.state.outcomes["0009"]).toMatchObject({ status: "blocked", reason: expect.stringContaining("0007") });
    expect(r.lease, "settled batch releases execution lease, not pending artifacts").toBe(false);
  }, 300000);

  it("still rejects claimed successful preparation without the actual committed merge, retaining both branches/worktrees without pushing", () => {
    const r = probe("ungated");
    expect(r.stdout).not.toContain("BATCH STOP");
    expect(r.state.jobs["0001"].status).toBe("integration-blocked");
    expect(r.main).toBe(r.base);
    expect(r.remote).toBe(r.base);
    expect(r.status).toBe("");
    const source = requiredObservation(r.sources["0001"], "ungated source run for 0001");
    const integration = requiredObservation(r.integrations["0001"], "ungated integration for 0001");
    expect(source.committed).toBe(true);
    expect(source.shipment).toBe(false);
    expect(source.retained).toBe(true);
    expect(source.state.root).toBe(join(r.state.root, ".trees", basename(r.state.jobs["0001"].sourceRun)));
    expect(source.ignored).toBe(source.state.root);
    expect(r.worktrees).toContain(source.state.root);
    expect(integration.retained).toBe(true);
    expect(integration.gate).toBeNull();
    expect(integration.binding).toBeNull();
    expect(r.worktrees).toContain(integration.context.root);
    expect(r.integrationLock).toBe(false);
    expect(r.lease, "known settled prepush failures can release the lease, not their artifacts").toBe(false);
  }, 120000);

  it("parks a valid negative integration verdict, ships unrelated fixes and blocks only true dependents", () => {
    const r = probe("isolated");
    expect(r.stdout).not.toContain("BATCH STOP");
    expect(r.state.jobs["0001"].status).toBe("integration-blocked");
    expect(r.state.jobs["0002"].status).toBe("integrated");
    expect(r.state.jobs["0004"].status).toBe("integrated");
    expect(r.state.jobs["0003"]).toBeUndefined();
    expect(r.state.outcomes["0003"]).toMatchObject({ status: "blocked", reason: expect.stringContaining("0001") });
    expect(r.events.filter(e => e.type === "lane-start").map(e => e.id).sort()).toEqual(["0001", "0002", "0004"]);
    const rejected = r.events.findIndex(e => e.type === "merge-rejected" && e.id === "0001");
    expect(rejected).toBeGreaterThan(-1);
    expect(r.events.findIndex(e => e.type === "merge-gated" && e.id === "0002")).toBeGreaterThan(rejected);
    expect(r.overview).toMatch(/mandatory test failed|Integration gate failed/i);
    expect(r.overview).not.toContain("Worker verdict must be");
    expect(r.sources["0001"]!.retained).toBe(true);
    expect(r.integrations["0001"]!.retained).toBe(true);
    expect(r.integrations["0001"]!.binding).toBeNull();
    expect(r.integrations["0001"]!.active).toBe(false);
    expect(r.integrations["0001"]!.verdict).toMatchObject({ ok: false, findings: expect.stringContaining("Integration gate failed") });
    expect(r.integrations["0001"]!.gateLogs).toEqual(expect.arrayContaining([expect.objectContaining({ argv: ["npm", "test"], code: 1, output: expect.stringContaining("INTEGRATION_ONLY_FAILURE") })]));
    expect(r.main).toBe(r.remote);
    expect(r.main).not.toBe(r.base);
    expect(r.integrationLock).toBe(false);
    expect(r.lease).toBe(false);
  }, 180000);

  it("requires a fresh independent review after the deterministic gate, not merely successful preparation", () => {
    const r = probe("review-negative");
    const integration = requiredObservation(r.integrations["0001"], "review-rejected integration");
    expect(integration.preparation).toMatchObject({ ok: true });
    expect(integration.gate).not.toBeNull();
    expect(r.events.map(e => e.type)).toEqual(expect.arrayContaining(["merge-prepared", "controller-gate", "merge-gated"]));
    expect(r.events.findIndex(e => e.type === "controller-gate")).toBeLessThan(r.events.findIndex(e => e.type === "merge-gated"));
    expect(integration.verdict).toMatchObject({ ok: false, findings: expect.stringContaining("Independent fresh review declined") });
    expect(integration.binding).toBeNull();
    expect(integration.active).toBe(false);
    expect(r.state.jobs["0001"].status).toBe("integration-blocked");
    expect(r.main).toBe(r.base);
    expect(r.remote).toBe(r.base);
    expect(r.lease).toBe(false);
  }, 120000);

  it("preserves a negative preparation as both preparation evidence and final refusal without running gate/review", () => {
    const r = probe("prepare-negative");
    const integration = requiredObservation(r.integrations["0001"], "preparation-rejected integration");
    expect(integration.preparation).toMatchObject({ ok: false, findings: expect.stringContaining("Preparation declined") });
    expect(integration.verdict).toEqual(integration.preparation);
    expect(integration.gate).toBeNull();
    expect(r.events.some(e => e.type === "controller-gate" || e.type === "merge-gated")).toBe(false);
    expect(r.state.jobs["0001"].status).toBe("integration-blocked");
    expect(r.main).toBe(r.base);
    expect(r.remote).toBe(r.base);
  }, 120000);

  it.each(["prepare-settlement-blocked", "review-settlement-blocked"] as const)("retains the actual typed refusal BEFORE a blocked settlement: %s", scenario => {
    const r = probe(scenario);
    const integration = requiredObservation(r.integrations["0001"], "unsettled integration");
    expect(r.stdout).toContain("BATCH STOP");
    expect(r.stdout).toMatch(/settlement|settled/i);
    expect(r.stdout).toMatch(/Preparation declined|Independent fresh review declined/);
    expect(integration.verdict).toMatchObject({ ok: false });
    expect(integration.preparation).toMatchObject({ ok: scenario === "review-settlement-blocked" });
    expect(integration.active).toBe(true);
    expect(integration.binding).toBeNull();
    expect(r.state.jobs["0001"].status).toBe("integrating");
    expect(r.main).toBe(r.base);
    expect(r.remote).toBe(r.base);
    expect(r.integrationLock).toBe(true);
    expect(r.lease).toBe(true);
  }, 120000);

  it("keeps successful preparation and gate but no final verdict when the fresh reviewer invoke fails", () => {
    const r = probe("review-uncertain");
    const integration = requiredObservation(r.integrations["0001"], "uncertain reviewer");
    expect(r.stdout).toContain("liveness is uncertain");
    expect(integration.preparation).toMatchObject({ ok: true });
    expect(integration.gate).not.toBeNull();
    expect(integration.verdict).toBeNull();
    expect(integration.active).toBe(true);
    expect(integration.binding).toBeNull();
    expect(r.main).toBe(r.base);
    expect(r.remote).toBe(r.base);
    expect(r.integrationLock).toBe(true);
    expect(r.lease).toBe(true);
  }, 120000);

  it("keeps the integration marker and checkout lease after an interrupted worker without a typed verdict", () => {
    const r = probe("uncertain");
    expect(r.stdout).toContain("BATCH STOP");
    expect(r.stdout).toContain("liveness is uncertain");
    expect(r.state.jobs["0001"].status).toBe("integrating");
    expect(r.integrations["0001"]!.active).toBe(true);
    expect(r.integrations["0001"]!.verdict).toBeNull();
    expect(r.integrations["0001"]!.binding).toBeNull();
    expect(r.sources["0001"]!.retained).toBe(true);
    expect(r.integrations["0001"]!.retained).toBe(true);
    expect(r.main).toBe(r.base);
    expect(r.remote).toBe(r.base);
    expect(r.integrationLock).toBe(true);
    expect(r.lease).toBe(true);
  }, 120000);

  it("resumes the accepted plan and original incomplete sources without duplicate lanes, draining verified work first", () => {
    const r = probe("resume");
    expect(r.stdout).not.toContain("BATCH STOP");
    expect(r.sourceRunCount).toBe(2);
    expect(r.events.filter(e => e.type === "lane-start").map(e => e.id).sort()).toEqual(["0001", "0002"]);
    const resumedEvents = r.events.slice(r.beforeResumeEvents);
    expect(resumedEvents[0]).toMatchObject({ type: "merge-start", id: "0002" });
    expect(resumedEvents.findIndex(e => e.type === "lane-close" && e.id === "0001")).toBeGreaterThan(resumedEvents.findIndex(e => e.type === "merge-gated" && e.id === "0002"));
    for (const id of ["0001", "0002"]) expect(r.state.jobs[id].status).toBe("integrated");
    expect(r.main).toBe(r.remote);
    expect(r.lease).toBe(false);
  }, 180000);

  it("does not label a planner failure COMPLETE merely because the settled lease can be released", () => {
    const r = probe("planner-failure");
    expect(r.stdout).toContain("BATCH STOP");
    expect(r.overview).not.toContain("FIX ALL BUGS — COMPLETE");
    expect(r.overview).toContain("0001");
    expect(r.events).toEqual([]);
    expect(r.main).toBe(r.base);
    expect(r.remote).toBe(r.base);
    expect(r.lease).toBe(false);
  }, 60000);

  it("does not invoke a planner or start lanes for an empty inventory", () => {
    const r = probe("empty");
    expect(r.stdout).toContain("Batch scheduling complete");
    expect(r.overview).toContain("FIX ALL BUGS — COMPLETE");
    expect(r.stdout).not.toContain("BATCH STOP");
    expect(r.events).toEqual([]);
    expect(r.state.jobs).toEqual({});
    expect(r.main).toBe(r.base);
    expect(r.remote).toBe(r.base);
    expect(r.lease).toBe(false);
  }, 60000);
});
