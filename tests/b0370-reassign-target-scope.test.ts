// Bug 0370 — a reassignment's TARGET is never resolved against the scope model.
// Inside a `fn` body a write to an undeclared name or to an immutable parameter
// / loop / match binder parses clean and is silently discarded at runtime, and a
// write to a caller-scope `let mut` parses clean and LANDS across the no-closures
// activation boundary (the walk the 0016 call-site fix stopped one method over).
// (docs/bugs/0370-reassign-target-scope-unchecked-cross-boundary-writes.md)
//
// SETTLED §Fix, three layers — this file pins each layer's POST-FIX contract:
//   1. PARSE (src/parser/theta-document.ts): `walkIdentStmt` `case "reassign"`
//      currently walks only `s.value`; the fix ADDS resolution of the reassign
//      TARGET under the same scope sets reads use (fn bodies use
//      `walkCtx.roots` + params). An out-of-scope / undeclared target draws
//      `theta/parse/unknown-identifier`. And `buildReassign` records params /
//      for-vars / match-pattern binders as immutable in `this.bindings`
//      (save/restore-scoped) so a write to one draws
//      `theta/parse/immutable-rebinding` exactly as a write to an immutable
//      top-level `let` does. A known-immutable out-of-scope target (G6) stays
//      `[immutable-rebinding]` ALONE — `buildReassign` marks the reassign node
//      `immutableRebindingEmitted` in EXACTLY the branches it drew
//      `immutable-rebinding`, and the walk reads that flag as the exact signal
//      to defer its second `unknown-identifier` (a positional guess over
//      declaration order mis-fired on a redeclared name).
//   2. RUNTIME BELT (src/runtime/lexical-environment.ts,
//      src/runtime/statement-executor.ts): `writeBinding` gains an
//      `fnActivationBoundary` stop mirroring `localShadowsCallable`; the reassign
//      arm stops discarding the `WriteResult` — a rejected write after the parse
//      gates hold throws a plain `Error` routed via `surfaceUnexpectedThrow` →
//      `theta/runtime/internal-error` (the 0314/0369 belt pattern). After Layer
//      1 no parse-clean source reaches this belt, so its witness is UNIT-LEVEL.
//   3. ORDER (src/runtime/statement-executor.ts): the compound arm reads the
//      target BEFORE evaluating the RHS (matching `evalBinary` left-then-right).
//      After the fix the mutating-RHS channel is parse-refused, so this layer is
//      structural — documented at the G3/G4 rows below.
//
// TIER: unit, offline, provider-free, deterministic — the sibling b0369 /
// b0368 / b0332 shape (parseThetaDocument → createProductionProducerDeps →
// bindPromptConversation → executeBody), plus a direct-construction unit drive
// of `writeBinding` for the Layer-2 belt. No seam here needs a provider, a
// child process, or a discovery round trip: every parse verdict settles inside
// one `parseThetaDocument` over a string, every runtime value inside one
// `executeBody`, and the belt inside one `LexicalEnvironment`. An integration or
// live tier would add machinery to decisions no model and no host boundary
// participate in.
//
// ASSERTION CONTRACT: parse rows assert the AGGREGATED error-severity
// `.diagnostics` CODES (the stable registry-owned contract — the house pattern,
// cf. blockexpr-production.test.ts:533), never the message PROSE (the
// implementer's wording). The belt row routes the caught throw through the SAME
// `surfaceUnexpectedThrow` the producer frame uses and asserts the FRAMED
// disposition (`INTERNAL_ERROR_CODE` + `/^internal error: /`), never the tail
// wording. `0.370.0` is a literal version placeholder — the lane parent fills the
// real version.
//
// NO SILENT SKIPPING: parse-row fixtures are parsed with a loud precondition
// (every value control must parse clean; a rejection fails loudly naming the
// unmet precondition). The belt-ii row DELIBERATELY feeds `executeBody` a body
// the Layer-1 gate refuses (an immutable same-scope write) to reach the runtime
// belt in isolation — documented at its call site.

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
import {
  executeBody,
  type BodyExecution,
  type ExecuteBodyDeps,
  type StatementEvalHost,
} from "../src/runtime/statement-executor";
import type { Expr, ThetaBody } from "../src/parser/theta-document";
import type {
  CommittedConversationMutator,
  DrivenConversationMode,
} from "../src/runtime/terminal-outcomes";
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
import { LexicalEnvironment } from "../src/runtime/lexical-environment";

const FM = "---\nmode: prompt\n---\n";

/** The zero body range `surfaceUnexpectedThrow` frames a throw against. */
const SITE = {
  file: "b0370.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

// ===========================================================================
// Shared parse + run harness (the b0369 shape, verbatim).
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
  const source: ThetaSource = { path: "b0370.theta", bytes: new TextEncoder().encode(FM + src) };
  return parseThetaDocument(source, parseDeps());
}

/** The aggregated error-severity diagnostic codes, sorted so the assertion is
 *  order-independent (a row emitting two `unknown-identifier`s — G2 — pins the
 *  multiset, not the textual order of the read vs the write occurrence). */
