// Real no-argument workflow + real ranking worker/provider. Only model metadata
// is host-bound; the assessment prompt, schemas, catalog and display are shipped code.
import { describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseSystemNoteCodes, resolveAcceptanceHost, spawnPiPrint } from "./harness";

const root = process.cwd();
function git(cwd: string, ...args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
}

describe("live /fix-bug impact-ranked listing", () => {
  it("ranks actual impact above filed labels and does not requeue a resolved prerequisite", async () => {
    const host = await resolveAcceptanceHost(); // loud precondition, never skip
    const cwd = mkdtempSync(join(tmpdir(), "theta-priority-live-"));
    const theta = join(cwd, ".pi/theta");
    mkdirSync(join(theta, "workers"), { recursive: true });
    mkdirSync(join(cwd, "tools/bugfix"), { recursive: true });
    mkdirSync(join(cwd, "docs/bugs"), { recursive: true });
    mkdirSync(join(cwd, ".pi/tmp"), { recursive: true });
    writeFileSync(join(cwd, ".gitignore"), ".pi/tmp/\n");
    writeFileSync(join(cwd, "question.mjs"), 'export default function(pi) { pi.registerTool({ name:"question", label:"Question", description:"Must not run for listing", parameters:{type:"object",properties:{}}, async execute(){throw new Error("Listing must not request approval");} }); }\n');
    copyFileSync(join(root, ".pi", "theta", "fix-bug.theta"), join(theta, "fix-bug.theta"));
    copyFileSync(join(root, "tools/bugfix/run.mjs"), join(cwd, "tools/bugfix/run.mjs"));
    const rank = readFileSync(join(root, ".pi", "theta", "workers", "bugfix-rank.theta"), "utf8");
    expect(rank.match(/^model:.*$/gm)).toHaveLength(1);
    writeFileSync(join(theta, "workers/bugfix-rank.theta"), rank.replace(/^model:.*$/m, () => "model: " + JSON.stringify(host.provider + "/" + host.model)));
    // These admitted callables are not executed by the listing branch.
    writeFileSync(join(theta, "workers/bugfix-stage.theta"), '---\nmode: subagent\nparams:\n  run_dir: string\n  phase: string\n  feedback: string\n---\n"FIXER_MUST_NOT_RUN"\n');
    writeFileSync(join(theta, "workers/bugfix-review.theta"), '---\nmode: subagent\nparams:\n  run_dir: string\n  focus: string\n---\n"REVIEWER_MUST_NOT_RUN"\n');
    writeFileSync(join(cwd, "docs/bugs/0001-cosmetic-log-label.md"), [
      "# Incorrect decorative log label", "- **Status:** open", "- **Sev/Diff estimate:** S1/D1", "",
      "The severity estimate above is stale and overstated. A log heading uses the wrong decorative label.",
      "All execution, return values, failure status and diagnostic locations are correct.",
      "Only the cosmetic heading is wrong. No production result, verification gate or recovery path is affected.",
      "There are no prerequisites for correcting the label.", "",
    ].join("\n"));
    writeFileSync(join(cwd, "docs/bugs/0002-silent-value-corruption.md"), [
      "# Silent result corruption", "- **Status:** open", "- **Sev/Diff estimate:** S4/D1", "",
      "The filed estimate above is stale and understated. Every ordinary call returns the wrong value without Err or a diagnostic.",
      "A normal output-emptiness test is inverted. Production workflows can take a destructive cleanup branch when no cleanup is needed.",
      "Wrong control flow was observed; data loss has not been observed, so distinguish demonstrated impact from that risk.",
      "Historical blocker: bug 0003. That note predates its fix; check its current status before recommending more prerequisite work.", "",
    ].join("\n"));
    writeFileSync(join(cwd, "docs/bugs/0003-resolved-prerequisite.md"), [
      "# Old prerequisite", "- **Status:** fixed (0.497.0)", "",
      "The prerequisite was implemented and verified. It is no longer work to do before bug 0002.",
      "Bug 0002 remains a separate open defect; no other hard prerequisites are known.", "",
    ].join("\n"));
    try {
      git(cwd, "init", "-b", "main");
      git(cwd, "config", "user.email", "test@example.invalid");
      git(cwd, "config", "user.name", "Test");
      git(cwd, "add", "."); git(cwd, "commit", "-m", "ranking fixture");
      const before = git(cwd, "status", "--porcelain");
      const result = await spawnPiPrint({
        cwd, thetaDir: theta, extraThetaDirs: [join(theta, "workers")], slashInvocation: "/fix-bug",
        extraArgs: ["-e", join(cwd, "question.mjs"), "--session", join(cwd, ".pi/tmp/session.jsonl")],
      });
      expect(result.exitCode, result.stderr + "\n" + result.stdout).toBe(0);
      expect(result.stderr).toBe("");
      expect(parseSystemNoteCodes(result.stdout)).toEqual([]);
      expect(result.stdout).toContain("OPEN BUGS — SEVERITY RANKING");
      expect(result.stdout).toContain("1. 0002 — silent value corruption [");
      expect(result.stdout).toContain("2. 0001 — cosmetic log label [");
      expect(result.stdout).toContain("FIX-ORDER GUIDANCE");
      const guidance = result.stdout.split("FIX-ORDER GUIDANCE")[1] ?? "";
      expect(guidance).toContain("0003");
      expect(guidance).toMatch(/fixed|resolved|closed|complete|no longer/i);
      expect(result.stdout).not.toMatch(/^\d+\. 0003 —/m);
      expect(result.stdout).not.toContain("0003 before 0002");
      expect(result.stdout).not.toContain("FIXER_MUST_NOT_RUN");
      expect(result.stdout).not.toContain("REVIEWER_MUST_NOT_RUN");
      expect(result.stdout).not.toContain("theta_result");
      expect(git(cwd, "status", "--porcelain")).toBe(before);
      expect(existsSync(join(cwd, ".pi/tmp/fix-bug.lock"))).toBe(false);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 240000);
});
