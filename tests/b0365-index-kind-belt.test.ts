// Bug 0365 — a fractional or NaN array index passes the runtime bounds check and
// silently fabricates an out-of-model value: `xs[1.5]` / `xs[0 / 0]` load clean,
// bind raw JS `undefined`, read back as `null`, and `[xs[1.5]] == [null]` is
// `false` on a value that prints `[null]`; a string index on an array panics with
// a message that asserts a falsehood (`xs["1"]` → `1 not in 0..3`); a non-string
// object index is silently `String()`-coerced into a manufactured key.
// (docs/bugs/0365-array-index-nonintegral-silent-undefined.md)
//
// ONE shared enforcement site plus the two hosts' index-key coercion:
//   - RUNTIME GUARD: `evaluateIndexAccess`'s array arm
//     (src/runtime/runtime-panics.ts:250-268). The guard reads
//     `if (typeof i !== "number" || i < 0 || i >= target.length)`
//     (runtime-panics.ts:263). `1.5` sits between the ordered bounds and `NaN`
//     is IEEE-754-unordered against both, so both fall through to
//     `target[i]` (runtime-panics.ts:268) — a raw JS `undefined`. A string index
//     takes the `typeof` arm and renders through `renderInteger`
//     (runtime-panics.ts:265), so `xs["1"]` reads `index out of bounds: 1 not in
//     0..3` — a range assertion false of the integer 1 it names.
//   - EXECUTOR key coercion: `statement-executor.ts:965`
//     (`const key = typeof index.value === "number" ? index.value : String(index.value)`).
//   - PURE-HOST key coercion: `production-theta-producer.ts:7215`
//     (`evaluateIndexAccess(target, typeof index === "number" ? index : String(index))`).
// The static layer never constrains an ARRAY receiver's index expression —
// `checkIndex` (src/parser/type-layer-checks.ts:3563) only runs
// `checkIndexReceiver` + `checkObjectIndex` (string index on OBJECT receivers),
// so `xs[1.5]` / `xs["1"]` are parse-clean with fully concrete types (no
// laundering needed); the OBJECT-index laundered rows (H2/H3/PH3) withhold the
// index through an unannotated `fn` param so `checkObjectIndex` DEFERS.
//
// SETTLED FIX (this file pins the §Fix contract, not HEAD's — the fix lands at
// the literal placeholder version 0.357.0 the fix's version fills):
//   - ARRAY arm: the trigger widens so an index that is NOT an integer in
//     `0..arr.length` panics `theta/runtime/index-out-of-bounds`
//     (`IndexOutOfBoundsPanic`, a `ThetaPanic`) — now covering a fractional
//     number (1.5), NaN, a string index, and (still) an out-of-range integer.
//     The MESSAGE renders the ACTUAL offending value: a string QUOTED
//     JSON.stringify-style (`xs["1"]` → `index out of bounds: "1" not in 0..3`,
//     ending the current lie), a finite non-integer as its decimal
//     (1.5 → `1.5`), an out-of-range integer unchanged (5 → `5`). `-0` still
//     READS element 0 (`Number.isInteger(-0)` is true).
//   - OBJECT-index `String()` coercion is REMOVED at BOTH hosts. A non-number,
//     non-string index the parse gate deferred on now throws a LOUD BELT: a
//     plain `Error` (NOT a `ThetaPanic`) that routes through
//     `surfaceUnexpectedThrow` to `INTERNAL_ERROR_CODE`
//     (`theta/runtime/internal-error`) — the b0368/b0369 belt style; NOT a
//     manufactured key, NOT a new registry code.
//
// WITNESS TABLE (the FIXED contract; every FLIP is RED now, every CONTROL GREEN):
//   UNIT (direct evaluateIndexAccess — cleanest for message + `-0`):
//     U-frac    FLIP  HEAD returns undefined; post-fix throws OOB /1\.5 not in 0\.\.3/
//     U-nan     FLIP  HEAD returns undefined; post-fix throws OOB
//     U-str     FLIP  HEAD throws OOB with LYING /1 not in 0\.\.3/; post-fix /"1" not in .../
//     U-oob     CTRL  throws OOB `index out of bounds: 5 not in 0..3` (byte-identical)
//     U-neg     CTRL  throws OOB `index out of bounds: -1 not in 0..3` (byte-identical)
//     U-zero0   CTRL  `-0` returns element 0 (10)
//     U-inrange CTRL  returns 20
//     U-objkey  CTRL  genuine object string-key read returns 7
//   PRODUCTION EXECUTOR (probeSource → executeBody):
//     A1  FLIP  HEAD success value null;      post-fix throws OOB
//     A3  FLIP  HEAD success value null;      post-fix throws OOB
//     A5  FLIP  HEAD success RAW undefined;   post-fix throws OOB
//     A8  FLIP  HEAD success [undefined];     post-fix throws OOB
//     A9  FLIP  HEAD success false;           post-fix throws OOB
//     A4  FLIP  HEAD throws NullIndexAccessPanic (false attribution); post-fix OOB
//     H1  FLIP  HEAD throws OOB LYING /1 not in .../; post-fix /"1" not in .../
//     H2  FLIP  laundered H1;                 post-fix /"1" not in .../
//     H3  FLIP  HEAD throws MissingObjectKeyPanic (String()-coerced "true");
//                                             post-fix plain-Error belt → internal-error
//     A6  CTRL  throws OOB `index out of bounds: 5 not in 0..3` (byte-identical)
//     CTRL-inrange  CTRL  success value 30
//     CTRL-objkey   CTRL  laundered genuine string key → success value 7
//   PRODUCTION PURE HOST (driveInterp — the second sink, index arm):
//     PA   FLIP  HEAD renders + sends; post-fix throws OOB before send (sent===[])
//     PH3  FLIP  HEAD renders/sends OR throws MissingObjectKeyPanic; post-fix
//                plain-Error belt → internal-error, sent===[]
//     PCTRL CTRL renders + sends "v=30" (byte-identical)
//
// RED-FOR-RIGHT-REASON: each flip's FIRST `expect` NAMES the current silent/lying
// observable (returned undefined / success value null / lying unquoted message /
// NullIndexAccessPanic / MissingObjectKeyPanic / rendered+sent), so the run
// visibly shows the 0365 defect — not a bare assertion count.

