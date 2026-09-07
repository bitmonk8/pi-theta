---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: ThetaExtensionDeps.registry is declared and documented as consumed, but no code path reads it
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/factory.ts:363-371
  - tests/extension-bootstrap-nonabort.test.ts:333-340
  - src/extension/factory.ts:1019
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# ThetaExtensionDeps.registry is declared and documented as consumed, but no code path reads it

## Observation
`ThetaExtensionDeps` declares an optional `registry?: ThetaRegistry` field
whose doc comment says it is "declared by `V9p-T`, consumed by `V9p`".
`createThetaExtension` is the only consumer of `ThetaExtensionDeps`, and its
body never accesses `deps.registry`. The registries the factory actually uses
come from `wiring.registry` (the compose result) and the factory-scoped
`liveRegistry` slot. Exactly one call site in the repository supplies the
field — a test — and that test's assertions run against its own local
variable, not against anything the factory did with the injected value.

## Evidence
src/extension/factory.ts:363-371 — the field and the consumption claim:
```ts
  /**
   * The extension-scoped `ThetaRegistry` whose drain-state contract the
   * `session_start` handler MUST NOT touch on a `pi.getCommands()` read failure
   * (drain state is owned by `V9m`'s `ThetaRegistry` contract). Injected so the
   * `V9p` getCommands-failure path can be witnessed to leave the registry in
   * its steady-state drain tuple. Optional; declared by `V9p-T`, consumed by
   * `V9p`.
   */
  readonly registry?: ThetaRegistry;
```

Exhaustive search of `deps.` member reads in src/extension/factory.ts (the
only file that receives a `ThetaExtensionDeps` value) yields:
`deps.systemNoteChannel` (:466), `deps.terminator` (:471),
`deps.emitDiagnostic` (14 sites), `deps.rendererGate` (:578, :650),
`deps.latchSessionContext` (:626), `deps.composeInstance` (:659, :884),
`deps.fixtures` (:662, :895, :1019), `deps.isSubagentChild` (:1026).
`deps.registry` appears zero times.

src/extension/factory.ts:1019 — the registry the factory actually threads is
the compose wiring's, not the deps field:
```ts
      registerFixtures([...deps.fixtures, ...wiring.thetas], wiring.registry);
```

tests/extension-bootstrap-nonabort.test.ts:333-340 — the sole supplier; its
later assertion (`registry.readDrainState()` at :365) reads the test's own
local:
```ts
    const registry = new ThetaRegistry();
    const rec = makeRecordingPi({ throwOnGetCommands: true });
    const diagnostics: Diagnostic[] = [];

    createThetaExtension({
      fixtures: [fixture("a"), fixture("b"), fixture("c")],
      emitDiagnostic: (d) => diagnostics.push(d),
      registry,
    })(rec.pi);
```

## Why this is a problem
Vestigial field, proven: the interface's single consumer contains no read of
the member, so any value supplied crosses the boundary and is discarded. The
doc comment's "consumed by `V9p`" is contradicted by the code — the V9p
behavior it describes (leaving drain state untouched on a `getCommands`
failure) holds because the factory never touches the injected registry at
all, which the field's existence neither enables nor witnesses: the test's
assertion would pass identically with the `registry,` line deleted, since the
factory has no reference to that object either way. The field is write-only
API surface carrying an inaccurate consumption claim.

## Suggested direction (non-binding, optional)
Remove the field from `ThetaExtensionDeps` and the one supplying line in the
test; the drain-state-untouched assertion keeps its meaning through the
registry local the test already holds.

## False-positive check
Searched `deps.registry` across src/, extensions/, tools/, tests/ — zero hits.
Searched `ThetaExtensionDeps` repo-wide — the type is consumed only by
`createThetaExtension` (factory.ts:432-433); every other hit is a test/docs
construction site, and only tests/extension-bootstrap-nonabort.test.ts:340
supplies `registry:`. Checked for destructuring or dynamic access of the
field in factory.ts (`{ registry }`, `["registry"]`) — none; the four
`registry` identifiers in factory.ts (:371, :482, :685, :744) are the field
declaration and three unrelated locals/parameters fed by `wiring.registry` or
`liveRegistry`. Test-only-caller rule considered: the test writes the field
but nothing (production or test) reads it back through the interface, so this
is not test-reachable production code — it is unread by construction. Git
history: `git log -S "deps.registry"` on factory.ts shows only 37b0098e (V9p)
and 3a8732da (H8a) touching the surrounding text; no commit ever added a
`deps.registry` read.

## Triage
