---
id: PTQ-0935
title: bindAndReadNote's bind-assert-and-read-content tail is duplicated between echo-array-per-element-descriptor and echo-value-rule1-sanitisation
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/echo-array-per-element-descriptor.test.ts:241-274
  - tests/echo-value-rule1-sanitisation.test.ts:460-483
sites: 2
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# bindAndReadNote's bind-assert-and-read-content tail is duplicated between echo-array-per-element-descriptor and echo-value-rule1-sanitisation

## Observation
`tests/echo-array-per-element-descriptor.test.ts` and `tests/echo-value-rule1-sanitisation.test.ts` each declare their own `async function bindAndReadNote(...)`. The two signatures differ (the first threads a `source` string so its `producerWithCapture` can re-read fixture bytes for `#recoverDeclaredDefaults`; the second does not need that), but from `scriptEnvelope(scripted, { kind: "ok", args })` onward the two bodies' remaining eight lines — the `runBinder` call shape, the `result.bound` assertion with its exact message, the `noteChannelEntries` filter with its exact `toHaveLength(1)` message, the `channelNotes[0]!.display` assertion, and the `return channelNotes[0]!.content` tail — are byte-identical, and each carries a docstring that opens with the same sentence about failing loudly naming the unmet precondition.

## Evidence

`tests/echo-array-per-element-descriptor.test.ts:241-274`:
```ts
/**
 * Drive one scripted `ok` bind over `source` and return the single delivered
 * `theta-system-note` content. Fails loudly naming the unmet precondition when
 * the bind did not reach the emitter, so a broken harness cannot masquerade as
 * a passing assertion. Nothing here catches: a throw out of the echo path (the
 * 0092 symptom) surfaces as the test's own rejection.
 */
async function bindAndReadNote(
  source: string,
  args: Readonly<Record<string, unknown>>,
): Promise<string> {
  scriptEnvelope(scripted, { kind: "ok", args });
  const { deps, notes } = producerWithCapture({
    readBytes: (path: string): Promise<Uint8Array> =>
      path === SOURCE_PATH
        ? Promise.resolve(new TextEncoder().encode(source))
        : Promise.reject(new Error(`fixture fs: no source registered for ${path}`)),
  });
  const result = await deps.runBinder({
    theta: compositionInput(source),
    args: "some free-text invocation tail",
    ctx: ctxDouble(),
  });
  expect(result.bound, "the scripted `ok` envelope must bind for the echo to be emitted").toBe(
    true,
  );
  const channelNotes = noteChannelEntries(notes);
  expect(
    channelNotes,
    "exactly one theta-system-note (the success echo) is emitted on the `ok` arm",
  ).toHaveLength(1);
  expect(channelNotes[0]!.display, "the echo note is display:true").toBe(true);
  return channelNotes[0]!.content;
}
```

`tests/echo-value-rule1-sanitisation.test.ts:460-483` — the same tail, byte-identical from `scriptEnvelope` onward except the `producerWithCapture()`/`theta:` call arguments (no `source`/`readBytes` needed here):
```ts
/**
 * Drive one scripted `ok` bind and return the single delivered note content.
 * Fails loudly naming the unmet precondition when the bind did not reach the
 * emitter, so a broken harness cannot masquerade as a passing assertion.
 */
async function bindAndReadNote(args: Readonly<Record<string, unknown>>): Promise<string> {
  scriptEnvelope(scripted, { kind: "ok", args });
  const { deps, notes } = producerWithCapture();
  const result = await deps.runBinder({
    theta: twoParamTheta(),
    args: "the async module for the team",
    ctx: ctxDouble(),
  });
  expect(result.bound, "the scripted `ok` envelope must bind for the echo to be emitted").toBe(
    true,
  );
  const channelNotes = noteChannelEntries(notes);
  expect(
    channelNotes,
    "exactly one theta-system-note (the success echo) is emitted on the `ok` arm",
  ).toHaveLength(1);
  expect(channelNotes[0]!.display, "the echo note is display:true").toBe(true);
  return channelNotes[0]!.content;
}
```

Exact search: `grep -n "^async function bindAndReadNote" tests/*.test.ts` returns exactly these two files (2 hits); `grep -n "the scripted \`ok\` envelope must bind for the echo to be emitted" tests/*.test.ts` returns exactly these two files (2 hits), confirming the assertion-message strings, not merely the control flow, are byte-identical.

