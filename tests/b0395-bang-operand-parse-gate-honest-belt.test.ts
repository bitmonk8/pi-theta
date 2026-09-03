// Bug 0395 — unary `!` on a statically-RESOLVABLE non-boolean has no parse
// gate despite §Truthiness naming `!` a boolean position, and the bug-0369
// runtime belt then fires with a message asserting "the boolean-position type
// gate deferred" — a gate that never judged the operand. `let n = 5` / `!n`
// loads clean and aborts mid-run through `theta/runtime/internal-error`, while
// the same operand under `if` (D2) is refused at load.
// (docs/bugs/0395-bang-operand-no-parse-gate-lying-belt-message.md)
//
// Sibling bug 0392 (unary `-`) is ALREADY LANDED in this tree (lane/x92) —
// sanctioned; it edits the same `walkExpr` binary dispatch chain and both
// hosts' adjacent unary arms. This file neither reverts nor depends on it.
//
// SINKS the SETTLED fix touches (the §Fix end state, NOT HEAD's; the version
// its fix record fills is the literal placeholder 0.388.0):
//   - PARSE union: `src/runtime/expression-evaluator.ts:566` —
//     `export type BooleanPosition = "if" | "while" | "ternary-condition" |
//     "&&" | "||"` — no `!` member (item 1 adds `"!"`).
//   - PARSE dispatch: `src/parser/type-layer-checks.ts:3080` — `walkExpr`'s
//     binary arm dispatches `checkBooleanPosition` for `&&`/`||` only; the
//     parser models `!` as a binary (`op === "!"`, synthetic `null` left) and
//     no branch matches it, so the `!` operand is never judged (item 1
//     dispatches `checkBooleanPosition` on the `!` node's `right`).
//   - RUNTIME belt message: `src/runtime/statement-executor.ts:799`
//     (`BooleanPositionKindDefectError`, thrown at :659) and the PURE HOST's
//     `!` arm `src/extension/production-theta-producer.ts:7910`. The HEAD
//     message ends `…after the boolean-position type gate deferred (bug 0369)`;
//     item 2 rewords the tail to `…without a parse refusal (bug 0369)`. The
//     HEAD (`internal defect: a boolean-position operand (condition, '&&',
//     '||', or '!') requires a boolean, got <type>; a non-boolean value reached
//     the runtime …`) is UNCHANGED — this file's head regex must not perturb it.
//
// SETTLED CONTRACT PINNED HERE (version = placeholder 0.388.0):
//   1. PARSE: a statically RESOLVABLE non-boolean operand under unary `!` is
//      refused at load with code `theta/parse/non-boolean-condition`, exactly
//      as the `if` spelling already is (D2). (D1/D4.)
//   2. DIAGNOSTIC HONESTY: the belt message's provenance clause must not assert
//      a deferral that never happened. Item 2 is INDEPENDENTLY necessary
//      because interpolation `${!s}` over a resolvable string is NOT gated by
//      item 1 (`checkInterpolationOperands` never judges boolean position) — it
//      still reaches the belt at render, and the message must be honest for it
//      (P2). This is the ONE place message wording is pinned, because the lying
//      message IS the defect.
//
// WITNESS TABLE (the FIXED contract; every FLIP is RED now, every CONTROL GREEN):
//   PARSE-REFUSAL FLIPS (item 1; parseErrorCodes CONTAINS the code — RED now
//   because HEAD's walk has no `!` arm, so parse is clean []):
//     D1  let n = 5 / let b = !n / b     integer operand   HEAD parse []
//     D4  let s = "x" / let b = !s / b   string operand    HEAD parse []
//   MESSAGE-HONESTY FLIP (item 2; interpolation `${!s}` over a RESOLVABLE
//   string reaches the belt at render — RED now because the belt message
//   carries the false "deferred" clause):
//     P2  let s = "x" / @`v=${!s}`       HEAD throws at render (sent=[]) with a
//                                        message ending "after the boolean-
//                                        position type gate deferred (bug 0369)"
//   CONTROLS (GREEN now AND after):
//     D2  let n = 5 / if n { null } / null   PARSE contains the code (the `if`
//                                        sibling — unchanged both now and after)
//     D3  fn f(c) { !c } / f(0)          laundered (fn param, unresolvable):
//                                        PARSE clean (correct deferral) + belt
//                                        fires framed to internal-error with the
//                                        head intact (disposition unchanged; the
//                                        tail — deferred→honest — is NOT pinned
//                                        here so this control is green now and
//                                        after)
//     CT  let b = true / let c = !b / c  boolean-literal operand: PARSE clean,
//                                        value false (both now and after)
//
// RED-FOR-RIGHT-REASON, per row:
//   D1/D4 red: HEAD parse is CLEAN ([]) — `walkExpr`'s binary arm has no `op
//              === "!"` branch, so the resolvable non-boolean operand draws no
//              diagnostic and binds a silent value. Post-fix parse CONTAINS
//              `theta/parse/non-boolean-condition`. (Assert the CODE only — the
//              parse message is sourced from the registry, not pinned here.)
//   P2   red: the belt message ends "after the boolean-position type gate
//              deferred (bug 0369)" — a lie for a resolvable operand the gate
//              never judged. Post-fix it ends "without a parse refusal". The
//              HEAD (`…requires a boolean, got string…`) is asserted intact.
//   D2/D3/CT CONTROL: green at HEAD and after. If D2/D3 red, the parse gate
//              regressed the sibling `if` refusal or the laundered deferral; if
//              CT reds, the `!` gate over-reached into an admitted boolean.

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
// The registry code the PARSE flips (D1/D4) and the D2 control must red/hold
// with. It is the same code the sibling `if`/`while`/`&&`/`||`/ternary gates
// already emit (expressions.md:61's shared refusal) — NOT a new mint; the
// FIXED unary-`!` gate reuses it. Assert the CODE only (source-from-registry
// rule; the parse message is the registry's, not this file's).
// ===========================================================================

