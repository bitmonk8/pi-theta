import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import { renderTopLevelErrNote } from "../src/runtime/err-note-render";
import type { QueryError } from "../src/runtime/query-error";

// Bug 0019 — `?` on a member/index/identifier operand bypasses both the ERR-18
// static gate and `asResultValue` normalisation; the blind unwrap forges a
// fabricated cancellation or silently binds `undefined`
// (docs/bugs/0019-question-operand-bypasses-result-normalisation.md).
//
// Spec: expressions.md ERR-18 — the operand `?` is applied to MUST statically
// type as `Result<T, QueryError>`; any other operand is
// `theta/parse/question-on-non-result` and the theta FAILS TO LOAD ("there is
// no runtime disposition"). No spec arm evaluates the matrix fixtures below:
// the closed runtime panic list (error-model.md §"Runtime panics") has no
// question-on-non-result source and the runtime code registry registers none.
//
// At HEAD the static classifier (`questionOperandKind`,
// src/parser/type-layer-checks.ts) leaves member / index / identifier operands
// unclassified — their inferred CompatTypes are `named` placeholders (a member
// access types as `named <field>`, an index read as the element type or
// `named "index"`, an identifier as its recorded binding type: the declared
// annotation where it carries one, else the initialiser's inferred type) — no
// runtime net exists, and `evalTry` (src/runtime/statement-executor.ts)
// blind-casts the raw operand value to `ResultValue`:
//   - a plain value:           `.ok` is undefined → forged Err(undefined) →
//                              outcome fail, error === undefined → the terminal
//                              surface's `?? makeCancelledError()` FABRICATES a
//                              cancellation ("theta /<name> cancelled");
//   - `{ ok: true, … }` data:  unwraps the phantom `.value` → outcome success,
//                              value null — the payload is gone (bug 0017's
//                              corruption signature, still live post-0017);
//   - `{ ok: false, … }` data: propagates the phantom `.error` → the same
//                              fabricated cancellation.
//
// FIXED CONTRACT pinned by this file (RED now, GREEN after the stage-2 fix):
// `evalTry` guards the unwrap with the brand-based `isResultValue`; a
// non-Result operand value THROWS a defect Error — the
// `PiToolArgShapeDefectError` pattern (src/runtime/tool-call.ts): a plain
// thrown Error routed to the `theta/runtime/internal-error` surface by the
// top-level slash catch. `executeBody` therefore REJECTS instead of resolving
// with a corrupted outcome, and the fail-surface path (`binding.surface` →
// `renderTopLevelErrNote`) is never fed the forged `error === undefined` that
// trips `?? makeCancelledError()`.
//
// MESSAGE CONTRACT the stage-2 defect error must satisfy (asserted below): the
// thrown Error's message CONTAINS both
//   - "ERR-18"                              (the spec anchor whose gate leaked),
//   - "theta/parse/question-on-non-result"  (the parse gate that should have
//                                            rejected the site),
// and SHOULD additionally summarise the offending operand value (not asserted
// here — stage 2's freedom), mirroring how `PiToolArgShapeDefectError`'s
// message names its own parse gate (theta/parse/tool-arg-not-object-literal)
// and bug number.
//
// CONTROLS pin the no-false-positive side: `?` over a genuine STORED Result
// (an identifier bound to a constructor) unwraps at HEAD (the blind cast
// happens to read a real `.ok`) and must keep unwrapping once the brand guard
// passes genuine Results through. The bullet-1 wrap-unwrap path (`f()?` over a
// non-Result fn return) is pinned by tests/result-value-privacy.test.ts
// (b-series) and is deliberately NOT re-asserted here.

// ===========================================================================
// Shared harness — parse a real source, drive it through the production
// prompt-mode binding (parseThetaDocument → createProductionProducerDeps →
// bindPromptConversation → executeBody). The exact
// tests/result-value-privacy.test.ts §"Shared harness" pattern.
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

// ===========================================================================
// The DIAG-4 oracle for the one row decided at PARSE (m6). Mirrors the
// `REGISTRY` / `registered` shape tests/ctor-field-type-check.test.ts
// established: diagnostic-shape.md:74 makes the registry's *Message* column
// normative, so an asserting test sources the string from that column instead
// of copying the sentence.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The parse-phase registry table, read from the spec corpus (DIAG-4). */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

const QUESTION_CODE = "theta/parse/question-on-non-result";

/**
 * A registered code's normative *Message* template. Fails LOUDLY naming the
 * registry page when the row is absent, so a registry drift can never degrade
 * an assertion into a comparison against `undefined` — never a skip.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for ${code} — the DIAG-4 column (diagnostic-shape.md:74) is this row's only oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/**
 * A registered *Message* with one placeholder interpolated. Fails LOUDLY when
 * the template does not carry it, so a registry reword cannot leave the
 * assertion comparing against an un-filled template.
 */
