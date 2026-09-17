// Bug 0394 — a correct-ARITY stdlib call with a wrong-KIND argument on a
// laundered receiver is uncovered by the bug-0315 runtime belt, which checks
// arity ONLY (stdlib-string.ts's `StdlibMemberSignature` doc, pre-fix: "the
// belt does not consult `params` — arity is its only concern, per the design
// brief" — superseded post-fix: that same `StdlibMemberSignature` doc now
// records that the belt reads `params` for kind too). The three member dispatchers'
// argument reads are unchecked `as` casts, so the raw value is forwarded into
// the host method and JS semantics decide the result: every string-searching
// member answers a predicate over the coerced spelling
// (`startsWith(5)` → the receiver starts with "5"; `endsWith(null)` → …ends
// with "null"), `join`/`slice`/`has` coerce, `concat` silently switches
// operations (append-as-element), and — the headline hazard — `s.replace(n,"z")`
// with a NUMBER/BOOLEAN `from` DIVERGES: `cursor = at + from.length` is `NaN`
// (`(1).length` is `undefined`), `indexOf(x, NaN)` restarts the scan at 0, the
// same match is consumed forever and the result string grows without bound
// until a host `RangeError: Invalid string length` (or, in production, an OOM).
// (docs/bugs/0394-stdlib-wrong-kind-args-coerce-and-replace-hangs.md)
//
// Affected reads (pre-fix locations, re-derived post-fix — the bug-0394 kind
// belt inserted above the switch in each dispatcher shifted every case arm
// down): stdlib-string.ts:198/200/202 (startsWith/endsWith/includes `args[0]
//     as string`), :206 (split), :209 (replace entry `args[0]/[1] as string`);
//     the divergent scan is `replaceLiteral` — :231 (`indexOf(from, cursor)`),
//     :237 (`cursor = at + from.length` → NaN).
//   - stdlib-array.ts:111 (join `args[0] as string`), :124 (slice `args[0] as
//     number`), :132 (concat `args[0] as readonly ThetaValue[]`).
//   - stdlib-object.ts:160 (has `args[0] as string`).
//   Both hosts share the three evaluators (applyStdlibMethod,
//   statement-executor.ts:1356; evaluateStdlibMethod,
//   production-theta-producer.ts:7871), so executor and pure host coerce and
//   diverge identically.
//
// SETTLED §Fix (this file pins the post-fix contract): extend the existing
// runtime belt in the three dispatchers (evaluateStringMember /
// evaluateArrayMember / evaluateObjectMember) from arity to argument KIND,
// reusing the `params` descriptors the signatures already carry —
// `"string"` → require `typeof === "string"`, `"integer"` → require
// `typeof === "number"`, `"array"` → require `Array.isArray`; the `"element"`
// descriptor (`includes`/`indexOf`) stays runtime-UNCHECKED (its `valuesEqual`
// semantics are total over any kind). A wrong-kind argument throws a belt
// defect (a NEW sibling class alongside the bug-0315
// `StdlibMethodArgumentDefectError`), routed through the EXISTING
// `surfaceUnexpectedThrow` (src/runtime/runtime-panics.ts) to
// `INTERNAL_ERROR_CODE` (`theta/runtime/internal-error`) — a LOUD FRAMED abort,
// not a `ThetaPanic`, not a coerced value, not divergence. No new registry row.
// The belt fires AFTER the arity check and ONLY on statically-WITHHELD
// arguments, which parse-defer exactly as bug 0315's do (the parse gate
// `checkMethodCall` returns before the signature check on an "unknown"-
// classified receiver), so every fixture below parses clean; a parse error is a
// harness precondition breach (fail loudly), never a skip. This closes the C3
// hang (the belt fires BEFORE `replaceLiteral` is ever entered) and every
// coercion row in one pattern, precedented by the bug-0366 join element belt.
//
// BELT MESSAGE SHAPE (the assertions align to it; the implementer matches it):
// the kind defect body is `internal defect: stdlib method '<method>' argument
// <i> expects a <kind>, got <actual>` (tail per bug 0439) with <kind> ∈
// {string, integer, array}, and
// `surfaceUnexpectedThrow` prepends `internal error: `. The message assertion
// therefore matches `/stdlib method '\w+' argument \d+ expects an? (string|
// integer|array)/`, which DISTINGUISHES the KIND belt from the bug-0315 ARITY
// belt's "called with N argument(s)" message AND from an incidental host
// `RangeError: Invalid string length` — critical for the C3 hang row, whose
// HEAD RangeError must NOT satisfy this test.
//
// WITNESS TABLE (the FIXED contract; every FLIP is RED now, every CONTROL GREEN):
//   COERCION FLIPS (executor; HEAD silently coerces, post-fix belt throws):
//     C1  s.startsWith(a) / f("5x", 5)      HEAD value true  → throws
//     C9  s.endsWith(a)   / f("xnull", null) HEAD value true → throws
//     C10 s.includes(a)   / f("a1b", 1)      HEAD value true → throws
//     C2  s.split(a)      / f("a1b", 1)      HEAD value ["a","b"] → throws
//     C4  xs.join(sep)    / f(["a","b"], 1)  HEAD value "a1b" → throws
//     C5  xs.slice(a)     / f([1,2,3], "1")  HEAD value [2,3] → throws
//     C6  xs.concat(o)    / f([1,2], 3)      HEAD value [1,2,3] (appended) → throws
//     C7  o.has(k)        / f(P{a:1}, true)  HEAD value false → throws
//   PURE-HOST FLIP (driveInterp; HEAD sends the coerced text, post-fix sent=[]):
//     PC1 @`v=${s.startsWith(a)}` / f("5x", 5)  HEAD sends ["v=true"] → throws, sent=[]
//   NON-HANGING wrong-kind-`from` FLIP (safe — coerced needle absent):
//     C3n s.replace(a,"z") / f("azb", 1)  HEAD value "azb" (needle "1" absent) → throws
//   HANG row (guarded, per-test timeout):
//     C3  s.replace(a,"z") / f("a1b", 1)  HEAD DIVERGES (NaN cursor) → throws
//   CONTROLS (byte-identical correct-kind calls; GREEN now AND after):
//     K1 startsWith("a")=true  K2 replace("-","+")="a+b"  K3 join("-")="a-b"
//     K4 slice(1)=[2,3]  K5 slice(0,2)=[1,2]  K6 concat([3])=[1,2,3]
//     K7 has("a")=true  K8 includes("1")=false (element descriptor UNCHECKED)
import { makeBeltProbes, type Probe, render, assertValue } from "./helpers/runtime-belt-probe-harness";
import { describe, expect, it } from "vitest";
import type { ThetaSource } from "../src/lexer/lexer";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import {
  isThetaPanic,
  surfaceUnexpectedThrow,
  INTERNAL_ERROR_CODE,
} from "../src/runtime/runtime-panics";
import type { ThetaValue } from "../src/runtime/value";




