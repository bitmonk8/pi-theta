// Real production Astra planner/merge workers, not model-authored replacement
// verdicts. Prompt-mode callers only persist the actual typed child return.
// Every Git operation and mandatory gate is confined to disposable repositories.
import { describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { failLoudly, parseSystemNoteCodes, spawnPiPrint } from "./harness";
import { parseThetaDocument } from "../../../src/parser/theta-document";
import { parseDeps } from "../../helpers/e2e-s1";

const root = process.cwd();
const batchHelper = join(root, "tools/bugfix/batch.mjs");
const runHelper = join(root, "tools/bugfix/run.mjs");
const workerDir = join(root, ".pi", "theta", "workers");

async function requireAstra() {
  // These workflows deliberately pin Astra, so normal live Sol fallback would
  // test a different policy. Unavailable credentials/model fail, never skip.
  const runtime = await ModelRuntime.create();
  const registry = new ModelRegistry(runtime);
  await registry.refresh();
  if (!registry.getAvailable().some(model => model.provider === "openai" && model.id === "gpt-6-astra")) {
    failLoudly("bugfix batch live precondition unmet: credentialed openai/gpt-6-astra is required for the actual production planner and conflict resolver; no substitute or silent skip.");
  }
}
function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(result.status, result.stderr + result.stdout).toBe(0);
  return result.stdout.trim();
}
function invoke(cwd: string, helper: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [helper, ...args], { cwd, encoding: "utf8" });
  expect(result.status, result.stderr + result.stdout).toBe(0);
  return result.stdout.trim();
}
function put(cwd: string, path: string, text: string) {
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileSync(join(cwd, path), text);
}
function json(path: string) { return JSON.parse(readFileSync(path, "utf8")); }
const serialization = [
  'fn json_text(value: string): string {',
  '  "\\\"" + value.replace("\\\\", "\\\\\\\\").replace("\\\"", "\\\\\\\"")',
  '    .replace("\\n", "\\\\n").replace("\\r", "\\\\r").replace("\\t", "\\\\t") + "\\\""',
  '}',
  'fn json_list(values: array<string>): string {',
  '  let mut text = ""',
  '  for value in values {',
  '    if text != "" { text += "," }',
  '    text += json_text(value)',
  '  }',
  '  "[" + text + "]"',
  '}',
].join("\n");
function installProbe(cwd: string, kind: "plan" | "merge") {
  const theta = join(cwd, ".pi/theta");
  const worker = "bugfix-batch-" + kind;
  const workerPath = join(theta, "workers", worker + ".theta");
  mkdirSync(dirname(workerPath), { recursive: true });
  copyFileSync(join(workerDir, worker + ".theta"), workerPath);
  expect(readFileSync(workerPath, "utf8")).toMatch(/^model: "openai\/gpt-6-astra"$/m);
  const body = kind === "plan" ? [
    'schema BatchBug { id: string, ready: boolean, reason: string, dependencies: array<string>, files: array<string> }',
    'let actual = bugfix_batch_plan(context_path)?',
    'let typed_bugs: array<BatchBug> = actual.bugs',
    'let guidance: array<string> = actual.guidance',
    'let mut bugs = ""',
    'for bug in typed_bugs {',
    '  if bugs != "" { bugs += "," }',
    '  bugs += "{\\\"id\\\":" + json_text(bug.id) + ",\\\"ready\\\":" + (bug.ready ? "true" : "false")',
    '    + ",\\\"reason\\\":" + json_text(bug.reason) + ",\\\"dependencies\\\":" + json_list(bug.dependencies)',
    '    + ",\\\"files\\\":" + json_list(bug.files) + "}"',
    '}',
    'write({ path: context_path + ".actual.json", content: "{\\\"bugs\\\":[" + bugs + "],\\\"guidance\\\":" + json_list(guidance) + "}" })?',
  ] : [
    'let actual = bugfix_batch_merge(context_path)?',
    'write({ path: context_path + ".actual.json", content: "{\\\"ok\\\":" + (actual.ok ? "true" : "false") + ",\\\"findings\\\":" + json_text(actual.findings) + "}" })?',
  ];
  const callerPath = join(theta, "batch-" + kind + "-probe.theta");
  put(cwd, join(".pi", "theta", "batch-" + kind + "-probe.theta"), [
    "---", "mode: prompt", "tools:", "  - ./workers/" + worker + ".theta", "  - write",
    "params:", "  context_path: string", "---", serialization, ...body,
    '"Actual batch worker return captured without granting shipment authority"', "",
  ].join("\n"));
  for (const path of [callerPath, workerPath]) {
    expect(parseThetaDocument({ path, bytes: new Uint8Array(readFileSync(path)) }, parseDeps()).diagnostics, path).toEqual([]);
  }
  return theta;
}
function init(cwd: string) {
  git(cwd, "init", "-b", "main");
  git(cwd, "config", "user.email", "test@example.invalid");
  git(cwd, "config", "user.name", "Test");
  git(cwd, "add", "."); git(cwd, "commit", "-m", "bounded live batch fixture");
}
async function drive(cwd: string, theta: string, kind: "plan" | "merge", context: string) {
  const session = join(cwd, ".pi/tmp/batch-" + kind + "-session.jsonl");
  mkdirSync(dirname(session), { recursive: true });
  // Harness scrubs inherited theta invocation state and authenticates/pins both
  // the real CLI and this checkout's extension across the real child process.
  const result = await spawnPiPrint({
    cwd, thetaDir: theta, extraThetaDirs: [join(theta, "workers")],
    slashInvocation: "/batch-" + kind + "-probe " + context,
    extraArgs: ["--mode", "json", "--session", session],
    abortAfterMs: kind === "merge" ? 330000 : 210000,
  });
  // Durable diagnostics survive fixture cleanup and permit unlimited inspection
  // without repeating a provider run. Never pipe the expensive run to a filter.
  const logs = mkdtempSync(join(tmpdir(), "bugfix-batch-live-" + kind + "-logs-"));
  writeFileSync(join(logs, "host.stdout.jsonl"), result.stdout);
  writeFileSync(join(logs, "host.stderr.txt"), result.stderr);
  if (existsSync(context + ".actual.json")) copyFileSync(context + ".actual.json", join(logs, "actual.json"));
  if (existsSync(session)) copyFileSync(session, join(logs, "session.jsonl"));
  copyFileSync(context, join(logs, "context.json"));
  if (kind === "merge") {
    const ctx = json(context);
    if (existsSync(ctx.gatePath)) {
      copyFileSync(ctx.gatePath, join(logs, "gate.json"));
      for (const [index, proof] of json(ctx.gatePath).results.entries()) {
        copyFileSync(proof.path, join(logs, "gate-command-" + index + ".json"));
      }
    }
  }
  const diagnostic = "Retained logs: " + logs + "\n" + result.stderr + "\n" + result.stdout;
  expect(result.exitCode, diagnostic).toBe(0);
  expect(result.stderr, diagnostic).toBe("");
  expect(parseSystemNoteCodes(result.stderr + "\n" + result.stdout), diagnostic).toEqual([]);
  expect(result.stdout, diagnostic).not.toContain("theta-system-note");
  // Score the full JSONL stream, not only message_end events; prompt callers
  // must not inherit a foreign worker's theta_result envelope.
  expect(result.stdout, diagnostic).not.toContain("theta_result");
  // A model-free caller may never append a turn and therefore creates no
  // session file. If a persisted transcript exists, inspect it in addition to
  // the full host stream; the actual sink file below is mandatory either way.
  if (existsSync(session)) expect(readFileSync(session, "utf8"), diagnostic).not.toMatch(/"customType"\s*:\s*"theta-system-note"/);
  expect(existsSync(context + ".actual.json"), diagnostic).toBe(true);
  return json(context + ".actual.json");
}
interface Bug { id: string; ready: boolean; reason: string; dependencies: string[]; files: string[] }
interface Plan { bugs: Bug[]; guidance: string[] }
function predicts(bug: Bug, path: string) {
  return bug.files.some(file => path === file || path.startsWith(file.replace(/\/$/, "") + "/"));
}

