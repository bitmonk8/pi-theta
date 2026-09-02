# Bug 0362 — `buildInvokeGraph` matches an `invoke` edge to a discovered theta by byte-exact path string, so a case-variant directory spelling inside the literal drops the edge on a case-insensitive host: a physical `a ⇄ b` invocation cycle loads with zero diagnostics — containment and arity both pass on the same spelling — and INV-4's "unreachable" runtime depth panic becomes the first observable

- **Status:** fixed (0.359.0).
- **Sev/Diff estimate:** S2/D1 — S2: a mandated parse-time refusal
  (`theta/load/invocation-cycle`) is withheld for an input class the walk's own
  sibling checks accept and the runtime executes; the failure mode the spec
  calls "unreachable (the cycle fires earlier at parse time)" — the depth-33
  `theta/runtime/invoke-depth-exceeded` panic, for subagent-mode callees a
  33-process spawn chain — becomes the first observable. Not S1: the outcome is
  a loud panic, not a wrong value. D1: one expression — key `byPath` and the
  edge lookup on the canonical (`realpath`) form the same pass already computes
  for containment (`checkInvokePathAtLoad` returns `canonicalPath` at the same
  call site) — plus one witness file.
- **Kind:** defect. `invocation.md:83` (§Cycle detection): "Invocation cycles
  are detected at parse time by walking the per-load-pass static-resolution
  graph defined under [Static resolution] above. If `A.theta` invokes `B.theta`
  invokes `A.theta`, the second discovery is `theta/load/invocation-cycle`".
  §Static resolution (`invocation.md:20`) defines resolvability as "the runtime
  can open, parse, and lower the callee file" — which holds for a case-variant
  spelling on a case-insensitive host — and the shared parse cache "is keyed
  uniformly on `realpath` output" (`src/runtime/invocation.ts:316`). The graph
  builder substitutes a byte-exact un-canonicalised string match for that
  reachability, so the graph it walks is not the static-resolution graph
  whenever an edge's spelling differs in case from the discovered path.
- **Related:**
  - `[bug 0361](./0361-case-variant-import-dir-splits-declaring-identity.md)` — same input
    class (case-variant directory spelling), disjoint subsystem and disjoint
    consequence: there the `.thetalib` walk re-derives a shadow subgraph and the
    cycle still closes; here the graph's nodes are only the DISCOVERED thetas,
    so the mismatched edge is dropped outright and nothing re-closes it.
  - [0302](./0302-stem-keyed-cycle-graph.md) — fixed (0.292.0). The
    `.thetalib` twin: its fix installed `load.resolvedPath` node ids in the
    IMP-5 import graph (`import-static-checks.ts`) — a RESOLVED path, not a
    `realpath`-canonical one, and a different subsystem from the
    `invoke(...)` graph here — so it neither covers nor subsumes this
    report.
  - [Bug 0354](./0354-crossfile-thetalib-fn-frames-uncounted.md) — no root-cause overlap: the depth panic
    here is downstream of a DROPPED cycle edge; 0354 is an uncounted frame
    class in the ceiling-#1 counter.
  - [0329](./0329-hash-mismatch-refusal-does-not-refuse-invocation.md)
    — fixed (0.322.0). Its fix already canonicalises a `tools:` `.theta` entry
    by `fs.realpath` before comparing against a discovered path
    (`production-composition.ts:1317–1358`), for exactly the casing reason;
    `buildInvokeGraph` sits one pass earlier and never received the treatment.
