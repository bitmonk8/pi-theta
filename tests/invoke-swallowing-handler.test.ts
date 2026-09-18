// V15h-T — failing tests for the `invoke` child top-level execution-Promise
// swallowing-handler per-site routing (the paired `V15h` implementation leaf).
//
// Spec: cancellation.md §"Race semantics — swallowing-handler attachment on
// every abandonable Promise". This site is the `invoke`-child entry in the
// four-site abandonable-Promise routing set (`V14f`, `V13f`, `V15h`, `V9o`)
// that `V17a` delegates to its owning leaves; per the coverage-matrix
// *Multi-leaf-row per-facet citing tests* convention these tests cite both the
// `cka-33` row token and this facet's `V15h` closing-leaf-ID inline so the
// `H5f` per-facet citing-test gate associates the invoke-child facet to its
// test.
//
// The late settlement is landed through the `Checkpoint` seam (`V8a`,
// PIC-10) — the deterministic-test substrate for landing a post-checkpoint
// settlement without depending on JS microtask scheduling.
//
// These tests red on their own primary assertions while `V15h` is absent:
//   - `guardInvokeExecutionPromise` does not yet attach the construction-site
//     handler, so a late rejection reaches Node's `unhandledRejection` channel
//     (cka-33 / V15h channel 1).
//   - `routeInvokeExecutionLateSettlement` bypasses the substrate and
//     re-surfaces the late settlement on the `RuntimeEvent` and diagnostic
//     channels (cka-33 / V15h channels 2 and 3).
// No test reds on a compile error, a missing fixture, or a harness throw.

import {
  createUnhandledRejectionTrap,
  makeChannels,
  settleAndObserve,
} from "./helpers/unhandled-rejection-trap";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProductionCheckpoint } from "../src/seams/production-checkpoint";
import type { CheckpointSite } from "../src/seams/checkpoint";
import { FakeClock } from "./helpers/fake-clock";
import {
  guardInvokeExecutionPromise,
  routeInvokeExecutionLateSettlement,
  type InvokeCancellationGuard,
} from "../src/runtime/invoke-swallowing-handler";

const INVOKE_SITE: CheckpointSite = {
  file: "parent.theta",
  line: 12,
  column: 3,
};

// --- recording side channels + unhandledRejection trap ----------------------

const rejectionTrap = createUnhandledRejectionTrap();
const { unhandled } = rejectionTrap;
beforeEach(rejectionTrap.install);
afterEach(rejectionTrap.dispose);

// ---------------------------------------------------------------------------
// cka-33 / V15h channel 1 — construction-site attachment before microtask.
// ---------------------------------------------------------------------------

describe("V15h-T — invoke-child execution-Promise construction-site attachment (cka-33 / V15h)", () => {
  it("cka-33 / V15h: guardInvokeExecutionPromise attaches its swallowing handler at construction so a late rejection landed via the Checkpoint seam raises no Node unhandledRejection", async () => {
    const clock = new FakeClock();
    const checkpoint = new ProductionCheckpoint(clock);
    const guard: InvokeCancellationGuard = { cancellationSurfaced: false };
    const { channels } = makeChannels();

    // The `invoke` child top-level execution Promise: it rejects only after the
    // `invoke` checkpoint has fired (landed via the Checkpoint seam), i.e. a
    // late post-checkpoint rejection. Constructed and guarded in one expression
    // so the handler must attach at the construction site, before the first
    // microtask boundary — a lazily-attached `.catch` would miss a rejection
    // already queued for `unhandledRejection`.
    const guarded = guardInvokeExecutionPromise(
      (async () => {
        await checkpoint.before("invoke", INVOKE_SITE);
        // Cancellation surfaces at the invoke checkpoint; the child Promise is
        // now abandoned but still settles late.
        guard.cancellationSurfaced = true;
        throw new Error("late invoke-child rejection after cancellation");
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
// cka-33 / V15h channels 2 & 3 — three-channel suppression of a late settlement.
// ---------------------------------------------------------------------------

describe("V15h-T — invoke-child late-settlement three-channel suppression (cka-33 / V15h)", () => {
  it("cka-33 / V15h: once cancellation has surfaced, a late settlement is discarded with no second RuntimeEvent and no diagnostic of any severity", () => {
    const { channels, events, diagnostics } = makeChannels();
    const guard: InvokeCancellationGuard = { cancellationSurfaced: true };

    // A late rejection whose `.message` would otherwise be diagnostic-worthy
    // (an OOM-style host failure). It MUST still be discarded — promotion to
    // `theta/runtime/internal-error` would re-introduce the second-event surface
    // the rule forbids.
    const disposition = routeInvokeExecutionLateSettlement(
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

  it("cka-33 / V15h: a late Ok(v) resolution after cancellation is likewise discarded on both emit channels", () => {
    const { channels, events, diagnostics } = makeChannels();
    const guard: InvokeCancellationGuard = { cancellationSurfaced: true };

    // The discriminator is whether cancellation surfaced, not the late-settle
    // kind — a late resolve is discarded exactly as a late reject is.
    const disposition = routeInvokeExecutionLateSettlement(
      { kind: "resolved", value: { ok: true } },
      guard,
      channels,
    );

    expect(events).toEqual([]);
    expect(diagnostics).toEqual([]);
    expect(disposition).toBe("discarded");
  });
});

// ---------------------------------------------------------------------------
// cka-33 / V15h — end-to-end via the Checkpoint seam: all three channels silent.
// ---------------------------------------------------------------------------

describe("V15h-T — invoke-child abandoned Promise total suppression via Checkpoint seam (cka-33 / V15h)", () => {
  it("cka-33 / V15h: a late settlement landed via the Checkpoint seam after the invoke checkpoint surfaced cause:'cancelled' is suppressed on all three side channels", async () => {
    const clock = new FakeClock();
    const checkpoint = new ProductionCheckpoint(clock);
    const guard: InvokeCancellationGuard = { cancellationSurfaced: false };
    const { channels, events, diagnostics } = makeChannels();

    const guarded = guardInvokeExecutionPromise(
      (async () => {
        // The invoke checkpoint fires; cancellation surfaces cause:"cancelled"
        // and the child execution Promise is abandoned.
        await checkpoint.before("invoke", INVOKE_SITE);
        guard.cancellationSurfaced = true;
        // The abandoned Promise settles late with a host failure.
        throw new Error("late invoke-child settlement");
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