/** expressions.md:61 — a boolean-position operand whose static type is not `boolean`. */
const NON_BOOLEAN_CONDITION_CODE = "theta/parse/non-boolean-condition";

const FM = "---\nmode: prompt\n---\n";

/** The zero body range `surfaceUnexpectedThrow` frames a throw against. */
const SITE = {
  file: "b0395.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

// ===========================================================================
// Shared parse + production-executor harness (the b0369 / b0392 shape,
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
  const source: ThetaSource = { path: "b0395.theta", bytes: new TextEncoder().encode(FM + src) };
  return parseThetaDocument(source, parseDeps());
}

/** Error-severity diagnostic codes from a parse-only run (the parse flip / control rows). */
function parseErrorCodes(src: string): string[] {
  return parseOnly(src).diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. The runtime
 * fixtures this drives (D3, CT) are parse-clean at HEAD (D3's operand is a
 * WITHHELD `fn` param → the gate defers; CT's is an admitted boolean literal), so
 * a rejection here is a harness precondition breach, never a silent skip. The
 * PARSE-refusal rows (D1/D4) go through `parseErrorCodes` directly, never here —
 * post-fix they refuse at load and must not be forced through the executor.
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
    // with no real timers (the b0369 harness contract).
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
// EXECUTOR harness (b0369 shape, verbatim). A raw non-panic throw propagates
// out of `executeBody` uncaught, so both dispositions are observable here.
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
    slashName: "b0395",
    sourcePath: "/proj/b0395.theta",
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
 * Assert the boolean-position runtime belt fired and routes through
 * `surfaceUnexpectedThrow` to the permitted internal-error surface, and that its
 * message HEAD is intact (`…requires a boolean, got <expectedType>…`). Returns
 * the framed diagnostic message for callers that also pin the tail (P2). Does
 * NOT pin the tail here — D3's control disposition is head + framing only, so it
 * stays green across item 2's reword.
 */
function assertBooleanBelt(probe: Probe, expectedType: string, what: string): string {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a laundered non-boolean operand reaching unary \`!\` must throw LOUDLY at the boolean-position belt`,
    ).toBe("runtime loud throw");
    return "";
  }
  expect(
    isThetaPanic(probe.thrown),
    `${what}: the belt is a plain Error, NOT a ThetaPanic (the six-source panic list is closed). Thrown: ${String(probe.thrown)}`,
  ).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(probe.thrown, SITE);
  expect(
    diagnostic,
    `${what}: surfaceUnexpectedThrow returns a Diagnostic for the belt throw`,
  ).toBeDefined();
  const diag = diagnostic as Diagnostic;
  expect(
    diag.code,
    `${what}: the belt throw routes to the permitted internal-error surface`,
  ).toBe(INTERNAL_ERROR_CODE);
  // The message HEAD is the 0369 belt's and must NOT be perturbed by the fix
  // (the flip-census invariant). Matches HEAD and post-fix identically.
  expect(
    diag.message,
    `${what}: the boolean-position belt HEAD is intact (…requires a boolean, got ${expectedType}…)`,
  ).toMatch(
    new RegExp(`a boolean-position operand .* requires a boolean, got ${expectedType}`),
  );
  return diag.message;
}

