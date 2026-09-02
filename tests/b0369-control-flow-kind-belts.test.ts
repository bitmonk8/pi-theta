// Bug 0369 — the control-flow constructs have no runtime kind discipline for
// values the static layer DEFERRED on (an unannotated `fn` parameter is
// statically unresolvable). `for`/`par for` over a laundered non-array silently
// iterate zero times; `if`/`while`/ternary/`&&`/`||` treat any laundered
// non-boolean as `false`; and unary `!` applies raw JS truthiness — so for
// `c = "x"`, `if c` AND `if !c` BOTH skip, two contradictory truthiness models
// held at once. Every parse gate for these positions is parse-time only and
// correctly defers a withheld operand; nothing re-judges the value at runtime.
// (docs/bugs/0369-control-flow-runtime-kind-fallbacks-silent.md)
//
// TWO evaluation hosts, both measured here (the same disposition asymmetry bug
// 0368 closes for `+`/ordering, one construct family over):
//   - EXECUTOR (`statement-executor.ts`): POST-FIX, the belt now throws
//     `ForIterandKindDefectError` for a non-array iterand in `executeFor`
//     (statement-executor.ts:2064) and `evalParFor`
//     (statement-executor.ts:1688) before any fallback snapshot substitutes
//     the empty array. The shared `requireBoolean` helper
//     (statement-executor.ts:624) throws `BooleanPositionKindDefectError` for
//     a non-boolean, consumed by `executeIf` (statement-executor.ts:1967) and
//     `executeWhile` (statement-executor.ts:2032). The `!` arm
//     (statement-executor.ts:1108), the `&&`/`||` arms
//     (statement-executor.ts:1122,1132), and the executor ternary
//     (statement-executor.ts:994) all route through the same helper.
//   - PURE HOST (`production-theta-producer.ts`): the identical `!`
//     (production-theta-producer.ts:7487), `&&`
//     (production-theta-producer.ts:7500), `||`
//     (production-theta-producer.ts:7514) and ternary-condition
//     (production-theta-producer.ts:7296) arms, serving `${…}` interpolations
//     and invoke/`.theta`-callable arguments.
//
// SETTLED FIX (this file pins the §Fix contract, ROUTE 1 — the loud defect the
// parent adjudication selects, matching the 0314/0332/0338 belt precedent; the
// belt lands in v0.350.0, the unminted version its fix fills). A non-array
// reaching a `for`/`par for` loop entry throws `ForIterandKindDefectError`; a
// non-boolean reaching an `if`/`while`/ternary condition or an operand of
// `&&`/`||`/`!` throws `BooleanPositionKindDefectError`. Both are plain
// `Error`s (NOT `ThetaPanic`s), propagate uncaught out of `executeBody`, and
// route through `surfaceUnexpectedThrow` (src/runtime/runtime-panics.ts) to
// `INTERNAL_ERROR_CODE` (`theta/runtime/internal-error`) — a LOUD FRAMED abort,
// not a crash and not a silent fabricated value. Unary `!` STOPS JS-coercing
// entirely (F3's number→boolean fabrication is the most value-like corruption
// in the family). Genuine-`array` iterands and all-boolean
// conditions/operands stay byte-identical (the E5 + all-boolean controls). The
// belts fire ONLY on statically-WITHHELD operands, which parse-defer exactly as
// bug 0368's do — so every fixture parses clean; a parse error is a harness
// precondition breach (fail loudly), never a skip. `par for`'s belt must fire
// BEFORE worker scheduling so no fabricated empty fan-out is ever observed
// (E6). This harness drives `executeBody` directly (the sibling bug 0332 /
// bug 0338 / bug 0368 shape), so the belt throw surfaces here as the caught
// throw; the assertions route it through the SAME `surfaceUnexpectedThrow` the
// producer's frame uses, asserting the FRAMED disposition — code + `/^internal
// error: /` prefix + that it threw — never the implementer's tail wording.
//
// WITNESS TABLE (the FIXED contract; every FLIP is RED now, every CONTROL GREEN):
//   EXECUTOR iterand (probeSource → executeFor / evalParFor):
//     E1  fn f(x){…for i in x…} / f("abc")   FLIP  HEAD value 0; post-fix loud
//     E2  same                  / f(7)        FLIP  HEAD value 0; post-fix loud
//     E3  same                  / f(null)     FLIP  HEAD value 0; post-fix loud
//     E4  schema P; same        / f(P{a:1})   FLIP  HEAD value 0; post-fix loud
//     E6  fn f(x){par for i in x{1}} / f("abc") FLIP HEAD value [] (JSON "[]"),
//              outcome success; post-fix loud (belt fires before scheduling)
//     E5  same                  / f([9, 9])   CONTROL value 2 (genuine array)
//   EXECUTOR condition/logical (probeSource → executeIf/executeWhile/ternary/…):
//     F1  fn f(c){if c{return 1}return 2} / f(1)  FLIP HEAD value 2; post-fix loud
//     F2  fn f(c){while c{n+=1}n}          / f("x") FLIP HEAD value 0; post-fix loud
//     F5  fn f(c){c ? 10 : 20}             / f(1)  FLIP HEAD value 20; post-fix loud
//     F4  fn f(c){c && true}               / f(1)  FLIP HEAD value false; post-fix loud
//     F3  fn f(c){!c}                       / f(0)  FLIP HEAD value true (JS !0); post-fix loud
//     OR  fn f(c){c || false}              / f(0)  FLIP HEAD value false; post-fix loud
//     F6  fn f(c){if c{r="a"}if !c{r="b"}r}/ f("x") FLIP HEAD value "" (BOTH c and
//              !c behaved false — mutually inconsistent); post-fix the first
//              `if c` throws loudly
//     all-boolean CONTROLS (one per construct, boolean params): if / while / ternary
//              / && / || / ! — each stays byte-identical (green now and after)
//   PURE HOST (second host — evaluateBinaryExpression + evaluatePureExpression):
//     PT   fn f(c){ @`v=${c ? 10 : 20}` } / f(1)  FLIP HEAD sends ["v=20"];
//              post-fix throws before send (sent=[])
//     PNot fn f(c){ @`v=${!c}` }          / f(0)  FLIP HEAD sends ["v=true"];
//              post-fix throws before send (sent=[])
//     PAnd fn f(c){ invoke("./c.theta", c && true) } / f(1)  FLIP HEAD binds false
//              and reaches callee load (parseCalleeCalls===1); post-fix aborts
//              pre-load (parseCalleeCalls===0)
//     PIf  fn g(c){if c{"a"}else{"b"}}; fn f(c){ @`v=${g(c)}` } / f("x")  FLIP HEAD
//              sends ["v=b"] (the else arm); post-fix throws before send (sent=[])
//     POr  fn f(c){ @`v=${c || false}` } / f(0)  FLIP HEAD sends ["v=false"];
//              post-fix throws before send (sent=[])
//     pure-host CONTROLS: f(true) renders ["v=10"] / ["v=false"] / ["v=a"] /
//              ["v=true"] (admitted booleans byte-identical)
//
// RED-FOR-RIGHT-REASON, per row (each `it` names the observed HEAD fabrication,
// and every flip's first `expect` reds by NAMING the silent value):
//   E1/E2/E3/E4  red: the non-array iterand becomes the empty snapshot, the loop
//                     runs zero times, and the body succeeds with n=0.
//   E6  red: `par for` over a laundered string fabricates the empty fan-out `[]`
//            (JSON "[]") as the loop value, outcome success, no throw.
//   F1  red: `if 1` — `1 === true` is false, the then-arm is skipped, value 2.
//   F2  red: `while "x"` — `"x" === true` is false, zero iterations, value 0.
//   F5  red: `1 ? 10 : 20` — `1 === true` is false, the alternate 20 is taken.
//   F4  red: `1 && true` — `1 !== true`, the `&&` arm short-circuits to false.
//   F3  red: `!0` — raw JS truthiness fabricates the boolean true from a number.
//   OR  red: `0 || false` — `0 !== true`, then `false === true` is false.
//   F6  red: `if "x"` AND `if !"x"` BOTH read false, so neither branch runs and
//            r stays "" — the two fallbacks contradict each other observably.
//   PT  red: the ternary renders "20" into the prompt and ["v=20"] is sent,
//            instead of the belt throwing before the send.
//   PNot red: `!0` renders "true" and ["v=true"] is sent.
//   PAnd red: `1 && true` binds false, and the invoke advances to callee load
//            (parseCalleeCalls===1) carrying the fabricated verdict.
//   E5 / all-boolean / pure-host CONTROLS: byte-identical — green at HEAD and
//            after. If any reds, the belt over-reached into a genuine array or
//            an all-boolean condition/operand the spec ADMITS.

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
  isThetaPanic,
  surfaceUnexpectedThrow,
  INTERNAL_ERROR_CODE,
} from "../src/runtime/runtime-panics";
import type { ThetaValue } from "../src/runtime/value";
import {
  createProductionProducerDeps,
  type CalleeParseOutcome,
} from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";

