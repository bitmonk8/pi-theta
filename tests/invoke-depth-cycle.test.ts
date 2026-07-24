import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  INVOCATION_CYCLE_CODE,
  INVOKE_DEPTH_CAP,
  INVOKE_DEPTH_EXCEEDED_CODE,
  InvokeDepthExceededPanic,
  type CountableFrameKind,
  type InvokeGraph,
  crossSubagentBoundary,
  detectInvocationCycle,
  invocationCycleMessage,
  newInvokeChain,
  newInvokeChainAtDepth,
  parseInboundInvokeDepth,
  pushCountableFrame,
  surfaceDepthOverflow,
  thetalibFnFrameKind,
} from "../src/runtime/invoke-depth-cycle";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// V15b-T — failing tests for the paired `V15b` "Invoke depth bound and cycle
// detection".
//
// Spec: invocation.md (§INV-4 "Invocation depth bound", §Static resolution,
// §"Cycle detection"), hard-ceilings/ceilings-3-and-4.md (CIO-2),
// diagnostics/code-registry-runtime.md (`theta/runtime/invoke-depth-exceeded`),
// diagnostics/code-registry-load.md (`theta/load/invocation-cycle`).
//
// Each test cites its obligation inline (INV-4 / the `theta/...` diagnostic code)
// and reds on its own primary assertion because the V15b behaviour is absent:
// `pushCountableFrame` returns the chain unchanged (never increments, never
// enters the cap guard); `thetalibFnFrameKind` returns a fixed wrong sentinel;
// `crossSubagentBoundary` resets the count; `surfaceDepthOverflow` always
// returns a wrong-code top-level sentinel; and `detectInvocationCycle` returns
// `undefined`. No test reds on a compile error, a missing fixture, or a harness
// throw.

// The live sharded diagnostics registry — the single source of truth for every
// *Message* template (the *Diagnostic message anchors* rule).
const REGISTRY_TEXT = ["code-registry-runtime.md", "code-registry-load.md"]
  .map((page) =>
    readFileSync(
      fileURLToPath(
        new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url),
      ),
      "utf8",
    ),
  )
  .join("\n");

