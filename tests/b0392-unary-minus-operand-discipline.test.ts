// Bug 0392 — unary `-` has no operand discipline at any layer. The parse walk
// skips the marked unary node (`type-layer-checks.ts:3095` —
// `ARITHMETIC_OPS.has(e.op) && e.unary !== true`) and adds no unary-specific
// operand check, so even a fully RESOLVABLE non-numeric operand (`let s = "5"` /
// `-s`) loads clean; at runtime both hosts negate through a bare `as number`
// cast, so JS coercion fabricates a number from whatever LAUNDERED value reaches
// the arm through an unannotated `fn` param: `-"5"` → -5, `-true` → -1,
// `-null` → -0, `-[1]` → -1, `-"abc"` → NaN, `-E.A` (enum) → NaN. The
// byte-identical operand one spelling over (`0 - x`) is parse-refused when
// resolvable and aborts loudly at bug 0332's belt when laundered — one operator
// glyph, two dispositions, chosen by arity.
// (docs/bugs/0392-unary-minus-no-operand-discipline.md)
//
// THREE unbelted / ungated sinks, all measured here:
//   - PARSER: `walkExpr`'s arithmetic dispatch
//     (src/parser/type-layer-checks.ts:3095 — the `e.unary !== true` guard skips
//     the unary operand entirely; `checkArithmeticOperands` at
//     src/parser/type-layer-checks.ts:3836 is never reached for a unary node).
//   - EXECUTOR: `evalBinary`'s unary arm
//     (src/runtime/statement-executor.ts:1206-1211 — `if (expr.op === "-" &&
//     expr.unary === true) { … return { flow: "value", value:
//     -(right.value as number) } }`). No kind test.
//   - PURE HOST: `evaluateBinaryExpression`'s unary arm
//     (src/extension/production-theta-producer.ts:7913-7914 — `if (op === "-" &&
//     unary === true) { return -(evaluatePureExpression(rightExpr, …) as
//     number) }`), serving `${…}` interpolations and invoke/`.theta`-callable
//     arguments; equally unbelted.
// The neighbouring `!` arm (bug 0369) and the binary `-`/`*`/`/`/`%` arms
// (bug 0332/0338/0368) already carry the two-layer discipline in both sinks —
// unary `-` is the one arm on either host with neither a gate nor a belt.
//
// SETTLED CONTRACT PINNED HERE (the §Fix end state, NOT HEAD's; the version the
// fix record fills is the literal placeholder 0.387.0). Unary `-` gets the
// family's two layers:
//   1. PARSE: a statically RESOLVABLE non-numeric operand under unary `-` is
//      refused, reusing the code `theta/parse/non-numeric-arithmetic-operands`
//      (a Trigger-column widening naming the unary position — the 0326
//      anti-fork law; the 0314 `mixed-plus-operands` widening is the DIAG-2
//      precedent).
//   2. RUNTIME BELT (executor AND pure host, the 0338 lockstep obligation): a
//      LAUNDERED non-numeric operand (through an unannotated `fn` param)
//      reaching the unary arm throws a plain `Error` (class
//      `UnaryNonNumericError`) — NOT a `ThetaPanic` — that escapes `executeBody`
//      uncaught and routes through `surfaceUnexpectedThrow`
//      (src/runtime/runtime-panics.ts) to `INTERNAL_ERROR_CODE`
//      (`theta/runtime/internal-error`): a LOUD FRAMED abort, not a crash and
//      not a silent coerced value. `NaN`/`±Infinity` are `typeof "number"` →
//      ADMITTED (same carve-out as the binary belts). Numeric negation and the
//      `-0` sign (bug 0188) stay byte-identical.
// This file asserts the FRAMED belt disposition (code + `/^internal error: /`
// prefix + that it threw) — NEVER the implementer's tail wording (the belt
// message is worded honestly with no "deferred" clause; do not pin it).
//
// WITNESS TABLE (the FIXED contract; every FLIP is RED now, every CONTROL GREEN):
//   PARSE FLIPS (resolvable operand; parseErrorCodes must CONTAIN the code —
//   RED now because HEAD's walk has no unary gate, so parse is clean []):
//     A1    let s = "5"  / let y = -s / y     string   HEAD parse []
//     A8    let b = true / let y = -b / y     boolean  HEAD parse []
//     Anull let b = null / let y = -b / y     null     HEAD parse []
//     Aarr  let a = [1]  / let y = -a / y     array    HEAD parse []
//   (all four are statically resolvable: `classifyOperand`
//   (type-layer-checks.ts:168) maps string→"string", boolean/null→"other",
//   array→"other" — none is "unknown", and the negation types by its operand,
//   proven by the downstream `-x` / `x * 2` sink already refusing at HEAD — so
//   a unary gate reusing that classifier catches every one; they reach green.)
//   RUNTIME BELT FLIPS (laundered via unannotated `fn` param; probeSource →
//   assertLoudThrow — RED now because HEAD returns the NAMED fabricated number):
//     A2  fn f(x){ -x } / f("5")   HEAD value -5   ; post-fix loud
//     A3  fn f(x){ -x } / f("abc") HEAD value NaN  ; post-fix loud (operand is
//                                     a string; the RESULT NaN never reaches the
//                                     admit carve-out — that carve-out is for a
//                                     NUMBER operand that is NaN/Infinity)
//     A4  fn f(x){ -x } / f(true)  HEAD value -1   ; post-fix loud
//     A5  fn f(x){ -x } / f(null)  HEAD value -0   ; post-fix loud
//     A6  fn f(x){ -x } / f([1])   HEAD value -1   ; post-fix loud
//     F4  enum E{A} / fn f(x){ -x } / f(E.A) HEAD value NaN ; post-fix loud
//   PURE-HOST BELT FLIP (second sink, evaluateBinaryExpression):
//     PH1 fn f(x){ @`v=${-x}` } / f("5")  HEAD renders + sends ["v=-5"];
//                                     post-fix render throws BEFORE send (sent=[])
//   CONTROLS (GREEN now AND after, byte-identical):
//     A7    fn f(x){ -x } / f(7)         → -7   (numeric operand admitted)
//     CN1   let n = 5 / let z = -n / z   → -5, parse-clean (numeric binding)
//     CN2a  -3                            → -3, parse-clean (direct numeric)
//     CN2b  -(2 + 3)                      → -5, parse-clean (direct numeric)
//     CZero fn f(x){ -x } / f(0)         → -0, Object.is(value, -0) (bug 0188)
//     PHc   fn f(x){ @`v=${-x}` } / f(7) → sends ["v=-7"] (pure-host numeric)
//
// RED-FOR-RIGHT-REASON, per row:
//   A1/A8/Anull/Aarr  red: HEAD parse is CLEAN ([]) — `walkExpr`'s arithmetic
//                          dispatch skips the unary node (`e.unary !== true`),
//                          so the resolvable non-numeric operand draws no
//                          diagnostic and binds a silent JS-coerced value.
//   A2 red: `-"5"` binds -5 (string coerced), no throw.
//   A3 red: `-"abc"` binds NaN (renders JSON null), no throw.
//   A4 red: `-true` binds -1 (bool coerced), no throw.
//   A5 red: `-null` binds -0 (null→0, sign flipped), no throw.
//   A6 red: `-[1]` binds -1 ([1] stringifies to "1"→1), no throw.
//   F4 red: `-E.A` binds NaN (the boxed-String enum carrier coerces), no throw.
//   PH1 red: the interpolation renders "v=-5" and the query text ["v=-5"] is
//            sent, instead of the belt throwing before the send.
//   A7 / CN1 / CN2a / CN2b / CZero / PHc CONTROL: byte-identical numeric guards —
//            green at HEAD and after. If any reds, the fix over-reached into
//            numeric operands, the `-0` sign, or a direct/bound numeric spelling.
//
// FLIP CENSUS: this file is NEW; no existing committed cell flips. Bug 0332's
// N1a/N1b controls (tests/b0332-spelled-arithmetic-non-numeric-operands.test.ts:
// 361-362) and bug 0367's N-rows use NUMERIC operands and stay green; the parse
// half here contradicts 0332's pinned "unary `-` is NOT gated" disposition only
// for NON-numeric operands, so N1a/N1b (`-3`, `-(2 + 3)`) are untouched — a
// same-commit discharge note on bug 0332 is owed BY THE FIXER, not here.

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
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";

