---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: ReloadDebouncerDeps.windowMs is never supplied at any construction site
lens: D2                     # D2 | D4 | D7 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/reload-debounce.ts:46-64
  - src/extension/reload-debounce.ts:103-107
  - src/extension/hot-reload.ts:410
sites: 17
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# ReloadDebouncerDeps.windowMs is never supplied at any construction site

## Observation
`ReloadDebouncerDeps` declares an optional `windowMs?: number` field, read in
the constructor as `deps.windowMs ?? RELOAD_DEBOUNCE_WINDOW_MS`. Every
construction of `ReloadDebouncer` across the whole repository — the single
production site and every test site — omits `windowMs`, so the `??` branch
that reads an injected value is never taken anywhere in the codebase; the
constant `RELOAD_DEBOUNCE_WINDOW_MS` (250 ms) is the value actually used in
every run.

## Evidence
`src/extension/reload-debounce.ts:46-64` (the field declaration):
```ts
export interface ReloadDebouncerDeps {
  /** The injected `Clock` seam the debounce window is measured against (V8d). */
  readonly clock: Clock;
  /**
   * Run one rebuild against the live registry / validator cache / registration
   * cache, given the drained window batch ...
   */
  readonly rebuild: (batch: readonly FileWatchEvent[]) => Promise<RebuildOutcome>;
  /** Debounce window in ms (default `RELOAD_DEBOUNCE_WINDOW_MS`). */
  readonly windowMs?: number;
}
```

`src/extension/reload-debounce.ts:103-107` (the only read):
```ts
  constructor(deps: ReloadDebouncerDeps) {
    this.#clock = deps.clock;
    this.#rebuild = deps.rebuild;
    this.#windowMs = deps.windowMs ?? RELOAD_DEBOUNCE_WINDOW_MS;
  }
```

Exact search and hit count: `grep -rn "new ReloadDebouncer(" src tests` → 17
hits, none passing `windowMs`:
- `src/extension/hot-reload.ts:410` — `new ReloadDebouncer({ clock: deps.clock, rebuild: runReload })`
- `tests/execution-status-bus.test.ts:191`
- `tests/reload-teardown-quiesce.test.ts:107,127,146,181,199,355`
- `tests/reload-debounce.test.ts:32,60,79,109,135,159,194,266,304`

A second search, `grep -rn "windowMs:" src tests`, matches only the field's own
declaration site (`reload-debounce.ts:73`, the private `#windowMs` member
declaration) — no object literal anywhere in `src/` or `tests/` sets the key
`windowMs`.

## Why this is a problem
`windowMs` is a threaded-but-unread construction parameter: every call site —
production and every test — passes the same (absent) value, so the field
exists purely as unexercised generality. The doc comment on the constant
(`RELOAD_DEBOUNCE_WINDOW_MS`) explicitly frames the override as an
implementer-tuning escape hatch, but nothing in the tree actually exercises
that escape hatch, including the timing-sensitive debounce tests, which all
rely on the 250 ms default under a `FakeClock`.

## Suggested direction (non-binding, optional)
A direction only: either drop the `windowMs` override and inline the constant
directly, or, if the seam is being kept for a documented future consumer,
note that rationale in the field's doc comment so a future reviewer does not
need to re-derive that it is currently unexercised.

## False-positive check
- Ran `grep -rn "new ReloadDebouncer(" src tests` — 17 hits total, all listed
  above; none supplies `windowMs`.
- Ran `grep -rn "windowMs:" src tests` — 1 hit, the private field declaration
  itself (`reload-debounce.ts:73`), confirming no caller assigns the key.
- Not test-only-reachable-therefore-alive: the finding is not that the field is
  dead code (it is read, via `??`, on every construction), but that no call
  site — production or test — ever supplies a value that would exercise the
  non-default branch, i.e. the parameter is vestigial in the "same value at
  every call site" sense the brief names.
- Checked whether the value is derived indirectly (e.g. via a factory default
  object spread) — no `ReloadDebouncerDeps` object in the tree carries a
  `windowMs` key under any name variant.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
