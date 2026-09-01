// Bug 0308 — live RED witness: a prompt-mode theta with
// `tool_loop: { max_rounds: 0 }` whose body ends in an UNHANDLED untyped tail
// query exhausts at initialisation (zero provider turns; `slot_count ==
// max_rounds`, 0 == 0) and surfaces the SNK-h note at the slash boundary. The
// buggy tree renders `(last tool: respond)` — a tool the untyped query never
// registered and never called — because `renderLeafKindNote`'s SNK-h arm
// (`src/runtime/err-note-render.ts`) swapped the REACHABLE `last_tool_name:
// null` for the literal `respond`.
//
// This cell asserts the deterministic, model-independent part of the note: the
// `after 0 rounds` exhaustion prefix is present AND the note carries no
// `respond`. RED at the pre-fix tree; GREEN once both `?? "respond"` arms are
// dropped and the null field renders through summariseErrorField as `null`.
//
// Zero provider turns are issued for the failing query (the loop exhausts
// before the first send), so this is a token-free live repro.
//
// Modeled on tests/live/hardening/session-promptloop.test.ts (PL-1): the
// child-process pins (executable, PI_THETA_SUBAGENT_EXTENSION_PIN, parent-pid)
// are established at module scope by probe-harness.ts (imported below), and
// requireLiveProvider() fails LOUDLY on a missing provider/model — never a
// silent skip. Do NOT weaken this test to green it against the pre-fix tree:
// per AGENTS.md it is a documented correct-reason red while bug 0308 is open.
//
// Spec: frontmatter.md (FRNT-1, `max_rounds` non-negative integer),
// hard-ceilings.md (ceiling #2 / CIO-4, the `max_rounds: 0` boundary),
// errors-and-results.md (ERR-19), slash-invocation.md (SNK-h / SLSH-3).

import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe, turnAt } from "./probe-harness";

const provider = requireLiveProvider();

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

describe("bug 0308 — cap-0 untyped exhaustion note (SNK-h null last_tool_name)", () => {
  // A mode: a prompt-mode theta with max_rounds: 0 whose body ends in an
  // unhandled untyped tail query. The loop exhausts at once; the unhandled
  // tail Err surfaces the SNK-h note through the slash boundary (SLSH-3).
  it(
    "the SNK-h note carries `after 0 rounds` and does NOT fabricate a `respond` tool",
    { retry: 1, timeout: 180000 },
    async () => {
      const probe = await driveOnce(() =>
        runProbe({
          provider,
          files: [
            {
              source: "project",
              path: "tzero0.theta",
              text: [
                "---",
                "description: tzero0",
                "mode: prompt",
                "tool_loop:",
                "  max_rounds: 0",
                "---",
                "@`anything`",
              ].join("\n"),
            },
          ],
          drives: ["/tzero0"],
        }),
      );
      try {
        const t = turnAt(probe);
        const notes = t.systemNotes.join("\n");
        // eslint-disable-next-line no-console
        console.log("b0308 systemNotes:", JSON.stringify(t.systemNotes));
        expect(probe.registeredNames).toContain("tzero0");
        // The cap-0 exhaustion fired: the SNK-h template names 0 rounds.
        expect(notes).toContain(
          "theta /tzero0 returned Err: tool-call loop exhausted after 0 rounds",
        );
        // The untyped query registered no `respond` tool and called nothing —
        // the note must not name one (bug 0308's fabricated-name symptom).
        expect(notes).not.toContain("respond");
      } finally {
        await probe.dispose();
      }
    },
  );
});
