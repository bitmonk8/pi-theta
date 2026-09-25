// Bug 0491 — a theta can pin its model but not its thinking level, and a
// prompt-mode `model:` window silently changes the session thinking level
// (the host's model switch re-derives the level; nothing restored it).
//
// docs/bugs/0491-no-frontmatter-thinking-level-pin.md.
// Spec: frontmatter-fields-a.md #frontmatter-thinking (field contract),
// tool-registration-lifetime.md #pic-17-thinking-window (prompt-mode window),
// subagent.md launch contract (`--thinking <level>`), code-registry-load.md
// `theta/load/unknown-thinking-value`, code-registry-runtime.md
// `theta/runtime/thinking-restore-failed`.
//
// TIER: unit + real-producer integration, offline, provider-free.
import { describe, expect, it } from "vitest";
import { THINKING_LEVELS, type ParsedFrontmatter } from "../src/parser/frontmatter";
import { findCode, parseDoc, parseFrontmatterLines as parseFm } from "./helpers/e2e-s1";
import {
  assembleSubagentArgv,
  PI_CLI_DIALECT,
  type SubagentArgvInput,
} from "../src/runtime/subagent-argv";
import {
  THINKING_RESTORE_FAILED_CODE,
  withThinkingWindow,
  type ThinkingWindowDeps,
} from "../src/runtime/tool-registration";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import {
  PINNED_REF,
  QUERY_REPLY,
  SESSION_REF,
  driveQuery,
  registryOf,
  SESSION_MODEL,
  PINNED_MODEL,
} from "./helpers/prompt-window-session-harness";
import {
  bodyWithInvoke,
  driveCaller,
  driveCtx,
  subagentCallee,
  trivialSubagentBody,
} from "./helpers/call-with-clause-harness";

const UNKNOWN = "theta/load/unknown-thinking-value";

// ===========================================================================
// (P) PARSE — the closed-set field contract.
// ===========================================================================

describe("bug 0491 (P) — `thinking:` is a closed-set frontmatter field", () => {
  it.each(THINKING_LEVELS.map((l) => [l]))("P1: `thinking: %s` registers and surfaces on ParsedFrontmatter.thinking", (level) => {
    const r = parseFm("mode: subagent", `thinking: ${level}`);
    expect(r.registered, JSON.stringify(r.diagnostics)).toBe(true);
    expect((r as { frontmatter: ParsedFrontmatter }).frontmatter.thinking).toBe(level);
    expect(r.diagnostics.map((d) => d.code)).not.toContain("theta/load/unknown-frontmatter-field");
  });

  it("P4: a `subagent fn` `with { thinking: … }` is not an override key — theta/load/unknown-frontmatter-field (FN-7: inherited, not overridable)", () => {
    const doc = parseDoc(["---", "mode: prompt", "---", 'subagent fn step(o: string) with { thinking: "high" } { o }', '"x"', ""].join(String.fromCharCode(10)));
    const codes = doc.diagnostics.map((x) => x.code);
    expect(codes, JSON.stringify(codes)).toContain("theta/load/unknown-frontmatter-field");
  });

  it("P2 (control): absent `thinking:` registers with no pin", () => {
    const r = parseFm("mode: prompt");
    expect(r.registered).toBe(true);
    expect((r as { frontmatter: ParsedFrontmatter }).frontmatter.thinking).toBeUndefined();
  });

  it.each([
    ["an unknown level", "thinking: extreme", "extreme"],
    ["a case variant", "thinking: High", "High"],
    ["a number", "thinking: 3", "3"],
    ["a boolean", "thinking: true", "true"],
    ["a sequence (rendered as its kind token)", "thinking: [high]", "array"],
    ["a mapping (rendered as its kind token)", "thinking: { level: high }", "object"],
    ["a bare key (null)", "thinking:", "null"],
    ["an explicit null", "thinking: ~", "null"],
  ])("P3: %s is theta/load/unknown-thinking-value and the theta is NOT registered", (_label, line, rendered) => {
    const r = parseFm("mode: prompt", line);
    expect(r.registered).toBe(false);
    const d = findCode(r.diagnostics, UNKNOWN);
    expect(d, `diagnostics: ${JSON.stringify(r.diagnostics.map((x) => x.code))}`).toBeDefined();
    expect(d!.severity).toBe("error");
    expect(d!.message).toContain("unknown 'thinking:' value");
    expect(d!.message).toContain("expected 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', or 'max'");
    expect(d!.message).toContain(`value '${rendered}'`);
  });
});

