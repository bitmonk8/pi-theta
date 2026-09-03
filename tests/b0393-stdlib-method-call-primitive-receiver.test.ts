// Bug 0393 — a stdlib METHOD CALL on a laundered `number`/`boolean`/`null`
// receiver silently evaluates to `null` on BOTH evaluation hosts. `f(5)` for
// `fn f(x) { x.toUpperCase() }` binds `null` with zero diagnostics; the same
// wrong receiver under INDEX access rejects `theta/runtime/non-object-receiver`
// (bug 0027), under MEMBER access panics loudly, and the resolvable spelling is
// parse-refused `theta/parse/unknown-method`. The one method-CALL cell falls
// off the end of both dispatchers into an unconditional `return null`.
// (docs/bugs/0393-stdlib-method-call-primitive-receiver-silent-null.md)
//
// TWO evaluation hosts, both measured here:
//   - EXECUTOR (`applyStdlibMethod`, src/runtime/statement-executor.ts): a
//     string/array/object arm, then the terminal fall-through at
//     statement-executor.ts:1367 (`return null` pre-fix) for a
//     `number`/`boolean`/`null` receiver.
//   - PURE HOST (`evaluateStdlibMethod`, src/extension/production-theta-producer.ts):
//     the byte-identical arms and the terminal fall-through at
//     production-theta-producer.ts:7886 (`return null` pre-fix); serves
//     `${…}` interpolations and invoke arguments.
//
// PARENT-ADJUDICATED FIX (Doc §Fix Option 1 — widen the registered rejection):
// the fall-through `return null` in BOTH dispatchers is replaced by
// `throw nonObjectReceiverRejection(`.${method}()`, receiver)`, surfacing the
// REGISTERED `theta/runtime/non-object-receiver` (NON_OBJECT_RECEIVER_CODE,
// src/runtime/runtime-panics.ts:56) — symmetrical with the index arm
// (`evaluateIndexAccess` already rejects primitives with this code). The
// `GatedReceiverKind` closed set (runtime-panics.ts:126-132) gains a sixth
// bare `"null"` kind so the B3/F6 `null` receiver names honestly. Message
// template `non-object receiver: cannot read <read> on <receiver kind>`:
//   number:  `non-object receiver: cannot read .toUpperCase() on a number`
//   boolean: `non-object receiver: cannot read .trim() on a boolean`
//   null:    `non-object receiver: cannot read .keys() on null`  (bare, no article)
// `NonObjectReceiverError` is NOT a `ThetaPanic` (isThetaPanic false); it is
// framed by `surfaceUnexpectedThrow(thrown, SITE)` (runtime-panics.ts) into a
// Diagnostic whose `code === NON_OBJECT_RECEIVER_CODE` and whose `message` is
// the BARE template — NO `internal error: ` prefix (that prefix marks the
// OTHER, internal-error arm; this deliberate gate carries its own registered
// code, runtime-panics.ts surfaceUnexpectedThrow's NonObjectReceiverError arm).
//
// WITNESS TABLE (the FIXED contract; every FLIP is RED now, every CONTROL GREEN):
//   EXECUTOR (probeSource → executeBody):
//     B1  fn f(x){ x.toUpperCase() } / f(5)            FLIP  HEAD value null; post-fix ".toUpperCase() on a number"
//     B2  fn f(x){ x.trim() }        / f(true)         FLIP  HEAD value null; post-fix ".trim() on a boolean"
//     B3  fn f(x){ x.keys() }        / f(null)         FLIP  HEAD value null; post-fix ".keys() on null"
//     B4  fn f(x){ x.join(",") }     / f(5)            FLIP  HEAD value null; post-fix ".join() on a number"
//     F6  fn f(x,a){ x.startsWith(a) } / f(null, "n")  FLIP  HEAD value null; post-fix ".startsWith() on null"
//     S-ok  fn f(x){ x.toUpperCase() } / f("ab")               CONTROL value "AB"
//     A-ok  fn f(x){ x.join(",") }     / f(["a","b"])          CONTROL value "a,b"
//     O-ok  schema P{a:integer}; fn f(x){ x.keys() } / f(P{a:1}) CONTROL value ["a"]
//   PURE HOST (driveInterp; HEAD renders null → sends ["v=null"]; post-fix throws before send, sent=[]):
//     PB1  fn f(x){ @`v=${x.toUpperCase()}` } / f(5)   FLIP  HEAD sends ["v=null"]; post-fix ".toUpperCase() on a number"
//     PB3  fn f(x){ @`v=${x.keys()}` }        / f(null) FLIP  HEAD sends ["v=null"]; post-fix ".keys() on null"
//     PS-ok fn f(x){ @`v=${x.toUpperCase()}` } / f("ab") CONTROL sends ["v=AB"]
//
// RED-FOR-RIGHT-REASON, per row: at HEAD the method call falls off the end of
// the dispatcher and fabricates `null` — a success VALUE, no throw. Each FLIP's
// first `expect` reds by NAMING that silent `success value null`. Post-fix the
// same site throws `NonObjectReceiverError` and the assertions route it through
// `surfaceUnexpectedThrow` to NON_OBJECT_RECEIVER_CODE + the bare receiver-kind
// message. The CONTROLS drive string/array/object receivers the dispatcher
// still serves (byte-identical pre/post) — a red there means the harness is
// wrong, not the tree.
//
// Every fixture parses CLEAN: the receiver is a WITHHELD `fn` param
// (statically unresolvable), so `checkMethodCall` (src/parser/type-layer-checks.ts)
// defers to the runtime — the deferred RUNTIME path this bug measures. A parse
// error is a harness precondition breach (fail loudly), never a skip.

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
  NON_OBJECT_RECEIVER_CODE,
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
  file: "b0393.theta",
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
  const source: ThetaSource = { path: "b0393.theta", bytes: new TextEncoder().encode(FM + src) };
  return parseThetaDocument(source, parseDeps());
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. Every
 * fixture this drives is parse-clean at HEAD BECAUSE its method-call receiver
 * is a WITHHELD `fn` param (statically unresolvable), so `checkMethodCall`
 * defers to the runtime safety net — the deferred RUNTIME path this report
 * measures, never a parse gap. A rejection here is a harness precondition
 * breach, never a silent skip.
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
// out of `executeBody` uncaught (the framing that reclassifies it lives one
// layer up, theta-composition-producer.ts), so both dispositions — the HEAD
// success value and the post-fix throw — are observable here.
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
    slashName: "b0393",
    sourcePath: "/proj/b0393.theta",
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
 * Assert a control (value) row: the body succeeded and its final value equals
 * `expected`. When the runtime threw instead, the first `expect` reds cleanly
 * naming the throw, rather than letting an uncaught throw escape the test.
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
    `${what}: the control value (byte-identical guard — the dispatcher's string/array/object arms are untouched)`,
  ).toEqual(expected);
}

