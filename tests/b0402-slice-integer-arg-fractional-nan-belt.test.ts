// Bug 0402 — a laundered fractional / NaN / Infinity number under `slice`'s
// `integer` parameters silently JS-truncates on both hosts. The bug-0394 kind
// belt (`assertStdlibArgumentKinds`, src/runtime/stdlib-string.ts:92) checks the
// `"integer"` descriptor by `typeof arg !== "number"` ONLY (stdlib-string.ts:103)
// — a KIND check that admits every IEEE-754 double, including `1.5`, `NaN`, and
// `±Infinity`. `evaluateArrayMember`'s slice arm (stdlib-array.ts:124,
// `receiver.slice(args[0] as number, args[1] as number | undefined)`; signature
// `["integer", "integer"]` at stdlib-array.ts:73) then forwards the raw value
// into `Array.prototype.slice`, whose ToIntegerOrInfinity coercion truncates:
// `1.5` → `1`, `NaN` → `0` (the FULL copy), `Infinity` → length (`[]`). The body
// binds a silently wrong array with zero diagnostics on both evaluation hosts
// (the belt is shared). The byte-identical DIRECT spelling `[1,2,3].slice(1.5)`
// is parse-refused (`theta/parse/stdlib-arg-type-mismatch`, TYPE-2), and the
// same value at INDEX position panics `theta/runtime/index-out-of-bounds` (bug
// 0365) — so the divergence is positional, not doctrinal: one read panics, the
// adjacent read coerces. `NaN`/`Infinity` are reachable in-model without
// laundering tricks (`expressions.md:236` legalises `0 / 0`, `n / 0`, `n % 0`).
// (docs/bugs/0402-slice-integer-arg-fractional-nan-silent-js-truncation.md)
//
// SETTLED §Fix (this file pins the post-fix contract): extend the `"integer"`
// arm of `assertStdlibArgumentKinds` (stdlib-string.ts:103) from
// `typeof arg !== "number"` to `typeof arg !== "number" || !Number.isInteger(arg)`
// — `Number.isInteger` excludes fractional, `NaN`, and `±Infinity` in one
// predicate, while ADMITTING negative integrals (`Number.isInteger(-1) === true`,
// the documented JS negative-index semantics of §Non-goals). The rejection keeps
// the EXISTING bug-0394 belt route: a `StdlibMethodArgumentKindDefectError`
// thrown from the belt, framed by `surfaceUnexpectedThrow`
// (src/runtime/runtime-panics.ts) to `INTERNAL_ERROR_CODE`
// (`theta/runtime/internal-error`) — a LOUD FRAMED abort, not a `ThetaPanic`,
// not a coerced value. One line, both hosts in lockstep, no new registry row.
// The belt fires AFTER the arity check and ONLY on statically-WITHHELD
// arguments; every fixture below parses clean at HEAD BECAUSE its slice receiver
// is a WITHHELD `fn` param (statically unresolvable), so `checkMethodCall`
// defers its signature check — a parse error here is a harness precondition
// breach (fail loudly), never a skip.
//
// BELT MESSAGE SHAPE (identical to bug 0394's; the kind here is "integer"): the
// kind defect body is `internal defect: stdlib method '<method>' argument <i>
// expects an integer, got <actual>; …` and `surfaceUnexpectedThrow` prepends
// `internal error: `. The message assertion matches
// `/stdlib method '\w+' argument \d+ expects an? (string|integer|array)/`, which
// DISTINGUISHES the KIND belt from the bug-0315 ARITY belt's "called with N
// argument(s)" message — both route to the same internal-error code.
//
// WITNESS TABLE (the FIXED contract; every FLIP is RED now, every CONTROL GREEN):
//   EXECUTOR FLIPS (HEAD silently truncates, post-fix belt throws):
//     S7  xs.slice(a)    / f([1,2,3], 1.5)      HEAD value [2,3]   (1.5 → 1) → throws
//     S8  xs.slice(a)    / f([1,2,3], 0 % 0)    HEAD value [1,2,3] (NaN → 0, full copy) → throws
//     S9  xs.slice(a)    / f([1,2,3], 1 / 0)    HEAD value []      (Infinity → length) → throws
//     S12 xs.slice(a, b) / f([1,2,3,4], 0, 2.5) HEAD value [1,2]   (end 2.5 → 2; proves `end` shares the descriptor+fix site) → throws
//   PURE-HOST FLIP (driveInterp; HEAD sends the coerced text, post-fix sent=[]):
//     S13 @`v=${xs.slice(a)}` / f([1,2,3], 1.5) HEAD sends ["v=[2,3]"] → throws, sent=[]
//   CONTROLS (byte-identical correct-kind INTEGER calls; GREEN now AND after):
//     K1 slice(1)=[2,3]  K2 slice(0,2)=[1,2]
//     K3 slice(-1)=[3]   K4 slice(-2,-1)=[2]  (NEGATIVE INTEGRAL — §Non-goals: documented JS
//        negative-index semantics; Number.isInteger(-1)===true so the belt MUST admit it — load-bearing)

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

