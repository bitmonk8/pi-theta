// Bug 0086 — the three-way child-stdout line classifier and the stream
// scanner's widened verdict.
//
// The class the registry row on
// `docs/spec_topics/diagnostics/code-registry-runtime.md` names is decided in
// `src/runtime/subagent-envelope.ts`: `lineCarriesReservedKey` returns
// `boolean`, so "a valid `--mode json` event, correctly ignored" and "a line
// expected to be a JSON event that did not parse" collapse into the same
// `false`, and the offending line the Message needs is discarded with the
// `SyntaxError`. This file asserts the three-way verdict directly, and asserts
// that `scanStreamForEnvelope` — the second scanner with the same shape and no
// `else` arm — surfaces the unparseable lines it skipped instead of merging the
// classes a second time.
//
// PINNED BLANK-LINE DECISION (mirrored in
// `tests/subagent-wire-parse-failed-emitter.test.ts`): a blank or
// whitespace-only line classifies `unparseable`, because it is not parseable
// JSON and a classifier that answered otherwise would be false of it. The
// "blank lines are not diagnosed" rule is therefore a DRIVER-seam filter, not a
// classifier arm — which keeps the classifier's verdict three-way and keeps the
// question "is this diagnosable" where the emission bound already lives.
//
// `lineCarriesReservedKey` stays a `boolean` wrapper over the same
// classification, so the existing boolean cells in
// `tests/subagent-envelope.test.ts` remain the pin on that surface and are not
// restated here.
//
// Spec: pi-integration-contract/subagent.md (PIC-59),
// diagnostics/code-registry-runtime.md, diagnostics/diagnostic-shape.md
// (DIAG-1).

import { describe, expect, it } from "vitest";
import * as subagentEnvelope from "../src/runtime/subagent-envelope";
import {
  scanStreamForEnvelope,
  THETA_ENVELOPE_VERSION,
  THETA_RESULT_KEY,
} from "../src/runtime/subagent-envelope";

/** The three-way verdict the row's class separation needs (the fourth arm the `boolean` cannot express is the third one here). */
type ChildStdoutLineClass =
  | { readonly kind: "envelope" }
  | { readonly kind: "other-json" }
  | { readonly kind: "unparseable"; readonly line: string };

/**
 * The classifier under test, resolved through the module namespace so a missing
 * export fails the cell that needs it while naming the unmet precondition,
 * rather than aborting collection for the whole file.
 */
function classify(line: string): ChildStdoutLineClass {
  const candidate: unknown = Object.prototype.hasOwnProperty.call(
    subagentEnvelope,
    "classifyChildStdoutLine",
  )
    ? (subagentEnvelope as unknown as Record<string, unknown>)["classifyChildStdoutLine"]
    : undefined;
  if (typeof candidate !== "function") {
    throw new Error(
      "harness: src/runtime/subagent-envelope.ts exports no classifyChildStdoutLine — the " +
        "three-way line classification the registry row's class separation needs has no " +
        "implementation to call, so this precondition is reported loudly rather than skipped",
    );
  }
  return (candidate as (line: string) => ChildStdoutLineClass)(line);
}

function envelopeLine(payload: Record<string, unknown>): string {
  return JSON.stringify({ [THETA_RESULT_KEY]: payload });
}

describe("bug 0086 — three-way classification of one child stdout line", () => {
  it("classifies a reserved-key envelope line as envelope", () => {
    expect(classify(envelopeLine({ v: THETA_ENVELOPE_VERSION, ok: 1 })).kind).toBe("envelope");
  });

  it("classifies a valid non-envelope --mode json event line as other-json", () => {
    expect(classify(JSON.stringify({ type: "agent_end", messages: [] })).kind).toBe("other-json");
  });

  it("classifies garbage and partial JSON as unparseable, carrying the offending line", () => {
    const garbage = "this is not json {";
    const garbageClass = classify(garbage);
    expect(garbageClass.kind).toBe("unparseable");
    if (garbageClass.kind === "unparseable") {
      expect(garbageClass.line).toBe(garbage);
    }

    const partial = '{"theta_result": ';
    const partialClass = classify(partial);
    expect(partialClass.kind).toBe("unparseable");
    if (partialClass.kind === "unparseable") {
      expect(partialClass.line).toBe(partial);
    }
  });

  it("classifies an empty and a whitespace-only line as unparseable (the driver, not the classifier, declines to diagnose them)", () => {
    expect(classify("").kind).toBe("unparseable");
    expect(classify("   \t ").kind).toBe("unparseable");
  });
});

describe("bug 0086 — the stream scanner surfaces the unparseable lines it skipped", () => {
  it("carries them in stream order on the found arm", () => {
    const scan = scanStreamForEnvelope([
      JSON.stringify({ type: "agent_start" }),
      "garbage <<<>>>",
      '{"partial": ',
      envelopeLine({ v: THETA_ENVELOPE_VERSION, ok: "FINAL" }),
    ]);
    expect(scan.found).toBe(true);
    const skipped = (scan as unknown as { readonly unparseableLines?: readonly string[] })
      .unparseableLines;
    expect(skipped).toEqual(["garbage <<<>>>", '{"partial": ']);
  });

  it("carries them in stream order on the not-found arm", () => {
    const scan = scanStreamForEnvelope([
      JSON.stringify({ type: "agent_end", messages: [] }),
      "noise",
      "{{{",
    ]);
    expect(scan.found).toBe(false);
    const skipped = (scan as unknown as { readonly unparseableLines?: readonly string[] })
      .unparseableLines;
    expect(skipped).toEqual(["noise", "{{{"]);
  });
});
