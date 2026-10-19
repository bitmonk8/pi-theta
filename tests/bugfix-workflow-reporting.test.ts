// Real CLI + workflow + real subagent process, but no provider requests:
// only the worker's task is replaced with a deterministic blocked result.
import { describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { topLevelThetaHostEnv } from "./helpers/top-level-theta-env";

const root = process.cwd();
const cli = process.env.PI_THETA_TEST_PI_CLI ?? join(root, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
function probe(args: string, workflow = readFileSync(join(root, ".pi", "theta", "fix-bug.theta"), "utf8")) {
  const cwd = mkdtempSync(join(tmpdir(), "bugfix-report-"));
  const theta = join(cwd, ".pi/theta");
  const agent = join(cwd, "agent");
  mkdirSync(join(theta, "workers"), { recursive: true });
  mkdirSync(join(cwd, "tools/bugfix"), { recursive: true });
  mkdirSync(join(cwd, "docs/bugs"), { recursive: true });
  mkdirSync(agent);
  mkdirSync(join(cwd, ".pi/tmp"));
  writeFileSync(join(cwd, "question.mjs"), 'export default function(pi) { pi.registerTool({ name: "question", label: "Question", description: "Must not be called in this probe", parameters: {type:"object", properties:{}}, async execute() { throw new Error("Unexpected approval request"); } }); }\n');
  writeFileSync(join(agent, "auth.json"), JSON.stringify({ openai: { type: "api_key", key: "pi-theta-no-network" } }));
  writeFileSync(join(agent, "settings.json"), JSON.stringify({ defaultProvider: "openai", defaultModel: "gpt-5.5", defaultProjectTrust: "always", theta: { binderModel: "openai/gpt-5.5" } }));
  writeFileSync(join(cwd, ".gitignore"), "agent/\n.pi/tmp/\n");
  writeFileSync(join(cwd, "docs/bugs/0001-example.md"), "# Example\n- **Status:** open\n");
  writeFileSync(join(theta, "fix-bug.theta"), workflow);
  copyFileSync(join(root, "tools/bugfix/run.mjs"), join(cwd, "tools/bugfix/run.mjs"));
  writeFileSync(join(theta, "workers/bugfix-stage.theta"), [
    "---", "mode: subagent", "params:", "  run_dir: string", "  phase: string", "  feedback: string", "---",
    'schema BugStage { status: "pass" | "blocked" | "not_reproduced" | "needs_spec", summary: string }',
    'BugStage { status: "blocked", summary: "LIVE_HOST_BLOCKED: test SDK cannot use stored OAuth" }', "",
  ].join("\n"));
  writeFileSync(join(theta, "workers/bugfix-review.theta"), '---\nmode: subagent\nparams:\n  run_dir: string\n  phase: string\n---\nschema Review { ok: boolean, findings: string }\nReview { ok: true, findings: "review must not run" }\n');
  try {
    for (const command of [["init", "-b", "main"], ["config", "user.email", "test@example.invalid"], ["config", "user.name", "Test"], ["add", "."], ["commit", "-m", "fixture"]]) {
      const r = spawnSync("git", command, { cwd, encoding: "utf8" });
      expect(r.status, r.stderr).toBe(0);
    }
    const result = spawnSync(process.execPath, [cli, "-ne", "-e", join(cwd, "question.mjs"), "-e", join(root, "extensions"), "--theta", theta, "--theta", join(theta, "workers"), "--session", join(cwd, ".pi/tmp/session.jsonl"), "-p", "/fix-bug" + (args ? " " + args : "")], {
      cwd, encoding: "utf8", timeout: 45000,
      env: topLevelThetaHostEnv(process.env, join(root, "extensions"), process.pid, {
        PI_OFFLINE: "1", PI_CODING_AGENT_DIR: agent,
      }),
    });
    return result;
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

describe("fix-bug completion reporting through the real host", () => {
  it("displays a blocked worker's reason and artifact location in the parent", () => {
    const result = probe("1");
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Bug 0001: reproduction started. Artifacts:");
    expect(result.stdout).toContain("STOP: LIVE_HOST_BLOCKED: test SDK cannot use stored OAuth — artifacts:");
    expect(result.stdout).toContain("/.pi/tmp/fix-bug-");
  }, 60000);

  it("red-direction control: returning the same STOP value alone is invisible", () => {
    const source = readFileSync(join(root, ".pi", "theta", "fix-bug.theta"), "utf8");
    expect(source.match(/theta_print\(\{ text: summary \}\)\?/g)).toHaveLength(1);
    const result = probe("1", source.replace("theta_print({ text: summary })?", ""));
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("reproduction started");
    expect(result.stdout).not.toContain("STOP:");
    expect(result.stdout).not.toContain("LIVE_HOST_BLOCKED");
  }, 60000);

  it("reports invalid arguments before any worker is launched", () => {
    const result = probe("1 ship maybe");
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("STOP: invalid arguments.");
    expect(result.stdout).not.toContain("reproduction started");
  }, 60000);

  it("prints the listing exactly once", () => {
    const result = probe("");
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr + "\n" + result.stdout).toBe(0);
    expect(result.stdout).toBe("0001 example\n");
  }, 60000);
});
