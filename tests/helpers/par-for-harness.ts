// Shared gated par-for host, driver, and diagnostic-capturing executor deps.
// The broader par-for conformance host keeps its payload/outcome scripting;
// these bug witnesses need only dispatch count and admitted in-flight width.
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import type { Expr, ThetaBody } from "../../src/parser/theta-document";
import type { OperationResult } from "../../src/runtime/cancellation-core";
import { buildEnvironment, type LexicalEnvironment } from "../../src/runtime/lexical-environment";
import {
  executeBody,
  type BodyExecution,
  type CheckpointDescriptor,
  type ExecuteBodyDeps,
  type StatementEvalHost,
} from "../../src/runtime/statement-executor";
import { isResultValue, type ThetaValue } from "../../src/runtime/value";
import { SEAM_NOOP_CHECKPOINT, SEAM_NOOP_MUTATOR } from "./invoke-seam-scaffold";
import { flush } from "./fake-clock";

/**
 * The bounded pure-expression evaluator over the six forms a `par for` body
 * needs (number / string / bool / null / ident / array). Recursion (the
 * `array` elements) goes through `evalExpr` so a host with extra cases keeps
 * handling them; `undefined` means the kind is NOT handled here and the host
 * falls through to its own arms (or `null`).
 */
export function evalBoundedPure(
  expr: Expr,
  env: LexicalEnvironment,
  evalExpr: (expr: Expr, env: LexicalEnvironment) => ThetaValue,
): ThetaValue | undefined {
  switch (expr.kind) {
    case "number":
      return Number(expr.text);
    case "string":
      return expr.value;
    case "bool":
      return expr.value;
    case "null":
      return null;
    case "ident": {
      const r = env.resolve(expr.name);
      return "value" in r ? ((r.value ?? null) as ThetaValue) : null;
    }
    case "array":
      return expr.elements.map((e) => evalExpr(e, env));
    default:
      return undefined;
  }
}

/** An `Ok(value)` operation result (the effect succeeded). */
export function ok(value: ThetaValue): OperationResult {
  return { ok: true, value };
}

/**
 * A `StatementEvalHost` for `par for` bodies that RECORDS every effect dispatch
 * (`started`) and, when `gate` is set, holds each effect open so the concurrent
 * peak (`peakInFlight`) is the width the executor admits — the union of the
 * tests/par-for.test.ts recording host and the tests/b0324 gated host. The
 * bounded pure forms a fan-out body needs (number / string / bool / null / ident
 * / array) are evaluated against the real per-iteration environment; the max
 * operand itself is `%`/`/`/object-construction/object-index, all of which the
 * executor's `evalExpr` computes INTERNALLY, so this pure surface is minimal.
 */
export class ParForHost implements StatementEvalHost {
  started = 0;
  inFlight = 0;
  peakInFlight = 0;
  /** An optional gate every effect awaits before resolving (concurrency probe). */
  gate: Promise<void> | null = null;

  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    return this.#eval(expr, env);
  }

  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    if (expr.kind === "call" || expr.kind === "query" || expr.kind === "invoke") {
      return { kind: "tool-call", site: { file: "test.theta", line: 1, column: 1 } };
    }
    return null;
  }

  async runEffect(): Promise<OperationResult> {
    this.started += 1;
    this.inFlight += 1;
    this.peakInFlight = Math.max(this.peakInFlight, this.inFlight);
    try {
      if (this.gate !== null) {
        await this.gate;
      }
      return ok(null);
    } finally {
      this.inFlight -= 1;
    }
  }

  #eval(expr: Expr, env: LexicalEnvironment): ThetaValue {
    const bounded = evalBoundedPure(expr, env, (e, en) => this.#eval(e, en));
    return bounded === undefined ? null : bounded;
  }
}

/**
 * `ExecuteBodyDeps` with the runtime-diagnostic channel required (not optional).
 * The production type carries `emitDiagnostic?:` since bug 0324 landed; this
 * override only tightens it so the capturing spy is guaranteed wired — no src/
 * change.
 */
interface DiagnosticSpyDeps extends ExecuteBodyDeps {
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
}

export function execDeps(
  body: ThetaBody,
  host: StatementEvalHost,
  captured: Diagnostic[],
): DiagnosticSpyDeps {
  return {
    env: buildEnvironment({ body }),
    host,
    checkpoint: SEAM_NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: { ...SEAM_NOOP_MUTATOR },
    mode: "prompt",
    file: "test.theta",
    emitDiagnostic: (d: Diagnostic): void => {
      captured.push(d);
    },
  };
}

/** Arm the effect gate, sample the peak after 30 microtask turns, then release and drain. */
export async function driveGated(
  body: ThetaBody,
  host: ParForHost,
  captured: Diagnostic[],
): Promise<{ peakWhileGated: number; execution: BodyExecution }> {
  let release!: () => void;
  host.gate = new Promise<void>((res) => {
    release = res;
  });
  const execPromise = executeBody(body, execDeps(body, host, captured));
  await flush(30);

  const peakWhileGated = host.peakInFlight;
  release();
  const execution = await execPromise;
  return { peakWhileGated, execution };
}

/** Count of `Ok(_)` envelopes in a loop's `array<Result>` value. */
// `BodyExecution.result.value` is `ThetaValue | undefined` (an absent-tail
// drive resolves to no value); the non-array guard already maps `undefined` to
// the sentinel, so the parameter admits it directly.
export function okCount(value: ThetaValue | undefined): number {
  if (!Array.isArray(value)) {
    return -1;
  }
  return value.filter((e) => isResultValue(e) && e.ok).length;
}

/** Count of captured diagnostics carrying `code`. */
export function countCode(captured: readonly Diagnostic[], code: string): number {
  return captured.filter((d) => d.code === code).length;
}