// ===========================================================================
// PURE-HOST INTERPOLATION harness (b0369 PNot shape, verbatim). Captures every
// prompt text handed to `pi.sendUserMessage`; a render throw (the belt) escapes
// `executeBody` before the send, so it is caught here and the sent-text log is
// empty.
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
    slashName: "b0395",
    sourcePath: "/proj/b0395.theta",
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

// ===========================================================================
// D1 / D4 — the PARSE-REFUSAL flips (item 1). A DIRECT unary `!` over a
// resolvable non-boolean let-binding must red at PARSE with the shared
// boolean-position code. RED at HEAD: parse is CLEAN ([]) — `walkExpr`'s binary
// arm has no `op === "!"` branch, so the resolvable operand draws no diagnostic.
// ===========================================================================

describe("bug 0395 D1/D4 — resolvable non-boolean operand under unary `!` reds at parse", () => {
  const parseRows: ReadonlyArray<readonly [string, string, string]> = [
    ["D1", "let n = 5\nlet b = !n\nb", "integer operand → HEAD parse []"],
    ["D4", 'let s = "x"\nlet b = !s\nb', "string operand → HEAD parse []"],
  ];
  for (const [id, src, symptom] of parseRows) {
    it(`RED (${id}): reds at parse (${symptom}); at HEAD parse is clean ([])`, () => {
      expect(
        parseErrorCodes(src),
        `${id}: a resolvable non-boolean operand under unary \`!\` must red with the boolean-position code, exactly as the D2 \`if\` spelling; at HEAD parse is clean ([])`,
      ).toContain(NON_BOOLEAN_CONDITION_CODE);
    });
  }
});

// ===========================================================================
// P2 — the MESSAGE-HONESTY flip (item 2). Interpolation `${!s}` over a
// RESOLVABLE string is NOT gated by item 1 (`checkInterpolationOperands` never
// judges boolean position), so it still reaches the pure-host `!` belt at
// render. RED at HEAD: the belt message ends "after the boolean-position type
// gate deferred (bug 0369)" — a lie for an operand the gate never judged.
// Post-fix the tail reads "without a parse refusal". The message HEAD
// (…requires a boolean, got string…) is asserted intact both directions.
// ===========================================================================