## Why this is a problem
Eight lines spanning three assertions and the return statement — the "drive one scripted ok bind, assert it bound, assert exactly one note landed, assert it is display:true, return its content" sequence — are typed twice with identical assertion messages rather than factored into one shared step that the two files' differing `runBinder` inputs (`compositionInput(source)` vs `twoParamTheta()`) could feed. Both files' surrounding rig (`scriptEnvelope`, `producerWithCapture`, `noteChannelEntries`, `ctxDouble`) is already imported from `tests/helpers/scripted-live-session-harness.ts` and `tests/helpers/tool-call-dispatch-harness.ts`; only this bind-and-read tail remains locally re-typed in each file.

## Suggested direction (non-binding, optional)
Noting that the diverging piece between the two copies is exactly the `theta`/`producerWithCapture` argument, and everything after `scriptEnvelope` is byte-identical, is an observation that a shared step parameterised on those two arguments has no home in `tests/helpers/scripted-live-session-harness.ts` yet, not a design for adding one.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin; the cited code is a helper function body, not a pinned count or inventory.
- Recording-double check: `channelNotes`/`noteChannelEntries` back a positive "exactly one note landed, read its content" assertion, not a "never called" witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "bindAndReadNote" docs/bugs/*.md` → 0 hits; no doc marks this helper's duplication as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "echo-array-per-element-descriptor\|echo-value-rule1-sanitisation" docs/reference/coverage-matrix.md` → 0 hits; docs/bugs/0092 cites `tests/echo-array-per-element-descriptor.test.ts` as "(new) — the regression" and `tests/echo-value-rule1-sanitisation.test.ts` by its group-G cell range, never by the `bindAndReadNote` name, and this finding proposes no change to any cited cell or `it()` — only that the shared tail be factored once.
- Coverage check: the claim is about a repeated helper-function DEFINITION; every cell in both files that calls `bindAndReadNote` already exercises its own file's copy.
- Prior-finding check: `grep -rl "bindAndReadNote" quality/issues/*.md quality/resolved/*.md quality/intake/*.md` → 0 hits. `quality/resolved/PTQ-0463-echo-group-g-rig-duplicated.md` (status: fixed) tracked a disjoint set of pieces from the same two files — `CapturedNote`, `scriptEnvelope` (the function itself, before it moved to `tests/helpers/`), `parseDeps`, `BINDER_MODEL`, `producerWithCapture`, `ctxDouble` — and its own evidence excerpts stop short of `bindAndReadNote`, confirmed by re-reading its cited line ranges (echo-array :237-320, echo-value :462-533) against the current file, where `producerWithCapture`, `CapturedNote`, `scriptEnvelope`, `parseDeps` and `BINDER_MODEL` are gone (migrated to imports) but `bindAndReadNote` remains, unaddressed by that fix.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce exactly at echo-array:241-274 and echo-value:460-483, mktemp `diff` of the awk-extracted `runBinder`→`return` spans differs only in the `theta:` argument and the `args:` string so the 10 lines from `expect(result.bound…` through `return channelNotes[0]!.content` (three assertions, identical messages) are byte-identical, both copies are live (7 / 3 call sites), both files already import the surrounding rig from tests/helpers/ and no helper exports a bind-assert-read tail, no gate/recording-double/witness-list carve-out applies (coverage-matrix 0 hits; docs/bugs 0087/0091/0092 cite cells, not this helper) — two evidentiary slips, neither refuting: the stated `^async function bindAndReadNote` census is 3 files not 2 (tests/b0381-echo-object-first-field-declaration-order.test.ts:217-244 is a third copy whose tail differs only by `probeTheta(source)` and an inline `notes.filter(customType === SYSTEM_NOTE_CHANNEL)` for `noteChannelEntries`, and the "must bind" message hits it too — sites should read 3; b0381's rig is open PTQ-0535's, which never names bindAndReadNote), and the prior-finding grep is 2 hits not 0 (resolved PTQ-0463 mentions bindAndReadNote only in passing; its seven-declaration inventory stops at ctxDouble and its landed fix migrated that rig while leaving this tail in place), so the root cause is untracked; fixer should fold the b0381 site in (triage: claude-fable-5-1)