function codesOf(src: string): string[] {
  return parseOnly(src)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}

/** As `codesOf`, but over a WHOLE source that carries its own frontmatter (the
 *  `params:` rows need a `params:` block, which the fixed `FM` prefix lacks). */
function codesOfFull(fullSrc: string): string[] {
  const source: ThetaSource = { path: "b0370.theta", bytes: new TextEncoder().encode(fullSrc) };
  return parseThetaDocument(source, parseDeps())
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}

const FM_PARAMS_P = "---\nmode: prompt\nparams:\n  p: integer\n---\n";

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    // The prompt-mode drive's only wait primitive is `Clock.setTimeout`; fire the
    // callback synchronously so an instant-settle turn completes deterministically
    // (the b0368/b0369 harness contract).
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

type Probe =
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };

/**
 * Bind + run a self-contained prompt-mode body, capturing a throw. `gate`
 * controls the Layer-1 parse precondition: value controls demand a clean parse
 * (a rejection is a harness breach, failed loudly); the belt-ii row disables the
 * gate so an immutable-write body — which Layer 1 refuses — still reaches the
 * runtime belt in isolation.
 */
async function probeSource(src: string, gate: "parse-clean" | "runtime-only"): Promise<Probe> {
  return probeDoc(parseOnly(src), gate);
}

/** As `probeSource`, but over a WHOLE source carrying its own frontmatter (the
 *  `params:` loud-belt residual needs a `params:` block the fixed `FM` prefix
 *  lacks). */
async function probeFull(fullSrc: string, gate: "parse-clean" | "runtime-only"): Promise<Probe> {
  const source: ThetaSource = { path: "b0370.theta", bytes: new TextEncoder().encode(fullSrc) };
  return probeDoc(parseThetaDocument(source, parseDeps()), gate);
}

async function probeDoc(
  doc: ThetaDocument,
  gate: "parse-clean" | "runtime-only",
): Promise<Probe> {
  if (gate === "parse-clean") {
    const errors = doc.diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        `fixture failed to parse clean: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
      );
    }
  }
  const theta: ThetaCompositionInput = {
    slashName: "b0370",
    sourcePath: "/proj/b0370.theta",
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

/** Assert a value control: parse-clean, the body succeeds, final value equals
 *  `expected`. Byte-identical guard — GREEN now and after the fix. */
async function assertValue(src: string, expected: ThetaValue, what: string): Promise<void> {
  const probe = await probeSource(src, "parse-clean");
  if (probe.kind === "threw") {
    expect(
      `threw ${String(probe.thrown)}`,
      `${what}: the control must succeed with value ${render(expected)}, but the runtime threw`,
    ).toBe(`success value ${render(expected)}`);
    return;
  }
  expect(probe.execution.outcome, `${what}: the body must succeed`).toBe("success");
  expect(probe.execution.result.value, `${what}: the control value (byte-identical guard)`).toEqual(
    expected,
  );
}

/**
 * Assert a runtime-loud-throw row (the Layer-2 belt): the runtime threw a plain
 * `Error` (NOT a `ThetaPanic`) that routes through `surfaceUnexpectedThrow` to
 * `internal-error`. `leak` names the silent value the current tree fabricates,
 * so the first `expect` reds NAMING it (RED-now, GREEN-after).
 */
function assertLoudThrow(probe: Probe, leak: string, what: string): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a write the scope layer rejects must throw LOUDLY, not be silently discarded (${leak})`,
    ).toBe("runtime loud throw");
    return;
  }
  expect(
    isThetaPanic(probe.thrown),
    `${what}: the loud throw is a plain Error, NOT a ThetaPanic. Thrown: ${String(probe.thrown)}`,
  ).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(probe.thrown, SITE);
  expect(diagnostic, `${what}: surfaceUnexpectedThrow returns a Diagnostic`).toBeDefined();
  const diag = diagnostic as Diagnostic;
  expect(diag.code, `${what}: routes to the existing internal-error surface`).toBe(
    INTERNAL_ERROR_CODE,
  );
  expect(
    diag.message,
    `${what}: the internal-error template prefix (tail wording is the implementer's)`,
  ).toMatch(/^internal error: /);
}

// ===========================================================================
// LAYER 1 — immutable-context write targets. A reassign to a parameter / loop
// variable / match binder must draw `theta/parse/immutable-rebinding` exactly as
// a write to an immutable top-level `let` (G8) does — not a silent runtime
// discard. RED now: HEAD walks only the reassign VALUE, and the flat
// `this.bindings` map holds no params / for-vars / match-binders, so the target
// draws nothing and the write silently no-ops.
// ===========================================================================

