// Bug 0366 — `array.join` on a laundered receiver (an unannotated `fn` param)
// has NO runtime element belt, so `join(",")` silently JS-coerces every
// non-string element against the spec's no-implicit-conversion rule: integers
// stringify (`f([1,2])` → "1,2"), schema-branded objects render
// "[object Object]", `null` elements render "" (so `f([null,null])` → ","),
// nested arrays flatten ("1,2,3"), and boxed-`String` enum carriers coerce to
// their wire text — where the byte-identical DIRECT spelling is parse-refused
// `theta/parse/non-string-array-join`. The disposition of one spec-refused
// program therefore depends on whether the receiver flowed through an
// unannotated parameter rather than on the program's meaning.
// (docs/bugs/0366-join-element-precondition-no-runtime-belt.md)
//
// TWO unbelted sinks, both measured here (both share the `evaluateArrayMember`
// dispatcher, src/runtime/stdlib-array.ts):
//   - EXECUTOR: `evaluateArrayMember`'s `join` arm
//     (src/runtime/stdlib-array.ts:101-106 — the element walk guarding
//     `return receiver.join(args[0] as string)`). At HEAD before bug 0366 the
//     comment above it trusted a parse-time `checkArrayJoin` guarantee that
//     bug 0127 made hold only for STATICALLY-RESOLVABLE receivers; the fix
//     corrected that comment and added the element walk this file locks. The
//     bug-0315 arity belt sits in the SAME function (stdlib-array.ts:87-89) and checks
//     arity ONLY (stdlib-string.ts:65-66: "the belt does not consult `params`
//     — arity is its only concern"), so no element-kind belt exists.
//   - PURE HOST: the same dispatcher serves `${…}` interpolations and
//     invoke/`.theta`-callable arguments (production-theta-producer.ts's
//     `evaluateStdlibMethod`), so both paths coerce identically.
//
// SETTLED FIX (this file pins the §Fix contract, not HEAD's): before calling
// host `join`, walk the receiver and throw a plain `Error` (NOT a `ThetaPanic`)
// — `StdlibJoinElementDefectError` or a widened `StdlibMethodArgumentDefectError`
// sibling — when any element is not a JS `typeof "string"`. Enum values are
// boxed `String` carriers (`typeof "object"`, src/runtime/value.ts:135-143), so
// they are refused too rather than admitting the carrier's wire text (the
// recorded §Fix disposition). The throw propagates uncaught out of
// `executeBody` and routes through `surfaceUnexpectedThrow`
// (src/runtime/runtime-panics.ts) to `INTERNAL_ERROR_CODE`
// (`theta/runtime/internal-error`) — a LOUD FRAMED abort, not a crash and not a
// silent coerced value. B5's parse-refusal and every all-string join stay
// byte-identical. This harness drives `executeBody` directly (the sibling bug
// 0315 / bug 0368 shape), so the belt throw surfaces here as the caught throw;
// the assertions route it through the SAME `surfaceUnexpectedThrow` the
// producer's frame uses — code + `/^internal error: /` prefix + that it threw —
// never the implementer's tail wording.
//
// WITNESS TABLE (the FIXED contract; every FLIP is RED now, every CONTROL GREEN
// now and after — verified HEAD values pinned in each row):
//   EXECUTOR (probeSource → evaluateArrayMember `join` arm):
//     B1   fn f(a){a.join(",")} / f([1, 2])            FLIP  HEAD "1,2";  post-fix loud
//     B2   schema P{a:integer};fn f(a){a.join(",")} / f([P{a:1}])
//                                                       FLIP  HEAD "[object Object]"; post-fix loud
//     B3   fn f(a){a.join(",")} / f([null, null])      FLIP  HEAD ",";    post-fix loud
//     B4   fn f(a){a.join(",")} / f([[1, 2], [3]])     FLIP  HEAD "1,2,3"; post-fix loud
//     ENUM enum E{A,B};fn f(a){a.join(",")} / f([E.A, E.B])
//                                                       FLIP  HEAD "A,B";  post-fix loud
//     B5   let xs=[1, 2] / xs.join(",")     CONTROL  PARSE ["theta/parse/non-string-array-join"] ∀
//     ALLSTR fn f(a){a.join(",")} / f(["a", "b"])      CONTROL  success "a,b" (belt must NOT fire)
//     EMPTY  fn f(a){a.join(",")} / f([])              CONTROL  success ""  (no non-string element)
//     ARITY  fn f(a){a.join()}   / f(["a", "b"])       CONTROL  loud ∀ (bug 0315 arity belt, min 1)
//   PURE HOST (second sink):
//     PI      fn f(a){ @`v=${a.join(",")}` } / f([1, 2])   FLIP  HEAD renders + sends ["v=1,2"];
//                 post-fix render throws before send (sent=[])
//     PInvoke fn f(a){ invoke("./c.theta", a.join(",")) } / f([1, 2])  FLIP  HEAD binds "1,2"
//                 and reaches callee load (parseCalleeCalls===1); post-fix loud abort pre-load
//
// RED-FOR-RIGHT-REASON, per row (each `it` names the observed HEAD coercion, and
// every flip's first `expect` reds by NAMING the silent coerced value):
//   B1   red: `[1,2].join(",")` binds "1,2" (integers via String(n)), no throw.
//   B2   red: `[P{a:1}].join(",")` binds "[object Object]" (schema brand lost), no throw.
//   B3   red: `[null,null].join(",")` binds "," (each null → ""), no throw.
//   B4   red: `[[1,2],[3]].join(",")` binds "1,2,3" (nested arrays flattened), no throw.
//   ENUM red: `[E.A,E.B].join(",")` binds "A,B" (boxed-String enum carriers → wire text), no throw.
//   PI   red: the interpolation renders "v=1,2" and the query text ["v=1,2"] is
//            sent, instead of the belt throwing before the send.
//   PInvoke red: `#resolveInvoke` coerces `[1,2].join(",")` to "1,2", binds it,
//            and reaches the callee load (parseCalleeCalls===1) with no throw.
//   B5 / ALLSTR / EMPTY / ARITY CONTROL: byte-identical dispositions — green at
//            HEAD and after. If any reds, the belt over-reached into the parse
//            gate, the all-string join, the empty array, or perturbed the bug
//            0315 arity belt (ARITY).

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

