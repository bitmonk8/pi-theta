// RFC-0012 §4/§6 — the three placement settings keys through the settings
// reader: `theta.subagentPlacement` (either scope, backend-name grammar),
// `theta.subagentPlacementMaxVisible` (integer ≥ 0), and
// `theta.subagentPlacementExec` (GLOBAL FILE ONLY — a project value draws
// `theta/load/settings-invalid-entry` with its position-specific template; a
// malformed global template is out of range with the parser's reason on
// `details.reason`). Messages are sourced from the registry (DIAG-4).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { loadSettings } from "../src/discovery/settings";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { FileSystem } from "../src/seams/file-system";
import { FakeFileSystem } from "./helpers/fake-file-system";

const HOME = "/home/theta";
const CWD = "/project";
const PROJECT_PATH = "/project/.pi/settings.json";
const GLOBAL_PATH = "/home/theta/.pi/agent/settings.json";

const INVALID_ENTRY = "theta/load/settings-invalid-entry";
const OUT_OF_RANGE = "theta/load/settings-value-out-of-range";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL("../docs/spec_topics/diagnostics/code-registry-load.md", import.meta.url)), "utf8"),
) as { code: string; message: string; trigger: string }[];

function build(project: unknown | undefined, global: unknown | undefined): FileSystem {
  const files: Record<string, string> = {};
  if (project !== undefined) files[PROJECT_PATH] = JSON.stringify(project);
  if (global !== undefined) files[GLOBAL_PATH] = JSON.stringify(global);
  return new FakeFileSystem({ homedir: HOME, cwd: CWD, files, errors: {} });
}

function byCode(diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

const TMUX_TEMPLATE = {
  when: { env: "TMUX" },
  spawn: ["tmux", "new-window", "-d", "-P", "-F", "#{pane_id}", "-c", "{cwd}", "-n", "{label}", "{argv}"],
  kill: ["tmux", "kill-pane", "-t", "{handle}"],
};

describe("RFC-0012 §6 — theta.subagentPlacement / theta.subagentPlacementMaxVisible", () => {
  it("valid values from either scope reach the merged view; project overrides global", async () => {
    const result = await loadSettings(
      build({ theta: { subagentPlacement: "herdr" } }, { theta: { subagentPlacement: "auto", subagentPlacementMaxVisible: 4 } }),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.settings.theta?.subagentPlacement).toBe("herdr");
    expect(result.settings.theta?.subagentPlacementMaxVisible).toBe(4);
  });

  it("the built-in selector words are valid names; 0 is a valid cap", async () => {
    for (const value of ["auto", "pipe", "exec", "a", "a-b-1"]) {
      const result = await loadSettings(build({ theta: { subagentPlacement: value, subagentPlacementMaxVisible: 0 } }, undefined));
      expect(result.diagnostics).toEqual([]);
      expect(result.settings.theta?.subagentPlacement).toBe(value);
      expect(result.settings.theta?.subagentPlacementMaxVisible).toBe(0);
    }
  });

  it.each([
    ["an uppercase name", "Herdr", "Herdr"],
    // An identifier-shaped string renders bare (placeholder-rendering-b.md).
    ["a too-long name", "a".repeat(33), "a".repeat(33)],
    ["an empty string", "", '""'],
    ["a non-string", 7, "7"],
    ["null", null, "null"],
  ])("subagentPlacement %s is out of range and treated as absent", async (_label, value, observed) => {
    const result = await loadSettings(build({ theta: { subagentPlacement: value } }, undefined));
    const hits = byCode(result.diagnostics, OUT_OF_RANGE);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.message).toBe(
      (registryMessage(REGISTRY, OUT_OF_RANGE) as string).replace("<key>", "thetas.subagentPlacement").replace("<observed>", observed),
    );
    expect(result.settings.theta?.subagentPlacement).toBeUndefined();
  });

  it.each([
    ["a negative cap", -1],
    ["a fractional cap", 2.5],
    ["a string cap", "8"],
  ])("subagentPlacementMaxVisible %s is out of range and treated as absent", async (_label, value) => {
    const result = await loadSettings(build({ theta: { subagentPlacementMaxVisible: value } }, undefined));
    expect(byCode(result.diagnostics, OUT_OF_RANGE)).toHaveLength(1);
    expect(result.settings.theta?.subagentPlacementMaxVisible).toBeUndefined();
  });
});