describe("bug 0370 G10/G11/MATCH — immutable-context write targets draw immutable-rebinding", () => {
  const rows: ReadonlyArray<readonly [string, string, string]> = [
    // G10: parameter write. HEAD parse [] / runtime value=1 (the write no-ops on
    // the immutable param slot). POST-FIX [immutable-rebinding] (Layer 1).
    ["G10", "fn f(a) { a = 3\n a }\n f(1)", "HEAD parse [] / value=1 — the param write silently no-ops"],
    // G11: for-variable write. HEAD parse [] / runtime success (loop-var write
    // no-ops). POST-FIX [immutable-rebinding] (Layer 1).
    ["G11", "for i in [1, 2] { i = 9 }\n null", "HEAD parse [] / success — the loop-var write silently no-ops"],
    // MATCH: match-arm binder write (block-expression arm form). bindings.md
    // lists match bindings as an immutable context; the §Non-goals note says the
    // scope walk covers them by construction. HEAD parse [] / runtime value=1.
    // POST-FIX [immutable-rebinding] (Layer 1). Confirms the block-expr arm form
    // parses.
    ["MATCH", "let r = match 1 { n => { n = 2\n n } }\n r", "HEAD parse [] / value=1 — the match-binder write silently no-ops"],
  ];
  for (const [id, src, head] of rows) {
    it(`RED (${id}): [immutable-rebinding] (${head})`, () => {
      expect(codesOf(src), `${id}: ${head}; post-fix Layer 1`).toEqual([
        "theta/parse/immutable-rebinding",
      ]);
    });
  }
});

// ===========================================================================
// LAYER 1 — out-of-scope / undeclared write targets. A `fn` body write to a name
// not in the closure-free body scope (undeclared, or a top-level binding invisible
// across the activation boundary) draws `theta/parse/unknown-identifier`, exactly
// as a READ of the same name already does. RED now: HEAD walks only the value.
// ===========================================================================

describe("bug 0370 G7/G9 — out-of-scope / undeclared write targets draw unknown-identifier", () => {
  const rows: ReadonlyArray<readonly [string, string, string]> = [
    // G7: undeclared target inside a fn body. HEAD parse [] / value=2 (the write
    // to the nowhere-declared `z` is silently discarded). POST-FIX
    // [unknown-identifier] (Layer 1).
    ["G7", "fn f() { z = 10\n 2 }\n f()", "HEAD parse [] / value=2 — undeclared-target write silently discarded"],
    // G9: top-level MUTABLE `x` written from inside a fn body. HEAD parse [] /
    // value=6 — the write LANDED on the top-level binding across the no-closures
    // boundary. POST-FIX [unknown-identifier] — a top-level MUTABLE target out of
    // fn scope is UNKNOWN, NOT immutable-rebinding (x is `let mut`).
    ["G9", "let mut x = 1\n fn f() { x += 5\n 2 }\n f()\n x", "HEAD parse [] / value=6 — the cross-boundary write LANDED"],
  ];
  for (const [id, src, head] of rows) {
    it(`RED (${id}): [unknown-identifier] (${head})`, () => {
      expect(codesOf(src), `${id}: ${head}; post-fix Layer 1`).toEqual([
        "theta/parse/unknown-identifier",
      ]);
    });
  }
});

// ===========================================================================
// G2 CONTROL — read/write parity. The same fn body that WRITES `count` also
// READS it on the RHS. At HEAD only the READ resolves (one unknown-identifier);
// POST-FIX the target write resolves unknown TOO, so BOTH occurrences draw
// unknown-identifier (two entries — the read at the RHS `count`, the write at the
// LHS `count`, distinct ranges, each emitted once). WHY two, not one: the fix
// walks the target under the same scope the read walk uses, and `count` (a
// top-level `let mut`) is out of the fn body's closure-free scope in both
// positions; the emitter pushes one diagnostic per occurrence. RED now: HEAD has
// exactly one (the read).
// ===========================================================================

describe("bug 0370 G2 — read/write parity: the write target resolves unknown like the read", () => {
  it("RED (G2): both the RHS read and the LHS write of out-of-scope `count` draw unknown-identifier (HEAD parse [unknown-identifier] — the READ alone)", () => {
    expect(
      codesOf("let mut count = 0\n fn bump() { count = count + 1\n null }\n bump()\n null"),
      "G2: HEAD parse [unknown-identifier] (the read); post-fix read+write parity → two entries",
    ).toEqual(["theta/parse/unknown-identifier", "theta/parse/unknown-identifier"]);
  });
});

// ===========================================================================
// G6 CONTROL (CRITICAL — the immutableRebindingEmitted defer). A top-level
// immutable `let x` written from inside a fn body stays [immutable-rebinding]
// ALONE both now and after. This pins that `buildReassign`'s
// `immutableRebindingEmitted` flag suppresses a SPURIOUS second
// `unknown-identifier` for a known-immutable out-of-scope target — the write
// draws immutable-rebinding (the flat map resolves the top-level `let`), and the
// scope walk defers to the flag rather than also refusing it as unknown. Byte-
// identical: GREEN now and after. If it reds POST-FIX with a second
// unknown-identifier entry, the defer regressed.
// ===========================================================================

describe("bug 0370 G6 — known-immutable out-of-scope target stays [immutable-rebinding] alone", () => {
  it("CONTROL (G6): [immutable-rebinding] alone — the immutableRebindingEmitted flag suppresses a second unknown-identifier", () => {
    expect(
      codesOf("let x = 1\n fn f() { x = 10\n 2 }\n f()\n x"),
      "G6: the G6-defer — immutable-rebinding alone, no spurious unknown-identifier",
    ).toEqual(["theta/parse/immutable-rebinding"]);
  });
});

