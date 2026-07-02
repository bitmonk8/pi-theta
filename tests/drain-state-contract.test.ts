import { describe, expect, it } from "vitest";
import {
  LoomRegistry,
  type DrainStateSnapshot,
  type DrainStateTag,
  type ParsedLoom,
} from "../src/extension/reload-wiring";
import {
  routeDrainStateArm,
  shouldShortCircuitShutdown,
  routeSlashDispatchWithReadFailover,
  evalShutdownShortCircuitWithReadFailover,
  resolveSlashDispatch,
  shuttingDownNote,
  degradedNote,
  supersededNote,
  type DispatchArm,
} from "../src/extension/drain-state";

// V9m-T — failing tests for the `LoomRegistry` drain-state contract (paired
// V9m implementation leaf).
//
// Spec: pi-integration-contract/drain-state-contract.md (PIC-29 closed
// three-arm dispatch + mutual-exclusivity/exhaustiveness + short-circuit
// predicate; PIC-30 no fourth arm / no third boolean field / no arm-specific
// gate; PIC-31 read-failure fail-safe at both call sites; PIC-32 `drain()` sets
// `drained = true` and predicate idempotence),
// pi-integration-contract/registration-steps.md#superseded-entry-dispatch.
//
// Each test cites its REQ-ID inline per the conventions.md REQ-ID-discipline
// and Diagnostic-message-anchor rules. These tests are written against the
// seams the paired V9m implementation fills in; they MUST fail red for the
// intended reason (the routing / writer behaviour is absent), not on a compile
// error or harness throw.

const snap = (
  drained: boolean,
  tag: DrainStateTag | undefined,
): DrainStateSnapshot => ({ drained, tag });

// The closed PIC-29 tuple-to-arm map: six tuples, three arms.
const TUPLE_TO_ARM: ReadonlyArray<{
  readonly snapshot: DrainStateSnapshot;
  readonly arm: DispatchArm;
}> = [
  { snapshot: snap(false, undefined), arm: "dispatch" },
  { snapshot: snap(false, "shutting-down"), arm: "shutting-down" },
  { snapshot: snap(true, "shutting-down"), arm: "shutting-down" },
  { snapshot: snap(true, undefined), arm: "shutting-down" },
  { snapshot: snap(false, "degraded-needs-reload"), arm: "degraded-needs-reload" },
  { snapshot: snap(true, "degraded-needs-reload"), arm: "degraded-needs-reload" },
];

// --- PIC-29 — closed three-arm dispatch + mutual-exclusivity / exhaustiveness ---

describe("V9m-T — three-arm drain-state dispatch (PIC-29)", () => {
  it("PIC-29: each of the six field tuples routes to its closed-enumeration arm (the arms are mutually exclusive and exhaust the state space)", () => {
    for (const { snapshot, arm } of TUPLE_TO_ARM) {
      expect(routeDrainStateArm(snapshot)).toBe(arm);
    }
  });

  it("PIC-29: the short-circuit predicate `drained === true || tag !== undefined` fires on every tuple except the steady-state (false, undefined)", () => {
    expect(shouldShortCircuitShutdown(snap(false, undefined))).toBe(false);
    expect(shouldShortCircuitShutdown(snap(false, "shutting-down"))).toBe(true);
    expect(shouldShortCircuitShutdown(snap(true, "shutting-down"))).toBe(true);
    expect(shouldShortCircuitShutdown(snap(true, undefined))).toBe(true);
    expect(shouldShortCircuitShutdown(snap(false, "degraded-needs-reload"))).toBe(
      true,
    );
    expect(shouldShortCircuitShutdown(snap(true, "degraded-needs-reload"))).toBe(
      true,
    );
  });

  it("PIC-29: the non-dispatch arms return their fixed system notes", () => {
    // Arm (b) and arm (c) note templates are fixed; `<name>` is the only
    // substitution (drain-state-contract.md *Methods* arms (b)/(c)).
    expect(shuttingDownNote("foo")).toBe("loom /foo: extension shutting down");
    expect(degradedNote("foo")).toBe(
      "loom /foo: extension degraded; /reload to recover",
    );
  });
});

// --- PIC-30 — no fourth arm, no third boolean field, no arm-specific gate ---

describe("V9m-T — drain-state shape constraints (PIC-30)", () => {
  it("PIC-30: routing the full six-tuple state space yields exactly the three closed arms — no fourth arm", () => {
    const arms = new Set<DispatchArm>(
      TUPLE_TO_ARM.map(({ snapshot }) => routeDrainStateArm(snapshot)),
    );
    expect([...arms].sort()).toEqual(
      ["degraded-needs-reload", "dispatch", "shutting-down"],
    );
    expect(arms.size).toBe(3);
  });

  it("PIC-30: the readDrainState snapshot exposes exactly the two fields `drained` and `tag` — no third boolean drain-state field", () => {
    const registry = new LoomRegistry();
    const snapshot = registry.readDrainState();
    expect(Object.keys(snapshot).sort()).toEqual(["drained", "tag"]);
  });

  it("PIC-30: no arm-specific post-failed-handler gate — the post-failed-handler tuple (false, undefined) still routes to arm (a) dispatch", () => {
    // The all-three-throw / read-failure corner case leaves (drained: false,
    // tag: undefined); the slash handler MUST route it through arm (a) dispatch
    // rather than a suppression gate.
    expect(routeDrainStateArm(snap(false, undefined))).toBe("dispatch");
  });
});

