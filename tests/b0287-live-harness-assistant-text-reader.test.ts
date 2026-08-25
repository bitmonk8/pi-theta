import { describe, expect, it } from "vitest";
import { collectAssistantTexts, failLoudly } from "./live/harness";

// Bug 0287 — the H8a harness's `driveSlash` (`tests/live/harness.ts`)
// accumulates `text_delta` events for the WHOLE drive into one local `text`
// accumulator, fed from its `session.subscribe` callback and torn down by the
// `unsubscribe()` in its `finally`, so the accumulator's lifetime is exactly the
// pending `session.prompt()`. A prompt-mode drive issuing two on-session
// `@`-queries can therefore return only the FIRST turn's text while `userTexts`
// proves the second query rendered and was sent
// (docs/bugs/0287-driveslash-whole-drive-text-accumulator-drops-a-later-turns-stream.md).
//
// THE ASYMMETRY THIS FILE CLOSES. The other two channels of the same
// `DrivenTurn` are read off the settled in-memory `SessionManager` after
// `prompt()` resolves — `driveSlashCaptureTurn` reads the appended entry slice
// and hands it to `collectUserTexts` and `collectSystemNotes` — so neither can
// lose a late turn. §Fix item 1 makes the text channel share that source of
// truth by adding a `collectAssistantTexts` reader beside `collectUserTexts`,
// and item 2 feeds `DrivenTurn.text` from it over the same appended slice.
//
// WHY THE LOCK IS OFFLINE. The live witness (cell 89,
// `tests/live/live-production-acceptance.test.ts` lines 14853–14858) scores a
// stochastic race and needs the live provider plus repeated runs to red, per the
// bug's S3/D2 note. The reader §Fix adds is a PURE function over
// SessionManager-shaped entries, so its turn-completeness — the property the
// event accumulator lacks by construction — is assertable deterministically and
// token-free here, in the default `npm test` (vitest.config.ts, which excludes
// `tests/live/**`). Importing the live harness from the default suite is the
// established pattern (`tests/acceptance-stderr-gate.test.ts` line 88 imports
// `./live/acceptance/harness`); this harness's module-scope subagent-child pins
// (lines 62–74) are process-global but vitest isolates each test FILE in its own
// worker, so they scope to this file and resolve no provider at load.

/** One in-memory `SessionManager` message entry, shaped as the readers walk it. */
function message(role: string, content: unknown): unknown {
  return { type: "message", message: { role, content } };
}

/** A `theta-system-note` custom entry — a channel the assistant reader must not admit. */
function note(content: string): unknown {
  return { customType: "theta-system-note", content };
}

describe("bug 0287 — settled-transcript assistant-text reader", () => {
  it("exposes the reader §Fix item 1 adds beside collectUserTexts", () => {
    // Fails loudly naming the unmet precondition rather than skipping, per
    // AGENTS.md §"No silent skipping": with no reader there is nothing to score.
    if (typeof collectAssistantTexts !== "function") {
      failLoudly(
        "bug 0287 §Fix item 1 unmet: tests/live/harness.ts does not export " +
          "`collectAssistantTexts(entries)`, so `DrivenTurn.text` cannot be " +
          "derived from the settled in-memory SessionManager.",
      );
    }
  });

  it("returns assistant-role message texts in transcript order for string content", () => {
    expect(
      collectAssistantTexts([
        message("assistant", "first"),
        message("assistant", "second"),
      ]),
    ).toEqual(["first", "second"]);
  });

  it("reads text-part-array content the way collectUserTexts does", () => {
    expect(
      collectAssistantTexts([
        message("assistant", [
          { type: "text", text: "part-a" },
          { type: "text", text: "part-b" },
        ]),
      ]),
    ).toEqual(["part-a", "part-b"]);
  });

  it("ignores user, system and custom entries", () => {
    expect(
      collectAssistantTexts([
        message("user", "the rendered query"),
        message("system", "system preamble"),
        note("theta /twin returned Err: …"),
        message("assistant", "the answer"),
      ]),
    ).toEqual(["the answer"]);
  });

  it("carries EVERY turn of a two-query drive, not just the first", () => {
    // Cell 89's measured red: `turn.text` was exactly `"604"` (the typed query's
    // answer) while both rendered queries were in `userTexts`. Over the settled
    // transcript the later turn cannot be lost, whatever the event interleaving
    // was — the property the whole-drive accumulator does not have.
    const texts = collectAssistantTexts([
      message("user", "What is 471 plus 133? Answer with the number only."),
      message("assistant", "604"),
      message(
        "user",
        "A computation produced the value 524. What is that value plus 341? " +
          "Answer with the number only.",
      ),
      message("assistant", "865"),
    ]);
    expect(texts).toEqual(["604", "865"]);
    expect(texts.join("")).toContain("865");
  });
});