// ===========================================================================
// (A) SUBAGENT ARGV — `--thinking <level>` right after `--model`.
// ===========================================================================

function argvInput(overrides: Partial<SubagentArgvInput>): SubagentArgvInput {
  return {
    slug: "lens",
    thetaDirs: ["/w/.pi/theta"],
    systemPrompt: "you are a subagent",
    hostTools: ["read"],
    noHostTools: false,
    respondToolNames: [],
    provider: "anthropic",
    model: "claude-opus-5-5",
    projectTrust: false,
    ...overrides,
  };
}

describe("bug 0491 (A) — the child argv carries the pin", () => {
  it("A1: a present pin → `--thinking <level>` immediately after `--model <id>`", () => {
    const argv = assembleSubagentArgv(argvInput({ thinking: "xhigh" }), PI_CLI_DIALECT);
    const m = argv.indexOf("--model");
    expect(argv.slice(m, m + 4)).toEqual(["--model", "claude-opus-5-5", "--thinking", "xhigh"]);
    expect(argv.filter((a) => a === "--thinking")).toHaveLength(1);
  });

  it("A2 (control): no pin → no `--thinking` flag (the child's own resolution stands)", () => {
    const argv = assembleSubagentArgv(argvInput({}), PI_CLI_DIALECT);
    expect(argv).not.toContain("--thinking");
  });

  const CHILD = "./child.theta";
  it("A3: through the REAL spawn regime, a callee `thinking: xhigh` launches with --thinking xhigh", async () => {
    const outcome = await driveCaller({
      callerBody: bodyWithInvoke(CHILD),
      callerCtx: driveCtx("/work/project"),
      callees: new Map([[
        CHILD,
        {
          sourcePath: "/thetadir/child.theta",
          frontmatter: { mode: "subagent", thinking: "xhigh" } as unknown as ParsedFrontmatter,
          body: trivialSubagentBody(),
        },
      ]]),
      modelRegistry: registryOf(SESSION_MODEL, PINNED_MODEL),
    });
    expect(outcome.execution.outcome, JSON.stringify(outcome.execution.error)).toBe("success");
    expect(outcome.spawns).toHaveLength(1);
    const args = outcome.spawns[0]!.args;
    expect(args[args.indexOf("--thinking") + 1]).toBe("xhigh");
  });

  it("A4 (control): through the REAL spawn regime, a callee without `thinking:` launches with no --thinking", async () => {
    const outcome = await driveCaller({
      callerBody: bodyWithInvoke(CHILD),
      callerCtx: driveCtx("/work/project"),
      callees: new Map([[CHILD, subagentCallee("/thetadir/child.theta")]]),
      modelRegistry: registryOf(SESSION_MODEL, PINNED_MODEL),
    });
    expect(outcome.execution.outcome).toBe("success");
    expect(outcome.spawns[0]!.args).not.toContain("--thinking");
  });
});

// ===========================================================================
// (W) THE WINDOW — unit cells over withThinkingWindow.
// ===========================================================================

function hostDouble(initial: string, script: readonly ("ok" | "throw")[] = []): {
  pi: ThinkingWindowDeps["pi"];
  calls: string[];
  level: () => string;
  force: (l: string) => void;
} {
  let level = initial;
  const calls: string[] = [];
  return {
    pi: {
      getThinkingLevel: (): string => level,
      setThinkingLevel: ((l: string): void => {
        const n = calls.length;
        calls.push(l);
        if ((script[n] ?? "ok") === "throw") throw new Error(`scripted throw ${n}`);
        level = l;
      }) as never,
    },
    calls,
    level: () => level,
    force: (l) => {
      level = l;
    },
  };
}

function windowDeps(pi: ThinkingWindowDeps["pi"], target: string | undefined, sink: { d: Diagnostic[]; n: string[] }): ThinkingWindowDeps {
  return {
    pi,
    thetaName: "probe",
    target,
    emitDiagnostic: (d) => void sink.d.push(d),
    emitSystemNote: (note) => void sink.n.push(note.content),
  };
}

