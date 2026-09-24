// Bug 0489 — operator session-log policy: if a model is used, its session log
// is persisted. Witnesses:
//   (1) argv assembly — `sessionPath` present ⇒ `--session <path>` and NO
//       `--no-session`, on BOTH presentations, superseding `persistSession`;
//       absent ⇒ the prior forms byte-identical (the fallback every unwired
//       harness gets).
//   (2) derivation — `createChildSessionPathPolicy` nests under the parent's
//       session file, creates the nest directory, sanitises the label while
//       preserving the `#…` uniqueness suffix through truncation, answers
//       `undefined` ONLY for a sessionless parent, and lets every other
//       failure (an un-creatable nest) THROW to the regime's loud
//       launch-failure arm (never a silent `--no-session` child).
// The regime-threading and composition halves are witnessed in
// tests/subagent-visible-regime.test.ts (B1–B5b) and the H9a acceptance
// suite's session-log assertion respectively.
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { assembleSubagentArgv, PI_CLI_DIALECT } from "../src/runtime/subagent-argv";
import { createChildSessionPathPolicy } from "../src/extension/production-subagent-host";

const BASE_INPUT = {
  slug: "bench-d4-judge",
  thetaDirs: ["/w/.pi/theta"],
  systemPrompt: "judge",
  hostTools: ["read"],
  respondToolNames: [],
  noHostTools: false,
  provider: "anthropic",
  model: "claude-fable-5-1",
  projectTrust: false,
} as const;

/** A fixed wall-clock for deterministic timestamps. */
const NOW = (): number => Date.parse("2026-09-24T10:00:00.000Z");

describe("bug 0489 — argv session-log policy ladder", () => {
  it("headless: sessionPath ⇒ --session <path>, no --no-session", () => {
    const argv = assembleSubagentArgv(
      { ...BASE_INPUT, sessionPath: "/logs/parent/child.jsonl" },
      PI_CLI_DIALECT,
    );
    expect(argv[argv.indexOf("--session") + 1]).toBe("/logs/parent/child.jsonl");
    expect(argv).not.toContain("--no-session");
  });

  it("headless: no sessionPath ⇒ the prior --no-session form (unwired-harness fallback)", () => {
    const argv = assembleSubagentArgv({ ...BASE_INPUT }, PI_CLI_DIALECT);
    expect(argv).toContain("--no-session");
    expect(argv).not.toContain("--session");
  });

  it("visible: sessionPath supersedes persistSession: true — the derived path still wins", () => {
    const argv = assembleSubagentArgv(
      {
        ...BASE_INPUT,
        presentation: "visible" as const,
        label: "bench-d4-judge#0a1b2c3d",
        persistSession: true,
        sessionPath: "/logs/parent/child.jsonl",
      },
      PI_CLI_DIALECT,
    );
    expect(argv[argv.indexOf("--session") + 1]).toBe("/logs/parent/child.jsonl");
    expect(argv).not.toContain("--no-session");
  });

  it("visible: no sessionPath keeps the persistSession ladder (true ⇒ neither flag; false ⇒ --no-session)", () => {
    const persisted = assembleSubagentArgv(
      { ...BASE_INPUT, presentation: "visible" as const, label: "x#1", persistSession: true },
      PI_CLI_DIALECT,
    );
    expect(persisted).not.toContain("--session");
    expect(persisted).not.toContain("--no-session");
    const dropped = assembleSubagentArgv(
      { ...BASE_INPUT, presentation: "visible" as const, label: "x#1", persistSession: false },
      PI_CLI_DIALECT,
    );
    expect(dropped).toContain("--no-session");
    expect(dropped).not.toContain("--session");
  });
});