// ===========================================================================
// The registry code the PARSE flips must red with. Reused from the binary
// arithmetic family (bug 0332/0314) per §Fix's anti-fork widening — NOT a new
// mint. The FIXED unary gate emits this same code for the unary operand.
// ===========================================================================

/** expressions.md §"Other arithmetic" — a `-` whose operand is not numeric. */
const NON_NUMERIC_ARITHMETIC_OPERANDS_CODE = "theta/parse/non-numeric-arithmetic-operands";

const FM = "---\nmode: prompt\n---\n";

/** The zero body range `surfaceUnexpectedThrow` frames a throw against. */
const SITE = {
  file: "b0392.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

// ===========================================================================
// Shared parse + production-executor harness (the b0332 / b0368 shape, verbatim):
// parseThetaDocument → createProductionProducerDeps → bindPromptConversation →
// executeBody. Offline, provider-free, deterministic.
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
  const source: ThetaSource = { path: "b0392.theta", bytes: new TextEncoder().encode(FM + src) };
  return parseThetaDocument(source, parseDeps());
}

/** Error-severity diagnostic codes from a parse-only run (the parse flip rows). */
function parseErrorCodes(src: string): string[] {
  return parseOnly(src).diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. Every belt /
 * control fixture this drives is parse-clean at HEAD (its non-numeric operand is
 * a WITHHELD `fn` param, statically unresolvable, so any unary gate DEFERS — the
 * class measured here is the deferred RUNTIME path; the numeric controls carry no
 * refusable operand at all). A rejection here is a harness precondition breach,
 * never a silent skip.
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
// EXECUTOR harness (b0332 shape, verbatim). A raw non-panic throw propagates out
// of `executeBody` uncaught (the framing that reclassifies it lives one layer up,
// theta-composition-producer.ts), so both dispositions are observable here.
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
    slashName: "b0392",
    sourcePath: "/proj/b0392.theta",
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
    `${what}: the numeric control value (byte-identical guard)`,
  ).toEqual(expected);
}