const FM = "---\nmode: prompt\n---\n";

/** The zero body range `surfaceUnexpectedThrow` frames a throw against. */
const SITE = {
  file: "b0369.theta",
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
  const source: ThetaSource = { path: "b0369.theta", bytes: new TextEncoder().encode(FM + src) };
  return parseThetaDocument(source, parseDeps());
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. Every
 * fixture this drives is parse-clean at HEAD BECAUSE its control-flow operands
 * are WITHHELD `fn` params (statically unresolvable), so `checkBooleanPosition`
 * and the iterand check DEFER exactly as bug 0368's operand checks do — the
 * class this report measures is the deferred RUNTIME path, never a parse gap. A
 * rejection here is a harness precondition breach, never a silent skip.
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
// EXECUTOR harness (b0368 shape, verbatim). A raw non-panic throw propagates out
// of `executeBody` uncaught (the framing that reclassifies it lives one layer
// up, theta-composition-producer.ts), so both dispositions are observable here.
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
    slashName: "b0369",
    sourcePath: "/proj/b0369.theta",
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
 * Assert a value row: the body succeeded and its final value equals `expected`.
 * When the runtime threw instead, the first `expect` reds cleanly naming the
 * throw, rather than letting an uncaught throw escape the test.
 */
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

/**
 * Assert a runtime-loud-throw row (every control-flow FLIP): the runtime threw a
 * plain `Error` (NOT a `ThetaPanic`) that routes through `surfaceUnexpectedThrow`
 * to the existing `internal-error` surface. `leakDescription` names the silent
 * value the current tree fabricates instead; the first `expect` reds NAMING it,
 * so the run shows the defect (silent success) rather than a bare assertion
 * count.
 */
function assertLoudThrow(probe: Probe, leakDescription: string, what: string): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a value the spec refuses in this control-flow position must throw LOUDLY (${leakDescription})`,
    ).toBe("runtime loud throw");
    return;
  }
  expect(
    isThetaPanic(probe.thrown),
    `${what}: the loud throw is a plain Error, NOT a ThetaPanic (the six-source panic list is closed). Thrown: ${String(probe.thrown)}`,
  ).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(probe.thrown, SITE);
  expect(
    diagnostic,
    `${what}: surfaceUnexpectedThrow returns a Diagnostic for a non-panic throw`,
  ).toBeDefined();
  const diag = diagnostic as Diagnostic;
  expect(
    diag.code,
    `${what}: the loud throw routes to the existing permitted internal-error surface`,
  ).toBe(INTERNAL_ERROR_CODE);
  expect(
    diag.message,
    `${what}: the internal-error template prefix (tail wording is the implementer's)`,
  ).toMatch(/^internal error: /);
}

