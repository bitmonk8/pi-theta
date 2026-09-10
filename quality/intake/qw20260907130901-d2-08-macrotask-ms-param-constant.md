---
id: pending
title: "`macrotask`'s `ms` parameter receives the same `POLL_INTERVAL_MS` constant at both of its call sites"
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:5949-5954
  - src/extension/production-theta-producer.ts:5875
  - src/extension/production-theta-producer.ts:7223
sites: 3
fix_scope: localized
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# `macrotask`'s `ms` parameter receives the same `POLL_INTERVAL_MS` constant at both of its call sites

## Observation

The module-local helper `macrotask(clock, ms)` releases the event loop through
the injected `Clock`. Its `ms` parameter is passed the module constant
`POLL_INTERVAL_MS` at every call site — there are exactly two — and the
helper's own doc comment already pins the wait to "one poll interval", so the
parameter carries no varying information.

## Evidence

src/extension/production-theta-producer.ts:5949-5954 — the declaration:

```ts
/** Release the event loop for one poll interval through the injected `Clock` seam. */
function macrotask(clock: Clock, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    clock.setTimeout(() => resolve(), ms);
  });
}
```

`grep -n "macrotask(" src/extension/production-theta-producer.ts` yields 3
hits: the declaration (5950) and two calls. Both calls pass `POLL_INTERVAL_MS`
(declared at line 5903, `const POLL_INTERVAL_MS = 10;`).

Call site 1 — src/extension/production-theta-producer.ts:5873-5876
(`LivePromptQueryModel.#pollWhile`):

```ts
    for (let i = 0; i < bound && condition() && !this.#thetaAbort.signal.aborted; i += 1) {
      await macrotask(this.#clock, POLL_INTERVAL_MS);
    }
```

Call site 2 — src/extension/production-theta-producer.ts:7221-7224
(`driveStreamedUserTurn`'s local `pollWhile`):

```ts
  const pollWhile = async (condition: () => boolean, bound: number): Promise<boolean> => {
    for (let i = 0; i < bound && condition() && deps.ctx.signal?.aborted !== true; i += 1) {
      await macrotask(deps.clock, POLL_INTERVAL_MS);
    }
```

## Why this is a problem

Vestigial parameter: every call site passes the same value (both cited above —
the exhaustive set), and the helper's doc comment already fixes the semantics
to "one poll interval", so the parameter models configurability nothing uses.
Each caller must re-name the constant the helper is defined to embody, which is
one more degree of freedom to keep consistent for zero variation in behavior.

## Suggested direction (non-binding, optional)

Fold `POLL_INTERVAL_MS` into the helper (it is declared 47 lines before the
helper in the same module) and drop the parameter, or leave as-is if a
variable-cadence caller is genuinely expected.

## False-positive check

- Exhaustive call-site search: `grep -n "macrotask(" src/extension/production-theta-producer.ts`
  → 3 hits (declaration + the two calls above); the helper is module-local
  (not exported), so no callers exist in src/, extensions/, tools/, or tests/
  outside this file — confirmed by repo-wide grep for `macrotask(` returning
  no hits in other files that reference this helper.
- No dynamic/string-keyed access possible for a module-local function used by
  direct call.
- Git intent check: `git log -S "macrotask"` on this file reaches back past
  the corpus rename (2bc69157) with no commit introducing a call that passes
  anything other than `POLL_INTERVAL_MS` (a `git log -G` pattern search for a
  differing second argument matches only the declaration line itself).

## Triage

verdict: questionable — both current call sites do pass POLL_INTERVAL_MS (verified exhaustively; helper is module-local, no other refs), but the parameter is live rather than dead and the filing's git check is refuted: commit fed12acd called `macrotask(this.#clock, SUBAGENT_MID_STREAM_CANCEL_MS)`, so "configurability nothing uses" is a taste call a human should rule. (triage: claude-opus-5)
verdict: questionable — condition reproduces in strengthened form (HEAD has ONE `macrotask(` call, :6024, passing `POLL_INTERVAL_MS`; declaration :6099 byte-matches; module-local, zero other refs in src/extensions/tools/tests — test hits are comments) but the filing is stale and partly wrong: cited call site 2 (`driveStreamedUserTurn`'s local `pollWhile`, :7223) was deleted by 4f2db584 (PTQ-0118 fix, the day after filing) so "exactly two"/`sites: 3` no longer hold, and the git-intent claim is refuted — `git log --follow -G` shows fed12acd called `macrotask(this.#clock, SUBAGENT_MID_STREAM_CANCEL_MS)` (=250) until 20540abc removed it (the filing's un-followed `-S`/`-G` stopped at rename 2bc69157), so `ms` was designed general at 3a8732da and is live (forwarded to `Clock.setTimeout(fn, ms)`), not dead; with a single remaining caller the "degree of freedom to keep consistent" anchor has nothing to keep consistent and `POLL_INTERVAL_MS` keeps 6 other bound-arithmetic uses, so specialising a `sleep(clock, ms)` primitive to one caller's cadence is a taste call for a human (triage: claude-opus-5)

