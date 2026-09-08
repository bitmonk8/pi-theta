---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: getToolDefinitionAvailable is computed as probeGetToolDefinitionSurface(...) ANDed with a hardcoded-false constant, so the probe call can never affect the dispatch ladder
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-composition.ts:842-849
  - src/extension/production-host-loop-dispatch.ts:218-240
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# getToolDefinitionAvailable is computed as probeGetToolDefinitionSurface(...) ANDed with a hardcoded-false constant, so the probe call can never affect the dispatch ladder

## Observation
`runComposePass` builds the PIC-64 dispatch-ladder probe with
`getToolDefinitionAvailable: probeGetToolDefinitionSurface({ pi }) && getToolDefinitionDispatchWired`,
where `getToolDefinitionDispatchWired` is a local `const` initialized to the
literal `false` (production-composition.ts:844). The conjunction is therefore
constant `false` on every pass: `probeGetToolDefinitionSurface` (a 20-line
exported probe in production-host-loop-dispatch.ts) is invoked on every compose
pass and its return value is discarded. The rung-1 half of the ladder it feeds
exists for an upstream host surface the module's own comment records as
"requested upstream, so far refused", with no dispatcher implemented at the pin.

## Evidence
src/extension/production-composition.ts:842-849:

```ts
  // Flips to the rung-1 dispatcher's wiring presence when one exists; `false`
  // is the honest record that no code-side rung-1 dispatch is implemented yet.
  const getToolDefinitionDispatchWired: boolean = false;
  const dispatchLadderProbe: DispatchLadderProbe = {
    getToolDefinitionAvailable:
      probeGetToolDefinitionSurface({ pi }) && getToolDefinitionDispatchWired,
    hostLoopAvailable: hostLoopSurfacesPresent,
  };
```

`x && false` is `false` for every boolean `x`, so the probe's result cannot
reach `dispatchLadderProbe`.

src/extension/production-host-loop-dispatch.ts:233-240 (the probe whose
production result is discarded; its comment records the surface is absent at
the pin):

```ts
export function probeGetToolDefinitionSurface(host: { readonly pi: unknown }): boolean {
  const pi = host.pi as Record<string, unknown> | null | undefined;
  if (pi === null || pi === undefined) {
    return false;
  }
  return typeof pi["getToolDefinition"] === "function";
}
```

Search counts (exact searches, whole repo, `*.ts`):
- `getToolDefinitionDispatchWired`: 2 hits, both production-composition.ts
  (:844 declaration, :847 use). No other reference anywhere.
- `probeGetToolDefinitionSurface`: definition
  (production-host-loop-dispatch.ts:233), one src caller
  (production-composition.ts:847 — the constant-false conjunction), and test
  callers in tests/production-host-loop-dispatch.test.ts (:405-413), which
  compose it WITHOUT the `&& wired` conjunct.
- `getToolDefinitionAvailable` writers in src/: production-composition.ts:846
  (the constant-false conjunction) and production-theta-producer.ts:3876, which
  spells the same fact as a plain `getToolDefinitionAvailable: false` in its
  probe fallback — the codebase's other production site does not call the probe
  at all.

## Why this is a problem
Dead computation plus speculative generality, both countable. The conjunction's
value is decidable at build time (`&& false`), so the per-pass
`probeGetToolDefinitionSurface({ pi })` call is work whose result nothing can
observe; the semantically identical spelling used at
production-theta-producer.ts:3876 (`getToolDefinitionAvailable: false`) shows
the codebase already has the plain form. The rung-1 machinery this feeds has
zero production instantiations: the only value ever produced for
`getToolDefinitionAvailable` in production code is `false` (both writer sites
cited above), so `resolveDispatchLadder`'s rung-1 arm
(src/runtime/host-loop-dispatch.ts:80) is selected only by test-fabricated
probes, and the producer's rung-1 dispatch arm exists solely to refuse "a probe
that recorded the rung without a dispatcher behind it (a harness shape)"
(production-theta-producer.ts:3891-3898). The feature it anticipates is an
upstream surface recorded in-code as "requested upstream, so far refused"
(production-composition.ts:824-825) — no second user in sight. The fail-closed
rung-3 refusal is untouched by this observation: it fires on
`hostLoopAvailable` being false regardless of how rung 1 is spelled.

## Suggested direction (non-binding, optional)
Record rung-1 unavailability directly (the plain `false` spelling the producer
fallback already uses), keeping `probeGetToolDefinitionSurface` for the moment
the upstream surface and a dispatcher actually land — or drop the surface-probe
half until then. The fix stage owns the choice; the observable behavior is
identical either way.

## False-positive check
- Reference search `getToolDefinitionDispatchWired` across src/, extensions/,
  tools/, tests/: 2 hits, both in the cited lines — no external reader could
  flip it; it is a compile-time constant, not a config knob anything sets.
- Reference search `probeGetToolDefinitionSurface`: src definition + the one
  constant-false call site + direct test callers
  (tests/production-host-loop-dispatch.test.ts:400-413). Tests exercise the
  probe as a unit; the finding is not that the function is dead but that its
  production call site discards the result.
- Reference search `getToolDefinitionAvailable`: readers are
  src/runtime/host-loop-dispatch.ts:80 (ladder arm) and test literals; the two
  production writers both yield `false` (production-composition.ts:846-847,
  production-theta-producer.ts:3876), so no production path can select rung 1.
- String-keyed/dynamic access: the probe itself reads
  `pi["getToolDefinition"]`; no other dynamic reference to the constant or the
  probe exists (searched `getToolDefinition` across the repo).
- Spec-mandated-branch check: PIC-64's fail-closed refusal
  (`theta/load/extension-tool-unreachable`) depends only on both rungs reading
  false and is preserved under any spelling of rung-1 unavailability; the
  constant-false conjunct is not itself a fail-closed branch.
- Intent check: the in-code comments (production-composition.ts:822-829,
  :842-843) record this as a deliberate placeholder for an unlanded upstream
  dispatcher; recorded here for triage — deliberateness does not make the
  discarded probe result readable.

## Triage
verdict: questionable — the `probe(...) && false` conjunction and its unobservable probe call reproduce exactly (production-composition.ts:842-849), but the two-conjunct rung-1 record is normative spec ("Both conjuncts are required", capability-probe.md:84, subagent.md:137), the proposed plain-`false` spelling is precisely what bug-0001's fix deliberately replaced (git b8d4fd2c), and the surface-exposed-without-dispatcher shape is e2e-pinned — zero-behavior cleanup against documented contract, a human should rule (triage: claude-opus-5)