/** The direct-spelling parse refusal (control B5), sourced inline (spec row). */
const NON_STRING_JOIN = "theta/parse/non-string-array-join";

/** The zero body range `surfaceUnexpectedThrow` frames a throw against. */
const SITE = {
  file: "b0366.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

// ===========================================================================
// Shared parse harness (the b0315 / b0368 shape, verbatim): parseThetaDocument →
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
  const source: ThetaSource = { path: "b0366.theta", bytes: new TextEncoder().encode(FM + src) };
  return parseThetaDocument(source, parseDeps());
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. Every
 * fixture this drives is parse-clean at HEAD BECAUSE its receiver is a WITHHELD
 * `fn` param (statically unresolvable), so `checkMethodCall`'s `join` element
 * gate DEFERS exactly as bug 0127 pinned — the class this report measures is
 * the deferred RUNTIME path, never a parse gap. A rejection here is a harness
 * precondition breach, never a silent skip. (B5 is asserted via parseOnly, so
 * it never reaches this throw-on-error gate.)
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
// EXECUTOR harness (b0315 / b0368 shape, verbatim). A raw non-panic throw
// propagates out of `executeBody` uncaught (the framing that reclassifies it
// lives one layer up, theta-composition-producer.ts), so both dispositions are
// observable here.
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
    slashName: "b0366",
    sourcePath: "/proj/b0366.theta",
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
 * Assert a runtime-loud-throw row (every executor FLIP + the ARITY coexistence
 * control): the runtime threw a plain `Error` (NOT a `ThetaPanic`) that routes
 * through `surfaceUnexpectedThrow` to the existing `internal-error` surface.
 * `leakDescription` names the silent value the current tree produces instead;
 * the first `expect` reds NAMING it, so the run shows the defect (silent
 * success) rather than a bare assertion count.
 */
function assertLoudThrow(probe: Probe, leakDescription: string, what: string): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a laundered non-string-element \`join\` receiver must throw LOUDLY (${leakDescription})`,
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
// B1–B4 + ENUM — the executor FLIP rows. Each laundered non-string-element
// `join(",")` must abort loudly at runtime. RED at HEAD: the body silently
// succeeds with the JS-coerced value named at the `it`.
// ===========================================================================

describe("bug 0366 B1–B4 + ENUM — laundered non-string-element `join` throws loudly at the executor belt", () => {
  const flipRows: ReadonlyArray<readonly [string, string, string]> = [
    ["B1", 'fn f(a) { a.join(",") }\nf([1, 2])', 'at HEAD binds "1,2" (integers JS-stringified via String(n))'],
    [
      "B2",
      'schema P { a: integer }\nfn f(a) { a.join(",") }\nf([P { a: 1 }])',
      'at HEAD binds "[object Object]" (the schema brand does not survive Object.prototype.toString)',
    ],
    ["B3", "fn f(a) { a.join(\",\") }\nf([null, null])", 'at HEAD binds "," (each null element renders "")'],
    ["B4", "fn f(a) { a.join(\",\") }\nf([[1, 2], [3]])", 'at HEAD binds "1,2,3" (nested arrays flattened by JS join)'],
    [
      "ENUM",
      'enum E { A, B }\nfn f(a) { a.join(",") }\nf([E.A, E.B])',
      'at HEAD binds "A,B" (boxed-String enum carriers coerce to wire text; §Fix refuses them — typeof "object")',
    ],
  ];
  for (const [id, src, leak] of flipRows) {
    it(`RED (${id}): throws (${leak})`, async () => {
      assertLoudThrow(await probeSource(src), leak, id);
    });
  }
});

// ===========================================================================
// B5 — CONTROL, the direct spelling. A statically-resolvable `array<integer>`
// receiver is parse-REFUSED with `theta/parse/non-string-array-join` (bug 0089's
// pinned concrete-receiver surface). Asserted via `parseOnly` (NOT the
// throw-on-error `parseTheta` gate) so the refusal is an observable, not a
// harness precondition breach. GREEN at HEAD and after — the runtime belt must
// leave the parse gate byte-identical.
// ===========================================================================

describe("bug 0366 B5 — the direct spelling stays parse-refused (byte-identical)", () => {
  it("CONTROL (B5): `let xs = [1, 2]` / `xs.join(\",\")` is refused `theta/parse/non-string-array-join`", () => {
    const doc = parseOnly('let xs = [1, 2]\nxs.join(",")');
    const codes = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
    expect(
      codes,
      `B5: the resolvable-receiver direct spelling must be parse-refused; got ${JSON.stringify(codes)}`,
    ).toContain(NON_STRING_JOIN);
  });
});

// ===========================================================================
// Value CONTROLS — ALLSTR (all-string laundered join) and EMPTY (no element).
// Byte-identical: GREEN at HEAD and after. If either reds, the belt over-reached
// into a receiver the spec ADMITS.
// ===========================================================================

describe("bug 0366 value controls — all-string and empty laundered joins are byte-identical", () => {
  const controlRows: ReadonlyArray<readonly [string, string, ThetaValue]> = [
    ["ALLSTR", 'fn f(a) { a.join(",") }\nf(["a", "b"])', "a,b"],
    ["EMPTY", 'fn f(a) { a.join(",") }\nf([])', ""],
  ];
  for (const [id, src, expected] of controlRows) {
    it(`CONTROL (${id}): admitted receiver yields ${render(expected)}`, async () => {
      assertValue(await probeSource(src), expected, id);
    });
  }
});

// ===========================================================================
// ARITY — CONTROL, the bug-0315 coexistence witness. A zero-arg `join()` on the
// same laundered receiver already throws bug 0315's `StdlibMethodArgumentDefect
// Error` (arity min 1) in the SAME dispatcher, routing to internal-error. GREEN
// at HEAD (the arity belt is untouched) and after (the element belt must coexist
// with it). If it reds, the element belt perturbed the arity belt.
// ===========================================================================

describe("bug 0366 ARITY — the bug-0315 arity belt coexists (loud now and after)", () => {
  it('CONTROL (ARITY): `fn f(a) { a.join() }` / `f(["a", "b"])` throws (bug 0315 arity belt, min 1)', async () => {
    assertLoudThrow(
      await probeSource('fn f(a) { a.join() }\nf(["a", "b"])'),
      "the 0315 arity belt already fires on 0 args; the element belt must leave it byte-identical",
      "ARITY",
    );
  });
});

// ===========================================================================
// PURE-HOST harness (b0368 shape, verbatim) — proves the SECOND sink, the shared
// dispatcher serving `evaluateStdlibMethod`. INTERPOLATION drive (instant-settle
// session double): captures every prompt text handed to `pi.sendUserMessage`. A
// render throw (the belt) escapes `executeBody` before the send, so it is caught
// here and the sent-text log is empty.
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
    slashName: "b0366",
    sourcePath: "/proj/b0366.theta",
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
    slashName: "b0366",
    sourcePath: "/proj/b0366.theta",
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
// PI — interpolation position. The receiver is a WITHHELD `fn` param, so the
// interpolation `${a.join(",")}` inside f's body DEFERS at parse and the pure
// host is the backstop. Calling `f([1, 2])` at top level dispatches the query,
// rendering the interpolation through the shared dispatcher. RED at HEAD: the
// render coerces `[1,2].join(",")` to "1,2" and the query text ["v=1,2"] is
// sent, instead of the belt throwing before the send.
// ===========================================================================

describe("bug 0366 PI — laundered `join` in interpolation position renders + sends the coerced text", () => {
  it('RED (PI): `fn f(a) { @`v=${a.join(",")}` }` / `f([1, 2])` — HEAD sends ["v=1,2"]; post-fix throws before send', async () => {
    const probe = await driveInterp('fn f(a) { @`v=${a.join(",")}` }\nf([1, 2])');
    if (probe.kind === "rendered") {
      // RED-for-right-reason: the coerced "1,2" was rendered into the prompt and
      // handed to sendUserMessage — the silent value reached the query text.
      expect(
        `${probe.outcome}; sent=${JSON.stringify(probe.sent)}`,
        "PI: the laundered `join` interpolation must abort at render (before send), not coerce and send the prompt",
      ).toBe("threw; sent=[]");
      return;
    }
    assertFramesToInternalError(probe.thrown, "PI");
    expect(
      probe.sent,
      "PI: the belt throws at render, so nothing is handed to sendUserMessage",
    ).toEqual([]);
  });
});

// ===========================================================================
// PInvoke — invoke-argument position. The receiver is a WITHHELD `fn` param
// (statically unresolvable → parse defers), so `#resolveInvoke` binds the arg at
// runtime through the shared dispatcher. RED at HEAD: `[1,2].join(",")` coerces
// to "1,2", binds, and reaches the callee load (`parseCallee` called) with no
// throw — the coerced value is on its way to the child boundary.
// ===========================================================================

describe("bug 0366 PInvoke — laundered `join` invoke arg reaches callee load carrying the coerced value", () => {
  it('RED (PInvoke): `fn f(a) { invoke("./c.theta", a.join(",")) }` / `f([1, 2])` — HEAD binds "1,2" and reaches callee load (parseCalleeCalls===1); post-fix aborts pre-load', async () => {
    const probe = await driveInvoke('fn f(a) { invoke("./c.theta", a.join(",")) }\nf([1, 2])');
    if (probe.kind === "value") {
      // RED-for-right-reason: the coerced "1,2" was bound and the invoke advanced
      // to callee load (parseCallee reached), on its way to the child boundary.
      expect(
        `value; parseCalleeCalls=${probe.parseCalleeCalls}`,
        "PInvoke: the invoking theta must abort loudly at arg binding, before any callee load or child spawn",
      ).toBe("loud framed abort; parseCalleeCalls=0");
      return;
    }
    assertFramesToInternalError(probe.thrown, "PInvoke");
    expect(
      probe.parseCalleeCalls,
      "PInvoke: the belt throws at arg binding, so the callee is never loaded and no child is spawned",
    ).toBe(0);
  });
});
