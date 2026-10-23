// B0520 / approved Option A: runtime pass-through is intentional; the defect
// is the missing author warning. Keep this offline isolation additive to the
// immutable real-host hybrid witness, not a replacement for its prerequisites.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  filterJoinToolText,
  lowerResolvedToolEnvelope,
  type ToolContentBlock,
} from "../src/runtime/tool-call-execute";
import { makeOk } from "../src/runtime/value";

const regions = [
  {
    name: "tool-calls",
    path: "docs/spec_topics/tool-calls.md",
    start: "**Return type.**",
    end: "**Failures.**",
  },
  {
    name: "host-interfaces-core",
    path: "docs/spec_topics/pi-integration-contract/host-interfaces-core.md",
    start: '<a id="tool-execution-from-theta-code"></a>',
    end: '<a id="agentsession-interface"></a>',
  },
] as const;
// Exactly the six previously accepted editorial predicates, not new prose
// clauses or approval for spec edits. Whitespace folding is editorial only.
const predicates: readonly [string, string, (text: string) => boolean][] = [
  ["empty placeholder", "(no output)", text => text.includes("(no output)")],
  ["presentation channel", "model-facing", text => /model-facing/i.test(text)],
  ["pass-through", "verbatim", text => /verbatim/i.test(text)],
  ["not raw capture", "not raw", text => /not (?:exact|raw)/i.test(text)],
  ["truncation", "truncation", text => /truncat/i.test(text)],
  ["caller mitigation", "sentinel", text => /sentinel|structured marker/i.test(text)],
];

function assertWarning(text: string, region: string, name: string, predicate: (text: string) => boolean): void {
  expect(predicate(text.replace(/\s+/g, " ")), `B0520 ${region} rendered bash warning: ${name}`).toBe(true);
}

for (const region of regions) {
  describe(`B0520 author documentation: ${region.name}`, () => {
    // Separate cases expose all missing topics instead of stopping after the
    // first marker as the preserved end-to-end witness necessarily does.
    it.each(predicates)("documents %s", (name, _marker, predicate) => {
      const document = readFileSync(resolve(process.cwd(), region.path), "utf8");
      const start = document.indexOf(region.start);
      const end = document.indexOf(region.end, start + region.start.length);
      expect(start, `B0520 ${region.name} documentation start boundary`).toBeGreaterThanOrEqual(0);
      expect(end, `B0520 ${region.name} documentation end boundary`).toBeGreaterThan(start);
      assertWarning(document.slice(start, end), region.name, name, predicate);
    });
  });
}

describe("B0520 healthy controls", () => {
  it.each(predicates)("editorial oracle accepts and independently rejects %s", (name, marker, predicate) => {
    // Synthetic test-only coverage fixture, never evidence of a runtime or
    // source-document failure. Independent semantic prose review is required.
    const synthetic = predicates.map(([, token]) => token).join("\n");
    assertWarning(synthetic, "synthetic-control", name, predicate);
    expect(() => assertWarning(synthetic.replace(marker, ""), "synthetic-control", name, predicate))
      .toThrow(`B0520 synthetic-control rendered bash warning: ${name}`);
  });

  const cases: readonly [string, readonly ToolContentBlock[], string][] = [
    ["empty content really is empty", [], ""],
    ["no text really is empty", [{ type: "image", data: "not text" }], ""],
    ["empty text really is empty", [{ type: "text", text: "" }], ""],
    ["host empty placeholder stays nonempty", [{ type: "text", text: "(no output)" }], "(no output)"],
    ["genuine literal output stays nonempty", [{ type: "text", text: "(no output)" }], "(no output)"],
    ["healthy output stays unchanged", [{ type: "text", text: "healthy-0520" }], "healthy-0520"],
    ["caller sentinel stays unchanged", [{ type: "text", text: "__B0520_END__" }], "__B0520_END__"],
    ["whitespace is not trimmed", [{ type: "text", text: " \n\t" }], " \n\t"],
    ["rendered trailer is not parsed", [{ type: "text", text: "tail\n\n[Showing lines 2-3 of 3. Full output: /synthetic/only]" }], "tail\n\n[Showing lines 2-3 of 3. Full output: /synthetic/only]"],
    ["only text blocks join, including empty segments", [{ type: "text", text: "" }, { type: "image", data: "ignored" }, { type: "text", text: "(no output)" }], "\n(no output)"],
  ];
  it.each(cases)("lowering: %s", (_name, content, expected) => {
    const sink = { diagnostic: vi.fn(), systemNote: vi.fn() };
    expect(filterJoinToolText(content)).toBe(expected);
    const result = lowerResolvedToolEnvelope({ content }, sink);
    expect(result).toEqual(makeOk(expected));
    expect(sink.diagnostic).not.toHaveBeenCalled();
    expect(sink.systemNote).not.toHaveBeenCalled();
  });

  it("lowering reads content, not opaque details or a raw-looking auxiliary field", () => {
    const sink = { diagnostic: vi.fn(), systemNote: vi.fn() };
    const envelope = {
      content: [{ type: "text", text: "(no output)" }],
      // Synthetic envelope: these must not become a new output-capture API.
      details: { output: "" },
      structuredContent: { output: "", exit_code: 0 },
    };
    const result = lowerResolvedToolEnvelope(envelope, sink);
    expect(result).toEqual(makeOk("(no output)"));
    expect("(no output)" === String("")).toBe(false);
    expect("(no output)".trim() === "").toBe(false);
    expect(sink.diagnostic).not.toHaveBeenCalled();
    expect(sink.systemNote).not.toHaveBeenCalled();
  });
});
