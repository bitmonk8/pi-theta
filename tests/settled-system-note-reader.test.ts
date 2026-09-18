// Offline guards for the shared live-cell note reader's two projections.
import { describe, expect, it } from "vitest";
import {
  collectSystemNoteEntries,
  collectSystemNotes,
} from "./helpers/recording-system-note-channel";

describe("settled system-note reader", () => {
  it("keeps string and text-part contents from both channels in transcript order", () => {
    const entries = [
      { customType: "other", content: "ignored" },
      { type: "message", message: { role: "assistant", content: "ignored" } },
      { customType: "theta-system-note", content: "first" },
      {
        customType: "theta-system-note",
        content: [{ text: "part one" }, { image: "ignored" }, { text: 42 }, { text: "" }, { text: "part two" }],
      },
      {
        customType: "theta-progress-entry",
        content: "not the progress payload",
        data: { content: "last" },
      },
      { customType: "theta-system-note", content: "" },
      { customType: "theta-progress-entry", data: { content: "" } },
    ];

    expect(collectSystemNotes(entries)).toEqual(["first", "part one", "", "part two", "last", "", ""]);
  });

  it("retains each note's details and text-part grouping for per-note diagnostic comparisons", () => {
    const messageDetails = { diagnostics: [{ file: "C:/project/message.theta" }] };
    const progressDetails = { diagnostics: [{ file: "C:/project/progress.theta" }] };
    const notes = collectSystemNoteEntries([
      {
        customType: "theta-system-note",
        content: [{ text: "head" }, { text: "\nrelated" }],
        details: messageDetails,
      },
      {
        customType: "theta-progress-entry",
        data: { content: "progress", details: progressDetails },
        details: { diagnostics: [{ file: "wrong outer payload" }] },
      },
    ]);

    expect(notes).toEqual([
      { contents: ["head", "\nrelated"], details: messageDetails },
      { contents: ["progress"], details: progressDetails },
    ]);
    expect(notes.map((note) => note.contents.join(""))).toEqual(["head\nrelated", "progress"]);
    expect(notes[0]?.details).toBe(messageDetails);
    expect(notes[1]?.details).toBe(progressDetails);
  });

  it("omits absent or non-string content from the text projection without dropping its note", () => {
    const details = { diagnostics: [{ file: "C:/project/empty.theta" }] };
    const entries = [
      { customType: "theta-system-note", details },
      { customType: "theta-system-note", content: 42 },
      { customType: "theta-system-note", content: [] },
      { customType: "theta-progress-entry" },
      { customType: "theta-progress-entry", data: null },
      { customType: "theta-progress-entry", data: { content: [{ text: "not a string" }], details } },
    ];

    expect(collectSystemNotes(entries)).toEqual([]);
    expect(collectSystemNoteEntries(entries)).toEqual([
      { contents: [], details },
      { contents: [], details: undefined },
      { contents: [], details: undefined },
      { contents: [], details: undefined },
      { contents: [], details: undefined },
      { contents: [], details },
    ]);
  });
});