const FM = "---\nmode: prompt\n---\n";

/** The zero body range `surfaceUnexpectedThrow` frames a throw against. */
const SITE = {
  file: "b0402.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

// ===========================================================================
// Shared parse harness (the b0394 shape, verbatim): parseThetaDocument →
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
  const source: ThetaSource = { path: "b0402.theta", bytes: new TextEncoder().encode(FM + src) };
  return parseThetaDocument(source, parseDeps());
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. Every
 * fixture this drives is parse-clean at HEAD BECAUSE its slice receiver is a
 * WITHHELD `fn` param (statically unresolvable), so `checkMethodCall` defers its
 * signature check — the class this report measures is the deferred RUNTIME path,
 * never a parse gap. A rejection here is a harness precondition breach, never a
 * silent skip.
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
    // with no real timers (the b0394 harness contract).
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
// EXECUTOR harness (b0394 shape, verbatim). A raw non-panic throw propagates out
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
    slashName: "b0402",
    sourcePath: "/proj/b0402.theta",
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
 * Assert a value row (the correct-kind CONTROLS): the body succeeded and its
 * final value equals `expected`. When the runtime threw instead, the first
 * `expect` reds cleanly naming the throw — a red here means the kind belt
 * OVER-REACHED into a correct-kind call the spec ADMITS.
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
 * The KIND-belt framing assertion (the b0394 helper, verbatim): a caught throw
 * must be the belt's plain `Error` (NOT a `ThetaPanic`) that
 * `surfaceUnexpectedThrow` frames to INTERNAL_ERROR_CODE, AND whose message
 * carries the wrong-KIND wording. The message match is what distinguishes this
 * belt from the bug-0315 ARITY belt ("called with N argument(s)") — both route
 * to the same internal-error code, so without the message shape an arity throw
 * would masquerade as a pass.
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
    `${what}: the wrong-KIND belt message shape (distinguishes the KIND belt from the ARITY belt's "called with N argument(s)"). Message: ${diag.message}`,
  ).toMatch(/stdlib method '\w+' argument \d+ expects an? (string|integer|array)/);
}

/**
 * Assert a fractional/non-finite FLIP row: at HEAD the slice arm forwards the
 * raw value into `Array.prototype.slice` and the body SUCCEEDS with the
 * silently-truncated value named by `leakDescription` (the first `expect` reds
 * NAMING it); post-fix the kind belt throws the framed defect.
 */
