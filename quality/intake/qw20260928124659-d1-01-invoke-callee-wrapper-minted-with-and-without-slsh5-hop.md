---
id: pending
title: The invoke-style boundary mints an `invoke_callee` wrapper two ways — `wrapInvokeCalleeFailure` (both `InvokeCallSite` arms) wraps then records the SLSH-5 hop through `recordInvokeHop`, while `subagentCalleeError` (both `subagent fn` regimes) wraps and records nothing — and the ledger's own header, rewritten by the bug 0349 fix, already misread the second way as a hop producer
lens: D1
status: intake
verdict: pending
locations:
  - src/runtime/invoke-provenance-ledger.ts:24-32
  - src/runtime/invoke-provenance-ledger.ts:125-136
  - src/runtime/invoke-provenance.ts:38-60
  - src/runtime/effectful-statement-host.ts:481-484
  - src/runtime/effectful-statement-host.ts:564-567
  - src/runtime/effectful-statement-host.ts:620-627
  - src/runtime/subagent-fn-call.ts:19-26
  - src/runtime/subagent-fn-call.ts:213-222
  - src/runtime/subagent-fn-call.ts:284-291
  - src/extension/production-theta-producer.ts:372-380
sites: 5
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# The invoke-style boundary mints an `invoke_callee` wrapper two ways — `wrapInvokeCalleeFailure` (both `InvokeCallSite` arms) wraps then records the SLSH-5 hop through `recordInvokeHop`, while `subagentCalleeError` (both `subagent fn` regimes) wraps and records nothing — and the ledger's own header, rewritten by the bug 0349 fix, already misread the second way as a hop producer

## Observation

Three production sites construct a `kind: "invoke_callee"` wrapper around a callee-returned `Err`. Two of them — the literal `invoke(...)` leg and the `.theta`-callable bare-identifier leg — share one helper (`wrapInvokeCalleeFailure`, `effectful-statement-host.ts`) that builds the wrapper via `surfaceThetaCallableCalleeFailure` and immediately hands it to `deps.recordInvokeHop` with an `InvokeCallSite` descriptor, so the provenance ledger (`invoke-provenance-ledger.ts`) can later render the SLSH-5 ` from <callee_path> invoked at <parent_path>:<line>` suffix for that hop. The third — `subagentCalleeError` in `subagent-fn-call.ts`, reached from both the in-process regime (`mapSubagentFnFlow`) and the child-launch regime (`mapSubagentFnChildOutcome`) — builds the wrapper inline and calls no hop recorder; the `InvokeCallSite` union has no arm a `subagent fn` call site could use. `chainFor` walks every `invoke_callee` wrapper and silently skips one with no ledger entry. The ledger's module header, rewritten in the bug 0349 fix commit, lists `subagentCalleeError` as the third hop-producing site and states that "every executed hop of these three shapes contributes to the SLSH-5 chain"; the producer's `emitTopLevelErrNote` doc enumerates the no-entry cases and omits this one.

## Evidence

**Way A — wrap then record (two `InvokeCallSite` arms, one helper).** `src/runtime/effectful-statement-host.ts:620-627`:
```ts
  const wrapped = surfaceThetaCallableCalleeFailure(
    child.calleePath,
    result.error as unknown as QueryError,
    `${messagePrefix} of ${child.calleePath} callee returned Err(${summariseErrorField(innerKind)})`,
  );
  // Bug 0088 (SLSH-5): record this hop before the wrapper propagates anywhere.
  await deps.recordInvokeHop?.(wrapped as InvokeCalleeError, child.calleePath, callSite);
  return { ok: true, value: makeErr(wrapped as unknown as ThetaValue) };
```
Its two callers supply the two call-site arms. `src/runtime/effectful-statement-host.ts:481-484`:
```ts
      return wrapInvokeCalleeFailure(result, invokeOutcome.source, child, deps, ".theta-callable call", {
        style: "theta_callable_bare",
        calleeNameToken: expr.range.start,
      });
```
`src/runtime/effectful-statement-host.ts:564-567`:
```ts
      return wrapInvokeCalleeFailure(result, outcome.source, child, deps, "invoke", {
        style: "literal_invoke",
        invokeToken: expr.range.start,
      });
```
The descriptor union is closed at those two arms. `src/runtime/invoke-provenance.ts:38-40` and `:59-60`:
```ts
export type InvokeCallSite =
  | {
      /** A literal `invoke(...)` / `invoke<Schema>(...)` expression. */
…
       */
      readonly calleeNameToken: Position;
```

