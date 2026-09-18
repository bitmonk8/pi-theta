import { describe, expect, it } from "vitest";
import type { ThetaBody, Expr } from "../src/parser/theta-document";
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
import type { OperationResult } from "../src/runtime/cancellation-core";
import type { ThetaValue } from "../src/runtime/value";
import type { ParForLaneHooks, ParForLaneSetHandle } from "../src/extension/execution-status/types";
import { bodyOf } from "./helpers/e2e-s1";
import { ok } from "./helpers/par-for-harness";
import { SEAM_NOOP_CHECKPOINT, SEAM_NOOP_MUTATOR } from "./helpers/invoke-seam-scaffold";

// RFC 0010 (execution-status.md EXST-3(c)) — `tests/execution-status-parfor-lanes.test.ts`
// (B18). `ExecuteBodyDeps.statusLanes` is an OPTIONAL field
// (`statement-executor.ts`); `evalParFor` reads it and drives
// open()/claim()/settle()/close() per lane when present; execution succeeds
// when absent. Uses the shared par-for parse/no-op scaffold
// with an immediate-effect host and a lane-hook recorder.

/** A minimal `StatementEvalHost` for a `par for` body whose per-iteration
 *  effect is a bare `invoke` call resolving immediately. */
class RecordingParForHost implements StatementEvalHost {
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
    return ok(null);
  }

  #eval(expr: Expr, env: LexicalEnvironment): ThetaValue {
    switch (expr.kind) {
      case "number":
        return Number(expr.text);
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

/** A recording `ParForLaneHooks`: records every `open` call's (total, width)
 *  and every claim/settle/close on the returned handle, in order. */
function recordingLaneHooks(): { hooks: ParForLaneHooks; events: string[] } {
  const events: string[] = [];
  const hooks: ParForLaneHooks = {
    open(total: number, width: number): ParForLaneSetHandle {
      events.push(`open(${total},${width})`);
      return {
        claim: (index: number): void => {
          events.push(`claim(${index})`);
        },
        settle: (index: number, outcome: "done" | "err"): void => {
          events.push(`settle(${index},${outcome})`);
        },
        close: (): void => {
          events.push("close()");
        },
      };
    },
  };
  return { hooks, events };
}

function execDeps(body: ThetaBody, host: StatementEvalHost, statusLanes: ParForLaneHooks): ExecuteBodyDeps {
  return {
    env: buildEnvironment({ body }),
    host,
    checkpoint: SEAM_NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: { ...SEAM_NOOP_MUTATOR },
    mode: "prompt",
    file: "test.theta",
    statusLanes,
  };
}

describe("B18 — evalParFor invokes statusLanes hooks (claim/complete per lane)", () => {
  it("open() is called with the post-CTRL-2 clamped width, then a claim+settle per lane, then close()", async () => {
    const host = new RecordingParForHost();
    const { hooks, events } = recordingLaneHooks();
    const body = bodyOf('par for f in [1, 2, 3] max 2 { invoke("./c.theta", f) f }');
    const exec = await executeBody(body, execDeps(body, host, hooks));
    expect(exec.outcome, "the drive itself is unaffected by the status-lane hooks").toBe("success");

    // Primary assertion: the hooks were invoked, in the documented order.
    expect(events.length, "statusLanes.open was never called").toBeGreaterThan(0);
    expect(events[0]).toBe("open(3,2)"); // n=3, clamped width=min(2,3)=2
    expect(events).toContain("claim(0)");
    expect(events).toContain("settle(0,done)");
    expect(events[events.length - 1]).toBe("close()");
  });

  it("evalParFor succeeds when statusLanes is absent", async () => {
    const host = new RecordingParForHost();
    const body = bodyOf('par for f in [1, 2, 3] max 2 { invoke("./c.theta", f) f }');
    const deps: ExecuteBodyDeps = {
      env: buildEnvironment({ body }),
      host,
      checkpoint: SEAM_NOOP_CHECKPOINT,
      signal: new AbortController().signal,
      mutator: { ...SEAM_NOOP_MUTATOR },
      mode: "prompt",
      file: "test.theta",
      // statusLanes intentionally absent
    };
    const exec = await executeBody(body, deps);
    expect(exec.outcome).toBe("success");
  });
});
