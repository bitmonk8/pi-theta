import { describe, expect, it } from "vitest";
import {
  FACTORY_PROBABLE_CAPABILITIES,
  runCapabilityProbe,
  type ProbeFailureDetails,
  type ProbeHost,
  type ProbeOutcome,
} from "../src/extension/capability-probe";

// V9a-T — failing tests for the Step 0 capability probe (paired V9a impl).
//
// Spec: pi-integration-contract/capability-probe.md (canonical source of truth
// for every probe rule) + host-prerequisites.md. The probe-wide invariants
// PIC-3/4/5/6 and the closed `theta/load/host-incompatible` `details.kind`
// discriminator set are exercised below. Each test cites its `PREFIX-N` inline.
//
// The probe is a pure function over an injected host snapshot: tests build both
// a conformant host (`makePassingHost`) and adversarial hosts so the probe's
// `typeof`/`in`-only, never-construct, never-throw, exactly-five-checks
// contract is witnessed by behaviour rather than by source inspection.

// ── Conformant-host builder ─────────────────────────────────────────────────

// A passing host whose checks all succeed. The Pi-side function members are
// zero-arity `() => {}` thunks: a conformant probe checks only
// `typeof === "function"`, never arity (PIC-4), so a zero-arg thunk passes.
//
// RFC-0005 (capability-probe.md Step 0 (c)): capability 3's former in-process
// `createAgentSession` / `AgentSession.prototype.abort` `typeof` members are
// retired (capability 3 is now verified by the Step 0 (f) executable probe), so
// the passing host no longer carries them and the seven-member (c) loop covers
// capabilities 1/2/4/6 only.

function makePiNamespace(): Record<string, unknown> {
  return {
    registerCommand: () => {},
    sendUserMessage: () => {},
    registerTool: () => {},
    setActiveTools: () => {},
    getActiveTools: () => {},
    registerMessageRenderer: () => {},
    sendMessage: () => {},
  };
}

function makePassingHost(overrides: Partial<ProbeHost> = {}): ProbeHost {
  return {
    nodeVersion: "22.19.0",
    // Real Node WHATWG globals: their `aborted`/`reason` accessor getters throw
    // "Illegal invocation" when read off the prototype, so a conformant `in`-
    // based probe passes while a `typeof`-read probe would throw (PIC-3/PIC-4).
    abortController: AbortController,
    abortSignal: AbortSignal,
    pi: makePiNamespace(),
    typeboxType: { Unsafe: () => {} },
    // All four lock-step peers report an in-range version (>=0.80.8).
    readPeerVersion: () => "0.80.10",
    ...overrides,
  };
}

// ── Adversarial AbortSignal builders ────────────────────────────────────────

// A fake `AbortSignal` constructor whose member surface is conformant except
// for the one omitted member, so the probe's per-member kind table is exercised
// in isolation. `aborted`/`reason` are accessor properties (so `"name" in
// prototype` answers presence without a getter read).
function makeFakeAbortSignal(omit?: string): unknown {
  const proto: Record<string, unknown> = {
    throwIfAborted: () => {},
    addEventListener: () => {},
  };
  if (omit !== "aborted") {
    Object.defineProperty(proto, "aborted", {
      get: () => false,
      enumerable: false,
      configurable: true,
    });
  }
  if (omit !== "reason") {
    Object.defineProperty(proto, "reason", {
      get: () => undefined,
      enumerable: false,
      configurable: true,
    });
  }
  if (omit === "throwIfAborted") delete proto.throwIfAborted;
  if (omit === "addEventListener") delete proto.addEventListener;

  const ctor = function FakeAbortSignal(): void {} as unknown as {
    any?: unknown;
    timeout?: unknown;
    prototype: Record<string, unknown>;
  };
  ctor.prototype = proto;
  if (omit !== "any") ctor.any = () => {};
  if (omit !== "timeout") ctor.timeout = () => {};
  return ctor;
}

