// V13f-T — failing tests for the `@`-query provider abandonable Promise
// swallowing-handler per-site routing (the paired `V13f` implementation leaf).
//
// Spec: cancellation.md §"Race semantics — swallowing-handler attachment on
// every abandonable Promise". This site is the `@`-query entry in the four-site
// abandonable-Promise routing set (`V14f`, `V13f`, `V15h`, `V9o`) that `V17a`
// delegates to its owning leaves; per the coverage-matrix *Multi-leaf-row
// per-facet citing tests* convention these tests cite both the `cka-33` row
// token and this facet's `V13f` closing-leaf-ID inline so the `H5f` per-facet
// citing-test gate associates the `@`-query provider Promise facet to its test.
//
// The late settlement is landed through the `Checkpoint` seam (`V8a`,
// PIC-10) — the deterministic-test substrate for landing a post-checkpoint
// settlement without depending on JS microtask scheduling. The `@`-query
// checkpoint that surfaces `cause: "cancelled"` for this invocation is the
// `query` checkpoint.
//
// These tests red on their own primary assertions while `V13f` is absent:
//   - `guardQueryProviderPromise` does not yet attach the construction-site
//     handler, so a late rejection reaches Node's `unhandledRejection` channel
//     (cka-33 / V13f channel 1).
//   - `routeQueryProviderLateSettlement` bypasses the substrate and re-surfaces
//     the late settlement on the `RuntimeEvent` and diagnostic channels
//     (cka-33 / V13f channels 2 and 3).
// No test reds on a compile error, a missing fixture, or a harness throw.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProductionCheckpoint } from "../src/seams/production-checkpoint";
import type { CheckpointSite } from "../src/seams/checkpoint";
import { FakeClock } from "./helpers/fake-clock";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { RuntimeEvent } from "../src/runtime/runtime-event-channel";
import {
  guardQueryProviderPromise,
  routeQueryProviderLateSettlement,
  type QueryProviderCancellationGuard,
  type QueryProviderSideChannels,
} from "../src/runtime/query-swallowing-handler";

// The `@`-query provider Promise's cancellation surfaces at the `query`
// checkpoint (cancellation.md Granularity: "immediately before dispatching each
// `@`...`` query").
const QUERY_SITE: CheckpointSite = {
  file: "review.loom",
  line: 12,
  column: 7,
};

// --- recording side channels + unhandledRejection trap ----------------------

interface RecordingChannels {
  readonly channels: QueryProviderSideChannels;
  readonly events: RuntimeEvent[];
  readonly diagnostics: Diagnostic[];
}

function makeChannels(): RecordingChannels {
  const events: RuntimeEvent[] = [];
  const diagnostics: Diagnostic[] = [];
  const channels: QueryProviderSideChannels = {
    emitRuntimeEvent: (event): void => {
      events.push(event);
    },
    emitDiagnostic: (diagnostic): void => {
      diagnostics.push(diagnostic);
    },
  };
  return { channels, events, diagnostics };
}

/** Records every Node `unhandledRejection` process event for the active test. */
const unhandled: unknown[] = [];
function onUnhandled(reason: unknown): void {
  unhandled.push(reason);
}

beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
});

/**
 * Drain microtasks and take a macrotask turn so a would-be `unhandledRejection`
 * (raised by Node on the next macrotask after the microtask queue empties for a
 * rejected, handler-less Promise) is observed if it fires.
 */