describe("bug 0491 (W) — withThinkingWindow", () => {
  it("W1: a differing pin is applied when the body asks and restored after; the body saw the pin", async () => {
    const h = hostDouble("medium");
    const sink = { d: [] as Diagnostic[], n: [] as string[] };
    let during = "";
    const v = await withThinkingWindow(windowDeps(h.pi, "xhigh", sink), async (apply) => {
      apply();
      during = h.level();
      return 7;
    });
    expect(v).toBe(7);
    expect(during).toBe("xhigh");
    expect(h.calls).toEqual(["xhigh", "medium"]);
    expect(h.level()).toBe("medium");
    expect(sink.d).toEqual([]);
  });

  it("W2: a pin equal to the session level makes no host call", async () => {
    const h = hostDouble("high");
    await withThinkingWindow(windowDeps(h.pi, "high", { d: [], n: [] }), async (apply) => apply());
    expect(h.calls).toEqual([]);
  });

  it("W3 (control): no pin and no change → no host call", async () => {
    const h = hostDouble("low");
    await withThinkingWindow(windowDeps(h.pi, undefined, { d: [], n: [] }), async (apply) => apply());
    expect(h.calls).toEqual([]);
  });

  it("W4: no pin, but the level changed inside (a host model switch re-derived it) → restored to the snapshot", async () => {
    const h = hostDouble("low");
    await withThinkingWindow(windowDeps(h.pi, undefined, { d: [], n: [] }), async () => h.force("high"));
    expect(h.calls).toEqual(["low"]);
    expect(h.level()).toBe("low");
  });

  it("W5: a restore that throws once is re-attempted and succeeds — no diagnostic, no note", async () => {
    const h = hostDouble("medium", ["ok", "throw", "ok"]);
    const sink = { d: [] as Diagnostic[], n: [] as string[] };
    await withThinkingWindow(windowDeps(h.pi, "max", sink), async (apply) => apply());
    expect(h.calls).toEqual(["max", "medium", "medium"]);
    expect(h.level()).toBe("medium");
    expect(sink.d).toEqual([]);
    expect(sink.n).toEqual([]);
  });

  it("W6: a restore that throws twice → thinking-restore-failed (E, hint = snapshot) + display note; the value propagates unmasked", async () => {
    const h = hostDouble("medium", ["ok", "throw", "throw"]);
    const sink = { d: [] as Diagnostic[], n: [] as string[] };
    const v = await withThinkingWindow(windowDeps(h.pi, "max", sink), async (apply) => {
      apply();
      return "value";
    });
    expect(v).toBe("value");
    expect(sink.d).toHaveLength(1);
    expect(sink.d[0]!.code).toBe(THINKING_RESTORE_FAILED_CODE);
    expect(sink.d[0]!.severity).toBe("error");
    expect(sink.d[0]!.hint).toBe("medium");
    expect(sink.d[0]!.message).toBe("failed to restore session thinking level after /probe: scripted throw 2");
    expect(sink.n).toEqual([
      "theta: failed to restore the session thinking level after /probe; the user session may have an unexpected thinking level active (was 'medium').",
    ]);
  });

  it("W7: a body throw still restores, and the throw propagates", async () => {
    const h = hostDouble("low");
    await expect(
      withThinkingWindow(windowDeps(h.pi, "high", { d: [], n: [] }), async (apply) => {
        apply();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(h.level()).toBe("low");
  });

  it("W8: a host without the thinking API — un-pinned runs inert; a present pin fails loudly (never silently dropped)", async () => {
    await expect(withThinkingWindow(windowDeps({}, undefined, { d: [], n: [] }), async () => 1)).resolves.toBe(1);
    await expect(withThinkingWindow(windowDeps({}, "high", { d: [], n: [] }), async () => 1)).rejects.toThrow(
      "declares 'thinking: high' but the host exposes no thinking-level control",
    );
  });
});

// ===========================================================================
// (B) PROMPT MODE — over the REAL producer and the PIC-17 model window.
// ===========================================================================

describe("bug 0491 (B) — a prompt-mode turn runs at the theta's `thinking:` and the session level survives", () => {
  it("B1: `thinking: xhigh` — the turn runs at xhigh; the session is back on its level after", async () => {
    const r = await driveQuery({ frontmatterLines: ["thinking: xhigh"], initialThinking: "medium" });
    expect(r.caught).toBeUndefined();
    expect(r.execution.outcome, JSON.stringify(r.execution?.error)).toBe("success");
    expect(r.execution.result.value).toBe(QUERY_REPLY);
    expect(r.session.turnThinking).toEqual(["xhigh"]);
    expect(r.session.setThinkingCalls).toEqual(["xhigh", "medium"]);
    expect(r.session.currentThinking).toBe("medium");
  });

  it("B2: with a `model:` swap whose host switch re-derives the level, the pin is applied AFTER the swap and the pre-drive level restored AFTER the model restore", async () => {
    const r = await driveQuery({
      frontmatterLines: [`model: "${PINNED_REF}"`, "thinking: max"],
      initialThinking: "low",
      // The host's per-model levels: switching to the pin lands on high, back to the session model on medium.
      perModelThinking: { [PINNED_REF]: "high", [SESSION_REF]: "medium" },
    });
    expect(r.execution.outcome, JSON.stringify(r.execution?.error)).toBe("success");
    expect(r.session.turnModels).toEqual([PINNED_REF]);
    expect(r.session.turnThinking, "the pin wins over the host's re-derivation").toEqual(["max"]);
    // Restore order: model back (host re-derives medium), then the thinking snapshot (low).
    expect(r.session.currentModel).toEqual(SESSION_MODEL);
    expect(r.session.currentThinking).toBe("low");
    expect(r.session.setThinkingCalls).toEqual(["max", "low"]);
  });

  it("B3: a `model:`-only swap no longer changes the user's session thinking level (the latent PIC-17 defect)", async () => {
    const r = await driveQuery({
      frontmatterLines: [`model: "${PINNED_REF}"`],
      initialThinking: "low",
      perModelThinking: { [PINNED_REF]: "high", [SESSION_REF]: "medium" },
    });
    expect(r.execution.outcome).toBe("success");
    // The turn ran at whatever the host derived for the pinned model (no pin declared) …
    expect(r.session.turnThinking).toEqual(["high"]);
    // … but the user session ends on the level it started with, not the per-model default.
    expect(r.session.currentThinking).toBe("low");
    expect(r.session.setThinkingCalls).toEqual(["low"]);
  });

  it("B4 (control): no `thinking:`, no `model:` → no setThinkingLevel call at all", async () => {
    const r = await driveQuery({ frontmatterLines: [], initialThinking: "medium" });
    expect(r.execution.outcome).toBe("success");
    expect(r.session.setThinkingCalls).toEqual([]);
    expect(r.session.turnThinking).toEqual(["medium"]);
  });

  it("B6: a pinned theta on a host WITHOUT the thinking API fails loudly through the real producer (never a silently dropped pin); no turn runs", async () => {
    const r = await driveQuery({ frontmatterLines: ["thinking: high"], withoutThinkingApi: true });
    const failure = r.caught ?? r.execution?.error;
    expect(String((failure as { message?: string })?.message ?? failure)).toContain("declares 'thinking: high' but the host exposes no thinking-level control");
    expect(r.session.turnThinking).toEqual([]);
  });

  it("B7 (control): an UN-pinned theta on a host without the thinking API runs unchanged", async () => {
    const r = await driveQuery({ frontmatterLines: [], withoutThinkingApi: true });
    expect(r.execution.outcome).toBe("success");
    expect(r.execution.result.value).toBe(QUERY_REPLY);
  });

  it("B5: a restore that fails twice fires thinking-restore-failed + the display note, and the reply still binds", async () => {
    const r = await driveQuery({
      frontmatterLines: ["thinking: xhigh"],
      initialThinking: "medium",
      setThinkingScript: ["ok", "throw", "throw"],
    });
    expect(r.caught).toBeUndefined();
    expect(r.execution.outcome).toBe("success");
    expect(r.execution.result.value).toBe(QUERY_REPLY);
    const d = r.diagnostics.find((x) => x.code === THINKING_RESTORE_FAILED_CODE);
    expect(d, JSON.stringify(r.diagnostics.map((x) => x.code))).toBeDefined();
    expect(r.session.notes.some((n) => n.display && n.content.startsWith("theta: failed to restore the session thinking level after /probe"))).toBe(true);
  });
});
