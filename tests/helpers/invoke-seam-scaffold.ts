// A shared no-op `ExecuteBodyDeps` scaffold for driving the real `executeBody`
// over an injected `InvokeChild` boundary double (PTQ-0244), plus recording
// seam doubles for cancellation and lowering witnesses.
//
// WHY THIS FILE EXISTS. The `SEAM_NOOP_CHECKPOINT` / `SEAM_NOOP_SINK` /
// `SEAM_NOOP_MUTATOR` no-op triple, `span()`, and the `RecordedHop` SLSH-5
// hop-recording shape are byte-for-byte identical across several
// `executeBody`-driving invoke/code-call bug-witness files (bug 0294, bug
// 0295, bug 0347, bug 0349). This module centralises the pieces that are
// pure scaffolding — inert stand-ins for seams the driven cell does not itself
// exercise — so a file that needs them can import rather than retype them;
// the `seamDeps`-shaped driver each file builds ON TOP of this scaffold stays
// local, since its call-routing differs per bug.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module. Nothing here is stubbed beyond the no-op
// seam stand-ins themselves; the real `executeBody` /
// `createEffectfulStatementHost` drive the actual production code under test.
import type { Expr, MatchArmNode, MatchExpr, QueryExpr, Stmt, ThetaBody } from "../../src/parser/theta-document";
import { buildEnvironment, type LexicalEnvironment } from "../../src/runtime/lexical-environment";
import { type Diagnostic } from "../../src/diagnostics/diagnostic";
import type { CheckpointKind, CheckpointSite } from "../../src/seams/checkpoint";
import type { Checkpoint } from "../../src/seams/checkpoint";
import type { ToolLoweringSink } from "../../src/runtime/tool-call-execute";
import type {
  CommittedConversationMutator,
  CommittedSurface,
  DrivenConversationMode,
} from "../../src/runtime/terminal-outcomes";
import type { SourceRange } from "../../src/diagnostics/diagnostic";
import type { InvokeCalleeError } from "../../src/runtime/query-error";
import type { QueryToolLoopConfig } from "../../src/runtime/query-tool-loop";
import type { InvokeCallSite } from "../../src/runtime/invoke-provenance";
import type {
  CommittedSideEffect,
  CompensatingTurn,
  RollbackCompensator,
} from "../../src/runtime/no-rollback";
import type { OperationResult } from "../../src/runtime/cancellation-core";
import {
  executeBody,
  type BodyExecution,
  type CheckpointDescriptor,
  type ExecuteBodyDeps,
  type StatementEvalHost,
} from "../../src/runtime/statement-executor";
import type { ThetaValue } from "../../src/runtime/value";

/** Drive the real executor, capturing whether it threw for the caller's assertion. */
export async function captureBodyExecution(
  body: ThetaBody,
  deps: ExecuteBodyDeps,
): Promise<{ threw: boolean; exec: BodyExecution | undefined }> {
  let threw = false;
  let exec: BodyExecution | undefined;
  try {
    exec = await executeBody(body, deps);
  } catch {
    threw = true;
  }
  return { threw, exec };
}

/** A `Checkpoint` whose `before()` resolves immediately — the seam is not
 *  itself under test at the call sites that use this scaffold. */
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** A `ToolLoweringSink` that discards every diagnostic/system-note. */
export const SEAM_NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};

/** A `CommittedConversationMutator` whose every method is a no-op. */
export const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};

/** A throwaway 1:1–1:2 `SourceRange`, for a scaffold expr/site that carries no
 *  real source position. */
export function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

/** A located site at the throwaway span. */
export function site(file = "test.theta"): { file: string; range: SourceRange } {
  return { file, range: span() };
}

/** One recorded SLSH-5 hop (`deps.recordInvokeHop` fires only when a wrap
 *  decision constructs an `invoke_callee` wrapper). */
export interface RecordedHop {
  readonly wrapper: InvokeCalleeError;
  readonly calleePath: string;
  readonly callSite: InvokeCallSite;
}

/** Checkpoint double invoking its script with the one-based call number and kind. */
export class ScriptedCheckpoint implements Checkpoint {
  #calls = 0;
  readonly #onBefore: (call: number, kind: CheckpointKind) => void;

  constructor(onBefore: (call: number, kind: CheckpointKind) => void) {
    this.#onBefore = onBefore;
  }

  before(kind: CheckpointKind): Promise<void> {
    this.#calls += 1;
    this.#onBefore(this.#calls, kind);
    return Promise.resolve();
  }
}

/** Record committed-conversation mutations in invocation order. */
export class RecordingMutator implements CommittedConversationMutator {
  readonly calls: string[] = [];
  truncate(surfaceId: string): void {
    this.calls.push(`truncate:${surfaceId}`);
  }
  rewrite(surfaceId: string): void {
    this.calls.push(`rewrite:${surfaceId}`);
  }
  replace(surfaceId: string): void {
    this.calls.push(`replace:${surfaceId}`);
  }
  remove(surfaceId: string): void {
    this.calls.push(`remove:${surfaceId}`);
  }
  injectCompensatingTurn(surface: CommittedSurface): void {
    this.calls.push(`inject:${surface.id}`);
  }
}

