---
id: PTQ-0441
title: b0365, b0366 and b0367 each hand-roll the rootDouble/producer/render/InstantSettleSession/probeSource/driveInterp/driveInvoke bundle tests/helpers/runtime-belt-probe-harness.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0365-index-kind-belt.test.ts:169-186
  - tests/b0365-index-kind-belt.test.ts:329-358
  - tests/b0365-index-kind-belt.test.ts:563-591
  - tests/b0365-index-kind-belt.test.ts:599-640
  - tests/b0366-join-element-laundered-belt.test.ts:173-190
  - tests/b0366-join-element-laundered-belt.test.ts:207-236
  - tests/b0366-join-element-laundered-belt.test.ts:390-418
  - tests/b0366-join-element-laundered-belt.test.ts:426-466
  - tests/b0366-join-element-laundered-belt.test.ts:485-524
  - tests/b0367-null-left-binary-minus.test.ts:159-176
  - tests/b0367-null-left-binary-minus.test.ts:178-207
  - tests/b0367-null-left-binary-minus.test.ts:453-481
  - tests/b0367-null-left-binary-minus.test.ts:494-535
  - tests/helpers/runtime-belt-probe-harness.ts:64-233
sites: 3
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0365, b0366 and b0367 each hand-roll the rootDouble/producer/render/InstantSettleSession/probeSource/driveInterp/driveInvoke bundle tests/helpers/runtime-belt-probe-harness.ts already centralises

## Observation
tests/b0365-index-kind-belt.test.ts, tests/b0366-join-element-laundered-belt.test.ts and tests/b0367-null-left-binary-minus.test.ts each declare, module-scope, the same `rootDouble`, `producer`, `render`, `InstantSettleSession` class, `probeSource`, `driveInterp` (all three) and `driveInvoke` (b0366 only) pieces that `tests/helpers/runtime-belt-probe-harness.ts` already exports through `makeBeltProbes(parseTheta, bugTag)` plus its standalone `assertValue`. None of the three files imports the helper; each redeclares the identical bundle locally with only the hardcoded `"b0365"`/`"b0366"`/`"b0367"` bug tag and a predecessor-bug-number comment differing from the helper's parameterised version.

## Evidence

`rootDouble()` — tests/b0365-index-kind-belt.test.ts:169-186 (re-read immediately before filing):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    // The prompt-mode drive's only wait primitive is `Clock.setTimeout`; fire the
    // callback synchronously so an instant-settle turn completes deterministically
    // with no real timers (the b0368 harness contract).
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}
```
`diff` against tests/b0366-join-element-laundered-belt.test.ts:173-190 → zero output (byte-identical). `diff` against tests/b0367-null-left-binary-minus.test.ts:159-176 → differs only in the wait-primitive comment's wording ("the b0368 harness contract" vs "b0369 harness"). `diff` against tests/helpers/runtime-belt-probe-harness.ts:64-80 (the canonical, exported `rootDouble`) → differs only in that same comment's final clause.

`class InstantSettleSession` — tests/b0365-index-kind-belt.test.ts:563-591:
```ts
class InstantSettleSession {
  readonly entries: Array<Record<string, unknown>> = [];
  readonly sent: string[] = [];

  sendUserMessage(text: string): void {
    this.sent.push(text);
    this.entries.push({
      type: "message",
      id: `u${this.entries.length + 1}`,
      parentId: undefined,
      message: { role: "user", content: [{ type: "text", text }] },
    });
    this.entries.push({
      type: "message",
      id: `a${this.entries.length + 1}`,
      parentId: `u${this.entries.length}`,
      message: {
        role: "assistant",
        content: [{ type: "text", text: "settled-reply" }],
        api: "anthropic-messages",
        provider: "anthropic",
        model: "m1",
        stopReason: "stop",
      },
    });
  }

