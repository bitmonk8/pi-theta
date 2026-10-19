// Offline real-host probes. Fixtures contain no queries/binders; placeholder
// API-key metadata selects a model but can never authorize a provider request.
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const cli = process.env.PI_THETA_TEST_PI_CLI ?? join(root, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
function runProbe(name: string, mode = "text") {
  const cwd = mkdtempSync(join(tmpdir(), "theta-print-real-"));
  const agent = join(cwd, "agent"); const theta = join(cwd, ".pi", "theta");
  mkdirSync(agent); mkdirSync(theta, { recursive: true });
  writeFileSync(join(agent, "auth.json"), JSON.stringify({ openai: { type: "api_key", key: "pi-theta-no-network" } }));
  writeFileSync(join(agent, "settings.json"), JSON.stringify({ defaultProvider: "openai", defaultModel: "gpt-5.5", defaultProjectTrust: "always" }));
  writeFileSync(join(theta, "print-probe.theta"), '---\nmode: prompt\ntools: theta_print\n---\ntheta_print({ text: "0472 first bug\\n0499 second bug" })?\n"done"\n');
  writeFileSync(join(theta, "private-print.theta"), '---\nmode: subagent\ntools: theta_print\n---\ntheta_print({ text: "PRIVATE CHILD PRINT" })?\n"child-ok"\n');
  writeFileSync(join(theta, "print-parent.theta"), '---\nmode: prompt\ntools:\n  - ./private-print.theta\n  - theta_print\n---\nlet answer = private_print()?\ntheta_print({ text: answer })?\n"done"\n');
  try {
    return spawnSync(process.execPath, [cli, "-ne", "-e", join(root, "extensions"), ...(mode === "json" ? ["--mode", "json"] : []), "-p", "/" + name], {
      cwd, encoding: "utf8", timeout: 45000,
      env: { ...process.env, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1", PI_THETA_SUBAGENT_EXTENSION_PIN: join(root, "extensions"), PI_THETA_SUBAGENT_PARENT_PID: String(process.pid) },
    });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
describe("theta_print production CLI, no provider turns", () => {
  it("prints literal lines directly to stdout in text mode", () => {
    const r = runProbe("print-probe");
    expect(r.error).toBeUndefined(); expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe("0472 first bug\n0499 second bug\n"); expect(r.stderr).toBe("");
  }, 60000);
  it("keeps a real child's printed text private without corrupting its return envelope", () => {
    const r = runProbe("print-parent");
    expect(r.error).toBeUndefined(); expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe("child-ok\n"); expect(r.stderr).toBe("");
  }, 60000);
  it("uses custom-message events in JSON mode, with no raw text or model/host-loop turns", () => {
    const r = runProbe("print-probe", "json");
    expect(r.error).toBeUndefined(); expect(r.status, r.stderr).toBe(0);
    const events = r.stdout.trim().split("\n").map(line => JSON.parse(line));
    const messages = events.filter(event => event.type === "message_end").map(event => event.message);
    expect(messages.filter(message => message.customType === "theta-print").map(message => message.content)).toEqual(["0472 first bug\n0499 second bug"]);
    expect(messages.some(message => ["assistant", "user", "toolResult"].includes(message.role))).toBe(false);
  }, 60000);
});
