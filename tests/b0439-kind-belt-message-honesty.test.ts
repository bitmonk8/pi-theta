// Bug 0439 — `StdlibMethodArgumentKindDefectError`'s message tail asserts "the
// parse-time stdlib-arg-type-mismatch gate … did not reject this
// laundered-receiver site (bug 0394)" (src/runtime/runtime-panics.ts:504) — a
// diagnosis that LIES on the second emission class bug 0402 admitted. Bug 0394
// authored that tail when the kind belt could fire ONLY past a parse check that
// deferred on a LAUNDERED (statically-unresolvable) receiver, so the claim was
// then true. Bug 0402 (fixed 0.400.0) widened the belt's `"integer"` arm with an
// integrality conjunct (`typeof arg !== "number" || !Number.isInteger(arg)` at
// src/runtime/stdlib-string.ts:103), which admits a SECOND class with NO
// laundering anywhere: a statically-RESOLVABLE receiver (a same-file `let xs =
// [1,2,3]`) and a statically-`integer`-typed argument (`4 % y`) whose value
// evaluates non-integral at runtime (`y == 0` ⇒ `4 % 0` ⇒ `NaN`). On THAT path
// the parse gate RAN, judged the site, and correctly PASSED it — the mismatch is
// statically invisible; nothing was laundered and there was nothing the gate
// could have rejected. The message still tells the author the gate "did not
// reject this laundered-receiver site": both halves false. The registry's own
// Trigger cell already states the true, widened condition
// (docs/spec_topics/diagnostics/code-registry-runtime.md:24 — "refuses only
// statically-resolvable mismatches …, and a statically-`integer`-typed operand
// can still evaluate non-integral at runtime"); the author-visible message
// contradicts its own registry row.
// (docs/bugs/0439-kind-belt-message-lies-on-non-laundered-paths.md)
//
// SETTLED §Fix (this file pins the post-fix contract): reword the tail at
// runtime-panics.ts:504 to a diagnosis TRUE OF BOTH emission classes, mirroring
// the registry clause — e.g. "…; the parse-time stdlib-arg-type-mismatch gate
// covers only statically-resolvable mismatches, so this site's argument reached
// the runtime belt unjudged (bugs 0394/0402)". The §Fix CONSTRAINT: the
// b0402/b0394 witnesses match the `expects an? (string|integer|array)` HEAD, not
// the tail, so the reword must keep that head byte-stable. This witness pins the
// SEMANTIC, not the exact new wording: (b) the false laundering claim is GONE,
// (c) the honest condition (the gate covers only statically-resolvable
// mismatches; cites bug 0402's newly-admitted class) is PRESENT. Behaviour is
// out of scope and correct on every path (loud abort, right code, right route) —
// only the message prose changes.
//
// BELT MESSAGE SHAPE (identical to bug 0394/0402's; the kind here is "integer"):
// the defect body is `internal defect: stdlib method '<method>' argument <i>
// expects an integer, got <actual>; …` and `surfaceUnexpectedThrow` prepends
// `internal error: ` (the registered `internal error: <error.message>` row,
// code-registry-runtime.md:24 Message cell). The HEAD match
// `/stdlib method '\w+' argument \d+ expects an? (string|integer|array)/`
// distinguishes the KIND belt from the bug-0315 ARITY belt's "called with N
// argument(s)" message — both route to the same internal-error code.
//
// WITNESS TABLE:
//   FLIP B1 (the core lie — NON-laundered path; RED at fork on the tail):
//     `let xs = [1,2,3]` / `let y = 0` / `let out = xs.slice(4 % y)` / `out`
//     — parses CLEAN (resolvable receiver's gate ran and PASSED; `4 % y` types
//     integer), executeBody THROWS the kind belt. HEAD present + framed prefix
//     (GREEN both sides); tail LIE gone + honest condition present (RED at fork).
//   CONTROL B2 (parse controls — GREEN now AND after; prove the receiver is
//     resolvable and its gate LIVE on this exact receiver):
//     ctl-string `xs.slice("a")`  → parse CONTAINS stdlib-arg-type-mismatch
//     ctl-frac   `xs.slice(1.5)`  → parse CONTAINS stdlib-arg-type-mismatch
//     b1-parse   `xs.slice(4 % y)`→ parse does NOT contain it (gate ran, rightly
//                                    passed — `4 % y` types integer)
//   CONTROL C1 (the LAUNDERED path — message must STAY honest there too; RED at
//     fork, GREEN post-fix): `fn g(xs, a) { xs.slice(a) }` / `g([1,2,3], 1.5)`
//     throws the byte-identical message. Same honest-tail semantic + stable head
//     — proves the reword did not merely swap one single-class lie for another.

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
  file: "b0439.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