// A fake `AbortSignal` whose `aborted`/`reason` accessor getters THROW when
// read (mirroring the real "Illegal invocation" behaviour off the prototype)
// but whose `in`-presence is true: a conformant probe uses `"name" in proto`
// and passes; a non-conformant `typeof proto.aborted` read would throw.
function makeThrowingAccessorAbortSignal(): unknown {
  const thrower = (): never => {
    throw new TypeError("Illegal invocation");
  };
  const proto: Record<string, unknown> = {
    throwIfAborted: () => {},
    addEventListener: () => {},
  };
  Object.defineProperty(proto, "aborted", {
    get: thrower,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(proto, "reason", {
    get: thrower,
    enumerable: false,
    configurable: true,
  });
  const ctor = function FakeAbortSignal(): void {} as unknown as {
    any: unknown;
    timeout: unknown;
    prototype: Record<string, unknown>;
  };
  ctor.prototype = proto;
  ctor.any = () => {};
  ctor.timeout = () => {};
  return ctor;
}

// ── Outcome narrowing helpers (no silent skipping — fail loudly) ─────────────

function expectFailure(outcome: ProbeOutcome): ProbeFailureDetails {
  if (outcome.ok) {
    expect.fail("expected the probe to refuse, but it returned ok");
  }
  return outcome.details;
}

function expectOk(outcome: ProbeOutcome): void {
  if (!outcome.ok) {
    expect.fail(
      `expected the probe to pass, but it refused with kind=${outcome.details.kind}`,
    );
  }
}

// ── PIC-3 — the probe never uses a member it is checking ─────────────────────

describe("V9a capability probe — PIC-3 (never use a checked member)", () => {
  it("PIC-3: passes a host whose AbortSignal aborted/reason getters throw when read (uses `in`, not a value read)", () => {
    // The accessor getters throw on read; an `in`-based prototype-property
    // check answers presence without touching them. A probe that read the
    // member it is checking would throw and route to probe-failed.
    const host = makePassingHost({
      abortSignal: makeThrowingAccessorAbortSignal(),
    });
    expectOk(runCapabilityProbe(host));
  });

  it("PIC-3: passes against the real WHATWG AbortSignal global (prototype accessor getters throw on read)", () => {
    // The real global's `aborted`/`reason` getters throw "Illegal invocation"
    // off the prototype; the conformant `in`-keyed probe must not read them.
    expectOk(runCapabilityProbe(makePassingHost()));
  });
});

// ── PIC-4 — typeof/in only: no arity/return-shape sniffing, no construction ──

describe("V9a capability probe — PIC-4 (typeof/in only, no construction)", () => {
  it("PIC-4: does not construct AbortController (a constructor that throws on `new` still passes)", () => {
    class ThrowOnConstruct {
      constructor() {
        throw new Error("the probe must not construct AbortController");
      }
      abort(): void {}
    }
    const host = makePassingHost({ abortController: ThrowOnConstruct });
    expectOk(runCapabilityProbe(host));
  });

  it("PIC-4: does not sniff arity — zero-arity function members satisfy the typeof checks", () => {
    // makePassingHost's Pi members and createAgentSession are zero-arg thunks;
    // a probe that checked `fn.length` against the real signatures would fail.
    expectOk(runCapabilityProbe(makePassingHost()));
  });
});

// ── PIC-5 — exactly five checks; FACTORY_PROBABLE_CAPABILITIES enumeration ───

describe("V9a capability probe — PIC-5 (exactly five checks)", () => {
  it("PIC-5: consults exactly the five enumerated check categories on a passing host, and no sixth", () => {
    // A recording host that tags each of the five check categories on access.
    // A conformant probe touches all five (a/b/c/d/e) and nothing else.
    const base = makePassingHost();
    const log: string[] = [];
    const recording: ProbeHost = {
      get nodeVersion() {
        log.push("a:node-floor");
        return base.nodeVersion;
      },
      get abortController() {
        log.push("b:abortsignal-shape");
        return base.abortController;
      },
      get abortSignal() {
        log.push("b:abortsignal-shape");
        return base.abortSignal;
      },
      get pi() {
        log.push("c:sdk-capability");
        return base.pi;
      },
      readPeerVersion(pkg: string): string | undefined {
        log.push("d:peer-dep");
        return base.readPeerVersion(pkg);
      },
      get typeboxType() {
        log.push("e:typebox-shape");
        return base.typeboxType;
      },
    };

    expectOk(runCapabilityProbe(recording));
    expect([...new Set(log)].sort()).toEqual([
      "a:node-floor",
      "b:abortsignal-shape",
      "c:sdk-capability",
      "d:peer-dep",
      "e:typebox-shape",
    ]);
  });

  it("PIC-5: FACTORY_PROBABLE_CAPABILITIES enumerates exactly inventory items 1/2/4/6 and nothing else", () => {
    // RFC-0005 re-base (capability-probe.md Step 0 (c): "items 1, 2, 4, and 6
    // (four capabilities, seven function members)"). Capability 3's in-process
    // `createAgentSession` member is retired — it is verified by Step 0 (f).
    expect([...FACTORY_PROBABLE_CAPABILITIES]).toEqual([1, 2, 4, 6]);
    expect(FACTORY_PROBABLE_CAPABILITIES).toHaveLength(4);
  });
});

// ── PIC-6 — the factory never throws (each check try/catch-wrapped) ──────────

describe("V9a capability probe — PIC-6 (never throws)", () => {
  it("PIC-6: a host whose nodeVersion read throws routes to probe-failed instead of escaping", () => {
    // A getter that throws when the first check reads it: the probe must trap
    // it and return a probe-failed refusal rather than propagating.
    const base = makePassingHost();
    const host: ProbeHost = {
      ...base,
      get nodeVersion(): string {
        throw new Error("hostile process.versions getter");
      },
    };
    let outcome: ProbeOutcome | undefined;
    expect(() => {
      outcome = runCapabilityProbe(host);
    }).not.toThrow();
    const details = expectFailure(outcome as ProbeOutcome);
    expect(details.kind).toBe("probe-failed");
    expect(details.step).toBe("node-floor");
  });

  it("PIC-6: a host whose peer-version read throws routes to probe-failed with the offending package named", () => {
    const host = makePassingHost({
      readPeerVersion: (pkg: string): string => {
        throw new Error(`EACCES reading ${pkg}/package.json`);
      },
    });
    let outcome: ProbeOutcome | undefined;
    expect(() => {
      outcome = runCapabilityProbe(host);
    }).not.toThrow();
    const details = expectFailure(outcome as ProbeOutcome);
    expect(details.kind).toBe("probe-failed");
    expect(details.step).toBe("peer-dep-version");
    expect(details.package).toBe("@earendil-works/pi-coding-agent");
    expect(typeof details.cause).toBe("string");
  });
});

// ── Closed `details.kind` discriminator set ─────────────────────────────────
// The failure outcome is the structured `theta/load/host-incompatible` payload
// (diagnostics/code-registry-load.md). Observed/required substrings are sourced
// from the per-`kind` enumeration in diagnostics/placeholder-rendering-b.md
// (#host-incompatible-observed-required).

describe("V9a capability probe — host-incompatible details.kind discriminator", () => {
  it("node-floor: a sub-floor Node version refuses with kind node-floor and the pinned floor", () => {
    const details = expectFailure(
      runCapabilityProbe(makePassingHost({ nodeVersion: "18.19.0" })),
    );
    expect(details.kind).toBe("node-floor");
    expect(details.observed).toBe("18.19.0");
    expect(details.required).toBe(">=22.19.0");
  });

  it("node-floor: a qualifying prerelease build (prerelease tags eligible) passes the floor", () => {
    // capability-probe.md Step 0 (a): prerelease-eligibility is load-bearing.
    expectOk(
      runCapabilityProbe(
        makePassingHost({ nodeVersion: "23.0.0-nightly20250101abcdef" }),
      ),
    );
  });

  it("node-floor: a non-SemVer node version routes to probe-failed, not node-floor", () => {
    const details = expectFailure(
      runCapabilityProbe(makePassingHost({ nodeVersion: "not-a-version" })),
    );
    expect(details.kind).toBe("probe-failed");
    expect(details.step).toBe("node-floor");
  });

  it("abortsignal-shape: a missing typeof-checked member (AbortSignal.any) refuses with observed undefined, required function", () => {
    const details = expectFailure(
      runCapabilityProbe(
        makePassingHost({ abortSignal: makeFakeAbortSignal("any") }),
      ),
    );
    expect(details.kind).toBe("abortsignal-shape");
    expect(details.observed).toBe("undefined");
    expect(details.required).toBe("function");
  });

  it("abortsignal-shape: an absent prototype-property member (reason) refuses with observed absent, required present", () => {
    const details = expectFailure(
      runCapabilityProbe(
        makePassingHost({ abortSignal: makeFakeAbortSignal("reason") }),
      ),
    );
    expect(details.kind).toBe("abortsignal-shape");
    expect(details.observed).toBe("absent");
    expect(details.required).toBe("present");
  });

  it("sdk-capability-missing: an absent pi.sendUserMessage refuses with member naming the failing path", () => {
    // RFC-0005 re-base (capability-probe.md Step 0 (c)): capability 3's
    // `createAgentSession` member is retired; capability 2's `pi.sendUserMessage`
    // is the second member in the listed order and the deterministic first
    // failure once `pi.registerCommand` is present.
    const pi = makePiNamespace();
    delete pi.sendUserMessage;
    const details = expectFailure(
      runCapabilityProbe(makePassingHost({ pi })),
    );
    expect(details.kind).toBe("sdk-capability-missing");
    expect(details.observed).toBe("undefined");
    expect(details.required).toBe("function");
    expect(details.member).toBe("pi.sendUserMessage");
  });

  it("sdk-capability-missing: the first-failure short-circuit names the first missing member in listed order", () => {
    // Remove registerTool (capability 4, after sendUserMessage in the
    // listed order); with registerCommand and sendUserMessage present,
    // registerTool is the deterministic first failure.
    const pi = makePiNamespace();
    delete pi.registerTool;
    const details = expectFailure(
      runCapabilityProbe(makePassingHost({ pi })),
    );
    expect(details.kind).toBe("sdk-capability-missing");
    expect(details.member).toBe("pi.registerTool");
  });

  it("peer-dep-out-of-range: an installed version outside the pin refuses with kind peer-dep-out-of-range", () => {
    const details = expectFailure(
      runCapabilityProbe(
        makePassingHost({
          readPeerVersion: (pkg: string): string =>
            pkg === "@earendil-works/pi-coding-agent" ? "0.75.5" : "0.80.10",
        }),
      ),
    );
    expect(details.kind).toBe("peer-dep-out-of-range");
    expect(details.observed).toBe("0.75.5");
    expect(details.required).toContain(">=0.80.8");
    expect(details.package).toBe("@earendil-works/pi-coding-agent");
  });

  it("peer-dep-malformed-version (condition 4): a present-but-invalid SemVer version carries the raw string", () => {
    const details = expectFailure(
      runCapabilityProbe(
        makePassingHost({
          readPeerVersion: (pkg: string): string =>
            pkg === "@earendil-works/pi-coding-agent"
              ? "not.a.semver"
              : "0.80.10",
        }),
      ),
    );
    expect(details.kind).toBe("peer-dep-malformed-version");
    expect(details.observed).toBe("not.a.semver");
    expect(details.package).toBe("@earendil-works/pi-coding-agent");
  });

  it("peer-dep-malformed-version (conditions 1-3): no readable version renders observed <unresolvable>", () => {
    const details = expectFailure(
      runCapabilityProbe(
        makePassingHost({
          readPeerVersion: (pkg: string): string | undefined =>
            pkg === "@earendil-works/pi-coding-agent" ? undefined : "0.80.10",
        }),
      ),
    );
    expect(details.kind).toBe("peer-dep-malformed-version");
    expect(details.observed).toBe("<unresolvable>");
    expect(details.package).toBe("@earendil-works/pi-coding-agent");
  });

  it("typebox-shape: an absent Type.Unsafe refuses with observed undefined, required function", () => {
    const details = expectFailure(
      runCapabilityProbe(makePassingHost({ typeboxType: {} })),
    );
    expect(details.kind).toBe("typebox-shape");
    expect(details.observed).toBe("undefined");
    expect(details.required).toBe("function");
  });

  it("probe-failed: observed/required render the <unreadable> sentinel", () => {
    const host = makePassingHost({
      readPeerVersion: (): string => {
        throw new Error("boom");
      },
    });
    const details = expectFailure(runCapabilityProbe(host));
    expect(details.kind).toBe("probe-failed");
    expect(details.observed).toBe("<unreadable>");
    expect(details.required).toBe("<unreadable>");
  });

  it("short-circuit order: a simultaneous (a) Node + (b) AbortSignal failure emits the (a) node-floor kind only", () => {
    // capability-probe.md: the implementation MUST NOT race or aggregate; the
    // fixed order is (a) → (b) → (c)+(d) → (e), first failure wins.
    const details = expectFailure(
      runCapabilityProbe(
        makePassingHost({
          nodeVersion: "18.19.0",
          abortSignal: makeFakeAbortSignal("any"),
        }),
      ),
    );
    expect(details.kind).toBe("node-floor");
  });
});
