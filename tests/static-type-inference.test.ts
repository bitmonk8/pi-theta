import { describe, expect, it } from "vitest";
import {
  StaticTypeInferencePass,
  type StaticTypeInferenceDeps,
} from "../src/parser/static-type-inference";
import { checkCompatible, type TypeEnv } from "../src/parser/type-compat";
import type { Expr, LoomBody, Stmt } from "../src/parser/loom-document";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import {
  executeBody,
  type CheckpointDescriptor,
  type ExecuteBodyDeps,
  type StatementEvalHost,
} from "../src/runtime/statement-executor";
import {
  buildEnvironment,
  type LexicalEnvironment,
} from "../src/runtime/lexical-environment";
import type { Checkpoint } from "../src/seams/checkpoint";
import type {
  CommittedConversationMutator,
  CommittedSurface,
} from "../src/runtime/terminal-outcomes";
import type { LoomValue } from "../src/runtime/value";

// V20b-T — failing tests for the paired `V20b` static type-inference substrate.
//
// Convention: conventions.md (phase categories — assembly/production-wiring).
// Narrative spec references: type-system.md, expressions.md, control-flow.md,
// functions.md. Closes no new spec REQ-ID.
//
// Bucket B (engine absent): there is a `V2b` type-compatibility engine
// (`checkCompatible`, the `⊑` relation) but no whole-program pass that assigns
// a static type to every expression node, so the `V20c` type-phase checkers
// have nothing to run against in production. These tests exercise the new
// whole-program static-type-assignment pass over a parsed `V19a` `LoomBody`:
//
//   1. the pass assigns a static type to every expression node kind via the
//      `V2b` `⊑` engine, exposing a per-node inferred-type lookup keyed by node
//      (asserted over each expression node kind);
//   2. the pass composes with the `V19c` statement walk without altering the
//      runtime result — type-assignment is a read-only static pass.
//
// Both red today: `StaticTypeInferencePass.infer` is an inert stub whose lookup
// assigns no type (`typeOf` returns `undefined`, `nodes` is empty), so each
// test reds on its own primary assertion — an absent per-node inferred type —
// not on a compile error, a missing fixture, or a harness throw.

// --- AST construction helpers ---------------------------------------------

/** A throwaway 1:1–1:2 span for hand-built AST nodes (a parsed body's shape). */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function exprStmt(expr: Expr): Stmt {
  return { kind: "expr", expr, range: span() };
}

function loomBody(statements: readonly Stmt[], tail: Expr | null = null): LoomBody {
  return { statements, tail };
}

// One node of every expression kind the `V20b` pass must type (V20b `Adds.`:
// literal, identifier, binary, ternary, member, index, call, `match`, enum,
// `Ok`/`Err`). Named so each per-kind assertion reds against a specific node.
const intLiteral: Expr = { kind: "number", text: "1", numericType: "integer", range: span() };
const floatLiteral: Expr = { kind: "number", text: "1.5", numericType: "number", range: span() };
const stringLiteral: Expr = { kind: "string", value: "hi", range: span() };
const boolLiteral: Expr = { kind: "bool", value: true, range: span() };
const nullLiteral: Expr = { kind: "null", range: span() };
const identifier: Expr = { kind: "ident", name: "x", range: span() };
const binary: Expr = { kind: "binary", op: "+", left: intLiteral, right: floatLiteral, range: span() };
const ternary: Expr = {
  kind: "ternary",
  condition: boolLiteral,
  consequent: intLiteral,
  alternate: floatLiteral,
  range: span(),
};
const member: Expr = { kind: "member", target: identifier, field: "field", range: span() };
const index: Expr = {
  kind: "index",
  target: { kind: "ident", name: "arr", range: span() },
  index: intLiteral,
  range: span(),
};
const call: Expr = { kind: "call", callee: "tool", args: [], range: span() };
const matchExpr: Expr = {
  kind: "match",
  scrutinee: { kind: "ident", name: "s", range: span() },
  arms: [{ pattern: { kind: "wildcard" }, body: intLiteral }],
  range: span(),
};
// An enum-variant access `Status.Active` — a member read against an enum name.
const enumAccess: Expr = {
  kind: "member",
  target: { kind: "ident", name: "Status", range: span() },
  field: "Active",
  range: span(),
};
const okCtor: Expr = { kind: "result-ctor", ctor: "Ok", arg: intLiteral, range: span() };
const errCtor: Expr = { kind: "result-ctor", ctor: "Err", arg: stringLiteral, range: span() };