// ===========================================================================
// EXECUTOR iterand FLIPS — E1–E4, E6. A non-array reaching a `for`/`par for`
// loop entry must abort loudly at runtime. RED at HEAD: the empty-snapshot
// fallback silently satisfies the loop with zero iterations (E1–E4 value 0) or
// fabricates the empty fan-out (E6 value []).
// ===========================================================================

const FOR_BODY = "fn f(x) { let mut n = 0\nfor i in x { n += 1 }\nn }";

describe("bug 0369 E1–E4, E6 — laundered non-array iterands throw loudly at the loop-entry belt", () => {
  const flipRows: ReadonlyArray<readonly [string, string, string]> = [
    ["E1", `${FOR_BODY}\nf("abc")`, "at HEAD value 0 (zero iterations over the string \"abc\")"],
    ["E2", `${FOR_BODY}\nf(7)`, "at HEAD value 0 (zero iterations over the number 7)"],
    ["E3", `${FOR_BODY}\nf(null)`, "at HEAD value 0 (zero iterations over null)"],
    [
      "E4",
      `schema P {\n  a: integer\n}\n${FOR_BODY}\nf(P { a: 1 })`,
      "at HEAD value 0 (zero iterations over a schema instance)",
    ],
  ];
  for (const [id, src, leak] of flipRows) {
    it(`RED (${id}): throws (${leak})`, async () => {
      assertLoudThrow(await probeSource(src), leak, id);
    });
  }

  // E6: `par for` over a laundered string fabricates the empty fan-out `[]`
  // (JSON "[]") as the loop value, outcome success. Post-fix the belt fires
  // BEFORE worker scheduling (a placement guarantee — CTRL-5 must never observe
  // a fabricated empty fan-out); the observable here is that loud throw
  // replacing the value=[] success.
  it('RED (E6): `par for i in x` over f("abc") throws before worker scheduling (at HEAD value [] — the fabricated empty fan-out)', async () => {
    assertLoudThrow(
      await probeSource('fn f(x) { par for i in x { 1 } }\nf("abc")'),
      "at HEAD value [] (JSON \"[]\") — the empty fan-out fabricated before any worker ran",
      "E6",
    );
  });
});

