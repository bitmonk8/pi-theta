---
id: PTQ-0689
title: M9's name claims the outcome event fires "before the shutdown request is reachable" but the harness's ctx has no shutdown member, so no assertion can witness that ordering
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-fn-child-launch.test.ts:450-466
  - tests/subagent-fn-child-launch.test.ts:98-105
  - src/extension/production-theta-producer.ts:3223-3227
sites: 1
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# M9's name claims the outcome event fires "before the shutdown request is reachable" but the harness's ctx has no shutdown member, so no assertion can witness that ordering

## Observation
`tests/subagent-fn-child-launch.test.ts`'s M9 test is titled 'a bare-tail fn
entry emits one "ok" outcome event before the shutdown request is reachable'.
The production code it drives (`driveSubagentRootRegime` in
`src/extension/production-theta-producer.ts`) does call `emitOutcome("ok")`
immediately before `this.#requestVisibleChildShutdown(ctx)` on the Ok path,
matching the title's ordering claim in the source. But the test's `ctx`
(`ctxOf()`, this file's own default context builder) carries no `shutdown`
member at all, and `#requestVisibleChildShutdown` only ever does a
`typeof`-presence probe of `ctx.shutdown` before calling it. With no
`shutdown` present, that call is a silent no-op regardless of when — or
whether — it runs relative to `emitOutcome`; the test's only observable,
`RecordingBus.emitted`, records nothing about `ctx.shutdown` at all.

## Evidence

tests/subagent-fn-child-launch.test.ts:450-466 (re-read immediately before
filing):
```ts
it('M9: a bare-tail fn entry emits one "ok" outcome event before the shutdown request is reachable; the envelope still carries fn_tail as today', async () => {
    const bus = new RecordingBus();
    const outcome = await driveSubagentFnEntry({
      theta: callerTheta(STEP_SRC, "prompt"),
      slug: "caller",
      fnName: "step",
      params: { x: "hello", n: 2 },
      ctx: ctxOf(),
      modelRegistry: { getAvailable: () => MODELS } as unknown as ModelRegistry,
      pi: noopPi(),
      outcomeEvents: bus,
    });
    expect(outcome.envelope).toEqual({ kind: "ok", value: "hello" });
    expect(outcome.outcomeEmissions).toHaveLength(1);
    expect(outcome.outcomeEmissions[0]!.channel).toBe(SUBAGENT_CHILD_OUTCOME_CHANNEL);
    expect(outcome.outcomeEmissions[0]!.data).toEqual({ apiVersion: 1, outcome: "ok", slug: "caller" });
  });
```
Every assertion is on `outcome.envelope` and `outcome.outcomeEmissions` — the
count and content of what `RecordingBus` recorded. None references `ctx`,
`shutdown`, or any second event stream a "before X" ordering claim would need
two timestamped observables to establish.

tests/subagent-fn-child-launch.test.ts:98-105 — the `ctx` this test passes
(via `driveSubagentFnEntry`'s default when none is passed and via `ctxOf()`
explicitly here), with no `shutdown` field:
```ts
function ctxOf(cwd = "/work/project"): ExtensionCommandContext {
  return {
    model: MODELS[0],
    cwd,
    signal: undefined,
    sessionManager: { getEntries: () => [], getLeafId: () => undefined },
  } as unknown as ExtensionCommandContext;
}
```

src/extension/production-theta-producer.ts:3223-3227 — the code path M9
exercises, where the ordering the title names actually lives (in the
PRODUCTION source, not in any test assertion):
```ts
           // RFC 0012 §7: outcome BEFORE the shutdown request, so a
           // subscriber can enqueue its last report before the host begins
           // deferring toward shutdown.
           emitOutcome("ok");
           this.#requestVisibleChildShutdown(ctx);
```
`#requestVisibleChildShutdown` (src/extension/production-theta-producer.ts,
documented at its declaration) is `typeof`-presence-probed against
`ctx.shutdown`; absent, it is a no-op with no side effect the test's
`RecordingBus` — or anything else in the M9 test — could observe.

## Why this is a problem
A reader of the test name would expect the test to witness that the outcome
event precedes some second, independently-observable event (a "shutdown
request" becoming reachable) — e.g. by recording both events and asserting
their relative order, or by giving `ctx` a shutdown hook whose invocation is
itself recorded. Nothing in the test does either: the only recorder in scope
is `RecordingBus`, which records solely the `emitOutcome` call, and the `ctx`
passed to the drive has no `shutdown` member for `#requestVisibleChildShutdown`
to invoke, so that half of the claimed ordering literally cannot fire, let
alone be timestamped against the outcome emission. Swapping the order of the
two production-code lines quoted above (`emitOutcome("ok")` and
`this.#requestVisibleChildShutdown(ctx)`) would not change this test's
outcome at all — `RecordingBus.emitted` would still record exactly the same
one entry — so the test cannot fail on the very ordering regression its name
names.

## Suggested direction (non-binding, optional)
A `ctx` carrying a recording `shutdown()` stub (or a second recorder args
line up against `RecordingBus`'s), with an assertion comparing the two
recorders' call order, would let the "before" claim in the name be witnessed;
naming the current test for what it does check (the outcome payload's shape
and count) is the neighbouring option.

## False-positive check
- Gate-pin check: this file does not match `*gate*.test.ts` or the named gate
  kin; not a pinned-count/inventory test.
- Recording-double check: `RecordingBus` is a legitimate recording double
  here, but this finding is not about the double's legitimacy — it is about
  the TEST NAME claiming an ordering property that no double in the test
  (recording or otherwise) is positioned to witness. The negative-witness
  carve-out is about MUST-NOT assertions being legitimate; this finding does
  not challenge any MUST-NOT assertion.
- docs/bugs/ signature search: `grep -rln "M9:" docs/bugs/*.md` and `grep -rn
  "before the shutdown request is reachable" docs/` → 0 hits; no open bug
  document pins this title's wording as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "emits one .ok. outcome event before the shutdown" docs/reference/coverage-matrix.md`
  → 0 hits; this finding proposes no merge, rename, or deletion of the test,
  only observes the name/body mismatch.
- Coverage check: this is not a claim that shutdown-ordering is untested
  system-wide (a coverage claim) — it is that THIS test's name promises a
  witness THIS test's own body and fixtures cannot produce, given what `ctx`
  and `RecordingBus` are wired to in this file.
- Git-history / RFC check: `RFC 0012 §7`'s "outcome BEFORE the shutdown
  request" comment (src/extension/production-theta-producer.ts:3223-3225)
  confirms the ordering IS a real, intentional production invariant — the
  finding is scoped to the test's inability to witness it, not to whether the
  invariant itself is real or correct (a bug/behaviour claim, out of scope
  for D7).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts match at the cited lines; M9's four assertions read only `outcome.envelope`/`outcome.outcomeEmissions`, and the shutdown request is doubly unreachable in this harness — `driveSubagentFnEntry` (tests/helpers/subagent-fn-child-regime.ts:105) passes `subagentControlPlane` with no `launch`, so `#requestVisibleChildShutdown` (production-theta-producer.ts:3475-3483) returns at the `presentation !== "visible"` guard before its `typeof ctx.shutdown` probe, and `ctxOf()` carries no `shutdown` anyway — so swapping lines 3226/3227 leaves M9 green; the "before the shutdown request" ordering is actually witnessed by M1 in tests/subagent-visible-regime.test.ts:256-267 (`order` == ["envelope","emit","shutdown"] via a recording `shutdown` stub), making M9's title a misleading name (D7 class), not a coverage gap; no gate/bug-doc/coverage-matrix carve-out applies (grep of the title wording → only the test itself) and no PTQ tracks this test (triage: claude-fable-5-1)
