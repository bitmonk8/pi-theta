// Bug 0338 — the pure-host evaluator `evaluateBinaryExpression`
// (src/extension/production-theta-producer.ts:7109) casts both operands of the
// spelled `-`/`*`/`/`/`%` to `number` (the arms at
// production-theta-producer.ts:7138–7145: `(left as number) - (right as
// number)`, …) with NO numericity belt, so a non-numeric operand reaching a
// PURE evaluation position is JS-coerced silently. The byte-identical operand
// pairing on the EXECUTOR path throws the bug 0332 belt
// (`BinaryNonNumericError`, src/runtime/statement-executor.ts:661, thrown at
// statement-executor.ts:1092), so the disposition currently depends on the
// evaluation position, not on the operands.
// (docs/bugs/0338-pure-host-arithmetic-non-numeric-operands-no-runtime-belt.md)
//
// Two production pure positions funnel through `evaluatePureExpression`'s binary
// arm (production-theta-producer.ts:6937 → `evaluateBinaryExpression`):
//   - INTERPOLATION: `renderQueryText` (production-theta-producer.ts:6586) →
//     `stringifyInterpolation` (production-theta-producer.ts:6617) →
//     `evaluatePureExpression` (production-theta-producer.ts:6625). The rendered
//     text becomes the query prompt at the dispatch build
//     (production-theta-producer.ts:2793) and is handed to `pi.sendUserMessage`.
//     A string operand coerces to `NaN` and the QRY-18 renderer emits the
//     literal text `NaN` into the prompt (QRY-18 renders `NaN`/`Infinity` as
//     text, not `null`).
//   - INVOKE ARGUMENT: `#resolveInvoke` binds each positional arg through
//     `evaluatePureExpression` (production-theta-producer.ts:3539; the
//     `.theta`-callable twin `#resolveCallAsInvoke` at :3576) BEFORE the callee
//     is loaded or the child is spawned, so a coerced operand crosses the child
//     boundary as a plausible argument.
//
// SETTLED FIX (this file pins the §Fix contract, not HEAD's — the belt lands in
// 0.311.0, the literal placeholder the fix's version fills): belt
// `evaluateBinaryExpression`'s `-`/`*`/`/`/`%` arms to throw the same exported
// `BinaryNonNumericError` the executor belt throws, preserving the `NaN`
// carve-out (`NaN`/`Infinity` are `typeof "number"`, so `n % 0` → `NaN` and
// `n / 0` → `Infinity` over NUMERIC operands stay non-panic). A
// `BinaryNonNumericError` is a plain `Error`, NOT a `ThetaPanic`; it propagates
// uncaught out of `executeBody` and the producer's top-level runtime-defect
// surface frames it through `surfaceUnexpectedThrow`
// (src/runtime/runtime-panics.ts:525) to `INTERNAL_ERROR_CODE`
// (`theta/runtime/internal-error`, runtime-panics.ts:48) — a LOUD FRAMED abort,
// not a crash and not a silent coerced value. This harness drives `executeBody`
// directly (the sibling bug 0288 / bug 0332 shape), so the belt throw surfaces
// here as the caught throw; the assertions route it through the SAME
// `surfaceUnexpectedThrow` the producer's frame uses, asserting the FRAMED
// disposition rather than a bare uncaught throw.
//
// WITNESS TABLE (the FIXED contract; RED now unless CONTROL):
//   B1   let s = "a" / @`v=${s - 1}`   → LOUD FRAMED abort; no `NaN` prompt sent
//   Op*  let s = "a" / @`v=${s * 1}`   → LOUD FRAMED abort; no `NaN` prompt sent
//   Op/  let s = "a" / @`v=${s / 1}`   → LOUD FRAMED abort; no `NaN` prompt sent
//   Op%  let s = "a" / @`v=${s % 1}`   → LOUD FRAMED abort; no `NaN` prompt sent
//   A1   fn f(a) { invoke("./c.theta", a - 1) } / f("x")
//                                       → LOUD FRAMED abort BEFORE callee load
//                                         (no child spawn: parseCallee unreached)
//   Cn-  let n = 7 / @`v=${n - 1}`     → CONTROL: renders `v=6`      (byte-identical)
//   Cn/  let n = 7 / @`v=${n / 0}`     → CONTROL: renders `v=Infinity` (NaN carve-out)
//   Cn%  let n = 7 / @`v=${n % 0}`     → CONTROL: renders `v=NaN`      (NaN carve-out)
//   Cai  fn f(a) { invoke("./c.theta", a - 1) } / f(9)
//                                       → CONTROL: invoke proceeds to callee load
//                                         (numeric arg binds; belt does not over-fire)
//   B3   let s = "a" / let x = s - 1 / x
//                                       → CONTROL: PARSE gate
//                                         theta/parse/non-numeric-arithmetic-operands
//                                         (executor path, unchanged by this fix)
//
// RED-FOR-RIGHT-REASON, per cell (shown in the run):
//   B1/Op*/Op//Op% red: the interpolation renders the literal text `NaN` and
//                        `pi.sendUserMessage` is handed the prompt `v=NaN` with
//                        no throw on any channel (the silent-NaN symptom).
//   A1 red:              `#resolveInvoke` coerces `"x" - 1` to `NaN`, binds it,
//                        and reaches the callee load (`parseCallee` called) with
//                        no throw — the coerced value is on its way to the child.
//   Cn-/Cn//Cn%/Cai/B3 CONTROL: byte-identical guards. If any reds, the belt
//                        over-reached into numeric operands (Cn-/Cn//Cn%/Cai)
//                        or perturbed the executor-path parse gate (B3).

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
import { executeBody } from "../src/runtime/statement-executor";
import {
  isThetaPanic,
  surfaceUnexpectedThrow,
  INTERNAL_ERROR_CODE,
} from "../src/runtime/runtime-panics";
import type { ThetaValue } from "../src/runtime/value";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";