// ===========================================================================
// FIX-A WITNESS — the exact `immutableRebindingEmitted` flag vs the replaced
// positional guess. Two shapes the positional heuristic decided WRONG because it
// keyed on declaration order alone; the flag reads what `buildReassign` actually
// emitted, so both settle correctly.
// ===========================================================================

describe("bug 0370 FIX A — the immutableRebindingEmitted flag fixes redeclaration and sibling-leak", () => {
  it("WITNESS (redeclaration-fn-body): a redeclared name shadowed by `let mut`, then written from a fn body, draws [unknown-identifier]", () => {
    // `let y` / `let mut y` / `fn f() { y = 3 }`: the positional map recorded the
    // FIRST immutable `let y` and wrongly deferred the walk's refusal, so the
    // write went parse-silent and hit the runtime belt (internal-error). By the
    // time `buildReassign` reaches `y = 3` its file-linear map holds the
    // shadowing `let mut y` (mutable), so it draws nothing and leaves the flag
    // unset — the walk now correctly refuses the out-of-scope write.
    expect(
      codesOf("let y = 1\n let mut y = 2\n fn f() { y = 3\n 4 }\n f()"),
      "redeclaration-fn-body: shadowing `let mut` → no flag → walk refuses (no parse-silent belt hit)",
    ).toEqual(["theta/parse/unknown-identifier"]);
  });

  it("CONTROL (redeclaration-same-scope): the same redeclaration written in the same top-level scope stays [] (byte-identical mutable write)", () => {
    // Same file, but the write is a same-scope top-level `y = 3` against the
    // shadowing `let mut y` — a writable mutable target. No refusal at either
    // layer; byte-identical to the pre-fix accept.
    expect(
      codesOf("let y = 1\n let mut y = 2\n y = 3\n y"),
      "redeclaration-same-scope: mutable same-scope write stays clean",
    ).toEqual([]);
  });

  it("WITNESS (sibling-fn-leak): a write to a name that never escapes a SIBLING fn body draws [unknown-identifier] (0386 block-scoping)", () => {
    // PARENT RATIFICATION (bug 0386 Phase 2): "(F2) the sibling-fn-leak WITNESS
    // cell flips [immutable-rebinding] → [unknown-identifier] — w is genuinely
    // out of f's scope." Bug 0386 block-scopes `this.bindings` around every
    // `parseBlock` (which a `fn` body is, whole-body), so `g`'s local `let w`
    // no longer survives past `g`'s closing `}`; `buildReassign` sees `w` as
    // UNDECLARED in `f` and draws nothing. The write is still correctly
    // refused — now for the honest reason: `w` is genuinely out of `f`'s
    // closure-free scope (functions.md:20, FN-1), so the ident walk refuses it
    // as unknown, not as a rebinding of a leaked immutable. The cell still
    // witnesses that the sibling-fn write is refused; only the diagnostic code
    // (and the reason it names) changed.
    expect(
      codesOf("fn g() { let w = 1 }\n fn f() { w = 2\n 3 }\n f()"),
      "sibling-fn-leak: w does not leak past g's `}`; f's write to w is refused as unknown-identifier",
    ).toEqual(["theta/parse/unknown-identifier"]);
  });
});

// ===========================================================================
// G8 + SAME-SCOPE CONTROLS. G8 is a same-scope immutable write (the pre-existing
// refusal); the two same-scope `let mut` writes are untouched by the fix (the
// §Fix constraint: "same-scope writes stay byte-identical"). All GREEN now and
// after.
// ===========================================================================

describe("bug 0370 G8 + same-scope controls — untouched by the fix", () => {
  it("CONTROL (G8): same-scope immutable write draws [immutable-rebinding], byte-identical", () => {
    expect(codesOf("let x = 1\n x = 2"), "G8: pre-existing same-scope refusal, unchanged").toEqual([
      "theta/parse/immutable-rebinding",
    ]);
  });

  it("CONTROL (same-scope simple): `let mut x = 1\\n x = 2\\n x` parses clean and evaluates to 2", async () => {
    expect(codesOf("let mut x = 1\n x = 2\n x"), "same-scope simple: parses clean").toEqual([]);
    await assertValue("let mut x = 1\n x = 2\n x", 2, "same-scope simple");
  });

  it("CONTROL (same-scope compound): `let mut x = 1\\n x += 5\\n x` parses clean and evaluates to 6", async () => {
    expect(codesOf("let mut x = 1\n x += 5\n x"), "same-scope compound: parses clean").toEqual([]);
    await assertValue("let mut x = 1\n x += 5\n x", 6, "same-scope compound");
  });
});

