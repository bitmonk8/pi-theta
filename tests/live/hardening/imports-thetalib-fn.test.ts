import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe } from "./probe-harness";

// IMPORTS & .thetalib MODULES — a query inside an imported function.
//
// Spec imports.md §.thetalib file rules: a query inside an imported thetalib
// function executes against the *calling* `.theta`'s conversation. That
// cross-file query-attachment axis is covered nowhere else: the default suite
// pins import RESOLUTION (imports.test.ts, export-visibility.test.ts) but never
// executes an imported fn that issues a query, and the H9a live fixture
// (acc-imports-invoke.theta) calls only a PURE imported fn. Pinned
// deterministically via `turn.userTexts` (the query text the theta code
// computed), one short live turn.
//
// (The former IMP-F — an imported PURE fn is callable and interpolable — was
// removed: H9a area (g) drives exactly that live through the real `pi -p`.)

describe("imports & .thetalib — imported functions", () => {
  const provider = requireLiveProvider();

  // IMP-G — a thetalib fn that itself issues a `@`-query. Spec: that query executes
  // against the CALLING .theta's conversation. Deterministic check: the thetalib
  // fn's query text appears in the caller's user-turn texts.
  it("IMP-G: a thetalib fn's @-query attaches to the caller conversation", async () => {
    const probe = await runProbe({
      provider,
      files: [
        {
          source: "project",
          path: "main.theta",
          text: [
            "---",
            "description: thetalib fn query",
            "mode: prompt",
            "---",
            'import { ask } from "./lib.thetalib"',
            "let answer = ask()?",
            "@`caller done ${answer}`",
          ].join("\n"),
        },
        {
          source: "project",
          path: "lib.thetalib",
          text: [
            "fn ask(): Result<string, QueryError> {",
            "  @`THETALIB_FN_QUERY_SENTINEL respond with the single word ok`",
            "}",
          ].join("\n"),
        },
      ],
      drives: ["/main"],
    });
    try {
      const turn = probe.turns[0];
      // eslint-disable-next-line no-console
      console.log("IMP-G registered:", JSON.stringify(probe.registeredNames));
      // eslint-disable-next-line no-console
      console.log("IMP-G userTexts:", JSON.stringify(turn?.userTexts));
      // eslint-disable-next-line no-console
      console.log("IMP-G error:", turn?.error);
      // eslint-disable-next-line no-console
      console.log("IMP-G diagnostics:", JSON.stringify(probe.diagnostics.map((d) => d.message)));
      const allUser = (turn?.userTexts ?? []).join("\n");
      expect(
        allUser.includes("THETALIB_FN_QUERY_SENTINEL"),
        `expected thetalib fn query text in caller user turns; userTexts=${JSON.stringify(
          turn?.userTexts,
        )} error=${turn?.error}`,
      ).toBe(true);
    } finally {
      await probe.dispose();
    }
  });
});