/** Record both typed diagnostics/notes and their ordered lowering emissions. */
export class RecordingSink implements ToolLoweringSink {
  readonly emissions: string[] = [];
  readonly diagnostics: Diagnostic[] = [];
  readonly systemNotes: string[] = [];
  diagnostic(diag: Diagnostic): void {
    this.emissions.push(`diagnostic:${diag.code}`);
    this.diagnostics.push(diag);
  }
  systemNote(message: string): void {
    this.emissions.push(`system-note:${message}`);
    this.systemNotes.push(message);
  }
}

/**
 * A `Checkpoint` recording kinds/sites and an optional ordered event log, so a
 * test can assert it fires immediately before each cancellable site (PIC-10).
 * `before` resolves on the microtask queue; the macrotask-yield property is
 * exercised separately against the real `ProductionCheckpoint`.
 */
export class RecordingCheckpoint implements Checkpoint {
  readonly kinds: CheckpointKind[] = [];
  readonly sites: CheckpointSite[] = [];
  readonly log: string[] | undefined;
  readonly #logPrefix: string;

  constructor(log?: string[], logPrefix = "checkpoint:") {
    this.log = log;
    this.#logPrefix = logPrefix;
  }

  before(kind: CheckpointKind, site: CheckpointSite): Promise<void> {
    this.kinds.push(kind);
    this.sites.push(site);
    this.log?.push(`${this.#logPrefix}${kind}`);
    return Promise.resolve();
  }
}

/** A `RollbackCompensator` spy: records any forbidden compensating operation. */
export class SpyCompensator implements RollbackCompensator {
  readonly calls: string[] = [];
  unwindSideEffect(id: string): void {
    this.calls.push(`unwind:${id}`);
  }
  appendCompensatingTurn(turn: CompensatingTurn): void {
    this.calls.push(`append:${turn.id}`);
  }
  enumerateCompletedSideEffects(effects: readonly CommittedSideEffect[]): void {
    this.calls.push(`enumerate:${effects.length}`);
  }
}

// Hand-built AST and root environment shared by the bug-0307 executor witnesses.

/** An identifier at the throwaway span. */
export function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}

/** An untyped `@`-query expression. */
export function queryExpr(template: string): QueryExpr {
  return { kind: "query", schema: null, template, range: span() };
}

/** A `match` expression node. */
export function matchExpr(scrutinee: Expr, arms: readonly MatchArmNode[]): MatchExpr {
  return { kind: "match", scrutinee, arms, range: span() };
}

/** A `let <name> = <init>` statement (immutable, unannotated). */
export function letStmt(name: string, init: Expr): Stmt {
  return { kind: "let", name, mutable: false, annotation: null, init, range: span() };
}

/** A body with the given statements and optional tail. */
export function body(statements: readonly Stmt[], tail: Expr | null = null): ThetaBody {
  return { statements, tail };
}

/** A real root environment over an empty body. */
export function realEnv(): LexicalEnvironment {
  return buildEnvironment({ body: { statements: [], tail: null } });
}

export const SITE: CheckpointSite = { file: "theta.theta", line: 1, column: 1 };

/** Query-loop defaults shared by the executor and composition witnesses. */
export function queryConfig(): QueryToolLoopConfig {
  return {
    maxRounds: 3,
    querySite: SITE,
    thetaSlashName: "demo",
    invocationId: "inv-1",
    occurredAt: 0,
  };
}

/**
 * A `StatementEvalHost` double whose `runEffect` returns a scripted
 * `OperationResult` keyed by the effect expression's `kind` (a `query` keys on
 * `"query"`) / a call's callee, and whose `evaluatePure` evaluates the bounded
 * literal / ident forms the witnesses need against the real environment. Queries
 * are modelled as `{ ok:false, error }` or `{ ok:true, value }` — exactly what
 * `runQueryEffect` feeds `evalExpr`'s effect arm for failure or success.
 */
export class ScriptedHost implements StatementEvalHost {
  readonly results = new Map<string, OperationResult>();

  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    switch (expr.kind) {
      case "string":
      case "bool":
        return expr.value;
      case "number":
        return Number(expr.text);
      case "null":
        return null;
      case "ident":
        return env.resolve(expr.name).value ?? null;
      default:
        return null;
    }
  }

  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    if (expr.kind === "call" || expr.kind === "query" || expr.kind === "invoke") {
      return { kind: "tool-call", site: SITE };
    }
    return null;
  }

  runEffect(expr: Expr): Promise<OperationResult> {
    const key = expr.kind === "call" ? expr.callee : expr.kind;
    return Promise.resolve(this.results.get(key) ?? { ok: true, value: null });
  }
}

/** Assemble `ExecuteBodyDeps` from a host. */
export function deps(host: StatementEvalHost): ExecuteBodyDeps {
  return {
    env: realEnv(),
    host,
    checkpoint: SEAM_NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new RecordingMutator(),
    mode: "prompt" as DrivenConversationMode,
    file: "test.theta",
  };
}
