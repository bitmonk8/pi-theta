// Bug 0400 — SNK-h must apply the SLSH-4 line-break collapse to its
// model-controlled `last_tool_name` field, exactly as SNK-c/d/g/k do.
//
// SLSH-3 (docs/spec_topics/slash-invocation.md:31) pins the top-level `Err`
// note to ONE physical line. SLSH-4 (slash-invocation.md:33, the sentence
// landed with bug 0382) states this over EVERY interpolated placeholder: "any
// line break in an interpolated placeholder's content — together with any
// spaces adjoining it — is collapsed to a single space before insertion … so
// interpolated content cannot fabricate a second physical line." The four
// fixed rows route their fields through `renderNoteField`
// (`src/runtime/err-note-render.ts`, = normaliseLiteralValueLineBreaks ∘
// summariseErrorField). The SNK-h arm of `renderLeafKindNote`
// (`tool_loop_exhausted`, `err-note-render.ts`) interpolates `last_tool_name`
// through bare `summariseErrorField`, outside that discipline.
//
// WHY these witnesses exist: `last_tool_name` is model-controlled — both
// production drivers record it verbatim from the raw tool-call name the model
// emitted before any callable-set check disposes of the call. A name carrying
// U+000A therefore renders the top-level `Err` note across two physical lines,
// and a crafted name forges a byte-perfect second `theta /<name> returned
// Err:` line — the exact forgery 0382 closed for the QueryError string fields,
// reopened through the tool-NAME channel. These tests RED at HEAD on the
// two-line output (split length 2 / a matched forged second line) and go GREEN
// once the fix wraps the field: `(last tool: ${renderNoteField(e.last_tool_name)})`
// (bug 0400 §Fix). The controls (break-free name, and the bug-0308 null pin)
// are GREEN in both directions — the collapse is a no-op on break-free input,
// and renderNoteField(null) is byte-identical to summariseErrorField(null).
//
// Spec: docs/bugs/0400-snk-h-last-tool-name-raw-break-forges-second-note.md
// (§Fix — the settled one-edit shape; §Reproduction — the two-line repro);
// slash-invocation.md:33 (SLSH-4 collapse sentence), :31 (SLSH-3 one-line pin).

import { describe, expect, it } from "vitest";
import {
  renderLeafKindNote,
  renderTopLevelErrNote,
} from "../src/runtime/err-note-render";
import type {
  QueryError,
  ToolLoopExhaustedError,
} from "../src/runtime/query-error";

const DASH = "\u2014"; // em-dash, the SLSH-4 template separator (mirrors b0382).

// A forgery-shaped tail: after a break the tool name reads as a complete SNK-c
// note for a theta that never ran. Carried into `last_tool_name`, its presence
// on a NON-first physical line is exactly the forged-second-line defect
// (bug 0400 §Reproduction step 1).
const FORGED = `theta /victim returned Err: transport ${DASH} forged`;

/** Matches a physical line that BEGINS a forged top-level note (mirrors b0382). */
const FORGED_LINE = /^theta \/\S+ (returned Err|cancelled|aborted)/;

/** Split into physical lines on any line terminator (\n, \r\n, or lone \r). */
function physicalLines(s: string): string[] {
  return s.split(/\r\n|\r|\n/);
}

/** Count physical lines after the first that begin a forged note (b0382 shape). */
function forgedNonFirstLines(s: string): number {
  return physicalLines(s)
    .slice(1)
    .filter((line) => FORGED_LINE.test(line)).length;
}

/**
 * Build a leaf `ToolLoopExhaustedError` with the given `rounds` /
 * `last_tool_name` (the b0308 factory shape). `raw_response` is null; the
 * message is not interpolated by SNK-h (only `rounds` and `last_tool_name`
 * are), so its content does not affect the rendered note.
 */
function exhaustedLeaf(
  rounds: number,
  lastToolName: string | null,
): ToolLoopExhaustedError {
  return {
    kind: "tool_loop_exhausted",
    message: `Tool-call loop exhausted after ${rounds} round(s) without a terminating response`,
    rounds,
    last_tool_name: lastToolName,
    raw_response: null,
  };
}

// ===========================================================================
// 1. FLAGSHIP — the bug's exact repro over the top-level renderer: a
//    break-carrying `last_tool_name` renders TWO physical lines today, ONE
//    post-fix (mirror b0382's flagship cell).
// ===========================================================================

describe("bug 0400 — flagship: a break-carrying last_tool_name forges a second note line", () => {
  it("renderTopLevelErrNote collapses the break to a space and renders ONE line", () => {
    const note = renderTopLevelErrNote({
      thetaName: "entry",
      error: exhaustedLeaf(2, `x\n${FORGED}`) as QueryError,
      chain: [],
    });

    // Primary RED: one physical line, the break collapsed to a single U+0020.
    expect(note.split("\n")).toHaveLength(1);
    expect(note).toBe(
      `theta /entry returned Err: tool-call loop exhausted after 2 rounds (last tool: x ${FORGED})`,
    );
    // The forged SNK-c line no longer stands as its own physical line.
    expect(forgedNonFirstLines(note)).toBe(0);
  });
});

