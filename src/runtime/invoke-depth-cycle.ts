// V15b / V15b-T — the invoke depth-bound (INV-4) and invocation-cycle seam.
//
// This module owns the two mechanisms the paired `V15b` implementation leaf
// fills in (invocation.md §INV-4 "Invocation depth bound", §"Cycle detection";
// hard-ceilings/ceilings-3-and-4.md CIO-2):
//
//   - INV-4 — the per-chain `invoke`-depth counter. A single per-chain counter,
//     incremented BEFORE the child frame begins executing, counting all three
//     countable frame classes — a direct `invoke(...)` frame, a `.theta`
//     callable frame dispatched through a `tools:` entry, and a *cross-file*
//     `.thetalib` `fn` frame (caller and callee residing in different source
//     files). An intra-file `.thetalib` `fn` call is NOT countable. The counter is
//     per-chain, not per-process: sibling invokes do not share budget, and the
//     counter crosses subagent-mode boundaries UNCHANGED (a subagent invocation
//     does not reset it). The cap is 32; the breach fires
//     `InvokeDepthExceededPanic` (`theta/runtime/invoke-depth-exceeded`) when the
//     runtime is about to push the 33rd frame (`invoke chain depth exceeded:
//     33 > 32`). The panic routes in two separately-required modes: a top-level
//     overflow surfaces as a Pi system note, a nested overflow surfaces to the
//     parent as `Err(InvokeInfraError { cause: "panic", ... })`.
//
//   - The parse-time invocation-cycle detector over the per-load-pass
//     static-resolution graph (invocation.md §"Cycle detection"). A back-edge
//     fires `theta/load/invocation-cycle`; an unresolvable callee (one that
//     produced `theta/load/callee-has-errors`) is treated as a LEAF — the walk
//     arm terminates there and a cycle routed through it is not detected until
//     the underlying file is fixed.
//
// V15b fills these in: `pushCountableFrame` increments the shared per-chain
// counter and enters the cap guard (via `enterInvokeFrame`); `thetalibFnFrameKind`
// classifies a `.thetalib` `fn` call by comparing the caller's source file against
// the callee's resolved declaration residence; `crossSubagentBoundary` passes
// the chain through unchanged; `surfaceDepthOverflow` routes the panic to its
// top-level (Pi system note) or nested (`InvokeInfraError`) surface; and
// `detectInvocationCycle` walks the static-resolution graph, treating an
// unresolvable callee as a leaf.
//
// Spec: invocation.md (§INV-4, §Static resolution, §Cycle detection),
// hard-ceilings/ceilings-3-and-4.md (CIO-2), diagnostics/code-registry-runtime.md
// (`theta/runtime/invoke-depth-exceeded`), diagnostics/code-registry-load.md
// (`theta/load/invocation-cycle`), errors-and-results/queryerror-variants.md
// (`InvokeInfraError`).

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { InvokeInfraError } from "./query-error";
import { InvokeDepthExceededPanic, enterInvokeFrame } from "./runtime-panics";

// Re-export the depth-cap primitives so consumers reference one import site.
export {
  INVOKE_DEPTH_CAP,
  INVOKE_DEPTH_EXCEEDED_CODE,
  InvokeDepthExceededPanic,
} from "./runtime-panics";

// --------------------------------------------------------------------------
// Countable frame classes (INV-4)
// --------------------------------------------------------------------------

/**
 * The three countable frame classes that each contribute +1 to the single
 * shared per-chain depth counter (invocation.md §INV-4):
 *   - `"direct-invoke"`       — a literal `invoke(...)` / `invoke<Schema>(...)` call;
 *   - `"theta-tools-callable"` — a `.theta` callable call dispatched through a `tools:` entry;
 *   - `"thetalib-fn-cross-file"`  — a *cross-file* `.thetalib` `fn` call (an intra-file
 *                               `fn` call is NOT countable);
 *   - `"subagent-fn"`          — a `subagent fn` call (RFC 0001 FN-6/INV-4): each
 *                               call spawns a fresh isolated session and, like the
 *                               other classes, contributes exactly +1 to the one
 *                               shared per-chain counter.
 */
export type CountableFrameKind =
  | "direct-invoke"
  | "theta-tools-callable"
  | "thetalib-fn-cross-file"
  | "subagent-fn";

// --------------------------------------------------------------------------
// `.thetalib` `fn` residence classification (INV-4 cross-file test)
// --------------------------------------------------------------------------

/**
 * A `.thetalib` `fn` call, classified for countability by residence. A `fn`'s
 * *residence* is its declaration site — the `.thetalib` file it is declared in — so
 * re-exports and `as`-aliased imports (resolved through V15c/V15i) do not change
 * residence; `calleeResidence` is that already-resolved declaration-site path.
 */
export interface ThetaLibFnCall {
  /** The source file the call is written in (`.thetalib` or `.theta`). */
  readonly callerFile: string;
  /**
   * The `.thetalib` file the callee `fn` is DECLARED in — after V15c/V15i re-export
   * and aliased-import resolution. The cross-file test compares this against
   * `callerFile`.
   */
  readonly calleeResidence: string;
}

