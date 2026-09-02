// Bug 0382 — the SLSH-3 top-level `Err` note must render as ONE physical line.
//
// A top-level `QueryError` at the slash-dispatch boundary is rendered by
// `renderTopLevelErrNote` / `renderLeafKindNote` (src/runtime/err-note-render.ts),
// whose SNK rows interpolate string-valued fields through `summariseErrorField`
// (src/runtime/err-field-summary.ts:94-95), which returns a string verbatim (the
// bug-0177 law, clause 1). No seam applies any line discipline, so a field that
// carries a line break (the ordinary shape of a stack-bearing `Error.message`,
// lowered by `lowerToolExecuteThrow` at src/runtime/tool-call-execute.ts:234-243
// with breaks intact) fabricates a second physical line that reads as a
// byte-perfect SNK note for a theta that never ran — while SLSH-3
// (slash-invocation.md:31) pins "a one-line system note".
//
// WHY these witnesses exist: the fix collapses each line break — with any
// adjoining horizontal whitespace — to a single U+0020 in the interpolated
// message/tool_name/cause/kind fields of the reachable interpolating rows
// (SNK-c transport, SNK-d model_tool reserved, SNK-g code_tool, SNK-k
// catch-all) of `renderLeafKindNote` (`src/runtime/err-note-render.ts`),
// leaving break-free fields byte-identical. These tests therefore RED at the current
// (unfixed) tree on their primary string-equality / split-length assertions and
// go GREEN once the seam collapses breaks. The controls (break-free fields) are
// GREEN in both directions — they prove the discipline is a no-op on break-free
// input.
//
// Spec: docs/bugs/0382-slsh3-err-note-renders-raw-breaks-forged-second-note.md
// (§Reproduction — the flagship production-path repro; §Expected behaviour —
// SLSH-3 one-line pin; §Fix constraint 4 — the four witness obligations).

import { describe, expect, it } from "vitest";
import {
  renderLeafKindNote,
  renderTopLevelErrNote,
} from "../src/runtime/err-note-render";
import type {
  CodeToolError,
  ModelToolError,
  QueryError,
  TransportError,
} from "../src/runtime/query-error";
import { lowerToolExecuteThrow } from "../src/runtime/tool-call-execute";

const DASH = "\u2014"; // em-dash, the SLSH-4 template separator (mirrors tests/err-note-render.test.ts).

// A forgery-shaped payload: after a break this line reads as a complete SNK-c
// note for a theta that never ran. Its presence on a NON-first physical line is
// exactly the forged-second-line defect (bug 0382 §Reproduction).
const FORGED = `theta /ghost returned Err: transport ${DASH} forged`;

/** Matches a physical line that BEGINS a forged top-level note (bug 0382 §Fix constraint 4). */
const FORGED_LINE = /^theta \/\S+ (returned Err|cancelled|aborted)/;

/** Split into physical lines on any line terminator (\n, \r\n, or lone \r). */
function physicalLines(s: string): string[] {
  return s.split(/\r\n|\r|\n/);
}

/** Count physical lines after the first that begin a forged note. */
function forgedNonFirstLines(s: string): number {
  return physicalLines(s)
    .slice(1)
    .filter((line) => FORGED_LINE.test(line)).length;
}

// --- Leaf factories (mirror tests/err-note-render.test.ts) ------------------

function transport(message: string): TransportError {
  return {
    kind: "transport",
    message,
    http_status: null,
    provider: "anthropic-messages",
    retryable: true,
  };
}

function modelTool(tool_name: string, message: string): ModelToolError {
  return {
    kind: "model_tool",
    message,
    tool_name,
    tool_call_id: "toolu_1",
    raw_response: null,
  };
}

function codeTool(
  tool_name: string,
  cause: CodeToolError["cause"],
  message: string,
): CodeToolError {
  return { kind: "code_tool", message, tool_name, cause };
}

/** Build an arbitrary leaf shape as a `QueryError` (ERR-15 discriminator openness). */
function leafOf(fields: Record<string, unknown>): QueryError {
  return fields as unknown as QueryError;
}

// ===========================================================================
// 1. FLAGSHIP — the bug's exact repro over the production lowering path.
// ===========================================================================