**Way B — wrap, no record (both `subagent fn` regimes).** `src/runtime/subagent-fn-call.ts:19-26`:
```ts
function subagentCalleeError(inner: ThetaValue, fnName: string): InvokeCalleeError {
  return {
    kind: "invoke_callee",
    message: `subagent fn ${fnName} callee returned Err`,
    callee_path: fnName,
    inner: inner as unknown as QueryError,
  };
}
```
In-process regime, `src/runtime/subagent-fn-call.ts:213-222`:
```ts
    case "fail": {
      // A callee-returned / `?`-propagated Err crosses wrapped as
      // InvokeCalleeError{inner:<raw Err>}, exactly like an invoked subagent
      // callee (invocation.md §Failures).
      const raw = flow.flow === "propagate" ? flow.err : flow.error;
      return {
        flow: "value",
        value: makeErr(subagentCalleeError(raw, fn.name) as unknown as ThetaValue),
      };
    }
```
Child-launch regime, `src/runtime/subagent-fn-call.ts:284-291`:
```ts
  if (outcome.source === "boundary-minted") {
    return { flow: "value", value: result };
  }
  return {
    flow: "value",
    value: makeErr(subagentCalleeError(result.error, fnName) as unknown as ThetaValue),
  };
}
```

**The consumer skips the unrecorded wrapper.** `src/runtime/invoke-provenance-ledger.ts:125-136`:
```ts
    chainFor(error) {
      const chain: ChainHop[] = [];
      let current: QueryError = error;
      while (isInvokeCalleeError(current)) {
        const hop = hops.get(current);
        if (hop !== undefined) {
          chain.push(hop);
        }
        current = current.inner;
      }
      return chain;
    },
```

**The drift that already happened — the ledger header names Way B as a hop producer.** `src/runtime/invoke-provenance-ledger.ts:24-32`:
```
// WHICH WRAPPERS CARRY A HOP. The ledger records against `invoke_callee`
// wrappers. Three sites in `src/` construct one: the literal-`invoke` hop
// (`runInvokeEffect`, via `surfaceThetaCallableCalleeFailure`), the code-side
// `.theta`-callable bare-identifier call (`runToolCallEffect`'s theta-callable
// branch, also via `surfaceThetaCallableCalleeFailure`, recording a
// `theta_callable_bare` hop — bug 0349), and the `subagent fn` callee site
// (`subagentCalleeError` in `statement-executor.ts`). Every executed hop of
// these three shapes contributes to the SLSH-5 chain.
```
`git show 2c1217c4 -- src/runtime/invoke-provenance-ledger.ts` (commit `fix(bug-0349): code-call leg applies the invoke error model — v0.338.0`) shows this paragraph replacing the prior two-site text with the `+` lines "Three sites in `src/` construct one … and the `subagent fn` callee site (`subagentCalleeError` in `statement-executor.ts`). Every executed hop of these three shapes contributes to the SLSH-5 chain." The bug record states the same at `docs/bugs/0349-theta-callable-code-call-leg-child-internal-cancel-bare.md:321-327`: "the 'WHICH WRAPPERS CARRY A HOP' inventory now names THREE hop-producing sites (was two): … and the `subagent fn` callee site (`subagentCalleeError`)." `subagentCalleeError` records no hop at that commit or at HEAD (search S2 below: no `recordInvokeHop` reference in `subagent-fn-call.ts`).

The producer-side doc enumerates the no-entry cases and omits this one. `src/extension/production-theta-producer.ts:372-380`:
```
   * (em-dash U+2014). Bug 0088 / SLSH-5: `chain` walks the `invoke_callee`
   * wrapper chain outermost-first through this producer's invoke-hop
   * provenance ledger (`#ledger`), which every `invoke` hop populated as it
   * ran (`#recordInvokeHop`); a non-cascaded error, a wrapper the ledger has
   * no entry for (the model-invoked `.theta`-callable surface, or a wrapper
   * that crossed the RFC-0006 subagent envelope), or an absent ledger (no
   * `fileSystem` seam) all yield an empty chain, so the renderer's leaf row is
   * unaffected either way. Delivered through `sendSystemNote` over the
   * extension-instance `theta-system-note` channel — the same best-effort