import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ThetaSource } from "../src/lexer/lexer";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import {
  evaluateIndexAccess,
  IndexOutOfBoundsPanic,
  MissingObjectKeyPanic,
  NullIndexAccessPanic,
  isThetaPanic,
  surfaceUnexpectedThrow,
  INTERNAL_ERROR_CODE,
} from "../src/runtime/runtime-panics";
import type { ThetaValue } from "../src/runtime/value";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";

const FM = "---\nmode: prompt\n---\n";

/** The zero body range `surfaceUnexpectedThrow` frames a throw against. */
const SITE = {
  file: "b0365.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

// ===========================================================================
// Shared parse harness (the b0368 shape, verbatim): parseThetaDocument →
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
  const source: ThetaSource = { path: "b0365.theta", bytes: new TextEncoder().encode(FM + src) };
  return parseThetaDocument(source, parseDeps());
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. Every array-
 * receiver fixture with a literal fractional/string index (A1/A3/A8/A9/A4/H1) is
 * parse-clean at HEAD BECAUSE `checkIndex` (type-layer-checks.ts:3563) never
 * judges an array receiver's index expression — the doc §Affected confirms this,
 * so a REFUSAL here contradicts the doc and is a harness precondition breach, not
 * a silent skip. The object-index laundered fixtures (H2/H3/PH3) withhold the
 * index through an unannotated `fn` param so `checkObjectIndex` defers, exactly
 * the b0368 laundering shape.
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

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    // The prompt-mode drive's only wait primitive is `Clock.setTimeout`; fire the
    // callback synchronously so an instant-settle turn completes deterministically
    // with no real timers (the b0368 harness contract).
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}

function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

// ===========================================================================
// UNIT — direct `evaluateIndexAccess`. Cleanest surface for the panic MESSAGE
// (the H1 lie / the quoted-string fix) and the `-0` element-0 carve-out, with no
// host-layer laundering in between.
// ===========================================================================

