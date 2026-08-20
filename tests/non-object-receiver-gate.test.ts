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
  isThetaPanic,
  surfaceUnexpectedThrow,
  INTERNAL_ERROR_CODE,
  MISSING_OBJECT_KEY_CODE,
} from "../src/runtime/runtime-panics";
import type { ThetaValue } from "../src/runtime/value";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";

// Bug 0027 — runtime receiver dispatch classifies by JS `typeof`, so an enum
// value (a boxed `String` carrier) and a `Result` value (an `{ ok, … }` object
// literal) take the OBJECT read surfaces: `s.keys()` answers `["0","1","2","3"]`,
// `r.ok` reads the discriminator outside `match` / `?`, and any other member
// aborts the theta with `theta/runtime/internal-error`
// (docs/bugs/0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md).
//
// SCOPE AGAINST BUG 0026. 0026's Symbol migration has landed, so every
// brand-key read (`s.has("__thetaEnum")`, `s["__thetaEnum"]`, `r.__thetaResult`
// — reproduction rows E1–E3 / R1–R3) is already closed and is pinned by
// tests/schema-brand-symbol-migration.test.ts. This file covers what survives
// that migration: the receiver-dispatch defect (rows E4–E13, R4–R10) and the
// unknown-member abort (E9 / E10 / R10). No probe here names a brand.
//
// Spec: docs/spec_topics/runtime-value-model.md `Result` row (`:14`) — "Theta
// code observes `Result` only through `Ok` / `Err` constructors, `match`
// patterns, and `?`; the in-memory shape is not part of the language surface"
// (restated normatively at docs/reference/type-system.md:113); enum row (`:13`)
// — an enum value "carries the variant's wire string plus an
// interpreter-private tag", admitting no field / index / membership surface.
// docs/spec_topics/expressions.md:118–120 — `keys()` / `values()` / `has(k)`
// are defined over an object value's THETA-SIDE FIELD NAMES; `:122` — "Anything
// not on this list is `theta/parse/unknown-method` rather than a runtime
// failure"; `:10` — an indexed-access receiver "must be an `array<T>` or an
// object value". runtime-value-model.md:16 ("neither is reachable from theta
// code") is cited as INTENT only: that paragraph opens "Reference encoding
// (non-normative)".
//
// FIXED CONTRACT pinned by this file (RED now, GREEN after the fix). One shared
// receiver gate ahead of the four object read entry points — `applyStdlibMethod`
// (src/runtime/statement-executor.ts:917, object arm :924), its pure-host twin
// `evaluateStdlibMethod` (src/extension/production-theta-producer.ts:5890,
// object arm :5901), `evaluateIndexAccess` (src/runtime/runtime-panics.ts:121,
// widening the existing non-object guard at :148) and `evaluateMemberAccess`
// (runtime-panics.ts:172) — rejects an enum value and a `Result` value with the
// new REGISTERED runtime-defect-surface code:
//
//   theta/runtime/non-object-receiver
//
// It is NOT a panic. The six-source panic list (error-model.md:67–72) is closed
// and stays closed, so the gate's throw is not a `ThetaPanic` subclass and
// `isThetaPanic(thrown)` is `false` — every probe asserts that. Routing is the
// `theta/runtime/internal-error` surface: `surfaceUnexpectedThrow`
// (runtime-panics.ts:327) maps the throw to a `Diagnostic` carrying the new code
// (NOT `internal-error`), the registered message, and `hint` = the stack.
//
// REGISTERED MESSAGE TEMPLATE — the row in
// docs/spec_topics/diagnostics/code-registry-runtime.md (columns at `:11`),
// which is the source of truth for both placeholders' rendering; this block
// restates it, so a drift between the two is a defect in this file:
//
//   non-object receiver: cannot read <read> on <receiver kind>
//
//   <read>          the attempted read in source shape — `.<method>()` for a
//                   stdlib method call, `[<index>]` for indexed access, and
//                   `.<field>` for member access. The index renders BARE and
//                   never quoted whatever its shape — that is the row's own
//                   rule, NOT category 5's `<key>` rule (which double-quotes a
//                   key that is not identifier-shaped).
//   <receiver kind> the closed set `an enum value` | `a Result value` |
//                   `a string` | `a number` | `a boolean`. `null` is outside
//                   that set and is NOT the gate's: `null[i]` / `null.field`
//                   raise the dedicated null-index-access / null-member-access
//                   panics, which fire ahead of the gate. A receiver outside
//                   the set that is not `null` either — a host value outside
//                   the theta value model, reaching the widened index guard —
//                   carries theta/runtime/internal-error instead (control i7).
//
// Rendered examples (asserted verbatim by group (h)):
//   non-object receiver: cannot read .keys() on an enum value
//   non-object receiver: cannot read [0] on an enum value
//   non-object receiver: cannot read .length on an enum value
//   non-object receiver: cannot read .ok on a Result value
//   non-object receiver: cannot read [0] on a number
//   non-object receiver: cannot read [0] on a boolean
//
// BOTH DIRECTIONS, per the bug's §Fix ("assert the new code fires, and assert
// the pre-fix values are gone rather than only that a rejection occurs"). Every
// RED probe carries the exact pre-fix leak value; the helper asserts the value
// is gone BEFORE asserting the rejection, so the failure output names the leak.
//
// PROBED CURRENT SIGNATURES (HEAD 1bd9361a / 0.38.0, offline, deterministic):
//   s.keys()            → outcome=success value=["0","1","2","3"]
//   s.values()          → outcome=success value=["H","i","g","h"]
//   s["0"]              → outcome=success value="H"
//   s["length"]         → outcome=success value=4
//   s.length            → outcome=success value=4
//   s.has("length")     → outcome=success value=true
//   s.__anything        → outcome=success value=undefined (bug 0032's bind)
//   s.toUpperCase()     → THREW Error: unknown object stdlib member: toUpperCase
//   s.bogus()           → THREW Error: unknown object stdlib member: bogus
//   r.keys()            → outcome=success value=["ok","value"]
//   r.values()          → outcome=success value=[true,1]
//   r["ok"] / r.ok      → outcome=success value=true
//   r.bogus()           → THREW Error: unknown object stdlib member: bogus
//   fn f(x) { x.keys() } / let t: Severity = s / let q: Result<integer, string> = r
//                       → all parse-clean, all value=["0","1","2","3"] / ["ok","value"]
//   @`payload: ${s.keys()}` → sends 'payload: ["0","1","2","3"]' to the model
//   laundered x[0] on "hi"  → THREW Error: indexed access requires an array<T>
//                             or object receiver; got string
// Each raw `Error` above classifies as `theta/runtime/internal-error` through
// `surfaceUnexpectedThrow`, which is the abort the bug's element (2) reports.
//
// HARNESS NOTES:
//   - Groups (a)–(f) and (h)–(j) reuse tests/enum-schema-tag-privacy.test.ts
//     group (e)'s production-executor harness (the comment at that file:203):
//     parseThetaDocument → createProductionProducerDeps → bindPromptConversation
//     → executeBody. Offline, provider-free, no child process. `parseTheta`
//     fails LOUDLY on any error-severity diagnostic, so a fixture that stops
//     parsing can never let a probe pass or fail for the wrong reason.
//   - TWO HOSTS implement stdlib-method dispatch and the fix must move both.
//     Groups (a)–(f) drive the EFFECTFUL executor (`applyStdlibMethod`): the
//     executor owns the `index` / `member` / `method-call` expression arms
//     (statement-executor.ts:692–745), including inside a user `fn` body.
//     Group (g) drives the PURE host (`evaluateStdlibMethod`) through the QRY-18
//     interpolation render (`stringifyInterpolation`,
//     production-theta-producer.ts:5564, whose `evaluatePureExpression` call is
//     at :5571), over the tests/enum-schema-tag-privacy.test.ts group-(d)
//     live-session double — an untyped query never dispatches `complete()`, so
//     no model and no provider is involved. The `for`-iterand route into the
//     pure host (statement-executor.ts:1308) is NOT usable: `theta/parse/non-array-iterand`
//     rejects a method-call iterand for every receiver kind, object receivers
//     included (probed: "'for' expects array<T> after 'in'; got keys").
//   - The index and member entry points live in runtime-panics.ts and are
//     SHARED by both hosts, so they need no per-host probe.
//   - Groups (i) and (j), plus (g3), are the control set — green now, green
//     after. They are in this file deliberately: an over-broad gate — one that
//     rejects strings, arrays, object values, or the `match` / `?` reads of a
//     `Result`'s own representation — reds here immediately.