```

**Searches (run in this session).**

S1 — wrapper constructors: `grep -rn "kind: \"invoke_callee\"" src --include=*.ts` — 3 hits:
```
src/runtime/effectful-statement-host.ts:585:  // `InvokeCalleeError { kind: "invoke_callee", callee_path, inner, message }`
src/runtime/subagent-fn-call.ts:21:    kind: "invoke_callee",
src/runtime/tool-call.ts:457:    kind: "invoke_callee",
```
(`:585` is a comment; the two constructors are `tool-call.ts:457` = `surfaceThetaCallableCalleeFailure`, reached only via `wrapInvokeCalleeFailure`, and `subagent-fn-call.ts:21` = `subagentCalleeError`.)

S2 — hop recording sites: `grep -rn "recordInvokeHop" src --include=*.ts` — 8 hits:
```
src/extension/production-theta-producer.ts:252:   * `#recordInvokeHop` then records nothing and `emitTopLevelErrNote` reads an
src/extension/production-theta-producer.ts:315:   * Bug 0088: the `EffectfulStatementHostDeps.recordInvokeHop` implementation
src/extension/production-theta-producer.ts:323:  async #recordInvokeHop(
src/extension/production-theta-producer.ts:375:   * ran (`#recordInvokeHop`); a non-cascaded error, a wrapper the ledger has
src/extension/production-theta-producer.ts:754:      recordInvokeHop: (wrapper, calleePath, callSite) =>
src/extension/production-theta-producer.ts:755:        this.#recordInvokeHop(theta, wrapper, calleePath, callSite),
src/runtime/effectful-statement-host.ts:182:  recordInvokeHop?(
src/runtime/effectful-statement-host.ts:626:  await deps.recordInvokeHop?.(wrapped as InvokeCalleeError, child.calleePath, callSite);
```
The single production call is `effectful-statement-host.ts:626` (Way A). No hit in `subagent-fn-call.ts`.

S3 — Way B sites: `grep -rn "subagentCalleeError" src --include=*.ts` — 4 hits:
```
src/runtime/invoke-provenance-ledger.ts:30:// (`subagentCalleeError` in `statement-executor.ts`). Every executed hop of
src/runtime/subagent-fn-call.ts:19:function subagentCalleeError(inner: ThetaValue, fnName: string): InvokeCalleeError {
src/runtime/subagent-fn-call.ts:220:        value: makeErr(subagentCalleeError(raw, fn.name) as unknown as ThetaValue),
src/runtime/subagent-fn-call.ts:289:    value: makeErr(subagentCalleeError(result.error, fnName) as unknown as ThetaValue),
```

S4 — `InvokeCallSite` producers: `grep -rn "style: \"literal_invoke\"\|style: \"theta_callable_bare\"" src --include=*.ts` — 4 hits:
```
src/runtime/effectful-statement-host.ts:482:        style: "theta_callable_bare",
src/runtime/effectful-statement-host.ts:564:        style: "literal_invoke",
src/runtime/invoke-provenance.ts:41:      readonly style: "literal_invoke";
src/runtime/invoke-provenance.ts:55:      readonly style: "theta_callable_bare";
```
(two producers, both in Way A; two declarations.)

S5 — chain consumer: `grep -rn "chainFor(" src --include=*.ts` — 3 hits:
```
src/extension/production-theta-producer.ts:388:      chain: this.#ledger?.chainFor(error) ?? [],
src/runtime/invoke-provenance-ledger.ts:85:  chainFor(error: QueryError): readonly ChainHop[];
src/runtime/invoke-provenance-ledger.ts:125:    chainFor(error) {
```
One production consumer (`emitTopLevelErrNote`), which walks every wrapper in the cascade regardless of which way minted it.

**Counts both ways.** Wrapper constructors: 2 (`surfaceThetaCallableCalleeFailure`, `subagentCalleeError`), reached from 4 production wrap sites (Way A ×2 via `wrapInvokeCalleeFailure`, Way B ×2). Hop recorders: 1 (`effectful-statement-host.ts:626`), covering Way A only. Chain consumers: 1 (`chainFor` via `emitTopLevelErrNote`), covering all wrappers.

**Self-inconsistency statement.** No written rule exists; the anchor is self-inconsistency plus the cost cited above. Both ways mint the same `kind: "invoke_callee"` shape (the Way B comment at `subagent-fn-call.ts:214-216` says "exactly like an invoked subagent callee (invocation.md §Failures)") that one consumer walks uniformly, but only one way feeds the ledger that consumer reads, and the ledger's own header — the place a maintainer reads to learn which wrappers carry a hop — was rewritten by a fix to assert the opposite.

## Why this is a problem

The two ways are mechanism-shaped, not copy-shaped: Way A is a shared helper that couples wrapper construction to hop recording through a typed `InvokeCallSite` descriptor; Way B is an inline constructor with no recording step and no descriptor arm to record through. A maintainer who reasons from the shared shape (`kind: "invoke_callee"`, walked uniformly by `chainFor`) or from the ledger header concludes every wrapper carries a hop. That misread has already happened in committed code and its bug record: the bug 0349 fix (`2c1217c4`) rewrote the ledger header to name `subagentCalleeError` as the third hop-producing site and to state "every executed hop of these three shapes contributes to the SLSH-5 chain", while the function it names has never called a hop recorder (S2, S3). The producer's `emitTopLevelErrNote` doc enumerates the ledger's no-entry cases (`production-theta-producer.ts:375-378`) and omits the `subagent fn` wrapper, so the omission is invisible at both the ledger and its consumer; `chainFor` drops the hop without trace (`:130-132`). The header also still locates `subagentCalleeError` in `statement-executor.ts` (it lives in `subagent-fn-call.ts` since `d1461328`), which is a D10 decayed pointer noted here only as a symptom of the same divergence.

## Suggested direction (non-binding, optional)

Unification hypothesis (unproven): one wrap-and-record step for every `invoke_callee` mint, which would require the `InvokeCallSite` union to gain an arm a `subagent fn` call site can populate (the bare-identifier token, as `theta_callable_bare` already does) and `subagent-fn-call.ts`'s two mapping regimes to route through it — or, if the `subagent fn` leg is ruled out of SLSH-5 by adjudication (as bug 0088 §Residuals-1 once did for the code-call leg), the ledger header and the `emitTopLevelErrNote` no-entry enumeration state that exclusion instead of the current claim. Which of the two is right is a design decision for the fix stage.

## False-positive check

- **Injected clone map:** no group covers this — the injected map lists `(no clone groups)` for every in-scope file, and the two ways are not token-similar (a shared helper call vs an inline object literal).
- **D9-affinity check:** not a wrong-home claim — nothing here argues `subagentCalleeError` or the ledger belongs in another file; the claim is that two co-equal minting sites diverge on whether they feed the ledger.
- **D2-deadness check:** both sides live — Way A runs on every `invoke`/`.theta`-callable cascade (`effectful-statement-host.ts:626`, reached from `:481` and `:564`); Way B runs on every `subagent fn` callee `Err` in both regimes (`subagent-fn-call.ts:220`, `:289`); `chainFor` is consumed at `production-theta-producer.ts:388`.
- **Export-style exemption:** not applicable (divergent-solutions, not wide-surface).
- **Prior filings / PTQs:** `grep -rln "subagentCalleeError\|recordInvokeHop" quality/issues quality/resolved quality/intake` — hits PTQ-1608 (D9 breakdown of the producer, cites `#recordInvokeHop` only as a member), PTQ-0301 (D7, b0295 seam scaffold), PTQ-1122 (D4 callee-wrap clone, fixed — produced `wrapInvokeCalleeFailure`, i.e. Way A's helper; it did not touch `subagentCalleeError`), PTQ-1152/1154/1188 (D9), PTQ-1424 (D4 parallel in-process/child outcome mappings in `subagent-fn-call.ts` — about the two Way B regimes mirroring each other, not about hop recording). None covers the Way A / Way B divergence.
- **Bug-record check:** `docs/bugs/0088-slsh5-chain-suffix-never-emitted.md:334-341` (§Residuals-1) deliberately excluded the *code-call* leg and named `subagentCalleeError` only as a wrapper constructor; `docs/bugs/0349-…:321-327` then superseded that exclusion for the code-call leg and, in the same edit, described `subagentCalleeError` as a hop-producing site — the misread cited above. No bug record adjudicates the `subagent fn` leg either way.
- **Test check:** `grep -rln "subagent fn" tests | xargs grep -ln "chainFor\|invoked at\|ChainHop\|recordInvokeHop"` — 1 hit, `tests/b0295-child-internal-cancel-wrap-arm.test.ts`, whose `invoked at` assertions (`:361`, `:392`) are on a `.theta` worker cascade and whose subagent-fn cell (`:463-508`) asserts a cancel outcome, not a chain; no test pins a `subagent fn` cascade's chain either present or absent.
- **Self-inconsistency:** no written rule exists; the anchor is self-inconsistency plus the cost cited above.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. All five searches S1–S5 re-run verbatim and match line for line (3/8/4/4/3 hits). Way A is real: wrapInvokeCalleeFailure at effectful-statement-host.ts:620-627 builds the wrapper and then calls deps.recordInvokeHop at :626, and it is reached from :481 (theta_callable_bare) and :564 (literal_invoke). Way B is real: subagentCalleeError at subagent-fn-call.ts:19-26 is called from :220 and :289, and neither records a hop. InvokeCallSite (invoke-provenance.ts:38-60) has only those two arms, and chainFor (ledger :125-136) skips wrappers the ledger has no entry for. The cost is concrete: `git show 2c1217c4` rewrote the ledger header (:24-32) to name subagentCalleeError as a site and to say every hop of the three shapes contributes to the SLSH-5 chain, and bug 0349:321-327 calls it hop-producing, but that function has never recorded a hop. The producer doc (:372-380) lists the no-entry cases and leaves this one out. clone-scan on the ledger shows no clone groups, and none of the effectful-statement-host groups involve subagent-fn-call, so this is not D4's. No duplicate: PTQ-1122, PTQ-1424 and PTQ-0940 are about other root causes, and PTQ-0197 is about a different count in the same header. SLSH-5 says 'for each invoke_callee hop' but only defines call-site tokens for the two .theta surfaces, so whether a subagent fn should get a hop or be excluded is unsettled in the spec (triage: claude-opus-5-5)
