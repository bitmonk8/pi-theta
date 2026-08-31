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
import { executeBody, type ExecuteBodyDeps } from "../src/runtime/statement-executor";
import type { ThetaValue } from "../src/runtime/value";
import { makeOk } from "../src/runtime/value";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint, CheckpointSite } from "../src/seams/checkpoint";
import {
  createEffectfulStatementHost,
  type EffectfulStatementHostDeps,
  type QueryHostDispatch,
} from "../src/runtime/effectful-statement-host";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import type { DrivenConversationMode } from "../src/runtime/terminal-outcomes";
import type {
  CommittedConversationMutator,
  CommittedSurface,
} from "../src/runtime/terminal-outcomes";
import type {
  ForcedRespondTurn,
  FreePhaseTurn,
  QueryModelDriver,
  QueryToolLoopConfig,
} from "../src/runtime/query-tool-loop";
import type { CommittedSideEffect } from "../src/runtime/no-rollback";
import type { CodeSideToolCall, ToolLoweringSink } from "../src/runtime/tool-call-execute";
import type { InvokeChild } from "../src/runtime/invoke-cancellation";
import type { Expr } from "../src/parser/theta-document";

// Bug 0316 — a `match` whose scrutinee is spelled inline as an array literal,
// object constructor, or nested `match` dispatches over a forged `Ok(<value>)`
// instead of the raw value, so array/object/literal arms are dead and the
// wildcard (or an `Ok(p)` pattern) silently wins; the same value hoisted through
// a `let` binding matches correctly.
//
// Root cause: `evalAsResult` bullet-1 (src/runtime/statement-executor.ts:1180,
// bullet at :1119–:1132) unconditionally normalises the operand value via
// `asResultValue(inner.value)` (:1132) for kinds try / match / object / array /
// user-`fn` `call`; `asResultValue` (:1194) wraps every non-`Result` in `makeOk`.
// `evalMatch` (:1238) obtains its scrutinee through that same `evalAsResult`
// (:1244), so a match over one of those inline kinds dispatches over the forged
// `Ok(<value>)`. The bullet-2 operator path and the pure ident/literal path
// return raw values, which is why a `let`-hoisted scrutinee behaves.
// (docs/bugs/0316-match-scrutinee-inline-composite-ok-wrapped.md)
//
// PARENT-RATIFIED REMEDY — Option 2 with a fn-call boundary (release 0.295.0).
// This file encodes the ratified witness table below, NOT the bug document's
// original Expected column. The object / array / try / match scrutinee kinds
// DROP the `Ok` wrap in match-scrutinee position; the user-`fn` `call` kind
// KEEPS the wrap under bug 0017's landed CONV-6 fn-call-boundary convention.
// The flip set is therefore ONLY W1 / W2 / W6 / W7. W3 / W8 are positional
// controls; W4 / W5 are rewritten as controls that PIN the 0017 fn-call-boundary
// contract (they stay wrapped and keep their current value).
//
// RATIFIED WITNESS TABLE (Observed = current HEAD; Fixed = the contract pinned):
//   W1  WITNESS  match [1, 2] { [a, b] => a, _ => -1 }               -1        -> 1
//   W2  WITNESS  match [1, 2] { Ok(inner) => "wrapped", _ => "raw" } "wrapped" -> "raw"
//   W3  CONTROL  let xs = [1,2]; match xs { [a, b] => a, _ => -1 }   1          = 1
//   W4  CONTROL  fn f():string{"num"}; match f(){ "num" => ..}       "other"    = "other"  (0017 fn-call boundary)
//   W5  CONTROL  fn g():integer{42}; match g(){ Ok(inner)=>inner }   42         = 42       (0017 fn-call boundary)
//   W6  WITNESS  schema P{a:integer}; match (P{a:7}){ P{a}=>a }      -1        -> 7
//   W7  WITNESS  match (match 1 { _ => 2 }) { 2 => "two", _ => "no" } "no"     -> "two"
//   W8  CONTROL  fn g():integer{42}; let x=g(); match x { 42 => .. } "num"      = "num"
//   EFFECT CONTROL  match @`q` { Ok(x)=>111, Err(e)=>222 }           111        = 111
//
// W4 / W5 are 0017-contract controls, not flips. The user-`fn` call KEEPS the
// CONV-6 `Ok` wrap around its FN-5 return value (functions.md FN-5), so in W4
// `Ok("num")` cross-types the literal `"num"` arm and falls to the wildcard
// ("other"), and in W5 `Ok(inner)` matches the wrap and binds `inner=42`. Both
// are ratified as fn-call-boundary controls — they must stay green now and
// after the fix; a flip in either is the fix over-reaching past the boundary.
//
// W6 requires parens around the constructor in scrutinee position
// (expressions.md:146 — struct-expression-in-scrutinee ambiguity rule).
// W2's `Ok(p)` over a plain array literal is the forgery witness: per bug 0017's
// brand discipline an `Ok` pattern matches only constructor-built `Result`s
// (runtime-value-model.md:14), yet at HEAD it matches a value the author wrote
// as `[1, 2]`.
//
// RED-FOR-RIGHT-REASON: each witness `it` states its Observed (RED) value and
// its Fixed (GREEN) value in the assertion message. W1 / W2 / W6 / W7 are RED
// against HEAD; W3 / W4 / W5 / W8 and the EFFECT control are GREEN against HEAD
// and must stay green.