// ===========================================================================
// Shared parse harness (the b0402/b0394 shape, verbatim): parseThetaDocument →
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
  const source: ThetaSource = { path: "b0439.theta", bytes: new TextEncoder().encode(FM + src) };
  return parseThetaDocument(source, parseDeps());
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. B1's and
 * C1's fixtures are parse-clean at HEAD — B1 BECAUSE its `let`-bound receiver is
 * statically resolvable and the gate passes `4 % y` (types `integer`), C1
 * BECAUSE its slice receiver is a WITHHELD `fn` param the gate defers on — so a
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
    // with no real timers (the b0394/b0402 harness contract).
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
// EXECUTOR harness (b0402 shape, verbatim). A raw non-panic throw propagates out
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
    slashName: "b0439",
    sourcePath: "/proj/b0439.theta",
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
 * The kind belt MUST have thrown (both emission classes abort loudly — that is
 * out of scope and correct). A value here means the belt did not fire at all,
 * i.e. a harness precondition breach (fail loudly, never a skip); return the
 * thrown so the message assertions can run on it.
 */
function requireBeltThrow(probe: Probe, what: string): unknown {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: the kind belt must throw loudly on a non-integral integer-descriptor arg (precondition for the message check)`,
    ).toBe("runtime kind-belt throw");
  }
  return (probe as { readonly thrown: unknown }).thrown;
}

/**
 * HEAD + route framing (the b0402 helper, verbatim behaviour): the caught throw
 * is the belt's plain `Error` (NOT a `ThetaPanic`) that `surfaceUnexpectedThrow`
 * frames to INTERNAL_ERROR_CODE with the `internal error: ` prefix, AND whose
 * message carries the wrong-KIND HEAD. This is the §Fix constraint made
 * executable — the reword must keep this head byte-stable, so this side is GREEN
 * at fork AND post-fix. Returns the framed diagnostic message (the
 * author-visible channel: registered `internal error: <error.message>`,
 * code-registry-runtime.md:24 Message cell).
 */
function assertHeadStable(thrown: unknown, what: string): string {
  expect(
    isThetaPanic(thrown),
    `${what}: the kind belt is a plain Error, NOT a ThetaPanic. Thrown: ${String(thrown)}`,
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
    `${what}: the internal-error template prefix (byte-stable head, §Fix constraint)`,
  ).toMatch(/^internal error: /);
  expect(
    diag.message,
    `${what}: the wrong-KIND belt HEAD shape must stay byte-stable across the reword (§Fix constraint). Message: ${diag.message}`,
  ).toMatch(/stdlib method '\w+' argument \d+ expects an? (string|integer|array)/);
  return diag.message;
}

/**
 * THE LIE IS GONE — the false laundering diagnosis must be absent from the
 * author-visible message. At fork the tail (runtime-panics.ts:504) still reads
 * "did not reject this laundered-receiver site (bug 0394)", so BOTH tokens are
 * present ⇒ RED here. Post-fix the reworded tail names the true condition (no
 * laundering claim) ⇒ GREEN. Asserted on the raw `error.message`, which the
 * `internal error: <error.message>` framing carries verbatim.
 */
function assertLaunderingLieGone(message: string, what: string): void {
  expect(
    message,
    `${what}: the tail must NOT claim a laundered receiver — B1's receiver is a same-file resolvable \`let\`, and C1's laundered path was never about laundering either (nothing "laundered" describes the runtime-non-integral class). Message: ${message}`,
  ).not.toContain("laundered-receiver");
  expect(
    message,
    `${what}: the tail must NOT claim the gate "did not reject" this site — on the non-laundered path the gate RAN and rightly PASSED (\`4 % y\` types integer); there was nothing to reject. Message: ${message}`,
  ).not.toContain("did not reject");
}

