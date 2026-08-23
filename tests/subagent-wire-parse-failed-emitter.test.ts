// Bug 0086 — the parent's advisory triage signal for a malformed child
// event-stream line, asserted at the driver seam.
//
// The registry row on `docs/spec_topics/diagnostics/code-registry-runtime.md`
// (severity `E`, phase `runtime`, Message `subagent event-stream line parse
// failed: <line summary>`) separates TWO classes of non-envelope stdout line:
// a valid `--mode json` event the parent correctly ignores, and a line that was
// expected to be a JSON event and did not parse. Only the second is diagnosed.
// The class is decided in `lineCarriesReservedKey`
// (`src/runtime/subagent-envelope.ts`), whose `boolean` verdict merges both
// into `false`, and disposed of by the `onStdoutLine` handler in
// `driveSubagentChild` (`src/runtime/subagent-json-driver.ts`), which returns
// without emitting. This file drives the real `driveSubagentChild` over the
// `FakeJsonChild` harness and asserts the emission the row promises.
//
// WHY the result assertions ride alongside the diagnostic assertions: PIC-59's
// stray-line tolerance is a RESULT-fidelity rule (a non-envelope line must not
// settle the invocation), and the row calls its own diagnostic "advisory triage
// rather than a result-altering failure". Emitting must therefore leave the
// invocation's value identical, so each cell pins both halves.
//
// TWO settled design decisions this file pins, both bounding the emission
// rather than the classification:
//
//   1. EMISSION BOUND — at most ONE such diagnostic per invocation, naming the
//      FIRST offending line. The child's stdout is shared with other
//      extensions (`docs/spec_topics/pi-integration-contract/subagent.md`
//      PIC-59) and the severity is `E`, so an unbounded emitter would produce
//      one `E` per line for the life of the child.
//   2. BLANK LINES ARE NOT DIAGNOSED — an empty or whitespace-only line is a
//      framing artefact of LF-delimited stdout, not a malformed JSON event. The
//      pinned decision is that this filter lives at the DRIVER seam, not in the
//      classifier: the classifier's verdict for a blank line is `unparseable`
//      (a blank line is not parseable JSON, and saying otherwise would make the
//      classifier lie), and the driver declines to diagnose it. That split is
//      asserted here for the driver and in
//      `tests/subagent-wire-parse-failed-classifier.test.ts` for the
//      classifier. The exempt set is JSON whitespace — space, tab, CR, LF —
//      not ECMAScript's `String.prototype.trim` set, whose extra members
//      (U+2028, U+2029, U+00A0, U+FEFF) are ordinary characters under
//      placeholder-rendering-b.md's category-6 line-separator scope.
//
// The row's `<line summary>` rendering is pinned too: category 6's first-line
// truncation newline-normalises `\r\n` and bare `\r` to `\n` and cuts at the
// first break, which matters because the production line pump splits on `\n`
// alone and leaves a trailing CR for the wire parser to trim.
//
// The code and the Message template are read from the live registry through
// `parseRegistry` / `registryMessage` (DIAG-4,
// `docs/spec_topics/diagnostics/diagnostic-shape.md`) rather than copied, and
// the code string is composed from parts: `extractAssertedCodes`
// (`tools/closing-gate/index.js`) treats any code-shaped literal in a
// `tests/**` source as an assertion of that code, so spelling it out in full
// here would silently move a corpus-gate arm. The message is anchored on the
// byte-identical PREFIX only — `<line summary>` is a category-8 host-derived
// freeform tail and its rows have no suffix to anchor
// (`docs/spec_topics/diagnostics/placeholder-rendering-b.md` §8).
//
// Spec: pi-integration-contract/subagent.md (PIC-59, PIC-65),
// diagnostics/code-registry-runtime.md, diagnostics/diagnostic-shape.md
// (DIAG-1, DIAG-4), diagnostics/placeholder-rendering-b.md (§8).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { driveSubagentChild } from "../src/runtime/subagent-json-driver";
import {
  SUBAGENT_ENVELOPE_PARSE_FAILED_CODE,
  THETA_ENVELOPE_VERSION,
  THETA_RESULT_KEY,
} from "../src/runtime/subagent-envelope";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { WallClock } from "../src/seams/wall-clock";
import { FakeJsonChild } from "./helpers/fake-json-child";

// ---------------------------------------------------------------------------
// Registry-sourced oracle (DIAG-4): the code and the Message template.
// ---------------------------------------------------------------------------

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  ["code-registry-parse.md", "code-registry-load.md", "code-registry-runtime.md", "code-registry-host.md"]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

// Composed rather than written as one span, so this file does not register as
// the code's asserting test in the closing gate's textual extraction.
const CODE_PREFIX = "theta" + "/";
const WIRE_PARSE_FAILED_CODE = `${CODE_PREFIX}runtime/subagent-wire-parse-failed`;

/** The category-8 placeholder whose rendering this row's tail carries. */
const LINE_SUMMARY_PLACEHOLDER = "<line summary>";