type IndexResult =
  | { readonly kind: "value"; readonly value: ThetaValue }
  | { readonly kind: "threw"; readonly thrown: unknown };

function callIndex(target: ThetaValue, index: number | string): IndexResult {
  try {
    return { kind: "value", value: evaluateIndexAccess(target, index) };
  } catch (thrown) {
    return { kind: "threw", thrown };
  }
}

describe("bug 0365 UNIT — evaluateIndexAccess array arm widens to non-integral/NaN/string indices", () => {
  it("RED (U-frac): evaluateIndexAccess([10,20,30], 1.5) panics IndexOutOfBounds, not raw undefined", () => {
    const r = callIndex([10, 20, 30], 1.5);
    if (r.kind === "value") {
      // RED-for-right-reason: the fractional index falls between the ordered
      // bounds and `target[1.5]` returns raw JS `undefined` (a value outside the
      // theta value model), returned as a ThetaValue with zero diagnostics.
      expect(
        `returned ${render(r.value)}`,
        "U-frac: xs[1.5] must panic index-out-of-bounds, not silently return raw JS undefined",
      ).toBe("threw IndexOutOfBoundsPanic");
      return;
    }
    expect(
      r.thrown instanceof IndexOutOfBoundsPanic,
      `U-frac: 1.5 addresses no element of 0..3 → IndexOutOfBoundsPanic; thrown: ${String(r.thrown)}`,
    ).toBe(true);
    expect(
      (r.thrown as Error).message,
      "U-frac: the message renders the offending non-integer as its decimal (1.5)",
    ).toMatch(/index out of bounds: 1\.5 not in 0\.\.3/);
  });

  it("RED (U-nan): evaluateIndexAccess([10,20,30], NaN) panics IndexOutOfBounds, not raw undefined", () => {
    const r = callIndex([10, 20, 30], NaN);
    if (r.kind === "value") {
      // RED-for-right-reason: NaN is IEEE-754-unordered against both bounds
      // (`NaN < 0` and `NaN >= len` are both false), so it evades the guard and
      // `target[NaN]` returns raw JS `undefined`.
      expect(
        `returned ${render(r.value)}`,
        "U-nan: xs[NaN] must panic index-out-of-bounds, not silently return raw JS undefined",
      ).toBe("threw IndexOutOfBoundsPanic");
      return;
    }
    expect(
      r.thrown instanceof IndexOutOfBoundsPanic,
      `U-nan: NaN addresses no element of 0..3 → IndexOutOfBoundsPanic; thrown: ${String(r.thrown)}`,
    ).toBe(true);
  });

  it('RED (U-str): evaluateIndexAccess([10,20,30], "1") panic message QUOTES the string (no lie)', () => {
    const r = callIndex([10, 20, 30], "1");
    if (r.kind === "value") {
      expect(
        `returned ${render(r.value)}`,
        'U-str: xs["1"] must panic index-out-of-bounds',
      ).toBe("threw IndexOutOfBoundsPanic");
      return;
    }
    expect(
      r.thrown instanceof IndexOutOfBoundsPanic,
      `U-str: a string index panics IndexOutOfBoundsPanic; thrown: ${String(r.thrown)}`,
    ).toBe(true);
    // RED-for-right-reason: HEAD renders `renderInteger("1")` → `1`, so the
    // message reads `index out of bounds: 1 not in 0..3` — an assertion FALSE of
    // the integer 1 (1 IS in 0..3). Post-fix must render the QUOTED string so the
    // assertion becomes honest.
    expect(
      (r.thrown as Error).message,
      'U-str: the OOB message must render the offending index as the QUOTED string "1", not the bare integer 1 — the current message asserts a falsehood (1 is in 0..3)',
    ).toMatch(/index out of bounds: "1" not in 0\.\.3/);
  });

  it("CONTROL (U-oob): evaluateIndexAccess(['a','b','c'], 5) — byte-identical A6 message", () => {
    const r = callIndex(["a", "b", "c"], 5);
    expect(r.kind, `U-oob: an out-of-range integer panics; got ${JSON.stringify(r)}`).toBe("threw");
    if (r.kind !== "threw") return;
    expect(r.thrown instanceof IndexOutOfBoundsPanic, "U-oob: IndexOutOfBoundsPanic").toBe(true);
    expect(
      (r.thrown as Error).message,
      "U-oob: an out-of-range integer message is unchanged (byte-identical now and after)",
    ).toBe("index out of bounds: 5 not in 0..3");
  });

  it("CONTROL (U-neg): evaluateIndexAccess(['a','b','c'], -1) — byte-identical negative message", () => {
    const r = callIndex(["a", "b", "c"], -1);
    expect(r.kind, `U-neg: a negative integer panics; got ${JSON.stringify(r)}`).toBe("threw");
    if (r.kind !== "threw") return;
    expect(r.thrown instanceof IndexOutOfBoundsPanic, "U-neg: IndexOutOfBoundsPanic").toBe(true);
    expect(
      (r.thrown as Error).message,
      "U-neg: the negative-index message is unchanged (byte-identical now and after)",
    ).toBe("index out of bounds: -1 not in 0..3");
  });

  it("CONTROL (U-zero0): evaluateIndexAccess([10,20,30], -0) reads element 0 (Number.isInteger(-0))", () => {
    const r = callIndex([10, 20, 30], -0);
    expect(r.kind, `U-zero0: -0 must read element 0, not panic; got ${JSON.stringify(r)}`).toBe("value");
    if (r.kind !== "value") return;
    expect(r.value, "U-zero0: xs[-0] reads element 0 (10) — the fix must preserve this carve-out").toBe(10);
  });

  it("CONTROL (U-inrange): evaluateIndexAccess([10,20,30], 1) returns 20", () => {
    const r = callIndex([10, 20, 30], 1);
    expect(r.kind, `U-inrange: an in-range integer reads its element; got ${JSON.stringify(r)}`).toBe("value");
    if (r.kind !== "value") return;
    expect(r.value, "U-inrange: xs[1] reads element 1 (20) — byte-identical now and after").toBe(20);
  });

  it("CONTROL (U-objkey): evaluateIndexAccess({a: 7}, 'a') returns 7 (genuine object string-key read)", () => {
    const r = callIndex({ a: 7 }, "a");
    expect(r.kind, `U-objkey: a present object string key reads its value; got ${JSON.stringify(r)}`).toBe("value");
    if (r.kind !== "value") return;
    expect(r.value, "U-objkey: obj['a'] reads 7 — the genuine string-key path must stay working").toBe(7);
  });
});

