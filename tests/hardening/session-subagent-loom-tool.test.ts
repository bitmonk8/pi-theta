// Hardening lens: MODEL-CALLABLE `.loom` (SUBAG-2 residual) end-to-end.
//
// Probes the runtime behaviour a subagent-mode loom that lists another `.loom`
// in its `tools:` — the model-driven side of the callable set. A subagent
// parent (`tools: ./child.loom`) is asked, in an `@`-query, to CALL the `child`
// tool (the MODEL decides to emit the `tool_use` block, not loom code), and the
// child is a subagent loom that returns an exact sentinel with ZERO model turns
// (a literal-tail body). The child's returned value flows: child → tool-result
// → the parent model's reply → the subagent parent's return value → the prompt
// grandparent's observable final `@`-query.
//
// Spec anchors:
//   * tool-calls.md — the callable set is SHARED between the model-driven and
//     code-driven paths; the model sees the same `.loom` callables.
//   * pi-integration-contract/extension-bootstrap-and-per-loom.md §Per-loom
//     registration — a `.loom`-as-tool `ToolDefinition` (subagent mode:
//     installed as a `defineTool` customTool on `createAgentSession`).
//   * pi-integration-contract/tool-registration-lifetime.md §"Subagent mode".
//
// Determinism posture: the DETERMINISTIC channels (all three looms register
// with no rejecting diagnostic — the `.loom`-in-`tools:` resolved and was
// exposed, not load-rejected) are hard assertions and fail loudly. Whether the
// LIVE model actually emits the `tool_use` for the `.loom` is best-effort
// (logged), matching the file's twin deterministic seam test
// (`tests/subagent-model-loom-tool.test.ts`), which proves the adapter + the
// exposed customTools/tools/tool-schemas surface without a live model.
//
// Token discipline: the child body is a literal tail (0 child model turns); the
// only live turns are the parent subagent's tool-loop and the grandparent's
// final `@` interpolation turn.

import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe } from "./probe-harness";
import type { ProbeResult } from "./probe-harness";

const provider = requireLiveProvider();

function transportish(s: string | undefined): boolean {
  if (s === undefined) return false;
  return /429|overloaded|transport|rate.?limit|ECONNRESET|timeout|503|529/i.test(s);
}

/** Run a probe; if the last drive errored transport-ish, retry once (429 is not a finding). */
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

const SENTINEL = "LOOMTOOL-SENTINEL-7788";

describe("model-callable `.loom` (SUBAG-2): a subagent parent exposes a `.loom` tool to its model", () => {
  it("registers all three looms and (best-effort) surfaces the child sentinel via a model tool_use", async () => {
    const probe = await driveOnce(() =>
      runProbe({
        provider,
        files: [
          {
            // Prompt grandparent: `invoke`s the subagent parent and interpolates
            // its returned value into an OBSERVABLE final query (the subagent
            // parent's own transcript is private under SLSH-2, so this is the
            // only surface the child value can be read from deterministically).
            source: "project",
            path: "gptool.loom",
            text: loom(
              ["description: x", "mode: prompt"],
              [
                'let r: string = invoke<string>("./subtoolparent.loom")?',
                "@`RESULT=${r}`",
              ].join("\n"),
            ),
          },
          {
            // Subagent parent exposing the `.loom` callable to its MODEL. The
            // query instructs the model to CALL the tool and echo its return.
            source: "project",
            path: "subtoolparent.loom",
            text: loom(
              ["description: x", "mode: subagent", "tools: ./echochild.loom"],
              "@`You have one tool named \"echochild\". Call it now with no arguments, then reply with EXACTLY the text the tool returned and nothing else — no quotes, no prose.`",
            ),
          },
          {
            // Subagent child callee: returns the exact sentinel with a literal
            // tail (ZERO model turns), so the value that crosses the tool
            // boundary is fully deterministic.
            source: "project",
            path: "echochild.loom",
            text: loom(["description: x", "mode: subagent"], `"${SENTINEL}"`),
          },
        ],
        drives: ["/gptool"],
      }),
    );
    try {
      const t = probe.turns[0];
      const userText = t.userTexts.join("\n");
      // eslint-disable-next-line no-console
      console.log(
        "LOOMTOOL registered:",
        JSON.stringify(probe.registeredNames),
        "diagnostics:",
        JSON.stringify(probe.diagnostics),
        "parent userTexts:",
        JSON.stringify(userText),
        "error:",
        t.error,
      );

      // DETERMINISTIC (hard): all three looms load and register. Critically the
      // subagent parent registered WITH `tools: ./echochild.loom` present — a
      // `.loom` entry in a subagent's `tools:` is NOT load-rejected (that is a
      // prompt-mode-only rejection), so the callable resolved and was exposed.
      expect(probe.registeredNames).toContain("gptool");
      expect(probe.registeredNames).toContain("subtoolparent");
      expect(probe.registeredNames).toContain("echochild");
      // No rejecting load diagnostic against the `.loom`-in-`tools:` surface.
      const rejects = probe.diagnostics.filter(
        (d) =>
          d.severity === "error" &&
          /loom\/load\/(prompt-mode-callable|unresolvable-loom-path|unknown-tool)/.test(d.code),
      );
      expect(rejects, JSON.stringify(rejects)).toHaveLength(0);

      // BEST-EFFORT (logged, not asserted): whether the live model actually
      // emitted the `tool_use` for the `.loom` callable this run. The
      // deterministic adapter + exposed-tool-set proof lives in the twin seam
      // test `tests/subagent-model-loom-tool.test.ts`.
      const sentinelSurfaced = !transportish(t.error) && userText.includes(SENTINEL);
      // eslint-disable-next-line no-console
      console.log("LOOMTOOL sentinel-surfaced (best-effort live call):", sentinelSurfaced);
    } finally {
      await probe.dispose();
    }
  });
});