/**
 * Assert a runtime-loud-throw row (every belt FLIP): the runtime threw a plain
 * `Error` (NOT a `ThetaPanic`) that routes through `surfaceUnexpectedThrow` to
 * the existing `internal-error` surface. `leakDescription` names the silent
 * fabricated value the current tree produces instead; the first `expect` reds
 * NAMING it, so the run shows the defect (silent success) rather than a bare
 * assertion count.
 */
function assertLoudThrow(probe: Probe, leakDescription: string, what: string): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a laundered non-numeric operand reaching unary \`-\` must throw LOUDLY (${leakDescription})`,
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
// PURE-HOST harness (b0368 shape, verbatim) — proves the SECOND sink,
// `evaluateBinaryExpression`. INTERPOLATION drive (instant-settle session
// double): captures every prompt text handed to `pi.sendUserMessage`. A render
// throw (the belt) escapes `executeBody` before the send, so it is caught here
// and the sent-text log is empty.
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
  | { readonly kind: "rendered"; readonly sent: readonly string[]; readonly outcome: string }
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
    slashName: "b0392",
    sourcePath: "/proj/b0392.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const binding = deps.bindPromptConversation({ theta, args: "", ctx });
  try {
    const execution = await executeBody(theta.body, binding.executeDeps);
    return { kind: "rendered", sent: session.sent, outcome: execution.outcome };
  } catch (thrown) {
    return { kind: "threw", sent: session.sent, thrown };
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
// A1 / A8 / Anull / Aarr — the PARSE flips. A DIRECT unary `-` over a resolvable
// non-numeric let-binding must red at PARSE with the reused numeric-operand code.
// RED at HEAD: parse is CLEAN ([]) — `walkExpr`'s arithmetic dispatch skips the
// unary node (`e.unary !== true`), so the resolvable operand draws no diagnostic
// and binds a silent JS-coerced value.
// ===========================================================================

describe("bug 0392 A1/A8/Anull/Aarr — resolvable non-numeric operand under unary `-` reds at parse", () => {
  const parseRows: ReadonlyArray<readonly [string, string, string]> = [
    ["A1", 'let s = "5"\nlet y = -s\ny', "string operand → HEAD binds -5"],
    ["A8", "let b = true\nlet y = -b\ny", "boolean operand → HEAD binds -1"],
    ["Anull", "let b = null\nlet y = -b\ny", "null operand → HEAD binds -0"],
    ["Aarr", "let a = [1]\nlet y = -a\ny", "array operand → HEAD binds -1"],
  ];
  for (const [id, src, symptom] of parseRows) {
    it(`RED (${id}): reds at parse (${symptom}); at HEAD parse is clean ([])`, () => {
      expect(
        parseErrorCodes(src),
        `${id}: a resolvable non-numeric operand under unary \`-\` must red with the numeric-operand code; at HEAD parse is clean ([])`,
      ).toContain(NON_NUMERIC_ARITHMETIC_OPERANDS_CODE);
    });
  }
});

// ===========================================================================
// A2–A6 + F4 — the RUNTIME BELT flips. A LAUNDERED non-numeric operand (through
// an unannotated `fn` param) reaching the unary arm must abort loudly. RED at
// HEAD: the body silently succeeds with the JS-coerced value named at the `it`.
// ===========================================================================

describe("bug 0392 A2–A6 + F4 — laundered non-numeric operand under unary `-` throws loudly at the runtime belt", () => {
  const beltRows: ReadonlyArray<readonly [string, string, string]> = [
    ["A2", 'fn f(x) { -x }\nf("5")', "at HEAD binds -5 (string coerced)"],
    ["A3", 'fn f(x) { -x }\nf("abc")', "at HEAD binds NaN (string coerced; renders JSON null)"],
    ["A4", "fn f(x) { -x }\nf(true)", "at HEAD binds -1 (boolean coerced)"],
    ["A5", "fn f(x) { -x }\nf(null)", "at HEAD binds -0 (null→0, sign flipped)"],
    ["A6", "fn f(x) { -x }\nf([1])", 'at HEAD binds -1 ([1] stringifies to "1"→1)'],
    ["F4", "enum E { A }\nfn f(x) { -x }\nf(E.A)", "at HEAD binds NaN (boxed-String enum carrier coerces)"],
  ];
  for (const [id, src, leak] of beltRows) {
    it(`RED (${id}): throws (${leak})`, async () => {
      assertLoudThrow(await probeSource(src), leak, id);
    });
  }
});

// ===========================================================================
// PH1 — the PURE-HOST belt flip (second sink, evaluateBinaryExpression). The
// operand is a WITHHELD `fn` param, so the interpolation `${-x}` inside f's body
// DEFERS at parse and the pure host is the backstop. Calling `f("5")` dispatches
// the query, rendering the interpolation through the unary arm. RED at HEAD: the
// render coerces `-"5"` to -5 and the query text ["v=-5"] is sent, instead of the
// belt throwing before the send.
// ===========================================================================

describe("bug 0392 PH1 — laundered unary `-` in interpolation position renders + sends the coerced text", () => {
  it('RED (PH1): `fn f(x) { @`v=${-x}` }` / `f("5")` — HEAD sends ["v=-5"]; post-fix throws before send', async () => {
    const probe = await driveInterp('fn f(x) { @`v=${-x}` }\nf("5")');
    if (probe.kind === "rendered") {
      // RED-for-right-reason: the coerced -5 was rendered into the prompt and
      // handed to sendUserMessage — the silent value reached the query text.
      expect(
        `${probe.outcome}; sent=${JSON.stringify(probe.sent)}`,
        "PH1: the laundered unary `-` interpolation must abort at render (before send), not coerce and send the prompt",
      ).toBe("threw; sent=[]");
      return;
    }
    assertFramesToInternalError(probe.thrown, "PH1");
    expect(
      probe.sent,
      "PH1: the belt throws at render, so nothing is handed to sendUserMessage",
    ).toEqual([]);
  });
});

// ===========================================================================
// A7 / CN1 / CN2a / CN2b — value & parse CONTROLS. Numeric negation, over a
// laundered param, a numeric binding, or a direct spelling, is byte-identical:
// GREEN at HEAD and after. CN1/CN2 also stay parse-clean (this fix must not gate
// a numeric operand — mirrors bug 0332's N1a/N1b non-goal controls). If any reds,
// the fix over-reached into the numeric path.
// ===========================================================================

describe("bug 0392 A7/CN1/CN2 — numeric negation controls (byte-identical, green now and after)", () => {
  const valueRows: ReadonlyArray<readonly [string, string, ThetaValue]> = [
    ["A7", "fn f(x) { -x }\nf(7)", -7],
    ["CN1", "let n = 5\nlet z = -n\nz", -5],
    ["CN2a", "-3", -3],
    ["CN2b", "-(2 + 3)", -5],
  ];
  for (const [id, src, expected] of valueRows) {
    it(`CONTROL (${id}): numeric unary \`-\` yields ${render(expected)}`, async () => {
      assertValue(await probeSource(src), expected, id);
    });
  }

  const parseCleanRows: ReadonlyArray<readonly [string, string]> = [
    ["CN1", "let n = 5\nlet z = -n\nz"],
    ["CN2a", "-3"],
    ["CN2b", "-(2 + 3)"],
  ];
  for (const [id, src] of parseCleanRows) {
    it(`CONTROL (${id}): numeric unary \`-\` draws no arithmetic-operand code (parse clean)`, () => {
      expect(
        parseErrorCodes(src),
        `${id}: unary \`-\` over a numeric operand must not carry the numeric-operand code`,
      ).not.toContain(NON_NUMERIC_ARITHMETIC_OPERANDS_CODE);
    });
  }
});

// ===========================================================================
// CZero — the bug 0188 `-0` sign control. A `-0`-producing unary over a numeric
// operand (0 is typeof number → admitted) must stay `-0`, not `0`. `Object.is`
// distinguishes the sign (`0 === -0` is true, so `.toEqual(-0)` would not).
// GREEN at HEAD and after.
// ===========================================================================

describe("bug 0392 CZero — the `-0` sign is preserved (bug 0188)", () => {
  it("CONTROL (CZero): `fn f(x) { -x }` / `f(0)` binds -0 (Object.is sign byte)", async () => {
    const probe = await probeSource("fn f(x) { -x }\nf(0)");
    if (probe.kind === "threw") {
      expect(
        `threw ${String(probe.thrown)}`,
        "CZero: `-0` over a numeric operand is admitted (0 is typeof number); the belt must NOT fire",
      ).toBe("success value -0");
      return;
    }
    expect(probe.execution.outcome, "CZero: the body must succeed").toBe("success");
    expect(
      Object.is(probe.execution.result.value, -0),
      `CZero: the load-bearing -0 sign (bug 0188) must survive; got ${render(probe.execution.result.value)}`,
    ).toBe(true);
  });
});

// ===========================================================================
// PHc — the PURE-HOST numeric control. Numeric negation in interpolation
// position renders and sends byte-identically. GREEN at HEAD and after; guards
// that the pure-host belt does not over-reach into a numeric operand.
// ===========================================================================

describe("bug 0392 PHc — numeric unary `-` in interpolation position renders + sends (pure-host control)", () => {
  it('CONTROL (PHc): `fn f(x) { @`v=${-x}` }` / `f(7)` sends ["v=-7"]', async () => {
    const probe = await driveInterp('fn f(x) { @`v=${-x}` }\nf(7)');
    if (probe.kind === "threw") {
      expect(
        `threw ${String(probe.thrown)}`,
        "PHc: numeric negation must render and send, not throw",
      ).toBe('rendered; sent=["v=-7"]');
      return;
    }
    expect(probe.outcome, "PHc: the body must succeed").toBe("success");
    expect(
      probe.sent,
      "PHc: numeric negation renders -7 into the query text (byte-identical)",
    ).toEqual(["v=-7"]);
  });
});
