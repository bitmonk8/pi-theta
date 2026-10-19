// Real outer pi + real nested child, zero provider turns. Only the test-side
// live-model resolver is supplied metadata; the spawned CLI remains unmocked.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnPiPrint } from "./live/acceptance/harness";
import { SUBAGENT_CONTROL_PLANE_ENV_KEYS } from "../src/runtime/subagent-launcher";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function runHost(explicitRoot?: string) {
  // Simulate vitest being launched inside /bugfix-stage, including keys that
  // were absent from a standalone operator-run test. The harness supplies a
  // fresh real parent PID, so leaving any of these ambient values is unsafe.
  for (const key of SUBAGENT_CONTROL_PLANE_ENV_KEYS) vi.stubEnv(key, "foreign:" + key);
  vi.stubEnv(SUBAGENT_ROOT_ENV_MARKER, "bugfix-stage");
  vi.spyOn(ModelRuntime, "create").mockResolvedValue({} as ModelRuntime);
  vi.spyOn(ModelRegistry.prototype, "refresh").mockResolvedValue({ aborted: false, errors: new Map() });
  vi.spyOn(ModelRegistry.prototype, "getAvailable").mockReturnValue([
    { provider: "openai", id: "gpt-6.1-sol" },
  ] as ReturnType<ModelRegistry["getAvailable"]>);

  const cwd = mkdtempSync(join(tmpdir(), "theta-acceptance-env-"));
  const roots = join(cwd, "thetas");
  const agent = join(cwd, "agent");
  mkdirSync(roots); mkdirSync(agent);
  writeFileSync(join(agent, "auth.json"), JSON.stringify({ openai: { type: "api_key", key: "offline-no-provider-access" } }));
  writeFileSync(join(agent, "settings.json"), JSON.stringify({ defaultProvider: "openai", defaultModel: "gpt-6.1-sol", defaultProjectTrust: "always" }));
  writeFileSync(join(roots, "child.theta"), '---\nmode: subagent\n---\n"nested-child-ok"\n');
  writeFileSync(join(roots, "parent.theta"), '---\nmode: prompt\ntools:\n  - theta_print\n  - ./child.theta\n---\nlet value = child()?\ntheta_print({ text: value })?\n"parent-ok"\n');
  writeFileSync(join(roots, "marked.theta"), '---\nmode: subagent\n---\n"own-root-ok"\n');
  try {
    const result = await spawnPiPrint({
      cwd, thetaDir: roots,
      slashInvocation: explicitRoot === "marked" ? "/marked" : "/parent",
      extraArgs: ["--mode", "json", "--no-session"],
      extraEnv: {
        PI_CODING_AGENT_DIR: agent,
        PI_OFFLINE: "1",
        ...(explicitRoot === undefined ? {} : { [SUBAGENT_ROOT_ENV_MARKER]: explicitRoot }),
      },
      abortAfterMs: 20000,
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    const events = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
    return { events, envelopes: events.filter(event => "theta_result" in event) };
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

describe("top-level acceptance host launched from a theta worker", () => {
  it("has no foreign envelope and still launches its own real subagent child", async () => {
    const { events, envelopes } = await runHost();
    expect(envelopes, "a prompt-mode outer host must not inherit the worker's marked-root regime").toEqual([]);
    const messages = events.filter(event => event.type === "message_end").map(event => event.message);
    expect(messages.filter(message => message.customType === "theta-print").map(message => message.content)).toEqual(["nested-child-ok"]);
    expect(messages.filter(message => ["user", "assistant", "toolResult"].includes(message.role))).toEqual([]);
  }, 30000);

  it("red-direction control: explicitly reintroducing the foreign regime exposes the stray envelope", async () => {
    const { envelopes } = await runHost("bugfix-stage");
    expect(envelopes).toEqual([{
      theta_result: expect.objectContaining({
        err: expect.objectContaining({ callee_path: "bugfix-stage", cause: "load_failure" }),
      }),
    }]);
  }, 30000);

  it("preserves intentional wire-probe regimes and authenticates their own root", async () => {
    const { envelopes } = await runHost("marked");
    expect(envelopes).toEqual([{ theta_result: { v: 1, ok: "own-root-ok" } }]);
  }, 30000);
});