/** The named expression node of each kind the pass must assign a static type. */
const NODE_KINDS: ReadonlyArray<readonly [string, Expr]> = [
  ["integer literal", intLiteral],
  ["number literal", floatLiteral],
  ["string literal", stringLiteral],
  ["boolean literal", boolLiteral],
  ["null literal", nullLiteral],
  ["identifier", identifier],
  ["binary", binary],
  ["ternary", ternary],
  ["member", member],
  ["index", index],
  ["call", call],
  ["match", matchExpr],
  ["enum access", enumAccess],
  ["Ok constructor", okCtor],
  ["Err constructor", errCtor],
];

/** A parsed loom body carrying one expression statement of every kind above. */
function everyKindBody(): LoomBody {
  return loomBody(NODE_KINDS.map(([, node]) => exprStmt(node)));
}

/** A trivially-empty type environment (no named-schema resolution needed here). */
const EMPTY_ENV: TypeEnv = {};

function makePass(): StaticTypeInferencePass {
  // Constructor-injected over the real `V2b` `⊑` engine — no module-level state.
  const deps: StaticTypeInferenceDeps = { checkCompatible };
  return new StaticTypeInferencePass(deps);
}

// ===========================================================================
// Bullet 1 — assigns a static type to every expression node kind (V2b `⊑`).
// ===========================================================================

describe("V20b-T — static type-inference substrate: per-node assignment", () => {
  for (const [label, node] of NODE_KINDS) {
    it(`assigns a static type to the ${label} expression node`, () => {
      const pass = makePass();
      const inferred = pass.infer(everyKindBody(), EMPTY_ENV);
      // Reds today: the whole-program pass does not exist, so the per-node
      // inferred-type lookup is absent (`typeOf` returns `undefined`).
      expect(inferred.typeOf(node)).toBeDefined();
    });
  }

  it("exposes a per-node inferred-type lookup keyed by node over the whole body", () => {
    const pass = makePass();
    const inferred = pass.infer(everyKindBody(), EMPTY_ENV);
    // Reds today: the pass visits no node, so the published lookup is empty.
    expect(inferred.nodes.length).toBe(NODE_KINDS.length);
  });
});

// ===========================================================================
// Bullet 2 — read-only: composes with the V19c walk without altering runtime.
// ===========================================================================

// --- V19c execution harness ------------------------------------------------

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** A no-op partial-append mutator (the read-only body triggers no mutation). */
class NoopMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}

/** A bounded pure-expression host: every node in the read-only body is pure. */
class PureHost implements StatementEvalHost {
  evaluatePure(expr: Expr, env: LexicalEnvironment): LoomValue {
    return this.#eval(expr, env);
  }
  checkpointFor(_expr: Expr): CheckpointDescriptor | null {
    return null;
  }
  runEffect(): Promise<never> {
    throw new Error("read-only body has no checkpointed effects");
  }
  #eval(expr: Expr, env: LexicalEnvironment): LoomValue {
    switch (expr.kind) {
      case "number":
        return Number(expr.text);
      case "string":
        return expr.value;
      case "bool":
        return expr.value;
      case "null":
        return null;
      case "binary":
        if (expr.op === "+") {
          return (this.#eval(expr.left, env) as number) + (this.#eval(expr.right, env) as number);
        }
        return null;
      default:
        return null;
    }
  }
}

function execDeps(body: LoomBody): ExecuteBodyDeps {
  return {
    env: buildEnvironment({ body }),
    host: new PureHost(),
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new NoopMutator(),
    mode: "prompt",
  };
}

/** A pure, deterministic body: two discarded literal statements + a `2 + 3` tail. */
function readOnlyBody(): LoomBody {
  const two: Expr = { kind: "number", text: "2", numericType: "integer", range: span() };
  const three: Expr = { kind: "number", text: "3", numericType: "integer", range: span() };
  const tail: Expr = { kind: "binary", op: "+", left: two, right: three, range: span() };
  return loomBody([exprStmt(intLiteral), exprStmt(stringLiteral)], tail);
}

describe("V20b-T — static type-inference substrate: read-only composition", () => {
  it("runs before the V19c statement walk without altering the runtime result", async () => {
    const program = readOnlyBody();

    // Baseline runtime result with no static-type pass.
    const baseline = await executeBody(program, execDeps(program));

    // The read-only static pass runs over the same parsed body.
    const pass = makePass();
    const inferred = pass.infer(program, EMPTY_ENV);

    // Runtime result after the pass is byte-identical (read-only composition).
    const after = await executeBody(program, execDeps(program));
    expect(after).toEqual(baseline);

    // Primary reddening assertion: the pass published a per-node inferred type
    // the V20c checkers can consume. Reds today — the pass assigns none.
    expect(inferred.nodes.length).toBeGreaterThan(0);
    expect(inferred.typeOf(program.tail as Expr)).toBeDefined();
  });
});