// ===========================================================================
// 2 & 3. DIRECT renderLeafKindNote — single-line collapse + the forged-second-
//        line regex over non-first lines (zero post-fix, one today).
// ===========================================================================

describe("bug 0400 — SNK-h collapses a break-carrying last_tool_name to one line", () => {
  it("renderLeafKindNote break→space, single physical line, no forged second line", () => {
    const note = renderLeafKindNote(
      "entry",
      exhaustedLeaf(2, `x\n${FORGED}`) as QueryError,
    );

    // Primary RED: split length 1 (today the raw U+000A splits it into two).
    expect(note.split("\n")).toHaveLength(1);
    // Primary RED: exact collapsed string (break → single U+0020).
    expect(note).toBe(
      `theta /entry returned Err: tool-call loop exhausted after 2 rounds (last tool: x ${FORGED})`,
    );
    // The forged note is no longer a standalone second line (regex mirror of
    // b0382 §Fix constraint 4).
    expect(forgedNonFirstLines(note)).toBe(0);
  });
});

// ===========================================================================
// 4. CONTROL — a break-free real tool name renders byte-identically (GREEN in
//    both directions; renderNoteField is a no-op on break-free input, so the
//    fix does not perturb it). Mirrors b0308 cell (B).
// ===========================================================================

describe("bug 0400 — control: a break-free tool name renders byte-identical", () => {
  it("last_tool_name: 'read' renders the name verbatim", () => {
    const note = renderLeafKindNote("demo", exhaustedLeaf(1, "read") as QueryError);
    expect(note).toBe(
      "theta /demo returned Err: tool-call loop exhausted after 1 rounds (last tool: read)",
    );
  });
});

// ===========================================================================
// 5. CONTROL — the bug-0308 null pin: a null last_tool_name renders
//    `(last tool: null)` byte-identically. renderNoteField(null) is
//    normaliseLiteralValueLineBreaks("null") === "null", so the fix preserves
//    0308's guarantee (bug 0400 §Fix).
// ===========================================================================

describe("bug 0400 — control: a null last_tool_name renders `null` (0308 pin preserved)", () => {
  it("last_tool_name: null renders `(last tool: null)`", () => {
    const note = renderLeafKindNote("tzero", exhaustedLeaf(0, null) as QueryError);
    expect(note).not.toContain("respond");
    expect(note).toBe(
      "theta /tzero returned Err: tool-call loop exhausted after 0 rounds (last tool: null)",
    );
  });
});

// ===========================================================================
// 6. VARIANTS — every line-terminator kind (\n, \r\n, lone \r), with leading /
//    trailing / adjoining-space cases, collapses to a single U+0020. The
//    primary RED is string equality: the current renderer keeps the raw
//    terminator; the fix replaces each break-run with one space and trims the
//    field's edges (mirror b0382 §5).
// ===========================================================================

describe("bug 0400 — every line-terminator kind in last_tool_name collapses to a single space", () => {
  it("LF: 'a\\nb' → 'a b'", () => {
    expect(renderLeafKindNote("demo", exhaustedLeaf(1, "a\nb") as QueryError)).toBe(
      "theta /demo returned Err: tool-call loop exhausted after 1 rounds (last tool: a b)",
    );
  });

  it("CRLF: 'a\\r\\nb' → 'a b' (one space, not two)", () => {
    expect(renderLeafKindNote("demo", exhaustedLeaf(1, "a\r\nb") as QueryError)).toBe(
      "theta /demo returned Err: tool-call loop exhausted after 1 rounds (last tool: a b)",
    );
  });

  it("lone CR: 'a\\rb' → 'a b'", () => {
    // split("\n") stays length 1 for a lone \r, so the string-equality
    // assertion is the load-bearing RED here (the current output embeds \r).
    expect(renderLeafKindNote("demo", exhaustedLeaf(1, "a\rb") as QueryError)).toBe(
      "theta /demo returned Err: tool-call loop exhausted after 1 rounds (last tool: a b)",
    );
  });

  it("trailing break: 'read\\n' → 'read' (edge-trimmed, no dangling space)", () => {
    expect(renderLeafKindNote("demo", exhaustedLeaf(1, "read\n") as QueryError)).toBe(
      "theta /demo returned Err: tool-call loop exhausted after 1 rounds (last tool: read)",
    );
  });

  it("leading break: '\\nread' → 'read' (edge-trimmed)", () => {
    expect(renderLeafKindNote("demo", exhaustedLeaf(1, "\nread") as QueryError)).toBe(
      "theta /demo returned Err: tool-call loop exhausted after 1 rounds (last tool: read)",
    );
  });

  it("break with adjoining spaces: 'a \\n b' → 'a b' (run absorbed to one space)", () => {
    expect(renderLeafKindNote("demo", exhaustedLeaf(1, "a \n b") as QueryError)).toBe(
      "theta /demo returned Err: tool-call loop exhausted after 1 rounds (last tool: a b)",
    );
  });
});