describe("bug 0382 — flagship: a multi-line code-tool Error.message forges a second note line", () => {
  it("lowerToolExecuteThrow → renderTopLevelErrNote renders ONE line (break collapsed to a space)", () => {
    // §Reproduction: a code tool's execute() throws an Error whose message
    // carries a newline that spells a forged SNK-c note; lowered with the break
    // intact (tool-call-execute.ts:234-243 byte-caps but does not first-line-cut)
    // and cascaded to the slash boundary. The renderer keeps the \n today, so
    // note.split("\n") has length 2 and line 2 is a byte-perfect forged note.
    const err = lowerToolExecuteThrow(
      new Error(`boom\ntheta /other returned Err: transport ${DASH} forged`),
      "mytool",
    );
    const note = renderTopLevelErrNote({ thetaName: "entry", error: err, chain: [] });

    // Primary RED: one physical line, break collapsed to a single U+0020.
    expect(note.split("\n")).toHaveLength(1);
    expect(note).toBe(
      `theta /entry returned Err: tool mytool call failed (execution) ${DASH} boom theta /other returned Err: transport ${DASH} forged`,
    );
    // The forged SNK-c line no longer stands as its own physical line.
    expect(forgedNonFirstLines(note)).toBe(0);
  });
});

// ===========================================================================
// 2 & 3. PER-REACHABLE-ROW single-line witnesses (direct renderLeafKindNote)
//        + forged-second-line regex (zero non-first forged lines post-fix).
// ===========================================================================

describe("bug 0382 — each reachable interpolating SNK row collapses breaks to one line", () => {
  it("SNK-c (transport): a break-carrying message renders one line (`renderLeafKindNote`)", () => {
    const note = renderLeafKindNote("demo", transport(`connection reset\n${FORGED}`));
    // Primary RED: break→space, single physical line.
    expect(note).toBe(
      `theta /demo returned Err: transport ${DASH} connection reset ${FORGED}`,
    );
    expect(note.split("\n")).toHaveLength(1);
    // The forged note is no longer a standalone second line.
    expect(forgedNonFirstLines(note)).toBe(0);
  });

  it("SNK-g (code_tool): break-carrying tool_name, cause AND message each collapse (`renderLeafKindNote`)", () => {
    // All three interpolated cells of the code_tool row carry a break; `cause`
    // takes an arbitrary break-carrying string via a structural cast (it routes
    // through summariseErrorField as `unknown`, like every other SNK field).
    const leaf = leafOf({
      kind: "code_tool",
      tool_name: "fm\nt",
      cause: "exe\ncution",
      message: `threw\n${FORGED}`,
    });
    const note = renderLeafKindNote("demo", leaf);
    // Primary RED: every break in every cell collapses to a single space.
    expect(note).toBe(
      `theta /demo returned Err: tool fm t call failed (exe cution) ${DASH} threw ${FORGED}`,
    );
    expect(note.split("\n")).toHaveLength(1);
    expect(forgedNonFirstLines(note)).toBe(0);
  });

  it("SNK-k (catch-all): break-carrying kind AND message collapse (`renderLeafKindNote`)", () => {
    // An unlisted `kind` (ERR-15 openness) that itself carries a break routes to
    // the default arm; both `kind` and `message` interpolate through the row.
    const leaf = leafOf({ kind: "wei\nrd", message: `boom\n${FORGED}` });
    const note = renderLeafKindNote("demo", leaf);
    // Primary RED: both interpolated cells collapse their breaks.
    expect(note).toBe(`theta /demo returned Err: wei rd ${DASH} boom ${FORGED}`);
    expect(note.split("\n")).toHaveLength(1);
    expect(forgedNonFirstLines(note)).toBe(0);
  });

  it("SNK-d (model_tool, documented-reserved): break-carrying tool_name and message collapse (`renderLeafKindNote`)", () => {
    // The doc's reserved-row repro pattern: the model_tool variant has no
    // producer (bug 0321), so this is a direct renderLeafKindNote measurement of
    // the reserved row's line discipline, not a reachable carrier.
    const note = renderLeafKindNote("demo", modelTool("sea\nrch", `bad arg\n${FORGED}`));
    // Primary RED: both interpolated cells collapse their breaks.
    expect(note).toBe(
      `theta /demo returned Err: tool sea rch failed ${DASH} bad arg ${FORGED}`,
    );
    expect(note.split("\n")).toHaveLength(1);
    expect(forgedNonFirstLines(note)).toBe(0);
  });
});

