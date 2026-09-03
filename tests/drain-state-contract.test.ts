import { describe, expect, it } from "vitest";
import {
  ThetaRegistry,
  type DrainStateSnapshot,
  type DrainStateTag,
  type ParsedTheta,
} from "../src/extension/reload-wiring";
import {
  routeDrainStateArm,
  shouldShortCircuitShutdown,
  resolveSlashDispatchWithReadFailover,
  evalShutdownShortCircuitWithReadFailover,
  resolveSlashDispatch,
  shuttingDownNote,
  supersededNote,
  type DispatchArm,
} from "../src/extension/drain-state";

// V9m-T — failing tests for the `ThetaRegistry` drain-state contract (paired
// V9m implementation leaf).
//
// Spec: pi-integration-contract/drain-state-contract.md (PIC-29 closed
// two-arm dispatch + mutual-exclusivity/exhaustiveness + short-circuit
// predicate; PIC-30 no third arm / no third boolean field / no arm-specific
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

// The closed PIC-29 tuple-to-arm map: four tuples, two arms.
const TUPLE_TO_ARM: ReadonlyArray<{
  readonly snapshot: DrainStateSnapshot;
  readonly arm: DispatchArm;
}> = [
  { snapshot: snap(false, undefined), arm: "dispatch" },
  { snapshot: snap(false, "shutting-down"), arm: "shutting-down" },
  { snapshot: snap(true, "shutting-down"), arm: "shutting-down" },
  { snapshot: snap(true, undefined), arm: "shutting-down" },
];

// --- PIC-29 — closed two-arm dispatch + mutual-exclusivity / exhaustiveness ---

describe("V9m-T — two-arm drain-state dispatch (PIC-29)", () => {
  it("PIC-29: each of the four field tuples routes to its closed-enumeration arm (the arms are mutually exclusive and exhaust the state space)", () => {
    for (const { snapshot, arm } of TUPLE_TO_ARM) {
      expect(routeDrainStateArm(snapshot)).toBe(arm);
    }
  });

  it("PIC-29: the short-circuit predicate `drained === true || tag !== undefined` fires on every tuple except the steady-state (false, undefined)", () => {
    expect(shouldShortCircuitShutdown(snap(false, undefined))).toBe(false);
    expect(shouldShortCircuitShutdown(snap(false, "shutting-down"))).toBe(true);
    expect(shouldShortCircuitShutdown(snap(true, "shutting-down"))).toBe(true);
    expect(shouldShortCircuitShutdown(snap(true, undefined))).toBe(true);
  });

  it("PIC-29: the non-dispatch arms return their fixed system notes", () => {
    // Arm (b) note template is fixed; `<name>` is the only substitution
    // (drain-state-contract.md *Methods* arm (b)).
    expect(shuttingDownNote("foo")).toBe("theta /foo: extension shutting down");
  });
});

// --- PIC-30 — no third arm, no third boolean field, no arm-specific gate ---