// ===========================================================================
// PRODUCTION EXECUTOR harness (b0368 shape, verbatim). A thrown `ThetaPanic`
// never reaches a `fail` outcome (statement-executor.ts BodyExecution doc) — it
// propagates uncaught out of `executeBody`, so both dispositions (silent success
// vs. loud panic) are observable at this seam.
// ===========================================================================

type Probe =
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };

function producer() {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

/** Parse + run a self-contained query-free prompt-mode source, capturing a throw. */
async function probeSource(src: string): Promise<Probe> {
  const doc = parseTheta(src);
  const theta: ThetaCompositionInput = {
    slashName: "b0365",
    sourcePath: "/proj/b0365.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  try {
    return { kind: "value", execution: await executeBody(theta.body, binding.executeDeps) };
  } catch (thrown) {
    return { kind: "threw", thrown };
  }
}

/**
 * Assert an array-index FLIP row: post-fix the body must panic
 * `IndexOutOfBoundsPanic`. `leakDescription` names the silent/false observable
 * HEAD produces instead; the first `expect` reds NAMING it, so the run shows the
 * 0365 defect rather than a bare count.
 */
function assertThrowsOOB(probe: Probe, leakDescription: string, what: string): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a non-integral/NaN array index must panic index-out-of-bounds LOUDLY (${leakDescription})`,
    ).toBe("threw IndexOutOfBoundsPanic");
    return;
  }
  expect(
    isThetaPanic(probe.thrown),
    `${what}: the OOB disposition is a ThetaPanic; thrown: ${String(probe.thrown)}`,
  ).toBe(true);
  expect(
    probe.thrown instanceof IndexOutOfBoundsPanic,
    `${what}: the panic is IndexOutOfBoundsPanic; thrown: ${String(probe.thrown)}`,
  ).toBe(true);
}

/** Assert a value CONTROL row: success with the byte-identical expected value. */
function assertValue(probe: Probe, expected: ThetaValue, what: string): void {
  if (probe.kind === "threw") {
    expect(
      `threw ${String(probe.thrown)}`,
      `${what}: the witness table says success value ${render(expected)}, but the runtime threw`,
    ).toBe(`success value ${render(expected)}`);
    return;
  }
  expect(probe.execution.outcome, `${what}: the body must succeed`).toBe("success");
  expect(
    probe.execution.result.value,
    `${what}: the control value (byte-identical guard)`,
  ).toEqual(expected);
}

// ---------------------------------------------------------------------------
// A1/A3/A5/A8/A9 — the concrete array FLIP rows. Each silently succeeds at HEAD
// with the observable named at the `it`; post-fix each panics IndexOutOfBounds.
// ---------------------------------------------------------------------------

describe("bug 0365 A1/A3/A5/A8/A9 — concrete non-integral array indices panic at the executor", () => {
  const flipRows: ReadonlyArray<readonly [string, string, string]> = [
    ["A1", "let xs = [1, 2, 3]\nlet y = xs[1.5]\ny", "at HEAD outcome=success value=null (the ident read laundered the raw undefined)"],
    ["A3", "let xs = [1, 2, 3]\nlet y = xs[0 / 0]\ny", "at HEAD outcome=success value=null (NaN index laundered)"],
    ["A5", "fn f(a, i) { a[i] }\nf([1, 2, 3], 1.5)", "at HEAD success with the RAW JS undefined terminal value (no ?? null on the fn-return path)"],
    ["A8", "let xs = [1, 2, 3]\nlet ys = [xs[1.5]]\nys", "at HEAD success with [undefined] — JSON prints [null] but the element is raw undefined"],
    ["A9", "let xs = [1, 2, 3]\nlet ys = [xs[1.5]]\nys == [null]", "at HEAD success value=false — the value that prints [null] is not equal to [null]"],
  ];
  for (const [id, src, leak] of flipRows) {
    it(`RED (${id}): panics IndexOutOfBounds (${leak})`, async () => {
      assertThrowsOOB(await probeSource(src), leak, id);
    });
  }
});

// ---------------------------------------------------------------------------
// A4 — the false NullIndexAccessPanic row. Reading THROUGH the laundered null
// (`y[0]`) currently fires a panic whose registered trigger is a NULL receiver,
// for a receiver the program never produced null. Post-fix the honest OOB fires
// first at `xs[1.5]`, before any null-receiver read.
// ---------------------------------------------------------------------------

describe("bug 0365 A4 — a non-integral index misattributes to NullIndexAccessPanic today", () => {
  it("RED (A4): `xs[1.5]` then `y[0]` — HEAD throws NullIndexAccessPanic; post-fix IndexOutOfBounds", async () => {
    const probe = await probeSource("let xs = [[1], [2]]\nlet y = xs[1.5]\ny[0]");
    if (probe.kind === "value") {
      expect(
        `success value ${render(probe.execution.result.value)}`,
        "A4: xs[1.5] must panic index-out-of-bounds; instead it fabricated a value",
      ).toBe("threw IndexOutOfBoundsPanic");
      return;
    }
    // RED-for-right-reason: HEAD attributes the failure to a null receiver that
    // never existed — the laundered undefined read through [0].
    expect(
      probe.thrown instanceof NullIndexAccessPanic,
      `A4: HEAD misfires NullIndexAccessPanic for a non-null receiver; post-fix the honest OOB fires at xs[1.5] first. thrown: ${String(probe.thrown)}`,
    ).toBe(false);
    expect(
      probe.thrown instanceof IndexOutOfBoundsPanic,
      `A4: post-fix xs[1.5] panics IndexOutOfBoundsPanic; thrown: ${String(probe.thrown)}`,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// H1/H2 — a string index on an array receiver. HEAD throws IndexOutOfBoundsPanic
// with a message that renders the string indistinguishably from an in-range
// integer (`1 not in 0..3`), asserting a falsehood. Post-fix the message QUOTES
// the string. H2 launders the string through a withheld `fn` param.
// ---------------------------------------------------------------------------

describe("bug 0365 H1/H2 — a string array index panics with a QUOTED message (no lie)", () => {
  const rows: ReadonlyArray<readonly [string, string]> = [
    ["H1", 'let xs = [1, 2, 3]\nxs["1"]'],
    ["H2", 'fn f(a, k) { a[k] }\nf([1, 2, 3], "1")'],
  ];
  for (const [id, src] of rows) {
    it(`RED (${id}): the string-index message must QUOTE "1", not lie with bare 1`, async () => {
      const probe = await probeSource(src);
      if (probe.kind === "value") {
        expect(
          `success value ${render(probe.execution.result.value)}`,
          `${id}: a string array index must panic index-out-of-bounds`,
        ).toBe("threw IndexOutOfBoundsPanic");
        return;
      }
      expect(
        probe.thrown instanceof IndexOutOfBoundsPanic,
        `${id}: a string array index panics IndexOutOfBoundsPanic; thrown: ${String(probe.thrown)}`,
      ).toBe(true);
      // RED-for-right-reason: HEAD's message reads `index out of bounds: 1 not in
      // 0..3` — a range assertion false of the integer 1 it names.
      expect(
        (probe.thrown as Error).message,
        `${id}: the message must render the QUOTED string "1", not the bare integer 1 which lies (1 is in 0..3)`,
      ).toMatch(/index out of bounds: "1" not in 0\.\.3/);
    });
  }
});

