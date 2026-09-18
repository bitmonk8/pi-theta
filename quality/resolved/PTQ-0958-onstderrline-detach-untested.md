---
id: PTQ-0958
title: "onLine / onStderrLine return detach handles" names two detach paths but the body only exercises onLine's
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/subagent-result-channel.test.ts:286-295
sites: 1
fix_scope: localized
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# "onLine / onStderrLine return detach handles" names two detach paths but the body only exercises onLine's

## Observation
The test at `tests/subagent-result-channel.test.ts:286-295` is titled `"onLine /
onStderrLine return detach handles"`, naming both of `ResultChannel`'s line
listeners. The body calls `channel.onLine(...)`, captures its detach handle,
invokes it, and asserts the detached listener stops receiving lines. It never
calls `channel.onStderrLine(...)` at all — no stderr-frame push, no detach
call, no assertion touching stderr delivery.

## Evidence
`tests/subagent-result-channel.test.ts:286-295` (re-read immediately before
filing):
```ts
  it("onLine / onStderrLine return detach handles", async () => {
    const { channel, server } = await open();
    const seen: string[] = [];
    const detach = channel.onLine((line) => seen.push(line));
    const child = server.dial();
    child.push(hello());
    detach();
    child.push(`${JSON.stringify({ theta_progress: { v: 1 } })}\n`);
    expect(seen).toEqual([]);
  });
```
`src/runtime/subagent-result-channel.ts:147-149` shows `onStderrLine` is a
sibling method with the identical `(listener) => () => void` detach-handle
shape as `onLine`, so it is directly testable in the same style — the name's
second half describes a real, checkable behaviour that this body skips:
```ts
  onLine(listener: (line: string) => void): () => void;
  ...
  onStderrLine(listener: (line: string) => void): () => void;
```

## Why this is a problem
A reader following the name would conclude that this single test pins detach
semantics for both of the channel's line-listener registration points. In
fact the file's own `stderr` array (populated via `open()`'s
`channel.onStderrLine((line) => stderr.push(line))` in the shared harness) is
never even read inside this test, and no other test in the file detaches an
`onStderrLine` subscriber and asserts the detached listener goes silent. The
misread costs a reviewer real information: if `onStderrLine`'s detach handle
were broken (e.g. it silently no-ops), nothing in this suite would catch it,
yet the test's name reads as though that exact case is covered.

## Suggested direction (non-binding, optional)
The title's own two-listener claim points at the fix: exercise
`onStderrLine`'s detach handle with the same push/detach/push-again shape
already used for `onLine`, in this test or a sibling one.

## False-positive check
- Gate-pin carve-out: `subagent-result-channel.test.ts` does not match
  `*gate*.test.ts` or any named kin; not applicable.
- Recording-double carve-out: the test is not a MUST-NOT witness over a
  recording double; the missing coverage is a positive detach-behaviour
  assertion, not a "never called" check; not applicable.
- docs/bugs/ signature search: `grep -rl "onStderrLine" docs/bugs/*.md` → 0
  hits; no documented correct-reason red covers this test's shape.
- coverage-matrix/bug-doc citation search: `grep -n
  "onLine / onStderrLine return detach handles" docs/reference/coverage-matrix.md`
  → 0 hits; this finding proposes no merge, rename, or deletion of the test,
  only that its body does not match what its name promises.
- Coverage-drift check: this finding is not "onStderrLine's detach path is
  untested" as a coverage gap — it is that THIS test's name claims to cover a
  behaviour its own body never exercises, which is the D7 misleading-name
  class, not a routing note about missing coverage.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: the excerpt reproduces verbatim at tests/subagent-result-channel.test.ts:286-295 and the title "onLine / onStderrLine return detach handles" (landed with the body in 97e4ef27) names two detach paths while the body calls only channel.onLine, captures/invokes only its handle, and never touches onStderrLine, the stderr array, or a stderr frame; src/runtime/subagent-result-channel.ts:147-149/:340-350 confirms onStderrLine is a sibling returning the same detach closure, and `grep -rn "= .*\.onStderrLine(" tests/` → 0 hits, so no test anywhere captures that handle; open()'s harness (:58-59) subscribes onStderrLine but discards the detach — D7 misleading-name (title-overclaims, same class as PTQ-0566/0917/0943) inside tests/, not a gate test or recording-double witness; coverage-matrix grep → 0 reproduces, but the stated `docs/bugs` grep returns 1 hit not 0 (0295:125, a fake SubagentChildProcess interface listing — not a correct-reason-red signature for this test, so the carve-out stays inapplicable); no existing PTQ tracks this test or title (PTQ-0513 concerns the sibling factory test's harness) (triage: claude-fable-5-1)
