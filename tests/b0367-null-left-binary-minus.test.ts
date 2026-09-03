// Bug 0367 — a binary `-` whose LEFT operand is the literal `null` is
// AST-identical to unary minus, so `let x = null - 3` loads clean and evaluates
// to `-3`. The parser lowers unary `-` to `binary(-, <synthetic null>, operand)`
// (`src/parser/theta-document.ts:4717-4725`, via `nullExpr` at `:6190`), and the
// synthetic placeholder is byte-identical in `kind` to a parsed literal `null`.
// Every consumer that must special-case unary minus therefore keys on
// `left.kind === "null"` — the bug-0332 parse gate's carve-out
// (`src/parser/type-layer-checks.ts:3095`) and both runtime unary arms
// (`src/runtime/statement-executor.ts:1206`,
// `src/extension/production-theta-producer.ts:7892`) — and every one of them
// also captures the authored program `null - x`. `docs/spec_topics/expressions.md:236`
// §"Other arithmetic" names `null` explicitly in the refusal set for `-`:
// `null - 3` is `theta/parse/non-numeric-arithmetic-operands`, exactly as
// `null * 3` (no unary homograph) already is.
// (docs/bugs/0367-null-left-binary-minus-parses-as-unary-negation.md)
//
// SETTLED FIX (§Fix, the contract this file pins; RED now unless CONTROL). Mark
// the unary production: the binary node minted at `theta-document.ts:4719`
// carries `unary: true`. Then gate three sites on the marker instead of on the
// wide `left.kind === "null"` predicate:
//   1. `type-layer-checks.ts:3095` — carve out only the marked node, so the
//      authored `null - x` reaches `checkArithmeticOperands` and draws
//      `theta/parse/non-numeric-arithmetic-operands` (C1/C2/C5 become load
//      failures, matching the C4 control).
//   2. `statement-executor.ts:1206` — the executor unary arm keys on the marker;
//      an authored `null` left operand falls through to the belted binary path
//      (`BinaryNonNumericError`), the correct laundered-path disposition.
//   3. `production-theta-producer.ts:7892` — the pure-host unary arm keys on the
//      marker likewise. NOTE the interpolation type-layer carve-out
//      (`type-layer-checks.ts:3461`) is a SEPARATE, untouched site, so an
//      interpolation `${null - 3}` parses clean before AND after the fix and is
//      belted only at runtime by site 3.
// Genuine unary minus (`-3`, `-(2+3)`, `-x`) stays byte-identical on both hosts.
//
// WITNESS TABLE (the FIXED contract; RED now unless marked CONTROL/GREEN):
//   GROUP A — parse-refusal (the doc symptom, §Reproduction C1/C2/C5):
//     C1  let x = null - 3    / x  PARSE contains the code  HEAD [] (RED)
//     C2  let x = null - "a"  / x  PARSE contains the code  HEAD [] (RED)
//     C5  let x = null - null / x  PARSE contains the code  HEAD [] (RED)
//   GROUP B — parse controls, byte-identical (GREEN now and after):
//     C4  let x = null * 3    / x  PARSE contains the code  (null under `*`, no
//                                    unary homograph — the discriminating control)
//     C3  let x = "a" - 1     / x  PARSE contains the code
//   GROUP N — genuine unary, byte-identical (GREEN now and after):
//     N1  let x = -3          / x  no code; value -3
//     N2  let y = -(2 + 3)    / y  no code; value -5
//     N3  let n=5; let z=-n   / z  no code; value -5 (unary over a bound ident)
//   GROUP R-STMT — statement-host runtime belt (evalBinary, hand-built AST):
//     RS  binary(-, null, 3)  no marker  RUNTIME LOUD THROW  HEAD value -3 (RED)
//     RSc binary(-, null, 3)  unary:true  value -3  (genuine unary; GREEN both)
//   GROUP R-PURE — pure-host runtime belt (evaluateBinaryExpression, interp):
//     RP  @`v=${null - 3}`    aborts before send (sent=[])  HEAD sends "v=-3" (RED)
//     RPc @`v=${-3}`          sends "v=-3"  (genuine unary; GREEN both)
//
// RED-FOR-RIGHT-REASON, per row:
//   GROUP A red: parse is CLEAN ([]) at HEAD — the wide carve-out at
//                type-layer-checks.ts:3095 exempts the authored `null - x`, so
//                the spec-refused pairing draws no diagnostic and binds silently.
//   RS red: evalBinary's unary arm (statement-executor.ts:1206) returns
//           `-(right.value)` = -3 with no numeric belt on the path — silent
//           success where the fix demands a loud belt throw.
//   RP red: the pure host (production-theta-producer.ts:7892) returns -3, the
//           interpolation renders "v=-3" and it is handed to sendUserMessage —
//           silent value on the query text where the fix demands a render abort.
//   GROUP B / GROUP N / CONTROL sub-rows: byte-identical — GREEN at HEAD and
//           after. B4/B3 prove the carve-out (not operand classification) is the
//           mechanism; N1–N3 and the CONTROL sub-rows prove the marker, not
//           `left.kind === "null"`, is the discriminator. If any reds, the
//           witness is wrong.

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
  type Expr,
  type ParseThetaDocumentDeps,
  type ThetaBody,
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

