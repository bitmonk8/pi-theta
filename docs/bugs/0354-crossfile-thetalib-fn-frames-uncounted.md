# Bug 0354 — Cross-file `.thetalib` `fn` calls are never counted against ceiling #1: `thetalibFnFrameKind` has no production caller and `evalUserFnCall` executes imported-fn frames with no chain consultation, so a 40-deep cross-file fn chain completes with zero diagnostics where INV-4 prescribes `theta/runtime/invoke-depth-exceeded` at frame 33

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — S2 because a documented hard runtime ceiling
  (ceiling #1, the only *runtime panic*-class ceiling) is silently unenforced
  for one of its four countable frame classes: the input class INV-4 exists to
  bound (legitimate-but-runaway recursive divide-and-conquer, here spread
  across `.thetalib` files) runs to arbitrary depth with zero diagnostics, and
  when it finally dies it dies as `RangeError: Maximum call stack size
  exceeded` → `theta/runtime/internal-error` — the wrong code on the wrong
  surface, thousands of frames past the prescribed bound. No wrong value binds
  (the chain that stays shallow computes correctly), which is why not S1. D2
  because the classifier exists (`thetalibFnFrameKind`) but the executor's
  fn-call path (`evalUserFnCall`) has no access to the invoke chain —
  `ExecuteBodyDeps` does not carry it — so the fix threads the chain (or a
  push/pop counter) through the statement executor's fn dispatch and the pure
  host's `evaluatePureFnCall` twin, plus witnesses.
- **Kind:** defect — registered-but-unwired enforcement. The INV-4 classifier
  for exactly this frame class is in-tree, unit-pinned green
  (`tests/invoke-depth-cycle.test.ts:222–240`), and called by nothing.
- **Related:**
  - 0066 — fixed (0.88.0). Pattern sibling: an enforcement layer in-tree,
    pinned by unit tests, with no production caller (`classifyBinderArgs`,
    `crossRouteSlashLoadParams`). This is the ceiling-#1 twin of that shape.
  - 0050 — fixed (0.77.0). Same pattern (`checkFnArgCompat` callerless).
  - 0303 — fixed. Made imported cross-file `fn` execution correct w.r.t.
    scoping (`moduleEnv` threading through `evalUserFnCall`); the depth
    accounting for the same call class was not part of that fix.
- **Affected** (verified at `af476df2`, v0.347.0):
  - `src/runtime/invoke-depth-cycle.ts:117` — `thetalibFnFrameKind`, the
    cross-file classifier. `rg -n thetalibFnFrameKind src/` matches only its
    own module; the only external references are
    `tests/invoke-depth-cycle.test.ts:22,222,234`.
  - `src/runtime/statement-executor.ts:436` — `evalUserFnCall`. Executes both
    intra-file and imported cross-file `fn` calls (the `moduleEnv` branch);
    consults no `InvokeChain`, calls no `pushCountableFrame`. Its own header
    comment (`:424–426`) says "NOT against the invoke-depth ceiling
    (intra-file `fn` calls are unbounded, hard-ceilings NOCEIL-3/-4)" — true
    for the intra-file half, wrong as applied to the cross-file half it also
    executes.
  - `src/runtime/statement-executor.ts:804–815` — the dispatch: a resolved
    user `fn` routes to `evalSubagentFnCall` (which DOES reach
    `pushCountableFrame(chain, "subagent-fn")` via the producer's
    `#spawnSubagentFnSession`, `src/extension/production-theta-producer.ts:2753`)
    or to `evalUserFnCall` (which never reaches any frame push).
  - `src/extension/production-theta-producer.ts:3780` — the only other
    production `pushCountableFrame` site (`"direct-invoke"`, inside
    `#buildInvokeChild.drive`, which also serves `.theta` callables through
    `tools:` — so frame classes 1, 2 and 4 are counted; class 3 is not).
  - `src/extension/production-theta-producer.ts:7326` — `evaluatePureFnCall`,
    the pure-host twin (interpolation / invoke-arg positions); also no chain.
- **Observed at:** `0.347.0` (`af476df2`). Offline; scratch vitest through the
  real `parseThetaDocument` → `checkThetaImports` → `createProductionProducerDeps`
  → `bindPromptConversation` → `executeBody` chain (the
  tests/b0303-imported-fn-body-declaring-scope.test.ts harness pattern).

## Summary

INV-4 names four countable frame classes for the 32-deep invoke-chain ceiling:
direct `invoke(...)`, `.theta` callables through `tools:`, **cross-file
`.thetalib` `fn` calls**, and `subagent fn` calls. Three are wired to
`pushCountableFrame`; the cross-file `fn` class is not wired anywhere. The
classifier written for it (`thetalibFnFrameKind`) has no production caller,
and the executor path that runs those frames (`evalUserFnCall`) has no access
to the chain at all. A chain of 40 cross-file `fn` frames loads with zero
diagnostics and completes with a value; per the spec it must panic
`theta/runtime/invoke-depth-exceeded` ("invoke chain depth exceeded: 33 > 32")
when the 33rd frame is pushed.

## Reproduction

Offline, scratch vitest at `af476df2` (run and deleted). Forty `.thetalib`
files `lib1..lib40`, each `libI` declaring `fn fI(x: integer)` whose body is
the single call `f(I+1)(x)` imported from `lib(I+1).thetalib`; `lib40.fn f40`
returns `x + 40`. The app theta:

```
---
model: "sonnet"
mode: prompt
---
import { f1 } from "./lib1.thetalib"
let r = f1(0)
return r
```

Every hop is cross-file (caller and callee in different source files —
app→lib1, lib1→lib2, … lib39→lib40), so the chain holds 40 countable frames
per INV-4's definition. Driven through `checkThetaImports` (real materialised
imports, in-memory FS double) and `executeBody` via
`createProductionProducerDeps(...).bindPromptConversation`:

