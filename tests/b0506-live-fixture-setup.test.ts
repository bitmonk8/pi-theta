import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { assertB0506ProbeParses, b0506ProbeSource } from "./helpers/b0506-live-fixture";

function brokenProbeSource(): string {
  // The original fixture: a bare if statement in an expression-only arm.
  return [
    "---", "mode: prompt", "---",
    'import { via_lib } from "./workers/lib.thetalib"',
    "let result = via_lib()",
    "let outcome = match result {",
    '  Ok(v) => if v.tag == "x" { "accepted-valid" } else { "accepted-unexpected" },',
    "  Err(e) => e.cause",
    "}",
    "@`Validation outcome: ${outcome}. What is 263 plus 514? Answer with the number only.`",
    "",
  ].join("\n");
}

interface RegistrationReport {
  readonly commands: readonly string[];
  readonly diagnostics: readonly { readonly code: string; readonly message: string }[];
}

/** Real CLI discovery/registration, inspected via a different registered command; zero model turns. */
function registrationOf(source: string): RegistrationReport {
  const root = process.cwd();
  const cwd = mkdtempSync(join(tmpdir(), "b0506-registration-"));
  const roots = join(cwd, "thetas");
  const workers = join(roots, "workers");
  const agentDir = join(cwd, "agent");
  mkdirSync(workers, { recursive: true });
  mkdirSync(agentDir);
  // An unusable key supplies model metadata only. No credentials are copied.
  writeFileSync(join(agentDir, "auth.json"), JSON.stringify({ openai: { type: "api_key", key: "offline-no-provider-access" } }));
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ defaultProvider: "openai", defaultModel: "gpt-6.1-sol", defaultProjectTrust: "always" }));
  writeFileSync(join(workers, "lib.thetalib"), 'schema ROut { tag: string }\nfn via_lib() { invoke<ROut>("./child.theta") }\n');
  writeFileSync(join(workers, "child.theta"), '---\nmode: prompt\n---\nschema ROut { tag: string }\nROut { tag: "x" }\n');
  writeFileSync(join(roots, "b0506-probe.theta"), source);
  const inspector = join(cwd, "inspect.mjs");
  writeFileSync(inspector, `export default function(pi) {
    pi.registerCommand("inspect-registration", { handler: async (_args, ctx) => {
      const diagnostics = ctx.sessionManager.getEntries().flatMap(entry => entry.data?.details?.diagnostics ?? []);
      console.error("B0506_SETUP " + JSON.stringify({ commands: pi.getCommands().map(command => command.name), diagnostics }));
      ctx.shutdown();
    }});
  }\n`);
  try {
    const result = spawnSync(process.execPath, [
      join(root, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js"),
      "-ne", "-e", join(root, "extensions"), "-e", inspector,
      "--theta", [roots, workers].join(delimiter),
      "--no-tools", "--no-session", "-p", "/inspect-registration",
    ], {
      cwd, encoding: "utf8", timeout: 20000,
      env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1" },
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    const lines = result.stderr.trim().split(/\r?\n/);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^B0506_SETUP /);
    return JSON.parse(lines[0]!.slice("B0506_SETUP ".length)) as RegistrationReport;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe("B0506 real-host fixture setup", () => {
  for (const callerSchema of ["", "schema ROut { tag: string }", "schema ROut { other: boolean }"]) {
    it.each([false, true])(`parses the actual generated probe before a provider turn: ${callerSchema || "missing caller schema"}, good=%s`, good => {
      expect(() => assertB0506ProbeParses(b0506ProbeSource({ callerSchema, good }))).not.toThrow();
    });
  }

  it("parse preflight rejects the original fixture with the actual load-blocking diagnostic", () => {
    expect(() => assertB0506ProbeParses(brokenProbeSource())).toThrow("theta/parse/statement-in-arm-body");
  });

  it("registers the repaired probe through the real CLI with no load diagnostics", () => {
    const report = registrationOf(b0506ProbeSource({ callerSchema: "schema ROut { tag: string }", good: true }));
    expect(report.commands).toContain("b0506-probe");
    expect(report.commands).toContain("child");
    expect(report.diagnostics).toEqual([]);
  }, 30000);

  it("red-direction control: the original fixture is absent from the real command registry, with its parse refusal recorded", () => {
    const report = registrationOf(brokenProbeSource());
    expect(report.commands).not.toContain("b0506-probe");
    expect(report.diagnostics.map(diagnostic => diagnostic.code)).toContain("theta/parse/statement-in-arm-body");
  }, 30000);
});
