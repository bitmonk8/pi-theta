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
//
// Dedupe: the PROMPT-mode twin (native pi tool loop + ceiling) lives in
// session-promptloop.test.ts — a different code path. This file keeps only the
// two probes whose live axis is uncovered elsewhere: STL-1 (a real model
// actually drives a MULTI-round tool loop inside a spawned subagent) and STL-2
// (ceiling #2 fires against a real model under a low `max_rounds`). The former
// STL-3/4/5/6 shape/note/kind-preservation probes were removed: their
// assertions (ERR-19 inner shape, SNK-h template, XMODE-1 wrapping, callable-set
// admission) are pinned offline by queryerror-variants / err-note-render /
// off-session-two-phase / subagent-tool-admission in the default suite.
//
// Token discipline: STL-1/2 each drive one live turn (plus the child's bounded
// chain rounds). Live drives retry once on a transport/429 (not a finding).
//
// Drive discriminators are answers to task questions, never a verbatim-echo
// demand: "reply with exactly …" reads as prompt injection to current models
// and draws refusals (the sentinel-refusal class, bug 0243; this file swept by
// bug 0254). The expected value 7271 occurs in no prompt and no planted file —
// only ch3.txt's planted 4271 plus the instruction's fixed addend 3000
// produces it — so a 7271 in the parent's userTexts witnesses chain
// completion, not an echo. STL-2's OUTCOME[...] tail is read back out of the
// parent's own query text (t.userTexts); its trailing arithmetic question only
// proves a real turn ran.

import { describe, it, expect } from "vitest";
import { chainFixture, driveProbeWithRetries } from "../../helpers/live-probe-helpers";
import { requireLiveProvider, runProbe, turnAt } from "./probe-harness";

const provider = requireLiveProvider();

function theta(front: string[], body: string): string {
  return ["---", ...front, "---", body].join("\n");
}

const { files: CHAIN_FILES, instruction: CHAIN_INSTRUCTION } = chainFixture(4271, 3000);

describe("subagent model-driven tool loops + ceiling #2", () => {
  // STL-1 — MULTI-ROUND tool loop inside a spawned subagent works. Default
  // max_rounds (25). A prompt parent invokes the subagent and interpolates its
  // returned value into its own observable final query. The chain forces >= 3
  // sequential read rounds; a returned 7271 (the planted 4271 plus 3000) proves
  // the multi-round loop ran end-to-end (SUBAG-2 confirmed only a single read).
  it("STL-1: a multi-round subagent tool loop (chained reads) completes and returns the computed number", async () => {
    const { probe } = await driveProbeWithRetries(() =>
      runProbe({
        provider,
        files: [
          ...CHAIN_FILES,
          {
            source: "project",
            path: "mrparent.theta",
            text: theta(
              ["description: x", "mode: prompt"],
              ['let r: string = invoke<string>("./mrchild.theta")?', "@`Say ok. MR=${r}`"].join("\n"),
            ),
          },
          {
            source: "project",
            path: "mrchild.theta",
            // default tool_loop (max_rounds: 25) — plenty for the 3-round chain.
            text: theta(["description: x", "mode: subagent", "tools: read"], "@`" + CHAIN_INSTRUCTION + "`"),
          },
        ],
        drives: ["/mrparent"],
      }),
    );
    try {
      const t = turnAt(probe);
      const userText = t.userTexts.join("\n");
      // eslint-disable-next-line no-console
      console.log("STL-1 parent userTexts:", JSON.stringify(userText), "error:", t.error);
      expect(probe.registeredNames).toContain("mrparent");
      // eslint-disable-next-line no-console
      console.log("STL-1 chain-number-received:", userText.includes("7271"));
      // Multi-round subagent tool loop works: the final computed number crossed the boundary.
      expect(userText).toContain("7271");
    } finally {
      await probe.dispose();
    }
  });

  // STL-2 — ceiling #2 under a LOW max_rounds. Same forced >=3-round chain, but
  // the subagent declares `tool_loop.max_rounds: 1`. Per FRNT-1/CIO-4 a query
  // that loops tools past its cap must surface Err(tool_loop_exhausted, rounds:1).
  // The prompt parent classifies the invoke outcome (Ok vs the wrapped callee
  // Err). If the cap is enforced -> CALLEE=tool_loop_exhausted; if the spawned
  // AgentSession absorbs the rounds -> OK=7271 (cap of 1 never tripped despite
  // >=3 rounds) — the potential defect (subagent twin of QTL-4).
  it("STL-2: a subagent tool_loop.max_rounds:1 vs a forced 3-round chain — does ceiling #2 fire?", async () => {
    const { probe } = await driveProbeWithRetries(() =>
      runProbe({
        provider,
        files: [
          ...CHAIN_FILES,
          {
            source: "project",
            path: "capparent.theta",
            text: theta(
              ["description: x", "mode: prompt"],
              [
                'let res = invoke<string>("./capchild.theta")',
                "let outcome = match res {",
                "  Ok(v) => v,",
                '  Err(e) => match e.kind { "invoke_callee" => e.inner.kind, _ => e.kind }',
                "}",
                "@`OUTCOME[${outcome}] What is 731 plus 154? Answer with the number only.`",
              ].join("\n"),
            ),
          },
          {
            source: "project",
            path: "capchild.theta",
            text: theta(
              ["description: x", "mode: subagent", "tools: read", "tool_loop:", "  max_rounds: 1"],
              "@`" + CHAIN_INSTRUCTION + "`",
            ),
          },
        ],
        drives: ["/capparent"],
      }),
    );
    try {
      const t = turnAt(probe);
      const userText = t.userTexts.join("\n");
      // eslint-disable-next-line no-console
      console.log("STL-2 parent userTexts:", JSON.stringify(userText), "error:", t.error);
      expect(probe.registeredNames).toContain("capparent");
      const capEnforced = userText.includes("tool_loop_exhausted");
      const capAbsorbed = userText.includes("7271");
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

});
