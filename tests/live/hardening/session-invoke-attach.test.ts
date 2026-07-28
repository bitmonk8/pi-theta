// Hardening lens: prompt→prompt INVOKE ATTACH (cross-mode semantics).
//
// Verifies the just-landed fix to the shipped theta extension: a prompt-mode
// theta that `invoke(...)`s another prompt-mode theta now ATTACHES the callee to
// the caller's CURRENT user session. The callee's `@`-queries stream as
// user-visible turns in the SAME conversation and the parent suspends until the
// callee returns. Before the fix, every invoke callee (regardless of mode) was
// spawned into a fresh isolated subagent session, so a prompt callee's query
// was invisible to the user session.
//
// Spec: docs/spec_topics/invocation.md §Cross-mode semantics — the prompt→prompt
// cell ("Child attaches to caller's current conversation (the user's session).
// Child's queries are user-visible turns.").
//
// Deterministic discriminator: `runProbe`'s per-turn `userTexts` collects the
// exact user-turn text of every user-visible turn committed into the user
// session during that drive. If prompt→prompt attaches, the CHILD's rendered
// query text appears in the parent drive's `userTexts` (same session). If it
// were still spawning fresh, the child's query would run in a private session
// and be ABSENT from `userTexts`.

import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe } from "./probe-harness";
import type { ProbeResult } from "./probe-harness";

const provider = requireLiveProvider();

function transportish(s: string | undefined): boolean {
  if (s === undefined) return false;
  return /429|overloaded|transport|rate.?limit|ECONNRESET|timeout|503|529/i.test(s);
}

/** Drive one probe; retry once on a transport-ish failure. Returns joined userTexts of the last turn. */
async function drive(make: () => Promise<ProbeResult>): Promise<{ text: string; probe: ProbeResult }> {
  let probe = await make();
  let turn = probe.turns[probe.turns.length - 1];
  if (turn !== undefined && transportish(turn.error)) {
    await probe.dispose();
    probe = await make();
    turn = probe.turns[probe.turns.length - 1];
  }
  return { text: (turn?.userTexts ?? []).join("\n"), probe };
}

const P = (mode: string, body: string): string =>
  ["---", "description: x", `mode: ${mode}`, "---", body].join("\n");

describe("prompt->prompt invoke attach (cross-mode)", () => {
  // The core fix: a prompt-mode child invoked from a prompt-mode parent attaches
  // to the caller's user session, so the child's `@`-query is a user-visible
  // turn in the SAME drive as the parent's own query.
  it("prompt->prompt attach: child query is a user-visible turn in the caller's session", async () => {
    const files = [
      {
        source: "project" as const,
        path: "ppparent.theta",
        text: P(
          "prompt",
          [
            'let v = invoke("./ppchild.theta")?',
            "@`PARENT_TURN_SENTINEL reply with exactly: OK`",
          ].join("\n"),
        ),
      },
      {
        source: "project" as const,
        path: "ppchild.theta",
        text: P(
          "prompt",
          ["let _ = @`CHILD_TURN_SENTINEL reply with exactly: OK`", "1"].join("\n"),
        ),
      },
    ];
    const { text, probe } = await drive(() => runProbe({ provider, files, drives: ["/ppparent"] }));
    try {
      // Child's query attached as a user-visible turn (the core fix) ...
      expect(text).toContain("CHILD_TURN_SENTINEL");
      // ... and the parent's own query is visible in the same session.
      expect(text).toContain("PARENT_TURN_SENTINEL");
    } finally {
      await probe.dispose();
    }
  });

  // The child's final value still crosses the invoke boundary back to the
  // caller even though the child ran attached to the user session.
  it("prompt->prompt attach: callee final value still propagates to the caller", async () => {
    const files = [
      {
        source: "project" as const,
        path: "ppret.theta",
        text: P(
          "prompt",
          [
            'let v: number = invoke<number>("./ppnum.theta")?',
            "@`RET=${v}|reply with exactly: OK`",
          ].join("\n"),
        ),
      },
      {
        source: "project" as const,
        path: "ppnum.theta",
        text: P(
          "prompt",
          ["let n = @`NUMCHILD_SENTINEL reply with exactly: OK`", "42"].join("\n"),
        ),
      },
    ];
    const { text, probe } = await drive(() => runProbe({ provider, files, drives: ["/ppret"] }));
    try {
      // Child's final value 42 crossed the invoke boundary ...
      expect(text).toContain("RET=42");
      // ... and the child turn was user-visible in the caller's session.
      expect(text).toContain("NUMCHILD_SENTINEL");
    } finally {
      await probe.dispose();
    }
  });
});