// ===========================================================================
// E5 — CONTROL. A genuine `array` iterand runs the body exactly once per element.
// Byte-identical: GREEN at HEAD and after. If it reds, the belt over-reached
// into a genuine array.
// ===========================================================================

describe("bug 0369 E5 — a genuine array iterand is byte-identical (belt must not fire)", () => {
  it("CONTROL (E5): `for i in [9, 9]` runs twice, value 2", async () => {
    assertValue(await probeSource(`${FOR_BODY}\nf([9, 9])`), 2, "E5");
  });
});

// ===========================================================================
// EXECUTOR condition/logical FLIPS — F1, F2, F5, F4, F3, OR. A non-boolean
// reaching an `if`/`while`/ternary condition or a `&&`/`||`/`!` operand must
// abort loudly. RED at HEAD: the strict-`true` comparison (or raw JS `!`)
// silently fabricates the verdict named at the `it`.
// ===========================================================================

describe("bug 0369 F1, F2, F5, F4, F3, OR — laundered non-boolean conditions/operands throw loudly", () => {
  const flipRows: ReadonlyArray<readonly [string, string, string]> = [
    ["F1", "fn f(c) { if c { return 1 }\nreturn 2 }\nf(1)", "at HEAD value 2 (`1 === true` is false, the then-arm is skipped)"],
    ["F2", "fn f(c) { let mut n = 0\nwhile c { n += 1 }\nn }\nf(\"x\")", "at HEAD value 0 (`\"x\" === true` is false, zero iterations)"],
    ["F5", "fn f(c) { c ? 10 : 20 }\nf(1)", "at HEAD value 20 (`1 === true` is false, the alternate is taken)"],
    ["F4", "fn f(c) { c && true }\nf(1)", "at HEAD value false (`1 !== true`, `&&` short-circuits to false)"],
    ["F3", "fn f(c) { !c }\nf(0)", "at HEAD value true (JS `!0` — a boolean fabricated from a number)"],
    ["OR", "fn f(c) { c || false }\nf(0)", "at HEAD value false (`0 !== true`, then `false === true` is false)"],
  ];
  for (const [id, src, leak] of flipRows) {
    it(`RED (${id}): throws (${leak})`, async () => {
      assertLoudThrow(await probeSource(src), leak, id);
    });
  }

  // F6: for c = "x", the `if c` fallback AND the `if !c` fallback BOTH read
  // false, so neither branch runs and r stays "" — the two fallbacks contradict
  // each other observably. Post-fix the FIRST condition `if c` throws loudly.
  it('RED (F6): `if c` then `if !c` over f("x") — at HEAD value "" (BOTH c and !c behaved false); post-fix the first `if c` throws', async () => {
    assertLoudThrow(
      await probeSource('fn f(c) { let mut r = ""\nif c { r = "a" }\nif !c { r = "b" }\nr }\nf("x")'),
      'at HEAD value "" — both `if c` and `if !c` fabricated false, so neither branch ran',
      "F6",
    );
  });
});