// ===========================================================================
// 0303 CONTROL — the boundary stop must not break intra-`fn`-body writes. A full
// imported-`.thetalib` fixture (checkThetaImports + a FileSystem double, the
// b0303-imported-fn-body-declaring-scope.test.ts harness) is heavier than this
// offline row needs: bug 0303's `moduleEnv` threading is a RESOLUTION (read)
// mechanism, and the §Non-goals note records that lib bodies "hold only
// declarations" — so no lib-fn reassign-WRITE path exists to break, and the
// boundary stop is structurally safe. The narrower in-tree invariant the stop
// MUST preserve is that a write to a `let mut` declared INSIDE the same fn
// activation is still accepted (the same-scope rule, one activation frame in) —
// the only write form a fn body can hold. HEAD parse [] / value=2; POST-FIX
// unchanged. GREEN now and after; a red would mean the boundary stop over-reached
// into the fn's own locals.
// ===========================================================================

describe("bug 0370 0303 control — a fn body's own-local write survives the boundary stop", () => {
  it("CONTROL (0303): `fn f() { let mut y = 1\\n y = y + 1\\n y }\\n f()` parses clean and evaluates to 2", async () => {
    const src = "fn f() { let mut y = 1\n y = y + 1\n y }\n f()";
    expect(codesOf(src), "0303 control: fn-body own-local write parses clean").toEqual([]);
    await assertValue(src, 2, "0303 control");
  });
});

// ===========================================================================
// LAYER 2 — the runtime belt (unit-level). After Layer 1, NO parse-clean source
// reaches this belt (G7/G10/G11's input classes are now parse-refused), so the
// belt is driven directly.
//
// (i) `writeBinding` across an `fnActivationBoundary`: a name that exists only in
//     a caller frame must NOT be found from inside the activation. HEAD: the walk
//     crosses the boundary and mutates the caller's slot ({accepted:true}, the
//     slot changes). POST-FIX: the boundary stop mirrors `localShadowsCallable`
//     → {accepted:false}, the caller's slot unchanged. RED now.
// (ii) the executor reassign arm on a rejected write: a rejected `WriteResult`
//     reaching the arm after the gates hold must throw loudly, not be discarded.
//     HEAD: the arm discards the result → success. POST-FIX: throws →
//     internal-error. RED now. Driven with an immutable same-scope write (the
//     `runtime-only` gate — Layer 1 refuses this body at parse, but the runtime
//     belt is the back-stop for any rejected write that reaches the arm).
// ===========================================================================

describe("bug 0370 Layer-2 belt (i) — writeBinding honours the fn activation boundary", () => {
  it("RED (belt-i): a cross-boundary write is rejected (HEAD: it lands on the caller's slot, {accepted:true})", () => {
    const root = new LexicalEnvironment({ body: { statements: [], tail: null } });
    root.defineLocal("x", 1, true); // a caller-frame `let mut x`
    const fnScope = root.childFnActivation(); // the no-closures activation boundary
    const result = fnScope.writeBinding("x", 99);
    // POST-FIX: the boundary stop makes the caller's `x` invisible to the write.
    expect(
      result.accepted,
      "belt-i: a fn-body write to a caller-frame binding is rejected (no cross-boundary capture)",
    ).toBe(false);
    // And the caller's slot must be untouched (HEAD mutates it to 99).
    expect(root.resolve("x").value, "belt-i: the caller's slot is left unchanged").toEqual(1);
  });

  it("CONTROL (belt-i-own): a write to the activation's OWN local is accepted, byte-identical", () => {
    const root = new LexicalEnvironment({ body: { statements: [], tail: null } });
    const fnScope = root.childFnActivation();
    fnScope.defineLocal("y", 1, true); // a local declared inside the activation
    const result = fnScope.writeBinding("y", 5);
    expect(result.accepted, "belt-i-own: same-activation write stays accepted").toBe(true);
    expect(fnScope.resolve("y").value, "belt-i-own: the own local updates").toEqual(5);
  });
});

describe("bug 0370 Layer-2 belt (ii) — the reassign arm throws on a rejected write", () => {
  it("RED (belt-ii): a rejected (immutable-slot) write throws → internal-error (HEAD: the WriteResult is discarded, success value=1)", async () => {
    // The `runtime-only` gate feeds `executeBody` a body Layer 1 refuses (an
    // immutable same-scope write) so the rejected `WriteResult` reaches the arm
    // in isolation — the exact class the belt back-stops.
    const probe = await probeSource("let x = 1\n x = 2\n x", "runtime-only");
    assertLoudThrow(probe, "HEAD value=1 — the rejected write was silently discarded", "belt-ii");
  });
});