/**
 * THE HONEST CONDITION IS PRESENT — the reworded tail states the true, widened
 * diagnosis, mirroring the registry Trigger clause (code-registry-runtime.md:24
 * "refuses only statically-resolvable mismatches") and citing bug 0402's
 * newly-admitted emission class. Tokens chosen for robustness, NOT to over-pin
 * the exact §Fix wording: `statically-resolvable` appears in both the §Fix
 * example and the registry clause the fix mirrors; `0402` is the bug whose class
 * this message must now cover (the §Fix cites "bugs 0394/0402"). At fork the tail
 * carries neither ⇒ RED; post-fix both ⇒ GREEN.
 */
function assertHonestConditionPresent(message: string, what: string): void {
  expect(
    message,
    `${what}: the reworded tail must state the honest condition — the gate covers only STATICALLY-RESOLVABLE mismatches (registry Trigger clause, code-registry-runtime.md:24). Message: ${message}`,
  ).toMatch(/statically-resolvable/);
  expect(
    message,
    `${what}: the reworded tail must cite bug 0402 — the emission class (a resolvable receiver + a statically-integer arg evaluating non-integral) whose input this message must now describe. Message: ${message}`,
  ).toMatch(/0402/);
}

// ===========================================================================
// FLIP B1 — the core lie witness (NON-laundered path). A statically-resolvable
// `let xs = [1,2,3]` receiver with a statically-`integer`-typed arg `4 % y` that
// evaluates non-integral at runtime (`y == 0` ⇒ `NaN`). Parse gate RAN and
// PASSED (B2 b1-parse proves it); executeBody throws the kind belt. HEAD +
// framing GREEN both sides (§Fix constraint); tail LIE gone + honest condition
// present RED at fork — the tail (runtime-panics.ts:504) still names a
// laundered-receiver gate deferral that never happened.
// ===========================================================================

const B1_SRC = "let xs = [1, 2, 3]\nlet y = 0\nlet out = xs.slice(4 % y)\nout";

describe("bug 0439 FLIP B1 — non-laundered kind-belt message honesty", () => {
  it("GREEN (B1 head): the wrong-KIND HEAD + `internal error:` framing stay byte-stable (§Fix constraint)", async () => {
    const thrown = requireBeltThrow(await probeSource(B1_SRC), "B1");
    assertHeadStable(thrown, "B1");
  });

  it("RED at fork (B1 lie): the tail must NOT claim a laundered receiver / a gate that did not reject", async () => {
    const thrown = requireBeltThrow(await probeSource(B1_SRC), "B1");
    // Raw message is what the `internal error: <error.message>` row surfaces to
    // the author (code-registry-runtime.md:24). The lie lives in the raw tail.
    const rawMessage = (thrown as Error).message;
    assertLaunderingLieGone(rawMessage, "B1");
  });

  it("RED at fork (B1 honest): the tail must state the true statically-resolvable condition and cite bug 0402", async () => {
    const thrown = requireBeltThrow(await probeSource(B1_SRC), "B1");
    const rawMessage = (thrown as Error).message;
    assertHonestConditionPresent(rawMessage, "B1");
  });
});

