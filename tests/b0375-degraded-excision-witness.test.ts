import { describe, expect, it } from "vitest";
import {
  ThetaRegistry,
  type DrainStateSnapshot,
  type ParsedTheta,
} from "../src/extension/reload-wiring";
import {
  resolveSlashDispatch,
  routeDrainStateArm,
  type DispatchArm,
} from "../src/extension/drain-state";

// Bug 0375 — witness for the Phase-2 excision of the retired degraded-state
// machinery. The V9r tripwire rework landed the new machinery beside the old
// instead of replacing it, so the excised members still ship:
// `ThetaRegistry.markRuntimeDegraded`, the `"degraded-needs-reload"` tag value,
// `degradedNote`, the orphan `routeSlashDispatchWithReadFailover`, and
// `routeDrainStateArm`'s arm-(c) branch.
//
// Spec: pi-integration-contract/session-only-degraded-state.md — the
// `governed-by-rebind` resolution excises the `markRuntimeDegraded` writer, the
// `"degraded-needs-reload"` tag value, and `readDrainState` arm (c).
// pi-integration-contract/drain-state-contract.md — PIC-29/PIC-30 pin the arm
// enumeration closed at two arms (a third arm or alternative gating field is
// forbidden); PIC-31 pins the slash-site read-failover catch arm at arm (b).
//
// WHY these assertions are shaped for both directions: at HEAD b5ce7774 the
// retired members still ship, so the surface/export/behavioural cells red for
// the excised machinery being present. After the Phase-2 deletion the retired
// members are gone, the retired degraded shape is unrepresentable on the wire,
// and every cell goes green. Retired members are reached only through runtime
// casts / the module namespace object so this file compiles against the
// post-deletion tree (no static reference to a deleted export or tag literal).

const noopRun = async (): Promise<void> => {};
const theta = (slashName: string): ParsedTheta => ({
  slashName,
  frontmatter: { mode: "prompt" },
  body: { statements: [], tail: null },
  run: noopRun,
});

describe("bug 0375 — excised degraded-state machinery no longer ships", () => {
  // Cell 1 — surface absence. Fork: `markRuntimeDegraded` exists on the
  // instance, so `toBeUndefined()` reds. Post-fix: the writer is deleted, so the
  // property read is undefined and this greens.
  it("ThetaRegistry no longer exposes the excised markRuntimeDegraded writer", () => {
    const registry = new ThetaRegistry();
    expect(
      (registry as unknown as Record<string, unknown>).markRuntimeDegraded,
    ).toBeUndefined();
  });

  // Cell 2 — module-export absence. Fork: `degradedNote` and the orphan
  // `routeSlashDispatchWithReadFailover` are still exported functions, so both
  // reds. Post-fix: both exports are deleted and read as undefined — green.
  it("drain-state no longer exports degradedNote or the orphan routeSlashDispatchWithReadFailover", async () => {
    const mod = (await import("../src/extension/drain-state")) as Record<
      string,
      unknown
    >;
    expect(mod.degradedNote).toBeUndefined();
    expect(mod.routeSlashDispatchWithReadFailover).toBeUndefined();
  });

  // Cell 3 — behavioural death of the latent degraded note. Fork:
  // `markRuntimeDegraded` flips the tag to the excised `"degraded-needs-reload"`
  // value; `resolveSlashDispatch` routes the present entry through arm (c) and
  // returns the retired degraded note, so `outcome.kind` is `"note"` and the
  // dispatch expectation reds. Post-fix: the writer is gone, the tag stays
  // undefined, the present entry routes through arm (a) and dispatches — green.
  //
  // WHY: the excision makes the retired degraded shape unrepresentable, so this
  // behavioural landmine (a live-spec note one public call away) cannot recur.
  it("a marked-degraded registry still dispatches a present entry (the latent degraded note is gone)", () => {
    const registry = new ThetaRegistry([["x", theta("x")]]);
    const mark = (registry as unknown as Record<string, unknown>).markRuntimeDegraded;
    if (typeof mark === "function") {
      (mark as () => void).call(registry);
    }
    const outcome = resolveSlashDispatch("x", registry.readDrainState(), registry);
    expect(outcome.kind).toBe("dispatch");
  });

  // Cell 4 — two-arm surface pin (green both directions; documents the closed
  // PIC-29/PIC-30 enumeration). The four representable tuples over the surviving
  // `DrainStateSnapshot` shape (tag ∈ {undefined, "shutting-down"}) route onto
  // exactly two arms. The retired `"degraded-needs-reload"` literal is not named
  // here, so this holds identically before and after the deletion.
  it("routeDrainStateArm's representable tuples collapse onto exactly two arms", () => {
    const tuples: readonly DrainStateSnapshot[] = [
      { drained: false, tag: undefined },
      { drained: true, tag: undefined },
      { drained: false, tag: "shutting-down" },
      { drained: true, tag: "shutting-down" },
    ];
    const arms = new Set<DispatchArm>(tuples.map((t) => routeDrainStateArm(t)));
    expect(arms).toEqual(new Set<DispatchArm>(["dispatch", "shutting-down"]));
    expect(arms.size).toBe(2);
  });
});