describe("RFC-0012 §4 *Trust* — theta.subagentPlacementExec is honoured from the global file only", () => {
  it("a valid GLOBAL template reaches the merged view, validated and defaulted (env: none)", async () => {
    const result = await loadSettings(build(undefined, { theta: { subagentPlacementExec: TMUX_TEMPLATE } }));
    expect(result.diagnostics).toEqual([]);
    expect(result.settings.theta?.subagentPlacementExec).toEqual({ ...TMUX_TEMPLATE, env: "none" });
  });

  it("a PROJECT template is dropped with theta/load/settings-invalid-entry (E) and the position-specific template documented in that row's Trigger (DIAG-4); the other project keys still process", async () => {
    const result = await loadSettings(
      build(
        { theta: { subagentPlacementExec: TMUX_TEMPLATE, subagentPlacement: "exec" } },
        { theta: { subagentPlacementMaxVisible: 2 } },
      ),
    );
    const hits = byCode(result.diagnostics, INVALID_ENTRY);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("error");
    expect(hits[0]!.file).toBe(PROJECT_PATH);
    const rendered = "settings 'theta.subagentPlacementExec' is honoured from the global settings file only; ignored in project settings";
    expect(hits[0]!.message).toBe(rendered);
    // The registry documents the position-specific template in the row's
    // Trigger (DIAG-4's one-Message-cell rule), so the test sources it there.
    const row = REGISTRY.find((r) => r.code === INVALID_ENTRY);
    expect(row?.trigger).toContain(rendered);
    expect(result.settings.theta?.subagentPlacementExec).toBeUndefined();
    expect(result.settings.theta?.subagentPlacement).toBe("exec");
    expect(result.settings.theta?.subagentPlacementMaxVisible).toBe(2);
  });

  it("a project template never shadows a valid global one", async () => {
    const result = await loadSettings(
      build(
        { theta: { subagentPlacementExec: { spawn: ["evil", "{argv}"] } } },
        { theta: { subagentPlacementExec: TMUX_TEMPLATE } },
      ),
    );
    expect(byCode(result.diagnostics, INVALID_ENTRY)).toHaveLength(1);
    expect(result.settings.theta?.subagentPlacementExec?.spawn[0]).toBe("tmux");
  });

  it.each([
    ["not an object", ["tmux", "{argv}"], "array", "must be an object"],
    ["spawn without {argv}", { spawn: ["tmux", "new-window"] }, "object", "exactly one `{argv}` element"],
    ["an unknown key", { spawn: ["{argv}"], kil: ["x"] }, "object", "unknown key 'kil'"],
    ["a bad env", { spawn: ["{argv}"], env: "yes" }, "object", "`env` must be"],
  ])("a malformed GLOBAL template (%s) is out of range with the parser's reason on details.reason", async (_label, value, observed, reason) => {
    const result = await loadSettings(build(undefined, { theta: { subagentPlacementExec: value } }));
    const hits = byCode(result.diagnostics, OUT_OF_RANGE);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.file).toBe(GLOBAL_PATH);
    expect(hits[0]!.message).toBe(
      (registryMessage(REGISTRY, OUT_OF_RANGE) as string).replace("<key>", "thetas.subagentPlacementExec").replace("<observed>", observed),
    );
    expect((hits[0]!.details as { reason?: string } | undefined)?.reason).toContain(reason);
    expect(result.settings.theta?.subagentPlacementExec).toBeUndefined();
  });
});