interface RegistryRow {
  code: string;
  message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

/** Source a code's registered *Message* template and fill its `<…>` placeholders. */
function expectedMessage(code: string, subs: Readonly<Record<string, string>>): string {
  let message = registryMessage(REGISTRY, code) as string;
  for (const [placeholder, value] of Object.entries(subs)) {
    // `replaceAll` — the invocation-cycle template repeats `<A>`.
    message = message.replaceAll(placeholder, value);
  }
  return message;
}

/** The registered `invoke chain depth exceeded: 33 > 32` message. */
const DEPTH_33_MESSAGE = expectedMessage(INVOKE_DEPTH_EXCEEDED_CODE, {
  "<depth>": "33",
});

/** Capture a thrown value from `fn`, or `undefined` if it did not throw. */
function capture(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (thrown: unknown) {
    return thrown;
  }
}

// --------------------------------------------------------------------------
// INV-4 — the per-chain depth counter fires at the 32-frame boundary
// --------------------------------------------------------------------------

describe("INV-4 — invoke-chain depth bound (invocation.md §INV-4)", () => {
  it("INV-4: the depth cap is 32", () => {
    // The interpreter caps the nesting depth of an `invoke` chain at 32.
    expect(INVOKE_DEPTH_CAP).toBe(32);
  });

  it("INV-4: a single chain mixing all three countable frame classes increments the shared per-chain counter and fires `theta/runtime/invoke-depth-exceeded` at 33 > 32", () => {
    // The single boundary chain mixes all three countable frame classes — at
    // least one direct `invoke(...)` frame, one `.theta`-via-`tools:` frame, and
    // one cross-file `.thetalib fn` frame — so each frame kind's contribution to the
    // single shared per-chain counter is observed as the chain reaches 33 > 32.
    const kinds: readonly CountableFrameKind[] = [
      "direct-invoke",
      "theta-tools-callable",
      "thetalib-fn-cross-file",
    ];
    expect(
      new Set(kinds).size,
      "INV-4: the boundary chain mixes all three countable frame classes",
    ).toBe(3);

    // The slash-invoked top-level theta is depth 0; push 32 countable frames
    // (cycling the three kinds), asserting each frame contributes +1 to the one
    // shared per-chain counter (depths 1..32 are the legal range).
    let chain = newInvokeChain();
    expect(chain.depth, "INV-4: the slash-invoked top-level theta is depth 0").toBe(0);
    for (let i = 0; i < INVOKE_DEPTH_CAP; i++) {
      const kind = kinds[i % kinds.length] as CountableFrameKind;
      chain = pushCountableFrame(chain, kind);
      // Incremented before the child begins executing — each countable frame,
      // whatever its class, contributes exactly +1 to the shared counter.
      expect(chain.depth, `INV-4: countable frame ${i + 1} brings the shared counter to ${i + 1}`).toBe(
        i + 1,
      );
    }

    // The cap is breached when about to push the frame that would bring the
    // count to 33: `InvokeDepthExceededPanic` (`theta/runtime/invoke-depth-exceeded`)
    // with the registered `invoke chain depth exceeded: 33 > 32` message.
    const raised = capture(() => pushCountableFrame(chain, "direct-invoke"));
    expect(
      raised,
      "INV-4: pushing the 33rd frame raises InvokeDepthExceededPanic (theta/runtime/invoke-depth-exceeded)",
    ).toBeInstanceOf(InvokeDepthExceededPanic);
    expect((raised as InvokeDepthExceededPanic).code).toBe(INVOKE_DEPTH_EXCEEDED_CODE);
    expect((raised as InvokeDepthExceededPanic).message).toBe(DEPTH_33_MESSAGE);
  });

  it("INV-4: the per-chain counter crosses the subagent boundary UNCHANGED (a subagent invocation does not reset the count)", () => {
    // From the cap's perspective a subagent → subagent / prompt → subagent
    // invocation is a continuation of the same chain: the counter passes
    // through unchanged and does NOT reset.
    let chain = newInvokeChain();
    chain = pushCountableFrame(chain, "direct-invoke");
    chain = pushCountableFrame(chain, "theta-tools-callable");
    expect(chain.depth, "INV-4: two countable frames bring the counter to 2").toBe(2);
    const crossed = crossSubagentBoundary(chain);
    expect(
      crossed.depth,
      "INV-4: crossing the subagent boundary does not reset the per-chain counter",
    ).toBe(2);
  });

  it("INV-4: sibling invokes do not share budget — chains derived from one parent are independent", () => {
    // The counter is per-chain, not per-process: sibling invokes spawned from
    // the same parent do not share budget.
    let parent = newInvokeChain();
    parent = pushCountableFrame(parent, "direct-invoke"); // parent at depth 1

    // One sibling descends several frames deep…
    let siblingA = pushCountableFrame(parent, "direct-invoke"); // depth 2
    siblingA = pushCountableFrame(siblingA, "theta-tools-callable"); // depth 3
    siblingA = pushCountableFrame(siblingA, "thetalib-fn-cross-file"); // depth 4

    // …while the other sibling, derived from the SAME parent, is unaffected.
    const siblingB = pushCountableFrame(parent, "direct-invoke"); // depth 2, independent

    expect(parent.depth, "INV-4: the parent chain is unchanged by either sibling").toBe(1);
    expect(siblingA.depth, "INV-4: sibling A descended to depth 4").toBe(4);
    expect(
      siblingB.depth,
      "INV-4: sibling B is independent of sibling A's budget (depth 2, not 5)",
    ).toBe(2);
  });
});

// --------------------------------------------------------------------------
// INV-4 — wire-level invoke-depth carriage across the subagent process boundary
// --------------------------------------------------------------------------

describe("INV-4 — subagent-child invoke-depth seeding (wire-level carriage)", () => {
  it("seeds a fresh chain at the marshalled parent depth so the ceiling continues across the hop", () => {
    // The parent marshalled depth 5 on the child env; the child's top-level
    // chain continues there rather than resetting to 0.
    const seeded = newInvokeChainAtDepth(parseInboundInvokeDepth("5"));
    expect(seeded.depth).toBe(5);
    // A single further countable frame in the child is depth 6 — the count did
    // not reset at the subagent boundary (crossSubagentBoundary is a no-op).
    expect(pushCountableFrame(crossSubagentBoundary(seeded), "direct-invoke").depth).toBe(6);
  });

  it("a marshalled depth of 32 (the cap) trips the ceiling on the child's first nested frame", () => {
    const seeded = newInvokeChainAtDepth(parseInboundInvokeDepth("32"));
    // Pushing the 33rd frame breaches the depth-32 cap inside the child.
    expect(() => pushCountableFrame(seeded, "direct-invoke")).toThrow(
      InvokeDepthExceededPanic,
    );
  });

  it("absent or malformed carriage seeds a FRESH chain at depth 0 (INV-4 pins no fail-closed rule)", () => {
    // Absent → 0.
    expect(parseInboundInvokeDepth(undefined)).toBe(0);
    // Non-integer / garbage → 0 (not a throw, not fail-closed).
    expect(parseInboundInvokeDepth("not-a-number")).toBe(0);
    expect(parseInboundInvokeDepth("3.5")).toBe(0);
    expect(parseInboundInvokeDepth("")).toBe(0);
    // Negative → 0.
    expect(parseInboundInvokeDepth("-4")).toBe(0);
    expect(newInvokeChainAtDepth(parseInboundInvokeDepth("garbage")).depth).toBe(0);
  });
});

// --------------------------------------------------------------------------
// INV-4 — cross-file `.thetalib fn` residence classification
// --------------------------------------------------------------------------

describe("INV-4 — cross-file `.thetalib fn` residence (invocation.md §INV-4)", () => {
  it("INV-4: a cross-file `.thetalib fn` call (caller and callee in different source files) is a countable `thetalib-fn-cross-file` frame", () => {
    // A `.thetalib fn` call is cross-file whenever the caller resides in a different
    // source file from the callee (residence = the fn's declaration `.thetalib` file).
    const kind = thetalibFnFrameKind({
      callerFile: "/proj/a.thetalib",
      calleeResidence: "/proj/b.thetalib",
    });
    expect(kind, "INV-4: a cross-file `.thetalib fn` call is a countable thetalib-fn-cross-file frame").toBe(
      "thetalib-fn-cross-file",
    );
  });

  it("INV-4: an intra-file `.thetalib fn` call (caller and callee in the same source file) is NOT countable", () => {
    // An intra-file `fn` call — caller and callee in the same `.thetalib` source
    // file — is not a countable frame.
    const kind = thetalibFnFrameKind({
      callerFile: "/proj/a.thetalib",
      calleeResidence: "/proj/a.thetalib",
    });
    expect(kind, "INV-4: an intra-file `.thetalib fn` call contributes no countable frame").toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// INV-4 — depth-overflow panic routing (two separately-required modes)
// --------------------------------------------------------------------------

describe("INV-4 — depth-overflow panic routing (invocation.md §INV-4)", () => {
  const panic = new InvokeDepthExceededPanic(DEPTH_33_MESSAGE);

  it("INV-4: a top-level overflow surfaces as a Pi system note carrying `theta/runtime/invoke-depth-exceeded`", () => {
    // A top-level overflow surfaces as a Pi system note (the
    // `theta/runtime/invoke-depth-exceeded` diagnostic on the system-note channel).
    const surface = surfaceDepthOverflow(panic, {
      topLevel: true,
      calleePath: "/proj/top.theta",
    });
    expect(surface.mode, "INV-4: a top-level overflow routes to the system-note surface").toBe(
      "top-level",
    );
    if (surface.mode !== "top-level") {
      throw new Error("unreachable: asserted top-level above");
    }
    expect(surface.diagnostic.code).toBe(INVOKE_DEPTH_EXCEEDED_CODE);
    expect(surface.diagnostic.message).toBe(DEPTH_33_MESSAGE);
  });

  it("INV-4: a nested overflow surfaces to the parent as `Err(InvokeInfraError { cause: \"panic\", ... })`", () => {
    // An overflow inside an invoke chain surfaces to the parent as
    // `Err(InvokeInfraError { cause: "panic", ... })`.
    const surface = surfaceDepthOverflow(panic, {
      topLevel: false,
      calleePath: "/proj/child.theta",
    });
    expect(surface.mode, "INV-4: a nested overflow routes to the InvokeInfraError surface").toBe(
      "nested",
    );
    if (surface.mode !== "nested") {
      throw new Error("unreachable: asserted nested above");
    }
    expect(surface.error.kind).toBe("invoke_infra");
    expect(surface.error.cause, "INV-4: the nested overflow carries cause `panic`").toBe("panic");
    expect(surface.error.message).toBe(DEPTH_33_MESSAGE);
    expect(surface.error.callee_path).toBe("/proj/child.theta");
  });
});

// --------------------------------------------------------------------------
// theta/load/invocation-cycle — parse-time static-resolution cycle detection
// --------------------------------------------------------------------------

/** Locate a diagnostic by code. */
function withCode(
  diags: readonly (Diagnostic | undefined)[],
  code: string,
): Diagnostic | undefined {
  return diags.find((d): d is Diagnostic => d !== undefined && d.code === code);
}

describe("theta/load/invocation-cycle — static-resolution cycle detection (invocation.md §Cycle detection)", () => {
  it("theta/load/invocation-cycle: a static-resolution cycle fires at parse time; an unresolvable callee is a leaf (undetected)", () => {
    // A → B → A: the second discovery of A is a cycle. All nodes resolvable.
    const cyclicGraph: InvokeGraph = {
      edges: new Map<string, readonly string[]>([
        ["A", ["B"]],
        ["B", ["A"]],
      ]),
      unresolvable: new Set<string>(),
    };
    const cyclic = detectInvocationCycle("A", cyclicGraph);
    expect(
      withCode([cyclic], INVOCATION_CYCLE_CODE),
      "theta/load/invocation-cycle: a static A → B → A cycle fires",
    ).toBeDefined();
    // The head is location-less (no `file`, no `range`); the participating
    // paths ride inline in the message (diagnostic-shape.md §Location-less).
    expect(cyclic?.file, "theta/load/invocation-cycle: the head is location-less (no file)").toBeUndefined();
    expect(cyclic?.range, "theta/load/invocation-cycle: the head is location-less (no range)").toBeUndefined();
    expect(cyclic?.message).toBe(invocationCycleMessage(["A", "B", "A"]));
    // Anchored to the registry *Message* template `invocation cycle: <A> → <B> → <A>`.
    expect(cyclic?.message).toBe(
      expectedMessage(INVOCATION_CYCLE_CODE, { "<A>": "A", "<B>": "B" }),
    );

    // Same edges, but B produced `theta/load/callee-has-errors` and is
    // unresolvable: B is a LEAF, the walk arm terminates there, and the cycle
    // routed through B is NOT detected until B is fixed.
    const throughLeaf: InvokeGraph = {
      edges: new Map<string, readonly string[]>([
        ["A", ["B"]],
        ["B", ["A"]],
      ]),
      unresolvable: new Set<string>(["B"]),
    };
    expect(
      detectInvocationCycle("A", throughLeaf),
      "theta/load/invocation-cycle: a cycle routed through an unresolvable (leaf) callee is not detected",
    ).toBeUndefined();
  });
});