// expressions.md:236 §"Other arithmetic" — the registered code for a spelled
// `-`/`*`/`/`/`%` whose operands are not both numeric. No new code is minted
// (§Fix: "no new diagnostic code — the registered row already covers the
// pairing").
const NON_NUMERIC_ARITHMETIC_OPERANDS_CODE = "theta/parse/non-numeric-arithmetic-operands";

const FM = "---\nmode: prompt\n---\n";

/** The zero body range `surfaceUnexpectedThrow` frames a throw against. */
const SITE = {
  file: "b0367.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

// ===========================================================================
// Shared parse + production-executor harness (the b0332 / b0369 shape,
// verbatim): parseThetaDocument → createProductionProducerDeps →
// bindPromptConversation → executeBody. Offline, provider-free, deterministic.
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
  const source: ThetaSource = { path: "b0367.theta", bytes: new TextEncoder().encode(FM + src) };
  return parseThetaDocument(source, parseDeps());
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. Every
 * fixture this drives (the GROUP N value rows and both R-PURE interpolations) is
 * parse-clean at HEAD by the bug's §Reproduction: genuine unary rides the
 * carve-out, and the interpolation carve-out (type-layer-checks.ts:3461) is a
 * separate untouched site so `${null - 3}` parses clean before AND after. A
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
    // The prompt-mode interpolation drive's only wait primitive is
    // `Clock.setTimeout`; fire the callback synchronously so an instant-settle
    // turn completes deterministically with no real timers (b0369 harness).
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

function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

/** Error-severity diagnostic codes from a parse-only run (the parse rows). */
function parseErrorCodes(src: string): string[] {
  const doc = parseOnly(src);
  return doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

// ===========================================================================
// EXECUTOR harness (b0332 shape, verbatim). A raw non-panic throw propagates out
// of `executeBody` uncaught (the framing that reclassifies it lives one layer
// up, theta-composition-producer.ts), so both dispositions are observable here.
// ===========================================================================

type Probe =
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };

/** A binding's `executeDeps` are body-agnostic, so any parse-clean source mints them. */
function executeDeps() {
  const doc = parseTheta("0");
  const theta: ThetaCompositionInput = {
    slashName: "b0367",
    sourcePath: "/proj/b0367.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  return producer().bindPromptConversation(bindInput).executeDeps;
}

/** Parse + run a self-contained query-free prompt-mode source, capturing a throw. */
async function probeSource(src: string): Promise<Probe> {
  const doc = parseTheta(src);
  const theta: ThetaCompositionInput = {
    slashName: "b0367",
    sourcePath: "/proj/b0367.theta",
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

/** Run a HAND-BUILT body directly through `executeBody`, capturing a throw. */
async function probeBody(body: ThetaBody): Promise<Probe> {
  try {
    return { kind: "value", execution: await executeBody(body, executeDeps()) };
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
    `${what}: the value (byte-identical guard)`,
  ).toEqual(expected);
}

/**
 * Assert a runtime-loud-throw row: the runtime threw a plain `Error` (NOT a
 * `ThetaPanic`) that routes through `surfaceUnexpectedThrow` to the existing
 * `internal-error` surface. `leakDescription` names the silent value the current
 * tree produces instead; the first `expect` reds NAMING it, so the run shows the
 * defect (silent success) rather than a bare assertion count.
 */
function assertLoudThrow(probe: Probe, leakDescription: string, what: string): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: an authored binary \`-\` over a \`null\` left operand must throw LOUDLY (${leakDescription})`,
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
// GROUP A — parse-refusal (the doc symptom, §Reproduction C1/C2/C5). An authored
// binary `-` over a literal `null` left operand must red at PARSE with the
// registered numeric-operand code. RED at HEAD: parse is CLEAN ([]) — the wide
// carve-out (type-layer-checks.ts:3095) exempts the authored `null - x`, so the
// spec-refused pairing binds a silent value.
// ===========================================================================

describe("bug 0367 GROUP A — authored `null - x` reds at parse (the doc symptom)", () => {
  const gateRows: ReadonlyArray<readonly [string, string, string]> = [
    ["C1", "let x = null - 3\nx", "at HEAD [] (RED); after fix contains the code — binds -3 silently"],
    ["C2", 'let x = null - "a"\nx', "at HEAD [] (RED); after fix contains the code — binds NaN silently"],
    ["C5", "let x = null - null\nx", "at HEAD [] (RED); after fix contains the code — binds 0 (-0) silently"],
  ];
  for (const [id, src, disposition] of gateRows) {
    it(`RED (${id}): reds at parse with the numeric-operand code (${disposition})`, () => {
      expect(
        parseErrorCodes(src),
        `${id}: the authored \`null\` left operand of \`-\` must red with the numeric-operand code; at HEAD parse is clean ([])`,
      ).toContain(NON_NUMERIC_ARITHMETIC_OPERANDS_CODE);
    });
  }
});

// ===========================================================================
// GROUP B — parse controls, byte-identical (GREEN now and after). C4 is the
// discriminating control: the identical `null` operand under `*` — an operator
// with no unary homograph — already draws the registered refusal, proving the
// carve-out (not operand classification) is the mechanism. C3 pins a non-`null`
// left operand of `-`, which the carve-out never captured.
// ===========================================================================

describe("bug 0367 GROUP B — parse controls (byte-identical, GREEN now and after)", () => {
  const controlRows: ReadonlyArray<readonly [string, string, string]> = [
    ["C4", "let x = null * 3\nx", "null under `*` — no unary homograph, already refused at HEAD"],
    ["C3", 'let x = "a" - 1\nx', "non-`null` left operand of `-` — never captured by the carve-out"],
  ];
  for (const [id, src, why] of controlRows) {
    it(`CONTROL (${id}): already reds at parse (${why})`, () => {
      expect(
        parseErrorCodes(src),
        `${id}: this pairing is refused at HEAD and after the fix; if it stops reding, the fix removed the wrong carve-out`,
      ).toContain(NON_NUMERIC_ARITHMETIC_OPERANDS_CODE);
    });
  }
});

// ===========================================================================
// GROUP N — genuine unary minus, byte-identical (GREEN now and after). The
// parser models unary `-` as a synthetic-null binary; the marker the fix adds
// exempts EXACTLY these nodes, so they must draw no arithmetic-operand code and
// evaluate to the negation. RED here would mean the fix (or the witness) keys on
// `left.kind === "null"` instead of the marker.
// ===========================================================================

describe("bug 0367 GROUP N — genuine unary minus stays byte-identical (no code, negation value)", () => {
  const unaryRows: ReadonlyArray<readonly [string, string, ThetaValue]> = [
    ["N1", "let x = -3\nx", -3],
    ["N2", "let y = -(2 + 3)\ny", -5],
    ["N3", "let n = 5\nlet z = -n\nz", -5],
  ];
  for (const [id, src, expected] of unaryRows) {
    it(`CONTROL (${id}): draws no arithmetic-operand code`, () => {
      expect(
        parseErrorCodes(src),
        `${id}: genuine unary \`-\` is the marked node; it must not carry the numeric-operand code`,
      ).not.toContain(NON_NUMERIC_ARITHMETIC_OPERANDS_CODE);
    });
    it(`CONTROL (${id}): evaluates to the negation ${render(expected)}`, async () => {
      assertValue(await probeSource(src), expected, id);
    });
  }
});

// ===========================================================================
// GROUP R-STMT — statement-host runtime belt (statement-executor.ts:1206
// evalBinary). The parse gate SHADOWS the source path after the fix, so this arm
// is witnessed via a HAND-BUILT AST binary node — `binary(-, null, 3)` — run
// through `executeBody` directly. RS omits the marker (an authored `null` left);
// RSc carries `unary: true` (a genuine unary). At HEAD both return -3 (the unary
// arm keys on `left.kind === "null"`, blind to the marker); after fix RS falls
// through to the belted binary path and throws while RSc stays -3 — proving the
// marker, not the operand kind, is the discriminator.
// ===========================================================================

const ZERO_RANGE = SITE.range;

/** A literal `null` LEFT operand (the author's spelling — no marker). */
const NULL_LEFT: Expr = { kind: "null", range: ZERO_RANGE } as Expr;

/** A numeric `3` right operand. */
const THREE: Expr = { kind: "number", text: "3", numericType: "integer", range: ZERO_RANGE } as Expr;

/** `binary(-, null, 3)` with NO unary marker — the authored `null - 3`. */
function nullMinusThreeBody(marker: boolean): ThetaBody {
  const tail = {
    kind: "binary",
    op: "-",
    left: NULL_LEFT,
    right: THREE,
    range: ZERO_RANGE,
    // The `unary` field the §Fix adds to the parseUnary mint. Cast: BinaryExpr
    // gains this optional field only under the fix; at HEAD evalBinary ignores
    // it, so the marked and unmarked nodes both evaluate to -3.
    ...(marker ? { unary: true } : {}),
  } as unknown as Expr;
  return { statements: [], tail };
}

describe("bug 0367 GROUP R-STMT — the executor unary arm belts an unmarked `null` left operand", () => {
  it("RED (RS): hand-built `binary(-, null, 3)` WITHOUT marker throws loudly (at HEAD returns success value -3)", async () => {
    // HEAD: evalBinary's `op === \"-\" && left.kind === \"null\"` arm returns
    // -(3) = -3 with no numeric belt on the path — silent success. After fix the
    // unmarked node falls through to the belted binary path and throws loudly.
    assertLoudThrow(
      await probeBody(nullMinusThreeBody(false)),
      "at HEAD returns success value -3 (silent negation of an authored subtraction)",
      "RS",
    );
  });

  it("CONTROL (RSc): the SAME node WITH `unary: true` evaluates to -3 (genuine unary; GREEN now and after)", async () => {
    // The marker is the fix's discriminator: a genuine unary node stays
    // byte-identical (-3) on both hosts. If this reds, the belt over-reached
    // past the marker into genuine unary minus.
    assertValue(await probeBody(nullMinusThreeBody(true)), -3, "RSc");
  });
});

// ===========================================================================
// GROUP R-PURE — pure-host runtime belt (production-theta-producer.ts:7892
// evaluateBinaryExpression), via a SOURCE interpolation. The interpolation
// type-layer carve-out (type-layer-checks.ts:3461) is a separate untouched site,
// so `${null - 3}` parses clean before AND after the fix and reaches the pure
// host at runtime. RP is the authored `${null - 3}` (unmarked); RPc is the
// genuine unary `${-3}` (marked). RED at HEAD: the pure host returns -3, "v=-3"
// renders and is handed to sendUserMessage; after fix RP aborts at render
// (before send) while RPc still renders "v=-3".
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
  | {
      readonly kind: "rendered";
      readonly sent: readonly string[];
      readonly outcome: string;
      readonly value: ThetaValue | undefined;
    }
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
    slashName: "b0367",
    sourcePath: "/proj/b0367.theta",
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

describe("bug 0367 GROUP R-PURE — the pure host belts an authored `${null - 3}` interpolation", () => {
  it('RED (RP): `@`v=${null - 3}`` / `f(1)` — HEAD sends ["v=-3"]; post-fix aborts before send (sent=[])', async () => {
    const probe = await driveInterp("fn f(c) { @`v=${null - 3}` }\nf(1)");
    if (probe.kind === "rendered") {
      // RED-for-right-reason: the pure host's unary arm returns -3, "v=-3"
      // renders and is handed to sendUserMessage — the silent negation of an
      // authored binary subtraction reached the query text.
      expect(
        `${probe.outcome}; sent=${JSON.stringify(probe.sent)}`,
        "RP: the authored `null - 3` interpolation must abort at render (before send), not fabricate -3 and send",
      ).toBe("threw; sent=[]");
      return;
    }
    assertFramesToInternalError(probe.thrown, "RP");
    expect(probe.sent, "RP: the belt throws at render, so nothing is handed to sendUserMessage").toEqual([]);
  });

  it('CONTROL (RPc): `@`v=${-3}`` / `f(1)` sends ["v=-3"] (genuine unary; GREEN now and after)', async () => {
    // Genuine unary `-3` carries the marker post-fix, so the pure host renders
    // it byte-identically. If this reds, the belt over-reached into genuine
    // unary minus on the pure host.
    const probe = await driveInterp("fn f(c) { @`v=${-3}` }\nf(1)");
    if (probe.kind === "threw") {
      expect(
        `threw ${String(probe.thrown)}`,
        "RPc: a genuine unary `-3` interpolation must render, not throw",
      ).toBe('sent=["v=-3"]');
      return;
    }
    expect(probe.outcome, "RPc: the body must succeed").toBe("success");
    expect(probe.sent, "RPc: `-3` renders byte-identically").toEqual(["v=-3"]);
  });
});