const FM = "---\nmode: prompt\n---\n";

/** The zero body range `surfaceUnexpectedThrow` frames a throw against. */
const SITE = {
  file: "b0394.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

// ===========================================================================
// Shared parse harness (the b0369 shape, verbatim): parseThetaDocument →
// createProductionProducerDeps → bindPromptConversation → executeBody. Offline,
// provider-free, deterministic.
// ===========================================================================

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

function parseOnly(src: string): ThetaDocument {
  const source: ThetaSource = { path: "b0394.theta", bytes: new TextEncoder().encode(FM + src) };
  return parseThetaDocument(source, parseDeps());
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. Every
 * fixture this drives is parse-clean at HEAD BECAUSE its stdlib-method receiver
 * is a WITHHELD `fn` param (statically unresolvable), so `checkMethodCall`
 * defers its signature check exactly as bug 0315's laundered-receiver rows do —
 * the class this report measures is the deferred RUNTIME path, never a parse
 * gap. A rejection here is a harness precondition breach, never a silent skip.
 */
function parseTheta(src: string): ThetaDocument {
  const doc = parseOnly(src);
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture failed to parse clean: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

// ===========================================================================
// EXECUTOR harness (b0369 shape, verbatim). A raw non-panic throw propagates out
// of `executeBody` uncaught (the framing that reclassifies it lives one layer
// up, theta-composition-producer.ts), so both dispositions are observable here.
// ===========================================================================

const { probeSource, driveInterp } = makeBeltProbes(parseTheta, "b0394");

/**
 * The KIND-belt framing assertion (the b0369 `assertLoudThrow` framing helper,
 * STRENGTHENED to the bug-0394 §Fix message shape): a caught throw must be the
 * belt's plain `Error` (NOT a `ThetaPanic`) that `surfaceUnexpectedThrow` frames
 * to INTERNAL_ERROR_CODE, AND whose message carries the wrong-KIND wording. The
 * message match is what distinguishes this belt from the bug-0315 ARITY belt
 * ("called with N argument(s)") and from an incidental host `RangeError:
 * Invalid string length` — both route to the same internal-error code, so
 * without the message shape they would masquerade as a pass (the C3 hazard).
 */
function assertKindBeltDiagnostic(thrown: unknown, what: string): void {
  expect(
    isThetaPanic(thrown),
    `${what}: the kind belt is a plain Error, NOT a ThetaPanic (the six-source panic list is closed). Thrown: ${String(thrown)}`,
  ).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(thrown, SITE);
  expect(
    diagnostic,
    `${what}: surfaceUnexpectedThrow returns a Diagnostic for a non-panic throw`,
  ).toBeDefined();
  const diag = diagnostic as Diagnostic;
  expect(
    diag.code,
    `${what}: the kind belt routes to the existing permitted internal-error surface`,
  ).toBe(INTERNAL_ERROR_CODE);
  expect(
    diag.message,
    `${what}: the internal-error template prefix`,
  ).toMatch(/^internal error: /);
  expect(
    diag.message,
    `${what}: the wrong-KIND belt message shape (distinguishes the KIND belt from the ARITY belt's "called with N argument(s)" AND from a host RangeError). Message: ${diag.message}`,
  ).toMatch(/stdlib method '\w+' argument \d+ expects an? (string|integer|array)/);
}

/**
 * Assert a wrong-kind FLIP row: at HEAD the dispatcher coerces the raw argument
 * and the body SUCCEEDS with the fabricated value named by `leakDescription`
 * (the first `expect` reds NAMING it); post-fix the kind belt throws the framed
 * defect.
 */
function assertKindBeltThrow(probe: Probe, leakDescription: string, what: string): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a wrong-kind stdlib argument on a laundered receiver must throw the kind belt LOUDLY (${leakDescription})`,
    ).toBe("runtime kind-belt throw");
    return;
  }
  assertKindBeltDiagnostic(probe.thrown, what);
}

// ===========================================================================
// COERCION FLIPS — C1, C9, C10, C2, C4, C5, C6, C7. A correct-arity call with a
// wrong-kind argument on a laundered receiver must abort loudly at the kind
// belt. RED at HEAD: the unchecked `as` cast forwards the raw value into the
// host method and JS coercion fabricates the value named at the `it`.
// ===========================================================================

describe("bug 0394 coercion FLIPs — wrong-kind stdlib args on a laundered receiver throw the kind belt", () => {
  const flipRows: ReadonlyArray<readonly [string, string, string]> = [
    ["C1", 'fn f(s, a) { s.startsWith(a) }\nf("5x", 5)', 'at HEAD value true (search 5 coerced to "5")'],
    ["C9", 'fn f(s, a) { s.endsWith(a) }\nf("xnull", null)', 'at HEAD value true (predicate over the literal "null")'],
    ["C10", 'fn f(s, a) { s.includes(a) }\nf("a1b", 1)', 'at HEAD value true (search 1 coerced to "1")'],
    ["C2", 'fn f(s, a) { s.split(a) }\nf("a1b", 1)', 'at HEAD value ["a","b"] (separator 1 coerced to "1")'],
    ["C4", 'fn f(xs, sep) { xs.join(sep) }\nf(["a", "b"], 1)', 'at HEAD value "a1b" (join separator 1 coerced to "1")'],
    ["C5", 'fn f(xs, a) { xs.slice(a) }\nf([1, 2, 3], "1")', 'at HEAD value [2,3] (slice start "1" coerced to integer 1)'],
    ["C6", 'fn f(xs, o) { xs.concat(o) }\nf([1, 2], 3)', "at HEAD value [1,2,3] (scalar 3 APPENDED as an element — a different operation)"],
    ["C7", 'schema P {\n  a: integer\n}\nfn f(o, k) { o.has(k) }\nf(P { a: 1 }, true)', 'at HEAD value false (has key true coerced to "true", absent)'],
  ];
  for (const [id, src, leak] of flipRows) {
    it(`RED (${id}): throws the kind belt (${leak})`, async () => {
      assertKindBeltThrow(await probeSource(src), leak, id);
    });
  }
});

// ===========================================================================
// C3n — NON-HANGING wrong-kind-`from` FLIP. `s.replace(n, "z")` with a number
// `from` that does NOT occur (coerced needle "1" absent from "azb") terminates
// at HEAD returning the receiver unchanged — a coercion, not divergence. Kept
// separate from the C3 hang so the wrong-kind-`from` REJECTION is witnessed by a
// row that provably terminates at HEAD even before the belt lands.
// ===========================================================================

describe("bug 0394 non-hanging wrong-kind `from` FLIP — replace(number, str) with an absent needle throws the kind belt", () => {
  it('RED (C3n): `s.replace(a, "z")` / `f("azb", 1)` — at HEAD value "azb" (needle "1" absent, receiver returned); post-fix throws (replace arg 0 expects a string)', async () => {
    assertKindBeltThrow(
      await probeSource('fn f(s, a) { s.replace(a, "z") }\nf("azb", 1)'),
      'at HEAD value "azb" — the number `from` coerced to "1" is absent, so the scan returns the receiver unchanged (coercion, no rejection)',
      "C3n",
    );
  });
});

// ===========================================================================
// C3 — the HANG row (the headline non-termination). `s.replace(n, "z")` with a
// number `from` that DOES match diverges at HEAD: `cursor = at + from.length` is
// `NaN` ((1).length is undefined), `indexOf(x, NaN)` restarts the scan at 0, the
// same match is consumed forever and `result` grows without bound.
// ===========================================================================

describe("bug 0394 C3 HANG — replace(number, str) with a matching needle diverges; the belt must abort promptly", () => {
  // WHY the per-test timeout AND the KIND-message assertion together red this for
  // the right reason at HEAD: the divergent scan is synchronous, so it cannot be
  // interrupted mid-spin — but it does not spin forever: `result` grows until the
  // host throws `RangeError: Invalid string length`. That RangeError routes to
  // the SAME internal-error code as the belt, so the KIND-message assertion
  // (which requires the `expects a string` wording, NOT "Invalid string length")
  // is what reds it. The `{ timeout: 4000 }` bounds the row to a FAILURE rather
  // than an infinite stuck suite in the (host-dependent) case the string cap is
  // never reached. Post-fix the belt fires BEFORE `replaceLiteral` is entered, so
  // this throws the kind defect promptly and turns green.
  it(
    'RED (C3): `s.replace(a, "z")` / `f("a1b", 1)` diverges at HEAD (NaN cursor, unbounded string); post-fix the kind belt throws promptly',
    { timeout: 4000 },
    async () => {
      assertKindBeltThrow(
        await probeSource('fn f(s, a) { s.replace(a, "z") }\nf("a1b", 1)'),
        "at HEAD the scan cursor goes NaN and the same match is consumed forever, growing the result string until a host RangeError",
        "C3",
      );
    },
  );
});

// ===========================================================================
// PURE-HOST harness (b0369 shape, verbatim) — proves the SECOND host
// (`evaluateStdlibMethod`). INTERPOLATION drive (instant-settle session double):
// captures every prompt text handed to `pi.sendUserMessage`. A render throw (the
// belt) escapes `executeBody` before the send, so it is caught here and the
// sent-text log is empty.
// ===========================================================================

// ===========================================================================
// PC1 — the pure host's stdlib-method arm in interpolation position. The
// receiver is a WITHHELD `fn` param, so `${s.startsWith(a)}` inside f's body
// DEFERS at parse and the pure host is the backstop. Calling f at top level
// dispatches the query, rendering the interpolation through
// `evaluateStdlibMethod`. RED at HEAD: `startsWith(5)` coerces 5 to "5",
// fabricates true, renders "v=true", and it is sent — instead of the belt
// throwing before the send.
// ===========================================================================

describe("bug 0394 PC1 — laundered wrong-kind stdlib arg in interpolation position renders + sends the coerced text", () => {
  it('RED (PC1): `@`v=${s.startsWith(a)}`` / `f("5x", 5)` — HEAD sends ["v=true"]; post-fix throws before send', async () => {
    const probe = await driveInterp('fn f(s, a) { @`v=${s.startsWith(a)}` }\nf("5x", 5)');
    if (probe.kind === "rendered") {
      // RED-for-right-reason: `startsWith(5)` coerced 5 to "5", fabricated true,
      // rendered "v=true", and handed it to sendUserMessage — the silent verdict
      // reached the query text.
      expect(
        `${probe.outcome}; sent=${JSON.stringify(probe.sent)}`,
        "PC1: the laundered wrong-kind startsWith arg must abort at render (before send) with the kind belt, not coerce 5 to \"5\" and send",
      ).toBe('threw; sent=[]');
      return;
    }
    assertKindBeltDiagnostic(probe.thrown, "PC1");
    expect(probe.sent, "PC1: the kind belt throws at render, so nothing is handed to sendUserMessage").toEqual([]);
  });
});

// ===========================================================================
// CONTROLS — K1..K8. Byte-identical correct-kind calls: GREEN at HEAD and after.
// A red here means the kind belt would OVER-REACH into a call the spec ADMITS.
// K8 is the ELEMENT-descriptor guard: `includes`'s `"element"` descriptor stays
// runtime-UNCHECKED (structural equality is total over any kind), so a string
// element on an integer array is structurally ABSENT (false), NOT coerced —
// this MUST stay green, proving the belt does not touch "element".
// ===========================================================================

describe("bug 0394 controls — correct-kind calls are byte-identical (belt must not fire)", () => {
  const controlRows: ReadonlyArray<readonly [string, string, ThetaValue]> = [
    ["K1", 'fn f(s, a) { s.startsWith(a) }\nf("ab", "a")', true],
    ["K2", 'fn f(s, a, b) { s.replace(a, b) }\nf("a-b", "-", "+")', "a+b"],
    ["K3", 'fn f(xs, sep) { xs.join(sep) }\nf(["a", "b"], "-")', "a-b"],
    ["K4", 'fn f(xs, a) { xs.slice(a) }\nf([1, 2, 3], 1)', [2, 3]],
    ["K5", 'fn f(xs, a, b) { xs.slice(a, b) }\nf([1, 2, 3], 0, 2)', [1, 2]],
    ["K6", 'fn f(xs, o) { xs.concat(o) }\nf([1, 2], [3])', [1, 2, 3]],
    ["K7", 'schema P {\n  a: integer\n}\nfn f(o, k) { o.has(k) }\nf(P { a: 1 }, "a")', true],
    ["K8", 'fn f(xs, a) { xs.includes(a) }\nf([1, 2], "1")', false],
  ];
  for (const [id, src, expected] of controlRows) {
    it(`CONTROL (${id}): correct-kind call yields ${render(expected)}`, async () => {
      assertValue(await probeSource(src), expected, id);
    });
  }
});