/**
 * Assert a method-call receiver-kind FLIP row: post-fix the dispatcher throws a
 * `NonObjectReceiverError` (NOT a `ThetaPanic`) that routes through
 * `surfaceUnexpectedThrow` to the REGISTERED `theta/runtime/non-object-receiver`
 * code with the BARE receiver-kind message (no `internal error: ` prefix).
 * `leakDescription` names the silent `null` the current tree fabricates
 * instead; the first `expect` reds NAMING it (HEAD's `success value null`), so
 * the run shows the defect rather than a bare assertion count.
 */
function assertNonObjectReceiver(
  probe: Probe,
  expectedMessage: string,
  leakDescription: string,
  what: string,
): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a method call on a receiver kind carrying no stdlib surface must throw the registered non-object-receiver rejection, not fabricate a value (${leakDescription})`,
    ).toBe("runtime loud throw");
    return;
  }
  expect(
    isThetaPanic(probe.thrown),
    `${what}: the rejection is a NonObjectReceiverError (plain Error), NOT a ThetaPanic (the six-source panic list is closed). Thrown: ${String(probe.thrown)}`,
  ).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(probe.thrown, SITE);
  expect(
    diagnostic,
    `${what}: surfaceUnexpectedThrow returns a Diagnostic for the non-object-receiver throw`,
  ).toBeDefined();
  const diag = diagnostic as Diagnostic;
  expect(
    diag.code,
    `${what}: the rejection carries the REGISTERED non-object-receiver code (not internal-error) — symmetrical with the index arm`,
  ).toBe(NON_OBJECT_RECEIVER_CODE);
  expect(
    diag.message,
    `${what}: the bare registered receiver-kind template (no "internal error: " prefix)`,
  ).toBe(expectedMessage);
}

// ===========================================================================
// EXECUTOR FLIPS — B1–B4, F6. A method call on a laundered
// `number`/`boolean`/`null` receiver must reject with the registered
// non-object-receiver code. RED at HEAD: the terminal `return null`
// (statement-executor.ts:1367, pre-fix `return null`) fabricates the inert
// `null` with no diagnostic.
// ===========================================================================

describe("bug 0393 B1–B4, F6 — a stdlib method call on a laundered primitive/null receiver throws the registered rejection (executor)", () => {
  const flipRows: ReadonlyArray<readonly [string, string, string, string]> = [
    [
      "B1",
      "fn f(x) { x.toUpperCase() }\nf(5)",
      "non-object receiver: cannot read .toUpperCase() on a number",
      "at HEAD value null (.toUpperCase() on the number 5 fabricated the inert null)",
    ],
    [
      "B2",
      "fn f(x) { x.trim() }\nf(true)",
      "non-object receiver: cannot read .trim() on a boolean",
      "at HEAD value null (.trim() on the boolean true fabricated the inert null)",
    ],
    [
      "B3",
      "fn f(x) { x.keys() }\nf(null)",
      "non-object receiver: cannot read .keys() on null",
      "at HEAD value null (.keys() on null fabricated the inert null — indistinguishable from an authored null)",
    ],
    [
      "B4",
      'fn f(x) { x.join(",") }\nf(5)',
      "non-object receiver: cannot read .join() on a number",
      "at HEAD value null (.join(\",\") on the number 5 fabricated the inert null; the arg was evaluated first)",
    ],
    [
      "F6",
      'fn f(x, a) { x.startsWith(a) }\nf(null, "n")',
      "non-object receiver: cannot read .startsWith() on null",
      "at HEAD value null (a boolean-returning member on null fabricated the inert null)",
    ],
  ];
  for (const [id, src, message, leak] of flipRows) {
    it(`RED (${id}): rejects non-object-receiver (${leak})`, async () => {
      assertNonObjectReceiver(await probeSource(src), message, leak, id);
    });
  }
});

// ===========================================================================
// EXECUTOR CONTROLS — S-ok / A-ok / O-ok. A string, array, and object receiver
// the dispatcher still serves through `evaluateStringMember` /
// `evaluateArrayMember` / `evaluateObjectMember`. Byte-identical: GREEN at HEAD
// and after. A red here means the harness (or the fix's receiver classing) is
// wrong, not the tree — STOP and report.
// ===========================================================================

describe("bug 0393 controls — string/array/object receivers are byte-identical (dispatcher arms untouched)", () => {
  it('CONTROL (S-ok): `x.toUpperCase()` / f("ab") value "AB"', async () => {
    assertValue(await probeSource('fn f(x) { x.toUpperCase() }\nf("ab")'), "AB", "S-ok");
  });

  it('CONTROL (A-ok): `x.join(",")` / f(["a", "b"]) value "a,b"', async () => {
    assertValue(await probeSource('fn f(x) { x.join(",") }\nf(["a", "b"])'), "a,b", "A-ok");
  });

  // A single-field schema instance's `keys()` is the field names in schema
  // declaration order (expressions.md:118), so P { a: 1 } → ["a"].
  it("CONTROL (O-ok): `x.keys()` / f(P { a: 1 }) value [\"a\"]", async () => {
    assertValue(
      await probeSource("schema P {\n  a: integer\n}\nfn f(x) { x.keys() }\nf(P { a: 1 })"),
      ["a"],
      "O-ok",
    );
  });
});

// ===========================================================================
// PURE-HOST harness (b0369 shape, verbatim) — proves the SECOND host,
// `evaluateStdlibMethod` (production-theta-producer.ts). INTERPOLATION drive
// (instant-settle session double): captures every prompt text handed to
// `pi.sendUserMessage`. A render throw (the post-fix rejection) escapes
// `executeBody` before the send, so it is caught here and the sent-text log is
// empty; at HEAD the fabricated `null` renders as the text "null" and is sent.
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
    slashName: "b0393",
    sourcePath: "/proj/b0393.theta",
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
 * Shared pure-host framing assertion: a caught throw must be the dispatcher's
 * `NonObjectReceiverError` (NOT a `ThetaPanic`) that `surfaceUnexpectedThrow`
 * frames to the REGISTERED NON_OBJECT_RECEIVER_CODE with the bare receiver-kind
 * message.
 */
function assertFramesToNonObjectReceiver(thrown: unknown, expectedMessage: string, what: string): void {
  expect(
    isThetaPanic(thrown),
    `${what}: the rejection is a NonObjectReceiverError (plain Error), NOT a ThetaPanic; thrown: ${String(thrown)}`,
  ).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(thrown, SITE);
  expect(diagnostic, `${what}: surfaceUnexpectedThrow returns a Diagnostic for the rejection`).toBeDefined();
  const diag = diagnostic as Diagnostic;
  expect(
    diag.code,
    `${what}: the rejection carries the REGISTERED non-object-receiver code (not internal-error)`,
  ).toBe(NON_OBJECT_RECEIVER_CODE);
  expect(
    diag.message,
    `${what}: the bare registered receiver-kind template (no "internal error: " prefix)`,
  ).toBe(expectedMessage);
}

// ===========================================================================
// PURE-HOST FLIPS — PB1, PB3. A method call on a laundered `number`/`null`
// receiver in interpolation position must abort at render (before the send).
// RED at HEAD: the fabricated `null` renders as the text "null", "v=null" is
// handed to sendUserMessage, and the query text carries the silent value.
// ===========================================================================

describe("bug 0393 PB1 / PB3 — a laundered-receiver method call in interpolation position rejects before send (pure host)", () => {
  const flipRows: ReadonlyArray<readonly [string, string, string]> = [
    [
      "PB1",
      "fn f(x) { @`v=${x.toUpperCase()}` }\nf(5)",
      "non-object receiver: cannot read .toUpperCase() on a number",
    ],
    [
      "PB3",
      "fn f(x) { @`v=${x.keys()}` }\nf(null)",
      "non-object receiver: cannot read .keys() on null",
    ],
  ];
  for (const [id, src, message] of flipRows) {
    it(`RED (${id}): rejects before send (HEAD sends ["v=null"])`, async () => {
      const probe = await driveInterp(src);
      if (probe.kind === "rendered") {
        // RED-for-right-reason: the method call fabricated `null`, it rendered
        // as the text "null", and "v=null" was handed to sendUserMessage — the
        // silent value reached the query text.
        expect(
          `${probe.outcome}; sent=${JSON.stringify(probe.sent)}`,
          `${id}: the laundered-receiver method call must abort at render (before send), not fabricate null and send`,
        ).toBe('threw; sent=[]');
        return;
      }
      assertFramesToNonObjectReceiver(probe.thrown, message, id);
      expect(probe.sent, `${id}: the rejection throws at render, so nothing is handed to sendUserMessage`).toEqual([]);
    });
  }
});

// ===========================================================================
// PURE-HOST CONTROL — PS-ok. A string receiver the pure host still serves.
// Byte-identical: GREEN at HEAD and after. A red here means the harness (or the
// fix's receiver classing) is wrong — STOP and report.
// ===========================================================================

describe("bug 0393 PS-ok — a string receiver in interpolation position is byte-identical", () => {
  it('CONTROL (PS-ok): `@`v=${x.toUpperCase()}`` / f("ab") sends ["v=AB"]', async () => {
    const probe = await driveInterp('fn f(x) { @`v=${x.toUpperCase()}` }\nf("ab")');
    if (probe.kind === "threw") {
      expect(
        `threw ${String(probe.thrown)}`,
        "PS-ok: a string receiver must render its uppercased member, not throw",
      ).toBe('sent=["v=AB"]');
      return;
    }
    expect(probe.outcome, "PS-ok: the body must succeed").toBe("success");
    expect(probe.sent, 'PS-ok: `"ab".toUpperCase()` renders "AB" byte-identically').toEqual(["v=AB"]);
  });
});