// ===========================================================================
// CONTROL B2 — parse controls (GREEN now AND after). Prove the receiver is
// statically resolvable and its parse gate is LIVE on this exact receiver:
// direct kind/integrality mismatches ARE parse-refused, but B1's `4 % y` is NOT
// (it types `integer` — the gate ran and rightly passed). This anchors B1 to the
// non-laundered class: the runtime belt is the ONLY judge that can fire, and the
// message must therefore not blame a deferred/laundered gate.
// ===========================================================================

const GATE_CODE = "theta/parse/stdlib-arg-type-mismatch";

function parseCodes(src: string): readonly string[] {
  return parseOnly(src).diagnostics.map((d) => d.code);
}

describe("bug 0439 CONTROL B2 — the receiver is resolvable and its gate is live", () => {
  it("GREEN (ctl-string): `xs.slice(\"a\")` on a resolvable receiver is parse-refused (gate live)", () => {
    expect(
      parseCodes('let xs = [1, 2, 3]\nxs.slice("a")'),
      "ctl-string: a direct wrong-KIND arg on a resolvable receiver must be caught at parse",
    ).toContain(GATE_CODE);
  });

  it("GREEN (ctl-frac): `xs.slice(1.5)` on a resolvable receiver is parse-refused (gate live)", () => {
    expect(
      parseCodes("let xs = [1, 2, 3]\nxs.slice(1.5)"),
      "ctl-frac: a direct fractional integer-descriptor arg on a resolvable receiver must be caught at parse",
    ).toContain(GATE_CODE);
  });

  it("GREEN (b1-parse): `xs.slice(4 % y)` is NOT parse-refused — the gate ran and rightly passed", () => {
    // `4 % y` types `integer` statically, so the gate judges the site and passes
    // it; the mismatch is only reachable at runtime (`y == 0` ⇒ `NaN`). Nothing
    // is deferred or laundered — this is the whole point of B1's lie.
    expect(
      parseCodes("let xs = [1, 2, 3]\nlet y = 0\nxs.slice(4 % y)"),
      "b1-parse: `4 % y` types integer, so the gate must NOT reject at parse (the runtime belt is the only judge)",
    ).not.toContain(GATE_CODE);
  });
});

// ===========================================================================
// CONTROL C1 — the LAUNDERED path (message must STAY honest there too). A
// WITHHELD `fn` param receiver `xs.slice(a)` called with `1.5` throws the
// byte-identical message. RED at fork (old single-class tail), GREEN post-fix
// (the reworded tail — "covers only statically-resolvable mismatches … unjudged
// (bugs 0394/0402)" — is true of this class too). This proves the reword did not
// merely swap one single-class lie for the other: the honest tail describes both
// classes at once.
// ===========================================================================

const C1_SRC = "fn g(xs, a) { xs.slice(a) }\ng([1, 2, 3], 1.5)";

describe("bug 0439 CONTROL C1 — the laundered path keeps the same honest tail", () => {
  it("GREEN (C1 head): the wrong-KIND HEAD + `internal error:` framing stay byte-stable (§Fix constraint)", async () => {
    const thrown = requireBeltThrow(await probeSource(C1_SRC), "C1");
    assertHeadStable(thrown, "C1");
  });

  it("RED at fork (C1 lie): the laundered path's tail must NOT still read as the old single-class laundering claim", async () => {
    const thrown = requireBeltThrow(await probeSource(C1_SRC), "C1");
    const rawMessage = (thrown as Error).message;
    assertLaunderingLieGone(rawMessage, "C1");
  });

  it("RED at fork (C1 honest): the reworded tail (true of both classes) states the statically-resolvable condition and cites 0402", async () => {
    const thrown = requireBeltThrow(await probeSource(C1_SRC), "C1");
    const rawMessage = (thrown as Error).message;
    assertHonestConditionPresent(rawMessage, "C1");
  });
});