```
load diagnostics: []
result: {"outcome":"value","value":40}
```

No panic, no diagnostic on any channel, `40` binds and returns.

Control (both directions): `pushCountableFrame` itself panics at depth 33 with
`invoke chain depth exceeded: 33 > 32` — pinned by
`tests/invoke-depth-cycle.test.ts` — and the direct-`invoke` /
`tools:`-callable path reaches it through
`production-theta-producer.ts:3780`; the `subagent fn` path through `:2753`.
The cross-file `fn` path reaches nothing.

## Expected behaviour

`docs/spec_topics/invocation.md:85` (INV-4): "The interpreter caps the nesting
depth of an `invoke` chain at **32**, counting direct `invoke(...)`, `.theta`
callable calls through `tools:`, **cross-file `.thetalib` `fn` calls**, and
`subagent fn` calls … Exceeding the cap raises a runtime panic with code
`theta/runtime/invoke-depth-exceeded`."

`invocation.md:87`: "a countable frame is any direct `invoke(...)` call, any
`.theta` callable call dispatched through a `tools:` entry, any cross-file
`.thetalib` `fn` call, or any `subagent fn` call … a `.thetalib` `fn` call is
*cross-file* whenever the caller resides in a different source file from the
callee — whether the caller is another `.thetalib` file or a `.theta` file —
and an intra-file `fn` call … is not a countable frame. … The cap is breached
when the runtime is about to push a frame that would bring the count to 33 …
the diagnostic renders `invoke chain depth exceeded: 33 > 32`."

`docs/spec_topics/hard-ceilings/ceilings-3-and-4.md` CIO-2: "Ceiling #1
(`invoke`-chain depth) is evaluated at `invoke` entry, before the callee body
runs." The ceiling-#1 panic-uniqueness invariant and the four-item list at
`overview-and-orientation.md:49` both treat this bound as the theta-level
frame-depth ceiling; NOCEIL-4 says the 32-level `invoke`-chain bound "is the
only theta-level frame-depth ceiling" — which presupposes it exists for every
countable frame class.

For the reproduction: a panic at the 33rd frame push (surfacing per the
panic-routing rules — a top-level overflow as a Pi system note; inside an
invoke chain as `Err(InvokeInfraError { cause: "panic", … })`).

## Actual behaviour / root cause

