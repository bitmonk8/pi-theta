// Bug 0494 H9a: real working-tree pi -p, not a mocked BinderRunner.
// Exact new-test contract authorized in the run's human decision. The temporary
// extension adds ONLY a resolvable unsupported-api catalog model; no binder,
// surface, dispatch or provider reply is replaced. The gate spends zero tokens.
// A genuine OpenAI arithmetic turn on the healthy single-string bypass proves
// host registration, credentials and body execution independently of resolution.
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint, type PiPrintResult } from "./harness";

const REFUSAL = "no measured forced-tool-choice mapping for this provider api; argument binding unavailable";
// Existing rendered binder template is capped at 120 code points (full cause
// remains in details.event.message); pin the exact rendered bytes, not an
// untruncated reconstruction or the fallback diagnostic's theta:-prefixed line.
const NOTE = "theta /refused: argument binder unavailable (google-generative-ai: no measured forced-tool-choice mapping for this prov…";
const workspaces: string[] = [];
function plant() {
  const project = mkdtempSync(join(tmpdir(), "theta-b0494-host-"));
  workspaces.push(project);
  const roots = join(project, "thetas");
  mkdirSync(roots);
  writeFileSync(join(roots, "refused.theta"), [
    "---", "mode: prompt", "bind_model: b0494-catalog/refused", "params:",
    "  topic: string", "  audience: string", "---",
    "@`What is 263 plus 514? Answer with the number only.`", "",
  ].join("\n"));
  writeFileSync(join(roots, "healthy.theta"), [
    "---", "mode: prompt", "params:", "  topic: string", "---",
    "@`What is ${topic} plus 514? Answer with the number only.`", "",
  ].join("\n"));
  const catalog = join(project, "catalog.ts");
  writeFileSync(catalog, `export default function(pi) {
    pi.registerProvider("b0494-catalog", {
      api: "google-generative-ai", baseUrl: "http://127.0.0.1:1", apiKey: "test-only-never-dispatched",
      models: [{ id: "refused", name: "B0494 refused binder", reasoning: false,
        input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 8192, maxTokens: 128 }]
    });
  }\n`);
  return { project, roots, catalog };
}
afterEach(() => {
  for (const project of workspaces.splice(0)) rmSync(project, { recursive: true, force: true });
});

// Parse the COMPLETE JSONL stream strictly. Never discard non-message_end rows
// (a prompt-parent theta_result leak may live elsewhere in the stream).
function jsonEvents(result: PiPrintResult): Record<string, unknown>[] {
  return result.stdout.split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
    const parsed: unknown = JSON.parse(line);
    expect(parsed, "JSONL event must be an object").toBeTypeOf("object");
    expect(parsed).not.toBeNull();
    return parsed as Record<string, unknown>;
  });
}
function objects(value: unknown): Record<string, unknown>[] {
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(objects);
  return [value as Record<string, unknown>, ...Object.values(value).flatMap(objects)];
}
function checkNoEnvelope(events: Record<string, unknown>[]) {
  expect(objects(events).filter((value) => value.type === "theta_result"), "prompt parent must not emit theta_result anywhere").toEqual([]);
}
function checkRefusal(result: PiPrintResult) {
  const events = jsonEvents(result);
  checkNoEnvelope(events);
  const notes = objects(events).filter((value) => value.customType === "theta-system-note" && value.content === NOTE);
  expect(notes.length, "precondition: real binder transport refusal note must exist in JSONL before process assertions").toBeGreaterThan(0);
  expect(notes.some((value) => {
    const details = value.details as { event?: Record<string, unknown> } | undefined;
    return details?.event?.kind === "transport" && details.event.theta === "/refused" && details.event.message === REFUSAL;
  }), "precondition: transport must be the unsupported-api pre-dispatch refusal, never a provider/auth failure").toBe(true);
  expect(objects(events).filter((value) => value.role === "assistant"), "refused binding must prevent the body turn").toEqual([]);
}
async function run(workspace: ReturnType<typeof plant>, mode: "text" | "json", healthy = false) {
  const result = await spawnPiPrint({
    thetaDir: workspace.roots, cwd: workspace.project,
    slashInvocation: healthy ? "/healthy 263" : "/refused vague",
    extraArgs: ["--no-session", "-e", workspace.catalog, ...(mode === "json" ? ["--mode", "json"] : [])],
  });
  // Preserve complete process captures in the expensive command's log, even
  // when the next premise/assertion fails. No rerun needed to inspect stdout.
  console.info(`B0494 host capture ${mode} ${healthy ? "healthy" : "refused"}: ${JSON.stringify(result)}`);
  return result;
}

describe("H9a bug 0494 — binder print-mode failure surface", () => {
  it("CONTROL single-string bypass: genuine OpenAI body turn exits 0 without a failure line", async () => {
    await requireLiveHost();
    const workspace = plant();
    const result = await run(workspace, "json", true);
    const events = jsonEvents(result);
    checkNoEnvelope(events);
    const completed = events.filter((event) => event.type === "message_end").map((event) => event.message as Record<string, unknown>);
    const assistants = completed.filter((message) => message.role === "assistant");
    if (assistants.length === 0) failLoudly(`live-host precondition unmet: no completed assistant turn: ${JSON.stringify(result)}`);
    expect(assistants.every((message) => message.stopReason !== "error" && message.stopReason !== "aborted"), "live-host precondition: provider/auth failures are not witnesses").toBe(true);
    expect(objects(assistants).filter((value) => value.type === "text").map((value) => value.text).join(" ")).toMatch(/\b777\b/);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(objects(events).filter((value) => value.customType === "theta-system-note")).toEqual([]);
  });

  it("JSON and text: unsupported-api refusal must mirror its rendered note and exit exactly 1", async () => {
    await requireLiveHost();
    const workspace = plant();
    const json = await run(workspace, "json");
    checkRefusal(json);
    // JSON supplies independent correct-cause evidence for the identical text
    // invocation, whose custom note the host does not print to stdout.
    const text = await run(workspace, "text");
    expect(text.stdout, "text binder short circuit has no assistant output").toBe("");
    for (const [mode, result] of [["json", json], ["text", text]] as const) {
      expect.soft(result.exitCode, `B0494 ${mode}: binder refusal must exit 1`).toBe(1);
      expect.soft(result.stderr.split(/\r?\n/).filter((line) => line === NOTE), `B0494 ${mode}: missing rendered binder stderr line`).toEqual([NOTE]);
    }
  });
});