describe("bug 0395 P2 — the belt message for a resolvable `${!s}` operand must be honest", () => {
  it('RED (P2): `let s = "x"` / `@`v=${!s}`` — HEAD belt message ends "after the boolean-position type gate deferred"; post-fix "without a parse refusal"', async () => {
    const probe = await driveInterp('let s = "x"\n@`v=${!s}`');
    // The belt throws at render; nothing is sent (the deferral narrative never
    // even gets to fabricate a value here — the lie is purely in the message).
    if (probe.kind === "rendered") {
      expect(
        `rendered; sent=${JSON.stringify(probe.sent)}`,
        "P2: the resolvable `${!s}` operand must reach the boolean-position belt at render, not render + send a coerced value",
      ).toBe("threw at the boolean-position belt");
      return;
    }
    const message = assertBooleanBelt({ kind: "threw", thrown: probe.thrown }, "string", "P2");
    // POSITIVE honesty assertion — reds at HEAD (tail is "…deferred…").
    expect(
      message,
      'P2: the belt message must state the honest provenance "without a parse refusal" for a resolvable operand the gate never judged',
    ).toContain("without a parse refusal");
    // NEGATIVE honesty assertion — reds at HEAD (tail contains "deferred").
    expect(
      message.includes("deferred"),
      'P2: the belt message must NOT claim "the boolean-position type gate deferred" for a resolvable operand the gate never ran on',
    ).toBe(false);
    // The belt is the render backstop: the throw precedes the send.
    expect(probe.sent, "P2: the belt throws at render, so nothing is handed to sendUserMessage").toEqual([]);
  });
});

// ===========================================================================
// D2 — CONTROL. The sibling `if` spelling of the same resolvable non-boolean
// operand is already refused at parse (expressions.md:61). Byte-identical:
// GREEN at HEAD and after. If it reds, the parse gate regressed the `if`
// refusal item 1 mirrors.
// ===========================================================================

describe("bug 0395 D2 — the `if` sibling refuses the same resolvable operand at parse (unchanged)", () => {
  it('CONTROL (D2): `let n = 5` / `if n { null }` reds at parse with the boolean-position code', () => {
    expect(
      parseErrorCodes("let n = 5\nif n { null }\nnull"),
      "D2: the `if` spelling of a resolvable non-boolean is refused at load (both now and after)",
    ).toContain(NON_BOOLEAN_CONDITION_CODE);
  });
});

// ===========================================================================
// D3 — CONTROL. A LAUNDERED `!` operand (unannotated `fn` param, statically
// unresolvable) parse-defers correctly, and the runtime belt fires (bug 0369's
// disposition, correct for the laundered case). Byte-identical DISPOSITION:
// parse clean + belt framed to internal-error with the HEAD intact — green at
// HEAD and after. The tail (deferred→honest under item 2) is NOT pinned here, so
// this control does not flip when item 2 lands. If it reds, item 1 over-reached
// into the deferred class or the belt disposition changed.
// ===========================================================================

describe("bug 0395 D3 — laundered `!` operand defers at parse and fires the belt (disposition unchanged)", () => {
  it('CONTROL (D3): `fn f(c) { !c }` / `f(0)` parses clean and throws the boolean-position belt (framed, head intact)', async () => {
    const src = "fn f(c) { !c }\nf(0)";
    expect(
      parseErrorCodes(src),
      "D3: a WITHHELD `fn` param operand under `!` must DEFER at parse (no boolean-position refusal) — the correct laundered disposition",
    ).not.toContain(NON_BOOLEAN_CONDITION_CODE);
    assertBooleanBelt(await probeSource(src), "number", "D3");
  });
});

// ===========================================================================
// CT — CONTROL. A boolean-literal `!` operand stays clean: parse-clean and value
// `false`. Byte-identical: GREEN at HEAD and after. If it reds, the `!` gate
// over-reached into an admitted boolean operand.
// ===========================================================================

describe("bug 0395 CT — a boolean-literal `!` operand stays clean (parse + value)", () => {
  it("CONTROL (CT): `let b = true` / `let c = !b` / `c` parses clean, value false", async () => {
    const src = "let b = true\nlet c = !b\nc";
    expect(
      parseErrorCodes(src),
      "CT: unary `!` over an admitted boolean operand must not draw the boolean-position code",
    ).not.toContain(NON_BOOLEAN_CONDITION_CODE);
    assertValue(await probeSource(src), false, "CT");
  });
});