// ---------------------------------------------------------------------------
// H3 — a non-string OBJECT index (boolean), laundered through a withheld param so
// `checkObjectIndex` defers. HEAD silently `String()`-coerces `true` → key
// `"true"` and fires MissingObjectKeyPanic — a manufactured key. Post-fix a
// plain-Error belt routes through surfaceUnexpectedThrow to internal-error.
// ---------------------------------------------------------------------------

describe("bug 0365 H3 — a laundered boolean object index throws a plain-Error belt, not a coerced key", () => {
  it('RED (H3): `f(P { a: 7 }, true)` — HEAD throws MissingObjectKeyPanic on String()-coerced "true"; post-fix belt', async () => {
    const probe = await probeSource("schema P { a: integer }\nfn f(o, k) { o[k] }\nf(P { a: 7 }, true)");
    if (probe.kind === "value") {
      expect(
        `success value ${render(probe.execution.result.value)}`,
        "H3: a non-string object index the static layer deferred on must abort LOUDLY",
      ).toBe("plain-Error belt → internal-error");
      return;
    }
    // RED-for-right-reason: HEAD String()-coerces the boolean to the key "true"
    // and throws a ThetaPanic (MissingObjectKeyPanic) — a manufactured key.
    expect(
      isThetaPanic(probe.thrown),
      `H3: post-fix the deferred non-string object index throws a PLAIN Error belt, NOT a ThetaPanic (HEAD throws MissingObjectKeyPanic on the String()-coerced "true" key); thrown: ${String(probe.thrown)}`,
    ).toBe(false);
    const diagnostic = surfaceUnexpectedThrow(probe.thrown, SITE);
    expect(diagnostic, "H3: surfaceUnexpectedThrow returns a Diagnostic for the belt throw").toBeDefined();
    const diag = diagnostic as Diagnostic;
    expect(diag.code, "H3: the belt routes to the permitted internal-error surface").toBe(INTERNAL_ERROR_CODE);
    expect(diag.message, "H3: the internal-error template prefix").toMatch(/^internal error: /);
  });
});