// ===========================================================================
// FIX-B — doc-faithful loud-belt residuals (rejected write AFTER the gates hold).
// Two input classes parse `[]` — the Layer-1 gates correctly HOLD: the target
// is in scope, declared, and not a parse-distinguishable immutable context, so
// neither `buildReassign` nor the ident walk has grounds to refuse. Both are
// one family: an immutable-or-non-writable write target the scope-blind FLAT
// `this.bindings` map (docs/bugs/0370-…md §Affected: "no fn/loop scoping")
// cannot statically distinguish from a genuinely writable one — a non-writable
// root (callable slot) and a `params:` field shadowed by a top-level `let mut`
// of the same name. Their write is rejected only at RUNTIME (a callable slot /
// a cross-activation caller binding), where the settled §Fix routes it to the
// LOUD Layer-2 belt: doc §Fix Layer 2 — "a rejected write AFTER THE GATES HOLD
// throws a loud defect routed to theta/runtime/internal-error"; Layer 1
// refuses only out-of-scope/undeclared and the bindings.md:29-34 immutable
// contexts, NONE of which these are. This is the intended disposition (theta
// un-registers/errors LOUDLY), NOT the pre-fix silent no-op — refusing them at
// parse would invent a fourth Layer-1 gate the §Fix does not specify. These
// cells pin parse `[]` AND the loud-belt routing.
//
// A THIRD class — the dead block-scoped `let mut` shadow of an outer
// immutable `let` — was recorded here as a loud-belt residual too, but bug
// 0386 SUPERSEDES that disposition: block-scoping `this.bindings` around
// every `parseBlock` means the dead block's `let mut` no longer leaks past
// its `}`, so the outer immutable `let` is restored and the later write is
// now refused AT PARSE with `theta/parse/immutable-rebinding` (see the cell
// below) instead of reaching the runtime belt. The other two residuals
// (non-writable root, params-shadow) are unaffected — neither involves a
// block-scoped `let` leak — and remain loud-belt residuals unchanged.
// ===========================================================================

describe("bug 0370 — doc-faithful loud-belt residuals (rejected write after the gates hold)", () => {
  it("RESIDUAL (non-writable root): `fn g() { 1 }` / `g = 5` parses [] and drives to internal-error", async () => {
    // A write to an in-scope but non-writable root (a top-level `fn` name here;
    // an imported symbol or a `tools:` callable behave identically). The name IS
    // in scope and declared, so Layer 1's gates hold and parse is `[]`; the
    // runtime rejects the write to the callable slot and the belt throws loudly.
    const src = "fn g() { 1 }\n g = 5\n null";
    expect(codesOf(src), "non-writable root: Layer-1 gates hold — in scope, declared").toEqual([]);
    const probe = await probeSource(src, "parse-clean");
    assertLoudThrow(
      probe,
      "a write to a callable slot is the doc §Fix Layer-2 loud belt, not a silent no-op",
      "residual/non-writable-root",
    );
  });

  it("RESIDUAL (params field shadowed by top-level `let mut`, written from a fn body): parses [] and drives to internal-error", async () => {
    // A `params:` field written from a fn body while a top-level `let mut` of the
    // same name shadows it file-linearly. The name is in scope (the `params:`
    // field seeds it) and declared, and the fn-body write is not a
    // parse-distinguishable immutable context, so Layer 1's gates hold and parse
    // is `[]`. The top-level `let mut` lives in the caller frame, invisible
    // across the no-closures activation boundary, so the runtime rejects the
    // write and the belt throws loudly — the doc §Fix Layer-2 disposition.
    const full = `${FM_PARAMS_P}let mut p = 1\n fn f() { p = 5\n 2 }\n f()\n`;
    expect(
      codesOfFull(full),
      "params-shadow residual: Layer-1 gates hold — in scope, declared, no parse-visible immutable context",
    ).toEqual([]);
    const probe = await probeFull(full, "parse-clean");
    assertLoudThrow(
      probe,
      "a cross-activation write to the caller's `let mut` is the doc §Fix Layer-2 loud belt, not a silent no-op",
      "residual/params-shadow",
    );
  });

  it("RESIDUAL (dead block-shadow: a block-scoped `let mut` no longer leaks) is refused at parse with [immutable-rebinding] (0386 block-scoping)", () => {
    // PARENT RATIFICATION (bug 0386 Phase 2): "(F1) the dead-block-shadow
    // RESIDUAL cell flips from parse-clean-[]-plus-runtime-belt to the parse
    // refusal [theta/parse/immutable-rebinding]." Bug 0386 block-scopes
    // `this.bindings` around every `parseBlock`, so the dead block's
    // `let mut x` shadow of the outer immutable `let x` ends at its own `}`:
    // the outer immutable entry is restored exactly as it was before the
    // block, and the later top-level `x = 3` now targets that restored
    // immutable outer binding. `buildReassign` sees the correct (immutable)
    // mutability for the live target and refuses the write AT PARSE — this
    // is 0370's Residual 1(c) "clean-parse-refusal ideal", which needed
    // block-scoping the flat mutability map; that landed as bug 0386. The
    // write no longer reaches runtime, so the belt drive is removed (a
    // `probeSource(..., "parse-clean")` would throw on non-empty
    // diagnostics). The cell's subject is unchanged: a dead-block `let mut`
    // shadow does NOT license writing the immutable outer `let`.
    const src = "let x = 1\nif true { let mut x = 2 }\nx = 3\nx";
    expect(
      codesOf(src),
      "dead-block-shadow: block-scoping restores the outer immutable `let x` after `}`; `x = 3` is refused at parse",
    ).toEqual(["theta/parse/immutable-rebinding"]);
  });
});

