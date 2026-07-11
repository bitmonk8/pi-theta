// Hardening lens: SUBAGENT MODEL-DRIVEN TOOL LOOPS + ceiling #2
// (tool_loop_exhausted).
//
// Surface reachable ONLY after the SUBAG-2 fix (commit a0dcf942) installed the
// subagent's `tools:` callable set into the spawned session's `customTools`.
// Before SUBAG-2 the subagent model had NO tools; now it does, so model-driven
// tool loops inside a spawned subagent conversation — and their ceiling #2 cap
// (`tool_loop.max_rounds`) — are testable for the first time.
//
// Spec anchors:
//   * frontmatter.md §`tool_loop` (FRNT-1) — `max_rounds` bounds free-phase
//     tool-call rounds per query; "applies independently to each query … and
//     every query inside an `invoke`d callee (which uses the callee's own
//     `tool_loop`)". "On exhaustion without a terminating turn:
//     `Err(QueryError { kind: 'tool_loop_exhausted', ... })`." "`max_rounds: 0`
//     disables model-driven tool calls."
//   * hard-ceilings.md ceiling #2 + CIO-4 — the round cap; the `max_rounds`-final
//     branch (untyped: surfaces `tool_loop_exhausted`; `slot_count == max_rounds`
//     at init (0 == 0) exhausts a `max_rounds: 0` untyped query at once).
//   * errors-and-results.md ERR-19 `ToolLoopExhaustedError` — `{ kind:
//     "tool_loop_exhausted", rounds == max_rounds, last_tool_name: string|null,
//     ... }`.
//   * discovery-cli.md SLSH-3/SNK-h — a directly-slash-invoked subagent loom
//     whose top-level result is `Err(tool_loop_exhausted)` gets the note
//     "loom /<name> returned Err: tool-call loop exhausted after <rounds> rounds
//     (last tool: <last_tool_name>)"; `<last_tool_name>` renders literal
//     `respond` when null.
//   * invocation.md XMODE-1 — a callee-returned `Err` crossing an `invoke`
//     boundary is wrapped `InvokeCalleeError { kind: "invoke_callee", inner }`.
//
// Dedupe: QTL-4 (cli-findings/queries-toolloop.md) was PROMPT mode (driver forces
// `setActiveTools([])`); this file is SUBAGENT mode (a different code path —
// `spawnSubagentConversation`/`createSubagentQueryModel`). SUBAG-2
// (session-findings/subagent.md) confirmed a SINGLE subagent `read` works; this
// file tests MULTI-round loops and the ceiling.
//
// Token discipline: STL-4 is 0 tokens (max_rounds:0 short-circuits before any
// provider turn; the note is emitted at the boundary). STL-1/2/3/5 each drive one
// live turn. Live drives retry once on a transport/429 (not a finding).

import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe } from "./probe-harness";
import type { ProbeResult } from "./probe-harness";

const provider = requireLiveProvider();

function transportish(s: string | undefined): boolean {
  if (s === undefined) return false;
  return /429|overloaded|transport|rate.?limit|ECONNRESET|timeout|503|529/i.test(s);
}

/** Run a probe; retry once if the last drive errored transport-ish (429 is not a finding). */
async function driveOnce(make: () => Promise<ProbeResult>): Promise<ProbeResult> {
  let probe = await make();
  const turn = probe.turns[probe.turns.length - 1];
  if (turn !== undefined && transportish(turn.error)) {
    await probe.dispose();
    probe = await make();
  }
  return probe;
}

function loom(front: string[], body: string): string {
  return ["---", ...front, "---", body].join("\n");
}

// A dependency chain of files: each names the next, forcing SEQUENTIAL tool
// rounds (the model cannot know ch2/ch3's names without first reading ch1/ch2).
// Reaching CHAINDONE777 therefore requires >= 3 sequential read rounds.
const CHAIN_FILES = [
  { source: "rel" as const, path: "ch1.txt", text: "STEP1 done. Next, read the file ch2.txt to continue." },
  { source: "rel" as const, path: "ch2.txt", text: "STEP2 done. Next, read the file ch3.txt to continue." },
  {
    source: "rel" as const,
    path: "ch3.txt",
    text: "STEP3 done. The final marker is CHAINDONE777. Stop; do not read any more files.",
  },
];

const CHAIN_INSTRUCTION =
  "Read the file ch1.txt. Each file names the next file to read. Read exactly ONE file at a time, " +
  "following the chain, until a file gives you a final marker token. Reply with EXACTLY that marker " +
  "token and nothing else.";