// ---------------------------------------------------------------------------
// Executor CONTROLS — byte-identical now and after. A6 (out-of-range integer),
// an in-range integer read, and a laundered GENUINE string object key.
// ---------------------------------------------------------------------------

describe("bug 0365 executor controls — byte-identical panic / value paths", () => {
  it("CONTROL (A6): `xs[5]` panics `index out of bounds: 5 not in 0..3` (byte-identical)", async () => {
    const probe = await probeSource("let xs = [1, 2, 3]\nxs[5]");
    if (probe.kind === "value") {
      expect(
        `success value ${render(probe.execution.result.value)}`,
        "A6: an out-of-range integer must panic index-out-of-bounds",
      ).toBe("threw IndexOutOfBoundsPanic");
      return;
    }
    expect(probe.thrown instanceof IndexOutOfBoundsPanic, "A6: IndexOutOfBoundsPanic").toBe(true);
    expect(
      (probe.thrown as Error).message,
      "A6: the in-range/out-of-range integer message is unchanged (byte-identical now and after)",
    ).toBe("index out of bounds: 5 not in 0..3");
  });

  it("CONTROL (CTRL-inrange): `xs[2]` → 30 (byte-identical)", async () => {
    assertValue(await probeSource("let xs = [10, 20, 30]\nxs[2]"), 30, "CTRL-inrange");
  });

  it("CONTROL (CTRL-objkey): laundered GENUINE string object key `o[\"a\"]` → 7 (byte-identical)", async () => {
    assertValue(
      await probeSource('schema P { a: integer }\nfn f(o, k) { o[k] }\nf(P { a: 7 }, "a")'),
      7,
      "CTRL-objkey",
    );
  });
});

