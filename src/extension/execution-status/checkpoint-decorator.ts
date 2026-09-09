// RFC 0010 (execution-status.md EXST-4) — the `Checkpoint` telemetry decorator.
//
// `TelemetryCheckpoint.before` publishes `(invocationId, kind, site)` to the
// bus SYNCHRONOUSLY and then delegates, returning the inner `Checkpoint`'s own
// promise: the method is not `async`, contains no `await`/`.then`, and adds no
// awaited work before delegation, so the production wiring's per-kind yield
// semantics are unchanged (`loop-iter` on the injected-clock macrotask, the
// other four on the microtask queue) and
// `tests/checkpoint-seam.test.ts` / `tests/checkpoint-granularity.test.ts`
// stay green through this decorator unmodified.
//
// Spec: docs/spec_topics/execution-status.md EXST-4.

import type { Checkpoint, CheckpointKind, CheckpointSite } from "../../seams/checkpoint";
import type { ExecutionStatusBus } from "./types";

export class TelemetryCheckpoint implements Checkpoint {
  readonly #inner: Checkpoint;
  readonly #bus: ExecutionStatusBus;
  readonly #invocationId: string;

  constructor(inner: Checkpoint, bus: ExecutionStatusBus, invocationId: string) {
    this.#inner = inner;
    this.#bus = bus;
    this.#invocationId = invocationId;
  }

  before(kind: CheckpointKind, site: CheckpointSite): Promise<void> {
    try {
      this.#bus.checkpointBefore(this.#invocationId, kind, site);
    } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
      // EXST-9: the bus's own boundary already contains its folds, but a
      // defective/fault-injected bus MUST NOT perturb the drive either — the
      // publication drops and delegation still runs.
    }
    return this.#inner.before(kind, site); // return the INNER promise — no async/await/.then
  }
}

export function decorateCheckpoint(
  inner: Checkpoint,
  bus: ExecutionStatusBus | undefined,
  invocationId: string,
): Checkpoint {
  return bus === undefined ? inner : new TelemetryCheckpoint(inner, bus, invocationId);
}