// ===========================================================================
// All-boolean CONTROLS — one per construct (if / while / ternary / && / || / !),
// driven with boolean `fn` params. Byte-identical: GREEN at HEAD and after. If
// any reds, the belt over-reached into an all-boolean condition/operand the spec
// ADMITS. The `while` control is bounded (`c && n < 2`) so it terminates and
// also covers boolean `&&`.
// ===========================================================================

describe("bug 0369 all-boolean controls — admitted booleans are byte-identical", () => {
  const controlRows: ReadonlyArray<readonly [string, string, ThetaValue]> = [
    ["if/true", "fn f(c) { if c { return 1 }\nreturn 2 }\nf(true)", 1],
    ["if/false", "fn f(c) { if c { return 1 }\nreturn 2 }\nf(false)", 2],
    ["while/true", "fn f(c) { let mut n = 0\nwhile c && n < 2 { n += 1 }\nn }\nf(true)", 2],
    ["while/false", "fn f(c) { let mut n = 0\nwhile c && n < 2 { n += 1 }\nn }\nf(false)", 0],
    ["ternary/true", "fn f(c) { c ? 10 : 20 }\nf(true)", 10],
    ["ternary/false", "fn f(c) { c ? 10 : 20 }\nf(false)", 20],
    ["and/true", "fn f(c) { c && true }\nf(true)", true],
    ["and/false", "fn f(c) { c && true }\nf(false)", false],
    ["or/true", "fn f(c) { c || false }\nf(true)", true],
    ["or/false", "fn f(c) { c || false }\nf(false)", false],
    ["not/true", "fn f(c) { !c }\nf(true)", false],
    ["not/false", "fn f(c) { !c }\nf(false)", true],
  ];
  for (const [id, src, expected] of controlRows) {
    it(`CONTROL (${id}): admitted boolean yields ${render(expected)}`, async () => {
      assertValue(await probeSource(src), expected, id);
    });
  }
});

// ===========================================================================
// PURE-HOST harness (b0368 shape, verbatim) — proves the SECOND host,
// `evaluateBinaryExpression` / `evaluatePureExpression`. INTERPOLATION drive
// (instant-settle session double): captures every prompt text handed to
// `pi.sendUserMessage`. A render throw (the belt) escapes `executeBody` before
// the send, so it is caught here and the sent-text log is empty.
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
    slashName: "b0369",
    sourcePath: "/proj/b0369.theta",
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

// ===========================================================================
// INVOKE drive (b0368 shape). A recording `parseCallee` is the pre-spawn seam:
// `#driveCallee` loads the callee through it BEFORE spawning the child, and it
// runs only after `#resolveInvoke` has already bound the positional args. So
// `parseCallee` reached ⇒ the arg binding produced a value and the invoke
// advanced to callee load; `parseCallee` unreached ⇒ the arg binding threw
// before any callee load or child spawn.
// ===========================================================================

type InvokeProbe =
  | { readonly kind: "value"; readonly parseCalleeCalls: number; readonly outcome: string }
  | { readonly kind: "threw"; readonly parseCalleeCalls: number; readonly thrown: unknown };

