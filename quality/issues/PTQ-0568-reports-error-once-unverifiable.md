---
id: PTQ-0568
title: production-result-channel.test.ts's "reports the error once" claim is structurally unverifiable by its own assertion
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/production-result-channel.test.ts:119-129
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# production-result-channel.test.ts's "reports the error once" claim is structurally unverifiable by its own assertion

## Observation
The test named `"a client dialling a port nobody listens on reports the
error once and never throws on write"` waits for the client's `onError`
callback via a `Promise` that resolves on the callback's first invocation,
then asserts two unrelated `not.toThrow()` claims about later writes. Nothing
in the body counts how many times `onError` fires.

## Evidence
tests/production-result-channel.test.ts:119-129
```ts
it("a client dialling a port nobody listens on reports the error once and never throws on write", async () => {
    // Bind and immediately close to obtain a port that is free.
    const probe = await createProductionChannelServer().listen(() => {});
    probe.close();
    const raw = createProductionChannelClient().connect(probe.port);
    const errored = new Promise<void>((resolve) => raw.onError(() => resolve()));
    raw.write("hello\n");
    await errored;
    expect(() => raw.write("late\n")).not.toThrow();
    expect(() => raw.end()).not.toThrow();
  });
```

## Why this is a problem
A JavaScript `Promise`'s `resolve` is a no-op on every call after the first,
so `raw.onError(() => resolve())` cannot distinguish "the error callback
fired once" from "the error callback fired five times" — `await errored`
settles identically either way. The test's name asserts a cardinality
("once") that no expression in its body reads or could read: there is no
counter, no `toHaveBeenCalledTimes`, and no assertion after `await errored`
that inspects how many times the callback ran. A reader relying on the name
would believe a repeated-`onError`-firing regression is caught here; it is
not — the test passes identically whether the underlying client reports the
error once or many times.

## Suggested direction (non-binding, optional)
A counter incremented inside the `onError` callback, asserted to equal `1`
after `await errored` (or after a drain of pending microtasks), would let the
existing name's "once" claim be checked by something in the body.

## False-positive check
- Gate-pin: `tests/production-result-channel.test.ts` does not match
  `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double: the callback registered via `raw.onError` is not a
  recording double backing a "never called" MUST-NOT witness — it is a
  real socket event handler over a real loopback client, and the finding is
  about a cardinality claim in the test's own title, not about whether the
  callback was called at all.
- docs/bugs/ signature search: `grep -rn "reports the error once"
  docs/bugs/` → 0 hits. No open bug document cites this test by name.
- coverage-matrix/bug-doc citation search: `grep -n "reports the error once"
  docs/reference/coverage-matrix.md` → 0 hits. This finding does not propose
  renaming, merging, or deleting the test — it identifies that the "once"
  half of the existing name is not, and cannot be, checked by the existing
  assertion mechanism; it is not a claim that another code path is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: excerpt matches tests/production-result-channel.test.ts:119-129 verbatim (unchanged since introducing commit 97e4ef27); the body's only onError observation is an idempotent Promise resolve, so `await errored` settles identically for 1 or N firings, and the two not.toThrow() checks are synchronous-throw claims that cannot observe an async second `error` event (loopback probe: a write on the already-errored socket never throws synchronously) — the title's "once" names exactly the production `gone` guard (src/extension/production-result-channel.ts:105-124) that no expression in the body reads; D7 misleading-name class per PTQ-0249/PTQ-0383 shape; both stated greps re-run → 0 hits (no gate, bug-doc or coverage-matrix carve-out applies); no existing PTQ tracks this test (triage: claude-fable-5-1)