/**
 * Classify a `.thetalib` `fn` call for the depth counter (invocation.md §INV-4): a
 * *cross-file* call (caller and callee in different source files) contributes a
 * countable `"thetalib-fn-cross-file"` frame; an *intra-file* call (same source
 * file) is NOT countable and returns `undefined`.
 *
 * A cross-file call compares `callerFile` against the already-resolved
 * `calleeResidence` (residence = declaration site, resolved through V15c/V15i
 * re-exports and aliased imports); equal paths are intra-file and contribute no
 * countable frame.
 */
export function thetalibFnFrameKind(call: ThetaLibFnCall): CountableFrameKind | undefined {
  return call.callerFile === call.calleeResidence ? undefined : "thetalib-fn-cross-file";
}

// --------------------------------------------------------------------------
// The per-chain depth counter (INV-4)
// --------------------------------------------------------------------------

/**
 * The per-chain `invoke`-depth counter (invocation.md §INV-4). `depth` is the
 * count of countable frames on the active call chain; the slash-invoked
 * top-level theta is depth 0 and the first frame nested inside it is depth 1.
 * Modelled as an immutable value so sibling chains derived from the same parent
 * are independent by construction ("sibling invokes do not share budget").
 */
export interface InvokeChain {
  readonly depth: number;
}

/** The starting chain for a slash-invoked top-level theta (depth 0). */
export function newInvokeChain(): InvokeChain {
  return { depth: 0 };
}

/**
 * The starting chain seeded at an explicit depth (invocation.md §INV-4). A
 * subagent-mode child `pi` process continues the parent's per-chain depth: the
 * parent marshalled its current depth on the child env (`SUBAGENT_INVOKE_DEPTH_ENV`),
 * so the child's top-level invoke chain starts there rather than at 0, keeping
 * the depth-32 ceiling continuous across the process hop.
 */
export function newInvokeChainAtDepth(depth: number): InvokeChain {
  return { depth };
}

/**
 * Parse the inbound invoke-depth carriage read off the child env
 * (`SUBAGENT_INVOKE_DEPTH_ENV`). INV-4 pins no malformed-carriage rule, so an
 * absent or non-integer / negative value seeds a FRESH chain at depth 0 rather
 * than failing closed — a corrupt carriage degrades to the top-level default,
 * not a load refusal.
 */