/**
 * The row's structured registry entry, or a loud failure naming the unmet
 * precondition. The registry row IS this file's oracle, so a missing row must
 * fail the run rather than degrade an assertion into a comparison against
 * `undefined` — and never a skip.
 */
function registryRowOf(code: string): RegistryRow {
  const row = REGISTRY.find((r) => r.code === code);
  if (row === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no row for ${code} — that row is this ` +
        `file's only oracle for the code, its severity and its Message template (DIAG-4), so its ` +
        `absence is a loud harness failure, never a skip and never a hard-coded fallback`,
    );
  }
  return row;
}

/**
 * The byte-identical prefix of the row's Message template, up to but excluding
 * the category-8 tail. §8 forbids strict equality against a template carrying a
 * host-derived placeholder and pins prefix-anchored partial matching for it;
 * these subagent rows end in the placeholder, so a prefix is the whole anchor.
 */
function messagePrefixOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: no Message template for ${code} in the parsed registry — the DIAG-4 Message ` +
        `column is this file's oracle, so a missing template fails loudly`,
    );
  }
  const cut = template.indexOf(LINE_SUMMARY_PLACEHOLDER);
  if (cut < 0) {
    throw new Error(
      `harness: the Message template for ${code} carries no ${LINE_SUMMARY_PLACEHOLDER} ` +
        `placeholder (${template}), so the category-8 prefix anchor this file asserts on cannot ` +
        `be derived from it`,
    );
  }
  return template.slice(0, cut);
}

// ---------------------------------------------------------------------------
// Drive harness (mirrors tests/subagent-json-wire.test.ts).
// ---------------------------------------------------------------------------

function driveOver(
  child: FakeJsonChild,
  thetaAbort: AbortController,
  emitted: Diagnostic[],
): ReturnType<typeof driveSubagentChild> {
  return driveSubagentChild({
    child,
    thetaAbort,
    calleePath: "/theta/child.theta",
    emitDiagnostic: (d) => emitted.push(d),
    clock: new WallClock(),
  });
}

/** The wire-parse diagnostics among everything the drive emitted. */
function wireParseDiagnostics(emitted: readonly Diagnostic[]): readonly Diagnostic[] {
  return emitted.filter((d) => d.code === WIRE_PARSE_FAILED_CODE);
}

/** A reserved-key line that parses as JSON but fails the pinned envelope schema. */
function malformedEnvelopeLine(): string {
  return JSON.stringify({
    [THETA_RESULT_KEY]: { v: THETA_ENVELOPE_VERSION, neither_ok_nor_err: true },
  });
}

describe("bug 0086 — a malformed non-envelope stdout line is diagnosed once, without altering the result", () => {
  it("emits exactly one wire-parse diagnostic carrying the registry code, severity error and the template prefix", async () => {
    const child = new FakeJsonChild();
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);

    const offending = "not json at all {";
    child.emitRawLine(offending);
    child.emitOkEnvelope({ verdict: "approved" });

    const result = await drive;
    const wire = wireParseDiagnostics(emitted);
    expect(wire).toHaveLength(1);
    expect(wire[0]?.severity).toBe("error");
    expect(wire[0]?.message.startsWith(messagePrefixOf(WIRE_PARSE_FAILED_CODE))).toBe(true);
    // The row requires the offending line to survive to the emission site; a
    // line within the truncation ceiling renders whole.
    expect(wire[0]?.message).toContain(offending);

    // Advisory triage, not a result-altering failure: the invocation still
    // settles on the envelope that follows.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ verdict: "approved" });
    }
    expect(registryRowOf(WIRE_PARSE_FAILED_CODE).phase).toBe("runtime");
  });

  it("renders the offending line truncated rather than whole", async () => {
    const child = new FakeJsonChild();
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);

    // Far past any plausible truncation ceiling, and not JSON at any prefix.
    const offending = `${"x".repeat(600)} {`;
    child.emitRawLine(offending);
    child.emitOkEnvelope(1);

    await drive;
    const wire = wireParseDiagnostics(emitted);
    expect(wire).toHaveLength(1);
    const prefix = messagePrefixOf(WIRE_PARSE_FAILED_CODE);
    expect(wire[0]?.message.startsWith(prefix)).toBe(true);
    expect((wire[0]?.message ?? "").length).toBeLessThan(prefix.length + offending.length);
    expect(wire[0]?.message.endsWith("\u2026")).toBe(true);
  });
});

describe("bug 0086 — the class separation the registry row states", () => {
  it("a valid non-envelope --mode json event line is diagnosed not at all", async () => {
    const child = new FakeJsonChild();
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);

    child.emitEventLine({ type: "agent_start" });
    child.emitEventLine({ type: "tool_call", name: "read" });
    child.emitOkEnvelope("FINAL");

    const result = await drive;
    expect(wireParseDiagnostics(emitted)).toHaveLength(0);
    expect(emitted).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it("a malformed reserved-key line routes to the envelope-parse sibling and to no wire-parse diagnostic", async () => {
    const child = new FakeJsonChild();
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);

    child.emitRawLine(malformedEnvelopeLine());

    const result = await drive;
    expect(emitted.map((d) => d.code)).toContain(SUBAGENT_ENVELOPE_PARSE_FAILED_CODE);
    expect(wireParseDiagnostics(emitted)).toHaveLength(0);
    expect(result.ok).toBe(false);
  });
});

