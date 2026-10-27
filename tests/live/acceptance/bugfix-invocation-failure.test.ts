// F011: real pi host + shipped fix-bug workflow/controller in a disposable repo.
// Only the FINAL reviewer spends tokens: a tiny typed arithmetic query proves a
// configured OpenAI turn completed before a missing-file tool prevents its root
// Review return. This is NOT a production semantic bug review. Earlier stages
// and reviews are deterministic fixtures; red witnesses and npm gates are real.
// No retained operator run, shipment, mock credentials, or model substitution.
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { parseThetaDocument } from "../../../src/parser/theta-document";
import { parseDeps } from "../../helpers/e2e-s1";
import { resolveAcceptanceHost, spawnPiPrint, type PiPrintResult } from "./harness";
// @ts-expect-error plain ESM controller
import { projectJobProgress } from "../../../tools/bugfix/batch.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const load = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const thetaValue = (schema: string, fields: Record<string, string>) => schema + " { "
  + Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(", ") + " }";

function stageFixture(): string {
  const schema = readFileSync(join(root, ".pi", "theta", "workers", "bugfix-stage.theta"), "utf8")
    .match(/schema BugStage \{[^}]+\}/)?.[0];
  if (!schema) throw new Error("Missing production BugStage schema");
  const manifest = {
    e2e: [{ argv: ["node", "tests/value.cjs"], failure_pattern: "F011 witness: expected 2, got 1" }],
    unit: [], unit_omission_reason: "One dependency-free acceptance witness covers the fixture change.",
    live_required: false, live: [],
  };
  return [
    "---", "mode: subagent", "tools: read, write, bash", "params:",
    "  run_dir: string", "  phase: string", "  feedback: string", "---", schema,
    'write({ path: run_dir + "/" + phase + ".md", content: "Deterministic F011 acceptance stage: " + phase })?',
    'if phase == "reproduce" {',
    `  write({ path: run_dir + "/witnesses.json", content: ${JSON.stringify(JSON.stringify(manifest))} })?`,
    "}",
    'if phase == "plan" { write({ path: run_dir + "/spec-proposal.md", content: "No specification change needed." })? }',
    'if phase == "implement" { write({ path: "src/value.cjs", content: "module.exports = 2;\\n" })? }',
    thetaValue("BugStage", {
      status: "pass", summary: "Fixture stage passed.", environment: "Dependency-free local fixture.",
      bug_validity: "See real pinned red witness.", fixability: "Fixture value corrected locally.",
      progress: "Fixture stage complete; controller owns gates and review authority.",
      next_action: "Continue mandatory workflow checkpoints.", recommendation: "Preserve original evidence.",
    }), "",
  ].join("\n");
}

function reviewerFixture(model: string): string {
  return [
    "---", "mode: subagent", `model: ${model}`, "thinking: minimal", "tools: read, write", "params:",
    "  run_dir: string", "  focus: string", "---",
    "schema Review { ok: boolean, findings: string }",
    "schema Arithmetic { answer: string }",
    'if focus == "final" {',
    '  let allowed = match read({ path: run_dir + "/review-retry-allow.txt" }) { Ok(text) => text, Err(_) => "no" }',
    '  let attempt = allowed == "yes" ? "resumed" : "failed"',
    '  let arithmetic: Arithmetic = @`What is 263 plus 514? Put the sum as decimal digits in the answer field.`?',
    // Written ONLY after the actual live typed-query result. No assistant echo
    // or a fixture-provided answer can satisfy this witness.
    `  write({ path: run_dir + "/provider-turn-" + attempt + ".json", content: "{\\"providerModel\\":\\"${model}\\",\\"answer\\":\\"" + arithmetic.answer + "\\"}" })?`,
    '  if allowed != "yes" { read({ path: run_dir + "/missing-final-review-return.txt" })? }',
    "}",
    'Review { ok: true, findings: "CLEAN — F011 control-flow fixture, not a semantic bug review" }', "",
  ].join("\n");
}