`evalUserFnCall` (`src/runtime/statement-executor.ts:436`) executes the frame
in-process: arity check, child scope (`moduleEnv ?? env`), `executeBlock`. No
`InvokeChain` is consulted; `ExecuteBodyDeps` does not carry one. The
cross-file/intra-file distinction the spec draws (and `thetalibFnFrameKind`
implements — compare `callerFile` against the callee's declaration residence,
`src/runtime/invoke-depth-cycle.ts:117`) is never evaluated at runtime; the
information needed for it (the callee's `moduleEnv` / declaring file) is
already threaded through the same function for scoping (bug 0303) but not used
for accounting.

The production `pushCountableFrame` call sites are exactly two:
`production-theta-producer.ts:3780` (`"direct-invoke"`, also serving
`tools:`-dispatched `.theta` callables via `#buildInvokeChild`) and `:2753`
(`"subagent-fn"`). `rg -n "pushCountableFrame" src/` returns those two plus
the owning module. The declared four-class enumeration is enforced for three
classes.

Consequence for the runaway case the bound exists for: unbounded cross-file
`fn` recursion (e.g. two libs mutually recursing, or a self-recursive imported
fn with a data-dependent base case that never fires) burns host stack until
V8's recursion limit, then surfaces `RangeError: Maximum call stack size
exceeded` through the catchable-`RangeError` arm as
`theta/runtime/internal-error` — the code NOCEIL-4 reserves for the *host*
bound, not the theta bound — thousands of frames past depth 32.

## Why it matters

1. A documented hard ceiling — the only panic-class one, and the one that is
   also the RFC-0006 process-tree depth bound — is unenforced for a whole
   countable frame class. The class is author-reachable with ordinary,
   legal code (any `.thetalib` helper calling another lib's helper).
2. The failure that eventually fires is the wrong one: `internal-error`
   (runtime defect surface) instead of `invoke-depth-exceeded` (registered
   ceiling breach), at an unbounded rather than the pinned depth. Diagnostics
   lie about the failure class.
3. Mixed chains under-count: an invoke chain legitimately at depth 30 that
   descends through 5 cross-file lib helpers holds 35 countable frames per
   INV-4 and must have panicked at 33; at HEAD it runs.
4. The asymmetry is a seam of the historically richest kind here: the sibling
   `subagent fn` class (added later, theta 1.2) counts; the older cross-file
   class named in the same sentence does not.

## Non-goals

- **Intra-file `fn` recursion.** Deliberately uncounted per INV-4; its
  exhaustion legitimately rides NOCEIL-3/-4's `RangeError` arm. Unchanged.
- **The counter's per-chain / subagent-crossing semantics.** `newInvokeChainAtDepth`,
  the env carriage, and `pushCountableFrame`'s cap arithmetic are conformant;
  only the missing push for one frame class is at issue.
- **Parse-time cycle detection.** `detectInvocationCycle` covers `invoke` /
  `tools:` edges by design; fn-level recursion is explicitly allowed at parse
  time ("must terminate via control flow"), which is exactly why the runtime
  bound has to count these frames.

## Fix

Not yet decided; constraints any fix must satisfy:

1. The countable-frame test is the spec's residence test: compare the caller's
   source file against the callee `fn`'s declaration residence (re-exports and
   `as`-aliases do not change residence). `thetalibFnFrameKind` already
   implements it — wire it rather than re-deriving.
2. Both executors need the increment: `evalUserFnCall`
   (statement-executor.ts) and the pure host's `evaluatePureFnCall`
   (production-theta-producer.ts:7326) — the same frame class is reachable on
   both paths.
3. The chain (or an equivalent per-chain counter) must be threaded to the fn
   dispatch without breaking the "sibling invokes do not share budget" rule —
   an immutable chain value passed down, not a mutable global.
4. The breach surfaces per INV-4's routing: top-level → Pi system note;
   nested → `Err(InvokeInfraError { cause: "panic" })` to the invoke parent
   (the existing `surfaceDepthOverflow` covers both).
5. Witnesses: a >32 cross-file chain panics with the registered message; a
   32-deep chain completes (boundary); an intra-file recursive fn of the same
   depth still completes (the non-countable control); a mixed
   invoke+cross-file-fn chain counts the sum.

## Provenance

- Hunt area: hard-ceilings (ceiling #1 enforcement points), seed "registered-
  but-unwired enforcement".
- Spec measured against: `docs/spec_topics/invocation.md:85–89` (INV-4, the
  countable-frame definition, the 33>32 render);
  `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md` CIO-2 and the
  ceiling-set invariants; `docs/spec_topics/hard-ceilings/ceiling-invariants-and-audit.md`
  NOCEIL-4; `docs/reference/hard-ceilings.md:19–29`.
- Implementation read at `af476df2`: `src/runtime/invoke-depth-cycle.ts`
  (whole module), `src/runtime/runtime-panics.ts:59` (`INVOKE_DEPTH_CAP`),
  `src/runtime/statement-executor.ts:424–460, 795–815`,
  `src/extension/production-theta-producer.ts:1829, 2037, 2753, 3740–3820,
  7326`.
- Probe: `tests/scratch-crossfile-fn-depth.test.ts` (run at `af476df2`,
  deleted): 40-deep cross-file chain → `{"outcome":"value","value":40}`,
  `load diagnostics: []`. Both directions verified (the cap fires on the
  wired classes per `tests/invoke-depth-cycle.test.ts` and the two production
  push sites; it cannot fire on this class — no caller exists to reach it).
