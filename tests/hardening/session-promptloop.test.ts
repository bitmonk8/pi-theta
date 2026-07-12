// Hardening lens: PROMPT-MODE tool_loop.max_rounds ENFORCEMENT (ceiling #2 /
// CIO-4), Phase 4 STAGE B.
//
// Background: prompt-mode queries stream via pi's NATIVE agentic turn
// (`LivePromptQueryModel` -> `pi.sendUserMessage` + `waitForIdle`, SLSH-2 /
// Phase 3a) with the loom's callable-set tools installed (QTL-4). pi runs its
// internal tool loop for that turn, which the loom's `max_rounds` did NOT bound
// (QTL-4 twin of the subagent STL-2). STAGE B bounds that native loop through
// pi's extension hooks (`before_provider_request` round boundaries + `tool_call`
// block) so a tool-use round beyond `max_rounds` is blocked and the query
// surfaces `Err(QueryError { kind: "tool_loop_exhausted", rounds, last_tool_name })`.
//
// Method: a PROMPT-mode loom with `tools: read` reads a 3-file chain
// (ch1 -> ch2 -> ch3, like STL-2) ONE file at a time — reaching the final marker
// provably requires >= 3 sequential read rounds.
//   * max_rounds: 1  => the cap fires after round 1; the loom returns Err at the
//     tail (unhandled), so the slash boundary emits the SNK-h note.
//   * default (25)   => the chain completes (final marker reached), no exhaustion.
//
// Findings: PL-1 (tests/hardening/session-findings/promptloop.md). Spec:
// frontmatter.md (FRNT-1), hard-ceilings.md (ceiling #2 / CIO-4),
// errors-and-results.md (ERR-19), discovery-cli.md (SNK-h).

import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe } from "./probe-harness";
import type { PlantedFile } from "./probe-harness";

const provider = requireLiveProvider();

// Three chained files: each names the next, forcing SEQUENTIAL read rounds.
// Reaching CHAINDONE777 requires reading ch3, whose name is known only from ch2,
// whose name is known only from ch1 => >= 3 sequential tool rounds.
const CHAIN: readonly PlantedFile[] = [
  { source: "rel", path: "ch1.txt", text: "STEP1 done. Next, read the file ch2.txt to continue." },
  { source: "rel", path: "ch2.txt", text: "STEP2 done. Next, read the file ch3.txt to continue." },
  {
    source: "rel",
    path: "ch3.txt",
    text: "STEP3 done. The final marker is CHAINDONE777. Stop; do not read any more files.",
  },
];

const CHAIN_QUERY =
  "@`Read the file ch1.txt. Each file names the next file to read. Read exactly ONE " +
  "file at a time, following the chain, until a file gives you a final marker token. " +
  "Reply with EXACTLY that marker token and nothing else.`";

/** Retry once on a transport/429 blip (never a silent skip). */
async function driveOnce<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/429|transport|rate/i.test(msg)) return await run();
    throw e;
  }
}

describe("prompt-mode tool_loop.max_rounds enforcement (ceiling #2 / STAGE B)", () => {
  // PL-1 — the cap fires. A >=3-round chain under max_rounds:1 exhausts after
  // round 1; the unhandled tail Err surfaces the SNK-h note at the slash
  // boundary (SLSH-3 / SNOTE-1 path).
  it(
    "PL-1: a prompt-mode tool_loop.max_rounds:1 vs a forced 3-round chain fires ceiling #2 (SNK-h note)",
    { retry: 1, timeout: 180000 },
    async () => {
      const probe = await driveOnce(() =>
        runProbe({
          provider,
          files: [
            ...CHAIN,
            {
              source: "project",
              path: "ploop1.loom",
              text: [
                "---",
                "description: ploop1",
                "mode: prompt",
                "tools: read",
                "tool_loop:",
                "  max_rounds: 1",
                "---",
                CHAIN_QUERY,
              ].join("\n"),
            },
          ],
          drives: ["/ploop1"],
        }),
      );
      try {
        const t = probe.turns[0];
        const notes = t.systemNotes.join("\n");
        // eslint-disable-next-line no-console
        console.log("PL-1 systemNotes:", JSON.stringify(t.systemNotes));
        // eslint-disable-next-line no-console
        console.log("PL-1 assistantText:", JSON.stringify(t.assistantText), "error:", t.error);
        expect(probe.registeredNames).toContain("ploop1");
        // The cap fired: the SNK-h template names the round count of 1. The
        // last-tool suffix is model-dependent (the blocked tool, likely `read`),
        // so match the stable prefix through "after 1 rounds".
        const snkHPrefix = "loom /ploop1 returned Err: tool-call loop exhausted after 1 rounds";
        // eslint-disable-next-line no-console
        console.log("PL-1 SNK-h prefix present:", notes.includes(snkHPrefix));
        expect(notes).toContain(snkHPrefix);
        // The chain never completed under the cap of 1.
        expect(notes).not.toContain("CHAINDONE777");
      } finally {
        await probe.dispose();
      }
    },
  );

  // PL-1 control — default max_rounds (25) completes the chain: the model runs
  // the full >=3-round read loop, reaches the final marker, and NO exhaustion
  // note is emitted.
  it(
    "PL-1 control: the SAME loom with default max_rounds completes the chain (no exhaustion)",
    { retry: 1, timeout: 180000 },
    async () => {
      const probe = await driveOnce(() =>
        runProbe({
          provider,
          files: [
            ...CHAIN,
            {
              source: "project",
              path: "ploopdef.loom",
              text: [
                "---",
                "description: ploopdef",
                "mode: prompt",
                "tools: read",
                "---",
                CHAIN_QUERY,
              ].join("\n"),
            },
          ],
          drives: ["/ploopdef"],
        }),
      );
      try {
        const t = probe.turns[0];
        const notes = t.systemNotes.join("\n");
        // eslint-disable-next-line no-console
        console.log("PL-1-control assistantText:", JSON.stringify(t.assistantText));
        // eslint-disable-next-line no-console
        console.log("PL-1-control systemNotes:", JSON.stringify(t.systemNotes), "error:", t.error);
        expect(probe.registeredNames).toContain("ploopdef");
        // The multi-round loop ran end-to-end and reached the final marker.
        expect(t.assistantText).toContain("CHAINDONE777");
        // No cap fired: no SNK-h tool_loop_exhausted note.
        expect(notes).not.toContain("tool-call loop exhausted");
        expect(t.error).toBeUndefined();
      } finally {
        await probe.dispose();
      }
    },
  );
});