// ===========================================================================
// Shared parse + production-executor harness (the b0314 pattern, verbatim in
// shape): parseThetaDocument -> createProductionProducerDeps ->
// bindPromptConversation -> executeBody. Offline, provider-free, deterministic.
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
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. Every row
 * is parse-clean at HEAD by the bug's §Reproduction (diagnostics `[]`), so a
 * rejection here is a harness precondition breach, never a silent skip.
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

/** Parse + run a self-contained query-free prompt-mode body and return its final value. */
async function runValue(src: string): Promise<ThetaValue | undefined> {
  const doc = parseTheta("b0316.theta", FM + src);
  const theta: ThetaCompositionInput = {
    slashName: "b0316",
    sourcePath: "/proj/b0316.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  const execution = await executeBody(theta.body, binding.executeDeps);
  expect(execution.outcome, "the body must succeed").toBe("success");
  return execution.result.value;
}

// ===========================================================================
// W1 — WITNESS. `match [1, 2] { [a, b] => a, _ => -1 }` dispatches over the raw
// array, so `[a, b]` binds a=1. RED at HEAD: the array literal is Ok-wrapped, the
// array pattern cross-types against a `Result`, the wildcard wins, value = -1.
// ===========================================================================

describe("bug 0316 W1 — inline array-literal scrutinee matches its array pattern", () => {
  it("RED (W1): `match [1, 2] { [a, b] => a, _ => -1 }` yields 1, not -1", async () => {
    expect(
      await runValue("let v = match [1, 2] { [a, b] => a, _ => -1 }\nv"),
      "W1: RED shows -1 (array literal Ok-wrapped, [a,b] cross-types the Result, wildcard wins); GREEN shows 1",
    ).toBe(1);
  });
});

// ===========================================================================
// W2 — WITNESS (forgery). `Ok(p)` matches only constructor-built `Result`s
// (0017 brand discipline, runtime-value-model.md:14). RED at HEAD: the array
// literal is Ok-wrapped, so `Ok(inner)` matches a value the author never wrapped
// and the result is "wrapped".
// ===========================================================================

describe("bug 0316 W2 — an `Ok(p)` arm does not match a plain array-literal scrutinee", () => {
  it('RED (W2): `match [1, 2] { Ok(inner) => "wrapped", _ => "raw" }` yields "raw", not "wrapped"', async () => {
    expect(
      await runValue('let v = match [1, 2] { Ok(inner) => "wrapped", _ => "raw" }\nv'),
      'W2: RED shows "wrapped" (forged Ok wrap caught by the Ok(inner) arm); GREEN shows "raw"',
    ).toBe("raw");
  });
});

// ===========================================================================
// W3 — CONTROL. The same array value hoisted into a `let` matches correctly at
// HEAD and after: the ident scrutinee takes the pure path (no Ok wrap). GREEN
// now and after. Proves the divergence is positional.
// ===========================================================================

describe("bug 0316 W3 — let-hoisted array scrutinee (positional control)", () => {
  it("CONTROL (W3): `let xs = [1, 2]` / `match xs { [a, b] => a, _ => -1 }` yields 1", async () => {
    expect(
      await runValue("let xs = [1, 2]\nlet v = match xs { [a, b] => a, _ => -1 }\nv"),
      "W3: GREEN now and after — a let-hoisted scrutinee is not Ok-wrapped",
    ).toBe(1);
  });
});

// ===========================================================================
// W4 — CONTROL (0017 fn-call boundary; ratified 0.295.0). The user-`fn` call KEEPS
// the CONV-6 `Ok` wrap around its FN-5 return value, so `Ok("num")` cross-types
// the literal `"num"` arm and falls to the wildcard. GREEN now and after; a flip
// to "num" would be the fix over-reaching past the fn-call boundary.
// ===========================================================================

describe("bug 0316 W4 — fn-call scrutinee keeps the CONV-6 wrap (0017 boundary control)", () => {
  it('CONTROL (W4): `fn f(): string { "num" }` / `match f() { "num" => "num", _ => "other" }` yields "other"', async () => {
    expect(
      await runValue('fn f(): string { "num" }\nlet v = match f() { "num" => "num", _ => "other" }\nv'),
      'W4: GREEN now and after — the fn call keeps the Ok wrap, so Ok("num") misses the literal arm (0017 CONV-6)',
    ).toBe("other");
  });
});

// ===========================================================================
// W5 — CONTROL (0017 fn-call boundary; ratified 0.295.0). `Ok(inner)` matches the
// CONV-6 wrap around the fn's tail; `inner` binds 42. GREEN now and after.
// ===========================================================================

describe("bug 0316 W5 — fn-call scrutinee's wrap is matched by Ok(inner) (0017 boundary control)", () => {
  it("CONTROL (W5): `fn g(): integer { 42 }` / `match g() { Ok(inner) => inner, _ => -1 }` yields 42", async () => {
    expect(
      await runValue("fn g(): integer { 42 }\nlet v = match g() { Ok(inner) => inner, _ => -1 }\nv"),
      "W5: GREEN now and after — the fn call keeps the Ok wrap, so Ok(inner) binds 42 (0017 CONV-6)",
    ).toBe(42);
  });
});

// ===========================================================================
// W6 — WITNESS. An inline object-constructor scrutinee (parens required per
// expressions.md:146) matches its object pattern. RED at HEAD: the constructed
// value is Ok-wrapped, `P { a }` cross-types the Result, wildcard wins, -1.
// ===========================================================================

describe("bug 0316 W6 — inline object-constructor scrutinee matches its object pattern", () => {
  it("RED (W6): `match (P { a: 7 }) { P { a } => a, _ => -1 }` yields 7, not -1", async () => {
    expect(
      await runValue("schema P { a: integer }\nlet v = match (P { a: 7 }) { P { a } => a, _ => -1 }\nv"),
      "W6: RED shows -1 (constructed value Ok-wrapped, P{a} cross-types the Result, wildcard wins); GREEN shows 7",
    ).toBe(7);
  });
});

// ===========================================================================
// W7 — WITNESS. A nested-`match` scrutinee matches its literal arm. RED at HEAD:
// the inner match's value (2) is Ok-wrapped, the literal `2` arm cross-types the
// Result, wildcard wins, "no".
// ===========================================================================

describe("bug 0316 W7 — nested-`match` scrutinee matches its literal arm", () => {
  it('RED (W7): `match (match 1 { _ => 2 }) { 2 => "two", _ => "no" }` yields "two", not "no"', async () => {
    expect(
      await runValue('let v = match (match 1 { _ => 2 }) { 2 => "two", _ => "no" }\nv'),
      'W7: RED shows "no" (inner match value 2 Ok-wrapped, literal 2 arm cross-types the Result); GREEN shows "two"',
    ).toBe("two");
  });
});

// ===========================================================================
// W8 — CONTROL. A let-hoisted fn-call value takes the ident (pure) scrutinee
// path — no Ok wrap — so the literal `42` arm matches. GREEN now and after.
// Together with W3 proves the divergence is positional.
// ===========================================================================

describe("bug 0316 W8 — let-hoisted fn-call scrutinee (positional control)", () => {
  it('CONTROL (W8): `fn g(): integer { 42 }` / `let x = g()` / `match x { 42 => "num", _ => "other" }` yields "num"', async () => {
    expect(
      await runValue('fn g(): integer { 42 }\nlet x = g()\nlet v = match x { 42 => "num", _ => "other" }\nv'),
      "W8: GREEN now and after — a let-hoisted scrutinee is not Ok-wrapped, so the literal 42 arm matches",
    ).toBe("num");
  });
});

// ===========================================================================
// EFFECT-SCRUTINEE CONTROL — the checkpointed-effect arm of `evalAsResult`
// (statement-executor.ts:1229+, owned by bug 0307) must stay byte-equivalent: a
// `match` over a live query still sees `Ok`/`Err`. Mirrors
// tests/effectful-statement-host.test.ts's RecordingQueryModel real-host query
// wiring — the real query loop drives a scripted model returning a clean text,
// its outcome is normalised via `asResultValue` (unchanged by this fix), and the
// `Ok(x)` arm fires. GREEN now and after; a flip to 222 would mean the fix
// wrongly stripped the wrap on the effect path.
// ===========================================================================

const EFFECT_SITE: CheckpointSite = { file: "b0316.theta", line: 1, column: 1 };

/**
 * A scripted `QueryModelDriver` — the legitimate boundary the real query loop
 * drives (the shape tests/effectful-statement-host.test.ts consumes). `turns`
 * scripts the free-phase transcript per 0-based round.
 */
class RecordingQueryModel implements QueryModelDriver {
  serviced = false;
  readonly #turns: readonly FreePhaseTurn[];
  constructor(turns: readonly FreePhaseTurn[]) {
    this.#turns = turns;
  }
  nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    return Promise.resolve(this.#turns[round] ?? { kind: "text", text: "" });
  }
  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    this.serviced = true;
    return Promise.resolve([]);
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve({ kind: "respond", payload: null });
  }
}

class RecordingMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}

const NOOP_SINK: ToolLoweringSink = {
  runtimeEvent(): void {},
  diagnostic(): void {},
  systemNote(): void {},
};

function queryConfig(): QueryToolLoopConfig {
  return {
    maxRounds: 3,
    querySite: EFFECT_SITE,
    thetaSlashName: "b0316",
    invocationId: "inv-1",
    occurredAt: 0,
  };
}

describe("bug 0316 EFFECT control — a `match` over a live query still sees Ok/Err", () => {
  it("CONTROL (effect): `match @`q` { Ok(x) => 111, Err(e) => 222 }` over a clean query yields 111", async () => {
    // Parse the body so the query / match AST is the real production shape; drive
    // it through the effectful host (not the production producer) so a scripted
    // model — not a real provider — services the loop offline.
    const doc = parseTheta("b0316-effect.theta", FM + "match @`q` { Ok(x) => 111, Err(e) => 222 }");
    const model = new RecordingQueryModel([{ kind: "text", text: "clean" }]);
    const hostDeps: EffectfulStatementHostDeps = {
      checkpoint: NOOP_CHECKPOINT,
      signal: new AbortController().signal,
      sink: NOOP_SINK,
      file: "b0316-effect.theta",
      evaluatePure(expr: Expr): ThetaValue {
        if (expr.kind === "number") {
          return Number(expr.text);
        }
        return null;
      },
      resolveQuery(): QueryHostDispatch {
        return { typed: false, model, config: queryConfig() };
      },
      resolveToolCall(): CodeSideToolCall {
        return {
          toolName: "unused",
          text: "",
          dispatch: () => Promise.resolve({ content: [] }),
        } as unknown as CodeSideToolCall;
      },
      resolveInvoke(): InvokeChild {
        return {
          calleePath: "./unused.theta",
          value: null,
          drive: () => Promise.resolve(makeOk(null)),
        } as unknown as InvokeChild;
      },
    };
    const deps: ExecuteBodyDeps = {
      env: buildEnvironment({ body: { statements: [], tail: null } }),
      host: createEffectfulStatementHost(hostDeps),
      checkpoint: NOOP_CHECKPOINT,
      signal: new AbortController().signal,
      mutator: new RecordingMutator(),
      mode: "prompt" as DrivenConversationMode,
      file: "b0316-effect.theta",
    };

    const execution = await executeBody(doc.body, deps);

    expect(execution.outcome, "the effect body drives to success").toBe("success");
    expect(
      execution.result.value,
      "EFFECT control: the Ok arm fires because the checkpointed-effect path keeps asResultValue — 111 now and after",
    ).toBe(111);
  });
});