// ===========================================================================
// PURE-HOST harness (b0368 shape, verbatim) — proves the SECOND sink, the pure
// host's index arm (production-theta-producer.ts:7215). INTERPOLATION drive
// (instant-settle session double): captures every prompt text handed to
// `sendUserMessage`. A render throw (the belt / the widened panic) escapes
// `executeBody` before the send, so it is caught here and `sent` is empty.
// ===========================================================================

class InstantSettleSession {
  readonly entries: Array<Record<string, unknown>> = [];
  readonly sent: string[] = [];

  sendUserMessage(text: string): void {
    this.sent.push(text);
    this.entries.push({
      type: "message",
      id: `u${this.entries.length + 1}`,
      parentId: undefined,
      message: { role: "user", content: [{ type: "text", text }] },
    });
    this.entries.push({
      type: "message",
      id: `a${this.entries.length + 1}`,
      parentId: `u${this.entries.length}`,
      message: {
        role: "assistant",
        content: [{ type: "text", text: "settled-reply" }],
        api: "anthropic-messages",
        provider: "anthropic",
        model: "m1",
        stopReason: "stop",
      },
    });
  }

  isIdle(): boolean {
    return true;
  }
}

type InterpProbe =
  | { readonly kind: "rendered"; readonly sent: readonly string[]; readonly outcome: string; readonly value: ThetaValue | undefined }
  | { readonly kind: "threw"; readonly sent: readonly string[]; readonly thrown: unknown };

