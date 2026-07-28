import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import {
  isResultValue,
  isWireLowerable,
  makeErr,
  makeOk,
  valuesEqual,
  type ThetaValue,
} from "../src/runtime/value";
import { evaluateQuestion } from "../src/runtime/runtime-panics";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";

// Bug 0017 — a user object carrying a boolean `ok` field is misclassified as a
// `Result` runtime value; typed-query payloads and callee final values are
// silently corrupted
// (docs/bugs/0017-ok-field-object-misclassified-as-result.md).
//
// Spec: docs/reference/type-system.md (Result row) — `Result<T, E>` is
// "internally tagged `Ok`/`Err` with payload; observed only via constructors,
// `match`, `?`; never lowered to a schema … never crosses the wire".
// "Internally tagged" + "observed only via constructors" jointly require the
// discriminator to be interpreter-PRIVATE: user data must not be able to forge
// a `Result`, exactly as the enum representation already guarantees with its
// non-enumerable `__thetaEnum` tag (docs/spec_topics/runtime-value-model.md,
// value-representation table; src/runtime/value.ts header).
//
// The defect (0.26.0): `makeOk`/`makeErr` (src/runtime/value.ts:184/189) build
// bare enumerable `{ ok: true, value }` / `{ ok: false, error }` objects, and
// `isResultValue` (value.ts:173) recognises a `Result` by DUCK-TYPING — any
// non-array, non-enum object whose `ok` property is a boolean. Consequences at
// every caller:
//   (a) `isResultValue` classifies plain user/model data `{ ok: boolean, … }`
//       as a `Result`;
//   (b) `asResultValue` (src/runtime/statement-executor.ts:1025, the CONV-6
//       implicit-`Ok` wrap) passes such data through UNWRAPPED, so `?` /
//       `match Ok(v)` unwrap its nonexistent `.value` → the binding is
//       `undefined`/`null` and member access aborts with `null member access`;
//   (c) `surfaceCalleeFinalValue`
//       (src/extension/production-theta-producer.ts:3308, the FN-3/FN-5 wrap)
//       surfaces a callee's `{ ok: false, … }` USER DATA to the invoke parent
//       as an `Err` with an undefined payload, and `{ ok: true, … }` loses its
//       content the same way as (b);
//   (d) `valuesEqual` (value.ts:216) routes ok-carrying user objects to the
//       Result arm, comparing phantom `.value`/`.error` members (both
//       `undefined`) instead of the real key set — structurally DIFFERENT
//       objects compare equal;
//   (e) `isWireLowerable` (value.ts:284) deems ok-carrying user data not
//       lowerable.
//
// FIXED CONTRACT pinned by this file (RED now, GREEN after the fix): only
// values built by `makeOk`/`makeErr` classify as `Result` (interpreter-private
// tag, mirroring the enum representation); user data shaped `{ ok: boolean, …
// }` behaves as a plain object at every normalisation boundary. CONTROLS pin
// that genuine constructor-built Results keep their semantics (green now,
// green after).
//
// PROBED CURRENT SIGNATURES (b1262d46, all offline and deterministic):
//   - fn-tail `let r = f()?`, tail `r`      → outcome success, value null
//   - fn-tail, tail `r.label`               → throws NullMemberAccessPanic:
//                                             "null member access: .label"
//                                             (the report's live signature)
//   - fn-tail `{ok:false,…}` data + `?`     → outcome fail (forged Err, err
//                                             payload undefined)
//   - match Ok(v) over `{ok:true,…}` data   → v bound null
//   - invoke callee final `{ok:false,…}`    → parent outcome fail
//   - invoke callee final `{ok:true,…}`     → parent success, value null
//
// HARNESS NOTES:
//   - The report's exact fn-tail repro uses a BARE object literal
//     (`{ ok: true, label: "x" }`) in fn-tail position, which trips the
//     unrelated `theta/parse/bare-object-literal` parse rejection (probed).
//     The schema-named ctor form (`Out { ok: true, label: "x" }`) parses clean
//     and evaluates to the identical plain runtime object, so the (b) fixtures
//     use it — same `asResultValue` site, same corruption.
//   - The typed-`@`-query bind (the live discovery site, QRY-22) needs a live
//     model, so it is not reproduced here; the fn-tail form is the report's
//     own offline equivalent through the same CONV-6 wrap. The live-suite
//     typed-query reds (H8a / H9a area (c)) remain the live witnesses.
//   - `surfaceCalleeFinalValue` is module-private; its smallest offline reach
//     is the prompt→prompt invoke attach path:
//     `createProductionProducerDeps({ parseCallee })` → `bindPromptConversation`
//     → `executeBody` over a caller invoking a prompt-mode `.theta` callee
//     (`runPromptSuspendInvoke` → `surfaceCalleeFinalValue`) — the Gap-2
//     pattern from tests/production-core-exec.test.ts. The `pi` stub carries
//     `getActiveTools`/`setActiveTools` for the PIC-17 snapshot/restore window.