// ===========================================================================
// LAYER 3 — compound operand ORDER (structural). At HEAD the desugar
// bindings.md#compound-assignment-desugar is observably FALSE: through the
// cross-boundary write channel (facet b), `x += f()` yields 12 while the
// normative `x = x + f()` yields 3 (12 ≠ 3), because the compound arm evaluates
// the RHS before reading the target. The fix's Layer 3 reorders the arm
// (target-before-RHS), but Layer 1 already CLOSES the channel that made a
// target-mutating RHS reachable: the fn body's cross-boundary write `x = 10` is
// now parse-refused, so G3/G4 both draw [unknown-identifier] and the divergence
// is unreachable from parse-clean source. These rows pin that closure (RED now:
// HEAD parse [] for both). The order reorder itself is defense-in-depth for any
// FUTURE channel and is not reachable end-to-end from parse-clean source
// post-fix — pinned structurally here rather than weakened into a synthetic
// mutating-RHS drive.
// ===========================================================================

describe("bug 0370 G3/G4 — the desugar-divergence channel is closed at parse (Layer 1 subsumes Layer 3 end-to-end)", () => {
  const rows: ReadonlyArray<readonly [string, string, string]> = [
    ["G3", "let mut x = 1\n fn f() { x = 10\n 2 }\n x += f()\n x", "HEAD parse [] / value=12"],
    ["G4", "let mut x = 1\n fn f() { x = 10\n 2 }\n x = x + f()\n x", "HEAD parse [] / value=3"],
  ];
  for (const [id, src, head] of rows) {
    it(`RED (${id}): [unknown-identifier] refuses the cross-boundary fn-body write (${head}; 12 ≠ 3 at HEAD)`, () => {
      expect(codesOf(src), `${id}: ${head}; the mutating-RHS channel is parse-refused post-fix`).toEqual([
        "theta/parse/unknown-identifier",
      ]);
    });
  }
});

// ===========================================================================
// ROUND-1 COVERAGE GAPS (F1–F6). The Layer-1 belt discipline requires every
// statically-decidable rejection be refused at parse; these are the input
// classes the first pass left parse-clean, so a write reached the runtime
// `internal-error` belt where the settled §Fix intends a clean PARSE refusal.
// Each row pins the CLASS-1 (immutable-context write → immutable-rebinding) or
// CLASS-2 (out-of-scope / type-only target → unknown-identifier) disposition,
// red-capable against a regression to the parse-silent state.
// ===========================================================================

describe("bug 0370 F1 — a `par for` iteration variable write draws immutable-rebinding", () => {
  it("CLASS 1 (F1): a write to the `par for` variable draws [immutable-rebinding]", () => {
    expect(
      codesOf("par for i in [1, 2] { i = 9 }\n null"),
      "F1: a `par for` variable is a `for` iteration variable (bindings.md:32), an immutable context",
    ).toEqual(["theta/parse/immutable-rebinding"]);
  });

  it("CLASS 1 (F1 shadow): a `par for` variable shadowing an outer `let mut` draws [immutable-rebinding] ALONE — NOT a par-shared-mutation double", () => {
    // The loop-variable write targets the fresh per-iteration immutable binding,
    // not the shadowed outer mutable, so only `immutable-rebinding` fires; a
    // `par-shared-mutation` beside it would be a double-code on the wrong slot.
    expect(
      codesOf("let mut x = 1\n par for x in [1, 2] { x = 9 }\n null"),
      "F1 shadow: single immutable-rebinding, no par-shared-mutation double",
    ).toEqual(["theta/parse/immutable-rebinding"]);
  });
});

describe("bug 0370 F2 — a write BEFORE its top-level immutable `let` (declaration-order-reversed) draws unknown-identifier", () => {
  const rows: ReadonlyArray<readonly [string, string]> = [
    // Top-level write before the `let`: `buildReassign` (file-linear) has no `y`
    // yet, so it draws nothing and leaves `immutableRebindingEmitted` unset; the
    // walk must therefore NOT defer its `unknown-identifier` here (else the write
    // is parse-silent and reaches the belt).
    ["F2 top", "y = 1\n let y = 2\n y"],
    // Fn-body write to a top-level immutable `let` declared AFTER the fn:
    // likewise `buildReassign`-silent, so the walk must refuse it.
    ["F2 fn-body", "fn f() { y = 2\n 3 }\n let y = 1\n f()"],
  ];
  for (const [id, src] of rows) {
    it(`CLASS 2 (${id}): [unknown-identifier] — the order-reversed write is not deferred`, () => {
      expect(codesOf(src), `${id}: the flag defer refuses a write before its \`let\``).toEqual([
        "theta/parse/unknown-identifier",
      ]);
    });
  }
});