describe("live Astra production bugfix batch workers", () => {
  it("plans actual dependencies, excludes a filed pending owner choice, and predicts shared edit surfaces without inventing dependencies", async () => {
    await requireAstra();
    const cwd = mkdtempSync(join(tmpdir(), "theta-batch-plan-live-"));
    try {
      put(cwd, ".gitignore", ".pi/tmp/\n/.trees/\n");
      put(cwd, "AGENTS.md", "Preserve established invoice contracts, tests and independent gates. Existing pending owner choices are not delegated: do not make them provisionally. Read-only planning; no fixes, commits, network or shipping.\n");
      put(cwd, "docs/spec_topics/invoice.md", "# Invoice contracts\nnormalize clamps negative quantities to zero; subtotal sums normalized quantities; maxItem returns the greatest input (zero for empty). Void-fee policy has no established rule and is pending owner choice.\n");
      put(cwd, "src/invoice.cjs", [
        "exports.normalize = n => n;",
        "exports.subtotal = items => items.reduce((sum, n) => sum + n, 0);",
        "exports.maxItem = items => items.length ? items[items.length - 1] : 0;",
        "exports.voidFee = () => 5;", "",
      ].join("\n"));
      put(cwd, "tests/invoice.test.cjs", "const assert = require('node:assert/strict');\nconst invoice = require('../src/invoice.cjs');\nassert.equal(invoice.normalize(2), 2);\nassert.equal(invoice.subtotal([2, 3]), 5);\nassert.equal(invoice.maxItem([]), 0);\n");
      put(cwd, "docs/bugs/0001-negative-normalization.md", "# Negative quantities are not normalized\n- **Status:** open\n\nsrc/invoice.cjs normalize(-2) returns -2 but docs/spec_topics/invoice.md requires zero. Fix the shared normalization function and add a negative control in tests/invoice.test.cjs. No policy decision or external prerequisite.\n");
      put(cwd, "docs/bugs/0002-subtotal-bypasses-normalization.md", "# Subtotal bypasses normalization\n- **Status:** open\n\nsrc/invoice.cjs subtotal([3,-2]) returns 1 instead of 3. Correct subtotal to use the shared normalize function, with tests/invoice.test.cjs regression. Correctness prerequisite: bug 0001 must be fixed first because the shared normalizer currently returns negative inputs unchanged. This bug remains eligible once 0001 integrates; no other prerequisite.\n");
      put(cwd, "docs/bugs/0003-void-fee-policy.md", "# Void fee needs policy choice\n- **Status:** open — pending owner decision\n\nPENDING OWNER CHOICE: choose whether a voided invoice incurs the existing fee or no fee. Both compatibility and customer fairness matter; owner has explicitly not chosen and implementation is ON HOLD until that choice is recorded. src/invoice.cjs voidFee and docs/spec_topics/invoice.md describe the unresolved policy. Astra provisional authority for new questions does not settle this already-filed choice.\n");
      put(cwd, "docs/bugs/0004-max-item.md", "# Maximum is the last item\n- **Status:** open\n\nsrc/invoice.cjs maxItem([9,2]) returns 2 instead of 9 under docs/spec_topics/invoice.md. Replace the last-item operation with an actual maximum and add tests/invoice.test.cjs regression. Independent of normalize/subtotal and the void-fee policy: no correctness prerequisites, only shared edit paths with 0001/0002.\n");
      const theta = installProbe(cwd, "plan");
      init(cwd);
      const head = git(cwd, "rev-parse", "HEAD");
      const run = invoke(cwd, batchHelper, "start");
      const context = invoke(cwd, batchHelper, "catalog", run);
      const catalogBytes = readFileSync(context);
      const snapshots = json(context).reports.map((report: { snapshot: string }) => [report.snapshot, readFileSync(report.snapshot)] as const);
      const actual = await drive(cwd, theta, "plan", context) as Plan;
      expect(actual.bugs.map(bug => bug.id).sort()).toEqual(["0001", "0002", "0003", "0004"]);
      expect(new Set(actual.bugs.map(bug => bug.id)).size).toBe(4);
      const byId = Object.fromEntries(actual.bugs.map(bug => [bug.id, bug]));
      for (const id of ["0001", "0002", "0004"]) {
        const bug = byId[id]!; // Complete unique id set asserted immediately above.
        expect(bug.ready, JSON.stringify(actual)).toBe(true);
        expect(bug.reason.trim().length).toBeGreaterThan(0);
        expect(predicts(bug, "src/invoice.cjs"), JSON.stringify(bug)).toBe(true);
        expect(predicts(bug, "tests/invoice.test.cjs"), JSON.stringify(bug)).toBe(true);
      }
      expect(byId["0002"]!.dependencies).toEqual(["0001"]);
      expect(byId["0001"]!.dependencies).toEqual([]);
      expect(byId["0004"]!.dependencies).toEqual([]);
      expect(byId["0003"]!.ready, JSON.stringify(actual)).toBe(false);
      expect(byId["0003"]!.reason).toMatch(/owner|policy|choice|hold|decision/i);
      expect(actual.guidance.length).toBeGreaterThan(0);
      expect(actual.guidance.join(" ")).toMatch(/overlap|shared|conflict/i);
      expect(readFileSync(context)).toEqual(catalogBytes);
      for (const [path, bytes] of snapshots) expect(readFileSync(path)).toEqual(bytes);
      expect(git(cwd, "rev-parse", "HEAD")).toBe(head);
      expect(git(cwd, "status", "--porcelain")).toBe("");
      // Consume the ACTUAL model plan through the production validator and
      // scheduler. No canned planner verdict, priority sorting or fake runner.
      writeFileSync(join(run, "plan.json"), JSON.stringify(actual));
      expect(invoke(cwd, batchHelper, "plan", run)).toBe("PASS");
      const jobs = invoke(cwd, batchHelper, "next", run).split("\n").map(path => json(path).id);
      expect(jobs.sort()).toEqual(["0001", "0004"]);
      expect(json(join(run, "state.json")).outcomes["0003"].status).toBe("excluded");
      expect(git(cwd, "rev-parse", "HEAD")).toBe(head);
      expect(git(cwd, "status", "--porcelain")).toBe("");
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 240000);

  it("merges two same-wave fixes with a real source conflict, preserves both regressions, and runs fresh mandatory merged-tree gates before controller promotion", async () => {
    await requireAstra();
    const cwd = mkdtempSync(join(tmpdir(), "theta-batch-merge-live-"));
    try {
      put(cwd, ".gitignore", ".pi/tmp/\n/.trees/\n");
      put(cwd, "AGENTS.md", [
        "# Small formatter project",
        "Preserve the established format contract: null/undefined label becomes empty string; negative count becomes zero; valid labels/counts are unchanged.",
        "Both behaviors are mandatory and independent. No owner decision, policy tradeoff or specification change is needed.",
        "Keep all existing tests and original witness/red files unchanged. No new dependency, external communication or weakened test assertion.",
        "Use the controller integration gate after committing the merged result. Only the controller may promote main or push to this fixture's local origin.", "",
      ].join("\n"));
      put(cwd, "docs/spec_topics/format.md", "# Formatter\nformat(label,count) returns label:count. Null and undefined labels become empty strings, negative counts become zero. Other labels/counts preserve their values. These are existing approved requirements, not new policy.\n");
      put(cwd, "src/format.cjs", "exports.format = (label, count) => `${label}:${count}`;\n");
      put(cwd, "tests/controls.test.cjs", [
        "const test = require('node:test');",
        "const assert = require('node:assert/strict');",
        "const { format } = require('../src/format.cjs');",
        "test('positive input control', () => assert.equal(format('hello', 3), 'hello:3'));",
        "test('zero count and empty label controls', () => assert.equal(format('', 0), ':0'));", "",
      ].join("\n"));
      // Real syntax checks and Node's real assertion runner, never exit(0)
      // placeholders masquerading as mandatory typecheck/test correctness.
      put(cwd, "package.json", JSON.stringify({ name: "bounded-live-format-fixture", private: true, scripts: {
        typecheck: "node --check src/format.cjs && node --check tests/controls.test.cjs",
        test: "node --test tests/*.test.cjs",
      } }));
      const reports = ["0001-null-label", "0002-negative-count"];
      for (const name of reports) put(cwd, "docs/bugs/" + name + ".md", "# " + name + "\n- **Status:** open\n\nFix the existing " + name + " formatter contract in src/format.cjs and add its independent regression. No prerequisite or pending owner decision.\n");
      const theta = installProbe(cwd, "merge");
      init(cwd);
      const initial = git(cwd, "rev-parse", "HEAD");
      const bare = join(cwd, ".pi/tmp/origin.git");
      git(cwd, "init", "--bare", bare); git(cwd, "remote", "add", "origin", bare); git(cwd, "push", "origin", "main");
      const run = invoke(cwd, batchHelper, "start");
      invoke(cwd, batchHelper, "catalog", run);
      // Scheduling is deterministic fixture setup here; readiness itself is
      // exercised with the actual production planner in the preceding test.
      writeFileSync(join(run, "plan.json"), JSON.stringify({ bugs: reports.map(name => ({
        id: name.slice(0, 4), ready: true, reason: "Established independent formatter contract", dependencies: [],
        files: ["src/format.cjs", "tests/" + name + ".test.cjs"],
      })), guidance: ["Independent fixes overlap on one source line; preserve both during integration."] }));
      expect(invoke(cwd, batchHelper, "plan", run)).toBe("PASS");
      const manifests = invoke(cwd, batchHelper, "next", run).split("\n");
      expect(manifests.map(path => json(path).id)).toEqual(["0001", "0002"]);
      const sources = manifests.map((manifest, index) => {
        const id = reports[index]!.slice(0, 4);
        const request = join(run, "request-" + id + ".txt");
        writeFileSync(request, "batch " + manifest);
        const sourceRun = invoke(cwd, runHelper, "start-file", request, String(process.pid));
        const source = json(join(sourceRun, "state.json"));
        expect(source.root).toBe(join(cwd, ".trees", basename(sourceRun)));
        expect(git(cwd, "check-ignore", source.root)).toBe(source.root);
        expect(existsSync(join(sourceRun, "worktree"))).toBe(false);
        const signature = index === 0 ? "NULL_LABEL expected :2" : "NEGATIVE_COUNT expected x:0";
        const expression = index === 0 ? "format(null,2), ':2'" : "format('x',-2), 'x:0'";
        const argv = [process.execPath, "-e", "const assert = require('node:assert/strict');const { format } = require('./src/format.cjs');assert.equal(" + expression + ", '" + signature + "');"];
        const manifestPath = join(sourceRun, "witnesses.json");
        writeFileSync(manifestPath, JSON.stringify({
          e2e: [{ argv, failure_pattern: signature }], unit: [],
          unit_omission_reason: "The one exported formatter is the complete external boundary; the independent CLI assertion directly exercises it.",
          live_required: false, live: [],
        }));
        expect(invoke(cwd, runHelper, "red", sourceRun)).toBe("PASS");
        expect(json(join(sourceRun, "red-0.json")).code).not.toBe(0);
        put(source.root, "src/format.cjs", index === 0
          ? "exports.format = (label, count) => `${label ?? ''}:${count}`;\n"
          : "exports.format = (label, count) => `${label}:${Math.max(0, count)}`;\n");
        const regression = [
          "const test = require('node:test');", "const assert = require('node:assert/strict');",
          "const { format } = require('../src/format.cjs');",
          "test('" + signature + "', () => assert.equal(" + expression + "));", "",
        ].join("\n");
        const testPath = "tests/" + reports[index] + ".test.cjs";
        put(source.root, testPath, regression);
        put(source.root, "docs/bugs/" + reports[index] + ".md", "# " + reports[index] + "\n- **Status:** fixed\n\nEstablished formatter contract restored; independent CLI red and final green retained in the run.\n");
        put(sourceRun, "plan.md", "Fix only " + reports[index] + " in src/format.cjs and add " + testPath + ". Preserve positive/zero controls and the other formatter contract. No specification or policy change.\n");
        expect(invoke(cwd, runHelper, "gate", sourceRun, "final")).toBe("PASS");
        expect(invoke(cwd, runHelper, "snapshot", sourceRun)).toBe("PASS");
        // Fixture source branches are prepared by this test, not represented as
        // live implementation workers. Their retained review describes the
        // exact source diff and genuine red/green evidence checked above.
        const findings = "CLEAN — fixture source review: only the named formatter operand and new independent assertion changed; established controls retained; original CLI red precedes the fix and real node syntax/test gates pass.";
        put(sourceRun, "final-review.md", findings);
        put(sourceRun, "final-review-result.json", JSON.stringify({ ok: true, findings }));
        expect(invoke(cwd, runHelper, "final-review-record", sourceRun)).toBe("PASS");
        expect(invoke(cwd, runHelper, "pause", sourceRun)).toBe("PASS");
        return { id, run: sourceRun, root: source.root as string, testPath, regression,
          witness: readFileSync(manifestPath), red: readFileSync(join(sourceRun, "red-0.json")) };
      });
      let previousMain = initial;
      for (const [index, source] of sources.entries()) {
        const collected = invoke(cwd, batchHelper, "collect", run, source.id);
        expect(collected, JSON.stringify(json(join(run, "state.json")), null, 2)).toBe("VERIFIED");
        const contextPath = invoke(cwd, batchHelper, "integration-start", run, source.id);
        const contextBytes = readFileSync(contextPath);
        const ctx = json(contextPath);
        expect(ctx.root).toBe(join(cwd, ".trees", basename(run) + "-integrate-" + source.id));
        expect(git(cwd, "check-ignore", ctx.root)).toBe(ctx.root);
        expect(ctx.reportDirectory.startsWith(run + "/")).toBe(true);
        expect(ctx.base).toBe(previousMain);
        if (index === 1) {
          // Probe without starting/aborting a merge: these actual branch tips
          // MUST conflict in source, so a green verdict proves real resolution.
          const conflict = spawnSync("git", ["merge-tree", "--write-tree", ctx.base, ctx.sourceSha], { cwd, encoding: "utf8" });
          expect(conflict.status, conflict.stderr + conflict.stdout).toBe(1);
          expect(conflict.stdout).toContain("CONFLICT (content): Merge conflict in src/format.cjs");
        }
        const actual = await drive(cwd, theta, "merge", contextPath) as { ok: boolean; findings: string };
        expect(actual.ok, actual.findings).toBe(true);
        expect(actual.findings.trim().length).toBeGreaterThan(0);
        expect(actual.findings).toMatch(/gate|verif|test|PASS/i);
        expect(readFileSync(contextPath)).toEqual(contextBytes);
        expect(git(cwd, "rev-parse", "HEAD")).toBe(previousMain);
        expect(git(cwd, "status", "--porcelain")).toBe("");
        expect(git(ctx.root, "status", "--porcelain")).toBe("");
        const merged = git(ctx.root, "rev-parse", "HEAD");
        git(ctx.root, "merge-base", "--is-ancestor", ctx.base, merged);
        git(ctx.root, "merge-base", "--is-ancestor", ctx.sourceSha, merged);
        const gate = json(ctx.gatePath);
        expect(gate.sha).toBe(merged);
        expect(gate.commands.slice(0, 2)).toEqual([["npm", "run", "typecheck"], ["npm", "test"]]);
        expect(gate.commands.length).toBe(index === 0 ? 3 : 4);
        expect(gate.results).toHaveLength(gate.commands.length);
        for (const proof of gate.results) {
          expect(json(proof.path).code, proof.path).toBe(0);
          expect(json(proof.path).argv).toEqual(gate.commands[gate.results.indexOf(proof)]);
        }
        for (const retained of sources.slice(0, index + 1)) {
          expect(readFileSync(join(ctx.root, retained.testPath), "utf8")).toBe(retained.regression);
          expect(readFileSync(join(retained.run, "witnesses.json"))).toEqual(retained.witness);
          expect(readFileSync(join(retained.run, "red-0.json"))).toEqual(retained.red);
        }
        // Persist ONLY the actual typed production worker verdict. The real
        // controller verifies the fresh gated SHA before push/main promotion.
        writeFileSync(ctx.verdictPath, JSON.stringify(actual));
        expect(invoke(cwd, batchHelper, "integrate-record", run, source.id)).toBe("PASS");
        expect(git(cwd, "rev-parse", "HEAD")).toBe(merged);
        expect(git(bare, "rev-parse", "refs/heads/main")).toBe(merged);
        expect(existsSync(ctx.root)).toBe(false);
        expect(existsSync(source.root)).toBe(false);
        expect(existsSync(source.run)).toBe(true);
        expect(existsSync(contextPath)).toBe(true);
        const worktrees = git(cwd, "worktree", "list", "--porcelain");
        expect(worktrees).not.toContain(ctx.root);
        expect(worktrees).not.toContain(source.root);
        for (const pending of sources.slice(index + 1)) {
          expect(existsSync(pending.root)).toBe(true);
          expect(worktrees).toContain(pending.root);
        }
        previousMain = merged;
      }
      const combined = spawnSync(process.execPath, ["-e", "const assert=require('node:assert/strict');const {format}=require('./src/format.cjs');assert.equal(format(null,-2),':0');assert.equal(format(undefined,-1),':0');assert.equal(format('hello',3),'hello:3');"], { cwd, encoding: "utf8" });
      expect(combined.status, combined.stderr + combined.stdout).toBe(0);
      expect(invoke(cwd, batchHelper, "next", run)).toBe("DONE");
      expect(invoke(cwd, batchHelper, "finish", run)).toBe("PASS");
      expect(json(join(run, "state.json")).finished).toBe(true);
      expect(git(cwd, "status", "--porcelain")).toBe("");
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 720000);
});