describe("V9m-T — drain-state shape constraints (PIC-30)", () => {
  it("PIC-30: routing the full four-tuple state space yields exactly the two closed arms — no third arm", () => {
    const arms = new Set<DispatchArm>(
      TUPLE_TO_ARM.map(({ snapshot }) => routeDrainStateArm(snapshot)),
    );
    expect([...arms].sort()).toEqual(
      ["dispatch", "shutting-down"],
    );
    expect(arms.size).toBe(2);
  });

  it("PIC-30: the readDrainState snapshot exposes exactly the two fields `drained` and `tag` — no third boolean drain-state field", () => {
    const registry = new ThetaRegistry();
    const snapshot = registry.readDrainState();
    expect(Object.keys(snapshot).sort()).toEqual(["drained", "tag"]);
  });

  it("PIC-30: no arm-specific post-failed-handler gate — the post-failed-handler tuple (false, undefined) still routes to arm (a) dispatch", () => {
    // The both-sub-step-1-acts-throw / read-failure corner case leaves (drained: false,
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
  it("PIC-32: ThetaRegistry.drain() flips `drained` to true", () => {
    const registry = new ThetaRegistry();
    expect(registry.readDrainState().drained).toBe(false);
    registry.drain();
    expect(registry.readDrainState().drained).toBe(true);
  });

  it("PIC-32: the short-circuit predicate `drained === true || tag !== undefined` is idempotent — re-evaluation yields the same result and mutates nothing", () => {
    const registry = new ThetaRegistry();
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

// DISC-4 / V9m: the DISC-4 discovery obligation closes across V10a (collision
// detection) and V9m (superseded-entry dispatch); the assertion below witnesses
// the V9m superseded-entry-dispatch facet against the shipped ThetaRegistry.
describe("V9m-T — superseded-entry dispatch (PIC area)", () => {
  const noopRun = async (): Promise<void> => {};
  const theta = (slashName: string): ParsedTheta => ({
    slashName,
    frontmatter: { mode: "prompt" },
    body: { statements: [], tail: null },
    run: noopRun,
  });

  it("PIC area: after a supersession pass drops the entry, a steady-state dispatch reaches arm (a), the entry-table lookup misses, and the fixed superseded note is returned", () => {
    // The entry was dropped (empty table); `readDrainState` returns the
    // steady-state tuple, so arm (a) is selected, the lookup misses, and the
    // handler returns the fixed superseded note rather than dispatching.
    const registry = new ThetaRegistry();
    const outcome = resolveSlashDispatch("foo", snap(false, undefined), registry);
    expect(outcome.kind).toBe("note");
    if (outcome.kind === "note") {
      expect(outcome.content).toBe("theta /foo: superseded; /reload to refresh");
      expect(outcome.content).toBe(supersededNote("foo"));
    }
  });

  it("PIC area: a present entry on the steady-state tuple dispatches the theta (the miss path is a sub-case of arm (a))", () => {
    const registry = new ThetaRegistry([["foo", theta("foo")]]);
    const outcome = resolveSlashDispatch("foo", snap(false, undefined), registry);
    expect(outcome.kind).toBe("dispatch");
    if (outcome.kind === "dispatch") {
      expect(outcome.theta.slashName).toBe("foo");
    }
  });
});

// The slash-command call-site consumer wired into the composeInstance handler
// (factory.ts `drainGatedHandler`). It performs the PIC-31 slash-site read under
// its own try/catch, then resolves the outcome through `resolveSlashDispatch`.
// This consumer fails safe onto arm (b) shutting-down per the live two-arm
// contract (drain-state-contract.md#read-failure-fallback).
describe("V9m — resolveSlashDispatchWithReadFailover (slash-site consumer)", () => {
  const noopRun = async (): Promise<void> => {};
  const theta = (slashName: string): ParsedTheta => ({
    slashName,
    frontmatter: { mode: "prompt" },
    body: { statements: [], tail: null },
    run: noopRun,
  });
  const throwingRead = (): DrainStateSnapshot => {
    throw new Error("readDrainState blew up");
  };

  it("PIC-31: a slash-site read-failure fails safe onto arm (b) shutting-down (live two-arm contract)", () => {
    const registry = new ThetaRegistry([["foo", theta("foo")]]);
    const outcome = resolveSlashDispatchWithReadFailover(
      "foo",
      throwingRead,
      registry,
    );
    expect(outcome.kind).toBe("note");
    if (outcome.kind === "note") {
      expect(outcome.content).toBe(shuttingDownNote("foo"));
      expect(outcome.content).toBe("theta /foo: extension shutting down");
    }
  });

  it("PIC-29/arm-(a): a successful steady-state read with a present entry dispatches the CURRENT registry entry", () => {
    const registry = new ThetaRegistry([["foo", theta("foo")]]);
    const outcome = resolveSlashDispatchWithReadFailover(
      "foo",
      () => snap(false, undefined),
      registry,
    );
    expect(outcome.kind).toBe("dispatch");
    if (outcome.kind === "dispatch") {
      expect(outcome.theta.slashName).toBe("foo");
    }
  });

  it("superseded: a successful steady-state read with a dropped entry returns the superseded note", () => {
    const registry = new ThetaRegistry();
    const outcome = resolveSlashDispatchWithReadFailover(
      "foo",
      () => snap(false, undefined),
      registry,
    );
    expect(outcome.kind).toBe("note");
    if (outcome.kind === "note") {
      expect(outcome.content).toBe(supersededNote("foo"));
    }
  });

  it("PIC-29/arm-(b): a successful read of a shutting-down tuple returns the shutting-down note (no dispatch)", () => {
    const registry = new ThetaRegistry([["foo", theta("foo")]]);
    const outcome = resolveSlashDispatchWithReadFailover(
      "foo",
      () => snap(true, undefined),
      registry,
    );
    expect(outcome.kind).toBe("note");
    if (outcome.kind === "note") {
      expect(outcome.content).toBe(shuttingDownNote("foo"));
    }
  });
});