  isIdle(): boolean {
    return true;
  }
}
```
`diff` against tests/b0366-join-element-laundered-belt.test.ts:390-418, tests/b0367-null-left-binary-minus.test.ts:453-481, and tests/helpers/runtime-belt-probe-harness.ts:121-149 (the canonical, module-scope `InstantSettleSession`) → zero output in all three comparisons: this 29-line class is byte-for-byte identical across all three test files and the existing helper.

`producer()` — tests/b0365-index-kind-belt.test.ts:329-339, structurally identical to tests/b0366-join-element-laundered-belt.test.ts:207-217, tests/b0367-null-left-binary-minus.test.ts:178-188, and tests/helpers/runtime-belt-probe-harness.ts:84-93:
```ts
function producer() {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}
```

`driveInterp()` — tests/b0365-index-kind-belt.test.ts:599-624, structurally identical (differing only in the hardcoded `slashName`/`sourcePath` "b0365" literal) to tests/b0366-join-element-laundered-belt.test.ts:426-451, tests/b0367-null-left-binary-minus.test.ts:494-519, and the nested `driveInterp` inside `makeBeltProbes` at tests/helpers/runtime-belt-probe-harness.ts:195-224 (which takes `bugTag`/`sourcePath` as parameters instead):
```ts
async function driveInterp(src: string): Promise<InterpProbe> {
  const doc = parseTheta(src);
  const session = new InstantSettleSession();
  const pi = {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (): void => {},
    sendMessage: (): void => {},
  } as unknown as ExtensionAPI;
  const deps = createProductionProducerDeps({
    pi,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
```

`driveInvoke()` — tests/b0366-join-element-laundered-belt.test.ts:485-506, byte-identical apart from the hardcoded `"b0366"`/`"/proj/b0366.theta"` to the nested `driveInvoke` inside `makeBeltProbes` at tests/helpers/runtime-belt-probe-harness.ts (`parseCallee` recording stub, `AbortController`, and `{kind, parseCalleeCalls, ...}` return shape are the same lines):
```ts
async function driveInvoke(src: string): Promise<InvokeProbe> {
  const doc = parseTheta(src);
  let parseCalleeCalls = 0;
  const pi = {
    sendMessage: (): void => {},
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const deps = createProductionProducerDeps({
    pi,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    // Bug 0293: `undefined` still yields Err(load_failure) as a VALUE (the
    // seam-absent default) — enough to record that the invoke reached callee
    // load carrying the bound arg; the child is never spawned.
    parseCallee: (_caller: string | undefined, _path: string): Promise<CalleeParseOutcome | undefined> => {
      parseCalleeCalls += 1;
      return Promise.resolve(undefined);
    },
  });
```

## Why this is a problem
tests/helpers/runtime-belt-probe-harness.ts's own header states its purpose is to end exactly this redeclaration: it was extracted (PTQ-0397, fixed) because tests/b0368-plus-ordering-laundered-belt.test.ts and tests/b0369-control-flow-kind-belts.test.ts "each independently declared the same seven pieces... byte-identical apart from a predecessor-bug-number comment and the slashName/sourcePath bug tag." tests/b0365-index-kind-belt.test.ts, tests/b0366-join-element-laundered-belt.test.ts and tests/b0367-null-left-binary-minus.test.ts reproduce the identical `rootDouble`/`producer`/`render`/`InstantSettleSession`/`probeSource`/`driveInterp`/`driveInvoke` shape (confirmed byte-identical for `rootDouble` and `InstantSettleSession`, structurally identical for the rest, via direct `diff` above), yet none of the three imports `makeBeltProbes`/`assertValue` from the existing helper — the same gap the helper's own creation was meant to close.

## Suggested direction (non-binding, optional)
tests/helpers/runtime-belt-probe-harness.ts already exports `assertValue` and, through `makeBeltProbes(parseTheta, bugTag)`, the `rootDouble`/`producer`/`probeSource`/`InstantSettleSession`/`driveInterp`/`driveInvoke` bundle parameterised by exactly the two things (the fixture's own `parseTheta` and its bug tag) that differ between these three files and the helper's existing two importers (b0368, b0369).

## False-positive check
- Gate-pin: none of the three files matches `*gate*.test.ts` or the named kin; the cited functions are harness plumbing, not a pinned count or inventory assertion.
- Recording-double: `InstantSettleSession` records calls to build a `sent` log the tests assert POSITIVE values against (e.g. `sent=["v=-3"]`), and `driveInvoke`'s `parseCallee` stub records a call count used both to prove a callee load was reached (positive) and that it was NOT reached (`parseCalleeCalls === 0`, a MUST-NOT witness) — the recording-double carve-out covers the latter use but not the duplication-of-definition claim itself, which is about the harness DEFINITION being copy-pasted, not about any single assertion being unfalsifiable.
- docs/bugs/ signature search: docs/bugs/0365-array-index-nonintegral-silent-undefined.md, docs/bugs/0366-join-element-precondition-no-runtime-belt.md and docs/bugs/0367-null-left-binary-minus-parses-as-unary-negation.md are all `Status: fixed`; `npx vitest run tests/b0365-index-kind-belt.test.ts tests/b0366-join-element-laundered-belt.test.ts tests/b0367-null-left-binary-minus.test.ts` → 49 passed (49) at HEAD, so none is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0365-index-kind-belt\|b0366-join-element-laundered-belt\|b0367-null-left-binary-minus" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename or deletion of any file or `it()`/`describe()` — only that the local harness pieces could be imported from the existing helper — so no citation is affected.
- Coverage check: the claim is about a repeated harness DEFINITION, not a missing test path; every piece cited is exercised by its own file's passing tests (49/49, confirmed above).
- Prior-wave check: quality/intake/qw20260917154546-d7-01-b0332-b0338-belt-probe-harness-duplicated.md (same wave, different shard) names b0365/b0366/b0367 as part of the same pattern's size but explicitly scopes its own claim to b0332/b0338 only ("the other 11 sibling files are outside this brief's scope and are named here only as the size of the pattern, not as a claim against them"), so this finding is not a duplicate of that one — it is the corresponding claim for the three files actually inside this brief's scope.

## Triage
verdict: confirmed — independently re-diffed every cited range against tests/helpers/runtime-belt-probe-harness.ts: InstantSettleSession (b0365:563-591, b0366:390-418, b0367:453-481) and producer (b0365:329-339, b0366:207-217, b0367:178-188) are byte-identical to the helper's; rootDouble in all three differs only in the wait-primitive comment's final clause; probeSource/driveInterp (all three) and driveInvoke (b0366:485-524) are identical after normalising the hardcoded "b036N"/"/proj/b036N.theta" to the helper's bugTag/sourcePath parameters (b0366's parseCallee stub differs only by a line-wrap); assertValue is identical bar one message word in b0367; grep confirms only b0368/b0369 import the helper and none of the three files does; docs/bugs 0365/0366/0367 all `Status: fixed`, coverage-matrix.md 0 hits, no *gate* file, and the claim is about the copied harness DEFINITION not any recording-double negative witness, so no D7 carve-out applies; not a duplicate — resolved PTQ-0397 was scoped to b0368/b0369 only and PTQ-0209 names none of these three files, while the same-wave b0332-b0338/b0394-b0395/b0402 siblings each explicitly scope to their own shard's files (triage: claude-fable-5-1)
