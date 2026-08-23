// Bug b0258 witness — the `subagent-envelope-parse-failed` registry row renders
// its `<line summary>` through the length cap alone, so the trailing U+000D the
// production line pump leaves on a `\r\n`-terminated child write rides into
// both `diagnostic.message` and `InvokeInfraError.message`.
//
// `<line summary>` is a category-8 host-derived freeform tail
// (`docs/spec_topics/diagnostics/placeholder-rendering-b.md:89`), whose rule
// (`:91`) defers to category 6's first-line truncation: newline-normalise
// (`\r\n` and bare `\r` become `\n`), then take the prefix up to but not
// including the first break. `:93` names BOTH `<line summary>` rows — the
// sibling `subagent-wire-parse-failed` row and this one — as
// rendering per that rule. The sibling builder `mapWireParseFailure`
// (`src/runtime/subagent-envelope.ts`) composes
// `summarizeLine(renderHostDerivedTail(line))`; `mapEnvelopeParseFailure` in
// the same module composes `summarizeLine(line)` and nothing else, and
// `summarizeLine` is a pure 120-character cap that performs no newline
// handling. `diagnostic-shape.md:34` states `message` as a single-line summary,
// so the cooked CR is out of contract on both copies of the string.
//
// Cells here are the §Fix constraint-5 set:
//   (a) the reachable trailing-CR class (§Reproduction rows A, C, D) — RED
//       pre-fix, on the CR assertion;
//   (b) the break-free control (row E) — GREEN pre-fix, the identity half;
//   (c) the over-cap line (row F) — GREEN pre-fix, the cap is untouched;
//   (d) the interior-bare-CR line (row B) — GREEN pre-fix, pinning the class
//       separation (that line classifies `unparseable` and reaches the SIBLING
//       code) so the fix cannot drift it;
//   (e) one driver-level cell through the real `driveSubagentChild` over a fake
//       child emitting a `\r`-terminated reserved-key line — RED pre-fix.
//
// Constraint 4 is binding on the CR cells: the shipped prefix used to diverge
// from the registry template `subagent return envelope parse failed: <line
// summary>` (`docs/spec_topics/diagnostics/code-registry-runtime.md:28`).
// Bug 0261 dispositioned that divergence under branch A: the shipped prefix
// now equals the registry template prefix. The registry-derived prefix
// anchor for this row lives in
// `tests/b0261-envelope-parse-failed-message-prefix-registry.test.ts`, not
// here — the CR cells stay anchor-free because a prefix check and a CR check
// are one property each, and mixing them would blur which assertion reds for
// which reason. The identity cells (b) and (c) do assert the literal shipped
// string, because their whole subject is "byte-identical to today".
//
// Prose here names both registry rows WITHOUT their `theta/` namespace prefix,
// as `tests/subagent-envelope.test.ts` and `tests/subagent-json-wire.test.ts`
// do. The closing gate's `extractAssertedCodes` treats any full code-shaped
// literal in a `tests/**` source as an asserting witness, so spelling the
// prefix here would close the carve-out arm those two rows are pinned under in
// `tests/registry-closed-set-corpus-gate.test.ts` and red that gate on a
// comment. The code assertions below go through the exported constants, which
// is the form that carve-out already records.

import { describe, expect, it } from "vitest";
import {
  classifyChildStdoutLine,
  mapEnvelopeParseFailure,
  SUBAGENT_ENVELOPE_PARSE_FAILED_CODE,
  SUBAGENT_WIRE_PARSE_FAILED_CODE,
} from "../src/runtime/subagent-envelope";
import { driveSubagentChild } from "../src/runtime/subagent-json-driver";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { InvokeInfraError } from "../src/runtime/query-error";
import { WallClock } from "../src/seams/wall-clock";
import { FakeJsonChild } from "./helpers/fake-json-child";

const CALLEE = "/theta/child.theta";
const CR = "\r";

/**
 * The shipped Message prefix, spelled as a literal ON PURPOSE. It is used only
 * by the identity cells, which assert today's bytes; the CR cells must not
 * anchor on it (§Fix constraint 4) — the prefix and the CR are separate
 * properties, each with its own anchor, so this file keeps them apart even
 * though bug 0261 brought the shipped bytes into agreement with the registry.
 */
const SHIPPED_PREFIX = "subagent return envelope parse failed: ";

/** Mirror of `tests/subagent-json-wire.test.ts`'s `driveOver` fake-child harness. */
function driveOver(
  child: FakeJsonChild,
  thetaAbort: AbortController,
  emitted: Diagnostic[],
): ReturnType<typeof driveSubagentChild> {
  return driveSubagentChild({
    child,
    thetaAbort,
    calleePath: CALLEE,
    emitDiagnostic: (d) => emitted.push(d),
    clock: new WallClock(),
  });
}

