// The `ActiveInvocationRegistry` seam.
//
// This module owns the extension-instance-scoped registry of in-flight theta
// invocations (active-invocation-registry.md §"Active invocation registry"):
//
//   - the five-field entry `{ thetaAbort, disposeBarrier, shutdownReason, theta,
//     invocationId }` (the `disposeBarrier` resolver is closure-scoped at the
//     producer's bind choke point, not a sixth field);
//   - the `Set`-backed registry whose iteration is **insertion order** (the V8
//     `Set` invariant the `session_shutdown` teardown handler relies on), with an
//     entry-count probe seam so tests assert on observable side effects rather
//     than the internal symbol (the registry name is internal).
//
// The dispatch-site setup and the per-invocation `finally` are owned by the
// producer's bind choke points (production-theta-producer.ts), which register
// and remove entries directly and settle each entry's `disposeBarrier` inline —
// subagent-mode teardown settles on observed child-process exit (RFC-0005), not
// on an in-process `AgentSession.dispose()`. This module therefore exposes only
// the entry shape and the registry container.
//
// Spec: pi-integration-contract/active-invocation-registry.md.

/**
 * The pinned five-field registry entry (active-invocation-registry.md). The
 * `disposeBarrier` resolver is held in the producer's dispatch-site closure, not
 * as a sixth member, so observers see exactly these five members.
 * `shutdownReason` is the sole mutable member (populated by `session_shutdown`
 * sub-step 2).
 */
export interface ActiveInvocationEntry {
  readonly thetaAbort: AbortController;
  readonly disposeBarrier: Promise<void>;
  shutdownReason: string | undefined;
  readonly theta: string;
  readonly invocationId: string;
}

/**
 * The extension-instance-scoped registry of in-flight invocations. Backed by a
 * `Set` whose iteration is insertion order; `size()` is the entry-count probe
 * seam tests assert on (the registry name itself is internal).
 */
export class ActiveInvocationRegistry {
  // V8 `Set` preserves insertion order on iteration — the invariant the
  // `session_shutdown` teardown sub-steps 2 and 3 rely on. The registry name is
  // internal; observers use the `size()` / `snapshot()` probe seams.
  readonly #entries = new Set<ActiveInvocationEntry>();

  /** Insert an entry at a dispatch site. */
  add(entry: ActiveInvocationEntry): void {
    this.#entries.add(entry);
  }

  /** Remove an entry from the per-invocation `finally`, after the barrier settles. */
  remove(entry: ActiveInvocationEntry): void {
    this.#entries.delete(entry);
  }

  /** Entry-count probe (observable side effect; the registry name is internal). */
  size(): number {
    return this.#entries.size;
  }

  /** Insertion-order snapshot of the live entries. */
  snapshot(): readonly ActiveInvocationEntry[] {
    return [...this.#entries];
  }
}