describe("bug 0489 — parent-nested child session path derivation", () => {
  const scratchDirs: string[] = [];
  afterEach(() => {
    for (const d of scratchDirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function scratch(): string {
    const dir = mkdtempSync(join(tmpdir(), "b0489-"));
    scratchDirs.push(dir);
    return dir;
  }

  it("nests under <dir(parent)>/<basename(parent)>, creates the nest directory, sanitises the label", () => {
    const dir = scratch();
    const parent = join(dir, "2026-09-24T00-00-00-000Z_abc.jsonl");
    const policy = createChildSessionPathPolicy(() => parent, NOW);
    const derived = policy('bench-d4-judge#0a1b2c3d/"\\evil');
    expect(derived).toBeDefined();
    const nest = join(dir, "2026-09-24T00-00-00-000Z_abc");
    expect(dirname(derived!)).toBe(nest);
    expect(existsSync(nest)).toBe(true);
    const name = basename(derived!);
    expect(name.endsWith(".jsonl")).toBe(true);
    expect(name).toContain("_theta-bench-d4-judge#0a1b2c3d");
    expect(name.includes(sep === "\\" ? "/" : "\\")).toBe(false);
    expect(name).not.toContain('"');
  });

  it("truncation preserves the #… uniqueness suffix: two same-instant long labels with distinct id8s derive DISTINCT paths", () => {
    const dir = scratch();
    const parent = join(dir, "p.jsonl");
    const policy = createChildSessionPathPolicy(() => parent, NOW);
    // 63 chars before the id8 — long enough that a whole-label slice(0,60)
    // would cut the id8 entirely (the F3 collision shape).
    const prefix = "workers-lens-d8-simplification#review_single_shard_with_context";
    const a = policy(`${prefix}#aaaaaaaa`);
    const b = policy(`${prefix}#bbbbbbbb`);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toBe(b);
    expect(basename(a!)).toContain("#aaaaaaaa");
    expect(basename(b!)).toContain("#bbbbbbbb");
  });

  it("a sessionless parent derives nothing — the ONLY undefined arm (fallback to --no-session)", () => {
    expect(createChildSessionPathPolicy(() => undefined, NOW)("worker#1")).toBeUndefined();
    expect(createChildSessionPathPolicy(() => "", NOW)("worker#1")).toBeUndefined();
  });

  it("a suffix-less parent path nests at <parent>.d — the parent's own path is never created or altered (Case A: un-flushed parent)", () => {
    const dir = scratch();
    const parent = join(dir, "mysession"); // no .jsonl; file does NOT exist yet
    const policy = createChildSessionPathPolicy(() => parent, NOW);
    const derived = policy("worker#1");
    expect(dirname(derived!)).toBe(`${parent}.d`);
    // The parent's own path stays free for the parent's first flush.
    expect(existsSync(parent)).toBe(false);
    writeFileSync(parent, "");
    expect(existsSync(parent)).toBe(true);
  });

  it("a suffix-less parent that already EXISTS as a file (Case B: resumed) still derives — the nest is beside it, launches keep running", () => {
    const dir = scratch();
    const parent = join(dir, "mysession");
    writeFileSync(parent, "");
    const policy = createChildSessionPathPolicy(() => parent, NOW);
    const derived = policy("worker#1");
    expect(dirname(derived!)).toBe(`${parent}.d`);
  });

  it("a genuinely un-creatable nest THROWS (routed to the loud launch-failure arm), never a silent undefined", () => {
    const dir = scratch();
    // A regular FILE occupying the nest path beside a .jsonl parent: mkdir
    // cannot create the directory.
    const parent = join(dir, "p.jsonl");
    writeFileSync(parent, "");
    writeFileSync(join(dir, "p"), "");
    const policy = createChildSessionPathPolicy(() => parent, NOW);
    expect(() => policy("worker#1")).toThrow();
  });

  it("a throwing parent-session read propagates (the regime converts it to SubagentSpawnFailedError)", () => {
    const policy = createChildSessionPathPolicy(() => {
      throw new Error("assertActive: runner invalidated");
    }, NOW);
    expect(() => policy("worker#1")).toThrow("assertActive");
  });
});
