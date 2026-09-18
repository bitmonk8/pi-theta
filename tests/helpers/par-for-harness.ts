// Shared gated par-for host and diagnostic-capturing executor deps (PTQ-0483).
// The broader par-for conformance host keeps its payload/outcome scripting;
// these bug witnesses need only dispatch count and admitted in-flight width.
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import type { Expr, ThetaBody } from "../../src/parser/theta-document";
import type { OperationResult } from "../../src/runtime/cancellation-core";
import { buildEnvironment, type LexicalEnvironment } from "../../src/runtime/lexical-environment";
import type {
  CheckpointDescriptor,
  ExecuteBodyDeps,
  StatementEvalHost,
} from "../../src/runtime/statement-executor";
import type { ThetaValue } from "../../src/runtime/value";
import { SEAM_NOOP_CHECKPOINT, SEAM_NOOP_MUTATOR } from "./invoke-seam-scaffold";

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
        return expr.elements.map((e) => this.#eval(e, env));
      default:
        return null;
    }
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