// --- PIC-31 — read-failure fail-safe at both readDrainState call sites ---

describe("V9m-T — readDrainState read-failure fail-safe (PIC-31)", () => {
  const throwingRead = (): DrainStateSnapshot => {
    throw new Error("readDrainState blew up");
  };

  it("PIC-31: a slash-site read-failure fails safe onto arm (c) (the degraded note's /reload action is correct on every non-dispatch arm)", () => {
    expect(routeSlashDispatchWithReadFailover(throwingRead)).toBe(
      "degraded-needs-reload",
    );
  });

  it("PIC-31: a successful slash-site read still routes through the normal three-arm enumeration", () => {
    expect(routeSlashDispatchWithReadFailover(() => snap(false, undefined))).toBe(
      "dispatch",
    );
    expect(
      routeSlashDispatchWithReadFailover(() => snap(true, "degraded-needs-reload")),
    ).toBe("degraded-needs-reload");
  });

  it("PIC-31: a handler-entry read-failure fails safe to steady-state (predicate not fired) so the full teardown runs", () => {
    // The catch arm treats the read as the steady-state tuple — equivalently,
    // as if the predicate had NOT fired — so the handler proceeds into the full
    // five-sub-step teardown rather than short-circuiting and stranding it.
    expect(evalShutdownShortCircuitWithReadFailover(throwingRead)).toBe(false);
  });

  it("PIC-31: a successful handler-entry read still drives the short-circuit predicate", () => {
    expect(
      evalShutdownShortCircuitWithReadFailover(() => snap(false, undefined)),
    ).toBe(false);
    expect(
      evalShutdownShortCircuitWithReadFailover(() => snap(true, undefined)),
    ).toBe(true);
  });
});

// --- PIC-32 — drain() sets drained = true; predicate idempotence ---

describe("V9m-T — drain() and predicate idempotence (PIC-32)", () => {
  it("PIC-32: LoomRegistry.drain() flips `drained` to true", () => {
    const registry = new LoomRegistry();
    expect(registry.readDrainState().drained).toBe(false);
    registry.drain();
    expect(registry.readDrainState().drained).toBe(true);
  });

  it("PIC-32: the short-circuit predicate `drained === true || tag !== undefined` is idempotent — re-evaluation yields the same result and mutates nothing", () => {
    const registry = new LoomRegistry();
    registry.drain();
    const first = registry.readDrainState();
    const a = shouldShortCircuitShutdown(first);
    const b = shouldShortCircuitShutdown(first);
    expect(a).toBe(true);
    expect(b).toBe(a);
    // A second drain() re-writes the same `true` and does not perturb the tuple.
    registry.drain();
    expect(registry.readDrainState()).toEqual(first);
  });
});

// --- superseded-entry dispatch (registration-steps.md#superseded-entry-dispatch) ---

describe("V9m-T — superseded-entry dispatch (PIC area)", () => {
  const noopRun = async (): Promise<void> => {};
  const loom = (slashName: string): ParsedLoom => ({
    slashName,
    frontmatter: { mode: "prompt" },
    body: { statements: [], tail: null },
    run: noopRun,
  });

  it("PIC area: after a supersession pass drops the entry, a steady-state dispatch reaches arm (a), the entry-table lookup misses, and the fixed superseded note is returned", () => {
    // The entry was dropped (empty table); `readDrainState` returns the
    // steady-state tuple, so arm (a) is selected, the lookup misses, and the
    // handler returns the fixed superseded note rather than dispatching.
    const registry = new LoomRegistry();
    const outcome = resolveSlashDispatch("foo", snap(false, undefined), registry);
    expect(outcome.kind).toBe("note");
    if (outcome.kind === "note") {
      expect(outcome.content).toBe("loom /foo: superseded; /reload to refresh");
      expect(outcome.content).toBe(supersededNote("foo"));
    }
  });

  it("PIC area: a present entry on the steady-state tuple dispatches the loom (the miss path is a sub-case of arm (a))", () => {
    const registry = new LoomRegistry([["foo", loom("foo")]]);
    const outcome = resolveSlashDispatch("foo", snap(false, undefined), registry);
    expect(outcome.kind).toBe("dispatch");
    if (outcome.kind === "dispatch") {
      expect(outcome.loom.slashName).toBe("foo");
    }
  });
});