describe("subagent model-driven tool loops + ceiling #2", () => {
  // STL-1 — MULTI-ROUND tool loop inside a spawned subagent works. Default
  // max_rounds (25). A prompt parent invokes the subagent and interpolates its
  // returned value into its own observable final query. The chain forces >= 3
  // sequential read rounds; a returned CHAINDONE777 proves the multi-round loop
  // ran end-to-end (SUBAG-2 confirmed only a single read).
  it("STL-1: a multi-round subagent tool loop (chained reads) completes and returns the marker", async () => {
    const probe = await driveOnce(() =>
      runProbe({
        provider,
        files: [
          ...CHAIN_FILES,
          {
            source: "project",
            path: "mrparent.loom",
            text: loom(
              ["description: x", "mode: prompt"],
              ['let r: string = invoke<string>("./mrchild.loom")?', "@`Say ok. MR=${r}`"].join("\n"),
            ),
          },
          {
            source: "project",
            path: "mrchild.loom",
            // default tool_loop (max_rounds: 25) — plenty for the 3-round chain.
            text: loom(["description: x", "mode: subagent", "tools: read"], "@`" + CHAIN_INSTRUCTION + "`"),
          },
        ],
        drives: ["/mrparent"],
      }),
    );
    try {
      const t = probe.turns[0];
      const userText = t.userTexts.join("\n");
      // eslint-disable-next-line no-console
      console.log("STL-1 parent userTexts:", JSON.stringify(userText), "error:", t.error);
      expect(probe.registeredNames).toContain("mrparent");
      // eslint-disable-next-line no-console
      console.log("STL-1 chain-marker-received:", userText.includes("CHAINDONE777"));
      // Multi-round subagent tool loop works: the final marker crossed the boundary.
      expect(userText).toContain("CHAINDONE777");
    } finally {
      await probe.dispose();
    }
  });

  // STL-2 — ceiling #2 under a LOW max_rounds. Same forced >=3-round chain, but
  // the subagent declares `tool_loop.max_rounds: 1`. Per FRNT-1/CIO-4 a query
  // that loops tools past its cap must surface Err(tool_loop_exhausted, rounds:1).
  // The prompt parent classifies the invoke outcome (Ok vs the wrapped callee
  // Err). If the cap is enforced -> CALLEE=tool_loop_exhausted; if the spawned
  // AgentSession absorbs the rounds -> OK=CHAINDONE777 (cap of 1 never tripped
  // despite >=3 rounds) — the potential defect (subagent twin of QTL-4).
  it("STL-2: a subagent tool_loop.max_rounds:1 vs a forced 3-round chain — does ceiling #2 fire?", async () => {
    const probe = await driveOnce(() =>
      runProbe({
        provider,
        files: [
          ...CHAIN_FILES,
          {
            source: "project",
            path: "capparent.loom",
            text: loom(
              ["description: x", "mode: prompt"],
              [
                'let res = invoke<string>("./capchild.loom")',
                "let outcome = match res {",
                "  Ok(v) => v,",
                '  Err(e) => match e.kind { "invoke_callee" => e.inner.kind, _ => e.kind }',
                "}",
                "@`Repeat verbatim, nothing else: OUTCOME[${outcome}]`",
              ].join("\n"),
            ),
          },
          {
            source: "project",
            path: "capchild.loom",
            text: loom(
              ["description: x", "mode: subagent", "tools: read", "tool_loop:", "  max_rounds: 1"],
              "@`" + CHAIN_INSTRUCTION + "`",
            ),
          },
        ],
        drives: ["/capparent"],
      }),
    );
    try {
      const t = probe.turns[0];
      const userText = t.userTexts.join("\n");
      // eslint-disable-next-line no-console
      console.log("STL-2 parent userTexts:", JSON.stringify(userText), "error:", t.error);
      expect(probe.registeredNames).toContain("capparent");
      const capEnforced = userText.includes("tool_loop_exhausted");
      const capAbsorbed = userText.includes("CHAINDONE777");
      // eslint-disable-next-line no-console
      console.log("STL-2 cap-enforced:", capEnforced, "cap-absorbed(defect):", capAbsorbed);
      // Pin the SPEC expectation: a >=3-round chain under max_rounds:1 should
      // exhaust ceiling #2. The finding md documents the observed reality; this
      // assertion is the conformance target.
      expect(capEnforced).toBe(true);
    } finally {
      await probe.dispose();
    }
  });

  // STL-3 — XMODE-1 wrapping of a tool_loop_exhausted Err crossing an invoke
  // boundary. Deterministic vehicle: an UNTYPED subagent query with
  // tool_loop.max_rounds:0 exhausts ceiling #2 at query start (slot 0 ==
  // max_rounds 0) BEFORE any provider turn (0 child tokens). The prompt parent
  // invokes it and reads the wrapped error: e.kind == "invoke_callee",
  // e.inner.kind == "tool_loop_exhausted", e.inner.rounds == 0,
  // e.inner.last_tool_name == null. Only the parent's echo query burns tokens.
  it("STL-3: a subagent tool_loop_exhausted Err is wrapped as InvokeCalleeError with the ERR-19 inner shape", async () => {
    const probe = await driveOnce(() =>
      runProbe({
        provider,
        files: [
          {
            source: "project",
            path: "tl0parent.loom",
            text: loom(
              ["description: x", "mode: prompt"],
              [
                'let res = invoke<string>("./tl0child.loom")',
                'let kind = match res { Ok(_) => "ok", Err(e) => e.kind }',
                "let inner = match res {",
                '  Ok(_) => "ok",',
                '  Err(e) => match e.kind { "invoke_callee" => e.inner.kind, _ => "notcallee" }',
                "}",
                "let rounds = match res {",
                "  Ok(_) => 0,",
                '  Err(e) => match e.kind { "invoke_callee" => e.inner.rounds, _ => 0 }',
                "}",
                "let last = match res {",
                '  Ok(_) => "ok",',
                '  Err(e) => match e.kind { "invoke_callee" => e.inner.last_tool_name, _ => "notcallee" }',
                "}",
                "@`Repeat verbatim, nothing else: OUTCOME[kind=${kind} inner=${inner} rounds=${rounds} last=${last}]`",
              ].join("\n"),
            ),
          },
          {
            source: "project",
            path: "tl0child.loom",
            // Untyped query, max_rounds:0 → immediate tool_loop_exhausted, no turn.
            // `?` propagates the Err to the top level (the canonical form).
            text: loom(
              ["description: x", "mode: subagent", "tools: read", "tool_loop:", "  max_rounds: 0"],
              "@`Read the file ch1.txt and reply with its contents.`?",
            ),
          },
        ],
        drives: ["/tl0parent"],
      }),
    );
    try {
      const t = probe.turns[0];
      const userText = t.userTexts.join("\n");
      // eslint-disable-next-line no-console
      console.log("STL-3 parent userTexts:", JSON.stringify(userText), "error:", t.error);
      expect(probe.registeredNames).toContain("tl0parent");
      // XMODE-1 wrapping + ERR-19 inner shape (kind invoke_callee; inner
      // tool_loop_exhausted; rounds == max_rounds == 0; last_tool_name null).
      expect(userText).toContain("kind=invoke_callee");
      expect(userText).toContain("inner=tool_loop_exhausted");
      expect(userText).toContain("rounds=0");
      expect(userText).toContain("last=null");
    } finally {
      await probe.dispose();
    }
  });

  // STL-4 — SLSH-3/SNK-h top-level note. Direct slash-dispatch of the same
  // max_rounds:0 subagent (no invoke parent) → top-level Err(tool_loop_exhausted)
  // → the user session's loom-system-note channel MUST carry the SNK-h template.
  // ZERO tokens (max_rounds:0 short-circuits before any provider turn).
  it("STL-4: a directly-slash-invoked subagent tool_loop_exhausted emits the SNK-h note (0 tokens)", async () => {
    const probe = await driveOnce(() =>
      runProbe({
        provider,
        files: [
          {
            source: "project",
            path: "tl0direct.loom",
            text: loom(
              ["description: x", "mode: subagent", "tools: read", "tool_loop:", "  max_rounds: 0"],
              "@`Read the file ch1.txt and reply with its contents.`?",
            ),
          },
        ],
        drives: ["/tl0direct"],
      }),
    );
    try {
      const t = probe.turns[0];
      const notes = t.systemNotes.join("\n");
      // eslint-disable-next-line no-console
      console.log("STL-4 systemNotes:", JSON.stringify(t.systemNotes), "error:", t.error);
      expect(probe.registeredNames).toContain("tl0direct");
      const snkH = "loom /tl0direct returned Err: tool-call loop exhausted after 0 rounds (last tool: respond)";
      // eslint-disable-next-line no-console
      console.log("STL-4 expected SNK-h present:", notes.includes(snkH));
      expect(t.systemNotes).toContain(snkH);
    } finally {
      await probe.dispose();
    }
  });

  // STL-6 — a tool_loop_exhausted breach in TAIL position (no `?`) crossing an
  // invoke boundary. errors-and-results.md: a runtime-class ceiling (#2,
  // tool_loop_exhausted) whose Err is UNHANDLED (not consumed by match, not
  // discarded via `let _`) reaches the fail arm; XMODE-1 then wraps it as
  // InvokeCalleeError. Control: an empty-template validation Err in the same
  // (no-`?`) tail position. Both children use max_rounds:0 / empty-template →
  // 0 child tokens; only the parent's echo query burns a turn. Reveals whether
  // the subagent surface preserves the true leaf kind across the boundary or
  // fabricates a `cancelled`.
  it("STL-6: an unhandled tail tool_loop_exhausted crosses invoke with its true kind (not masked as cancelled)", async () => {
    const probe = await driveOnce(() =>
      runProbe({
        provider,
        files: [
          {
            source: "project",
            path: "nqparent.loom",
            text: loom(
              ["description: x", "mode: prompt"],
              [
                'let r1 = invoke<string>("./tl0nq.loom")',
                'let r2 = invoke<string>("./emptynq.loom")',
                'let k1 = match r1 { Ok(_) => "ok", Err(e) => e.kind }',
                'let k2 = match r2 { Ok(_) => "ok", Err(e) => e.kind }',
                "@`Repeat verbatim, nothing else: NQ[tl=${k1} empty=${k2}]`",
              ].join("\n"),
            ),
          },
          {
            source: "project",
            path: "tl0nq.loom",
            // Bare tail query (NO `?`): unhandled tool_loop_exhausted at max_rounds:0.
            text: loom(
              ["description: x", "mode: subagent", "tools: read", "tool_loop:", "  max_rounds: 0"],
              "@`Read the file ch1.txt and reply with its contents.`",
            ),
          },
          {
            source: "project",
            path: "emptynq.loom",
            // Bare tail empty-template (NO `?`): unhandled validation/empty_template.
            text: loom(["description: x", "mode: subagent"], "@` `"),
          },
        ],
        drives: ["/nqparent"],
      }),
    );
    try {
      const t = probe.turns[0];
      const userText = t.userTexts.join("\n");
      // eslint-disable-next-line no-console
      console.log("STL-6 parent userTexts:", JSON.stringify(userText), "error:", t.error);
      expect(probe.registeredNames).toContain("nqparent");
      const tlMaskedCancelled = userText.includes("tl=cancelled");
      // eslint-disable-next-line no-console
      console.log("STL-6 tail-tool_loop masked-as-cancelled:", tlMaskedCancelled);
      // Conformance target: the unhandled ceiling-#2 breach reaches the parent as
      // the wrapped invoke_callee (leaf tool_loop_exhausted), NOT a fabricated
      // cancelled. The finding md documents the observed reality.
      expect(userText).toContain("tl=invoke_callee");
    } finally {
      await probe.dispose();
    }
  });

  // STL-5 — a tool NOT in the subagent's callable set is unavailable to the
  // model (ambient tools are not inherited — frontmatter.md §`tools:`). The
  // subagent declares ONLY `tools: read` and is asked to run a shell command via
  // a bash/shell tool it does not have; it should report the tool is absent
  // (return sentinel NOTOOL). Model-behaviour probe (stochastic on wording), but
  // the tool availability is deterministic: the subagent genuinely has no bash
  // tool, so it cannot execute the command.
  it("STL-5: a tool outside the subagent callable set (bash) is unavailable to the model", async () => {
    const probe = await driveOnce(() =>
      runProbe({
        provider,
        files: [
          {
            source: "project",
            path: "notinparent.loom",
            text: loom(
              ["description: x", "mode: prompt"],
              ['let r: string = invoke<string>("./notinchild.loom")?', "@`Say ok. NIS=${r}`"].join("\n"),
            ),
          },
          {
            source: "project",
            path: "notinchild.loom",
            text: loom(
              ["description: x", "mode: subagent", "tools: read"],
              "@`Run the shell command: echo LEAKBASH -- using a bash or shell tool, and report its exact output. " +
                "If you do NOT have any shell/bash tool available, reply with EXACTLY the token NOTOOL and nothing else.`",
            ),
          },
        ],
        drives: ["/notinparent"],
      }),
    );
    try {
      const t = probe.turns[0];
      const userText = t.userTexts.join("\n");
      // eslint-disable-next-line no-console
      console.log("STL-5 parent userTexts:", JSON.stringify(userText), "error:", t.error);
      expect(probe.registeredNames).toContain("notinparent");
      // eslint-disable-next-line no-console
      console.log(
        "STL-5 reports-no-bash:",
        userText.includes("NOTOOL"),
        "leaked-bash-output:",
        userText.includes("LEAKBASH"),
      );
      // The subagent must not have executed bash: its output must never appear.
      expect(userText).not.toContain("LEAKBASH");
    } finally {
      await probe.dispose();
    }
  });
});
