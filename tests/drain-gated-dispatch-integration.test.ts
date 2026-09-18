import { describe, expect, it } from "vitest";
import {
  bootRegistryHarness as boot,
  invoke,
  makeTheta,
  thetaNotes,
} from "./helpers/watch-arming-harness";
import { ThetaRegistry } from "../src/extension/reload-wiring";

// PIC-29..32 — factory-level drain-gated dispatch integration.
//
// Proves the just-landed wiring in `factory.ts`: on the composeInstance
// production path `registerFixtures(fixtures, registry)` registers a
// drain-state-gated dispatch WRAPPER (`drainGatedHandler(name, registry)`) as
// the pi command handler — NOT a raw pass-through. At dispatch time the wrapper
// reads `registry.readDrainState()` under the PIC-31 slash-site fail-safe and
// either dispatches the registry's CURRENT raw entry (arm (a) dispatch, and its
// superseded-entry sub-case) or emits the shutting-down / superseded note on the
// `theta-system-note` channel with `triggerTurn:false`.
//
// `bootRegistryHarness` in `tests/helpers/watch-arming-harness.ts` captures
// `registerCommand` handlers + `sendMessage` notes and fires `session_start`.
// Its `composeInstance` is a deterministic stub returning a `ThetaRegistry`
// this test fully controls (a no-op `installHotReload`), so there is NO
// filesystem, NO watcher, and NO live model — the REAL registration path is
// still exercised end-to-end.

describe("PIC-29..32 — drain-gated dispatch through the real registration path", () => {
  it("(1) normal dispatch: arm (a) runs the theta's raw run and emits NO note", async () => {
    // PIC-29 arm (a) dispatch: steady-state registry (drained:false, tag:undefined)
    // with `/foo` present → the wrapper dispatches the registry's current raw entry.
    let ran = false;
    const foo = makeTheta("foo", async () => {
      ran = true;
    });
    const registry = new ThetaRegistry([["foo", foo]]);
    const harness = await boot(registry, [foo]);

    expect(harness.commands.has("foo")).toBe(true);
    await invoke(harness, "foo", "some args");

    expect(ran).toBe(true);
    expect(thetaNotes(harness)).toEqual([]);
  });

  it("(2) superseded note: a dropped entry yields the superseded note, dispatches no theta", async () => {
    // PIC-29 arm (a) superseded-entry-dispatch sub-case
    // (registration-steps.md#superseded-entry-dispatch): steady-state drain
    // tuple but the slash name is absent from the registry → the fixed
    // superseded note, NOT a fourth arm and NOT a dispatch.
    let ran = false;
    const foo = makeTheta("foo", async () => {
      ran = true;
    });
    const registry = new ThetaRegistry([["foo", foo]]);
    const harness = await boot(registry, [foo]);

    // Drop `/foo` from the registry (publish a map WITHOUT it). The command
    // handler was already registered once; the wrapper looks up the CURRENT
    // entry at dispatch time.
    registry.publish(new Map());
    await invoke(harness, "foo");

    const notes = thetaNotes(harness);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.content).toBe("theta /foo: superseded; /reload to refresh");
    expect(notes[0]?.customType).toBe("theta-system-note");
    expect(notes[0]?.triggerTurn).toBe(false);
    expect(ran).toBe(false);
  });

  it("(3) shutting-down note: after registry.drain() the theta does not run", async () => {
    // PIC-32 drain: `ThetaRegistry.drain()` sets drained:true → arm (b), the
    // shutting-down note; the theta is NOT dispatched.
    let ran = false;
    const foo = makeTheta("foo", async () => {
      ran = true;
    });
    const registry = new ThetaRegistry([["foo", foo]]);
    const harness = await boot(registry, [foo]);

    registry.drain();
    await invoke(harness, "foo");

    const notes = thetaNotes(harness);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.content).toBe("theta /foo: extension shutting down");
    expect(notes[0]?.customType).toBe("theta-system-note");
    expect(notes[0]?.triggerTurn).toBe(false);
    expect(ran).toBe(false);
  });

  it("(4) post-swap dispatch is current: the SAME captured handler runs the swapped-in v2 theta", async () => {
    // PIC-29 arm (a) dispatch — the wrapper dispatches `registry.get(name)`, not
    // the captured closure: a publish that swaps `/foo` to a v2 theta is picked
    // up on the next dispatch of the handler registered ONCE at session_start.
    let ranV1 = false;
    let ranV2 = false;
    const fooV1 = makeTheta("foo", async () => {
      ranV1 = true;
    });
    const registry = new ThetaRegistry([["foo", fooV1]]);
    const harness = await boot(registry, [fooV1]);

    // Swap the entry to a v2 theta whose run sets a DIFFERENT flag.
    const fooV2 = makeTheta("foo", async () => {
      ranV2 = true;
    });
    registry.publish(new Map([["foo", fooV2]]));

    // Invoke the SAME captured `/foo` handler (registered once at session_start).
    await invoke(harness, "foo");

    expect(ranV2).toBe(true);
    expect(ranV1).toBe(false);
    expect(thetaNotes(harness)).toEqual([]);
  });
});