- **Affected** (verified at af476df2, v0.347.0):
  - `src/extension/invoke-static-checks.ts:376–396` — `buildInvokeGraph`:
    `byPath.set(normalizePath(input.sourcePath), input.slashName)` (`:381`,
    separator-only normalisation), edge lookup
    `byPath.get(resolveCalleeAbsolute(input.sourcePath, invoke.path))` (`:389–391`);
    a miss silently drops the edge ("Edges to non-discovered callees are
    dropped").
  - `src/extension/invoke-static-checks.ts:359–365` — `resolveCalleeAbsolute`:
    `path.resolve` + separator normalisation, no `realpath`, so the literal's
    directory-segment case survives into the compared key.
  - `src/extension/invoke-static-checks.ts:1234` — `detectInvocationCycle` over
    that graph is the sole producer of `theta/load/invocation-cycle` for the
    `invoke(...)` surface.
  - Contrast: `src/runtime/invocation.ts:103–147` — the containment check at the
    same site canonicalises both sides via `realpath` ("no independent
    case-folding — the canonical form is whatever `realpath` returns on the
    host"), which is why the case-variant spelling passes INV-1 while the cycle
    edge drops.

## Summary

An `invoke("../X2/a.theta")` literal whose directory spelling differs in case
from the discovered path (`<root>/x2/a.theta`) resolves, opens, parses, and
passes INV-1 containment on a case-insensitive host — every consumer of the
static-resolution pass canonicalises via `realpath` — except the cycle graph,
which compares raw `path.resolve` output byte-for-byte against discovered
`sourcePath` spellings and drops the edge on the case mismatch. A physical
two-theta cycle therefore registers with zero diagnostics; the runtime executes
the recursion until the INV-4 depth cap panics at depth 33.

## Reproduction

Offline, real filesystem, worktree at af476df2. Layout (both files in one
discovery root `<R>/x2`, both `mode: subagent`):

```
<R>/x2/a.theta   let _ = invoke("./b.theta")?     + tail 1
<R>/x2/b.theta   let _ = invoke("../X2/a.theta")? + tail 2
```

(Control pair `c.theta` / `d.theta` identical except the back-edge spells
`../x2/c.theta`.)

Parse all four via `parseThetaDocument`, build
`ThetaCompositionInput[]`, run `buildInvokeGraph`, then
`checkInvokeStaticResolution` per input with the production `PiFileSystem`,
`activeRoots: ["<R>/x2"]`, and the built graph (the exact composition-root
wiring shape, `production-composition.ts:894`, `:994`).

Observed:

```
EDGES: [["a",["b"]],["b",[]],["c",["d"]],["d",["c"]]]
DIAGS a: []
DIAGS b: []
DIAGS c: ["error theta/load/invocation-cycle: invocation cycle: c → d → c"]
DIAGS d: ["error theta/load/invocation-cycle: invocation cycle: d → c → d"]
```

The case-variant pair's back-edge is absent (`["b",[]]`), both thetas load
clean — no `invoke-path-escape`, no `callee-has-errors`, no cycle — while the
byte-identical control cycles are refused. `fs.realpath("<R>/X2/a.theta")`
succeeds (canonicalises to the on-disk spelling), so the callee is statically
resolvable per §Static resolution and runnable at runtime.

## Expected behaviour

`invocation.md:83`: the `a ⇄ b` pair is exactly "`A.theta` invokes `B.theta`
invokes `A.theta`"; the second discovery MUST be `theta/load/invocation-cycle`
("invocation cycle: a → b → a"). The graph walked is "the per-load-pass
static-resolution graph defined under Static resolution", whose identity is
`realpath`-keyed (`invocation.md:20`; `src/runtime/invocation.ts:316`: "the
cache is keyed uniformly on `realpath` output"). `invocation.md` §INV-4 relies
on the refusal: "Recursion through cycle-detected paths is unreachable (the
cycle fires earlier at parse time); the depth bound exists for
legitimate-but-runaway recursive divide-and-conquer" — a two-file mutual cycle
is not that class.

## Actual behaviour / root cause

`buildInvokeGraph` keys discovered thetas by separator-normalised `sourcePath`
and resolves each invoke literal with `path.resolve` only
(`invoke-static-checks.ts:359–365`, `:381`, `:389–391`). The two strings differ
in one directory segment's case; the `Map.get` misses; the comment's
"Edges to non-discovered callees are dropped" arm treats a discovered,
resolvable callee as non-discovered. Every sibling consumer of the same site
canonicalises (`checkInvokePathAtLoad` → `canonicalizePath` → `realpath`), so
the theta passes containment and — in production, where `resolveCalleeArity`
reads the callee through the realpath-keyed parse cache — arity and type checks
too: the divergence is confined to the cycle edge.

## Why it matters

The one load-time guard against mutual `invoke` recursion is silently absent
for a spelling class Windows authors produce routinely (the filesystem accepts
it, so nothing corrects them). The failure signature moves from a precise
load-time refusal naming the cycle to a runtime `invoke-depth-exceeded` panic
after 32 frames — for subagent-mode callees, 32 spawned `pi` processes doing
real work (model resolution, discovery) before the cap trips — surfaced as
`Err(InvokeInfraError { cause: "panic" })` with no mention of a cycle.

## Non-goals

- The `.thetalib` import-cycle detector is unaffected (its walk re-derives
  edges transitively and the cycle re-closes in the shadow spelling — probed
  clean; see `[bug 0361](./0361-case-variant-import-dir-splits-declaring-identity.md)` §Non-goals).
- No claim about `tools:` `.theta`-entry cycle edges routed through
  `parseCalleeForTools` — not probed this sweep.
- The one-parse-per-pass economy (`invocation.md:20`) is not measured here;
  the case-variant spelling likely also splits that cache key
  (`walkStaticResolution` seeds from `realpath` so likely not), out of scope.

## Fix

Key `byPath` and the edge lookup on the canonical form: `buildInvokeGraph` is
sync today, so either (a) thread the already-computed `canonicalPath` from the
containment check (which runs per site in the same pass and returns it) into
the graph edges, or (b) make the builder async and mint both sides through the
existing `canonicalizePath`. (a) is recommended: zero extra `realpath` calls,
and the graph then matches exactly the set the containment check admitted.
Guard both directions with a case-variant witness and a control (the probe's
four-theta shape).

## Provenance

windows-paths bug-hunt sweep, af476df2 (v0.347.0). Probe:
`tests/scratch-winpaths-invoke-cycle.test.ts` (deleted after the run) — real
NTFS scratch root via `PiFileSystem`, `buildInvokeGraph` +
`checkInvokeStaticResolution` over variant and control cycle pairs; output as
quoted in §Reproduction.

## Fix (0.359.0)

- What shipped: `src/extension/invoke-static-checks.ts` — `buildInvokeGraph`
  is now `async` and takes `fs: Pick<FileSystem, "realpath">`; both the graph
  node keys and each resolved edge callee are minted through the existing
  `canonicalizePath` (`realpath`), the same identity every sibling consumer of
  the static-resolution pass compares under (invocation.md §Static resolution;
  `src/runtime/invocation.ts`). A `realpath` rejection falls back to the
  separator-normalised spelling (leaf-termination preserved) via the sanctioned
  `.then(ok, err)` I/O-boundary arm — the same discipline bug 0361 landed at the
  import-resolver boundary (0326 anti-fork: one canonicalisation across both
  faces). `src/extension/production-composition.ts:894` — the sole production
  call site awaits the async builder with the in-scope `PiFileSystem`.
- Gates: witness `tests/b0362-case-variant-invoke-cycle-edge.test.ts` red at
  fork (canonicalisation neutralised → variant `a ⇄ b` cycle undetected,
  "expected false to be true"; control `c ⇄ d` stayed green) → green after;
  full default suite 534 files / 10040 tests passed; `npm run typecheck` exit 0;
  `npm run lint` exit 0.
- Review: 1 round — `bug-fix-reviewer` CLEAN (no correctness/fidelity/spec
  finding; two non-blocking residuals: a banned prose adverb in a test comment,
  since removed, and a test sentinel whose loud-throw is structurally unreachable on
  the empty-input `buildInvokeGraph([])` — mirrors the file's ratified D-cell
  idiom).
- Verification: SOLID — witness reds for the doc's symptom and restores green
  (byte-exact, `git stash list` empty); full suite 534/10040 green; lint +
  typecheck exit 0; live run by the orchestrator (b0146live 2/2 green) under the
  campaign live lock, not by the verifier.
- Live: `tests/live/b0146live-invoke-array-arg-live-cell.test.ts` (2/2 green) —
  the invoke-face adjacent live cell. It drives the REAL production composition
  root (`discoverAndComposeFixtures` → the now-async `buildInvokeGraph` →
  `checkInvokeStaticResolution`) plus a real RFC-0006 subagent spawn, witnessing
  the async-builder flip is live-clean. WHY this cell: the case-variant-cycle
  observable is proven deterministically offline by `tests/b0362-*` (a bespoke
  case-variant-cycle live cell would need NTFS scratch fixtures this doc does not
  mandate); the live obligation here is to prove the compose-path flip did not
  regress live invoke composition, which b0146live witnesses directly.
- Residuals: none.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the doc RECOMMENDED option (a) (reuse the
  containment check's per-site `canonicalPath`) but kept option (b) live. The
  parent adjudicated (b) on measured evidence: (a)'s "sync today / zero extra
  realpath" premise is false against current code — reusing containment's
  per-input `canonicalPath` forces deferring cycle detection out of
  `checkInvokeStaticResolution` into a second compose pass, a restructure the doc
  understated (DOC-WAS-WRONG note). (b) is ~15 lines + one mechanical call-site
  update, uses the same `canonicalizePath` mechanism 0361 landed (0326 anti-fork),
  and is behaviourally identical. The `tools:` `.theta`-entry cycle surface and
  the `.thetalib` import-cycle detector remain out of scope (§Non-goals).