async function driveInterp(src: string): Promise<InterpProbe> {
  const doc = parseTheta(src);
  const session = new InstantSettleSession();
  const pi = {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (): void => {},
    sendMessage: (): void => {},
  } as unknown as ExtensionAPI;
  const deps = createProductionProducerDeps({
    pi,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
  const ctx = {
    model: { id: "m1", api: "anthropic-messages", provider: "anthropic", strictCapable: true },
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly unknown[] => [...session.entries],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
  const theta: ThetaCompositionInput = {
    slashName: "b0365",
    sourcePath: "/proj/b0365.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const binding = deps.bindPromptConversation({ theta, args: "", ctx });
  try {
    const execution = await executeBody(theta.body, binding.executeDeps);
    return {
      kind: "rendered",
      sent: session.sent,
      outcome: execution.outcome,
      value: execution.result.value,
    };
  } catch (thrown) {
    return { kind: "threw", sent: session.sent, thrown };
  }
}

// ---------------------------------------------------------------------------
// PA — array fractional index in interpolation position (the pure host's index
// arm). The operands are WITHHELD `fn` params, so `${a[i]}` DEFERS at parse and
// the pure host is the backstop. RED at HEAD: `a[1.5]` returns raw undefined, the
// interpolation renders it, and the query text is sent — instead of the widened
// panic throwing before the send.
// ---------------------------------------------------------------------------

describe("bug 0365 PA — laundered fractional array index in interpolation panics before send", () => {
  it("RED (PA): `@`v=${a[i]}`` / `f([1,2,3], 1.5)` — HEAD renders + sends; post-fix throws before send", async () => {
    const probe = await driveInterp("fn f(a, i) { @`v=${a[i]}` }\nf([1, 2, 3], 1.5)");
    if (probe.kind === "rendered") {
      // RED-for-right-reason: the fabricated value was rendered into the prompt
      // and handed to sendUserMessage — the silent value reached the query text.
      expect(
        `${probe.outcome}; sent=${JSON.stringify(probe.sent)}`,
        "PA: a laundered fractional array index in interpolation must abort at render (before send), not render a fabricated value",
      ).toBe("threw; sent=[]");
      return;
    }
    expect(
      probe.thrown instanceof IndexOutOfBoundsPanic,
      `PA: post-fix the pure host's index arm panics IndexOutOfBoundsPanic; thrown: ${String(probe.thrown)}`,
    ).toBe(true);
    expect(probe.sent, "PA: the panic throws at render, so nothing is handed to sendUserMessage").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PH3 — a laundered boolean OBJECT index in interpolation position. HEAD either
// renders the String()-coerced miss or throws MissingObjectKeyPanic (a coerced
// key); post-fix a plain-Error belt routes through surfaceUnexpectedThrow to
// internal-error, and nothing is sent.
// ---------------------------------------------------------------------------

describe("bug 0365 PH3 — laundered boolean object index in interpolation throws a plain-Error belt", () => {
  it("RED (PH3): `@`v=${o[k]}`` / `f(P { a: 7 }, true)` — HEAD coerces/panics; post-fix belt → internal-error", async () => {
    const probe = await driveInterp("schema P { a: integer }\nfn f(o, k) { @`v=${o[k]}` }\nf(P { a: 7 }, true)");
    if (probe.kind === "rendered") {
      // RED-for-right-reason: the String()-coerced miss rendered and was sent.
      expect(
        `rendered; sent=${JSON.stringify(probe.sent)}`,
        "PH3: a non-string object index the static layer deferred on must abort LOUDLY (belt), not render/send a coerced value",
      ).toBe("threw belt; sent=[]");
      return;
    }
    // RED-for-right-reason: HEAD throws MissingObjectKeyPanic (a ThetaPanic) on
    // the String()-coerced "true" key.
    expect(
      isThetaPanic(probe.thrown),
      `PH3: post-fix the deferred boolean object index throws a PLAIN Error belt, NOT a ThetaPanic (HEAD throws MissingObjectKeyPanic on the String()-coerced "true" key); thrown: ${String(probe.thrown)}`,
    ).toBe(false);
    const diagnostic = surfaceUnexpectedThrow(probe.thrown, SITE);
    expect(diagnostic, "PH3: surfaceUnexpectedThrow returns a Diagnostic for the belt throw").toBeDefined();
    const diag = diagnostic as Diagnostic;
    expect(diag.code, "PH3: the belt routes to the permitted internal-error surface").toBe(INTERNAL_ERROR_CODE);
    expect(diag.message, "PH3: the internal-error template prefix").toMatch(/^internal error: /);
    expect(probe.sent, "PH3: the belt throws at render, so nothing is handed to sendUserMessage").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PCTRL — pure host in-range index CONTROL. Byte-identical now and after: the
// interpolation renders "v=30" and the query text is sent.
// ---------------------------------------------------------------------------

describe("bug 0365 PCTRL — pure host in-range index renders + sends (byte-identical)", () => {
  it('CONTROL (PCTRL): `@`v=${a[i]}`` / `f([10,20,30], 2)` renders and sends "v=30"', async () => {
    const probe = await driveInterp("fn f(a, i) { @`v=${a[i]}` }\nf([10, 20, 30], 2)");
    if (probe.kind === "threw") {
      expect(
        `threw ${String(probe.thrown)}`,
        "PCTRL: an in-range pure-host index must render and send, not throw",
      ).toBe('rendered; sent=["v=30"]');
      return;
    }
    expect(probe.outcome, "PCTRL: the body must succeed").toBe("success");
    expect(probe.sent, "PCTRL: the in-range read renders v=30 and is sent (byte-identical now and after)").toEqual(["v=30"]);
  });
});