// ===========================================================================
// The contract under test.
// ===========================================================================

/** The registered runtime-defect-surface code the gate carries (bug 0027 §Fix). */
const NON_OBJECT_RECEIVER_CODE = "theta/runtime/non-object-receiver";

/** `<receiver kind>` renderings from the proposed template's closed set. */
const ENUM_RECEIVER = "an enum value";
const RESULT_RECEIVER = "a Result value";
const STRING_RECEIVER = "a string";
const NUMBER_RECEIVER = "a number";
const BOOLEAN_RECEIVER = "a boolean";

/** The proposed registered message template, rendered. */
function rejectionMessage(read: string, receiverKind: string): string {
  return `non-object receiver: cannot read ${read} on ${receiverKind}`;
}

// ===========================================================================
// Shared parse + production-executor harness (the group-(e) pattern).
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

function parseOnly(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. Every probe
 * in this file is a parse-clean source by the bug's §Reproduction (the A2 layer
 * classifies an enum receiver `"unknown"` and defers, `Result` has no
 * `CompatType` form at all), so a rejection here is a harness defect — never a
 * silent skip.
 */
function parseTheta(path: string, src: string): ThetaDocument {
  const doc = parseOnly(path, src);
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

const FM = "---\nmode: prompt\n---\n";

/** The three fixture prologues: the enum carrier, the `Result`, the object control. */
const ENUM_FIXTURE = "enum Severity { Low, High }\nlet s = Severity.High\n";
const RESULT_FIXTURE = "let r = Ok(1)\n";
const OBJECT_FIXTURE = "schema F { x: integer }\nlet o = F { x: 1 }\n";

/** The site `surfaceUnexpectedThrow` frames a throw against (the ZERO body range). */
const SITE = {
  file: "bug0027.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

/**
 * One probe's disposition: the body produced a value, or the runtime threw. A
 * raw non-panic throw propagates out of `executeBody` uncaught (the framing that
 * reclassifies it lives one layer up, theta-composition-producer.ts:481), so
 * both dispositions are observable here.
 */
type Probe =
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };

/** Parse + run a self-contained query-free prompt-mode source, capturing a throw. */
async function probeSource(src: string): Promise<Probe> {
  const doc = parseTheta("bug0027.theta", FM + src);
  const theta: ThetaCompositionInput = {
    slashName: "bug0027",
    sourcePath: "/theta/bug0027.theta",
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

function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

/**
 * Assert the bug-0027 gate rejected `probe`, in BOTH directions:
 *
 *   1. the pre-fix leak value is gone (asserted first, so the failure output
 *      names the exact representation the receiver leaked);
 *   2. the runtime rejected with the registered `non-object-receiver` code,
 *      through the `internal-error` surface, and NOT as a panic.
 *
 * `leak` is omitted only where the pre-fix disposition is already a throw
 * (the unknown-member rows) or was an out-of-model `undefined` (bug 0032's
 * bind, since fixed).
 */
function assertGated(
  probe: Probe,
  expected: {
    readonly read: string;
    readonly receiverKind: string;
    readonly leak?: ThetaValue;
  },
): Diagnostic {
  const attempted = `${expected.read} on ${expected.receiverKind}`;
  if (probe.kind === "value") {
    const value = probe.execution.result.value;
    if (expected.leak !== undefined) {
      expect(
        value,
        `DIRECTION 2 (bug 0027 §Fix — "assert the pre-fix values are gone"): reading ${attempted} must not answer the receiver's reference encoding. runtime-value-model.md:16 says that encoding "may change without a spec revision"`,
      ).not.toEqual(expected.leak);
    }
    expect(
      `success, value ${render(value)}`,
      `DIRECTION 1 (bug 0027 §Fix): reading ${attempted} must be REJECTED with ${NON_OBJECT_RECEIVER_CODE}, not answered. At HEAD the typeof-based dispatch routes the receiver onto the object read surface and the read succeeds`,
    ).toBe(`rejected with ${NON_OBJECT_RECEIVER_CODE}`);
    throw new Error("unreachable: the assertion above always fails on a value disposition");
  }
  const { thrown } = probe;
  expect(
    isThetaPanic(thrown),
    `bug 0027 §Fix: the gate is a runtime-defect-surface code, NOT a panic — the six-source panic list (error-model.md:67–72) is closed and stays closed, so the throw must not be a ThetaPanic subclass. Thrown: ${String(thrown)}`,
  ).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(thrown, SITE);
  expect(
    diagnostic,
    `bug 0027 §Fix: the gate's throw routes through surfaceUnexpectedThrow (runtime-panics.ts:327), which returns undefined only for a ThetaPanic / HostFatal. Thrown: ${String(thrown)}`,
  ).toBeDefined();
  const diag = diagnostic as Diagnostic;
  expect(
    diag.code,
    `PRIMARY (bug 0027): reading ${attempted} must carry the registered ${NON_OBJECT_RECEIVER_CODE}. At HEAD the read either succeeds or throws a raw Error that the runtime-defect surface reclassifies as theta/runtime/internal-error, which aborts the theta and reports an interpreter message to the operator (expressions.md:122 — "rather than a runtime failure"). Message: ${diag.message}`,
  ).toBe(NON_OBJECT_RECEIVER_CODE);
  expect(
    diag.message,
    `bug 0027 §Fix: "a message naming the receiver kind and the attempted read" — the template is 'non-object receiver: cannot read <read> on <receiver kind>' (file header)`,
  ).toContain(expected.receiverKind);
  expect(
    diag.message,
    `bug 0027 §Fix: the message names the attempted read (${expected.read})`,
  ).toContain(expected.read);
  expect(diag.message, "the registered template's prefix").toMatch(/^non-object receiver: /);
  expect(diag.severity, "code-registry-runtime.md severity column: E").toBe("error");
  expect(
    typeof diag.hint,
    "bug 0027 §Fix: same routing as theta/runtime/internal-error — hint carries the stack for operator triage",
  ).toBe("string");
  return diag;
}

/** Assert a probe produced a value and return it (control rows). */
function valueOf(probe: Probe, what: string): ThetaValue | undefined {
  if (probe.kind === "threw") {
    throw new Error(
      `CONTROL BROKEN — ${what} must evaluate, but the runtime threw ${String(probe.thrown)}. An over-broad bug-0027 receiver gate is the first suspect`,
    );
  }
  expect(probe.execution.outcome, `${what}: the body succeeds`).toBe("success");
  return probe.execution.result.value;
}

// ===========================================================================
// Pure-host harness (group (g)) — the QRY-18 interpolation render reaches
// `evaluateStdlibMethod` (production-theta-producer.ts:5890) through
// `stringifyInterpolation` (`:5564`, its pure-host call at `:5571`). Trimmed from
// tests/enum-schema-tag-privacy.test.ts group (d): the untyped prompt-mode
// query issues ONE streamed user turn (`pi.sendUserMessage`) whose content IS
// the rendered template; the injected Clock's `setTimeout` ticks the session
// double, completing the turn with a scripted reply. No provider, no model
// dispatch — an untyped query never calls `complete()`.
// ===========================================================================

const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

class LiveSessionDouble {
  readonly entries: SessionEntryDouble[] = [];
  sendUserMessageCalls = 0;
  /** The rendered query texts — the wire-facing observable under test. */
  readonly sentQueryTexts: string[] = [];

  #idle = true;

  sendUserMessage(content: string): void {
    this.sendUserMessageCalls += 1;
    this.sentQueryTexts.push(content);
    this.#append({ role: "user", content: [{ type: "text", text: content }], timestamp: 0 });
    this.#idle = false;
  }

  isIdle(): boolean {
    return this.#idle;
  }

  /** Complete the in-flight streamed turn with the scripted reply. */
  tick(): void {
    if (this.#idle) {
      return;
    }
    this.#append({
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "m1",
      stopReason: "stop",
      timestamp: 0,
    });
    this.#idle = true;
  }

  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
}

function livePi(session: LiveSessionDouble): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    sendMessage: (): void => {},
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (): void => {},
  } as unknown as ExtensionAPI;
}