async function driveInvoke(src: string): Promise<InvokeProbe> {
  const doc = parseTheta(src);
  let parseCalleeCalls = 0;
  const pi = {
    sendMessage: (): void => {},
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const deps = createProductionProducerDeps({
    pi,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    // Bug 0293: `undefined` still yields Err(load_failure) as a VALUE (the
    // seam-absent default) — enough to record that the invoke reached callee
    // load carrying the bound arg; the child is never spawned.
    parseCallee: (_caller: string | undefined, _path: string): Promise<CalleeParseOutcome | undefined> => {
      parseCalleeCalls += 1;
      return Promise.resolve(undefined);
    },
  });
  const ctx = {
    model: { id: "m1", provider: "anthropic" },
    signal: undefined,
  } as unknown as ExtensionCommandContext;
  const theta: ThetaCompositionInput = {
    slashName: "b0369",
    sourcePath: "/proj/b0369.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const binding = deps.bindPromptConversation({
    theta,
    args: "",
    ctx,
    thetaAbort: new AbortController(),
  });
  try {
    const execution = await executeBody(theta.body, binding.executeDeps);
    return { kind: "value", parseCalleeCalls, outcome: execution.outcome };
  } catch (thrown) {
    return { kind: "threw", parseCalleeCalls, thrown };
  }
}

/**
 * Shared framing assertion: a caught throw must be the belt's plain `Error` (NOT
 * a `ThetaPanic`) that `surfaceUnexpectedThrow` frames to INTERNAL_ERROR_CODE —
 * the LOUD FRAMED disposition, not an unframed crash.
 */
function assertFramesToInternalError(thrown: unknown, what: string): void {
  expect(
    isThetaPanic(thrown),
    `${what}: the belt is a plain Error, NOT a ThetaPanic (the six-source panic list is closed); thrown: ${String(thrown)}`,
  ).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(thrown, SITE);
  expect(diagnostic, `${what}: surfaceUnexpectedThrow returns a Diagnostic for the belt throw`).toBeDefined();
  const diag = diagnostic as Diagnostic;
  expect(
    diag.code,
    `${what}: the belt throw routes to the permitted internal-error surface (theta/runtime/internal-error)`,
  ).toBe(INTERNAL_ERROR_CODE);
  expect(
    diag.message,
    `${what}: the internal-error template prefix (tail wording is the implementer's)`,
  ).toMatch(/^internal error: /);
}

// ===========================================================================
// PT / PNot — the pure host's ternary-condition and `!` arms in interpolation
// position. The operand is a WITHHELD `fn` param, so `${c ? 10 : 20}` / `${!c}`
// inside f's body DEFER at parse and the pure host is the backstop. Calling f at
// top level dispatches the query, rendering the interpolation through
// `evaluatePureExpression`. RED at HEAD: the render fabricates the verdict and
// the coerced text is sent, instead of the belt throwing before the send.
// ===========================================================================

describe("bug 0369 PT / PNot — laundered ternary/`!` in interpolation position render + send the fabricated text", () => {
  it('RED (PT): `@`v=${c ? 10 : 20}`` / `f(1)` — HEAD sends ["v=20"]; post-fix throws before send', async () => {
    const probe = await driveInterp("fn f(c) { @`v=${c ? 10 : 20}` }\nf(1)");
    if (probe.kind === "rendered") {
      // RED-for-right-reason: `1 === true` fabricated the alternate 20 into the
      // prompt and handed it to sendUserMessage — the silent verdict reached the
      // query text.
      expect(
        `${probe.outcome}; sent=${JSON.stringify(probe.sent)}`,
        "PT: the laundered ternary condition must abort at render (before send), not fabricate the alternate and send",
      ).toBe('threw; sent=[]');
      return;
    }
    assertFramesToInternalError(probe.thrown, "PT");
    expect(probe.sent, "PT: the belt throws at render, so nothing is handed to sendUserMessage").toEqual([]);
  });

  it('RED (PNot): `@`v=${!c}`` / `f(0)` — HEAD sends ["v=true"]; post-fix throws before send', async () => {
    const probe = await driveInterp("fn f(c) { @`v=${!c}` }\nf(0)");
    if (probe.kind === "rendered") {
      // RED-for-right-reason: raw JS `!0` fabricated the boolean true, rendered
      // "v=true", and it was sent.
      expect(
        `${probe.outcome}; sent=${JSON.stringify(probe.sent)}`,
        "PNot: the laundered `!` must abort at render (before send), not JS-coerce `!0` to true and send",
      ).toBe('threw; sent=[]');
      return;
    }
    assertFramesToInternalError(probe.thrown, "PNot");
    expect(probe.sent, "PNot: the belt throws at render, so nothing is handed to sendUserMessage").toEqual([]);
  });
});

