---
id: PTQ-0038
title: InstallHotReloadDeps.initialNames is a required field that installHotReload never reads, retained only so supplier object literals keep compiling
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/hot-reload.ts:99-108
  - src/extension/production-composition.ts:1813
  - tests/hot-reload-stale-quiesce-arms.test.ts:117
  - tests/supersession-inflight-rebuild-quiesce.test.ts:799
  - tests/b0312-out-of-root-thetalib-watch-closure.test.ts:362
sites: 5                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# InstallHotReloadDeps.initialNames is a required field that installHotReload never reads, retained only so supplier object literals keep compiling

## Observation
`InstallHotReloadDeps.initialNames` is a required (non-optional) member of the
hot-reload wiring's deps interface. `installHotReload` — the only consumer of
`InstallHotReloadDeps` — never accesses it. The field's own doc comment states
it is no longer read and is retained only because dropping it would break the
suppliers' object literals. Every supplier therefore computes and passes a
value that no code observes; the production supplier maps the composed theta
list to slash names solely to feed this unread field.

## Evidence
src/extension/hot-reload.ts:99-108 — the field and its self-description:
```ts
  /**
   * The slash names registered at `session_start`. Retained because three call
   * sites still supply it and dropping it from the interface would red their
   * object literals: `production-composition.ts`,
   * `tests/hot-reload-stale-quiesce-arms.test.ts`, and
   * `tests/supersession-inflight-rebuild-quiesce.test.ts`. Bug 0311 moved the
   * structural-note basis off the registered-name set onto the debounce-window
   * event batch, so this field is no longer read here.
   */
  readonly initialNames: Iterable<string>;
```

src/extension/production-composition.ts:1813 — the production supplier computes
a value only this field consumes:
```ts
        initialNames: initial.thetas.map((theta) => theta.slashName),
```

Repo-wide search for `initialNames` yields exactly 6 hits: the declaration
above, four suppliers (production-composition.ts:1813,
tests/hot-reload-stale-quiesce-arms.test.ts:117,
tests/supersession-inflight-rebuild-quiesce.test.ts:799,
tests/b0312-out-of-root-thetalib-watch-closure.test.ts:362), and one
docs/bugs/0311 line recording the retention. Zero hits read the field
(`deps.initialNames` appears nowhere; no destructuring of it exists in
hot-reload.ts). The comment's "three call sites" count is itself stale — four
suppliers exist today.

## Why this is a problem
Vestigial field, proven: the sole consumer of the interface
(`installHotReload`, src/extension/hot-reload.ts) contains no read of
`initialNames`, and the field's own comment records that bug 0311 moved the
structural-note basis off this data. Because the field is required, every
present and future caller must construct an `Iterable<string>` (the production
site allocates a mapped array per compose pass) that is discarded at the
interface boundary. This is dead weight the interface actively demands, and
the retention comment has already drifted from the call-site reality it cites.

## Suggested direction (non-binding, optional)
Drop the field from `InstallHotReloadDeps` and delete the four supplier lines
in the same change; no behavior can depend on it since nothing reads it.

## False-positive check
Searched `initialNames` across src/, extensions/, tools/, tests/, docs/ — 6
hits total, all cited above; none is a read. Searched hot-reload.ts for
`deps.` accesses — reads cover watcher, clock, roots, registry, channel,
rediscover, currentWatchRoots, reRegister, probeRuntime; `initialNames` absent.
No string-keyed/dynamic access of the field exists (searched `"initialNames"`
and bracket access — only the literal property key in object literals). Tests
supply the field but do not read it back, so this is not test-only-reachable
production code — it is unread by anything. Git history: `git log -S
initialNames -- src/extension/hot-reload.ts` shows it arrived with the DISCO-2
wiring (df8c1980) and was orphaned by the bug-0311 fix (5369d539), matching
the doc-comment's account; docs/bugs/0311-...md:220 explicitly records
"`InstallHotReloadDeps.initialNames` retained unused".

## Triage
verdict: confirmed — reproduced independently: `initialNames` has zero reads repo-wide (no `deps.initialNames`, no destructuring, no spread/aliasing of `deps`, no string-keyed or bracket access), `InstallHotReloadDeps` has exactly one consumer (`installHotReload`), the four supplier literals verify verbatim (production-composition.ts now at 1821, 8-line drift), and git (df8c1980 introduced, 5369d539 orphaned) plus docs/bugs/0311:220 "retained unused" confirm the vestige; tests only supply the required field and never read it, so the witness-test carve-out does not apply. (triage: claude-opus-5)