function rootLive(session: LiveSessionDouble): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        session.tick();
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}

function registryDouble(): ModelRegistry {
  return {
    getAvailable: () => [ANTHROPIC_MODEL],
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
  } as unknown as ModelRegistry;
}

function ctxLive(session: LiveSessionDouble): ExtensionCommandContext {
  return {
    model: ANTHROPIC_MODEL,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

type QueryProbe = Probe & { readonly session: LiveSessionDouble };

/**
 * Drive one untyped-query prompt-mode theta through the production binding
 * against the live session double, capturing a throw out of the render. Fails
 * loudly if the binding is not the live prompt drive.
 */
async function probeQuery(src: string): Promise<QueryProbe> {
  const doc = parseTheta("bug0027-query.theta", src);
  const session = new LiveSessionDouble();
  const deps = createProductionProducerDeps({
    pi: livePi(session),
    root: rootLive(session),
    modelRegistry: registryDouble(),
  });
  const theta: ThetaCompositionInput = {
    slashName: "bug0027q",
    sourcePath: "/theta/bug0027q.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxLive(session) });
  if (binding.drivenAgainst !== "prompt-user-session") {
    throw new Error(
      `harness: expected the LIVE prompt-mode drive, got ${String(binding.drivenAgainst)}`,
    );
  }
  try {
    return { kind: "value", execution: await executeBody(doc.body, binding.executeDeps), session };
  } catch (thrown) {
    return { kind: "threw", thrown, session };
  }
}

// ===========================================================================
// (a) enum receiver — the three object stdlib members (effectful executor host)
// ===========================================================================

describe("bug 0027 (a) — enum receiver: keys() / values() / has(k) are rejected, not answered", () => {
  it("RED (a1): `s.keys()` does not answer the boxed carrier's index properties", async () => {
    assertGated(await probeSource(ENUM_FIXTURE + "s.keys()"), {
      read: ".keys()",
      receiverKind: ENUM_RECEIVER,
      leak: ["0", "1", "2", "3"],
    });
  });

  it("RED (a2): `s.values()` does not answer the wire string's characters", async () => {
    assertGated(await probeSource(ENUM_FIXTURE + "s.values()"), {
      read: ".values()",
      receiverKind: ENUM_RECEIVER,
      leak: ["H", "i", "g", "h"],
    });
  });

  it('RED (a3): `s.has("length")` does not answer the wrapper\'s non-enumerable `length`', async () => {
    // E13: `length` is NON-enumerable on the boxed wrapper, and the
    // presence-based surface reads it anyway because it never consults a
    // descriptor — no key-privacy posture spans this and the enumerable index
    // properties (a1/a2). Receiver classification does.
    assertGated(await probeSource(ENUM_FIXTURE + 's.has("length")'), {
      read: ".has()",
      receiverKind: ENUM_RECEIVER,
      leak: true,
    });
  });
});

// ===========================================================================
// (b) enum / Result receiver — the unknown-member abort (element 2).
// expressions.md:122: anything off the stdlib list is
// `theta/parse/unknown-method` "rather than a runtime failure". At HEAD
// `evaluateObjectMember`'s default arm (src/runtime/stdlib-object.ts) throws a
// raw Error that the runtime-defect surface reclassifies as
// theta/runtime/internal-error, aborting the theta.
// ===========================================================================

describe("bug 0027 (b) — an unknown member on an enum receiver is the non-object-receiver rejection, not internal-error", () => {
  it("RED (b1): `s.toUpperCase()` — a declared `string` member on the enum carrying that string", async () => {
    // The paired control is (i3): `toUpperCase()` works on a `string` receiver,
    // so this is not a bad member name — dispatch never reaches the string
    // surface.
    assertGated(await probeSource(ENUM_FIXTURE + "s.toUpperCase()"), {
      read: ".toUpperCase()",
      receiverKind: ENUM_RECEIVER,
    });
  });

  it("RED (b2): `s.bogus()` — the same shape a schema receiver rejects at parse (control i1)", async () => {
    assertGated(await probeSource(ENUM_FIXTURE + "s.bogus()"), {
      read: ".bogus()",
      receiverKind: ENUM_RECEIVER,
    });
  });
});

// ===========================================================================
// (c) enum receiver — indexed access. expressions.md:10: the receiver "must be
// an `array<T>` or an object value; indexing any other type (including a
// `string`) is `theta/parse/non-indexable-receiver`".
// ===========================================================================

describe("bug 0027 (c) — enum receiver: indexed access is rejected, not answered", () => {
  it('RED (c1): `s["0"]` does not answer one character of the wire string', async () => {
    assertGated(await probeSource(ENUM_FIXTURE + 's["0"]'), {
      read: "[0]",
      receiverKind: ENUM_RECEIVER,
      leak: "H",
    });
  });

  it('RED (c2): `s["length"]` does not answer the wrapper\'s length', async () => {
    assertGated(await probeSource(ENUM_FIXTURE + 's["length"]'), {
      read: "[length]",
      receiverKind: ENUM_RECEIVER,
      leak: 4,
    });
  });
});

// ===========================================================================
// (d) enum receiver — member access (`evaluateMemberAccess`, runtime-panics.ts:172,
// which today carries only a `null` guard).
// ===========================================================================

describe("bug 0027 (d) — enum receiver: member access is rejected, not answered", () => {
  it("RED (d1): `s.length` does not answer 4 — expressions.md declares `length` on `string` (:79) and `array` (:107), not on an enum value", async () => {
    assertGated(await probeSource(ENUM_FIXTURE + "s.length"), {
      read: ".length",
      receiverKind: ENUM_RECEIVER,
      leak: 4,
    });
  });

  it("RED (d2): `s.__anything` is rejected by the receiver gate", async () => {
    // No `leak` value: an absent member used to bind raw JS `undefined` (bug
    // 0032's out-of-model bind, not a representation leak). The gate fires on
    // the RECEIVER, ahead of the member read, so this row is settled here
    // regardless of what bug 0032's fix did for object receivers.
    assertGated(await probeSource(ENUM_FIXTURE + "s.__anything"), {
      read: ".__anything",
      receiverKind: ENUM_RECEIVER,
    });
  });
});

// ===========================================================================
// (e) `Result` receiver — the closed observation surface. runtime-value-model.md
// `:14`: "Theta code observes `Result` only through `Ok` / `Err` constructors,
// `match` patterns, and `?`; the in-memory shape is not part of the language
// surface."
// ===========================================================================

describe("bug 0027 (e) — Result receiver: the { ok, value } representation is not readable", () => {
  it("RED (e1): `r.keys()` does not answer the representation's field names", async () => {
    assertGated(await probeSource(RESULT_FIXTURE + "r.keys()"), {
      read: ".keys()",
      receiverKind: RESULT_RECEIVER,
      leak: ["ok", "value"],
    });
  });

  it("RED (e2): `r.values()` does not answer the discriminator and payload", async () => {
    assertGated(await probeSource(RESULT_FIXTURE + "r.values()"), {
      read: ".values()",
      receiverKind: RESULT_RECEIVER,
      leak: [true, 1],
    });
  });

  it('RED (e3): `r["ok"]` does not answer the discriminator', async () => {
    assertGated(await probeSource(RESULT_FIXTURE + 'r["ok"]'), {
      read: "[ok]",
      receiverKind: RESULT_RECEIVER,
      leak: true,
    });
  });

  it("RED (e4): `r.ok` does not answer the discriminator — the ERR-18/ERR-19 machinery is bypassed by this read", async () => {
    assertGated(await probeSource(RESULT_FIXTURE + "r.ok"), {
      read: ".ok",
      receiverKind: RESULT_RECEIVER,
      leak: true,
    });
  });

  it("RED (e5): `r.bogus()` is the non-object-receiver rejection, not internal-error", async () => {
    assertGated(await probeSource(RESULT_FIXTURE + "r.bogus()"), {
      read: ".bogus()",
      receiverKind: RESULT_RECEIVER,
    });
  });

  it('RED (e6, row R7 receiver-side): `r["definitely_absent"]` takes the GATE, not MissingObjectKeyPanic', async () => {
    // The one probe whose registered code changes CLASS under this fix: at HEAD
    // an absent key on a `Result` receiver raises the missing-object-key panic
    // (reproduction row R7), which is itself the evidence that the receiver
    // reached the object read path. The gate must fire BEFORE the key-presence
    // check, so the receiver never reaches it. A regression that moved the gate
    // inside the key-present branch would keep every other probe in this file
    // green and red only here. No `leak`: the pre-fix disposition is a throw.
    const diag = assertGated(await probeSource(RESULT_FIXTURE + 'r["definitely_absent"]'), {
      read: "[definitely_absent]",
      receiverKind: RESULT_RECEIVER,
    });
    expect(
      diag.code,
      "gate-before-key-check ordering: the receiver is rejected on its KIND, so the key-presence check that raises MissingObjectKeyPanic (control i6, on an object receiver) is never reached",
    ).not.toBe(MISSING_OBJECT_KEY_CODE);
  });
});

// ===========================================================================
// (f) annotation laundering — the reason the fix is a RUNTIME gate. The A2
// layer registers `schema` declarations only (`collectTypeEnv`,
// src/parser/type-layer-checks.ts:233), so an enum name answers `"unknown"` and
// `Result` has no `CompatType` form at all; `checkMemberAccess` defers on
// `"unknown"` exactly as it does on `"object"`. All three sources are
// parse-clean at HEAD.
// ===========================================================================

describe("bug 0027 (f) — the gate is total over the input class: unannotated, annotated and laundered receivers", () => {
  it("RED (f1, row E7): an UNANNOTATED `fn` parameter does not launder the receiver", async () => {
    assertGated(
      await probeSource(ENUM_FIXTURE + "fn f(x) {\n  return x.keys()\n}\nf(s)"),
      { read: ".keys()", receiverKind: ENUM_RECEIVER, leak: ["0", "1", "2", "3"] },
    );
  });

  it("RED (f2, row E8): an EXPLICIT `let t: Severity` annotation does not narrow the input class", async () => {
    assertGated(await probeSource(ENUM_FIXTURE + "let t: Severity = s\nt.keys()"), {
      read: ".keys()",
      receiverKind: ENUM_RECEIVER,
      leak: ["0", "1", "2", "3"],
    });
  });

  it("RED (f3, row R9): an EXPLICIT `let q: Result<integer, string>` annotation is equally parse-clean", async () => {
    assertGated(
      await probeSource(RESULT_FIXTURE + "let q: Result<integer, string> = r\nq.keys()"),
      { read: ".keys()", receiverKind: RESULT_RECEIVER, leak: ["ok", "value"] },
    );
  });

  it("RED (f4): the widened index guard covers its whole input class — a laundered `string` receiver", async () => {
    // runtime-panics.ts:148 already refuses a primitive index receiver, but with
    // a raw unregistered Error ("indexed access requires an array<T> or object
    // receiver; got string") → theta/runtime/internal-error. Bug 0027 §Fix
    // widens THAT guard rather than adding a second one, so the registered code
    // covers the primitive arm too.
    assertGated(await probeSource('fn f(x) {\n  return x[0]\n}\nf("hi")'), {
      read: "[0]",
      receiverKind: STRING_RECEIVER,
    });
  });
});

// ===========================================================================
// (g) the PURE host (`evaluateStdlibMethod`, production-theta-producer.ts:5890,
// object arm :5901)
// — reached through the QRY-18 interpolation render. The two hosts must move in
// lockstep; a gate on the effectful executor alone leaves this one leaking, and
// this one leaks ONTO THE WIRE: the rendered text is what the model receives.
// ===========================================================================

describe("bug 0027 (g) — the pure host's stdlib arm gates too (QRY-18 interpolation render)", () => {
  it("RED (g1): `@`payload: ${s.keys()}`` neither sends nor answers the carrier's index properties", async () => {
    const probe = await probeQuery(
      FM + ENUM_FIXTURE + "let v = @`payload: ${s.keys()}`?\nv",
    );
    expect(
      probe.session.sentQueryTexts.join("\n"),
      'DIRECTION 2 (bug 0027 §Why it matters): the pure host renders the read INTO THE PROMPT — at HEAD the model receives `payload: ["0","1","2","3"]`. The gate fires during the render, before any send, so no sent text can carry the encoding',
    ).not.toContain('["0","1","2","3"]');
    assertGated(probe, { read: ".keys()", receiverKind: ENUM_RECEIVER });
  });

  it("RED (g2): `@`payload: ${r.keys()}`` neither sends nor answers the Result representation", async () => {
    const probe = await probeQuery(FM + RESULT_FIXTURE + "let v = @`payload: ${r.keys()}`?\nv");
    expect(
      probe.session.sentQueryTexts.join("\n"),
      "DIRECTION 2: at HEAD the model receives `payload: [\"ok\",\"value\"]`",
    ).not.toContain('["ok","value"]');
    assertGated(probe, { read: ".keys()", receiverKind: RESULT_RECEIVER });
  });

  it("CONTROL (g3): an OBJECT receiver still renders `keys()` in an interpolation (green now, green after)", async () => {
    const probe = await probeQuery(FM + OBJECT_FIXTURE + "let v = @`payload: ${o.keys()}`?\nv");
    valueOf(probe, "the object-receiver interpolation");
    expect(
      probe.session.sendUserMessageCalls,
      "harness guard: the untyped query drives exactly one streamed user turn",
    ).toBe(1);
    expect(
      probe.session.sentQueryTexts[0],
      "an object value's theta-side field names still render",
    ).toBe('payload: ["x"]');
  });
});

// ===========================================================================
// (h) the registered message template, asserted verbatim — the three read
// shapes on an enum receiver (h1–h3), the Result kind (h4), and the two
// index-only primitive kinds (h5–h6). The header states the row the
// implementer mints in code-registry-runtime.md; these six are the byte-exact
// renderings.
// ===========================================================================

describe("bug 0027 (h) — the registered message template", () => {
  it("RED (h1): a stdlib-method rejection renders `non-object receiver: cannot read .keys() on an enum value`", async () => {
    const diag = assertGated(await probeSource(ENUM_FIXTURE + "s.keys()"), {
      read: ".keys()",
      receiverKind: ENUM_RECEIVER,
      leak: ["0", "1", "2", "3"],
    });
    expect(diag.message).toBe(rejectionMessage(".keys()", ENUM_RECEIVER));
  });

  it('RED (h2): an indexed-access rejection renders `… cannot read [0] on an enum value`', async () => {
    const diag = assertGated(await probeSource(ENUM_FIXTURE + 's["0"]'), {
      read: "[0]",
      receiverKind: ENUM_RECEIVER,
      leak: "H",
    });
    expect(diag.message).toBe(rejectionMessage("[0]", ENUM_RECEIVER));
  });

  it("RED (h3): a member-access rejection renders `… cannot read .length on an enum value`", async () => {
    const diag = assertGated(await probeSource(ENUM_FIXTURE + "s.length"), {
      read: ".length",
      receiverKind: ENUM_RECEIVER,
      leak: 4,
    });
    expect(diag.message).toBe(rejectionMessage(".length", ENUM_RECEIVER));
  });

  it("RED (h4): a `Result` rejection renders `… cannot read .ok on a Result value`", async () => {
    const diag = assertGated(await probeSource(RESULT_FIXTURE + "r.ok"), {
      read: ".ok",
      receiverKind: RESULT_RECEIVER,
      leak: true,
    });
    expect(diag.message).toBe(rejectionMessage(".ok", RESULT_RECEIVER));
  });

  it("RED (h5): a laundered `number` index rejection renders `… cannot read [0] on a number`", async () => {
    // The remaining two of the row's five registered `<receiver kind>` strings
    // (h5, h6) reach the gate only through the widened index guard, on the f4
    // laundering: `theta/parse/non-indexable-receiver` rejects a statically
    // resolvable primitive receiver, so an unannotated `fn` parameter is the
    // input class that carries a primitive into the runtime. Without these two
    // probes a typo in either `gatedReceiverKind` switch arm
    // (src/runtime/runtime-panics.ts) keeps the whole suite green.
    const diag = assertGated(await probeSource("fn f(x) {\n  return x[0]\n}\nf(5)"), {
      read: "[0]",
      receiverKind: NUMBER_RECEIVER,
    });
    expect(diag.message).toBe(rejectionMessage("[0]", NUMBER_RECEIVER));
  });

  it("RED (h6): a laundered `boolean` index rejection renders `… cannot read [0] on a boolean`", async () => {
    const diag = assertGated(await probeSource("fn f(x) {\n  return x[0]\n}\nf(true)"), {
      read: "[0]",
      receiverKind: BOOLEAN_RECEIVER,
    });
    expect(diag.message).toBe(rejectionMessage("[0]", BOOLEAN_RECEIVER));
  });
});

// ===========================================================================
// (i) CONTROLS — green now, green after. An over-broad receiver gate reds here.
// ===========================================================================

describe("bug 0027 (i) — controls: object, string and array receivers keep their surfaces", () => {
  it("CONTROL (i1, row O1): `o.bogus()` on a schema-typed receiver stays a PARSE rejection", async () => {
    // expressions.md:122 — the disposition bug 0027 (b) must deliver for the
    // enum and `Result` receivers is delivered here today. This must remain a
    // PARSE rejection: the runtime gate does not replace it.
    const doc = parseOnly("bug0027-o1.theta", FM + OBJECT_FIXTURE + "o.bogus()");
    const errors = doc.diagnostics.filter((d) => d.severity === "error");
    expect(
      errors.map((d) => d.code),
      "the A2 layer rejects an unknown method on a resolvable object receiver at parse",
    ).toContain("theta/parse/unknown-method");
    expect(
      errors.find((d) => d.code === "theta/parse/unknown-method")?.message,
      "the registered parse message names the method and the receiver type",
    ).toBe("unknown method 'bogus' on type F");
  });

  it("CONTROL (i2, row O2): `o.keys()` on a schema-typed value answers the theta-side field names", async () => {
    expect(
      valueOf(await probeSource(OBJECT_FIXTURE + "o.keys()"), "o.keys()"),
      "the object-receiver baseline",
    ).toEqual(["x"]);
  });

  it('CONTROL (i3, row O3): `"hi".toUpperCase()` on a `string` receiver answers "HI"', async () => {
    expect(
      valueOf(await probeSource('"hi".toUpperCase()'), '"hi".toUpperCase()'),
      "expressions.md:81 — toUpperCase() is a declared string member",
    ).toBe("HI");
  });

  it('CONTROL (i4): `"hi".length` answers 2 — the member gate must not reach a `string` receiver', async () => {
    expect(
      valueOf(await probeSource('"hi".length'), '"hi".length'),
      "expressions.md:79 — length is declared on string",
    ).toBe(2);
  });

  it("CONTROL (i5): array `length` and indexing keep working", async () => {
    expect(
      valueOf(await probeSource("let a = [1, 2, 3]\na.length"), "a.length"),
      "expressions.md:107 — length is declared on array",
    ).toBe(3);
    expect(
      valueOf(await probeSource("let a = [10, 20]\na[1]"), "a[1]"),
      "array indexing is unaffected by a receiver gate",
    ).toBe(20);
  });

  it("CONTROL (i6, row R7): a genuinely absent key on an OBJECT receiver still raises MissingObjectKeyPanic", async () => {
    const probe = await probeSource(OBJECT_FIXTURE + 'o["definitely_absent"]');
    if (probe.kind === "value") {
      throw new Error(
        `CONTROL BROKEN — the missing-object-key panic must still fire for object receivers; got value ${render(probe.execution.result.value)}`,
      );
    }
    expect(
      isThetaPanic(probe.thrown),
      "error-model.md:71 — missing-object-key is one of the six closed panic sources and stays a panic",
    ).toBe(true);
    expect(
      (probe.thrown as { readonly code: string }).code,
      "the object read path is reached and functioning; bug 0027 is that an enum / Result receiver reaches it at all",
    ).toBe(MISSING_OBJECT_KEY_CODE);
    expect((probe.thrown as Error).message, "the registered template").toBe(
      "missing object key: definitely_absent",
    );
  });

  it("CONTROL (i7): an OUT-OF-MODEL receiver keeps its internal-error disposition — the gate claims only its registered kinds", () => {
    // Bug 0032 (docs/bugs/0032-absent-member-binds-undefined.md) used to bind
    // raw JS `undefined` for an absent member, so `x.absent[0]` reached the
    // widened index guard with `undefined` as its receiver — parse-clean,
    // laundered through an unannotated `fn`. Bug 0032's fix closed that
    // feeder: `evaluateMemberAccess`'s presence gate now panics on the absent
    // name before any index read ever sees the value, so
    // `fn f(x) { return x.absent[0] }; f(o)` is unreachable from theta source
    // post-fix (the member read panics first) — this control is re-anchored
    // to call `evaluateIndexAccess` DIRECTLY with an out-of-model receiver, so
    // the seam it pins (the raw-Error arm below) stays exercised at the unit
    // level. `undefined` is in neither the row's registered trigger ("a
    // `string`, `number`, or `boolean` receiver that bypassed the static
    // check") nor its closed `<receiver kind>` set, so emitting the new code
    // here would be a DIAG-4 registry/behaviour mismatch. This input keeps
    // its PRE-0027 disposition instead: a raw `Error` on the open-ended
    // `theta/runtime/internal-error` surface. Green now, green after.
    let didThrow = false;
    let raised: unknown;
    try {
      evaluateIndexAccess(undefined as unknown as ThetaValue, 0);
    } catch (thrown) {
      didThrow = true;
      raised = thrown;
    }
    if (!didThrow) {
      throw new Error(
        "CONTROL BROKEN — indexing an out-of-model receiver must be rejected, not answered",
      );
    }
    expect(
      isThetaPanic(raised),
      "the out-of-model arm is not a panic either — the closed six-source list is unaffected in both directions",
    ).toBe(false);
    const diag = surfaceUnexpectedThrow(raised, SITE) as Diagnostic;
    expect(
      diag.code,
      `an out-of-model receiver is outside the registered trigger of ${NON_OBJECT_RECEIVER_CODE}, so it must NOT carry that code. Message: ${diag.message}`,
    ).toBe(INTERNAL_ERROR_CODE);
    expect(
      diag.message,
      "the pre-0027 raw-Error message, byte-preserved through the widening",
    ).toBe("internal error: indexed access requires an array<T> or object receiver; got undefined");
  });
});

describe("bug 0027 (j) — controls: `match` and `?` still read the Result representation internally", () => {
  it("CONTROL (j1): `match` over a `Result` still dispatches on the discriminator", async () => {
    // The gate covers the four object READ entry points only. `match` reads the
    // representation through `matchResult` / the value model, not through
    // `applyStdlibMethod` / `evaluateIndexAccess` / `evaluateMemberAccess`, so
    // the spec-sanctioned observation surface must survive.
    expect(
      valueOf(
        await probeSource(RESULT_FIXTURE + "match r {\n  Ok(v) => v,\n  Err(e) => 0\n}"),
        "match over Ok(1)",
      ),
      "runtime-value-model.md:14 — `match` is one of the three sanctioned observation forms",
    ).toBe(1);
  });

  it("CONTROL (j2): `?` propagation still unwraps a `Result`", async () => {
    expect(
      valueOf(
        await probeSource(
          "fn g(): Result<integer, string> {\n  return Ok(7)\n}\n" +
            "fn h(): Result<integer, string> {\n  let v = g()?\n  return Ok(v + 1)\n}\n" +
            "match h() {\n  Ok(v) => v,\n  Err(e) => 0\n}",
        ),
        "`?` through two fn frames",
      ),
      "runtime-value-model.md:14 — `?` is one of the three sanctioned observation forms",
    ).toBe(8);
  });
});