// ===========================================================================
// Pure-host CONTROLS — admitted booleans in interpolation position render
// byte-identically. GREEN at HEAD and after; witness nothing, guard the
// admitted path.
// ===========================================================================

describe("bug 0369 pure-host controls — admitted booleans render byte-identically", () => {
  it('CONTROL (PT-ok): `@`v=${c ? 10 : 20}`` / `f(true)` sends ["v=10"]', async () => {
    const probe = await driveInterp("fn f(c) { @`v=${c ? 10 : 20}` }\nf(true)");
    if (probe.kind === "threw") {
      expect(
        `threw ${String(probe.thrown)}`,
        "PT-ok: an admitted boolean condition must render the consequent, not throw",
      ).toBe('sent=["v=10"]');
      return;
    }
    expect(probe.outcome, "PT-ok: the body must succeed").toBe("success");
    expect(probe.sent, "PT-ok: `true ? 10 : 20` renders 10 byte-identically").toEqual(["v=10"]);
  });

  it('CONTROL (PNot-ok): `@`v=${!c}`` / `f(true)` sends ["v=false"]', async () => {
    const probe = await driveInterp("fn f(c) { @`v=${!c}` }\nf(true)");
    if (probe.kind === "threw") {
      expect(
        `threw ${String(probe.thrown)}`,
        "PNot-ok: an admitted boolean operand must render the negation, not throw",
      ).toBe('sent=["v=false"]');
      return;
    }
    expect(probe.outcome, "PNot-ok: the body must succeed").toBe("success");
    expect(probe.sent, "PNot-ok: `!true` renders false byte-identically").toEqual(["v=false"]);
  });
});

// ===========================================================================
// PAnd — the pure host's `&&` arm in invoke-argument position. The operand is a
// WITHHELD `fn` param (statically unresolvable → parse defers), so
// `#resolveInvoke` binds the arg at runtime through the pure host. RED at HEAD:
// `1 && true` fabricates false, binds, and reaches the callee load
// (`parseCallee` called) with no throw — the fabricated verdict is on its way to
// the child boundary. Mirrors b0368's PInvoke with `&&`.
// ===========================================================================

describe("bug 0369 PAnd — laundered `&&` invoke arg reaches callee load carrying the fabricated verdict", () => {
  it('RED (PAnd): `invoke("./c.theta", c && true)` / `f(1)` — HEAD binds false and reaches callee load (parseCalleeCalls===1); post-fix aborts pre-load', async () => {
    const probe = await driveInvoke('fn f(c) { invoke("./c.theta", c && true) }\nf(1)');
    if (probe.kind === "value") {
      // RED-for-right-reason: `1 && true` fabricated false, bound it, and the
      // invoke advanced to callee load (parseCallee reached), on its way to the
      // child boundary.
      expect(
        `value; parseCalleeCalls=${probe.parseCalleeCalls}`,
        "PAnd: the invoking theta must abort loudly at arg binding, before any callee load or child spawn",
      ).toBe("loud framed abort; parseCalleeCalls=0");
      return;
    }
    assertFramesToInternalError(probe.thrown, "PAnd");
    expect(
      probe.parseCalleeCalls,
      "PAnd: the belt throws at arg binding, so the callee is never loaded and no child is spawned",
    ).toBe(0);
  });
});

// ===========================================================================
// PIf — the pure host's statement-form `if` (`evaluatePureIf`) reached through a
// nested user `fn` in interpolation position. `g`'s condition operand is a
// WITHHELD `fn` param (statically unresolvable → parse defers), so `if c` inside
// `g` is judged only at runtime by the pure host when `${g(c)}` renders. This
// closes the §Affected census gap the executor `if` (F1) covered but the pure
// statement-`if` did not: a `=== true` comparison silently steered a laundered
// non-boolean to the else arm. GREEN post-belt: the condition throws before send.
// ===========================================================================

