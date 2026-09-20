---
id: pending
title: "#recoverDeclaredDefaults cites theta-composition-producer.ts:527 for paramBindingsFrom's call, but the call now sits at :585"
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:1748-1757
  - src/extension/theta-composition-producer.ts:96-104
  - src/extension/theta-composition-producer.ts:520-530
  - src/extension/theta-composition-producer.ts:585
sites: 1
fix_scope: localized
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# #recoverDeclaredDefaults cites theta-composition-producer.ts:527 for paramBindingsFrom's call, but the call now sits at :585

## Observation
`#recoverDeclaredDefaults`'s doc comment traces the downstream re-establishment
of a defaulted value's enum tag / schema brand through
"`paramBindingsFrom`, `theta-composition-producer.ts:103`, called at `:527`".
`paramBindingsFrom`'s only call site in that file is currently at line 585,
not 527; line 527 today is unrelated cleanup code inside a `catch` block for
setup-throw handling.

## Evidence
`src/extension/production-theta-producer.ts:1748-1757`:
```ts
   * post-default-merge AJV boundary it feeds (`fillDefaultsAndRevalidate`,
   * `binder/defaulting.ts`). The declaring-enum tag / schema brand a wire-form
   * default loses here is re-established downstream by the binder-`args`
   * inbound boundary (`bindParamsInbound`, `runtime/inbound-boundary.ts`,
   * reached from `paramBindingsFrom`, `theta-composition-producer.ts:103`,
   * called at `:527`) that `runtime-value-model.md:34` already mandates over
   * binder `args`.
   */
```

`src/extension/theta-composition-producer.ts:520-530` (what line 527 is
today — unrelated setup-throw cleanup, no call to `paramBindingsFrom`):
```ts
        // before the captured throw is routed on unchanged.
        try {
          thetaAbort?.abort();
        } catch { // allow-broad-catch: cleanup abort must not mask the setup throw — active-invocation-registry.md#active-invocation-registry
          // Dropped deliberately.
        }
        // A throw before the insertion completes leaks no entry (nothing to
        // remove); a throw after it is removed by this ticket's `finish`.
        invocationTicket?.finish();
        surfaceDispatchDefect(setupThrown, theta, deps);
        return;
```

`src/extension/theta-composition-producer.ts:585` (the actual, sole call
site):
```ts
        const paramBindings = paramBindingsFrom(theta, binderResult.args, deps.schemaValidator);
```

`grep -n "paramBindingsFrom(" src/extension/theta-composition-producer.ts`
returns exactly two hits: the declaration at line 96 and this one call at
line 585.

## Why this is a problem
The citation's ":527" is meant to let a reader jump directly to the call that
threads the binder `args` through `paramBindingsFrom` into
`bindParamsInbound`, completing the tag-reestablishment chain the comment
describes. Following it today lands on unrelated cleanup code with no
relation to `paramBindingsFrom`; the actual call has moved 58 lines down the
file since the comment was written.

## Suggested direction (non-binding, optional)
Update the citation to the call's current line (585), or drop the raw line
number in favour of the symbol name alone (`paramBindingsFrom`'s call inside
`theta-composition-producer.ts`), which needs no renumbering as the file
grows.

## False-positive check
- `grep -n "paramBindingsFrom(" src/extension/theta-composition-producer.ts`
  → two hits: declaration at 96, call at 585 — no call at 527.
- Read lines 515-530 of `theta-composition-producer.ts` in full: confirmed
  line 527 is inside an unrelated `catch` block for setup-throw handling, not
  `paramBindingsFrom`.
- Checked the prior resolved finding on this file
  (`quality/resolved/PTQ-0069-producer-line-citations-drifted.md`), which
  re-verified this exact citation as holding on 2026-09-07
  ("`theta-composition-producer.ts:103` is `function paramBindingsFrom(` and
  `:527` is its call (holds)"); the function has since moved to line 96 and
  its call to line 585 — the citation was correct when last checked and has
  drifted since as the file was edited.

## Triage
<!-- triage appends its note below this line -->