/** expressions.md §"Other arithmetic" — the parse gate 0332 shipped (executor path). */
const NON_NUMERIC_ARITHMETIC_OPERANDS_CODE = "theta/parse/non-numeric-arithmetic-operands";

const FM = "---\nmode: prompt\n---\n";

/** The zero body range `surfaceUnexpectedThrow` frames a throw against. */
const SITE = {
  file: "b0338.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

// ===========================================================================
// Shared parse harness (the b0288 / b0332 shape, verbatim): parseThetaDocument →
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
  const source: ThetaSource = { path: "b0338.theta", bytes: new TextEncoder().encode(FM + src) };
  return parseThetaDocument(source, parseDeps());
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. The interp
 * and invoke fixtures parse clean at HEAD (the gate never runs on an
 * interpolation expression, and it DEFERS on the WITHHELD `fn` param), so a
 * rejection here is a harness precondition breach, never a silent skip.
 */
function parseClean(src: string): ThetaDocument {
  const doc = parseOnly(src);
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture failed to parse clean: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

/** Error-severity parse diagnostic codes (the B3 executor-path control). */
function parseErrorCodes(src: string): string[] {
  return parseOnly(src).diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    // The prompt-mode drive's only wait primitive is `Clock.setTimeout`; fire the
    // callback synchronously so the instant-settle turn completes deterministically
    // with no real timers (the b0288 harness contract).
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

// ===========================================================================
// INTERPOLATION drive (b0288 instant-settle session double). Captures every
// prompt text handed to `pi.sendUserMessage`; the turn commits its user entry
// and a reply inside the send so the drive settles in one poll interval and the
// bare query binds a value. A render throw (the belt) escapes `executeBody`
// before the send, so it is caught here and the sent-text log is empty.
// ===========================================================================

/** The instant-settle user session: one send commits user + reply synchronously. */
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

/** One interpolation drive's disposition: the query rendered + sent, or the belt threw. */
type InterpProbe =
  | { readonly kind: "rendered"; readonly sent: readonly string[]; readonly outcome: string; readonly value: ThetaValue | undefined }
  | { readonly kind: "threw"; readonly sent: readonly string[]; readonly thrown: unknown };

async function driveInterp(src: string): Promise<InterpProbe> {
  const doc = parseClean(src);
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
    slashName: "b0338",
    sourcePath: "/proj/b0338.theta",
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
// INVOKE drive. A recording `parseCallee` is the pre-spawn seam: `#driveCallee`
// loads the callee through it BEFORE spawning the child, and it runs only after
// `#resolveInvoke` has already bound the positional args
// (production-theta-producer.ts:3539). So `parseCallee` reached ⇒ the arg
// binding produced a value and the invoke advanced to callee load; `parseCallee`
// unreached ⇒ the arg binding threw before any callee load or child spawn. No
// fileSystem/activeRoots are wired, so `#recheckCalleeContainment` is skipped
// and the seam is reachable at HEAD.
// ===========================================================================

/** One invoke drive's disposition, plus whether the pre-spawn callee-load seam was reached. */
type InvokeProbe =
  | { readonly kind: "value"; readonly parseCalleeCalls: number; readonly outcome: string }
  | { readonly kind: "threw"; readonly parseCalleeCalls: number; readonly thrown: unknown };

async function driveInvoke(src: string): Promise<InvokeProbe> {
  const doc = parseClean(src);
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
    parseCallee: (_caller: string | undefined, _path: string): Promise<ThetaCompositionInput> => {
      parseCalleeCalls += 1;
      // Returning `undefined` yields Err(load_failure) as a VALUE — enough to
      // record that the invoke reached callee load carrying the bound arg; the
      // child is never spawned, so no launcher wiring is needed.
      return Promise.resolve(undefined as unknown as ThetaCompositionInput);
    },
  });
  const ctx = {
    model: { id: "m1", provider: "anthropic" },
    signal: undefined,
  } as unknown as ExtensionCommandContext;
  const theta: ThetaCompositionInput = {
    slashName: "b0338",
    sourcePath: "/proj/b0338.theta",
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

// ===========================================================================
// Shared framing assertion: a caught throw must be the belt's plain `Error`
// (NOT a `ThetaPanic`) that `surfaceUnexpectedThrow` frames to
// INTERNAL_ERROR_CODE — the LOUD FRAMED disposition, not an unframed crash.
// ===========================================================================

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

/** No prompt text carrying `NaN` was ever handed to `pi.sendUserMessage`. */
function assertNoNaNPromptSent(sent: readonly string[], what: string): void {
  const leaked = sent.filter((text) => text.includes("NaN"));
  expect(
    leaked,
    `${what}: no rendered prompt carrying the literal text 'NaN' may reach pi.sendUserMessage`,
  ).toEqual([]);
}

// ===========================================================================
// B1 + operator coverage — a spelled `-`/`*`/`/`/`%` over a STRING operand in an
// interpolation must abort the theta LOUDLY (framed to INTERNAL_ERROR_CODE) and
// send NO `NaN` prompt. RED at HEAD: the render coerces to `NaN` and
// `pi.sendUserMessage` is handed `v=NaN` with no throw.
// ===========================================================================

describe("bug 0338 B1 + operator coverage — string-operand interpolation aborts loudly, no NaN prompt", () => {
  const interpRows: ReadonlyArray<readonly [string, string, string]> = [
    ["B1 (-)", 'let s = "a"\n@`v=${s - 1}`', 'string `-` int → NaN → prompt "v=NaN"'],
    ["Op (*)", 'let s = "a"\n@`v=${s * 1}`', 'string `*` int → NaN → prompt "v=NaN"'],
    ["Op (/)", 'let s = "a"\n@`v=${s / 1}`', 'string `/` int → NaN → prompt "v=NaN"'],
    ["Op (%)", 'let s = "a"\n@`v=${s % 1}`', 'string `%` int → NaN → prompt "v=NaN"'],
  ];
  for (const [id, src, symptom] of interpRows) {
    it(`RED (${id}): loud framed abort, no NaN prompt sent (at HEAD ${symptom})`, async () => {
      const probe = await driveInterp(src);
      if (probe.kind === "rendered") {
        // RED-for-right-reason: the silent NaN symptom. Quote the sent prompt so
        // the run reads as "a NaN prompt was rendered and sent", not an opaque miss.
        expect(
          `rendered + sent ${JSON.stringify(probe.sent)}`,
          `${id}: the interpolation must abort loudly (framed internal-error), not silently render a NaN prompt`,
        ).toBe("loud framed abort (no prompt sent)");
        return;
      }
      assertFramesToInternalError(probe.thrown, id);
      assertNoNaNPromptSent(probe.sent, id);
    });
  }
});

// ===========================================================================
// Numeric interpolation CONTROLS — byte-identical. Each renders and sends its
// exact prompt text; GREEN at HEAD and must stay GREEN. `n / 0` → Infinity and
// `n % 0` → NaN are the NaN carve-out: NUMERIC operands producing a non-finite
// number are typeof "number", so the belt must NOT fire and the QRY-18 text is
// preserved verbatim.
// ===========================================================================

describe("bug 0338 numeric interpolation controls — byte-identical prompt text (green now and after)", () => {
  const controlRows: ReadonlyArray<readonly [string, string, string]> = [
    ["Cn (-)", "let n = 7\n@`v=${n - 1}`", "v=6"],
    ["Cn (/0)", "let n = 7\n@`v=${n / 0}`", "v=Infinity"],
    ["Cn (%0)", "let n = 7\n@`v=${n % 0}`", "v=NaN"],
  ];
  for (const [id, src, expectedPrompt] of controlRows) {
    it(`CONTROL (${id}): renders and sends the prompt '${expectedPrompt}'`, async () => {
      const probe = await driveInterp(src);
      if (probe.kind === "threw") {
        expect(
          `threw ${String(probe.thrown)}`,
          `${id}: a numeric operand must render '${expectedPrompt}', not trip the belt`,
        ).toBe(`rendered + sent prompt '${expectedPrompt}'`);
        return;
      }
      expect(probe.outcome, `${id}: the settled turn binds its reply`).toBe("success");
      expect(
        probe.sent,
        `${id}: the byte-identical rendered prompt (the NaN carve-out for /0 and %0 over numeric operands)`,
      ).toEqual([expectedPrompt]);
    });
  }
});

// ===========================================================================
// A1 — an invoke argument whose operand is a WITHHELD `fn` param
// (statically unresolvable → parse gate DEFERS) must abort the INVOKING theta
// LOUDLY BEFORE the callee is loaded or the child is spawned. RED at HEAD:
// `#resolveInvoke` coerces `"x" - 1` to `NaN`, binds it, and reaches callee load
// (`parseCallee` called) with no throw.
// ===========================================================================

describe("bug 0338 A1 — withheld-param invoke arg aborts pre-spawn, no callee load", () => {
  it('RED (A1): `fn f(a) { invoke("./c.theta", a - 1) }` / `f("x")` — loud framed abort, parseCallee unreached', async () => {
    const probe = await driveInvoke('fn f(a) { invoke("./c.theta", a - 1) }\nf("x")');
    if (probe.kind === "value") {
      // RED-for-right-reason: the coerced NaN was bound and the invoke advanced
      // to callee load (parseCallee reached), on its way to the child boundary.
      expect(
        `value; parseCalleeCalls=${probe.parseCalleeCalls}`,
        "A1: the invoking theta must abort loudly at arg binding, before any callee load or child spawn",
      ).toBe("loud framed abort; parseCalleeCalls=0");
      return;
    }
    assertFramesToInternalError(probe.thrown, "A1");
    expect(
      probe.parseCalleeCalls,
      "A1: the belt throws at arg binding, so the callee is never loaded and no child is spawned",
    ).toBe(0);
  });

  it("CONTROL (A1 numeric): `f(9)` — numeric arg binds unchanged, invoke proceeds to callee load", async () => {
    // Byte-identical guard: `9 - 1` → 8 must NOT trip the belt; the invoke binds
    // the numeric arg and advances to callee load exactly as at HEAD.
    const probe = await driveInvoke('fn f(a) { invoke("./c.theta", a - 1) }\nf(9)');
    if (probe.kind === "threw") {
      expect(
        `threw ${String(probe.thrown)}`,
        "A1 numeric: a numeric invoke arg must bind unchanged, not trip the belt",
      ).toBe("value; invoke proceeded to callee load");
      return;
    }
    expect(
      probe.parseCalleeCalls,
      "A1 numeric: the numeric arg binds and the invoke reaches callee load (belt does not over-fire)",
    ).toBe(1);
  });
});

// ===========================================================================
// B3 — executor-path control. `let x = s - 1` (s = "a", statically string) is
// refused at PARSE by the gate 0332 shipped; this fix does not touch the parse
// gate or the executor path, so the code must still fire. GREEN now and after.
// ===========================================================================

describe("bug 0338 B3 — executor-path parse gate is unchanged", () => {
  it("CONTROL (B3): `let s = \"a\" / let x = s - 1 / x` reds at parse with the 0332 gate code", () => {
    expect(
      parseErrorCodes('let s = "a"\nlet x = s - 1\nx'),
      "B3: the statement-level pairing stays refused at parse (theta/parse/non-numeric-arithmetic-operands), unchanged by the pure-host belt",
    ).toContain(NON_NUMERIC_ARITHMETIC_OPERANDS_CODE);
  });
});