async function settleAndObserve(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// cka-33 / V13f channel 1 — construction-site attachment before microtask.
// ---------------------------------------------------------------------------

describe("V13f-T — @-query provider construction-site attachment (cka-33 / V13f)", () => {
  it("cka-33 / V13f: guardQueryProviderPromise attaches its swallowing handler at construction so a late rejection landed via the Checkpoint seam raises no Node unhandledRejection", async () => {
    const clock = new FakeClock();
    const checkpoint = new ProductionCheckpoint(clock);
    const guard: QueryProviderCancellationGuard = { cancellationSurfaced: false };
    const { channels } = makeChannels();

    // The underlying `@`-query provider Promise: it rejects only after the
    // query checkpoint has fired (landed via the Checkpoint seam), i.e. a late
    // post-checkpoint rejection. Constructed and guarded in one expression so
    // the handler must attach at the construction site, before the first
    // microtask boundary — a lazily-attached `.catch` would miss a rejection
    // already queued for `unhandledRejection`.
    const guarded = guardQueryProviderPromise(
      (async () => {
        await checkpoint.before("query", QUERY_SITE);
        // Cancellation surfaces at the query checkpoint; the provider Promise is
        // now abandoned but still settles late.
        guard.cancellationSurfaced = true;
        throw new Error("late @-query provider rejection after cancellation");
      })(),
      guard,
      channels,
    );

    // Do NOT await `guarded` for its value (the abandoned case): only let the
    // rejection land and check the process channel.
    void guarded;
    await settleAndObserve();

    // Channel 1: the swallowing handler absorbed the late rejection — no Node
    // `unhandledRejection` process event fired for the abandoned Promise.
    expect(unhandled).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// cka-33 / V13f channels 2 & 3 — three-channel suppression of a late settlement.
// ---------------------------------------------------------------------------

describe("V13f-T — @-query provider late-settlement three-channel suppression (cka-33 / V13f)", () => {
  it("cka-33 / V13f: once cancellation has surfaced, a late settlement is discarded with no second RuntimeEvent and no diagnostic of any severity", () => {
    const { channels, events, diagnostics } = makeChannels();
    const guard: QueryProviderCancellationGuard = { cancellationSurfaced: true };

    // A late rejection whose `.message` would otherwise be diagnostic-worthy
    // (an OOM-style host failure). It MUST still be discarded — promotion to
    // `loom/runtime/internal-error` would re-introduce the second-event surface
    // the rule forbids.
    const disposition = routeQueryProviderLateSettlement(
      { kind: "rejected", error: new Error("host OOM after cancellation") },
      guard,
      channels,
    );

    // Channel 2: no second `RuntimeEvent` on the always-log channel.
    expect(events).toEqual([]);
    // Channel 3: no diagnostic of any severity.
    expect(diagnostics).toEqual([]);
    // The settlement was discarded, not surfaced.
    expect(disposition).toBe("discarded");
  });

  it("cka-33 / V13f: a late resolution after cancellation is likewise discarded on both emit channels", () => {
    const { channels, events, diagnostics } = makeChannels();
    const guard: QueryProviderCancellationGuard = { cancellationSurfaced: true };

    // The discriminator is whether cancellation surfaced, not the late-settle
    // kind — a late resolve is discarded exactly as a late reject is.
    const disposition = routeQueryProviderLateSettlement(
      { kind: "resolved", value: { text: "late @-query answer" } },
      guard,
      channels,
    );

    expect(events).toEqual([]);
    expect(diagnostics).toEqual([]);
    expect(disposition).toBe("discarded");
  });
});

// ---------------------------------------------------------------------------
// cka-33 / V13f — end-to-end via the Checkpoint seam: all three channels silent.
// ---------------------------------------------------------------------------

describe("V13f-T — @-query provider abandoned Promise total suppression via Checkpoint seam (cka-33 / V13f)", () => {
  it("cka-33 / V13f: a late settlement landed via the Checkpoint seam after the query checkpoint surfaced cause:'cancelled' is suppressed on all three side channels", async () => {
    const clock = new FakeClock();
    const checkpoint = new ProductionCheckpoint(clock);
    const guard: QueryProviderCancellationGuard = { cancellationSurfaced: false };
    const { channels, events, diagnostics } = makeChannels();

    const guarded = guardQueryProviderPromise(
      (async () => {
        // The query checkpoint fires; cancellation surfaces cause:"cancelled"
        // and the `@`-query provider Promise is abandoned.
        await checkpoint.before("query", QUERY_SITE);
        guard.cancellationSurfaced = true;
        // The abandoned Promise settles late with a host failure.
        throw new Error("late @-query provider settlement");
      })(),
      guard,
      channels,
    );

    void guarded;
    await settleAndObserve();

    // All three side channels stay silent: no Node `unhandledRejection`, no
    // second `RuntimeEvent`, and no diagnostic of any severity. A build that
    // bypasses the substrate reddens at least one of these.
    expect(unhandled).toEqual([]);
    expect(events).toEqual([]);
    expect(diagnostics).toEqual([]);
  });
});