// ===========================================================================
// Shared harness — parse a real source, drive it through the production
// prompt-mode binding (parseThetaDocument → createProductionProducerDeps →
// bindPromptConversation → executeBody).
// ===========================================================================

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

/**
 * Parse a fixture source and fail LOUDLY on any error-severity diagnostic —
 * a fixture that stops parsing must never let a bug test pass or fail for the
 * wrong reason (no silent skip).
 */
function parseTheta(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture ${path} failed to parse: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

interface ProducerOpts {
  readonly parseCallee?: (
    callerPath: string | undefined,
    calleePath: string,
  ) => Promise<ThetaCompositionInput | undefined>;
}

function producer(opts: ProducerOpts = {}) {
  return createProductionProducerDeps({
    // `getActiveTools`/`setActiveTools` satisfy the PIC-17 prompt→prompt
    // suspend window (`runPromptSuspendInvoke`); `sendMessage` satisfies the
    // theta-system-note channel.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    ...(opts.parseCallee !== undefined ? { parseCallee: opts.parseCallee } : {}),
  });
}

function bindAndExecute(
  deps: ReturnType<typeof producer>,
  theta: ThetaCompositionInput,
): Promise<BodyExecution> {
  const bindInput: ConversationBindInput = { theta, args: "", ctx: ctxDouble() };
  const binding = deps.bindPromptConversation(bindInput);
  return executeBody(theta.body, binding.executeDeps);
}

const FM = "---\nmode: prompt\n---\n";

/** Parse + run a self-contained prompt-mode source through the production binding. */
function runSource(src: string): Promise<BodyExecution> {
  const doc = parseTheta("bug0017.theta", src);
  const theta: ThetaCompositionInput = {
    slashName: "bug0017",
    sourcePath: "/theta/bug0017.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  return bindAndExecute(producer(), theta);
}

// ===========================================================================
// (a) unit — isResultValue must not classify user data by shape.
// ===========================================================================

describe("bug 0017 (a) — isResultValue classifies by interpreter-private identity, not shape", () => {
  it("RED (a1): a user object with a boolean `ok` field is NOT a Result — { ok: true, label }", () => {
    expect(
      isResultValue({ ok: true, label: "x" }),
      "PRIMARY (bug 0017): plain user data shaped { ok: boolean, … } must not classify as a Result",
    ).toBe(false);
  });

  it("RED (a2): a user object with `ok: false` is NOT a Result — { ok: false, reason }", () => {
    expect(
      isResultValue({ ok: false, reason: "y" }),
      "an { ok: false, … } user object must not classify as (and later masquerade as) an Err",
    ).toBe(false);
  });

  it("RED (a3): a FORGED bare { ok: true, value: 1 } literal is NOT a Result (constructor-only identity)", () => {
    // The spec's "observed only via constructors" requires the brand to be
    // unforgeable — even an exact { ok, value } key set built outside
    // makeOk/makeErr is plausible user data, not a Result.
    expect(
      isResultValue({ ok: true, value: 1 }),
      "a Result-shaped literal built without makeOk/makeErr must not classify as a Result",
    ).toBe(false);
  });

  it("CONTROL (a4): constructor-built values classify; unrelated values do not (green now, green after)", () => {
    expect(isResultValue(makeOk(5)), "makeOk builds a genuine Result").toBe(true);
    expect(isResultValue(makeErr("e")), "makeErr builds a genuine Result").toBe(true);
    expect(isResultValue({ status: "ok" }), "an object without an `ok` boolean stays plain").toBe(
      false,
    );
    expect(isResultValue({ ok: "yes" }), "a non-boolean `ok` field stays plain").toBe(false);
    expect(isResultValue([true]), "an array is never a Result").toBe(false);
    expect(isResultValue(true), "a primitive is never a Result").toBe(false);
    expect(isResultValue(null), "null is never a Result").toBe(false);
  });

  it("RED (a5): an ENUMERABLE own `__thetaResult` key does NOT classify — the brand is the non-enumerable descriptor, not the name", () => {
    // JSON.parse produces only enumerable own properties, and such a payload
    // can still reach the runtime — through a permissive `{}` schema lowering
    // (forward/self/unresolved refs) or unvalidated ingress (code-tool return
    // payloads, untyped invoke-envelope values) — so classification itself
    // must reject the published tag name as a forgery handle.
    const wireForged = JSON.parse('{"__thetaResult":true,"ok":false,"error":"x"}') as ThetaValue;
    expect(
      isResultValue(wireForged),
      "PRIMARY: a JSON-parsed payload naming the tag must not forge an Err",
    ).toBe(false);

    expect(
      isResultValue({ __thetaResult: true, ok: false, error: "x" }),
      "an object literal naming the tag carries it as enumerable user data, not a brand",
    ).toBe(false);
  });
});

// ===========================================================================
// (b) executor — the CONV-6 implicit-Ok wrap (asResultValue) + `?` / `match`
// must preserve ok-carrying payloads. Reached through the production binding
// exactly as the bug report's offline fn-tail reproduction.
// ===========================================================================

describe("bug 0017 (b) — `?` / `match` over a user fn returning { ok: boolean, … } data (production executor)", () => {
  // The report's Reproduction §"Offline, through the production executor
  // (fn-tail form)", schema-named ctor variant (see HARNESS NOTES).
  const OK_LABEL_FN =
    FM +
    "schema Out { ok: boolean, label: string }\n" +
    "fn f(): Out {\n" +
    '  Out { ok: true, label: "x" }\n' +
    "}\n";

  it("RED (b1): `let r = f()?` binds the FULL { ok: true, label: \"x\" } object, not undefined/null", async () => {
    const execution = await runSource(OK_LABEL_FN + "let r = f()?\nr");

    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(
      execution.result.value,
      "PRIMARY (bug 0017): CONV-6 must wrap the ok-carrying payload in a genuine Ok, and `?` must unwrap it back to the object (currently: null — the payload is gone)",
    ).toEqual({ ok: true, label: "x" });
  });

  it("RED (b2): member access `r.label` after `let r = f()?` yields \"x\" (currently: NullMemberAccessPanic `null member access: .label`)", async () => {
    // Current tree: this await REJECTS with the report's exact live signature.
    const execution = await runSource(OK_LABEL_FN + "let r = f()?\nr.label");

    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(execution.result.value, "r.label reads the validated payload's field").toBe("x");
  });

  it("RED (b3): `{ ok: false, … }` USER DATA through `?` binds as the object — not a forged Err propagation", async () => {
    const execution = await runSource(
      FM +
        "schema Res { ok: boolean, reason: string }\n" +
        "fn f(): Res {\n" +
        '  Res { ok: false, reason: "data" }\n' +
        "}\n" +
        "let r = f()?\nr",
    );

    expect(
      execution.outcome,
      "PRIMARY (bug 0017): ok:false user data is DATA — `?` must not treat it as an Err and fail the body (currently: outcome fail with an undefined err payload)",
    ).toBe("success");
    expect(execution.result.value).toEqual({ ok: false, reason: "data" });
  });

  it("RED (b4): `match f() { Ok(v) => v, … }` binds v to the FULL object (CONV-6 wraps, Ok arm unwraps)", async () => {
    const execution = await runSource(
      OK_LABEL_FN + 'let r = match f() { Ok(v) => v, Err(e) => "was-err" }\nr',
    );

    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(
      execution.result.value,
      "the Ok(v) arm must bind the wrapped payload, not the phantom .value (currently: null)",
    ).toEqual({ ok: true, label: "x" });
  });

  it("CONTROL (b5): a plain-string fn tail still wraps Ok and `?` unwraps it (green now, green after)", async () => {
    const execution = await runSource(FM + 'fn g() { "hello" }\nlet r = g()?\nr');

    expect(execution.outcome).toBe("success");
    expect(execution.result.value).toBe("hello");
  });

  it("CONTROL (b6): a genuine constructor-built `Err(\"boom\")` tail still propagates through `?` (green now, green after)", async () => {
    const execution = await runSource(FM + 'fn h() { Err("boom") }\nlet r = h()?\nr');

    expect(execution.outcome, "a real Err propagates — the body fails").toBe("fail");
    expect(execution.error, "the propagated payload is the constructor's error").toBe("boom");
  });

  it("RED (b7): `match` over `{ ok: false, … }` USER DATA takes the Ok(v) arm with the full object — not the Err arm", async () => {
    const execution = await runSource(
      FM +
        "schema Res { ok: boolean, reason: string }\n" +
        "fn f(): Res {\n" +
        '  Res { ok: false, reason: "data" }\n' +
        "}\n" +
        'let r = match f() { Ok(v) => v, Err(e) => "was-err" }\nr',
    );

    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(
      execution.result.value,
      "CONV-6 wraps ok:false user data in a genuine Ok — the Err arm must not fire on data",
    ).toEqual({ ok: false, reason: "data" });
  });
});

// ===========================================================================
// (c) invoke — surfaceCalleeFinalValue (FN-3/FN-5) must not route a callee's
// ok-carrying user data as the boundary Result. Module-private; reached via
// the prompt→prompt invoke attach path (see HARNESS NOTES).
// ===========================================================================

describe("bug 0017 (c) — a callee final value carrying `ok: boolean` crosses the invoke boundary as data", () => {
  function calleeReturning(calleeSrc: string): ThetaCompositionInput {
    const doc = parseTheta("callee.theta", calleeSrc);
    return {
      slashName: "callee",
      sourcePath: "/theta/callee.theta",
      frontmatter: doc.frontmatter as ParsedFrontmatter,
      body: doc.body,
    };
  }

  /**
   * Drive `let r = callee()? … r` in a prompt-mode caller whose frozen
   * callable set names a prompt-mode `.theta` callee served by `parseCallee`
   * (the tests/production-core-exec.test.ts Gap-2 pattern) — the offline path
   * to `surfaceCalleeFinalValue` via `runPromptSuspendInvoke`.
   */
  async function runInvoke(calleeSrc: string): Promise<BodyExecution> {
    const callee = calleeReturning(calleeSrc);
    const deps = producer({
      parseCallee: (_caller, _path) => Promise.resolve(callee),
    });
    const callerDoc = parseTheta(
      "caller.theta",
      "---\nmode: prompt\ntools:\n  - ./callee.theta\n---\nlet r = callee()?\nr",
    );
    const entries = new Map([
      [
        "callee",
        { kind: "theta" as const, mode: "prompt" as const, calleePath: "./callee.theta", callee: undefined },
      ],
    ]);
    const theta = {
      slashName: "caller",
      sourcePath: "/theta/caller.theta",
      frontmatter: callerDoc.frontmatter as ParsedFrontmatter,
      body: callerDoc.body,
      callableSet: { entries },
    } as unknown as ThetaCompositionInput;
    return bindAndExecute(deps, theta);
  }

  it("RED (c1): a callee final value of { ok: false, reason: \"data\" } USER DATA surfaces as Ok(data), NOT as Err", async () => {
    const execution = await runInvoke(
      FM + "schema Res { ok: boolean, reason: string }\n" + 'Res { ok: false, reason: "data" }',
    );

    expect(
      execution.outcome,
      "PRIMARY (bug 0017): surfaceCalleeFinalValue must wrap the callee's ok:false user data in Ok — the parent's `?` must not receive a forged Err (currently: outcome fail, err payload undefined)",
    ).toBe("success");
    expect(execution.result.value, "the parent binds the callee's data verbatim").toEqual({
      ok: false,
      reason: "data",
    });
  });

  it("RED (c2): a callee final value of { ok: true, label: \"x\" } keeps its content across the boundary", async () => {
    const execution = await runInvoke(
      FM + "schema Out { ok: boolean, label: string }\n" + 'Out { ok: true, label: "x" }',
    );

    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(
      execution.result.value,
      "the parent binds the full object, not the phantom .value (currently: null)",
    ).toEqual({ ok: true, label: "x" });
  });

  it("CONTROL (c3): a plain-string callee final value still crosses as Ok(text) (green now, green after)", async () => {
    const execution = await runInvoke(FM + '"plain"');

    expect(execution.outcome).toBe("success");
    expect(execution.result.value).toBe("plain");
  });
});

// ===========================================================================
// (d) unit — valuesEqual must compare ok-carrying user objects as plain
// objects (key set + per-key value), not via the Result arm's phantom
// .value/.error members.
// ===========================================================================

describe("bug 0017 (d) — valuesEqual routes ok-carrying user objects to the OBJECT arm", () => {
  it("RED (d1): { ok: true, label: \"x\" } == { ok: true, label: \"y\" } is FALSE (labels differ)", () => {
    expect(
      valuesEqual({ ok: true, label: "x" }, { ok: true, label: "y" }),
      "PRIMARY (bug 0017): the Result arm compares phantom .value members (undefined == undefined) and ignores the real fields — structurally different objects currently compare equal",
    ).toBe(false);
  });

  it("RED (d2): { ok: true } == { ok: true, label: \"x\" } is FALSE (key sets differ)", () => {
    expect(
      valuesEqual({ ok: true }, { ok: true, label: "x" }),
      "object equality compares the theta-side key set; the Result arm hides the extra key",
    ).toBe(false);
  });

  it("RED (d3): { ok: false, reason: \"x\" } == { ok: false, reason: \"y\" } is FALSE (Err-arm phantom .error)", () => {
    expect(
      valuesEqual({ ok: false, reason: "x" }, { ok: false, reason: "y" }),
      "the Err arm compares phantom .error members (undefined == undefined) and ignores the real fields",
    ).toBe(false);
  });

  it("CONTROL (d4): structurally IDENTICAL ok-carrying objects compare equal (green now, green after)", () => {
    // Right answer today via the wrong (Result) arm; must stay true once the
    // pair routes through genuine per-key object comparison.
    expect(valuesEqual({ ok: true, label: "x" }, { ok: true, label: "x" })).toBe(true);
  });

  it("CONTROL (d5): genuine constructor-built Results keep Result equality semantics (green now, green after)", () => {
    expect(valuesEqual(makeOk(1), makeOk(1)), "same discriminator, equal payload").toBe(true);
    expect(valuesEqual(makeOk(1), makeOk(2)), "same discriminator, differing payload").toBe(false);
    expect(valuesEqual(makeOk(1), makeErr(1)), "differing discriminator").toBe(false);
    expect(
      valuesEqual({ ok: true, label: "x" } as ThetaValue, makeOk({ label: "x" })),
      "a user object never equals a genuine Result (cross-type)",
    ).toBe(false);
  });
});

// ===========================================================================
// (e) unit — isWireLowerable: ok-carrying user data (all-JSON contents) HAS a
// wire form; only genuine Results never cross the wire.
// ===========================================================================

describe("bug 0017 (e) — isWireLowerable treats ok-carrying user data as lowerable", () => {
  it("RED (e1): { ok: true, label: \"x\" } is wire-lowerable (plain JSON object)", () => {
    expect(
      isWireLowerable({ ok: true, label: "x" }),
      "PRIMARY (bug 0017): a plain user object with all-JSON contents must be lowerable — only genuine Results are barred from the wire",
    ).toBe(true);
  });

  it("RED (e2): { ok: false, reason: \"y\" } is wire-lowerable", () => {
    expect(isWireLowerable({ ok: false, reason: "y" })).toBe(true);
  });

  it("CONTROL (e3): genuine Results are never lowerable; unrelated objects are (green now, green after)", () => {
    expect(isWireLowerable(makeOk(1)), "a genuine Ok never crosses the wire").toBe(false);
    expect(isWireLowerable(makeErr("e")), "a genuine Err never crosses the wire").toBe(false);
    expect(isWireLowerable({ status: "ok" }), "an ordinary object is lowerable").toBe(true);
    expect(isWireLowerable("text"), "a primitive is lowerable").toBe(true);
  });
});

// ===========================================================================
// (f) controls — genuine makeOk/makeErr values keep their `?` semantics at the
// unit level (evaluateQuestion). Green now, green after.
// ===========================================================================

describe("bug 0017 (f) — controls: constructor-built Results unwrap correctly", () => {
  it("CONTROL (f1): evaluateQuestion over makeOk(5) yields the payload 5", () => {
    expect(evaluateQuestion(() => makeOk(5))).toEqual({ kind: "value", value: 5 });
  });

  it("CONTROL (f2): evaluateQuestion over makeErr(\"boom\") propagates the error payload", () => {
    expect(evaluateQuestion(() => makeErr("boom"))).toEqual({ kind: "propagate", err: "boom" });
  });
});