describe("bug 0370 F3 — a `params:` field write draws immutable-rebinding", () => {
  it("CLASS 1 (F3 top-level): a top-level write to a `params:` field draws [immutable-rebinding]", () => {
    expect(
      codesOfFull(`${FM_PARAMS_P}p = 5\n`),
      "F3: a `params:` field is a parameter (bindings.md:31), an immutable context",
    ).toEqual(["theta/parse/immutable-rebinding"]);
  });

  it("CLASS 1 (F3 fn-body): a fn-body write to a `params:` field draws [immutable-rebinding]", () => {
    expect(
      codesOfFull(`${FM_PARAMS_P}fn f() { p = 5\n 2 }\n f()\n`),
      "F3: whole-file `params:` field seed reaches into the fn body's closure-free scope",
    ).toEqual(["theta/parse/immutable-rebinding"]);
  });

  it("CONTROL (F3 shadow): a `let mut p` in body SHADOWS the `params:` field — its write stays clean", () => {
    // The seed is immutable, but a body `let mut` overwrites it file-linearly,
    // so the shadowing mutable write must NOT draw immutable-rebinding.
    expect(
      codesOfFull(`${FM_PARAMS_P}let mut p = 1\n p = 2\n p\n`),
      "F3 shadow: a shadowing `let mut` write stays writable (byte-identical)",
    ).toEqual([]);
  });
});

describe("bug 0370 F4 — a `_` discard reassignment target draws immutable-rebinding", () => {
  it("CLASS 1 (F4): `_ = 5` draws [immutable-rebinding] ALONE (the walk's `_` exemption stays silent)", () => {
    expect(
      codesOf("_ = 5\n null"),
      "F4: `_` cannot be reassigned (bindings.md:34); single immutable-rebinding, no walk double",
    ).toEqual(["theta/parse/immutable-rebinding"]);
  });
});

describe("bug 0370 F6 — a type-only-named reassign TARGET draws unknown-identifier, not type-as-value", () => {
  it("CLASS 2 (F6 target): a fn-body write to a `schema`-named target draws [unknown-identifier]", () => {
    // A write TARGET is not a value read; a type-only name there resolves to no
    // value binding to write, so unknown-identifier — never the read-position
    // type-as-value.
    expect(
      codesOf("schema S { a: integer }\n fn f() { S = 1\n 2 }\n f()"),
      "F6 target: reassign-target position routes to unknown-identifier",
    ).toEqual(["theta/parse/unknown-identifier"]);
  });

  it("CONTROL (F6 read): a `schema`-named VALUE read stays [type-as-value], byte-identical", () => {
    expect(
      codesOf("schema S { a: integer }\n let x = S\n x"),
      "F6 read: the read-position type-as-value is unchanged",
    ).toEqual(["theta/parse/type-as-value"]);
  });
});

// ===========================================================================
// LAYER 3 (unit) — the compound arm's operand ORDER, observed directly. The
// end-to-end G3/G4 channel is parse-closed by Layer 1, so this unit cell is the
// live witness that the arm reads the TARGET before evaluating the RHS. A
// direct-construction drive (the belt-i pattern) over a host double whose PURE
// RHS evaluation observably mutates the target slot: `x += <rhs>` yields
// target-first 3 (current = 1 read BEFORE the RHS mutates x→0) and RHS-first 12
// (the pre-fix order) — the same 3-vs-12 divergence the bug's G3/G4 witness, now
// isolated to the arm. RED-capable: swap the two reads back and it reds with 12.
// ===========================================================================

const NOOP_ORDER_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(): void {},
};

describe("bug 0370 Layer-3 order (unit) — the compound arm reads the target BEFORE evaluating the RHS", () => {
  it("RED-capable (order): a target-mutating RHS yields target-first 3, not RHS-first 12", async () => {
    const env = new LexicalEnvironment({ body: { statements: [], tail: null } });
    env.defineLocal("x", 1, true); // `let mut x = 1`

    // The RHS node's own content is inert — the host double returns 2 for it
    // regardless; only its evaluation ORDER relative to the target read matters.
    const rhs: Expr = { kind: "number", text: "0", numericType: "integer", range: SITE.range };
    const host: StatementEvalHost = {
      // A `null` checkpoint routes the RHS through `evaluatePure`, whose double
      // mutates the target slot mid-evaluation (x→10) so the arm's read/eval
      // order is observable, then returns 2.
      checkpointFor: (): null => null,
      evaluatePure: (): ThetaValue => {
        env.writeBinding("x", 10);
        return 2;
      },
      runEffect: (): never => {
        throw new Error("no effect runs in this order witness — runEffect must not be reached");
      },
    };

    const body: ThetaBody = {
      statements: [{ kind: "reassign", target: "x", op: "+=", value: rhs, range: SITE.range }],
      tail: null,
    };
    const deps: ExecuteBodyDeps = {
      env,
      host,
      checkpoint: { before: (): Promise<void> => Promise.resolve() },
      signal: new AbortController().signal,
      mutator: NOOP_ORDER_MUTATOR,
      mode: "prompt" as DrivenConversationMode,
      file: "b0370.theta",
    };

    const execution = await executeBody(body, deps);
    expect(execution.outcome, "order: the arm completes successfully").toBe("success");
    expect(
      env.resolve("x").value,
      "order: target read BEFORE RHS eval → 1 + 2 = 3 (RHS-first order reds with 12)",
    ).toEqual(3);
  });
});