function registeredMessage(code: string, placeholder: string, value: string): string {
  const template = registered(code);
  if (!template.includes(placeholder)) {
    throw new Error(
      `harness: the ${code} Message template does not carry ${placeholder}; template=${JSON.stringify(template)}`,
    );
  }
  return template.replace(placeholder, value);
}

/**
 * Parse a fixture source and fail LOUDLY on any error-severity diagnostic — a
 * fixture that stops parsing must never let a bug test pass or fail for the
 * wrong reason (no silent skip). For the m1–m5 matrix this loud gate is itself
 * part of the witness: "it parsed" proves ERR-18 did not fire at load, which
 * is exactly the static-gate gap (the operands infer as `named` placeholders
 * and stay unclassified even after the stage-2 `union`/`object` widening). m6
 * uses the gate inverted — its throw IS that row's refusal observable.
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

function producer() {
  return createProductionProducerDeps({
    // `getActiveTools`/`setActiveTools` satisfy the PIC-17 window;
    // `sendMessage` satisfies the theta-system-note channel.
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

/** Parse a self-contained prompt-mode source into a composition input. */
function thetaOf(src: string): ThetaCompositionInput {
  const doc = parseTheta("bug0019.theta", src);
  return {
    slashName: "bug0019",
    sourcePath: "/theta/bug0019.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
}

function bindAndExecute(
  deps: ReturnType<typeof producer>,
  theta: ThetaCompositionInput,
): Promise<BodyExecution> {
  const bindInput: ConversationBindInput = { theta, args: "", ctx: ctxDouble() };
  const binding = deps.bindPromptConversation(bindInput);
  return executeBody(theta.body, binding.executeDeps);
}

/** Parse + run a self-contained prompt-mode source through the production binding. */
function runSource(src: string): Promise<BodyExecution> {
  return bindAndExecute(producer(), thetaOf(src));
}

/**
 * Assert the production drive REJECTS with the stage-2 ERR-18 defect error.
 * GENUINELY RED AT HEAD: every matrix drive currently RESOLVES (outcome fail
 * with `error === undefined`, or outcome success carrying null), so the
 * `rejects` matcher fails with "promise resolved … instead of rejecting" —
 * never a silent pass.
 */
async function expectQuestionDefect(
  execution: Promise<BodyExecution>,
  row: string,
): Promise<void> {
  await expect(
    execution,
    `${row}: executeBody must REJECT with the ERR-18 defect error (the spec says this theta must not even load; the runtime brand guard is the belt-and-braces for the statically-unclassifiable operand) — it must NOT resolve with a silently-corrupted outcome`,
  ).rejects.toThrow(/ERR-18/);
  await expect(
    execution,
    `${row}: the defect message names the parse gate that should have rejected the site`,
  ).rejects.toThrow("theta/parse/question-on-non-result");
}

// ===========================================================================
// The bug report's reproduction matrix (m1–m6): every `?` over a non-Result
// member / index / identifier operand aborts loudly. Fixtures use
// schema-named constructors (bare object literals are
// theta/parse/bare-object-literal, an unrelated rejection).
// ===========================================================================

const M1_MEMBER =
  FM +
  "schema Inner { a: number }\n" +
  "schema Outer { r: Inner }\n" +
  "let o = Outer { r: Inner { a: 1 } }\n" +
  "let v = o.r?\n" +
  "v";

describe("bug 0019 — `?` over a non-Result member/index/identifier operand aborts loudly (ERR-18 defect guard)", () => {
  it("RED (m1): member `o.r?` over a plain schema object rejects (currently: outcome fail, error === undefined)", async () => {
    await expectQuestionDefect(runSource(M1_MEMBER), "m1");
  });

  it("RED (m2): index `xs[0]?` over a plain object element rejects (currently: outcome fail, error === undefined)", async () => {
    await expectQuestionDefect(
      runSource(
        FM +
          "schema Item { a: number }\n" +
          "let xs = [Item { a: 1 }]\n" +
          "let v = xs[0]?\n" +
          "v",
      ),
      "m2",
    );
  });

  it("RED (m3): identifier `x?` bound to a plain schema object rejects (currently: outcome fail, error === undefined)", async () => {
    await expectQuestionDefect(
      runSource(
        FM +
          "schema Thing { a: number }\n" +
          "let x = Thing { a: 1 }\n" +
          "let v = x?\n" +
          "v",
      ),
      "m3",
    );
  });

  it("RED (m4): member `o.r?` over `{ ok: true, label: \"x\" }` USER DATA rejects (currently: outcome success, value null — the payload is gone)", async () => {
    await expectQuestionDefect(
      runSource(
        FM +
          "schema Out { ok: boolean, label: string }\n" +
          "schema Holder { r: Out }\n" +
          'let o = Holder { r: Out { ok: true, label: "x" } }\n' +
          "let v = o.r?\n" +
          "v",
      ),
      "m4",
    );
  });

  it("RED (m5): member `o.r?` over `{ ok: false, reason: \"y\" }` USER DATA rejects (currently: outcome fail, error === undefined — a forged Err)", async () => {
    await expectQuestionDefect(
      runSource(
        FM +
          "schema Res { ok: boolean, reason: string }\n" +
          "schema Holder { r: Res }\n" +
          'let o = Holder { r: Res { ok: false, reason: "y" } }\n' +
          "let v = o.r?\n" +
          "v",
      ),
      "m5",
    );
  });

  it("STATIC (m6): member `p.n?` reaching a PRIMITIVE field is refused at PARSE — the body never executes", () => {
    // Bug 0136 is the authority for this row's disposition: `#typeExpr`'s
    // `case "member"` arm answers the receiver's DECLARED field type, so `p.n`
    // types as `number` and ERR-18's parse gate decides the site. An
    // `E`-severity `theta/parse/*` denies registration, which is exactly what
    // ERR-18 states for a non-Result operand ("there is no runtime
    // disposition"), so there is no runtime path left here to guard. 0019's
    // runtime-guard subject is untouched and stays witnessed by m1–m5 and both
    // CONTROL rows, whose operands remain statically unclassifiable.
    const src = FM + "schema P { n: number }\nlet p = P { n: 5 }\nlet v = p.n?\nv";
    const source: ThetaSource = {
      path: "bug0019.theta",
      bytes: new TextEncoder().encode(src),
    };
    const doc = parseThetaDocument(source, parseDeps());
    const rendered = JSON.stringify(
      doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    );
    expect(
      doc.diagnostics.map((d) => d.code),
      `m6: the whole ordered code list is the ERR-18 gate alone; actual diagnostics=${rendered}`,
    ).toEqual([QUESTION_CODE]);
    expect(
      doc.diagnostics.map((d) => d.message),
      `m6: DIAG-4 (diagnostic-shape.md:74) — the message is the registry's *Message* column with its \`<type>\` placeholder interpolated; actual diagnostics=${rendered}`,
    ).toEqual([registeredMessage(QUESTION_CODE, "<type>", "number")]);
    expect(
      doc.diagnostics.map((d) => d.severity),
      `m6: only an error-severity diagnostic denies registration; actual diagnostics=${rendered}`,
    ).toEqual(["error"]);
    // The refusal is asserted, not merely implied by omitting the run: this
    // file's own loud parse gate throws on any error-severity diagnostic, so a
    // fixture it rejects is a fixture the load path drops and the body of which
    // never executes.
    expect(
      () => thetaOf(src),
      "m6: the loud parse gate must reject this fixture — that rejection IS the 'registration denied, body never executes' observable",
    ).toThrow(QUESTION_CODE);
  });

  it("CONTROL: `?` over a GENUINE stored Result — identifier bound to `Ok(5)` — still unwraps (green now, green after)", async () => {
    // `let r = Ok(5)` stores the RHS inferred type `named "Ok"` (an
    // unannotated binding records the initialiser's inferred type), so `r?`
    // is statically unclassified and takes m3's runtime path — but the stored
    // value IS a genuine constructor-built Result, so the stage-2 brand guard
    // must pass it through. The no-false-positive pin.
    const execution = await runSource(FM + "let r = Ok(5)\nlet v = r?\nv");

    expect(execution.outcome, "a genuine stored Ok unwraps — the body succeeds").toBe("success");
    expect(execution.result.value, "`?` yields the Ok payload").toBe(5);
  });

  it("CONTROL: `?` over a GENUINE stored Result — index route `xs[0]?` — still unwraps (green now, green after)", async () => {
    // `[Ok(1)]` stores a genuine constructor-built Result as an array element;
    // `xs[0]` reads it back BY REFERENCE, so the brand survives the read and
    // the guard must pass it through — the no-false-positive pin for the index
    // route (m2's green twin).
    //
    // The member-route twin (a schema object holding a Result field) is NOT
    // cleanly expressible: `Result` has no lowered-schema form, so a schema
    // field type `Result<…>` is rejected at parse time
    // (`theta/parse/result-in-schema-position`), and declaring the field as
    // any other type to smuggle an `Ok(…)` value in would be an ill-typed
    // fixture. The index control alone covers the by-reference-read routes.
    const execution = await runSource(FM + "let xs = [Ok(1)]\nlet v = xs[0]?\nv");

    expect(
      execution.outcome,
      "a genuine stored Ok read back through an index unwraps — the body succeeds",
    ).toBe("success");
    expect(execution.result.value, "`?` yields the Ok payload").toBe(1);
  });
});

// ===========================================================================
// The fabricated-cancellation surface chain (SLSH-3). The slash dispatch is
// `binding.surface(await executeBody(…))` (theta-composition-producer.ts), and
// the prompt-mode surface maps a fail outcome through
// `execution.error ?? makeCancelledError()` — so at HEAD the m1 forgery
// (error === undefined) is laundered into { kind: "cancelled" } and
// renderTopLevelErrNote emits "theta /bug0019 cancelled" (SNK-f) for a theta
// nobody cancelled. Post-fix that signature is IMPOSSIBLE for a non-cancelled
// theta: s1 pins that the defect rejects BEFORE surface runs, s2 pins that a
// genuine fail renders its real error (the only remaining fail inputs carry a
// defined error).
// ===========================================================================

describe("bug 0019 — the fail-surface chain never fabricates a cancellation", () => {
  it("RED (s1): the m1 defect REJECTS out of executeBody, so `binding.surface` is never fed the forged fail", async () => {
    // Mirror bindAndExecute but keep the binding handle: post-fix the
    // executeBody promise rejects, and since the dispatch feeds `surface` only
    // a RESOLVED execution, no forged fail can ever reach the
    // `?? makeCancelledError()` mapper.
    //
    // HEAD contrast (probed in the bug report at 28ce714d, unchanged at
    // 7fa76517): executeBody RESOLVES outcome "fail" / error === undefined;
    // binding.surface(execution) then yields
    // { ok: false, error: { kind: "cancelled", message: "cancelled" } } and
    // renderTopLevelErrNote renders "theta /bug0019 cancelled" — a fabricated
    // cancellation, the exact STL-6 violation the mapper's own comment
    // forbids ("NEVER fabricate a `cancelled` for a fail").
    const theta = thetaOf(M1_MEMBER);
    const deps = producer();
    const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxDouble() });
    // A prompt binding has no self-contained drive(): the SLSH-3 route IS
    // `surface(await executeBody(…))`, so the rejection below is what starves
    // the surface of the forgery.
    expect(binding.drive, "prompt-mode binds route through binding.surface").toBeUndefined();

    const execution = executeBody(theta.body, binding.executeDeps);

    await expect(
      execution,
      "s1: executeBody must reject with the ERR-18 defect — resolving would hand surface a fail with error === undefined, which it launders into a fabricated cancellation",
    ).rejects.toThrow(/ERR-18/);
    await expect(execution).rejects.toThrow("theta/parse/question-on-non-result");
  });

  it("CONTROL (s2): a GENUINE `?`-propagated Err renders its REAL error through surface + renderTopLevelErrNote — never \"cancelled\" (green now, green after)", async () => {
    // The no-regression half of the s1 pin: the surface chain stays correct
    // for real failures. A genuine Err propagation carries a DEFINED payload,
    // so `execution.error ?? makeCancelledError()` never takes its right arm —
    // pinning that the ONLY route to the SNK-f "cancelled" note for a fail
    // outcome was the forged undefined that s1 makes impossible.
    const theta = thetaOf(
      FM +
        "schema E { kind: string, message: string }\n" +
        'let v = Err(E { kind: "transport", message: "boom" })?\n' +
        "v",
    );
    const deps = producer();
    const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxDouble() });

    const execution = await executeBody(theta.body, binding.executeDeps);

    expect(execution.outcome, "a real Err propagates — the body fails").toBe("fail");
    expect(
      execution.error,
      "the propagated payload is the constructor's error — DEFINED, so the `??` fabrication arm is unreachable",
    ).toEqual({ kind: "transport", message: "boom" });

    const terminal = binding.surface(execution);
    if (terminal.ok) {
      // Loud failure, never a silent pass on a mis-shaped surface value.
      throw new Error(
        "a genuine Err propagation must surface as a fail Result at the slash boundary",
      );
    }
    const note = renderTopLevelErrNote({
      thetaName: "bug0019",
      error: terminal.error as unknown as QueryError,
      chain: [],
    });
    expect(note, "the note names the REAL leaf error (SNK-c)").toBe(
      "theta /bug0019 returned Err: transport \u2014 boom",
    );
    expect(note).not.toContain("cancelled");
  });
});
