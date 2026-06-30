import { describe, expect, it } from "vitest";
import { createLoomExtension } from "../src/extension/factory";
import { buildMinimalLoom } from "../src/mvp/minimal-loom";
import { SessionDouble } from "./harness/index";

// M-T — failing tests for the minimal end-to-end `.loom` slash command. These
// pin SLSH-2's MVP happy path: a single in-memory `.loom` source is discovered,
// registered as a slash command, dispatched, its `mode:` frontmatter parsed,
// and its single untyped `@`-query issued as one prompt-mode turn whose streamed
// assistant response appends as a single appended turn to the caller's
// conversation. The `buildMinimalLoom` seam is stubbed inert until `M` lands the
// prompt-mode drive, so these assertions red on the absent pipeline.
//
// The harness path used below is the H4a end-to-end harness surface
// (`SessionDouble` + `createLoomExtension` + `fireSessionStart` + `dispatch`):
// the in-memory fixture-supply mechanism feeds the source-derived fixture
// through `LoomExtensionDeps.fixtures`, so no ambient `src/**` filesystem read
// and no `FileSystem` seam is involved.

/** Assemble the minimal prompt-mode `.loom` source for a single untyped query. */
function promptLoom(queryLiteral: string): string {
  return ["---", "mode: prompt", "---", "@`" + queryLiteral + "`", ""].join(
    "\n",
  );
}

describe("M-T — minimal end-to-end .loom slash command (SLSH-2)", () => {
  it("SLSH-2: a dispatched prompt-mode loom issues one untyped @-query and streams its assistant response into the user session as one appended turn", async () => {
    const double = new SessionDouble();
    // The model's streamed assistant response for the single driven turn.
    double.programResponse(["Hel", "lo, ", "world."]);

    const fixture = buildMinimalLoom(
      { slashName: "greet", source: promptLoom("Greet the user.") },
      double.pi,
    );
    createLoomExtension({ fixtures: [fixture] })(double.pi);
    double.fireSessionStart();

    // Discovered source registered as a slash command (the registerCommand seam).
    expect(double.commands.has("greet")).toBe(true);

    await double.dispatch("greet", "");

    // Exactly one untyped @-query was issued as a user turn carrying the
    // rendered query-template literal.
    const userTurns = double.transcript.filter((m) => m.role === "user");
    expect(userTurns).toHaveLength(1);
    expect(userTurns[0]?.text).toBe("Greet the user.");

    // The assistant response streamed (tokens observed) and committed as one
    // appended prompt-mode turn carrying the accumulated text.
    expect(
      double.events.filter((e) => e === "stream-token").length,
    ).toBeGreaterThan(0);
    const assistantTurns = double.transcript.filter(
      (m) => m.role === "assistant",
    );
    expect(assistantTurns).toHaveLength(1);
    expect(assistantTurns[0]?.text).toBe("Hello, world.");
    expect(assistantTurns[0]?.streaming).toBe(false);
  });

  it("SLSH-2: running the fixture loom through the harness produces exactly one appended turn and no diagnostic", async () => {
    const double = new SessionDouble();
    double.programResponse(["acknowledged"]);

    const fixture = buildMinimalLoom(
      { slashName: "do-thing", source: promptLoom("Do the thing.") },
      double.pi,
    );
    createLoomExtension({ fixtures: [fixture] })(double.pi);
    double.fireSessionStart();

    await double.dispatch("do-thing", "");

    // Exactly one appended turn: one user query + its one streamed assistant
    // response, and nothing more.
    expect(double.transcript).toHaveLength(2);
    expect(double.transcript.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);

    // The happy path surfaces no diagnostic (no `loom-system-note` emitted via
    // the `pi.sendMessage` diagnostics channel).
    expect(double.systemNotes).toHaveLength(0);
  });
});