function assertKindBeltThrow(probe: Probe, leakDescription: string, what: string): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a fractional/non-finite integer stdlib argument on a laundered receiver must throw the kind belt LOUDLY (${leakDescription})`,
    ).toBe("runtime kind-belt throw");
    return;
  }
  assertKindBeltDiagnostic(probe.thrown, what);
}

// ===========================================================================
// EXECUTOR FLIPS — S7, S8, S9, S12. A correct-arity slice call with a
// fractional / NaN / Infinity `integer` argument on a laundered receiver must
// abort loudly at the kind belt. RED at HEAD: the unchecked `as number` cast
// (stdlib-array.ts:124) forwards the raw value into `Array.prototype.slice` and
// ToIntegerOrInfinity fabricates the value named at the `it`.
// ===========================================================================

describe("bug 0402 slice-integer FLIPs — fractional/NaN/Infinity slice args on a laundered receiver throw the kind belt", () => {
  const flipRows: ReadonlyArray<readonly [string, string, string]> = [
    ["S7", "fn f(xs, a) { xs.slice(a) }\nf([1, 2, 3], 1.5)", "at HEAD value [2,3] (fractional 1.5 truncated to integer 1)"],
    ["S8", "fn f(xs, a) { xs.slice(a) }\nf([1, 2, 3], 0 % 0)", "at HEAD value [1,2,3] (NaN coerced to 0 — the FULL copy)"],
    ["S9", "fn f(xs, a) { xs.slice(a) }\nf([1, 2, 3], 1 / 0)", "at HEAD value [] (Infinity coerced to length)"],
    ["S12", "fn f(xs, a, b) { xs.slice(a, b) }\nf([1, 2, 3, 4], 0, 2.5)", "at HEAD value [1,2] (fractional end 2.5 truncated to 2 — proves optional `end` shares the descriptor+fix site)"],
  ];
  for (const [id, src, leak] of flipRows) {
    it(`RED (${id}): throws the kind belt (${leak})`, async () => {
      assertKindBeltThrow(await probeSource(src), leak, id);
    });
  }
});

// ===========================================================================
// PURE-HOST harness (b0394 shape, verbatim) — proves the SECOND host
// (`evaluateStdlibMethod`). INTERPOLATION drive (instant-settle session double):
// captures every prompt text handed to `pi.sendUserMessage`. A render throw (the
// belt) escapes `executeBody` before the send, so it is caught here and the
// sent-text log is empty.
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
    slashName: "b0402",
    sourcePath: "/proj/b0402.theta",
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
// S13 — the pure host's stdlib-method arm in interpolation position. The
// receiver is a WITHHELD `fn` param, so `${xs.slice(a)}` inside f's body DEFERS
// at parse and the pure host is the backstop. Calling f at top level dispatches
// the query, rendering the interpolation through `evaluateStdlibMethod`. RED at
// HEAD: `slice(1.5)` truncates to `slice(1)`, fabricates [2,3], renders
// "v=[2,3]", and it is sent — instead of the belt throwing before the send.
// ===========================================================================

describe("bug 0402 S13 — laundered fractional slice arg in interpolation position renders + sends the truncated text", () => {
  it('RED (S13): `@`v=${xs.slice(a)}`` / `f([1, 2, 3], 1.5)` — HEAD sends ["v=[2,3]"]; post-fix throws before send', async () => {
    const probe = await driveInterp("fn f(xs, a) { @`v=${xs.slice(a)}` }\nf([1, 2, 3], 1.5)");
    if (probe.kind === "rendered") {
      // RED-for-right-reason: `slice(1.5)` truncated to `slice(1)`, fabricated
      // [2,3], rendered "v=[2,3]", and handed it to sendUserMessage — the silent
      // truncated value reached the query text.
      expect(
        `${probe.outcome}; sent=${JSON.stringify(probe.sent)}`,
        "S13: the laundered fractional slice arg must abort at render (before send) with the kind belt, not truncate 1.5 to 1 and send",
      ).toBe('threw; sent=[]');
      return;
    }
    assertKindBeltDiagnostic(probe.thrown, "S13");
    expect(probe.sent, "S13: the kind belt throws at render, so nothing is handed to sendUserMessage").toEqual([]);
  });
});

// ===========================================================================
// CONTROLS — K1..K4. Byte-identical correct-kind INTEGER calls: GREEN at HEAD
// and after. A red here means the kind belt would OVER-REACH into a call the
// spec ADMITS. K3/K4 are the NEGATIVE-INTEGRAL guards (§Non-goals: documented
// JS negative-index semantics; `Number.isInteger(-1) === true`, so the fixed
// belt MUST admit them) — load-bearing: they prove the fix predicate is
// integrality, not sign.
// ===========================================================================

describe("bug 0402 controls — correct-kind INTEGER calls are byte-identical (belt must not fire)", () => {
  const controlRows: ReadonlyArray<readonly [string, string, ThetaValue]> = [
    ["K1", "fn f(xs, a) { xs.slice(a) }\nf([1, 2, 3], 1)", [2, 3]],
    ["K2", "fn f(xs, a, b) { xs.slice(a, b) }\nf([1, 2, 3], 0, 2)", [1, 2]],
    ["K3", "fn f(xs, a) { xs.slice(a) }\nf([1, 2, 3], -1)", [3]],
    ["K4", "fn f(xs, a, b) { xs.slice(a, b) }\nf([1, 2, 3], -2, -1)", [2]],
  ];
  for (const [id, src, expected] of controlRows) {
    it(`CONTROL (${id}): correct-kind INTEGER call yields ${render(expected)}`, async () => {
      assertValue(await probeSource(src), expected, id);
    });
  }
});