function cleanHost(result: PiPrintResult): void {
  expect(result.exitCode, result.stderr + "\n" + result.stdout).toBe(0);
  expect(result.stderr).toBe("");
  // Check the COMPLETE stream, not only message_end events: the prompt-mode
  // outer host must not inherit a worker's authenticated theta_result regime.
  expect(result.stdout).not.toContain('"theta_result"');
  expect(result.stdout).not.toContain('"theta-system-note"');
}

it("F011 durably blocks a live final-review invocation failure and resumes the SAME source with fresh gates/review", async () => {
  const host = await resolveAcceptanceHost(); // loud credential/model precondition, never a skip
  expect(host.provider).toBe("openai");
  const model = `${host.provider}/${host.model}`;
  mkdirSync(join(root, ".pi/tmp"), { recursive: true });
  const evidence = mkdtempSync(join(root, ".pi/tmp/f011-live-evidence-"));
  const cwd = mkdtempSync(join(tmpdir(), "f011-live-disposable-"));
  console.info(`F011 private evidence: ${evidence}`);
  writeFileSync(join(evidence, "scope.txt"), `Disposable source: ${cwd}\nModel: ${model}\nTiny arithmetic reviewer; NOT a production semantic bug review.\n`);
  const theta = join(cwd, ".pi", "theta");
  let run: string | undefined;
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 15000 });
    appendFileSync(join(evidence, "git.log"), JSON.stringify({ args, status: result.status, stdout: result.stdout, stderr: result.stderr }) + "\n");
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  const launch = async (label: string, request: string) => {
    // Harness scrubs inherited worker control-plane keys and pins BOTH the
    // outer extension and all production invoke children to THIS checkout.
    const result = await spawnPiPrint({
      cwd, thetaDir: theta, extraThetaDirs: [join(theta, "workers")],
      slashInvocation: `/fix-bug ${request}`,
      extraArgs: ["--mode", "json", "--no-session"], abortAfterMs: 110000,
    });
    writeFileSync(join(evidence, `${label}.stdout.jsonl`), result.stdout);
    writeFileSync(join(evidence, `${label}.stderr.log`), result.stderr);
    writeFileSync(join(evidence, `${label}.exit.json`), JSON.stringify({ exitCode: result.exitCode }));
    const owner = join(cwd, ".pi/tmp/fix-bug.lock/owner.json");
    if (!run && existsSync(owner)) run = load(owner).run;
    if (run) cpSync(run, join(evidence, `${label}-run`), { recursive: true });
    cleanHost(result);
    return result;
  };
  try {
    for (const folder of [join(".pi", "theta", "workers"), "tools/bugfix", "docs/bugs", "src", "tests", ".pi/tmp"]) mkdirSync(join(cwd, folder), { recursive: true });
    writeFileSync(join(cwd, ".gitignore"), ".pi/tmp/\n/.trees/\n");
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "f011-disposable", private: true, scripts: {
      typecheck: "node --check src/value.cjs", test: "node tests/value.cjs",
    } }));
    writeFileSync(join(cwd, "src/value.cjs"), "module.exports = 1;\n");
    writeFileSync(join(cwd, "tests/value.cjs"), "const value = require('../src/value.cjs');\nrequire('node:assert/strict').equal(value, 2, 'F011 witness: expected 2, got 1');\n");
    writeFileSync(join(cwd, "docs/bugs/0001-example.md"), "# Fixture bug\n- **Status:** open\n\nValue is 1, expected 2.\n");
    // Production workflow and controller bytes are copied, never edited here.
    const workflow = readFileSync(join(root, ".pi", "theta", "fix-bug.theta"), "utf8");
    writeFileSync(join(theta, "fix-bug.theta"), workflow);
    for (const name of ["run.mjs", "atomic-record.mjs", "worktree-env.mjs", "update-pi-config.mjs"]) copyFileSync(join(root, "tools/bugfix", name), join(cwd, "tools/bugfix", name));
    for (const name of ["bugfix-rank.theta", "bugfix-decide.theta"]) copyFileSync(join(root, ".pi", "theta", "workers", name), join(theta, "workers", name));
    writeFileSync(join(theta, "workers/bugfix-stage.theta"), stageFixture());
    writeFileSync(join(theta, "workers/bugfix-review.theta"), reviewerFixture(model));
    for (const name of ["fix-bug.theta", "workers/bugfix-stage.theta", "workers/bugfix-review.theta", "workers/bugfix-rank.theta", "workers/bugfix-decide.theta"]) {
      const path = join(theta, name);
      const doc = parseThetaDocument({ path, bytes: new Uint8Array(readFileSync(path)) }, parseDeps());
      expect(doc.diagnostics, path).toEqual([]);
    }
    git("init", "-b", "main"); git("config", "user.email", "f011@example.invalid"); git("config", "user.name", "F011 Fixture");
    git("add", "."); git("commit", "-m", "Disposable F011 fixture");
    const base = git("rev-parse", "HEAD");
    const first = await launch("failure", "1 ship false review_rounds 1");
    // Red direction of the complete-stream assertions, without another provider
    // turn: injected wire envelopes/notes must fail even outside message_end.
    for (const fault of ['{"theta_result":{"v":1,"ok":"unexpected"}}', '{"customType":"theta-system-note"}']) {
      expect(() => cleanHost({ ...first, stdout: first.stdout + "\n" + fault })).toThrow();
    }
    expect(first.stdout).toContain("missing-final-review-return.txt");
    expect(first.stdout).not.toContain("VERIFIED, NOT SHIPPED");
    expect(run, "production workflow must allocate a source run").toBeTruthy();
    const sourceRun = run!;
    const before = load(join(sourceRun, "state.json"));
    expect(before.lastTransition).toMatchObject({ kind: "invocation", phase: "final", status: "blocked", summary: expect.stringContaining("INVOCATION FAILURE") });
    expect(before.lastTransition.summary).toContain("missing-final-review-return.txt");
    expect(before.finalReviewDigest).toBeUndefined();
    expect(before.finalReviewCheckoutDigest).toBeUndefined();
    expect(existsSync(join(sourceRun, "final-review-result.json"))).toBe(false);
    expect(existsSync(join(sourceRun, "final-review.md"))).toBe(false);
    expect(before.decisions ?? []).toEqual([]);
    expect(before.stages).toEqual(["red", "gate-initial", "gate-final"]);
    expect(before.checkpoints.close.status).toBe("pass");
    for (const phase of ["evidence", "fix"]) expect(load(join(sourceRun, `${phase}-review-result.json`)).ok).toBe(true);
    expect(load(join(sourceRun, "provider-turn-failed.json"))).toEqual({ providerModel: model, answer: "777" });
    const red = readFileSync(join(sourceRun, "red-0.json"));
    expect(JSON.parse(red.toString())).toMatchObject({ argv: ["node", "tests/value.cjs"], code: 1, output: expect.stringContaining("F011 witness: expected 2, got 1") });
    expect(before.verifiedGateDigest).toBeTruthy();
    const gateFiles: string[] = before.verifiedGateFiles;
    expect(gateFiles.filter(name => /^gate-\d+-final-\d+\.json$/.test(name))).toHaveLength(2);
    const preserved = new Map(gateFiles.map(name => [name, readFileSync(join(sourceRun, name))]));
    for (const name of gateFiles) expect(load(join(sourceRun, name)).code, name).toBe(0);
    expect(load(join(sourceRun, `gate-${before.gateCount}-final-0.json`)).argv).toEqual(["npm", "run", "typecheck"]);
    expect(load(join(sourceRun, `gate-${before.gateCount}-final-1.json`)).argv).toEqual(["npm", "test"]);
    const failedTicket = before.currentReviewInvocations.final;
    const failedEntry = before.reviewInvocations[failedTicket];
    expect(failedEntry.status).toBe("failed");
    const failure = readFileSync(failedEntry.failurePath);
    const context = readFileSync(join(sourceRun, failedTicket));
    expect(JSON.parse(failure.toString())).toMatchObject({ contextPath: join(sourceRun, failedTicket), message: expect.stringContaining("missing-final-review-return.txt") });
    expect(existsSync(join(sourceRun, failedTicket + ".result.json"))).toBe(false);
    const progress = projectJobProgress({ sourceRun, status: "blocked" }, before);
    writeFileSync(join(evidence, "batch-projection.json"), JSON.stringify(progress, null, 2));
    expect(progress).toMatchObject({ execution: "blocked", verification: "incomplete", shipmentState: "not-attempted" });
    expect(progress.immediateBlocker).toContain("final/blocked: INVOCATION FAILURE");
    expect(progress.nextAction).toContain("launch/transport");
    expect(progress.immediateBlocker).not.toContain("Mandatory witness");
    expect(load(join(cwd, ".pi/tmp/fix-bug.lock/owner.json")).run).toBe(sourceRun);
    expect(existsSync(join(sourceRun, "active"))).toBe(false);
    expect(existsSync(join(sourceRun, "shipment.json"))).toBe(false);
    expect(git("rev-parse", "refs/heads/main")).toBe(base);
    expect(git("status", "--porcelain")).toBe("");

    // Enable ONLY the disposable reviewer's return. Supported resume of the
    // original source must reuse immutable red proof, not create another run.
    writeFileSync(join(sourceRun, "review-retry-allow.txt"), "yes");
    const resumed = await launch("resume", "resume");
    expect(resumed.stdout).toContain("resuming recorded checkpoints");
    expect(resumed.stdout).toContain("VERIFIED, NOT SHIPPED");
    const after = load(join(sourceRun, "state.json"));
    expect(after.root).toBe(before.root); expect(after.branch).toBe(before.branch);
    expect(after.resumeCount).toBe(1);
    expect(after.gateCount).toBeGreaterThan(before.gateCount);
    expect(after.lastTransition).toMatchObject({ kind: "review", phase: "final", status: "pass" });
    expect(after.finalReviewDigest).toBeTruthy();
    expect(after.currentReviewInvocations.final).not.toBe(failedTicket);
    expect(after.reviewInvocations[after.currentReviewInvocations.final]).toMatchObject({ phase: "final", status: "returned", attempt: failedEntry.attempt + 1 });
    expect(load(join(sourceRun, "provider-turn-resumed.json"))).toEqual({ providerModel: model, answer: "777" });
    expect(load(join(sourceRun, "final-review-result.json"))).toMatchObject({ ok: true, findings: expect.stringContaining("not a semantic bug review") });
    expect(existsSync(join(sourceRun, after.currentReviewInvocations.final + ".result.json"))).toBe(true);
    for (const name of after.verifiedGateFiles) {
      expect(gateFiles).not.toContain(name);
      expect(load(join(sourceRun, name)).code, name).toBe(0);
    }
    for (const [name, bytes] of preserved) expect(readFileSync(join(sourceRun, name)).equals(bytes), name).toBe(true);
    expect(readFileSync(join(sourceRun, "red-0.json")).equals(red)).toBe(true);
    for (const [ticket, entry] of Object.entries(before.reviewInvocations)) expect(after.reviewInvocations[ticket]).toEqual(entry);
    expect(readFileSync(failedEntry.failurePath).equals(failure)).toBe(true);
    expect(readFileSync(join(sourceRun, failedTicket)).equals(context)).toBe(true);
    expect(existsSync(join(sourceRun, failedTicket + ".result.json"))).toBe(false);
    expect(existsSync(join(cwd, ".pi/tmp/fix-bug.lock"))).toBe(false); // released only AFTER verified local handoff
    expect(existsSync(join(sourceRun, "shipment.json"))).toBe(false);
    expect(git("rev-parse", "refs/heads/main")).toBe(base);
    expect(git("status", "--porcelain")).toBe("");
    expect(readFileSync(join(after.root, "src/value.cjs"), "utf8")).toBe("module.exports = 2;\n");
  } finally {
    // Keep raw stdout/stderr and state/proof snapshots even on assertion reds;
    // delete only this invocation's disposable repo, never retained operator work.
    if (run && existsSync(run)) cpSync(run, join(evidence, "settled-run"), { recursive: true });
    if (existsSync(theta)) cpSync(theta, join(evidence, "fixture-theta"), { recursive: true });
    rmSync(cwd, { recursive: true, force: true });
  }
}, 240000);