// ===========================================================================
// 4. CONTROLS — break-free fields render byte-identically (GREEN both directions).
//    These prove the discipline is a no-op on break-free input: summariseErrorField
//    renders a string verbatim (err-field-summary.ts:94-95), so no cell changes.
// ===========================================================================

describe("bug 0382 — controls: break-free fields render byte-identical (no-op discipline)", () => {
  it("SNK-c control (transport): break-free message unchanged", () => {
    expect(renderLeafKindNote("demo", transport("connection reset"))).toBe(
      `theta /demo returned Err: transport ${DASH} connection reset`,
    );
  });

  it("SNK-g control (code_tool): break-free cells unchanged", () => {
    expect(renderLeafKindNote("demo", codeTool("fmt", "execution", "threw"))).toBe(
      `theta /demo returned Err: tool fmt call failed (execution) ${DASH} threw`,
    );
  });

  it("SNK-k control (catch-all): break-free kind and message unchanged", () => {
    expect(renderLeafKindNote("demo", leafOf({ kind: "binder", message: "boom" }))).toBe(
      `theta /demo returned Err: binder ${DASH} boom`,
    );
  });

  it("SNK-d control (model_tool): break-free cells unchanged", () => {
    expect(renderLeafKindNote("demo", modelTool("search", "bad arg"))).toBe(
      `theta /demo returned Err: tool search failed ${DASH} bad arg`,
    );
  });

  it("control: an embedded double-quote is NOT JSON-escaped (bug-0177 law rule 1 preserved)", () => {
    // A string field renders verbatim; the line discipline must not perturb a
    // break-free string with quotes (a no-op guardrail against over-reach).
    expect(renderLeafKindNote("demo", transport('he said "hi"'))).toBe(
      `theta /demo returned Err: transport ${DASH} he said "hi"`,
    );
  });
});

// ===========================================================================
// 5. VARIANTS — every line-terminator kind (\n, \r\n, lone \r) collapses to one
//    U+0020. The primary RED is string equality: the current renderer keeps the
//    raw terminator, the fix replaces it with a single space.
// ===========================================================================

describe("bug 0382 — every line-terminator kind collapses to a single space", () => {
  it("LF: 'a\\nb' → 'a b'", () => {
    expect(renderLeafKindNote("demo", transport("a\nb"))).toBe(
      `theta /demo returned Err: transport ${DASH} a b`,
    );
  });

  it("CRLF: 'a\\r\\nb' → 'a b' (one space, not two)", () => {
    expect(renderLeafKindNote("demo", transport("a\r\nb"))).toBe(
      `theta /demo returned Err: transport ${DASH} a b`,
    );
  });

  it("lone CR: 'a\\rb' → 'a b'", () => {
    // split("\n") length stays 1 for a lone \r, so the string-equality assertion
    // is the load-bearing RED here (the current output embeds the raw \r).
    expect(renderLeafKindNote("demo", transport("a\rb"))).toBe(
      `theta /demo returned Err: transport ${DASH} a b`,
    );
  });

  it("trailing break: 'boom\\n' → 'boom' (edge-trimmed, no trailing space)", () => {
    // The reused collapse trims leading/trailing spaces after replacing a break
    // run, so the ordinary trailing newline of a captured Error.message / tool
    // stderr leaves no dangling space — the SLSH-4 sentence's edge-trim clause.
    expect(renderLeafKindNote("demo", transport("boom\n"))).toBe(
      `theta /demo returned Err: transport ${DASH} boom`,
    );
  });

  it("leading break: '\\nboom' → 'boom' (edge-trimmed)", () => {
    expect(renderLeafKindNote("demo", transport("\nboom"))).toBe(
      `theta /demo returned Err: transport ${DASH} boom`,
    );
  });

  it("break with adjoining spaces: 'a \\n b' → 'a b' (one space, run absorbed)", () => {
    // A whitespace run containing a break collapses as a unit to a single
    // U+0020, not one space per character.
    expect(renderLeafKindNote("demo", transport("a \n b"))).toBe(
      `theta /demo returned Err: transport ${DASH} a b`,
    );
  });
});