describe("bug b0258 — <line summary> on subagent-envelope-parse-failed renders per category 8", () => {
  // (a) The reachable class: a reserved-key line that parses as JSON (JSON.parse
  // tolerates trailing whitespace, so it still classifies `envelope`), fails the
  // pinned schema, and ends in the pump's U+000D. §Reproduction rows A, C, D.
  const reachable: readonly { readonly label: string; readonly body: string }[] = [
    { label: "row A — no ok/err arm", body: '{"theta_result":{"v":1}}' },
    { label: "row C — non-object payload", body: '{"theta_result":7}' },
    { label: "row D — no `v` field", body: '{"theta_result":{"ok":1}}' },
  ];

  for (const { label, body } of reachable) {
    it(`(a) ${label}: a \\r\\n-terminated write leaks no U+000D into either message copy`, () => {
      const line = `${body}${CR}`;
      // Precondition, asserted rather than assumed: this line must reach THIS
      // builder through the driver's `parse-failed` arm. If it classified
      // otherwise the cell would be witnessing the sibling row instead.
      expect(classifyChildStdoutLine(line).kind).toBe("envelope");

      const mapping = mapEnvelopeParseFailure(line, CALLEE);

      // The property, asserted independently of the prefix (§Fix constraint 4):
      // no cooked carriage return survives into the single-line summary, on
      // EITHER copy of the string — `diagnostic.message` is what the operator
      // reads and `error.message` is what an `invoke` parent's `Err` carries.
      expect(mapping.diagnostic.message).not.toContain(CR);
      expect(mapping.error.message).not.toContain(CR);
      // …and the offending line is still named, so the fix cannot satisfy the
      // CR assertion by dropping the tail altogether.
      expect(mapping.diagnostic.message).toContain(body);
      expect(mapping.error.message).toContain(body);
      // One string on both fields — the shipped builder places it twice.
      expect(mapping.error.message).toBe(mapping.diagnostic.message);
      expect(mapping.diagnostic.code).toBe(SUBAGENT_ENVELOPE_PARSE_FAILED_CODE);
    });
  }

  it("(b) row E — the break-free control renders byte-identically to today", () => {
    const line = '{"theta_result":{"v":1}}';
    const mapping = mapEnvelopeParseFailure(line, CALLEE);

    // The identity half. A line carrying no break must render exactly as it
    // does pre-fix: category 8 normalises breaks and cuts at the first one, and
    // there is none here, so equality against today's bytes is the contract.
    expect(mapping.diagnostic.message).toBe(`${SHIPPED_PREFIX}${line}`);
    expect(mapping.error.message).toBe(`${SHIPPED_PREFIX}${line}`);
  });

  it("(c) row F — the 120-character cap and its U+2026 marker are untouched above the cap", () => {
    const line = `{"theta_result":{"v":1,"x":"${"a".repeat(200)}"}}${CR}`;
    expect(line.length).toBeGreaterThan(120);
    const mapping = mapEnvelopeParseFailure(line, CALLEE);

    // Above the cap the truncation already removes the tail, CR included, so
    // this rendering does not move under the fix: normalise-then-cut leaves the
    // first 120 characters identical. The cap is a §Non-goal; this cell exists
    // to hold it still.
    expect(mapping.diagnostic.message).toBe(`${SHIPPED_PREFIX}${line.slice(0, 120)}\u2026`);
    expect(mapping.diagnostic.message).not.toContain(CR);
  });

  it("(d) row B — an interior bare CR classifies unparseable and reaches the SIBLING code", async () => {
    // Class separation, pinned so the fix cannot drift it. An interior bare CR
    // makes `JSON.parse` throw, so the line never reaches
    // `mapEnvelopeParseFailure` through the driver at all: the `unparseable`
    // arm of `driveSubagentChild` routes it to the advisory sibling row
    // `subagent-wire-parse-failed`. This is the shipped routing
    // bug 0086 settled and is correct.
    const line = '{"theta_result":{"v":1,"x":"a\rb"}}';
    expect(classifyChildStdoutLine(line).kind).toBe("unparseable");

    const child = new FakeJsonChild();
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);

    child.emitRawLine(line);
    child.emitOkEnvelope(0);

    const result = await drive;
    const codes = emitted.map((d) => d.code);
    expect(codes).toContain(SUBAGENT_WIRE_PARSE_FAILED_CODE);
    expect(codes).not.toContain(SUBAGENT_ENVELOPE_PARSE_FAILED_CODE);
    // Advisory, not result-altering: the envelope that follows still settles Ok.
    expect(result.ok).toBe(true);
  });

  it("(e) driver seam — a \\r-terminated reserved-key line settles fail-closed with a CR-free diagnostic", async () => {
    const child = new FakeJsonChild();
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);

    // The delivered form of a child write of `{"theta_result":{"v":1}}\r\n`:
    // the production pump splits on `\n` alone and leaves the CR for the wire
    // parser to trim, so the driver sees the line with its U+000D intact.
    child.emitRawLine(`{"theta_result":{"v":1}}${CR}`);

    const result = await drive;

    const envelopeRows = emitted.filter((d) => d.code === SUBAGENT_ENVELOPE_PARSE_FAILED_CODE);
    expect(envelopeRows).toHaveLength(1);
    expect(envelopeRows[0]?.message).not.toContain(CR);
    expect(envelopeRows[0]?.message).toContain('{"theta_result":{"v":1}}');

    // Fail-closed: this row settles the invocation — never a fabricated value.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const infra = result.error as unknown as InvokeInfraError;
      expect(infra.kind).toBe("invoke_infra");
      expect(infra.cause).toBe("internal_error");
      expect(infra.callee_path).toBe(CALLEE);
      // The second copy of the same string crosses into the parent's `Err`.
      expect(infra.message).not.toContain(CR);
    }
  });
});