describe("bug 0369 PIf — laundered non-boolean through a nested pure-host statement `if` throws loudly", () => {
  it('RED (PIf): `@`v=${g(c)}`` over `g(c){ if c {"a"} else {"b"} }` / `f("x")` — HEAD sends the fabricated else arm; post-fix throws before send', async () => {
    const probe = await driveInterp(
      'fn g(c) { if c { return "a" } else { return "b" } }\nfn f(c) { @`v=${g(c)}` }\nf("x")',
    );
    if (probe.kind === "rendered") {
      // RED-for-right-reason: `"x" === true` is false, the statement-`if`
      // steers to the else arm, and "v=b" reaches sendUserMessage — the silent
      // verdict on the query text.
      expect(
        `${probe.outcome}; sent=${JSON.stringify(probe.sent)}`,
        "PIf: the laundered statement-`if` condition must abort at render (before send), not steer to the else arm and send",
      ).toBe('threw; sent=[]');
      return;
    }
    assertFramesToInternalError(probe.thrown, "PIf");
    expect(probe.sent, "PIf: the belt throws at render, so nothing is handed to sendUserMessage").toEqual([]);
  });

  it('CONTROL (PIf-ok): `@`v=${g(c)}`` / `f(true)` sends ["v=a"]', async () => {
    const probe = await driveInterp(
      'fn g(c) { if c { return "a" } else { return "b" } }\nfn f(c) { @`v=${g(c)}` }\nf(true)',
    );
    if (probe.kind === "threw") {
      expect(
        `threw ${String(probe.thrown)}`,
        "PIf-ok: an admitted boolean condition must take the then-arm, not throw",
      ).toBe('sent=["v=a"]');
      return;
    }
    expect(probe.outcome, "PIf-ok: the body must succeed").toBe("success");
    expect(probe.sent, 'PIf-ok: `if true` renders the then-arm "a" byte-identically').toEqual(["v=a"]);
  });
});

// ===========================================================================
// POr — the pure host's `||` arm in interpolation position (residual R1: the
// `||` belt exists but no pure cell drove it). The left operand is a WITHHELD
// `fn` param (statically unresolvable → parse defers), so `${c || false}` is
// judged only at runtime by the pure host. GREEN post-belt: the operand throws
// before send.
// ===========================================================================

describe("bug 0369 POr — laundered `||` in interpolation position throws loudly (residual R1 coverage)", () => {
  it('RED (POr): `@`v=${c || false}`` / `f(0)` — HEAD sends ["v=false"]; post-fix throws before send', async () => {
    const probe = await driveInterp("fn f(c) { @`v=${c || false}` }\nf(0)");
    if (probe.kind === "rendered") {
      // RED-for-right-reason: `0 !== true`, then the `||` compares `false ===
      // true` false and renders "v=false" into the prompt, which is sent.
      expect(
        `${probe.outcome}; sent=${JSON.stringify(probe.sent)}`,
        "POr: the laundered `||` operand must abort at render (before send), not fabricate false and send",
      ).toBe('threw; sent=[]');
      return;
    }
    assertFramesToInternalError(probe.thrown, "POr");
    expect(probe.sent, "POr: the belt throws at render, so nothing is handed to sendUserMessage").toEqual([]);
  });

  it('CONTROL (POr-ok): `@`v=${c || false}`` / `f(true)` sends ["v=true"]', async () => {
    const probe = await driveInterp("fn f(c) { @`v=${c || false}` }\nf(true)");
    if (probe.kind === "threw") {
      expect(
        `threw ${String(probe.thrown)}`,
        "POr-ok: an admitted boolean operand must render `true`, not throw",
      ).toBe('sent=["v=true"]');
      return;
    }
    expect(probe.outcome, "POr-ok: the body must succeed").toBe("success");
    expect(probe.sent, "POr-ok: `true || false` renders true byte-identically").toEqual(["v=true"]);
  });
});