export function parseInboundInvokeDepth(raw: string | undefined): number {
  if (raw === undefined) {
    return 0;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

/**
 * Push a countable frame onto the chain (invocation.md §INV-4). The counter is
 * incremented BEFORE the child frame begins executing, so a child whose body
 * overflows from depth 32 surfaces the panic at its very first nested frame.
 * The cap is breached when about to push a frame that would bring the count to
 * 33 (> 32), raising `InvokeDepthExceededPanic` (`invoke chain depth exceeded:
 * 33 > 32`); otherwise it returns the child chain at `depth + 1`.
 *
 * Every countable frame class contributes exactly +1 to the one shared
 * per-chain counter, so `kind` documents the call site but does not change the
 * increment. Returning a fresh value leaves the parent chain untouched, so
 * sibling frames pushed from the same parent are independent by construction.
 */
export function pushCountableFrame(
  chain: InvokeChain,
  kind: CountableFrameKind,
): InvokeChain {
  void kind;
  const nextDepth = chain.depth + 1;
  // Cap guard: breached when about to push a frame bringing the count to 33.
  // Incremented BEFORE the child frame begins executing.
  enterInvokeFrame(nextDepth);
  return { depth: nextDepth };
}

/**
 * Cross a subagent-mode invocation boundary (invocation.md §INV-4). The
 * per-chain counter passes through UNCHANGED — a `subagent → subagent` or
 * `prompt → subagent` invocation does NOT reset the count; the subagent
 * carve-outs concern conversation isolation, not call-chain accounting.
 *
 * The counter passes through unchanged — the subagent's spawned child `pi`
 * process is a continuation of the same call chain from the cap's
 * perspective (carried across the boundary on the invoke-depth env var; in
 * production the crossing is realised by that env marshalling, so this seam
 * survives as the conformance witness of the pass-through rule).
 */
export function crossSubagentBoundary(chain: InvokeChain): InvokeChain {
  return chain;
}

// --------------------------------------------------------------------------
// Depth-overflow panic routing (INV-4 two modes)
// --------------------------------------------------------------------------

/**
 * The two separately-required surfacing modes of a depth-overflow panic
 * (invocation.md §INV-4): a top-level overflow surfaces as a Pi system note
 * (carrying the `theta/runtime/invoke-depth-exceeded` diagnostic), a nested
 * overflow surfaces to the parent as `Err(InvokeInfraError { cause: "panic" })`.
 */
export type DepthOverflowSurface =
  | { readonly mode: "top-level"; readonly diagnostic: Diagnostic }
  | { readonly mode: "nested"; readonly error: InvokeInfraError };

/** Where the overflowing frame sat: at the slash-invoked top level, or nested inside an invoke chain. */
export interface DepthOverflowContext {
  /** True when the overflow occurred at the slash-invoked top-level theta (no invoke parent). */
  readonly topLevel: boolean;
  /** The callee path carried onto the parent's `InvokeInfraError` in the nested case. */
  readonly calleePath: string;
}

/**
 * Route a depth-overflow panic to its surface (invocation.md §INV-4, the
 * panic-routing rules in errors-and-results.md): a top-level overflow yields a
 * `{ mode: "top-level" }` surface carrying the
 * `theta/runtime/invoke-depth-exceeded` diagnostic (delivered as a Pi system
 * note by the V7d channel); a nested overflow yields a `{ mode: "nested" }`
 * surface carrying `InvokeInfraError { kind: "invoke_infra", cause: "panic" }`.
 *
 * A top-level overflow (no invoke parent) yields the location-less
 * `theta/runtime/invoke-depth-exceeded` diagnostic delivered as a Pi system
 * note; a nested overflow yields `InvokeInfraError { kind: "invoke_infra",
 * cause: "panic" }` returned to the invoke parent, carrying the callee path.
 */
export function surfaceDepthOverflow(
  panic: InvokeDepthExceededPanic,
  context: DepthOverflowContext,
): DepthOverflowSurface {
  if (context.topLevel) {
    return {
      mode: "top-level",
      diagnostic: {
        severity: "error",
        code: panic.code,
        message: panic.message,
      },
    };
  }
  return {
    mode: "nested",
    error: {
      kind: "invoke_infra",
      message: panic.message,
      callee_path: context.calleePath,
      cause: "panic",
    },
  };
}

// --------------------------------------------------------------------------
// Invocation-cycle detection (theta/load/invocation-cycle)
// --------------------------------------------------------------------------

/** The `theta/load/invocation-cycle` diagnostic code (code-registry-load.md). */
export const INVOCATION_CYCLE_CODE = "theta/load/invocation-cycle";

/**
 * The registered `invocation cycle: <A> → <B> → <A>` message
 * (code-registry-load.md), rendered from the cycle path's file-path stems joined
 * by ` → ` per placeholder-rendering-b.md — with the first stem repeated at the
 * end. A cycle `A → B → A` renders `invocation cycle: A → B → A` exactly as the
 * invocation.md §"Cycle detection" prose example shows.
 */
export function invocationCycleMessage(stems: readonly string[]): string {
  return `invocation cycle: ${stems.join(" → ")}`;
}

/**
 * The per-load-pass static-resolution graph the cycle walk runs over
 * (invocation.md §Static resolution). `edges` maps each node (a file-path stem)
 * to the nodes reached from its literal `invoke("./x.theta")` paths and its
 * `.theta` `tools:` entries; `unresolvable` names the nodes that produced
 * `theta/load/callee-has-errors` — those are treated as LEAVES.
 */
export interface InvokeGraph {
  readonly edges: ReadonlyMap<string, readonly string[]>;
  readonly unresolvable: ReadonlySet<string>;
}

/**
 * Walk the static-resolution graph from `entry` and return
 * `theta/load/invocation-cycle` (with the cycle path printed) on the first
 * back-edge, or `undefined` for an acyclic graph (invocation.md §"Cycle
 * detection"). An `unresolvable` node terminates its own walk arm — it is a
 * leaf, so a cycle routed through it is NOT detected until the underlying file
 * is fixed. The diagnostic is location-less (no `file`, no `range`): the cycle
 * has no single token span, and its participating paths are carried inline in
 * the message (diagnostic-shape.md §Location-less).
 *
 * The walk is a depth-first traversal tracking the active path stack: a callee
 * already on the stack is a back-edge and fires the cycle with the participating
 * path (start … back to start). An `unresolvable` node is a leaf — its own edges
 * are not walked — so a cycle routed through it is not detected until the file
 * is fixed.
 */
export function detectInvocationCycle(
  entry: string,
  graph: InvokeGraph,
): Diagnostic | undefined {
  const onStack: string[] = [];
  const done = new Set<string>();

  function walk(node: string): readonly string[] | undefined {
    const backEdge = onStack.indexOf(node);
    if (backEdge !== -1) {
      // Cycle: the path from the first occurrence back to this node.
      return [...onStack.slice(backEdge), node];
    }
    if (done.has(node)) {
      return undefined;
    }
    if (graph.unresolvable.has(node)) {
      // An unresolvable callee is a leaf: terminate this walk arm.
      done.add(node);
      return undefined;
    }
    onStack.push(node);
    for (const child of graph.edges.get(node) ?? []) {
      const cycle = walk(child);
      if (cycle !== undefined) {
        return cycle;
      }
    }
    onStack.pop();
    done.add(node);
    return undefined;
  }

  const cyclePath = walk(entry);
  if (cyclePath === undefined) {
    return undefined;
  }
  // Location-less: the cycle has no single token span; participating paths ride
  // inline in the message (diagnostic-shape.md §Location-less).
  return {
    severity: "error",
    code: INVOCATION_CYCLE_CODE,
    message: invocationCycleMessage(cyclePath),
  };
}