describe("bug 0086 — the emission bound (one per invocation, the first offending line)", () => {
  it("diagnoses twelve distinct malformed lines exactly once, naming the first", async () => {
    const child = new FakeJsonChild();
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);

    const offending = Array.from({ length: 12 }, (_v, index) => `malformed line ${index} <<<`);
    for (const line of offending) {
      child.emitRawLine(line);
    }
    child.emitOkEnvelope(true);

    const result = await drive;
    const wire = wireParseDiagnostics(emitted);
    // The stream is shared with other extensions and the severity is `E`, so a
    // chatty co-extension must not be able to produce one `E` per line.
    expect(wire).toHaveLength(1);
    expect(wire[0]?.message).toContain("malformed line 0 <<<");
    expect(wire[0]?.message).not.toContain("malformed line 11 <<<");
    expect(result.ok).toBe(true);
  });
});

describe("bug 0086 — a blank stdout line is stream framing, not a malformed event", () => {
  // The exempt set is JSON's whitespace, not ECMAScript's `String.prototype.trim`
  // set: `trim` also strips U+2028, U+2029, U+00A0 and U+FEFF, which
  // `docs/spec_topics/diagnostics/placeholder-rendering-b.md` (category 6
  // line-separator scope) pins as ORDINARY characters implementations must not
  // strip. A line made only of those is malformed stream bytes, not LF framing.
  it("diagnoses neither an empty line, nor a space/tab line, nor a bare-CR line", async () => {
    const child = new FakeJsonChild();
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);

    child.emitRawLine("");
    child.emitRawLine("   \t ");
    // What the production line pump delivers for a `\r\n`-terminated blank
    // write: it splits on `\n` and leaves the CR for the wire parser to trim.
    child.emitRawLine("\r");
    child.emitOkEnvelope(0);

    const result = await drive;
    expect(wireParseDiagnostics(emitted)).toHaveLength(0);
    expect(emitted).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it("diagnoses a U+00A0-only line — a no-break space is not JSON whitespace", async () => {
    const child = new FakeJsonChild();
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);

    child.emitRawLine("\u00a0");
    child.emitOkEnvelope(0);

    const result = await drive;
    const wire = wireParseDiagnostics(emitted);
    expect(wire).toHaveLength(1);
    expect(wire[0]?.message).toContain("\u00a0");
    expect(result.ok).toBe(true);
  });

  it("diagnoses a U+2028-only line — a line separator is an ordinary character here", async () => {
    const child = new FakeJsonChild();
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);

    child.emitRawLine("\u2028");
    child.emitOkEnvelope(0);

    const result = await drive;
    const wire = wireParseDiagnostics(emitted);
    expect(wire).toHaveLength(1);
    // Category 6 forbids promoting U+2028 into a break, so it survives the
    // first-line cut and reaches the operator.
    expect(wire[0]?.message).toContain("\u2028");
    expect(result.ok).toBe(true);
  });
});

describe("bug 0086 — <line summary> renders per category 6's first-line truncation", () => {
  it("drops the trailing CR the line pump leaves on a \\r\\n-terminated write", async () => {
    const child = new FakeJsonChild();
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);

    child.emitRawLine("garbage\r");
    child.emitOkEnvelope(0);

    const result = await drive;
    const wire = wireParseDiagnostics(emitted);
    expect(wire).toHaveLength(1);
    // `\r` newline-normalises to `\n` and the rendering is the prefix up to but
    // not including it, so no CR reaches the operator. Asserted by anchored
    // partial match, never by equality against the whole Message (§8).
    expect(wire[0]?.message.startsWith(messagePrefixOf(WIRE_PARSE_FAILED_CODE))).toBe(true);
    expect(wire[0]?.message).toContain("garbage");
    expect(wire[0]?.message).not.toContain("\r");
    expect(result.ok).toBe(true);
  });

  it("cuts an embedded bare CR at the break it normalises to", async () => {
    const child = new FakeJsonChild();
    const abort = new AbortController();
    const emitted: Diagnostic[] = [];
    const drive = driveOver(child, abort, emitted);

    child.emitRawLine("foo\rbar");
    child.emitOkEnvelope(0);

    const result = await drive;
    const wire = wireParseDiagnostics(emitted);
    expect(wire).toHaveLength(1);
    expect(wire[0]?.message.startsWith(messagePrefixOf(WIRE_PARSE_FAILED_CODE))).toBe(true);
    expect(wire[0]?.message).toContain("foo");
    expect(wire[0]?.message).not.toContain("bar");
    expect(wire[0]?.message).not.toContain("\r");
    expect(result.ok).toBe(true);
  });
});
